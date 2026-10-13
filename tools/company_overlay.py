"""Fork-owned company overlay: discovery shared by the build, kit and agent tools.

Upstream ships only company/README.md. A fork keeps its additions there:

  company/panels/*.js, company/panels/types/*.js   bundled by tools/source-loader.cjs
  company/contract/*.md                             appended to the authoring contract
  company/examples/**                               bundled into the folder-agent kit
  company/tests/*.test.js, company/tests/test_*.py  run by the normal test suites
  company/CHANGELOG.md                              fork release notes

Nothing here requires a list edit; an absent overlay adds nothing.
"""
import posixpath
import re
from pathlib import Path

CONTRACT = 'contract/authoring-contract.md'
CONTRACT_ADDITIONS = '## Company contract additions'
# Upstream examples join the offline kit by carrying this marker; each line is a
# file glob, matched in the marker's folder and below. Company example folders
# always join: with a marker, its globs; without one, COMPANY_EXAMPLE_PATTERNS.
# The kit is a text bundle, so every selected file must be UTF-8 text.
KIT_MARKER = '.agent-kit'
COMPANY_EXAMPLE_PATTERNS = ('*.md', '*.json')
SKIPPED_PARTS = ('node_modules',)
MARKDOWN_LINK = re.compile(r'(!?\[[^\n\]]*\]\()(<[^>\n]+>|[^()\s]+)(\s+"[^"\n]*")?(\))')


def company_dir(root):
    return Path(root) / 'company'


def contract_fragments(root):
    """[(repository-relative path, text)] in file-name order."""
    directory = company_dir(root) / 'contract'
    if not directory.is_dir():
        return []
    return [(path.relative_to(root).as_posix(), path.read_text())
            for path in sorted(directory.glob('*.md')) if path.is_file()]


def _relink(text, source, target):
    """Keep a fragment's relative links valid once its text lives in target."""
    def destination(value):
        angled = value.startswith('<') and value.endswith('>')
        raw = value[1:-1] if angled else value
        if not raw or raw.startswith('#') or raw.startswith('/') or raw.startswith('//') \
                or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', raw):
            return value
        path, marker, fragment = raw.partition('#')
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source), path))
        moved = posixpath.relpath(resolved, posixpath.dirname(target)) + marker + fragment
        return '<' + moved + '>' if angled else moved
    lines, fence = [], False
    for line in text.splitlines():
        if line.lstrip().startswith('```'):
            fence = not fence
        elif not fence:
            line = MARKDOWN_LINK.sub(lambda m: m[1] + destination(m[2]) + (m[3] or '') + m[4], line)
        lines.append(line)
    return '\n'.join(lines)


def contract_text(root):
    """The authoring contract with the overlay's fragments appended, in order."""
    root = Path(root)
    text = (root / CONTRACT).read_text()
    fragments = contract_fragments(root)
    if not fragments:
        return text
    parts = [text.rstrip('\n'), '', CONTRACT_ADDITIONS, '',
             'These sections come from the company overlay (`company/contract/`). '
             'They extend this contract for this fork and follow its rules.']
    for path, fragment in fragments:
        parts += ['', '<!-- ' + path + ' -->', _relink(fragment, path, CONTRACT).strip('\n')]
    return '\n'.join(parts) + '\n'


def _example_files(root, directory, patterns):
    files = set()
    for pattern in patterns:
        for path in directory.rglob(pattern):
            relative = path.relative_to(root)
            if path.is_file() and path.name != KIT_MARKER and \
                    not any(part in SKIPPED_PARTS for part in relative.parts):
                files.add(relative.as_posix())
    return files


def _marked(root, directory):
    """{marker folder: its globs} below directory."""
    marked = {}
    for marker in sorted(directory.rglob(KIT_MARKER)):
        if any(part in SKIPPED_PARTS for part in marker.relative_to(root).parts):
            continue
        patterns = [line.strip() for line in marker.read_text().splitlines()
                    if line.strip() and not line.lstrip().startswith('#')]
        if not patterns:
            raise ValueError(marker.relative_to(root).as_posix() + ': list at least one file glob')
        marked[marker.parent] = patterns
    return marked


def kit_examples(root):
    """Sorted example files for the folder-agent kit: upstream folders marked
    with .agent-kit, plus every company example folder."""
    root = Path(root)
    files = set()
    for folder, patterns in _marked(root, root / 'examples').items():
        found = _example_files(root, folder, patterns)
        if not found:
            raise ValueError((folder / KIT_MARKER).relative_to(root).as_posix() + ': globs match no files')
        files |= found
    examples = company_dir(root) / 'examples'
    if examples.is_dir():
        marked = _marked(root, examples)
        for folder, patterns in marked.items():
            files |= _example_files(root, folder, patterns)
        # Unmarked company folders use the default text patterns.
        files |= {name for name in _example_files(root, examples, COMPANY_EXAMPLE_PATTERNS)
                  if not any((root / name).is_relative_to(folder) for folder in marked)}
    return sorted(files)
