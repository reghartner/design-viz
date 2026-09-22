'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, readStyles} = require('../tools/source-loader.cjs');
const C = {URL, console};
vm.createContext(C);
for (const file of ['validator.js', 'engine.js', 'builder.workbench.js'])
  vm.runInContext(readSource(file), C, {filename:file});
const plain = value => JSON.parse(JSON.stringify(value));
const panel = initial => ({id:'phone', type:'phone', initial:initial || {clock:'9:41'}});
const step = patch => ({text:'Call beat', panels:{phone:patch}});
const fixture = (p, steps) => ({nodes:{app:{}}, rows:[['app']], panels:[p], steps});
const html = audio => C.phonePanelHTML({}, {audio, notifications:[]});

test('phone audio carries a whole sanitized object; null clears independently from notifications', () => {
  const p = panel({clock:'9:41', notify:{app:'Home',title:'Doorbell'}, audio:{connection:'connected',output:'speech',text:'Hello'}});
  const steps = [step({}), step({audio:{microphone:'capturing'}}), step({audio:{output:'bogus',text:4}}),
    step({audio:null,notify:{app:'Home',title:'Motion'}}), step({}), step({audio:{},clear:true})];
  const before = JSON.stringify({p,steps}), states = C.foldPhoneStates(p, steps);
  assert.deepEqual(plain(states[0].audio), p.initial.audio);
  assert.deepEqual(plain(states[1].audio), {microphone:'capturing'});
  assert.deepEqual(plain(states[2].audio), {microphone:'capturing'}, 'wholly invalid objects cannot clear a carried session');
  assert.equal(states[1].audio.text, undefined, 'replacement does not inherit a previous caption');
  assert.equal(states[3].audio, null); assert.equal(states[4].audio, null);
  assert.equal(states[3].notifications.length, 2, 'audio clear does not clear notifications');
  assert.deepEqual(plain(states[5].audio), {}); assert.equal(states[5].notifications.length, 0);
  states[0].audio.text = 'Changed snapshot';
  assert.equal(p.initial.audio.text, 'Hello');
  states[1].audio.microphone = 'muted';
  assert.equal(states[2].audio.microphone, 'capturing', 'snapshots have separate audio objects');
  assert.equal(JSON.stringify({p,steps}), before);
  assert.deepEqual(plain(C.foldPhoneStates(p, [])[0].audio), p.initial.audio);
});

test('phone enterOnce audio overlays one snapshot without carrying its caption or reset', () => {
  const p = panel({audio:{connection:'connected',microphone:'listening'}});
  const states = C.foldPhoneStates(p, [
    step({audio:{output:'speech',text:'Visitor'},enterOnce:{audio:{microphone:'capturing',text:'Homeowner'}}}),
    step({}), step({enterOnce:{audio:null}}), step({}),
    step({enterOnce:{audio:{output:'invalid'}}}),
    step({enterOnce:{audio:{microphone:'muted'},notify:{app:'Ghost'},clear:true}}), step({}),
  ]);
  assert.deepEqual(plain(states[0].audio), {microphone:'capturing',text:'Homeowner'});
  for (const i of [1,3,4,6]) assert.deepEqual(plain(states[i].audio), {output:'speech',text:'Visitor'});
  assert.equal(states[2].audio, null);
  assert.deepEqual(plain(states[5].audio), {microphone:'muted'});
  assert.ok(states.every(s => !s.notifications.length && !('enterOnce' in s)));
  const initialOnce = C.foldPhoneStates(panel({enterOnce:{audio:{output:'siren'}}}), [])[0];
  assert.equal(initialOnce.audio, undefined, 'initial enterOnce is not a step');
});

test('phone audio warnings point to malformed fields and transient input without rejecting valid siblings', () => {
  const p = panel({audio:{microphone:'nope',text:42,remoteUrl:'https://example.test/audio'}});
  const d = fixture(p, [step({audio:[],enterOnce:{audio:{output:'wrong',source:7},notify:{app:'No'}}}), step({enterOnce:'bad'})]);
  const result = C.validate(C.normalize(d));
  assert.equal(result.errors.length, 0);
  for (const field of ['initial.audio.microphone','initial.audio.text','initial.audio.remoteUrl',
    'panels.phone.audio:', 'enterOnce.audio.output','enterOnce.audio.source','enterOnce.notify','enterOnce:'])
    assert.ok(result.warnings.some(w => w.includes(field)), field + ': ' + result.warnings.join('\n'));
  const valid = fixture(panel({audio:null}), [step({audio:{connection:'connecting'}}),step({enterOnce:{audio:null}})]);
  assert.deepEqual(plain(C.validate(C.normalize(valid)).warnings), []);
  const malformed = [false, 0, '', [], {unknown:'bad'}, {output:'constructor'}];
  for (const audio of malformed) {
    const state = C.foldPhoneStates(panel({audio:{output:'recorded'}}),[step({audio})])[0];
    assert.deepEqual(plain(state.audio), {output:'recorded'});
  }
});

test('phone direct/reverse navigation and branch switches render absolute path-local audio', () => {
  const p = panel({audio:{connection:'idle'}}), d = fixture(p, [
    {id:'open',...step({audio:{connection:'connecting'}})},
    {id:'talk',...step({audio:{connection:'connected',microphone:'capturing',text:'Leave it by the door'}})},
    {id:'glitch',...step({enterOnce:{audio:{connection:'interrupted',reason:'Signal lost'}}})},
    {id:'carry',...step({})},
    {id:'cancel',...step({audio:{connection:'ended'}})},
  ]);
  d.paths = [{id:'answer',steps:['open','talk','glitch','carry']},{id:'cancel',steps:['open','cancel']}];
  const answer = C.foldPanelStates(C.diagramForPath(d,'answer')).phone;
  const cancel = C.foldPanelStates(C.diagramForPath(d,'cancel')).phone;
  assert.deepEqual(Array.from(answer, s => s.audio.connection), ['connecting','connected','interrupted','connected']);
  assert.deepEqual(Array.from(cancel, s => s.audio.connection), ['connecting','ended']);
  const host = {style:{},querySelector(){return null;},querySelectorAll(){return [];}};
  for (const [state,index,expected] of [[answer[3],3,'You → visitor'],[cancel[1],1,'Call ended'],
    [answer[2],2,'Connection interrupted'],[answer[0],0,'Connecting call'],[answer[1],1,'You → visitor']]) {
    C.renderPanelBody(host,p,state,'aurora',answer,index,false);
    assert.ok(host.innerHTML.includes(expected), expected);
    assert.doesNotMatch(host.innerHTML, /phonecard fresh/);
  }
  assert.equal(C.phoneModel(p,C.diagramForPath(d,'answer').steps,3).audio.reason, undefined);
  const current = C.builderEffectivePanelStates(d,2,'answer').panels[0];
  assert.equal(current.fields.find(f=>f.key==='audio').origin.kind,'transient');
  assert.deepEqual(plain(current.fields.find(f=>f.key==='audio').origin.inputs[0].path),['steps',2,'panels','phone','enterOnce','audio']);
  const inherited = C.builderEffectivePanelStates(d,3,'answer').panels[0];
  assert.equal(inherited.fields.find(f=>f.key==='audio').origin.kind,'inherited');
});

test('phone card distinguishes homeowner microphone and visitor playback with muted and unavailable states', () => {
  const send = html({connection:'connected',microphone:'capturing',text:'Leave it there'});
  assert.match(send,/You → visitor/); assert.match(send,/You are speaking/); assert.match(send,/Speaker silent/);
  const receive = html({connection:'connected',output:'speech',microphone:'muted',text:'Thank you'});
  assert.match(receive,/Visitor → you/); assert.match(receive,/Visitor speaking/); assert.match(receive,/Mic muted/);
  assert.match(receive,/phonecallicon is-muted/);
  assert.match(html({microphone:'capturing',output:'speech'}),/You ↔ visitor/);
  for (const [playback,label] of [['queued','Audio queued'],['suppressed','Audio suppressed'],['failed','Speaker unavailable'],['stopped','Audio stopped']]) {
    const h = html({output:'speech',playback,microphone:'unavailable'});
    assert.match(h,/No audio flowing/); assert.ok(h.includes(label)); assert.match(h,/Mic unavailable/);
    assert.doesNotMatch(h,/phonecallchannel is-active/);
  }
  assert.match(html({detection:'smoke-alarm'}),/Smoke alarm heard/);
  assert.equal(C.phoneModel({audio:{output:'siren'}}).count, 0, 'audio never creates notifications');
});

test('phone audio escapes every authored label and never loads media or URLs', () => {
  const text = '<img src=x onerror="alert(1)"> & <script>bad</script>';
  const h = html({connection:'connected',output:'recorded',text,source:text,reason:text});
  for (const name of ['phonecallcaption','phonecallsource','phonecallreason']) assert.ok(h.includes('class="'+name+'"'));
  assert.match(h,/&lt;img src=x onerror=&quot;/);
  assert.doesNotMatch(h,/<img|<script|<audio|<video|https?:\/\/|onerror="/);
  const ignored = html({output:'javascript:alert(1)',source:'https://example.test/a.mp3'});
  assert.match(ignored,/https:\/\/example.test\/a.mp3/);
  assert.doesNotMatch(ignored,/(?:src|href)="https:/);
});

test('audio is opt-in; existing phone notification markup and entry cues are unchanged', () => {
  const p = panel(), state = {clock:'9:41',notifications:[{app:'Home',title:'Doorbell'}],_phoneAdded:1};
  const legacy = C.phonePanelHTML(p,state,true);
  for (const audio of [undefined,null,[],{output:'bad'}])
    assert.equal(C.phonePanelHTML(p,{...state,audio},true),legacy);
  assert.doesNotMatch(legacy,/phonecall|phonehasaudio/);
  assert.match(legacy,/phonecard fresh/);
  const full = C.phonePanelHTML(p,{...state,audio:{output:'speech'}},true);
  assert.match(full,/phonecard fresh/); assert.match(full,/phonebadge/);
  assert.match(full,/phonecall/); assert.match(full,/Doorbell/);
});

test('phone workbench exposes shared typed audio fields and preserves initial JSON editing', () => {
  const definition = C.PanelRegistry.get('phone').authoring;
  assert.deepEqual(plain(C.panelPatchFields(panel()).find(f=>f[0]==='audio')), ['audio','objf',plain(C.FlowAudio.fields)]);
  assert.deepEqual(plain(definition.setupFields.at(-1)), ['initial','json']);
  const d = fixture(panel(),[step({notify:{app:'Home'}})]);
  const patch = {notify:{app:'Home'},audio:{connection:'connected',output:'speech'}};
  const plan = C.planStepSetPanelPatch(JSON.stringify(d),d,0,0,'phone',JSON.stringify(patch));
  assert.ok(!plan.error,plan.error);
  assert.deepEqual(JSON.parse(plan.text).steps[0].panels.phone,patch);
  const invalidOnce = fixture(panel({audio:{output:'speech'}}),[step({enterOnce:{audio:{output:'wrong'}}})]);
  const fields = C.builderEffectivePanelStates(invalidOnce,0).panels[0].fields;
  assert.equal(fields.find(f=>f.key==='audio').origin.kind,'initial', 'invalid transient fields cannot claim provenance');
});

test('phone audio styling covers six skins, bundled fonts, reduced motion and print', () => {
  const css = readStyles('style.core.css');
  for (const selector of ['.sk-aurora .phonecall','.sk-daylight .phonecall','body.sk-editorial .phonecall',
    'body.sk-terminal .phonecall','body.sk-pastel .phonecall','body.sk-blueprint .phonecall'])
    assert.ok(css.includes(selector), selector);
  assert.match(css,/\.phonecall\{[^}]*'IBM Plex Sans',sans-serif;/);
  assert.match(css,/prefers-reduced-motion: reduce[^}]*[\s\S]*?\.phonecall,\.phonecall \*\{animation:none !important/);
  assert.match(css,/@media print\{[\s\S]*?\.phonecall\{color:#222222 !important/);
});
