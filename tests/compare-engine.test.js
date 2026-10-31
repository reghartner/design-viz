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
              scopeBefore?, scopeAfter?, resolved?:[{status, origin, beforePath, afterPath, ...}]}
   Paths start at the normalized page root (no `page.` prefix). Keys that are
   not plain identifiers use ["key"]. Resolved-only differences are prefixed
   `resolved:`. Ledger hunks use `ledger:<from>-<to>` (1-based lines).
   Step coordinates are source-step indices on the path; 'ambient' sorts last.
   A field path is null on the side where that field (or its record) is absent.
   Records with different explicit ids never pair (they are added + removed).

   CONTRACT MATRIX (each row asserted below; fixture -> scoped assertion -> rejects)
   R1  step panel patch       step 5 edits p.value       one step entry, exact field path, effects [5,6]   coarse kind:'steps' record; whole-diagram range
   R2  carried range ends     step 7 re-sets p.value     effects stop at 6; no 'ambient'                  carry-to-end; ambient always added
   R3  first-step patch       step 0 edits p.value       'ambient' in both lists                           ambient never reported
   R4  panel initial          panels[0].initial.value    kind panel, steps before first patch + ambient     declaration edits with no reader effect
   R5  render-only field      gauge max                  effect 'declaration', no effects, scope = visible steps + ambient   claims a proven reader difference; ignores hidden steps
   R6  panels[i].visible      visible true->false        visibility effects only, never 'ambient'          ambient included for visibility
   R7  zero-step diagram      initial / visible          ['ambient'] for initial; no effect for visible    crash or empty effects for initial
   R8  local node field       nodes.a.sub                origin local, cause document, one field           extra fields; missing origin
   R9  provider-only change   contexts differ            origin imported, cause provider, resolved: path   imported nodes skipped (today)
   R10 override vs provider   identical resolved pages   cause document at nodeOverrides path vs provider  same entry for both causes
   R11 edge override          edgeOverrides["a->b"]      cause document, quoted key path                   dot-joined "a->b" path
   R12 import declaration     as / export / spec         one import entry, resolved diffs attached         separate provider entries per node
   R13 step tone              local and imported node    tone effects with node target                     tones ignored; imported ids dropped
   R14 step panelVisibility   hide p at step 3           visibility effect [3..]                           state-only effects
   R15 story time             diagram.storyTime, steps[i].time   effects equal fold oracle              story time ignored
   R16 moved + edited step    id m 4 -> 5, text edit     beforePath steps[4].text, afterPath steps[5].text  single shared path
   R17 path membership/order  remove + swap ids          path entry; state/tone/visibility = aligned oracle  panel-only effects
   R18 add/remove records     panel step path section node edge layout view   status + null absent path   positional "modified" pairs
   R19 imported add/remove    via import edit vs provider-only   attached vs own provider entry          duplicate reporting
   R20 nested tabs            caption, tab view, section view    nested exact paths                         flat sections[i] paths
   R21 document / heading / layout / ledger   exact paths and hunks                                     coarse labels only
   R22 legacy steps[i].patch  alias edit                 path uses .patch, same effect as .panels          hard-coded .panels
   R23 absent document        compare(null, side)        document added + one added per section; mirror    crash on null side
   R24 identity / symmetry / immutability over every fixture                                            invented entries; mutated inputs
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const C={URL,console};vm.createContext(C);
vm.runInContext(readSource('validator.js'),C);vm.runInContext(readSource('canon.js'),C);

function side(raw,{context=null,ledger=null}={}){
  raw=plain(raw);
  const authored=C.normalize(plain(raw));
  const resolved=C.normalize(context?C.FlowTopology.resolveSource(plain(raw),context):plain(raw));
  return {authored,resolved,ledger};
}
function compare(a,b){
  assert.equal(typeof C.compareDocuments,'function','compareDocuments(before, after) is defined by the shared engine');
  const sa=plain(a),sb=plain(b),out=C.compareDocuments(a,b);
  assert.deepEqual(plain(a),sa,'before side not mutated');assert.deepEqual(plain(b),sb,'after side not mutated');
  return plain(out);
}
const doc=diagram=>({page:{title:'T',sections:[{id:'s',heading:'S',diagram}]}});
const SEC='sections[0].diagram';
const steps=(n,extra={})=>Array.from({length:n},(_,i)=>Object.assign({id:'s'+i,nodes:['a'],text:'Step '+i},extra[i]||{}));
const base=(over={})=>Object.assign({nodes:{a:{title:'A',sub:'one'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'go'}],
  panels:[{id:'p',type:'gauge',title:'Power',unit:'mA',max:400,initial:{value:6}},{id:'q',type:'gauge',title:'Other',initial:{value:1}}],steps:steps(8,{7:{panels:{p:{value:80}}}})},over);
const effectOf=(entry,target,category)=>(entry.effects||[]).find(e=>e.target.id===target && e.category===category);
const only=(entries,pred,msg)=>{const m=entries.filter(pred);assert.equal(m.length,1,msg+' — got '+JSON.stringify(entries.map(e=>[e.kind,e.status,e.beforePath,e.afterPath])));return m[0];};

/* Independent oracle: compare folds at paired steps (by id) on each path. */
function oracle(beforeD,afterD,category,id,pathId){
  const fold={state:d=>C.foldPanelStates(d)[id],tone:d=>C.foldNodeTones(d).map(s=>s[id]),visibility:d=>C.foldPanelVisibility(d)[id]}[category];
  const pa=C.diagramForPath(beforeD,pathId),pb=C.diagramForPath(afterD,pathId),fa=fold(pa)||[],fb=fold(pb)||[];
  const ia=pa._sourceIndices,ib=pb._sourceIndices,ida=ia.map(i=>beforeD.steps[i].id),idb=ib.map(i=>afterD.steps[i].id);
  const bs=[],as=[];
  ida.forEach((sid,k)=>{const j=idb.indexOf(sid);if(j<0 || JSON.stringify(fa[k])!==JSON.stringify(fb[j])){bs.push(ia[k]);if(j>=0)as.push(ib[j]);}});
  idb.forEach((sid,j)=>{if(ida.indexOf(sid)<0)as.push(ib[j]);});
  return {beforeSteps:bs.sort((x,y)=>x-y),afterSteps:as.sort((x,y)=>x-y)};
}

test('R1 R2 step panel patch: one step entry at its exact field path; carried range ends at the next re-set; no ambient',()=>{
  const before=base(),after=base();before.steps[5].panels={p:{value:6}};after.steps[5].panels={p:{value:42}};
  assert.equal(C.foldPanelStates(after).p[5].value,42,'precondition: proposal folds 42 at step 5');
  assert.equal(C.foldPanelStates(after).p[7].value,80,'precondition: step 7 re-sets the value');
  const out=compare(side(doc(before)),side(doc(after)));
  const e=only(out,x=>x.kind==='step','exactly one step entry');
  assert.equal(e.status,'modified');assert.equal(e.cause,'document');assert.equal(e.effect,'state');
  assert.equal(e.beforePath,SEC+'.steps[5]');assert.equal(e.afterPath,SEC+'.steps[5]');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.steps[5].panels.p.value',afterPath:SEC+'.steps[5].panels.p.value',before:6,after:42}]);
  const eff=effectOf(e,'p','state');assert.deepEqual(eff,{pathId:'happy',target:{kind:'panel',id:'p'},category:'state',beforeSteps:[5,6],afterSteps:[5,6]});
  assert.deepEqual({beforeSteps:eff.beforeSteps,afterSteps:eff.afterSteps},oracle(before,after,'state','p','happy'));
  assert.equal(out.length,1,'no other entries');
});

test('R3 first-step patch reaches ambient for a panel without the ambientInitial trait',()=>{
  const before=base(),after=base();before.steps[0].panels={p:{value:6}};after.steps[0].panels={p:{value:9}};
  assert.ok(!(C.PanelViews.get('gauge').options||{}).ambientInitial,'precondition: gauge ambient shows the first folded state');
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step','one step entry');
  const eff=effectOf(e,'p','state');assert.deepEqual(eff.beforeSteps,[0,1,2,3,4,5,6,'ambient']);assert.deepEqual(eff.afterSteps,[0,1,2,3,4,5,6,'ambient']);
});

test('R4 panel initial value: panel entry whose effect covers steps before the first patch and ambient',()=>{
  const before=base(),after=base();after.panels[0].initial.value=9;
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='panel','one panel entry');
  assert.equal(e.afterPath,SEC+'.panels[0]');assert.equal(e.effect,'state');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.panels[0].initial.value',afterPath:SEC+'.panels[0].initial.value',before:6,after:9}]);
  const eff=effectOf(e,'p','state');assert.deepEqual(eff.afterSteps,[0,1,2,3,4,5,6,'ambient']);
  assert.deepEqual(eff.afterSteps.filter(x=>x!=='ambient'),oracle(before,after,'state','p','happy').afterSteps);
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
  assert.deepEqual(e.fields,[{beforePath:null,afterPath:SEC+'.panels[0].visible',before:undefined,after:false}].map(plain));
  const v=effectOf(e,'p','visibility');assert.deepEqual(v.afterSteps,[0,1,2,3]);assert.ok(!v.afterSteps.includes('ambient'));
  assert.equal(effectOf(e,'p','state'),undefined);
  const z0=base({steps:[]}),z1=base({steps:[]});z1.panels[0].initial.value=7;
  const zs=only(compare(side(doc(z0)),side(doc(z1))),x=>x.kind==='panel','zero-step initial edit');
  assert.deepEqual(effectOf(zs,'p','state'),{pathId:'happy',target:{kind:'panel',id:'p'},category:'state',beforeSteps:['ambient'],afterSteps:['ambient']});
  const z2=base({steps:[]});z2.panels[0].visible=false;
  const zv=only(compare(side(doc(z0)),side(doc(z2))),x=>x.kind==='panel','zero-step visible edit');
  assert.deepEqual(zv.effects,[],'ambient shows every panel, so hiding changes nothing the reader sees');
});

test('R8 local node field: one node entry, origin local, cause document, exactly the edited field',()=>{
  const before=base(),after=base();after.nodes.a.sub='two';
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='node','one node entry');
  assert.equal(e.origin,'local');assert.equal(e.cause,'document');assert.equal(e.afterPath,SEC+'.nodes.a');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.nodes.a.sub',afterPath:SEC+'.nodes.a.sub',before:'one',after:'two'}]);
});

/* Topology fixture: provider exports a,b; consumer imports as child. */
function topo(){
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const provider=spec('provider',{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'ab'}],topologyExports:{public:{nodes:['a','b'],edges:['a->b']},onlyA:{nodes:['a'],edges:[]}}});
  const provider2=spec('provider2',{nodes:{a:{title:'A2'}},rows:[['a']],topologyExports:{public:{nodes:['a'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],panels:[],steps:[{id:'t0',nodes:['local']},{id:'t1',nodes:['local']},{id:'t2',nodes:['local']}],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  const ctx=(p=provider)=>({version:1,id:'consumer',specs:[p,provider2,consumer]});
  return {provider,provider2,consumer,ctx};
}
const TSEC='sections[0].diagram';

test('R9 provider-only change: identical authored pages, different provider contexts -> imported/provider entry at a resolved path',()=>{
  const t=topo(),p2=plain(t.provider);p2.page.sections[0].diagram.nodes.a.title='A changed';
  const a=side(t.consumer,{context:t.ctx()}),b=side(t.consumer,{context:t.ctx(p2)});
  assert.deepEqual(a.authored,b.authored,'precondition: authored identical');
  assert.equal(b.resolved.sections[0].diagram.nodes['child::a'].title,'A changed','precondition: resolved differs');
  const e=only(compare(a,b),x=>x.kind==='node','one node entry');
  assert.equal(e.origin,'imported');assert.equal(e.cause,'provider');
  assert.deepEqual(e.fields,[{beforePath:'resolved:'+TSEC+'.nodes["child::a"].title',afterPath:'resolved:'+TSEC+'.nodes["child::a"].title',before:'A',after:'A changed'}]);
});

test('R10 R11 same resolved result, different cause: provider edit vs consumer override (node and edge)',()=>{
  const t=topo(),p2=plain(t.provider);p2.page.sections[0].diagram.nodes.a.title='Same';p2.page.sections[0].diagram.edges[0].label='Lbl';
  const over=plain(t.consumer);over.page.sections[0].diagram.topologyImports[0].nodeOverrides={a:{title:'Same'}};over.page.sections[0].diagram.topologyImports[0].edgeOverrides={'a->b':{label:'Lbl'}};
  const base0=side(t.consumer,{context:t.ctx()}),A=side(t.consumer,{context:t.ctx(p2)}),B=side(over,{context:t.ctx()});
  assert.deepEqual(A.resolved.sections[0].diagram.nodes,B.resolved.sections[0].diagram.nodes,'precondition: identical resolved nodes');
  const ea=compare(base0,A),eb=compare(base0,B);
  only(ea,x=>x.kind==='node' && x.cause==='provider' && x.origin==='imported','provider node entry');
  only(ea,x=>x.kind==='edge' && x.cause==='provider' && x.origin==='imported','provider edge entry');
  assert.equal(ea.filter(x=>x.cause==='document').length,0,'provider case has no document-caused entry');
  const ov=only(eb,x=>x.cause==='document','one consumer override entry');
  assert.equal(ov.origin,'imported');
  const paths=ov.fields.map(f=>f.afterPath).sort();
  assert.deepEqual(paths,[TSEC+'.topologyImports[0].edgeOverrides',TSEC+'.topologyImports[0].nodeOverrides'].sort());
  assert.equal(eb.filter(x=>x.cause==='provider').length,0,'override case has no provider-caused entry');
  assert.ok(ov.resolved.some(r=>r.afterPath==='resolved:'+TSEC+'.nodes["child::a"].title'),'resolved node difference attached to the override entry');
});

test('R12 R19 import declaration edits attach every resolved difference to the one import entry',()=>{
  const t=topo();
  const edits=[['as','kid'],['export','onlyA'],['spec','provider2']];
  for(const [field,value] of edits){
    const after=plain(t.consumer);after.page.sections[0].diagram.topologyImports[0][field]=value;
    const out=compare(side(t.consumer,{context:t.ctx()}),side(after,{context:t.ctx()}));
    const e=only(out,x=>x.kind==='import',field+': one import entry');
    assert.equal(e.cause,'document');assert.equal(e.afterPath,TSEC+'.topologyImports[0]');
    assert.deepEqual(e.fields.map(f=>f.afterPath),[TSEC+'.topologyImports[0].'+field]);
    assert.equal(out.filter(x=>x.cause==='provider').length,0,field+': no separate provider entries');
    assert.ok(e.resolved.length>0,field+': resolved differences attached');
    e.resolved.forEach(r=>assert.equal(r.origin,'imported'));
    if(field==='as'){
      assert.ok(e.resolved.some(r=>r.status==='removed' && r.beforePath==='resolved:'+TSEC+'.nodes["child::a"]' && r.afterPath===null));
      assert.ok(e.resolved.some(r=>r.status==='added' && r.afterPath==='resolved:'+TSEC+'.nodes["kid::a"]' && r.beforePath===null));
    }
  }
  const p2=plain(t.provider);delete p2.page.sections[0].diagram.nodes.b;p2.page.sections[0].diagram.rows=[['a']];p2.page.sections[0].diagram.edges=[];
  p2.page.sections[0].diagram.topologyExports.public={nodes:['a'],edges:[]};
  const out=compare(side(t.consumer,{context:t.ctx()}),side(t.consumer,{context:t.ctx(p2)}));
  const r=only(out,x=>x.kind==='node' && x.status==='removed','provider-only removal is its own entry');
  assert.equal(r.cause,'provider');assert.equal(r.beforePath,'resolved:'+TSEC+'.nodes["child::b"]');assert.equal(r.afterPath,null);
});

test('R13 step tone patches on local and imported nodes report tone effects',()=>{
  const t=topo();
  for(const node of ['local','child::a']){
    const after=plain(t.consumer);after.page.sections[0].diagram.steps[1].tone={[node]:'warn'};
    const A=side(t.consumer,{context:t.ctx()}),B=side(after,{context:t.ctx()});
    const e=only(compare(A,B),x=>x.kind==='step',node+': one step entry');
    assert.deepEqual(e.fields.map(f=>f.afterPath),[TSEC+'.steps[1].tone'+(node==='local'?'.local':'["child::a"]')]);
    const eff=effectOf(e,node,'tone');assert.deepEqual(eff.target,{kind:'node',id:node});
    assert.deepEqual({beforeSteps:eff.beforeSteps,afterSteps:eff.afterSteps},oracle(A.resolved.sections[0].diagram,B.resolved.sections[0].diagram,'tone',node,'happy'));
    assert.deepEqual(eff.afterSteps,[1,2]);
  }
});

test('R14 step panelVisibility patch reports a visibility effect and no state effect',()=>{
  const before=base(),after=base();after.steps[3].panelVisibility={p:false};
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step','one step entry');
  assert.deepEqual(e.fields,[{beforePath:null,afterPath:SEC+'.steps[3].panelVisibility',before:undefined,after:{p:false}}].map(plain));
  assert.deepEqual(effectOf(e,'p','visibility').afterSteps,[3,4,5,6,7]);assert.equal(effectOf(e,'p','state'),undefined);
});

test('R15 story time: diagram.storyTime and steps[i].time edits carry effects equal to the fold oracle',()=>{
  const mk=()=>base({panels:[{id:'bat',type:'battery',title:'Battery',drainPerHour:1,initial:{charge:64,trend:'idle'}}],storyTime:{start:'2026-09-24T22:30'},steps:steps(5,{1:{time:'+1h'},3:{time:'2026-09-25T06:50'}})});
  const story=C.PanelRegistry.get('battery');assert.equal(typeof (story && story.storyTime),'function','precondition: battery derives state from story time');
  for(const edit of [d=>{d.storyTime={start:'2026-09-24T20:30'};},d=>{d.steps[1].time='+2h';}]){
    const before=mk(),after=mk();edit(after);
    const o=oracle(before,after,'state','bat','happy');
    assert.ok(o.afterSteps.length>0,'precondition: the edit changes folded battery state');
    const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='section'||x.kind==='step','one entry');
    const eff=effectOf(e,'bat','state');assert.deepEqual(eff.beforeSteps.filter(x=>x!=='ambient'),o.beforeSteps);assert.deepEqual(eff.afterSteps.filter(x=>x!=='ambient'),o.afterSteps);
  }
});

test('R16 moved and edited step has side-specific paths',()=>{
  const before=base(),after=base();const moved=Object.assign({},before.steps[4],{id:'m',text:'Old'});before.steps[4]=moved;
  after.steps.splice(4,1);after.steps.splice(5,0,Object.assign({},moved,{text:'New'}));
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step' && x.status==='modified','one modified step');
  assert.deepEqual(e.fields.find(f=>f.afterPath.endsWith('.text')),{beforePath:SEC+'.steps[4].text',afterPath:SEC+'.steps[5].text',before:'Old',after:'New'});
});

test('R17 path membership and order: entry at paths[i].steps; state, tone and visibility effects match the aligned oracle',()=>{
  const mk=()=>base({steps:steps(6,{1:{panels:{p:{value:20}},tone:{a:'warn'},panelVisibility:{q:false}},3:{panels:{p:{value:30}},tone:{a:'ok'},panelVisibility:{q:true}}}),paths:[{id:'main',steps:['s0','s1','s2','s3','s4','s5']}]});
  const before=mk(),after=mk();after.paths[0].steps=['s0','s3','s2','s1','s5'];
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='path','one path entry');
  assert.deepEqual(e.fields.map(f=>f.afterPath),[SEC+'.paths[0].steps']);
  for(const [cat,id] of [['state','p'],['tone','a'],['visibility','q']]){
    const eff=effectOf(e,id,cat),o=oracle(before,after,cat,id,'main');
    assert.ok(o.beforeSteps.length,'precondition: '+cat+' differs');
    assert.equal(eff.pathId,'main');assert.deepEqual({beforeSteps:eff.beforeSteps,afterSteps:eff.afterSteps},o,cat);
  }
});

test('R18 added and removed records of every kind carry status and a null path on the absent side',()=>{
  const before=base({paths:[{id:'old',steps:['s0','s1']}],layouts:[{id:'L0',name:'Old layout'}]});
  before.steps.push({id:'gone',nodes:['a'],text:'gone'});
  const page0={title:'T',sections:[{id:'s',heading:'S',views:[{id:'v0',name:'V0'}],diagram:before},{id:'drop',heading:'Drop'}]};
  const after=plain(before);after.panels.push({id:'r',type:'gauge',title:'New',initial:{value:1}});after.panels.splice(1,1);
  after.steps.pop();after.steps.push({id:'new',nodes:['a'],text:'new'});after.paths=[{id:'fresh',steps:['s0','s2']}];
  after.nodes.c={title:'C'};delete after.nodes.b;after.rows=[['a','c']];after.edges=[{from:'a',to:'c',label:'ac'}];after.layouts=[{id:'L1',name:'New layout'}];
  const page1={title:'T',sections:[{id:'s',heading:'S',views:[{id:'v1',name:'V1'}],diagram:after},{id:'add',heading:'Add'}]};
  const out=compare(side({page:page0}),side({page:page1}));
  const want=[['panel','added',null,SEC+'.panels[1]'],['panel','removed',SEC+'.panels[1]',null],['step','added',null,SEC+'.steps[8]'],['step','removed',SEC+'.steps[8]',null],
    ['path','added',null,SEC+'.paths[0]'],['path','removed',SEC+'.paths[0]',null],['node','added',null,SEC+'.nodes.c'],['node','removed',SEC+'.nodes.b',null],
    ['edge','added',null,SEC+'.edges[0]'],['edge','removed',SEC+'.edges[0]',null],['layout','added',null,SEC+'.layouts[0]'],['layout','removed',SEC+'.layouts[0]',null],
    ['view','added',null,'sections[0].views[0]'],['view','removed','sections[0].views[0]',null],['section','added',null,'sections[1]'],['section','removed','sections[1]',null]];
  for(const [kind,status,bp,ap] of want)only(out,x=>x.kind===kind && x.status===status && x.beforePath===bp && x.afterPath===ap,kind+' '+status);
  only(out,x=>x.kind==='node' && x.status==='added',"added node").origin==='local' || assert.fail('added node origin local');
  const addedPanel=only(out,x=>x.kind==='panel' && x.status==='added','added panel');
  assert.ok(effectOf(addedPanel,'r','state'),'added panel reports where it appears');
});

test('R20 nested tab sections and Views use their real nested paths',()=>{
  const d0=base(),d1=base();d1.steps[3].text='Changed caption';
  const mk=(d,tabView,secView)=>({page:{title:'T',blocks:[{id:'top',heading:'Top'},{tabs:[{label:'One',views:[{id:'tv',name:tabView}],sections:[{id:'x',heading:'X'},{id:'y',heading:'Y'},{id:'z',heading:'Z',views:[{id:'a0',name:'A0'},{id:'sv',name:secView}],diagram:d}]}]}]}});
  const out=compare(side(mk(d0,'Tab view','Sec view')),side(mk(d1,'Tab view 2','Sec view 2')));
  const s=only(out,x=>x.kind==='step','caption entry');
  assert.deepEqual(s.fields,[{beforePath:'blocks[1].tabs[0].sections[2].diagram.steps[3].text',afterPath:'blocks[1].tabs[0].sections[2].diagram.steps[3].text',before:'Step 3',after:'Changed caption'}]);
  const views=out.filter(x=>x.kind==='view').flatMap(x=>x.fields.map(f=>f.afterPath)).sort();
  assert.deepEqual(views,['blocks[1].tabs[0].sections[2].views[1].name','blocks[1].tabs[0].views[0].name']);
});

test('R21 document metadata, section heading, layout and ledger use exact paths and line hunks',()=>{
  const d0=base({layouts:[{id:'L',name:'Layout'}]}),d1=plain(d0);d1.layouts[0].name='Layout 2';
  const p0={page:{title:'Old',sections:[{id:'s',heading:'S',diagram:d0}]}},p1={page:{title:'New',sections:[{id:'s',heading:'S2',diagram:d1}]}};
  const out=compare(side(p0,{ledger:'a\nb\nc'}),side(p1,{ledger:'a\nB\nC\nc'}));
  assert.deepEqual(only(out,x=>x.kind==='document','document entry').fields,[{beforePath:'title',afterPath:'title',before:'Old',after:'New'}]);
  assert.deepEqual(only(out,x=>x.kind==='section','section entry').fields,[{beforePath:'sections[0].heading',afterPath:'sections[0].heading',before:'S',after:'S2'}]);
  assert.deepEqual(only(out,x=>x.kind==='layout','layout entry').fields,[{beforePath:SEC+'.layouts[0].name',afterPath:SEC+'.layouts[0].name',before:'Layout',after:'Layout 2'}]);
  assert.deepEqual(only(out,x=>x.kind==='ledger','ledger entry').fields,[{beforePath:'ledger:2-2',afterPath:'ledger:2-3',before:'b',after:'B\nC'}]);
  const added=only(compare(side(p0,{ledger:null}),side(p0,{ledger:'x'})),x=>x.kind==='ledger','ledger added');
  assert.deepEqual(added.fields,[{beforePath:'ledger:',afterPath:'ledger:1-1',before:null,after:'x'}]);
});

test('R22 legacy steps[i].patch alias reports the .patch path and the same effect as .panels',()=>{
  const before=base(),after=base();before.steps[5].patch={p:{value:6}};after.steps[5].patch={p:{value:42}};
  const e=only(compare(side(doc(before)),side(doc(after))),x=>x.kind==='step','one step entry');
  assert.deepEqual(e.fields,[{beforePath:SEC+'.steps[5].patch.p.value',afterPath:SEC+'.steps[5].patch.p.value',before:6,after:42}]);
  assert.deepEqual(effectOf(e,'p','state').afterSteps,[5,6]);
});

test('R23 absent document: one document entry plus one entry per section, mirrored',()=>{
  const p={page:{title:'T',sections:[{id:'a',heading:'A',diagram:base()},{id:'b',heading:'B'}]}};
  const add=compare(null,side(p)),rem=compare(side(p),null);
  only(add,x=>x.kind==='document' && x.status==='added','document added');
  assert.deepEqual(add.filter(x=>x.kind==='section').map(x=>[x.status,x.beforePath,x.afterPath]),[['added',null,'sections[0]'],['added',null,'sections[1]']]);
  only(rem,x=>x.kind==='document' && x.status==='removed','document removed');
  assert.deepEqual(rem.filter(x=>x.kind==='section').map(x=>[x.status,x.beforePath,x.afterPath]),[['removed','sections[0]',null],['removed','sections[1]',null]]);
});

test('R24 identity is empty and swapping sides mirrors statuses and paths',()=>{
  const t=topo(),fixtures=[side(doc(base())),side(t.consumer,{context:t.ctx()}),side({page:{title:'T',blocks:[{tabs:[{label:'x',sections:[{heading:'h',diagram:base()}]}]}]}},{ledger:'l'})];
  fixtures.forEach((f,i)=>assert.deepEqual(compare(f,plain(f)),[],'fixture '+i+' identity'));
  const before=base(),after=base();after.nodes.c={title:'C'};after.rows=[['a','b','c']];after.steps[2].panels={p:{value:50}};
  const ab=compare(side(doc(before)),side(doc(after))),ba=compare(side(doc(after)),side(doc(before)));
  const flip={added:'removed',removed:'added',modified:'modified'};
  const key=e=>[e.kind,e.status,e.beforePath,e.afterPath].join('|'),mirror=e=>[e.kind,flip[e.status],e.afterPath,e.beforePath].join('|');
  assert.ok(ab.length>=2,'precondition: changes exist');
  assert.deepEqual(ab.map(mirror).sort(),ba.map(key).sort());
});
