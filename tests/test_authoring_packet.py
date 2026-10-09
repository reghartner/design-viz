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

    def test_all_emitted_links_resolve_from_viz_and_preserve_anchors_and_external_urls(self):
        types = packet.load_sections((ROOT / packet.CONTRACT).read_text())[3]
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
        baseline = '\n\n'.join((ROOT / name).read_text() for name in meta['size']['baselinePaths'])
        self.assertEqual(meta['size']['baselineBytes'], len(baseline.encode()))
        self.assertEqual(meta['size']['baselineCharacters'], len(baseline))
        for entry in meta['provenance']:
            self.assertTrue((ROOT / entry['path']).is_file())
            self.assertEqual(entry['sha256'], hashlib.sha256((ROOT / entry['path']).read_bytes()).hexdigest())

    def test_entry_packet_carries_required_workflow_without_full_reference_preload(self):
        for mode in ('new', 'edit'):
            text, meta = packet.generate(['state'], ['steps'], mode=mode)
            sources = [(item['path'], item['section']) for item in meta['provenance']]
            self.assertIn((packet.WORKFLOW, 'The rules that matter most'), sources)
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


if __name__ == '__main__':
    unittest.main()
