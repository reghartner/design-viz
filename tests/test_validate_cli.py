"""End-to-end tests for tools/validate.js (the validator + lint CLI).

Drives the real CLI via subprocess: broken fixtures must exit 1 with
field-path errors, example specs must exit 0 with 0 errors, lint findings
must fire on the seeded crowded fixture, and --quiet must suppress them.
"""
# Issue #878 PR 1 contract matrix: the missing-provider error names its remedy.
# Source: ticket #878 "How it should look" mode table and "Test + flip" test 1
# (first and third cases); Chuck's ruling 2026-11-02: files passed together (no
# connected-folder copy) gains the fix text naming both remedies with their exact
# command forms; the --resolve-imports message is unchanged; import resolution and
# exit codes are unchanged outside a connected folder.
# Fixture "alias pair": write_alias_topology() = examples/canon/topology checkout
# (page.blocks alias, imports platform export core) + platform provider.
# The remedy rows are scoped to the missing-provider ERROR line itself.
#
# | row | fixture | assertion (scoped) | rejects |
# |---|---|---|---|
# | 1 provider supplied: resolves, no remedy (guard) | alias pair, both files passed | exit 0; "<consumer>: 0 errors" and "<provider>: 0 errors"; stdout names neither "--resolve-imports" nor "refresh-sources" | an impl that prints the remedy whenever a spec declares topology |
# | 2 provider missing: error, count and exit unchanged | consumer passed alone | exit 1; stderr empty; stdout is exactly two lines: the ERROR line (starts "<consumer>: ERROR Topology checkout", contains "missing spec platform") then the summary, exactly "<consumer>: 1 errors, 0 warnings"; input bytes unchanged | an impl that replaces the topology error with the hint, adds a separate hint line, appends hint text to the summary line, counts the hint as a second error, or changes the exit code |
# | 3 provider missing: names --resolve-imports (new) | consumer passed alone | the row-2 ERROR line contains "--resolve-imports <repository folder or registry>" | today's output; a paraphrase ("--resolve-imports <repo>"); the hint on the summary line, on a line detached from the error, or on stderr |
# | 4 provider missing: names refresh-sources (new) | consumer passed alone | the row-2 ERROR line contains "folder-agent.py refresh-sources --source-repo <repository>" | an impl naming only --resolve-imports; bare "refresh-sources" without the helper or --source-repo; the hint on the summary line or detached from the error |
# | 5 --resolve-imports, unlisted provider: message unchanged (guard) | alias pair + registry JSON listing only checkout; precondition: listing both resolves with 0 errors | exit 1; stderr empty; stdout lines exactly ["<consumer>: ERROR Topology import references missing spec platform in <registry>", "<consumer>: 1 errors, 0 warnings"]; input bytes unchanged | an impl that appends the files-passed-together remedy to every missing-spec error, or drops the registry path |
#
# Issue #878 PR 2 contract matrix (ConnectedFolderCopyTest): the bundled validate.js
# validates imports against the Workbench's provider copy in a connected folder.
# Source: ticket #878 "How it should look" (provider copy, out-of-date check, size
# limit, where validate.js looks, mode table row 2) and "Test + flip" test 1;
# Chuck's ruling 2026-11-02 (coverage = the ticket's test plan; desktop only).
# Fixture "kit": the real authoring kit built by tools/folder_agent_kit.py and
# unpacked by folder-agent.py prepare() into <consumer>/.flowview-agent/authoring,
# so the tool under test is <consumer>/.flowview-agent/authoring/tools/validate.js.
# Fixture "base session": .flowview-agent/providers.json = {version 1,
# providersSha256 = sha256(payloadText), payloadText = JSON of {sourceKind local,
# snapshotSha256, consumerId, specs [platform]}}; state.json names that hash with revision
# "connection-7"; editor.json connected, same identity, heartbeat now. The consumer
# is examples/canon/topology checkout.json (imports platform export core). Each
# failure row changes exactly one thing in the base session (row 7 proves the base
# session validates). Message rows are scoped to the "<candidate>: ERROR" line.
#
# | row | fixture | assertion (scoped) | rejects |
# |---|---|---|---|
# | 7 copy used by default | kit + base session; consumer outside .flowview-agent | exit 0; "<consumer>: 0 errors"; stdout names revision "connection-7" | today's validate.js, which ignores the copy; an impl that does not print the revision it validated against |
# | 8 copy lacks a provider the current draft imports (mode table row 2; stale or incomplete copy) | base session with specs []; state.json source = checkout.json (the current draft imports platform) | exit 1; the consumer's ERROR line contains "missing spec platform" and "folder-agent.py refresh-sources --source-repo <repository>" and not "--resolve-imports" | the files-passed-together message (names --resolve-imports); an impl that ignores the copy; an impl that sends every missing provider to --resolve-imports |
# | 9a out of date: hashes differ | state.json providersSha256 = another hex | exit 1; ERROR line contains "out of date" | an impl that trusts the copy without comparing it to state.json |
# | 9b out of date: no hash in state.json | state.json without providersSha256 | exit 1; ERROR line contains "out of date" | an impl that treats a missing hash as a match |
# | 9c out of date: partial or edited copy | payloadText changed after hashing (state and copy still agree) | exit 1; ERROR line contains "out of date" | an impl that compares only the two stored hashes |
# | 9c2 stored bytes are hashed, not re-serialized | payloadText with extra whitespace and reordered keys; hash over the stored string | exit 0; "<consumer>: 0 errors" | an impl that re-serializes the parsed payload before hashing |
# | 9f not connected: explicit disconnect | editor.json connected false | exit 1; ERROR line contains "not connected" and "reconnect" | an impl that checks only the hashes |
# | 9g stale heartbeat (old) | editor.json at = now - 20 s | exit 1; ERROR line contains "Bring the existing Workbench tab to the front and retry" and not "not connected" | an impl without the 15 s rule; one that tells the agent to reconnect for a stale heartbeat |
# | 9g2 heartbeat in the future | at = now + 60 s | same as 9g | an age check without the not-in-the-future bound |
# | 9g3 invalid heartbeat | at missing / "string" / true / null (one subtest each) | same as 9g | an impl that coerces true or numeric strings |
# | 9h other connection | editor.json connectionId differs from state.json | exit 1; ERROR line contains "not connected" | an impl that checks only connected: true |
# | 9i other session | editor.json sessionId differs (same connectionId) | exit 1; ERROR line contains "not connected" | an impl that compares connectionId only |
# | 10 oversize copy | copy {version 1, providersSha256, oversize true}, no payloadText; state names the hash | exit 1; ERROR line contains "too large" and "--resolve-imports" | an impl that reports out of date or crashes on the header-only copy |
# | 11a candidate anywhere | candidates inside .flowview-agent and in another folder | each: exit 0 and "<file>: 0 errors" | an impl that looks beside the input spec |
# | 11b one copy for the whole batch | two consumers importing platform in one invocation | both "<file>: 0 errors" | an impl that applies the copy to the first file only |
# | 11c explicit file wins | copy's platform lacks export core (copy alone fails with missing export); positional platform.json has it | exit 0 with both files; copy alone: exit 1 "missing export core" | an impl where the copied provider replaces the positional one |
# | 11d --resolve-imports ignores the copy (guard) | base session + registry listing only checkout | registry message unchanged: "missing spec platform in <registry>" | an impl that consults the copy in registry mode |
# | 11e repository tools/validate.js ignores a copy (guard) | base session beside the candidate; run tools/validate.js | exit 1 with the files-passed-together message (names --resolve-imports) | an impl that looks for providers.json relative to the input spec |
# | 13 canon-less candidate in a canon.json repository (stress test 2026-11-02) | "local repo": canon.json + base, middle, consumer spec files without page.canon (the local-repository.spec.mjs shapes); copy specs = base and middle as the Workbench writes them (FlowCanonLibrary.spec membership, tools/canon/manifest.cjs); consumerId "consumer" (registered) and "workbench-draft" (independent), one subtest each; candidate .flowview-agent/candidate.spec.json = consumer.spec.json bytes | exit 0; "<candidate>: 0 errors" | an impl that needs page.canon in the candidate ("specs require unique page.canon.id identities: undefined") |
# | 14 canon-less consumer outside copy mode gets the #880 remedy | local repo consumer.spec.json run alone with tools/validate.js | exit 1; its ERROR line contains "missing spec middle", "--resolve-imports <repository folder or registry>" and "folder-agent.py refresh-sources --source-repo <repository>", and not "unique page.canon.id" | today's bare identity error |
# | 15 provider new in the candidate (stress X1, 2026-11-03) | base session (copy holds platform); state.json source = checkout.json (the current draft imports only platform); candidate = checkout plus an import of ledger | exit 1; the candidate's ERROR line contains "missing spec ledger", "new in this candidate", "The Workbench loads it when it reviews your proposal" and "--resolve-imports <repository folder or registry>", and not "refresh-sources" | a message saying the Workbench does not or cannot load it at review; today's refresh-sources remedy, which loops: refresh-sources loads only the current draft's closure, so the copy cannot hold a provider only the candidate imports |
# | 16 provider the current draft imports transitively (stale copy) | local repo: copy holds middle only (not base); state.json source = consumer.spec.json (imports middle, which imports base); candidate = consumer.spec.json | exit 1; the candidate's ERROR line contains "missing spec base" and "folder-agent.py refresh-sources --source-repo <repository>" and not "--resolve-imports" | an impl that compares only the draft's direct imports |
# | 12 Workbench writes / state.json / browser cases (tests 1b-1e, 2-5) | — | — | covered in tests/folder-agent.test.js and tools/browser-tests/tests/local-repository.spec.mjs |
import hashlib
import importlib.util
import pathlib
import time
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


# The two remedies a files-passed-together missing-provider error names (#878).
MISSING_PROVIDER_REMEDIES = (
    "--resolve-imports <repository folder or registry>",
    "folder-agent.py refresh-sources --source-repo <repository>",
)


def write_alias_topology(temp):
    """Both-alias consumer (page.blocks) and its provider, written into temp."""
    consumer = temp / "checkout.json"
    provider = temp / "platform.json"
    consumer_raw = json.loads((TOPOLOGY / "checkout.json").read_text())
    consumer_raw["page"]["blocks"] = consumer_raw["page"]["sections"]
    consumer_raw["page"]["sections"] = []
    consumer.write_text(json.dumps(consumer_raw))
    shutil.copyfile(TOPOLOGY / "platform.json", provider)
    return consumer, provider


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
            consumer, provider = write_alias_topology(pathlib.Path(temp))
            before = (consumer.read_bytes(), provider.read_bytes())

            # Row 1: with the provider supplied the batch resolves, so the
            # failure below is caused by the missing provider alone.
            resolved = run_cli(str(consumer), str(provider))
            self.assertEqual(resolved.returncode, 0, resolved.stdout + resolved.stderr)
            self.assertIn(f"{consumer}: 0 errors", resolved.stdout)
            self.assertIn(f"{provider}: 0 errors", resolved.stdout)
            self.assertNotIn("--resolve-imports", resolved.stdout)
            self.assertNotIn("refresh-sources", resolved.stdout)
            self.assertEqual((consumer.read_bytes(), provider.read_bytes()), before)

            # Row 2: the topology error, error count and exit code are unchanged;
            # the output is the ERROR line then an exact summary, nothing else.
            missing = run_cli(str(consumer))
            self.assertEqual(missing.returncode, 1, missing.stdout + missing.stderr)
            self.assertEqual(missing.stderr, "")
            lines = missing.stdout.splitlines()
            self.assertEqual(len(lines), 2, missing.stdout)
            error_line, summary_line = lines
            self.assertTrue(error_line.startswith(f"{consumer}: ERROR Topology checkout"), error_line)
            self.assertIn("missing spec platform", error_line)
            self.assertEqual(summary_line, f"{consumer}: 1 errors, 0 warnings")
            self.assertEqual((consumer.read_bytes(), provider.read_bytes()), before)

            # Rows 3-4: the missing-provider ERROR line itself names both
            # remedies verbatim.
            for remedy in MISSING_PROVIDER_REMEDIES:
                with self.subTest(remedy=remedy):
                    self.assertIn(remedy, error_line)

    def test_resolve_imports_unlisted_provider_keeps_registry_message(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = pathlib.Path(temp)
            consumer, provider = write_alias_topology(temp)
            registry = temp / "registry.json"
            before = (consumer.read_bytes(), provider.read_bytes())
            entries = [{"id": "checkout", "path": consumer.name},
                       {"id": "platform", "path": provider.name}]

            # Precondition: with the provider listed the same consumer resolves,
            # so the failure below is caused by the unlisted provider alone.
            registry.write_text(json.dumps({"version": 1, "diagrams": entries}))
            listed = run_cli("--resolve-imports", str(registry), str(consumer))
            self.assertEqual(listed.returncode, 0, listed.stdout + listed.stderr)
            self.assertIn(f"{consumer}: 0 errors", listed.stdout)

            # Row 5: the --resolve-imports message is unchanged; it names the
            # registry it searched and gains no files-passed-together remedy.
            registry.write_text(json.dumps({"version": 1, "diagrams": entries[:1]}))
            unlisted = run_cli("--resolve-imports", str(registry), str(consumer))
            self.assertEqual(unlisted.returncode, 1, unlisted.stdout + unlisted.stderr)
            self.assertEqual(unlisted.stderr, "")
            self.assertEqual(unlisted.stdout.splitlines(), [
                f"{consumer}: ERROR Topology import references missing spec platform in {registry}",
                f"{consumer}: 1 errors, 0 warnings",
            ])
            self.assertEqual((consumer.read_bytes(), provider.read_bytes()), before)

    # #878 PR 2 row 14.
    def test_canonless_consumer_without_a_copy_names_both_remedies(self):
        with tempfile.TemporaryDirectory() as temp:
            consumer, _ = write_local_repository(pathlib.Path(temp))
            result = run_cli(str(consumer))
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            lines = [line for line in result.stdout.splitlines() if line.startswith(f"{consumer}: ERROR ")]
            self.assertEqual(len(lines), 1, result.stdout)
            self.assertNotIn("unique page.canon.id", lines[0])
            self.assertIn("missing spec middle", lines[0])
            for remedy in MISSING_PROVIDER_REMEDIES:
                with self.subTest(remedy=remedy):
                    self.assertIn(remedy, lines[0])

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


# A canon.json repository whose spec files carry no page.canon: identity comes from
# the registry folder (the shapes of tools/browser-tests/tests/local-repository.spec.mjs).
LOCAL_SPECS = {
    "base": {"page": {"title": "Base", "sections": [{"id": "main", "diagram": {
        "nodes": {"api": {"title": "Local shared API"}, "store": {"title": "Local shared store"}},
        "rows": [["api", "store"]], "edges": [{"from": "api", "to": "store", "label": "Persist"}],
        "topologyExports": {"core": {"nodes": ["api", "store"], "edges": ["api->store"]}}}}]}},
    "middle": {"page": {"title": "Middle", "sections": [{"id": "main", "diagram": {
        "topologyImports": [{"spec": "base", "export": "core", "as": "base"}],
        "topologyExports": {"core": {"nodes": ["base::api", "base::store"], "edges": ["base::api->base::store"]}}}}]}},
    "consumer": {"page": {"title": "Local consumer", "sections": [{"id": "main", "diagram": {
        "nodes": {"local": {"title": "Editable local"}}, "rows": [["local"]],
        "topologyImports": [{"spec": "middle", "export": "core", "as": "shared", "position": {"x": 450, "y": 150}}]}}]}},
}


def write_local_repository(root):
    """Write the repository; return (consumer spec path, providers as the Workbench writes them)."""
    registry = {"version": 1, "diagrams": [{"folder": "diagrams/team/" + key, "owner": "group:default/local"}
                                           for key in LOCAL_SPECS]}
    root.mkdir(parents=True, exist_ok=True)
    (root / "canon.json").write_text(json.dumps(registry))
    for key, spec in LOCAL_SPECS.items():
        folder = root / "diagrams" / "team" / key
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{key}.spec.json").write_text(json.dumps(spec, indent=2))
    script = ("const m=require(process.argv[1]),fs=require('fs'),path=require('path'),root=process.argv[2];"
              "const entries=m.entries(JSON.parse(fs.readFileSync(path.join(root,'canon.json'),'utf8')));"
              "process.stdout.write(JSON.stringify(entries.filter(e=>e.id!=='consumer').map(e=>"
              "m.spec(JSON.parse(fs.readFileSync(path.join(root,e.path),'utf8')),e))));")
    providers = json.loads(subprocess.check_output(
        ["node", "-e", script, str(ROOT / "tools/canon/manifest.cjs"), str(root)], text=True))
    assert [spec["page"]["canon"]["id"] for spec in providers] == ["base", "middle"]
    assert "canon" not in LOCAL_SPECS["consumer"]["page"]
    return root / "diagrams" / "team" / "consumer" / "consumer.spec.json", providers


def load_tool(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OUT_OF_DATE = "out of date"
NOT_CONNECTED = "not connected"
STALE_HEARTBEAT = "Bring the existing Workbench tab to the front and retry"
COPY_REMEDY = "folder-agent.py refresh-sources --source-repo <repository>"
OWNER = {"sessionId": "session-878", "connectionId": "connection"}
DELETE = object()  # marks a key write_session() removes


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@unittest.skipUnless(shutil.which("node"), "node not available")
class ConnectedFolderCopyTest(unittest.TestCase):
    """#878 PR 2: the bundled validate.js reads the Workbench's provider copy."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="flowview-provider-copy-")
        cls.root = pathlib.Path(cls.temp.name)
        cls.consumer_folder = cls.root / "consumer"
        cls.session = cls.consumer_folder / ".flowview-agent"
        cls.session.mkdir(parents=True)
        kit_builder = load_tool("folder_agent_kit_878", "tools/folder_agent_kit.py")
        helper = load_tool("folder_agent_878", "tools/folder-agent.py")
        runtime = subprocess.check_output(
            ["node", str(ROOT / "tools/source-loader.cjs"), "--module", "backend", "cjs"], text=True)
        (cls.session / "authoring-kit.json").write_text(kit_builder.folder_agent_kit(ROOT, runtime))
        helper.prepare(cls.session)
        cls.bundled = cls.session / "authoring" / "tools" / "validate.js"
        assert cls.bundled.is_file(), "precondition: prepare() unpacked the bundled validate.js"
        cls.consumer = cls.consumer_folder / "checkout.json"
        shutil.copyfile(TOPOLOGY / "checkout.json", cls.consumer)
        cls.platform = json.loads((TOPOLOGY / "platform.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        for name in ("providers.json", "state.json", "editor.json"):
            (self.session / name).unlink(missing_ok=True)

    def payload_text(self, specs=None):
        payload = {"sourceKind": "local", "snapshotSha256": "a" * 64, "consumerId": "checkout",
                   "specs": [self.platform] if specs is None else specs}
        return json.dumps(payload)

    def write_session(self, payload_text=None, copy=None, state=None, editor=None):
        """Write the base session; keyword overrides replace one file's fields."""
        text = self.payload_text() if payload_text is None else payload_text
        digest = sha256(text)
        copy_value = {"version": 1, "providersSha256": digest, "payloadText": text}
        state_value = {**OWNER, "revision": "connection-7", "topologyRevision": 3,
                       "providersSha256": digest, "source": "{}"}
        editor_value = {**OWNER, "connected": True, "at": time.time() * 1000}
        for value, override in ((copy_value, copy), (state_value, state), (editor_value, editor)):
            for key, item in (override or {}).items():
                if item is DELETE:
                    value.pop(key, None)
                else:
                    value[key] = item
        (self.session / "providers.json").write_text(json.dumps(copy_value))
        (self.session / "state.json").write_text(json.dumps(state_value))
        (self.session / "editor.json").write_text(json.dumps(editor_value))
        return digest

    def bundled_run(self, *args):
        return subprocess.run(["node", str(self.bundled), *args], capture_output=True, text=True,
                              cwd=self.consumer_folder)

    def error_line(self, result, file):
        lines = [line for line in result.stdout.splitlines() if line.startswith(f"{file}: ERROR ")]
        self.assertTrue(lines, f"no ERROR line for {file}:\n{result.stdout}{result.stderr}")
        return lines[0]

    def assert_rejected(self, phrase, absent=None):
        result = self.bundled_run(str(self.consumer))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        line = self.error_line(result, self.consumer)
        self.assertIn(phrase, line)
        if absent:
            self.assertNotIn(absent, line)
        return line

    # Row 7.
    def test_valid_live_copy_validates_the_consumer_and_names_its_revision(self):
        self.write_session()
        result = self.bundled_run(str(self.consumer))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"{self.consumer}: 0 errors", result.stdout)
        self.assertIn("connection-7", result.stdout)

    # Row 8.
    def test_copy_without_the_provider_names_refresh_sources(self):
        self.write_session(payload_text=self.payload_text(specs=[]), state={"source": self.consumer.read_text()})
        line = self.assert_rejected(COPY_REMEDY, absent="--resolve-imports")
        self.assertIn("missing spec platform", line)

    # Row 15.
    def test_provider_new_in_the_candidate_names_resolve_imports(self):
        self.write_session(state={"source": self.consumer.read_text()})
        raw = json.loads(self.consumer.read_text())
        raw["page"]["sections"][0]["diagram"]["topologyImports"].append({"spec": "ledger", "export": "public", "as": "ledger"})
        candidate = self.session / "candidate-new-import.spec.json"
        candidate.write_text(json.dumps(raw))
        result = self.bundled_run(str(candidate))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        line = self.error_line(result, candidate)
        for phrase in ("missing spec ledger", "new in this candidate", "The Workbench loads it when it reviews your proposal",
                       "--resolve-imports <repository folder or registry>"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, line)
        self.assertNotIn("refresh-sources", line)

    # Row 16.
    def test_provider_the_draft_imports_transitively_names_refresh_sources(self):
        consumer, providers = write_local_repository(self.root / "repo-16")
        middle = [spec for spec in providers if spec["page"]["canon"]["id"] == "middle"]
        text = json.dumps({"sourceKind": "local", "snapshotSha256": "a" * 64, "consumerId": "consumer", "specs": middle})
        self.write_session(payload_text=text, state={"source": consumer.read_text()})
        result = self.bundled_run(str(consumer))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        line = self.error_line(result, consumer)
        self.assertIn("missing spec base", line)
        self.assertIn(COPY_REMEDY, line)
        self.assertNotIn("--resolve-imports", line)

    # Rows 9a-9c.
    def test_state_names_a_different_copy(self):
        self.write_session(state={"providersSha256": "b" * 64})
        self.assert_rejected(OUT_OF_DATE)

    def test_state_without_a_copy_hash(self):
        self.write_session(state={"providersSha256": DELETE})
        self.assert_rejected(OUT_OF_DATE)

    def test_partial_or_edited_copy(self):
        digest = self.write_session()
        copy = json.loads((self.session / "providers.json").read_text())
        copy["payloadText"] = copy["payloadText"][:-1] + " }"
        self.assertEqual(copy["providersSha256"], digest)
        (self.session / "providers.json").write_text(json.dumps(copy))
        self.assert_rejected(OUT_OF_DATE)

    # Row 9c2.
    def test_stored_payload_bytes_are_hashed_as_is(self):
        text = '{ "specs" : [ ' + json.dumps(self.platform, indent=3) + ' ],\n  "sourceKind": "local" }'
        self.assertNotEqual(text, json.dumps(json.loads(text)))
        self.write_session(payload_text=text)
        result = self.bundled_run(str(self.consumer))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"{self.consumer}: 0 errors", result.stdout)

    # Rows 9f, 9h, 9i.
    def test_explicit_disconnect_is_not_connected(self):
        self.write_session(editor={"connected": False})
        line = self.assert_rejected(NOT_CONNECTED, absent=STALE_HEARTBEAT)
        self.assertIn("reconnect", line.lower())

    def test_other_connection_is_not_connected(self):
        self.write_session(editor={"connectionId": "other-connection"})
        self.assert_rejected(NOT_CONNECTED, absent=STALE_HEARTBEAT)

    def test_other_session_is_not_connected(self):
        self.write_session(editor={"sessionId": "other-session"})
        self.assert_rejected(NOT_CONNECTED, absent=STALE_HEARTBEAT)

    # Rows 9g-9g3.
    def test_stale_future_or_invalid_heartbeat_asks_to_bring_the_tab_forward(self):
        now = time.time() * 1000
        for label, at in (("old", now - 20000), ("future", now + 60000), ("missing", DELETE),
                          ("string", str(int(now))), ("true", True), ("null", None)):
            with self.subTest(heartbeat=label):
                self.write_session(editor={"at": at})
                self.assert_rejected(STALE_HEARTBEAT, absent=NOT_CONNECTED)

    # Row 10.
    def test_oversize_copy_names_resolve_imports(self):
        digest = sha256(self.payload_text())
        self.write_session(copy={"payloadText": DELETE, "oversize": True})
        self.assertEqual(json.loads((self.session / "state.json").read_text())["providersSha256"], digest)
        line = self.assert_rejected("too large")
        self.assertIn("--resolve-imports", line)

    # Row 11a.
    def test_candidates_inside_and_outside_the_session_folder_use_the_copy(self):
        self.write_session()
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir(exist_ok=True)
        for candidate in (self.session / "candidate-878.spec.json", elsewhere / "checkout.json"):
            with self.subTest(candidate=str(candidate)):
                shutil.copyfile(self.consumer, candidate)
                result = self.bundled_run(str(candidate))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(f"{candidate}: 0 errors", result.stdout)

    # Row 11b.
    def test_every_candidate_in_one_invocation_uses_the_copy(self):
        self.write_session()
        second = self.root / "second.json"
        raw = json.loads(self.consumer.read_text())
        raw["page"]["canon"]["id"] = "checkout-two"
        second.write_text(json.dumps(raw))
        result = self.bundled_run(str(self.consumer), str(second))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"{self.consumer}: 0 errors", result.stdout)
        self.assertIn(f"{second}: 0 errors", result.stdout)

    # Row 11c.
    def test_positional_provider_replaces_the_copied_one(self):
        copied = json.loads(json.dumps(self.platform))
        diagram = copied["page"]["sections"][0]["diagram"]
        diagram["topologyExports"] = {"other": diagram["topologyExports"]["core"]}
        self.write_session(payload_text=self.payload_text(specs=[copied]))
        alone = self.bundled_run(str(self.consumer))
        self.assertEqual(alone.returncode, 1, alone.stdout + alone.stderr)
        self.assertIn("missing export core", self.error_line(alone, self.consumer))
        positional = self.root / "platform.json"
        shutil.copyfile(TOPOLOGY / "platform.json", positional)
        result = self.bundled_run(str(self.consumer), str(positional))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"{self.consumer}: 0 errors", result.stdout)

    # Row 13.
    def test_canonless_candidate_uses_the_copy_identity(self):
        consumer, providers = write_local_repository(self.root / "repo")
        candidate = self.session / "candidate.spec.json"
        shutil.copyfile(consumer, candidate)
        for consumer_id in ("consumer", "workbench-draft"):
            with self.subTest(consumerId=consumer_id):
                text = json.dumps({"sourceKind": "local", "snapshotSha256": "a" * 64,
                                   "consumerId": consumer_id, "specs": providers})
                self.write_session(payload_text=text)
                result = self.bundled_run(str(candidate))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(f"{candidate}: 0 errors", result.stdout)

    # Row 11d (guard).
    def test_resolve_imports_ignores_the_copy(self):
        self.write_session()
        registry = self.root / "registry.json"
        registry.write_text(json.dumps({"version": 1, "diagrams": [{"id": "checkout", "path": "consumer/checkout.json"}]}))
        result = self.bundled_run("--resolve-imports", str(registry), str(self.consumer))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(f"missing spec platform in {registry}", self.error_line(result, self.consumer))

    # Row 11e (guard).
    def test_repository_validator_ignores_a_copy_beside_the_candidate(self):
        self.write_session()
        result = run_cli(str(self.consumer))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        line = self.error_line(result, self.consumer)
        self.assertIn("missing spec platform", line)
        self.assertIn("--resolve-imports <repository folder or registry>", line)


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
