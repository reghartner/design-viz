'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource,readStyles} = require('../tools/source-loader.cjs');
const C = {URL};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js'])
  vm.runInContext(readSource(file),C,{filename:file});
const plain = v => JSON.parse(JSON.stringify(v));
const panel = type => ({id:type,type,...plain(C.PanelRegistry.get(type).authoring.template),scene:'person-through-door'});
const fixture = p => ({nodes:{n:{}},rows:[['n']],edges:[],panels:[p],steps:[]});
const html = (p,state) => C.PanelViews.get(p.type)({},p,state).html;

test('console audio has typed fields, replaces the whole endpoint and never changes video or assessments', () => {
  for (const type of ['screen','security']) {
    const p = panel(type), d = fixture(p);
    p.initial.audio = {connection:'connected',microphone:'listening',output:'speech',text:'Welcome'};
    p.initial.spotlight = 'on';
    const fields = C.panelPatchFields(p);
    assert.deepEqual(plain(fields.find(f=>f[0]==='audio')),['audio','objf',plain(C.FlowAudio.fields)]);
    assert.deepEqual(plain(fields.find(f=>f[0]==='spotlight')),['spotlight','enum',['off','on','flash']]);
    const patch = audio => ({panels:{[type]:{audio}}});
    d.steps = [patch({microphone:'capturing'}),{nodes:['n']},patch(null),patch({output:'siren',detection:'smoke-alarm'}),patch({})];
    const before = JSON.stringify(d), states = C.foldPanelStates(d)[type];
    assert.deepEqual(plain(states[0].audio),{microphone:'capturing'});
    assert.deepEqual(plain(states[1].audio),{microphone:'capturing'});
    assert.equal(states[2].audio,null);
    assert.deepEqual(plain(states[4].audio),{});
    for (const s of states) {
      assert.equal(s.spotlight,'on');
      assert.equal(s[type==='screen'?'mode':'video'],p.initial[type==='screen'?'mode':'video']);
      assert.equal(s.assessment,p.initial.assessment);
      assert.equal(s.status,p.initial.status);
    }
    assert.equal(JSON.stringify(d),before);
    const plan = C.planStepSetPanelPatch(before,d,0,0,type,JSON.stringify({audio:{output:'recorded',text:'Leave the property'},spotlight:'flash'}));
    assert.ok(!plan.error,plan.error);
    assert.equal(JSON.parse(plan.text).steps[0].panels[type].audio.output,'recorded');
    assert.deepEqual(plain(C.validate(C.normalize(d))),{errors:[],warnings:[]});
  }
});

test('invalid audio/light patches warn at their source and cannot erase carried facts', () => {
  for (const type of ['screen','security']) {
    const p = panel(type), d = fixture(p), steady = {output:'recorded',text:'Camera is monitoring'};
    p.initial.audio=steady; p.initial.spotlight='on';
    d.steps=[{panels:{[type]:{audio:{output:'constructor',text:42},spotlight:'blink',enterOnce:{audio:{microphone:false},spotlight:null}}}},
      {panels:{[type]:{audio:[]}}}, {panels:{[type]:{audio:{unknown:'ignored'}}}}];
    const warnings=C.validate(C.normalize(d)).warnings;
    for (const field of ['.audio.output:','.audio.text:','.spotlight:','.enterOnce.audio.microphone:','.enterOnce.spotlight:','.audio:','.audio.unknown:'])
      assert.ok(warnings.some(w=>w.includes(field)),type+field);
    for (const s of C.foldPanelStates(d)[type]) {
      assert.deepEqual(plain(s.audio),steady);
      assert.equal(s.spotlight,'on');
    }
    p.initial.audio={connection:3};p.initial.spotlight='bad';d.steps=[];
    const initialWarnings=C.validate(C.normalize(d)).warnings;
    assert.ok(initialWarnings.some(w=>w.includes('.initial.audio.connection:')));
    assert.ok(initialWarnings.some(w=>w.includes('.initial.spotlight:')));
  }
});

test('transient and branch-local audio facts do not leak across paths or overwrite the source', () => {
  for (const type of ['screen','security']) {
    const p=panel(type),d=fixture(p);
    p.initial.audio={microphone:'listening'};p.initial.spotlight='off';
    d.steps=[{id:'start'},
      {id:'talk',panels:{[type]:{audio:{microphone:'capturing'},spotlight:'on',enterOnce:{audio:{output:'chime'},spotlight:'flash'}}}},
      {id:'carry'}, {id:'quiet',panels:{[type]:{audio:null}}}];
    d.paths=[{id:'conversation',steps:['start','talk','carry']},{id:'decline',steps:['start','quiet']}];
    const before=JSON.stringify(d),talk=C.foldPanelStates(C.diagramForPath(d,'conversation'))[type],quiet=C.foldPanelStates(C.diagramForPath(d,'decline'))[type];
    assert.deepEqual(plain(talk.map(s=>s.audio)),[{microphone:'listening'},{output:'chime'},{microphone:'capturing'}]);
    assert.deepEqual(plain(talk.map(s=>s.spotlight)),['off','flash','on']);
    assert.equal(quiet[1].audio,null);assert.equal(quiet[1].spotlight,'off');
    assert.equal(JSON.stringify(d),before);
  }
});

test('screen shows actual emission, capture, detection and spotlight independently of working video', () => {
  const p=panel('screen');
  for (const output of ['speech','recorded','chime','siren']) {
    const h=html(p,{mode:'live',audio:{output,text:'Please use the other door'},spotlight:'flash'});
    assert.ok(h.includes(C.SCENES[p.scene]));
    assert.match(h,new RegExp('fva-sound-'+output));
    assert.match(h,/screen-camera-device/);assert.match(h,/screen-spotlight-flash/);
    assert.match(h,/Camera audio/);
    assert.match(h,/Please use the other door/);
  }
  for (const playback of ['queued','suppressed','failed','stopped']) {
    const h=html(p,{mode:'live',audio:{output:'speech',playback,microphone:'muted',reason:'Speaker unavailable'}});
    assert.ok(h.includes(C.SCENES[p.scene]));
    assert.doesNotMatch(h,/fva-emission/);
    assert.match(h,/Mic muted/);assert.match(h,/Speaker unavailable/);
  }
  const heard=html(p,{mode:'unavailable',audio:{microphone:'capturing',detection:'glass-break'}});
  assert.match(heard,/Camera unavailable/);assert.match(heard,/fva-capture/);assert.match(heard,/Glass-break sound detected/);
  assert.doesNotMatch(heard,/fva-emission/);
  const hostile=html(p,{mode:'live',audio:{output:'speech',text:'<img src=x>',source:'<script>',reason:'<b>'}});
  assert.match(hostile,/&lt;img/);assert.doesNotMatch(hostile,/<img|<script>|<b>/);
});

test('security maps capture to operator speech and output to listening without changing the camera endpoint', () => {
  const p=panel('security');
  const talk=html(p,{video:'reviewing',audio:{microphone:'capturing',text:'Can you identify yourself?'}});
  assert.match(talk,/secmon-stage secmon-review-reviewing secmon-audio-speaking/);
  assert.match(talk,/Operator speaking to camera/);
  assert.doesNotMatch(talk,/secmon-stage[^>]*secmon-audio-listening|screen-camera-device/);
  const hear=html(p,{video:'reviewing',audio:{output:'speech',source:'Visitor',text:'I live here'}});
  assert.match(hear,/secmon-stage secmon-review-reviewing secmon-audio-listening/);
  assert.match(hear,/Operator hearing remote audio/);assert.match(hear,/Operator headset/);
  assert.doesNotMatch(hear,/secmon-stage[^>]*secmon-audio-speaking|screen-camera-device/);
  const failed=html(p,{video:'reviewing',audio:{output:'speech',playback:'failed',microphone:'muted'},spotlight:'on'});
  assert.ok(failed.includes(C.SCENES[p.scene]));assert.match(failed,/secmon-audio-muted secmon-audio-failed/);
  assert.match(failed,/Spotlight on/);assert.match(failed,/Unverified/);assert.match(failed,/Status unknown/);
});

function screenHost() {
  const box={className:'',querySelectorAll(){return [];},insertAdjacentHTML(where,html){this.overlay=html;}},slot={innerHTML:''};
  return {writes:0,box,slot,querySelector(s){return s==='.screenbox'?box:s==='.screen-audio-slot'?slot:null;},
    set innerHTML(value){this.markup=value;this.writes++;},get innerHTML(){return this.markup;}};
}
test('audio-only updates and reverse jumps preserve the same camera clip, including silent/failed/reset states', () => {
  const p=panel('screen'),h=screenHost();
  const draw = state => C.renderPanelBody(h,p,state,'pastel',null,null,false);
  draw({mode:'live'});
  for (const audio of [{output:'speech'},{microphone:'capturing',text:'Hello'},{output:'siren',playback:'failed'},null,{microphone:'muted'},{}]) {
    draw({mode:'live',audio,spotlight:'on'});
    assert.equal(h.writes,1);
    assert.equal(h.box.className,'screenbox m-live');
  }
  draw({mode:'live'});assert.equal(h.slot.innerHTML,'');assert.equal(h.writes,1);
  draw({mode:'unavailable'});assert.equal(h.writes,2);
  draw({mode:'unavailable',audio:{output:'chime'}});assert.equal(h.writes,2,'audio also preserves a stable unavailable frame');
});

test('console effects have reduced-motion and print fallbacks and absent audio adds no visible UI', () => {
  const css=readStyles('style.core.css');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.screen-devices \*\{animation:none!important/);
  assert.match(css,/@media print\{\.screen-devices \*\{animation:none!important/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.secmon \*\{animation:none!important/);
  assert.match(css,/@media print\{\.secmon\{[\s\S]*?\.secmon \*\{animation:none!important/);
  for(const type of ['screen','security']) assert.doesNotMatch(html(panel(type),{}),/class="fva-audio|class="secmon-audio"|screen-camera-device/);
});
