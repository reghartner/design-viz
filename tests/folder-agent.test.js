'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
  const context={TextEncoder,SyntaxError};vm.createContext(context);
  for(const file of ['agent-session.js','folder-agent.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench',file),'utf8'),context);
  const disk=new Map(),writes=[],updates=[];let time=100000,number=0,source='{"title":"before"}',project=1,busy=false,open=true,level='story',failure=null,gate=null;
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const files={async read(name){if(gate)await gate(name);const value=disk.get(name);if(value instanceof Error)throw value;return copy(value)||null;},
    async write(name,value){if(failure===name){failure=null;throw Error('Disk unavailable');}disk.set(name,copy(value));}};
  const options={files,level:()=>level,now:()=>time,uuid:()=>`id-${++number}`,snapshot:()=>({source,project,open,selection:[{kind:'node',id:'customer'}],views:[]}),busy:()=>busy,
    apply(text){writes.push(text);source=text;return {ok:true,rendered:true};},changed:s=>updates.push(copy(s))};
  let client=context.createFolderAgentClient(options);
  const h={disk,writes,updates,files,context,client,get last(){return updates.at(-1);},fresh(){return context.createFolderAgentClient(options);},
    level:s=>level=s,type:s=>source=s,project:()=>project++,busy:b=>busy=b,open:b=>open=b,advance:n=>time+=n,fail:n=>failure=n,gate:g=>gate=g,
    envelope:value=>({...client.manifest(),...value}),proposal:(extra={})=>h.disk.set('proposal.json',h.envelope({id:'proposal-1',requestId:h.disk.get('request.json').id,baseRevision:h.disk.get('state.json').revision,source:'{"title":"after"}',...extra})),
    reply:(extra={})=>h.disk.set('reply.json',h.envelope({id:'reply-1',requestId:h.disk.get('request.json').id,text:'Done <script>unsafe()</script>',...extra}))};
  return h;
}
test('conversation freezes selected context, applies once, and completes through explicit reply',async()=>{
  const h=harness();await h.client.start(false);assert.equal(h.disk.get('editor.json').connected,true);
  await h.client.send('Tell our customer story');assert.equal(h.disk.get('request.json').selection[0].id,'customer');
  await assert.rejects(h.client.send('duplicate'),/Wait/);h.proposal();await h.client.poll();await h.client.poll();
  assert.equal(h.writes.length,1);assert.equal(h.disk.get('result.json').status,'applied');
  h.reply();await h.client.poll();assert.equal(h.last.pending,null);assert.equal(h.last.transcript.length,2);
  await h.client.poll();assert.equal(h.last.transcript.length,2);
  h.level('engineering');await h.client.send('Now add engineering detail');assert.equal(h.last.transcript.length,3);
  assert.equal(h.disk.get('request.json').technicalLevel,'engineering');
});
test('busy document defers a proposal; human edits reject stale replacements',async()=>{
  const h=harness();await h.client.start();await h.client.send('Edit');h.proposal();h.busy(true);await h.client.poll();assert.equal(h.writes.length,0);
  h.type('{ human typing');h.busy(false);await h.client.poll();assert.equal(h.disk.get('result.json').status,'rejected');assert.equal(h.writes.length,0);
});
test('failed receipt retries preserve the applied outcome without reapplying',async()=>{
  const h=harness();await h.client.start();await h.client.send('Edit');h.proposal();h.fail('result.json');await assert.rejects(h.client.poll(),/Disk/);
  assert.equal(h.writes.length,1);await h.client.poll();assert.equal(h.disk.get('result.json').status,'applied');assert.equal(h.writes.length,1);
});
test('wrong owner, request, malformed IDs, partial JSON and oversized UTF8 never apply',async()=>{
  const h=harness();await h.client.start();await h.client.send('Edit');
  for(const extra of [{connectionId:'old'},{sessionId:'other'},{requestId:'other'},{id:{bad:true}}]){h.proposal(extra);await h.client.poll();}
  h.disk.set('proposal.json',new SyntaxError('partial'));await h.client.poll();assert.equal(h.writes.length,0);
  h.proposal({source:'é'.repeat(3*1024*1024)});await h.client.poll();assert.equal(h.disk.get('result.json').status,'rejected');assert.equal(h.writes.length,0);
});
test('disconnect during a file read blocks late changes and preserves files',async()=>{
  const h=harness();await h.client.start();await h.client.send('Edit');h.proposal();
  let release,reached;const hit=new Promise(r=>reached=r);h.gate(name=>name==='proposal.json'?new Promise(r=>{release=r;reached();}):null);
  const polling=h.client.poll();await hit;const closing=h.client.disconnect();release();await polling;await closing;
  assert.equal(h.writes.length,0);assert.equal(h.disk.get('editor.json').connected,false);assert.ok(h.disk.has('transcript.json'));
});
test('project switches disconnect; lost ownership does not overwrite a new owner',async()=>{
  const h=harness();await h.client.start();await h.client.send('Edit');h.proposal();h.project();await h.client.poll();assert.equal(h.last.connected,false);assert.equal(h.writes.length,0);
  const next=h.fresh();await next.start(true);h.disk.set('session.json',{...next.manifest(),connectionId:'new-owner'});
  h.disk.set('editor.json',{connectionId:'new-owner',connected:true});await next.poll();await next.disconnect();assert.equal(h.disk.get('editor.json').connected,true);
});
test('resume requires matching story, rejects active owner, changes connection and never replays a request',async()=>{
  const h=harness();await h.client.start();await h.client.send('Outstanding');h.proposal();
  await assert.rejects(h.fresh().start(true),/still connected/);await h.client.disconnect();
  h.type('{}');await assert.rejects(h.fresh().start(true),/Open story/);h.type(h.disk.get('state.json').source);
  const next=h.fresh();await next.start(true);assert.notEqual(next.manifest().connectionId,h.client.manifest().connectionId);
  await next.poll();assert.equal(h.writes.length,0);assert.equal(h.last.pending,null);assert.equal(h.last.transcript.length,1);
});
test('failed initialization stays disconnected and a failed transcript write cannot send a duplicate turn',async()=>{
  const failed=harness();failed.fail('state.json');await assert.rejects(failed.client.start(),/Disk/);assert.equal(failed.last.connected,false);
  await assert.rejects(failed.client.send('No'),/Connect/);
  const h=harness();await h.client.start();h.fail('transcript.json');await assert.rejects(h.client.send('One'),/Disk/);assert.ok(h.last.pending);
  await assert.rejects(h.client.send('Two'),/Wait/);
});
test('permission failures surface; restored access recovers; no stale listener claims',async()=>{
  const h=harness();await h.client.start();h.disk.set('listener.json',h.envelope({listening:true,at:100000}));await h.client.poll();assert.equal(h.last.listening,true);
  h.advance(6000);await h.client.poll();assert.equal(h.last.listening,false);
  h.disk.set('proposal.json',Object.assign(Error('Permission revoked'),{name:'NotAllowedError'}));await assert.rejects(h.client.poll(),/revoked/);
  h.disk.delete('proposal.json');await h.client.poll();assert.equal(h.last.connected,true);
});
test('directory adapter reacquires externally replaced files and aborts failed writes',async()=>{
  const h=harness();let content='{"v":1}',reads=0,aborted=false;
  const directory={async getFileHandle(){const snapshot=content;return {async getFile(){reads++;return {size:snapshot.length,text:async()=>snapshot};},async createWritable(){return {async write(){throw Error('disk full');},async abort(){aborted=true;}};}};}};
  const files=h.context.createFolderAgentFiles(directory);assert.equal((await files.read('a')).v,1);content='{"v":2}';assert.equal((await files.read('a')).v,2);assert.equal(reads,2);
  await assert.rejects(files.write('a',{}),/disk full/);assert.equal(aborted,true);
});
test('progress bursts survive the final reply, stay ordered, and never replay on a new request',async()=>{
  const h=harness();await h.client.start();await h.client.send('Explain');
  const requestId=h.last.pending;
  h.disk.set('progress.json',h.envelope({requestId,events:[
    {id:'first',at:100000,text:'Reading the story'},
    {id:'second',at:100001,text:'Checking the customer path'}]}));
  h.reply();await h.client.poll();
  assert.deepEqual(h.last.activity.map(x=>x.text),['Reading the story','Checking the customer path']);
  assert.equal(h.last.activityPhase,'complete');assert.equal(h.last.pending,null);
  await h.client.poll();assert.equal(h.last.activity.length,2);
  await h.client.send('Next');await h.client.poll();
  assert.equal(h.last.activity.length,0);assert.equal(h.last.activityPhase,'waiting');
});
test('listener liveness never claims a model response; silence and new progress update the activity state',async()=>{
  const h=harness();await h.client.start();await h.client.send('Explain');
  h.disk.set('listener.json',h.envelope({listening:true,at:100000}));await h.client.poll();
  assert.equal(h.last.listening,true);assert.equal(h.last.agentResponded,false);assert.equal(h.last.activityPhase,'waiting');
  h.advance(31000);await h.client.poll();assert.equal(h.last.activityPhase,'quiet');assert.equal(h.last.quietSeconds,31);
  h.disk.set('progress.json',h.envelope({id:'legacy',requestId:h.last.pending,text:'Reading'}));await h.client.poll();
  assert.equal(h.last.activityPhase,'responding');assert.equal(h.last.agentResponded,true);
  h.advance(31000);await h.client.poll();assert.equal(h.last.activityPhase,'quiet');assert.equal(h.last.activity.length,1);
  await h.client.disconnect();assert.equal(h.last.activityPhase,'disconnected');
});
test('activity refuses foreign connections, wrong requests and malformed entries, and bounds retained updates',async()=>{
  const h=harness();await h.client.start();await h.client.send('Explain');
  const event={id:'update',text:'Reading'},requestId=h.last.pending;
  for(const extra of [{connectionId:'old'},{sessionId:'other'},{requestId:'other'}]){
    h.disk.set('progress.json',h.envelope({requestId,events:[event],...extra}));await h.client.poll();
    assert.equal(h.last.activity.length,0);
  }
  h.disk.set('progress.json',h.envelope({requestId,events:[null,{id:'bad',text:{}},{id:'big',text:'x'.repeat(32001)},event,event]}));
  await h.client.poll();assert.equal(h.last.activity.length,1);
  h.disk.set('progress.json',h.envelope({requestId,events:Array.from({length:120},(_,n)=>({id:'event-'+n,text:String(n)}))}));
  await h.client.poll();assert.equal(h.last.activity.length,100);assert.equal(h.last.activity[0].text,'20');
});
