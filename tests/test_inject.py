"""Unit tests for tools/inject.py. Run: python3 -m unittest discover -s tests"""
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
INJECT = ROOT / "tools" / "inject.py"

BLOCK_OPEN = '<script type="application/json" id="flowspec">'
BACKLINK_OPEN = '<script type="application/json" id="flowbacklinks">'

TEMPLATE = (
    "<title>Flowview</title>\n"
    "<!-- prose comment that mentions the tag " + BLOCK_OPEN + " in passing;\n"
    "     a naive matcher would anchor HERE and destroy the head -->\n"
    "<style>.keepme{color:red}</style>\n"
    + BLOCK_OPEN + "\n"
    '{"old": true}\n'
    "</script>\n"
    + BACKLINK_OPEN + "\n"
    '{"services": {}}\n'
    "</script>\n"
    "<script>var engine = 1;</script>\n"
)

SPEC = {"page": {"title": "T & Co <Test>", "blocks": [{"heading": "h"}]}}


def run_inject(template_text, spec_text):
    with tempfile.TemporaryDirectory() as td:
        td = pathlib.Path(td)
        (td / "t.html").write_text(template_text)
        (td / "s.json").write_text(spec_text)
        out = td / "o.html"
        r = subprocess.run([sys.executable, str(INJECT), str(td / "s.json"),
                            str(td / "t.html"), str(out)],
                           capture_output=True, text=True)
        return r, out.read_text() if out.exists() else None


class InjectTests(unittest.TestCase):
    def test_replaces_only_the_real_block(self):
        r, out = run_inject(TEMPLATE, json.dumps(SPEC))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('"old": true', out)
        self.assertIn('"T & Co <Test>"', out)
        # regression (2026-09-04): the comment mentioning the tag must survive
        self.assertIn("a naive matcher would anchor HERE", out)
        self.assertIn(".keepme{color:red}", out)
        self.assertIn("var engine = 1;", out)
        self.assertIn(BACKLINK_OPEN + '\n{"services": {}}\n</script>', out)

    def test_title_set_from_spec_with_escaping(self):
        r, out = run_inject(TEMPLATE, json.dumps(SPEC))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("<title>T &amp; Co &lt;Test&gt;</title>", out)

    def test_refuses_unescaped_script_close(self):
        bad = json.dumps({"page": {"title": "x</script>y", "blocks": [{}]}})
        r, out = run_inject(TEMPLATE, bad)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("</script", r.stderr)

    def test_errors_on_missing_block(self):
        r, out = run_inject("<title>No block</title>\n", json.dumps(SPEC))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("found 0", r.stderr)

    def test_errors_on_two_blocks(self):
        two = TEMPLATE + BLOCK_OPEN + "\n{}\n</script>\n"
        r, out = run_inject(two, json.dumps(SPEC))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("found 2", r.stderr)

    def test_rejects_invalid_json(self):
        r, out = run_inject(TEMPLATE, "{not json")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("not valid JSON", r.stderr)

    def test_conventional_legacy_inject_discovers_and_embeds_crossref(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td) / "pages"
            family = root / "fam"
            family.mkdir(parents=True)
            template = pathlib.Path(td) / "template.html"
            template.write_text(TEMPLATE)
            spec = family / "page.spec.json"
            spec.write_text(json.dumps({"page": {"title": "Page", "blocks": [{
                "heading": "Flow", "diagram": {
                    "nodes": {"relay": {"title": "Relay"}},
                    "rows": [["relay"]], "edges": []
                }
            }]}}))
            (root / "crossref.json").write_text(json.dumps({"services": {
                "Relay": [
                    {"file": "fam/page.html", "family": "fam", "title": "Page"},
                    {"file": "other/peer.html", "family": "other", "title": "Peer"},
                ]
            }}))
            out = family / "page.html"
            r = subprocess.run([sys.executable, str(INJECT), str(spec),
                                str(template), str(out)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            match = re.search(
                r'^<script type="application/json" id="flowbacklinks">\n(.*?)\n</script>',
                out.read_text(), re.S | re.M,
            )
            self.assertIsNotNone(match)
            model = json.loads(match.group(1))
            self.assertEqual(model, {"services": {"Relay": [{
                "href": "../other/peer.html", "title": "Peer"
            }]}})

    def test_flat_inject_discovers_catalog_and_embeds_same_dir_href(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td) / "pages"
            root.mkdir()
            template = pathlib.Path(td) / "template.html"
            template.write_text(TEMPLATE)
            spec = root / "page.spec.json"
            spec.write_text(json.dumps({"page": {"title": "Page", "blocks": [{
                "heading": "Flow", "diagram": {
                    "nodes": {"relay": {"title": "Relay"}},
                    "rows": [["relay"]], "edges": []
                }
            }]}}))
            (root / "crossref.json").write_text(json.dumps({"services": {
                "Relay": [
                    {"file": "page.html", "family": "pages", "title": "Page"},
                    {"file": "peer.html", "family": "pages", "title": "Peer"},
                ]
            }}))
            out = root / "page.html"
            r = subprocess.run([sys.executable, str(INJECT), str(spec),
                                str(template), str(out)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            match = re.search(
                r'^<script type="application/json" id="flowbacklinks">\n(.*?)\n</script>',
                out.read_text(), re.S | re.M,
            )
            self.assertIsNotNone(match)
            model = json.loads(match.group(1))
            self.assertEqual(model, {"services": {"Relay": [{
                "href": "peer.html", "title": "Peer"
            }]}})


if __name__ == "__main__":
    unittest.main()
