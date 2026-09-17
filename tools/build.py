#!/usr/bin/env python3
"""Assemble the two committed single-file pages from src/.

  template/flowview.html   = flowview.skel.html  + core/flowview CSS + icons
                             + demo spec + (validator.js, engine.js, boot.flowview.js)
  workbench/flowspec.html  = workbench.skel.html + core/workbench CSS + icons
                             + (validator.js, engine.js, builder.workbench.js,
                                boot.workbench.js)

Deterministic: same src -> byte-identical output. Run from anywhere.
"""
import json
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# Reuse the canonical demo so its gallery entry cannot drift.
STARTERS = [
    ("home story", "A large home scene with rooms, a visitor, local signals, and an internet outage alternate.", "starters/homemap-story.json"),
    ("named layouts", "Switch between a Home story and service diagram in the same arrangement, with shared steps and alternate paths.", "starters/named-layouts.json"),
    ("thermal protection", "Proposed doorbell flow: heat, frost, charging pause, unavailable video and recovery.", "../docs/diagrams/thermal-doorbell/thermal-doorbell.spec.json"),
    ("whole home & outdoors", "A centered house with garden and driveway cameras, perimeter sensors, and swinging doors.", "starters/whole-home-outdoors.json"),
    ("across the front door", "Half outside, half inside: welcome a visitor through the door or leave a parcel outside.", "starters/front-door-threshold.json"),
    ("alternate paths", "One shared command diagram: happy path or a dropped signal after step 3.", "starters/alternate-paths.json"),
    ("blank flow", "Three nodes and two hops to make your own.", "starters/minimal.json"),
    ("screen clips", "Doorbell runners, a visitor, or a kitchen fire: start recording, then trigger the event.", "starters/screen-clips.json"),
    ("panel showcase", "Five panels updated across four steps.", "starters/panels-tour.json"),
    ("software & IoT", "Data state, decision checks, and resource budgets across two design stories.", "starters/software-systems.json"),
    ("retries & circuits", "Bounded retry success, deadline admission, and open/half-open recovery across three scenarios.", "starters/resilience.json"),
    ("replica positions", "Read-your-writes, lag, offline replicas and incomparable histories on one position ruler.", "starters/replication.json"),
    ("rollout decisions", "Canary promotion, traffic rollback and firmware trial confirmation with explicit evidence and held waves.", "starters/rollout.json"),
    ("Honeycomb trace", "A fictional checkout trace with concurrent spans and a recorded payment error.", "starters/honeycomb-trace.json"),
    ("complex trace", "Shared dependencies, service cycles and concurrent branches in reserved routing lanes.", "starters/complex-trace.json"),
    ("full demo", "The complete Flowview demo page.", "flowview.demo.json"),
]


def read(name: str) -> str:
    return (SRC / name).read_text()


def js_bundle(*names: str) -> str:
    parts = []
    for n in names:
        parts.append("/* ---- src/" + n + " ---- */")
        parts.append(read(n).rstrip())
    return "\n".join(parts)


def font_css() -> str:
    """Self-contained pages: no font CDN or authenticated asset requests."""
    licenses = "\n\n".join(p.read_text() for p in sorted((SRC / "fonts").glob("*-LICENSE.txt")))
    rules = ["/* Bundled font licenses\n" + licenses.replace("*/", "* /") + "\n*/"]
    for font in json.loads(read("fonts/manifest.json")):
        data = base64.b64encode((SRC / "fonts" / font["file"]).read_bytes()).decode("ascii")
        rules.append("@font-face{font-family:'%s';font-style:normal;font-weight:%s;"
                     "font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');}"
                     % (font["family"], font["weight"], data))
    return "\n".join(rules)


def fill(skel: str, mapping: dict) -> str:
    out = skel
    for key, val in mapping.items():
        marker = "{{" + key + "}}"
        if marker not in out:
            raise SystemExit(f"marker {marker} missing from skeleton")
        out = out.replace(marker, val)
    if "{{" in out:
        raise SystemExit("unfilled marker left in output: " + out[out.index("{{"):out.index("{{") + 40])
    return out


def main() -> int:
    icons = read("icons.svg").rstrip()
    core_css = read("style.core.css").rstrip()

    flowview = fill(read("flowview.skel.html"), {
        "STYLE_PAGE": font_css() + "\n" + read("style.flowview.css").rstrip(),
        "STYLE_CORE": core_css,
        "ICONS": icons,
        "DEMO_SPEC": read("flowview.demo.json").strip(),
        "JS": js_bundle("canon.js", "validator.js", "engine.js", "boot.flowview.js"),
    })
    (ROOT / "template" / "flowview.html").write_text(flowview)

    workbench = fill(read("workbench.skel.html"), {
        "STYLE_PAGE": read("style.workbench.css").rstrip(),
        "STYLE_CORE": core_css,
        "ICONS": icons,
        "JS": js_bundle("canon.js", "validator.js", "engine.js", "trace-import.js", "confluence.js", "builder.workbench.js", "clipboard.workbench.js", "steps.workbench.js", "reuse.workbench.js", "workspace.workbench.js", "layout.workbench.js", "canon.workbench.js", "boot.workbench.js"),
        "STARTERS": json.dumps([
            {"name": name, "desc": desc, "spec": json.loads(read(source))}
            for name, desc, source in STARTERS
        ], ensure_ascii=True).replace("<", "\\u003c"),
    })
    (ROOT / "workbench" / "flowspec.html").write_text(workbench)

    print("built template/flowview.html (%d bytes) and workbench/flowspec.html (%d bytes)"
          % (len(flowview), len(workbench)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
