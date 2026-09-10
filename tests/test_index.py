"""Index/manifest integrity gate.

Every manifest entry must point at real files; every example page on disk
must be in the manifest (so the index is complete); the index regenerates
byte-identically from the manifest (so the committed index cannot drift).
"""
import json
import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples"


class IndexTest(unittest.TestCase):
    def load(self):
        return json.loads((EXAMPLES / "manifest.json").read_text())

    def test_manifest_entries_point_at_real_files(self):
        for p in self.load()["pages"]:
            with self.subTest(file=p["file"]):
                self.assertTrue((EXAMPLES / p["file"]).is_file(), p["file"])
                self.assertTrue((EXAMPLES / p["spec"]).is_file(), p["spec"])
                self.assertTrue(p.get("title"), "title required")
                self.assertIsInstance(p.get("widgets"), list)

    def test_every_example_page_is_in_the_manifest(self):
        listed = {p["file"] for p in self.load()["pages"]}
        on_disk = {str(f.relative_to(EXAMPLES))
                   for f in EXAMPLES.glob("*/*.html")}
        self.assertEqual(on_disk - listed, set(),
                         "pages on disk missing from examples/manifest.json")
        self.assertEqual(listed - on_disk, set(),
                         "manifest entries with no page on disk")

    def test_unsafe_manifest_paths_are_refused(self):
        import shutil, tempfile
        tmp = pathlib.Path(tempfile.mkdtemp())
        try:
            # scratch copy of the tool pointed at a hostile manifest
            scratch = tmp / "examples"
            scratch.mkdir()
            (scratch / "manifest.json").write_text(json.dumps({"pages": [
                {"file": "javascript:alert(1)/x.html", "spec": "x",
                 "title": "x", "family": "x", "widgets": []}]}))
            r = subprocess.run(["python3", str(ROOT / "tools" / "build_index.py"),
                                "--root", str(scratch)],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            self.assertIn("refusing unsafe manifest path", r.stdout)
            self.assertFalse((scratch / "index.html").exists(),
                             "no index is written from a hostile manifest")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_external_root_gets_its_own_index(self):
        import shutil, tempfile
        tmp = pathlib.Path(tempfile.mkdtemp())
        try:
            ext = tmp / "consuming-project" / "diagrams"
            ext.mkdir(parents=True)
            (ext / "fam-a").mkdir()
            (ext / "fam-a" / "page.spec.json").write_text(json.dumps({"page": {
                "blocks": [{"heading": "Flow", "diagram": {
                    "nodes": {"service": {"title": "Service"}},
                    "rows": [["service"]], "edges": []
                }}]
            }}))
            (ext / "manifest.json").write_text(json.dumps({"pages": [
                {"file": "fam-a/page.html", "spec": "fam-a/page.spec.json",
                 "title": "Page", "family": "fam-a", "description": "",
                 "tags": [], "widgets": ["state"]}]}))
            repo_index_before = (EXAMPLES / "index.html").read_bytes()
            r = subprocess.run(["python3", str(ROOT / "tools" / "build_index.py"),
                                "--root", str(ext), "--title", "Consuming Project"],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            out = (ext / "index.html").read_text()
            self.assertIn("Consuming Project", out)
            self.assertIn("fam-a/page.html", out)
            crossref = json.loads((ext / "crossref.json").read_text())
            self.assertEqual(crossref["services"]["Service"][0]["file"],
                             "fam-a/page.html")
            self.assertEqual((EXAMPLES / "index.html").read_bytes(),
                             repo_index_before,
                             "an external-root build must not touch the repo index")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_flat_external_root_gets_index_catalog_and_same_dir_backlinks(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td) / "consuming-project" / "diagrams"
            root.mkdir(parents=True)
            specs = {}
            pages = []
            for slug, title in (("alpha", "Alpha page"), ("beta", "Beta page")):
                spec = {"page": {"title": title, "blocks": [{
                    "heading": "Flow",
                    "diagram": {
                        "nodes": {"service": {"title": "Shared service"}},
                        "rows": [["service"]],
                        "edges": [],
                    },
                }]}}
                specs[slug] = spec
                (root / f"{slug}.spec.json").write_text(json.dumps(spec))
                (root / f"{slug}.html").write_text(title)
                pages.append({
                    "file": f"{slug}.html",
                    "spec": f"{slug}.spec.json",
                    "title": title,
                    "family": root.name,
                    "description": "",
                    "tags": [],
                    "widgets": [],
                })
            (root / "manifest.json").write_text(json.dumps({"pages": pages}))
            repo_index_before = (EXAMPLES / "index.html").read_bytes()

            r = subprocess.run(
                ["python3", str(ROOT / "tools" / "build_index.py"),
                 "--root", str(root), "--title", "Flat project"],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            rendered = (root / "index.html").read_text()
            self.assertIn('href="alpha.html"', rendered)
            self.assertIn('href="beta.html"', rendered)
            model = json.loads((root / "crossref.json").read_text())
            self.assertEqual(
                [entry["file"] for entry in model["services"]["Shared service"]],
                ["alpha.html", "beta.html"],
            )

            sys.path.insert(0, str(ROOT / "tools"))
            try:
                from crossrefs import page_backlinks
                links = page_backlinks(root, specs["alpha"], "alpha.html")
            finally:
                sys.path.pop(0)
            self.assertEqual(links, {"services": {"Shared service": [{
                "href": "beta.html", "title": "Beta page",
            }]}})
            self.assertEqual((EXAMPLES / "index.html").read_bytes(),
                             repo_index_before)

    def test_mixed_flat_and_nested_backlink_paths_stay_inside_root(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            (root / "family").mkdir()
            flat_spec = {"page": {"blocks": [{"diagram": {
                "nodes": {"service": {"title": "Shared service"}},
                "rows": [["service"]], "edges": [],
            }}]}}
            nested_spec = json.loads(json.dumps(flat_spec))
            (root / "flat.spec.json").write_text(json.dumps(flat_spec))
            (root / "family" / "nested.spec.json").write_text(json.dumps(nested_spec))
            pages = [
                {"file": "flat.html", "spec": "flat.spec.json",
                 "title": "Flat", "family": "mixed", "widgets": []},
                {"file": "family/nested.html", "spec": "family/nested.spec.json",
                 "title": "Nested", "family": "family", "widgets": []},
            ]
            (root / "manifest.json").write_text(json.dumps({"pages": pages}))
            r = subprocess.run(
                ["python3", str(ROOT / "tools" / "build_index.py"),
                 "--root", str(root)],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

            sys.path.insert(0, str(ROOT / "tools"))
            try:
                from crossrefs import page_backlinks
                from_flat = page_backlinks(root, flat_spec, "flat.html")
                from_nested = page_backlinks(
                    root, nested_spec, "family/nested.html")
            finally:
                sys.path.pop(0)
            self.assertEqual(
                from_flat["services"]["Shared service"][0]["href"],
                "family/nested.html",
            )
            self.assertEqual(
                from_nested["services"]["Shared service"][0]["href"],
                "../flat.html",
            )

    def test_index_regenerates_byte_identically(self):
        index = EXAMPLES / "index.html"
        crossref = EXAMPLES / "crossref.json"
        self.assertTrue(index.is_file(), "run tools/build_index.py")
        self.assertTrue(crossref.is_file(), "run tools/build_index.py")
        before = index.read_bytes()
        crossref_before = crossref.read_bytes()
        r = subprocess.run(["python3", str(ROOT / "tools" / "build_index.py")],
                           capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(index.read_bytes(), before,
                         "committed index drifts from the manifest — "
                         "rerun tools/build_index.py and commit")
        self.assertEqual(crossref.read_bytes(), crossref_before,
                         "committed crossref drifts from the manifest/specs — "
                         "rerun tools/build_index.py and commit")

    def test_crossref_derivation_is_exact_deduplicated_and_html_safe(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            for family in ("alpha", "beta"):
                (root / family).mkdir()
            specs = {
                "alpha/a.spec.json": {"page": {"blocks": [{"diagram": {
                    "nodes": {
                        "r1": {"title": "Relay <shared>"},
                        "r2": {"title": "Relay <shared>"},
                        "lower": {"title": "relay <shared>"},
                    }, "rows": [["r1", "r2", "lower"]], "edges": []
                }}]}},
                "beta/b.spec.json": {"page": {"blocks": [{"diagram": {
                    "nodes": {"r": {"title": "Relay <shared>"}},
                    "rows": [["r"]], "edges": []
                }}]}},
            }
            for rel, spec in specs.items():
                (root / rel).write_text(json.dumps(spec))
            (root / "manifest.json").write_text(json.dumps({"pages": [
                {"file": "alpha/a.html", "spec": "alpha/a.spec.json",
                 "title": "Alpha <Page>", "family": "alpha", "widgets": []},
                {"file": "beta/b.html", "spec": "beta/b.spec.json",
                 "title": "Beta & Page", "family": "beta", "widgets": []},
            ]}))
            r = subprocess.run(["python3", str(ROOT / "tools" / "build_index.py"),
                                "--root", str(root)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            model = json.loads((root / "crossref.json").read_text())
            self.assertEqual([p["file"] for p in model["services"]["Relay <shared>"]],
                             ["alpha/a.html", "beta/b.html"])
            self.assertEqual(len(model["services"]["relay <shared>"]), 1,
                             "title identity is case-sensitive")
            rendered = (root / "index.html").read_text()
            self.assertIn("<h2>Shared services</h2>", rendered)
            self.assertIn("Relay &lt;shared&gt;", rendered)
            self.assertIn("Alpha &lt;Page&gt;", rendered)
            self.assertIn("Beta &amp; Page", rendered)
            self.assertNotIn("Relay <shared>", rendered)

    def test_all_dev_titles_are_family_scoped_but_service_titles_are_global(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            page_defs = [
                ("alpha/a", "alpha", {
                    "device": {"title": "Device Chip", "tint": "dev"},
                    "grouped": {"title": "Grouped Chip", "tint": "dev", "group": "suite"},
                    "api": {"title": "Shared API", "tint": "cmd"},
                    "plain": {"title": "Untinted Service"},
                }),
                ("alpha/b", "alpha", {
                    "device": {"title": "Device Chip", "tint": "dev"},
                    "api": {"title": "Shared API", "tint": "dev"},
                }),
                ("beta/b", "beta", {
                    "device": {"title": "Device Chip", "tint": "dev"},
                    "grouped": {"title": "Grouped Chip", "tint": "dev", "group": "suite"},
                    "api": {"title": "Shared API", "tint": "dev"},
                    "plain": {"title": "Untinted Service"},
                }),
                ("gamma/c", "gamma", {
                    "device": {"title": "Device Chip", "tint": "dev"},
                }),
            ]
            pages = []
            specs = {}
            for stem, family, nodes in page_defs:
                folder, slug = stem.split("/")
                (root / folder).mkdir(exist_ok=True)
                spec_rel = f"{stem}.spec.json"
                spec = {"page": {"blocks": [{"diagram": {
                    "nodes": nodes, "rows": [list(nodes)], "edges": []
                }}]}}
                (root / spec_rel).write_text(json.dumps(spec))
                pages.append({"file": f"{stem}.html", "spec": spec_rel,
                              "title": stem, "family": family, "widgets": []})
                specs[stem] = spec
            (root / "manifest.json").write_text(json.dumps({"pages": pages}))

            r = subprocess.run(["python3", str(ROOT / "tools" / "build_index.py"),
                                "--root", str(root)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            model = json.loads((root / "crossref.json").read_text())

            # Same manifest family survives; unrelated beta/gamma coincidences do not.
            self.assertEqual([p["file"] for p in model["services"]["Device Chip"]],
                             ["alpha/a.html", "alpha/b.html"])
            self.assertTrue(all(p["scope"] == "family"
                                for p in model["services"]["Device Chip"]))
            # An explicit product group can connect separately indexed page families.
            self.assertEqual([p["file"] for p in model["services"]["Grouped Chip"]],
                             ["alpha/a.html", "beta/b.html"])
            # One service tint, and an absent tint, each make the title global.
            self.assertEqual(len(model["services"]["Shared API"]), 3)
            self.assertEqual(len(model["services"]["Untinted Service"]), 2)

            sys.path.insert(0, str(ROOT / "tools"))
            try:
                from crossrefs import page_backlinks
                links = page_backlinks(root, specs["alpha/a"], "alpha/a.html")
            finally:
                sys.path.pop(0)
            self.assertEqual(
                [link["href"] for link in links["services"]["Device Chip"]],
                ["b.html"],
            )
            self.assertEqual(
                [link["href"] for link in links["services"]["Grouped Chip"]],
                ["../beta/b.html"],
            )
            self.assertEqual(
                [link["href"] for link in links["services"]["Shared API"]],
                ["b.html", "../beta/b.html"],
            )

    def test_unsafe_manifest_spec_paths_are_refused(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            (root / "manifest.json").write_text(json.dumps({"pages": [{
                "file": "safe/page.html", "spec": "../escape.json",
                "title": "Page", "family": "safe", "widgets": []
            }]}))
            r = subprocess.run(["python3", str(ROOT / "tools" / "build_index.py"),
                                "--root", str(root)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            self.assertIn("refusing unsafe manifest spec path", r.stdout)
            self.assertFalse((root / "index.html").exists())
            self.assertFalse((root / "crossref.json").exists())

    def test_repo_catalog_contains_real_shared_services(self):
        model = json.loads((EXAMPLES / "crossref.json").read_text())
        self.assertGreaterEqual(len(model["services"]["Relay"]), 2)
        self.assertGreaterEqual(len(model["services"]["Herald Push"]), 3)
        self.assertEqual(len(model["services"]["Sentry LP"]), 3)
        self.assertEqual(len(model["services"]["Sentry Panel"]), 2)
        self.assertNotIn("Owner phone", model["services"])
        self.assertNotIn("Resident Phone", model["services"],
                         "dev-tinted generic device titles never match "
                         "across families")
        self.assertIn("Shared services", (EXAMPLES / "index.html").read_text())


if __name__ == "__main__":
    unittest.main()
