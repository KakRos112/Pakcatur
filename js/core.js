// Aturan catur: representasi papan 0x88, generator langkah, SAN, FEN, status permainan.
// Dibungkus dalam satu fungsi supaya sumbernya bisa dikirim utuh ke Web Worker.
function CaturCore() {
  'use strict';
  const W = 1, B = -1;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const FLAG_CAP = 1, FLAG_EP = 2, FLAG_CASTLE = 4, FLAG_DOUBLE = 8;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
  const B_OFF = [15, 17, -15, -17];
  const R_OFF = [16, -16, 1, -1];
  const K_OFF = [15, 17, -15, -17, 16, -16, 1, -1];

  const sqName = sq => 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
  const parseSq = s => (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97);
  const PIECE_CHARS = ' pnbrqk';

  // Zobrist hashing (dua bilangan 32-bit, deterministik)
  let seed = 0x2545F491;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
  const ZP_LO = new Uint32Array(13 * 128), ZP_HI = new Uint32Array(13 * 128);
  for (let i = 0; i < 13 * 128; i++) { ZP_LO[i] = rnd(); ZP_HI[i] = rnd(); }
  const ZT_LO = rnd(), ZT_HI = rnd();
  const ZC_LO = new Uint32Array(16), ZC_HI = new Uint32Array(16);
  for (let i = 0; i < 16; i++) { ZC_LO[i] = rnd(); ZC_HI[i] = rnd(); }
  const ZE_LO = new Uint32Array(8), ZE_HI = new Uint32Array(8);
  for (let i = 0; i < 8; i++) { ZE_LO[i] = rnd(); ZE_HI[i] = rnd(); }

  // Hak rokade yang hilang ketika petak tertentu disentuh
  const CASTLE_MASK = new Uint8Array(128).fill(15);
  CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1; CASTLE_MASK[4] = 15 & ~3;
  CASTLE_MASK[112] = 15 & ~8; CASTLE_MASK[119] = 15 & ~4; CASTLE_MASK[116] = 15 & ~12;

  const mFrom = m => m & 127;
  const mTo = m => (m >> 7) & 127;
  const mPromo = m => (m >> 14) & 7;
  const mFlags = m => m >> 17;
  const encode = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);

  class Position {
    constructor(fen) {
      this.board = new Int8Array(128);
      this.load(fen || START_FEN);
    }

    load(fen) {
      const parts = fen.trim().split(/\s+/);
      const b = this.board;
      b.fill(0);
      let rank = 7, file = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { rank--; file = 0; continue; }
        if (ch >= '1' && ch <= '8') { file += +ch; continue; }
        const lower = ch.toLowerCase();
        const type = PIECE_CHARS.indexOf(lower);
        if (type < 1) throw new Error('FEN tidak valid');
        b[rank * 16 + file] = ch === lower ? -type : type;
        file++;
      }
      this.turn = parts[1] === 'b' ? B : W;
      const c = parts[2] || '-';
      this.castling = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
      this.ep = parts[3] && parts[3] !== '-' ? parseSq(parts[3]) : -1;
      this.half = parseInt(parts[4] || '0', 10);
      this.full = parseInt(parts[5] || '1', 10);
      this.kW = -1; this.kB = -1;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        if (b[sq] === KING) this.kW = sq;
        else if (b[sq] === -KING) this.kB = sq;
      }
      this.undo = [];
      this.computeHash();
      this.hLo = [this.lo];
      this.hHi = [this.hi];
    }

    computeHash() {
      let lo = 0, hi = 0;
      const b = this.board;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        if (b[sq]) { const k = (b[sq] + 6) * 128 + sq; lo ^= ZP_LO[k]; hi ^= ZP_HI[k]; }
      }
      if (this.turn === B) { lo ^= ZT_LO; hi ^= ZT_HI; }
      lo ^= ZC_LO[this.castling]; hi ^= ZC_HI[this.castling];
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      this.lo = lo >>> 0; this.hi = hi >>> 0;
    }

    fen() {
      const b = this.board;
      let s = '';
      for (let r = 7; r >= 0; r--) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = b[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          const ch = PIECE_CHARS[Math.abs(p)];
          s += p > 0 ? ch.toUpperCase() : ch;
        }
        if (empty) s += empty;
        if (r) s += '/';
      }
      let c = '';
      if (this.castling & 1) c += 'K';
      if (this.castling & 2) c += 'Q';
      if (this.castling & 4) c += 'k';
      if (this.castling & 8) c += 'q';
      return `${s} ${this.turn === W ? 'w' : 'b'} ${c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }

    king(side) { return side === W ? this.kW : this.kB; }

    attacked(sq, by) {
      const b = this.board;
      const pd = -16 * by;
      let t = sq + pd - 1;
      if (!(t & 0x88) && b[t] === PAWN * by) return true;
      t = sq + pd + 1;
      if (!(t & 0x88) && b[t] === PAWN * by) return true;
      for (let i = 0; i < 8; i++) {
        t = sq + N_OFF[i];
        if (!(t & 0x88) && b[t] === KNIGHT * by) return true;
        t = sq + K_OFF[i];
        if (!(t & 0x88) && b[t] === KING * by) return true;
      }
      for (let i = 0; i < 4; i++) {
        const d = B_OFF[i];
        t = sq + d;
        while (!(t & 0x88)) {
          const p = b[t];
          if (p) { if (p === BISHOP * by || p === QUEEN * by) return true; break; }
          t += d;
        }
      }
      for (let i = 0; i < 4; i++) {
        const d = R_OFF[i];
        t = sq + d;
        while (!(t & 0x88)) {
          const p = b[t];
          if (p) { if (p === ROOK * by || p === QUEEN * by) return true; break; }
          t += d;
        }
      }
      return false;
    }

    inCheck(side = this.turn) { return this.attacked(this.king(side), -side); }

    // Langkah pseudo-legal (raja bisa saja tertinggal dalam skak; disaring di make()).
    genMoves(capturesOnly = false) {
      const b = this.board, side = this.turn, moves = [];
      const dir = 16 * side;
      const startRank = side === W ? 1 : 6;
      const promoRank = side === W ? 7 : 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (p * side <= 0) continue;
        const type = p * side;
        if (type === PAWN) {
          const to = sq + dir;
          const promo = (to >> 4) === promoRank;
          if (!(to & 0x88) && b[to] === 0) {
            if (promo) {
              moves.push(encode(sq, to, QUEEN, 0));
              if (!capturesOnly) {
                moves.push(encode(sq, to, KNIGHT, 0), encode(sq, to, ROOK, 0), encode(sq, to, BISHOP, 0));
              }
            } else if (!capturesOnly) {
              moves.push(encode(sq, to, 0, 0));
              if ((sq >> 4) === startRank && b[to + dir] === 0) moves.push(encode(sq, to + dir, 0, FLAG_DOUBLE));
            }
          }
          for (const t of [to - 1, to + 1]) {
            if (t & 0x88) continue;
            if (b[t] * side < 0) {
              if (promo) {
                moves.push(encode(sq, t, QUEEN, FLAG_CAP));
                if (!capturesOnly) moves.push(encode(sq, t, KNIGHT, FLAG_CAP), encode(sq, t, ROOK, FLAG_CAP), encode(sq, t, BISHOP, FLAG_CAP));
              } else moves.push(encode(sq, t, 0, FLAG_CAP));
            } else if (t === this.ep) {
              moves.push(encode(sq, t, 0, FLAG_CAP | FLAG_EP));
            }
          }
        } else if (type === KNIGHT || type === KING) {
          const offs = type === KNIGHT ? N_OFF : K_OFF;
          for (let i = 0; i < 8; i++) {
            const t = sq + offs[i];
            if (t & 0x88) continue;
            const q = b[t];
            if (q * side > 0) continue;
            if (q) moves.push(encode(sq, t, 0, FLAG_CAP));
            else if (!capturesOnly) moves.push(encode(sq, t, 0, 0));
          }
        } else {
          const offs = type === BISHOP ? B_OFF : type === ROOK ? R_OFF : K_OFF;
          for (let i = 0; i < offs.length; i++) {
            const d = offs[i];
            let t = sq + d;
            while (!(t & 0x88)) {
              const q = b[t];
              if (q) { if (q * side < 0) moves.push(encode(sq, t, 0, FLAG_CAP)); break; }
              if (!capturesOnly) moves.push(encode(sq, t, 0, 0));
              t += d;
            }
          }
        }
      }
      if (!capturesOnly) {
        const c = this.castling;
        if (side === W) {
          if ((c & 1) && !b[5] && !b[6] && b[7] === ROOK && !this.attacked(4, B) && !this.attacked(5, B) && !this.attacked(6, B))
            moves.push(encode(4, 6, 0, FLAG_CASTLE));
          if ((c & 2) && !b[3] && !b[2] && !b[1] && b[0] === ROOK && !this.attacked(4, B) && !this.attacked(3, B) && !this.attacked(2, B))
            moves.push(encode(4, 2, 0, FLAG_CASTLE));
        } else {
          if ((c & 4) && !b[117] && !b[118] && b[119] === -ROOK && !this.attacked(116, W) && !this.attacked(117, W) && !this.attacked(118, W))
            moves.push(encode(116, 118, 0, FLAG_CASTLE));
          if ((c & 8) && !b[115] && !b[114] && !b[113] && b[112] === -ROOK && !this.attacked(116, W) && !this.attacked(115, W) && !this.attacked(114, W))
            moves.push(encode(116, 114, 0, FLAG_CASTLE));
        }
      }
      return moves;
    }

    // Jalankan langkah. Mengembalikan false (dan membatalkan) jika langkah ilegal.
    make(m) {
      const b = this.board, side = this.turn;
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = m >> 17;
      const p = b[from];
      let cap = b[to], capSq = to;
      if (flags & FLAG_EP) { capSq = to - 16 * side; cap = b[capSq]; }
      this.undo.push({ m, cap, capSq, castling: this.castling, ep: this.ep, half: this.half, lo: this.lo, hi: this.hi });

      let lo = this.lo, hi = this.hi, k;
      k = (p + 6) * 128 + from; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
      if (cap) { k = (cap + 6) * 128 + capSq; lo ^= ZP_LO[k]; hi ^= ZP_HI[k]; b[capSq] = 0; }
      const placed = promo ? promo * side : p;
      b[from] = 0; b[to] = placed;
      k = (placed + 6) * 128 + to; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];

      if (flags & FLAG_CASTLE) {
        let rf, rt;
        if (to === from + 2) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        const r = b[rf];
        b[rt] = r; b[rf] = 0;
        k = (r + 6) * 128 + rf; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
        k = (r + 6) * 128 + rt; lo ^= ZP_LO[k]; hi ^= ZP_HI[k];
      }
      if (p === KING) this.kW = to; else if (p === -KING) this.kB = to;

      const nc = this.castling & CASTLE_MASK[from] & CASTLE_MASK[to];
      if (nc !== this.castling) { lo ^= ZC_LO[this.castling] ^ ZC_LO[nc]; hi ^= ZC_HI[this.castling] ^ ZC_HI[nc]; this.castling = nc; }
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      this.ep = (flags & FLAG_DOUBLE) ? from + 16 * side : -1;
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }

      this.half = (p * side === PAWN || cap) ? 0 : this.half + 1;
      if (side === B) this.full++;
      this.turn = -side;
      lo ^= ZT_LO; hi ^= ZT_HI;
      this.lo = lo >>> 0; this.hi = hi >>> 0;
      this.hLo.push(this.lo); this.hHi.push(this.hi);

      if (this.attacked(side === W ? this.kW : this.kB, -side)) { this.unmake(); return false; }
      return true;
    }

    unmake() {
      const u = this.undo.pop();
      const b = this.board;
      const m = u.m;
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = m >> 17;
      this.turn = -this.turn;
      const side = this.turn;
      const placed = b[to];
      const p = promo ? PAWN * side : placed;
      b[from] = p; b[to] = 0;
      if (u.cap) b[u.capSq] = u.cap;
      if (flags & FLAG_CASTLE) {
        let rf, rt;
        if (to === from + 2) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        b[rf] = b[rt]; b[rt] = 0;
      }
      if (p === KING) this.kW = from; else if (p === -KING) this.kB = from;
      if (side === B) this.full--;
      this.castling = u.castling; this.ep = u.ep; this.half = u.half;
      this.lo = u.lo; this.hi = u.hi;
      this.hLo.pop(); this.hHi.pop();
    }

    makeNull() {
      this.undo.push({ m: -1, castling: this.castling, ep: this.ep, half: this.half, lo: this.lo, hi: this.hi });
      let lo = this.lo ^ ZT_LO, hi = this.hi ^ ZT_HI;
      if (this.ep >= 0) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      this.ep = -1; this.half++;
      this.turn = -this.turn;
      this.lo = lo >>> 0; this.hi = hi >>> 0;
      this.hLo.push(this.lo); this.hHi.push(this.hi);
    }

    unmakeNull() {
      const u = this.undo.pop();
      this.turn = -this.turn;
      this.ep = u.ep; this.half = u.half; this.lo = u.lo; this.hi = u.hi;
      this.hLo.pop(); this.hHi.pop();
    }

    legalMoves() {
      const out = [];
      for (const m of this.genMoves()) { if (this.make(m)) { this.unmake(); out.push(m); } }
      return out;
    }

    // Berapa kali posisi saat ini sudah muncul (dalam rentang langkah yang bisa diulang)
    repetitions() {
      const n = this.hLo.length - 1;
      let count = 1;
      for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) {
        if (this.hLo[i] === this.lo && this.hHi[i] === this.hi) count++;
      }
      return count;
    }

    insufficientMaterial() {
      const b = this.board;
      let minors = 0, bishopColors = [], other = false;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const t = Math.abs(b[sq]);
        if (!t || t === KING) continue;
        if (t === KNIGHT) minors++;
        else if (t === BISHOP) { minors++; bishopColors.push(((sq >> 4) + (sq & 7)) & 1); }
        else { other = true; break; }
      }
      if (other) return false;
      if (minors <= 1) return true;
      return bishopColors.length === minors && bishopColors.every(c => c === bishopColors[0]);
    }

    status() {
      const moves = this.legalMoves();
      if (!moves.length) {
        if (this.inCheck()) return { over: true, result: this.turn === W ? '0-1' : '1-0', reason: 'skakmat' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      if (this.insufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'material' };
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: '50langkah' };
      if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetisi' };
      return { over: false };
    }

    san(m, legal) {
      const b = this.board;
      const from = mFrom(m), to = mTo(m), promo = mPromo(m), flags = mFlags(m);
      const type = Math.abs(b[from]);
      let s;
      if (flags & FLAG_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
      else {
        s = '';
        if (type === PAWN) {
          if (flags & FLAG_CAP) s += 'abcdefgh'[from & 7] + 'x';
          s += sqName(to);
          if (promo) s += '=' + PIECE_CHARS[promo].toUpperCase();
        } else {
          s += PIECE_CHARS[type].toUpperCase();
          const rivals = (legal || this.legalMoves()).filter(o => o !== m && mTo(o) === to && Math.abs(b[mFrom(o)]) === type);
          if (rivals.length) {
            const sameFile = rivals.some(o => (mFrom(o) & 7) === (from & 7));
            const sameRank = rivals.some(o => (mFrom(o) >> 4) === (from >> 4));
            if (!sameFile) s += 'abcdefgh'[from & 7];
            else if (!sameRank) s += (from >> 4) + 1;
            else s += sqName(from);
          }
          if (flags & FLAG_CAP) s += 'x';
          s += sqName(to);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
      this.unmake();
      return s;
    }

    toUci(m) {
      const promo = mPromo(m);
      return sqName(mFrom(m)) + sqName(mTo(m)) + (promo ? PIECE_CHARS[promo] : '');
    }

    moveFromUci(uci) {
      if (!uci || uci.length < 4) return 0;
      const from = parseSq(uci.slice(0, 2)), to = parseSq(uci.slice(2, 4));
      const promo = uci[4] ? PIECE_CHARS.indexOf(uci[4]) : 0;
      return this.legalMoves().find(m => mFrom(m) === from && mTo(m) === to && mPromo(m) === promo) || 0;
    }
  }

  return {
    W, B, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    FLAG_CAP, FLAG_EP, FLAG_CASTLE, FLAG_DOUBLE, START_FEN,
    mFrom, mTo, mPromo, mFlags, sqName, parseSq, Position,
  };
}
