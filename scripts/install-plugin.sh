#!/usr/bin/env bash
# Copy the built Explodex plugin into ~/.explodex/plugins/codex-navigator.
# Does NOT launch Codex, ChatGPT, or explodex. Does NOT inject.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_JSON="$ROOT/packages/plugin/plugin.json"
SRC_JS="$ROOT/dist/plugin/index.js"
DEST="${HOME}/.explodex/plugins/codex-navigator"

if [[ ! -f "$SRC_JS" ]]; then
  echo "missing $SRC_JS — run npm run build first" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$SRC_JSON" "$DEST/plugin.json"
cp "$SRC_JS" "$DEST/index.js"
cp "$ROOT/packages/plugin/README.md" "$DEST/README.md"
echo "installed plugin files to $DEST"
echo "Safe Mode remains: open /Applications/ChatGPT.app directly; do not run explodex."
