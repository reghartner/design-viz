/* Git Compare picker page (issue #849, PR 2 of 3): tools/compare/index.html served by
   tools/compare/serve.mjs on a temporary clone (tests/helpers/compare-git-fixture.cjs).
   Contract: issue #849 "How it should look" + browser contract rows 0, 1, 2, 4, 6 and "Untrusted
   text" (rows 3 and 5, the compare view and the all-documents rail, belong to PR 3). Chuck
   2026-11-01: coverage "As written in #849"; the gh token stays in the server process.

   Fixture history (all dates 2026-01-0N 10:00 UTC; doc = flows/a.spec.json):
     c1 Alice "Add flows" (a, p, old)     c2 Bob "Rename alpha" (a; tag v1)
     c3 Carol "Reword step" (a; branch feature, PR #7 head)    c4 Alice "Docs only" (README)
     c5 Bob "Merge feature" (merge of feature; PR #7 merge commit)   c6 Dana "Provider rename" (p)
     c7 Alice "Final pass" (a, new added, old removed; main)   PR #8 head only at refs/pull/8/head
   Selection model: no revision is chosen when the page opens; the Document list then shows HEAD.

   CONTRACT MATRIX
   row  contract                                fixture / action                       scoped assertion                                rejects
   H0   header clone path + last fetch          FETCH_HEAD mtime set to 2026-01-09 10:00  [data-testid=clone-state] text exact:          hard-coded or missing path; local-time
                                                                                       "Clone: <dir> · last fetch 2026-01-09 10:00 UTC"  formatting
   H1   header signed-in                        gh stub signed in as octo               [data-testid=gh-state] "GitHub: signed in as octo"  static text
   H1b  header signed-out + recovery command    gh stub that fails every call           gh-state "GitHub: not signed in. Run: gh auth login"  showing "signed in" on failure
   H1c  PR tab signed-out, local tabs work      same; open From, Pull requests, Branches  PR tab alert = server message, 0 options;      PR failure breaking every tab
                                                                                       Branches rows still listed (no PR badges)
   D0   Document lists every spec in To         page opens (HEAD = c7), then To := c1   select options exactly [a,new,p] then          listing working-tree files; ignoring To
                                                                                       [a,old,p]
   D1   kept document missing in To             select new, then To := c1               options [a, "new (not in To)", old, p], new     silently switching document
                                                                                       still selected
   D2   choosing a document reloads revisions   select p; open From, document tab       rows exactly c6, c1 with "changes this document"  revision list fixed to the first doc
   P0   each tab's rows (date, author, short    open From; every tab                    each option's [data-field] date/author/sha/      wrong order, missing badge kinds,
        SHA, subject, badges)                                                          subject and [data-field=badge] list exact        local-time dates, PR tab without gh
   P1   search filters rows                     All commits, type "rename"              options exactly c6, c2; clear restores 7        client ignoring the query
   P2   pick a row sets the side                From := c2 (All commits); To := PR #7   [data-testid=from-choice] / to-choice text      picker that never commits the choice
   P2b  unfetched PR head is usable             From := c7, To := PR #8 (only on remote) between rows exactly [PR eight, PR #8]; no ref   choosing a PR by raw SHA (server cannot
                                                                                       added                                            resolve an unfetched head)
   P3   Swap exchanges the sides                before: between c2..PR #7 = [c3]; Swap   from-choice shows PR #7 row, to-choice c2 row;  Swap that copies one side or only
                                                                                       between list empty (c3..c2)                      swaps the labels
   P4   paging                                  gh stub with 150 extra PRs              100 options, "Show more" -> 152 with PR numbers  unpaged list; dropped or repeated rows
                                                                                       exactly #8, #7, #249..#100; button gone
   B0   between rows exact                      From := c1 (document tab), To := c7      region "Between these revisions" items:          rows from both directions; missing PR
                                                                                       c7, c5, c3, c2 with date, sha, subject, PR     badge; touching-only filter missing
   B1   "Compare this commit" on the merge       click it on the c5 row                  from-choice = c4 row (first parent), to-choice   second parent; commit vs itself
                                                                                       = c5; between rows then c5, c3
   B2   empty between list                      Swap (From c7, To c1)                   region text "No commits between these          stale rows from the previous pair
                                                                                       revisions change this document."
   F0   Fetch adds a new remote branch           push branch late to the bare remote;    To Branches has no origin/late before; after    fetch that never runs; page not
                                                click Fetch                             Fetch a row with badge origin/late; header       refreshing; fetch writing HEAD/worktree
                                                                                       last fetch = new FETCH_HEAD mtime; only
                                                                                       refs/remotes/origin/late changed; HEAD, status,
                                                                                       index equal
   U0   untrusted text renders literally        commit subject, branch, tag, PR title    each field's textContent equals the payload;   innerHTML rendering anywhere
                                                and PR author carry HTML payloads       no <img>/<script> in pickers or between list;
                                                                                       window.__pwned undefined
   P5   PR head that cannot be fetched           gh lists PR #10 with a head SHA that      click PR #10: dialog stays open, that option has   picker that records an unusable choice
                                                exists nowhere                          aria-disabled=true and "not available locally";  or hides the failure
                                                                                       to-choice still "No revision chosen"
   P6   Compare this commit inside a fetched     PR #11 = two commits only at              To := PR #11; between rows two2, two1; Compare   parent lookup limited to ref-reachable
        multi-commit PR                         refs/pull/11/head on the remote          this commit on two2 -> from-choice "<two1> ·     commits; no ref created
                                                                                       first parent of <two2>", between rows [two2];
                                                                                       no ref added
   AU   every test, context-wide (all pages): no page/console error, failed request, HTTP >= 400, or request outside the compare server
   U1   page CSP                                response headers of "/"                 script-src 'self', no 'unsafe-inline'           inline script allowed
   Git refuses "<" and ">" in author names, so the hostile author comes from the PR author login. */
import {test as base,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {rm,utimes,stat,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {createCompareServer} from '../../compare/serve.mjs';
const require=createRequire(import.meta.url);
const {git,fixture,ghStub,snapshot,refChanges}=require('../../../tests/helpers/compare-git-fixture.cjs');
const A='flows/a.spec.json',P='flows/p.spec.json',NEW='flows/new.spec.json',OLD='flows/old.spec.json';
const HOSTILE='<img src=x onerror=window.__pwned=1><script>window.__pwned=1</script>';
const HOSTILE_BRANCH='x<img/src=x/onerror=window.__pwned=1>',HOSTILE_TAG='<script>window.__pwned=1</script>';
const FETCHED=new Date('2026-01-09T10:00:00Z');

const test=base.extend({
  repo:async({},use)=>{const f=await fixture();try{await use(f);}finally{await rm(f.root,{recursive:true,force:true});}},
  /* Opens the page on a server for the fixture clone; servers close after the test. */
  open:async({page,repo,errors},use)=>{
    const servers=[];
    await use(async(gh)=>{
      await utimes(path.join(repo.dir,'.git','FETCH_HEAD'),FETCHED,FETCHED);
      const server=await createCompareServer({directory:repo.dir,gh:gh||ghStub(repo.c)});servers.push(server);
      errors.origins.push('http://127.0.0.1:'+server.address().port);
      const response=await page.goto('http://127.0.0.1:'+server.address().port+'/');
      return response;
    });
    for(const s of servers)await new Promise(resolve=>s.close(resolve));
  },
  /* Page errors, console errors, failed requests, HTTP errors and any request that leaves the
     compare server's origin all fail the test. */
  errors:[async({context,page},use)=>{
    const errors=[],origins=[],allowed=[];
    /* A test may expect one HTTP error status for one URL pattern; only that is excused. */
    const excused=(url,status)=>allowed.some(a=>a.re.test(url)&&(status===undefined||status===a.status));
    /* Context-wide: every page of the context, including popups. */
    const watch=p=>{p.on('pageerror',e=>errors.push('page: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!(/^Failed to load resource/.test(m.text())&&excused(m.location()?.url||'')))errors.push('console: '+m.text());});};
    context.pages().forEach(watch);context.on('page',watch);
    context.on('request',r=>{const url=r.url();if(!origins.some(o=>url.startsWith(o+'/'))&&!/^(data|blob|about):/.test(url))errors.push('outbound: '+url);});
    context.on('requestfailed',r=>errors.push('request failed: '+r.url()+' '+(r.failure()?.errorText||'')));
    context.on('response',r=>{if(r.status()>=400&&!excused(r.url(),r.status()))errors.push('HTTP '+r.status()+': '+r.url());});
    await context.route(/^https?:/,route=>{const url=route.request().url();return origins.some(o=>url.startsWith(o+'/'))?route.continue():route.abort();});
    errors.origins=origins;errors.allow=(status,re)=>allowed.push({status,re});
    await use(errors);
    expect([...errors],'no page/console/request errors or outbound requests').toEqual([]);
  },{auto:true}],
});

const short=sha=>sha.slice(0,7);
const day=n=>'2026-01-0'+n+' 10:00';
/* One commit row as the page shows it. */
function row(c,key,author,subject,n,badges){return {date:day(n),author,sha:short(c[key]),subject,badges};}
const fieldsOf=els=>els.map(e=>{
  const f=name=>{const el=e.querySelector('[data-field="'+name+'"]');return el?el.textContent:null;};
  return {date:f('date'),author:f('author'),sha:f('sha'),subject:f('subject'),badges:[...e.querySelectorAll('[data-field="badge"]')].map(b=>b.textContent)};
});
const options=dialog=>dialog.getByRole('option').evaluateAll(fieldsOf);
const shas=dialog=>dialog.getByRole('option').evaluateAll(els=>els.map(e=>e.querySelector('[data-field="sha"]').textContent));
const picker=(page,side)=>page.getByRole('dialog',{name:side+' revisions'});
async function openPicker(page,side){
  const trigger=page.getByRole('button',{name:'Choose '+side+' revision'});
  await expect(trigger).toBeVisible();await trigger.click();
  const dialog=picker(page,side);await expect(dialog).toBeVisible();return dialog;
}
async function choose(page,side,tab,sha){
  const dialog=await openPicker(page,side);
  await dialog.getByRole('tab',{name:tab}).click();
  await expect(dialog.getByRole('tab',{name:tab})).toHaveAttribute('aria-selected','true');
  const option=dialog.getByRole('option').filter({has:page.locator('[data-field="sha"]',{hasText:short(sha)})}).first();
  await option.click();await expect(dialog).toBeHidden();
}
const choice=(page,side)=>page.getByTestId(side.toLowerCase()+'-choice');
const choiceText=r=>[r.sha,r.date,r.author,r.subject].join(' · ');
const documentOptions=page=>page.getByLabel('Document').locator('option').evaluateAll(els=>els.map(e=>[e.value,e.textContent]));
const between=page=>page.getByRole('region',{name:'Between these revisions'});
const betweenRows=page=>between(page).getByRole('listitem').evaluateAll(els=>els.map(e=>{
  const f=name=>{const el=e.querySelector('[data-field="'+name+'"]');return el?el.textContent:null;};
  return {date:f('date'),sha:f('sha'),subject:f('subject'),prs:[...e.querySelectorAll('[data-field="pr"]')].map(b=>b.textContent)};
}));
const utc=d=>d.toISOString().slice(0,16).replace('T',' ')+' UTC';

test('H0 H1 D0 D1 D2: header, Document list from the To revision, and the document drives the revision list',async({page,repo,open})=>{
  const {c}=repo;await open();
  await expect(page.getByTestId('clone-state')).toHaveText('Clone: '+repo.dir+' · last fetch 2026-01-09 10:00 UTC');
  await expect(page.getByTestId('gh-state')).toHaveText('GitHub: signed in as octo');
  /* D0: nothing chosen yet, so the Document list is HEAD's (c7): new exists, old does not. */
  await expect(choice(page,'To')).toHaveText('No revision chosen');
  await expect.poll(()=>documentOptions(page)).toEqual([[A,A],[NEW,NEW],[P,P]]);
  await expect(page.getByLabel('Document')).toHaveValue(A);
  await choose(page,'To','All commits',c.c1);
  await expect.poll(()=>documentOptions(page)).toEqual([[A,A],[OLD,OLD],[P,P]]);
  await expect(page.getByLabel('Document')).toHaveValue(A);
  /* D1: a chosen document missing from To stays chosen and is marked. */
  await choose(page,'To','All commits',c.c7);
  await expect.poll(()=>documentOptions(page)).toEqual([[A,A],[NEW,NEW],[P,P]]);
  await page.getByLabel('Document').selectOption(NEW);
  await choose(page,'To','All commits',c.c1);
  await expect.poll(()=>documentOptions(page)).toEqual([[A,A],[NEW,NEW+' (not in To)'],[OLD,OLD],[P,P]]);
  await expect(page.getByLabel('Document')).toHaveValue(NEW);
  /* D2: the document tab lists the commits that changed the chosen document. */
  let dialog=await openPicker(page,'From');
  await expect.poll(()=>shas(dialog)).toEqual([short(c.c7)]);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await page.getByLabel('Document').selectOption(P);
  dialog=await openPicker(page,'From');
  await expect(dialog.getByRole('tab',{name:'Revisions of this document'})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>options(dialog)).toEqual([
    row(c,'c6','Dana','Provider rename',6,['changes this document']),
    row(c,'c1','Alice','Add flows',1,['changes this document'])]);
});

test('P0 P1 P2 P3: every tab lists dated rows with badges; search filters; picks set each side; Swap exchanges them',async({page,repo,open})=>{
  const {c}=repo;await open();
  const dialog=await openPicker(page,'From');
  const ch='changes this document';
  const r7=row(c,'c7','Alice','Final pass',7,['main','origin/main',ch]);
  const r6=row(c,'c6','Dana','Provider rename',6,[]);
  const r5=row(c,'c5','Bob','Merge feature',5,['PR #7',ch]);
  const r4=row(c,'c4','Alice','Docs only',4,[]);
  const r3=row(c,'c3','Carol','Reword step',3,['feature','origin/feature','PR #7',ch]);
  const r2=row(c,'c2','Bob','Rename alpha',2,['v1',ch]);
  const r1=row(c,'c1','Alice','Add flows',1,[ch]);
  await expect.poll(()=>options(dialog)).toEqual([r7,r5,r3,r2,r1]);
  const tabs=[['All commits',[r7,r6,r5,r4,r3,r2,r1]],['Branches',[r3,r7]],['Tags',[r2]],
    ['Pull requests',[{date:'2026-01-08 12:00',author:'fork',sha:short(c.pr8),subject:'Fork change',badges:['PR #8']},
      {date:'2026-01-03 12:00',author:'carol',sha:short(c.c3),subject:'Feature step',badges:['feature','origin/feature','PR #7',ch]}]],
    ['Revisions of this document',[r7,r5,r3,r2,r1]]];
  for(const [tab,expected] of tabs){
    await dialog.getByRole('tab',{name:tab}).click();
    await expect(dialog.getByRole('tab',{name:tab})).toHaveAttribute('aria-selected','true');
    await expect.poll(()=>options(dialog),tab).toEqual(expected);
  }
  /* P1: search. */
  await dialog.getByRole('tab',{name:'All commits'}).click();
  await expect.poll(()=>options(dialog)).toHaveLength(7);
  const search=dialog.getByRole('searchbox',{name:'Search revisions'});
  await search.pressSequentially('rename');
  await expect.poll(()=>shas(dialog)).toEqual([short(c.c6),short(c.c2)]);
  await search.fill('');await expect.poll(()=>options(dialog)).toHaveLength(7);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  /* P2: picks. */
  await expect(choice(page,'From')).toHaveText('No revision chosen');
  await choose(page,'From','All commits',c.c2);
  await expect(choice(page,'From')).toHaveText(choiceText(r2));
  await choose(page,'To','Pull requests',c.c3);
  const pr7=choiceText({sha:short(c.c3),date:'2026-01-03 12:00',author:'carol',subject:'Feature step'});
  await expect(choice(page,'To')).toHaveText(pr7);
  await expect.poll(()=>betweenRows(page)).toEqual([{date:day(3),sha:short(c.c3),subject:'Reword step',prs:['PR #7']}]);
  /* P3: Swap exchanges the pair the page uses, not only the labels: c3..c2 has no commits. */
  await page.getByRole('button',{name:'Swap'}).click();
  await expect(choice(page,'From')).toHaveText(pr7);
  await expect(choice(page,'To')).toHaveText(choiceText(r2));
  await expect(between(page).getByRole('listitem')).toHaveCount(0);
  await expect(between(page)).toContainText('No commits between these revisions change this document.');
  /* P2b: PR #8's head is not in the clone; choosing it fetches its objects (no ref) and the
     between list from c7 then shows its commit. */
  const refsBefore=snapshot(repo.dir);
  await choose(page,'From','All commits',c.c7);
  await choose(page,'To','Pull requests',c.pr8);
  await expect(choice(page,'To')).toHaveText(choiceText({sha:short(c.pr8),date:'2026-01-08 12:00',author:'fork',subject:'Fork change'}));
  const pr8date=new Date(git(repo.other,['log','-1','--format=%aI'])).toISOString().slice(0,16).replace('T',' ');
  await expect.poll(()=>betweenRows(page)).toEqual([{date:pr8date,sha:short(c.pr8),subject:'PR eight',prs:['PR #8']}]);
  expect(refChanges(refsBefore,snapshot(repo.dir))).toEqual([]);
});

test('P4: a long list shows 100 rows, then the rest after Show more',async({page,repo,open})=>{
  await open(ghStub(repo.c,{extra:150}));
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect.poll(()=>options(dialog)).toHaveLength(100);
  await dialog.getByRole('button',{name:'Show more'}).click();
  await expect.poll(()=>options(dialog)).toHaveLength(152);
  /* Every pull request once, in order: #8, #7 (newest), then the 150 older ones by number, highest first. */
  const numbers=await dialog.getByRole('option').evaluateAll(els=>els.map(e=>[...e.querySelectorAll('[data-field="badge"]')].map(b=>b.textContent).find(t=>t.startsWith('PR #'))));
  expect(numbers).toEqual(['PR #8','PR #7',...Array.from({length:150},(_,i)=>'PR #'+(249-i))]);
  await expect(dialog.getByRole('button',{name:'Show more'})).toHaveCount(0);
});

test('H1b H1c: signed out of gh, the header and PR tab say how to sign in while local tabs still work',async({page,repo,open})=>{
  const {c}=repo;await open(ghStub(c,{fail:true}));
  await expect(page.getByTestId('gh-state')).toHaveText('GitHub: not signed in. Run: gh auth login');
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Not signed in to GitHub. Run: gh auth login');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await dialog.getByRole('tab',{name:'Branches'}).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect.poll(()=>options(dialog)).toEqual([
    row(c,'c3','Carol','Reword step',3,['feature','origin/feature','changes this document']),
    row(c,'c7','Alice','Final pass',7,['main','origin/main','changes this document'])]);
});

test('B0 B1 B2: commits between the revisions, Compare this commit on a merge, and the empty list',async({page,repo,open})=>{
  const {c}=repo;await open();
  await expect(between(page)).toHaveText(/Choose From and To/);
  await choose(page,'From','Revisions of this document',c.c1);
  await choose(page,'To','Revisions of this document',c.c7);
  await expect.poll(()=>betweenRows(page)).toEqual([
    {date:day(7),sha:short(c.c7),subject:'Final pass',prs:[]},
    {date:day(5),sha:short(c.c5),subject:'Merge feature',prs:['PR #7']},
    {date:day(3),sha:short(c.c3),subject:'Reword step',prs:['PR #7']},
    {date:day(2),sha:short(c.c2),subject:'Rename alpha',prs:[]}]);
  await between(page).getByRole('listitem').filter({hasText:'Merge feature'}).getByRole('button',{name:'Compare this commit'}).click();
  await expect(choice(page,'From')).toHaveText(choiceText(row(c,'c4','Alice','Docs only',4)));
  await expect(choice(page,'To')).toHaveText(choiceText(row(c,'c5','Bob','Merge feature',5)));
  await expect.poll(()=>betweenRows(page)).toEqual([
    {date:day(5),sha:short(c.c5),subject:'Merge feature',prs:['PR #7']},
    {date:day(3),sha:short(c.c3),subject:'Reword step',prs:['PR #7']}]);
  await choose(page,'From','All commits',c.c7);
  await choose(page,'To','All commits',c.c1);
  await expect(between(page).getByRole('listitem')).toHaveCount(0);
  await expect(between(page)).toContainText('No commits between these revisions change this document.');
});

test('F0: Fetch adds a branch pushed to the remote and changes only remote-tracking refs',async({page,repo,open})=>{
  const {c}=repo;await open();
  git(repo.other,['push','-q','origin','HEAD:refs/heads/late']);
  let dialog=await openPicker(page,'To');
  await dialog.getByRole('tab',{name:'Branches'}).click();
  await expect.poll(()=>shas(dialog)).toEqual([short(c.c3),short(c.c7)]);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  const before=snapshot(repo.dir);
  await page.getByRole('button',{name:'Fetch'}).click();
  await expect(page.getByTestId('clone-state')).not.toHaveText(/2026-01-09 10:00/);
  const fetched=(await stat(path.join(repo.dir,'.git','FETCH_HEAD'))).mtime;
  await expect(page.getByTestId('clone-state')).toHaveText('Clone: '+repo.dir+' · last fetch '+utc(fetched));
  dialog=await openPicker(page,'To');
  await dialog.getByRole('tab',{name:'Branches'}).click();
  const pr8date=new Date(git(repo.other,['log','-1','--format=%aI'])).toISOString().slice(0,16).replace('T',' ');
  await expect.poll(()=>options(dialog)).toContainEqual({date:pr8date,author:'Fork',sha:short(c.pr8),subject:'PR eight',badges:['origin/late','PR #8','changes this document']});
  const after=snapshot(repo.dir);
  expect(refChanges(before,after)).toEqual(['refs/remotes/origin/late']);
  expect([after.head,after.status,after.index]).toEqual([before.head,before.status,before.index]);
});

test('U0 U1: commit, branch, tag and pull request text renders literally under a CSP without inline scripts',async({page,repo,open})=>{
  const {c}=repo;
  /* A commit that changes the document, so it is also listed between c7 and itself. */
  await appendFile(path.join(repo.dir,A),'\n');
  git(repo.dir,['commit','-q','-am',HOSTILE],{GIT_AUTHOR_DATE:'2026-01-08T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-08T10:00:00Z'});
  const hostile=git(repo.dir,['rev-parse','HEAD']);
  git(repo.dir,['branch',HOSTILE_BRANCH,hostile]);git(repo.dir,['tag',HOSTILE_TAG,hostile]);
  const stub=ghStub(c);
  const gh=async args=>{const out=await stub(args);if(args[0]==='pr' && args[1]==='list')return JSON.stringify(JSON.parse(out).concat([
    {number:9,title:HOSTILE,headRefName:'h',headRefOid:hostile,author:{login:HOSTILE},updatedAt:'2026-01-09T12:00:00Z',state:'OPEN',mergeCommit:null}]));return out;};
  const response=await open(gh);
  const csp=response.headers()['content-security-policy'];
  expect(csp).toMatch(/script-src 'self'/);expect(csp).not.toContain('unsafe-inline');
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'All commits'}).click();
  await expect.poll(()=>shas(dialog)).toHaveLength(8);
  const top=dialog.getByRole('option').first();
  await expect(top.locator('[data-field="sha"]')).toHaveText(short(hostile));
  await expect(top.locator('[data-field="subject"]')).toHaveText(HOSTILE);
  expect(await top.locator('[data-field="badge"]').allTextContents()).toEqual(['main',HOSTILE_BRANCH,HOSTILE_TAG,'PR #9','changes this document']);
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect.poll(()=>shas(dialog)).toHaveLength(3);
  const pr=dialog.getByRole('option').first();
  await expect(pr.locator('[data-field="subject"]')).toHaveText(HOSTILE);
  await expect(pr.locator('[data-field="author"]')).toHaveText(HOSTILE);
  await pr.click();await expect(dialog).toBeHidden();
  await expect(choice(page,'From')).toHaveText(choiceText({sha:short(hostile),date:'2026-01-09 12:00',author:HOSTILE,subject:HOSTILE}));
  await choose(page,'To','All commits',c.c7);
  await page.getByRole('button',{name:'Swap'}).click();
  await expect.poll(()=>betweenRows(page)).toEqual([{date:'2026-01-08 10:00',sha:short(hostile),subject:HOSTILE,prs:['PR #9']}]);
  expect(await page.locator('img, script:not([src])').count()).toBe(0);
  expect(await page.evaluate(()=>window.__pwned)).toBeUndefined();
});

test('P5 P6: a pull request head that cannot be fetched is refused in the picker; a fetched PR commit compares with its object-only parent',async({page,repo,open,errors})=>{
  const {c}=repo,{writeFile}=await import('node:fs/promises');
  /* PR #11: two commits on top of c7, only at refs/pull/11/head on the remote. */
  git(repo.other,['checkout','-q','--detach',c.c7]);
  const at=n=>({GIT_AUTHOR_DATE:'2026-01-1'+n+'T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-1'+n+'T10:00:00Z'});
  const doc=path.join(repo.other,A),base=JSON.parse(await (await import('node:fs/promises')).readFile(doc,'utf8'));
  base.page.sections[0].diagram.nodes.b.title='B one';await writeFile(doc,JSON.stringify(base,null,2)+'\n');git(repo.other,['commit','-qam','Two first'],at(0));
  const two1=git(repo.other,['rev-parse','HEAD']);
  base.page.sections[0].diagram.nodes.b.title='B two';await writeFile(doc,JSON.stringify(base,null,2)+'\n');git(repo.other,['commit','-qam','Two second'],at(1));
  const two2=git(repo.other,['rev-parse','HEAD']);
  git(repo.other,['push','-q','origin','HEAD:refs/pull/11/head']);
  const stub=ghStub(c),missing='f'.repeat(40);
  const gh=async args=>{const out=await stub(args);if(args[0]==='pr' && args[1]==='list')return JSON.stringify(JSON.parse(out).concat([
    {number:10,title:'Gone head',headRefName:'gone',headRefOid:missing,author:{login:'ghost'},updatedAt:'2026-01-12T12:00:00Z',state:'CLOSED',mergeCommit:null},
    {number:11,title:'Two commits',headRefName:'two',headRefOid:two2,author:{login:'tess'},updatedAt:'2026-01-11T12:00:00Z',state:'OPEN',mergeCommit:null}]));return out;};
  errors.allow(400,/\/api\/[a-z]+\?(.*&)?rev=pr%3A10(&|$)/);
  await open(gh);
  const refsBefore=snapshot(repo.dir);
  await choose(page,'From','All commits',c.c7);
  /* P5 */
  const dialog=await openPicker(page,'To');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect.poll(()=>shas(dialog)).toEqual([short(missing),short(two2),short(c.pr8),short(c.c3)]);
  const gone=dialog.getByRole('option').first();
  await gone.click();
  await expect(gone).toHaveAttribute('aria-disabled','true');
  await expect(gone).toContainText('not available locally');
  await expect(dialog).toBeVisible();
  await expect(choice(page,'To')).toHaveText('No revision chosen');
  /* P6 */
  await dialog.getByRole('option').nth(1).click();await expect(dialog).toBeHidden();
  await expect(choice(page,'To')).toHaveText(choiceText({sha:short(two2),date:'2026-01-11 12:00',author:'tess',subject:'Two commits'}));
  await expect.poll(()=>betweenRows(page)).toEqual([
    {date:'2026-01-11 10:00',sha:short(two2),subject:'Two second',prs:['PR #11']},
    {date:'2026-01-10 10:00',sha:short(two1),subject:'Two first',prs:[]}]);
  await between(page).getByRole('listitem').filter({hasText:'Two second'}).getByRole('button',{name:'Compare this commit'}).click();
  await expect(choice(page,'From')).toHaveText(short(two1)+' · first parent of '+short(two2));
  await expect(choice(page,'To')).toHaveText(choiceText({sha:short(two2),date:'2026-01-11 10:00',author:'Fork',subject:'Two second'}));
  await expect.poll(()=>betweenRows(page)).toEqual([{date:'2026-01-11 10:00',sha:short(two2),subject:'Two second',prs:['PR #11']}]);
  expect(refChanges(refsBefore,snapshot(repo.dir))).toEqual([]);
});
