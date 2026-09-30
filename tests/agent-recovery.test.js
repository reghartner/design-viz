'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function load(){const context={Math,JSON,Promise};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench/agent-recovery.js'),'utf8'),context);return context;}
test('recovery cache persists preferences and unsent text independently of connection source',()=>{
  const c=load(),values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},r=c.createWorkbenchAgentRecovery({storage});
  assert.equal(r.read(),null);r.save({workflow:'embedded',level:'engineering',draft:'Do not lose my question',sourceKey:'old-story',draftSourceKey:'edited-story',folderName:'flowview-session-safe',sessionId:'s1',at:123,transcript:[{role:'user',text:'Hello',requestId:'r1'}]});
  const record=r.read();assert.equal(record.workflow,'embedded');assert.equal(record.level,'engineering');assert.equal(record.draft,'Do not lose my question');assert.equal(record.sourceKey,'old-story');assert.equal(record.draftSourceKey,'edited-story');assert.equal(record.transcript[0].text,'Hello');
  assert.equal(c.folderAgentSourceKey('{"title":"A"}'),c.folderAgentSourceKey('{"title":"A"}'));
  assert.notEqual(c.folderAgentSourceKey('{"title":"A"}'),c.folderAgentSourceKey('{"title":"B"}'));
});
test('recovery preserves the draft with bounded plain history and no handles or source copies',()=>{
  const c=load(),record=c.folderAgentRecoveryRecord({level:'admin',draft:'x'.repeat(20000),source:'private spec',transcript:Array.from({length:110},()=>({role:'assistant',text:'<script>x()</script>'.repeat(5000),unsafe:'ignored'})),changes:[{id:'p1',status:'applied',source:'private spec',summary:'s'.repeat(3000)}]});
  assert.equal(record.level,'story');assert.equal(record.draft,'x'.repeat(20000));assert.ok(record.transcript.reduce((n,m)=>n+m.text.length,0)<=180000);assert.ok(record.transcript.length<=100);
  assert.equal(record.source,undefined);assert.equal(record.transcript[0].unsafe,undefined);assert.equal(record.changes[0].source,undefined);assert.equal(record.changes[0].summary.length,2000);
  assert.equal(c.folderAgentRecoveryRecord(null),null);
});
test('unavailable or exhausted browser storage does not prevent a conversation',async()=>{
  const c=load(),r=c.createWorkbenchAgentRecovery({storage:{getItem(){throw Error('Denied');},setItem(){throw Error('Quota');}}});
  assert.equal(r.read(),null);assert.equal(r.save({draft:'Keep in textarea'}),false);assert.equal(await r.handle(),null);assert.equal(await r.remember({},'s1'),null);
});
test('directory handle storage never queries or requests filesystem permission',async()=>{
  const c=load();let stored,permissionCalls=0;
  const handle={requestPermission(){permissionCalls++;},queryPermission(){permissionCalls++;}};
  const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(_,mode){const transaction={objectStore(){return {get(){const op={};queueMicrotask(()=>{op.result=stored;op.onsuccess();transaction.oncomplete();});return op;},put(value){stored=value;const op={};queueMicrotask(()=>{op.onsuccess();transaction.oncomplete();});return op;}};}};return transaction;}};request.onsuccess();});return request;}};
  const r=c.createWorkbenchAgentRecovery({indexedDB});assert.equal(await r.remember(handle,'s1'),true);assert.equal((await r.handle()).handle,handle);assert.equal(permissionCalls,0);
});
