'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint,readSource}=require('../tools/source-loader.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
const query=(metric='TopicMatch',dimensions={RuleName:'camera_message_camera_stats_$env'})=>({namespace:'AWS/IoT',metric,dimensions,statistic:'Sum',region:'us-east-1',accountId:'$account'});
const binding=()=>({kind:'service',signals:{matched:{cloudwatch:query(),unit:'events'},success:{cloudwatch:query('Success',{RuleName:'camera_message_camera_stats',ActionType:'SQS'})},failure:{cloudwatch:query('Failure',{RuleName:'camera_message_camera_stats',ActionType:'Kafka'})}},proof:{matched:{min:1}},card:{side:'below',offset:3}});
const config=()=>({window:'24h',environment:'stg',grafana:{cloudwatch:'f448f9ed-b858-4637-bcf7-d1c1b4895e97'},environments:{qa:{grafana:{accountId:'111111111111'}},stg:{grafana:{accountId:'646998985045'}},prd:{grafana:{accountId:'333333333333'}}}});
const sample=value=>({label:'TopicMatch',timestamps:[1793827860000],values:[value],statistics:{avg:value,count:1,max:value,min:value,sum:value}});
function context(){const C={Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-11-04T22:00:00Z']));}static now(){return Date.parse('2026-11-04T22:00:00Z');}},URL,AbortController,TextDecoder,TextEncoder,console,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
function importedPage(C,literal){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API',telemetry:binding()},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',telemetry:binding()}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local',telemetry:binding()},other:{}},rows:[['local','other']],edges:[{from:'local',to:'other',telemetry:binding()}],topologyImports:[{spec:'provider',export:'core',as:'shared'}]},{tracking:{telemetry:config()}});
 if(literal)consumer.page.sections[0].diagram.nodes.local.telemetry.signals.matched.cloudwatch.accountId=literal;
 return C.normalize(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}));
}
async function setup({answer=()=>sample(24114),tools=['query_cloudwatch'],literal,missingMeansZero}={}){
 const C=context(),p=importedPage(C,literal),calls=[];
 if(missingMeansZero!==undefined){const visit=v=>{if(!v || typeof v!=='object')return;if(v.cloudwatch && typeof v.cloudwatch==='object')v.cloudwatch.missingMeansZero=missingMeansZero;Object.values(v).forEach(visit);};visit(p);}
 const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools}],callTool:async(server,tool,input,options)=>{calls.push({tool,input:plain(input),signal:options?.signal});return {payload:await answer(input,calls.length)};}})}});
 const carriers=fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram;Object.entries(d.nodes).forEach(([id,node])=>fn(node,id,p));d.edges.forEach(e=>fn(e,e.from+'->'+e.to,p));});
 const api=C.createTelemetry(p,adapter.options,{carriers}),handle=adapter.attach({telemetry:api},p);await settle();
 return {C,p,calls,api,close(){handle.destroy();api.destroy();}};
}
test('CloudWatch exact window/account/dimensions on local and resolved imported nodes and edge cards',async t=>{
 const h=await setup();t.after(()=>h.close());assert.equal(h.api.snapshot().available,true);assert.equal(h.calls.length,0);
 h.api.setEnabled(true);await settle();assert.equal(h.calls.length,12);
 assert.deepEqual(h.calls[0].input,{datasourceUid:config().grafana.cloudwatch,namespace:'AWS/IoT',metricName:'TopicMatch',region:'us-east-1',accountId:'646998985045',dimensions:{RuleName:'camera_message_camera_stats_stg'},statistic:'Sum',period:3600,start:'2026-11-03T22:00:00.000Z',end:'2026-11-04T22:00:00.000Z'});
 assert.ok(h.calls.every(c=>c.tool==='query_cloudwatch'&&c.signal&&!c.signal.aborted));
 assert.deepEqual([...new Set(h.calls.filter(c=>c.input.metricName==='Success').map(c=>c.input.dimensions.ActionType))],['SQS']);
 assert.deepEqual([...new Set(h.calls.filter(c=>c.input.metricName==='Failure').map(c=>c.input.dimensions.ActionType))],['Kafka']);
 const map=h.api.snapshot().map;
 for(const id of ['local','local->other','shared::api','shared::api->shared::store']){
  assert.equal(map[id].signals.matched.value,24114,id);assert.equal(map[id].signals.matched.observedAt,'2026-11-04T21:31:00.000Z');
  assert.equal(map[id].signals.matched.unit,'events');assert.deepEqual(plain(map[id].signals.matched.series),[[1793827860000,24114]]);
  assert.equal(h.api.bindings().find(b=>b.id===id).card.side,'below');
 }
});
test('successful empty or malformed results clear obsolete samples; real zero remains observed',async t=>{
 let payload=sample(24114);const h=await setup({answer:()=>payload});t.after(()=>h.close());h.api.setEnabled(true);await settle();
 payload={timestamps:[],values:[],statistics:{sum:0},hints:['Specify accountId']};h.api.retry();await settle();assert.deepEqual(plain(h.api.snapshot().map),{});assert.match(h.api.status().note,/no data points yet/);assert.doesNotMatch(h.api.status().note,/failed/);
 payload=sample(0);h.api.retry();await settle();assert.equal(h.api.snapshot().map.local.signals.matched.value,0);assert.equal(h.api.status().note,'');
 payload={timestamps:[1793827860000],values:['bad'],statistics:{sum:0}};h.api.retry();await settle();assert.deepEqual(plain(h.api.snapshot().map),{});
});
test('mapper requires observations before statistics and never substitutes zero for missing data',()=>{
 const C=context();assert.equal(C.telemetryGrafanaCloudwatch({statistics:{sum:24114}}),null);
 assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1793827860000],values:[0]}).value,0);
 assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1793827860000,1793827861000],values:[1,2]}).value,3);
 assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1793827860000,1793827861000],values:[1,2],statistics:{sum:3}}).value,3);
});
test('qa/stg/prd switches clear and rebind imported/local account and env; explicit accounts stay literal',async t=>{
 const h=await setup();t.after(()=>h.close());h.api.setEnabled(true);await settle();
 for(const [env,account] of [['qa','111111111111'],['prd','333333333333'],['stg','646998985045']]){
  const before=h.calls.length;h.api.setEnvironment(env);assert.deepEqual(plain(h.api.snapshot().map),{});await settle();
  assert.equal(h.calls.length-before,12);assert.ok(h.calls.slice(before).every(c=>c.input.accountId===account));assert.equal(h.calls[before].input.dimensions.RuleName,'camera_message_camera_stats_'+env);
 }
 assert.equal(h.p.tracking.telemetry.environment,'stg');
 const literal=await setup({literal:'444444444444'});t.after(()=>literal.close());literal.api.setEnabled(true);await settle();assert.ok(literal.calls.some(c=>c.input.accountId==='444444444444'));literal.api.setEnvironment('prd');await settle();assert.equal(literal.calls.at(-12).input.accountId,'444444444444');
});
test('missing tool, missing account and page-denied tool give one-line diagnostics',async t=>{
 const missing=await setup({tools:['query_prometheus']});t.after(()=>missing.close());assert.equal(missing.api.snapshot().available,false);assert.match(missing.api.status().note,/query_cloudwatch/);assert.equal(missing.calls.length,0);
 const h=await setup();t.after(()=>h.close());delete h.p.tracking.telemetry.environments.stg.grafana.accountId;h.api.setEnabled(true);await settle();assert.equal(h.calls.length,0);assert.match(h.api.status().note,/grafana.accountId/);assert.deepEqual(plain(h.api.snapshot().map),{});
 const denied=await setup({answer:()=>{throw {code:'not_in_manifest'};}});t.after(()=>denied.close());denied.api.setEnabled(true);await settle();assert.match(denied.api.status().note,/cannot call CloudWatch \(query_cloudwatch\)/);assert.doesNotMatch(denied.api.status().note,/\n/);
});
test('validator and desktop editor preserve structured queries and reject unsupported statistics',()=>{
 const C=context();vm.runInNewContext(readSource('workbench/commands/telemetry.js'),C);
 const raw={telemetry:binding()},before=JSON.stringify(raw),warnings=[];
 assert.equal(C.carrierTelemetry(raw,{},(at,msg)=>warnings.push(msg)).signals.matched.source,'cloudwatch');assert.deepEqual(warnings,[]);assert.equal(JSON.stringify(raw),before);
 assert.deepEqual(plain(C.telemetryQueryValue('cloudwatch',JSON.stringify(query())).value),query());
 assert.deepEqual(JSON.parse(C.telemetryQueryText('cloudwatch',query())),query());
 for(const patch of [{statistic:'Median'},{metric:''},{accountId:''},{dimensions:{RuleName:5}},{missingMeansZero:'true'}]){const q={...query(),...patch},warn=[];const b=C.carrierTelemetry({telemetry:{kind:'service',signals:{bad:{cloudwatch:q},good:{grafana:'up'}}}},{},(at,msg)=>warn.push(msg));assert.equal(b.signals.bad,undefined);assert.ok(b.signals.good);assert.match(warn.join(' '),/cloudwatch requires/);assert.ok(C.telemetryQueryValue('cloudwatch',JSON.stringify(q)).error);}
 const unknown=[];C.carrierTelemetry({telemetry:{kind:'service',signals:{bad:{unknown:'q'}}}},{},(at,msg)=>unknown.push(msg));assert.match(unknown.join(' '),/exactly one of/);
});

test('page window supplies useful periods and CloudWatch selected history queries an anchored range',async t=>{
 const h=await setup();t.after(()=>h.close());h.p.tracking.telemetry.window='6h';h.api.setEnabled(true);await settle();
 assert.ok(h.calls.every(c=>c.input.period===300&&Date.parse(c.input.end)-Date.parse(c.input.start)===21600000));
 const count=h.calls.length;h.api.openHistory([{key:'2026-11-04',at:'2026-11-04T22:00:00.000Z'}],0);await settle();
 assert.equal(h.calls.length,count+12);assert.equal(h.api.snapshot().map.local.signals.matched.value,24114);assert.equal(h.api.status().note,'');
});

for(const window of ['-6h','now-6h',' -24h '])test('relative '+window+' drives CloudWatch anchored range and useful period for local/imported carriers',async t=>{
 const h=await setup();t.after(()=>h.close());h.p.tracking.telemetry.window=window;const before=JSON.stringify(h.p);
 h.api.setEnabled(true);await settle();const duration=window.includes('24')?'24h':'6h',seconds=duration==='24h'?86400:21600;
 assert.equal(h.calls.length,12);assert.ok(h.calls.every(c=>c.input.period===(duration==='24h'?3600:300)&&Date.parse(c.input.end)-Date.parse(c.input.start)===seconds*1000));
 for(const id of ['local','shared::api','local->other','shared::api->shared::store'])assert.equal(h.api.snapshot().map[id].signals.matched.value,24114);
 assert.equal(JSON.stringify(h.p),before,'querying leaves authored window intact');
});

test('missingMeansZero defaults false and only opts successful empty arrays into observed zero for every origin',async t=>{
 for(const opt of [undefined,false,true]){
  let payload={timestamps:[],values:[],statistics:{sum:0},hints:['No samples']};
  const h=await setup({missingMeansZero:opt,answer:()=>payload});t.after(()=>h.close());h.api.setEnabled(true);await settle();
  for(const id of ['local','local->other','shared::api','shared::api->shared::store'])assert.equal(h.api.snapshot().map[id]?.signals.matched.value,opt===true?0:undefined);
  assert.doesNotMatch(h.api.status().note,/failed/);
  for(const malformed of [{values:[],timestamps:[1]},{values:[]},{status:'error',values:[],timestamps:[]},{values:['bad'],timestamps:[1]}]){
   payload=malformed;h.api.retry();await settle();assert.deepEqual(plain(h.api.snapshot().map),{});assert.match(h.api.status().note,/failed/);
  }
  payload=sample(0);h.api.retry();await settle();assert.equal(h.api.snapshot().map.local.signals.matched.value,0);
 }
});
