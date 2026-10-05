#!/usr/bin/env python3
"""Local, dependency-free A/B review and durable human preference ingestion."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

MAX_BODY = 128 * 1024
CHOICES = {'A', 'B', 'Tie', 'Neither'}
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$')
DIGEST = re.compile(r'^[0-9a-f]{64}$')
APP = Path(__file__).with_name('review.html')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative_asset(root, name):
    if not isinstance(name, str) or not name or '\\' in name or '\x00' in name:
        raise ValueError('Invalid asset path')
    parts = name.split('/')
    if any(part in ('', '.', '..') for part in parts):
        raise ValueError('Invalid asset path')
    target = (root / name).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise ValueError('Asset is missing or outside dataset')
    return target


class Dataset:
    def __init__(self, root):
        self.root = Path(root).resolve()
        raw = (self.root / 'manifest.json').read_bytes()
        self.manifest = json.loads(raw)
        m = self.manifest
        if m.get('version') != 1 or not all(isinstance(m.get(k), str) and ID.fullmatch(m[k]) for k in ('datasetId', 'datasetVersion')):
            raise ValueError('Invalid dataset identity/version')
        if not isinstance(m.get('pairs'), list) or not 1 <= len(m['pairs']) <= 36:
            raise ValueError('Manifest needs 1..36 pairs')
        if m.get('datasetPurpose', 'human-review') not in ('human-review', 'synthetic-test'):
            raise ValueError('Invalid dataset purpose')
        self.pairs, self.assets = {}, {}
        batch_counts = {}
        for pair in m['pairs']:
            pid = pair.get('id')
            if not isinstance(pid, str) or not ID.fullmatch(pid) or pid in self.pairs:
                raise ValueError('Invalid or duplicate pair ID')
            batch = pair.get('batch', 1)
            if type(batch) is not int or batch < 1:
                raise ValueError('Invalid batch')
            batch_counts[batch] = batch_counts.get(batch, 0) + 1
            if batch_counts[batch] > 12:
                raise ValueError('A batch supports at most 12 pairs')
            for label in ('A', 'B'):
                candidate = pair.get(label, {})
                if not isinstance(candidate.get('id'), str) or not ID.fullmatch(candidate['id']) or not DIGEST.fullmatch(str(candidate.get('sha256', ''))):
                    raise ValueError('Invalid candidate identity/hash')
                for field in ('spec', 'png'):
                    name = candidate.get(field)
                    asset = relative_asset(self.root, name)
                    if field == 'png' and asset.suffix.lower() != '.png':
                        raise ValueError('Preview must be PNG')
                    data = asset.read_bytes()
                    if field == 'spec' and sha(data) != candidate['sha256']:
                        raise ValueError('Candidate spec hash mismatch')
                    # Freeze exact bytes at startup; changes on disk require restart/version update.
                    self.assets[name] = (data, 'image/png' if field == 'png' else 'application/json')
            if pair['A']['id'] == pair['B']['id']:
                raise ValueError('A/B candidate IDs must differ')
            self.pairs[pid] = pair
        self.digest = sha(raw)
        self.public = {**m, 'manifestSha256': self.digest}

    def validate(self, payload):
        if not isinstance(payload, dict):
            raise ValueError('Expected submission object')
        for key in ('datasetId', 'datasetVersion'):
            if payload.get(key) != self.manifest[key]:
                raise ValueError('Dataset changed; reload before submitting')
        if payload.get('manifestSha256') != self.digest:
            raise ValueError('Manifest changed; reload before submitting')
        if not isinstance(payload.get('reviewerId'), str) or not ID.fullmatch(payload['reviewerId']):
            raise ValueError('Invalid browser reviewer ID')
        choices = payload.get('choices')
        if not isinstance(choices, list) or not 1 <= len(choices) <= len(self.pairs):
            raise ValueError('Select at least one graph; partial submissions are welcome')
        seen, records = set(), []
        for item in choices:
            if not isinstance(item, dict):
                raise ValueError('Invalid choice')
            pid = item.get('pairId')
            if not isinstance(pid, str) or not isinstance(item.get('choice'), str) or pid not in self.pairs or pid in seen or item['choice'] not in CHOICES:
                raise ValueError('Invalid/duplicate graph ID or choice')
            seen.add(pid)
            pair = self.pairs[pid]
            for label in ('A', 'B'):
                expected = {k: pair[label][k] for k in ('id', 'sha256')}
                if item.get(label) != expected:
                    raise ValueError('Candidate identity/hash changed; reload before submitting')
            records.append({'pairId': pid, 'choice': item['choice'], **{
                label: {k: pair[label][k] for k in ('id', 'sha256')} for label in ('A', 'B')}})
        return records


class Store:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.lock = threading.Lock()

    def save(self, dataset, payload, choices):
        # Serialize revisions within this server. Every save is an immutable UUID file;
        # another process can neither overwrite evidence nor share a temp filename.
        with self.lock:
            self.directory.mkdir(parents=True, exist_ok=True)
            previous = []
            for file in self.directory.glob('submission-*.json'):
                record = json.loads(file.read_bytes())
                if (record.get('reviewerId') == payload['reviewerId'] and
                        record.get('datasetId') == dataset.manifest['datasetId'] and
                        record.get('datasetVersion') == dataset.manifest['datasetVersion'] and
                        record.get('manifestSha256') == dataset.digest):
                    previous.append(record)
            previous.sort(key=lambda r: (r['submittedAt'], r['submissionId']))
            identifier = str(uuid.uuid4())
            purpose = dataset.manifest.get('datasetPurpose', 'human-review')
            record = {'schemaVersion': 1, 'source': 'synthetic-comparison-test' if purpose == 'synthetic-test' else 'human-comparison-ui',
                      'datasetPurpose': purpose,
                      'evidenceKind': 'explicit-browser-selection',
                      'datasetId': dataset.manifest['datasetId'],
                      'datasetVersion': dataset.manifest['datasetVersion'],
                      'manifestSha256': dataset.digest, 'reviewerId': payload['reviewerId'],
                      'submissionId': identifier, 'submittedAt': datetime.now(timezone.utc).isoformat(),
                      'previousSubmissionId': previous[-1]['submissionId'] if previous else None,
                      'revision': len(previous) + 1,
                      'revisionScope': 'This browser and dataset version; latest submission replaces its selected-choice snapshot, while all earlier evidence is retained.',
                      'choices': choices}
            final = self.directory / ('submission-' + identifier + '.json')
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode='wb', prefix='.pending-', dir=self.directory, delete=False) as stream:
                    temporary = Path(stream.name)
                    stream.write((json.dumps(record, indent=2) + '\n').encode())
                    stream.flush()
                    os.fsync(stream.fileno())
                # Hard-link publication is atomic and refuses to replace existing files.
                os.link(temporary, final)
                temporary.unlink()
                temporary = None
                directory_fd = os.open(self.directory, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
            return record


def allowed_host(value, bound_host):
    try:
        parsed = urlsplit('http://' + value)
        host = parsed.hostname
        if not host or parsed.username or parsed.password or parsed.path:
            return False
        if host in {'localhost', socket.gethostname(), bound_host} - {'0.0.0.0', '::'}:
            return True
        address = ipaddress.ip_address(host)
        return address.is_private or address.is_loopback
    except ValueError:
        return False


def make_server(dataset, submissions, host='127.0.0.1', port=8770):
    data = Dataset(dataset)
    store = Store(submissions)

    class Handler(BaseHTTPRequestHandler):
        server_version = 'ArrangeReview/1'

        def send(self, status, content, content_type='application/json'):
            if isinstance(content, dict):
                content = json.dumps(content).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'same-origin')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.end_headers()
            self.wfile.write(content)

        def valid_host(self):
            if not allowed_host(self.headers.get('Host', ''), host):
                self.send(403, {'error': 'Use this server’s local IP address or localhost.'})
                return False
            return True

        def do_GET(self):
            if not self.valid_host():
                return
            url = urlsplit(self.path)
            route = unquote(url.path)
            if route in ('/', '/review'):
                self.send(200, APP.read_bytes(), 'text/html; charset=utf-8')
            elif route == '/api/manifest':
                self.send(200, data.public)
            elif route.startswith('/files/') and route[7:] in data.assets:
                content, mime = data.assets[route[7:]]
                self.send(200, content, mime)
            else:
                self.send(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.valid_host():
                return
            if self.path != '/api/submissions':
                self.send(404, {'error': 'Not found'})
                return
            expected = 'http://' + self.headers.get('Host', '')
            if self.headers.get('Origin') != expected or self.headers.get('Sec-Fetch-Site') in ('cross-site', 'same-site'):
                self.send(403, {'error': 'Submission must come from this review page. Reload its local address.'})
                return
            if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                self.send(415, {'error': 'Use a bounded application/json request.'})
                return
            try:
                length = int(self.headers.get('Content-Length', '-1'))
            except ValueError:
                length = -1
            if not 0 < length <= MAX_BODY:
                self.send(413, {'error': 'Submission is empty or too large.'})
                return
            self.connection.settimeout(10)
            try:
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError('Incomplete request; retry')
                payload = json.loads(raw)
                choices = data.validate(payload)
            except (ValueError, UnicodeError, TimeoutError) as error:
                self.send(400, {'error': str(error)})
                return
            try:
                record = store.save(data, payload, choices)
            except (OSError, ValueError):
                self.send(500, {'error': 'Server could not confirm a durable save. Your draft is retained. Retry or download a backup; ask the server operator to check disk space and permissions. A retry preserves any earlier record.'})
                return
            self.send(201, {'saved': True, 'submissionId': record['submissionId'], 'submittedAt': record['submittedAt'], 'revision': record['revision'], 'previousSubmissionId': record['previousSubmissionId'], 'count': len(choices)})

    server = ThreadingHTTPServer((host, port), Handler)
    server.dataset, server.store = data, store
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--submissions', required=True)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8770)
    args = parser.parse_args()
    server = make_server(args.dataset, args.submissions, args.host, args.port)
    print(f'Review server on http://{args.host}:{server.server_port}; {len(server.dataset.pairs)} pairs; submissions: {Path(args.submissions).resolve()}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
