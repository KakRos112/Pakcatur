(() => {
  'use strict';
  const C = CaturCore();
  const AI = CaturAI(C);
  const { W, B, mFrom, mTo, mPromo, mFlags, sqName, parseSq } = C;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Penyimpanan pengaturan (opsional) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('catur.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('catur.' + k, JSON.stringify(v)); } catch { /* abaikan */ } },
  };

  // ---------- Daftar bot ----------
  // own: mesin bawaan; sf: Stockfish (Skill Level 0-20); fb: cadangan jika Stockfish tidak tersedia
  const BOTS = [
    { name: 'Gibran', rating: 250, group: 'Pemula', look: { bg: '#7fb3d5', skin: '#f2c9a0', hair: 0, hairC: '#1c1c1c', shirt: '#f4f4f4' },
      own: { depth: 1, noise: 350, randomP: 0.4 }, quote: 'Halo! Saya masih belajar catur, mohon bimbingannya ya.' },
    { name: 'Bahlil', rating: 400, group: 'Pemula', look: { bg: '#f5b7b1', skin: '#c68e5f', hair: 0, hairC: '#111', shirt: '#2e86c1' },
      own: { depth: 1, noise: 220, randomP: 0.22 }, quote: 'Santai saja, kita nikmati permainannya. Siap?' },
    { name: 'Ganjar', rating: 600, group: 'Pemula', look: { bg: '#a3e4d7', skin: '#e8b48a', hair: 0, hairC: '#e5e5e5', shirt: '#c0392b' },
      own: { depth: 2, noise: 140, randomP: 0.12 }, quote: 'Ayo main yang sportif. Sing penting guyub!' },
    { name: 'Anies', rating: 800, group: 'Pemula', look: { bg: '#f9e79f', skin: '#f0c29c', hair: 0, hairC: '#2b1b12', shirt: '#1f3a5f' },
      own: { depth: 2, noise: 80, randomP: 0.06 }, quote: 'Mari kita buat permainan ini adil untuk semua.' },
    { name: 'Pria Solo', rating: 1000, group: 'Menengah', look: { bg: '#d2b4de', skin: '#d9a273', hair: 0, hairC: '#222', shirt: '#f4f4f4' },
      own: { depth: 3, noise: 45, randomP: 0.03 }, quote: 'Kerja, kerja, kerja… eh, main, main, main! Ayo mulai.' },
    { name: 'Rocky Gerung', rating: 1200, group: 'Menengah', look: { bg: '#aed6f1', skin: '#f0c29c', hair: 3, hairC: '#5b5b5b', shirt: '#2c3e50', beard: true },
      sf: { skill: 1, depth: 3 }, fb: { depth: 3, noise: 25 }, quote: 'Mari berpikir dengan akal sehat di atas papan.' },
    { name: 'Purbayan', rating: 1400, group: 'Menengah', look: { bg: '#abebc6', skin: '#e0b088', hair: 0, hairC: '#111', shirt: '#34495e', glasses: true },
      sf: { skill: 4, depth: 5 }, fb: { depth: 4, noise: 12 }, quote: 'Setiap pertukaran bidak saya hitung untung-ruginya.' },
    { name: 'Prabowo', rating: 1600, group: 'Menengah', look: { bg: '#fad7a0', skin: '#e8b48a', hair: 0, hairC: '#3b3b3b', shirt: '#7b8a3e' },
      sf: { skill: 7, depth: 7 }, fb: { timeMs: 700 }, quote: 'Kita main dengan semangat, tanpa ragu!' },
    { name: 'Mahfud MD', rating: 1800, group: 'Mahir', look: { bg: '#85c1e9', skin: '#d69e6e', hair: 0, hairC: '#9a9a9a', shirt: '#1f3a5f', glasses: true },
      sf: { skill: 10, depth: 9 }, fb: { timeMs: 1200 }, quote: 'Di papan ini semua sama di depan aturan. Satu kesalahan kecil sudah cukup.' },
    { name: 'Sri Mulyani', rating: 2000, group: 'Mahir', look: { bg: '#f1948a', skin: '#efc7a4', hair: 1, hairC: '#2c1608', shirt: '#2c3e50' },
      sf: { skill: 13, movetime: 700 }, fb: { timeMs: 2000 }, quote: 'Setiap langkah sudah saya hitung dengan cermat, sampai belasan langkah ke depan.' },
    { name: 'Jusuf Kalla', rating: 2200, group: 'Mahir', look: { bg: '#bb8fce', skin: '#e0b088', hair: 3, hairC: '#d0d0d0', shirt: '#7f8c8d' },
      sf: { skill: 16, movetime: 1000 }, fb: { timeMs: 2500 }, quote: 'Lebih cepat lebih baik. Jangan harap ada bidak gratis.' },
    { name: 'Habibie', rating: 2500, group: 'Master', look: { bg: '#5d6d7e', skin: '#f6d5b8', hair: 3, hairC: '#bdbdbd', shirt: '#b03a2e', glasses: true },
      sf: { skill: 18, movetime: 1500 }, fb: { timeMs: 3000 }, quote: 'Saya hitung semua kemungkinan secepat pesawat terbang. Siap?' },
    { name: 'Garuda', rating: 3000, group: 'Master', look: { robot: true, bg: '#1b2631' },
      sf: { skill: 20, movetime: 2500 }, fb: { timeMs: 4000 }, quote: 'KEKUATAN PENUH. Peluang menang: mendekati nol. Semoga beruntung, manusia.' },
  ];
  const GROUP_DESC = { Pemula: 'baru belajar', Menengah: 'pemain klub', Mahir: 'pemain kuat', Master: 'level dewa' };
  const PLAYER_LOOK = { bg: '#566573', skin: '#e0b088', hair: 0, hairC: '#2b1b12', shirt: '#81b64c' };

  const LINES = {
    win: ['Wah, kamu hebat! Aku kalah telak.', 'Selamat! Permainan yang bagus.', 'Aku harus latihan lagi nih.'],
    lose: ['Gampang! Mau coba lagi?', 'Hehe, kali ini aku menang.', 'Latihan terus, nanti pasti bisa!'],
    draw: ['Seri! Adil untuk kita berdua.', 'Tidak ada yang kalah hari ini.'],
    capture: ['Terima kasih atas bidaknya!', 'Nyam, enak.', 'Itu umpan, ya?'],
    lost: ['Aduh, aku tidak melihat itu.', 'Hmm, langkah bagus.', 'Ups!'],
    check: ['Skak!', 'Awas rajamu!'],
  };
  const pick = a => a[Math.random() * a.length | 0];

  // ---------- Avatar (SVG buatan sendiri) ----------
  function avatarSVG(a) {
    if (a.robot) {
      return `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${a.bg}"/>
        <rect x="47" y="10" width="6" height="14" fill="#95a5a6"/><circle cx="50" cy="10" r="5" fill="#e74c3c"/>
        <rect x="22" y="24" width="56" height="46" rx="10" fill="#bdc3c7"/>
        <rect x="30" y="34" width="40" height="18" rx="6" fill="#17202a"/>
        <circle cx="41" cy="43" r="5" fill="#f4d03f"/><circle cx="59" cy="43" r="5" fill="#f4d03f"/>
        <rect x="38" y="58" width="24" height="5" rx="2" fill="#7f8c8d"/>
        <rect x="14" y="76" width="72" height="30" rx="12" fill="#7f8c8d"/></svg>`;
    }
    const hair = [
      `<path d="M28 44 Q28 18 50 17 Q72 18 72 44 Q66 30 50 30 Q34 30 28 44Z" fill="${a.hairC}"/>`,
      `<path d="M24 70 Q20 22 50 18 Q80 22 76 70 L68 70 Q70 36 50 32 Q30 36 32 70Z" fill="${a.hairC}"/>`,
      `<circle cx="50" cy="14" r="9" fill="${a.hairC}"/><path d="M28 44 Q28 20 50 19 Q72 20 72 44 Q64 30 50 31 Q36 30 28 44Z" fill="${a.hairC}"/>`,
      `<path d="M31 36 Q36 22 50 22 Q64 22 69 36 Q60 30 50 30 Q40 30 31 36Z" fill="${a.hairC}" opacity=".7"/>`,
      `<g fill="${a.hairC}"><circle cx="34" cy="32" r="9"/><circle cx="45" cy="24" r="10"/><circle cx="57" cy="24" r="10"/><circle cx="67" cy="32" r="9"/></g>`,
    ][a.hair || 0];
    return `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${a.bg}"/>
      <path d="M14 104 Q16 74 50 72 Q84 74 86 104Z" fill="${a.shirt}"/>
      <rect x="43" y="60" width="14" height="14" fill="${a.skin}"/>
      <ellipse cx="50" cy="44" rx="21" ry="24" fill="${a.skin}"/>
      ${a.beard ? `<path d="M30 46 Q32 70 50 70 Q68 70 70 46 Q66 60 50 60 Q34 60 30 46Z" fill="${a.hairC}"/>` : ''}
      ${hair}
      <circle cx="42" cy="45" r="2.6" fill="#222"/><circle cx="58" cy="45" r="2.6" fill="#222"/>
      <path d="M43 56 Q50 61 57 56" stroke="#7b3f2a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${a.glasses ? '<g fill="none" stroke="#222" stroke-width="2"><circle cx="42" cy="45" r="6"/><circle cx="58" cy="45" r="6"/><path d="M48 45h4"/></g>' : ''}
    </svg>`;
  }

  // ---------- Suara (WebAudio, tanpa file) ----------
  let audioCtx = null;
  function tone(freq, dur, type = 'sine', gain = 0.15, delay = 0) {
    if (!$('optSound').checked) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime + delay;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + dur);
    } catch { /* audio tidak tersedia */ }
  }
  function knock(gain, freq) {
    if (!$('optSound').checked) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const len = audioCtx.sampleRate * 0.06;
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = gain;
      src.connect(f).connect(g).connect(audioCtx.destination);
      src.start();
    } catch { /* audio tidak tersedia */ }
  }
  const sounds = {
    move: () => knock(1.2, 900),
    capture: () => { knock(1.8, 600); knock(1, 1400); },
    check: () => { knock(1.2, 900); tone(880, 0.12, 'triangle', 0.08, 0.02); },
    castle: () => { knock(1.1, 900); setTimeout(() => knock(1.1, 800), 90); },
    start: () => { tone(523, 0.15, 'triangle', 0.1); tone(784, 0.25, 'triangle', 0.1, 0.12); },
    end: () => { tone(392, 0.3, 'triangle', 0.1); tone(494, 0.3, 'triangle', 0.1, 0.15); tone(587, 0.45, 'triangle', 0.1, 0.3); },
    illegal: () => tone(180, 0.12, 'square', 0.05),
    click: () => { knock(0.6, 2200); tone(1200, 0.04, 'sine', 0.04); },
  };

  // Bunyi klik untuk semua tombol (tombol nonaktif tidak memicu event click)
  document.addEventListener('click', e => { if (e.target.closest('button')) sounds.click(); });

  // ---------- Mesin ----------
  // Mesin bawaan di Web Worker (blob) supaya UI tidak macet
  class OwnEngine {
    constructor() {
      this.seq = 0; this.waiting = new Map();
      try {
        const src = `${CaturCore.toString()}\n${CaturAI.toString()}\nconst C=CaturCore(),A=CaturAI(C);
onmessage=e=>{const d=e.data;const p=new C.Position(d.fen);for(const u of d.moves)p.make(p.moveFromUci(u));
const r=A.search(p,d.opts);postMessage({id:d.id,best:r.move?p.toUci(r.move):null,score:r.score,mate:A.mateIn(r.score)});};`;
        this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        this.worker.onmessage = e => { const cb = this.waiting.get(e.data.id); if (cb) { this.waiting.delete(e.data.id); cb(e.data); } };
        this.worker.onerror = () => { this.worker = null; };
      } catch { this.worker = null; }
    }
    run(fen, moves, opts) {
      if (!this.worker) return Promise.resolve(OwnEngine.sync(fen, moves, opts));
      const id = ++this.seq;
      return new Promise(res => { this.waiting.set(id, res); this.worker.postMessage({ id, fen, moves, opts }); });
    }
    static sync(fen, moves, opts) {
      const p = new C.Position(fen);
      for (const u of moves) p.make(p.moveFromUci(u));
      const r = AI.search(p, { ...opts, timeMs: Math.min(opts.timeMs || 500, 500) });
      return { best: r.move ? p.toUci(r.move) : null, score: r.score, mate: AI.mateIn(r.score) };
    }
  }

  // Stockfish 10 (asm.js) lewat protokol UCI di Web Worker
  class UciEngine {
    constructor(fn) {
      const src = '(' + fn.toString() + ')()';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.job = null; this.pending = null;
      this.ready = new Promise((resolve, reject) => {
        this.onReady = resolve;
        this.worker.onerror = e => reject(e);
        setTimeout(() => reject(new Error('timeout')), 20000);
      });
      this.worker.onmessage = e => this.line(String(e.data));
      this.send('uci');
    }
    send(s) { this.worker.postMessage(s); }
    line(l) {
      if (l === 'uciok') { this.send('isready'); return; }
      if (l === 'readyok') { if (this.onReady) { this.onReady(); this.onReady = null; } return; }
      const job = this.job;
      if (!job) return;
      if (l.startsWith('info') && !/ (upper|lower)bound/.test(l)) {
        const m = l.match(/ score (cp|mate) (-?\d+)/);
        if (m) {
          const pv = +((l.match(/ multipv (\d+)/) || [])[1] || 1);
          let score, mate = 0;
          if (m[1] === 'cp') score = +m[2];
          else { mate = +m[2]; score = mate > 0 ? 30000 - mate : -30000 - mate; }
          if (pv === 1) {
            job.score = score; job.mate = mate;
            const line = l.match(/ pv (.+)$/);
            if (line) job.pv = line[1].trim().split(' ').slice(0, 10);
          }
          else if (pv === 2) { job.score2 = score; job.mate2 = mate; }
        }
      } else if (l.startsWith('bestmove')) {
        this.job = null;
        const best = l.split(' ')[1];
        job.res(job.cancelled ? null : {
          best: best && best !== '(none)' ? best : null, score: job.score || 0, mate: job.mate || 0,
          score2: job.score2 ?? null, mate2: job.mate2 || 0, pv: job.pv || null,
        });
        if (this.pending) { const p = this.pending; this.pending = null; this.start(p); }
      }
    }
    start(job) {
      this.job = job;
      const o = job.opts;
      this.send(`setoption name Skill Level value ${o.skill ?? 20}`);
      this.send(`setoption name MultiPV value ${o.multipv || 1}`);
      // Contempt bawaan membuat skor condong ke pihak yang melangkah; analisis harus netral
      this.send(`setoption name Contempt value ${o.contempt ?? 24}`);
      this.send(`position fen ${job.fen}${job.moves.length ? ' moves ' + job.moves.join(' ') : ''}`);
      this.send(o.depth ? `go depth ${o.depth}${o.movetime ? ' movetime ' + o.movetime : ''}` : `go movetime ${o.movetime || 1000}`);
    }
    run(fen, moves, opts) {
      return new Promise(res => {
        const job = { fen, moves, opts, res };
        if (this.job) {
          if (this.pending) this.pending.res(null);
          this.pending = job;
          if (!this.job.cancelled) { this.job.cancelled = true; this.send('stop'); }
        } else this.start(job);
      });
    }
    cancel() {
      if (this.pending) { this.pending.res(null); this.pending = null; }
      if (this.job && !this.job.cancelled) { this.job.cancelled = true; this.send('stop'); }
    }
    newGame() { if (!this.job) this.send('ucinewgame'); }
  }

  const engines = { ownBot: new OwnEngine(), ownEval: new OwnEngine(), sfBot: null, sfEval: null };

  async function initStockfish() {
    const info = $('engineInfo');
    if (typeof window.STOCKFISH_FN !== 'function') {
      info.textContent = 'Mesin: bawaan (Stockfish tidak ditemukan)';
      return;
    }
    try {
      const bot = new UciEngine(window.STOCKFISH_FN);
      await bot.ready;
      engines.sfBot = bot;
      info.textContent = 'Mesin: Stockfish 10 · siap';
      try {
        const ev = new UciEngine(window.STOCKFISH_FN);
        await ev.ready;
        engines.sfEval = ev;
      } catch { /* evaluasi pakai mesin bawaan */ }
      runAnalysis();
    } catch {
      info.textContent = 'Mesin: bawaan (Stockfish gagal dimuat)';
    }
  }

  function botThink(bot, fen, moves) {
    if (bot.own) return engines.ownBot.run(fen, moves, bot.own);
    if (engines.sfBot) return engines.sfBot.run(fen, moves, bot.sf);
    return engines.ownBot.run(fen, moves, bot.fb);
  }
  function analyse(fen, moves, ms) {
    if (engines.sfEval) return engines.sfEval.run(fen, moves, { skill: 20, movetime: ms, contempt: 0 });
    return engines.ownEval.run(fen, moves, { timeMs: ms });
  }

  // ---------- Status permainan ----------
  const settings = {
    bot: Math.min(store.get('bot', 2), BOTS.length - 1),
    color: store.get('color', 'w'),
    time: store.get('time', '0'),
  };
  const game = {
    pos: new C.Position(),
    startFen: C.START_FEN,
    history: [],     // { m, uci, san, from, to, color }
    fens: [C.START_FEN],
    player: W,
    bot: BOTS[settings.bot],
    active: false,
    over: null,
    view: null,      // null = posisi terkini; angka = indeks fens yang sedang dilihat
    token: 0,
    thinking: false,
    clock: null,
    mode: 'bot',
    time: '0',       // kontrol waktu permainan ini (untuk simpan otomatis)
  };
  let orientation = W;
  let selected = -1;
  let hintMove = null;
  const marks = { arrows: new Map(), squares: new Set() };

  // ---------- Papan ----------
  const squaresEl = $('squares'), piecesEl = $('pieces'), boardEl = $('board'), arrowsEl = $('arrows');
  const sqEls = new Map();

  function sqToCell(sq) {
    const f = sq & 7, r = sq >> 4;
    return orientation === W ? { col: f, row: 7 - r } : { col: 7 - f, row: r };
  }
  function cellToSq(col, row) {
    return orientation === W ? (7 - row) * 16 + col : row * 16 + (7 - col);
  }
  function pointToSq(x, y) {
    const rect = boardEl.getBoundingClientRect();
    const col = Math.floor((x - rect.left) / rect.width * 8);
    const row = Math.floor((y - rect.top) / rect.height * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return cellToSq(col, row);
  }

  function buildSquares() {
    squaresEl.innerHTML = '';
    sqEls.clear();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = cellToSq(col, row);
        const el = document.createElement('div');
        el.className = 'sq ' + ((((sq >> 4) + (sq & 7)) & 1) ? 'light' : 'dark');
        if (col === 0) el.insertAdjacentHTML('beforeend', `<span class="coord rank">${(sq >> 4) + 1}</span>`);
        if (row === 7) el.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[sq & 7]}</span>`);
        squaresEl.appendChild(el);
        sqEls.set(sq, el);
      }
    }
  }

  const PIECE_IMG = {};
  // ---------- Tema papan & set bidak ----------
  const THEMES = [
    ['wood', 'Kayu'], ['green', 'Hijau'], ['brown', 'Cokelat'], ['blue', 'Biru'],
    ['purple', 'Ungu'], ['coral', 'Koral'], ['night', 'Malam'], ['marble', 'Marmer'],
  ];
  const PIECE_SETS = [
    ['cburnett', 'Klasik'], ['merida', 'Merida'], ['chessnut', 'Chessnut'], ['fantasy', 'Fantasi'],
    ['celtic', 'Celtic'], ['spatial', 'Spatial'], ['rhosgfx', 'Piksel'],
  ];
  const look = {
    theme: store.get('theme', 'wood'),
    pieces: store.get('pieces', 'cburnett'),
    coords: store.get('coords', true),
  };
  if (!THEMES.some(t => t[0] === look.theme)) look.theme = 'wood';
  if (!PIECE_SETS.some(p => p[0] === look.pieces)) look.pieces = 'cburnett';
  const pieceUrl = (key, set = look.pieces) => `pieces/${set}/${key}.svg`;
  function loadPieceImages() {
    for (const c of 'wb') for (const t of 'PNBRQK') PIECE_IMG[c + t] = pieceUrl(c + t);
  }
  loadPieceImages();
  const pieceKey = p => (p > 0 ? 'w' : 'b') + ' PNBRQK'[Math.abs(p)];

  function displayPos() {
    if (special) return special.pos;
    if (game.view === null) return game.pos;
    return new C.Position(game.fens[game.view]);
  }

  // anim: daftar { from, to } untuk bidak yang perlu digeser
  function render(anim) {
    const pos = displayPos();
    piecesEl.innerHTML = '';
    const pieceEls = new Map();
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = pos.board[sq];
      if (!p) continue;
      const el = document.createElement('div');
      el.className = 'piece';
      el.dataset.sq = sq;
      el.style.backgroundImage = `url(${PIECE_IMG[pieceKey(p)]})`;
      const { col, row } = sqToCell(sq);
      el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
      piecesEl.appendChild(el);
      pieceEls.set(sq, el);
    }
    if (anim) {
      for (const a of anim) {
        const el = pieceEls.get(a.to);
        if (!el) continue;
        const f = sqToCell(a.from), t = sqToCell(a.to);
        el.style.transform = `translate(${f.col * 100}%, ${f.row * 100}%)`;
        el.getBoundingClientRect();
        el.classList.add('anim');
        el.style.transform = `translate(${t.col * 100}%, ${t.row * 100}%)`;
      }
    }
    if (premove && game.view === null && Math.sign(pos.board[premove.from]) === game.player) {
      const el = pieceEls.get(premove.from), t = sqToCell(premove.to);
      if (pieceEls.get(premove.to)) pieceEls.get(premove.to).classList.add('ghost');
      if (el) el.style.transform = `translate(${t.col * 100}%, ${t.row * 100}%)`;
    }
    renderHighlights(pos);
    renderArrows();
  }

  function legalFrom(sq) {
    if (special) return special.type === 'retry' ? special.pos.legalMoves().filter(m => mFrom(m) === sq) : [];
    if (game.view !== null) return [];
    return game.pos.legalMoves().filter(m => mFrom(m) === sq);
  }

  function renderHighlights(pos) {
    pos = pos || displayPos();
    const idx = game.view === null ? game.history.length : game.view;
    const last = special ? special.last : idx > 0 ? game.history[idx - 1] : null;
    const targets = new Map();
    if (selected >= 0 && $('optHints').checked) {
      if (canPremove()) for (const t of premoveTargets(selected)) targets.set(t, !!pos.board[t]);
      else for (const m of legalFrom(selected)) targets.set(mTo(m), mFlags(m) & C.FLAG_CAP);
    }
    for (const [sq, el] of sqEls) {
      el.classList.toggle('last', !!last && (sq === last.from || sq === last.to));
      el.classList.toggle('sel', sq === selected);
      el.classList.toggle('premove', !!premove && game.view === null && (sq === premove.from || sq === premove.to));
      el.classList.toggle('mark', marks.squares.has(sq));
      el.classList.toggle('hint-sq', !!hintMove && (sq === hintMove.from || sq === hintMove.to));
      el.classList.toggle('dot', targets.has(sq) && !targets.get(sq));
      el.classList.toggle('ring', targets.has(sq) && !!targets.get(sq));
      el.classList.remove('hover');
      const k = pos.board[sq];
      el.classList.toggle('check', Math.abs(k) === C.KING && pos.inCheck(Math.sign(k)));
    }
    renderReviewBadge(idx);
  }

  function arrowSVG(from, to, kind) {
    const a = sqToCell(from), b = sqToCell(to);
    const x1 = a.col * 100 + 50, y1 = a.row * 100 + 50, x2 = b.col * 100 + 50, y2 = b.row * 100 + 50;
    const len = Math.hypot(x2 - x1, y2 - y1), k = (len - 30) / len;
    const color = { hint: 'rgba(60,140,255,.8)', best: 'rgba(129,182,76,.85)', user: 'rgba(255,170,0,.8)' }[kind];
    return `<line x1="${x1}" y1="${y1}" x2="${x1 + (x2 - x1) * k}" y2="${y1 + (y2 - y1) * k}" stroke="${color}" stroke-width="18" stroke-linecap="butt" marker-end="url(#ah-${kind})"/>`;
  }
  function renderArrows() {
    let html = arrowsEl.querySelector('defs').outerHTML;
    for (const [, a] of marks.arrows) html += arrowSVG(a.from, a.to, 'user');
    if (hintMove) html += arrowSVG(hintMove.from, hintMove.to, 'hint');
    const ra = reviewArrow();
    if (ra) html += arrowSVG(ra.from, ra.to, 'best');
    arrowsEl.innerHTML = html;
  }

  // ---------- Interaksi pemain ----------
  let drag = null;

  function canMove() {
    if (special) return special.type === 'retry' && !special.done && !special.busy;
    return game.active && !game.over && game.view === null && game.pos.turn === game.player && !game.thinking;
  }

  // Premove: langkah yang disiapkan saat bot masih berpikir, dijalankan otomatis setelah bot melangkah
  let premove = null;
  function canPremove() {
    if (special) return false;
    return game.active && !game.over && game.view === null && game.pos.turn !== game.player;
  }
  // Petak yang secara bentuk bisa dicapai bidak (tanpa memperhitungkan penghalang, karena posisi masih bisa berubah)
  function premoveTargets(from) {
    const p = game.pos.board[from], t = Math.abs(p), side = Math.sign(p);
    const out = [];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      if (sq === from) continue;
      const df = (sq & 7) - (from & 7), dr = (sq >> 4) - (from >> 4);
      const af = Math.abs(df), ar = Math.abs(dr);
      let ok = false;
      if (t === C.PAWN) ok = (dr === side && af <= 1) || (af === 0 && dr === 2 * side && (from >> 4) === (side === W ? 1 : 6));
      else if (t === C.KNIGHT) ok = af * ar === 2;
      else if (t === C.BISHOP) ok = af === ar;
      else if (t === C.ROOK) ok = af === 0 || ar === 0;
      else if (t === C.QUEEN) ok = af === ar || af === 0 || ar === 0;
      else if (t === C.KING) ok = Math.max(af, ar) === 1 || (ar === 0 && af === 2 && from === (side === W ? 4 : 116));
      if (ok) out.push(sq);
    }
    return out;
  }
  function cancelPremove() {
    if (!premove) return;
    premove = null;
    render();
  }
  function execPremove(pm) {
    if (!canMove()) return;
    const cands = legalFrom(pm.from).filter(m => mTo(m) === pm.to);
    if (!cands.length) { render(); return; }
    playMove(cands.find(m => mPromo(m) === C.QUEEN) || cands[0], false);
  }

  boardEl.addEventListener('contextmenu', e => e.preventDefault());

  boardEl.addEventListener('pointerdown', e => {
    if ($('promo').hidden === false || !$('gameOver').hidden) return;
    const sq = pointToSq(e.clientX, e.clientY);
    if (sq < 0) return;
    if (e.button === 2) { if (premove) { cancelPremove(); return; } drag = { right: true, from: sq }; return; }
    if (e.button !== 0) return;
    if (marks.arrows.size || marks.squares.size) { marks.arrows.clear(); marks.squares.clear(); renderArrows(); renderHighlights(); }

    const p = activePos().board[sq];
    // Klik petak tujuan setelah memilih bidak
    if (selected >= 0 && selected !== sq && !(p && Math.sign(p) === activeSide())) {
      tryMove(selected, sq, false);
      return;
    }
    if (!(canMove() || canPremove()) || !p || Math.sign(p) !== activeSide()) {
      if (game.view !== null && game.active && !special) { showToast('Kembali ke posisi terkini dulu (→ atau ⏭)'); }
      selected = -1;
      if (premove) cancelPremove(); else renderHighlights();
      return;
    }
    const wasSelected = selected === sq;
    selected = sq;
    renderHighlights();
    // Mulai seret
    const el = piecesEl.querySelector(`[data-sq="${sq}"]`);
    if (el) {
      boardEl.setPointerCapture(e.pointerId);
      drag = { from: sq, el, wasSelected, moved: false, startX: e.clientX, startY: e.clientY };
      el.classList.add('dragging');
      moveDragEl(e.clientX, e.clientY);
    }
  });

  function moveDragEl(x, y) {
    const rect = boardEl.getBoundingClientRect();
    const size = rect.width / 8;
    const px = x - rect.left - size / 2, py = y - rect.top - size / 2;
    drag.el.style.transform = `translate(${px}px, ${py}px)`;
  }

  boardEl.addEventListener('pointermove', e => {
    if (!drag || drag.right) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) drag.moved = true;
    moveDragEl(e.clientX, e.clientY);
    const sq = pointToSq(e.clientX, e.clientY);
    for (const [s, el] of sqEls) el.classList.toggle('hover', s === sq && s !== drag.from);
  });

  boardEl.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    const sq = pointToSq(e.clientX, e.clientY);
    if (d.right) {
      if (sq < 0) return;
      if (sq === d.from) { marks.squares.has(sq) ? marks.squares.delete(sq) : marks.squares.add(sq); renderHighlights(); }
      else { const k = d.from + '-' + sq; marks.arrows.has(k) ? marks.arrows.delete(k) : marks.arrows.set(k, { from: d.from, to: sq }); renderArrows(); }
      return;
    }
    d.el.classList.remove('dragging');
    if (sq >= 0 && sq !== d.from) { tryMove(d.from, sq, true); return; }
    // Lepas di petak asal: kembalikan bidak; klik kedua membatalkan pilihan
    const { col, row } = sqToCell(d.from);
    d.el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
    if (d.wasSelected && !d.moved) selected = -1;
    renderHighlights();
  });

  boardEl.addEventListener('pointercancel', () => { if (drag && !drag.right) render(); drag = null; });

  function tryMove(from, to, dragged) {
    if (canPremove()) {
      premove = premoveTargets(from).includes(to) ? { from, to } : null;
      selected = -1;
      render();
      return;
    }
    const cands = legalFrom(from).filter(m => mTo(m) === to);
    if (!cands.length) {
      if (dragged) sounds.illegal();
      selected = -1;
      render();
      return;
    }
    if (cands.length > 1) { showPromotion(from, to, cands, dragged); return; }
    selected = -1;
    commitMove(cands[0], !dragged);
  }

  function activePos() { return special && special.type === 'retry' ? special.pos : game.pos; }
  function activeSide() { return special && special.type === 'retry' ? special.side : game.player; }
  function commitMove(m, animate) {
    if (special && special.type === 'retry') retryMove(m, animate);
    else playMove(m, animate);
  }

  function showPromotion(from, to, cands, dragged) {
    const promo = $('promo');
    const { col, row } = sqToCell(to);
    const color = activeSide() === W ? 'w' : 'b';
    const order = [C.QUEEN, C.KNIGHT, C.ROOK, C.BISHOP];
    promo.innerHTML = '';
    promo.style.left = col * 12.5 + '%';
    const fromTop = row === 0;
    promo.style.top = fromTop ? '0' : 'auto';
    promo.style.bottom = fromTop ? 'auto' : '0';
    promo.style.flexDirection = fromTop ? 'column' : 'column-reverse';
    for (const t of order) {
      const b = document.createElement('button');
      b.style.backgroundImage = `url(${pieceUrl(color + ' PNBRQK'[t])})`;
      b.title = { 5: 'Menteri', 2: 'Kuda', 4: 'Benteng', 3: 'Gajah' }[t];
      b.onclick = () => { promo.hidden = true; selected = -1; commitMove(cands.find(m => mPromo(m) === t), !dragged); };
      promo.appendChild(b);
    }
    const x = document.createElement('button');
    x.className = 'close'; x.textContent = '✕'; x.title = 'Batal';
    x.onclick = () => { promo.hidden = true; selected = -1; render(); };
    promo.appendChild(x);
    promo.hidden = false;
  }

  // ---------- Menjalankan langkah ----------
  function playMove(m, animate, fromServer) {
    const pos = game.pos;
    const legal = pos.legalMoves();
    const san = pos.san(m, legal);
    const from = mFrom(m), to = mTo(m), flags = mFlags(m);
    const color = pos.turn;
    pos.make(m);
    game.history.push({ m, uci: pos.toUci(m), san, from, to, color });
    game.fens.push(pos.fen());
    if (game.mode === 'online' && !fromServer && color === game.player) olApi('move', { uci: pos.toUci(m), gameNo: game.onlineNo });
    hintMove = null;
    marks.arrows.clear(); marks.squares.clear();

    const anim = [];
    if (animate) anim.push({ from, to });
    if (flags & C.FLAG_CASTLE) {
      const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1;
      anim.push({ from: rf, to: rt });
    }
    if (game.view !== null) game.view = null;
    render(anim);

    if (pos.inCheck()) sounds.check();
    else if (flags & C.FLAG_CASTLE) sounds.castle();
    else if (flags & C.FLAG_CAP) sounds.capture();
    else sounds.move();

    clockAfterMove(color);
    renderMoveList();
    renderCaptured();

    const st = pos.status();
    if (st.over) { endGame(st.result, st.reason); return; }
    saveBotGame();

    if (game.mode === 'online') { /* tanpa komentar bot */ } else if (color === game.player) {
      if (flags & C.FLAG_CAP && Math.random() < 0.3) say(pick(LINES.lost));
    } else {
      if (pos.inCheck() && Math.random() < 0.4) say(pick(LINES.check));
      else if (flags & C.FLAG_CAP && Math.random() < 0.2) say(pick(LINES.capture));
    }
    updateStatus();
    runAnalysis();
    if (pos.turn !== game.player) { if (game.mode === 'bot') botMove(); }
    else if (premove) { const pm = premove; premove = null; setTimeout(() => execPremove(pm), 60); }
  }

  async function botMove() {
    const token = ++game.token;
    game.thinking = true;
    updateStatus();
    const t0 = Date.now();
    const moves = game.history.map(h => h.uci);
    let res = null;
    try { res = await botThink(game.bot, game.startFen, moves); } catch { res = null; }
    if (token !== game.token || !game.active || game.over) return;
    let m = res && res.best ? game.pos.moveFromUci(res.best) : 0;
    if (!m) m = game.pos.moveFromUci(OwnEngine.sync(game.startFen, moves, { timeMs: 300 }).best);
    // Jeda minimum supaya bot terasa "berpikir"
    const minThink = 350 + Math.random() * 500;
    const wait = minThink - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    if (token !== game.token || !game.active || game.over) return;
    game.thinking = false;
    if (m) playMove(m, true);
  }

  // ---------- Evaluasi ----------
  let evalToken = 0;
  async function runAnalysis() {
    if (!game.active && !game.history.length) { setEval(0, 0); return; }
    if (game.over) return;
    if (game.mode === 'online') { setEval(0, 0); return; }
    const token = ++evalToken;
    const turn = game.pos.turn;
    const res = await analyse(game.startFen, game.history.map(h => h.uci), 450);
    if (!res || token !== evalToken || game.over) return;
    const sign = turn === W ? 1 : -1;
    setEval(res.score * sign, res.mate * sign);
  }

  function setEval(cp, mate) {
    const fill = $('evalFill'), text = $('evalText');
    let pct, label;
    if (mate) { pct = mate > 0 ? 100 : 0; label = 'M' + Math.abs(mate); }
    else if (Math.abs(cp) >= 29000) { pct = cp > 0 ? 100 : 0; label = cp > 0 ? '1-0' : '0-1'; }
    else {
      pct = 50 + 50 * (2 / (1 + Math.exp(-cp / 400)) - 1);
      label = (Math.abs(cp) / 100).toFixed(1);
    }
    pct = Math.max(2, Math.min(98, pct));
    if (mate === 0 && (cp === 30000 || cp === -30000)) pct = cp > 0 ? 100 : 0;
    fill.style.height = (orientation === W ? pct : 100 - pct) + '%';
    fill.style.background = orientation === W ? '#f4f4f4' : '#403d39';
    $('evalBar').style.background = orientation === W ? '#403d39' : '#f4f4f4';
    const whiteBetter = mate ? mate > 0 : cp >= 0;
    // Label ditaruh di sisi yang unggul
    const atBottom = (whiteBetter && orientation === W) || (!whiteBetter && orientation === B);
    text.textContent = label;
    text.className = 'eval-text' + (atBottom ? '' : ' top');
    text.style.color = whiteBetter ? '#403d39' : '#f4f4f4';
  }

  // ---------- Jam ----------
  function parseTime(v) {
    if (v === '0') return null;
    const [base, inc] = v.split('+').map(Number);
    return { base: base * 1000, inc: (inc || 0) * 1000 };
  }
  function startClock(time = settings.time) {
    const tc = parseTime(time);
    if (game.clock && game.clock.timer) clearInterval(game.clock.timer);
    if (!tc) { game.clock = null; $('topClock').hidden = $('bottomClock').hidden = true; return; }
    game.clock = { [W]: tc.base, [B]: tc.base, inc: tc.inc, last: Date.now(), running: false, timer: null };
    $('topClock').hidden = $('bottomClock').hidden = false;
    game.clock.timer = setInterval(tickClock, 100);
    renderClocks();
  }
  function tickClock() {
    const c = game.clock;
    if (!c || !c.running || game.over) return;
    const now = Date.now(), side = game.pos.turn;
    c[side] -= now - c.last; c.last = now;
    if (c[side] <= 0) {
      c[side] = 0;
      renderClocks();
      if (game.mode === 'online') return; // server yang memutuskan
      // Kalah waktu; seri jika lawan tidak punya cukup bidak untuk skakmat
      const opp = -side;
      const onlyKing = !game.pos.board.some((p, sq) => !(sq & 0x88) && p * opp > 0 && Math.abs(p) !== C.KING);
      endGame(onlyKing ? '1/2-1/2' : (side === W ? '0-1' : '1-0'), onlyKing ? 'waktuseri' : 'waktu');
      return;
    }
    renderClocks();
  }
  function clockAfterMove(color) {
    const c = game.clock;
    if (!c || game.mode === 'online') return;
    const now = Date.now();
    if (c.running) { c[color] -= now - c.last; c[color] += c.inc; }
    // Jam mulai berjalan setelah langkah pertama putih
    c.running = true;
    c.last = now;
    renderClocks();
  }
  function fmt(ms) {
    const s = Math.ceil(ms / 1000);
    if (ms < 10000) return `0:${(ms / 1000).toFixed(1).padStart(4, '0')}`;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function renderClocks() {
    const c = game.clock;
    if (!c) return;
    const top = -orientation, bottom = orientation;
    for (const [id, side] of [['topClock', top], ['bottomClock', bottom]]) {
      const el = $(id);
      el.textContent = fmt(Math.max(0, c[side]));
      el.classList.toggle('active', c.running && game.pos.turn === side && !game.over);
      el.classList.toggle('low', c[side] < 20000);
    }
  }

  // ---------- Panel ----------
  function say(text) {
    $('chatText').textContent = text;
    const box = $('mBubbles');
    const b = document.createElement('div');
    b.className = 'm-bubble';
    b.textContent = text;
    box.appendChild(b);
    while (box.children.length > 2) box.firstChild.remove();
  }

  function updateStatus() {
    const el = $('statusLine');
    const ms = $('mStatus');
    syncMobile();
    if (!game.active) { el.textContent = ''; ms.textContent = ''; return; }
    if (game.over) {
      el.textContent = ms.textContent = resultText().title + ' — ' + resultText().reason;
      $('btnDraw').hidden = true;
      $('olChatForm').hidden = game.mode !== 'online';
      return;
    }
    if (game.thinking) el.innerHTML = ms.innerHTML = `${game.bot.name} sedang berpikir<span class="dots"></span>`;
    else if (game.mode === 'online' && game.pos.turn !== game.player) {
      el.innerHTML = ms.innerHTML = online.oppConnected === false
        ? `${game.bot.name} terputus… menunggu dia kembali (maks. 60 detik)`
        : `Menunggu langkah ${game.bot.name}<span class="dots"></span>`;
    }
    else el.textContent = ms.textContent = game.pos.inCheck() ? 'Rajamu diskak! Giliranmu.' : 'Giliranmu melangkah.';
    $('btnUndo').disabled = !game.history.some(h => h.color === game.player);
    $('btnHint').disabled = game.pos.turn !== game.player;
    const isOnline = game.mode === 'online';
    $('btnUndo').hidden = $('btnHint').hidden = isOnline;
    $('btnDraw').hidden = !isOnline || !!game.over;
    $('olChatForm').hidden = !isOnline;
  }

  function renderMoveList() {
    syncMobile();
    const inReview = !!(review && review.done && !$('reviewView').hidden);
    const el = inReview ? $('reviewMoves') : $('moveList');
    const h = game.history;
    if (!h.length) { el.innerHTML = '<div class="empty">Belum ada langkah</div>'; return; }
    const startBlack = new C.Position(game.startFen).turn === B;
    const cur = game.view === null ? h.length : game.view;
    const cell = i => {
      const cls = inReview ? CLS[review.moves[i].cls] : null;
      const icon = cls ? `<i class="cls-icon" style="background:${cls.color}">${cls.sym}</i>` : '';
      return `<span class="mv${cur === i + 1 ? ' current' : ''}" data-i="${i + 1}">${icon}${h[i].san}</span>`;
    };
    let html = '', i = 0, no = 1;
    while (i < h.length) {
      let w = '', b = '';
      if (i === 0 && startBlack) { w = '<span>…</span>'; }
      else { w = cell(i); i++; }
      if (i < h.length) { b = cell(i); i++; }
      html += `<div class="move-row"><span class="move-no">${no}.</span>${w}${b || '<span></span>'}</div>`;
      no++;
    }
    el.innerHTML = html;
    const curEl = el.querySelector('.current');
    if (curEl) {
      // Gulir di dalam daftar saja, jangan menggulir halaman
      const top = curEl.offsetTop - el.offsetTop;
      if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 30) el.scrollTop = top - el.clientHeight / 2;
    }
  }

  for (const id of ['moveList', 'reviewMoves']) {
    $(id).addEventListener('click', e => {
      const t = e.target.closest('.mv');
      if (!t) return;
      stopAutoplay();
      goTo(+t.dataset.i);
    });
  }

  function goTo(i) {
    if (special) exitSpecial(false);
    i = Math.max(0, Math.min(game.history.length, i));
    game.view = i === game.history.length ? null : i;
    selected = -1;
    render();
    renderMoveList();
    renderCaptured();
    if (review && review.done) updateReviewInfo();
  }

  // ---------- Ulasan permainan ----------
  const CLS = {
    brilliant: { label: 'Brilian', sym: '!!', color: '#1baca6', text: 'langkah brilian' },
    great: { label: 'Hebat', sym: '!', color: '#5c8bb0', text: 'langkah hebat' },
    best: { label: 'Terbaik', sym: '★', color: '#81b64c', text: 'langkah terbaik' },
    excellent: { label: 'Sangat Bagus', sym: '👍', color: '#96bc4b', text: 'langkah sangat bagus' },
    good: { label: 'Bagus', sym: '✓', color: '#95b776', text: 'langkah bagus' },
    book: { label: 'Buku', sym: '📖', color: '#a88865', text: 'langkah buku (teori pembukaan)' },
    forced: { label: 'Terpaksa', sym: '→', color: '#97af8b', text: 'satu-satunya langkah yang sah' },
    inaccuracy: { label: 'Kurang Tepat', sym: '?!', color: '#f7c631', text: 'langkah kurang tepat' },
    mistake: { label: 'Kesalahan', sym: '?', color: '#ffa459', text: 'sebuah kesalahan' },
    miss: { label: 'Peluang Hilang', sym: '✕', color: '#ff7769', text: 'peluang yang terlewat' },
    blunder: { label: 'Blunder', sym: '??', color: '#fa412d', text: 'sebuah blunder' },
  };
  const CLS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

  // Jalur pembukaan populer (UCI) untuk mendeteksi langkah "buku"
  const OPENINGS = [
    ['Pembukaan Pion Raja', 'e2e4'], ['Pembukaan Pion Menteri', 'd2d4'], ['Pembukaan Inggris', 'c2c4'],
    ['Pembukaan Zukertort', 'g1f3'], ['Pembukaan Bird', 'f2f4'],
    ['Permainan Pion Raja', 'e2e4 e7e5'], ['Pembukaan Kuda Raja', 'e2e4 e7e5 g1f3'],
    ['Pembukaan Italia', 'e2e4 e7e5 g1f3 b8c6 f1c4'], ['Giuoco Piano', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5'],
    ['Giuoco Piano: Variasi Utama', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6'],
    ['Gambit Evans', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4'],
    ['Pertahanan Dua Kuda', 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6'],
    ['Ruy Lopez', 'e2e4 e7e5 g1f3 b8c6 f1b5'], ['Ruy Lopez: Variasi Morphy', 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1'],
    ['Ruy Lopez: Pertahanan Berlin', 'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6'],
    ['Ruy Lopez: Variasi Tukar', 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6'],
    ['Permainan Skotlandia', 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4'],
    ['Empat Kuda', 'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6'],
    ['Pertahanan Petrov', 'e2e4 e7e5 g1f3 g8f6'], ['Pertahanan Philidor', 'e2e4 e7e5 g1f3 d7d6'],
    ['Gambit Raja', 'e2e4 e7e5 f2f4'], ['Permainan Wina', 'e2e4 e7e5 b1c3'],
    ['Pertahanan Sisilia', 'e2e4 c7c5'], ['Sisilia: Alapin', 'e2e4 c7c5 c2c3'], ['Sisilia Tertutup', 'e2e4 c7c5 b1c3'],
    ['Sisilia Terbuka', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4'],
    ['Sisilia: Najdorf', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6'],
    ['Sisilia: Naga', 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6'],
    ['Pertahanan Prancis', 'e2e4 e7e6'], ['Prancis: Variasi Maju', 'e2e4 e7e6 d2d4 d7d5 e4e5'],
    ['Prancis: Variasi Tukar', 'e2e4 e7e6 d2d4 d7d5 e4d5'],
    ['Pertahanan Caro-Kann', 'e2e4 c7c6'], ['Caro-Kann: Variasi Maju', 'e2e4 c7c6 d2d4 d7d5 e4e5'],
    ['Pertahanan Skandinavia', 'e2e4 d7d5'], ['Skandinavia: Variasi Utama', 'e2e4 d7d5 e4d5 d8d5 b1c3'],
    ['Pertahanan Pirc', 'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6'], ['Pertahanan Alekhine', 'e2e4 g8f6'], ['Pertahanan Modern', 'e2e4 g7g6'],
    ['Permainan Pion Menteri', 'd2d4 d7d5'], ['Gambit Menteri', 'd2d4 d7d5 c2c4'],
    ['Gambit Menteri Ditolak', 'd2d4 d7d5 c2c4 e7e6'], ['Gambit Menteri Diterima', 'd2d4 d7d5 c2c4 d5c4'],
    ['Pertahanan Slavia', 'd2d4 d7d5 c2c4 c7c6'], ['Sistem London', 'd2d4 d7d5 c1f4'], ['Sistem London', 'd2d4 g8f6 c1f4'],
    ['Pertahanan India', 'd2d4 g8f6'], ['India Raja', 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6'],
    ['Nimzo-India', 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4'], ['India Menteri', 'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6'],
    ['Pertahanan Grünfeld', 'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5'], ['Benoni Modern', 'd2d4 g8f6 c2c4 c7c5 d4d5'],
    ['Pertahanan Belanda', 'd2d4 f7f5'], ['Pembukaan Réti', 'g1f3 d7d5 c2c4'],
  ].map(([name, line]) => ({ name, line: line.split(' ') }));

  const REVIEW_DEPTH = 12;
  let review = null;
  let reviewToken = 0;
  let autoplay = 0;

  // Persentase menang putih (0-100) dari skor sentipion; rumus yang sama dipakai Lichess
  function winPct(cp, mate) {
    if (mate) return mate > 0 ? 100 : 0;
    if (cp >= 29000) return 100;
    if (cp <= -29000) return 0;
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }
  const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

  function gameAccuracy(list) {
    if (!list.length) return null;
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    const harmonic = list.length / list.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
    return (mean + harmonic) / 2;
  }

  function openingInfo(ucis) {
    let name = null, bookLen = 0;
    for (const o of OPENINGS) {
      let k = 0;
      while (k < o.line.length && k < ucis.length && o.line[k] === ucis[k]) k++;
      if (k === o.line.length && (!name || o.line.length >= name.len)) name = { name: o.name, len: o.line.length };
      bookLen = Math.max(bookLen, k);
    }
    return { name: name && name.name, bookLen };
  }

  const PVAL = [0, 1, 3, 3, 5, 9, 0];
  // Pengorbanan: bidak bernilai >= 3 ditaruh di petak yang bisa dimakan dengan untung oleh lawan
  function isSacrifice(fen, m) {
    const pos = new C.Position(fen);
    const side = pos.turn;
    const to = mTo(m);
    if (mPromo(m)) return false;
    const captured = (mFlags(m) & C.FLAG_EP) ? 1 : PVAL[Math.abs(pos.board[to])];
    pos.make(m);
    const v = PVAL[Math.abs(pos.board[to])];
    if (v < 3 || v - captured < 2) return false;
    const attackers = pos.legalMoves().filter(x => mTo(x) === to).map(x => PVAL[Math.abs(pos.board[mFrom(x)])] || 100);
    if (!attackers.length) return false;
    const cheapest = Math.min(...attackers);
    return cheapest < v || !pos.attacked(to, side);
  }

  function evalOfResult(res, turn) {
    const sign = turn === W ? 1 : -1;
    const out = { cp: res.score * sign, mate: res.mate * sign, best: res.best };
    out.pv = res.pv && res.pv[0] === res.best ? res.pv : (res.best ? [res.best] : []);
    out.win = winPct(out.cp, out.mate);
    if (res.score2 !== null && res.score2 !== undefined) out.win2 = winPct(res.score2 * sign, (res.mate2 || 0) * sign);
    return out;
  }

  async function startReview() {
    stopAutoplay();
    $('gameOver').hidden = true;
    $('setupView').hidden = true;
    $('gameView').hidden = true;
    $('reviewView').hidden = false;
    $('panelTitle').textContent = 'Ulasan Permainan';
    syncMobile();
    window.scrollTo(0, 0);
    if (review && review.done) { showReviewResult(); return; }
    const token = ++reviewToken;
    const n = game.history.length;
    review = { evals: new Array(n + 1), moves: [], done: false };
    $('reviewProgress').hidden = false;
    $('reviewContent').hidden = true;
    const ucis = game.history.map(h => h.uci);
    const useSf = !!(engines.sfEval && engines.sfBot);
    const pool = useSf ? [engines.sfEval, engines.sfBot] : [engines.ownEval, engines.ownBot];
    if (useSf) for (const e of pool) e.cancel();
    const msPer = 600;
    let next = 0, finished = 0;
    const progress = () => {
      const pct = Math.round(finished / (n + 1) * 100);
      $('reviewBar').style.width = pct + '%';
      $('reviewProgressText').textContent = `Menganalisis posisi ${finished} dari ${n + 1}…`;
    };
    progress();
    const worker = async eng => {
      while (next <= n) {
        const i = next++;
        const pos = new C.Position(game.fens[i]);
        const st = pos.status();
        if (st.over && st.reason === 'skakmat') review.evals[i] = { cp: pos.turn === W ? -30000 : 30000, mate: 0, win: pos.turn === W ? 0 : 100, best: null };
        else if (st.over) review.evals[i] = { cp: 0, mate: 0, win: 50, best: null };
        else {
          let res = null;
          for (let tries = 0; !res && tries < 3; tries++) {
            res = await eng.run(game.startFen, ucis.slice(0, i), useSf ? { skill: 20, depth: REVIEW_DEPTH, movetime: 1500, multipv: 2, contempt: 0 } : { timeMs: msPer });
            if (token !== reviewToken) return;
          }
          review.evals[i] = res ? evalOfResult(res, pos.turn) : { cp: 0, mate: 0, win: 50, best: null };
        }
        finished++;
        progress();
      }
    };
    await Promise.all(pool.map(worker));
    if (token !== reviewToken) return;
    classifyMoves();
    review.done = true;
    showReviewResult();
  }

  function classifyMoves() {
    const h = game.history, ev = review.evals;
    const ucis = h.map(x => x.uci);
    const book = openingInfo(ucis);
    review.opening = book.name;
    const acc = { [W]: [], [B]: [] };
    for (let i = 0; i < h.length; i++) {
      const mv = h[i], side = mv.color;
      const persp = w => side === W ? w : 100 - w;
      const before = persp(ev[i].win), after = persp(ev[i + 1].win);
      const loss = Math.max(0, before - after);
      const accuracy = moveAccuracy(loss);
      const legalCount = new C.Position(game.fens[i]).legalMoves().length;
      const isBest = ev[i].best === mv.uci;
      let cls;
      if (legalCount === 1) cls = 'forced';
      else if (i < book.bookLen) cls = 'book';
      else if (isBest || loss < 0.5) {
        const gap = ev[i].win2 !== undefined ? before - persp(ev[i].win2) : 0;
        if (isSacrifice(game.fens[i], mv.m) && after >= 45 && before < 97) cls = 'brilliant';
        else if (isBest && gap >= 12 && before < 90 && after > 35) cls = 'great';
        else cls = 'best';
      } else if (loss < 2) cls = 'excellent';
      else if (loss < 5) cls = 'good';
      else if (loss < 10) cls = 'inaccuracy';
      else if (loss < 20) cls = 'mistake';
      else cls = 'blunder';
      // Peluang hilang: lawan baru saja salah, tapi kesempatannya tidak dimanfaatkan
      const prev = review.moves[i - 1];
      if ((cls === 'mistake' || cls === 'blunder' || cls === 'inaccuracy') && prev && ['mistake', 'blunder', 'miss'].includes(prev.cls) && before >= 60 && after < before - 10 && after >= 30) cls = 'miss';
      // Peluang hilang: ada langkah yang memenangkan material besar, tapi tidak dimainkan
      if ((cls === 'inaccuracy' || cls === 'mistake') && ev[i].pv && ev[i + 1].pv
        && materialSwing(game.fens[i], ev[i].pv, side) >= 3
        && materialSwing(game.fens[i], [mv.uci, ...ev[i + 1].pv], side) < 1) cls = 'miss';
      if (cls !== 'forced') acc[side].push(cls === 'book' ? 100 : accuracy);
      review.moves.push({ cls, loss, accuracy, best: ev[i].best });
    }
    review.acc = { [W]: gameAccuracy(acc[W]), [B]: gameAccuracy(acc[B]) };
  }

  function showReviewResult() {
    $('reviewProgress').hidden = true;
    $('reviewContent').hidden = false;
    const me = game.player, bot = -game.player;
    const fmtAcc = a => a === null ? '–' : a.toFixed(1);
    $('accMe').textContent = fmtAcc(review.acc[me]);
    $('accBot').textContent = fmtAcc(review.acc[bot]);
    $('accMeAvatar').innerHTML = avatarSVG(PLAYER_LOOK);
    $('accBotAvatar').innerHTML = avatarSVG(game.bot.look);
    $('accBotName').textContent = game.bot.rating ? `${game.bot.name} (${game.bot.rating})` : game.bot.name;
    let rows = '';
    for (const k of CLS_ORDER) {
      const c = CLS[k];
      const cnt = side => review.moves.filter((m, i) => m.cls === k && game.history[i].color === side).length;
      rows += `<tr><td class="cnt" style="color:${c.color}">${cnt(me)}</td><td class="lbl"><i class="cls-icon" style="background:${c.color}">${c.sym}</i>${c.label}</td><td class="cnt" style="color:${c.color}">${cnt(bot)}</td></tr>`;
    }
    $('clsTable').innerHTML = rows;
    $('openingName').textContent = review.opening ? '📖 ' + review.opening : '';
    drawEvalGraph();
    goTo(0);
  }

  function drawEvalGraph() {
    const svg = $('evalGraph');
    const ev = review.evals, n = ev.length - 1;
    const W_ = Math.max(n, 1), flip = orientation === B;
    const y = w => (flip ? w : 100 - w);
    let pts = ev.map((e, i) => `${i},${y(e.win).toFixed(2)}`).join(' ');
    const base = flip ? 0 : 100;
    let html = `<rect x="0" y="0" width="${W_}" height="100" fill="${flip ? '#f4f4f4' : '#403d39'}"/>`;
    html += `<polygon points="0,${base} ${pts} ${n},${base}" fill="${flip ? '#403d39' : '#f4f4f4'}"/>`;
    html += `<line x1="0" y1="50" x2="${W_}" y2="50" stroke="#888" stroke-width=".6" vector-effect="non-scaling-stroke" stroke-dasharray="3 3"/>`;
    review.moves.forEach((m, i) => {
      if (!['brilliant', 'great', 'mistake', 'miss', 'blunder'].includes(m.cls)) return;
      html += `<line x1="${i + 1}" y1="0" x2="${i + 1}" y2="100" stroke="${CLS[m.cls].color}" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity=".85"/>`;
    });
    html += `<line id="graphCursor" x1="0" y1="0" x2="0" y2="100" stroke="#81b64c" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    svg.setAttribute('viewBox', `0 0 ${W_} 100`);
    svg.innerHTML = html;
  }

  $('evalGraph').addEventListener('click', e => {
    if (!review || !review.done) return;
    const r = $('evalGraph').getBoundingClientRect();
    const n = review.evals.length - 1;
    stopAutoplay();
    goTo(Math.round((e.clientX - r.left) / r.width * n));
  });

  function currentIdx() { return game.view === null ? game.history.length : game.view; }

  function updateReviewInfo() {
    const idx = currentIdx();
    const ev = review.evals[idx];
    setEval(ev.cp, ev.mate);
    const cursor = $('graphCursor');
    if (cursor) { cursor.setAttribute('x1', idx); cursor.setAttribute('x2', idx); }
    const icon = $('coachIcon'), title = $('coachTitle'), body = $('coachBody'), sub = $('coachSub');
    $('rvExit').hidden = true;
    if (idx === 0) {
      icon.style.background = '#81b64c'; icon.textContent = '▶';
      title.textContent = 'Posisi awal';
      body.textContent = 'Tekan ▶ untuk memutar ulang, atau klik langkah mana saja untuk melihat penjelasannya.';
      sub.textContent = '';
      $('rvBest').hidden = $('rvRetry').hidden = true;
      $('coachActions').hidden = true;
      return;
    }
    const mv = game.history[idx - 1], r = review.moves[idx - 1], c = CLS[r.cls];
    icon.style.background = c.color; icon.textContent = c.sym;
    const who = mv.color === game.player ? '' : `(${game.bot.name}) `;
    title.innerHTML = `<b>${who}${mv.san}</b> adalah ${c.text}`;
    review.explain = review.explain || {};
    const ex = review.explain[idx] || (review.explain[idx] = explainMove(idx - 1));
    body.textContent = ex.text;
    sub.textContent = 'Evaluasi: ' + evalText(ev);
    const weak = !GOOD_CLS.includes(r.cls);
    $('rvBest').hidden = !(weak && ex.bestSteps.length);
    $('rvRetry').hidden = !(weak && mv.color === game.player);
    $('coachActions').hidden = $('rvBest').hidden && $('rvRetry').hidden;
  }

  const GOOD_CLS = ['best', 'brilliant', 'great', 'book', 'forced', 'excellent', 'good'];
  const PIECE_NAME = ['', 'pion', 'kuda', 'gajah', 'benteng', 'menteri', 'raja'];

  function evalText(ev) {
    if (ev.mate) return `M${Math.abs(ev.mate)} (${ev.mate > 0 ? 'putih' : 'hitam'} bisa skakmat)`;
    if (Math.abs(ev.cp) >= 29000) return ev.cp > 0 ? 'putih menang' : 'hitam menang';
    return (ev.cp >= 0 ? '+' : '') + (ev.cp / 100).toFixed(2);
  }

  function material(pos, side) {
    let s = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      if (pos.board[sq] * side > 0) s += PVAL[Math.abs(pos.board[sq])];
    }
    return s;
  }

  // Mainkan variasi UCI dari sebuah FEN; catat SAN, bidak yang bergerak & yang dimakan
  function playLine(fen, ucis, max) {
    const pos = new C.Position(fen);
    const steps = [];
    for (const u of ucis.slice(0, max)) {
      const m = pos.moveFromUci(u);
      if (!m) break;
      const cap = (mFlags(m) & C.FLAG_EP) ? C.PAWN : Math.abs(pos.board[mTo(m)]);
      const piece = Math.abs(pos.board[mFrom(m)]);
      const side = pos.turn, full = pos.full;
      const san = pos.san(m);
      pos.make(m);
      steps.push({ m, uci: u, san, cap, piece, side, full, check: pos.inCheck(), castle: !!(mFlags(m) & C.FLAG_CASTLE) });
    }
    return { pos, steps };
  }

  // Untung/rugi material bagi `side` sepanjang variasi; berhenti setelah langkah lawan supaya pertukaran tidak terpotong
  function materialSwing(fen, ucis, side, max = 6) {
    const start = new C.Position(fen);
    const base = material(start, side) - material(start, -side);
    const { pos, steps } = playLine(fen, ucis, max);
    if (steps.length > 1 && steps[steps.length - 1].side === side) pos.unmake();
    return material(pos, side) - material(pos, -side) - base;
  }

  // Hasil bersih pertukaran sepanjang variasi (sama seperti materialSwing: berhenti setelah langkah lawan)
  function netTrade(steps, side) {
    let len = Math.min(steps.length, 6);
    if (len > 1 && steps[len - 1].side === side) len--;
    const lost = [], won = [];
    for (const st of steps.slice(0, len)) {
      if (!st.cap) continue;
      (st.side === side ? won : lost).push(st.cap);
    }
    // Bidak sejenis yang saling dimakan dianggap impas
    for (let k = lost.length - 1; k >= 0; k--) {
      const j = won.indexOf(lost[k]);
      if (j >= 0) { won.splice(j, 1); lost.splice(k, 1); }
    }
    return { lost, won, len };
  }

  function namesList(types) {
    const count = {};
    for (const t of types) count[t] = (count[t] || 0) + 1;
    const words = Object.entries(count).sort((a, b) => b[0] - a[0])
      .map(([t, n]) => (n > 1 ? `${n} ` : '') + PIECE_NAME[t]);
    return words.length > 1 ? words.slice(0, -1).join(', ') + ' dan ' + words[words.length - 1] : words[0];
  }

  function materialWords(n) {
    return { 1: 'satu pion', 2: 'dua pion', 3: 'satu bidak minor (setara kuda/gajah)', 5: 'setara satu benteng', 9: 'setara satu menteri' }[n] || `${n} poin material`;
  }

  // Nilai bidak-bidak `by` yang bisa memakan petak sq
  function attackerValues(fen, sq, by) {
    const parts = fen.split(' ');
    parts[1] = by === W ? 'w' : 'b';
    parts[3] = '-';
    let pos;
    try { pos = new C.Position(parts.join(' ')); } catch { return []; }
    return pos.genMoves(true).filter(m => mTo(m) === sq).map(m => PVAL[Math.abs(pos.board[mFrom(m)])] || 100);
  }

  // Bidak milik `side` di petak sq sedang terancam dimakan dengan untung?
  function threatened(fen, sq, side) {
    const pos = new C.Position(fen);
    const t = Math.abs(pos.board[sq]);
    if (t < 2 || t === C.KING) return 0;
    const att = attackerValues(fen, sq, -side);
    if (!att.length) return 0;
    return (!pos.attacked(sq, side) || Math.min(...att) < PVAL[t]) ? t : 0;
  }

  function lineText(steps) {
    return steps.map((s, k) => (s.side === W ? `${s.full}. ` : k === 0 ? `${s.full}… ` : '') + s.san).join(' ');
  }

  function standing(win, subj) {
    if (win >= 97) return `${subj} menang telak`;
    if (win >= 80) return `${subj} unggul besar`;
    if (win >= 62) return `${subj} unggul`;
    if (win >= 54) return `${subj} sedikit unggul`;
    if (win > 46) return 'posisi seimbang';
    if (win > 38) return `${subj} sedikit tertinggal`;
    if (win > 20) return `${subj} tertinggal`;
    if (win > 3) return `${subj} tertinggal jauh`;
    return `${subj} hampir pasti kalah`;
  }

  // Alasan sebuah langkah bagus: rokade, makan bidak, menyelamatkan bidak, skak, untung material
  function moveReasons(fen, step, side, gain) {
    const out = [];
    if (step.castle) out.push('mengamankan raja dengan rokade');
    if (step.cap) out.push(`memakan ${PIECE_NAME[step.cap]} lawan`);
    const saved = threatened(fen, mFrom(step.m), side);
    if (saved && !step.cap) out.push(`menyelamatkan ${PIECE_NAME[saved]} yang sedang terancam`);
    if (step.check) out.push('memberi skak');
    if (gain >= 2) out.push(step.cap ? `dan akhirnya untung ${materialWords(gain)}` : `memenangkan ${materialWords(gain)}`);
    return out;
  }

  function explainMove(i) {
    const mv = game.history[i], r = review.moves[i], ev = review.evals;
    const side = mv.color, me = side === game.player;
    const Subj = me ? 'Kamu' : game.bot.name, own = me ? 'kamu' : game.bot.name;
    const fen = game.fens[i];
    const persp = w => side === W ? w : 100 - w;
    const sgn = side === W ? 1 : -1;
    const bestPv = (ev[i].pv || []).filter(Boolean);
    const bestSteps = playLine(fen, bestPv, 8).steps;
    const best = bestSteps[0];
    const played = playLine(fen, [mv.uci], 1).steps[0];
    const parts = [];

    if (r.cls === 'book') parts.push(`Langkah teori pembukaan${review.opening ? ` (${review.opening})` : ''} yang biasa dimainkan para master.`);
    else if (r.cls === 'forced') parts.push('Ini satu-satunya langkah yang sah.');
    else if (r.cls === 'brilliant') parts.push(`Pengorbanan ${PIECE_NAME[played.piece]} yang jitu! Bidak itu boleh dimakan, tapi posisi ${own} tetap lebih baik.`);
    else if (r.cls === 'great') parts.push(`Langkah kritis: hanya langkah ini yang menjaga posisi ${own}. Alternatif lain jauh lebih buruk.`);
    else if (r.cls === 'best') {
      const why = moveReasons(fen, played, side, materialSwing(fen, bestPv, side));
      parts.push(why.length ? `Langkah terbaik di posisi ini: ${why.join(', ')}.` : 'Ini langkah paling akurat di posisi ini.');
    } else if (r.cls === 'excellent' || r.cls === 'good') {
      parts.push(best ? `Langkah yang ${r.cls === 'excellent' ? 'sangat ' : ''}solid. ${best.san} sedikit lebih akurat.` : 'Langkah yang solid.');
    } else {
      // Kenapa langkah ini buruk
      const replyPv = ev[i + 1].pv || [];
      const playedLine = [mv.uci, ...replyPv];
      const steps = playLine(fen, playedLine, 6).steps;
      const reply = steps[1];
      const swing = materialSwing(fen, playedLine, side);
      const oppMate = ev[i + 1].mate && Math.sign(ev[i + 1].mate) === -sgn;
      const hadMate = ev[i].mate && Math.sign(ev[i].mate) === sgn;
      if (oppMate) {
        parts.push(`Langkah ini membuka jalan skakmat bagi lawan dalam ${Math.abs(ev[i + 1].mate)} langkah${reply ? `, dimulai dengan ${reply.san}` : ''}.`);
      } else if (hadMate) {
        parts.push(`${Subj} melewatkan skakmat dalam ${Math.abs(ev[i].mate)} langkah!`);
      } else if (swing <= -1 && reply) {
        const tr = netTrade(steps, side);
        let lastCap = tr.len - 1;
        while (lastCap > 1 && !steps[lastCap].cap) lastCap--;
        const seq = lineText(steps.slice(1, lastCap + 1));
        if (tr.lost.length) parts.push(`Lawan bisa membalas ${seq}. ${Subj} kehilangan ${namesList(tr.lost)}${tr.won.length ? `, hanya mendapat ${namesList(tr.won)}` : ''}.`);
        else parts.push(`Setelah ${seq}, ${own} kehilangan ${materialWords(-swing)}.`);
      } else if (r.cls === 'miss') {
        parts.push(`Lawan baru saja membuat kesalahan, tapi ${own} tidak memanfaatkannya.`);
      } else if (reply) {
        parts.push(`Langkah ini memberi lawan kesempatan bagus dengan ${reply.san}.`);
      }
      // Kenapa langkah terbaik lebih baik
      if (best) {
        if (hadMate) parts.push(`${best.san} mengarah ke skakmat: ${lineText(bestSteps)}.`);
        else {
          const why = moveReasons(fen, best, side, materialSwing(fen, bestPv, side));
          parts.push(`Lebih baik ${best.san}${why.length ? ', ' + why.join(', ') : ''}.`);
          if (bestSteps.length > 1) parts.push(`Variasi terbaik: ${lineText(bestSteps.slice(0, 6))}.`);
        }
      }
    }
    if (!['book', 'forced'].includes(r.cls)) {
      const st = standing(persp(ev[i + 1].win), Subj);
      parts.push(`Sekarang ${me || st.startsWith('posisi') ? st.charAt(0).toLowerCase() + st.slice(1) : st}.`);
    }
    return { text: parts.join(' '), bestPv, bestSteps };
  }

  // ---------- Mode khusus: lihat variasi terbaik & coba lagi ----------
  let special = null;

  function exitSpecial(rerender = true) {
    if (special && special.timer) clearInterval(special.timer);
    special = null;
    selected = -1;
    if (rerender && review && review.done) { render(); renderCaptured(); updateReviewInfo(); }
  }

  function showBestLine() {
    const idx = currentIdx();
    if (!idx) return;
    const base = special && special.type === 'retry' ? special.base : idx - 1;
    stopAutoplay();
    review.explain = review.explain || {};
    const ex = review.explain[base + 1] || (review.explain[base + 1] = explainMove(base));
    if (!ex.bestSteps.length) return;
    exitSpecial(false);
    special = { type: 'line', base, pos: new C.Position(game.fens[base]), steps: ex.bestSteps, step: 0, last: null };
    const icon = $('coachIcon');
    icon.style.background = CLS.best.color; icon.textContent = '★';
    $('coachTitle').innerHTML = `Langkah terbaik: <b>${ex.bestSteps[0].san}</b>`;
    $('rvBest').hidden = $('rvRetry').hidden = true;
    $('rvExit').hidden = false;
    $('coachActions').hidden = false;
    const showLine = () => {
      $('coachBody').innerHTML = special.steps.map((s, k) => {
        const txt = (s.side === W ? `${s.full}. ` : k === 0 ? `${s.full}… ` : '') + s.san;
        return k < special.step ? `<b>${txt}</b>` : `<span class="pv-dim">${txt}</span>`;
      }).join(' ');
      $('coachSub').textContent = special.step < special.steps.length ? 'Memutar variasi terbaik…' : 'Selesai. Tekan "Kembali" untuk lanjut mengulas.';
    };
    render();
    renderCaptured();
    showLine();
    special.timer = setInterval(() => {
      const sp = special;
      if (!sp || sp.type !== 'line') return;
      if (sp.step >= sp.steps.length) { clearInterval(sp.timer); sp.timer = 0; showLine(); return; }
      const st = sp.steps[sp.step++];
      sp.pos.make(st.m);
      sp.last = { from: mFrom(st.m), to: mTo(st.m) };
      const anim = [{ from: mFrom(st.m), to: mTo(st.m) }];
      if (st.castle) { const f = mFrom(st.m), t = mTo(st.m); anim.push({ from: t > f ? f + 3 : f - 4, to: t > f ? f + 1 : f - 1 }); }
      render(anim);
      renderCaptured();
      if (st.check) sounds.check(); else if (st.cap) sounds.capture(); else sounds.move();
      showLine();
    }, 1000);
  }

  function startRetry() {
    const idx = currentIdx();
    if (!idx) return;
    stopAutoplay();
    exitSpecial(false);
    const mv = game.history[idx - 1];
    special = { type: 'retry', base: idx - 1, pos: new C.Position(game.fens[idx - 1]), side: mv.color, tries: 0, done: false, busy: false, last: null };
    render();
    renderCaptured();
    retryCoach('?', '#7d7a75', 'Coba lagi', `Cari langkah yang lebih baik dari ${mv.san}. Gerakkan bidak di papan.`);
    $('rvBest').hidden = true; $('rvRetry').hidden = true; $('rvExit').hidden = false;
    $('coachActions').hidden = false;
  }

  function retryCoach(sym, color, title, text, sub = '') {
    const icon = $('coachIcon');
    icon.style.background = color; icon.textContent = sym;
    $('coachTitle').innerHTML = title;
    $('coachBody').textContent = text;
    $('coachSub').textContent = sub;
  }

  async function retryMove(m, animate) {
    const sp = special;
    const pos = sp.pos;
    const san = pos.san(m), uci = pos.toUci(m), flags = mFlags(m);
    pos.make(m);
    sp.last = { from: mFrom(m), to: mTo(m) };
    sp.busy = true;
    render(animate ? [{ from: mFrom(m), to: mTo(m) }] : null);
    renderCaptured();
    if (pos.inCheck()) sounds.check(); else if (flags & C.FLAG_CAP) sounds.capture(); else sounds.move();
    const ev = review.evals[sp.base];
    const persp = w => sp.side === W ? w : 100 - w;
    const success = text => {
      sp.done = true; sp.busy = false;
      retryCoach('★', CLS.best.color, `<b>${san}</b> — benar!`, text);
      $('rvBest').hidden = false;
      sounds.start();
    };
    if (uci === ev.best) { success(`${san} adalah langkah terbaik di posisi ini. Kerja bagus!`); return; }
    retryCoach('…', '#7d7a75', `Menilai <b>${san}</b>…`, 'Stockfish sedang menghitung.');
    const ucis = game.history.slice(0, sp.base).map(h => h.uci).concat(uci);
    const st = pos.status();
    let after;
    if (st.over && st.reason === 'skakmat') after = 100;
    else if (st.over) after = 50;
    else {
      const res = await analyse(game.startFen, ucis, 900);
      if (special !== sp) return;
      after = res ? persp(evalOfResult(res, pos.turn).win) : 50;
    }
    const loss = persp(ev.win) - after;
    if (loss < 3) { success(`${san} juga langkah yang kuat, hampir sama dengan langkah terbaik.`); return; }
    sp.tries++;
    const label = loss < 10 ? 'kurang tepat' : loss < 20 ? 'sebuah kesalahan' : 'sebuah blunder';
    retryCoach('✕', CLS.blunder.color, `<b>${san}</b> adalah ${label}`, 'Belum tepat. Coba langkah lain!', sp.tries >= 2 ? 'Butuh bantuan? Tekan "Langkah Terbaik".' : '');
    sounds.illegal();
    setTimeout(() => {
      if (special !== sp) return;
      pos.unmake();
      sp.last = null; sp.busy = false;
      render();
      renderCaptured();
      if (sp.tries >= 2) $('rvBest').hidden = false;
    }, 1200);
  }

  // Panah hijau: langkah terbaik yang seharusnya dimainkan
  function reviewArrow() {
    if (!review || !review.done || $('reviewView').hidden || special) return null;
    const idx = currentIdx();
    if (idx === 0) return null;
    const r = review.moves[idx - 1];
    if (!r.best || ['best', 'brilliant', 'great', 'book', 'forced'].includes(r.cls)) return null;
    return { from: parseSq(r.best.slice(0, 2)), to: parseSq(r.best.slice(2, 4)) };
  }

  function renderReviewBadge(idx) {
    const badge = $('clsBadge');
    const on = review && review.done && !$('reviewView').hidden && idx > 0 && !special;
    boardEl.style.removeProperty('--last-move');
    if (!on) { badge.hidden = true; return; }
    const mv = game.history[idx - 1], c = CLS[review.moves[idx - 1].cls];
    const { col, row } = sqToCell(mv.to);
    badge.hidden = false;
    badge.textContent = c.sym;
    badge.style.background = c.color;
    badge.style.left = `calc(${(col + 1) * 12.5}% - 3.6%)`;
    badge.style.top = `calc(${row * 12.5}% - 1.2%)`;
    boardEl.style.setProperty('--last-move', c.color + '88');
  }

  function stopAutoplay() {
    if (autoplay) { clearInterval(autoplay); autoplay = 0; }
    $('rvPlay').textContent = '▶';
    if (typeof syncMobile === 'function') syncMobile();
  }
  function toggleAutoplay() {
    if (autoplay) { stopAutoplay(); return; }
    if (special) exitSpecial(false);
    if (currentIdx() >= game.history.length) goTo(0);
    $('rvPlay').textContent = '⏸';
    syncMobile();
    autoplay = setInterval(() => {
      if (currentIdx() >= game.history.length) { stopAutoplay(); return; }
      const i = currentIdx() + 1;
      const h = game.history[i - 1];
      game.view = i === game.history.length ? null : i;
      selected = -1;
      render([{ from: h.from, to: h.to }]);
      renderMoveList();
      renderCaptured();
      updateReviewInfo();
      if (mFlags(h.m) & C.FLAG_CAP) sounds.capture(); else sounds.move();
    }, 1300);
  }

  function closeReview() {
    stopAutoplay();
    if (special) exitSpecial(false);
    $('panelTitle').textContent = 'Lawan Bot';
    $('reviewView').hidden = true;
    $('gameView').hidden = false;
    goTo(game.history.length);
    if (game.over) setEval(game.over.result === '1-0' ? 30000 : game.over.result === '0-1' ? -30000 : 0, 0);
  }

  function resetReview() {
    if (special) exitSpecial(false);
    reviewToken++;
    stopAutoplay();
    review = null;
    $('panelTitle').textContent = 'Lawan Bot';
    $('reviewView').hidden = true;
    $('clsBadge').hidden = true;
    boardEl.style.removeProperty('--last-move');
  }

  function renderCaptured() {
    const pos = displayPos();
    const start = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };
    const count = { [W]: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, [B]: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    let matW = 0, matB = 0;
    const val = [0, 1, 3, 3, 5, 9, 0];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = pos.board[sq];
      if (!p || Math.abs(p) === C.KING) continue;
      count[Math.sign(p)][Math.abs(p)]++;
      if (p > 0) matW += val[p]; else matB += val[-p];
    }
    // Bidak yang ditangkap oleh `side` = bidak lawan yang hilang
    const html = side => {
      const opp = -side, c = opp === W ? 'w' : 'b';
      let s = '';
      for (const t of [1, 2, 3, 4, 5]) {
        const lost = Math.max(0, start[t] - count[opp][t]);
        for (let k = 0; k < lost; k++) s += `<img src="${pieceUrl(c + ' PNBRQK'[t])}" alt="">`;
        if (lost) s += '<i class="gap"></i>';
      }
      const diff = (side === W ? matW - matB : matB - matW);
      if (diff > 0) s += `<span>+${diff}</span>`;
      return s;
    };
    $('topCaptured').innerHTML = html(-orientation);
    $('bottomCaptured').innerHTML = html(orientation);
  }

  function renderPlayers() {
    const meTop = orientation !== game.player;
    const bot = game.bot;
    const botAv = avatarSVG(bot.look), meAv = avatarSVG(PLAYER_LOOK);
    $(meTop ? 'topAvatar' : 'bottomAvatar').innerHTML = meAv;
    $(meTop ? 'bottomAvatar' : 'topAvatar').innerHTML = botAv;
    $(meTop ? 'topName' : 'bottomName').textContent = 'Kamu';
    $(meTop ? 'bottomName' : 'topName').textContent = bot.name;
    $(meTop ? 'topRating' : 'bottomRating').textContent = '';
    $(meTop ? 'bottomRating' : 'topRating').textContent = bot.rating ? `(${bot.rating})` : '';
    renderCaptured();
    renderClocks();
  }

  // ---------- Pilih bot ----------
  function renderBotPicker() {
    const groups = {};
    BOTS.forEach((b, i) => (groups[b.group] = groups[b.group] || []).push(i));
    let html = '';
    for (const [g, idxs] of Object.entries(groups)) {
      html += `<div class="group"><div class="group-head">${g} <span>${GROUP_DESC[g]} · ${idxs.length} bot</span></div><div class="bot-grid">`;
      for (const i of idxs) {
        const b = BOTS[i];
        html += `<button class="bot-pick${i === settings.bot ? ' active' : ''}" data-i="${i}" title="${b.name} (${b.rating})">
          <div class="avatar">${avatarSVG(b.look)}</div><span class="lvl">${b.rating}</span></button>`;
      }
      html += '</div></div>';
    }
    $('botGroups').innerHTML = html;
    const b = BOTS[settings.bot];
    $('heroAvatar').innerHTML = avatarSVG(b.look);
    $('heroName').textContent = b.name;
    $('heroRating').textContent = b.rating;
    $('heroLevel').textContent = `${b.group} · ${b.own ? 'mesin bawaan' : 'Stockfish level ' + b.sf.skill}`;
    $('heroQuote').textContent = b.quote;
    if (!game.active) { game.bot = b; renderPlayers(); }
  }

  $('botGroups').addEventListener('click', e => {
    const t = e.target.closest('.bot-pick');
    if (!t) return;
    settings.bot = +t.dataset.i;
    store.set('bot', settings.bot);
    renderBotPicker();
  });

  function renderColorSeg() {
    for (const b of $('colorSeg').children) b.classList.toggle('active', b.dataset.color === settings.color);
  }
  $('colorSeg').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    settings.color = t.dataset.color;
    store.set('color', settings.color);
    renderColorSeg();
  });
  $('timeSelect').value = settings.time;
  $('timeSelect').addEventListener('change', e => { settings.time = e.target.value; store.set('time', settings.time); });

  for (const id of ['optHints', 'optEval', 'optSound']) {
    const el = $(id);
    el.checked = store.get(id, true);
    el.addEventListener('change', () => {
      store.set(id, el.checked);
      if (id === 'optEval') $('evalBar').classList.toggle('off', !el.checked);
      if (id === 'optHints') renderHighlights();
    });
  }
  $('evalBar').classList.toggle('off', !$('optEval').checked);

  // ---------- Simpan otomatis permainan lawan bot (lanjut setelah reload) ----------
  function saveBotGame() {
    if (game.mode !== 'bot' || !game.active || game.over) return;
    const c = game.clock;
    store.set('botGame', {
      bot: BOTS.indexOf(game.bot), player: game.player, time: game.time,
      moves: game.history.map(h => h.uci),
      clock: c ? { w: c[W], b: c[B], running: c.running } : null,
    });
  }
  const clearBotGame = () => store.set('botGame', null);
  window.addEventListener('pagehide', saveBotGame); // simpan sisa waktu terkini

  function resumeBotGame() {
    const s = store.get('botGame', null);
    if (!s || !BOTS[s.bot] || !Array.isArray(s.moves) || (s.player !== W && s.player !== B)) return;
    const pos = new C.Position();
    for (const u of s.moves) {
      const m = pos.moveFromUci(u);
      if (!m) { clearBotGame(); return; }
      pos.make(m);
    }
    if (pos.status().over) { clearBotGame(); return; }
    newGame(s);
  }

  // ---------- Alur permainan ----------
  function newGame(saved) {
    if (game.mode === 'online') { olApi('leave'); }
    game.mode = 'bot';
    hideOffer();
    $('modeTabs').hidden = true;
    $('onlineView').hidden = true;
    resetReview();
    $('btnReviewSide').hidden = true;
    $('btnResign').hidden = false;
    game.token++;
    evalToken++;
    if (engines.sfBot) { engines.sfBot.cancel(); engines.sfBot.newGame(); }
    game.bot = saved ? BOTS[saved.bot] : BOTS[settings.bot];
    game.player = saved ? saved.player : settings.color === 'w' ? W : settings.color === 'b' ? B : (Math.random() < 0.5 ? W : B);
    game.time = saved ? String(saved.time || '0') : settings.time;
    game.pos = new C.Position();
    game.startFen = C.START_FEN;
    game.history = [];
    game.fens = [C.START_FEN];
    game.over = null;
    game.view = null;
    game.thinking = false;
    game.active = true;
    selected = -1; hintMove = null; premove = null;
    marks.arrows.clear(); marks.squares.clear();
    orientation = game.player;
    $('gameOver').hidden = true;
    $('promo').hidden = true;
    $('setupView').hidden = true;
    $('gameView').hidden = false;
    $('btnPlay').hidden = true;
    $('chatAvatar').innerHTML = avatarSVG(game.bot.look);
    $('mChatAvatar').innerHTML = avatarSVG(game.bot.look);
    $('mBubbles').innerHTML = '';
    buildSquares();
    startClock(game.time);
    if (saved) {
      for (const u of saved.moves) {
        const pos = game.pos, m = pos.moveFromUci(u);
        const san = pos.san(m, pos.legalMoves()), color = pos.turn;
        pos.make(m);
        game.history.push({ m, uci: u, san, from: mFrom(m), to: mTo(m), color });
        game.fens.push(pos.fen());
      }
      const c = game.clock;
      if (c && saved.clock) { c[W] = saved.clock.w; c[B] = saved.clock.b; c.running = saved.clock.running; c.last = Date.now(); }
      say('Ayo lanjutkan permainan kita!');
    } else {
      say(game.bot.quote);
      sounds.start();
    }
    renderPlayers();
    render();
    renderMoveList();
    renderCaptured();
    renderClocks();
    setEval(20, 0);
    updateStatus();
    saveBotGame();
    if (saved) runAnalysis();
    if (game.pos.turn !== game.player) botMove();
  }

  function resultText() {
    const o = game.over;
    if (!o) return { title: '', reason: '' };
    const reasons = {
      skakmat: 'dengan skakmat', stalemate: 'karena stalemate (raja tidak bisa bergerak)', material: 'bidak tidak cukup untuk skakmat',
      '50langkah': 'aturan 50 langkah', repetisi: 'pengulangan posisi 3 kali', waktu: 'karena waktu habis',
      waktuseri: 'waktu habis, tapi bidak lawan tidak cukup untuk skakmat', menyerah: 'karena menyerah',
      keluar: 'karena keluar dari permainan', terputus: 'karena koneksi terputus terlalu lama', sepakat: 'atas kesepakatan bersama',
    };
    let title;
    if (o.result === '1/2-1/2') title = 'Seri';
    else title = (o.result === '1-0') === (game.player === W) ? 'Kamu Menang!' : 'Kamu Kalah';
    return { title, reason: reasons[o.reason] || '' };
  }

  // ---------- Video kartu hasil (menang/kalah) ----------
  // Ganti nama file di sini kalau nanti ada video kalah tersendiri.
  const RESULT_VIDEO = { win: 'media/skak.mp4', lose: 'media/skak.mp4' };
  const resultVideo = $('resultVideo');

  function playResultVideo(src) {
    const v = resultVideo;
    $('btnVideoSound').hidden = true;
    if (!v.src.endsWith(src)) v.src = src;
    v.currentTime = 0;
    v.muted = !$('optSound').checked;
    $('resultCard').classList.add('has-video');
    v.play().catch(() => {
      // Browser menolak memutar dengan suara: putar tanpa suara, sediakan tombol 🔇
      if (v.muted) return;
      v.muted = true;
      v.play().catch(() => {});
      $('btnVideoSound').hidden = false;
    });
  }
  function stopResultVideo() {
    resultVideo.pause();
    $('resultCard').classList.remove('has-video');
    $('btnVideoSound').hidden = true;
  }
  $('btnVideoSound').onclick = () => {
    resultVideo.muted = false;
    if (resultVideo.ended) resultVideo.currentTime = 0;
    resultVideo.play().catch(() => {});
    $('btnVideoSound').hidden = true;
  };
  resultVideo.onerror = stopResultVideo;
  // Kartu hasil disembunyikan dari banyak tempat; hentikan videonya setiap kali kartu tertutup
  new MutationObserver(() => { if ($('gameOver').hidden) stopResultVideo(); })
    .observe($('gameOver'), { attributes: true, attributeFilter: ['hidden'] });

  function endGame(result, reason) {
    if (game.over) return;
    if (game.mode === 'bot') clearBotGame();
    premove = null;
    game.over = { result, reason };
    game.thinking = false;
    game.token++;
    evalToken++;
    if (engines.sfBot) engines.sfBot.cancel();
    if (game.clock) game.clock.running = false;
    renderClocks();
    const rt = resultText();
    $('resultTitle').textContent = rt.title;
    $('resultReason').textContent = rt.reason;
    $('resultScore').textContent = result === '1/2-1/2' ? '½-½' : result;
    const meFirst = game.player === W;
    $('resultMe').innerHTML = avatarSVG(meFirst ? PLAYER_LOOK : game.bot.look);
    $('resultBot').innerHTML = avatarSVG(meFirst ? game.bot.look : PLAYER_LOOK);
    $('resultMeName').textContent = meFirst ? 'Kamu' : game.bot.name;
    $('resultBotName').textContent = meFirst ? game.bot.name : 'Kamu';
    $('gameOver').hidden = false;
    let video = null;
    if (result === '1/2-1/2') { if (game.mode === 'bot') say(pick(LINES.draw)); setEval(0, 0); }
    else {
      const playerWon = (result === '1-0') === (game.player === W);
      if (game.mode === 'bot') say(pick(playerWon ? LINES.win : LINES.lose));
      setEval(result === '1-0' ? 30000 : -30000, 0);
      video = RESULT_VIDEO[playerWon ? 'win' : 'lose'];
    }
    if (video) playResultVideo(video); else sounds.end();
    $('btnReviewSide').hidden = false;
    $('btnResign').hidden = true;
    $('btnRematch').textContent = game.mode === 'online' ? 'Ajak Main Lagi' : 'Main Lagi';
    updateStatus();
  }

  function backToSetup() {
    if (game.mode === 'online') { olApi('leave'); online.room = null; }
    else clearBotGame();
    game.mode = 'bot';
    hideOffer();
    resetReview();
    game.token++;
    evalToken++;
    if (engines.sfBot) engines.sfBot.cancel();
    if (game.clock && game.clock.timer) clearInterval(game.clock.timer);
    game.clock = null;
    game.active = false;
    game.thinking = false;
    game.over = null;
    game.pos = new C.Position();
    game.history = []; game.fens = [C.START_FEN]; game.view = null;
    selected = -1; hintMove = null; premove = null;
    orientation = W;
    $('topClock').hidden = $('bottomClock').hidden = true;
    $('gameOver').hidden = true;
    $('gameView').hidden = true;
    $('modeTabs').hidden = false;
    showTab(setupTab);
    buildSquares();
    renderBotPicker();
    renderPlayers();
    render();
    setEval(0, 0);
    updateStatus();
  }

  function takeback() {
    if (!game.active || game.mode === 'online') return;
    if (!game.history.some(h => h.color === game.player)) return;
    game.token++;
    evalToken++;
    if (engines.sfBot) engines.sfBot.cancel();
    game.thinking = false;
    // Mundur sampai langkah terakhir pemain ikut dibatalkan
    let undone;
    do {
      undone = game.history.pop();
      game.fens.pop();
      game.pos.unmake();
    } while (undone.color !== game.player);
    if (game.over) {
      game.over = null;
      resetReview();
      $('gameOver').hidden = true;
      $('btnReviewSide').hidden = true;
      $('btnResign').hidden = false;
      if (game.clock) { game.clock.running = game.history.length > 0; game.clock.last = Date.now(); }
    }
    game.view = null; selected = -1; hintMove = null; premove = null;
    render();
    renderMoveList();
    renderCaptured();
    updateStatus();
    runAnalysis();
    saveBotGame();
    say('Oke, silakan coba langkah lain.');
  }

  async function showHint() {
    if (game.mode === 'online') return;
    if (!game.active || game.over || game.pos.turn !== game.player || game.view !== null) return;
    const btn = $('btnHint');
    btn.disabled = true;
    const token = game.token;
    const res = await analyse(game.startFen, game.history.map(h => h.uci), 1200);
    btn.disabled = false;
    if (!res || !res.best || token !== game.token) return;
    hintMove = { from: parseSq(res.best.slice(0, 2)), to: parseSq(res.best.slice(2, 4)) };
    renderHighlights();
    renderArrows();
  }

  function pgn() {
    const date = new Date();
    const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    const opp = game.bot.rating ? `${game.bot.name} (${game.bot.rating})` : game.bot.name;
    const white = game.player === W ? 'Kamu' : opp;
    const black = game.player === B ? 'Kamu' : opp;
    const result = game.over ? game.over.result : '*';
    let s = `[Event "Lawan Bot"]\n[Site "Lokal"]\n[Date "${d}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n`;
    game.history.forEach((h, i) => { if (i % 2 === 0) s += `${i / 2 + 1}. `; s += h.san + ' '; });
    return s + result;
  }

  let toastTimer = 0;
  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function flip() {
    orientation = -orientation;
    buildSquares();
    renderPlayers();
    render();
    runAnalysis();
    if (review && review.done && !$('reviewView').hidden) { drawEvalGraph(); updateReviewInfo(); }
    else if (game.over) setEval(game.over.result === '1-0' ? 30000 : game.over.result === '0-1' ? -30000 : 0, 0);
  }

  // ---------- Tombol ----------
  $('btnPlay').onclick = () => newGame();
  $('btnRematch').onclick = () => rematchGame();
  $('btnNewBot').onclick = backToSetup;
  $('btnNew').onclick = () => {
    if (game.active && !game.over && game.history.length > 1 && !confirmInline('btnNew')) return;
    backToSetup();
  };
  $('btnCloseResult').onclick = () => { $('gameOver').hidden = true; };
  $('btnGameReview').onclick = startReview;
  $('btnReviewSide').onclick = startReview;
  $('rvFirst').onclick = () => { stopAutoplay(); goTo(0); };
  $('rvPrev').onclick = () => { stopAutoplay(); goTo(currentIdx() - 1); };
  $('rvPlay').onclick = toggleAutoplay;
  $('rvNext').onclick = () => { stopAutoplay(); goTo(currentIdx() + 1); };
  $('rvLast').onclick = () => { stopAutoplay(); goTo(game.history.length); };
  $('rvBack').onclick = closeReview;
  $('rvBest').onclick = showBestLine;
  $('rvRetry').onclick = startRetry;
  $('rvExit').onclick = () => exitSpecial(true);
  $('rvRematch').onclick = () => rematchGame();
  $('rvCancel').onclick = () => { reviewToken++; for (const e of [engines.sfEval, engines.sfBot]) if (e) e.cancel(); review = null; closeReview(); };
  $('btnUndo').onclick = takeback;
  $('btnHint').onclick = showHint;
  $('btnFlip').onclick = flip;
  $('btnResign').onclick = () => {
    if (!game.active || game.over) return;
    if (!confirmInline('btnResign')) return;
    resignGame();
  };
  $('btnDraw').onclick = () => offerDraw();
  $('btnPgn').onclick = async () => {
    try { await navigator.clipboard.writeText(pgn()); showToast('PGN disalin ke clipboard'); }
    catch { showToast('Gagal menyalin PGN'); }
  };
  $('navFirst').onclick = () => goTo(0);
  $('navPrev').onclick = () => goTo((game.view ?? game.history.length) - 1);
  $('navNext').onclick = () => goTo((game.view ?? game.history.length) + 1);
  $('navLast').onclick = () => goTo(game.history.length);

  // Konfirmasi tanpa dialog browser: klik kedua dalam 3 detik
  const confirmState = {};
  function confirmInline(id) {
    const btn = $(id);
    if (confirmState[id]) { clearTimeout(confirmState[id].t); btn.textContent = confirmState[id].label; delete confirmState[id]; return true; }
    confirmState[id] = { label: btn.textContent, t: setTimeout(() => { btn.textContent = confirmState[id].label; delete confirmState[id]; }, 3000) };
    btn.textContent = 'Klik lagi untuk yakin';
    return false;
  }

  // ---------- Tooltip tombol (penjelasan + shortcut keyboard) ----------
  const tipEl = document.createElement('div');
  tipEl.className = 'tooltip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  let tipTarget = null;
  function showTip(el) {
    tipTarget = el;
    const key = el.dataset.key;
    tipEl.innerHTML = '';
    tipEl.append(el.dataset.tip);
    if (key) {
      const k = document.createElement('span');
      k.className = 'tip-keys';
      for (const part of key.split(' / ')) {
        const kbd = document.createElement('kbd');
        kbd.textContent = part;
        k.appendChild(kbd);
      }
      tipEl.appendChild(k);
    }
    tipEl.hidden = false;
    const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(8, Math.min(left, innerWidth - t.width - 8));
    let top = r.top - t.height - 8;
    tipEl.classList.toggle('below', top < 8);
    if (top < 8) top = r.bottom + 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function hideTip() { tipEl.hidden = true; tipTarget = null; }
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('[data-tip]');
    if (el && el !== tipTarget) showTip(el);
    else if (!el && tipTarget) hideTip();
  });
  document.addEventListener('pointerdown', hideTip);
  addEventListener('scroll', hideTip, true);
  for (const el of document.querySelectorAll('[data-tip]')) {
    if (!el.getAttribute('aria-label') && el.textContent.trim().length <= 2) el.setAttribute('aria-label', el.dataset.tip);
  }

  // ---------- Layar penuh ----------
  const FS_ICON = {
    enter: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exit: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  };
  const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFullscreen() {
    hideTip();
    if (fsActive()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const el = document.documentElement;
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (p && p.catch) p.catch(() => showToast('Browser menolak mode layar penuh'));
    }
  }
  function updateFullscreenBtn() {
    const b = $('btnFull');
    b.innerHTML = fsActive() ? FS_ICON.exit : FS_ICON.enter;
    b.dataset.tip = fsActive() ? 'Keluar dari layar penuh' : 'Layar penuh';
    b.setAttribute('aria-label', b.dataset.tip);
  }
  $('btnFull').hidden = !fsSupported;
  $('btnFull').onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', updateFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
  updateFullscreenBtn();

  // Shortcut huruf: menekan tombol yang sedang terlihat dan aktif
  const KEY_BUTTONS = {
    h: ['btnHint'], u: ['btnUndo'], p: ['btnPgn'], d: ['btnDraw'], r: ['btnResign'],
    n: ['btnRematch', 'rvRematch', 'btnNew'], g: ['btnGameReview', 'btnReviewSide'],
    b: ['rvBest'], c: ['rvRetry'], t: ['btnSettings'], l: ['btnFull'],
  };
  const usable = el => el && !el.disabled && el.offsetParent !== null && !el.closest('[hidden]');
  function pressShortcut(key) {
    for (const id of KEY_BUTTONS[key] || []) {
      const el = $(id);
      if (usable(el)) { el.click(); return true; }
    }
    return false;
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    hideTip();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') { if (pressShortcut('u')) e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : '';
    if (k && k !== 'f' && KEY_BUTTONS[k]) { if (pressShortcut(k)) e.preventDefault(); return; }
    if (e.key === 'Enter' && usable($('btnPlay')) && e.target === document.body) { $('btnPlay').click(); e.preventDefault(); return; }
    if (e.key === 'Escape' && !$('reviewView').hidden && !special && $('settingsModal').hidden && $('mSheet').hidden) {
      if (review && review.done) closeReview(); else $('rvCancel').click();
      return;
    }
    if (e.key.startsWith('Arrow')) stopAutoplay();
    if (e.key === ' ' && review && review.done && !$('reviewView').hidden) { toggleAutoplay(); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft') { goTo((game.view ?? game.history.length) - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goTo((game.view ?? game.history.length) + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { goTo(0); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { goTo(game.history.length); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') flip();
    else if (e.key === 'Escape' && !$('settingsModal').hidden) { closeSettings(); return; }
    else if (e.key === 'Escape' && !$('mSheet').hidden) { closeSheet(); return; }
    else if (e.key === 'Escape') { if (special) { exitSpecial(true); return; } selected = -1; premove = null; $('promo').hidden = true; render(); }
  });

  function applyLook() {
    boardEl.dataset.theme = look.theme;
    boardEl.classList.toggle('no-coords', !look.coords);
    loadPieceImages();
    render();
    renderCaptured();
  }

  function renderSettings() {
    $('themeGrid').innerHTML = THEMES.map(([id, name]) =>
      `<button class="theme-opt${id === look.theme ? ' active' : ''}" data-theme-id="${id}">
        <div class="swatch" data-theme="${id}"><i class="l"></i><i class="d"></i><i class="d"></i><i class="l"></i></div>${name}</button>`).join('');
    $('pieceGrid').innerHTML = PIECE_SETS.map(([id, name]) =>
      `<button class="piece-opt${id === look.pieces ? ' active' : ''}" data-set="${id}">
        <div class="pv" data-theme="${look.theme}"><img src="${pieceUrl('wN', id)}" alt=""><img src="${pieceUrl('bQ', id)}" alt=""></div>${name}</button>`).join('');
    // Pratinjau 4x4: sudut papan dengan beberapa bidak
    const layout = ['bR', 'bN', 'bB', 'bQ', 'bP', 'bP', '', 'bP', '', 'wP', 'wN', '', 'wP', 'wB', 'wP', 'wK'];
    const pb = $('previewBoard');
    pb.dataset.theme = look.theme;
    pb.innerHTML = layout.map((k, i) => {
      const light = ((i >> 2) + (i & 3)) % 2 === 0;
      return `<div style="background:${light ? 'var(--light-bg)' : 'var(--dark-bg)'}"><div style="position:absolute;inset:0;${k ? `background:url(${pieceUrl(k)}) center/90% no-repeat` : ''}"></div></div>`;
    }).join('');
    $('optCoords').checked = look.coords;
  }

  function openSettings() { renderSettings(); $('settingsModal').hidden = false; }
  function closeSettings() { $('settingsModal').hidden = true; }

  $('themeGrid').addEventListener('click', e => {
    const t = e.target.closest('.theme-opt');
    if (!t) return;
    look.theme = t.dataset.themeId;
    store.set('theme', look.theme);
    applyLook(); renderSettings();
  });
  $('pieceGrid').addEventListener('click', e => {
    const t = e.target.closest('.piece-opt');
    if (!t) return;
    look.pieces = t.dataset.set;
    store.set('pieces', look.pieces);
    applyLook(); renderSettings();
  });
  $('optCoords').addEventListener('change', e => { look.coords = e.target.checked; store.set('coords', look.coords); applyLook(); });
  $('btnSettings').onclick = openSettings;
  $('btnTheme').onclick = openSettings;
  $('btnCloseSettings').onclick = closeSettings;
  $('btnSettingsDone').onclick = closeSettings;
  $('settingsModal').addEventListener('click', e => { if (e.target.id === 'settingsModal') closeSettings(); });

  // ---------- Tampilan HP: obrolan, daftar langkah mendatar, toolbar ----------
  const ICONS = {
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.4.4.6.9.6 1.4V16h6v-.8c0-.5.2-1 .6-1.4A6 6 0 0 0 12 3z"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    half: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  };
  let resignArmed = 0;

  function uiMode() {
    if (!game.active) return 'setup';
    if (!$('reviewView').hidden) return 'review';
    return game.over ? 'over' : 'play';
  }

  const tbBtn = (act, icon, label, disabled, extra = '') =>
    `<button class="tb ${extra}" data-act="${act}"${disabled ? ' disabled' : ''}>${ICONS[icon]}<span>${label}</span></button>`;

  function syncMobile() {
    const mode = uiMode();
    document.body.dataset.mode = mode;
    const idx = currentIdx(), n = game.history.length;
    let html = '';
    if (mode === 'play') {
      html = tbBtn('opts', 'list', 'Pilihan')
        + tbBtn('resign', 'flag', resignArmed ? 'Yakin?' : 'Menyerah', false, resignArmed ? 'warn' : '')
        + (game.mode === 'online'
          ? tbBtn('draw', 'half', 'Seri') + tbBtn('chat', 'chat', 'Chat')
          : tbBtn('hint', 'bulb', 'Petunjuk', game.pos.turn !== game.player || game.view !== null)
            + tbBtn('undo', 'undo', 'Urung', !game.history.some(h => h.color === game.player)));
    } else if (mode === 'over') {
      html = tbBtn('opts', 'list', 'Pilihan') + tbBtn('rematch', 'plus', game.mode === 'online' ? 'Lagi' : 'Baru') + tbBtn('review', 'search', 'Ulasan')
        + tbBtn('prev', 'prev', 'Mundur', idx === 0) + tbBtn('next', 'next', 'Maju', idx >= n);
    } else if (mode === 'review') {
      html = tbBtn('opts', 'list', 'Pilihan') + tbBtn('back', 'back', 'Kembali') + tbBtn('prev', 'prev', 'Mundur', idx === 0)
        + tbBtn('auto', autoplay ? 'pause' : 'play', autoplay ? 'Jeda' : 'Putar', !review || !review.done) + tbBtn('next', 'next', 'Maju', idx >= n);
    }
    $('mToolbar').innerHTML = html;
    renderStrip();
  }

  function renderStrip() {
    const el = $('mStrip'), h = game.history;
    if (!h.length) { el.innerHTML = '<span class="m-empty">Belum ada langkah</span>'; return; }
    const cur = currentIdx();
    const withIcons = review && review.done && uiMode() === 'review';
    let html = '';
    h.forEach((m, i) => {
      if (i % 2 === 0) html += `<span class="m-no">${i / 2 + 1}.</span>`;
      const c = withIcons ? CLS[review.moves[i].cls] : null;
      const icon = c ? `<i class="cls-icon" style="background:${c.color}">${c.sym}</i>` : '';
      html += `<span class="m-mv${cur === i + 1 ? ' current' : ''}" data-i="${i + 1}">${icon}${m.san}</span>`;
    });
    el.innerHTML = html;
    const curEl = el.querySelector('.current');
    if (curEl) el.scrollLeft = curEl.offsetLeft - el.offsetLeft - el.clientWidth / 2 + curEl.offsetWidth / 2;
    else el.scrollLeft = 0;
  }

  $('mStrip').addEventListener('click', e => {
    const t = e.target.closest('.m-mv');
    if (!t) return;
    stopAutoplay();
    goTo(+t.dataset.i);
  });
  $('mPrev').onclick = () => { stopAutoplay(); goTo(currentIdx() - 1); };
  $('mNext').onclick = () => { stopAutoplay(); goTo(currentIdx() + 1); };

  $('mToolbar').addEventListener('click', e => {
    const b = e.target.closest('.tb');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'opts': openSheet(); break;
      case 'resign':
        if (resignArmed) {
          clearTimeout(resignArmed); resignArmed = 0;
          resignGame();
        } else {
          resignArmed = setTimeout(() => { resignArmed = 0; syncMobile(); }, 3000);
          syncMobile();
        }
        break;
      case 'hint': showHint(); break;
      case 'undo': takeback(); break;
      case 'rematch': rematchGame(); break;
      case 'draw': offerDraw(); break;
      case 'chat': openSheet(true); break;
      case 'review': startReview(); break;
      case 'prev': stopAutoplay(); goTo(currentIdx() - 1); break;
      case 'next': stopAutoplay(); goTo(currentIdx() + 1); break;
      case 'back': closeReview(); break;
      case 'auto': toggleAutoplay(); break;
    }
  });

  // Menu "Pilihan"
  function openSheet(focusChat) {
    const isOnline = game.mode === 'online' && game.active;
    $('mChatForm').hidden = !isOnline;
    const items = [
      ['flip', 'Putar Papan'],
      ['theme', 'Tema Papan & Bidak'],
      ['pgn', 'Salin PGN'],
      ['sound', `Suara: ${$('optSound').checked ? 'Aktif' : 'Mati'}`],
      ['hints', `Tampilkan langkah sah: ${$('optHints').checked ? 'Aktif' : 'Mati'}`],
      ...(isOnline && !game.over ? [['draw', 'Tawarkan Seri']] : []),
      ['newbot', isOnline ? 'Keluar Ruangan' : game.active && !game.over ? 'Akhiri & Ganti Bot' : 'Ganti Bot'],
    ];
    $('mSheetItems').innerHTML = items.map(([a, l]) => `<button class="sheet-item" data-act="${a}">${l}</button>`).join('');
    $('mSheet').hidden = false;
    if (focusChat === true && isOnline) $('mChatInput').focus();
  }
  $('mChatForm').addEventListener('submit', e => {
    e.preventDefault();
    sendChat($('mChatInput').value);
    $('mChatInput').value = '';
    closeSheet();
  });
  function closeSheet() { $('mSheet').hidden = true; }
  $('mSheetClose').onclick = closeSheet;
  $('mSheet').addEventListener('click', e => {
    if (e.target.id === 'mSheet') { closeSheet(); return; }
    const t = e.target.closest('.sheet-item');
    if (!t) return;
    const toggle = id => { const el = $(id); el.checked = !el.checked; el.dispatchEvent(new Event('change')); openSheet(); };
    switch (t.dataset.act) {
      case 'flip': closeSheet(); flip(); break;
      case 'theme': closeSheet(); openSettings(); break;
      case 'pgn': closeSheet(); $('btnPgn').click(); break;
      case 'sound': toggle('optSound'); break;
      case 'hints': toggle('optHints'); break;
      case 'newbot': closeSheet(); backToSetup(); break;
      case 'draw': closeSheet(); offerDraw(); break;
    }
  });

  // ---------- Main online di jaringan lokal (butuh server.js) ----------
  const online = {
    available: false,
    es: null,
    token: store.get('olToken', null),
    name: store.get('olName', ''),
    color: store.get('olColor', 'r'),
    lobby: [],
    playing: 0,
    room: null,
    chatSeen: 0,
  };
  if (!online.token || !/^[a-f0-9]{32}$/.test(online.token)) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    online.token = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    store.set('olToken', online.token);
  }
  if (!online.name) {
    online.name = 'Pemain-' + online.token.slice(0, 4).toUpperCase();
    store.set('olName', online.name);
  }

  async function olApi(name, body = {}) {
    try {
      const r = await fetch('/api/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token, name: online.name, ...body }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(data.error || 'Gagal menghubungi server'); return null; }
      return data;
    } catch {
      showToast('Server tidak terjangkau');
      return null;
    }
  }

  // Warna avatar lawan dibuat tetap berdasarkan namanya
  function lookFromName(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pickH = arr => arr[(h = (h * 1103515245 + 12345) >>> 0) % arr.length];
    return {
      bg: pickH(['#7fb3d5', '#f5b7b1', '#a3e4d7', '#f9e79f', '#d2b4de', '#aed6f1', '#abebc6', '#fad7a0']),
      skin: pickH(['#f2c9a0', '#e8b48a', '#c68e5f', '#f5d0b0', '#d9a273', '#b97a50']),
      hair: pickH([0, 1, 2, 3, 4]),
      hairC: pickH(['#3b2a1e', '#1c1c1c', '#6e2c00', '#222', '#5b3a1a']),
      shirt: pickH(['#e67e22', '#8e44ad', '#2e86c1', '#16a085', '#c0392b', '#27ae60']),
    };
  }

  async function initOnline() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      online.available = r.ok && (await r.json()).ok;
    } catch { online.available = false; }
    if (!online.available) return;
    connectOnline();
    renderOnline();
  }

  function connectOnline() {
    if (online.es) online.es.close();
    const es = new EventSource(`/api/events?token=${online.token}&name=${encodeURIComponent(online.name)}`);
    online.es = es;
    es.addEventListener('lobby', e => {
      const d = JSON.parse(e.data);
      online.lobby = d.rooms; online.playing = d.playing;
      renderOnline();
    });
    es.addEventListener('room', e => onRoom(JSON.parse(e.data)));
    es.addEventListener('noroom', () => {
      online.room = null;
      renderOnline();
    });
    es.onerror = () => { renderOnline(); };
  }

  function onRoom(v) {
    online.room = v;
    if (v.status === 'waiting') { renderOnline(); return; }
    const sameGame = game.mode === 'online' && game.active && game.onlineNo === v.gameNo && game.onlineRoom === v.id;
    if (!sameGame) startOnlineGame(v);
    else syncOnline(v);
  }

  function startOnlineGame(v) {
    clearBotGame();
    const opp = v.you === 'w' ? v.black : v.white;
    resetReview();
    closeSheet();
    $('btnReviewSide').hidden = true;
    $('btnResign').hidden = false;
    game.token++;
    evalToken++;
    if (engines.sfBot) engines.sfBot.cancel();
    if (game.clock && game.clock.timer) clearInterval(game.clock.timer);
    game.mode = 'online';
    game.onlineNo = v.gameNo;
    game.onlineRoom = v.id;
    game.bot = { name: opp.name, rating: null, look: lookFromName(opp.name), quote: '' };
    game.player = v.you === 'w' ? W : B;
    game.pos = new C.Position();
    game.startFen = C.START_FEN;
    game.history = [];
    game.fens = [C.START_FEN];
    game.over = null;
    game.view = null;
    game.thinking = false;
    game.active = true;
    selected = -1; hintMove = null; premove = null;
    marks.arrows.clear(); marks.squares.clear();
    orientation = game.player;
    online.chatSeen = 0;
    $('gameOver').hidden = true;
    $('promo').hidden = true;
    $('setupView').hidden = true;
    $('onlineView').hidden = true;
    $('gameView').hidden = false;
    $('btnPlay').hidden = true;
    $('modeTabs').hidden = true;
    $('chatAvatar').innerHTML = avatarSVG(game.bot.look);
    $('mChatAvatar').innerHTML = avatarSVG(game.bot.look);
    $('mBubbles').innerHTML = '';
    $('panelTitle').textContent = 'Online (LAN)';
    say(`Kamu bermain ${game.player === W ? 'putih' : 'hitam'} melawan ${opp.name}. Semoga beruntung!`);
    // Jam mengikuti server
    if (v.clock) {
      game.clock = { [W]: v.clock.w, [B]: v.clock.b, inc: v.clock.inc, last: Date.now(), running: v.clock.running, timer: setInterval(tickClock, 100) };
      $('topClock').hidden = $('bottomClock').hidden = false;
    } else {
      game.clock = null;
      $('topClock').hidden = $('bottomClock').hidden = true;
    }
    // Ulangi semua langkah yang sudah terjadi (misalnya setelah halaman di-refresh)
    for (const u of v.moves) {
      const m = game.pos.moveFromUci(u);
      if (!m) break;
      const san = game.pos.san(m);
      const color = game.pos.turn;
      game.pos.make(m);
      game.history.push({ m, uci: u, san, from: mFrom(m), to: mTo(m), color });
      game.fens.push(game.pos.fen());
    }
    buildSquares();
    renderPlayers();
    render();
    renderMoveList();
    setEval(0, 0);
    sounds.start();
    online.chatSeen = Math.max(0, v.chat.length - 1);
    syncOnline(v);
  }

  function syncOnline(v) {
    // Langkah dari server
    const local = game.history.map(h => h.uci);
    const prefix = v.moves.length >= local.length && local.every((u, i) => u === v.moves[i]);
    if (!prefix) { startOnlineGame(v); return; }
    for (let i = local.length; i < v.moves.length; i++) {
      const m = game.pos.moveFromUci(v.moves[i]);
      if (!m) { startOnlineGame(v); return; }
      playMove(m, true, true);
    }
    // Jam
    if (game.clock && v.clock) {
      game.clock[W] = v.clock.w; game.clock[B] = v.clock.b;
      game.clock.running = v.clock.running; game.clock.last = Date.now();
      renderClocks();
    }
    // Obrolan
    const msgs = v.chat;
    for (let i = online.chatSeen; i < msgs.length; i++) {
      const c = msgs[i];
      if (c.from === 'sys') say(c.text);
      else say(c.from === v.you ? `Kamu: ${c.text}` : `${c.name}: ${c.text}`);
    }
    online.chatSeen = msgs.length;
    // Hasil
    if (v.status === 'over' && !game.over) endGame(v.result, v.reason);
    // Tawaran seri / main lagi dari lawan
    const opp = v.you === 'w' ? 'b' : 'w';
    if (v.status === 'playing' && v.drawOffer === opp) showOffer('draw');
    else if (v.status === 'over' && v.rematch && v.rematch[opp] && !v.rematch[v.you] && !v.oppLeft) showOffer('rematch');
    else hideOffer();
    online.oppConnected = (v.you === 'w' ? v.black : v.white).connected;
    online.oppLeft = v.oppLeft;
    updateStatus();
  }

  function showOffer(kind) {
    const bar = $('offerBar');
    bar.dataset.kind = kind;
    $('offerText').textContent = kind === 'draw' ? `${game.bot.name} menawarkan seri.` : `${game.bot.name} mengajak main lagi.`;
    bar.hidden = false;
  }
  function hideOffer() { $('offerBar').hidden = true; }
  $('offerAccept').onclick = () => {
    const kind = $('offerBar').dataset.kind;
    hideOffer();
    olApi(kind === 'draw' ? 'draw' : 'rematch', { action: 'accept' });
  };
  $('offerDecline').onclick = () => {
    const kind = $('offerBar').dataset.kind;
    hideOffer();
    olApi(kind === 'draw' ? 'draw' : 'rematch', { action: 'decline' });
  };

  function offerDraw() {
    if (game.mode !== 'online' || !game.active || game.over) return;
    olApi('draw', { action: 'offer' }).then(r => { if (r) showToast('Tawaran seri dikirim'); });
  }

  function sendChat(text) {
    text = (text || '').trim();
    if (!text || game.mode !== 'online') return;
    olApi('chat', { text });
  }
  $('olChatForm').addEventListener('submit', e => {
    e.preventDefault();
    sendChat($('olChatInput').value);
    $('olChatInput').value = '';
  });

  function resignGame() {
    if (!game.active || game.over) return;
    if (game.mode === 'online') olApi('resign');
    else endGame(game.player === W ? '0-1' : '1-0', 'menyerah');
  }

  function rematchGame() {
    if (game.mode !== 'online') { newGame(); return; }
    if (online.oppLeft) { showToast('Lawan sudah keluar dari ruangan'); return; }
    olApi('rematch', { action: 'offer' }).then(r => {
      if (r) { showToast('Ajakan main lagi dikirim'); $('gameOver').hidden = true; }
    });
  }

  // ---------- Tab "Lawan Bot" / "Online" & daftar lobi ----------
  let setupTab = store.get('tab', 'bot');
  function showTab(tab) {
    setupTab = tab;
    store.set('tab', tab);
    for (const b of $('modeTabs').children) b.classList.toggle('active', b.dataset.tab === tab);
    $('setupView').hidden = tab !== 'bot';
    $('onlineView').hidden = tab !== 'online';
    $('btnPlay').hidden = tab !== 'bot';
    $('panelTitle').textContent = tab === 'bot' ? 'Lawan Bot' : 'Online (LAN)';
    renderOnline();
  }
  $('modeTabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) showTab(b.dataset.tab);
  });

  function renderOnline() {
    if (game.active) return;
    $('olOffline').hidden = online.available;
    $('olMain').hidden = !online.available;
    if (!online.available) return;
    const nameEl = $('olName');
    if (document.activeElement !== nameEl) nameEl.value = online.name;
    for (const b of $('olColorSeg').children) b.classList.toggle('active', b.dataset.color === online.color);
    const r = online.room;
    const waiting = r && r.status === 'waiting' && r.mine;
    $('olCreateBox').hidden = !!waiting;
    $('olWaiting').hidden = !waiting;
    if (waiting) {
      $('olWaitName').textContent = r.name;
      $('olWaitInfo').textContent = `${{ w: 'Kamu putih', b: 'Kamu hitam', r: 'Warna acak' }[r.hostColor]} · ${r.time}`;
    }
    const others = online.lobby.filter(x => !(waiting && x.id === r.id));
    $('olCount').textContent = online.playing ? `${online.playing} permainan sedang berlangsung` : '';
    $('olList').innerHTML = others.length ? others.map(x => `
      <div class="ol-room">
        <div class="avatar">${avatarSVG(lookFromName(x.host))}</div>
        <div class="ol-room-info">
          <div class="ol-room-name">${escapeHtml(x.name)}</div>
          <div class="ol-room-meta">${escapeHtml(x.host)} · ${{ w: 'dia putih', b: 'dia hitam', r: 'warna acak' }[x.hostColor]} · ${escapeHtml(x.time)}</div>
        </div>
        <button class="btn green ol-join" data-id="${x.id}">Gabung</button>
      </div>`).join('') : '<div class="ol-empty">Belum ada lobi. Buat lobi baru, lalu minta temanmu membuka alamat yang sama.</div>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  $('olName').addEventListener('change', e => {
    online.name = e.target.value.trim().slice(0, 20) || online.name;
    e.target.value = online.name;
    store.set('olName', online.name);
    olApi('hello');
  });
  $('olColorSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    online.color = b.dataset.color;
    store.set('olColor', online.color);
    renderOnline();
  });
  $('olTime').value = store.get('olTime', '600+0');
  $('olTime').addEventListener('change', e => store.set('olTime', e.target.value));
  $('olCreate').onclick = () => {
    olApi('create', { color: online.color, time: $('olTime').value, roomName: $('olRoomName').value });
  };
  $('olCancel').onclick = () => olApi('leave');
  $('olList').addEventListener('click', e => {
    const b = e.target.closest('.ol-join');
    if (b) olApi('join', { roomId: b.dataset.id });
  });

  // ---------- Mulai ----------
  buildSquares();
  renderColorSeg();
  renderBotPicker();
  renderPlayers();
  applyLook();
  setEval(0, 0);
  showTab(setupTab);
  updateStatus();
  initStockfish();
  resumeBotGame();
  initOnline();
})();
