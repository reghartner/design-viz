"""Tests for tools/build.py: deterministic page and backend runtime assembly.
Run: python3 -m unittest discover -s tests"""
import json
import base64
import gzip
import hashlib
import pathlib
import posixpath
import re
import runpy
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "tools" / "build.py"
PAGES = [ROOT / "template" / "flowview.html", ROOT / "workbench" / "flowspec.html"]
OUTPUTS = PAGES + [ROOT / "tools" / "canon" / "generated-runtime.cjs",
                   ROOT / "workbench" / "diagrams.json"]

BLOCK_RE = re.compile(r'^(<script type="application/json" id="flowspec">)\n(.*?)\n(</script>)',
                      re.S | re.M)
BACKLINK_RE = re.compile(
    r'^(<script type="application/json" id="flowbacklinks">)\n(.*?)\n(</script>)',
    re.S | re.M,
)
def entrypoint(name):
    return json.loads(subprocess.check_output(
        ['node', str(ROOT / 'tools/source-loader.cjs'), '--entrypoint', name], text=True))


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run([sys.executable, str(BUILD), "--no-config"], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.texts = {p.name: p.read_text() for p in PAGES}

    def test_outputs_exist_and_are_selfcontained(self):
        for name, text in self.texts.items():
            self.assertGreater(len(text), 10000, name)
            self.assertIn("GENERATED FILE", text, name)

    def test_standalone_bundles_every_skin_font_without_remote_stylesheets(self):
        text = self.texts["flowview.html"]
        self.assertNotIn('fonts.googleapis.com', text)
        self.assertNotRegex(text, r'<(?:link|script)[^>]+(?:href|src)="https?://')
        for font in json.loads((ROOT / "src/fonts/manifest.json").read_text()):
            self.assertIn("font-family:'%s'" % font["family"], text)
        self.assertIn('data:font/woff2;base64,', text)

    def test_flowview_ships_the_guided_tour_once(self):
        # Both reader entrypoints share one implementation and one stylesheet.
        for name in ("flowview.html", "flowspec.html"):
            text = self.texts[name]
            self.assertEqual(text.count("function wireTour("), 1)
            self.assertEqual(text.count("var TOUR_DEFAULT_CONFIG"), 1)
            self.assertEqual(text.count(".dv-tour-ring{stroke:"), 1)
            self.assertIn("tourLintConfig", text)

    def test_flowview_carries_the_host_skin_message_listener(self):
        # An iframe shell posts {type:'dv_skin', skin} on theme change; the
        # listener must ship inside every built page so an inject.py rebuild
        # never strips it (it used to be appended by hand and got wiped).
        text = self.texts["flowview.html"]
        self.assertIn("e.data.type === 'dv_skin'", text)
        self.assertIn("SKIN_NAMES.indexOf(e.data.skin) >= 0", text)

    def test_flowview_carries_the_host_deep_link_channel(self):
        text = self.texts["flowview.html"]
        self.assertIn("e.data.type === 'dv_linkbase'", text)
        self.assertIn("deepLinkChannel.receiveLinkBaseMessage(e)", text)
        self.assertIn("win.dvSetLinkBase = function(base)", text)
        # a registration posted during async ?spec= boot must be queued and
        # replayed once the channel exists, not dropped
        self.assertIn("pendingLinkBase = e", text)
        self.assertIn("receiveLinkBaseMessage(pendingLinkBase)", text)

    def test_flowview_has_exactly_one_line_anchored_spec_block(self):
        blocks = BLOCK_RE.findall(self.texts["flowview.html"])
        self.assertEqual(len(blocks), 1)
        json.loads(blocks[0][1])  # embedded demo spec parses

    def test_folder_authoring_kit_matches_current_skill_and_runtime(self):
        match = re.search(r'<script type="application/json" id="flowview-folder-kit">(.*?)</script>',
                          self.texts["flowspec.html"], re.S)
        self.assertIsNotNone(match)
        packed = json.loads(match.group(1))
        raw = gzip.decompress(base64.b64decode(packed['gzip']))
        self.assertEqual(hashlib.sha256(raw).hexdigest(), packed['sha256'])
        files = json.loads(raw)['files']
        for name in ['.claude/skills/hld-to-page/SKILL.md', 'docs/folder-agent-session.md',
                     'docs/folder-agent-existing-edit.md', 'tools/canon/generated-runtime.cjs']:
            self.assertEqual(files[name], (ROOT / name).read_text())
        # The short entry guide stays short and its relative links resolve inside the kit.
        guide = files['docs/folder-agent-existing-edit.md']
        self.assertLessEqual(len(guide), 4500)
        links = re.findall(r'\]\(([^)#]+)\)', guide)
        self.assertIn('../.claude/skills/hld-to-page/SKILL.md', links)
        self.assertIn('folder-agent-session.md', links)
        for link in links:
            normalized = posixpath.normpath('docs/' + link)
            self.assertIn(normalized, files, link)
            self.assertTrue((ROOT / normalized).is_file(), link)
        self.assertEqual(packed['watcher'], (ROOT / 'tools/folder-agent.py').read_text())
        self.assertFalse(any('node_modules/' in name or '/agents/' in name or '/research/' in name for name in files))

    def test_extracted_folder_kit_runs_without_sources_or_compilation(self):
        match = re.search(r'<script type="application/json" id="flowview-folder-kit">(.*?)</script>',
                          self.texts["flowspec.html"], re.S)
        files = json.loads(gzip.decompress(base64.b64decode(json.loads(match.group(1))['gzip'])))['files']
        self.assertEqual(files['LICENSE'], (ROOT / 'LICENSE').read_text())
        self.assertNotIn('tools/source-loader.cjs', files)
        self.assertFalse(any(name.startswith('src/') and name.endswith('.js') for name in files))
        with tempfile.TemporaryDirectory(prefix='flowview-kit-') as directory:
            root = pathlib.Path(directory)
            for name, content in files.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            spec = root / 'src/starters/minimal.json'
            for command in [['tools/validate.js', '--quiet', str(spec)],
                            ['tools/compatibility.js', '--stamp', str(spec)],
                            ['.claude/skills/hld-to-page/scripts/fold_states.cjs', str(spec)]]:
                result = subprocess.run(['node', '--disallow-code-generation-from-strings', *command],
                                        cwd=root, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            folded = json.loads(result.stdout)
            self.assertTrue(folded)

    def test_workbench_has_no_spec_block(self):
        self.assertEqual(len(BLOCK_RE.findall(self.texts["flowspec.html"])), 0)

    def test_workbench_embeds_curated_templates_and_replaces_old_gallery(self):
        text = self.texts["flowspec.html"]
        match = re.search(r"\(function\(\)\{\s*'use strict';\s*var WORKBENCH_TEMPLATES = (.*);", text)
        self.assertIsNotNone(match)
        templates = json.loads(match.group(1))
        metadata = runpy.run_path(str(BUILD))["WORKBENCH_TEMPLATES"]
        self.assertEqual(len(templates), len(metadata))
        for entry, info in zip(templates, metadata):
            expected = json.loads((ROOT / "src" / info["source"]).read_text())
            if "title" in info:
                expected["page"]["title"] = info["title"]
            expected.get("page", expected)["skin"] = "pastel"
            # Compare authored content except routing on actual section diagrams.
            blocks = expected.get("page", expected).get("blocks", expected.get("page", expected).get("sections", []))
            for block in blocks:
                sections = [section for tab in block.get("tabs", []) for section in tab["sections"]] if "tabs" in block else [block]
                for section in sections:
                    if "diagram" in section:
                        section["diagram"].pop("routing", None)
            self.assertEqual(entry["spec"], expected)
            self.assertEqual(entry["name"], info["name"])
            self.assertTrue(entry["desc"])
        self.assertIn('id="workbench-welcome"', text)
        self.assertIn('id="workbench-workspace" hidden', text)
        self.assertNotIn('id="starters"', text)
        self.assertNotIn('id="gallery"', text)
        self.assertNotIn('fonts.googleapis.com', text)
        self.assertIn('/* ---- src/welcome.workbench.js ---- */', text)

    def test_flowview_has_separate_empty_derived_backlink_block(self):
        blocks = BACKLINK_RE.findall(self.texts["flowview.html"])
        self.assertEqual(len(blocks), 1)
        self.assertEqual(json.loads(blocks[0][1]), {"services": {}})
        self.assertNotIn('id="flowbacklinks"', self.texts["flowspec.html"])

    def test_named_sources_ship_once_and_shared_viewer_content_is_identical(self):
        shared = entrypoint('native')['source']
        for filename, name in [('flowview.html', 'standalone'), ('flowspec.html', 'workbench')]:
            entry = entrypoint(name)
            self.assertEqual(self.texts[filename].count(entry['source']), 1, filename)
            self.assertEqual(self.texts[filename].count(shared), 1, filename)
            files = [record['file'] for record in entry['records']]
            self.assertEqual(len(files), len(set(files)), filename)

    def test_build_is_deterministic(self):
        before = {p: p.read_text() for p in OUTPUTS}
        r = subprocess.run([sys.executable, str(BUILD), "--no-config"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        for p in OUTPUTS:
            self.assertEqual(before[p], p.read_text(), f"{p} changed on rebuild")


if __name__ == "__main__":
    unittest.main()
