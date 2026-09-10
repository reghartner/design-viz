"""Unit tests for tools/mermaid2spec.py (zero dependencies).

Run: python3 -m unittest tests.test_mermaid2spec -v
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import mermaid2spec as m2s  # noqa: E402

SEQ = """sequenceDiagram
    participant A as Alpha Svc
    participant B
    A->>B: POST /things
    B-->>A: created
"""


def parse_convert(src, title="T"):
    return m2s.convert(m2s.parse(m2s.extract_mermaid(src)), title)


class TestParsing(unittest.TestCase):
    def test_participants_with_and_without_as(self):
        model = m2s.parse(SEQ)
        self.assertEqual(model["order"], ["a", "b"])
        self.assertEqual(model["titles"]["a"], "Alpha Svc")
        self.assertEqual(model["titles"]["b"], "B")

    def test_implicit_participant_from_message(self):
        model = m2s.parse("sequenceDiagram\n  X->>Y: hi\n")
        self.assertEqual(model["order"], ["x", "y"])

    def test_arrow_types(self):
        spec = parse_convert(SEQ)
        edges = spec["page"]["sections"][0]["diagram"]["edges"]
        self.assertNotIn("ret", edges[0])
        self.assertTrue(edges[1]["ret"])

    def test_kind_inference(self):
        src = ("sequenceDiagram\n"
               "  A->>B: POST /x\n"
               "  B->>C: PUBLISH topic (QoS 1)\n"
               "  C->>D: plain call\n")
        edges = parse_convert(src)["page"]["sections"][0]["diagram"]["edges"]
        self.assertEqual([e["kind"] for e in edges], ["https", "mqtt", "int"])

    def test_duplicate_pair_folds_to_one_edge_two_steps(self):
        src = ("sequenceDiagram\n"
               "  A->>B: first\n"
               "  A->>B: second\n")
        d = parse_convert(src)["page"]["sections"][0]["diagram"]
        self.assertEqual(len(d["edges"]), 1)
        self.assertEqual(d["edges"][0]["label"], "first")
        self.assertEqual([s["text"] for s in d["steps"]], ["first", "second"])
        self.assertEqual({s["edge"] for s in d["steps"]}, {"a->b"})

    def test_alt_block_becomes_todo_and_skips_messages(self):
        src = ("sequenceDiagram\n"
               "  A->>B: outside\n"
               "  alt token invalid\n"
               "    B->>A: 401\n"
               "  else ok\n"
               "    B->>A: 200\n"
               "  end\n")
        spec = parse_convert(src)
        d = spec["page"]["sections"][0]["diagram"]
        self.assertEqual(len(d["steps"]), 1)
        self.assertEqual(len(spec["todos"]), 1)
        self.assertIn("alt token invalid", spec["todos"][0])
        self.assertIn("2 message(s)", spec["todos"][0])

    def test_non_sequence_rejected(self):
        with self.assertRaises(m2s.MermaidError):
            m2s.parse("flowchart TD\n  A-->B\n")

    def test_unknown_arrow_rejected(self):
        with self.assertRaises(m2s.MermaidError):
            m2s.parse("sequenceDiagram\n  A-xB: dies\n")

    def test_rows_split_in_encounter_order(self):
        src = ("sequenceDiagram\n"
               "  A->>B: 1\n  B->>C: 2\n  C->>D: 3\n  D->>E: 4\n")
        rows = parse_convert(src)["page"]["sections"][0]["diagram"]["rows"]
        self.assertEqual(rows, [["a", "b", "c"], ["d", "e"]])


class TestAcceptance(unittest.TestCase):
    """Tool output for the cumulus HLD must validate and inject cleanly."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.spec_path = os.path.join(cls.tmp, "out.json")
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "tools", "mermaid2spec.py"),
             os.path.join(ROOT, "examples", "cumulus", "cumulus-hld.md"),
             "-o", cls.spec_path, "--title", "Cumulus command flow"],
            capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.stderr = r.stderr

    def test_output_parses_and_has_content(self):
        with open(self.spec_path) as f:
            spec = json.load(f)
        d = spec["page"]["sections"][0]["diagram"]
        self.assertEqual(len(d["nodes"]), 8)
        self.assertGreaterEqual(len(d["edges"]), 10)
        self.assertEqual(len(d["steps"]), 12)

    def test_validates_zero_errors_via_engine_validator(self):
        node_script = (
            'const fs=require("fs"),vm=require("vm");'
            'const code=fs.readFileSync("src/validator.js","utf8")+"\\n"'
            '+fs.readFileSync("src/engine.js","utf8")'
            '+"\\n;__x={validate,normalize};";'
            'const s={console};vm.runInNewContext(code,s);'
            'const spec=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));'
            'const v=s.__x.validate(s.__x.normalize(spec));'
            'if(v.errors.length){console.error(v.errors.join("\\n"));process.exit(1);}')
        r = subprocess.run(["node", "-e", node_script, self.spec_path],
                           capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_injects_into_template(self):
        out_html = os.path.join(self.tmp, "out.html")
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "tools", "inject.py"),
             self.spec_path, os.path.join(ROOT, "template", "flowview.html"),
             out_html],
            capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(out_html) as f:
            self.assertIn("Cumulus command flow", f.read())

    def test_stderr_summary_present(self):
        self.assertIn("nodes", self.stderr)
        self.assertIn("mermaid2spec:", self.stderr)


if __name__ == "__main__":
    unittest.main()
