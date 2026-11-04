'use strict';
/* #937 contract matrix: authored telemetry signal bindings (spec only; no runtime, no results).
| row | rule |
|---|---|
| T1 | `trackingTelemetry(page)` always returns `{grafana, honeycomb, window, refreshMs, templates}`; absent → `{}`/`{}`/`'1h'`/`null`/`{}`. |
| T2 | Page config keeps Grafana datasource UIDs (prometheus/loki/tempo/sql), Honeycomb environment+dataset, a duration `window`, `refreshMs` (floor 60000), named templates. |
| T3 | Malformed page fields warn once per entry through `invalid(path, message)` and are dropped; nothing throws; the source is not modified. |
| T4 | `carrierTelemetry(obj, templates)` parses a raw binding into `{kind, signals:{name:{source,query,unit}}, proof:{name:{min?,max?,maxRatioOf?}}, links, card}`. |
| T5 | Each signal has exactly one source key: grafana/loki/tempo/sql strings, honeycomb a query object (cloned). Zero or two sources, empty queries and bad names drop that signal only. |
| T6 | proof: finite min/max; maxRatioOf names another signal and needs max; unknown targets, impossible ranges and empty limits drop that entry only. |
| T7 | kind must be call/queue/service/log-event/device, and at least one signal must survive; otherwise the carrier is unbound (null) with a warning. |
| T8 | No `telemetry` → null, no warning; nothing is inferred from ids, titles or service-like fields. Text boxes never bind. |
| T9 | `use` expands a page template by pure `$param`/`${param}` substitution (only declared params; Grafana `$__…` untouched); carrier kind/signals/proof/links/card lay over the template per name. Unknown templates, missing params and undeclared keys warn. |
| T10 | Validator: page and carrier telemetry problems are warnings at full spec paths, never errors; a valid page has no telemetry warnings. |
| T11 | Compatibility: `flow.telemetry` (0.2.0) is declared for page `tracking.telemetry`, node/edge `telemetry`, and nodeTracking/edgeTracking overlays; absent otherwise. |
| T12 | Imported topology: nodeTracking/edgeTracking accept `telemetry`, the overlay replaces the provider binding, provider `use` expands with provider templates, Workbench ticket edits keep it, snapshot edits are tracking. |
| T13 | Export round-trip: stamped export text keeps every authored telemetry field and declares `flow.telemetry`. |
| T14 | docs/live-status.md documents the field family; its call and queue examples parse without warnings. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const loader=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/layout.js','workbench/commands/topology.js','workbench/io-model.js','workbench/session.js']),C);
const plain=v=>JSON.parse(JSON.stringify(v));
function api(){
  assert.equal(typeof C.trackingTelemetry,'function','T1: trackingTelemetry(page) is a shared tracking parser');
  assert.equal(typeof C.carrierTelemetry,'function','T4: carrierTelemetry(obj, templates) is a shared tracking parser');
  return C;
}
function recorder(){const paths=[],messages=[];return {paths,messages,fn:(path,message)=>{paths.push(path);messages.push(path+': '+message);}};}
const PROM_RATE='sum(rate(push_sent_total{app="notify"}[5m]))*3600';
const PROM_ERRORS='sum(rate(push_failed_total{app="notify"}[5m]))*3600';
const CALL=()=>({kind:'call',
  signals:{rate:{grafana:PROM_RATE,unit:'req/h'},errors:{grafana:PROM_ERRORS,unit:'req/h'}},
  proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01}},
  links:{dashboard:'https://acme.grafana.net/d/notify/push',query:'https://acme.grafana.net/explore?left=push'},
  card:{side:'left',offset:12}});
const LOKI_IN='sum(count_over_time({app="ingest"} |= "event queued" [5m]))';
const QUEUE=()=>({kind:'queue',
  signals:{in:{loki:LOKI_IN,unit:'msgs'},
    lag:{grafana:'max(kafka_consumergroup_lag{topic="device-events",group="notify"})',unit:'msgs'},
    age:{grafana:'max(kafka_consumergroup_lag_seconds{topic="device-events",group="notify"})',unit:'s'}},
  proof:{in:{min:1},lag:{max:500},age:{max:60}}});
const TEMPLATES=()=>({'kafka-topic':{kind:'queue',params:['topic','group'],
  signals:{in:{grafana:'sum(rate(kafka_messagesin_total{topic="$topic"}[$__rate_interval]))*3600',unit:'msg/h'},
    lag:{grafana:'max(kafka_consumergroup_lag{topic="${topic}",group="$group"})'},
    depth:{grafana:'max(kafka_log_size{topic="$topicName"})'}},
  proof:{in:{min:10},lag:{max:500}},
  links:{dashboard:'https://acme.grafana.net/d/kafka?var-topic=$topic'}}});

test('T1 T2 page telemetry config parses datasource ids, window, refresh and named templates',()=>{
  const {trackingTelemetry}=api();
  for(const page of [{},{tracking:{}},{tracking:{jira:{site:'https://jira.test'}}},null])
    assert.deepEqual(plain(trackingTelemetry(page)),{grafana:{},honeycomb:{},window:'1h',refreshMs:null,templates:{}});
  const page={tracking:{telemetry:{grafana:{prometheus:'prom-main',loki:'loki-main',tempo:'tempo-main',sql:'lake'},
    honeycomb:{environment:'prod',dataset:'doorbell-prod'},window:'6h',refreshMs:300000,templates:TEMPLATES()}}};
  const before=JSON.stringify(page),seen=recorder(),parsed=plain(trackingTelemetry(page,seen.fn));
  assert.deepEqual(seen.messages,[]);assert.equal(JSON.stringify(page),before);
  assert.deepEqual(parsed.grafana,{prometheus:'prom-main',loki:'loki-main',tempo:'tempo-main',sql:'lake'});
  assert.deepEqual(parsed.honeycomb,{environment:'prod',dataset:'doorbell-prod'});
  assert.equal(parsed.window,'6h');assert.equal(parsed.refreshMs,300000);
  assert.deepEqual(Object.keys(parsed.templates),['kafka-topic']);
  assert.deepEqual(parsed.templates['kafka-topic'].params,['topic','group']);
  assert.deepEqual(Object.keys(parsed.templates['kafka-topic'].signals),['in','lag','depth']);
});

test('T3 malformed page telemetry warns per entry, drops it, keeps the rest and never throws',()=>{
  const {trackingTelemetry}=api();
  for(const value of [null,[],'grafana',7]){
    const seen=recorder();assert.deepEqual(plain(trackingTelemetry({tracking:{telemetry:value}},seen.fn)).window,'1h');assert.deepEqual(seen.paths,['']);
  }
  const page={tracking:{telemetry:{grafana:{prometheus:'prom-main',loki:7,tempo:'',mimir:'x'},honeycomb:'prod',
    window:'1 hour',refreshMs:1000,provider:'grafana',
    templates:{good:{kind:'call',signals:{rate:{grafana:'up'}}},'bad name':{kind:'call',signals:{rate:{grafana:'up'}}},
      noSignals:{kind:'call',signals:{}},badParams:{params:'topic',signals:{rate:{grafana:'up'}}},
      reserved:{params:['kind'],signals:{rate:{grafana:'up'}}},dupe:{params:['a','a'],signals:{rate:{grafana:'up'}}},
      notObject:[],badKind:{kind:'pipe',signals:{rate:{grafana:'up'}}},withCard:{kind:'call',signals:{rate:{grafana:'up'}},card:{side:'left'}}}}}};
  const before=JSON.stringify(page),seen=recorder(),parsed=plain(trackingTelemetry(page,seen.fn));
  assert.equal(JSON.stringify(page),before);
  assert.deepEqual(parsed.grafana,{prometheus:'prom-main'});assert.deepEqual(parsed.honeycomb,{});
  assert.equal(parsed.window,'1h');assert.equal(parsed.refreshMs,60000,'refresh below one minute uses the one-minute floor');
  assert.deepEqual(Object.keys(parsed.templates).sort(),['good','withCard']);assert.equal(parsed.templates.withCard.card,undefined);
  assert.deepEqual(seen.paths.sort(),['.grafana.loki','.grafana.mimir','.grafana.tempo','.honeycomb','.provider','.refreshMs',
    '.templates.bad name','.templates.badKind.kind','.templates.badParams.params','.templates.dupe.params[1]','.templates.noSignals.signals',
    '.templates.notObject','.templates.reserved.params[0]','.templates.withCard.card','.window'].sort());
  for(const ms of ['soon',-5,0,Infinity]){const r=recorder();assert.equal(trackingTelemetry({tracking:{telemetry:{refreshMs:ms}}},r.fn).refreshMs,null);assert.deepEqual(r.paths,['.refreshMs']);}
  for(const w of ['30s','15m','1h','7d','2w']){const r=recorder();assert.equal(trackingTelemetry({tracking:{telemetry:{window:w}}},r.fn).window,w);assert.deepEqual(r.paths,[]);}
  for(const w of ['0h','1y','h',3600,'1.5h']){const r=recorder();assert.equal(trackingTelemetry({tracking:{telemetry:{window:w}}},r.fn).window,'1h');assert.deepEqual(r.paths,['.window']);}
});

test('T4 a raw call binding parses into the stable binding shape without touching the source',()=>{
  const {carrierTelemetry}=api(),edge={from:'notify',to:'app',label:'push',tickets:['BE-68'],telemetry:CALL()};
  const before=JSON.stringify(edge),seen=recorder(),binding=plain(carrierTelemetry(edge,{},seen.fn));
  assert.deepEqual(seen.messages,[]);assert.equal(JSON.stringify(edge),before);
  assert.deepEqual(binding,{kind:'call',
    signals:{rate:{source:'grafana',query:PROM_RATE,unit:'req/h'},errors:{source:'grafana',query:PROM_ERRORS,unit:'req/h'}},
    proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01}},
    links:{dashboard:'https://acme.grafana.net/d/notify/push',query:'https://acme.grafana.net/explore?left=push'},
    card:{side:'left',offset:12}});
  const queue=plain(carrierTelemetry({id:'topic',telemetry:QUEUE()},{}));
  assert.deepEqual(queue.signals.in,{source:'loki',query:LOKI_IN,unit:'msgs'});assert.equal(queue.kind,'queue');
  assert.deepEqual(queue.proof,{in:{min:1},lag:{max:500},age:{max:60}});assert.deepEqual(queue.links,{});assert.equal(queue.card,null);
});

test('T5 every signal names exactly one source; honeycomb queries are cloned objects; bad signals drop alone',()=>{
  const {carrierTelemetry}=api(),hc={dataset:'doorbell-prod',calc:'COUNT',where:'service.name = event-ingest'};
  const node={telemetry:{kind:'service',signals:{
    rate:{honeycomb:hc},traces:{tempo:'{resource.service.name="ingest"}'},total:{sql:'SELECT count(*) FROM lake.events'},logs:{loki:LOKI_IN},
    none:{unit:'req/h'},two:{grafana:'up',loki:LOKI_IN},blank:{grafana:'  '},hcText:{honeycomb:'COUNT'},hcEmpty:{honeycomb:{}},hcArray:{honeycomb:[]},
    numeric:{grafana:42},'9lives':{grafana:'up'},notObject:'up',badUnit:{grafana:'up',unit:5},extra:{grafana:'up',datasource:'prom-2'}}}};
  const seen=recorder(),binding=carrierTelemetry(node,{},seen.fn);
  assert.deepEqual(Object.keys(binding.signals),['rate','traces','total','logs','badUnit','extra']);
  assert.deepEqual(plain(binding.signals.rate),{source:'honeycomb',query:hc,unit:null});
  binding.signals.rate.query.where='mutated';assert.equal(node.telemetry.signals.rate.honeycomb.where,'service.name = event-ingest');
  assert.deepEqual(plain(binding.signals.traces),{source:'tempo',query:'{resource.service.name="ingest"}',unit:null});
  assert.deepEqual(plain(binding.signals.total),{source:'sql',query:'SELECT count(*) FROM lake.events',unit:null});
  assert.equal(binding.signals.badUnit.unit,null);assert.equal(binding.signals.extra.query,'up');
  assert.deepEqual(seen.paths,['.signals.none','.signals.two','.signals.blank','.signals.hcText','.signals.hcEmpty','.signals.hcArray',
    '.signals.numeric','.signals.9lives','.signals.notObject','.signals.badUnit.unit','.signals.extra.datasource']);
  assert.match(seen.messages[1],/exactly one/);
});

test('T6 proof limits validate per signal: min/max numbers, ratio limits need max and another signal',()=>{
  const {carrierTelemetry}=api(),signals={rate:{grafana:'a'},errors:{grafana:'b'},p95:{grafana:'c'},lag:{grafana:'d'}};
  const proof={rate:{min:10,max:1e6},errors:{maxRatioOf:'rate',max:0.01},p95:{max:500,min:'fast'},lag:{maxRatioOf:'lag',max:1},
    ghost:{min:1},bad:'x'};
  const cases=[[{maxRatioOf:'rate'},null],[{maxRatioOf:'missing',max:1},null],[{min:5,max:1},null],[{},null],[{min:Infinity},null],[{max:-1},{max:-1}],[{min:0},{min:0}]];
  const seen=recorder(),binding=plain(carrierTelemetry({telemetry:{kind:'call',signals,proof}},{},seen.fn));
  assert.deepEqual(binding.proof,{rate:{min:10,max:1e6},errors:{maxRatioOf:'rate',max:0.01},p95:{max:500}});
  assert.deepEqual(seen.paths,['.proof.p95.min','.proof.lag.maxRatioOf','.proof.ghost','.proof.bad']);
  for(const [entry,want] of cases){
    const r=recorder(),got=plain(carrierTelemetry({telemetry:{kind:'call',signals,proof:{errors:entry}}},{},r.fn)).proof;
    assert.deepEqual(got,want?{errors:want}:{},JSON.stringify(entry));assert.equal(r.paths.length,want?0:1,JSON.stringify(entry));
  }
  const r=recorder();assert.deepEqual(plain(carrierTelemetry({telemetry:{kind:'call',signals,proof:[]}},{},r.fn)).proof,{});assert.deepEqual(r.paths,['.proof']);
});

test('T7 a binding without a valid kind or any valid signal is unbound with one warning',()=>{
  const {carrierTelemetry}=api();
  for(const kind of ['call','queue','service','log-event','device'])assert.equal(carrierTelemetry({telemetry:{kind,signals:{n:{grafana:'up'}}}},{}).kind,kind);
  for(const [telemetry,path] of [[{signals:{n:{grafana:'up'}}},'.kind'],[{kind:'pipe',signals:{n:{grafana:'up'}}},'.kind'],[{kind:'call'},'.signals'],
    [{kind:'call',signals:{}},'.signals'],[{kind:'call',signals:[]},'.signals'],[{kind:'call',signals:{bad:{}}},'.signals'],[null,''],['call',''],[[],'']]){
    const seen=recorder();assert.equal(carrierTelemetry({telemetry},{},seen.fn),null,JSON.stringify(telemetry));assert.equal(seen.paths.at(-1),path,JSON.stringify(telemetry));
  }
  const seen=recorder(),binding=plain(carrierTelemetry({telemetry:{...CALL(),links:{dashboard:'javascript:alert(1)',query:'https://x.test/q',other:'https://x.test'},card:{side:'middle',offset:'far',z:1}}},{},seen.fn));
  assert.deepEqual(binding.links,{query:'https://x.test/q'});assert.equal(binding.card,null);
  assert.deepEqual(seen.paths,['.links.dashboard','.links.other','.card.side','.card.offset','.card.z']);
  for(const card of [{side:'right'},{side:'above',offset:-40},{offset:0}])assert.deepEqual(plain(carrierTelemetry({telemetry:{...CALL(),card}},{}).card),card);
  const r=recorder();assert.equal(plain(carrierTelemetry({telemetry:{...CALL(),card:{offset:5000}}},{},r.fn)).card,null);assert.deepEqual(r.paths,['.card.offset']);
  const u=recorder();carrierTelemetry({telemetry:{...CALL(),source:'grafana',series:[[1,2]]}},{},u.fn);assert.deepEqual(u.paths,['.source','.series']);
});

test('T8 a carrier without telemetry is unbound; nothing is inferred from ids, titles or service names; text boxes never bind',()=>{
  const {carrierTelemetry}=api();
  for(const obj of [{},{id:'notify',title:'Notify service',service:'notify',tickets:['BE-1']},{from:'a',to:'b',kind:'https',label:'rate'},null,undefined,'x']){
    const seen=recorder();assert.equal(carrierTelemetry(obj,TEMPLATES(),seen.fn),null);assert.deepEqual(seen.paths,[]);
  }
  const seen=recorder();assert.equal(carrierTelemetry({type:'text',text:'Note',telemetry:CALL()},{},seen.fn),null);assert.deepEqual(seen.paths,['']);
  assert.match(seen.messages[0],/text box/);
});

test('T9 templates expand by pure $param substitution with per-name carrier overrides',()=>{
  const {carrierTelemetry,trackingTelemetry}=api(),templates=trackingTelemetry({tracking:{telemetry:{templates:TEMPLATES()}}}).templates;
  const carrier={from:'ingest',to:'notify',telemetry:{use:'kafka-topic',topic:'device-events',group:'notify-consumers',
    proof:{lag:{max:100}},signals:{age:{grafana:'max(kafka_consumergroup_lag_seconds{topic="device-events"})',unit:'s'}},card:{side:'below'}}};
  const before=JSON.stringify(carrier),seen=recorder(),binding=plain(carrierTelemetry(carrier,templates,seen.fn));
  assert.deepEqual(seen.messages,[]);assert.equal(JSON.stringify(carrier),before);
  assert.deepEqual(binding,{kind:'queue',
    signals:{in:{source:'grafana',query:'sum(rate(kafka_messagesin_total{topic="device-events"}[$__rate_interval]))*3600',unit:'msg/h'},
      lag:{source:'grafana',query:'max(kafka_consumergroup_lag{topic="device-events",group="notify-consumers"})',unit:null},
      depth:{source:'grafana',query:'max(kafka_log_size{topic="$topicName"})',unit:null},
      age:{source:'grafana',query:'max(kafka_consumergroup_lag_seconds{topic="device-events"})',unit:'s'}},
    proof:{in:{min:10},lag:{max:100}},links:{dashboard:'https://acme.grafana.net/d/kafka?var-topic=device-events'},card:{side:'below'}});
  assert.equal(carrierTelemetry({telemetry:{use:'kafka-topic',topic:'$group',group:'g'}},templates).signals.lag.query,'max(kafka_consumergroup_lag{topic="$group",group="g"})','one pass; values are not re-expanded');
  assert.equal(carrierTelemetry({telemetry:{use:'kafka-topic',topic:'a$&b',group:'g'}},templates).signals.in.query.includes('topic="a$&b"'),true,'values are literal');
  assert.equal(carrierTelemetry({telemetry:{use:'kafka-topic',topic:'t',group:'g',kind:'call'}},templates).kind,'call');
  for(const [telemetry,paths] of [[{use:'missing',topic:'t',group:'g'},['.use']],[{use:'kafka-topic',topic:'t'},['.group']],
    [{use:'kafka-topic',topic:'t',group:7},['.group']],[{use:'kafka-topic',topic:'',group:'g'},['.topic']],[{use:'constructor'},['.use']],[{use:7},['.use']]]){
    const r=recorder();assert.equal(carrierTelemetry({telemetry},templates,r.fn),null,JSON.stringify(telemetry));assert.deepEqual(r.paths,paths,JSON.stringify(telemetry));
  }
  const extra=recorder();assert.ok(carrierTelemetry({telemetry:{use:'kafka-topic',topic:'t',group:'g',region:'eu'}},templates,extra.fn));assert.deepEqual(extra.paths,['.region']);
  const none=recorder();assert.equal(carrierTelemetry({telemetry:{use:'kafka-topic',topic:'t',group:'g'}},undefined,none.fn),null);assert.deepEqual(none.paths,['.use']);
});

test('T10 validator reports telemetry problems as warnings at spec paths, never errors',()=>{
  api();
  const page=(over={})=>({page:{tracking:{jira:{site:'https://jira.test'},telemetry:{grafana:{prometheus:'prom-main'},templates:TEMPLATES()}},
    sections:[{diagram:{nodes:{a:{title:'A',telemetry:QUEUE()},b:{title:'B'},note:{type:'text',text:'Note'}},rows:[['a','b','note']],
      edges:[{from:'a',to:'b',telemetry:CALL()},{from:'b',to:'a',telemetry:{use:'kafka-topic',topic:'t',group:'g'}}],
      panels:[{id:'status',type:'live-status'}],...over}}]}});
  const clean=C.validate(C.normalize(page()));assert.deepEqual(plain(clean.errors),[]);
  assert.deepEqual(clean.warnings.filter(w=>/telemetry/.test(w)),[]);
  const bad=page();const d=bad.page.sections[0].diagram;
  bad.page.tracking.telemetry.grafana.loki=7;bad.page.tracking.telemetry.window='soon';
  d.nodes.b.telemetry={kind:'pipe',signals:{rate:{grafana:'up'}}};d.nodes.note.telemetry=CALL();
  d.edges[0].telemetry.signals.bad={};d.edges[1].telemetry.use='nope';
  const result=C.validate(C.normalize(bad));assert.deepEqual(plain(result.errors),[]);
  assert.deepEqual(result.warnings.filter(w=>/telemetry/.test(w)).map(w=>w.split(': ')[0]),[
    'tracking.telemetry.grafana.loki','tracking.telemetry.window',
    'sections[0].diagram.nodes.b.telemetry.kind','sections[0].diagram.nodes.note.telemetry',
    'sections[0].diagram.edges[0].telemetry.signals.bad','sections[0].diagram.edges[1].telemetry.use']);
  assert.ok(result.warnings.every(w=>!/telemetry/.test(w) || /ignored|using/.test(w)),'every telemetry warning says what happens');
  const tabs=C.validate(C.normalize({page:{tracking:{telemetry:7},blocks:[{tabs:[{label:'T',sections:[{diagram:{nodes:{x:{telemetry:{kind:'call'}}},rows:[['x']],panels:[{type:'live-status'}]}}]}]}]}}));
  assert.deepEqual(plain(tabs.errors),[]);
  assert.deepEqual(tabs.warnings.filter(w=>/telemetry/.test(w)).map(w=>w.split(': ')[0]),['tracking.telemetry','blocks[0].tabs[0].sections[0].diagram.nodes.x.telemetry.signals']);
  const overlay=C.validate(C.normalize({page:{tracking:{},sections:[{diagram:{nodes:{},rows:[[]],panels:[{type:'live-status'}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{telemetry:{kind:'call',signals:{}}}},edgeTracking:{'api->store':{telemetry:{use:'kafka-topic',topic:'t'}}}}]}}]}}));
  assert.deepEqual(overlay.warnings.filter(w=>/telemetry/.test(w)).map(w=>w.split(': ')[0]),[
    'sections[0].diagram.topologyImports[0].nodeTracking.api.telemetry.signals','sections[0].diagram.topologyImports[0].edgeTracking.api->store.telemetry.use']);
  const telemetryOnly=C.validate(C.normalize({nodes:{a:{telemetry:QUEUE()}},rows:[['a']]}));
  assert.ok(telemetryOnly.warnings.some(w=>/no live-status panel/.test(w)),'telemetry bindings need the live-status panel that holds the Metrics button');
  const withPanel=C.validate(C.normalize({nodes:{a:{telemetry:QUEUE()}},rows:[['a']],panels:[{id:'s',type:'live-status'}]}));
  assert.ok(!withPanel.warnings.some(w=>/no ticket references/.test(w)),'a telemetry-only board panel is not empty');
});

test('T11 compatibility declares flow.telemetry for page, carrier and overlay bindings only',()=>{
  api();const F=C.FlowviewCompatibility;
  assert.deepEqual(plain(F.features['flow.telemetry'] || null),{label:'Telemetry signal bindings',since:'0.2.0'});assert.equal(F.version,'0.2.0');
  const base=()=>({page:{sections:[{diagram:{nodes:{a:{tickets:['AA-1']},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',tickets:['AA-2']}]}}]}});
  const where={page:r=>{r.page.tracking={telemetry:{window:'1h'}};},node:r=>{r.page.sections[0].diagram.nodes.b.telemetry=QUEUE();},
    edge:r=>{r.page.sections[0].diagram.edges[0].telemetry=CALL();},
    nodeTracking:r=>{r.page.sections[0].diagram.topologyImports=[{spec:'p',export:'core',as:'s',nodeTracking:{api:{telemetry:QUEUE()}}}];},
    edgeTracking:r=>{r.page.sections[0].diagram.topologyImports=[{spec:'p',export:'core',as:'s',edgeTracking:{'api->db':{telemetry:CALL()}}}];}};
  for(const [name,add] of Object.entries(where)){
    const raw=base();add(raw);const before=JSON.stringify(raw);
    assert.ok(F.detect(raw).includes('flow.telemetry'),name);
    const stamped=F.stamp(raw);assert.equal(JSON.stringify(raw),before,name);
    assert.ok(stamped.page.flowview.features.includes('flow.telemetry'),name);
    const older={...F.features};delete older['flow.telemetry'];
    assert.ok(F.check(stamped,{version:F.version,contract:'1',features:older}).missingFeatures.includes('flow.telemetry'),name);
  }
  for(const raw of [base(),{page:{tracking:{jira:{site:'https://jira.test'}},sections:base().page.sections}}])assert.ok(!F.detect(raw).includes('flow.telemetry'));
});

function topologyFixtures(){
  const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API',telemetry:{kind:'service',signals:{up:{grafana:'up{job="api"}'}}}},
    store:{title:'Store',telemetry:{use:'svc',name:'store'}}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],
    topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}},
    {tracking:{telemetry:{templates:{svc:{kind:'service',params:['name'],signals:{rate:{grafana:'sum(rate(http_requests_total{service="$name"}[5m]))'}},proof:{rate:{min:1}}}}}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[],panels:[{id:'status',type:'live-status'}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{tickets:['API-1'],telemetry:QUEUE()}},edgeTracking:{'api->store':{telemetry:CALL()}}}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
const diagramOf=s=>s.page.sections[0].diagram;

test('T12 imported topology carries overlay telemetry, expands provider templates and keeps it through Workbench edits',()=>{
  const {carrierTelemetry,trackingTelemetry}=api(),f=topologyFixtures(),before=plain(f.context);
  assert.doesNotThrow(()=>C.FlowTopology.validateTracking({tickets:['AA-1'],telemetry:CALL()},'tracking'));
  assert.doesNotThrow(()=>C.FlowTopology.validateTracking({telemetry:'not validated here; the validator warns'},'tracking'));
  assert.throws(()=>C.FlowTopology.validateTracking({telemetry:CALL(),status:'done'},'tracking'),/Topology/);
  const resolved=C.FlowTopology.resolveSource(f.consumer,f.context),d=diagramOf(resolved);
  assert.deepEqual(f.context,before,'providers and the consumer source are not modified');
  assert.deepEqual(plain(d.nodes['shared::api'].telemetry),QUEUE(),'the consumer overlay replaces the provider binding');
  assert.deepEqual(plain(d.nodes['shared::api'].tickets),['API-1']);
  const edge=d.edges.find(e=>e.from==='shared::api' && e.to==='shared::store');
  assert.deepEqual(plain(edge.telemetry),CALL());
  assert.deepEqual(plain(d.nodes['shared::store'].telemetry),{kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total{service="store"}[5m]))'}},proof:{rate:{min:1}}},
    'provider-authored use expands with the provider page templates');
  const consumerTemplates=trackingTelemetry(resolved.page).templates;assert.deepEqual(plain(consumerTemplates),{});
  assert.equal(carrierTelemetry(d.nodes['shared::store'],consumerTemplates).signals.rate.query,'sum(rate(http_requests_total{service="store"}[5m]))');
  assert.deepEqual(plain(carrierTelemetry(edge,consumerTemplates)),plain(carrierTelemetry({telemetry:CALL()},{})));
  const noOverlay=plain(f.consumer);delete diagramOf(noOverlay).topologyImports[0].nodeTracking;
  assert.deepEqual(plain(diagramOf(C.FlowTopology.resolveSource(noOverlay,f.context)).nodes['shared::api'].telemetry),{kind:'service',signals:{up:{grafana:'up{job="api"}'}}},'inherited when no overlay');
  // Workbench (and board Edit mode) ticket edits rewrite the overlay entry; the binding must survive.
  const apply=(source,fn)=>{const plan=fn(JSON.stringify(source,null,2),source);assert.equal(plan.error,undefined,plan.error);return JSON.parse(plan.text);};
  let source=apply(f.consumer,(t,r)=>C.planTopologyTracking(t,r,0,'node','shared::api','tickets','API-2',false,f.context));
  assert.deepEqual(plain(diagramOf(source).topologyImports[0].nodeTracking.api),{tickets:['API-1','API-2'],telemetry:QUEUE()});
  source=apply(source,(t,r)=>C.planTopologyTracking(t,r,0,'node','shared::api','tickets','API-1',true,f.context));
  source=apply(source,(t,r)=>C.planTopologyTracking(t,r,0,'node','shared::api','tickets','API-2',true,f.context));
  assert.deepEqual(plain(diagramOf(source).topologyImports[0].nodeTracking.api),{telemetry:QUEUE()},'removing the last ticket keeps the binding');
  source=apply(source,(t,r)=>C.planTopologyTracking(t,r,0,'edge','shared::api->shared::store','missingWork',true,false,f.context,0));
  assert.deepEqual(plain(diagramOf(source).topologyImports[0].edgeTracking['api->store']),{missingWork:true,telemetry:CALL()});
  // A resolved snapshot owns its delivery annotations, telemetry included.
  const after=plain(resolved);diagramOf(after).nodes['shared::api'].telemetry=CALL();
  assert.equal(C.FlowTopology.editError(resolved,after),null);
  diagramOf(after).nodes['shared::api'].title='Structure change';assert.match(C.FlowTopology.editError(resolved,after),/read only/);
});

test('T13 export stamping keeps every authored telemetry field and declares flow.telemetry',()=>{
  const {trackingTelemetry,carrierTelemetry}=api(),f=topologyFixtures();
  const authored={page:{title:'Board',tracking:{jira:{site:'https://jira.test'},telemetry:{grafana:{prometheus:'prom-main',loki:'loki-main'},window:'1h',refreshMs:300000,templates:TEMPLATES()}},
    sections:[{diagram:{nodes:{topic:{title:'device-events',telemetry:QUEUE()},app:{title:'App'}},rows:[['topic','app']],
      edges:[{from:'topic',to:'app',telemetry:CALL()},{from:'app',to:'topic',telemetry:{use:'kafka-topic',topic:'device-events',group:'notify',card:{side:'right'}}}],
      panels:[{id:'status',type:'live-status'}]}}]}};
  const text=JSON.stringify(authored,null,2),exported=JSON.parse(C.FlowviewCompatibility.stampText(text,authored));
  assert.ok(exported.page.flowview.features.includes('flow.telemetry'));
  assert.deepEqual(exported.page.tracking,authored.page.tracking);
  assert.deepEqual(exported.page.sections,authored.page.sections);
  const page=C.normalize(exported);
  assert.deepEqual(plain(trackingTelemetry(page)),plain(trackingTelemetry(authored.page)));
  const tpl=trackingTelemetry(page).templates;
  page.sections[0].diagram.edges.forEach((e,i)=>assert.deepEqual(plain(carrierTelemetry(e,tpl)),plain(carrierTelemetry(authored.page.sections[0].diagram.edges[i],tpl))));
  // Import-only consumers: authored export keeps the overlay; the resolved snapshot carries the binding on the node.
  const consumerText=JSON.stringify(f.consumer,null,2),resolved=C.FlowTopology.resolveSource(f.consumer,f.context);
  const stamped=JSON.parse(C.FlowviewCompatibility.stampText(consumerText,resolved));
  assert.deepEqual(stamped.page.sections,f.consumer.page.sections);assert.ok(stamped.page.flowview.features.includes('flow.telemetry'));
  const snapshot=JSON.parse(C.prepareExportSnapshot(consumerText,raw=>C.FlowTopology.resolveSource(raw,f.context)).text);
  assert.deepEqual(diagramOf(snapshot).nodes['shared::api'].telemetry,QUEUE());assert.equal(diagramOf(snapshot).topologyImports,undefined);
});

test('T14 live-status docs document the telemetry fields and their examples parse without warnings',()=>{
  const {carrierTelemetry}=api(),doc=fs.readFileSync('docs/live-status.md','utf8');
  const start=doc.indexOf('### Telemetry bindings');assert.ok(start>0,'Fields gains a Telemetry bindings subsection');
  const section=doc.slice(start,doc.indexOf('\n## ',start));
  for(const term of ['tracking.telemetry','carrierTelemetry','trackingTelemetry','maxRatioOf','"use"','$param','unbound','nodeTracking','grafana','loki','tempo','sql','honeycomb','refreshMs','window'])
    assert.ok(section.includes(term),term);
  const blocks=[...section.matchAll(/```json\n([\s\S]*?)```/g)].map(m=>JSON.parse(m[1]));
  const call=blocks.find(b=>b.telemetry && b.telemetry.kind==='call' && b.from);
  const queue=blocks.map(b=>b.nodes && Object.values(b.nodes).find(n=>n && n.telemetry && n.telemetry.kind==='queue')).find(Boolean);
  assert.ok(call,'an authored call edge example');assert.ok(queue,'an authored queue node example');
  for(const carrier of [call,queue]){const seen=recorder();assert.ok(carrierTelemetry(carrier,{},seen.fn));assert.deepEqual(seen.messages,[]);}
  assert.equal(call.telemetry.signals.errors.grafana!==undefined,true,'the call example is PromQL');assert.equal(call.telemetry.proof.errors.maxRatioOf,'rate');
  assert.ok(queue.telemetry.signals.in.loki && queue.telemetry.signals.lag && queue.telemetry.signals.age,'the queue example has loki in, lag and age');
  assert.match(doc.slice(doc.indexOf('## Compatibility')),/flow\.telemetry/);
});
