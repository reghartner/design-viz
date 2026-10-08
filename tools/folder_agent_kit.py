"""Bundle the authoring skill and its local validators with the static editor."""
import base64
import gzip
import hashlib
import json
import subprocess
from pathlib import Path


def native_payload(root):
    """Build the native bundle and retain Node's actionable failure details."""
    command = ['node', str(Path(root) / 'tools/arrange/build-payload.cjs')]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Native measurement payload build failed:\n' + result.stderr.strip())
    return result.stdout


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
                 'tools/compatibility.js', 'tools/canon/core.cjs']:
        files[name] = (root / name).read_text()
    trace_cli = (root / 'tools/trace2spec.js').read_text()
    source_path = '../src/trace-import.js'
    if source_path not in trace_cli:
        raise ValueError('Trace CLI converter path changed; update the portable kit')
    files['tools/trace2spec.js'] = trace_cli.replace(source_path, 'trace-import.js')
    files['tools/trace-import.js'] = (root / 'src/trace-import.js').read_text()
    for name in ['viz-3.31.0.js', 'webcola-3.4.0.js']:
        files['tools/auto-arrange/vendor/' + name] = (root / 'src/workbench/vendor' / name).read_text()
    # Build from these sources; never depend on an existing generated file.
    files['tools/canon/generated-runtime.cjs'] = runtime
    # Browser-backed measured arrangement remains developer tooling in the
    # checkout. The portable kit ships the pure Node graph arranger and validators.
    raw = json.dumps({'files': files}, sort_keys=True, ensure_ascii=True).encode()
    return json.dumps({'sha256': hashlib.sha256(raw).hexdigest(),
                       'gzip': base64.b64encode(gzip.compress(raw, mtime=0)).decode(),
                       'watcher': (root / 'tools/folder-agent.py').read_text()}, ensure_ascii=True).replace('<', '\\u003c')
