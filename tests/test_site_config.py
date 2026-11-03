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

    # #866 — the Welcome "Live Feature Delivery Status Board" row links the example named by
    # site config ("liveStatusExample"), an absolute https URL on any host (a claude.ai artifact).
    # row | fixture                                                    | assertion (scoped)                                                       | rejects
    # 1   | site.json with "liveStatusExample": LIVE_STATUS_URL         | workbench_live_status_example() embeds exactly that string; workbench_landing() still loads the same file | a field accepted but dropped; the top-level allow-list left closed (today: "expected only version, landing and optional examples")
    # 2   | https URLs on other hosts with port, query, fragment        | embedded unchanged                                                       | reusing the examples same-site rule for this field
    # 3   | no site.json, --no-config, config without the field, autodiscovered workbench/site.json | null without the field or with --no-config; the URL from autodiscovery | a default that shows the row everywhere, or autodiscovery ignored
    # 4   | javascript:, http:, HTTP:, data:, ftp:, credentials (user:pass@, user@, :pass@), whitespace (lead, trail, inner, tab, newline, NBSP), "", "  ", relative, //host, https: without a host, backslash, non-string | "Invalid site config" | script, plaintext, credential-bearing or malformed URLs in the Welcome link
    # 5   | the field set beside an unknown sibling ("liveStatusExampel") | workbench_landing() still fails                                        | loosening the allow-list wholesale
    # 6   | CLI build --config with the field; then --no-config          | flowspec.html carries var WORKBENCH_LIVE_STATUS_EXAMPLE = "<url>"; --no-config carries null | config read but never embedded in the page
    LIVE_STATUS_URL = 'https://example.com/live-status-board'

    def live_status(self, **kwargs):
        return json.loads(build.workbench_live_status_example(self.config, **kwargs))

    def test_live_status_example_url_is_embedded_only_when_configured(self):
        for url in [self.LIVE_STATUS_URL, 'https://boards.example.org:8443/a/b?c=1&d=%20#e']:
            with self.subTest(url=url):
                self.config.write_text(json.dumps({**self.data, 'liveStatusExample': url}))
                self.assertEqual(self.live_status(), url)
                self.assertEqual(json.loads(self.load())['spec'], self.raw)
        self.config.write_text(json.dumps({**self.data, 'examples': '../examples/index.html', 'liveStatusExample': self.LIVE_STATUS_URL}))
        self.assertEqual(self.live_status(), self.LIVE_STATUS_URL)
        self.assertEqual(self.examples(), '../examples/index.html')
        self.assertIsNone(self.live_status(no_config=True))
        self.config.write_text(json.dumps({**self.data, 'examples': '../examples/index.html'}))
        self.assertIsNone(self.live_status())
        self.assertIsNone(json.loads(build.workbench_live_status_example(no_config=True)))
        (self.directory / 'workbench').mkdir()
        with patch.object(build, 'ROOT', self.directory):
            self.assertIsNone(json.loads(build.workbench_live_status_example()))
            (self.directory / 'workbench/site.json').write_text(json.dumps(
                {'version': 1, 'landing': {'spec': '../story.json'}, 'liveStatusExample': self.LIVE_STATUS_URL}))
            self.assertEqual(json.loads(build.workbench_live_status_example()), self.LIVE_STATUS_URL)
            self.assertEqual(json.loads(build.workbench_landing(runtime=self.runtime))['spec'], self.raw)
            self.assertIsNone(json.loads(build.workbench_live_status_example(no_config=True)))

    def test_live_status_example_url_must_be_https_without_credentials_or_whitespace(self):
        for url in ['javascript:alert(1)', 'http://example.com/live-status-board', 'HTTP://example.com/live-status-board',
                    'data:text/html,hi', 'ftp://example.com/board',
                    'https://user:pass@example.com/board', 'https://user@example.com/board', 'https://:pass@example.com/board',
                    ' https://example.com/board', 'https://example.com/board ', 'https://example.com/a b',
                    'https://example.com/\tboard', 'https://example.com/board\n', 'https://example.com/board ',
                    '', '   ', 'live-status/index.html', '/live-status-board', '//example.com/board',
                    'https:', 'https://', 'https:example.com/board', 'https:///board', 'https://example.com\\board',
                    [self.LIVE_STATUS_URL], None, 1]:
            with self.subTest(url=url):
                self.config.write_text(json.dumps({**self.data, 'liveStatusExample': url}))
                with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
                    self.live_status()
        self.config.write_text(json.dumps({**self.data, 'liveStatusExample': self.LIVE_STATUS_URL, 'liveStatusExampel': 'x'}))
        with self.assertRaisesRegex(SystemExit, 'Invalid site config'):
            self.load()

    def test_cli_build_embeds_live_status_example_only_from_config(self):
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
        def embedded():
            return re.search(rb'var WORKBENCH_LIVE_STATUS_EXAMPLE = ([^\n]*);\n', outputs[0].read_bytes()).group(1)
        self.config.write_text(json.dumps({**self.data, 'liveStatusExample': self.LIVE_STATUS_URL}))
        configured = run('--config', 'site.json')
        self.assertEqual(configured.returncode, 0, configured.stdout + configured.stderr)
        self.assertEqual(json.loads(embedded()), self.LIVE_STATUS_URL)
        upstream = run('--no-config')
        self.assertEqual(upstream.returncode, 0, upstream.stdout + upstream.stderr)
        self.assertEqual(embedded(), b'null')

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
