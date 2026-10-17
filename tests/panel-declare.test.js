'use strict';
/* Per-step panel declaration overrides (`declare`): the shared pure fold, the
   validator, the player title sync and the compatibility feature. Headless,
   loaded via vm like tests/cost-panel.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');

const ROOT = path.join(__dirname, '..');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['compatibility.js','canon.js','validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
  vm.runInContext(readSource(file), C, {filename:file});

const plain = value => JSON.parse(JSON.stringify(value));
function freeze(value){
  if (value && typeof value === 'object'){ Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function specFiles(){
  const out = [];
  for (const name of fs.readdirSync(path.join(ROOT,'src/starters'))) if (name.endsWith('.json')) out.push('src/starters/' + name);
  const walk = dir => {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(full);
      else if (entry.name.endsWith('.spec.json')) out.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT,'examples'));
  return out.sort();
}
function diagramsOf(raw){
  const page = raw && raw.page ? raw.page : raw, out = [];
  const blocks = page && (page.blocks || page.sections);
  if (Array.isArray(blocks)) blocks.forEach(block => {
    if (!block) return;
    if (block.diagram) out.push(block.diagram);
    (block.tabs || []).forEach(tab => (tab && tab.sections || []).forEach(section => { if (section && section.diagram) out.push(section.diagram); }));
  });
  if (!out.length && raw && raw.nodes) out.push(raw);
  return out;
}
/* The pre-override fold, kept here as the reference the new fold must match
   byte for byte whenever a path carries no `declare`. */
function referenceFold(d){
  const story = C.storyTimeSequence(d), out = {};
  (d.panels || []).forEach(panel => {
    if (!panel || !panel.id) return;
    const descriptor = C.PanelRegistry.get(panel.type);
    const fold = descriptor && descriptor.fold || C.foldCommonPanelStates;
    let states = fold(panel, d.steps || []);
    if (descriptor && descriptor.storyTime) states = descriptor.storyTime(panel, states, d.steps || [], story, d) || states;
    out[panel.id] = states;
  });
  return out;
}
const page = d => ({page:{title:'Declare',sections:[{heading:'Story',diagram:d}]}});
const validate = d => plain(C.validate(C.normalize(page(d))));
const warningsAbout = (d, needle) => validate(d).warnings.filter(w => w.includes(needle));

function fixture(){
  return {
    nodes:{a:{title:'Meter'},b:{title:'Service'}}, rows:[['a','b']], edges:[{from:'a',to:'b'}],
    panels:[
      {id:'g',type:'gauge',title:'Draw',unit:'mA',max:400,initial:{value:12}},
      {id:'t',type:'table',title:'Rows',columns:[{id:'k',label:'Key'},{id:'v',label:'Value'}],initial:{rows:[{id:'r1',cells:{k:'a',v:1}}]}},
      {id:'l',type:'log',title:'Log',initial:{log:['boot']}}
    ],
    steps:[
      {id:'s1',text:'Start',edge:'a->b',panels:{g:{value:20},l:{log:['one']}}},
      {id:'s2',text:'Watts',edge:'a->b',panels:{g:{value:40,declare:{max:200,unit:'W',title:'Draw (watts)'}},l:{log:['two'],enterOnce:{note:'flash'}}}},
      {id:'s3',text:'Peak',edge:'a->b',panels:{g:{enterOnce:{declare:{max:50}}},t:{declare:{columns:[{id:'k',label:'Key'},{id:'z',label:'Zed'}]},rows:[{id:'r2',cells:{z:9}}]}}},
      {id:'s4',text:'Restore',edge:'a->b',panels:{g:{declare:{max:null}},l:{log:['four']}}},
      {id:'s5',text:'Alternate',edge:'a->b',panels:{t:{rows:[{id:'r3',cells:{k:1}}]}}}
    ],
    paths:[{id:'happy',steps:['s1','s2','s3','s4']},{id:'alt',steps:['s1','s5']}]
  };
}
const forPath = (d, id) => C.diagramForPath(d, id);

test('specs without declare fold exactly as before and report the authored declaration at every step', () => {
  let diagrams = 0, paths = 0, declared = 0;
  for (const rel of specFiles()){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (ex) { continue; }
    for (const d of diagramsOf(raw)){
      diagrams++;
      for (const route of C.diagramPathList(d)){
        const sub = forPath(d, route.id);
        const uses = (sub.panels || []).some(panel => panel && panel.id &&
          (sub.steps || []).some(step => C.panelPatchHasDeclare((C.stepPanelPatch(step) || {})[panel.id])));
        if (uses){ declared++; continue; }
        paths++;
        assert.deepEqual(plain(C.foldPanelStates(sub)), plain(referenceFold(sub)), rel + ' ' + route.id);
        const decls = C.foldDiagramPanelDeclarations(sub);
        (sub.panels || []).forEach(panel => {
          if (!panel || !panel.id) return;
          const descriptor = C.PanelRegistry.get(panel.type);
          /* Types whose state keys imply declaration overrides (data-contract) may report a merged declaration. */
          if (!(descriptor && descriptor.declarationPatch))
            assert.ok(decls[panel.id].every(decl => decl === panel), rel + ' ' + panel.id + ' has no overrides');
          assert.equal(decls[panel.id].length, Math.max(1, (sub.steps || []).length));
        });
      }
    }
  }
  assert.ok(diagrams > 40 && paths > 50, 'swept ' + diagrams + ' diagrams and ' + paths + ' paths');
  assert.ok(declared >= 1, 'the shipped example exercises declare and is excluded from the identity sweep');
});

test('declare carries along a path, null restores the authored value, enterOnce applies to one step and paths stay independent', () => {
  const d = freeze(fixture()), before = JSON.stringify(d);
  const happy = forPath(d, 'happy'), alt = forPath(d, 'alt');
  const decls = C.foldPanelDeclarations(happy.panels[0], happy.steps);
  assert.deepEqual(plain(decls.map(x => [x.max, x.unit, x.title])), [[400,'mA','Draw'],[200,'W','Draw (watts)'],[50,'W','Draw (watts)'],[400,'W','Draw (watts)']]);
  assert.equal(decls[0], happy.panels[0], 'the authored object itself until the first override');
  assert.notEqual(decls[1], decls[2]); assert.notEqual(decls[2], decls[3]);
  assert.deepEqual(plain(decls[1].initial), {value:12}, 'initial rides along unchanged');
  const altDecls = C.foldPanelDeclarations(alt.panels[0], alt.steps);
  assert.ok(altDecls.every(x => x === alt.panels[0]), 'the alternate never saw the override');
  const tableDecls = C.foldDiagramPanelDeclarations(happy).t;
  assert.deepEqual(plain(tableDecls.map(x => x.columns.map(c => c.id))), [['k','v'],['k','v'],['k','z'],['k','z']]);
  assert.deepEqual(plain(C.foldPanelDeclarations(happy.panels[0], []).map(x => x === happy.panels[0])), [true], 'an empty story reports the base once');
  assert.equal(JSON.stringify(d), before, 'input untouched');
});

test('states fold against the effective declaration without losing histories or leaking enterOnce; declare never becomes state', () => {
  const d = freeze(fixture()), happy = forPath(d, 'happy');
  const folded = C.foldPanelStates(happy);
  assert.deepEqual(plain(folded.l.map(s => s.log)), [['boot','one'],['boot','one','two'],['boot','one','two'],['boot','one','two','four']]);
  assert.deepEqual(plain(folded.l.map(s => s.note === undefined ? 'none' : s.note)), ['none','flash','none','none'], 'the one-step note before the declaration change does not leak');
  assert.deepEqual(plain(folded.g.map(s => s.value)), [20,40,40,40]);
  assert.deepEqual(plain(folded.t.map(s => s.rows.map(r => r.id))), [['r1'],['r1'],['r2'],['r2']]);
  folded.g.concat(folded.t, folded.l).forEach(state => {
    assert.ok(!Object.prototype.hasOwnProperty.call(state, 'declare'));
    assert.ok(!state.enterOnce || !Object.prototype.hasOwnProperty.call(state.enterOnce, 'declare'));
  });
  const alt = forPath(d, 'alt');
  assert.deepEqual(plain(C.foldPanelStates(alt).t.map(s => s.rows.map(r => r.id))), [['r1'],['r3']]);
  /* The legacy `patch` spelling and a declare-only patch behave the same. */
  const legacy = fixture();
  legacy.steps.forEach(step => { step.patch = step.panels; delete step.panels; });
  legacy.steps[1].patch.g = {declare:{unit:'W'}};
  const legacyFold = C.foldPanelStates(forPath(freeze(legacy), 'happy'));
  assert.deepEqual(plain(legacyFold.g.map(s => s.value)), [20,20,20,20]);
  assert.deepEqual(plain(C.foldDiagramPanelDeclarations(forPath(legacy, 'happy')).g.map(x => x.unit)), ['mA','W','W','W']);
});

test('reserved keys, non-objects and overrides the panel rejects warn at exact paths and are ignored', () => {
  const d = fixture();
  d.steps[1].panels.g.declare = 'nope';
  d.steps[3].panels.g.declare = JSON.parse('{"id":"x","type":"thermo","initial":{"value":1},"visible":false,"__proto__":{"polluted":true},"unit":"kW"}');
  const v = validate(d);
  assert.deepEqual(v.errors, []);
  const at = 'sections[0].diagram.steps[';
  assert.ok(v.warnings.includes(at + '1].panels.g.declare: expected an object of declaration fields — ignored'));
  for (const key of ['id','type','initial'])
    assert.ok(v.warnings.includes(at + '3].panels.g.declare.' + key + ': reserved key — ignored'), key);
  assert.ok(v.warnings.includes(at + '3].panels.g.declare.visible: reserved key — ignored (use panelVisibility to show or hide a panel)'));
  assert.ok(v.warnings.includes(at + '3].panels.g.declare.__proto__: reserved key — ignored'));
  const decls = C.foldDiagramPanelDeclarations(forPath(d, 'happy')).g;
  assert.deepEqual(plain(decls.map(x => [x.id, x.type, x.unit, x.max, x.visible === undefined])), [['g','gauge','mA',400,true],['g','gauge','mA',400,true],['g','gauge','mA',50,true],['g','gauge','kW',400,true]]);
  assert.equal(Object.prototype.hasOwnProperty.call(decls[3], 'polluted'), false);
  assert.equal(({}).polluted, undefined);

  /* A rejected override: an image source must be an embedded raster, so the
     panel's own declaration errors drop the override at that step only. */
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
  const i = {nodes:{a:{title:'A'}}, rows:[['a']], panels:[{id:'shot',type:'image',src:png,alt:'Before',caption:'Start'}],
    steps:[{id:'one',text:'One',nodes:['a'],panels:{shot:{declare:{src:'https://example.com/remote.png',caption:'Remote'}}}},
      {id:'two',text:'Two',nodes:['a'],panels:{shot:{declare:{caption:'After',alt:'After'}}}}]};
  const iv = validate(i);
  assert.deepEqual(iv.errors, []);
  assert.ok(iv.warnings.includes(at + '0].panels.shot.declare.src: use an embedded PNG, JPEG or WebP data URL up to 512 KiB; remote URLs and SVG are not supported — declaration override at this step ignored'), iv.warnings.join('\n'));
  const imageDecls = C.foldDiagramPanelDeclarations(i).shot;
  assert.equal(imageDecls[0], i.panels[0], 'rejected at step 0, caption included');
  assert.deepEqual(plain([imageDecls[1].caption, imageDecls[1].alt, imageDecls[1].src === png]), ['After','After',true]);
});

test('the rest of a patch is validated against the effective declaration on its own path', () => {
  const d = fixture();
  const v = validate(d);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings.filter(w => w.includes('.panels.t.')), [], 'the z column exists on the happy path when row r2 arrives');
  const stale = fixture();
  stale.steps[4].panels.t.rows = [{id:'r3',cells:{z:1}}];
  assert.deepEqual(warningsAbout(stale, '.panels.t.'), ['sections[0].diagram.steps[4].panels.t.rows[0].cells.z: unknown column — ignored'], 'the alternate path never declared z');
  const dup = fixture();
  dup.steps[2].panels.t.declare = {columns:[{id:'k',label:'Key'},{id:'k',label:'Again'}]};
  assert.deepEqual(warningsAbout(dup, '.declare.'), ['sections[0].diagram.steps[2].panels.t.declare.columns[1].id: duplicate id "k" — later entry skipped']);
  const once = fixture();
  once.steps[2].panels.t = {enterOnce:{declare:{columns:'x'}}, rows:[{id:'r2',cells:{k:2}}]};
  assert.deepEqual(warningsAbout(once, '.panels.t.'), [
    'sections[0].diagram.steps[2].panels.t.enterOnce.declare.columns: needs 1–4 entries with unique string ids',
    'sections[0].diagram.steps[2].panels.t.rows[0].cells.k: unknown column — ignored'
  ], 'a one-step override is checked under enterOnce.declare and governs that step\'s patch');
  /* A shared step after a branch-only override keeps the base declaration on the other path. */
  const shared = fixture();
  shared.steps.push({id:'end',text:'End',edge:'a->b',panels:{t:{rows:[{id:'r9',cells:{z:3}}]}}});
  shared.paths = [{id:'happy',steps:['s1','s2','s3','end']},{id:'alt',steps:['s1','s5','end']}];
  assert.deepEqual(warningsAbout(shared, '.panels.t.'), ['sections[0].diagram.steps[5].panels.t.rows[0].cells.z: unknown column — ignored']);
  const unknownPanel = fixture();
  unknownPanel.steps[1].panels.ghost = {declare:{max:1}};
  assert.ok(validate(unknownPanel).warnings.includes('sections[0].diagram.steps[1].panels: "ghost" is not a declared panel id — patch ignored'));
});

test('compatibility stamps the feature only when a step patch carries declare', () => {
  const d = fixture();
  assert.ok(C.FlowviewCompatibility.detect(d).includes('steps.panel-declare'));
  assert.equal(C.FlowviewCompatibility.features['steps.panel-declare'].since, '0.2.0');
  const clean = fixture();
  clean.steps.forEach(step => Object.values(step.panels).forEach(patch => { delete patch.declare; if (patch.enterOnce) delete patch.enterOnce.declare; }));
  assert.ok(!C.FlowviewCompatibility.detect(clean).includes('steps.panel-declare'));
  const onceOnly = fixture();
  onceOnly.steps.forEach(step => Object.values(step.panels).forEach(patch => { delete patch.declare; }));
  assert.ok(C.FlowviewCompatibility.detect(onceOnly).includes('steps.panel-declare'));
});

/* ---- player: effective declaration per step and the panel title ---- */
class FakeElement {
  constructor(tag){
    this.tagName = String(tag || 'div').toUpperCase(); this.children = []; this.parentNode = null; this.attributes = Object.create(null);
    this.style = {}; this.dataset = {}; this.textContent = ''; this._html = ''; this.inert = false; this.firstChild = null;
    const classes = new Set(), self = this;
    this.classList = {
      add(...names){ names.forEach(n => classes.add(n)); self._syncClass(); },
      remove(...names){ names.forEach(n => classes.delete(n)); self._syncClass(); },
      toggle(name, force){ const on = force === undefined ? !classes.has(name) : !!force; on ? classes.add(name) : classes.delete(name); self._syncClass(); return on; },
      contains(name){ return classes.has(name); }
    };
    this._classes = classes;
  }
  _syncClass(){ this._className = Array.from(this._classes).join(' '); }
  get className(){ return this._className || ''; }
  set className(value){ this._classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(n => this._classes.add(n)); this._syncClass(); }
  get innerHTML(){ return this._html; }
  set innerHTML(value){ this._html = String(value); this.children = []; }
  appendChild(child){ child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, before){ child.parentNode = this; const at = this.children.indexOf(before); at < 0 ? this.children.push(child) : this.children.splice(at, 0, child); return child; }
  removeChild(child){ const at = this.children.indexOf(child); if (at < 0) throw new Error('not a child'); this.children.splice(at, 1); child.parentNode = null; return child; }
  setAttribute(name, value){ this.attributes[name] = String(value); }
  getAttribute(name){ return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name){ return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  removeAttribute(name){ delete this.attributes[name]; }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  closest(){ return null; }
  contains(){ return false; }
  matches(){ return false; }
  addEventListener(){} removeEventListener(){} focus(){} blur(){}
  getBoundingClientRect(){ return {left:0, top:0, width:300, height:200, right:300, bottom:200}; }
}
function playerContext(){
  const P = {URL, TextEncoder, console, setTimeout, clearTimeout, requestAnimationFrame: () => 0, cancelAnimationFrame(){}, Map, Set};
  P.document = {createElement: tag => new FakeElement(tag), createElementNS: (ns, tag) => new FakeElement(tag), body: new FakeElement('body')};
  P.window = P;
  vm.createContext(P);
  for (const file of ['compatibility.js','canon.js','validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
    vm.runInContext(readSource(file), P, {filename:file});
  return P;
}
const titleOf = card => { const t = card.children.find(c => c.classList.contains('ptitle')); return t ? t.textContent : null; };

test('the player renders each step with its effective declaration and keeps the heading in sync', () => {
  const P = playerContext();
  const d = fixture();
  d.panels.push({id:'untitled', type:'gauge', max:10, initial:{value:1}});
  d.steps[1].panels.untitled = {declare:{title:'Now titled'}};
  d.steps[3].panels.untitled = {declare:{title:null}};
  const aside = new FakeElement('aside');
  const happy = P.diagramForPath(d, 'happy');
  const ctl = P.buildPanels(aside, happy, 'pastel', null, null);
  const card = id => aside.children.find(c => c.getAttribute('data-dv-panel') === String(d.panels.findIndex(p => p.id === id)));
  assert.equal(titleOf(card('g')), 'Draw');
  assert.equal(titleOf(card('untitled')), null);
  assert.match(card('g').children.find(c => c.classList.contains('pbody')).innerHTML, /gaugeunit">mA</);
  ctl.setStep(1, true);
  assert.equal(titleOf(card('g')), 'Draw (watts)');
  assert.equal(titleOf(card('untitled')), 'Now titled');
  assert.equal(card('untitled').children[0].classList.contains('ptitle'), true, 'a created heading precedes the body');
  assert.match(card('g').children.find(c => c.classList.contains('pbody')).innerHTML, /gaugeunit">W</);
  assert.match(card('t').children.find(c => c.classList.contains('pbody')).innerHTML, /<th scope="col">Value<\/th>/);
  ctl.setStep(2, false);
  assert.match(card('t').children.find(c => c.classList.contains('pbody')).innerHTML, /<th scope="col">Zed<\/th>/);
  ctl.setStep(3, true);
  assert.equal(titleOf(card('untitled')), null, 'null restores the missing heading');
  assert.equal(titleOf(card('g')), 'Draw (watts)');
  ctl.setStep(0, false, true);
  assert.equal(titleOf(card('g')), 'Draw', 'ambient uses step zero');
  ctl.setDiagram(P.diagramForPath(d, 'alt'));
  ctl.setStep(1, false);
  assert.equal(titleOf(card('g')), 'Draw');
  assert.match(card('t').children.find(c => c.classList.contains('pbody')).innerHTML, /<th scope="col">Value<\/th>/);
  ctl.destroy();
  /* Without any override the DOM is built exactly as before: title first, body second, no extra nodes. */
  const plainAside = new FakeElement('aside');
  const clean = fixture(); clean.steps.forEach(step => Object.values(step.panels).forEach(patch => { delete patch.declare; if (patch.enterOnce) delete patch.enterOnce.declare; }));
  P.buildPanels(plainAside, P.diagramForPath(clean, 'happy'), 'pastel', null, null);
  plainAside.children.forEach(cardEl => assert.deepEqual(cardEl.children.map(c => c.className), ['ptitle','pbody']));
});

/* One type-specific declaration field per registered panel type, taken from
   the picker template. Every step of both paths renders headlessly with and
   without presentation animation; the heading must follow the override. */
const SWEEP = {
  state: t => ({states: ['idle','busy','done']}),
  leds: t => ({leds: t.leds.concat([{id:'extra', label:'Extra'}])}),
  gauge: t => ({max: 999, unit: 'W'}),
  log: t => ({tags: Object.assign({}, t.tags, {SEC: '#F87171'})}),
  screen: t => ({scene: 'raccoon-at-night'}),
  image: t => ({caption: 'Changed caption'}),
  waterfall: t => ({spans: t.spans.concat([{id:'extra', label:'Extra', ms: 15}])}),
  orbit: t => ({states: t.states.slice().reverse()}),
  zoneframe: t => ({zones: t.zones.map(z => Object.assign({}, z, {id: z.id + '-2'}))}),
  xray: t => ({layers: t.layers.concat([{id:'extra', label:'Extra', holder:'nobody'}])}),
  queue: t => ({}),
  thermo: t => ({max: 150, crit: 120}),
  battery: t => ({low: 50}),
  buffer: t => ({segments: 24}),
  radar: t => ({range: 12}),
  homemap: t => ({outline: {w: 160, h: 90}}),
  signal: t => ({links: t.links.concat([{id:'extra', label:'Extra', transport:'wifi'}])}),
  tiles: t => ({tiles: t.tiles.concat([{id:'extra', label:'Extra'}])}),
  inflight: t => ({lanes: t.lanes.concat([{id:'extra', label:'Extra'}])}),
  phone: t => ({brand: {app: 'Changed app'}}),
  deviceapp: t => ({subtitle: 'Changed subtitle'}),
  appscreens: t => ({frame: 'phone'}),
  timeline: t => ({span: '12h'}),
  table: t => ({columns: t.columns.concat([{id:'extra', label:'Extra'}])}),
  'data-contract': t => ({fieldWidth: 220}),
  checks: t => ({checks: t.checks.concat([{id:'extra', label:'Extra'}])}),
  budget: t => ({metrics: t.metrics.map(m => Object.assign({}, m, {max: m.max * 2}))}),
  cost: t => ({currency: 'EUR'}),
  trace: t => ({spans: t.spans.map(s => Object.assign({}, s, {ms: s.ms + 1}))}),
  replicas: t => ({unit: 'rows'}),
  chime: t => ({}),
  dispatch: t => ({agency: 'County response'}),
  security: t => ({site: 'Elm House'}),
  sequence: t => ({wrap: 40}),
  frames: t => ({start: 101}),
  reads: t => ({maxReads: 6}),
  locus: t => ({unit: 'bp'}),
  funnel: t => ({unit: 'fragments'}),
  grid: t => ({decimals: 1})
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';

test('every registered panel type renders every step of both paths under a declaration override without throwing', () => {
  const P = playerContext();
  const types = Array.from(P.PanelRegistry.types());
  assert.deepEqual(types.filter(type => !SWEEP[type]), [], 'add a sweep entry for new panel types');
  for (const type of types){
    const sample = P.panelPickerExample(type, {referenceImage: PNG});
    const panel = plain(sample.panel);
    const override = Object.assign({title: 'Changed ' + type}, SWEEP[type](panel));
    const alternate = Object.assign({title: 'Alternate ' + type}, SWEEP[type](panel));
    const d = {nodes:{a:{title:'A'}, b:{title:'B'}}, rows:[['a','b']], edges:[{from:'a',to:'b'}], panels:[panel],
      steps:[
        {id:'s1', text:'Start', edge:'a->b'},
        {id:'s2', text:'Override', nodes:['a'], panels:{[panel.id]:{declare: override}}},
        {id:'s3', text:'Once', nodes:['b'], panels:{[panel.id]:{enterOnce:{declare:{title: 'Once ' + type}}}}},
        {id:'s4', text:'Shared end', edge:'a->b'},
        {id:'s5', text:'Alternate', nodes:['a'], panels:{[panel.id]:{declare: alternate}}}
      ],
      paths:[{id:'happy', steps:['s1','s2','s3','s4']},{id:'alt', steps:['s1','s5','s4']}]};
    const v = plain(P.validate(P.normalize(page(d))));
    assert.deepEqual(v.errors, [], type);
    assert.deepEqual(v.warnings.filter(w => w.includes('.declare')), [], type + ': the override must be accepted');
    for (const route of ['happy','alt']){
      const sub = P.diagramForPath(d, route);
      const decls = P.foldDiagramPanelDeclarations(sub)[panel.id];
      assert.notEqual(decls[1], sub.panels[0], type + ' ' + route + ' overrides at step 2');
      const aside = new FakeElement('aside');
      let ctl;
      assert.doesNotThrow(() => { ctl = P.buildPanels(aside, sub, 'aurora', null, null); }, type + ' ' + route + ' build');
      const card = aside.children[0];
      assert.equal(titleOf(card), panel.title, type + ' ' + route + ' starts with the authored title');
      for (const animate of [false, true]) sub.steps.forEach((step, index) => {
        assert.doesNotThrow(() => ctl.setStep(index, animate), type + ' ' + route + ' step ' + (index + 1) + (animate ? ' animated' : ''));
        const expected = route === 'happy' ? [panel.title, 'Changed ' + type, 'Once ' + type, 'Changed ' + type][index] : [panel.title, 'Alternate ' + type, 'Alternate ' + type][index];
        assert.equal(titleOf(card), expected, type + ' ' + route + ' title at step ' + (index + 1));
        const body = card.children.find(c => c.classList.contains('pbody'));
        assert.doesNotMatch(body.innerHTML, /\bNaN\b|\bundefined\b|Infinity/, type + ' ' + route + ' step ' + (index + 1));
      });
      assert.doesNotThrow(() => ctl.setStep(0, false, true), type + ' ambient');
      ctl.destroy();
    }
  }
});

/* ---- workbench: step form field, duration and effective-state view ---- */
test('declare is an Advanced JSON step field for every typed form, never a starting-state field, with a one-step duration', () => {
  for (const type of Array.from(C.PanelRegistry.types())){
    const sample = C.panelPickerExample(type, {referenceImage: PNG});
    const fields = C.panelPatchFields(sample.panel);
    if (fields === null) continue;
    const last = plain(fields.at(-1));
    assert.deepEqual(last.slice(0, 2), ['declare', 'json'], type);
    const meta = C.panelFieldPresentation(sample.panel, fields.at(-1), 'step');
    assert.equal(meta.label, 'Declaration overrides'); assert.equal(meta.advanced, true); assert.match(meta.help, /null restores/);
    assert.equal(C.panelFieldSupportsOnce(type, 'declare'), true);
  }
  assert.deepEqual(plain(C.patchFieldsCollect(C.panelPatchFields({type:'gauge'}), {value:'5', declare:'{"max":200}'})), {item:{value:5, declare:{max:200}}});
  assert.match(C.patchFieldsCollect(C.panelPatchFields({type:'gauge'}), {declare:'[1]'}).error, /JSON object/);
  assert.match(C.patchFieldsCollect(C.panelPatchFields({type:'gauge'}), {declare:'null'}).error, /JSON object/);
  const raw = page(fixture()), text = JSON.stringify(raw);
  const once = C.planPanelFieldDuration(text, raw, {kind:'step', section:0, index:1}, 'g', 'declare', 'once', JSON.stringify(raw.page.sections[0].diagram.steps[1].panels.g));
  assert.equal(once.error, undefined, once.error);
  const moved = JSON.parse(once.text).page.sections[0].diagram.steps[1].panels.g;
  assert.deepEqual(moved, {value:40, enterOnce:{declare:{max:200, unit:'W', title:'Draw (watts)'}}});
  const back = C.planPanelFieldDuration(once.text, JSON.parse(once.text), {kind:'step', section:0, index:1}, 'g', 'declare', 'carry', JSON.stringify(moved));
  assert.deepEqual(JSON.parse(back.text).page.sections[0].diagram.steps[1].panels.g, {value:40, declare:{max:200, unit:'W', title:'Draw (watts)'}});
  assert.match(C.planPanelFieldDuration(text, raw, {kind:'step', section:0, index:1}, 'g', 'value', 'once').error || '', /does not support temporary/);
});

test('the effective-state inspector lists the overridden declaration keys with their authoring steps and never throws', () => {
  const d = fixture();
  const model = C.builderEffectivePanelStates(d, 2, 'happy');
  assert.equal(model.error, undefined, model.error);
  const gauge = model.panels.find(p => p.id === 'g'), table = model.panels.find(p => p.id === 't'), log = model.panels.find(p => p.id === 'l');
  assert.deepEqual(plain(gauge.fields.map(f => f.key)), ['log','value','declare']);
  const declare = gauge.fields.find(f => f.key === 'declare');
  assert.deepEqual(plain(declare.value), {title:'Draw (watts)', unit:'W', max:50});
  assert.deepEqual(plain(declare.origin.inputs.map(i => [i.step, i.path.join('.')])), [[1,'steps.1.panels.g.declare'],[2,'steps.2.panels.g.enterOnce.declare']]);
  assert.deepEqual(plain(table.fields.find(f => f.key === 'declare').value), {columns:[{id:'k',label:'Key'},{id:'z',label:'Zed'}]});
  assert.equal(log.fields.some(f => f.key === 'declare'), false, 'panels without overrides are unchanged');
  assert.equal(C.builderEffectivePanelStates(d, 3, 'happy').panels.find(p => p.id === 'g').fields.find(f => f.key === 'declare').value.max, undefined, 'null restored max');
  assert.equal(C.builderEffectivePanelStates(d, 4, 'alt').panels.find(p => p.id === 'g').fields.some(f => f.key === 'declare'), false, 'the alternate path never saw it');
  assert.equal(C.builderEffectivePanelStates(d, 0, 'happy').panels.find(p => p.id === 'g').fields.some(f => f.key === 'declare'), false);
});

/* ---- data-contract: its public override keys ride the shared merge ---- */
test('data-contract columns, fields and fieldWidth flow through the shared declaration merge with unchanged precedence and warnings', () => {
  const base = plain(C.panelPickerExample('data-contract').panel);
  base.id = 'dc'; base.initial = {fields:[{id:'order-id',label:'order_id'},{id:'from-initial',label:'from_initial'}], highlights:{}};
  const d = {nodes:{a:{title:'A'}}, rows:[['a']], panels:[base],
    steps:[
      {id:'s1', text:'One', nodes:['a'], panels:{dc:{highlights:{'from-initial':{color:'blue'}}}}},
      {id:'s2', text:'Two', nodes:['a'], panels:{dc:{fields:[{id:'late',label:'late'}], fieldWidth:10, columns:'bad', enterOnce:{fieldWidth:240}}}},
      {id:'s3', text:'Three', nodes:['a'], panels:{dc:{highlights:{'from-initial':{color:'red'}, late:{color:'green'}}}}},
      {id:'s4', text:'Alt', nodes:['a'], panels:{dc:{highlights:{late:{color:'green'}}}}}
    ],
    paths:[{id:'happy', steps:['s1','s2','s3']},{id:'alt', steps:['s1','s4']}]};
  const decls = C.foldDiagramPanelDeclarations(C.diagramForPath(d, 'happy')).dc;
  assert.deepEqual(plain(decls.map(x => x.fields.map(f => f.id))), [['order-id','from-initial'],['late'],['late']], 'initial then steps override declared fields');
  assert.deepEqual(plain(decls.map(x => x.fieldWidth)), [180, 240, 180], 'a width under 40 is ignored, enterOnce applies once');
  assert.deepEqual(plain(decls.map(x => x.columns.length)), [4, 4, 4], 'a non-array columns value never replaces the declaration');
  assert.equal(plain(C.foldDiagramPanelDeclarations(C.diagramForPath(d, 'alt')).dc[1].fields.map(f => f.id)).join(), 'order-id,from-initial');
  const v = validate(d);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings.filter(w => w.includes('.panels.dc')), [
    'sections[0].diagram.steps[1].panels.dc.fieldWidth: use a width of at least 40 pixels — using declared width',
    'sections[0].diagram.steps[1].panels.dc.columns: needs 1–12 entries with unique string ids',
    'sections[0].diagram.steps[2].panels.dc.highlights.from-initial: unknown declared id — ignored',
    'sections[0].diagram.steps[3].panels.dc.highlights.late: unknown declared id — ignored'
  ]);
  /* State keys keep winning over an explicit declare at the same step; a declare alone also works. */
  const mixed = plain(d);
  mixed.steps[1].panels.dc.declare = {fields:[{id:'from-declare',label:'x'}], fieldWidth:300};
  const mixedDecls = C.foldDiagramPanelDeclarations(C.diagramForPath(mixed, 'happy')).dc;
  assert.deepEqual(plain([mixedDecls[1].fields.map(f => f.id), mixedDecls[1].fieldWidth, mixedDecls[2].fieldWidth]), [['late'], 240, 300]);
  const states = C.foldPanelStates(C.diagramForPath(d, 'happy')).dc;
  assert.deepEqual(plain(states.map(s => s.fieldWidth)), [null, 240, 10], 'state folding is untouched');
  const folded = C.foldPanelStates(C.diagramForPath(d, 'happy')).dc;
  assert.deepEqual(plain(folded[1].fields.map(f => f.id)), ['late']);
  assert.ok(!C.builderEffectivePanelStates(d, 2, 'happy').panels[0].fields.some(f => f.key === 'declare'), 'derived overrides are not shown as declare');
});
