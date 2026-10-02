#!/usr/bin/env python3
"""Refresh the pinned, self-contained editor layout bundle from npm."""
import base64
import hashlib
import io
import tarfile
import urllib.request
from pathlib import Path

VERSION = '3.1.1'
INTEGRITY = 'zroZB1dFOFiGgv4Xcrn1DckB1o4aOikPqD2NDQPV0WM//CXGcS6xiD0rNkqHmw6FEg4tabt4nxPLwgCWT+Vb2A=='
url = f'https://registry.npmjs.org/@dagrejs/dagre/-/dagre-{VERSION}.tgz'
data = urllib.request.urlopen(url, timeout=30).read()
if base64.b64encode(hashlib.sha512(data).digest()).decode() != INTEGRITY:
    raise SystemExit('Dagre package integrity mismatch')
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as package:
    def read(name):
        return package.extractfile('package/' + name).read().decode()
    bundle = read('dist/dagre.min.js').split('/*! For license information')[0]
    legal = read('dist/dagre.min.js.LEGAL.txt')
    destination = Path(__file__).resolve().parents[1] / 'src/vendor/dagre'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'dagre.min.js').write_text(
        f'/* @dagrejs/dagre {VERSION}; includes @dagrejs/graphlib 4.0.5. See README.md. */\n' + legal + bundle)
    (destination / 'LICENSE').write_text(read('LICENSE'))
