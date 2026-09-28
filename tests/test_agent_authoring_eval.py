"""Author-runner contracts. No test invokes Claude, browser, or an account."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('agent_authoring_eval', ROOT / 'tools/agent-authoring-eval.py')
eval = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(eval)
SID = '12345678-1234-4234-8234-123456789abc'
OWNER = {'sessionId': 'folder-session', 'connectionId': 'folder-connection'}


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


def response(**changes):
    value = {'is_error': False, 'permission_denials': [], 'modelUsage': {eval.MODEL: {}},
             'session_id': SID, 'total_cost_usd': 1.25, 'num_turns': 8}
    value.update(changes)
    return value


def process(raw=None, **changes):
    value = {'stdout': json.dumps(response() if raw is None else raw), 'stderr': '', 'exit': 0, 'timedOut': False}
    value.update(changes)
    return value


def immediate(callback, deadline, description):
    value = callback()
    if value is None:
        raise TimeoutError(description)
    return value


class AuthorEvalTests(unittest.TestCase):
    def setUp(self):
        self.run = self.enterContext(mock.patch.object(eval.subprocess, 'run', side_effect=AssertionError('Unexpected process')))
        self.popen = self.enterContext(mock.patch.object(eval.subprocess, 'Popen', side_effect=AssertionError('Unexpected model process')))
        self.kill = self.enterContext(mock.patch.object(eval.os, 'killpg'))
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))
        self.enterContext(contextlib.redirect_stderr(io.StringIO()))

    def bundle(self):
        bundle = self.root / 'bundle'
        content = {**{'input/' + name: ('Evidence: ' + name).encode() for name in eval.INPUTS},
                   'operator/answers-business.md': b'Business operator exact answer.\n',
                   'operator/answers-engineer.md': b'Engineering operator exact answer.\n'}
        rows = []
        for name, data in content.items():
            path = bundle / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            rows.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        put(bundle / 'manifest.json', {'files': rows})
        (bundle / 'judge-only').mkdir()
        (bundle / 'judge-only/secret.md').write_text('PRIVATE_JUDGING_ORACLE')
        return bundle, content

    def session(self):
        output = self.root / 'output'
        run = output / 'run-01'
        session = run / 'agent-project/flowview-session-1234'
        session.mkdir(parents=True)
        put(session / 'session.json', {'protocol': 'flowview-folder-v1', **OWNER})
        put(run / 'session-path.json', {'runId': 'run-01', 'status': 'ready',
            'projectPath': str(session.parent), 'sessionPath': str(session), 'readyAt': int(time.time() * 1000)})
        return output, run, session

    def capture_files(self, run, session):
        source = b'{"page":{"title":"Accepted source"}}'
        put(session / 'request.json', {'id': 'request-2', **OWNER})
        put(session / 'reply.json', {'id': 'reply-2', 'requestId': 'request-2', 'text': 'COMPLETE: Story accepted.', **OWNER})
        put(session / 'progress.json', {'requestId': 'request-2', 'text': 'Working', **OWNER})
        put(run / 'capture.json', {'requestId': 'request-2', 'replyId': 'reply-2', 'revision': 'new-revision',
            'sourceSha256': eval.sha(source), 'sendEnabled': True, 'sourceMatchesState': True, 'captureErrors': []})
        put(run / 'state.json', {'revision': 'new-revision', 'source': source.decode(), **OWNER})
        put(run / 'changes.json', {'sessionId': OWNER['sessionId'], 'changes': [
            {'requestId': 'request-2', 'id': 'proposal-2', 'status': 'applied', 'revision': 'new-revision'}]})
        put(session / 'proposal.json', {'id': 'proposal-2', 'requestId': 'request-2', 'source': source.decode(), **OWNER})
        put(run / 'result.json', {'id': 'proposal-2', 'status': 'applied', **OWNER})
        (run / 'final.spec.json').write_bytes(source)
        return source

    def test_preview_is_six_cases_and_never_calls_any_process(self):
        bundle, _ = self.bundle()
        output = self.root / 'preview'
        self.assertEqual(eval.main(['--bundle', str(bundle), '--output', str(output)]), 0)
        manifest = json.loads((output / 'evaluation/manifest.json').read_text())
        self.assertEqual([c['audience'] for c in manifest['cases']], ['business'] * 3 + ['engineering'] * 3)
        self.assertFalse(manifest['runClaude'])
        self.assertEqual(manifest['phaseTimeoutSeconds'], 1800)
        self.assertEqual(manifest['overallTimeoutSeconds'], 2700)
        self.run.assert_not_called()
        self.popen.assert_not_called()
        with self.assertRaises(SystemExit):
            eval.main(['--bundle', str(bundle), '--output', str(output)])

    def test_bundle_checks_exact_hashes_without_reading_judge_files(self):
        bundle, content = self.bundle()
        loaded, digest = eval.load_bundle(bundle)
        self.assertEqual(loaded, content)
        self.assertEqual(len(digest), 64)
        self.assertNotIn('PRIVATE_JUDGING_ORACLE', repr(loaded))
        (bundle / 'input/hld.md').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            eval.load_bundle(bundle)

    def test_default_bundle_is_the_tracked_reproducible_fixture(self):
        self.assertEqual(eval.DEFAULT_BUNDLE, ROOT / 'tests/fixtures/authoring-evaluation/overnight')
        content, digest = eval.load_bundle(eval.DEFAULT_BUNDLE)
        self.assertEqual(set(content), {'input/' + name for name in eval.INPUTS} |
                         {'operator/answers-business.md', 'operator/answers-engineer.md'})
        self.assertEqual(len(digest), 64)

    def test_bundle_rejects_escaped_symlink_input(self):
        bundle, _ = self.bundle()
        (bundle / 'input/hld.md').unlink()
        elsewhere = self.root / 'outside.md'
        elsewhere.write_text('unrelated')
        (bundle / 'input/hld.md').symlink_to(elsewhere)
        with self.assertRaisesRegex(ValueError, 'escapes'):
            eval.load_bundle(bundle)

    def test_prompt_oracles_and_first_turn_do_not_infer_audience_from_ui_default(self):
        initial = eval.initial_request()
        self.assertIn('UNSETTLED', initial)
        self.assertIn('provisional UI default', initial)
        self.assertIn('without proposing changes', initial)
        for phase in (1, 2):
            text = eval.author_prompt(OWNER, 'request-1', phase)
            self.assertIn('manually read authoring/', text)
            self.assertIn('No claimed browser verification', text)
            self.assertIn('reply --request request-1', text)
            for hidden in ['judge-only', 'baseline-only', '96/100', 'PRIVATE_JUDGING_ORACLE']:
                self.assertNotIn(hidden, text)
        self.assertIn('NEEDS_CLARIFICATION:', eval.author_prompt(OWNER, 'request-2', 2))

    def test_cli_has_exact_model_scoped_tools_and_resume_without_bypass(self):
        command = eval.claude_command(SID)
        for flag in ['--safe-mode', '--restricted', '--no-chrome', '--strict-mcp-config']:
            self.assertIn(flag, command)
        self.assertEqual(command[command.index('--model') + 1], eval.MODEL)
        self.assertEqual(command[command.index('--resume') + 1], SID)
        self.assertEqual(command[command.index('--permission-prompts') + 1], 'none')
        self.assertEqual(json.loads(command[command.index('--mcp-config') + 1]), {'mcpServers': {}})
        allowed = command[command.index('--allowedTools') + 1:command.index('--permission-prompts')]
        self.assertNotIn('Bash', allowed)
        self.assertNotIn('Write(./**)', allowed)
        self.assertIn('Write(./story.ledger.md)', allowed)
        self.assertNotIn('Write(./operations.json)', allowed)
        for phase in (1, 2):
            prompt = eval.author_prompt(OWNER, 'request-1', phase)
            self.assertIn('--file candidate.spec.json', prompt)
            self.assertNotIn('--operations', prompt)
            self.assertNotIn('agent-operations.md', prompt)
        self.assertIn('Bash(python3 folder-agent.py propose *)', allowed)
        self.assertIn('Bash(python3 author-tools.py walk *)', allowed)
        self.assertIn('Bash(python3 author-tools.py stamp)', allowed)
        self.assertNotIn('Write(./author-tools.py)', allowed)
        self.assertFalse(any('Bash(' in item and 'authoring/' in item for item in allowed))
        for prohibited in ['--dangerously-skip-permissions', '--permission-mode', '--fallback-model', '--chrome', '--no-session-persistence']:
            self.assertNotIn(prohibited, command)
        self.assertNotIn('Monitor', command[command.index('--tools') + 1])

    def test_ready_session_requires_own_run_and_valid_identity(self):
        output, run, session = self.session()
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            self.assertEqual(eval.ready_session(output, eval.cases()[0], time.monotonic() + 10), (session.resolve(), OWNER))
            data = json.loads((run / 'session-path.json').read_text())
            data['sessionPath'] = str(self.root)
            put(run / 'session-path.json', data)
            with self.assertRaisesRegex(ValueError, 'own run'):
                eval.ready_session(output, eval.cases()[0], time.monotonic() + 10)

    def test_preparation_uses_only_production_helper_and_three_input_files(self):
        _, _, session = self.session()
        _, content = self.bundle()
        artifacts = self.root / 'artifacts'
        artifacts.mkdir()
        (session / 'folder-agent.py').write_bytes((ROOT / 'tools/folder-agent.py').read_bytes())
        for name in ['authoring-kit.json', 'CONNECT.md', 'README.md']:
            (session / name).write_text('{}')
        def prepare(command, **kwargs):
            self.assertEqual(command[-1], 'prepare')
            self.assertEqual(kwargs['cwd'], session)
            (session / 'authoring').mkdir()
            (session / 'authoring/skill.md').write_text('Trusted skill')
            return subprocess.CompletedProcess(command, 0, 'prepared', '')
        self.run.side_effect = prepare
        hashes = eval.prepare_session(session, content, artifacts, time.monotonic() + 20)
        self.assertEqual(sorted(p.name for p in (session / 'input').iterdir()), sorted(eval.INPUTS))
        self.assertFalse((session / 'operator').exists())
        self.assertIn('authoring/skill.md', hashes)
        self.assertEqual((session / 'author-tools.py').read_text(), eval.AUTHOR_TOOLS)
        self.assertEqual(hashes['author-tools.py'], eval.sha(eval.AUTHOR_TOOLS.encode()))
        (session / 'authoring/skill.md').write_text('tampered')
        self.assertNotEqual(hashes, eval.tree_hashes(session))

    def wrapper(self):
        session = self.root.resolve() / 'wrapper-session'
        session.mkdir()
        for name in ['candidate.spec.json', 'story.spec.json', 'input/catalog.json',
                     'authoring/tools/validate.js', 'authoring/tools/compatibility.js',
                     'authoring/tools/widget_doc.py',
                     'authoring/.claude/skills/hld-to-page/scripts/spec_walk.py']:
            path = session / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}')
        script = session / 'author-tools.py'
        script.write_text(eval.AUTHOR_TOOLS)
        namespace = {'__name__': 'bounded_author_tools_test', '__file__': str(script)}
        exec(compile(eval.AUTHOR_TOOLS, str(script), 'exec'), namespace)
        def invoke(*args):
            stdout, stderr = mock.Mock(), mock.Mock()
            stdout.buffer, stderr.buffer = io.BytesIO(), io.BytesIO()
            with mock.patch.object(eval.sys, 'argv', [str(script), *args]), \
                    mock.patch.object(eval.sys, 'stdout', stdout), mock.patch.object(eval.sys, 'stderr', stderr):
                result = namespace['main']()
            return result, stdout.buffer.getvalue(), stderr.buffer.getvalue()
        return session, invoke

    def test_wrapper_rejects_external_paths_extra_options_and_malformed_checks_before_process(self):
        _, invoke = self.wrapper()
        for args in [('validate', '/tmp/outside.spec.json'), ('walk', '../outside.spec.json'),
                     ('walk', 'candidate.spec.json', '--catalog', '../catalog.json'),
                     ('walk', 'candidate.spec.json', '--viz', '/outside/checkout'),
                     ('stamp', '/tmp/outside.spec.json'), ('stamp', '--output', '../outside.json'),
                     ('widget', '../private'), ('widget', '--list', 'battery'),
                     ('walk', 'candidate.spec.json', '--rate', 'batt=0:1;cat /outside'),
                     ('walk', 'candidate.spec.json', '--expect', 'outage/step:phone.value=x\nsecret')]:
            with self.subTest(args=args), self.assertRaises((SystemExit, ValueError)):
                invoke(*args)
        self.run.assert_not_called()

    def test_wrapper_preserves_walk_checks_with_fixed_catalog_viz_and_no_shell(self):
        session, invoke = self.wrapper()
        self.run.side_effect = None
        self.run.return_value = subprocess.CompletedProcess([], 0, b'Folded states', b'One diagnostic')
        expectation = 'offline/morning:phone.notice=Unread; $(cat /outside)'
        self.assertEqual(invoke('walk', 'candidate.spec.json', '--catalog', 'input/catalog.json',
                                '--state', '--rate', 'batt=-1:4', '--expect', expectation),
                         (0, b'Folded states', b'One diagnostic'))
        command = self.run.call_args.args[0]
        self.assertEqual(command, [eval.sys.executable,
            str(session / 'authoring/.claude/skills/hld-to-page/scripts/spec_walk.py'),
            str(session / 'candidate.spec.json'), '--viz', str(session / 'authoring'),
            '--catalog', str(session / 'input/catalog.json'), '--state', '--rate', 'batt=-1:4',
            '--expect', expectation])
        self.assertNotIn('shell', self.run.call_args.kwargs)
        self.assertEqual(self.run.call_args.kwargs['cwd'], session)
        self.assertEqual(self.run.call_args.kwargs['timeout'], 120)

    def test_wrapper_stamp_writes_only_fixed_output_and_allows_followup_validation(self):
        session, invoke = self.wrapper()
        stamped = b'{"formatVersion":1,"page":{"title":"Stamped"}}\n'
        self.run.side_effect = None
        self.run.return_value = subprocess.CompletedProcess([], 0, stamped, b'')
        self.assertEqual(invoke('stamp')[0], 0)
        self.assertEqual(self.run.call_args.args[0], ['node', str(session / 'authoring/tools/compatibility.js'),
                                                   '--stamp', str(session / 'candidate.spec.json')])
        self.assertEqual((session / 'stamped.spec.json').read_bytes(), stamped)
        invoke('validate', 'stamped.spec.json')
        self.assertEqual(self.run.call_args.args[0], ['node', str(session / 'authoring/tools/validate.js'),
                                                   str(session / 'stamped.spec.json')])
        self.run.return_value = subprocess.CompletedProcess([], 1, b'invalid', b'Invalid candidate')
        self.assertEqual(invoke('stamp')[0], 1)
        self.assertEqual((session / 'stamped.spec.json').read_bytes(), stamped)

    def test_wrapper_refuses_symlinks_in_spec_output_and_tool_ancestors(self):
        session, invoke = self.wrapper()
        outside = self.root / 'outside.json'
        outside.write_text('{"private":"canary"}')
        candidate = session / 'candidate.spec.json'
        candidate.unlink()
        candidate.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            invoke('validate', 'candidate.spec.json')
        candidate.unlink()
        candidate.write_text('{}')
        (session / 'stamped.spec.json').symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            invoke('stamp')
        tools = session / 'authoring/tools'
        tools.rename(session / 'original-tools')
        tools.symlink_to(session / 'original-tools', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            invoke('widget', 'battery')
        self.run.assert_not_called()
        self.assertEqual(outside.read_text(), '{"private":"canary"}')

    def test_wrapper_widget_queries_are_bounded_plain_types_or_list(self):
        session, invoke = self.wrapper()
        self.run.side_effect = None
        self.run.return_value = subprocess.CompletedProcess([], 0, b'documentation', b'')
        for args in [('battery', 'device-app'), ('--list',)]:
            self.assertEqual(invoke('widget', *args), (0, b'documentation', b''))
            self.assertEqual(self.run.call_args.args[0],
                             [eval.sys.executable, str(session / 'authoring/tools/widget_doc.py'), *args])

    def test_wrapper_status_reads_only_fixed_identity_and_heartbeat_without_bash_clock(self):
        session, invoke = self.wrapper()
        put(session / 'session.json', OWNER)
        put(session / 'editor.json', {**OWNER, 'connected': True, 'at': 99000})
        with mock.patch.object(eval.time, 'time', return_value=100), mock.patch('builtins.print') as output:
            self.assertEqual(invoke('status')[0], 0)
        status = json.loads(output.call_args.args[0])
        self.assertTrue(status['fresh'])
        self.assertEqual(status['ageMs'], 1000)
        self.assertEqual(status['currentEpochMs'], 100000)
        with self.assertRaises(SystemExit):
            invoke('status', '/outside/editor.json')
        self.run.assert_not_called()

    def test_large_wrapper_output_stays_in_fixed_local_report_with_symlink_protection(self):
        session, invoke = self.wrapper()
        self.run.side_effect = None
        self.run.return_value = subprocess.CompletedProcess([], 0, b'X' * 9000, b'diagnostic')
        with mock.patch('builtins.print') as output:
            self.assertEqual(invoke('widget', '--list'), (0, b'', b''))
        report = json.loads(output.call_args.args[0])
        self.assertEqual(report['written'], 'widget-report.txt')
        self.assertEqual(report['sha256'], eval.sha((session / 'widget-report.txt').read_bytes()))
        (session / 'widget-report.txt').unlink()
        outside = self.root / 'outside-report'
        outside.write_text('untouched')
        (session / 'widget-report.txt').symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            invoke('widget', '--list')
        self.assertEqual(outside.read_text(), 'untouched')

    def test_send_requires_matching_sequence_text_level_and_owner(self):
        output, run, session = self.session()
        request = {'id': 'request-1', 'text': 'Visible request', 'technicalLevel': 'story', **OWNER}
        put(session / 'request.json', request)
        receipt = {'seq': 1, 'status': 'sent', 'requestId': 'request-1', 'revision': 'revision-1'}
        put(run / 'control-result.json', receipt)
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            got = eval.send_request(run, session, OWNER, 1, request['text'], 'story', time.monotonic() + 10)
            self.assertEqual(got, receipt)
            self.assertEqual(json.loads((run / 'control.json').read_text()), {'seq': 1, 'text': 'Visible request', 'technicalLevel': 'story'})
            with self.assertRaises(TimeoutError):
                eval.send_request(run, session, OWNER, 2, request['text'], 'engineering', time.monotonic() + 10)
            put(session / 'session.json', {**OWNER, 'connectionId': 'another-owner'})
            with self.assertRaisesRegex(ValueError, 'ownership'):
                eval.send_request(run, session, OWNER, 3, request['text'], 'story', time.monotonic() + 10)

    def test_capture_uses_ui_source_and_matching_reply_receipt_not_candidate_file(self):
        _, run, session = self.session()
        source = self.capture_files(run, session)
        (session / 'candidate.spec.json').write_text('UNACCEPTED_CANDIDATE')
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            result = eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)
            self.assertEqual(result['source'], source)
            self.assertEqual(result['receipts'][0]['status'], 'applied')
            (run / 'final.spec.json').write_text('Different source')
            with self.assertRaises(TimeoutError):
                eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)

    def test_capture_rejects_stale_reply_and_unacknowledged_proposal(self):
        _, run, session = self.session()
        self.capture_files(run, session)
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            put(run / 'result.json', {'id': 'wrong-proposal', **OWNER})
            with self.assertRaises(TimeoutError):
                eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)
            put(run / 'result.json', {'id': 'proposal-2', **OWNER})
            put(session / 'reply.json', {'id': 'reply-2', 'requestId': 'earlier-request', 'text': 'COMPLETE: Old story', **OWNER})
            with self.assertRaises(TimeoutError):
                eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)

    def test_question_only_capture_accepts_absent_history_but_never_malformed_or_lost_history(self):
        _, run, session = self.session()
        source = self.capture_files(run, session)
        for path in [session / 'proposal.json', run / 'changes.json', run / 'result.json']:
            path.unlink()
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            captured = eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)
            self.assertEqual(captured['source'], source)
            self.assertEqual(captured['receipts'], [])
            self.assertTrue(captured['changesFileAbsent'])
            self.assertIsNone(captured['proposal'])
            self.assertFalse((run / 'changes.json').exists())
            (run / 'changes.json').write_text('not json')
            with self.assertRaises(ValueError):
                eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)
            (run / 'changes.json').unlink()
            put(run / 'exchange-history/000001-result.json', {'status': 'applied'})
            with self.assertRaisesRegex(ValueError, 'archived proposal'):
                eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)

    def test_capture_needs_clean_browser_snapshot_even_with_matching_hash(self):
        _, run, session = self.session()
        self.capture_files(run, session)
        capture = json.loads((run / 'capture.json').read_text())
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            for patch in [{'captureErrors': ['state write failed']}, {'sourceMatchesState': False}, {'sendEnabled': False}]:
                put(run / 'capture.json', {**capture, **patch})
                with self.assertRaises(TimeoutError):
                    eval.accepted_capture(run, session, OWNER, 'request-2', time.monotonic() + 10)

    def test_model_metadata_rejects_errors_denials_wrong_models_and_changed_sessions(self):
        bad = [{'is_error': True}, {'is_error': 'false'}, {'permission_denials': 'denied'},
               {'permission_denials': [{}]}, {'modelUsage': {'other-model': {}}},
               {'session_id': 'not-a-session'}, {'total_cost_usd': '1.00'}, {'total_cost_usd': float('nan')}]
        for fields in bad:
            with self.subTest(fields=fields):
                self.assertTrue(eval.model_record(response(**fields), process(), 1)['errors'])
        self.assertTrue(eval.model_record(response(), process(), 1, '87654321-1234-4234-8234-123456789abc')['errors'])
        self.assertTrue(eval.model_record(response(), process(timedOut=True), 1)['errors'])
        self.assertFalse(eval.model_record(response(), process(), 1, SID)['errors'])

    def test_model_timeout_terminates_process_group_and_preserves_output(self):
        fake = mock.MagicMock()
        fake.pid = 12345
        fake.returncode = -15
        fake.communicate.side_effect = [subprocess.TimeoutExpired('claude', 3), ('partial', 'timeout')]
        self.popen.side_effect = None
        self.popen.return_value.__enter__.return_value = fake
        result = eval.invoke_claude(['claude'], 'prompt', self.root, 3)
        self.assertTrue(result['timedOut'])
        self.assertEqual(result['stdout'], 'partial')
        self.kill.assert_called_once_with(12345, eval.signal.SIGTERM)
        self.assertTrue(self.popen.call_args.kwargs['start_new_session'])
        self.assertEqual(self.popen.call_args.kwargs['env']['PYTHONDONTWRITEBYTECODE'], '1')

    def mocked_case(self, final='COMPLETE: Accepted story.', mutate=False):
        output, run, session = self.session()
        (output / 'evaluation').mkdir()
        _, content = self.bundle()
        (session / 'story.ledger.md').write_text('Complete worksheet')
        accepted = b'{"page":{"title":"Actual editor source"}}'
        (run / 'final.spec.json').write_bytes(accepted)
        def capture(_, __, ___, request, ____):
            second = request == 'request-2'
            return {'reply': {'id': 'reply-' + request[-1], 'text': final if second else '1. Who is the audience?\n2. Which technical level?'},
                    'source': accepted, 'capture': {'revision': 'revision-2'},
                    'receipts': [{'status': 'applied', 'revision': 'revision-2'}] if second else [],
                    'progress': {'events': [{}]}, 'proposal': {'source': accepted.decode()} if second else None}
        manager = contextlib.ExitStack()
        manager.enter_context(mock.patch.object(eval, 'ready_session', return_value=(session, OWNER)))
        manager.enter_context(mock.patch.object(eval, 'prepare_session', return_value={'kit': 'original'}))
        hashes = manager.enter_context(mock.patch.object(eval, 'tree_hashes', return_value={'kit': 'changed' if mutate else 'original'}))
        send = manager.enter_context(mock.patch.object(eval, 'send_request', side_effect=lambda r,s,o,seq,text,level,d: {'requestId': f'request-{seq}', 'revision': 'old'}))
        invoke = manager.enter_context(mock.patch.object(eval, 'invoke_claude', return_value=process()))
        manager.enter_context(mock.patch.object(eval, 'accepted_capture', side_effect=capture))
        return manager, output, run, session, content, send, invoke, hashes

    def startup_fixture(self, denials=None):
        output, run, session = self.session()
        source = self.capture_files(run, session)
        for path in [session / 'proposal.json', run / 'changes.json', run / 'result.json']:
            path.unlink()
        for name in ['folder-agent.py', 'authoring-kit.json', 'CONNECT.md', 'README.md', 'author-tools.py',
                     'authoring/skill.md', 'input/hld.md']:
            path = session / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('original protected ' + name)
        put(session / 'request.json', {'id': 'request-2', 'text': eval.initial_request(), **OWNER})
        put(session / 'reply.json', {'id': 'reply-2', 'requestId': 'request-2', 'text': 'Which audience?', **OWNER})
        put(session / 'editor.json', {**OWNER, 'connected': True, 'at': int(time.time() * 1000)})
        put(run / 'exchange-history/000001-state.json', {'source': source.decode()})
        artifacts = output / 'evaluation/run-01'
        artifacts.mkdir(parents=True)
        put(output / 'evaluation/manifest.json', {'bundleManifestSha256': 'bundle-hash', 'cases': eval.cases(), 'runClaude': True})
        old_hashes = eval.tree_hashes(session)
        for name in ['protected-files.before.json', 'protected-files.after.json']:
            put(artifacts / name, old_hashes)
        raw = response(permission_denials=denials or [])
        phase = {**eval.model_record(raw, process(), 2), 'phase': 1, 'requestId': 'request-2'}
        prior = {'status': 'failed', 'phases': [phase], 'identity': OWNER, 'sessionPath': str(session.resolve()),
                 'error': 'Claude reported permission denials or malformed permission metadata.' if denials else
                 'Matching editor reply/capture did not arrive within 60 seconds: Expected a regular non-symlink file: changes.json'}
        put(artifacts / 'result.json', prior)
        prompt = b'Original immutable phase-one prompt'
        (artifacts / 'phase1.prompt.txt').write_bytes(prompt)
        command = [arg for arg in eval.claude_command() if arg != 'Bash(python3 author-tools.py status)']
        put(artifacts / 'phase1.command.json', {'command': command, 'cwd': str(session.resolve()),
              'prompt': {'path': 'phase1.prompt.txt', 'bytes': len(prompt), 'sha256': eval.sha(prompt)}})
        raw_bytes = json.dumps(raw).encode()
        (artifacts / 'phase1.raw.json').write_bytes(raw_bytes)
        put(artifacts / 'phase1.streams.json', {'stdout': {'truncated': False, 'originalSha256': eval.sha(raw_bytes)}})
        put(artifacts / 'phase1.request-receipt.json', {'seq': 1, 'requestId': 'request-2', 'revision': 'new-revision'})
        return output, run, session, artifacts

    def test_startup_audit_preserves_denial_and_refuses_changed_prompt_seed_or_protected_files(self):
        denials = [{'tool_name': 'Bash', 'tool_input': {'command':
            'cat folder-agent.py; python3 -c "import time;print(int(time.time()*1000))"'}}]
        output, run, session, artifacts = self.startup_fixture(denials)
        def audit():
            return eval.startup_continuation(eval.cases()[0], output, 'bundle-hash', time.monotonic() + 5)
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            continuation = audit()
            self.assertEqual(continuation['sessionId'], SID)
            self.assertEqual(continuation['originalPhase1']['permission_denials'], denials)
            old = (artifacts / 'phase1.prompt.txt').read_bytes()
            (artifacts / 'phase1.prompt.txt').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'command or prompt'):
                audit()
            (artifacts / 'phase1.prompt.txt').write_bytes(old)
            put(run / 'exchange-history/000001-state.json', {'source': 'different seed'})
            with self.assertRaisesRegex(ValueError, 'seed changed'):
                audit()
            (session / 'authoring/skill.md').write_text('tampered')
            with self.assertRaisesRegex(ValueError, 'Protected'):
                audit()
        self.popen.assert_not_called()

    def test_diagnostic_case_runs_only_phase_two_same_sid_and_preserves_original_evidence(self):
        output, run, session, artifacts = self.startup_fixture()
        with mock.patch.object(eval, 'wait_for', side_effect=immediate):
            continuation = eval.startup_continuation(eval.cases()[0], output, 'bundle-hash', time.monotonic() + 5)
        original = {p.name: p.read_bytes() for p in artifacts.iterdir()}
        (output / 'diagnostic-continuation').mkdir()
        _, content = self.bundle()
        (session / 'story.ledger.md').write_text('Story coverage')
        captured = {**continuation['captured'], 'reply': {'id': 'final', 'text': 'COMPLETE: Delivered'},
                    'receipts': [{'status': 'applied', 'revision': 'new-revision'}], 'proposal': {'source': '{}'}}
        with mock.patch.object(eval, 'accepted_capture', side_effect=[continuation['captured'], captured]), \
                mock.patch.object(eval, 'send_request', return_value={'requestId': 'phase2', 'revision': 'old'}) as send, \
                mock.patch.object(eval, 'invoke_claude', return_value=process()) as invoke:
            record = eval.run_case(eval.cases()[0], output, content, time.monotonic() + 10, continuation)
        self.assertEqual(record['status'], 'completed', record)
        self.assertFalse(record['cleanTrial'])
        self.assertTrue(record['diagnosticContinuation'])
        self.assertEqual([phase['phase'] for phase in record['phases']], [2])
        self.assertEqual(invoke.call_count, 1)
        self.assertEqual(invoke.call_args.args[0][-2:], ['--resume', SID])
        self.assertEqual(send.call_args.args[3:6], (2, content['operator/answers-business.md'].decode().strip(), 'story'))
        self.assertEqual(original, {p.name: p.read_bytes() for p in artifacts.iterdir()})
        repaired = output / 'diagnostic-continuation/run-01'
        self.assertTrue((repaired / 'coordinator-repair.json').exists())
        self.assertEqual((run / 'questions-phase1.md').read_text(), 'Which audience?')
        self.assertEqual((run / 'operator-answers.md').read_bytes(), content['operator/answers-business.md'])

    def test_continuation_audits_all_six_before_any_execution_and_preview_has_no_mutation(self):
        output = self.root / 'cohort'
        for case in eval.cases():
            put(output / case['runId'] / 'session-path.json', {'readyAt': int(time.time() * 1000)})
        audits = [{'sessionId': f'{index:08}-1234-4234-8234-123456789abc'} for index in range(1, 7)]
        with mock.patch.object(eval, 'startup_continuation', side_effect=audits) as audit, \
                mock.patch.object(eval, 'run_case', side_effect=AssertionError('No model turns during preview')):
            self.assertEqual(eval.continue_after_startup_repair(output, {}, 'bundle', 6, False), 0)
        self.assertEqual(audit.call_count, 6)
        self.assertFalse((output / 'diagnostic-continuation').exists())
        with mock.patch.object(eval, 'startup_continuation', side_effect=[audits[0], ValueError('Changed owner')]), \
                mock.patch.object(eval, 'run_case') as run:
            with self.assertRaisesRegex(ValueError, 'Changed owner'):
                eval.continue_after_startup_repair(output, {}, 'bundle', 6, True)
        run.assert_not_called()
        self.assertFalse((output / 'diagnostic-continuation').exists())

    def test_two_turn_orchestration_resumes_and_exports_exact_judge_files(self):
        manager, output, run, session, content, send, invoke, _ = self.mocked_case()
        with manager:
            record = eval.run_case(eval.cases()[0], output, content, time.monotonic() + 100)
        self.assertEqual(record['status'], 'completed', record)
        self.assertEqual(invoke.call_count, 2)
        first, second = invoke.call_args_list
        self.assertNotIn('--resume', first.args[0])
        self.assertEqual(second.args[0][-2:], ['--resume', SID])
        self.assertEqual(second.args[2], session)
        self.assertEqual(send.call_args_list[1].args[4], content['operator/answers-business.md'].decode().strip())
        self.assertEqual((run / 'operator-answers.md').read_bytes(), content['operator/answers-business.md'])
        for name in ['final.spec.json', 'questions-phase1.md', 'story.ledger.md', 'final-reply.md', 'operator-answers.md']:
            self.assertTrue((run / name).is_file(), name)
        self.assertEqual((output / 'evaluation/run-01/phase2.accepted.spec.json').read_bytes(), (run / 'final.spec.json').read_bytes())
        self.assertEqual(record['appliedChanges'], 1)
        self.assertEqual(record['questionBatches'], 1)

    def test_unresolved_second_turn_stays_incomplete_and_has_no_automatic_rerun(self):
        manager, output, _, _, content, _, invoke, _ = self.mocked_case(final='NEEDS_CLARIFICATION: Which timing anchor is authoritative?')
        with manager:
            record = eval.run_case(eval.cases()[0], output, content, time.monotonic() + 100)
        self.assertEqual(record['status'], 'incomplete')
        self.assertEqual(invoke.call_count, 2)
        self.assertEqual(eval.summarize([record])['incomplete'], 1)

    def test_protected_file_mutation_stops_before_resumed_turn(self):
        manager, output, _, _, content, _, invoke, _ = self.mocked_case(mutate=True)
        with manager:
            record = eval.run_case(eval.cases()[0], output, content, time.monotonic() + 100)
        self.assertEqual(record['status'], 'failed')
        self.assertIn('Protected', record['error'])
        self.assertEqual(invoke.call_count, 1)

    def test_per_case_model_failure_is_saved_and_does_not_trigger_retry(self):
        manager, output, _, _, content, _, invoke, _ = self.mocked_case()
        invoke.return_value = process(stdout='not json', exit=7)
        with manager:
            record = eval.run_case(eval.cases()[0], output, content, time.monotonic() + 100)
        self.assertEqual(record['status'], 'failed')
        self.assertEqual(invoke.call_count, 1)
        self.assertEqual(record['phases'][0]['exit'], 7)
        self.assertTrue((output / 'evaluation/run-01/result.json').is_file())
        self.assertEqual((output / 'evaluation/run-01/phase1.raw.json').read_text(), 'not json')

    def test_oversized_model_streams_keep_prefix_hash_and_failed_phase(self):
        manager, output, _, _, content, _, invoke, _ = self.mocked_case()
        stdout = 'A' * 130 + '\u00e9'
        stderr = 'Retained failure details: ' + 'B' * 130
        invoke.return_value = process(stdout=stdout, stderr=stderr, exit=9)
        with manager, mock.patch.object(eval, 'FILE_LIMIT', 128):
            record = eval.run_case(eval.cases()[0], output, content, time.monotonic() + 100)
        self.assertEqual(record['status'], 'failed')
        self.assertEqual(invoke.call_count, 1)
        self.assertEqual(len(record['phases']), 1)
        phase = record['phases'][0]
        self.assertEqual(phase['exit'], 9)
        self.assertTrue(any('size bound' in error for error in phase['errors']))
        artifacts = output / 'evaluation/run-01'
        for key, data, name in [('stdout', stdout.encode(), 'phase1.raw.json'),
                                ('stderr', stderr.encode(), 'phase1.stderr.txt')]:
            self.assertEqual((artifacts / name).read_bytes(), data[:128])
            stream = phase['streams'][key]
            self.assertTrue(stream['truncated'])
            self.assertEqual(stream['originalBytes'], len(data))
            self.assertEqual(stream['originalSha256'], eval.sha(data))
            self.assertEqual(stream['retainedBytes'], 128)
            self.assertEqual(stream['retainedSha256'], eval.sha(data[:128]))
        self.assertEqual(json.loads((artifacts / 'phase1.streams.json').read_text()), phase['streams'])

    def test_live_switch_dispatches_all_six_and_keeps_failure_in_summary(self):
        bundle, _ = self.bundle()
        output = self.root / 'six-runs'
        def run_case(case, out, content, deadline):
            self.assertEqual(out, output.resolve())
            self.assertGreater(deadline, time.monotonic())
            return {**case, 'status': 'failed' if case['runId'] == 'run-03' else 'completed'}
        with mock.patch.object(eval, 'run_case', side_effect=run_case) as run:
            status = eval.main(['--bundle', str(bundle), '--output', str(output), '--run-claude'])
        self.assertEqual(status, 1)
        self.assertEqual(run.call_count, 6)
        report = json.loads((output / 'evaluation/results.json').read_text())
        self.assertEqual(report['summary']['failed'], 1)
        self.assertEqual(report['summary']['completed'], 5)
        self.assertEqual([r['runId'] for r in report['results']], [c['runId'] for c in eval.cases()])
        self.popen.assert_not_called()


if __name__ == '__main__':
    unittest.main()
