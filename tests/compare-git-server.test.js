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
   S5 fetch       POST /api/fetch with the server's own Origin runs git fetch (a new remote branch is
                  then listed) and leaves HEAD and the index unchanged     rejects: fetch that writes the work tree */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http');
const {git,fixture,ghStub,snapshot}=require('./helpers/compare-git-fixture.cjs');
const TOKEN='gho_SECRET_TOKEN_123',A='flows/a.spec.json';

function request(port,method,target,headers){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,method,path:target,headers:Object.assign({Host:'127.0.0.1:'+port},headers||{})},res=>{
      let body='';res.setEncoding('utf8');res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
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
    const get=async target=>{const r=await request(port,'GET',target);seen.push(r);return r;};
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
    for(const r of seen){assert.ok(!r.body.includes(TOKEN),'no body carries the token');assert.ok(!JSON.stringify(r.headers).includes(TOKEN),'no header carries the token');}
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
    assert.equal((await request(port,'POST','/api/fetch',{Origin:'https://evil.example'})).status,403,'foreign Origin cannot fetch');
    assert.equal((await request(port,'GET','/api/compare?from=main;id&to=main&doc='+encodeURIComponent(A))).status,400,'unknown revision');
    assert.equal((await request(port,'GET','/api/compare?from=main&to=main&doc='+encodeURIComponent('../secret.json'))).status,400,'document outside the repository');
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(f.root,{recursive:true,force:true});}
});

test('S5 POST /api/fetch from the page fetches remote branches without touching HEAD or the index',async()=>{
  const f=await fixture();let server=null;
  try{
    server=await start(f);const port=server.address().port,before=snapshot(f.dir);
    git(f.other,['push','-q','origin','HEAD:refs/heads/remote-only']);
    const r=await request(port,'POST','/api/fetch',{Origin:'http://127.0.0.1:'+port});
    assert.equal(r.status,200,r.body);
    const after=snapshot(f.dir);assert.equal(after.head,before.head);assert.equal(after.index,before.index);assert.equal(after.status,before.status);
    const branches=JSON.parse((await request(port,'GET','/api/revisions?doc='+encodeURIComponent(A)+'&tab=branches')).body).rows;
    assert.ok(branches.some(x=>x.branches.includes('origin/remote-only')));
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(f.root,{recursive:true,force:true});}
});
