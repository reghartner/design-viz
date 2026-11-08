'use strict';
/* #1111: loki and grafana (Prometheus) signals accept the signal field missingMeansZero.
   Absent keeps today's empty rule (Loki: a recognized count/rate query reads 0; Prometheus:
   0 in Live, unobserved in an Over time day). false makes a successful empty result
   unobserved with a note, in Live and in an Over time day. Carriers: local node and edge,
   imported node and edge. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
const NOW='2026-11-04T22:00:00Z',SECONDS=Date.parse(NOW)/1000-3600,DAY=[{key:'2026-11-04',at:'2026-11-04T22:00:00.000Z'}];
const LOKI='sum(count_over_time({app="api"} |= "debug" [5m]))',PROM='sum(rate(requests_total[5m]))';
const EMPTY={loki:{status:'success',data:{resultType:'matrix',result:[]}},prom:{status:'success',data:{resultType:'matrix',result:[]}}};
const FULL={loki:{data:[{values:[[SECONDS,'4']]}]},prom:{data:{result:[{values:[[SECONDS,'7']]}]}}};
const IDS=['local','local->other','shared::api','shared::api->shared::store'];
function context(){const C={Date:class extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return Date.parse(NOW);}},URL,AbortController,TextDecoder,TextEncoder,console,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
function binding(opt){
 const logs={loki:LOKI},rate={grafana:PROM};
 if(opt!==undefined){logs.missingMeansZero=opt;rate.missingMeansZero=opt;}
 return {kind:'service',signals:{logs,rate}};
}
function importedPage(C,opt){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API',telemetry:binding(opt)},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',telemetry:binding(opt)}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local',telemetry:binding(opt)},other:{}},rows:[['local','other']],edges:[{from:'local',to:'other',telemetry:binding(opt)}],topologyImports:[{spec:'provider',export:'core',as:'shared'}]},{tracking:{telemetry:{window:'24h',grafana:{prometheus:'prom',loki:'logs'}}}});
 return C.normalize(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}));
}
async function setup(opt,answer){
 const C=context(),p=importedPage(C,opt),calls=[];
 const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_prometheus','query_loki_logs']}],callTool:async(server,tool,input)=>{calls.push({tool,input:plain(input)});return {payload:answer(tool)};}})}});
 const carriers=fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram;Object.entries(d.nodes).forEach(([id,node])=>fn(node,id,p));d.edges.forEach(e=>fn(e,e.from+'->'+e.to,p));});
 const api=C.createTelemetry(p,adapter.options,{carriers}),handle=adapter.attach({telemetry:api},p);await settle();
 api.setEnabled(true);await settle();
 return {C,calls,api,close(){handle.destroy();api.destroy();}};
}
const answerWith=({loki,prom})=>tool=>plain(tool==='query_loki_logs'?loki:prom);
async function overTime(h){h.api.openHistory(DAY,0);await settle();return {map:plain(h.api.snapshot().map),note:h.api.status().note};}

test('1. Loki empty counting result without missingMeansZero stays observed zero (Live and an Over time day)',async t=>{
 for(const opt of [undefined,true]){
  const h=await setup(opt,answerWith(EMPTY));t.after(()=>h.close());
  assert.ok(h.calls.some(c=>c.tool==='query_loki_logs'));
  const live=plain(h.api.snapshot().map);for(const id of IDS)assert.equal(live[id]?.signals.logs?.value,0,'Live '+id+' opt '+opt);
  const past=await overTime(h);for(const id of IDS)assert.equal(past.map[id]?.signals.logs?.value,0,'Over time '+id+' opt '+opt);
 }
});

test('2. Loki empty with missingMeansZero false is unobserved with a note (Live and an Over time day)',async t=>{
 const h=await setup(false,answerWith(EMPTY));t.after(()=>h.close());
 assert.ok(h.calls.some(c=>c.tool==='query_loki_logs'&&c.input.logql===LOKI),'the query still runs');
 const live=plain(h.api.snapshot().map);for(const id of IDS)assert.equal(live[id]?.signals.logs,undefined,'Live '+id);
 assert.match(h.api.status().note,/logs: no numeric observation/);
 const past=await overTime(h);for(const id of IDS)assert.equal(past.map[id]?.signals.logs,undefined,'Over time '+id);
 assert.match(past.note,/logs: no numeric observation/);
});

test('a failed Loki or Prometheus query is never zero, with or without missingMeansZero (Live and an Over time day)',async t=>{
 const ERROR={status:'error',errorType:'bad_data',error:'boom',data:{resultType:'matrix',result:[]}};
 for(const opt of [undefined,false]){
  const h=await setup(opt,answerWith({loki:ERROR,prom:ERROR}));t.after(()=>h.close());
  const live=plain(h.api.snapshot().map);
  for(const id of IDS){assert.equal(live[id]?.signals.logs,undefined,'Live Loki '+id+' opt '+opt);assert.equal(live[id]?.signals.rate,undefined,'Live Prometheus '+id+' opt '+opt);}
  assert.match(h.api.status().note,/8 Grafana queries failed/,'both signals fail on all four carriers');
  const past=await overTime(h);
  for(const id of IDS){assert.equal(past.map[id]?.signals.logs,undefined,'Over time Loki '+id);assert.equal(past.map[id]?.signals.rate,undefined,'Over time Prometheus '+id);}
  assert.match(past.note,/8 Grafana queries failed/,'Over time: both signals fail on all four carriers');
 }
});

test('3. Prometheus empty with missingMeansZero false is unobserved; without it Live reads 0 and an Over time day stays unobserved',async t=>{
 const before=await setup(undefined,answerWith(EMPTY));t.after(()=>before.close());
 const live=plain(before.api.snapshot().map);for(const id of IDS){assert.equal(live[id]?.signals.rate?.value,0,'default Live '+id);assert.deepEqual(live[id].signals.rate.series,[]);}
 let past=await overTime(before);for(const id of IDS)assert.equal(past.map[id]?.signals.rate,undefined,'default Over time '+id);
 const h=await setup(false,answerWith(EMPTY));t.after(()=>h.close());
 assert.ok(h.calls.some(c=>c.tool==='query_prometheus'&&c.input.expr===PROM),'the query still runs');
 const off=plain(h.api.snapshot().map);for(const id of IDS)assert.equal(off[id]?.signals.rate,undefined,'false Live '+id);
 assert.match(h.api.status().note,/rate: no numeric observation/);
 past=await overTime(h);for(const id of IDS)assert.equal(past.map[id]?.signals.rate,undefined,'false Over time '+id);
 assert.match(past.note,/rate: no numeric observation/);
});

test('4. non-empty Loki and Prometheus results are unchanged by missingMeansZero',async t=>{
 const seen=[];
 for(const opt of [undefined,false,true]){
  const h=await setup(opt,answerWith(FULL));t.after(()=>h.close());
  const live=plain(h.api.snapshot().map),past=await overTime(h);
  for(const id of IDS){
   assert.equal(live[id].signals.logs.value,4);assert.equal(live[id].signals.rate.value,7);
   assert.deepEqual(live[id].signals.rate.series,[[SECONDS*1000,7]]);assert.equal(past.map[id].signals.logs.value,4);assert.equal(past.map[id].signals.rate.value,7);
  }
  seen.push(JSON.stringify([live,past.map]));
 }
 assert.equal(new Set(seen).size,1,'absent, false and true give the same samples');
});

test('5. non-boolean missingMeansZero warns at its field path; sources where it means nothing reject it',()=>{
 const C=context(),signals={logs:{loki:LOKI,missingMeansZero:'false'},rate:{grafana:PROM,missingMeansZero:0},ok:{loki:LOKI,missingMeansZero:false},
  trace:{tempo:'{}',missingMeansZero:false},sql:{sql:'SELECT 1',missingMeansZero:true},honey:{honeycomb:{calculations:[{op:'COUNT'}]},missingMeansZero:true},
  cw:{cloudwatch:{namespace:'AWS/SQS',metric:'Sent',region:'us-east-1',accountId:'111111111111',dimensions:{QueueName:'q'},statistic:'Sum'},missingMeansZero:true},
  cwl:{cloudwatchLogs:{logGroups:['g'],query:'stats count() as n',region:'us-east-1'},missingMeansZero:true}};
 const page={page:{tracking:{telemetry:{grafana:{prometheus:'prom',loki:'logs'}}},sections:[{diagram:{nodes:{a:{title:'A',telemetry:{kind:'service',signals}},b:{title:'B'}},rows:[['a','b']],panels:[{id:'status',type:'live-status'}]}}]}};
 const result=plain(C.validate(C.normalize(page)));assert.deepEqual(result.errors,[]);
 const at='sections[0].diagram.nodes.a.telemetry.signals.',warned=result.warnings.filter(w=>/missingMeansZero/.test(w));
 assert.deepEqual(warned.map(w=>w.split(': ')[0]),['logs','rate','trace','sql','honey','cw','cwl'].map(n=>at+n+'.missingMeansZero'));
 assert.match(warned[0],/must be a boolean — ignored$/);assert.match(warned[1],/must be a boolean — ignored$/);
 for(const w of warned.slice(2))assert.match(w,/only loki and grafana signals.* — ignored$/);
 assert.match(warned[5],/inside the cloudwatch query/);
 const b=C.carrierTelemetry({telemetry:{kind:'service',signals}},{});
 assert.equal(b.signals.ok.missingMeansZero,false);
 for(const n of ['logs','rate','trace','sql','honey','cw','cwl']){assert.ok(b.signals[n],n+' signal kept');assert.equal(Object.hasOwn(b.signals[n],'missingMeansZero'),false,n+' field dropped');}
});
