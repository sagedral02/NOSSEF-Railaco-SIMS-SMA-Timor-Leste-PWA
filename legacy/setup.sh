#!/usr/bin/env bash
# =============================================================================
# SIMS NOSSEF Railaco — setup & jalankan di komputer baru
#
# Yang dilakukan:
#   1. Deteksi OS (Linux / macOS / Windows Git Bash)
#   2. Pasang Node.js >= 22.13 bila belum ada atau terlalu lama
#      (dibutuhkan modul bawaan node:sqlite tanpa flag eksperimental)
#   3. npm install (pakai package-lock.json)
#   4. Build frontend (dist/)
#   5. Buat database SQLite awal (server/data/nossef.sqlite) bila belum ada
#   6. Jalankan aplikasi
#
# Pemakaian:
#   bash setup.sh              # install + build + jalankan mode produksi (port 4000)
#   bash setup.sh --dev        # install + jalankan mode development (port 5173 + API 4000)
#   bash setup.sh --no-start   # hanya install + build, tidak menjalankan server
#   bash setup.sh --reset-db   # hapus & isi ulang database dengan data demo
#   PORT=8080 bash setup.sh    # ganti port mode produksi
# =============================================================================
set -euo pipefail

MIN_NODE_MAJOR=22
MIN_NODE_MINOR=13
NODE_INSTALL_MAJOR=22
NVM_VERSION="v0.40.1"

MODE="prod"
START=1
RESET_DB=0
for arg in "$@"; do
  case "$arg" in
    --dev) MODE="dev" ;;
    --prod) MODE="prod" ;;
    --no-start) START=0 ;;
    --reset-db) RESET_DB=1 ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $arg (lihat --help)"; exit 1 ;;
  esac
done

# --- tampilan ---------------------------------------------------------------
info() { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok  ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn ]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# Selalu bekerja dari folder proyek (lokasi script ini)
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
[ -f package.json ] || die "package.json tidak ditemukan di $PROJECT_DIR"

# --- deteksi OS -------------------------------------------------------------
case "$(uname -s)" in
  Linux*)               OS="linux" ;;
  Darwin*)              OS="mac" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  *)                    die "OS tidak didukung: $(uname -s)" ;;
esac
info "OS terdeteksi: $OS"

# --- Node.js ----------------------------------------------------------------
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v major minor
  v="$(node -v | sed 's/^v//')"
  major="${v%%.*}"; minor="$(echo "$v" | cut -d. -f2)"
  [ "$major" -gt "$MIN_NODE_MAJOR" ] && return 0
  [ "$major" -eq "$MIN_NODE_MAJOR" ] && [ "$minor" -ge "$MIN_NODE_MINOR" ]
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
}

install_node_nvm() {
  load_nvm
  if ! command -v nvm >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || install_curl
    info "Memasang nvm $NVM_VERSION ..."
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
    load_nvm
  fi
  info "Memasang Node.js $NODE_INSTALL_MAJOR via nvm ..."
  nvm install "$NODE_INSTALL_MAJOR"
  nvm alias default "$NODE_INSTALL_MAJOR" >/dev/null
  nvm use "$NODE_INSTALL_MAJOR" >/dev/null
}

install_curl() {
  info "Memasang curl ..."
  if   command -v apt-get >/dev/null; then sudo apt-get update -y && sudo apt-get install -y curl ca-certificates
  elif command -v dnf     >/dev/null; then sudo dnf install -y curl
  elif command -v yum     >/dev/null; then sudo yum install -y curl
  elif command -v pacman  >/dev/null; then sudo pacman -Sy --noconfirm curl
  elif command -v zypper  >/dev/null; then sudo zypper install -y curl
  else die "curl tidak tersedia dan package manager tidak dikenali. Pasang curl secara manual."
  fi
}

install_node_windows() {
  command -v winget >/dev/null 2>&1 || command -v winget.exe >/dev/null 2>&1 \
    || die "winget tidak ditemukan. Unduh Node.js 22 LTS dari https://nodejs.org lalu jalankan ulang script ini."
  info "Memasang Node.js LTS via winget (mungkin muncul jendela izin Administrator) ..."
  winget.exe install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements \
    || warn "winget melaporkan error (bisa jadi sudah terpasang); melanjutkan ..."
  # PATH sesi ini belum diperbarui oleh installer
  export PATH="/c/Program Files/nodejs:$PATH"
}

if node_ok; then
  ok "Node.js $(node -v) sudah memenuhi syarat"
else
  if command -v node >/dev/null 2>&1; then
    warn "Node.js $(node -v) terlalu lama (butuh >= $MIN_NODE_MAJOR.$MIN_NODE_MINOR)"
  else
    warn "Node.js belum terpasang"
  fi
  case "$OS" in
    linux|mac) install_node_nvm ;;
    windows)   install_node_windows ;;
  esac
  node_ok || die "Node.js masih belum memenuhi syarat ($(node -v 2>/dev/null || echo 'tidak ada')). Buka terminal baru lalu jalankan ulang script ini."
  ok "Node.js $(node -v) siap"
fi

# Cek node:sqlite benar-benar tersedia
node -e "require('node:sqlite')" 2>/dev/null \
  || die "Modul node:sqlite tidak tersedia pada Node $(node -v). Gunakan Node 22.13+ atau 23.4+."

# --- dependensi -------------------------------------------------------------
info "Memasang dependensi npm ..."
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund || { warn "npm ci gagal, mencoba npm install"; npm install --no-audit --no-fund; }
else
  npm install --no-audit --no-fund
fi
ok "Dependensi terpasang"

# --- build ------------------------------------------------------------------
if [ "$MODE" = "prod" ]; then
  info "Build frontend (tsc + vite) ..."
  npm run build
  ok "Build selesai -> dist/"
fi

# --- database ---------------------------------------------------------------
mkdir -p server/data
if [ "$RESET_DB" -eq 1 ]; then
  info "Mengisi ulang database dengan data demo ..."
  npm run reset-db
  ok "Database direset"
elif [ -f server/data/nossef.sqlite ]; then
  ok "Database ditemukan: server/data/nossef.sqlite (dipakai apa adanya)"
else
  info "Database belum ada; akan dibuat otomatis saat server pertama kali jalan"
fi

# --- alamat jaringan --------------------------------------------------------
lan_ip() {
  case "$OS" in
    linux)   hostname -I 2>/dev/null | awk '{print $1}' ;;
    mac)     ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null ;;
    windows) ipconfig 2>/dev/null | tr -d '\r' | grep -E 'IPv4' | head -n1 | sed 's/.*: *//' ;;
  esac
}
IP="$(lan_ip || true)"

if [ "$MODE" = "prod" ]; then PORT_SHOW="${PORT:-4000}"; else PORT_SHOW=5173; fi

echo
ok "Setup selesai."
echo "   Lokal     : http://localhost:$PORT_SHOW"
[ -n "$IP" ] && echo "   Jaringan  : http://$IP:$PORT_SHOW  (izinkan port $PORT_SHOW di firewall bila perlu)"
echo "   Login demo: admin / nossef2026"
echo

[ "$START" -eq 1 ] || { info "Lewati menjalankan server (--no-start). Jalankan nanti: npm run server"; exit 0; }

if [ "$MODE" = "prod" ]; then
  info "Menjalankan server produksi (Ctrl+C untuk berhenti) ..."
  exec node server/index.js
else
  info "Menjalankan mode development (Ctrl+C untuk berhenti) ..."
  exec npm run dev
fi
