"""Pure focused device-app fragment rules: presence, allowlist, merge and binding."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('panel_fragment', ROOT / 'tools/panel_fragment.py')
pf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf)

EXAMPLE = ROOT / 'examples/device-app-navigation/device-app-navigation.spec.json'
TARGET = {'section': 0, 'sectionPath': ['page', 'sections', 0], 'diagramPath': ['page', 'sections', 0, 'diagram'],
          'panelPath': ['page', 'sections', 0, 'diagram', 'panels', 0], 'panelIndex': 0, 'panelId': 'app',
          'panelType': 'deviceapp'}
OWNER = {'sessionId': 'session', 'connectionId': 'connection'}
LEDGER = '# Coverage ledger\n\nCards follow the story.\n'


def document():
    """The shipped example plus a sibling panel, a legacy patch, a reset and panel visibility."""
    raw = json.loads(EXAMPLE.read_text())
    d = raw['page']['sections'][0]['diagram']
    d['panels'].append({'id': 'other', 'type': 'deviceapp', 'title': 'Other phone',
                        'fields': [{'id': 'battery', 'label': 'Battery', 'kind': 'battery'}]})
    d['steps'][1]['panels']['other'] = {'battery': {'value': 40, 'status': 'ready'}}
    d['steps'][1]['panelVisibility'] = {'other': True}
    d['steps'][3]['patch'] = d['steps'][3].pop('panels')  # legacy alias
    d['steps'][4]['panels']['app']['firmware'] = None     # explicit reset
    d['steps'][5]['panels']['app']['clip'] = {'icon': None}
    return raw


def packet_for(raw, request='req-1', revision='connection-3'):
    source = json.dumps(raw, indent=2) + '\n'
    return {'format': pf.PACKET_FORMAT, 'requestId': request, **OWNER, 'project': 'story-1', 'revision': revision,
            'sourceSha256': pf.sha256_text(source), 'ledgerSha256': pf.sha256_text(LEDGER), 'guide': 'guide.md',
            'target': copy.deepcopy(TARGET), 'context': {}, 'fragment': pf.extract(raw, TARGET, request, revision)}, source


def steps(raw):
    return raw['page']['sections'][0]['diagram']['steps']


class FragmentTests(unittest.TestCase):
    def setUp(self):
        self.raw = document()
        self.packet, self.source = packet_for(self.raw)
        self.fragment = copy.deepcopy(self.packet['fragment'])

    def refused(self, fragment, text):
        with self.assertRaises(pf.Refusal) as caught:
            pf.assemble(self.raw, self.packet, fragment)
        self.assertIn(text, str(caught.exception) + ' ' + ' '.join(caught.exception.problems))
        return caught.exception

    def test_no_op_round_trip_is_structurally_the_pinned_source(self):
        result, summary = pf.assemble(self.raw, self.packet, json.loads(json.dumps(self.fragment)))
        self.assertTrue(pf.same(result, self.raw))
        self.assertEqual(summary, {'panelChanged': False, 'changedSteps': [], 'unchanged': True})
        timeline = self.fragment['timeline']
        self.assertEqual(timeline[0]['stateAssignment'], {'present': False})
        self.assertEqual(timeline[4]['stateAssignment']['value']['firmware'], None)
        self.assertEqual(timeline[5]['stateAssignment']['value']['clip'], {'icon': None})
        self.assertEqual(timeline[3]['stateAssignment']['value']['clip']['visible'], True, 'legacy patch is extracted')
        self.assertEqual(timeline[1]['visibilityAssignment'], {'present': False})

    def test_reorder_and_visual_keys_merge_into_absent_and_existing_assignments(self):
        value = self.fragment['panel']['value']
        value['fields'].insert(0, value['fields'].pop(3))  # clip first
        value['fields'][1]['icon'] = 'battery'
        value['showSources'] = False
        value['initial']['firmware']['visible'] = True
        value['initial']['phoneScreen'] = 'app'
        timeline = self.fragment['timeline']
        timeline[0]['stateAssignment'] = {'present': True, 'value': {'battery': {'visible': False}}}
        timeline[0]['visibilityAssignment'] = {'present': True, 'value': False}
        timeline[1]['stateAssignment']['value']['clip'] = {'visible': True, 'icon': 'camera'}
        timeline[3]['stateAssignment']['value']['clip']['icon'] = 'camera'
        del timeline[5]['stateAssignment']['value']['clip']  # visual-only {icon:null} removed -> inherit
        result, summary = pf.assemble(self.raw, self.packet, self.fragment)
        panel = result['page']['sections'][0]['diagram']['panels'][0]
        self.assertEqual([f['id'] for f in panel['fields']], ['clip', 'battery', 'power', 'connection', 'firmware'])
        self.assertEqual(panel['fields'][1], {'id': 'battery', 'label': 'Battery', 'kind': 'battery', 'icon': 'battery'})
        self.assertIs(panel['showSources'], False)
        self.assertEqual(panel['initial']['firmware'], {'value': 'v2.4.1', 'status': 'ready', 'visible': True})
        after = steps(result)
        self.assertEqual(after[0]['panels'], {'app': {'battery': {'visible': False}}})
        self.assertEqual(after[0]['panelVisibility'], {'app': False})
        self.assertEqual(after[1]['panels']['other'], {'battery': {'value': 40, 'status': 'ready'}}, 'sibling panel kept')
        self.assertEqual(after[1]['panelVisibility'], {'other': True})
        self.assertEqual(after[3]['patch']['app']['clip']['icon'], 'camera')
        self.assertNotIn('panels', after[3], 'the legacy container stays the only container')
        self.assertEqual(after[5]['panels']['app'], {'phoneScreen': 'home'})
        self.assertEqual(summary['changedSteps'], [0, 1, 3, 5])
        self.assertTrue(summary['panelChanged'])
        self.assertTrue(pf.same(pf.strip_selected(self.raw, TARGET), pf.strip_selected(result, TARGET)))

    def test_removing_the_last_key_cleans_only_containers_without_siblings(self):
        raw = self.raw
        steps(raw)[6]['panels']['app'] = {'phoneScreen': 'app'}
        steps(raw)[1]['panels']['app'] = {'phoneScreen': 'home'}
        steps(raw)[1]['panelVisibility']['app'] = True
        self.packet, _ = packet_for(raw)
        fragment = copy.deepcopy(self.packet['fragment'])
        for index in (1, 6):
            fragment['timeline'][index]['stateAssignment'] = {'present': False}
        fragment['timeline'][1]['visibilityAssignment'] = {'present': False}
        result, _ = pf.assemble(raw, self.packet, fragment)
        after = steps(result)
        self.assertNotIn('panels', after[6])
        self.assertEqual(after[1]['panels'], {'other': {'battery': {'value': 40, 'status': 'ready'}}})
        self.assertEqual(after[1]['panelVisibility'], {'other': True})

    def rebased(self, change):
        """Use a variant document as the pinned source for this test."""
        self.raw = document()
        change(self.raw['page']['sections'][0]['diagram'])
        self.assertEqual(pf.problems(self.raw, TARGET), [])
        self.packet, _ = packet_for(self.raw)
        self.fragment = copy.deepcopy(self.packet['fragment'])

    def test_literal_empty_assignments_keep_presence_and_accept_visual_keys(self):
        def literals(d):
            d['panels'][0]['initial'] = {}
            d['steps'][0]['panels'] = {'app': {}}
            d['steps'][2]['panels']['app']['connection'] = {}
        self.rebased(literals)
        result, summary = pf.assemble(self.raw, self.packet, copy.deepcopy(self.fragment))
        self.assertTrue(summary['unchanged'])
        self.assertEqual(steps(result)[0]['panels'], {'app': {}})
        # Review reproduction 1: base {} -> {phoneScreen:"app"} must be allowed.
        self.fragment['timeline'][0]['stateAssignment']['value']['phoneScreen'] = 'app'
        self.fragment['panel']['value']['initial']['phoneScreen'] = 'app'
        self.fragment['timeline'][2]['stateAssignment']['value']['connection']['visible'] = False
        result, _ = pf.assemble(self.raw, self.packet, self.fragment)
        self.assertEqual(steps(result)[0]['panels'], {'app': {'phoneScreen': 'app'}})
        self.assertEqual(result['page']['sections'][0]['diagram']['panels'][0]['initial'], {'phoneScreen': 'app'})
        self.assertEqual(steps(result)[2]['panels']['app'], {'phoneScreen': 'app', 'clear': True, 'connection': {'visible': False}})
        # A literal {} is authored content: it cannot be removed.
        for name, edit in {
                'panel assignment': lambda f: f['timeline'][0].update(stateAssignment={'present': False}),
                'initial': lambda f: f['panel']['value'].pop('initial'),
                'card assignment': lambda f: f['timeline'][2]['stateAssignment']['value'].pop('connection')}.items():
            with self.subTest(name):
                fragment = copy.deepcopy(self.packet['fragment'])
                edit(fragment)
                self.refused(fragment, 'literal empty assignment')

    def test_visual_only_assignments_are_removed_not_turned_into_empty_objects(self):
        def visual(d):
            d['panels'][0]['initial']['clip'] = {'visible': False}
            d['steps'][0]['panels'] = {'app': {'battery': {'visible': False}}}
        self.rebased(visual)
        # Review reproduction 2: {battery:{visible:false}} -> {battery:{}} must not pass.
        for name, edit in {
                'card': lambda f: f['timeline'][0]['stateAssignment']['value']['battery'].pop('visible'),
                'initial card': lambda f: f['panel']['value']['initial']['clip'].pop('visible'),
                'panel assignment': lambda f: f['timeline'][0]['stateAssignment']['value'].pop('battery')}.items():
            with self.subTest(name):
                fragment = copy.deepcopy(self.fragment)
                edit(fragment)
                self.refused(fragment, 'new empty assignment')
        # Intended removals are expressed as absence and keep everything else.
        self.fragment['timeline'][0]['stateAssignment'] = {'present': False}
        del self.fragment['panel']['value']['initial']['clip']
        del self.fragment['timeline'][4]['stateAssignment']['value']['power']
        result, summary = pf.assemble(self.raw, self.packet, self.fragment)
        self.assertNotIn('panels', steps(result)[0], 'the container held only this assignment')
        self.assertNotIn('clip', result['page']['sections'][0]['diagram']['panels'][0]['initial'])
        self.assertEqual(steps(result)[4]['panels']['app'], {'connection': {'visible': False}, 'clear': True, 'firmware': None})
        self.assertEqual(summary['changedSteps'], [0, 4])

    def test_semantic_and_structural_changes_are_locked(self):
        edits = {
            'value': lambda f: f['timeline'][3]['stateAssignment']['value']['clip'].update(value='Tomorrow'),
            'status': lambda f: f['timeline'][3]['stateAssignment']['value']['clip'].update(status='error'),
            'detail': lambda f: f['timeline'][3]['stateAssignment']['value']['clip'].update(detail='New'),
            'reportedAt': lambda f: f['timeline'][3]['stateAssignment']['value']['clip'].update(reportedAt='now'),
            'notify': lambda f: f['timeline'][1]['stateAssignment']['value']['notify'].update(title='Changed'),
            'clear': lambda f: f['timeline'][2]['stateAssignment']['value'].pop('clear'),
            'clock': lambda f: f['panel']['value']['initial'].update(clock='10:00'),
            'label': lambda f: f['panel']['value']['fields'][0].update(label='Charge'),
            'kind': lambda f: f['panel']['value']['fields'][0].pop('kind'),
            'field removed': lambda f: f['panel']['value']['fields'].pop(),
            'field added': lambda f: f['panel']['value']['fields'].append({'id': 'extra', 'label': 'Extra'}),
            'panel id': lambda f: f['panel']['value'].update(id='phone'),
            'panel type': lambda f: f['panel']['value'].update(type='screen'),
            'title': lambda f: f['panel']['value'].update(title='Other'),
            'unknown field visual': lambda f: f['timeline'][2]['stateAssignment']['value'].update(ghost={'visible': True}),
            'enterOnce': lambda f: f['timeline'][2]['stateAssignment']['value'].update(enterOnce={'phoneScreen': 'home'}),
            'empty assignment': lambda f: f['timeline'][0].update(stateAssignment={'present': True, 'value': {}}),
        }
        for name, edit in edits.items():
            with self.subTest(name):
                fragment = copy.deepcopy(self.fragment)
                edit(fragment)
                self.refused(fragment, 'locked' if name != 'enterOnce' else 'enterOnce')

    def test_explicit_null_reset_cannot_gain_visual_keys(self):
        self.fragment['timeline'][4]['stateAssignment']['value']['firmware'] = {'visible': True}
        self.refused(self.fragment, 'explicit null reset')

    def test_schema_identity_and_envelope_mistakes_are_refused(self):
        cases = {
            'fieldOrder': lambda f: f['panel'].update(fieldOrder=['battery']),
            'step id': lambda f: f['timeline'][2].update(stepId='other'),
            'step count': lambda f: f['timeline'].pop(),
            'absent value': lambda f: f['timeline'][0].update(stateAssignment={'present': False, 'value': None}),
            'missing value': lambda f: f['timeline'][0].update(visibilityAssignment={'present': True}),
            'null patch': lambda f: f['timeline'][0].update(stateAssignment={'present': True, 'value': None}),
            'visibility text': lambda f: f['timeline'][0].update(visibilityAssignment={'present': True, 'value': 'yes'}),
            'screen': lambda f: f['timeline'][6]['stateAssignment']['value'].update(phoneScreen='lock'),
            'card visible': lambda f: f['timeline'][4]['stateAssignment']['value']['power'].update(visible='no'),
            'revision': lambda f: f.update(baseRevision='connection-2'),
            'target': lambda f: f['target'].update(panelIndex=1),
            'extra member': lambda f: f.update(operations=[]),
        }
        for name, edit in cases.items():
            with self.subTest(name):
                fragment = copy.deepcopy(self.fragment)
                edit(fragment)
                self.assertTrue(self.refused(fragment, '').problems or name == 'extra member', name)

    def test_ineligible_sources_and_tampered_packets_are_refused(self):
        tampered = copy.deepcopy(self.packet)
        tampered['fragment']['panel']['value']['title'] = 'Forged'
        with self.assertRaisesRegex(pf.Refusal, 'does not match the pinned source'):
            pf.assemble(self.raw, tampered, tampered['fragment'])
        for name, change, code in [
                ('both containers', lambda s: s[2].update(patch={'other': {}}), 'ambiguous-container'),
                ('enterOnce', lambda s: s[2]['panels']['app'].update(enterOnce={'clip': {'visible': True}}), 'enter-once'),
                ('malformed', lambda s: s[2]['panels'].update(app=[]), 'malformed-state'),
                ('unknown key', lambda s: s[2]['panels']['app'].update(wallpaper='blue'), 'unknown-key')]:
            with self.subTest(name):
                raw = document()
                change(steps(raw))
                self.assertIn(code, [c for c, _ in pf.problems(raw, TARGET)])
                packet, _ = packet_for(raw)
                with self.assertRaisesRegex(pf.Refusal, 'not eligible'):
                    pf.assemble(raw, packet, packet['fragment'])
        moved = copy.deepcopy(self.packet)
        moved['target']['panelId'] = 'other'
        with self.assertRaisesRegex(pf.Refusal, 'ID or type'):
            pf.assemble(self.raw, moved, self.fragment)

    def test_request_packet_and_state_binding(self):
        request = {**OWNER, 'id': 'req-1', 'revision': 'connection-3', 'project': 'story-1', 'mode': pf.MODE,
                   'focus': {'format': pf.PACKET_FORMAT, 'file': 'focus-req-1.json', 'sha256': 'a' * 64}}
        state = {**OWNER, 'revision': 'connection-3', 'project': 'story-1', 'source': self.source, 'ledger': LEDGER}

        def check(**changes):
            r, s, p = copy.deepcopy(request), copy.deepcopy(state), copy.deepcopy(self.packet)
            for key, value in changes.items():
                where, _, name = key.partition('__')
                {'request': r, 'state': s, 'packet': p}[where][name] = value
            return pf.packet_problems(p, r, s, OWNER, 'req-1', 'focus-req-1.json', 'a' * 64)
        self.assertEqual(check(), [])
        self.assertIn('not registered', check(request__mode=None)[0])
        for changes, text in [({'state__revision': 'connection-4'}, 'revision'),
                              ({'request__revision': 'connection-2'}, 'revision'),
                              ({'state__source': self.source + ' '}, 'source hash'),
                              ({'state__ledger': LEDGER + 'edit'}, 'ledger'),
                              ({'state__ledger': None}, 'ledger'),
                              ({'packet__sessionId': 'other'}, 'session'),
                              ({'state__connectionId': 'other'}, 'session'),
                              ({'request__project': 'story-2'}, 'project'),
                              ({'packet__requestId': 'req-2'}, 'another request')]:
            with self.subTest(changes):
                self.assertTrue(any(text in problem for problem in check(**changes)), check(**changes))
        self.assertTrue(pf.packet_problems(self.packet, request, state, OWNER, 'req-1', 'focus-req-1.json', 'b' * 64))
        self.assertTrue(pf.packet_problems(self.packet, request, state, OWNER, 'req-1', 'other.json', 'a' * 64))

    def test_strict_json_rejects_duplicate_keys_and_non_json_numbers(self):
        with self.assertRaisesRegex(pf.Refusal, 'repeats'):
            pf.loads('{"panel": 1, "panel": 2}', 'fragment')
        with self.assertRaisesRegex(pf.Refusal, 'NaN'):
            pf.loads('{"value": NaN}', 'fragment')
        with self.assertRaisesRegex(pf.Refusal, 'not valid JSON'):
            pf.loads('{', 'fragment')

    def test_validator_reports_select_panel_warnings_and_new_warnings(self):
        files = {'base': '/tmp/a/base.spec.json', 'candidate': '/tmp/a/candidate.spec.json'}
        output = '\n'.join([
            files['base'] + ': compatibility: uses flow.panel-visibility',
            files['base'] + ': warn  sections[0].diagram.panels[1].title: sibling',
            files['base'] + ': 0 errors, 1 warnings',
            files['candidate'] + ': warn  sections[0].diagram.panels[1].title: sibling',
            files['candidate'] + ': warn  sections[0].diagram.steps[3].panels.app.clip.icon: unknown icon — ignored',
            files['candidate'] + ': 0 errors, 2 warnings'])
        reports = pf.parse_validation(output, files)
        problems = pf.validation_problems(reports, TARGET)
        self.assertEqual(problems, ['New validator warning: sections[0].diagram.steps[3].panels.app.clip.icon: unknown icon — ignored'])
        with self.assertRaisesRegex(pf.Refusal, 'did not report'):
            pf.parse_validation(output.rsplit('\n', 1)[0], files)
        self.assertTrue(pf.selected_warning('sections[0].diagram.panels[0].fields[2].icon: unknown', TARGET))
        self.assertFalse(pf.selected_warning('sections[0].diagram.steps[1].panels.application: unknown', TARGET))

    def test_serialization_follows_source_indentation(self):
        value = {'a': [1, {'b': None}]}
        self.assertEqual(pf.dumps_like(value, '{\n    "x": 1\n}\n'), json.dumps(value, indent='    ') + '\n')
        self.assertEqual(pf.dumps_like(value, '{"x":1}'), '{"a":[1,{"b":null}]}')


if __name__ == '__main__':
    unittest.main()
