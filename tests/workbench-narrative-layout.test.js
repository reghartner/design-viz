'use strict';
const test = require('node:test');
const assert = require('node:assert');
const commandContext = require('./workbench-command-context.cjs');
const B = commandContext(['graph', 'narrative', 'layout']);
const V = B;
const plain = value => JSON.parse(JSON.stringify(value));

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

function groupMoveFixture(rows, members = ['a', 'b']){
  const nodes = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'u'].map(id =>
    [id, members.includes(id) ? {group: 'g'} : {}]));
  return {nodes, rows, floats: [{id: 'f', x: 30, y: 40}], groups: {g: {title: 'Group'}},
    edges: [{from: 'a', to: 'c'}], steps: [{nodes: ['a', 'b'], text: 'Keep me'}]};
}

function movedGroupRows(spec, drop){
  const before = JSON.stringify(spec), plan = B.planMoveGroup(before, spec, 0, 'g', drop);
  assert.ok(!plan.error, plan.error);
  assert.equal(JSON.stringify(spec), before, 'the input remains immutable');
  const next = JSON.parse(plan.text);
  assert.deepStrictEqual({...next, rows: spec.rows}, spec, 'only rows changes');
  return next.rows;
}

function nodePlacementFixture(rows = [['a', 'b'], ['c', 'd']]){
  return {nodes: {a: {title: 'A'}, b: {}, c: {}, d: {}, e: {}, f: {}, u: {}}, rows,
    floats: [{id: 'f', side: 'above', dx: 12, dy: -8}],
    edges: [{from: 'a', to: 'f'}], steps: [{nodes: ['a', 'f'], text: 'Keep me'}]};
}

function changedNodePlacement(spec, planner, id, destination){
  const before = JSON.stringify(spec), plan = planner(before, spec, 0, id, destination);
  assert.ok(!plan.error, plan.error);
  assert.equal(JSON.stringify(spec), before, 'input remains immutable');
  const next = JSON.parse(plan.text);
  assert.deepStrictEqual({...next, rows: spec.rows, floats: spec.floats}, spec,
    'node definitions, edges, steps and other metadata keep their identities');
  assert.ok(next.rows.length, 'rows never becomes empty');
  return next;
}

function movedNode(rows, id, drop){
  return changedNodePlacement(nodePlacementFixture(rows), B.planMoveNode, id, drop).rows;
}

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

test('planMoveRow moves a row and preserves nested stacks', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}, c: {}, d: {}},
    rows: [['a'], ['b', ['c', 'd']], ['b']]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  const down = B.planMoveRow(text, spec, 0, 0, 2);
  assert.ok(!down.error);
  assert.equal(down.index, 2);
  assert.deepStrictEqual(JSON.parse(down.text).page.blocks[0].diagram.rows,
    [['b', ['c', 'd']], ['b'], ['a']]);
  const up = B.planMoveRow(text, spec, 0, 2, 0);
  assert.deepStrictEqual(JSON.parse(up.text).page.blocks[0].diagram.rows,
    [['b'], ['a'], ['b', ['c', 'd']]]);
});

test('planMoveRow refuses bad indices and no-op moves', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}}, rows: [['a'], ['b']]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  assert.match(B.planMoveRow(text, spec, 0, 5, 0).error, /row not found/);
  assert.match(B.planMoveRow(text, spec, 0, 0, 2).error, /no row slot/);
  assert.match(B.planMoveRow(text, spec, 0, 1, 1).error, /already there/);
  assert.ok(B.planMoveRow(text, spec, 9, 0, 1).error); /* no such section */
});

test('group slot geometry follows left-to-right order, including unequal stack widths and single slots', () => {
  const boxes = [{x1: 20, x2: 100}, {x1: 200, x2: 350}, {x1: 400, x2: 480}];
  assert.deepStrictEqual(plain(B.builderSlotGapXs(boxes)), [12, 150, 375, 488]);
  assert.deepStrictEqual(plain(B.builderSlotGapXs([boxes[0]])), [12, 108]);
  assert.deepStrictEqual(plain(B.builderSlotGapXs([])), []);
});

test('planMoveGroup converts pre-removal slots within a row and clamps the result', () => {
  const spec = groupMoveFixture([['c', 'a', 'b', 'd', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 0, slot: 0}), [['a', 'b', 'c', 'd', 'e']]);
  // slot 4 is the visual gap between d and e; the two lifted slots before it no longer count
  assert.deepStrictEqual(movedGroupRows(spec, {row: 0, slot: 4}), [['c', 'd', 'a', 'b', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 0, slot: 99}), [['c', 'd', 'e', 'a', 'b']]);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 0, slot: -5}), [['a', 'b', 'c', 'd', 'e']]);
  // gaps inside or immediately after the contiguous run land it back where it was
  for (const slot of [1, 2, 3])
    assert.equal(B.planMoveGroup(JSON.stringify(spec), spec, 0, 'g', {row: 0, slot}).error, 'already there');
});

test('planMoveGroup gathers a non-contiguous group and can land it at a gap between its own members', () => {
  const spec = groupMoveFixture([['a', 'b', 'c', 'd']], ['a', 'b', 'd']);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 0, slot: 1}), [['a', 'b', 'd', 'c']]);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 0, slot: 3}), [['c', 'a', 'b', 'd']]);
});

test('planMoveGroup inserts into the original target row even when earlier rows disappear', () => {
  const spec = groupMoveFixture([['a'], ['c', 'b'], ['d', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 2, slot: 1}), [['c'], ['d', 'a', 'b', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 1, slot: 1}), [['c', 'a', 'b'], ['d', 'e']]);
});

test('planMoveGroup creates rows at gaps, accounting for every emptied row above the gap', () => {
  const spec = groupMoveFixture([['a'], ['c'], ['b'], ['d', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {gap: 0}), [['a', 'b'], ['c'], ['d', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {gap: 3}), [['c'], ['a', 'b'], ['d', 'e']]);
  assert.deepStrictEqual(movedGroupRows(spec, {gap: 4}), [['c'], ['d', 'e'], ['a', 'b']]);
  assert.deepStrictEqual(movedGroupRows(groupMoveFixture([['c', 'a'], ['d', 'b']]), {gap: 1}),
    [['c'], ['a', 'b'], ['d']]);
});

test('planMoveGroup preserves whole stacks and extracts partial stacks as ordered single slots', () => {
  assert.deepStrictEqual(movedGroupRows(groupMoveFixture([[['b', 'a']], ['c', 'd']]), {row: 1, slot: 1}),
    [['c', ['b', 'a'], 'd']]);
  assert.deepStrictEqual(movedGroupRows(groupMoveFixture([[['b', 'c', 'a']], ['d']]), {gap: 2}),
    [['c'], ['d'], ['b', 'a']]);
  assert.deepStrictEqual(movedGroupRows(groupMoveFixture([[['a', 'c', 'd', 'b']], ['e']]), {row: 1, slot: 0}),
    [[['c', 'd']], ['a', 'b', 'e']]);
  const mixed = groupMoveFixture([['b', ['c', 'a'], ['e']], ['d']], ['a', 'b', 'e', 'f', 'u']);
  assert.deepStrictEqual(movedGroupRows(mixed, {gap: 2}), [['c'], ['d'], ['b', 'a', ['e']]]);
});

test('planMoveGroup ignores floated and unplaced members but refuses absent or unplaced groups', () => {
  const spec = groupMoveFixture([['c', 'a'], ['d']], ['a', 'f', 'u']);
  assert.deepStrictEqual(movedGroupRows(spec, {row: 1, slot: 1}), [['c'], ['d', 'a']]);
  for (const members of [['f'], ['u'], ['f', 'u']]){
    const unplaced = groupMoveFixture([['c', 'd']], members);
    assert.equal(B.planMoveGroup(JSON.stringify(unplaced), unplaced, 0, 'g', {gap: 0}).error,
      'group "g" has no nodes placed in rows');
  }
  assert.match(B.planMoveGroup(JSON.stringify(spec), spec, 0, 'missing', {gap: 0}).error, /not found/);
});

test('planMoveGroup refuses unchanged layouts, dropped target rows and invalid destinations', () => {
  const spec = groupMoveFixture([['a', 'b'], ['c', 'd']]), text = JSON.stringify(spec);
  for (const drop of [{gap: 0}, {gap: 1}, {row: 0, slot: 99}])
    assert.equal(B.planMoveGroup(text, spec, 0, 'g', drop).error, 'already there');
  const within = groupMoveFixture([['c', 'a', 'b', 'd']]);
  assert.equal(B.planMoveGroup(JSON.stringify(within), within, 0, 'g', {row: 0, slot: 1}).error, 'already there');
  for (const drop of [null, {}, {gap: -1}, {gap: 3}, {gap: 0.5}, {row: 9, slot: 0}, {row: 0, slot: NaN}])
    assert.ok(B.planMoveGroup(text, spec, 0, 'g', drop).error);
  assert.ok(B.planMoveGroup(text, spec, 99, 'g', {gap: 0}).error);
});

test('planMoveGroup rewrites only the rows slice in a nested section, preserving surrounding bytes', () => {
  const diagram = groupMoveFixture([['a', 'b'], ['c', 'd']]);
  const spec = {page: {blocks: [{heading: 'Other', diagram: {nodes: {x: {}}, rows: [['x']]}},
    {tabs: [{label: 'Tab', sections: [{heading: 'Move', diagram}]}]}]}};
  const text = JSON.stringify(spec, null, '\t') + '\n';
  const path = ['page', 'blocks', 1, 'tabs', 0, 'sections', 0, 'diagram', 'rows'];
  const oldRange = B.jsonLocate(text, path);
  const plan = B.planMoveGroup(text, spec, 1, 'g', {row: 1, slot: 1});
  assert.ok(!plan.error, plan.error);
  const newRange = B.jsonLocate(plan.text, path), next = JSON.parse(plan.text);
  assert.equal(plan.text.slice(0, newRange.start), text.slice(0, oldRange.start));
  assert.equal(plan.text.slice(newRange.end), text.slice(oldRange.end));
  next.page.blocks[1].tabs[0].sections[0].diagram.rows = diagram.rows;
  assert.deepStrictEqual(next, spec);
});

test('planMoveNode converts pre-removal slots and preserves the original target row', () => {
  assert.deepStrictEqual(movedNode([['a', 'b', 'c', 'd']], 'b', {row: 0, slot: 3}), [['a', 'c', 'b', 'd']]);
  assert.deepStrictEqual(movedNode([['a', 'b', 'c']], 'c', {row: 0, slot: 0}), [['c', 'a', 'b']]);
  assert.deepStrictEqual(movedNode([['a', 'b'], ['c', 'd']], 'a', {row: 1, slot: 1}), [['b'], ['c', 'a', 'd']]);
  assert.deepStrictEqual(movedNode([['a'], ['b'], ['c', 'd']], 'a', {row: 2, slot: 1}), [['b'], ['c', 'a', 'd']]);
});

test('planMoveNode makes new rows at pre-removal gaps and drops emptied rows', () => {
  assert.deepStrictEqual(movedNode([['a', 'b'], ['c']], 'a', {gap: 1}), [['b'], ['a'], ['c']]);
  assert.deepStrictEqual(movedNode([['a'], ['b'], ['c']], 'a', {gap: 3}), [['b'], ['c'], ['a']]);
  assert.deepStrictEqual(movedNode([['a'], ['b'], ['c']], 'c', {gap: 0}), [['c'], ['a'], ['b']]);
});

test('planMoveNode extracts strings from stacks and only counts fully lifted slots', () => {
  assert.deepStrictEqual(movedNode([[['a', 'b', 'c'], 'd']], 'a', {row: 0, slot: 1}), [[['b', 'c'], 'a', 'd']]);
  assert.deepStrictEqual(movedNode([[['a', 'b'], 'c']], 'a', {row: 0, slot: 1}), [['b', 'a', 'c']]);
  assert.deepStrictEqual(movedNode([[['a'], 'b', 'c']], 'a', {row: 0, slot: 2}), [['b', 'a', 'c']]);
  assert.deepStrictEqual(movedNode([[['a']], ['b']], 'a', {row: 1, slot: 1}), [['b', 'a']]);
  assert.deepStrictEqual(movedNode([[['a', 'b']], ['c']], 'a', {gap: 2}), [['b'], ['c'], ['a']]);
});

test('planMoveNode takes floats into slot gaps or new rows, removing empty floats arrays', () => {
  const spec = nodePlacementFixture();
  const inRow = changedNodePlacement(spec, B.planMoveNode, 'f', {row: 1, slot: 1});
  assert.deepStrictEqual(inRow.rows, [['a', 'b'], ['c', 'f', 'd']]);
  assert.ok(!Object.hasOwn(inRow, 'floats'));
  const newRow = changedNodePlacement(spec, B.planMoveNode, 'f', {gap: 0});
  assert.deepStrictEqual(newRow.rows, [['f'], ['a', 'b'], ['c', 'd']]);
  assert.ok(!Object.hasOwn(newRow, 'floats'));
  spec.floats.push({id: 'e', side: 'below', dx: -3, dy: 10});
  const withOther = changedNodePlacement(spec, B.planMoveNode, 'f', {gap: 2});
  assert.deepStrictEqual(withOther.rows, [['a', 'b'], ['c', 'd'], ['f']]);
  assert.deepStrictEqual(withOther.floats, [spec.floats[1]]);
});

test('planMoveNode refuses no-ops, unknown/unplaced nodes, and invalid destinations', () => {
  const spec = nodePlacementFixture([['a', 'b', 'c']]), text = JSON.stringify(spec);
  for (const slot of [1, 2]) assert.equal(B.planMoveNode(text, spec, 0, 'b', {row: 0, slot}).error, 'already there');
  const lone = nodePlacementFixture([['a'], ['b']]);
  for (const drop of [{gap: 0}, {gap: 1}, {row: 0, slot: 1}])
    assert.equal(B.planMoveNode(JSON.stringify(lone), lone, 0, 'a', drop).error, 'already there');
  for (const drop of [null, {}, {gap: -1}, {gap: 2}, {gap: 0.5}, {row: 2, slot: 0}, {row: 0, slot: NaN}])
    assert.ok(B.planMoveNode(text, spec, 0, 'a', drop).error);
  assert.match(B.planMoveNode(text, spec, 0, 'missing', {gap: 0}).error, /not found/);
  assert.match(B.planMoveNode(text, spec, 0, 'u', {gap: 0}).error, /no layout slot/);
  assert.ok(B.planMoveNode(text, spec, 99, 'a', {gap: 0}).error);
  assert.equal(JSON.stringify(spec), text);
});

test('planMoveNode preserves bytes outside rows/floats, including nested sections', () => {
  const diagram = nodePlacementFixture();
  diagram.floats.push({id: 'e', side: 'below'});
  const spec = {page: {blocks: [{heading: 'Other', diagram: {nodes: {x: {}}, rows: [['x']]}},
    {tabs: [{label: 'Tab', sections: [{heading: 'Move', diagram}]}]}]}};
  const text = JSON.stringify(spec, null, '\t') + '\n';
  const path = ['page', 'blocks', 1, 'tabs', 0, 'sections', 0, 'diagram'];
  for (const id of ['a', 'f']){
    const plan = B.planMoveNode(text, spec, 1, id, {row: 1, slot: 1});
    assert.ok(!plan.error, plan.error);
    let restored = plan.text;
    for (const key of ['rows', 'floats']){
      const before = B.jsonLocate(text, path.concat(key)), after = B.jsonLocate(restored, path.concat(key));
      restored = restored.slice(0, after.start) + text.slice(before.start, before.end) + restored.slice(after.end);
    }
    assert.equal(restored, text, 'all surrounding bytes are identical');
  }
  const deletionText = '{"nodes": {"a":{},"f":{}}, "floats": [{"id":"f"}], "rows": [["a"]], "edges" : [ ]}\n';
  const deleted = B.planMoveNode(deletionText, JSON.parse(deletionText), 0, 'f', {gap: 1});
  assert.equal(deleted.text, '{"nodes": {"a":{},"f":{}}, "rows": [["a"],["f"]], "edges" : [ ]}\n');
});

test('planSetNodeFloat lifts rows into floats, collapses stacks, and appends entries', () => {
  for (const [rows, expected] of [
    [[['a', 'b'], ['c']], [['b'], ['c']]],
    [[[['a', 'b']], ['c']], [['b'], ['c']]],
    [[[['a', 'b', 'c']], ['d']], [[['b', 'c']], ['d']]],
    [[['a'], ['b']], [['b']]]
  ]){
    const spec = nodePlacementFixture(rows), next = changedNodePlacement(spec, B.planSetNodeFloat, 'a', 'above');
    assert.deepStrictEqual(next.rows, expected);
    assert.deepStrictEqual(next.floats, [...spec.floats, {id: 'a', side: 'above'}]);
  }
  const spec = nodePlacementFixture();
  delete spec.floats;
  const plan = B.planSetNodeFloat(JSON.stringify(spec), spec, 0, 'a', 'below');
  assert.deepStrictEqual(JSON.parse(plan.text).floats, [{id: 'a', side: 'below'}]);
});

test('planSetNodeFloat switches sides preserving nudges and returns a float in a new last row', () => {
  const spec = nodePlacementFixture();
  const next = changedNodePlacement(spec, B.planSetNodeFloat, 'f', 'below');
  assert.deepStrictEqual(next.rows, spec.rows);
  assert.deepStrictEqual(next.floats, [{id: 'f', side: 'below', dx: 12, dy: -8}]);
  for (const side of [null, '']){
    const placed = changedNodePlacement(next, B.planSetNodeFloat, 'f', side);
    assert.deepStrictEqual(placed.rows, [...spec.rows, ['f']]);
    assert.ok(!Object.hasOwn(placed, 'floats'));
  }
  spec.floats.push({id: 'e', side: 'below', dx: 2});
  assert.deepStrictEqual(changedNodePlacement(spec, B.planSetNodeFloat, 'f', null).floats, [spec.floats[1]]);
});

test('planSetNodeFloat protects the last rows id and rejects unknown nodes and invalid sides', () => {
  for (const rows of [[['a']], [[['a']]]]){
    const spec = nodePlacementFixture(rows), text = JSON.stringify(spec);
    for (const side of ['above', 'below'])
      assert.equal(B.planSetNodeFloat(text, spec, 0, 'a', side).error, 'the last node in rows cannot float');
    assert.equal(JSON.stringify(spec), text);
  }
  const spec = nodePlacementFixture(), text = JSON.stringify(spec);
  assert.equal(B.planSetNodeFloat(text, spec, 0, 'a', null).error, 'already placed in rows');
  assert.match(B.planSetNodeFloat(text, spec, 0, 'missing', 'above').error, /not found/);
  assert.ok(B.planSetNodeFloat(text, spec, 0, 'a', 'left').error);
  assert.ok(B.planSetNodeFloat(text, spec, 99, 'a', 'above').error);
  assert.ok(B.planSetNodeFloat(text, spec, 0, 'u', null).error);
  const next = changedNodePlacement(spec, B.planSetNodeFloat, 'u', 'below');
  assert.deepStrictEqual(next.rows, spec.rows);
  assert.deepStrictEqual(next.floats, [...spec.floats, {id: 'u', side: 'below'}]);
});

test('planStackNodes collects scattered nodes into a nested stack at the first slot', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}, c: {}, d: {}}, rows: [['a', 'b'], ['c', 'd']]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  const plan = B.planStackNodes(text, spec, 0, ['b', 'd']);
  assert.ok(!plan.error, plan.error);
  assert.equal(plan.kind, 'node');
  const rows = JSON.parse(plan.text).page.blocks[0].diagram.rows;
  /* b was first in flat order, so the stack lands in b's slot (row 0); d lifted out, its row collapses */
  assert.deepStrictEqual(rows, [['a', ['b', 'd']], ['c']]);
});

test('planStackNodes stacks two side-by-side nodes and drops the emptied sibling slot', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}, c: {}}, rows: [['a', 'b', 'c']]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  const rows = JSON.parse(B.planStackNodes(text, spec, 0, ['a', 'c']).text)
    .page.blocks[0].diagram.rows;
  assert.deepStrictEqual(rows, [[['a', 'c'], 'b']]);
});

test('planStackNodes merges into an existing stack, keeping non-selected stack members', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}, c: {}, d: {}}, rows: [['a', ['b', 'c']], ['d']]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  const rows = JSON.parse(B.planStackNodes(text, spec, 0, ['b', 'd']).text)
    .page.blocks[0].diagram.rows;
  /* b is first (inside the existing stack); its slot becomes [b,d], c stays beside it as a lone slot */
  assert.deepStrictEqual(rows, [['a', ['b', 'd'], 'c']]);
});

test('planStackNodes refuses fewer than two, missing/float nodes, and already-stacked sets', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}, f: {}}, rows: [['a', 'b']], floats: [{id: 'f', side: 'above'}]
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  assert.match(B.planStackNodes(text, spec, 0, ['a']).error, /at least two/);
  assert.match(B.planStackNodes(text, spec, 0, ['a', 'f']).error, /no row slot/);
  assert.match(B.planStackNodes(text, spec, 0, ['a', 'zzz']).error, /no row slot/);

  const stacked = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {}, b: {}}, rows: [[['a', 'b']]]
  }}]}};
  assert.match(B.planStackNodes(JSON.stringify(stacked, null, 2), stacked, 0, ['a', 'b']).error,
    /already one stack/);
});

test('un-floating a node that is malformed into both rows and floats only removes the float entry', () => {
  const spec = {nodes: {a: {}, x: {}}, rows: [['a', 'x']], floats: [{id: 'x', side: 'above'}]};
  const plan = B.planSetNodeFloat(JSON.stringify(spec), spec, 0, 'x', null);
  assert.ok(!plan.error, plan.error);
  const next = JSON.parse(plan.text);
  assert.deepStrictEqual(next.rows, [['a', 'x']]);
  assert.strictEqual(next.floats, undefined);
});

test('planStepTone sets, changes, and clears per-node tone patches on a step', () => {
  const spec = {nodes: {gw: {}, db: {}}, rows: [['gw', 'db']],
    steps: [{text: 'boom', edge: 'gw->db'}], edges: [{from: 'gw', to: 'db'}]};
  let plan = B.planStepTone(JSON.stringify(spec), spec, 0, 0, 'gw', 'alert');
  assert.ok(!plan.error, plan.error);
  let next = JSON.parse(plan.text);
  assert.deepStrictEqual(next.steps[0].tone, {gw: 'alert'});
  plan = B.planStepTone(plan.text, next, 0, 0, 'db', 'dim');
  next = JSON.parse(plan.text);
  assert.deepStrictEqual(next.steps[0].tone, {gw: 'alert', db: 'dim'});
  plan = B.planStepTone(plan.text, next, 0, 0, 'gw', 'base');
  next = JSON.parse(plan.text);
  assert.strictEqual(next.steps[0].tone.gw, 'base');
  plan = B.planStepTone(plan.text, next, 0, 0, 'gw', null);
  next = JSON.parse(plan.text);
  assert.deepStrictEqual(next.steps[0].tone, {db: 'dim'});
  plan = B.planStepTone(plan.text, next, 0, 0, 'db', null);
  next = JSON.parse(plan.text);
  assert.strictEqual(next.steps[0].tone, undefined);
  assert.ok(B.planStepTone(JSON.stringify(spec), spec, 0, 0, 'nope', 'alert').error);
  assert.ok(B.planStepTone(JSON.stringify(spec), spec, 0, 0, 'gw', 'purple').error);
  assert.ok(B.planStepTone(JSON.stringify(spec), spec, 0, 9, 'gw', 'alert').error);
});

test('planStepTone tolerates a null-valued existing tone entry and preserves it for other nodes', () => {
  const spec = {nodes: {gw: {}, db: {}}, rows: [['gw', 'db']],
    steps: [{text: 'x', nodes: ['gw'], tone: {gw: null}}]};
  const plan = B.planStepTone(JSON.stringify(spec), spec, 0, 0, 'db', 'warn');
  assert.ok(!plan.error, plan.error);
  const next = JSON.parse(plan.text);
  assert.deepStrictEqual(next.steps[0].tone, {gw: null, db: 'warn'});
});

test('planStepTone keeps a "__proto__" node id as an ordinary tone key', () => {
  const spec = JSON.parse('{"nodes":{"__proto__":{},"a":{}},"rows":[["a"]],"steps":[{"text":"x","nodes":["a"]}]}');
  const plan = B.planStepTone(JSON.stringify(spec), spec, 0, 0, '__proto__', 'alert');
  assert.ok(!plan.error, plan.error);
  assert.ok(plan.text.includes('"__proto__": "alert"'), plan.text);
  const tone = JSON.parse(plan.text).steps[0].tone;
  assert.strictEqual(Object.getOwnPropertyDescriptor(tone, '__proto__').value, 'alert');
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

test('group planners refuse a non-object diagram.groups instead of corrupting it', () => {
  const spec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {group: 'dev'}, b: {}}, rows: [['a', 'b']],
    groups: 'occupied'
  }}]}};
  const text = JSON.stringify(spec, null, 2);
  assert.match(B.planSetGroupTitle(text, spec, 0, 'dev', 'Title').error, /not an object/);
  assert.match(B.planSetGroupIcon(text, spec, 0, 'dev', 'house').error, /not an object/);
  const setPlan = B.planSetNodeGroup(text, spec, 0, 'b', 'dev');
  assert.ok(setPlan.error, 'declaring into a string groups value must fail, not corrupt');
  /* numeric own keys on strings/arrays must not slip past the guard */
  assert.match(B.planRenameGroup(text, spec, 0, '0', 'new').error, /not an object/);
  assert.match(B.planDeleteGroup(text, spec, 0, '0').error, /not an object/);
  const arrSpec = {page: {blocks: [{heading: 'H', diagram: {
    nodes: {a: {group: '0'}}, rows: [['a']], groups: ['meta']
  }}]}};
  const arrText = JSON.stringify(arrSpec, null, 2);
  assert.match(B.planSetNodeGroup(arrText, arrSpec, 0, 'a', '0').error, /not an object/);
  assert.match(B.planRenameGroup(arrText, arrSpec, 0, '0', 'x').error, /not an object/);
  assert.match(B.planDeleteGroup(arrText, arrSpec, 0, '0').error, /not an object/);
  assert.match(B.planSetGroupTitle(arrText, arrSpec, 0, '0', 'T').error, /not an object/);
  assert.match(B.planSetGroupIcon(arrText, arrSpec, 0, '0', null).error, /not an object/);
  assert.match(B.planBulkSetGroup(arrText, arrSpec, [{kind: 'node', section: 0, id: 'a'}], 'x').error, /not an object/);
  /* the original values survive every refused edit */
  assert.equal(JSON.parse(text).page.blocks[0].diagram.groups, 'occupied');
  assert.deepStrictEqual(JSON.parse(arrText).page.blocks[0].diagram.groups, ['meta']);
});
