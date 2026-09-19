import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
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
