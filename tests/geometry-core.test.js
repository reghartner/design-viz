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
  'blocks[0].diagram.edges[0].label: "this label is extremely l…" (~425px) is longer than its edge can carry (~90px) — shorten it, or the auto-layout will push it far off the line',
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

test('the geometry leaf needs only clamp and centers row placement across the canvas', () => {
  const validator = withoutDOM();
  vm.runInContext(readSource('validator.js'), validator);
  const leaf = withoutDOM({clamp: validator.clamp});
  vm.runInContext(readSource('core/geometry.js'), leaf);
  const d = {nodes: {a: {}, b: {}, c: {}}, rows: [['a', 'b'], ['c']], edges: [{from: 'a', to: 'b'}]};
  const result = geometry(leaf, d);
  assert.deepEqual(Object.values(result.layout.pos).map(node => [node.cx, node.cy]), [[110, 69], [1070, 69], [590, 263]]);
  assert.deepEqual(result.layout.vb, {x: 0, y: 0, w: 1180, h: 330});
  assert.deepEqual(result.paths, ['M 185 69 L 995 69']);
  const warnings = [], groups = {a: {parent: 'b'}, b: {parent: 'a'}, child: {parent: 'a'}};
  assert.deepEqual(plain(leaf.sanitizedGroupParents(groups, (id, message) => warnings.push(id + ': ' + message))), {child: 'a'});
  assert.deepEqual(warnings, ['a: parent chain loops — parent ignored', 'b: parent chain loops — parent ignored']);
  assert.deepEqual(groups, {a: {parent: 'b'}, b: {parent: 'a'}, child: {parent: 'a'}});
});

test('rows use both sides equally for curves, lanes, stacks and single-node rows', () => {
  const core = withoutDOM();
  vm.runInContext(readSource('validator.js'), core);
  for (const routing of [undefined, 'lanes']) for (const count of [2, 3, 4, 5]) {
    const ids = Array.from({length: count}, (_, i) => 'n' + i);
    const d = {routing, nodes: Object.fromEntries([...ids, 'single'].map(id => [id, {}])),
      rows: [ids, ['single']], edges: []};
    const L = core.layout(d), a = L.pos[ids[0]], b = L.pos[ids[count - 1]];
    const left = a.cx - a.w / 2 - L.vb.x, right = L.vb.x + L.vb.w - b.cx - b.w / 2;
    assert.equal(left, right, routing + ': balanced margins');
    assert.ok(right < a.w / 2, 'no spare node-sized gutter');
    assert.equal(L.pos.single.cx, L.vb.x + L.vb.w / 2);
  }
  const d = {nodes: {a: {}, b: {}, c: {}, d: {}}, rows: [[['a', 'b'], ['c', 'd']]]};
  const L = core.layout(d);
  assert.equal(L.pos.a.cx - L.pos.a.w / 2, L.vb.w - L.pos.c.cx - L.pos.c.w / 2);
});

test('cross-row curves stay inside the canvas and between rows at full width', () => {
  const core = withoutDOM();
  vm.runInContext(readSource('validator.js'), core);
  for (const rows of [[['a', 'b'], ['c']], [['a'], ['b', 'c']], [['a', 'b'], ['c'], ['d', 'e']]]) {
    const d = {nodes: Object.fromEntries(rows.flat().map(id => [id, {}])), rows};
    const L = core.layout(d);
    for (let r = 1; r < rows.length; r++) {
      const edge = {from: rows[r - 1].at(-1), to: rows[r][0]};
      const points = core.samplePathD(core.edgePath(edge, L));
      assert.ok(points.every(p => p.x >= L.vb.x && p.x <= L.vb.x + L.vb.w), JSON.stringify(edge));
      const from = L.pos[edge.from], to = L.pos[edge.to];
      const bottom = from.cy + from.h/2, top = to.cy - to.h/2;
      assert.equal(points[0].y, bottom);
      assert.ok(Math.abs(points.at(-1).y-top)<.001);
      assert.ok(points.every(p=>p.y>=bottom-.001 && p.y<=top+.001),
        'cross-row routes must stay in the gap rather than wrap around a row');
    }
  }
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
