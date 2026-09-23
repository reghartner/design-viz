'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={};vm.createContext(C);vm.runInContext(readSource('validator.js'),C);
const A=C.FlowAudio,plain=x=>JSON.parse(JSON.stringify(x));
test('audio snapshots are sparse, whole, resettable and reject malformed or inherited facts',()=>{
  assert.equal(A.clean(undefined),undefined);assert.equal(A.clean(null),null);
  assert.deepEqual(plain(A.clean({})),{});
  for(const x of [[],1,true,'speech',{output:'LOUD'},{constructor:'bad'}]) assert.equal(A.clean(x),undefined);
  const raw=Object.create({microphone:'capturing'});raw.output='chime';raw.reason=3;
  const warnings=[];assert.deepEqual(plain(A.clean(raw,'step.audio',warnings)),{output:'chime'});
  assert.ok(warnings.some(x=>x.includes('step.audio.reason')));
  const hostile=JSON.parse('{"__proto__":{"output":"siren"},"output":"speech"}');
  assert.deepEqual(plain(A.clean(hostile)),{output:'speech'});
});
test('connection, capture, playback and classification remain independent authored facts',()=>{
  for(const connection of A.choices.connection){
    assert.equal(A.isEmitting({connection}),false);assert.equal(A.isCapturing({connection}),false);
    assert.equal(A.isEmitting({connection,output:'chime'}),true,'local chime needs no call');
  }
  for(const playback of ['queued','suppressed','failed','stopped']){
    const a={output:'siren',playback,microphone:'capturing'};
    assert.equal(A.isEmitting(a),false);assert.equal(A.isCapturing(a),true);
    assert.doesNotMatch(A.effect(a),/data-sound/);
  }
  assert.equal(A.isEmitting({output:'silent',playback:'playing'}),false);
  assert.match(A.render({detection:'smoke-alarm'}),/Smoke alarm heard/);
  assert.doesNotMatch(A.render({detection:'smoke-alarm'}),/fva-is-emitting/);
});
test('shared effects distinguish speech, recording, chime, siren and received sound without media APIs',()=>{
  for(const output of ['speech','recorded','chime','siren']){
    assert.match(A.effect({output}),new RegExp('fva-sound-'+output));
    assert.match(A.render({output}),/fva-is-emitting/);
  }
  assert.match(A.effect({microphone:'capturing'}),/fva-capture/);
  assert.equal(A.effect({microphone:'listening'}),'');
  assert.equal(A.render(undefined),'');assert.equal(A.render(null),'');assert.equal(A.render({}),'');
});
test('all endpoint captions and source labels remain plain escaped text',()=>{
  const x='<img src=x onerror="boom">';
  const h=A.render({output:'recorded',text:x,source:x,reason:x},{label:x});
  assert.ok(h.includes('&lt;img'));assert.doesNotMatch(h,/<img|onerror="/);
  assert.doesNotMatch(A.render({output:'constructor'}),/function Object/);
});
