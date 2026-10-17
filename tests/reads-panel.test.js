'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const hostile = '<img src=x onerror=bad()>';
/* Values cross the vm boundary, so deep comparisons use plain JSON copies. */
const model = (p, s) => plain(C.readsModel(p, s));
/* Reference 101–110: A C G T A C G T A C */
const panel = () => ({id:'r', type:'reads', reference:'ACGTACGTAC', start:101, label:'ref'});
const fixtureReads = () => [
  {id:'r1', at:103, seq:'GTAC', strand:'+'},
  {id:'r2', at:105, seq:'AGGT', strand:'-'},
  {id:'r3', at:99, seq:'TTACG'},
  {id:'r4', at:109, seq:'ACGTT'},
  {id:'r5', at:500, seq:'ACGT'},
  {id:'r6', at:1, seq:'ACGT'},
  {id:'r7', at:104, seq:'T-CG', tone:'accent'},
];
const diagram = () => ({nodes:{n:{}}, rows:[['n']], panels:[panel()], steps:[{id:'a', nodes:['n'], panels:{r:{reads:fixtureReads()}}}]});
const cells = row => row.cells.map(cell => cell.kind[0]).join('');

test('reads template, picker example, feature label and styles use ordinary discovery', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...plain(C.PANEL_TEMPLATES.reads), id:'t', type:'reads'}]};
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'reads');
  assert.equal(entry.category, 'Science & sequencing');
  assert.equal(entry.name, 'Read alignment');
  const sample = C.panelPickerExample('reads');
  assert.equal(sample.panel.type, 'reads');
  assert.ok(sample.state.reads.length >= 4);
  assert.deepEqual(validate({nodes:{n:{}}, rows:[['n']], panels:[plain(sample.panel)]}), {errors:[], warnings:[]});
  const sampleModel = model(sample.panel, sample.state);
  assert.ok(sampleModel.rows.some(row => row.counts.mismatch > 0) && sampleModel.rows.some(row => row.counts.gap > 0) && sampleModel.rows.some(row => row.counts.clip > 0));
  assert.equal(sampleModel.inserts.filter(insert => insert.placed).length, 1);
  assert.deepEqual(panelAssets().features['panel.reads'], {label:'Read alignment panel', since:'0.2.0'});
  assert.match(readStyles('style.core.css'), /\.reads-grid\{/);
  assert.equal(C.PanelRegistry.get('reads').order, 41);
  assert.deepEqual(plain(C.PanelRegistry.get('reads').layout.sectionSizing), {minWidth:360, preferredWidth:560, maxWidth:1000, aspectPolicy:'content', grow:1});
});
test('mismatch classification is case-insensitive, treats N as a match and - as a gap', () => {
  assert.equal(C.readsClassify('A','A'), 'match');
  assert.equal(C.readsClassify('a','A'), 'match');
  assert.equal(C.readsClassify('A','T'), 'mismatch');
  assert.equal(C.readsClassify('N','T'), 'match');
  assert.equal(C.readsClassify('T','N'), 'match');
  assert.equal(C.readsClassify('-','T'), 'gap');
  assert.equal(C.readsClassify('', 'T'), 'mismatch');
});
test('the model classifies every cell, computes depth from aligned letters and bounds the grid', () => {
  const m = model(panel(), {reads:fixtureReads()});
  assert.equal(m.start, 101); assert.equal(m.end, 110); assert.equal(m.length, 10);
  assert.deepEqual(m.grid, {from:99, to:113, columns:15});
  const rows = Object.fromEntries(m.rows.map(row => [row.id, row]));
  assert.equal(cells(rows.r1), 'mmmm');
  assert.equal(cells(rows.r2), 'mmmm'.slice(0,1) + 'm' + 'mm');
  assert.deepEqual(rows.r2.cells.map(cell => cell.kind), ['match','mismatch','match','match']);
  assert.equal(rows.r2.cells[1].coord, 106);
  assert.deepEqual(rows.r3.cells.map(cell => cell.kind), ['clip','clip','match','match','match']);
  assert.deepEqual(rows.r4.cells.map(cell => cell.kind), ['match','match','clip','clip','clip']);
  assert.ok(rows.r5.outside && rows.r6.outside);
  assert.deepEqual(rows.r5.cells, []);
  assert.deepEqual(rows.r7.cells.map(cell => cell.kind), ['match','gap','match','match']);
  assert.deepEqual(m.depth, [1,1,2,2,2,3,2,1,1,1], 'gaps and clips add no depth');
  assert.equal(m.maxDepth, 3);
  assert.equal(m.visibleRows, 5);
  assert.deepEqual(m.ruler.map(tick => tick.coord), [101, 110]);
  assert.ok(rows.r3.clipped && rows.r4.clipped && !rows.r1.clipped);
  assert.equal(rows.r7.tone, 'accent'); assert.equal(rows.r1.tone, 'neutral');
  assert.equal(rows.r1.strand, '+'); assert.equal(rows.r3.strand, '');
});
test('long overhang is truncated to twelve letters per side and reads beyond maxReads are ignored', () => {
  const long = {id:'L', at:71, seq:'A'.repeat(40)};
  const m = model(panel(), {reads:[long]});
  const row = m.rows[0];
  assert.equal(m.grid.from, 89); assert.equal(m.grid.to, 110);
  assert.equal(row.truncatedLeft, 18); assert.equal(row.truncatedRight, 0);
  assert.equal(row.cells[0].coord, 89); assert.equal(row.cells[0].kind, 'clip');
  assert.equal(row.cells.filter(cell => cell.kind === 'clip').length, 12);
  const many = Array.from({length:14}, (_, i) => ({id:'m'+i, at:101, seq:'ACGT'}));
  assert.equal(model(panel(), {reads:many}).rows.length, 12);
  assert.equal(model({...panel(), maxReads:3}, {reads:many}).rows.length, 3);
  assert.equal(model({...panel(), maxReads:99}, {reads:many}).rows.length, 12);
  const d = diagram(); d.steps[0].panels.r.reads = many;
  assert.match(validate(d).warnings.join('\n'), /steps\[0\]\.panels\.r\.reads: only the first 12 reads render/);
});
test('insertions attach to the matching read cell; orphans and misplaced inserts stay listed but unplaced', () => {
  const state = {reads:fixtureReads(), inserts:[
    {read:'r1', after:104, seq:'GG'},
    {read:'nope', after:104, seq:'A'},
    {read:'r1', after:109, seq:'A'},
    {read:'r3', after:99, seq:'C'},
    {read:'r7', after:105, seq:'T'},
    {read:'r1', after:104, seq:'TT'}]};
  const m = model(panel(), state);
  const r1 = m.rows.find(row => row.id === 'r1');
  assert.equal(r1.cells[1].insert, 'GGTT');
  assert.equal(r1.inserts.length, 2);
  assert.deepEqual(m.inserts.map(insert => [insert.placed, insert.orphan]), [[true,false],[false,true],[false,false],[false,false],[true,false],[true,false]]);
  const html = C.readsHTML(panel(), state);
  assert.match(html, /reads-wedge bio-tone-insert/);
  assert.match(html, /title="insertion GGTT"/);
  assert.match(html, /GG after 104 in r1<\/li>/); assert.match(html, /TT after 104 in r1<\/li>/);
  assert.match(html, /\(no such read\)/);
});
test('marks clip to the reference, focus dims the other reads and showMatches prints letters', () => {
  const m = model(panel(), {reads:fixtureReads(), marks:[{id:'a', from:95, to:103, tone:'primer', label:'primer'}, {id:'b', from:108, to:140}, {id:'c', from:200, to:300}], focus:'r2'});
  assert.deepEqual(m.marks.map(mark => [mark.from, mark.to, mark.col, mark.span]), [[101,103,2,3],[108,110,9,3]]);
  assert.equal(m.marks[1].tone, 'neutral');
  assert.ok(m.focusFound);
  assert.deepEqual(m.rows.map(row => row.dim), [true,false,true,true,true,true,true]);
  assert.ok(m.rows[1].focus);
  const none = model(panel(), {reads:fixtureReads(), focus:'missing'});
  assert.equal(none.focusFound, false); assert.ok(none.rows.every(row => !row.dim));
  const dots = C.readsHTML(panel(), {reads:[{id:'r1', at:103, seq:'GTAC'}]});
  assert.match(dots, /class="reads-cell reads-match"[^>]*>\.<\/span>/);
  assert.doesNotMatch(dots, /reads-letters/);
  const letters = C.readsHTML({...panel(), showMatches:true}, {reads:[{id:'r1', at:103, seq:'GTAC'}]});
  assert.match(letters, /reads-letters/);
  assert.match(letters, /class="reads-cell reads-match bio-b bio-b-g"[^>]*>G<\/span>/);
  assert.match(C.readsHTML(panel(), {reads:[], showDepth:false}), /No reads at this step/);
  assert.doesNotMatch(C.readsHTML(panel(), {reads:[], showDepth:false}), /reads-depth/);
  assert.match(C.readsHTML(panel(), {}), /reads-depth/);
});
test('hostile declarations and states never throw, never leak markup and never print NaN', () => {
  const bad = {id:'r', type:'reads', reference:hostile, alphabet:hostile, start:NaN, label:{}, maxReads:Infinity, showMatches:'yes',
    initial:{reads:[null, 5, {id:7}, {id:'x', at:'3', seq:'ACGT'}, {id:'y', at:1e300, seq:'ACGT'}, {id:'z', at:1, seq:{}}, {id:'ok', at:1, seq:'AC'+hostile, label:{}, strand:'x', tone:hostile}, {id:'ok2', at:101, seq:'AC', label:hostile}],
      inserts:[{read:'', after:Number.MAX_SAFE_INTEGER + 1, seq:hostile}, 'bad'], marks:[{id:hostile, from:0, to:3}], focus:{}, showDepth:'true', bogus:1, note:hostile}};
  const d = {nodes:{n:{}}, rows:[['n']], panels:[bad], steps:[{id:'s', nodes:['n'], panels:{r:{reads:{}, enterOnce:{focus:12}}}}]};
  const result = validate(d);
  assert.deepEqual(result.errors, []);
  const w = result.warnings.join('\n');
  for (const path of ['panels[0].reference: letters', 'panels[0].alphabet', 'panels[0].start', 'panels[0].label', 'panels[0].maxReads', 'panels[0].showMatches',
    'panels[0].initial.reads[0]: expected', 'panels[0].initial.reads[2].id', 'panels[0].initial.reads[3].at', 'panels[0].initial.reads[4].at',
    'panels[0].initial.reads[5].seq', 'panels[0].initial.reads[6].seq: letters', 'panels[0].initial.reads[6].label', 'panels[0].initial.reads[6].strand', 'panels[0].initial.reads[6].tone',
    'panels[0].initial.inserts[0].read', 'panels[0].initial.inserts[0].after', 'panels[0].initial.inserts[0].seq', 'panels[0].initial.inserts[1]: expected',
    'panels[0].initial.marks[0]: expected {from,to}', 'panels[0].initial.focus', 'panels[0].initial.showDepth', 'panels[0].initial.bogus: unknown field',
    'steps[0].panels.r.reads: expected an array', 'steps[0].panels.r.enterOnce.focus'])
    assert.ok(w.includes(path), 'warning for ' + path + '\n' + w);
  const html = C.readsHTML(bad, bad.initial);
  assert.doesNotMatch(html, /<img|NaN|Infinity|undefined/);
  assert.ok((html.match(/&lt;img/g) || []).length >= 3, 'reference, read label and note are escaped');
  const proto = JSON.parse('{"reads":[{"id":"p","at":101,"seq":"ACGT","__proto__":{"tone":"bad"}}],"__proto__":{"focus":"p"}}');
  assert.doesNotThrow(() => model(panel(), proto));
  assert.equal(model(panel(), proto).rows[0].tone, 'neutral');
  for (const state of [null, 1, 'x', [], {reads:'abc'}, {reads:[{id:'a', at:101, seq:''}]}])
    assert.doesNotThrow(() => C.readsHTML(panel(), state));
  const empty = C.readsHTML({id:'r', type:'reads'}, {reads:fixtureReads()});
  assert.match(empty, /Declare a reference sequence/);
  assert.equal(model({id:'r', type:'reads'}, {reads:fixtureReads()}).rows.every(row => row.outside), true);
  assert.match(validate({nodes:{n:{}}, rows:[['n']], panels:[{id:'r', type:'reads'}]}).warnings.join('\n'), /panels\[0\]\.reference: expected 1–240 dna letters/);
  assert.match(validate({nodes:{n:{}}, rows:[['n']], panels:[{id:'r', type:'reads', reference:'A'.repeat(300)}]}).warnings.join('\n'), /only the first 240 letters render/);
  assert.equal(model({id:'r', type:'reads', reference:'A'.repeat(300)}, {}).length, 240);
});
test('warnings name declaration, initial, step and transient source paths; rna accepts U', () => {
  const d = diagram();
  d.panels[0].initial = {marks:[{id:'m', from:120, to:130}]};
  d.steps[0].panels.r.reads[1].seq = 'AG-U';
  d.steps[0].panels.r.inserts = [{read:'r1', after:300, seq:'A'}];
  d.steps[0].panels.r.enterOnce = {showDepth:'no'};
  const w = validate(d).warnings.join('\n');
  assert.match(w, /panels\[0\]\.initial\.marks\[0\]: range 120–130 lies outside 101–110/);
  assert.match(w, /steps\[0\]\.panels\.r\.reads\[1\]\.seq: letters "U" are not dna/);
  assert.match(w, /steps\[0\]\.panels\.r\.inserts\[0\]\.after: coordinate 300 lies outside the reference 101–110/);
  assert.match(w, /steps\[0\]\.panels\.r\.enterOnce\.showDepth/);
  const rna = {nodes:{n:{}}, rows:[['n']], panels:[{id:'r', type:'reads', reference:'ACGUACGU', alphabet:'rna', initial:{reads:[{id:'a', at:1, seq:'ACGU'}]}}]};
  assert.deepEqual(validate(rna), {errors:[], warnings:[]});
  assert.equal(model(rna.panels[0], rna.panels[0].initial).rows[0].counts.match, 4);
  assert.match(validate(diagram()).warnings.join('\n'), /steps\[0\]\.panels\.r\.reads\[4\]: read lies entirely outside the reference 101–110/);
  const clean = diagram(); clean.steps[0].panels.r.reads = fixtureReads().slice(0, 4);
  assert.deepEqual(validate(clean), {errors:[], warnings:[]});
});
test('state folds independently across alternate paths with enterOnce and never mutates the spec', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...panel(), initial:{reads:[{id:'r1', at:103, seq:'GTAC'}], showDepth:true}}],
    paths:[{id:'one', label:'One', steps:['a','b1','c1']}, {id:'two', label:'Two', steps:['a','b2']}],
    steps:[
      {id:'a', nodes:['n'], panels:{r:{focus:'r1'}}},
      {id:'b1', nodes:['n'], panels:{r:{reads:fixtureReads(), enterOnce:{showDepth:false}}}},
      {id:'c1', nodes:['n'], panels:{r:{focus:null, marks:[{id:'m', from:101, to:102}]}}},
      {id:'b2', nodes:['n'], panels:{r:{reads:'not an array', inserts:[{read:'r1', after:104, seq:'GG'}]}}}]};
  const before = JSON.stringify(d);
  assert.deepEqual(validate(d).errors, []);
  const one = C.foldPanelStates(C.diagramForPath(d, 'one')).r, two = C.foldPanelStates(C.diagramForPath(d, 'two')).r;
  assert.equal(one.length, 3); assert.equal(two.length, 2);
  assert.equal(one[0].focus, 'r1'); assert.equal(one[0].reads.length, 1);
  assert.equal(one[1].reads.length, 7); assert.equal(one[1].showDepth, false, 'enterOnce applies to its own step');
  assert.equal(one[2].showDepth, true, 'enterOnce does not carry'); assert.equal(one[2].focus, null); assert.equal(one[2].marks.length, 1);
  assert.equal(two[1].reads.length, 1, 'an invalid reads patch leaves the carried snapshot'); assert.equal(two[1].inserts.length, 1); assert.equal(two[1].focus, 'r1');
  assert.equal(two[1].marks, undefined);
  one.forEach(state => C.readsHTML(d.panels[0], state));
  model(d.panels[0], two[1]);
  assert.equal(JSON.stringify(d), before);
  const collected = C.patchFieldsCollect(C.panelPatchFields(d.panels[0]), {focus:'r2', showDepth:'false', reads:'[{"id":"q","at":101,"seq":"AC"}]'});
  assert.equal(collected.error, undefined);
  assert.deepEqual(plain(collected.item), {focus:'r2', showDepth:false, reads:[{id:'q', at:101, seq:'AC'}]});
});

test('an insertion longer than 24 letters is skipped, matching its validation warning; a long read is truncated as warned', () => {
  const p = {...plain(C.PANEL_TEMPLATES.reads), id:'aln', type:'reads'};
  const start = p.start || 1;
  const state = {reads:[{id:'ok', at:start, seq:'ACGT'},{id:'long', at:start, seq:'A'.repeat(241)}],
    inserts:[{read:'ok', after:start + 1, seq:'GG'},{read:'ok', after:start + 1, seq:'G'.repeat(25)}]};
  const m = model(p, state);
  assert.equal(m.inserts.length, 1);
  assert.equal(m.inserts[0].seq, 'GG');
  const long = m.rows.find(row => row.id === 'long');
  assert.ok(long, 'the long read still renders');
  assert.equal(long.length, 240);
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...p, initial:state}]};
  const w = plain(C.validate(C.normalize(d))).warnings.join('\n');
  assert.match(w, /reads\[1\]\.seq: only the first 240 letters render/);
  assert.match(w, /inserts\[1\]\.seq: expected 1–24 inserted dna letters — insertion skipped/);
  assert.doesNotMatch(C.readsHTML(p, state), /G{25}/);
});
