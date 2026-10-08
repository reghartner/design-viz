'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(extra={}){
  const context={TextEncoder,SyntaxError};vm.createContext(context);
  for(const file of ['agent-merge.js','agent-session.js','folder-agent.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench',file),'utf8'),context);
  const disk=new Map(),writes=[],updates=[];let time=100000,number=0,source='{"title":"before"}',ledger,project=1,busy=false,open=true,level='story',selection=[{kind:'node',id:'customer'}],views=[],failure=null,gate=null,writeGate=null;
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  // Like the directory adapter, guards learn whether this write created the file.
  const files={async read(name){if(gate)await gate(name);const value=disk.get(name);if(value instanceof Error)throw value;return copy(value)||null;},
    async readText(name){if(gate)await gate(name);return disk.has(name)?String(disk.get(name)):null;},
    async write(name,value,guard){if(writeGate)await writeGate(name);if(guard)await guard({name,created:!disk.has(name),phase:'before-write'});if(failure===name){failure=null;throw Error('Disk unavailable');}disk.set(name,copy(value));}};
  const options={reviewMode:false,...extra,files,level:()=>level,now:()=>time,uuid:()=>`id-${++number}`,snapshot:()=>({source,ledger,project,open,selection,views}),busy:()=>busy,
    apply(text){writes.push(text);source=text;return {ok:true,rendered:true};},changed:s=>updates.push(copy(s))};
  let client=context.createFolderAgentClient(options);
  const h={disk,writes,updates,files,context,client,get last(){return updates.at(-1);},fresh(){return context.createFolderAgentClient(options);},
    level:s=>level=s,notes:s=>ledger=s,selection:s=>selection=s,views:s=>views=s,type:s=>source=s,project:()=>project++,busy:b=>busy=b,open:b=>open=b,advance:n=>time+=n,fail:n=>failure=n,gate:g=>gate=g,writeGate:g=>writeGate=g,
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
  h.type('{}');await assert.rejects(h.fresh().start(true),/story changed during resume/);h.type(h.disk.get('state.json').source);
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
  await assert.rejects(h.fresh().start(true,choice),/story changed during resume/);
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


test('optional proposal review waits without losing progress, validates acceptance, and refreshes before accepting after further edits',async()=>{
  const h=harness();await h.client.start();h.client.setReviewMode(true);await h.client.send('Edit');h.proposal();
  h.disk.set('listener.json',h.envelope({listening:true,at:100000}));
  h.disk.set('progress.json',h.envelope({id:'review-progress',requestId:h.last.pending,text:'Ready for your review'}));
  h.reply();await h.client.poll();assert.equal(h.writes.length,0);assert.equal(h.last.review.id,'proposal-1');
  assert.equal(h.last.listening,true);assert.equal(h.last.activity.length,1);assert.ok(h.last.pending);
  await h.client.acceptReview();assert.equal(h.writes.length,1);assert.equal(h.last.review,null);assert.equal(h.last.pending,null);
  assert.equal(h.last.changes[0].status,'applied');
  await h.client.send('Manual conflict');h.proposal({id:'stale-review'});await h.client.poll();h.type('manual source');
  await h.client.acceptReview();assert.equal(h.writes.length,1);assert.equal(h.last.review.ok,false);assert.match(h.last.review.conflicts[0].reason,/JSON/);
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
  // An abandoned empty placeholder can be claimed again; nonempty corruption stays an error.
  disk.set('session.json','');await h.context.createFolderAgentClient(options).start(false);
  disk.set('session.json','{broken');const before=[...disk];
  await assert.rejects(h.context.createFolderAgentClient(options).start(false),{name:'SyntaxError'});
  assert.deepEqual([...disk],before);
});

test('default folder workflow holds all proposals, merges separate changes and commits exact preview once',async()=>{
  const h=harness({reviewMode:undefined});h.type('{"nodes":{"a":{"title":"A"},"b":{"title":"B"}}}');await h.client.start();await h.client.send('Edit B');
  const base=h.disk.get('state.json').revision;h.type('{"nodes":{"a":{"title":"Human A"},"b":{"title":"B"}}}');
  h.proposal({baseRevision:base,source:'{"nodes":{"a":{"title":"A"},"b":{"title":"Agent B"}}}'});await h.client.poll();
  assert.equal(h.writes.length,0);assert.equal(h.last.review.merged,true);assert.equal(h.last.review.ok,true);
  const expected=h.client.reviewContent();assert.equal(JSON.parse(expected).nodes.a.title,'Human A');
  const version=h.last.review.version;assert.equal(await h.client.acceptReview(version+1),false);assert.equal(h.writes.length,0);
  await h.client.acceptReview(version);assert.equal(h.writes.length,1);assert.equal(h.writes[0],expected);assert.equal(h.disk.get('result.json').baseRevision,base);
  await h.client.poll();assert.equal(h.writes.length,1);
});
test('overlapping changes stay pending for feedback and cannot be committed',async()=>{
  const h=harness({reviewMode:true});await h.client.start();await h.client.send('Edit');h.proposal();h.type('{"title":"human"}');await h.client.poll();
  assert.equal(h.last.review.ok,false);assert.equal(h.last.review.conflicts[0].path,'/title');assert.equal(await h.client.acceptReview(),false);
  const version=h.last.review.version;await h.client.rejectReview('Please reconcile /title with my latest story.',version);
  assert.equal(h.writes.length,0);assert.match(h.disk.get('result.json').message,/reconcile/);
});
test('a local edit during commit I/O invalidates approval and produces a new preview',async()=>{
  const h=harness({reviewMode:true});h.type('{"a":1,"b":1}');await h.client.start();await h.client.send('Edit');h.proposal({source:'{"a":1,"b":2}'});await h.client.poll();
  const version=h.last.review.version;let release,reached;const hit=new Promise(r=>reached=r);
  h.gate(name=>name==='session.json'?new Promise(r=>{release=r;reached();}):null);
  const committing=h.client.acceptReview(version);await hit;h.type('{"a":2,"b":1}');h.gate(null);release();await committing;
  assert.equal(h.writes.length,0);assert.ok(h.last.review.version>version);assert.deepEqual(JSON.parse(h.client.reviewContent()),{a:2,b:2});
});
test('copy delivery freezes explicit nodes and native reply surface without a second send',async()=>{
  const h=harness({reviewMode:true});await h.client.start();const focus={source:h.disk.get('state.json').source,project:1,selection:[{kind:'node',id:'specific'}],replySurface:'agent',delivery:'clipboard'};
  const request=await h.client.send('Copy this',focus);assert.equal(request.delivery,'clipboard');assert.equal(request.replySurface,'agent');assert.equal(request.selection[0].id,'specific');
  assert.equal(h.disk.get('request.json').id,request.id);await assert.rejects(h.client.send('Second'),/Wait/);
});
test('native requests are accepted only in external workflow, once and before their deadline',async()=>{
  const h=harness({workflow:'external',reviewMode:true});await h.client.start();
  h.disk.set('agent-request.json',h.envelope({id:'native-1',text:'Make the change discussed in my agent',expiresAt:108000}));await h.client.poll();
  assert.equal(h.last.pending,'native-1');assert.equal(h.disk.get('request.json').delivery,'native');h.reply();await h.client.poll();await h.client.poll();assert.equal(h.last.pending,null);
  h.disk.set('agent-request.json',h.envelope({id:'expired',text:'Do not start later',expiresAt:99999}));await h.client.poll();assert.equal(h.last.pending,null);
  h.disk.set('agent-request.json',h.envelope({id:'foreign',connectionId:'other',text:'Ignore',expiresAt:108000}));await h.client.poll();assert.equal(h.last.pending,null);
  const embedded=harness({workflow:'embedded'});await embedded.client.start();embedded.disk.set('agent-request.json',embedded.envelope({id:'native',text:'Ignore',expiresAt:108000}));await embedded.client.poll();assert.equal(embedded.last.pending,null);
});

test('review retains a later planning baseline while many human edits arrive',async()=>{
  const h=harness({reviewMode:true});h.type('{"a":0,"b":0}');await h.client.start();await h.client.send('Edit B');
  h.type('{"a":1,"b":0}');await h.client.poll();const base=h.disk.get('state.json').revision;
  h.proposal({baseRevision:base,source:'{"a":1,"b":2}'});await h.client.poll();assert.equal(h.last.review.ok,true);
  for(let i=2;i<45;i++){h.type(JSON.stringify({a:i,b:0}));await h.client.poll();}
  assert.equal(h.last.review.ok,true);assert.deepEqual(JSON.parse(h.client.reviewContent()),{a:44,b:2});
  await h.client.acceptReview();assert.deepEqual(JSON.parse(h.writes[0]),{a:44,b:2});
});

test('a busy commit consumes approval and cannot apply after closing its preview',async()=>{
  const h=harness({reviewMode:true});await h.client.start();await h.client.send('Edit');h.proposal();await h.client.poll();
  h.busy(true);assert.equal(await h.client.acceptReview(),false);assert.equal(h.writes.length,0);
  h.busy(false);await h.client.poll();assert.equal(h.writes.length,0);
  await h.client.acceptReview();assert.equal(h.writes.length,1);
});

for(const phase of ['before close','after close'])test('native expiry '+phase+' does not leave a pending turn or report lost folder access',async()=>{
  const h=harness({workflow:'external',reviewMode:true});await h.client.start();
  h.disk.set('agent-request.json',h.envelope({id:'expiring',text:'Too late',expiresAt:108000}));
  if(phase==='before close')h.writeGate(name=>{if(name==='request.json')h.advance(9000);});
  else{const write=h.files.write;h.files.write=async(...args)=>{await write(...args);if(args[0]==='request.json')h.advance(9000);};}
  await h.client.poll();assert.equal(h.last.pending,null);assert.equal(h.last.accessError,undefined);assert.match(h.last.status,/expired.*retry/i);
  if(phase==='after close')assert.equal(h.disk.get('cancel.json').requestId,'expiring');
});

test('a native timeout withdrawal clears an accepted but unacknowledged turn and accepts a retry',async()=>{
  const h=harness({workflow:'external',reviewMode:true});await h.client.start();
  h.disk.set('agent-request.json',h.envelope({id:'late',text:'Late ack',expiresAt:108000}));await h.client.poll();assert.equal(h.last.pending,'late');
  h.disk.set('agent-request.json',h.envelope({id:'late',text:'Late ack',expiresAt:0,withdrawn:true}));await h.client.poll();
  assert.equal(h.last.pending,null);assert.equal(h.disk.get('cancel.json').requestId,'late');assert.equal(h.last.transcript[0].cancelled,true);
  h.disk.set('agent-request.json',h.envelope({id:'retry',text:'Try again',expiresAt:108000}));await h.client.poll();assert.equal(h.last.pending,'retry');
});

test('native request pins the exact published revision despite edits during its disk read',async()=>{
  const h=harness({workflow:'external',reviewMode:true});h.type('{"a":0,"b":0}');await h.client.start();
  const base=h.disk.get('state.json').revision;
  h.disk.set('agent-request.json',h.envelope({id:'planning',text:'Edit B',expiresAt:108000}));
  h.gate(name=>{if(name==='agent-request.json')h.type('{"a":1,"b":0}');});await h.client.poll();h.gate(null);
  assert.equal(h.disk.get('request.json').revision,base);
  // The seed is the pinned base the proposal will merge from, not the newer edit.
  assert.equal(h.disk.get(h.disk.get('request.json').candidate.spec),'{"a":0,"b":0}');
  for(let i=2;i<45;i++){h.type(JSON.stringify({a:i,b:0}));await h.client.poll();}
  h.proposal({baseRevision:base,source:'{"a":0,"b":2}'});await h.client.poll();
  assert.equal(h.last.review.ok,true);assert.deepEqual(JSON.parse(h.client.reviewContent()),{a:44,b:2});
});

test('send seeds the exact pinned pair under request names before publishing its metadata',async()=>{
  const h=harness(),ledger='# Coverage ledger\n\nCustomer evidence — keep “exact” bytes.\n';
  h.type('{"title":"before",  "nodes":{"customer":{"title":"Customer"}}}\n');h.notes(ledger);await h.client.start();
  const order=[];let atPublication=null;
  h.writeGate(name=>{order.push(name);if(name==='request.json')atPublication=[...h.disk].filter(([name])=>name.startsWith('candidate-'));});
  const returned=await h.client.send('Rename the customer');h.writeGate(null);
  const request=h.disk.get('request.json'),state=h.disk.get('state.json');
  const candidate={spec:`candidate-${request.id}.spec.json`,ledger:`candidate-${request.id}.ledger.md`,baseRevision:state.revision};
  assert.deepEqual(request.candidate,candidate);assert.deepEqual({...returned.candidate},candidate);assert.equal(request.revision,state.revision);
  assert.deepEqual(request.selection,[{kind:'node',id:'customer'}]);
  assert.deepEqual(order.filter(name=>name.startsWith('candidate-') || name==='request.json'),[candidate.spec,candidate.ledger,'request.json']);
  assert.deepEqual(atPublication,[[candidate.spec,state.source],[candidate.ledger,ledger]]);
  assert.equal(state.ledger,ledger);assert.equal(h.disk.get('story.spec.json'),state.source);assert.equal(h.writes.length,0);
});
test('registered Copy and native begin seed the same exact pair as Send and keep their selection',async()=>{
  const ledger='# Ledger\n\nCopy and native evidence.\n';
  const copied=harness({reviewMode:true});copied.notes(ledger);await copied.client.start();
  const selection=[{kind:'node',id:'specific',label:'Specific'}];
  const focus={source:copied.disk.get('state.json').source,project:1,selection,replySurface:'agent',delivery:'clipboard'};
  const request=await copied.client.send('Copy this',focus),published=copied.disk.get('request.json');
  assert.deepEqual(published.selection,selection);assert.deepEqual({...request.candidate},published.candidate);
  assert.deepEqual(published.candidate,{spec:`candidate-${published.id}.spec.json`,ledger:`candidate-${published.id}.ledger.md`,baseRevision:published.revision});
  assert.equal(copied.disk.get(published.candidate.spec),copied.disk.get('state.json').source);assert.equal(copied.disk.get(published.candidate.ledger),ledger);
  const native=harness({workflow:'external',reviewMode:true});native.notes(ledger);await native.client.start();
  native.disk.set('agent-request.json',native.envelope({id:'native-1',text:'Edit from my agent',expiresAt:108000}));await native.client.poll();
  const begun=native.disk.get('request.json');assert.equal(native.last.pending,'native-1');assert.deepEqual(begun.selection,[]);
  assert.deepEqual(begun.candidate,{spec:'candidate-native-1.spec.json',ledger:'candidate-native-1.ledger.md',baseRevision:begun.revision});
  assert.equal(native.disk.get(begun.candidate.spec),native.disk.get('state.json').source);assert.equal(native.disk.get(begun.candidate.ledger),ledger);
});
test('pending requests and existing candidate files are never reseeded or replaced',async()=>{
  const h=harness();await h.client.start();await h.client.send('First');
  const first=h.disk.get('request.json'),n=Number(first.id.slice(3)),work='{"title":"agent work in progress"}';
  h.disk.set(first.candidate.spec,work);
  await assert.rejects(h.client.send('Second'),/Wait/);await h.client.poll();
  assert.equal(h.disk.get(first.candidate.spec),work);assert.equal(h.disk.get('request.json').id,first.id);
  h.reply();await h.client.poll();assert.equal(h.last.pending,null);
  // A file already at the next request's name is not assumed to be ours.
  h.disk.set(`candidate-id-${n+1}.ledger.md`,'someone else’s notes');
  await assert.rejects(h.client.send('Third'),/already exists/);
  assert.equal(h.disk.get('request.json').id,first.id);assert.equal(h.last.pending,null);
  assert.equal(h.disk.has(`candidate-id-${n+1}.spec.json`),false);assert.equal(h.disk.get(`candidate-id-${n+1}.ledger.md`),'someone else’s notes');
  // A file created after the existence check is detected before it is written.
  h.writeGate(name=>{if(name===`candidate-id-${n+2}.ledger.md`)h.disk.set(name,'raced notes');});
  await assert.rejects(h.client.send('Fourth'),/appeared/);h.writeGate(null);
  assert.equal(h.disk.get(`candidate-id-${n+2}.ledger.md`),'raced notes');assert.equal(h.disk.get('request.json').id,first.id);assert.equal(h.last.pending,null);
  await h.client.send('Fifth');assert.equal(h.disk.get('request.json').candidate.spec,`candidate-id-${n+3}.spec.json`);
  assert.equal(h.disk.get(first.candidate.spec),work);
  const native=harness({workflow:'external',reviewMode:true});await native.client.start();native.disk.set('candidate-taken.spec.json','existing');
  native.disk.set('agent-request.json',native.envelope({id:'taken',text:'Edit',expiresAt:108000}));await native.client.poll();
  assert.equal(native.last.pending,null);assert.match(native.last.status,/already exists.*retry/);assert.equal(native.disk.has('request.json'),false);
  await native.client.poll();assert.equal(native.disk.has('request.json'),false);assert.equal(native.disk.get('candidate-taken.spec.json'),'existing');
});
test('a stopped request keeps its own candidate names and cannot reach the next request’s files',async()=>{
  const h=harness();h.notes('# Ledger\n');await h.client.start();
  let release,reached;const hit=new Promise(r=>reached=r);
  h.writeGate(name=>name.startsWith('candidate-') && name.endsWith('.ledger.md')?new Promise(r=>{release=r;reached();}):null);
  const sending=h.client.send('Stopped while seeding');await hit;const stopped=h.last.pending,cancelling=h.client.cancel();
  h.writeGate(null);release();await assert.rejects(sending,/stopped/);await cancelling;
  assert.equal(h.disk.has('request.json'),false);assert.equal(h.disk.get('cancel.json').requestId,stopped);
  assert.equal(h.disk.get(`candidate-${stopped}.spec.json`),h.disk.get('state.json').source);assert.equal(h.disk.has(`candidate-${stopped}.ledger.md`),false);
  await h.client.send('Second turn');const second=h.disk.get('request.json');assert.notEqual(second.id,stopped);
  assert.equal(h.disk.has(`candidate-${stopped}.ledger.md`),false);
  await h.client.cancel();await h.client.send('Third turn');const third=h.disk.get('request.json');
  // The stopped agent may keep editing its own copies; the new pair stays exact.
  h.disk.set(second.candidate.spec,'{"late":"stale agent"}');
  assert.notEqual(third.candidate.spec,second.candidate.spec);assert.notEqual(third.candidate.ledger,second.candidate.ledger);
  assert.equal(h.disk.get(third.candidate.spec),h.disk.get('state.json').source);assert.equal(h.disk.get(third.candidate.ledger),'# Ledger\n');
  h.disk.set('proposal.json',h.envelope({id:'late',requestId:second.id,baseRevision:second.revision,source:'{"late":"stale agent"}'}));
  await h.client.poll();assert.equal(h.writes.length,0);assert.equal(h.last.pending,third.id);
});
test('source, ledger, project or owner drift during preparation publishes no request',async()=>{
  for(const drift of ['source','ledger','project','owner'])for(const phase of ['write','reread','publication']){
    const h=harness(),label=drift+' during '+phase;h.notes('# Ledger\n');await h.client.start();const accepted=h.disk.get('story.spec.json');let done=false;
    function change(){
      if(done)return;done=true;
      if(drift==='source')h.type('{"title":"human edit"}');else if(drift==='ledger')h.notes('# Ledger\n\nHuman note.\n');
      else if(drift==='project')h.project();else h.disk.set('session.json',{...h.disk.get('session.json'),connectionId:'other'});
    }
    if(phase==='write')h.writeGate(name=>{if(name.startsWith('candidate-') && name.endsWith('.ledger.md'))change();});
    if(phase==='reread')h.gate(name=>{if(name.startsWith('candidate-') && h.disk.has(name))change();});
    if(phase==='publication')h.writeGate(name=>{if(name==='request.json')change();});
    await assert.rejects(h.client.send('Edit'),drift==='owner'?/ownership changed/:/changed while preparing/,label);h.gate(null);h.writeGate(null);
    assert.equal(done,true,label);assert.equal(h.disk.has('request.json'),false,label);assert.equal(h.last.pending,null,label);
    assert.equal(h.writes.length,0,label);assert.equal(h.disk.get('story.spec.json'),accepted,label);
    if(drift==='source' || drift==='ledger'){
      await h.client.send('Retry');const retry=h.disk.get('request.json'),state=h.disk.get('state.json');
      assert.equal(h.disk.get(retry.candidate.spec),state.source,label);assert.equal(h.disk.get(retry.candidate.ledger),state.ledger,label);
    }
  }
  const native=harness({workflow:'external',reviewMode:true});await native.client.start();
  native.writeGate(name=>{if(name.startsWith('candidate-'))native.type('{"title":"typing during begin"}');});
  native.disk.set('agent-request.json',native.envelope({id:'drifted',text:'Edit',expiresAt:108000}));await native.client.poll();native.writeGate(null);
  assert.equal(native.last.pending,null);assert.match(native.last.status,/changed while preparing/);assert.equal(native.disk.has('request.json'),false);
  await native.client.poll();assert.equal(native.disk.has('request.json'),false);
  native.disk.set('agent-request.json',native.envelope({id:'retry',text:'Edit',expiresAt:108000}));await native.client.poll();assert.equal(native.last.pending,'retry');
});
test('partial candidate writes or inexact rereads leave no authorized request',async()=>{
  const h=harness();h.notes('# Ledger\n');await h.client.start();const n=Number(h.client.manifest().connectionId.slice(3));
  h.fail(`candidate-id-${n+1}.ledger.md`);await assert.rejects(h.client.send('Edit'),/Disk/);
  assert.equal(h.disk.has('request.json'),false);assert.equal(h.last.pending,null);
  // The partial seed is left for inspection, never deleted or reused.
  assert.equal(h.disk.get(`candidate-id-${n+1}.spec.json`),h.disk.get('state.json').source);assert.equal(h.disk.has(`candidate-id-${n+1}.ledger.md`),false);
  const raw=h.files.readText;
  h.files.readText=async name=>{const text=await raw(name);return text!==null && name.startsWith('candidate-')?text+' ':text;};
  await assert.rejects(h.client.send('Edit'),/not the exact story copy/);
  h.files.readText=async name=>{if(name.startsWith('candidate-') && h.disk.has(name))throw Object.assign(Error('Unreadable'),{name:'NotReadableError'});return raw(name);};
  await assert.rejects(h.client.send('Edit'),/Unreadable/);
  delete h.files.readText;await assert.rejects(h.client.send('Edit'),/raw folder reads/);
  assert.equal(h.disk.has('request.json'),false);assert.equal(h.last.pending,null);assert.equal(h.writes.length,0);
  h.files.readText=raw;await h.client.send('Edit');assert.equal(h.disk.get('request.json').id,`id-${n+5}`);
  const native=harness({workflow:'external',reviewMode:true});await native.client.start();native.fail('candidate-partial.ledger.md');
  native.disk.set('agent-request.json',native.envelope({id:'partial',text:'Edit',expiresAt:108000}));await assert.rejects(native.client.poll(),/Disk/);
  assert.equal(native.disk.has('request.json'),false);assert.equal(native.last.pending,null);
  await native.client.poll();assert.equal(native.disk.has('request.json'),false);
});
test('an invalid draft is seeded verbatim so its repair can be requested and applied',async()=>{
  const h=harness({validate:text=>{try{JSON.parse(text);return null;}catch{return 'Invalid JSON';}}});await h.client.start();
  let flushed=0;h.files.flushArtifacts=async()=>{flushed++;};
  const broken='{"title": "missing brace"';h.type(broken);await h.client.send('Repair my JSON');
  const request=h.disk.get('request.json');assert.equal(flushed,0);
  assert.equal(h.disk.get(request.candidate.spec),broken);assert.equal(h.disk.get(request.candidate.ledger),'');
  h.proposal({baseRevision:request.candidate.baseRevision,source:'{"title": "missing brace"}'});await h.client.poll();
  assert.deepEqual(h.writes,['{"title": "missing brace"}']);assert.equal(h.disk.get('result.json').status,'applied');
});
test('a seeded pair edited in place flows through the existing preview and explicit Commit once',async()=>{
  const h=harness({reviewMode:undefined});h.type('{"nodes":{"a":{"title":"A"},"b":{"title":"B"}}}');h.notes('# Ledger\n\nA and B covered.\n');
  await h.client.start();await h.client.send('Rename B');
  const {spec,ledger,baseRevision}=h.disk.get('request.json').candidate;
  h.disk.set(spec,h.disk.get(spec).replace('"B"}','"Agent B"}'));h.disk.set(ledger,h.disk.get(ledger)+'B renamed at the user’s request.\n');
  h.type('{"nodes":{"a":{"title":"Human A"},"b":{"title":"B"}}}');
  h.proposal({baseRevision,source:h.disk.get(spec),ledger:h.disk.get(ledger)});await h.client.poll();
  assert.equal(h.writes.length,0);assert.equal(h.last.review.ok,true);assert.equal(h.last.review.merged,true);
  const expected=h.client.reviewContent();assert.deepEqual(JSON.parse(expected),{nodes:{a:{title:'Human A'},b:{title:'Agent B'}}});
  await h.client.acceptReview(h.last.review.version);assert.deepEqual(h.writes,[expected]);
  assert.equal(h.disk.get('result.json').status,'applied');assert.equal(h.disk.get('result.json').baseRevision,baseRevision);
  await h.client.poll();assert.equal(h.writes.length,1);assert.match(h.disk.get(spec),/Agent B/);
});
test('the directory adapter refuses candidate work that appears between lookups or before close',async()=>{
  for(const race of ['second lookup','before close']){
    const h=harness();await h.client.start();let raced=null;
    const missing=()=>Object.assign(Error('Missing'),{name:'NotFoundError'});
    // Like File System Access: create makes an empty entry; bytes land on close.
    const directory={async getFileHandle(name,options){
      if(options?.create && race==='second lookup' && name.endsWith('.ledger.md') && !raced){raced=name;h.disk.set(name,'agent work');}
      if(!h.disk.has(name)){if(!options?.create)throw missing();h.disk.set(name,'');}
      return {async getFile(){const text=h.disk.get(name);return {size:new TextEncoder().encode(text).length,text:async()=>text};},
        async createWritable(){let buffered=null;return {
          async write(text){buffered=text;if(race==='before close' && name.endsWith('.ledger.md') && !raced){raced=name;h.disk.set(name,'agent work');}},
          async close(){h.disk.set(name,buffered);},async abort(){}};}};
    }};
    const real=h.context.createFolderAgentFiles(directory),{write,readText}=h.files;
    h.files.write=(name,...rest)=>(name.startsWith('candidate-')?real.write:write)(name,...rest);
    h.files.readText=(name,...rest)=>(name.startsWith('candidate-')?real.readText:readText)(name,...rest);
    await assert.rejects(h.client.send('Edit'),/appeared/,race);
    assert.equal(h.disk.get(raced),'agent work',race);assert.equal(h.disk.has('request.json'),false,race);assert.equal(h.last.pending,null,race);
    // The spec's own empty placeholder was filled; nothing else was replaced.
    assert.equal(h.disk.get(raced.replace('.ledger.md','.spec.json')),h.disk.get('state.json').source,race);
  }
});
test('candidate edits during request publication publish no request and keep the edit',async()=>{
  for(const change of ['edited','removed']){
    const h=harness();h.notes('# Ledger\n');await h.client.start();let touched=null;
    h.writeGate(name=>{
      if(name!=='request.json')return;
      touched=[...h.disk.keys()].find(item=>item.startsWith('candidate-') && item.endsWith('.ledger.md'));
      if(change==='edited')h.disk.set(touched,'# Foreign edit\n');else h.disk.delete(touched);
    });
    await assert.rejects(h.client.send('Edit'),/not the exact story copy/,change);h.writeGate(null);
    assert.equal(h.disk.has('request.json'),false,change);assert.equal(h.last.pending,null,change);
    assert.equal(h.disk.get(touched),change==='edited'?'# Foreign edit\n':undefined,change);
    await h.client.send('Retry');const retry=h.disk.get('request.json');
    assert.notEqual(retry.candidate.ledger,touched,change);assert.equal(h.disk.get(touched),change==='edited'?'# Foreign edit\n':undefined,change);
  }
  const native=harness({workflow:'external',reviewMode:true});await native.client.start();
  native.writeGate(name=>{if(name==='request.json')native.disk.set('candidate-drifted.spec.json','{"foreign":true}');});
  native.disk.set('agent-request.json',native.envelope({id:'drifted',text:'Edit',expiresAt:108000}));await native.client.poll();native.writeGate(null);
  assert.equal(native.last.pending,null);assert.match(native.last.status,/not the exact story copy/);assert.equal(native.disk.has('request.json'),false);
  await native.client.poll();assert.equal(native.disk.has('request.json'),false);assert.equal(native.disk.get('candidate-drifted.spec.json'),'{"foreign":true}');
});
test('only an accepted publication pins its base for proposals after many edits',async()=>{
  const h=harness({reviewMode:true});h.type('{"a":0,"b":0}');await h.client.start();
  h.fail('request.json');await assert.rejects(h.client.send('Edit B'),/Disk/);assert.equal(h.last.pending,null);
  await h.client.send('Edit B');const request=h.disk.get('request.json');
  // More than 32 later revisions evict the base from history; only the pin keeps it.
  for(let i=1;i<45;i++){h.type(JSON.stringify({a:i,b:0}));await h.client.poll();}
  h.proposal({baseRevision:request.candidate.baseRevision,source:'{"a":0,"b":2}'});await h.client.poll();
  assert.equal(h.last.review.ok,true);assert.deepEqual(JSON.parse(h.client.reviewContent()),{a:44,b:2});
  // A turn stopped during publication is not accepted, so its late proposal never applies.
  await h.client.cancel();let release,reached;const hit=new Promise(r=>reached=r);
  h.writeGate(name=>name==='request.json'?new Promise(r=>{release=r;reached();}):null);
  const sending=h.client.send('Stopped at publication');await hit;const stopped=h.last.pending,cancelling=h.client.cancel();
  h.writeGate(null);release();await assert.rejects(sending,/stopped/);await cancelling;
  const published=h.disk.get('request.json');assert.equal(published.id,stopped);
  h.proposal({id:'late',requestId:stopped,baseRevision:published.revision,source:'{"a":44,"b":3}'});await h.client.poll();
  assert.equal(h.writes.length,0);assert.equal(h.last.review,null);
});

function pilotReceipt(h,extra={}){return h.envelope({schema:'flowview-pilot-status-v1',jobId:'a'.repeat(32),outcome:'pending',updatedAt:100000,expiresAt:220000,deadlineAt:145000,...extra});}
test('pilot health starts unknown and only admits current connection metadata',async()=>{
  const h=harness();await h.client.start();assert.equal(h.last.pilotStatus,null);
  const reads=[];h.gate(name=>reads.push(name));
  h.disk.set('pilot-status.json',pilotReceipt(h,{transcript:'private',tokens:{input:44},model:'private-model',nativeSessionId:'private-native'}));
  await h.client.poll();assert.deepEqual(h.last.pilotStatus,{jobId:'a'.repeat(32),updatedAt:100000,outcome:'pending'});
  assert.equal(reads.some(name=>/agent\.(usage|transcript)|flowview-pilot|after-turn/.test(name)),false);
  h.disk.set('pilot-status.json',pilotReceipt(h,{connectionId:'old',outcome:'captured'}));await h.client.poll();assert.equal(h.last.pilotStatus,null);
  h.disk.set('pilot-status.json',pilotReceipt(h,{sessionId:'foreign',outcome:'captured'}));await h.client.poll();assert.equal(h.last.pilotStatus,null);
});
test('pending pilot receipt expires as unverified and old checkpoints become stale',async()=>{
  const h=harness();await h.client.start();h.disk.set('pilot-status.json',pilotReceipt(h));await h.client.poll();
  h.advance(45001);await h.client.poll();assert.equal(h.last.pilotStatus.outcome,'timeout_response_pending');
  h.disk.set('pilot-status.json',pilotReceipt(h,{outcome:'captured'}));await h.client.poll();assert.equal(h.last.pilotStatus.outcome,'captured');
  h.advance(75000);await h.client.poll();assert.equal(h.last.pilotStatus.outcome,'stale');
});
test('invalid or missing pilot receipt clears prior observation without breaking folder work',async()=>{
  const h=harness();await h.client.start();h.disk.set('pilot-status.json',pilotReceipt(h,{outcome:'captured'}));await h.client.poll();
  for(const invalid of [null,new SyntaxError('partial write'),Error('pilot-status.json exceeds limit'),pilotReceipt(h,{updatedAt:106000}),pilotReceipt(h,{expiresAt:500000}),pilotReceipt(h,{deadlineAt:160000}),pilotReceipt(h,{jobId:'bad'}),pilotReceipt(h,{outcome:'active'})]){
    h.disk.set('pilot-status.json',invalid);await h.client.poll();assert.equal(h.last.pilotStatus,null);assert.equal(h.last.connected,true);
  }
});
test('disconnect and reconnect clear pilot observation even if old receipt stays on disk',async()=>{
  const h=harness();await h.client.start();h.disk.set('pilot-status.json',pilotReceipt(h,{outcome:'captured'}));await h.client.poll();
  await h.client.disconnect();assert.equal(h.last.pilotStatus,null);
  await h.client.start(true);assert.equal(h.last.pilotStatus,null);await h.client.poll();assert.equal(h.last.pilotStatus,null);
});
test('held pilot read cannot revive health after disconnect or lost ownership',async()=>{
  const h=harness();await h.client.start();h.disk.set('pilot-status.json',pilotReceipt(h,{outcome:'captured'}));
  let release,entered;const waiting=new Promise(resolve=>entered=resolve);
  h.gate(name=>name==='pilot-status.json'?new Promise(resolve=>{release=resolve;entered();}):undefined);
  const polling=h.client.poll();await waiting;const disconnecting=h.client.disconnect();release();await polling;await disconnecting;assert.equal(h.last.pilotStatus,null);
  h.gate(null);await h.client.start(true);h.disk.set('pilot-status.json',pilotReceipt(h,{outcome:'captured'}));
  h.gate(name=>{if(name==='pilot-status.json')h.disk.set('session.json',{...h.disk.get('session.json'),connectionId:'new-owner'});});
  await h.client.poll();assert.equal(h.last.connected,false);assert.equal(h.last.pilotStatus,null);
});
test('lost folder access clears last verified pilot health',async()=>{
  const h=harness();await h.client.start();h.disk.set('pilot-status.json',pilotReceipt(h,{outcome:'captured'}));await h.client.poll();
  h.disk.set('session.json',Object.assign(Error('Permission lost'),{name:'NotAllowedError'}));
  await assert.rejects(h.client.poll(),/Permission lost/);assert.equal(h.last.pilotStatus,null);
});
