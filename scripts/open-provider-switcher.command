#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if curl --silent --fail --max-time 1 http://127.0.0.1:8766/health | python3 -c 'import sys,json; sys.exit(0 if json.load(sys.stdin).get("product") == "codex-provider-switcher" else 1)' 2>/dev/null; then
  open http://127.0.0.1:8766/
  echo "已打开正在运行的模型控制页。"
  exit
fi
echo "启动 Codex 模型来源控制页；关闭此终端即可停止本地服务。"
python3 tools/provider-switcher/control.py &
SERVICE_PID=$!
trap 'kill "$SERVICE_PID" 2>/dev/null || true' EXIT INT TERM
for _ in {1..30}; do
  if curl --silent --fail --max-time 1 http://127.0.0.1:8766/ >/dev/null; then
    open http://127.0.0.1:8766/
    wait "$SERVICE_PID"
    exit
  fi
  sleep .2
done
echo "本地服务未能启动；检查 8766 端口是否已被占用。"
exit 1
