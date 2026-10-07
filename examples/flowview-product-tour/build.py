#!/usr/bin/env python3
"""Regenerate the portable tour with its presentation-only framing."""

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "flowview-product-tour.html"

subprocess.run(
    [
        sys.executable,
        str(ROOT / "tools/inject.py"),
        str(HERE / "flowview-product-tour.spec.json"),
        str(ROOT / "template/flowview.html"),
        str(OUTPUT),
    ],
    check=True,
)

html = OUTPUT.read_text()
style = (HERE / "presentation.css").read_text()
marker = '<script type="application/json" id="flowspec">'
assert html.count(marker) == 1
html = html.replace(marker, f"<style>\n{style}</style>\n{marker}", 1)
OUTPUT.write_text(html)
