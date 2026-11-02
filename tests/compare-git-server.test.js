'use strict';
/* Git Compare local server (issue #849, PR 1 of 3): tools/compare/serve.mjs.
   Chuck 2026-11-01: small read-only JSON API bound to 127.0.0.1; GET /api/status,
   /api/documents?rev=, /api/revisions?doc=&tab=&q=&page=, /api/between?from=&to=&doc=,
   /api/compare?from=&to=&doc=; one POST /api/fetch; a fixed allow-list of static files; the gh
   token never leaves the server process.

   CONTRACT MATRIX
   S1 binding     the server listens on 127.0.0.1 only                     rejects: 0.0.0.0 / ::
   S2 routes      every allow-listed route answers 200 JSON with the reader's data (status path and
                  login, documents, revisions rows, between rows, compare sides with raw spec and
                  context); "/" serves the page with a Content-Security-Policy whose script-src has
                  no 'unsafe-inline'                                        rejects: missing route; inline scripts allowed
   S3 negatives   404 for path traversal (/../, %2e%2e), /.git/config, a repository file path and any
                  unknown path; 403 for a method other than GET (POST/PUT/DELETE) on every GET route
                  and for GET on /api/fetch; 403 for a foreign Origin or Host header (also on POST
                  /api/fetch); 400 for a revision the reader rejects     rejects: open file server; CSRF fetch
   S4 token       the stubbed gh token appears in no response body or header across all routes
                                                                            rejects: token passed to the page
   S5 fetch       POST /api/fetch with the server's own Origin answers JSON status, adds only the new
                  remote-tracking ref (two-sided ref diff) and leaves HEAD and the index unchanged; GET/PUT/
                  DELETE /api/fetch and a POST with a foreign Host or Origin are refused and run no fetch
                  (refs, index and FETCH_HEAD unchanged)                   rejects: fetch that writes the work tree; CSRF
   S4 also covers every refusal (403/404/400) and the POST /api/fetch response.
   S6 paging      /api/revisions passes page through: 137 commits -> 100 + 37 rows, no overlap
   S7 command     node tools/compare/serve.mjs --repo <clone> --port 0 prints "Git Compare: http://127.0.0.1:<port>/"
                  and serves the clone with the gh found on PATH; without --repo it prints the usage and
                  exits with status 2                                       rejects: CLI that ignores --repo */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http');
const {git,fixture,ghStub,snapshot,refChanges,ghExecutable,cleanEnv}=require('./helpers/compare-git-fixture.cjs');
const {spawn}=require('node:child_process'),path=require('node:path');
/* Every response any test receives, for the token sweep. */
const seen=[];
function noToken(){for(const r of seen){assert.ok(!r.body.includes(TOKEN),'no body carries the token: '+r.status);assert.ok(!JSON.stringify(r.headers).includes(TOKEN),'no header carries the token');}}
const TOKEN='gho_SECRET_TOKEN_123',A='flows/a.spec.json';

function request(port,method,target,headers){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,method,path:target,headers:Object.assign({Host:'127.0.0.1:'+port},headers||{})},res=>{
      let body='';res.setEncoding('utf8');res.on('data',d=>body+=d);res.on('end',()=>{const r={status:res.statusCode,headers:res.headers,body};seen.push(r);resolve(r);});
    });
    req.on('error',reject);req.end();
  });
}
async function start(f){
  const mod=await import('../tools/compare/serve.mjs').catch(()=>({}));
  assert.equal(typeof mod.createCompareServer,'function','tools/compare/serve.mjs exports createCompareServer');
  const server=await mod.createCompareServer({directory:f.dir,gh:ghStub(f.c),port:0});
  return server;
}

test('S1 S2 S4 the server binds to 127.0.0.1 and serves every route without exposing the token',async()=>{
  const f=await fixture();let server=null;
  try{
    server=await start(f);const addr=server.address();
    assert.equal(addr.address,'127.0.0.1');const port=addr.port,c=f.c,seen=[];
    const get=target=>request(port,'GET',target);
    const json=async target=>{const r=await get(target);assert.equal(r.status,200,target+' '+r.body);assert.match(r.headers['content-type'],/^application\/json/);return JSON.parse(r.body);};
    const status=await json('/api/status');assert.equal(status.path,f.dir);assert.equal(status.gh.login,'octo');
    assert.deepEqual(await json('/api/documents?rev='+c.c7),['flows/a.spec.json','flows/new.spec.json','flows/p.spec.json']);
    const revs=await json('/api/revisions?doc='+encodeURIComponent(A)+'&tab=document');assert.deepEqual(revs.rows.map(r=>r.sha),[c.c7,c.c5,c.c3,c.c2,c.c1]);
    const prs=await json('/api/revisions?doc='+encodeURIComponent(A)+'&tab=prs');assert.deepEqual(prs.rows.map(r=>r.prs[0]),[8,7]);
    assert.deepEqual((await json('/api/revisions?doc='+encodeURIComponent(A)+'&tab=all&q=provider')).rows.map(r=>r.sha),[c.c6]);
    assert.deepEqual((await json('/api/between?from='+c.c1+'&to='+c.c7+'&doc='+encodeURIComponent(A))).map(r=>r.sha),[c.c7,c.c5,c.c3,c.c2]);
    const cmp=await json('/api/compare?from=v1&to=main&doc='+encodeURIComponent(A));
    assert.deepEqual([cmp.from,cmp.to],[c.c2,c.c7],'names resolve to full SHAs');
    assert.equal(cmp.before.raw.page.canon.id,'doc-a');assert.equal(cmp.after.raw.page.sections[0].diagram.nodes.a.title,'Alpha final');
    assert.deepEqual(cmp.after.context.specs.map(s=>s.page.canon.id).sort(),['doc-a','new','provider']);
    const added=await json('/api/compare?from='+c.c6+'&to='+c.c7+'&doc='+encodeURIComponent('flows/new.spec.json'));assert.equal(added.before,null);
    const page=await get('/');assert.equal(page.status,200);assert.match(page.headers['content-type'],/^text\/html/);
    const csp=page.headers['content-security-policy']||'';assert.match(csp,/script-src [^;]*'self'/);assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
    noToken();
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(f.root,{recursive:true,force:true});}
});

test('S3 traversal, repository files, wrong methods, foreign origins and bad revisions are refused',async()=>{
  const f=await fixture();let server=null;
  try{
    server=await start(f);const port=server.address().port,c=f.c;
    for(const target of ['/../etc/passwd','/%2e%2e/%2e%2e/etc/passwd','/.git/config','/flows/a.spec.json','/README.md','/api/unknown','/tools/compare/serve.mjs'])
      assert.equal((await request(port,'GET',target)).status,404,target);
    const routes=['/api/status','/api/documents?rev='+c.c7,'/api/revisions?doc='+encodeURIComponent(A)+'&tab=all','/api/between?from='+c.c1+'&to='+c.c7+'&doc='+encodeURIComponent(A),'/api/compare?from='+c.c1+'&to='+c.c7+'&doc='+encodeURIComponent(A),'/'];
    for(const target of routes)for(const method of ['POST','PUT','DELETE'])assert.equal((await request(port,method,target)).status,403,method+' '+target);
    assert.equal((await request(port,'GET','/api/fetch')).status,403,'fetch is POST only');
    assert.equal((await request(port,'GET','/api/status',{Origin:'https://evil.example'})).status,403,'foreign Origin');
    assert.equal((await request(port,'GET','/api/status',{Host:'evil.example'})).status,403,'foreign Host');
    assert.equal((await request(port,'GET','/api/compare?from=main;id&to=main&doc='+encodeURIComponent(A))).status,400,'unknown revision');
    assert.equal((await request(port,'GET','/api/compare?from=main&to=main&doc='+encodeURIComponent('../secret.json'))).status,400,'document outside the repository');
    /* Fetch accepts only POST from this server's Host and Origin: refused requests run no fetch. */
    const before=snapshot(f.dir),fetchHead=require('node:fs').statSync(path.join(f.dir,'.git','FETCH_HEAD')).mtimeMs;
    git(f.other,['push','-q','origin','HEAD:refs/heads/refused-only']);
    for(const method of ['GET','PUT','DELETE'])assert.equal((await request(port,method,'/api/fetch',{Origin:'http://127.0.0.1:'+port})).status,403,method+' /api/fetch');
    assert.equal((await request(port,'POST','/api/fetch',{Host:'evil.example',Origin:'http://127.0.0.1:'+port})).status,403,'foreign Host cannot fetch');
    assert.equal((await request(port,'POST','/api/fetch',{Host:'evil.example'})).status,403,'foreign Host without Origin cannot fetch');
    assert.equal((await request(port,'POST','/api/fetch',{Origin:'https://evil.example'})).status,403,'foreign Origin cannot fetch');
    assert.deepEqual(snapshot(f.dir),before,'no refused request fetched');
    assert.equal(require('node:fs').statSync(path.join(f.dir,'.git','FETCH_HEAD')).mtimeMs,fetchHead,'FETCH_HEAD untouched');
    assert.ok(seen.filter(r=>r.status===404).length>=7 && seen.filter(r=>r.status===403).length>=20 && seen.some(r=>r.status===400),'precondition: the sweep below covers the 404, 403 and 400 refusals');
    noToken();
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(f.root,{recursive:true,force:true});}
});

test('S5 POST /api/fetch from the page fetches remote branches without touching HEAD or the index',async()=>{
  const f=await fixture();let server=null;
  try{
    server=await start(f);const port=server.address().port,before=snapshot(f.dir);
    git(f.other,['push','-q','origin','HEAD:refs/heads/remote-only']);
    seen.length=0;
    const r=await request(port,'POST','/api/fetch',{Origin:'http://127.0.0.1:'+port});
    assert.equal(r.status,200,r.body);assert.match(r.headers['content-type'],/^application\/json/);
    assert.equal(JSON.parse(r.body).path,f.dir,'fetch answers with the refreshed status');
    assert.deepEqual(refChanges(before,snapshot(f.dir)),['refs/remotes/origin/remote-only'],'only the new remote-tracking ref');
    const after=snapshot(f.dir);assert.equal(after.head,before.head);assert.equal(after.index,before.index);assert.equal(after.status,before.status);
    const branches=JSON.parse((await request(port,'GET','/api/revisions?doc='+encodeURIComponent(A)+'&tab=branches')).body).rows;
    assert.ok(branches.some(x=>x.branches.includes('origin/remote-only')));
    noToken();
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(f.root,{recursive:true,force:true});}
});

test('S6 the page parameter pages /api/revisions at 100 rows',async()=>{
  const f=await fixture();let server=null;
  try{
    for(let i=0;i<130;i++)git(f.dir,['commit','-q','--allow-empty','-m','Empty '+i],{GIT_AUTHOR_DATE:'2026-02-01T10:00:00Z',GIT_COMMITTER_DATE:'2026-02-01T10:00:00Z'});
    server=await start(f);const port=server.address().port;seen.length=0;
    const page=async n=>JSON.parse((await request(port,'GET','/api/revisions?doc='+encodeURIComponent(A)+'&tab=all&page='+n)).body);
    const p1=await page(1),p2=await page(2);
    assert.deepEqual([p1.rows.length,p1.page,p1.pages,p1.total],[100,1,2,137]);assert.deepEqual([p2.rows.length,p2.page,p2.pages],[37,2,2]);
    assert.equal(new Set(p1.rows.concat(p2.rows).map(r=>r.sha)).size,137);
    noToken();
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(f.root,{recursive:true,force:true});}
});

test('S7 the command line serves the clone on 127.0.0.1 and prints its URL',async()=>{
  const f=await fixture();let child=null;
  try{
    const bin=await ghExecutable(f.root,f.c),env=Object.assign(cleanEnv(),{PATH:bin+path.delimiter+process.env.PATH});
    child=spawn(process.execPath,[path.join(__dirname,'..','tools','compare','serve.mjs'),'--repo',f.dir,'--port','0'],{env,stdio:['ignore','pipe','pipe']});
    let out='';child.stdout.setEncoding('utf8');child.stdout.on('data',d=>out+=d);
    const url=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('no URL printed: '+out)),15000);
      child.stdout.on('data',()=>{const m=/Git Compare: (http:\/\/127\.0\.0\.1:(\d+)\/)/.exec(out);if(m){clearTimeout(t);resolve(m);}});child.on('exit',c=>{clearTimeout(t);reject(new Error('exited '+c+' '+out));});});
    const port=Number(url[2]),status=JSON.parse((await request(port,'GET','/api/status')).body);
    assert.equal(status.path,f.dir);assert.equal(status.gh.login,'octo','the gh found on PATH answers');
    assert.deepEqual(JSON.parse((await request(port,'GET','/api/revisions?doc='+encodeURIComponent(A)+'&tab=prs')).body).rows.map(r=>r.prs[0]),[7]);
    noToken();
    child.kill();child=null;
    const usage=spawn(process.execPath,[path.join(__dirname,'..','tools','compare','serve.mjs')],{env,stdio:['ignore','pipe','pipe']});
    let err='';usage.stderr.setEncoding('utf8');usage.stderr.on('data',d=>err+=d);
    const code=await new Promise(r=>usage.on('exit',r));
    assert.equal(code,2,'missing --repo exits with status 2');assert.match(err,/Usage: node tools\/compare\/serve\.mjs --repo/);
  }finally{if(child)child.kill();await fs.rm(f.root,{recursive:true,force:true});}
});
