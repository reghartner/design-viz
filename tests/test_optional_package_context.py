"""The selected package must match what agents receive in the offline kit."""
import base64
import gzip
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from company_overlay import contract_text  # noqa: E402
from folder_agent_kit import folder_agent_kit  # noqa: E402


def kit_files():
    payload = json.loads(folder_agent_kit(ROOT, '// test runtime'))
    return json.loads(gzip.decompress(base64.b64decode(payload['gzip'])))['files']


def packet_for(panel):
    return subprocess.check_output(['python3', str(ROOT / 'tools/authoring-packet.py'),
                                    '--panel', panel, '--mode', 'edit'],
                                   text=True, stderr=subprocess.DEVNULL)


class OptionalPackageContextTest(unittest.TestCase):
    def test_default_agent_kit_and_packet_exclude_optional_material(self):
        with patch.dict(os.environ, {'FLOWVIEW_COMPANY_IDENTITY': 'off', 'FLOWVIEW_PACKAGES': ''}):
            files = kit_files()
            self.assertFalse(any(path.startswith(('packages/science/', 'packages/sports/')) for path in files))
            self.assertNotIn('tools/enabled-packages.json', files)
            contract = files['contract/authoring-contract.md']
            for name in ('wavefield', 'forcebody', 'rnacopy', 'sequence', 'frames', 'reads', 'locus', 'funnel', 'grid', 'strandscene', 'cellscene', 'seatmap'):
                self.assertNotIn('- `' + name + '` —', contract)
            self.assertNotIn('physics-panels.md', files['.claude/skills/hld-to-page/SKILL.md'])
            packet = packet_for('state')
            self.assertNotIn('packages/science/', packet)

    def test_selected_package_adds_contract_routes_and_examples(self):
        with patch.dict(os.environ, {'FLOWVIEW_COMPANY_IDENTITY': 'off', 'FLOWVIEW_PACKAGES': 'science'}):
            files = kit_files()
            self.assertEqual(json.loads(files['tools/enabled-packages.json']), ['science'])
            for path in ('packages/science/package.json',
                         'packages/science/cookbook/physics-panels.md',
                         'packages/science/cookbook/viral-copy-gate.md',
                         'packages/science/starters/copy-gate.json',
                         'packages/science/starters/waves-and-forces.json',
                         'packages/science/starters/sequencing-walkthrough.json',
                         'packages/science/cookbook/sequence-panels.md'):
                self.assertIn(path, files)
            contract = contract_text(ROOT)
            for name in ('wavefield', 'forcebody', 'rnacopy', 'sequence', 'frames', 'reads', 'locus', 'funnel', 'grid', 'strandscene', 'cellscene'):
                self.assertIn('- `' + name + '` —', contract)
                self.assertEqual(files['contract/authoring-contract.md'].count('- `' + name + '` —'), 1)
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for name in ('contract/authoring-contract.md', 'tools/company_overlay.py',
                             'tools/widget_doc.py', 'tools/enabled-packages.json'):
                    target = root / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(files[name])
                names = subprocess.check_output(['python3', str(root / 'tools/widget_doc.py'), '--list'], text=True)
                self.assertEqual(names.split().count('rnacopy'), 1)
            packet = packet_for('rnacopy')
            self.assertIn('packages/science/cookbook/viral-copy-gate.md', packet)
            self.assertNotIn('packages/science/cookbook/physics-panels.md', packet)


    def test_selected_sports_package_adds_venue_context_only(self):
        with patch.dict(os.environ, {'FLOWVIEW_COMPANY_IDENTITY': 'off', 'FLOWVIEW_PACKAGES': 'sports'}):
            files = kit_files()
            self.assertEqual(json.loads(files['tools/enabled-packages.json']), ['sports'])
            for path in ('packages/sports/package.json',
                         'packages/sports/cookbook/venue-map.md',
                         'packages/sports/examples/venue-map.spec.json'):
                self.assertIn(path, files)
            self.assertFalse(any(path.startswith('packages/science/') for path in files))
            contract = files['contract/authoring-contract.md']
            self.assertIn('- `seatmap` —', contract)
            self.assertNotIn('- `rnacopy` —', contract)
            packet = packet_for('seatmap')
            self.assertIn('packages/sports/cookbook/venue-map.md', packet)
            self.assertNotIn('packages/science/', packet)



if __name__ == '__main__':
    unittest.main()
