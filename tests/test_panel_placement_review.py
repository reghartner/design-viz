"""Synthetic ingestion tests; never open or write a human submission directory."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'tools/arrange-training/serve.py'
SPEC = importlib.util.spec_from_file_location('panel_review', SOURCE)
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=')

class PanelReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='synthetic-panel-review-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'public').mkdir()
        self.spec = {'page': {'sections': [{'diagram': {'panels': [{'id': 'p', 'type': 'state', 'initial': {'state': 'Ready'}}], 'layouts': [{'id': 'one', 'sectionLayout': {'columns': 24, 'default': [{'x': 0, 'y': 0, 'w': 24, 'h': 10}, {'panel': 'p', 'x': 0, 'y': 10, 'w': 24, 'h': 8}, {'controls': 'steps', 'x': 0, 'y': 18, 'w': 24, 'h': 4}]}}]}}]}}
        pair = {'id': 'synthetic-1', 'split': 'review', 'panelCount': 1, 'panelTypes': ['state'], 'capture': {'width': 1, 'height': 1}, 'contentSha256': S.sha(S.panel_semantics(self.spec))}
        for label in ['A', 'B']:
            spec = copy.deepcopy(self.spec)
            if label == 'B':
                spec['page']['sections'][0]['diagram']['layouts'][0]['sectionLayout']['default'][1]['w'] = 18
            data = json.dumps(spec).encode()
            (self.root / f'public/{label}.json').write_bytes(data)
            (self.root / f'public/{label}.png').write_bytes(PNG)
            pair[label] = {'id': label, 'sha256': S.sha(data), 'pngSha256': S.sha(PNG), 'spec': f'public/{label}.json', 'png': f'public/{label}.png'}
        self.manifest = {'version': 1, 'reviewMode': 'panel-layout', 'datasetPurpose': 'synthetic-test', 'datasetId': 'synthetic', 'datasetVersion': 'v1', 'pairs': [pair]}
        self.write()
    def write(self):
        (self.root / 'manifest.json').write_text(json.dumps(self.manifest))
    def payload(self, dataset, choice='Both', reason='The grouping helps.'):
        pair = self.manifest['pairs'][0]
        return {'datasetId': 'synthetic', 'datasetVersion': 'v1', 'manifestSha256': dataset.digest, 'reviewerId': 'synthetic-browser', 'choices': [{'pairId': pair['id'], 'choice': choice, 'reason': reason, **{label: {k: pair[label][k] for k in ('id', 'sha256', 'pngSha256')} for label in ('A', 'B')}}]}
    def test_both_neither_reason_and_cleared_reason_remain_distinct_durable_revisions(self):
        dataset = S.Dataset(self.root)
        store = S.Store(self.root / 'synthetic-submissions')
        for choice, reason in [('Both', 'Both arrangements work.'), ('Neither', 'Too tall.'), ('A', '')]:
            payload = self.payload(dataset, choice, reason)
            record = store.save(dataset, payload, dataset.validate(payload))
            self.assertEqual(record['source'], 'synthetic-comparison-test')
            self.assertEqual(record['reviewMode'], 'panel-layout')
            self.assertEqual(record['choices'][0]['choice'], choice)
            self.assertEqual(record['choices'][0].get('reason', ''), reason)
            self.assertEqual(record['choices'][0]['A']['pngSha256'], S.sha(PNG))
        self.assertEqual(len(list(store.directory.glob('submission-*.json'))), 3)
        for choice, reason in [('Tie', ''), ('Both', 'x' * 501), ('Both', [])]:
            with self.assertRaises(ValueError):
                dataset.validate(self.payload(dataset, choice, reason))
    def test_submission_directory_cannot_be_inside_served_dataset(self):
        with self.assertRaisesRegex(ValueError, 'outside'):
            S.make_server(self.root, self.root / 'human-submissions', port=0)

    def test_panel_image_content_holdout_geometry_and_metadata_tampering_are_refused(self):
        original = copy.deepcopy(self.manifest)
        for change in [lambda m: m['pairs'][0].update(split='holdout'), lambda m: m['pairs'][0]['A'].update(pngSha256='0' * 64), lambda m: m['pairs'][0].update(contentSha256='0' * 64), lambda m: m['pairs'][0].update(panelCount=8), lambda m: m['pairs'][0]['capture'].update(width=200)]:
            self.manifest = copy.deepcopy(original)
            change(self.manifest)
            self.write()
            with self.assertRaises(ValueError): S.Dataset(self.root)
        for mutate in [lambda s: s['page']['sections'][0]['diagram']['layouts'][0]['sectionLayout'].update(columns=12), lambda s: s['page']['sections'][0]['diagram']['panels'][0]['initial'].update(state='Changed'), lambda s: s['page']['sections'][0]['diagram']['layouts'][0]['sectionLayout']['default'][1].update(w=25), lambda s: s['page']['sections'][0]['diagram']['layouts'][0]['sectionLayout']['default'][1].update(y=0)]:
            self.manifest = copy.deepcopy(original)
            spec = copy.deepcopy(self.spec)
            mutate(spec)
            data = json.dumps(spec).encode()
            (self.root / 'public/B.json').write_bytes(data)
            self.manifest['pairs'][0]['B']['sha256'] = S.sha(data)
            self.write()
            with self.assertRaises(ValueError): S.Dataset(self.root)

if __name__ == '__main__': unittest.main()
