#!/usr/bin/env bash
# Start the signed ChatGPT.app (Codex desktop) with a local CDP port, then load
# only this repository's installed, default-off Explodex plugin. Does not patch
# the app bundle or terminate a running app. Quit and reopen normally to undo.
#
# Usage:
#   bash scripts/launch-usage-rail.sh               # foreground; Ctrl+C unloads the plugin
#   bash scripts/launch-usage-rail.sh --background  # used by "Codex Navigator.app":
#                                                   # errors become macOS alerts, output goes to the log
# The session ends by itself when Codex quits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="/Applications/ChatGPT.app"
PLUGIN="${HOME}/.explodex/plugins/codex-navigator"
LOG_DIR="${HOME}/Library/Logs/CodexNavigator"
BACKGROUND=0
[[ "${1:-}" == "--background" ]] && BACKGROUND=1

# Apps launched from Finder/Dock get a minimal PATH; node and codex live in Homebrew.
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

if (( BACKGROUND )); then
  mkdir -p "$LOG_DIR"
  exec >>"$LOG_DIR/launcher.log" 2>&1
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') launch (background) ==="
fi

fail() {
  echo "$1" >&2
  if (( BACKGROUND )); then
    /usr/bin/osascript -e "display alert \"Codex Navigator\" message \"${1//\"/\\\"}\" as warning" >/dev/null 2>&1 || true
  fi
  exit 2
}

# A fixed port is predictable to other local processes; pick a free random one unless set.
if [[ -n "${EXPLODEX_DEBUG_PORT:-}" ]]; then
  PORT="$EXPLODEX_DEBUG_PORT"
else
  PORT=""
  for _ in {1..20}; do
    candidate=$(( 20000 + RANDOM % 40000 ))
    if ! /usr/sbin/lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then PORT="$candidate"; break; fi
  done
  [[ -n "$PORT" ]] || fail "没有找到可用的本机端口，请稍后重试。"
fi

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  fail "Invalid EXPLODEX_DEBUG_PORT: ${PORT}"
fi
if [[ ! -f "$PLUGIN/plugin.json" || ! -f "$PLUGIN/index.js" ]]; then
  fail "插件文件缺失。请在项目目录运行：bash scripts/install-plugin.sh"
fi
if [[ ! -x "$ROOT/node_modules/.bin/explodex" ]]; then
  fail "本地 Explodex 运行时缺失。请先在项目目录运行 npm install。"
fi
command -v node >/dev/null 2>&1 || fail "找不到 node。请先安装 Node.js（Homebrew）。"
if ! /usr/bin/codesign --verify --strict "$APP"; then
  fail "ChatGPT.app 签名校验失败，已拒绝注入。请用普通方式打开 Codex。"
fi
# No early `exit` in awk: under pipefail, ps would get SIGPIPE and silently abort the script.
running_args="$(/bin/ps -axo args= | /usr/bin/awk '/^\/Applications\/ChatGPT[.]app\/Contents\/MacOS\/ChatGPT([[:space:]]|$)/ && !found {print; found=1}')"
if [[ -n "$running_args" ]]; then
  if [[ "$running_args" == *"--remote-debugging-port="* ]]; then
    # Already started by Codex Navigator: just bring it to the front.
    echo "Codex is already running with Codex Navigator; activating it."
    /usr/bin/open -a "$APP"
    exit 0
  fi
  fail "Codex 已经在运行（普通模式）。请先完全退出 Codex（⌘Q），再从 Codex Navigator 打开。"
fi
if /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "端口 ${PORT} 已被占用，请重试。"
fi

echo "Opening signed ChatGPT.app with local debug port ${PORT}..."
/usr/bin/open -a "$APP" --args "--remote-debugging-port=${PORT}"
ready=false
for _ in {1..60}; do
  if /usr/bin/curl --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null; then
    ready=true
    break
  fi
  sleep 0.5
done
if [[ "$ready" != true ]]; then
  fail "Codex 没有打开调试端口，插件未加载。请退出 Codex 后用普通方式打开。"
fi
owner_pid="$(/usr/sbin/lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN | /usr/bin/awk 'NR==1')"
owner_args="$(/bin/ps -p "$owner_pid" -o args=)"
if [[ "$owner_args" != "$APP/Contents/MacOS/ChatGPT"* ]]; then
  fail "端口 ${PORT} 不属于 ChatGPT.app，已拒绝注入。"
fi

echo "Loading Codex Navigator, Chat directory, and the official read-only quota feed..."
if ! EXPLODEX_DEBUG_PORT="$PORT" node "$ROOT/scripts/inject-usage-rail.mjs"; then
  # Distinguish "Codex was quit" (normal end) from a real load failure.
  if /bin/ps -p "$owner_pid" >/dev/null 2>&1; then
    fail "插件加载失败，详情见 ~/Library/Logs/CodexNavigator/launcher.log。Codex 仍可正常使用，但三项功能未启用。"
  fi
fi
echo "Session ended: $(date '+%Y-%m-%d %H:%M:%S')"

# Restart requested from the in-Codex provider panel ("重启 Codex 以应用"): reopen through Navigator.
# The marker is deleted before relaunching so a failure can never loop.
RESTART_FLAG="${HOME}/Library/Application Support/CodexNavigator/restart-requested"
if [[ -f "$RESTART_FLAG" ]]; then
  requested_ms="$(cat "$RESTART_FLAG" 2>/dev/null || echo 0)"
  rm -f "$RESTART_FLAG"
  now_ms=$(( $(date +%s) * 1000 ))
  if [[ "$requested_ms" =~ ^[0-9]+$ ]] && (( now_ms - requested_ms < 120000 )); then
    echo "Restart requested from the provider panel; waiting for Codex to quit..."
    for _ in {1..120}; do
      [[ -z "$(/bin/ps -axo args= | /usr/bin/awk '/^\/Applications\/ChatGPT[.]app\/Contents\/MacOS\/ChatGPT([[:space:]]|$)/ && !found {print; found=1}')" ]] && break
      sleep 0.5
    done
    if [[ -n "$(/bin/ps -axo args= | /usr/bin/awk '/^\/Applications\/ChatGPT[.]app\/Contents\/MacOS\/ChatGPT([[:space:]]|$)/ && !found {print; found=1}')" ]]; then
      fail "Codex 在 60 秒内没有退出（可能在等你确认退出），已取消自动重启。退出后请从 Codex Navigator 重新打开。"
    fi
    sleep 1
    echo "Relaunching through Codex Navigator..."
    unset EXPLODEX_DEBUG_PORT
    if (( BACKGROUND )); then exec /bin/bash "$0" --background; else exec /bin/bash "$0"; fi
  fi
  echo "Ignoring a stale restart marker."
fi
