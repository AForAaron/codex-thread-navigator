"""Build content-addressed Go catalogs and validate with the desktop backend."""
import json
import os
import pathlib
import selectors
import subprocess
import tempfile
import time

BINARY = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'

def validate_backend(path, expected):
    with tempfile.TemporaryDirectory(prefix='codex-catalog-check-') as folder:
        home = pathlib.Path(folder)
        (home / 'config.toml').write_text('model_catalog_json = ' + json.dumps(str(path)) + '\n')
        proc = subprocess.Popen([BINARY, 'app-server', '--listen', 'stdio://'], env=dict(os.environ, CODEX_HOME=folder), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        selector = selectors.DefaultSelector()
        selector.register(proc.stdout, selectors.EVENT_READ)
        def rpc(req):
            proc.stdin.write(json.dumps(req) + '\n'); proc.stdin.flush()
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if not selector.select(max(0, deadline-time.monotonic())): break
                line = proc.stdout.readline()
                if not line: break
                response = json.loads(line)
                if response.get('id') == req['id']:
                    if 'error' in response: raise ValueError('Codex 后端拒绝模型目录')
                    return response['result']
            raise ValueError('模型目录校验超时，未切换配置')
        try:
            rpc({'id': 1, 'method': 'initialize', 'params': {'clientInfo': {'name': 'catalog-check', 'version': '1'}}})
            proc.stdin.write('{"method":"initialized"}\n'); proc.stdin.flush()
            result = rpc({'id': 2, 'method': 'model/list', 'params': {}})
            models = result.get('data', [])
            if {m.get('model', m.get('id')) for m in models} != set(expected):
                raise ValueError('Codex 返回的模型目录与已验证名单不一致')
        except (OSError, json.JSONDecodeError, KeyError) as error:
            raise ValueError('无法验证模型目录，原配置保持不变') from error
        finally:
            selector.close(); proc.terminate()
            try: proc.wait(timeout=3)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()

def catalog_text(cache_path, verified):
    try: raw = json.loads(cache_path.read_text())
    except (OSError, ValueError) as error: raise ValueError('本机模型缓存缺失或损坏，未切换配置') from error
    entries = raw.get('models')
    if not isinstance(entries, list): raise ValueError('本机模型缓存格式不正确')
    selected = []
    for slug in verified:
        matches = [entry for entry in entries if isinstance(entry, dict) and entry.get('slug') == slug]
        if len(matches) != 1: raise ValueError('模型缓存缺少或重复条目：' + slug)
        if matches[0].get('visibility') == 'hide': raise ValueError('模型缓存中的条目被隐藏：' + slug)
        selected.append(matches[0])
    if not selected: raise ValueError('没有通过验证的 Go 模型')
    return json.dumps({'models': selected}, ensure_ascii=False, sort_keys=True, indent=2) + '\n'
