// Server game catur: menyajikan file game + lobi & sinkronisasi langkah antar pemain.
// Jalankan:  node server.js   lalu buka http://<ip-komputer>:3000 dari perangkat di jaringan yang sama.
// Turnamen disimpan di data/turnamen.json (atau di STATE_DIRECTORY / DATA_DIR jika diisi).
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
const PUBLIC_FILE = /^\/(?:index\.html|about\.html|CREDITS\.txt|LICENSE|(?:css|js|engine|pieces|licenses|img)\/[\w.-]+(?:\/[\w.-]+)?|media\/[\w.-]+\.(?:mp4|webm))$/;

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
  + "img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// Aturan catur yang sama dengan di browser, untuk memvalidasi setiap langkah
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8'));
const C = CaturCore(); // eslint-disable-line no-undef

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const DISCONNECT_LOSS_MS = 60000;   // pemain terputus selama ini saat bermain = kalah
const WAITING_GRACE_MS = 20000;     // lobi dihapus jika pembuatnya terputus selama ini
const OVER_ROOM_TTL_MS = 10 * 60000;

// Turnamen sistem gugur
const MAX_TOURS = 50;
const TOUR_MAX_PLAYERS = 32;
const TOUR_NEXT_DELAY_MS = 10000;      // jeda sebelum pertandingan turnamen berikutnya dimulai
const TOUR_FIRST_MOVE_MS = 60000;      // putih yang tidak melangkah selama ini = kalah
const TOUR_MAX_DRAWS = 3;              // setelah seri sebanyak ini, pemenang diundi
const TOUR_DONE_TTL_MS = 2 * 3600000;  // turnamen yang selesai ditampilkan selama 2 jam
// Turnamen disimpan ke file supaya tetap ada setelah server di-restart.
// systemd (StateDirectory=pakcatur) mengisi STATE_DIRECTORY=/var/lib/pakcatur.
const DATA_DIR = process.env.STATE_DIRECTORY || process.env.DATA_DIR || path.join(ROOT, 'data');
const TOUR_FILE = path.join(DATA_DIR, 'turnamen.json');

const clients = new Map(); // token -> { name, streams: Set<res>, lastSeen }
const rooms = new Map();   // id -> room
const tours = new Map();   // id -> turnamen

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

function parseTime(time) {
  const tc = String(time || '0');
  if (tc === '0') return null;
  const [base, inc] = tc.split('+').map(Number);
  if (!(base > 0 && base <= 3600) || !(inc >= 0 && inc <= 60)) throw new Error('Waktu tidak valid');
  return { base: base * 1000, inc: (inc || 0) * 1000 };
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
    tour: room.tour ? { id: room.tour.id, label: room.name, round: tours.has(room.tour.id) ? roundLabel(tours.get(room.tour.id), room.tour.r) : '' } : null,
  };
}

function pushRoom(room) {
  for (const t of [room.host, room.guest]) if (t) toToken(t, 'room', roomView(room, t));
  if (room.tour) saveSoon();
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
  room.startedAt = now();
  room.left = {};
  room.game = {
    pos: new C.Position(), moves: [], result: null, reason: null, drawOffer: null, rematch: { w: false, b: false }, lastMoveAt: now(),
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
  if (room.tour) tourGameOver(room);
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

// ---------- Turnamen (sistem gugur) ----------
// Setiap pertandingan dimainkan di ruang biasa yang ditandai room.tour, jadi jam, chat, seri & menyerah
// memakai aturan yang sama. Seri = main ulang dengan warna ditukar; setelah TOUR_MAX_DRAWS kali seri, diundi.
const tourName = (t, token) => t.names[token] || '?';
const isActiveTour = t => t.status === 'open' || t.status === 'running';

function roundLabel(t, r) {
  const left = t.rounds.length - r;
  return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Perempat final' : `Babak ${r + 1}`;
}

function eliminated(t, token) {
  return !!t.quit[token] || t.rounds.some(r => r.some(m => m.winner && m.winner !== token && (m.a === token || m.b === token)));
}

// Turnamen yang masih diikuti pemain ini (belum tersingkir)
function activeTourOf(token) {
  for (const t of tours.values()) if (isActiveTour(t) && t.players.includes(token) && !eliminated(t, token)) return t;
  return null;
}

function tourView(t, token) {
  const pv = tok => tok ? { name: tourName(t, tok), me: tok === token } : null;
  return {
    id: t.id, name: t.name, host: tourName(t, t.host), mine: t.host === token, status: t.status,
    time: timeLabel(t.time), created: t.created, max: TOUR_MAX_PLAYERS,
    joined: t.players.includes(token), out: t.players.includes(token) && eliminated(t, token),
    players: t.players.map(pv),
    rounds: t.rounds.map((r, ri) => ({
      label: roundLabel(t, ri),
      matches: r.map(m => {
        const room = m.roomId && rooms.get(m.roomId);
        return {
          a: pv(m.a), b: pv(m.b), bye: !!m.bye, winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : null,
          draws: m.games.filter(g => g.result === '1/2-1/2').length, coin: !!m.coin, forfeit: !!m.forfeit,
          live: !!(room && room.status === 'playing'), startIn: m.startAt ? Math.max(0, m.startAt - now()) : null,
        };
      }),
    })),
    champion: t.champion ? pv(t.champion) : null,
  };
}

function broadcastTours() {
  const list = [...tours.values()].sort((x, y) => (isActiveTour(y) - isActiveTour(x)) || y.created - x.created);
  for (const [token, c] of clients) {
    if (!c.streams.size) continue;
    const data = { tours: list.map(t => tourView(t, token)) };
    for (const res of c.streams) sse(res, 'tours', data);
  }
  saveSoon();
}
function pushToursTo(res, token) {
  const list = [...tours.values()].sort((x, y) => (isActiveTour(y) - isActiveTour(x)) || y.created - x.created);
  sse(res, 'tours', { tours: list.map(t => tourView(t, token)) });
}

function makeBracket(t) {
  const p = [...t.players];
  for (let i = p.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  let size = 2;
  while (size < p.length) size *= 2;
  const byes = size - p.length;
  const first = [];
  let k = 0;
  for (let i = 0; i < size / 2; i++) {
    const a = p[k++], b = i < byes ? null : p[k++];
    first.push(newMatch(a, b, i < byes));
  }
  t.rounds = [first];
  for (let n = size / 4; n >= 1; n /= 2) t.rounds.push(Array.from({ length: n }, () => newMatch(null, null, false)));
}
function newMatch(a, b, bye) {
  return { a: a || null, b: b || null, bye, winner: bye ? a : null, games: [], roomId: null, startAt: null };
}

// Teruskan pemenang ke babak berikutnya & jadwalkan pertandingan yang pemainnya sudah lengkap
function advance(t) {
  for (let r = 0; r < t.rounds.length; r++) {
    t.rounds[r].forEach((m, i) => {
      if (r > 0) {
        const fa = t.rounds[r - 1][2 * i], fb = t.rounds[r - 1][2 * i + 1];
        if (!m.a && fa.winner) m.a = fa.winner;
        if (!m.b && fb.winner) m.b = fb.winner;
      }
      if (m.winner || !m.a || !m.b) return;
      if (t.quit[m.a] || t.quit[m.b]) { m.winner = t.quit[m.a] ? m.b : m.a; m.forfeit = true; m.startAt = null; return; }
      if (!m.roomId && !m.startAt) m.startAt = now() + (r === 0 ? 3000 : TOUR_NEXT_DELAY_MS);
    });
  }
  const final = t.rounds[t.rounds.length - 1][0];
  if (t.status === 'running' && final.winner) {
    t.status = 'done'; t.champion = final.winner; t.doneAt = now();
  }
}

// Keluarkan pemain dari ruang lain sebelum pertandingan turnamennya dimulai
function detach(token) {
  for (let room = roomOf(token); room; room = roomOf(token)) {
    if (room.status !== 'over') { leaveRoom(token); continue; }
    if (room.host === token) room.host = null;
    if (room.guest === token) room.guest = null;
    const color = colorOf(room, token);
    if (color) { room.left = room.left || {}; room.left[color] = true; }
    if (!room.host && !room.guest) rooms.delete(room.id); else pushRoom(room);
  }
}

function startMatch(t, r, i) {
  const m = t.rounds[r][i];
  for (const tok of [m.a, m.b]) { client(tok, tourName(t, tok)); detach(tok); }
  const prev = m.games[m.games.length - 1];
  const id = crypto.randomBytes(3).toString('hex');
  const room = {
    id, name: `${t.name} · ${roundLabel(t, r)}`, host: m.a, guest: m.b,
    hostColor: prev ? (prev.w === m.a ? 'b' : 'w') : 'r', time: t.time,
    status: 'waiting', gameNo: 0, chat: [], created: now(), tour: { id: t.id, r, i },
  };
  rooms.set(id, room);
  m.roomId = id; m.startAt = null;
  startGame(room);
  if (prev) systemChat(room, `Main ulang ke-${m.games.length} setelah seri, warna ditukar.`);
  pushRoom(room);
}

function tourGameOver(room) {
  const t = tours.get(room.tour.id);
  const m = t && t.rounds[room.tour.r]?.[room.tour.i];
  if (!m || m.roomId !== room.id) return;
  const g = room.game;
  m.games.push({ w: room.white, b: room.black, result: g.result });
  m.roomId = null;
  if (g.result === '1/2-1/2') {
    if (m.games.length >= TOUR_MAX_DRAWS) {
      m.winner = crypto.randomInt(2) ? m.a : m.b; m.coin = true;
      systemChat(room, `Sudah ${m.games.length}× seri. Hasil undian: ${tourName(t, m.winner)} lolos.`);
    } else {
      m.startAt = now() + TOUR_NEXT_DELAY_MS;
      systemChat(room, `Seri. Pertandingan diulang dengan warna ditukar dalam ${TOUR_NEXT_DELAY_MS / 1000} detik.`);
    }
  } else {
    m.winner = g.result === '1-0' ? room.white : room.black;
    const final = room.tour.r === t.rounds.length - 1;
    systemChat(room, final ? `🏆 ${tourName(t, m.winner)} juara turnamen ${t.name}!` : `${tourName(t, m.winner)} lolos ke ${roundLabel(t, room.tour.r + 1)}.`);
  }
  advance(t);
  setImmediate(broadcastTours); // setelah pemanggil finish() selesai mengirim hasil permainan
}

function tourTick() {
  const t0 = now();
  let changed = false;
  for (const t of tours.values()) {
    if (t.status === 'running') {
      t.rounds.forEach((r, ri) => r.forEach((m, i) => {
        if (m.startAt && !m.roomId && !m.winner && t0 >= m.startAt) { startMatch(t, ri, i); changed = true; }
      }));
    } else if (t.status === 'done' && t0 - t.doneAt > TOUR_DONE_TTL_MS) {
      tours.delete(t.id); changed = true;
    }
  }
  if (changed) broadcastTours();
}

// ---------- Simpan & muat turnamen ----------
let saveTimer = null;
function saveSoon() {
  if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; saveTours(false); }, 1000);
}
function snapshot() {
  const tourRooms = [...rooms.values()].filter(r => r.tour && r.status === 'playing').map(r => {
    const g = r.game, c = clockView(g);
    return {
      id: r.id, name: r.name, host: r.host, guest: r.guest, white: r.white, black: r.black, hostColor: r.hostColor,
      time: r.time, gameNo: r.gameNo, chat: r.chat, created: r.created, tour: r.tour,
      game: { moves: g.moves, drawOffer: g.drawOffer, clock: c && { w: c.w, b: c.b, inc: c.inc, running: c.running } },
    };
  });
  return JSON.stringify({ v: 1, savedAt: now(), tours: [...tours.values()], rooms: tourRooms });
}
function saveTours(sync) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = TOUR_FILE + '.tmp';
    fs.writeFileSync(tmp, snapshot(), { mode: 0o600 });
    fs.renameSync(tmp, TOUR_FILE);
  } catch (e) {
    if (!sync) console.error('Gagal menyimpan turnamen:', e.message);
  }
}
function loadTours() {
  let data;
  try { data = JSON.parse(fs.readFileSync(TOUR_FILE, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') console.error('Gagal membaca turnamen:', e.message);
    return;
  }
  for (const t of data.tours || []) {
    tours.set(t.id, t);
    for (const tok of t.players) client(tok, t.names[tok]);
  }
  for (const s of data.rooms || []) {
    const pos = new C.Position();
    for (const u of s.game.moves) { const m = pos.moveFromUci(u); if (m) pos.make(m); }
    const c = s.game.clock;
    rooms.set(s.id, {
      ...s, status: 'playing', startedAt: now(), left: {},
      game: {
        pos, moves: s.game.moves, result: null, reason: null, drawOffer: s.game.drawOffer, rematch: { w: false, b: false }, lastMoveAt: now(),
        // Waktu selama server mati tidak dihitung
        clock: c ? { w: c.w, b: c.b, inc: c.inc, running: c.running, last: now() } : null,
      },
    });
  }
  // Pertandingan yang ruangnya tidak tersimpan: jadwalkan ulang
  for (const t of tours.values()) {
    if (t.status !== 'running') continue;
    for (const r of t.rounds) for (const m of r) {
      if (m.roomId && !rooms.has(m.roomId)) { m.roomId = null; if (!m.winner) m.startAt = now() + TOUR_NEXT_DELAY_MS; }
    }
    advance(t);
  }
  if (tours.size) console.log(`${tours.size} turnamen dimuat dari ${TOUR_FILE}`);
}

// ---------- API ----------
const handlers = {
  hello({ token, name }) {
    const c = client(token, name);
    let renamed = false;
    for (const t of tours.values()) {
      if (isActiveTour(t) && t.players.includes(token) && t.names[token] !== c.name) { t.names[token] = c.name; renamed = true; }
    }
    if (renamed) broadcastTours();
    const room = roomOf(token);
    if (room) pushRoom(room);
    return { ok: true };
  },

  create({ token, name, color, time, roomName }) {
    const c = client(token, name);
    if (activeTourOf(token)) throw new Error('Kamu sedang ikut turnamen');
    leaveRoom(token);
    if (rooms.size >= MAX_ROOMS) throw new Error('Server sedang penuh, coba lagi nanti');
    const t = parseTime(time);
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
    if (activeTourOf(token)) throw new Error('Kamu sedang ikut turnamen');
    leaveRoom(token);
    room.guest = token;
    startGame(room);
    pushRoom(room);
    broadcastLobby();
    return { ok: true };
  },

  leave({ token, roomId }) {
    // roomId: hanya keluar jika masih di ruang yang dimaksud (bukan pertandingan turnamen yang baru dimulai)
    if (roomId && roomOf(token)?.id !== roomId) return { ok: true };
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
    g.lastMoveAt = now();
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
    if (room.tour) throw new Error('Di turnamen tidak ada main lagi');
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

  tourCreate({ token, name, tourName: tn, time }) {
    const c = client(token, name);
    if (activeTourOf(token)) throw new Error('Kamu sudah ikut turnamen lain');
    if (tours.size >= MAX_TOURS) throw new Error('Terlalu banyak turnamen, coba lagi nanti');
    const tm = parseTime(time);
    if (!tm) throw new Error('Turnamen harus memakai batas waktu');
    const id = crypto.randomBytes(4).toString('hex');
    tours.set(id, {
      id, name: cleanName(tn, `Turnamen ${c.name}`), host: token, time: tm, status: 'open', created: now(),
      players: [token], names: { [token]: c.name }, quit: {}, rounds: [], champion: null, doneAt: null,
    });
    broadcastTours();
    return { ok: true, id };
  },

  tourJoin({ token, name, tourId }) {
    const c = client(token, name);
    const t = tours.get(String(tourId));
    if (!t || t.status !== 'open') throw new Error('Pendaftaran turnamen sudah ditutup');
    if (t.players.includes(token)) return { ok: true };
    if (activeTourOf(token)) throw new Error('Kamu sudah ikut turnamen lain');
    if (t.players.length >= TOUR_MAX_PLAYERS) throw new Error('Turnamen sudah penuh');
    t.players.push(token);
    t.names[token] = c.name;
    broadcastTours();
    return { ok: true };
  },

  tourLeave({ token, tourId }) {
    const t = tours.get(String(tourId));
    if (!t || !t.players.includes(token)) throw new Error('Kamu tidak ikut turnamen ini');
    if (t.status === 'open') {
      t.players = t.players.filter(x => x !== token);
      delete t.names[token];
      if (!t.players.length) tours.delete(t.id);
      else if (t.host === token) t.host = t.players[0];
    } else if (t.status === 'running' && !eliminated(t, token)) {
      t.quit[token] = true;
      const room = roomOf(token);
      if (room && room.tour?.id === t.id && room.status === 'playing') leaveRoom(token); // dianggap kalah
      advance(t);
    }
    broadcastTours();
    return { ok: true };
  },

  tourStart({ token, tourId }) {
    const t = tours.get(String(tourId));
    if (!t || t.status !== 'open') throw new Error('Turnamen tidak bisa dimulai');
    if (t.host !== token) throw new Error('Hanya penyelenggara yang bisa memulai');
    if (t.players.length < 2) throw new Error('Butuh minimal 2 pemain');
    makeBracket(t);
    t.status = 'running';
    t.startedAt = now();
    advance(t);
    broadcastTours();
    return { ok: true };
  },

  tourCancel({ token, tourId }) {
    const t = tours.get(String(tourId));
    if (!t || t.status !== 'open') throw new Error('Turnamen yang sudah berjalan tidak bisa dibatalkan');
    if (t.host !== token) throw new Error('Hanya penyelenggara yang bisa membatalkan');
    tours.delete(t.id);
    broadcastTours();
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
      if (room.tour && !g.moves.length && t - g.lastMoveAt > TOUR_FIRST_MOVE_MS) {
        finish(room, '0-1', 'tidakjalan');
        systemChat(room, `${clients.get(room.white)?.name} tidak melangkah dalam ${TOUR_FIRST_MOVE_MS / 1000} detik.`);
        pushRoom(room); lobbyChanged = true;
        continue;
      }
      for (const [tok, side] of [[room.white, 'w'], [room.black, 'b']]) {
        const c = clients.get(tok);
        if (!isConnected(tok) && c && t - Math.max(c.lastSeen, room.startedAt || 0) > DISCONNECT_LOSS_MS) {
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
  tourTick();
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
    pushToursTo(res, token);
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
    // Video: boleh di-cache dan diunduh sebagian (Range), wajib untuk Safari/iPhone
    if (ext === '.mp4' || ext === '.webm') {
      headers['Cache-Control'] = 'public, max-age=86400';
      headers['Accept-Ranges'] = 'bytes';
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
        const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) {
          res.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${st.size}` }); return res.end();
        }
        res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

loadTours();
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
    saveTours(true);
    server.close();
    process.exit(0);
  });
}
