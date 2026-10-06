# Memasang Pakcatur di Proxmox LXC + Cloudflare Tunnel

Panduan ini memasang server Pakcatur di sebuah container LXC (Debian/Ubuntu) di Proxmox, lalu membukanya ke internet lewat Cloudflare Tunnel, tanpa membuka port di router.

```
Pemain (browser) ──HTTPS──> Cloudflare ──Tunnel──> cloudflared ──HTTP──> Pakcatur (node server.js :3000)
```

Server sangat ringan. Stockfish dan semua perhitungan bot berjalan di **browser pemain**, sedangkan server hanya menyajikan file dan meneruskan langkah di mode online.

---

## 1. Buat LXC di Proxmox

| Pengaturan | Nilai yang disarankan |
|---|---|
| Template | `debian-12-standard` (atau Ubuntu 22.04/24.04) |
| Unprivileged container | Ya |
| CPU | 1 core |
| RAM | 512 MB (256 MB juga cukup) |
| Swap | 256 MB |
| Disk | 4 GB |
| Jaringan | DHCP atau IP statis, terserah |

Setelah LXC menyala, buka **Console** lalu jalankan:

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates
```

---

## 2. Ambil kode dari GitHub

Repo `KakRos112/Pakcatur` bersifat **private**, jadi LXC butuh izin baca. Cara paling aman memakai **deploy key** (kunci SSH yang hanya bisa membaca repo ini):

```bash
ssh-keygen -t ed25519 -C "pakcatur-lxc" -f ~/.ssh/pakcatur -N ""
cat ~/.ssh/pakcatur.pub
```

1. Salin isi kunci yang tampil (diawali `ssh-ed25519 ...`).
2. Buka https://github.com/KakRos112/Pakcatur/settings/keys, pilih **Add deploy key**, tempel kuncinya, dan **jangan** centang "Allow write access".
3. Kembali ke LXC:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-pakcatur
  HostName github.com
  User git
  IdentityFile ~/.ssh/pakcatur
  IdentitiesOnly yes
EOF

git clone github-pakcatur:KakRos112/Pakcatur.git /opt/pakcatur
```

> Kalau repo dijadikan **public**, cukup jalankan `git clone https://github.com/KakRos112/Pakcatur.git /opt/pakcatur` tanpa deploy key.

---

## 3. Pasang server sebagai service

Pilih sesuai lokasi `cloudflared`:

**A. cloudflared dipasang di LXC yang sama** (paling sederhana):

```bash
cd /opt/pakcatur
bash deploy/install.sh
```

Server hanya mendengarkan di `127.0.0.1:3000`, jadi tidak bisa diakses langsung dari jaringan, hanya lewat tunnel.

**B. cloudflared sudah ada di LXC/mesin lain:**

```bash
cd /opt/pakcatur
HOST=0.0.0.0 bash deploy/install.sh
```

Server mendengarkan di `0.0.0.0:3000`. Nanti di Cloudflare, arahkan ke `http://<IP-LXC-ini>:3000`.

Skrip `install.sh` otomatis:
- memasang Node.js 22 (dari NodeSource) kalau belum ada atau versinya di bawah 18,
- membuat user sistem `pakcatur` tanpa login,
- memasang service systemd `pakcatur` yang otomatis menyala saat LXC boot dan restart sendiri kalau crash,
- mengecek server sudah menjawab di `/api/ping`.

Perintah berguna:

```bash
systemctl status pakcatur      # status
journalctl -u pakcatur -f      # log langsung
systemctl restart pakcatur     # restart
curl http://127.0.0.1:3000/api/ping   # harus menjawab {"ok":true}
```

---

## 4. Cloudflare Tunnel

Syarat: domain kamu sudah dikelola Cloudflare (nameserver-nya di Cloudflare).

### Cara yang disarankan: tunnel dari dashboard (pakai token)

1. Buka https://one.dash.cloudflare.com, pilih **Networks → Tunnels → Create a tunnel**.
2. Pilih **Cloudflared**, beri nama (misalnya `pakcatur`), lalu **Save**.
3. Pilih sistem **Debian** dan **64-bit**. Cloudflare menampilkan perintah pemasangan. Jalankan perintah itu di LXC yang akan menjalankan cloudflared. Isinya kira-kira:

   ```bash
   mkdir -p --mode=0755 /usr/share/keyrings
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | tee /etc/apt/sources.list.d/cloudflared.list
   apt-get update && apt-get install -y cloudflared
   cloudflared service install <TOKEN-DARI-DASHBOARD>
   ```

   > Selalu pakai perintah yang tampil di dashboard, karena tokennya unik. Jangan bagikan token itu.

4. Di tab **Public Hostname**, klik **Add a public hostname**:

   | Kolom | Isi |
   |---|---|
   | Subdomain | `catur` (bebas) |
   | Domain | domainmu |
   | Service Type | `HTTP` |
   | URL | `localhost:3000` (cara A) atau `<IP-LXC-Pakcatur>:3000` (cara B) |

5. Simpan, lalu buka `https://catur.domainmu.com`. Game langsung bisa dimainkan, dan tab **Online** jalan lewat internet.

### Alternatif: tunnel lewat file konfigurasi

Lihat contoh di [`deploy/cloudflared-config.example.yml`](deploy/cloudflared-config.example.yml).

---

## 5. Pengaturan Cloudflare yang perlu dicek

Di dashboard domain (bukan Zero Trust):

- **Speed → Optimization → Rocket Loader: Off.** Rocket Loader mengubah cara script dimuat dan bisa merusak game.
- **Caching**: server mengirim `Cache-Control: no-cache`, jadi versi baru langsung terpakai. Kalau setelah update tampilan masih versi lama, pilih **Caching → Configuration → Purge Everything**.
- **Opsional, membatasi siapa yang bisa main:** di Zero Trust buka **Access → Applications → Add an application → Self-hosted**, isi hostname `catur.domainmu.com`, lalu buat policy **Allow** untuk email teman-temanmu. Mereka akan login dengan kode email sebelum bisa membuka game.

---

## 6. Memperbarui ke versi terbaru

Setelah ada commit baru di GitHub:

```bash
cd /opt/pakcatur
bash deploy/update.sh
```

Skrip ini menjalankan `git pull`, memasang ulang service, lalu me-restart server.

> Restart menghapus lobi dan permainan online biasa yang sedang berjalan, karena datanya hanya disimpan di memori. Lakukan saat tidak ada yang sedang main.
> Turnamen tidak hilang: disimpan di `/var/lib/pakcatur/turnamen.json` dan dilanjutkan setelah server menyala lagi (waktu selama server mati tidak dihitung).

---

## 7. Keamanan yang sudah ada di server

- Hanya file game yang bisa diunduh (`index.html`, `css/`, `js/`, `engine/`, `pieces/`, `licenses/`, `LICENSE`, `CREDITS.txt`). Folder `.git`, `server.js`, `deploy/`, dan file lain tidak bisa diakses dari browser.
- Setiap langkah catur dicek ulang oleh server, jadi langkah curang ditolak.
- Batas sederhana anti-spam: maksimal 300 permintaan per menit per IP, 20 koneksi per IP, 2000 koneksi total, dan 300 lobi.
- IP asli pemain dibaca dari header `CF-Connecting-IP` karena `TRUST_PROXY=1` di service.
- Header keamanan: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, dan `Referrer-Policy: no-referrer`.
- Server berjalan sebagai user `pakcatur` tanpa hak root.

---

## 8. Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| `install.sh` gagal di langkah Node.js | LXC belum ada internet atau DNS. Cek dengan `ping deb.nodesource.com`. |
| Service gagal dengan status `226/NAMESPACE` | Ada opsi pengamanan systemd yang tidak didukung LXC. File service bawaan sudah memakai opsi minimal; kalau kamu menambah opsi `Protect*`/`Private*`, hapus lagi. |
| Halaman terbuka tapi tab Online bilang "butuh server" | Request `/api/ping` tidak sampai. Cek URL service di Cloudflare dan `curl http://127.0.0.1:3000/api/ping` di LXC. |
| Lawan tidak melihat langkahku | Pastikan Rocket Loader mati. Cek log: `journalctl -u pakcatur -f`. |
| Error `429` | Batas anti-spam tercapai (biasanya karena banyak tab). Tunggu sekitar 1 menit. |
