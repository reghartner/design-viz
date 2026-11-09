'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);
const plain=x=>JSON.parse(JSON.stringify(x));let fixture;
async function story(){return fixture || (fixture=await (await import('./helpers/step-evidence.mjs')).stepFixture());}
function model(f,index=0,path='event',jiraOn=true){const d=f.spec.page.sections[0].diagram;return C.telemetryStepModel(d,index,path,f.spec.page,{map:f.samples}, {'TRACE-1':{state:'done'}},jiraOn);}
test('step captions retain primary headline and worst direct-carrier verdict without selecting traces',async()=>{
 const f=structuredClone(await story()),m=model(f),d=f.spec.page.sections[0].diagram;
 assert.equal(m.primary,'mcu->ingest');assert.match(m.caption,/PROVEN/);assert.equal(m.trace,undefined);assert.match(model(f,0,'event',false).caption,/HEALTHY/);
 d.steps[0].edges=['mcu->ingest','ingest->notify'];delete d.steps[0].edge;d.edges[1].tickets=['TRACE-1'];d.edges[1].telemetry.proof.rate={min:1};f.samples['ingest->notify'].signals.rate.value=0;f.samples['ingest->notify'].signals.rate.series=[];
 assert.match(model(f).caption,/DONE · UNPROVEN/);d.edges[1].telemetry.proof.rate={max:1};f.samples['ingest->notify'].signals.rate.value=20;assert.match(model(f).caption,/DONE · DEGRADED/);
});
test('selected trace maps only the exact source/path and never guesses display-name joins',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 assert.equal(C.telemetryTraceModel(d,'event',e).rows.length,4);assert.equal(C.telemetryTraceModel(d,'short',e).rows.length,2);
 assert.equal(C.telemetryTraceModel(d,'absent',e).rows.length,0);delete d.steps[0].traceMatch;
 assert.equal(C.telemetryTraceModel(d,'event',e).edges['mcu->ingest'],undefined);assert.equal(C.telemetryTraceModel(d,'event',e).rows[0].status,'unmapped');
});
test('shared source/packaged/Node matching parity: attributes, links, serial occurrence, attempts and ownership',async()=>{
 const T=await import('../tools/canon/traces.mjs'),P=require('../tools/canon/core.cjs');
 const s=(id,start,attrs={},parentId='')=>({id,serviceName:'svc',operation:'call',startMs:start,durationMs:3,attributes:{'service.namespace':'ns',...attrs},links:[],parentId});
 const trace={spans:[s('a',0,{'retry.attempt':0}),s('b',10,{'retry.attempt':1})],warnings:['Partial sample']};
 for(const selector of [{serviceName:'svc',operation:'call',namespace:'ns',occurrence:2},{serviceName:'svc',operation:'call',repeat:'attempts'},{serviceName:'svc',operation:'call',attributes:{'retry.attempt':1}},{serviceName:'svc',operation:'call',namespace:'missing'}]){
  const d={steps:[{id:'s',traceMatch:selector}]};assert.deepEqual(plain(C.FlowTraceMatch.mapTrace(d,trace)),plain(T.mapTrace(d,trace)));assert.deepEqual(plain(P.traceMatch.mapTrace(d,trace)),plain(T.mapTrace(d,trace)));
 }
 const d={steps:[{id:'p',traceMatch:{serviceName:'svc',operation:'call',attributes:{'retry.attempt':0}}},{id:'c',traceMatch:{serviceName:'svc',operation:'child',parentStepId:'p'}}]};trace.spans.push({...s('c',0),operation:'child',links:['a']});assert.equal(C.FlowTraceMatch.mapTrace(d,trace).steps[1].status,'matched');
 trace.spans[1].startMs=1;assert.equal(C.FlowTraceMatch.mapTrace({steps:[{id:'s',traceMatch:{serviceName:'svc',operation:'call',occurrence:1}}]},trace).steps[0].status,'ambiguous');
 d.steps.push({...d.steps[0],id:'duplicate'});assert.equal(C.FlowTraceMatch.mapTrace(d,trace).steps[0].status,'ambiguous');
});
test('trace-only pin dedupe/cap and lifecycle without numeric Proof',async()=>{
 const f=await story(),e=f.samples['mcu->ingest'].exemplars[0],binding={id:'a',title:'A',signals:{trace:{source:'honeycomb',query:{}}},proof:{},kind:'call'};
 const activity=C.liveStatusTelemetryActivity();assert.equal(activity.pin(binding,e,'2026-11-05T00:00:00Z'),true);assert.equal(activity.pin(binding,e,'2026-11-05T01:00:00Z'),false);assert.equal(activity.snapshot()[0].traceAt,e.candidates.find(c=>c.traceId===e.traceId).time);
 for(let i=0;i<25;i++)activity.pin(binding,{...e,traceId:i.toString(16).padStart(32,'0')},new Date(Date.UTC(2026,10,5,1,i)).toISOString());assert.equal(activity.snapshot().length,20);
 activity.reconcile([{...binding,signals:{}}]);assert.equal(activity.snapshot().length,0);activity.pin(binding,e,'2026-11-05T00:00:00Z');activity.reconcileTraces({historical:false,map:{}});assert.equal(activity.snapshot().length,0);
});
test('read-only alternative capability requires handler and current live capability; off/history invalidate',async t=>{
 const f=await story(),e=f.samples['mcu->ingest'].exemplars[0],p=f.spec.page;let calls=0,allowed=true;
 const options={provider:async()=>f.samples,chooseExemplar:async()=>{calls++;return f.alternative;},canChooseExemplar:()=>allowed};
 const api=C.createTelemetry(p,options,{carriers:fn=>p.sections[0].diagram.edges.forEach(edge=>fn(edge,edge.from+'->'+edge.to,p))});
 t.after(()=>api.destroy());api.apply(f.samples);const id='mcu->ingest',alt=f.alternative.traceId;assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),false);api.setEnabled(true);await new Promise(setImmediate);
 assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),true);assert.equal(api.canChooseExemplar(id,'old',alt),false);assert.equal(calls,0);allowed=false;assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),false);allowed=true;api.openHistory([{at:f.at}],0);assert.equal(api.canChooseExemplar(id,e.selectionToken,alt),false);api.setEnabled(false);assert.deepEqual(plain(api.snapshot().map),{});api.destroy();
});

test('selected canonical traces map normal, slow, error, partial and queue evidence to exact node/edge IDs',async()=>{
 const f=await (await import('./helpers/canon-trace-evidence.mjs')).canonTraceFixture(),d=f.spec.page.sections[0].diagram;
 const map=name=>C.telemetryTraceModel(d,null,C.telemetryTraceEnvelope(f.alternatives[f.ids[name]]));
 assert.equal(map('happy').nodes.database[0].tone,'observed');
 assert.equal(map('database-slow').nodes.database[0].tone,'warning');assert.equal(map('database-slow').nodes.database[0].duration,900);assert.equal(map('database-slow').nodes.database[0].budget,150);
 assert.equal(map('service-error').nodes.cloud[0].tone,'error');assert.equal(map('partial').nodes.database[0].tone,'unknown');assert.equal(map('backpressure').nodes.queue[0].tone,'warning');
 assert.equal(map('database-slow').edges['cloud->database'][0].duration,900);
});
test('ambiguous and unavailable traces never produce timed edge annotations or inferred node joins',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 let m=C.telemetryTraceModel(d,'event',e);assert.ok(m.nodes.ingest);assert.equal(m.nodes.app,undefined);
 d.steps.push({...structuredClone(d.steps[0]),id:'duplicate'});d.paths[0].steps.push('duplicate');m=C.telemetryTraceModel(d,'event',e);assert.equal(m.nodes.ingest[0].tone,'unknown');assert.equal(m.edges['mcu->ingest'],undefined);
 e.spans=[];m=C.telemetryTraceModel(d,'event',e);assert.deepEqual(plain(m.nodes),{});assert.deepEqual(plain(m.edges),{});assert.match(m.warning,/timeline unavailable/);
});

// Span focus resolves source registries, including steps hidden by a view. It
// never infers navigation from a service title, an edge, or declaration order.
test('span choices preserve shared current context and expose alternate-path ambiguity',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 const span=C.telemetryTraceModel(d,'event',e).rows[0].spanIds[0];
 let choices=plain(C.telemetryTraceChoices(d,'event',e,span));assert.equal(choices.length,1);assert.equal(choices[0].pathId,'event');assert.equal(choices[0].sourceIndex,0);
 choices=plain(C.telemetryTraceChoices(d,'absent',e,span));assert.deepEqual(choices.map(c=>c.pathId),['event','short']);
 d.steps.push({...structuredClone(d.steps[0]),id:'alternate',text:'Alternative owner'});d.paths.push({id:'hidden',label:'Hidden path',steps:['alternate']});
 choices=plain(C.telemetryTraceChoices(d,'event',e,span));assert.deepEqual(choices.map(c=>c.stepId),['submit','alternate']);assert.equal(choices[1].sourceIndex,4);
 assert.deepEqual(plain(C.telemetryTraceChoices(d,'event',e,'not-a-span')),[]);
});
test('one ambiguous operation with concurrent spans still requires a choice',async()=>{
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 const span=e.spans.find(s=>s.name==='POST /v1/events');e.spans.push({...structuredClone(span),id:'concurrent'});
 const choices=plain(C.telemetryTraceChoices(d,'event',e,span.id));assert.equal(choices.length,1);assert.equal(choices[0].row.status,'ambiguous');
});


test('compact trace milliseconds retain raw evidence and exact delivered-edge identity',async()=>{
 for(const [ms,label] of [[0,'0 ms'],[.00013,'<0.01 ms'],[8.735083,'8.74 ms'],[196.114973,'196.1 ms'],[4650.643585,'4,651 ms'],[604800000,'604,800,000 ms']])assert.equal(C.telemetryTraceDuration(ms),label);
 const f=structuredClone(await story()),d=f.spec.page.sections[0].diagram,e=f.samples['mcu->ingest'].exemplars[0];
 const raw=e.spans.find(s=>s.name==='POST /v1/events');raw.ms=4650.643585;
 let row=C.telemetryTraceModel(d,'event',e).rows[0];assert.equal(row.label,'4,651 ms');assert.equal(row.duration,4650.643585);assert.equal(row.edgeIndex,0);assert.equal(raw.ms,4650.643585);
 delete d.steps[0].traceMatch.nodeId;row=C.telemetryTraceModel(d,'event',e).rows[0];assert.equal(row.edgeIndex,0);assert.equal(row.nodeId,null);
 d.steps[0].edges=['mcu->ingest','ingest->notify'];delete d.steps[0].edge;assert.equal(C.telemetryTraceModel(d,'event',e).rows[0].edgeIndex,null);
 d.steps[0].edges=['mcu->ingest'];d.steps[0].failures={'mcu->ingest':'dropped'};assert.equal(C.telemetryTraceModel(d,'event',e).rows[0].edgeIndex,null);
 delete d.steps[0].failures;d.edges.push({...d.edges[0]});assert.equal(C.telemetryTraceModel(d,'event',e).rows[0].edgeIndex,null,'parallel duplicate endpoints cannot select an arbitrary path');
 d.edges.pop();d.steps.push({...structuredClone(d.steps[0]),id:'duplicate'});d.paths[0].steps.push('duplicate');
 const choices=plain(C.telemetryTraceChoices(d,'event',e,raw.id));assert.equal(choices.length,2);assert.ok(choices.every(choice=>choice.row.status==='ambiguous' && choice.row.edgeIndex===0),'an explicit step choice may select its unique delivered edge');
});

// #1154: canvas trace labels. A step with two traceMatch alternatives (one root
// span per transport) names the alternative that matched and shows its time.
// Time per matched span = its own start-to-end duration (children included);
// several matched spans on one node show the union of their intervals and the count.
const PULSAR='persistent://stats/camera process',RABBIT='camera_stats_message process';
function transportBoard(){
 return {nodes:{broker:{title:'Broker'},consumer:{title:'Stats consumer'}},rows:[['broker','consumer']],edges:[{from:'broker',to:'consumer'}],
  steps:[{id:'consume',text:'Consume stats',edge:'broker->consumer',traceMatch:[{serviceName:'stats-consumer',operation:PULSAR,nodeId:'consumer'},{serviceName:'stats-consumer',operation:RABBIT,nodeId:'consumer'}]}]};
}
const traceSpan=(id,name,startMs,ms,parentId=null,service='stats-consumer')=>({id,parentId,name,service,startMs,ms,error:false,attributes:{},links:[]});
const transportTrace=(...spans)=>({traceId:'1154'.padEnd(32,'0'),warnings:[],spans});
// Only the SVG surface telemetryPaintTrace touches: node cards, edge paths, overlay text/title.
function paintTraceLabels(d,e){
 const doc={},el=(tag,attrs={})=>({tagName:tag,attrs:{...attrs},children:[],textContent:'',parentNode:null,ownerDocument:doc,
  setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return k in this.attrs?this.attrs[k]:null;},removeAttribute(k){delete this.attrs[k];},
  appendChild(c){c.parentNode=this;this.children.push(c);return c;},matches(sel){return sel==='g.node'?this.tagName==='g' && this.attrs.class==='node':sel==='path.edge'?this.tagName==='path':false;},
  closest(){return null;},getBBox(){return {x:0,y:0,width:120,height:40};},querySelector(sel){return sel==='.card'?this.children.find(c=>c.attrs.class==='card') || null:null;}});
 doc.createElementNS=(ns,tag)=>el(tag);
 const nodes=Object.keys(d.nodes).map(id=>{const g=el('g',{class:'node','data-dv-node':id});g.appendChild(el('rect',{class:'card'}));return g;});
 const layer=el('g'),paths=d.edges.map((edge,i)=>layer.appendChild(Object.assign(el('path',{class:'edge','data-dv-edge':i}),{getTotalLength:()=>100,getPointAtLength:l=>({x:l,y:0})})));
 const scope={querySelectorAll:sel=>sel==='g.node[data-dv-node]:not(.node-text)'?nodes:sel==='path.edge[data-dv-edge]'?paths:[]};
 C.telemetryPaintTrace({el:scope,section:{diagram:d}},C.telemetryTraceModel(d,undefined,e));
 const read=(parent,pick)=>{const g=parent.children.find(c=>c.attrs.class==='dv-trace-overlay' && pick(c));return g?{text:g.children.find(c=>c.tagName==='text').textContent,title:g.children.find(c=>c.tagName==='title').textContent}:null;};
 return {node:id=>read(nodes.find(n=>n.attrs['data-dv-node']===id),()=>true),edge:i=>read(layer,g=>g.attrs['data-trace-edge']===String(i)),tone:id=>nodes.find(n=>n.attrs['data-dv-node']===id).attrs['data-trace-tone'],status:id=>nodes.find(n=>n.attrs['data-dv-node']===id).attrs['data-trace-status']};
}
test('a node whose traceMatch alternatives matched names the matched alternative and shows its time',()=>{
 let labels=paintTraceLabels(transportBoard(),transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('p-db','INSERT stats',2,9,'p1','stats-store')));
 // Service and operation are cut to 40 characters on the canvas; the title keeps the full name.
 assert.equal(labels.node('consumer').text,'Matched: stats-consumer persistent://stats/camer… · 16.1 ms');assert.doesNotMatch(labels.node('consumer').text,/unknown/);
 assert.ok(labels.node('consumer').title.startsWith('Matched: stats-consumer '+PULSAR+': 16.1 ms'));
 assert.match(labels.node('consumer').title,new RegExp('not in this trace: stats-consumer '+RABBIT));assert.doesNotMatch(labels.node('consumer').title,/unknown/);
 assert.match(labels.node('consumer').title,/ · Time 16\.1 ms: time covers each matched span from start to end \(overlaps counted once\)\.$/,'the title states what the time counts');
 assert.doesNotMatch(labels.node('consumer').title,/child spans/,'#1193: sibling spans are not nested');
 assert.equal(labels.edge(0).text,'Matched: stats-consumer persistent://stats/camer… · 16.1 ms','the uniquely delivered edge follows the same rules');
 labels=paintTraceLabels(transportBoard(),transportTrace(traceSpan('r1',RABBIT,0,4.97)));
 assert.equal(labels.node('consumer').text,'Matched: stats-consumer camera_stats_message pro… · 4.97 ms');assert.match(labels.node('consumer').title,new RegExp('not in this trace: stats-consumer '+PULSAR.replace(/[/.]/g,'\\$&')));
 assert.ok(labels.node('consumer').title.startsWith('Matched: stats-consumer '+RABBIT+': 4.97 ms'));
 assert.equal(labels.edge(0).text,'Matched: stats-consumer camera_stats_message pro… · 4.97 ms');
});
test('the canvas name of a matched alternative is capped at 40 characters; a short one is not cut',()=>{
 const d=transportBoard(),long='two.leia.camera_stats_message process';d.steps[0].traceMatch[1].operation=long;
 let label=paintTraceLabels(d,transportTrace(traceSpan('r1',long,0,4.97))).node('consumer');
 assert.equal(label.text,'Matched: stats-consumer two.leia.camera_stats_me… · 4.97 ms');
 assert.ok(label.text.replace(/^Matched: /,'').replace(/ · 4\.97 ms$/,'').length<=40);assert.ok(label.title.startsWith('Matched: stats-consumer '+long+': 4.97 ms'),'the title keeps the full name');
 d.steps[0].traceMatch[1]={serviceName:'consumer',operation:'pulsar process',nodeId:'consumer'};
 label=paintTraceLabels(d,transportTrace(traceSpan('r1','pulsar process',0,16.1,null,'consumer'))).node('consumer');
 assert.equal(label.text,'Matched: consumer pulsar process · 16.1 ms');
});
test('an unmatched alternatives row never lists its own alternative among the others',()=>{
 let label=paintTraceLabels(transportBoard(),transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('p2',PULSAR,1,4))).node('consumer');
 assert.equal(label.text,'Ambiguous');assert.match(label.title,new RegExp('not in this trace: stats-consumer '+RABBIT));
 assert.doesNotMatch(label.title,/in this trace, not matched/,'the ambiguous alternative is the row itself, not another alternative');
 label=paintTraceLabels(transportBoard(),transportTrace(traceSpan('x1','unrelated',0,1))).node('consumer');
 assert.equal(label.text,'Not observed');assert.match(label.title,/not in this trace: stats-consumer persistent:\/\/stats\/camera process$/,'only the other alternative is listed');
});
test('several matched spans on one node show the union of their intervals and the span count, never the sum',()=>{
 const d=transportBoard();d.steps.push({id:'persist',text:'Persist stats',traceMatch:{serviceName:'stats-consumer',operation:'INSERT stats',nodeId:'consumer',parentStepId:'consume'}});
 let labels=paintTraceLabels(d,transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('p-db','INSERT stats',2,9,'p1')));
 assert.equal(labels.node('consumer').text,'2 operations · 16.1 ms across 2 spans','a nested child span adds no time');assert.doesNotMatch(labels.node('consumer').text,/25\.1/);
 labels=paintTraceLabels(d,transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('p-db','INSERT stats',10,20,'p1')));
 assert.equal(labels.node('consumer').text,'2 operations · 30 ms across 2 spans','an overlapping span counts its overlap once');
});
test('a mapped operation missing from the trace still reads unknown; an ambiguous one reads ambiguous',()=>{
 const d=transportBoard();d.steps.push({id:'persist',text:'Persist stats',traceMatch:{serviceName:'stats-consumer',operation:'INSERT stats',nodeId:'consumer',parentStepId:'consume'}});
 let labels=paintTraceLabels(d,transportTrace(traceSpan('p1',PULSAR,0,16.1)));
 assert.equal(labels.node('consumer').text,'2 operations · 1 unknown · 16.1 ms');
 d.steps.push({id:'ack',text:'Acknowledge',traceMatch:{serviceName:'stats-consumer',operation:'ack',nodeId:'consumer'}});
 labels=paintTraceLabels(d,transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('a1','ack',1,1,'p1'),traceSpan('a2','ack',3,1,'p1')));
 assert.equal(labels.node('consumer').text,'3 operations · 1 unknown · 1 ambiguous · 16.1 ms');
});
// #1175: traceMatch.optional marks a step that may be absent from a trace. A missing
// optional step is left out of the label as if it were not there; the title lists it.
const ARCHIVE={id:'archive',text:'Archive stats',traceMatch:{serviceName:'stats-archive',operation:'archive stats',nodeId:'consumer',optional:true}};
test('a node named by a matched step and an optional step missing from the trace reads the matched step; without optional it reads 1 unknown',()=>{
 for(const node of ['consumer','platform::consumer']){
  // The same rules for a local node and an imported (namespaced) node.
  const board=()=>{const d=transportBoard();if(node!=='consumer'){d.nodes={broker:d.nodes.broker,[node]:d.nodes.consumer};d.rows=[['broker',node]];d.edges[0].to=node;d.steps[0].edge='broker->'+node;d.steps[0].traceMatch.forEach(m=>m.nodeId=node);}
   const archive=structuredClone(ARCHIVE);archive.traceMatch.nodeId=node;d.steps.push(archive);return d;};
  const pulsar=()=>transportTrace(traceSpan('p1',PULSAR,0,16.1));
  let d=board(),labels=paintTraceLabels(d,pulsar());
  assert.equal(labels.node(node).text,'Matched: stats-consumer persistent://stats/camer… · 16.1 ms',node+': one matched row reads Matched: … and its time');
  assert.doesNotMatch(labels.node(node).text,/unknown|operations/);
  assert.match(labels.node(node).title,/optional, not in this trace: stats-archive archive stats/,node+': the title lists the optional step');
  assert.doesNotMatch(labels.node(node).title,/archive stats: Not observed/);
  assert.equal(labels.edge(0).text,'Matched: stats-consumer persistent://stats/camer… · 16.1 ms','the edge follows the same rules');
  assert.equal(labels.tone(node),'observed','the optional step does not make the node unknown');
  assert.equal(labels.status(node),'matched','the node status lists only the counted rows');
  // The company case with a single traceMatch object: the time alone.
  d=board();d.steps[0].traceMatch=d.steps[0].traceMatch[0];
  assert.equal(paintTraceLabels(d,pulsar()).node(node).text,'16.1 ms');
  // Without optional the missing step still counts.
  d=board();delete d.steps[1].traceMatch.optional;
  labels=paintTraceLabels(d,pulsar());assert.equal(labels.node(node).text,'2 operations · 1 unknown · 16.1 ms');assert.equal(labels.status(node),'matched missing');
  d=board();d.steps[1].traceMatch.optional=false;
  assert.equal(paintTraceLabels(d,pulsar()).node(node).text,'2 operations · 1 unknown · 16.1 ms','optional:false is the same as no optional');
 }
});
test('an optional step that matches or is ambiguous reads like any other step; a node with only a missing optional step is not labelled',()=>{
 const d=transportBoard();d.steps.push(structuredClone(ARCHIVE));
 const plainBoard=transportBoard();plainBoard.steps.push(structuredClone(ARCHIVE));delete plainBoard.steps[1].traceMatch.optional;
 const matched=transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('a1','archive stats',20,5,null,'stats-archive'));
 assert.deepEqual(paintTraceLabels(d,matched).node('consumer'),paintTraceLabels(plainBoard,matched).node('consumer'),'a matched optional step reads exactly as a matched step');
 assert.equal(paintTraceLabels(d,matched).node('consumer').text,'2 operations · 21.1 ms across 2 spans');
 const ambiguous=transportTrace(traceSpan('p1',PULSAR,0,16.1),traceSpan('a1','archive stats',20,5,null,'stats-archive'),traceSpan('a2','archive stats',30,5,null,'stats-archive'));
 assert.equal(paintTraceLabels(d,ambiguous).node('consumer').text,'2 operations · 1 ambiguous · 16.1 ms','an ambiguous optional step still counts as ambiguous');
 // Only the optional step names the archive node; this trace lacks it.
 const only=transportBoard();only.nodes.archive={title:'Archive'};only.rows[0].push('archive');only.steps.push({...structuredClone(ARCHIVE),traceMatch:{...ARCHIVE.traceMatch,nodeId:'archive'}});
 const model=C.telemetryTraceModel(only,undefined,transportTrace(traceSpan('p1',PULSAR,0,16.1)));
 assert.equal(model.nodes.archive.length,1,'the row is kept for the panel');assert.equal(model.nodes.archive[0].optional,true);
 const painted=paintTraceLabels(only,transportTrace(traceSpan('p1',PULSAR,0,16.1)));
 assert.equal(painted.node('archive'),null,'no label on a node whose only row is a missing optional step');assert.equal(painted.tone('archive'),undefined,'and no unknown tone');
 assert.equal(painted.tone('consumer'),'observed');
});
