'use strict';
/* Phase 4 for the log panel: lines appended at a step render as new for that
   step, `highlight` targets lines by id (carried, enterOnce, null clears), and
   each line keeps the tag colors in effect at the step it was appended. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');

const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['compatibility.js', 'canon.js', 'validator.js', 'engine.js'])
  vm.runInContext(readSource(file), C, {filename: file});
const plain = value => JSON.parse(JSON.stringify(value));

function diagram(patches, initial){
  return {nodes: {a: {}}, rows: [['a']],
    panels: [{id: 'l', type: 'log', tags: {NET: '#111111'}, initial: initial === undefined ? {log: [{tag: 'NET', text: 'boot'}]} : initial}],
    steps: patches.map((patch, i) => ({id: 's' + i, nodes: ['a'], panels: patch ? {l: patch} : undefined}))};
}
/* Each step's lines as [text, new?, highlighted?, color]. */
function frames(d){
  const states = C.foldPanelStates(d).l, panel = d.panels[0];
  return plain(states.map((state, i) => {
    const host = {querySelector: () => null};
    C.renderPanelBody(host, panel, state, 'aurora', states, i, false);
    return [...host.innerHTML.matchAll(/<div class="plogline([^"]*)">(?:<span class="plogtag"(?: style="color:([^"]+)")?>[^<]*<\/span>)?<span>([^<]*)<\/span><\/div>/g)]
      .map(m => [m[3], / plog-new/.test(m[1]), / plog-hl/.test(m[1]), m[2] || null]);
  }));
}
const stepWarnings = d => plain(C.validate(C.normalize(d)).warnings.filter(w => /\.(steps\[|panels\[0\])/.test(w)))
  .map(w => w.replace(/^.*?\.(steps|panels\[0\])/, '$1'));
const isNew = d => frames(d).map(lines => lines.filter(l => l[1]).map(l => l[0]));

test('lines appended at a step render as new for that step only', () => {
  const d = diagram([{log: [{tag: 'NET', text: 'a'}]}, null, {log: [{text: 'b'}, {text: 'c'}]}, {log: []}]);
  assert.deepEqual(isNew(d), [['a'], [], ['b', 'c'], []]);
  assert.deepEqual(isNew(diagram([null, {log: 'x'}], {log: [{text: 'i1'}, {text: 'i2'}]})), [[], ['x']], 'initial lines are not new at step 0');
  assert.deepEqual(isNew(diagram([{log: 'first'}], {})), [['first']], 'no initial log');
  /* Without this path's history (previews, softwarePanelHTML) nothing is marked. */
  const d2 = diagram([{log: 'a'}]), state = C.foldPanelStates(d2).l[0];
  assert.doesNotMatch(C.softwarePanelHTML(d2.panels[0], state), /plog-new/);
  const host = {querySelector: () => null};
  C.renderPanelBody(host, d2.panels[0], state, 'aurora', [], 0, false);
  assert.doesNotMatch(host.innerHTML, /plog-new/);
});

test('highlight targets lines by id, carries, lasts one step under enterOnce and null clears it', () => {
  const d = diagram([
    {log: [{id: 'r1', text: 'retry 1'}, {id: 'r2', text: 'retry 2'}], highlight: 'r2'},
    null,
    {highlight: ['r1', 'r2']},
    {highlight: null},
    {enterOnce: {highlight: 'r1'}},
    null,
  ]);
  const hl = frames(d).map(lines => lines.filter(l => l[2]).map(l => l[0]));
  assert.deepEqual(hl, [['retry 2'], ['retry 2'], ['retry 1', 'retry 2'], [], ['retry 1'], []]);
  assert.deepEqual(stepWarnings(d), []);
});

test('a duplicate id highlights only its first line and warns', () => {
  const d = diagram([{log: [{id: 'x', text: 'one'}, {id: 'x', text: 'two'}], highlight: 'x'}]);
  assert.deepEqual(frames(d)[0].filter(l => l[2]).map(l => l[0]), ['one']);
  assert.deepEqual(stepWarnings(d), ['panels[0]: steps[0].panels.l.log[1].id repeats line id "x" — only the first line with it can be highlighted']);
});

test('highlight and line id warnings', () => {
  const d = diagram([{log: [{id: '', text: 'blank'}], highlight: 'nope'}, {highlight: 5}, {enterOnce: {highlight: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']}}]);
  assert.deepEqual(stepWarnings(d), [
    'panels[0]: steps[0].panels.l.log[0].id must be a non-empty string — line cannot be highlighted',
    'steps[0].panels.l.highlight: no log line has id "nope" — ignored',
    'steps[1].panels.l.highlight: expected a line id, up to 8 line ids, or null — nothing highlighted',
    'steps[2].panels.l.enterOnce.highlight: expected a line id, up to 8 line ids, or null — nothing highlighted',
  ]);
  /* Ids appended at later steps and in initial are known everywhere. */
  assert.deepEqual(stepWarnings(diagram([{highlight: ['early', 'late']}, {log: [{id: 'late', text: 'l'}]}], {log: [{id: 'early', text: 'e'}]})), []);
});

test('each line keeps the tag colors in effect at the step it was appended', () => {
  const d = diagram([
    {tags: {NET: '#222222'}},
    {log: [{tag: 'NET', text: 'after change'}]},
    {enterOnce: {tags: {NET: '#333333'}}, log: [{tag: 'NET', text: 'once'}]},
    {log: [{tag: 'NET', text: 'back'}], tags: null},
  ]);
  const colors = frames(d).map(lines => lines.map(l => l[0] + '=' + l[3]));
  assert.deepEqual(colors, [
    ['boot=#111111'],
    ['boot=#111111', 'after change=#222222'],
    ['boot=#111111', 'after change=#222222', 'once=#333333'],
    ['boot=#111111', 'after change=#222222', 'once=#333333', 'back=#111111'],
  ]);
  /* Tags in initial color the initial lines; a step-0 change does not. */
  const i = diagram([{tags: {NET: '#555555'}, log: [{tag: 'NET', text: 'x'}]}], {tags: {NET: '#444444'}, log: [{tag: 'NET', text: 'boot'}]});
  assert.deepEqual(frames(i)[0].map(l => l[0] + '=' + l[3]), ['boot=#444444', 'x=#555555']);
});

test('alternate paths mark, highlight and color from their own history', () => {
  const d = diagram([{log: [{id: 'a', tag: 'NET', text: 'shared'}]}, {tags: {NET: '#222222'}, log: [{tag: 'NET', text: 'main'}], highlight: 'a'}, {log: [{tag: 'NET', text: 'alt'}]}]);
  d.paths = [{id: 'main', steps: ['s0', 's1']}, {id: 'alt', steps: ['s0', 's2']}];
  assert.deepEqual(frames(C.diagramForPath(d, 'main'))[1], [['boot', false, false, '#111111'], ['shared', false, true, '#111111'], ['main', true, false, '#222222']]);
  assert.deepEqual(frames(C.diagramForPath(d, 'alt'))[1], [['boot', false, false, '#111111'], ['shared', false, false, '#111111'], ['alt', true, false, '#111111']]);
});

test('a log spec without ids, highlight or tag changes renders as before apart from the new-line class', () => {
  const d = diagram([{log: [{tag: 'NET', text: 'a'}, 'b']}, null]);
  const states = C.foldPanelStates(d).l;
  const host = {querySelector: () => null};
  C.renderPanelBody(host, d.panels[0], states[0], 'aurora', states, 0, false);
  assert.equal(host.innerHTML,
    '<div class="plog panel-fill-scroll"><div class="plogline"><span class="plogtag" style="color:#111111">NET</span><span>boot</span></div>' +
    '<div class="plogline plog-new"><span class="plogtag" style="color:#111111">NET</span><span>a</span></div>' +
    '<div class="plogline plog-new"><span>b</span></div></div>');
  assert.deepEqual(stepWarnings(d), []);
});
