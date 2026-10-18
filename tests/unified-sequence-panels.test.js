'use strict';
/* Phase 3 start of unified panel state: sequence, frames, reads and locus. Each
   keeps its own fold (the common fold with acceptance rules for state fields),
   which already carries setup names, so flagging them changes nothing else. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');

const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['compatibility.js', 'canon.js', 'validator.js', 'engine.js'])
  vm.runInContext(readSource(file), C, {filename: file});
const plain = value => JSON.parse(JSON.stringify(value));
const TYPES = ['sequence', 'frames', 'reads', 'locus'];
/* A second setup field per type that changes the rendering. */
const SECOND = {sequence: ['sequence', 'GGGGCCCCAAAATTTT'], frames: ['sequence', 'ATGAAATAG'],
  reads: ['reference', 'TTTTTTTTTTTTTTTTTTTT'], locus: ['unit', 'kb']};

function diagram(type, patches){
  const panel = Object.assign({id: 'p', type}, plain(C.PanelRegistry.get(type).authoring.template));
  return {nodes: {a: {}}, rows: [['a']], panels: [panel],
    steps: patches.map(patch => ({nodes: ['a'], panels: patch ? {p: patch} : undefined}))};
}
const html = d => C.foldPanelStates(d).p.map(state => C.softwarePanelHTML(d.panels[0], state));
const stepWarnings = d => plain(C.validate(C.normalize(d)).warnings.filter(w => w.includes('.steps[')))
  .map(w => w.replace(/^.*?\.steps/, 'steps'));

for (const type of TYPES) {
  test(type + ': label carries, enterOnce lasts one step and null restores the declaration', () => {
    const d = diagram(type, [null, {label: 'Changed label'}, null, {label: null}, {enterOnce: {label: 'Changed label'}}, null]);
    assert.deepEqual(plain(html(d).map(h => h.includes('Changed label'))), [false, true, true, false, true, false]);
    assert.deepEqual(stepWarnings(d), [], 'setup fields in patches are no longer unknown state fields');
  });
  test(type + ': a second setup field changes the rendering and an invalid label warns at the patch path', () => {
    /* The step renders exactly as a declaration authored with that value. */
    const [field, value] = SECOND[type], patch = {};
    patch[field] = value;
    const d = diagram(type, [null, patch]), out = html(d);
    const authored = diagram(type, [null, null]);
    authored.panels[0][field] = value;
    assert.notEqual(out[1], out[0], field);
    assert.equal(out[1], html(authored)[1], field);
    assert.deepEqual(stepWarnings(diagram(type, [{label: 5}])), ['steps[0].panels.p.label: expected text — ignored']);
  });
  test(type + ': unknown state fields that are not setup fields still warn', () => {
    assert.deepEqual(stepWarnings(diagram(type, [{label: 'x', bogus: 1}])), ['steps[0].panels.p.bogus: unknown field — ignored']);
  });
}

test('sequence marks validate against the sequence in effect at that step', () => {
  const d = diagram('sequence', [{sequence: 'ATGC'}, {marks: [{id: 'm', from: 6, to: 8}]}]);
  const warnings = stepWarnings(d);
  assert.equal(warnings.length, 1, warnings.join('\n'));
  assert.match(warnings[0], /^steps\[1\]\.panels\.p\.marks\[0\]/);
  assert.deepEqual(stepWarnings(diagram('sequence', [{marks: [{id: 'm', from: 6, to: 8}]}])), [], 'the declared sequence is long enough');
});

test('setup fields in initial are checked as declared fields and apply in ambient', () => {
  for (const type of TYPES) {
    const [field, value] = SECOND[type];
    const d = diagram(type, [null, {label: 5}]);
    d.panels[0].initial = Object.assign({}, d.panels[0].initial, {[field]: value, label: 7});
    const result = C.validate(C.normalize(d));
    const panelWarnings = plain(result.warnings).filter(w => /\.(panels\[0\]|steps\[)/.test(w)).map(w => w.replace(/^.*?\.(panels\[0\]|steps)/, '$1'));
    assert.deepEqual(panelWarnings, ['panels[0].label: expected text — ignored', 'steps[1].panels.p.label: expected text — ignored'], type);
    /* Ambient presentation renders initial: the same as declaring the field. */
    const authored = diagram(type, [null]);
    authored.panels[0][field] = value;
    authored.panels[0].label = 7;
    assert.equal(C.softwarePanelHTML(d.panels[0], d.panels[0].initial), C.softwarePanelHTML(authored.panels[0], authored.panels[0].initial), type);
  }
  /* Initial state is checked against the setup in effect from the start. */
  const d = diagram('sequence', [null]);
  d.panels[0].initial = {sequence: 'ATGC', marks: [{id: 'm', from: 6, to: 8}]};
  assert.ok(plain(C.validate(C.normalize(d)).warnings).some(w => /panels\[0\]\.initial\.marks\[0\]/.test(w)));
  assert.ok(!plain(C.validate(C.normalize(d)).warnings).some(w => /initial\.sequence: unknown field/.test(w)));
});
