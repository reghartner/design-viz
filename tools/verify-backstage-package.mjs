/* Acceptance tests for the artifact a company installs, not the source tree.
 * Prerequisite: npm ci in apps/backstage, Node 24+. Run from any directory:
 *   node tools/verify-backstage-package.mjs
 * --skip-build checks an already-built dist; --tarball PATH checks an existing
 * artifact without rebuilding or packing. Every consumer install ignores scripts.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const source = fileURLToPath(new URL('../apps/backstage/', import.meta.url));
const fixtures = fileURLToPath(new URL('./backstage-package-fixtures/', import.meta.url));
const toolRequire = createRequire(path.join(source, 'package.json'));
const { build } = toolRequire('esbuild');
const ts = toolRequire('typescript');
const { rollup } = await import(pathToFileURL(toolRequire.resolve('rollup')).href);
const { dts } = await import(pathToFileURL(toolRequire.resolve('rollup-plugin-dts')).href);
const temp = await realpath(await mkdtemp(path.join(tmpdir(), 'flowview-packed-consumer-')));
const consumer = path.join(temp, 'consumer');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = { ...process.env };
delete environment.NODE_PATH; // No ambient fallback to upstream dependencies.
let fixtureServer;

function checkManifest(manifest) {
  for (const entry of ['.', './reference-proxy', './new-frontend', './backend']) {
    assert.ok(manifest.exports?.[entry], 'Missing public package export: ' + entry);
    assert.doesNotMatch(JSON.stringify(manifest.exports[entry]), /(?:^|["/])src\//,
      'Consumers must receive built exports rather than TypeScript source.');
  }
  assert.notEqual(manifest.private, true, 'The tarball must be publishable.');
}

async function run(command, args, cwd, { quiet = false, ...extra } = {}) {
  try {
    const result = await runFile(command, args, {
      cwd, env: environment, encoding: 'utf8', timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024, ...extra,
    });
    if (!quiet && result.stdout) process.stdout.write(result.stdout);
    return result;
  } catch (error) {
    throw new Error(command + ' ' + args.join(' ') + '\n' +
      (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + error.message);
  }
}

async function files(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.map(async entry => {
    const name = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? files(path.join(directory, entry.name), name) : [name];
  }));
  return lists.flat();
}

function checkGraph(result, { core = false } = {}) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = path.resolve(consumer, input);
    assert.ok(absolute.startsWith(consumer + path.sep), 'Bundle escaped installed consumer: ' + input);
    assert.doesNotMatch(input, /(?:^|\/)@backstage\//, 'Core consumer resolved a Backstage dependency.');
    if (core) assert.doesNotMatch(input, /(?:reference-proxy|new-frontend|EntityFlowviewContent|plugin\.tsx)/,
      'Root bundle pulled in an optional adapter.');
  }
}

async function checkDeclarations() {
  const config = {
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      lib: ['ES2022', 'DOM'], jsx: 'react-jsx', strict: true,
      noEmit: true, skipLibCheck: false, types: ['react', 'react-dom'],
    },
    include: ['consumer.tsx', 'commonjs.cts', 'consumer-api.d.ts'],
  };
  await writeFile(path.join(consumer, 'tsconfig.json'), JSON.stringify(config, null, 2));
  await run(process.execPath, [toolRequire.resolve('typescript/bin/tsc'), '--project', 'tsconfig.json'], consumer);
  const bundle = await rollup({
    input: path.join(consumer, 'consumer-api.d.ts'),
    external: id => /^(?:react|react-dom)(?:\/|$)/.test(id),
    plugins: [dts({ respectExternal: true, compilerOptions: {
      strict: true, skipLibCheck: false,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    } })],
    onwarn(warning) { throw new Error('Declaration bundler: ' + warning.message); },
  });
  try {
    await bundle.write({ file: path.join(consumer, 'bundled-contract.d.ts'), format: 'es' });
  } finally { await bundle.close(); }
  const declarations = await readFile(path.join(consumer, 'bundled-contract.d.ts'), 'utf8');
  assert.doesNotMatch(declarations, /@flowview\/backstage-plugin|@backstage\//,
    'Downstream declaration bundling must expand the installed plugin without Backstage types.');
  for (const name of ['DiagramLoader', 'SpecLoader', 'EntityDiagrams', 'AssociatedDiagram',
    'DiagramSection', 'DiagramStep', 'ViewerTarget', 'EntityDiagramIndex', 'CanonEntry']) {
    assert.match(declarations, new RegExp('\\b' + name + '\\b'));
  }
  config.include = ['bundled-contract.d.ts'];
  await writeFile(path.join(consumer, 'tsconfig-bundled.json'), JSON.stringify(config, null, 2));
  await run(process.execPath, [toolRequire.resolve('typescript/bin/tsc'), '--project', 'tsconfig-bundled.json'], consumer);
  console.log('Packed types pass strict ESM/CJS TypeScript and downstream declaration bundling (no allowJs).');
}

async function checkBackend() {
  const deployed = path.join(temp, 'deployed');
  await mkdir(deployed);
  const spec = await readFile(path.join(consumer, 'spec.json'));
  fixtureServer = createServer((request, response) => {
    if (request.url !== '/approved/recording.json') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(spec);
  });
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject);
    fixtureServer.listen(0, '127.0.0.1', resolve);
  });
  const url = 'http://127.0.0.1:' + fixtureServer.address().port + '/approved/recording.json';
  const cjsSource = (await readFile(path.join(consumer, 'backend.mjs'), 'utf8'))
    .replace("import assert from 'node:assert/strict';", "const assert = require('node:assert/strict');")
    .replace("import { buildEntityDiagramIndex, diagramsForEntity, parseCanonManifest, materializeCanonSpec } from '@flowview/backstage-plugin/backend';",
      "const { buildEntityDiagramIndex, diagramsForEntity, parseCanonManifest, materializeCanonSpec } = require('@flowview/backstage-plugin/backend');");
  await writeFile(path.join(consumer, 'backend.cjs'), cjsSource);
  for (const format of ['esm', 'cjs']) {
    const outfile = path.join(deployed, 'backend.' + (format === 'esm' ? 'mjs' : 'cjs'));
    const result = await build({
      absWorkingDir: consumer, entryPoints: [format === 'esm' ? 'backend.mjs' : 'backend.cjs'], outfile,
      bundle: true, platform: 'node', target: 'node24', format,
      metafile: true, minify: true, logLevel: 'silent',
    });
    checkGraph(result);
    assert.ok(Object.keys(result.metafile.inputs).some(input =>
      input.endsWith('/dist/backend.' + (format === 'esm' ? 'js' : 'cjs'))),
      'Backend bundle did not use the published ' + format + ' export condition.');
    for (const output of Object.values(result.metafile.outputs)) {
      for (const dependency of output.imports) {
        assert.doesNotMatch(dependency.path, /^(?:node:)?(?:fs|vm)(?:\/|$)/,
          'Published backend must not load files or compile source at runtime.');
      }
    }
    const code = await readFile(outfile, 'utf8');
    assert.doesNotMatch(code, /\b__dirname\b|\beval\s*\(|\bnew Function\s*\(/);
    assert.ok(!code.includes(source), 'Backend retained a path to its build checkout.');
    // No checkout, package directory, or fixture source may be read at runtime.
    // This still permits the real fetch against the local company-owned spec URL.
    await run(process.execPath, ['--permission', '--allow-fs-read=' + deployed, outfile, url], deployed);
  }
  await new Promise(resolve => fixtureServer.close(resolve));
  fixtureServer = undefined;
}

async function checkOptionalFrontend() {
  const manifest = JSON.parse(await readFile(path.join(consumer, 'node_modules/@flowview/backstage-plugin/package.json'), 'utf8'));
  const peers = Object.keys(manifest.peerDependencies || {}).filter(name => name.startsWith('@backstage/'));
  assert.ok(peers.length > 0, 'Backstage adapters must declare optional host peers.');
  for (const name of peers) {
    assert.equal(manifest.peerDependenciesMeta?.[name]?.optional, true, name + ' must be an optional peer.');
    toolRequire.resolve(name); // The independent adapter host has its own Backstage toolchain.
  }
  const adapterHost = path.join(temp, 'adapter-host');
  await mkdir(adapterHost);
  // The opt-in adapter is bundled independently. Host Backstage packages stay
  // external, as in an application build, but each is resolved from installed peers.
  const result = await build({
    stdin: { contents: `
      export { default } from '@flowview/backstage-plugin/new-frontend';
      export { EntityFlowviewContent, createDiagramLoader, createSpecLoader } from '@flowview/backstage-plugin/reference-proxy';`,
      resolveDir: consumer, sourcefile: 'company-new-frontend.ts' },
    outfile: path.join(adapterHost, 'plugin.mjs'), bundle: true, platform: 'browser',
    format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent',
    plugins: [{ name: 'company-backstage-host', setup(builder) {
      builder.onResolve({ filter: /^@backstage\// }, args => {
        toolRequire.resolve(args.path);
        return { path: args.path, external: true };
      });
    } }],
  });
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports.map(item => item.path));
  assert.ok(imports.some(name => name.startsWith('@backstage/')), 'Optional new frontend adapter did not retain its host API imports.');
  console.log('Optional proxy and new frontend exports bundle separately against resolvable Backstage host peers.');
}

try {
  const args = process.argv.slice(2);
  const tarballFlag = args.indexOf('--tarball');
  let tarball;
  if (tarballFlag >= 0) {
    assert.ok(args[tarballFlag + 1], '--tarball needs a path.');
    tarball = path.resolve(args[tarballFlag + 1]);
  } else {
    if (!args.includes('--skip-build')) await run(npm, ['run', 'build'], source);
    const packed = await run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], source, { quiet: true });
    const artifact = JSON.parse(packed.stdout)[0];
    tarball = path.join(temp, artifact.filename);
    console.log('Packed ' + artifact.id + ' (' + artifact.entryCount + ' files, ' + artifact.size + ' bytes).');
  }
  const archived = await run('tar', ['-xOf', tarball, 'package/package.json'], temp, { quiet: true });
  const archivedManifest = JSON.parse(archived.stdout);
  checkManifest(archivedManifest);
  await mkdir(consumer);
  await cp(fixtures, consumer, { recursive: true });
  const upstream = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const dependency = name => upstream.devDependencies[name];
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'independent-company-flowview-consumer', version: '1.0.0', private: true,
    type: 'module', dependencies: {
      '@flowview/backstage-plugin': 'file:' + tarball,
      react: dependency('react'), 'react-dom': dependency('react-dom'),
      '@types/react': dependency('@types/react'), '@types/react-dom': dependency('@types/react-dom'),
    },
  }, null, 2));
  await run(npm, ['install', '--ignore-scripts', '--omit=optional', '--no-fund', '--no-audit', '--package-lock=false'], consumer);
  const installed = path.join(consumer, 'node_modules/@flowview/backstage-plugin');
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(manifest, archivedManifest, 'Installing with scripts disabled must preserve the packed manifest.');
  const requireConsumer = createRequire(path.join(consumer, 'package.json'));
  for (const subpath of ['', '/reference-proxy', '/new-frontend', '/backend']) {
    assert.ok(requireConsumer.resolve('@flowview/backstage-plugin' + subpath).startsWith(installed + '/dist/'),
      'CommonJS subpath must resolve to the installed dist: ' + subpath);
  }
  const packageFiles = await files(installed);
  assert.ok(packageFiles.some(name => name.startsWith('dist/')));
  for (const name of packageFiles) {
    assert.doesNotMatch(name, /(?:^|\/)(?:src|tests|node_modules|tools)\//,
      'Tarball ships internal source or tooling: ' + name);
    assert.ok(!/\.(?:tsx?|mts|cts)$/.test(name) || /\.d\.(?:ts|mts|cts)$/.test(name),
      'Tarball ships uncompiled TypeScript: ' + name);
  }
  const installedFiles = await files(path.join(consumer, 'node_modules'));
  assert.ok(!installedFiles.some(name => /(?:^|\/)@backstage\//.test(name)),
    'A React-only installation must contain zero Backstage packages.');
  console.log('Tarball installs prebuilt files with scripts disabled and no Backstage dependencies.');

  const core = await build({
    absWorkingDir: consumer, entryPoints: ['consumer.tsx'], outfile: path.join(consumer, 'core-browser.mjs'),
    bundle: true, platform: 'browser', target: 'es2022', format: 'esm',
    metafile: true, logLevel: 'silent',
  });
  checkGraph(core, { core: true });
  assert.ok(Object.keys(core.metafile.inputs).some(name => name.includes('@flowview/backstage-plugin/dist/')),
    'Core browser bundle did not consume installed dist.');
  console.log('Core browser bundle resolves only installed React and package dist; optional adapters are absent.');
  await checkDeclarations();
  await run(process.execPath, ['runtime.mjs'], consumer, {
    env: { ...environment, FLOWVIEW_CONSUMER_JSDOM: pathToFileURL(toolRequire.resolve('jsdom')).href },
    timeout: 30_000,
  });
  await checkBackend();
  await checkOptionalFrontend();
  console.log('All packed Backstage package consumer checks passed.');
} finally {
  if (fixtureServer) await new Promise(resolve => fixtureServer.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
