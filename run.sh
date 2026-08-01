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
    printf 'curl 또는 wget이 필요합니다.\n' >&2
    exit 1
  fi
}

install_portable_node() {
  step "Node.js 22를 사용자 폴더에 자동 설치합니다. sudo는 필요하지 않습니다."

  machine=$(uname -m)
  case "$machine" in
    x86_64|amd64) node_arch=x64 ;;
    aarch64|arm64) node_arch=arm64 ;;
    *)
      printf '지원하지 않는 CPU 아키텍처입니다: %s\n' "$machine" >&2
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
    printf '최신 Node.js 22 Linux 패키지를 찾지 못했습니다.\n' >&2
    exit 1
  fi

  archive_path="${TMPDIR:-/tmp}/$archive"
  download "https://nodejs.org/dist/latest-v22.x/$archive" "$archive_path"
  tar -xJf "$archive_path" -C "$PORTABLE_NODE_ROOT" --strip-components=1
  rm -f "$archive_path"

  NODE_HOME=$PORTABLE_NODE_ROOT
}

cd "$PROJECT_ROOT"

[ -f package.json ] || { printf 'package.json이 없습니다. 저장소 루트에서 실행하세요.\n' >&2; exit 1; }
[ -f extension/manifest.json ] || { printf 'extension/manifest.json이 없습니다. git pull 후 다시 실행하세요.\n' >&2; exit 1; }
[ -f dist/cli.js ] || { printf 'dist/cli.js가 없습니다. 최신 저장소를 다시 받아주세요.\n' >&2; exit 1; }

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

step "Node $($NODE_BIN --version), npm $($NPM_BIN --version)"

if [ ! -f node_modules/@modelcontextprotocol/sdk/package.json ] || \
   [ ! -f node_modules/dotenv/package.json ] || \
   [ ! -f node_modules/zod/package.json ]; then
  step "필요한 npm 패키지를 자동 설치합니다."
  "$NPM_BIN" install --omit=dev --no-audit --no-fund --package-lock=false
fi

export MTC_AUTO_OPEN_BROWSER=1
export MTC_BROWSER_PROFILE_DIR="$BROWSER_PROFILE_DIR"

if "$NODE_BIN" -e "fetch('$HEALTH_URL').then(r=>r.json()).then(v=>process.exit(v.status==='ok'?0:1)).catch(()=>process.exit(1))"; then
  step "이미 실행 중인 리뷰 서버를 재사용하고 ChatGPT 브라우저 창을 엽니다."
  exec "$NODE_BIN" ./dist/open-browser.js
fi

step "서버를 시작합니다. 이 터미널에 질문, 초안, 외부 검토, 전달 지침, 최종 답변이 모두 출력됩니다."
step "이 터미널은 ChatGPT를 사용하는 동안 닫지 마세요."
printf '\n'
exec "$NODE_BIN" ./dist/cli.js "$@"
