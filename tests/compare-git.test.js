'use strict';
/* Git Compare revision reader (issue #849, PR 1 of 3): tools/compare/git-revisions.mjs.
   Chuck 2026-11-01: local clone + gh CLI (the token stays in the server process); imports
   resolve from the SAME revision's tree by canon id; coverage = everything written in #849.
   The fixture is a temporary git repository built here; `gh` is an injected runner with fixed
   JSON, so no network is used.

   Fixture history (author dates fixed; --diff-merges=first-parent decides "changes a file"):
     c1 2026-01-01 Alice   add flows/a.spec.json (imports provider), flows/p.spec.json, flows/old.spec.json
     c2 2026-01-02 Bob     a: node title             tag v1
     c3 2026-01-03 Carol   a: step text              branch feature (PR #7 head)
     c4 2026-01-04 Alice   README only               (main)
     c5 2026-01-05 Bob     merge feature into main   (first parent c4; changes a)
     c6 2026-01-06 Dana    provider p: exported node title (a's imported node)
     c7 2026-01-07 Alice   a: node title; add flows/new.spec.json; remove flows/old.spec.json   main
     pr8                   a commit only at refs/pull/8/head of the bare remote (PR #8, unfetched)

   CONTRACT MATRIX
   G1 revisions   tabs for flows/a.spec.json: document = commits whose first-parent diff changes it
                  (c7 c5 c3 c2 c1, newest first); all = every commit (c7..c1); branches = main, feature;
                  tags = v1; prs = #7 and #8 from gh. Each row: full sha, 7-char short, ISO author
                  date, author, subject, branches (local and remote-tracking, sorted), tags, prs, touches (changes this document),
                  available (object present locally); search q filters rows; pages of <= 100
                                                     rejects: one undated list; wrong "changes" rule
   G2 resolve     names resolve to full SHAs (main, feature, v1, short sha, pr:7); side(rev, doc).raw
                  equals the blob from git show; compareRevisions equals the engine's compareDocuments
                  on the same two sides                rejects: working-tree reads; branch-name reads
   G3 between     between(c1, c7, a) = c7 c5 c3 c2 with parent (first parent), date, subject, prs;
                  the merge's parent is its first parent c4      rejects: second-parent diffs; missing merges
   G4 documents   documents(rev) lists every *.spec.json at that revision; changedDocuments(c6, c7)
                  = new added, a modified, old removed; compareRevisions on an added document has a
                  null Before                             rejects: working-tree listing
   G5 imports     compareRevisions(c5, c6, a) reports the provider's node change as an imported node
                  (origin imported, cause provider), with each side resolved from its own revision
                                                     rejects: working-copy providers
   G5b unfetched  resolve('pr:8') fetches the PR head's objects only (no ref, FETCH_HEAD, index or
                  working-tree change) and the compare reads it              rejects: ref-creating fetch
   G6 read-only   status --porcelain=v2, HEAD, for-each-ref and the index hash are unchanged after
                  every call; fetch() changes only refs/remotes/*          rejects: any write
   G7 status      status(): clone path, last fetch time (FETCH_HEAD mtime or null), gh signed in as
                  <login>; a failing gh gives signedIn false and the command "gh auth login"
                                                     rejects: token in the status payload */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),fss=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));

const {git,cleanEnv,fixture,ghStub,snapshot}=require('./helpers/compare-git-fixture.cjs');
async function adapter(f,opts){
  /* Before #849 the module does not exist: fail on the export assertion below, not on the import. */
  const mod=await import('../tools/compare/git-revisions.mjs').catch(()=>({}));
  assert.equal(typeof mod.GitRevisions,'function','tools/compare/git-revisions.mjs exports GitRevisions');
  return new mod.GitRevisions({directory:f.dir,gh:opts && opts.gh || ghStub(f.c)});
}
/* The shared engine, loaded the way the compare-engine tests load it. */
function engine(){const C={URL,console};vm.createContext(C);vm.runInContext(readSource('validator.js'),C);vm.runInContext(readSource('canon.js'),C);return C;}
function sideOf(C,raw,context){if(raw==null)return null;return {authored:C.normalize(plain(raw)),resolved:C.normalize(context?C.FlowTopology.resolveSource(plain(raw),context):plain(raw)),ledger:null};}
const show=(f,rev,file)=>JSON.parse(git(f.dir,['show',rev+':'+file]));
const A='flows/a.spec.json';

test('G1 revision tabs list dated, attributed rows with badges, search and pages',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c;
    assert.equal(typeof r.revisions,'function','GitRevisions#revisions');
    const doc=await r.revisions({doc:A,tab:'document'});
    assert.deepEqual(doc.rows.map(x=>x.sha),[c.c7,c.c5,c.c3,c.c2,c.c1],'commits whose first-parent diff changes the document, newest first');
    const row=x=>doc.rows.find(y=>y.sha===x);
    assert.deepEqual(plain(row(c.c3)),{sha:c.c3,short:c.c3.slice(0,7),date:'2026-01-03T10:00:00Z',author:'Carol',subject:'Reword step',branches:['feature','origin/feature'],tags:[],prs:[7],touches:true,available:true});
    assert.deepEqual(row(c.c2).tags,['v1']);assert.deepEqual(row(c.c7).branches,['main','origin/main']);assert.deepEqual(row(c.c5).subject,'Merge feature');
    const all=await r.revisions({doc:A,tab:'all'});
    assert.deepEqual(all.rows.map(x=>x.sha),[c.c7,c.c6,c.c5,c.c4,c.c3,c.c2,c.c1]);
    assert.deepEqual(all.rows.map(x=>x.touches),[true,false,true,false,true,true,true],'touches = the first-parent diff changes the document');
    assert.deepEqual((await r.revisions({doc:A,tab:'branches'})).rows.map(x=>[x.branches,x.sha]),[[['feature','origin/feature'],c.c3],[['main','origin/main'],c.c7]],'one row per branch tip, local and remote-tracking names, sorted by name');
    assert.deepEqual((await r.revisions({doc:A,tab:'tags'})).rows.map(x=>[x.tags,x.sha]),[[['v1'],c.c2]]);
    const prs=(await r.revisions({doc:A,tab:'prs'})).rows;
    assert.deepEqual(prs.map(x=>[x.prs,x.sha,x.subject,x.author,x.available]),[[[8],c.pr8,'Fork change','fork',false],[[7],c.c3,'Feature step','carol',true]]);
    assert.deepEqual((await r.revisions({doc:A,tab:'all',q:'provider'})).rows.map(x=>x.sha),[c.c6],'search matches the subject');
    assert.deepEqual((await r.revisions({doc:A,tab:'all',q:'carol'})).rows.map(x=>x.sha),[c.c3],'search matches the author');
    assert.deepEqual((await r.revisions({doc:A,tab:'all',q:'v1'})).rows.map(x=>x.sha),[c.c2],'search matches a tag');
    assert.deepEqual([all.page,all.pages,all.total],[1,1,7]);
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G1 pages hold at most 100 rows',async()=>{
  const f=await fixture();
  try{
    for(let i=0;i<130;i++)git(f.dir,['commit','-q','--allow-empty','-m','Empty '+i],{GIT_AUTHOR_DATE:'2026-02-01T10:00:00Z',GIT_COMMITTER_DATE:'2026-02-01T10:00:00Z'});
    const r=await adapter(f),p1=await r.revisions({doc:A,tab:'all'}),p2=await r.revisions({doc:A,tab:'all',page:2});
    assert.deepEqual([p1.rows.length,p1.page,p1.pages,p1.total],[100,1,2,137]);assert.deepEqual([p2.rows.length,p2.page],[37,2]);
    assert.equal(new Set(p1.rows.concat(p2.rows).map(x=>x.sha)).size,137,'pages do not overlap');
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G2 names resolve to full SHAs; sides read the blob at that commit; the change list is the engine output',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c;
    assert.equal(await r.resolve('main'),c.c7);assert.equal(await r.resolve('feature'),c.c3);assert.equal(await r.resolve('v1'),c.c2);
    assert.equal(await r.resolve(c.c4.slice(0,7)),c.c4);assert.equal(await r.resolve('pr:7'),c.c3);
    await assert.rejects(r.resolve('no-such-branch'),/unknown revision/i);await assert.rejects(r.resolve('main;rm -rf /'),/unknown revision/i);
    await fs.writeFile(path.join(f.dir,A),'dirty working copy');/* reads never come from the working tree */
    const side=await r.side(c.c7,A);
    assert.deepEqual(plain(side.raw),show(f,c.c7,A));
    assert.deepEqual(plain(side.context.specs.map(s=>s.page.canon.id)).sort(),['doc-a','new','provider'],'context = every spec of that revision');
    const C=engine(),expected=C.compareDocuments(sideOf(C,show(f,c.c2,A),{version:1,id:'doc-a',specs:[show(f,c.c2,'flows/p.spec.json'),show(f,c.c2,A),show(f,c.c2,'flows/old.spec.json')]}),
      sideOf(C,show(f,c.c7,A),{version:1,id:'doc-a',specs:[show(f,c.c7,'flows/p.spec.json'),show(f,c.c7,A),show(f,c.c7,'flows/new.spec.json')]}));
    assert.deepEqual(plain(await r.compareRevisions(c.c2,c.c7,A)),plain(expected));
    await assert.rejects(r.side('main',A),/immutable/,'sides take resolved full SHAs only');
    await assert.rejects(r.side(c.c7,'../secret.json'),/relative/);
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G3 between lists the commits from From to To that change the document, merges by first parent',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c,rows=await r.between({from:c.c1,to:c.c7,doc:A});
    assert.deepEqual(rows.map(x=>x.sha),[c.c7,c.c5,c.c3,c.c2]);
    assert.deepEqual(plain(rows.find(x=>x.sha===c.c5)),{sha:c.c5,short:c.c5.slice(0,7),parent:c.c4,date:'2026-01-05T10:00:00Z',author:'Bob',subject:'Merge feature',prs:[7]});
    assert.equal(rows.find(x=>x.sha===c.c3).parent,c.c2);assert.deepEqual(rows.find(x=>x.sha===c.c3).prs,[7]);
    /* "Compare this commit" on the merge = first parent vs merge: the feature's step text change. */
    const entries=await r.compareRevisions(c.c4,c.c5,A);
    assert.ok(entries.some(e=>e.kind==='step' && e.status==='modified'),'the merge brings the step text change');
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G4 documents and changed documents come from the commits, not the working tree',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c;
    await fs.writeFile(path.join(f.dir,'flows/untracked.spec.json'),'{}');
    assert.deepEqual(await r.documents(c.c7),['flows/a.spec.json','flows/new.spec.json','flows/p.spec.json']);
    assert.deepEqual(await r.documents(c.c1),['flows/a.spec.json','flows/old.spec.json','flows/p.spec.json']);
    assert.deepEqual(plain(await r.changedDocuments(c.c6,c.c7)),[{path:'flows/a.spec.json',status:'modified'},{path:'flows/new.spec.json',status:'added'},{path:'flows/old.spec.json',status:'removed'}]);
    assert.equal(await r.side(c.c6,'flows/new.spec.json'),null,'a document absent at a revision is null');
    const added=await r.compareRevisions(c.c6,c.c7,'flows/new.spec.json');
    assert.deepEqual(plain(added.filter(e=>e.kind==='document').map(e=>e.status)),['added']);
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G5 an imported node changed by its provider between revisions is an imported change',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c,entries=await r.compareRevisions(c.c5,c.c6,A);
    const imported=entries.filter(e=>e.kind==='node' && e.origin==='imported');
    assert.equal(imported.length,1,'one imported node change: '+JSON.stringify(entries.map(e=>[e.kind,e.status,e.origin,e.cause])));
    assert.deepEqual(plain([imported[0].status,imported[0].cause,imported[0].key]),['modified','provider',{before:'child::p2',after:'child::p2'}]);
    assert.ok(imported[0].fields.some(x=>x.before==='P two' && x.after==='P two changed'),'values come from the provider at each revision');
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G5b an unfetched pull request head is read without creating refs or touching the index',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c,before=snapshot(f.dir);
    assert.throws(()=>git(f.dir,['cat-file','-e',c.pr8+'^{commit}']),'precondition: the PR head is not in the clone');
    assert.equal(await r.resolve('pr:8'),c.pr8);
    assert.equal(git(f.dir,['cat-file','-t',c.pr8]),'commit','the objects are now present');
    assert.deepEqual(snapshot(f.dir),before,'no ref, FETCH_HEAD, index or working-tree change');
    const entries=await r.compareRevisions(c.c7,c.pr8,A);
    assert.ok(entries.some(e=>e.kind==='node' && e.fields.some(x=>x.after==='Alpha from PR 8')));
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G6 every call is read-only; fetch changes only remote-tracking refs',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),c=f.c,before=snapshot(f.dir);
    await r.status();await r.documents(c.c7);await r.changedDocuments(c.c1,c.c7);
    for(const tab of ['document','all','branches','tags','prs'])await r.revisions({doc:A,tab});
    await r.between({from:c.c1,to:c.c7,doc:A});await r.resolve('main');await r.side(c.c7,A);await r.compareRevisions(c.c1,c.c7,A);
    assert.deepEqual(snapshot(f.dir),before,'no call changes the clone');
    /* A new branch on the remote: fetch brings it in as a remote-tracking ref only. */
    git(f.other,['push','-q','origin','HEAD:refs/heads/remote-only']);
    await r.fetch();
    const after=snapshot(f.dir);
    assert.equal(after.status,before.status);assert.equal(after.head,before.head);assert.equal(after.index,before.index);
    const changed=after.refs.split('\n').filter(l=>!before.refs.split('\n').includes(l)).map(l=>l.split(' ')[0]);
    assert.ok(changed.length>0,'fetch brought something in');
    assert.ok(changed.every(ref=>ref.startsWith('refs/remotes/')),'only remote-tracking refs change: '+JSON.stringify(changed));
    assert.ok((await r.revisions({doc:A,tab:'branches'})).rows.some(x=>x.branches.includes('origin/remote-only')),'the fetched branch is listed');
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('G7 status names the clone, the last fetch and the gh sign-in, never the token',async()=>{
  const f=await fixture();
  try{
    const r=await adapter(f),s=await r.status();
    assert.equal(s.path,f.dir);assert.equal(s.gh.signedIn,true);assert.equal(s.gh.login,'octo');
    const fetchHead=path.join(f.dir,'.git','FETCH_HEAD');
    assert.equal(s.lastFetch,new Date(fss.statSync(fetchHead).mtimeMs).toISOString());
    assert.ok(!JSON.stringify(s).includes('gho_SECRET_TOKEN_123'));
    const off=await adapter(f,{gh:ghStub(f.c,{fail:true})}),s2=await off.status();
    assert.deepEqual(plain(s2.gh),{signedIn:false,login:null,command:'gh auth login'});
    const local=await off.revisions({doc:A,tab:'document'});assert.equal(local.rows.length,5,'local tabs work without gh');
    const prs=await off.revisions({doc:A,tab:'prs'});assert.deepEqual(plain([prs.rows,prs.error]),[[],'Not signed in to GitHub. Run: gh auth login']);
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
