"""Validated, lossless edits to the small set of provider-owned TOML statements."""
import datetime
import getpass
import hashlib
import json
import os
import pathlib
import re
import tempfile
from catalog import catalog_text, validate_backend
try:
    import tomllib as toml
except ImportError:
    import tomli as toml

PROVIDER = 'opencode-go'
SERVICE = 'apikey/opencode-go'
# Keychain account defaults to the current macOS user (the item is added with `-a "$USER"`).
ACCOUNT = os.environ.get('CODEX_PROVIDER_KEYCHAIN_ACCOUNT') or getpass.getuser()
MODELS = {
    'gpt-5.6-luna': 'GPT 5.6 Luna', 'gpt-6-luna': 'GPT 6 Luna',
    'grok-4.6': 'Grok 4.6', 'grok-4.7': 'Grok 4.7',
    'muse-spark-1.3-contributor': 'Muse Spark 1.3',
    'muse-spark-1.2-contributor': 'Muse Spark 1.2',
}
MANAGED = ('model', 'model_provider', 'model_reasoning_effort', 'model_context_window',
           'model_auto_compact_token_limit', 'model_catalog_json')
PROVIDER_TOML = '''[model_providers.opencode-go]
name = "OpenCode Go"
base_url = "https://opencode.ai/zen/go/v1"
wire_api = "responses"
supports_websockets = false

[model_providers.opencode-go.auth]
command = "/usr/bin/security"
args = ["find-generic-password", "-s", "apikey/opencode-go", "-a", ''' + json.dumps(ACCOUNT) + ''', "-w"]
refresh_interval_ms = 0
timeout_ms = 30000
'''

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

def statements(text):
    """Scan TOML statement spans, respecting arrays, comments and multiline strings."""
    result, start, i, depth, quote, triple, escape, comment = [], 0, 0, 0, '', False, False, False
    while i < len(text):
        char = text[i]
        if comment:
            if char == '\n': comment = False
        elif quote:
            if escape:
                escape = False
            elif char == '\\' and quote == '"':
                escape = True
            elif triple and text[i:i+3] == quote * 3:
                quote = ''; triple = False; i += 2
            elif not triple and char == quote:
                quote = ''
        elif char == '#': comment = True
        elif char in ('"', "'"):
            quote = char
            triple = text[i:i+3] == char * 3
            if triple: i += 2
        elif char in '[{': depth += 1
        elif char in ']}': depth -= 1
        if char == '\n' and not quote and depth == 0:
            result.append((start, i+1, text[start:i+1])); start = i+1
        i += 1
    if start < len(text): result.append((start, len(text), text[start:]))
    return result

def root_fields(text):
    toml.loads(text)
    fields = {}
    for start, end, statement in statements(text):
        stripped = statement.lstrip()
        if not stripped or stripped.startswith('#'): continue
        if stripped.startswith('['): break
        value = toml.loads(statement)
        if len(value) != 1: raise ValueError('不支持的顶层配置语句')
        name = next(iter(value))
        if name in MANAGED:
            fields[name] = {'start': start, 'end': end, 'raw': statement, 'value': value[name]}
    return fields

def edit_root(text, changes):
    fields = root_fields(text)
    # A missing field is inserted before the first table, never inside an MCP table.
    for name, field in sorted(fields.items(), key=lambda pair: pair[1]['start'], reverse=True):
        if name in changes: text = text[:field['start']] + text[field['end']:]
    insertions = ''.join(raw.rstrip('\n') + '\n' for raw in changes.values() if raw is not None)
    updated = insertions + text
    toml.loads(updated)
    return updated

def atomic_write(path, text):
    path = pathlib.Path(path)
    if path.is_symlink(): raise ValueError('配置路径是符号链接；请先明确真实路径')
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    fd, temp = tempfile.mkstemp(prefix='.provider-write-', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w') as stream:
            stream.write(text); stream.flush(); os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp): os.unlink(temp)

class Configuration:
    def __init__(self, home=None):
        self.home = pathlib.Path(home or pathlib.Path.home() / '.codex')
        self.path = self.home / 'config.toml'
        self.state_dir = self.home / 'provider-switcher'
        self.state_path = self.state_dir / 'state.json'

    def read(self):
        return self.path.read_text() if self.path.exists() else ''

    def state(self):
        return json.loads(self.state_path.read_text()) if self.state_path.exists() else {}

    def save_state(self, state):
        atomic_write(self.state_path, json.dumps(state, indent=2, ensure_ascii=False) + '\n')

    def backup(self, text):
        name = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        atomic_write(self.state_dir / ('config-' + name + '.toml'), text)

    def recover(self):
        state = self.state()
        pending = state.get('pending')
        if not pending: return
        current = digest(self.read())
        if current == pending.get('after'):
            state.pop('pending', None)
        elif current == pending.get('before'):
            if 'previousState' not in pending:
                raise ValueError('发现旧版未完成保存，请先核对备份后恢复')
            state = pending['previousState']
        else:
            raise ValueError('未完成保存后配置又被修改，已停止自动覆盖；请核对备份')
        self.save_state(state)

    def prepare_catalog(self, state, model):
        verified = [slug for slug in MODELS if state.get('verification', {}).get(slug, {}).get('toolPassed')]
        if model not in verified: raise ValueError('所选模型未通过验证')
        record_path = self.state_dir / 'validated-catalog.json'
        try:
            text = catalog_text(self.home / 'models_cache.json', verified)
        except ValueError as cache_error:
            try:
                record = json.loads(record_path.read_text())
                filename = record['filename']
                if not re.fullmatch(r'go-models-[0-9a-f]{20}\.catalog\.json', filename): raise ValueError('invalid path')
                text = (self.state_dir / filename).read_text()
                if digest(text) != record['digest']: raise ValueError('invalid digest')
                entries = json.loads(text)['models']
                if len(entries) != len(verified) or {e['slug'] for e in entries} != set(verified): raise ValueError('invalid models')
            except (OSError, ValueError, KeyError, TypeError):
                raise cache_error
        path = self.state_dir / ('go-models-' + digest(text)[:20] + '.catalog.json')
        if not path.exists() or path.read_text() != text: atomic_write(path, text)
        validate_backend(path, verified)
        atomic_write(record_path, json.dumps({'filename': path.name, 'digest': digest(text)}, indent=2) + '\n')
        return path

    def summary(self):
        self.recover()
        text = self.read(); data = toml.loads(text); state = self.state()
        return {'provider': data.get('model_provider', 'openai'), 'model': data.get('model'),
                'reasoning': data.get('model_reasoning_effort'), 'revision': digest(text),
                'configured': PROVIDER in data.get('model_providers', {}),
                'canRestore': bool(state.get('original')), 'savedAt': state.get('savedAt'),
                'keychain': {'service': SERVICE, 'account': ACCOUNT},
                'verification': state.get('verification', {})}

    def setup(self):
        text = self.read(); data = toml.loads(text)
        existing = data.get('model_providers', {}).get(PROVIDER)
        expected = toml.loads(PROVIDER_TOML)['model_providers'][PROVIDER]
        if existing is not None and existing != expected:
            raise ValueError('已有不同的 OpenCode Go provider；保留现有配置，请先检查差异')
        if existing is None:
            self.backup(text)
            updated = text.rstrip() + '\n\n' + PROVIDER_TOML
            toml.loads(updated)
            if digest(self.read()) != digest(text): raise ValueError('配置在读取后发生变化，请重试')
            atomic_write(self.path, updated)
        verified = self.state().get('verification', {})
        for model in MODELS:
            profile = self.home / ('go-' + model.replace('.', '-') + '.config.toml')
            desired = 'model = ' + json.dumps(model) + '\nmodel_provider = "opencode-go"\n'
            legacy = self.home / ('go-' + model + '.config.toml')
            if legacy != profile and legacy.exists() and legacy.read_text() == desired: legacy.unlink()
            if not verified.get(model, {}).get('toolPassed'):
                if profile.exists() and profile.read_text() == desired: profile.unlink()
                continue
            if profile.exists() and profile.read_text() != desired:
                raise ValueError('已有不同的模型 profile：' + profile.name)
            atomic_write(profile, desired)
        return self.summary()

    def apply(self, provider, model, revision):
        self.recover()
        text = self.read()
        if digest(text) != revision: raise ValueError('配置已被其他程序修改。刷新后重新选择。')
        data = toml.loads(text); fields = root_fields(text); state = self.state()
        previous_state = json.loads(json.dumps(state))
        if provider == PROVIDER:
            if model not in MODELS: raise ValueError('模型不在 Responses 兼容列表中')
            if not state.get('verification', {}).get(model, {}).get('toolPassed'):
                raise ValueError('这个模型尚未通过工具调用验证，暂不允许启用')
            if PROVIDER not in data.get('model_providers', {}): raise ValueError('尚未完成 provider 配置')
            if data.get('model_provider', 'openai') != PROVIDER:
                if data.get('model_provider', 'openai') != 'openai':
                    raise ValueError('当前来源不是 OpenAI，不能替它建立恢复快照')
                state['original'] = {name: fields[name]['raw'] if name in fields else None for name in MANAGED}
            catalog_path = self.prepare_catalog(state, model)
            changes = {name: None for name in MANAGED}
            changes.update(model='model = ' + json.dumps(model) + '\n',
                           model_provider='model_provider = "opencode-go"\n',
                           model_catalog_json='model_catalog_json = ' + json.dumps(str(catalog_path)) + '\n')
        elif provider == 'openai':
            if data.get('model_provider', 'openai') == 'openai': return self.summary()
            if not state.get('original'): raise ValueError('没有原生配置快照，无法自动恢复')
            changes = state['original']
        else: raise ValueError('不支持这个模型来源')
        # Restore only when our owned fields still match the last committed state.
        if data.get('model_provider') == PROVIDER and state.get('owned'):
            # Codex's native model picker writes `model` and `model_reasoning_effort` back to
            # config.toml. Inside Go mode the catalog limits the picker to verified Go models,
            # so those edits are legitimate and must not block restoring or re-switching.
            picker_models = {slug for slug in MODELS if state.get('verification', {}).get(slug, {}).get('toolPassed')}
            for name, expected in state['owned'].items():
                actual = data.get(name)
                if actual == expected: continue
                if name == 'model_reasoning_effort': continue
                if name == 'model' and actual in picker_models: continue
                raise ValueError('模型设置被外部修改，已停止覆盖：' + name)
        updated = edit_root(text, changes)
        new_data = toml.loads(updated)
        self.backup(text)
        state.update(savedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     owned={name: new_data.get(name) for name in MANAGED},
                     pending={'before': digest(text), 'after': digest(updated), 'previousState': previous_state})
        # Persist recovery intent before committing the configuration.
        self.save_state(state)
        if digest(self.read()) != digest(text): raise ValueError('配置在保存前发生变化，已停止写入')
        atomic_write(self.path, updated)
        state.pop('pending', None); self.save_state(state)
        return self.summary()
