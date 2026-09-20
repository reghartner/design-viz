'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const fixtures = ['tests/fixtures/lint-crowded.json', 'examples/doorbell-atlas/atlas.spec.json',
  'src/starters/complex-trace.json', 'src/starters/whole-home-outdoors.json'];
const lintFindings = [
  'blocks[0].diagram.edges[0].label: "this label is extremely l…" (~425px) is longer than its edge can carry (~44px) — shorten it, or the auto-layout will push it far off the line',
  'blocks[0].diagram: 5 edges cross the corridor between rows 1 and 2 — expect crowding; consider fewer return edges or a second section',
  'blocks[0].diagram.steps[1]: shares first edge "a->g" with steps[0] — both step coins land on the same midpoint; reorder the edges list of one step',
  'page.protocols.unusedproto: declared but no edge uses kind "unusedproto" — remove it or use it',
];

function withoutDOM(extra = {}) {
  const c = {URL, ...extra};
  for (const name of ['window', 'document'])
    c[name] = new Proxy({}, {get(target, key) { throw new Error('Unexpected DOM access: ' + name + '.' + String(key)); }});
  return vm.createContext(c);
}
function geometry(core, diagram) {
  const layout = core.layout(diagram), edges = diagram.edges || [];
  const adjust = layout.routing === 'lanes' ? core.laneRoutes(diagram, layout) : core.edgeAutoAdjust(edges, layout);
  if (layout.routing !== 'lanes') assert.equal(core.resolveEdgeAvoidance(edges, layout, adjust), adjust);
  return plain({layout, adjust, paths: edges.map((edge, index) => core.edgePath(edge, layout, adjust[index]))});
}

test('the geometry leaf needs only clamp and preserves classic placement and parent-cycle handling', () => {
  const validator = withoutDOM();
  vm.runInContext(readSource('validator.js'), validator);
  const leaf = withoutDOM({clamp: validator.clamp});
  vm.runInContext(readSource('core/geometry.js'), leaf);
  const d = {nodes: {a: {}, b: {}, c: {}}, rows: [['a', 'b'], ['c']], edges: [{from: 'a', to: 'b'}]};
  const result = geometry(leaf, d);
  assert.deepEqual(Object.values(result.layout.pos).map(node => [node.cx, node.cy]), [[110, 69], [885, 69], [497.5, 263]]);
  assert.deepEqual(result.layout.vb, {x: 0, y: 0, w: 1180, h: 330});
  assert.deepEqual(result.paths, ['M 185 69 L 810 69']);
  const warnings = [], groups = {a: {parent: 'b'}, b: {parent: 'a'}, child: {parent: 'a'}};
  assert.deepEqual(plain(leaf.sanitizedGroupParents(groups, (id, message) => warnings.push(id + ': ' + message))), {child: 'a'});
  assert.deepEqual(warnings, ['a: parent chain loops — parent ignored', 'b: parent chain loops — parent ignored']);
  assert.deepEqual(groups, {a: {parent: 'b'}, b: {parent: 'a'}, child: {parent: 'a'}});
});

test('headless validator and standalone geometry match viewer layouts, routes and avoidance without mutating specs', () => {
  const headless = withoutDOM(), viewer = vm.createContext({URL});
  vm.runInContext(readSource('validator.js'), headless);
  vm.runInContext(readSource('validator.js') + '\n' + readSource('engine.js'), viewer);
  const leaf = withoutDOM({clamp: headless.clamp});
  vm.runInContext(readSource('core/geometry.js'), leaf);
  for (const file of fixtures) {
    const raw = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), before = JSON.stringify(raw);
    const page = headless.normalize(raw), diagrams = [];
    for (const block of headless.blocksOf(page)) {
      if (block.type === 'section') { if (block.sec.diagram) diagrams.push(block.sec.diagram); }
      else for (const tab of block.tabs) for (const section of tab.sections) if (section.diagram) diagrams.push(section.diagram);
    }
    assert.ok(diagrams.length, file);
    for (const d of diagrams) {
      const expected = geometry(viewer, d);
      assert.deepEqual(geometry(headless, d), expected, file + ' headless');
      assert.deepEqual(geometry(leaf, d), expected, file + ' standalone leaf');
    }
    assert.deepEqual(plain(headless.validate(page)), plain(viewer.validate(page)), file + ' validation');
    assert.deepEqual(plain(headless.lintPage(page)), plain(viewer.lintPage(page)), file + ' lint');
    assert.equal(JSON.stringify(raw), before, file + ' input preserved');
  }
  const crowded = JSON.parse(fs.readFileSync(path.join(root, fixtures[0]), 'utf8'));
  assert.deepEqual(plain(headless.lintPage(headless.normalize(crowded))), lintFindings);
  assert.equal(sourceFiles('validator.js').filter(file => file === 'core/geometry.js').length, 1);
  assert.equal(sourceFiles('engine.js').includes('core/geometry.js'), false);
});

test('the CLI retains findings and batch exit status when no renderer source is available', () => {
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'flowview-headless-cli-'));
  try {
    const files = new Set(['source-bundles.json', 'compatibility.js', 'canon.js', ...sourceFiles('validator.js')]);
    for (const file of files) {
      const destination = path.join(isolated, 'src', file);
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      fs.copyFileSync(path.join(root, 'src', file), destination);
    }
    fs.mkdirSync(path.join(isolated, 'tools'));
    for (const file of ['validate.js', 'source-loader.cjs'])
      fs.copyFileSync(path.join(root, 'tools', file), path.join(isolated, 'tools', file));
    assert.equal(fs.existsSync(path.join(isolated, 'src/engine.js')), false);
    const inputs = ['tests/fixtures/lint-crowded.json', 'tests/fixtures/warn-malformed-contract.json',
      'tests/fixtures/broken-missing-rows.json', 'src/starters/minimal.json'].map(file => path.join(root, file));
    for (const quiet of [false, true]) {
      const args = [...(quiet ? ['--quiet'] : []), ...inputs];
      const original = spawnSync(process.execPath, [path.join(root, 'tools/validate.js'), ...args], {encoding: 'utf8', timeout: 10000});
      const copy = spawnSync(process.execPath, [path.join(isolated, 'tools/validate.js'), ...args], {cwd: isolated, encoding: 'utf8', timeout: 10000});
      assert.equal(copy.status, 1, copy.stderr || String(copy.error || ''));
      assert.equal(copy.status, original.status); assert.equal(copy.stdout, original.stdout); assert.equal(copy.stderr, '');
      assert.ok(copy.stdout.includes(inputs[0] + ': 0 errors, 4 warnings'));
      assert.ok(copy.stdout.includes(inputs[3] + ': 0 errors, 0 warnings'));
      if (!quiet) for (const finding of lintFindings) assert.ok(copy.stdout.includes(': lint  ' + finding));
      else assert.equal(copy.stdout.includes(': lint  '), false);
    }
  } finally { fs.rmSync(isolated, {recursive: true, force: true}); }
});
