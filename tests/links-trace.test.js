'use strict';
/* #1243 part 2: the Links window's Trace match tab. Read model and planners for
   By trace match / By element, drag move/copy (Replace or Add as alternative),
   + Assign step and the shared rename. Every write is the step's `traceMatch`,
   as the #1238 Inspect form writes it, in one plan (one Undo step).
   #1290 PR 8 (LT17-LT20): spans declared on nodes and connections (trace.spans) join the
   groups as read-only declaration rows, with the steps that inherit them (the per-path D9 rule
   and skips, as the step trace scope form); By element lists a carrier's own declarations;
   imported carriers show their merged declarations. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const c={URL,TextEncoder};vm.createContext(c);
vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js',
  'workbench/commands/graph.js','workbench/commands/narrative.js','workbench/commands/layout.js','workbench/commands/topology.js',
  'workbench/commands/links.js','workbench/commands/links-trace.js']),c);
const plain=x=>JSON.parse(JSON.stringify(x));
const d=s=>s.page.sections[0].diagram;
const KEY='notify-svc · route.event';

function board(){
  return {page:{title:'Doorbell',sections:[{heading:'Flow',diagram:{
    nodes:{ctrl:{title:'Doorbell controller'},ingest:{title:'Event ingest'},notify:{title:'Notification service'}},
    rows:[['ctrl','ingest','notify']],
    edges:[{from:'ctrl',to:'ingest',label:'event'},{from:'ingest',to:'notify',label:'route'}],
    steps:[
      {id:'publish',text:'publish',edge:'ctrl->ingest',traceMatch:{serviceName:'ingest-api',operation:'POST /v1/events'}},
      {id:'route',text:'route',edge:'ingest->notify',traceMatch:{serviceName:'notify-svc',operation:'route.event',nodeId:'notify',attributes:{'deployment.environment.name':'prod'},maxDurationMs:500}},
      {id:'push',text:'push',nodes:['notify']},
      {id:'retry',text:'retry',nodes:['notify'],traceMatch:{serviceName:'notify-svc',operation:'route.event'}}]}}]}};
}
function apply(spec,fn,context){
  const text=JSON.stringify(spec,null,2),plan=fn(text,JSON.parse(text),context);
  assert.equal(plan.error,undefined,plan.error);return {text:plan.text,raw:JSON.parse(plan.text),plan,unchanged:plan.text===text};
}
function model(spec,context){const text=JSON.stringify(spec,null,2);return c.linksTraceModel(text,JSON.parse(text),context || null);}
function group(m,key){const g=m.groups.find(x=>x.key===key);assert.ok(g,key+' is listed');return g;}
function el(m,kind,at){const found=m.elements.find(e=>e.kind===kind && (kind==='node'?e.id===at:e.index===at));assert.ok(found,kind+' '+at+' is listed');return found;}
const step=(index,alternative)=>({kind:'step',section:0,index,alternative:alternative||0});

test('LT1 By trace match groups steps by service · operation; nodes and connections show through their steps',()=>{
  assert.deepEqual(plain(c.validate(c.normalize(board())).errors),[],'the fixture is a board the product accepts');
  const m=model(board());assert.equal(m.error,undefined,m.error);
  assert.deepEqual(plain(m.groups.map(g=>g.key)),['ingest-api · POST /v1/events',KEY]);
  const g=group(m,KEY);
  assert.deepEqual(plain(g.uses.map(u=>u.index)),[1,3]);
  assert.deepEqual(plain(g.uses.map(u=>u.nodeId)),['notify',null]);
  assert.equal(g.uses[0].attributes,1);
  const notify=el(m,'node','notify');assert.deepEqual(plain(notify.via.map(v=>v.index)),[1],'a node shows the steps whose match names it');
  const routeEdge=el(m,'edge',1);assert.deepEqual(plain(routeEdge.via.map(v=>v.index)),[1],'an edge shows the steps that light it and have a match');
  const route=el(m,'step',1);assert.deepEqual(plain(route.matches.map(x=>x.key)),[KEY]);
  assert.deepEqual(plain(el(m,'step',2).matches),[]);
});

test('LT2 moving a match onto a step with none moves the whole alternative in one plan; copy keeps the source',()=>{
  let s=apply(board(),(t,r)=>c.planLinksTraceMove(t,r,step(1),step(2),null,false,null));
  assert.equal(d(s.raw).steps[1].traceMatch,undefined);
  assert.deepEqual(d(s.raw).steps[2].traceMatch,{serviceName:'notify-svc',operation:'route.event',nodeId:'notify',attributes:{'deployment.environment.name':'prod'},maxDurationMs:500},'advanced keys travel with it');
  s=apply(board(),(t,r)=>c.planLinksTraceMove(t,r,step(1),step(2),null,true,null));
  assert.equal(d(s.raw).steps[1].traceMatch.operation,'route.event');assert.equal(d(s.raw).steps[2].traceMatch.operation,'route.event');
});

test('LT3 onto a step that has a match: no mode asks; Replace swaps it; Add as alternative writes the array form',()=>{
  const text=JSON.stringify(board(),null,2);
  const ask=c.planLinksTraceMove(text,JSON.parse(text),step(0),step(1),null,false,null);
  assert.equal(ask.choose,true);assert.match(ask.error,/already has a trace match/);
  let s=apply(board(),(t,r)=>c.planLinksTraceMove(t,r,step(0),step(1),'replace',false,null));
  assert.deepEqual(d(s.raw).steps[1].traceMatch,{serviceName:'ingest-api',operation:'POST /v1/events'});assert.equal(d(s.raw).steps[0].traceMatch,undefined);
  s=apply(board(),(t,r)=>c.planLinksTraceMove(t,r,step(0),step(1),'alternative',false,null));
  assert.equal(d(s.raw).steps[1].traceMatch.length,2);
  assert.deepEqual(d(s.raw).steps[1].traceMatch[1],{serviceName:'ingest-api',operation:'POST /v1/events'});
  assert.equal(d(s.raw).steps[0].traceMatch,undefined);
  // Moving one alternative out of an array keeps the rest, back to the object form when one is left.
  const two=board();d(two).steps[1].traceMatch=[d(two).steps[1].traceMatch,{serviceName:'notify-svc',operation:'route.event.retry'}];
  s=apply(two,(t,r)=>c.planLinksTraceMove(t,r,step(1,1),step(2),null,false,null));
  assert.equal(Array.isArray(d(s.raw).steps[1].traceMatch),false);assert.equal(d(s.raw).steps[2].traceMatch.operation,'route.event.retry');
});

test('LT4 the shared rename changes every step that uses the match in one plan and reports the count',()=>{
  const g=group(model(board()),KEY);
  assert.equal(c.linksTraceRenameCount(g),2);
  const s=apply(board(),(t,r)=>c.planLinksTraceRename(t,r,{serviceName:'notify-svc',operation:'route.event'},{serviceName:'notify-svc',operation:'route.evt'},null));
  assert.equal(s.plan.count,2);
  assert.deepEqual(d(s.raw).steps[1].traceMatch,{serviceName:'notify-svc',operation:'route.evt',nodeId:'notify',attributes:{'deployment.environment.name':'prod'},maxDurationMs:500},'attributes, node and Advanced keys stay');
  assert.deepEqual(d(s.raw).steps[3].traceMatch,{serviceName:'notify-svc',operation:'route.evt'});
  assert.deepEqual(d(s.raw).steps[0].traceMatch,d(board()).steps[0].traceMatch,'other matches are untouched');
  const text=JSON.stringify(board());
  assert.match(c.planLinksTraceRename(text,JSON.parse(text),{serviceName:'notify-svc',operation:'route.event'},{serviceName:'',operation:'x'},null).error,/service name and an operation/);
});

test('LT5 + Assign step gives a step this match; unticking removes only that match',()=>{
  let s=apply(board(),(t,r)=>c.planLinksTraceAssign(t,r,{serviceName:'notify-svc',operation:'route.event'},step(2),false,null));
  assert.deepEqual(d(s.raw).steps[2].traceMatch,{serviceName:'notify-svc',operation:'route.event'});
  s=apply(board(),(t,r)=>c.planLinksTraceAssign(t,r,{serviceName:'notify-svc',operation:'route.event'},step(0),false,null));
  assert.equal(d(s.raw).steps[0].traceMatch.length,2,'a step with another match gets it as an alternative');
  s=apply(board(),(t,r)=>c.planLinksTraceAssign(t,r,{serviceName:'notify-svc',operation:'route.event'},step(3),true,null));
  assert.equal(d(s.raw).steps[3].traceMatch,undefined);
  const again=apply(board(),(t,r)=>c.planLinksTraceAssign(t,r,{serviceName:'notify-svc',operation:'route.event'},step(3),false,null));
  assert.ok(again.unchanged,'a step that already has it is unchanged');
});

test('LT6 refusals: same step, a hand-written value the form cannot edit, a node from another section',()=>{
  const m=model(board());
  assert.match(c.linksTraceDropRefusal(step(1),el(m,'step',1),null,false),/already here/);
  const raw=board();d(raw).steps[2].traceMatch='notify-svc';const m2=model(raw);
  assert.equal(el(m2,'step',2).form,false);
  assert.match(c.linksTraceDropRefusal(step(1),el(m2,'step',2),null,false),/Fix it in JSON|Inspect/);
  const text=JSON.stringify(raw);
  assert.match(c.planLinksTraceMove(text,JSON.parse(text),step(1),step(2),'replace',false,null).error,/not a selector object/);
  const two=board();two.page.sections.push({heading:'Other',diagram:{nodes:{x:{title:'X'}},rows:[['x']],steps:[{id:'other',nodes:['x']}]}});
  const m3=model(two),other=m3.elements.find(e=>e.kind==='step' && e.section===1);assert.ok(other,'the other section step is listed');
  assert.match(c.linksTraceDropRefusal(step(1),other,null,false),/Notification service|section/);
  assert.equal(c.linksTraceDropRefusal(step(3),other,null,false),null,'a match with no node can move across sections');
});

test('LT7 perf guard: the Move to… list for a match on a 400-node, 150-step board runs no planner',()=>{
  const nodes={},row=[],edges=[],steps=[];
  for(let i=0;i<400;i++){nodes['n'+i]={title:'Node '+i};row.push('n'+i);if(i)edges.push({from:'n'+(i-1),to:'n'+i});}
  for(let i=0;i<150;i++)steps.push(Object.assign({id:'s'+i,nodes:['n'+i]},i%3?{}:{traceMatch:{serviceName:'svc'+(i%7),operation:'op'}}));
  const spec={page:{title:'Big',sections:[{heading:'Flow',diagram:{nodes,rows:[row],edges,steps}}]}};
  const m=model(spec);
  const names=['planLinksTraceMove','planLinksTraceAssign','planLinksTraceRename','planStepTraceMatch'],saved={},calls={n:0};
  names.forEach(n=>{saved[n]=c[n];c[n]=function(){calls.n++;return saved[n].apply(null,arguments);};});
  try{
    const started=Date.now();let offered=0;
    for(const copy of [false,true])for(const t of c.linksTraceTargets(m,step(0),copy))if(t.refusal===null)offered++;
    const ms=Date.now()-started;
    assert.equal(calls.n,0,'no planner runs while listing targets');assert.ok(ms<250,'took '+ms+' ms');assert.ok(offered>=200,'offered '+offered);
  }finally{names.forEach(n=>{c[n]=saved[n];});}
});

function imported(providerNodes){
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:providerNodes || {api:{title:'API'},store:{title:'Store'}},rows:[Object.keys(providerNodes || {api:1,store:1})],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:Object.keys(providerNodes || {api:1,store:1}),edges:['api->store']}}});
  const source=spec('consumer',{nodes:{local:{title:'Local worker'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'canon'}],
    steps:[{id:'call',nodes:['canon::api'],traceMatch:{serviceName:'api',operation:'GET /items',nodeId:'canon::api'}},{id:'store',nodes:['local']}]});
  return {source,context:{version:1,id:'consumer',specs:[provider,source]}};
}

test('LT8 imported nodes: listed for the Node select, named by namespaced id, and the link survives a provider update',()=>{
  const f=imported(),m=model(f.source,f.context);
  const api=el(m,'node','canon::api');assert.equal(api.imported,true);assert.deepEqual(plain(api.via.map(v=>v.index)),[0]);
  assert.ok(m.nodeOptions[0].some(o=>o.id==='canon::api' && o.label==='API' && o.imported),'the Node select lists the imported node');
  const s=apply(f.source,(t,r)=>c.planLinksTraceMove(t,r,step(0),step(1),null,false,f.context),f.context);
  assert.equal(d(s.raw).steps[1].traceMatch.nodeId,'canon::api','the namespaced id is written as it was');
  // The provider renames the node and adds another: the consumer's match still names it, with the new title.
  const next=imported({api:{title:'Items API'},store:{title:'Store'},cache:{title:'Cache'}});
  const m2=model(next.source,next.context),api2=el(m2,'node','canon::api');
  assert.equal(api2.label,'Items API');assert.deepEqual(plain(api2.via.map(v=>v.index)),[0]);
  assert.equal(group(m2,'api · GET /items').uses[0].nodeId,'canon::api');
});

test('LT9 no duplicate service · operation on one step: Add as alternative and a clashing rename are refused and write nothing',()=>{
  const spec=board();d(spec).steps[3].traceMatch=[{serviceName:'notify-svc',operation:'route.event'},{serviceName:'notify-svc',operation:'route.evt'}];
  const text=JSON.stringify(spec,null,2),raw=JSON.parse(text);
  const clash=c.planLinksTraceRename(text,raw,{serviceName:'notify-svc',operation:'route.event'},{serviceName:'notify-svc',operation:'route.evt'},null);
  assert.match(clash.error,/Step 4 · retry already has notify-svc · route\.evt; renaming would give it two/);assert.equal(clash.text,undefined,'nothing is written');
  assert.equal(clash.field,'operation');
  const empty=c.planLinksTraceRename(text,raw,{serviceName:'notify-svc',operation:'route.event'},{serviceName:'notify-svc',operation:'  '},null);
  assert.equal(empty.field,'operation','the error names the empty field');
  const twice=c.planLinksTraceMove(text,raw,step(1),step(3),'alternative',true,null);
  assert.match(twice.error,/already has notify-svc · route\.event/);
  const m=model(spec);
  assert.match(c.linksTraceAlternativeRefusal(el(m,'step',3),KEY),/already has/);
  assert.equal(c.linksTraceAlternativeRefusal(el(m,'step',0),KEY),null);
});

test('LT10 a connection lists every alternative of the steps that light it; a rename reports how many steps it changed',()=>{
  const spec=board();d(spec).steps[1].traceMatch=[d(spec).steps[1].traceMatch,{serviceName:'notify-svc',operation:'route.event.retry'}];
  const route=el(model(spec),'edge',1);
  assert.deepEqual(plain(route.via.map(u=>u.key)),[KEY,'notify-svc · route.event.retry']);
  const s=apply(spec,(t,r)=>c.planLinksTraceRename(t,r,{serviceName:'notify-svc',operation:'route.event.retry'},{serviceName:'notify-svc',operation:'route.retry'},null));
  assert.equal(s.plan.count,1);assert.equal(d(s.raw).steps[1].traceMatch[1].operation,'route.retry');assert.equal(d(s.raw).steps[1].traceMatch[0].operation,'route.event');
  const same=apply(spec,(t,r)=>c.planLinksTraceRename(t,r,{serviceName:'notify-svc',operation:'route.event'},{serviceName:' notify-svc ',operation:'route.event'},null));
  assert.ok(same.unchanged,'renaming to the same key writes nothing');assert.equal(same.plan.count,0);
});

test('LT11 a clashing rename names the field the reader changed; steps carry their id',()=>{
  const spec=board();d(spec).steps[3].traceMatch=[{serviceName:'notify-svc',operation:'route.event'},{serviceName:'other-svc',operation:'route.event'},{serviceName:'x',operation:'y'}];
  const text=JSON.stringify(spec,null,2),raw=JSON.parse(text),g={serviceName:'notify-svc',operation:'route.event'};
  assert.equal(c.planLinksTraceRename(text,raw,g,{serviceName:'other-svc',operation:'route.event'},null).field,'serviceName');
  assert.equal(c.planLinksTraceRename(text,raw,g,{serviceName:'x',operation:'y'},null).field,'both');
  assert.equal(el(model(board()),'step',2).stepId,'push');
});

test('LT12 a New trace match draft stays with its step: by id, or by caption for a step with no id',()=>{
  const m=model(board()),push=el(m,'step',2),retry=el(m,'step',3);
  const draft={stepId:push.stepId,caption:push.caption};
  assert.equal(c.linksTraceSameStep(draft,push),true);assert.equal(c.linksTraceSameStep(draft,retry),false);
  const spec=board();d(spec).steps.forEach(st=>{delete st.id;});const m2=model(spec),a=el(m2,'step',2),b=el(m2,'step',3);
  assert.equal(a.stepId,null);
  const idless={stepId:null,caption:a.caption};
  assert.equal(c.linksTraceSameStep(idless,a),true);
  assert.equal(c.linksTraceSameStep(idless,b),false,'an id-less step that shifts into its place is a different step');
  const blank=Object.assign({},a,{caption:''});
  assert.equal(c.linksTraceSameStep({id:'step:0:2',stepId:null,caption:''},blank),true,'no id and no caption: the position keeps the draft, so the form opens');
  assert.equal(c.linksTraceSameStep({id:'step:0:1',stepId:null,caption:''},blank),false);
});

test('LT16 two id-less steps with the same caption are told apart by which one they are',()=>{
  const spec=board();d(spec).steps.forEach(st=>{delete st.id;});d(spec).steps[2].text='retry';d(spec).steps[3].text='retry';
  const m=model(spec),first=el(m,'step',2),second=el(m,'step',3);
  assert.equal(first.occurrence,0);assert.equal(second.occurrence,1);
  const draft={id:'step:0:2',stepId:null,caption:'retry',occurrence:0};
  assert.equal(c.linksTraceSameStep(draft,first),true);
  assert.equal(c.linksTraceSameStep(draft,second),false,'the second "retry" is a different step');
});

test('LT13 the inline editor refuses an attribute name trace matching does not support, before any write',()=>{
  const text=JSON.stringify(board(),null,2),raw=JSON.parse(text);
  const bad=c.planLinksTraceEdit(text,raw,0,1,{op:'attribute',alternative:0,key:null,name:'event.type',value:'doorbell.press'},null);
  assert.match(bad.error,/event\.type is not a trace attribute/);assert.equal(bad.text,undefined);
  const s=apply(board(),(t,r)=>c.planLinksTraceEdit(t,r,0,1,{op:'attribute',alternative:0,key:null,name:'service.version',value:'1.2'},null));
  assert.equal(d(s.raw).steps[1].traceMatch.attributes['service.version'],'1.2');
  assert.deepEqual(plain(c.validate(c.normalize(s.raw)).errors),[],'the accepted edit leaves a valid board');
  const ren=c.planLinksTraceEdit(text,raw,0,1,{op:'attribute',alternative:0,key:'deployment.environment.name',name:'env',value:'prod'},null);
  assert.match(ren.error,/env is not a trace attribute/,'renaming an attribute is checked too');
  assert.ok(c.linksTraceAttributeNames(raw,null).includes('deployment.environment.name'));
});

test('LT14 a value edit on an attribute whose name was hand-written is not refused for the name; the short refusal names the list',()=>{
  const spec=board();d(spec).steps[1].traceMatch.attributes={'event.type':'doorbell.press'};
  const s=apply(spec,(t,r)=>c.planLinksTraceEdit(t,r,0,1,{op:'attribute',alternative:0,key:'event.type',name:'event.type',value:'doorbell.hold'},null));
  assert.equal(d(s.raw).steps[1].traceMatch.attributes['event.type'],'doorbell.hold');
  const text=JSON.stringify(board()),raw=JSON.parse(text);
  assert.equal(c.planLinksTraceEdit(text,raw,0,1,{op:'attribute',alternative:0,key:null,name:'event.type',value:'x'},null).error,'event.type is not a trace attribute Flowview can match on. Pick one from the list.');
});

test('LT15 a step without an id cannot be given a trace match: Create, Assign, Move, Copy and the drop check refuse with the reason',()=>{
  const spec=board();delete d(spec).steps[2].id;
  const text=JSON.stringify(spec,null,2),raw=JSON.parse(text),m=model(spec),target=el(m,'step',2);
  const needsId=/has no id, and a step with a trace match needs one\. Give this step an id in Inspect first\./;
  assert.match(c.planLinksTraceEdit(text,raw,0,2,{op:'create',serviceName:'push-gw',operation:'apns.send'},null).error,needsId);
  assert.match(c.planLinksTraceAssign(text,raw,{serviceName:'notify-svc',operation:'route.event'},step(2),false,null).error,needsId);
  assert.match(c.planLinksTraceMove(text,raw,step(1),step(2),null,false,null).error,needsId);
  assert.match(c.planLinksTraceMove(text,raw,step(1),step(2),null,true,null).error,needsId);
  assert.match(c.linksTraceDropRefusal(step(1),target,null,false),needsId);
  const ok=apply(board(),(t,r)=>c.planLinksTraceEdit(t,r,0,2,{op:'create',serviceName:'push-gw',operation:'apns.send'},null));
  assert.deepEqual(plain(c.validate(c.normalize(ok.raw)).errors),[],'with an id, Create leaves a valid board');
});

/* #1290 PR 8: a board whose nodes and connections declare spans. Path A has push and retry on
   notify (shared, so push inherits nothing there); Path B has push alone (it inherits). */
function declared(){
  const spec=board(),dd=d(spec);
  dd.nodes.notify.trace={spans:{route:{serviceName:'notify-svc',operation:'route.event',role:'process'},lookup:{serviceName:'notify-svc',operationPrefix:'GET ',role:'database'}}};
  dd.edges[0].trace={spans:{send:{serviceName:'ingest-api',operation:'POST /v1/events',role:'send'}}};
  delete dd.steps[0].traceMatch;
  dd.paths=[{id:'a',label:'Path A',steps:['publish','route','push','retry']},{id:'b',label:'Path B',steps:['publish','push']}];
  return spec;
}
const decl=(g,key)=>{const x=(g.declarations || []).find(x=>x.spanKey===key);assert.ok(x,'declaration '+key+' is listed under '+g.key);return x;};

test('LT17 By trace match: declarations join their group, read only, with the steps that inherit them per path',()=>{
  assert.deepEqual(plain(c.validate(c.normalize(declared())).errors),[],'the fixture is a board the product accepts');
  const m=model(declared());assert.equal(m.error,undefined,m.error);
  assert.deepEqual(plain(m.groups.map(g=>g.key)),['ingest-api · POST /v1/events','notify-svc · GET … (prefix)',KEY]);
  const route=group(m,KEY);
  assert.deepEqual(plain(route.uses.map(u=>u.index)),[1,3],'the steps with this trace match stay');
  const r=decl(route,'route');
  assert.deepEqual(plain({carrier:r.carrier,carrierLabel:r.carrierLabel,text:r.text,label:r.label,imported:r.imported}),
    {carrier:{kind:'node',section:0,id:'notify'},carrierLabel:'Notification service',text:'route · notify-svc route.event',label:'declared on Notification service (route)',imported:false});
  assert.deepEqual(plain(r.inherited.map(x=>x.text)),['Step 3 · push (inherited on Path B)'],'push inherits notify only where no other step lights it');
  const send=decl(group(m,'ingest-api · POST /v1/events'),'send');
  assert.deepEqual(plain(send.carrier),{kind:'edge',section:0,index:0,key:'ctrl->ingest'});
  assert.equal(send.carrierLabel,'Doorbell controller → Event ingest');
  assert.deepEqual(plain(send.inherited.map(x=>x.text)),['Step 1 · publish (inherited)'],'on every path: no path name');
  const prefix=group(m,'notify-svc · GET … (prefix)');
  assert.deepEqual(plain(prefix.uses),[],'a prefix declaration has no step trace match');
  assert.equal(prefix.assignable,false,'a step cannot take a prefix as its trace match');
  assert.equal(route.assignable,true);
});

test('LT18 skips and scopes: a scoped step inherits shared carriers; a skipped span or role is not listed',()=>{
  const spec=declared();d(spec).steps[2].traceScope={skip:{notify:['lookup']}};
  const m=model(spec);
  assert.deepEqual(plain(decl(group(m,KEY),'route').inherited.map(x=>x.text)),['Step 3 · push (inherited)'],'a scope inherits shared carriers on every path');
  assert.deepEqual(plain(decl(group(m,'notify-svc · GET … (prefix)'),'lookup').inherited),[],'a skipped span is not inherited');
  d(spec).steps[2].traceScope={skip:{notify:['role:process']}};
  assert.deepEqual(plain(decl(group(model(spec),KEY),'route').inherited),[],'a skipped role is not inherited');
  // A connection's receive span only times the hand-off: no step inherits it.
  const recv=declared();d(recv).edges[0].trace.spans.receive={serviceName:'ingest-api',operation:'consume',role:'receive'};
  assert.deepEqual(plain(decl(group(model(recv),'ingest-api · consume'),'receive').inherited),[]);
});

test('LT19 By element: a node or connection lists its own declarations, not only via its steps',()=>{
  const m=model(declared());
  assert.ok(Array.isArray(el(m,'node','notify').declarations),'a node row carries its declarations');
  assert.deepEqual(plain(el(m,'node','notify').declarations.map(x=>x.text)),['route · notify-svc route.event','lookup · notify-svc GET … (prefix)']);
  assert.deepEqual(plain(el(m,'edge',0).declarations.map(x=>x.text)),['send · ingest-api POST /v1/events']);
  assert.deepEqual(plain(el(m,'node','ctrl').declarations),[]);
});

test('LT20 imported carriers: merged declarations (the consumer overlay adds and hides), named by namespaced id',()=>{
  const f=imported({api:{title:'API',trace:{spans:{get:{serviceName:'api',operation:'GET /items',role:'process'},old:{serviceName:'api',operation:'GET /old',role:'process'}}}},store:{title:'Store'}});
  d(f.source).topologyImports[0].nodeTracking={api:{trace:{spans:{audit:{serviceName:'api',operation:'audit',role:'work'}},hide:['old']}}};
  const m=model(f.source,f.context);assert.equal(m.error,undefined,m.error);
  const api=el(m,'node','canon::api');
  assert.equal(api.imported,true);assert.ok(Array.isArray(api.declarations),'an imported node row carries its declarations');
  assert.deepEqual(plain(api.declarations.map(x=>x.spanKey)),['get','audit'],'the overlay adds audit and hides old');
  const g=decl(group(m,'api · GET /items'),'get');
  assert.deepEqual(plain({carrier:g.carrier,imported:g.imported,label:g.label}),{carrier:{kind:'node',section:0,id:'canon::api'},imported:true,label:'declared on API (get)'});
  assert.equal(m.groups.some(x=>x.key==='api · GET /old'),false,'a hidden span is not listed');
});
