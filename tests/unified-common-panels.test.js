'use strict';
/* Phase 2 of unified panel state: common-fold types whose setup fields steps
   may change like state. Each case changes one setup field and checks carry,
   one-step enterOnce, null restore, and the warning for an invalid value. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');

const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['compatibility.js', 'canon.js', 'validator.js', 'engine.js'])
  vm.runInContext(readSource(file), C, {filename: file});
const plain = value => JSON.parse(JSON.stringify(value));

/* panel: the declaration; field/value: the override; seen/declared: text found
   only with the override or only with the declaration; invalid: a value the
   declaration rules warn about, and that warning's suffix  */
const CASES = {
  state: {panel: {states: ['OFF', 'RUN'], initial: {state: 'OFF'}}, field: 'states', value: ['OFF', 'SLEEP'], seen: 'SLEEP', declared: 'RUN'},
  log: {panel: {tags: {NET: '#111111'}, initial: {log: [{tag: 'NET', text: 'up'}]}}, field: 'tags', value: {NET: '#222222'}, seen: '#222222', declared: '#111111'},
  orbit: {panel: {states: ['IDLE', 'BUSY'], initial: {state: 'IDLE'}}, field: 'states', value: ['IDLE', 'DONE'], seen: 'DONE', declared: 'BUSY',
    invalid: [[], '.states: orbit needs states:[...] — panel renders empty']},
  table: {panel: {columns: [{id: 'a', label: 'Alpha'}], initial: {rows: [{id: 'r', cells: {a: 1}}]}}, field: 'columns', value: [{id: 'a', label: 'Beta'}], seen: 'Beta', declared: 'Alpha',
    invalid: ['bad', '.columns: needs 1–4 entries with unique string ids']},
  checks: {panel: {checks: [{id: 'a', label: 'Alpha'}]}, field: 'checks', value: [{id: 'a', label: 'Beta'}], seen: 'Beta', declared: 'Alpha',
    invalid: [[], '.checks: needs 1–12 entries with unique string ids']},
  budget: {panel: {metrics: [{id: 'a', label: 'Alpha', max: 10}]}, field: 'metrics', value: [{id: 'a', label: 'Beta', max: 10}], seen: 'Beta', declared: 'Alpha',
    invalid: [[{id: 'a', max: -1}], '.metrics[0].max: needs a finite positive upper limit — rendered as NO LIMIT']},
  queue: {panel: {title: 'Before', initial: {state: 'empty'}}, field: 'title', value: 'After', title: true},
};

function diagram(type, c, patches){
  return {nodes: {a: {}}, rows: [['a']], panels: [Object.assign({id: 'p', type}, plain(c.panel))],
    steps: patches.map(patch => ({nodes: ['a'], panels: patch ? {p: patch} : undefined}))};
}
function frames(d){
  const panel = d.panels[0];
  return C.foldPanelStates(d).p.map(state => {
    const effective = C.panelEffectiveDeclaration(panel, state);
    return {title: effective.title, html: C.softwarePanelHTML(panel, state)};
  });
}

test('exactly the approved types are flagged', () => {
  const flagged = C.PanelRegistry.types().filter(type => C.PanelRegistry.get(type).unified).sort();
  assert.deepEqual(plain(flagged), ['budget', 'checks', 'frames', 'gauge', 'locus', 'log', 'orbit', 'queue', 'reads', 'sequence', 'state', 'table']);
  for (const type of ['buffer', 'trace', 'cost', 'image', 'thermo', 'waterfall', 'leds', 'signal', 'tiles', 'zoneframe', 'xray', 'replicas', 'data-contract', 'radar'])
    assert.equal(C.panelUnifiedFields(type), null, type);
});

for (const [type, c] of Object.entries(CASES)) {
  test(type + ': a setup change carries, enterOnce lasts one step and null restores the declaration', () => {
    const once = {}, value = {};
    once[c.field] = c.value;
    value[c.field] = c.value;
    const reset = {};
    reset[c.field] = null;
    const d = diagram(type, c, [null, value, null, reset, {enterOnce: once}, null]);
    const out = frames(d);
    const has = out.map(frame => c.title ? frame.title === c.value : frame.html.includes(c.seen));
    assert.deepEqual(plain(has), [false, true, true, false, true, false]);
    if (!c.title) assert.ok(out[0].html.includes(c.declared) && out[3].html.includes(c.declared), 'declared value shows again');
    assert.deepEqual(plain(C.validate(C.normalize(d)).warnings.filter(w => w.includes('.steps['))), [], 'valid overrides are silent');
  });
  if (c.invalid) test(type + ': an invalid setup change warns at the patch path', () => {
    const patch = {};
    patch[c.field] = c.invalid[0];
    const result = C.validate(C.normalize(diagram(type, c, [null, patch])));
    const reported = result.warnings.filter(w => w.includes('.steps['));
    assert.deepEqual(plain(reported.map(w => w.replace(/^.*\.steps\[1\]\.panels\.p/, ''))), [c.invalid[1]]);
  });
}

test('item IDs inside keyed state objects are never read as setup fields', () => {
  /* Checks and Budget key their state by item ID inside results/values, so an
     item named like a setup field stays ordinary state. */
  const d = {nodes: {a: {}}, rows: [['a']], panels: [{id: 'p', type: 'checks', checks: [{id: 'checks', label: 'Self'}, {id: 'title', label: 'Title'}]}],
    steps: [{nodes: ['a'], panels: {p: {results: {checks: {status: 'pass'}, title: {status: 'fail'}}}}}]};
  const state = C.foldPanelStates(d).p[0];
  assert.equal(C.panelEffectiveDeclaration(d.panels[0], state), d.panels[0]);
  assert.match(C.softwarePanelHTML(d.panels[0], state), /1 \/ 2/);
});

test('table rows validate against the columns in effect at that step', () => {
  const c = CASES.table;
  const d = diagram('table', c, [{columns: [{id: 'b', label: 'B'}], rows: [{id: 'r', cells: {b: 1}}]}, {rows: [{id: 'r', cells: {a: 1}}]}]);
  const warnings = C.validate(C.normalize(d)).warnings.filter(w => w.includes('.steps['));
  assert.equal(warnings.length, 1, warnings.join('\n'));
  assert.match(warnings[0], /steps\[1\]\.panels\.p\.rows\[0\]\.cells\.a/);
});

test('an override is reported even when the declared value has the same problem', () => {
  const d = {nodes: {a: {}}, rows: [['a']], panels: [{id: 'p', type: 'checks', checks: []}],
    steps: [{nodes: ['a'], panels: {p: {checks: []}}}, {nodes: ['a'], panels: {p: {title: 'x'}}}]};
  const warnings = C.validate(C.normalize(d)).warnings.filter(w => w.includes('.checks: needs'));
  assert.deepEqual(plain(warnings.map(w => w.replace(/^.*?\.(panels\[0\]|steps\[\d\]\.panels\.p)/, '$1'))),
    ['panels[0].checks: needs 1–12 entries with unique string ids', 'steps[0].panels.p.checks: needs 1–12 entries with unique string ids']);
});
