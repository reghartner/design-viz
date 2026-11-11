'use strict';
/* #1322: tools/spec-text.js prints the text view of a spec file, resolving its
   topology imports like the reader, so it can serve as a git diff textconv. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {composeSources} = require('../tools/source-loader.cjs');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/spec-text.js');
const FIXTURE = path.join(__dirname, 'fixtures/text-view');
const BOARD = path.join(FIXTURE, 'board.json');
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], {cwd: ROOT, encoding: 'utf8'});
const runIn = (cwd, ...args) => spawnSync(process.execPath, [TOOL, ...args], {cwd, encoding: 'utf8'});

function expected(render){
  const C = {URL, TextEncoder};
  vm.createContext(C);
  vm.runInContext(composeSources(['canon.js', 'validator.js', 'core/text-view.js']), C);
  const read = name => JSON.parse(fs.readFileSync(path.join(FIXTURE, name), 'utf8'));
  const page = C.normalize(C.FlowTopology.materialize([read('board.json'), read('platform.json')])[0]);
  return render(C, C.textViewModel(page));
}

test('default flat output resolves the imports through the registry beside the spec', () => {
  const out = run(BOARD);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, expected((C, model) => C.textViewFlat(model)));
  assert.ok(out.stdout.includes('node delivery/platform::api origin imported tv-platform core as platform'));
  assert.equal(run(BOARD, '--format', 'flat').stdout, out.stdout);
  assert.equal(run(BOARD, '--resolve-imports', path.join(FIXTURE, 'registry.json')).stdout, out.stdout);
});

test('steps and elements formats match the module, including --queries and --path', () => {
  const steps = run(BOARD, '--format', 'steps', '--queries', 'full', '--path', 'refused');
  assert.equal(steps.status, 0, steps.stderr);
  assert.equal(steps.stdout, expected((C, model) => C.textViewSteps(model, {queries: 'full', pathId: 'refused'})));
  assert.match(steps.stdout, /IoT refuses the publish/);
  const names = run(BOARD, '--format', 'steps');
  assert.equal(names.stdout, expected((C, model) => C.textViewSteps(model, {queries: 'names'})));
  const elements = run(BOARD, '--format', 'elements');
  assert.equal(elements.status, 0, elements.stderr);
  assert.equal(elements.stdout, expected((C, model) => C.textViewElements(model)));
});

test('a spec without imports needs no registry', () => {
  const out = run(path.join(FIXTURE, 'platform.json'));
  assert.equal(out.status, 0, out.stderr);
  assert.ok(out.stdout.split('\n').includes('node api ticket PLAT-5'));
});

test('bad input exits non-zero with a clear message', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-text-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const missing = run(path.join(dir, 'nope.json'));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /nope\.json/);
  fs.writeFileSync(path.join(dir, 'broken.json'), '{"page": ');
  const broken = run(path.join(dir, 'broken.json'));
  assert.notEqual(broken.status, 0);
  assert.match(broken.stderr, /not valid JSON/);
  // Review cycle 1: an importing spec with no registry is printed unresolved
  // (exit 0, one stderr note) unless --strict-imports asks for the failure.
  fs.copyFileSync(BOARD, path.join(dir, 'board.json'));
  const orphan = run('--strict-imports', path.join(dir, 'board.json'));
  assert.notEqual(orphan.status, 0);
  assert.match(orphan.stderr, /tv-platform/);
  assert.match(orphan.stderr, /--resolve-imports/);
  const format = run(BOARD, '--format', 'grid');
  assert.notEqual(format.status, 0);
  assert.match(format.stderr, /--format/);
  assert.equal(run().status, 2);
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: node tools\/spec-text\.js/);
});

test('a spec copied alone prints unresolved with one note; --strict-imports and --resolve-imports fail', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-text-alone-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const spec = path.join(dir, 'board.json');
  fs.copyFileSync(BOARD, spec);
  for (const cwd of [dir, ROOT]){
    const out = runIn(cwd, spec);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(out.stdout.split('\n').includes('section delivery import platform tv-platform core unresolved'), out.stdout);
    assert.ok(out.stdout.includes('section delivery import.platform.nodeTracking.api.tickets PLAT-7'));
    assert.equal(out.stderr.trim().split('\n').length, 1, out.stderr);
    assert.match(out.stderr, /^spec-text: note: .*tv-platform.*--resolve-imports/);
  }
  const quiet = runIn(dir, '--no-resolve-imports', spec);
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stderr, '');
  assert.equal(quiet.stdout, runIn(dir, spec).stdout);
  assert.equal(runIn(dir, '--strict-imports', spec).status, 1);
  const explicit = runIn(dir, '--resolve-imports', path.join(dir, 'missing-registry.json'), spec);
  assert.equal(explicit.status, 1);
  assert.match(explicit.stderr, /missing-registry\.json/);
  // A registry in the working directory resolves it.
  for (const name of ['platform.json', 'registry.json']) fs.copyFileSync(path.join(FIXTURE, name), path.join(dir, name));
  const sub = path.join(dir, 'sub');fs.mkdirSync(sub);fs.renameSync(spec, path.join(sub, 'board.json'));
  const fromCwd = runIn(dir, path.join(sub, 'board.json'));
  assert.equal(fromCwd.status, 0, fromCwd.stderr);
  assert.equal(fromCwd.stderr, '');
  assert.ok(fromCwd.stdout.includes('node delivery/platform::api origin imported tv-platform core as platform'));
});

test('the help recipe works as a git diff textconv on an importing spec', t => {
  const git = spawnSync('git', ['--version'], {encoding: 'utf8'});
  if (git.status !== 0){ t.skip('git is not available'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-text-git-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const g = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], {cwd: dir, encoding: 'utf8'});
  for (const name of ['board.json', 'platform.json']) fs.copyFileSync(path.join(FIXTURE, name), path.join(dir, name));
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.json diff=flowview\n');
  assert.equal(g('init', '-q').status, 0);
  assert.equal(g('add', '.').status, 0);
  assert.equal(g('commit', '-qm', 'base').status, 0);
  const board = JSON.parse(fs.readFileSync(path.join(dir, 'board.json'), 'utf8'));
  board.page.blocks[0].diagram.steps[0].text = 'The visitor presses the doorbell twice.';
  fs.writeFileSync(path.join(dir, 'board.json'), JSON.stringify(board, null, 1));
  const recipe = /git config diff\.flowview\.textconv "([^"]+)"/.exec(run('--help').stdout)[1].replace('tools/spec-text.js', TOOL);
  const diff = g('-c', 'diff.flowview.textconv=' + recipe, 'diff', 'board.json');
  assert.equal(diff.status, 0, diff.stderr);
  const changed = diff.stdout.split('\n').filter(line => /^[-+](?![-+])/.test(line));
  // The step is shared by both paths, so it changes in both.
  assert.deepEqual(changed, ['happy', 'refused'].flatMap(p => ['-step delivery/' + p + '/1 text The visitor presses the doorbell.', '+step delivery/' + p + '/1 text The visitor presses the doorbell twice.']));
  assert.equal(g('-c', 'diff.flowview.textconv=node ' + TOOL, 'diff', 'board.json').status, 0, 'the plain command also works');
});

test('a malformed diagram renders with problem lines instead of crashing', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-text-bad-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'bad.json');
  fs.writeFileSync(file, JSON.stringify({page: {sections: [{id: 'x', diagram: {nodes: {b: {title: 'B'}}, rows: [['b']], edges: [null, {from: 'b'}]}}]}}));
  for (const format of ['flat', 'steps', 'elements']){
    const out = runIn(dir, file, '--format', format);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(!out.stdout.includes('undefined'), out.stdout);
    assert.match(out.stdout, /edges\[1\]: expected an object with from and to/);
  }
});
