'use strict';
/* #1243 part 4: the Links window's Metrics tab (mockup m3). Read model (one row
   per template, plus Raw signals, Provider metrics and No metrics), binding a
   template (missing parameters flagged), switching template (card kept),
   raw → template only after Replace, imported carriers (the #1266 merge: hide
   and show, templates refused for now), Remove, and static drop checks. Every
   write goes through planCarrierTelemetry, as the Inspect Metrics editor does. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const c={URL,TextEncoder};vm.createContext(c);
vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js',
  'workbench/commands/graph.js','workbench/commands/narrative.js','workbench/commands/layout.js','workbench/commands/topology.js','workbench/commands/document.js',
  'workbench/commands/telemetry.js','workbench/commands/links.js','workbench/commands/links-metrics.js']),c);
const plain=x=>JSON.parse(JSON.stringify(x));
const d=s=>s.page.sections[0].diagram;
function board(){return {page:{title:'Doorbell',tracking:{telemetry:{templates:{
  'kafka-topic':{kind:'queue',params:['topic','group'],signals:{lag:{grafana:'sum(kafka_consumergroup_lag{topic="$topic",group="$group"})',unit:'msgs'},rate:{grafana:'sum(rate(kafka_topic_messages_in_total{topic="$topic"}[5m]))',unit:'msg/s'}}},
  'http-service':{kind:'call',params:['service'],signals:{latency:{grafana:'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="$service"}[5m])) by (le))',unit:'s'},errors:{grafana:'sum(rate(http_requests_total{service="$service",code=~"5.."}[5m]))'}}}}}},
  sections:[{heading:'Flow',diagram:{autoplay:false,
    nodes:{ctrl:{title:'Doorbell controller'},ingest:{title:'Event ingest',telemetry:{kind:'call',signals:{depth:{grafana:'sum(queue_depth{queue="events"})'}}}},notify:{title:'Notification service',telemetry:{use:'http-service',service:'notify'}},push:{title:'Push gateway'}},
    rows:[['ctrl','ingest','notify','push']],
    edges:[{from:'ctrl',to:'ingest',label:'event',telemetry:{use:'kafka-topic',topic:'doorbell-press',group:'ingest-workers'}},{from:'ingest',to:'notify',label:'route'},{from:'notify',to:'push',label:'push'}],
    steps:[{id:'publish',text:'publish',edge:'ctrl->ingest'},{id:'route',text:'route',edge:'ingest->notify',nodes:['notify']},{id:'push',text:'push',edge:'notify->push'}],
    panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}};}
function apply(spec,fn,context){
  const text=JSON.stringify(spec,null,2),plan=fn(text,JSON.parse(text),context);
  assert.equal(plan.error,undefined,plan.error);return {text:plan.text,raw:JSON.parse(plan.text),plan,unchanged:plan.text===text};
}
function model(spec,context){const text=JSON.stringify(spec,null,2);return c.linksMetricsModel(text,JSON.parse(text),context || null);}
function el(m,kind,at){const found=m.elements.find(e=>e.kind===kind && (kind==='node'?e.id===at:e.index===at));assert.ok(found,kind+' '+at+' is listed');return found;}
function group(m,key){const g=m.groups.find(x=>x.key===key);assert.ok(g,key+' is listed');return g;}
const ids=list=>plain(list.map(e=>e.kind+':'+(e.kind==='node'?e.id:e.index)).sort());
const NODE=id=>({kind:'node',section:0,id}),EDGE=(index,key)=>({kind:'edge',section:0,index,key});

test('LM1 rows: one per template, then Raw signals and No metrics; each lists its carriers and the steps that light them',()=>{
  assert.deepEqual(plain(c.validate(c.normalize(board())).errors),[],'the fixture is a board the product accepts');
  const m=model(board());assert.equal(m.error,undefined,m.error);
  assert.deepEqual(plain(m.groups.map(g=>g.key)),['template:http-service','template:kafka-topic','raw','none']);
  assert.deepEqual(ids(group(m,'template:kafka-topic').carriers),['edge:0']);
  assert.deepEqual(ids(group(m,'template:http-service').carriers),['node:notify']);
  assert.deepEqual(ids(group(m,'raw').carriers),['node:ingest']);
  assert.deepEqual(ids(group(m,'none').carriers),['edge:1','edge:2','node:ctrl','node:push']);
  assert.deepEqual(plain(group(m,'template:kafka-topic').steps.map(s=>s.index)),[0]);
  assert.deepEqual(plain(group(m,'template:http-service').steps.map(s=>s.index)),[1]);
  const kafka=m.templates.find(t=>t.name==='kafka-topic');
  assert.deepEqual(plain(kafka.params),['topic','group']);assert.deepEqual(plain(kafka.signals),['lag','rate']);
  assert.equal(el(m,'edge',0).group,'template:kafka-topic');assert.deepEqual(plain(el(m,'edge',0).missingParams),[]);
});

test('LM2 binding a template: one plan; a missing parameter is allowed and flagged',()=>{
  const s=apply(board(),(t,r)=>c.planLinksMetricsUse(t,r,EDGE(1,'ingest->notify'),'kafka-topic',false,null));
  assert.deepEqual(d(s.raw).edges[1].telemetry,{use:'kafka-topic'});
  const m=model(s.raw);assert.deepEqual(plain(el(m,'edge',1).missingParams),['topic','group']);
  assert.equal(el(m,'edge',1).group,'template:kafka-topic');
});

test('LM3 switching template keeps the card position and width (#1249) and carries matching parameters',()=>{
  const spec=board();d(spec).edges[0].telemetry.card={position:{x:120,y:40},width:240};
  const s=apply(spec,(t,r)=>c.planLinksMetricsUse(t,r,EDGE(0,'ctrl->ingest'),'http-service',false,null));
  assert.equal(d(s.raw).edges[0].telemetry.use,'http-service');
  assert.deepEqual(d(s.raw).edges[0].telemetry.card,{position:{x:120,y:40},width:240});
  assert.equal(d(s.raw).edges[0].telemetry.topic,undefined,'a parameter the new template does not have is dropped');
  assert.deepEqual(plain(el(model(s.raw),'edge',0).missingParams),['service']);
});

test('LM4 a carrier with raw signals asks before a template replaces them; Replace writes it',()=>{
  const text=JSON.stringify(board(),null,2),raw=JSON.parse(text);
  const ask=c.planLinksMetricsUse(text,raw,NODE('ingest'),'kafka-topic',false,null);
  assert.equal(ask.choose,true);assert.match(ask.error,/raw signals/);
  const s=apply(board(),(t,r)=>c.planLinksMetricsUse(t,r,NODE('ingest'),'kafka-topic',true,null));
  assert.deepEqual(d(s.raw).nodes.ingest.telemetry,{use:'kafka-topic'});
  assert.ok(apply(board(),(t,r)=>c.planLinksMetricsUse(t,r,NODE('notify'),'http-service',false,null)).unchanged,'the same template: no change');
});

function imported(){
  const spec=(id,diagram,tracking)=>({page:Object.assign({title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'}},tracking?{tracking}:{},{sections:[{id:'main',diagram}]})});
  const provider=spec('provider',{nodes:{api:{title:'API',telemetry:{kind:'call',signals:{latency:{grafana:'histogram_quantile(0.95, x)'},errors:{grafana:'sum(rate(errors[5m]))'}}}},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const source=spec('consumer',{nodes:{local:{title:'Local worker'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'canon'}],steps:[{id:'call',nodes:['canon::api']}],
    panels:[{id:'status',type:'live-status',title:'Delivery status'}]},board().page.tracking);
  return {source,context:{version:1,id:'consumer',specs:[provider,source]}};
}

test('LM5 imported carriers: Provider metrics row; hide and show write the overlay; a template is refused for now',()=>{
  const f=imported();
  assert.deepEqual(plain(c.validate(c.normalize(c.FlowTopology.resolveSource(f.source,f.context))).errors),[]);
  const m=model(f.source,f.context),api=el(m,'node','canon::api');
  assert.equal(api.group,'provider');assert.equal(api.imported,true);assert.deepEqual(plain(api.inheritedSignals),['latency','errors']);
  assert.deepEqual(ids(group(m,'provider').carriers),['node:canon::api']);
  assert.match(c.linksMetricsDropRefusal('kafka-topic',api),/Templates aren.t available on imported nodes yet; add signals in Inspect/);
  const text=JSON.stringify(f.source,null,2),raw=JSON.parse(text);
  assert.match(c.planLinksMetricsUse(text,raw,NODE('canon::api'),'kafka-topic',true,f.context).error,/Templates aren.t available on imported nodes yet/);
  let s=apply(f.source,(t,r)=>c.planLinksMetricsHide(t,r,NODE('canon::api'),'errors',true,f.context),f.context);
  assert.deepEqual(d(s.raw).topologyImports[0].nodeTracking.api.telemetry,{extends:true,hide:['errors']});
  assert.deepEqual(plain(el(model(s.raw,f.context),'node','canon::api').hidden),['errors']);
  s=apply(s.raw,(t,r)=>c.planLinksMetricsHide(t,r,NODE('canon::api'),'errors',false,f.context),f.context);
  assert.equal((d(s.raw).topologyImports[0].nodeTracking || {}).api,undefined,'showing it again leaves no overlay');
});

test('LM6 Remove metrics and the static drop checks',()=>{
  const s=apply(board(),(t,r)=>c.planLinksMetricsRemove(t,r,NODE('notify'),null));
  assert.equal(d(s.raw).nodes.notify.telemetry,undefined);
  const m=model(board());
  assert.match(c.linksMetricsDropRefusal('http-service',el(m,'node','notify')),/already uses http-service/);
  assert.equal(c.linksMetricsDropRefusal('http-service',el(m,'node','push')),null);
  assert.equal(c.linksMetricsDropRefusal('http-service',el(m,'node','ingest')),null,'raw signals: allowed, the drop asks Replace');
  assert.match(c.linksMetricsDropRefusal('http-service',{kind:'step',section:0,index:0}),/node or connection/);
  assert.match(c.linksMetricsDropRefusal('nope',el(m,'node','push')),/not defined/);
});

test('LM7 perf guard: rows and every drag hover over 400 carriers run no planner; only the drop does',()=>{
  const spec=board(),dg=d(spec),row=[];
  for(let i=0;i<400;i++){dg.nodes['n'+i]={title:'Node '+i};row.push('n'+i);if(i%3===0)dg.nodes['n'+i].telemetry={use:'http-service',service:'s'+i};}
  dg.rows.push(row);
  const names=['planLinksMetricsUse','planLinksMetricsRemove','planLinksMetricsHide','planCarrierTelemetry','planTopologyTracking'],saved={},calls={n:0};
  names.forEach(n=>{saved[n]=c[n];c[n]=function(){calls.n++;return saved[n].apply(null,arguments);};});
  try{
    const started=Date.now(),m=model(spec);let offered=0;
    for(const t of m.templates)for(const e of m.elements)if(c.linksMetricsDropRefusal(t.name,e)===null)offered++;
    const ms=Date.now()-started;
    assert.equal(calls.n,0,'no planner runs');assert.ok(ms<1500,'took '+ms+' ms');assert.ok(offered>500,'offered '+offered);
    const text=JSON.stringify(spec);c.planLinksMetricsUse(text,JSON.parse(text),NODE('n1'),'kafka-topic',false,null);assert.ok(calls.n>=1,'the drop runs the planner');
  }finally{names.forEach(n=>{c[n]=saved[n];});}
});

test('LM8 limits in force: a template limit shows with its source; a carrier value overrides it',()=>{
  const spec=board();spec.page.tracking.telemetry.templates['kafka-topic'].proof={lag:{max:50}};
  assert.deepEqual(plain(c.validate(c.normalize(spec)).errors),[]);
  assert.deepEqual(plain(el(model(spec),'edge',0).limits.lag.max),{value:50,from:'template'});
  const s=apply(spec,(t,r)=>c.planCarrierTelemetry(t,r,EDGE(0,'ctrl->ingest'),{op:'proof',signal:'lag',field:'max',value:80},null));
  assert.deepEqual(plain(el(model(s.raw),'edge',0).limits.lag.max),{value:80,from:'carrier'});
  assert.deepEqual(plain(el(model(board()),'node','ingest').limits),{},'no limits: nothing in force');
});

test('LM9 a ratio limit is kept as one: its max and the base signal',()=>{
  const spec=board();d(spec).edges[0].telemetry.proof={lag:{max:0.5,maxRatioOf:'rate'}};
  assert.deepEqual(plain(c.validate(c.normalize(spec)).errors),[]);
  const lag=el(model(spec),'edge',0).limits.lag;
  assert.deepEqual(plain(lag.max),{value:0.5,from:'carrier'});assert.deepEqual(plain(lag.maxRatioOf),{value:'rate',from:'carrier'});
});
