"""Tests for tools/build.py: deterministic assembly of the two committed pages.
Run: python3 -m unittest discover -s tests"""
import json
import pathlib
import re
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "tools" / "build.py"
PAGES = [ROOT / "template" / "flowview.html", ROOT / "workbench" / "flowspec.html"]

BLOCK_RE = re.compile(r'^(<script type="application/json" id="flowspec">)\n(.*?)\n(</script>)',
                      re.S | re.M)
BACKLINK_RE = re.compile(
    r'^(<script type="application/json" id="flowbacklinks">)\n(.*?)\n(</script>)',
    re.S | re.M,
)
# The shared chunk is validator.js + engine.js; the workbench additionally
# bundles builder.workbench.js after the engine, so the chunk ends at the
# first page-specific fragment marker (builder.* or boot.*).
ENGINE_CHUNK_RE = re.compile(
    r"/\* ---- src/validator\.js ---- \*/(.*?)/\* ---- src/(?:builder|boot)\.", re.S)


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run([sys.executable, str(BUILD)], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.texts = {p.name: p.read_text() for p in PAGES}

    def test_outputs_exist_and_are_selfcontained(self):
        for name, text in self.texts.items():
            self.assertGreater(len(text), 10000, name)
            self.assertIn("GENERATED FILE", text, name)

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

    def test_workbench_has_no_spec_block(self):
        self.assertEqual(len(BLOCK_RE.findall(self.texts["flowspec.html"])), 0)

    def test_flowview_has_separate_empty_derived_backlink_block(self):
        blocks = BACKLINK_RE.findall(self.texts["flowview.html"])
        self.assertEqual(len(blocks), 1)
        self.assertEqual(json.loads(blocks[0][1]), {"services": {}})
        self.assertNotIn('id="flowbacklinks"', self.texts["flowspec.html"])

    def test_shared_engine_chunk_identical_across_outputs(self):
        chunks = []
        for name in ("flowview.html", "flowspec.html"):
            m = ENGINE_CHUNK_RE.search(self.texts[name])
            self.assertIsNotNone(m, name)
            chunks.append(m.group(1))
        self.assertEqual(chunks[0], chunks[1])

    def test_build_is_deterministic(self):
        before = {p: p.read_text() for p in PAGES}
        r = subprocess.run([sys.executable, str(BUILD)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        for p in PAGES:
            self.assertEqual(before[p], p.read_text(), f"{p} changed on rebuild")


if __name__ == "__main__":
    unittest.main()
