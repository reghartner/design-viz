#!/usr/bin/env python3
"""Prepare anonymous authoring packets, then explicitly run three read-only Codex judges.

Example (preparation does not invoke any model):
  python3 tools/agent-authoring-judge.py --prepare --runs-root .local/authors --output .local/judges
  python3 tools/agent-authoring-judge.py --run-judges --prepared .local/judges

The frozen 100-point rubric is passed unchanged on stdin. `--prepare --profile v2`
(or `v3`, `v4`) instead freezes a versioned review profile (rubric plus interpretations)
into the preparation; judging always uses the prepared selection, and v3 and v4 reviews
also have their correctness deduction rows validated. Profiled candidates
get headline scores only with complete captures (a validated `visual/manifest.json`)
and no deferred findings or unscored presentation. Run mappings, scores,
and raw judge output stay outside each packet. This is unlabelled evaluation,
not a claim of perfect blinding or a filesystem confidentiality boundary.
"""

import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import pathlib
import re
import statistics
import subprocess
import sys
import time
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_BUNDLE = ROOT / 'tests/fixtures/authoring-evaluation/overnight'
RUBRIC_SHA256 = 'c740ac21b34aae930203dfd1b40afa8bd5dfd5c271a7f868c6762daa502870a9'
CAPS = {'questions': 10, 'level': 10, 'time': 20, 'edges': 15,
        'panels': 15, 'backstage': 15, 'fidelity': 15}
JUDGES = 3
MODEL = 'gpt-5.6-sol'
REASONING = 'medium'
TIMEOUT_SECONDS = 600
RUN_FILES = {
    'final.spec.json': 'candidate/story.spec.json',
    'questions-phase1.md': 'candidate/questions.md',
    'story.ledger.md': 'candidate/story.ledger.md',
    'final-reply.md': 'candidate/final-report.md',
    'operator-answers.md': 'brief/answers.md',
}
BUNDLE_FILES = {
    'input/hld.md': 'brief/hld.md',
    'input/catalog.json': 'brief/catalog.json',
    'input/code-evidence.md': 'brief/code-evidence.md',
    'judge-only/facts.md': 'brief/facts.md',
}
# Versioned review profiles. The legacy judge2 rubric (v1) stays the default.
# Each profile is pinned by its manifest hash; the manifest pins its files.
# `correctnessRows` profiles also have every correctness deduction row validated.
PROFILES = {'v2': {'id': 'authoring-review-v2',
                   'directory': ROOT / 'tests/fixtures/authoring-evaluation/review-v2',
                   'manifestSha256': '0632d7004bf47d553624b8a97341987ed85ae4cc68ba8f40e07736f0b2f01ec7'},
            'v3': {'id': 'authoring-review-v3',
                   'directory': ROOT / 'tests/fixtures/authoring-evaluation/review-v3',
                   'manifestSha256': '22bda3abb270fb9c6e5e7f3fa64f5bdfe86752efa1ed970167b940c198794949',
                   'correctnessRows': True},
            'v4': {'id': 'authoring-review-v4',
                   'directory': ROOT / 'tests/fixtures/authoring-evaluation/review-v4',
                   'manifestSha256': '2328761e335a824d1b0617758d8ef0d822dc9f645209b332b74b9760d71e6f2a',
                   'correctnessRows': True}}
PROFILE_FILES = ('rubric.md', 'interpretations.json')
PROFILE_SEPARATOR = b'\n--- interpretations.json ---\n'
# The September 30 presentation assessment: five 1-5 dimensions, total of 25.
PRESENTATION = ('clarity', 'hierarchy', 'visibleEvidence', 'legibility', 'interaction')
PROFILE_COUNTS = {'rendererIssues': 'renderer', 'deferredFindings': 'deferred'}
# A structured `renderer`/`deferred` row, optionally as a list item.
ISSUE_ROW = re.compile(r'(?im)^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+|\|[ \t]*)?`?(renderer|deferred)`?[ \t]*\|(.*)$')
# Every deduction amount the rubric lists, per criterion (v3 correctness rows).
DEDUCTIONS = {'questions': (1, 2, 3, 10), 'level': (2,), 'time': (2, 3, 4, 5), 'edges': (2,),
              'panels': (2, 3), 'backstage': (1, 2, 3, 5), 'fidelity': (3, 4, 5)}
SEPARATE_ROWS = ('presentation', 'renderer', 'deferred')
# Any `name | ...` line, with the same optional list or table prefix as ISSUE_ROW.
NAMED_ROW = re.compile(r'(?m)^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+|\|[ \t]*)?`?([A-Za-z][A-Za-z0-9 _-]{0,59}?)`?[ \t]*\|(.*)$')
DEDUCTION = re.compile('[-−]([1-9][0-9]*)')
SIGNED_INTEGER = re.compile('[-+−]?[0-9]+')
# The controlled capture procedure (logical viewports; full-page, scale 1), as on September 30.
CAPTURE_PROCEDURE = {'viewports': [{'id': 'desktop', 'width': 1440, 'height': 1000},
                                   {'id': 'narrow', 'width': 800, 'height': 1000}],
                     'deviceScaleFactor': 1, 'fullPage': True}
VISUAL_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png')
SHA256 = re.compile(r'[0-9a-f]{64}')
METRICS = {'questionsFile', 'questionCount', 'ledger', 'html', 'buildOk',
           'buildWarnings', 'diagrams', 'boundNodes', 'codeRefNodes', 'codeRefSteps',
           'totalSteps', 'emptySteps', 'edgeSteps', 'codeEvidenceUsed'}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def strict_json(value):
    def unique(pairs):
        result = {}
        for key, item in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key: ' + key)
            result[key] = item
        return result

    def invalid_constant(value):
        raise ValueError('Non-finite JSON number: ' + value)

    return json.loads(value, object_pairs_hook=unique, parse_constant=invalid_constant)


def regular_bytes(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Missing regular input file: ' + path.name)
    value = path.read_bytes()
    if not value.strip():
        raise ValueError('Empty input file: ' + path.name)
    value.decode('utf-8')
    return value


def write_bytes(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(value)


def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2, allow_nan=False) + '\n').encode())


def load_bundle(bundle):
    manifest = strict_json(regular_bytes(bundle / 'manifest.json'))
    frozen = {item['path']: item['sha256'] for item in manifest['files']}
    names = [*BUNDLE_FILES, 'judge-only/judge2-prompt.md']
    data = {}
    for name in names:
        value = regular_bytes(bundle / name)
        if frozen.get(name) != digest(value):
            raise ValueError('Frozen bundle hash mismatch: ' + name)
        data[name] = value
    if digest(data['judge-only/judge2-prompt.md']) != RUBRIC_SHA256:
        raise ValueError('The rubric is not the frozen 100-point judge2 checklist.')
    return data


def load_profile(name):
    """Verify a versioned review profile and compose its exact reviewer prompt."""
    spec = PROFILES.get(name)
    if spec is None:
        raise ValueError('Unknown review profile: ' + str(name))
    directory = pathlib.Path(spec['directory'])
    raw = regular_bytes(directory / 'manifest.json')
    if digest(raw) != spec['manifestSha256']:
        raise ValueError('Review profile manifest is not the frozen ' + spec['id'] + ' manifest.')
    manifest = strict_json(raw)
    files = {item['path']: item['sha256'] for item in manifest['files']}
    if manifest.get('profile') != spec['id'] or len(files) != len(manifest['files']) \
            or set(files) != set(PROFILE_FILES):
        raise ValueError('Review profile manifest must list exactly its guidance files.')
    guidance = {}
    for path in PROFILE_FILES:
        value = regular_bytes(directory / path)
        if digest(value) != files[path]:
            raise ValueError('Review profile hash mismatch: ' + path)
        guidance[path] = value
    strict_json(guidance['interpretations.json'])
    # The rubric loads its interpretations; both reach the reviewer on stdin.
    prompt = guidance['rubric.md'].rstrip(b'\n') + b'\n' + PROFILE_SEPARATOR + guidance['interpretations.json']
    record = {'name': name, 'id': spec['id'], 'manifestSha256': digest(raw),
              'guidanceSha256': {path: digest(value) for path, value in guidance.items()},
              'promptSha256': digest(prompt)}
    return record, prompt


def spec_sections(spec):
    """Sections in renderer order, using the canonical traversal in tools/spec_diff.py."""
    global SPEC_DIFF
    if SPEC_DIFF is None:
        loader = importlib.util.spec_from_file_location('flowview_spec_diff', ROOT / 'tools/spec_diff.py')
        module = importlib.util.module_from_spec(loader)
        sys.modules[loader.name] = module  # dataclasses resolve their module while loading
        loader.loader.exec_module(module)
        SPEC_DIFF = module
    return SPEC_DIFF.iter_sections(spec)


SPEC_DIFF = None


def required_views(spec):
    """Every (section path, path id, step id) the captures must show, in page order.

    Sections come from a bare diagram, page `sections`, or `blocks`, including
    `blocks[].tabs[].sections[]`. A diagram without `paths` is one path named `main`."""
    views = []
    for ref in spec_sections(spec):
        diagram = ref.diagram
        if diagram is None:
            continue
        paths = [path for path in diagram.get('paths') or [] if isinstance(path, dict)]
        if not paths:
            steps = [step for step in diagram.get('steps') or [] if isinstance(step, dict)]
            paths = [{'id': 'main', 'steps': [step.get('id', str(i)) for i, step in enumerate(steps)]}]
        for path in paths:
            for step in path.get('steps') or []:
                key = (ref.path, str(path.get('id')), str(step))
                if key not in views:
                    views.append(key)
    return views


def png_size(value, name):
    """Width and height of a structurally valid PNG: IHDR first, CRCs, IDAT, IEND."""
    if not value.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Visual capture is not a PNG: ' + name)
    offset, kinds, header = 8, [], None
    while offset < len(value):
        if offset + 12 > len(value):
            raise ValueError('Visual capture PNG is truncated: ' + name)
        length = int.from_bytes(value[offset:offset + 4], 'big')
        kind, end = value[offset + 4:offset + 8], offset + 12 + length
        data = value[offset + 8:end - 4]
        if end > len(value) or zlib.crc32(kind + data) != int.from_bytes(value[end - 4:end], 'big'):
            raise ValueError('Visual capture PNG has a damaged chunk: ' + name)
        if not kinds:
            header = data
        kinds.append(kind)
        offset = end
        if kind == b'IEND':
            break
    if offset != len(value) or not kinds or kinds[0] != b'IHDR' or len(header) != 13 \
            or kinds[-1] != b'IEND' or b'IDAT' not in kinds:
        raise ValueError('Visual capture is not a complete PNG: ' + name)
    width, height = int.from_bytes(header[:4], 'big'), int.from_bytes(header[4:8], 'big')
    if not width or not height:
        raise ValueError('Visual capture PNG has no pixels: ' + name)
    return width, height


def visual_evidence(run, spec, source_hash):
    """Validate optional rendered captures against their manifest and the accepted source.

    Returns (packet summary, capture bytes). Captures must follow CAPTURE_PROCEDURE;
    the logical viewport is coordinator metadata, since a full-page PNG can be taller
    (and, with overflow, wider) than its viewport. Status is `complete` only when
    every required step view has a capture at both viewports; otherwise `partial`,
    or `missing` without a `visual/` folder. Loose files are never evidence."""
    folder = run / 'visual'
    if not folder.exists() and not folder.is_symlink():
        return {'status': 'missing', 'captures': []}, {}
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('Visual evidence must be a regular directory.')
    manifest = strict_json(regular_bytes(folder / 'manifest.json'))
    if not isinstance(manifest, dict) or manifest.get('sourceSha256') != source_hash:
        raise ValueError('Visual evidence was not captured from the accepted source.')
    renderer = manifest.get('rendererSha256')
    if not isinstance(renderer, str) or not SHA256.fullmatch(renderer):
        raise ValueError('Visual evidence must record rendererSha256.')
    if manifest.get('procedure') != CAPTURE_PROCEDURE:
        raise ValueError('Visual evidence must use the controlled capture procedure.')
    viewports = {view['id']: view for view in CAPTURE_PROCEDURE['viewports']}
    sections = [ref.path for ref in spec_sections(spec) if ref.diagram is not None]
    captures, files = [], {}
    for item in manifest.get('captures') or []:
        name = item.get('file') if isinstance(item, dict) else None
        if not isinstance(name, str) or not VISUAL_NAME.fullmatch(name) or name in files:
            raise ValueError('Visual captures need unique plain .png file names.')
        if item.get('viewport') not in viewports or item.get('diagram') not in sections:
            raise ValueError('Visual capture names an unknown viewport or diagram section: ' + name)
        path = folder / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing visual capture: ' + name)
        value = path.read_bytes()
        width, height = png_size(value, name)
        view = viewports[item['viewport']]
        if width < view['width'] or height < view['height']:
            raise ValueError('Visual capture is smaller than its full-page viewport: ' + name)
        files[name] = value
        captures.append({'file': 'candidate/visual/' + name, 'viewport': item['viewport'],
                         'diagram': item['diagram'], 'path': str(item.get('path')),
                         'step': str(item.get('step')), 'pngWidth': width, 'pngHeight': height,
                         'sha256': digest(value)})
    if {path.name for path in folder.iterdir()} != {'manifest.json', *files}:
        raise ValueError('Visual evidence contains files its manifest does not list.')
    required = required_views(spec)
    shown = {(item['viewport'], item['diagram'], item['path'], item['step']) for item in captures}
    uncovered = ['{}: {} path {} step {}'.format(view, *key)
                 for key in required for view in viewports if (view, *key) not in shown]
    return {'status': 'complete' if required and not uncovered else 'partial',
            'sourceSha256': source_hash, 'rendererSha256': renderer, 'procedure': CAPTURE_PROCEDURE,
            'requiredViews': len(required) * len(viewports), 'captures': captures,
            'uncovered': uncovered}, files


def clean_mechanical(value, run, source_hash):
    """Keep historical mechanical findings, excluding workflow and score metadata."""
    if not isinstance(value, dict) or not isinstance(value.get('metrics'), dict):
        raise ValueError('Mechanical check must contain metrics.')
    for key in ['sourceSha256', 'specSha256', 'acceptedSourceSha256']:
        if key in value and value[key] != source_hash:
            raise ValueError('Mechanical check does not match the accepted source: ' + key)
    metrics = {key: item for key, item in value['metrics'].items()
               if key in METRICS or key.startswith(('battery:', 'field:', 'clock:'))}
    problems = value.get('problems', [])
    if not isinstance(problems, list) or any(
            not isinstance(item, dict) or not isinstance(item.get('kind'), str)
            or not isinstance(item.get('msg'), str) for item in problems):
        raise ValueError('Mechanical problems must contain kind and msg strings.')
    # Build diagnostics can include the input pathname. Keep the diagnostic,
    # replacing only identifying file locations, not authored story content.
    locations = {str(run)}
    source_path = value.get('spec')
    if isinstance(source_path, str) and source_path:
        parent = pathlib.Path(source_path).parent
        if parent.is_absolute() and parent.resolve() == run.resolve():
            locations.add(str(parent))

    def neutral(text):
        if isinstance(source_path, str) and source_path:
            text = text.replace(source_path, 'candidate/story.spec.json')
        for location in sorted(locations, key=len, reverse=True):
            text = text.replace(location, 'candidate')
        return text

    def neutral_values(item):
        if isinstance(item, str):
            return neutral(item)
        if isinstance(item, list):
            return [neutral_values(child) for child in item]
        if isinstance(item, dict):
            return {key: neutral_values(child) for key, child in item.items()}
        return item
    result = {'problems': [{'kind': item['kind'], 'msg': neutral(item['msg'])}
                           for item in problems], 'metrics': neutral_values(metrics)}
    if isinstance(value.get('problemCounts'), dict):
        result['problemCounts'] = value['problemCounts']
    return result


def packet_hashes(packet):
    hashes = {}
    for path in sorted(packet.rglob('*')):
        if path.is_symlink():
            raise ValueError('A packet contains a symlink.')
        if path.is_file():
            hashes[path.relative_to(packet).as_posix()] = digest(path.read_bytes())
    return hashes


def prepare(bundle, runs_root, output, run_names, profile='v1'):
    bundle = pathlib.Path(bundle).resolve()
    runs_root = pathlib.Path(runs_root).resolve()
    output = pathlib.Path(output).resolve()
    frozen = load_bundle(bundle)
    review, prompt = (None, None) if profile == 'v1' else load_profile(profile)
    if not run_names:
        run_names = sorted(path.name for path in runs_root.iterdir()
                           if re.fullmatch(r'run-\d+', path.name))
    if not run_names or len(set(run_names)) != len(run_names) or any(
            not re.fullmatch(r'run-\d+', name) for name in run_names):
        raise ValueError('Select unique run-N directories.')
    output.mkdir(parents=True, exist_ok=False)
    write_bytes(output / '.gitignore', b'*\n')
    rubric = frozen['judge-only/judge2-prompt.md']
    if review is None:
        write_bytes(output / 'rubric.md', rubric)
    else:
        write_bytes(output / 'reviewer-prompt.md', prompt)
    records = []
    for name in run_names:
        run = runs_root / name
        anonymous = 'candidate-' + digest(name.encode())[:12]
        record = {'candidateId': anonymous, 'run': str(run), 'status': 'incomplete'}
        try:
            if run.is_symlink() or not run.is_dir():
                raise ValueError('Missing regular run directory: ' + name)
            inputs = {key: regular_bytes(run / key) for key in RUN_FILES}
            source = inputs['final.spec.json']
            spec = strict_json(source)
            if not isinstance(spec, dict):
                raise ValueError('Accepted final.spec.json must contain an object.')
            mechanical = regular_bytes(run / 'mechanical-check.json')
            source_hash = digest(source)
            check = clean_mechanical(strict_json(mechanical), run, source_hash)
            evidence, visual = visual_evidence(run, spec, source_hash) if review else (None, {})
            packet = output / 'packets' / anonymous
            for name_in_bundle, destination in BUNDLE_FILES.items():
                write_bytes(packet / destination, frozen[name_in_bundle])
            for name_in_run, destination in RUN_FILES.items():
                write_bytes(packet / destination, inputs[name_in_run])
            write_json(packet / 'candidate/mechanical-check.json', check)
            if review:
                write_json(packet / 'review/profile.json', review)
                write_json(packet / 'candidate/visual-evidence.json', evidence)
                for key, value in visual.items():
                    write_bytes(packet / 'candidate/visual' / key, value)
            record.update(status='ready', sourceSha256=source_hash,
                          inputSha256={key: digest(value) for key, value in inputs.items()},
                          mechanicalSha256=digest(mechanical), packetSha256=packet_hashes(packet))
            if review:
                record['visualEvidence'] = evidence
        except (OSError, ValueError, KeyError, TypeError) as error:
            record['error'] = str(error)
        records.append(record)
    manifest = {'version': 1, 'bundle': str(bundle), 'rubricSha256': digest(rubric),
                'model': MODEL, 'reasoningEffort': REASONING, 'judgmentsRequired': JUDGES,
                'blinding': 'Unlabelled packets; author style/content may reveal method. Not perfect blinding.',
                'runs': records}
    if review:
        del manifest['rubricSha256']
        manifest.update(version=2, profile=review)
    write_json(output / 'mapping.json', manifest)
    return manifest


def parse_score(text, profiled=False, profile=None):
    """Require the exact final fenced object, criterion caps, and its actual sum.

    `profile` names a review profile ('v2', 'v3', 'v4') and implies `profiled`. A profile
    with `correctnessRows` (v3, v4) also validates every correctness deduction row;
    `parse_score(text, True)` keeps the frozen v2 behavior."""
    rows = False
    if profile is not None:
        if profile not in PROFILES:
            raise ValueError('Unknown review profile: ' + str(profile))
        profiled, rows = True, bool(PROFILES[profile].get('correctnessRows'))
    if text.count('```') != 2:
        raise ValueError('Expected exactly one final fenced JSON block.')
    match = re.search(r'(?m)^```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\s*\Z', text)
    if not match:
        raise ValueError('The final response must end with a fenced JSON object.')
    score = validate_score(strict_json(match.group(1)), profiled)
    if profiled:
        check_issue_rows(text[:match.start()], score)
    if rows:
        check_correctness_rows(text[:match.start()], score)
    return score


def check_correctness_rows(prose, score):
    """One row per deduction unit, each with one amount the rubric lists for its criterion;
    each criterion score is its cap minus the sum of its rows, floored at zero.

    This rejects grouped totals such as `level | -6`, but it cannot prove that the prose
    of a single `-2` row names only one semantic unit."""
    deducted = dict.fromkeys(CAPS, 0)
    for row in NAMED_ROW.finditer(prose):
        category = row.group(1).strip().lower()
        if category in SEPARATE_ROWS:
            continue
        cells = row.group(2).strip()
        fields = [item.strip() for item in (cells[:-1] if cells.endswith('|') else cells).split('|')]
        if category not in CAPS:
            if SIGNED_INTEGER.fullmatch(fields[0]):
                raise ValueError('Unknown deduction category: ' + row.group(0).strip())
            continue
        if len(fields) != 3 or not all(fields):
            raise ValueError('Malformed correctness row: ' + row.group(0).strip())
        amount = DEDUCTION.fullmatch(fields[0])
        if not amount or int(amount.group(1)) not in DEDUCTIONS[category]:
            raise ValueError('A ' + category + ' row must deduct exactly one of '
                             + ', '.join('-' + str(item) for item in DEDUCTIONS[category]) + ': '
                             + row.group(0).strip())
        deducted[category] += int(amount.group(1))
    for key, cap in CAPS.items():
        if score[key] != cap - min(cap, deducted[key]):
            raise ValueError('{} score {} does not equal its cap {} minus its rows ({}).'.format(
                key, score[key], cap, deducted[key]))


def check_issue_rows(prose, score):
    """Profiled counts must equal the structured `renderer`/`deferred` rows in the prose."""
    counts = dict.fromkeys(PROFILE_COUNTS.values(), 0)
    for row in ISSUE_ROW.finditer(prose):
        fields = [item.strip() for item in row.group(2).strip().rstrip('|`').split('|', 2)]
        if len(fields) != 3 or fields[0] != '0' or not fields[1] or not fields[2]:
            raise ValueError('Malformed ' + row.group(1).lower() + ' row: ' + row.group(0).strip())
        counts[row.group(1).lower()] += 1
    for key, category in PROFILE_COUNTS.items():
        if score[key] != counts[category]:
            raise ValueError(key + ' does not match the ' + str(counts[category]) + ' ' + category + ' rows.')


def validate_score(score, profiled=False):
    """Profiled reviews add a separate presentation assessment and issue counts."""
    extra = {'presentation', *PROFILE_COUNTS} if profiled else set()
    if not isinstance(score, dict) or set(score) != set(CAPS) | {'total'} | extra:
        raise ValueError('Scores must contain exactly the seven criteria and total'
                         + (', presentation, and issue counts.' if profiled else '.'))
    for key, cap in {**CAPS, 'total': 100}.items():
        if type(score[key]) is not int or not 0 <= score[key] <= cap:
            raise ValueError('Score outside integer criterion cap: ' + key)
    if score['total'] != sum(score[key] for key in CAPS):
        raise ValueError('Total does not equal the seven criterion scores.')
    if profiled:
        # Presentation is null when no complete captures were supplied.
        value = score['presentation']
        if value is not None and (
                not isinstance(value, dict) or set(value) != {*PRESENTATION, 'total'}
                or any(type(value[key]) is not int or not 1 <= value[key] <= 5 for key in PRESENTATION)
                or type(value['total']) is not int or value['total'] != sum(value[key] for key in PRESENTATION)):
            raise ValueError('Presentation must be null or five 1-5 dimensions with their total.')
        if any(type(score[key]) is not int or score[key] < 0 for key in PROFILE_COUNTS):
            raise ValueError('Issue counts must be non-negative integers.')
    return score


def evidence_blockers(valid, evidence):
    """Why profiled scores cannot be headlined yet; valid findings stay in the judgments."""
    blockers = []
    if evidence != 'complete':
        blockers.append('Visual evidence is ' + str(evidence) + '; visible-state checks are unresolved.')
    if any(row['score']['deferredFindings'] for row in valid):
        blockers.append('A review deferred findings.')
    if any(row['score']['presentation'] is None for row in valid):
        blockers.append('Presentation is unscored.')
    return blockers


def aggregate(judgments, profiled=False, evidence=None):
    valid = []
    for row in judgments:
        if row.get('status') == 'valid':
            try:
                validate_score(row.get('score'), profiled)
            except ValueError:
                continue
            valid.append(row)
    complete = len(judgments) == JUDGES and len(valid) == JUDGES and {
        row.get('judge') for row in valid} == {1, 2, 3}
    blockers = evidence_blockers(valid, evidence) if profiled else []
    if blockers:
        complete = False
    result = {'status': 'complete' if complete else 'incomplete',
              'requiredJudgments': JUDGES, 'validJudgments': len(valid), 'judgments': judgments,
              'medianTotal': None, 'totalRange': None, 'medianDimensions': None, 'dimensionRanges': None,
              'dimensionMedianSum': None, 'dimensionMedianSumEqualsMedianTotal': None}
    if profiled:
        result['evidenceBlockers'] = blockers
    if complete:
        totals = [row['score']['total'] for row in valid]
        dimensions = {key: statistics.median(row['score'][key] for row in valid) for key in CAPS}
        result.update(medianTotal=statistics.median(totals),
                      totalRange={'min': min(totals), 'max': max(totals)},
                      medianDimensions=dimensions,
                      dimensionRanges={key: {'min': min(row['score'][key] for row in valid),
                                             'max': max(row['score'][key] for row in valid)} for key in CAPS},
                      dimensionMedianSum=sum(dimensions.values()),
                      dimensionMedianSumEqualsMedianTotal=sum(dimensions.values()) == statistics.median(totals))
    if profiled:
        # Kept apart from the correctness total; its total and dimensions are separate medians.
        presentation = [row['score']['presentation'] for row in valid] if complete else None
        result['medianPresentation'] = statistics.median(
            item['total'] for item in presentation) if complete else None
        result['medianPresentationDimensions'] = {
            key: statistics.median(item[key] for item in presentation)
            for key in PRESENTATION} if complete else None
    return result


def judge_command(packet, final):
    return ['codex', 'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
            '-m', MODEL, '-c', 'model_reasoning_effort="medium"', '-s', 'read-only',
            '-C', str(packet), '-o', str(final), '--json', '-']


def judge_one(prepared, record, judge, rubric, profile=None):
    packet = prepared / 'packets' / record['candidateId']
    destination = prepared / 'judgments' / record['candidateId'] / ('j' + str(judge))
    destination.mkdir(parents=True, exist_ok=False)
    result = {'judge': judge, 'status': 'invalid'}
    started = time.monotonic()
    try:
        if packet_hashes(packet) != record['packetSha256']:
            raise ValueError('Prepared packet changed before judgment.')
        if profile and strict_json(regular_bytes(packet / 'review/profile.json')) != profile:
            raise ValueError('Prepared packet names a different review profile.')
        if profile and strict_json(regular_bytes(packet / 'candidate/visual-evidence.json')) \
                != record.get('visualEvidence'):
            raise ValueError('Prepared packet evidence differs from the mapping.')
        command = judge_command(packet, destination / 'final.md')
        invocation = {'command': command, 'rubricSha256': digest(rubric)}
        if profile:
            invocation = {'command': command, 'profile': profile}
        write_json(destination / 'invocation.json', invocation)
        with (destination / 'raw.jsonl').open('xb') as stdout, (destination / 'stderr.txt').open('xb') as stderr:
            process = subprocess.run(command, input=rubric, stdout=stdout, stderr=stderr,
                                     cwd=packet, timeout=TIMEOUT_SECONDS, check=False)
        result['exit'] = process.returncode
        if process.returncode != 0:
            raise ValueError('Judge exited unsuccessfully: ' + str(process.returncode))
        if packet_hashes(packet) != record['packetSha256']:
            raise ValueError('Prepared packet changed during judgment.')
        text = regular_bytes(destination / 'final.md').decode('utf-8')
        score = parse_score(text, bool(profile), profile['name'] if profile else None)
        if profile and record['visualEvidence'].get('status') != 'complete' \
                and score['presentation'] is not None:
            raise ValueError('Presentation was scored without complete visual evidence.')
        result.update(status='valid', score=score, finalSha256=digest(text.encode()))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        result['error'] = str(error)
    result['seconds'] = round(time.monotonic() - started, 2)
    write_json(destination / 'result.json', result)
    return result


def prepared_prompt(prepared, manifest):
    """Verify a profiled preparation against its mapping and the frozen profile."""
    profile = manifest['profile']
    if manifest.get('version') != 2 or not isinstance(profile, dict) or 'rubricSha256' in manifest:
        raise ValueError('Prepared review profile selection is malformed.')
    current, expected = load_profile(profile.get('name'))
    prompt = regular_bytes(prepared / 'reviewer-prompt.md')
    if profile != current or prompt != expected or digest(prompt) != profile['promptSha256']:
        raise ValueError('Prepared review profile changed.')
    return prompt


def run_judges(prepared, parallel=3):
    if parallel not in (1, 2, 3, 6):
        raise ValueError('Parallel judges must be 1, 2, 3, or 6.')
    prepared = pathlib.Path(prepared).resolve()
    manifest = strict_json(regular_bytes(prepared / 'mapping.json'))
    profile = manifest.get('profile')
    if profile is None:
        # Legacy preparations: the unchanged judge2 rubric, exactly as before.
        rubric = regular_bytes(prepared / 'rubric.md')
        if digest(rubric) != manifest['rubricSha256'] or digest(rubric) != RUBRIC_SHA256:
            raise ValueError('Prepared rubric changed.')
    else:
        rubric = prepared_prompt(prepared, manifest)
    if (manifest['model'], manifest['reasoningEffort'], manifest['judgmentsRequired']) != (MODEL, REASONING, JUDGES):
        raise ValueError('Prepared judge settings changed.')
    records = manifest['runs']
    if not isinstance(records, list) or not records or any(
            not isinstance(row, dict) or row.get('status') not in ('ready', 'incomplete')
            for row in records):
        raise ValueError('Prepared runs must be a nonempty list of candidate records.')
    ids = [row['candidateId'] for row in records]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r'candidate-[a-f0-9]{12}', key) for key in ids):
        raise ValueError('Invalid anonymous candidate identities.')
    (prepared / 'judgments').mkdir(exist_ok=False)
    jobs = [(row, judge) for row in records if row['status'] == 'ready' for judge in range(1, JUDGES + 1)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=parallel) as pool:
        results = list(pool.map(lambda job: judge_one(prepared, *job, rubric, profile), jobs))
    grouped = {key: [] for key in ids}
    for (record, _), result in zip(jobs, results):
        grouped[record['candidateId']].append(result)
    summaries = []
    for record in records:
        summary = {'candidateId': record['candidateId'], 'run': record['run'],
                   'sourceSha256': record.get('sourceSha256'),
                   **aggregate(grouped[record['candidateId']], bool(profile),
                               (record.get('visualEvidence') or {}).get('status', 'missing'))}
        if record['status'] != 'ready':
            summary['preparationError'] = record.get('error', 'Candidate incomplete.')
        if profile:
            evidence = record.get('visualEvidence') or {'status': 'missing'}
            summary['visualEvidence'] = {
                'status': evidence.get('status'), 'rendererSha256': evidence.get('rendererSha256'),
                'procedure': evidence.get('procedure'), 'requiredViews': evidence.get('requiredViews'),
                'captures': len(evidence.get('captures') or []), 'uncovered': evidence.get('uncovered')}
        summaries.append(summary)
    report = {'model': MODEL, 'reasoningEffort': REASONING, 'rubricSha256': digest(rubric),
              'status': 'complete' if all(row['status'] == 'complete' for row in summaries) else 'incomplete',
              'runs': summaries}
    if profile:
        del report['rubricSha256']
        report['profile'] = profile
        # A comparison needs one renderer and one capture procedure across its evidence.
        setups = {json.dumps([row['visualEvidence']['rendererSha256'], row['visualEvidence']['procedure']])
                  for row in summaries if row['visualEvidence']['status'] == 'complete'}
        report['comparisonBlockers'] = (['Complete evidence mixes renderers or capture procedures.']
                                        if len(setups) > 1 else [])
        if report['comparisonBlockers']:
            report['status'] = 'incomplete'
    write_json(prepared / 'scores.json', report)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--prepare', action='store_true')
    mode.add_argument('--run-judges', action='store_true', help='Explicitly use the signed-in Codex account.')
    parser.add_argument('--bundle', type=pathlib.Path, default=DEFAULT_BUNDLE)
    parser.add_argument('--runs-root', type=pathlib.Path)
    parser.add_argument('--run', action='append', default=[], help='Select run-N; omitted selects all run-N directories.')
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--prepared', type=pathlib.Path)
    parser.add_argument('--parallel', type=int, choices=[1, 2, 3, 6], default=3)
    parser.add_argument('--profile', choices=['v1', *PROFILES],
                        help='Review profile for --prepare (default v1, the frozen judge2 rubric).')
    args = parser.parse_args(argv)
    try:
        if args.prepare:
            if not args.runs_root or not args.output or args.prepared:
                parser.error('--prepare requires --runs-root and a new --output; omit --prepared.')
            report = prepare(args.bundle, args.runs_root, args.output, args.run, args.profile or 'v1')
            complete = all(row['status'] == 'ready' for row in report['runs'])
        else:
            if not args.prepared or args.runs_root or args.output or args.run:
                parser.error('--run-judges requires --prepared; omit preparation arguments.')
            if args.profile is not None:
                parser.error('--run-judges uses the prepared profile; omit --profile.')
            report = run_judges(args.prepared, args.parallel)
            complete = report['status'] == 'complete'
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2))
    return 0 if complete else 1


if __name__ == '__main__':
    raise SystemExit(main())
