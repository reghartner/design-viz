import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, access, symlink, readdir, realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {vendorFlowview} from '../fixtures/designer/scripts/vendor-flowview.mjs';
import {preparePluginPackage} from '../fixtures/mock/scripts/install-backstage.mjs';
const exec = promisify(execFile);
const setup = fileURLToPath(new URL('../fixtures/mock/scripts/setup-sandbox.mjs', import.meta.url));
async function file(root, name, content) {
  await mkdir(path.dirname(path.join(root, name)), {recursive: true});
  await writeFile(path.join(root, name), content);
}

test('repeat setup records package source without copying a plugin or changing credentials and sibling files', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'native-setup-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const designer = path.join(temp, 'designer'), mock = path.join(temp, 'mock');
  await mkdir(mock);
  await file(designer, 'apps/backstage/package.json', JSON.stringify({name: '@flowview/backstage-plugin'}));
  await file(designer, 'apps/backstage/src/private-source.ts', 'publisher source');
  await file(mock, 'sandbox/backstage/plugins/other/keep.txt', 'other plugin');
  await exec(process.execPath, [setup, designer], {cwd: mock});
  const secrets = await readFile(path.join(mock, '.local/secrets.json'), 'utf8');
  const source = await readFile(path.join(mock, '.local/designer.json'), 'utf8');
  assert.equal(JSON.parse(source).source, await realpath(designer));
  await assert.rejects(exec(process.execPath, [setup, path.join(temp, 'missing')], {cwd: mock}));
  assert.equal(await readFile(path.join(mock, '.local/designer.json'), 'utf8'), source);
  await exec(process.execPath, [setup, designer], {cwd: mock});
  await assert.rejects(access(path.join(mock, 'sandbox/backstage/plugins/flowview')), {code: 'ENOENT'});
  await assert.rejects(access(path.join(mock, 'sandbox/backstage/node_modules')), {code: 'ENOENT'});
  assert.equal(await readFile(path.join(mock, 'sandbox/backstage/plugins/other/keep.txt'), 'utf8'), 'other plugin');
  assert.equal(await readFile(path.join(mock, '.local/secrets.json'), 'utf8'), secrets);
  const {backend: {csp}} = JSON.parse(await readFile(path.join(mock, 'sandbox/backstage/app-config.local.yaml'), 'utf8'));
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.deepEqual(csp['script-src-elem'], ["'self'"]);
  assert.ok(csp['font-src'].includes('data:'));
  assert.ok(csp['img-src'].includes('data:'));
  assert.equal(csp['frame-src'], undefined);
});

test('install preparation builds and packs the publisher, and changed bytes refresh the local dependency', {timeout: 60000}, async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'native-package-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const designer = path.join(temp, 'designer'), mock = path.join(temp, 'mock');
  const publisher = path.join(designer, 'apps/backstage');
  const sandbox = path.join(mock, 'sandbox/backstage');
  await mkdir(mock);
  const manifest = {name: '@flowview/backstage-plugin', version: '1.0.0', files: ['dist'], scripts: {build: 'node build.mjs'}};
  await file(publisher, 'package.json', JSON.stringify(manifest));
  await file(publisher, 'package-lock.json', JSON.stringify({name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: {'': manifest}}));
  await file(publisher, 'src/private-source.ts', 'publisher source must not enter the host');
  await file(publisher, 'build.mjs', "import {mkdir,readFile,writeFile} from 'node:fs/promises'; await mkdir('dist',{recursive:true}); await writeFile('dist/index.js',await readFile('value.txt'));\n");
  await file(publisher, 'value.txt', 'export const version = 1;\n');
  const originalApp = {name: 'app', private: true, dependencies: {'other-plugin': '1.2.3', '@flowview/backstage-plugin': 'file:../../.local/flowview-backstage-plugin.tgz'}};
  await file(sandbox, 'packages/app/package.json', JSON.stringify(originalApp));
  await file(sandbox, 'plugins/other/keep.txt', 'other plugin');
  await exec(process.execPath, [setup, designer], {cwd: mock});
  const secrets = await readFile(path.join(mock, '.local/secrets.json'), 'utf8');
  // This real publisher has no external dependencies: npm ci/build/pack exercise
  // the install boundary without downloading the full Backstage workspace.
  const first = await preparePluginPackage(mock);
  assert.match(path.basename(first), /^flowview-backstage-plugin-[a-f0-9]{64}\.tgz$/);
  assert.equal((await exec('tar', ['-xOf', first, 'package/dist/index.js'])).stdout, 'export const version = 1;\n');
  assert.doesNotMatch((await exec('tar', ['-tzf', first])).stdout, /private-source|build\.mjs|value\.txt/);
  assert.equal(await preparePluginPackage(mock), first, 'Unchanged package bytes keep the dependency stable');
  await file(publisher, 'value.txt', 'export const version = 2;\n');
  const second = await preparePluginPackage(mock);
  assert.notEqual(second, first, 'A rebuild at the same version cannot reuse the stale Yarn file locator');
  assert.equal((await exec('tar', ['-xOf', second, 'package/dist/index.js'])).stdout, 'export const version = 2;\n');
  const app = JSON.parse(await readFile(path.join(sandbox, 'packages/app/package.json'), 'utf8'));
  assert.deepEqual(app, {...originalApp, dependencies: {...originalApp.dependencies, '@flowview/backstage-plugin': 'file:../../.local/' + path.basename(second)}});
  await assert.rejects(access(path.join(sandbox, 'plugins/flowview')), {code: 'ENOENT'});
  assert.equal(await readFile(path.join(sandbox, 'plugins/other/keep.txt'), 'utf8'), 'other plugin');
  assert.equal(await readFile(path.join(mock, '.local/secrets.json'), 'utf8'), secrets);
  assert.deepEqual((await readdir(path.join(mock, '.local'))).sort(), ['designer.json', 'secrets.json']);
});

test('runtime vendoring preserves package build inputs and excludes unrelated private files', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'native-vendor-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const source = path.join(temp, 'source'), designer = path.join(temp, 'designer');
  await mkdir(source);
  await mkdir(designer);
  await file(source, 'LICENSE', 'fixture license');
  await file(source, 'apps/backstage/src/generated/nativeViewer.js', 'export const native=true;');
  await file(source, 'src/compatibility.d.ts', 'export interface CompatibilityReport {}');
  await file(source, 'src/native/mount.d.ts', 'export interface NativeViewer {}');
  await file(source, 'tools/canon/entity-diagrams.d.mts', 'export function buildEntityDiagramIndex(): unknown;');
  await file(source, 'company-private.txt', 'DO_NOT_VENDOR');
  for (const args of [['init', '--quiet'], ['config', 'user.name', 'Fixture'], ['config', 'user.email', 'fixture@example.test'], ['remote', 'add', 'origin', 'https://github.com/fixture/runtime'], ['add', '.'], ['commit', '--quiet', '-m', 'Native fixture']])
    await exec('git', args, {cwd: source});
  await file(designer, 'apps/backstage/viewer/frame.js', 'retired');
  await file(designer, 'specs/company.json', 'company data');
  await vendorFlowview(source, designer);
  await assert.rejects(access(path.join(designer, 'apps/backstage/viewer/frame.js')), {code: 'ENOENT'});
  await assert.rejects(access(path.join(designer, 'company-private.txt')), {code: 'ENOENT'});
  assert.equal(await readFile(path.join(designer, 'specs/company.json'), 'utf8'), 'company data');
  for (const name of ['LICENSE', 'src/compatibility.d.ts', 'src/native/mount.d.ts', 'tools/canon/entity-diagrams.d.mts', 'apps/backstage/src/generated/nativeViewer.js'])
    assert.equal(await readFile(path.join(designer, name), 'utf8'), await readFile(path.join(source, name), 'utf8'));
  await assert.rejects(vendorFlowview(source, source), /separate designer/);
  const alias = path.join(temp, 'source-alias');
  await symlink(source, alias, 'dir');
  await assert.rejects(vendorFlowview(source, alias), /separate designer/);
  await assert.rejects(vendorFlowview(source, path.join(alias, 'new-designer')), /separate designer/);
  assert.equal(await readFile(path.join(source, 'apps/backstage/src/generated/nativeViewer.js'), 'utf8'), 'export const native=true;');
});
