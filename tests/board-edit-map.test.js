'use strict';
/* #1177: Map span to step in board Edit mode (src/viewer/board-edit.js). A mapping can be undone until
   Save; Save records each mapping as one trace-match change in page.editHistory (#1078); an undone one
   leaves none. A step that already has a traceMatch is replaced only when the caller names the
   traceMatch it replaces. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const ACCEPT={serviceName:'frontend',operation:'/cart/checkout'},CHARGE={serviceName:'payment',operation:'Charge'},OTHER={serviceName:'frontend',operation:'/cart/view'};
const TEXT=JSON.stringify({page:{title:'Checkout',sections:[{id:'main',diagram:{nodes:{web:{title:'Web'},pay:{title:'Pay'}},rows:[['web','pay']],edges:[{from:'web',to:'pay',label:'Charge'}],
 steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:ACCEPT},{id:'charge',text:'Charge the card',edge:'web->pay'}]}}]}},null,2);
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
async function editor(text=TEXT){
 const C={console,URL};vm.runInNewContext(entrypoint('standalone').body,C);
 const published=[],renders=[],store=new Map();
 const win={console,location:{pathname:'/board/'},addEventListener(){},removeEventListener(){},
  sessionStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  claude:{use:async name=>name==='artifact'?{publish:async files=>{published.push(files['flowspec.json'].content);}}:name==='user'?{canEdit:async()=>true,me:async()=>({id:'u1',name:'Reader'})}:null}};
 const e=C.createBoardEditor({win,text,specFile:'flowspec.json',render:text=>{renders.push(text);return null;}});
 await settle();e.start();assert.equal(e.state().active,true,'Edit mode is on');
 return {e,published,renders,step:id=>JSON.parse(e.text()).page.sections[0].diagram.steps.find(s=>s.id===id)};
}
const CHARGE_REF={section:0,kind:'step',id:'charge'},ACCEPT_REF={section:0,kind:'step',id:'accept'};
test('#1177 a mapping can be undone until Save and leaves no pending change',async()=>{
 const b=await editor();
 assert.equal(b.e.mapSpan(CHARGE_REF,CHARGE),true);assert.deepEqual(b.step('charge').traceMatch,CHARGE);assert.equal(b.e.state().pending,1);
 const mapped=b.e.state().mapped;assert.deepEqual(mapped===undefined?undefined:JSON.parse(JSON.stringify(mapped)),{step:'charge',label:'Charge the card',traceMatch:CHARGE},'the latest mapping, for the Undo note');
 assert.equal(typeof b.e.undoMap,'function');assert.equal(b.e.undoMap(),true);
 assert.equal(b.e.text(),TEXT,'the spec is back as it was');assert.equal(b.e.state().pending,0);assert.equal(b.e.state().mapped,null);
 assert.equal(b.renders.at(-1),TEXT,'the board re-renders the restored text');
 assert.equal(b.e.undoMap(),false,'nothing left to undo');
});
test('#1177 Save records one trace-match change per mapping, and none for an undone one',async()=>{
 let b=await editor();b.e.mapSpan(CHARGE_REF,CHARGE);b.e.save();await settle();
 assert.equal(b.published.length,1);let saved=JSON.parse(b.published[0]);
 assert.deepEqual(saved.page.editHistory.at(-1).changes,[{op:'trace-match',path:['page','sections',0,'diagram','steps',1],label:'Charge the card',step:'charge',traceMatch:CHARGE}]);
 assert.equal(b.e.state().mapped,null,'Save ends the Undo');
 b=await editor();b.e.mapSpan(CHARGE_REF,CHARGE);b.e.undoMap();b.e.save();await settle();
 assert.equal(b.published.length,0,'map then undo leaves nothing to save');assert.equal(b.e.state().pending,0);
});
test('#1177 replacing a mapped step names the traceMatch it replaces; undo restores it',async()=>{
 const b=await editor();
 assert.equal(b.e.mapSpan(ACCEPT_REF,OTHER),false,'a mapped step is not replaced by accident');assert.deepEqual(b.step('accept').traceMatch,ACCEPT);
 assert.equal(b.e.mapSpan(ACCEPT_REF,OTHER,ACCEPT),true,'the reader replaces the shown traceMatch');assert.deepEqual(b.step('accept').traceMatch,OTHER);
 assert.equal(b.e.state().pending,1);
 b.e.undoMap();assert.deepEqual(b.step('accept').traceMatch,ACCEPT,'undo restores the replaced traceMatch');assert.equal(b.e.text(),TEXT);
 b.e.mapSpan(ACCEPT_REF,OTHER,ACCEPT);b.e.mapSpan(CHARGE_REF,CHARGE);b.e.undoMap();
 assert.equal(b.step('charge').traceMatch,undefined,'undo takes back the latest mapping first');assert.deepEqual(b.step('accept').traceMatch,OTHER);
 b.e.save();await settle();const saved=JSON.parse(b.published[0]);
 assert.deepEqual(saved.page.editHistory.at(-1).changes.map(c=>[c.op,c.step,c.traceMatch]),[['trace-match','accept',OTHER]],'one change for the replacement');
});
test('#1180 a replacement records what it replaced, keeps the other fields, and never replaces alternatives',async()=>{
 let b=await editor();
 b.e.mapSpan(CHARGE_REF,CHARGE);b.e.mapSpan(ACCEPT_REF,OTHER,ACCEPT);
 assert.deepEqual(b.step('accept').traceMatch,OTHER,'serviceName and operation swap');
 b.e.save();await settle();const changes=JSON.parse(b.published[0]).page.editHistory.at(-1).changes;
 assert.equal('replaces' in changes[0],false,'a first mapping has no replaces');
 assert.deepEqual(changes[1].replaces,ACCEPT,'the replacement records the replaced value');
 // The other fields of a single traceMatch object stay.
 const rich=JSON.parse(TEXT);rich.page.sections[0].diagram.steps[0].traceMatch={...ACCEPT,nodeId:'web',maxDurationMs:300,optional:true};
 b=await editor(JSON.stringify(rich,null,2));
 assert.equal(b.e.mapSpan(ACCEPT_REF,OTHER,ACCEPT),true);assert.deepEqual(b.step('accept').traceMatch,{...OTHER,nodeId:'web',maxDurationMs:300,optional:true});
 // An alternatives array is never replaced, and two different arrays are not the same.
 const alt=JSON.parse(TEXT);alt.page.sections[0].diagram.steps[0].traceMatch=[ACCEPT,{serviceName:'frontend',operation:'/cart/other'}];
 b=await editor(JSON.stringify(alt,null,2));
 assert.equal(b.e.mapSpan(ACCEPT_REF,OTHER,[ACCEPT,{serviceName:'x',operation:'y'}]),false);assert.equal(b.e.mapSpan(ACCEPT_REF,OTHER,alt.page.sections[0].diagram.steps[0].traceMatch),false);
 assert.equal(b.e.state().pending,0);
});
test('#1177 a node drop mapping writes and records nodeId; a replacement sets it the same way',async()=>{
 let b=await editor();
 assert.equal(b.e.mapSpan(CHARGE_REF,{...CHARGE,nodeId:'pay'}),true);assert.deepEqual(b.step('charge').traceMatch,{...CHARGE,nodeId:'pay'});
 assert.equal(b.e.mapSpan(ACCEPT_REF,{...OTHER,nodeId:'web'},ACCEPT),true);assert.deepEqual(b.step('accept').traceMatch,{...OTHER,nodeId:'web'});
 b.e.save();await settle();const changes=JSON.parse(b.published[0]).page.editHistory.at(-1).changes;
 assert.deepEqual(changes.map(c=>c.traceMatch),[{...CHARGE,nodeId:'pay'},{...OTHER,nodeId:'web'}],'the change carries nodeId');
});
test('#1192 a replacement records the nodeId the step keeps; undo after a node drop restores the step',async()=>{
 let b=await editor();
 b.e.mapSpan(CHARGE_REF,{...CHARGE,nodeId:'pay'});b.e.mapSpan(CHARGE_REF,OTHER,CHARGE);
 assert.deepEqual(b.step('charge').traceMatch,{...OTHER,nodeId:'pay'},'the step keeps its nodeId');
 b.e.save();await settle();const changes=JSON.parse(b.published[0]).page.editHistory.at(-1).changes;
 assert.deepEqual(changes[1].traceMatch,{...OTHER,nodeId:'pay'},'the change describes the full mapping that results');
 b=await editor();b.e.mapSpan(CHARGE_REF,{...CHARGE,nodeId:'pay'});b.e.undoMap();assert.equal(b.e.text(),TEXT,'undo removes the written nodeId');
 b=await editor();b.e.mapSpan(ACCEPT_REF,{...OTHER,nodeId:'web'},ACCEPT);b.e.mapSpan(CHARGE_REF,CHARGE);b.e.undoMap();b.e.undoMap();assert.deepEqual(b.step('accept').traceMatch,ACCEPT,'undo restores the replaced traceMatch without the nodeId');
});
