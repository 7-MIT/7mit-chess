/* Engine catur lengkap: gerakan legal, rokade, en passant, promosi, SAN, FEN, akhir permainan. */
(function (root) {
  'use strict';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const DG = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const ST = [[-1,0],[1,0],[0,-1],[0,1]];

  const isWhite = p => p !== '' && p === p.toUpperCase();
  const colorOf = p => p === '' ? null : (isWhite(p) ? 'w' : 'b');
  const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));
  const sqIndex = s => (8 - parseInt(s[1], 10)) * 8 + 'abcdefgh'.indexOf(s[0]);

  class Position {
    constructor(fen) { this.load(fen || START_FEN); }
    load(fen) {
      const f = fen.trim().split(/\s+/);
      this.b = new Array(64).fill('');
      let i = 0;
      for (const ch of f[0]) {
        if (ch === '/') continue;
        if (/\d/.test(ch)) i += +ch; else this.b[i++] = ch;
      }
      this.turn = f[1] || 'w';
      this.castle = f[2] && f[2] !== '-' ? f[2] : '';
      this.ep = f[3] && f[3] !== '-' ? sqIndex(f[3]) : -1;
      this.half = +(f[4] || 0);
      this.full = +(f[5] || 1);
      this.stack = [];
    }
    fen() {
      let s = '';
      for (let r = 0; r < 8; r++) {
        let e = 0;
        for (let c = 0; c < 8; c++) {
          const p = this.b[r * 8 + c];
          if (!p) e++; else { if (e) { s += e; e = 0; } s += p; }
        }
        if (e) s += e;
        if (r < 7) s += '/';
      }
      return `${s} ${this.turn} ${this.castle || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }
    key() { return this.fen().split(' ').slice(0, 4).join(' '); }

    findKing(c) { const k = c === 'w' ? 'K' : 'k'; return this.b.indexOf(k); }

    attacked(sq, by) {
      const b = this.b, r = sq >> 3, c = sq & 7, w = by === 'w';
      // pawns
      const pr = r + (w ? 1 : -1), pc = w ? 'P' : 'p';
      if (pr >= 0 && pr < 8) {
        if (c > 0 && b[pr * 8 + c - 1] === pc) return true;
        if (c < 7 && b[pr * 8 + c + 1] === pc) return true;
      }
      const kn = w ? 'N' : 'n', kg = w ? 'K' : 'k';
      for (const [dr, dc] of KN) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === kn) return true;
      }
      for (const [dr, dc] of KG) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === kg) return true;
      }
      const B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
      for (const [dr, dc] of DG) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const p = b[rr * 8 + cc];
          if (p) { if (p === B || p === Q) return true; break; }
          rr += dr; cc += dc;
        }
      }
      for (const [dr, dc] of ST) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const p = b[rr * 8 + cc];
          if (p) { if (p === R || p === Q) return true; break; }
          rr += dr; cc += dc;
        }
      }
      return false;
    }
    inCheck(c) { c = c || this.turn; return this.attacked(this.findKing(c), c === 'w' ? 'b' : 'w'); }

    pseudo(capturesOnly) {
      const out = [], b = this.b, t = this.turn, w = t === 'w';
      const add = (from, to, extra) => out.push(Object.assign({ from, to, piece: b[from], captured: b[to] || '' }, extra));
      for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || isWhite(p) !== w) continue;
        const r = i >> 3, c = i & 7, u = p.toUpperCase();
        if (u === 'P') {
          const dir = w ? -1 : 1, startRow = w ? 6 : 1, lastRow = w ? 0 : 7;
          const r1 = r + dir;
          if (r1 < 0 || r1 > 7) continue;
          const pushMove = (to, extra) => {
            if (r1 === lastRow) for (const pr of 'QRBN') add(i, to, Object.assign({ promo: w ? pr : pr.toLowerCase() }, extra));
            else add(i, to, extra);
          };
          if (!capturesOnly || r1 === lastRow) {
            if (!b[r1 * 8 + c]) {
              pushMove(r1 * 8 + c);
              if (!capturesOnly && r === startRow && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c, { dbl: true });
            }
          }
          for (const dc of [-1, 1]) {
            const cc = c + dc;
            if (cc < 0 || cc > 7) continue;
            const to = r1 * 8 + cc, tp = b[to];
            if (tp && isWhite(tp) !== w) pushMove(to);
            else if (to === this.ep) add(i, to, { enpassant: true, captured: w ? 'p' : 'P' });
          }
        } else if (u === 'N' || u === 'K') {
          for (const [dr, dc] of (u === 'N' ? KN : KG)) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
            const to = rr * 8 + cc, tp = b[to];
            if (tp && isWhite(tp) === w) continue;
            if (capturesOnly && !tp) continue;
            add(i, to);
          }
          if (u === 'K' && !capturesOnly) {
            const home = w ? 60 : 4;
            if (i === home && !this.inCheck(t)) {
              const en = w ? 'w' : 'b', opp = w ? 'b' : 'w';
              const ks = w ? 'K' : 'k', qs = w ? 'Q' : 'q', rk = w ? 'R' : 'r';
              if (this.castle.includes(ks) && !b[home + 1] && !b[home + 2] && b[home + 3] === rk &&
                  !this.attacked(home + 1, opp) && !this.attacked(home + 2, opp))
                add(i, home + 2, { castle: 'K' });
              if (this.castle.includes(qs) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rk &&
                  !this.attacked(home - 1, opp) && !this.attacked(home - 2, opp))
                add(i, home - 2, { castle: 'Q' });
            }
          }
        } else {
          const dirs = u === 'B' ? DG : u === 'R' ? ST : DG.concat(ST);
          for (const [dr, dc] of dirs) {
            let rr = r + dr, cc = c + dc;
            while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
              const to = rr * 8 + cc, tp = b[to];
              if (tp) { if (isWhite(tp) !== w) add(i, to); break; }
              if (!capturesOnly) add(i, to);
              rr += dr; cc += dc;
            }
          }
        }
      }
      return out;
    }

    make(m) {
      const b = this.b, w = this.turn === 'w';
      this.stack.push({ castle: this.castle, ep: this.ep, half: this.half, full: this.full });
      const p = b[m.from];
      b[m.to] = m.promo || p;
      b[m.from] = '';
      if (m.enpassant) b[m.to + (w ? 8 : -8)] = '';
      if (m.castle) {
        const home = m.from;
        if (m.castle === 'K') { b[home + 1] = b[home + 3]; b[home + 3] = ''; }
        else { b[home - 1] = b[home - 4]; b[home - 4] = ''; }
      }
      // hak rokade
      let cs = this.castle;
      const strip = s => { cs = cs.replace(s, ''); };
      if (p === 'K') { strip('K'); strip('Q'); }
      if (p === 'k') { strip('k'); strip('q'); }
      for (const sq of [m.from, m.to]) {
        if (sq === 63) strip('K'); if (sq === 56) strip('Q');
        if (sq === 7) strip('k'); if (sq === 0) strip('q');
      }
      this.castle = cs;
      this.ep = m.dbl ? (m.from + m.to) / 2 : -1;
      this.half = (p.toUpperCase() === 'P' || m.captured) ? 0 : this.half + 1;
      if (!w) this.full++;
      this.turn = w ? 'b' : 'w';
    }
    undo(m) {
      const s = this.stack.pop(), b = this.b;
      this.turn = this.turn === 'w' ? 'b' : 'w';
      const w = this.turn === 'w';
      this.castle = s.castle; this.ep = s.ep; this.half = s.half; this.full = s.full;
      b[m.from] = m.piece;
      b[m.to] = m.enpassant ? '' : m.captured;
      if (m.enpassant) b[m.to + (w ? 8 : -8)] = m.captured;
      if (m.castle) {
        const home = m.from;
        if (m.castle === 'K') { b[home + 3] = b[home + 1]; b[home + 1] = ''; }
        else { b[home - 4] = b[home - 1]; b[home - 1] = ''; }
      }
    }
    legal(capturesOnly) {
      const out = [], me = this.turn;
      for (const m of this.pseudo(capturesOnly)) {
        this.make(m);
        const bad = this.attacked(this.findKing(me), this.turn);
        this.undo(m);
        if (!bad) out.push(m);
      }
      return out;
    }
    insufficient() {
      const minors = [];
      for (let i = 0; i < 64; i++) {
        const p = this.b[i];
        if (!p) continue;
        const u = p.toUpperCase();
        if (u === 'K') continue;
        if (u === 'P' || u === 'R' || u === 'Q') return false;
        minors.push({ u, sq: (i >> 3) + (i & 7) & 1, w: isWhite(p) });
      }
      if (minors.length <= 1) return true;
      if (minors.every(m => m.u === 'B') && minors.every(m => m.sq === minors[0].sq)) return true;
      return false;
    }
  }

  class Game {
    constructor(fen) {
      this.pos = new Position(fen);
      this.start = this.pos.fen();
      this.history = [];            // {move, san}
      this.keys = [this.pos.key()];
    }
    get turn() { return this.pos.turn; }
    fen() { return this.pos.fen(); }
    board() { return this.pos.b; }
    inCheck() { return this.pos.inCheck(); }
    legalMoves() { return this.pos.legal(); }
    movesFrom(sq) { return this.pos.legal().filter(m => m.from === sq); }
    findMove(from, to, promo) {
      return this.pos.legal().find(m => m.from === from && m.to === to &&
        (!m.promo || m.promo.toUpperCase() === (promo || 'Q').toUpperCase()));
    }
    san(m) {
      const pos = this.pos, u = m.piece.toUpperCase();
      let s;
      if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O';
      else {
        s = '';
        if (u === 'P') { if (m.captured) s += 'abcdefgh'[m.from & 7]; }
        else {
          s += u;
          const others = pos.legal().filter(o => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          if (others.length) {
            if (!others.some(o => (o.from & 7) === (m.from & 7))) s += 'abcdefgh'[m.from & 7];
            else if (!others.some(o => (o.from >> 3) === (m.from >> 3))) s += 8 - (m.from >> 3);
            else s += sqName(m.from);
          }
        }
        if (m.captured) s += 'x';
        s += sqName(m.to);
        if (m.promo) s += '=' + m.promo.toUpperCase();
      }
      pos.make(m);
      if (pos.inCheck()) s += pos.legal().length ? '+' : '#';
      pos.undo(m);
      return s;
    }
    play(m) {
      const san = this.san(m);
      this.pos.make(m);
      this.history.push({ move: m, san });
      this.keys.push(this.pos.key());
      return san;
    }
    undo() {
      const h = this.history.pop();
      if (!h) return null;
      this.pos.undo(h.move);
      this.keys.pop();
      return h;
    }
    // { over, result: '1-0'|'0-1'|'1/2-1/2'|null, reason }
    status() {
      const pos = this.pos;
      if (!pos.legal().length) {
        if (pos.inCheck()) return { over: true, result: pos.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      if (pos.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
      if (pos.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
      const k = this.keys[this.keys.length - 1];
      if (this.keys.filter(x => x === k).length >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
      return { over: false, result: null, reason: null };
    }
    lastMove() { const h = this.history[this.history.length - 1]; return h ? h.move : null; }
  }

  function perft(pos, d) {
    if (d === 0) return 1;
    let n = 0;
    for (const m of pos.legal()) { pos.make(m); n += perft(pos, d - 1); pos.undo(m); }
    return n;
  }

  const api = { Position, Game, START_FEN, sqName, sqIndex, isWhite, colorOf, perft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Chess = api;
})(typeof self !== 'undefined' ? self : this);
