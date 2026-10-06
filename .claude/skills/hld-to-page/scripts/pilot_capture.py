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
def locked(folder):
    path = regular(folder / 'capture.lock')
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


def enrollment(raw, session_id, owners=()):
    complete = raw[:raw.rfind(b'\n') + 1]
    parsed = analyze(complete, session_id, owners)
    turns = parsed['turns']
    if not turns or parsed['activeParticipantTurnId'] is None:
        raise ValueError('No current verified participant turn is available to establish a pilot capture boundary')
    current = turns[-1]
    prefix = b''.join(complete.splitlines(keepends=True)[:current['transcriptLine'] - 1])
    return {'id': session_id, 'consentedAt': now(), 'startTurnId': current['id'],
            'startOffset': len(prefix), 'startLine': current['transcriptLine'],
            'monitorOwners': list(owners),
            'prefixSha256': hashlib.sha256(prefix).hexdigest()}


def capture(folder, session_id, enable=False, claude_dir=None, target_turn_id=None):
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
        fresh = not config_path.exists()
        config = json.loads(regular(config_path).read_bytes()) if not fresh else {'enabledAt': now(), 'sessions': []}
        if (not isinstance(config, dict) or not isinstance(config.get('sessions'), list) or
                any(not isinstance(item, dict) or not isinstance(item.get('id'), str) or
                    not SESSION_ID.fullmatch(item['id']) or
                    not isinstance(item.get('startOffset', 0), int) or isinstance(item.get('startOffset', 0), bool) or item.get('startOffset', 0) < 0 or
                    not isinstance(item.get('monitorOwners', []), list) or
                    any(not isinstance(owner, dict) or any(not isinstance(owner.get(key), str) or not owner[key]
                        for key in ('sessionId', 'connectionId')) for owner in item.get('monitorOwners', [])) or
                    ('prefixSha256' in item and not re.fullmatch(r'[0-9a-f]{64}', str(item['prefixSha256'])))
                    for item in config['sessions']) or
                len({item['id'] for item in config['sessions']}) != len(config['sessions'])):
            raise ValueError('Invalid pilot session registry')
        if fresh and any((folder / name).exists() for name in (TRANSCRIPT, USAGE)):
            raise ValueError('Unmanaged pilot artifacts already exist; refusing to overwrite them')
        if session_id and SESSION_ID.fullmatch(session_id) and not enable and not any(item['id'] == session_id for item in config['sessions']):
            return {'status': 'consent_required', 'currentSourceAvailable': False,
                    'message': 'This Claude session is new to the pilot folder. Disclose local capture and use --enable only when this participant authorizes pilot mode. Earlier chat will be excluded.'}
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
        elif not any(item['id'] == session_id for item in config['sessions']):
            try:
                raw = source_for(session_id, root).read_bytes()
                config['sessions'].append(enrollment(raw, session_id, [owner] if owner else []))
            except (OSError, ValueError) as error:
                errors.append(str(error))
        if owner:
            for item in config['sessions']:
                if item['id'] == session_id and owner not in item.setdefault('monitorOwners', []):
                    item['monitorOwners'].append(owner)
        save_json(config_path, config)
        combined, sessions, aggregate_line = [], [], 1
        for item in config['sessions']:
            archive = regular(private / (item['id'] + '.jsonl'))
            saved = archive.read_bytes() if archive.exists() else b''
            source_error = None
            try:
                raw = source_for(item['id'], root).read_bytes()
                complete = raw[:raw.rfind(b'\n') + 1]
                offset = item.get('startOffset', 0)
                if offset > len(complete) or ('prefixSha256' in item and hashlib.sha256(complete[:offset]).hexdigest() != item['prefixSha256']):
                    raise ValueError('Native transcript prefix changed before the pilot boundary; retained its earlier exact capture')
                complete = complete[offset:]
                if not complete.startswith(saved):
                    raise ValueError('Native transcript was rewritten; retained its earlier exact capture')
                if complete != saved:
                    atomic(archive, complete)
                    saved = complete
                pending_bytes = len(raw) - offset - len(complete)
            except (OSError, ValueError) as error:
                source_error = str(error)
                errors.append(item['id'] + ': ' + source_error)
                pending_bytes = None
            combined.append(saved)
            sessions.append({**analyze(saved, item['id'], item.get('monitorOwners', []), item.get('startLine', 1) - 1), 'capturedBytes': len(saved), 'pendingBytes': pending_bytes,
                             'verifiedMonitorIdentities': item.get('monitorOwners', []),
                             'sourceAvailable': source_error is None, 'sourceError': source_error,
                             'sourceStatus': 'current' if source_error is None else 'archived_only',
                             'aggregateStartLine': aggregate_line,
                             'captureStart': {'nativeByteOffset': item.get('startOffset', 0), 'nativeLine': item.get('startLine', 1),
                                              'participantTurnId': item.get('startTurnId'), 'consentedAt': item.get('consentedAt'),
                                              'scope': 'pilot_turn_onward' if 'startOffset' in item else 'legacy_full_session'}})
            aggregate_line += saved.count(b'\n')
            if sessions[-1]['invalidJsonLines']:
                errors.append(item['id'] + ': complete native lines contain invalid JSON; raw bytes retained')
        # Rebuild from exact per-session prefixes. Repeating or resuming capture
        # cannot duplicate lines; another participant's session is retained.
        atomic(folder / TRANSCRIPT, b''.join(combined))
        report = {'schema': 'flowview-pilot-v1', 'capturedAt': now(), 'enabledAt': config['enabledAt'],
                  'transcript': TRANSCRIPT, 'sessions': sessions,
                  'errors': errors,
                  'limits': ['The active final response is absent until a later checkpoint or bounded after-turn copy.',
                             'Separate subagent transcripts are not copied. Per-turn models and tokens cover the main transcript.',
                             'Each session starts at its participant-authorized pilot turn.']}
        save_json(folder / USAGE, report)
        current = next((s for s in sessions if s['sessionId'] == session_id), None)
        selected_turn_id = target_turn_id or (current['activeParticipantTurnId'] if current else None)
        last = (next((t for t in current['turns'] if t['id'] == selected_turn_id or selected_turn_id in t['userMessageAliases']), None)
                if current and selected_turn_id else current['turns'][-1] if current and current['turns'] else None)
        return {'status': 'partial' if errors else 'captured', 'transcript': str(folder / TRANSCRIPT),
                'usage': str(folder / USAGE), 'sessions': len(sessions), 'errors': errors,
                'modelsObserved': current['modelsObserved'] if current else [],
                'currentSourceAvailable': bool(current and current['sourceAvailable']),
                'nativeProgress': current['nativeProgress'] if current else None,
                'turnId': last['id'] if last else None,
                'finalResponseCaptured': last['finalResponseCaptured'] if last else False}


def settle(folder, session_id, turn_id, after_line, seconds=45):
    """One bounded final copy, not an installed listener or an authoring agent."""
    if not session_id or not SESSION_ID.fullmatch(session_id):
        raise ValueError('Invalid Claude session ID for the bounded final copy')
    if not isinstance(after_line, int) or isinstance(after_line, bool) or after_line < 0:
        raise ValueError('The bounded final copy requires its pre-reply native line boundary')
    deadline = time.monotonic() + seconds
    status = None
    outcome = None
    reply = {'afterNativeLine': after_line, 'finalResponseCaptured': False}
    while time.monotonic() < deadline:
        time.sleep(1)
        try:
            status = capture(folder, session_id, target_turn_id=turn_id)
            if not status.get('currentSourceAvailable'):
                outcome = 'failed'
                break
            progress = status.get('nativeProgress') or {}
            new_response = bool(progress.get('finalResponseCaptured') and
                                (progress.get('lastAssistantLine') or 0) > after_line)
            reply.update({'finalResponseCaptured': new_response,
                          'nativeAssistantLine': progress.get('lastAssistantLine'),
                          'participantTurnId': progress.get('lastAssistantTurnId')})
            if new_response:
                outcome = 'captured'
                break
        except (OSError, ValueError, KeyError) as error:
            status = {'status': 'failed', 'error': str(error)}
            outcome = 'failed'
            break
    if outcome is None:
        outcome = 'timeout_response_pending'
    saved_status = {'finishedAt': now(), 'sessionId': session_id, 'turnId': turn_id, 'outcome': outcome,
                    'replyCapture': reply, 'result': status}
    private = Path(folder) / PRIVATE
    save_json(private / (session_id + '.after-turn-status.json'), saved_status)
    save_json(private / 'after-turn-status.json', saved_status)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', required=True, help='Diagram root containing the spec and ledger')
    parser.add_argument('--enable', action='store_true', help='Enroll this participant-authorized session from its current turn; exclude earlier chat')
    parser.add_argument('--after-turn', action='store_true', help='Schedule a bounded 45-second final-response copy')
    parser.add_argument('--session-id', default=os.environ.get('CLAUDE_CODE_SESSION_ID'))
    parser.add_argument('--settle-turn', help=argparse.SUPPRESS)
    parser.add_argument('--settle-after-line', type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        if args.settle_turn:
            settle(args.folder, args.session_id, args.settle_turn, args.settle_after_line)
            return
        result = capture(args.folder, args.session_id, enable=args.enable)
        if args.after_turn and result.get('turnId') and result.get('currentSourceAvailable'):
            log_path = regular(Path(args.folder) / PRIVATE / 'after-turn.log')
            with log_path.open('ab') as log:
                os.chmod(log_path, 0o600)
                subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--folder', str(Path(args.folder).resolve()),
                                  '--session-id', args.session_id, '--settle-turn', result['turnId'],
                                  '--settle-after-line', str(result['nativeProgress']['capturedThroughLine'])],
                                 stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            result['afterTurnCopy'] = 'scheduled for up to 45 seconds to copy the final response; completion is not yet confirmed'
        print(json.dumps(result))
        return 1 if result['status'] == 'partial' else 0
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
