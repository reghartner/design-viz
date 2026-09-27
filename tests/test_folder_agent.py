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


if __name__ == '__main__':
    unittest.main()
