'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C=vm.createContext({});vm.runInContext(readSource('workbench/working-file.js'),C);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(owner={}){
  let text='{"title":"Original"}',disk=text,denied=false,opens=0,aborts=0,closes=0;
  const states=[],gates={},handle={name:'actual.spec.json',
    async getFile(){if(gates.read)await gates.read.promise;return {text:async()=>disk};},
    async createWritable(){opens++;if(denied)throw Error('Permission denied');let buffered;
      if(gates.open)await gates.open.promise;
      return {async write(value){buffered=value;if(gates.write)await gates.write.promise;},
        async close(){if(gates.close)await gates.close.promise;disk=buffered;closes++;},async abort(){aborts++;}};},
    async requestPermission(){if(gates.permission)await gates.permission.promise;denied=false;return 'granted';}};
  const opts={owner,snapshot:()=>({text}),validate(value){JSON.parse(value);return '';},changed:value=>states.push(value)};
  const writer=C.createBuilderWorkingFile(opts);
  writer.attach({name:handle.name,handle,expected:disk});
  return {writer,handle,states,gates,owner,opts,get text(){return text;},set text(value){text=value;writer.pending();},
    get disk(){return disk;},set disk(value){disk=value;},get opens(){return opens;},get aborts(){return aborts;},get closes(){return closes;},deny(){denied=true;}};
}
test('exact valid source writes once, preserves formatting, and invalid handwriting pauses until repaired',async()=>{
  const h=fixture();await h.writer.save();assert.equal(h.opens,0);
  h.text=' { "title" : "Edited" }\n';await h.writer.save();assert.equal(h.disk,h.text);assert.equal(h.states.at(-1).state,'saved');
  h.text='{"unfinished';await h.writer.save();assert.equal(h.states.at(-1).state,'paused');assert.equal(h.disk,' { "title" : "Edited" }\n');
  h.text='{"title":"Repaired"}';await h.writer.save();assert.equal(h.disk,h.text);assert.equal(h.opens,2);
});
test('outside edits before open or during buffered write are never overwritten',async()=>{
  const h=fixture();h.text='{"title":"Local"}';h.disk='{"title":"External"}';await h.writer.save();assert.equal(h.opens,0);assert.equal(h.states.at(-1).state,'failed');await h.writer.retry();assert.equal(h.disk,'{"title":"External"}');assert.equal(h.opens,0);
  const held=fixture();held.gates.write=deferred();held.text='{"title":"Local"}';const writing=held.writer.save();await settle();held.disk='{"title":"External during stage"}';held.gates.write.resolve();await writing;
  assert.equal(held.disk,'{"title":"External during stage"}');assert.equal(held.aborts,1);assert.equal(held.closes,0);assert.match(held.states.at(-1).detail,/outside/);
});
test('replacement aborts staged old writes and drops queued writes',async()=>{
  const h=fixture();h.gates.write=deferred();h.text='{"title":"Old edit"}';const first=h.writer.save();await settle();
  h.text='{"title":"Queued old edit"}';const queued=h.writer.save();h.writer.clear();h.gates.write.resolve();await Promise.all([first,queued]);
  assert.equal(h.disk,'{"title":"Original"}');assert.equal(h.aborts,1);assert.equal(h.opens,1);assert.equal(h.states.at(-1).state,'browser');
});
test('remount waits for an already-started close and refuses a stale baseline',async()=>{
  const h=fixture();h.gates.close=deferred();h.text='{"title":"Authorized old write"}';const writing=h.writer.save();await settle();h.writer.destroy();
  const next=C.createBuilderWorkingFile(h.opts);next.attach({name:h.handle.name,handle:h.handle,expected:h.disk});
  const queued=next.save();await settle();assert.equal(h.opens,1);h.gates.close.resolve();await Promise.all([writing,queued]);
  assert.equal(h.disk,'{"title":"Authorized old write"}');assert.equal(h.opens,1);assert.equal(h.states.at(-1).state,'failed');
});
test('permission failure is latched, explicit Retry requests access, and late permission cannot retarget',async()=>{
  const h=fixture();h.text='{"title":"Local"}';h.deny();await h.writer.save();assert.equal(h.states.at(-1).state,'failed');await h.writer.save();assert.equal(h.opens,1);
  await h.writer.retry();assert.equal(h.disk,h.text);assert.equal(h.states.at(-1).state,'saved');
  h.text='{"title":"Later"}';h.gates.permission=deferred();const retry=h.writer.retry();h.writer.clear();h.gates.permission.resolve();await retry;assert.notEqual(h.disk,h.text);
});
test('folder handoff retires synchronously and waits for the old lease owner to drain',async()=>{
  const h=fixture(),closed=deferred();let stopped=false;
  h.writer.attach({name:'folder/spec.json',paired:true,flush:()=>Promise.resolve(),close(){stopped=true;return closed.promise;}});
  const drain=h.writer.clear();assert.equal(stopped,true);let finished=false;drain.then(()=>finished=true);await settle();assert.equal(finished,false);closed.resolve();await drain;
});

function exportFixture({single=false,ledger='accepted ledger'}={}){
  const source=' { "title" : "Raw formatting" }\n',disk=new Map([['raw.spec.json',source],['raw.ledger.md','accepted ledger']]);
  const fileHandle={},directory={isSameEntry:async other=>other===directory,getFileHandle:async()=>fileHandle};
  const binding=single?{handle:fileHandle}:{paired:true,handle:directory,artifacts:{spec:'raw.spec.json',ledger:'raw.ledger.md'}};
  let current=true,flush=async()=>{};
  const options={binding,directory,files:[{name:'raw.spec.json',text:'normalized'},{name:'raw.html',text:'html'},{name:'raw.ledger.md',text:ledger || 'placeholder'},{name:'README.md',text:'readme'}],
    source,ledger,current:()=>current,flush:()=>flush(),readText:async name=>disk.get(name) ?? null};
  return {disk,options,source,change(){current=false;},flush(fn){flush=fn;}};
}
test('same-folder export waits for authoritative save then verifies and skips the exact raw pair',async()=>{
  const h=exportFixture(),held=deferred();let flushed=false;h.flush(async()=>{await held.promise;flushed=true;});
  const job=C.prepareBuilderWorkingExport(h.options);await settle();assert.equal(flushed,false);held.resolve();const plan=await job;
  assert.equal(plan.skip('raw.spec.json'),true);assert.equal(plan.skip('raw.ledger.md'),true);assert.equal(plan.skip('raw.html'),false);assert.equal(plan.skip('README.md'),false);
  assert.equal(h.disk.get('raw.spec.json'),h.source);await plan.guard();h.disk.set('raw.ledger.md','outside evidence');await assert.rejects(plan.guard(),/changed during Export/);
});
test('active export refuses dirty-after-click and outside modifications without replacing the baseline',async()=>{
  const h=exportFixture(),held=deferred();h.flush(()=>held.promise);const job=C.prepareBuilderWorkingExport(h.options);await settle();h.change();held.resolve();await assert.rejects(job,/changed after Export/);
  const outside=exportFixture();outside.disk.set('raw.spec.json','external');await assert.rejects(C.prepareBuilderWorkingExport(outside.options),/changed outside/);assert.equal(outside.disk.get('raw.spec.json'),'external');
});
test('single-file export preserves unknown sibling ledger bytes instead of its placeholder',async()=>{
  const h=exportFixture({single:true,ledger:null}),notes='\ufeff# Unknown\r\nEvidence\r\n';h.disk.set('raw.ledger.md',notes);
  const plan=await C.prepareBuilderWorkingExport(h.options);assert.equal(plan.skip('raw.spec.json'),true);assert.equal(plan.skip('raw.ledger.md'),true);await plan.guard();assert.equal(h.disk.get('raw.ledger.md'),notes);
});
