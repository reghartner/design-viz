"""Cookbook drift gate.

Every ```json fence in cookbook/*.md must be a COMPLETE spec that the real
validator CLI (tools/validate.js) accepts with 0 errors AND 0 warnings, so a
recipe can never drift from the engine or teach a linted pattern. Partial
fragments in recipes use plain fences and are not collected here.
"""
import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLI = ROOT / "tools" / "validate.js"
COOKBOOK = ROOT / "cookbook"

FENCE = re.compile(r"```json\n(.*?)\n```", re.DOTALL)


def json_fences():
    """Yield (markdown file, fence index, fence text) for every ```json fence."""
    for md in sorted(COOKBOOK.glob("*.md")):
        for i, m in enumerate(FENCE.findall(md.read_text())):
            yield md, i, m


class CookbookShapeTest(unittest.TestCase):
    """Node-independent checks — must run even where node is unavailable."""

    def test_cookbook_exists_and_has_recipes(self):
        self.assertTrue(COOKBOOK.is_dir(), "cookbook/ directory missing")
        fences = list(json_fences())
        self.assertGreaterEqual(
            len(fences), 6, "expected at least 6 complete recipe specs")

    def test_every_json_fence_parses(self):
        for md, i, text in json_fences():
            with self.subTest(file=md.name, fence=i):
                spec = json.loads(text)
                self.assertIn("page", spec,
                              f"{md.name} fence {i}: recipe specs are full pages")


@unittest.skipUnless(shutil.which("node"), "node not available")
class CookbookValidatorTest(unittest.TestCase):
    """Drives the real validator CLI — needs node."""

    def test_every_json_fence_validates_clean(self):
        for md, i, text in json_fences():
            with self.subTest(file=md.name, fence=i):
                with tempfile.NamedTemporaryFile(
                        "w", suffix=".json", delete=False) as f:
                    f.write(text)
                    tmp = f.name
                try:
                    r = subprocess.run(
                        ["node", str(CLI), tmp],
                        capture_output=True, text=True, cwd=ROOT)
                    out = r.stdout + r.stderr
                    self.assertEqual(
                        r.returncode, 0,
                        f"{md.name} fence {i}: validator errors:\n{out}")
                    self.assertIn(
                        "0 errors, 0 warnings", out,
                        f"{md.name} fence {i}: recipe must be lint-clean:\n{out}")
                finally:
                    pathlib.Path(tmp).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
