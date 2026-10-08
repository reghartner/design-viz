#!/usr/bin/env python3
"""Capture this Claude Code session's raw transcript, models, and token usage locally."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import errno
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

TRANSCRIPT = 'story.agent.transcript.jsonl'
USAGE = 'story.agent.usage.json'
PRIVATE = '.flowview-pilot'
TOKEN_KEYS = ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')
SESSION_ID = re.compile(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\Z')
IGNORE = ('*.agent.transcript.jsonl', '*.agent.usage.json', '.flowview-pilot/')
LOCAL_COMMANDS = {'/add-dir', '/agents', '/bug', '/clear', '/color', '/compact', '/config', '/context', '/copy',
                  '/cost', '/doctor', '/effort', '/exit', '/export', '/fast', '/feedback', '/help', '/hooks',
                  '/ide', '/keybindings', '/login', '/logout', '/mcp', '/memory', '/model', '/output-style',
                  '/permissions', '/plugin', '/quit', '/rename', '/resume', '/rewind', '/settings',
                  '/skills', '/stats', '/status', '/statusline', '/tasks', '/terminal-setup', '/theme', '/todos', '/usage', '/vim'}
CONTROL_TAG = re.compile(r'^<(task-notification|system-reminder|local-command[^>\s]*|bash-(?:input|stdout|stderr))\b[^>]*>.*?(?:</\1>|\Z)\s*', re.S)
INTERRUPTION = re.compile(r'^\[Request interrupted by user(?: for tool use)?\]\s*')


def now():
    return datetime.now(timezone.utc).isoformat()


def regular(path):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f'Expected a regular file, not a link: {path.name}')
    return path


def atomic(path, data):
    regular(path)
    temporary = path.with_name('.' + path.name + '-' + uuid.uuid4().hex)
    try:
        with temporary.open('xb') as stream:
            os.chmod(temporary, 0o600)
            stream.write(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def save_json(path, value):
    atomic(path, (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode())


@contextmanager
def locked(folder, name='capture.lock'):
    path = regular(folder / name)
    with path.open('a+b') as stream:
        os.chmod(path, 0o600)
        if os.name == 'nt':
            import msvcrt
            stream.seek(0)
            if not stream.read(1):
                stream.write(b'\0'); stream.flush()
            stream.seek(0)
            acquire = lambda: msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            acquire = lambda: fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Entry checkpoints and the bounded copier can meet at a tool boundary.
        # Give the current short atomic publication time to finish.
        for attempt in range(21):
            try:
                acquire()
                break
            except OSError as error:
                if error.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK) or attempt == 20:
                    raise
                time.sleep(.05)
        try:
            yield
        finally:
            if os.name == 'nt':
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def native_user_text(row):
    if row.get('type') != 'user' or row.get('isSidechain') or row.get('isCompactSummary') or 'toolUseResult' in row:
        return None
    message = row.get('message', {})
    content = message.get('content') if isinstance(message, dict) else None
    if isinstance(content, list):
        if any(isinstance(x, dict) and x.get('type') == 'tool_result' for x in content):
            return None
        content = '\n'.join(x.get('text', '') for x in content if isinstance(x, dict) and
                            x.get('type') == 'text' and isinstance(x.get('text'), str))
    if not isinstance(content, str):
        return None
    return content.strip()


def participant_text(row):
    if row.get('isMeta') or row.get('isVisibleInTranscriptOnly'):
        return None
    text = native_user_text(row)
    if text is None or text.startswith(('<local-command', '<bash-input>', '<bash-stdout>', '<bash-stderr>')):
        return None
    while text:
        cleaned = INTERRUPTION.sub('', CONTROL_TAG.sub('', text)).strip()
        if cleaned == text:
            break
        text = cleaned
    signature = command_signature(text)
    if not text or (signature and signature[0] in LOCAL_COMMANDS):
        return None
    return text


def command_signature(text):
    """Coalesce the plain slash request and its native display wrappers."""
    name = re.search(r'<command-name>\s*([^<]+?)\s*</command-name>', text)
    if name:
        args = re.search(r'<command-args>(.*?)</command-args>', text, re.S)
        return (name[1].strip(), args[1].strip() if args else '')
    message = re.fullmatch(r'<command-message>(/?[\w:-]+)</command-message>\s*(?:<command-args>(.*?)</command-args>)?', text, re.S)
    if message:
        return ('/' + message[1].lstrip('/'), (message[2] or '').strip())
    if text.startswith('/'):
        parts = text.split(None, 1)
        return (parts[0], parts[1].strip() if len(parts) > 1 else '')
    return None


def human_turn(row):
    return participant_text(row) is not None


def flowview_payloads(row):
    """Decode Monitor's ordered JSONL batch without discarding malformed work."""
    text = native_user_text(row)
    if not text or not re.fullmatch(r'<task-notification>.*</task-notification>', text, re.S):
        return []
    result = []
    for body in re.findall(r'<event>(.*?)</event>', text, re.S):
        body = html.unescape(body).strip()
        try:
            # Also accept one pretty-printed JSON event.
            json.loads(body)
            lines = [body]
        except ValueError:
            lines = body.splitlines()
        for line in lines:
            try:
                event = json.loads(line)
            except ValueError:
                if 'flowview_' in line:
                    result.append({'error': 'malformed_flowview_event'})
                continue
            kind = event.get('event') if isinstance(event, dict) else None
            if not isinstance(kind, str) or not kind.startswith('flowview_'):
                if 'flowview_' in line:
                    result.append({'error': 'invalid_or_unknown_flowview_event'})
                continue
            if (kind not in ('flowview_request', 'flowview_result', 'flowview_cancel') or
                    any(not isinstance(event.get(key), str) or not event[key] for key in ('sessionId', 'connectionId', 'id', 'requestId')) or
                    kind == 'flowview_request' and event['id'] != event['requestId']):
                result.append({'error': 'invalid_or_unknown_flowview_event'})
            else:
                result.append(event)
    return result


def verified_event(event, owners):
    return not event.get('error') and any(all(event[key] == owner.get(key) for key in ('sessionId', 'connectionId')) for owner in owners)


def flowview_payload(row):
    """Compatibility accessor for a single well-formed Monitor event."""
    events = flowview_payloads(row)
    return events[0] if len(events) == 1 and not events[0].get('error') else None


def flowview_event(row, owners):
    event = flowview_payload(row)
    return event if event and verified_event(event, owners) else None


def pasted_request(text):
    """Read the actual Workbench clipboard header, including quoted IDs."""
    quoted = r'("(?:\\.|[^"\\])*")'
    match = re.search(r'Use registered request\s+' + quoted + r'\s+\(session\s+' + quoted +
                      r',\s+connection\s+' + quoted + r'\)\.', text)
    if not match:
        return None
    try:
        request_id, session_id, connection_id = (json.loads(value) for value in match.groups())
    except ValueError:
        return None
    if not all((request_id, session_id, connection_id)):
        return None
    return {'event': 'flowview_request', 'id': request_id, 'requestId': request_id,
            'sessionId': session_id, 'connectionId': connection_id}


def analyze(raw, session_id, flowview_owners=(), native_line_offset=0):
    """Index participant turns without changing the preserved native transcript."""
    turns, models, seen_turns = [], set(), set()
    requests, active_turn = {}, None
    attribution_issues, unattributed_assistants = [], []
    native_assistant_line, native_final = 0, False
    native_assistant_turn_id = None
    invalid = 0
    for line_number, line in enumerate(raw.splitlines(), 1):
        try:
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError('not an object')
        except (ValueError, UnicodeError):
            invalid += 1
            continue
        if row.get('sessionId') not in (None, session_id) or row.get('isSidechain'):
            continue
        raw_text = native_user_text(row) or ''
        if raw_text.startswith('<local-command-stdout>') and turns:
            latest_turn = turns[-1]
            if (latest_turn['_command'] and latest_turn['lastAssistantLine'] is None and
                    row.get('parentUuid') in [latest_turn['id'], *latest_turn['userMessageAliases']]):
                # Native local-command output proves that an otherwise unknown
                # slash command was handled locally. Only its own parent chain
                # can remove the tentative turn; an authored skill stays intact.
                turns.pop()
                active_turn = len(turns) - 1 if turns else None
                continue
        events = flowview_payloads(row)
        copied = pasted_request(raw_text) if not events else None
        if copied:
            events = [copied]
        batch_ambiguous = False
        for event in events or [None]:
            if event and not verified_event(event, flowview_owners):
                attribution_issues.append({'transcriptLine': line_number,
                                           'reason': event.get('error', 'unverified_monitor_identity')})
                active_turn, batch_ambiguous = None, True
                continue
            # A reconnect changes connectionId, not the registered request's
            # identity. Both connection IDs still have to be locally verified.
            request_key = (event['sessionId'], event['requestId']) if event else None
            if event and request_key in requests:
                target_index = requests[request_key]
                target = turns[target_index]
                native_id = row.get('uuid')
                if native_id and native_id != target['id'] and native_id not in target['userMessageAliases']:
                    target['userMessageAliases'].append(native_id)
                if not any(e['event'] == event['event'] and e['id'] == event['id'] for e in target['flowviewEvents']):
                    target['flowviewEvents'].append({key: event[key] for key in ('event', 'id', 'requestId')})
                    if event['event'] in ('flowview_result', 'flowview_cancel'):
                        target['finalResponseCaptured'] = False
                        target['lastAssistantLine'] = None
                active_turn = target_index
                continue
            # An unmatched result/cancellation cannot invent a participant
            # request. Preserve earlier covered turns; detach subsequent work.
            if event and event['event'] != 'flowview_request':
                attribution_issues.append({'transcriptLine': line_number, 'reason': 'unmatched_monitor_event'})
                active_turn, batch_ambiguous = None, True
                continue
            prompt = '[Workbench request ' + event['requestId'] + ']' if event else participant_text(row)
            if prompt is None:
                continue
            turn_id = row.get('uuid') or hashlib.sha256(line).hexdigest()
            if event and turn_id in seen_turns:
                # Multiple requests can arrive in one native notification.
                turn_id += ':flowview:' + event['requestId']
            if turn_id in seen_turns:
                continue
            seen_turns.add(turn_id)
            signature = command_signature(prompt)
            wrapper = prompt.startswith('<command-')
            previous_command = turns[-1].get('_command') if turns else None
            matching_command = bool(signature and previous_command and signature[0] == previous_command[0] and
                                    (signature[1] == previous_command[1] or
                                     (not signature[1] or not previous_command[1]) and (wrapper or turns[-1]['_commandWrapper'])))
            if turns and matching_command and turns[-1]['lastAssistantLine'] is None:
                active_turn = len(turns) - 1
                turns[-1]['userMessageAliases'].append(turn_id)
                if signature[1]:
                    turns[-1]['_command'] = signature
                continue
            turns.append({'id': turn_id, 'timestamp': row.get('timestamp'), 'transcriptLine': line_number,
                          'modelsObserved': [], 'tokens': {}, 'finalResponseCaptured': False,
                          'lastAssistantLine': None, 'userMessageAliases': [],
                          'flowviewRequest': {key: event[key] for key in ('sessionId', 'connectionId', 'requestId')} if event else None,
                          'flowviewEvents': [{key: event[key] for key in ('event', 'id', 'requestId')}] if event else [],
                          '_command': signature, '_commandWrapper': wrapper, '_messages': {}})
            active_turn = len(turns) - 1
            if event:
                requests[request_key] = active_turn
        if batch_ambiguous:
            # Even a later valid event in this same notification cannot prove
            # which of its events caused the next assistant response.
            active_turn = None
        message = row.get('message')
        if row.get('type') == 'assistant' and isinstance(message, dict):
            native_assistant_line = line_number
            native_final = message.get('stop_reason') == 'end_turn'
            native_assistant_turn_id = turns[active_turn]['id'] if active_turn is not None else None
            if active_turn is None:
                unattributed_assistants.append((line_number, native_final))
            model = message.get('model')
            if isinstance(model, str) and model and not model.startswith('<'):
                models.add(model)
                if active_turn is not None and model not in turns[active_turn]['modelsObserved']:
                    turns[active_turn]['modelsObserved'].append(model)
            if active_turn is not None:
                target = turns[active_turn]
                # Claude writes multiple content blocks for the same API message.
                # Its usage is repeated on each block; count each message once.
                key = message.get('id') or row.get('requestId')
                usage = message.get('usage')
                if key and isinstance(usage, dict):
                    target['_messages'][key] = usage
                target['lastAssistantLine'] = line_number
                target['finalResponseCaptured'] = message.get('stop_reason') == 'end_turn'
    for turn in turns:
        turn.pop('_command')
        turn.pop('_commandWrapper')
        messages = turn.pop('_messages')
        turn['assistantMessageCount'] = len(messages)
        turn['tokens'] = {key: sum(value[key] for value in messages.values() if number(value.get(key)))
                          for key in TOKEN_KEYS if any(number(value.get(key)) for value in messages.values())}
        turn['modelsObserved'].sort()
    return {'sessionId': session_id, 'modelsObserved': sorted(models), 'turns': turns,
            'activeParticipantTurnId': turns[active_turn]['id'] if active_turn is not None else None,
            'attributionIssues': attribution_issues,
            'unattributedAssistantLines': [native_line_offset + line for line, _ in unattributed_assistants],
            'nativeProgress': {'capturedThroughLine': native_line_offset + raw.count(b'\n'),
                               'lastAssistantLine': native_line_offset + native_assistant_line if native_assistant_line else None,
                               'lastAssistantTurnId': native_assistant_turn_id,
                               'finalResponseCaptured': native_final},
            'invalidJsonLines': invalid,
            'scope': 'exact pilot slice of the main native transcript'}


def source_for(session_id, claude_dir):
    matches = list((claude_dir / 'projects').glob('*/' + session_id + '.jsonl'))
    if len(matches) != 1:
        raise ValueError('Native transcript unavailable or ambiguous for CLAUDE_CODE_SESSION_ID')
    path = matches[0]
    if any(item.is_symlink() for item in (path, path.parent, path.parent.parent, claude_dir)):
        raise ValueError('Native transcript path cannot contain symlinks')
    return regular(path)


def folder_owner(folder):
    """Only local protocol metadata can establish a trusted Monitor identity."""
    support = folder / '.flowview-agent'
    if support.is_symlink():
        raise ValueError('Flowview metadata directory cannot be a symlink')
    path = support / 'session.json'
    if not path.exists():
        path = folder / 'session.json'
    if not path.exists():
        return None
    regular(path)
    if path.stat().st_size > 8 * 1024 * 1024:
        return None
    try:
        value = json.loads(path.read_bytes())
    except (ValueError, UnicodeError):
        return None
    if (not isinstance(value, dict) or value.get('protocol') != 'flowview-folder-v1' or
            any(not isinstance(value.get(key), str) or not value[key] for key in ('sessionId', 'connectionId'))):
        return None
    return {key: value[key] for key in ('sessionId', 'connectionId')}


class SetupCaptureBlocked(ValueError):
    pass


def setup_capture_gate(folder):
    """Read only current connection metadata; no native transcript discovery."""
    support = folder / '.flowview-agent'
    if support.is_symlink():
        raise SetupCaptureBlocked('Flowview metadata directory cannot be a symlink')
    if not (support / 'session.json').exists():
        support = folder
    setup = regular(support / 'CONNECT.md')
    if not setup.exists():
        return None
    if setup.stat().st_size > 128 * 1024:
        raise SetupCaptureBlocked('Connection instructions exceed the capture consent limit')
    text = setup.read_text()
    gate = parse_setup_choice(text)
    if gate is not None and {key: gate[key] for key in ('sessionId', 'connectionId')} != folder_owner(folder):
        raise SetupCaptureBlocked('Pilot setup choice does not match the current connection')
    return gate


def parse_setup_choice(text):
    choices = re.findall(r'^Pilot capture: (ON|OFF) for this session\.', text, re.M)
    if not choices:
        return None  # Older/standalone authoring has no browser choice.
    quoted = r'("(?:[^"\\]|\\.)*")'
    identities = re.findall(r'Verify [^\n]*?/session\.json has sessionId ' + quoted +
                            r' and connectionId ' + quoted + r'\.', text)
    if len(choices) != 1 or len(identities) != 1:
        raise SetupCaptureBlocked('Pilot setup choice has no unambiguous connection identity')
    identity = dict(zip(('sessionId', 'connectionId'), map(json.loads, identities[0])))
    return {**identity, 'choice': choices[0]}


def gate_authorized(item, gate):
    return gate is None or item.get('setupConsent') == gate


def stop_record(folder, session_id):
    path = regular(folder / PRIVATE / (session_id + '.capture-stop'))
    if not path.exists():
        return {}
    text = path.read_text()
    record = {'token': text} if re.fullmatch(r'[0-9a-f]{32}', text) else json.loads(text)
    if not isinstance(record, dict) or not isinstance(record.get('token'), str) or not re.fullmatch(r'[0-9a-f]{32}', record['token']):
        raise SetupCaptureBlocked('Invalid capture stop token')
    return record


def stop_token(folder, session_id):
    return stop_record(folder, session_id).get('token')


def check_setup_gate(folder, expected, session_id=None, expected_stop=None):
    if setup_capture_gate(folder) != expected or (session_id and stop_token(folder, session_id) != expected_stop):
        raise SetupCaptureBlocked('Pilot consent changed during capture; retry only with current consent')


def publish_capture_batch(folder, gate, authorizations, writes):
    """Restore the prior batch if browser setup or a stop token changes mid-write."""
    def verify():
        check_setup_gate(folder, gate)
        for session_id, token in authorizations:
            if stop_token(folder, session_id) != token:
                raise SetupCaptureBlocked('Capture was stopped during publication; prior captures were restored')
    previous = []
    try:
        for path, data in writes:
            verify()
            path = regular(path)
            before = path.read_bytes() if path.exists() else None
            previous.append((path, before))
            atomic(path, data)
            verify()
    except Exception:
        for path, before in reversed(previous):
            if before is None:
                regular(path).unlink(missing_ok=True)
            else:
                atomic(path, before)
        raise


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def blocked_capture(error=None):
    return {'status': 'disabled', 'currentSourceAvailable': False,
            'message': str(error) if error else 'The current setup requires this Claude session to explicitly opt in before capture.'}


def enrollment(raw, session_id, owners=(), gate=None, explicit_opt_in=False):
    complete = raw[:raw.rfind(b'\n') + 1]
    parsed = analyze(complete, session_id, owners)
    turns = parsed['turns']
    if not turns or parsed['activeParticipantTurnId'] is None:
        raise ValueError('No current verified participant turn is available to establish a pilot capture boundary')
    current = turns[-1]
    row = json.loads(complete.splitlines()[current['transcriptLine'] - 1])
    prompt = participant_text(row) or ''
    if explicit_opt_in:
        if current['flowviewRequest'] or not re.search(
                r'(?im)^\s*(?:use pilot mode(?: for this session)?|enable pilot capture(?: for this session| now)?)\s*[.!]?\s*$', prompt):
            raise SetupCaptureBlocked('A later opt-in requires a direct participant turn saying “Use pilot mode for this session.”')
    elif gate is not None:
        if current['flowviewRequest'] or gate['choice'] != 'ON' or parse_setup_choice(prompt) != gate:
            raise SetupCaptureBlocked('Enrollment requires the participant to directly paste their ON setup prompt; stored CONNECT.md or README.md is not consent.')
    prefix = b''.join(complete.splitlines(keepends=True)[:current['transcriptLine'] - 1])
    return {'id': session_id, 'consentedAt': now(), 'startTurnId': current['id'],
            'startOffset': len(prefix), 'startLine': current['transcriptLine'],
            'monitorOwners': list(owners),
            'prefixSha256': hashlib.sha256(prefix).hexdigest()}


def validate_config(config):
    def valid_slice(item):
        return (isinstance(item, dict) and isinstance(item.get('id'), str) and SESSION_ID.fullmatch(item['id']) and
                isinstance(item.get('startOffset', 0), int) and not isinstance(item.get('startOffset', 0), bool) and item.get('startOffset', 0) >= 0 and
                isinstance(item.get('monitorOwners', []), list) and
                all(isinstance(owner, dict) and all(isinstance(owner.get(key), str) and owner[key]
                    for key in ('sessionId', 'connectionId')) for owner in item.get('monitorOwners', [])) and
                ('prefixSha256' not in item or re.fullmatch(r'[0-9a-f]{64}', str(item['prefixSha256']))) and
                ('stopToken' not in item or item['stopToken'] is None or isinstance(item['stopToken'], str) and re.fullmatch(r'[0-9a-f]{32}', item['stopToken'])) and
                isinstance(item.get('suspended', False), bool) and
                ('setupConsent' not in item or isinstance(item['setupConsent'], dict) and
                 item['setupConsent'].get('choice') in ('ON', 'OFF') and
                 all(isinstance(item['setupConsent'].get(key), str) and item['setupConsent'][key]
                     for key in ('sessionId', 'connectionId'))) and
                ('archive' not in item or isinstance(item['archive'], str) and
                 re.fullmatch(re.escape(item['id']) + r'\.[0-9a-f]{32}\.jsonl', item['archive'])))
    if (not isinstance(config, dict) or not isinstance(config.get('sessions'), list) or
            any(not valid_slice(item) or not isinstance(item.get('previousCaptures', []), list) or
                any(not valid_slice(old) or old['id'] != item['id'] or not old.get('suspended') or
                    'previousCaptures' in old for old in item.get('previousCaptures', []))
                for item in config['sessions']) or
            len({item['id'] for item in config['sessions']}) != len(config['sessions'])):
        raise ValueError('Invalid pilot session registry')
    names = [item.get('archive', item['id'] + '.jsonl') for session in config['sessions']
             for item in [*session.get('previousCaptures', []), session]]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate pilot capture archive')


def disable(folder, session_id):
    """Publish a metadata-only stop barrier before waiting on registry lock."""
    folder = Path(folder)
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('Use the existing diagram folder, not a symlink')
    private = folder.resolve() / PRIVATE
    if private.is_symlink():
        raise ValueError('Pilot directory cannot be a symlink')
    config_path = private / 'config.json'
    result = {'status': 'disabled', 'currentSourceAvailable': False,
              'message': 'Future capture for this Claude session is disabled in this folder. Existing captures are retained; no transcript was read.'}
    if not config_path.exists() and not (private / 'capture.lock').exists():
        return result  # A never-piloted folder needs no Claude session identity.
    if not session_id or not SESSION_ID.fullmatch(session_id):
        raise ValueError('CLAUDE_CODE_SESSION_ID is missing or invalid; cannot suspend a guessed session')
    stop = {'token': uuid.uuid4().hex}
    try:
        stop['setup'] = setup_capture_gate(folder)
    except (OSError, ValueError):
        pass  # Unknown setup must not authorize a future plain --enable.
    atomic(private / (session_id + '.capture-stop'), json_bytes(stop))
    try:
        stop_status(folder.resolve(), session_id)
    except (OSError, ValueError) as error:
        result['statusUpdatePending'] = True
        result['message'] += ' The stop barrier is active, but its health receipt could not be updated: ' + str(error)
    try:
        with locked(private):
            config = json.loads(regular(config_path).read_bytes())
            validate_config(config)
            for item in config['sessions']:
                if item['id'] == session_id:
                    item['suspended'] = True
                    item['suspendedAt'] = now()
                    save_json(config_path, config)
                    break
    except (OSError, ValueError) as error:
        # Readers honor the stop token even while the registry lock is busy.
        result['registryUpdatePending'] = True
        result['message'] = 'Capture stop barrier is active without reading transcripts. Retry --disable to finish the registry update: ' + str(error)
    return result


def capture(folder, session_id, enable=False, claude_dir=None, target_turn_id=None, expected_capture_id=None, explicit_opt_in=False, after_turn=False, status_job=None):
    if explicit_opt_in and not enable:
        raise ValueError('--explicit-opt-in requires --enable and a direct participant request')
    folder = Path(folder)
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('Use the existing diagram folder, not a symlink')
    folder = folder.resolve()
    private = folder / PRIVATE
    if private.is_symlink():
        raise ValueError('Pilot directory cannot be a symlink')
    config_path = private / 'config.json'
    if not enable and not config_path.exists():
        return {'status': 'disabled', 'message': 'Pilot capture is not enabled for this folder.'}
    private.mkdir(mode=0o700, exist_ok=True)
    with locked(private):
        try:
            result = capture_locked(folder, session_id, enable, claude_dir, target_turn_id,
                                    expected_capture_id, explicit_opt_in)
        except (OSError, ValueError, KeyError):
            if not status_job:
                checkpoint_status(folder, session_id, {'status': 'failed'})
            raise
        if not status_job:
            receipt = checkpoint_status(folder, session_id, result, after_turn)
            if receipt:
                result['captureReceipt'] = {key: receipt[key] for key in
                                            ('jobId', 'sessionId', 'captureId', 'turnId', 'afterNativeLine', 'outcome')}
                retained = private / (session_id + '.last-after-turn-status.json')
                if retained.exists():
                    result['lastAfterTurnReceipt'] = str(retained)
        return result


def capture_locked(folder, session_id, enable, claude_dir, target_turn_id, expected_capture_id, explicit_opt_in):
    private = folder / PRIVATE
    config_path = private / 'config.json'
    try:
        gate = setup_capture_gate(folder)
    except (OSError, ValueError) as error:
        return blocked_capture(error)
    fresh = not config_path.exists()
    config = json.loads(regular(config_path).read_bytes()) if not fresh else {'enabledAt': now(), 'sessions': []}
    validate_config(config)
    if fresh and any((folder / name).exists() for name in (TRANSCRIPT, USAGE)):
        raise ValueError('Unmanaged pilot artifacts already exist; refusing to overwrite them')
    current_entry = next((item for item in config['sessions'] if item['id'] == session_id), None)
    stop = stop_record(folder, session_id) if session_id and SESSION_ID.fullmatch(session_id) else {}
    current_stop = stop.get('token')
    stopped = current_stop is not None and (current_entry is None or current_entry.get('stopToken') != current_stop)
    fresh_on = gate is not None and gate['choice'] == 'ON' and 'setup' in stop and stop['setup'] != gate
    if stopped and (not enable or not explicit_opt_in and not fresh_on):
        return blocked_capture('This session was stopped; a later direct opt-in requires --enable --explicit-opt-in.')
    if gate is not None and enable and not explicit_opt_in and any(
            part['id'] != session_id and part.get('setupConsent') == gate
            for item in config['sessions'] for part in [*item.get('previousCaptures', []), item]):
        return blocked_capture('Another Claude session already claimed this setup. Use fresh setup or a direct opt-in with --enable --explicit-opt-in.')
    if gate is not None and not enable and (current_entry is None or not gate_authorized(current_entry, gate)):
        return blocked_capture()
    if gate is not None and gate['choice'] == 'OFF' and enable and not explicit_opt_in:
        return blocked_capture('Setup is OFF. A later explicit user opt-in requires --enable --explicit-opt-in.')
    if session_id and SESSION_ID.fullmatch(session_id) and not enable and not any(item['id'] == session_id for item in config['sessions']):
        return {'status': 'consent_required', 'currentSourceAvailable': False,
                'message': 'This Claude session is new to the pilot folder. Disclose local capture and use --enable only when this participant authorizes pilot mode. Earlier chat will be excluded.'}
    if (current_entry and current_entry.get('suspended') and not enable or
            expected_capture_id is not None and (not current_entry or
                current_entry.get('archive', session_id + '.jsonl') != expected_capture_id)):
        return {'status': 'disabled', 'currentSourceAvailable': False,
                'message': 'This capture enrollment is suspended or has been replaced.'}
    for session in config['sessions']:
        for part in [*session.get('previousCaptures', []), session]:
            retained = part.get('suspended') or not gate_authorized(part, gate) or part.get('stopToken') != stop_token(folder, part['id'])
            if retained and not regular(private / part.get('archive', part['id'] + '.jsonl')).exists():
                return {'status': 'partial', 'currentSourceAvailable': False,
                        'errors': ['A retained capture segment is missing; existing combined transcript was preserved.'],
                        'message': 'Restore the missing private capture segment before capturing again.'}
    # Preserve unrelated ignore rules. Do this before writing private data.
    ignore_path = regular(folder / '.gitignore')
    ignored = ignore_path.read_text() if ignore_path.exists() else ''
    ignore_block = '# Local Flowview pilot capture\n' + '\n'.join(IGNORE) + '\n'
    if not ignored.endswith(ignore_block):
        # Move only our exact managed block behind later negation rules;
        # preserve unrelated rules without accumulating duplicate blocks.
        ignored = re.sub(r'(?m)^' + re.escape(ignore_block), '', ignored)
        atomic(ignore_path, (ignored + ('\n' if ignored and not ignored.endswith('\n') else '') +
                            '\n' + ignore_block).encode())
    errors = []
    owner = folder_owner(folder)
    root = Path(claude_dir or os.environ.get('CLAUDE_CONFIG_DIR', str(Path.home() / '.claude')))
    if not session_id or not SESSION_ID.fullmatch(session_id):
        errors.append('CLAUDE_CODE_SESSION_ID is missing or invalid; no session was guessed.')
    elif current_entry is None or current_entry.get('suspended') or stopped or not gate_authorized(current_entry, gate):
        try:
            check_setup_gate(folder, gate, session_id, current_stop)
            raw = source_for(session_id, root).read_bytes()
            check_setup_gate(folder, gate, session_id, current_stop)
            new_entry = enrollment(raw, session_id, [owner] if owner else [], gate, explicit_opt_in)
            new_entry['stopToken'] = current_stop
            if gate is not None:
                new_entry['setupConsent'] = gate
            if current_entry is None:
                config['sessions'].append(new_entry)
            else:
                # Keep every old slice immutable. A new archive and boundary
                # excludes the entire opted-out interval without byte loss.
                old_archive = regular(private / current_entry.get('archive', session_id + '.jsonl'))
                old_bytes = old_archive.stat().st_size if old_archive.exists() else 0
                if new_entry['startOffset'] < current_entry.get('startOffset', 0) + old_bytes:
                    raise ValueError('Re-enrollment requires a new participant turn after the previous captured segment')
                previous = {key: value for key, value in current_entry.items() if key != 'previousCaptures'}
                previous['suspended'] = True
                previous.setdefault('suspendedAt', now())
                new_entry['archive'] = session_id + '.' + uuid.uuid4().hex + '.jsonl'
                new_entry['previousCaptures'] = [*current_entry.get('previousCaptures', []), previous]
                config['sessions'][config['sessions'].index(current_entry)] = new_entry
        except SetupCaptureBlocked as error:
            return blocked_capture(error)
        except (OSError, ValueError) as error:
            errors.append(str(error))
    if owner:
        for item in config['sessions']:
            if item['id'] == session_id and owner not in item.setdefault('monitorOwners', []):
                item['monitorOwners'].append(owner)
    combined, sessions, aggregate_line = [], [], 1
    writes, authorizations = [], []
    for item in [part for session in config['sessions'] for part in [*session.get('previousCaptures', []), session]]:
        archive_name = item.get('archive', item['id'] + '.jsonl')
        archive = regular(private / archive_name)
        saved = archive.read_bytes() if archive.exists() else b''
        source_error = None
        pending_bytes = None
        suspended = item.get('suspended', False) or item.get('stopToken') != stop_token(folder, item['id'])
        setup_blocked = not gate_authorized(item, gate)
        if not suspended and not setup_blocked:
            try:
                check_setup_gate(folder, gate, item['id'], item.get('stopToken'))
                raw = source_for(item['id'], root).read_bytes()
                check_setup_gate(folder, gate, item['id'], item.get('stopToken'))
                complete = raw[:raw.rfind(b'\n') + 1]
                offset = item.get('startOffset', 0)
                if offset > len(complete) or ('prefixSha256' in item and hashlib.sha256(complete[:offset]).hexdigest() != item['prefixSha256']):
                    raise ValueError('Native transcript prefix changed before the pilot boundary; retained its earlier exact capture')
                complete = complete[offset:]
                if not complete.startswith(saved):
                    raise ValueError('Native transcript was rewritten; retained its earlier exact capture')
                if complete != saved:
                    check_setup_gate(folder, gate, item['id'], item.get('stopToken'))
                    writes.append((archive, complete))
                    saved = complete
                pending_bytes = len(raw) - offset - len(complete)
                authorizations.append((item['id'], item.get('stopToken')))
            except SetupCaptureBlocked as error:
                return blocked_capture(error)
            except (OSError, ValueError) as error:
                source_error = str(error)
                errors.append(item['id'] + ': ' + source_error)
                pending_bytes = None
        combined.append(saved)
        sessions.append({**analyze(saved, item['id'], item.get('monitorOwners', []), item.get('startLine', 1) - 1), 'capturedBytes': len(saved), 'pendingBytes': pending_bytes,
                         'verifiedMonitorIdentities': item.get('monitorOwners', []),
                         'captureId': archive_name, 'captureState': 'suspended' if suspended else 'setup_blocked' if setup_blocked else 'active',
                         'sourceAvailable': not suspended and not setup_blocked and source_error is None, 'sourceError': source_error,
                         'sourceStatus': 'suspended' if suspended else 'setup_blocked' if setup_blocked else 'current' if source_error is None else 'archived_only',
                         'aggregateStartLine': aggregate_line,
                         'captureStart': {'nativeByteOffset': item.get('startOffset', 0), 'nativeLine': item.get('startLine', 1),
                                          'participantTurnId': item.get('startTurnId'), 'consentedAt': item.get('consentedAt'),
                                          'scope': 'pilot_turn_onward' if 'startOffset' in item else 'legacy_full_session'}})
        aggregate_line += saved.count(b'\n')
        if sessions[-1]['invalidJsonLines']:
            errors.append(item['id'] + ': complete native lines contain invalid JSON; raw bytes retained')
    # Rebuild from exact per-session prefixes. Repeating or resuming capture
    # cannot duplicate lines; another participant's session is retained.
    report = {'schema': 'flowview-pilot-v1', 'capturedAt': now(), 'enabledAt': config['enabledAt'],
              'transcript': TRANSCRIPT, 'sessions': sessions,
              'errors': errors,
              'limits': ['The active final response is absent until a later checkpoint or bounded after-turn copy.',
                         'Separate subagent transcripts are not copied. Per-turn models and tokens cover the main transcript.',
                         'Each session starts at its participant-authorized pilot turn.']}
    writes.extend([(config_path, json_bytes(config)), (folder / TRANSCRIPT, b''.join(combined)),
                   (folder / USAGE, json_bytes(report))])
    try:
        publish_capture_batch(folder, gate, authorizations, writes)
    except SetupCaptureBlocked as error:
        return blocked_capture(error)
    current = next((s for s in reversed(sessions) if s['sessionId'] == session_id), None)
    selected_turn_id = target_turn_id or (current['activeParticipantTurnId'] if current else None)
    last = (next((t for t in current['turns'] if t['id'] == selected_turn_id or selected_turn_id in t['userMessageAliases']), None)
            if current and selected_turn_id else current['turns'][-1] if current and current['turns'] else None)
    return {'status': 'partial' if errors else 'captured', 'transcript': str(folder / TRANSCRIPT),
            'usage': str(folder / USAGE), 'sessions': len(config['sessions']), 'errors': errors,
            'captureId': current['captureId'] if current else None,
            'modelsObserved': current['modelsObserved'] if current else [],
            'currentSourceAvailable': bool(current and current['sourceAvailable']),
            'nativeProgress': current['nativeProgress'] if current else None,
            'turnId': last['id'] if last else None,
            'finalResponseCaptured': last['finalResponseCaptured'] if last else False,
            'turnLastAssistantLine': (current['captureStart']['nativeLine'] - 1 + last['lastAssistantLine']
                                      if current and last and last['lastAssistantLine'] is not None else None)}


STATUS_FILE = 'after-turn-status.json'
HEALTH_FILE = 'pilot-status.json'
COPY_SECONDS = 45


def read_receipt(path):
    regular(path)
    if not path.exists():
        return None
    if path.stat().st_size > 128 * 1024:
        raise ValueError('Capture status exceeds the metadata limit')
    value = json.loads(path.read_text())
    return value if isinstance(value, dict) else None


def status_authorized(folder, receipt):
    """Metadata only: an old copier can never acquire renewed consent."""
    try:
        if (folder_owner(folder) != receipt.get('owner') or
                setup_capture_gate(folder) != receipt.get('setupConsent') or
                stop_token(folder, receipt['sessionId']) != receipt.get('stopToken')):
            return False
        config = json.loads(regular(folder / PRIVATE / 'config.json').read_text())
        validate_config(config)
        item = next((entry for entry in config['sessions'] if entry['id'] == receipt['sessionId']), None)
        return bool(item and not item.get('suspended') and
                    item.get('archive', item['id'] + '.jsonl') == receipt.get('captureId') and
                    gate_authorized(item, receipt.get('setupConsent')) and item.get('stopToken') == receipt.get('stopToken'))
    except (OSError, ValueError, KeyError):
        return False


def save_health(folder, receipt):
    """The only browser-readable pilot file contains no native IDs or content."""
    owner = receipt.get('owner')
    if not owner or folder_owner(folder) != owner:
        return
    support = folder / '.flowview-agent'
    if not (support / 'session.json').exists():
        support = folder
    health = {'schema': 'flowview-pilot-status-v1', **owner,
              'jobId': receipt['jobId'], 'outcome': receipt['outcome'],
              'updatedAt': receipt['updatedAt'], 'expiresAt': receipt['expiresAt']}
    if 'deadlineAt' in receipt:
        health['deadlineAt'] = receipt['deadlineAt']
    save_json(support / HEALTH_FILE, health)


def save_receipt(folder, receipt, latest=False):
    private = folder / PRIVATE
    save_json(private / (receipt['sessionId'] + '.' + STATUS_FILE), receipt)
    # One bounded after-turn slot survives ordinary turn-start checkpoints.
    # A later scheduled job replaces it; this is not an accumulating history.
    if 'deadlineAt' in receipt:
        retained_path = private / (receipt['sessionId'] + '.last-after-turn-status.json')
        retained = read_receipt(retained_path)
        if latest or retained and retained.get('jobId') == receipt['jobId']:
            save_json(retained_path, receipt)
    current = read_receipt(private / STATUS_FILE)
    if latest or current and current.get('jobId') == receipt['jobId']:
        save_json(private / STATUS_FILE, receipt)
        save_health(folder, receipt)
    # The stop barrier does not wait for this lock. Recheck after publication
    # too, so a stop that interrupts an atomic replace cannot leave success.
    if receipt['outcome'] in ('pending', 'checkpoint', 'captured', 'partial') and not status_authorized(folder, receipt):
        receipt.update({'outcome': 'disabled', 'replyCapture': {'finalResponseCaptured': False}, 'result': None})
        save_receipt(folder, receipt, latest)


def checkpoint_status(folder, session_id, result, after_turn=False):
    if not session_id or not SESSION_ID.fullmatch(session_id):
        return None
    private = folder / PRIVATE
    with locked(private, 'status.lock'):
        previous = read_receipt(private / STATUS_FILE)
        available = result.get('currentSourceAvailable', False)
        # A refused or foreign session must not replace another session's status.
        if not available and previous and previous.get('sessionId') != session_id:
            return None
        at = int(time.time() * 1000)
        try:
            gate = setup_capture_gate(folder)
            owner = folder_owner(folder)
            token = stop_token(folder, session_id)
        except (OSError, ValueError):
            gate, owner, token = None, None, None
        outcome = ('pending' if after_turn and result.get('turnId') else
                   'partial' if result.get('status') == 'partial' else 'checkpoint') if available else (
                   'disabled' if result.get('status') == 'disabled' else 'failed')
        receipt = {'jobId': uuid.uuid4().hex, 'sessionId': session_id,
                   'captureId': result.get('captureId'), 'turnId': result.get('turnId'),
                   'afterNativeLine': (result.get('nativeProgress') or {}).get('capturedThroughLine'),
                   'owner': owner, 'setupConsent': gate, 'stopToken': token,
                   'startedAt': now(), 'updatedAt': at, 'expiresAt': at + 120000,
                   'outcome': outcome, 'replyCapture': {'finalResponseCaptured': False}}
        if outcome == 'pending':
            receipt['deadlineAt'] = at + COPY_SECONDS * 1000
        # Stop may have arrived after the raw capture committed but before status.
        if available and not status_authorized(folder, receipt):
            receipt['outcome'] = 'disabled'
        save_receipt(folder, receipt, latest=True)
        return receipt


def finish_status(folder, receipt, outcome, reply=None, result=None):
    folder = Path(folder)
    with locked(folder / PRIVATE, 'status.lock'):
        current = read_receipt(folder / PRIVATE / (receipt['sessionId'] + '.' + STATUS_FILE))
        if not current or current.get('jobId') != receipt['jobId'] or current.get('outcome') != 'pending':
            return False
        if not status_authorized(folder, current):
            outcome, reply, result = 'disabled', None, None
        at = int(time.time() * 1000)
        current.update({'outcome': outcome, 'finishedAt': now(), 'updatedAt': at, 'expiresAt': at + 120000,
                        'replyCapture': reply or {'finalResponseCaptured': False}, 'result': result})
        save_receipt(folder, current)
        return True


def stop_status(folder, session_id):
    """Separate from capture.lock so a busy copier cannot hide the stop barrier."""
    with locked(folder / PRIVATE, 'status.lock'):
        current = read_receipt(folder / PRIVATE / (session_id + '.' + STATUS_FILE))
        if current:
            at = int(time.time() * 1000)
            current.update({'outcome': 'disabled', 'finishedAt': now(), 'updatedAt': at, 'expiresAt': at + 120000,
                            'replyCapture': {'finalResponseCaptured': False}, 'result': None})
            save_receipt(folder, current)
        retained_path = folder / PRIVATE / (session_id + '.last-after-turn-status.json')
        retained = read_receipt(retained_path)
        if retained and retained.get('outcome') == 'pending':
            at = int(time.time() * 1000)
            retained.update({'outcome': 'disabled', 'finishedAt': now(), 'updatedAt': at, 'expiresAt': at + 120000,
                             'replyCapture': {'finalResponseCaptured': False}, 'result': None})
            save_json(retained_path, retained)


def settle(folder, session_id, turn_id, after_line, seconds=COPY_SECONDS, capture_id=None, job_id=None):
    """One bounded final copy. Only its still-current receipt can be completed."""
    if not session_id or not SESSION_ID.fullmatch(session_id):
        raise ValueError('Invalid Claude session ID for the bounded final copy')
    if not isinstance(after_line, int) or isinstance(after_line, bool) or after_line < 0:
        raise ValueError('The bounded final copy requires its pre-reply native line boundary')
    folder = Path(folder)
    if folder.is_symlink() or not folder.is_dir() or (folder / PRIVATE).is_symlink():
        raise ValueError('Use the existing diagram folder and private directory, not symlinks')
    receipt = read_receipt(folder / PRIVATE / (session_id + '.' + STATUS_FILE))
    if (not job_id or not receipt or any(receipt.get(key) != value for key, value in
            (('jobId', job_id), ('captureId', capture_id), ('turnId', turn_id), ('afterNativeLine', after_line))) or
            receipt.get('outcome') != 'pending'):
        return
    deadline = time.monotonic() + min(max(0, seconds), COPY_SECONDS,
                                     max(0, (receipt['deadlineAt'] - time.time() * 1000) / 1000))
    status, outcome = None, None
    reply = {'afterNativeLine': after_line, 'finalResponseCaptured': False}
    while time.monotonic() < deadline:
        time.sleep(1)
        current = read_receipt(folder / PRIVATE / (session_id + '.' + STATUS_FILE))
        if not current or current.get('jobId') != job_id or current.get('outcome') != 'pending':
            return
        if not status_authorized(folder, receipt):
            outcome = 'disabled'
            break
        try:
            status = capture(folder, session_id, target_turn_id=turn_id, expected_capture_id=capture_id, status_job=job_id)
            if not status.get('currentSourceAvailable'):
                outcome = 'disabled' if status.get('status') == 'disabled' else 'failed'
                break
            new_response = bool(status.get('turnId') == turn_id and status.get('finalResponseCaptured') and
                                (status.get('turnLastAssistantLine') or 0) > after_line)
            reply.update({'finalResponseCaptured': new_response,
                          'nativeAssistantLine': status.get('turnLastAssistantLine'),
                          'participantTurnId': status.get('turnId')})
            if new_response:
                outcome = 'partial' if status.get('status') == 'partial' else 'captured'
                break
        except (OSError, ValueError, KeyError) as error:
            status = {'status': 'failed', 'error': str(error)}
            outcome = 'failed'
            break
    finish_status(folder, receipt, outcome or 'timeout_response_pending', reply, status)


def launch_copy(folder, session_id, result):
    receipt = result.get('captureReceipt') or {}
    if receipt.get('outcome') != 'pending':
        return
    folder = Path(folder)
    try:
        log_path = regular(folder / PRIVATE / 'after-turn.log')
        with log_path.open('ab') as log:
            os.chmod(log_path, 0o600)
            subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--folder', str(folder.resolve()),
                              '--session-id', session_id, '--settle-turn', receipt['turnId'],
                              '--settle-after-line', str(receipt['afterNativeLine']),
                              '--settle-capture', receipt['captureId'], '--settle-job', receipt['jobId']],
                             stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    except (OSError, ValueError) as error:
        finish_status(folder, receipt, 'failed', result={'status': 'failed', 'error': str(error)})
        raise
    result['afterTurnCopy'] = 'scheduled for up to 45 seconds to copy the final response; completion is not yet confirmed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', required=True, help='Diagram root containing the spec and ledger')
    consent = parser.add_mutually_exclusive_group()
    consent.add_argument('--disable', action='store_true', help='Suspend this session using registry metadata only; never read a transcript')
    consent.add_argument('--enable', action='store_true', help='Enroll this participant-authorized session from its current turn; exclude earlier chat')
    parser.add_argument('--explicit-opt-in', action='store_true', help='Only for a direct participant opt-in turn: override stored setup or stopped capture with --enable')
    parser.add_argument('--after-turn', action='store_true', help='Schedule a bounded 45-second final-response copy')
    parser.add_argument('--session-id', default=os.environ.get('CLAUDE_CODE_SESSION_ID'))
    parser.add_argument('--settle-job', help=argparse.SUPPRESS)
    parser.add_argument('--settle-capture', help=argparse.SUPPRESS)
    parser.add_argument('--settle-turn', help=argparse.SUPPRESS)
    parser.add_argument('--settle-after-line', type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.explicit_opt_in and not args.enable:
        parser.error('--explicit-opt-in requires --enable and a later explicit user opt-in')
    if args.settle_turn and (not args.settle_capture or not args.settle_job):
        parser.error('The bounded final copy requires its capture enrollment and job identity')
    if args.disable and (args.after_turn or args.settle_turn):
        parser.error('--disable cannot be combined with capture scheduling')
    try:
        if args.disable:
            print(json.dumps(disable(args.folder, args.session_id)))
            return 0
        if args.settle_turn:
            settle(args.folder, args.session_id, args.settle_turn, args.settle_after_line, capture_id=args.settle_capture, job_id=args.settle_job)
            return
        result = capture(args.folder, args.session_id, enable=args.enable, explicit_opt_in=args.explicit_opt_in,
                         after_turn=args.after_turn)
        if args.after_turn:
            launch_copy(args.folder, args.session_id, result)
        print(json.dumps(result))
        return 1 if result['status'] == 'partial' else 0
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
