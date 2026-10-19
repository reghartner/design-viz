"""Friends content selection keeps the portable authoring contract usable."""
import base64
import gzip
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import build
from folder_agent_kit import folder_agent_kit


class FriendsContentTest(unittest.TestCase):
    def test_friends_selection_and_source_free_authoring(self):
        with patch.dict(os.environ, {'FLOWVIEW_COMPANY_IDENTITY': '', 'FLOWVIEW_PACKAGES': '',
                                     'FLOWVIEW_PACKAGE_BASE': 'science,sports', 'FLOWVIEW_SITE_CONFIG': ''}):
            templates = build.package_templates()
            self.assertEqual([entry['source'] for entry in templates], ['starters/nsp15-insertion-evidence.json'])
            packed = folder_agent_kit(ROOT, build.canon_runtime())
            self.assertLessEqual(len(packed.encode('utf-8')), 8 * 1024 * 1024,
                                 'Actual full-runtime kit envelope must fit the existing folder-agent limit')
            envelope = json.loads(packed)
        raw = gzip.decompress(base64.b64decode(envelope['gzip']))
        files = json.loads(raw)['files']
        prefix = 'packages/science/'
        manifest = json.loads(files[prefix + 'package.json'])
        self.assertEqual([entry['source'] for entry in manifest['templates']], ['starters/nsp15-insertion-evidence.json'])
        self.assertEqual(set(manifest['kitFiles']), {path[len(prefix):] for path in files if path.startswith(prefix)})
        self.assertEqual({path for path in files if path.startswith(prefix) and path.endswith('.spec.json')},
                         {prefix + 'diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json'})
        self.assertNotIn(prefix + 'starters/copy-gate.json', files)
        self.assertNotIn(prefix + 'starters/sequencing-walkthrough.json', files)
        self.assertFalse(any(path.startswith('packages/physics/') for path in files))
        self.assertEqual((ROOT / 'diagrams/friends/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json').read_bytes(),
                         (ROOT / prefix / 'starters/nsp15-insertion-evidence.json').read_bytes())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, text in files.items():
                destination = root / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(text)
            self.assertFalse((root / 'src/panels').exists())
            validated = subprocess.run(['node', str(root / 'tools/validate.js'),
                                        str(root / prefix / 'starters/nsp15-insertion-evidence.json')],
                                       text=True, capture_output=True)
            self.assertEqual(validated.returncode, 0, validated.stderr + validated.stdout)
            self.assertIn('0 errors, 0 warnings', validated.stdout)
            for panel in manifest['routes']:
                packet = subprocess.run([sys.executable, str(root / 'tools/authoring-packet.py'),
                                         '--panel', panel, '--mode', 'edit'], text=True, capture_output=True)
                self.assertEqual(packet.returncode, 0, packet.stderr)
                self.assertIn(prefix + manifest['routes'][panel], packet.stdout)

    def test_identity_off_restores_all_science_content(self):
        with patch.dict(os.environ, {'FLOWVIEW_COMPANY_IDENTITY': 'off', 'FLOWVIEW_PACKAGES': 'science',
                                     'FLOWVIEW_PACKAGE_BASE': '', 'FLOWVIEW_SITE_CONFIG': ''}):
            self.assertEqual([entry['source'] for entry in build.package_templates()],
                             ['starters/copy-gate.json', 'starters/nsp15-insertion-evidence.json'])
            envelope = json.loads(folder_agent_kit(ROOT, '// test runtime'))
        files = json.loads(gzip.decompress(base64.b64decode(envelope['gzip'])))['files']
        for path in ('starters/copy-gate.json', 'starters/sequencing-walkthrough.json',
                     'examples/strand-cut/strand-cut.spec.json', 'diagrams/biology/copy-gate/copy-gate.spec.json'):
            self.assertIn('packages/science/' + path, files)
        self.assertEqual(files['packages/science/package.json'], (ROOT / 'packages/science/package.json').read_text())
