#!/usr/bin/env python3
"""Opt in to the tracked hooks without replacing existing hook configuration."""
import argparse
import os
from pathlib import Path
import subprocess
import sys


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True, check=False)


def install(shared):
    root = git('rev-parse', '--show-toplevel')
    if root.returncode:
        raise ValueError('Run this command inside a Git worktree.')
    hook = Path(root.stdout.strip()) / '.githooks/pre-commit'
    if not hook.is_file() or not os.access(hook, os.X_OK):
        raise ValueError('This checkout needs the executable .githooks/pre-commit file.')
    configured = git('config', '--get-all', 'core.hooksPath').stdout.splitlines()
    local = git('config', '--local', '--get-all', 'core.hooksPath').stdout.splitlines()
    if configured == ['.githooks'] and local == ['.githooks']:
        print('Tracked hooks are already installed for this repository.')
        return
    if configured:
        raise ValueError('core.hooksPath is already configured; leaving it unchanged. Integrate .githooks/pre-commit with your existing hooks manually.')
    hooks = Path(git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.strip()) / 'hooks'
    active = sorted(p.name for p in hooks.iterdir() if not p.name.endswith('.sample')) if hooks.is_dir() else []
    if active:
        raise ValueError('Existing local hooks would be bypassed: ' + ', '.join(active) + '. Integrate the tracked pre-commit hook manually.')
    if not shared:
        raise ValueError('Pass --shared-repository to opt in: repository-local core.hooksPath affects all linked worktrees. Each checkout needs .githooks/pre-commit.')
    result = git('config', '--local', 'core.hooksPath', '.githooks')
    if result.returncode:
        raise ValueError(result.stderr.strip())
    print('Installed core.hooksPath=.githooks for this repository and its linked worktrees.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-repository', action='store_true', help='allow repository config shared by linked worktrees')
    args = parser.parse_args()
    try:
        install(args.shared_repository)
    except (OSError, ValueError) as error:
        print(f'Hooks not installed: {error}', file=sys.stderr)
        sys.exit(1)
