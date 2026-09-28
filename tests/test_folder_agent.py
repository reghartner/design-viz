"""Exercise the exact helper Claude receives; no Claude process or network."""
import base64
import gzip
import hashlib
import importlib.util
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


class FolderAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-folder-test-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.owner = {'sessionId': 'session', 'connectionId': 'connection'}
        self.put('session.json', {'protocol': 'flowview-folder-v1', **self.owner})
        self.put('editor.json', {**self.owner, 'connected': True, 'at': time.time()*1000})
        self.put('request.json', {**self.owner, 'id': 'request', 'text': 'Tell a story'})
        self.put('state.json', {**self.owner, 'revision': 'revision-1', 'source': '{}'})
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

    def propose(self):
        return self.run_helper('propose', '--request', 'request', '--revision', 'revision-1',
                               '--file', 'candidate.spec.json')

    def test_reply_and_proposal_identity_and_pending_ack_guard(self):
        result = self.propose()
        self.assertEqual(result.returncode, 0, result.stderr)
        proposal = helper.read(self.folder, 'proposal.json')
        self.assertEqual(proposal['connectionId'], 'connection')
        self.assertEqual(proposal['baseRevision'], 'revision-1')
        for command in [self.propose, lambda: self.run_helper('reply', '--request', 'request', '--file', 'answer.txt')]:
            self.assertIn('pending proposal', command().stderr)
        self.put('result.json', {**self.owner, 'id': proposal['id'], 'status': 'applied'})
        self.assertEqual(self.run_helper('reply', '--request', 'request', '--file', 'answer.txt').returncode, 0)

    def test_stale_revision_disconnected_and_old_request_refused(self):
        self.put('state.json', {**self.owner, 'revision': 'revision-2'})
        self.assertIn('Document changed', self.propose().stderr)
        self.put('editor.json', {**self.owner, 'connected': False, 'at': time.time()*1000})
        self.assertIn('disconnected', self.propose().stderr)
        self.assertFalse((self.folder/'proposal.json').exists())

    def test_filename_escape_and_symlink_refused(self):
        self.assertIn('plain filename', self.run_helper('reply', '--request', 'request', '--file', '../answer.txt').stderr)
        (self.folder/'link.txt').symlink_to(self.folder/'answer.txt')
        self.assertIn('regular session file', self.run_helper('reply', '--request', 'request', '--file', 'link.txt').stderr)

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
        for command in [('propose', '--revision', 'revision-1', '--file', 'candidate.spec.json'),
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
            run = self.run_helper('propose', '--request', 'request', '--revision', 'revision-1', *flags)
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse((self.folder/'proposal.json').exists())
        run = self.run_helper('propose', '--request', 'request', '--revision', 'revision-1', '--file', 'candidate.spec.json')
        self.assertEqual(run.returncode, 0, run.stderr)
        proposal = helper.read(self.folder, 'proposal.json')
        self.assertEqual(proposal['source'], (self.folder/'candidate.spec.json').read_text())
        self.assertEqual(proposal['baseRevision'], 'revision-1')
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
