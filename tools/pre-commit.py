#!/usr/bin/env python3
"""Fast, read-only checks of Git's index, including partially staged files."""
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

BUDGETS = {
    '.claude/skills/hld-to-page/SKILL.md': (5999, True),
    'docs/folder-agent-existing-edit.md': (6000, False),
}
CONFLICT = re.compile(rb'^(?:<{7,}(?:[ \t\r]|$)|={7,}\r?$|>{7,}(?:[ \t\r]|$)|\|{7,}(?:[ \t\r]|$))', re.MULTILINE)


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE)


def check():
    root = Path(git('rev-parse', '--show-toplevel').decode().strip())
    # --full-name makes paths stable when the manual command runs in a subfolder.
    entries = {}
    errors = []
    for record in git('ls-files', '--stage', '--full-name', '-z', '--', ':/').split(b'\0'):
        if not record:
            continue
        metadata, raw_name = record.split(b'\t', 1)
        mode, oid, stage = metadata.split()
        name = raw_name.decode('utf-8', 'surrogateescape')
        if stage != b'0':
            errors.append(f'{name}: unresolved merge conflict in index')
        else:
            entries[name] = (mode, oid)
    cache = {}

    def blob(name):
        if name not in cache:
            cache[name] = git('cat-file', 'blob', entries[name][1].decode())
        return cache[name]

    # Keep the same generated-output policy as check-generated.mjs --tracking-only.
    policy_path = 'tools/generated-paths.json'
    policy = json.loads(blob(policy_path) if policy_path in entries else (root / policy_path).read_bytes())
    forbidden = set(policy['pages'] + [policy['runtime']])
    for name in entries:
        if name in forbidden or name == policy['native'] or name.startswith(policy['native'] + '/'):
            errors.append(f'{name}: generated output must not be tracked; remove it from the index')

    changed = git('diff', '--cached', '--name-only', '--diff-filter=ACMRT', '--no-renames', '-z', '--', ':/').split(b'\0')
    count = 0
    for raw_name in changed:
        if not raw_name:
            continue
        name = raw_name.decode('utf-8', 'surrogateescape')
        if name not in entries or entries[name][0] not in (b'100644', b'100755'):
            continue  # Deletions, symlinks and submodules have no source to parse.
        data = blob(name)
        count += 1
        if b'\0' not in data:
            marker = CONFLICT.search(data)
            if marker:
                line = data[:marker.start()].count(b'\n') + 1
                errors.append(f'{name}:{line}: unresolved merge conflict marker')
        try:
            if name in BUDGETS:
                limit, utf16 = BUDGETS[name]
                text = data.decode('utf-8')
                if not utf16:
                    # Match the guide gate's Path.read_text() newline handling.
                    text = text.replace('\r\n', '\n').replace('\r', '\n')
                size = len(text.encode('utf-16-le')) // 2 if utf16 else len(text)
                if size > limit:
                    unit = 'UTF-16 characters' if utf16 else 'characters'
                    errors.append(f'{name}: {size} {unit}; limit is {limit}' + (' (must be <6000)' if utf16 else ' (must be <=6000)'))
            suffix = PurePosixPath(name).suffix
            if suffix == '.json':
                # Python's default decoder permits NaN/Infinity, unlike JSON.parse.
                def invalid_constant(value):
                    raise ValueError(f'{value} is not valid JSON')
                json.loads(data, parse_constant=invalid_constant)
            elif suffix == '.py':
                compile(data, name, 'exec')  # No imports, execution or __pycache__ writes.
            elif suffix in ('.js', '.cjs', '.mjs'):
                mode = 'module' if suffix == '.mjs' else 'commonjs'
                if suffix == '.js':
                    for parent in PurePosixPath(name).parents:
                        package = str(parent / 'package.json')
                        if package in entries:
                            mode = 'module' if json.loads(blob(package)).get('type') == 'module' else 'commonjs'
                            break
                result = subprocess.run(['node', '--check', '--input-type=' + mode], input=data, capture_output=True)
                if result.returncode:
                    errors.append(f'{name}: JavaScript syntax check failed\n' + result.stderr.decode(errors='replace').strip())
        except (ValueError, SyntaxError, UnicodeError) as error:
            errors.append(f'{name}: {error}')
    if errors:
        print('Pre-commit checks failed (staged content):', file=sys.stderr)
        for error in dict.fromkeys(errors):
            print('  ' + error, file=sys.stderr)
        return 1
    print(f'Pre-commit checks passed ({count} staged files).')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(check())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Pre-commit checks could not run: {error}', file=sys.stderr)
        sys.exit(1)
