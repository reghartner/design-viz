const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
const C=require('../tools/canon/core.cjs'),runner=path.resolve('tools/canon/github.mjs');

async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'canon-automation-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  await fs.cp('examples/canon/specs',path.join(directory,'specs'),{recursive:true});
  await fs.copyFile('examples/canon/registry.json',path.join(directory,'registry.json'));
  const {localGitEnvironment}=await import('../tools/canon/local-git.mjs');
  const git=async(...args)=>(await exec('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false',...args],{cwd:directory,env:localGitEnvironment()})).stdout.trim();
  await git('init','--quiet','--initial-branch=main','--template=');await git('add','.');
  await git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','Fixture');
  const base=await git('rev-parse','HEAD');
  const snapshot=JSON.parse(await fs.readFile('examples/canon/repositories.json'));
  const source=Object.values(snapshot.repositories)[0];
  const f={directory,base,source,requests:[],pulls:[],refs:[],trees:[],updates:[],labels:[],permission:'write',sourceFailure:false,pullFailure:false};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),route=url.pathname;let body='';for await(const chunk of req)body+=chunk;
    const data=body?JSON.parse(body):null;f.requests.push({route,method:req.method,authorization:req.headers.authorization});
    const send=(value,status=200,raw=false)=>{res.statusCode=status;res.setHeader('Content-Type',raw?'text/plain':'application/json');res.end(raw?value:JSON.stringify(value));};
    if(route.startsWith('/repos/fictional-home/doorbell-services')){
      if(f.sourceFailure)return send({message:'Forbidden'},403);
      if(route==='/repos/fictional-home/doorbell-services')return send({default_branch:'main'});
      if(route.includes('/commits/'))return send({sha:source.head});
      if(route.includes('/contents/')){
        const text=source.revisions[url.searchParams.get('ref')]?.[decodeURIComponent(route.split('/contents/')[1])];
        return text===undefined?send({},404):send(text,200,true);
      }
    }
    if(route==='/repos/example/specs')return send({default_branch:'main'});
    if(route==='/repos/example/specs/git/ref/heads/main')return send({object:{sha:f.base}});
    if(route.startsWith('/repos/example/specs/collaborators/'))return send({permission:f.permission});
    if(route==='/repos/example/specs/pulls/1')return send({...f.pulls[0],state:'closed',head:{ref:f.pulls[0].head,sha:'b'.repeat(40),repo:{full_name:'example/specs'}},user:{type:'Bot'},labels:f.labels.map(name=>({name})),body:f.pulls[0].body+(f.ticket?'\nRegression ticket: '+f.ticket:'')});
    if(route.startsWith('/repos/example/specs/contents/.flowview/reviews/'))return send({content:Buffer.from(f.trees[0].tree.find(v=>v.path.endsWith('.json')).content).toString('base64')});
    if(route==='/repos/example/specs/pulls' && req.method==='GET')return send(f.pulls.filter(p=>url.searchParams.get('head')==='example:'+p.head));
    if(route==='/repos/example/specs/pulls' && req.method==='POST'){
      if(f.pullFailure)return send({message:'PR creation disabled'},403);
      const pr={...data,number:f.pulls.length+1,state:'open',html_url:'https://github.com/example/specs/pull/'+(f.pulls.length+1)};f.pulls.push(pr);return send(pr,201);
    }
    if(route.startsWith('/repos/example/specs/git/commits/') && req.method==='GET')return send({tree:{sha:'tree'}});
    if(route==='/repos/example/specs/git/trees'){f.trees.push(data);return send({sha:'new-tree'});}
    if(route==='/repos/example/specs/git/commits')return send({sha:'c'.repeat(40)});
    if(route.startsWith('/repos/example/specs/git/matching-refs/'))return send(f.refs);
    if(route==='/repos/example/specs/git/refs'){f.refs.push(data);return send(data,201);}
    if(route==='/repos/example/specs/git/refs/heads/main' && req.method==='PATCH'){f.updates.push(data);return send({});}
    f.unexpected=route;return send({message:'Unexpected route'},500);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const eventFile=path.join(directory,'event.json');await fs.writeFile(eventFile,JSON.stringify({pull_request:{number:1},sender:{login:'reviewer'}}));
  f.run=async(command='scan',extra={})=>{
    const env={...process.env,GITHUB_REPOSITORY:'example/specs',GITHUB_TOKEN:'central-secret',FLOWVIEW_SOURCE_TOKEN:'source-secret',GITHUB_API_URL:'http://127.0.0.1:'+server.address().port,GITHUB_SERVER_URL:'https://github.com',FLOWVIEW_REGISTRY:'registry.json',GITHUB_EVENT_PATH:eventFile,FLOWVIEW_REPORT_DIR:path.join(directory,'report'),GITHUB_STEP_SUMMARY:path.join(directory,'summary.md'),FLOWVIEW_DRY_RUN:'false',...extra};
    let exitCode=0;try{await exec(process.execPath,[runner,command],{cwd:directory,env});}catch(e){if(!Number.isInteger(e.code))throw e;exitCode=e.code;}
    const report=JSON.parse(await fs.readFile(path.join(directory,'report/report.json'))),markdown=await fs.readFile(path.join(directory,'report/report.md'),'utf8');
    assert.equal(f.unexpected,undefined);assert.doesNotMatch(JSON.stringify(report)+markdown,/central-secret|source-secret/);
    return {exitCode,report,markdown};
  };
  f.materializeDecision=async()=>{
    for(const file of f.trees.at(-1).tree){const dest=path.join(directory,file.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.content);}
  };
  return f;
}

test('report-only GitHub scan reads real-shaped APIs, separates source credentials and makes no writes',async t=>{
  const f=await fixture(t),r=await f.run('scan',{FLOWVIEW_DRY_RUN:'true'});
  assert.equal(r.exitCode,0);assert.equal(r.report.status,'complete');assert.equal(r.report.findings.length,1);
  assert.equal(r.report.actions[0].outcome,'would-open');assert.equal(r.report.references,3);
  assert.equal(f.requests.filter(q=>q.method!=='GET').length,0);assert.match(r.markdown,/timeoutMs: 50/);
  assert.ok(f.requests.filter(q=>q.route.includes('/fictional-home/')).every(q=>q.authorization==='Bearer source-secret'));
  assert.ok(f.requests.filter(q=>q.route.includes('/example/specs')).every(q=>q.authorization==='Bearer central-secret'));
  assert.match(await fs.readFile(path.join(f.directory,'summary.md'),'utf8'),/report only \(no GitHub writes\)/);
});

test('clean scheduled scan saves explicit evidence and never creates a review',async t=>{
  const f=await fixture(t);f.source.head='1'.repeat(40);
  const r=await f.run();assert.equal(r.exitCode,0);assert.deepEqual(r.report.findings,[]);
  assert.match(r.markdown,/No referenced code changed/);assert.equal(f.requests.filter(q=>q.method!=='GET').length,0);
  assert.equal(r.report.baseRevision,f.base);assert.equal(r.report.diagrams,1);assert.equal(r.report.references,3);
});

test('unreadable sources produce failed scans with repair evidence, never a false clean result',async t=>{
  const f=await fixture(t);f.sourceFailure=true;
  const r=await f.run('scan',{FLOWVIEW_DRY_RUN:'true'});
  assert.equal(r.exitCode,1);assert.equal(r.report.status,'failed');assert.equal(r.report.findings.length,3);
  assert.ok(r.report.findings.every(v=>v.status==='repair' && /403/.test(v.error)));
  assert.match(r.markdown,/not a clean scan/);assert.equal(f.requests.filter(q=>q.method!=='GET').length,0);
});

test('failed PR creation retains evidence and retry reuses the branch and then the review',async t=>{
  const f=await fixture(t);f.pullFailure=true;
  const failed=await f.run();assert.equal(failed.exitCode,1);assert.equal(failed.report.findings.length,1);
  assert.match(failed.report.error,/403/);assert.equal(f.refs.length,1);assert.equal(f.trees.length,1);
  f.pullFailure=false;
  const retry=await f.run();assert.equal(retry.exitCode,0);assert.equal(f.pulls.length,1);assert.equal(f.trees.length,1);
  const repeated=await f.run();assert.equal(f.pulls.length,1);assert.equal(repeated.report.actions[0].outcome,'existing');
  assert.equal(repeated.report.actions[0].url,'https://github.com/example/specs/pull/1');
});

test('decision events retain human permission and disposition gates, then accept exactly once',async t=>{
  const f=await fixture(t);await f.run();
  const plain=await f.run('decision');assert.equal(plain.exitCode,0);assert.equal(f.updates.length,0);
  f.labels=['flowview/no-impact'];f.permission='read';
  assert.equal((await f.run('decision')).exitCode,1);assert.equal(f.updates.length,0);
  f.permission='write';f.labels.push('flowview/regression');
  assert.equal((await f.run('decision')).exitCode,1);assert.equal(f.updates.length,0);
  f.labels=['flowview/no-impact'];
  const accepted=await f.run('decision');assert.equal(accepted.exitCode,0);assert.equal(f.updates.length,1);assert.equal(f.updates[0].force,false);
  await f.materializeDecision();
  const spec=JSON.parse(await fs.readFile(path.join(f.directory,'specs/doorbell.json')));
  assert.equal(spec.page.sections[0].diagram.steps[2].codeRefs[0].revision,f.source.head);
  const repeated=await f.run('decision');assert.equal(repeated.exitCode,0);assert.equal(f.updates.length,1);
  assert.equal(repeated.report.actions[0].outcome,'already-recorded');
  assert.equal((await f.run()).report.findings.length,0);
});

test('regression decision persists once without changing canon and rejects a later stale acceptance',async t=>{
  const f=await fixture(t);await f.run();f.labels=['flowview/regression'];
  assert.equal((await f.run('decision')).exitCode,1);assert.equal(f.updates.length,0);
  f.ticket='https://example.test/issues/1';assert.equal((await f.run('decision')).exitCode,0);
  assert.equal(f.updates.length,1);assert.deepEqual(f.trees.at(-1).tree.map(v=>v.path),['.flowview/drift-state.json']);
  await f.materializeDecision();
  assert.equal((await f.run('decision')).report.actions[0].outcome,'already-recorded');assert.equal(f.updates.length,1);
  const repeated=await f.run();assert.equal(repeated.report.findings[0].status,'regression');assert.equal(f.pulls.length,1);
  f.source.revisions[f.source.head]['src/recording-service.js']+='\n'; // Outside anchor still same reviewed evidence.
  f.source.revisions[f.source.head]['src/recording-service.js']=f.source.revisions[f.source.head]['src/recording-service.js'].replace('timeoutMs: 50','timeoutMs: 10');
  f.labels=['flowview/no-impact'];
  const stale=await f.run('decision');assert.equal(stale.exitCode,1);assert.match(stale.report.error,/Source changed/);assert.equal(f.updates.length,1);
});

test('moved default branch fails before any source scan or mutation and saves a diagnostic',async t=>{
  const f=await fixture(t);f.base='f'.repeat(40);
  const r=await f.run();assert.equal(r.exitCode,1);assert.match(r.report.error,/Default branch moved/);
  assert.equal(f.requests.filter(q=>q.method!=='GET').length,0);assert.equal(r.report.findings.length,0);
});

test('live doorbell registry watches the executable sample and maps recording changes to its recording step',async()=>{
  const {registry}=await import('../tools/canon/registry.mjs'),{scan,SnapshotSources}=await import('../tools/canon/drift.mjs');
  const {specs}=await registry('examples/canon/github/registry.json'),spec=specs[0];assert.equal(C.validateSpec(spec).errors.length,0);
  const refs=C.references(spec).map(v=>v.reference);assert.equal(refs.length,3);
  const repository=refs[0].repository,revision=refs[0].revision,files={};
  for(const ref of refs){assert.equal(ref.repository,repository);assert.equal(ref.revision,revision);files[ref.path]=await fs.readFile(ref.path,'utf8');assert.ok(!C.locate(files[ref.path],ref.anchor).error);}
  const next='a'.repeat(40),snapshot={repositories:{[repository]:{head:next,revisions:{[revision]:files,[next]:{...files}}}}};
  assert.equal((await scan(specs,new SnapshotSources(snapshot))).findings.length,0);
  const file='examples/canon/doorbell-app/src/recording-service.js';snapshot.repositories[repository].revisions[next][file]=files[file].replace('timeoutMs: 500','timeoutMs: 50');
  const changed=await scan(specs,new SnapshotSources(snapshot));assert.equal(changed.findings.length,1);
  assert.equal(changed.findings[0].impacts[0].targetId,'record');assert.match(changed.findings[0].after.text,/timeoutMs: 50/);
});
