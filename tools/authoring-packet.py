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
from company_overlay import company_agent_context, contract_text

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = 'contract/authoring-contract.md'
SKILL = '.claude/skills/hld-to-page/SKILL.md'
REFS = '.claude/skills/hld-to-page/references/'
WORKFLOW = REFS + 'authoring-workflow.md'
COMMON = ['Output rules', 'Top-level shape', 'Section-owned Views', 'Section shape', 'Diagram object',
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
    'traces': [], 'metrics': [], 'bindings': [], 'topology': ['Shared topology references'], 'drilldowns': [],
}
DEPENDENCIES = {'traces': ['steps'], 'time': ['steps'], 'paths': ['steps'], 'reveals': ['steps'],
                'visibility': ['steps'], 'audio': ['steps'], 'delta': ['steps'],
                'drilldowns': ['layouts'], 'explore': ['layouts']}
ROUTES = {
    'traces': ['docs/trace-ready-authoring.md', 'docs/provider-traces.md', 'docs/trace-connections.md'],
    'metrics': ['docs/live-status.md', '.claude/skills/live-status-board/metrics.md'],
    'layouts': ['docs/tab-views.md', 'docs/section-layouts.md'], 'explore': ['docs/tab-views.md', 'docs/section-layouts.md'],
    'bindings': [REFS + 'bindings-and-code.md'],
    'topology': ['docs/shared-topology.md'],
    'drilldowns': ['docs/drilldowns.md'],
    'time': ['docs/step-time.md', REFS + 'panel-time-and-icons.md'],
    'paths': [REFS + 'story-planning.md'],
}
# For dependencies whose rules are not in the contract, embed their maintained
# owner instead of writing a second set of rules here.
INLINE = {'traces': ['docs/trace-ready-authoring.md', 'docs/trace-connections.md'],
          'metrics': ['.claude/skills/live-status-board/metrics.md'],
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


def read_document(path):
    """Maintained text; the contract includes company/contract fragments."""
    return contract_text(ROOT) if path == CONTRACT else (ROOT / path).read_text()


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
    page = raw.get('page', raw) if isinstance(raw, dict) else {}
    owners = [page] + [tab for block in page.get('blocks', page.get('sections', []))
                       if isinstance(block, dict) for tab in block.get('tabs', [])]
    owners += [sec for owner in owners if isinstance(owner, dict) for sec in owner.get('sections', owner.get('blocks', [])) if isinstance(sec, dict) and 'tabs' not in sec]
    for owner in owners:
        views = owner.get('views') if isinstance(owner, dict) else None
        if isinstance(views, list):
            features.add('layouts')
            if any(isinstance(view, dict) and view.get('presentation') == 'explore' for view in views):
                features.add('explore')
    for sec in json.loads(process.stdout):
        d = sec.get('diagram') or {}
        panels.update(p['type'] for p in d.get('panels', []))
        for key, feature in [('steps', 'steps'), ('paths', 'paths'), ('storyTime', 'time'),
                             ('layouts', 'layouts'), ('sectionLayout', 'layouts'),
                             ('groups', 'groups'), ('topology', 'topology')]:
            if d.get(key): features.add(feature)
        if any(view.get('presentation') == 'explore' for view in d.get('layouts', []) if isinstance(view, dict)): features.add('explore')
        if sec.get('contract') or sec.get('contracts') or any('contract' in e for e in d.get('edges', []) if isinstance(e, dict)) or any('contracts' in step for step in d.get('steps', []) if isinstance(step, dict)): features.add('contracts')
        def visit(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in ('binding', 'codeRefs'): features.add('bindings')
                    if key in ('topologyImports', 'topologyExports', 'topologyProvenance'): features.add('topology')
                    if key in ('revealAt', 'hideAt'): features.add('reveals')
                    if key == 'panelVisibility' or key == 'visible': features.add('visibility')
                    if key in ('audio', 'spotlight', 'alarm'): features.add('audio')
                    if key in ('traceMatch', 'traceConnections'): features.add('traces')
                    if key == 'delta': features.add('delta')
                    if key == 'detailOnly': features.add('drilldowns')
                    visit(item)
            elif isinstance(value, list):
                for item in value: visit(item)
        if any(isinstance(node, dict) and node.get('detail') for node in d.get('nodes', {}).values()): features.add('drilldowns')
        visit(sec)
    # Authored roots, provider templates, imported carrier overlays and nested
    # details all count, even before local topology imports have been resolved.
    def metrics(value):
        if isinstance(value, dict):
            return 'telemetry' in value or any(metrics(item) for item in value.values())
        return isinstance(value, list) and any(metrics(item) for item in value)
    if metrics(raw): features.add('metrics')
    return panels, features


def generate(panel_names, feature_names, mode='new', raw=None):
    contract = read_document(CONTRACT)
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
    company_context = company_agent_context(ROOT)
    if company_context.get('traceConnections'):
        parts.append('## Company direct trace profiles\n\n' +
                     json.dumps(company_context['traceConnections'], sort_keys=True) +
                     '\n\nThese are non-secret configuration defaults, not permission, inherited only by boards that use traces (a traceMatch step, or a live-status panel on a page with telemetry). Restrict profiles at '
                     '`page.tracking.telemetry.traceConnections`; use {} to disable direct loading. See the trace connections handoff contract.')
    if company_context.get('awsAccounts'):
        parts.append('## Company AWS account defaults\n\n' +
                     json.dumps(company_context['awsAccounts'], sort_keys=True) +
                     '\n\nUse existing `${alias}` variables in telemetry signal fields. The board owns '
                     'environment profiles and selection. Defaults apply only to the selected environment; '
                     'shared board variables override them, then profile variables override shared values. '
                     'Account IDs are configuration context, not authentication.')
    if company_context.get('backstage'):
        parts.append('## Company Backstage context\n\nBackstage base URL: ' +
                     json.dumps(company_context['backstage']['baseUrl']) +
                     '\n\nThis is the public Backstage UI base URL, including any deployment subpath. '
                     'Use it as link context; it does not identify a catalog entity, supply authentication '
                     'or grant access. Preserve explicit entity references and source URLs.')
    def add(path, heading=None, content=None):
        if path not in loaded: loaded[path] = read_document(path)
        text = content if content is not None else section(loaded[path], heading) if heading else loaded[path].strip()
        text = normalize_links(text, path)
        parts.append('<!-- Source: ' + path + (' # ' + heading if heading else '') + ' -->\n' + text)
        provenance.append({'path': path, 'section': heading, 'sha256': hashlib.sha256(loaded[path].encode()).hexdigest(), 'characters': len(text), 'bytes': len(text.encode())})
    add(WORKFLOW, 'Scoped exceptions and handoff')
    add(WORKFLOW, 'The rules that matter most')
    if mode == 'new':
        add(WORKFLOW, 'Phase 1: Inventory the source')
        add(REFS + 'evidence-and-updates.md', 'Coverage ledger')
        add(WORKFLOW, 'Phase 2: Ask the operator (bounded batches, wait after each)')
        add(WORKFLOW, 'Phase 3: Fill the storyboard worksheet')
    add(WORKFLOW, 'Phase 4: Translate the worksheet into a spec')
    add(WORKFLOW, 'Phase 5: Validate and preview')
    add(WORKFLOW, 'Phase 6: Self-audit against the worksheet')
    add('docs/visibility-evidence.md', 'Required author evidence before proposing')
    add('docs/visibility-evidence.md', 'Expectation format and eligibility')
    add(WORKFLOW, 'Phase 7: Deliver')
    add(REFS + 'honesty-rules.md')
    add(REFS + 'evidence-and-updates.md', 'Fidelity and provenance')
    for title in COMMON: add(CONTRACT, title)
    for feature in sorted(features):
        for title in FEATURES[feature]: add(CONTRACT, title)
        for path in INLINE.get(feature, []): add(path)
    if 'layouts' in features:
        for title in ['Section arrangement contract', 'Named-layout fields', 'Paths shown in each view', 'Steps shown in each view']:
            add('docs/section-layouts.md', title)
    if 'explore' in features: add('docs/section-layouts.md', 'Explore presentation')
    if panels:
        if panels & set(CLIP_CUE_TYPES):
            add('tools/widget_doc.py', content=CLIP_CUE)
        add(CONTRACT, 'panels — declaration mechanics', intro)
        for panel in sorted(panels): add(CONTRACT, 'panel: ' + panel, blocks[panel])
        add(CONTRACT, 'panels — sparse patch mechanics', tail)
    routes = {'docs/visibility-evidence.md', 'docs/auto-arrange.md',
              REFS + 'bindings-and-code.md', REFS + 'recipe-routing.md'}
    if mode == 'new': routes.update({REFS + 'storyboard-worksheet.md', REFS + 'worked-example.md'})
    routes.update(path for feature in features for path in ROUTES.get(feature, []))
    # The maintained route table gives examples without embedding the cookbook.
    routes.add('cookbook/README.md')
    route_text = '\n'.join('- `' + path + '`' for path in sorted(routes) if (ROOT / path).exists())
    if 'metrics' in features:
        parts.append('## Metrics source quick reference\n\ngrafana (PromQL), loki (LogQL), tempo (one TraceQL request), sql (hourly scalar), honeycomb (one scalar, no breakdowns), cloudwatch (window statistics plus period series; weighted Average), cloudwatchLogs (independent scalar, trend and grouped details). Author parse/stats queries; select text fields explicitly. Live status shows details, card keeps scalar. Numeric Over time includes Today and Honeycomb; SQL requires authored time macros. Trace history stays unavailable. Named profile variables resolve once in all signal strings; missing values block affected queries. Trace bindings never count as numeric metrics. PROVEN needs an observed authored traffic minimum and passing limits; per-time units alone are insufficient. CloudWatch empty means no data points yet unless missingMeansZero is true; errors never mean zero. Inspect uses the active environment Evidence heading. Cards/Inspect show every numeric signal; optional label (1–120 plain-text characters) and signal.links.query provide names and safe source links. showOnCard:false hides a canvas row only; Inspect/proof retain it. Cards keep scope short; Inspect retains full scope. Provider URLs remain per signal; preview invents none. Read the selected metrics route for exact contracts.')
    document = '# Focused authoring packet\n\nMode: ' + mode + '. Selection is the union of explicit choices and spec inference.\n\nPanels: ' + (', '.join(sorted(panels)) or 'none') + '. Features: ' + (', '.join(sorted(features)) or 'none') + '.\n\nThis packet is the primary authoring guidance: use its selected rules instead of preloading the full workflow, contract, cookbook or session manual. Linked references are on demand unless this packet names a needed worksheet/source route. Follow the active collaboration protocol for candidate approval; a packet does not grant publication or new story decisions. Fully specified small edits retain the scoped-edit exception below. Full documentation remains available on demand; source paths and relative links resolve from VIZ, not the packet output folder.\n\n' + '\n\n'.join(parts) + '\n\n## On-demand routes and examples\n\n' + route_text + '\n'
    baseline_paths = [CONTRACT, SKILL, WORKFLOW, REFS + 'worked-example.md', 'cookbook/README.md']
    baseline = '\n\n'.join(read_document(path) for path in baseline_paths)
    metadata = {'version': 1, 'mode': mode, 'selectionPolicy': 'union; explicit selections never narrow inferred requirements',
                'explicit': {'panels': sorted(explicit_panels), 'features': sorted(explicit_features)},
                'inferred': {'panels': sorted(inferred_panels), 'features': sorted(inferred_features)},
                'selected': {'panels': sorted(panels), 'features': sorted(features)}, 'provenance': provenance,
                'size': {'unit': 'document size, not model tokens or cost savings', 'characters': len(document), 'bytes': len(document.encode()),
                         'baselinePaths': baseline_paths, 'baselineCharacters': len(baseline), 'baselineBytes': len(baseline.encode())}}
    if company_context:
        metadata['companyContext'] = company_context
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
