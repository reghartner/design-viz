#!/usr/bin/env python3
"""Inject a flowspec JSON file into the flowview template.

Usage: inject.py <spec.json> <template.html> <out.html> [--timeline <path|none>]

Replaces the contents of the template's embedded JSON block (the script tag
with id "flowspec", matched at line start so prose mentions can never match),
and sets the page <title> from page.title when present. When the output uses
either the flat <root>/<page>.html or nested <root>/<family>/<page>.html layout
and the matching root has crossref.json, it also fills the separate derived
flowbacklinks block.

--timeline <path> embeds that demo timeline JSON (version, intervalSeconds,
days[].issues) in the separate live-timeline block of a page that declares
page.tracking; --timeline none embeds nothing, so #live=demo synthesizes four
days from the page's own ticket keys. The default is the example timeline for
the example spec (examples/live-status/live-status.spec.json) and none for
every other spec.
"""
import argparse
import json
from pathlib import Path
import re
import sys

from crossrefs import CrossrefError, discovered_page_backlinks, inject_backlink_block


REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_SPEC = REPO_ROOT / "examples/live-status/live-status.spec.json"
EXAMPLE_TIMELINE = REPO_ROOT / "examples/live-status/live-status.timeline.json"
TIMELINE_NONE = "none"


class TimelineError(Exception):
    pass


def default_timeline(spec_path: str) -> str:
    """Only the example spec ships the doorbell example timeline by default."""
    try:
        same = Path(spec_path).resolve() == EXAMPLE_SPEC.resolve()
    except OSError:
        same = False
    return str(EXAMPLE_TIMELINE) if same else TIMELINE_NONE


def load_timeline(path: str) -> dict:
    """Read and shape-check a demo timeline file; raise TimelineError with the path."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as ex:
        raise TimelineError(f"cannot read timeline {path}: {ex.strerror or ex}") from ex
    try:
        timeline = json.loads(text)
    except json.JSONDecodeError as ex:
        raise TimelineError(f"timeline {path} is not valid JSON: {ex}") from ex
    problems = []
    if not isinstance(timeline, dict):
        problems.append("top level must be an object")
    else:
        if not isinstance(timeline.get("version"), int) or isinstance(timeline.get("version"), bool):
            problems.append("version must be an integer")
        interval = timeline.get("intervalSeconds")
        if isinstance(interval, bool) or not isinstance(interval, (int, float)) or interval <= 0:
            problems.append("intervalSeconds must be a positive number")
        days = timeline.get("days")
        if not isinstance(days, list) or not days:
            problems.append("days must be a non-empty array")
        else:
            for i, day in enumerate(days):
                if not isinstance(day, dict) or not isinstance(day.get("issues"), dict):
                    problems.append(f"days[{i}].issues must be an object keyed by ticket")
    if problems:
        raise TimelineError(f"timeline {path} has the wrong shape: " + "; ".join(problems))
    return timeline


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="inject.py", description=__doc__.strip(),
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", metavar="<spec.json>")
    parser.add_argument("template", metavar="<template.html>")
    parser.add_argument("out", metavar="<out.html>")
    parser.add_argument("--timeline", metavar="<path|none>", default=None,
                        help="demo timeline JSON to embed in the live-timeline block, or "
                             "'none' to embed nothing (default: the example timeline for the "
                             "example spec, none otherwise)")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    spec_path, tpl_path, out_path = args.spec, args.template, args.out
    timeline_choice = args.timeline if args.timeline is not None else default_timeline(spec_path)

    raw = open(spec_path).read().strip()
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as ex:
        print(f"error: {spec_path} is not valid JSON: {ex}", file=sys.stderr)
        return 1
    if "</script" in raw:
        print(f"error: {spec_path} contains a literal '</script' — escape it as '<\\/script' "
              "(see contract/authoring-contract.md, output rules)", file=sys.stderr)
        return 1

    tpl = open(tpl_path).read()
    block = re.compile(r'^(<script type="application/json" id="flowspec">)\n.*?\n(</script>)',
                       re.S | re.M)
    hits = block.findall(tpl)
    if len(hits) != 1:
        print(f"error: expected exactly one line-anchored flowspec block in {tpl_path}, "
              f"found {len(hits)}", file=sys.stderr)
        return 1
    out = block.sub(lambda m: m.group(1) + "\n" + raw + "\n" + m.group(2), tpl, count=1)

    # Standalone opt-in story data stays separate from the authored document.
    # JSON escaping prevents timeline text from terminating its script element.
    timeline_marker = "<!-- LIVE_TIMELINE -->"
    timeline_block = ""
    page = spec.get("page") or {}
    if timeline_choice != TIMELINE_NONE:
        try:
            timeline = load_timeline(timeline_choice)
        except TimelineError as ex:
            print(f"error: {ex}", file=sys.stderr)
            return 1
        if "tracking" not in page:
            print(f"warning: {spec_path} declares no tracking; timeline {timeline_choice} not embedded",
                  file=sys.stderr)
        elif timeline_marker in out:
            payload = json.dumps(timeline, ensure_ascii=False).replace("<", "\\u003c")
            timeline_block = '<script type="application/json" id="live-timeline">\n' + payload + '\n</script>'
    out = re.sub(r"^<!-- LIVE_TIMELINE -->$", lambda _: timeline_block, out, flags=re.M)

    title = (spec.get("page") or {}).get("title")
    if title:
        safe = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        out = re.sub(r"<title>.*?</title>", f"<title>{safe}</title>", out, count=1)

    try:
        backlinks = discovered_page_backlinks(out_path, spec)
        if backlinks is not None:
            out = inject_backlink_block(out, backlinks, tpl_path)
    except CrossrefError as ex:
        print(f"error: {ex}", file=sys.stderr)
        return 1

    open(out_path, "w").write(out)
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
