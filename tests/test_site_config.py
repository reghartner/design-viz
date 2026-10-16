"""Company-owned build inputs and portable landing payload contract."""
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
spec = importlib.util.spec_from_file_location('site_build', ROOT / 'tools/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class SiteConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = build.canon_runtime()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='company site ')
        self.addCleanup(self.tmp.cleanup)
        self.directory = pathlib.Path(self.tmp.name)
        self.config = self.directory / 'site.json'
        self.story = self.directory / 'story.json'
        self.raw = {'nodes': {'service': {'title': 'Company </script> service'}}, 'rows': [['service']]}
        self.story.write_text(json.dumps(self.raw))
        self.data = {'version': 1, 'landing': {'spec': 'story.json', 'title': '<img src=x onerror=alert(1)>', 'label': '</script>', 'footer': 'A & B {{HUMAN_GUIDE}}'}}
        self.config.write_text(json.dumps(self.data))

    def load(self):
        return build.workbench_landing(self.config, runtime=self.runtime)

    def test_external_config_and_bare_diagram_embed_unchanged_and_escape_script(self):
        before = self.config.read_bytes(), self.story.read_bytes()
        embedded = self.load()
        self.assertNotIn('<', embedded)
        payload = json.loads(embedded)
        self.assertEqual(payload['spec'], self.raw)
        self.assertEqual(payload['title'], self.data['landing']['title'])
        self.assertEqual(before, (self.config.read_bytes(), self.story.read_bytes()))

    def test_autodiscovery_and_no_config_default(self):
        (self.directory / 'workbench').mkdir()
        (self.directory / 'workbench/site.json').write_text(json.dumps({'version': 1, 'landing': {'spec': '../story.json'}}))
        with patch.object(build, 'ROOT', self.directory):
            self.assertEqual(json.loads(build.workbench_landing(runtime=self.runtime))['spec'], self.raw)
            self.assertEqual(json.loads(build.workbench_landing(no_config=True))['label'], 'Fictional example')
            (self.directory / 'workbench/site.json').unlink()
            self.assertEqual(json.loads(build.workbench_landing())['label'], 'Fictional example')

    def test_missing_invalid_and_unknown_config_fields_fail(self):
        cases = [None, [], {}, {'version': True, 'landing': {}}, {'version': 2, 'landing': {}},
                 {'version': 1, 'landing': {}, 'landng': {}}, {'version': 1, 'landing': []},
                 {'version': 1, 'landing': {'spec': ''}}, {'version': 1, 'landing': {'spec': 'missing.json'}},
                 {'version': 1, 'landing': {'spec': 'story.json', 'titel': 'Oops'}},
                 {'version': 1, 'landing': {'spec': 'story.json', 'title': ['oops']}}]
        for data in cases:
            with self.subTest(data=data):
                self.config.write_text(json.dumps(data))
                with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
                    self.load()
        self.config.write_text('{')
        with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
            self.load()
        self.config.unlink()
        with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
            self.load()

    # #547 — the examples-gallery link is build-time site config, never a runtime probe.
    # row | fixture                                         | assertion (scoped)                                         | rejects
    # 1   | site.json with "examples": "../examples/index.html" | workbench_examples() embeds exactly that string            | a field that is accepted but dropped
    # 2   | "/examples/index.html", "gallery/index.html?x=1"   | same-site absolute and relative URLs are embedded unchanged | over-strict validation
    # 3   | no site.json, --no-config, config without examples | workbench_examples() embeds null                           | a default that shows the link everywhere
    # 4   | javascript:, https://, //host, \\host, "", "  ", non-string, control char | build fails with "Invalid site config" | off-site or script URLs in the Welcome link
    # 5   | examples set, landing still validated             | an unknown sibling field still fails                       | loosening the field allow-list wholesale
    # 6   | CLI build with --config                           | flowspec.html carries var WORKBENCH_EXAMPLES = "<url>"; --no-config carries null | config read but never embedded
    def examples(self, **kwargs):
        return json.loads(build.workbench_examples(self.config, **kwargs))

    def test_examples_gallery_url_is_embedded_only_when_configured(self):
        for url in ['../examples/index.html', '/examples/index.html', 'gallery/index.html?x=1']:
            with self.subTest(url=url):
                self.config.write_text(json.dumps({**self.data, 'examples': url}))
                self.assertEqual(self.examples(), url)
                self.assertEqual(json.loads(self.load())['spec'], self.raw)
        self.config.write_text(json.dumps(self.data))
        self.assertIsNone(self.examples())
        self.assertIsNone(json.loads(build.workbench_examples(no_config=True)))
        (self.directory / 'workbench').mkdir()
        with patch.object(build, 'ROOT', self.directory):
            self.assertIsNone(json.loads(build.workbench_examples()))
            (self.directory / 'workbench/site.json').write_text(json.dumps(
                {'version': 1, 'landing': {'spec': '../story.json'}, 'examples': '../examples/index.html'}))
            self.assertEqual(json.loads(build.workbench_examples()), '../examples/index.html')
            self.assertIsNone(json.loads(build.workbench_examples(no_config=True)))

    def test_examples_gallery_url_must_be_same_site(self):
        for url in ['javascript:alert(1)', 'https://example.com/examples/', 'HTTP://example.com/', '//example.com/x',
                    '\\\\host\\x', '', '   ', 'a b.html', 'ok\n.html', ['../examples/index.html'], None, 1]:
            with self.subTest(url=url):
                self.config.write_text(json.dumps({**self.data, 'examples': url}))
                with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
                    self.examples()
        self.config.write_text(json.dumps({**self.data, 'examples': '../examples/index.html', 'exampels': 'x'}))
        with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
            self.load()

    def test_invalid_spec_or_no_featured_diagram_fails(self):
        for raw in [None, [], {'page': {'sections': [{'heading': 'Prose only'}]}},
                    {'nodes': {}, 'rows': [['missing']]},
                    {'page': {'sections': [{'detailOnly': True, 'diagram': self.raw}]}}]:
            with self.subTest(raw=raw):
                self.story.write_text(json.dumps(raw))
                with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
                    self.load()

    def test_cli_rebuild_from_elsewhere_is_repeatable_and_failure_preserves_html(self):
        outputs = [ROOT / 'workbench/flowspec.html', ROOT / 'template/flowview.html']
        original = {p: p.read_bytes() if p.exists() else None for p in outputs}
        def restore():
            for path, data in original.items():
                if data is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(data)
        self.addCleanup(restore)
        def run(*args):
            return subprocess.run([sys.executable, str(ROOT / 'tools/build.py'), *args], cwd=self.directory, capture_output=True, text=True)
        inputs = self.config.read_bytes(), self.story.read_bytes()
        first = run('--config', 'site.json')
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        custom = outputs[0].read_bytes()
        payload = re.search(rb'var WORKBENCH_LANDING = ([^\n]*);\n', custom).group(1)
        self.assertEqual(json.loads(payload)['spec'], self.raw)
        self.assertEqual(re.search(rb'var WORKBENCH_EXAMPLES = ([^\n]*);\n', custom).group(1), b'null')
        self.config.write_text(json.dumps({**self.data, 'examples': '../examples/index.html'}))
        gallery = run('--config', 'site.json')
        self.assertEqual(gallery.returncode, 0, gallery.stdout + gallery.stderr)
        self.assertEqual(json.loads(re.search(rb'var WORKBENCH_EXAMPLES = ([^\n]*);\n', outputs[0].read_bytes()).group(1)),
                         '../examples/index.html')
        self.config.write_text(json.dumps(self.data))
        self.assertEqual(run('--no-config').returncode, 0)
        self.assertEqual(re.search(rb'var WORKBENCH_EXAMPLES = ([^\n]*);\n', outputs[0].read_bytes()).group(1), b'null')
        self.assertNotEqual(outputs[0].read_bytes(), custom)
        self.assertEqual(run('--config', str(self.config)).returncode, 0)
        self.assertEqual(outputs[0].read_bytes(), custom)
        self.assertEqual(inputs, (self.config.read_bytes(), self.story.read_bytes()))
        before = [p.read_bytes() for p in outputs]
        self.story.write_text('{"nodes":{},"rows":[["missing"]]}')
        failed = run('--config', str(self.config))
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('Invalid site config', failed.stderr)
        self.assertEqual(before, [p.read_bytes() for p in outputs])
