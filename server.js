// Server game catur: menyajikan file game + lobi & sinkronisasi langkah antar pemain.
// Jalankan:  node server.js   lalu buka http://<ip-komputer>:3000 dari perangkat di jaringan yang sama.
// Tidak butuh paket tambahan: komunikasi memakai Server-Sent Events (server -> pemain) dan POST (pemain -> server).
//
// Variabel lingkungan (opsional):
//   PORT=3000          port HTTP
//   HOST=0.0.0.0       alamat yang didengarkan; pakai 127.0.0.1 jika diakses lewat Cloudflare Tunnel / reverse proxy
//   TRUST_PROXY=1      percayai header CF-Connecting-IP / X-Forwarded-For untuk IP asli pemain
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ROOT = __dirname;

// Hanya file game ini yang boleh diunduh (bukan .git, server.js, skrip deploy, dll.)
const PUBLIC_FILE = /^\/(?:index\.html|CREDITS\.txt|LICENSE|(?:css|js|engine|pieces|licenses)\/[\w.-]+(?:\/[\w.-]+)?)$/;

// Batas sederhana supaya server tidak mudah dibanjiri saat dibuka ke internet
const MAX_ROOMS = 300;
const MAX_STREAMS_TOTAL = 2000;
const MAX_STREAMS_PER_IP = 20;
const MAX_POSTS_PER_MIN = 300;
const CLIENT_TTL_MS = 60 * 60000;   // data pemain yang tidak aktif dihapus setelah 1 jam

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
const CSP = "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// Aturan catur yang sama dengan di browser, untuk memvalidasi setiap langkah
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8'));
const C = CaturCore(); // eslint-disable-line no-undef

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

const DISCONNECT_LOSS_MS = 60000;   // pemain terputus selama ini saat bermain = kalah
const WAITING_GRACE_MS = 20000;     // lobi dihapus jika pembuatnya terputus selama ini
const OVER_ROOM_TTL_MS = 10 * 60000;

const clients = new Map(); // token -> { name, streams: Set<res>, lastSeen }
const rooms = new Map();   // id -> room

// ---------- Utilitas ----------
const now = () => Date.now();
const cleanName = (s, fallback) => (String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20)) || fallback;
const isConnected = token => { const c = clients.get(token); return !!(c && c.streams.size); };

function client(token, name) {
  let c = clients.get(token);
  if (!c) { c = { name: cleanName(name, 'Pemain'), streams: new Set(), lastSeen: now() }; clients.set(token, c); }
  else if (name) c.name = cleanName(name, c.name);
  return c;
}

function sse(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* koneksi sudah tutup */ }
}
function toToken(token, event, data) {
  const c = clients.get(token);
  if (c) for (const res of c.streams) sse(res, event, data);
}

function roomOf(token) {
  for (const r of rooms.values()) if (r.host === token || r.guest === token) return r;
  return null;
}

function timeLabel(t) {
  if (!t) return 'Tanpa batas waktu';
  const m = t.base / 60000;
  return t.inc ? `${m} menit | +${t.inc / 1000} detik` : `${m} menit`;
}

// ---------- Lobi ----------
function lobbyList() {
  return [...rooms.values()].filter(r => r.status === 'waiting').map(r => ({
    id: r.id, name: r.name, host: clients.get(r.host)?.name || '?', hostColor: r.hostColor, time: timeLabel(r.time), created: r.created,
  }));
}
function broadcastLobby() {
  const list = lobbyList();
  const playing = [...rooms.values()].filter(r => r.status === 'playing').length;
  for (const c of clients.values()) for (const res of c.streams) sse(res, 'lobby', { rooms: list, playing });
}

// ---------- Ruang permainan ----------
function colorOf(room, token) {
  if (room.white === token) return 'w';
  if (room.black === token) return 'b';
  return null;
}

function clockView(g) {
  if (!g.clock) return null;
  const c = g.clock, turn = g.pos.turn === C.W ? 'w' : 'b';
  const w = c.w - (c.running && turn === 'w' ? now() - c.last : 0);
  const b = c.b - (c.running && turn === 'b' ? now() - c.last : 0);
  return { w: Math.max(0, w), b: Math.max(0, b), running: c.running && !g.result, inc: c.inc };
}

function roomView(room, token) {
  if (room.status === 'waiting') {
    return { id: room.id, name: room.name, status: 'waiting', hostColor: room.hostColor, time: timeLabel(room.time), mine: room.host === token };
  }
  const g = room.game;
  const you = colorOf(room, token);
  const opp = you === 'w' ? 'b' : 'w';
  return {
    id: room.id, name: room.name, status: room.status, gameNo: room.gameNo, you,
    white: { name: clients.get(room.white)?.name || '?', connected: isConnected(room.white), present: room.white === room.host || room.white === room.guest },
    black: { name: clients.get(room.black)?.name || '?', connected: isConnected(room.black), present: room.black === room.host || room.black === room.guest },
    moves: g.moves, clock: clockView(g), time: timeLabel(room.time),
    result: g.result, reason: g.reason,
    drawOffer: g.drawOffer, rematch: g.rematch, oppLeft: !!room.left?.[opp],
    chat: room.chat.slice(-30),
  };
}

function pushRoom(room) {
  for (const t of [room.host, room.guest]) if (t) toToken(t, 'room', roomView(room, t));
}

function startGame(room) {
  let white, black;
  if (room.gameNo === 0) {
    const hostWhite = room.hostColor === 'w' || (room.hostColor === 'r' && Math.random() < 0.5);
    white = hostWhite ? room.host : room.guest;
    black = hostWhite ? room.guest : room.host;
  } else {
    // Main lagi: warna ditukar
    white = room.black; black = room.white;
  }
  room.white = white; room.black = black;
  room.gameNo++;
  room.status = 'playing';
  room.left = {};
  room.game = {
    pos: new C.Position(), moves: [], result: null, reason: null, drawOffer: null, rematch: { w: false, b: false },
    clock: room.time ? { w: room.time.base, b: room.time.base, inc: room.time.inc, running: false, last: 0 } : null,
  };
  systemChat(room, `Permainan #${room.gameNo} dimulai. Putih: ${clients.get(white)?.name}, Hitam: ${clients.get(black)?.name}.`);
}

function finish(room, result, reason) {
  const g = room.game;
  if (g.result) return;
  if (g.clock && g.clock.running) {
    const side = g.pos.turn === C.W ? 'w' : 'b';
    g.clock[side] = Math.max(0, g.clock[side] - (now() - g.clock.last));
    g.clock.running = false;
  }
  g.result = result; g.reason = reason; g.drawOffer = null;
  room.status = 'over';
  room.overAt = now();
}

function systemChat(room, text) {
  room.chat.push({ from: 'sys', text, t: now() });
  if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
}

function leaveRoom(token) {
  const room = roomOf(token);
  if (!room) return;
  const name = clients.get(token)?.name || 'Pemain';
  if (room.status === 'waiting') {
    rooms.delete(room.id);
    toToken(token, 'noroom', {});
    broadcastLobby();
    return;
  }
  const color = colorOf(room, token);
  if (room.status === 'playing') finish(room, color === 'w' ? '0-1' : '1-0', 'keluar');
  room.left = room.left || {};
  room.left[color] = true;
  systemChat(room, `${name} keluar dari ruangan.`);
  if (room.host === token) room.host = null;
  if (room.guest === token) room.guest = null;
  if (!room.host && !room.guest) rooms.delete(room.id);
  else pushRoom(room);
  toToken(token, 'noroom', {});
  broadcastLobby();
}

function onlyKing(pos, side) {
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = pos.board[sq];
    if (p * side > 0 && Math.abs(p) !== C.KING) return false;
  }
  return true;
}

// ---------- API ----------
const handlers = {
  hello({ token, name }) {
    client(token, name);
    const room = roomOf(token);
    if (room) pushRoom(room);
    return { ok: true };
  },

  create({ token, name, color, time, roomName }) {
    const c = client(token, name);
    leaveRoom(token);
    if (rooms.size >= MAX_ROOMS) throw new Error('Server sedang penuh, coba lagi nanti');
    const tc = String(time || '0');
    let t = null;
    if (tc !== '0') {
      const [base, inc] = tc.split('+').map(Number);
      if (!(base > 0 && base <= 3600) || !(inc >= 0 && inc <= 60)) throw new Error('Waktu tidak valid');
      t = { base: base * 1000, inc: (inc || 0) * 1000 };
    }
    const id = crypto.randomBytes(3).toString('hex');
    const room = {
      id, name: cleanName(roomName, `Lobi ${c.name}`), host: token, guest: null,
      hostColor: ['w', 'b', 'r'].includes(color) ? color : 'r', time: t,
      status: 'waiting', gameNo: 0, chat: [], created: now(),
    };
    rooms.set(id, room);
    pushRoom(room);
    broadcastLobby();
    return { ok: true, id };
  },

  join({ token, name, roomId }) {
    client(token, name);
    const room = rooms.get(roomId);
    if (!room || room.status !== 'waiting') throw new Error('Lobi sudah tidak tersedia');
    if (room.host === token) throw new Error('Ini lobi milikmu sendiri');
    leaveRoom(token);
    room.guest = token;
    startGame(room);
    pushRoom(room);
    broadcastLobby();
    return { ok: true };
  },

  leave({ token }) {
    leaveRoom(token);
    return { ok: true };
  },

  move({ token, uci, gameNo }) {
    const room = roomOf(token);
    if (!room || room.status !== 'playing') throw new Error('Tidak sedang bermain');
    const g = room.game;
    const color = colorOf(room, token);
    if (gameNo !== room.gameNo || (g.pos.turn === C.W ? 'w' : 'b') !== color) { pushRoom(room); throw new Error('Bukan giliranmu'); }
    const m = g.pos.moveFromUci(String(uci || ''));
    if (!m) { pushRoom(room); throw new Error('Langkah tidak sah'); }
    if (g.clock) {
      const t = now();
      if (g.clock.running) g.clock[color] -= t - g.clock.last;
      if (g.clock[color] <= 0) { finish(room, color === 'w' ? '0-1' : '1-0', 'waktu'); pushRoom(room); broadcastLobby(); throw new Error('Waktu habis'); }
      if (g.clock.running) g.clock[color] += g.clock.inc;
      g.clock.running = true;
      g.clock.last = t;
    }
    g.pos.make(m);
    g.moves.push(String(uci));
    if (g.drawOffer && g.drawOffer !== color) g.drawOffer = null; // melangkah = menolak tawaran seri
    const st = g.pos.status();
    if (st.over) finish(room, st.result, st.reason);
    pushRoom(room);
    if (st.over) broadcastLobby();
    return { ok: true };
  },

  resign({ token }) {
    const room = roomOf(token);
    if (!room || room.status !== 'playing') throw new Error('Tidak sedang bermain');
    finish(room, colorOf(room, token) === 'w' ? '0-1' : '1-0', 'menyerah');
    pushRoom(room);
    broadcastLobby();
    return { ok: true };
  },

  draw({ token, action }) {
    const room = roomOf(token);
    if (!room || room.status !== 'playing') throw new Error('Tidak sedang bermain');
    const g = room.game, color = colorOf(room, token), name = clients.get(token)?.name;
    if (action === 'offer') {
      if (g.drawOffer === color) return { ok: true };
      if (g.drawOffer) { finish(room, '1/2-1/2', 'sepakat'); systemChat(room, 'Kedua pemain sepakat seri.'); }
      else { g.drawOffer = color; systemChat(room, `${name} menawarkan seri.`); }
    } else if (action === 'accept' && g.drawOffer && g.drawOffer !== color) {
      finish(room, '1/2-1/2', 'sepakat');
      systemChat(room, 'Kedua pemain sepakat seri.');
    } else if (action === 'decline' && g.drawOffer && g.drawOffer !== color) {
      g.drawOffer = null;
      systemChat(room, `${name} menolak tawaran seri.`);
    }
    pushRoom(room);
    return { ok: true };
  },

  rematch({ token, action }) {
    const room = roomOf(token);
    if (!room || room.status !== 'over') throw new Error('Permainan belum selesai');
    const g = room.game, color = colorOf(room, token), opp = color === 'w' ? 'b' : 'w', name = clients.get(token)?.name;
    if (room.left?.[opp] || !room.host || !room.guest) throw new Error('Lawan sudah keluar');
    if (action === 'decline') {
      g.rematch = { w: false, b: false };
      systemChat(room, `${name} menolak main lagi.`);
    } else {
      g.rematch[color] = true;
      if (g.rematch[opp]) startGame(room);
      else systemChat(room, `${name} mengajak main lagi.`);
    }
    pushRoom(room);
    broadcastLobby();
    return { ok: true };
  },

  chat({ token, text }) {
    const room = roomOf(token);
    if (!room || room.status === 'waiting') throw new Error('Tidak ada lawan');
    const msg = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!msg) return { ok: true };
    room.chat.push({ from: colorOf(room, token), name: clients.get(token)?.name, text: msg, t: now() });
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
    pushRoom(room);
    return { ok: true };
  },
};

// ---------- Pemeriksaan berkala: waktu habis & pemain terputus ----------
setInterval(() => {
  const t = now();
  let lobbyChanged = false;
  for (const room of rooms.values()) {
    if (room.status === 'waiting') {
      const c = clients.get(room.host);
      if (!isConnected(room.host) && c && t - c.lastSeen > WAITING_GRACE_MS) { rooms.delete(room.id); lobbyChanged = true; }
      continue;
    }
    if (room.status === 'playing') {
      const g = room.game;
      if (g.clock && g.clock.running) {
        const side = g.pos.turn === C.W ? 'w' : 'b';
        if (g.clock[side] - (t - g.clock.last) <= 0) {
          const sideVal = side === 'w' ? C.W : C.B;
          const draw = onlyKing(g.pos, -sideVal);
          finish(room, draw ? '1/2-1/2' : side === 'w' ? '0-1' : '1-0', draw ? 'waktuseri' : 'waktu');
          pushRoom(room); lobbyChanged = true;
          continue;
        }
      }
      for (const [tok, side] of [[room.white, 'w'], [room.black, 'b']]) {
        const c = clients.get(tok);
        if (!isConnected(tok) && c && t - c.lastSeen > DISCONNECT_LOSS_MS) {
          finish(room, side === 'w' ? '0-1' : '1-0', 'terputus');
          systemChat(room, `${c.name} terputus terlalu lama.`);
          pushRoom(room); lobbyChanged = true;
          break;
        }
      }
    } else if (room.status === 'over' && t - room.overAt > OVER_ROOM_TTL_MS && !isConnected(room.host) && !isConnected(room.guest)) {
      rooms.delete(room.id);
    }
  }
  if (lobbyChanged) broadcastLobby();
}, 500);

setInterval(() => {
  const t = now();
  for (const [token, c] of clients) {
    if (!c.streams.size && t - c.lastSeen > CLIENT_TTL_MS && !roomOf(token)) clients.delete(token);
  }
  for (const [ip, e] of postCounts) if (t > e.reset) postCounts.delete(ip);
}, 60000);

// ---------- HTTP ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 20000) { reject(new Error('Terlalu besar')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON tidak valid')); } });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const h = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (h) return h;
  }
  return req.socket.remoteAddress || '?';
}

const postCounts = new Map();   // ip -> { count, reset }
const streamsPerIp = new Map(); // ip -> jumlah koneksi SSE
let streamsTotal = 0;
function postAllowed(ip) {
  const t = now();
  let e = postCounts.get(ip);
  if (!e || t > e.reset) { e = { count: 0, reset: t + 60000 }; postCounts.set(ip, e); }
  return ++e.count <= MAX_POSTS_PER_MIN;
}

const validToken = t => typeof t === 'string' && /^[a-f0-9]{16,64}$/.test(t);

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  const ip = clientIp(req);

  if (p === '/api/ping') return json(res, 200, { ok: true });

  if (p === '/api/events' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    if (!validToken(token)) return json(res, 400, { error: 'Token tidak valid' });
    if (streamsTotal >= MAX_STREAMS_TOTAL || (streamsPerIp.get(ip) || 0) >= MAX_STREAMS_PER_IP) {
      return json(res, 429, { error: 'Terlalu banyak koneksi' });
    }
    streamsTotal++;
    streamsPerIp.set(ip, (streamsPerIp.get(ip) || 0) + 1);
    const c = client(token, url.searchParams.get('name'));
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    c.streams.add(res);
    c.lastSeen = now();
    sse(res, 'lobby', { rooms: lobbyList(), playing: [...rooms.values()].filter(r => r.status === 'playing').length });
    const room = roomOf(token);
    if (room) pushRoom(room); else sse(res, 'noroom', {});
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* abaikan */ } }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      streamsTotal--;
      const n = (streamsPerIp.get(ip) || 1) - 1;
      if (n > 0) streamsPerIp.set(ip, n); else streamsPerIp.delete(ip);
      c.streams.delete(res);
      c.lastSeen = now();
      const r = roomOf(token);
      if (r && r.status !== 'waiting') pushRoom(r); // kabari lawan bahwa pemain ini terputus
    });
    return;
  }

  if (p.startsWith('/api/') && req.method === 'POST') {
    const name = p.slice(5);
    const fn = Object.prototype.hasOwnProperty.call(handlers, name) && handlers[name];
    if (!fn) return json(res, 404, { error: 'Tidak ditemukan' });
    if (!postAllowed(ip)) return json(res, 429, { error: 'Terlalu banyak permintaan, tunggu sebentar' });
    try {
      const body = await readBody(req);
      if (!validToken(body.token)) return json(res, 400, { error: 'Token tidak valid' });
      const c = clients.get(body.token);
      if (c) c.lastSeen = now();
      return json(res, 200, fn(body));
    } catch (e) {
      return json(res, 400, { error: e.message || 'Gagal' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  // File statis (hanya yang cocok dengan PUBLIC_FILE)
  let rel;
  try { rel = decodeURIComponent(p); } catch { res.writeHead(400, SECURITY_HEADERS); return res.end(); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!PUBLIC_FILE.test(rel) || rel.includes('..') || !file.startsWith(ROOT + path.sep)) {
    res.writeHead(404, SECURITY_HEADERS); return res.end('Tidak ditemukan');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, SECURITY_HEADERS); return res.end('Tidak ditemukan'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8', 'Content-Length': st.size, 'Cache-Control': 'no-cache' };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('Server catur berjalan. Buka salah satu alamat ini:');
  console.log(`  Komputer ini : http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Jaringan     : http://${a.address}:${PORT}`);
    }
  } else {
    console.log(`  (hanya mendengarkan di ${HOST}; akses dari luar lewat proxy / Cloudflare Tunnel)`);
  }
  console.log('Tekan Ctrl+C untuk berhenti.');
});

// Berhenti dengan rapi saat dihentikan systemd (SIGTERM) atau Ctrl+C
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} diterima, server berhenti.`);
    server.close();
    process.exit(0);
  });
}
