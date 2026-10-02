#!/usr/bin/env python3
"""Local-only provider UI. API keys never leave the authentication consumer."""
import argparse
import http.cookies
import json
import pathlib
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from configuration import Configuration, MODELS, SERVICE, ACCOUNT, PROVIDER

ROOT = pathlib.Path(__file__).parent
API = 'https://opencode.ai/zen/go/v1/'
SESSION = str(uuid.uuid4())
COOKIE = secrets.token_urlsafe(32)
cache = {'at': 0, 'result': None}
usage_lock = threading.Lock()

def go_request(endpoint):
    if endpoint not in ('usage', 'models'): raise ValueError('unsupported endpoint')
    try:
        key = subprocess.check_output(['/usr/bin/security', 'find-generic-password',
                                      '-s', SERVICE, '-a', ACCOUNT, '-w'],
                                      text=True, stderr=subprocess.DEVNULL, timeout=30).strip()
    except (subprocess.SubprocessError, OSError):
        raise ValueError('无法读取 Keychain；检查钥匙串授权后重试')
    req = urllib.request.Request(API + endpoint, headers={
        'Authorization': 'Bearer ' + key, 'Accept': 'application/json',
        'User-Agent': 'codex_cli_rs/0.159.2', 'x-opencode-session': SESSION})
    try:
        with urllib.request.urlopen(req, timeout=25) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError('OpenCode 返回 HTTP ' + str(error.code) + '；可在控制台核对套餐状态')
    except (OSError, ValueError): raise ValueError('无法连接 OpenCode，请稍后重试')

def usage():
    with usage_lock:
        if time.time() - cache['at'] < 60: return cache['result']
        try:
            raw = go_request('usage').get('usage', {})
            windows = []
            for key, label in [('rolling', '5 小时'), ('weekly', '本周'), ('monthly', '本月')]:
                value = raw.get(key, {})
                percent = value.get('percent')
                if isinstance(percent, (int, float)) and not isinstance(percent, bool) and 0 <= percent <= 100:
                    windows.append({'id': key, 'label': label, 'usedPercent': percent,
                                    'resetsAt': value.get('resetsAt'), 'status': value.get('status')})
            result = {'windows': windows, 'updatedAt': time.time(), 'error': None if windows else '暂无可靠的用量数据'}
        except ValueError as error: result = {'windows': [], 'updatedAt': time.time(), 'error': str(error)}
        cache.update(at=time.time(), result=result)
        return result

class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True

def serve(port, configuration):
    origin = 'http://127.0.0.1:' + str(port)
    mutation_lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def respond(self, code, payload, kind='application/json; charset=utf-8', cookie=False):
            body = json.dumps(payload, ensure_ascii=False).encode() if kind.startswith('application/json') else payload
            self.send_response(code)
            self.send_header('Content-Type', kind)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            if cookie: self.send_header('Set-Cookie', 'codex_provider=' + COOKIE + '; HttpOnly; SameSite=Strict; Path=/')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        def allowed(self, mutation=False):
            if self.headers.get('Host') != '127.0.0.1:' + str(port): return False
            if self.headers.get('Sec-Fetch-Site') == 'cross-site': return False
            if mutation and self.headers.get('Origin') != origin: return False
            cookies = http.cookies.SimpleCookie()
            try: cookies.load(self.headers.get('Cookie', ''))
            except http.cookies.CookieError: return False
            token = cookies.get('codex_provider')
            return bool(token and secrets.compare_digest(token.value, COOKIE))
        def do_GET(self):
            if self.headers.get('Host') != '127.0.0.1:' + str(port): return self.respond(403, {'error': '无效的本机访问来源'})
            if self.headers.get('Sec-Fetch-Site') == 'cross-site': return self.respond(403, {'error': '禁止跨站访问'})
            if self.path == '/health': return self.respond(200, {'product': 'codex-provider-switcher', 'version': 1})
            files = {'/': ('index.html', 'text/html; charset=utf-8'), '/ui.js': ('ui.js', 'text/javascript; charset=utf-8'), '/ui.css': ('ui.css', 'text/css; charset=utf-8')}
            if self.path in files:
                name, kind = files[self.path]
                return self.respond(200, (ROOT / name).read_bytes(), kind, self.path == '/')
            if not self.allowed(): return self.respond(403, {'error': '请从本机控制页重新打开'})
            if self.path == '/api/status':
                try:
                    result = configuration.summary()
                    result['models'] = [{'id': model, 'name': name, **result['verification'].get(model, {})} for model, name in MODELS.items()]
                    return self.respond(200, result)
                except (ValueError, OSError): return self.respond(409, {'error': '配置无法读取，请检查 TOML 文件'})
            if self.path == '/api/usage': return self.respond(200, usage())
            return self.respond(404, {'error': '不存在这个操作'})
        def do_POST(self):
            if not self.allowed(True): return self.respond(403, {'error': '无效的本机操作来源'})
            if self.path != '/api/apply': return self.respond(404, {'error': '不存在这个操作'})
            if self.headers.get('Content-Type') != 'application/json': return self.respond(415, {'error': '需要 JSON 请求'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 2048: raise ValueError('请求大小无效')
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict): raise ValueError('请求格式无效')
                with mutation_lock:
                    result = configuration.apply(body.get('provider'), body.get('model'), body.get('revision'))
                return self.respond(200, result)
            except (ValueError, OSError) as error: return self.respond(409, {'error': str(error) if isinstance(error, ValueError) else '保存失败，原配置已保留'})
    server = Server(('127.0.0.1', port), Handler)
    print(origin, flush=True)
    server.serve_forever()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--setup', action='store_true')
    parser.add_argument('--status', action='store_true')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535: parser.error('invalid port')
    config = Configuration()
    if args.setup: print(json.dumps(config.setup(), ensure_ascii=False))
    elif args.status: print(json.dumps(config.summary(), ensure_ascii=False))
    else: serve(args.port, config)
