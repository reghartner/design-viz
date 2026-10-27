"""Unit tests for tools/inject.py. Run: python3 -m unittest discover -s tests"""
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
INJECT = ROOT / "tools" / "inject.py"


def load_inject():
    """Import tools/inject.py as a module (it imports its sibling crossrefs)."""
    sys.path.insert(0, str(ROOT / "tools"))
    try:
        spec = importlib.util.spec_from_file_location("dv_inject", INJECT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)

BLOCK_OPEN = '<script type="application/json" id="flowspec">'
BACKLINK_OPEN = '<script type="application/json" id="flowbacklinks">'
GUIDE_BLOCK = re.compile(r'^<script type="text/markdown" id="dv-agent-guide">\n(.*?)\n</script>', re.S | re.M)
FLOWSPEC_BLOCK = re.compile(r'^<script type="application/json" id="flowspec">\n(.*?)\n</script>', re.S | re.M)

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


TIMELINE_BLOCK = re.compile(
    r'^<script type="application/json" id="live-timeline">\n(.*?)\n</script>', re.S | re.M)
EXAMPLE_SPEC = ROOT / "examples/live-status/live-status.spec.json"
EXAMPLE_TIMELINE = ROOT / "examples/live-status/live-status.timeline.json"


def run_inject(template_text, spec_text, extra_args=(), extra_files=None):
    with tempfile.TemporaryDirectory() as td:
        td = pathlib.Path(td)
        (td / "t.html").write_text(template_text)
        (td / "s.json").write_text(spec_text)
        for name, text in (extra_files or {}).items():
            (td / name).write_text(text)
        out = td / "o.html"
        args = [str(a).replace("{td}", str(td)) for a in extra_args]
        r = subprocess.run([sys.executable, str(INJECT), str(td / "s.json"),
                            str(td / "t.html"), str(out)] + args,
                           capture_output=True, text=True)
        return r, out.read_text() if out.exists() else None


def tracked_spec():
    spec = json.loads(json.dumps(SPEC))
    spec["page"]["tracking"] = {"jira": {"site": "https://jira.test"}}
    return spec


def custom_timeline():
    return {"version": 1, "intervalSeconds": 3, "days": [
        {"label": "Day 1", "note": "start", "issues": {"ACME-1": {"state": "todo"}}},
        {"label": "Day 2", "note": "end", "issues": {"ACME-1": {"state": "done"}}},
    ]}


class InjectTests(unittest.TestCase):
    def test_non_example_spec_embeds_no_timeline_by_default(self):
        # #753: only the example spec ships the doorbell timeline by default; any other
        # board gets no block, so the page synthesizes days from its own keys.
        template = TEMPLATE + "<!-- LIVE_TIMELINE -->\n"
        for tracked in (False, True):
            spec = tracked_spec() if tracked else json.loads(json.dumps(SPEC))
            result, out = run_inject(template, json.dumps(spec))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("<!-- LIVE_TIMELINE -->", out)
            self.assertEqual(TIMELINE_BLOCK.findall(out), [])
            authored = re.search(r'^<script type="application/json" id="flowspec">\n(.*?)\n</script>', out, re.S | re.M)
            self.assertEqual(json.loads(authored[1]), spec)

    def test_example_spec_embeds_example_timeline_by_default(self):
        with tempfile.TemporaryDirectory() as td:
            td = pathlib.Path(td)
            (td / "t.html").write_text(TEMPLATE + "<!-- LIVE_TIMELINE -->\n")
            out = td / "o.html"
            r = subprocess.run([sys.executable, str(INJECT), str(EXAMPLE_SPEC),
                                str(td / "t.html"), str(out)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            matches = TIMELINE_BLOCK.findall(out.read_text())
            self.assertEqual(len(matches), 1)
            self.assertEqual(json.loads(matches[0]), json.loads(EXAMPLE_TIMELINE.read_text()))

    def test_timeline_none_embeds_nothing_even_for_example_spec(self):
        with tempfile.TemporaryDirectory() as td:
            td = pathlib.Path(td)
            (td / "t.html").write_text(TEMPLATE + "<!-- LIVE_TIMELINE -->\n")
            out = td / "o.html"
            r = subprocess.run([sys.executable, str(INJECT), str(EXAMPLE_SPEC),
                                str(td / "t.html"), str(out), "--timeline", "none"],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            text = out.read_text()
            self.assertNotIn("<!-- LIVE_TIMELINE -->", text)
            self.assertEqual(TIMELINE_BLOCK.findall(text), [])

    def test_timeline_path_embeds_that_file_outside_the_spec(self):
        template = TEMPLATE + "<!-- LIVE_TIMELINE -->\n"
        spec = tracked_spec()
        timeline = custom_timeline()
        timeline["days"][0]["note"] = "a </script> tag and <b>markup</b>"
        r, out = run_inject(template, json.dumps(spec), ["--timeline", "{td}/tl.json"],
                            {"tl.json": json.dumps(timeline)})
        self.assertEqual(r.returncode, 0, r.stderr)
        matches = TIMELINE_BLOCK.findall(out)
        self.assertEqual(len(matches), 1)
        self.assertNotIn("</script>", matches[0])
        self.assertEqual(json.loads(matches[0]), timeline)
        authored = re.search(r'^<script type="application/json" id="flowspec">\n(.*?)\n</script>', out, re.S | re.M)
        self.assertEqual(json.loads(authored[1]), spec)

    def test_timeline_path_without_marker_or_tracking_embeds_nothing(self):
        spec = json.loads(json.dumps(SPEC))
        # no tracking: live status never runs, so a requested timeline is not embedded
        r, out = run_inject(TEMPLATE + "<!-- LIVE_TIMELINE -->\n", json.dumps(spec),
                            ["--timeline", "{td}/tl.json"], {"tl.json": json.dumps(custom_timeline())})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(TIMELINE_BLOCK.findall(out), [])
        self.assertIn("no tracking", r.stderr)
        # template without the marker: nothing to fill, output still written
        r, out = run_inject(TEMPLATE, json.dumps(tracked_spec()),
                            ["--timeline", "{td}/tl.json"], {"tl.json": json.dumps(custom_timeline())})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(TIMELINE_BLOCK.findall(out), [])

    def test_timeline_file_shape_is_validated(self):
        template = TEMPLATE + "<!-- LIVE_TIMELINE -->\n"
        spec = json.dumps(tracked_spec())
        good = custom_timeline()
        bad_cases = {
            "missing version": {k: v for k, v in good.items() if k != "version"},
            "intervalSeconds": {**good, "intervalSeconds": "fast"},
            "days": {**good, "days": []},
            "days[1].issues": {**good, "days": [good["days"][0], {"label": "Day 2", "note": ""}]},
            "days[0].issues": {**good, "days": [{**good["days"][0], "issues": ["ACME-1"]}]},
            "not an object": [good],
        }
        for label, timeline in bad_cases.items():
            r, out = run_inject(template, spec, ["--timeline", "{td}/tl.json"],
                                {"tl.json": json.dumps(timeline)})
            self.assertNotEqual(r.returncode, 0, label)
            self.assertIn("tl.json", r.stderr, label)
            self.assertIsNone(out, label)
        r, out = run_inject(template, spec, ["--timeline", "{td}/tl.json"], {"tl.json": "{nope"})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("not valid JSON", r.stderr)
        r, out = run_inject(template, spec, ["--timeline", "{td}/absent.json"])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("absent.json", r.stderr)

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

    # #758: the built page carries a guide an editor's agent can read and act on.
    def test_agent_guide_block_is_embedded_once_as_data_with_version_and_declaration(self):
        spec = json.loads(json.dumps(SPEC))
        spec["page"]["flowview"] = {"authoredWith": "0.2.0", "minVersion": "0.2.0", "features": ["flow.live-status"]}
        spec["page"]["tracking"] = {"jira": {"site": "https://acme.atlassian.net", "epic": "DOOR-100"}, "staleDays": 5}
        r, out = run_inject(TEMPLATE, json.dumps(spec))
        self.assertEqual(r.returncode, 0, r.stderr)
        guides = GUIDE_BLOCK.findall(out)
        self.assertEqual(len(guides), 1)
        guide = guides[0]
        self.assertLess(len(guide.encode("utf-8")), 6 * 1024)
        self.assertNotIn("</script", guide)
        # readers locate the authored spec by any script tag with id="flowspec" (tools/export_gif.py):
        # the guide names the block without reproducing it, so the page still has exactly one
        self.assertNotIn("<script", guide)
        self.assertNotIn('id="flowspec"', guide)
        tag = re.compile(r"<script\b(?=[^>]*\bid=[\"']flowspec[\"'])")
        self.assertEqual(len(tag.findall(out)), len(tag.findall(TEMPLATE)), "the guide adds no flowspec tag")
        # the authored block is untouched and precedes the guide
        self.assertEqual(json.loads(FLOWSPEC_BLOCK.search(out)[1]), spec)
        self.assertLess(FLOWSPEC_BLOCK.search(out).start(), GUIDE_BLOCK.search(out).start())
        # version from page.flowview.authoredWith, named as such
        self.assertIn("page.flowview.authoredWith", guide)
        self.assertNotIn("release", guide)
        self.assertNotIn("tag", guide.replace("close tag", ""))
        # docs at the page's version: the commit this checkout is at (the subprocess ran from it)
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        self.assertRegex(sha, r"^[0-9a-f]{40}$")
        self.assertIn(f"from commit {sha[:12]}", guide)
        for doc in ("docs/live-status.md", "contract/authoring-contract.md"):
            self.assertIn(f"https://github.com/reghartner/design-viz/blob/{sha}/{doc}", guide)
        self.assertNotIn("blob/main/", guide)
        # the capability declaration is data: one fenced JSON block that parses
        fences = re.findall(r"```json\n(.*?)\n```", guide, re.S)
        self.assertEqual(len(fences), 1)
        declaration = json.loads(fences[0])
        self.assertEqual(declaration["comments"], {"composer_only": True, "customAnchors": True})
        servers = declaration["mcp"]["servers"]
        self.assertEqual(len(servers), 1)
        self.assertEqual(servers[0]["tools"], ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"])
        self.assertIn("display name", guide)
        # the edit loop, the tracking rules, the pointers and the post-publish checks
        for needle in ("`flowspec`", "same URL", "node tools/validate.js",
                       "^[A-Z][A-Z0-9_]+-[0-9]+$", "prs", "tracking.jira.site", "staleDays",
                       "tracking.jira.epic", "tracking.github", "never stores",
                       "built with Flowview 0.2.0", "Live", "Tickets", "screenshot",
                       "https://acme.atlassian.net", "DOOR-100"):
            self.assertIn(needle, guide, needle)

    def test_agent_guide_links_docs_at_the_stamped_commit_or_falls_back_to_main_with_a_note(self):
        inject = load_inject()
        sha = "0123456789abcdef0123456789abcdef01234567"
        pinned = inject.agent_guide(SPEC, sha)
        self.assertIn(f"from commit {sha[:12]}", pinned)
        self.assertIn(f"https://github.com/reghartner/design-viz/blob/{sha}/docs/live-status.md", pinned)
        self.assertIn(f"https://github.com/reghartner/design-viz/blob/{sha}/contract/authoring-contract.md", pinned)
        self.assertNotIn("blob/main/", pinned)
        self.assertNotIn("already used in this page's spec", pinned)
        fallback = inject.agent_guide(SPEC, None)
        self.assertNotIn("from commit", fallback)
        self.assertIn("https://github.com/reghartner/design-viz/blob/main/docs/live-status.md", fallback)
        self.assertIn("https://github.com/reghartner/design-viz/blob/main/contract/authoring-contract.md", fallback)
        self.assertIn("source commit of this page is unknown", fallback)
        self.assertIn("keep to the fields already used in this page's spec", fallback)
        # the lookup itself: a good answer is a full sha; git missing or not a checkout gives None
        good = subprocess.CompletedProcess(["git"], 0, stdout=sha + "\n", stderr="")
        with mock.patch.object(inject.subprocess, "run", return_value=good) as run:
            self.assertEqual(inject.source_commit(), sha)
        self.assertEqual(run.call_args.kwargs["cwd"], inject.REPO_ROOT)
        self.assertEqual(run.call_args.args[0][:2], ["git", "rev-parse"])
        bad = subprocess.CompletedProcess(["git"], 128, stdout="", stderr="fatal: not a git repository")
        with mock.patch.object(inject.subprocess, "run", return_value=bad):
            self.assertIsNone(inject.source_commit())
        with mock.patch.object(inject.subprocess, "run", side_effect=FileNotFoundError("git")):
            self.assertIsNone(inject.source_commit())
        with mock.patch.object(inject.subprocess, "run", side_effect=subprocess.TimeoutExpired("git", 10)):
            self.assertIsNone(inject.source_commit())

    def test_agent_guide_without_tracking_declares_comments_only(self):
        r, out = run_inject(TEMPLATE, json.dumps(SPEC))
        self.assertEqual(r.returncode, 0, r.stderr)
        guide = GUIDE_BLOCK.search(out)[1]
        self.assertIn("not stamped", guide)
        declaration = json.loads(re.search(r"```json\n(.*?)\n```", guide, re.S)[1])
        self.assertEqual(declaration, {"comments": {"composer_only": True, "customAnchors": True}})
        self.assertNotIn("searchJiraIssuesUsingJql", guide)
        self.assertEqual(json.loads(FLOWSPEC_BLOCK.search(out)[1]), SPEC)

    def test_agent_guide_replaces_a_stale_guide_when_reinjecting_a_built_page(self):
        built = TEMPLATE.replace("</script>\n" + BACKLINK_OPEN,
                                 '</script>\n<script type="text/markdown" id="dv-agent-guide">\nold guide\n</script>\n' + BACKLINK_OPEN, 1)
        self.assertEqual(len(GUIDE_BLOCK.findall(built)), 1)
        r, out = run_inject(built, json.dumps(SPEC))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(GUIDE_BLOCK.findall(out)), 1)
        self.assertNotIn("old guide", out)
        self.assertIn(BACKLINK_OPEN + '\n{"services": {}}\n</script>', out)

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
