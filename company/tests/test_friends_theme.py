"""Friends-owned guidance and stories survive a source-free offline kit."""
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

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from folder_agent_kit import folder_agent_kit  # noqa: E402


def kit_files():
    payload = json.loads(folder_agent_kit(ROOT, '// test runtime'))
    return json.loads(gzip.decompress(base64.b64decode(payload['gzip'])))['files']


def packet_for(panel):
    return subprocess.check_output(['python3', str(ROOT / 'tools/authoring-packet.py'),
                                    '--panel', panel, '--mode', 'edit'],
                                   text=True, stderr=subprocess.DEVNULL)


class FriendsThemeContextTest(unittest.TestCase):
    def test_friends_theme_guidance_and_resources_survive_portable_packet(self):
        with patch.dict(os.environ, {'FLOWVIEW_COMPANY_IDENTITY': '', 'FLOWVIEW_PACKAGES': '',
                                     'FLOWVIEW_PACKAGE_BASE': 'sports', 'FLOWVIEW_SITE_CONFIG': ''}):
            files = kit_files()
            guidance = 'company/themes/islanders/authoring.md'
            self.assertTrue(guidance in files, 'Friends theme guidance missing from kit')
            self.assertIn('Friends appearance', files['contract/authoring-contract.md'])
            self.assertTrue('packages/sports/diagrams/islanders-marketing/islanders-marketing.spec.json' in files, 'Friends marketing story missing from kit')
            self.assertIn('Friends appearance', packet_for('seatmap'))
            with tempfile.TemporaryDirectory() as directory:
                kit = Path(directory)
                for name, content in files.items():
                    destination = kit / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_text(content)
                packet = subprocess.check_output(['python3', str(kit / 'tools/authoring-packet.py'),
                                                   '--panel', 'seatmap', '--mode', 'edit'],
                                                  text=True, stderr=subprocess.DEVNULL)
                self.assertIn('Friends appearance', packet)
                self.assertEqual(packet.count('## Friends appearance'), 1)
