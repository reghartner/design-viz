'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
  const context={TextEncoder,SyntaxError};vm.createContext(context);
  for(const file of ['agent-session.js','folder-agent.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench',file),'utf8'),context);
  const disk=new Map(),writes=[],updates=[];let time=100000,number=0,source='{"title":"before"}',project=1,busy=false,open=true,level='story',selection=[{kind:'node',id:'customer'}],views=[],failure=null,gate=null,writeGate=null;
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const files={async read(name){if(gate)await gate(name);const value=disk.get(name);if(value instanceof Error)throw value;return copy(value)||null;},
    async readText(name){if(gate)await gate(name);return disk.has(name)?String(disk.get(name)):null;},
    async write(name,value,guard){if(writeGate)await writeGate(name);if(guard)await guard();if(failure===name){failure=null;throw Error('Disk unavailable');}disk.set(name,copy(value));}};
  const options={files,level:()=>level,now:()=>time,uuid:()=>`id-${++number}`,snapshot:()=>({source,project,open,selection,views}),busy:()=>busy,
    apply(text){writes.push(text);source=text;return {ok:true,rendered:true};},changed:s=>updates.push(copy(s))};
  let client=context.createFolderAgentClient(options);
  const h={disk,writes,updates,files,context,client,get last(){return updates.at(-1);},fresh(){return context.createFolderAgentClient(options);},
    level:s=>level=s,selection:s=>selection=s,views:s=>views=s,type:s=>source=s,project:()=>project++,busy:b=>busy=b,open:b=>open=b,advance:n=>time+=n,fail:n=>failure=n,gate:g=>gate=g,writeGate:g=>writeGate=g,
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
for(const blocked of ['owner read','queued poll'])test('send freezes selection and detail before '+blocked,async()=>{
  const h=harness();await h.client.start();
  const selection=[{kind:'node',id:'customer',label:'Original customer'}],views=[{section:0,path:'normal',sourceStep:2}];
  h.selection(selection);h.views(views);
  let release,reached;const hit=new Promise(r=>reached=r);
  h.gate(name=>name==='session.json'?new Promise(r=>{release=r;reached();}):null);
  let polling,sending;
  if(blocked==='queued poll'){polling=h.client.poll();await hit;sending=h.client.send('Use the selection I sent');}
  else{sending=h.client.send('Use the selection I sent');await hit;}
  h.level('engineering');selection[0].id='changed';views[0].path='alternate';h.gate(null);release();
  if(polling)await polling;await sending;
  const sent=h.disk.get('request.json');
  assert.equal(sent.technicalLevel,'story');assert.equal(sent.selection[0].id,'customer');assert.equal(sent.views[0].path,'normal');
  assert.equal(h.last.transcript.at(-1).context.technicalLevel,'story');assert.equal(h.last.transcript.at(-1).context.selection[0].id,'customer');
  h.reply();await h.client.poll();await h.client.send('Now use the next context');
  const next=h.disk.get('request.json');assert.equal(next.technicalLevel,'engineering');assert.equal(next.selection[0].id,'changed');assert.equal(next.views[0].path,'alternate');
});
test('source changes while Send awaits folder ownership do not publish old focus with a new story',async()=>{
  const h=harness();await h.client.start();let release,reached;const hit=new Promise(r=>reached=r);
  h.gate(name=>name==='session.json'?new Promise(r=>{release=r;reached();}):null);
  const sending=h.client.send('Change the selected customer');await hit;
  h.type('{"title":"User replaced the story"}');h.selection([{kind:'node',id:'new-target'}]);h.gate(null);release();
  await assert.rejects(sending,/story changed while saving/i);assert.equal(h.disk.has('request.json'),false);assert.equal(h.last.pending,null);assert.equal(h.writes.length,0);
  await h.client.send('Use the replacement story');assert.equal(h.disk.get('request.json').selection[0].id,'new-target');
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

test('cancelled startup and project changes during reads never publish a connected session',async()=>{
  for(const action of ['disconnect','destroy','project']){
    const h=harness();let release,reached;const hit=new Promise(r=>reached=r);
    h.gate(name=>name==='session.json'?new Promise(r=>{release=r;reached();}):null);
    const starting=h.client.start();await hit;
    let closing;if(action==='project')h.project();else closing=h.client[action]();
    h.gate(null);release();await assert.rejects(starting,/closed|same project|Project changed/);await closing;
    assert.equal(h.disk.size,0,action+' must leave no source or session files');
  }
});


test('session preview is read-only, validates identity, and exposes a recoverable conversation',async()=>{
  const h=harness();await h.client.start();await h.client.send('Our goal');await h.client.disconnect();
  const before=JSON.stringify([...h.disk]);
  const preview=await h.context.inspectFolderAgentSession(h.files,{source:'other'},()=>100000);
  assert.equal(preview.savedSource,h.disk.get('state.json').source);assert.equal(preview.sourceMatches,false);
  assert.equal(preview.lease.active,false);assert.equal(preview.transcript[0].text,'Our goal');assert.equal(JSON.stringify([...h.disk]),before);
  h.disk.set('state.json',{...h.disk.get('state.json'),connectionId:'other'});
  await assert.rejects(h.context.inspectFolderAgentSession(h.files,{}),/snapshot/);
});
test('explicit current draft recovery archives the saved source and refuses a changed preview',async()=>{
  const h=harness();await h.client.start();await h.client.send('Earlier');await h.client.disconnect();
  const saved=h.disk.get('state.json'),next=h.fresh();h.type('{"title":"local edit"}');
  await assert.rejects(next.start(true,{resumeSource:'current',expectedSavedSource:saved.source,expectedSavedRevision:'old'}),/changed since/);
  assert.equal(h.disk.get('story.spec.json'),saved.source);
  await next.start(true,{resumeSource:'current',expectedSavedSource:saved.source,expectedSavedRevision:saved.revision});
  assert.equal(h.disk.get('story.spec.json'),'{"title":"local edit"}');
  assert.equal([...h.disk].filter(([name])=>/^saved-story-.*\.spec\.json$/.test(name))[0][1],saved.source);
  assert.equal(h.last.pending,null);assert.equal(h.last.transcript[0].text,'Earlier');
});
test('explicit saved story recovery requires caller restoration and failed archival leaves session untouched',async()=>{
  const h=harness();await h.client.start();await h.client.disconnect();const saved=h.disk.get('state.json'),owner=h.disk.get('session.json');h.type('{}');
  const choice={resumeSource:'saved',expectedSavedSource:saved.source,expectedSavedRevision:saved.revision};
  await assert.rejects(h.fresh().start(true,choice),/Open story/);
  h.writeGate(name=>{if(name.startsWith('saved-story-'))throw Error('Archive unavailable');});
  await assert.rejects(h.fresh().start(true,{...choice,resumeSource:'current'}),/Archive unavailable/);
  assert.deepEqual(h.disk.get('session.json'),owner);assert.equal(h.disk.get('story.spec.json'),saved.source);
  h.writeGate(null);h.type(saved.source);await h.fresh().start(true,choice);assert.equal(h.last.connected,true);
});
test('recovery rejects a session changed after preview while preserving the current draft',async()=>{
  const h=harness();await h.client.start();await h.client.disconnect();const saved=h.disk.get('state.json');h.type('{}');
  let reads=0;h.gate(name=>{if(name==='session.json' && ++reads===3)h.disk.set('state.json',{...saved,source:'changed elsewhere'});});
  await assert.rejects(h.fresh().start(true,{resumeSource:'current',expectedSavedSource:saved.source,expectedSavedRevision:saved.revision}),/changed during recovery/);
  assert.equal(h.disk.get('state.json').source,'changed elsewhere');assert.equal(h.writes.length,0);
});
test('stopping wins delayed proposal, progress, and final reply reads and isolates the next turn',async()=>{
  for(const filename of ['proposal.json','progress.json','reply.json']){
    const h=harness();await h.client.start();await h.client.send('Stop this');
    if(filename==='proposal.json')h.proposal();h.reply();
    h.disk.set('progress.json',h.envelope({id:'late-progress',requestId:h.last.pending,text:'Too late'}));
    const oldRequest=h.last.pending;let release,reached;const hit=new Promise(r=>reached=r);
    h.gate(name=>name===filename?new Promise(r=>{release=r;reached();}):null);
    const polling=h.client.poll();await hit;const cancelled=h.client.cancel();assert.equal(h.last.pending,null,filename);
    h.gate(null);release();await polling;await cancelled;
    assert.equal(h.writes.length,0,filename);assert.equal(h.last.transcript.length,1);assert.equal(h.last.transcript[0].cancelled,true);
    assert.equal(h.disk.get('cancel.json').requestId,oldRequest);await h.client.send('Correct next turn');await h.client.poll();
    assert.equal(h.last.transcript.length,2);assert.notEqual(h.last.pending,oldRequest);assert.equal(h.last.activity.length,0);
  }
});
test('stopping during a delayed receipt preserves the applied receipt and clears its exchange result',async()=>{
  const h=harness();await h.client.start();await h.client.send('Change');h.proposal({summary:'Add one moment'});
  let release,reached;const hit=new Promise(r=>reached=r);
  h.writeGate(name=>name==='result.json'?new Promise(r=>{release=r;reached();}):null);
  const polling=h.client.poll();await hit;assert.equal(h.writes.length,1);const cancelled=h.client.cancel();
  h.writeGate(null);release();await polling;await cancelled;assert.equal(h.last.changes.length,1);assert.equal(h.last.changes[0].status,'applied');
  await h.client.send('A different turn');h.proposal({id:'proposal-2'});await h.client.poll();
  assert.equal(h.disk.get('result.json').id,'proposal-2');assert.equal(h.last.changes.length,2);
});
test('stopping an in-flight send invalidates it before the watcher can accept later output',async()=>{
  const h=harness();await h.client.start();let release,reached;const hit=new Promise(r=>reached=r);
  h.writeGate(name=>name==='request.json'?new Promise(r=>{release=r;reached();}):null);
  const sending=h.client.send('Cancel before publication finishes');await hit;const id=h.last.pending;const cancelling=h.client.cancel();
  assert.equal(h.last.pending,null);h.writeGate(null);release();await assert.rejects(sending,/stopped/);await cancelling;
  assert.equal(h.disk.get('cancel.json').requestId,id);h.proposal();h.reply();await h.client.poll();assert.equal(h.writes.length,0);
});
test('persistent change receipts survive final replies and reconnect without storing full sources',async()=>{
  const h=harness();await h.client.start();await h.client.send('Edit');h.proposal({summary:'Customer label clarified'});await h.client.poll();h.reply();await h.client.poll();
  const receipt=h.last.changes[0];assert.equal(receipt.summary,'Customer label clarified');assert.equal(receipt.status,'applied');assert.equal(receipt.source,undefined);
  await h.client.disconnect();await h.fresh().start(true);assert.deepEqual(h.last.changes[0],receipt);
});
test('ledger is bounded inert text with honest provenance and ownership/lifetime gates',async()=>{
  const h=harness();await h.client.start();assert.equal(await h.client.readLedger(),null);
  h.disk.set('story.ledger.md','# Intent\n<script>never execute</script>');const ledger=await h.client.readLedger();
  assert.equal(ledger.text,h.disk.get('story.ledger.md'));assert.equal(ledger.verified,false);assert.equal(ledger.sourceRevision,null);assert.equal(ledger.sourceMatches,null);assert.ok(ledger.sharedRevision);
  h.disk.set('story.ledger.md','é'.repeat(140000));await assert.rejects(h.client.readLedger(),/256 KiB/);
  h.disk.set('story.ledger.md','safe');let release,reached;const hit=new Promise(r=>reached=r);
  h.gate(name=>name==='story.ledger.md'?new Promise(r=>{release=r;reached();}):null);const reading=h.client.readLedger();await hit;
  const closing=h.client.disconnect();h.gate(null);release();assert.equal(await reading,null);await closing;
});
test('preflight and reported permission-needed progress are surfaced without claiming model execution',async()=>{
  const h=harness();await h.client.start();await h.client.send('Please work');
  h.disk.set('preflight.json',h.envelope({ready:false,at:100000,checks:[{id:'monitor',status:'unverified',message:'Claude must confirm Monitor.'}]}));
  h.disk.set('progress.json',h.envelope({id:'permission',requestId:h.last.pending,text:'Approve reading the selected source in Claude.',phase:'permission-needed'}));
  await h.client.poll();assert.equal(h.last.activityPhase,'permission-needed');assert.equal(h.last.preflight.ready,false);
  h.disk.set('progress.json',h.envelope({id:'working',requestId:h.last.pending,text:'Permission granted; checking story.',phase:'working'}));
  await h.client.poll();assert.equal(h.last.activityPhase,'responding');
});


test('optional proposal review waits without losing progress, validates acceptance, and keeps automatic mode default',async()=>{
  const h=harness();await h.client.start();h.client.setReviewMode(true);await h.client.send('Edit');h.proposal();
  h.disk.set('listener.json',h.envelope({listening:true,at:100000}));
  h.disk.set('progress.json',h.envelope({id:'review-progress',requestId:h.last.pending,text:'Ready for your review'}));
  h.reply();await h.client.poll();assert.equal(h.writes.length,0);assert.equal(h.last.review.id,'proposal-1');
  assert.equal(h.last.listening,true);assert.equal(h.last.activity.length,1);assert.ok(h.last.pending);
  await h.client.acceptReview();assert.equal(h.writes.length,1);assert.equal(h.last.review,null);assert.equal(h.last.pending,null);
  assert.equal(h.last.changes[0].status,'applied');
  await h.client.send('Manual conflict');h.proposal({id:'stale-review'});await h.client.poll();h.type('manual source');
  await h.client.acceptReview();assert.equal(h.writes.length,1);assert.equal(h.last.changes.at(-1).status,'rejected');
});
test('review approval binds the entire proposal and never accepts same-ID content swaps or a cancelled turn',async()=>{
  const h=harness();await h.client.start();h.client.setReviewMode(true);await h.client.send('Edit');h.proposal();await h.client.poll();
  h.proposal({source:'{"swapped":true}'});h.client.setReviewMode(false);await h.client.acceptReview();
  assert.equal(h.writes.length,0);assert.ok(h.last.review,'A held review must stay held after mode is turned off and its content changes');
  await h.client.cancel();assert.equal(h.last.review,null);assert.equal(await h.client.acceptReview(),false);
  await h.client.poll();assert.equal(h.writes.length,0);
});
test('declining review publishes an explicit rejection and retries a failed acknowledgement',async()=>{
  const h=harness();await h.client.start();h.client.setReviewMode(true);await h.client.send('Edit');h.proposal();await h.client.poll();
  h.fail('result.json');await assert.rejects(h.client.rejectReview(),/Disk/);assert.equal(h.writes.length,0);
  await h.client.poll();assert.equal(h.disk.get('result.json').status,'rejected');assert.match(h.disk.get('result.json').message,/declined/);
  assert.equal(h.last.changes.length,1);assert.equal(h.last.review,null);h.reply();await h.client.poll();assert.equal(h.last.pending,null);
});


test('review content is inert and stable across polls, and a changed payload increments its version',async()=>{
  const h=harness();await h.client.start();h.client.setReviewMode(true);await h.client.send('Inspect');h.proposal();await h.client.poll();
  const version=h.last.review.version;assert.equal(h.client.reviewContent(),'{"title":"after"}');
  await h.client.poll();assert.equal(h.last.review.version,version);
  h.proposal({source:'{"title":"Changed proposal"}'});
  await h.client.poll();assert.ok(h.last.review.version>version);assert.equal(JSON.parse(h.client.reviewContent()).title,'Changed proposal');
  await h.client.cancel();assert.equal(h.client.reviewContent(),'');
});
test('cancellation persists an applied receipt after the initial receipt storage failed',async()=>{
  const h=harness();await h.client.start();await h.client.send('Change');h.proposal();h.fail('changes.json');await assert.rejects(h.client.poll(),/Disk/);
  assert.equal(h.writes.length,1);assert.equal(h.disk.has('changes.json'),false);await h.client.cancel();
  assert.equal(h.disk.get('changes.json').changes[0].status,'applied');assert.equal(h.last.pending,null);
});
test('recovery detects a competing owner while saving its archive',async()=>{
  const h=harness();await h.client.start();await h.client.disconnect();const saved=h.disk.get('state.json');h.type('{}');
  h.writeGate(name=>{if(name.startsWith('saved-story-'))h.disk.set('session.json',{...h.disk.get('session.json'),connectionId:'new-owner'});});
  await assert.rejects(h.fresh().start(true,{resumeSource:'current',expectedSavedSource:saved.source,expectedSavedRevision:saved.revision}),/snapshot|changed/);
  assert.equal(h.disk.get('session.json').connectionId,'new-owner');assert.equal(h.disk.get('story.spec.json'),saved.source);
});

test('every failed resume publication phase remains inspectable and explicitly resumable without replay',async()=>{
  // Staged snapshot, claim manifest, canonical state, source, lease, committed manifest.
  for(let failurePhase=1;failurePhase<=6;failurePhase++){
    const h=harness();await h.client.start();await h.client.send('Saved conversation');h.proposal();await h.client.disconnect();
    let writes=0;h.writeGate(()=>{if(++writes===failurePhase)throw Error('Injected startup write failure');});
    const failed=h.fresh();await assert.rejects(failed.start(true),/startup write failure/,String(failurePhase));
    await failed.disconnect();h.writeGate(null);
    const preview=await h.context.inspectFolderAgentSession(h.files,{source:h.disk.get('story.spec.json')});
    assert.equal(preview.transcript[0].text,'Saved conversation',String(failurePhase));
    assert.equal(preview.lease.active,false,String(failurePhase));
    const recovered=h.fresh();await recovered.start(true);await recovered.poll();
    assert.equal(h.last.connected,true,String(failurePhase));assert.equal(h.last.pending,null);assert.equal(h.writes.length,0);
  }
});
test('failed resume remains recoverable after persistent permission loss prevents all cleanup writes',async()=>{
  const h=harness();await h.client.start();await h.client.send('Keep this intent');await h.client.disconnect();
  const priorConnection=h.disk.get('state.json').connectionId;let blocked=false;
  h.writeGate(name=>{if(name==='state.json' || blocked){blocked=true;throw Object.assign(Error('Permission lost'),{name:'NotAllowedError'});}});
  const failed=h.fresh();await assert.rejects(failed.start(true),/Permission lost/);await assert.rejects(failed.disconnect(),/Permission lost/);
  assert.equal(h.disk.get('state.json').connectionId,priorConnection);assert.notEqual(h.disk.get('session.json').connectionId,priorConnection);
  h.writeGate(null);const preview=await h.context.inspectFolderAgentSession(h.files,{source:h.disk.get('story.spec.json')});
  assert.equal(preview.identity.connectionId,h.disk.get('session.json').connectionId);assert.equal(preview.transcript[0].text,'Keep this intent');
  await h.fresh().start(true);assert.equal(h.last.connected,true);
});
test('cancelled resume publication does not poison saved files at any write boundary',async()=>{
  for(let phase=1;phase<=6;phase++){
    const h=harness();await h.client.start();await h.client.send('Saved');await h.client.disconnect();
    let writes=0,release,reached;const hit=new Promise(r=>reached=r);
    h.writeGate(()=>++writes===phase?new Promise(r=>{release=r;reached();}):null);
    const next=h.fresh(),starting=next.start(true);await hit;const closing=next.disconnect();release();
    await assert.rejects(starting,/closed/);await closing;h.writeGate(null);
    const preview=await h.context.inspectFolderAgentSession(h.files,{source:h.disk.get('story.spec.json')});
    assert.equal(preview.transcript[0].text,'Saved',String(phase));await h.fresh().start(true);assert.equal(h.last.connected,true);
  }
});
test('a competing owner wins at every delayed resume write without rollback or publication stomping its files',async()=>{
  for(let phase=1;phase<=6;phase++){
    const h=harness();await h.client.start();await h.client.disconnect();let writes=0,release,reached;const hit=new Promise(r=>reached=r);
    h.writeGate(()=>++writes===phase?new Promise(r=>{release=r;reached();}):null);
    const next=h.fresh(),starting=next.start(true);await hit;
    const owner={protocol:'flowview-folder-v1',sessionId:'other-session',connectionId:'other-connection'},state={...owner,revision:'other-1',source:'{"owner":"new"}'};
    h.disk.set('session.json',owner);h.disk.set('state.json',state);h.disk.set('story.spec.json',state.source);h.disk.set('editor.json',{...owner,connected:true,at:100000});
    const protectedFiles=['session.json','state.json','story.spec.json','editor.json'].map(name=>[name,JSON.stringify(h.disk.get(name))]);
    release();await assert.rejects(starting,/ownership changed/,String(phase));await next.disconnect();h.writeGate(null);
    for(const [name,value] of protectedFiles)assert.equal(JSON.stringify(h.disk.get(name)),value,phase+': '+name);
  }
});
test('recovery snapshots must match the exact manifest identity and never relax committed-session checks',async()=>{
  const h=harness();await h.client.start();await h.client.disconnect();h.fail('state.json');await assert.rejects(h.fresh().start(true),/Disk/);
  const owner=h.disk.get('session.json'),staged=h.disk.get(owner.recoveryState);
  h.disk.set(owner.recoveryState,{...staged,connectionId:'foreign'});
  await assert.rejects(h.context.inspectFolderAgentSession(h.files,{}),/snapshot.*invalid/);
  h.disk.set(owner.recoveryState,staged);h.disk.set('state.json',new SyntaxError('empty interrupted creation'));
  assert.equal((await h.context.inspectFolderAgentSession(h.files,{})).identity.connectionId,owner.connectionId);
  h.disk.set('session.json',{...owner,recoveryState:'../escape.json'});
  await assert.rejects(h.context.inspectFolderAgentSession(h.files,{}),/empty interrupted creation/);
  h.disk.set('state.json',{...staged,connectionId:'foreign'});const committed={...owner};delete committed.recoveryState;h.disk.set('session.json',committed);
  await assert.rejects(h.context.inspectFolderAgentSession(h.files,{}),/snapshot.*invalid/);
});
test('directory write guards recheck after buffering and abort before commit when ownership changes',async()=>{
  const h=harness();let owned=true,aborted=false,committed=false;
  const directory={async getFileHandle(){return {async createWritable(){return {
    async write(){owned=false;},async close(){committed=true;},async abort(){aborted=true;}
  };}};}};
  const files=h.context.createFolderAgentFiles(directory);
  await assert.rejects(files.write('state.json',{},()=>{if(!owned)throw Error('Another owner');}),/Another owner/);
  assert.equal(aborted,true);assert.equal(committed,false);
});

test('uncertain write failures after publication also preserve an explicitly recoverable session',async()=>{
  for(let phase=1;phase<=6;phase++){
    const h=harness();await h.client.start();await h.client.send('Survive an uncertain close');await h.client.disconnect();
    const originalWrite=h.files.write;let writes=0;
    h.files.write=async function(name,value,guard){await originalWrite(name,value,guard);if(++writes===phase)throw Error('Write committed before error');};
    const failed=h.fresh();await assert.rejects(failed.start(true),/committed before error/);await failed.disconnect();h.files.write=originalWrite;
    const preview=await h.context.inspectFolderAgentSession(h.files,{source:h.disk.get('story.spec.json')});
    assert.equal(preview.transcript[0].text,'Survive an uncertain close',String(phase));
    await h.fresh().start(true);assert.equal(h.last.connected,true);assert.equal(h.last.pending,null);
  }
});


test('same-identity reactivation during staging or manifest buffering defeats the new claim',async()=>{
  for(const boundary of ['staged snapshot','buffered manifest'])for(const change of ['lease','source','revision','all']){
    const h=harness();await h.client.start();await h.client.send('Saved');await h.client.disconnect();
    const owner=h.disk.get('session.json'),originalWrite=h.files.write;let protectedFiles=null,changed=false;
    function reactivate(){
      changed=true;
      if(change==='lease' || change==='all')h.disk.set('editor.json',{...owner,connected:true,at:100000});
      if(change==='source' || change==='all'){
        h.disk.set('state.json',{...h.disk.get('state.json'),source:'{"title":"Latest work from original owner"}'});
        h.disk.set('story.spec.json',h.disk.get('state.json').source);
      }
      if(change==='revision' || change==='all')h.disk.set('state.json',{...h.disk.get('state.json'),revision:'reactivated-revision'});
      protectedFiles=['session.json','state.json','story.spec.json','editor.json'].map(name=>[name,JSON.stringify(h.disk.get(name))]);
    }
    h.files.write=async function(name,value,guard){
      if(!changed && boundary==='staged snapshot' && /^state-id-.*\.json$/.test(name)){
        await originalWrite(name,value,guard);reactivate();return;
      }
      if(!changed && boundary==='buffered manifest' && name==='session.json'){
        // Mirror createFolderAgentFiles: guard, buffer, guard, atomic close.
        await guard();reactivate();await guard();
      }
      return originalWrite(name,value,guard);
    };
    const next=h.fresh();await assert.rejects(next.start(true),/saved session changed/,boundary+': '+change);
    await next.disconnect();assert.equal(changed,true);
    for(const [name,value] of protectedFiles)assert.equal(JSON.stringify(h.disk.get(name)),value,boundary+': '+change+': '+name);
  }
});


test('native file creation exposes an empty placeholder until close without breaking a new claim',async()=>{
  const h=harness(),disk=new Map();let sawPlaceholder=false;
  function missing(){return Object.assign(Error('Missing file'),{name:'NotFoundError'});}
  const directory={
    async getFileHandle(name,options){
      if(!disk.has(name)){if(!options || !options.create)throw missing();disk.set(name,'');}
      return {
        async getFile(){const text=disk.get(name);if(name==='session.json' && text==='')sawPlaceholder=true;return {size:Buffer.byteLength(text),async text(){return text;}};},
        async createWritable(){let buffer='';return {async write(text){buffer=text;},async close(){disk.set(name,buffer);},async abort(){}};}
      };
    },
    async removeEntry(name){if(!disk.delete(name))throw missing();}
  };
  const files=h.context.createFolderAgentFiles(directory),options={files,snapshot:()=>({source:'{"title":"Native files"}',project:1,open:true}),
    now:()=>100000,uuid:(()=>{let id=0;return()=>`native-${++id}`;})(),busy:()=>false,apply:()=>({ok:true})};
  const client=h.context.createFolderAgentClient(options);await client.start(false);
  assert.equal(sawPlaceholder,true);const owner=JSON.parse(disk.get('session.json')),state=JSON.parse(disk.get('state.json'));
  assert.equal(state.connectionId,owner.connectionId);assert.equal(owner.recoveryState,undefined);
  assert.equal([...disk.keys()].some(name=>/^state-native-.*\.json$/.test(name)),false);
  await client.disconnect();await h.context.createFolderAgentClient(options).start(true);
  // A malformed entry that was already present is never mistaken for our creation.
  disk.set('session.json','');const before=[...disk];
  await assert.rejects(h.context.createFolderAgentClient(options).start(false),{name:'SyntaxError'});
  assert.deepEqual([...disk],before);
});
