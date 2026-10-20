'use strict';
process.env.FLOWVIEW_PACKAGES = 'science';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js']) vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const panel = extra => ({id:'rna', type:'rnacopy', title:'RNA copying', initial:{status:'ready', position:0.25, progress:0, copies:0}, ...extra});
const diagram = (p = panel(), steps = [], paths) => ({nodes:{n:{}}, rows:[['n']], panels:[p], steps, ...(paths ? {paths} : {})});
const validate = d => plain(C.validate(C.normalize(d)));
const fold = (d, route) => C.foldPanelStates(route ? C.diagramForPath(d, route) : d).rna;
const snapshot = (id, state) => ({id, panels:{rna:state}});
const html = (p, s) => C.PanelViews.get('rnacopy')({}, p, s, 'aurora', [], 0, false).html;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('rnacopy is discovered with a clean template, picker example, typed fields and styles', () => {
  const template = plain(C.PANEL_TEMPLATES.rnacopy), before = JSON.stringify(template);
  assert.deepEqual(validate(diagram(panel(template))), {errors:[], warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(item => item.type === 'rnacopy' && item.category === 'Science & sequencing'));
  const example = C.panelPickerExample('rnacopy');
  assert.deepEqual(validate(diagram(example.panel)), {errors:[], warnings:[]});
  assert.match(html(example.panel, example.state), /rnacopy-copy"/);
  assert.match(html(example.panel, example.state), /Copying/);
  assert.equal(JSON.stringify(plain(C.PANEL_TEMPLATES.rnacopy)), before);
  const fields = plain(C.panelPatchFields(panel()));
  assert.deepEqual(fields.map(f => f[0]), ['status','position','progress','copies','caption','note']);
  assert.equal(C.panelAuthoring('rnacopy').initialFields, true);
  assert.equal(panelAssets().features['panel.rnacopy'].since, '0.2.0');
  const css = readStyles('style.core.css');
  for (const pattern of [/\.rnacopy-frame\{/, /\.sk-daylight \.rnacopy/, /@media print\{\.rnacopy/, /prefers-reduced-motion:reduce\)\{\.rnacopy/]) assert.match(css, pattern);
  const source = fs.readFileSync(path.join(__dirname, '../packages/science/panels/types/rnacopy.js'), 'utf8');
  assert.doesNotMatch(source, /document\.|setTimeout|setInterval|requestAnimationFrame|fetch\(/);
});

test('sparse folds isolate baseline and interruption paths, transient values and independent invocations', () => {
  const p = panel({initial:{status:'ready', position:0.2, progress:0, copies:0, note:'initial'}});
  const d = freeze(diagram(p, [
    snapshot('start',{status:'copying',position:0.45,progress:0.35}),
    snapshot('finish',{status:'complete',position:0.9,progress:1,copies:2}),
    snapshot('interrupt',{status:'interrupted',caption:'Hypothetical interruption',enterOnce:{note:'One step'}}),
    snapshot('hold',{}),
    snapshot('resume',{status:'copying',caption:null,note:null}),
  ], [{id:'baseline',steps:['start','finish']},{id:'interruption',steps:['start','interrupt','hold','resume']}]));
  const before = JSON.stringify(d), base = fold(d,'baseline'), interrupted = fold(d,'interruption');
  assert.deepEqual(plain(base.map(s => [s.status,s.progress,s.copies])), [['copying',0.35,0],['complete',1,2]]);
  assert.deepEqual(plain(interrupted.map(s => [s.status,s.progress,s.copies])), [['copying',0.35,0],['interrupted',0.35,0],['interrupted',0.35,0],['copying',0.35,0]]);
  assert.equal(interrupted[1].note, 'One step');
  assert.equal(interrupted[2].note, 'initial');
  assert.equal(interrupted[3].note, null);
  assert.equal(interrupted[3].caption, null);
  assert.equal(JSON.stringify(d), before);
  base[0].status = 'paused';
  assert.equal(fold(d,'baseline')[0].status, 'copying');
  assert.equal(fold(d,'interruption')[0].status, 'copying');
  assert.equal(fold(diagram(p)).length, 1);
  assert.equal(fold(diagram(p))[0].position, 0.2);
});

test('validation rejects malformed values at exact paths and the fold preserves earlier valid fields', () => {
  const p = panel({label:4, initial:{status:'wrong',position:-1,progress:Infinity,copies:1.5,caption:[],note:2,sequence:'not supported'}});
  const steps = [snapshot('valid',{status:'copying',position:0.6,progress:0.4,copies:3}),
    snapshot('invalid',{status:'running',position:NaN,progress:2,copies:-1,caption:{},note:42,rate:5,enterOnce:{position:'0.5',status:'wrong',enterOnce:{status:'paused'}}}),
    snapshot('bad',[]), snapshot('null',null)];
  const result = validate(diagram(p,steps));
  assert.deepEqual(result.errors, []);
  for (const field of ['label','initial.status','initial.position','initial.progress','initial.copies','initial.caption','initial.note','initial.sequence'])
    assert.ok(result.warnings.some(w => w.includes('panels[0].' + field + ':')), field);
  for (const field of ['status','position','progress','copies','caption','note','rate','enterOnce.position','enterOnce.status','enterOnce.enterOnce'])
    assert.ok(result.warnings.some(w => w.includes('steps[1].panels.rna.' + field + ':')), field);
  const states = fold(diagram(p,steps));
  for (const s of states) assert.deepEqual([s.status,s.position,s.progress,s.copies], ['copying',0.6,0.4,3]);
  for (const initial of [null, [], 2, 'state']) {
    assert.ok(validate(diagram(panel({initial}))).warnings.some(w => /panels\[0\]\.initial/.test(w)));
    assert.doesNotThrow(() => fold(diagram(panel({initial}))));
  }
  assert.deepEqual(validate(diagram(panel({initial:{status:'paused',position:0,progress:1,copies:12,caption:null,note:null}}))), {errors:[],warnings:[]});
});

test('model is deterministic, bounded and independent of status, count and elapsed time', () => {
  for (const position of [0,0.3,1]) for (const progress of [0,0.01,0.6,1]) {
    const state = freeze({position, progress, copies:2, status:'copying'});
    const m = C.rnacopyModel(panel(), state);
    assert.deepEqual(plain(m), plain(C.rnacopyModel(panel(), state)));
    assert.ok(m.x >= 124 && m.x <= 320);
    assert.ok(m.copyEnd.x > 44 && m.copyEnd.y <= 263);
    assert.equal(!!m.copyPath, progress > 0);
    if (progress > 0) assert.ok(Math.hypot(m.copyEnd.x - m.x, m.copyEnd.y - m.y) > 48, 'nonzero intermediate must emerge beyond the polymerase halo');
    for (const status of ['ready','paused','interrupted','complete']) {
      const held = C.rnacopyModel(panel(), {...state,status,copies:12,time:100000});
      assert.equal(held.copyPath, m.copyPath);
      assert.equal(held.x, m.x);
      assert.equal(held.copies, 12);
    }
  }
  for (const bad of [null, [], 'x', {progress:Infinity,position:-100,copies:NaN,status:'x'}]) {
    assert.doesNotMatch(html(panel(),bad), /NaN|Infinity|undefined/);
  }
  const first = C.rnacopyModel(panel({label:'First'}), {});
  assert.equal(first.label,'First');
  assert.equal(C.rnacopyModel(panel({label:'Changed'}),{}).label,'Changed');
});

test('render labels a sequence-free intermediate, shared polymerase artwork and accessible state symbols', () => {
  const p = panel(), s = {position:0.5,progress:0.7,copies:4,status:'paused'};
  const paused = html(p,s), interrupted = html(p,{...s,status:'interrupted'});
  assert.match(paused, /role="img" aria-label="RNA copying\. Polymerase paused;/);
  assert.match(paused, /rnacopy-status-text[^>]*>Paused/);
  assert.match(interrupted, /rnacopy-status-text[^>]*>Interrupted/);
  assert.match(paused, /mech-shape-clamp/);
  assert.match(paused, /4 copies · authored/);
  assert.match(paused, /70% extent/);
  assert.match(paused, /aria-label="Ribbon legend"/);
  assert.match(paused, /authored independently\. No sequence or timescale/);
  assert.doesNotMatch(paused, /mech-nt|mech-t-nt|rnacopy-ruler|data-sequence/);
  assert.equal(paused.match(/class="rnacopy-copy" d="([^"]+)"/)[1], interrupted.match(/class="rnacopy-copy" d="([^"]+)"/)[1]);
  assert.equal(paused.match(/class="rnacopy-input" d="([^"]+)"/)[1], interrupted.match(/class="rnacopy-input" d="([^"]+)"/)[1]);
  assert.doesNotMatch(html(p,{progress:0}), /class="rnacopy-copy"/);
  const render = C.PanelViews.get('rnacopy'), host = {};
  assert.equal(render(host,p,s,'aurora',[],0,true).html, render(host,p,s,'daylight',[],0,false).html);
  assert.deepEqual(Object.keys(host), [], 'no retained state, DOM dependence or clocks');
});

test('completed copies are separate tokens and never inferred from the active intermediate', () => {
  for (const copies of [0,1,4,12]) for (const status of ['ready','copying','paused','interrupted','complete']) {
    const out = html(panel(), {copies,status,progress:0.45,position:0.8});
    assert.equal((out.match(/class="rnacopy-completed-copy"/g) || []).length, copies);
    assert.equal((out.match(/class="rnacopy-polymerase"/g) || []).length, 1);
    assert.match(out, /class="rnacopy-tray"/);
    assert.match(out, /Separate symbolic count/);
    assert.match(out, /Incoming \+RNA is copied through a complementary intermediate before new \+RNA/);
    const site = out.slice(out.indexOf('class="rnacopy-site-bg"'), out.indexOf('class="rnacopy-tray"'));
    assert.match(site, /Complementary intermediate/);
    assert.doesNotMatch(site, /New \+RNA|rnacopy-completed-copy/);
    assert.match(out, /45% extent/);
  }
  assert.match(html(panel(), {copies:0}), /No copies shown/);
  assert.match(html(panel(), {status:'interrupted',progress:0.5}), /Stopped · intermediate retained/);
  assert.match(html(panel(), {status:'interrupted',progress:0}), /Stopped · no intermediate drawn/);
  assert.doesNotMatch(html(panel(), {status:'interrupted',progress:0}), /stopped intermediate remains visible/);
});

test('all authored text is escaped and hostile keys cannot become markup or folded properties', () => {
  const hostile = '<img src=x onerror=alert(1)>" onclick="alert(1)';
  const p = panel({label:hostile});
  const patch = JSON.parse('{"__proto__":{"polluted":true},"constructor":{},"status":"<svg onload=bad()>","progress":0.5}');
  const s = fold(diagram(p,[snapshot('x',{...patch,caption:hostile,note:hostile})]))[0];
  const out = html(p,s);
  assert.match(out, /&lt;img/);
  assert.match(out, /&quot; onclick=&quot;/);
  assert.doesNotMatch(out, /<img|<script|<svg onload|" onclick="|polluted/);
  assert.equal(Object.hasOwn(s,'__proto__'),false);
  assert.equal(Object.hasOwn(s,'constructor'),false);
  assert.equal({}.polluted,undefined);
});
