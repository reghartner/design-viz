"""End-to-end tests for tools/validate.js (the validator + lint CLI).

Drives the real CLI via subprocess: broken fixtures must exit 1 with
field-path errors, example specs must exit 0 with 0 errors, lint findings
must fire on the seeded crowded fixture, and --quiet must suppress them.
"""
import pathlib
import json
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLI = ROOT / "tools" / "validate.js"
FIXTURES = ROOT / "tests" / "fixtures"
TOPOLOGY = ROOT / "examples" / "canon" / "topology"

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
        # steps sharing a first edge each get their own coin: not a finding
        self.assertNotIn("shares first edge", r.stdout)
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

    def test_structurally_invalid_file_does_not_abort_the_batch(self):
        with tempfile.TemporaryDirectory() as temp:
            bad = pathlib.Path(temp) / "bad.json"
            good = pathlib.Path(temp) / "good.json"
            good.write_text(json.dumps({"nodes": {"a": {}}, "rows": [["a"]]}))
            cases = [
                ({"page": {"blocks": {}}}, "page.blocks: must be an array"),
                ({"page": {"sections": "oops"}}, "page.sections: must be an array"),
                ({"nodes": {"a": {}}, "rows": [["a"]], "steps": {}},
                 "sections[0].diagram.steps: must be an array"),
                ({"page": {"blocks": [{"tabs": [None]}]}},
                 "blocks[0].tabs[0]: must be an object"),
            ]
            for raw, expected in cases:
                for quiet in (False, True):
                    with self.subTest(raw=raw, quiet=quiet):
                        bad.write_text(json.dumps(raw))
                        r = run_cli(*(["--quiet"] if quiet else []), str(bad), str(good))
                        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                        self.assertEqual(r.stderr, "")
                        self.assertIn(f"{bad}: ERROR {expected}", r.stdout)
                        self.assertIn(f"{bad}: 1 errors, 0 warnings", r.stdout)
                        self.assertIn(f"{good}: 0 errors, 0 warnings", r.stdout)
                        self.assertLess(r.stdout.index(str(bad)), r.stdout.index(str(good)))

    def test_both_alias_topology_batch_resolves_and_missing_provider_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = pathlib.Path(temp)
            consumer = temp / "checkout.json"
            provider = temp / "platform.json"
            consumer_raw = json.loads((TOPOLOGY / "checkout.json").read_text())
            consumer_raw["page"]["blocks"] = consumer_raw["page"]["sections"]
            consumer_raw["page"]["sections"] = []
            consumer.write_text(json.dumps(consumer_raw))
            shutil.copyfile(TOPOLOGY / "platform.json", provider)
            before = (consumer.read_bytes(), provider.read_bytes())

            resolved = run_cli(str(consumer), str(provider))
            self.assertEqual(resolved.returncode, 0, resolved.stdout + resolved.stderr)
            self.assertIn(f"{consumer}: 0 errors", resolved.stdout)
            self.assertIn(f"{provider}: 0 errors", resolved.stdout)
            self.assertEqual((consumer.read_bytes(), provider.read_bytes()), before)

            missing = run_cli(str(consumer))
            self.assertEqual(missing.returncode, 1, missing.stdout + missing.stderr)
            self.assertIn(f"{consumer}: ERROR Topology checkout", missing.stdout)
            self.assertIn("missing spec platform", missing.stdout)
            self.assertEqual((consumer.read_bytes(), provider.read_bytes()), before)

    def test_invalid_first_then_valid_browse_url_import_batch(self):
        def model(identity, diagram):
            return {"page": {"title": identity, "canon": {"version": 1, "id": identity,
                    "kind": "canonical", "owner": "group:default/test"},
                    "sections": [{"id": "main", "diagram": diagram}]}}
        provider = model("provider", {"nodes": {"api": {}, "store": {}},
            "rows": [["api", "store"]], "edges": [{"from": "api", "to": "store"}],
            "topologyExports": {"core": {"nodes": ["api", "store"], "edges": ["api->store"]}}})
        def consumer(identity, ticket):
            return model(identity, {"topologyImports": [{"spec": "provider", "export": "core", "as": "shared",
                "nodeTracking": {"api": {"tickets": [ticket]}},
                "edgeTracking": {"api->store": {"tickets": ["https://jira.test/jira/browse/API-2?view=detail#comments"]}}}]})
        with tempfile.TemporaryDirectory() as temp:
            paths = [pathlib.Path(temp) / name for name in ["invalid.json", "valid.json", "provider.json"]]
            fixtures = [consumer("invalid", "https://jira.test/issues/API-1"),
                        consumer("valid", "https://jira.test/browse/API-1"), provider]
            for file, data in zip(paths, fixtures):
                file.write_text(json.dumps(data))
            malformed = run_cli(str(paths[0]), str(paths[2]))
            self.assertEqual(malformed.returncode, 1, malformed.stdout + malformed.stderr)
            self.assertIn("invalid tickets entry 0", malformed.stdout)
            # Topology snapshots validate atomically; a JSON parse failure is
            # skipped so the following valid closure must still be reported.
            paths[0].write_text('{"page":')
            before = [file.read_bytes() for file in paths]
            result = run_cli(*(str(file) for file in paths))
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("ERROR JSON parse:", result.stdout)
            self.assertIn(f"{paths[1]}: 0 errors", result.stdout)
            self.assertIn(f"{paths[2]}: 0 errors", result.stdout)
            self.assertNotIn("tickets[0]:", result.stdout)
            self.assertEqual([file.read_bytes() for file in paths], before)


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
