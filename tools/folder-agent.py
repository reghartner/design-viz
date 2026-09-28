#!/usr/bin/env python3
"""Flowview folder bridge. Local files only: no server, networking, or subprocesses.

Run from a session folder: python3 folder-agent.py watch
The watcher prints only new requests/results and maintains listener.json.
It never executes instructions, source, or commands from the session files.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import uuid

LIMIT = 8 * 1024 * 1024
PROGRESS_LIMIT = 100


def read(folder, name):
    target = folder / name
    if target.is_symlink() or not target.is_file() or target.stat().st_size > LIMIT:
        raise ValueError(f"Not a regular session file within the size limit: {name}")
    return json.loads(target.read_text(encoding='utf-8'))


def write(folder, name, value):
    temporary = folder / ('.' + name + '-' + uuid.uuid4().hex)
    with temporary.open('x', encoding='utf-8') as output:
        os.chmod(temporary, 0o600)
        json.dump(value, output, ensure_ascii=False)
        output.write('\n')
    temporary.replace(folder / name)


def identity(folder):
    manifest = read(folder, 'session.json')
    if manifest.get('protocol') != 'flowview-folder-v1':
        raise ValueError('Unsupported Flowview folder protocol')
    return {key: manifest[key] for key in ('sessionId', 'connectionId')}


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
    events = [{key: event.get(key) for key in ('id', 'at', 'text')} for event in events[-(PROGRESS_LIMIT-1):]] + [
        {key: value[key] for key in ('id', 'at', 'text')}]
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
    return packed['sha256']


def watch(folder, interval=0.25, minutes=25):
    owner = identity(folder)
    prepare(folder)
    seen = set()
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
                write(folder, 'listener.json', {**owner, 'at': int(now * 1000), 'listening': True})
                last_heartbeat = now
            try:
                editor = read(folder, 'editor.json')
                if not editor.get('connected') or any(editor.get(k) != v for k, v in owner.items()):
                    break
                if now * 1000 - editor.get('at', 0) > 15000:
                    # Sleeping/hidden editor: keep the watcher alive, don't emit old work.
                    time.sleep(interval)
                    continue
                for filename, kind in [('request.json', 'request'), ('result.json', 'result')]:
                    try:
                        value = read(folder, filename)
                        if any(value.get(k) != v for k, v in owner.items()):
                            continue
                        key = (kind, value.get('id'))
                        if not key[1] or key in seen:
                            continue
                        if kind == 'request':
                            try:
                                reply = read(folder, 'reply.json')
                                if (reply.get('requestId') == value['id'] and
                                        all(reply.get(k) == v for k, v in owner.items())):
                                    seen.add(key)
                                    continue
                            except (OSError, ValueError):
                                pass
                        seen.add(key)
                        print(json.dumps({'event': 'flowview_' + kind, 'file': str(folder / filename),
                                          'id': value['id'], **owner}), flush=True)
                    except (OSError, ValueError):
                        pass  # A writer may not have finished publishing yet.
            except (OSError, ValueError):
                pass
            time.sleep(interval)
    finally:
        try:
            if identity(folder) == owner:
                write(folder, 'listener.json', {**owner, 'at': int(time.time() * 1000), 'listening': False})
        except (OSError, ValueError):
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, default=Path(__file__).resolve().parent)
    commands = parser.add_subparsers(dest='command', required=True)
    watching = commands.add_parser('watch')
    watching.add_argument('--interval', type=float, default=0.25)
    watching.add_argument('--minutes', type=float, default=25)
    commands.add_parser('prepare')
    for name in ('reply', 'progress', 'propose'):
        command = commands.add_parser(name)
        command.add_argument('--request', required=True)
        content = command.add_mutually_exclusive_group(required=True)
        content.add_argument('--file', help='UTF-8 file inside the session folder')
        if name != 'propose':
            content.add_argument('--text', help='Short plain-text update; quote as a shell argument')
        if name == 'propose':
            command.add_argument('--revision', required=True, help='Revision read BEFORE planning the edit')
            command.add_argument('--summary', default='Updated the story.')
    args = parser.parse_args()
    folder = args.folder.resolve()
    if args.command == 'prepare':
        print(prepare(folder))
        return
    if args.command == 'watch':
        if not 0.1 <= args.interval <= 5 or not 0 < args.minutes <= 30:
            parser.error('Interval must be 0.1–5 seconds; duration must be greater than 0 and at most 30 minutes.')
        watch(folder, args.interval, args.minutes)
        return
    owner = identity(folder)
    request = read(folder, 'request.json')
    editor = read(folder, 'editor.json')
    if (request.get('id') != args.request or not editor.get('connected') or
            time.time() * 1000 - editor.get('at', 0) > 15000 or
            any(request.get(k) != v or editor.get(k) != v for k, v in owner.items())):
        raise ValueError('Request is no longer current or editor is disconnected. Reread the session.')
    if args.file:
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', args.file) or args.file in ('.', '..'):
            raise ValueError('Use a plain filename inside the session folder')
        target = folder / args.file
        if target.is_symlink() or not target.is_file() or target.stat().st_size > LIMIT:
            raise ValueError('Input must be a regular session file within the size limit')
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
        if state['revision'] != args.revision or any(state.get(k) != v for k, v in owner.items()):
            raise ValueError('Document changed: reread state.json and reconcile, not just the revision number.')
        json.loads(text)
        value.update(baseRevision=args.revision, source=text, summary=args.summary[:1000])
        filename = 'proposal.json'
    else:
        if len(text) > 32000:
            raise ValueError('Reply must be at most 32000 characters')
        value['text'] = text
        filename = args.command + '.json'
        if args.command == 'progress':
            value['events'] = progress_history(folder, value)
    write(folder, filename, value)
    print(json.dumps({'written': filename, 'id': value['id']}))


if __name__ == '__main__':
    main()
