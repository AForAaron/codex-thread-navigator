#!/usr/bin/env bash
# Start the signed ChatGPT.app (Codex desktop) with a local CDP port, then load
# only this repository's installed, default-off Explodex plugin. Does not patch
# the app bundle or terminate a running app. Quit and reopen normally to undo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="/Applications/ChatGPT.app"
PLUGIN="${HOME}/.explodex/plugins/codex-navigator"
PORT="${EXPLODEX_DEBUG_PORT:-9333}"

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "Invalid EXPLODEX_DEBUG_PORT: $PORT" >&2
  exit 2
fi
if [[ ! -f "$PLUGIN/plugin.json" || ! -f "$PLUGIN/index.js" ]]; then
  echo "Plugin files missing. Run: bash scripts/install-plugin.sh" >&2
  exit 2
fi
if [[ ! -x "$ROOT/node_modules/.bin/explodex" ]]; then
  echo "Local Explodex runtime missing. Run npm install in the project first." >&2
  exit 2
fi
if ! /usr/bin/codesign --verify --strict "$APP"; then
  echo "App signature verification failed. Do not inject into this copy." >&2
  exit 2
fi
if /bin/ps -axo args= | /usr/bin/awk '/^\/Applications\/ChatGPT[.]app\/Contents\/MacOS\/ChatGPT([[:space:]]|$)/ {found=1} END {exit !found}'; then
  echo "ChatGPT.app is already running. Quit it fully, then rerun this command." >&2
  exit 2
fi
if /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Choose another EXPLODEX_DEBUG_PORT." >&2
  exit 2
fi

echo "Opening signed ChatGPT.app with local debug port $PORT..."
/usr/bin/open -a "$APP" --args "--remote-debugging-port=$PORT"
ready=false
for _ in {1..60}; do
  if /usr/bin/curl --silent --fail --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null; then
    ready=true
    break
  fi
  sleep 0.5
done
if [[ "$ready" != true ]]; then
  echo "The app did not open a debug port. Quit it and reopen normally; no plugin was injected." >&2
  exit 2
fi
owner_pid="$(/usr/sbin/lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN | /usr/bin/head -n 1)"
owner_args="$(/bin/ps -p "$owner_pid" -o args=)"
if [[ "$owner_args" != "$APP/Contents/MacOS/ChatGPT"* ]]; then
  echo "Port $PORT is not owned by ChatGPT.app. Refusing to inject." >&2
  exit 2
fi

echo "Loading Codex Navigator, Chat directory, and the official read-only quota feed..."
EXPLODEX_DEBUG_PORT="$PORT" node "$ROOT/scripts/inject-usage-rail.mjs"
