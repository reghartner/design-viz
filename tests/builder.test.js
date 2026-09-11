'use strict';
/* Unit tests for the pure spec-source utilities in src/builder.workbench.js
   (JSON locator, section-path walker, insert planners), loaded via vm so the
   browser fragment runs without a DOM.
   Run: node --test tests/   (zero npm dependencies) */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadBuilder(){
  const code =
    fs.readFileSync(path.join(ROOT, 'src', 'builder.workbench.js'), 'utf8') + '\n' +
    ';__exports = {jsonLocate, jsonContainer, jsonInsertMember, jsonInsertListItemOrCreate,' +
    ' specSectionPaths, specValueAt, builderTargetPath, builderPathString,' +
    ' builderUniqueKey, builderFlatRowIds,' +
    ' planAddNode, planAddEdge, planAddStep, planAddPanel, planAddSection,' +
    ' jsonReplaceValue, jsonRemoveMember, jsonSetField, planSetField,' +
    ' planSetEdgeEndpoint, planRenameNode, planRenamePanel,' +
    ' planDeleteNode, planDeleteEdge, planDeletePanel, planDeleteStep,' +
    ' planMoveStep, planDeleteSection, builderEdgeKey, builderRetargetStepKeys,' +
    ' BUILDER_GUIDES, BUILDER_SECTION_TEMPLATE};';
  const sandbox = {console};
  vm.runInNewContext(code, sandbox);
  return sandbox.__exports;
}
const B = loadBuilder();

/* vm-created arrays/objects have foreign prototypes; normalize before
   deepStrictEqual (same pattern as tests/engine.test.js) */
function plain(v){ return JSON.parse(JSON.stringify(v)); }

/* a small page spec used across the locator and planner tests */
const SPEC = {
  page: {
    title: 'T',
    blocks: [
      {heading: 'Plain', accent: 'green',
       diagram: {
         nodes: {a: {title: 'A'}, b: {title: 'B "quoted" }brace{'}},
         rows: [['a', 'b']],
         edges: [{from: 'a', to: 'b', kind: 'int', label: 'call'}],
         steps: [{edge: 'a->b', text: 'first'}]
       }},
      {tabs: [
        {label: 'One', sections: [
          {heading: 'InTab',
           diagram: {nodes: {x: {title: 'X'}, y: {title: 'Y'}},
                     rows: [['x', 'y']],
                     edges: [{from: 'x', to: 'y'}],
                     panels: [{id: 'p', type: 'queue', initial: {state: 'empty'}}]}}
        ]},
        {label: 'Two', sections: [{heading: 'Second tab'}]}
      ]}
    ]
  }
};
const TEXT = JSON.stringify(SPEC, null, 2);

test('jsonLocate finds nested values and the ranges parse back to them', () => {
  const cases = [
    [['page', 'title'], SPEC.page.title],
    [['page', 'blocks', 0, 'diagram', 'nodes', 'a'], SPEC.page.blocks[0].diagram.nodes.a],
    [['page', 'blocks', 0, 'diagram', 'edges', 0], SPEC.page.blocks[0].diagram.edges[0]],
    [['page', 'blocks', 1, 'tabs', 1, 'sections', 0], {heading: 'Second tab'}],
    [['page', 'blocks', 0, 'diagram', 'nodes', 'b'], SPEC.page.blocks[0].diagram.nodes.b]
  ];
  for (const [p, want] of cases){
    const loc = B.jsonLocate(TEXT, p);
    assert.ok(loc, 'locates ' + JSON.stringify(p));
    assert.deepStrictEqual(JSON.parse(TEXT.slice(loc.start, loc.end)), want);
  }
});

test('jsonLocate returns the whole document for the empty path and null for misses', () => {
  const whole = B.jsonLocate(TEXT, []);
  assert.deepStrictEqual(JSON.parse(TEXT.slice(whole.start, whole.end)), SPEC);
  assert.strictEqual(B.jsonLocate(TEXT, ['page', 'missing']), null);
  assert.strictEqual(B.jsonLocate(TEXT, ['page', 'blocks', 9]), null);
  assert.strictEqual(B.jsonLocate(TEXT, ['page', 'title', 'deeper']), null);
  assert.strictEqual(B.jsonLocate('   ', []), null);
});

test('jsonLocate survives strings holding braces, brackets, and escaped quotes', () => {
  const tricky = '{"a": "}]\\"{[", "b": [1, "x,y", {"c": "\\\\"}], "d": 2}';
  const d = B.jsonLocate(tricky, ['d']);
  assert.strictEqual(tricky.slice(d.start, d.end), '2');
  const c = B.jsonLocate(tricky, ['b', 2, 'c']);
  assert.strictEqual(JSON.parse(tricky.slice(c.start, c.end)), '\\');
});

test('jsonInsertMember appends to populated and empty containers with sane indentation', () => {
  const objText = '{\n  "nodes": {\n    "a": {"title": "A"}\n  }\n}';
  const r1 = B.jsonInsertMember(objText, ['nodes'], 'b', '{"title": "B"}');
  const parsed1 = JSON.parse(r1.text);
  assert.deepStrictEqual(parsed1.nodes.b, {title: 'B'});
  assert.strictEqual(r1.text.slice(r1.start, r1.end), '{"title": "B"}');
  assert.ok(r1.text.includes('\n    "b": {"title": "B"}'), 'matches the sibling indent');

  const emptyText = '{\n  "edges": []\n}';
  const r2 = B.jsonInsertMember(emptyText, ['edges'], null, '{"from": "a", "to": "b"}');
  assert.deepStrictEqual(JSON.parse(r2.text).edges, [{from: 'a', to: 'b'}]);
  assert.strictEqual(r2.text.slice(r2.start, r2.end), '{"from": "a", "to": "b"}');
});

test('jsonInsertMember refuses a key/container mismatch', () => {
  assert.strictEqual(B.jsonInsertMember('{"a": []}', ['a'], 'key', '1'), null);
  assert.strictEqual(B.jsonInsertMember('{"a": {}}', ['a'], null, '1'), null);
  assert.strictEqual(B.jsonInsertMember('{"a": 1}', ['a'], null, '1'), null);
});

test('jsonInsertMember re-indents multi-line snippets to the container depth', () => {
  const text = '{\n  "blocks": [\n    {"heading": "old"}\n  ]\n}';
  const r = B.jsonInsertMember(text, ['blocks'], null, '{\n  "heading": "new"\n}');
  assert.deepStrictEqual(JSON.parse(r.text).blocks[1], {heading: 'new'});
  assert.ok(r.text.includes('\n    {\n      "heading": "new"\n    }'), 'nested lines pick up the member indent');
});

test('jsonInsertListItemOrCreate creates the list when absent and appends when present', () => {
  const noList = '{\n  "diagram": {\n    "nodes": {}\n  }\n}';
  const made = B.jsonInsertListItemOrCreate(noList, ['diagram'], 'edges', '{"from": "a", "to": "b"}');
  assert.deepStrictEqual(JSON.parse(made.text).diagram.edges, [{from: 'a', to: 'b'}]);
  const appended = B.jsonInsertListItemOrCreate(made.text, ['diagram'], 'edges', '{"from": "b", "to": "a"}');
  assert.strictEqual(JSON.parse(appended.text).diagram.edges.length, 2);
});

test('specSectionPaths mirrors render order across blocks, tabs, aliases, and bare diagrams', () => {
  const paths = B.specSectionPaths(SPEC).map(r => r.section);
  assert.deepStrictEqual(plain(paths), [
    ['page', 'blocks', 0],
    ['page', 'blocks', 1, 'tabs', 0, 'sections', 0],
    ['page', 'blocks', 1, 'tabs', 1, 'sections', 0]
  ]);
  const alias = B.specSectionPaths({sections: [{heading: 'a'}, {heading: 'b'}]});
  assert.deepStrictEqual(plain(alias.map(r => r.section)), [['sections', 0], ['sections', 1]]);
  const bare = B.specSectionPaths({nodes: {a: {}}, rows: [['a']]});
  assert.deepStrictEqual(plain(bare), [{section: [], diagram: []}]);
  assert.deepStrictEqual(plain(B.specSectionPaths(null)), []);
  assert.deepStrictEqual(plain(B.specSectionPaths({page: {}})), []);
});

test('builderTargetPath maps every selectable kind, including the bare-diagram page', () => {
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 0, kind: 'node', id: 'a'})),
    ['page', 'blocks', 0, 'diagram', 'nodes', 'a']);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 1, kind: 'edge', index: 0})),
    ['page', 'blocks', 1, 'tabs', 0, 'sections', 0, 'diagram', 'edges', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 0, kind: 'step', index: 0})),
    ['page', 'blocks', 0, 'diagram', 'steps', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 1, kind: 'panel', index: 0})),
    ['page', 'blocks', 1, 'tabs', 0, 'sections', 0, 'diagram', 'panels', 0]);
  assert.deepStrictEqual(plain(B.builderTargetPath(SPEC, {section: 2, kind: 'section'})),
    ['page', 'blocks', 1, 'tabs', 1, 'sections', 0]);
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.deepStrictEqual(plain(B.builderTargetPath(bare, {section: 0, kind: 'node', id: 'a'})), ['nodes', 'a']);
  assert.strictEqual(B.builderTargetPath(SPEC, {section: 9, kind: 'node', id: 'a'}), null);
});

test('builderPathString prints dotted paths with indexes and quotes odd keys', () => {
  assert.strictEqual(B.builderPathString(['page', 'blocks', 0, 'diagram', 'nodes', 'a']),
    'page.blocks[0].diagram.nodes.a');
  assert.strictEqual(B.builderPathString(['nodes', 'my node']), 'nodes."my node"');
  assert.strictEqual(B.builderPathString([]), '(whole document)');
});

test('planAddNode places a fresh id in nodes AND the last row', () => {
  const plan = B.planAddNode(TEXT, SPEC, 0);
  assert.ok(!plan.error, plan.error);
  assert.strictEqual(plan.kind, 'node');
  assert.strictEqual(plan.id, 'node1');
  const out = JSON.parse(plan.text);
  const d = out.page.blocks[0].diagram;
  assert.deepStrictEqual(d.nodes.node1, {title: 'New node', sub: 'what it does', icon: 'gear', tint: 'cmd'});
  assert.deepStrictEqual(d.rows[d.rows.length - 1], ['a', 'b', 'node1']);
  assert.deepStrictEqual(JSON.parse(plan.text.slice(plan.start, plan.end)), d.nodes.node1);
});

test('planAddNode skips ids already taken and reports diagram-less sections plainly', () => {
  const taken = JSON.parse(JSON.stringify(SPEC));
  taken.page.blocks[0].diagram.nodes.node1 = {title: 'occupied'};
  const plan = B.planAddNode(JSON.stringify(taken, null, 2), taken, 0);
  assert.strictEqual(plan.id, 'node2');
  const bad = B.planAddNode(TEXT, SPEC, 2); /* "Second tab" has no diagram */
  assert.match(bad.error, /no diagram/);
});

test('planAddEdge avoids duplicate from->to keys and creates edges when missing', () => {
  /* a->b already exists — the engine keys edges by "from->to", so a
     duplicate would override the first edge; the planner takes b->a */
  const plan = B.planAddEdge(TEXT, SPEC, 0);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.edges.length, 2);
  assert.deepStrictEqual(d.edges[1], {from: 'b', to: 'a', kind: 'int', label: 'describe the hop'});
  assert.strictEqual(plan.index, 1);

  const noEdges = JSON.parse(JSON.stringify(SPEC));
  delete noEdges.page.blocks[0].diagram.edges;
  const made = B.planAddEdge(JSON.stringify(noEdges, null, 2), noEdges, 0);
  assert.strictEqual(made.index, 0);
  assert.deepStrictEqual(JSON.parse(made.text).page.blocks[0].diagram.edges,
    [{from: 'a', to: 'b', kind: 'int', label: 'describe the hop'}]);

  /* both directions taken on the only pair: fall back to the first pair */
  const full = JSON.parse(JSON.stringify(SPEC));
  full.page.blocks[0].diagram.edges.push({from: 'b', to: 'a'});
  const fb = B.planAddEdge(JSON.stringify(full, null, 2), full, 0);
  const fd = JSON.parse(fb.text).page.blocks[0].diagram;
  assert.strictEqual(fd.edges[2].from, 'a');
  assert.strictEqual(fd.edges[2].to, 'b');
});

test('planAddStep prefers an edge that is not yet any step\'s first hop', () => {
  const spec = JSON.parse(JSON.stringify(SPEC));
  spec.page.blocks[0].diagram.edges.push({from: 'b', to: 'a', kind: 'int'});
  const text = JSON.stringify(spec, null, 2);
  const plan = B.planAddStep(text, spec, 0);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.steps.length, 2);
  assert.strictEqual(d.steps[1].edge, 'b->a'); /* a->b is step 1's first hop already */
  assert.strictEqual(plan.index, 1);
});

test('planAddStep falls back to the first edge when every edge is used', () => {
  const plan = B.planAddStep(TEXT, SPEC, 0);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.steps[1].edge, 'a->b');
});

test('planAddPanel creates the panels list on demand and avoids taken ids', () => {
  const plan = B.planAddPanel(TEXT, SPEC, 0); /* section 0 has no panels list */
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.panels[0], {id: 'panel1', type: 'queue', title: 'New panel', initial: {state: 'empty'}});
  assert.strictEqual(plan.index, 0);

  const tabPlan = B.planAddPanel(TEXT, SPEC, 1); /* section 1 already has panel "p" */
  const td = JSON.parse(tabPlan.text).page.blocks[1].tabs[0].sections[0].diagram;
  assert.strictEqual(td.panels.length, 2);
  assert.strictEqual(td.panels[1].id, 'panel1');
  assert.strictEqual(tabPlan.index, 1);
});

test('planAddSection appends a complete renderable section and handles every page shape', () => {
  const plan = B.planAddSection(TEXT, SPEC);
  const out = JSON.parse(plan.text);
  assert.strictEqual(out.page.blocks.length, 3);
  assert.strictEqual(out.page.blocks[2].heading, 'New section');
  assert.ok(out.page.blocks[2].diagram.nodes.svc1);
  assert.strictEqual(plan.index, 3); /* section ordinals: 3 already rendered */

  const alias = {sections: [{heading: 'a'}]};
  const aliasPlan = B.planAddSection(JSON.stringify(alias, null, 2), alias);
  assert.strictEqual(JSON.parse(aliasPlan.text).sections.length, 2);

  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.match(B.planAddSection(JSON.stringify(bare), bare).error, /bare diagram/);
});

test('the section template itself is valid JSON', () => {
  const sec = JSON.parse(B.BUILDER_SECTION_TEMPLATE);
  assert.strictEqual(sec.heading, 'New section');
  assert.deepStrictEqual(Object.keys(sec.diagram), ['nodes', 'rows', 'edges', 'steps']);
});

test('builder helpers: unique keys count past collisions, row flattening sees stacks', () => {
  assert.strictEqual(B.builderUniqueKey({}, 'node'), 'node1');
  assert.strictEqual(B.builderUniqueKey({node1: 1, node2: 1}, 'node'), 'node3');
  assert.deepStrictEqual(plain(B.builderFlatRowIds([['a', ['b', 'c']], ['d']])), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(plain(B.builderFlatRowIds(null)), []);
});

test('every insert result and every guide entry stays render-ready', () => {
  /* all planner outputs must parse — a splice that corrupts the editor text
     would be worse than no builder at all */
  for (const plan of [B.planAddNode(TEXT, SPEC, 0), B.planAddEdge(TEXT, SPEC, 0),
                      B.planAddStep(TEXT, SPEC, 0), B.planAddPanel(TEXT, SPEC, 1),
                      B.planAddSection(TEXT, SPEC)]){
    assert.ok(!plan.error, plan.error);
    JSON.parse(plan.text);
    assert.ok(plan.end > plan.start);
  }
  for (const kind of ['node', 'edge', 'step', 'panel', 'section']){
    const g = B.BUILDER_GUIDES[kind];
    assert.ok(g.title && g.how && g.fields.length >= 4, kind + ' guide is filled in');
  }
});

/* ================= pass 2: field edits, renames, deletes, reorders ======= */

/* a richer section for the cascade tests: stack rows, a float, a group of
   edges sharing a node, multi-edge steps, panel patches */
const RICH = {
  page: {
    blocks: [
      {heading: 'Rich',
       diagram: {
         nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}, f: {title: 'F'}},
         rows: [['a', ['b', 'c']]],
         floats: [{id: 'f', side: 'above'}],
         edges: [
           {from: 'a', to: 'b', kind: 'int', label: 'one'},
           {from: 'a', to: 'c', kind: 'mqtt'},
           {from: 'b', to: 'a', kind: 'int', ret: true},
           {from: 'a', to: 'f', kind: 'int'}
         ],
         panels: [{id: 'q', type: 'queue', initial: {state: 'empty'}},
                  {id: 'g', type: 'gauge', unit: 'mA', max: 10, initial: {value: 1}}],
         steps: [
           {edge: 'a->b', text: 's1', panels: {q: {state: 'enqueue', label: 'm'}}},
           {edges: ['a->c', 'b->a'], text: 's2', nodes: ['f'],
            panels: {q: {state: 'empty'}, g: {value: 5}}},
           {edge: 'a->f', text: 's3'}
         ]
       }}
    ]
  }
};
const RICH_TEXT = JSON.stringify(RICH, null, 2);

test('jsonReplaceValue swaps a value in place and re-indents multi-line output', () => {
  const r = B.jsonReplaceValue(TEXT, ['page', 'title'], '"Renamed"');
  assert.strictEqual(JSON.parse(r.text).page.title, 'Renamed');
  assert.strictEqual(r.text.slice(r.start, r.end), '"Renamed"');
  const multi = B.jsonReplaceValue(TEXT, ['page', 'blocks', 0, 'diagram', 'edges'],
    '[\n  {"from": "b", "to": "a"}\n]');
  assert.deepStrictEqual(JSON.parse(multi.text).page.blocks[0].diagram.edges, [{from: 'b', to: 'a'}]);
  assert.strictEqual(B.jsonReplaceValue(TEXT, ['page', 'nope'], '1'), null);
});

test('jsonRemoveMember removes first, middle, last, and only members cleanly', () => {
  const obj = '{"a": 1, "b": 2, "c": 3}';
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(obj, [], 'a').text), {b: 2, c: 3});
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(obj, [], 'b').text), {a: 1, c: 3});
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(obj, [], 'c').text), {a: 1, b: 2});
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember('{"only": 1}', [], 'only').text), {});
  const arr = '{"xs": [10, 20, 30]}';
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(arr, ['xs'], 1).text).xs, [10, 30]);
  assert.deepStrictEqual(JSON.parse(B.jsonRemoveMember(arr, ['xs'], 2).text).xs, [10, 20]);
  assert.strictEqual(B.jsonRemoveMember(obj, [], 'zz'), null);
});

test('jsonSetField replaces, inserts, and removes one field surgically', () => {
  const nodePath = ['page', 'blocks', 0, 'diagram', 'nodes', 'a'];
  const rep = B.jsonSetField(TEXT, nodePath, 'title', '"A2"');
  assert.strictEqual(JSON.parse(rep.text).page.blocks[0].diagram.nodes.a.title, 'A2');
  const ins = B.jsonSetField(TEXT, nodePath, 'icon', '"db"');
  assert.strictEqual(JSON.parse(ins.text).page.blocks[0].diagram.nodes.a.icon, 'db');
  const rem = B.jsonSetField(TEXT, nodePath, 'title', null);
  assert.deepStrictEqual(plain(JSON.parse(rem.text).page.blocks[0].diagram.nodes.a), {});
  const noop = B.jsonSetField(TEXT, nodePath, 'ghost', null);
  assert.strictEqual(noop.text, TEXT);
  /* the rest of the document is untouched by a surgical edit */
  assert.ok(rep.text.includes('"Second tab"'));
});

test('planSetEdgeEndpoint retargets the edge AND every step reference to its old key', () => {
  const plan = B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 0, 'to', 'c');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.edges[0].to, 'c');
  assert.strictEqual(d.steps[0].edge, 'a->c'); /* was a->b */
  assert.deepStrictEqual(d.steps[1].edges, ['a->c', 'b->a']); /* untouched */
  assert.match(B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 0, 'to', 'zz').error, /unknown node/);
  assert.match(B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 9, 'to', 'c').error, /not found/);
});

test('planRenameNode rewrites the map key, rows, floats, edges, steps, and step edge keys', () => {
  const plan = B.planRenameNode(RICH_TEXT, RICH, 0, 'a', 'hub');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.ok(d.nodes.hub && !d.nodes.a);
  assert.deepStrictEqual(d.rows, [['hub', ['b', 'c']]]);
  assert.deepStrictEqual(d.edges.map(e => e.from + '->' + e.to),
    ['hub->b', 'hub->c', 'b->hub', 'hub->f']);
  assert.strictEqual(d.steps[0].edge, 'hub->b');
  assert.deepStrictEqual(d.steps[1].edges, ['hub->c', 'b->hub']);
  assert.strictEqual(d.steps[2].edge, 'hub->f');
  /* keeps map order: hub replaces a in place */
  assert.deepStrictEqual(Object.keys(d.nodes), ['hub', 'b', 'c', 'f']);

  const float = B.planRenameNode(RICH_TEXT, RICH, 0, 'f', 'sig');
  const fd = JSON.parse(float.text).page.blocks[0].diagram;
  assert.strictEqual(fd.floats[0].id, 'sig');
  assert.strictEqual(fd.steps[1].nodes[0], 'sig');

  assert.match(B.planRenameNode(RICH_TEXT, RICH, 0, 'a', 'b').error, /taken/);
  assert.match(B.planRenameNode(RICH_TEXT, RICH, 0, 'a', 'no spaces').error, /letters/);
  assert.match(B.planRenameNode(RICH_TEXT, RICH, 0, 'zz', 'ok').error, /not found/);
});

test('planRenamePanel moves every step patch to the new id', () => {
  const plan = B.planRenamePanel(RICH_TEXT, RICH, 0, 0, 'queue1');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.panels[0].id, 'queue1');
  assert.deepStrictEqual(Object.keys(d.steps[0].panels), ['queue1']);
  assert.deepStrictEqual(Object.keys(d.steps[1].panels), ['queue1', 'g']);
  assert.match(B.planRenamePanel(RICH_TEXT, RICH, 0, 0, 'g').error, /taken/);
});

test('planDeleteNode removes placement and touching edges, pruning steps to legal shapes', () => {
  const plan = B.planDeleteNode(RICH_TEXT, RICH, 0, 'a');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.ok(!d.nodes.a);
  assert.deepStrictEqual(d.rows, [[['b', 'c']]]); /* plain slot removed, stack kept */
  assert.deepStrictEqual(d.edges, []); /* every edge touched a */
  /* steps survive as captions; edge references are gone, node light kept */
  assert.ok(!('edge' in d.steps[0]) && !('edges' in d.steps[0]));
  assert.deepStrictEqual(d.steps[1].nodes, ['f']);
  assert.strictEqual(d.steps.length, 3);

  /* deleting a stack member shrinks the stack; deleting the float drops floats */
  const b = JSON.parse(B.planDeleteNode(RICH_TEXT, RICH, 0, 'b').text).page.blocks[0].diagram;
  assert.deepStrictEqual(b.rows, [['a', ['c']]]);
  const f = JSON.parse(B.planDeleteNode(RICH_TEXT, RICH, 0, 'f').text).page.blocks[0].diagram;
  assert.ok(!('floats' in f));
  assert.ok(!('nodes' in f.steps[1]));
});

test('planDeleteEdge splices the edge and prunes step references unless a duplicate key survives', () => {
  const plan = B.planDeleteEdge(RICH_TEXT, RICH, 0, 0); /* a->b */
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.edges.length, 3);
  assert.ok(!('edge' in d.steps[0]));

  /* with a duplicate a->b present, deleting one keeps the step reference */
  const dup = JSON.parse(JSON.stringify(RICH));
  dup.page.blocks[0].diagram.edges.push({from: 'a', to: 'b', kind: 'https'});
  const dupPlan = B.planDeleteEdge(JSON.stringify(dup, null, 2), dup, 0, 0);
  const dd = JSON.parse(dupPlan.text).page.blocks[0].diagram;
  assert.strictEqual(dd.steps[0].edge, 'a->b');
});

test('planDeletePanel removes the widget and its step patches', () => {
  const plan = B.planDeletePanel(RICH_TEXT, RICH, 0, 0);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.panels.map(p => p.id), ['g']);
  assert.ok(!('panels' in d.steps[0]));
  assert.deepStrictEqual(Object.keys(d.steps[1].panels), ['g']);
});

test('planDeleteStep and planMoveStep splice and reorder only the steps array', () => {
  const del = B.planDeleteStep(RICH_TEXT, RICH, 0, 1);
  const dd = JSON.parse(del.text).page.blocks[0].diagram;
  assert.deepStrictEqual(dd.steps.map(s => s.text), ['s1', 's3']);
  assert.strictEqual(dd.edges.length, 4); /* untouched */

  const mv = B.planMoveStep(RICH_TEXT, RICH, 0, 0, 1);
  assert.strictEqual(mv.index, 1);
  const md = JSON.parse(mv.text).page.blocks[0].diagram;
  assert.deepStrictEqual(md.steps.map(s => s.text), ['s2', 's1', 's3']);
  assert.match(B.planMoveStep(RICH_TEXT, RICH, 0, 0, -1).error, /end/);
  assert.match(B.planMoveStep(RICH_TEXT, RICH, 0, 2, 1).error, /end/);
});

test('planDeleteSection removes the whole section member and refuses the bare diagram', () => {
  const plan = B.planDeleteSection(TEXT, SPEC, 1); /* first tab section */
  const out = JSON.parse(plan.text);
  assert.deepStrictEqual(out.page.blocks[1].tabs[0].sections, []);
  assert.strictEqual(out.page.blocks[0].heading, 'Plain');
  const top = B.planDeleteSection(TEXT, SPEC, 0);
  assert.strictEqual(JSON.parse(top.text).page.blocks.length, 1);
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.match(B.planDeleteSection(JSON.stringify(bare), bare, 0).error, /bare diagram/);
});

test('every pass-2 planner output still parses and leaves unrelated blocks intact', () => {
  const plans = [
    B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 1, 'from', 'b'),
    B.planRenameNode(RICH_TEXT, RICH, 0, 'b', 'beta'),
    B.planRenamePanel(RICH_TEXT, RICH, 0, 1, 'meter'),
    B.planDeleteNode(RICH_TEXT, RICH, 0, 'c'),
    B.planDeleteEdge(RICH_TEXT, RICH, 0, 2),
    B.planDeletePanel(RICH_TEXT, RICH, 0, 1),
    B.planDeleteStep(RICH_TEXT, RICH, 0, 0),
    B.planMoveStep(RICH_TEXT, RICH, 0, 2, -1),
    B.planSetField(RICH_TEXT, RICH, ['page', 'blocks', 0], 'accent', '"violet"')
  ];
  for (const plan of plans){
    assert.ok(!plan.error, plan.error);
    const out = JSON.parse(plan.text);
    assert.strictEqual(out.page.blocks[0].heading, 'Rich');
  }
});
