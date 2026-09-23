'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const source=require('../src/starters/audio-story.json'),C={};vm.runInNewContext(readSource('validator.js'),C);
const plain=x=>JSON.parse(JSON.stringify(x));
function story(section,path){const d=source.page.sections[section].diagram;return C.foldPanelStates(C.diagramForPath(d,path));}
test('the audio teaching story validates cleanly and every path folds without mutating the spec',()=>{
 const before=JSON.stringify(source),result=C.validate(C.normalize(source));
 assert.deepEqual(plain(result.errors),[]);assert.deepEqual(plain(result.warnings),[]);
 source.page.sections.forEach((s,i)=>s.diagram.paths.forEach(p=>story(i,p.id)));
 assert.equal(JSON.stringify(source),before);
});
test('resident and visitor swap source and recipient without changing camera recording',()=>{
 const s=story(0,'conversation');
 assert.equal(s.phone[4].audio.microphone,'capturing');assert.equal(s.camera[4].audio.output,'speech');
 assert.equal(s.home[4].cam.audio.text,s.phone[4].audio.text);
 assert.equal(s.phone[5].audio.output,'speech');assert.equal(s.camera[5].audio.microphone,'capturing');
 assert.equal(s.home[5].visitor.audio.output,'speech');
 assert.ok(s.camera.slice(1).every(x=>x.mode==='rec'));
 assert.equal(s.phone.at(-1).audio.connection,'ended');
});
test('quiet hours, saved replies and microphone denial remain distinct from video and notifications',()=>{
 const automatic=story(0,'automatic');
 assert.equal(C.FlowAudio.isEmitting(automatic.home[2].speaker.audio),false);
 assert.equal(automatic.home[2].speaker.audio.playback,'suppressed');
 assert.equal(automatic.camera[3].audio.playback,'queued');
 assert.equal(C.FlowAudio.isEmitting(automatic.camera[3].audio),false);
 assert.equal(C.FlowAudio.isEmitting(automatic.camera[4].audio),true);
 assert.equal(automatic.camera[4].audio.output,'recorded');
 const denied=story(0,'mic-denied');
 assert.equal(denied.phone.at(-1).audio.microphone,'unavailable');
 assert.equal(denied.phone.at(-1).audio.output,'speech');
 assert.equal(denied.camera.at(-1).mode,'rec');
 assert.ok(denied.phone.at(-1).notifications.length);
});
test('operator talk-down, siren activation, dispatch and audio failures do not infer one another',()=>{
 const s=story(1,'escalation');
 assert.equal(s.monitor[4].audio.microphone,'capturing');assert.equal(s.home[4].cam.audio.output,'speech');
 assert.equal(s.home[5].cam.spotlight,'on');
 assert.equal(C.FlowAudio.isEmitting(s.home[6].cam.audio),false);
 assert.equal(C.FlowAudio.isEmitting(s.home[7].cam.audio),true);
 assert.equal(s.response[7].status,'idle');assert.equal(s.response[8].status,'requested');
 assert.equal(s.response.at(-1).patrol.status,'onscene');
 const lost=story(1,'audio-lost');assert.equal(lost.monitor.at(-1).video,'reviewing');
 assert.equal(C.FlowAudio.isEmitting(lost.home.at(-1).cam.audio),false);
 assert.equal(lost.response.at(-1).status,'idle');
 const failed=story(1,'siren-failed');assert.equal(failed.home.at(-1).cam.audio.playback,'failed');
 assert.equal(failed.home.at(-1).cam.spotlight,'on');assert.equal(failed.response.at(-1).status,'idle');
 const clear=story(1,'talk-down');assert.equal(clear.response.at(-1).patrol.status,'available');
});
test('sound source, capture, classification and notification are separate evidence',()=>{
 const s=story(2,'recognized');
 assert.equal(s.home[1].alarm.audio.output,'siren');assert.equal(s.camera[1].audio,undefined);
 assert.equal(s.camera[2].audio.detection,'sound');assert.equal(s.camera[3].audio.detection,'smoke-alarm');
 assert.equal(s.phone[2].notifications.length,0);assert.equal(s.phone[3].notifications.length,1);
 assert.equal(s.home[3].alarm.state,'ok');
 assert.equal(story(2,'uncertain').camera.at(-1).audio.detection,'sound');
});
