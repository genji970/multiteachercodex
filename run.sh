#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DATA_ROOT=${XDG_DATA_HOME:-"$HOME/.local/share"}/multiteachercodex
PORTABLE_NODE_ROOT="$APP_DATA_ROOT/node"
BROWSER_PROFILE_DIR="$APP_DATA_ROOT/browser-profile"
HEALTH_URL="http://127.0.0.1:8787/health"

step() {
  printf '[MultiTeacherCodex] %s\n' "$1"
}

node_major() {
  if command -v node >/dev/null 2>&1; then
    node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1
  else
    printf '0\n'
  fi
}

download() {
  url=$1
  output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$output" "$url"
  else
    printf 'curl or wget is required.\n' >&2
    exit 1
  fi
}

install_portable_node() {
  step "Installing portable Node.js 22 in your user profile (no sudo required)."

  machine=$(uname -m)
  case "$machine" in
    x86_64|amd64) node_arch=x64 ;;
    aarch64|arm64) node_arch=arm64 ;;
    *)
      printf 'Unsupported CPU architecture: %s\n' "$machine" >&2
      exit 1
      ;;
  esac

  mkdir -p "$APP_DATA_ROOT"
  rm -rf "$PORTABLE_NODE_ROOT"
  mkdir -p "$PORTABLE_NODE_ROOT"

  sums_file="${TMPDIR:-/tmp}/multiteachercodex-node-sums-$$.txt"
  download "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" "$sums_file"
  archive=$(awk -v arch="$node_arch" '$2 ~ ("node-v[0-9.]+-linux-" arch "\\.tar\\.xz$") { print $2; exit }' "$sums_file")
  rm -f "$sums_file"

  if [ -z "$archive" ]; then
    printf 'Could not locate the latest Node.js 22 Linux package.\n' >&2
    exit 1
  fi

  archive_path="${TMPDIR:-/tmp}/$archive"
  download "https://nodejs.org/dist/latest-v22.x/$archive" "$archive_path"
  tar -xJf "$archive_path" -C "$PORTABLE_NODE_ROOT" --strip-components=1
  rm -f "$archive_path"

  NODE_HOME=$PORTABLE_NODE_ROOT
}

cd "$PROJECT_ROOT"

[ -f package.json ] || { printf 'package.json is missing. Run run.sh from the repository root.\n' >&2; exit 1; }
[ -f extension/manifest.json ] || { printf 'extension/manifest.json is missing. Update the repository and try again.\n' >&2; exit 1; }
[ -f dist/cli.js ] || { printf 'dist/cli.js is missing. Update the repository and try again.\n' >&2; exit 1; }

major=$(node_major)
case "$major" in
  ''|*[!0-9]*) major=0 ;;
esac

if [ "$major" -ge 20 ]; then
  NODE_BIN=$(command -v node)
  NODE_HOME=$(dirname "$NODE_BIN")
else
  install_portable_node
fi

PATH="$NODE_HOME:$PATH"
export PATH
NODE_BIN="$NODE_HOME/node"
NPM_BIN="$NODE_HOME/npm"

case " ${NODE_OPTIONS:-} " in
  *" --dns-result-order="*) ;;
  *) NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first" ;;
esac
export NODE_OPTIONS

step "Node $($NODE_BIN --version), npm $($NPM_BIN --version)"

if [ ! -f node_modules/@modelcontextprotocol/sdk/package.json ] || \
   [ ! -f node_modules/dotenv/package.json ] || \
   [ ! -f node_modules/zod/package.json ]; then
  step "Installing required npm packages."
  "$NPM_BIN" install --omit=dev --no-audit --no-fund --package-lock=false
fi

export MTC_AUTO_OPEN_BROWSER=1
export MTC_BROWSER_PROFILE_DIR="$BROWSER_PROFILE_DIR"

if "$NODE_BIN" -e "fetch('$HEALTH_URL').then(r=>r.json()).then(v=>process.exit(v.status==='ok'?0:1)).catch(()=>process.exit(1))"; then
  step "Reusing the running review server and opening ChatGPT."
  exec "$NODE_BIN" ./dist/open-browser.js
fi

step "Starting the review server."
step "This terminal will print the question, draft, external review, revision instruction, and final answer."
step "Keep this terminal open while using ChatGPT."
printf '\n'
exec "$NODE_BIN" ./dist/cli.js "$@"
