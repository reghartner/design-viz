/* Git Compare stress (issue #849, PR 3 of 3; Chuck 2026-10-31: "stress testing").
   A generated clone with 500 commits, 60 spec documents and 40 branches, served by the command-line
   server (tools/compare/serve.mjs) in its own process so its child processes and memory can be read.

   CONTRACT MATRIX (issue #849 "Stress")
   row  contract                                  fixture / action                          scoped assertion                              rejects
   S0   revision lists are paged and every page   GET /api/revisions tab=all (500 rows) and  every page <= 100 rows; all-commits pages     unpaged lists; a page cost that grows
        costs about the same                      tab=branches, document, tags; median of 3  together list each commit once (500);         with the page number (re-reading all
                                                  timings per page                          every page's median <= 2x page 1's median     earlier pages)
   S1   50 Compare navigations leave one view     All changed documents, From = commit 1;   after each: the document list has one row per  a view whose destroy() never runs; a host
                                                                                            spec changed in that range (git diff); exactly
                                                                                            one .compare-view, the
                                                  To := 50 different commits in the picker,  previous root detached, liveOwners() equal    that keeps old content
                                                  Compare each time (real clicks/keys)      to its value after the first navigation
   S2   no leftover git/gh processes; memory      same 50 navigations                       server has no git/gh child process after the   leaked child processes; memory that grows
        stays flat                                                                          50th; server RSS after the 50th <= 1.2x RSS   with every navigation
                                                                                            after the 5th
   AU   no page/console error, failed request, HTTP >= 400 or request outside the server
   The server runs with the documented command, node --max-semi-space-size=1 tools/compare/serve.mjs (its header
   says why: by default V8 grows its young generation by tens of MB under steady requests during the first ~50
   navigations and then levels off, measured 103 MB after 5, 158 MB after 50, 164 MB after 200, with no leak;
   the long-running local server keeps that fixed, so RSS growth means retained memory).
   S0 also asserts the fixture's size: 60 documents at main and 41 branch rows (main + 40). */
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {git,cleanEnv,ghExecutable}=require('../../../tests/helpers/compare-git-fixture.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const COMMITS=500,DOCS=60,BRANCHES=40;
const docName=i=>'flows/d'+String(i).padStart(2,'0')+'.spec.json';
const subject=i=>'Commit #'+String(i).padStart(4,'0');
function docText(i,version){
  const nodes={a:{title:'Doc '+i+' a v'+version},b:{title:'Doc '+i+' b'},c:{title:'Doc '+i+' c'}};
  return JSON.stringify({page:{title:'Doc '+i,sections:[{id:'main',heading:'Main',diagram:{nodes,rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],steps:[{id:'s1',nodes:['a'],text:'Doc '+i+' step v'+version}]}}]}},null,2)+'\n';
}
/* One git fast-import stream: commit 0 adds every document; commit i > 0 edits document i % 60
   (and every 7th commit also document (i + 30) % 60); 40 branches and 10 tags on earlier commits. */
function generate(dir){
  git(dir,['init','-q','-b','main']);
  const out=[],version=new Array(DOCS).fill(0);
  const data=text=>{const b=Buffer.from(text);out.push('data '+b.length+'\n'+text+'\n');};
  for(let i=0;i<COMMITS;i++){
    const when=Math.floor(Date.parse('2026-01-01T00:00:00Z')/1000)+i*600;
    out.push('commit refs/heads/main\nmark :'+(i+1)+'\nauthor Gen <gen@example.test> '+when+' +0000\ncommitter Gen <gen@example.test> '+when+' +0000\n');
    data(subject(i));
    if(i)out.push('from :'+i+'\n');
    const touched=i===0?Array.from({length:DOCS},(_,k)=>k):[i%DOCS].concat(i%7===0?[(i+30)%DOCS]:[]);
    for(const k of touched){version[k]=i;out.push('M 100644 inline '+docName(k)+'\n');data(docText(k,version[k]));}
  }
  for(let b=0;b<BRANCHES;b++)out.push('reset refs/heads/b'+String(b).padStart(2,'0')+'\nfrom :'+(b*12+5)+'\n\n');
  for(let t=0;t<10;t++)out.push('reset refs/tags/t'+t+'\nfrom :'+(t*45+3)+'\n\n');
  execFileSync('git',['-C',dir,'fast-import','--quiet'],{input:out.join(''),env:cleanEnv(),maxBuffer:1<<28});
  git(dir,['checkout','-q','-f','main']);
  return git(dir,['rev-list','--reverse','main']).split('\n');
}
const children=pid=>execFileSync('ps',['-A','-o','pid=,ppid=,comm='],{encoding:'utf8'}).split('\n').map(l=>l.trim().split(/\s+/))
  .filter(f=>Number(f[1])===pid).map(f=>({pid:Number(f[0]),comm:f.slice(2).join(' ')}));
const rss=pid=>Number(execFileSync('ps',['-o','rss=','-p',String(pid)],{encoding:'utf8'}).trim());
const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];

const stress=test.extend({
  clone:[async({},use)=>{
    const top=await mkdtemp(path.join(os.tmpdir(),'compare-stress-')),dir=path.join(top,'clone');
    execFileSync('mkdir',[dir]);
    const shas=generate(dir);
    const bin=await ghExecutable(top,{c3:shas[3],c5:shas[5]});
    /* The documented command (tools/compare/serve.mjs header): node --max-semi-space-size=1 tools/compare/serve.mjs --repo <clone>. */
    const server=spawn(process.execPath,['--max-semi-space-size=1',path.join(root,'tools/compare/serve.mjs'),'--repo',dir,'--port','0'],
      {env:Object.assign(cleanEnv(),{PATH:bin+path.delimiter+process.env.PATH}),stdio:['ignore','pipe','pipe']});
    const url=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',d=>{text+=d;const m=/http:\/\/127\.0\.0\.1:\d+\//.exec(text);if(m)resolve(m[0]);});
      server.once('exit',code=>reject(new Error('server exited '+code)));});
    try{await use({dir,shas,url,pid:server.pid});}
    finally{server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));await rm(top,{recursive:true,force:true});}
  },{scope:'worker',timeout:120000}],
  errors:[async({context,page,clone},use)=>{
    const errors=[];
    page.on('pageerror',e=>errors.push('page: '+e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
    context.on('request',r=>{const u=r.url();if(!u.startsWith(clone.url)&&!/^(data|blob|about):/.test(u))errors.push('outbound: '+u);});
    context.on('requestfailed',r=>errors.push('request failed: '+r.url()));
    context.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+': '+r.url());});
    await context.route(/^https?:/,route=>route.request().url().startsWith(clone.url)?route.continue():route.abort());
    await use(errors);
    expect(errors,'no page/console/request errors or outbound requests').toEqual([]);
  },{auto:true}],
});

stress('S0: revision lists come in pages of at most 100 rows, each within 2x the first page time',async({clone})=>{
  stress.setTimeout(300000);
  const get=async query=>{const t=performance.now();const r=await fetch(clone.url+'api/revisions?'+query);const body=await r.json();expect(r.status,query).toBe(200);return {ms:performance.now()-t,body};};
  const documents=await (await fetch(clone.url+'api/documents?rev=main')).json();
  expect(documents,'precondition: 60 documents').toEqual(Array.from({length:DOCS},(_,i)=>docName(i)));
  const branches=await (await fetch(clone.url+'api/revisions?doc='+encodeURIComponent(docName(0))+'&tab=branches&page=1')).json();
  expect(branches.total,'precondition: 40 branches plus main').toBe(BRANCHES+1);
  for(const [tab,doc] of [['all',docName(0)],['branches',docName(0)],['document',docName(7)],['tags',docName(0)]]){
    const first=await get('doc='+encodeURIComponent(doc)+'&tab='+tab+'&page=1'),pages=first.body.pages,times=[],seen=[];
    if(tab==='all')expect([first.body.total,pages],'precondition: 500 commits in 5 pages').toEqual([COMMITS,5]);
    for(let p=1;p<=pages;p++){
      const runs=[];let body;
      for(let k=0;k<3;k++){const r=await get('doc='+encodeURIComponent(doc)+'&tab='+tab+'&page='+p);runs.push(r.ms);body=r.body;}
      expect(body.rows.length,tab+' page '+p).toBeLessThanOrEqual(100);
      seen.push(...body.rows.map(r=>r.sha));times.push(median(runs));
    }
    if(tab==='all')expect(new Set(seen).size,'every commit once').toBe(COMMITS);
    for(let p=1;p<times.length;p++)expect(times[p],tab+' page '+(p+1)+' ms vs page 1 '+times[0].toFixed(1)+' ms').toBeLessThanOrEqual(2*times[0]);
  }
});

stress('S1 S2: 50 Compare navigations keep one live view, leave no git/gh process and keep memory flat',async({page,clone})=>{
  stress.setTimeout(600000);
  const {shas}=clone;
  await page.setViewportSize({width:1440,height:900});
  await page.goto(clone.url);
  const comparison=page.getByRole('region',{name:'Comparison',exact:true}),views=comparison.locator('.compare-view');
  await expect(page.getByLabel('Document',{exact:true})).toHaveValue(docName(0));
  await expect(page.getByLabel('Document',{exact:true}).locator('option[value="all"]')).toHaveText('All changed documents');
  await page.getByLabel('Document',{exact:true}).selectOption('all');
  async function choose(side,i){
    await page.getByRole('button',{name:'Choose '+side+' revision'}).click();
    const dialog=page.getByRole('dialog',{name:side+' revisions'});await expect(dialog).toBeVisible();
    await dialog.getByRole('tab',{name:'All commits'}).click();
    await dialog.getByRole('searchbox',{name:'Search revisions'}).fill(subject(i));
    const option=dialog.getByRole('option').filter({has:page.locator('[data-field="sha"]',{hasText:shas[i].slice(0,7)})});
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await option.click();await expect(dialog).toBeHidden();
  }
  await choose('From',1);
  let owners=null,previous=null,rss5=null;
  for(let n=0;n<50;n++){
    const to=10+n*9;
    await choose('To',to);
    await page.getByRole('button',{name:'Compare',exact:true}).click();
    await expect(comparison.locator('.compare-pane[data-side="after"] .compare-pane-title')).toHaveText('After · '+shas[to].slice(0,7)+' · '+subject(to));
    await expect(comparison).not.toHaveAttribute('aria-busy','true');
    await expect(views).toHaveCount(1);
    /* All changed documents: the document list holds every spec changed from commit 1 to this one. */
    const changed=git(clone.dir,['diff','--name-only',shas[1],shas[to],'--','*.spec.json']).split('\n').filter(Boolean).length;
    expect(changed,'precondition: several documents change').toBeGreaterThan(1);
    await expect(comparison.getByRole('navigation',{name:'Changed documents'}).getByRole('button')).toHaveCount(changed);
    if(previous)expect(await previous.evaluate(el=>el.isConnected),'navigation '+(n+1)+': previous view removed').toBe(false);
    previous=await views.elementHandle();
    const live=await page.evaluate(()=>window.FlowviewCompare.liveOwners());
    if(owners===null){owners=live;expect(owners,'precondition: a mounted view owns renders').toBeGreaterThan(0);}
    else await expect.poll(()=>page.evaluate(()=>window.FlowviewCompare.liveOwners()),'navigation '+(n+1)+': one live view').toBe(owners);
    if(n===4){await expect.poll(()=>children(clone.pid).length).toBe(0);rss5=rss(clone.pid);}
  }
  await expect.poll(()=>children(clone.pid).filter(p=>/(^|\/)(git|gh)$/.test(p.comm)),{message:'no git/gh child process after 50 navigations'}).toEqual([]);
  expect(children(clone.pid),'no child process at all').toEqual([]);
  const rss50=rss(clone.pid);
  expect(rss50,'server RSS after 50 navigations ('+rss50+' KB) vs after 5 ('+rss5+' KB)').toBeLessThanOrEqual(1.2*rss5);
});
