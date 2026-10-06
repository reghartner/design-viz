"""Bundle the authoring skill and its local validators with the static editor."""
import base64
import gzip
import hashlib
import json
from pathlib import Path


def folder_agent_kit(root, runtime):
    root = Path(root)
    files = {}
    for directory, patterns in [('src/starters', ('*.json',)), ('contract', ('*.md',)),
                                 ('cookbook', ('*.md',)), ('docs', ('*.md',)),
                                 ('.claude/skills/hld-to-page', ('*.md', '*.py', '*.cjs'))]:
        for pattern in patterns:
            for path in sorted((root / directory).rglob(pattern)):
                relative = path.relative_to(root)
                if not any(part in ('node_modules', 'agents', 'research') for part in relative.parts):
                    files[relative.as_posix()] = path.read_text()
    for name in ['LICENSE', 'tools/widget_doc.py', 'tools/validate.js',
                 'tools/auto-arrange-spec.cjs',
                 'tools/trace2spec.js', 'src/trace-import.js',
                 'tools/compatibility.js', 'tools/canon/core.cjs']:
        files[name] = (root / name).read_text()
    for name in ['viz-3.31.0.js', 'webcola-3.4.0.js']:
        files['tools/auto-arrange/vendor/' + name] = (root / 'src/workbench/vendor' / name).read_text()
    # Build from these sources; never depend on an existing generated file.
    files['tools/canon/generated-runtime.cjs'] = runtime
    raw = json.dumps({'files': files}, sort_keys=True, ensure_ascii=True).encode()
    return json.dumps({'sha256': hashlib.sha256(raw).hexdigest(),
                       'gzip': base64.b64encode(gzip.compress(raw, mtime=0)).decode(),
                       'watcher': (root / 'tools/folder-agent.py').read_text()}, ensure_ascii=True).replace('<', '\\u003c')
