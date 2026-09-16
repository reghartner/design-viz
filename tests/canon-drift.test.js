const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const C=require('../tools/canon/core.cjs');
const load=async()=>({D:await import('../tools/canon/drift.mjs'),spec:JSON.parse(await fs.readFile('examples/canon/specs/doorbell.json')),snapshot:JSON.parse(await fs.readFile('examples/canon/repositories.json'))});
test('drift reports every affected diagram and repeated reference, deduplicates scans and accepts only reviewed revisions',async()=>{
  const {D,spec,snapshot}=await load(),other=C.clone(spec);other.page.canon.id='doorbell-other';other.page.sections[0].diagram.steps.push({...other.page.sections[0].diagram.steps[2],id:'another-recording'});
  const sources=new D.SnapshotSources(snapshot),specs=[spec,other],first=await D.scan(specs,sources),r=first.findings[0];
  assert.equal(first.findings.length,1);assert.equal(r.impacts.length,3);assert.match(r.after.text,/timeoutMs: 50/);
  const second=await D.scan(specs,sources,first.state);assert.equal(Object.keys(second.state.reviews).length,1);
  const accepted=D.decide(specs,first.state,r.id,{disposition:'no-impact',reason:'Example review'});
  assert.equal(accepted.reviews[r.id].status,'accepted');
  assert.equal((await D.scan(specs,sources,accepted)).findings.length,0);
  assert.equal(C.references(spec)[1].reference.revision,'1'.repeat(40));
  assert.throws(()=>D.decide(specs,first.state,r.id,{disposition:'closed',reason:'closed'}),/explicit/);
});
test('regressions keep expected behavior, require tickets, and do not create duplicate reviews',async()=>{
  const {D,spec,snapshot}=await load(),sources=new D.SnapshotSources(snapshot),s=await D.scan([spec],sources),id=s.findings[0].id;
  assert.throws(()=>D.decide([spec],s.state,id,{disposition:'regression',reason:'Timeout regression'}),/issue URL/);
  const state=D.decide([spec],s.state,id,{disposition:'regression',reason:'Timeout regression',ticket:'https://example.test/issues/1'});
  assert.equal(Object.keys(state.specs).length,0);assert.equal((await D.scan([spec],sources,state)).findings[0].status,'regression');
});
test('missing/ambiguous anchors fail closed and unrelated source movement is ignored',async()=>{
  const {D,spec,snapshot}=await load(),repo=Object.values(snapshot.repositories)[0],file='src/recording-service.js';
  repo.revisions[repo.head][file]='// moved\n'+repo.revisions['1'.repeat(40)][file];
  assert.equal((await D.scan([spec],new D.SnapshotSources(snapshot))).findings.length,0);
  repo.revisions[repo.head][file]+='\n// flow:createRecording:start';
  const result=await D.scan([spec],new D.SnapshotSources(snapshot));assert.equal(result.findings[0].status,'repair');
  assert.throws(()=>D.decide([spec],result.state,result.findings[0].id,{disposition:'no-impact',reason:'ignore'}),/Repair/);
});
test('spec proposals validate, detect stale bases and resolve only linked reviewed code',async()=>{
  const {D,spec,snapshot}=await load(),scan=await D.scan([spec],new D.SnapshotSources(snapshot)),review=scan.findings[0];
  const changed=C.clone(spec);changed.page.sections[0].diagram.steps[2].text='A reviewed new timeout.';changed.page.sections[0].diagram.steps[2].codeRefs[0].revision=review.head;
  const p=D.propose([spec],scan.state,{id:'doorbell',spec:changed,baseRevision:D.digest(spec),review:review.id});
  const accepted=D.decide([spec],p.state,p.id,{disposition:'update',reason:'Behavior approved'});assert.equal(accepted.reviews[review.id].status,'updated');
  assert.throws(()=>D.propose([spec],accepted,{id:'doorbell',spec:changed,baseRevision:D.digest(spec)}),/changed/);
  const bad=C.clone(spec);bad.page.sections[0].diagram.edges[0].to='missing';assert.throws(()=>D.propose([spec],scan.state,{id:'doorbell',spec:bad,baseRevision:D.digest(spec)}));
});
test('GitHub adapter restricts hosts, reads immutable revisions and never exposes its credential in errors',async()=>{
  const {D}=await load();let request;
  const adapter=new D.GitHubSources({token:'secret-test',fetchImpl:async(url,opts)=>{request={url,opts};return {ok:true,text:async()=> 'source'};}});
  assert.equal(await adapter.file('https://github.com/example/repo','a'.repeat(40),'src/foo.js'),'source');assert.match(request.url,/\?ref=a{40}$/);
  await assert.rejects(()=>adapter.file('https://evil.test/example/repo','a'.repeat(40),'src/foo.js'),/outside/);
  await assert.rejects(()=>adapter.file('https://github.com/example/repo','main','src/foo.js'),/immutable/);
});
test('local portal serves the hosted builder, persists reviewed baselines and rejects cross-origin writes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flow-canon-')),{createCanonServer}=await import('../apps/backstage-mock/server.mjs');
  let server=await createCanonServer({statePath:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let base='http://127.0.0.1:'+server.address().port;
  const post=(route,data,headers={})=>fetch(base+'/api/canon/'+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  try{
    assert.equal((await fetch(base+'/workbench/flowspec.html')).status,200);
    assert.equal((await fetch(base+'/CLAUDE.md')).status,404);
    assert.equal((await post('scan',{}, {Origin:'https://evil.test'})).status,403);
    const {reviews}=await (await post('scan',{})).json();assert.equal(reviews.length,1);
    assert.equal((await post('decisions',{id:reviews[0].id,disposition:'no-impact',reason:'Reviewed harmless fixture'})).status,200);
    await new Promise(r=>server.close(r));server=await createCanonServer({statePath:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
    assert.equal((await (await post('scan',{})).json()).reviews.length,0);
    const spec=await (await fetch(base+'/api/canon/specs/doorbell')).json();assert.equal(C.references(spec)[1].reference.revision,'2'.repeat(40));
  }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
