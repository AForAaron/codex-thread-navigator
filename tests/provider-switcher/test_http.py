import http.cookiejar
import json
import pathlib
import socket
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'tools/provider-switcher'))
import control
from configuration import Configuration

class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.config = Configuration(cls.temp.name)
        cls.config.path.write_text('model = "original"\n')
        cls.config.save_state({'verification': {'gpt-5.6-luna': {'toolPassed': True}}})
        cls.config.setup()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); cls.port = sock.getsockname()[1]
        cls.origin = 'http://127.0.0.1:' + str(cls.port)
        cls.server = None
        original = control.Server
        def capture(*args):
            cls.server = original(*args); return cls.server
        control.Server = capture
        cls.thread = threading.Thread(target=control.serve, args=(cls.port, cls.config), daemon=True)
        cls.thread.start()
        for _ in range(100):
            if cls.server: break
            time.sleep(.01)
        control.Server = original
        # The server is local; ignore http(s)_proxy so a proxy cannot answer for it (e.g. 502 for a wrong Host).
        no_proxy = urllib.request.ProxyHandler({})
        cls.bare = urllib.request.build_opener(no_proxy)
        cls.client = urllib.request.build_opener(no_proxy, urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        cls.client.open(cls.origin + '/').read()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(timeout=2); cls.temp.cleanup()

    def test_status_requires_local_session_cookie(self):
        with self.assertRaises(urllib.error.HTTPError) as error: self.bare.open(self.origin + '/api/status')
        self.assertEqual(error.exception.code, 403)
        self.assertEqual(json.load(self.client.open(self.origin + '/api/status'))['model'], 'original')

    def test_cross_origin_mutation_is_blocked_even_with_cookie(self):
        request = urllib.request.Request(self.origin + '/api/apply', b'{}', {'Origin': 'https://untrusted.example', 'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as error: self.client.open(request)
        self.assertEqual(error.exception.code, 403)
        self.assertEqual(self.config.summary()['model'], 'original')

    def test_wrong_host_is_blocked(self):
        request = urllib.request.Request(self.origin + '/api/status', headers={'Host': 'attacker.example'})
        with self.assertRaises(urllib.error.HTTPError) as error: self.client.open(request)
        self.assertEqual(error.exception.code, 403)

    def test_unknown_model_is_blocked_without_changing_configuration(self):
        before = self.config.read()
        payload = json.dumps({'provider': 'opencode-go', 'model': 'kimi-k3', 'revision': self.config.summary()['revision']}).encode()
        request = urllib.request.Request(self.origin + '/api/apply', payload, {'Origin': self.origin, 'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as error: self.client.open(request)
        self.assertEqual(error.exception.code, 409)
        self.assertEqual(self.config.read(), before)

if __name__ == '__main__': unittest.main()
