'use strict';
/* #974 tools/board-sync.js: an agent folds the edits saved on a live board (page.editHistory
   entries written by the board's Edit mode, #828/#855) into its local spec, and logs its own
   change as one agent entry. Contract source: #974 "What changes" and "Conflict rule"; Chuck's
   rulings 2026-11-04 (issue comment): only board edits saved after the newest agent entry make
   the agent ask before overriding them. §0 ruling: this new file plus extensions of
   tests/live-status-panel.test.js, tools/browser-tests/tests/edit-history.spec.mjs and
   tests/test_inject.py.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| S1 pull adds a board-added ticket and the entry, keeping the file's own formatting | local with one-line carriers; live = Bo added EX-1 to node beta | status merged; parsed local equals base + beta.tickets [EX-1] + that entry; every untouched original line kept in order; edits[0] {at, by Bo, lines ["EX-1 added to Beta service"]} | an impl that re-serializes the whole file; one that copies live over local |
| S2 a move in one entry reads as a move and lands on an edge | Bo: remove AA-1 from alpha, add AA-1 to edge 1 (beta → gamma) | alpha has no tickets field, edge 1 tickets [AA-1]; line "AA-1 moved from Alpha service to Beta service → Gamma" | an impl that applies only adds; one listing a move as two lines |
| S3 local-only changes survive a pull | local added node delta with DD-1 and dropped CC-1 from edge 0; live = Bo added EX-1 to beta | merged has delta+DD-1, no CC-1 on edge 0, EX-1 on beta | a two-way merge that takes live tracking wholesale |
| S4 a cleared Missing work marker | Riley cleared beta's marker | beta has no missingWork; line "Missing work cleared from Beta service" | an impl that only handles ticket ops |
| S5 imported carriers write the consumer overlay | Bo added SH-1 to imported node api (no overlay yet) and removed SH-2, the only ticket of overlay edge api->store | nodeTracking {api:{tickets:[SH-1]}}; edgeTracking absent | an impl that ignores topologyImports overlays; one leaving an empty overlay entry |
| S6 the same ticket placed differently on both sides stops the pull | live: Bo moved AA-1 alpha → beta; local moved AA-1 alpha → gamma | status conflict, conflicts[0] {kind both-changed, ticket AA-1}, message names Bo, Beta service, Gamma; CLI exit 2 and the local file byte-identical; resolve AA-1=live → only beta, =local → only gamma | a last-writer-wins merge that leaves AA-1 on beta and gamma |
| S7 a board edit on a node the local copy deleted stops the pull | live: Bo added EX-1 to beta; local deleted beta and its edges | conflicts[0] {kind carrier-missing, ticket EX-1}, message names Beta service; resolve EX-1=local → merged, EX-1 nowhere | an impl that drops the edit silently |
| S8 a live republish by another agent stops the pull | live history has an agent entry the local copy lacks | status republished; CLI exit 3, file unchanged | an impl that merges ticket edits over a structure it cannot see |
| S9 nothing new | local already holds every live entry | status up-to-date, text identical, edits [] | an impl that re-applies known entries |
| S10 an edge relabeled locally is still found by its endpoints | local relabeled edge 0 sync → push; live: Bo added EX-1 to edge 0 | edge 0 (label push) tickets [CC-1, EX-1] | an identity match on the label only |
| S11 a local copy without editHistory gets the field | local text with no editHistory member; live: Bo added EX-1 to beta | parsed local editHistory equals [Bo's entry] | an impl that only appends to an existing array |
| L1 log writes one agent entry with a counted summary and the ticket changes | local: +2 nodes, -1 edge, DD-1/EE-1 assigned, AA-1 moved, CC-1 removed | entry {at now, by {name Chuck}, source agent, summary "Added 2 nodes, removed 1 edge, assigned 2 tickets, moved 1 ticket, removed 1 ticket", changes exact}; it is the last item; validator editHistoryEntries keeps it with no warning | an impl writing a free-form line only; one without the source tag |
| L2 an explicit summary wins | --summary "Q3 reshape: added 2 nodes" | entry.summary equals it | an impl ignoring the option |
| L3 overriding a board edit made after the newest agent entry stops the log | history: agent entry 10:00, Bo moved AA-1 to beta at 11:00; local moves AA-1 beta → gamma | status conflict, conflicts[0] ticket AA-1, message names Bo and Beta service; CLI exit 2, file unchanged; with confirm [AA-1] → logged | an impl with no conflict check |
| L4 a board edit older than the newest agent entry is not a conflict | Bo's move at 09:00, agent entry 10:00; same local move | status logged, conflicts [] | an impl checking every board edit ever (Chuck's ruling) |
| L5 deleting the node that holds a board-placed ticket is a conflict | Bo added EX-1 to beta; local deletes beta | conflicts[0] ticket EX-1 | a check on moves only |
| L6 a local copy missing live entries is refused | live has an entry local lacks | status not-pulled; CLI exit 3 | an impl that logs over unmerged board edits |
| L7 no difference, no entry | local equals live | status unchanged, text identical | an impl appending an empty entry |
| L8 the 200-entry cap | 200 old entries | 200 after log, the oldest gone, the new entry last | an impl growing the list past the cap |
| L9 (diff review c1) placing a ticket that a recent board edit took off the board is a conflict | agent entry 10:00; Bo removed CC-1 from edge 0 at 11:00; local assigns CC-1 to gamma | status conflict, conflicts[0] ticket CC-1, message names Bo; with confirm [CC-1] → logged | a check limited to the carriers the board edit named |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const loader=require('../tools/source-loader.cjs');
// Loaded guarded so a missing tool fails each row on its own assertion, not the whole file at require time.
let sync=null,loadError=null;try{sync=require('../tools/board-sync.js');}catch(error){loadError=error;}
const S=()=>{assert.ok(sync,'tools/board-sync.js loads'+(loadError?': '+loadError.message.split('\n')[0]:''));return sync;};
const TOOL=path.join(__dirname,'..','tools','board-sync.js');
const V={URL,TextEncoder};vm.createContext(V);vm.runInContext(loader.composeSources(['canon.js','validator.js']),V);
const plain=value=>JSON.parse(JSON.stringify(value));

const LOCAL=`{
  "page": {
    "title": "Board",
    "editHistory": [],
    "tracking": {"jira": {"site": "https://acme.atlassian.net"}},
    "sections": [
      {"id": "main", "heading": "Main", "diagram": {
        "nodes": {
          "alpha": {"title": "Alpha service", "tickets": ["AA-1"]},
          "beta": {"title": "Beta service", "missingWork": true},
          "gamma": {"title": "Gamma"}
        },
        "rows": [["alpha", "beta", "gamma"]],
        "edges": [
          {"from": "alpha", "to": "beta", "label": "sync", "tickets": ["CC-1"]},
          {"from": "beta", "to": "gamma"}
        ]
      }},
      {"id": "imports", "heading": "Imported", "diagram": {
        "nodes": {"local": {"title": "Local"}},
        "rows": [["local"]],
        "topologyImports": [{"spec": "provider", "export": "core", "as": "shared", "edgeTracking": {"api->store": {"tickets": ["SH-2"]}}}]
      }}
    ]
  }
}
`;
const base=()=>JSON.parse(LOCAL);
const d=(spec,i=0)=>spec.page.sections[i].diagram;
const NODE=(id,i=0)=>['page','sections',i,'diagram','nodes',id];
const EDGE=(n,i=0)=>['page','sections',i,'diagram','edges',n];
const entry=(at,name,changes)=>({at,by:{id:'u_'+name.toLowerCase(),name},changes});
const agentEntry=(at,summary)=>({at,by:{name:'Chuck'},source:'agent',summary,changes:[]});
function edgeChange(op,ticket,where,from,to,label){return {op,ticket,path:where,edge:[from,to],label};}
// The live file: the base spec changed by `mutate`, with `history` as its editHistory, written the way the board writes it.
function liveText(mutate,history){const spec=base();if(mutate)mutate(spec);spec.page.editHistory=history;return JSON.stringify(spec,null,2)+'\n';}
// A local text that already knows `history`, keeping LOCAL's formatting elsewhere.
const localWith=(history,text=LOCAL)=>text.replace('"editHistory": [],','"editHistory": '+JSON.stringify(history)+',');
// Every original line not naming a touched member appears in the result, in order.
function keepsLines(before,after,touched){
  const lines=after.split('\n');let at=0;
  for(const line of before.split('\n')){
    if(touched.some(member=>line.includes(member)))continue;
    const found=lines.indexOf(line,at);assert.ok(found>=0,'line kept as written: '+JSON.stringify(line));at=found+1;
  }
}
function tmp(files){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'board-sync-'));for(const [name,text] of Object.entries(files))fs.writeFileSync(path.join(dir,name),text);return dir;}
const run=(dir,args)=>spawnSync(process.execPath,[TOOL,...args],{cwd:dir,encoding:'utf8'});

const BO_ADD=entry('2026-11-03T14:02:00.000Z','Bo',[{op:'add',ticket:'EX-1',path:NODE('beta'),node:'beta',label:'Beta service'}]);
const BO_MOVE=entry('2026-11-03T15:10:00.000Z','Bo',[{op:'remove',ticket:'AA-1',path:NODE('alpha'),node:'alpha',label:'Alpha service'},
 edgeChange('add','AA-1',EDGE(1),'beta','gamma','Beta service → Gamma')]);

test('S1 pull folds a board-added ticket and its entry into the local file and keeps its formatting',()=>{
 const live=liveText(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD]);
 const out=S().pull(LOCAL,live);
 assert.equal(out.status,'merged');assert.deepEqual(plain(out.conflicts),[]);
 const want=base();d(want).nodes.beta.tickets=['EX-1'];want.page.editHistory=[BO_ADD];
 assert.deepEqual(JSON.parse(out.text),want);
 keepsLines(LOCAL,out.text,['"beta":','"editHistory"']);
 assert.deepEqual(plain(out.edits),[{at:'2026-11-03T14:02:00.000Z',by:'Bo',lines:['EX-1 added to Beta service']}]);
});

test('S2 a remove and an add of one ticket in one entry read as a move and land on an edge',()=>{
 const live=liveText(s=>{delete d(s).nodes.alpha.tickets;d(s).edges[1].tickets=['AA-1'];},[BO_MOVE]);
 const out=S().pull(LOCAL,live);
 assert.equal(out.status,'merged');
 const got=JSON.parse(out.text);
 assert.equal(Object.hasOwn(d(got).nodes.alpha,'tickets'),false,'alpha keeps no empty tickets field');
 assert.deepEqual(d(got).edges[1].tickets,['AA-1']);assert.deepEqual(d(got).edges[0].tickets,['CC-1']);
 assert.deepEqual(plain(out.edits[0].lines),['AA-1 moved from Alpha service to Beta service → Gamma']);
});

test('S3 changes made only in the local copy survive a pull',()=>{
 const local=LOCAL.replace('"gamma": {"title": "Gamma"}','"gamma": {"title": "Gamma"},\n          "delta": {"title": "Delta", "tickets": ["DD-1"]}')
  .replace('"label": "sync", "tickets": ["CC-1"]}','"label": "sync"}');
 const live=liveText(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD]);
 const out=S().pull(local,live);
 assert.equal(out.status,'merged');
 const got=JSON.parse(out.text);
 assert.deepEqual(d(got).nodes.delta,{title:'Delta',tickets:['DD-1']});
 assert.equal(Object.hasOwn(d(got).edges[0],'tickets'),false,'the local removal of CC-1 stays');
 assert.deepEqual(d(got).nodes.beta.tickets,['EX-1']);
 keepsLines(local,out.text,['"beta":','"editHistory"']);
});

test('S4 a Missing work marker cleared on the board is cleared locally',()=>{
 const riley=entry('2026-11-03T16:00:00Z','Riley',[{op:'clear-missing-work',path:NODE('beta'),node:'beta',label:'Beta service'}]);
 const out=S().pull(LOCAL,liveText(s=>{delete d(s).nodes.beta.missingWork;},[riley]));
 assert.equal(out.status,'merged');
 assert.deepEqual(d(JSON.parse(out.text)).nodes.beta,{title:'Beta service'});
 assert.deepEqual(plain(out.edits),[{at:'2026-11-03T16:00:00Z',by:'Riley',lines:['Missing work cleared from Beta service']}]);
});

test('S5 board edits on imported carriers write the consumer overlay',()=>{
 const imp=['page','sections',1,'diagram','topologyImports',0];
 const bo=entry('2026-11-03T14:30:00Z','Bo',[{op:'add',ticket:'SH-1',path:imp.concat(['nodeTracking','api']),node:'shared::api',label:'API'},
  {op:'remove',ticket:'SH-2',path:imp.concat(['edgeTracking','api->store']),edge:['shared::api','shared::store'],label:'API → Store'}]);
 const live=liveText(s=>{const t=d(s,1).topologyImports[0];t.nodeTracking={api:{tickets:['SH-1']}};delete t.edgeTracking;},[bo]);
 const out=S().pull(LOCAL,live);
 assert.equal(out.status,'merged');
 const t=d(JSON.parse(out.text),1).topologyImports[0];
 assert.deepEqual(t.nodeTracking,{api:{tickets:['SH-1']}});
 assert.equal(Object.hasOwn(t,'edgeTracking'),false,'an emptied overlay map is removed, as Edit mode does');
 assert.deepEqual(plain(out.edits[0].lines),['SH-1 added to API','SH-2 removed from API → Store']);
});

test('S6 a ticket placed differently on the board and in the local copy stops the pull until resolved',()=>{
 const live=liveText(s=>{delete d(s).nodes.alpha.tickets;d(s).nodes.beta.tickets=['AA-1'];},
  [entry('2026-11-03T15:10:00Z','Bo',[{op:'remove',ticket:'AA-1',path:NODE('alpha'),node:'alpha',label:'Alpha service'},{op:'add',ticket:'AA-1',path:NODE('beta'),node:'beta',label:'Beta service'}])]);
 const local=LOCAL.replace('"alpha": {"title": "Alpha service", "tickets": ["AA-1"]}','"alpha": {"title": "Alpha service"}')
  .replace('"gamma": {"title": "Gamma"}','"gamma": {"title": "Gamma", "tickets": ["AA-1"]}');
 const out=S().pull(local,live);
 assert.equal(out.status,'conflict');
 assert.equal(out.conflicts.length,1);assert.equal(out.conflicts[0].kind,'both-changed');assert.equal(out.conflicts[0].ticket,'AA-1');
 for(const name of ['Bo','Beta service','Gamma'])assert.ok(out.conflicts[0].message.includes(name),out.conflicts[0].message);
 const dir=tmp({'local.json':local,'live.json':live}),cli=run(dir,['pull','local.json','live.json']);
 assert.equal(cli.status,2,cli.stdout+cli.stderr);assert.match(cli.stdout,/AA-1/);
 assert.equal(fs.readFileSync(path.join(dir,'local.json'),'utf8'),local,'nothing written on a conflict');
 const took=S().pull(local,live,{resolve:{'AA-1':'live'}});assert.equal(took.status,'merged');
 const t=d(JSON.parse(took.text));assert.deepEqual(t.nodes.beta.tickets,['AA-1']);assert.equal(Object.hasOwn(t.nodes.gamma,'tickets'),false);assert.equal(Object.hasOwn(t.nodes.alpha,'tickets'),false);
 const kept=S().pull(local,live,{resolve:{'AA-1':'local'}});assert.equal(kept.status,'merged');
 const k=d(JSON.parse(kept.text));assert.deepEqual(k.nodes.gamma.tickets,['AA-1']);assert.equal(Object.hasOwn(k.nodes.beta,'tickets'),false);
 const cliLive=run(dir,['pull','local.json','live.json','--resolve','AA-1=live']);assert.equal(cliLive.status,0,cliLive.stdout+cliLive.stderr);
 assert.deepEqual(d(JSON.parse(fs.readFileSync(path.join(dir,'local.json'),'utf8'))).nodes.beta.tickets,['AA-1']);
});

test('S7 a board edit on a node the local copy deleted stops the pull',()=>{
 const live=liveText(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD]);
 const spec=base();delete d(spec).nodes.beta;d(spec).rows=[['alpha','gamma']];d(spec).edges=[];
 const local=JSON.stringify(spec,null,2);
 const out=S().pull(local,live);
 assert.equal(out.status,'conflict');
 assert.equal(out.conflicts[0].kind,'carrier-missing');assert.equal(out.conflicts[0].ticket,'EX-1');assert.ok(out.conflicts[0].message.includes('Beta service'),out.conflicts[0].message);
 const dropped=S().pull(local,live,{resolve:{'EX-1':'local'}});
 assert.equal(dropped.status,'merged');assert.ok(!JSON.stringify(JSON.parse(dropped.text).page.sections).includes('EX-1'),'EX-1 is placed nowhere');
 assert.deepEqual(JSON.parse(dropped.text).page.editHistory,[BO_ADD],'the board entry is still recorded');
});

test('S8 a live board republished by another agent stops the pull',()=>{
 const live=liveText(s=>{d(s).nodes.gamma.title='Gamma v2';},[agentEntry('2026-11-03T12:00:00Z','Renamed Gamma')]);
 assert.equal(S().pull(LOCAL,live).status,'republished');
 const dir=tmp({'local.json':LOCAL,'live.json':live}),cli=run(dir,['pull','local.json','live.json']);
 assert.equal(cli.status,3,cli.stdout+cli.stderr);assert.equal(fs.readFileSync(path.join(dir,'local.json'),'utf8'),LOCAL);
});

test('S9 a local copy that already holds every live entry is up to date',()=>{
 const live=liveText(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD]);
 const local=localWith([BO_ADD]).replace('"beta": {"title": "Beta service", "missingWork": true}','"beta": {"title": "Beta service", "missingWork": true, "tickets": ["EX-1"]}');
 const out=S().pull(local,live);
 assert.equal(out.status,'up-to-date');assert.equal(out.text,local);assert.deepEqual(plain(out.edits),[]);
});

test('S10 an edge relabeled in the local copy is still found by its endpoints',()=>{
 const live=liveText(s=>{d(s).edges[0].tickets=['CC-1','EX-1'];},[entry('2026-11-03T14:05:00Z','Bo',[edgeChange('add','EX-1',EDGE(0),'alpha','beta','Alpha service → Beta service')])]);
 const local=LOCAL.replace('"label": "sync"','"label": "push"');
 const out=S().pull(local,live);
 assert.equal(out.status,'merged');
 const edge=d(JSON.parse(out.text)).edges[0];assert.equal(edge.label,'push');assert.deepEqual(edge.tickets,['CC-1','EX-1']);
});

test('S11 a local copy without editHistory gets the field',()=>{
 const local=LOCAL.replace('    "editHistory": [],\n','');assert.ok(!local.includes('editHistory'),'precondition: no editHistory member');
 const out=S().pull(local,liveText(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD]));
 assert.equal(out.status,'merged');assert.deepEqual(JSON.parse(out.text).page.editHistory,[BO_ADD]);
});

// A pulled pair: the live file and a local copy holding the same spec, then changed locally by `change`.
function pulled(mutate,history,change){
 const live=liveText(mutate,history),spec=JSON.parse(live);if(change)change(spec);
 return {live,local:JSON.stringify(spec,null,2)+'\n'};
}
const NOW=new Date('2026-11-04T15:00:00.000Z');

test('L1 log appends one agent entry with a counted summary and the ticket changes',()=>{
 const {live,local}=pulled(null,[agentEntry('2026-11-01T10:00:00Z','Initial board')],spec=>{
  const g=d(spec);g.nodes.delta={title:'Delta',tickets:['DD-1']};g.nodes.eps={title:'Eps',tickets:['EE-1']};g.rows[0].push('delta','eps');
  g.edges.splice(1,1);delete g.nodes.alpha.tickets;g.nodes.gamma.tickets=['AA-1'];delete g.edges[0].tickets;
 });
 const out=S().log(local,live,{by:'Chuck',now:NOW});
 assert.equal(out.status,'logged');assert.deepEqual(plain(out.conflicts),[]);
 const history=JSON.parse(out.text).page.editHistory;
 assert.equal(history.length,2);assert.deepEqual(history[1],plain(out.entry));
 assert.deepEqual(plain(out.entry),{at:'2026-11-04T15:00:00.000Z',by:{name:'Chuck'},source:'agent',
  summary:'Added 2 nodes, removed 1 edge, assigned 2 tickets, moved 1 ticket, removed 1 ticket',
  changes:[{op:'remove',ticket:'AA-1',path:NODE('alpha'),node:'alpha',label:'Alpha service'},
   {op:'add',ticket:'AA-1',path:NODE('gamma'),node:'gamma',label:'Gamma'},
   edgeChange('remove','CC-1',EDGE(0),'alpha','beta','Alpha service → Beta service'),
   {op:'add',ticket:'DD-1',path:NODE('delta'),node:'delta',label:'Delta'},
   {op:'add',ticket:'EE-1',path:NODE('eps'),node:'eps',label:'Eps'}]});
 const warnings=[];V.editHistoryEntries(JSON.parse(out.text).page,w=>warnings.push(w));assert.deepEqual(warnings,[]);
 const rest=JSON.parse(out.text);rest.page.editHistory.pop();assert.deepEqual(rest,JSON.parse(local),'only the entry is added');
});

test('L2 an explicit summary replaces the counted one',()=>{
 const {live,local}=pulled(null,[],spec=>{d(spec).nodes.delta={title:'Delta'};d(spec).nodes.eps={title:'Eps'};});
 const out=S().log(local,live,{by:'Chuck',summary:'Q3 reshape: added 2 nodes',now:NOW});
 assert.equal(out.status,'logged');assert.equal(out.entry.summary,'Q3 reshape: added 2 nodes');assert.deepEqual(plain(out.entry.changes),[]);
});

const MOVE_TO_BETA=at=>entry(at,'Bo',[{op:'remove',ticket:'AA-1',path:NODE('alpha'),node:'alpha',label:'Alpha service'},{op:'add',ticket:'AA-1',path:NODE('beta'),node:'beta',label:'Beta service'}]);
const onBeta=s=>{delete d(s).nodes.alpha.tickets;d(s).nodes.beta.tickets=['AA-1'];};
const toGamma=s=>{delete d(s).nodes.beta.tickets;d(s).nodes.gamma.tickets=['AA-1'];};

test('L3 moving a ticket a board edit placed after the newest agent entry needs the author to confirm',()=>{
 const {live,local}=pulled(onBeta,[agentEntry('2026-11-03T10:00:00Z','Initial board'),MOVE_TO_BETA('2026-11-03T11:00:00Z')],toGamma);
 const out=S().log(local,live,{by:'Chuck',now:NOW});
 assert.equal(out.status,'conflict');assert.equal(out.conflicts.length,1);assert.equal(out.conflicts[0].ticket,'AA-1');
 for(const name of ['Bo','Beta service'])assert.ok(out.conflicts[0].message.includes(name),out.conflicts[0].message);
 const dir=tmp({'local.json':local,'live.json':live}),cli=run(dir,['log','local.json','live.json','--by','Chuck']);
 assert.equal(cli.status,2,cli.stdout+cli.stderr);assert.equal(fs.readFileSync(path.join(dir,'local.json'),'utf8'),local,'nothing written on a conflict');
 assert.equal(S().log(local,live,{by:'Chuck',now:NOW,confirm:['AA-1']}).status,'logged');
 const ok=run(dir,['log','local.json','live.json','--by','Chuck','--confirm','AA-1']);assert.equal(ok.status,0,ok.stdout+ok.stderr);
 const last=JSON.parse(fs.readFileSync(path.join(dir,'local.json'),'utf8')).page.editHistory.at(-1);
 assert.equal(last.source,'agent');assert.deepEqual(last.by,{name:'Chuck'});assert.equal(last.summary,'Moved 1 ticket');
});

test('L4 a board edit older than the newest agent entry is not a conflict',()=>{
 const {live,local}=pulled(onBeta,[MOVE_TO_BETA('2026-11-03T09:00:00Z'),agentEntry('2026-11-03T10:00:00Z','Initial board')],toGamma);
 const out=S().log(local,live,{by:'Chuck',now:NOW});
 assert.equal(out.status,'logged');assert.deepEqual(plain(out.conflicts),[]);
});

test('L5 deleting the node that holds a board-placed ticket is a conflict',()=>{
 const {live,local}=pulled(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD],spec=>{delete d(spec).nodes.beta;d(spec).rows=[['alpha','gamma']];d(spec).edges=[];});
 const out=S().log(local,live,{by:'Chuck',now:NOW});
 assert.equal(out.status,'conflict');assert.equal(out.conflicts[0].ticket,'EX-1');
});

test('L6 a local copy missing live entries must pull first',()=>{
 const live=liveText(s=>{d(s).nodes.beta.tickets=['EX-1'];},[BO_ADD]);
 assert.equal(S().log(LOCAL,live,{by:'Chuck',now:NOW}).status,'not-pulled');
 const dir=tmp({'local.json':LOCAL,'live.json':live}),cli=run(dir,['log','local.json','live.json','--by','Chuck']);
 assert.equal(cli.status,3,cli.stdout+cli.stderr);assert.equal(fs.readFileSync(path.join(dir,'local.json'),'utf8'),LOCAL);
});

test('L7 no difference writes no entry',()=>{
 const {live,local}=pulled(null,[BO_ADD]);
 const out=S().log(local,live,{by:'Chuck',now:NOW});
 assert.equal(out.status,'unchanged');assert.equal(out.text,local);
});

test('L8 the history keeps the newest 200 entries',()=>{
 const old=[];for(let i=0;i<200;i++)old.push(agentEntry(new Date(Date.UTC(2026,0,1,0,i)).toISOString(),'Step '+i));
 const {live,local}=pulled(null,old,spec=>{d(spec).nodes.delta={title:'Delta'};});
 const history=JSON.parse(S().log(local,live,{by:'Chuck',now:NOW}).text).page.editHistory;
 assert.equal(history.length,200);assert.equal(history[0].summary,'Step 1');assert.equal(history[199].summary,'Added 1 node');
});

test('L9 placing a ticket that a board edit after the newest agent entry took off the board needs the author to confirm',()=>{
 const bo=entry('2026-11-03T11:00:00Z','Bo',[edgeChange('remove','CC-1',EDGE(0),'alpha','beta','Alpha service → Beta service')]);
 const {live,local}=pulled(s=>{delete d(s).edges[0].tickets;},[agentEntry('2026-11-03T10:00:00Z','Initial board'),bo],spec=>{d(spec).nodes.gamma.tickets=['CC-1'];});
 const out=S().log(local,live,{by:'Chuck',now:NOW});
 assert.equal(out.status,'conflict');assert.equal(out.conflicts.length,1);assert.equal(out.conflicts[0].ticket,'CC-1');
 assert.ok(out.conflicts[0].message.includes('Bo'),out.conflicts[0].message);
 assert.equal(S().log(local,live,{by:'Chuck',now:NOW,confirm:['CC-1']}).status,'logged');
});
