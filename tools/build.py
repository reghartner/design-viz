#!/usr/bin/env python3
"""Assemble local single-file pages and the packaged Node runtime from src/.

  template/flowview.html = standalone entrypoint + skeleton + demo spec
  workbench/flowspec.html = workbench entrypoint + skeleton + curated templates
  tools/canon/generated-runtime.cjs = static DOM-free backend entrypoint
  workbench/diagrams.json = metadata index for folders listed in root canon.json

The source loader owns entrypoint expansion, exports and asset inventory.
Deterministic: same src -> byte-identical output. Run from anywhere.
"""
import argparse
import json
import pathlib
import sys
import subprocess
try:
    from folder_agent_kit import folder_agent_kit
except ModuleNotFoundError:
    from tools.folder_agent_kit import folder_agent_kit
from functools import lru_cache

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# Embed curated source specs: built-ins also work from a downloaded HTML file.
# Keep metadata here, and the example itself in its existing authored location.
WORKBENCH_TEMPLATES = [
    {"name": "Simple service flow", "desc": "A client, a service, and a store. Start with the essentials and make them yours.", "category": "engineering", "tag": "The essentials", "art": "flow", "source": "starters/minimal.json", "title": "Simple service flow"},
    {"name": "Messaging cost tradeoffs", "desc": "Compare an event bus with a queue and relay at 1M, 10M and 100M messages, including fixed costs and engineering nodes.", "category": "engineering", "categories": ["business"], "tag": "Cost & architecture · illustrative", "art": "branch", "source": "starters/messaging-cost.json"},
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
    def default_routing(page):
        # New projects start without lanes. Only template copies change; opening
        # authored specs or the Canon library retains their explicit routing.
        for section in page.get("blocks", page.get("sections", [])):
            if isinstance(section.get("diagram"), dict):
                section["diagram"].pop("routing", None)
            for tab in section.get("tabs", []):
                default_routing(tab)

    entries = []
    for template in WORKBENCH_TEMPLATES:
        entry = {key: value for key, value in template.items() if key not in ("source", "title")}
        entry["spec"] = json.loads(read(template["source"]))
        # The legacy minimal example calls itself blank, but contains 3 nodes.
        if "title" in template:
            entry["spec"]["page"]["title"] = template["title"]
        entry["spec"].get("page", entry["spec"])["skin"] = "pastel"
        default_routing(entry["spec"].get("page", entry["spec"]))
        entries.append(entry)
    return json.dumps(entries, ensure_ascii=True).replace("<", "\\u003c")


def workbench_canon() -> str:
    registry_path = ROOT / 'examples/canon/registry.json'
    manifest = json.loads(registry_path.read_text())
    for entry in manifest['diagrams']:
        entry['spec'] = json.loads((registry_path.parent / entry.pop('path')).read_text())
    return json.dumps(manifest, ensure_ascii=True).replace('<', '\\u003c')


def embedded_json(value) -> str:
    """JSON safe inside an inline script and skeleton substitution, including closing tags."""
    return json.dumps(value, ensure_ascii=True).replace('<', '\\u003c').replace('{{', '\\u007b\\u007b')


def workbench_landing(config=None, *, no_config=False, runtime=None) -> str:
    """Read company-owned inputs without changing them. Paths belong to config."""
    path = pathlib.Path(config).resolve() if config is not None else ROOT / 'workbench/site.json'
    if no_config or (config is None and not path.exists()):
        return embedded_json({'spec': json.loads(read('starters/onboarding.json')),
                              'title': 'A visitor at the door', 'label': 'Fictional example',
                              'footer': 'One story. System flow, Home map, App screens, and Device app—moving together.'})
    try:
        data = json.loads(path.read_text())
        if not isinstance(data, dict) or set(data) != {'version', 'landing'}:
            raise ValueError('expected only version and landing fields')
        if type(data['version']) is not int or data['version'] != 1:
            raise ValueError('version must be 1')
        landing = data['landing']
        if not isinstance(landing, dict) or set(landing) - {'spec', 'title', 'label', 'footer'}:
            raise ValueError('landing allows only spec, title, label and footer')
        if not isinstance(landing.get('spec'), str) or not landing['spec'].strip():
            raise ValueError('landing.spec must be a non-empty path')
        for key in ('title', 'label', 'footer'):
            if key in landing and not isinstance(landing[key], str):
                raise ValueError('landing.' + key + ' must be plain text')
        spec_path = (path.parent / landing['spec']).resolve()
        raw = json.loads(spec_path.read_text())
        # Execute the freshly assembled validator, never a stale generated runtime.
        check = (runtime if runtime is not None else canon_runtime()) + '\n' + (
            'const raw = ' + embedded_json(raw) + ';\n'
            'const result = module.exports.validateSpec(raw);\n'
            'if (!result.errors.length && !module.exports.viewerRouting().sectionRecords('
            'module.exports.viewerRouting().normalize(raw)).some(r => r.section.diagram && !r.section.detailOnly))'
            'result.errors.push("Landing needs a non-detail diagram section");\n'
            'process.stdout.write(JSON.stringify(result.errors));\n')
        errors = json.loads(subprocess.check_output(['node'], input=check, text=True))
        if errors:
            raise ValueError(str(spec_path) + ': ' + '; '.join(errors))
        return embedded_json({'spec': raw, 'title': landing.get('title', 'Company diagram'),
                              'label': landing.get('label', 'Company example'),
                              'footer': landing.get('footer', '')})
    except (OSError, ValueError) as error:
        raise SystemExit(f'Invalid site config {path}: {error}') from error


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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-only", action="store_true", help="build packaged backend and measurement runtimes only")
    config = parser.add_mutually_exclusive_group()
    config.add_argument('--config', type=pathlib.Path, help='company site JSON; spec paths resolve relative to this file')
    config.add_argument('--no-config', action='store_true', help='build the upstream sample, ignoring workbench/site.json')
    args = parser.parse_args()
    if args.runtime_only and args.config is not None:
        parser.error('--config requires an HTML build')
    runtime = canon_runtime()
    landing = None if args.runtime_only else workbench_landing(args.config, no_config=args.no_config, runtime=runtime)
    runtime_path = ROOT / "tools/canon/generated-runtime.cjs"
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    runtime_path.write_text(runtime)
    if args.runtime_only:
        print("built tools/canon/generated-runtime.cjs (%d bytes)" % len(runtime))
        return 0
    for name, skeleton, output in [
        ('standalone', 'flowview.skel.html', ROOT / 'template/flowview.html'),
        ('workbench', 'workbench.skel.html', ROOT / 'workbench/flowspec.html'),
    ]:
        entry = entrypoint(name)
        assets = entrypoint_assets(name)
        styles = {style['key']: style['source'].rstrip() for style in assets['styles']}
        mapping = {
            'STYLE_PAGE': font_css(entry['fonts']) + '\n' + '\n'.join(
                style['source'].rstrip() for style in assets['styles'] if style['key'] != 'core'),
            'STYLE_CORE': styles['core'],
            'ICONS': assets['icons'].rstrip(),
            'JS': entry['source'],
        }
        if name == 'standalone':
            mapping['DEMO_SPEC'] = read('flowview.demo.json').strip()
        else:
            mapping['WORKBENCH_TEMPLATES'] = workbench_templates()
            mapping['WORKBENCH_CANON'] = workbench_canon()
            mapping['WORKBENCH_ONBOARDING'] = json.dumps(json.loads(read('starters/onboarding.json')), ensure_ascii=True).replace('<', '\\u003c')
            mapping['WORKBENCH_LANDING'] = landing
            mapping['HUMAN_GUIDE'] = read('workbench/human-guide.html')
            mapping['FOLDER_AGENT_KIT'] = folder_agent_kit(ROOT, runtime)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(fill(read(skeleton), mapping))

    # Publish against the runtime just built, so newly added panels validate.
    subprocess.run([
        'node', str(ROOT / 'tools/canon/library.mjs'),
        '--registry', str(ROOT / 'canon.json'),
        '--out', str(ROOT / 'workbench/diagrams.json'),
    ], check=True)

    print("built template/flowview.html (%d bytes) and workbench/flowspec.html (%d bytes)"
          % ((ROOT / "template/flowview.html").stat().st_size, (ROOT / "workbench/flowspec.html").stat().st_size))
    print("built tools/canon/generated-runtime.cjs (%d bytes)" % len(runtime))
    return 0


if __name__ == "__main__":
    sys.exit(main())
