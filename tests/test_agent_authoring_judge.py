"""Offline authoring-judge contracts; external processes are always mocked."""

import contextlib
import importlib.util
import io
import json
import pathlib
import re
import struct
import subprocess
import tempfile
import unittest
import zlib
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('authoring_judge', ROOT / 'tools/agent-authoring-judge.py')
judge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(judge)

# A synthetic frozen fixture avoids depending on ignored local benchmark files
# in CI. Its bytes must survive both preparation and subprocess stdin unchanged.
RUBRIC = b'Fixed rubric\r\nQuestions 10; level 10; time 20; edges 15; panels 15; backstage 15; fidelity 15.\n'


def full_score(**overrides):
    score = dict(judge.CAPS)
    score.update(overrides)
    score['total'] = sum(score.values())
    return score


def final_reply(score=None):
    return 'No deductions.\n\n```json\n' + json.dumps(score or full_score()) + '\n```\n'


def presentation(value=4, **overrides):
    item = {**dict.fromkeys(judge.PRESENTATION, value), **overrides}
    item['total'] = sum(item.values())
    return item


def profiled_score(presentation, deferred, renderer=1, **overrides):
    """A v2 score; callers state presentation and deferral counts explicitly."""
    return {**full_score(**overrides), 'presentation': presentation,
            'rendererIssues': renderer, 'deferredFindings': deferred}


def profiled_reply(score, rows=None):
    """A v2 reply whose structured rows match its counts unless rows are given."""
    if rows is None:
        rows = (['- renderer | 0 | provenance disclosure | Visible to story-level readers.'] * score['rendererIssues']
                + ['deferred | 0 | step open | Needs a narrow capture of the phone.'] * score['deferredFindings'])
    return ('panels | -3 | open | Clip not shown.\n' + ''.join(row + '\n' for row in rows)
            + '\n```json\n' + json.dumps(score) + '\n```\n')


def evidence_reply(packet):
    """A reviewer that follows the rubric: presentation only with complete captures."""
    status = json.loads((packet / 'candidate/visual-evidence.json').read_text())['status']
    return profiled_reply(profiled_score(presentation(), 0) if status == 'complete'
                          else profiled_score(None, 2))


def png(width, height):
    """A small but complete, decodable 1-bit grayscale PNG."""
    def chunk(kind, data):
        return len(data).to_bytes(4, 'big') + kind + data + zlib.crc32(kind + data).to_bytes(4, 'big')
    rows = (b'\x00' + bytes((width + 7) // 8)) * height
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 1, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


PROFILE_RUBRIC = b'Profile rubric\nApply interpretations after the separator.\n'
PROFILE_RULES = b'{"rules": [{"id": "provenance-chrome", "decision": "renderer"}]}\n'
V3_RUBRIC = b'Profile v3 rubric\nOne deduction unit per row.\n'
V3_RULES = b'{"rules": [{"id": "units", "decision": "one row per unit"}]}\n'
V4_RUBRIC = b'Profile v4 rubric\nOne deduction unit per row.\n'
V4_RULES = b'{"rules": [{"id": "backstage", "decision": "representative operation"}]}\n'
# The scoring contract every profile shares; v4 changes interpretations only.
FROZEN_CAPS = {'questions': 10, 'level': 10, 'time': 20, 'edges': 15, 'panels': 15, 'backstage': 15, 'fidelity': 15}
FROZEN_DEDUCTIONS = {'questions': (1, 2, 3, 10), 'level': (2,), 'time': (2, 3, 4, 5), 'edges': (2,),
                     'panels': (2, 3), 'backstage': (1, 2, 3, 5), 'fidelity': (3, 4, 5)}
FROZEN_PRESENTATION = ('clarity', 'hierarchy', 'visibleEvidence', 'legibility', 'interaction')
FROZEN_MANIFESTS = {'v2': '0632d7004bf47d553624b8a97341987ed85ae4cc68ba8f40e07736f0b2f01ec7',
                    'v3': '22bda3abb270fb9c6e5e7f3fa64f5bdfe86752efa1ed970167b940c198794949'}
# The three prospective v4 clarifications, each appended to its v3 decision.
V4_CLARIFICATIONS = {
    'provenance-chrome': (
        'Attribute visible wording by tracing the literal text to the candidate source. Text synthesized by the '
        'renderer from structural data is renderer-owned copy even when the author supplied the underlying '
        'structure. In particular, a built-in response/ack legend generated from response-edge state is a renderer '
        'row, not an authored story-level protocol deduction, unless the candidate explicitly supplies that protocol '
        'wording in a caption, label, legend, panel, or section.'),
    'battery-conflict': (
        "Do not infer a gross-versus-net charging convention that the source does not state. A configured charging "
        "rate is the battery panel's rate of battery change while charging. If the source gives a charging or gain "
        "rate but does not explicitly define it as generation before device load, do not subtract idle drain from it "
        "again. If the source wording genuinely permits both gross and net readings, either internally consistent "
        "reading is allowed; do not deduct solely because the other convention changes a displayed value."),
    'backstage': (
        "The one operation stored in a node's binding is representative metadata for the bound API; it is not a "
        "claim that every step using that node executes that operation, and it need not change from step to step. "
        "For a caption or step that asserts a different call, check whether the asserted call is an approved "
        "operation of the same bound service. Deduct an operation mismatch only when the explicit call is unapproved "
        "or belongs to another service, or when an attached code reference is placed at a step where that code does "
        "not run."),
}


def amounts(remaining, allowed):
    """Allowed deduction amounts summing to `remaining`, largest first, or None."""
    if not remaining:
        return []
    for amount in sorted(allowed, reverse=True):
        rest = amounts(remaining - amount, allowed) if amount <= remaining else None
        if rest is not None:
            return [amount] + rest
    return None


def v3_rows(score):
    """One valid row per unit that produces each criterion's deficit."""
    rows = []
    for key, cap in judge.CAPS.items():
        for amount in amounts(cap - score[key], judge.DEDUCTIONS[key]):
            rows.append('{} | -{} | step s{} | One unit.'.format(key, amount, len(rows)))
    return rows


def v3_reply(score, rows=None, issues=None):
    """A v3 reply: correctness rows that match the score unless given, plus issue rows."""
    rows = v3_rows(score) if rows is None else rows
    if issues is None:
        issues = (['renderer | 0 | provenance disclosure | Visible to story-level readers.'] * score['rendererIssues']
                  + ['deferred | 0 | step open | Needs a narrow capture.'] * score['deferredFindings'])
    return ''.join(row + '\n' for row in rows + issues) + '\n```json\n' + json.dumps(score) + '\n```\n'


class AuthoringJudgeTests(unittest.TestCase):
    def setUp(self):
        self.run = self.enterContext(mock.patch.object(judge.subprocess, 'run'))
        self.run.side_effect = AssertionError('Unexpected external command; tests must never use an account.')
        self.enterContext(mock.patch.object(judge.subprocess, 'check_output',
                                          side_effect=AssertionError('Unexpected external command.')))
        self.directory = pathlib.Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.bundle = self.directory / 'bundle'
        self.runs = self.directory / 'authors'
        self.output = self.directory / 'judges'
        self.enterContext(mock.patch.object(judge, 'RUBRIC_SHA256', judge.digest(RUBRIC)))
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))
        self.enterContext(contextlib.redirect_stderr(io.StringIO()))
        files = []
        for name in [*judge.BUNDLE_FILES, 'judge-only/judge2-prompt.md']:
            value = RUBRIC if name.endswith('judge2-prompt.md') else ('Frozen ' + name + '\n').encode()
            path = self.bundle / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(value)
            files.append({'path': name, 'sha256': judge.digest(value)})
        (self.bundle / 'manifest.json').write_text(json.dumps({'files': files}))
        secret = self.bundle / 'baseline-only/other-candidate.spec.json'
        secret.parent.mkdir(parents=True)
        secret.write_text('PRIVATE_BASELINE_SCORE_96')

    def author_run(self, name='run-01'):
        run = self.runs / name
        run.mkdir(parents=True)
        for filename in judge.RUN_FILES:
            value = '{\n "nodes": {"customer": {"title": "Customer λ"}}, "steps": []\n}\n' if filename.endswith('.json') else 'Current ' + filename + '\n'
            (run / filename).write_bytes(value.encode())
        source_hash = judge.digest((run / 'final.spec.json').read_bytes())
        (run / 'mechanical-check.json').write_text(json.dumps({
            'run': 'PRIVATE_AUTHOR_TRANSPORT', 'spec': str(run / 'final.spec.json'),
            'score': 96, 'sourceSha256': source_hash,
            'metrics': {'buildOk': True, 'totalSteps': 3, 'questionCount': 4,
                        'battery:phone:main': '20 -> 18', 'privateScore': 96},
            'problems': [{'kind': 'time', 'msg': 'Check ' + str(run) + ' line 2', 'transport': 'SECRET'}],
            'problemCounts': {'time': 1},
        }))
        (run / 'unaccepted-draft.spec.json').write_text('PRIVATE_REJECTED_DRAFT')
        (run / 'scores.json').write_text('PRIVATE_AUTHOR_SCORE')
        (run / 'agent').mkdir()
        (run / 'agent/source.spec.json').write_text('PRIVATE_AGENT_PROPOSAL')
        return run

    def prepare(self, names=None):
        return judge.prepare(self.bundle, self.runs, self.output, names or [])

    def profile(self):
        """A synthetic v2 profile pinned like the real one, by its manifest hash."""
        directory = self.directory / 'review-v2'
        directory.mkdir()
        (directory / 'rubric.md').write_bytes(PROFILE_RUBRIC)
        (directory / 'interpretations.json').write_bytes(PROFILE_RULES)
        manifest = json.dumps({'profile': 'authoring-review-v2', 'files': [
            {'path': 'rubric.md', 'sha256': judge.digest(PROFILE_RUBRIC)},
            {'path': 'interpretations.json', 'sha256': judge.digest(PROFILE_RULES)}]}).encode()
        (directory / 'manifest.json').write_bytes(manifest)
        self.enterContext(mock.patch.dict(judge.PROFILES, {'v2': {
            'id': 'authoring-review-v2', 'directory': directory,
            'manifestSha256': judge.digest(manifest)}}))
        return directory

    def captured_run(self, name, spec=None, sections=None, omit=0, renderer='a' * 64, **manifest):
        """An author run with full-page PNG captures of its spec's step views.

        `sections` limits which diagram sections are captured; `omit` drops the
        last captures; keyword arguments override manifest fields."""
        run = self.author_run(name)
        spec = spec or {'nodes': {'cam': {'title': 'Camera'}}, 'rows': [['cam']], 'edges': [],
                        'steps': [{'id': 'start'}, {'id': 'open'}]}
        source = json.dumps(spec).encode()
        (run / 'final.spec.json').write_bytes(source)
        mechanical = json.loads((run / 'mechanical-check.json').read_text())
        mechanical['sourceSha256'] = judge.digest(source)
        (run / 'mechanical-check.json').write_text(json.dumps(mechanical))
        visual = run / 'visual'
        visual.mkdir()
        # Full-page captures are taller than the logical 1000 px viewport.
        sizes = {'desktop': (1440, 1300), 'narrow': (800, 2100)}
        captures = [{'file': '{}-{}.png'.format(view, index), 'viewport': view,
                     'diagram': section, 'path': path, 'step': step}
                    for index, (section, path, step) in enumerate(judge.required_views(spec))
                    if sections is None or section in sections for view in sizes]
        captures = captures[:len(captures) - omit]
        for item in captures:
            (visual / item['file']).write_bytes(png(*sizes[item['viewport']]))
        (visual / 'manifest.json').write_text(json.dumps({
            'sourceSha256': judge.digest(source), 'rendererSha256': renderer,
            'procedure': judge.CAPTURE_PROCEDURE, 'captures': captures, **manifest}))
        return run

    def allow_judges(self, missing=None, error=None, mutate=False, prompt=RUBRIC, reply=None):
        def run(command, **kwargs):
            final = pathlib.Path(command[command.index('-o') + 1])
            self.assertEqual(kwargs['input'], prompt)
            self.assertEqual(kwargs['timeout'], 600)
            self.assertFalse(kwargs['check'])
            self.assertEqual(pathlib.Path(command[command.index('-C') + 1]), kwargs['cwd'])
            kwargs['stdout'].write(b'{"type":"mock.raw"}\n')
            kwargs['stderr'].write(b'mock diagnostics\n')
            if error:
                raise error
            if mutate:
                (kwargs['cwd'] / 'changed.txt').write_text('mutation')
            if final.parent.name != missing:
                final.write_text(reply(kwargs['cwd']) if callable(reply) else reply or final_reply())
            return subprocess.CompletedProcess(command, 0)
        self.run.side_effect = run

    def test_preparation_copies_only_accepted_source_and_current_evidence_exactly(self):
        run = self.author_run()
        manifest = self.prepare()
        record = manifest['runs'][0]
        self.assertEqual(record['status'], 'ready')
        packet = self.output / 'packets' / record['candidateId']
        expected = set(judge.BUNDLE_FILES.values()) | set(judge.RUN_FILES.values()) | {'candidate/mechanical-check.json'}
        self.assertEqual(set(judge.packet_hashes(packet)), expected)
        for source, destination in judge.RUN_FILES.items():
            self.assertEqual((packet / destination).read_bytes(), (run / source).read_bytes())
        for source, destination in judge.BUNDLE_FILES.items():
            self.assertEqual((packet / destination).read_bytes(), (self.bundle / source).read_bytes())
        self.assertEqual((self.output / 'rubric.md').read_bytes(), RUBRIC)
        self.assertEqual(record['sourceSha256'], judge.digest((run / 'final.spec.json').read_bytes()))
        combined = '\n'.join(path.read_text() for path in packet.rglob('*') if path.is_file())
        for secret in ['PRIVATE_', 'run-01', str(self.runs), 'privateScore', 'sourceSha256', 'transport']:
            self.assertNotIn(secret, combined)
        mechanical = json.loads((packet / 'candidate/mechanical-check.json').read_text())
        self.assertEqual(mechanical['metrics']['battery:phone:main'], '20 -> 18')
        self.assertEqual(mechanical['problems'], [{'kind': 'time', 'msg': 'Check candidate line 2'}])
        self.assertEqual((self.output / '.gitignore').read_text(), '*\n')
        self.run.assert_not_called()

    def test_missing_candidate_artifacts_are_incomplete_and_never_judged(self):
        for index, missing in enumerate(['final.spec.json', 'story.ledger.md', 'operator-answers.md', 'mechanical-check.json'], 1):
            run = self.author_run('run-' + str(index))
            (run / missing).unlink()
        self.prepare()
        self.assertFalse((self.output / 'packets').exists())
        report = judge.run_judges(self.output)
        self.assertEqual(report['status'], 'incomplete')
        for record in report['runs']:
            self.assertIsNone(record['medianTotal'])
            self.assertEqual(record['validJudgments'], 0)
            self.assertIn('Missing regular input file', record['preparationError'])
        self.run.assert_not_called()

    def test_missing_directory_and_symlink_source_are_incomplete(self):
        run = self.author_run()
        (run / 'final.spec.json').unlink()
        (run / 'final.spec.json').symlink_to(run / 'unaccepted-draft.spec.json')
        manifest = self.prepare(['run-01', 'run-02'])
        self.assertEqual([row['status'] for row in manifest['runs']], ['incomplete', 'incomplete'])

    def test_mechanical_source_mismatch_is_incomplete(self):
        run = self.author_run()
        path = run / 'mechanical-check.json'
        value = json.loads(path.read_text())
        value['sourceSha256'] = '0' * 64
        path.write_text(json.dumps(value))
        record = self.prepare()['runs'][0]
        self.assertEqual(record['status'], 'incomplete')
        self.assertIn('does not match', record['error'])

    def test_frozen_manifest_and_rubric_tampering_are_rejected(self):
        self.author_run()
        rubric = self.bundle / 'judge-only/judge2-prompt.md'
        rubric.write_text('Changed rubric')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            self.prepare()
        manifest_path = self.bundle / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        for item in manifest['files']:
            if item['path'].endswith('judge2-prompt.md'):
                item['sha256'] = judge.digest(rubric.read_bytes())
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'not the frozen'):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_preparation_and_judgment_refuse_existing_output(self):
        self.author_run()
        self.prepare()
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.allow_judges()
        judge.run_judges(self.output)
        self.assertEqual(self.run.call_count, 3)
        with self.assertRaises(FileExistsError):
            judge.run_judges(self.output)
        self.assertEqual(self.run.call_count, 3)

    def test_judges_get_exact_rubric_with_safe_settings_and_unique_outputs(self):
        self.author_run()
        self.author_run('run-02')
        self.prepare()
        self.allow_judges()
        report = judge.run_judges(self.output, parallel=3)
        self.assertEqual(report['status'], 'complete')
        self.assertEqual(self.run.call_count, 6)
        outputs = set()
        for call in self.run.call_args_list:
            command = call.args[0]
            for flag in ['--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--json']:
                self.assertIn(flag, command)
            self.assertEqual(command[command.index('-m') + 1], 'gpt-5.6-sol')
            self.assertEqual(command[command.index('-c') + 1], 'model_reasoning_effort="medium"')
            self.assertEqual(command[command.index('-s') + 1], 'read-only')
            self.assertFalse(any('dangerously' in arg or 'full-auto' in arg for arg in command))
            output = pathlib.Path(command[command.index('-o') + 1])
            outputs.add(output)
            self.assertNotIn('packets', output.parts)
            self.assertEqual((output.parent / 'raw.jsonl').read_bytes(), b'{"type":"mock.raw"}\n')
        self.assertEqual(len(outputs), 6)

    def test_missing_judgment_remains_incomplete_without_zero_fill(self):
        self.author_run()
        self.prepare()
        self.allow_judges(missing='j2')
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual(row['status'], 'incomplete')
        self.assertEqual(row['validJudgments'], 2)
        self.assertIsNone(row['medianTotal'])
        self.assertIsNone(row['medianDimensions'])
        self.assertIsNone(row['totalRange'])
        self.assertEqual(self.run.call_count, 3)

    def test_timeout_retains_raw_output_and_marks_every_attempt_invalid(self):
        self.author_run()
        self.prepare()
        self.allow_judges(error=subprocess.TimeoutExpired('codex', 600))
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual(row['validJudgments'], 0)
        self.assertEqual(row['status'], 'incomplete')
        self.assertEqual(len(list((self.output / 'judgments').rglob('raw.jsonl'))), 3)

    def test_packet_tampering_before_or_during_judging_is_invalid(self):
        self.author_run()
        record = self.prepare()['runs'][0]
        packet = self.output / 'packets' / record['candidateId']
        (packet / 'brief/hld.md').write_text('Changed')
        report = judge.run_judges(self.output)
        self.assertEqual(report['runs'][0]['validJudgments'], 0)
        self.run.assert_not_called()
        # A fresh destination checks mutations made during a mocked invocation.
        self.output = self.directory / 'second-judges'
        self.prepare()
        self.allow_judges(mutate=True)
        report = judge.run_judges(self.output, parallel=1)
        self.assertEqual(report['runs'][0]['validJudgments'], 0)

    def test_parse_requires_caps_integer_scores_exact_keys_and_actual_sum(self):
        self.assertEqual(judge.parse_score(final_reply()), full_score())
        bad_scores = []
        for key in judge.CAPS:
            for bad in [-1, judge.CAPS[key] + 1, True, 1.5]:
                bad_scores.append({**full_score(), key: bad})
        bad_scores.extend([{**full_score(), 'total': 99}, {**full_score(), 'extra': 0},
                           {key: value for key, value in full_score().items() if key != 'time'}])
        for score in bad_scores:
            with self.subTest(score=score), self.assertRaises(ValueError):
                judge.parse_score(final_reply(score))

    def test_parse_rejects_malformed_fences_trailing_text_duplicate_keys_and_nonfinite(self):
        valid = final_reply()
        malformed = [json.dumps(full_score()), valid + 'More explanation', valid + valid,
                     valid.replace('```json', '```'), valid.replace('"questions": 10', '"questions": 10, "questions": 10'),
                     valid.replace('"time": 20', '"time": NaN'), valid.replace('"time": 20', '"time": Infinity'),
                     '```json\n[]\n```', '```json\n{"total":}\n```']
        for text in malformed:
            with self.subTest(text=text), self.assertRaises(ValueError):
                judge.parse_score(text)

    def test_component_medians_are_separate_from_median_total(self):
        # Each judge deducts ten points in a different category. The median
        # total is 90 while each category's median is full credit (sum 100).
        scores = [full_score(questions=0), full_score(level=0), full_score(time=10)]
        rows = [{'judge': index, 'status': 'valid', 'score': score} for index, score in enumerate(scores, 1)]
        result = judge.aggregate(rows)
        self.assertEqual(result['medianTotal'], 90)
        self.assertEqual(result['totalRange'], {'min': 90, 'max': 90})
        self.assertEqual(result['medianDimensions'], judge.CAPS)
        self.assertEqual(result['dimensionRanges']['time'], {'min': 10, 'max': 20})
        self.assertEqual(result['dimensionMedianSum'], 100)
        self.assertFalse(result['dimensionMedianSumEqualsMedianTotal'])
        for incomplete in [rows[:2], [rows[0], rows[0], rows[2]], rows + [rows[0]],
                           [rows[0], rows[1], {'judge': 3, 'status': 'valid', 'score': {'total': 100}}]]:
            self.assertEqual(judge.aggregate(incomplete)['status'], 'incomplete')

    def test_cli_preparation_does_not_launch_models(self):
        self.author_run()
        result = judge.main(['--prepare', '--bundle', str(self.bundle), '--runs-root', str(self.runs),
                             '--output', str(self.output)])
        self.assertEqual(result, 0)
        self.run.assert_not_called()

    def test_empty_prepared_run_list_and_unsafe_run_selection_are_rejected(self):
        self.author_run()
        for names in [['../run-01'], ['run-01', 'run-01']]:
            with self.assertRaises(ValueError):
                self.prepare(names)
        self.prepare()
        path = self.output / 'mapping.json'
        value = json.loads(path.read_text())
        value['runs'] = []
        path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, 'nonempty'):
            judge.run_judges(self.output)
        self.run.assert_not_called()

    def test_default_preparation_is_the_unchanged_legacy_v1_format(self):
        run = self.author_run()
        (run / 'visual').mkdir()
        (run / 'visual/desktop.png').write_bytes(b'png')
        explicit = self.directory / 'explicit-v1'
        base = ['--prepare', '--bundle', str(self.bundle), '--runs-root', str(self.runs)]
        self.assertEqual(judge.main(base + ['--output', str(self.output)]), 0)
        self.assertEqual(judge.main(base + ['--output', str(explicit), '--profile', 'v1']), 0)
        self.assertEqual((self.output / 'mapping.json').read_bytes(), (explicit / 'mapping.json').read_bytes())
        mapping = json.loads((self.output / 'mapping.json').read_text())
        self.assertEqual(mapping['version'], 1)
        self.assertEqual(mapping['rubricSha256'], judge.digest(RUBRIC))
        self.assertNotIn('profile', mapping)
        self.assertEqual((self.output / 'rubric.md').read_bytes(), RUBRIC)
        self.assertFalse((self.output / 'reviewer-prompt.md').exists())
        packet = self.output / 'packets' / mapping['runs'][0]['candidateId']
        self.assertEqual(set(judge.packet_hashes(packet)), set(judge.BUNDLE_FILES.values())
                         | set(judge.RUN_FILES.values()) | {'candidate/mechanical-check.json'})
        # A legacy preparation judges exactly as before: judge2 rubric on stdin, old score shape.
        self.allow_judges()
        report = judge.run_judges(self.output)
        self.assertEqual(report['status'], 'complete')
        self.assertEqual(report['rubricSha256'], judge.digest(RUBRIC))
        self.assertNotIn('profile', report)
        self.assertNotIn('medianPresentation', report['runs'][0])
        invocation = next((self.output / 'judgments').rglob('invocation.json'))
        self.assertEqual(set(json.loads(invocation.read_text())), {'command', 'rubricSha256'})

    def test_repository_legacy_rubric_hash_and_v2_profile_are_frozen(self):
        legacy = ROOT / 'tests/fixtures/authoring-evaluation/overnight/judge-only/judge2-prompt.md'
        self.assertEqual(judge.digest(legacy.read_bytes()),
                         'c740ac21b34aae930203dfd1b40afa8bd5dfd5c271a7f868c6762daa502870a9')
        record, prompt = judge.load_profile('v2')
        directory = ROOT / 'tests/fixtures/authoring-evaluation/review-v2'
        self.assertEqual(record['id'], 'authoring-review-v2')
        for name in judge.PROFILE_FILES:
            self.assertIn((directory / name).read_bytes().strip(), prompt)
            self.assertEqual(record['guidanceSha256'][name], judge.digest((directory / name).read_bytes()))

    def test_run_judges_rejects_a_profile_argument(self):
        self.author_run()
        self.prepare()
        for profile in ['v1', 'v2']:
            with self.subTest(profile=profile), self.assertRaises(SystemExit):
                judge.main(['--run-judges', '--prepared', str(self.output), '--profile', profile])
        self.assertFalse((self.output / 'judgments').exists())
        self.run.assert_not_called()

    def test_v2_delivers_rubric_and_interpretations_and_freezes_hashes(self):
        self.profile()
        self.author_run()
        captured = self.captured_run('run-02')
        manifest = self.prepare_profiled()
        expected = PROFILE_RUBRIC.rstrip(b'\n') + b'\n' + judge.PROFILE_SEPARATOR + PROFILE_RULES
        profile = manifest['profile']
        self.assertEqual(manifest['version'], 2)
        self.assertNotIn('rubricSha256', manifest)
        self.assertEqual((profile['name'], profile['id']), ('v2', 'authoring-review-v2'))
        self.assertEqual(profile['guidanceSha256'], {'rubric.md': judge.digest(PROFILE_RUBRIC),
                                                     'interpretations.json': judge.digest(PROFILE_RULES)})
        self.assertEqual(profile['promptSha256'], judge.digest(expected))
        self.assertEqual((self.output / 'reviewer-prompt.md').read_bytes(), expected)
        self.assertFalse((self.output / 'rubric.md').exists())
        evidence = {}
        for record in manifest['runs']:
            packet = self.output / 'packets' / record['candidateId']
            self.assertEqual(json.loads((packet / 'review/profile.json').read_text()), profile)
            evidence[pathlib.Path(record['run']).name] = json.loads(
                (packet / 'candidate/visual-evidence.json').read_text())
            self.assertEqual(record['visualEvidence'], evidence[pathlib.Path(record['run']).name])
        self.assertEqual(evidence['run-01'], {'status': 'missing', 'captures': []})
        complete = evidence[captured.name]
        self.assertEqual(complete['status'], 'complete')
        self.assertEqual(complete['rendererSha256'], 'a' * 64)
        self.assertEqual(complete['sourceSha256'], judge.digest((captured / 'final.spec.json').read_bytes()))
        self.assertEqual(complete['uncovered'], [])
        self.assertEqual(complete['procedure'], judge.CAPTURE_PROCEDURE)
        self.assertEqual((complete['requiredViews'], len(complete['captures'])), (4, 4))
        self.assertEqual({(item['viewport'], item['pngWidth'], item['pngHeight']) for item in complete['captures']},
                         {('desktop', 1440, 1300), ('narrow', 800, 2100)})
        packet = self.output / 'packets' / manifest['runs'][1]['candidateId']
        self.assertEqual((packet / 'candidate/visual/narrow-1.png').read_bytes(),
                         (captured / 'visual/narrow-1.png').read_bytes())
        self.allow_judges(prompt=expected, reply=evidence_reply)
        report = judge.run_judges(self.output)
        self.assertEqual(report['profile'], profile)
        self.assertNotIn('rubricSha256', report)
        # Source-only review keeps its valid findings but has no headline score.
        missing, shown = report['runs']
        self.assertEqual(report['status'], 'incomplete')
        self.assertEqual((missing['status'], missing['validJudgments']), ('incomplete', 3))
        self.assertIsNone(missing['medianTotal'])
        self.assertIsNone(missing['medianPresentation'])
        self.assertIn('Visual evidence is missing', missing['evidenceBlockers'][0])
        self.assertEqual([row['score']['total'] for row in missing['judgments']], [100, 100, 100])
        self.assertEqual(missing['visualEvidence']['status'], 'missing')
        self.assertEqual((shown['status'], shown['medianTotal'], shown['medianPresentation']), ('complete', 100, 20))
        self.assertEqual(shown['medianPresentationDimensions'], dict.fromkeys(judge.PRESENTATION, 4))
        self.assertEqual(shown['evidenceBlockers'], [])
        self.assertEqual((shown['visualEvidence']['status'], shown['visualEvidence']['captures']), ('complete', 4))
        self.assertEqual(report['comparisonBlockers'], [])
        for invocation in (self.output / 'judgments').rglob('invocation.json'):
            self.assertEqual(json.loads(invocation.read_text())['profile'], profile)

    def test_partial_or_untrusted_visual_evidence_is_never_complete(self):
        self.profile()
        self.captured_run('run-01', omit=1)
        loose = self.author_run('run-02')
        (loose / 'visual').mkdir()
        (loose / 'visual/screen.png').write_bytes(png(1440, 1000))
        unlisted = self.captured_run('run-03')
        (unlisted / 'visual/extra.png').write_bytes(png(1440, 1000))
        header_only = self.captured_run('run-04')
        (header_only / 'visual/desktop-0.png').write_bytes(png(1440, 1300)[:33])
        other = self.captured_run('run-05', sourceSha256='0' * 64)
        near = self.captured_run('run-06', procedure={
            **judge.CAPTURE_PROCEDURE, 'viewports': [{'id': 'desktop', 'width': 1440, 'height': 1000},
                                                     {'id': 'narrow', 'width': 1439, 'height': 1000}]})
        scaled = self.captured_run('run-07', procedure={**judge.CAPTURE_PROCEDURE, 'deviceScaleFactor': 2})
        small = self.captured_run('run-08')
        (small / 'visual/narrow-0.png').write_bytes(png(800, 999))
        rows = {pathlib.Path(row['run']).name: row for row in self.prepare_profiled()['runs']}
        self.assertEqual(rows['run-01']['visualEvidence']['status'], 'partial')
        self.assertEqual(rows['run-01']['visualEvidence']['uncovered'], ['narrow: sections[0] path main step open'])
        for name, reason in [('run-02', 'manifest.json'), ('run-03', 'does not list'),
                             ('run-04', 'PNG'), ('run-05', 'accepted source'),
                             ('run-06', 'controlled capture procedure'), ('run-07', 'controlled capture procedure'),
                             ('run-08', 'smaller than its full-page viewport')]:
            with self.subTest(run=name):
                self.assertEqual(rows[name]['status'], 'incomplete')
                self.assertIn(reason, rows[name]['error'])
        # Partial evidence keeps reviews, but no headline, even if a reviewer defers nothing.
        self.allow_judges(prompt=(self.output / 'reviewer-prompt.md').read_bytes(),
                          reply=profiled_reply(profiled_score(None, 0)))
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual((row['status'], row['validJudgments'], row['medianTotal']), ('incomplete', 3, None))
        self.assertEqual(self.run.call_count, 3)

    def test_nested_tab_diagrams_must_be_captured_too(self):
        self.profile()
        diagram = {'nodes': {'cam': {'title': 'Camera'}}, 'rows': [['cam']], 'edges': [],
                   'steps': [{'id': 'start'}], 'paths': [{'id': 'night', 'steps': ['start']}]}
        spec = {'page': {'title': 'Mixed', 'blocks': [
            {'heading': 'Direct', 'diagram': diagram},
            {'tabs': [{'label': 'Detail', 'sections': [{'heading': 'Nested', 'diagram': diagram}]}]}]}}
        self.assertEqual(judge.required_views(spec), [('blocks[0]', 'night', 'start'),
                                                      ('blocks[1].tabs[0].sections[0]', 'night', 'start')])
        self.captured_run('run-01', spec=spec, sections={'blocks[0]'})
        self.captured_run('run-02', spec=spec)
        rows = self.prepare_profiled()['runs']
        self.assertEqual(rows[0]['visualEvidence']['status'], 'partial')
        self.assertEqual(rows[0]['visualEvidence']['uncovered'],
                         ['desktop: blocks[1].tabs[0].sections[0] path night step start',
                          'narrow: blocks[1].tabs[0].sections[0] path night step start'])
        self.assertEqual(rows[1]['visualEvidence']['status'], 'complete')

    def test_mixed_renderers_block_a_completed_comparison(self):
        self.profile()
        self.captured_run('run-01')
        self.captured_run('run-02', renderer='b' * 64)
        self.prepare_profiled()
        self.allow_judges(prompt=(self.output / 'reviewer-prompt.md').read_bytes(), reply=evidence_reply)
        report = judge.run_judges(self.output)
        self.assertEqual([row['status'] for row in report['runs']], ['complete', 'complete'])
        self.assertEqual(report['status'], 'incomplete')
        self.assertIn('mixes renderers', report['comparisonBlockers'][0])

    def test_evidence_blockers_suppress_profiled_headlines(self):
        def rows(**score):
            return [{'judge': index, 'status': 'valid', 'score': profiled_score(**score)} for index in (1, 2, 3)]
        headline = judge.aggregate(rows(presentation=presentation(), deferred=0), True, 'complete')
        self.assertEqual((headline['status'], headline['medianTotal']), ('complete', 100))
        for score, evidence, blocker in [({'presentation': presentation(), 'deferred': 1}, 'complete', 'deferred'),
                                         ({'presentation': None, 'deferred': 0}, 'complete', 'unscored'),
                                         ({'presentation': None, 'deferred': 0}, 'missing', 'missing'),
                                         ({'presentation': None, 'deferred': 0}, 'partial', 'partial')]:
            with self.subTest(score=score, evidence=evidence):
                result = judge.aggregate(rows(**score), True, evidence)
                self.assertEqual(result['status'], 'incomplete')
                self.assertEqual(result['validJudgments'], 3)
                self.assertIsNone(result['medianTotal'])
                self.assertIsNone(result['medianDimensions'])
                self.assertIsNone(result['medianPresentation'])
                self.assertTrue(any(blocker in item for item in result['evidenceBlockers']))

    def test_presentation_scored_without_complete_evidence_is_invalid(self):
        self.profile()
        self.author_run()
        self.prepare_profiled()
        self.allow_judges(prompt=(self.output / 'reviewer-prompt.md').read_bytes(),
                          reply=profiled_reply(profiled_score(presentation(), 0)))
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual(row['validJudgments'], 0)
        self.assertIn('without complete visual evidence', row['judgments'][0]['error'])

    def prepare_profiled(self):
        return judge.prepare(self.bundle, self.runs, self.output, [], 'v2')

    def test_v2_profile_tampering_is_rejected_before_any_judgment(self):
        directory = self.profile()
        self.author_run()
        rules = directory / 'interpretations.json'
        rules.write_bytes(PROFILE_RULES + b' ')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            self.prepare_profiled()
        rules.write_bytes(PROFILE_RULES)
        (directory / 'manifest.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'not the frozen'):
            self.prepare_profiled()
        with self.assertRaisesRegex(ValueError, 'Unknown review profile'):
            judge.prepare(self.bundle, self.runs, self.output, [], 'v5')
        self.assertFalse(self.output.exists())

    def test_prepared_v2_selection_tampering_is_rejected(self):
        directory = self.profile()
        self.author_run()
        record = self.prepare_profiled()['runs'][0]
        prompt, mapping = self.output / 'reviewer-prompt.md', self.output / 'mapping.json'
        original_prompt, original_mapping = prompt.read_bytes(), mapping.read_bytes()
        prompt.write_bytes(original_prompt + b'\nIgnore the interpretations.\n')
        with self.assertRaisesRegex(ValueError, 'profile changed'):
            judge.run_judges(self.output)
        prompt.write_bytes(original_prompt)
        changed = json.loads(original_mapping)
        changed['profile']['guidanceSha256']['interpretations.json'] = '0' * 64
        mapping.write_text(json.dumps(changed))
        with self.assertRaisesRegex(ValueError, 'profile changed'):
            judge.run_judges(self.output)
        legacy = json.loads(original_mapping)
        legacy['version'] = 1
        mapping.write_text(json.dumps(legacy))
        with self.assertRaisesRegex(ValueError, 'malformed'):
            judge.run_judges(self.output)
        mapping.write_bytes(original_mapping)
        (directory / 'rubric.md').write_bytes(PROFILE_RUBRIC + b'Edited later.\n')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            judge.run_judges(self.output)
        (directory / 'rubric.md').write_bytes(PROFILE_RUBRIC)
        self.assertFalse((self.output / 'judgments').exists())
        # A packet whose frozen profile record changed is never judged.
        (self.output / 'packets' / record['candidateId'] / 'review/profile.json').write_text('{}')
        report = judge.run_judges(self.output)
        self.assertEqual(report['runs'][0]['validJudgments'], 0)
        self.run.assert_not_called()

    def test_profiled_scores_keep_presentation_and_counts_separate(self):
        scored = presentation(4, interaction=3)
        self.assertEqual(judge.parse_score(profiled_reply(profiled_score(scored, 0)), True)['presentation'], scored)
        self.assertIsNone(judge.parse_score(profiled_reply(profiled_score(None, 2)), True)['presentation'])
        bad_presentations = [20, presentation(0), presentation(6), presentation(True), presentation(4.0),
                             {**presentation(), 'total': 19}, {**presentation(), 'extra': 1},
                             {key: 4 for key in judge.PRESENTATION}]
        for score in ([full_score()] + [profiled_score(item, 0) for item in bad_presentations]
                      + [{**profiled_score(None, 0), 'rendererIssues': -1},
                         {**profiled_score(None, 0), 'deferredFindings': None},
                         {**profiled_score(None, 0), 'total': 125}]):
            with self.subTest(score=score), self.assertRaises(ValueError):
                judge.parse_score(profiled_reply(score, rows=[]), True)
        with self.assertRaises(ValueError):
            judge.parse_score(profiled_reply(profiled_score(scored, 0)))
        # Presentation totals and dimensions aggregate separately from correctness.
        rows = [{'judge': index, 'status': 'valid', 'score': profiled_score(presentation(value), 0)}
                for index, value in enumerate([4, 5, 3], 1)]
        result = judge.aggregate(rows, True, 'complete')
        self.assertEqual((result['status'], result['medianTotal'], result['medianPresentation']),
                         ('complete', 100, 20))
        self.assertEqual(result['medianPresentationDimensions'], dict.fromkeys(judge.PRESENTATION, 4))
        # A true deferral stays independently covered and blocks the headline.
        rows[1]['score'] = profiled_score(presentation(5), 1)
        deferred = judge.aggregate(rows, True, 'complete')
        self.assertEqual((deferred['status'], deferred['medianTotal'], deferred['medianPresentation']),
                         ('incomplete', None, None))

    def test_issue_rows_must_match_their_counts(self):
        complete = profiled_score(presentation(), 0)
        # A written deferral with deferredFindings 0 can never headline a complete score.
        hidden = profiled_reply(complete, rows=['- deferred | 0 | step open | Phone viewport not captured.',
                                                'renderer | 0 | disclosure | Provenance text is visible.'])
        with self.assertRaisesRegex(ValueError, 'deferredFindings'):
            judge.parse_score(hidden, True)
        table = profiled_reply(profiled_score(None, 1, renderer=1), rows=[
            '| renderer | 0 | disclosure | Provenance text is visible. |',
            '2. `deferred` | 0 | step open | Needs the narrow capture.'])
        self.assertEqual(judge.parse_score(table, True)['deferredFindings'], 1)
        for row in ['deferred | 0 | step open', 'deferred | -2 | step open | Deducted anyway.',
                    'renderer | 0 |  | No location.', 'deferred |']:
            with self.subTest(row=row), self.assertRaisesRegex(ValueError, 'Malformed'):
                judge.parse_score(profiled_reply(profiled_score(None, 1, renderer=0), rows=[row]), True)
        with self.assertRaisesRegex(ValueError, 'rendererIssues'):
            judge.parse_score(profiled_reply(profiled_score(None, 0, renderer=2), rows=[
                'renderer | 0 | disclosure | Provenance text is visible.']), True)
        # Legacy replies are parsed exactly as before; issue rows are not counted.
        self.assertEqual(judge.parse_score('deferred | 0 | x | y\n' + final_reply()), full_score())
        # The run path rejects the mismatch before any aggregation.
        self.profile()
        self.captured_run('run-01')
        self.prepare_profiled()
        self.allow_judges(prompt=(self.output / 'reviewer-prompt.md').read_bytes(), reply=hidden)
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual((row['status'], row['validJudgments'], row['medianTotal']), ('incomplete', 0, None))

    def v3_profile(self):
        """A synthetic v3 profile pinned by its manifest hash, with correctness-row validation."""
        directory = self.directory / 'review-v3'
        directory.mkdir()
        (directory / 'rubric.md').write_bytes(V3_RUBRIC)
        (directory / 'interpretations.json').write_bytes(V3_RULES)
        manifest = json.dumps({'profile': 'authoring-review-v3', 'files': [
            {'path': 'rubric.md', 'sha256': judge.digest(V3_RUBRIC)},
            {'path': 'interpretations.json', 'sha256': judge.digest(V3_RULES)}]}).encode()
        (directory / 'manifest.json').write_bytes(manifest)
        self.enterContext(mock.patch.dict(judge.PROFILES, {'v3': {
            'id': 'authoring-review-v3', 'directory': directory,
            'manifestSha256': judge.digest(manifest), 'correctnessRows': True}}))
        return directory

    def test_v3_rows_accept_atomic_units_and_floor_only_the_criterion(self):
        def parse(text):
            return judge.parse_score(text, True, profile='v3')
        # Five separate story-level labels, and a sixth beyond the cap: the score floors at 0.
        for count in (5, 6):
            rows = ['level | -2 | node n{} | Service name in a label.'.format(index) for index in range(count)]
            self.assertEqual(parse(v3_reply(profiled_score(None, 0, level=0), rows))['level'], 0)
        # The single no-question-batch unit is -10: validation is category-specific.
        self.assertEqual(parse(v3_reply(profiled_score(None, 0, questions=0),
                                        ['questions | -10 | QUESTIONS.md | No batch before starting.']))['questions'], 0)
        for key, allowed in judge.DEDUCTIONS.items():
            for amount in allowed:
                with self.subTest(key=key, amount=amount):
                    score = profiled_score(None, 0, **{key: judge.CAPS[key] - amount})
                    rows = ['{} | -{} | step one | One unit.'.format(key, amount)]
                    self.assertEqual(parse(v3_reply(score, rows)), score)
        # List, numbered, table, backticked and U+2212 forms; a table header is not a row.
        score = profiled_score(presentation(4), 0, renderer=1, panels=10, time=18)
        rows = ['| category | points | location | reason |', '|---|---|---|---|',
                '| panels | -3 | step open | Clip not shown. |', '- `panels` | −2 | step open | Icon mismatch.',
                '1. time | -2 | step dawn | Caption time differs.']
        issues = ['presentation | 4 | {} | Clear.'.format(name) for name in judge.PRESENTATION] + [
            'renderer | 0 | disclosure | Provenance text is visible.']
        self.assertEqual(parse(v3_reply(score, rows, issues)), score)
        self.assertEqual(judge.parse_score(v3_reply(score, rows, issues), profile='v3'), score)
        # Renderer, deferred and presentation rows are never correctness units.
        self.assertEqual(parse(v3_reply(profiled_score(None, 2, renderer=3)))['total'], 100)

    def test_v3_rows_reject_grouped_unknown_malformed_and_inconsistent_rows(self):
        def rejected(text, message):
            with self.assertRaisesRegex(ValueError, message):
                judge.parse_score(text, True, profile='v3')
        # The observed grouped pattern: one row totalling several -2 units.
        rejected(v3_reply(profiled_score(None, 0, level=0), ['level | -10 | page | Five labels.']), 'level row must')
        rejected(v3_reply(profiled_score(None, 0, level=4), ['level | -6 | page | Three labels.']), 'level row must')
        for key, allowed in judge.DEDUCTIONS.items():
            for amount in set(range(1, judge.CAPS[key] + 1)) - set(allowed):
                with self.subTest(key=key, amount=amount):
                    rejected(v3_reply(profiled_score(None, 0, **{key: judge.CAPS[key] - amount}),
                                      ['{} | -{} | step one | Grouped.'.format(key, amount)]), key + ' row must')
        for points in ['2', '+2', '0', '-0', '-2.0', '-02', 'two', '- 2']:
            with self.subTest(points=points):
                rejected(v3_reply(profiled_score(None, 0, level=8), ['level | {} | node | Label.'.format(points)]),
                         'level row must')
        for row in ['fit | -2 | node | Label.', 'Fit to the technical level | -2 | node | Label.',
                    'total | -2 | page | Summary.', 'Correctness | 98 | page | Summary.']:
            with self.subTest(row=row):
                rejected(v3_reply(profiled_score(None, 0, level=8), ['level | -2 | node | Label.', row]),
                         'Unknown deduction category')
        for row in ['level | -2 | node', 'level | -2 |  | Label.', 'level | -2 | node | Label. | Extra.',
                    'level |', 'level | | node | Label.']:
            with self.subTest(row=row):
                rejected(v3_reply(profiled_score(None, 0, level=8), [row]), 'Malformed correctness row')
        # Score and rows must agree in both directions.
        rejected(v3_reply(profiled_score(None, 0), ['panels | -3 | open | Clip not shown.']), 'panels score 15')
        rejected(v3_reply(profiled_score(None, 0, panels=12), []), 'panels score 12')
        rejected(v3_reply(profiled_score(None, 0, time=15), ['time | -2 | a | One.', 'time | -2 | b | Two.']),
                 'time score 15')
        # Issue-row counts are still checked separately.
        rejected(v3_reply(profiled_score(None, 1, renderer=0), issues=[]), 'deferredFindings')

    def test_v2_and_legacy_parsing_are_unchanged_by_v3_rows(self):
        grouped = v3_reply(profiled_score(None, 0, level=0), ['level | -10 | page | Five labels.'])
        self.assertEqual(judge.parse_score(grouped, True)['level'], 0)
        self.assertEqual(judge.parse_score(grouped, True, profile='v2')['level'], 0)
        with self.assertRaisesRegex(ValueError, 'level row must'):
            judge.parse_score(grouped, True, profile='v3')
        # The v2 helper's unscored `panels | -3` row stays acceptable to v2 only.
        v2 = profiled_reply(profiled_score(None, 0))
        self.assertEqual(judge.parse_score(v2, True), judge.parse_score(v2, profile='v2'))
        with self.assertRaisesRegex(ValueError, 'panels score 15'):
            judge.parse_score(v2, profile='v3')
        self.assertEqual(judge.parse_score('level | -10 | x | y\n' + final_reply()), full_score())
        for name in ['v1', 'v5', '']:
            with self.subTest(profile=name), self.assertRaisesRegex(ValueError, 'Unknown review profile'):
                judge.parse_score(v2, True, profile=name)

    def test_v3_rows_are_enforced_through_preparation_and_judging(self):
        self.v3_profile()
        self.captured_run('run-01')
        manifest = judge.prepare(self.bundle, self.runs, self.output, [], 'v3')
        expected = V3_RUBRIC.rstrip(b'\n') + b'\n' + judge.PROFILE_SEPARATOR + V3_RULES
        self.assertEqual((manifest['profile']['name'], manifest['profile']['id']), ('v3', 'authoring-review-v3'))
        self.assertEqual((self.output / 'reviewer-prompt.md').read_bytes(), expected)
        grouped = v3_reply(profiled_score(presentation(), 0, level=0), ['level | -10 | page | Five labels.'])
        self.allow_judges(prompt=expected, reply=grouped)
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual((row['status'], row['validJudgments'], row['medianTotal']), ('incomplete', 0, None))
        self.assertTrue(all('level row must' in item['error'] for item in row['judgments']))
        # The same candidate with atomic rows is complete.
        self.output = self.directory / 'atomic-judges'
        judge.prepare(self.bundle, self.runs, self.output, [], 'v3')
        rows = ['level | -2 | node n{} | Service name in a label.'.format(index) for index in range(5)]
        self.allow_judges(prompt=expected, reply=v3_reply(profiled_score(presentation(), 0, level=0), rows))
        report = judge.run_judges(self.output)
        self.assertEqual((report['status'], report['runs'][0]['medianTotal']), ('complete', 90))
        self.assertEqual(report['profile']['name'], 'v3')
        for invocation in (self.output / 'judgments').rglob('invocation.json'):
            self.assertEqual(json.loads(invocation.read_text())['profile']['id'], 'authoring-review-v3')

    def test_v3_profile_and_prepared_prompt_tampering_are_rejected(self):
        directory = self.v3_profile()
        self.author_run()
        rules = directory / 'interpretations.json'
        rules.write_bytes(V3_RULES + b' ')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            judge.prepare(self.bundle, self.runs, self.output, [], 'v3')
        rules.write_bytes(V3_RULES)
        manifest = directory / 'manifest.json'
        original = manifest.read_bytes()
        manifest.write_bytes(original + b'\n')
        with self.assertRaisesRegex(ValueError, 'not the frozen authoring-review-v3'):
            judge.prepare(self.bundle, self.runs, self.output, [], 'v3')
        manifest.write_bytes(original)
        self.assertFalse(self.output.exists())
        judge.prepare(self.bundle, self.runs, self.output, [], 'v3')
        prompt = self.output / 'reviewer-prompt.md'
        prompt.write_bytes(prompt.read_bytes().replace(b'One deduction unit per row.', b'Group units freely.'))
        with self.assertRaisesRegex(ValueError, 'profile changed'):
            judge.run_judges(self.output)
        self.assertFalse((self.output / 'judgments').exists())
        self.run.assert_not_called()

    def test_repository_v3_profile_is_frozen_and_changes_only_the_three_clarifications(self):
        v2 = ROOT / 'tests/fixtures/authoring-evaluation/review-v2'
        v3 = ROOT / 'tests/fixtures/authoring-evaluation/review-v3'
        # The frozen v2 bytes are untouched.
        self.assertEqual(judge.digest((v2 / 'manifest.json').read_bytes()), judge.PROFILES['v2']['manifestSha256'])
        self.assertEqual(sorted(path.name for path in v3.iterdir()), ['interpretations.json', 'manifest.json', 'rubric.md'])
        record, prompt = judge.load_profile('v3')
        self.assertEqual((record['name'], record['id']), ('v3', 'authoring-review-v3'))
        self.assertTrue(judge.PROFILES['v3']['correctnessRows'])
        for name in judge.PROFILE_FILES:
            self.assertIn((v3 / name).read_bytes().strip(), prompt)
        # Rubric: only the profile name, the unit rule, and the output row/host lines differ.
        old, new = (v2 / 'rubric.md').read_text().split('\n'), (v3 / 'rubric.md').read_text().split('\n')
        self.assertEqual(len(old), len(new))
        self.assertEqual([index for index, (a, b) in enumerate(zip(old, new)) if a != b], [0, 18, 42, 47])
        self.assertEqual(new[0], old[0].replace('authoring-review-v2', 'authoring-review-v3'))
        self.assertIn('level | -6', new[42])
        self.assertIn('floored at 0', new[47])
        # Interpretations: one new rule; two rules clarified; everything else identical.
        old, new = [json.loads((path / 'interpretations.json').read_text()) for path in (v2, v3)]
        self.assertEqual(new['profile'], 'authoring-review-v3')
        self.assertEqual((new['status'], new['limitations']), (old['status'], old['limitations']))
        old_rules = {rule['id']: rule['decision'] for rule in old['rules']}
        new_rules = {rule['id']: rule['decision'] for rule in new['rules']}
        ids = [rule['id'] for rule in old['rules']]
        ids.insert(ids.index('provenance-chrome') + 1, 'story-level-role-labels')
        self.assertEqual([rule['id'] for rule in new['rules']], ids)
        self.assertEqual({key for key in old_rules if old_rules[key] != new_rules[key]},
                         {'freshness-and-hidden-fields', 'units'})
        self.assertTrue(new_rules['units'].startswith(old_rules['units']))
        self.assertIn("'Clip storage' is permitted", new_rules['story-level-role-labels'])
        self.assertNotIn('may receive one panel-state contradiction', new_rules['freshness-and-hidden-fields'])
        self.assertIn('One carried hidden value is one authored state', new_rules['freshness-and-hidden-fields'])

    def v4_profile(self):
        """A synthetic v4 profile pinned by its manifest hash, with correctness-row validation."""
        directory = self.directory / 'review-v4'
        directory.mkdir()
        (directory / 'rubric.md').write_bytes(V4_RUBRIC)
        (directory / 'interpretations.json').write_bytes(V4_RULES)
        manifest = json.dumps({'profile': 'authoring-review-v4', 'files': [
            {'path': 'rubric.md', 'sha256': judge.digest(V4_RUBRIC)},
            {'path': 'interpretations.json', 'sha256': judge.digest(V4_RULES)}]}).encode()
        (directory / 'manifest.json').write_bytes(manifest)
        self.enterContext(mock.patch.dict(judge.PROFILES, {'v4': {
            'id': 'authoring-review-v4', 'directory': directory,
            'manifestSha256': judge.digest(manifest), 'correctnessRows': True}}))
        return directory

    def test_scoring_contract_and_earlier_profile_pins_are_unchanged(self):
        self.assertEqual(judge.CAPS, FROZEN_CAPS)
        self.assertEqual(sum(judge.CAPS.values()), 100)
        self.assertEqual(judge.DEDUCTIONS, FROZEN_DEDUCTIONS)
        self.assertEqual(judge.PRESENTATION, FROZEN_PRESENTATION)
        self.assertEqual(judge.SEPARATE_ROWS, ('presentation', 'renderer', 'deferred'))
        for name, value in FROZEN_MANIFESTS.items():
            self.assertEqual(judge.PROFILES[name]['manifestSha256'], value)
        self.assertEqual({name: bool(spec.get('correctnessRows')) for name, spec in judge.PROFILES.items()},
                         {'v2': False, 'v3': True, 'v4': True})
        self.assertEqual((judge.PROFILES['v4']['id'], pathlib.Path(judge.PROFILES['v4']['directory'])),
                         ('authoring-review-v4', ROOT / 'tests/fixtures/authoring-evaluation/review-v4'))

    def test_v4_rows_are_validated_exactly_like_v3(self):
        def outcome(text, profile):
            try:
                return judge.parse_score(text, True, profile=profile)
            except ValueError as error:
                return 'rejected: ' + str(error)
        atomic = v3_reply(profiled_score(None, 0, level=0),
                          ['level | -2 | node n{} | Service name in a label.'.format(index) for index in range(6)])
        grouped = v3_reply(profiled_score(None, 0, level=4), ['level | -6 | page | Three labels.'])
        unknown = v3_reply(profiled_score(None, 0, level=8), ['fit | -2 | node | Label.'])
        malformed = v3_reply(profiled_score(None, 0, level=8), ['level | -2 | node'])
        unscored = v3_reply(profiled_score(None, 0), ['panels | -3 | open | Clip not shown.'])
        texts = [atomic, grouped, unknown, malformed, unscored,
                 v3_reply(profiled_score(presentation(4, interaction=3), 1, renderer=2, panels=10, time=18)),
                 v3_reply(profiled_score(None, 0, questions=0), ['questions | -10 | QUESTIONS.md | No batch.']),
                 v3_reply(profiled_score(None, 1, renderer=0), issues=[]), profiled_reply(profiled_score(None, 0))]
        for key in judge.CAPS:
            for amount in range(1, judge.CAPS[key] + 1):
                texts.append(v3_reply(profiled_score(None, 0, **{key: judge.CAPS[key] - amount}),
                                      ['{} | -{} | step one | One unit.'.format(key, amount)]))
        for text in texts:
            with self.subTest(text=text):
                self.assertEqual(outcome(text, 'v4'), outcome(text, 'v3'))
        # Spot checks, so equality cannot hide a regression shared by both profiles.
        self.assertEqual(outcome(atomic, 'v4')['level'], 0)
        self.assertIn('level row must', outcome(grouped, 'v4'))
        self.assertIn('Unknown deduction category', outcome(unknown, 'v4'))
        self.assertIn('Malformed correctness row', outcome(malformed, 'v4'))
        self.assertIn('panels score 15', outcome(unscored, 'v4'))
        self.assertIn('panels score 15', outcome(profiled_reply(profiled_score(None, 0)), 'v4'))
        self.assertEqual(outcome(profiled_reply(profiled_score(None, 0)), 'v2')['panels'], 15)

    def test_v4_renderer_rows_never_become_correctness_deductions(self):
        legend = 'renderer | 0 | response legend | Built-in response/ack legend copy is visible.'
        self.assertEqual(judge.parse_score(v3_reply(profiled_score(None, 0, renderer=1), [], [legend]),
                                           profile='v4')['level'], 10)
        # Authored protocol wording is a scored level row, never an unscored one.
        authored = 'level | -2 | caption s3 | Caption names the acknowledgement protocol.'
        with self.assertRaisesRegex(ValueError, 'level score 10'):
            judge.parse_score(v3_reply(profiled_score(None, 0, renderer=1), [authored], [legend]), profile='v4')
        self.assertEqual(judge.parse_score(v3_reply(profiled_score(None, 0, renderer=1, level=8), [authored], [legend]),
                                           profile='v4')['level'], 8)
        with self.assertRaisesRegex(ValueError, 'Malformed renderer row'):
            judge.parse_score(v3_reply(profiled_score(None, 0, renderer=1), [],
                                       ['renderer | -2 | response legend | Protocol wording.']), profile='v4')
        # An unapproved call and a misplaced code reference keep -1 each; wrong binding fields keep -3.
        rows = ['backstage | -1 | step s2 | Caption asserts an unapproved call.',
                'backstage | -1 | step s4 | Code reference where that code does not run.',
                'backstage | -3 | node api | Wrong binding fields.']
        self.assertEqual(judge.parse_score(v3_reply(profiled_score(None, 0, backstage=10), rows),
                                           profile='v4')['backstage'], 10)
        # A charge that violates a stated rate stays one -3 unit; grouped charge rows stay rejected.
        self.assertEqual(judge.parse_score(v3_reply(profiled_score(None, 0, time=17), [
            'time | -3 | step s5 | Charge violates the stated gross rate.']), profile='v4')['time'], 17)
        with self.assertRaisesRegex(ValueError, 'time row must'):
            judge.parse_score(v3_reply(profiled_score(None, 0, time=14),
                                       ['time | -6 | steps s5-s6 | Two charge values.']), profile='v4')

    def test_v4_is_frozen_through_preparation_and_judging_and_rejects_tampering(self):
        directory = self.v4_profile()
        self.captured_run('run-01')
        rules, manifest = directory / 'interpretations.json', directory / 'manifest.json'
        rules.write_bytes(V4_RULES.replace(b'representative', b'every-step'))
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            judge.prepare(self.bundle, self.runs, self.output, [], 'v4')
        rules.write_bytes(V4_RULES)
        original = manifest.read_bytes()
        manifest.write_bytes(original.replace(b'authoring-review-v4', b'authoring-review-v3'))
        with self.assertRaisesRegex(ValueError, 'not the frozen authoring-review-v4'):
            judge.prepare(self.bundle, self.runs, self.output, [], 'v4')
        manifest.write_bytes(original)
        self.assertFalse(self.output.exists())
        mapping = judge.prepare(self.bundle, self.runs, self.output, [], 'v4')
        expected = V4_RUBRIC.rstrip(b'\n') + b'\n' + judge.PROFILE_SEPARATOR + V4_RULES
        profile = mapping['profile']
        self.assertEqual((mapping['version'], profile['name'], profile['id']), (2, 'v4', 'authoring-review-v4'))
        self.assertEqual(profile['guidanceSha256'], {'rubric.md': judge.digest(V4_RUBRIC),
                                                     'interpretations.json': judge.digest(V4_RULES)})
        self.assertEqual(profile['promptSha256'], judge.digest(expected))
        self.assertEqual((self.output / 'reviewer-prompt.md').read_bytes(), expected)
        packet = self.output / 'packets' / mapping['runs'][0]['candidateId']
        self.assertEqual(json.loads((packet / 'review/profile.json').read_text()), profile)
        # A preparation cannot be relabelled to another profile or judged with edited guidance.
        path, prompt = self.output / 'mapping.json', self.output / 'reviewer-prompt.md'
        original_mapping, original_prompt = path.read_bytes(), prompt.read_bytes()
        relabelled = json.loads(original_mapping)
        relabelled['profile'].update(name='v3', id='authoring-review-v3')
        path.write_text(json.dumps(relabelled))
        with self.assertRaisesRegex(ValueError, 'profile changed'):
            judge.run_judges(self.output)
        path.write_bytes(original_mapping)
        prompt.write_bytes(original_prompt.replace(b'One deduction unit per row.', b'Group units freely.'))
        with self.assertRaisesRegex(ValueError, 'profile changed'):
            judge.run_judges(self.output)
        prompt.write_bytes(original_prompt)
        rules.write_bytes(V4_RULES + b'\n')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            judge.run_judges(self.output)
        rules.write_bytes(V4_RULES)
        self.assertFalse((self.output / 'judgments').exists())
        self.run.assert_not_called()
        # Judging parses with v4 rows: a grouped total is invalid; atomic rows complete.
        grouped = v3_reply(profiled_score(presentation(), 0, level=0), ['level | -10 | page | Five labels.'])
        self.allow_judges(prompt=expected, reply=grouped)
        row = judge.run_judges(self.output)['runs'][0]
        self.assertEqual((row['status'], row['validJudgments'], row['medianTotal']), ('incomplete', 0, None))
        self.assertTrue(all('level row must' in item['error'] for item in row['judgments']))
        self.output = self.directory / 'atomic-judges'
        judge.prepare(self.bundle, self.runs, self.output, [], 'v4')
        rows = ['level | -2 | node n{} | Service name in a label.'.format(index) for index in range(5)]
        self.allow_judges(prompt=expected, reply=v3_reply(profiled_score(presentation(), 0, level=0), rows))
        report = judge.run_judges(self.output)
        self.assertEqual((report['status'], report['runs'][0]['medianTotal'], report['runs'][0]['medianPresentation']),
                         ('complete', 90, 20))
        for invocation in (self.output / 'judgments').rglob('invocation.json'):
            self.assertEqual(json.loads(invocation.read_text())['profile']['id'], 'authoring-review-v4')

    def test_repository_v4_profile_is_frozen_and_adds_only_the_three_clarifications(self):
        base = ROOT / 'tests/fixtures/authoring-evaluation'
        v3, v4 = base / 'review-v3', base / 'review-v4'
        # Earlier profiles still load from their unchanged frozen bytes.
        for name, value in FROZEN_MANIFESTS.items():
            self.assertEqual(judge.digest((base / ('review-' + name) / 'manifest.json').read_bytes()), value)
            self.assertEqual(judge.load_profile(name)[0]['manifestSha256'], value)
        self.assertEqual(sorted(path.name for path in v4.iterdir()), ['interpretations.json', 'manifest.json', 'rubric.md'])
        record, prompt = judge.load_profile('v4')
        self.assertEqual((record['name'], record['id']), ('v4', 'authoring-review-v4'))
        self.assertEqual(prompt, (v4 / 'rubric.md').read_bytes().rstrip(b'\n') + b'\n' + judge.PROFILE_SEPARATOR
                         + (v4 / 'interpretations.json').read_bytes())
        manifest = json.loads((v4 / 'manifest.json').read_text())
        self.assertEqual((manifest['version'], manifest['profile']), (1, 'authoring-review-v4'))
        # Rubric: v3's bytes with only its profile identifier changed.
        old, new = (v3 / 'rubric.md').read_bytes(), (v4 / 'rubric.md').read_bytes()
        self.assertEqual(old.count(b'authoring-review-v3'), 1)
        self.assertEqual(new, old.replace(b'authoring-review-v3', b'authoring-review-v4'))
        # Interpretations: three decisions gain exactly their clarification; nothing else changes.
        old, new = [json.loads((path / 'interpretations.json').read_text()) for path in (v3, v4)]
        self.assertEqual((old['profile'], new['profile']), ('authoring-review-v3', 'authoring-review-v4'))
        self.assertEqual(list(new), list(old))
        self.assertEqual((new['status'], new['limitations']), (old['status'], old['limitations']))
        self.assertEqual([rule['id'] for rule in new['rules']], [rule['id'] for rule in old['rules']])
        self.assertTrue(all(list(rule) == ['id', 'decision'] for rule in new['rules']))
        old_rules = {rule['id']: rule['decision'] for rule in old['rules']}
        new_rules = {rule['id']: rule['decision'] for rule in new['rules']}
        self.assertEqual({key for key in old_rules if old_rules[key] != new_rules[key]}, set(V4_CLARIFICATIONS))
        text = (v3 / 'interpretations.json').read_text().replace('"authoring-review-v3"', '"authoring-review-v4"', 1)
        for key, added in V4_CLARIFICATIONS.items():
            self.assertEqual(new_rules[key], old_rules[key] + ' ' + added)
            self.assertIsNone(re.search('[0-9]', added))  # no values, scores or answer key
            before = json.dumps(old_rules[key], ensure_ascii=False)
            self.assertEqual(text.count(before), 1)
            text = text.replace(before, json.dumps(new_rules[key], ensure_ascii=False))
        # Byte for byte, v4 is v3 with only those edits.
        self.assertEqual((v4 / 'interpretations.json').read_text(), text)


if __name__ == '__main__':
    unittest.main()
