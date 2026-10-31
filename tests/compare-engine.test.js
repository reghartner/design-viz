'use strict';
/* Shared compare engine contract (issue #847). Chuck's coverage ruling
   2026-10-31: dedicated tests/compare-engine.test.js for the contract rows,
   tests/compare-engine-stress.test.js for the generated stress run, and the
   imported-node assertion in tests/agent-review.test.js flipped.

   API under test: compareDocuments(before, after) -> entries[]
   side    = null (absent document) | {authored, resolved, ledger}
   entry   = {kind, status, origin?, cause, effect?, beforePath, afterPath,
              fields:[{beforePath, afterPath, before, after}],
              effects:[{pathId, target:{kind,id}, category, beforeSteps, afterSteps}],
              scopeBefore?, scopeAfter?,
              resolved?:[{kind, status, origin, beforePath, afterPath, before?, after?}]}
   Paths start at the normalized page root (no `page.` prefix). Keys that are
   not plain identifiers use ["key"]. Resolved-only differences are prefixed
   `resolved:`. Ledger hunks use `ledger:<from>-<to>` (1-based lines).
   Fields are leaf values (arrays and scalars are leaves): an object present on
   one side only contributes one field per leaf, with null on the absent side.
   A record (step, panel, node, ...) added or removed is one entry with no fields.
   Step coordinates are source-step indices on the path; 'ambient' sorts last.
   Records with different explicit ids never pair (they are added + removed).

   CONTRACT MATRIX (each row asserted below; fixture -> scoped assertion -> rejects)
   R1  step panel patch       step 5 edits p.value       one step entry, leaf path, effects [5,6]          coarse kind:'steps' record; whole-diagram range
   R2  carried range ends     step 7 re-sets p.value     effects stop at 6; no 'ambient'                  carry-to-end; ambient always added
   R3  first-step patch       step 0 edits p.value       'ambient' in both lists                           ambient never reported
   R4  panel initial          panels[0].initial.value    kind panel, steps before first patch + ambient     declaration edits with no reader effect
   R4b fold-read declaration  battery drainPerHour       effect 'state', effects = fold oracle              treating every non-initial field as render-only
   R5  render-only field      gauge max                  effect 'declaration', no effects, scope = visible steps + ambient   proven-difference claim; hidden steps in scope
   R6  panels[i].visible      visible true->false        visibility effects only, never 'ambient'          ambient included for visibility
   R7  zero-step diagram      initial / visible          ['ambient'] for initial; no effect for visible    empty effects for initial
   R8  local node field       nodes.a.sub                origin local, cause document, one field           extra fields; missing origin
   R9  provider-only change   contexts differ            origin imported, cause provider, resolved: path   imported nodes skipped (today)
   R10 override vs provider   identical resolved pages   leaf nodeOverrides/edgeOverrides paths; exact attached list   same entry for both causes
   R12 import declaration     as / export / spec         one import entry, exact attached resolved list    separate provider entries; dropped items
   R19 provider-only add/remove   node + edge added, node + edge removed   one provider entry each        attaching to an unchanged import
   R13 step tone              local and imported node    leaf tone path, tone effects = oracle             tones ignored; imported ids dropped
   R14 step panelVisibility   hide p at step 3           leaf path, visibility effect [3..]                state-only effects
   R15 story time             storyTime.start, steps[i].time   exact leaf paths + values, effects = oracle  coarse entry with right effects
   R16 moved + edited step    id m 4 -> 5, text edit     beforePath steps[4].text, afterPath steps[5].text  single shared path
   R17 path membership/order  remove + swap ids          path entry; state/tone/visibility = aligned oracle  panel-only effects
   R18 add/remove records     panel step path section node edge layout view   status, null absent path, effects = oracle   positional "modified" pairs
   R20 nested tabs            caption, tab view, section view    nested exact paths                         flat sections[i] paths
   R21 document / heading / layout / ledger   exact paths and hunks                                     coarse labels only
   R22 legacy steps[i].patch  alias edit                 path uses .patch, same effect as .panels          hard-coded .panels
   R23 absent document        compare(null, side)        exactly document + one per section; mirrored      extra record entries
   R24 identity / full mirror symmetry (fields, effects, scopes, resolved) / immutability                 invented entries; one-sided payloads
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const C={URL,console};vm.createContext(C);
vm.runInContext(readSource('validator.js'),C);vm.runInContext(readSource('canon.js'),C);

function side(raw,{context=null,ledger=null}={}){
  raw=plain(raw);
  return {authored:C.normalize(plain(raw)),resolved:C.normalize(context?C.FlowTopology.resolveSource(plain(raw),context):plain(raw)),ledger};
}
const canon=v=>JSON.stringify(v,Object.keys(v||{}).sort());
const sortJ=list=>(list||[]).map(x=>JSON.stringify(plain(x))).sort();
/* Full mirror: swap sides in every payload; statuses flip. */
function mirror(e){
  const flip={added:'removed',removed:'added',modified:'modified'};
  const m=plain(e);m.status=flip[m.status];[m.beforePath,m.afterPath]=[e.afterPath,e.beforePath];
  m.fields=(e.fields||[]).map(f=>plain({beforePath:f.afterPath,afterPath:f.beforePath,before:f.after,after:f.before}));
  m.effects=(e.effects||[]).map(x=>plain(Object.assign({},x,{beforeSteps:x.afterSteps,afterSteps:x.beforeSteps})));
  if('scopeBefore' in e || 'scopeAfter' in e){m.scopeBefore=e.scopeAfter;m.scopeAfter=e.scopeBefore;}
  if(e.resolved)m.resolved=e.resolved.map(r=>plain(Object.assign({},r,{status:flip[r.status],beforePath:r.afterPath,afterPath:r.beforePath,before:r.after,after:r.before})));
  return m;
}
const normEntry=e=>{const x=plain(e);x.fields=sortJ(x.fields);x.effects=sortJ(x.effects);if(x.resolved)x.resolved=sortJ(x.resolved);return JSON.stringify(x,Object.keys(x).sort());};
function compare(a,b){
  assert.equal(typeof C.compareDocuments,'function','compareDocuments(before, after) is defined by the shared engine');
  const sa=plain(a),sb=plain(b),out=plain(C.compareDocuments(a,b));
  assert.deepEqual(plain(a),sa,'before side not mutated');assert.deepEqual(plain(b),sb,'after side not mutated');
  const back=plain(C.compareDocuments(b,a));
  assert.deepEqual(back.map(normEntry).sort(),out.map(mirror).map(normEntry).sort(),'compare(b,a) is the full mirror of compare(a,b)');
  return out;
}
const doc=diagram=>({page:{title:'T',sections:[{id:'s',heading:'S',diagram}]}});
const SEC='sections[0].diagram';
const steps=(n,extra={})=>Array.from({length:n},(_,i)=>Object.assign({id:'s'+i,nodes:['a'],text:'Step '+i},extra[i]||{}));
const base=(over={})=>Object.assign({nodes:{a:{title:'A',sub:'one'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'go'}],
  panels:[{id:'p',type:'gauge',title:'Power',unit:'mA',max:400,initial:{value:6}},{id:'q',type:'gauge',title:'Other',initial:{value:1}}],steps:steps(8,{7:{panels:{p:{value:80}}}})},over);
const effectOf=(entry,target,category)=>(entry.effects||[]).find(e=>e.target.id===target && e.category===category);
const only=(entries,pred,msg)=>{const m=entries.filter(pred);assert.equal(m.length,1,msg+' — got '+JSON.stringify(entries.map(e=>[e.kind,e.status,e.beforePath,e.afterPath])));return m[0];};

/* Independent oracle: folds compared at steps paired by id on one path, plus
   the ambient rule for panel state (ambientInitial ? initial : first state). */
function oracle(beforeD,afterD,category,id,pathId){
  const fold={state:d=>C.foldPanelStates(d)[id],tone:d=>C.foldNodeTones(d).map(s=>s[id]),visibility:d=>C.foldPanelVisibility(d)[id]}[category];
  const pa=C.diagramForPath(beforeD,pathId),pb=C.diagramForPath(afterD,pathId),fa=fold(pa)||[],fb=fold(pb)||[];
  const ia=pa._sourceIndices,ib=pb._sourceIndices,ida=ia.map(i=>beforeD.steps[i].id),idb=ib.map(i=>afterD.steps[i].id);
  const bs=[],as=[];
  if(ia.length || ib.length){
    ida.forEach((sid,k)=>{const j=idb.indexOf(sid);if(j<0 || JSON.stringify(fa[k])!==JSON.stringify(fb[j])){bs.push(ia[k]);if(j>=0)as.push(ib[j]);}});
    idb.forEach((sid,j)=>{if(ida.indexOf(sid)<0)as.push(ib[j]);});
  }
  bs.sort((x,y)=>x-y);as.sort((x,y)=>x-y);
  if(category==='state'){
    const amb=(d,states)=>{const p=(d.panels||[]).find(x=>x.id===id);if(!p)return undefined;const v=C.PanelViews.get(p.type);return v && v.options && v.options.ambientInitial?p.initial:states[0];};
    if(JSON.stringify(amb(beforeD,fa))!==JSON.stringify(amb(afterD,fb))){bs.push('ambient');as.push('ambient');}
  }
  return {beforeSteps:bs,afterSteps:as};
}
const stepsOf=e=>({beforeSteps:e.beforeSteps,afterSteps:e.afterSteps});

test('R1 R2 step panel patch: one step entry at its leaf field path; carried range ends at the next re-set; no ambient',()=>{
  const before=base(),after=base();before.steps[5].panels={p:{value:6}};after.steps[5].panels={p:{value:42}};
  assert.equal(C.foldPanelStates(after).p[5].value,42,'precondition: proposal folds 42 at step 5');
  assert.equal(C.foldPanelStates(after).p[7].value,80,'precondition: step 7 re-sets the value');
  const out=compare(side(doc(before)),side(doc(after)));
  const e=only(out,x=>x.kind==='step','exactly one step entry');
  assert.equal(e.status,'modified');assert.equal(e.cause,'document');assert.equal(e.effect,'state');
  assert.equal(e.beforePath,SEC+'.steps[5]');assert.equal(e.afterPath,SEC+'.steps[5]');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.steps[5].panels.p.value',afterPath:SEC+'.steps[5].panels.p.value',before:6,after:42}]);
  assert.deepEqual(e.effects,[{pathId:'happy',target:{kind:'panel',id:'p'},category:'state',beforeSteps:[5,6],afterSteps:[5,6]}]);
  assert.deepEqual(stepsOf(e.effects[0]),oracle(before,after,'state','p','happy'));
  assert.equal(out.length,1,'no other entries');
});

test('R3 first-step patch reaches ambient for a panel without the ambientInitial trait',()=>{
  const before=base(),after=base();before.steps[0].panels={p:{value:6}};after.steps[0].panels={p:{value:9}};
  assert.ok(!(C.PanelViews.get('gauge').options||{}).ambientInitial,'precondition: gauge ambient shows the first folded state');
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step','one step entry');
  const eff=effectOf(e,'p','state');assert.deepEqual(stepsOf(eff),{beforeSteps:[0,1,2,3,4,5,6,'ambient'],afterSteps:[0,1,2,3,4,5,6,'ambient']});
  assert.deepEqual(stepsOf(eff),oracle(before,after,'state','p','happy'));
});

test('R4 panel initial value: panel entry whose effect covers steps before the first patch and ambient',()=>{
  const before=base(),after=base();after.panels[0].initial.value=9;
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='panel','one panel entry');
  assert.equal(e.afterPath,SEC+'.panels[0]');assert.equal(e.effect,'state');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.panels[0].initial.value',afterPath:SEC+'.panels[0].initial.value',before:6,after:9}]);
  assert.deepEqual(e.effects,[{pathId:'happy',target:{kind:'panel',id:'p'},category:'state',beforeSteps:[0,1,2,3,4,5,6,'ambient'],afterSteps:[0,1,2,3,4,5,6,'ambient']}]);
  assert.deepEqual(stepsOf(e.effects[0]),oracle(before,after,'state','p','happy'));
});

test('R4b declaration field read by the type fold (battery drainPerHour) is a proven state effect',()=>{
  const mk=()=>base({storyTime:{start:'2026-09-24T22:30'},panels:[{id:'bat',type:'battery',title:'Battery',drainPerHour:1,initial:{charge:64,trend:'idle'}}],steps:steps(4,{1:{time:'+2h'},3:{time:'+5h'}})});
  const before=mk(),after=mk();after.panels[0].drainPerHour=3;
  const o=oracle(before,after,'state','bat','happy');assert.ok(o.afterSteps.length,'precondition: the fold reads drainPerHour');
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='panel','one panel entry');
  assert.equal(e.effect,'state');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.panels[0].drainPerHour',afterPath:SEC+'.panels[0].drainPerHour',before:1,after:3}]);
  assert.deepEqual(stepsOf(effectOf(e,'bat','state')),o);
});

test('R5 render-only declaration field: scoped to visible steps plus ambient, with no proven reader effect',()=>{
  const before=base(),after=base();[before,after].forEach(d=>{d.steps[3].panelVisibility={p:false};d.steps[4].panelVisibility={p:true};});
  after.panels[0].max=500;
  assert.deepEqual(C.foldPanelStates(before).p,C.foldPanelStates(after).p,'precondition: folded states identical');
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='panel','one panel entry');
  assert.equal(e.effect,'declaration');assert.deepEqual(e.effects,[]);
  assert.deepEqual(e.fields,[{beforePath:SEC+'.panels[0].max',afterPath:SEC+'.panels[0].max',before:400,after:500}]);
  assert.deepEqual(e.scopeBefore,[0,1,2,4,5,6,7,'ambient']);assert.deepEqual(e.scopeAfter,[0,1,2,4,5,6,7,'ambient']);
});

test('R6 R7 panel visible flag: visibility effects never include ambient; zero-step diagrams report ambient only for state',()=>{
  const before=base(),after=base();before.steps[4].panelVisibility={p:true};after.steps[4].panelVisibility={p:true};after.panels[0].visible=false;
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='panel','one panel entry');
  assert.deepEqual(e.fields,[{beforePath:null,afterPath:SEC+'.panels[0].visible',after:false}]);
  assert.deepEqual(e.effects,[{pathId:'happy',target:{kind:'panel',id:'p'},category:'visibility',beforeSteps:[0,1,2,3],afterSteps:[0,1,2,3]}]);
  assert.deepEqual(stepsOf(e.effects[0]),oracle(before,after,'visibility','p','happy'));
  const z0=base({steps:[]}),z1=base({steps:[]});z1.panels[0].initial.value=7;
  const zs=only(compare(side(doc(z0)),side(doc(z1))),x=>x.kind==='panel','zero-step initial edit');
  assert.deepEqual(zs.effects,[{pathId:'happy',target:{kind:'panel',id:'p'},category:'state',beforeSteps:['ambient'],afterSteps:['ambient']}]);
  const z2=base({steps:[]});z2.panels[0].visible=false;
  const zv=only(compare(side(doc(z0)),side(doc(z2))),x=>x.kind==='panel','zero-step visible edit');
  assert.deepEqual(zv.effects,[],'ambient shows every panel, so hiding changes nothing the reader sees');
  assert.notEqual(zv.effect,'declaration','a visible-only edit is not a render-only declaration change');
});

test('R8 local node field: one node entry, origin local, cause document, exactly the edited field',()=>{
  const before=base(),after=base();after.nodes.a.sub='two';
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='node','one node entry');
  assert.equal(e.origin,'local');assert.equal(e.cause,'document');assert.equal(e.status,'modified');assert.equal(e.afterPath,SEC+'.nodes.a');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.nodes.a.sub',afterPath:SEC+'.nodes.a.sub',before:'one',after:'two'}]);
});

/* Topology fixture: provider exports a,b (+ edge); consumer imports as child. */
function topo(){
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const provider=spec('provider',{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'ab'}],topologyExports:{public:{nodes:['a','b'],edges:['a->b']},onlyA:{nodes:['a'],edges:[]}}});
  const provider2=spec('provider2',{nodes:{a:{title:'A2'}},rows:[['a']],topologyExports:{public:{nodes:['a'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],panels:[],steps:[{id:'t0',nodes:['local']},{id:'t1',nodes:['local']},{id:'t2',nodes:['local']}],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  const ctx=(p=provider)=>({version:1,id:'consumer',specs:[p,provider2,consumer]});
  return {provider,provider2,consumer,ctx};
}
const R='resolved:sections[0].diagram';
const item=(kind,status,bp,ap,extra={})=>Object.assign({kind,status,origin:'imported',beforePath:bp,afterPath:ap},extra);

test('R9 provider-only change: identical authored pages, different provider contexts -> imported/provider entry at a resolved path',()=>{
  const t=topo(),p2=plain(t.provider);p2.page.sections[0].diagram.nodes.a.title='A changed';
  const a=side(t.consumer,{context:t.ctx()}),b=side(t.consumer,{context:t.ctx(p2)});
  assert.deepEqual(a.authored,b.authored,'precondition: authored identical');
  assert.equal(b.resolved.sections[0].diagram.nodes['child::a'].title,'A changed','precondition: resolved differs');
  const out=compare(a,b),e=only(out,x=>x.kind==='node','one node entry');
  assert.equal(out.length,1);assert.equal(e.origin,'imported');assert.equal(e.cause,'provider');assert.equal(e.status,'modified');
  assert.equal(e.beforePath,R+'.nodes["child::a"]');assert.equal(e.afterPath,R+'.nodes["child::a"]');
  assert.deepEqual(e.fields,[{beforePath:R+'.nodes["child::a"].title',afterPath:R+'.nodes["child::a"].title',before:'A',after:'A changed'}]);
});

test('R10 R11 same resolved result, different cause: provider edit vs consumer override (node and edge)',()=>{
  const t=topo(),p2=plain(t.provider);p2.page.sections[0].diagram.nodes.a.title='Same';p2.page.sections[0].diagram.edges[0].label='Lbl';
  const over=plain(t.consumer);Object.assign(over.page.sections[0].diagram.topologyImports[0],{nodeOverrides:{a:{title:'Same'}},edgeOverrides:{'a->b':{label:'Lbl'}}});
  const base0=side(t.consumer,{context:t.ctx()}),A=side(t.consumer,{context:t.ctx(p2)}),B=side(over,{context:t.ctx()});
  assert.deepEqual(A.resolved.sections[0].diagram.nodes,B.resolved.sections[0].diagram.nodes,'precondition: identical resolved nodes');
  assert.deepEqual(A.resolved.sections[0].diagram.edges,B.resolved.sections[0].diagram.edges,'precondition: identical resolved edges');
  const ea=compare(base0,A),eb=compare(base0,B);
  assert.equal(ea.length,2,'provider case: one node + one edge entry');
  assert.deepEqual(only(ea,x=>x.kind==='node','provider node').fields,[{beforePath:R+'.nodes["child::a"].title',afterPath:R+'.nodes["child::a"].title',before:'A',after:'Same'}]);
  const pe=only(ea,x=>x.kind==='edge','provider edge');assert.equal(pe.cause,'provider');assert.equal(pe.origin,'imported');
  assert.deepEqual(pe.fields,[{beforePath:R+'.edges[0].label',afterPath:R+'.edges[0].label',before:'ab',after:'Lbl'}]);
  assert.equal(ea.filter(x=>x.cause==='document').length,0,'provider case has no document-caused entry');
  assert.equal(eb.length,1,'override case: exactly one entry');
  const ov=eb[0];assert.equal(ov.kind,'import');assert.equal(ov.cause,'document');assert.equal(ov.origin,'imported');
  assert.deepEqual(sortJ(ov.fields),sortJ([
    {beforePath:null,afterPath:SEC+'.topologyImports[0].nodeOverrides.a.title',after:'Same'},
    {beforePath:null,afterPath:SEC+'.topologyImports[0].edgeOverrides["a->b"].label',after:'Lbl'}]));
  assert.deepEqual(sortJ(ov.resolved),sortJ([
    item('node','modified',R+'.nodes["child::a"].title',R+'.nodes["child::a"].title',{before:'A',after:'Same'}),
    item('edge','modified',R+'.edges[0].label',R+'.edges[0].label',{before:'ab',after:'Lbl'})]));
});

test('R12 import declaration edits attach exactly the resulting resolved differences to the one import entry',()=>{
  const t=topo();
  const cases={
    as:['kid',[item('node','removed',R+'.nodes["child::a"]',null),item('node','removed',R+'.nodes["child::b"]',null),item('edge','removed',R+'.edges[0]',null),
      item('node','added',null,R+'.nodes["kid::a"]'),item('node','added',null,R+'.nodes["kid::b"]'),item('edge','added',null,R+'.edges[0]')]],
    export:['onlyA',[item('node','removed',R+'.nodes["child::b"]',null),item('edge','removed',R+'.edges[0]',null)]],
    spec:['provider2',[item('node','modified',R+'.nodes["child::a"].title',R+'.nodes["child::a"].title',{before:'A',after:'A2'}),item('node','removed',R+'.nodes["child::b"]',null),item('edge','removed',R+'.edges[0]',null)]]};
  for(const [field,[value,want]] of Object.entries(cases)){
    const after=plain(t.consumer);after.page.sections[0].diagram.topologyImports[0][field]=value;
    const out=compare(side(t.consumer,{context:t.ctx()}),side(after,{context:t.ctx()}));
    assert.equal(out.length,1,field+': exactly one entry');
    const e=out[0];assert.equal(e.kind,'import');assert.equal(e.cause,'document');assert.equal(e.origin,'imported');
    assert.equal(e.beforePath,SEC+'.topologyImports[0]');assert.equal(e.afterPath,SEC+'.topologyImports[0]');
    assert.deepEqual(e.fields,[{beforePath:SEC+'.topologyImports[0].'+field,afterPath:SEC+'.topologyImports[0].'+field,before:t.consumer.page.sections[0].diagram.topologyImports[0][field],after:value}]);
    assert.deepEqual(sortJ(e.resolved),sortJ(want),field+': attached resolved list');
  }
});

test('R19 provider-only additions and removals of imported nodes and edges are their own provider entries',()=>{
  const t=topo(),p2=plain(t.provider),d=p2.page.sections[0].diagram;
  d.nodes.c={title:'C'};d.rows=[['a','c']];delete d.nodes.b;d.edges=[{from:'a',to:'c',label:'ac'}];d.topologyExports.public={nodes:['a','c'],edges:['a->c']};
  const out=compare(side(t.consumer,{context:t.ctx()}),side(t.consumer,{context:t.ctx(p2)}));
  assert.deepEqual(sortJ(out.map(e=>({kind:e.kind,status:e.status,origin:e.origin,cause:e.cause,beforePath:e.beforePath,afterPath:e.afterPath}))),sortJ([
    {kind:'node',status:'removed',origin:'imported',cause:'provider',beforePath:R+'.nodes["child::b"]',afterPath:null},
    {kind:'node',status:'added',origin:'imported',cause:'provider',beforePath:null,afterPath:R+'.nodes["child::c"]'},
    {kind:'edge',status:'removed',origin:'imported',cause:'provider',beforePath:R+'.edges[0]',afterPath:null},
    {kind:'edge',status:'added',origin:'imported',cause:'provider',beforePath:null,afterPath:R+'.edges[0]'}]));
});

test('R13 step tone patches on local and imported nodes: leaf paths and tone effects equal to the oracle',()=>{
  const t=topo();
  for(const [node,leaf] of [['local','.local'],['child::a','["child::a"]']]){
    const after=plain(t.consumer);after.page.sections[0].diagram.steps[1].tone={[node]:'warn'};
    const A=side(t.consumer,{context:t.ctx()}),B=side(after,{context:t.ctx()});
    const out=compare(A,B),e=only(out,x=>x.kind==='step',node+': one step entry');assert.equal(out.length,1);
    assert.deepEqual(e.fields,[{beforePath:null,afterPath:SEC+'.steps[1].tone'+leaf,after:'warn'}]);
    assert.deepEqual(e.effects,[{pathId:'happy',target:{kind:'node',id:node},category:'tone',beforeSteps:[1,2],afterSteps:[1,2]}]);
    assert.deepEqual(stepsOf(e.effects[0]),oracle(A.resolved.sections[0].diagram,B.resolved.sections[0].diagram,'tone',node,'happy'));
  }
});

test('R14 step panelVisibility patch: leaf path, visibility effect and no state effect',()=>{
  const before=base(),after=base();after.steps[3].panelVisibility={p:false};
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step','one step entry');
  assert.deepEqual(e.fields,[{beforePath:null,afterPath:SEC+'.steps[3].panelVisibility.p',after:false}]);
  assert.deepEqual(e.effects,[{pathId:'happy',target:{kind:'panel',id:'p'},category:'visibility',beforeSteps:[3,4,5,6,7],afterSteps:[3,4,5,6,7]}]);
});

test('R15 story time: storyTime.start and steps[i].time edits at exact leaf paths with effects equal to the fold oracle',()=>{
  const mk=()=>base({panels:[{id:'bat',type:'battery',title:'Battery',drainPerHour:1,initial:{charge:64,trend:'idle'}}],storyTime:{start:'2026-09-24T22:30'},steps:steps(5,{1:{time:'+1h'},3:{time:'2026-09-25T06:50'}})});
  const story=C.PanelRegistry.get('battery');assert.equal(typeof (story && story.storyTime),'function','precondition: battery derives state from story time');
  const cases=[[d=>{d.storyTime.start='2026-09-24T20:30';},'section',SEC+'.storyTime.start','2026-09-24T22:30','2026-09-24T20:30'],
    [d=>{d.steps[1].time='+2h';},'step',SEC+'.steps[1].time','+1h','+2h']];
  for(const [edit,kind,path,was,now] of cases){
    const before=mk(),after=mk();edit(after);
    const o=oracle(before,after,'state','bat','happy');assert.ok(o.afterSteps.length>0,'precondition: the edit changes folded battery state');
    const out=compare(side(doc(before)),side(doc(after)));assert.equal(out.length,1,kind);
    const e=out[0];assert.equal(e.kind,kind);
    assert.deepEqual(e.fields,[{beforePath:path,afterPath:path,before:was,after:now}]);
    assert.deepEqual(stepsOf(effectOf(e,'bat','state')),o);
  }
});

test('R16 moved and edited step has side-specific paths',()=>{
  const before=base(),after=base();const moved=Object.assign({},before.steps[4],{id:'m',text:'Old'});before.steps[4]=moved;
  after.steps.splice(4,1);after.steps.splice(5,0,Object.assign({},moved,{text:'New'}));
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step' && x.status==='modified','one modified step');
  assert.equal(e.beforePath,SEC+'.steps[4]');assert.equal(e.afterPath,SEC+'.steps[5]');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.steps[4].text',afterPath:SEC+'.steps[5].text',before:'Old',after:'New'}]);
});

test('R17 path membership and order: entry at paths[i].steps; state, tone and visibility effects match the aligned oracle',()=>{
  const mk=()=>base({steps:steps(6,{1:{panels:{p:{value:20}},tone:{a:'warn'},panelVisibility:{q:false}},3:{panels:{p:{value:30}},tone:{a:'ok'},panelVisibility:{q:true}}}),paths:[{id:'main',steps:['s0','s1','s2','s3','s4','s5']}]});
  const before=mk(),after=mk();after.paths[0].steps=['s0','s3','s2','s1','s5'];
  const out=compare(side(doc(before)),side(doc(after))),e=only(out,x=>x.kind==='path','one path entry');assert.equal(out.length,1);
  assert.deepEqual(e.fields,[{beforePath:SEC+'.paths[0].steps',afterPath:SEC+'.paths[0].steps',before:['s0','s1','s2','s3','s4','s5'],after:['s0','s3','s2','s1','s5']}]);
  const want=[];
  for(const [cat,kind,ids] of [['state','panel',['p','q']],['visibility','panel',['p','q']],['tone','node',['a','b']]])for(const id of ids){
    const o=oracle(before,after,cat,id,'main');if(o.beforeSteps.length || o.afterSteps.length)want.push(Object.assign({pathId:'main',target:{kind,id},category:cat},o));
  }
  assert.ok(want.some(w=>w.category==='state') && want.some(w=>w.category==='tone') && want.some(w=>w.category==='visibility'),'precondition: all three categories differ');
  assert.deepEqual(sortJ(e.effects),sortJ(want));
});

test('R18 added and removed records of every kind carry status, a null path on the absent side, and oracle effects',()=>{
  const before=base({paths:[{id:'main',steps:['s0','s1','s2','gone']},{id:'old',steps:['s0','s1']}],layouts:[{id:'L0',name:'Old layout'}]});
  before.steps.push({id:'gone',nodes:['a'],text:'gone',panels:{p:{value:99}}});
  const page0={title:'T',sections:[{id:'s',heading:'S',views:[{id:'v0',name:'V0'}],diagram:before},{id:'drop',heading:'Drop'}]};
  const after=plain(before);after.panels.push({id:'r',type:'gauge',title:'New',initial:{value:1}});after.panels.splice(1,1);
  after.steps.pop();after.steps.push({id:'new',nodes:['a'],text:'new',panels:{p:{value:77}}});after.paths=[{id:'main',steps:['s0','s1','s2','new']},{id:'fresh',steps:['s0','s2']}];
  after.nodes.c={title:'C'};delete after.nodes.b;after.rows=[['a','c']];after.edges=[{from:'a',to:'c',label:'ac'}];after.layouts=[{id:'L1',name:'New layout'}];
  const page1={title:'T',sections:[{id:'s',heading:'S',views:[{id:'v1',name:'V1'}],diagram:after},{id:'add',heading:'Add'}]};
  const out=compare(side({page:page0}),side({page:page1}));
  const want=[['panel','added',null,SEC+'.panels[1]'],['panel','removed',SEC+'.panels[1]',null],['step','added',null,SEC+'.steps[8]'],['step','removed',SEC+'.steps[8]',null],
    ['path','added',null,SEC+'.paths[1]'],['path','removed',SEC+'.paths[1]',null],['node','added',null,SEC+'.nodes.c'],['node','removed',SEC+'.nodes.b',null],
    ['edge','added',null,SEC+'.edges[0]'],['edge','removed',SEC+'.edges[0]',null],['layout','added',null,SEC+'.layouts[0]'],['layout','removed',SEC+'.layouts[0]',null],
    ['view','added',null,'sections[0].views[0]'],['view','removed','sections[0].views[0]',null],['section','added',null,'sections[1]'],['section','removed','sections[1]',null]];
  for(const [kind,status,bp,ap] of want){const e=only(out,x=>x.kind===kind && x.status===status && x.beforePath===bp && x.afterPath===ap,kind+' '+status);assert.deepEqual(e.fields,[],kind+' '+status+' has no fields');}
  assert.equal(only(out,x=>x.kind==='node' && x.status==='added','added node').origin,'local');
  const addPanel=only(out,x=>x.kind==='panel' && x.status==='added','added panel'),remPanel=only(out,x=>x.kind==='panel' && x.status==='removed','removed panel');
  for(const pathId of ['main']){
    assert.deepEqual(stepsOf(addPanel.effects.find(x=>x.pathId===pathId && x.category==='state')),oracle(before,after,'state','r',pathId),'added panel effect '+pathId);
    assert.deepEqual(stepsOf(remPanel.effects.find(x=>x.pathId===pathId && x.category==='state')),oracle(before,after,'state','q',pathId),'removed panel effect '+pathId);
  }
  const addStep=only(out,x=>x.kind==='step' && x.status==='added','added step'),remStep=only(out,x=>x.kind==='step' && x.status==='removed','removed step');
  const o=oracle(before,after,'state','p','main');assert.ok(o.beforeSteps.length,'precondition: the step swap changes p on main');
  assert.deepEqual(stepsOf(addStep.effects.find(x=>x.target.id==='p' && x.pathId==='main')),o);
  assert.deepEqual(stepsOf(remStep.effects.find(x=>x.target.id==='p' && x.pathId==='main')),o);
  assert.ok(!out.some(x=>x.kind==='path' && x.status==='modified' && x.afterPath===SEC+'.paths[0]' && x.effects.length===0),'a modified main path still reports its effects');
});

test('R20 nested tab sections and Views use their real nested paths',()=>{
  const d0=base(),d1=base();d1.steps[3].text='Changed caption';
  const mk=(d,tabView,secView)=>({page:{title:'T',blocks:[{id:'top',heading:'Top'},{tabs:[{label:'One',views:[{id:'tv',name:tabView}],sections:[{id:'x',heading:'X'},{id:'y',heading:'Y'},{id:'z',heading:'Z',views:[{id:'a0',name:'A0'},{id:'sv',name:secView}],diagram:d}]}]}]}});
  const out=compare(side(mk(d0,'Tab view','Sec view')),side(mk(d1,'Tab view 2','Sec view 2')));
  assert.equal(out.length,3);
  const s=only(out,x=>x.kind==='step','caption entry');
  assert.deepEqual(s.fields,[{beforePath:'blocks[1].tabs[0].sections[2].diagram.steps[3].text',afterPath:'blocks[1].tabs[0].sections[2].diagram.steps[3].text',before:'Step 3',after:'Changed caption'}]);
  assert.deepEqual(sortJ(out.filter(x=>x.kind==='view').flatMap(x=>x.fields)),sortJ([
    {beforePath:'blocks[1].tabs[0].sections[2].views[1].name',afterPath:'blocks[1].tabs[0].sections[2].views[1].name',before:'Sec view',after:'Sec view 2'},
    {beforePath:'blocks[1].tabs[0].views[0].name',afterPath:'blocks[1].tabs[0].views[0].name',before:'Tab view',after:'Tab view 2'}]));
});

test('R21 document metadata, section heading, layout and ledger use exact paths and line hunks',()=>{
  const d0=base({layouts:[{id:'L',name:'Layout'}]}),d1=plain(d0);d1.layouts[0].name='Layout 2';
  const p0={page:{title:'Old',sections:[{id:'s',heading:'S',diagram:d0}]}},p1={page:{title:'New',sections:[{id:'s',heading:'S2',diagram:d1}]}};
  const out=compare(side(p0,{ledger:'a\nb\nc'}),side(p1,{ledger:'a\nB\nC\nc'}));assert.equal(out.length,4);
  assert.deepEqual(only(out,x=>x.kind==='document','document entry').fields,[{beforePath:'title',afterPath:'title',before:'Old',after:'New'}]);
  assert.deepEqual(only(out,x=>x.kind==='section','section entry').fields,[{beforePath:'sections[0].heading',afterPath:'sections[0].heading',before:'S',after:'S2'}]);
  assert.deepEqual(only(out,x=>x.kind==='layout','layout entry').fields,[{beforePath:SEC+'.layouts[0].name',afterPath:SEC+'.layouts[0].name',before:'Layout',after:'Layout 2'}]);
  assert.deepEqual(only(out,x=>x.kind==='ledger','ledger entry').fields,[{beforePath:'ledger:2-2',afterPath:'ledger:2-3',before:'b',after:'B\nC'}]);
  const added=compare(side(p0,{ledger:null}),side(p0,{ledger:'x'}));assert.equal(added.length,1);
  assert.equal(added[0].status,'added');assert.deepEqual(added[0].fields,[{beforePath:'ledger:',afterPath:'ledger:1-1',before:null,after:'x'}]);
});

test('R22 legacy steps[i].patch alias reports the .patch path and the same effect as .panels',()=>{
  const before=base(),after=base();before.steps[5].patch={p:{value:6}};after.steps[5].patch={p:{value:42}};
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step','one step entry');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.steps[5].patch.p.value',afterPath:SEC+'.steps[5].patch.p.value',before:6,after:42}]);
  assert.deepEqual(e.effects,[{pathId:'happy',target:{kind:'panel',id:'p'},category:'state',beforeSteps:[5,6],afterSteps:[5,6]}]);
});

test('R23 absent document: exactly one document entry plus one entry per section, mirrored',()=>{
  const p={page:{title:'T',sections:[{id:'a',heading:'A',diagram:base()},{id:'b',heading:'B'}]}};
  const strip=e=>[e.kind,e.status,e.beforePath,e.afterPath,e.fields.length];
  assert.deepEqual(compare(null,side(p)).map(strip),[['document','added',null,'',0],['section','added',null,'sections[0]',0],['section','added',null,'sections[1]',0]]);
  assert.deepEqual(compare(side(p),null).map(strip),[['document','removed','',null,0],['section','removed','sections[0]',null,0],['section','removed','sections[1]',null,0]]);
});

test('R24 identity is empty; compare() already asserts the full mirror for every case above',()=>{
  const t=topo(),fixtures=[side(doc(base())),side(t.consumer,{context:t.ctx()}),side({page:{title:'T',blocks:[{tabs:[{label:'x',views:[{id:'v',name:'v'}],sections:[{heading:'h',diagram:base()}]}]}]}},{ledger:'l'})];
  fixtures.forEach((f,i)=>assert.deepEqual(compare(f,plain(f)),[],'fixture '+i+' identity'));
});
