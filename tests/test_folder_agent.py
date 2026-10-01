"""Exercise the exact helper Claude receives; no Claude process or network."""
import base64
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shlex
import shutil
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


def run_main(folder, *args):
    """Run the helper CLI in-process so file-system faults can be injected."""
    out, err, code = io.StringIO(), io.StringIO(), 0
    with patch.object(sys, 'argv', [str(HELPER), '--folder', str(folder), *args]), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            helper.main()
        except SystemExit as ex:
            code = ex.code
    return code, out.getvalue(), err.getvalue()


def failing_unlink(predicate):
    """Make Path.unlink fail for matching file names (cleanup faults)."""
    real = Path.unlink

    def unlink(path, *args, **kwargs):
        if predicate(path.name):
            raise OSError('injected cleanup failure')
        return real(path, *args, **kwargs)
    return patch.object(Path, 'unlink', unlink)


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
        retired = ['docs/agent-operations.md', 'docs/agent-intent-testing.md', 'src/workbench/agent-operations.js']
        self.kit({skill: 'Old skill', **dict.fromkeys(retired, 'Old API guidance')})
        helper.prepare(self.folder)
        note = self.folder/'authoring/operator-notes.md'
        note.write_text('Keep my notes')
        self.kit({skill: 'Restored full-document skill'})
        helper.prepare(self.folder)
        self.assertEqual((self.folder/'authoring'/skill).read_text(), 'Restored full-document skill')
        self.assertTrue(all(not (self.folder/'authoring'/name).exists() for name in retired))
        self.assertEqual(note.read_text(), 'Keep my notes')
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
        # Deterministically cross the deadline without waiting eight real seconds.
        with patch.object(sys, 'argv', ['folder-agent.py', '--folder', str(self.folder), 'begin', '--text', 'Late']), patch.object(helper.time, 'monotonic', side_effect=[0, 9]):
            with self.assertRaisesRegex(ValueError, 'withdrawn'):
                helper.main()
        self.assertTrue(helper.read(self.folder, 'agent-request.json')['withdrawn'])
        self.assertEqual(helper.read(self.folder, 'agent-request.json')['expiresAt'], 0)

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


NODE = shutil.which('node')
RUNTIME = ROOT / 'tools/canon/generated-runtime.cjs'
EXAMPLE = ROOT / 'examples/device-app-navigation/device-app-navigation.spec.json'
# The browser module writes the packet; run it exactly as the workbench bundle would.
PACKET_SCRIPT = r"""
const vm=require('node:vm'),fs=require('node:fs'),{readSource}=require(process.env.FLOWVIEW_LOADER);
const c={};vm.createContext(c);
for(const file of ['workbench/targets.js','workbench/focused-panel.js'])vm.runInContext(readSource(file),c);
const input=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(Array.isArray(input)?input.map(item=>c.focusedPanelPacket(item)):c.focusedPanelPacket(input)));
"""
fragment_spec = importlib.util.spec_from_file_location('panel_fragment', ROOT / 'tools/panel_fragment.py')
pf = importlib.util.module_from_spec(fragment_spec)
fragment_spec.loader.exec_module(pf)


class PublishPairTests(unittest.TestCase):
    """Both candidate files are installed together, or both keep their exact prior state."""
    NAMES = ('candidate.spec.json', 'candidate.ledger.md')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-publish-test-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def prior(self, spec, ledger):
        for name, data in zip(self.NAMES, (spec, ledger)):
            if data is not None:
                (self.folder / name).write_bytes(data)

    def state(self):
        return tuple((self.folder / name).read_bytes() if (self.folder / name).exists() else None for name in self.NAMES)

    def hidden(self):
        return sorted(p.name for p in self.folder.iterdir() if p.name.startswith('.'))

    def publish(self, fail=lambda source, target: False):
        real, self.calls = os.replace, []

        def replace(source, target, *args, **kwargs):
            self.calls.append((Path(source).name, Path(target).name))
            if fail(Path(source).name, Path(target).name):
                raise OSError('injected rename failure')
            return real(source, target, *args, **kwargs)
        with patch.object(helper.os, 'replace', replace):
            helper.publish_pair(self.folder, [(self.NAMES[0], '{"new": "spec ✓"}\n'), (self.NAMES[1], '# New ledger\n')], lambda: None)

    @staticmethod
    def second_install(source, target):
        return target == 'candidate.ledger.md' and '-backup-' not in source

    def test_second_rename_failure_restores_both_prior_targets_or_their_absence(self):
        spec, ledger = b'{"prior": "spec \xe2\x9c\x93"}\r\n', b'# Prior ledger\r\nkept exactly\n'
        for name, before in [('both prior files', (spec, ledger)), ('no prior files', (None, None)),
                             ('only a prior spec', (spec, None)), ('only a prior ledger', (None, ledger))]:
            with self.subTest(name):
                for existing in self.NAMES:
                    (self.folder / existing).unlink(missing_ok=True)
                self.prior(*before)
                with self.assertRaisesRegex(OSError, 'injected'):
                    self.publish(self.second_install)
                # The spec really was replaced before the ledger failed, then undone.
                self.assertEqual([target for _, target in self.calls[:2]], list(self.NAMES))
                if before[0] is not None:
                    self.assertEqual(self.calls[2][1], 'candidate.spec.json')
                    self.assertIn('-backup-', self.calls[2][0], 'the prior spec is restored from its backup')
                self.assertEqual(self.state(), before)
                self.assertEqual(self.hidden(), [], 'staged files and backups are cleaned up')

    def test_first_rename_failure_and_guard_failure_touch_nothing(self):
        self.prior(b'old spec', None)
        with self.assertRaisesRegex(OSError, 'injected'):
            self.publish(lambda source, target: target == 'candidate.spec.json')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.state(), (b'old spec', None))

        def guard():
            raise ValueError('request cancelled')
        with self.assertRaisesRegex(ValueError, 'cancelled'):
            helper.publish_pair(self.folder, [(self.NAMES[0], 'new'), (self.NAMES[1], 'new')], guard)
        self.assertEqual(self.state(), (b'old spec', None))
        self.assertEqual(self.hidden(), [])

    def test_unrestorable_prior_candidate_is_kept_as_a_named_backup(self):
        self.prior(b'earlier user candidate', b'earlier ledger')
        with self.assertRaisesRegex(OSError, r'preserved as \.candidate\.spec\.json-backup-'):
            self.publish(lambda source, target: self.second_install(source, target) or
                         (target == 'candidate.spec.json' and '-backup-' in source))
        backups = self.hidden()
        self.assertEqual(len(backups), 1)
        self.assertEqual((self.folder / backups[0]).read_bytes(), b'earlier user candidate')
        self.assertEqual((self.folder / 'candidate.ledger.md').read_bytes(), b'earlier ledger')

    def test_backup_cleanup_failure_after_both_installs_is_a_committed_success(self):
        self.prior(b'earlier spec', b'earlier ledger')
        with failing_unlink(lambda name: '-backup-' in name):
            warnings = helper.publish_pair(self.folder, [(self.NAMES[0], 'new spec'), (self.NAMES[1], 'new ledger')], lambda: None)
        self.assertEqual(self.state(), (b'new spec', b'new ledger'))
        self.assertEqual(len(warnings), 2)
        for warning in warnings:
            self.assertIn('The pair is installed', warning)
            self.assertIn('holds the previous candidate', warning)
        backups = self.hidden()
        self.assertEqual(len(backups), 2)
        self.assertTrue(all('-backup-' in name and name in ' '.join(warnings) for name in backups))
        self.assertEqual(sorted((self.folder / name).read_bytes() for name in backups), [b'earlier ledger', b'earlier spec'])

    def test_cleanup_failure_never_masks_the_original_failure(self):
        spec, ledger = b'prior spec', b'prior ledger'
        self.prior(spec, ledger)
        with failing_unlink(lambda name: name.startswith('.')), \
                self.assertRaisesRegex(OSError, 'injected rename failure') as caught:
            self.publish(self.second_install)
        self.assertEqual(self.state(), (spec, ledger))
        # The spec backup was consumed by its restore; the unused staged ledger and
        # the redundant ledger backup could not be removed and are reported.
        retained = caught.exception.retained
        self.assertEqual(sorted(retained), self.hidden())
        self.assertEqual(len(retained), 2)
        self.assertEqual([(self.folder / name).read_bytes() for name in retained if '-backup-' in name], [ledger])

        def guard():
            raise ValueError('request cancelled')
        with failing_unlink(lambda name: name.startswith('.')), \
                self.assertRaisesRegex(ValueError, 'request cancelled') as refused:
            helper.publish_pair(self.folder, [(self.NAMES[0], 'new'), (self.NAMES[1], 'new')], guard)
        self.assertEqual(self.state(), (spec, ledger))
        self.assertEqual(len(refused.exception.retained), 2, 'both staged files are reported, not hidden')

    def test_refusal_reply_reports_files_an_unfinished_undo_left(self):
        failure = OSError('Publishing the candidate pair failed and could not be fully undone.')
        failure.written = ['candidate.spec.json']
        failure.retained = ['.candidate.spec.json-backup-abc']
        with patch.object(helper, 'assemble_deviceapp', side_effect=failure):
            code, out, err = run_main(self.folder, 'assemble-deviceapp', '--request', 'req1', '--task', 'focus-req1.json')
        self.assertEqual((code, out), (1, ''))
        reply = json.loads(err)
        self.assertEqual((reply['refused'], reply['written'], reply['retained']),
                         (True, ['candidate.spec.json'], ['.candidate.spec.json-backup-abc']))
        with patch.object(helper, 'assemble_deviceapp', side_effect=ValueError('Request is no longer current')):
            reply = json.loads(run_main(self.folder, 'assemble-deviceapp', '--request', 'req1', '--task', 'focus-req1.json')[2])
        self.assertEqual(reply['written'], [])
        self.assertNotIn('retained', reply)

    def test_success_installs_exact_bytes_and_leaves_no_backups(self):
        self.prior(b'old', b'old')
        self.publish()
        self.assertEqual(self.state(), ('{"new": "spec ✓"}\n'.encode('utf-8'), b'# New ledger\n'))
        self.assertEqual(self.hidden(), [])


@unittest.skipUnless(NODE and RUNTIME.is_file(), 'Node and the generated runtime are required to validate candidates')
class FocusedAssemblyTests(unittest.TestCase):
    """JS packet -> edited fragment -> assemble-deviceapp -> existing full-document propose."""
    LEDGER = '# Coverage ledger\n\nCards follow the story; résumé ✓.\n'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-focused-test-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.owner = {'sessionId': 'session', 'connectionId': 'connection'}
        self.source = EXAMPLE.read_text(encoding='utf-8')
        self.reset()

    def put(self, name, value):
        (self.folder / name).write_text(json.dumps(value), encoding='utf-8')

    def reset(self):
        self.put('session.json', {'protocol': 'flowview-folder-v1', 'workflow': 'external', 'pairedArtifacts': True, **self.owner})
        self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time() * 1000})
        self.put('state.json', {**self.owner, 'revision': 'connection-3', 'project': 'story-1', 'open': True,
                                 'source': self.source, 'ledger': self.LEDGER})
        payload = {'requestId': 'req1', **self.owner, 'project': 'story-1', 'revision': 'connection-3', 'source': self.source,
                   'ledger': self.LEDGER, 'selection': [{'section': 0, 'kind': 'panel', 'index': 0, 'id': 'app'}],
                   'open': True, 'previewCurrent': True}
        run = subprocess.run([NODE, '-e', PACKET_SCRIPT], input=json.dumps(payload), capture_output=True, text=True, timeout=60,
                             env={**os.environ, 'FLOWVIEW_LOADER': str(ROOT / 'tools/source-loader.cjs')})
        result = json.loads(run.stdout or '{}')
        self.assertTrue(result.get('ok'), run.stderr or result)
        (self.folder / result['file']).write_bytes(result['text'].encode('utf-8'))
        self.put('request.json', {**self.owner, 'id': 'req1', 'text': 'Show the recording card first.', 'revision': 'connection-3',
                                  'project': 'story-1', 'selection': payload['selection'], 'delivery': 'clipboard', **result['request']})
        self.packet = json.loads(result['text'])
        self.fragment = json.loads(json.dumps(self.packet['fragment']))
        self.write_fragment(self.fragment)

    def touch(self):
        self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time() * 1000})

    def write_fragment(self, fragment):
        (self.folder / 'candidate.panel.json').write_text(json.dumps(fragment, indent=2), encoding='utf-8')

    def assemble(self, helper_path=HELPER, *extra):
        return subprocess.run([sys.executable, str(helper_path), '--folder', str(self.folder), 'assemble-deviceapp',
                               '--request', 'req1', '--task', 'focus-req1.json', *extra],
                              text=True, capture_output=True, timeout=120)

    def test_packet_hashes_bind_the_state_bytes(self):
        self.assertEqual(self.packet['sourceSha256'], hashlib.sha256(self.source.encode('utf-8')).hexdigest())
        self.assertEqual(self.packet['ledgerSha256'], hashlib.sha256(self.LEDGER.encode('utf-8')).hexdigest())
        request = helper.read(self.folder, 'request.json')
        self.assertEqual(request['focus']['sha256'], hashlib.sha256((self.folder / 'focus-req1.json').read_bytes()).hexdigest())

    def test_no_op_writes_the_pinned_source_and_ledger_byte_for_byte(self):
        run = self.assemble()
        self.assertEqual(run.returncode, 0, run.stderr)
        out = json.loads(run.stdout)
        self.assertTrue(out['unchanged'])
        # Run from the checkout against another folder, the follow-up keeps that folder.
        self.assertEqual(shlex.split(out['next'])[1:4], [str(HELPER.resolve()), '--folder', str(self.folder.resolve())])
        self.assertEqual((self.folder / 'candidate.spec.json').read_bytes(), self.source.encode('utf-8'))
        self.assertEqual((self.folder / 'candidate.ledger.md').read_bytes(), self.LEDGER.encode('utf-8'))
        self.assertLess(len(run.stdout), 2000, 'diagnostics never echo the source or ledger')

    def test_presentation_edit_assembles_a_complete_candidate_the_existing_propose_accepts(self):
        value = self.fragment['panel']['value']
        value['fields'].insert(0, value['fields'].pop(3))  # recording card first
        self.fragment['timeline'][0]['stateAssignment'] = {'present': True, 'value': {'battery': {'visible': False}}}
        self.fragment['timeline'][3]['stateAssignment']['value']['clip']['icon'] = 'camera'
        self.write_fragment(self.fragment)
        run = self.assemble()
        self.assertEqual(run.returncode, 0, run.stderr)
        out = json.loads(run.stdout)
        self.assertEqual(out['changedSteps'], [0, 3])
        self.assertEqual(out['written'], ['candidate.spec.json', 'candidate.ledger.md'])
        candidate = json.loads((self.folder / 'candidate.spec.json').read_text(encoding='utf-8'))
        before = json.loads(self.source)
        d, old = candidate['page']['sections'][0]['diagram'], before['page']['sections'][0]['diagram']
        self.assertEqual([f['id'] for f in d['panels'][0]['fields']], ['clip', 'battery', 'power', 'connection', 'firmware'])
        self.assertEqual(d['steps'][0]['panels'], {'app': {'battery': {'visible': False}}})
        for key in ('nodes', 'edges', 'rows', 'layouts'):
            self.assertEqual(d[key], old[key])
        self.assertEqual((self.folder / 'candidate.ledger.md').read_bytes(), self.LEDGER.encode('utf-8'))
        proposal = subprocess.run([sys.executable, str(HELPER), '--folder', str(self.folder), 'propose', '--request', 'req1',
                                   '--revision', out['revision'], '--file', 'candidate.spec.json', '--ledger', 'candidate.ledger.md'],
                                  text=True, capture_output=True, timeout=10)
        self.assertEqual(proposal.returncode, 0, proposal.stderr)
        published = helper.read(self.folder, 'proposal.json')
        self.assertEqual(published['source'], (self.folder / 'candidate.spec.json').read_text(encoding='utf-8'))
        self.assertEqual(published['ledger'], self.LEDGER)
        self.assertEqual(published['baseRevision'], 'connection-3')
        self.assertNotIn('operations', published)

    def previous_candidates(self):
        for name in ('candidate.spec.json', 'candidate.ledger.md'):
            (self.folder / name).write_text('previous ' + name, encoding='utf-8')

    def hidden(self):
        return sorted(p.name for p in self.folder.iterdir() if p.name.startswith('.'))

    def test_assembler_reports_success_when_only_backup_cleanup_fails(self):
        self.previous_candidates()
        self.fragment['panel']['value']['showSources'] = False
        self.write_fragment(self.fragment)
        with failing_unlink(lambda name: '-backup-' in name):
            code, out, err = run_main(self.folder, 'assemble-deviceapp', '--request', 'req1', '--task', 'focus-req1.json')
        self.assertEqual(code, 0, err)
        self.assertEqual(err, '')
        reply = json.loads(out)
        self.assertNotIn('refused', reply)
        self.assertEqual(reply['written'], ['candidate.spec.json', 'candidate.ledger.md'])
        self.assertEqual(len(reply['cleanupWarnings']), 2)
        self.assertIs(json.loads((self.folder / 'candidate.spec.json').read_text(encoding='utf-8'))
                      ['page']['sections'][0]['diagram']['panels'][0]['showSources'], False)
        self.assertEqual((self.folder / 'candidate.ledger.md').read_bytes(), self.LEDGER.encode('utf-8'))
        backups = self.hidden()
        self.assertEqual(len(backups), 2)
        self.assertEqual(sorted((self.folder / name).read_text(encoding='utf-8') for name in backups),
                         ['previous candidate.ledger.md', 'previous candidate.spec.json'])

    def test_assembler_refusal_survives_cleanup_failure_and_lists_leftovers(self):
        self.previous_candidates()
        request = helper.read(self.folder, 'request.json')
        stopped = ValueError('This turn was stopped in the editor. Do not send more changes or replies for it.')
        # The first check passes; the pre-publication guard then finds the turn stopped.
        with patch.object(helper, 'active_request', side_effect=[request, stopped]), \
                failing_unlink(lambda name: name.startswith('.')):
            code, out, err = run_main(self.folder, 'assemble-deviceapp', '--request', 'req1', '--task', 'focus-req1.json')
        self.assertEqual((code, out), (1, ''))
        reply = json.loads(err)
        self.assertTrue(reply['refused'])
        self.assertIn('stopped in the editor', reply['reason'])
        self.assertEqual(reply['written'], [])
        self.assertEqual(sorted(reply['retained']), self.hidden())
        self.assertEqual(len(reply['retained']), 2, 'the two staged files')
        for name in ('candidate.spec.json', 'candidate.ledger.md'):
            self.assertEqual((self.folder / name).read_text(encoding='utf-8'), 'previous ' + name)

    def test_refusals_leave_candidates_and_proposals_untouched(self):
        def edit(change):
            def apply():
                fragment = json.loads(json.dumps(self.fragment))
                change(fragment)
                self.write_fragment(fragment)
            return apply

        def state(**changes):
            return lambda: self.put('state.json', {**helper.read(self.folder, 'state.json'), **changes})

        def request(**changes):
            return lambda: self.put('request.json', {key: value for key, value in {**helper.read(self.folder, 'request.json'), **changes}.items()
                                                     if value is not None})

        def tamper():
            with (self.folder / 'focus-req1.json').open('a', encoding='utf-8') as packet:
                packet.write(' ')

        def symlink():
            (self.folder / 'focus-req1.json').rename(self.folder / 'real.json')
            (self.folder / 'focus-req1.json').symlink_to(self.folder / 'real.json')
        cases = [
            ('locked value', edit(lambda f: f['timeline'][3]['stateAssignment']['value']['clip'].update(value='Tomorrow')), 'locked'),
            ('new validator warning', edit(lambda f: f['timeline'][3]['stateAssignment']['value']['clip'].update(icon='not-an-icon')), 'New validator warning'),
            ('duplicate key', lambda: (self.folder / 'candidate.panel.json').write_text('{"format": 1, "format": 2}'), 'repeats'),
            ('tampered packet', tamper, 'SHA-256'),
            ('stale revision', state(revision='connection-4'), 'revision'),
            ('changed source', state(source=self.source.replace('Resident phone', 'Other phone')), 'source hash'),
            ('changed ledger', state(ledger=self.LEDGER + 'More.\n'), 'ledger'),
            ('full-document request', request(mode=None, focus=None), 'not registered'),
            ('other connection', request(connectionId='someone-else'), 'no longer current'),
            ('symlinked packet', symlink, 'regular helper file'),
        ]
        for name, change, text in cases:
            with self.subTest(name):
                self.reset()
                for filename in ('candidate.spec.json', 'candidate.ledger.md'):
                    (self.folder / filename).write_text('previous ' + filename, encoding='utf-8')
                change()
                run = self.assemble()
                self.assertNotEqual(run.returncode, 0)
                refusal = json.loads(run.stderr)
                self.assertTrue(refusal['refused'])
                self.assertIn(text, refusal['reason'] + ' ' + ' '.join(refusal['problems']))
                self.assertLess(len(run.stderr), 12000)
                for filename in ('candidate.spec.json', 'candidate.ledger.md'):
                    self.assertEqual((self.folder / filename).read_text(encoding='utf-8'), 'previous ' + filename)
                self.assertFalse((self.folder / 'proposal.json').exists())
                self.assertEqual([p.name for p in self.folder.iterdir() if p.name.startswith('.')], [])
                for leftover in ('real.json',):
                    (self.folder / leftover).unlink(missing_ok=True)
                (self.folder / 'focus-req1.json').unlink(missing_ok=True)
        traversal = subprocess.run([sys.executable, str(HELPER), '--folder', str(self.folder), 'assemble-deviceapp',
                                    '--request', 'req1', '--task', '../focus-req1.json'], text=True, capture_output=True, timeout=30)
        self.assertIn('plain filename', json.loads(traversal.stderr)['reason'])

    def prepared_layout(self, metadata, artifacts):
        """A diagram folder outside the checkout whose helper lives at `metadata`
        ('.flowview-agent' by default, '.' for legacy root sessions)."""
        diagram = Path(self.temp.name) / 'diagram'
        self.folder = diagram if metadata == '.' else diagram / metadata
        self.folder.mkdir(parents=True)
        self.reset()
        for name, text in zip(artifacts, (self.source, self.LEDGER)):
            (diagram / name).parent.mkdir(parents=True, exist_ok=True)
            (diagram / name).write_text(text, encoding='utf-8')
        kit_spec = importlib.util.spec_from_file_location('folder_agent_kit', ROOT / 'tools/folder_agent_kit.py')
        kit_module = importlib.util.module_from_spec(kit_spec)
        kit_spec.loader.exec_module(kit_module)
        packed = json.loads(kit_module.folder_agent_kit(ROOT, RUNTIME.read_text(encoding='utf-8')))
        self.put('authoring-kit.json', {'gzip': packed['gzip'], 'sha256': packed['sha256']})
        (self.folder / 'folder-agent.py').write_text(packed['watcher'], encoding='utf-8')
        # Invoke exactly as the connection instructions do: relative to the diagram folder.
        script = 'folder-agent.py' if metadata == '.' else metadata + '/folder-agent.py'
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONPATH'}

        def run(*args):
            return subprocess.run([sys.executable, *args], cwd=diagram, env=env, text=True, capture_output=True, timeout=120)
        prepared = run(script, 'prepare')
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        self.assertTrue((self.folder / 'authoring/tools/panel_fragment.py').is_file())
        return diagram, script, run

    def check_portable(self, metadata, artifacts):
        diagram, script, run = self.prepared_layout(metadata, artifacts)
        self.fragment['panel']['value']['showSources'] = False
        self.write_fragment(self.fragment)
        self.touch()  # building and unpacking the kit can outlast the 15 s editor heartbeat
        assembled = run(script, 'assemble-deviceapp', '--request', 'req1', '--task', 'focus-req1.json')
        self.assertEqual(assembled.returncode, 0, assembled.stderr)
        out = json.loads(assembled.stdout)
        self.assertIs(json.loads((self.folder / 'candidate.spec.json').read_text(encoding='utf-8'))
                      ['page']['sections'][0]['diagram']['panels'][0]['showSources'], False)
        self.assertEqual((self.folder / 'candidate.ledger.md').read_bytes(), self.LEDGER.encode('utf-8'))
        for name, text in zip(artifacts, (self.source, self.LEDGER)):
            self.assertEqual((diagram / name).read_text(encoding='utf-8'), text, 'accepted artifacts are never written')
        self.assertFalse((self.folder / 'authoring/tools/__pycache__').exists())
        # The printed follow-up names this layout's helper and works verbatim.
        self.assertTrue(out['next'].startswith(f'python3 {script} propose --request req1 --revision connection-3 '), out['next'])
        words = shlex.split(out['next'])
        self.touch()
        proposed = run(*words[1:])
        self.assertEqual(proposed.returncode, 0, proposed.stderr)
        self.assertEqual(helper.read(self.folder, 'proposal.json')['ledger'], self.LEDGER)

    def test_prepared_kit_assembles_outside_the_checkout_in_the_default_helper_folder(self):
        self.check_portable('.flowview-agent', ('flows/garage door.spec.json', 'flows/garage door.ledger.md'))

    def test_prepared_kit_assembles_in_a_legacy_root_metadata_session(self):
        self.check_portable('.', ('story.spec.json', 'story.ledger.md'))

    def test_js_packets_match_python_extraction_across_layouts_containers_and_unicode(self):
        base = json.loads(self.source)['page']['sections'][0]['diagram']
        sparse = json.loads(json.dumps(base))
        sparse['steps'][3]['patch'] = sparse['steps'][3].pop('panels')
        sparse['steps'][0]['id'] = 'début'
        sparse['steps'][0]['panels'] = {'app': {}}
        sparse['steps'][2]['panels']['app']['connection'] = {}
        sparse['steps'][4]['panels']['app']['firmware'] = None
        sparse['steps'][5]['panels']['app']['clip'] = {'icon': None}
        sparse['steps'][5]['panelVisibility'] = {'app': False}
        sparse['panels'][0]['title'] = 'Téléphone 📱'
        renamed = json.loads(json.dumps(base))
        renamed['panels'][0]['id'] = 'téléphone'
        for step in renamed['steps']:
            if 'panels' in step:
                step['panels'] = {'téléphone': step['panels']['app']}
        renamed['layouts'][0]['sectionLayout']['default'][0]['panel'] = 'téléphone'
        documents = [
            ('page sections', json.loads(self.source), 0, 'app'),
            ('tabs', {'page': {'title': 'T', 'blocks': [{'tabs': [{'label': 'Intro', 'sections': [{'heading': 'Intro', 'text': 'x'}]},
                                                                   {'label': 'Flow', 'sections': [{'heading': 'Flow', 'diagram': sparse}]}]}]}}, 1, 'app'),
            ('bare diagram, Unicode panel ID', renamed, 0, 'téléphone')]
        payloads = [{'requestId': 'req1', **self.owner, 'project': 'story-1', 'revision': 'connection-3',
                     'source': json.dumps(raw, ensure_ascii=False, indent=1), 'ledger': self.LEDGER,
                     'selection': [{'section': section, 'kind': 'panel', 'index': 0, 'id': pid}], 'open': True, 'previewCurrent': True}
                    for _, raw, section, pid in documents]
        run = subprocess.run([NODE, '-e', PACKET_SCRIPT], input=json.dumps(payloads), capture_output=True, text=True, timeout=60,
                             env={**os.environ, 'FLOWVIEW_LOADER': str(ROOT / 'tools/source-loader.cjs')})
        results = json.loads(run.stdout or '[]')
        self.assertEqual(len(results), len(documents), run.stderr)
        for (name, _, _, _), payload, result in zip(documents, payloads, results):
            with self.subTest(name):
                self.assertTrue(result['ok'], result.get('reasons'))
                packet = json.loads(result['text'])
                raw = pf.loads(payload['source'], 'source')
                self.assertEqual(packet['sourceSha256'], pf.sha256_text(payload['source']))
                self.assertEqual(result['sha256'], hashlib.sha256(result['text'].encode('utf-8')).hexdigest())
                self.assertEqual(pf.problems(raw, packet['target']), [])
                self.assertTrue(pf.same(pf.extract(raw, packet['target'], 'req1', 'connection-3'), packet['fragment']))
                merged, summary = pf.assemble(raw, packet, json.loads(json.dumps(packet['fragment'])))
                self.assertTrue(summary['unchanged'] and pf.same(merged, raw))
        tabbed = json.loads(results[1]['text'])['fragment']['timeline']
        self.assertEqual(tabbed[0], {'stepIndex': 0, 'stepId': 'début', 'stateAssignment': {'present': True, 'value': {}},
                                     'visibilityAssignment': {'present': False}})
        self.assertEqual(tabbed[3]['stateAssignment']['value']['clip']['visible'], True, 'legacy patch container')
        self.assertIsNone(tabbed[4]['stateAssignment']['value']['firmware'])
        self.assertEqual(tabbed[5]['stateAssignment']['value']['clip'], {'icon': None})
        self.assertEqual(tabbed[5]['visibilityAssignment'], {'present': True, 'value': False})


GUIDE = 'authoring/.claude/skills/hld-to-page/references/focused-panel-edit.md'
TARGET = {'section': 0, 'sectionPath': ['page', 'sections', 0], 'diagramPath': ['page', 'sections', 0, 'diagram'],
          'panelPath': ['page', 'sections', 0, 'diagram', 'panels', 0], 'panelIndex': 0, 'panelId': 'app',
          'panelType': 'deviceapp'}
RECEIPT_KEYS = {'format', 'status', 'sessionId', 'connectionId', 'requestId', 'revision', 'mode', 'receiptFile',
                'editableFiles', 'inputHashes', 'baselineHashes', 'currentHashes', 'guidePointers'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


class PrepareRequestTests(unittest.TestCase):
    """prepare --request: equal mechanical staging for the full and focused routes."""
    LEDGER = '# Coverage ledger\n\nCards follow the story; résumé ✓.\n'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-prepare-test-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.owner = {'sessionId': 'session', 'connectionId': 'connection'}
        self.source = EXAMPLE.read_text(encoding='utf-8')
        self.put('session.json', {'protocol': 'flowview-folder-v1', 'workflow': 'external', 'pairedArtifacts': True, **self.owner})
        self.register('req1', 'connection-3')

    def put(self, name, value):
        (self.folder / name).write_text(json.dumps(value), encoding='utf-8')

    def touch(self):
        self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time() * 1000})

    def register(self, request_id, revision, focused=False, source=None):
        """What the workbench publishes at Send: state, the focused packet if any, then request.json."""
        source = self.source if source is None else source
        self.touch()
        self.put('state.json', {**self.owner, 'revision': revision, 'project': 'story-1', 'open': True,
                                'source': source, 'ledger': self.LEDGER})
        request = {**self.owner, 'id': request_id, 'text': 'Show the recording card first.', 'revision': revision,
                   'project': 'story-1'}
        if focused:
            self.packet = {'format': pf.PACKET_FORMAT, 'requestId': request_id, **self.owner, 'project': 'story-1',
                           'revision': revision, 'sourceSha256': pf.sha256_text(source),
                           'ledgerSha256': pf.sha256_text(self.LEDGER), 'guide': GUIDE, 'target': TARGET,
                           'context': {'captions': ['Doorbell pressed at the gate']},
                           'fragment': pf.extract(pf.loads(source, 'source'), TARGET, request_id, revision)}
            text = (json.dumps(self.packet, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            (self.folder / f'focus-{request_id}.json').write_bytes(text)
            request.update(mode=pf.MODE, focus={'format': pf.PACKET_FORMAT, 'file': f'focus-{request_id}.json', 'sha256': sha(text)})
        self.put('request.json', request)

    def prepare(self, request_id='req1'):
        code, out, err = run_main(self.folder, 'prepare', '--request', request_id)
        self.out = out
        if code == 0:
            self.assertEqual(err, '')
            return json.loads(out)
        self.assertEqual(out, '', 'refusals print nothing on stdout')
        refusal = json.loads(err)
        self.assertTrue(refusal['refused'])
        return refusal

    def files(self, request_id='req1', focused=False):
        tag = helper.request_tag(request_id)
        roles = {'fragment': f'candidate-{tag}.panel.json'} if focused else \
            {'spec': f'candidate-{tag}.spec.json', 'ledger': f'candidate-{tag}.ledger.md'}
        return roles, f'prepared-{tag}.json', f'.prepared-{tag}.pending.json'

    def snapshot(self):
        return {p.name: (p.is_symlink(), p.read_bytes() if p.is_file() else None) for p in self.folder.iterdir()}

    def hidden(self):
        return sorted(p.name for p in self.folder.iterdir() if p.name.startswith('.'))

    def test_full_route_stages_the_exact_pair_under_request_scoped_names(self):
        (self.folder / 'candidate.spec.json').write_text('legacy manual candidate', encoding='utf-8')
        receipt = self.prepare()
        files, receipt_name, _ = self.files()
        tag = helper.request_tag('req1')
        self.assertEqual(set(receipt), RECEIPT_KEYS | {'requestTag', 'liveCheck', 'commands'})
        self.assertEqual({key: receipt[key] for key in ('format', 'status', 'sessionId', 'connectionId', 'requestId', 'revision',
                                                        'mode', 'requestTag', 'receiptFile', 'editableFiles', 'liveCheck')},
                         {'format': 'flowview-prepared-request-v1', 'status': 'created', **self.owner, 'requestId': 'req1',
                          'revision': 'connection-3', 'mode': 'full', 'requestTag': tag, 'receiptFile': receipt_name,
                          'editableFiles': files, 'liveCheck': 'passed'})
        spec, ledger = self.source.encode('utf-8'), self.LEDGER.encode('utf-8')
        self.assertEqual((self.folder / files['spec']).read_bytes(), spec)
        self.assertEqual((self.folder / files['ledger']).read_bytes(), ledger)
        hashes = {'spec': sha(spec), 'ledger': sha(ledger)}
        self.assertEqual(receipt['inputHashes'], {'source': sha(spec), 'ledger': sha(ledger)})
        self.assertEqual((receipt['baselineHashes'], receipt['currentHashes']), (hashes, hashes))
        self.assertEqual(receipt['guidePointers'], {'guide': 'authoring/.claude/skills/hld-to-page/SKILL.md',
                                                    'scope': 'complete-document', 'pointers': [], 'allowedKeys': []})
        persisted = json.loads((self.folder / receipt_name).read_text(encoding='utf-8'))
        self.assertEqual(persisted, {key: value for key, value in receipt.items() if key != 'commands'})
        self.assertEqual((self.folder / 'candidate.spec.json').read_text(encoding='utf-8'), 'legacy manual candidate')
        self.assertEqual(self.hidden(), [], 'no pending record or staging file remains')
        for text in ('Resident phone', 'Last recording', 'Coverage ledger', 'Show the recording card'):
            self.assertNotIn(text, self.out)
        # The staged pair is proposed through the unchanged propose command.
        code, _, err = run_main(self.folder, *shlex.split(receipt['commands']['propose'])[2:])
        self.assertEqual(code, 0, err)
        proposal = helper.read(self.folder, 'proposal.json')
        self.assertEqual((proposal['source'], proposal['ledger'], proposal['baseRevision']), (self.source, self.LEDGER, 'connection-3'))

    def test_focused_route_stages_only_the_packet_fragment(self):
        self.register('req1', 'connection-3', focused=True)
        receipt = self.prepare()
        files, receipt_name, _ = self.files(focused=True)
        self.assertEqual(set(receipt), RECEIPT_KEYS | {'requestTag', 'liveCheck', 'commands'})
        self.assertEqual((receipt['mode'], receipt['status'], receipt['editableFiles']), ('focused-deviceapp', 'created', files))
        staged = (self.folder / files['fragment']).read_bytes()
        self.assertEqual(staged, (json.dumps(self.packet['fragment'], ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        timeline = json.loads(staged)['timeline']
        self.assertEqual(timeline, self.packet['fragment']['timeline'])
        self.assertIn({'present': False}, [entry['visibilityAssignment'] for entry in timeline], 'absent envelopes are kept')
        task = (self.folder / 'focus-req1.json').read_bytes()
        self.assertEqual(receipt['inputHashes'], {'packet': sha(task), 'source': self.packet['sourceSha256'],
                                                  'ledger': self.packet['ledgerSha256']})
        self.assertEqual(receipt['baselineHashes'], {'fragment': sha(staged)})
        self.assertEqual(receipt['guidePointers']['guide'], GUIDE)
        self.assertEqual(receipt['guidePointers']['pointers'], ['/panel/value', '/timeline'])
        self.assertEqual(sorted(p.name for p in self.folder.iterdir() if p.name.startswith(('candidate', 'prepared'))),
                         sorted([files['fragment'], receipt_name]), 'no spec or ledger candidate is staged')
        self.assertIn(f'--fragment {files["fragment"]}', receipt['commands']['assemble'])
        # No captions, labels or values reach stdout.
        leaves = []

        def collect(value):
            if isinstance(value, dict):
                [collect(item) for item in value.values()]
            elif isinstance(value, list):
                [collect(item) for item in value]
            elif isinstance(value, str) and ' ' in value:
                leaves.append(value)
        collect(self.packet['fragment'])
        collect(self.packet['context'])
        self.assertTrue(leaves)
        for text in leaves:
            self.assertNotIn(text, self.out)

    @unittest.skipUnless(NODE and RUNTIME.is_file(), 'Node and the generated runtime are required to validate candidates')
    def test_staged_fragment_feeds_the_existing_assembler_and_propose(self):
        self.register('req1', 'connection-3', focused=True)
        receipt = self.prepare()
        path = self.folder / receipt['editableFiles']['fragment']
        edited = json.loads(path.read_text(encoding='utf-8'))
        fields = edited['panel']['value']['fields']
        fields.insert(0, fields.pop(3))
        path.write_text(json.dumps(edited, indent=2), encoding='utf-8')
        self.touch()
        code, out, err = run_main(self.folder, *shlex.split(receipt['commands']['assemble'])[2:])
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)['written'], ['candidate.spec.json', 'candidate.ledger.md'])
        candidate = json.loads((self.folder / 'candidate.spec.json').read_text(encoding='utf-8'))
        self.assertEqual([f['id'] for f in candidate['page']['sections'][0]['diagram']['panels'][0]['fields']],
                         ['clip', 'battery', 'power', 'connection', 'firmware'])
        code, _, err = run_main(self.folder, *shlex.split(receipt['commands']['propose'])[2:])
        self.assertEqual(code, 0, err)
        self.assertEqual(helper.read(self.folder, 'proposal.json')['ledger'], self.LEDGER)

    def test_retries_report_untouched_or_edited_candidates_and_never_rewrite(self):
        for focused in (False, True):
            with self.subTest('focused' if focused else 'full'):
                request_id = 'retry-' + ('focused' if focused else 'full')
                self.register(request_id, 'connection-3', focused=focused)
                first = self.prepare(request_id)
                files, receipt_name, _ = self.files(request_id, focused)
                persisted = (self.folder / receipt_name).read_bytes()
                before = {name: ((self.folder / name).stat().st_ino, (self.folder / name).stat().st_mtime_ns,
                                 (self.folder / name).read_bytes()) for name in files.values()}
                again = self.prepare(request_id)
                self.assertEqual(again['status'], 'already-staged')
                self.assertEqual(again['currentHashes'], first['baselineHashes'])
                self.assertEqual({name: ((self.folder / name).stat().st_ino, (self.folder / name).stat().st_mtime_ns,
                                         (self.folder / name).read_bytes()) for name in files.values()}, before)
                role, name = next(iter(files.items()))
                edited = (self.folder / name).read_bytes() + b'\n'
                (self.folder / name).write_bytes(edited)
                touched = self.prepare(request_id)
                self.assertEqual(touched['status'], 'preserved-edits')
                self.assertEqual(touched['baselineHashes'], first['baselineHashes'])
                self.assertEqual(touched['currentHashes'][role], sha(edited))
                self.assertEqual((self.folder / name).read_bytes(), edited)
                self.assertEqual((self.folder / receipt_name).read_bytes(), persisted, 'the receipt is never rewritten')
                self.assertEqual(self.hidden(), [])

    def test_each_request_gets_its_own_files_and_old_work_is_never_rebound(self):
        first = self.prepare()
        old_spec = self.folder / first['editableFiles']['spec']
        old_spec.write_bytes(b'my unfinished edit')
        self.register('req2', 'connection-4')
        second = self.prepare('req2')
        self.assertEqual(second['status'], 'created')
        self.assertTrue(set(second['editableFiles'].values()).isdisjoint(first['editableFiles'].values()))
        self.assertNotEqual(second['receiptFile'], first['receiptFile'])
        self.assertEqual((self.folder / second['editableFiles']['spec']).read_bytes(), self.source.encode('utf-8'))
        self.assertEqual(old_spec.read_bytes(), b'my unfinished edit')
        before = self.snapshot()
        self.assertIn('no longer current', self.prepare('req1')['reason'])
        self.assertEqual(self.snapshot(), before)
        self.register('req3', 'connection-5', focused=True)
        third = self.prepare('req3')
        self.assertEqual(list(third['editableFiles']), ['fragment'])
        self.assertEqual(old_spec.read_bytes(), b'my unfinished edit')

    def test_stale_foreign_cancelled_or_disconnected_requests_publish_nothing(self):
        def merge(name, **changes):
            return lambda: self.put(name, {**helper.read(self.folder, name), **changes})
        cases = [
            ('stale revision', merge('state.json', revision='connection-4'), 'revision mismatch'),
            ('replaced request', merge('request.json', id='req-newer'), 'no longer current'),
            ('other connection owns the folder', merge('session.json', connectionId='other'), 'no longer current'),
            ('cancelled', lambda: self.put('cancel.json', {**self.owner, 'id': 'c1', 'requestId': 'req1'}), 'stopped in the editor'),
            ('disconnected', merge('editor.json', connected=False), 'disconnected'),
            ('stale heartbeat', merge('editor.json', at=0), 'disconnected'),
        ]
        for focused in (False, True):
            for name, change, text in cases:
                with self.subTest(name, focused=focused):
                    (self.folder / 'cancel.json').unlink(missing_ok=True)
                    self.put('session.json', {'protocol': 'flowview-folder-v1', 'workflow': 'external', 'pairedArtifacts': True, **self.owner})
                    self.register('req1', 'connection-3', focused=focused)
                    change()
                    before = self.snapshot()
                    refusal = self.prepare()
                    self.assertIn(text, refusal['reason'])
                    self.assertEqual(refusal['written'], [])
                    self.assertEqual(self.snapshot(), before)

    def test_focused_packet_hash_and_binding_mismatches_publish_nothing(self):
        def tamper():
            with (self.folder / 'focus-req1.json').open('a', encoding='utf-8') as packet:
                packet.write(' ')

        def symlink():
            (self.folder / 'focus-req1.json').rename(self.folder / 'real.json')
            (self.folder / 'focus-req1.json').symlink_to(self.folder / 'real.json')

        def state(**changes):
            return lambda: self.put('state.json', {**helper.read(self.folder, 'state.json'), **changes})

        def request(**changes):
            return lambda: self.put('request.json', {**helper.read(self.folder, 'request.json'), **changes})
        cases = [
            ('tampered packet', tamper, 'SHA-256'),
            ('source changed at the same revision', state(source=self.source.replace('Resident phone', 'Other phone')), 'source hash'),
            ('ledger changed', state(ledger=self.LEDGER + 'More.\n'), 'ledger'),
            ('symlinked packet', symlink, 'regular helper file'),
            ('focus record removed', request(focus=None), 'not registered'),
            ('unknown mode', request(mode='bulk-rewrite'), 'Unknown request mode'),
        ]
        for name, change, text in cases:
            with self.subTest(name):
                for leftover in ('real.json', 'focus-req1.json'):
                    (self.folder / leftover).unlink(missing_ok=True)
                self.register('req1', 'connection-3', focused=True)
                change()
                before = self.snapshot()
                refusal = self.prepare()
                self.assertIn(text, refusal['reason'] + ' ' + ' '.join(refusal['problems']))
                self.assertEqual(self.snapshot(), before)

    def test_both_routes_require_the_request_project_to_match_the_open_project(self):
        def merge(name, **changes):
            return lambda: self.put(name, {**helper.read(self.folder, name), **changes})

        def drop_request_project():
            request = helper.read(self.folder, 'request.json')
            del request['project']
            self.put('request.json', request)
        cases = [('request names another project', merge('request.json', project='other-project')),
                 ('state opened another project', merge('state.json', project='other-project')),
                 ('request omits the project', drop_request_project),
                 ('same text, different JSON type', merge('request.json', project=['story-1']))]
        (self.folder / 'candidate.spec.json').write_text('legacy manual candidate', encoding='utf-8')
        (self.folder / 'candidate.ledger.md').write_text('legacy manual ledger', encoding='utf-8')
        prior = self.prepare()  # an earlier request's set, then edited by its author
        (self.folder / prior['editableFiles']['spec']).write_bytes(b'earlier edited work')
        for focused in (False, True):
            for name, change in cases:
                with self.subTest(name, focused=focused):
                    request_id = 'project-' + ('focused' if focused else 'full')
                    self.register(request_id, 'connection-4', focused=focused)
                    change()
                    before = self.snapshot()
                    refusal = self.prepare(request_id)
                    self.assertIn('another project', refusal['reason'])
                    self.assertEqual(refusal['written'], [])
                    self.assertEqual(self.snapshot(), before, 'nothing published; existing files preserved')
                    _, receipt_name, pending_name = self.files(request_id, focused)
                    self.assertFalse((self.folder / receipt_name).exists() or (self.folder / pending_name).exists())
        # The guard before publication repeats the binding.
        for focused in (False, True):
            with self.subTest('project changed during staging', focused=focused):
                request_id = 'project-race-' + ('focused' if focused else 'full')
                self.register(request_id, 'connection-5', focused=focused)
                before = self.snapshot()
                real, calls = helper.request_inputs, []

                def racing(*args):
                    calls.append(1)
                    if len(calls) == 2:
                        merge('request.json', project='other-project')()
                    return real(*args)
                with patch.object(helper, 'request_inputs', racing):
                    refusal = self.prepare(request_id)
                self.assertIn('another project', refusal['reason'])
                after = self.snapshot()
                before.pop('request.json')
                after.pop('request.json')
                self.assertEqual(after, before)
        self.assertEqual((self.folder / prior['editableFiles']['spec']).read_bytes(), b'earlier edited work')
        self.assertEqual((self.folder / 'candidate.spec.json').read_text(encoding='utf-8'), 'legacy manual candidate')
        # Folders without a project on either side still stage (absent equals null).
        self.register('no-project', 'connection-6')
        for name in ('state.json', 'request.json'):
            value = helper.read(self.folder, name)
            del value['project']
            self.put(name, value)
        self.assertEqual(self.prepare('no-project')['status'], 'created')

    def test_live_checks_repeat_immediately_before_publication(self):
        def cancel():
            self.put('cancel.json', {**self.owner, 'id': 'c1', 'requestId': 'req1'})

        def human_edit():  # the editor saves a new revision while bytes are being staged
            self.put('state.json', {**helper.read(self.folder, 'state.json'), 'revision': 'connection-4'})

        def same_revision_change():
            self.put('state.json', {**helper.read(self.folder, 'state.json'), 'source': self.source + ' '})
        for focused in (False, True):
            for name, race, text in [('cancelled', cancel, 'stopped in the editor'), ('human edit', human_edit, 'revision mismatch'),
                                     ('bytes changed', same_revision_change, 'changed during preparation' if not focused else 'source hash')]:
                with self.subTest(name, focused=focused):
                    (self.folder / 'cancel.json').unlink(missing_ok=True)
                    self.register('req1', 'connection-3', focused=focused)
                    before = self.snapshot()
                    real, calls = helper.request_inputs, []

                    def racing(*args):
                        calls.append(1)
                        if len(calls) == 2:  # the guard after private staging
                            race()
                        return real(*args)
                    with patch.object(helper, 'request_inputs', racing):
                        refusal = self.prepare()
                    self.assertEqual(len(calls), 2)
                    self.assertIn(text, refusal['reason'] + ' ' + ' '.join(refusal['problems']))
                    after = self.snapshot()
                    for changed in ('cancel.json', 'state.json'):
                        after.pop(changed, None)
                        before.pop(changed, None)
                    self.assertEqual(after, before, 'no candidate, receipt or pending record became visible')

    def test_collisions_symlinks_and_foreign_records_are_preserved_and_refused(self):
        files, receipt_name, pending_name = self.files()
        (self.folder / 'elsewhere.md').write_text('outside work', encoding='utf-8')

        def unknown_candidate():
            (self.folder / files['spec']).write_text('someone else\'s work', encoding='utf-8')

        def unknown_fragment():
            self.register('req1', 'connection-3', focused=True)
            (self.folder / self.files(focused=True)[0]['fragment']).write_text('{"mine": true}', encoding='utf-8')

        def foreign_receipt():
            self.put(receipt_name, {'format': 'flowview-prepared-request-v1', **self.owner, 'requestId': 'someone-else'})

        def foreign_pending():
            self.put(pending_name, {'format': 'flowview-prepared-request-pending-v1', **self.owner, 'requestId': 'req1',
                                    'revision': 'connection-2'})

        def unreadable_receipt():
            (self.folder / receipt_name).write_text('not json', encoding='utf-8')

        def symlinked_member():
            (self.folder / files['ledger']).symlink_to(self.folder / 'elsewhere.md')

        def symlinked_receipt():
            (self.folder / receipt_name).symlink_to(self.folder / 'elsewhere.md')
        cases = [(unknown_candidate, 'without a preparation record'), (unknown_fragment, 'without a preparation record'),
                 (foreign_receipt, 'belongs to another'), (foreign_pending, 'belongs to another'),
                 (unreadable_receipt, 'not a readable preparation record'), (symlinked_member, 'symlink'),
                 (symlinked_receipt, 'not a readable preparation record')]
        for change, text in cases:
            with self.subTest(change.__name__):
                for p in list(self.folder.iterdir()):
                    if p.name.startswith(('candidate-', 'prepared-', '.prepared-')):
                        p.unlink()
                self.register('req1', 'connection-3')
                change()
                before = self.snapshot()
                refusal = self.prepare()
                self.assertIn(text, refusal['reason'])
                self.assertEqual(self.snapshot(), before)
                self.assertEqual((self.folder / 'elsewhere.md').read_text(encoding='utf-8'), 'outside work')

    def failing_create(self, predicate):
        real = helper.create_only

        def create_only(temporary, target):
            if predicate(target.name):
                raise OSError('injected publication failure')
            return real(temporary, target)
        return patch.object(helper, 'create_only', create_only)

    def test_publication_fault_leaves_a_recoverable_set_without_a_receipt(self):
        for name, fails in [('second candidate', lambda target: target.endswith('.ledger.md')),
                            ('receipt', lambda target: target.startswith('prepared-'))]:
            with self.subTest(name):
                request_id = 'fault-' + name.replace(' ', '-')
                self.register(request_id, 'connection-3')
                files, receipt_name, pending_name = self.files(request_id)
                with self.failing_create(fails):
                    refusal = self.prepare(request_id)
                self.assertIn('injected', refusal['reason'])
                self.assertFalse((self.folder / receipt_name).exists(), 'no receipt claims a partial set')
                self.assertEqual(refusal['written'][0], pending_name)
                self.assertTrue(all((self.folder / f).read_bytes() in (self.source.encode('utf-8'), self.LEDGER.encode('utf-8'))
                                    for f in refusal['written'][1:]))
                self.assertEqual(self.hidden(), [pending_name], 'only the pending record, no staging files')
                retried = self.prepare(request_id)
                self.assertEqual(retried['status'], 'created')
                self.assertEqual((self.folder / files['spec']).read_bytes(), self.source.encode('utf-8'))
                self.assertEqual((self.folder / files['ledger']).read_bytes(), self.LEDGER.encode('utf-8'))
                self.assertTrue((self.folder / receipt_name).is_file())
                self.assertEqual(self.hidden(), [])
                self.assertEqual(self.prepare(request_id)['status'], 'already-staged')

    def test_partial_set_with_an_edited_survivor_is_preserved_not_repaired(self):
        files, receipt_name, pending_name = self.files()
        with self.failing_create(lambda target: target.endswith('.ledger.md')):
            self.prepare()
        (self.folder / files['spec']).write_bytes(b'edited survivor')
        refusal = self.prepare()
        self.assertIn('was edited', refusal['reason'])
        self.assertEqual((self.folder / files['spec']).read_bytes(), b'edited survivor')
        self.assertFalse((self.folder / files['ledger']).exists())
        self.assertFalse((self.folder / receipt_name).exists())
        self.assertEqual(self.hidden(), [pending_name])

    def test_missing_member_is_repaired_only_when_the_rest_is_unedited(self):
        files, receipt_name, _ = self.files()
        self.prepare()
        (self.folder / files['ledger']).unlink()
        repaired = self.prepare()
        self.assertEqual((repaired['status'], repaired['repaired']), ('created', ['ledger']))
        self.assertEqual((self.folder / files['ledger']).read_bytes(), self.LEDGER.encode('utf-8'))
        (self.folder / files['ledger']).unlink()
        (self.folder / files['spec']).write_bytes(b'edited')
        refusal = self.prepare()
        self.assertIn('was edited', refusal['reason'])
        self.assertEqual((self.folder / files['spec']).read_bytes(), b'edited')
        self.assertFalse((self.folder / files['ledger']).exists())

    def test_without_hard_links_exclusive_create_publishes_the_same_bytes(self):
        with patch.object(helper.os, 'link', side_effect=PermissionError('links unsupported')):
            receipt = self.prepare()
        files, receipt_name, _ = self.files()
        self.assertEqual(receipt['status'], 'created')
        self.assertEqual((self.folder / files['spec']).read_bytes(), self.source.encode('utf-8'))
        self.assertEqual((self.folder / files['ledger']).read_bytes(), self.LEDGER.encode('utf-8'))
        self.assertTrue((self.folder / receipt_name).is_file())
        self.assertEqual(self.hidden(), [])

    def test_pending_cleanup_failure_is_a_warning_and_finished_on_retry(self):
        _, _, pending_name = self.files()
        with failing_unlink(lambda name: name == pending_name):
            receipt = self.prepare()
        self.assertEqual(receipt['status'], 'created')
        self.assertIn(pending_name, ' '.join(receipt['cleanupWarnings']))
        self.assertEqual(self.hidden(), [pending_name])
        self.assertEqual(self.prepare()['status'], 'already-staged')
        self.assertEqual(self.hidden(), [])

    def test_requestless_prepare_still_only_unpacks_the_kit(self):
        raw = json.dumps({'files': {'docs/example.md': 'Small kit'}}).encode()
        self.put('authoring-kit.json', {'gzip': base64.b64encode(gzip.compress(raw)).decode(), 'sha256': sha(raw)})
        code, out, err = run_main(self.folder, 'prepare')
        self.assertEqual((code, out.strip(), err), (0, sha(raw), ''))
        self.assertEqual((self.folder / 'authoring/docs/example.md').read_text(), 'Small kit')
        self.assertFalse([p for p in self.folder.iterdir() if p.name.startswith(('candidate', 'prepared', '.prepared'))])


if __name__ == '__main__':
    unittest.main()
