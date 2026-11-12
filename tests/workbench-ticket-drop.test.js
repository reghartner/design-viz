'use strict';
/* #1241 desktop Workbench: a Tickets row dropped on the preview writes through planTicketDrop
   (commands/links.js → planLinksTicket). Chuck's rule: node changes cover imported nodes in the same slice.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| T1 | A drop on an imported node writes the consumer overlay nodeTracking.<id>.tickets; on an imported connection (the viewer's resolved edge index) edgeTracking["from->to"].tickets; never the provider or the imported node itself; each is one Undo step. | consumer importing provider api → store as canon | overlay objects; provider untouched; Undo text | writing a local node named canon::api; editing the provider |
| T2 | A key already on the carrier changes nothing (no history entry); a text box and an unknown target are refused with a reason. | same plus a local text box | same text; error text | a duplicate key; a silent no-op on a refused drop |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout','workbench/commands/links',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const d=s=>s.page.sections[0].diagram;
function imported(){
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},tracking:{jira:{site:'https://acme.atlassian.net'}},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const source=spec('consumer',{nodes:{local:{title:'Local worker',tickets:['LOC-1']},note:{type:'text',text:'a note'}},rows:[['local','note']],
    panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'provider',export:'core',as:'canon'}]});
  return {provider,source,context:{version:1,id:'consumer',specs:[provider,source]}};
}
function session(f){
  const e=inspectorEnvironment(names),h=e.mount(f.source);
  h.session.replaceProject(JSON.stringify(f.source,null,2),null,{topologyContext:f.context});
  const s={C:e.C,h,get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    plan(ref,key){return e.C.planTicketDrop(h.text,JSON.parse(h.text),ref,key,f.context);},
    drop(ref,key){const plan=s.plan(ref,key);assert.equal(plan.error,undefined,plan.error);if(plan.text===h.text)return false;h.session.accept(plan,{snapshot:h.session.snapshot()});return true;}};
  return s;
}

test('T1 drops on an imported node and an imported connection write the consumer overlay, one Undo step each',()=>{
  const f=imported(),providerBefore=JSON.stringify(f.provider),s=session(f);
  assert.equal(typeof s.C.planTicketDrop,'function','planTicketDrop is a Workbench command');
  let before=s.text;
  assert.equal(s.drop({section:0,kind:'node',id:'canon::api'},'EX-1'),true);
  assert.deepEqual(plain(d(s.raw).topologyImports[0].nodeTracking),{api:{tickets:['EX-1']}});
  assert.equal(d(s.raw).nodes['canon::api'],undefined,'nothing is written onto the imported node itself');
  assert.equal(s.h.session.undo(),true);assert.equal(s.text,before,'one Undo restores the exact text');assert.equal(s.h.session.canUndo(),false);
  const resolved=d(s.C.FlowTopology.resolveSource(s.raw,f.context)),index=resolved.edges.findIndex(e=>e.from==='canon::api' && e.to==='canon::store');
  assert.ok(index>=0,'the imported connection is on the rendered page');
  before=s.text;
  assert.equal(s.drop({section:0,kind:'edge',index},'EX-2'),true);
  assert.deepEqual(plain(d(s.raw).topologyImports[0].edgeTracking),{'api->store':{tickets:['EX-2']}});
  assert.equal(s.h.session.undo(),true);assert.equal(s.text,before);assert.equal(s.h.session.canUndo(),false);
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider is untouched');
});

test('T2 a key already there writes nothing; a text box and a bad target are refused with a reason',()=>{
  const s=session(imported()),before=s.text;
  assert.equal(s.drop({section:0,kind:'node',id:'local'},'LOC-1'),false,'already on the node: no edit');
  assert.equal(s.drop({section:0,kind:'node',id:'canon::api'},'CAN-1'),false,'inherited from the provider: no edit');
  assert.equal(s.text,before);assert.equal(s.h.session.canUndo(),false,'no history entry');
  assert.match(s.plan({section:0,kind:'node',id:'note'},'EX-1').error,/Text boxes do not carry tickets/);
  assert.match(s.plan({section:0,kind:'step',id:'x'},'EX-1').error,/node or connection/);
});
