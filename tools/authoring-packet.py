#!/usr/bin/env python3
"""Emit selected maintained authoring guidance, with deterministic size/provenance.

python3 tools/authoring-packet.py --panel deviceapp --feature paths --out packet.md
python3 tools/authoring-packet.py --spec story.json --mode edit --out packet.md
Writes packet.md and packet.md.json. Without --out, prints Markdown to stdout and
metadata to stderr. Selections union with inference; they never narrow a spec.
"""
import argparse
import hashlib
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path

from widget_doc import load_sections, CLIP_CUE, CLIP_CUE_TYPES

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = 'contract/authoring-contract.md'
SKILL = '.claude/skills/hld-to-page/SKILL.md'
REFS = '.claude/skills/hld-to-page/references/'
COMMON = ['Output rules', 'Top-level shape', 'Section shape', 'Diagram object',
          'view', 'autoplay', 'nodes', 'rows — left-to-right slots (no coordinates)',
          'floats — automatic or freely placed nodes', 'edges',
          'Edge kinds (protocols) and the legend', 'Validation behavior']
FEATURES = {
    'steps': ['steps — the narrative (powers BOTH modes)'],
    'time': ['Story time and device constants'],
    'paths': ['paths — alternate outcomes on the same board'],
    'layouts': [], 'explore': [],
    'icons': ['Shared icons and company branding'],
    'audio': ['Shared audio, spotlight and alarm state'],
    'visibility': ['Whole-panel visibility'],
    'contracts': ['message-contract card', 'Multiple contract blocks and widths', 'Step wire contract previews'],
    'reveals': ['fragment-level reveals'],
    'groups': ['groups — containment boundaries'],
    'delta': ['Delta markers — nodes, edges, and steps'],
    'bindings': [], 'topology': ['Shared topology references'], 'drilldowns': [],
}
DEPENDENCIES = {'time': ['steps'], 'paths': ['steps'], 'reveals': ['steps'],
                'visibility': ['steps'], 'audio': ['steps'], 'delta': ['steps'],
                'drilldowns': ['layouts'], 'explore': ['layouts']}
ROUTES = {
    'layouts': ['docs/section-layouts.md'], 'explore': ['docs/section-layouts.md'],
    'bindings': [REFS + 'bindings-and-code.md'],
    'topology': ['docs/shared-topology.md'],
    'drilldowns': ['docs/drilldowns.md'],
    'time': ['docs/step-time.md', REFS + 'panel-time-and-icons.md'],
    'paths': [REFS + 'story-planning.md'],
}
# For dependencies whose rules are not in the contract, embed their maintained
# owner instead of writing a second set of rules here.
INLINE = {
          'bindings': [REFS + 'bindings-and-code.md'],
          'topology': ['docs/shared-topology.md'],
          'drilldowns': ['docs/drilldowns.md']}


# Maintained prose uses inline Markdown links. Resolve each excerpt from its
# own source directory before combining it with excerpts from other directories.
# Keep code examples untouched and preserve external URLs, queries and anchors.
MARKDOWN_LINK = re.compile(r'(!?\[[^\n\]]*\]\()(<[^>\n]+>|[^()\s]+)(\s+"[^"\n]*")?(\))')


def local_destination(destination, source):
    angled = destination.startswith('<') and destination.endswith('>')
    value = destination[1:-1] if angled else destination
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', value) or value.startswith('//'):
        return destination
    path, marker, fragment = value.partition('#')
    path, query_marker, query = path.partition('?')
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source), path)) if path else source
    if resolved.startswith('../') or resolved.startswith('/'):
        raise ValueError('Documentation link escapes VIZ: ' + source + ': ' + destination)
    result = resolved + query_marker + query + marker + fragment
    return '<' + result + '>' if angled else result


def normalize_links(text, source):
    lines, fence = [], False
    for line in text.splitlines():
        if line.lstrip().startswith('```'):
            fence = not fence
        if not fence and not line.lstrip().startswith('```'):
            line = MARKDOWN_LINK.sub(lambda match: match[1] + local_destination(match[2], source) + (match[3] or '') + match[4], line)
        lines.append(line)
    return '\n'.join(lines)


def section(text, title):
    """Extract exactly one Markdown section, stopping at the next heading.
    Ignore headings inside fences (e.g. the contract's JSON examples).
    """
    lines = text.splitlines(); start = None; fence = False
    for index, line in enumerate(lines):
        if line.startswith('```'):
            fence = not fence
        if fence:
            continue
        match = re.match(r'^#{1,6} (.+)$', line)
        if match:
            if start is not None:
                return '\n'.join(lines[start:index]).strip()
            if match.group(1) == title:
                start = index
    if start is not None:
        return '\n'.join(lines[start:]).strip()
    raise ValueError('Missing maintained documentation section: ' + title)


def infer(raw):
    """Use canonical page records so wrappers/tabs/bare specs match tooling."""
    script = "const c=require('./tools/arrange/core.cjs');const raw=JSON.parse(require('fs').readFileSync(0,'utf8'));const r=c.viewerRouting(),page=r.normalize(raw);if(!page)throw Error('Not a FlowSpec');process.stdout.write(JSON.stringify(r.sectionRecords(page).map(x=>x.section)));"
    process = subprocess.run(['node', '-e', script], input=json.dumps(raw), text=True,
                             capture_output=True, cwd=ROOT)
    if process.returncode:
        raise ValueError('Cannot infer from spec: ' + process.stderr.strip())
    panels, features = set(), set()
    for sec in json.loads(process.stdout):
        d = sec.get('diagram') or {}
        panels.update(p['type'] for p in d.get('panels', []))
        for key, feature in [('steps', 'steps'), ('paths', 'paths'), ('storyTime', 'time'),
                             ('layouts', 'layouts'), ('sectionLayout', 'layouts'),
                             ('groups', 'groups'), ('topology', 'topology')]:
            if d.get(key): features.add(feature)
        if any(view.get('presentation') == 'explore' for view in d.get('layouts', []) if isinstance(view, dict)): features.add('explore')
        if sec.get('contract') or sec.get('contracts'): features.add('contracts')
        def visit(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in ('binding', 'codeRefs'): features.add('bindings')
                    if key in ('topologyImports', 'topologyExports', 'topologyProvenance'): features.add('topology')
                    if key in ('revealAt', 'hideAt'): features.add('reveals')
                    if key == 'panelVisibility' or key == 'visible': features.add('visibility')
                    if key in ('audio', 'spotlight', 'alarm'): features.add('audio')
                    if key == 'delta': features.add('delta')
                    if key == 'detailOnly': features.add('drilldowns')
                    visit(item)
            elif isinstance(value, list):
                for item in value: visit(item)
        if any(isinstance(node, dict) and node.get('detail') for node in d.get('nodes', {}).values()): features.add('drilldowns')
        visit(sec)
    return panels, features


def generate(panel_names, feature_names, mode='new', raw=None):
    contract = (ROOT / CONTRACT).read_text()
    card, intro, tail, blocks = load_sections(contract)
    explicit_panels, explicit_features = set(panel_names), set(feature_names)
    inferred_panels, inferred_features = infer(raw) if raw is not None else (set(), set())
    panels, features = explicit_panels | inferred_panels, explicit_features | inferred_features
    unknown = (panels - blocks.keys()) | (features - FEATURES.keys())
    if unknown: raise ValueError('Unknown selection: ' + ', '.join(sorted(unknown)))
    if panels: features.update(['visibility', 'icons'])
    if panels & {'battery', 'deviceapp', 'phone', 'appscreens'}: features.add('time')
    while True:
        expanded = features | {dep for feature in features for dep in DEPENDENCIES.get(feature, [])}
        if expanded == features: break
        features = expanded
    parts, provenance, loaded = [], [], {}
    def add(path, heading=None, content=None):
        if path not in loaded: loaded[path] = (ROOT / path).read_text()
        text = content if content is not None else section(loaded[path], heading) if heading else loaded[path].strip()
        text = normalize_links(text, path)
        parts.append('<!-- Source: ' + path + (' # ' + heading if heading else '') + ' -->\n' + text)
        provenance.append({'path': path, 'section': heading, 'sha256': hashlib.sha256(loaded[path].encode()).hexdigest(), 'characters': len(text), 'bytes': len(text.encode())})
    add(SKILL, 'Scoped exceptions and handoff')
    if mode == 'new':
        add(SKILL, 'Phase 1: Inventory the source')
        add(SKILL, 'Phase 2: Ask the operator (bounded batches, wait after each)')
    add(SKILL, 'Phase 7: Deliver')
    add(REFS + 'honesty-rules.md')
    add(REFS + 'evidence-and-updates.md', 'Fidelity and provenance')
    for title in COMMON: add(CONTRACT, title)
    for feature in sorted(features):
        for title in FEATURES[feature]: add(CONTRACT, title)
        for path in INLINE.get(feature, []): add(path)
    if 'layouts' in features:
        for title in ['Spec contract', 'Named-layout fields', 'Paths shown in each view', 'Steps shown in each view']:
            add('docs/section-layouts.md', title)
    if 'explore' in features: add('docs/section-layouts.md', 'Explore presentation')
    if panels:
        if panels & set(CLIP_CUE_TYPES):
            add('tools/widget_doc.py', content=CLIP_CUE)
        add(CONTRACT, 'panels — declaration mechanics', intro)
        for panel in sorted(panels): add(CONTRACT, 'panel: ' + panel, blocks[panel])
        add(CONTRACT, 'panels — sparse patch mechanics', tail)
    routes = {'docs/visibility-evidence.md', 'docs/auto-arrange.md', REFS + 'recipe-routing.md'}
    if mode == 'new': routes.update({REFS + 'storyboard-worksheet.md', REFS + 'worked-example.md'})
    routes.update(path for feature in features for path in ROUTES.get(feature, []))
    # The maintained route table gives examples without embedding the cookbook.
    routes.add('cookbook/README.md')
    route_text = '\n'.join('- `' + path + '`' for path in sorted(routes) if (ROOT / path).exists())
    document = '# Focused authoring packet\n\nMode: ' + mode + '. Selection is the union of explicit choices and spec inference.\n\nPanels: ' + (', '.join(sorted(panels)) or 'none') + '. Features: ' + (', '.join(sorted(features)) or 'none') + '.\n\nRead these extracted rules instead of loading the full contract and cookbook. Follow the active collaboration protocol for candidate approval; a packet does not grant publication or new story decisions. Fully specified small edits retain the scoped-edit exception below. Full documentation remains available on demand; source paths and relative links resolve from VIZ, not the packet output folder.\n\n' + '\n\n'.join(parts) + '\n\n## On-demand routes and examples\n\n' + route_text + '\n'
    baseline_paths = [CONTRACT, SKILL, REFS + 'worked-example.md', 'cookbook/README.md']
    baseline = '\n\n'.join((ROOT / path).read_text() for path in baseline_paths)
    metadata = {'version': 1, 'mode': mode, 'selectionPolicy': 'union; explicit selections never narrow inferred requirements',
                'explicit': {'panels': sorted(explicit_panels), 'features': sorted(explicit_features)},
                'inferred': {'panels': sorted(inferred_panels), 'features': sorted(inferred_features)},
                'selected': {'panels': sorted(panels), 'features': sorted(features)}, 'provenance': provenance,
                'size': {'unit': 'document size, not model tokens or cost savings', 'characters': len(document), 'bytes': len(document.encode()),
                         'baselinePaths': baseline_paths, 'baselineCharacters': len(baseline), 'baselineBytes': len(baseline.encode())}}
    return document, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', action='append', default=[])
    parser.add_argument('--feature', choices=sorted(FEATURES), action='append', default=[])
    parser.add_argument('--mode', choices=['new', 'edit'], default='new')
    parser.add_argument('--spec', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    try:
        if args.out and args.spec and args.out.resolve() in (args.spec.resolve(),):
            raise ValueError('Output must not overwrite the input spec')
        document, metadata = generate(args.panel, args.feature, args.mode, json.loads(args.spec.read_text()) if args.spec else None)
        if args.out:
            metadata_path = Path(str(args.out) + '.json')
            if args.spec and metadata_path.resolve() == args.spec.resolve(): raise ValueError('Metadata must not overwrite the input spec')
            args.out.write_text(document); metadata_path.write_text(json.dumps(metadata, indent=2) + '\n')
        else:
            sys.stdout.write(document); sys.stderr.write(json.dumps(metadata, indent=2) + '\n')
        return 0
    except (ValueError, OSError) as error:
        print('authoring-packet: ' + str(error), file=sys.stderr); return 2

if __name__ == '__main__':
    sys.exit(main())
