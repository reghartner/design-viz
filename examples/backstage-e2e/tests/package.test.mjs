import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, rm, writeFile, mkdir, symlink} from 'node:fs/promises';
import {request} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {options} from '../create.mjs';

const exec = promisify(execFile), require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const C = require(path.join(root, 'tools/canon/core.cjs'));
const {scan} = await import(pathToFileURL(path.join(root, 'tools/canon/drift.mjs')));
const {LocalGitSources} = await import(pathToFileURL(path.join(root, 'tools/canon/local-git.mjs')));
async function run(command, args, cwd) {
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  return exec(command, args, {cwd, env, encoding: 'utf8', maxBuffer: 4_000_000, timeout: 120000});
}
function rawGet(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = request({host: '127.0.0.1', port, path: pathname}, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {body += chunk;});
      response.on('end', () => resolve({status: response.statusCode, body}));
    });
    req.on('error', reject); req.end();
  });
}
async function checkPublicFileBoundaries(directory, modulePath, createName, prefix, publicDirectory, validPath) {
  const { [createName]: createServer } = await import(pathToFileURL(path.join(directory, modulePath)));
  const privateFile = path.join(directory, '.local/review-canary.txt');
  const shortcut = path.join(directory, publicDirectory, 'review-shortcut.txt');
  await mkdir(path.dirname(privateFile), {recursive: true});
  await writeFile(privateFile, 'FICTIONAL_PRIVATE_CANARY');
  await symlink(privateFile, shortcut);
  const server = createServer({token: 'fictional-test'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    assert.equal((await rawGet(port, validPath)).status, 200);
    for (const suffix of ['..%2f.local/review-canary.txt', '%2e%2e%2f.local/review-canary.txt', 'review-shortcut.txt']) {
      const response = await rawGet(port, prefix + suffix);
      assert.equal(response.status, 404, prefix + suffix);
      assert.doesNotMatch(response.body, /FICTIONAL_PRIVATE_CANARY/);
    }
    assert.equal((await rawGet(port, prefix + '%')).status, 400);
    assert.equal((await rawGet(port, '//[')).status, 400);
    assert.equal((await rawGet(port, '/health')).status, 200);
    assert.equal((await rawGet(port, validPath)).status, 200, 'Malformed URLs must not crash the server');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(shortcut); await rm(privateFile);
  }
}
test('repository inputs cannot become paths, shell fragments, or ambiguous identities', () => {
  assert.equal(options(['--out', '/tmp/new demo', '--owner', 'fictional-home']).mockRepo, 'backstage-designer-mock');
  for (const args of [
    ['--out', '/tmp/demo', '--owner', 'owner/other'],
    ['--out', '/tmp/demo', '--owner', 'owner', '--mock-repo', '../existing'],
    ['--out', '/tmp/demo', '--owner', 'owner', '--mock-repo', '$(touch stolen)'],
    ['--out', '/tmp/demo', '--owner', 'owner', '--mock-repo', 'SAME', '--designer-repo', 'same'],
    ['--out', '/tmp/demo', '--owner', 'owner', '--owner', 'other'],
  ]) assert.throws(() => options(args));
});
test('fresh portable repositories seed over HTTP, pin real code, and detect both experiments', {timeout: 180000}, async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'flowview-public-package-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  // Spaces in the destination and dots in repo names exercise argument/URL handling.
  const out = path.join(temporary, 'new company'), mock = path.join(out, 'sample.mock'), designer = path.join(out, 'sample.designer');
  const args = ['examples/backstage-e2e/create.mjs', '--out', out, '--owner', 'fixture-company', '--mock-repo', 'sample.mock', '--designer-repo', 'sample.designer'];
  const created = await run(process.execPath, args, root);
  assert.match(created.stdout, /Read 6 processed Backstage entities/);
  const catalog = JSON.parse(await readFile(path.join(designer, 'workbench/catalog.json')));
  assert.equal(catalog.services.length, 3);
  assert.equal(catalog.services.flatMap(s => s.apis).flatMap(a => a.operations).length, 4);
  const spec = JSON.parse(await readFile(path.join(designer, 'specs/doorbell.json')));
  assert.deepEqual(C.validateSpec(spec).errors, []);
  assert.deepEqual(C.compatibility.check(spec).messages, []);
  const references = C.references(spec).map(r => r.reference);
  assert.equal(references.length, 3);
  const baseline = (await run('git', ['rev-parse', 'main'], mock)).stdout.trim();
  for (const ref of references) {
    assert.equal(ref.repository, 'https://github.com/fixture-company/sample.mock');
    assert.equal(ref.revision, baseline);
    const source = (await run('git', ['show', ref.revision + ':' + ref.path], mock)).stdout;
    const located = C.locate(source, ref.anchor);
    assert.equal(located.startLine, ref.startLine);
    assert.equal(located.endLine, ref.endLine);
  }
  const runtime = JSON.parse(await readFile(path.join(designer, '.flowview/runtime.json')));
  assert.equal(runtime.revision, (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim());
  assert.equal(await readFile(path.join(designer, 'workbench/flowspec.html'), 'utf8'), await readFile(path.join(root, 'workbench/flowspec.html'), 'utf8'));
  await run('npm', ['test'], mock);
  await run('npm', ['test'], designer);
  await checkPublicFileBoundaries(mock, 'mock/server.mjs', 'createMockServer', '/files/catalog/', 'catalog', '/files/catalog-info.yaml');
  await checkPublicFileBoundaries(designer, 'server/server.mjs', 'createDesignerServer', '/workbench/', 'workbench', '/workbench/catalog.json');
  // Valid mixed-case IDs must work through both association and revision reads.
  const {createDesignerServer} = await import(pathToFileURL(path.join(designer, 'server/server.mjs')));
  const specFile = path.join(designer, 'specs/doorbell.json'), originalSpec = await readFile(specFile, 'utf8');
  const mixed = structuredClone(spec); mixed.page.canon.id = 'Doorbell';
  const caseServer = createDesignerServer({token: 'fictional-test'});
  await new Promise(resolve => caseServer.listen(0, '127.0.0.1', resolve));
  try {
    await writeFile(specFile, JSON.stringify(mixed));
    const base = 'http://127.0.0.1:' + caseServer.address().port;
    const headers = {Authorization: 'Bearer fictional-test'};
    const indexed = await (await fetch(base + '/api/canon/entity-diagrams?entityRef=component:home/recording-service', {headers})).json();
    assert.equal(indexed.diagrams[0].id, 'Doorbell');
    const published = await fetch(base + '/api/canon/specs/Doorbell?revision=' + indexed.diagrams[0].revision, {headers});
    assert.equal(published.status, 200);
    assert.equal((await published.json()).page.canon.id, 'Doorbell');
  } finally {
    await writeFile(specFile, originalSpec);
    await new Promise(resolve => caseServer.close(resolve));
  }
  const sources = new LocalGitSources({'https://github.com/fixture-company/sample.mock': mock});
  assert.equal((await scan([spec], sources)).findings.length, 0);
  await run('git', ['switch', 'codex/rehearsal-refactor'], mock);
  await run('npm', ['test'], mock);
  const harmless = (await scan([spec], sources)).findings;
  assert.equal(harmless.length, 1);
  assert.equal(harmless[0].error, undefined);
  assert.equal(harmless[0].impacts[0].targetId, 'request');
  await run('git', ['switch', 'codex/rehearsal-timeout'], mock);
  await assert.rejects(run(process.execPath, ['--test', 'contract.test.mjs'], mock), error => error.code === 1);
  const broken = (await scan([spec], sources)).findings;
  assert.equal(broken.length, 1);
  assert.equal(broken[0].error, undefined);
  assert.notEqual(broken[0].id, harmless[0].id);
  assert.match(broken[0].after.text, /timeoutMs: 50/);
  assert.equal(references[1].revision, baseline, 'No experiment auto-accepts a new baseline');
  await run('git', ['switch', 'main'], mock);
  assert.equal((await scan([spec], sources)).findings.length, 0);
  for (const directory of [mock, designer]) {
    assert.equal((await run('git', ['status', '--porcelain'], directory)).stdout.trim(), '');
    const tracked = (await run('git', ['ls-files'], directory)).stdout;
    assert.doesNotMatch(tracked, /(?:^|\n)(?:\.local\/|.*\.local\.yaml|.*node_modules\/|.*mock-read-key)/);
    assert.equal((await run('git', ['remote'], directory)).stdout.trim(), '', 'Local setup never publishes');
  }
  assert.equal((await run('git', ['check-ignore', '.local/secrets.json', 'sandbox/backstage/app-config.local.yaml', 'sandbox/backstage/plugins/flowview/package.json'], mock)).stdout.trim().split('\n').length, 3);
  const workflows = await readFile(path.join(designer, '.github/workflows/catalog-sync.yml'), 'utf8') + await readFile(path.join(designer, '.github/workflows/drift.yml'), 'utf8');
  assert.match(workflows, /repository: fixture-company\/sample\.mock/);
  assert.doesNotMatch(workflows, /reghartner\/backstage-designer|__MOCK_|auto-merge|gh pr merge/);
  const before = await readFile(path.join(designer, 'specs/doorbell.json'), 'utf8');
  await assert.rejects(run(process.execPath, args, root), /EEXIST/);
  assert.equal(await readFile(path.join(designer, 'specs/doorbell.json'), 'utf8'), before, 'Existing workspaces are never overwritten');
});
