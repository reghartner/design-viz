#!/usr/bin/env python3
"""Build four linked demo documents for a chosen HTTP(S) hosting location."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PLACEHOLDER = 'https://diagrams.example.com/diagram-handoffs/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True, help='Public directory URL where these HTML files will be served')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    base = args.base_url.rstrip('/') + '/'
    url = urlsplit(base)
    if url.scheme not in ('http', 'https') or not url.netloc or url.username or url.password or url.query or url.fragment:
        parser.error('--base-url must be an HTTP(S) directory URL without credentials, query or fragment')
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='flowview-handoffs-') as tmp:
        for name in ('overview', 'push', 'lake', 'action'):
            def relocate(value):
                if isinstance(value, str):
                    return value.replace(PLACEHOLDER, base)
                if isinstance(value, dict):
                    return {key: relocate(item) for key, item in value.items()}
                if isinstance(value, list):
                    return [relocate(item) for item in value]
                return value
            spec = Path(tmp) / (name + '.json')
            source = ROOT / 'src/starters/diagram-handoffs.json' if name == 'overview' else HERE / (name + '.spec.json')
            spec.write_text(json.dumps(relocate(json.loads(source.read_text()))))
            subprocess.run(['node', str(ROOT / 'tools/validate.js'), str(spec)], check=True)
            subprocess.run(['python3', str(ROOT / 'tools/inject.py'), str(spec), str(ROOT / 'template/flowview.html'), str(args.out / (name + '.html'))], check=True)


if __name__ == '__main__':
    main()
