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
  // An importing spec with no registry beside it says how to resolve it.
  fs.copyFileSync(BOARD, path.join(dir, 'board.json'));
  const orphan = run(path.join(dir, 'board.json'));
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
