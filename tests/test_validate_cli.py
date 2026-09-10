"""End-to-end tests for tools/validate.js (the validator + lint CLI).

Drives the real CLI via subprocess: broken fixtures must exit 1 with
field-path errors, example specs must exit 0 with 0 errors, lint findings
must fire on the seeded crowded fixture, and --quiet must suppress them.
"""
import pathlib
import shutil
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLI = ROOT / "tools" / "validate.js"
FIXTURES = ROOT / "tests" / "fixtures"

EXAMPLES = [
    "examples/cumulus/cumulus-page.spec.json",
    "examples/cumulus/cumulus-page.spec.v2.json",
    "examples/doorbell/doorbell.spec.json",
    "examples/doorbell-atlas/atlas.spec.json",
]

BROKEN = {
    "broken-edge-endpoint.json": 'edges[0].to: "ghost"',
    "broken-missing-rows.json": "diagram.rows: required",
    "broken-unknown-node-in-row.json": 'rows[0]: unknown node id "missing"',
    "broken-duplicate-panel-id.json": 'panels[1].id: duplicate panel id "p"',
    "broken-not-a-page.json": "top level: expected",
}


def run_cli(*args):
    return subprocess.run(
        ["node", str(CLI), *args],
        capture_output=True, text=True, cwd=ROOT,
    )


@unittest.skipUnless(shutil.which("node"), "node not available")
class ValidateCliTest(unittest.TestCase):

    def test_broken_fixtures_exit_1_with_field_paths(self):
        for name, expected in BROKEN.items():
            with self.subTest(fixture=name):
                r = run_cli(str(FIXTURES / name))
                self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                self.assertIn("ERROR", r.stdout)
                self.assertIn(expected, r.stdout)

    def test_example_specs_pass_with_zero_errors(self):
        r = run_cli(*EXAMPLES)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for spec in EXAMPLES:
            self.assertIn(f"{spec}: 0 errors", r.stdout)

    def test_lint_findings_fire_on_crowded_fixture(self):
        r = run_cli(str(FIXTURES / "lint-crowded.json"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)  # lint never errors
        self.assertIn("lint", r.stdout)
        self.assertIn("cross the corridor", r.stdout)
        self.assertIn("longer than its edge", r.stdout)
        self.assertIn("shares first edge", r.stdout)
        self.assertIn("unusedproto", r.stdout)

    def test_quiet_suppresses_warnings_keeps_summary(self):
        r = run_cli("--quiet", str(FIXTURES / "lint-crowded.json"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("lint  ", r.stdout)
        self.assertNotIn("warn  ", r.stdout)
        self.assertIn("errors,", r.stdout)  # summary line stays

    def test_unparseable_file_exits_1(self):
        r = run_cli("README.md")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("JSON parse", r.stdout)

    def test_no_files_exits_2_with_usage(self):
        r = run_cli()
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)


class ContractCardCliTest(unittest.TestCase):
    """A malformed message-contract card degrades with warnings, never errors."""

    @unittest.skipUnless(shutil.which("node"), "node not available")
    def test_malformed_contract_warns_but_exits_zero(self):
        r = run_cli(str(FIXTURES / "warn-malformed-contract.json"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("warn  ", r.stdout)
        self.assertIn("contract.fields[0].k: required", r.stdout)
        self.assertIn("contract.fields[1].link", r.stdout)
        self.assertIn("0 errors", r.stdout)


if __name__ == "__main__":
    unittest.main()
