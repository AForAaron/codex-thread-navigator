import pathlib
import subprocess
import sys
import unittest

class BridgeTests(unittest.TestCase):
    def test_slow_usage_does_not_block_save(self):
        bridge = pathlib.Path(__file__).resolve().parents[2] / 'tools/provider-switcher/bridge.py'
        harness = '''import runpy,sys,types,time
configuration=types.ModuleType('configuration')
class Config:
 def apply(self,*args): return {'saved':True}
configuration.Configuration=Config
configuration.MODELS={}
control=types.ModuleType('control')
def usage():
 time.sleep(1)
 return {'windows':[]}
control.usage=usage
sys.modules['configuration']=configuration
sys.modules['control']=control
runpy.run_path(sys.argv[1],run_name='__main__')
'''
        proc = subprocess.run([sys.executable, '-c', harness, str(bridge)], input='{"id":1,"operation":"usage"}\n{"id":2,"operation":"apply","body":{}}\n', capture_output=True, text=True, timeout=5)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        import json
        replies = [json.loads(line) for line in proc.stdout.splitlines()]
        self.assertEqual([reply['id'] for reply in replies], [2, 1])
        self.assertTrue(replies[0]['result']['saved'])
