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

function loadBuilder(extraGlobals){
  const code =
    fs.readFileSync(path.join(ROOT, 'src', 'builder.workbench.js'), 'utf8') + '\n' +
    ';__exports = {mermaidToSpec, jsonLocate, jsonContainer, jsonInsertMember, jsonInsertListItemOrCreate,' +
    ' specSectionPaths, specValueAt, starterCountLine, builderTargetPath, builderPathString,' +
    ' builderPositionLine,' +
    ' builderUniqueKey, builderFlatRowIds,' +
    ' planAddNode, planAddEdge, planAddStep, planAddPanel, planAddSection,' +
    ' jsonReplaceValue, jsonRemoveMember, jsonSetField, planSetField,' +
    ' planSetEdgeEndpoint, planRenameNode, planRenamePanel,' +
    ' planDeleteNode, planDeleteEdge, planDeletePanel, planDeleteStep,' +
    ' planMoveStep, planDeleteSection, builderEdgeKey, builderRetargetStepKeys,' +
    ' jsonInsertArrayItemAfter, planReplaceValue, planSetFields, planDeleteListItem,' +
    ' planAddEdgeBetween, planDuplicateNode, planDuplicateSection,' +
    ' NODE_PRESETS, PANEL_TEMPLATES,' +
    ' specFileName, parseValidationPath, findingLocation, diffSpecs, diffSpecTexts,' +
    ' builderTabPath, planAddTab, planDeleteTab, planMoveTab, BUILDER_TAB_TEMPLATE, planAddTabs, BUILDER_TABS_TEMPLATE,' +
    ' builderStepHops, planStepToggleHop, planStepToggleNode, planStepTogglePanel, planStepSetPanelPatch,' +
    ' PANEL_SETUP_FIELDS, SCENE_TOKENS,' +
    ' builderSectionPrefs,' +
    ' rowsEditorCollect, mapEditorCollect, objFieldsCollect, builderRowMerge, jsonSwapListItems, planMoveSection, planSwapNodes, builderDeletePlan, planBulkSetField, planBulkDelete, BUILDER_MULTI_KINDS,' +
    ' BUILDER_GUIDES, BUILDER_SECTION_TEMPLATE};';
  const sandbox = {console};
  if (extraGlobals) Object.assign(sandbox, extraGlobals);
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
  assert.deepStrictEqual(d.panels[0], {id: 'queue1', type: 'queue', title: 'Queue', initial: {state: 'empty'}});
  assert.strictEqual(plan.index, 0);

  const tabPlan = B.planAddPanel(TEXT, SPEC, 1); /* section 1 already has panel "p" */
  const td = JSON.parse(tabPlan.text).page.blocks[1].tabs[0].sections[0].diagram;
  assert.strictEqual(td.panels.length, 2);
  assert.strictEqual(td.panels[1].id, 'queue1');
  assert.strictEqual(tabPlan.index, 1);

  /* id stem follows the type; a taken stem counts up */
  const g = B.planAddPanel(TEXT, SPEC, 0, 'gauge');
  assert.strictEqual(JSON.parse(g.text).page.blocks[0].diagram.panels[0].id, 'gauge1');
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

test('renames to hostile ids like __proto__ keep the entry as a real own property', () => {
  /* a plain {} rebuild would route "__proto__" through the prototype
     setter and silently drop the node (Codex cycle-1 MAJOR) */
  const plan = B.planRenameNode(RICH_TEXT, RICH, 0, 'a', '__proto__');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.ok(Object.prototype.hasOwnProperty.call(d.nodes, '__proto__'));
  assert.strictEqual(Object.keys(d.nodes).length, 4);
  assert.strictEqual(d.steps[0].edge, '__proto__->b');

  const panelPlan = B.planRenamePanel(RICH_TEXT, RICH, 0, 0, '__proto__');
  assert.ok(!panelPlan.error, panelPlan.error);
  const pd = JSON.parse(panelPlan.text).page.blocks[0].diagram;
  assert.strictEqual(pd.panels[0].id, '__proto__');
  assert.ok(Object.prototype.hasOwnProperty.call(pd.steps[0].panels, '__proto__'));
});

/* ================= pass 3: direct manipulation ================= */

const PROSE = {
  page: {
    blocks: [
      {heading: 'P', text: ['first paragraph', 'second paragraph'],
       bullets: ['plain point', {text: 'fancy point', sub: ['child'], revealAt: 1}],
       contract: {title: 'Wire', fields: [
         {k: 'topic', v: 'a/b', g: 'where'},
         {k: 'ttl', v: '30s'}
       ]},
       diagram: {nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}},
                 rows: [['a', ['b', 'c']]],
                 edges: [{from: 'a', to: 'b', labelDx: -40}],
                 steps: [{edge: 'a->b', text: 's1'}]}}
    ]
  }
};
const PROSE_TEXT = JSON.stringify(PROSE, null, 2);

test('jsonInsertArrayItemAfter splices directly after the anchor member', () => {
  const text = '{\n  "xs": [\n    10,\n    20\n  ]\n}';
  const r = B.jsonInsertArrayItemAfter(text, ['xs'], 0, '15');
  assert.deepStrictEqual(JSON.parse(r.text).xs, [10, 15, 20]);
  assert.strictEqual(r.text.slice(r.start, r.end), '15');
  const tail = B.jsonInsertArrayItemAfter(text, ['xs'], 1, '30');
  assert.deepStrictEqual(JSON.parse(tail.text).xs, [10, 20, 30]);
  assert.strictEqual(B.jsonInsertArrayItemAfter(text, ['xs'], 5, '1'), null);
  assert.strictEqual(B.jsonInsertArrayItemAfter('{"o": {}}', ['o'], 0, '1'), null);
});

test('builderTargetPath maps bullets, paragraphs (string and list), and contract rows', () => {
  assert.deepStrictEqual(plain(B.builderTargetPath(PROSE, {section: 0, kind: 'bullet', index: 1})),
    ['page', 'blocks', 0, 'bullets', 1]);
  assert.deepStrictEqual(plain(B.builderTargetPath(PROSE, {section: 0, kind: 'para', index: 1})),
    ['page', 'blocks', 0, 'text', 1]);
  const stringText = {page: {blocks: [{heading: 'S', text: 'one paragraph'}]}};
  assert.deepStrictEqual(plain(B.builderTargetPath(stringText, {section: 0, kind: 'para', index: 0})),
    ['page', 'blocks', 0, 'text']);
  assert.deepStrictEqual(plain(B.builderTargetPath(PROSE, {section: 0, kind: 'crow', index: 1})),
    ['page', 'blocks', 0, 'contract', 'fields', 1]);
});

test('planReplaceValue rewrites a bullet string and a paragraph in place', () => {
  const bulletPath = ['page', 'blocks', 0, 'bullets', 0];
  const r = B.planReplaceValue(PROSE_TEXT, PROSE, bulletPath, JSON.stringify('sharper point'));
  assert.strictEqual(JSON.parse(r.text).page.blocks[0].bullets[0], 'sharper point');
  const miss = B.planReplaceValue(PROSE_TEXT, PROSE, ['page', 'nope'], '1');
  assert.match(miss.error, /not found/);
});

test('planSetFields applies several surgical edits in one plan', () => {
  const edgePath = ['page', 'blocks', 0, 'diagram', 'edges', 0];
  const r = B.planSetFields(PROSE_TEXT, PROSE, edgePath, [['labelDx', '12'], ['labelDy', '-8']]);
  const e = JSON.parse(r.text).page.blocks[0].diagram.edges[0];
  assert.strictEqual(e.labelDx, 12);
  assert.strictEqual(e.labelDy, -8);
  const clear = B.planSetFields(PROSE_TEXT, PROSE, edgePath, [['labelDx', null], ['labelDy', null]]);
  const ec = JSON.parse(clear.text).page.blocks[0].diagram.edges[0];
  assert.ok(!('labelDx' in ec) && !('labelDy' in ec));
});

test('planDeleteListItem removes bullets, paragraphs, and contract rows', () => {
  const noBullet = B.planDeleteListItem(PROSE_TEXT, PROSE, ['page', 'blocks', 0, 'bullets'], 0);
  assert.strictEqual(JSON.parse(noBullet.text).page.blocks[0].bullets.length, 1);
  const noRow = B.planDeleteListItem(PROSE_TEXT, PROSE, ['page', 'blocks', 0, 'contract', 'fields'], 1);
  assert.deepStrictEqual(JSON.parse(noRow.text).page.blocks[0].contract.fields.map(f => f.k), ['topic']);
  assert.match(B.planDeleteListItem(PROSE_TEXT, PROSE, ['page', 'blocks', 0, 'bullets'], 9).error, /no such/);
});

test('planAddEdgeBetween wires the exact clicked pair and refuses duplicates and self-loops', () => {
  const r = B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'c', 'a');
  assert.ok(!r.error, r.error);
  const d = JSON.parse(r.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.edges[1], {from: 'c', to: 'a', kind: 'int', label: 'describe the hop'});
  assert.strictEqual(r.index, 1);
  assert.match(B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'a', 'b').error, /already exists/);
  assert.match(B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'a', 'a').error, /same node/);
  assert.match(B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'a', 'zz').error, /unknown node/);
});

test('planDuplicateNode copies the definition beside the original placement', () => {
  const plain1 = B.planDuplicateNode(PROSE_TEXT, PROSE, 0, 'a');
  const d1 = JSON.parse(plain1.text).page.blocks[0].diagram;
  assert.strictEqual(plain1.id, 'a1');
  assert.deepStrictEqual(d1.rows[0][0], 'a');
  assert.strictEqual(d1.rows[0][1], 'a1'); /* right after the original slot */
  assert.deepStrictEqual(d1.nodes.a1, {title: 'A'});

  const stack = B.planDuplicateNode(PROSE_TEXT, PROSE, 0, 'b');
  const d2 = JSON.parse(stack.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d2.rows[0][1], ['b', 'b1', 'c']); /* inside the stack */

  const float = B.planDuplicateNode(JSON.stringify(RICH, null, 2), RICH, 0, 'f');
  const d3 = JSON.parse(float.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d3.floats[1], {id: 'f1', side: 'above'});
  assert.match(B.planDuplicateNode(PROSE_TEXT, PROSE, 0, 'zz').error, /not found/);
});

test('planDuplicateSection deep-copies right after the original and renames the heading', () => {
  const r = B.planDuplicateSection(TEXT, SPEC, 1); /* first tab section */
  const out = JSON.parse(r.text);
  const secs = out.page.blocks[1].tabs[0].sections;
  assert.strictEqual(secs.length, 2);
  assert.strictEqual(secs[1].heading, 'InTab (copy)');
  assert.deepStrictEqual(secs[1].diagram.nodes, secs[0].diagram.nodes);
  assert.strictEqual(r.index, 2); /* renders directly after the original ordinal 1 */
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.match(B.planDuplicateSection(JSON.stringify(bare), bare, 0).error, /bare diagram/);
});

test('planDuplicateNode clones a float entry wholesale and places it after the original', () => {
  /* extra placement fields on the float entry must survive the copy
     (Codex pass-3 cycle-1 MAJOR: the copy was rebuilt from id+side only
     and appended at the end) */
  const spec = JSON.parse(JSON.stringify(RICH));
  spec.page.blocks[0].diagram.floats = [
    {id: 'f', side: 'above', dx: 18},
    {id: 'g2', side: 'above'}
  ];
  spec.page.blocks[0].diagram.nodes.g2 = {title: 'G2'};
  const plan = B.planDuplicateNode(JSON.stringify(spec, null, 2), spec, 0, 'f');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.floats, [
    {id: 'f', side: 'above', dx: 18},
    {id: 'f1', side: 'above', dx: 18},
    {id: 'g2', side: 'above'}
  ]);
});

/* ================= pass 4: insert palettes ================= */

function loadValidator(){
  const code =
    fs.readFileSync(path.join(ROOT, 'src', 'validator.js'), 'utf8') + '\n' +
    ';__exports = {validate, normalize, ICON_SET, TINT_SET, PANEL_TYPES};';
  const sandbox = {console};
  vm.runInNewContext(code, sandbox);
  return sandbox.__exports;
}
const V = loadValidator();

test('starter specs parse and validate with zero errors and warnings', () => {
  for (const source of ['starters/minimal.json', 'starters/panels-tour.json', 'flowview.demo.json']){
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', source), 'utf8'));
    const result = V.validate(V.normalize(spec));
    assert.deepStrictEqual(plain(result.errors), [], source);
    assert.deepStrictEqual(plain(result.warnings), [], source);
  }
});

test('starterCountLine totals all sections and tabs, skipping prose-only sections', () => {
  assert.strictEqual(B.starterCountLine(SPEC), '4 nodes · 1 steps · 1 panels');
  assert.strictEqual(B.starterCountLine({sections: SPEC.page.blocks}), '4 nodes · 1 steps · 1 panels');
  assert.strictEqual(B.starterCountLine(SPEC.page.blocks[0].diagram), '2 nodes · 1 steps · 0 panels');
  assert.strictEqual(B.starterCountLine({}), '0 nodes · 0 steps · 0 panels');
});

test('starter scaffolds have the promised nodes, steps, panels and timeline lanes', () => {
  const minimal = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/starters/minimal.json'), 'utf8'));
  assert.strictEqual(B.starterCountLine(minimal), '3 nodes · 2 steps · 0 panels');
  assert.strictEqual(minimal.page.sections.length, 1);
  assert.strictEqual(minimal.page.sections[0].diagram.rows.length, 1);
  assert.strictEqual(minimal.page.sections[0].diagram.edges.length, 2);
  const tour = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/starters/panels-tour.json'), 'utf8'));
  assert.strictEqual(B.starterCountLine(tour), '3 nodes · 4 steps · 5 panels');
  const d = tour.page.sections[0].diagram;
  assert.deepStrictEqual(d.panels.map(p => p.type), ['state', 'leds', 'gauge', 'log', 'timeline']);
  for (const panel of d.panels){
    assert.ok(panel.initial, panel.id);
    assert.ok(d.steps.some(step => step.panels && step.panels[panel.id]), panel.id);
  }
  assert.strictEqual(d.panels[4].lanes.length, 2);
  assert.ok(d.panels[4].lanes.every(lane => lane.id && lane.label && lane.every));
});

/* Small event/element stub for gallery wiring; rendering is counted separately. */
function galleryHarness(){
  const handlers = {};
  const elements = {};
  const document = {
    activeElement: null,
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    addEventListener(type, fn, capture){
      (handlers[type] || (handlers[type] = [])).push({fn, capture});
    },
    createElement: tag => new Element(tag)
  };
  class Element {
    constructor(tag){
      this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {};
      this.attributes = {}; this.hidden = true; this.value = ''; this.className = '';
    }
    set innerHTML(value){ this.children = []; }
    setAttribute(key, value){ this.attributes[key] = value; }
    getAttribute(key){ return this.attributes[key]; }
    appendChild(child){ this.children.push(child); child.parent = this; return child; }
    addEventListener(type, fn){ (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
    focus(){ document.activeElement = this; }
    querySelector(selector){
      return this.children.find(child => selector === 'button' && child.tagName === 'BUTTON') || null;
    }
    querySelectorAll(){ return []; }
    closest(selectors){
      for (const selector of selectors.split(',').map(s => s.trim())){
        if (selector === '#' + this.id) return this;
        if (selector === '#gallery button' && this.tagName === 'BUTTON'){
          for (let p = this.parent; p; p = p.parent) if (p.id === 'gallery') return this;
        }
      }
      return null;
    }
  }
  for (const id of ['src', 'docview', 'starters', 'gallery', 'undo-builder', 'redo-builder']){
    elements[id] = new Element(id === 'src' ? 'textarea' : id.includes('builder') || id === 'starters' ? 'button' : 'div');
    elements[id].id = id;
  }
  const src = elements.src;
  src.value = TEXT;
  let renderedText = TEXT;
  let renderCount = 0;
  let arm;
  const code = fs.readFileSync(path.join(ROOT, 'src/builder.workbench.js'), 'utf8');
  const sandbox = {console, document, window: {addEventListener(){}},
    MutationObserver: class {observe(){}}, setTimeout(){},
    captureArm(fn){ arm = fn; }};
  // Expose only the existing mode state to exercise capture-phase blocking.
  vm.runInNewContext(code.replace('  var initial = parseEditor();',
    '  captureArm(function(){ addToStep = {section: 0, step: 0}; });\n  var initial = parseEditor();'), sandbox);
  const starter = {name: 'blank flow', desc: 'a starting point',
    spec: JSON.parse(fs.readFileSync(path.join(ROOT, 'src/starters/minimal.json'), 'utf8'))};
  sandbox.initWorkbenchBuilder({src, view: elements.docview, starters: [starter],
    renderedText: () => renderedText, render(){ renderCount++; renderedText = src.value; }});
  function fire(target, type = 'click', extra = {}){
    const ev = {target, preventDefault(){ this.defaultPrevented = true; },
      stopPropagation(){ this.stopped = true; }, ...extra};
    for (const h of handlers[type] || []) if (h.capture) h.fn(ev);
    if (!ev.stopped){
      for (const fn of target.listeners[type] || []) fn.call(target, ev);
      for (const h of handlers[type] || []) if (!h.capture) h.fn(ev);
    }
    return ev;
  }
  return {elements, src, starter, fire, arm, document, renders: () => renderCount};
}

test('gallery toggles, shows counts, loads a rendered editor and preserves undo/redo', () => {
  const h = galleryHarness(), e = h.elements;
  h.fire(e.starters);
  assert.strictEqual(e.gallery.hidden, false);
  assert.strictEqual(e.starters.getAttribute('aria-expanded'), 'true');
  assert.strictEqual(e.gallery.children[0].children[2].textContent, '3 nodes · 2 steps · 0 panels');
  h.fire(e.starters);
  assert.strictEqual(e.gallery.hidden, true);
  h.fire(e.starters);
  h.fire(e.gallery.children[0]);
  assert.strictEqual(h.src.value, JSON.stringify(h.starter.spec, null, 2));
  assert.strictEqual(h.renders(), 1);
  assert.strictEqual(e.gallery.hidden, true);
  h.fire(e['undo-builder']);
  assert.strictEqual(h.src.value, TEXT);
  h.fire(e['redo-builder']);
  assert.deepStrictEqual(JSON.parse(h.src.value), h.starter.spec);
});

test('gallery protects unrendered invalid text, cancels or confirms, and undo restores exact edits', () => {
  const h = galleryHarness(), e = h.elements;
  const dirty = ' { unfinished JSON\n';
  h.src.value = dirty;
  h.fire(e.starters);
  h.fire(e.gallery.children[0]);
  assert.strictEqual(h.src.value, dirty);
  assert.strictEqual(h.renders(), 0);
  h.fire(e.gallery.children[1].children[2]); // cancel
  assert.strictEqual(e.gallery.children.length, 1);
  assert.strictEqual(h.src.value, dirty);
  h.fire(e.gallery.children[0]);
  h.src.value += 'newer edit';
  h.fire(e.gallery.children[1].children[1]); // load & replace
  assert.deepStrictEqual(JSON.parse(h.src.value), h.starter.spec);
  h.fire(e['undo-builder']);
  assert.strictEqual(h.src.value, dirty + 'newer edit');
});

test('gallery Escape dismisses confirmation and Ctrl/Cmd-Z undoes a starter load', () => {
  for (const modifier of ['ctrlKey', 'metaKey']){
    const h = galleryHarness(), e = h.elements;
    h.src.value = TEXT + '\n';
    h.fire(e.starters);
    h.fire(e.gallery.children[0]);
    h.fire(e.gallery, 'keydown', {key: 'Escape'});
    assert.strictEqual(e.gallery.hidden, true);
    assert.strictEqual(h.document.activeElement, e.starters);
    h.fire(e.starters);
    h.fire(e.gallery.children[0]);
    h.fire(e.gallery.children[1].children[1]);
    const ev = h.fire(h.src, 'keydown', {key: 'z', [modifier]: true});
    assert.strictEqual(ev.defaultPrevented, true);
    assert.strictEqual(h.src.value, TEXT + '\n');
  }
});

test('ADD TO STEP blocks gallery toggle, cards and pending replacement controls', () => {
  const h = galleryHarness(), e = h.elements;
  h.src.value = 'unfinished';
  h.fire(e.starters);
  h.fire(e.gallery.children[0]);
  const controls = [e.starters, e.gallery.children[0], ...e.gallery.children[1].children.slice(1)];
  h.arm();
  for (const control of controls){
    assert.strictEqual(h.fire(control).defaultPrevented, true);
    assert.strictEqual(h.src.value, 'unfinished');
    assert.strictEqual(h.renders(), 0);
  }
});

test('node presets cover distinct icons with legal icon and tint tokens', () => {
  const icons = B.NODE_PRESETS.map(p => p.icon);
  assert.strictEqual(new Set(icons).size, icons.length);
  for (const preset of B.NODE_PRESETS){
    assert.ok(V.ICON_SET.includes(preset.icon), preset.icon);
    assert.ok(V.TINT_SET.includes(preset.tint), preset.tint);
    assert.ok(preset.title && typeof preset.title === 'string');
  }
});

test('panel templates exist for every engine panel type and no extras', () => {
  assert.deepStrictEqual(Object.keys(B.PANEL_TEMPLATES).sort(), [...V.PANEL_TYPES].sort());
});

test('every panel template validates with zero errors AND zero warnings', () => {
  for (const type of Object.keys(B.PANEL_TEMPLATES)){
    const spec = JSON.parse(JSON.stringify(SPEC));
    const plan = B.planAddPanel(JSON.stringify(spec, null, 2), spec, 0, type);
    assert.ok(!plan.error, type + ': ' + plan.error);
    const out = JSON.parse(plan.text);
    const added = out.page.blocks[0].diagram.panels[0];
    assert.strictEqual(added.type, type);
    assert.strictEqual(added.id, type + '1');
    const v = V.validate(V.normalize(plain(out)));
    assert.deepStrictEqual(plain(v.errors), [], type + ' errors');
    assert.deepStrictEqual(plain(v.warnings), [], type + ' warnings: ' + JSON.stringify(v.warnings));
  }
});

test('planAddNode presets carry icon, tint, title, and an icon-named id', () => {
  const preset = B.NODE_PRESETS.find(p => p.icon === 'db');
  const plan = B.planAddNode(TEXT, SPEC, 0, plain(preset));
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.nodes.db1, {title: 'Store', sub: 'what it does', icon: 'db', tint: 'data'});
  assert.deepStrictEqual(d.rows[0], ['a', 'b', 'db1']);
  /* every preset yields a validator-clean insert */
  for (const pr of B.NODE_PRESETS){
    const pl = B.planAddNode(TEXT, SPEC, 0, plain(pr));
    const v = V.validate(V.normalize(plain(JSON.parse(pl.text))));
    assert.deepStrictEqual(plain(v.errors), [], pr.icon);
    assert.deepStrictEqual(plain(v.warnings), [], pr.icon + ': ' + JSON.stringify(v.warnings));
  }
  /* no preset: unchanged default behavior */
  const plain1 = B.planAddNode(TEXT, SPEC, 0);
  assert.ok(JSON.parse(plain1.text).page.blocks[0].diagram.nodes.node1);
});

/* ================= pass 5: durability ================= */

test('specFileName slugs the page title and falls back cleanly', () => {
  assert.strictEqual(B.specFileName({page: {title: 'Cumulus IoT — device messaging'}}),
    'cumulus-iot-device-messaging.spec.json');
  assert.strictEqual(B.specFileName({title: 'No wrapper'}), 'no-wrapper.spec.json');
  assert.strictEqual(B.specFileName({page: {title: '***'}}), 'flowspec.spec.json');
  assert.strictEqual(B.specFileName(null), 'flowspec.spec.json');
  assert.strictEqual(B.specFileName({nodes: {}, rows: []}), 'flowspec.spec.json');
});

/* ================= pass 6: clickable validation findings ================= */

test('parseValidationPath reads validator field paths and rejects pathless prose', () => {
  assert.deepStrictEqual(plain(B.parseValidationPath(
    'blocks[0].tabs[1].sections[0].diagram.edges[3].kind: unknown kind "x"')),
    ['blocks', 0, 'tabs', 1, 'sections', 0, 'diagram', 'edges', 3, 'kind']);
  assert.deepStrictEqual(plain(B.parseValidationPath('warn sections[2].heading: too long')),
    ['sections', 2, 'heading']);
  assert.deepStrictEqual(plain(B.parseValidationPath('ERROR page: must be an object')), ['page']);
  assert.deepStrictEqual(plain(B.parseValidationPath('blocks[0].diagram.nodes.d2.icon: bad')),
    ['blocks', 0, 'diagram', 'nodes', 'd2', 'icon']);
  assert.strictEqual(B.parseValidationPath('JSON parse: Unexpected token'), null);
  assert.strictEqual(B.parseValidationPath('no colon here'), null);
});

test('findingLocation maps page-prefixed findings onto the wrapped page, not page.page', () => {
  /* validator messages like "page.skin: unknown skin" address the page
     object itself (Codex cycle-1 MAJOR: the old mapping doubled the
     wrapper and selected the whole page object for wrapped specs) */
  const spec = {page: {title: 'T', skin: 'bogus', blocks: [{heading: 'H'}]}};
  const text = JSON.stringify(spec, null, 2);
  const skin = B.findingLocation(text, spec, 'page.skin: unknown skin "bogus"');
  assert.ok(skin.exact);
  assert.strictEqual(JSON.parse(text.slice(skin.start, skin.end)), 'bogus');
  /* page.blocks missing entirely: selects the page object, not exact */
  const noBlocks = {page: {title: 'T'}};
  const nbText = JSON.stringify(noBlocks, null, 2);
  const nb = B.findingLocation(nbText, noBlocks, 'page.blocks: required');
  assert.ok(!nb.exact);
  assert.deepStrictEqual(JSON.parse(nbText.slice(nb.start, nb.end)), {title: 'T'});
  /* unwrapped alias page: page-prefixed finding lands on the field */
  const alias = {skin: 'bogus', sections: [{heading: 'H'}]};
  const aText = JSON.stringify(alias, null, 2);
  const a = B.findingLocation(aText, alias, 'page.skin: unknown skin "bogus"');
  assert.strictEqual(JSON.parse(aText.slice(a.start, a.end)), 'bogus');
});

test('findingLocation resolves author ids that contain dots via longest-key match', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {'svc.api.v2': {title: 'A', icon: 'gear'}, plain: {title: 'P'}},
    rows: [['svc.api.v2', 'plain']],
    edges: [{from: 'svc.api.v2', to: 'plain'}]}}]}};
  const text = JSON.stringify(spec, null, 2);
  const hit = B.findingLocation(text, spec,
    'blocks[0].diagram.nodes.svc.api.v2.icon: unknown icon "x"');
  assert.ok(hit.exact);
  assert.strictEqual(JSON.parse(text.slice(hit.start, hit.end)), 'gear');
});

test('findingLocation selects the exact field and falls back to the nearest parent', () => {
  const exact = B.findingLocation(TEXT, SPEC,
    'blocks[0].diagram.edges[0].kind: unknown kind "x"');
  assert.ok(exact.exact);
  assert.strictEqual(JSON.parse(TEXT.slice(exact.start, exact.end)), 'int');

  /* leaf absent in the text (validator warns about a default) -> parent */
  const parent = B.findingLocation(TEXT, SPEC,
    'blocks[0].diagram.edges[0].bend: must be a number');
  assert.ok(!parent.exact);
  assert.deepStrictEqual(JSON.parse(TEXT.slice(parent.start, parent.end)),
    SPEC.page.blocks[0].diagram.edges[0]);

  const bare = {nodes: {a: {title: 'A'}}, rows: [['a']]};
  const bareText = JSON.stringify(bare, null, 2);
  const b = B.findingLocation(bareText, bare, 'sections[0].diagram.nodes.a.icon: unknown icon');
  assert.ok(!b.exact); /* icon absent -> node object */
  assert.deepStrictEqual(JSON.parse(bareText.slice(b.start, b.end)), {title: 'A'});

  assert.strictEqual(B.findingLocation(TEXT, SPEC, 'JSON parse: nope'), null);
});

/* ================= tab management ================= */

test('builderTabPath addresses tabs by block index across page shapes', () => {
  assert.deepStrictEqual(plain(B.builderTabPath(SPEC, 1, 1)),
    ['page', 'blocks', 1, 'tabs', 1]);
  assert.strictEqual(B.builderTabPath(SPEC, 0, 0), null); /* plain section block */
  assert.strictEqual(B.builderTabPath(SPEC, 1, 9), null);
  const alias = {sections: [{tabs: [{label: 'A', sections: []}]}]};
  assert.deepStrictEqual(plain(B.builderTabPath(alias, 0, 0)), ['sections', 0, 'tabs', 0]);
  assert.strictEqual(B.builderTabPath({nodes: {}, rows: []}, 0, 0), null);
});

test('the tab template is valid JSON holding one renderable section', () => {
  const tab = JSON.parse(B.BUILDER_TAB_TEMPLATE);
  assert.strictEqual(tab.label, 'New tab');
  assert.strictEqual(tab.sections.length, 1);
  assert.ok(tab.sections[0].diagram.nodes.svc1);
});

test('planAddTab inserts a validator-clean tab directly after the current one', () => {
  const plan = B.planAddTab(TEXT, SPEC, 1, 0);
  assert.ok(!plan.error, plan.error);
  const tabs = JSON.parse(plan.text).page.blocks[1].tabs;
  assert.deepStrictEqual(tabs.map(x => x.label), ['One', 'New tab', 'Two']);
  assert.strictEqual(plan.index, 1);
  const v = V.validate(V.normalize(plain(JSON.parse(plan.text))));
  assert.deepStrictEqual(plain(v.errors), []);
  assert.deepStrictEqual(plain(v.warnings), []);
  assert.match(B.planAddTab(TEXT, SPEC, 0, 0).error, /not found/);
});

test('planDeleteTab removes a tab but refuses the last one in its block', () => {
  const plan = B.planDeleteTab(TEXT, SPEC, 1, 0);
  const tabs = JSON.parse(plan.text).page.blocks[1].tabs;
  assert.deepStrictEqual(tabs.map(x => x.label), ['Two']);
  const one = {page: {blocks: [{tabs: [{label: 'Only', sections: []}]}]}};
  assert.match(B.planDeleteTab(JSON.stringify(one), one, 0, 0).error, /last tab/);
});

test('planMoveTab reorders within the block and clamps the ends', () => {
  const plan = B.planMoveTab(TEXT, SPEC, 1, 0, 1);
  const tabs = JSON.parse(plan.text).page.blocks[1].tabs;
  assert.deepStrictEqual(tabs.map(x => x.label), ['Two', 'One']);
  assert.strictEqual(plan.index, 1);
  assert.match(B.planMoveTab(TEXT, SPEC, 1, 0, -1).error, /end/);
  assert.match(B.planMoveTab(TEXT, SPEC, 1, 1, 1).error, /end/);
});

/* ================= step contract editing ================= */

test('builderStepHops reads edge, edges, and edgeless shapes', () => {
  assert.deepStrictEqual(plain(B.builderStepHops({edge: 'a->b'})), ['a->b']);
  assert.deepStrictEqual(plain(B.builderStepHops({edges: ['a->b', 'c->d']})), ['a->b', 'c->d']);
  assert.deepStrictEqual(plain(B.builderStepHops({text: 'only'})), []);
  assert.deepStrictEqual(plain(B.builderStepHops(null)), []);
});

test('planStepToggleHop adds, removes, and normalizes edge/edges shapes', () => {
  /* RICH steps[0] = {edge:'a->b', ...}; add a->c -> edges pair */
  const add = B.planStepToggleHop(RICH_TEXT, RICH, 0, 0, 'a->c');
  assert.ok(!add.error, add.error);
  assert.ok(add.added);
  const st1 = JSON.parse(add.text).page.blocks[0].diagram.steps[0];
  assert.ok(!('edge' in st1));
  assert.deepStrictEqual(st1.edges, ['a->b', 'a->c']);

  /* remove one of a pair -> back to single edge string */
  const back = B.planStepToggleHop(add.text, JSON.parse(add.text), 0, 0, 'a->c');
  const st2 = JSON.parse(back.text).page.blocks[0].diagram.steps[0];
  assert.strictEqual(st2.edge, 'a->b');
  assert.ok(!('edges' in st2));

  /* remove the last hop -> edgeless step, keys gone */
  const gone = B.planStepToggleHop(back.text, JSON.parse(back.text), 0, 0, 'a->b');
  const st3 = JSON.parse(gone.text).page.blocks[0].diagram.steps[0];
  assert.ok(!('edge' in st3) && !('edges' in st3));
  assert.strictEqual(st3.text, 's1'); /* caption survives */

  assert.match(B.planStepToggleHop(RICH_TEXT, RICH, 0, 0, 'zz->qq').error, /no edge/);
});

test('planStepToggleNode adds and removes lit nodes, dropping the empty list', () => {
  const add = B.planStepToggleNode(RICH_TEXT, RICH, 0, 0, 'c');
  assert.deepStrictEqual(JSON.parse(add.text).page.blocks[0].diagram.steps[0].nodes, ['c']);
  const off = B.planStepToggleNode(add.text, JSON.parse(add.text), 0, 0, 'c');
  assert.ok(!('nodes' in JSON.parse(off.text).page.blocks[0].diagram.steps[0]));
  /* RICH steps[1] already lights f */
  const rm = B.planStepToggleNode(RICH_TEXT, RICH, 0, 1, 'f');
  assert.ok(!rm.added);
  assert.ok(!('nodes' in JSON.parse(rm.text).page.blocks[0].diagram.steps[1]));
  assert.match(B.planStepToggleNode(RICH_TEXT, RICH, 0, 0, 'zz').error, /no node/);
});

test('planStepTogglePanel adds an empty patch, removes an existing one, and stays validator-clean', () => {
  /* add the gauge panel to step 0 (only q is patched there) */
  const add = B.planStepTogglePanel(RICH_TEXT, RICH, 0, 0, 'g');
  const st = JSON.parse(add.text).page.blocks[0].diagram.steps[0];
  assert.deepStrictEqual(st.panels.g, {});
  assert.deepStrictEqual(Object.keys(st.panels), ['q', 'g']);
  const v = V.validate(V.normalize(plain(JSON.parse(add.text))));
  assert.deepStrictEqual(plain(v.errors), []);
  assert.deepStrictEqual(plain(v.warnings), []);

  /* remove the only patch of step 2 (none) / remove q from step 0 */
  const rm = B.planStepTogglePanel(RICH_TEXT, RICH, 0, 0, 'q');
  assert.ok(!('panels' in JSON.parse(rm.text).page.blocks[0].diagram.steps[0]));
  assert.match(B.planStepTogglePanel(RICH_TEXT, RICH, 0, 0, 'zz').error, /no panel/);
});

test('planStepSetPanelPatch replaces a patch and rejects non-object JSON', () => {
  const r = B.planStepSetPanelPatch(RICH_TEXT, RICH, 0, 0, 'q', '{"state": "held", "reason": "waiting"}');
  assert.ok(!r.error, r.error);
  const st = JSON.parse(r.text).page.blocks[0].diagram.steps[0];
  assert.deepStrictEqual(st.panels.q, {state: 'held', reason: 'waiting'});
  assert.match(B.planStepSetPanelPatch(RICH_TEXT, RICH, 0, 0, 'q', 'not json').error, /not valid JSON/);
  assert.match(B.planStepSetPanelPatch(RICH_TEXT, RICH, 0, 0, 'q', '[1]').error, /JSON object/);
  assert.match(B.planStepSetPanelPatch(RICH_TEXT, RICH, 0, 0, 'g', '{}').error, /not in this step/);
});

test('builderStepHops merges the malformed both-keys shape without dropping hops', () => {
  assert.deepStrictEqual(plain(B.builderStepHops({edge: 'a->b', edges: ['c->d', 'a->b']})),
    ['a->b', 'c->d']);
  /* a toggle on such a step keeps every listed hop */
  const spec = JSON.parse(JSON.stringify(RICH));
  spec.page.blocks[0].diagram.steps[0] = {edge: 'a->b', edges: ['a->c'], text: 's1'};
  const plan = B.planStepToggleHop(JSON.stringify(spec, null, 2), spec, 0, 0, 'a->f');
  const st = JSON.parse(plan.text).page.blocks[0].diagram.steps[0];
  assert.deepStrictEqual(st.edges, ['a->b', 'a->c', 'a->f']);
  assert.ok(!('edge' in st));
});

/* ================= panel setup field table ================= */

test('PANEL_SETUP_FIELDS covers exactly the engine panel types with known control kinds', () => {
  assert.deepStrictEqual(Object.keys(B.PANEL_SETUP_FIELDS).sort(), [...V.PANEL_TYPES].sort());
  const kinds = new Set(['text', 'num', 'csv', 'scene', 'json', 'jsonArr', 'jsonAny',
                         'clock', 'rows', 'map', 'objf']);
  for (const [type, fields] of Object.entries(B.PANEL_SETUP_FIELDS)){
    assert.ok(fields.length >= 1, type);
    for (const [key, kind] of fields){
      assert.ok(typeof key === 'string' && key.length, type + '.' + key);
      assert.ok(kinds.has(kind), type + '.' + key + ' kind ' + kind);
    }
    /* initial — THE setup field — is exposed for every type */
    assert.ok(fields.some(f => f[0] === 'initial'), type + ' exposes initial');
  }
});

test('every key the palette starter templates carry has a setup control', () => {
  for (const [type, tpl] of Object.entries(B.PANEL_TEMPLATES)){
    const declared = new Set((B.PANEL_SETUP_FIELDS[type] || []).map(f => f[0]));
    for (const key of Object.keys(tpl)){
      if (key === 'title') continue; /* title has its own fixed row */
      assert.ok(declared.has(key), type + ' template key "' + key + '" lacks a setup control');
    }
  }
});

test('the timeline palette starter renders a validator-clean heartbeat setup', () => {
  const plan = B.planAddPanel(TEXT, SPEC, 0, 'timeline');
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.panels[0].type, 'timeline');
  assert.strictEqual(d.panels[0].span, '6h');
  assert.deepStrictEqual(d.panels[0].cadence, {every: '30m', label: 'heartbeat'});
  const v = V.validate(V.normalize(plain(JSON.parse(plan.text))));
  assert.deepStrictEqual(plain(v.errors), []);
  assert.deepStrictEqual(plain(v.warnings), []);
});

/* ---------------- collapsible editor sections: persisted prefs ---------------- */

test('builderSectionPrefs defaults to everything open on missing/garbage input', () => {
  for (const raw of [null, undefined, '', 'not json', '42', '"str"', '[]']){
    assert.deepStrictEqual(plain(B.builderSectionPrefs(raw)), {insert: true, source: true});
  }
});

test('builderSectionPrefs honors stored booleans and ignores everything else', () => {
  assert.deepStrictEqual(plain(B.builderSectionPrefs('{"insert":false,"source":false}')),
    {insert: false, source: false});
  assert.deepStrictEqual(plain(B.builderSectionPrefs('{"source":false}')),
    {insert: true, source: false});
  /* non-boolean values and unknown keys fall back to open */
  assert.deepStrictEqual(plain(B.builderSectionPrefs('{"insert":"no","source":1,"extra":true}')),
    {insert: true, source: true});
});

/* ---------------- typed panel setup editors: pure collectors ---------------- */

test('rowsEditorCollect merges edits, keeps unknown keys, drops blank new rows, enforces req/num/max', () => {
  const shape = {cols: [{k: 'id', req: true}, {k: 'label'}, {k: 'ms', kind: 'num', req: true}], max: 3};
  const out = B.rowsEditorCollect(shape, [
    {base: {id: 'dns', label: 'DNS', ms: 40, weird: 7}, values: {id: 'dns', label: 'lookup', ms: '55'}},
    {base: null, values: {id: '', label: '', ms: ''}},           /* blank new row: dropped */
    {base: null, values: {id: 'tls', label: '', ms: '120'}}
  ]);
  assert.deepStrictEqual(plain(out.items), [
    {id: 'dns', label: 'lookup', ms: 55, weird: 7},               /* unknown key survives */
    {id: 'tls', ms: 120}                                          /* empty optional col omitted */
  ]);
  assert.match(B.rowsEditorCollect(shape, [
    {base: null, values: {id: '', label: 'x', ms: '9'}}
  ]).error, /item 1: id is required/);
  assert.match(B.rowsEditorCollect(shape, [
    {base: null, values: {id: 'a', label: '', ms: 'fast'}}
  ]).error, /ms: "fast" is not a number/);
  assert.match(B.rowsEditorCollect(shape, [1, 2, 3, 4].map(n => (
    {base: null, values: {id: 'i' + n, label: '', ms: String(n)}}
  ))).error, /at most 3 items/);
  /* blanking an EXISTING row fails required cols instead of silently dropping */
  assert.match(B.rowsEditorCollect(shape, [
    {base: {id: 'keep', ms: 4}, values: {id: '', label: '', ms: ''}}
  ]).error, /item 1: id is required/);
});

test('rowsEditorCollect validates clock and enum columns when the parser is present', () => {
  const withClock = loadBuilder({parseClock: t => (/^\d+m$/.test(t) ? Number(t.slice(0, -1)) * 60 : null)});
  const shape = {cols: [{k: 'id', req: true}, {k: 'every', kind: 'clock', req: true},
                        {k: 'kind', kind: 'enum', options: ['ok', 'alert']}]};
  const good = withClock.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: '5m', kind: 'alert'}}
  ]);
  assert.deepStrictEqual(plain(good.items), [{id: 'hb', every: '5m', kind: 'alert'}]);
  assert.match(withClock.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: 'soonish', kind: ''}}
  ]).error, /every: "soonish" is not a duration/);
  assert.match(withClock.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: '5m', kind: 'loud'}}
  ]).error, /kind: "loud" is not one of ok \| alert/);
  /* an unknown enum value ALREADY on the item passes through: editing a
     sibling column must neither reject nor delete it */
  const kept = withClock.rowsEditorCollect(shape, [
    {base: {id: 'hb', every: '5m', kind: 'loud'}, values: {id: 'hb2', every: '5m', kind: 'loud'}}
  ]);
  assert.deepStrictEqual(plain(kept.items), [{id: 'hb2', every: '5m', kind: 'loud'}]);
  /* without a parser (this vm copy), clock text passes through unvalidated */
  const noParser = B.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: 'soonish', kind: ''}}
  ]);
  assert.deepStrictEqual(plain(noParser.items), [{id: 'hb', every: 'soonish'}]);
});

test('mapEditorCollect drops blank pairs, rejects duplicates, and empties to null', () => {
  assert.deepStrictEqual(plain(B.mapEditorCollect([
    {key: 'OK', value: '#34D399'},
    {key: '', value: '#111111'},          /* blank key: dropped */
    {key: 'BAD', value: ''},              /* blank value: dropped */
    {key: 'ERR', value: '#F87171'}
  ]).obj), {OK: '#34D399', ERR: '#F87171'});
  assert.match(B.mapEditorCollect([
    {key: 'A', value: '1'}, {key: 'A', value: '2'}
  ]).error, /duplicate key "A"/);
  assert.strictEqual(B.mapEditorCollect([{key: '', value: ''}]).obj, null);
});

test('objFieldsCollect keeps unknown keys, removes on all-empty, and validates like a row', () => {
  const shape = {cols: [{k: 'every', req: true}, {k: 'label'}]};
  const out = B.objFieldsCollect(shape, {every: '30m', label: 'heartbeat', extra: true},
                                 {every: '1h', label: ''});
  assert.deepStrictEqual(plain(out.obj), {every: '1h', extra: true});
  assert.strictEqual(B.objFieldsCollect(shape, {every: '30m'}, {every: '', label: ''}).obj, null);
  assert.match(B.objFieldsCollect(shape, {}, {every: '', label: 'x'}).error, /every is required/);
});

test('every PANEL_SETUP_FIELDS entry uses a known control kind with a sane shape', () => {
  const known = ['text', 'num', 'csv', 'scene', 'json', 'jsonArr', 'jsonAny',
                 'clock', 'rows', 'map', 'objf'];
  Object.keys(B.PANEL_SETUP_FIELDS).forEach(type => {
    B.PANEL_SETUP_FIELDS[type].forEach(f => {
      assert.ok(known.includes(f[1]), type + '.' + f[0] + ' kind ' + f[1]);
      if (f[1] === 'rows' || f[1] === 'objf'){
        assert.ok(Array.isArray(f[2].cols) && f[2].cols.length, type + '.' + f[0] + ' needs cols');
        f[2].cols.forEach(c => assert.ok(typeof c.k === 'string' && c.k, type + '.' + f[0] + ' col key'));
      }
    });
    const last = B.PANEL_SETUP_FIELDS[type][B.PANEL_SETUP_FIELDS[type].length - 1];
    assert.strictEqual(last[0], 'initial', type + ' ends with initial');
  });
});

/* ---------------- reordering: swap planners ---------------- */

test('jsonSwapListItems trades two item spans and keeps each item formatting', () => {
  const text = '{\n  "list": [\n    {"a": 1},\n    "middle",\n    {"c":\n     3}\n  ]\n}';
  const swap = B.jsonSwapListItems(text, ['list'], 0, 2);
  assert.deepStrictEqual(JSON.parse(swap.text).list, [{c: 3}, 'middle', {a: 1}]);
  assert.ok(swap.text.includes('{"c":\n     3}'), 'multi-line item formatting survives');
  assert.strictEqual(swap.text.slice(swap.first.start, swap.first.end), '{"c":\n     3}');
  assert.strictEqual(swap.text.slice(swap.second.start, swap.second.end), '{"a": 1}');
  assert.strictEqual(B.jsonSwapListItems(text, ['list'], 1, 1), null);
  assert.strictEqual(B.jsonSwapListItems(text, ['list'], 0, 9), null);
});

test('planMoveSection moves within its own list, hops tab containers, and stops at the ends', () => {
  const text = TEXT; /* SPEC: blocks[0]=plain section, blocks[1]=tabs container */
  const down = B.planMoveSection(text, SPEC, 0, 1);
  const parsed = JSON.parse(down.text);
  assert.ok(Array.isArray(parsed.page.blocks[0].tabs), 'the tabs container moved first');
  assert.strictEqual(parsed.page.blocks[1].heading, 'Plain');
  assert.deepStrictEqual(plain(down.newPath), ['page', 'blocks', 1]);
  /* the moved-down section's selection span parses back to the section */
  assert.deepStrictEqual(JSON.parse(down.text.slice(down.start, down.end)).heading, 'Plain');

  assert.match(B.planMoveSection(text, SPEC, 0, -1).error, /already first/);
  /* inside a tab list: the only section of tab One cannot move */
  assert.match(B.planMoveSection(text, SPEC, 1, 1).error, /already last/);
  assert.match(B.planMoveSection(text, SPEC, 1, -1).error, /already first/);
});

test('planSwapNodes swaps layout slots across rows, stacks, and floats only', () => {
  const spec = {page: {blocks: [{heading: 'S', diagram: {
    nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}, f: {title: 'F'}},
    rows: [['a', ['b', 'c']]],
    floats: [{id: 'f', side: 'above'}],
    edges: [{from: 'a', to: 'b'}],
    steps: [{edge: 'a->b', text: 't'}]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  const inRows = B.planSwapNodes(text, spec, 0, 'a', 'c');
  const d1 = JSON.parse(inRows.text).page.blocks[0].diagram;
  assert.deepStrictEqual(plain(d1.rows), [['c', ['b', 'a']]]);
  assert.deepStrictEqual(plain(d1.edges), [{from: 'a', to: 'b'}], 'edges keep identities');
  assert.strictEqual(d1.steps[0].edge, 'a->b', 'steps keep identities');

  const withFloat = B.planSwapNodes(text, spec, 0, 'a', 'f');
  const d2 = JSON.parse(withFloat.text).page.blocks[0].diagram;
  assert.deepStrictEqual(plain(d2.rows), [['f', ['b', 'c']]]);
  assert.deepStrictEqual(plain(d2.floats), [{id: 'a', side: 'above'}]);

  assert.match(B.planSwapNodes(text, spec, 0, 'a', 'a').error, /DIFFERENT node/);
  const unplaced = {page: {blocks: [{heading: 'S', diagram: {
    nodes: {a: {}, ghost: {}}, rows: [['a']]}}]}};
  assert.match(B.planSwapNodes(JSON.stringify(unplaced, null, 2), unplaced, 0, 'a', 'ghost').error,
    /"ghost" has no layout slot/);
});

/* ================= Mermaid import ================= */
const MERMAID_SEQ = 'sequenceDiagram\nparticipant A as Alpha Svc\nparticipant B\n' +
  'A->>B: POST /things\nB-->>A: created\n';

function mermaidDiagram(text){ return B.mermaidToSpec(text).page.sections[0].diagram; }

test('mermaidToSpec makes a bland two-participant page with solid and return edges', () => {
  const spec = plain(B.mermaidToSpec(MERMAID_SEQ));
  assert.strictEqual(spec.page.title, 'Converted sequence');
  assert.strictEqual(spec.page.sections[0].heading, spec.page.title);
  const d = spec.page.sections[0].diagram;
  assert.strictEqual(d.view, 'ambient');
  assert.deepStrictEqual(d.nodes, {
    a: {title: 'Alpha Svc', sub: '', icon: 'gear', tint: 'cmd'},
    b: {title: 'B', sub: '', icon: 'gear', tint: 'cmd'}
  });
  assert.deepStrictEqual(d.rows, [['a'], ['b']]);
  assert.deepStrictEqual(d.edges, [
    {from: 'a', to: 'b', kind: 'https', label: 'POST /things'},
    {from: 'b', to: 'a', kind: 'int', label: 'created', ret: true}
  ]);
  assert.deepStrictEqual(d.steps, [
    {edge: 'a->b', text: 'POST /things'}, {edge: 'b->a', text: 'created'}
  ]);
  assert.deepStrictEqual(spec.todos, []);
});

test('mermaidToSpec slugs implicit participants and honors later aliases without reordering', () => {
  const d = mermaidDiagram('sequenceDiagram\nFoo-Bar->>constructor: hi\n' +
    'participant Foo_Bar as New label\nparticipant Foo-Bar\n');
  assert.deepStrictEqual(Object.keys(d.nodes), ['foobar', 'constructor']);
  assert.strictEqual(d.nodes.foobar.title, 'New label');
  assert.strictEqual(d.nodes.constructor.title, 'constructor');
});

test('mermaidToSpec extracts the first markdown mermaid fence as the Python oracle does', () => {
  assert.deepStrictEqual(plain(B.mermaidToSpec('# Intro\n\n```mermaid\n' + MERMAID_SEQ +
    '```\nprose\n```mermaid\nsequenceDiagram\nX->>Y: later\n```')), plain(B.mermaidToSpec(MERMAID_SEQ)));
  assert.throws(() => B.mermaidToSpec('```mermaid\nflowchart TD\n```\n```mermaid\n' +
    MERMAID_SEQ + '```'), /line 1: not a sequenceDiagram/);
});

test('mermaidToSpec infers protocols in Python priority order and splits serpentine rows', () => {
  const d = mermaidDiagram('sequenceDiagram\nautonumber\nA->>B: GET mqtt status\n' +
    'B->>C: PUBLISH topic (QoS 1)\nC->>D: plain call\nD->>E: subscribe\n');
  assert.deepStrictEqual(plain(d.edges.map(e => e.kind)), ['https', 'mqtt', 'int', 'mqtt']);
  assert.deepStrictEqual(plain(d.rows), [['a', 'b', 'c'], ['d', 'e']]);
  assert.deepStrictEqual(plain(mermaidDiagram('sequenceDiagram\nA->>A: self').rows), [['a']]);
});

test('mermaidToSpec folds repeated pairs with first label kind and arrow winning but keeps every step', () => {
  for (const arrow of ['->>', '-->>']){
    const d = mermaidDiagram('sequenceDiagram\nA' + arrow + 'B: first\n' +
      'A-->>B: GET second\nA->>B: PUBLISH third');
    assert.strictEqual(d.edges.length, 1);
    assert.strictEqual(d.edges[0].label, 'first');
    assert.strictEqual(d.edges[0].kind, 'int');
    assert.strictEqual(d.edges[0].ret, arrow === '-->>' ? true : undefined);
    assert.deepStrictEqual(plain(d.steps), [
      {edge: 'a->b', text: 'first'}, {edge: 'a->b', text: 'GET second'},
      {edge: 'a->b', text: 'PUBLISH third'}
    ]);
  }
});

test('mermaidToSpec records alt opt loop and par todos and skips their messages and participants', () => {
  for (const block of ['alt', 'opt', 'loop', 'par']){
    const spec = B.mermaidToSpec('sequenceDiagram\nA->>B: outside\n' + block + ' condition\n' +
      'participant C as Hidden\nB->>C: skipped\nelse other\nC-->>A: also skipped\nend');
    assert.deepStrictEqual(plain(spec.todos), [block + ' condition block not converted (2 message(s) inside) — add by hand']);
    const d = spec.page.sections[0].diagram;
    assert.deepStrictEqual(Object.keys(d.nodes), ['a', 'b']);
    assert.deepStrictEqual(plain(d.steps), [{edge: 'a->b', text: 'outside'}]);
  }
});

test('mermaidToSpec counts nested blocks once and preserves notes in encounter order', () => {
  const spec = B.mermaidToSpec('sequenceDiagram\nNote over A: before\nA->>B: outside\n' +
    'alt outer\nA->>B: one\nloop inner\nnote over B: inside\nB-->>A: two\nend\nend\nopt empty\nend');
  assert.deepStrictEqual(plain(spec.todos), [
    'note not converted: Note over A: before', 'note not converted: note over B: inside',
    'alt outer block not converted (2 message(s) inside) — add by hand',
    'opt empty block not converted (0 message(s) inside) — add by hand'
  ]);
  assert.strictEqual(spec.page.sections[0].diagram.steps.length, 1);
});

test('mermaidToSpec rejects garbage and malformed or message-free input with line information', () => {
  const cases = [
    ['', /line 1: not a sequenceDiagram/],
    ['flowchart TD\nA-->B', /line 1: not a sequenceDiagram/],
    ['sequenceDiagram\n\nA-xB: dies', /line 2: unsupported syntax.*A-xB/],
    ['sequenceDiagram\nelse ok', /line 2: 'else' outside/],
    ['sequenceDiagram\nend', /line 2: 'end' without/],
    ['sequenceDiagram\nalt x\nA->>B: inside', /line 2: unclosed/],
    ['sequenceDiagram\nparticipant A', /line 2: no messages/],
    ['sequenceDiagram\nopt x\nA->>B: inside\nend', /line 4: no messages/],
    ['sequenceDiagram\nA->>!!!: hi', /line 2: participant id.*slugs to nothing/],
    ['sequenceDiagram\nA->>B:', /line 2: unsupported syntax/],
    ['sequenceDiagram\nA->>B: hi\nalt x\nactivate B\nend', /line 4: unsupported syntax/]
  ];
  for (const [input, error] of cases) assert.throws(() => B.mermaidToSpec(input), error);
  assert.throws(() => B.mermaidToSpec(null), /line 1: expected mermaid text/);
});

test('mermaidToSpec converts the cumulus HLD and validates skeletons with zero errors', () => {
  const hld = fs.readFileSync(path.join(ROOT, 'examples/cumulus/cumulus-hld.md'), 'utf8');
  const converted = B.mermaidToSpec(hld);
  const d = converted.page.sections[0].diagram;
  assert.strictEqual(Object.keys(d.nodes).length, 8);
  assert.ok(d.edges.length >= 10);
  assert.strictEqual(d.steps.length, 12);
  for (const spec of [converted, B.mermaidToSpec(MERMAID_SEQ),
    B.mermaidToSpec('sequenceDiagram\nA->>B: first\nA->>B: second')]){
    assert.deepStrictEqual(plain(V.validate(V.normalize(spec)).errors), []);
  }
});

/* Minimal event DOM: exercise the real import/history/mode handlers without a browser. */
function importHarness(){
  const elements = {}, listeners = {}, doc = {activeElement: null};
  function element(tag = 'div', id = ''){
    const attrs = {}, handlers = {};
    const el = {tagName: tag.toUpperCase(), id, className: '', children: [], style: {},
      value: '', hidden: false, disabled: false, textContent: '',
      addEventListener(type, fn){ (handlers[type] ||= []).push(fn); },
      appendChild(child){ this.children.push(child); child.parentNode = this; return child; },
      setAttribute(k, v){ attrs[k] = String(v); },
      getAttribute(k){ return attrs[k] ?? null; },
      hasAttribute(k){ return Object.hasOwn(attrs, k); },
      remove(){ if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
      focus(){ doc.activeElement = this; },
      setSelectionRange(){},
      contains(child){ return child === this || this.children.some(c => c.contains(child)); },
      matches(selector){
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
        if (selector.startsWith('[')) return this.hasAttribute(selector.slice(1, -1));
        return this.tagName.toLowerCase() === selector;
      },
      closest(selectors){
        for (let at = this; at; at = at.parentNode){
          if (selectors.split(',').some(s => at.matches(s.trim()))) return at;
        }
        return null;
      },
      querySelectorAll(selector){
        return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
      },
      querySelector(selector){ return this.querySelectorAll(selector)[0] || null; },
      fire(type, props = {}){
        const ev = {target: this, key: '', preventDefault(){ this.defaultPrevented = true; },
          stopPropagation(){ this.stopped = true; }, ...props};
        for (const rec of listeners[type] || []) if (rec.capture) rec.fn(ev);
        if (!ev.stopped){
          for (let at = this; at; at = at.parentNode) for (const fn of at.handlers[type] || []) fn(ev);
          for (const rec of listeners[type] || []) if (!rec.capture) rec.fn(ev);
        }
        return ev;
      }, handlers
    };
    el.classList = {
      add(c){ el.className += ' ' + c; },
      remove(c){ el.className = el.className.split(' ').filter(x => x !== c).join(' '); }
    };
    Object.defineProperty(el, 'innerHTML', {set(){ el.children = []; }, get(){ return ''; }});
    if (id) elements[id] = el;
    return el;
  }
  doc.body = element('body');
  doc.createElement = element;
  doc.createTextNode = text => Object.assign(element('span'), {textContent: text});
  doc.getElementById = id => elements[id] || null;
  doc.querySelector = () => null;
  doc.addEventListener = (type, fn, capture) => { (listeners[type] ||= []).push({fn, capture}); };
  for (const id of ['docview', 'src', 'guide', 'btarget', 'msgs', 'importbox', 'import-mermaid-text',
    'import-mermaid', 'import-mermaid-convert', 'import-mermaid-cancel', 'undo-builder', 'redo-builder']){
    const tag = id === 'src' || id === 'import-mermaid-text' ? 'textarea' :
      id.includes('builder') || id.startsWith('import-mermaid') ? 'button' : 'div';
    doc.body.appendChild(element(tag, id));
  }
  elements.importbox.hidden = true;
  elements['undo-builder'].disabled = true;
  elements.src.value = TEXT;
  const saved = {};
  const sandbox = {console, document: doc, window: {addEventListener(){}},
    MutationObserver: class {observe(){}}, setTimeout(){}, clearTimeout(){},
    getComputedStyle(){ return {}; },
    localStorage: {getItem(k){ return saved[k] || null; }, setItem(k, v){ saved[k] = v; }}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/validator.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'src/builder.workbench.js'), 'utf8'), sandbox);
  let renders = 0;
  sandbox.initWorkbenchBuilder({view: elements.docview, src: elements.src, render(){
    renders++;
    elements.msgs.innerHTML = '';
    const finding = element('li'); finding.textContent = 'existing validator warning';
    elements.msgs.appendChild(finding);
  }});
  return {elements, doc, element, saved, get renders(){ return renders; },
    click(id){ return elements[id].fire('click'); }};
}

test('Mermaid import UI opens focuses cancels and preserves editor and history on failure', () => {
  const h = importHarness(), e = h.elements;
  h.click('import-mermaid');
  assert.strictEqual(e.importbox.hidden, false);
  assert.strictEqual(h.doc.activeElement, e['import-mermaid-text']);
  e['import-mermaid-text'].value = 'sequenceDiagram\nA-xB: <bad>';
  h.click('import-mermaid-convert');
  assert.strictEqual(e.src.value, TEXT);
  assert.strictEqual(h.renders, 0);
  assert.strictEqual(e['undo-builder'].disabled, true);
  assert.strictEqual(e.importbox.hidden, false);
  assert.strictEqual(e.msgs.children.length, 1);
  assert.strictEqual(e.msgs.children[0].className, 'e');
  assert.match(e.msgs.children[0].textContent, /line 2: unsupported syntax.*<bad>/);
  h.click('import-mermaid-cancel');
  assert.strictEqual(e.importbox.hidden, true);
  assert.strictEqual(h.doc.activeElement, e['import-mermaid']);
  assert.strictEqual(e.src.value, TEXT);
});

test('Mermaid import UI renders pretty JSON appends one todo warning and supports undo redo and Ctrl-Z', () => {
  const h = importHarness(), e = h.elements;
  const input = MERMAID_SEQ + 'Note over A: one\nopt two\nA->>B: skipped\nend';
  h.click('import-mermaid');
  e['import-mermaid-text'].value = input;
  h.click('import-mermaid-convert');
  const imported = JSON.stringify(B.mermaidToSpec(input), null, 2);
  assert.strictEqual(e.src.value, imported);
  assert.strictEqual(h.renders, 1);
  assert.strictEqual(e.importbox.hidden, true);
  assert.strictEqual(e.msgs.children.length, 2);
  assert.strictEqual(e.msgs.children[0].textContent, 'existing validator warning');
  assert.match(e.msgs.children[1].textContent, /warn 2 todo\(s\) added/);
  assert.strictEqual(JSON.parse(h.saved['dv-workbench-draft']).text, imported);
  h.click('undo-builder');
  assert.strictEqual(e.src.value, TEXT);
  h.click('redo-builder');
  assert.strictEqual(e.src.value, imported);
  e.src.focus();
  const key = e.src.fire('keydown', {key: 'z', ctrlKey: true});
  assert.strictEqual(key.defaultPrevented, true);
  assert.strictEqual(e.src.value, TEXT);
  assert.strictEqual(h.renders, 4);
});

test('Mermaid import UI leaves native text undo alone and adds no warning without todos', () => {
  const h = importHarness(), e = h.elements;
  h.click('import-mermaid');
  e['import-mermaid-text'].value = MERMAID_SEQ;
  h.click('import-mermaid-convert');
  assert.strictEqual(e.msgs.children.length, 1);
  e.src.focus();
  e.src.value += ' ';
  e.src.fire('input');
  const key = e.src.fire('keydown', {key: 'z', metaKey: true});
  assert.ok(!key.defaultPrevented);
  assert.strictEqual(h.renders, 1);
});

test('Mermaid import UI blocks opening and conversion while ADD TO STEP is armed', () => {
  const h = importHarness(), e = h.elements;
  h.click('import-mermaid');
  e['import-mermaid-text'].value = MERMAID_SEQ;
  const section = h.element(); section.className = 'doc-sec'; section.setAttribute('data-dv-section', '0');
  const coin = h.element(); coin.setAttribute('data-dv-step', '0');
  e.docview.appendChild(section); section.appendChild(coin);
  coin.fire('click');
  const arm = e.guide.querySelectorAll('button').find(b => b.textContent === 'ADD TO STEP');
  assert.ok(arm, 'the real step inspector exposes the mode');
  arm.fire('click');
  assert.match(e.btarget.textContent, /add to step 1/);
  assert.strictEqual(h.click('import-mermaid-convert').defaultPrevented, true);
  assert.strictEqual(e.src.value, TEXT);
  assert.strictEqual(h.renders, 0);
  h.click('import-mermaid-cancel');
  assert.strictEqual(e.importbox.hidden, true);
  assert.strictEqual(h.click('import-mermaid').defaultPrevented, true);
  assert.strictEqual(e.importbox.hidden, true);
  e.src.fire('keydown', {key: 'Escape'});
  h.click('import-mermaid');
  assert.strictEqual(e.importbox.hidden, false);
  h.click('import-mermaid-convert');
  assert.strictEqual(h.renders, 1);
});

test('generated workbench validates imported skeletons and retains expected authoring lint', () => {
  const html = fs.readFileSync(path.join(ROOT, 'workbench/flowspec.html'), 'utf8');
  const sandbox = {console};
  vm.runInNewContext(html.slice(html.indexOf('/* ---- src/validator.js ---- */'),
    html.indexOf('/* ---- src/boot.workbench.js ---- */')), sandbox);
  const hld = fs.readFileSync(path.join(ROOT, 'examples/cumulus/cumulus-hld.md'), 'utf8');
  const page = sandbox.normalize(sandbox.mermaidToSpec(hld));
  assert.deepStrictEqual(plain(sandbox.validate(page)), {errors: [], warnings: []});
  const lint = sandbox.lintPage(page);
  assert.strictEqual(lint.filter(w => w.includes('longer than its edge can carry')).length, 2);
  assert.strictEqual(lint.filter(w => w.includes('shares first edge')).length, 2);
  assert.strictEqual(lint.length, 4);
  const simple = sandbox.normalize(sandbox.mermaidToSpec(MERMAID_SEQ));
  assert.deepStrictEqual(plain(sandbox.validate(simple)), {errors: [], warnings: []});
});

/* ================= baseline diff ================= */
function diffFixture(){
  return {page: {title: 'T', skin: 'aurora', blocks: [{heading: 'H', diagram: {
    nodes: {a: {title: 'A'}, b: {title: 'B'}}, rows: [['a', 'b']],
    edges: [{from: 'a', to: 'b', kind: 'int', label: 'call'}],
    steps: [{text: 'first'}], panels: [{id: 'p', type: 'state', title: 'Status'}]
  }, contract: {fields: [{k: 'version', v: '1'}]}}]}};
}

test('diffSpecs identical specs are empty and comparisons do not mutate inputs', () => {
  const spec = diffFixture(), before = JSON.stringify(spec);
  assert.deepStrictEqual(plain(B.diffSpecs(spec, plain(spec))), []);
  assert.strictEqual(JSON.stringify(spec), before);
});

test('diffSpecs reports exactly node added, edge removed, step text and contract v changes', () => {
  const old = diffFixture(), next = plain(old), section = next.page.blocks[0];
  section.diagram.nodes.c = {title: 'C'};
  section.diagram.edges = [];
  section.diagram.steps[0].text = 'next';
  section.contract.fields[0].v = '2';
  assert.deepStrictEqual(plain(B.diffSpecs(old, next)), [
    {path: 'page.blocks[0].diagram.nodes.c', kind: 'added', text: 'H: node c added'},
    {path: 'page.blocks[0].diagram.edges', kind: 'removed', text: 'H: edge a->b(int) removed'},
    {path: 'page.blocks[0].diagram.steps[0].text', kind: 'changed', text: 'H: step 1 text changed'},
    {path: 'page.blocks[0].contract.fields[0].v', kind: 'changed', text: 'H: contract field version v changed'}
  ]);
});

test('diffSpecs pairs sections by heading and orders added and removed sections around survivors', () => {
  const old = {sections: [{heading: 'Gone'}, {heading: 'Kept'}]};
  const next = {sections: [{heading: 'Kept'}, {heading: 'New'}]};
  assert.deepStrictEqual(plain(B.diffSpecs(old, next)), [
    {path: 'sections', kind: 'removed', text: 'section Gone removed'},
    {path: 'sections[1]', kind: 'added', text: 'section New added'}
  ]);
  assert.deepStrictEqual(plain(B.diffSpecs(old, {sections: [...old.sections].reverse()})), []);
});

test('diffSpecs is deterministic with repeated headings, reordered nodes, and parallel edges', () => {
  const old = diffFixture(), next = plain(old);
  old.page.blocks.push({heading: 'H', diagram: {nodes: {z: {title: 'Z'}}, rows: [['z']]}});
  next.page.blocks.unshift(plain(old.page.blocks[1]));
  next.page.blocks[1].diagram.nodes = {b: {title: 'updated'}, a: {title: 'also updated'}};
  const first = plain(B.diffSpecs(old, next));
  assert.deepStrictEqual(first, plain(B.diffSpecs(old, next)));
  assert.deepStrictEqual(first.map(f => f.path), [
    'page.blocks[1].diagram.nodes.b.title', 'page.blocks[1].diagram.nodes.a.title'
  ]);
  const before = {nodes: {}, rows: [], edges: [
    {from: 'a', to: 'b', kind: 'int', label: 'one'}, {from: 'a', to: 'b', kind: 'mqtt', label: 'two'}
  ]};
  const after = plain(before); after.edges.reverse();
  assert.deepStrictEqual(plain(B.diffSpecs(before, after)), []);
  after.edges[1].kind = 'https';
  assert.deepStrictEqual(plain(B.diffSpecs(before, after)), [
    {path: 'edges[1].kind', kind: 'changed', text: 'section 1: edge a->b(https) kind changed'}
  ]);
});

test('diffSpecs covers page, node, edge, step count, panel, field, and tab changes in document order', () => {
  const old = diffFixture(), next = plain(old), s = next.page.blocks[0], d = s.diagram;
  next.page.title = 'New'; next.page.skin = 'daylight';
  Object.assign(d.nodes.a, {title: 'AA', sub: 'sub', icon: 'db', tint: 'data'});
  delete d.nodes.b;
  d.edges[0].label = 'new'; d.edges.push({from: 'b', to: 'a'});
  d.steps.push({text: 'second'});
  Object.assign(d.panels[0], {title: 'New status', type: 'log'});
  d.panels.push({id: 'q'});
  s.contract.fields = [{k: 'new', v: '3'}];
  old.page.blocks.push({tabs: [{label: 'old', sections: []}]});
  next.page.blocks.push({tabs: [{label: 'new', sections: []}]});
  const findings = plain(B.diffSpecs(old, next));
  assert.deepStrictEqual(findings.map(f => [f.kind, f.path]), [
    ['changed', 'page.title'], ['changed', 'page.skin'],
    ...['title', 'sub', 'icon', 'tint'].map(k => ['changed', 'page.blocks[0].diagram.nodes.a.' + k]),
    ['removed', 'page.blocks[0].diagram.nodes'],
    ['changed', 'page.blocks[0].diagram.edges[0].label'], ['added', 'page.blocks[0].diagram.edges[1]'],
    ['changed', 'page.blocks[0].diagram.steps'],
    ['changed', 'page.blocks[0].diagram.panels[0].type'], ['changed', 'page.blocks[0].diagram.panels[0].title'],
    ['added', 'page.blocks[0].diagram.panels[1]'],
    ['added', 'page.blocks[0].contract.fields[0]'], ['removed', 'page.blocks[0].contract.fields'],
    ['added', 'page.blocks[1].tabs[0].label'], ['removed', 'page.blocks[1].tabs']
  ]);
  const text = JSON.stringify(next, null, 2);
  for (const f of findings){
    const loc = B.findingLocation(text, next, f.text, B.parseValidationPath(f.path + ':'));
    assert.ok(loc && loc.exact, f.path);
  }
  assert.strictEqual(B.diffSpecs(next, old).filter(f => /panel q removed/.test(f.text)).length, 1);
});

test('diffSpecs paths reuse findingLocation for quoted ids, bare diagrams, and missing containers', () => {
  const id = 'svc.api [0]: "quoted" \\';
  const old = {nodes: {[id]: {title: 'Old'}}, rows: [[id]]};
  const next = plain(old); next.nodes[id].title = 'New';
  const f = B.diffSpecs(old, next)[0], text = JSON.stringify(next, null, 2);
  const tokens = B.parseValidationPath(f.path + ': ' + f.text);
  assert.deepStrictEqual(plain(tokens), ['nodes', id, 'title']);
  const loc = B.findingLocation(text, next, f.text, tokens);
  assert.ok(loc.exact);
  assert.strictEqual(JSON.parse(text.slice(loc.start, loc.end)), 'New');
  for (const value of [null, 42, [], {}, {page: {blocks: 'invalid'}}, {sections: [null]}]){
    for (const f of B.diffSpecs(diffFixture(), value)){
      assert.ok(B.findingLocation(JSON.stringify(value), value, f.text, B.parseValidationPath(f.path + ':')));
    }
  }
});

test('diffSpecTexts reports only the first unparseable side and otherwise returns findings', () => {
  assert.deepStrictEqual(plain(B.diffSpecTexts('{', '{}')), {error: 'baseline JSON is unparseable'});
  assert.deepStrictEqual(plain(B.diffSpecTexts('{}', '{')), {error: 'current JSON is unparseable'});
  assert.deepStrictEqual(plain(B.diffSpecTexts('{', '{')), {error: 'baseline JSON is unparseable'});
  assert.deepStrictEqual(plain(B.diffSpecTexts('{}', '{}')), {findings: []});
});

function diffWorkbench(storage = new Map(), options = {}){
  const listeners = new Map(), timers = new Map();
  let timerId = 0, observer;
  function element(tag = 'div'){
    const events = new Map();
    return {tagName: tag.toUpperCase(), hidden: true, children: [], style: {}, attributes: {},
      value: '', clientWidth: 440, clientHeight: 300,
      classList: {add(){}, remove(){}, toggle(){}},
      addEventListener(type, fn){ if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
      fire(type, event = {}){ for (const fn of events.get(type) || []) fn.call(this, event); },
      click(){ this.fire('click', {target: this}); },
      appendChild(child){ this.children.push(child); return child; },
      set innerHTML(value){ this.children = []; },
      setAttribute(k, v){ this.attributes[k] = v; }, getAttribute(k){ return this.attributes[k]; },
      querySelector(){ return null; }, querySelectorAll(){ return []; },
      focus(){ document.activeElement = this; }, remove(){}, closest(){ return null; },
      setSelectionRange(start, end){ this.selectionStart = start; this.selectionEnd = end; }
    };
  }
  const ids = Object.fromEntries(['src', 'diffbox', 'spec-diff', 'draftbar', 'guide', 'go',
    'file-input', 'file-open', 'file-save', 'undo-builder', 'redo-builder'].map(id => [id, element()]));
  const document = {body: element(), activeElement: null,
    getElementById(id){ return ids[id] || null; }, querySelector(){ return null; },
    createElement: element, createTextNode: text => ({textContent: text}),
    addEventListener(type, fn, capture){
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({fn, capture});
    }
  };
  const sandbox = {console, document, window: {addEventListener(){}}, Blob,
    URL: {createObjectURL(){ return 'blob:test'; }, revokeObjectURL(){}},
    getComputedStyle(){ return {}; },
    setTimeout(fn){ timers.set(++timerId, fn); return timerId; }, clearTimeout(id){ timers.delete(id); },
    MutationObserver: class {constructor(fn){ observer = fn; } observe(){}},
    FileReader: class {readAsText(file){ this.result = file.text; this.onload(); }},
    localStorage: {
      getItem(k){ if (options.storageThrows) throw Error('blocked'); return storage.get(k) || null; },
      setItem(k, v){ if (options.storageThrows) throw Error('blocked'); storage.set(k, v); },
      removeItem(k){ if (options.storageThrows) throw Error('blocked'); storage.delete(k); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/builder.workbench.js'), 'utf8'), sandbox);
  ids.src.value = JSON.stringify(diffFixture());
  sandbox.initWorkbenchBuilder({view: element(), src: ids.src, render(){ observer(); }});
  return {ids, storage, sandbox,
    lines(){ return ids.diffbox.children.map(c => c.textContent); },
    diff(){ ids['spec-diff'].click(); return this.lines(); },
    flush(){ const fns = [...timers.values()]; timers.clear(); fns.forEach(fn => fn()); },
    key(key){ for (const {fn} of listeners.get('keydown') || []) fn({key}); },
    render(){ observer(); }
  };
}

test('diff UI toggles, selects JSON, and hides on Escape, input, and render attempts', () => {
  const w = diffWorkbench(), src = w.ids.src;
  assert.deepStrictEqual(w.diff(), ['no changes']);
  w.diff(); assert.ok(w.ids.diffbox.hidden);
  const spec = JSON.parse(src.value); spec.page.title = 'Changed'; src.value = JSON.stringify(spec);
  assert.deepStrictEqual(w.diff(), ['page title changed']);
  w.ids.diffbox.children[0].click();
  assert.strictEqual(JSON.parse(src.value.slice(src.selectionStart, src.selectionEnd)), 'Changed');
  w.key('Escape'); assert.ok(w.ids.diffbox.hidden);
  assert.strictEqual(w.ids['spec-diff'].attributes['aria-expanded'], 'false');
  w.diff(); src.fire('input'); assert.ok(w.ids.diffbox.hidden);
  src.value = '{';
  assert.deepStrictEqual(w.diff(), ['current JSON is unparseable']);
  w.ids.go.click(); assert.ok(w.ids.diffbox.hidden);
  w.diff(); w.render(); assert.ok(w.ids.diffbox.hidden);
});

test('baseline survives autosave and recovery, and open/save reset it without breaking undo', () => {
  const w = diffWorkbench(), next = diffFixture(); next.page.title = 'Draft';
  w.ids.src.value = JSON.stringify(next); w.ids.src.fire('input'); w.flush();
  const recovered = diffWorkbench(w.storage);
  assert.ok(!recovered.ids.draftbar.hidden);
  recovered.ids.draftbar.children[1].click();
  assert.deepStrictEqual(recovered.diff(), ['page title changed']);
  recovered.ids['file-save'].click();
  assert.deepStrictEqual(recovered.diff(), ['no changes']);
  assert.strictEqual(JSON.parse(w.storage.get('dv-workbench-baseline')).text, JSON.stringify(next));
  const file = plain(next); file.page.skin = 'daylight';
  recovered.ids['file-input'].files = [{text: JSON.stringify(file)}];
  recovered.ids['file-input'].fire('change');
  assert.deepStrictEqual(recovered.diff(), ['no changes']);
  recovered.ids['undo-builder'].click();
  assert.deepStrictEqual(recovered.diff(), ['page skin changed']);
  const reload = diffWorkbench(w.storage);
  reload.ids.draftbar.children[1].click();
  assert.deepStrictEqual(reload.diff(), ['page skin changed']);
});

test('legacy draft recovery falls back visibly, discard keeps demo baseline, and unavailable storage is safe', () => {
  const spec = diffFixture(); spec.page.title = 'Legacy';
  const storage = new Map([['dv-workbench-draft', JSON.stringify({text: JSON.stringify(spec), at: 1})]]);
  const legacy = diffWorkbench(storage);
  legacy.ids.draftbar.children[1].click();
  assert.match(legacy.ids.guide.children[0].textContent, /original baseline unavailable/);
  assert.deepStrictEqual(legacy.diff(), ['no changes']);
  const discard = diffWorkbench(storage);
  discard.ids.draftbar.children[2].click();
  assert.deepStrictEqual(discard.diff(), ['no changes']);
  assert.strictEqual(JSON.parse(storage.get('dv-workbench-baseline')).text, discard.ids.src.value);
  const blocked = diffWorkbench(new Map(), {storageThrows: true});
  assert.deepStrictEqual(blocked.diff(), ['no changes']);
  blocked.ids.src.fire('input'); blocked.flush();
  blocked.ids['file-save'].click();
});

test('removed sections stay in their tab list across reordered tabs and page aliases', () => {
  const old = {page: {blocks: [{tabs: [
    {label: 'A', sections: [{heading: 'Gone'}]},
    {label: 'B', sections: [{heading: 'Kept', diagram: {nodes: {a: {title: 'A'}}, rows: [['a']]}}]}
  ]}]}};
  const next = {sections: plain(old.page.blocks)};
  next.sections[0].tabs[0].sections = [];
  next.sections[0].tabs[1].sections[0].diagram.nodes.a.title = 'New';
  let findings = plain(B.diffSpecs(old, next));
  assert.strictEqual(findings[0].text, 'section Gone removed');
  assert.strictEqual(findings[0].path, 'sections[0].tabs[0].sections');
  next.sections[0].tabs.reverse();
  findings = plain(B.diffSpecs(old, next));
  assert.strictEqual(findings[1].text, 'section Gone removed');
  assert.strictEqual(findings[1].path, 'sections[0].tabs[1].sections');
});

test('saved invalid JSON reports an unparseable baseline and mismatched storage falls back safely', () => {
  const w = diffWorkbench();
  w.ids.src.value = '{'; w.ids['file-save'].click();
  assert.deepStrictEqual(w.diff(), ['baseline JSON is unparseable']);
  w.ids.src.value = JSON.stringify(diffFixture()); w.ids.src.fire('input');
  assert.deepStrictEqual(w.diff(), ['baseline JSON is unparseable']);
  const storage = new Map([
    ['dv-workbench-draft', JSON.stringify({text: '{', at: 1})],
    ['dv-workbench-baseline', JSON.stringify({text: '{}', draftText: 'different draft'})]
  ]);
  const recovery = diffWorkbench(storage);
  recovery.ids.draftbar.children[1].click();
  assert.match(recovery.ids.guide.children[0].textContent, /original baseline unavailable/);
});

test('diffSpecs sees edits outside any whitelist: node link, panel initial, contract hot, step panels, edge ret', () => {
  const base = {page: {title: 'T', blocks: [{heading: 'S',
    contract: {fields: [{k: 'topic', v: 'a/b', hot: true}]},
    diagram: {
      nodes: {n1: {title: 'N', link: 'https://a'}, n2: {title: 'M'}},
      rows: [['n1', 'n2']],
      edges: [{from: 'n1', to: 'n2', kind: 'int', ret: false}],
      panels: [{id: 'p1', type: 'gauge', initial: {value: 1}}],
      steps: [{edge: 'n1->n2', text: 't', panels: {p1: {value: 2}}}]
    }}]}};
  const next = JSON.parse(JSON.stringify(base));
  next.page.blocks[0].diagram.nodes.n1.link = 'https://b';
  next.page.blocks[0].diagram.panels[0].initial = {value: 9};
  next.page.blocks[0].contract.fields[0].hot = false;
  next.page.blocks[0].diagram.steps[0].panels = {p1: {value: 3}};
  next.page.blocks[0].diagram.edges[0].ret = true;
  const found = plain(B.diffSpecs(base, next));
  assert.deepStrictEqual(found.map(f => f.text).sort(), [
    'S: contract field topic hot changed',
    'S: edge n1->n2(int) ret changed',
    'S: node n1 link changed',
    'S: panel p1 initial changed',
    'S: step 1 panels changed'
  ]);
  for (const f of found) assert.strictEqual(f.kind, 'changed');
  /* identical specs still yield nothing under the all-keys comparison */
  assert.deepStrictEqual(plain(B.diffSpecs(base, JSON.parse(JSON.stringify(base)))), []);
});

/* ---------------- multi-select: bulk planners ---------------- */

function bulkSpec(){
  return {page: {blocks: [{heading: 'S',
    bullets: ['first point', 'second point'],
    contract: {fields: [{k: 'topic', v: 'a/b'}, {k: 'ttl', v: '30s'}]},
    diagram: {
      nodes: {a: {title: 'A'}, b: {title: 'B', tint: 'dev'}, c: {title: 'C'}},
      rows: [['a', 'b', 'c']],
      edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c', kind: 'mqtt'}],
      panels: [{id: 'q', type: 'queue', initial: {state: 'empty'}}],
      steps: [{edge: 'a->b', text: 's1'}, {edge: 'b->c', text: 's2'}, {nodes: ['c'], text: 's3'}]
    }}]}};
}

test('planBulkSetField writes the same field to every target and reports the failing item', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  const targets = [
    {section: 0, kind: 'node', id: 'a'},
    {section: 0, kind: 'node', id: 'c'}
  ];
  const plan = B.planBulkSetField(text, targets, 'tint', '"mqtt"');
  const nodes = JSON.parse(plan.text).page.blocks[0].diagram.nodes;
  assert.strictEqual(nodes.a.tint, 'mqtt');
  assert.strictEqual(nodes.c.tint, 'mqtt');
  assert.strictEqual(nodes.b.tint, 'dev', 'unselected node untouched');
  assert.strictEqual(plan.count, 2);
  /* null removes from all */
  const cleared = B.planBulkSetField(plan.text, targets, 'tint', null);
  const n2 = JSON.parse(cleared.text).page.blocks[0].diagram.nodes;
  assert.ok(!('tint' in n2.a) && !('tint' in n2.c));
  /* an unresolvable target names its position */
  /* a missing node maps to a path but fails the locate — either way the
     error names WHICH selection broke */
  const bad = B.planBulkSetField(text, [targets[0], {section: 0, kind: 'node', id: 'ghost'}], 'tint', '"dev"');
  assert.match(bad.error, /selection 2/);
});

test('planBulkDelete removes index targets highest-first so nothing shifts', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  /* deliberately pass ASCENDING order — the planner must sort descending */
  const plan = B.planBulkDelete(text, [
    {section: 0, kind: 'step', index: 0},
    {section: 0, kind: 'step', index: 2}
  ]);
  const steps = JSON.parse(plan.text).page.blocks[0].diagram.steps;
  assert.deepStrictEqual(steps.map(s => s.text), ['s2'], 'exactly steps 1 and 3 died');
  assert.strictEqual(plan.count, 2);
});

test('planBulkDelete of nodes runs each cascade (rows and steps pruned)', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  const plan = B.planBulkDelete(text, [
    {section: 0, kind: 'node', id: 'a'},
    {section: 0, kind: 'node', id: 'c'}
  ]);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(Object.keys(d.nodes), ['b']);
  assert.deepStrictEqual(plain(d.rows), [['b']]);
  const mentions = JSON.stringify(d);
  assert.ok(mentions.indexOf('"a->b"') < 0 && mentions.indexOf('"b->c"') < 0,
    'edges/steps touching deleted nodes are pruned by the cascades');
});

test('builderDeletePlan deletes the right element for every multi kind', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  assert.deepStrictEqual(plain(B.BUILDER_MULTI_KINDS),
    ['node', 'edge', 'step', 'panel', 'bullet', 'crow']);

  const node = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'node', id: 'c'}).text);
  assert.deepStrictEqual(Object.keys(node.page.blocks[0].diagram.nodes), ['a', 'b']);

  const edge = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'edge', index: 1}).text);
  assert.deepStrictEqual(edge.page.blocks[0].diagram.edges, [{from: 'a', to: 'b'}]);

  const step = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'step', index: 1}).text);
  assert.deepStrictEqual(step.page.blocks[0].diagram.steps.map(s => s.text), ['s1', 's3']);

  const panel = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'panel', index: 0}).text);
  assert.ok(!panel.page.blocks[0].diagram.panels || panel.page.blocks[0].diagram.panels.length === 0);

  const bullet = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'bullet', index: 0}).text);
  assert.deepStrictEqual(plain(bullet.page.blocks[0].bullets), ['second point']);

  const crow = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'crow', index: 1}).text);
  assert.deepStrictEqual(plain(crow.page.blocks[0].contract.fields), [{k: 'topic', v: 'a/b'}]);
});

/* ---- builderPositionLine: the "step 2 of 3" inspector ordinal ---- */

test('builderPositionLine: step/section/tab ordinals, null off the ends', () => {
  const spec = {page: {blocks: [
    {heading: 'A', diagram: {nodes: {x: {}}, rows: [['x']],
      steps: [{text: '1'}, {text: '2'}, {text: '3'}]}},
    {tabs: [{label: 'T1', sections: [{heading: 'B'}]},
            {label: 'T2', sections: [{heading: 'C'}]}]}
  ]}};
  assert.equal(B.builderPositionLine(spec, {kind: 'step', section: 0, index: 1}), 'step 2 of 3');
  assert.equal(B.builderPositionLine(spec, {kind: 'step', section: 0, index: 9}), null);
  assert.equal(B.builderPositionLine(spec, {kind: 'section', section: 0}), 'section 1 of 3');
  assert.equal(B.builderPositionLine(spec, {kind: 'section', section: 2}), 'section 3 of 3');
  assert.equal(B.builderPositionLine(spec, {kind: 'section', section: 3}), null);
  assert.equal(B.builderPositionLine(spec, {kind: 'tab', block: 1, tab: 0}), 'tab 1 of 2');
  assert.equal(B.builderPositionLine(spec, {kind: 'tab', block: 0, tab: 0}), null);
  assert.equal(B.builderPositionLine(spec, {kind: 'node', section: 0, id: 'x'}), null);
  assert.equal(B.builderPositionLine(spec, null), null);
});

test('builderPositionLine: bare-diagram and bare-page spec shapes', () => {
  const bare = {nodes: {x: {}}, rows: [['x']], steps: [{text: '1'}]};
  assert.equal(B.builderPositionLine(bare, {kind: 'step', section: 0, index: 0}), 'step 1 of 1');
  const barePage = {sections: [{heading: 'A'}, {heading: 'B'}]};
  assert.equal(B.builderPositionLine(barePage, {kind: 'section', section: 1}), 'section 2 of 2');
});

/* ---- planAddTabs: the "+ tabs" insert ---- */

test('planAddTabs appends a two-tab container and reports its landing spot', () => {
  const spec = {page: {blocks: [{heading: 'A', text: ['x']}]}};
  const text = JSON.stringify(spec, null, 2);
  const plan = B.planAddTabs(text, spec);
  assert.ok(!plan.error);
  assert.equal(plan.kind, 'tabs');
  assert.equal(plan.block, 1);
  assert.equal(plan.index, 1); /* first new section's flat ordinal */
  const after = JSON.parse(plan.text);
  const block = after.page.blocks[1];
  assert.equal(block.tabs.length, 2);
  assert.deepStrictEqual(block.tabs.map(t => t.label), ['Tab one', 'Tab two']);
  block.tabs.forEach(t => {
    assert.equal(t.sections.length, 1);
    assert.ok(t.sections[0].diagram);
  });
  /* both new tab sections are addressable */
  assert.equal(B.specSectionPaths(after).length, 3);
});

test('planAddTabs handles bare-page specs and refuses bare diagrams', () => {
  const barePage = {sections: [{heading: 'A'}]};
  const plan = B.planAddTabs(JSON.stringify(barePage, null, 2), barePage);
  assert.ok(!plan.error);
  const after = JSON.parse(plan.text);
  assert.equal(after.sections[1].tabs.length, 2);

  const bare = {nodes: {x: {}}, rows: [['x']]};
  assert.match(B.planAddTabs(JSON.stringify(bare), bare).error, /bare diagram/);
  assert.match(B.planAddTabs('null', null).error, /no page/);
});

test('planAddTabs after an existing tabs container: block vs flat-ordinal math', () => {
  /* blocks: [plain, tabs(2 tabs x 1 section), plain] = 4 flat sections */
  const spec = {page: {blocks: [
    {heading: 'A'},
    {tabs: [{label: 'T1', sections: [{heading: 'B'}]},
            {label: 'T2', sections: [{heading: 'C'}]}]},
    {heading: 'D'}
  ]}};
  const plan = B.planAddTabs(JSON.stringify(spec, null, 2), spec);
  assert.ok(!plan.error);
  assert.equal(plan.block, 3);  /* list slot among blocks */
  assert.equal(plan.index, 4);  /* flat section ordinal of the first new tab section */
  const after = JSON.parse(plan.text);
  assert.equal(after.page.blocks.length, 4);
  assert.equal(B.specSectionPaths(after).length, 6);
});
