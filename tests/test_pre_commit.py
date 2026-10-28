"""Exercise staged snapshots and actual hooks in isolated Git repositories."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SKILL = '.claude/skills/hld-to-page/SKILL.md'
GUIDE = 'docs/folder-agent-existing-edit.md'


class PreCommitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'repository with spaces'
        self.root.mkdir()
        self.env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1',
                        GIT_AUTHOR_NAME='Hook Test', GIT_AUTHOR_EMAIL='hook@example.test',
                        GIT_COMMITTER_NAME='Hook Test', GIT_COMMITTER_EMAIL='hook@example.test')
        # Inherit no index/worktree overrides from the process running these tests.
        for key in ('GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR',
                    'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS'):
            self.env.pop(key, None)
        self.git('init', '-q')
        for name in ('.githooks/pre-commit', 'tools/pre-commit.py', 'tools/install-hooks.py',
                     'tools/generated-paths.json'):
            destination = self.root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, destination)
        self.git('add', '.')
        self.git('commit', '-qm', 'baseline')

    def run_command(self, *args, cwd=None):
        return subprocess.run(args, cwd=cwd or self.root, env=self.env, capture_output=True, text=True)

    def git(self, *args):
        result = self.run_command('git', *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def write(self, name, text, stage=True):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        if stage:
            self.git('add', '--', name)

    def check(self, success=True, cwd=None):
        before = self.git('diff', '--cached', '--binary')
        result = self.run_command(sys.executable, str(self.root / 'tools/pre-commit.py'), cwd=cwd)
        self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
        self.assertEqual(self.git('diff', '--cached', '--binary'), before)
        return result.stdout + result.stderr

    def test_budget_boundaries_match_existing_gates(self):
        self.write(SKILL, 'a' * 5999)
        self.write(GUIDE, 'a' * 6000)
        self.check()
        self.write(GUIDE, 'a' * 5999 + '\r\n')
        self.check()
        self.write(SKILL, 'a' * 6000)
        self.write(GUIDE, 'a' * 6001)
        output = self.check(False)
        self.assertIn(f'{SKILL}: 6000 UTF-16 characters; limit is 5999', output)
        self.assertIn(f'{GUIDE}: 6001 characters; limit is 6000', output)
        # The skill's JS length gate counts an astral character as two units.
        self.write(SKILL, 'a' * 5998 + '\U0001f600')
        self.assertIn('6000 UTF-16 characters', self.check(False))

    def test_only_index_content_is_checked_and_files_are_untouched(self):
        self.write(SKILL, 'a' * 6000)
        self.write(SKILL, 'valid working copy', stage=False)
        self.assertIn('6000 UTF-16', self.check(False))
        self.assertEqual((self.root / SKILL).read_text(), 'valid working copy')
        self.write(SKILL, 'valid staged copy')
        self.write(SKILL, 'a' * 6000, stage=False)
        self.check()
        self.assertEqual(len((self.root / SKILL).read_text()), 6000)
        self.write('a file with spaces.json', '{bad')
        self.write('a file with spaces.json', '{}', stage=False)
        self.assertIn('a file with spaces.json', self.check(False))
        self.write('a file with spaces.json', '{}')
        self.write('a file with spaces.json', '{bad', stage=False)
        self.check()

    def test_syntax_errors_and_fix(self):
        self.write('broken.json', '{"bad": NaN}')
        self.write('broken.py', 'def broken(:\n')
        self.write('broken.cjs', 'const = ;')
        self.write('broken.mjs', 'export const = ;')
        output = self.check(False)
        for name in ('broken.json', 'broken.py', 'broken.cjs', 'broken.mjs'):
            self.assertIn(name, output)
        self.write('broken.json', '{}')
        self.write('broken.py', 'print("not executed")\n')
        self.write('broken.cjs', 'module.exports = 1;')
        self.write('broken.mjs', 'export default 1;')
        self.check()
        self.assertFalse(list(self.root.rglob('__pycache__')))

    def test_js_uses_staged_nearest_package_type(self):
        self.write('package.json', '{"type":"module"}')
        self.write('module file.js', 'export default await Promise.resolve(1);')
        self.write('nested/package.json', '{"type":"commonjs"}')
        self.write('nested/common.js', 'return;')  # Legal in Node's CommonJS wrapper.
        self.write('package.json', '{"type":"commonjs"}', stage=False)
        self.check()
        self.write('nested/common.js', 'export default 1;')
        self.assertIn('nested/common.js', self.check(False))

    def test_conflicts_markers_and_binary_files(self):
        self.write('conflicted.md', 'text\n<<<<<<< ours\none\n=======\ntwo\n>>>>>>> theirs\n')
        self.assertIn('conflicted.md:2', self.check(False))
        self.write('conflicted.md', 'text\n=======\r\n')
        self.assertIn('conflicted.md:2', self.check(False))
        self.write('conflicted.md', 'resolved\n')
        self.write('binary.dat', '\0<<<<<<< image bytes')
        self.check()
        # Non-zero index stages must fail even when there are no marker lines.
        oid = self.git('rev-parse', 'HEAD:tools/pre-commit.py').strip()
        self.git('update-index', '--force-remove', 'conflicted.md')
        result = subprocess.run(['git', 'update-index', '--index-info'], cwd=self.root, env=self.env,
                                input=f'100644 {oid} 1\tconflicted.md\n100644 {oid} 2\tconflicted.md\n',
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('unresolved merge conflict in index', self.check(False))

    def test_generated_policy_matches_shared_manifest(self):
        policy = json.loads((ROOT / 'tools/generated-paths.json').read_text())
        names = policy['pages'] + [policy['runtime'], policy['native'] + '/a.js']
        for name in names:
            self.write(name, '{}')
        output = self.check(False)
        for name in names:
            self.assertIn(name + ': generated output must not be tracked', output)
        for name in names:
            self.git('rm', '-q', '--cached', '--', name)
        self.check()

    def test_no_changes_deletion_rename_and_subfolder_invocation(self):
        self.check()
        self.write('old file.json', '{}')
        self.git('commit', '-qm', 'valid JSON')
        self.git('mv', 'old file.json', 'new file.json')
        self.check(cwd=self.root / 'tools')
        self.write('new file.json', '{bad')
        self.assertIn('new file.json', self.check(False, cwd=self.root / 'tools'))
        self.write('new file.json', '{}')
        self.git('commit', '-qm', 'rename')
        self.git('rm', '-q', 'new file.json')
        self.check()

    def installer(self, *args):
        return self.run_command(sys.executable, 'tools/install-hooks.py', *args)

    def test_installer_opt_in_idempotence_and_actual_commits(self):
        denied = self.installer()
        self.assertEqual(denied.returncode, 1)
        self.assertIn('--shared-repository', denied.stderr)
        self.assertEqual(self.run_command('git', 'config', '--local', '--get', 'core.hooksPath').returncode, 1)
        self.assertEqual(self.installer('--shared-repository').returncode, 0)
        self.assertEqual(self.installer('--shared-repository').returncode, 0)
        self.assertEqual(self.git('config', '--local', '--get', 'core.hooksPath').strip(), '.githooks')
        self.write(SKILL, 'a' * 6000)
        rejected = self.run_command('git', 'commit', '-qm', 'must fail')
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn('6000 UTF-16', rejected.stderr)
        self.write(SKILL, 'short instructions')
        accepted = self.run_command('git', 'commit', '-qm', 'must pass')
        self.assertEqual(accepted.returncode, 0, accepted.stderr)

    def test_installer_preserves_existing_config_and_hooks(self):
        self.git('config', '--local', 'core.hooksPath', 'my-hooks')
        result = self.installer('--shared-repository')
        self.assertEqual(result.returncode, 1)
        self.assertIn('already configured', result.stderr)
        self.assertEqual(self.git('config', '--local', '--get', 'core.hooksPath').strip(), 'my-hooks')
        self.git('config', '--local', '--unset', 'core.hooksPath')
        existing = self.root / '.git/hooks/pre-commit'
        existing.write_text('# existing hook\n')
        result = self.installer('--shared-repository')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Existing local hooks', result.stderr)
        self.assertEqual(existing.read_text(), '# existing hook\n')

    def test_installer_preserves_global_hooks_config(self):
        global_config = Path(self.temp.name) / 'global.gitconfig'
        global_config.write_text('[core]\n\thooksPath = global-hooks\n')
        self.env['GIT_CONFIG_GLOBAL'] = str(global_config)
        result = self.installer('--shared-repository')
        self.assertEqual(result.returncode, 1)
        self.assertIn('already configured', result.stderr)
        self.assertEqual(self.run_command('git', 'config', '--local', '--get', 'core.hooksPath').returncode, 1)
        self.assertEqual(global_config.read_text(), '[core]\n\thooksPath = global-hooks\n')

    def test_linked_worktree_install_requires_opt_in_and_uses_shared_config(self):
        linked = Path(self.temp.name) / 'linked'
        self.git('worktree', 'add', '-qb', 'linked', str(linked))
        denied = self.run_command(sys.executable, 'tools/install-hooks.py', cwd=linked)
        self.assertEqual(denied.returncode, 1)
        installed = self.run_command(sys.executable, 'tools/install-hooks.py', '--shared-repository', cwd=linked)
        self.assertEqual(installed.returncode, 0, installed.stderr)
        self.assertEqual(self.git('config', '--local', '--get', 'core.hooksPath').strip(), '.githooks')
        (linked / SKILL).parent.mkdir(parents=True, exist_ok=True)
        (linked / SKILL).write_text('a' * 6000)
        added = self.run_command('git', 'add', '--', SKILL, cwd=linked)
        self.assertEqual(added.returncode, 0, added.stderr)
        rejected = self.run_command('git', 'commit', '-qm', 'linked must fail', cwd=linked)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn('6000 UTF-16', rejected.stderr)


if __name__ == '__main__':
    unittest.main()
