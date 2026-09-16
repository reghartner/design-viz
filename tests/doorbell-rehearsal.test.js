const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
const C=require('../tools/canon/core.cjs');

test('doorbell rehearsal proves a harmless refactor and a real regression against unchanged app tests and Git objects',async()=>{
  const {runDoorbellRehearsal}=await import('../tools/canon/doorbell-rehearsal.mjs'),{LocalGitSources}=await import('../tools/canon/local-git.mjs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doorbell-rehearsal-')),original=await fs.readFile('examples/canon/doorbell-app/src/recording-service.js','utf8');
  try{
    const report=await runDoorbellRehearsal({outDir:path.join(dir,'run')}),[baseline,refactor,broken]=report.stages;
    assert.equal(report.passed,true);assert.deepEqual(report.stages.map(s=>s.testExitCode),[0,0,1]);
    assert.deepEqual(baseline.behavior,refactor.behavior);
    assert.equal(broken.behavior.error.code,'RECORDING_TIMEOUT');assert.equal(broken.behavior.notifications.length,0);
    assert.equal(refactor.review.status,'accepted');assert.equal(broken.review.status,'regression');
    assert.equal(broken.review.reference.revision,refactor.revision);assert.equal(report.acceptedRevision,refactor.revision);
    assert.equal(broken.review.head,broken.revision);assert.match(broken.review.before.text,/timeoutMs: 500/);assert.match(broken.review.after.text,/timeoutMs: 50/);
    assert.equal(broken.review.impacts.length,1);assert.equal(broken.review.impacts[0].targetId,'upload');
    const sourceDir=path.join(report.directory,'source'),adapter=new LocalGitSources({[report.repository]:sourceDir});
    for(const rev of Object.values(report.commits))assert.match(rev,/^[a-f0-9]{40,64}$/);
    assert.equal(new Set(Object.values(report.commits)).size,3);
    const tests=await Promise.all(report.stages.map(s=>adapter.file(report.repository,s.revision,'contract.test.mjs')));
    assert.ok(tests.every(text=>text===tests[0]),'The contract must not be rewritten alongside the implementation.');
    assert.match(await fs.readFile(path.join(report.directory,'breaking.tests.tap'),'utf8'),/# fail 2\b/);
    const accepted=JSON.parse(await fs.readFile(path.join(report.directory,'accepted-spec.json'))),state=JSON.parse(await fs.readFile(path.join(report.directory,'state.json')));
    assert.equal(C.references(accepted).find(r=>r.targetId==='upload').reference.revision,refactor.revision);
    assert.deepEqual(state.specs['doorbell-app-demo'],accepted);
    assert.equal(Object.keys(state.reviews).length,2);
    // Dirty working files cannot masquerade as a reviewed commit. No code is executed by this adapter.
    await fs.writeFile(path.join(sourceDir,'src/recording-service.js'),'not executable JavaScript');
    assert.match(await adapter.file(report.repository,broken.revision,'src/recording-service.js'),/timeoutMs: 50/);
    assert.equal(await adapter.head(report.repository),broken.revision);
    await assert.rejects(adapter.file(report.repository,'main','src/recording-service.js'),/immutable/);
    await assert.rejects(adapter.file(report.repository,baseline.revision,'../secret'),/relative/);
    await assert.rejects(adapter.file('https://example.test/unmapped',baseline.revision,'src/recording-service.js'),/outside/);
    const cli=await exec(process.execPath,['tools/canon/cli.mjs','scan','--registry',path.join(report.directory,'registry.json'),'--state',path.join(report.directory,'state.json'),'--local-sources',path.join(report.directory,'local-sources.json'),'--out',path.join(report.directory,'rescan.md')]);
    assert.equal(JSON.parse(cli.stdout).reviews[0].status,'regression');
    assert.equal(await fs.readFile('examples/canon/doorbell-app/src/recording-service.js','utf8'),original,'The intentionally broken code stays in its isolated repository.');
    await assert.rejects(runDoorbellRehearsal({outDir:report.directory}),/EEXIST/,'An existing evidence folder must not be overwritten.');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('mock portal runs only the fixed sample, coalesces duplicate requests and retains the report without changing canon',async()=>{
  const {createCanonServer}=await import('../apps/backstage-mock/server.mjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'doorbell-portal-'));
  let server=await createCanonServer({statePath:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let base='http://127.0.0.1:'+server.address().port;
  const get=async route=>(await fetch(base+'/api/canon/'+route)).json();
  const post=(body={},origin)=>fetch(base+'/api/canon/doorbell-rehearsal',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  try{
    const canonical=await get('specs/doorbell');assert.equal(await get('doorbell-rehearsal'),null);
    assert.equal((await post({},'https://example.test')).status,403);
    const responses=await Promise.all([post({outDir:'/should-never-be-used',command:'not executable'}),post()]);
    assert.ok(responses.every(r=>r.status===200));const reports=await Promise.all(responses.map(r=>r.json()));
    assert.equal(reports[0].directory,reports[1].directory);assert.ok(reports[0].directory.startsWith(dir+path.sep));
    assert.equal(reports[0].passed,true);assert.equal((await fs.readdir(path.join(dir,'doorbell-rehearsals'))).length,1);
    assert.deepEqual(await get('specs/doorbell'),canonical);
    await new Promise(r=>server.close(r));server=await createCanonServer({statePath:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
    assert.deepEqual((await get('doorbell-rehearsal')).commits,reports[0].commits);
    assert.deepEqual((await get('registry')).reviews,[]);
  }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
