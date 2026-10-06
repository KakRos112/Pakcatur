// Mesin catur bawaan: alpha-beta + quiescence + transposition table.
// Dipakai untuk bot level rendah, dan sebagai cadangan jika Stockfish gagal dimuat.
function CaturAI(core) {
  'use strict';
  const { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, W, FLAG_CAP, mFrom, mTo, mPromo, mFlags } = core;
  const INF = 100000, MATE = 30000;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const VAL_EG = [0, 120, 300, 320, 520, 920, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];

  // Tabel posisi dari sudut pandang putih, baris pertama = rank 8
  const PST = [[],
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ];
  const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const PASSED = [0, 5, 10, 20, 35, 60, 100, 0];

  // Skor dari sudut pandang pihak yang melangkah
  function evaluate(pos) {
    const b = pos.board;
    let mg = 0, eg = 0, phase = 0;
    const pawnsW = new Uint8Array(8), pawnsB = new Uint8Array(8);
    let bishopsW = 0, bishopsB = 0, matW = 0, matB = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const t = p > 0 ? p : -p;
      const r = sq >> 4, f = sq & 7;
      const idx = p > 0 ? (7 - r) * 8 + f : r * 8 + f;
      phase += PHASE[t];
      let m, e;
      if (t === KING) { m = PST[KING][idx]; e = KING_EG[idx]; }
      else { m = VAL[t] + PST[t][idx]; e = VAL_EG[t] + PST[t][idx]; }
      if (p > 0) { mg += m; eg += e; } else { mg -= m; eg -= e; }
      if (t === PAWN) { if (p > 0) pawnsW[f] |= 1 << r; else pawnsB[f] |= 1 << r; }
      else if (t === BISHOP) { if (p > 0) bishopsW++; else bishopsB++; }
      if (t !== KING && t !== PAWN) { if (p > 0) matW += VAL[t]; else matB += VAL[t]; }
    }
    if (bishopsW >= 2) { mg += 30; eg += 50; }
    if (bishopsB >= 2) { mg -= 30; eg -= 50; }

    // Struktur pion: bidak ganda, terisolasi, bebas
    for (let f = 0; f < 8; f++) {
      const w = pawnsW[f], bl = pawnsB[f];
      if (w) {
        const cnt = popcount(w);
        if (cnt > 1) { mg -= 10 * (cnt - 1); eg -= 20 * (cnt - 1); }
        if (!(f > 0 && pawnsW[f - 1]) && !(f < 7 && pawnsW[f + 1])) { mg -= 12 * cnt; eg -= 15 * cnt; }
        const r = 31 - Math.clz32(w); // pion putih paling depan
        const ahead = 0xff & ~((2 << r) - 1);
        if (!(bl & ahead) && !(f > 0 && (pawnsB[f - 1] & ahead)) && !(f < 7 && (pawnsB[f + 1] & ahead))) {
          mg += PASSED[r] >> 1; eg += PASSED[r];
        }
      }
      if (bl) {
        const cnt = popcount(bl);
        if (cnt > 1) { mg += 10 * (cnt - 1); eg += 20 * (cnt - 1); }
        if (!(f > 0 && pawnsB[f - 1]) && !(f < 7 && pawnsB[f + 1])) { mg += 12 * cnt; eg += 15 * cnt; }
        const r = 31 - Math.clz32(bl & -bl); // pion hitam paling depan (rank terendah)
        const ahead = (1 << r) - 1;
        if (!(w & ahead) && !(f > 0 && (pawnsW[f - 1] & ahead)) && !(f < 7 && (pawnsW[f + 1] & ahead))) {
          mg -= PASSED[7 - r] >> 1; eg -= PASSED[7 - r];
        }
      }
    }

    // Akhir permainan tanpa pion: dorong raja lawan ke tepi agar bisa skakmat
    let mop = 0;
    const totalPawns = pawnsW.some(x => x) || pawnsB.some(x => x);
    if (!totalPawns || phase <= 6) {
      const diff = matW - matB;
      if (Math.abs(diff) >= 300) {
        const strongK = diff > 0 ? pos.kW : pos.kB, weakK = diff > 0 ? pos.kB : pos.kW;
        const wr = weakK >> 4, wf = weakK & 7;
        const centerDist = Math.max(3 - wr, wr - 4) + Math.max(3 - wf, wf - 4);
        const kd = Math.abs((strongK >> 4) - wr) + Math.abs((strongK & 7) - wf);
        mop = (10 * centerDist + 4 * (14 - kd)) * (diff > 0 ? 1 : -1);
      }
    }

    if (phase > 24) phase = 24;
    const score = ((mg * phase + eg * (24 - phase)) / 24 | 0) + mop + 10 * pos.turn; // tempo
    return score * pos.turn;
  }

  function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

  // Transposition table
  const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Uint32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE);
  const ttScore = new Int32Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
  const EXACT = 1, LOWER = 2, UPPER = 3;

  const killers = [];
  for (let i = 0; i < 128; i++) killers.push([0, 0]);
  const history = new Int32Array(13 * 128);

  let nodes = 0, deadline = 0, stopped = false;

  function timeUp() {
    if ((++nodes & 2047) === 0 && Date.now() > deadline) stopped = true;
    return stopped;
  }

  function scoreMoves(pos, moves, ttM, ply) {
    const b = pos.board;
    const scores = new Int32Array(moves.length);
    const k = killers[ply] || [0, 0];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttM) scores[i] = 1e7;
      else if (mFlags(m) & FLAG_CAP) {
        const victim = Math.abs(b[mTo(m)]) || PAWN;
        scores[i] = 1e6 + VAL[victim] * 10 - VAL[Math.abs(b[mFrom(m)])] / 10;
      } else if (mPromo(m)) scores[i] = 9e5 + VAL[mPromo(m)];
      else if (m === k[0]) scores[i] = 8e5;
      else if (m === k[1]) scores[i] = 7e5;
      else scores[i] = history[(b[mFrom(m)] + 6) * 128 + mTo(m)];
    }
    return scores;
  }

  function pickNext(moves, scores, i) {
    let best = i;
    for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[best]) best = j;
    if (best !== i) {
      const tm = moves[i]; moves[i] = moves[best]; moves[best] = tm;
      const ts = scores[i]; scores[i] = scores[best]; scores[best] = ts;
    }
    return moves[i];
  }

  function quiesce(pos, alpha, beta, ply) {
    if (timeUp()) return 0;
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const moves = pos.genMoves(true);
    const scores = scoreMoves(pos, moves, 0, ply);
    for (let i = 0; i < moves.length; i++) {
      const m = pickNext(moves, scores, i);
      // Delta pruning: tangkapan yang tidak mungkin menaikkan alpha
      const victim = Math.abs(pos.board[mTo(m)]) || PAWN;
      if (!mPromo(m) && stand + VAL[victim] + 200 < alpha) continue;
      if (!pos.make(m)) continue;
      const s = -quiesce(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (stopped) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function hasNonPawn(pos) {
    const b = pos.board, side = pos.turn;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const t = b[sq] * side;
      if (t > PAWN && t < KING) return true;
    }
    return false;
  }

  function negamax(pos, depth, alpha, beta, ply, allowNull) {
    if (timeUp()) return 0;
    if (ply > 0) {
      if (pos.half >= 100 || pos.repetitions() >= 2) return 0;
      // Jarak skakmat: tidak perlu cari lebih jauh kalau sudah ada mat lebih cepat
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply);
      if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return quiesce(pos, alpha, beta, ply);

    const idx = pos.lo & TT_MASK;
    let ttM = 0;
    if (ttKey[idx] === pos.hi) {
      ttM = ttMove[idx];
      if (ply > 0 && ttDepth[idx] >= depth) {
        let s = ttScore[idx];
        if (s > MATE - 1000) s -= ply; else if (s < -MATE + 1000) s += ply;
        const fl = ttFlag[idx];
        if (fl === EXACT || (fl === LOWER && s >= beta) || (fl === UPPER && s <= alpha)) return s;
      }
    }

    const pvNode = beta - alpha > 1;
    if (!pvNode && !inCheck && allowNull && depth >= 3 && hasNonPawn(pos) && evaluate(pos) >= beta) {
      pos.makeNull();
      const s = -negamax(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (stopped) return 0;
      if (s >= beta) return beta;
    }

    const moves = pos.genMoves();
    const scores = scoreMoves(pos, moves, ttM, ply);
    const alphaOrig = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = pickNext(moves, scores, i);
      if (!pos.make(m)) continue;
      legal++;
      const quiet = !(mFlags(m) & FLAG_CAP) && !mPromo(m);
      let s;
      if (legal === 1) {
        s = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let r = 0;
        if (quiet && depth >= 3 && legal > 3 && !inCheck && !pos.inCheck()) r = legal > 8 ? 2 : 1;
        s = -negamax(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && (r || s < beta)) s = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (stopped) return 0;
      if (s > best) { best = s; bestMove = m; }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (quiet) {
          const k = killers[ply];
          if (k && k[0] !== m) { k[1] = k[0]; k[0] = m; }
          const hi = (pos.board[mFrom(m)] + 6) * 128 + mTo(m);
          history[hi] = Math.min(history[hi] + depth * depth, 6e5);
        }
        break;
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;

    let store = best;
    if (store > MATE - 1000) store += ply; else if (store < -MATE + 1000) store -= ply;
    ttKey[idx] = pos.hi; ttMove[idx] = bestMove; ttScore[idx] = store; ttDepth[idx] = depth;
    ttFlag[idx] = best <= alphaOrig ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  function gaussian() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // opts: { depth, timeMs, noise (cp), randomP (0..1) }
  function search(pos, opts) {
    const legal = pos.legalMoves();
    if (!legal.length) return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0 };
    nodes = 0; stopped = false;
    deadline = Date.now() + (opts.timeMs || 60000);
    history.fill(0);
    for (const k of killers) { k[0] = 0; k[1] = 0; }

    // Bot lemah: sesekali melangkah asal
    if (opts.randomP && Math.random() < opts.randomP) {
      const m = legal[Math.random() * legal.length | 0];
      return { move: m, score: evaluate(pos), depth: 0 };
    }

    // Bot lemah: nilai setiap langkah lalu tambahkan "salah hitung" acak
    if (opts.noise) {
      const d = Math.max(1, opts.depth || 2);
      let bestM = legal[0], bestNoisy = -INF, bestReal = -INF;
      deadline = Date.now() + 60000;
      for (const m of legal) {
        pos.make(m);
        const s = -negamax(pos, d - 1, -INF, INF, 1, true);
        pos.unmake();
        const noisy = s + gaussian() * opts.noise;
        if (noisy > bestNoisy) { bestNoisy = noisy; bestM = m; bestReal = s; }
      }
      return { move: bestM, score: bestReal, depth: d };
    }

    let bestMove = legal[0], bestScore = 0, done = 0;
    const maxDepth = opts.depth || 64;
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INF, beta = INF, iterBest = 0, iterScore = -INF;
      const idx = pos.lo & TT_MASK;
      const ttM = ttKey[idx] === pos.hi ? ttMove[idx] : 0;
      const moves = legal.slice();
      const scores = scoreMoves(pos, moves, ttM || bestMove, 0);
      for (let i = 0; i < moves.length; i++) {
        const m = pickNext(moves, scores, i);
        pos.make(m);
        let s;
        if (i === 0) s = -negamax(pos, depth - 1, -beta, -alpha, 1, true);
        else {
          s = -negamax(pos, depth - 1, -alpha - 1, -alpha, 1, true);
          if (!stopped && s > alpha) s = -negamax(pos, depth - 1, -beta, -alpha, 1, true);
        }
        pos.unmake();
        if (stopped) break;
        if (s > iterScore) { iterScore = s; iterBest = m; }
        if (s > alpha) alpha = s;
      }
      if (stopped) {
        // Iterasi belum tuntas: pakai hasil parsial hanya jika langkah terbaiknya sudah dicari penuh
        if (iterBest && iterScore > bestScore) { bestMove = iterBest; bestScore = iterScore; }
        break;
      }
      bestMove = iterBest; bestScore = iterScore; done = depth;
      ttKey[idx] = pos.hi; ttMove[idx] = bestMove; ttScore[idx] = bestScore; ttDepth[idx] = depth; ttFlag[idx] = EXACT;
      if (Math.abs(bestScore) > MATE - 1000) break;
      if (Date.now() > deadline - (opts.timeMs || 0) * 0.45 && !opts.depth) break; // iterasi berikutnya pasti tidak selesai
    }
    return { move: bestMove, score: bestScore, depth: done };
  }

  function mateIn(score) {
    if (score > MATE - 1000) return Math.ceil((MATE - score) / 2);
    if (score < -MATE + 1000) return -Math.ceil((MATE + score) / 2);
    return 0;
  }

  return { search, evaluate, mateIn, MATE };
}
