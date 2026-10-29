#!/usr/bin/env python3
"""Flowview folder bridge. Local files only: no server, networking, or subprocesses.

Run from a diagram folder: python3 .flowview-agent/folder-agent.py watch
The watcher prints only new requests/results and maintains listener.json.
It never executes instructions, source, or commands from the session files.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys
import time
import uuid

LIMIT = 8 * 1024 * 1024
PROGRESS_LIMIT = 100
HEARTBEAT_MAX_AGE_MS = 15000
RECOVERY_SECONDS = 90
ACKNOWLEDGEMENT_SECONDS = 90


class HeartbeatPausedError(ValueError):
    """The same connected editor has not refreshed its lease yet."""


def heartbeat_fresh(editor):
    at = editor.get('at')
    return (isinstance(at, (int, float)) and not isinstance(at, bool) and math.isfinite(at) and
            0 <= time.time() * 1000 - at <= HEARTBEAT_MAX_AGE_MS)


def connected_editor(folder, owner, allow_stale=False):
    assert_owner(folder, owner)
    editor = read(folder, 'editor.json')
    if editor.get('connected') is not True or any(editor.get(k) != v for k, v in owner.items()):
        raise ValueError('Editor is disconnected or its connection identity changed. Reread the session.')
    if not allow_stale and not heartbeat_fresh(editor):
        raise HeartbeatPausedError('The workbench heartbeat is temporarily paused. Bring the existing Workbench tab to the front and retry the same command with the same session and request IDs. Do not re-establish the session just for a stale heartbeat.')
    return editor


def wait_for_editor(folder, owner, request_id=None, deadline=None):
    """Wait only for freshness, never for a changed owner, request or cancellation."""
    announced = False
    while True:
        try:
            return active_request(folder, owner, request_id) if request_id else connected_editor(folder, owner)
        except HeartbeatPausedError:
            if deadline is None:
                deadline = time.monotonic() + RECOVERY_SECONDS
            if not announced:
                announced = True
                print(f'Workbench heartbeat paused; waiting up to {RECOVERY_SECONDS} seconds for this same connection to resume. Bringing its tab to the front can help.', file=sys.stderr, flush=True)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise
            time.sleep(min(.25, remaining))


def read(folder, name):
    target = folder / name
    if target.is_symlink() or not target.is_file() or target.stat().st_size > LIMIT:
        raise ValueError(f"Not a regular helper file within the size limit: {name}")
    return json.loads(target.read_text(encoding='utf-8'))


def write(folder, name, value, guard=None):
    temporary = folder / ('.' + name + '-' + uuid.uuid4().hex)
    with temporary.open('x', encoding='utf-8') as output:
        os.chmod(temporary, 0o600)
        json.dump(value, output, ensure_ascii=False)
        output.write('\n')
    try:
        if guard:
            guard()
        temporary.replace(folder / name)
    finally:
        temporary.unlink(missing_ok=True)


def identity(folder):
    manifest = read(folder, 'session.json')
    if manifest.get('protocol') != 'flowview-folder-v1':
        raise ValueError('Unsupported Flowview folder protocol')
    return {key: manifest[key] for key in ('sessionId', 'connectionId')}


def cancelled(folder, owner, request_id):
    try:
        value = read(folder, 'cancel.json')
    except (OSError, ValueError):
        return False
    return (isinstance(value, dict) and value.get('requestId') == request_id and
            all(value.get(key) == expected for key, expected in owner.items()))


def current_request(folder, owner, request_id):
    request = read(folder, 'request.json')
    assert_owner(folder, owner)
    if request.get('id') != request_id or any(request.get(k) != v for k, v in owner.items()):
        raise ValueError('Request is no longer current. Reread the session.')
    if cancelled(folder, owner, request_id):
        raise ValueError('This turn was stopped in the editor. Do not send more changes or replies for it.')
    connected_editor(folder, owner)
    return request


def active_request(folder, owner, request_id):
    current_request(folder, owner, request_id)
    completed = accepted_completion(folder, owner, request_id)
    # Completion inspection reads several files. Recheck the publication guard
    # afterward so an old command cannot overwrite a newer connection's output.
    request = current_request(folder, owner, request_id)
    if completed:
        raise ValueError("This request was accepted and completed. Begin a fresh request for further changes.")
    return request


def pending_object(folder, name):
    """Only absence or an empty native-file placeholder means pending publication."""
    try:
        (folder / name).lstat()
        value = read(folder, name)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as error:
        if not error.doc:
            return None
        raise
    if not isinstance(value, dict):
        raise ValueError(f'Invalid Workbench protocol file: {name}')
    return value


class AcceptedReply(Exception):
    def __init__(self, result):
        self.result = result


class ProposalPendingError(ValueError):
    """An existing proposal may be awaiting approval or durable publication."""


def accepted_completion(folder, owner, request_id):
    """Only browser-owned acceptance receipts/history can finish an external turn."""
    def owned(value):
        return isinstance(value, dict) and all(value.get(k) == v for k, v in owner.items())

    cancel = pending_object(folder, 'cancel.json')
    if owned(cancel) and cancel.get('requestId') == request_id:
        return None
    transcript = pending_object(folder, 'transcript.json')
    if not transcript or transcript.get('sessionId') != owner['sessionId']:
        return None
    messages = transcript.get('messages', [])
    if not isinstance(messages, list) or any(not isinstance(item, dict) for item in messages):
        raise ValueError('Invalid Workbench protocol file: transcript.json')
    turn = [item for item in messages if item.get('role') == 'user' and
            item.get('requestId') == request_id and not item.get('cancelled')]
    if not turn:
        return None
    result = pending_object(folder, 'result.json')
    for value in [result] + [item.get('completion') for item in turn]:
        if (owned(value) and value.get('requestId') == request_id and value.get('requestCompleted') is True and
                value.get('status') in ('applied', 'unchanged') and
                isinstance(value.get('id'), str) and re.fullmatch(r'[\w-]{1,120}', value['id'], re.ASCII) and
                isinstance(value.get('revision'), str) and value['revision'].startswith(owner['connectionId'] + '-')):
            assert_owner(folder, owner)
            latest_cancel = pending_object(folder, 'cancel.json')
            if owned(latest_cancel) and latest_cancel.get('requestId') == request_id:
                return None
            return value
    return None


def completed_reply(folder, owner, request_id):
    completed = accepted_completion(folder, owner, request_id)
    if completed:
        connected_editor(folder, owner)
        cancel = pending_object(folder, 'cancel.json')
        if (cancel and cancel.get('requestId') == request_id and
                all(cancel.get(k) == v for k, v in owner.items())):
            raise ValueError('This turn was stopped in the editor. Do not send more changes or replies for it.')
        assert_owner(folder, owner)
    return completed


def require_available_request(folder, owner):
    """Protect unfinished work; accepted external requests finish without a reply."""
    def owned(value):
        return value is not None and all(value.get(k) == v for k, v in owner.items())

    request = pending_object(folder, 'request.json')
    if not owned(request):
        return
    request_id = request.get('id')
    if not isinstance(request_id, str) or not re.fullmatch(r'[\w-]{1,120}', request_id, re.ASCII):
        raise ValueError('Invalid Workbench protocol file: request.json')
    transcript = pending_object(folder, 'transcript.json')
    if not transcript or transcript.get('sessionId') != owner['sessionId']:
        return
    messages = transcript.get('messages', [])
    if not isinstance(messages, list) or any(not isinstance(item, dict) for item in messages):
        raise ValueError('Invalid Workbench protocol file: transcript.json')
    turn = [item for item in messages if item.get('requestId') == request_id]
    if not any(item.get('role') == 'user' and not item.get('cancelled') for item in turn):
        return
    if any(item.get('role') == 'assistant' for item in turn):
        return
    cancel = pending_object(folder, 'cancel.json')
    if owned(cancel) and cancel.get('requestId') == request_id:
        return
    completed = accepted_completion(folder, owner, request_id)
    if completed:
        assert_owner(folder, owner)
        if pending_object(folder, 'request.json') != request:
            raise ValueError('Workbench request changed while checking the active turn. Retry begin.')
        return completed
    proposal = pending_object(folder, 'proposal.json')
    result = pending_object(folder, 'result.json')
    reply = pending_object(folder, 'reply.json')
    proposing = owned(proposal) and proposal.get('requestId') == request_id
    if proposing and (not isinstance(proposal.get('id'), str) or not re.fullmatch(r'[\w-]{1,120}', proposal['id'], re.ASCII)):
        raise ValueError('Invalid Workbench protocol file: proposal.json')
    resolved = (proposing and owned(result) and result.get('requestId') == request_id and
                result.get('id') == proposal.get('id'))
    if resolved and result.get('status') not in ('applied', 'unchanged', 'rejected'):
        raise ValueError('Invalid Workbench protocol file: result.json')
    # A valid published receipt can be waiting for the browser's next poll.
    # Let begin wait for that poll instead of falsely calling the prior turn stuck.
    replying = (owned(reply) and reply.get('requestId') == request_id and
                isinstance(reply.get('id'), str) and re.fullmatch(r'[\w-]{1,120}', reply['id'], re.ASCII) and
                isinstance(reply.get('text'), str) and len(reply['text'].encode('utf-16-le')) <= 64000)
    assert_owner(folder, owner)
    if pending_object(folder, 'request.json') != request:
        raise ValueError('Workbench request changed while checking the active turn. Retry begin.')
    if replying and (not proposing or resolved):
        return
    if proposing and not resolved:
        raise ProposalPendingError(f'Previous Workbench request {request_id} is awaiting approval or its saved result. Waiting for its matching proposal result; no new request was submitted. Accept finishes it automatically with an updated Workbench. Unapproved changes remain unapplied.')
    elif resolved and result.get('status') in ('applied', 'unchanged'):
        action = f'This older Workbench accepted the proposal without automatic completion. Verify the accepted artifacts, then finish with reply --request {request_id} --text "Completion receipt".'
    else:
        action = f'Continue that request, including any proposal corrections. Successful Accept finishes it automatically. Only if finishing without an accepted proposal, use reply --request {request_id} --text "Completion receipt".'
    raise ValueError(f'Previous Workbench request {request_id} is still active. {action} '
                     'Keep the existing connection; no new request was submitted.')


def preflight(folder, monitor='unverified'):
    """Report existing prerequisites. Do not install, run tools, or expand access."""
    owner = identity(folder)
    editor = read(folder, 'editor.json')
    live = (editor.get('connected') and all(editor.get(k) == v for k, v in owner.items()) and
            heartbeat_fresh(editor))
    checks = [
        {'id': 'python', 'status': 'ready' if sys.version_info >= (3, 9) else 'missing',
         'message': 'Python ' + '.'.join(map(str, sys.version_info[:3])) + ' is running; Python 3.9 or later is required.'},
        {'id': 'node', 'status': 'ready' if shutil.which('node') else 'missing',
         'message': 'Node is on PATH.' if shutil.which('node') else 'Open Claude Code with Node available before validating authored stories.'},
        {'id': 'monitor', 'status': {'available': 'ready', 'unavailable': 'missing', 'unverified': 'unverified'}[monitor],
         'message': 'Monitor availability is reported by the visible Claude session; this helper cannot inspect Claude tools.'},
        {'id': 'editor', 'status': 'ready' if live else 'missing',
         'message': 'Editor connection is live.' if live else ('Workbench heartbeat is paused. Bring the existing tab to the front; helper commands wait for this same connection to resume.' if editor.get('connected') is True and all(editor.get(k) == v for k, v in owner.items()) else 'Editor is disconnected or ownership changed. Return to the workbench and check this session.')},
    ]
    value = {**owner, 'at': int(time.time() * 1000), 'checks': checks,
             'ready': all(check['status'] == 'ready' for check in checks)}
    if identity(folder) != owner:
        raise ValueError('Session ownership changed during preflight. Reconnect explicitly.')
    write(folder, 'preflight.json', value,
          guard=lambda: assert_owner(folder, owner))
    return value


def assert_owner(folder, owner):
    if identity(folder) != owner:
        raise ValueError('Session ownership changed. Reread the session.')


def progress_history(folder, value):
    """Keep bursts of updates between browser polls; only retain this request."""
    try:
        previous = read(folder, 'progress.json')
    except (OSError, ValueError):
        previous = {}
    if not isinstance(previous, dict):
        previous = {}
    events = []
    if all(previous.get(key) == value[key] for key in ('sessionId', 'connectionId', 'requestId')):
        events = previous.get('events', [previous])
        if not isinstance(events, list):
            events = []
    events = [event for event in events[-PROGRESS_LIMIT:] if isinstance(event, dict) and
              isinstance(event.get('id'), str) and isinstance(event.get('text'), str) and
              len(event['text']) <= 32000]
    events = [{key: event.get(key) for key in ('id', 'at', 'text', 'phase')} for event in events[-(PROGRESS_LIMIT-1):]] + [
        {key: value.get(key) for key in ('id', 'at', 'text', 'phase')}]
    sizes = [len(json.dumps(event, ensure_ascii=False).encode('utf-8')) for event in events]
    total = sum(sizes)
    while len(events) > 1 and total > 512 * 1024:
        total -= sizes.pop(0)
        events.pop(0)
    return events


def prepare(folder):
    """Unpack the version-matched authoring kit shipped by the editor."""
    packed = read(folder, 'authoring-kit.json')
    with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(packed['gzip']))) as compressed:
        raw = compressed.read(20 * 1024 * 1024 + 1)
    if len(raw) > 20 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != packed['sha256']:
        raise ValueError('Authoring kit size or checksum mismatch')
    kit = json.loads(raw)
    destination = folder / 'authoring'
    if destination.is_symlink():
        raise ValueError('Authoring directory cannot be a symlink')
    destination.mkdir(mode=0o700, exist_ok=True)
    for name, text in kit['files'].items():
        relative = Path(name)
        if relative.is_absolute() or any(part in ('..', '.') for part in relative.parts) or not relative.parts:
            raise ValueError('Invalid authoring kit path')
        target = destination
        for part in relative.parts:
            target = target / part
            if target.is_symlink():
                raise ValueError('Authoring kit path cannot contain symlinks')
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')
        os.chmod(target, 0o600)
    # Refreshing an existing session removes retired or omitted optional
    # bundle-owned files without touching authored files. The arrange entries were the Chromium-backed
    # participant tool. Current browser-free composition modules are retained
    # by the kit membership check below, alongside the graph-only CLI.
    for name in ('docs/agent-operations.md', 'docs/agent-intent-testing.md',
                 'src/workbench/agent-operations.js', 'tools/arrange-spec.cjs',
                 'tools/arrange/generated-native.html', 'tools/arrange/contracts.cjs',
                 'tools/arrange/measure.cjs', 'tools/arrange/model.cjs',
                 'tools/arrange/package-lock.json', 'tools/arrange/package.json',
                 'tools/arrange/packing.cjs', 'tools/arrange/setup.cjs',
                 'tools/arrange/solver.cjs', 'tools/company-agent-context.json'):
        if name in kit['files']:
            continue
        target = destination
        for part in Path(name).parts:
            target = target / part
            if target.is_symlink():
                raise ValueError('Retired authoring kit path cannot contain symlinks')
        if target.exists():
            if not target.is_file():
                raise ValueError('Retired authoring kit path must be a regular file')
            target.unlink()
    return packed['sha256']


def watch(folder, interval=0.25, minutes=25):
    owner = identity(folder)
    prepare(folder)
    seen = {}
    try:
        previous = read(folder, 'listener.json')
        if all(previous.get(k) == v for k, v in owner.items()):
            for item in previous.get('events', [])[-256:]:
                if (isinstance(item, list) and len(item) == 2 and item[0] in ('request', 'result', 'cancel') and
                        isinstance(item[1], str) and re.fullmatch(r'[\w-]{1,120}', item[1])):
                    seen[tuple(item)] = True
    except (OSError, ValueError, TypeError):
        pass

    def mark_seen(key):
        seen[key] = True
        while len(seen) > 256:
            del seen[next(iter(seen))]

    def heartbeat(listening=True):
        write(folder, 'listener.json', {**owner, 'at': int(time.time() * 1000), 'listening': listening,
                                       'events': [list(key) for key in seen]},
              guard=lambda: assert_owner(folder, owner))

    deadline = time.monotonic() + minutes * 60
    last_heartbeat = 0
    try:
        while time.monotonic() < deadline:
            try:
                if identity(folder) != owner:
                    break
            except (OSError, ValueError):
                break
            now = time.time()
            if now - last_heartbeat >= 1:
                heartbeat()
                last_heartbeat = now
            try:
                editor = read(folder, 'editor.json')
                if not editor.get('connected') or any(editor.get(k) != v for k, v in owner.items()):
                    break
                if not heartbeat_fresh(editor):
                    # Sleeping/hidden editor: keep the watcher alive, don't emit old work.
                    time.sleep(interval)
                    continue
                for filename, kind in [('cancel.json', 'cancel'), ('request.json', 'request'), ('result.json', 'result')]:
                    try:
                        value = read(folder, filename)
                        if any(value.get(k) != v for k, v in owner.items()):
                            continue
                        key = (kind, value.get('id'))
                        if not key[1] or key in seen:
                            continue
                        if kind in ('request', 'result') and cancelled(folder, owner, value.get('id') if kind == 'request' else value.get('requestId')):
                            mark_seen(key)
                            continue
                        if kind == 'request' and value.get('delivery') in ('clipboard', 'native'):
                            mark_seen(key)
                            continue
                        if kind in ('request', 'result'):
                            try:
                                reply = read(folder, 'reply.json')
                                if (reply.get('requestId') == (value['id'] if kind == 'request' else value.get('requestId')) and
                                        all(reply.get(k) == v for k, v in owner.items())):
                                    mark_seen(key)
                                    continue
                            except (OSError, ValueError):
                                pass
                        mark_seen(key)
                        print(json.dumps({'event': 'flowview_' + kind, 'file': str(folder / filename),
                                          'id': value['id'], 'requestId': value['id'] if kind == 'request' else value.get('requestId'), **owner}), flush=True)
                        # Preserve delivery across ordinary Monitor renewals.
                        # A process crash between output and this write can still
                        # repeat an event, so consumers must also deduplicate IDs.
                        heartbeat()
                    except (OSError, ValueError):
                        pass  # A writer may not have finished publishing yet.
            except (OSError, ValueError):
                pass
            time.sleep(interval)
    finally:
        try:
            if identity(folder) == owner:
                heartbeat(False)
        except (OSError, ValueError):
            pass


def refresh_sources(folder):
    """Request one provider refresh from the already-connected consumer editor."""
    owner = identity(folder)
    wait_for_editor(folder, owner)
    def protocol_file(name):
        target = folder / name
        if target.exists() and target.stat().st_size > (16384 if name == 'refresh-sources-result.json' else 8192):
            raise ValueError(f'{name} exceeds the refresh protocol size limit.')
        return pending_object(folder, name)

    state = read(folder, 'state.json')
    if not isinstance(state, dict) or any(state.get(k) != v for k, v in owner.items()):
        raise ValueError('Consumer state belongs to another connection. Reconnect this consumer.')
    capability = state.get('localSources')
    if not isinstance(capability, dict):
        raise ValueError('This connection does not support refresh-sources. Reconnect the consumer with a current Workbench.')
    if capability.get('available') is not True:
        return {**owner, 'status': 'rejected', 'code': capability.get('code', 'unavailable'),
                'message': capability.get('message', 'Reconnect the consumer through its repository root.'),
                'currentRevision': state.get('revision'), 'localSources': capability}
    revision = state.get('revision')
    if not isinstance(revision, str) or not revision or len(revision) > 200:
        raise ValueError('Consumer state has no valid revision. Wait for the Workbench to publish it.')
    def owned(value):
        return isinstance(value, dict) and all(value.get(k) == v for k, v in owner.items())
    def available():
        connected_editor(folder, owner)
        previous = protocol_file('refresh-sources.json')
        result = protocol_file('refresh-sources-result.json')
        if (owned(previous) and not previous.get('withdrawn') and
                isinstance(previous.get('expiresAt'), (int, float)) and previous['expiresAt'] > time.time()*1000 and
                not (owned(result) and result.get('id') == previous.get('id'))):
            raise ValueError('A refresh is already pending for this consumer. Wait for its receipt before retrying.')
    available()
    request = {**owner, 'version': 1, 'id': uuid.uuid4().hex, 'baseRevision': revision,
               'expiresAt': int(time.time()*1000) + ACKNOWLEDGEMENT_SECONDS*1000}
    write(folder, 'refresh-sources.json', request, guard=available)
    deadline = time.monotonic() + ACKNOWLEDGEMENT_SECONDS
    try:
        while True:
            connected_editor(folder, owner, allow_stale=True)
            current = protocol_file('refresh-sources.json')
            if current != request:
                raise ValueError('Refresh request was replaced or withdrawn. Run refresh-sources again.')
            result = protocol_file('refresh-sources-result.json')
            if owned(result) and result.get('id') == request['id']:
                if (result.get('version') != 1 or result.get('baseRevision') != revision or
                        result.get('status') not in ('applied', 'unchanged', 'rejected', 'busy') or
                        not isinstance(result.get('revision'), str) or not result['revision'] or len(result['revision']) > 200 or
                        not isinstance(result.get('currentRevision'), str) or not result['currentRevision'] or len(result['currentRevision']) > 200 or
                        not isinstance(result.get('snapshotCurrent'), bool) or
                        result['snapshotCurrent'] != (result['revision'] == result['currentRevision'])):
                    raise ValueError('Malformed refresh receipt. Keep the files for inspection; do not blindly retry.')
                connected_editor(folder, owner, allow_stale=True)
                return result
            if time.monotonic() >= deadline:
                raise ValueError('Refresh timed out. Bring the connected consumer Workbench tab to the front, inspect its state, then retry refresh-sources.')
            time.sleep(.25)
    except (OSError, ValueError):
        # Expiry and explicit withdrawal prevent a delayed browser read from
        # applying a timed-out request. Never withdraw another command's file.
        try:
            if protocol_file('refresh-sources.json') == request:
                write(folder, 'refresh-sources.json', {**request, 'withdrawn': True},
                      guard=lambda: assert_owner(folder, owner))
        except (OSError, ValueError):
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, default=Path(__file__).resolve().parent)
    commands = parser.add_subparsers(dest='command', required=True)
    watching = commands.add_parser('watch')
    watching.add_argument('--interval', type=float, default=0.25)
    watching.add_argument('--minutes', type=float, default=25)
    commands.add_parser('prepare')
    commands.add_parser('refresh-sources', help='Refresh saved repo providers in the connected consumer; no begin/proposal needed')
    beginning = commands.add_parser('begin', help='Register a request from the native agent conversation')
    beginning.add_argument('--text', required=True)
    checking = commands.add_parser('preflight')
    checking.add_argument('--monitor', choices=('available', 'unavailable', 'unverified'), default='unverified',
                          help='Report Monitor availability after checking the visible Claude session; never inferred by this helper')
    for name in ('reply', 'progress', 'propose'):
        command = commands.add_parser(name)
        command.add_argument('--request', required=True)
        content = command.add_mutually_exclusive_group(required=True)
        content.add_argument('--file', help='UTF-8 file inside the helper folder')
        if name != 'propose':
            content.add_argument('--text', help='Short plain-text update; quote as a shell argument')
        if name == 'progress':
            command.add_argument('--phase', choices=('working', 'permission-needed'), default='working')
        if name == 'propose':
            command.add_argument('--ledger', help='Complete candidate .ledger.md beside the helper; required for diagram folders')
            command.add_argument('--revision', required=True, help='Revision read BEFORE planning the edit')
            command.add_argument('--summary', default='Updated the story.')
    args = parser.parse_args()
    folder = args.folder.resolve()
    if args.command == 'refresh-sources':
        result = refresh_sources(folder)
        print(json.dumps(result))
        if result.get('status') not in ('applied', 'unchanged') or result.get('snapshotCurrent') is False:
            print(result.get('message', 'Refresh was not accepted.') if result.get('snapshotCurrent') is not False else 'The refresh was accepted, but the consumer changed before its receipt was saved. Inspect the current revision before continuing.', file=sys.stderr)
            raise SystemExit(1)
        return
    if args.command == 'prepare':
        print(prepare(folder))
        return
    if args.command == 'preflight':
        print(json.dumps(preflight(folder, args.monitor)))
        return
    if args.command == 'watch':
        if not 0.1 <= args.interval <= 5 or not 0 < args.minutes <= 30:
            parser.error('Interval must be 0.1–5 seconds; duration must be greater than 0 and at most 30 minutes.')
        watch(folder, args.interval, args.minutes)
        return
    owner = identity(folder)
    if args.command == 'begin':
        if read(folder, 'session.json').get('workflow') != 'external':
            raise ValueError('Native requests require the Work in your agent workflow.')
        if not args.text.strip() or len(args.text) > 16000:
            raise ValueError('Enter a request of at most 16000 characters.')
        recovery_deadline = time.monotonic() + RECOVERY_SECONDS
        previous_result = None
        def ready_to_begin():
            nonlocal previous_result
            connected_editor(folder, owner)
            previous_result = require_available_request(folder, owner)
            connected_editor(folder, owner)

        announced = False
        while True:
            wait_for_editor(folder, owner, deadline=recovery_deadline)
            try:
                ready_to_begin()
                break
            except ProposalPendingError as error:
                if not announced:
                    print(f'{error} Waiting up to {RECOVERY_SECONDS} seconds in total before registration.', file=sys.stderr, flush=True)
                    announced = True
                remaining = recovery_deadline - time.monotonic()
                if remaining <= 0:
                    raise
                time.sleep(min(.25, remaining))
        request_id = uuid.uuid4().hex
        write(folder, 'agent-request.json', {**owner, 'id': request_id, 'text': args.text, 'expiresAt': int(time.time() * 1000) + ACKNOWLEDGEMENT_SECONDS * 1000}, guard=ready_to_begin)
        def still_ours():
            assert_owner(folder, owner)
            if read(folder, 'agent-request.json').get('id') != request_id:
                raise ValueError('Another native request replaced this attempt.')

        def withdraw():
            try:
                write(folder, 'agent-request.json', {**owner, 'id': request_id, 'text': args.text,
                                                   'expiresAt': 0, 'withdrawn': True}, guard=still_ours)
                return True
            except (OSError, ValueError):
                return False

        deadline = time.monotonic() + ACKNOWLEDGEMENT_SECONDS
        announced = False
        request_seen = False
        try:
            while time.monotonic() < deadline:
                connected_editor(folder, owner, allow_stale=True)
                if cancelled(folder, owner, request_id):
                    raise ValueError('This turn was stopped in the editor. Do not send more changes or replies for it.')
                still_ours()
                if not announced and deadline - time.monotonic() <= ACKNOWLEDGEMENT_SECONDS - 1:
                    print(f'Waiting up to {ACKNOWLEDGEMENT_SECONDS} seconds for Workbench acknowledgement. Bring its existing tab to the front if it is suspended.', file=sys.stderr, flush=True)
                    announced = True
                request = pending_object(folder, 'request.json')
                if request and request.get('id') == request_id:
                    request_seen = True
                    try:
                        request = active_request(folder, owner, request_id)
                    except HeartbeatPausedError:
                        time.sleep(0.1)
                        continue
                    # request.json precedes browser acceptance. Only its accepted
                    # transcript entry acknowledges the turn; old history may
                    # remain while that entry is being published.
                    transcript = pending_object(folder, 'transcript.json')
                    if transcript is not None:
                        messages = transcript.get('messages', [])
                        if not isinstance(messages, list) or any(not isinstance(item, dict) for item in messages):
                            raise ValueError('Invalid Workbench acknowledgement file: transcript.json')
                        acknowledged = (transcript.get('sessionId') == owner['sessionId'] and
                                        any(item.get('role') == 'user' and item.get('requestId') == request_id and
                                            not item.get('cancelled') for item in messages))
                        if acknowledged and time.monotonic() < deadline and request.get('expiresAt', float('inf')) > time.time() * 1000:
                            print(json.dumps({'id': request_id, 'revision': request['revision'], **({'previousResult': previous_result} if previous_result else {})}))
                            return
                elif request_seen:
                    raise ValueError('Request is no longer current. Reread the session.')
                time.sleep(0.1)
        except (OSError, ValueError) as error:
            withdrawn = withdraw()
            outcome = 'This attempt was withdrawn.' if withdrawn else 'Withdrawal could not be confirmed.'
            print(f'Workbench acknowledgement failed: {error} {outcome} Do not submit unacknowledged work.', file=sys.stderr, flush=True)
            raise
        withdrawn = withdraw()
        outcome = 'This attempt was withdrawn.' if withdrawn else 'Withdrawal could not be confirmed; use Re-establish session in Agent and continue with its hand-off.'
        raise ValueError('The workbench did not acknowledge this request in time. ' + outcome + ' Keep the workbench visible and retry; if another turn is stuck, ask the user to use Re-establish session in Agent and paste its hand-off. Do not submit unacknowledged work.')
    if args.command == 'reply':
        wait_for_editor(folder, owner)
        completed = completed_reply(folder, owner, args.request)
        if completed:
            # A legacy completion reply is an idempotent acknowledgement. Never
            # overwrite reply.json belonging to a newer request.
            print(json.dumps({'written': None, 'id': completed['id'], 'requestCompleted': True, 'previousResult': completed}))
            return
    wait_for_editor(folder, owner, args.request)
    input_name = args.file
    if input_name:
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', input_name) or input_name in ('.', '..'):
            raise ValueError('Use a plain filename inside the helper folder')
        target = folder / input_name
        if target.is_symlink() or not target.is_file() or target.stat().st_size > LIMIT:
            raise ValueError('Input must be a regular helper file within the size limit')
        text = target.read_text(encoding='utf-8')
    else:
        text = args.text
    value = {**owner, 'id': uuid.uuid4().hex, 'requestId': args.request, 'at': int(time.time() * 1000)}
    if args.command in ('propose', 'reply'):
        try:
            proposal = read(folder, 'proposal.json')
        except (OSError, ValueError):
            proposal = {}
        if proposal.get('requestId') == args.request and all(proposal.get(k) == v for k, v in owner.items()):
            try:
                result = read(folder, 'result.json')
            except (OSError, ValueError):
                result = {}
            if result.get('id') != proposal.get('id') or any(result.get(k) != v for k, v in owner.items()):
                raise ValueError('Wait for the pending proposal result before another proposal or final reply.')
    if args.command == 'propose':
        if len(text.encode('utf-8')) > 4 * 1024 * 1024:
            raise ValueError('Proposal source exceeds 4 MiB')
        state = read(folder, 'state.json')
        if any(state.get(k) != v for k, v in owner.items()) or not args.revision.startswith(owner['connectionId'] + '-'):
            raise ValueError('Unknown connection revision: reread state.json in this session.')
        # The workbench retains baselines and previews safe three-way merges.
        # It rejects unknown/expired revisions and asks for conflict resolution.
        json.loads(text)
        value.update(baseRevision=args.revision, source=text, summary=args.summary[:1000])
        if read(folder, 'session.json').get('pairedArtifacts') or args.ledger:
            if not args.ledger or not re.fullmatch(r'[A-Za-z0-9_.-]+', args.ledger) or args.ledger in ('.', '..'):
                raise ValueError('Include --ledger candidate.ledger.md with the proposed spec.')
            ledger_path = folder / args.ledger
            if ledger_path.is_symlink() or not ledger_path.is_file() or ledger_path.stat().st_size > 256 * 1024:
                raise ValueError('Ledger must be a regular candidate file of at most 256 KiB.')
            ledger = ledger_path.read_text(encoding='utf-8')
            if not ledger.strip():
                raise ValueError('The proposed coverage ledger must not be empty.')
            value['ledger'] = ledger
        filename = 'proposal.json'
    else:
        if len(text) > 32000:
            raise ValueError('Reply must be at most 32000 characters')
        value['text'] = text
        filename = args.command + '.json'
        if args.command == 'progress':
            value['phase'] = args.phase
            value['events'] = progress_history(folder, value)
    def publication_guard():
        if args.command == 'reply':
            connected_editor(folder, owner)
            completed = completed_reply(folder, owner, args.request)
            if completed:
                raise AcceptedReply(completed)
        active_request(folder, owner, args.request)
    try:
        write(folder, filename, value, guard=publication_guard)
    except AcceptedReply as completed:
        print(json.dumps({'written': None, 'id': completed.result['id'], 'requestCompleted': True, 'previousResult': completed.result}))
        return
    print(json.dumps({'written': filename, 'id': value['id']}))


if __name__ == '__main__':
    main()
