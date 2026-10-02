#!/usr/bin/env python3
"""Verify pinned layout dependencies; --refresh reimports exact npm archives.

The committed license files/NOTICE record upstream source and build locations.
No package manager or network is required for ordinary builds.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

root = Path(__file__).resolve().parents[1] / 'src/workbench/vendor'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--refresh', action='store_true')
args = parser.parse_args()
manifest = json.loads((root / 'manifest.json').read_text())
for item in manifest['packages']:
    path = root / item['file']
    if args.refresh:
        archive = urllib.request.urlopen(item['tarball'], timeout=30).read()
        algorithm, expected = item['integrity'].split('-', 1)
        assert base64.b64encode(hashlib.new(algorithm, archive).digest()).decode() == expected, 'Archive integrity mismatch'
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as package:
            content = package.extractfile(item['member']).read()
        assert hashlib.sha256(content).hexdigest() == item['sha256'], 'Bundle integrity mismatch'
        path.write_bytes(content)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256'], str(path) + ': checksum mismatch'
for name, expected in manifest['licenses'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name + ': checksum mismatch'
print('Verified pinned Viz.js 3.31.0, WebCola 3.4.0 and component licenses.')
