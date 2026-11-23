(function () {
  'use strict';
  const { Game, sqName, sqIndex, isWhite } = Chess;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const glyph = p => GLYPH[p.toUpperCase()] + '︎';
  const LEVEL_NAME = { 1: 'Pemula', 2: 'Mudah', 3: 'Sedang', 4: 'Sulit' };
  const REASON = {
    checkmate: 'Skakmat', stalemate: 'Stalemate', insufficient: 'Material tidak cukup', fifty: 'Aturan 50 langkah',
    repetition: 'Pengulangan posisi 3x', resign: 'Menyerah', left: 'Lawan meninggalkan game',
    'draw-agreed': 'Remis disepakati', abandon: 'Lawan terputus', timeout: 'Waktu habis'
  };

  const S = {
    mode: null, game: null, my: 'w', flip: false, level: 2, sel: -1, hints: [],
    thinking: false, aiToken: 0, over: false,
    net: null // {id, room, pending, busy, fails, timer, offlineSince, endShown}
  };
  const opt = { level: '2', color: 'w', ocolor: 'r', tc: '300,0' };
  const tcOf = () => opt.tc.split(',').map(Number);
  const tcLabel = r => r.tc_base ? `${r.tc_base / 60}|${r.tc_inc}` : 'tanpa jam';

  /* ---------- util ---------- */
  function show(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name === 'online') startLobby(); else stopLobby();
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2800); }
  function modal(build) {
    const box = $('#modal-box'); box.textContent = '';
    build(box); $('#modal').classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn) { const b = el('button', cls, text); b.onclick = fn; return b; }
  function getName() {
    let n = ($('#inp-name').value || '').trim();
    if (!n) n = 'Pemain' + Math.floor(100 + Math.random() * 900);
    $('#inp-name').value = n; ChessNet.store('chess7_name', n); return n;
  }

  /* ---------- papan ---------- */
  const boardEl = $('#board');
  const squares = [];
  for (let i = 0; i < 64; i++) { const d = el('div', 'sq'); d.onclick = () => onSquare(d._idx); boardEl.appendChild(d); squares.push(d); }

  function bottomColor() { return S.mode === 'local' ? (S.flip ? 'b' : 'w') : (S.flip ? (S.my === 'w' ? 'b' : 'w') : S.my); }

  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sqEl = idx => squares.find(s => s._idx === idx);
  function slide(from, to) {
    const a = sqEl(from), b = sqEl(to); if (!a || !b) return;
    const pc = b.querySelector('.pc'); if (!pc) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    b.style.zIndex = 6;
    const an = pc.animate([{ transform: `translate(${ra.left - rb.left}px, ${ra.top - rb.top}px) scale(1.12)` }, { transform: 'translate(0,0) scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(.22,.9,.3,1)' });
    an.onfinish = an.oncancel = () => { b.style.zIndex = ''; };
  }
  function animateMove(m) {
    slide(m.from, m.to);
    if (m.castle) m.castle === 'K' ? slide(m.from + 3, m.from + 1) : slide(m.from - 4, m.from - 1);
    if (m.captured) {
      const at = sqEl(m.enpassant ? m.to + (isWhite(m.piece) ? 8 : -8) : m.to);
      if (at) {
        const gh = el('span', 'pc ghost ' + (isWhite(m.captured) ? 'w' : 'b'), glyph(m.captured));
        at.appendChild(gh);
        gh.animate([{ opacity: 1, transform: 'scale(1) rotate(0)' }, { opacity: 0, transform: 'scale(.4) rotate(40deg)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).onfinish = () => gh.remove();
      }
    }
  }
  function confetti() {
    if (REDUCED) return;
    const box = el('div', 'confetti'); document.body.appendChild(box);
    const colors = ['#6c8cff', '#4fd1a1', '#ffd60a', '#ff6b6b', '#fff'];
    for (let i = 0; i < 70; i++) {
      const p = el('i', 'cf'); p.style.left = Math.random() * 100 + '%'; p.style.background = colors[i % colors.length];
      box.appendChild(p);
      p.animate([{ transform: 'translateY(-10vh) rotate(0)', opacity: 1 }, { transform: `translate(${(Math.random() - .5) * 200}px, 105vh) rotate(${Math.random() * 900}deg)`, opacity: .9 }],
        { duration: 1800 + Math.random() * 1600, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' });
    }
    setTimeout(() => box.remove(), 4200);
  }

  function render() {
    const g = S.game, b = g.board(), bottom = bottomColor();
    const last = g.lastMove();
    const kingSq = g.inCheck() && !S.over ? b.indexOf(g.turn === 'w' ? 'K' : 'k') : -1;
    for (let v = 0; v < 8; v++) for (let c = 0; c < 8; c++) {
      const idx = bottom === 'w' ? v * 8 + c : (7 - v) * 8 + (7 - c);
      const d = squares[v * 8 + c];
      d._idx = idx;
      d.className = 'sq ' + (((idx >> 3) + (idx & 7)) % 2 === 0 ? 'l' : 'd');
      if (last && (idx === last.from || idx === last.to)) d.classList.add('last');
      if (idx === S.sel) d.classList.add('sel');
      if (idx === kingSq) d.classList.add('chk');
      const h = S.hints.find(m => m.to === idx);
      if (h) { d.classList.add('hint'); if (b[idx] || h.enpassant) d.classList.add('cap'); }
      d.textContent = '';
      if (c === 0) { const r = el('span', 'coord r', String(8 - (idx >> 3))); d.appendChild(r); }
      if (v === 7) { const f = el('span', 'coord f', 'abcdefgh'[idx & 7]); d.appendChild(f); }
      if (b[idx]) d.appendChild(el('span', 'pc ' + (isWhite(b[idx]) ? 'w' : 'b'), glyph(b[idx])));
    }
    // ---- animasi ----
    const nHist = g.history.length;
    if (S.intro) {
      S.intro = false;
      if (!REDUCED) squares.forEach((d, i) => { const pc = d.querySelector('.pc'); if (pc) { pc.style.animation = 'drop .5s both cubic-bezier(.2,.9,.3,1.25)'; pc.style.animationDelay = (i * 9) + 'ms'; } });
    } else if (S.prevLen !== undefined && nHist === S.prevLen + 1 && last && !REDUCED) animateMove(last);
    S.prevLen = nHist;
    renderMoves(); renderPlayers(); renderStatus(); if (S.mode === 'online') renderClocks(); else $$('.clock').forEach(c => c.classList.add('hidden'));
    $('#btn-undo').disabled = S.mode === 'online' || g.history.length === 0 || S.thinking;
  }
  function renderMoves() {
    const box = $('#moves'), h = S.game.history; box.textContent = '';
    for (let i = 0; i < h.length; i += 2) {
      const row = el('div', 'mv');
      row.append(el('i', '', (i / 2 + 1) + '.'), el('span', '', h[i].san), el('span', '', h[i + 1] ? h[i + 1].san : ''));
      box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
  }
  function names() {
    if (S.mode === 'single') return { w: S.my === 'w' ? 'Kamu' : `Komputer (${LEVEL_NAME[S.level]})`, b: S.my === 'b' ? 'Kamu' : `Komputer (${LEVEL_NAME[S.level]})` };
    if (S.mode === 'local') return { w: 'Pemain Putih', b: 'Pemain Hitam' };
    const r = S.net.room;
    return { w: (r.white_name || '…') + (S.my === 'w' ? ' (kamu)' : ''), b: (r.black_name || '…') + (S.my === 'b' ? ' (kamu)' : '') };
  }
  function capturedBy() {
    const init = { P: 8, N: 2, B: 2, R: 2, Q: 1 }, cnt = { w: {}, b: {} };
    for (const p of S.game.board()) if (p && p.toUpperCase() !== 'K') { const c = isWhite(p) ? 'w' : 'b'; cnt[c][p.toUpperCase()] = (cnt[c][p.toUpperCase()] || 0) + 1; }
    const res = { w: '', b: '' };
    for (const c of ['w', 'b']) { const o = c === 'w' ? 'b' : 'w'; // dimakan oleh c = bidak o yang hilang
      for (const k of 'QRBNP') { const miss = init[k] - (cnt[o][k] || 0); for (let i = 0; i < Math.max(0, miss); i++) res[c] += glyph(o === 'w' ? k : k.toLowerCase()); } }
    return res;
  }
  function renderPlayers() {
    const n = names(), bottom = bottomColor(), top = bottom === 'w' ? 'b' : 'w', cap = capturedBy();
    for (const [id, col] of [['#pl-top', top], ['#pl-bottom', bottom]]) {
      const p = $(id); p.querySelector('.pname').textContent = (col === 'w' ? '♔ ' : '♚ ') + n[col];
      p.querySelector('.captured').textContent = cap[col];
      p.classList.toggle('turn', !S.over && S.game.turn === col);
    }
  }
  function resultText(result, reason) {
    const why = REASON[reason] || '';
    let title;
    if (result === '1/2-1/2') title = 'Remis';
    else {
      const winner = result === '1-0' ? 'w' : 'b';
      if (S.mode === 'single' || S.mode === 'online') title = winner === S.my ? 'Kamu menang!' : (S.mode === 'single' ? 'Kamu kalah' : 'Kamu kalah');
      else title = winner === 'w' ? 'Putih menang!' : 'Hitam menang!';
    }
    return { title, why };
  }
  function clockMs(color) {
    const n = S.net, r = n.room;
    let ms = color === 'w' ? r.white_ms : r.black_ms;
    if (r.status === 'playing' && r.turn === color && r.clock_at) ms -= Date.now() + n.offset - Date.parse(r.clock_at);
    return Math.max(0, ms);
  }
  function fmt(ms) {
    if (ms < 10000) return (ms / 1000).toFixed(1);
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function renderClocks() {
    const on = S.mode === 'online' && S.net && S.net.room && S.net.room.tc_base > 0;
    const bottom = bottomColor();
    for (const [id, col] of [['#pl-top', bottom === 'w' ? 'b' : 'w'], ['#pl-bottom', bottom]]) {
      const c = $(id + ' .clock'); c.classList.toggle('hidden', !on);
      if (!on) continue;
      const ms = clockMs(col); c.textContent = fmt(ms); c.classList.toggle('low', ms < 10000 && S.net.room.status === 'playing');
    }
    if (on && S.net.room.status === 'playing' && !S.net.waiting && !S.net.pending && (clockMs('w') === 0 || clockMs('b') === 0)) pollOnline();
  }
  setInterval(() => { if (S.mode === 'online' && S.net && !S.net.waiting) renderClocks(); }, 100);

  function renderStatus() {
    const st = $('#status'), g = S.game;
    st.classList.toggle('end', S.over);
    if (S.over) { const r = S.endInfo; const t = resultText(r.result, r.reason); st.textContent = t.title + (t.why ? ' — ' + t.why : ''); return; }
    let t;
    if (S.mode === 'single') t = S.thinking ? 'Komputer berpikir…' : (g.turn === S.my ? 'Giliranmu' : 'Giliran komputer');
    else if (S.mode === 'online') t = g.turn === S.my ? 'Giliranmu' : 'Giliran lawan';
    else t = g.turn === 'w' ? 'Giliran Putih' : 'Giliran Hitam';
    if (g.inCheck()) t += ' — SKAK!';
    if (S.mode === 'online' && S.net.room.draw_offer === S.my) t += ' (remis ditawarkan)';
    st.textContent = t;
  }

  /* ---------- input ---------- */
  function canMove() {
    if (S.over || S.thinking) return false;
    if (S.mode === 'single') return S.game.turn === S.my;
    if (S.mode === 'online') return S.net.room.status === 'playing' && S.game.turn === S.my && !S.net.pending;
    return true;
  }
  function onSquare(idx) {
    if (!canMove()) return;
    const g = S.game, p = g.board()[idx];
    const h = S.hints.filter(m => m.to === idx);
    if (S.sel >= 0 && h.length) { return attempt(h); }
    if (p && (isWhite(p) ? 'w' : 'b') === g.turn && (S.mode === 'local' || g.turn === S.my)) {
      S.sel = idx; S.hints = g.movesFrom(idx);
    } else { S.sel = -1; S.hints = []; }
    render();
  }
  function attempt(ms) {
    if (ms[0].promo) {
      const white = isWhite(ms[0].piece);
      modal(box => {
        box.append(el('h2', '', 'Promosi bidak'));
        const row = el('div', 'promo');
        for (const k of 'QRBN') row.appendChild(btn(glyph(white ? k : k.toLowerCase()), '', () => { closeModal(); doMove(ms.find(m => m.promo.toUpperCase() === k)); }));
        box.appendChild(row);
      });
    } else doMove(ms[0]);
  }
  function doMove(m) {
    S.sel = -1; S.hints = [];
    const g = S.game, san = g.play(m), st = g.status();
    if (S.mode === 'online') {
      const n = S.net; n.pending = true;
      render();
      ChessNet.move(n.id, g.fen(), san, sqName(m.from), sqName(m.to), st.over ? st.result : null, st.over ? st.reason : null)
        .then(room => { n.pending = false; if (room.now) n.offset = room.now - Date.now(); applyRoom(room); })
        .catch(e => { n.pending = false; toast('Gagal kirim langkah: ' + e.message); g.undo(); render(); pollOnline(); });
      return;
    }
    if (st.over) return finish(st);
    render();
    if (S.mode === 'single' && g.turn !== S.my) aiMove();
  }
  function finish(st) {
    S.over = true; S.endInfo = st; render(); endModal(st);
  }
  function endModal(st) {
    const t = resultText(st.result, st.reason);
    if (st.result !== '1/2-1/2' && (S.mode === 'local' || (st.result === '1-0') === (S.my === 'w'))) setTimeout(confetti, 250);
    modal(box => {
      box.append(el('h2', '', t.title), el('p', '', t.why || 'Permainan selesai'));
      const b = el('div', 'btns');
      if (S.mode !== 'online') b.appendChild(btn('Main lagi', 'primary', () => { closeModal(); newGame(); }));
      b.appendChild(btn('Lihat papan', 'secondary', closeModal));
      b.appendChild(btn('Menu utama', 'secondary', () => { closeModal(); leaveGame(true); }));
      box.appendChild(b);
    });
  }

  /* ---------- AI ---------- */
  function aiMove() {
    S.thinking = true; const tok = ++S.aiToken; render();
    setTimeout(() => {
      if (tok !== S.aiToken || S.mode !== 'single') return;
      const m = ChessAI.bestMove(S.game, S.level);
      if (tok !== S.aiToken) return;
      S.thinking = false;
      if (!m) return;
      S.game.play(m);
      const st = S.game.status();
      if (st.over) finish(st); else render();
    }, 60);
  }

  /* ---------- mulai / selesai game ---------- */
  function setupGameUI() {
    const on = S.mode === 'online';
    $('#btn-undo').classList.toggle('hidden', on);
    $('#btn-new').classList.toggle('hidden', on);
    $('#btn-draw').classList.toggle('hidden', !on);
    $('#btn-resign').classList.toggle('hidden', !on);
    $('#btn-claim').classList.add('hidden');
    $('#draw-offer').classList.add('hidden');
    $('#game-conn').classList.add('hidden');
    $('#game-title').textContent = S.mode === 'single' ? 'Lawan Komputer' : S.mode === 'local' ? '2 Pemain (Lokal)' : (S.net.room.name || 'Online');
    S.sel = -1; S.hints = []; S.over = false; S.endInfo = null; S.flip = false;
  }
  function newGame() {
    S.aiToken++; S.thinking = false;
    S.game = new Game(); S.prevLen = undefined; S.intro = true;
    if (S.mode === 'single') { S.my = opt.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : opt.color; }
    setupGameUI(); show('game'); render();
    if (S.mode === 'single' && S.my === 'b') aiMove();
  }
  function startMode(mode) { S.mode = mode; S.level = +opt.level; newGame(); }

  function leaveGame(force) {
    const n = S.net;
    const go = () => {
      S.aiToken++; S.thinking = false;
      if (S.mode === 'online' && n) { stopNet(); if (n.room.status !== 'finished') ChessNet.leave(n.id).catch(() => {}); ChessNet.store('chess7_room', null); S.net = null; }
      S.mode = null; show('menu');
    };
    if (S.mode === 'online' && n && n.room.status === 'playing' && !force) {
      modal(box => {
        box.append(el('h2', '', 'Keluar dari game?'), el('p', '', 'Keluar saat bermain dihitung menyerah.'));
        const b = el('div', 'btns');
        b.append(btn('Ya, keluar', 'danger', () => { closeModal(); go(); }), btn('Lanjut main', 'secondary', closeModal));
        box.appendChild(b);
      });
    } else go();
  }

  /* ---------- ONLINE ---------- */
  let lobbyT = null;
  function startLobby() {
    stopLobby(); refreshLobby(); lobbyT = setInterval(refreshLobby, 3000);
  }
  function stopLobby() { clearInterval(lobbyT); lobbyT = null; }
  async function refreshLobby() {
    const box = $('#room-list'), pill = $('#net-status');
    try {
      const rooms = await ChessNet.list();
      pill.textContent = 'server.7mit · online'; pill.className = 'pill ok';
      box.textContent = '';
      if (!rooms.length) { box.appendChild(el('div', 'empty', 'Belum ada server terbuka. Buat server baru atau cari lawan otomatis!')); return; }
      for (const r of rooms) {
        const row = el('div', 'room'), g = el('div', 'grow');
        const host = r.white_name || r.black_name || '?';
        g.append(el('b', '', r.name), el('small', '', `${host} · bermain ${r.white_name ? 'Putih' : 'Hitam'} · ${tcLabel(r)} · kode ${r.code}`));
        const jb = btn('', 'secondary', () => joinRoom(r.id, null)); jb.innerHTML = Icons.svg('swords') + ' Gabung'; row.append(g, jb);
        box.appendChild(row);
      }
    } catch (e) {
      pill.textContent = 'server tidak terjangkau'; pill.className = 'pill warn';
      box.textContent = ''; box.appendChild(el('div', 'empty', 'Tidak bisa terhubung ke server.7mit. Periksa koneksi internet.'));
    }
  }
  function waitScreen(title, sub, code) {
    $('#wait-title').textContent = title; $('#wait-sub').textContent = sub; $('#wait-code').textContent = code || '';
    $('#wait-code').classList.toggle('hidden', !code); show('wait');
  }
  function beginOnline(res, waiting) {
    S.mode = 'online'; S.my = res.color;
    S.net = { offset: res.now ? res.now - Date.now() : 0, id: res.room.id, room: res.room, pending: false, busy: false, fails: 0, timer: null, offlineSince: 0, endShown: false, waiting };
    ChessNet.store('chess7_room', res.room.id);
    S.game = new Game(); S.over = false;
    if (res.room.status === 'playing' || res.room.status === 'finished') enterOnlineGame();
    else {
      waitScreen(res.room.mode === 'auto' ? 'Mencari lawan…' : 'Menunggu lawan…',
        res.room.mode === 'auto' ? 'Kamu akan dipasangkan otomatis dengan pemain lain.' : `Server "${res.room.name}" · ${tcLabel(res.room)} · kamu bermain ${S.my === 'w' ? 'Putih' : 'Hitam'}. Bagikan kode ini:`,
        res.room.mode === 'auto' ? '' : res.room.code);
    }
    startNet();
  }
  function enterOnlineGame() {
    S.net.waiting = false; S.prevLen = undefined; S.intro = true; setupGameUI(); show('game'); applyRoom(S.net.room, true);
  }
  function startNet() { stopNet(); S.net.timer = setInterval(pollOnline, 1000); pollOnline(); }
  function stopNet() { if (S.net && S.net.timer) { clearInterval(S.net.timer); S.net.timer = null; } }
  async function pollOnline() {
    const n = S.net; if (!n || n.busy || n.pending) return;
    n.busy = true;
    try {
      const r = await ChessNet.sync(n.id);
      n.fails = 0; $('#game-conn').classList.add('hidden');
      if (!S.net || S.net !== n) return;
      if (!r) { toast('Room sudah tidak ada'); ChessNet.store('chess7_room', null); stopNet(); S.net = null; S.mode = null; show('online'); return; }
      if (n.pending) return;
      n.oppOnline = r.opp_online; if (r.now) n.offset = r.now - Date.now();
      if (n.waiting && r.room.status !== 'waiting') { n.room = r.room; enterOnlineGame(); }
      else if (!n.waiting) applyRoom(r.room);
      updateConn();
    } catch (e) {
      n.fails++; if (n.fails >= 3) { const c = $('#game-conn'); c.textContent = 'koneksi terputus…'; c.className = 'pill warn'; }
    } finally { n.busy = false; }
  }
  function updateConn() {
    const n = S.net; if (!n || n.waiting || n.room.status !== 'playing') { $('#btn-claim').classList.add('hidden'); return; }
    const c = $('#game-conn');
    if (n.oppOnline === false) {
      if (!n.offlineSince) n.offlineSince = Date.now();
      c.textContent = 'lawan terputus'; c.className = 'pill warn';
      $('#btn-claim').classList.toggle('hidden', Date.now() - n.offlineSince < 45000);
    } else { n.offlineSince = 0; c.textContent = 'lawan online'; c.className = 'pill ok'; $('#btn-claim').classList.add('hidden'); }
  }
  function applyRoom(room, force) {
    const n = S.net; if (!n || !room) return;
    n.room = room;
    const mv = room.moves || [];
    const sig = [room.fen, room.status, room.result, room.draw_offer, room.white_name, room.black_name, mv.length].join('|');
    const same = !force && sig === n.sig; n.sig = sig;
    const changed = force || mv.length !== S.game.history.length || S.game.fen() !== room.fen;
    if (changed) {
      const g = new Game();
      for (const x of mv) {
        const pm = /=([QRBN])/.exec(x.san);
        const m = g.findMove(sqIndex(x.from), sqIndex(x.to), pm && pm[1]);
        if (!m) break; g.play(m);
      }
      S.game = g; S.sel = -1; S.hints = [];
    }
    $('#draw-offer').classList.toggle('hidden', !(room.status === 'playing' && room.draw_offer && room.draw_offer !== S.my));
    $('#btn-draw').disabled = room.status !== 'playing';
    $('#btn-resign').disabled = room.status !== 'playing';
    if (room.status === 'finished') {
      S.over = true; S.endInfo = { result: room.result, reason: room.reason };
      if (!same) render();
      if (!n.endShown) { n.endShown = true; stopNet(); ChessNet.store('chess7_room', null); endModal(S.endInfo); }
      $('#btn-claim').classList.add('hidden'); $('#game-conn').classList.add('hidden');
    } else { S.over = false; if (!same) render(); }
  }
  async function guarded(fn) { try { return await fn(); } catch (e) { toast(e.message || 'Terjadi kesalahan'); } }
  async function joinRoom(id, code) {
    const name = getName();
    const res = await guarded(() => ChessNet.join(name, id, code));
    if (res) beginOnline(res, false);
  }
  async function resume() {
    const id = ChessNet.store('chess7_room'); if (!id) return;
    try {
      const r = await ChessNet.sync(id);
      if (!r || r.room.status === 'finished') { ChessNet.store('chess7_room', null); return; }
      beginOnline(r, r.room.status === 'waiting'); toast('Melanjutkan game online');
    } catch (e) { }
  }

  /* ---------- event ---------- */
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) show(g.dataset.go); });
  function seg(id, key, cb) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$(id + ' button').forEach(x => x.classList.toggle('on', x === b)); opt[key] = b.dataset.v; if (cb) cb();
    });
  }
  seg('#seg-level', 'level'); seg('#seg-tc', 'tc'); seg('#seg-color', 'color'); seg('#seg-ocolor', 'ocolor');
  document.querySelector('[data-go=local]').addEventListener('click', e => { e.stopPropagation(); startMode('local'); });
  $('#btn-start-single').onclick = () => startMode('single');
  $('#btn-leave').onclick = () => leaveGame();
  $('#btn-flip').onclick = () => { S.flip = !S.flip; render(); };
  $('#btn-new').onclick = () => { if (S.game.history.length && !S.over) modal(box => { box.append(el('h2', '', 'Mulai game baru?')); const b = el('div', 'btns'); b.append(btn('Ya', 'primary', () => { closeModal(); newGame(); }), btn('Batal', 'secondary', closeModal)); box.appendChild(b); }); else newGame(); };
  $('#btn-undo').onclick = () => {
    if (S.thinking || !S.game.history.length) return;
    S.game.undo();
    if (S.mode === 'single' && S.game.turn !== S.my && S.game.history.length) S.game.undo();
    S.over = false; S.sel = -1; S.hints = [];
    render();
    if (S.mode === 'single' && S.game.turn !== S.my) aiMove();
  };
  $('#btn-resign').onclick = () => modal(box => {
    box.append(el('h2', '', 'Menyerah?'));
    const b = el('div', 'btns');
    b.append(btn('Ya, menyerah', 'danger', () => { closeModal(); guarded(async () => applyRoom(await ChessNet.resign(S.net.id))); }), btn('Batal', 'secondary', closeModal));
    box.appendChild(b);
  });
  $('#btn-draw').onclick = () => guarded(async () => { applyRoom(await ChessNet.draw(S.net.id, 'offer')); toast('Tawaran remis dikirim'); });
  $('#btn-draw-yes').onclick = () => guarded(async () => applyRoom(await ChessNet.draw(S.net.id, 'accept')));
  $('#btn-draw-no').onclick = () => guarded(async () => applyRoom(await ChessNet.draw(S.net.id, 'decline')));
  $('#btn-claim').onclick = () => guarded(async () => applyRoom(await ChessNet.claim(S.net.id)));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  $('#btn-auto').onclick = async () => {
    const name = getName(); $('#btn-auto').disabled = true;
    const res = await guarded(() => ChessNet.quick(name, ...tcOf()));
    $('#btn-auto').disabled = false;
    if (res) beginOnline(res, res.room.status === 'waiting');
  };
  $('#btn-create').onclick = async () => {
    const name = getName();
    const res = await guarded(() => ChessNet.create(name, $('#inp-room').value, opt.ocolor === 'r' ? 'r' : opt.ocolor, $('#chk-public').checked, ...tcOf()));
    if (res) beginOnline(res, true);
  };
  $('#btn-join-code').onclick = () => { const c = $('#inp-code').value.trim(); if (c.length < 5) return toast('Masukkan 5 karakter kode'); joinRoom(null, c); };
  $('#btn-refresh').onclick = refreshLobby;
  $('#btn-wait-cancel').onclick = () => { const n = S.net; stopNet(); if (n) ChessNet.leave(n.id).catch(() => {}); ChessNet.store('chess7_room', null); S.net = null; S.mode = null; show('online'); };

  Icons.apply();
  $('#inp-name').value = ChessNet.store('chess7_name') || '';
  window.addEventListener('beforeunload', () => { /* room tetap, bisa dilanjutkan */ });
  resume();
})();
