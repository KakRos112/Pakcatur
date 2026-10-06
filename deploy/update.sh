#!/usr/bin/env bash
# Memperbarui Pakcatur ke versi terbaru dari GitHub lalu me-restart server.
# Jalankan sebagai root dari dalam folder repo:
#   bash deploy/update.sh
# Catatan: lobi & permainan online yang sedang berjalan akan hilang saat restart.
set -euo pipefail

# Seluruh isi dibungkus fungsi supaya bash membaca file ini utuh sebelum
# "git pull" mungkin mengubah file ini sendiri.
main() {
  local app_dir before after port host env_line
  app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$app_dir"

  if [ "$(id -u)" -ne 0 ]; then
    echo "Jalankan sebagai root:  sudo bash deploy/update.sh"
    exit 1
  fi

  before="$(git rev-parse --short HEAD)"
  git pull --ff-only
  after="$(git rev-parse --short HEAD)"

  if [ "$before" = "$after" ]; then
    echo "==> Sudah versi terbaru ($after). Tidak ada yang diubah."
    exit 0
  fi

  echo "==> Diperbarui: $before -> $after"
  git --no-pager log --oneline "$before..$after"

  # Pakai lagi PORT & HOST dari service yang sudah terpasang
  env_line="$(systemctl show pakcatur -p Environment --value 2>/dev/null || true)"
  port="$(printf '%s\n' $env_line | sed -n 's/^PORT=//p')"
  host="$(printf '%s\n' $env_line | sed -n 's/^HOST=//p')"

  PORT="${port:-3000}" HOST="${host:-127.0.0.1}" bash "$app_dir/deploy/install.sh"
  exit 0
}

main "$@"
