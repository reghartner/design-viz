import base64
import gzip
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
spec = importlib.util.spec_from_file_location('authoring_packet', ROOT / 'tools/authoring-packet.py')
packet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packet)
from folder_agent_kit import folder_agent_kit


def simple_spec():
    return {'page': {'sections': [{'id': 'story', 'heading': 'Story', 'diagram': {
        'nodes': {'n': {'title': 'Device'}}, 'rows': [['n']],
        'panels': [{'id': 'app', 'type': 'deviceapp', 'fields': [{'id': 'battery', 'kind': 'battery'}],
                    'initial': {'phoneScreen': 'home', 'battery': {'value': 20, 'icon': 'battery-low'}}}],
        'steps': [{'id': 'open', 'text': 'Open', 'panels': {'app': {'phoneScreen': 'app'}}}]}}]}}


def temporary_checkout(case, fragments, kit=False):
    """A temporary checkout: upstream files linked in (never this checkout's company/ folder, so
    the tests hold in a fork too), plus company/contract fragments; None: no company/ folder.
    kit: a portable folder-agent kit instead, whose contract already carries the fragments and
    which has no company/ folder."""
    directory = tempfile.TemporaryDirectory(prefix='flowview-company-rules-'); case.addCleanup(directory.cleanup)
    root = Path(directory.name)
    for entry in ROOT.iterdir():
        if entry.name not in ('company', 'contract', '.git', '.worktrees', '.local', 'node_modules'):
            (root / entry.name).symlink_to(entry)
    (root / 'contract').mkdir()
    for entry in (ROOT / 'contract').iterdir():
        if entry.name != 'authoring-contract.md': (root / 'contract' / entry.name).symlink_to(entry)
    if fragments is not None: (root / 'company/contract').mkdir(parents=True)
    for name, text in (fragments or {}).items(): (root / 'company/contract' / name).write_text(text)
    (root / packet.CONTRACT).write_text((ROOT / packet.CONTRACT).read_text())
    if kit:
        (root / packet.CONTRACT).write_text(packet.contract_text(root))
        for name in fragments: (root / 'company/contract' / name).unlink()
        (root / 'company/contract').rmdir(); (root / 'company').rmdir()
    original = packet.ROOT; packet.ROOT = root; case.addCleanup(setattr, packet, 'ROOT', original)
    return root


class AuthoringPacketTests(unittest.TestCase):
    def assert_local_links_resolve(self, text, root):
        count = 0
        for match in packet.MARKDOWN_LINK.finditer(text):
            destination = match[2].strip('<>')
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', destination) or destination.startswith('//'):
                continue
            path = destination.split('#')[0].split('?')[0]
            self.assertTrue((root / path).is_file(), destination)
            count += 1
        self.assertGreater(count, 20)

    def test_metrics_packet_infers_templates_and_imported_overlays_and_ships_offline_routes(self):
        for telemetry in ({'tracking': {'telemetry': {'templates': {'new_queue': {'signals': {'lag': {'grafana': 'lag'}}}}}}},
                          {'sections': [{'id': 'main', 'diagram': {'nodes': {}, 'rows': [], 'topologyImports': [{'id': 'shared', 'overrides': {'nodes': {'queue': {'telemetry': {'signals': {'lag': {'grafana': 'lag'}}}}}}}]}}]}):
            raw = {'page': {'title': 'Feature board', 'sections': [], **telemetry}}
            self.assertIn('metrics', packet.infer(raw)[1])
        text, meta = packet.generate([], ['metrics'], mode='edit')
        self.assertIn('Jira', text)
        self.assertIn('instrumentation', text)
        self.assertIn('queues', text)
        for source in ('grafana', 'loki', 'tempo', 'sql', 'honeycomb', 'cloudwatch', 'cloudwatchLogs'):
            self.assertIn('`' + source + '`', text)
        self.assertIn('query_cloudwatch', text)
        self.assertIn('grafana.accountId', text)
        self.assertIn('.claude/skills/live-status-board/metrics.md', [p['path'] for p in meta['provenance']])
        kit = json.loads(folder_agent_kit(ROOT, '// test runtime'))
        files = json.loads(gzip.decompress(base64.b64decode(kit['gzip'])))['files']
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, value in files.items():
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(value)
            self.assert_local_links_resolve(text, root)

    def test_traces_route_is_explicit_and_inferred_from_local_and_imported_selectors(self):
        raw = simple_spec()
        raw['page']['sections'][0]['diagram']['steps'][0]['traceMatch'] = {'serviceName': 'api', 'operation': 'send', 'nodeId': 'n'}
        self.assertIn('traces', packet.infer(raw)[1])
        raw['page']['sections'][0]['diagram']['steps'][0]['traceMatch']['nodeId'] = 'shared::n'
        raw['page']['sections'][0]['diagram']['topologyImports'] = [{'spec': 'provider', 'export': 'core', 'as': 'shared'}]
        self.assertIn('traces', packet.infer(raw)[1])
        text, meta = packet.generate([], ['traces'], mode='edit')
        self.assertIn('steps', meta['selected']['features'])
        self.assertIn('docs/trace-ready-authoring.md', [p['path'] for p in meta['provenance']])
        self.assertIn('Ordinary Status Trace mode requires no', text)
        self.assertIn('Never flatten imports', text)

    def test_portable_trace_mapper_runs_real_normal_partial_and_ambiguous_examples_without_source(self):
        runtime = (ROOT / 'tools/canon/generated-runtime.cjs').read_text()
        bundle = json.loads(folder_agent_kit(ROOT, runtime))
        files = json.loads(gzip.decompress(base64.b64decode(bundle['gzip'])))['files']
        with tempfile.TemporaryDirectory() as temp:
            kit = Path(temp)
            for name, content in files.items():
                path = kit / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content)
            self.assertFalse((kit / 'src/core').exists())
            source = kit / 'examples/trace-ready/existing.spec.json'
            before = source.read_bytes()
            for name, status in [('normal', 'matched'), ('partial', 'missing'), ('ambiguous', 'ambiguous')]:
                evidence = kit / ('examples/trace-ready/' + name + '.json')
                original = evidence.read_bytes()
                run = subprocess.run(['node', 'tools/canon/trace-cli.mjs', 'preview', '--spec', str(source), '--trace', str(evidence)], cwd=kit, text=True, capture_output=True)
                self.assertEqual(run.returncode, 0, run.stderr)
                result = json.loads(run.stdout)
                self.assertEqual([r['status'] for r in result['mapping']['steps']], ['matched', status])
                self.assertEqual(result['eligible'], name == 'normal')
                self.assertEqual(evidence.read_bytes(), original)
            self.assertEqual(source.read_bytes(), before)
            # Resolve direct and nested provider nodes in memory with --resolve-imports.
            def canonical(identity, diagram):
                return {'page': {'title': identity, 'canon': {'version': 1, 'id': identity, 'kind': 'canonical', 'owner': 'group:default/fixture'}, 'sections': [{'diagram': diagram}]}}
            provider = canonical('provider', {'nodes': {'store': {'title': 'Record store'}}, 'rows': [['store']], 'topologyExports': {'core': {'nodes': ['store'], 'edges': []}}})
            middle = canonical('middle', {'nodes': {}, 'rows': [], 'topologyImports': [{'spec': 'provider', 'export': 'core', 'as': 'inner'}], 'topologyExports': {'core': {'nodes': ['inner::store'], 'edges': []}}})
            for name, value in [('provider', provider), ('middle', middle)]:
                (kit / (name + '.json')).write_text(json.dumps(value))
            registry = kit / 'registry.json'
            registry.write_text(json.dumps({'version': 1, 'diagrams': [{'id': name, 'path': name + '.json'} for name in ['provider', 'middle']]}))
            for nested in [False, True]:
                raw = json.loads(before)
                d = raw['page']['sections'][0]['diagram']
                node = 'shared::inner::store' if nested else 'shared::store'
                del d['nodes']['store']; d['rows'] = [['client', 'api']]
                d['topologyImports'] = [{'spec': 'middle' if nested else 'provider', 'export': 'core', 'as': 'shared'}]
                d['edges'][1]['to'] = node
                d['steps'][1]['edge'] = 'api->' + node; d['steps'][1]['traceMatch']['nodeId'] = node
                authored = kit / 'imported.json'; authored.write_text(json.dumps(raw)); saved = authored.read_bytes()
                mapped = subprocess.run(['node', 'tools/canon/trace-cli.mjs', 'preview', '--spec', str(authored), '--resolve-imports', str(registry), '--trace', 'examples/trace-ready/normal.json'], cwd=kit, text=True, capture_output=True)
                self.assertEqual(mapped.returncode, 0, mapped.stderr)
                rows = json.loads(mapped.stdout)['mapping']['steps']
                self.assertEqual(rows[1]['nodeId'], node); self.assertEqual(rows[1]['status'], 'matched')
                self.assertEqual(authored.read_bytes(), saved)
            output = kit / 'trace-packet.md'
            run = subprocess.run([sys.executable, 'tools/authoring-packet.py', '--spec', str(source), '--mode', 'edit', '--out', str(output)], cwd=kit, text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertIn('docs/trace-ready-authoring.md', output.read_text())
            self.assert_local_links_resolve(output.read_text(), kit)

    def test_portable_trace_mapper_maps_the_declared_spans_example(self):
        # #1290 PR 10: examples/trace-ready/declared.spec.json declares the spans on the nodes
        # (trace.spans) instead of step traceMatch; its steps inherit them, one narrowed by a
        # traceScope parent step. It travels in the folder kit, validates, and maps the normal trace.
        runtime = (ROOT / 'tools/canon/generated-runtime.cjs').read_text()
        bundle = json.loads(folder_agent_kit(ROOT, runtime))
        files = json.loads(gzip.decompress(base64.b64decode(bundle['gzip'])))['files']
        self.assertIn('examples/trace-ready/declared.spec.json', files)
        with tempfile.TemporaryDirectory() as temp:
            kit = Path(temp)
            for name, content in files.items():
                path = kit / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content)
            source = kit / 'examples/trace-ready/declared.spec.json'
            raw = json.loads(source.read_text())
            d = raw['page']['sections'][0]['diagram']
            self.assertFalse(any('traceMatch' in step for step in d['steps']), 'the steps inherit; no traceMatch')
            self.assertEqual(sorted(k for k, n in d['nodes'].items() if 'trace' in n), ['api', 'store'])
            checked = subprocess.run(['node', 'tools/validate.js', str(source)], cwd=kit, text=True, capture_output=True)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            run = subprocess.run(['node', 'tools/canon/trace-cli.mjs', 'preview', '--spec', str(source), '--trace', 'examples/trace-ready/normal.json'], cwd=kit, text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            rows = json.loads(run.stdout)['mapping']['steps']
            self.assertEqual([(r['stepId'], r['status']) for r in rows], [('receive', 'matched'), ('persist', 'matched')])

    def test_handoff_contract_and_migration_travel_in_packets_and_folder_kit(self):
        text, _ = packet.generate([], [])
        self.assertIn('`spec` is required; `handoff.url` is removed and rejected', text)
        kit = json.loads(folder_agent_kit(ROOT, '// test runtime'))
        files = json.loads(gzip.decompress(base64.b64decode(kit['gzip'])))['files']
        for name in ('contract/authoring-contract.md', 'cookbook/diagram-handoffs.md',
                     '.claude/skills/hld-to-page/references/authoring-details.md'):
            self.assertIn('`handoff.url` is removed', files[name])
        self.assertIn('Backstage 2.0.0', files['.claude/skills/hld-to-page/references/integrations.md'])

    def test_all_emitted_links_resolve_from_viz_and_preserve_anchors_and_external_urls(self):
        types = packet.load_sections(packet.read_document(packet.CONTRACT))[3]
        text, _ = packet.generate(types, packet.FEATURES)
        self.assert_local_links_resolve(text, ROOT)
        self.assertIn('(docs/shared-icons.md#icon-ids)', text)
        self.assertIn('(.claude/skills/hld-to-page/references/evidence-and-updates.md)', text)
        original = '[local](../docs/tour.md#steps) [external](https://example.com/a#b) [anchor](#part)\n```md\n[code](../unchanged.md)\n```'
        normalized = packet.normalize_links(original, 'contract/authoring-contract.md')
        self.assertIn('[local](docs/tour.md#steps)', normalized)
        self.assertIn('[external](https://example.com/a#b)', normalized)
        self.assertIn('[anchor](contract/authoring-contract.md#part)', normalized)
        self.assertIn('[code](../unchanged.md)', normalized)

    def test_deterministic_selection_extracts_owned_contract_and_dependencies(self):
        first = packet.generate(['screen', 'deviceapp'], ['paths', 'layouts'])
        second = packet.generate(['deviceapp', 'screen', 'deviceapp'], ['layouts', 'paths'])
        self.assertEqual(first, second)
        text, meta = first
        for name in ('deviceapp', 'screen'):
            self.assertIn('- `' + name + '` ', text)
        self.assertNotIn('\n- `thermo` ', text)
        self.assertNotIn('## Complete example', text)
        self.assertTrue({'steps', 'time', 'visibility', 'icons', 'paths', 'layouts'} <= set(meta['selected']['features']))
        self.assertLess(meta['size']['bytes'], meta['size']['baselineBytes'] * .6)
        self.assertEqual(meta['size']['bytes'], len(text.encode()))
        self.assertEqual(meta['size']['characters'], len(text))
        baseline = '\n\n'.join(packet.read_document(name) for name in meta['size']['baselinePaths'])
        self.assertEqual(meta['size']['baselineBytes'], len(baseline.encode()))
        self.assertEqual(meta['size']['baselineCharacters'], len(baseline))
        for entry in meta['provenance']:
            self.assertTrue((ROOT / entry['path']).is_file())
            self.assertEqual(entry['sha256'], hashlib.sha256(packet.read_document(entry['path']).encode()).hexdigest())

    def test_entry_packet_carries_required_workflow_without_full_reference_preload(self):
        for mode in ('new', 'edit'):
            text, meta = packet.generate(['state'], ['steps'], mode=mode)
            sources = [(item['path'], item['section']) for item in meta['provenance']]
            self.assertIn((packet.WORKFLOW, 'The rules that matter most'), sources)
            audit_heading = 'Phase 6: Self-audit against the worksheet'
            self.assertIn((packet.WORKFLOW, audit_heading), sources)
            audit = packet.normalize_links(packet.section((ROOT / packet.WORKFLOW).read_text(), audit_heading), packet.WORKFLOW)
            self.assertIn(audit, text)  # Preserve the whole maintained audit, not just its route/title.
            for requirement in ('full folded state at every step', 'check all panels for stale',
                                'worksheet sections C to I and ledger rows',
                                'Every edge kind, tone, notification, icon, value, number, link',
                                'must trace to a ledger row', 'audit the affected paths through all inherited steps'):
                self.assertIn(requirement, audit)
            self.assertNotIn((packet.REFS + 'self-audit.md', None), sources)

            self.assertIn(('docs/visibility-evidence.md', 'Required author evidence before proposing'), sources)
            self.assertIn(('docs/visibility-evidence.md', 'Expectation format and eligibility'), sources)
            self.assertNotIn((packet.WORKFLOW, None), sources)
            self.assertNotIn((packet.REFS + 'worked-example.md', None), sources)
            self.assertNotIn((packet.REFS + 'use-case-honeycomb.md', None), sources)
            self.assertEqual((packet.WORKFLOW, 'Phase 3: Fill the storyboard worksheet') in sources, mode == 'new')
            for requirement in ('Never re-ask supplied facts', 'Retain source-required icons',
                                'compose-page-layout.cjs', 'occlusion and legibility unverified',
                                'N/A to automated', 'spec_walk.py', 'visibility-check.cjs'):
                if mode == 'edit' and requirement == 'Never re-ask supplied facts':
                    self.assertIn('do not\n   ask the operator to repeat or approve them', text)
                else:
                    self.assertIn(requirement, text)
            self.assertNotIn('Install the locked', text)
            self.assertLess(len((ROOT / packet.SKILL).read_text()), 6000)

    def test_reference_discovery_is_routed_without_inlining_for_unbound_nodes(self):
        raw = {'page': {'sections': [{'id': 'flow', 'diagram': {
            'nodes': {'person': {'title': 'Operator'}, 'service': {'title': 'Orders'}},
            'rows': [['person', 'service']]}}]}}
        for mode in ('new', 'edit'):
            text, meta = packet.generate([], [], mode=mode, raw=raw)
            sources = [(item['path'], item['section']) for item in meta['provenance']]
            self.assertIn((packet.WORKFLOW, 'The rules that matter most'), sources)
            self.assertNotIn((packet.REFS + 'bindings-and-code.md', None), sources)
            self.assertIn('`.claude/skills/hld-to-page/references/bindings-and-code.md`', text)
        core = packet.section((ROOT / packet.WORKFLOW).read_text(), 'The rules that matter most')
        self.assertIn('For any diagram with nodes', core)
        self.assertIn('Record applicability', core)

    def test_reference_discovery_route_stays_within_packet_growth_budget(self):
        # Baselines captured from exact origin/main before the guidance change.
        # Portable document-link schema and its recipe pointer add at most 512 bytes.
        # Preset node styles (#610) add one `style` field bullet: at most 384 bytes.
        # Explore-only placement guidance in the common View contract adds at most 512 bytes.
        # Reader-facing rules from human reviewers (#831) add at most 4,608 bytes.
        budgets = {'new': 78_744 + 1_024 + 512 + 384 + 512 + 4_608,
                   'edit': 67_458 + 1_024 + 512 + 384 + 512 + 4_608}
        # Upstream budget: measured without this checkout's company/ folder, since a fork's
        # Company rules and company context are outside it.
        temporary_checkout(self, None)
        for mode, maximum in budgets.items():
            text, _ = packet.generate([], [], mode=mode)
            self.assertLessEqual(len(text.encode()), maximum)

    def test_edge_json_contracts_infer_the_wire_contract_reference(self):
        raw = {'page': {'sections': [{'diagram': {
            'nodes': {'a': {}, 'b': {}}, 'rows': [['a', 'b']],
            'edges': [{'from': 'a', 'to': 'b', 'contract': {'json': None}}]}}]}}
        text, meta = packet.generate([], [], mode='edit', raw=raw)
        self.assertIn('contracts', meta['inferred']['features'])
        self.assertIn('step.contracts', text)

    def test_no_node_story_does_not_require_technical_source_questions(self):
        raw = {'page': {'sections': [{'id': 'story', 'heading': 'Story',
                                      'text': ['A business narrative.']}]}}
        text, meta = packet.generate([], [], mode='new', raw=raw)
        self.assertEqual(meta['inferred']['features'], [])
        self.assertIn('A story with no diagram nodes needs no technical source\nquestion.', text)

    def test_explicit_bindings_still_inlines_detailed_owner_once(self):
        _, meta = packet.generate([], ['bindings'], mode='new')
        sources = [(item['path'], item['section']) for item in meta['provenance']]
        self.assertEqual(sources.count((packet.REFS + 'bindings-and-code.md', None)), 1)

    def test_inference_unions_explicit_selection_and_handles_topology_without_resolving(self):
        raw = simple_spec()
        d = raw['page']['sections'][0]['diagram']
        d['topologyImports'] = [{'spec': 'platform', 'export': 'core', 'as': 'platform'}]
        d['nodes']['n']['binding'] = {'entityRef': 'component:default/device'}
        d['paths'] = [{'id': 'happy', 'steps': ['open']}]
        before = json.dumps(raw)
        text, meta = packet.generate(['state'], [], mode='edit', raw=raw)
        self.assertEqual(meta['selected']['panels'], ['deviceapp', 'state'])
        self.assertTrue({'topology', 'bindings', 'paths', 'steps', 'time'} <= set(meta['selected']['features']))
        self.assertIn('docs/shared-topology.md', [x['path'] for x in meta['provenance']])
        self.assertNotIn('## Phase 2: Ask the operator', text)
        self.assertIn('**Small edits.**', text)
        self.assertEqual(json.dumps(raw), before)

    def test_tab_views_infer_presentation_without_section_layouts(self):
        raw = {'page': {'sections': [{'id': 'notes', 'text': ['Notes']}],
                        'views': [{'id': 'canvas', 'name': 'Canvas', 'presentation': 'explore', 'sections': ['notes']}]}}
        text, meta = packet.generate([], [], mode='edit', raw=raw)
        self.assertTrue({'layouts', 'explore'} <= set(meta['selected']['features']))
        self.assertIn('## Section-owned Views', text)
        self.assertIn('docs/tab-views.md', text)

    def test_unknown_selection_and_output_collision_fail_without_mutating_source(self):
        with self.assertRaisesRegex(ValueError, 'Unknown selection'):
            packet.generate(['future-widget'], [])
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'story.json'; source.write_text(json.dumps(simple_spec()))
            before = source.read_bytes()
            result = subprocess.run([sys.executable, str(ROOT / 'tools/authoring-packet.py'), '--spec', str(source), '--out', str(source)], capture_output=True)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(source.read_bytes(), before)

    def test_source_free_kit_packet_and_visibility_need_no_browser_or_source_checkout(self):
        runtime = (ROOT / 'tools/canon/generated-runtime.cjs').read_text()
        bundle = json.loads(folder_agent_kit(ROOT, runtime))
        files = json.loads(gzip.decompress(base64.b64decode(bundle['gzip'])))['files']
        with tempfile.TemporaryDirectory() as temp:
            kit = Path(temp)
            for name, content in files.items():
                path = kit / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content)
            self.assertFalse((kit / 'src/source-bundles.json').exists())
            self.assertFalse((kit / 'node_modules').exists())
            self.assertFalse((kit / 'tools/browser-tests').exists())
            source = kit / 'story.json'; source.write_text(json.dumps(simple_spec()))
            expect = kit / 'expect.json'; expect.write_text(json.dumps({'version': 1, 'expectations': [{'section': 'story', 'view': 'flow', 'path': 'happy', 'step': 'open', 'panel': 'app', 'field': 'battery', 'visible': True}]}))
            result = subprocess.run(['node', str(kit / 'tools/visibility-check.cjs'), str(source), str(expect)], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertTrue(json.loads(result.stdout)['ok'])
            for hidden_state in ({'phoneScreen': 'home'}, {'phoneScreen': 'app', 'battery': {'visible': False}}):
                raw = simple_spec()
                raw['page']['sections'][0]['diagram']['steps'][0]['panels']['app'] = hidden_state
                source.write_text(json.dumps(raw))
                result = subprocess.run(['node', str(kit / 'tools/visibility-check.cjs'), str(source), str(expect)], text=True, capture_output=True)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertFalse(json.loads(result.stdout)['ok'])
                walk = subprocess.run([sys.executable, str(kit / '.claude/skills/hld-to-page/scripts/spec_walk.py'), str(source),
                                       '--expect', 'happy/open:app.battery.value=20', '--expect', 'happy/open:app.battery.icon=battery-low'], text=True, capture_output=True)
                self.assertEqual(walk.returncode, 0, walk.stderr + walk.stdout)
                self.assertNotIn('WARN', walk.stdout)
            # Unsupported internals and missing stops cannot be rescued by a false expectation.
            for patch in ({'field': 'battery.value'}, {'step': 'missing', 'visible': False}):
                assertion = json.loads(expect.read_text())
                assertion['expectations'][0].update(patch)
                invalid = kit / 'invalid.json'; invalid.write_text(json.dumps(assertion))
                result = subprocess.run(['node', str(kit / 'tools/visibility-check.cjs'), str(source), str(invalid)], text=True, capture_output=True)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertFalse(json.loads(result.stdout)['ok'])
            output = kit / 'packet.md'
            result = subprocess.run([sys.executable, str(kit / 'tools/authoring-packet.py'), '--spec', str(source), '--mode', 'edit', '--out', str(output)], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            meta = json.loads(Path(str(output) + '.json').read_text())
            self.assertEqual(meta['selected']['panels'], ['deviceapp'])
            self.assertIn('## Phase 6: Self-audit against the worksheet', output.read_text())
            self.assertIn('full folded state at every step', output.read_text())
            self.assertIn('must trace to a ledger row', output.read_text())
            self.assertTrue((kit / 'contract/authoring-contract.md').is_file())
            self.assertTrue((kit / '.claude/skills/hld-to-page/references/worked-example.md').is_file())
            types = packet.load_sections((kit / packet.CONTRACT).read_text())[3]
            arguments = [sys.executable, str(kit / 'tools/authoring-packet.py'), '--out', str(output)]
            for name in sorted(types): arguments += ['--panel', name]
            for name in sorted(packet.FEATURES): arguments += ['--feature', name]
            result = subprocess.run(arguments, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assert_local_links_resolve(output.read_text(), kit)
            registry_path = kit / 'examples/canon/topology/registry.json'
            for diagram in json.loads(registry_path.read_text())['diagrams']:
                self.assertTrue((registry_path.parent / diagram['path']).is_file())



class CompanyRulesPacketTests(unittest.TestCase):
    """#1221: a fork's company/contract/*.md fragments reach every focused packet under one
    "Company rules" heading, are recorded in packet.md.json, and never appear twice. Upstream,
    with no company/contract, is unchanged."""
    RULES = {'rules.md': '### Queue naming\n\nName every queue node after the team in its [runbook](../runbooks/queues.md).\n',
             'a-first.md': '### Fork-wide icons\n\nPrefer the fork icon set over generic shapes.\n'}

    def fork(self, fragments, kit=False):
        return temporary_checkout(self, fragments, kit)

    def selections(self):
        yield [], []
        for feature in sorted(packet.FEATURES): yield [], [feature]
        yield ['gauge'], []
        yield [], sorted(packet.FEATURES)

    def assert_rules(self, text, meta, label):
        self.assertEqual(text.count('\n## Company rules\n'), 1, label)
        rules = text[text.index('\n## Company rules\n'):]
        first, second = rules.index('<!-- Source: company/contract/a-first.md -->\n### Fork-wide icons\n\nPrefer the fork icon set'), rules.index('<!-- Source: company/contract/rules.md -->\n### Queue naming\n')
        self.assertLess(first, second, label + ': file-name order')
        self.assertIn('[runbook](company/runbooks/queues.md)', rules, label + ': links resolve from VIZ')
        self.assertLess(text.index('\n## Company rules\n'), text.index('\n## On-demand routes and examples\n'), label)
        sources = {entry['path']: entry for entry in meta['provenance'] if entry['path'].startswith('company/contract/')}
        self.assertEqual(sorted(sources), ['company/contract/a-first.md', 'company/contract/rules.md'], label)
        for path, entry in sources.items():
            self.assertIsNone(entry['section'], label)
            self.assertRegex(entry['sha256'], '^[0-9a-f]{64}$', label)
            self.assertGreater(entry['bytes'], 20, label)
            self.assertEqual(entry['characters'], len(text.split('<!-- Source: ' + path + ' -->\n', 1)[1].split('\n\n<!-- Source:', 1)[0].split('\n\n## ', 1)[0]), label)

    def test_fork_rules_reach_every_packet_mode_once_in_file_name_order(self):
        self.fork(self.RULES)
        for mode in ('new', 'edit'):
            for panels, features in self.selections():
                text, meta = packet.generate(panels, features, mode=mode)
                self.assert_rules(text, meta, mode + ' ' + ','.join(panels + features))
                for entry in meta['provenance']:
                    if entry['path'].startswith('company/contract/'):
                        self.assertEqual(entry['sha256'], hashlib.sha256(self.RULES[entry['path'].rsplit('/', 1)[1]].encode()).hexdigest(), 'whole-file hash')

    def test_a_body_line_quoting_two_markers_does_not_split_its_fragment(self):
        body = '### Marker note\n\n<!-- company/contract/a.md --> and <!-- company/contract/b.md -->\n\nStill the same rule.\n'
        root = self.fork({'notes.md': body}, kit=True)
        self.assertIn('<!-- company/contract/a.md --> and <!-- company/contract/b.md -->', (root / packet.CONTRACT).read_text())
        text, meta = packet.generate([], [], mode='edit')
        self.assertIn('<!-- Source: company/contract/notes.md -->\n### Marker note\n\n<!-- company/contract/a.md --> and <!-- company/contract/b.md -->\n\nStill the same rule.', text)
        self.assertEqual([entry['path'] for entry in meta['provenance'] if entry['path'].startswith('company/')], ['company/contract/notes.md'])
        self.assertEqual(meta['provenance'][-1]['sha256'], hashlib.sha256(body.strip().encode()).hexdigest(), 'kit: hash of the carried excerpt')

    def test_a_fragment_file_name_with_spaces_is_carried(self):
        self.fork({'team rules.md': '### Team rule\n\nOne rule from a file name with a space.\n'})
        text, meta = packet.generate([], [], mode='edit')
        self.assertIn('<!-- Source: company/contract/team rules.md -->\n### Team rule\n', text)
        self.assertIn('company/contract/team rules.md', [entry['path'] for entry in meta['provenance']])

    def test_a_portable_kit_packet_carries_the_same_rules_from_its_contract(self):
        self.fork(self.RULES)
        expected = {mode: packet.generate([], [], mode=mode) for mode in ('new', 'edit')}
        root = self.fork(self.RULES, kit=True)
        self.assertFalse((root / 'company').exists())
        for mode in ('new', 'edit'):
            text, meta = packet.generate([], [], mode=mode)
            self.assert_rules(text, meta, 'kit ' + mode)
            self.assertEqual(text, expected[mode][0], 'kit ' + mode)

    def test_a_fragment_panel_section_reaches_the_packet_with_its_panel_only(self):
        board = ('### panels — company additions\n\n- `ticket-board` — closed tickets out of a fixed total. Declaration:\n'
                 '  `{"id":"tickets","type":"ticket-board","total":10,"initial":{"done":0}}`.\n\n'
                 '### Ticket board naming\n\nTitle a ticket board after its epic.\n')
        self.fork({**self.RULES, 'ticket-board.md': board, 'zz-panel-only.md': '### panels — more additions\n\n- `ticket-gauge` — a gauge of tickets.\n'})
        for panels in ([], ['ticket-board']):
            text, meta = packet.generate(panels, [], mode='edit')
            self.assertEqual(text.count('closed tickets out of a fixed total'), len(panels), panels)
            self.assertEqual(text.count('Title a ticket board after its epic.'), 1, panels)
            self.assertIn('<!-- Source: company/contract/ticket-board.md -->\n### Ticket board naming\n', text)
            self.assertNotIn('company/contract/zz-panel-only.md', text)
            self.assertNotIn('a gauge of tickets', text)
            self.assertNotIn('company/contract/zz-panel-only.md', [entry['path'] for entry in meta['provenance']])

    def test_without_fragments_every_packet_is_unchanged(self):
        self.fork(None)
        upstream = {(mode, tuple(panels), tuple(features)): packet.generate(panels, features, mode=mode)
                    for mode in ('new', 'edit') for panels, features in self.selections()}
        for key, (text, meta) in upstream.items():
            self.assertNotIn('## Company rules', text, key)
            self.assertFalse(any(entry['path'].startswith('company/') for entry in meta['provenance']), key)
        self.fork({})
        for (mode, panels, features), (text, meta) in upstream.items():
            self.assertEqual(packet.generate(list(panels), list(features), mode=mode), (text, meta), mode)


if __name__ == '__main__':
    unittest.main()
