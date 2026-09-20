#!/usr/bin/env python3
"""Assemble the committed single-file pages and Node runtime from src/.

  template/flowview.html   = flowview.skel.html  + core/flowview CSS + icons
                             + demo spec + (validator.js, engine.js, boot.flowview.js)
  workbench/flowspec.html  = workbench.skel.html + core/workbench CSS + icons
                             + (validator.js, engine.js, builder.workbench.js,
                                boot.workbench.js)
  tools/canon/generated-runtime.cjs = canon.js + validator.js + lazy engine.js

Deterministic: same src -> byte-identical output. Run from anywhere.
"""
import json
import base64
import pathlib
import sys
import subprocess
from functools import lru_cache

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# Embed curated source specs: built-ins also work from a downloaded HTML file.
# Keep metadata here, and the example itself in its existing authored location.
WORKBENCH_TEMPLATES = [
    {"name": "Simple service flow", "desc": "A client, a service, and a store. Start with the essentials and make them yours.", "category": "engineering", "tag": "The essentials", "art": "flow", "source": "starters/minimal.json", "title": "Simple service flow"},
    {"name": "Retries & recovery", "desc": "Follow a request through retries, deadlines, and a circuit that opens and recovers.", "category": "engineering", "tag": "Alternate outcomes", "art": "branch", "source": "starters/resilience.json"},
    {"name": "A trace, explained", "desc": "Unpack a checkout request with concurrent spans and a recorded payment error.", "category": "engineering", "tag": "Observed execution · fictional", "art": "trace", "source": "starters/honeycomb-trace.json"},
    {"name": "Backstage architecture", "desc": "Explore service ownership, the inline viewer, and reviewed diagrams across repositories.", "category": "engineering", "tag": "Platform architecture", "art": "layers", "source": "../docs/diagrams/backstage/backstage.spec.json"},
    {"name": "Rollout decisions", "desc": "Explain when to promote a release, hold a wave, or roll back—with visible evidence.", "category": "business", "categories": ["engineering"], "tag": "Decisions & evidence", "art": "branch", "source": "starters/rollout.json"},
    {"name": "One story, two perspectives", "desc": "Connect the engineering detail to a visitor’s experience. Same steps, two ways to understand.", "category": "business", "categories": ["engineering", "devices"], "tag": "Engineering + business", "art": "perspectives", "source": "../docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json"},
    {"name": "A connected home", "desc": "Tell a story across rooms, devices, and people—including an internet outage.", "category": "devices", "tag": "Physical interactions", "art": "home", "source": "starters/homemap-story.json"},
    {"name": "Behind the app", "desc": "See where each camera-app value comes from, and what changes when telemetry fails.", "category": "devices", "tag": "App & backend", "art": "phone", "source": "starters/device-app-sources.json"},
]


def workbench_templates() -> str:
    entries = []
    for template in WORKBENCH_TEMPLATES:
        entry = {key: value for key, value in template.items() if key not in ("source", "title")}
        entry["spec"] = json.loads(read(template["source"]))
        # The legacy minimal example calls itself blank, but contains 3 nodes.
        if "title" in template:
            entry["spec"]["page"]["title"] = template["title"]
        entry["spec"].get("page", entry["spec"])["skin"] = "pastel"
        entries.append(entry)
    return json.dumps(entries, ensure_ascii=True).replace("<", "\\u003c")


def read(name: str) -> str:
    return (SRC / name).read_text()


def source_files(name: str) -> list[str]:
    manifest = json.loads(read("source-bundles.json"))
    return [str(path.relative_to(SRC)) for entry in manifest.get(name, [name])
            for path in (sorted(SRC.glob(entry)) if entry.endswith("/*.js") else [SRC / entry])]


def js_bundle(*names: str) -> str:
    parts = []
    for n in [file for name in names for file in source_files(name)]:
        parts.append("/* ---- src/" + n + " ---- */")
        source = read(n).rstrip()
        if n == 'compatibility.js':
            source = source.replace('/* @panel-features */ {}', json.dumps(panel_assets()['features'], separators=(',', ':')))
        parts.append(source)
    return "\n".join(parts)


@lru_cache(maxsize=1)
def panel_assets() -> dict:
    return json.loads(subprocess.check_output(['node', str(ROOT / 'tools/source-loader.cjs'), '--assets'], text=True))


def panel_css(name: str) -> str:
    return subprocess.check_output(['node', str(ROOT / 'tools/source-loader.cjs'), '--styles', name], text=True)


def canon_runtime() -> str:
    """Static module for backend bundlers; never read/evaluate source at runtime."""
    return (
        "// GENERATED FILE — python3 tools/build.py; edit src/, not this file.\n"
        "'use strict';\n"
        + js_bundle("compatibility.js", "canon.js", "validator.js")
        + "\nmodule.exports = FlowCanon;\n"
        "module.exports.compatibility = FlowviewCompatibility;\n"
        "module.exports.validateSpec = raw => validate(normalize(raw));\n"
        "var viewerRoutingCache;\n"
        "module.exports.viewerRouting = () => {\n"
        "  if (!viewerRoutingCache) viewerRoutingCache = createViewerRouting();\n"
        "  return viewerRoutingCache;\n"
        "};\n"
        "// The facade uses the shared outer pure-core scope, including navigation.\n"
        "// Constructing it never initializes the DOM renderer.\n"
        "function createViewerRouting(){\n"
        "return {normalize, blocksOf, sectionRecords, sectionReferences, parseHash, buildHash,\n"
        "  diagramPathList, diagramForPath, resolveSourceStep, stepKeys, stepFailures, stepReference,\n"
        "  diagramLayoutViews, sectionLayoutItems, foldNodeTones, foldPanelStates, layout, lintPage};\n"
        "}\n"
    )


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
    core_css = panel_css("style.core.css").rstrip()

    flowview = fill(read("flowview.skel.html"), {
        "STYLE_PAGE": font_css() + "\n" + read("style.flowview.css").rstrip(),
        "STYLE_CORE": core_css,
        "ICONS": icons,
        "DEMO_SPEC": read("flowview.demo.json").strip(),
        "JS": js_bundle("compatibility.js", "canon.js", "validator.js", "engine.js", "boot.flowview.js"),
    })
    (ROOT / "template" / "flowview.html").write_text(flowview)

    workbench = fill(read("workbench.skel.html"), {
        "STYLE_PAGE": font_css() + "\n" + panel_css("style.workbench.css").rstrip(),
        "STYLE_CORE": core_css,
        "ICONS": icons,
        "JS": js_bundle("compatibility.js", "canon.js", "validator.js", "engine.js", "trace-import.js", "confluence.js", "builder.workbench.js", "panel-picker.workbench.js", "clipboard.workbench.js", "steps.workbench.js", "reuse.workbench.js", "workspace.workbench.js", "layout.workbench.js", "canon.workbench.js", "welcome.workbench.js", "boot.workbench.js"),
        "WORKBENCH_TEMPLATES": workbench_templates(),
    })
    (ROOT / "workbench" / "flowspec.html").write_text(workbench)

    runtime = canon_runtime()
    (ROOT / "tools" / "canon" / "generated-runtime.cjs").write_text(runtime)

    print("built template/flowview.html (%d bytes) and workbench/flowspec.html (%d bytes)"
          % (len(flowview), len(workbench)))
    print("built tools/canon/generated-runtime.cjs (%d bytes)" % len(runtime))
    return 0


if __name__ == "__main__":
    sys.exit(main())
