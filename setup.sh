#!/usr/bin/env bash
# =============================================================================
# SIMS NOSSEF Railaco — setup & run on a new laptop (stack per prd.md §8, §52)
#
#   Django 5.2 + DRF (Python 3.12)  ·  PostgreSQL 17  ·  Next.js 16.2 (Node 22, pnpm)
#   Redis/Celery are optional locally: DEV_SYNC_TASKS=true runs tasks inline (PRD §52.2).
#
# Steps: detect OS → install Node 22 / pnpm / Python 3.12 / PostgreSQL 17 when missing →
#        create .env + database → pip install → migrate → seed → pnpm install → build → run.
#
# Usage (Linux/macOS terminal, or Git Bash on Windows):
#   bash setup.sh              install everything and start (web http://localhost:3000)
#   bash setup.sh --dev        start in development mode (hot reload)
#   bash setup.sh --no-start   install/build only
#   bash setup.sh --no-demo    do not create the synthetic demo accounts
#   bash setup.sh --reset-db   empty all tables (schema kept), then seed again
#   bash setup.sh --start      skip installation; just start PostgreSQL + API + web
# =============================================================================
set -euo pipefail

MODE="prod"; START=1; DEMO=1; RESET_DB=0; ONLY_START=0
for arg in "$@"; do
  case "$arg" in
    --dev) MODE="dev" ;;
    --no-start) START=0 ;;
    --no-demo) DEMO=0 ;;
    --reset-db) RESET_DB=1 ;;
    --start) ONLY_START=1 ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

info() { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok  ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn ]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"
ROOT="$(pwd)"
API="$ROOT/apps/api"
WEB="$ROOT/apps/web"
[ -f "$ROOT/pnpm-workspace.yaml" ] || die "Run this script from the project root."

case "$(uname -s)" in
  Linux*) OS=linux ;;
  Darwin*) OS=mac ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *) die "Unsupported OS: $(uname -s)" ;;
esac
info "OS: $OS"

DB_USER=nossef; DB_PASS=nossef_dev; DB_NAME=nossef; PG_PORT=5432
PG_SUPER_PASS="${PG_SUPERUSER_PASSWORD:-postgres_dev}"
PG_PORTABLE="${LOCALAPPDATA:-$HOME}/pgsql17"; PG_DATA="${LOCALAPPDATA:-$HOME}/pgdata17"

need_sudo() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
have() { command -v "$1" >/dev/null 2>&1; }
winget_install() {
  have winget.exe || have winget || die "winget not found. Install $1 manually, then rerun."
  winget.exe install --id "$1" -e --accept-source-agreements --accept-package-agreements --silent || warn "winget reported an error for $1 (may already be installed)"
}

# ----------------------------------------------------------------------------- Node 22 + pnpm
node_ok() { have node && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; }
ensure_node() {
  if node_ok; then ok "Node $(node -v)"; else
    info "Installing Node.js 22 LTS ..."
    case "$OS" in
      windows) winget_install OpenJS.NodeJS.22; export PATH="/c/Program Files/nodejs:$PATH" ;;
      *)
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        # shellcheck disable=SC1091
        . "$NVM_DIR/nvm.sh"; nvm install 22; nvm alias default 22 >/dev/null ;;
    esac
    node_ok || die "Node >= 22.13 still missing. Open a new terminal and rerun."
    ok "Node $(node -v)"
  fi
  if ! have pnpm; then info "Installing pnpm ..."; npm install -g pnpm@10 >/dev/null; fi
  ok "pnpm $(pnpm -v)"
}

# ----------------------------------------------------------------------------- Python 3.12
PY=""
find_python() {
  for c in "py -3.12" python3.12 python3 python; do
    if $c -c 'import sys;sys.exit(0 if sys.version_info[:2]==(3,12) else 1)' >/dev/null 2>&1; then PY="$c"; return 0; fi
  done
  return 1
}
ensure_python() {
  if ! find_python; then
    info "Installing Python 3.12 ..."
    case "$OS" in
      windows) winget_install Python.Python.3.12 ;;
      mac) brew install python@3.12 ;;
      linux)
        if have apt-get; then need_sudo apt-get update -y && need_sudo apt-get install -y python3.12 python3.12-venv || die "Install Python 3.12 (e.g. deadsnakes PPA) and rerun."
        elif have dnf; then need_sudo dnf install -y python3.12
        else die "Install Python 3.12 manually and rerun."; fi ;;
    esac
    find_python || die "Python 3.12 not found after install. Open a new terminal and rerun."
  fi
  ok "Python $($PY --version 2>&1)"
}

# ----------------------------------------------------------------------------- PostgreSQL 17
pg_listening() { (echo > "/dev/tcp/127.0.0.1/$PG_PORT") >/dev/null 2>&1; }
SUPER_DSN=""
start_portable_pg() {
  powershell.exe -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '$(cygpath -w "$PG_PORTABLE/bin/pg_ctl.exe")' -ArgumentList 'start','-D','$(cygpath -w "$PG_DATA")','-l','$(cygpath -w "$PG_DATA/server.log")','-o','\"-p $PG_PORT -c listen_addresses=localhost\"'" >/dev/null
  for _ in $(seq 1 30); do pg_listening && return 0; sleep 1; done
  die "PostgreSQL did not start; see $PG_DATA/server.log"
}
ensure_postgres() {
  if pg_listening; then
    ok "PostgreSQL is listening on :$PG_PORT"
  else
    case "$OS" in
      linux)
        info "Installing PostgreSQL 17 (PGDG) ..."
        have apt-get || die "Install PostgreSQL 17 manually (https://www.postgresql.org/download/) and rerun."
        need_sudo apt-get install -y postgresql-common ca-certificates curl
        need_sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
        need_sudo apt-get install -y postgresql-17
        need_sudo systemctl enable --now postgresql ;;
      mac)
        have brew || die "Homebrew is required on macOS: https://brew.sh"
        brew install postgresql@17 && brew services start postgresql@17 ;;
      windows)
        if [ -x "$PG_PORTABLE/bin/pg_ctl.exe" ] && [ -d "$PG_DATA" ]; then
          info "Starting portable PostgreSQL ..."
        else
          # Portable official binaries (no admin rights needed), repackaged on Maven Central.
          info "Installing portable PostgreSQL 17 into $PG_PORTABLE ..."
          local v=17.11.0 tmp; tmp="$(mktemp -d)"
          local url="https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/$v/embedded-postgres-binaries-windows-amd64-$v.jar"
          curl -fsSLo "$tmp/pg.jar" "$url"
          [ "$(sha1sum "$tmp/pg.jar" | cut -d' ' -f1)" = "$(curl -fsSL "$url.sha1")" ] || die "Checksum mismatch for PostgreSQL download."
          (cd "$tmp" && unzip -oq pg.jar postgres-windows-x86_64.txz)
          mkdir -p "$PG_PORTABLE" && (cd "$PG_PORTABLE" && xz -dc "$tmp/postgres-windows-x86_64.txz" | tar -xf -)
          printf '%s\n' "$PG_SUPER_PASS" > "$tmp/pw"
          "$PG_PORTABLE/bin/initdb.exe" -D "$PG_DATA" -U postgres --pwfile="$tmp/pw" -A scram-sha-256 -E UTF8 --locale=C >/dev/null
          rm -rf "$tmp"
        fi
        start_portable_pg ;;
    esac
    pg_listening || die "PostgreSQL is not reachable on :$PG_PORT"
    ok "PostgreSQL running"
  fi
}
create_database() {
  if [ "$OS" = linux ] && have sudo && sudo -n -u postgres true 2>/dev/null; then
    need_sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || need_sudo -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS' CREATEDB"
    need_sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || need_sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  else
    local super="${PG_SUPERUSER:-postgres}"
    [ "$OS" = mac ] && super="${PG_SUPERUSER:-$(whoami)}"
    "$VENV_PY" "$ROOT/infra/scripts/create_db.py" \
      "host=localhost port=$PG_PORT user=$super password=$PG_SUPER_PASS dbname=postgres" "$DB_USER" "$DB_PASS" "$DB_NAME" \
      || die "Could not create the database. Set PG_SUPERUSER / PG_SUPERUSER_PASSWORD for your PostgreSQL and rerun."
  fi
  ok "Database $DB_NAME ready"
}

# ----------------------------------------------------------------------------- app
VENV_PY=""
setup_env_files() {
  if [ ! -f "$ROOT/.env" ]; then
    local secret; secret="$($PY -c 'import secrets;print(secrets.token_urlsafe(50))')"
    sed -e "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$secret|" \
        -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:$PG_PORT/$DB_NAME|" \
        "$ROOT/.env.example" > "$ROOT/.env"
    ok "Created .env (local secrets, not committed)"
  fi
  [ -f "$WEB/.env.local" ] || cp "$WEB/.env.example" "$WEB/.env.local"
}
setup_api() {
  if [ ! -d "$API/.venv" ]; then info "Creating Python virtualenv ..."; (cd "$API" && $PY -m venv .venv); fi
  if [ -x "$API/.venv/Scripts/python.exe" ]; then VENV_PY="$API/.venv/Scripts/python.exe"; else VENV_PY="$API/.venv/bin/python"; fi
  info "Installing Python dependencies (pinned lock) ..."
  "$VENV_PY" -m pip install -q --upgrade pip
  "$VENV_PY" -m pip install -q -r "$API/requirements/lock.txt"
  ok "Backend dependencies installed"
}
migrate_and_seed() {
  cd "$API"
  if [ "$RESET_DB" -eq 1 ]; then
    warn "Resetting database $DB_NAME ..."
    "$VENV_PY" manage.py flush --no-input
  fi
  "$VENV_PY" manage.py migrate --no-input
  "$VENV_PY" manage.py seed_reference_data
  [ "$DEMO" -eq 1 ] && "$VENV_PY" manage.py seed_demo_school
  "$VENV_PY" manage.py check_data_integrity
  cd "$ROOT"
  ok "Database migrated and seeded"
}
setup_web() {
  info "Installing web dependencies ..."
  pnpm install --frozen-lockfile
  if [ "$MODE" = prod ]; then info "Building web ..."; pnpm --filter @nossef/web build; fi
  ok "Web ready"
}

lan_ip() {
  case "$OS" in
    linux) hostname -I 2>/dev/null | awk '{print $1}' ;;
    mac) ipconfig getifaddr en0 2>/dev/null || true ;;
    windows) ipconfig 2>/dev/null | tr -d '\r' | grep -E 'IPv4' | head -n1 | sed 's/.*: *//' ;;
  esac
}

run_all() {
  [ -n "$VENV_PY" ] || { if [ -x "$API/.venv/Scripts/python.exe" ]; then VENV_PY="$API/.venv/Scripts/python.exe"; else VENV_PY="$API/.venv/bin/python"; fi; }
  pg_listening || { [ "$OS" = windows ] && [ -d "$PG_DATA" ] && start_portable_pg; } || die "PostgreSQL is not running."
  local ip; ip="$(lan_ip || true)"
  echo
  ok "SIMS NOSSEF is starting"
  echo "   Local    : http://localhost:3000"
  [ -n "$ip" ] && echo "   Network  : http://$ip:3000   (allow port 3000 in the firewall if needed)"
  [ "$DEMO" -eq 1 ] && echo "   Demo     : password nossef2026 for admin, sekretaria, maria.martins, agostinho.freitas, finansas, inan-aman … (see README)"
  echo "   Stop     : Ctrl+C"
  echo
  (cd "$API" && "$VENV_PY" manage.py runserver 127.0.0.1:8000) &
  local api_pid=$!
  trap 'kill $api_pid 2>/dev/null || true' EXIT INT TERM
  if [ "$MODE" = dev ]; then pnpm --filter @nossef/web dev; else pnpm --filter @nossef/web start; fi
}

if [ "$ONLY_START" -eq 1 ]; then run_all; exit 0; fi
ensure_node
ensure_python
setup_api
ensure_postgres
setup_env_files
create_database
migrate_and_seed
setup_web
[ "$START" -eq 1 ] && run_all || info "Done. Start later with: bash setup.sh --start"
