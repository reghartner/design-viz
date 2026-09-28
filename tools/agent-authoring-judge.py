#!/usr/bin/env python3
"""Prepare anonymous authoring packets, then explicitly run three read-only Codex judges.

Example (preparation does not invoke any model):
  python3 tools/agent-authoring-judge.py --prepare --runs-root .local/authors --output .local/judges
  python3 tools/agent-authoring-judge.py --run-judges --prepared .local/judges

The frozen 100-point rubric is passed unchanged on stdin. Run mappings, scores,
and raw judge output stay outside each packet. This is unlabelled evaluation,
not a claim of perfect blinding or a filesystem confidentiality boundary.
"""

import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import re
import statistics
import subprocess
import time

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


def prepare(bundle, runs_root, output, run_names):
    bundle = pathlib.Path(bundle).resolve()
    runs_root = pathlib.Path(runs_root).resolve()
    output = pathlib.Path(output).resolve()
    frozen = load_bundle(bundle)
    if not run_names:
        run_names = sorted(path.name for path in runs_root.iterdir()
                           if re.fullmatch(r'run-\d+', path.name))
    if not run_names or len(set(run_names)) != len(run_names) or any(
            not re.fullmatch(r'run-\d+', name) for name in run_names):
        raise ValueError('Select unique run-N directories.')
    output.mkdir(parents=True, exist_ok=False)
    write_bytes(output / '.gitignore', b'*\n')
    rubric = frozen['judge-only/judge2-prompt.md']
    write_bytes(output / 'rubric.md', rubric)
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
            if not isinstance(strict_json(source), dict):
                raise ValueError('Accepted final.spec.json must contain an object.')
            mechanical = regular_bytes(run / 'mechanical-check.json')
            source_hash = digest(source)
            check = clean_mechanical(strict_json(mechanical), run, source_hash)
            packet = output / 'packets' / anonymous
            for name_in_bundle, destination in BUNDLE_FILES.items():
                write_bytes(packet / destination, frozen[name_in_bundle])
            for name_in_run, destination in RUN_FILES.items():
                write_bytes(packet / destination, inputs[name_in_run])
            write_json(packet / 'candidate/mechanical-check.json', check)
            record.update(status='ready', sourceSha256=source_hash,
                          inputSha256={key: digest(value) for key, value in inputs.items()},
                          mechanicalSha256=digest(mechanical), packetSha256=packet_hashes(packet))
        except (OSError, ValueError, KeyError, TypeError) as error:
            record['error'] = str(error)
        records.append(record)
    manifest = {'version': 1, 'bundle': str(bundle), 'rubricSha256': digest(rubric),
                'model': MODEL, 'reasoningEffort': REASONING, 'judgmentsRequired': JUDGES,
                'blinding': 'Unlabelled packets; author style/content may reveal method. Not perfect blinding.',
                'runs': records}
    write_json(output / 'mapping.json', manifest)
    return manifest


def parse_score(text):
    """Require the exact final fenced object, criterion caps, and its actual sum."""
    if text.count('```') != 2:
        raise ValueError('Expected exactly one final fenced JSON block.')
    match = re.search(r'(?m)^```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\s*\Z', text)
    if not match:
        raise ValueError('The final response must end with a fenced JSON object.')
    return validate_score(strict_json(match.group(1)))


def validate_score(score):
    if not isinstance(score, dict) or set(score) != set(CAPS) | {'total'}:
        raise ValueError('Scores must contain exactly the seven criteria and total.')
    for key, cap in {**CAPS, 'total': 100}.items():
        if type(score[key]) is not int or not 0 <= score[key] <= cap:
            raise ValueError('Score outside integer criterion cap: ' + key)
    if score['total'] != sum(score[key] for key in CAPS):
        raise ValueError('Total does not equal the seven criterion scores.')
    return score


def aggregate(judgments):
    valid = []
    for row in judgments:
        if row.get('status') == 'valid':
            try:
                validate_score(row.get('score'))
            except ValueError:
                continue
            valid.append(row)
    complete = len(judgments) == JUDGES and len(valid) == JUDGES and {
        row.get('judge') for row in valid} == {1, 2, 3}
    result = {'status': 'complete' if complete else 'incomplete',
              'requiredJudgments': JUDGES, 'validJudgments': len(valid), 'judgments': judgments,
              'medianTotal': None, 'totalRange': None, 'medianDimensions': None, 'dimensionRanges': None,
              'dimensionMedianSum': None, 'dimensionMedianSumEqualsMedianTotal': None}
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
    return result


def judge_command(packet, final):
    return ['codex', 'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
            '-m', MODEL, '-c', 'model_reasoning_effort="medium"', '-s', 'read-only',
            '-C', str(packet), '-o', str(final), '--json', '-']


def judge_one(prepared, record, judge, rubric):
    packet = prepared / 'packets' / record['candidateId']
    destination = prepared / 'judgments' / record['candidateId'] / ('j' + str(judge))
    destination.mkdir(parents=True, exist_ok=False)
    result = {'judge': judge, 'status': 'invalid'}
    started = time.monotonic()
    try:
        if packet_hashes(packet) != record['packetSha256']:
            raise ValueError('Prepared packet changed before judgment.')
        command = judge_command(packet, destination / 'final.md')
        write_json(destination / 'invocation.json', {'command': command, 'rubricSha256': digest(rubric)})
        with (destination / 'raw.jsonl').open('xb') as stdout, (destination / 'stderr.txt').open('xb') as stderr:
            process = subprocess.run(command, input=rubric, stdout=stdout, stderr=stderr,
                                     cwd=packet, timeout=TIMEOUT_SECONDS, check=False)
        result['exit'] = process.returncode
        if process.returncode != 0:
            raise ValueError('Judge exited unsuccessfully: ' + str(process.returncode))
        if packet_hashes(packet) != record['packetSha256']:
            raise ValueError('Prepared packet changed during judgment.')
        text = regular_bytes(destination / 'final.md').decode('utf-8')
        result.update(status='valid', score=parse_score(text), finalSha256=digest(text.encode()))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        result['error'] = str(error)
    result['seconds'] = round(time.monotonic() - started, 2)
    write_json(destination / 'result.json', result)
    return result


def run_judges(prepared, parallel=3):
    if parallel not in (1, 2, 3, 6):
        raise ValueError('Parallel judges must be 1, 2, 3, or 6.')
    prepared = pathlib.Path(prepared).resolve()
    manifest = strict_json(regular_bytes(prepared / 'mapping.json'))
    rubric = regular_bytes(prepared / 'rubric.md')
    if digest(rubric) != manifest['rubricSha256'] or digest(rubric) != RUBRIC_SHA256:
        raise ValueError('Prepared rubric changed.')
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
        results = list(pool.map(lambda job: judge_one(prepared, *job, rubric), jobs))
    grouped = {key: [] for key in ids}
    for (record, _), result in zip(jobs, results):
        grouped[record['candidateId']].append(result)
    summaries = []
    for record in records:
        summary = {'candidateId': record['candidateId'], 'run': record['run'],
                   'sourceSha256': record.get('sourceSha256'), **aggregate(grouped[record['candidateId']])}
        if record['status'] != 'ready':
            summary['preparationError'] = record.get('error', 'Candidate incomplete.')
        summaries.append(summary)
    report = {'model': MODEL, 'reasoningEffort': REASONING, 'rubricSha256': digest(rubric),
              'status': 'complete' if all(row['status'] == 'complete' for row in summaries) else 'incomplete',
              'runs': summaries}
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
    args = parser.parse_args(argv)
    try:
        if args.prepare:
            if not args.runs_root or not args.output or args.prepared:
                parser.error('--prepare requires --runs-root and a new --output; omit --prepared.')
            report = prepare(args.bundle, args.runs_root, args.output, args.run)
            complete = all(row['status'] == 'ready' for row in report['runs'])
        else:
            if not args.prepared or args.runs_root or args.output or args.run:
                parser.error('--run-judges requires --prepared; omit preparation arguments.')
            report = run_judges(args.prepared, args.parallel)
            complete = report['status'] == 'complete'
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2))
    return 0 if complete else 1


if __name__ == '__main__':
    raise SystemExit(main())
