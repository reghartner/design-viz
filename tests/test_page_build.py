"""End-to-end tests for tools/page_build.py (validate → inject → manifest).

Uses a lint-clean cookbook recipe spec for the happy path and the doorbell
example (which carries known advisory lints) for the must-stop path.
"""
import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "page_build.py"
FENCE = re.compile(r"```json\n(.*?)\n```", re.DOTALL)
BACKLINK_BLOCK = re.compile(
    r'^<script type="application/json" id="flowbacklinks">\n(.*?)\n</script>',
    re.DOTALL | re.MULTILINE,
)


def clean_spec_text():
    md = (ROOT / "cookbook" / "temperature.md").read_text()
    return FENCE.findall(md)[0]


def run_tool(*args):
    return subprocess.run(["python3", str(TOOL), *args],
                          capture_output=True, text=True, cwd=ROOT)


@unittest.skipUnless(shutil.which("node"), "node not available")
class PageBuildTest(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.spec = self.tmp / "temp.spec.json"
        self.spec.write_text(clean_spec_text())
        self.root = self.tmp / "examples"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_no_slug_builds_beside_spec_without_copy_or_subdirectory(self):
        before = self.spec.read_bytes()
        r = run_tool(str(self.spec), "--desc", "beside")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((self.tmp / "temp.html").is_file())
        self.assertEqual(self.spec.read_bytes(), before)
        self.assertFalse((self.tmp / "temp.spec.spec.json").exists())
        self.assertFalse(self.root.exists(), "beside mode must not create examples/")
        self.assertFalse(any(path.is_dir() for path in self.tmp.iterdir()),
                         "beside mode must not create any subdirectories")
        entry = json.loads((self.tmp / "manifest.json").read_text())["pages"][0]
        self.assertEqual(entry["file"], "temp.html")
        self.assertEqual(entry["spec"], "temp.spec.json")
        self.assertEqual(entry["family"], self.tmp.name)

    def test_relative_spec_and_root_resolve_against_caller_cwd_not_repo(self):
        # The validate/inject subprocesses run with cwd=ROOT; a spec or
        # --root given relative to the caller's directory must still
        # resolve there (the documented consuming-project flow) and must
        # write nothing inside this repo.
        r = subprocess.run(
            ["python3", str(TOOL), "temp.spec.json", "--root", "out"],
            capture_output=True, text=True, cwd=self.tmp)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((self.tmp / "out" / "temp.html").is_file())
        self.assertTrue((self.tmp / "out" / "manifest.json").is_file())
        self.assertFalse((ROOT / "out").exists(),
                         "relative --root must not resolve inside the repo")
        entry = json.loads((self.tmp / "out" / "manifest.json").read_text())["pages"][0]
        self.assertEqual(entry["family"], "out")

    def test_symlinked_spec_and_root_keep_their_alias_names(self):
        # Anchoring to the caller's cwd must not dereference symlinks: the
        # alias names stay the output name and the manifest family.
        (self.tmp / "alias.spec.json").symlink_to(self.spec.name)
        real_root = self.tmp / "real-root"
        real_root.mkdir()
        (self.tmp / "linkroot").symlink_to("real-root")
        r = subprocess.run(
            ["python3", str(TOOL), "alias.spec.json", "--root", "linkroot"],
            capture_output=True, text=True, cwd=self.tmp)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((real_root / "alias.html").is_file())
        entry = json.loads((real_root / "manifest.json").read_text())["pages"][0]
        self.assertEqual(entry["file"], "alias.html")
        self.assertEqual(entry["family"], "linkroot")

    def test_no_slug_accepts_plain_json_name(self):
        plain = self.tmp / "drip-commander.json"
        plain.write_text(clean_spec_text())
        r = run_tool(str(plain))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((self.tmp / "drip-commander.html").is_file())
        pages = json.loads((self.tmp / "manifest.json").read_text())["pages"]
        entry = next(page for page in pages if page["file"] == "drip-commander.html")
        self.assertEqual(entry["spec"], "drip-commander.json")

    def test_no_slug_with_root_builds_flat_and_copies_source_name(self):
        r = run_tool(str(self.spec), "--root", str(self.root))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((self.root / "temp.html").is_file())
        self.assertEqual((self.root / "temp.spec.json").read_bytes(),
                         self.spec.read_bytes())
        self.assertFalse((self.root / self.root.name).exists())
        entry = json.loads((self.root / "manifest.json").read_text())["pages"][0]
        self.assertEqual(entry["file"], "temp.html")
        self.assertEqual(entry["spec"], "temp.spec.json")
        self.assertEqual(entry["family"], self.root.name)

    def test_bare_slug_with_root_builds_deliberately_named_flat_page(self):
        r = run_tool(str(self.spec), "thermal", "--root", str(self.root))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((self.root / "thermal.html").is_file())
        self.assertTrue((self.root / "thermal.spec.json").is_file())
        entry = json.loads((self.root / "manifest.json").read_text())["pages"][0]
        self.assertEqual(entry["file"], "thermal.html")
        self.assertEqual(entry["family"], self.root.name)

    def test_parallel_flat_builds_keep_both_locked_manifest_updates(self):
        alpha = self.tmp / "alpha.spec.json"
        beta = self.tmp / "beta.spec.json"
        alpha.write_text(clean_spec_text())
        beta.write_text(clean_spec_text())
        commands = [
            ["python3", str(TOOL), str(source), "--root", str(self.root)]
            for source in (alpha, beta)
        ]
        processes = [subprocess.Popen(command, stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, text=True, cwd=ROOT)
                     for command in commands]
        results = [process.communicate() + (process.returncode,)
                   for process in processes]
        for stdout, stderr, returncode in results:
            self.assertEqual(returncode, 0, stdout + stderr)
        pages = json.loads((self.root / "manifest.json").read_text())["pages"]
        self.assertEqual({page["file"] for page in pages},
                         {"alpha.html", "beta.html"})

    def test_happy_path_builds_page_and_manifest(self):
        r = run_tool(str(self.spec), "acme-cam/thermal", "--root", str(self.root),
                     "--desc", "thermal story", "--tags", "thermo,demo")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PAGE_BUILD OK", r.stdout)
        self.assertTrue((self.root / "acme-cam" / "thermal.html").is_file())
        self.assertTrue((self.root / "acme-cam" / "thermal.spec.json").is_file())
        man = json.loads((self.root / "manifest.json").read_text())
        entry = man["pages"][0]
        self.assertEqual(entry["file"], "acme-cam/thermal.html")
        self.assertEqual(entry["title"], "Recipe — device temperature")
        self.assertEqual(entry["description"], "thermal story")
        self.assertEqual(entry["tags"], ["thermo", "demo"])
        self.assertIn("thermo", entry["widgets"])
        self.assertIn("state", entry["widgets"])

    def test_external_root_creates_missing_dirs_and_leaves_repo_untouched(self):
        # a consuming project points --root at a folder that does not exist
        # yet; everything lands there and nothing in this repo changes
        ext = self.tmp / "consuming-project" / "docs" / "diagrams"
        self.assertFalse(ext.exists())
        repo_manifest = ROOT / "examples" / "manifest.json"
        before = repo_manifest.read_bytes()
        r = run_tool(str(self.spec), "acme-cam/thermal", "--root", str(ext))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue((ext / "acme-cam" / "thermal.html").is_file())
        self.assertTrue((ext / "acme-cam" / "thermal.spec.json").is_file())
        man = json.loads((ext / "manifest.json").read_text())
        self.assertEqual(man["pages"][0]["file"], "acme-cam/thermal.html")
        self.assertEqual(repo_manifest.read_bytes(), before,
                         "an external-root build must not touch the repo manifest")

    def test_rerun_without_flags_keeps_description_and_tags(self):
        run_tool(str(self.spec), "acme-cam/thermal", "--root", str(self.root),
                 "--desc", "kept", "--tags", "a")
        r = run_tool(str(self.spec), "acme-cam/thermal", "--root", str(self.root))
        self.assertEqual(r.returncode, 0)
        man = json.loads((self.root / "manifest.json").read_text())
        self.assertEqual(len(man["pages"]), 1, "re-run replaces, never duplicates")
        self.assertEqual(man["pages"][0]["description"], "kept")
        self.assertEqual(man["pages"][0]["tags"], ["a"])

    def test_existing_crossref_injects_other_pages_without_touching_spec(self):
        self.root.mkdir(parents=True)
        (self.root / "crossref.json").write_text(json.dumps({"services": {
            "Broker": [
                {"file": "acme-cam/thermal.html", "family": "acme-cam",
                 "title": "Recipe — device temperature"},
                {"file": "other/peer.html", "family": "other", "title": "Peer <Page>"},
            ]
        }}))
        r = run_tool(str(self.spec), "acme-cam/thermal", "--root", str(self.root))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        built = (self.root / "acme-cam" / "thermal.html").read_text()
        match = BACKLINK_BLOCK.search(built)
        self.assertIsNotNone(match)
        model = json.loads(match.group(1))
        self.assertEqual(model, {"services": {"Broker": [{
            "href": "../other/peer.html", "title": "Peer <Page>"
        }]}})
        copied = (self.root / "acme-cam" / "thermal.spec.json").read_text()
        self.assertNotIn("flowbacklinks", copied)

    def test_warnings_stop_the_build(self):
        r = run_tool(str(ROOT / "examples" / "doorbell" / "doorbell.spec.json"),
                     "doorbell/chime", "--root", str(self.root))
        self.assertEqual(r.returncode, 1)
        self.assertIn("PAGE_BUILD FAIL", r.stdout)
        self.assertIn("validator warnings", r.stdout)
        self.assertFalse((self.root / "doorbell" / "chime.html").exists(),
                         "nothing is written when validation stops the build")

    def test_warning_gate_cannot_be_spoofed_by_the_path(self):
        # a spec path containing the literal text "0 warnings" must not slip
        # a warning-bearing spec past the gate (the gate parses the summary
        # line, never substring-matches the whole output)
        trick_dir = self.tmp / "0 warnings"
        trick_dir.mkdir()
        warny = trick_dir / "spec.json"
        warny.write_text(
            (ROOT / "examples" / "doorbell" / "doorbell.spec.json").read_text())
        r = run_tool(str(warny), "doorbell/chime", "--root", str(self.root))
        self.assertEqual(r.returncode, 1)
        self.assertIn("validator warnings", r.stdout)

    def test_bad_dest_and_missing_spec_stop(self):
        r = run_tool(str(self.spec), "Not_Kebab/x", "--root", str(self.root))
        self.assertEqual(r.returncode, 1)
        self.assertIn("kebab-case", r.stdout)
        r2 = run_tool(str(self.tmp / "nope.json"), "a/b", "--root", str(self.root))
        self.assertEqual(r2.returncode, 1)
        self.assertIn("spec not found", r2.stdout)

    def test_bare_slug_path_traversal_is_refused_without_writes(self):
        r = run_tool(str(self.spec), "../escape", "--root", str(self.root))
        self.assertEqual(r.returncode, 1)
        self.assertIn("refusing path traversal", r.stdout)
        self.assertFalse(self.root.exists())

    def test_beside_mode_refuses_page_owned_by_different_nested_spec(self):
        library = self.tmp / "library"
        family = library / "family"
        family.mkdir(parents=True)
        source = family / "page.json"
        source.write_text(clean_spec_text())
        nested_spec = family / "page.spec.json"
        nested_spec.write_text(clean_spec_text().replace(
            "Recipe — device temperature", "Different nested page", 1))
        existing = family / "page.html"
        existing.write_text("do not overwrite")
        (library / "manifest.json").write_text(json.dumps({"pages": [{
            "file": "family/page.html",
            "spec": "family/page.spec.json",
            "title": "Different nested page",
            "family": "family",
            "widgets": [],
        }]}))

        r = run_tool(str(source))
        self.assertEqual(r.returncode, 1)
        self.assertEqual(len(r.stdout.strip().splitlines()), 1, r.stdout)
        self.assertIn("belongs to a different spec via the parent manifest", r.stdout)
        self.assertEqual(existing.read_text(), "do not overwrite")
        self.assertFalse((family / "manifest.json").exists())

        # ownership blocks even while the owner's HTML is deleted/unbuilt —
        # the parent manifest still claims the name
        existing.unlink()
        r = run_tool(str(source))
        self.assertEqual(r.returncode, 1)
        self.assertIn("belongs to a different spec via the parent manifest", r.stdout)
        self.assertFalse(existing.exists(), "no page is created under a claimed name")

        # with no parent manifest, the adjacent nested-convention spec alone
        # still claims the name, HTML present or not
        (library / "manifest.json").unlink()
        r = run_tool(str(source))
        self.assertEqual(r.returncode, 1)
        self.assertIn("adjacent nested-convention spec", r.stdout)
        self.assertFalse(existing.exists())

    def test_diff_prev_uses_beside_snapshot_and_never_copies_source(self):
        model = json.loads(self.spec.read_text())
        model["page"]["blocks"][0]["contract"] = {
            "title": "Temperature sample",
            "fields": [{"k": "temp", "v": "48", "g": "degrees C"}],
        }
        self.spec.write_text(json.dumps(model))
        first = run_tool(str(self.spec))
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        snapshot = self.tmp / ".temp.page-build-prev.json"
        self.assertTrue(snapshot.is_file())

        model["page"]["blocks"][0]["contract"]["fields"][0]["v"] = "75"
        self.spec.write_text(json.dumps(model))
        second = run_tool(str(self.spec), "--diff-prev")
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertIn("SPEC_DIFF:", second.stdout)
        self.assertIn("changed field temp", second.stdout)
        self.assertFalse((self.tmp / "temp.spec.spec.json").exists())
        snap_model = json.loads(snapshot.read_text())
        self.assertEqual(
            snap_model["page"]["blocks"][0]["contract"]["fields"][0]["v"],
            "75",
        )

    def test_failed_build_leaves_previous_success_snapshot_unchanged(self):
        first = run_tool(str(self.spec))
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        snapshot = self.tmp / ".temp.page-build-prev.json"
        before = snapshot.read_text()

        good = self.spec.read_text()
        self.spec.write_text("{not valid json")
        failed = run_tool(str(self.spec), "--diff-prev")
        self.assertEqual(failed.returncode, 1)
        self.assertEqual(snapshot.read_text(), before,
                         "a failed build must not advance the snapshot")
        self.spec.write_text(good)

    def test_diff_prev_uses_prior_flat_root_spec_copy(self):
        model = json.loads(self.spec.read_text())
        model["page"]["blocks"][0]["contract"] = {
            "title": "Temperature sample",
            "fields": [{"k": "temp", "v": "48", "g": "degrees C"}],
        }
        self.spec.write_text(json.dumps(model))
        first = run_tool(str(self.spec), "--root", str(self.root))
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)

        model["page"]["blocks"][0]["contract"]["fields"][0]["v"] = "75"
        self.spec.write_text(json.dumps(model))
        second = run_tool(str(self.spec), "--root", str(self.root), "--diff-prev")
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertIn("changed field temp", second.stdout)
        copied = json.loads((self.root / "temp.spec.json").read_text())
        self.assertEqual(
            copied["page"]["blocks"][0]["contract"]["fields"][0]["v"],
            "75",
        )


if __name__ == "__main__":
    unittest.main()
