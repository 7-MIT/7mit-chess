# Catur 7MIT

Game catur web statis (tanpa build). Buka `index.html` lewat server statis apa pun, mis. `python3 -m http.server`.

- **Lawan Komputer** – 4 tingkat (Pemula–Sulit), pilih warna, undo.
- **2 Pemain Lokal** – satu perangkat, gantian.
- **Online (server.7mit / Supabase)** – jam catur (Tanpa jam, 3|2, 5|0, 10|0, 15|10) dihitung di server; cari lawan otomatis (PvP), buat server (publik/privat + kode 5 huruf), atau pilih server dari daftar. Ada tawaran remis, menyerah, klaim menang saat lawan terputus, dan lanjut otomatis setelah reload.

Backend: tabel `chess_rooms`, `chess_seats` dan fungsi `chess_*` di project Supabase `server_7mit` (RLS aktif; semua penulisan lewat RPC yang memeriksa giliran & kursi pemain).

Struktur: `js/chess.js` (aturan, lolos perft), `js/ai.js` (negamax alpha-beta), `js/net.js` (klien server), `js/app.js` (UI).
