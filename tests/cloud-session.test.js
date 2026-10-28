const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('src/workbench/cloud-session.js','utf8'),ctx);let current={source:'source',ledger:'coverage',topologyContext:null},recovery,states=[],uploads=[],calls=[],meta={projectId:'p',revision:1,name:'Project'},id=0,api=async(method,path,body)=>{calls.push({method,path,body});if(path==='/uploads')return {uploadUrl:'upload',operationId:body.operationId};if(path.endsWith('/commit'))return {...meta};if(path.includes('/projects/'))return {...meta,downloadUrl:'read'};};const options={snapshot:()=>current,archive:()=>{},replace:v=>{current={source:v.source,ledger:v.ledger,topologyContext:v.topologyContext};session.detach();},api:(...args)=>api(...args),upload:async(url,v)=>uploads.push(v),download:async()=>({version:1,source:'online',ledger:'online ledger',topologyContext:null}),uuid:()=>String(++id),recover:v=>recovery=v,clearRecovery:()=>recovery=null,status:s=>states.push(s)};const session=ctx.createCloudProjectSession(options);return {session,options,calls,uploads,states,get current(){return current;},set current(v){current=v;},get recovery(){return recovery;},set api(v){api=v;},meta};}
test('coherent source/ledger snapshots, no duplicate autosave, raw invalid drafts accepted',async()=>{
 const f=setup();await f.session.save('Project');assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].source,'source');assert.equal(f.uploads[0].ledger,'coverage');await f.session.save();assert.equal(f.uploads.length,1);
 f.current={source:'{ unfinished',ledger:'new coverage'};f.session.changed();await f.session.save();assert.equal(f.uploads[1].source,'{ unfinished');assert.equal(f.uploads[1].ledger,'new coverage');assert.equal(f.states.at(-1).state,'saved');
});
test('failed save retries same operation and artifact pair before any newer draft',async()=>{
 const f=setup();let fail=true;f.options.upload=async(_url,v)=>{f.uploads.push(v);if(fail)throw Error('offline');};await f.session.save('Project');assert.equal(f.states.at(-1).state,'failed');
 const operation=f.recovery.operation.operationId;f.current={source:'new',ledger:'new notes'};f.session.changed();fail=false;await f.session.save();
 assert.equal(f.calls.filter(c=>c.path==='/uploads')[1].body.operationId,operation);assert.equal(f.uploads[1].source,'source');assert.equal(f.uploads[1].ledger,'coverage');assert.equal(f.uploads[2].source,'new');assert.equal(f.states.at(-1).state,'saved');
});
test('late save cannot attach over replacement/signout; late project load cannot overwrite local typing',async()=>{
 const f=setup(),held=deferred();f.api=async()=>held.promise;const job=f.session.save('old');f.session.detach();f.current={source:'new',ledger:'notes'};held.resolve({uploadUrl:'x'});await job;assert.equal(f.session.attachment(),null);assert.equal(f.uploads.length,0);
 const g=setup(),read=deferred();g.options.download=()=>read.promise;const open=g.session.open('p');await Promise.resolve();await Promise.resolve();g.current={source:'typed',ledger:'notes'};g.session.changed();read.resolve({version:1,source:'online',ledger:'x',topologyContext:null});assert.equal(await open,false);assert.equal(g.current.source,'typed');
});
test('conflict preserves working draft and retry operation; copy gets fresh identity',async()=>{
 const f=setup();await f.session.save('Project');f.current={source:'mine',ledger:'mine notes'};f.api=async()=>{const error=Error('conflict');error.status=409;throw error;};await f.session.save();assert.equal(f.states.at(-1).state,'conflict');assert.equal(f.current.source,'mine');assert.equal(f.recovery.envelope.ledger,'mine notes');
 let prepared;f.api=async(method,path,body)=>{if(path==='/uploads'){prepared=body;return {uploadUrl:'x'};}return {projectId:'copy',revision:1,name:'Copy'};};await f.session.copy('Copy');assert.equal(prepared.projectId,null);assert.equal(prepared.baseRevision,0);assert.equal(f.session.attachment().projectId,'copy');
});
test('recovery storage failure blocks destructive open and leaves source untouched',async()=>{
 const f=setup();f.options.archive=()=>{throw Error('recovery full');};assert.equal(await f.session.open('other'),false);assert.equal(f.current.source,'source');assert.equal(f.calls.length,0);assert.match(f.states.at(-1).detail,/recovery full/);
});
test('opening installs paired envelope, restores saved revision, and detaches old save lifetime',async()=>{
 const f=setup();assert.equal(await f.session.open('p'),true);assert.equal(f.current.source,'online');assert.equal(f.current.ledger,'online ledger');assert.equal(f.session.attachment().revision,1);await f.session.save();assert.equal(f.uploads.length,0);
});
test('browser recovery failure does not block safe cloud saving; destructive switching still refuses',async()=>{
 const f=setup();f.options.recover=()=>{throw Error('Browser recovery unavailable');};await f.session.save('Project');assert.equal(f.uploads.length,1);assert.equal(f.states.at(-1).state,'saved');assert.match(f.states.at(-1).detail,/recovery unavailable/);
 f.current={source:'new draft',ledger:'new ledger'};await f.session.save();assert.equal(f.uploads.length,2);assert.equal(f.states.at(-1).state,'saved');assert.equal(await f.session.open('other'),false);assert.equal(f.current.source,'new draft');
});
