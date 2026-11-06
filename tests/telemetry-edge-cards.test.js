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

test('trace-only bindings have no preview card values; mixed named trace slots stay out of numeric content',()=>{
 for(const signal of [{tempo:'{ resource.service.name="api" }',unit:'req/s'},{honeycomb:{query_spec:{limit:1}},unit:'req/s'}]){
  const diagram={edges:[{from:'a',to:'b',telemetry:{kind:'call',signals:{rate:signal},proof:{rate:{min:1}}}}]};
  assert.deepEqual(Object.keys(C.telemetryCardPreview(diagram,{}).map),[]);
  const edge=diagram.edges[0];edge.telemetry.signals.count={grafana:'requests',unit:'req/s'};edge.telemetry.proof.count={min:1};edge.telemetry.signals.errors=signal;
  const binding=C.carrierTelemetry(edge,{}),sample={signals:{rate:{value:1000},count:{value:2},errors:{value:999}}};
  const content=C.telemetryCardContent(edge,binding,sample,{telemetry:'flowing'},'24h');
  assert.equal(content.headline,'2 req/s');assert.equal(content.details[0],'errors: not bound');
  assert.deepEqual(Object.keys(C.telemetryCardPreview(diagram,{}).map['a->b'].signals),['count']);
 }
});

test('trace ratio targets cannot manufacture scalar traffic or suppress genuine per-time traffic',()=>{
 const binding={signals:{events:{source:'grafana',query:'count'},trace:{source:'tempo',query:'{}'}},proof:{events:{min:1,max:1,maxRatioOf:'trace'}}};
 assert.equal(C.telemetryPrimary(binding),null);
 binding.signals.events.unit='events/s';assert.equal(C.telemetryPrimary(binding),'events');
});

test('scalar observation window follows only an observed number, never a pending or missing result',()=>{
 for(const source of ['cloudwatch','cloudwatchLogs']){
  const binding={kind:'service',signals:{events:{source,query:{},unit:'events'}},proof:{events:{min:1}}};
  const content=(sample,pending)=>C.telemetryCardContent({from:'a',to:'b'},binding,sample,null,'24h',pending);
  assert.equal(content(null,{events:true}).headline,'Loading…');
  assert.equal(content(null,{}).headline,'unobserved');
  assert.equal(content({signals:{events:{value:0}}},{}).headline,'0 events in 24h');
  assert.equal(content({signals:{events:{value:12}}},{events:true}).headline,'12 events · Refreshing… in 24h');
 }
});
