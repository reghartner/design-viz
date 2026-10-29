"""Exercise the exact helper Claude receives; no Claude process or network."""
import base64
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'tools/folder-agent.py'
spec = importlib.util.spec_from_file_location('folder_agent', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
kit_spec = importlib.util.spec_from_file_location('folder_agent_kit', ROOT / 'tools/folder_agent_kit.py')
kit_builder = importlib.util.module_from_spec(kit_spec)
kit_spec.loader.exec_module(kit_builder)
doc_spec = importlib.util.spec_from_file_location('widget_doc', ROOT / 'tools/widget_doc.py')
widget_doc = importlib.util.module_from_spec(doc_spec)
doc_spec.loader.exec_module(widget_doc)


class FolderAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-folder-test-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.owner = {'sessionId': 'session', 'connectionId': 'connection'}
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner})
        self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time()*1000})
        self.put('request.json', {**self.owner, 'id': 'request', 'text': 'Tell a story'})
        self.put('state.json', {**self.owner, 'revision': 'connection-1', 'source': '{}'})
        (self.folder/'answer.txt').write_text('Our customer is ready.', encoding='utf-8')
        (self.folder/'candidate.spec.json').write_text('{"page":{}}')
        self.kit({'docs/example.md': 'Small kit'})

    def put(self, name, value):
        (self.folder/name).write_text(json.dumps(value))

    def kit(self, files):
        raw = json.dumps({'files': files}).encode()
        self.put('authoring-kit.json', {'gzip': base64.b64encode(gzip.compress(raw)).decode(),
                                       'sha256': hashlib.sha256(raw).hexdigest()})

    def run_helper(self, *args):
        return subprocess.run([sys.executable, str(HELPER), '--folder', str(self.folder), *args],
                              text=True, capture_output=True, timeout=10)

    def refresh_ready(self, **capability):
        self.put('state.json', {**self.owner, 'revision': 'connection-1', 'source': '{}',
                               'localSources': {'available': True, 'consumerId': 'team/consumer', **capability}})
        (self.folder/'request.json').unlink(missing_ok=True)

    def refresh_receipt(self, status='applied', **extra):
        request = json.loads((self.folder/'refresh-sources.json').read_text())
        self.put('refresh-sources-result.json', {**self.owner, 'version': 1, 'id': request['id'],
                  'baseRevision': request['baseRevision'], 'status': status, 'code': 'ok',
                  'revision': 'connection-2', 'currentRevision': 'connection-2', 'snapshotCurrent': True, **extra})

    def test_refresh_cli_publishes_bounded_identity_request_without_begin_and_waits_for_receipt(self):
        self.refresh_ready()
        process = subprocess.Popen([sys.executable, str(HELPER), '--folder', str(self.folder), 'refresh-sources'],
                                   text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(lambda: process.kill() if process.poll() is None else None)
        deadline = time.monotonic()+5
        while not (self.folder/'refresh-sources.json').exists() and time.monotonic()<deadline:
            time.sleep(.02)
        request = json.loads((self.folder/'refresh-sources.json').read_text())
        self.assertEqual(set(request), {'version','sessionId','connectionId','id','baseRevision','expiresAt'})
        self.assertEqual(request['baseRevision'], 'connection-1')
        self.assertFalse((self.folder/'request.json').exists())
        self.refresh_receipt()
        output, error = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, error)
        self.assertEqual(json.loads(output)['currentRevision'], 'connection-2')

    def test_refresh_cli_cloud_and_missing_grant_reject_without_publishing(self):
        for code in ('cloud_project', 'reconnect_required'):
            self.refresh_ready(available=False, code=code, message='Reconnect the consumer' if code=='reconnect_required' else 'Cloud projects use cloud snapshots')
            result=self.run_helper('refresh-sources')
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(json.loads(result.stdout)['code'], code)
            self.assertFalse((self.folder/'refresh-sources.json').exists())

    def test_refresh_wait_rejects_changed_ownership_withdraws_timeout_and_ignores_old_receipts(self):
        self.refresh_ready()
        self.put('refresh-sources-result.json', {**self.owner, 'version':1, 'id':'old', 'status':'applied'})
        with patch.object(helper, 'ACKNOWLEDGEMENT_SECONDS', .01), patch.object(helper.time, 'sleep', lambda _: None):
            with self.assertRaisesRegex(ValueError, 'timed out'):
                helper.refresh_sources(self.folder)
        self.assertTrue(json.loads((self.folder/'refresh-sources.json').read_text())['withdrawn'])
        def replace_owner(_):
            self.put('session.json', {'protocol':'flowview-folder-v1', **self.owner, 'connectionId':'other'})
        with patch.object(helper.time, 'sleep', replace_owner):
            with self.assertRaisesRegex(ValueError, 'connection|owner|session'):
                helper.refresh_sources(self.folder)

    def test_refresh_prevents_concurrent_request_and_propagates_busy_or_invalid_provider(self):
        self.refresh_ready()
        self.put('refresh-sources.json', {**self.owner, 'id':'pending', 'expiresAt':time.time()*1000+90000})
        with self.assertRaisesRegex(ValueError, 'already pending'):
            helper.refresh_sources(self.folder)
        (self.folder/'refresh-sources.json').unlink()
        for status, code in [('busy','busy'),('rejected','invalid_sources'),('unchanged','ok')]:
            with patch.object(helper.time, 'sleep', lambda _, status=status,code=code:self.refresh_receipt(status,code=code)):
                result=helper.refresh_sources(self.folder)
            self.assertEqual(result['status'], status)
            self.assertEqual(result['code'], code)

    def test_refresh_requires_a_complete_consistent_receipt(self):
        self.refresh_ready()
        with patch.object(helper.time, 'sleep', lambda _:self.refresh_receipt(snapshotCurrent=None)):
            with self.assertRaisesRegex(ValueError, 'Malformed refresh receipt'):
                helper.refresh_sources(self.folder)
        self.assertTrue(json.loads((self.folder/'refresh-sources.json').read_text())['withdrawn'])

    def test_paired_project_requires_nonempty_ledger_and_packages_it(self):
        manifest = json.loads((self.folder / 'session.json').read_text())
        manifest['pairedArtifacts'] = True
        (self.folder / 'session.json').write_text(json.dumps(manifest))
        missing = self.propose()
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn('--ledger', missing.stderr)
        (self.folder / 'candidate.ledger.md').write_text('# Coverage ledger\n\nEvidence for this exact proposed story.\n')
        result = self.run_helper('propose', '--request', 'request', '--revision', 'connection-1',
                                 '--file', 'candidate.spec.json', '--ledger', 'candidate.ledger.md')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.folder / 'proposal.json').read_text())['ledger'],
                         '# Coverage ledger\n\nEvidence for this exact proposed story.\n')

    def propose(self):
        return self.run_helper('propose', '--request', 'request', '--revision', 'connection-1',
                               '--file', 'candidate.spec.json')

    def test_reply_and_proposal_identity_and_pending_ack_guard(self):
        result = self.propose()
        self.assertEqual(result.returncode, 0, result.stderr)
        proposal = helper.read(self.folder, 'proposal.json')
        self.assertEqual(proposal['connectionId'], 'connection')
        self.assertEqual(proposal['baseRevision'], 'connection-1')
        for command in [self.propose, lambda: self.run_helper('reply', '--request', 'request', '--file', 'answer.txt')]:
            self.assertIn('pending proposal', command().stderr)
        self.put('result.json', {**self.owner, 'id': proposal['id'], 'status': 'applied'})
        self.assertEqual(self.run_helper('reply', '--request', 'request', '--file', 'answer.txt').returncode, 0)

    def test_stale_revision_reaches_browser_but_disconnected_publication_is_refused(self):
        self.put('state.json', {**self.owner, 'revision': 'connection-2'})
        self.assertEqual(self.propose().returncode, 0)  # Browser merges or reports conflicts using its retained baseline.
        (self.folder / 'proposal.json').unlink()
        self.put('editor.json', {**self.owner, 'connected': False, 'at': time.time()*1000})
        self.assertIn('disconnected', self.propose().stderr)
        self.assertFalse((self.folder/'proposal.json').exists())

    def test_filename_escape_and_symlink_refused(self):
        self.assertIn('plain filename', self.run_helper('reply', '--request', 'request', '--file', '../answer.txt').stderr)
        (self.folder/'link.txt').symlink_to(self.folder/'answer.txt')
        self.assertIn('regular helper file', self.run_helper('reply', '--request', 'request', '--file', 'link.txt').stderr)

    def test_kit_checksum_traversal_and_symlink_refused(self):
        helper.prepare(self.folder)
        self.assertEqual((self.folder/'authoring/docs/example.md').read_text(), 'Small kit')
        self.kit({'../escape.txt': 'bad'})
        with self.assertRaisesRegex(ValueError, 'path'):
            helper.prepare(self.folder)
        self.assertFalse((self.folder/'escape.txt').exists())
        self.kit({'linked/out.md': 'bad'})
        (self.folder/'authoring/linked').symlink_to(self.folder, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            helper.prepare(self.folder)
        self.put('authoring-kit.json', {'gzip': base64.b64encode(gzip.compress(b'{}')).decode(), 'sha256': 'wrong'})
        with self.assertRaisesRegex(ValueError, 'checksum'):
            helper.prepare(self.folder)

    def test_prepare_refreshes_skill_and_removes_only_retired_bundle_files(self):
        skill = '.claude/skills/hld-to-page/SKILL.md'
        retired = ['docs/agent-operations.md', 'docs/agent-intent-testing.md',
                   'src/workbench/agent-operations.js', 'tools/arrange-spec.cjs',
                   'tools/arrange/generated-native.html', 'tools/arrange/setup.cjs',
                   'tools/arrange/package.json', 'tools/arrange/package-lock.json']
        self.kit({skill: 'Old skill', **dict.fromkeys(retired, 'Old API guidance')})
        helper.prepare(self.folder)
        note = self.folder/'authoring/operator-notes.md'
        note.write_text('Keep my notes')
        current = {name: (ROOT/name).read_text() for name in [
            'tools/compose-page-layout.cjs', 'tools/arrange/core.cjs',
            'tools/arrange/measure.cjs', 'tools/arrange/solver.cjs',
            'tools/arrange/contracts.cjs', 'tools/arrange/model.cjs',
            'tools/arrange/packing.cjs', 'tools/arrange/estimate.cjs']}
        self.kit({skill: 'Restored full-document skill', **current})
        helper.prepare(self.folder)
        self.assertEqual((self.folder/'authoring'/skill).read_text(), 'Restored full-document skill')
        self.assertTrue(all(not (self.folder/'authoring'/name).exists() for name in retired))
        self.assertEqual(note.read_text(), 'Keep my notes')
        for name, content in current.items():
            self.assertEqual((self.folder/'authoring'/name).read_text(), content, name)
        # Cleanup cannot follow a retired file or parent symlink outside the kit.
        link = self.folder/'authoring/docs/agent-operations.md'
        link.symlink_to(note)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            helper.prepare(self.folder)
        self.assertEqual(note.read_text(), 'Keep my notes')
        link.unlink()
        (self.folder/'authoring/docs').rmdir()
        (self.folder/'authoring/docs').symlink_to(self.folder, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            helper.prepare(self.folder)

    def test_prepare_replaces_or_removes_company_context_and_preserves_authored_files(self):
        name = 'tools/company-agent-context.json'
        destination = self.folder / 'authoring'
        for url in ['https://old.example', 'https://new.example/developer']:
            context = {'backstage': {'baseUrl': url}}
            self.kit({name: json.dumps(context)})
            helper.prepare(self.folder)
            self.assertEqual(kit_builder.company_agent_context(destination), context)
        note = destination / 'operator-notes.md'
        note.write_text('Keep my notes')
        # An omitted or --no-config kit has no context export.
        self.kit({'docs/example.md': 'Upstream kit'})
        helper.prepare(self.folder)
        self.assertFalse((destination / name).exists())
        self.assertEqual(kit_builder.company_agent_context(destination), {})
        self.assertEqual(note.read_text(), 'Keep my notes')

    def test_prepared_real_kit_arranges_graph_and_validates_manual_section_layout(self):
        runtime = subprocess.check_output(
            ['node', str(ROOT/'tools/source-loader.cjs'), '--module', 'backend', 'cjs'], text=True)
        (self.folder/'authoring-kit.json').write_text(kit_builder.folder_agent_kit(ROOT, runtime))
        helper.prepare(self.folder)
        for name in ['.claude/skills/hld-to-page/SKILL.md', 'tools/widget_doc.py',
                     'tools/auto-arrange-spec.cjs', 'tools/compose-page-layout.cjs',
                     'tools/arrange/core.cjs', 'tools/arrange/estimate.cjs',
                     '.claude/skills/hld-to-page/scripts/pilot_capture.py']:
            self.assertEqual((self.folder/'authoring'/name).read_bytes(), (ROOT/name).read_bytes(), name)
        for name in ['tools/arrange-spec.cjs', 'tools/arrange/setup.cjs',
                     'tools/arrange/package.json', 'tools/arrange/generated-native.html']:
            self.assertFalse((self.folder/'authoring'/name).exists(), name)
        trace_cli = (self.folder/'authoring/tools/trace2spec.js').read_text()
        self.assertIn("'trace-import.js'", trace_cli)
        self.assertNotIn('../src/trace-import.js', trace_cli)
        self.assertEqual((self.folder/'authoring/tools/trace-import.js').read_text(),
                         (ROOT/'src/trace-import.js').read_text())
        skill = (self.folder/'authoring/.claude/skills/hld-to-page/SKILL.md').read_text()
        self.assertIn('tools/authoring-packet.py', skill)
        workflow = (self.folder/'authoring/.claude/skills/hld-to-page/references/authoring-workflow.md').read_text()
        self.assertIn(widget_doc.CLIP_CUE, ' '.join(workflow.split()))
        result = subprocess.run([sys.executable, str(self.folder/'authoring/tools/widget_doc.py'), 'deviceapp'],
                                text=True, capture_output=True, timeout=10, cwd=self.folder)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count(widget_doc.CLIP_CUE), 1)
        draft = self.folder/'authoring/draft.spec.json'
        arranged = self.folder/'authoring/arranged.spec.json'
        manual_layout = {'columns': 24, 'default': [
            {'x': 0, 'y': 0, 'w': 16, 'h': 12},
            {'panel': 'phone', 'x': 16, 'y': 0, 'w': 8, 'h': 12},
            {'controls': 'steps', 'x': 0, 'y': 12, 'w': 24, 'h': 5}
        ]}
        draft.write_text(json.dumps({'nodes': {'a': {'title': 'A'}, 'b': {'title': 'B'}},
                                     'rows': [[]],
                                     'floats': [{'id': 'a', 'side': 'below'},
                                                {'id': 'b', 'side': 'below'}],
                                     'edges': [{'from': 'a', 'to': 'b', 'label': 'send'}],
                                     'steps': [{'edge': 'a->b', 'text': 'Send'}],
                                     'panels': [{'id': 'phone', 'type': 'phone', 'title': 'Phone'}],
                                     'sectionLayout': manual_layout}))
        result = subprocess.run(['node', 'tools/auto-arrange-spec.cjs', draft.name, arranged.name],
                                text=True, capture_output=True, timeout=30,
                                cwd=self.folder/'authoring')
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        output = json.loads(arranged.read_text())
        self.assertEqual(output['sectionLayout'], manual_layout)
        self.assertTrue(all('x' in item and 'y' in item for item in output['floats']))
        result = subprocess.run(['node', 'tools/validate.js', '--quiet', arranged.name],
                                text=True, capture_output=True, timeout=10,
                                cwd=self.folder/'authoring')
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        trace = subprocess.run(['node', 'tools/trace2spec.js', str(ROOT/'examples/traces/checkout.events.json'), '--preview'],
                               text=True, capture_output=True, timeout=10, cwd=self.folder/'authoring')
        self.assertEqual(trace.returncode, 0, trace.stderr)
        self.assertTrue(json.loads(trace.stdout)['canBuild'])
        for guide in ['use-case-story.md', 'use-case-existing-flow.md', 'use-case-hld.md', 'use-case-honeycomb.md', 'pilot-capture.md']:
            self.assertIn('references/' + guide, skill)
            self.assertTrue((self.folder/'authoring/.claude/skills/hld-to-page/references'/guide).is_file())

    def test_watcher_notifies_once_and_renewal_skips_completed_request(self):
        run = self.run_helper('watch', '--minutes', '.01', '--interval', '.1')
        self.assertEqual(run.returncode, 0, run.stderr)
        events = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual([x['event'] for x in events], ['flowview_request'])
        self.assertNotIn('text', events[0])
        self.assertFalse(helper.read(self.folder, 'listener.json')['listening'])
        self.put('reply.json', {**self.owner, 'requestId': 'request'})
        self.assertEqual(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout, '')

    def test_copy_and_native_requests_do_not_dispatch_through_monitor(self):
        for delivery in ('clipboard', 'native'):
            self.put('request.json', {**self.owner, 'id': 'copied', 'delivery': delivery})
            run = self.run_helper('watch', '--minutes', '.003', '--interval', '.1')
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(run.stdout, '')

    def test_monitor_renewal_preserves_events_for_an_active_request_and_new_results(self):
        first = self.run_helper('watch', '--minutes', '.003', '--interval', '.1')
        self.assertEqual(json.loads(first.stdout)['requestId'], 'request')
        self.assertEqual(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout, '')
        self.put('result.json', {**self.owner, 'id': 'proposal', 'requestId': 'request', 'status': 'applied'})
        result = self.run_helper('watch', '--minutes', '.003', '--interval', '.1')
        self.assertEqual(json.loads(result.stdout)['event'], 'flowview_result')
        self.assertEqual(json.loads(result.stdout)['requestId'], 'request')
        self.assertEqual(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout, '')
        self.put('request.json', {**self.owner, 'id': 'next', 'text': 'Next request'})
        self.assertEqual(json.loads(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout)['id'], 'next')

    def test_fresh_monitor_does_not_redispatch_a_completed_result(self):
        self.put('result.json', {**self.owner, 'id': 'proposal', 'requestId': 'request', 'status': 'applied'})
        self.put('reply.json', {**self.owner, 'requestId': 'request'})
        self.assertEqual(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout, '')

    def test_native_begin_timeout_withdraws_its_request(self):
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
        # Deterministically cross the deadline without waiting 90 real seconds.
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Late']), patch.object(helper.time, 'monotonic', side_effect=[0, 0, 91]):
            with self.assertRaisesRegex(ValueError, 'withdrawn'):
                helper.main()
        self.assertTrue(helper.read(self.folder, 'agent-request.json')['withdrawn'])
        self.assertEqual(helper.read(self.folder, 'agent-request.json')['expiresAt'], 0)

    def active_native_turn(self, status=None):
        for name in ('cancel.json', 'proposal.json', 'result.json', 'reply.json'):
            (self.folder/name).unlink(missing_ok=True)
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
        self.put('request.json', {**self.owner, 'id': 'request', 'text': 'Original request'})
        self.put('agent-request.json', {**self.owner, 'id': 'request', 'text': 'Original request'})
        self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [{'role': 'user', 'requestId': 'request'}]})
        if status is not None:
            self.put('proposal.json', {**self.owner, 'id': 'proposal', 'requestId': 'request'})
            if status != 'pending':
                self.put('result.json', {**self.owner, 'id': 'proposal', 'requestId': 'request', 'status': status})

    def test_native_begin_reports_active_previous_turn_without_publishing(self):
        for status, message in ((None, 'Continue that request'),
                                ('applied', 'older Workbench'), ('rejected', 'proposal corrections')):
            with self.subTest(status=status):
                self.active_native_turn(status)
                before = {p.name: p.read_bytes() for p in self.folder.glob('*.json')}
                with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Next']), patch.object(helper.time, 'sleep', side_effect=AssertionError('An unfinished turn must fail immediately')):
                    with self.assertRaisesRegex(ValueError, 'Previous Workbench request request is still active') as error:
                        helper.main()
                self.assertIn(message, str(error.exception))
                self.assertIn('reply --request request', str(error.exception))
                self.assertNotIn('Re-establish', str(error.exception))
                self.assertEqual(before, {p.name: p.read_bytes() for p in self.folder.glob('*.json')})

    def completion(self, request_id='request'):
        return {**self.owner, 'id': 'proposal', 'requestId': request_id, 'status': 'applied',
                'revision': 'connection-2', 'requestCompleted': True}

    def test_begin_waits_for_acceptance_publication_then_returns_previous_result(self):
        self.active_native_turn('pending')
        ticks = []
        def browser(seconds):
            ticks.append(seconds)
            incoming = helper.read(self.folder, 'agent-request.json')
            if incoming['id'] == 'request':
                # No replacement request while approval/publication is unresolved.
                self.put('result.json', self.completion())
            else:
                self.put('request.json', {**incoming, 'revision': 'connection-2'})
                self.put('transcript.json', {'sessionId': 'session', 'messages': [
                    {'role': 'user', 'requestId': 'request', 'completion': self.completion()},
                    {'role': 'user', 'requestId': incoming['id']}]})
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['helper', '--folder', str(self.folder), 'begin', '--text', 'Next']), patch.object(helper.time, 'sleep', side_effect=browser), patch.object(sys, 'stdout', output), patch.object(sys, 'stderr', errors):
            helper.main()
        self.assertEqual(json.loads(output.getvalue())['previousResult'], self.completion())
        self.assertEqual(len(ticks), 2)
        self.assertIn('awaiting approval or its saved result', errors.getvalue())

    def test_unapproved_proposal_wait_is_bounded_and_never_registers_or_approves(self):
        self.active_native_turn('pending')
        before = {p.name: p.read_bytes() for p in self.folder.glob('*.json')}
        clock = [0]
        def advance(seconds):
            clock[0] += seconds
            self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time()*1000})
        with patch.object(sys, 'argv', ['helper', '--folder', str(self.folder), 'begin', '--text', 'Next']), patch.object(helper.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(helper.time, 'sleep', side_effect=advance), patch.object(sys, 'stderr', io.StringIO()):
            with self.assertRaisesRegex(helper.ProposalPendingError, 'awaiting approval'):
                helper.main()
        self.assertEqual(clock[0], 90)
        self.assertEqual(before['agent-request.json'], (self.folder/'agent-request.json').read_bytes())
        self.assertFalse((self.folder/'result.json').exists())

    def test_heartbeat_and_approval_wait_share_one_registration_budget(self):
        self.active_native_turn('pending')
        clock, epoch = [0], time.time()
        self.put('editor.json', {**self.owner, 'connected': True, 'at': (epoch-16)*1000})
        def advance(seconds):
            clock[0] += seconds
            if clock[0] >= 45:
                self.put('editor.json', {**self.owner, 'connected': True, 'at': (epoch+clock[0])*1000})
        errors = io.StringIO()
        with patch.object(sys, 'argv', ['helper', '--folder', str(self.folder), 'begin', '--text', 'Next']), patch.object(helper.time, 'time', side_effect=lambda: epoch+clock[0]), patch.object(helper.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(helper.time, 'sleep', side_effect=advance), patch.object(sys, 'stderr', errors):
            with self.assertRaises(helper.ProposalPendingError):
                helper.main()
        self.assertEqual(clock[0], 90)
        self.assertEqual(helper.read(self.folder, 'agent-request.json')['id'], 'request')
        self.assertIn('heartbeat paused', errors.getvalue())
        self.assertIn('awaiting approval', errors.getvalue())

    def test_acceptance_history_is_connection_bound_and_ignores_late_proposal_replacement(self):
        self.active_native_turn('applied')
        result = self.completion()
        self.put('result.json', result)
        self.put('proposal.json', {**self.owner, 'id': 'late', 'requestId': 'request'})
        self.assertEqual(helper.require_available_request(self.folder, self.owner), result)
        self.put('transcript.json', {'sessionId': 'session', 'messages': [{'role': 'user', 'requestId': 'request', 'completion': result}]})
        self.put('result.json', {**self.completion('next'), 'id': 'next-proposal'})
        self.assertEqual(helper.accepted_completion(self.folder, self.owner, 'request'), result)
        for change in ({'connectionId': 'old'}, {'requestId': 'other'}, {'status': 'rejected'}, {'requestCompleted': False}, {'revision': 'old-1'}):
            self.put('transcript.json', {'sessionId': 'session', 'messages': [{'role': 'user', 'requestId': 'request', 'completion': {**result, **change}}]})
            self.assertIsNone(helper.accepted_completion(self.folder, self.owner, 'request'))

    def test_late_reply_is_idempotent_after_accept_and_after_next_request(self):
        for next_turn in (False, True):
            with self.subTest(next_turn=next_turn):
                self.active_native_turn('applied')
                self.put('result.json', self.completion())
                self.put('transcript.json', {'sessionId': 'session', 'messages': [{'role': 'user', 'requestId': 'request', 'completion': self.completion()}]})
                if next_turn:
                    self.put('request.json', {**self.owner, 'id': 'next'})
                    self.put('result.json', self.completion('next'))
                self.put('reply.json', {**self.owner, 'id': 'next-reply', 'requestId': 'next', 'text': 'Keep me'})
                before = {p.name: p.read_bytes() for p in self.folder.glob('*.json')}
                reply = self.run_helper('reply', '--request', 'request', '--text', 'Legacy receipt')
                self.assertEqual(reply.returncode, 0, reply.stderr)
                self.assertTrue(json.loads(reply.stdout)['requestCompleted'])
                self.assertEqual(before, {p.name: p.read_bytes() for p in self.folder.glob('*.json')})
                for command, args in [('progress', ['--text', 'Late']), ('propose', ['--file', 'candidate.spec.json', '--revision', 'connection-1'])]:
                    late = self.run_helper(command, '--request', 'request', *args)
                    self.assertNotEqual(late.returncode, 0)
                self.assertEqual(before, {p.name: p.read_bytes() for p in self.folder.glob('*.json')})

    def test_output_publication_rechecks_terminal_state_after_completion_reads(self):
        for change in ('owner', 'request', 'cancel', 'disconnect'):
            with self.subTest(change=change):
                self.active_native_turn()
                self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time()*1000})
                self.put('result.json', {})
                original, changed = helper.read, [False]
                replacement = {**self.owner, 'id': 'preserve-new-proposal', 'requestId': 'new-request'}
                def read(folder, name):
                    value = original(folder, name)
                    if name == 'result.json' and not changed[0]:
                        changed[0] = True
                        if change == 'owner':
                            self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'connectionId': 'new-owner'})
                        elif change == 'request':
                            self.put('request.json', {**self.owner, 'id': 'new-request'})
                        elif change == 'cancel':
                            self.put('cancel.json', {**self.owner, 'requestId': 'request'})
                        else:
                            self.put('editor.json', {**self.owner, 'connected': False})
                        self.put('proposal.json', replacement)
                    return value
                with patch.object(helper, 'read', side_effect=read):
                    with self.assertRaises(ValueError):
                        helper.write(self.folder, 'proposal.json', {**self.owner, 'id': 'old-proposal', 'requestId': 'request'},
                                     guard=lambda: helper.active_request(self.folder, self.owner, 'request'))
                self.assertEqual(original(self.folder, 'proposal.json'), replacement)

    def test_completed_reply_rechecks_cancellation_after_trailing_editor_read(self):
        self.active_native_turn('applied')
        self.put('result.json', self.completion())
        original, inspected = helper.read, [False]
        def read(folder, name):
            value = original(folder, name)
            if name == 'result.json':
                inspected[0] = True
            if name == 'editor.json' and inspected[0]:
                self.put('cancel.json', {**self.owner, 'requestId': 'request'})
            return value
        with patch.object(sys, 'argv', ['helper', '--folder', str(self.folder), 'reply', '--request', 'request', '--text', 'Late']), patch.object(helper, 'read', side_effect=read):
            with self.assertRaisesRegex(ValueError, 'stopped'):
                helper.main()
        self.assertFalse((self.folder/'reply.json').exists())

    def test_reply_racing_acceptance_is_idempotent_without_overwriting_next_reply(self):
        self.active_native_turn()
        original = helper.write
        def publish(folder, name, value, guard=None):
            self.put('result.json', self.completion())
            original(folder, name, value, guard)
        output = io.StringIO()
        with patch.object(sys, 'argv', ['helper', '--folder', str(self.folder), 'reply', '--request', 'request', '--text', 'Done']), patch.object(helper, 'write', side_effect=publish), patch.object(sys, 'stdout', output):
            helper.main()
        self.assertTrue(json.loads(output.getvalue())['requestCompleted'])
        self.assertFalse((self.folder/'reply.json').exists())

    def test_completed_reply_keeps_disconnect_cancel_permission_and_owner_guards(self):
        for change in ('disconnect', 'cancel', 'owner', 'permission', 'malformed'):
            with self.subTest(change=change):
                self.active_native_turn('applied')
                self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time()*1000})
                self.put('result.json', self.completion())
                original = helper.read
                def read(folder, name):
                    if name == 'result.json':
                        if change == 'permission':
                            raise PermissionError('Receipt permission denied')
                        if change == 'owner':
                            self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'connectionId': 'other'})
                        if change == 'cancel':
                            self.put('cancel.json', {**self.owner, 'requestId': 'request'})
                        if change == 'disconnect':
                            self.put('editor.json', {**self.owner, 'connected': False})
                        if change == 'malformed':
                            self.put('result.json', [])
                    return original(folder, name)
                with patch.object(sys, 'argv', ['helper', '--folder', str(self.folder), 'reply', '--request', 'request', '--text', 'Late']), patch.object(helper, 'read', side_effect=read):
                    with self.assertRaises((ValueError, PermissionError)):
                        helper.main()
                self.assertFalse((self.folder/'reply.json').exists())

    def test_native_begin_allows_completion_receipt_to_drain_before_acknowledgement(self):
        self.active_native_turn('applied')
        self.put('reply.json', {**self.owner, 'id': 'completion', 'requestId': 'request', 'text': 'Done'})
        def browser_poll(seconds):
            attempt = helper.read(self.folder, 'agent-request.json')
            self.assertNotEqual(attempt['id'], 'request')
            self.put('request.json', {**attempt, 'revision': 'connection-2'})
            self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [
                {'role': 'user', 'requestId': 'request'}, {'role': 'assistant', 'requestId': 'request'},
                {'role': 'user', 'requestId': attempt['id']}]})
        output = io.StringIO()
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Next']), patch.object(helper.time, 'sleep', side_effect=browser_poll) as sleeping, patch.object(sys, 'stdout', output):
            helper.main()
        sleeping.assert_called_once()
        self.assertEqual(json.loads(output.getvalue())['id'], helper.read(self.folder, 'request.json')['id'])

    def test_active_turn_check_does_not_accept_invalid_or_blocked_completion_receipts(self):
        self.active_native_turn('applied')
        receipt = {**self.owner, 'id': 'completion', 'requestId': 'request', 'text': 'Done'}
        for change in ({'connectionId': 'other'}, {'requestId': 'other'}, {'id': '!'}, {'text': None}, {'text': '\U0001f600'*16001}):
            with self.subTest(change=list(change)):
                self.put('reply.json', {**receipt, **change})
                with self.assertRaisesRegex(ValueError, 'still active'):
                    helper.require_available_request(self.folder, self.owner)
        self.put('reply.json', receipt)
        (self.folder/'result.json').unlink()
        with self.assertRaisesRegex(ValueError, 'matching proposal result'):
            helper.require_available_request(self.folder, self.owner)

    def test_active_turn_check_distinguishes_finished_cancelled_and_other_owner_history(self):
        for kind in ('finished', 'cancelled', 'cancel receipt', 'other connection', 'other session'):
            with self.subTest(kind=kind):
                self.active_native_turn('applied')
                (self.folder/'cancel.json').unlink(missing_ok=True)
                if kind == 'finished':
                    self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [{'role': 'user', 'requestId': 'request'}, {'role': 'assistant', 'requestId': 'request'}]})
                elif kind == 'cancelled':
                    self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [{'role': 'user', 'requestId': 'request', 'cancelled': True}]})
                elif kind == 'cancel receipt':
                    self.put('cancel.json', {**self.owner, 'requestId': 'request'})
                elif kind == 'other connection':
                    self.put('request.json', {**self.owner, 'id': 'request', 'connectionId': 'other'})
                else:
                    self.put('transcript.json', {'sessionId': 'other', 'messages': [{'role': 'user', 'requestId': 'request'}]})
                helper.require_available_request(self.folder, self.owner)

    def test_native_begin_rechecks_active_turn_before_publication(self):
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
        original_write = helper.write
        def publish(folder, name, value, guard=None):
            self.active_native_turn('applied')
            original_write(folder, name, value, guard)
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Racing request']), patch.object(helper, 'write', side_effect=publish):
            with self.assertRaisesRegex(ValueError, 'Previous Workbench request request'):
                helper.main()
        self.assertEqual(helper.read(self.folder, 'agent-request.json')['id'], 'request')

    def test_active_turn_check_reports_malformed_access_and_owner_changes(self):
        for filename in ('request.json', 'transcript.json', 'cancel.json', 'proposal.json', 'result.json', 'reply.json'):
            with self.subTest(filename=filename):
                self.active_native_turn('applied')
                self.put(filename, [])
                with self.assertRaisesRegex(ValueError, 'Invalid Workbench protocol file'):
                    helper.require_available_request(self.folder, self.owner)
                (self.folder/filename).unlink()
        self.active_native_turn('applied')
        read = helper.read
        for change in ('permission', 'owner', 'request'):
            with self.subTest(change=change):
                self.active_native_turn('applied')
                def racing_read(folder, name):
                    if name == 'reply.json':
                        if change == 'permission':
                            raise PermissionError('Cannot read completion receipt')
                        if change == 'owner':
                            self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'connectionId': 'replacement'})
                        else:
                            self.put('request.json', {**self.owner, 'id': 'replacement'})
                    return read(folder, name)
                self.put('reply.json', {})
                with patch.object(helper, 'read', side_effect=racing_read):
                    with self.assertRaises((PermissionError, ValueError)) as error:
                        helper.require_available_request(self.folder, self.owner)
                self.assertNotIn('still active', str(error.exception))

    def test_native_begin_waits_for_editor_ack_and_refuses_embedded_workflow(self):
        self.assertIn('external', self.run_helper('begin', '--text', 'Change the story').stderr.lower().replace('work in your agent', 'external'))
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
        process = subprocess.Popen([sys.executable, str(HELPER), '--folder', str(self.folder), 'begin', '--text', 'Native request'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 3
            while not (self.folder/'agent-request.json').exists() and time.monotonic() < deadline:
                time.sleep(.02)
            request = helper.read(self.folder, 'agent-request.json')
            self.assertEqual(request['text'], 'Native request')
            self.assertGreater(request['expiresAt'], time.time()*1000)
            self.put('request.json', {**request, 'revision': 'connection-1'})
            time.sleep(.2)
            self.assertIsNone(process.poll(), 'Publishing request.json alone must not acknowledge the turn')
            self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [{'role': 'user', 'requestId': request['id'], 'text': request['text']}]})
            output, error = process.communicate(timeout=3)
            self.assertEqual(process.returncode, 0, error)
            self.assertEqual(json.loads(output)['id'], request['id'])
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()

    def test_native_begin_permission_failure_during_acknowledgement_is_immediate_and_withdrawn(self):
        for filename in ('request.json', 'transcript.json', 'editor.json'):
            with self.subTest(filename=filename):
                self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
                self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': []})
                registered = [False]
                original_read, original_write = helper.read, helper.write
                def write(folder, name, value, guard=None):
                    original_write(folder, name, value, guard)
                    if name == 'agent-request.json' and not value.get('withdrawn'):
                        self.put('request.json', {**value, 'revision': 'connection-1'})
                        registered[0] = True
                def read(folder, name):
                    if registered[0] and name == filename:
                        raise PermissionError(f'Access denied reading {filename}')
                    return original_read(folder, name)
                output, errors = io.StringIO(), io.StringIO()
                with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Denied acknowledgement']), patch.object(helper, 'write', side_effect=write), patch.object(helper, 'read', side_effect=read), patch.object(helper.time, 'sleep', side_effect=AssertionError('Terminal acknowledgement errors must not retry')) as sleeping, patch.object(sys, 'stdout', output), patch.object(sys, 'stderr', errors):
                    with self.assertRaisesRegex(PermissionError, f'Access denied reading {filename}'):
                        helper.main()
                    sleeping.assert_not_called()
                self.assertEqual(output.getvalue(), '')
                self.assertIn(f'Access denied reading {filename}', errors.getvalue())
                self.assertNotIn('in time', errors.getvalue())
                self.assertTrue(helper.read(self.folder, 'agent-request.json')['withdrawn'])
                self.assertEqual(helper.read(self.folder, 'agent-request.json')['expiresAt'], 0)

    def test_native_begin_terminal_change_inside_acknowledgement_is_not_retried(self):
        for change in ('cancel', 'owner', 'request identity', 'malformed transcript'):
            with self.subTest(change=change):
                self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
                (self.folder/'transcript.json').unlink(missing_ok=True)
                (self.folder/'cancel.json').unlink(missing_ok=True)
                original_read, original_write = helper.read, helper.write
                registered = [False]
                def write(folder, name, value, guard=None):
                    original_write(folder, name, value, guard)
                    if name == 'agent-request.json' and not value.get('withdrawn'):
                        self.put('request.json', {**value, 'revision': 'connection-1'})
                        registered[0] = True
                def read(folder, name):
                    value = original_read(folder, name)
                    if registered[0] and name == 'request.json':
                        registered[0] = False
                        if change == 'cancel':
                            self.put('cancel.json', {**self.owner, 'requestId': value['id']})
                        elif change == 'owner':
                            self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'connectionId': 'replacement'})
                            self.put('agent-request.json', {'id': 'replacement-request'})
                        elif change == 'request identity':
                            self.put('request.json', {**value, 'connectionId': 'replacement'})
                        else:
                            (self.folder/'transcript.json').write_text('{broken')
                    return value
                errors = io.StringIO()
                with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Terminal change']), patch.object(helper, 'write', side_effect=write), patch.object(helper, 'read', side_effect=read), patch.object(helper.time, 'sleep', side_effect=AssertionError('Terminal acknowledgement errors must not retry')) as sleeping, patch.object(sys, 'stderr', errors):
                    with self.assertRaises(ValueError):
                        helper.main()
                    sleeping.assert_not_called()
                self.assertIn('Workbench acknowledgement failed', errors.getvalue())
                self.assertNotIn('in time', errors.getvalue())
                attempt = helper.read(self.folder, 'agent-request.json')
                if change == 'owner':
                    self.assertEqual(attempt, {'id': 'replacement-request'})
                    self.assertIn('Withdrawal could not be confirmed', errors.getvalue())
                else:
                    self.assertTrue(attempt['withdrawn'])

    def test_native_begin_retries_only_missing_or_empty_acknowledgement_files(self):
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
        (self.folder/'request.json').unlink()
        step = [0]
        def sleep(seconds):
            step[0] += 1
            if step[0] == 1:
                (self.folder/'request.json').write_text('')
            elif step[0] == 2:
                self.put('request.json', {**helper.read(self.folder, 'agent-request.json'), 'revision': 'connection-1'})
            elif step[0] == 3:
                (self.folder/'transcript.json').write_text('')
            elif step[0] == 4:
                request = helper.read(self.folder, 'agent-request.json')
                self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [{'role': 'user', 'requestId': request['id']}]})
            else:
                self.fail('Acknowledgement should have completed')
        output = io.StringIO()
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Pending files']), patch.object(helper.time, 'sleep', side_effect=sleep), patch.object(sys, 'stdout', output):
            helper.main()
        self.assertEqual(step[0], 4)
        self.assertEqual(json.loads(output.getvalue())['id'], helper.read(self.folder, 'agent-request.json')['id'])
        self.assertNotIn('withdrawn', helper.read(self.folder, 'agent-request.json'))

    def test_stale_commands_recover_after_background_heartbeat_without_rotating_ids(self):
        for command in ('progress', 'reply', 'propose'):
            with self.subTest(command=command):
                now = [1000.0]
                self.put('editor.json', {**self.owner, 'connected': True, 'at': 0})
                def sleep(seconds):
                    now[0] += seconds
                    if now[0] >= 1060:
                        self.put('editor.json', {**self.owner, 'connected': True, 'at': now[0]*1000})
                args = ['--file', 'candidate.spec.json', '--revision', 'connection-1'] if command == 'propose' else ['--text', 'Recovered']
                output, errors = io.StringIO(), io.StringIO()
                with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), command, '--request', 'request', *args]), patch.object(helper.time, 'time', side_effect=lambda: now[0]), patch.object(helper.time, 'monotonic', side_effect=lambda: now[0]), patch.object(helper.time, 'sleep', side_effect=sleep), patch.object(sys, 'stdout', output), patch.object(sys, 'stderr', errors):
                    helper.main()
                filename = 'proposal.json' if command == 'propose' else command + '.json'
                self.assertEqual(json.loads(output.getvalue())['written'], filename)
                self.assertIn('waiting up to 90 seconds', errors.getvalue())
                self.assertEqual(now[0], 1060)
                self.assertEqual(helper.identity(self.folder), self.owner)
                self.assertEqual(helper.read(self.folder, filename)['requestId'], 'request')

    def test_stale_recovery_is_bounded_and_does_not_publish(self):
        now = [1000.0]
        self.put('editor.json', {**self.owner, 'connected': True, 'at': 0})
        def sleep(seconds):
            now[0] += seconds
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'reply', '--request', 'request', '--text', 'Do not publish']), patch.object(helper.time, 'time', side_effect=lambda: now[0]), patch.object(helper.time, 'monotonic', side_effect=lambda: now[0]), patch.object(helper.time, 'sleep', side_effect=sleep), patch.object(sys, 'stderr', io.StringIO()):
            with self.assertRaisesRegex(helper.HeartbeatPausedError, 'existing Workbench tab.*same session and request IDs'):
                helper.main()
        self.assertEqual(now[0], 1090)
        self.assertFalse((self.folder/'reply.json').exists())

    def test_recovery_stops_immediately_for_terminal_changes_and_permission_errors(self):
        for change in ('owner', 'request', 'cancel', 'disconnect', 'editor identity', 'permission'):
            with self.subTest(change=change):
                self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner})
                self.put('request.json', {**self.owner, 'id': 'request'})
                (self.folder/'cancel.json').unlink(missing_ok=True)
                self.put('editor.json', {**self.owner, 'connected': True, 'at': 0})
                def sleep(seconds):
                    if change == 'owner':
                        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'connectionId': 'replacement'})
                    elif change == 'request':
                        self.put('request.json', {**self.owner, 'id': 'replacement'})
                    elif change == 'cancel':
                        self.put('cancel.json', {**self.owner, 'requestId': 'request'})
                    elif change == 'disconnect':
                        self.put('editor.json', {**self.owner, 'connected': False, 'at': 0})
                    elif change == 'editor identity':
                        self.put('editor.json', {**self.owner, 'connectionId': 'replacement', 'connected': True, 'at': 0})
                    else:
                        raise PermissionError('Folder permission denied')
                with patch.object(helper.time, 'sleep', side_effect=sleep) as sleeping, patch.object(sys, 'stderr', io.StringIO()):
                    with self.assertRaises((ValueError, PermissionError)) as error:
                        helper.wait_for_editor(self.folder, self.owner, 'request')
                    self.assertNotIsInstance(error.exception, helper.HeartbeatPausedError)
                    self.assertEqual(sleeping.call_count, 1)
                self.assertFalse((self.folder/'reply.json').exists())

    def test_publication_guard_never_waits_or_accepts_a_stale_lease(self):
        self.put('editor.json', {**self.owner, 'connected': True, 'at': 0})
        with patch.object(helper.time, 'sleep') as sleeping:
            with self.assertRaises(helper.HeartbeatPausedError):
                helper.write(self.folder, 'reply.json', {}, guard=lambda: helper.active_request(self.folder, self.owner, 'request'))
            sleeping.assert_not_called()
        self.assertFalse((self.folder/'reply.json').exists())
        self.assertEqual(list(self.folder.glob('.reply.json-*')), [])

    def test_native_begin_tolerates_separate_minute_delays_for_heartbeat_and_acknowledgement(self):
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'workflow': 'external'})
        self.put('editor.json', {**self.owner, 'connected': True, 'at': 0})
        now = [1000.0]
        def sleep(seconds):
            now[0] += seconds
            if now[0] >= 1060 and now[0] < 1061 or now[0] >= 1120:
                self.put('editor.json', {**self.owner, 'connected': True, 'at': now[0]*1000})
            if now[0] >= 1120:
                request = helper.read(self.folder, 'agent-request.json')
                self.put('request.json', {**request, 'revision': 'connection-1'})
                self.put('transcript.json', {'sessionId': self.owner['sessionId'], 'messages': [{'role': 'user', 'requestId': request['id'], 'text': request['text']}]})
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Background request']), patch.object(helper.time, 'time', side_effect=lambda: now[0]), patch.object(helper.time, 'monotonic', side_effect=lambda: now[0]), patch.object(helper.time, 'sleep', side_effect=sleep), patch.object(sys, 'stdout', output), patch.object(sys, 'stderr', errors):
            helper.main()
        request = helper.read(self.folder, 'request.json')
        self.assertEqual(json.loads(output.getvalue())['id'], request['id'])
        self.assertEqual(request['expiresAt'], 1150000)
        self.assertGreaterEqual(now[0], 1120)
        self.assertLess(now[0], 1121)
        self.assertEqual(helper.identity(self.folder), self.owner)
        self.assertIn('acknowledgement', errors.getvalue())

    def test_watcher_ignores_stale_heartbeat_and_old_connection(self):
        self.put('editor.json', {**self.owner, 'connected': True, 'at': 0})
        self.assertEqual(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout, '')
        self.put('editor.json', {**self.owner, 'connectionId': 'old', 'connected': True, 'at': time.time()*1000})
        self.assertEqual(self.run_helper('watch', '--minutes', '.003', '--interval', '.1').stdout, '')

    def test_progress_accumulates_short_text_and_file_updates_for_only_the_current_request(self):
        for args in [('--text', 'Reading the story'), ('--file', 'answer.txt')]:
            run = self.run_helper('progress', '--request', 'request', *args)
            self.assertEqual(run.returncode, 0, run.stderr)
        progress = helper.read(self.folder, 'progress.json')
        self.assertEqual([event['text'] for event in progress['events']], ['Reading the story', 'Our customer is ready.'])
        self.assertEqual(progress['text'], 'Our customer is ready.')  # Older editor compatibility.
        self.put('request.json', {**self.owner, 'id': 'next'})
        run = self.run_helper('progress', '--request', 'next', '--text', 'Starting next turn')
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(len(helper.read(self.folder, 'progress.json')['events']), 1)
        self.assertIn('no longer current', self.run_helper('progress', '--request', 'request', '--text', 'Too late').stderr)

    def test_progress_history_has_count_and_byte_bounds(self):
        value = {**self.owner, 'requestId': 'request', 'id': 'latest', 'at': 1, 'text': 'New'}
        self.put('progress.json', [])
        self.assertEqual(len(helper.progress_history(self.folder, value)), 1)
        self.put('progress.json', {**value, 'events': [{'id': str(i), 'at': 0, 'text': str(i)} for i in range(120)]})
        events = helper.progress_history(self.folder, value)
        self.assertEqual(len(events), 100)
        self.assertEqual(events[-1]['id'], 'latest')
        self.put('progress.json', {**value, 'events': [{'id': str(i), 'text': '\x01'*32000} for i in range(10)]})
        events = helper.progress_history(self.folder, value)
        self.assertLess(len(json.dumps(events).encode()), 513*1024)
        self.assertEqual(events[-1]['text'], 'New')

    def test_cancelled_turn_rejects_all_helper_outputs_and_watcher_reports_cancellation(self):
        self.put('cancel.json', {**self.owner, 'id': 'cancel-1', 'requestId': 'request'})
        for command in [('propose', '--revision', 'connection-1', '--file', 'candidate.spec.json'),
                        ('reply', '--text', 'Too late'), ('progress', '--text', 'Still going')]:
            result = self.run_helper(command[0], '--request', 'request', *command[1:])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('turn was stopped', result.stderr)
        self.assertFalse((self.folder/'proposal.json').exists())
        run = self.run_helper('watch', '--minutes', '.003', '--interval', '.1')
        self.assertEqual(run.returncode, 0, run.stderr)
        events = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual([event['event'] for event in events], ['flowview_cancel'])
        self.assertEqual(events[0]['requestId'], 'request')
        self.put('request.json', {**self.owner, 'id': 'next'})
        self.assertEqual(self.run_helper('reply', '--request', 'next', '--text', 'Fresh turn').returncode, 0)

    def test_foreign_cancellation_cannot_stop_this_session(self):
        self.put('cancel.json', {**self.owner, 'connectionId': 'old', 'id': 'cancel-1', 'requestId': 'request'})
        self.assertEqual(self.propose().returncode, 0)

    def test_guard_rechecks_ownership_and_cancellation_before_publication(self):
        self.put('cancel.json', {**self.owner, 'id': 'cancel-1', 'requestId': 'request'})
        with self.assertRaisesRegex(ValueError, 'turn was stopped'):
            helper.write(self.folder, 'reply.json', {'text': 'unsafe late reply'},
                         guard=lambda: helper.active_request(self.folder, self.owner, 'request'))
        self.assertFalse((self.folder/'reply.json').exists())
        self.assertEqual(list(self.folder.glob('.reply.json-*')), [])
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner, 'connectionId': 'other'})
        with self.assertRaisesRegex(ValueError, 'ownership changed'):
            helper.write(self.folder, 'listener.json', {}, guard=lambda: helper.assert_owner(self.folder, self.owner))
        self.assertFalse((self.folder/'listener.json').exists())

    def test_preflight_reports_existing_prerequisites_without_installing_or_claiming_monitor(self):
        with patch.object(helper.shutil, 'which', return_value=None):
            report = helper.preflight(self.folder)
        checks = {check['id']: check for check in report['checks']}
        self.assertFalse(report['ready'])
        self.assertEqual(checks['node']['status'], 'missing')
        self.assertEqual(checks['monitor']['status'], 'unverified')
        self.assertEqual(checks['editor']['status'], 'ready')
        self.assertFalse((self.folder/'authoring').exists())
        self.assertEqual(helper.read(self.folder, 'preflight.json')['connectionId'], self.owner['connectionId'])
        with patch.object(helper.shutil, 'which', return_value='/example/node'):
            ready = helper.preflight(self.folder, monitor='available')
        self.assertTrue(ready['ready'])
        run = self.run_helper('preflight', '--monitor', 'unavailable')
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertFalse(json.loads(run.stdout)['ready'])

    def test_retired_operation_flags_never_publish_a_proposal(self):
        self.put('candidate.spec.json', {'title': 'Complete document'})
        for flags in [('--operations', 'candidate.spec.json'), ('--file', 'candidate.spec.json', '--dry-run')]:
            run = self.run_helper('propose', '--request', 'request', '--revision', 'connection-1', *flags)
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse((self.folder/'proposal.json').exists())
        run = self.run_helper('propose', '--request', 'request', '--revision', 'connection-1', '--file', 'candidate.spec.json')
        self.assertEqual(run.returncode, 0, run.stderr)
        proposal = helper.read(self.folder, 'proposal.json')
        self.assertEqual(proposal['source'], (self.folder/'candidate.spec.json').read_text())
        self.assertEqual(proposal['baseRevision'], 'connection-1')
        self.assertNotIn('operations', proposal)
        self.assertNotIn('dryRun', proposal)

    def test_permission_needed_progress_preserves_reported_phase(self):
        run = self.run_helper('progress', '--request', 'request', '--text', 'Waiting for approval in Claude.', '--phase', 'permission-needed')
        self.assertEqual(run.returncode, 0, run.stderr)
        progress = helper.read(self.folder, 'progress.json')
        self.assertEqual(progress['phase'], 'permission-needed')
        self.assertEqual(progress['events'][0]['phase'], 'permission-needed')


if __name__ == '__main__':
    unittest.main()
