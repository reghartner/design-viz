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
# #826: a page published in two-file mode carries this marker so boot fetches flowspec.json.
SPEC_FILE_MARKER = '<meta name="dv-spec-file" content="flowspec.json">'
EXAMPLE_SPEC = ROOT / "examples/live-status/live-status.spec.json"
EXAMPLE_TIMELINE = ROOT / "examples/live-status/live-status.timeline.json"


def run_inject(template_text, spec_text, extra_args=(), extra_files=None, sidecars=()):
    """Inject into a temp dir; `sidecars` names extra outputs to read back (None when absent)."""
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
        html = out.read_text() if out.exists() else None
        if not sidecars:
            return r, html
        extra = {name: (td / name).read_text() if (td / name).exists() else None for name in sidecars}
        return r, html, extra


def tracked_spec():
    spec = json.loads(json.dumps(SPEC))
    spec["page"]["tracking"] = {"jira": {"site": "https://jira.test"}}
    return spec


def custom_timeline():
    return {"version": 1, "intervalSeconds": 3, "days": [
        {"label": "Day 1", "note": "start", "issues": {"ACME-1": {"state": "todo"}}},
        {"label": "Day 2", "note": "end", "issues": {"ACME-1": {"state": "done"}}},
    ]}


def telemetry_block():
    """#944: one day's telemetry, hourly values per carrier signal (null = no sample) and annotations."""
    return {"start": "2026-10-20T00:00:00Z", "stepSeconds": 3600,
            "carriers": {"a->b": {"rate": {"unit": "req/h", "values": [None, 0, 12.5]},
                                  "errors": {"unit": "req/h", "values": [None, 0, 0.1]}},
                         "b": {"lag": {"unit": "msgs", "values": [None, 3, 4]}}},
            "annotations": [{"id": 1, "time": "2026-10-20T01:30:00Z", "text": "deploy 1.0", "tags": ["deploy"]}]}


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

    def test_timeline_telemetry_block_is_accepted_and_embedded_unchanged(self):
        # #944: days[].telemetry (hourly carrier signals and annotations) rides the live-timeline block.
        template = TEMPLATE + "<!-- LIVE_TIMELINE -->\n"
        timeline = custom_timeline()
        timeline["days"][0]["telemetry"] = telemetry_block()
        minimal = telemetry_block()
        del minimal["annotations"]
        timeline["days"][1]["telemetry"] = minimal
        r, out = run_inject(template, json.dumps(tracked_spec()), ["--timeline", "{td}/tl.json"],
                            {"tl.json": json.dumps(timeline)})
        self.assertEqual(r.returncode, 0, r.stderr)
        matches = TIMELINE_BLOCK.findall(out)
        self.assertEqual(len(matches), 1)
        self.assertEqual(json.loads(matches[0]), timeline)

    def test_timeline_telemetry_shape_is_validated(self):
        template = TEMPLATE + "<!-- LIVE_TIMELINE -->\n"
        spec = json.dumps(tracked_spec())

        def with_block(change):
            block = telemetry_block()
            change(block)
            timeline = custom_timeline()
            timeline["days"][1]["telemetry"] = block
            return timeline

        def set_signal(block, key, value):
            block["carriers"]["a->b"]["rate"][key] = value

        not_an_object = custom_timeline()
        not_an_object["days"][1]["telemetry"] = []
        bad_cases = {
            "days[1].telemetry must be an object": not_an_object,
            "days[1].telemetry.start": with_block(lambda b: b.update(start="yesterday")),
            "days[1].telemetry.stepSeconds": with_block(lambda b: b.update(stepSeconds=0)),
            "days[1].telemetry.stepSeconds ": with_block(lambda b: b.update(stepSeconds=True)),
            "days[1].telemetry.carriers": with_block(lambda b: b.pop("carriers")),
            "days[1].telemetry.carriers.a->b": with_block(lambda b: b["carriers"].update({"a->b": []})),
            "days[1].telemetry.carriers.a->b.rate": with_block(lambda b: b["carriers"]["a->b"].update(rate={"unit": "req/h"})),
            "days[1].telemetry.carriers.a->b.rate.values": with_block(lambda b: set_signal(b, "values", [1, "2", None])),
            "days[1].telemetry.carriers.a->b.rate.values ": with_block(lambda b: set_signal(b, "values", [1, True, None])),
            "days[1].telemetry.carriers.a->b.rate.unit": with_block(lambda b: set_signal(b, "unit", 5)),
            "days[1].telemetry.carriers.b.lag.values": with_block(lambda b: b["carriers"]["b"]["lag"].update(values=[1, 2])),
            "days[1].telemetry.annotations": with_block(lambda b: b.update(annotations={"id": 1})),
            "days[1].telemetry.annotations[0].time": with_block(lambda b: b["annotations"][0].update(time="soon")),
            "days[1].telemetry.annotations[0].text": with_block(lambda b: b["annotations"][0].pop("text")),
            "days[1].telemetry.annotations[0].tags": with_block(lambda b: b["annotations"][0].update(tags=["deploy", 3])),
            "days[1].telemetry.colour": with_block(lambda b: b.update(colour="red")),
        }
        for path, timeline in bad_cases.items():
            r, out = run_inject(template, spec, ["--timeline", "{td}/tl.json"],
                                {"tl.json": json.dumps(timeline)})
            self.assertNotEqual(r.returncode, 0, path)
            self.assertIn("tl.json", r.stderr, path)
            self.assertIn(path.strip(), r.stderr, path)
            self.assertIsNone(out, path)

    def test_timeline_telemetry_rejects_non_finite_values(self):
        # json.loads accepts NaN and Infinity tokens; a browser's JSON.parse does not, so the
        # injector must refuse them instead of embedding them.
        template = TEMPLATE + "<!-- LIVE_TIMELINE -->\n"
        spec = json.dumps(tracked_spec())
        timeline = custom_timeline()
        block = telemetry_block()
        block["carriers"]["a->b"]["rate"]["values"] = [None, "__TOKEN__", 12.5]
        timeline["days"][1]["telemetry"] = block
        for token in ("NaN", "Infinity", "-Infinity"):
            text = json.dumps(timeline).replace('"__TOKEN__"', token)
            self.assertIn(token, text)
            r, out = run_inject(template, spec, ["--timeline", "{td}/tl.json"], {"tl.json": text})
            self.assertNotEqual(r.returncode, 0, token)
            self.assertIn("tl.json", r.stderr, token)
            self.assertIn("days[1].telemetry.carriers.a->b.rate.values", r.stderr, token)
            self.assertIn("finite", r.stderr, token)
            self.assertIsNone(out, token)

    def test_example_timeline_carries_telemetry_on_every_day(self):
        inject = load_inject()
        timeline = inject.load_timeline(str(EXAMPLE_TIMELINE))
        self.assertEqual(len(timeline["days"]), 12)
        for index, day in enumerate(timeline["days"]):
            self.assertIn("telemetry", day, f"days[{index}]")
            self.assertTrue(day["telemetry"]["carriers"], f"days[{index}] carriers")
        texts = [a["text"] for a in timeline["days"][9]["telemetry"]["annotations"]]
        self.assertTrue(any("firmware 2.4.1" in text for text in texts), texts)

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
        self.assertEqual(servers[0]["tools"], ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"])
        self.assertIn("display name", guide)
        # the edit loop, the tracking rules, the pointers and the post-publish checks
        for needle in ("`flowspec`", "same URL", "node tools/validate.js",
                       "^[A-Z][A-Z0-9_]+-[0-9]+$", "prs", "tracking.jira.site", "staleDays",
                       "tracking.jira.epic", "tracking.jira.exclude", "displayed upstream dependencies", "tracking.github", "never stores",
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
        self.assertNotIn("## Metrics rules", guide)
        self.assertEqual(json.loads(FLOWSPEC_BLOCK.search(out)[1]), SPEC)

    def test_agent_guide_declares_the_grafana_connector_only_for_grafana_run_signals(self):
        # #943: a page whose carriers (or page templates) bind grafana, loki or sql
        # signals declares the Grafana connector beside Jira, with the five tools the
        # adapter picks it by; tempo-only or honeycomb-only pages do not.
        grafana_tools = ["query_prometheus", "query_loki_logs", "search_tempo_traces", "get_annotations", "generate_deeplink"]
        jira = {"server": "Atlassian", "tools": ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"]}
        grafana = {"server": "Grafana", "tools": grafana_tools}

        def guide_for(page_extra=None, node_telemetry=None):
            spec = tracked_spec()
            spec["page"].update(page_extra or {})
            if node_telemetry is not None:
                spec["page"]["blocks"] = [{"heading": "h", "diagram": {"nodes": {"a": {"telemetry": node_telemetry}}, "rows": [["a"]]}}]
            r, out = run_inject(TEMPLATE, json.dumps(spec))
            self.assertEqual(r.returncode, 0, r.stderr)
            guide = GUIDE_BLOCK.search(out)[1]
            self.assertLess(len(guide.encode("utf-8")), 6 * 1024)
            return json.loads(re.search(r"```json\n(.*?)\n```", guide, re.S)[1]), guide

        for source in ("grafana", "loki", "sql"):
            declaration, guide = guide_for(node_telemetry={"kind": "service", "signals": {"rate": {source: "q"}}})
            self.assertEqual(declaration["mcp"]["servers"], [jira, grafana], source)
            for needle in ("Grafana", "get_annotations", "query_sql", "at most once an hour"):
                self.assertIn(needle, guide, needle)
        # a template signal on the page counts too, even before a carrier uses it
        templated = {"tracking": {"jira": {"site": "https://jira.test"}, "telemetry": {"templates": {"t": {"kind": "service", "signals": {"r": {"grafana": "up"}}}}}}}
        self.assertEqual(guide_for(page_extra=templated)[0]["mcp"]["servers"], [jira, grafana])
        for other in ({"tempo": "{ }"}, {"honeycomb": {"dataset": "d"}}):
            declaration, guide = guide_for(node_telemetry={"kind": "service", "signals": {"x": other}})
            self.assertEqual(declaration["mcp"]["servers"], [jira], other)
            self.assertNotIn("get_annotations", guide)
            for needle in ("## Metrics rules", "never derive a query", "imported/nested", "no shipped claude.ai adapter"):
                self.assertIn(needle, guide)
        # Page settings alone make the conditional guide relevant without
        # granting a connector permission; a root disable keeps authored
        # Grafana signals visible to editors but suppresses its declaration.
        declaration, guide = guide_for(page_extra={"tracking": {"jira": {"site": "https://jira.test"}, "telemetry": {"window": "24h"}}})
        self.assertEqual(declaration["mcp"]["servers"], [jira])
        self.assertIn("## Metrics rules", guide)
        telemetry_only = json.loads(json.dumps(SPEC))
        telemetry_only["page"]["tracking"] = {"telemetry": {"window": "24h"}}
        r, out = run_inject(TEMPLATE, json.dumps(telemetry_only))
        self.assertEqual(r.returncode, 0, r.stderr)
        guide = GUIDE_BLOCK.search(out)[1]
        self.assertEqual(json.loads(re.search(r"```json\n(.*?)\n```", guide, re.S)[1]), {"comments": {"composer_only": True, "customAnchors": True}})
        self.assertIn("no Jira connector", guide)
        self.assertIn("## Metrics rules", guide)
        disabled = {"tracking": {"jira": {"site": "https://jira.test"}, "telemetry": {"enabled": False, "templates": {"t": {"kind": "service", "signals": {"r": {"grafana": "up"}}}}}}}
        declaration, guide = guide_for(page_extra=disabled)
        self.assertEqual(declaration["mcp"]["servers"], [jira])
        self.assertIn("Root `enabled:false`", guide)
        self.assertIn("grants no query permission", guide)
        self.assertNotIn("get_annotations", guide)
        # an untracked page with Grafana signals declares Grafana alone
        spec = json.loads(json.dumps(SPEC))
        spec["page"]["blocks"] = [{"heading": "h", "diagram": {"nodes": {"a": {"telemetry": {"kind": "service", "signals": {"r": {"grafana": "up"}}}}}, "rows": [["a"]]}}]
        r, out = run_inject(TEMPLATE, json.dumps(spec))
        self.assertEqual(r.returncode, 0, r.stderr)
        declaration = json.loads(re.search(r"```json\n(.*?)\n```", GUIDE_BLOCK.search(out)[1], re.S)[1])
        self.assertEqual(declaration, {"mcp": {"servers": [grafana]}, "comments": {"composer_only": True, "customAnchors": True}})

    def test_agent_guide_declares_grafana_for_imported_carriers_the_runtime_resolves(self):
        # #943 review: the page's runtime resolves imported carriers from the
        # `flowview-topology` context block of the page it boots in (src/boot.flowview.js),
        # so a binding that only a provider carries must still declare the connector.
        # The detection resolves the imports as the runtime does: only exported,
        # selected carriers count, a consumer overlay replaces the provider binding,
        # and provider templates expand.
        grafana = {"server": "Grafana", "tools": ["query_prometheus", "query_loki_logs", "search_tempo_traces", "get_annotations", "generate_deeplink"]}
        comments = {"composer_only": True, "customAnchors": True}

        def spec(spec_id, diagram, **extra):
            page = {"title": spec_id, "canon": {"version": 1, "id": spec_id, "kind": "canonical", "owner": "group:default/test"}}
            page.update(extra)
            page["sections"] = [{"id": "main", "diagram": diagram}]
            return {"page": page}

        def provider(api=None, hidden=None, templates=None):
            nodes = {"api": {"title": "API"}, "store": {"title": "Store"}, "hidden": {"title": "Hidden"}}
            if api is not None:
                nodes["api"]["telemetry"] = api
            if hidden is not None:
                nodes["hidden"]["telemetry"] = hidden
            extra = {"tracking": {"telemetry": {"templates": templates}}} if templates else {}
            return spec("provider", {"nodes": nodes, "rows": [["api", "store", "hidden"]], "edges": [{"from": "api", "to": "store", "label": "Persist"}],
                                     "topologyExports": {"core": {"nodes": ["api", "store"], "edges": ["api->store"]}}}, **extra)

        def consumer(node_tracking=None):
            imp = {"spec": "provider", "export": "core", "as": "shared"}
            if node_tracking is not None:
                imp["nodeTracking"] = node_tracking
            return spec("consumer", {"nodes": {"local": {"title": "Local"}}, "rows": [["local"]], "topologyImports": [imp]})

        def declaration(page_spec, provider_spec=None):
            template = TEMPLATE
            if provider_spec is not None:
                providers = provider_spec if isinstance(provider_spec, list) else [provider_spec]
                context = {"version": 1, "id": page_spec["page"]["canon"]["id"], "specs": providers + [page_spec]}
                block = '<script type="application/json" id="flowview-topology">' + json.dumps(context).replace("<", "\\u003c") + "</script>\n"
                template = TEMPLATE.replace(BLOCK_OPEN, block + BLOCK_OPEN, 1)
            r, out = run_inject(template, json.dumps(page_spec))
            self.assertEqual(r.returncode, 0, r.stderr)
            guide = GUIDE_BLOCK.search(out)[1]
            self.assertLess(len(guide.encode("utf-8")), 6 * 1024)
            return json.loads(re.search(r"```json\n(.*?)\n```", guide, re.S)[1])

        signal = {"kind": "service", "signals": {"rate": {"grafana": "sum(rate(http_requests_total[5m]))"}}}
        # an imported node whose provider binding runs a grafana signal, no local telemetry
        self.assertEqual(declaration(consumer(), provider(api=signal)), {"mcp": {"servers": [grafana]}, "comments": comments})
        # the provider binding uses a provider template with a loki signal
        templated = provider(api={"use": "svc", "app": "api"}, templates={"svc": {"kind": "service", "params": ["app"], "signals": {"logs": {"loki": 'sum(rate({app="$app"}[5m]))'}}}})
        self.assertEqual(declaration(consumer(), templated)["mcp"]["servers"], [grafana])
        # a provider carrier the import does not export never reaches the page
        self.assertEqual(declaration(consumer(), provider(hidden=signal)), {"comments": comments})
        # a consumer overlay replaces the provider binding as a whole (here with a tempo-only one)
        tempo = {"kind": "service", "signals": {"t": {"tempo": "{ }"}}}
        self.assertEqual(declaration(consumer({"api": {"telemetry": tempo}}), provider(api=signal)), {"comments": comments})
        # Nested imports use the loader-selected export and retain the provider
        # binding. This is the same resolution path used for selected details.
        middle = consumer()
        middle["page"]["canon"]["id"] = "middle"
        middle["page"]["sections"][0]["diagram"]["topologyExports"] = {"nested": {"nodes": ["shared::api", "shared::store"], "edges": ["shared::api->shared::store"]}}
        outer = spec("outer", {"nodes": {"local": {"title": "Local"}}, "rows": [["local"]], "topologyImports": [{"spec": "middle", "export": "nested", "as": "outer"}]})
        self.assertEqual(declaration(outer, [provider(api=signal), middle])["mcp"]["servers"], [grafana])
        # a page with no telemetry anywhere, with or without a topology context
        self.assertEqual(declaration(consumer(), provider()), {"comments": comments})
        self.assertEqual(declaration(SPEC), {"comments": comments})
        # a snapshot resolved before injection (page_build.py --resolve-imports) carries the imported binding itself
        resolved = consumer()
        resolved["page"]["sections"][0]["diagram"] = {"nodes": {"local": {"title": "Local"}, "shared::api": {"title": "API", "telemetry": signal}}, "rows": [["local", "shared::api"]]}
        self.assertEqual(declaration(resolved)["mcp"]["servers"], [grafana])

    def test_agent_guide_replaces_a_stale_guide_when_reinjecting_a_built_page(self):
        built = TEMPLATE.replace("</script>\n" + BACKLINK_OPEN,
                                 '</script>\n<script type="text/markdown" id="dv-agent-guide">\nold guide\n</script>\n' + BACKLINK_OPEN, 1)
        self.assertEqual(len(GUIDE_BLOCK.findall(built)), 1)
        r, out = run_inject(built, json.dumps(SPEC))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(GUIDE_BLOCK.findall(out)), 1)
        self.assertNotIn("old guide", out)
        self.assertIn(BACKLINK_OPEN + '\n{"services": {}}\n</script>', out)

    # #826: two-file publish. Contract matrix (rows P1-P6; the browser rows are in
    # tools/browser-tests/tests/two-file-board.spec.mjs):
    # | row | fixture | assertion (scoped) | rejects |
    # | P1 two-file writes flowspec.json beside the page | --two-file, formatted spec | sidecar text == inline block text + "\n"; parses to the spec | re-serialized (json.dumps) sidecar; sidecar elsewhere |
    # | P2 marker present once, inline block kept | --two-file | exactly one SPEC_FILE_MARKER line; FLOWSPEC_BLOCK still parses to spec; marker precedes the guide | marker-only impl that drops the block; stacked markers |
    # | P3 single-file writes no sidecar and no marker | same spec, no flag | sidecar is None; marker count 0 | always-on sidecar |
    # | P4 two-file Jira declaration adds artifact + user | Jira spec, --two-file | declaration == {mcp, comments, artifact: {}, user: {scopes: ["profile"]}} | artifact without user; user without the profile scope |
    # | P5 single-file tracked declaration unchanged | tracked spec, no flag | declaration keys == {mcp, comments} (test :214 also) | adding artifact/user to every tracked page |
    # | P6 untracked two-file declaration stays comments-only | SPEC, --two-file | declaration == {comments} (test :292 also) | adding artifact/user to untracked pages |
    # | P7 re-injecting a two-file page single-file drops the marker | built two-file page as template, no flag | marker count 0; one guide | stale marker survives like a stale guide would |
    # | P8 telemetry-only two-file edit flow | tracking.telemetry, --two-file | artifact + user.profile and flowspec sidecar, no Jira; single-file has neither edit capability | coupling Edit/reconciliation permission to Jira permission |
    def test_two_file_writes_flowspec_json_beside_the_page_and_marks_the_html(self):
        formatted = '{\n\t"page": {\n  "blocks": [{"heading": "h"}],\n\t\t"title": "Two files"\n  }\n}\n\n'
        r, out, files = run_inject(TEMPLATE, formatted, ["--two-file"], sidecars=("flowspec.json",))
        self.assertEqual(r.returncode, 0, r.stderr)
        sidecar = files["flowspec.json"]
        self.assertIsNotNone(sidecar, "flowspec.json written beside the page")
        # P1: the authored text verbatim (outer whitespace stripped, one trailing newline), never re-serialized
        self.assertEqual(sidecar, formatted.strip() + "\n")
        self.assertEqual(json.loads(sidecar), json.loads(formatted))
        self.assertNotEqual(sidecar.strip(), json.dumps(json.loads(formatted)))
        # P2: the inline block holds the same text and the marker sits once between it and the guide
        self.assertEqual(FLOWSPEC_BLOCK.search(out)[1], formatted.strip())
        self.assertEqual(out.count(SPEC_FILE_MARKER), 1)
        self.assertEqual(len(re.findall(r'^<meta name="dv-spec-file"', out, re.M)), 1)
        self.assertLess(FLOWSPEC_BLOCK.search(out).start(), out.index(SPEC_FILE_MARKER))
        self.assertLess(out.index(SPEC_FILE_MARKER), GUIDE_BLOCK.search(out).start())
        self.assertEqual(len(GUIDE_BLOCK.findall(out)), 1)
        self.assertIn("<title>Two files</title>", out)
        # P3: without the flag nothing changes
        r, out, files = run_inject(TEMPLATE, formatted, sidecars=("flowspec.json",))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNone(files["flowspec.json"])
        self.assertEqual(out.count(SPEC_FILE_MARKER), 0)
        self.assertNotIn('dv-spec-file', out)
        self.assertEqual(FLOWSPEC_BLOCK.search(out)[1], formatted.strip())

    def test_two_file_edit_capabilities_are_independent_of_jira_permission(self):
        tracked = json.dumps(tracked_spec())

        def declaration(html):
            guide = GUIDE_BLOCK.search(html)[1]
            fences = re.findall(r"```json\n(.*?)\n```", guide, re.S)
            self.assertEqual(len(fences), 1)
            return json.loads(fences[0]), guide

        # P4: a Jira two-file page adds the artifact and user capabilities to today's declaration
        r, out = run_inject(TEMPLATE, tracked, ["--two-file"])
        self.assertEqual(r.returncode, 0, r.stderr)
        two_file, guide = declaration(out)
        self.assertEqual(two_file, {
            "mcp": {"servers": [{"server": "Atlassian", "tools": ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"]}]},
            "comments": {"composer_only": True, "customAnchors": True},
            "artifact": {},
            "user": {"scopes": ["profile"]},
        })
        self.assertEqual(two_file["user"]["scopes"], ["profile"])
        # the edit loop names the file, the files-form publish and how board edits come back
        for needle in ("flowspec.json", "files", "editHistory", "same URL"):
            self.assertIn(needle, guide, needle)
        self.assertLess(len(guide.encode("utf-8")), 6 * 1024)
        # P5: a single-file tracked page keeps today's declaration
        r, out = run_inject(TEMPLATE, tracked)
        self.assertEqual(r.returncode, 0, r.stderr)
        single, guide = declaration(out)
        self.assertEqual(set(single), {"mcp", "comments"})
        self.assertEqual(single["mcp"], two_file["mcp"])
        self.assertEqual(single["comments"], two_file["comments"])
        self.assertNotIn("editHistory", guide)
        # P6: an untracked two-file page stays comments-only
        r, out = run_inject(TEMPLATE, json.dumps(SPEC), ["--two-file"])
        self.assertEqual(r.returncode, 0, r.stderr)
        untracked, guide = declaration(out)
        self.assertEqual(untracked, {"comments": {"composer_only": True, "customAnchors": True}})
        self.assertIn("flowspec.json", guide)

        # P8: telemetry-only publishing uses the same two-file edit,
        # reconciliation and same-URL republish flow without requesting Jira.
        telemetry_only = json.loads(json.dumps(SPEC))
        telemetry_only["page"]["tracking"] = {"telemetry": {"window": "24h"}}
        r, out, files = run_inject(TEMPLATE, json.dumps(telemetry_only), ["--two-file"], sidecars=("flowspec.json",))
        self.assertEqual(r.returncode, 0, r.stderr)
        telemetry_two, guide = declaration(out)
        self.assertEqual(telemetry_two, {
            "comments": {"composer_only": True, "customAnchors": True},
            "artifact": {},
            "user": {"scopes": ["profile"]},
        })
        self.assertEqual(json.loads(files["flowspec.json"]), telemetry_only)
        self.assertNotIn("Atlassian", json.dumps(telemetry_two))
        for needle in ("flowspec.json", "editHistory", "same URL"):
            self.assertIn(needle, guide)
        r, out = run_inject(TEMPLATE, json.dumps(telemetry_only))
        self.assertEqual(r.returncode, 0, r.stderr)
        telemetry_single, guide = declaration(out)
        self.assertEqual(telemetry_single, {"comments": {"composer_only": True, "customAnchors": True}})
        self.assertNotIn("editHistory", guide)

    def test_two_file_guide_lists_board_edits_asks_before_overriding_and_logs_agent_changes(self):
        # #974 (Chuck 2026-11-04): an agent that edits the published flowspec.json reports the board
        # edits since the newest agent entry, asks the editor before overriding one of them, appends
        # one agent entry with a summary, and starts again when the publish is refused.
        r, out = run_inject(TEMPLATE, json.dumps(tracked_spec()), ["--two-file"])
        self.assertEqual(r.returncode, 0, r.stderr)
        guide = GUIDE_BLOCK.search(out)[1]
        self.assertLess(len(guide.encode("utf-8")), 6 * 1024)
        for needle in ('"source": "agent"', '"summary"', "tools/board-sync.js pull", "tools/board-sync.js log"):
            self.assertIn(needle, guide, needle)
        steps = re.findall(r"^\d+\. .*$", guide, re.M)
        def step(needle):
            found = [i for i, line in enumerate(steps) if needle in line]
            self.assertEqual(len(found), 1, f"exactly one edit-loop step names {needle!r}")
            return found[0], steps[found[0]]
        # read and report board edits first, ask only about overriding board edits after the newest
        # agent entry, log the change before republishing, and start again on a refused publish
        report, report_line = step("one line each")
        ask, ask_line = step("ask the editor")
        log, log_line = step('"source": "agent"')
        publish, publish_line = step("refused")
        self.assertIn("flowspec.json", report_line)
        self.assertIn("newest agent entry", report_line)
        self.assertIn("after the newest agent entry", ask_line)
        for needle in ("moves", "removes"):
            self.assertIn(needle, ask_line, needle)
        self.assertIn('"summary"', log_line)
        self.assertIn("tools/board-sync.js log", log_line)
        self.assertIn("same URL", publish_line)
        self.assertIn("step 1", publish_line)
        self.assertLess(report, ask)
        self.assertLess(ask, log)
        self.assertLess(log, publish)
        self.assertLess(guide.index("tools/board-sync.js pull"), guide.index("tools/board-sync.js log"))
        # a single-file page has no board edits to fold in
        r, out = run_inject(TEMPLATE, json.dumps(tracked_spec()))
        self.assertEqual(r.returncode, 0, r.stderr)
        guide = GUIDE_BLOCK.search(out)[1]
        self.assertNotIn("board-sync", guide)
        self.assertNotIn('"source": "agent"', guide)

    def test_reinjecting_a_two_file_page_without_the_flag_drops_the_marker(self):
        # P7: a built two-file page used as the template loses its marker, as it loses its stale guide
        r, built = run_inject(TEMPLATE, json.dumps(SPEC), ["--two-file"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(built.count(SPEC_FILE_MARKER), 1)
        r, out, files = run_inject(built, json.dumps(tracked_spec()), sidecars=("flowspec.json",))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(out.count(SPEC_FILE_MARKER), 0)
        self.assertIsNone(files["flowspec.json"])
        self.assertEqual(len(GUIDE_BLOCK.findall(out)), 1)
        self.assertEqual(json.loads(FLOWSPEC_BLOCK.search(out)[1]), tracked_spec())
        # and the other way: re-injecting two-file keeps exactly one marker
        r, out = run_inject(built, json.dumps(SPEC), ["--two-file"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(out.count(SPEC_FILE_MARKER), 1)

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
