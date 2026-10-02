import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'tools/provider-switcher'))
from configuration import Configuration, digest, edit_root, root_fields, toml

class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.config = Configuration(self.temp.name)
        self.validator = patch('configuration.validate_backend')
        self.validator.start(); self.addCleanup(self.validator.stop)
        (self.config.home / 'models_cache.json').write_text(json.dumps({'models': [{'slug': slug, 'visibility': 'list'} for slug in ['gpt-5.6-luna', 'gpt-6-luna']]}))
        self.original = '# keep this comment\nmodel = "gpt-6.1-sol" # model comment\nmodel_reasoning_effort = "low"\n\n[mcp_servers.example]\ncommand = "keep-me"\n'
        self.config.path.write_text(self.original)
        self.config.save_state({'verification': {'gpt-5.6-luna': {'toolPassed': True}, 'gpt-6-luna': {'toolPassed': True}}})
        self.config.setup()

    def tearDown(self): self.temp.cleanup()

    def test_switch_restore_retains_comments_absent_fields_and_mcp(self):
        before = self.config.read()
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(before))
        current = toml.loads(self.config.read())
        self.assertEqual(current['model'], 'gpt-5.6-luna')
        self.assertNotIn('model_reasoning_effort', current)
        self.assertEqual(current['mcp_servers']['example']['command'], 'keep-me')
        self.config.apply('openai', None, digest(self.config.read()))
        restored = self.config.read()
        self.assertIn('model = "gpt-6.1-sol" # model comment', restored)
        self.assertNotIn('model_provider', toml.loads(restored))
        self.assertEqual(toml.loads(restored)['model_reasoning_effort'], 'low')
        self.assertIn('# keep this comment', restored)

    def test_unrelated_external_edits_are_preserved_when_restoring(self):
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
        self.config.path.write_text(self.config.read() + '\n[features]\nkeep = true\n')
        self.config.apply('openai', None, digest(self.config.read()))
        self.assertTrue(toml.loads(self.config.read())['features']['keep'])

    def test_stale_revision_does_not_write(self):
        revision = digest(self.config.read())
        self.config.path.write_text(self.config.read() + '# external change\n')
        before = self.config.read()
        with self.assertRaises(ValueError): self.config.apply('opencode-go', 'gpt-5.6-luna', revision)
        self.assertEqual(self.config.read(), before)

    def test_external_owned_field_edit_blocks_restore(self):
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
        self.config.path.write_text(edit_root(self.config.read(), {'model': 'model = "external"\n'}))
        before = self.config.read()
        with self.assertRaises(ValueError): self.config.apply('openai', None, digest(before))
        self.assertEqual(self.config.read(), before)

    def test_native_picker_edits_do_not_block_restore_or_reswitch(self):
        # Codex writes the picker's model / reasoning effort back into config.toml.
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
        picker = {'model': 'model = "gpt-6-luna"\n', 'model_reasoning_effort': 'model_reasoning_effort = "max"\n'}
        self.config.path.write_text(edit_root(self.config.read(), picker))
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
        self.assertEqual(toml.loads(self.config.read())['model'], 'gpt-5.6-luna')
        effort = {'model_reasoning_effort': 'model_reasoning_effort = "max"\n'}
        self.config.path.write_text(edit_root(self.config.read(), effort))
        self.config.apply('openai', None, digest(self.config.read()))
        restored = toml.loads(self.config.read())
        self.assertEqual(restored['model'], 'gpt-6.1-sol')
        self.assertEqual(restored['model_reasoning_effort'], 'low')
        self.assertNotIn('model_provider', restored)
        self.assertNotIn('model_catalog_json', restored)

    def test_non_picker_owned_edits_still_block_restore(self):
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
        clean = self.config.read()
        # A non-Go model name or a moved catalog was not written by the picker.
        for change in ({'model': 'model = "gpt-6.1-sol"\n'},
                       {'model_catalog_json': 'model_catalog_json = "/tmp/elsewhere.json"\n'}):
            with self.subTest(field=next(iter(change))):
                tampered = edit_root(clean, change)
                self.config.path.write_text(tampered)
                with self.assertRaises(ValueError): self.config.apply('openai', None, digest(tampered))
                self.assertEqual(self.config.read(), tampered)
        self.config.path.write_text(clean)
        self.config.apply('openai', None, digest(clean))
        self.assertEqual(toml.loads(self.config.read())['model'], 'gpt-6.1-sol')

    def test_unverified_and_unknown_models_are_blocked(self):
        for model in ['grok-4.7', 'kimi-k3', 'arbitrary']:
            with self.assertRaises(ValueError): self.config.apply('opencode-go', model, digest(self.config.read()))

    def test_multiline_strings_arrays_and_quoted_keys_are_preserved(self):
        original = '''instructions = """hello
[not_a_table]
model = "not_a_field"
"""
"model" = "native"
array = [
"one", # comment
"two",
]
[mcp_servers.example]
model = "nested"
'''
        edited = edit_root(original, {'model': 'model = "go"\n', 'model_provider': 'model_provider = "opencode-go"\n'})
        data = toml.loads(edited)
        self.assertEqual(data['model'], 'go')
        self.assertEqual(data['mcp_servers']['example']['model'], 'nested')
        self.assertEqual(data['instructions'], toml.loads(original)['instructions'])
        self.assertEqual(data['array'], ['one', 'two'])

    def test_setup_idempotent_keeps_only_verified_profiles(self):
        before = self.config.read(); self.config.setup()
        self.assertEqual(before, self.config.read())
        self.assertTrue((self.config.home / 'go-gpt-5-6-luna.config.toml').exists())
        self.assertFalse((self.config.home / 'go-grok-4.7.config.toml').exists())

    def test_repeated_switch_and_restore_returns_original_values(self):
        for _ in range(2):
            self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
            self.config.apply('opencode-go', 'gpt-6-luna', digest(self.config.read()))
            self.config.apply('openai', None, digest(self.config.read()))
        self.assertEqual(toml.loads(self.config.read())['model'], 'gpt-6.1-sol')


    def test_catalog_and_existing_native_override_restore(self):
        self.config.path.write_text(edit_root(self.config.read(), {'model_catalog_json': 'model_catalog_json = "/original/catalog.json" # retain\n'}))
        self.config.apply('opencode-go', 'gpt-6-luna', digest(self.config.read()))
        path = pathlib.Path(toml.loads(self.config.read())['model_catalog_json'])
        self.assertEqual({m['slug'] for m in json.loads(path.read_text())['models']}, {'gpt-6-luna', 'gpt-5.6-luna'})
        self.config.apply('openai', None, digest(self.config.read()))
        self.assertIn('model_catalog_json = "/original/catalog.json" # retain', self.config.read())

    def test_missing_cache_and_invalid_backend_leave_config_unchanged(self):
        before = self.config.read()
        with patch('configuration.validate_backend', side_effect=ValueError('invalid')):
            with self.assertRaises(ValueError): self.config.apply('opencode-go', 'gpt-6-luna', digest(before))
        self.assertEqual(self.config.read(), before)
        (self.config.home / 'models_cache.json').unlink()
        with self.assertRaises(ValueError): self.config.apply('opencode-go', 'gpt-6-luna', digest(before))
        self.assertEqual(self.config.read(), before)

    def test_interrupted_write_recovers_before_and_after(self):
        before = self.config.read(); state_before = self.config.state()
        with patch('configuration.atomic_write', wraps=__import__('configuration').atomic_write) as write:
            def fail_config(path, text):
                if path == self.config.path: raise OSError('interrupted')
                return __import__('configuration').atomic_write_original(path, text)
            import configuration
            configuration.atomic_write_original = write._mock_wraps
            write.side_effect = fail_config
            with self.assertRaises(OSError): self.config.apply('opencode-go', 'gpt-6-luna', digest(before))
        self.config.recover()
        self.assertEqual(self.config.state(), state_before)
        self.config.apply('opencode-go', 'gpt-6-luna', digest(before))
        state = self.config.state(); state['pending'] = {'before': digest(before), 'after': digest(self.config.read()), 'previousState': state_before}
        self.config.save_state(state); self.config.recover()
        self.assertNotIn('pending', self.config.state())

    def test_interrupted_external_change_blocks_recovery(self):
        state = self.config.state(); state['pending'] = {'before': 'before', 'after': 'after', 'previousState': {}}
        self.config.save_state(state)
        before = self.config.read()
        with self.assertRaises(ValueError): self.config.recover()
        self.assertEqual(self.config.read(), before)

    def test_cache_drift_uses_only_validated_untampered_catalog(self):
        self.config.apply('opencode-go', 'gpt-6-luna', digest(self.config.read()))
        (self.config.home / 'models_cache.json').write_text('{"models":[]}')
        self.config.apply('opencode-go', 'gpt-5.6-luna', digest(self.config.read()))
        catalog = pathlib.Path(toml.loads(self.config.read())['model_catalog_json'])
        catalog.write_text('{"models":[]}')
        before = self.config.read()
        with self.assertRaises(ValueError): self.config.apply('opencode-go', 'gpt-6-luna', digest(before))
        self.assertEqual(self.config.read(), before)

if __name__ == '__main__': unittest.main()
