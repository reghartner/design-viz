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
  let diagrams = 0, paths = 0;
  for (const rel of specFiles()){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (ex) { continue; }
    for (const d of diagramsOf(raw)){
      diagrams++;
      for (const route of C.diagramPathList(d)){
        paths++;
        const sub = forPath(d, route.id);
        assert.deepEqual(plain(C.foldPanelStates(sub)), plain(referenceFold(sub)), rel + ' ' + route.id);
        const decls = C.foldDiagramPanelDeclarations(sub);
        (sub.panels || []).forEach(panel => {
          if (!panel || !panel.id) return;
          assert.ok(decls[panel.id].every(decl => decl === panel), rel + ' ' + panel.id + ' has no overrides');
          assert.equal(decls[panel.id].length, Math.max(1, (sub.steps || []).length));
        });
      }
    }
  }
  assert.ok(diagrams > 40 && paths > 50, 'swept ' + diagrams + ' diagrams and ' + paths + ' paths');
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
