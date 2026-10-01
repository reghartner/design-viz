'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
function load(extra = {}){
  const ctx = {...extra};
  vm.runInNewContext(['validator.js', 'engine.js', 'builder.workbench.js'].map(f =>
    readSource(f)).join('\n'), ctx);
  return ctx;
}
const C = load();
const names = ['person-at-door-night', 'person-through-door', 'doorbell-run-away', 'doorbell-runners', 'package-drop', 'kitchen-fire', 'raccoon-at-night', 'static-noise'];
const plain = v => JSON.parse(JSON.stringify(v));
const screenCss = () => [].concat(C.PanelRegistry.get('screen').styles).map(s => typeof s === 'string' ? s : s.css).join('\n');
function host(){
  const box = {className:'', overlays:'', overlayWrites:0, querySelectorAll(){return [];},
    insertAdjacentHTML(where, html){this.overlays = html;this.overlayWrites++;}};
  return {writes:0, html:'', box,
    set innerHTML(value){this.html = value; this.writes++;},
    get innerHTML(){return this.html;},
    querySelector(s){return s === '.screenbox' ? box : null;}};
}

test('screen registry, validator and workbench agree, and every clip renders in all modes', () => {
  assert.deepEqual(Array.from(C.SCENE_NAMES), names);
  assert.deepEqual(Array.from(C.SCENE_TOKENS), names);
  assert.deepEqual(Object.keys(C.SCENES).sort(), [...names].sort());
  for (const scene of names){
    assert.equal(typeof C.SCENE_LABELS[scene], 'string');
    const panel = {id:'cam', type:'screen', scene};
    const valid = C.validate(C.normalize({nodes:{a:{}},rows:[['a']],panels:[panel]}));
    assert.equal(valid.errors.length, 0, valid.errors.join('; '));
    assert.equal(valid.warnings.length, 0, valid.warnings.join('; '));
    for (const mode of ['off', 'boot', 'active', 'live', 'rec', 'save', 'playing']){
      const h = host(); C.renderPanelBody(h, panel, {mode}, 'aurora');
      if (mode === 'off') assert.ok(!h.innerHTML.includes('<svg'));
      else assert.ok(h.innerHTML.includes(C.SCENES[mode === 'boot' ? 'static-noise' : scene]));
    }
  }
});

test('same clip survives active, live, record, save and banner changes; a different clip replaces it', () => {
  for (const scene of names){
    const h = host(), panel = {id:'cam',type:'screen',scene};
    C.renderPanelBody(h, panel, {mode:'live'}, 'aurora');
    for (const mode of ['active', 'rec', 'save', 'playing', 'live', 'active']){
      C.renderPanelBody(h, panel, {mode,banner:'<new clip>'}, 'aurora');
      assert.equal(h.writes, 1, scene + ' scene must survive ' + mode);
      assert.equal(h.box.className, 'screenbox m-' + mode);
      if (mode === 'save' || mode === 'playing') assert.ok(h.box.overlays.includes('&lt;new clip&gt;'));
    }
    const replacement = scene === 'kitchen-fire' ? 'person-through-door' : 'kitchen-fire';
    for (const mode of ['active', 'live', 'rec', 'save', 'playing']){
      const swap = host();
      C.renderPanelBody(swap, panel, {mode:'live'}, 'aurora');
      C.renderPanelBody(swap, {...panel,scene:replacement}, {mode}, 'aurora');
      assert.equal(swap.writes, 2, 'scene change during ' + mode + ' replaces SVG');
      assert.ok(swap.innerHTML.includes(C.SCENES[replacement]));
    }
    C.renderPanelBody(h, panel, {mode:'off'}, 'aurora');
    C.renderPanelBody(h, panel, {mode:'live'}, 'aurora');
    assert.equal(h.writes, 3, 'returning from standby starts a fresh clip');
  }
});

test('an unknown scene replaces an old clip with safe static noise', () => {
  const h = host();
  const p = {id:'cam',type:'screen',scene:'kitchen-fire'};
  C.renderPanelBody(h, p, {mode:'live'}, 'aurora');
  C.renderPanelBody(h, {...p,scene:'<img src=x onerror=alert(1)>'}, {mode:'live'}, 'aurora');
  assert.equal(h.writes, 2);
  assert.ok(h.innerHTML.includes(C.SCENES['static-noise']));
  assert.ok(!h.innerHTML.includes('<img'));
});

test('scene events can wait and restart independently of recording without replacing REC or the scene', () => {
  for (const scene of names){
    const panel = {id:'cam',type:'screen',scene}, h = host();
    C.renderPanelBody(h, panel, {mode:'rec',scenePlayback:'waiting'}, 'pastel');
    assert.match(h.innerHTML, /screenbox m-rec scene-waiting/);
    assert.match(h.innerHTML, /class="recdot"/);
    for (const scenePlayback of ['playing','waiting','playing']){
      C.renderPanelBody(h, panel, {mode:'rec',scenePlayback}, 'pastel');
      assert.equal(h.writes, 1, 'the same scene DOM survives event changes');
      assert.equal(h.box.overlayWrites, 0, 'recording indicator is never replaced by a scene event change');
      assert.equal(h.box.className, 'screenbox m-rec' + (scenePlayback === 'waiting' ? ' scene-waiting' : ''));
    }
    C.renderPanelBody(h, panel, {mode:'save',scenePlayback:'waiting'}, 'pastel');
    assert.equal(h.box.className, 'screenbox m-save scene-waiting');
    assert.equal(h.box.overlayWrites, 1, 'only recording mode changes its overlay');
    for (const mode of ['off','boot']){
      C.renderPanelBody(h, panel, {mode,scenePlayback:'waiting'}, 'pastel');
      assert.doesNotMatch(h.innerHTML, /scene-waiting/);
    }
  }
});

test('scene playback carries independently along each path and direct jumps honor the target state', () => {
  const d = {nodes:{a:{}},rows:[['a']],panels:[{id:'cam',type:'screen',scene:'person-through-door',initial:{mode:'off',scenePlayback:'waiting'}}],
    steps:[{id:'record',panels:{cam:{mode:'rec'}}},{id:'wait'},
      {id:'event',panels:{cam:{scenePlayback:'playing'}}},{id:'save',panels:{cam:{mode:'save'}}},{id:'quiet'}],
    paths:[{id:'happy',steps:['record','wait','event','save']},{id:'uneventful',steps:['record','wait','quiet']}]};
  const happy = C.foldPanelStates(C.diagramForPath(d,'happy')).cam;
  const quiet = C.foldPanelStates(C.diagramForPath(d,'uneventful')).cam;
  assert.deepEqual(Array.from(happy,s=>[s.mode,s.scenePlayback]), [['rec','waiting'],['rec','waiting'],['rec','playing'],['save','playing']]);
  assert.deepEqual(Array.from(quiet,s=>[s.mode,s.scenePlayback]), [['rec','waiting'],['rec','waiting'],['rec','waiting']]);
  const h = host(); C.renderPanelBody(h,d.panels[0],happy[2],'pastel');
  assert.doesNotMatch(h.innerHTML,/scene-waiting/); assert.match(h.innerHTML, /class="recdot"/);
  C.renderPanelBody(h,d.panels[0],quiet[2],'pastel');
  assert.equal(h.box.className,'screenbox m-rec scene-waiting');
  const before = JSON.stringify(d);
  const plan = C.planStepSetPanelPatch(JSON.stringify(d),d,0,2,'cam',JSON.stringify({scenePlayback:'waiting'}));
  assert.ok(!plan.error,plan.error);
  assert.equal(JSON.stringify(d),before);
  assert.deepEqual(JSON.parse(plan.text).steps[2].panels.cam,{scenePlayback:'waiting'});
});

test('scene playback validates initial, step, and transient patches with legacy playing defaults', () => {
  for (const value of ['waiting','playing',undefined,null,true,'paused','<script>']){
    const d = {nodes:{a:{}},rows:[['a']],panels:[{id:'cam',type:'screen',scene:'kitchen-fire',initial:{mode:'rec',scenePlayback:value}}],
      steps:[{panels:{cam:{scenePlayback:value}}},{panels:{cam:{enterOnce:{scenePlayback:value}}}}]};
    const result = C.validate(C.normalize(d));
    assert.equal(result.errors.length,0);
    const invalid = !['waiting','playing',undefined].includes(value);
    // JSON sources omit undefined values; validate that serialized form.
    const jsonResult = C.validate(C.normalize(JSON.parse(JSON.stringify(d))));
    assert.equal(jsonResult.warnings.filter(w=>w.includes('.scenePlayback:')).length, invalid ? 3 : 0);
    const h = host(); C.renderPanelBody(h,d.panels[0],d.panels[0].initial,'pastel');
    assert.equal(h.innerHTML.includes('scene-waiting'),value==='waiting');
    assert.doesNotMatch(h.innerHTML,/<script>/);
  }
  const fields = C.panelPatchFields({type:'screen'});
  assert.equal(C.patchFieldsCollect(fields,{scenePlayback:'waiting'}).item.scenePlayback,'waiting');
});

function element(tag){
  return {tag,children:[],attributes:{},listeners:{},writes:0,
    appendChild(child){this.children.push(child);return child;},
    setAttribute(key,value){this.attributes[key] = value;},
    addEventListener(event,fn){this.listeners[event] = fn;},
    set innerHTML(value){this.html=value;this.writes++;},
    get innerHTML(){return this.html;}};
}
test('preview replays the selected clip locally and safely handles absent or unknown scenes', () => {
  const B = load({document:{createElement:element}});
  const first = B.screenScenePreview('person-through-door');
  const other = B.screenScenePreview('package-drop');
  const box = first.element.children[0];
  const button = first.element.children[1].children[1];
  assert.equal(box.innerHTML, B.SCENES['person-through-door']);
  assert.match(box.attributes['aria-label'], /Person walking through a door/);
  first.setScene('kitchen-fire');
  assert.equal(box.innerHTML, B.SCENES['kitchen-fire']);
  assert.match(box.attributes['aria-label'], /Kitchen fire/);
  const writes = box.writes;
  button.listeners.click();
  assert.equal(box.writes, writes + 1);
  assert.equal(box.innerHTML, B.SCENES['kitchen-fire']);
  assert.equal(other.element.children[0].writes, 1, 'replay is local to this preview');
  for (const scene of [undefined, null, '', 'constructor', '<img src=x>']){
    first.setScene(scene);
    assert.equal(box.innerHTML, B.SCENES['static-noise']);
  }
});

test('screen clip starter records before each scene event begins, then plays a saved raccoon clip', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT,'src/starters/screen-clips.json'),'utf8'));
  const result = C.validate(C.normalize(plain(raw)));
  assert.equal(result.errors.length, 0, result.errors.join('; '));
  assert.equal(result.warnings.length, 0, result.warnings.join('; '));
  assert.deepEqual(raw.page.sections.map(s => s.diagram.panels[0].scene), ['doorbell-run-away','doorbell-runners','person-through-door','kitchen-fire','raccoon-at-night']);
  for (const s of raw.page.sections.slice(0, 4)){
    const states = C.foldPanelStates(s.diagram)['camera-view'];
    assert.deepEqual(Array.from(states,s=>s.mode), ['off','live','rec','rec','save']);
    assert.deepEqual(Array.from(states,s=>s.scenePlayback), ['waiting','waiting','waiting','playing','playing']);
    assert.deepEqual(s.diagram.steps[3].panels['camera-view'],{scenePlayback:'playing'});
  }
  const raccoon = raw.page.sections[4].diagram, states = C.foldPanelStates(raccoon)['camera-view'];
  assert.deepEqual(Array.from(states,s=>s.mode), ['off','rec','rec','save','off','playing']);
  assert.deepEqual(Array.from(states,s=>s.scenePlayback), ['waiting','waiting','playing','playing','playing','playing']);
  const h = host(); C.renderPanelBody(h, raccoon.panels[0], states[1], 'pastel');
  assert.match(h.innerHTML, /screenbox m-rec scene-waiting/);
  const play = host(); C.renderPanelBody(play, raccoon.panels[0], states[5], 'pastel');
  assert.match(play.innerHTML, /screenbox m-playing"/);
  assert.match(play.innerHTML, /PLAYING<\/span>/);
  assert.ok(play.innerHTML.includes(C.SCENES['raccoon-at-night']));
});

test('mode playing is recorded-clip playback: validated, rendered, edited and carried apart from scenePlayback', () => {
  const panel = {id:'cam',type:'screen',scene:'package-drop'};
  for (const [mode, warns] of [['playing',0],['Playing',1],['play',1]]){
    const d = {nodes:{a:{}},rows:[['a']],panels:[{...panel,initial:{mode}}],steps:[{panels:{cam:{mode}}},{panels:{cam:{enterOnce:{mode}}}}]};
    const result = C.validate(C.normalize(d));
    assert.equal(result.errors.length, 0);
    assert.equal(Array.from(result.warnings).filter(w => w.includes('.mode:')).length, warns * 3, mode);
  }
  const h = host();
  C.renderPanelBody(h, panel, {mode:'playing',banner:'<b>Package clip</b>'}, 'aurora');
  assert.match(h.innerHTML, /screenbox m-playing"/);
  assert.match(h.innerHTML, /<span class="ovl playchip"><span class="playglyph" aria-hidden="true"><\/span>PLAYING<\/span>/);
  assert.match(h.innerHTML, /<span class="ovl cliptitle">&lt;b&gt;Package clip&lt;\/b&gt;<\/span>/);
  assert.doesNotMatch(h.innerHTML, /recdot|livechip|activechip|offlabel|SAVING CLIP|<b>/);
  assert.ok(h.innerHTML.includes(C.SCENES['package-drop']));
  const untitled = host(); C.renderPanelBody(untitled, panel, {mode:'playing',banner:'  '}, 'aurora');
  assert.doesNotMatch(untitled.innerHTML, /cliptitle/);
  // Playback mode and the scene event gate stay independent.
  const waiting = host(); C.renderPanelBody(waiting, panel, {mode:'playing',scenePlayback:'waiting'}, 'aurora');
  assert.match(waiting.innerHTML, /screenbox m-playing scene-waiting/);
  assert.match(waiting.innerHTML, /PLAYING<\/span>/);
  // REC -> PLAYING keeps the same clip DOM and swaps only the chip.
  const r = host(); C.renderPanelBody(r, panel, {mode:'rec'}, 'aurora');
  C.renderPanelBody(r, panel, {mode:'playing'}, 'aurora');
  assert.equal(r.writes, 1); assert.equal(r.box.className, 'screenbox m-playing'); assert.match(r.box.overlays, /PLAYING/);
  // Carry and one-step overrides.
  const d = {nodes:{a:{}},rows:[['a']],panels:[{...panel,initial:{mode:'off'}}],
    steps:[{id:'rec',panels:{cam:{mode:'rec'}}},{id:'peek',panels:{cam:{enterOnce:{mode:'playing'}}}},{id:'after'},
      {id:'play',panels:{cam:{mode:'playing',banner:'Clip'}}},{id:'hold'}]};
  assert.deepEqual(Array.from(C.foldPanelStates(d).cam, s => s.mode), ['rec','playing','rec','playing','playing']);
  // Inspector offers playing with a label distinct from Scene event's "Play event".
  const fields = C.panelPatchFields(panel);
  assert.ok(fields.find(f => f[0] === 'mode')[2].includes('playing'));
  assert.equal(C.patchFieldsCollect(fields, {mode:'playing'}).item.mode, 'playing');
  const option = value => ({value, textContent:value});
  const modeInput = {options:['', 'rec', 'playing'].map(option), setAttribute(){}};
  const playInput = {options:['', 'waiting', 'playing'].map(option), setAttribute(){}};
  const editor = C.PanelRegistry.get('screen').authoring.editor({});
  editor.patchField(['mode','enum',fields[0][2]], modeInput, {});
  editor.patchField(['scenePlayback','enum',['waiting','playing']], playInput, {});
  assert.equal(modeInput.options[2].textContent, 'playing (recorded clip playback)');
  assert.equal(playInput.options[2].textContent, 'Play event');
  const before = JSON.stringify(d), plan = C.planStepSetPanelPatch(before, d, 0, 3, 'cam', JSON.stringify({mode:'playing',banner:'Clip'}));
  assert.ok(!plan.error, plan.error); assert.equal(JSON.parse(plan.text).steps[3].panels.cam.mode, 'playing'); assert.equal(JSON.stringify(d), before);
});

test('per-state scene override carries, resets to the declaration with null and rejects unknown values safely', () => {
  const panel = {id:'cam',type:'screen',scene:'package-drop'};
  const hostile = '<img src=x onerror=alert(1)>';
  const d = {nodes:{a:{}},rows:[['a']],panels:[{...panel,initial:{mode:'off'}}],steps:[
    {id:'animal',panels:{cam:{mode:'rec',scene:'raccoon-at-night'}}},{id:'saved',panels:{cam:{mode:'save'}}},
    {id:'bad',panels:{cam:{scene:hostile}}},{id:'courier',panels:{cam:{mode:'rec',scene:null}}},
    {id:'once',panels:{cam:{enterOnce:{scene:'kitchen-fire'}}}},{id:'after'},{id:'proto',panels:{cam:{scene:'constructor'}}}]};
  const result = C.validate(C.normalize(plain(d)));
  const sceneWarnings = Array.from(result.warnings).filter(w => w.includes('.scene:'));
  assert.equal(sceneWarnings.length, 2);
  assert.ok(sceneWarnings.every(w => !w.includes('<img') && !w.includes('constructor')));
  const states = C.foldPanelStates(d).cam;
  assert.deepEqual(Array.from(states, s => s.scene === undefined ? 'unset' : s.scene),
    ['raccoon-at-night','raccoon-at-night','raccoon-at-night',null,'kitchen-fire',null,null]);
  const expected = ['raccoon-at-night','raccoon-at-night','raccoon-at-night','package-drop','kitchen-fire','package-drop','package-drop'];
  states.forEach((s, i) => {
    const h = host(); C.renderPanelBody(h, panel, s, 'aurora');
    assert.ok(h.innerHTML.includes(C.SCENES[expected[i]]), d.steps[i].id);
  });
  // An unsanitized override never injects markup and falls back to the declared clip.
  const raw = host(); C.renderPanelBody(raw, panel, {mode:'live',scene:hostile}, 'aurora');
  assert.ok(raw.innerHTML.includes(C.SCENES['package-drop'])); assert.doesNotMatch(raw.innerHTML, /<img/);
  // Same override across REC -> SAVE keeps the clip; switching override replaces it.
  const h = host();
  C.renderPanelBody(h, panel, states[0], 'aurora'); C.renderPanelBody(h, panel, states[1], 'aurora');
  assert.equal(h.writes, 1);
  C.renderPanelBody(h, panel, {mode:'rec',scene:null}, 'aurora');
  assert.equal(h.writes, 2); assert.ok(h.innerHTML.includes(C.SCENES['package-drop']));
  // Inspector: scene is a step field next to mode with a declared-scene reset.
  const fields = C.panelPatchFields(panel);
  assert.deepEqual(plain(fields.slice(0, 2).map(f => f.slice(0, 3))), [['mode','enum',plain(fields[0][2])],['scene','enum',names]]);
  assert.equal(fields[1][3].nullLabel, 'Use declared scene');
  assert.deepEqual(plain(C.PANEL_PATCH_FIELDS.screen.map(f => f[0])), ['mode','scenePlayback','banner','reason','audio','spotlight','siren'],
    'legacy static field list is unchanged');
  assert.ok(C.PanelRegistry.get('screen').authoring.transientFields.includes('scene'));
  const before = JSON.stringify(d), reset = C.planStepSetPanelPatch(before, d, 0, 3, 'cam', JSON.stringify({mode:'rec',scene:null}));
  assert.ok(!reset.error, reset.error); assert.equal(JSON.parse(reset.text).steps[3].panels.cam.scene, null); assert.equal(JSON.stringify(d), before);
});

test('raccoon-at-night is a masked, ring-tailed, ID-free clip that moves, waits hidden and holds a still', () => {
  const svg = C.SCENES['raccoon-at-night'];
  assert.equal(C.SCENE_LABELS['raccoon-at-night'], 'Raccoon on the porch at night');
  assert.match(svg, /class="scene scene-raccoon"/);
  for (const part of ['raccoon','raccoon-head','raccoon-tail','raccoon-leg']) assert.match(svg, new RegExp('class="' + part + '[ "]'));
  assert.match(svg, /stroke-dasharray="5 5"/, 'ringed tail');
  assert.match(svg, /#17191E/, 'dark eye mask');
  assert.match(svg, /#192D56/, 'night porch backdrop');
  for (const scene of names) assert.doesNotMatch(C.SCENES[scene], /\sid="/, scene + ' has no fixed SVG IDs');
  const css = screenCss();
  assert.match(css, /\.screenbox:is\(\.m-active,\.m-live,\.m-rec,\.m-save,\.m-playing\) \.raccoon\{animation:raccooncross/);
  assert.match(css, /@keyframes raccooncross\{[\s\S]*translate\(352px[\s\S]*35%,62%\{transform:translate\(176px,163px\)[\s\S]*translate\(-56px/);
  // Legs share the body's nine-second timeline and hold neutral for the whole sniff stop.
  assert.match(css, /\.raccoon-leg\{animation:raccoongait 9s ease-in-out forwards;\}/);
  assert.match(css, /\.raccoon-leg-back\{animation-name:raccoongaitback;\}/);
  for (const name of ['raccoongait', 'raccoongaitback']) {
    const frames = css.match(new RegExp('@keyframes ' + name + '\\{([\\s\\S]*?)\\n\\}'))[1];
    assert.match(frames, /\n  35%,62%,100%\{transform:skewX\(0\);\}/, name);
    const moving = [...frames.matchAll(/([\d.%,]+)\{transform:skewX\(-?22deg\);\}/g)].flatMap(m => m[1].split(',').map(parseFloat));
    assert.ok(moving.length >= 20 && moving.every(p => p < 35 || p > 62), name + ' strides only while the body moves');
  }
  const sniff = css.match(/\.raccoon-head\{animation:raccoonsniff ([\d.]+)s ease-in-out ([\d.]+)s (\d+) alternate;\}/);
  const [cycle, delay, count] = sniff.slice(1).map(Number);
  assert.ok(delay >= 9 * .35 && delay + cycle * count <= 9 * .62, 'sniffing happens inside the stop');
  assert.match(css, /\.screenbox\.scene-waiting :is\([^)]*\.raccoon\)\{visibility:hidden;\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\s*\.screenbox :is\([^)]*\.scene-raccoon\) \*\{animation:none !important;\}/);
  assert.match(css, /@media print\{\s*\.screenbox :is\([^)]*\.scene-raccoon\) \*\{animation:none !important;\}/);
  // Every scene animation that runs in REC/SAVE also runs in PLAYING.
  assert.doesNotMatch(css, /\.m-save\)/);
  for (const actor of ['walker','courier','courier .carried','pkg']) assert.ok(css.includes('.screenbox.m-playing .' + actor + '{'), actor);
  const h = host(); C.renderPanelBody(h, {id:'cam',type:'screen',scene:'raccoon-at-night'}, {mode:'rec',scenePlayback:'waiting'}, 'aurora');
  assert.match(h.innerHTML, /screenbox m-rec scene-waiting/);
});


test('active camera mode shows the clip with a text-only status and supports independent scene events',()=>{
  const panel={id:'cam',type:'screen',scene:'person-through-door'},h=host();
  C.renderPanelBody(h,panel,{mode:'active',scenePlayback:'waiting'},'pastel');
  assert.match(h.innerHTML,/screenbox m-active scene-waiting/);
  assert.ok(h.innerHTML.includes(C.SCENES['person-through-door']));
  assert.match(h.innerHTML,/<span class="ovl activechip">ACTIVE<\/span>/);
  assert.doesNotMatch(h.innerHTML,/recdot|recchip|livechip|offlabel/);
  C.renderPanelBody(h,panel,{mode:'active',scenePlayback:'playing'},'pastel');
  assert.equal(h.writes,1);assert.equal(h.box.className,'screenbox m-active');assert.equal(h.box.overlayWrites,0);
  const fields=C.panelPatchFields(panel);
  assert.equal(C.patchFieldsCollect(fields,{mode:'active'}).item.mode,'active');
  const d={nodes:{a:{}},rows:[['a']],panels:[{...panel,initial:{mode:'active'}}],steps:[{panels:{cam:{mode:'rec'}}},{panels:{cam:{mode:'active'}}}]};
  assert.equal(C.validate(C.normalize(d)).errors.length,0);
  const before=JSON.stringify(d),edit=C.planStepSetPanelPatch(before,d,0,0,'cam',JSON.stringify({mode:'active'}));
  assert.ok(!edit.error,edit.error);assert.equal(JSON.parse(edit.text).steps[0].panels.cam.mode,'active');assert.equal(JSON.stringify(d),before);
});
