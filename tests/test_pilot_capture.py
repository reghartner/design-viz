"""Local Claude transcript capture fixtures; no model calls or network."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / '.claude/skills/hld-to-page/scripts/pilot_capture.py'
spec = importlib.util.spec_from_file_location('pilot_capture', SCRIPT)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
SID = '12345678-1234-1234-1234-123456789abc'
OTHER = '87654321-4321-4321-4321-cba987654321'
OWNER = {'sessionId': 'flowview-session', 'connectionId': 'connection-1'}


def encoded(*rows):
    return b''.join((json.dumps(row, ensure_ascii=False) + '\n').encode() for row in rows)


def user(name='turn-1', parent=None, content='A participant story'):
    return {'type': 'user', 'sessionId': SID, 'uuid': name, 'parentUuid': parent,
            'timestamp': '2026-10-06T10:00:00Z', 'message': {'role': 'user', 'content': content}}


def assistant(name='message-1', model='claude-a', stop='end_turn'):
    return {'type': 'assistant', 'sessionId': SID, 'uuid': name + '-block',
            'message': {'id': name, 'model': model, 'stop_reason': stop,
                        'content': [{'type': 'text', 'text': 'Response'}],
                        'usage': {'input_tokens': 4, 'output_tokens': 8,
                                  'cache_read_input_tokens': 12, 'cache_creation_input_tokens': 16}}}


def monitor(native_id, request_id='request-1', kind='request', owner=None):
    event = {'event': 'flowview_' + kind, 'file': '/pilot/.flowview-agent/' + kind + '.json',
             'id': request_id if kind == 'request' else kind + '-1',
             'requestId': request_id, **(owner or OWNER)}
    return user(native_id, 'previous-native-message',
                '<task-notification><summary>Monitor event</summary><event>' +
                json.dumps(event) + '</event></task-notification>')


def monitor_batch(native_id, *rows):
    events = '\n'.join(json.dumps(capture.flowview_payload(row)) for row in rows)
    return user(native_id, 'previous-native-message',
                '<task-notification><summary>Monitor event</summary><event>' +
                events + '</event></task-notification>')


def pasted(native_id, owner=None):
    owner = owner or OWNER
    text = ('Use registered request "request-1" (session ' + json.dumps(owner['sessionId']) +
            ', connection ' + json.dumps(owner['connectionId']) + '). Use pilot mode.')
    return user(native_id, content=text)


class AnalysisTests(unittest.TestCase):
    def analyze(self, *rows):
        return capture.analyze(encoded(*rows), SID)

    def test_tokens_count_each_api_message_once_and_models_are_observed(self):
        first = assistant(stop='tool_use')
        tool = user('tool', content=[{'type': 'tool_result', 'tool_use_id': 'tool'}])
        result = self.analyze(user(), first, first, tool, assistant('second', 'claude-b'))
        self.assertEqual(len(result['turns']), 1)
        turn = result['turns'][0]
        self.assertEqual(turn['tokens']['output_tokens'], 16)
        self.assertEqual(turn['assistantMessageCount'], 2)
        self.assertEqual(turn['modelsObserved'], ['claude-a', 'claude-b'])
        self.assertEqual(result['modelsObserved'], ['claude-a', 'claude-b'])
        self.assertNotIn('costSnapshots', result)

    def test_native_controls_do_not_create_participant_turns(self):
        controls = ['<task-notification>Background task finished</task-notification>',
                    '<system-reminder>Context compacted</system-reminder>',
                    '[Request interrupted by user]', '<bash-input>pwd</bash-input>',
                    '<bash-stdout>local output</bash-stdout>', '/effort high',
                    '<command-name>/permissions</command-name>']
        rows = [user(), assistant(stop='tool_use')]
        rows += [user('control-' + str(i), content=value) for i, value in enumerate(controls)]
        rows.append(assistant('final'))
        result = self.analyze(*rows)
        self.assertEqual([turn['id'] for turn in result['turns']], ['turn-1'])
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 2)

    def test_authored_skill_wrappers_coalesce_and_local_output_proves_local_command(self):
        rows = [user(content='/hld-to-page pilot'),
                user('wrapper', content='<command-name>/hld-to-page</command-name><command-args>pilot</command-args>'),
                assistant(),
                user('local', 'turn-1', '<command-name>/future-local-setting</command-name>'),
                user('output', 'local', '<local-command-stdout>Updated</local-command-stdout>'),
                user('next', 'output', '/hld-to-page continue'), assistant('next-reply')]
        result = self.analyze(*rows)
        self.assertEqual([turn['id'] for turn in result['turns']], ['turn-1', 'next'])
        self.assertEqual(result['turns'][0]['userMessageAliases'], ['wrapper'])

    def test_verified_monitor_batch_and_result_share_request_turn(self):
        batch = monitor_batch('batch', monitor('cancel', kind='cancel'), monitor('result', kind='result'))
        result = capture.analyze(encoded(monitor('request'), assistant('proposal', stop='tool_use'),
                                         batch, assistant('receipt')), SID, [OWNER])
        self.assertEqual(len(result['turns']), 1)
        turn = result['turns'][0]
        self.assertEqual([event['event'] for event in turn['flowviewEvents']],
                         ['flowview_request', 'flowview_cancel', 'flowview_result'])
        self.assertEqual(turn['assistantMessageCount'], 2)
        self.assertEqual(turn['userMessageAliases'], ['batch'])

    def test_foreign_or_broken_monitor_data_is_not_assigned_to_a_turn(self):
        foreign = monitor('foreign', owner={**OWNER, 'connectionId': 'other-connection'})
        broken = user('broken', content='<task-notification><event>{"event":"flowview_result", bad</event></task-notification>')
        result = capture.analyze(encoded(monitor('ours'), assistant('ours'), foreign,
                                         assistant('foreign-reply'), broken, assistant('broken-reply')),
                                 SID, [OWNER])
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 1)
        self.assertEqual(len(result['attributionIssues']), 2)
        self.assertEqual(len(result['unattributedAssistantLines']), 2)

    def test_pasted_request_and_reconnected_result_share_verified_turn(self):
        renewed = {**OWNER, 'connectionId': 'connection-2'}
        rows = [pasted('clipboard'), assistant('proposal', stop='tool_use'),
                monitor('result', kind='result', owner=renewed), assistant('receipt')]
        result = capture.analyze(encoded(*rows), SID, [OWNER, renewed])
        self.assertEqual(len(result['turns']), 1)
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 2)
        self.assertEqual(result['turns'][0]['userMessageAliases'], ['result'])
        foreign = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual(foreign['turns'][0]['assistantMessageCount'], 1)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-pilot-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'diagram'
        self.folder.mkdir()
        self.claude = self.root / 'claude'
        self.project = self.claude / 'projects' / '-example'
        self.project.mkdir(parents=True)
        self.native = self.project / (SID + '.jsonl')
        self.native.write_bytes(encoded(user(), assistant()))

    def run_capture(self, session_id=SID, enable=True, folder=None, claude_dir=None):
        return capture.capture(folder or self.folder, session_id, enable=enable,
                               claude_dir=claude_dir or self.claude)

    def usage(self):
        return json.loads((self.folder / capture.USAGE).read_text())

    def test_exact_native_lines_partial_tail_and_repeat_capture(self):
        raw = encoded(user(), assistant()).replace(b'\n', b'\r\n')
        self.native.write_bytes(raw + b'{"type":')
        self.run_capture()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), raw)
        self.assertEqual(self.usage()['sessions'][0]['pendingBytes'], 8)
        self.run_capture(enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), raw)
        self.native.write_bytes(raw + encoded(user('next', 'message-1'), assistant('second')))
        self.run_capture(enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())

    def test_enrollment_excludes_earlier_chat_and_requires_new_participant_authorization(self):
        earlier = encoded(user('earlier'), assistant('earlier'))
        pilot = encoded(user('pilot', 'earlier-block', 'Use pilot mode'), assistant('pilot-reply'))
        self.native.write_bytes(earlier + pilot)
        self.run_capture()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot)
        self.assertEqual(self.usage()['sessions'][0]['captureStart']['nativeByteOffset'], len(earlier))
        other_raw = encoded({**user('engineer'), 'sessionId': OTHER},
                            {**assistant('engineer-reply'), 'sessionId': OTHER})
        (self.project / (OTHER + '.jsonl')).write_bytes(other_raw)
        result = self.run_capture(OTHER, enable=False)
        self.assertEqual(result['status'], 'consent_required')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot)
        self.run_capture(OTHER)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot + other_raw)

    def test_transferred_folder_retains_prior_capture_when_source_is_missing(self):
        self.run_capture()
        transferred = self.root / 'transferred'
        shutil.copytree(self.folder, transferred)
        new_claude = self.root / 'engineer-claude'
        new_project = new_claude / 'projects' / '-example'
        new_project.mkdir(parents=True)
        other_raw = encoded({**user('engineer'), 'sessionId': OTHER},
                            {**assistant('engineer-reply'), 'sessionId': OTHER})
        (new_project / (OTHER + '.jsonl')).write_bytes(other_raw)
        result = self.run_capture(OTHER, folder=transferred, claude_dir=new_claude)
        self.assertEqual(result['status'], 'partial')
        self.assertTrue(result['currentSourceAvailable'])
        self.assertEqual((transferred / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes() + other_raw)
        sessions = json.loads((transferred / capture.USAGE).read_text())['sessions']
        self.assertEqual(sessions[0]['sourceStatus'], 'archived_only')
        self.assertEqual(sessions[1]['sourceStatus'], 'current')

    def test_ignore_rules_and_existing_files_are_preserved(self):
        (self.folder / '.gitignore').write_text('participant-notes.tmp\n')
        self.run_capture()
        self.run_capture(enable=False)
        rules = (self.folder / '.gitignore').read_text()
        self.assertTrue(rules.startswith('participant-notes.tmp\n'))
        self.assertEqual(rules.count('*.agent.transcript.jsonl'), 1)
        subprocess.run(['git', 'init', '-q', str(self.folder)], check=True, capture_output=True)
        ignored = subprocess.run(['git', 'check-ignore', capture.TRANSCRIPT, capture.USAGE,
                                  '.flowview-pilot/config.json'], cwd=self.folder,
                                 check=True, capture_output=True, text=True)
        self.assertEqual(len(ignored.stdout.splitlines()), 3)

    def test_missing_native_source_and_invalid_json_are_reported_without_loss(self):
        self.run_capture()
        saved = (self.folder / capture.TRANSCRIPT).read_bytes()
        self.native.unlink()
        self.assertEqual(self.run_capture(enable=False)['status'], 'partial')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), saved)
        self.native.write_bytes(saved + b'broken-json\n')
        self.assertEqual(self.run_capture(enable=False)['status'], 'partial')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), saved + b'broken-json\n')
        self.assertEqual(self.usage()['sessions'][0]['invalidJsonLines'], 1)

    def test_cli_discovers_session_without_participant_finding_native_file(self):
        run = subprocess.run([sys.executable, str(SCRIPT), '--folder', str(self.folder), '--enable'],
                             env={**os.environ, 'CLAUDE_CODE_SESSION_ID': SID,
                                  'CLAUDE_CONFIG_DIR': str(self.claude)},
                             capture_output=True, text=True, timeout=10)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['status'], 'captured')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())

    def test_detached_final_copy_waits_for_new_reply_not_old_completion(self):
        self.run_capture()
        self.native.write_bytes(self.native.read_bytes() +
                                encoded(user('next', 'message-1'), assistant('tool', stop='tool_use')))
        run = subprocess.run([sys.executable, str(SCRIPT), '--folder', str(self.folder), '--after-turn'],
                             env={**os.environ, 'CLAUDE_CODE_SESSION_ID': SID,
                                  'CLAUDE_CONFIG_DIR': str(self.claude)},
                             capture_output=True, text=True, timeout=10)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn('scheduled', json.loads(run.stdout)['afterTurnCopy'])
        status = self.folder / capture.PRIVATE / 'after-turn-status.json'
        time.sleep(1.2)
        self.assertFalse(status.exists(), 'An earlier completed response must not satisfy this copy')
        self.native.write_bytes(self.native.read_bytes() + encoded(assistant('final')))
        deadline = time.monotonic() + 8
        while not status.exists() and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertTrue(status.exists())
        self.assertEqual(json.loads(status.read_text())['outcome'], 'captured')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())

    def test_final_copy_does_not_accept_another_turns_reply(self):
        self.run_capture()
        unrelated = {'currentSourceAvailable': True, 'turnId': 'target',
                     'finalResponseCaptured': False, 'turnLastAssistantLine': 2,
                     'nativeProgress': {'lastAssistantLine': 4, 'lastAssistantTurnId': 'other',
                                        'finalResponseCaptured': True}}
        with patch.object(capture, 'capture', return_value=unrelated), \
             patch.object(capture.time, 'sleep'), \
             patch.object(capture.time, 'monotonic', side_effect=[0, 0, 1]):
            capture.settle(self.folder, SID, 'target', after_line=2, seconds=1)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'timeout_response_pending')
        self.assertFalse(status['replyCapture']['finalResponseCaptured'])


if __name__ == '__main__':
    unittest.main()
