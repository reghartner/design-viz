#!/usr/bin/env python3
"""Assemble the committed single-file pages and Node runtime from src/.

  template/flowview.html = standalone entrypoint + skeleton + demo spec
  workbench/flowspec.html = workbench entrypoint + skeleton + curated templates
  tools/canon/generated-runtime.cjs = static DOM-free backend entrypoint

The source loader owns entrypoint expansion, exports and asset inventory.
Deterministic: same src -> byte-identical output. Run from anywhere.
"""
import json
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
    {"name": "Doorbell domain drilldowns", "desc": "Explore connectivity and recording domains with overview maps, and follow failures into nested detail flows.", "category": "engineering", "categories": ["devices"], "tag": "Focused drilldowns", "art": "layers", "source": "starters/domain-drilldown.json"},
    {"name": "Event fan-out handoffs", "desc": "End an overview at three arrow-shaped destinations, each pointing to its own diagram document.", "category": "engineering", "tag": "Across documents", "art": "branch", "source": "starters/diagram-handoffs.json"},
    {"name": "Backstage architecture", "desc": "Explore service ownership, the inline viewer, and reviewed diagrams across repositories.", "category": "engineering", "tag": "Platform architecture", "art": "layers", "source": "../docs/diagrams/backstage/backstage.spec.json"},
    {"name": "Rollout decisions", "desc": "Explain when to promote a release, hold a wave, or roll back—with visible evidence.", "category": "business", "categories": ["engineering"], "tag": "Decisions & evidence", "art": "branch", "source": "starters/rollout.json"},
    {"name": "One story, two perspectives", "desc": "Connect the engineering detail to a visitor’s experience. Same steps, two ways to understand.", "category": "business", "categories": ["engineering", "devices"], "tag": "Engineering + business", "art": "perspectives", "source": "../docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json"},
    {"name": "A connected home", "desc": "Tell a story across rooms, devices, and people—including an internet outage.", "category": "devices", "tag": "Physical interactions", "art": "home", "source": "starters/homemap-story.json"},
    {"name": "From alarm to response", "desc": "Follow security monitoring and emergency dispatch through a confirmed incident, a false alarm, or a failed handoff.", "category": "devices", "categories": ["business", "engineering"], "tag": "Monitoring & dispatch", "art": "home", "source": "starters/security-response.json"},
    {"name": "Sound at the door", "desc": "See conversations, chimes, recorded replies, sirens and sound detection—including audio failures while video keeps working.", "category": "devices", "categories": ["business", "engineering"], "tag": "Audio & intervention", "art": "home", "source": "starters/audio-story.json"},
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


def loader(mode: str, *names: str) -> str:
    """One Node build-time owner expands physical sources and substitutions."""
    return subprocess.check_output(['node', str(ROOT / 'tools/source-loader.cjs'), mode, *names], text=True)


def source_files(name: str) -> list[str]:
    return json.loads(loader('--files', name))


def js_bundle(*names: str) -> str:
    return loader('--sources', *names)


@lru_cache(maxsize=None)
def entrypoint(name: str) -> dict:
    return json.loads(loader('--entrypoint', name))


@lru_cache(maxsize=None)
def entrypoint_assets(name: str) -> dict:
    return json.loads(loader('--entry-assets', name))


def panel_assets() -> dict:
    return json.loads(loader('--assets'))


def panel_css(name: str) -> str:
    return loader('--styles', name)


def canon_runtime() -> str:
    """Static module for backend bundlers; never read/evaluate source at runtime."""
    return ("// GENERATED FILE — python3 tools/build.py; edit src/, not this file.\n"
            "'use strict';\n" + loader('--module', 'backend', 'cjs'))


@lru_cache(maxsize=None)
def font_css(profile: str = 'all') -> str:
    return loader('--font-css', profile)


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
    for name, skeleton, output in [
        ('standalone', 'flowview.skel.html', ROOT / 'template/flowview.html'),
        ('workbench', 'workbench.skel.html', ROOT / 'workbench/flowspec.html'),
    ]:
        entry = entrypoint(name)
        assets = entrypoint_assets(name)
        styles = {style['key']: style['source'].rstrip() for style in assets['styles']}
        mapping = {
            'STYLE_PAGE': font_css(entry['fonts']) + '\n' + styles['page' if name == 'standalone' else 'workbench'],
            'STYLE_CORE': styles['core'],
            'ICONS': assets['icons'].rstrip(),
            'JS': entry['source'],
        }
        if name == 'standalone':
            mapping['DEMO_SPEC'] = read('flowview.demo.json').strip()
        else:
            mapping['WORKBENCH_TEMPLATES'] = workbench_templates()
        output.write_text(fill(read(skeleton), mapping))

    runtime = canon_runtime()
    (ROOT / "tools" / "canon" / "generated-runtime.cjs").write_text(runtime)

    print("built template/flowview.html (%d bytes) and workbench/flowspec.html (%d bytes)"
          % ((ROOT / "template/flowview.html").stat().st_size, (ROOT / "workbench/flowspec.html").stat().st_size))
    print("built tools/canon/generated-runtime.cjs (%d bytes)" % len(runtime))
    return 0


if __name__ == "__main__":
    sys.exit(main())
