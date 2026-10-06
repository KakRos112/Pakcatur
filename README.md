# Pakcatur

Game catur hiburan di browser: lawan 13 bot (rating 250–3000), ulasan permainan dengan akurasi tiap langkah, dan main bareng teman lewat lobi online.

**Main sekarang:** https://pakcatur.my.id

## Fitur

- **Lawan bot**: 13 bot dari pemula sampai master. Bot kuat memakai mesin [Stockfish 10](https://github.com/niklasf/stockfish.js) yang berjalan langsung di browser.
- **Ulasan permainan**: label tiap langkah (Brilian, Terbaik, Blunder, dan lainnya), akurasi, grafik evaluasi, penjelasan langkah, variasi terbaik, dan mode "Coba Lagi".
- **Online**: buat lobi, gabung, chat, tawarkan seri, main lagi.
- **Turnamen**: sistem gugur sampai 32 pemain dengan bagan, seri = main ulang dengan warna ditukar. Tetap tersimpan walau server di-restart.
- Premove, petunjuk, ambil kembali, jam catur, 8 tema papan, 7 set bidak, layar penuh, shortcut keyboard, dan tampilan khusus HP.

## Menjalankan

| Cara | Langkah |
|---|---|
| Lawan bot saja | Buka `index.html` di browser. Tidak perlu instalasi. |
| Online di jaringan lokal (Windows) | Klik dua kali `Mulai Server.bat` (butuh [Node.js](https://nodejs.org) 18+). |
| Online, cara manual | `node server.js`, lalu buka `http://<ip-komputer>:3000`. |
| Server (Proxmox LXC + Cloudflare Tunnel) | Lihat [DEPLOY.md](DEPLOY.md). |

## Kontributor

| | Peran |
|---|---|
| [**KakRos112**](https://github.com/KakRos112) | Pengemas dan pengelola: menentukan fitur, menguji, dan menjalankan server |
| **Claude** ([Claude Code](https://claude.com/claude-code) oleh Anthropic) | Asisten AI yang menulis sebagian besar kode; tercatat sebagai co-author di setiap commit |

Pengemas **bukan** pembuat mesin caturnya. Kecerdasan bot berasal dari Stockfish, karya komunitas Stockfish. Daftar lengkap pembuat, sumber, dan referensi ada di [CREDITS.txt](CREDITS.txt) dan halaman [Tentang](about.html).

## Lisensi

Kode game ini berlisensi [GNU GPL v3.0](LICENSE). Stockfish berlisensi GPL-3.0, sedangkan gambar bidak memakai lisensi masing-masing (GPL-2.0+, Apache-2.0, MIT, CC0). Detailnya ada di [CREDITS.txt](CREDITS.txt) dan folder [licenses/](licenses/).

Tidak berafiliasi dengan chess.com, Lichess, FIDE, maupun proyek Stockfish.
