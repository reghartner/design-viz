"""Offline authoring-judge contracts; external processes are always mocked."""

import contextlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
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

    def allow_judges(self, missing=None, error=None, mutate=False):
        def run(command, **kwargs):
            final = pathlib.Path(command[command.index('-o') + 1])
            self.assertEqual(kwargs['input'], RUBRIC)
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
                final.write_text(final_reply())
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


if __name__ == '__main__':
    unittest.main()
