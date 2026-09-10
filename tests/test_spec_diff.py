"""Tests for tools/spec_diff.py and page_build.py --diff-prev."""

import copy
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import spec_diff  # noqa: E402

TOOL = ROOT / "tools" / "spec_diff.py"
PAGE_BUILD = ROOT / "tools" / "page_build.py"
FENCE = re.compile(r"```json\n(.*?)\n```", re.DOTALL)


def make_spec(
    fields,
    *,
    heading="Wire format",
    title="On the wire: event",
    version="v1",
    steps=2,
    panels=("status",),
    nodes=("device", "cloud"),
):
    return {
        "page": {
            "title": "Diff fixture",
            "generatedFrom": {"url": "https://example.test/hld", "version": version},
            "sections": [{
                "heading": heading,
                "contract": {"title": title, "fields": copy.deepcopy(fields)},
                "diagram": {
                    "nodes": {node: {"title": node} for node in nodes},
                    "rows": [list(nodes)],
                    "edges": [],
                    "panels": [{"id": panel, "type": "state"} for panel in panels],
                    "steps": [{} for _ in range(steps)],
                },
            }],
        }
    }


class SpecDiffTests(unittest.TestCase):
    def setUp(self):
        self.old = make_spec([
            {"k": "kept", "v": "1", "g": "same"},
            {"k": "gone", "v": "legacy", "g": "old gloss", "hot": True},
            {"k": "changed", "v": "old", "g": "old meaning"},
        ])
        self.new = make_spec([
            {"k": "kept", "v": "1", "g": "same"},
            {"k": "changed", "v": "new", "g": "new meaning"},
            {"k": "fresh", "v": "2", "g": "new field"},
        ], version="v2", steps=3, panels=("status", "log"),
           nodes=("device", "broker"))

    def test_reports_removed_added_changed_and_report_only_changes(self):
        diff = spec_diff.compare_specs(self.old, self.new)
        self.assertEqual(
            [(change.kind, change.key) for change in diff.field_changes],
            [("removed", "gone"), ("changed", "changed"), ("added", "fresh")],
        )
        self.assertEqual(diff.generated_from_version, ("v1", "v2"))
        self.assertEqual(len(diff.diagram_changes), 1)
        diagram = diff.diagram_changes[0]
        self.assertEqual((diagram.old_steps, diagram.new_steps), (2, 3))
        self.assertEqual(diagram.panels_added, ("log",))
        self.assertEqual(diagram.nodes_added, ("broker",))
        self.assertEqual(diagram.nodes_removed, ("cloud",))
        summary = spec_diff.format_summary(diff)
        self.assertIn("removed field gone", summary)
        self.assertIn("steps 2 -> 3", summary)
        self.assertIn('generatedFrom.version: "v1" -> "v2"', summary)

    def test_annotation_marks_new_rows_and_inserts_old_removed_row(self):
        annotated = spec_diff.annotate_spec(self.old, self.new)
        fields = annotated["page"]["sections"][0]["contract"]["fields"]
        self.assertEqual([row["k"] for row in fields],
                         ["kept", "gone", "changed", "fresh"])
        by_key = {row["k"]: row for row in fields}
        self.assertNotIn("delta", by_key["kept"])
        self.assertEqual(by_key["gone"]["delta"], "removed")
        self.assertEqual(by_key["gone"]["v"], "legacy")
        self.assertEqual(by_key["gone"]["g"], "old gloss")
        self.assertTrue(by_key["gone"]["hot"])
        self.assertEqual(by_key["changed"]["delta"], "changed")
        self.assertEqual(by_key["fresh"]["delta"], "added")
        self.assertEqual([row["k"] for row in
                          self.new["page"]["sections"][0]["contract"]["fields"]],
                         ["kept", "changed", "fresh"], "new input is not mutated")

    def test_matching_requires_complete_card_identity(self):
        old = make_spec([{"k": "ttl", "v": "30s", "g": "expiry"}],
                        heading="Old heading", title="Stable payload")
        new = make_spec([{"k": "ttl", "v": "60s", "g": "expiry"}],
                        heading="New heading", title="Stable payload")
        diff = spec_diff.compare_specs(old, new)
        self.assertEqual([(change.kind, change.key) for change in diff.field_changes],
                         [("removed", "ttl"), ("added", "ttl")])
        annotated = spec_diff.annotate_spec(old, new)
        fields = annotated["page"]["sections"][0]["contract"]["fields"]
        self.assertEqual([(row["k"], row.get("delta")) for row in fields],
                         [("ttl", "added")])

    def test_reordered_duplicate_cards_pair_by_shared_field_keys(self):
        def card(scope, status):
            return {
                "heading": "Duplicate heading",
                "contract": {
                    "title": "Duplicate title",
                    "fields": [
                        {"k": f"scope_{scope}", "v": scope, "g": "identity field"},
                        {"k": "status", "v": status, "g": "card state"},
                    ],
                },
            }

        old = {"page": {"sections": [card("alpha", "old"), card("beta", "same")]}}
        new = {"page": {"sections": [card("beta", "same"), card("alpha", "new")]}}

        diff = spec_diff.compare_specs(old, new)
        self.assertEqual(
            [(change.kind, change.key, change.old["v"], change.new["v"])
             for change in diff.field_changes],
            [("changed", "status", "old", "new")],
        )

        annotated = spec_diff.annotate_spec(old, new)
        cards = annotated["page"]["sections"]
        self.assertTrue(all("delta" not in row
                            for row in cards[0]["contract"]["fields"]))
        self.assertEqual(
            [(row["k"], row.get("delta"))
             for row in cards[1]["contract"]["fields"]],
            [("scope_alpha", None), ("status", "changed")],
        )

    def test_unique_identity_zero_overlap_still_pairs_and_annotates(self):
        # a fully-rewritten card (no shared field keys) with a unique
        # heading+title identity must diff as ONE card: old rows removed,
        # new rows added — never as a removed card plus an added card
        old = make_spec([{"k": "a"}, {"k": "b"}])
        new = make_spec([{"k": "x"}, {"k": "y"}])
        diff = spec_diff.compare_specs(old, new)
        kinds = sorted((change.kind, change.key) for change in diff.field_changes)
        self.assertEqual(kinds, [("added", "x"), ("added", "y"),
                                 ("removed", "a"), ("removed", "b")])
        annotated = spec_diff.annotate_spec(old, new)
        rows = annotated["page"]["sections"][0]["contract"]["fields"]
        deltas = sorted((row["k"], row.get("delta")) for row in rows)
        self.assertIn(("a", "removed"), deltas)
        self.assertIn(("x", "added"), deltas)

    def test_reordered_duplicates_use_optimal_assignment(self):
        # two same-identity cards swapped in order must pair by content —
        # zero false verdicts
        def two_cards(first, second):
            base = make_spec(first)
            twin = make_spec(second)["page"]["sections"][0]
            base["page"]["sections"].append(twin)
            return base
        old = two_cards([{"k": "a"}, {"k": "b"}, {"k": "c"}],
                        [{"k": "x"}, {"k": "y"}, {"k": "z"}])
        new = two_cards([{"k": "x"}, {"k": "y"}, {"k": "z"}],
                        [{"k": "a"}, {"k": "b"}, {"k": "c"}])
        diff = spec_diff.compare_specs(old, new)
        self.assertEqual(diff.field_changes, [])

    def test_reordered_duplicate_heading_diagrams_pair_by_node_ids(self):
        # two same-heading diagram sections swapped in order must pair by
        # node content — zero fabricated node/panel/step changes
        def two_diagrams(first_nodes, second_nodes):
            base = make_spec([{"k": "f"}], nodes=first_nodes)
            twin = make_spec([{"k": "f"}], nodes=second_nodes)["page"]["sections"][0]
            del twin["contract"]
            base["page"]["sections"].append(twin)
            return base
        old = two_diagrams(("alpha", "beta"), ("gamma", "delta"))
        new = two_diagrams(("gamma", "delta"), ("alpha", "beta"))
        diff = spec_diff.compare_specs(old, new)
        self.assertEqual(diff.diagram_changes, [])

    def test_cli_annotate_and_quiet(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            old_path, new_path, out_path = (
                temp_path / "old.json", temp_path / "new.json", temp_path / "out.json")
            old_path.write_text(json.dumps(self.old))
            new_path.write_text(json.dumps(self.new))
            result = subprocess.run(
                [sys.executable, str(TOOL), str(old_path), str(new_path),
                 "--annotate", str(out_path), "--quiet"],
                capture_output=True, text=True, cwd=ROOT)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout, "")
            fields = json.loads(out_path.read_text())["page"]["sections"][0]["contract"]["fields"]
            self.assertEqual({row.get("delta") for row in fields if row["k"] != "kept"},
                             {"removed", "changed", "added"})


@unittest.skipUnless(shutil.which("node"), "node not available")
class PageBuildDiffPrevTests(unittest.TestCase):
    def setUp(self):
        self.temp = pathlib.Path(tempfile.mkdtemp())
        self.root = self.temp / "examples"
        self.source = self.temp / "source.spec.json"
        recipe = FENCE.findall((ROOT / "cookbook" / "temperature.md").read_text())[0]
        self.spec = json.loads(recipe)
        section = self.spec["page"]["blocks"][0]
        section["contract"] = {
            "title": "Temperature sample",
            "fields": [{"k": "temp", "v": "48", "g": "degrees C"}],
        }

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def run_build(self, *extra):
        self.source.write_text(json.dumps(self.spec))
        return subprocess.run(
            [sys.executable, str(PAGE_BUILD), str(self.source), "acme/thermal",
             "--root", str(self.root), *extra],
            capture_output=True, text=True, cwd=ROOT)

    def test_diff_prev_prints_after_success_and_never_annotates_copy(self):
        first = self.run_build()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        fields = self.spec["page"]["blocks"][0]["contract"]["fields"]
        fields[0]["v"] = "75"
        fields.append({"k": "zone", "v": "warning", "g": "thermal state"})
        second = self.run_build("--diff-prev")
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertLess(second.stdout.index("PAGE_BUILD OK"),
                        second.stdout.index("SPEC_DIFF:"))
        self.assertIn("changed field temp", second.stdout)
        self.assertIn("added field zone", second.stdout)
        copied = json.loads(
            (self.root / "acme" / "thermal.spec.json").read_text())
        copied_fields = copied["page"]["blocks"][0]["contract"]["fields"]
        self.assertTrue(all("delta" not in row for row in copied_fields))


if __name__ == "__main__":
    unittest.main()
