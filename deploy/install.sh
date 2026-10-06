#!/usr/bin/env bash
# Memasang Pakcatur sebagai service systemd di Debian/Ubuntu (misalnya LXC Proxmox).
# Jalankan sebagai root dari dalam folder repo:
#   bash deploy/install.sh
# Pengaturan opsional lewat variabel lingkungan, contoh:
#   HOST=0.0.0.0 PORT=3000 bash deploy/install.sh
#   HOST=127.0.0.1 -> hanya bisa diakses dari LXC ini sendiri (cloudflared di LXC yang sama)
#   HOST=0.0.0.0   -> bisa diakses dari jaringan (cloudflared di LXC/mesin lain)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${APP_USER:-pakcatur}"
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
NODE_MAJOR="${NODE_MAJOR:-22}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan sebagai root:  sudo bash deploy/install.sh"
  exit 1
fi

echo "==> Folder aplikasi : $APP_DIR"
echo "==> Alamat server   : $HOST:$PORT"

# 1. Paket dasar
if ! command -v curl >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl ca-certificates
fi

# 2. Node.js (minimal versi 18)
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -ge 18 ]; then need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  echo "==> Memasang Node.js $NODE_MAJOR dari NodeSource"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"
echo "==> Node.js $("$NODE_BIN" -v) di $NODE_BIN"

# 3. User khusus tanpa login untuk menjalankan server
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  echo "==> User $APP_USER dibuat"
fi

# 4. File game cukup bisa dibaca (server tidak menulis apa pun ke disk)
chmod -R a+rX "$APP_DIR"

# 5. Service systemd
sed -e "s#__APP_DIR__#$APP_DIR#g" \
    -e "s#__APP_USER__#$APP_USER#g" \
    -e "s#__PORT__#$PORT#g" \
    -e "s#__HOST__#$HOST#g" \
    -e "s#__NODE__#$NODE_BIN#g" \
    "$APP_DIR/deploy/pakcatur.service" > /etc/systemd/system/pakcatur.service
systemctl daemon-reload
systemctl enable pakcatur >/dev/null
systemctl restart pakcatur

# 6. Cek server menjawab
for _ in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$PORT/api/ping" >/dev/null 2>&1; then
    echo
    echo "==> Berhasil! Server berjalan di http://$HOST:$PORT"
    echo "    Status : systemctl status pakcatur"
    echo "    Log    : journalctl -u pakcatur -f"
    exit 0
  fi
  sleep 1
done
echo "==> Server belum menjawab. Cek log:  journalctl -u pakcatur -n 50"
exit 1
