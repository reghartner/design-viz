'use strict';
process.env.FLOWVIEW_PACKAGES = 'physics';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {console, URL, TextEncoder};
vm.createContext(C);
for (const file of ['validator.js', 'engine.js', 'builder.workbench.js', 'panel-picker.workbench.js']) vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const panel = () => ({id:'wave', type:'wavefield', wavelength:1, separation:4, screenDistance:10, screenHeight:12, unit:'cm'});
const diagram = p => ({nodes:{n:{}}, rows:[['n']], panels:[p || panel()]});
const validate = d => plain(C.validate(C.normalize(d)));
const model = (p, s) => plain(C.wavefieldModel(p, s));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
const coordinate = delta => delta / 2 * Math.sqrt(1 + 400 / (16 - delta * delta));

test('exact paths produce central bright, half-wave dark and whole-wave bright probes', () => {
  const p = panel(), centre = model(p, {probe:0});
  near(centre.probe.r1, Math.sqrt(104)); near(centre.probe.r2, Math.sqrt(104)); near(centre.probe.delta, 0); near(centre.probe.intensity, 4);
  const dark = model(p, {probe:coordinate(0.5)});
  near(dark.probe.delta, 0.5); near(dark.probe.intensity, 0); assert.equal(dark.classification, 'Dark minimum');
  const bright = model(p, {probe:coordinate(1)});
  near(bright.probe.delta, 1); near(bright.probe.intensity, 4);
  const negative = model(p, {probe:-coordinate(0.5)});
  near(negative.probe.delta, -0.5); near(negative.probe.intensity, dark.probe.intensity);
  for (const sample of centre.points) assert.ok(sample.intensity >= 0 && sample.intensity <= 4);
  assert.ok(centre.points.some(point => Math.abs(point.intensity) < 1e-10), 'sampled graph includes exact dark extrema');
});
test('one-source baseline keeps a common scale and a new wavelength recalculates the trial', () => {
  const p = panel(), one = model(p, {sources:'one', probe:3});
  assert.equal(one.probe.r2, null); assert.equal(one.probe.delta, null); assert.equal(one.probe.intensity, 1); assert.equal(one.probe.normalized, 0.25);
  assert.ok(one.points.every(point => point.intensity === 1));
  const trial = model(p, {wavelength:2, probe:coordinate(0.5)});
  assert.match(C.wavefieldHTML(p, {wavelength:2}), /Wavelength trial/);
  near(trial.probe.intensity, 2); near(trial.probe.delta, 0.5); assert.equal(trial.config.wavelength, 2);
  const scaled = model({...p, wavelength:10, separation:40, screenDistance:100, screenHeight:120}, {probe:coordinate(0.5)*10});
  near(scaled.probe.intensity, 0); near(scaled.probe.delta, 5);
});
test('validation rejects malformed geometry, states and out-of-screen coordinates with useful paths', () => {
  const p = {...panel(), wavelength:0, separation:Infinity, screenDistance:'10', screenHeight:-2, unit:[], initial:{sources:'three', probe:999, note:7}};
  const d = diagram(p); d.steps = [{id:'a', nodes:['n'], panels:{wave:{wavelength:-1, probe:NaN, enterOnce:{sources:'bad'}, bogus:true}}}];
  const result = validate(d); assert.deepEqual(result.errors, []);
  for (const key of ['panels[0].wavelength','panels[0].separation','panels[0].screenDistance','panels[0].screenHeight','panels[0].unit','panels[0].initial.sources','panels[0].initial.probe','panels[0].initial.note','steps[0].panels.wave.wavelength','steps[0].panels.wave.probe','steps[0].panels.wave.enterOnce.sources','steps[0].panels.wave.bogus']) assert.ok(result.warnings.some(w => w.includes(key + ':')), key);
  assert.match(C.wavefieldHTML(p, {}), /Declare positive wavelength/);
  assert.deepEqual(validate(diagram()), {errors:[], warnings:[]});
  assert.deepEqual(validate(diagram({...panel(), screenHeight:undefined})), {errors:[], warnings:[]});
});
test('folding isolates alternate trials, one-step changes and invalid patches without mutation', () => {
  const d = diagram({...panel(), initial:{sources:'one', probe:0}});
  d.paths = [{id:'a', label:'A', steps:['start','a1','a2']}, {id:'b', label:'B', steps:['start','b1']}];
  d.steps = [{id:'start', nodes:['n'], panels:{wave:{sources:'two'}}}, {id:'a1', nodes:['n'], panels:{wave:{wavelength:2, probe:2, enterOnce:{sources:'one', probe:1}}}}, {id:'a2', nodes:['n'], panels:{wave:{probe:999, wavelength:0, sources:'bad'}}}, {id:'b1', nodes:['n'], panels:{wave:{probe:-2}}}];
  const before = JSON.stringify(d);
  const a = plain(C.foldPanelStates(C.diagramForPath(d, 'a')).wave), b = plain(C.foldPanelStates(C.diagramForPath(d, 'b')).wave);
  assert.equal(a[1].sources,'one'); assert.equal(a[1].probe,1); assert.equal(a[2].sources,'two'); assert.equal(a[2].probe,2); assert.equal(a[2].wavelength,2);
  assert.equal(b[1].probe,-2); assert.equal(b[1].sources,'two'); assert.equal(b[1].wavelength,undefined);
  assert.deepEqual(plain(C.foldPanelStates(C.diagramForPath(d,'b')).wave), b);
  assert.equal(JSON.stringify(d), before);
  assert.equal(C.foldPanelStates(diagram()).wave.length, 1);
});
test('render is deterministic, labels source modes and assumptions, escapes text, and bounds dense inputs', () => {
  const hostile = '<img src=x onerror="bad()">', p = {...panel(), unit:hostile};
  const html = C.wavefieldHTML(p, {note:hostile, probe:1});
  assert.doesNotMatch(html, /<img|onerror="|NaN|Infinity|undefined/); assert.match(html, /&lt;img/);
  assert.match(html, /role="img" aria-label=/); assert.match(html, /equal amplitudes/); assert.match(html, /Omits diffraction envelope/);
  assert.match(html, /wavefield-s2/); assert.match(html, /r₂ − r₁/);
  const one = C.wavefieldHTML(panel(), {sources:'one', probe:0}); assert.match(one, /S2 off/); assert.match(one, /One-source baseline/);
  assert.match(one, /I\/I₀ = 1 across the screen/); assert.doesNotMatch(one, /class="wavefield-path wavefield-s2/);
  assert.equal(html, C.wavefieldHTML(p, {note:hostile, probe:1}));
  const dense = model({...panel(), wavelength:0.000001}, {}); assert.equal(dense.undersampled,true); assert.ok(dense.rings.length <= 36); assert.ok(dense.points.length <= 800);
  assert.match(C.wavefieldHTML({...panel(), wavelength:0.000001}, {}), /Dense fringes/);
  for (const state of [null, [], 'bad', {probe:Infinity}, {sources:'<script>'}, JSON.parse('{"__proto__":{"sources":"one"}}')]) assert.doesNotMatch(C.wavefieldHTML(panel(), state), /NaN|Infinity|undefined|<script>/);
});
test('picker, typed authoring controls, stylesheet and release feature are auto-discovered', () => {
  const template = {...plain(C.PANEL_TEMPLATES.wavefield), id:'wave', type:'wavefield'};
  assert.deepEqual(validate(diagram(template)), {errors:[], warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'wavefield'); assert.equal(entry.name,'Wave interference');
  const before = JSON.stringify(C.PANEL_TEMPLATES.wavefield), sample = C.panelPickerExample('wavefield');
  assert.equal(JSON.stringify(C.PANEL_TEMPLATES.wavefield),before); assert.deepEqual(validate(diagram(plain(sample.panel))),{errors:[],warnings:[]});
  assert.equal(sample.state.sources,'two'); assert.ok(sample.state.probe > 0);
  const fields = plain(C.panelPatchFields(panel())); assert.deepEqual(fields.map(f => f[0]),['sources','probe','wavelength','note']);
  assert.deepEqual(fields.find(field => field[0] === 'sources'), ['sources','enum',['one','two']], 'source mode uses the shared enum control');
  const collected = C.patchFieldsCollect(fields, {sources:'one',probe:'-2',wavelength:'1.5',note:'Observe'}); assert.equal(collected.error, undefined); assert.deepEqual(plain(collected.item),{sources:'one',probe:-2,wavelength:1.5,note:'Observe'});
  assert.deepEqual(panelAssets().features['panel.wavefield'],{label:'Wave interference panel',since:'0.2.0'});
  const css = readStyles('style.core.css'); assert.match(css,/\.wavefield-panel\{/); assert.match(css,/prefers-reduced-motion:reduce/); assert.match(css,/\.sk-daylight \.wavefield-panel/);
});

test('dark-fringe display suppresses only numerical residuals without rounding the model', () => {
  const p = panel(), state = {probe:coordinate(0.5)}, exact = C.wavefieldModel(p, state);
  assert.ok(exact.probe.intensity > 0 && exact.probe.intensity < 1e-12);
  assert.equal(C.wavefieldIntensityFormat(exact.probe.intensity), '0');
  assert.equal(C.wavefieldIntensityFormat(3.21e-15), '0');
  assert.equal(C.wavefieldIntensityFormat(1e-12), '1.00e-12');
  assert.equal(C.wavefieldIntensityFormat(0.00001), '1.00e-5');
  const html = C.wavefieldHTML(p, state);
  assert.match(html, /I\/I₀ = 0, Dark minimum/);
  assert.match(html, /I\/I₀ <b>0<\/b>/);
  assert.match(html, /Resultant amplitude <b>≈0<\/b>/);
  assert.doesNotMatch(html, /Resultant amplitude [^<]*5\.66e-8/);
  assert.equal(C.wavefieldModel(p, state).probe.intensity, exact.probe.intensity);
});

test('screen cells cover the screen and share exact model intensities, including the probe', () => {
  for (const state of [{sources:'one', probe:2.3}, {probe:coordinate(0.5)}, {probe:coordinate(1)}, {probe:-1.1, wavelength:2}]) {
    const m = C.wavefieldModel(panel(), state), cells = plain(C.wavefieldScreenSamples(m));
    near(cells[0].low, -6); near(cells.at(-1).high, 6);
    cells.forEach((cell, i) => {
      assert.ok(cell.high > cell.low);
      if (i) near(cells[i-1].high, cell.low);
      near(cell.intensity, C.wavefieldSample(m.config, m.sources, cell.y).intensity);
      near(cell.normalized, cell.intensity / 4);
    });
    const probe = cells.find(cell => cell.y === m.probe.y);
    assert.ok(probe, 'screen explicitly includes the selected probe');
    near(probe.intensity, m.probe.intensity);
    const html = C.wavefieldHTML(panel(), state);
    const rendered = [...html.matchAll(/class="wavefield-screen-sample" data-y="([^"]+)" data-intensity="([^"]+)"[^>]+fill="rgb\(([^)]+)\)"/g)];
    assert.equal(rendered.length, cells.length);
    rendered.forEach((match, i) => { near(Number(match[1]), cells[i].y); near(Number(match[2]), cells[i].intensity); });
    if (state.sources === 'one') {
      assert.ok(cells.every(cell => cell.intensity === 1));
      assert.equal(new Set(rendered.map(match => match[3])).size, 1, 'single-source strip is uniformly illuminated');
    } else {
      assert.ok(cells.some(cell => cell.intensity < 1e-12));
      assert.ok(cells.some(cell => cell.intensity > 3.999999));
    }
  }
});

test('static phase comparison sums signed source waves and agrees with probe intensity', () => {
  for (const state of [{probe:0}, {probe:coordinate(0.5)}, {probe:-coordinate(0.5)}, {probe:coordinate(1)}, {probe:1.3, wavelength:2}, {sources:'one', probe:3}]) {
    const m = C.wavefieldModel(panel(), state), phase = plain(C.wavefieldPhase(m));
    near(phase.amplitude ** 2, m.probe.intensity);
    near(phase.degrees, m.sources === 'one' ? 0 : 360 * m.probe.delta / m.config.wavelength);
    phase.points.forEach(point => near(point.sum, point.a + point.b));
    // Mean squared displacement across a complete cycle gives half the squared
    // amplitude. This checks the rendered phase curves against the intensity.
    near(phase.points.slice(0, -1).reduce((sum, point) => sum + point.sum ** 2, 0) / 96 * 2, m.probe.intensity);
    const html = C.wavefieldHTML(panel(), state);
    assert.match(html, /static comparison/); assert.match(html, /Solid S1 \+ dashed S2 = sum/);
    assert.match(html, /data-component="sum"/);
    if (m.classification === 'Dark minimum') {
      assert.ok(phase.points.every(point => Math.abs(point.sum) < 1e-12));
      assert.match(html, /Opposite phase → cancellation/);
      const sum = html.match(/data-component="sum" points="([^"]+)"/)[1];
      assert.ok(sum.split(' ').every(pair => Number(pair.split(',')[1]) === 112), 'dark probe has a visibly flat sum');
    }
    if (m.classification === 'Bright maximum') assert.match(html, /Aligned phase → reinforcement/);
    if (m.sources === 'one') assert.doesNotMatch(html, /data-component="b"/);
  }
});
