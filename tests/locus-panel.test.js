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
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
const hostile = '<img src=x onerror=bad()>';
/* Values cross the vm boundary, so deep comparisons use plain JSON copies. */
const ticks = (a, b) => plain(C.locusTicks(a, b));
const model = (p, s) => plain(C.locusModel(p, s));
const assign = f => plain(C.locusAssignRows(f));
const panel = () => ({id:'g', type:'locus', length:10000, unit:'bp', label:'region', features:[
  {id:'a', label:'gene A', from:1000, to:4000, strand:'+'},
  {id:'b', label:'gene B', from:5000, to:8000, strand:'-', tone:'accent'},
  {id:'c', label:'small', from:9000, to:9050}]});
const diagram = () => ({nodes:{n:{}}, rows:[['n']], panels:[panel()], steps:[{id:'a', nodes:['n'], panels:{g:{markers:[{id:'m', at:2500, label:'SNP', tone:'mismatch'}]}}}]});

test('locus template, picker example, feature label and styles use ordinary discovery', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...plain(C.PANEL_TEMPLATES.locus), id:'t', type:'locus'}]};
  assert.deepEqual(validate(d), {errors:[], warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'locus');
  assert.equal(entry.category, 'Science & sequencing'); assert.equal(entry.name, 'Genome map');
  const sample = C.panelPickerExample('locus');
  assert.deepEqual(validate({nodes:{n:{}}, rows:[['n']], panels:[plain(sample.panel)]}), {errors:[], warnings:[]});
  const sampleModel = model(sample.panel, sample.state);
  assert.ok(sampleModel.markers.length >= 2 && sampleModel.arcs.length >= 1 && sampleModel.highlightFound && sampleModel.rowCount >= 2);
  assert.deepEqual(panelAssets().features['panel.locus'], {label:'Genome map panel', since:'0.2.0'});
  assert.match(readStyles('style.core.css'), /\.locus-map\{/);
  assert.equal(C.PanelRegistry.get('locus').order, 43);
  assert.deepEqual(plain(C.PanelRegistry.get('locus').layout.sectionSizing), {minWidth:360, preferredWidth:600, maxWidth:1000, aspectPolicy:'content', grow:1});
});
test('ruler ticks are nice multiples, never more than ten and usually five to ten', () => {
  assert.deepEqual(ticks(1, 100), [20, 40, 60, 80, 100]);
  assert.deepEqual(ticks(1, 10), [2, 4, 6, 8, 10]);
  assert.deepEqual(ticks(1, 1), [1]);
  assert.deepEqual(ticks(7, 7), [7]);
  assert.deepEqual(ticks(5, 4), []);
  assert.deepEqual(ticks(1, 48000), [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000]);
  assert.deepEqual(ticks(1, 10000000000), [2e9, 4e9, 6e9, 8e9, 1e10]);
  for (const span of [10, 11, 17, 22, 23, 37, 49, 50, 99, 101, 250, 999, 1000, 1234, 4321, 65536, 1e6, 7.5e6, 1e8 + 3]) {
    for (const from of [1, 13, 999]) {
      const list = ticks(from, from + span - 1);
      assert.ok(list.length >= 4 && list.length <= 10, `span ${span} from ${from}: ${list.length} ticks`);
      list.forEach(at => assert.ok(Number.isInteger(at) && at >= from && at <= from + span - 1, `tick ${at} inside ${from}–${from + span - 1}`));
      const step = list[1] - list[0];
      assert.ok([1, 2, 2.5, 5].some(m => Math.abs(step / m / Math.pow(10, Math.floor(Math.log10(step / m) + 1e-9)) - 1) < 1e-9), `step ${step} is nice`);
      assert.ok(list.every((at, i) => i === 0 || at - list[i - 1] === step), 'ticks are evenly spaced');
    }
  }
  assert.ok(ticks(1, 10).every(at => at % 2 === 0));
  assert.ok(ticks(2000, 2049).every(at => at % 10 === 0));
});
test('rows are assigned first-fit without overlap, honouring explicit rows and flagging a crowded fifth feature', () => {
  const f = (id, from, to, row) => ({id, label:id, from, to, tone:'feature', strand:'', row:row === undefined ? null : row});
  assert.deepEqual(assign([f('a',1,10), f('b',20,30), f('c',31,40)]).map(r => r.row), [0, 0, 0]);
  assert.deepEqual(assign([f('a',1,10), f('b',10,20), f('c',5,6), f('d',1,100), f('e',3,4)]), [
    {row:0, crowded:false}, {row:1, crowded:false}, {row:1, crowded:false}, {row:2, crowded:false}, {row:1, crowded:false}]);
  assert.deepEqual(assign([f('a',1,10), f('b',1,10), f('c',1,10), f('d',1,10), f('e',1,10)]).map(r => r.row + (r.crowded ? '!' : '')), ['0', '1', '2', '3', '3!']);
  assert.deepEqual(assign([f('a',1,10,2), f('b',1,10), f('c',1,10,2)]), [{row:2, crowded:false}, {row:0, crowded:false}, {row:2, crowded:true}]);
  const decl = {id:'g', type:'locus', length:100, features:[{id:'a', from:1, to:50}, {id:'b', from:1, to:50}, {id:'c', from:1, to:50}, {id:'d', from:1, to:50}, {id:'e', from:2, to:3}, {id:'f', from:61, to:70, row:9}, {id:'h', from:80, to:90, row:1}]};
  const m = model(decl, {});
  assert.deepEqual(m.features.map(x => [x.row, x.crowded]), [[0, false], [1, false], [2, false], [3, false], [3, true], [0, false], [1, false]]);
  assert.equal(m.rowCount, 4);
  assert.equal(m.geometry.trackHeight, 4 * 16 + 3 * 2 + 6);
  assert.equal(m.geometry.height, m.geometry.barBottom + 26);
  assert.equal(model({id:'g', type:'locus', length:100}, {}).rowCount, 1);
  const w = validate({nodes:{n:{}}, rows:[['n']], panels:[decl]}).warnings.join('\n');
  assert.match(w, /panels\[0\]\.features\[5\]\.row: expected an integer 0–3/);
});
test('scale, windows and clipping keep every position inside 0–100 percent', () => {
  const whole = model(panel(), {});
  near(whole.features[0].x, 999 / 10000 * 100); near(whole.features[0].width, 3001 / 10000 * 100);
  assert.deepEqual(whole.window, {from:1, to:10000, span:10000}); assert.equal(whole.zoomed, false);
  const zoom = model(panel(), {window:{from:3000, to:5999}, markers:[{id:'in', at:3000}, {id:'edge', at:5999}, {id:'out', at:6000}]});
  assert.deepEqual(zoom.window, {from:3000, to:5999, span:3000}); assert.equal(zoom.zoomed, true);
  assert.deepEqual(zoom.features.map(f => [f.visible, f.clippedLeft, f.clippedRight]), [[true, true, false], [true, false, true], [false, false, false]]);
  near(zoom.features[0].x, 0); near(zoom.features[0].width, 1001 / 3000 * 100);
  near(zoom.features[1].x, 2000 / 3000 * 100); near(zoom.features[1].x + zoom.features[1].width, 100);
  assert.deepEqual(zoom.markers.map(m => m.visible), [true, true, false]);
  near(zoom.markers[0].x, 0.5 / 3000 * 100); near(zoom.markers[1].x, 2999.5 / 3000 * 100);
  assert.deepEqual(zoom.ticks.map(t => t.at), [3000, 3500, 4000, 4500, 5000, 5500]);
  const one = model(panel(), {window:{from:2500, to:2500}, markers:[{id:'m', at:2500}]});
  assert.deepEqual(one.window, {from:2500, to:2500, span:1});
  near(one.markers[0].x, 50); assert.deepEqual(one.ticks.map(t => t.at), [2500]);
  assert.deepEqual(one.features.map(f => f.visible), [true, false, false]);
  near(one.features[0].x, 0); near(one.features[0].width, 100);
  const outside = model(panel(), {window:{from:20000, to:30000}});
  assert.deepEqual(outside.window, {from:1, to:10000, span:10000});
  const partial = model(panel(), {window:{from:9000, to:30000}});
  assert.deepEqual(partial.window, {from:9000, to:10000, span:1001});
  const tiny = model({id:'g', type:'locus', length:1, features:[{id:'a', from:1, to:1}]}, {markers:[{id:'m', at:1}], arcs:[{id:'x', from:1, to:2}]});
  assert.equal(tiny.valid, true); assert.deepEqual(tiny.ticks.map(t => t.at), [1]); near(tiny.features[0].width, 100); assert.equal(tiny.arcs.length, 0);
  assert.doesNotMatch(C.locusHTML({id:'g', type:'locus', length:1, features:[{id:'a', from:1, to:1}]}, {markers:[{id:'m', at:1}]}), /NaN|Infinity|undefined/);
  const w = validate({nodes:{n:{}}, rows:[['n']], panels:[{...panel(), initial:{window:{from:20000, to:30000}}}], steps:[{id:'s', nodes:['n'], panels:{g:{window:{from:9000, to:30000}, markers:[{id:'far', at:99999}]}}}]}).warnings.join('\n');
  assert.match(w, /panels\[0\]\.initial\.window: range 20000–30000 lies outside 1–10000/);
  assert.match(w, /steps\[0\]\.panels\.g\.window\.to: 30000 is beyond length 10000 — clipped/);
  assert.match(w, /steps\[0\]\.panels\.g\.markers\[0\]\.at: position 99999 is beyond length 10000 — marker skipped/);
});
test('arcs swap reversed ends, label the distance in the declared unit, rise with span and clip to the window', () => {
  const state = {arcs:[{id:'f', from:1000, to:4000}, {id:'r', from:9000, to:2000, label:'loop', tone:'motif'}, {id:'same', from:5, to:5}, {id:'far', from:20000, to:30000}]};
  const m = model({...panel(), unit:'kb'}, state);
  assert.equal(m.arcs.length, 2);
  const [f, r] = m.arcs;
  assert.equal(f.reversed, false); assert.equal(f.label, '3 kb'); assert.equal(f.custom, false); assert.equal(f.distance, 3000);
  assert.equal(r.reversed, true); assert.equal(r.left, 2000); assert.equal(r.right, 9000); assert.equal(r.label, 'loop'); assert.equal(r.distance, 7000); assert.equal(r.tone, 'motif');
  assert.ok(r.apexY < f.apexY, 'the wider arc rises higher');
  assert.ok(f.apexY >= 10 && r.apexY >= 10 && f.apexY < m.geometry.barTop);
  near(f.apexX, (f.x1 + f.x2) / 2);
  assert.match(f.path, /^M[\d.]+ 82 Q[\d.]+ [\d.-]+ [\d.]+ 82$/);
  const geometry = plain(C.locusArcGeometry(100, 300, 0.2, 82, 46));
  near(geometry.apexX, 200); near(geometry.apexY, 82 - 46 * (0.3 + 0.7 * 0.2));
  near(C.locusArcGeometry(0, 1000, 5, 82, 46).apexY, 82 - 46); near(C.locusArcGeometry(0, 0, NaN, 82, 46).apexY, 82 - 46 * 0.3);
  const zoom = model(panel(), {window:{from:3000, to:6000}, arcs:[{id:'f', from:1000, to:4000}, {id:'g', from:5000, to:9000}, {id:'h', from:1000, to:9000}, {id:'out', from:7000, to:8000}]});
  assert.deepEqual(zoom.arcs.map(a => [a.visible, a.clippedLeft, a.clippedRight]), [[true, true, false], [true, false, true], [true, true, true], [false, false, false]]);
  near(zoom.arcs[0].x1, 0); near(zoom.arcs[1].x2, 100); near(zoom.arcs[2].x1, 0); near(zoom.arcs[2].x2, 100);
  assert.ok(zoom.arcs.every(a => a.x1 >= 0 && a.x2 <= 100 && a.x1 <= a.x2));
  const html = C.locusHTML({...panel(), unit:'kb'}, state);
  assert.match(html, /class="locus-arc locus-arc-reversed bio-tone-motif"/);
  assert.match(html, /class="locus-arc bio-tone-accent"/);
  assert.match(C.locusHTML(panel(), {markers:[{id:'m', at:10, tone:'cut'}]}), /class="locus-pin bio-tone-cut"/);
  assert.match(html, /locus-arclabel bio-tone-motif[^>]*>loop</);
  assert.match(html, /locus-arclabel bio-tone-accent[^>]*>3 kb</);
  const w = validate({nodes:{n:{}}, rows:[['n']], panels:[{...panel(), initial:state}]}).warnings.join('\n');
  assert.match(w, /panels\[0\]\.initial\.arcs\[2\]: from and to are the same position — arc skipped/);
  assert.match(w, /panels\[0\]\.initial\.arcs\[3\]\.from: position 20000 is beyond length 10000 — arc skipped/);
});
test('edge tick labels anchor inward so a tick-aligned window never clips its first or last label', () => {
  assert.equal(C.locusTickAnchor(0.5), 'start'); assert.equal(C.locusTickAnchor(50), 'middle'); assert.equal(C.locusTickAnchor(99.4), 'end');
  assert.equal(C.locusTickAnchor(6), 'middle'); assert.equal(C.locusTickAnchor(94), 'middle');
  const m = model({...panel(), unit:'kb'}, {window:{from:2380, to:2460}});
  assert.deepEqual(m.ticks.filter(t => t.labelled).map(t => [t.label, t.anchor]),
    [['2.38 kb', 'start'], ['2.4 kb', 'middle'], ['2.42 kb', 'middle'], ['2.44 kb', 'middle'], ['2.46 kb', 'end']]);
  assert.ok(m.ticks.every(t => t.anchor === C.locusTickAnchor(t.x)));
  const html = C.locusHTML({...panel(), unit:'kb'}, {window:{from:2380, to:2460}});
  assert.match(html, /class="locus-ticklabel locus-anchor-start" style="left:0\.6\d\d%[^>]*>2\.38 kb</);
  assert.match(html, /class="locus-ticklabel locus-anchor-end" style="left:99\.3\d\d%[^>]*>2\.46 kb</);
  assert.match(html, /class="locus-ticklabel locus-anchor-middle"[^>]*>2\.42 kb</);
  const whole = model(panel(), {});
  assert.deepEqual(whole.ticks.map(t => t.anchor), ['middle', 'middle', 'middle', 'middle', 'end'], 'interior ticks stay centred; a tick on the last base anchors inward');
  assert.equal(model(panel(), {window:{from:2500, to:2500}}).ticks[0].anchor, 'middle');
});
test('units format ruler and distance labels without inventing precision', () => {
  assert.equal(C.locusFormat(1200, 'bp'), '1,200 bp');
  assert.equal(C.locusFormat(1200, 'kb'), '1.2 kb');
  assert.equal(C.locusFormat(12000, 'Mb'), '0.012 Mb');
  assert.equal(C.locusFormat(10000000000, 'bp'), '10,000,000,000 bp');
  assert.equal(C.locusFormat(1500, '__proto__'), '1,500 bp');
  assert.equal(C.locusFormat(NaN, 'kb'), '—');
  assert.equal(C.locusUnit({unit:'constructor'}), 'bp');
  const m = model({...panel(), unit:'Mb'}, {});
  assert.equal(m.ticks[0].label, '0.002 Mb');
  assert.match(C.locusHTML({...panel(), unit:'kb'}, {}), /aria-label="Genome map: region: 10 kb, 3 features"/);
});
test('highlight emphasises one feature, dims the rest and warns on unknown ids', () => {
  const m = model(panel(), {highlight:'b'});
  assert.deepEqual(m.features.map(f => [f.highlight, f.dim]), [[false, true], [true, false], [false, true]]);
  const none = model(panel(), {highlight:'zzz'});
  assert.equal(none.highlightFound, false); assert.ok(none.features.every(f => !f.dim && !f.highlight));
  const html = C.locusHTML(panel(), {highlight:'b'});
  assert.match(html, /locus-feature bio-tone-accent locus-hl locus-minus/);
  assert.match(html, /locus-feature bio-tone-feature locus-dim locus-plus/);
  assert.match(html, /aria-label="[^"]*highlighting b"/);
  const d = diagram(); d.steps[0].panels.g.highlight = 'zzz'; d.steps[0].panels.g.enterOnce = {highlight:5};
  const w = validate(d).warnings.join('\n');
  assert.match(w, /steps\[0\]\.panels\.g\.highlight: unknown feature id "zzz"/);
  assert.match(w, /steps\[0\]\.panels\.g\.enterOnce\.highlight: expected a feature id or null/);
  assert.deepEqual(plain(C.panelPatchFields(panel())).find(field => field[0] === 'highlight')[2], ['a', 'b', 'c']);
});
test('hostile declarations and states never throw, never leak markup and never print NaN', () => {
  const bad = {id:'g', type:'locus', length:'10000', unit:hostile, label:[], features:[null, {id:3}, {id:'a', from:0, to:5}, {id:'b', label:hostile, from:5, to:2}, {id:'c', from:1, to:5, tone:hostile, strand:'both', row:'1'}, {id:'c', from:1, to:5}],
    initial:{markers:[{id:hostile, at:NaN, label:{}, tone:hostile}, 7], arcs:[{id:'x', from:Infinity, to:2, label:9, tone:'z'}, null], window:[1, 2], highlight:{}, extra:true, note:hostile}};
  const r = validate({nodes:{n:{}}, rows:[['n']], panels:[bad], steps:[{id:'s', nodes:['n'], panels:{g:{markers:'m', arcs:{}, enterOnce:{window:'all'}}}}]});
  assert.deepEqual(r.errors, []);
  const w = r.warnings.join('\n');
  for (const path of ['panels[0].length: expected a whole number of bases', 'panels[0].unit', 'panels[0].label', 'panels[0].features[0]: expected', 'panels[0].features[1].id',
    'panels[0].features[2]: expected {from,to}', 'panels[0].features[3]: expected {from,to}', 'panels[0].features[4].tone', 'panels[0].features[4].strand', 'panels[0].features[4].row',
    'panels[0].features[5].id: duplicate', 'panels[0].initial.markers[0].at', 'panels[0].initial.markers[0].label', 'panels[0].initial.markers[0].tone', 'panels[0].initial.markers[1]: expected',
    'panels[0].initial.arcs[0].from', 'panels[0].initial.arcs[0].label', 'panels[0].initial.arcs[0].tone', 'panels[0].initial.arcs[1]: expected', 'panels[0].initial.window: expected {from,to}',
    'panels[0].initial.highlight', 'panels[0].initial.extra: unknown field', 'steps[0].panels.g.markers: expected an array', 'steps[0].panels.g.arcs: expected an array',
    'steps[0].panels.g.enterOnce.window: expected {from,to}'])
    assert.ok(w.includes(path), 'warning for ' + path + '\n' + w);
  const html = C.locusHTML(bad, bad.initial);
  assert.match(html, /Declare a length in bases/);
  assert.doesNotMatch(html, /<img|NaN|Infinity|undefined/);
  assert.match(html, /&lt;img/);
  const big = {...panel(), length:10000000000, features:[{id:'a', label:hostile, from:1, to:5000000000}]};
  const bigHtml = C.locusHTML(big, {markers:[{id:'m', at:10000000000, label:hostile}], arcs:[{id:'x', from:1, to:10000000000, label:hostile}], note:hostile});
  assert.doesNotMatch(bigHtml, /<img|NaN|Infinity|undefined/);
  assert.ok((bigHtml.match(/&lt;img/g) || []).length >= 5);
  assert.deepEqual(validate({nodes:{n:{}}, rows:[['n']], panels:[{id:'g', type:'locus', length:10000000001}]}).warnings.length, 1);
  assert.deepEqual(validate({nodes:{n:{}}, rows:[['n']], panels:[{id:'g', type:'locus', length:10000000000}]}), {errors:[], warnings:[]});
  const proto = JSON.parse('{"markers":[{"id":"p","at":5,"__proto__":{"tone":"bad"}}],"__proto__":{"highlight":"a"}}');
  assert.doesNotThrow(() => model(panel(), proto));
  assert.equal(model(panel(), proto).markers[0].tone, 'accent');
  for (const state of [null, 1, 'x', [], {markers:'abc'}, {window:{from:'1', to:2}}, {arcs:[{id:'a', from:1, to:1}]}])
    assert.doesNotThrow(() => C.locusHTML(panel(), state));
  assert.match(validate({nodes:{n:{}}, rows:[['n']], panels:[{...panel(), features:Array.from({length:50}, (_, i) => ({id:'f'+i, from:1, to:2}))}]}).warnings.join('\n'), /only the first 48 features render/);
  assert.equal(model({...panel(), features:Array.from({length:50}, (_, i) => ({id:'f'+i, from:1, to:2}))}, {}).features.length, 48);
  assert.equal(model(panel(), {markers:Array.from({length:30}, (_, i) => ({id:'m'+i, at:1}))}).markers.length, 24);
  assert.equal(model(panel(), {arcs:Array.from({length:20}, (_, i) => ({id:'a'+i, from:1, to:2}))}).arcs.length, 12);
});
test('state folds independently across alternate paths with enterOnce and never mutates the spec', () => {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[{...panel(), initial:{markers:[{id:'m0', at:100}], highlight:'a'}}],
    paths:[{id:'one', label:'One', steps:['a','b1','c1']}, {id:'two', label:'Two', steps:['a','b2']}],
    steps:[
      {id:'a', nodes:['n'], panels:{g:{arcs:[{id:'x', from:1000, to:5000}]}}},
      {id:'b1', nodes:['n'], panels:{g:{window:{from:1, to:5000}, enterOnce:{highlight:'b'}}}},
      {id:'c1', nodes:['n'], panels:{g:{window:null, highlight:null, markers:null}}},
      {id:'b2', nodes:['n'], panels:{g:{markers:'bad', arcs:null, highlight:'c'}}}]};
  const before = JSON.stringify(d);
  assert.deepEqual(validate(d).errors, []);
  const one = C.foldPanelStates(C.diagramForPath(d, 'one')).g, two = C.foldPanelStates(C.diagramForPath(d, 'two')).g;
  assert.equal(one.length, 3); assert.equal(two.length, 2);
  assert.equal(one[0].highlight, 'a'); assert.equal(one[0].arcs.length, 1); assert.equal(one[0].markers.length, 1);
  assert.equal(one[1].highlight, 'b', 'enterOnce applies to its own step'); assert.deepEqual(one[1].window, {from:1, to:5000});
  assert.equal(one[2].highlight, null); assert.equal(one[2].window, null); assert.equal(one[2].markers, null);
  assert.equal(model(d.panels[0], one[2]).markers.length, 0);
  assert.equal(model(d.panels[0], one[2]).zoomed, false);
  assert.equal(two[1].markers.length, 1, 'an invalid markers patch leaves the carried snapshot'); assert.equal(two[1].arcs, null); assert.equal(two[1].highlight, 'c');
  assert.equal(two[1].window, undefined);
  one.concat(two).forEach(state => assert.doesNotMatch(C.locusHTML(d.panels[0], state), /NaN|undefined/));
  assert.equal(JSON.stringify(d), before);
  const collected = C.patchFieldsCollect(C.panelPatchFields(d.panels[0]), {highlight:'b', window:'null', markers:'[{"id":"q","at":10}]'});
  assert.equal(collected.error, undefined);
  assert.deepEqual(plain(collected.item), {highlight:'b', window:null, markers:[{id:'q', at:10}]});
});
