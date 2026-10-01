#!/usr/bin/env python3
"""Flowview folder bridge. Local files only: no server or networking.

Run from a diagram folder: python3 .flowview-agent/folder-agent.py watch
The watcher prints only new requests/results and maintains listener.json.
It never executes instructions, source, or commands from the session files.
Only assemble-deviceapp starts a process: the bundled Node validator, with a
fixed argument list and no shell. prepare --request only copies a registered
request's authorized bytes into new request-scoped candidate files.
"""
import argparse
import base64
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

LIMIT = 8 * 1024 * 1024
PROGRESS_LIMIT = 100


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


def active_request(folder, owner, request_id):
    request = read(folder, 'request.json')
    editor = read(folder, 'editor.json')
    if (identity(folder) != owner or request.get('id') != request_id or not editor.get('connected') or
            time.time() * 1000 - editor.get('at', 0) > 15000 or
            any(request.get(k) != v or editor.get(k) != v for k, v in owner.items())):
        raise ValueError('Request is no longer current or editor is disconnected. Reread the session.')
    if cancelled(folder, owner, request_id):
        raise ValueError('This turn was stopped in the editor. Do not send more changes or replies for it.')
    return request


def preflight(folder, monitor='unverified'):
    """Report existing prerequisites. Do not install, run tools, or expand access."""
    owner = identity(folder)
    editor = read(folder, 'editor.json')
    live = (editor.get('connected') and all(editor.get(k) == v for k, v in owner.items()) and
            time.time() * 1000 - editor.get('at', 0) <= 15000)
    checks = [
        {'id': 'python', 'status': 'ready' if sys.version_info >= (3, 9) else 'missing',
         'message': 'Python ' + '.'.join(map(str, sys.version_info[:3])) + ' is running; Python 3.9 or later is required.'},
        {'id': 'node', 'status': 'ready' if shutil.which('node') else 'missing',
         'message': 'Node is on PATH.' if shutil.which('node') else 'Open Claude Code with Node available before validating authored stories.'},
        {'id': 'monitor', 'status': {'available': 'ready', 'unavailable': 'missing', 'unverified': 'unverified'}[monitor],
         'message': 'Monitor availability is reported by the visible Claude session; this helper cannot inspect Claude tools.'},
        {'id': 'editor', 'status': 'ready' if live else 'missing',
         'message': 'Editor connection is live.' if live else 'Return to the workbench and reconnect this session.'},
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
    # These formerly bundled files teach the retired operation API. Refreshing
    # an existing session must remove them without touching authored files.
    for name in ('docs/agent-operations.md', 'docs/agent-intent-testing.md',
                 'src/workbench/agent-operations.js'):
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
                if now * 1000 - editor.get('at', 0) > 15000:
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


def focused_tools(folder):
    """The version-matched kit copy, else the checkout beside this script."""
    for tools in (folder / 'authoring' / 'tools', Path(__file__).resolve().parent):
        module = tools / 'panel_fragment.py'
        if any(path.is_symlink() for path in (tools.parent, tools, module, tools / 'validate.js')):
            raise ValueError('Focused assembly tools cannot be symlinks.')
        if module.is_file() and (tools / 'validate.js').is_file():
            sys.dont_write_bytecode = True  # keep the unpacked kit free of caches
            spec = importlib.util.spec_from_file_location('flowview_panel_fragment', module)
            fragment = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(fragment)
            return fragment, tools
    raise ValueError('Focused assembly tools are missing. Run: python3 .flowview-agent/folder-agent.py prepare')


def plain_file(folder, name, limit):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', name) or name in ('.', '..'):
        raise ValueError('Use a plain filename inside the helper folder')
    target = folder / name
    if target.is_symlink() or not target.is_file() or target.stat().st_size > limit:
        raise ValueError(f'{name} must be a regular helper file within the size limit')
    return target.read_bytes()


def validate_pair(folder, tools, fragment, base_text, candidate_text):
    node = shutil.which('node')
    if not node:
        raise fragment.Refusal('Node is required to validate the candidate; nothing was written.')
    with tempfile.TemporaryDirectory(prefix='.assemble-', dir=folder) as scratch:
        files = {'base': os.path.join(scratch, 'base.spec.json'), 'candidate': os.path.join(scratch, 'candidate.spec.json')}
        for label, text in (('base', base_text), ('candidate', candidate_text)):
            with open(files[label], 'x', encoding='utf-8', newline='') as output:
                output.write(text)
        try:
            run = subprocess.run([node, str(tools / 'validate.js'), files['base'], files['candidate']], cwd=scratch,
                                 stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            raise fragment.Refusal('The bundled validator timed out; nothing was written.') from None
    try:
        return fragment.parse_validation(run.stdout, files)
    except fragment.Refusal as ex:
        raise fragment.Refusal(str(ex), [run.stderr.strip()[-300:]] if run.stderr.strip() else []) from None


def restore_targets(installed, backups):
    """Undo installed replacements: restore each prior file, or its absence.
    Returns (backups that could not be restored, which are never deleted,
    new files that could not be removed)."""
    kept, stuck = [], []
    for target in reversed(installed):
        backup = backups.get(target)
        try:
            if backup:
                os.replace(backup, target)
            else:
                target.unlink(missing_ok=True)
        except OSError:
            (kept if backup else stuck).append(backup or target)
    return kept, stuck


def discard(paths):
    """Best-effort removal of helper-owned staging/backup files; returns the
    names that remain. Never raises for an ordinary file-system error."""
    left = []
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            # Report only what actually remains (e.g. a staged file already
            # consumed by its rename is gone); if even that check fails, report it.
            try:
                remains = path.exists() or path.is_symlink()
            except OSError:
                remains = True
            if remains:
                left.append(path.name)
    return left


def publish_pair(folder, outputs, guard):
    """Install every output or none; refusals never reach this point.

    New bytes are staged and verified first. After the guard, each existing
    target is copied to a same-directory backup. If any replacement fails, the
    earlier replacements are undone so every target again holds its exact
    prior bytes, or stays absent.

    Once every replacement succeeded the pair is committed: cleanup can no
    longer fail the call. Leftover files are returned as bounded warnings and
    a leftover backup still holds the previous candidate. Before commit,
    cleanup is best effort and never replaces the original error; leftovers
    are listed on it as `retained` and targets holding new bytes as `written`.
    A backup is deleted only after commit, after it was restored, or when its
    target was never replaced; one that could not be restored is kept."""
    staged, backups, kept = [], {}, []
    try:
        for name, text in outputs:
            target = folder / name
            if target.is_symlink() or (target.exists() and not target.is_file()):
                raise ValueError(f'{name} must be a regular file')
            data = text.encode('utf-8')
            temporary = folder / ('.' + name + '-' + uuid.uuid4().hex)
            with temporary.open('xb') as output:
                os.chmod(temporary, 0o600)
                output.write(data)
            staged.append((temporary, target))
            if temporary.read_bytes() != data:
                raise OSError(f'{name} could not be staged byte-for-byte')
        guard()
        for _, target in staged:
            if target.is_symlink() or (target.exists() and not target.is_file()):
                raise ValueError(f'{target.name} must be a regular file')
            if target.exists():
                backup = folder / ('.' + target.name + '-backup-' + uuid.uuid4().hex)
                backups[target] = backup
                shutil.copyfile(target, backup)
        installed = []
        try:
            for temporary, target in staged:
                os.replace(temporary, target)
                installed.append(target)
        except BaseException as ex:
            kept, stuck = restore_targets(installed, backups)
            if kept or stuck:
                owners = {backup: target for target, backup in backups.items()}
                failure = OSError('Publishing the candidate pair failed and could not be fully undone. '
                                  + ''.join(f'Prior {owners[backup].name} is preserved as {backup.name}. ' for backup in kept)
                                  + ''.join(f'Remove the new {target.name} before proposing. ' for target in stuck))
                failure.written = [owners[backup].name for backup in kept] + [target.name for target in stuck]
                raise failure from ex
            raise
    except BaseException as ex:
        retained = [backup.name for backup in kept] + discard(
            [temporary for temporary, _ in staged] + [backup for backup in backups.values() if backup not in kept])
        if retained:
            try:
                ex.retained = retained[:10]
            except AttributeError:
                pass
        raise
    # Committed. Staged files were consumed by the renames.
    left = discard([temporary for temporary, _ in staged] + list(backups.values()))
    return [f'The pair is installed, but helper file {name} could not be removed'
            + (' (it holds the previous candidate)' if '-backup-' in name else '') + '; delete it when no longer needed.'
            for name in left[:10]]


def helper_command(folder):
    """The helper invocation the agent used, so follow-up commands also work
    for legacy root metadata ('.') and custom helper folders."""
    script = Path(__file__).resolve()
    invoked = sys.argv[0] if sys.argv and sys.argv[0] else ''
    shown = invoked if invoked and Path(invoked).resolve() == script else str(script)
    words = ['python3', shown] + ([] if folder == script.parent else ['--folder', str(folder)])
    return ' '.join(shlex.quote(word) for word in words)


def assemble_deviceapp(folder, request_id, task_name, fragment_name):
    """Assemble a complete candidate pair from a focused device-app fragment."""
    owner = identity(folder)
    fragment, tools = focused_tools(folder)
    request = active_request(folder, owner, request_id)
    task_bytes = plain_file(folder, task_name, fragment.PACKET_LIMIT)
    try:
        task_text = task_bytes.decode('utf-8')
        edited = fragment.loads(plain_file(folder, fragment_name, fragment.FRAGMENT_LIMIT).decode('utf-8'), fragment_name)
    except UnicodeDecodeError:
        raise fragment.Refusal('Task and fragment files must be UTF-8.') from None
    packet = fragment.loads(task_text, task_name)
    state = read(folder, 'state.json')
    bound = fragment.packet_problems(packet, request, state, owner, request_id, task_name,
                                     hashlib.sha256(task_bytes).hexdigest())
    if bound:
        raise fragment.Refusal('The focused task no longer matches the registered request and current story.', bound)
    raw = fragment.loads(state['source'], 'The pinned source')
    candidate, summary = fragment.assemble(raw, packet, edited)
    spec_text = state['source'] if summary['unchanged'] else fragment.dumps_like(candidate, state['source'])
    if len(spec_text.encode('utf-8')) > 4 * 1024 * 1024:
        raise fragment.Refusal('The candidate exceeds 4 MiB; nothing was written.')
    reports = validate_pair(folder, tools, fragment, state['source'], spec_text)
    failed = fragment.validation_problems(reports, packet['target'])
    if failed:
        raise fragment.Refusal('Validation refused the candidate; nothing was written.', failed)

    def still_current():
        active_request(folder, owner, request_id)
        latest = read(folder, 'state.json')
        if latest.get('revision') != packet['revision'] or latest.get('source') != state['source'] or latest.get('ledger') != state['ledger']:
            raise fragment.Refusal('The story changed during assembly; nothing was written. Start a new request.')
    # packet_problems already bound state['ledger'] to packet['ledgerSha256'];
    # publish_pair verifies the staged bytes before installing them.
    cleanup = publish_pair(folder, [('candidate.spec.json', spec_text), ('candidate.ledger.md', state['ledger'])], still_current)
    return {'written': ['candidate.spec.json', 'candidate.ledger.md'], 'requestId': request_id,
            **({'cleanupWarnings': cleanup} if cleanup else {}),
            'revision': packet['revision'], 'specSha256': hashlib.sha256(spec_text.encode('utf-8')).hexdigest(),
            'ledgerSha256': packet['ledgerSha256'], 'unchanged': summary['unchanged'],
            'panelChanged': summary['panelChanged'], 'changedSteps': summary['changedSteps'],
            'warnings': len(reports['candidate']['warnings']),
            'next': f'{helper_command(folder)} propose --request {shlex.quote(request_id)} '
                    f'--revision {shlex.quote(packet["revision"])} '
                    '--file candidate.spec.json --ledger candidate.ledger.md --summary "..."'}


PREPARED_FORMAT = 'flowview-prepared-request-v1'
PENDING_FORMAT = 'flowview-prepared-request-pending-v1'
FULL_MODE = 'full'
FULL_GUIDE = 'authoring/.claude/skills/hld-to-page/SKILL.md'
# Generic categories from the focused guide's Edit table; identical for every request.
FOCUSED_ALLOWED_KEYS = ('panel.value.fields order', 'panel.value.fields[].icon', 'panel.value.visible',
                        'panel.value.showSources', 'phoneScreen', '<fieldId>.visible', '<fieldId>.icon',
                        'timeline[].visibilityAssignment')
# A preparation record owns its files only when all of these match the live request.
RECORD_KEYS = ('sessionId', 'connectionId', 'requestId', 'revision', 'mode', 'requestTag', 'receiptFile',
               'editableFiles', 'inputHashes', 'baselineHashes')


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def request_tag(request_id):
    """Filename-safe and stable per request; receipts record the full identity."""
    return sha256_bytes(request_id.encode('utf-8', 'surrogatepass'))[:16]


def same_json(a, b):
    """Structural JSON equality, as panel_fragment.same: booleans are not numbers."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same_json(a[key], b[key]) for key in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same_json(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def request_inputs(folder, owner, request_id, fragment):
    """Live identity checks and the exact bytes this request may stage.

    Copies already-authorized bytes only: the full route gets the current spec
    and ledger, the focused route gets its hash-bound packet.fragment. It never
    reads the request text or decides what to edit."""
    request = active_request(folder, owner, request_id)
    state = read(folder, 'state.json')
    revision = request.get('revision')
    if (not isinstance(revision, str) or state.get('revision') != revision or
            any(state.get(key) != value for key, value in owner.items())):
        raise ValueError('The story changed after this request was registered (revision mismatch). '
                         'Nothing was staged; use the newly registered request.')
    # Both routes: the request must name the open project (absent equals null,
    # as in panel_fragment.packet_problems).
    if not same_json(request.get('project'), state.get('project')):
        raise ValueError('This request belongs to another project. Nothing was staged; use the newly registered request.')
    if (request.get('mode') is None) != (fragment is None):
        raise ValueError('The request route changed during preparation; nothing was staged.')
    if fragment is None:
        source, ledger = state.get('source'), state.get('ledger')
        if not isinstance(source, str) or not isinstance(ledger, str):
            raise ValueError('state.json has no current spec and ledger pair to stage.')
        try:
            staged = {'spec': source.encode('utf-8'), 'ledger': ledger.encode('utf-8')}
        except UnicodeEncodeError:
            raise ValueError('The current spec or ledger is not valid UTF-8 text.') from None
        return {'mode': FULL_MODE, 'revision': revision, 'guide': FULL_GUIDE, 'staged': staged,
                'inputHashes': {'source': sha256_bytes(staged['spec']), 'ledger': sha256_bytes(staged['ledger'])}}
    if request.get('mode') != fragment.MODE:
        raise ValueError('Unknown request mode; nothing was staged.')
    focus = request.get('focus')
    task_name = focus.get('file') if isinstance(focus, dict) else None
    if not isinstance(task_name, str):
        raise fragment.Refusal('This request was not registered for focused device-app editing; use the full-document flow.')
    task_bytes = plain_file(folder, task_name, fragment.PACKET_LIMIT)
    try:
        packet = fragment.loads(task_bytes.decode('utf-8'), task_name)
    except UnicodeDecodeError:
        raise fragment.Refusal('The task packet must be UTF-8.') from None
    bound = fragment.packet_problems(packet, request, state, owner, request_id, task_name, sha256_bytes(task_bytes))
    if bound:
        raise fragment.Refusal('The focused task no longer matches the registered request and current story.', bound)
    raw = fragment.loads(state['source'], 'The pinned source')
    if (fragment.problems(raw, packet['target']) or
            not fragment.same(fragment.extract(raw, packet['target'], request_id, packet['revision']), packet['fragment'])):
        raise fragment.Refusal('The task packet does not match the pinned source. Start a new focused request.')
    guide = packet['guide']
    if (not isinstance(guide, str) or len(guide) > 200 or
            not re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', guide) or
            any(part in ('.', '..') for part in guide.split('/'))):
        raise fragment.Refusal('The task packet names an invalid guide path.')
    try:
        text = (json.dumps(packet['fragment'], ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    except UnicodeEncodeError:
        raise fragment.Refusal('The fragment contains an unpaired surrogate; use the full-document flow.') from None
    return {'mode': fragment.MODE, 'revision': revision, 'guide': guide, 'task': task_name, 'staged': {'fragment': text},
            'inputHashes': {'packet': sha256_bytes(task_bytes), 'source': packet['sourceSha256'],
                            'ledger': packet['ledgerSha256']}}


def prepared_record(folder, name, expected_format):
    """An existing preparation record, or None when absent. Anything else refuses."""
    target = folder / name
    if not target.is_symlink() and not target.exists():
        return None
    try:
        value = read(folder, name)
    except (OSError, ValueError):
        raise ValueError(f'{name} is not a readable preparation record; it was preserved. '
                         'Ask the user before moving it.') from None
    if not isinstance(value, dict) or value.get('format') != expected_format:
        raise ValueError(f'{name} is not a preparation record of this helper; it was preserved.')
    return value


def member_hash(folder, name):
    """SHA-256 of an existing candidate, or None when absent."""
    target = folder / name
    if target.is_symlink() or (target.exists() and not target.is_file()):
        raise ValueError(f'{name} must be a regular file, not a symlink; nothing was changed.')
    if not target.exists():
        return None
    if target.stat().st_size > LIMIT:
        raise ValueError(f'{name} exceeds the helper size limit; nothing was changed.')
    return sha256_bytes(target.read_bytes())


def create_only(temporary, target):
    """Make staged bytes visible under a new name; never replaces anything.
    A hard link appears whole. Where links are unsupported, an exclusive create
    is the fallback; a fault there can leave a short file, which a retry
    refuses because its hash differs from the recorded baseline."""
    try:
        os.link(temporary, target)
        return
    except FileExistsError:
        raise
    except OSError:
        pass
    with target.open('xb') as output:
        os.chmod(target, 0o600)
        output.write(temporary.read_bytes())


def publish_prepared(folder, steps, guard):
    """Create-only publication of (name, bytes) steps in order.

    Every step is staged and verified privately, then `guard` repeats the live
    checks. The caller orders steps pending record, missing candidates, receipt
    last, so a receipt always describes a complete set. Nothing existing is
    replaced or deleted: after a fault the pending record and candidates already
    created remain as a partial set (listed as `written`) that rerunning the
    same command completes, and a name that appeared meanwhile is preserved
    and refused. Returns bounded cleanup warnings."""
    staged, created = [], []
    try:
        for name, data in steps:
            temporary = folder / ('.' + name.lstrip('.') + '-' + uuid.uuid4().hex)
            with temporary.open('xb') as output:
                os.chmod(temporary, 0o600)
                output.write(data)
            staged.append((temporary, folder / name))
            if temporary.read_bytes() != data:
                raise OSError(f'{name} could not be staged byte-for-byte; nothing was published.')
        guard()
        for temporary, target in staged:
            try:
                create_only(temporary, target)
            except FileExistsError:
                raise ValueError(f'{target.name} appeared during preparation; it was preserved and not replaced.') from None
            created.append(target.name)
    except BaseException as ex:
        retained = discard([temporary for temporary, _ in staged])
        for key, value in (('written', created), ('retained', retained)):
            if value:
                try:
                    setattr(ex, key, value[:10])
                except AttributeError:
                    pass
        raise
    # A staged file is a second link to its published candidate; drop it.
    return [f'Helper file {name} could not be removed; delete it when no longer needed.'
            for name in discard([temporary for temporary, _ in staged])[:10]]


def prepared_commands(folder, request_id, live, files):
    """Existing follow-up commands with this request's filenames (stdout only)."""
    helper, request = helper_command(folder), shlex.quote(request_id)
    propose = f'{helper} propose --request {request} --revision {shlex.quote(live["revision"])} '
    if live['mode'] == FULL_MODE:
        return {'propose': propose + f'--file {files["spec"]} --ledger {files["ledger"]} --summary "..."'}
    return {'assemble': f'{helper} assemble-deviceapp --request {request} --task {shlex.quote(live["task"])} '
                        f'--fragment {files["fragment"]}',
            'propose': propose + '--file candidate.spec.json --ledger candidate.ledger.md --summary "..."'}


def prepare_request(folder, request_id):
    """Stage this registered request's editable candidate(s) and receipt.

    Mechanical and symmetric: the full route receives the exact current spec
    and ledger, the focused route receives packet.fragment, each under
    request-scoped names. Nothing durable is written and nothing is proposed;
    assembly, proposal, preview and approval stay authoritative. A retry never
    rewrites a candidate: it reports already-staged or preserved-edits, and only
    completes a set whose preparation record proves ownership and whose
    surviving members still equal their staged bytes."""
    owner = identity(folder)
    request = active_request(folder, owner, request_id)
    fragment = None if request.get('mode') is None else focused_tools(folder)[0]
    live = request_inputs(folder, owner, request_id, fragment)
    tag = request_tag(request_id)
    roles = (('fragment', '.panel.json'),) if fragment else (('spec', '.spec.json'), ('ledger', '.ledger.md'))
    files = {role: f'candidate-{tag}{suffix}' for role, suffix in roles}
    receipt_name, pending_name = f'prepared-{tag}.json', f'.prepared-{tag}.pending.json'
    baseline = {role: sha256_bytes(data) for role, data in live['staged'].items()}
    focused = live['mode'] != FULL_MODE
    record = {'format': PREPARED_FORMAT, 'status': 'created', **owner, 'requestId': request_id,
              'revision': live['revision'], 'mode': live['mode'], 'requestTag': tag, 'receiptFile': receipt_name,
              'editableFiles': files, 'inputHashes': live['inputHashes'], 'baselineHashes': baseline,
              'currentHashes': baseline,
              'guidePointers': {'guide': live['guide'], 'scope': 'presentation-only' if focused else 'complete-document',
                                'pointers': ['/panel/value', '/timeline'] if focused else [],
                                'allowedKeys': list(FOCUSED_ALLOWED_KEYS) if focused else []},
              'liveCheck': 'passed'}
    receipt = prepared_record(folder, receipt_name, PREPARED_FORMAT)
    pending = prepared_record(folder, pending_name, PENDING_FORMAT)
    for name, existing in ((receipt_name, receipt), (pending_name, pending)):
        if existing is not None and any(existing.get(key) != record[key] for key in RECORD_KEYS):
            raise ValueError(f'{name} belongs to another request, revision or preparation; its files were preserved. '
                             'Use the newly registered request.')
    current = {role: member_hash(folder, name) for role, name in files.items()}
    missing = [role for role, value in current.items() if value is None]
    edited = [role for role, value in current.items() if value is not None and value != baseline[role]]
    if receipt is None and pending is None and len(missing) < len(files):
        raise ValueError('Candidate files for this request exist without a preparation record; they were preserved. '
                         'Ask the user before moving them.')
    result = {'commands': prepared_commands(folder, request_id, live, files)}
    if receipt is not None and not missing:
        left = discard([folder / pending_name]) if pending is not None else []
        warnings = [f'Helper file {name} could not be removed; delete it when no longer needed.' for name in left]
        return {**record, 'status': 'preserved-edits' if edited else 'already-staged', 'currentHashes': current,
                **result, **({'cleanupWarnings': warnings} if warnings else {})}
    if edited:
        raise ValueError("This request's candidate set is incomplete and a remaining file was edited; nothing was "
                         'repaired and the edited bytes were preserved. Ask the user how to continue.')

    def still_current():
        if request_inputs(folder, owner, request_id, fragment) != live:
            raise ValueError('The story or request changed during preparation; nothing was published. '
                             'Use the newly registered request.')
    steps = []
    if receipt is None and pending is None:
        steps.append((pending_name, (json.dumps({**record, 'format': PENDING_FORMAT, 'status': 'publishing'},
                                                ensure_ascii=False, indent=2) + '\n').encode('utf-8')))
    steps += [(files[role], live['staged'][role]) for role in missing]
    if receipt is None:
        steps.append((receipt_name, (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode('utf-8')))
    warnings = publish_prepared(folder, steps, still_current)
    # The receipt now proves the complete set; the pending record is redundant.
    warnings += [f'Helper file {name} could not be removed; delete it when no longer needed.'
                 for name in discard([folder / pending_name])]
    if receipt is not None:
        result['repaired'] = missing
    return {**record, **result, **({'cleanupWarnings': warnings[:10]} if warnings else {})}


def refuse(ex, advice):
    """Fail closed with bounded diagnostics, never a source dump."""
    reason = str(ex) if isinstance(ex, (ValueError, OSError)) else f'Unexpected {type(ex).__name__}: {ex}'
    # `written` is empty unless files were left in place; `retained` lists helper files cleanup left behind.
    print(json.dumps({'refused': True, 'reason': reason[:1000], 'problems': getattr(ex, 'problems', [])[:20],
                      'written': list(getattr(ex, 'written', []))[:10],
                      **({'retained': list(ex.retained)[:10]} if getattr(ex, 'retained', None) else {}),
                      'next': advice}),
          file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, default=Path(__file__).resolve().parent)
    commands = parser.add_subparsers(dest='command', required=True)
    watching = commands.add_parser('watch')
    watching.add_argument('--interval', type=float, default=0.25)
    watching.add_argument('--minutes', type=float, default=25)
    preparing = commands.add_parser('prepare', help='Unpack the authoring kit; with --request, stage that request\'s candidate file(s)')
    preparing.add_argument('--request', help='Registered request ID: stage its request-scoped candidate(s) and receipt')
    beginning = commands.add_parser('begin', help='Register a request from the native agent conversation')
    beginning.add_argument('--text', required=True)
    checking = commands.add_parser('preflight')
    checking.add_argument('--monitor', choices=('available', 'unavailable', 'unverified'), default='unverified',
                          help='Report Monitor availability after checking the visible Claude session; never inferred by this helper')
    assembling = commands.add_parser('assemble-deviceapp',
                                     help='Build candidate.spec.json + unchanged candidate.ledger.md from a focused device-app fragment')
    assembling.add_argument('--request', required=True)
    assembling.add_argument('--task', required=True, help='The registered focus-<request id>.json packet')
    assembling.add_argument('--fragment', default='candidate.panel.json')
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
    if args.command == 'prepare' and args.request is None:
        print(prepare(folder))
        return
    if args.command == 'prepare':
        try:
            print(json.dumps(prepare_request(folder, args.request)))
        except Exception as ex:
            refuse(ex, 'Edit or propose nothing from this request\'s candidate files. If the request is stale, stopped '
                       'or disconnected, wait for a newly registered request. If `written` lists files, rerun this '
                       'command to complete the set; it never replaces existing files. Otherwise ask the user.')
        return
    if args.command == 'preflight':
        print(json.dumps(preflight(folder, args.monitor)))
        return
    if args.command == 'watch':
        if not 0.1 <= args.interval <= 5 or not 0 < args.minutes <= 30:
            parser.error('Interval must be 0.1–5 seconds; duration must be greater than 0 and at most 30 minutes.')
        watch(folder, args.interval, args.minutes)
        return
    if args.command == 'assemble-deviceapp':
        try:
            print(json.dumps(assemble_deviceapp(folder, args.request, args.task, args.fragment)))
        except Exception as ex:
            refuse(ex, 'Fix only the listed presentation keys in the fragment and rerun, or ask the user '
                       'to use the full-document flow. Do not propose after a refusal.')
        return
    owner = identity(folder)
    if args.command == 'begin':
        if read(folder, 'session.json').get('workflow') != 'external':
            raise ValueError('Native requests require the Work in your agent workflow.')
        if not args.text.strip() or len(args.text) > 16000:
            raise ValueError('Enter a request of at most 16000 characters.')
        editor = read(folder, 'editor.json')
        if not editor.get('connected') or time.time() * 1000 - editor.get('at', 0) > 15000 or any(editor.get(k) != v for k, v in owner.items()):
            raise ValueError('Return to the workbench and reconnect before starting a request.')
        request_id = uuid.uuid4().hex
        write(folder, 'agent-request.json', {**owner, 'id': request_id, 'text': args.text, 'expiresAt': int(time.time() * 1000) + 8000}, guard=lambda: assert_owner(folder, owner))
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            assert_owner(folder, owner)
            try:
                request = active_request(folder, owner, request_id)
                # request.json can become visible before the browser's close
                # continuation has accepted the turn. Its transcript entry is
                # published only after that decision and the pending state.
                transcript = read(folder, 'transcript.json')
                acknowledged = (transcript.get('sessionId') == owner['sessionId'] and
                                any(item.get('role') == 'user' and item.get('requestId') == request_id and
                                    not item.get('cancelled') for item in transcript.get('messages', [])))
                if acknowledged and time.monotonic() < deadline and request.get('expiresAt', float('inf')) > time.time() * 1000:
                    print(json.dumps({'id': request_id, 'revision': request['revision']}))
                    return
                time.sleep(0.1)
            except (OSError, ValueError):
                time.sleep(0.1)
        def still_ours():
            assert_owner(folder, owner)
            if read(folder, 'agent-request.json').get('id') != request_id:
                raise ValueError('Another native request replaced this attempt.')
        withdrawn = False
        try:
            write(folder, 'agent-request.json', {**owner, 'id': request_id, 'text': args.text,
                                               'expiresAt': 0, 'withdrawn': True}, guard=still_ours)
            withdrawn = True
        except (OSError, ValueError):
            pass
        outcome = 'This attempt was withdrawn.' if withdrawn else 'Withdrawal could not be confirmed; use Stop accepting this turn in Agent before retrying.'
        raise ValueError('The workbench did not acknowledge this request in time. ' + outcome + ' Keep the workbench visible and retry; if another turn is active, use Stop accepting this turn in Agent. Do not submit unacknowledged work.')
    active_request(folder, owner, args.request)
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
    write(folder, filename, value, guard=lambda: active_request(folder, owner, args.request))
    print(json.dumps({'written': filename, 'id': value['id']}))


if __name__ == '__main__':
    main()
