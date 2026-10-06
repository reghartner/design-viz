"""Native Claude capture fixtures; no model calls, transcript exports or network."""
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


def user(name='turn-1', parent=None):
    return {'type': 'user', 'sessionId': SID, 'uuid': name, 'parentUuid': parent,
            'timestamp': '2026-10-06T10:00:00Z', 'message': {'role': 'user', 'content': 'A participant story'}}


def assistant(name='message-1', model='claude-a', stop='end_turn'):
    return {'type': 'assistant', 'sessionId': SID, 'uuid': name + '-block',
            'message': {'id': name, 'model': model, 'stop_reason': stop, 'content': [{'type': 'text', 'text': 'Response'}],
                        'usage': {'input_tokens': 4, 'output_tokens': 8,
                                  'cache_read_input_tokens': 12, 'cache_creation_input_tokens': 16}}}


def cost(amount, unknown=False):
    return {'type': 'cost-state', 'sessionId': SID, 'totalCostUSD': amount,
            'hasUnknownModelCost': unknown, 'modelUsage': {'claude-a': {'costUSD': amount}}}


def monitor(native_id, request_id='request-1', kind='request', event_id=None, owner=None):
    event = {'event': 'flowview_' + kind, 'file': '/pilot/.flowview-agent/' + kind + '.json',
             'id': event_id or (request_id if kind == 'request' else 'proposal-1'),
             'requestId': request_id, **(owner or OWNER)}
    # The request body is not sent by Monitor: folder-agent.py emits only this
    # envelope, which Claude receives as a native task-notification user row.
    content = ('<task-notification>\n<task-id>monitor-1</task-id>\n<task-type>monitor</task-type>\n'
               '<summary>Monitor event</summary>\n<event>' + json.dumps(event) + '</event>\n</task-notification>')
    return {**user(native_id, 'previous-native-message'), 'message': {'role': 'user', 'content': content}}


def monitor_batch(native_id, *events):
    """Real Monitor framing: each print from watch is one JSON line in event."""
    lines = [json.dumps(capture.flowview_payload(event)) if isinstance(event, dict) else event for event in events]
    return {**user(native_id, 'previous-native-message'), 'message': {'role': 'user', 'content':
            '<task-notification>\n<task-id>monitor-1</task-id>\n<task-type>monitor</task-type>\n'
            '<summary>Monitor event</summary>\n<event>' + '\n'.join(lines) + '</event>\n</task-notification>'}}


def pasted(native_id, request_id='request-1', owner=None):
    owner = owner or OWNER
    return {**user(native_id), 'message': {'content':
            'Read CONNECT.md in our shared folder "diagram". Use registered request ' + json.dumps(request_id) +
            ' (session ' + json.dumps(owner['sessionId']) + ', connection ' + json.dumps(owner['connectionId']) +
            '). Read request.json. Reply and ask questions in our agent conversation.\n\nUse pilot mode. Add a step.'}}


def native_progress(final=True, snapshot=None, turn_id='turn-1'):
    return {'lastAssistantLine': 11, 'lastAssistantTurnId': turn_id, 'finalResponseCaptured': final,
            'costSnapshotId': snapshot, 'costSnapshotLine': 12 if snapshot else None}


class UsageTests(unittest.TestCase):
    def analyze(self, *rows):
        return capture.analyze(encoded(*rows), SID)

    def test_api_content_blocks_and_tool_results_do_not_duplicate_turns_or_usage(self):
        one = assistant(stop='tool_use')
        tool = {'type': 'user', 'message': {'content': [{'type': 'tool_result', 'tool_use_id': 'tool'}]}}
        summary = {**user('summary'), 'isCompactSummary': True}
        result = self.analyze(user(), one, one, tool, summary, assistant('message-2', 'claude-b'), cost(.4))
        self.assertEqual(len(result['turns']), 1)
        turn = result['turns'][0]
        self.assertEqual(turn['tokens']['output_tokens'], 16)
        self.assertEqual(turn['assistantMessageCount'], 2)
        self.assertEqual(turn['modelsObserved'], ['claude-a', 'claude-b'])
        self.assertEqual(turn['costUsd'], .4)
        self.assertEqual(turn['costStatus'], 'reported')
        self.assertEqual(result['reportedSessionCostUsd'], .4)

    def test_consecutive_snapshots_are_deltas_not_cumulative_sums(self):
        result = self.analyze(user(), assistant(), cost(.4), cost(.4),
                              user('turn-2', 'message-1'), assistant('message-2'), cost(.7))
        self.assertEqual([t['costUsd'] for t in result['turns']], [.4, .3])
        self.assertEqual(result['reportedSessionCostUsd'], .7)
        self.assertEqual(result['turns'][1]['costSnapshotId'], result['costSnapshots'][-1]['id'])

    def test_delayed_cumulative_snapshot_cannot_price_individual_turns(self):
        result = self.analyze(user(), assistant(), user('turn-2', 'message-1'), assistant('message-2'), cost(.7),
                              user('turn-3', 'message-2'), assistant('message-3'), cost(.9))
        self.assertEqual([t['costUsd'] for t in result['turns']], [None, None, .2])
        self.assertEqual(result['turns'][1]['costStatus'], 'unavailable')
        self.assertEqual(result['costStatus'], 'reported')

    def test_stale_snapshot_followed_by_more_assistant_work_is_pending(self):
        result = self.analyze(user(), assistant(), cost(.4), assistant('continued'))
        self.assertIsNone(result['turns'][0]['costUsd'])
        self.assertEqual(result['costStatus'], 'pending')
        self.assertEqual(result['reportedSessionCostUsd'], .4)

    def test_unknown_missing_invalid_or_decreasing_cost_stays_null(self):
        for amount in (None, -1, True, '0.4', float('nan')):
            result = self.analyze(user(), assistant(), cost(amount))
            self.assertIsNone(result['turns'][0]['costUsd'])
            self.assertIsNone(result['reportedSessionCostUsd'])
        result = self.analyze(user(), assistant(), cost(.4, unknown=True))
        self.assertIsNone(result['turns'][0]['costUsd'])
        result = self.analyze(user(), assistant(), cost(.4), user('turn-2', 'prior'), assistant('m2'), cost(.1))
        self.assertIsNone(result['turns'][1]['costUsd'])
        self.assertEqual(result['turns'][1]['costStatus'], 'unavailable')

    def test_partial_history_needs_a_native_baseline(self):
        tail = (user('turn-2', 'outside-capture'), assistant(), cost(.7))
        self.assertIsNone(self.analyze(*tail)['turns'][0]['costUsd'])
        self.assertEqual(self.analyze(cost(.4), *tail)['turns'][0]['costUsd'], .3)

    def test_no_cost_state_preserves_tokens_and_observed_models(self):
        result = self.analyze(user(), assistant())
        self.assertIsNone(result['reportedSessionCostUsd'])
        self.assertEqual(result['turns'][0]['costStatus'], 'pending')
        self.assertEqual(result['turns'][0]['tokens']['input_tokens'], 4)
        self.assertEqual(result['modelsObserved'], ['claude-a'])

    def test_duplicate_user_uuid_does_not_create_another_turn(self):
        result = self.analyze(user(), assistant(), user(), cost(.4))
        self.assertEqual(len(result['turns']), 1)
        self.assertEqual(result['turns'][0]['costUsd'], .4)

    def test_skill_slash_command_is_a_user_turn_but_local_command_output_is_not(self):
        prompt = {**user(), 'message': {'content': '<command-name>/hld-to-page</command-name> pilot mode'}}
        output = {**user('local-output'), 'message': {'content': '<local-command-stdout>local result</local-command-stdout>'}}
        result = self.analyze(prompt, output, assistant(), cost(.4))
        self.assertEqual([turn['id'] for turn in result['turns']], ['turn-1'])

    def test_native_control_rows_cannot_split_a_participant_turn(self):
        controls = ['<task-notification><task-id>abc</task-id>Background task finished</task-notification>',
                    '<system-reminder>Context was compacted</system-reminder>',
                    '[Request interrupted by user]', '[Request interrupted by user for tool use]',
                    '<local-command-caveat>Local command</local-command-caveat>',
                    '<command-name>/cost</command-name>\n<command-message>cost</command-message>',
                    '<command-message>model</command-message>',
                    '<local-command-stdout>Local result</local-command-stdout>',
                    '<bash-input>printf local</bash-input>', '<bash-stdout>local</bash-stdout>',
                    '<bash-stderr>local warning</bash-stderr>', '/effort high', '/fast', '/statusline',
                    '<command-name>/permissions</command-name><command-message>permissions</command-message>',
                    '<local-command-caveat>Local command</local-command-caveat><command-name>/new-local-command</command-name>']
        rows = [user(), assistant(stop='tool_use')]
        for index, text in enumerate(controls):
            rows.append({**user('control-' + str(index)), 'message': {'content': text}})
        rows.extend([assistant('continuation'), cost(.4)])
        result = self.analyze(*rows)
        self.assertEqual(len(result['turns']), 1)
        self.assertEqual(result['turns'][0]['costUsd'], .4)
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 2)

    def test_duplicate_slash_wrappers_coalesce_without_losing_the_authored_request(self):
        rows = [
            {**user(), 'message': {'content': '/hld-to-page pilot mode'}},
            {**user('wrapper-1'), 'message': {'content': '<command-message>hld-to-page</command-message>'}},
            {**user('wrapper-2'), 'message': {'content': '<command-name>/hld-to-page</command-name>\n<command-args>pilot mode</command-args>'}},
            assistant(), cost(.4),
            {**user('next', 'prior'), 'message': {'content': '/hld-to-page next request'}},
            assistant('next-answer'), cost(.7)]
        result = self.analyze(*rows)
        self.assertEqual([t['id'] for t in result['turns']], ['turn-1', 'next'])
        self.assertEqual(result['turns'][0]['userMessageAliases'], ['wrapper-1', 'wrapper-2'])
        self.assertEqual([t['costUsd'] for t in result['turns']], [.4, .3])

    def test_native_output_identifies_unknown_local_command_without_dropping_authored_skill(self):
        command = {**user('local-command', 'prior'), 'message': {'content': '<command-name>/future-local-setting</command-name>'}}
        output = {**user('local-output', 'local-command'), 'message': {'content': '<local-command-stdout>Updated</local-command-stdout>'}}
        skill = {**user('real-skill', 'local-output'), 'message': {'content': '/hld-to-page pilot mode'}}
        unrelated_output = {**user('late-local-output', 'another-command'), 'message': {'content': '<local-command-stdout>Late result</local-command-stdout>'}}
        result = self.analyze(user(), assistant(), cost(.1), command, output, skill, unrelated_output, assistant('skill-answer'), cost(.4))
        self.assertEqual([t['id'] for t in result['turns']], ['turn-1', 'real-skill'])
        self.assertEqual(result['turns'][1]['costUsd'], .3)

    def test_control_prefix_does_not_drop_real_authored_text_after_it(self):
        text = [{'type': 'text', 'text': '<system-reminder>Metadata</system-reminder>'},
                {'type': 'text', 'text': 'Make this a pilot.'}]
        result = self.analyze({**user(), 'message': {'content': text}}, assistant(), cost(.4))
        self.assertEqual(len(result['turns']), 1)

    def test_unknown_model_snapshot_is_unavailable_instead_of_waiting_for_a_write(self):
        result = self.analyze(user(), assistant(), cost(.4, unknown=True))
        self.assertEqual(result['costStatus'], 'unavailable')
        self.assertEqual(result['costReason'], 'unknown_model_cost')
        self.assertEqual(result['turns'][0]['costStatus'], 'unavailable')
        self.assertEqual(result['turns'][0]['costReason'], 'unknown_model_cost')

    def test_monitor_request_and_result_events_share_the_verified_request_turn(self):
        rows = [user('setup'), assistant('setup'), cost(.1), monitor('native-request'),
                assistant('proposal', stop='tool_use'), monitor('duplicate-request'),
                monitor('native-result', kind='result'), monitor('duplicate-result', kind='result'),
                assistant('receipt'), cost(.5), monitor('native-request-2', 'request-2'),
                assistant('response-2'), cost(.8)]
        result = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual([t['id'] for t in result['turns']], ['setup', 'native-request', 'native-request-2'])
        request = result['turns'][1]
        self.assertEqual(request['flowviewRequest'], {**OWNER, 'requestId': 'request-1'})
        self.assertEqual(request['assistantMessageCount'], 2)
        self.assertEqual(request['costUsd'], .4)
        self.assertEqual(result['turns'][2]['costUsd'], .3)
        self.assertEqual(request['userMessageAliases'], ['duplicate-request', 'native-result', 'duplicate-result'])
        self.assertEqual([e['event'] for e in request['flowviewEvents']], ['flowview_request', 'flowview_result'])

    def test_monitor_events_need_both_folder_identity_fields_and_a_valid_request_id(self):
        for owner in ({**OWNER, 'sessionId': 'another-folder'}, {**OWNER, 'connectionId': 'stale-connection'}):
            row = monitor('foreign', owner=owner)
            self.assertIsNone(capture.flowview_event(row, [OWNER]))
            self.assertEqual(capture.analyze(encoded(row, assistant()), SID, [OWNER])['turns'], [])
        self.assertIsNone(capture.flowview_event(monitor('wrong-id', event_id='different-id'), [OWNER]))
        self.assertIsNone(capture.flowview_event(monitor('no-verified-folder'), []))
        orphan = capture.analyze(encoded(monitor('orphan-result', kind='result'), assistant()), SID, [OWNER])
        self.assertEqual(orphan['turns'], [])

    def test_foreign_monitor_response_does_not_donate_tokens_or_cost_to_pilot_turn(self):
        result = capture.analyze(encoded(monitor('ours'), assistant('ours'),
                                         monitor('foreign', owner={**OWNER, 'sessionId': 'another-folder'}),
                                         assistant('foreign-response'), cost(.7)), SID, [OWNER])
        self.assertEqual(len(result['turns']), 1)
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 1)
        self.assertIsNone(result['turns'][0]['costUsd'])
        self.assertEqual(result['turns'][0]['costReason'], 'turn_cost_unattributable')
        self.assertEqual(result['reportedSessionCostUsd'], .7)

    def test_late_monitor_result_attaches_to_its_request_without_pricing_interleaved_work(self):
        rows = [monitor('first'), assistant('first-answer'), monitor('second', 'request-2'),
                assistant('second-answer'), monitor('late-result', kind='result'),
                assistant('first-receipt'), cost(.8)]
        result = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual([t['assistantMessageCount'] for t in result['turns']], [2, 1])
        self.assertTrue(all(t['costUsd'] is None for t in result['turns']))
        self.assertTrue(all(t['costReason'] == 'turn_cost_unattributable' for t in result['turns']))

    def test_monitor_jsonl_batch_processes_cancel_and_result_in_order(self):
        batch = monitor_batch('batch', monitor('cancel', kind='cancel', event_id='cancel-1'),
                              monitor('result', kind='result'))
        rows = [user('setup'), assistant('setup'), cost(.1), monitor('request'),
                assistant('proposal', stop='tool_use'), batch, assistant('receipt'), cost(.5)]
        result = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual([t['id'] for t in result['turns']], ['setup', 'request'])
        request = result['turns'][1]
        self.assertEqual([e['event'] for e in request['flowviewEvents']],
                         ['flowview_request', 'flowview_cancel', 'flowview_result'])
        self.assertEqual(request['userMessageAliases'], ['batch'])
        self.assertEqual(request['assistantMessageCount'], 2)
        self.assertEqual(request['costUsd'], .4)
        self.assertEqual(result['attributionIssues'], [])

    def test_multiple_requests_in_one_native_notification_have_distinct_turn_ids(self):
        batch = monitor_batch('batch', monitor('first'), monitor('second', 'request-2'))
        result = capture.analyze(encoded(batch, assistant()), SID, [OWNER])
        self.assertEqual(len(result['turns']), 2)
        self.assertEqual(len({t['id'] for t in result['turns']}), 2)
        self.assertEqual([t['assistantMessageCount'] for t in result['turns']], [0, 1])

    def test_malformed_or_unknown_monitor_line_detaches_tokens_and_scopes_uncertainty(self):
        for line in ('{"event":"flowview_result", broken', '{"event":"flowview_future"}',
                     '["flowview_result"]'):
            with self.subTest(line=line):
                batch = monitor_batch('bad-batch', monitor('result', kind='result'), line)
                rows = [user('settled'), assistant('settled'), cost(.1), monitor('request'),
                        assistant('proposal', stop='tool_use'), batch, assistant('ambiguous-response'),
                        cost(.5), user('next', 'prior'), assistant('next'), cost(.7)]
                result = capture.analyze(encoded(*rows), SID, [OWNER])
                self.assertEqual([t['assistantMessageCount'] for t in result['turns']], [1, 1, 1])
                self.assertEqual([t['costUsd'] for t in result['turns']], [.1, None, None])
                self.assertEqual([t['attributionStatus'] for t in result['turns']],
                                 ['observed', 'unavailable', 'unavailable'])
                self.assertEqual(len(result['attributionIssues']), 1)
                self.assertIsNone(result['turns'][1]['costSnapshotId'])

    def test_copied_workbench_request_and_monitor_result_share_one_turn(self):
        rows = [pasted('clipboard'), assistant('proposal', stop='tool_use'),
                monitor('result', kind='result'), assistant('receipt'), cost(.4)]
        result = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual([t['id'] for t in result['turns']], ['clipboard'])
        self.assertEqual(result['turns'][0]['flowviewRequest'], {**OWNER, 'requestId': 'request-1'})
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 2)
        self.assertEqual(result['turns'][0]['costUsd'], .4)
        self.assertEqual(result['turns'][0]['userMessageAliases'], ['result'])

    def test_reconnected_result_matches_request_only_across_verified_connections(self):
        renewed = {**OWNER, 'connectionId': 'connection-2'}
        rows = [pasted('clipboard'), assistant('proposal', stop='tool_use'),
                monitor('result', kind='result', owner=renewed), assistant('receipt'), cost(.4)]
        result = capture.analyze(encoded(*rows), SID, [OWNER, renewed])
        self.assertEqual(len(result['turns']), 1)
        self.assertEqual(result['turns'][0]['costUsd'], .4)
        self.assertEqual(result['turns'][0]['assistantMessageCount'], 2)
        foreign = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual(foreign['turns'][0]['assistantMessageCount'], 1)
        self.assertIsNone(foreign['turns'][0]['costUsd'])
        self.assertEqual(foreign['attributionIssues'][0]['reason'], 'unverified_monitor_identity')

    def test_unmatched_result_preserves_earlier_covered_turn_cost(self):
        rows = [user('settled'), assistant('settled'), cost(.1),
                monitor('orphan', 'missing-request', kind='result'), assistant('orphan-response'), cost(.4),
                user('next', 'prior'), assistant('next'), cost(.7)]
        result = capture.analyze(encoded(*rows), SID, [OWNER])
        self.assertEqual([t['costUsd'] for t in result['turns']], [.1, None])
        self.assertEqual([t['assistantMessageCount'] for t in result['turns']], [1, 1])
        self.assertEqual(result['turns'][0]['cumulativeCostUsd'], .1)
        self.assertEqual(result['reportedSessionCostUsd'], .7)

    def test_plan_command_is_local_when_native_output_proves_it_otherwise_owns_its_reply(self):
        command = {**user('plan', 'prior'), 'message': {'content': '<command-name>/plan</command-name>'}}
        output = {**user('plan-output', 'plan'), 'message': {'content': '<local-command-stdout>Plan mode enabled</local-command-stdout>'}}
        local = self.analyze(user(), assistant(), cost(.1), command, output)
        self.assertEqual([t['id'] for t in local['turns']], ['turn-1'])
        model_backed = self.analyze(user(), assistant(), cost(.1), command, assistant('planning'), cost(.4))
        self.assertEqual([t['id'] for t in model_backed['turns']], ['turn-1', 'plan'])
        self.assertEqual([t['costUsd'] for t in model_backed['turns']], [.1, .3])


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='flowview-pilot-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'diagram'; self.folder.mkdir()
        self.claude = self.root / 'claude'
        self.project = self.claude / 'projects' / '-example'; self.project.mkdir(parents=True)
        self.native = self.project / (SID + '.jsonl')
        self.native.write_bytes(encoded(user(), assistant()))

    def run_capture(self, session_id=SID, enable=True):
        return capture.capture(self.folder, session_id, enable=enable, claude_dir=self.claude)

    def usage(self):
        return json.loads((self.folder / capture.USAGE).read_text())

    def test_exact_raw_bytes_partial_lines_and_repeated_capture(self):
        raw = encoded(user(), assistant()).replace(b'\n', b'\r\n')
        self.native.write_bytes(raw + b'{"type":')
        self.run_capture()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), raw)
        self.assertEqual(self.usage()['sessions'][0]['pendingBytes'], 8)
        self.run_capture()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), raw)
        self.native.write_bytes(raw + encoded(cost(.4)))
        self.run_capture(enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())
        self.assertEqual(self.usage()['reportedTotalCostUsd'], .4)

    def test_multiple_participants_and_resumed_session_keep_all_raw_history(self):
        self.run_capture()
        other_raw = encoded({**user('engineer-turn'), 'sessionId': OTHER},
                            {**assistant('engineer-message'), 'sessionId': OTHER},
                            {**cost(.2), 'sessionId': OTHER})
        (self.project / (OTHER + '.jsonl')).write_bytes(other_raw)
        self.run_capture(OTHER)
        self.assertIsNone(self.usage()['reportedTotalCostUsd'])
        # Starting the engineer's next turn also recovers the PM session's exit cost.
        self.native.write_bytes(self.native.read_bytes() + encoded(cost(.4)))
        self.run_capture(OTHER, enable=False)
        self.run_capture(SID, enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes() + other_raw)
        self.assertEqual(len(self.usage()['sessions']), 2)
        self.assertEqual(self.usage()['reportedTotalCostUsd'], .6)

    def test_missing_identity_or_source_is_reported_without_guessing(self):
        self.assertEqual(self.run_capture(None)['status'], 'partial')
        self.assertEqual(self.usage()['sessions'], [])
        self.assertEqual(self.run_capture(OTHER)['status'], 'partial')
        self.assertEqual(self.run_capture()['status'], 'captured')
        self.native.unlink()
        result = self.run_capture()
        self.assertEqual(result['status'], 'partial')
        self.assertGreater(self.usage()['sessions'][0]['capturedBytes'], 0)

    def test_disabled_capture_is_a_noop(self):
        self.assertEqual(self.run_capture(enable=False)['status'], 'disabled')
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_existing_gitignore_rules_are_preserved_and_artifacts_are_ignored(self):
        (self.folder / '.gitignore').write_text('participant-notes.tmp\n')
        self.run_capture()
        self.run_capture()
        ignores = (self.folder / '.gitignore').read_text()
        self.assertTrue(ignores.startswith('participant-notes.tmp\n'))
        self.assertEqual(ignores.count('*.agent.transcript.jsonl'), 1)
        subprocess.run(['git', 'init', '-q', str(self.folder)], check=True, capture_output=True)
        result = subprocess.run(['git', 'check-ignore', capture.TRANSCRIPT, capture.USAGE, '.flowview-pilot/config.json'],
                                cwd=self.folder, capture_output=True, text=True, check=True)
        self.assertEqual(len(result.stdout.splitlines()), 3)

    def test_managed_ignore_block_stays_unique_after_later_participant_rules(self):
        self.run_capture()
        path = self.folder / '.gitignore'
        path.write_text(path.read_text() + '# Participant rule\n!story.agent.transcript.jsonl\n')
        self.run_capture()
        self.run_capture()
        self.assertEqual(path.read_text().count('# Local Flowview pilot capture'), 1)
        self.assertIn('# Participant rule\n!story.agent.transcript.jsonl', path.read_text())
        subprocess.run(['git', 'init', '-q', str(self.folder)], check=True, capture_output=True)
        result = subprocess.run(['git', 'check-ignore', capture.TRANSCRIPT], cwd=self.folder, capture_output=True)
        self.assertEqual(result.returncode, 0)

    def test_new_session_requires_its_own_pilot_authorization(self):
        self.run_capture()
        before = (self.folder / capture.TRANSCRIPT).read_bytes()
        with patch.object(capture, 'source_for') as lookup:
            result = self.run_capture(OTHER, enable=False)
        self.assertEqual(result['status'], 'consent_required')
        lookup.assert_not_called()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), before)

    def test_enrollment_starts_at_current_turn_with_exact_provenance(self):
        unrelated = encoded(user('earlier'), assistant('earlier-answer'), cost(.4))
        pilot = encoded(user('pilot-turn', 'earlier-answer'), assistant('pilot-answer'))
        self.native.write_bytes(unrelated + pilot)
        self.run_capture()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot)
        session = self.usage()['sessions'][0]
        self.assertEqual(session['captureStart']['nativeByteOffset'], len(unrelated))
        self.assertEqual(session['captureStart']['nativeLine'], 4)
        self.assertEqual(session['captureStart']['participantTurnId'], 'pilot-turn')
        self.assertEqual(session['captureStart']['scope'], 'pilot_turn_onward')
        self.assertEqual(len(session['turns']), 1)
        self.native.write_bytes(unrelated + pilot + encoded(cost(.7)))
        self.run_capture(enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot + encoded(cost(.7)))
        self.assertEqual(self.usage()['sessions'][0]['reportedSessionCostUsd'], .7)
        self.assertIsNone(self.usage()['sessions'][0]['turns'][0]['costUsd'])

    def test_enrollment_from_monitor_request_and_reconnection_preserve_verified_history(self):
        support = self.folder / '.flowview-agent'; support.mkdir()
        manifest = support / 'session.json'
        manifest.write_text(json.dumps({'protocol': 'flowview-folder-v1', 'workflow': 'embedded', **OWNER}))
        setup = encoded(user('setup'), assistant('setup-answer'), cost(.1))
        pilot = encoded(monitor('native-pilot'), assistant('pilot-proposal', stop='tool_use'))
        self.native.write_bytes(setup + pilot)
        first = self.run_capture()
        self.assertEqual(first['turnId'], 'native-pilot')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot)
        self.assertEqual(self.usage()['sessions'][0]['captureStart']['nativeByteOffset'], len(setup))
        self.assertEqual(first['nativeProgress']['capturedThroughLine'], (setup + pilot).count(b'\n'))
        self.assertEqual(first['nativeProgress']['lastAssistantLine'], (setup + pilot).count(b'\n'))
        self.assertEqual(self.usage()['sessions'][0]['turns'][0]['flowviewRequest']['requestId'], 'request-1')
        self.native.write_bytes(setup + pilot + encoded(monitor('accepted', kind='result'), assistant('receipt'), cost(.4)))
        self.run_capture(enable=False)
        renewed = {**OWNER, 'connectionId': 'connection-2'}
        manifest.write_text(json.dumps({'protocol': 'flowview-folder-v1', 'workflow': 'embedded', **renewed}))
        self.native.write_bytes(self.native.read_bytes() + encoded(monitor('next-pilot', 'request-2', owner=renewed), assistant('next-answer'), cost(.6)))
        self.run_capture(enable=False)
        session = self.usage()['sessions'][0]
        self.assertEqual([t['id'] for t in session['turns']], ['native-pilot', 'next-pilot'])
        self.assertEqual(session['verifiedMonitorIdentities'], [OWNER, renewed])
        self.assertEqual(session['turns'][1]['costUsd'], .2)

    def test_legacy_folder_manifest_verifies_monitor_delivery(self):
        (self.folder / 'session.json').write_text(json.dumps({'protocol': 'flowview-folder-v1', **OWNER}))
        self.native.write_bytes(encoded(monitor('legacy-request'), assistant()))
        self.assertEqual(self.run_capture()['turnId'], 'legacy-request')
        self.assertEqual(self.usage()['sessions'][0]['verifiedMonitorIdentities'], [OWNER])

    def test_pasted_pilot_enrollment_and_reconnected_batch_keep_raw_lines_exact(self):
        support = self.folder / '.flowview-agent'; support.mkdir()
        manifest = support / 'session.json'
        manifest.write_text(json.dumps({'protocol': 'flowview-folder-v1', **OWNER}))
        prefix = encoded(user('earlier'), assistant('earlier'), cost(.1))
        pilot = encoded(pasted('pilot-paste'), assistant('proposal', stop='tool_use'))
        self.native.write_bytes(prefix + pilot)
        self.assertEqual(self.run_capture()['turnId'], 'pilot-paste')
        renewed = {**OWNER, 'connectionId': 'connection-2'}
        manifest.write_text(json.dumps({'protocol': 'flowview-folder-v1', **renewed}))
        batch = monitor_batch('batch', monitor('cancel', kind='cancel', owner=renewed),
                              monitor('result', kind='result', owner=renewed))
        tail = encoded(batch, assistant('receipt'), cost(.4)).replace(b'\n', b'\r\n')
        self.native.write_bytes(prefix + pilot + tail)
        self.run_capture(enable=False)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), pilot + tail)
        session = self.usage()['sessions'][0]
        self.assertEqual(session['verifiedMonitorIdentities'], [OWNER, renewed])
        self.assertEqual([t['id'] for t in session['turns']], ['pilot-paste'])
        self.assertEqual(session['turns'][0]['assistantMessageCount'], 2)
        self.assertEqual(session['attributionIssues'], [])

    def test_unverified_monitor_enrollment_cannot_fall_back_to_earlier_unrelated_chat(self):
        self.native.write_bytes(encoded(user('earlier-chat'), assistant('earlier-answer'), monitor('new-unverified-request'), assistant('new-answer')))
        result = self.run_capture()
        self.assertEqual(result['status'], 'partial')
        self.assertIn('No current verified participant turn', result['errors'][0])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), b'')
        self.assertEqual(self.usage()['sessions'], [])

    def test_status_surfaces_previous_completed_turn_when_current_cost_is_pending(self):
        self.native.write_bytes(self.native.read_bytes() + encoded(cost(.4)))
        self.run_capture()
        self.native.write_bytes(self.native.read_bytes() + encoded(user('next', 'prior'), assistant('next-answer', stop='tool_use')))
        result = self.run_capture(enable=False)
        self.assertEqual(result['turnId'], 'next')
        self.assertEqual(result['turnCostStatus'], 'pending')
        self.assertEqual(result['previousCompletedTurn']['costUsd'], .4)

    def test_entry_checkpoint_waits_for_short_final_copy_lock_contention(self):
        self.run_capture()
        with capture.locked(self.folder / capture.PRIVATE):
            process = subprocess.Popen([sys.executable, str(SCRIPT), '--folder', str(self.folder)],
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                       env={**os.environ, 'CLAUDE_CODE_SESSION_ID': SID, 'CLAUDE_CONFIG_DIR': str(self.claude)})
            time.sleep(.2)
        output, error = process.communicate(timeout=3)
        self.assertEqual(process.returncode, 0, error)
        self.assertEqual(json.loads(output)['status'], 'captured')

    def test_rewrite_preserves_original_raw_capture_and_reports_error(self):
        self.run_capture()
        saved = (self.folder / capture.TRANSCRIPT).read_bytes()
        self.native.write_bytes(encoded(user('replaced')))
        result = self.run_capture()
        self.assertEqual(result['status'], 'partial')
        self.assertIn('rewritten', result['errors'][0])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), saved)

    def test_symlinks_and_unmanaged_artifacts_are_refused(self):
        original = self.root / 'private.txt'; original.write_text('unchanged')
        for name in ('.gitignore', capture.TRANSCRIPT, capture.USAGE):
            link = self.folder / name; link.symlink_to(original)
            with self.assertRaises(ValueError):
                self.run_capture()
            link.unlink()
            self.assertEqual(original.read_text(), 'unchanged')
        (self.folder / capture.TRANSCRIPT).write_text('prior pilot')
        with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
            self.run_capture()
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_text(), 'prior pilot')

    def test_invalid_json_is_retained_but_never_priced_as_a_complete_turn(self):
        raw = encoded(user(), assistant()) + b'not-json\n' + encoded(cost(.4))
        self.native.write_bytes(raw)
        self.assertEqual(self.run_capture()['status'], 'partial')
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), raw)
        self.assertIsNone(self.usage()['sessions'][0]['turns'][0]['costUsd'])

    def test_cli_discovers_environment_session_without_transcript_filename(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--folder', str(self.folder), '--enable'],
                                capture_output=True, text=True, timeout=10,
                                env={**os.environ, 'CLAUDE_CODE_SESSION_ID': SID, 'CLAUDE_CONFIG_DIR': str(self.claude)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'], 'captured')
        self.assertIn('pre-pilot history', json.loads(result.stdout)['reportedSessionCostScope'])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())

    def test_cli_after_turn_process_captures_reply_written_after_command_returns(self):
        self.native.write_bytes(encoded(user(), assistant(stop='tool_use')))
        result = subprocess.run([sys.executable, str(SCRIPT), '--folder', str(self.folder), '--enable', '--after-turn'],
                                capture_output=True, text=True, timeout=10,
                                env={**os.environ, 'CLAUDE_CODE_SESSION_ID': SID, 'CLAUDE_CONFIG_DIR': str(self.claude)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('scheduled', json.loads(result.stdout)['afterTurnCopy'])
        self.native.write_bytes(self.native.read_bytes() + encoded(assistant('final'), cost(.4)))
        status = self.folder / capture.PRIVATE / 'after-turn-status.json'
        deadline = time.monotonic() + 8
        while not status.exists() and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertTrue(status.exists(), 'Bounded process must persist final-copy status')
        self.assertTrue(json.loads(status.read_text())['result']['finalResponseCaptured'])
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())
        self.assertEqual(self.usage()['reportedTotalCostUsd'], .4)

    def test_transferred_folder_keeps_pm_archive_and_copies_engineer_after_delayed_cost(self):
        self.native.write_bytes(self.native.read_bytes() + encoded(cost(.4)))
        self.run_capture()
        pm_raw = self.native.read_bytes()
        transferred = self.root / 'transferred'; shutil.copytree(self.folder, transferred)
        remote_claude = self.root / 'engineer-claude'
        remote_project = remote_claude / 'projects' / '-engineer'; remote_project.mkdir(parents=True)
        remote_source = remote_project / (OTHER + '.jsonl')
        engineer_raw = encoded({**user('engineer'), 'sessionId': OTHER}, {**assistant('e1', stop='tool_use'), 'sessionId': OTHER})
        remote_source.write_bytes(engineer_raw)
        result = subprocess.run([sys.executable, str(SCRIPT), '--folder', str(transferred), '--enable', '--after-turn'],
                                capture_output=True, text=True, timeout=10,
                                env={**os.environ, 'CLAUDE_CODE_SESSION_ID': OTHER, 'CLAUDE_CONFIG_DIR': str(remote_claude)})
        result = json.loads(result.stdout)
        self.assertEqual(result['status'], 'partial')
        self.assertTrue(result['currentSourceAvailable'])
        self.assertIn('scheduled', result['afterTurnCopy'])
        engineer_raw += encoded({**assistant('e-final'), 'sessionId': OTHER})
        remote_source.write_bytes(engineer_raw)
        status = transferred / capture.PRIVATE / (OTHER + '.after-turn-status.json')
        time.sleep(2.3)
        self.assertFalse(status.exists(), 'A final reply alone must not stop the cost wait')
        engineer_raw += encoded({**cost(.2), 'sessionId': OTHER})
        remote_source.write_bytes(engineer_raw)
        deadline = time.monotonic() + 8
        while not status.exists() and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertTrue(status.exists())
        self.assertEqual(json.loads(status.read_text())['outcome'], 'captured')
        self.assertEqual((transferred / capture.TRANSCRIPT).read_bytes(), pm_raw + engineer_raw)
        usage = json.loads((transferred / capture.USAGE).read_text())
        self.assertEqual(usage['sessions'][0]['sourceStatus'], 'archived_only')
        self.assertEqual(usage['sessions'][0]['reportedSessionCostUsd'], .4)
        self.assertEqual(usage['sessions'][1]['reportedSessionCostUsd'], .2)
        self.assertIsNone(usage['reportedTotalCostUsd'])
        self.assertEqual(usage['knownReportedCostUsd'], .6)

    def test_bounded_after_turn_copy_catches_final_response_and_stops(self):
        self.run_capture()
        before = {'turnId': 'turn-1', 'finalResponseCaptured': False, 'currentSourceAvailable': True,
                  'nativeProgress': native_progress(final=False)}
        after = {**before, 'finalResponseCaptured': True, 'nativeProgress': native_progress()}
        priced = {**after, 'turnSnapshotId': 'snapshot', 'turnCostStatus': 'reported',
                  'nativeProgress': native_progress(snapshot='snapshot')}
        with patch.object(capture, 'capture', side_effect=[before, after, priced]) as collect, \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', return_value=0):
            capture.settle(self.folder, SID, 'turn-1', after_line=10)
        self.assertEqual(collect.call_count, 3)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertTrue(status['result']['finalResponseCaptured'])
        self.assertEqual(status['outcome'], 'captured')
        with patch.object(capture, 'capture', return_value=after) as collect, \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', side_effect=[0, 0, 46]):
            capture.settle(self.folder, SID, 'turn-1', after_line=10)
        self.assertEqual(collect.call_count, 1)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'timeout_cost_pending')

    def test_cancel_only_after_covered_request_waits_for_cancellation_reply_and_cost(self):
        (self.folder / 'session.json').write_text(json.dumps({'protocol': 'flowview-folder-v1', **OWNER}))
        self.native.write_bytes(encoded(pasted('request'), assistant('proposal'), cost(.4)))
        covered = self.run_capture()
        self.assertTrue(covered['finalResponseCaptured'])
        self.assertEqual(covered['turnCostUsd'], .4)
        self.native.write_bytes(self.native.read_bytes() + encoded(monitor('cancel', kind='cancel')))
        canceled = self.run_capture(enable=False)
        self.assertEqual(canceled['turnId'], 'request')
        self.assertFalse(canceled['finalResponseCaptured'])
        self.assertIsNone(canceled['turnSnapshotId'])
        self.assertIsNone(self.usage()['sessions'][0]['turns'][0]['lastAssistantLine'])
        original = capture.capture
        checkpoints = []

        def checkpoint(*args, **kwargs):
            if len(checkpoints) == 1:
                self.native.write_bytes(self.native.read_bytes() + encoded(assistant('cancellation-reply')))
            elif len(checkpoints) == 2:
                self.native.write_bytes(self.native.read_bytes() + encoded(cost(.5)))
            result = original(*args, claude_dir=self.claude, **kwargs)
            checkpoints.append(result)
            return result

        with patch.object(capture, 'capture', side_effect=checkpoint), \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', return_value=0):
            capture.settle(self.folder, SID, 'request', after_line=canceled['nativeProgress']['capturedThroughLine'])
        self.assertEqual(len(checkpoints), 3)
        self.assertFalse(checkpoints[0]['finalResponseCaptured'])
        self.assertTrue(checkpoints[1]['finalResponseCaptured'])
        self.assertIsNone(checkpoints[1]['turnSnapshotId'])
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'captured')
        self.assertEqual(status['result']['turnCostUsd'], .5)
        self.assertEqual(self.usage()['sessions'][0]['turns'][0]['assistantMessageCount'], 2)
        self.assertEqual((self.folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())
        self.native.write_bytes(self.native.read_bytes() + encoded(monitor('duplicate-cancel', kind='cancel')))
        self.assertTrue(self.run_capture(enable=False)['finalResponseCaptured'])

    def test_cli_schedules_active_older_request_after_late_result(self):
        (self.folder / 'session.json').write_text(json.dumps({'protocol': 'flowview-folder-v1', **OWNER}))
        self.native.write_bytes(encoded(monitor('older-request'), assistant('older-response'), cost(.2)))
        self.run_capture()
        self.native.write_bytes(self.native.read_bytes() + encoded(monitor('newer-request', 'request-2'),
                                assistant('newer-response'), cost(.4), monitor('late-result', kind='result')))
        active = self.run_capture(enable=False)
        self.assertEqual(active['turnId'], 'older-request')
        self.assertFalse(active['finalResponseCaptured'])
        self.assertEqual(active['previousCompletedTurn']['id'], 'newer-request')
        with patch.object(sys, 'argv', [str(SCRIPT), '--folder', str(self.folder), '--after-turn']), \
                patch.dict(os.environ, {'CLAUDE_CODE_SESSION_ID': SID, 'CLAUDE_CONFIG_DIR': str(self.claude)}), \
                patch.object(capture.subprocess, 'Popen') as launch, patch('builtins.print'):
            self.assertEqual(capture.main(), 0)
        self.assertEqual(launch.call_args.args[0][-4:], ['--settle-turn', 'older-request', '--settle-after-line',
                                                      str(active['nativeProgress']['capturedThroughLine'])])

    def test_unmatched_or_unverified_event_cannot_finish_copy_using_old_response_and_cost(self):
        cases = [('unmatched-cancel', monitor('orphan', 'missing-request', kind='cancel')),
                 ('unmatched-result', monitor('orphan', 'missing-request', kind='result')),
                 ('foreign-result', monitor('foreign', kind='result', owner={**OWNER, 'sessionId': 'other-folder'}))]
        for label, event in cases:
            with self.subTest(label=label):
                folder = self.folder / label
                folder.mkdir()
                (folder / 'session.json').write_text(json.dumps({'protocol': 'flowview-folder-v1', **OWNER}))
                self.native.write_bytes(encoded(pasted('covered-request'), assistant('covered-response'), cost(.4)))
                capture.capture(folder, SID, enable=True, claude_dir=self.claude)
                self.native.write_bytes(self.native.read_bytes() + encoded(event))
                # Exercise the real scheduling path: this checkpoint still has
                # the old completed turn and cost, but the boundary follows it.
                with patch.object(sys, 'argv', [str(SCRIPT), '--folder', str(folder), '--after-turn']), \
                        patch.dict(os.environ, {'CLAUDE_CODE_SESSION_ID': SID, 'CLAUDE_CONFIG_DIR': str(self.claude)}), \
                        patch.object(capture.subprocess, 'Popen') as launch, patch('builtins.print'):
                    self.assertEqual(capture.main(), 0)
                args = launch.call_args.args[0]
                turn_id = args[args.index('--settle-turn') + 1]
                after_line = int(args[args.index('--settle-after-line') + 1])
                self.assertEqual(after_line, 4)
                checkpoints = []
                original = capture.capture

                def checkpoint(*args, **kwargs):
                    tails = [cost(.4), assistant('reply-tools', stop='tool_use'),
                             assistant('late-reply'), cost(.5)]
                    self.native.write_bytes(self.native.read_bytes() + encoded(tails[len(checkpoints)]))
                    result = original(*args, claude_dir=self.claude, **kwargs)
                    checkpoints.append(result)
                    return result

                with patch.object(capture, 'capture', side_effect=checkpoint), \
                        patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', return_value=0):
                    capture.settle(folder, SID, turn_id, after_line=after_line)
                self.assertEqual(len(checkpoints), 4)
                self.assertTrue(all(c['turnCostStatus'] == 'reported' for c in checkpoints))
                saved = json.loads((folder / capture.PRIVATE / 'after-turn-status.json').read_text())
                self.assertEqual(saved['outcome'], 'turn_cost_unattributable')
                self.assertEqual(saved['replyCapture']['afterNativeLine'], 4)
                self.assertEqual(saved['replyCapture']['nativeAssistantLine'], 7)
                self.assertEqual(saved['replyCapture']['costSnapshotNativeLine'], 8)
                self.assertTrue(saved['replyCapture']['finalResponseCaptured'])
                self.assertIsNone(saved['replyCapture']['participantTurnId'])
                self.assertIsNone(saved['replyCapture']['costUsd'])
                self.assertEqual(saved['replyCapture']['costStatus'], 'unavailable')
                self.assertEqual(saved['result']['turnCostUsd'], .4)
                self.assertEqual(saved['result']['reportedSessionCostUsd'], .5)
                self.assertEqual((folder / capture.TRANSCRIPT).read_bytes(), self.native.read_bytes())

    def test_old_completion_markers_timeout_without_a_new_native_response(self):
        self.run_capture()
        old = {'turnId': 'turn-1', 'finalResponseCaptured': True, 'currentSourceAvailable': True,
               'turnCostStatus': 'reported', 'turnSnapshotId': 'old-snapshot',
               'nativeProgress': {**native_progress(snapshot='old-snapshot'), 'lastAssistantLine': 9, 'costSnapshotLine': 10}}
        with patch.object(capture, 'capture', return_value=old), \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', side_effect=[0, 0, 46]):
            capture.settle(self.folder, SID, 'turn-1', after_line=10)
        saved = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(saved['outcome'], 'timeout_response_pending')
        self.assertFalse(saved['replyCapture']['finalResponseCaptured'])

    def test_after_turn_unknown_model_is_explicitly_unavailable(self):
        self.run_capture()
        unknown = {'turnId': 'turn-1', 'finalResponseCaptured': True, 'currentSourceAvailable': True,
                   'turnSnapshotId': 'snapshot', 'turnCostStatus': 'unavailable', 'turnCostReason': 'unknown_model_cost',
                   'nativeProgress': native_progress(snapshot='snapshot')}
        with patch.object(capture, 'capture', return_value=unknown), \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', return_value=0):
            capture.settle(self.folder, SID, 'turn-1', after_line=10)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'cost_unavailable')

    def test_after_turn_names_unattributable_dollars_instead_of_pending_snapshot(self):
        self.run_capture()
        unavailable = {'turnId': 'turn-1', 'finalResponseCaptured': True, 'currentSourceAvailable': True,
                       'turnSnapshotId': 'snapshot', 'turnCostStatus': 'unavailable', 'turnCostReason': 'turn_cost_unattributable',
                       'nativeProgress': native_progress(snapshot='snapshot')}
        with patch.object(capture, 'capture', return_value=unavailable), \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', return_value=0):
            capture.settle(self.folder, SID, 'turn-1', after_line=10)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'turn_cost_unattributable')

    def test_after_turn_waits_for_late_native_cost_after_unmatched_result(self):
        support = self.folder / '.flowview-agent'
        support.mkdir()
        (support / 'session.json').write_text(json.dumps({'protocol': 'flowview-folder-v1', **OWNER}))
        self.run_capture()
        self.native.write_bytes(self.native.read_bytes() + encoded(
            monitor('orphan', 'missing-request', kind='result'), assistant('orphan-response')))
        pending = self.run_capture(enable=False)
        self.assertEqual(pending['turnCostStatus'], 'unavailable')
        self.assertIsNone(pending['turnSnapshotId'])
        original = capture.capture
        calls = []

        def checkpoint(*args, **kwargs):
            calls.append(True)
            if len(calls) == 2:
                self.native.write_bytes(self.native.read_bytes() + encoded(cost(.4)))
            return original(*args, claude_dir=self.claude, **kwargs)

        with patch.object(capture, 'capture', side_effect=checkpoint), \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', return_value=0):
            capture.settle(self.folder, SID, 'turn-1', after_line=pending['nativeProgress']['lastAssistantLine'] - 1)
        self.assertEqual(len(calls), 2)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'turn_cost_unattributable')
        self.assertEqual(status['result']['reportedSessionCostUsd'], .4)
        self.assertEqual(self.usage()['sessions'][0]['turns'][0]['assistantMessageCount'], 1)
        self.assertTrue((self.folder / capture.TRANSCRIPT).read_bytes().endswith(encoded(cost(.4))))

    def test_unattributable_turn_without_snapshot_times_out_explicitly(self):
        self.run_capture()
        pending = {'turnId': 'turn-1', 'finalResponseCaptured': True, 'currentSourceAvailable': True,
                   'turnCostStatus': 'unavailable', 'turnCostReason': 'turn_cost_unattributable',
                   'nativeProgress': native_progress()}
        with patch.object(capture, 'capture', return_value=pending), \
                patch.object(capture.time, 'sleep'), patch.object(capture.time, 'monotonic', side_effect=[0, 0, 46]):
            capture.settle(self.folder, SID, 'turn-1', after_line=10)
        status = json.loads((self.folder / capture.PRIVATE / 'after-turn-status.json').read_text())
        self.assertEqual(status['outcome'], 'timeout_cost_pending')


if __name__ == '__main__':
    unittest.main()
