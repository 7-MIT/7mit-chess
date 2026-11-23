/* Klien server.7mit (Supabase REST/RPC). Kunci di bawah adalah kunci publik (anon). */
(function (root) {
  'use strict';
  const URL_ = 'https://lajzrempjyoqkubkumhb.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhanpyZW1wanlvcWt1Ymt1bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODUzNDQsImV4cCI6MjEwMDQ2MTM0NH0.qM1qzhIPin7U1StnPP5n_0xEMRYTdl3Isy1HHahK8dQ';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function token() {
    let t = store('chess7_token');
    if (!t || t.length < 16) {
      const a = new Uint8Array(16);
      (self.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256);
      t = Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
      store('chess7_token', t);
    }
    return t;
  }
  async function rpc(name, args) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { }
      if (!res.ok) { const err = new Error((data && (data.message || data.hint)) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
      return data;
    } finally { clearTimeout(to); }
  }
  const T = () => ({ p_token: token() });
  const api = {
    store, token,
    create: (name, roomName, color, pub, base, inc) => rpc('chess_create_room', { ...T(), p_name: name, p_room_name: roomName, p_color: color, p_public: pub, p_base: base, p_inc: inc }),
    join: (name, roomId, code) => rpc('chess_join_room', { ...T(), p_name: name, p_room_id: roomId || null, p_code: code || null }),
    quick: (name, base, inc) => rpc('chess_quick_match', { ...T(), p_name: name, p_base: base, p_inc: inc }),
    sync: roomId => rpc('chess_sync', { ...T(), p_room_id: roomId }),
    move: (roomId, fen, san, from, to, result, reason) => rpc('chess_move', { ...T(), p_room_id: roomId, p_fen: fen, p_san: san, p_from: from, p_to: to, p_result: result, p_reason: reason }),
    resign: roomId => rpc('chess_resign', { ...T(), p_room_id: roomId }),
    draw: (roomId, action) => rpc('chess_draw', { ...T(), p_room_id: roomId, p_action: action }),
    claim: roomId => rpc('chess_claim', { ...T(), p_room_id: roomId }),
    leave: roomId => rpc('chess_leave', { ...T(), p_room_id: roomId }),
    list: () => rpc('chess_list_rooms', {})
  };
  root.ChessNet = api;
})(self);
