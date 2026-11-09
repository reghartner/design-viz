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
 const absent=C.telemetryCardContent(edge,binding,{},null,'24h');assert.equal(absent.headline,'unobserved');assert.deepEqual(Array.from(absent.details),['errors: unobserved']);assert.equal(absent.note,'unobserved · 24h window');
 const silent=C.telemetryCardContent(edge,binding,{signals:{rate:{value:0},errors:{value:0}}},{telemetry:'silent'},'30m');assert.equal(silent.headline,'0 req/s');assert.equal(silent.note,'no traffic · 30m window');assert.equal(silent.series.length,0);
});

test('trace-only bindings have no preview card values; mixed named trace slots stay out of numeric content',()=>{
 for(const signal of [{tempo:'{ resource.service.name="api" }',unit:'req/s'},{honeycomb:{query_spec:{limit:1}},unit:'req/s'}]){
  const diagram={edges:[{from:'a',to:'b',telemetry:{kind:'call',signals:{rate:signal},proof:{rate:{min:1}}}}]};
  assert.deepEqual(Object.keys(C.telemetryCardPreview(diagram,{}).map),[]);
  const edge=diagram.edges[0];edge.telemetry.signals.count={grafana:'requests',unit:'req/s'};edge.telemetry.proof.count={min:1};edge.telemetry.signals.errors=signal;
  const binding=C.carrierTelemetry(edge,{}),sample={signals:{rate:{value:1000},count:{value:2},errors:{value:999}}};
  const content=C.telemetryCardContent(edge,binding,sample,{telemetry:'flowing'},'24h');
  assert.equal(content.headline,'2 req/s');assert.equal(content.details.length,0);
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


test('card row health keeps failing bounds, pending data and observed zero distinct from work status',()=>{
 const binding={kind:'call',signals:{rate:{unit:'req/s'},errors:{unit:'errors/s'},missing:{unit:'ms'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:.01}}};
 const sample={signals:{rate:{value:100},errors:{value:5}}};
 const result=C.proofVerdicts({carriers:[{id:'a->b',...binding,tickets:['WORK-1']}],jiraMap:{'WORK-1':{state:'done'}},telemetryMap:{'a->b':sample}}).carriers['a->b'];
 const content=C.telemetryCardContent({from:'a',to:'b'},binding,sample,result,'24h',{missing:true});
 assert.deepEqual(Array.from(content.rows,r=>[r.name,r.health,r.text]),[['rate','observed','100 req/s'],['errors','failing','5 errors/s'],['missing','loading','Loading…']]);
 const zero={signals:{rate:{value:0},errors:{value:0}}};
 const zeroResult=C.proofVerdicts({carriers:[{id:'a->b',...binding}],telemetryMap:{'a->b':zero}}).carriers['a->b'];
 const rows=C.telemetryCardContent({from:'a',to:'b'},binding,zero,zeroResult,'24h').rows;
 assert.deepEqual(Array.from(rows,r=>[r.health,r.text]),[['failing','0 req/s'],['observed','0 errors/s'],['unobserved','unobserved']]);
});


test('metric work rollups retain shared no-change, completion and unknown precedence',()=>{
 for(const [states,want] of [[['unchanged','unchanged'],'unchanged'],[['done','unchanged'],'done'],[['done','unknown'],null],[['blocked','unknown'],'blocked'],[['missing','active'],'missing'],[['active','done'],'active'],[['testing','done'],'testing']])assert.equal(C.liveStatusPresentationRollup(states),want);
});
test('an authored card title replaces the label and drops the queue topic suffix',()=>{
 const edge={from:'a',to:'b',label:'Publish',telemetry:{use:'topic',topic:'device-events',card:{title:'Camera stats consumer · RabbitMQ'}}};
 const binding={kind:'queue',signals:{in:{unit:'msg/s'}},proof:{in:{min:1}},card:{title:'Camera stats consumer · RabbitMQ'}};
 assert.equal(C.telemetryCardContent(edge,binding,{signals:{in:{value:25}}},{telemetry:'flowing'},'6h').title,'Camera stats consumer · RabbitMQ');
 assert.equal(C.telemetryCardContent(edge,{...binding,card:{width:300}},{signals:{in:{value:25}}},{telemetry:'flowing'},'6h').title,'Publish · device-events','width alone keeps the label and suffix');
});
// #1163 review: a card leader never strikes through a trace label; it has a gap there.
test('a card leader leaves a gap where it would cross a trace label',()=>{
 const label={x:-20,y:20,w:40,h:15},clear={x:50,y:20,w:40,h:15};
 assert.equal(C.telemetryCardLeader({x:0,y:0},{x:0,y:100},[label,clear]),'M0 0L0 17M0 38L0 100','vertical leader through a label below the edge');
 assert.equal(C.telemetryCardLeader({x:0,y:0},{x:0,y:100},[]),'M0 0L0 100','no label, one unbroken line');
 assert.equal(C.telemetryCardLeader({x:0,y:0},{x:0,y:30},[{x:-20,y:-10,w:40,h:60}]),'','a leader wholly inside a label is not drawn');
});
