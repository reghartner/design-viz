"""Bundle the authoring skill and its local validators with the static editor."""
import base64
import gzip
import hashlib
import json
import subprocess
from pathlib import Path
try:
    from company_overlay import CONTRACT, AGENT_CONTEXT, ENABLED_PACKAGES, COMPANY_THEME, company_theme, company_agent_context, enabled_packages, contract_text, kit_examples
except ModuleNotFoundError:
    from tools.company_overlay import CONTRACT, AGENT_CONTEXT, ENABLED_PACKAGES, COMPANY_THEME, company_theme, company_agent_context, enabled_packages, contract_text, kit_examples


def folder_agent_kit(root, runtime):
    root = Path(root)
    files = {}
    context = company_agent_context(root)
    if context:
        files[AGENT_CONTEXT] = json.dumps(context, sort_keys=True) + '\n'
    packages = enabled_packages(root)
    theme = company_theme(root)
    if theme:
        # Portable tools need only the guidance path, not build inputs.
        files[COMPANY_THEME] = json.dumps({'guidance': theme.get('guidance')}) + '\n'
        if theme.get('guidance'):
            name = 'company/' + theme['guidance']
            files[name] = (root / name).read_text()
        for pattern in theme.get('kitFiles', []):
            matches = sorted(root.glob(pattern))
            if not matches:
                raise ValueError('Theme kitFiles pattern matches no files: ' + pattern)
            for path in matches:
                if path.is_file():
                    if not path.resolve().is_relative_to(root.resolve()):
                        raise ValueError('Theme kit file escapes repository: ' + str(path))
                    files[path.relative_to(root).as_posix()] = path.read_text()
    if packages:
        files[ENABLED_PACKAGES] = json.dumps(packages) + '\n'
    for directory, patterns in [('src/starters', ('*.json',)), ('contract', ('*.md',)),
                                 ('cookbook', ('*.md',)), ('docs', ('*.md',)),
                                 ('.claude/skills/hld-to-page', ('*.md', '*.py', '*.cjs'))]:
        for pattern in patterns:
            for path in sorted((root / directory).rglob(pattern)):
                relative = path.relative_to(root)
                if not any(part in ('node_modules', 'agents', 'research') for part in relative.parts):
                    files[relative.as_posix()] = path.read_text()
    for name in packages:
        directory = root / 'packages' / name
        manifest = json.loads((directory / 'package.json').read_text())
        if 'kitFiles' in manifest:
            for relative in manifest['kitFiles']:
                path = directory / relative
                if not path.is_file() or not path.resolve().is_relative_to(directory.resolve()):
                    raise ValueError('Invalid package kit file: ' + relative)
                files[path.relative_to(root).as_posix()] = path.read_text()
            continue
        for pattern in ('*.md', '*.json'):
            for path in sorted(directory.rglob(pattern)):
                if path.is_file():
                    files[path.relative_to(root).as_posix()] = path.read_text()
    # Company contract fragments travel inside the contract, never beside it.
    if (root / CONTRACT).is_file():
        files[CONTRACT] = contract_text(root)
    # Small maintained examples: upstream folders marked with .agent-kit, plus
    # every company/examples folder.
    for name in kit_examples(root):
        try:
            files[name] = (root / name).read_text()
        except UnicodeDecodeError as error:
            raise ValueError(name + ': the folder-agent kit bundles UTF-8 text only; '
                             'narrow the folder\'s .agent-kit globs') from error
    for name in ['LICENSE', 'tools/widget_doc.py', 'tools/company_overlay.py', 'tools/validate.js',
                 'tools/auto-arrange-spec.cjs', 'tools/authoring-packet.py', 'tools/visibility-check.cjs',
                 'tools/compatibility.js', 'tools/canon/core.cjs']:
        files[name] = (root / name).read_text()
    trace_cli = (root / 'tools/trace2spec.js').read_text()
    source_path = '../src/trace-import.js'
    if source_path not in trace_cli:
        raise ValueError('Trace CLI converter path changed; update the portable kit')
    files['tools/trace2spec.js'] = trace_cli.replace(source_path, 'trace-import.js')
    files['tools/trace-import.js'] = (root / 'src/trace-import.js').read_text()
    # Build from these sources; never depend on an existing generated file.
    files['tools/canon/generated-runtime.cjs'] = runtime
    # Source-free composition uses the same panel-owned layout descriptors.
    descriptors = subprocess.run(['node', str(root / 'tools/arrange/core.cjs')], check=True, capture_output=True, text=True).stdout
    files['tools/arrange/layouts.json'] = descriptors
    files['tools/compose-page-layout.cjs'] = (root / 'tools/compose-page-layout.cjs').read_text()
    for path in sorted((root / 'tools/arrange').iterdir()):
        if path.suffix in ('.cjs', '.json'):
            files[path.relative_to(root).as_posix()] = path.read_text()
    raw = json.dumps({'files': files}, sort_keys=True, ensure_ascii=True).encode()
    return json.dumps({'sha256': hashlib.sha256(raw).hexdigest(),
                       'gzip': base64.b64encode(gzip.compress(raw, mtime=0)).decode(),
                       'watcher': (root / 'tools/folder-agent.py').read_text()}, ensure_ascii=True).replace('<', '\\u003c')
