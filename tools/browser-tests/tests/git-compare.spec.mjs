/* Git Compare page (issue #849, PRs 2 and 3 of 3): tools/compare/index.html served by
   tools/compare/serve.mjs on a temporary clone (tests/helpers/compare-git-fixture.cjs).
   Contract: issue #849 "How it should look" + browser contract rows 0-6 and "Untrusted text".
   PR 2 added the pickers (rows 0, 1, 2, 4, 6); PR 3 adds the comparison (row 3, row 4's "loads
   first parent vs merge") and "All changed documents" (row 5). The stress rows are in
   git-compare-stress.spec.mjs. Chuck 2026-11-01: coverage "As written in #849"; the gh token
   stays in the server process. Node rule (Chuck): node changes include imported nodes, so the
   document list also lists a document whose imported provider changed (A3).

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
   P10  chosen PR stays at the shown commit   PR #12 head = twelve1 when chosen as To;  rail = exactly "Modified · Node B twelve ·      a choice kept as pr:<n> and re-resolved
        after a force-push                    then force-pushed to forced12 (the gh     title"; the After pane's node b reads "B        on every request (compares a commit
                                              list now reports forced12); Compare       twelve"; After title names twelve1           the picker no longer shows)
        (P10 also: choosing From again reloads "Between these revisions": exactly one row, twelve1
        "Twelve first"; P10b: the picker lists PR #12 at twelve1, the PR is force-pushed before the
        click: clicking the row marks it "not available locally", the dialog stays open, To stays
        "No revision chosen"; P10c: the same when the listed commit is already in the clone (chosen
        once before the force-push))          rejects: between list following the moved PR; a chooser that
                                              fetches the moved head and accepts the row it no longer matches)
   P7   latest PR click wins                    hold the availability replies for PR #8   rows aria-busy while checked; after #8's row is   an earlier click's late check choosing
                                                                                       no longer busy (#7 still busy): dialog open,
                                                then PR #7 (clicked in that order);      from-choice unchanged; after #7's: from-choice =  the row the user did not pick last
                                                                                       PR #7 row
                                                release #8 first
   P8   Show more while a page loads            150 extra PRs; hold the page-2 reply;     Show more is disabled while page 2 loads; after   a second click that requests page 3 and
                                                a forced second real click while held    release: no request for page 3 or later;
                                                                                       release: 152 rows, numbers #8, #7, #249..#100    drops page 2 (rows 101-152 unreachable)
   P9   Show more after a failed page           150 extra PRs; page 2 answers 500 once    alert shows the error, Show more enabled; retry   retry that skips the failed page
                                                                                       -> 152 rows, numbers #8, #7, #249..#100
   B3   a newer choice wins over a pending      From c1, To c7; hold the parent lookup    region aria-busy while the lookup runs; after     a late parent lookup overwriting the
        Compare this commit                     of Compare this commit on c5; then        release and busy cleared: from-choice c1 row,    user's newer choice
                                                                                       to-choice c3 row, between rows c3, c2
                                                To := c3 in the picker; release
   --- PR 3 (Document list gains a first option "All changed documents"; D0/D1 lists include it) ---
   C0   Compare needs both sides            open page; choose From; choose To         region "Comparison" text "Choose From and To, then  a Compare that runs with one side
                                                                                       press Compare."; button disabled until both,       missing
                                                                                       then enabled; no view before the click
   C1   Before = From, After = To (row 3)    From c1, To c7, doc a; click Compare     one .compare-view; pane titles "Before · <c1> ·    swapped sides; agent-preview titles;
                                                                                       Add flows" / "After · <c7> · Final pass"; rail     a page-made rail instead of the shared
                                                                                       items exactly the 3 engine labels (local node,    component
                                                                                       step, imported node); node a "Alpha" in Before,
                                                                                       "Alpha final" in After
   C2   click through changes (row 3)        J (Focused), Full diagram, rail click, K  Focused aria-pressed by default; on the step change  panes that never follow the selection;
                                                                                       each side's visible step strip [1], heading named   Full-only, strip-hidden or non-switching
                                                                                       like the pane title (c1 / c7), and caption
                                                                                       "Start" / "Start the flow"; Full hides the focused  integration
                                                                                       view and shows both panes; aria-current moves
                                                                                       0->1->2->1; pane captions; child::p2 "P two" /
                                                                                       "P two changed"
   C3   Compare this commit loads the        From c1, To c7; Compare this commit on   titles c4 "Docs only" / c5 "Merge feature";         second parent (c3: no changes); choices
        comparison (row 4)                   c5                                       rail exactly ["Modified · Step s1 · text"]         set but nothing compared
   C4   each navigation replaces the view    Compare, then Compare again (same pair)  previous .compare-view detached; exactly one;       leaked instance (destroy() not run)
                                                                                       liveOwners() back to the one-view value
   C5   a changed choice/document removes    after Compare: From := c2; later          no .compare-view, note "The choices changed. Press  a stale comparison labelled with the new
        the shown comparison                 Document := p                            Compare to update.", liveOwners() 0, old root      choices
                                                                                       detached
   C6   the latest request wins              hold the c1..c7 reply; Compare this       region aria-busy while any request is answered;     a late reply overwriting the newer
                                             commit on c5; release                    after release and busy cleared: one view, c4/c5    comparison
                                                                                       titles, rail [Step s1]
   A0   document list (row 5)               All changed documents, From c1, To c7     navigation "Changed documents" rows exactly          file list from one side; missing status
                                                                                       [a Edited, new Added, old Removed, p Edited];
                                                                                       first selected (aria-current), its changes shown
   A1   choosing a document shows its        click new, old, p                        rail per document exactly (Added/Removed Document   rail stuck on the first document; agent
        changes                                                                       + Section Main; P two changed); absent side text    wording "Not in the proposal."
                                                                                       "This document is not in From." / "...in To."
   A2   between list for all documents       same pair                               rows c7, c6, c5, c3, c2 (c4 changes README only)    between list still filtered to one file
   A3   imported-only change is listed       From c5, To c6                           rows [a "Edited · imported content", p Edited];     file-diff-only list (misses a)
                                                                                       a's rail [Imported node child::p2 · title]
   A4   a document that cannot be loaded      commit edits a and adds broken.spec.json   after clicking broken: it is aria-current, the     the previous document's view left mounted
                                             (not JSON); All changed documents, c7 ->   region is not busy, the note names the JSON error,  under the new selection
                                             that commit; Compare, then click broken    no .compare-view, liveOwners() 0
   U2   untrusted text in the document list  commit with a hostile file name and       doc row path literal; rail labels and node text     innerHTML in the document list or rail
        and comparison                       node/section titles                      literal; no <img>/inline <script>; no __pwned
   E0   no documents at HEAD (#917)          commit c8 removes every spec (HEAD    Document options exactly [All changed documents];  state.doc left empty (list shows the
                                             = c8); page opens                      From picker's All commits tab lists c8 and c7      option but nothing is chosen)
   E1   compare a range with no documents   From c7, To c8                          between rows exactly [c8]; Compare enabled;        Compare left disabled; between list
        on one side                                                                  rows exactly [a Removed, new Removed, p Removed]   empty because no document is chosen
   E2   a To with documents keeps All        then Swap (To := c7)                   options exactly [All, a, new, p]; value "all";      switching to the first listed document
        changed documents                                                            Compare enabled                                    once the To revision has documents
   AU   every test, context-wide (all pages): no page/console error, failed request, HTTP >= 400, or request outside the compare server
        (recorded from page open until the test body ends, no element is aria-busy and no request is in flight;
        only then are the servers closed)
   U1   page CSP                                response headers of "/"                 no repeated directive; default-src 'none';       inline or eval script allowed; a repeated
                                                                                       script-src exactly 'self';                         unsafe directive
                                                                                       no script-src-elem/-attr (PR 3: style-src may
                                                                                       allow inline style attributes for the viewer)
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
/* The Document list's first option (PR 3): compare every changed spec. */
const ALL_DOCS=['all','All changed documents'];

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
    /* Work the page started (such as the comparison Compare this commit loads) finishes while the audit still
       records it: first every aria-busy marker clears (the page sets one for the whole of each comparison, parent
       lookup and pull request check, including work not yet sent), then no request is in flight. Only then does
       recording stop, so closing the servers' idle connections is not a test failure. */
    if(servers.length && !page.isClosed()){
      await expect(page.locator('[aria-busy="true"]'),'page work finished before teardown').toHaveCount(0,{timeout:15000});
      await page.waitForLoadState('networkidle',{timeout:15000});
    }
    errors.stop();
    for(const s of servers){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}
  },
  /* Page errors, console errors, failed requests, HTTP errors and any request that leaves the
     compare server's origin all fail the test. */
  errors:[async({context,page},use)=>{
    const errors=[],origins=[],allowed=[];
    /* Recording stops when the test body has finished: closing the servers then ends any request still
       open, and that is not a page error. */
    let recording=true;const record=m=>{if(recording)errors.push(m);};
    /* A test may expect one HTTP error status for one URL pattern; only that is excused. */
    const excused=(url,status)=>allowed.some(a=>a.re.test(url)&&(status===undefined||status===a.status));
    /* Context-wide: every page of the context, including popups. */
    const watch=p=>{p.on('pageerror',e=>record('page: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!(/^Failed to load resource/.test(m.text())&&excused(m.location()?.url||'')))record('console: '+m.text());});};
    context.pages().forEach(watch);context.on('page',watch);
    context.on('request',r=>{const url=r.url();if(!origins.some(o=>url.startsWith(o+'/'))&&!/^(data|blob|about):/.test(url))record('outbound: '+url);});
    context.on('requestfailed',r=>record('request failed: '+r.url()+' '+(r.failure()?.errorText||'')));
    context.on('response',r=>{if(r.status()>=400&&!excused(r.url(),r.status()))record('HTTP '+r.status()+': '+r.url());});
    await context.route(/^https?:/,route=>{const url=route.request().url();return origins.some(o=>url.startsWith(o+'/'))?route.continue():route.abort();});
    errors.origins=origins;errors.allow=(status,re)=>allowed.push({status,re});errors.stop=()=>{recording=false;};
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
const documentOptions=page=>page.getByLabel('Document',{exact:true}).locator('option').evaluateAll(els=>els.map(e=>[e.value,e.textContent]));
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
  await expect.poll(()=>documentOptions(page)).toEqual([ALL_DOCS,[A,A],[NEW,NEW],[P,P]]);
  await expect(page.getByLabel('Document',{exact:true})).toHaveValue(A);
  await choose(page,'To','All commits',c.c1);
  await expect.poll(()=>documentOptions(page)).toEqual([ALL_DOCS,[A,A],[OLD,OLD],[P,P]]);
  await expect(page.getByLabel('Document',{exact:true})).toHaveValue(A);
  /* D1: a chosen document missing from To stays chosen and is marked. */
  await choose(page,'To','All commits',c.c7);
  await expect.poll(()=>documentOptions(page)).toEqual([ALL_DOCS,[A,A],[NEW,NEW],[P,P]]);
  await page.getByLabel('Document',{exact:true}).selectOption(NEW);
  await choose(page,'To','All commits',c.c1);
  await expect.poll(()=>documentOptions(page)).toEqual([ALL_DOCS,[A,A],[NEW,NEW+' (not in To)'],[OLD,OLD],[P,P]]);
  await expect(page.getByLabel('Document',{exact:true})).toHaveValue(NEW);
  /* D2: the document tab lists the commits that changed the chosen document. */
  let dialog=await openPicker(page,'From');
  await expect.poll(()=>shas(dialog)).toEqual([short(c.c7)]);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await page.getByLabel('Document',{exact:true}).selectOption(P);
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
  /* Scripts only from the server: script-src is exactly 'self' and no other directive allows scripts. Inline
     style attributes may be allowed (PR 3: the viewer's panels set them); the issue forbids inline scripts. */
  const parsed=csp.split(';').map(d=>d.trim().split(/\s+/)).filter(d=>d[0]),names=parsed.map(d=>d[0].toLowerCase());
  /* A repeated directive is ignored by browsers after its first occurrence; refuse any repeat. */
  expect(names.filter((n,i)=>names.indexOf(n)!==i),'no repeated directive').toEqual([]);
  const directives=Object.fromEntries(parsed.map(([k,...v])=>[k.toLowerCase(),v]));
  expect(directives['default-src']).toEqual(["'none'"]);
  expect(directives['script-src']).toEqual(["'self'"]);
  expect(Object.keys(directives).filter(k=>/^script-src-(elem|attr)$/.test(k))).toEqual([]);
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

test('P7: when two pull request rows are clicked, the later click chooses even if the earlier check answers last',async({page,repo,open})=>{
  const {c}=repo;
  const release={},seen={};
  await page.route(/\/api\/documents\?rev=pr%3A(7|8)$/,async route=>{
    const n=route.request().url().match(/pr%3A(\d+)$/)[1];
    if(seen[n]){await route.continue();return;}
    seen[n]=true;await new Promise(resolve=>{release[n]=resolve;});await route.continue();
  });
  await open();
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect.poll(()=>shas(dialog)).toEqual([short(c.pr8),short(c.c3)]);
  /* Rows by CSS so they stay addressable if a buggy page hides the dialog. */
  const row8=page.locator('.picker [role=option]').nth(0),row7=page.locator('.picker [role=option]').nth(1);
  await dialog.getByRole('option').nth(0).click();
  await expect.poll(()=>!!release['8']).toBe(true);
  await expect(row8).toHaveAttribute('aria-busy','true');
  await dialog.getByRole('option').nth(1).click();
  await expect.poll(()=>!!release['7']).toBe(true);
  await expect(row7).toHaveAttribute('aria-busy','true');
  /* #8's check is finished once its row is no longer busy; #7's is still held. */
  release['8']();
  await expect(row8).not.toHaveAttribute('aria-busy','true');
  await expect(row7).toHaveAttribute('aria-busy','true');
  await expect(dialog).toBeVisible();
  await expect(choice(page,'From')).toHaveText('No revision chosen');
  release['7']();
  await expect(dialog).toBeHidden();
  await expect(choice(page,'From')).toHaveText(choiceText({sha:short(c.c3),date:'2026-01-03 12:00',author:'carol',subject:'Feature step'}));
});

test('P8: Show more is disabled while the next page loads, so no page is skipped',async({page,repo,open})=>{
  let release=null;const pages=[];
  page.on('request',r=>{const m=/\/api\/revisions\?.*page=(\d+)/.exec(r.url());if(m)pages.push(Number(m[1]));});
  await page.route(/\/api\/revisions\?.*page=2(&|$)/,async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});
  await open(ghStub(repo.c,{extra:150}));
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect.poll(()=>options(dialog)).toHaveLength(100);
  const more=dialog.getByRole('button',{name:'Show more'});
  await expect(more).toBeEnabled();
  await more.click();
  await expect.poll(()=>!!release).toBe(true);
  await expect(more).toBeDisabled();
  /* A second real click while page 2 loads must not request another page. */
  await more.click({force:true});
  release();
  await expect.poll(()=>options(dialog)).toHaveLength(152);
  const numbers=await dialog.getByRole('option').evaluateAll(els=>els.map(e=>[...e.querySelectorAll('[data-field="badge"]')].map(b=>b.textContent).find(t=>t.startsWith('PR #'))));
  expect(numbers).toEqual(['PR #8','PR #7',...Array.from({length:150},(_,i)=>'PR #'+(249-i))]);
  await expect(more).toHaveCount(0);
  expect(pages.filter(n=>n>2)).toEqual([]);
});

test('B3: a revision chosen while Compare this commit is still looking up the parent is kept',async({page,repo,open})=>{
  const {c}=repo;let release=null;
  await page.route(url=>url.searchParams.get('q')===c.c4 && url.pathname==='/api/revisions',async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});
  await open();
  await choose(page,'From','Revisions of this document',c.c1);
  await choose(page,'To','Revisions of this document',c.c7);
  await expect.poll(()=>betweenRows(page)).toHaveLength(4);
  await between(page).getByRole('listitem').filter({hasText:'Merge feature'}).getByRole('button',{name:'Compare this commit'}).click();
  await expect.poll(()=>!!release).toBe(true);
  await expect(between(page)).toHaveAttribute('aria-busy','true');
  await choose(page,'To','All commits',c.c3);
  /* The page has handled the lookup's answer once the section is no longer busy. */
  release();
  await expect(between(page)).not.toHaveAttribute('aria-busy','true');
  await expect.poll(()=>betweenRows(page)).toEqual([
    {date:day(3),sha:short(c.c3),subject:'Reword step',prs:['PR #7']},
    {date:day(2),sha:short(c.c2),subject:'Rename alpha',prs:[]}]);
  await expect(choice(page,'From')).toHaveText(choiceText(row(c,'c1','Alice','Add flows',1)));
  await expect(choice(page,'To')).toHaveText(choiceText(row(c,'c3','Carol','Reword step',3)));
});

test('P9: after a page fails to load, Show more retries that page',async({page,repo,open,errors})=>{
  let failed=false;
  errors.allow(500,/\/api\/revisions\?.*page=2(&|$)/);
  await page.route(/\/api\/revisions\?.*page=2(&|$)/,async route=>{
    if(failed){await route.continue();return;}
    failed=true;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'The request could not be completed.'})});
  });
  await open(ghStub(repo.c,{extra:150}));
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  await expect.poll(()=>options(dialog)).toHaveLength(100);
  const more=dialog.getByRole('button',{name:'Show more'});
  await more.click();
  await expect(dialog.getByRole('alert')).toHaveText('The request could not be completed.');
  await expect(more).toBeEnabled();
  await expect.poll(()=>options(dialog)).toHaveLength(100);
  await more.click();
  await expect.poll(()=>options(dialog)).toHaveLength(152);
  const numbers=await dialog.getByRole('option').evaluateAll(els=>els.map(e=>[...e.querySelectorAll('[data-field="badge"]')].map(b=>b.textContent).find(t=>t.startsWith('PR #'))));
  expect(numbers).toEqual(['PR #8','PR #7',...Array.from({length:150},(_,i)=>'PR #'+(249-i))]);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(more).toHaveCount(0);
});

/* ---------- PR 3: the comparison (rows 3 and 5) ---------- */
const comparison=page=>page.getByRole('region',{name:'Comparison',exact:true});
const compareButton=page=>page.getByRole('button',{name:'Compare',exact:true});
const views=page=>comparison(page).locator('.compare-view');
const changeItems=page=>comparison(page).locator('.compare-view .compare-rail-item');
const paneIn=(page,side)=>comparison(page).locator('.compare-pane[data-side="'+side+'"]');
const paneTitle=(page,side)=>paneIn(page,side).locator('.compare-pane-title');
const docRail=page=>comparison(page).getByRole('navigation',{name:'Changed documents'});
const docRows=page=>docRail(page).getByRole('button').evaluateAll(els=>els.map(e=>[e.querySelector('[data-field="path"]').textContent,e.querySelector('[data-field="status"]').textContent]));
const docButton=(page,file)=>docRail(page).getByRole('button').filter({has:page.locator('[data-field="path"]',{hasText:file})});
/* Render owners of compare views whose destroy() has not run (the component's public counter). */
const liveOwners=page=>page.evaluate(()=>window.FlowviewCompare.liveOwners());
const paneHeading=(side,sha,subject)=>(side==='before'?'Before · ':'After · ')+short(sha)+' · '+subject;
const A_CHANGES=['Modified · Node Alpha final · title','Modified · Step s1 · text','Modified · Imported node child::p2 · title'];
/* Chooses "All changed documents"; the option must exist (an assertion, not a wait). */
async function allDocuments(page){
  await expect(page.getByLabel('Document',{exact:true}).locator('option[value="all"]')).toHaveText('All changed documents');
  await page.getByLabel('Document',{exact:true}).selectOption('all');
}
const compareThisCommit=(page,subject)=>between(page).getByRole('listitem').filter({hasText:subject}).getByRole('button',{name:'Compare this commit'}).click();

test('C0 C1 C2: Compare shows From as Before and To as After, and every change can be clicked through',async({page,repo,open})=>{
  const {c}=repo;await open();
  await expect(comparison(page)).toContainText('Choose From and To, then press Compare.');
  await expect(compareButton(page)).toBeDisabled();
  await choose(page,'From','Revisions of this document',c.c1);
  await expect(compareButton(page)).toBeDisabled();
  await choose(page,'To','Revisions of this document',c.c7);
  await expect(compareButton(page)).toBeEnabled();
  await expect(views(page)).toHaveCount(0);
  await compareButton(page).click();
  /* C1: the shared component, Before = From (c1), After = To (c7). */
  await expect(views(page)).toHaveCount(1);
  await expect(paneTitle(page,'before')).toHaveText(paneHeading('before',c.c1,'Add flows'));
  await expect(paneTitle(page,'after')).toHaveText(paneHeading('after',c.c7,'Final pass'));
  const items=changeItems(page);
  await expect(items).toHaveText(A_CHANGES);
  await expect(items.nth(0)).toHaveAttribute('aria-current','true');
  const node=(side,id)=>paneIn(page,side).locator('[data-dv-node="'+id+'"]').first();
  await expect(node('before','a')).toContainText('Alpha');await expect(node('before','a')).not.toContainText('Alpha final');
  await expect(node('after','a')).toContainText('Alpha final');
  /* C2: click through with the keyboard and the rail. Focused is the default mode: a step change shows each
     side's step strip and caption only. */
  const modeButton=name=>comparison(page).getByRole('group',{name:'Compare mode'}).getByRole('button',{name,exact:true});
  await expect(modeButton('Focused')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('j');await expect(items.nth(1)).toHaveAttribute('aria-current','true');
  const focusSide=side=>comparison(page).locator('.compare-focus-side[data-side="'+side+'"]');
  await expect(comparison(page).locator('.compare-focus')).toBeVisible();
  for(const side of ['before','after']){
    const steps=focusSide(side).locator('.compare-focus-steps .compare-focus-step');
    await expect(steps).toHaveText(['1']);await expect(steps.first()).toBeVisible();
    await expect(focusSide(side).locator('.compare-focus-caption')).toBeVisible();
  }
  /* The focused headings name the compared revisions, as the pane titles do. */
  await expect(focusSide('before').locator('.compare-focus-title')).toHaveText(paneHeading('before',c.c1,'Add flows'));
  await expect(focusSide('after').locator('.compare-focus-title')).toHaveText(paneHeading('after',c.c7,'Final pass'));
  await expect(focusSide('before').locator('.compare-focus-caption')).toHaveText('Start');
  await expect(focusSide('after').locator('.compare-focus-caption')).toHaveText('Start the flow');
  await modeButton('Full diagram').click();await expect(modeButton('Full diagram')).toHaveAttribute('aria-pressed','true');
  /* Full diagram: the focused view is hidden and both full panes are shown. */
  await expect(comparison(page).locator('.compare-focus')).toBeHidden();
  for(const side of ['before','after'])await expect(paneIn(page,side)).toBeVisible();
  await expect(items.nth(1)).toHaveAttribute('aria-current','true');
  const caption=side=>paneIn(page,side).locator('.stepline:not(.dv-caption-old)').first();
  await expect(caption('before')).toContainText('Start');await expect(caption('before')).not.toContainText('Start the flow');
  await expect(caption('after')).toContainText('Start the flow');
  await items.nth(2).click();await expect(items.nth(2)).toHaveAttribute('aria-current','true');
  await expect(node('before','child::p2')).toContainText('P two');await expect(node('before','child::p2')).not.toContainText('P two changed');
  await expect(node('after','child::p2')).toContainText('P two changed');
  await page.keyboard.press('k');await expect(items.nth(1)).toHaveAttribute('aria-current','true');
});

test('C3: Compare this commit on the merge commit shows its first parent as Before and the merge as After',async({page,repo,open})=>{
  const {c}=repo;await open();
  await choose(page,'From','Revisions of this document',c.c1);
  await choose(page,'To','Revisions of this document',c.c7);
  await compareThisCommit(page,'Merge feature');
  await expect(paneTitle(page,'before')).toHaveText(paneHeading('before',c.c4,'Docs only'));
  await expect(paneTitle(page,'after')).toHaveText(paneHeading('after',c.c5,'Merge feature'));
  await expect(changeItems(page)).toHaveText(['Modified · Step s1 · text']);
});

test('C4 C5: each Compare replaces the previous view, and a changed choice or document removes the shown comparison',async({page,repo,open})=>{
  const {c}=repo;await open();
  await choose(page,'From','Revisions of this document',c.c1);
  await choose(page,'To','Revisions of this document',c.c7);
  await expect(compareButton(page)).toBeEnabled();
  await compareButton(page).click();
  await expect(changeItems(page)).toHaveText(A_CHANGES);
  const one=await liveOwners(page);expect(one,'precondition: a mounted view owns renders').toBeGreaterThan(0);
  const first=await views(page).elementHandle();
  /* C5: a new From removes the comparison it no longer matches. */
  await choose(page,'From','Revisions of this document',c.c2);
  await expect(views(page)).toHaveCount(0);
  await expect(comparison(page)).toContainText('The choices changed. Press Compare to update.');
  await expect.poll(()=>liveOwners(page)).toBe(0);
  expect(await first.evaluate(n=>n.isConnected)).toBe(false);
  /* C4: a second Compare, then the same pair again: each replaces the previous instance. */
  await compareButton(page).click();
  await expect(paneTitle(page,'before')).toHaveText(paneHeading('before',c.c2,'Rename alpha'));
  await expect(changeItems(page)).toHaveText(A_CHANGES);
  const second=await views(page).elementHandle();
  await compareButton(page).click();
  await expect.poll(()=>second.evaluate(n=>n.isConnected)).toBe(false);
  await expect(views(page)).toHaveCount(1);
  await expect(changeItems(page)).toHaveText(A_CHANGES);
  await expect.poll(()=>liveOwners(page)).toBe(one);
  /* C5: choosing another document also removes it. */
  await page.getByLabel('Document',{exact:true}).selectOption(P);
  await expect(views(page)).toHaveCount(0);
  await expect(comparison(page)).toContainText('The choices changed. Press Compare to update.');
  await expect.poll(()=>liveOwners(page)).toBe(0);
});

test('C6: when two comparisons are requested, the later one is shown even if the earlier answers last',async({page,repo,open})=>{
  const {c}=repo;let release=null;
  /* Hold the first comparison's reply (c1..c7) until the test releases it. */
  await page.route(/\/api\/compare\?/,async route=>{
    if(!release && route.request().url().includes(c.c1)){await new Promise(resolve=>{release=resolve;});}
    await route.continue();
  });
  await open();
  await choose(page,'From','Revisions of this document',c.c1);
  await choose(page,'To','Revisions of this document',c.c7);
  await expect(compareButton(page)).toBeEnabled();
  await compareButton(page).click();
  await expect.poll(()=>!!release).toBe(true);
  await expect(comparison(page)).toHaveAttribute('aria-busy','true');
  await compareThisCommit(page,'Merge feature');
  await expect(paneTitle(page,'after')).toHaveText(paneHeading('after',c.c5,'Merge feature'));
  /* The region stays busy while the held request is still being answered. */
  await expect(comparison(page)).toHaveAttribute('aria-busy','true');
  release();
  await expect(comparison(page)).not.toHaveAttribute('aria-busy','true');
  await expect(views(page)).toHaveCount(1);
  await expect(paneTitle(page,'before')).toHaveText(paneHeading('before',c.c4,'Docs only'));
  await expect(paneTitle(page,'after')).toHaveText(paneHeading('after',c.c5,'Merge feature'));
  await expect(changeItems(page)).toHaveText(['Modified · Step s1 · text']);
});

test('A0 A1 A2: All changed documents lists added, removed and edited documents; choosing one shows its changes',async({page,repo,open})=>{
  const {c}=repo;await open();
  await allDocuments(page);
  await choose(page,'From','All commits',c.c1);
  await choose(page,'To','All commits',c.c7);
  /* A2: between lists every commit that changes any document (c4 changes only README.md). */
  await expect.poll(()=>betweenRows(page)).toEqual([
    {date:day(7),sha:short(c.c7),subject:'Final pass',prs:[]},
    {date:day(6),sha:short(c.c6),subject:'Provider rename',prs:[]},
    {date:day(5),sha:short(c.c5),subject:'Merge feature',prs:['PR #7']},
    {date:day(3),sha:short(c.c3),subject:'Reword step',prs:['PR #7']},
    {date:day(2),sha:short(c.c2),subject:'Rename alpha',prs:[]}]);
  await compareButton(page).click();
  /* A0 */
  await expect.poll(()=>docRows(page)).toEqual([[A,'Edited'],[NEW,'Added'],[OLD,'Removed'],[P,'Edited']]);
  await expect(docButton(page,A)).toHaveAttribute('aria-current','true');
  await expect(changeItems(page)).toHaveText(A_CHANGES);
  /* A1: each document's own changes; an absent side says so. */
  await docButton(page,NEW).click();
  await expect(docButton(page,NEW)).toHaveAttribute('aria-current','true');
  await expect(docButton(page,A)).not.toHaveAttribute('aria-current','true');
  await expect(changeItems(page)).toHaveText(['Added · Document','Added · Section Main']);
  await expect(paneIn(page,'before').locator('.compare-pane-empty')).toHaveText('This document is not in From.');
  await expect(paneIn(page,'after').locator('[data-dv-node="n"]').first()).toContainText('New');
  await docButton(page,OLD).click();
  await expect(changeItems(page)).toHaveText(['Removed · Document','Removed · Section Main']);
  await expect(paneIn(page,'after').locator('.compare-pane-empty')).toHaveText('This document is not in To.');
  await expect(paneIn(page,'before').locator('[data-dv-node="o"]').first()).toContainText('Old');
  await docButton(page,P).click();
  await expect(changeItems(page)).toHaveText(['Modified · Node P two changed · title']);
  await expect(views(page)).toHaveCount(1);
});

test('A3: a document whose imported provider changed is listed as edited although its own file did not change',async({page,repo,open})=>{
  const {c}=repo;await open();
  await allDocuments(page);
  await choose(page,'From','All commits',c.c5);
  await choose(page,'To','All commits',c.c6);
  await compareButton(page).click();
  await expect.poll(()=>docRows(page)).toEqual([[A,'Edited · imported content'],[P,'Edited']]);
  await expect(docButton(page,A)).toHaveAttribute('aria-current','true');
  await expect(changeItems(page)).toHaveText(['Modified · Imported node child::p2 · title']);
});

test('A4: when the chosen document cannot be loaded, the previous comparison is removed and the error is shown',async({page,repo,open,errors})=>{
  const {c}=repo,{writeFile,readFile}=await import('node:fs/promises');
  const broken='flows/broken.spec.json';
  const doc=JSON.parse(await readFile(path.join(repo.dir,A),'utf8'));doc.page.sections[0].diagram.nodes.a.title='Alpha eight';
  await writeFile(path.join(repo.dir,A),JSON.stringify(doc,null,2)+'\n');await writeFile(path.join(repo.dir,broken),'{not json\n');
  git(repo.dir,['add','--',A,broken]);
  git(repo.dir,['commit','-q','-m','Broken spec'],{GIT_AUTHOR_DATE:'2026-01-08T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-08T10:00:00Z'});
  const head=git(repo.dir,['rev-parse','HEAD']);
  errors.allow(400,/\/api\/compare\?(.*&)?doc=flows%2Fbroken\.spec\.json(&|$)/);
  await open();
  await allDocuments(page);
  await choose(page,'From','All commits',c.c7);
  await choose(page,'To','All commits',head);
  await expect(compareButton(page)).toBeEnabled();
  await compareButton(page).click();
  await expect.poll(()=>docRows(page)).toEqual([[A,'Edited'],[broken,'Added']]);
  await expect(changeItems(page)).toHaveText(['Modified · Node Alpha eight · title']);
  expect(await liveOwners(page),'precondition: a view is mounted').toBeGreaterThan(0);
  await docButton(page,broken).click();
  await expect(docButton(page,broken)).toHaveAttribute('aria-current','true');
  await expect(comparison(page)).not.toHaveAttribute('aria-busy','true');
  await expect(comparison(page).locator('.note')).toContainText('not valid JSON');
  await expect(views(page)).toHaveCount(0);
  await expect.poll(()=>liveOwners(page)).toBe(0);
});

test('U2: document paths and node titles render literally in the document list and the comparison',async({page,repo,open})=>{
  const {c}=repo,{writeFile,readFile}=await import('node:fs/promises');
  const hostileFile='flows/x<img src=x onerror=window.__pwned=1>.spec.json';
  const doc=JSON.parse(await readFile(path.join(repo.dir,A),'utf8'));doc.page.sections[0].diagram.nodes.a.title=HOSTILE;
  await writeFile(path.join(repo.dir,A),JSON.stringify(doc,null,2)+'\n');
  await writeFile(path.join(repo.dir,hostileFile),JSON.stringify({page:{title:HOSTILE,sections:[{id:'main',heading:HOSTILE,diagram:{nodes:{h:{title:HOSTILE}},rows:[['h']]}}]}},null,2)+'\n');
  git(repo.dir,['add','--',A,hostileFile]);
  git(repo.dir,['commit','-q','-m','Hostile docs'],{GIT_AUTHOR_DATE:'2026-01-08T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-08T10:00:00Z'});
  const hostile=git(repo.dir,['rev-parse','HEAD']);
  await open();
  await allDocuments(page);
  await choose(page,'From','All commits',c.c7);
  await choose(page,'To','All commits',hostile);
  await compareButton(page).click();
  await expect.poll(()=>docRows(page)).toEqual([[A,'Edited'],[hostileFile,'Added']]);
  await expect(changeItems(page)).toHaveText(['Modified · Node '+HOSTILE+' · title']);
  await expect(paneIn(page,'after').locator('[data-dv-node="a"]').first()).toContainText(HOSTILE);
  await docButton(page,'flows/x<img').click();
  await expect(changeItems(page)).toHaveText(['Added · Document','Added · Section '+HOSTILE]);
  await expect(paneIn(page,'after').locator('[data-dv-node="h"]').first()).toContainText(HOSTILE);
  expect(await page.locator('img, script:not([src])').count()).toBe(0);
  expect(await page.evaluate(()=>window.__pwned)).toBeUndefined();
});

test('P10: a chosen pull request stays at the commit shown after the pull request is force-pushed',async({page,repo,open})=>{
  const {c}=repo,{writeFile,readFile}=await import('node:fs/promises');
  const at=n=>({GIT_AUTHOR_DATE:'2026-01-2'+n+'T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-2'+n+'T10:00:00Z'});
  const doc=path.join(repo.other,A);
  const commitOnC7=async(title,subject,n)=>{
    git(repo.other,['checkout','-q','--detach',c.c7]);
    const spec=JSON.parse(await readFile(doc,'utf8'));spec.page.sections[0].diagram.nodes.b.title=title;
    await writeFile(doc,JSON.stringify(spec,null,2)+'\n');git(repo.other,['commit','-qam',subject],at(n));
    return git(repo.other,['rev-parse','HEAD']);
  };
  const first=await commitOnC7('B twelve','Twelve first',1);
  git(repo.other,['push','-q','origin','HEAD:refs/pull/12/head']);
  let head=first;
  const stub=ghStub(c);
  const gh=async args=>{const out=await stub(args);if(args[0]==='pr' && args[1]==='list')return JSON.stringify(JSON.parse(out).concat([
    {number:12,title:'Twelve',headRefName:'twelve',headRefOid:head,author:{login:'tess'},updatedAt:'2026-01-22T12:00:00Z',state:'OPEN',mergeCommit:null}]));return out;};
  await open(gh);
  await choose(page,'From','All commits',c.c7);
  await choose(page,'To','Pull requests',first);
  await expect(choice(page,'To')).toHaveText(choiceText({sha:short(first),date:'2026-01-22 12:00',author:'tess',subject:'Twelve'}));
  /* The pull request is force-pushed after it was chosen: gh now reports the new head. */
  const forced=await commitOnC7('B forced','Twelve forced',2);
  git(repo.other,['push','-q','-f','origin','HEAD:refs/pull/12/head']);head=forced;
  expect(forced,'precondition: the force-push moved the head').not.toBe(first);
  await compareButton(page).click();
  await expect(views(page)).toHaveCount(1);
  await expect(paneTitle(page,'after')).toHaveText(paneHeading('after',first,'Twelve'));
  await expect(changeItems(page)).toHaveText(['Modified · Node B twelve · title']);
  await expect(paneIn(page,'after').locator('[data-dv-node="b"]').first()).toContainText('B twelve');
  /* The commits-between list, reloaded after the force-push, still ends at the chosen commit. */
  await choose(page,'From','All commits',c.c7);
  await expect.poll(async()=>(await betweenRows(page)).map(r=>[r.sha,r.subject])).toEqual([[short(first),'Twelve first']]);
});

test('P10b: a pull request force-pushed while the picker is open cannot be chosen at its listed commit',async({page,repo,open,errors})=>{
  const {c}=repo,{writeFile,readFile}=await import('node:fs/promises');
  const at=n=>({GIT_AUTHOR_DATE:'2026-01-2'+n+'T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-2'+n+'T10:00:00Z'});
  const doc=path.join(repo.other,A);
  const commitOnC7=async(title,subject,n)=>{
    git(repo.other,['checkout','-q','--detach',c.c7]);
    const spec=JSON.parse(await readFile(doc,'utf8'));spec.page.sections[0].diagram.nodes.b.title=title;
    await writeFile(doc,JSON.stringify(spec,null,2)+'\n');git(repo.other,['commit','-qam',subject],at(n));
    return git(repo.other,['rev-parse','HEAD']);
  };
  const first=await commitOnC7('B twelve','Twelve first',1);
  git(repo.other,['push','-q','origin','HEAD:refs/pull/12/head']);
  let head=first;
  const stub=ghStub(c);
  const gh=async args=>{const out=await stub(args);if(args[0]==='pr' && args[1]==='list')return JSON.stringify(JSON.parse(out).concat([
    {number:12,title:'Twelve',headRefName:'twelve',headRefOid:head,author:{login:'tess'},updatedAt:'2026-01-22T12:00:00Z',state:'OPEN',mergeCommit:null}]));return out;};
  errors.allow(400,new RegExp('/api/documents\\?rev='+first+'(&|$)'));
  await open(gh);
  await choose(page,'From','All commits',c.c7);
  const dialog=await openPicker(page,'To');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  const row=dialog.getByRole('option').filter({has:page.locator('[data-field="sha"]',{hasText:short(first)})}).first();
  await expect(row,'precondition: the list shows PR #12 at its first head').toBeVisible();
  /* Force-pushed after the list loaded, before the click. */
  const forced=await commitOnC7('B forced','Twelve forced',2);
  git(repo.other,['push','-q','-f','origin','HEAD:refs/pull/12/head']);head=forced;
  await row.click();
  await expect(row).toHaveAttribute('aria-disabled','true');
  await expect(row).toContainText('not available locally');
  await expect(dialog).toBeVisible();
  await expect(choice(page,'To')).toHaveText('No revision chosen');
});

test('P10c: a pull request force-pushed while the picker is open is refused even when its listed commit is in the clone',async({page,repo,open})=>{
  const {c}=repo,{writeFile,readFile}=await import('node:fs/promises');
  const at=n=>({GIT_AUTHOR_DATE:'2026-01-2'+n+'T10:00:00Z',GIT_COMMITTER_DATE:'2026-01-2'+n+'T10:00:00Z'});
  const doc=path.join(repo.other,A);
  const commitOnC7=async(title,subject,n)=>{
    git(repo.other,['checkout','-q','--detach',c.c7]);
    const spec=JSON.parse(await readFile(doc,'utf8'));spec.page.sections[0].diagram.nodes.b.title=title;
    await writeFile(doc,JSON.stringify(spec,null,2)+'\n');git(repo.other,['commit','-qam',subject],at(n));
    return git(repo.other,['rev-parse','HEAD']);
  };
  const first=await commitOnC7('B twelve','Twelve first',1);
  git(repo.other,['push','-q','origin','HEAD:refs/pull/12/head']);
  let head=first;
  const stub=ghStub(c);
  const gh=async args=>{const out=await stub(args);if(args[0]==='pr' && args[1]==='list')return JSON.stringify(JSON.parse(out).concat([
    {number:12,title:'Twelve',headRefName:'twelve',headRefOid:head,author:{login:'tess'},updatedAt:'2026-01-22T12:00:00Z',state:'OPEN',mergeCommit:null}]));return out;};
  await open(gh);
  /* Choosing PR #12 once fetches its first head into the clone. */
  await choose(page,'To','Pull requests',first);
  await expect(choice(page,'To')).toHaveText(choiceText({sha:short(first),date:'2026-01-22 12:00',author:'tess',subject:'Twelve'}));
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'Pull requests'}).click();
  const row=dialog.getByRole('option').filter({has:page.locator('[data-field="sha"]',{hasText:short(first)})}).first();
  await expect(row,'precondition: the list shows PR #12 at its first head').toBeVisible();
  const forced=await commitOnC7('B forced','Twelve forced',2);
  git(repo.other,['push','-q','-f','origin','HEAD:refs/pull/12/head']);head=forced;
  await row.click();
  await expect(row).toHaveAttribute('aria-disabled','true');
  await expect(row).toContainText('not available locally');
  await expect(dialog).toBeVisible();
  await expect(choice(page,'From')).toHaveText('No revision chosen');
});

test('E0 E1 E2: with no documents at HEAD, All changed documents is chosen and a range can be compared (#917)',async({page,repo,open})=>{
  const {c}=repo;
  for(const f of [A,NEW,P])git(repo.dir,['rm','-q',f]);
  git(repo.dir,['commit','-q','-m','Remove flows'],{GIT_AUTHOR_NAME:'Erin',GIT_AUTHOR_EMAIL:'erin@example.test',GIT_AUTHOR_DATE:'2026-01-08T10:00:00Z',GIT_COMMITTER_NAME:'Erin',GIT_COMMITTER_EMAIL:'erin@example.test',GIT_COMMITTER_DATE:'2026-01-08T10:00:00Z'});
  const c8=git(repo.dir,['rev-parse','HEAD']);
  /* Precondition: HEAD (c8) holds no *.spec.json; c7 holds a, new and p. */
  expect(git(repo.dir,['ls-tree','-r','--name-only',c8]).split('\n').filter(f=>f.endsWith('.spec.json'))).toEqual([]);
  await open();
  /* E0 */
  await expect.poll(()=>documentOptions(page)).toEqual([ALL_DOCS]);
  const dialog=await openPicker(page,'From');
  await dialog.getByRole('tab',{name:'All commits'}).click();
  await expect(dialog.getByRole('tab',{name:'All commits'})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>shas(dialog)).toEqual(expect.arrayContaining([short(c8),short(c.c7)]));
  await dialog.getByRole('option').filter({has:page.locator('[data-field="sha"]',{hasText:short(c.c7)})}).first().click();
  await expect(dialog).toBeHidden();
  await choose(page,'To','All commits',c8);
  /* E1 */
  await expect.poll(()=>betweenRows(page)).toEqual([{date:'2026-01-08 10:00',sha:short(c8),subject:'Remove flows',prs:[]}]);
  await expect(compareButton(page)).toBeEnabled();
  await compareButton(page).click();
  await expect.poll(()=>docRows(page)).toEqual([[A,'Removed'],[NEW,'Removed'],[P,'Removed']]);
  /* E2 */
  await page.getByRole('button',{name:'Swap'}).click();
  await expect.poll(()=>documentOptions(page)).toEqual([ALL_DOCS,[A,A],[NEW,NEW],[P,P]]);
  await expect(page.getByLabel('Document',{exact:true})).toHaveValue('all');
  await expect(compareButton(page)).toBeEnabled();
});
