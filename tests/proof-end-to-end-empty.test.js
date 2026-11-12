'use strict';
/* #1404 (Chuck, 2026-11-12): with tracking.endToEndMetrics, a query that succeeds but returns
   no data is UNPROVEN, the same as zero; "not measured" stays only for a query that failed or is
   still loading. Providers report such a signal as {empty: true}. Without the flag nothing changes:
   the signal stays absent (unobserved) as before.
| row | provider / seam | flag on | flag off |
|---|---|---|---|
| E1 | Prometheus empty vector, missingMeansZero false | {empty:true}, UNPROVEN, card "no data" | absent, no verdict change |
| E2 | Loki empty result, non-counting query | {empty:true}, UNPROVEN | absent |
| E3 | SQL with zero rows | {empty:true}, UNPROVEN, no failure note | "returned no number" failure as before |
| E4 | CloudWatch with no data points | {empty:true}, UNPROVEN | absent |
| E5 | failed Prometheus query | absent, no verdict (not measured) | absent |
| E6 | Honeycomb raw answer with no result rows | {empty:true} | throws as before |
| E7 | proofVerdicts / telemetrySample | empty reads 0 only with the flag; empty is dropped when a value or point exists | identical to absent |
| E8 | an empty non-rate signal (p95 max 500) beside traffic | carrier UNPROVEN, not "End to end proven"; empty ratio numerator and role:error stay 0 | identical to absent | */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
const NOW='2026-11-04T22:00:00Z';
function context(){const C={Date:class extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return Date.parse(NOW);}},URL,AbortController,TextDecoder,TextEncoder,console,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
const EMPTY_MATRIX={status:'success',data:{resultType:'matrix',result:[]}};
const SIGNALS={
  prom:{grafana:'sum(rate(requests_total[5m]))',unit:'req/h',missingMeansZero:false},
  loki:{loki:'sum(rate({app="api"} | json | unwrap latency [5m]))',unit:'req/h'},
  sql:{sql:'select count(*) from events where ok',unit:'req/h'},
  cw:{cloudwatch:{namespace:'AWS/IoT',metric:'TopicMatch',dimensions:{RuleName:'r'},statistic:'Sum',region:'us-east-1',accountId:'123456789012'},unit:'req/h'},
};
const ANSWERS={
  query_prometheus:()=>EMPTY_MATRIX,query_loki_logs:()=>EMPTY_MATRIX,query_sql:()=>({rows:[]}),query_cloudwatch:()=>({values:[],timestamps:[]}),
};
function page(C,name,flag){
  return C.normalize({page:{title:'E2E empty',tracking:{telemetry:{window:'24h',grafana:{prometheus:'prom',loki:'logs',sql:'lake',cloudwatch:'cw'}},...(flag?{endToEndMetrics:true}:{})},
    sections:[{id:'main',diagram:{nodes:{api:{title:'API',telemetry:{kind:'service',signals:{rate:SIGNALS[name]},proof:{rate:{min:1}}}}},rows:[['api']]}}]}});
}
async function setup(name,flag,answers=ANSWERS){
  const C=context(),p=page(C,name,flag),calls=[];
  const tools=['query_prometheus','query_loki_logs','query_sql','query_cloudwatch'];
  const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools}],callTool:async(server,tool,input)=>{calls.push(tool);return {payload:answers[tool](input)};}})}});
  const carriers=fn=>C.sectionRecords(p).forEach(r=>Object.entries(r.section.diagram.nodes).forEach(([id,node])=>fn(node,id,p)));
  const api=C.createTelemetry(p,adapter.options,{carriers}),handle=adapter.attach({telemetry:api},p);await settle();
  api.setEnabled(true);await settle();
  const snap=api.snapshot();
  return {C,calls,api,snap,rate:plain(snap.map.api?.signals.rate),result:plain(snap.verdicts.carriers.api),note:api.status().note,close(){handle.destroy();api.destroy();}};
}

for(const [row,name,tool] of [['E1','prom','query_prometheus'],['E2','loki','query_loki_logs'],['E3','sql','query_sql'],['E4','cw','query_cloudwatch']])
  test(row+' '+tool+' succeeding with no data: UNPROVEN with the flag, unchanged without it',async t=>{
    const on=await setup(name,true);t.after(()=>on.close());
    assert.ok(on.calls.includes(tool),tool+' ran');
    assert.equal(on.rate.empty,true,'flag on: the signal is reported as empty');assert.equal('value' in on.rate,false);assert.deepEqual(on.rate.series || [],[]);
    assert.equal(on.result.verdict,'unproven');assert.equal(on.result.label,'UNPROVEN');assert.equal(on.result.telemetry,'silent');
    assert.doesNotMatch(on.note || '',/failed/,'a successful empty answer is not a failure');
    const binding=on.snap.carriers.find(b=>b.id==='api');
    assert.equal(on.C.telemetryCardValue(binding,on.snap.map.api,'rate',null,'24h'),'no data');
    const model=on.C.liveStatusProofPresentation(on.snap,'24h');
    assert.ok(model,'an empty answer opens Proof with the flag');assert.equal(model.endToEnd.headline,'0 of 1 proven');assert.deepEqual(plain(model.endToEnd.unproven),['api']);
    const off=await setup(name,false);t.after(()=>off.close());
    assert.equal(off.rate,undefined,'flag off: the signal stays absent, as before');
    assert.equal('endToEnd' in off.snap.verdicts,false);
    if(name==='sql')assert.match(off.note,/query_sql returned no number/,'flag off: zero SQL rows stay a failure, as before');
  });

test('E5 a failed query stays not measured with the flag (no verdict), never unproven',async t=>{
  const ERROR={status:'error',errorType:'bad_data',error:'boom',data:{resultType:'matrix',result:[]}};
  const on=await setup('prom',true,{...ANSWERS,query_prometheus:()=>ERROR});t.after(()=>on.close());
  assert.equal(on.rate,undefined);assert.equal(on.result.verdict,null);assert.equal(on.result.counted,true);
  assert.match(on.note,/Grafana query failed/);
  const sql=await setup('sql',true,{...ANSWERS,query_sql:()=>({rows:[['not a number']]})});t.after(()=>sql.close());
  assert.equal(sql.rate,undefined,'a SQL answer with rows but no number is a failure');assert.equal(sql.result.verdict,null);
});

test('E6 Honeycomb raw answer with no result rows is empty only with the flag',()=>{
  const C=context(),query={key:'COUNT'};
  assert.deepEqual(plain(C.telemetryHoneycombSample({results:[],series:[]},query,'events/h',true)),{empty:true,series:[],observedAt:null,unit:'events/h'});
  assert.throws(()=>C.telemetryHoneycombSample({results:[],series:[]},query,'events/h',false),/expected one aggregate row/);
  assert.throws(()=>C.telemetryHoneycombSample({results:[],series:[]},query,'events/h'),/expected one aggregate row/);
  assert.equal(C.telemetryHoneycombSample({results:[{data:{COUNT:3}}]},query,'',true).value,3,'a real row is unchanged');
});

test('E7 proofVerdicts reads empty as 0 only with the flag; telemetrySample keeps empty only without a value or point',()=>{
  const C=context();
  const carrier={id:'api',tickets:['A-1'],kind:'service',signals:{rate:{source:'grafana',query:'q',unit:'req/h'}},proof:{rate:{min:1}}};
  const empty={api:{signals:{rate:{empty:true}}}},absent={api:{signals:{}}},jiraMap={'A-1':{state:'done'}};
  assert.equal(C.proofVerdicts({carriers:[carrier],jiraMap,telemetryMap:empty},{endToEndMetrics:true}).carriers.api.verdict,'unproven');
  assert.equal(C.proofVerdicts({carriers:[carrier],jiraMap,telemetryMap:absent},{endToEndMetrics:true}).carriers.api.verdict,null);
  assert.deepEqual(plain(C.proofVerdicts({carriers:[carrier],jiraMap,telemetryMap:empty})),plain(C.proofVerdicts({carriers:[carrier],jiraMap,telemetryMap:absent})),'flag off: empty is the same as absent');
  assert.deepEqual(plain(C.telemetrySample({signals:{rate:{empty:true}}}).signals.rate),{empty:true});
  assert.deepEqual(plain(C.telemetrySample({signals:{rate:{empty:true,value:4}}}).signals.rate),{value:4});
  assert.deepEqual(plain(C.telemetrySample({signals:{rate:{empty:true,series:[[Date.parse(NOW),2]]}}}).signals.rate),{series:[[Date.parse(NOW),2]]});
  assert.deepEqual(plain(C.telemetrySample({signals:{rate:{empty:'yes'}}}).signals.rate),{});
});

/* #1406 review c2: an empty answer is 0 only for traffic (rate-like) and error-role signals. An empty
   latency or other non-rate signal proves nothing: its carrier is unproven, never "End to end proven". */
test('E8 traffic plus an empty p95 latency is unproven and the board is not "End to end proven"',()=>{
  const C=context();
  const signals={rate:{source:'grafana',query:'rate',unit:'req/h'},errors:{source:'grafana',query:'errors',unit:'req/h'},p95:{source:'grafana',query:'p95',unit:'ms'}};
  const call=(id,extra={})=>({id,tickets:[],kind:'call',signals:{...signals,...extra},proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01},p95:{max:500}}});
  const judge=(carrier,sample,options={endToEndMetrics:true})=>plain(C.proofVerdicts({carriers:[carrier],telemetryMap:{[carrier.id]:{signals:sample}}},options));
  const emptyP95=judge(call('api'),{rate:{value:1300},errors:{value:0},p95:{empty:true}});
  assert.equal(emptyP95.carriers.api.verdict,'unproven','an empty p95 (max 500) does not hold its limit by reading 0');
  assert.equal(emptyP95.endToEnd.complete,false);assert.equal(emptyP95.endToEnd.headline,'0 of 1 proven');assert.deepEqual(emptyP95.endToEnd.unproven,['api']);
  const onlyRate=plain(C.proofVerdicts({carriers:[{id:'api',tickets:[],kind:'call',signals:{rate:signals.rate,p95:signals.p95},proof:{rate:{min:10},p95:{max:500}}}],telemetryMap:{api:{signals:{rate:{value:1300},p95:{empty:true}}}}},{endToEndMetrics:true}));
  assert.equal(onlyRate.carriers.api.verdict,'unproven','rate 1300 (min 10) + p95 {empty:true} (max 500)');assert.notEqual(onlyRate.endToEnd.headline,'End to end proven');
  assert.equal(judge(call('api'),{rate:{value:1300},errors:{empty:true},p95:{value:410}}).carriers.api.verdict,'proven','an empty ratio numerator (errors) is zero errors');
  const errorRole=call('api',{lag:{source:'grafana',query:'failures',unit:'errors',role:'error'}});errorRole.proof.lag={max:5};
  assert.equal(judge(errorRole,{rate:{value:1300},errors:{value:0},p95:{value:410},lag:{empty:true}}).carriers.api.verdict,'proven','an empty role:error signal means no errors');
  assert.equal(judge(call('api'),{rate:{value:1300},errors:{value:0},p95:{value:410}}).carriers.api.verdict,'proven','control: a real p95 within its limit');
  const gauge={id:'q',tickets:[],kind:'queue',signals:{rate:{source:'grafana',query:'in',unit:'msg/h'},depth:{source:'grafana',query:'depth',unit:'msgs'}},proof:{rate:{min:10}}};
  const display=judge(gauge,{rate:{value:100},depth:{empty:true}});
  assert.equal(display.carriers.q.verdict,'proven','rate 100 (min 10) + an empty gauge with no limit: the gauge does not affect Proof');assert.equal(display.endToEnd.headline,'End to end proven');
  assert.deepEqual(judge(call('api'),{rate:{value:1300},errors:{value:0},p95:{empty:true}},null),judge(call('api'),{rate:{value:1300},errors:{value:0}},null),'flag off: an empty p95 is the same as an absent one');
});
