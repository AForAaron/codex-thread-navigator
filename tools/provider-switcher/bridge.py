#!/usr/bin/env python3
"""Fixed-operation stdin bridge; no listening port and no credentials in replies."""
import sys
import json
from configuration import Configuration, MODELS
from control import usage
import threading
from concurrent.futures import ThreadPoolExecutor
output_lock = threading.Lock()
usage_executor = ThreadPoolExecutor(max_workers=1)
def emit(reply):
    with output_lock:
        print(json.dumps(reply, ensure_ascii=False), flush=True)
def read_usage(request_id):
    try: emit({"id": request_id, "result": usage()})
    except Exception: emit({"id": request_id, "error": "用量读取失败，请刷新"})
config = Configuration()
for line in sys.stdin:
    try:
        req = json.loads(line)
        if req['operation'] == 'status':
            result = config.summary()
            result['models'] = [{'id': m, 'name': n, **result['verification'].get(m, {})} for m, n in MODELS.items()]
        elif req['operation'] == 'usage':
            usage_executor.submit(read_usage, req['id'])
            continue
        elif req['operation'] == 'apply':
            body = req.get('body', {})
            result = config.apply(body.get('provider'), body.get('model'), body.get('revision'))
        else: raise ValueError('不支持这个操作')
        reply = {'id': req['id'], 'result': result}
    except Exception as error:
        reply = {'id': req.get('id'), 'error': str(error) if isinstance(error, ValueError) else '操作失败，请重新打开面板'}
    emit(reply)
