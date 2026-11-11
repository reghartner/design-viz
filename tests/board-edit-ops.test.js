'use strict';
/* #1253 board Edit mode operations (src/viewer/board-edit.js).
   Item 3: a Remove that undoes a pending add of the same ticket on the same carrier cancels it, so the
   board has no pending change, Done ends Edit mode and Save publishes nothing. A mapping made after the
   cancelled add is still undone to a text without that add.
   Item 23: after a conflict replay the notice says "Save again" only while changes are pending. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const CHARGE={serviceName:'payment',operation:'Charge'};
const spec=()=>({page:{title:'Checkout',sections:[{id:'main',diagram:{nodes:{web:{title:'Web'},pay:{title:'Pay',tickets:['PAY-1']}},rows:[['web','pay']],edges:[{from:'web',to:'pay',label:'Charge'}],
 steps:[{id:'charge',text:'Charge the card',edge:'web->pay'}]}}]}});
const TEXT=JSON.stringify(spec(),null,2);
const WEB={section:0,kind:'node',id:'web'},PAY={section:0,kind:'node',id:'pay'},CHARGE_REF={section:0,kind:'step',id:'charge'};
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
function runtime(store,{reject=null}={}){
 const published=[];
 return {published,win:{console,location:{pathname:'/board/'},addEventListener(){},removeEventListener(){},
  sessionStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  claude:{use:async name=>name==='artifact'?{publish:async files=>{published.push(files['flowspec.json'].content);if(reject)throw {code:reject,message:'mock '+reject};}}:name==='user'?{canEdit:async()=>true,me:async()=>({id:'u1',name:'Reader'})}:null}}};
}
async function editor(text=TEXT,{store=new Map(),reject=null,start=true}={}){
 const C={console,URL};vm.runInNewContext(entrypoint('standalone').body,C);
 const r=runtime(store,{reject}),renders=[];
 const e=C.createBoardEditor({win:r.win,text,specFile:'flowspec.json',render:next=>{renders.push(next);return null;}});
 await settle();if(start){e.start();assert.equal(e.state().active,true,'Edit mode is on');}
 const node=id=>JSON.parse(e.text()).page.sections[0].diagram.nodes[id];
 return {e,store,renders,published:r.published,node};
}

test('#1253 item 3 a Remove of a ticket added in this session cancels the add',async()=>{
 const b=await editor();
 assert.equal(b.e.add(WEB,'ABC-1'),true);assert.deepEqual(b.node('web').tickets,['ABC-1']);assert.equal(b.e.state().pending,1);
 assert.equal(b.e.remove(WEB,'ABC-1'),true);
 assert.equal(b.node('web').tickets,undefined,'the ticket is gone again');
 assert.equal(b.e.state().pending,0,'the remove cancels the pending add: no change is left');
 b.e.done();assert.equal(b.e.state().active,false,'Done ends Edit mode');
 b.e.save();await settle();assert.equal(b.published.length,0,'Save publishes nothing');
});
test('#1253 item 3 an add of a ticket removed in this session cancels the remove',async()=>{
 const b=await editor();
 assert.equal(b.e.remove(PAY,'PAY-1'),true);assert.equal(b.e.state().pending,1);
 assert.equal(b.e.add(PAY,'PAY-1'),true);assert.deepEqual(b.node('pay').tickets,['PAY-1']);
 assert.equal(b.e.state().pending,0,'the add cancels the pending remove');
 // The same ticket on another carrier is a separate change.
 assert.equal(b.e.add(WEB,'PAY-1'),true);assert.equal(b.e.remove(PAY,'PAY-1'),true);assert.equal(b.e.state().pending,2);
});
test('#1253 item 3 undoing a mapping made after a cancelled add leaves no trace of the add',async()=>{
 const b=await editor();
 b.e.add(WEB,'ABC-1');assert.equal(b.e.mapSpan(CHARGE_REF,CHARGE),true);b.e.remove(WEB,'ABC-1');
 assert.equal(b.e.state().pending,1,'only the mapping is pending');
 assert.equal(b.e.undoMap(),true);
 assert.equal(b.node('web').tickets,undefined,'the cancelled add does not come back with the undo');
 assert.equal(JSON.parse(b.e.text()).page.sections[0].diagram.steps[0].traceMatch,undefined);
 assert.equal(b.e.state().pending,0);
 b.e.save();await settle();assert.equal(b.published.length,0,'nothing left to publish');
});

/* A conflict stashes the pending changes; the reloaded view replays them onto the winner's text. */
async function conflictThenReplay(change,winner){
 const store=new Map(),first=await editor(TEXT,{store,reject:'conflict'});change(first.e);first.e.save();await settle();
 assert.equal(first.published.length,1);assert.match(first.e.state().notice.text,/Loading their version/);
 const next=await editor(JSON.stringify(winner,null,2),{store,start:false});
 return next;
}
test('#1253 item 23 a replay with nothing left pending does not ask to Save again',async()=>{
 const winner=spec();winner.page.sections[0].diagram.nodes.web.tickets=['ABC-1'];
 const b=await conflictThenReplay(e=>e.add(WEB,'ABC-1'),winner);
 const state=b.e.state();assert.ok(state.notice,'the replay explains itself');
 assert.equal(state.pending,0);assert.equal(state.active,false,'Edit mode is off');
 assert.doesNotMatch(state.notice.text,/Save again/,'nothing is pending, so there is nothing to save');
 assert.match(state.notice.text,/already in their version/,'the change already in the winning version is named as such');
 assert.doesNotMatch(state.notice.text,/1 of your changes was re-applied/,'an already-true change is not counted as re-applied');
});
test('#1253 item 23 a replay that leaves a change pending still asks to Save again',async()=>{
 const b=await conflictThenReplay(e=>e.add(WEB,'ABC-1'),spec());
 const state=b.e.state();assert.equal(state.pending,1);assert.equal(state.active,true);
 assert.match(state.notice.text,/1 of your changes was re-applied/);assert.match(state.notice.text,/Save again\.$/);
});
test('#1253 item 3 review: a remove then an add of the same ticket cancels only with the ticket back in its place',async()=>{
 const url='https://jira.test/browse/PAY-1',raw=spec();raw.page.sections[0].diagram.nodes.pay.tickets=[url,'PAY-9'];const text=JSON.stringify(raw,null,2);
 const b=await editor(text);
 assert.equal(b.e.remove(PAY,'PAY-1'),true,'a ticket authored as a browse URL can be removed');assert.deepEqual(b.node('pay').tickets,['PAY-9']);
 assert.equal(b.e.add(PAY,'PAY-1'),true);
 assert.deepEqual(b.node('pay').tickets,[url,'PAY-9'],'the removed entry comes back where it was, as it was');
 assert.deepEqual(JSON.parse(b.e.text()),raw,'the spec is the original again');assert.equal(b.e.state().pending,0);
 b.e.save();await settle();assert.equal(b.published.length,0,'nothing to publish');
});
test('#1253 item 3 review: a pair that cannot restore the earlier tickets stays recorded, so Save records it',async()=>{
 const raw=spec();raw.page.sections[0].diagram.nodes.pay.tickets=['PAY-1','PAY-9'];
 const b=await editor(JSON.stringify(raw,null,2));
 // A change in between: the add puts PAY-1 back at its place, but PAY-5 is there now, so the tickets differ from
 // what they were before the remove and both stay recorded.
 b.e.remove(PAY,'PAY-1');b.e.add(PAY,'PAY-5');b.e.add(PAY,'PAY-1');
 assert.deepEqual(b.node('pay').tickets,['PAY-1','PAY-9','PAY-5']);
 assert.equal(b.e.state().pending,3,'every step stays recorded');
 b.e.save();await settle();const saved=JSON.parse(b.published[0]);
 assert.deepEqual(saved.page.sections[0].diagram.nodes.pay.tickets,['PAY-1','PAY-9','PAY-5'],'what is saved is what was shown');
 assert.deepEqual(saved.page.editHistory.at(-1).changes.map(c=>c.op+' '+c.ticket),['remove PAY-1','add PAY-5','add PAY-1'],'the history records each step');
});
