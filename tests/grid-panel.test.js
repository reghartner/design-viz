'use strict';
process.env.FLOWVIEW_PACKAGES = 'science';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
const panel = () => ({id:'g', type:'grid', title:'Enrichment', decimals:1, unit:'log2',
  rows:[{id:'early',label:'Early'},{id:'late',label:'Late'}], cols:[{id:'a',label:'Motif A'},{id:'b',label:'Motif B'}],
  initial:{cells:{'early.a':1, 'early.b':2}, marks:{'early.b':'*'}}});
const diagram = (steps, paths, p) => ({nodes:{n:{}}, rows:[['n']], panels:[p || panel()], steps, ...(paths ? {paths} : {})});
const folded = (d, pathId) => C.foldPanelStates(pathId ? C.diagramForPath(d, pathId) : d).g;
const intensities = m => plain(m.rows.map(row => row.cells.map(cell => cell.intensity)));

test('grid template, picker example, feature label, styles and registry metadata use ordinary discovery', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...plain(C.PANEL_TEMPLATES.grid), id:'g', type:'grid'}]};
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(item => item.type === 'grid' && item.category === 'Science & sequencing'));
  const example = C.panelPickerExample('grid');
  assert.equal(example.panel.type, 'grid');
  assert.deepEqual(validate({nodes:{n:{}}, rows:[['n']], panels:[example.panel]}), {errors:[], warnings:[]});
  const html = C.gridHTML(example.panel, example.state);
  assert.match(html, /grid-hl-cell/); assert.match(html, /<sup class="grid-mark">\*\*\*<\/sup>/); assert.match(html, /grid-mark-ns/); assert.match(html, /grid-unknown/);
  assert.equal(panelAssets().features['panel.grid'].label, 'Value matrix panel');
  assert.equal(panelAssets().features['panel.grid'].since, '0.2.0');
  const css = readStyles('style.core.css');
  assert.match(css, /\.grid-cell\{/); assert.match(css, /color-mix\(in srgb,var\(--grid-high\)/); assert.match(css, /prefers-reduced-motion/);
  const source = fs.readFileSync(path.join(__dirname, '../packages/science/panels/types/grid.js'), 'utf8');
  assert.doesNotMatch(source, /\.bio-tone-[a-z]*\s*\{/); assert.doesNotMatch(source, /document\.|setTimeout|fetch\(/);
  assert.equal(C.PanelRegistry.get('grid').order, 45); assert.equal(C.panelAuthoring('grid').picker.order, 45);
  assert.deepEqual(plain(C.PanelRegistry.get('grid').layout.sectionSizing), {minWidth:240, preferredWidth:380, maxWidth:700, aspectPolicy:'content', grow:1});
});
test('model formats values, scales intensity automatically when bounds are absent, and never yields NaN', () => {
  const m = C.gridModel(panel(), {cells:{'early.a':1, 'early.b':3, 'late.a':2}, marks:{'early.b':'**'}, highlight:{row:'late', col:'b', cell:'early.a'}});
  assert.deepEqual(plain(m.scale), {kind:'sequential', min:1, max:3, mid:2, auto:true});
  assert.deepEqual(intensities(m), [[0, 1], [0.5, 0]]);
  assert.deepEqual(plain(m.rows[0].cells.map(c => [c.text, c.mark, c.known, c.side, c.depth])), [['1.0','',true,'high',0], ['3.0','**',true,'high',1]]);
  assert.equal(m.rows[1].cells[1].text, '—'); assert.equal(m.rows[1].cells[1].known, false);
  assert.equal(m.rows[0].cells[0].highlight, true); assert.equal(m.rows[1].highlight, true); assert.equal(m.cols[1].highlight, true);
  assert.equal(m.rows[1].cells[0].rowHighlight, true); assert.equal(m.rows[0].cells[1].colHighlight, true); assert.equal(m.unit, 'log2'); assert.equal(m.decimals, 1);
  const authored = C.gridModel({...panel(), scale:{min:0, max:4}}, {cells:{'early.a':2, 'late.b':9, 'early.b':-5}});
  assert.deepEqual(plain(authored.scale), {kind:'sequential', min:0, max:4, mid:2, auto:false});
  assert.deepEqual(intensities(authored), [[0.5, 0], [0, 1]], 'values outside authored bounds clamp');
  const partial = C.gridModel({...panel(), scale:{min:0}}, {cells:{'early.a':2, 'late.b':4}});
  assert.deepEqual(plain(partial.scale), {kind:'sequential', min:0, max:4, mid:2, auto:true});
  for (const state of [{}, {cells:null}, {cells:{'early.a':null}}, {cells:{'early.a':NaN, 'late.b':Infinity}}, null, 'x', []]) {
    const empty = C.gridModel(panel(), state);
    assert.deepEqual(plain(empty.scale), {kind:'sequential', min:0, max:1, mid:0.5, auto:true});
    assert.deepEqual(intensities(empty), [[0, 0], [0, 0]]);
    assert.ok(empty.rows.every(row => row.cells.every(cell => Number.isFinite(cell.intensity) && Number.isFinite(cell.depth))));
    assert.doesNotMatch(C.gridHTML(panel(), state), /NaN|Infinity|undefined/);
  }
  const flat = C.gridModel(panel(), {cells:{'early.a':7, 'early.b':7, 'late.a':7, 'late.b':7}});
  assert.deepEqual(intensities(flat), [[0.5, 0.5], [0.5, 0.5]], 'identical values sit mid-scale instead of dividing by zero');
  const inverted = C.gridModel({...panel(), scale:{min:5, max:1}}, {cells:{'early.a':2, 'late.b':4}});
  assert.deepEqual(plain(inverted.scale), {kind:'sequential', min:2, max:4, mid:3, auto:true});
});
test('diverging scales split at the midpoint or an authored mid and colour each side separately', () => {
  const m = C.gridModel({...panel(), scale:{min:-2, max:2, kind:'diverging'}}, {cells:{'early.a':-2, 'early.b':0, 'late.a':1, 'late.b':2}});
  assert.equal(m.scale.mid, 0);
  assert.deepEqual(intensities(m), [[0, 0.5], [0.75, 1]]);
  assert.deepEqual(plain(m.rows.map(row => row.cells.map(cell => [cell.side, cell.depth]))), [[['low',1], ['high',0]], [['high',0.5], ['high',1]]]);
  const mid = C.gridModel({...panel(), scale:{min:0, max:10, mid:2, kind:'diverging'}}, {cells:{'early.a':1, 'early.b':2, 'late.a':6, 'late.b':10}});
  assert.equal(mid.scale.mid, 2);
  assert.deepEqual(intensities(mid), [[0.25, 0.5], [0.75, 1]]);
  const auto = C.gridModel({...panel(), scale:{kind:'diverging'}}, {cells:{'early.a':-1, 'late.b':3}});
  assert.deepEqual(plain(auto.scale), {kind:'diverging', min:-1, max:3, mid:1, auto:true});
  assert.deepEqual(intensities(auto), [[0, 0], [0, 1]]);
  const badMid = C.gridModel({...panel(), scale:{min:0, max:4, mid:9, kind:'diverging'}}, {cells:{'early.a':2}});
  assert.equal(badMid.scale.mid, 2); assert.equal(badMid.rows[0].cells[0].intensity, 0.5);
  const html = C.gridHTML({...panel(), scale:{min:-2, max:2, kind:'diverging'}}, {cells:{'early.a':-2, 'late.b':2}});
  assert.match(html, /grid-table grid-diverging/); assert.match(html, /grid-cell grid-low grid-deep" style="--grid-d:1\.000"/);
  assert.match(html, /grid-cell grid-high grid-deep" style="--grid-d:1\.000"/); assert.match(html, /grid-ramp grid-ramp-diverging/);
  assert.match(validate(diagram([], null, {...panel(), scale:{min:0, max:4, mid:9, kind:'diverging'}})).warnings.join('\n'), /panels\[0\]\.scale\.mid: must lie strictly between/);
});
test('cells and marks merge sparsely across steps; null forgets a key; null fields clear all; enterOnce never persists', () => {
  const d = diagram([
    {id:'s0', panels:{g:{cells:{'late.a':3}, highlight:{row:'early'}}}},
    {id:'s1', panels:{g:{marks:{'late.a':'***'}, enterOnce:{cells:{'early.a':9}, marks:{'early.b':'ns'}, highlight:{cell:'early.a'}}}}},
    {id:'s2', panels:{g:{cells:{'early.a':null}, marks:{'early.b':null}, note:'kept'}}},
    {id:'s3', panels:{g:{cells:null, marks:null, highlight:null}}},
    {id:'s4', panels:{g:{cells:{'late.b':4}, marks:{'late.b':''}}}},
  ]);
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  const before = JSON.stringify(d), states = folded(d);
  assert.deepEqual(plain(states.map(s => [s.cells, s.marks, s.highlight])), [
    [{'early.a':1, 'early.b':2, 'late.a':3}, {'early.b':'*'}, {row:'early'}],
    [{'early.a':9, 'early.b':2, 'late.a':3}, {'early.b':'ns', 'late.a':'***'}, {cell:'early.a'}],
    [{'early.b':2, 'late.a':3}, {'late.a':'***'}, {row:'early'}],
    [{}, {}, null],
    [{'late.b':4}, {'late.b':''}, null],
  ]);
  assert.equal(states[4].note, 'kept');
  assert.equal(JSON.stringify(d), before, 'folding never mutates the spec');
  const empty = C.foldPanelStates({panels:[panel()], steps:[]}).g;
  assert.deepEqual(plain([empty[0].cells, empty[0].marks]), [{'early.a':1, 'early.b':2}, {'early.b':'*'}]);
  assert.equal(C.gridModel(panel(), states[4]).rows[1].cells[1].mark, '');
});
test('alternate paths fold independently: a patch on path two never reaches path one', () => {
  const d = diagram([
    {id:'start', panels:{g:{cells:{'late.a':3}}}},
    {id:'enriched', panels:{g:{cells:{'late.b':5}, marks:{'late.b':'***'}, highlight:{cell:'late.b'}}}},
    {id:'depleted', panels:{g:{cells:{'late.b':-5, 'early.a':null}, marks:{'late.b':'*'}, enterOnce:{highlight:{col:'b'}}}}},
    {id:'finish', panels:{g:{note:'done'}}},
  ], [{id:'one', label:'Enriched', steps:['start','enriched','finish']}, {id:'two', label:'Depleted', steps:['start','depleted','finish']}]);
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  const one = folded(d, 'one'), two = folded(d, 'two');
  assert.deepEqual(plain(one.map(s => s.cells)), [{'early.a':1, 'early.b':2, 'late.a':3}, {'early.a':1, 'early.b':2, 'late.a':3, 'late.b':5}, {'early.a':1, 'early.b':2, 'late.a':3, 'late.b':5}]);
  assert.deepEqual(plain(two.map(s => s.cells)), [{'early.a':1, 'early.b':2, 'late.a':3}, {'early.b':2, 'late.a':3, 'late.b':-5}, {'early.b':2, 'late.a':3, 'late.b':-5}]);
  assert.deepEqual(plain(one[2].marks), {'early.b':'*', 'late.b':'***'}); assert.deepEqual(plain(two[2].marks), {'early.b':'*', 'late.b':'*'});
  assert.deepEqual(plain(one[2].highlight), {cell:'late.b'}); assert.deepEqual(plain(two[1].highlight), {col:'b'}); assert.equal(two[2].highlight, undefined);
  assert.equal(C.gridModel(panel(), one[2]).rows[1].cells[1].intensity, 1);
  assert.equal(C.gridModel(panel(), two[2]).rows[1].cells[1].intensity, 0);
});
test('warnings name exact declaration, initial, step and enterOnce paths and never throw on hostile input', () => {
  const p = panel();
  p.rows.push({id:'__proto__'}, {id:'early'}, {id:'x.y'}, {id:''}, 7, {id:'lbl', label:{}});
  p.cols = [{id:'a', label:'Motif A'}, {id:'b'}];
  p.scale = {min:'0', max:1, mid:NaN, kind:'rainbow', extra:1}; p.decimals = 9; p.unit = 4;
  p.initial = {cells:{'early.a':'1', 'nope.a':1}, marks:{'early.a':'****'}, highlight:{row:'nope', col:'zz', cell:'early.zz', other:1}, note:1};
  const d = diagram([{id:'s0', panels:{g:{cells:[1], marks:'x', highlight:'cell', bogus:1, enterOnce:{cells:{'late.b':Infinity}, marks:{'late.b':null, 'late.q':'*'}, highlight:{cell:'late.b', row:null}}}}}], null, p);
  const w = validate(d).warnings.join('\n');
  for (const expected of [
    'panels[0].rows[2].id: use letters', 'panels[0].rows[3].id: duplicate id "early"', 'panels[0].rows[4].id: use letters', 'panels[0].rows[5].id: needs a non-empty string',
    'panels[0].rows[6].id: needs a non-empty string', 'panels[0].rows[7].label: expected text',
    'panels[0].scale.min: expected a finite number', 'panels[0].scale.mid: expected a finite number', 'panels[0].scale.kind: expected sequential or diverging',
    'panels[0].scale.extra: unknown scale field', 'panels[0].decimals: expected a whole number 0–4', 'panels[0].unit: expected text',
    'panels[0].initial.cells.early.a: expected a finite number or null', 'panels[0].initial.cells.nope.a: unknown cell key', 'panels[0].initial.marks.early.a: expected one of',
    'panels[0].initial.highlight.row: unknown row id', 'panels[0].initial.highlight.col: unknown column id', 'panels[0].initial.highlight.cell: unknown cell key',
    'panels[0].initial.highlight.other: unknown highlight field', 'panels[0].initial.note: expected text',
    'steps[0].panels.g.cells: expected an object keyed "<rowId>.<colId>"', 'steps[0].panels.g.marks: expected an object keyed', 'steps[0].panels.g.highlight: expected {row?,col?,cell?}',
    'steps[0].panels.g.bogus: unknown field', 'steps[0].panels.g.enterOnce.cells.late.b: expected a finite number', 'steps[0].panels.g.enterOnce.marks.late.q: unknown cell key',
  ]) assert.ok(w.includes(expected), `missing warning: ${expected}\n${w}`);
  assert.doesNotMatch(w, /steps\[0\]\.panels\.g\.enterOnce\.highlight|enterOnce\.marks\.late\.b/);
  assert.deepEqual(validate(d).errors, []);
  const states = folded(d);
  assert.deepEqual(plain([states[0].cells, states[0].marks]), [{}, {}], 'invalid initial entries are skipped and a malformed patch leaves carried values alone');
  assert.deepEqual(plain(states[0].highlight), {cell:'late.b', row:null});
  assert.equal(C.gridModel(p, states[0]).rows.length, 3);
  assert.deepEqual(plain(C.gridModel(p, {})).scale, {kind:'sequential', min:0, max:1, mid:0.5, auto:true});
  for (const axis of [undefined, null, 'x', [], Array.from({length:13}, (_, i) => ({id:'r'+i}))]) {
    const q = panel(); q.rows = axis;
    assert.ok(validate(diagram([], null, q)).warnings.some(line => /panels\[0\]\.rows: /.test(line)));
    assert.doesNotMatch(C.gridHTML(q, {cells:{'r0.a':1}}), /NaN|Infinity|undefined/);
  }
  for (const scale of [null, 'x', [], {min:Infinity}, {max:-Infinity}, {min:1e308, max:-1e308}])
    assert.doesNotMatch(C.gridHTML({...panel(), scale}, {cells:{'early.a':1e308, 'late.b':-1e308}}), /NaN|Infinity|undefined/);
  assert.match(validate(diagram([{id:'s0', panels:{g:'x'}}])).warnings.join('\n'), /steps\[0\]\.panels\.g: patch must be an object/);
});
test('every authored string is escaped and hostile ids, labels, units and notes cannot smuggle markup', () => {
  const p = panel(); p.title = HOSTILE; p.unit = HOSTILE; p.rows[0].label = HOSTILE; p.cols[1].label = HOSTILE; p.rows.push({id:HOSTILE, label:'bad'});
  const html = C.gridHTML(p, {cells:{'early.a':1}, marks:{'early.a':HOSTILE}, highlight:{row:HOSTILE}, note:HOSTILE});
  assert.doesNotMatch(html, /<img|onclick="bad|onerror=bad\(\)>/);
  assert.match(html, /&lt;img src=x onerror=bad\(\)&gt;&quot; onclick=&quot;bad\(\)/);
  assert.match(html, /class="swnote">&lt;img/); assert.doesNotMatch(html, /<sup class="grid-mark">&lt;/);
  assert.equal(C.gridModel(p, {}).rows.length, 2, 'the hostile row id is skipped');
  assert.match(html, /aria-label="&lt;img src=x onerror=bad\(\)&gt;&quot; onclick=&quot;bad\(\): 2 rows by 2 columns/);
});
test('rendered table keeps real header semantics, scrolls inside the card and typed authoring collects cells', () => {
  const html = C.gridHTML(panel(), {cells:{'early.a':1, 'late.b':2}, highlight:{row:'late', col:'a'}});
  assert.match(html, /<div class="grid-wrap panel-fill-scroll" tabindex="0" role="region" aria-label="Enrichment">/);
  assert.match(html, /<th scope="col" class="grid-colhead grid-hl" title="Motif A">Motif A<\/th>/);
  assert.match(html, /<tr class="grid-row grid-rowhl"><th scope="row" class="grid-rowhead grid-hl" title="Late">Late<\/th>/);
  assert.match(html, /grid-cell grid-high grid-deep grid-hl-row" style="--grid-d:1\.000" title="Late × Motif B: 2\.0 log2"/);
  assert.match(html, /grid-cell grid-high grid-unknown grid-hl-row grid-hl-col" style="--grid-d:0\.000" title="Late × Motif A: no value"/);
  assert.match(html, /grid-cell grid-high grid-hl-col" style="--grid-d:0\.000" title="Early × Motif A: 1\.0 log2"/);
  assert.match(html, /<div class="grid-key" aria-hidden="true"><span>1\.0 log2<\/span>.*<span>2\.0 log2<\/span><em>auto<\/em>/);
  const collected = C.patchFieldsCollect(C.panelPatchFields(panel()), {cells:'{"early.a": 0.5}', marks:'null', highlight:'{"cell":"early.a"}', note:'Half'});
  assert.equal(collected.error, undefined); assert.deepEqual(plain(collected.item), {cells:{'early.a':0.5}, marks:null, highlight:{cell:'early.a'}, note:'Half'});
  assert.match(C.patchFieldsCollect(C.panelPatchFields(panel()), {cells:'[1]'}).error || '', /JSON object or null/);
  assert.equal(C.PanelRegistry.get('grid').render({}, panel(), {cells:{'early.a':1}}).html, C.gridHTML(panel(), {cells:{'early.a':1}}));
});
