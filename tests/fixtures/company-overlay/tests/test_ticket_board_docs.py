"""A company Python test: tests/test_company_overlay.py runs it in the normal suite."""
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class TicketBoardDocs(unittest.TestCase):
    def test_company_overlay_fixture_panel_doc_is_extractable(self):
        out = subprocess.run([sys.executable, str(ROOT / 'tools/widget_doc.py'), 'ticket-board'],
                             capture_output=True, text=True, check=True).stdout
        self.assertIn('- `ticket-board` — closed tickets out of a fixed total.', out)
