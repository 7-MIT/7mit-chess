/* AI catur: negamax + alpha-beta + quiescence + iterative deepening (dengan batas waktu). */
(function (root) {
  'use strict';
  const C = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./chess.js') : root.Chess;
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  // tabel posisi dari sisi putih, indeks 0 = a8
  const PST = {
    P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
        0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    KE: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
         -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
  };

  function evaluate(pos) { // dari sudut pandang sisi yang jalan
    const b = pos.b;
    let mat = 0, nonPawn = 0;
    for (let i = 0; i < 64; i++) { const p = b[i]; if (p) { const u = p.toUpperCase(); if (u !== 'P' && u !== 'K') nonPawn += VAL[u]; } }
    const endgame = nonPawn <= 2600;
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const w = p === p.toUpperCase(), u = p.toUpperCase();
      const tbl = u === 'K' && endgame ? PST.KE : PST[u];
      const v = VAL[u] + tbl[w ? i : i ^ 56];
      s += w ? v : -v;
    }
    return pos.turn === 'w' ? s : -s;
  }

  const MATE = 100000;
  function search(pos, opts) {
    const deadline = Date.now() + opts.time, maxDepth = opts.depth;
    let nodes = 0, aborted = false;
    const order = (moves, first) => {
      for (const m of moves) {
        let sc = 0;
        if (first && m.from === first.from && m.to === first.to && m.promo === first.promo) sc = 1e6;
        else {
          if (m.captured) sc = 10 * VAL[m.captured.toUpperCase()] - VAL[m.piece.toUpperCase()] + 1000;
          if (m.promo) sc += 800;
        }
        m.s = sc;
      }
      moves.sort((a, b) => b.s - a.s);
    };
    function qs(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) aborted = true;
      if (aborted) return 0;
      const stand = evaluate(pos);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 8) return alpha;
      const ms = pos.legal(true); order(ms);
      for (const m of ms) {
        pos.make(m);
        const sc = -qs(-beta, -alpha, ply + 1);
        pos.undo(m);
        if (aborted) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    function nm(d, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) aborted = true;
      if (aborted) return 0;
      if (pos.half >= 100) return 0;
      const ms = pos.legal();
      if (!ms.length) return pos.inCheck() ? -MATE + ply : 0;
      if (d <= 0) return qs(alpha, beta, 0);
      order(ms);
      for (const m of ms) {
        pos.make(m);
        const sc = -nm(d - 1, -beta, -alpha, ply + 1);
        pos.undo(m);
        if (aborted) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    const root = pos.legal();
    if (!root.length) return null;
    let best = root[Math.floor(Math.random() * root.length)];
    if (opts.random) return best;
    let bestScore = -Infinity;
    for (let d = 1; d <= maxDepth; d++) {
      order(root, best);
      let alpha = -Infinity, cur = null, curScore = -Infinity;
      const scores = [];
      for (const m of root) {
        pos.make(m);
        const sc = -nm(d - 1, -Infinity, Infinity, 1) + (opts.noise ? (Math.random() - 0.5) * opts.noise : 0);
        pos.undo(m);
        if (aborted) break;
        if (sc > curScore) { curScore = sc; cur = m; }
      }
      if (aborted) break;
      best = cur; bestScore = curScore;
      if (Math.abs(bestScore) > MATE - 100) break;
    }
    return best;
  }

  const LEVELS = {
    1: { depth: 1, time: 200, noise: 160, random: false },
    2: { depth: 2, time: 400, noise: 60 },
    3: { depth: 3, time: 900, noise: 15 },
    4: { depth: 5, time: 1800, noise: 0 }
  };
  function bestMove(game, level) {
    const opts = LEVELS[level] || LEVELS[2];
    const pos = new C.Position(game.fen());
    return search(pos, opts);
  }

  const api = { bestMove, evaluate, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChessAI = api;
})(typeof self !== 'undefined' ? self : this);
