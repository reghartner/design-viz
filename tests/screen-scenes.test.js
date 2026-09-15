'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
function load(extra = {}){
  const ctx = {...extra};
  vm.runInNewContext(['validator.js', 'engine.js', 'builder.workbench.js'].map(f =>
    fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n'), ctx);
  return ctx;
}
const C = load();
const names = ['person-at-door-night', 'person-through-door', 'package-drop', 'kitchen-fire', 'static-noise'];
function host(){
  const box = {className:'', overlays:'', querySelectorAll(){return [];},
    insertAdjacentHTML(where, html){this.overlays = html;}};
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
    for (const mode of ['off', 'boot', 'live', 'rec', 'save']){
      const h = host(); C.renderPanelBody(h, panel, {mode}, 'aurora');
      if (mode === 'off') assert.ok(!h.innerHTML.includes('<svg'));
      else assert.ok(h.innerHTML.includes(C.SCENES[mode === 'boot' ? 'static-noise' : scene]));
    }
  }
});

test('same clip survives live, record, save and banner changes; a different clip replaces it', () => {
  for (const scene of names){
    const h = host(), panel = {id:'cam',type:'screen',scene};
    C.renderPanelBody(h, panel, {mode:'live'}, 'aurora');
    for (const mode of ['rec', 'save', 'live']){
      C.renderPanelBody(h, panel, {mode,banner:'<new clip>'}, 'aurora');
      assert.equal(h.writes, 1, scene + ' scene must survive ' + mode);
      assert.equal(h.box.className, 'screenbox m-' + mode);
      if (mode === 'save') assert.ok(h.box.overlays.includes('&lt;new clip&gt;'));
    }
    const replacement = scene === 'kitchen-fire' ? 'person-through-door' : 'kitchen-fire';
    for (const mode of ['live', 'rec', 'save']){
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

test('screen clip starter validates without warnings and exposes both clips with four modes', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT,'src/starters/screen-clips.json'),'utf8'));
  const result = C.validate(C.normalize(raw));
  assert.equal(result.errors.length, 0, result.errors.join('; '));
  assert.equal(result.warnings.length, 0, result.warnings.join('; '));
  assert.deepEqual(raw.page.sections.map(s => s.diagram.panels[0].scene), ['person-through-door','kitchen-fire']);
  for (const s of raw.page.sections){
    assert.deepEqual(s.diagram.steps.map(step => step.panels['camera-view'].mode), ['off','live','rec','save']);
  }
});
