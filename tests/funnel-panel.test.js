'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js'])
  vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ≈ ${b}`);
const HOSTILE = '<img src=x onerror=bad()>" onclick="bad()';
const panel = () => ({id:'f', type:'funnel', title:'Read filtering', unit:'reads',
  stages:[{id:'raw',label:'Raw reads'},{id:'qc',label:'Passed QC'},{id:'aligned',label:'Aligned',tone:'accent'},{id:'dedup',label:'Deduplicated'}],
  initial:{counts:{raw:1000000}}});
const diagram = (steps, paths) => ({nodes:{n:{}}, rows:[['n']], panels:[panel()], steps, ...(paths ? {paths} : {})});
const folded = (d, path) => C.foldPanelStates(path ? C.diagramForPath(d, path) : d).f;

test('funnel template, picker example, feature label and styles use ordinary discovery', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...plain(C.PANEL_TEMPLATES.funnel), id:'f', type:'funnel'}]};
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(item => item.type === 'funnel' && item.category === 'Science & sequencing'));
  const example = C.panelPickerExample('funnel');
  assert.equal(example.panel.type, 'funnel');
  assert.deepEqual(validate({nodes:{n:{}}, rows:[['n']], panels:[example.panel]}), {errors:[], warnings:[]});
  assert.match(C.funnelHTML(example.panel, example.state), /funnel-active/);
  assert.equal(panelAssets().features['panel.funnel'].label, 'Stage counts panel');
  assert.equal(panelAssets().features['panel.funnel'].since, '0.2.0');
  const css = readStyles('style.core.css');
  assert.match(css, /\.funnel-row/); assert.match(css, /\.funnel-bar\.dv-bar-enter/); assert.match(css, /prefers-reduced-motion/);
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/panels/types/funnel.js'), 'utf8');
  assert.doesNotMatch(source, /\.bio-tone-[a-z]*\s*\{/, 'the sequence panel owns the shared tone colours');
  assert.doesNotMatch(source, /document\.|setTimeout|fetch\(/);
  assert.equal(C.PanelRegistry.get('funnel').order, 44);
  assert.equal(C.panelAuthoring('funnel').picker.order, 44);
  assert.deepEqual(plain(C.PanelRegistry.get('funnel').layout.sectionSizing), {minWidth:240, preferredWidth:360, maxWidth:600, aspectPolicy:'content', grow:1});
});
test('model reports retained share, drops between known stages, growth and unknown counts', () => {
  const m = C.funnelModel(panel(), {counts:{raw:1000000, qc:900000, dedup:450000}, active:'aligned'});
  assert.equal(m.total, 1000000); assert.equal(m.remaining, 450000); near(m.retainedPct, 45); assert.equal(m.unit, 'reads');
  assert.deepEqual(plain(m.rows.map(r => [r.id, r.count, r.known, r.active])),
    [['raw',1000000,true,false],['qc',900000,true,false],['aligned',null,false,true],['dedup',450000,true,false]]);
  near(m.rows[1].pct, 90); assert.equal(m.rows[1].dropped, 100000); near(m.rows[1].droppedPct, 10);
  assert.equal(m.rows[2].pct, null); assert.equal(m.rows[2].barPct, 0);
  assert.equal(m.rows[3].dropped, 450000, 'drop is measured against the previous KNOWN stage'); near(m.rows[3].droppedPct, 50);
  near(m.rows[0].barPct, 100); near(m.rows[3].barPct, 45);
  const html = C.funnelHTML(panel(), {counts:{raw:1000000, qc:900000, dedup:450000}, active:'aligned'});
  assert.match(html, /−100,000<\/b><span>\(−10\.0%\)/); assert.match(html, /funnel-row funnel-active funnel-unknown/);
  assert.match(html, /<span class="funnel-count">—<\/span>/); assert.doesNotMatch(html, /bio-tone/);
  assert.match(C.funnelHTML(panel(), {counts:{raw:10, aligned:5}}), /funnel-bar bio-tone-accent" style="width:50\.000%"/);
  assert.match(html, /1,000,000 reads in/); assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});
test('a count larger than the previous known count is flagged grew, never a negative drop', () => {
  const m = C.funnelModel(panel(), {counts:{raw:100, qc:80, aligned:120, dedup:90}});
  const grown = m.rows[2];
  assert.equal(grown.grew, true); assert.equal(grown.gained, 40); near(grown.gainedPct, 50);
  assert.equal(grown.dropped, null); assert.equal(grown.droppedPct, null); near(grown.pct, 120); near(grown.barPct, 100);
  near(m.rows[0].barPct, 100/120*100);
  assert.equal(m.rows[3].dropped, 30); near(m.rows[3].droppedPct, 25);
  const html = C.funnelHTML(panel(), {counts:{raw:100, qc:80, aligned:120, dedup:90}});
  assert.match(html, /funnel-delta funnel-grew" aria-hidden="true"><b>\+40<\/b><span>\(\+50\.0%\)<\/span><i>grew<\/i>/);
  assert.doesNotMatch(html, /−-|−−|-40/);
  const zero = C.funnelModel(panel(), {counts:{raw:0, qc:0, aligned:5}});
  assert.equal(zero.rows[1].pct, 100); assert.equal(zero.rows[1].droppedPct, 0); assert.equal(zero.rows[2].pct, null);
  assert.equal(zero.rows[2].grew, true); assert.equal(zero.rows[2].gainedPct, null);
  assert.doesNotMatch(C.funnelHTML(panel(), {counts:{raw:0, qc:0, aligned:5}}), /NaN|Infinity/);
});
test('counts merge sparsely across steps; null forgets a stage; counts:null clears all; enterOnce never persists', () => {
  const d = diagram([
    {id:'s0', panels:{f:{counts:{qc:900000}}}},
    {id:'s1', panels:{f:{counts:{aligned:800000}, active:'dedup', enterOnce:{counts:{raw:5, dedup:1}, note:'brief'}}}},
    {id:'s2', panels:{f:{counts:{qc:null}, note:'kept'}}},
    {id:'s3', panels:{f:{counts:null, active:null}}},
    {id:'s4', panels:{f:{counts:{dedup:700000}}}},
  ]);
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  const before = JSON.stringify(d), states = folded(d);
  assert.deepEqual(plain(states.map(s => s.counts)), [
    {raw:1000000, qc:900000},
    {raw:5, qc:900000, aligned:800000, dedup:1},
    {raw:1000000, aligned:800000},
    {},
    {dedup:700000},
  ]);
  assert.equal(states[1].note, 'brief'); assert.equal(states[2].note, 'kept'); assert.equal(states[1].active, 'dedup');
  assert.equal(states[3].active, null); assert.equal(states[4].note, 'kept');
  assert.equal(JSON.stringify(d), before, 'folding never mutates the spec');
  assert.equal(C.funnelModel(panel(), states[4]).rows[3].pct, 100, 'the first known count anchors the share');
  const empty = C.foldPanelStates({panels:[panel()], steps:[]}).f;
  assert.deepEqual(plain(empty[0].counts), {raw:1000000});
});
test('alternate paths fold independently: a patch on path two never reaches path one', () => {
  const d = diagram([
    {id:'start', panels:{f:{counts:{qc:900000}}}},
    {id:'strict', panels:{f:{counts:{aligned:500000}, active:'aligned'}}},
    {id:'lenient', panels:{f:{counts:{aligned:850000, qc:null}, enterOnce:{active:'qc'}}}},
    {id:'finish', panels:{f:{counts:{dedup:400000}}}},
  ], [{id:'a', label:'Strict', steps:['start','strict','finish']}, {id:'b', label:'Lenient', steps:['start','lenient','finish']}]);
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  const a = folded(d, 'a'), b = folded(d, 'b');
  assert.deepEqual(plain(a.map(s => s.counts)), [{raw:1000000, qc:900000}, {raw:1000000, qc:900000, aligned:500000}, {raw:1000000, qc:900000, aligned:500000, dedup:400000}]);
  assert.deepEqual(plain(b.map(s => s.counts)), [{raw:1000000, qc:900000}, {raw:1000000, aligned:850000}, {raw:1000000, aligned:850000, dedup:400000}]);
  assert.equal(a[2].active, 'aligned'); assert.equal(b[1].active, 'qc'); assert.equal(b[2].active, undefined);
  assert.equal(C.funnelModel(panel(), a[2]).rows[3].dropped, 100000);
  assert.equal(C.funnelModel(panel(), b[2]).rows[3].dropped, 450000);
});
test('warnings name exact declaration, initial, step and enterOnce paths and never throw on hostile input', () => {
  const d = diagram([{id:'s0', panels:{f:{counts:{nope:1, qc:-1, raw:1.5, aligned:Infinity}, active:'nope', extra:true, enterOnce:{counts:[1], active:7, note:{}}}}}]);
  const p = d.panels[0];
  p.stages.push({id:'__proto__'}, {id:'qc'}, {id:'', label:'x'}, null, {id:'a.b'}, {id:'tone', tone:'loud'}, {id:'lbl', label:4});
  p.unit = 9; p.initial = {counts:{raw:'1', qc:10}, active:'missing', note:3};
  const w = validate(d).warnings.join('\n');
  for (const expected of [
    'panels[0].stages[4].id: use letters', 'panels[0].stages[5].id: duplicate id "qc"', 'panels[0].stages[6].id: needs a non-empty string',
    'panels[0].stages[7].id: needs a non-empty string', 'panels[0].stages[8].id: use letters', 'panels[0].stages[9].tone: expected',
    'panels[0].stages[10].label: expected text', 'panels[0].unit: expected a non-empty item noun',
    'panels[0].initial.counts.raw: expected a non-negative whole number or null', 'panels[0].initial.active: expected a declared stage id or null',
    'panels[0].initial.note: expected text or null',
    'steps[0].panels.f.counts.nope: unknown stage id', 'steps[0].panels.f.counts.qc: expected a non-negative whole number',
    'steps[0].panels.f.counts.raw: expected a non-negative whole number', 'steps[0].panels.f.counts.aligned: expected a non-negative whole number',
    'steps[0].panels.f.active: expected a declared stage id', 'steps[0].panels.f.extra: unknown field',
    'steps[0].panels.f.enterOnce.counts: expected an object keyed by stage id', 'steps[0].panels.f.enterOnce.active: expected a declared stage id',
    'steps[0].panels.f.enterOnce.note: expected text',
  ]) assert.ok(w.includes(expected), `missing warning: ${expected}\n${w}`);
  assert.deepEqual(validate(d).errors, []);
  const states = folded(d);
  assert.deepEqual(plain(states[0].counts), {qc:10}, 'invalid entries are skipped and carried counts stay');
  assert.equal(states[0].active, undefined);
  for (const stages of [undefined, null, 'x', [], [{id:'one'}], Array.from({length:13}, (_, i) => ({id:'s'+i}))]) {
    const q = panel(); q.stages = stages;
    assert.ok(validate({nodes:{n:{}}, rows:[['n']], panels:[q]}).warnings.some(line => /panels\[0\]\.stages: /.test(line)));
    assert.doesNotMatch(C.funnelHTML(q, {counts:{one:1}}), /NaN|Infinity|undefined/);
  }
  for (const state of [null, 7, 'x', [], {counts:'x'}, {counts:{raw:Number.MAX_VALUE}}, {active:{}}, {note:['x']}])
    assert.doesNotMatch(C.funnelHTML(panel(), state), /NaN|Infinity|undefined/);
  assert.match(validate(diagram([{id:'s0', panels:{f:[1]}}])).warnings.join('\n'), /steps\[0\]\.panels\.f: patch must be an object/);
});
test('every authored string is escaped and hostile ids cannot smuggle markup or attributes', () => {
  const p = panel(); p.unit = HOSTILE; p.stages[0].label = HOSTILE; p.stages[1].tone = HOSTILE; p.title = HOSTILE;
  const html = C.funnelHTML(p, {counts:{raw:10, qc:8}, active:'qc', note:HOSTILE});
  assert.doesNotMatch(html, /<img|onclick="bad|onerror=bad\(\)>/); assert.match(html, /&lt;img src=x onerror=bad\(\)&gt;&quot; onclick=&quot;bad\(\)/);
  assert.doesNotMatch(html, /bio-tone-&lt;|bio-tone-</); assert.match(html, /class="swnote">&lt;img/);
  const hostileIds = panel(); hostileIds.stages = [{id:'ok'}, {id:HOSTILE}];
  assert.doesNotMatch(C.funnelHTML(hostileIds, {counts:{ok:1}}), /<img/);
  assert.equal(C.funnelModel(hostileIds, {counts:{ok:1}}).rows.length, 1);
});
test('render describes bar entrance for newly known stages and typed authoring collects counts', () => {
  const host = {};
  const first = C.PanelRegistry.get('funnel').render(host, panel(), {counts:{raw:10}});
  assert.equal(first.enterBars.entrants, null); assert.equal(first.enterBars.rows, '.funnel-row'); assert.equal(first.enterBars.bar, '.funnel-bar');
  const second = C.PanelRegistry.get('funnel').render(host, panel(), {counts:{raw:10, qc:8}});
  assert.deepEqual(second.enterBars.entrants, [false, true, false, false]);
  assert.match(second.html, /funnel-bar" style="width:80\.000%"/);
  const fields = plain(C.panelPatchFields(panel()));
  assert.ok(fields.some(field => field[0] === 'active' && field[1] === 'enum' && field[2].includes('dedup')));
  const collected = C.patchFieldsCollect(C.panelPatchFields(panel()), {counts:'{"qc": 5}', active:'qc', note:'Half'});
  assert.equal(collected.error, undefined); assert.deepEqual(plain(collected.item), {counts:{qc:5}, active:'qc', note:'Half'});
  assert.match(C.patchFieldsCollect(C.panelPatchFields(panel()), {counts:'[1]'}).error || '', /JSON object or null/);
});
