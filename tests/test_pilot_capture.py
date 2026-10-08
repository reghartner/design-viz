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
import threading
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

    def run_capture(self, session_id=SID, enable=True, folder=None, claude_dir=None, explicit_opt_in=False, after_turn=False):
        return capture.capture(folder or self.folder, session_id, enable=enable,
                               claude_dir=claude_dir or self.claude, explicit_opt_in=explicit_opt_in, after_turn=after_turn)

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

    def write_setup(self, choice, connection='connection-new'):
        support = self.folder / '.flowview-agent'
        support.mkdir(exist_ok=True)
        owner = {**OWNER, 'connectionId': connection}
        (support / 'session.json').write_text(json.dumps({'protocol': 'flowview-folder-v1', **owner}))
        text = ('Locate the diagram folder. Verify .flowview-agent/session.json has sessionId ' +
            json.dumps(owner['sessionId']) + ' and connectionId ' + json.dumps(owner['connectionId']) + '.\n\n' +
            'Pilot capture: ' + choice + ' for this session.\n')
        (support / 'CONNECT.md').write_text(text)
        return text

    def test_never_enrolled_session_can_directly_paste_new_on_after_off(self):
        self.run_capture()  # Another participant has already used this folder.
        self.write_setup('OFF')
        capture.disable(self.folder, OTHER)
        prompt = self.write_setup('ON', connection='later-on-connection')
        (self.project / (OTHER + '.jsonl')).write_bytes(encoded({**user('direct-on', content=prompt), 'sessionId': OTHER}))
        result = self.run_capture(OTHER)
        self.assertEqual(result['status'], 'captured')
        self.assertTrue(result['currentSourceAvailable'])
        self.assertEqual(self.usage()['sessions'][-1]['captureStart']['participantTurnId'], 'direct-on')

    def test_never_enrolled_session_cannot_reuse_same_stopped_on_setup(self):
        self.run_capture()
        prompt = self.write_setup('ON')
        capture.disable(self.folder, OTHER)
        (self.project / (OTHER + '.jsonl')).write_bytes(encoded({**user('stale-on', content=prompt), 'sessionId': OTHER}))
        with patch.object(capture, 'source_for', side_effect=AssertionError('stopped ON cannot be reused')):
            self.assertEqual(self.run_capture(OTHER)['status'], 'disabled')

    def test_stopped_new_on_setup_cannot_reuse_an_older_enrollment(self):
        self.run_capture()
        prompt = self.write_setup('ON', connection='new-connection')
        capture.disable(self.folder, SID)
        self.native.write_bytes(self.native.read_bytes() + encoded(user('stale-new-on', content=prompt)))
        with patch.object(capture, 'source_for', side_effect=AssertionError('same stopped setup needs later explicit opt-in')):
            self.assertEqual(self.run_capture()['status'], 'disabled')

    def test_unknown_stopped_setup_cannot_authorize_plain_enable(self):
        self.run_capture()
        prompt = self.write_setup('ON')
        (self.folder / '.flowview-agent' / 'CONNECT.md').write_text('Pilot capture: ON for this session.\n')
        capture.disable(self.folder, OTHER)
        self.write_setup('ON')
        (self.project / (OTHER + '.jsonl')).write_bytes(encoded({**user('old-on', content=prompt), 'sessionId': OTHER}))
        with patch.object(capture, 'source_for', side_effect=AssertionError('unknown stopped setup requires explicit later consent')):
            self.assertEqual(self.run_capture(OTHER)['status'], 'disabled')

    def test_stored_on_is_not_initial_consent_for_a_different_session(self):
        prompt = self.write_setup('ON')
        other_native = self.project / (OTHER + '.jsonl')
        other_native.write_bytes(encoded({**user('copied-request', content='Read CONNECT.md and use registered request request-1'), 'sessionId': OTHER}))
        result = self.run_capture(OTHER)
        self.assertEqual(result['status'], 'disabled')
        self.assertFalse((self.folder / capture.TRANSCRIPT).exists())
        self.native.write_bytes(encoded(user(content=prompt), assistant()))
        self.assertEqual(self.run_capture()['status'], 'captured')
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        with patch.object(capture, 'source_for', side_effect=AssertionError('another session cannot reuse the claimed ON setup')):
            self.assertEqual(self.run_capture(OTHER)['status'], 'disabled')
        # Even the separate override flag requires direct consent in this turn.
        self.assertEqual(self.run_capture(OTHER, explicit_opt_in=True)['status'], 'disabled')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)
        other_native.write_bytes(other_native.read_bytes() + encoded({**user('direct-opt-in', content='Use pilot mode for this session.'), 'sessionId': OTHER}))
        self.assertEqual(self.run_capture(OTHER, explicit_opt_in=True)['status'], 'captured')
        self.assertNotIn(b'copied-request', (self.folder / capture.TRANSCRIPT).read_bytes())

    def test_stop_barrier_blocks_reads_when_registry_lock_is_busy(self):
        self.run_capture()
        before = self.native.read_bytes()
        with patch.object(capture, 'locked', side_effect=OSError('busy lock')):
            result = capture.disable(self.folder, SID)
        self.assertEqual(result['status'], 'disabled')
        self.assertTrue(result['registryUpdatePending'])
        self.native.write_bytes(before + encoded(user('stop-request'), assistant('private-answer')))
        with patch.object(capture, 'source_for', side_effect=AssertionError('stop barrier must block stale registry')):
            self.assertEqual(self.run_capture(enable=False)['status'], 'disabled')
            self.assertEqual(self.run_capture()['status'], 'disabled')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)
        self.assertEqual(capture.disable(self.folder, SID)['status'], 'disabled')
        with self.assertRaises(ValueError):
            capture.capture(self.folder, SID, explicit_opt_in=True)

    def test_missing_retained_segment_preserves_combined_transcript_and_reports_error(self):
        self.run_capture()
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        capture.disable(self.folder, SID)
        (self.folder / capture.PRIVATE / (SID + '.jsonl')).unlink()
        self.native.write_bytes(self.native.read_bytes() + encoded(user('opt-in', content='Use pilot mode for this session.')))
        result = self.run_capture(explicit_opt_in=True)
        self.assertEqual(result['status'], 'partial')
        self.assertIn('missing', result['errors'][0])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)

    def test_off_setup_blocks_old_copier_and_other_participant_before_disable_runs(self):
        first = self.run_capture()
        other_raw = encoded({**user('engineer'), 'sessionId': OTHER},
                            {**assistant('engineer-reply'), 'sessionId': OTHER})
        other_native = self.project / (OTHER + '.jsonl')
        other_native.write_bytes(other_raw)
        self.run_capture(OTHER)
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        usage_before = (self.folder / capture.USAGE).read_bytes()
        archive_before = (self.folder / capture.PRIVATE / (SID + '.jsonl')).read_bytes()
        # Browser publishes OFF before the participant pastes the new setup turn.
        # Neither participant has executed --disable yet.
        self.write_setup('OFF')
        self.native.write_bytes(self.native.read_bytes() + encoded(user('off-setup'), assistant('off-reply')))
        other_native.write_bytes(other_raw + encoded({**user('other-new'), 'sessionId': OTHER}))
        with patch.object(capture, 'source_for', side_effect=AssertionError('OFF must block before transcript discovery')):
            self.assertEqual(self.run_capture(enable=False)['status'], 'disabled')
            self.assertEqual(self.run_capture()['status'], 'disabled', 'stale --enable cannot override OFF')
            self.assertEqual(self.run_capture(OTHER, enable=False)['status'], 'disabled')
            self.assertEqual(self.run_capture(OTHER)['status'], 'disabled', 'another stale --enable cannot override OFF')
            with patch.object(capture.time, 'sleep'):
                capture.settle(self.folder, SID, 'turn-1', after_line=2, capture_id=first['captureId'], job_id=first['captureReceipt']['jobId'])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)
        self.assertEqual((self.folder / capture.USAGE).read_bytes(), usage_before)
        self.assertEqual((self.folder / capture.PRIVATE / (SID + '.jsonl')).read_bytes(), archive_before)
        # Even a broken registry cannot turn the explicit OFF gate into reads.
        (self.folder / capture.PRIVATE / 'config.json').write_text('{broken')
        with patch.object(capture, 'source_for', side_effect=AssertionError('broken registry must fail closed')):
            with self.assertRaises(ValueError):
                self.run_capture(enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)

    def test_explicit_reenable_after_off_gate_creates_segment_without_disable_first(self):
        self.run_capture()
        before = self.native.read_bytes()
        self.write_setup('OFF')
        off = encoded(user('off-setup'), assistant('off-reply'))
        self.native.write_bytes(before + off)
        self.assertEqual(self.run_capture(enable=False)['status'], 'disabled')
        enabled = encoded(user('later-opt-in', content='Enable pilot capture now'), assistant('later-public'))
        self.native.write_bytes(before + off + enabled)
        self.assertEqual(self.run_capture()['status'], 'disabled')
        result = self.run_capture(explicit_opt_in=True)
        self.assertEqual(result['status'], 'captured')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before + enabled)
        self.assertEqual(self.usage()['sessions'][-1]['captureStart']['nativeByteOffset'], len(before + off))
        self.assertEqual(self.run_capture(enable=False)['status'], 'captured')
        # This later authorization belongs only to its current connection.
        self.write_setup('OFF', connection='connection-next')
        with patch.object(capture, 'source_for', side_effect=AssertionError('old consent cannot cross a new connection')):
            self.assertEqual(self.run_capture(enable=False)['status'], 'disabled')

    def test_gate_change_during_native_read_discards_bytes_before_publication(self):
        prompt = self.write_setup('ON')
        self.native.write_bytes(encoded(user(content=prompt), assistant()))
        self.run_capture()
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        archive = self.folder / capture.PRIVATE / (SID + '.jsonl')
        archive_before = archive.read_bytes()
        native = self.native
        write_setup = self.write_setup
        class InterruptedNative:
            def read_bytes(self):
                write_setup('OFF')
                native.write_bytes(native.read_bytes() + encoded(user('off-arrived-during-read')))
                return native.read_bytes()
        with patch.object(capture, 'source_for', return_value=InterruptedNative()):
            result = self.run_capture(enable=False)
        self.assertEqual(result['status'], 'disabled')
        self.assertEqual(archive.read_bytes(), archive_before)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)

    def test_stop_during_initial_enrollment_blocks_before_registry_exists(self):
        atomic = capture.atomic
        archive = self.folder / capture.PRIVATE / (SID + '.jsonl')
        fired = False
        def stop_initial_publish(path, data):
            nonlocal fired
            if path.resolve() == archive.resolve() and not fired:
                fired = True
                with patch.object(capture, 'locked', side_effect=OSError('initial capture owns lock')):
                    self.assertEqual(capture.disable(self.folder, SID)['status'], 'disabled')
            atomic(path, data)
        with patch.object(capture, 'atomic', side_effect=stop_initial_publish):
            self.assertEqual(self.run_capture()['status'], 'disabled')
        self.assertTrue(fired)
        self.assertFalse(archive.exists())
        self.assertFalse((self.folder / capture.TRANSCRIPT).exists())
        self.assertFalse((self.folder / capture.PRIVATE / 'config.json').exists())
        with patch.object(capture, 'source_for', side_effect=AssertionError('stale enable must not defeat initial stop')):
            self.assertEqual(self.run_capture()['status'], 'disabled')

    def test_stop_token_during_archive_replace_restores_prior_batch(self):
        self.run_capture()
        archive = self.folder / capture.PRIVATE / (SID + '.jsonl')
        targets = [archive, self.folder / capture.TRANSCRIPT, self.folder / capture.USAGE,
                   self.folder / capture.PRIVATE / 'config.json']
        before = {path: path.read_bytes() for path in targets}
        self.native.write_bytes(self.native.read_bytes() + encoded(user('off-turn-at-replace')))
        atomic = capture.atomic
        fired = False
        def revoke_on_archive(path, data):
            nonlocal fired
            if path.resolve() == archive.resolve() and not fired:
                fired = True
                atomic(self.folder / capture.PRIVATE / (SID + '.capture-stop'), b'a' * 32)
            atomic(path, data)
        with patch.object(capture, 'atomic', side_effect=revoke_on_archive):
            result = self.run_capture(enable=False)
        self.assertTrue(fired)
        self.assertEqual(result['status'], 'disabled')
        for path in targets:
            self.assertEqual(path.read_bytes(), before[path], str(path))

    def test_off_setup_during_combined_replace_rolls_back_archives_and_registry(self):
        prompt = self.write_setup('ON')
        self.native.write_bytes(encoded(user(content=prompt), assistant()))
        self.run_capture()
        targets = [self.folder / capture.PRIVATE / (SID + '.jsonl'),
                   self.folder / capture.TRANSCRIPT, self.folder / capture.USAGE,
                   self.folder / capture.PRIVATE / 'config.json']
        before = {path: path.read_bytes() for path in targets}
        self.native.write_bytes(self.native.read_bytes() + encoded(user('off-turn-at-combined-replace')))
        atomic = capture.atomic
        fired = False
        def revoke_on_combined(path, data):
            nonlocal fired
            if path.resolve() == (self.folder / capture.TRANSCRIPT).resolve() and not fired:
                fired = True
                self.write_setup('OFF')
            atomic(path, data)
        with patch.object(capture, 'atomic', side_effect=revoke_on_combined):
            result = self.run_capture(enable=False)
        self.assertTrue(fired)
        self.assertEqual(result['status'], 'disabled')
        for path in targets:
            self.assertEqual(path.read_bytes(), before[path], str(path))

    def test_disable_is_metadata_only_even_with_missing_native_source(self):
        self.run_capture()
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        usage_before = (self.folder / capture.USAGE).read_bytes()
        self.native.unlink()
        original_read = Path.read_bytes
        def metadata_only(path):
            self.assertEqual(path.name, 'config.json', 'disable may read registry metadata only')
            return original_read(path)
        with patch.object(capture, 'source_for', side_effect=AssertionError('native discovery forbidden')), \
             patch.object(Path, 'read_bytes', metadata_only):
            self.assertEqual(capture.disable(self.folder, SID)['status'], 'disabled')
            self.assertEqual(capture.disable(self.folder, SID)['status'], 'disabled')
            self.assertEqual(self.run_capture(enable=False)['status'], 'disabled')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)
        self.assertEqual((self.folder / capture.USAGE).read_bytes(), usage_before)
        with self.assertRaises(ValueError):
            capture.disable(self.folder, None)

    def test_disable_unenrolled_session_does_not_create_capture_artifacts(self):
        with patch.object(capture, 'source_for', side_effect=AssertionError('native discovery forbidden')):
            self.assertEqual(capture.disable(self.folder, SID)['status'], 'disabled')
            self.assertEqual(capture.disable(self.folder, None)['status'], 'disabled')
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_other_participant_checkpoint_never_reads_suspended_native_source(self):
        self.run_capture()
        before = self.native.read_bytes()
        capture.disable(self.folder, SID)
        self.native.write_bytes(before + encoded(user('private-off-turn'), assistant('private-off-answer')))
        other_raw = encoded({**user('engineer'), 'sessionId': OTHER},
                            {**assistant('engineer-reply'), 'sessionId': OTHER})
        (self.project / (OTHER + '.jsonl')).write_bytes(other_raw)
        source_for = capture.source_for
        def only_other(session_id, root):
            self.assertEqual(session_id, OTHER, 'suspended native source must not be discovered')
            return source_for(session_id, root)
        with patch.object(capture, 'source_for', side_effect=only_other):
            self.assertEqual(self.run_capture(OTHER)['status'], 'captured')
            self.assertEqual(self.run_capture(OTHER, enable=False)['status'], 'captured')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before + other_raw)
        self.assertEqual(self.usage()['sessions'][0]['sourceStatus'], 'suspended')
        self.assertFalse(self.usage()['sessions'][0]['sourceAvailable'])

    def test_reenable_preserves_segments_and_excludes_off_interval_and_stale_copiers(self):
        first = self.run_capture()
        kept = self.native.read_bytes()
        for number in range(2):
            capture.disable(self.folder, SID)
            off = encoded(user('private-' + str(number)), assistant('private-' + str(number)))
            new = encoded(user('opt-in-' + str(number), content='Use pilot mode'), assistant('public-' + str(number)))
            previous_native = self.native.read_bytes()
            self.native.write_bytes(previous_native + off + new)
            result = self.run_capture(explicit_opt_in=True)
            self.assertEqual(result['status'], 'captured')
            kept += new
            self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), kept)
            segments = self.usage()['sessions']
            self.assertEqual(len(segments), number + 2)
            self.assertEqual(segments[-1]['captureStart']['nativeByteOffset'], len(previous_native + off))
            self.assertEqual(segments[-1]['captureStart']['nativeLine'], (previous_native + off).count(b'\n') + 1)
            self.assertEqual(segments[-1]['captureState'], 'active')
            self.assertTrue(all(segment['captureState'] == 'suspended' for segment in segments[:-1]))
            self.assertEqual(result['turnId'], 'opt-in-' + str(number))
            with patch.object(capture, 'source_for', side_effect=AssertionError('stale copier must not read native source')):
                stale = capture.capture(self.folder, SID, expected_capture_id=first['captureId'])
                self.assertEqual(stale['status'], 'disabled')
            self.run_capture(enable=False)
            self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), kept)
        self.assertEqual(len({segment['captureId'] for segment in self.usage()['sessions']}), 3)
        capture.disable(self.folder, SID)
        refused = self.run_capture(explicit_opt_in=True)
        self.assertEqual(refused['status'], 'partial', 'cannot recapture a turn already in a retained segment')
        self.assertFalse(refused['currentSourceAvailable'])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), kept)

    def test_pending_final_copy_stops_after_disable_without_reading_native_source(self):
        enrolled = self.run_capture(after_turn=True)
        capture.disable(self.folder, SID)
        with patch.object(capture, 'source_for', side_effect=AssertionError('disabled copier must not read source')), \
             patch.object(capture.time, 'sleep'):
            capture.settle(self.folder, SID, 'turn-1', after_line=2, capture_id=enrolled['captureId'], job_id=enrolled['captureReceipt']['jobId'])
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'disabled')
        self.assertFalse(status['replyCapture']['finalResponseCaptured'])

    def test_cli_disable_does_not_schedule_and_retains_existing_capture(self):
        self.run_capture()
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        self.native.unlink()
        env = {**os.environ, 'CLAUDE_CODE_SESSION_ID': SID, 'CLAUDE_CONFIG_DIR': str(self.claude)}
        command = [sys.executable, str(SCRIPT), '--folder', str(self.folder), '--disable']
        run = subprocess.run(command, env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['status'], 'disabled')
        invalid = subprocess.run(command + ['--after-turn'], env=env, capture_output=True, text=True, timeout=10)
        self.assertNotEqual(invalid.returncode, 0)
        stale_command = [sys.executable, str(SCRIPT), '--folder', str(self.folder),
                         '--settle-turn', 'turn-1', '--settle-after-line', '2']
        stale = subprocess.run(stale_command, env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(stale.returncode, 2, 'pre-upgrade copier lacks a safe enrollment identity')
        self.assertFalse((self.folder / capture.PRIVATE / 'after-turn.log').exists())
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)

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
        pending = json.loads(status.read_text())
        self.assertEqual(pending['outcome'], 'pending', 'An earlier completed response must not satisfy this copy')
        self.assertEqual(pending['turnId'], 'next')
        self.assertEqual(pending['jobId'], json.loads(run.stdout)['captureReceipt']['jobId'])
        self.native.write_bytes(self.native.read_bytes() + encoded(assistant('final')))
        deadline = time.monotonic() + 8
        while json.loads(status.read_text())['outcome'] == 'pending' and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertTrue(status.exists())
        self.assertEqual(json.loads(status.read_text())['outcome'], 'captured')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())

    def test_final_copy_does_not_accept_another_turns_reply(self):
        self.native.write_bytes(encoded(user('target'), assistant(stop='tool_use')))
        result = self.run_capture(after_turn=True)
        unrelated = {'currentSourceAvailable': True, 'turnId': 'target',
                     'finalResponseCaptured': False, 'turnLastAssistantLine': 2,
                     'nativeProgress': {'lastAssistantLine': 4, 'lastAssistantTurnId': 'other',
                                        'finalResponseCaptured': True}}
        with patch.object(capture, 'capture', return_value=unrelated), \
             patch.object(capture.time, 'sleep'), \
             patch.object(capture.time, 'monotonic', side_effect=[0, 0, 1]):
            capture.settle(self.folder, SID, 'target', after_line=2, seconds=1, capture_id=result['captureId'], job_id=result['captureReceipt']['jobId'])
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'timeout_response_pending')
        self.assertFalse(status['replyCapture']['finalResponseCaptured'])


    def receipt(self, session_id=None):
        name = (session_id + '.' if session_id else '') + capture.STATUS_FILE
        return json.loads((self.folder / capture.PRIVATE / name).read_text())

    def test_new_turn_replaces_captured_receipt_before_launch(self):
        first = self.run_capture(after_turn=True)['captureReceipt']
        self.assertTrue(capture.finish_status(self.folder, first, 'captured', {'finalResponseCaptured': True}))
        self.native.write_bytes(self.native.read_bytes() + encoded(user('next-turn'), assistant('tool', stop='tool_use')))
        second = self.run_capture(enable=False, after_turn=True)['captureReceipt']
        self.assertEqual(second['outcome'], 'pending')
        self.assertNotEqual(first['jobId'], second['jobId'])
        self.assertEqual(self.receipt()['turnId'], 'next-turn')
        self.assertEqual(self.receipt()['afterNativeLine'], 4)
        self.assertFalse(self.receipt()['replyCapture']['finalResponseCaptured'])
        with patch.object(capture, 'capture', side_effect=AssertionError('superseded worker must not capture')):
            capture.settle(self.folder, SID, first['turnId'], first['afterNativeLine'],
                           capture_id=first['captureId'], job_id=first['jobId'])
        self.assertFalse(capture.finish_status(self.folder, first, 'captured'))
        self.assertEqual(self.receipt()['jobId'], second['jobId'])
        self.assertEqual(self.receipt()['outcome'], 'pending')

    def test_worker_finishing_during_new_capture_cannot_regress_receipt(self):
        first = self.run_capture(after_turn=True)['captureReceipt']
        self.native.write_bytes(self.native.read_bytes() + encoded(assistant('first-final')))
        captured, release = threading.Event(), threading.Event()
        original = capture.capture
        failures = []
        def hold_worker(*args, **kwargs):
            result = original(*args, **kwargs)
            if kwargs.get('status_job'):
                captured.set()
                if not release.wait(5):
                    raise AssertionError('worker was not released')
            return result
        def run_worker():
            try:
                capture.settle(self.folder, SID, first['turnId'], first['afterNativeLine'],
                               capture_id=first['captureId'], job_id=first['jobId'])
            except BaseException as error:
                failures.append(error)
        with patch.object(capture, 'capture', side_effect=hold_worker), \
             patch.dict(os.environ, {'CLAUDE_CONFIG_DIR': str(self.claude)}):
            worker = threading.Thread(target=run_worker)
            worker.start()
            try:
                self.assertTrue(captured.wait(5))
                self.native.write_bytes(self.native.read_bytes() + encoded(user('next'), assistant('tool', stop='tool_use')))
                second = self.run_capture(enable=False, after_turn=True)['captureReceipt']
            finally:
                release.set()
                worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(failures, [])
        self.assertEqual(self.receipt()['jobId'], second['jobId'])
        self.assertEqual(self.receipt(SID)['outcome'], 'pending')

    def test_stop_during_status_replace_cannot_leave_success(self):
        first = self.run_capture(after_turn=True)['captureReceipt']
        atomic = capture.atomic
        fired = False
        def stop_at_replace(path, data):
            nonlocal fired
            if path.name == capture.STATUS_FILE and not fired:
                fired = True
                atomic(self.folder / capture.PRIVATE / (SID + '.capture-stop'), b'b' * 32)
            atomic(path, data)
        with patch.object(capture, 'atomic', side_effect=stop_at_replace):
            capture.finish_status(self.folder, first, 'captured', {'finalResponseCaptured': True})
        self.assertTrue(fired)
        self.assertEqual(self.receipt()['outcome'], 'disabled')
        self.assertEqual(self.receipt(SID)['outcome'], 'disabled')
        self.assertFalse(self.receipt()['replyCapture']['finalResponseCaptured'])

    def test_same_turn_new_boundary_and_repeat_job_cannot_finish_new_receipt(self):
        first = self.run_capture(after_turn=True)['captureReceipt']
        self.native.write_bytes(self.native.read_bytes() + encoded(assistant('more-tools', stop='tool_use')))
        second = self.run_capture(enable=False, after_turn=True)['captureReceipt']
        self.assertEqual(first['turnId'], second['turnId'])
        self.assertGreater(second['afterNativeLine'], first['afterNativeLine'])
        self.assertFalse(capture.finish_status(self.folder, first, 'failed'))
        self.assertTrue(capture.finish_status(self.folder, second, 'timeout_response_pending'))
        self.assertFalse(capture.finish_status(self.folder, second, 'captured'))
        self.assertEqual(self.receipt()['outcome'], 'timeout_response_pending')

    def test_foreign_worker_and_disable_cannot_overwrite_latest_participant_status(self):
        first = self.run_capture(after_turn=True)['captureReceipt']
        (self.project / (OTHER + '.jsonl')).write_bytes(encoded({**user('other-turn'), 'sessionId': OTHER}))
        second = self.run_capture(OTHER, after_turn=True)['captureReceipt']
        self.assertTrue(capture.finish_status(self.folder, first, 'captured'))
        self.assertEqual(self.receipt(SID)['outcome'], 'captured')
        self.assertEqual(self.receipt()['jobId'], second['jobId'])
        capture.disable(self.folder, SID)
        self.assertEqual(self.receipt(SID)['outcome'], 'disabled')
        self.assertEqual(self.receipt()['jobId'], second['jobId'])

    def test_spawn_failure_marks_matching_job_failed(self):
        result = self.run_capture(after_turn=True)
        with patch.object(capture.subprocess, 'Popen', side_effect=OSError('synthetic launch failure')):
            with self.assertRaisesRegex(OSError, 'synthetic launch failure'):
                capture.launch_copy(self.folder, SID, result)
        self.assertEqual(self.receipt()['outcome'], 'failed')
        self.assertEqual(self.receipt()['jobId'], result['captureReceipt']['jobId'])
        self.assertFalse(self.receipt()['replyCapture']['finalResponseCaptured'])

    def test_old_launch_failure_cannot_replace_new_pending_job(self):
        first = self.run_capture(after_turn=True)
        second = self.run_capture(enable=False, after_turn=True)['captureReceipt']
        with patch.object(capture.subprocess, 'Popen', side_effect=OSError('late launch failure')):
            with self.assertRaises(OSError):
                capture.launch_copy(self.folder, SID, first)
        self.assertEqual(self.receipt()['jobId'], second['jobId'])
        self.assertEqual(self.receipt()['outcome'], 'pending')

    def test_expired_job_records_timeout_without_reading_native_source(self):
        result = self.run_capture(after_turn=True)['captureReceipt']
        with patch.object(capture, 'source_for', side_effect=AssertionError('expired job must not read')):
            capture.settle(self.folder, SID, result['turnId'], result['afterNativeLine'], seconds=0,
                           capture_id=result['captureId'], job_id=result['jobId'])
        self.assertEqual(self.receipt()['outcome'], 'timeout_response_pending')

    def test_reenrollment_and_new_connection_reject_old_worker_and_health(self):
        prompt = self.write_setup('ON')
        self.native.write_bytes(encoded(user(content=prompt), assistant()))
        first = self.run_capture(after_turn=True)['captureReceipt']
        support = self.folder / '.flowview-agent'
        capture.disable(self.folder, SID)
        prompt = self.write_setup('ON', connection='new-connection')
        self.native.write_bytes(self.native.read_bytes() + encoded(user('new-opt-in', content=prompt)))
        second = self.run_capture(after_turn=True)['captureReceipt']
        with patch.object(capture, 'capture', side_effect=AssertionError('replaced worker must not capture')):
            capture.settle(self.folder, SID, first['turnId'], first['afterNativeLine'],
                           capture_id=first['captureId'], job_id=first['jobId'])
        self.assertFalse(capture.finish_status(self.folder, first, 'captured'))
        health = json.loads((support / capture.HEALTH_FILE).read_text())
        self.assertEqual(health['connectionId'], 'new-connection')
        self.assertEqual(health['jobId'], second['jobId'])
        self.assertEqual(health['outcome'], 'pending')

    def test_health_is_allowlisted_and_foreign_failure_cannot_replace_it(self):
        prompt = self.write_setup('ON')
        self.native.write_bytes(encoded(user(content=prompt), assistant()))
        first = self.run_capture(after_turn=True)['captureReceipt']
        health_path = self.folder / '.flowview-agent' / capture.HEALTH_FILE
        before = health_path.read_bytes()
        health = json.loads(before)
        self.assertEqual(set(health), {'schema', 'sessionId', 'connectionId', 'jobId', 'outcome', 'updatedAt', 'expiresAt', 'deadlineAt'})
        for private_value in [SID, 'turn-1', 'claude-a', 'output_tokens', 'Response']:
            self.assertNotIn(private_value, before.decode())
        self.assertEqual(self.run_capture(OTHER)['status'], 'disabled')
        self.assertEqual(health_path.read_bytes(), before)
        self.assertEqual(self.receipt()['jobId'], first['jobId'])

    def test_disable_publishes_status_even_while_registry_lock_is_busy(self):
        self.run_capture(after_turn=True)
        locked = capture.locked
        def busy_registry(folder, name='capture.lock'):
            if name == 'capture.lock':
                raise OSError('busy registry')
            return locked(folder, name)
        with patch.object(capture, 'locked', side_effect=busy_registry), \
             patch.object(capture, 'source_for', side_effect=AssertionError('stop is metadata only')):
            result = capture.disable(self.folder, SID)
        self.assertTrue(result['registryUpdatePending'])
        self.assertEqual(self.receipt()['outcome'], 'disabled')

    def test_turn_start_checkpoint_retains_one_prior_final_receipt_for_closeout(self):
        first = self.run_capture(after_turn=True)
        retained = Path(first['lastAfterTurnReceipt'])
        capture.finish_status(self.folder, first['captureReceipt'], 'captured', {'finalResponseCaptured': True})
        proof = retained.read_bytes()
        self.native.write_bytes(self.native.read_bytes() + encoded(user('closeout')))
        checkpoint = self.run_capture(enable=False)
        self.assertEqual(checkpoint['lastAfterTurnReceipt'], str(retained))
        self.assertEqual(self.receipt()['outcome'], 'checkpoint')
        self.assertEqual(retained.read_bytes(), proof)
        self.assertEqual(json.loads(proof)['jobId'], first['captureReceipt']['jobId'])
        newer = self.run_capture(enable=False, after_turn=True)
        self.assertEqual(json.loads(retained.read_bytes())['jobId'], newer['captureReceipt']['jobId'])
        self.assertEqual(json.loads(retained.read_bytes())['outcome'], 'pending')
        self.assertEqual(len(list(retained.parent.glob('*.last-after-turn-status.json'))), 1)

    def test_disable_retires_retained_pending_copy_after_a_checkpoint(self):
        first = self.run_capture(after_turn=True)
        self.run_capture(enable=False)
        capture.disable(self.folder, SID)
        self.assertEqual(json.loads(Path(first['lastAfterTurnReceipt']).read_text())['outcome'], 'disabled')
        self.assertEqual(self.receipt()['outcome'], 'disabled')

    def test_failed_checkpoint_replaces_old_verified_status(self):
        self.run_capture()
        self.native.unlink()
        result = self.run_capture(enable=False)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(self.receipt()['outcome'], 'failed')


if __name__ == '__main__':
    unittest.main()
