'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {readSource} = require('../tools/source-loader.cjs');
const C = {URL};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js'])
  vm.runInContext(readSource(file),C,{filename:file});
const plain = v => JSON.parse(JSON.stringify(v));
const def = C.PanelRegistry.get('security');
const panel = () => ({id:'monitor',type:'security',...plain(def.authoring.template)});
const html = (p,state) => def.render({},p,state).html;
const fixture = p => ({nodes:{service:{}},rows:[['service']],edges:[],panels:[p],steps:[]});

// A minimal DOM ownership double: replacing the monitor HTML creates a new clip
// identity. Overlay/class patches preserve it, matching the real Screen contract.
function host() {
  let elements, markup = '';
  const result = {writes:0,querySelector(selector){return elements && elements[selector] || null;}};
  function element() {
    return {className:'',textContent:'',attributes:{},innerHTML:'',setAttribute(k,v){this.attributes[k]=v;}};
  }
  Object.defineProperty(result,'innerHTML',{get(){return markup;},set(value){
    markup = value;result.writes++;
    elements = Object.fromEntries(['.secmon','.secmon-stage','.secmon-desk-brand','.secmon-hero-slot','.secmon-facts','.secmon-note','.secmon-audio-slot','.secmon-feed-label','.secmon-review-caption strong','.secmon-review-clip','.secmon-sensor-details'].map(k=>[k,element()]));
    elements['.secmon-sensor-details'].open = false;
    const video = {...element(),writes:0,audioSlot:element(),querySelector(s){return s === '.screenbox' ? this.box : s === '.screen-audio-slot' ? this.audioSlot : null;}};
    Object.defineProperty(video,'innerHTML',{get(){return this.html;},set(h){
      this.writes++;this.html=h;
      this.box = {clip:{},className:'',querySelectorAll(){return [];},insertAdjacentHTML(){}};
    }});
    video.innerHTML = value.match(/<div class="secmon-video"[^>]*>([\s\S]*?)<\/div><div class="secmon-monitor-footer"/)[1];
    elements['.secmon-video'] = video;
  }});
  return result;
}

function render(h,p,state) { C.renderPanelBody(h,p,state,'pastel',null,null,false); }

test('monitoring uses the Camera Screen stock library and renderer for every clip', () => {
  const p = panel();
  assert.equal(C.SCENE_NAMES,C.SCENE_TOKENS);
  for (const scene of C.SCENE_NAMES) {
    const rendered = html({...p,scene},{video:'reviewing',scenePlayback:'playing'});
    assert.ok(rendered.includes(C.SCENES[scene]),scene+' embeds original artwork');
    assert.match(rendered,/secmon-operator-figure/);
    assert.match(rendered,/screenbox m-active/);
    assert.match(rendered,/Simulated camera clip/);
    assert.equal((rendered.match(/class="secmon-video"/g)||[]).length,1);
  }
  const source = fs.readFileSync(require('node:path').join(__dirname,'../src/panels/types/security.js'),'utf8');
  assert.match(source,/screenFramePresentation/);
  assert.doesNotMatch(source,/var SCENES|@keyframes (?:walkin|entrycross|doorbellaway|firebreathe)/);
});

test('video review has explicit states and never infers viewing or verification from status', () => {
  const p = panel();
  for (const status of ['unknown','armed','alarm','reviewing','verified','cleared','offline']) {
    const rendered = html(p,{status});
    assert.match(rendered,/secmon-review-closed/);
    assert.match(rendered,/screenbox m-off/);
    assert.doesNotMatch(rendered,/class="scene(?: |")/);
  }
  assert.match(html(p,{video:'opening'}),/secmon-review-opening/);
  assert.ok(html(p,{video:'opening'}).includes(C.SCENES['static-noise']));
  const unavailable = html(p,{video:'unavailable',videoReason:'Evidence store cannot reach camera'});
  assert.match(unavailable,/screenbox m-unavailable/);
  assert.match(unavailable,/Evidence store cannot reach camera/);
  assert.doesNotMatch(unavailable,/class="scene(?: |")/);
  const review = html(p,{video:'reviewing',scenePlayback:'waiting'});
  assert.match(review,/screenbox m-active scene-waiting/);
  assert.match(review,/Unverified/);
  assert.match(review,/Status unknown/);
});

test('step authoring exposes typed video and scene controls using the shared clip list', () => {
  const p = panel(), fields = C.panelPatchFields(p);
  for (const [field,expected] of [['video',['closed','opening','reviewing','unavailable']],['scene',plain(C.SCENE_NAMES)],['scenePlayback',['waiting','playing']]]) {
    assert.deepEqual(plain(fields.find(f=>f[0]===field)),[field,'enum',expected]);
  }
  assert.deepEqual(plain(def.authoring.setupFields.find(f=>f[0]==='scene')),['scene','scene']);
  assert.equal(p.initial.video,'closed');
  const sample = C.panelPickerExample('security');
  assert.equal(sample.state.video,'reviewing');
  assert.equal(sample.state.scenePlayback,'playing');
  const d = fixture(p);d.steps=[{id:'review',panels:{monitor:{video:'reviewing',scene:'kitchen-fire',scenePlayback:'playing'}}}];
  const edited = C.planStepSetPanelPatch(JSON.stringify(d),d,0,0,'monitor',JSON.stringify({video:'unavailable',videoReason:'Feed timed out'}));
  assert.ok(!edited.error,edited.error);
  assert.equal(JSON.parse(edited.text).steps[0].panels.monitor.video,'unavailable');
});

test('invalid scene/video/reason fields warn at their source and cannot overwrite valid carried state', () => {
  const p = panel();p.initial.video='reviewing';p.initial.scene='kitchen-fire';
  const patch = {video:'playing',scene:'constructor',videoReason:42,scenePlayback:'banana',enterOnce:{video:'<img>'}};
  const d=fixture(p);d.steps=[{panels:{monitor:patch}}];
  const result = C.validate(C.normalize(d));
  for (const field of ['video','scene','videoReason','scenePlayback','enterOnce.video'])
    assert.ok(result.warnings.some(w=>w.includes('.'+field+':')),field);
  const folded = def.fold(p,d.steps)[0];
  assert.equal(folded.video,'reviewing');assert.equal(folded.scene,'kitchen-fire');
  const hostile='<img src=x onerror="alert(1)">';
  const safe = html({...p,scene:hostile,videoLabel:hostile},{video:'unavailable',videoReason:hostile});
  assert.match(safe,/&lt;img/);assert.doesNotMatch(safe,/<img|function Object|onerror="/);
  const fallback=html({...p,scene:'constructor'},{video:'reviewing'});
  assert.ok(fallback.includes(C.SCENES['static-noise']));assert.doesNotMatch(fallback,/function Object/);
});

test('carried/transient video states isolate alternate paths and reverse jumps use absolute snapshots', () => {
  const p=panel(),d=fixture(p);
  d.steps=[{id:'open',panels:{monitor:{video:'opening'}}},
    {id:'watch',panels:{monitor:{video:'reviewing',scenePlayback:'playing'}}},
    {id:'verify',panels:{monitor:{assessment:'verified',enterOnce:{video:'unavailable',videoReason:'Transient loss'}}}},
    {id:'carry'}, {id:'close',panels:{monitor:{video:'closed'}}}];
  d.paths=[{id:'confirmed',steps:['open','watch','verify','carry']},{id:'cancelled',steps:['open','close']}];
  const before=JSON.stringify(d);
  const confirmed=C.foldPanelStates(C.diagramForPath(d,'confirmed')).monitor;
  const cancelled=C.foldPanelStates(C.diagramForPath(d,'cancelled')).monitor;
  assert.deepEqual(plain(confirmed.map(s=>s.video)),['opening','reviewing','unavailable','reviewing']);
  assert.deepEqual(plain(cancelled.map(s=>s.video)),['opening','closed']);
  assert.equal(confirmed[3].videoReason,undefined);
  const h=host();
  for (const s of [confirmed[3],cancelled[1],confirmed[0],confirmed[1]]) render(h,p,s);
  assert.match(h._lastHTML,/secmon-review-reviewing/);
  assert.match(h.querySelector('.secmon-video')._lastHTML,/screenbox m-active/);
  assert.equal(JSON.stringify(d),before);
});

test('clip DOM survives assessments, sensor facts, notes and playback toggles', () => {
  const h=host(),p=panel();
  render(h,p,{video:'reviewing',scenePlayback:'waiting'});
  const video=h.querySelector('.secmon-video'),clip=video.box.clip;
  h.querySelector('.secmon-sensor-details').open=true;
  for(const state of [
    {video:'reviewing',scenePlayback:'playing',assessment:'reviewing'},
    {video:'reviewing',scenePlayback:'playing',status:'verified',operator:'Jordan',note:'Reviewed evidence',frontDoor:{alarm:'acknowledged'}},
    {video:'reviewing',scenePlayback:'waiting',assessment:'false-alarm'},
    {video:'reviewing',scenePlayback:'playing',assessment:'verified'},
    {video:'reviewing',audio:{microphone:'capturing',text:'Please identify yourself'},spotlight:'on'},
    {video:'reviewing',audio:{output:'speech',text:'I live here'},spotlight:'flash'},
    {video:'reviewing',audio:{microphone:'muted',output:'speech',playback:'failed',reason:'Headset disconnected'}},
    {video:'reviewing',audio:null,spotlight:'off'}
  ]) {
    render(h,p,state);
    assert.equal(h.writes,1,'outer operator scene is stable');
    assert.equal(video.writes,1,'clip is never remounted for an unrelated patch');
    assert.equal(video.box.clip,clip);
    assert.equal(h.querySelector('.secmon-sensor-details').open,true,'sensor disclosure choice survives changes');
  }
  assert.equal(video.box.className,'screenbox m-active');
  assert.match(h.querySelector('.secmon-hero-slot').innerHTML,/Status unknown/);
});

test('updating monitoring branding preserves the video clip and operator scene', () => {
  const h=host(),p=panel(),state={video:'reviewing',scenePlayback:'playing'};
  render(h,p,state);
  const video=h.querySelector('.secmon-video'),clip=video.box.clip;
  render(h,{...p,brand:{app:'Acme',icon:'house'}},state);
  assert.equal(h.writes,1);assert.equal(video.writes,1);assert.equal(video.box.clip,clip);
  assert.match(h.querySelector('.secmon-desk-brand').innerHTML,/data-icon="house"/);
  assert.match(h.querySelector('.secmon-desk-brand').innerHTML,/Acme/);
});

test('closing, reconnecting and changing clips replace only the monitor content', () => {
  const h=host(),p=panel();
  render(h,p,{video:'reviewing',scenePlayback:'playing'});
  const video=h.querySelector('.secmon-video');let clip=video.box.clip;
  for (const state of [
    {video:'closed'}, {video:'opening'}, {video:'reviewing',scenePlayback:'playing'},
    {video:'reviewing',scene:'kitchen-fire',scenePlayback:'playing'},
    {video:'unavailable',videoReason:'Connection timeout'}, {video:'reviewing',scene:'doorbell-runners'}
  ]) {
    render(h,p,state);
    assert.notEqual(video.box.clip,clip);clip=video.box.clip;
    assert.equal(h.writes,1);
  }
  assert.equal(video.writes,7);
  assert.match(video.attributes['aria-label'],/two people running away/);
});
