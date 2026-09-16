const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),{execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile);
test('GitHub workflow adapter opens one review PR per changed scope and reuses it on repeat scans',async()=>{
  const snapshot=JSON.parse(await fs.readFile('examples/canon/repositories.json')),source=Object.values(snapshot.repositories)[0],sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const pulls=[],trees=[],refs=[],updates=[];let unexpected,labels=[];
  const tmp=await fs.mkdtemp(require('node:path').join(require('node:os').tmpdir(),'canon-decision-')),eventFile=require('node:path').join(tmp,'event.json');
  await fs.writeFile(eventFile,JSON.stringify({pull_request:{number:1},sender:{login:'reviewer'}}));
  const server=http.createServer(async(req,res)=>{
    const u=new URL(req.url,'http://localhost'),route=u.pathname;let body='';for await(const c of req)body+=c;const data=body?JSON.parse(body):null;
    function send(value,raw=false){res.setHeader('Content-Type',raw?'text/plain':'application/json');res.end(raw?value:JSON.stringify(value));}
    if(route==='/repos/example/specs')return send({default_branch:'main'});
    if(route.startsWith('/repos/example/specs/git/ref/heads/'))return send({object:{sha}});
    if(route==='/repos/fictional-home/doorbell-services')return send({default_branch:'main'});
    if(route.startsWith('/repos/fictional-home/doorbell-services/commits/'))return send({sha:source.head});
    if(route.startsWith('/repos/fictional-home/doorbell-services/contents/'))return send(source.revisions[u.searchParams.get('ref')][decodeURIComponent(route.split('/contents/')[1])],true);
    if(route==='/repos/example/specs/pulls/1')return send({state:'closed',head:{ref:pulls[0].head,sha:'b'.repeat(40),repo:{full_name:'example/specs'}},user:{type:'Bot'},labels:labels.map(name=>({name})),body:pulls[0].body,html_url:'https://github.com/example/specs/pull/1'});
    if(route==='/repos/example/specs/collaborators/reviewer/permission')return send({permission:'write'});
    if(route.startsWith('/repos/example/specs/contents/.flowview/reviews/'))return send({content:Buffer.from(trees[0].tree.find(f=>f.path.endsWith('.json')).content).toString('base64')});
    if(route==='/repos/example/specs/git/refs/heads/main' && req.method==='PATCH'){updates.push(data);return send({});}
    if(route==='/repos/example/specs/pulls' && req.method==='GET')return send(pulls.filter(p=>u.searchParams.get('head')==='example:'+p.head));
    if(route==='/repos/example/specs/pulls' && req.method==='POST'){pulls.push(data);return send({number:pulls.length});}
    if(route.startsWith('/repos/example/specs/git/commits/') && req.method==='GET')return send({tree:{sha:'tree'}});
    if(route==='/repos/example/specs/git/trees'){trees.push(data);return send({sha:'new-tree'});}
    if(route==='/repos/example/specs/git/commits')return send({sha:'new-commit'});
    if(route.startsWith('/repos/example/specs/git/matching-refs/'))return send(refs);
    if(route==='/repos/example/specs/git/refs'){refs.push(data);return send(data);}
    unexpected=route;res.statusCode=500;send({error:'Unexpected route'});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const env={...process.env,GITHUB_REPOSITORY:'example/specs',GITHUB_TOKEN:'mock',GITHUB_API_URL:'http://127.0.0.1:'+server.address().port,GITHUB_SERVER_URL:'https://github.com',FLOWVIEW_REGISTRY:'examples/canon/registry.json',GITHUB_EVENT_PATH:eventFile,FLOWVIEW_REPORT_DIR:require('node:path').join(tmp,'report')};
    await run(process.execPath,['tools/canon/github.mjs','scan'],{env});
    await run(process.execPath,['tools/canon/github.mjs','scan'],{env});
    assert.equal(unexpected,undefined);assert.equal(pulls.length,1);assert.match(pulls[0].body,/doorbell/);assert.match(pulls[0].body,/timeoutMs: 50/);
    assert.ok(trees[0].tree.every(t=>t.path.startsWith('.flowview/reviews/')));
    assert.match(pulls[0].head,/^flowview\/drift\/[a-f0-9]{20}$/);
    await run(process.execPath,['tools/canon/github.mjs','decision'],{env});assert.equal(updates.length,0,'plain closure leaves baseline unchanged');
    labels=['flowview/no-impact'];await run(process.execPath,['tools/canon/github.mjs','decision'],{env});
    assert.equal(updates.length,1);assert.equal(updates[0].force,false);
    const committed=trees.at(-1).tree,state=JSON.parse(committed.find(f=>f.path==='.flowview/drift-state.json').content);
    assert.deepEqual(state.specs,{},'Git remains authoritative over later human edits');
    const diagram=JSON.parse(committed.find(f=>f.path==='examples/canon/specs/doorbell.json').content);
    assert.equal(diagram.page.sections[0].diagram.steps[2].codeRefs[0].revision,source.head);

  }finally{await new Promise(r=>server.close(r));await fs.rm(tmp,{recursive:true,force:true});}
});
