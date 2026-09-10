"""tools/widget_doc.py — selective contract loader for page agents.

Guards the routing mechanism the hld-to-page skill depends on: every panel
type documented in contract/authoring-contract.md must be individually
extractable, and the extracted block must be the contract's own text.
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "widget_doc.py"
CONTRACT = ROOT / "contract" / "authoring-contract.md"

# The engine's panel vocabulary, read from the validator so this test fails
# the moment the vocabulary and the contract drift apart.
_validator = (ROOT / "src" / "validator.js").read_text()
_m = re.search(r"var PANEL_TYPES = \[([^\]]+)\]", _validator)
PANEL_TYPES = re.findall(r"'([a-z]+)'", _m.group(1))
assert len(PANEL_TYPES) >= 17, "PANEL_TYPES not parsed from validator.js"


def run(*args):
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        capture_output=True, text=True, cwd=ROOT,
    )


class WidgetDocTest(unittest.TestCase):
    def test_list_covers_every_panel_type(self):
        p = run("--list")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(sorted(p.stdout.split()), sorted(PANEL_TYPES))

    def test_each_type_extracts_its_own_block(self):
        contract = CONTRACT.read_text()
        for t in PANEL_TYPES:
            p = run(t)
            self.assertEqual(p.returncode, 0, "%s: %s" % (t, p.stderr))
            self.assertIn("- `%s` " % t, p.stdout, t)
            # intro (declaration mechanics) always precedes the block
            self.assertIn("### panels", p.stdout, t)
            # no other widget's block leaks in
            for other in PANEL_TYPES:
                if other != t:
                    self.assertNotIn("\n- `%s` " % other, p.stdout, "%s leaked into %s" % (other, t))
            # general sparse-patch/enterOnce mechanics print for EVERY type,
            # as a shared tail — never folded into a widget's block. Expected
            # tail derived from the contract independently of the parser:
            # from "Patches are SPARSE" to the end of the panels section.
            tail_start = contract.index("Patches are SPARSE")
            tail_end = contract.index("### steps", tail_start)
            expected_tail = contract[tail_start:tail_end].strip()
            self.assertTrue(p.stdout.rstrip().endswith(expected_tail), "%s: shared tail missing or altered" % t)
            # extracted block must EQUAL the contract's own text for this
            # widget: expectation computed from the contract independently
            # of the parser (bullet start to the next bullet / section tail)
            start = contract.index("\n- `%s` " % t) + 1
            ends = [contract.find(m, start + 1) for m in ("\n- `", "\nPatches are SPARSE")]
            end = min(e for e in ends if e != -1)
            expected = contract[start:end].rstrip()
            got = p.stdout.split("\n- `%s` " % t, 1)[1]
            got = ("- `%s` " % t + got.split("\n\nPatches are SPARSE", 1)[0]).rstrip()
            self.assertEqual(got, expected, "%s block not verbatim/complete" % t)

    def test_multiple_types_in_one_call(self):
        p = run("thermo", "battery")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn("- `thermo` ", p.stdout)
        self.assertIn("- `battery` ", p.stdout)

    def test_contract_card_flag(self):
        p = run("--contract-card")
        self.assertEqual(p.returncode, 0, p.stderr)
        contract = CONTRACT.read_text()
        start = contract.index("### message-contract card")
        ends = [contract.find(m, start + 1) for m in ("\n### ", "\n## ")]
        end = min(e for e in ends if e != -1)
        expected = contract[start:end].rstrip()
        self.assertEqual(p.stdout.rstrip(), expected)

    def test_unknown_type_fails_with_valid_list(self):
        p = run("nope")
        self.assertEqual(p.returncode, 2)
        self.assertIn("unknown widget type", p.stderr)
        self.assertIn("thermo", p.stderr)


if __name__ == "__main__":
    unittest.main()
