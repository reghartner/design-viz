'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('native').source,C);
test('queue cards name explicit topic parameters and show rate, lag and age from bound signals',()=>{
 const edge={from:'a',to:'b',label:'Publish',telemetry:{use:'topic',topic:'device-events'}},binding={kind:'queue',signals:{in:{unit:'msg/s'},lag:{unit:'msgs'},age:{unit:'s'}},proof:{in:{min:1}}};
 const c=C.telemetryCardContent(edge,binding,{signals:{in:{value:25},lag:{value:3},age:{value:1.5}}},{telemetry:'flowing'},'6h');
 assert.equal(c.title,'Publish · device-events');assert.equal(c.headline,'in: 25 msg/s');assert.deepEqual(Array.from(c.details),['lag: 3 msgs','age: 1.5 s']);assert.equal(c.note,'6h window');
});
test('cards distinguish unbound signals, unobserved readings and measured zero without inventing a silence duration',()=>{
 const edge={from:'a',to:'b',label:'48h service'},binding={kind:'call',signals:{rate:{unit:'req/s'},errors:{unit:'req/s'}},proof:{errors:{maxRatioOf:'rate',max:.01}}};
 const absent=C.telemetryCardContent(edge,binding,{},null,'24h');assert.equal(absent.headline,'unobserved');assert.deepEqual(Array.from(absent.details),['errors: unobserved','p95: not bound']);assert.equal(absent.note,'unobserved · 24h window');
 const silent=C.telemetryCardContent(edge,binding,{signals:{rate:{value:0},errors:{value:0}}},{telemetry:'silent'},'30m');assert.equal(silent.headline,'0 req/s');assert.equal(silent.note,'no traffic · 30m window');assert.equal(silent.series.length,0);
});
