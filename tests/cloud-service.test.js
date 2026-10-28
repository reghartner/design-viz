const {test}=require('node:test');const assert=require('node:assert/strict');
const load=Promise.all([import('../deploy/aws/service.mjs'),import('../deploy/aws/memory.mjs'),import('../deploy/aws/handler.mjs')]);
async function fixture(){const [S,M,H]=await load,m=M.memoryAdapters();for(const [sub,teamId,role] of [['alice','team','editor'],['bob','team','editor'],['other','other','editor'],['reader','team','reader']])m.members.set(sub,{teamId,userId:sub,role});return {...m,...S,...H,service:S.createService(m)};}
const value=source=>({version:1,source,ledger:'# Exact coverage\r\n',topologyContext:null});
async function prepare(f,{user='alice',projectId=null,baseRevision=0,operationId='save-1',name='Test'}={}){return f.service.request(user,'POST','/uploads',{operationId,projectId,baseRevision,name});}
async function save(f,v,opts){const p=await prepare(f,opts);if(p.committed)return p.committed;f.uploads.set(decodeURIComponent(p.uploadUrl.split('/').at(-1)),JSON.stringify(v));return f.service.request(opts?.user || 'alice','POST','/uploads/'+p.operationId+'/commit');}
test('shared library only explicitly invited users; unknown/disabled and another team denied',async()=>{
 const f=await fixture();await assert.rejects(f.service.request(null,'GET','/projects'),{status:401});await assert.rejects(f.service.request('unknown','GET','/projects'),{status:403});
 const p=await save(f,value('{ raw unfinished'));
 assert.equal((await f.service.request('bob','GET','/projects')).projects[0].projectId,p.projectId);
 assert.deepEqual((await f.service.request('other','GET','/projects')).projects,[]);await assert.rejects(f.service.request('other','GET','/projects/'+p.projectId),{status:404});
 await assert.rejects(prepare(f,{user:'reader'}),{status:403});await assert.rejects(f.service.request('reader','POST','/projects/'+p.projectId+'/restore',{operationId:'r',baseRevision:1,revision:1}),{status:403});
 f.members.get('alice').disabled=true;await assert.rejects(f.service.request('alice','GET','/projects'),{status:403});
});
test('raw invalid source, exact coverage and >2 MiB valid source survive outside metadata',async()=>{
 const f=await fixture(),large=JSON.stringify({page:{title:'Large',notes:'a'.repeat(3*1024*1024)}}),p=await save(f,value(large));
 assert.equal([...f.snapshots.values()][0].source,large);assert.ok(JSON.stringify([...f.projects.values()]).length<2000);
 const next=await save(f,value('{\n unfinished'),{projectId:p.projectId,baseRevision:1,operationId:'save-2'});assert.equal(next.revision,2);
 assert.equal([...f.snapshots.values()][1].ledger,'# Exact coverage\r\n');
});
test('closed schema, UTF-8 sizes, excessive source/ledger/context and malformed upload rejected',async()=>{
 const f=await fixture();for(const [i,v] of [value('x'.repeat(f.LIMITS.source+1)),{...value('ok'),ledger:'x'.repeat(f.LIMITS.ledger+1)},{...value('ok'),topologyContext:{x:'a'.repeat(f.LIMITS.context)}},{...value('ok'),transcript:'private'}, {...value('ok'),session:{}}].entries())await assert.rejects(save(f,v,{operationId:'bad'+i}),{status:400});
 assert.equal(f.projects.size,0);await assert.rejects(prepare(f,{name:'x'.repeat(241)}),{status:400});
 await assert.rejects(f.service.request('alice','POST','/uploads',{operationId:'bad-team',baseRevision:0,name:'Bad',teamId:'other'}),{status:400});
 const p=await prepare(f,{operationId:'bad-upload'});f.uploads.set(decodeURIComponent(p.uploadUrl.split('/').at(-1)),'not-json');await assert.rejects(f.service.request('alice','POST','/uploads/'+p.operationId+'/commit'),{status:400});
});
test('signed staging reuse never changes an immutable committed snapshot; repeated finalize is idempotent',async()=>{
 const f=await fixture(),p=await prepare(f),key=decodeURIComponent(p.uploadUrl.split('/').at(-1));f.uploads.set(key,JSON.stringify(value('first')));
 const first=await f.service.request('alice','POST','/uploads/save-1/commit');f.uploads.set(key,JSON.stringify(value('replacement')));
 assert.deepEqual(await f.service.request('alice','POST','/uploads/save-1/commit'),first);assert.equal([...f.snapshots.values()][0].source,'first');assert.equal(f.revisions.size,1);
 await assert.rejects(prepare(f,{name:'Different'}),{status:409});await assert.rejects(f.service.request('bob','POST','/uploads/save-1/commit'),{status:403});
});
test('two concurrent saves compare and swap; loser retains its immutable candidate',async()=>{
 const f=await fixture(),p=await save(f,value('base'));
 const attempts=await Promise.allSettled([save(f,value('Alice'),{projectId:p.projectId,baseRevision:1,operationId:'a'}),save(f,value('Bob'),{user:'bob',projectId:p.projectId,baseRevision:1,operationId:'b'})]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);const failure=attempts.find(x=>x.status==='rejected').reason;assert.equal(failure.status,409);assert.equal(failure.details.current.revision,2);assert.equal(f.revisions.size,2);
});
test('upload/snapshot/transaction failures publish no phantom revision and retry safely',async()=>{
 const f=await fixture();await prepare(f);await assert.rejects(f.service.request('alice','POST','/uploads/save-1/commit'),{status:400});assert.equal(f.revisions.size,0);
 f.faults.freeze=true;await assert.rejects(save(f,value('first')));assert.equal(f.revisions.size,0);
 f.faults.freeze=false;f.faults.commit=true;await assert.rejects(save(f,value('first')));assert.equal(f.revisions.size,0);
 // Re-upload after an uncertain failure cannot modify already frozen bytes.
 f.faults.commit=false;const p=await save(f,value('second'));assert.equal(p.revision,1);assert.equal([...f.snapshots.values()][0].source,'first');
 const ackLost=await prepare(f);assert.equal(ackLost.committed.revision,1);assert.equal(f.revisions.size,1);
});
test('restore appends revision, obeys CAS, preserves exact paired artifacts, and retries once',async()=>{
 const f=await fixture(),first=value('first'),p=await save(f,first);await save(f,value('second'),{projectId:p.projectId,baseRevision:1,operationId:'second'});
 const body={operationId:'restore',baseRevision:2,revision:1};const result=await f.service.request('alice','POST','/projects/'+p.projectId+'/restore',body);assert.equal(result.revision,3);
 assert.deepEqual(await f.service.request('alice','POST','/projects/'+p.projectId+'/restore',body),result);assert.deepEqual([...f.snapshots.values()].at(-1),first);
 await assert.rejects(f.service.request('other','POST','/projects/'+p.projectId+'/restore',body),{status:404});
 await assert.rejects(f.service.request('alice','POST','/projects/'+p.projectId+'/restore',{...body,operationId:'stale'}),{status:409});
});
test('production rejects fabricated/mocked tokens, wrong token type/client/scope/issuer',async()=>{
 const f=await fixture(),auth={issuer:'https://cognito.example/pool',clientId:'client',scope:'flowview/projects'},claims={iss:auth.issuer,client_id:'client',token_use:'access',scope:'openid flowview/projects',sub:'alice'};
 const handler=f.createHandler(f.service,auth),event={rawPath:'/projects',requestContext:{http:{method:'GET'},authorizer:{jwt:{claims}}}};
 assert.equal((await handler(event)).statusCode,200);
 for(const patch of [{iss:'mock'},{client_id:'else'},{token_use:'id'},{scope:'openid'},{sub:null}])assert.equal((await handler({...event,requestContext:{...event.requestContext,authorizer:{jwt:{claims:{...claims,...patch}}}}})).statusCode,401);
 assert.equal((await handler({...event,requestContext:{http:{method:'GET'}},headers:{authorization:'Bearer mock:alice'}})).statusCode,401);
 assert.equal((await handler({...event,body:'a'.repeat(8193)})).statusCode,400);
});
test('frozen topology context round trips exactly and rejects agent metadata in the context envelope',async()=>{
 const f=await fixture(),context={version:1,id:'consumer',local:true,specs:[{page:{canon:{version:1,id:'consumer',kind:'design',owner:'group:default/test'},sections:[]}}]},v={...value('authored'),topologyContext:context};
 await save(f,v);assert.deepEqual([...f.snapshots.values()][0].topologyContext,context);
 await assert.rejects(save(f,{...v,topologyContext:{...context,session:{transcript:'private'}}},{operationId:'private'}),{status:400});
});
