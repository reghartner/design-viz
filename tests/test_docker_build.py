"""Exercise the Docker source stage without relying on local generated files."""
import base64
import gzip
import json
from pathlib import Path
import re
import runpy
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class DockerSourceBuildTests(unittest.TestCase):
    def test_native_payload_failure_reports_the_missing_module(self):
        build = runpy.run_path(str(ROOT / 'tools/folder_agent_kit.py'))['native_payload']
        with tempfile.TemporaryDirectory(prefix='flowview-missing-payload-') as temporary:
            with self.assertRaisesRegex(RuntimeError, r"(?s)Cannot find module .*tools/arrange/build-payload.cjs"):
                build(temporary)

    def test_actual_copy_inputs_build_complete_portable_authoring_kit(self):
        tracked = set(subprocess.check_output(
            ['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0'))
        with tempfile.TemporaryDirectory(prefix='flowview-docker-source-') as temporary:
            context = Path(temporary)
            stages = 0
            # Follow the actual build-stage COPY declarations, including globs
            # and directory contents. Only tracked inputs are eligible: an old
            # generated runtime or local dependency must not rescue this test.
            for line in (ROOT / 'deploy/workbench/Dockerfile').read_text().splitlines():
                if line.startswith('FROM '):
                    stages += 1
                    if stages > 1:
                        break
                if not line.startswith('COPY '):
                    continue
                *sources, destination = shlex.split(line)[1:]
                for pattern in sources:
                    matches = list(ROOT.glob(pattern))
                    self.assertTrue(matches, pattern)
                    for source in matches:
                        files = list(source.rglob('*')) if source.is_dir() else [source]
                        for file in files:
                            if not file.is_file() or file.relative_to(ROOT).as_posix() not in tracked:
                                continue
                            relative = file.relative_to(source) if source.is_dir() else Path(file.name)
                            target = context / destination
                            if source.is_dir() or destination.endswith('/'):
                                target /= relative
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copyfile(file, target)
            self.assertFalse((context / 'tools/arrange/generated-native.html').exists())
            self.assertFalse((context / 'tools/canon/generated-runtime.cjs').exists())
            result = subprocess.run([sys.executable, 'tools/build.py'], cwd=context,
                                    capture_output=True, text=True, timeout=90)
            self.assertEqual(result.returncode, 0, result.stderr)
            html = (context / 'workbench/flowspec.html').read_text()
            match = re.search(r'<script type="application/json" id="flowview-folder-kit">(.*?)</script>', html, re.S)
            self.assertIsNotNone(match)
            envelope = json.loads(match.group(1))
            files = json.loads(gzip.decompress(base64.b64decode(envelope['gzip'])))['files']
            self.assertNotIn('tools/arrange-spec.cjs', files)
            self.assertFalse(any(name.startswith('tools/arrange/') for name in files))
            self.assertTrue((context / 'tools/arrange/generated-native.html').is_file())
            self.assertIn('window.arrangementNative', (context / 'tools/arrange/generated-native.html').read_text())
            self.assertIn('module.exports', files['tools/canon/generated-runtime.cjs'])
            self.assertFalse(any('node_modules' in name or name.endswith('package.json') or
                                 name.endswith('package-lock.json') for name in files))


if __name__ == '__main__':
    unittest.main()
