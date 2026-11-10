'use strict';
/* #1243 Links view, Tickets tab (part 1): the read model and the planners behind
   By ticket / By element, + Assign, drag move/copy and Edit key. They write what
   the Inspector Tracking editor writes: `tickets` on authored nodes and edges, the
   consumer `nodeTracking` / `edgeTracking` overlay on imported ones, and a step's
   `ticketFilter` for a step (steps show the tickets of what they light). */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const c={URL,TextEncoder};vm.createContext(c);
vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js',
  'workbench/commands/graph.js','workbench/commands/layout.js','workbench/commands/topology.js','workbench/commands/links.js']),c);
const plain=x=>JSON.parse(JSON.stringify(x));
const d=s=>s.page.sections[0].diagram;
const el=(m,kind,at)=>{const found=m.elements.find(e=>e.kind===kind && (kind==='node'?e.id===at:e.index===at));assert.ok(found,kind+' '+at+' is listed');return found;};
const ids=links=>plain(links.map(l=>l.kind+':'+(l.kind==='node'?l.id:l.index)).sort());

function board(){
  return {page:{title:'Doorbell',sections:[{heading:'Flow',diagram:{
    nodes:{button:{title:'Doorbell button'},ctrl:{title:'Doorbell controller',tickets:['FW-45','https://acme.atlassian.net/browse/FW-46']},
      ingest:{title:'Event ingest',tickets:['BE-67']},notify:{title:'Notification service'},note:{type:'text',text:'a text box'}},
    rows:[['button','ctrl','ingest','notify']],
    edges:[{from:'button',to:'ctrl',label:'press'},{from:'ctrl',to:'ingest',label:'event',tickets:['FW-45']},{from:'ingest',to:'notify',label:'route'}],
    steps:[{id:'press',text:'press',edge:'button->ctrl'},{id:'publish',text:'publish',nodes:['ctrl']},{id:'route',text:'route',edge:'ingest->notify',nodes:['ingest']}]}}]}};
}
function apply(spec,fn,context){
  const text=JSON.stringify(spec,null,2),plan=fn(text,JSON.parse(text),context);
  assert.equal(plan.error,undefined,plan.error);return {text:plan.text,raw:JSON.parse(plan.text),unchanged:plan.text===text};
}

test('L1 By ticket lists each key with the nodes, edges and steps that carry or show it',()=>{
  const spec=board(),text=JSON.stringify(spec,null,2),m=c.linksTicketModel(text,JSON.parse(text),null);
  assert.equal(m.error,undefined);
  assert.deepEqual(plain(m.tickets.map(t=>t.key)),['BE-67','FW-45','FW-46']);
  const fw45=m.tickets.find(t=>t.key==='FW-45');assert.ok(fw45,'FW-45 is listed');
  assert.deepEqual(ids(fw45.links),['edge:1','node:ctrl','step:1']);
  assert.deepEqual(plain(fw45.links.find(l=>l.kind==='step').via),['node Doorbell controller']);
  assert.equal((m.tickets.find(t=>t.key==='FW-46') || {}).ref,'https://acme.atlassian.net/browse/FW-46','a URL reference is kept as the stored form');
  assert.ok(!m.elements.some(e=>e.kind==='node' && e.id==='note'),'text boxes carry no tickets and are not listed');
});

test('L2 By element: every node, edge and step is an element with its keys',()=>{
  const spec=board(),text=JSON.stringify(spec,null,2),m=c.linksTicketModel(text,JSON.parse(text),null);
  const find=(kind,at)=>el(m,kind,at);
  assert.deepEqual(plain(find('node','ctrl').keys),['FW-45','FW-46']);
  assert.deepEqual(plain(find('node','button').keys),[]);
  assert.equal(find('edge',1).label,'Doorbell controller → Event ingest · event');
  assert.deepEqual(plain(find('step',1).shown),['FW-45','FW-46']);
  assert.deepEqual(plain(find('step',0).shown),[],'a step that lights nothing with tickets shows none');
  assert.equal(find('step',1).label,'Step 2 · publish');
});

test('L3 assign a ticket to an edge writes tickets on the edge; removing it leaves the step filters that named it',()=>{
  let s=apply(board(),(t,r)=>c.planLinksTicket(t,r,{kind:'edge',section:0,index:2,key:'ingest->notify'},'FW-45','FW-45',false,null));
  assert.deepEqual(d(s.raw).edges[2].tickets,['FW-45']);
  const again=apply(s.raw,(t,r)=>c.planLinksTicket(t,r,{kind:'edge',section:0,index:2},'FW-45','FW-45',false,null));
  assert.ok(again.unchanged,'assigning a ticket the element already carries changes nothing');
  const filtered=board();d(filtered).steps[1].ticketFilter=['FW-45'];
  s=apply(filtered,(t,r)=>c.planLinksTicket(t,r,{kind:'node',section:0,id:'ctrl'},'FW-45',null,true,null));
  assert.deepEqual(d(s.raw).nodes.ctrl.tickets,['https://acme.atlassian.net/browse/FW-46']);
  assert.equal(d(s.raw).steps[1].ticketFilter,undefined,'the filter that named only FW-45 is removed in the same edit');
});

test('L4 move a ticket between nodes is one plan; copy keeps the source; hand-written entries stay',()=>{
  const spec=board();d(spec).nodes.ctrl.tickets.push('fw-typo');
  const moved=apply(spec,(t,r)=>c.planLinksTicketMove(t,r,{kind:'node',section:0,id:'ctrl'},{kind:'node',section:0,id:'notify'},'FW-46','https://acme.atlassian.net/browse/FW-46',false,null));
  assert.deepEqual(d(moved.raw).nodes.ctrl.tickets,['FW-45','fw-typo'],'the unreadable entry is kept');
  assert.deepEqual(d(moved.raw).nodes.notify.tickets,['https://acme.atlassian.net/browse/FW-46'],'the stored URL moves as written');
  const copied=apply(spec,(t,r)=>c.planLinksTicketMove(t,r,{kind:'node',section:0,id:'ctrl'},{kind:'edge',section:0,index:0},'FW-45','FW-45',true,null));
  assert.deepEqual(d(copied.raw).nodes.ctrl.tickets.slice(0,1),['FW-45']);
  assert.deepEqual(d(copied.raw).edges[0].tickets,['FW-45']);
  const bad=board();d(bad).nodes.notify.tickets='FW-1';
  const text=JSON.stringify(bad);
  assert.match(c.planLinksTicket(text,JSON.parse(text),{kind:'node',section:0,id:'notify'},'FW-45','FW-45',false,null).error,/not a list/);
});

test('L5 steps: a step shows the lit tickets; hiding writes ticketFilter, showing clears it; an unlit ticket is refused',()=>{
  let s=apply(board(),(t,r)=>c.planLinksTicket(t,r,{kind:'step',section:0,index:1},'FW-46',null,true,null));
  assert.deepEqual(d(s.raw).steps[1].ticketFilter,['FW-45']);
  s=apply(s.raw,(t,r)=>c.planLinksTicket(t,r,{kind:'step',section:0,index:1},'FW-46',null,false,null));
  assert.equal(d(s.raw).steps[1].ticketFilter,undefined,'every lit ticket shown again means no filter');
  const text=JSON.stringify(board());
  assert.match(c.planLinksTicket(text,JSON.parse(text),{kind:'step',section:0,index:0},'FW-45',null,false,null).error,/does not light/);
  const only=board();d(only).nodes.ctrl.tickets=['FW-45'];const t2=JSON.stringify(only);
  assert.match(c.planLinksTicket(t2,JSON.parse(t2),{kind:'step',section:0,index:1},'FW-45',null,true,null).error,/Keep at least one ticket/);
});

test('L6 Edit key renames a ticket on every element in one plan and in step filters',()=>{
  const spec=board();d(spec).steps[1].ticketFilter=['FW-45'];
  const s=apply(spec,(t,r)=>c.planLinksTicketRename(t,r,'FW-45','FW-450',null));
  assert.deepEqual(d(s.raw).nodes.ctrl.tickets,['https://acme.atlassian.net/browse/FW-46','FW-450']);
  assert.deepEqual(d(s.raw).edges[1].tickets,['FW-450']);
  assert.deepEqual(d(s.raw).steps[1].ticketFilter,['FW-450']);
  const text=JSON.stringify(board());
  assert.match(c.planLinksTicketRename(text,JSON.parse(text),'FW-45','not a key',null).error,/Jira key/);
});

function imported(){
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const source=spec('consumer',{nodes:{local:{title:'Local worker',tickets:['LOC-1']}},rows:[['local']],
    topologyImports:[{spec:'provider',export:'core',as:'canon',nodeTracking:{api:{tickets:['API-2']}}}],
    steps:[{id:'build',nodes:['canon::api','local'],text:'Build'}]});
  return {source,context:{version:1,id:'consumer',specs:[provider,source]}};
}

test('L7 imported carriers: inherited tickets are read only; local ones write the consumer overlay',()=>{
  const f=imported(),text=JSON.stringify(f.source,null,2),m=c.linksTicketModel(text,JSON.parse(text),f.context);
  const api=el(m,'node','canon::api');
  assert.equal(api.imported,true);assert.equal(api.editable,true);
  assert.deepEqual(plain(api.keys),['CAN-1','API-2']);assert.deepEqual(plain(api.inherited),['CAN-1']);
  const can1Row=m.tickets.find(t=>t.key==='CAN-1');assert.ok(can1Row,'CAN-1 is listed');const can1=can1Row.links.find(l=>l.kind==='node');assert.equal(can1.inherited,true);
  let s=apply(f.source,(t,r)=>c.planLinksTicket(t,r,{kind:'node',section:0,id:'canon::api'},'LOC-1','LOC-1',false,f.context),f.context);
  assert.deepEqual(d(s.raw).topologyImports[0].nodeTracking,{api:{tickets:['API-2','LOC-1']}});
  assert.equal(d(s.raw).nodes['canon::api'],undefined,'nothing is written onto the imported node itself');
  s=apply(f.source,(t,r)=>c.planLinksTicket(t,r,{kind:'edge',section:0,index:0,key:'canon::api->canon::store'},'LOC-1','LOC-1',false,f.context),f.context);
  assert.deepEqual(d(s.raw).topologyImports[0].edgeTracking,{'api->store':{tickets:['LOC-1']}});
  s=apply(f.source,(t,r)=>c.planLinksTicketMove(t,r,{kind:'node',section:0,id:'canon::api'},{kind:'node',section:0,id:'local'},'API-2','API-2',false,f.context),f.context);
  assert.equal(d(s.raw).topologyImports[0].nodeTracking,undefined,'moving the only local overlay ticket away removes the overlay entry');
  assert.deepEqual(d(s.raw).nodes.local.tickets,['LOC-1','API-2']);
  assert.match(c.planLinksTicket(text,JSON.parse(text),{kind:'node',section:0,id:'canon::api'},'CAN-1',null,true,f.context).error,/inherited/);
});

test('L8 a snapshot without its providers lists imported elements with their tickets and writes them in place',()=>{
  const f=imported(),snapshot=c.FlowTopology.resolveSource(f.source,f.context);
  delete d(snapshot).topologyImports;
  const text=JSON.stringify(snapshot,null,2),m=c.linksTicketModel(text,JSON.parse(text),null);
  assert.equal(m.error,undefined,m.error);
  const api=el(m,'node','canon::api');
  assert.ok(api,'the imported node is listed');
  assert.deepEqual(plain(api.keys),['CAN-1','API-2']);
  assert.equal(api.editable,true,'a snapshot owns its delivery annotations, as Inspect edits them');
  const s=apply(snapshot,(t,r)=>c.planLinksTicket(t,r,{kind:'node',section:0,id:'canon::api'},'LOC-9','LOC-9',false,null));
  assert.deepEqual(d(s.raw).nodes['canon::api'].tickets.slice(-1),['LOC-9']);
});

test('L9 a move from a node onto a step is refused (it would delete the ticket); a copy shows it on the step',()=>{
  const spec=board();d(spec).steps[1].ticketFilter=['FW-46'];
  const text=JSON.stringify(spec,null,2),raw=JSON.parse(text),m=c.linksTicketModel(text,raw,null);
  const ctrl=el(m,'node','ctrl'),step=el(m,'step',1);
  assert.match(c.planLinksTicketMove(text,raw,ctrl,step,'FW-45','FW-45',false,null).error,/would take it off the node/);
  assert.match(c.linksDropRefusal(ctrl,step,'FW-45',false),/Hold ⌥/);
  assert.equal(c.linksDropRefusal(ctrl,step,'FW-45',true),null,'a copy is offered');
  const s=apply(spec,(t,r)=>c.planLinksTicketMove(t,r,ctrl,step,'FW-45','FW-45',true,null));
  assert.equal(d(s.raw).steps[1].ticketFilter,undefined,'the step shows every lit ticket again');
  assert.deepEqual(d(s.raw).nodes.ctrl.tickets,d(spec).nodes.ctrl.tickets,'the node keeps its tickets');
});

test('L10 drop checks cover the source: inherited, read-only and last-shown-on-a-step sources only copy',()=>{
  const f=imported(),text=JSON.stringify(f.source,null,2),m=c.linksTicketModel(text,JSON.parse(text),f.context);
  const api=el(m,'node','canon::api'),local=el(m,'node','local');
  assert.match(c.linksDropRefusal(api,local,'CAN-1',false),/inherited/);
  assert.equal(c.linksDropRefusal(api,local,'CAN-1',true),null);
  const fixed=Object.assign({},local,{editable:false,reason:'Read only.'});
  assert.match(c.linksDropRefusal(fixed,api,'LOC-1',false),/Read only\. Hold ⌥/);
  const only=board();d(only).nodes.ctrl.tickets=['FW-45'];const t2=JSON.stringify(only),r2=JSON.parse(t2),m2=c.linksTicketModel(t2,r2,null);
  const step=el(m2,'step',1),notify=el(m2,'node','notify');
  assert.match(c.planLinksTicketMove(t2,r2,step,notify,'FW-45','FW-45',false,null).error,/Keep at least one ticket/);
});

test('L11 showing or hiding on a step keeps filter keys it no longer lights, as Inspect does',()=>{
  const spec=board();d(spec).steps[1].ticketFilter=['FW-45','FW-46','OLD-1'];
  const s=apply(spec,(t,r)=>c.planLinksTicket(t,r,{kind:'step',section:0,index:1},'FW-46',null,true,null));
  assert.deepEqual(d(s.raw).steps[1].ticketFilter,['FW-45','OLD-1']);
  const back=apply(s.raw,(t,r)=>c.planLinksTicket(t,r,{kind:'step',section:0,index:1},'FW-46',null,false,null));
  assert.equal(d(back.raw).steps[1].ticketFilter,undefined,'every lit ticket shown again means no filter, as the Inspector checklist writes');
});

test('L12 entries Tracking cannot read are named; a non-list value makes the element read only',()=>{
  const spec=board();d(spec).nodes.ingest.tickets=['BE-67','not a key'];d(spec).nodes.notify.tickets='FW-1';
  const text=JSON.stringify(spec),m=c.linksTicketModel(text,JSON.parse(text),null);
  const ingest=el(m,'node','ingest'),notify=el(m,'node','notify');
  assert.deepEqual(plain(ingest.unreadable),['not a key']);assert.equal(ingest.editable,true);
  assert.equal(notify.notList,true);assert.equal(notify.editable,false);assert.match(notify.reason,/not a list/);
});
