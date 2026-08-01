#!/usr/bin/env sh
set -eu

TARGET="$HOME/multiteachercodex"
REPO="https://github.com/genji970/multiteachercodex.git"

if [ -d "$TARGET/.git" ]; then
  printf '[MultiTeacherCodex] Updating %s\n' "$TARGET"
  git -C "$TARGET" pull --ff-only
elif [ -e "$TARGET" ]; then
  printf '%s already exists but is not a Git repository. Rename or remove it first.\n' "$TARGET" >&2
  exit 1
else
  printf '[MultiTeacherCodex] Cloning into %s\n' "$TARGET"
  git clone "$REPO" "$TARGET"
fi

exec sh "$TARGET/run.sh"
