"""Offline HTTP ingestion tests. All writes stay in temporary synthetic datasets."""
import base64
import copy
import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / 'tools/arrange-training/serve.py'
SPEC = importlib.util.spec_from_file_location('arrange_review_server', SOURCE)
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=')


class ReviewServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='synthetic-arrange-review-')
        cls.root = Path(cls.temp.name)
        cls.dataset = cls.root / 'dataset'
        cls.dataset.mkdir()
        (cls.dataset / 'public').mkdir()
        cls.manifest = {'version': 1, 'datasetId': 'synthetic-test-only', 'datasetVersion': 'v1',
                        'datasetPurpose': 'synthetic-test', 'title': 'Synthetic 36-pair test', 'pairs': []}
        for i in range(36):
            pair = {'id': f'graph-{i}', 'title': f'Test graph {i}', 'batch': i // 12 + 1,
                    'nodeCount': 2, 'edgeCount': 1}
            for label in ('A', 'B'):
                name = f'public/g{i}-{label}'
                data = json.dumps({'synthetic': True, 'index': i, 'variant': label}).encode()
                (cls.dataset / (name + '.json')).write_bytes(data)
                (cls.dataset / (name + '.png')).write_bytes(PNG)
                pair[label] = {'id': f'candidate-{i}-{label}', 'sha256': hashlib.sha256(data).hexdigest(),
                               'spec': name + '.json', 'png': name + '.png'}
            cls.manifest['pairs'].append(pair)
        (cls.dataset / 'manifest.json').write_text(json.dumps(cls.manifest))
        cls.server = S.make_server(cls.dataset, cls.root / 'submissions', port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, method, route, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        h = {'Origin': self.origin, 'Content-Type': 'application/json'}
        h.update(headers or {})
        connection.request(method, route, body=body, headers=h)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def payload(self, reviewer='synthetic-browser-test'):
        pair = self.manifest['pairs'][0]
        return {'datasetId': self.manifest['datasetId'], 'datasetVersion': 'v1',
                'manifestSha256': self.server.dataset.digest, 'reviewerId': reviewer,
                'choices': [{'pairId': pair['id'], 'choice': 'B', **{
                    label: {key: pair[label][key] for key in ('id', 'sha256')} for label in ('A', 'B')}}]}

    def post(self, payload, headers=None):
        status, _, body = self.request('POST', '/api/submissions', json.dumps(payload), headers)
        return status, json.loads(body)

    def test_page_assets_and_36_pair_batch_manifest(self):
        status, headers, body = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'localStorage', body)
        self.assertIn(b"input.type='radio'", body)
        self.assertIn(b"fetch('/api/submissions'", body)
        self.assertIn('frame-ancestors', headers['Content-Security-Policy'])
        status, _, body = self.request('GET', '/api/manifest')
        manifest = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual([sum(p['batch'] == b for p in manifest['pairs']) for b in (1, 2, 3)], [12, 12, 12])
        status, headers, body = self.request('GET', '/files/' + self.manifest['pairs'][0]['A']['png'])
        self.assertEqual((status, headers['Content-Type'], body), (200, 'image/png', PNG))
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_partial_submission_and_revision_preserve_exact_evidence(self):
        payload = self.payload('synthetic-revisions')
        status, first = self.post(payload)
        self.assertEqual(status, 201)
        self.assertEqual(first['count'], 1)
        first_path = self.root / 'submissions' / ('submission-' + first['submissionId'] + '.json')
        original = first_path.read_bytes()
        record = json.loads(original)
        self.assertEqual(record['choices'], payload['choices'])
        self.assertEqual(record['source'], 'synthetic-comparison-test')
        self.assertEqual(record['datasetVersion'], 'v1')
        self.assertEqual(record['manifestSha256'], self.server.dataset.digest)
        self.assertTrue(record['submittedAt'])
        payload['choices'][0]['choice'] = 'Neither'
        status, second = self.post(payload)
        self.assertEqual(status, 201)
        self.assertNotEqual(first['submissionId'], second['submissionId'])
        self.assertEqual(second['previousSubmissionId'], first['submissionId'])
        self.assertEqual(second['revision'], 2)
        self.assertEqual(first_path.read_bytes(), original)
        payload['choices'][0]['choice'] = 'Tie'
        self.assertEqual(self.post(payload)[0], 201)

    def test_stale_invalid_missing_and_malformed_choices_are_rejected(self):
        mutations = [lambda p: p.update(datasetVersion='stale'), lambda p: p.update(manifestSha256='0' * 64),
                     lambda p: p['choices'][0].update(pairId='not-known'), lambda p: p['choices'][0]['A'].update(sha256='0' * 64),
                     lambda p: p['choices'][0]['B'].update(id='different'), lambda p: p['choices'][0].update(choice='C'),
                     lambda p: p.update(choices=[]), lambda p: p['choices'].append(copy.deepcopy(p['choices'][0])),
                     lambda p: p['choices'][0].update(pairId=[]), lambda p: p['choices'][0].update(choice={}),
                     lambda p: p.update(reviewerId='../outside')]
        for mutate in mutations:
            payload = self.payload()
            mutate(payload)
            self.assertEqual(self.post(payload)[0], 400)
        self.assertEqual(self.request('POST', '/api/submissions', '{')[0], 400)

    def test_traversal_cross_origin_host_and_body_limits(self):
        for route in ['/files/../manifest.json', '/files/%2e%2e/manifest.json', '/files/%252e%252e/manifest.json', '/files//etc/passwd', '/files/public/../../manifest.json', '/manifest.json']:
            self.assertEqual(self.request('GET', route)[0], 404)
        for origin in ['https://other.example', 'null', '']:
            self.assertEqual(self.post(self.payload(), {'Origin': origin})[0], 403)
        self.assertEqual(self.post(self.payload(), {'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request('GET', '/', headers={'Host': 'attacker.example'})[0], 403)
        self.assertEqual(self.request('POST', '/api/submissions', b'x', {'Content-Length': str(S.MAX_BODY + 1)})[0], 413)
        self.assertEqual(self.post(self.payload(), {'Content-Type': 'text/plain'})[0], 415)

    def test_failed_write_never_returns_success(self):
        with mock.patch.object(self.server.store, 'save', side_effect=OSError('disk failure')):
            status, result = self.post(self.payload())
        self.assertEqual(status, 500)
        self.assertIn('draft is retained', result['error'])
        self.assertNotIn('saved', result)

    def test_durable_write_fsync_failure_is_reported_and_existing_evidence_survives(self):
        payload = self.payload('synthetic-fsync-failure')
        status, first = self.post(payload)
        self.assertEqual(status, 201)
        with mock.patch.object(S.os, 'fsync', side_effect=OSError('fsync failed')):
            self.assertEqual(self.post(payload)[0], 500)
        self.assertTrue((self.root / 'submissions' / ('submission-' + first['submissionId'] + '.json')).exists())
        self.assertFalse(list((self.root / 'submissions').glob('.pending-*')))

    def test_startup_validates_spec_hash_and_freezes_served_bytes(self):
        candidate = self.manifest['pairs'][0]['A']
        file = self.dataset / candidate['spec']
        original = file.read_bytes()
        try:
            file.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                S.Dataset(self.dataset)
            self.assertEqual(self.request('GET', '/files/' + candidate['spec'])[2], original)
        finally:
            file.write_bytes(original)


if __name__ == '__main__':
    unittest.main()
