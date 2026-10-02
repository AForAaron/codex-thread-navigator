#!/usr/bin/env python3
"""Run isolated Codex tool probes; retain only model IDs and aggregate results."""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'tools/provider-switcher'))
from configuration import Configuration, MODELS, PROVIDER_TOML, SERVICE, ACCOUNT

parser = argparse.ArgumentParser()
parser.add_argument('--models', nargs='+', choices=list(MODELS))
options = parser.parse_args()

binary = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'
config = Configuration()
results = {}
credential = subprocess.check_output(['/usr/bin/security', 'find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], text=True).strip()
with tempfile.TemporaryDirectory(prefix='codex-go-probe-') as folder:
    root = pathlib.Path(folder); home = root / 'home'; work = root / 'fixture'
    home.mkdir(); work.mkdir()
    (work / 'probe.txt').write_text('GO_TOOL_PROBE_7241\n')
    (home / 'config.toml').write_text(PROVIDER_TOML)
    for model in options.models or MODELS:
        started = time.time()
        env = dict(os.environ, CODEX_HOME=str(home))
        prompt = 'Use your shell tool to read ./probe.txt. Do not modify any files. Return only the exact content of that file.'
        command = [binary, '--strict-config', '-c', 'model_provider="opencode-go"', '-m', model,
                   'exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--json', '-C', str(work), prompt]
        try:
            run = subprocess.run(command, env=env, capture_output=True, text=True, timeout=100)
            events = []
            for line in run.stdout.splitlines():
                try: events.append(json.loads(line))
                except ValueError: pass
            items = [e.get('item', {}) for e in events if e.get('type') == 'item.completed']
            tools = [item for item in items if item.get('type') == 'command_execution' and item.get('exit_code') == 0 and 'GO_TOOL_PROBE_7241' in item.get('aggregated_output', '')]
            answers = [item.get('text', '') for item in items if item.get('type') == 'agent_message']
            passed = run.returncode == 0 and bool(tools) and any(answer.strip() == 'GO_TOOL_PROBE_7241' for answer in answers)
            error = next((e.get('message') for e in events if e.get('type') == 'error'), None)
            if error:
                print(json.dumps({'model': model, 'diagnostic': str(error).replace(credential, '<REDACTED>')[:1800]}, ensure_ascii=False), flush=True)
            # Only aggregate results are persisted, never provider diagnostic text.
            results[model] = {'toolPassed': passed, 'seconds': round(time.time()-started, 1),
                              'exitCode': run.returncode, 'errorReported': bool(error),
                              'scope': 'Codex 0.159.2 · read-only shell · tool result', 'checkedAt': time.time()}
        except subprocess.TimeoutExpired:
            results[model] = {'toolPassed': False, 'seconds': 100, 'errorReported': True,
                              'scope': '验证超时', 'checkedAt': time.time()}
        print(json.dumps({'model': model, **results[model]}, ensure_ascii=False), flush=True)
        # Preserve previous results when a later probe is interrupted.
        state = config.state(); state.setdefault('verification', {}).update(results); config.save_state(state)
