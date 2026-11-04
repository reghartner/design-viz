'use strict';
/* Stress run for the shared compare engine (issue #847; Chuck's coverage
   ruling 2026-10-31: separate stress file).

   Inputs:
   - the 48 deterministic panel-placement scenarios (tools/panel-placement/
     corpus.cjs), each built into a real spec, given a step path, and put
     through every LOCAL mutation kind below (seeded choice of step/panel/node);
   - a topology fixture (provider + consumer) put through every IMPORT
     mutation kind below.

   LOCAL mutation kinds: step panel patch, caption, node field, edge label,
   step tone, step panelVisibility, step time, panel title (render-only),
   panel visible, panel initial, document title, section heading, layout
   name, View added, story time, path membership, ledger.
   IMPORT mutation kinds: provider node field, provider edge label, provider
   node added, override node field, override edge field, import as, import
   export, import spec, tone on an imported node.

   Invariants per mutation (all asserted):
   S1 identity        compare(x, x) is []
   S2 symmetry        compare(b, a) is the FULL mirror of compare(a, b): statuses
                      flip; paths, field values, effect step lists, scopes and
                      resolved items swap sides
   S3 immutability    neither side is mutated
   S4 determinism     two runs are deepEqual
   S5 localization    exactly one entry of the expected kind/status/cause/origin,
                      with exactly the expected fields (paths and values)
   S6/S7 exact set    the entry's effect list equals EXACTLY the independent
                      oracle's set over every common path (each scenario has two
                      distinct paths), category and target: before AND after step
                      lists and folded values ('ambient' by the renderer rule);
                      no duplicates, no invented paths/categories/targets
   S10 loci           every non-null locus path resolves in its side; every field
                      value equals the value at its path; resolved loci resolve
   S8 declaration     a render-only panel edit is effect:'declaration', no
                      effects, scopes equal the oracle's visible steps + ambient
   S9 timing          a generated 400-step / 300-node / 600-edge document with one
                      edit compares in < 2000 ms and reports exactly that edit
*/
const test=require('node:test'),assert=require('node:assert/strict');
const corpus=require('../tools/panel-placement/corpus.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const C=corpus.engine(),IMAGE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const SEC='sections[0].diagram',R='resolved:'+SEC;
const key=(path,k)=>path+(/^[A-Za-z_$][\w$]*$/.test(k)?'.'+k:'['+JSON.stringify(k)+']');
function build(s){const spec=corpus.specification(C,s,IMAGE),d=spec.page.sections[0].diagram;d.paths=[{id:'main',steps:d.steps.map(x=>x.id)},{id:'alt',steps:d.steps.filter((x,i)=>i%2===0 || i===d.steps.length-1).map(x=>x.id)}];return spec;}
function rng(seed){let s=seed>>>0||1;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const pick=(r,list)=>list[Math.floor(r()*list.length)];
const side=(raw,{context=null,ledger=null}={})=>({authored:C.normalize(plain(raw)),resolved:C.normalize(context?C.FlowTopology.resolveSource(plain(raw),context):plain(raw)),ledger});
const sortJ=list=>(list||[]).map(x=>JSON.stringify(plain(x))).sort();
function mirror(e){
  const flip={added:'removed',removed:'added',modified:'modified'},m=plain(e);m.status=flip[m.status];[m.beforePath,m.afterPath]=[e.afterPath,e.beforePath];
  m.fields=(e.fields||[]).map(f=>plain({beforePath:f.afterPath,afterPath:f.beforePath,before:f.after,after:f.before}));
  m.effects=(e.effects||[]).map(x=>plain(Object.assign({},x,{beforeSteps:x.afterSteps,afterSteps:x.beforeSteps,changes:(x.changes||[]).map(c=>plain({beforeStep:c.afterStep,afterStep:c.beforeStep,before:c.after,after:c.before}))})));
  for(const k of ['section','key','step'])if(e[k])m[k]={before:e[k].after,after:e[k].before};
  if('scopeBefore' in e || 'scopeAfter' in e){m.scopeBefore=e.scopeAfter;m.scopeAfter=e.scopeBefore;}
  if(e.resolved)m.resolved=e.resolved.map(r=>plain(Object.assign({},r,{status:flip[r.status],beforePath:r.afterPath,afterPath:r.beforePath,before:r.after,after:r.before})));
  return m;
}
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v && typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const norm=e=>{const x=plain(e);x.fields=sortJ(x.fields);x.effects=sortJ((x.effects||[]).map(f=>Object.assign({},f,{changes:sortJ(f.changes)})));if(x.resolved)x.resolved=sortJ(x.resolved);return stable(x);};
function compare(a,b,label){
  assert.equal(typeof C.compareDocuments,'function','compareDocuments(before, after) is defined by the shared engine');
  const sa=plain(a),sb=plain(b),out=plain(C.compareDocuments(a,b));
  assert.deepEqual(plain(a),sa,'S3 before not mutated '+label);assert.deepEqual(plain(b),sb,'S3 after not mutated '+label);
  assert.deepEqual(plain(C.compareDocuments(a,b)),out,'S4 determinism '+label);
  assert.deepEqual(plain(C.compareDocuments(b,a)).map(norm).sort(),out.map(mirror).map(norm).sort(),'S2 full mirror '+label);
  checkLoci(out,a,b,label);
  return out;
}
/* Independent oracle over the folds (steps paired by id; 'ambient' by the renderer rule). */
function oracle(d0,d1,category,id,pathId){
  const f={state:d=>C.foldPanelStates(d)[id],tone:d=>C.foldNodeTones(d).map(s=>s[id]),visibility:d=>C.foldPanelVisibility(d)[id]}[category];
  const pa=C.diagramForPath(d0,pathId),pb=C.diagramForPath(d1,pathId),fa=f(pa)||[],fb=f(pb)||[];
  const ia=pa._sourceIndices,ib=pb._sourceIndices,bs=[],as=[],changes=[],seen=new Set();
  const toB=src=>{const id0=d0.steps[src].id;const k=(d1.steps||[]).findIndex(x=>x.id===id0);return k<0?null:k;};
  if(ia.length || ib.length){
    ia.forEach((src,k)=>{const sb=toB(src),j=sb==null?-1:ib.indexOf(sb);
      if(j<0){bs.push(src);changes.push(plain({beforeStep:src,afterStep:null,before:fa[k]}));return;}
      seen.add(sb);if(JSON.stringify(fa[k])!==JSON.stringify(fb[j])){bs.push(src);as.push(sb);changes.push(plain({beforeStep:src,afterStep:sb,before:fa[k],after:fb[j]}));}});
    ib.forEach((src,j)=>{if(!seen.has(src)){as.push(src);changes.push(plain({beforeStep:null,afterStep:src,after:fb[j]}));}});
  }
  bs.sort((x,y)=>x-y);as.sort((x,y)=>x-y);
  if(category==='state'){
    const amb=(d,st)=>{const p=(d.panels||[]).find(x=>x.id===id);if(!p)return undefined;const v=C.PanelViews.get(p.type);return v && v.options && v.options.ambientInitial?p.initial:st[0];};
    const a0=amb(d0,fa),b0=amb(d1,fb);if(JSON.stringify(a0)!==JSON.stringify(b0)){bs.push('ambient');as.push('ambient');changes.push(plain({beforeStep:'ambient',afterStep:'ambient',before:a0,after:b0}));}
  }
  return {beforeSteps:bs,afterSteps:as,changes};
}
function visibleScope(d,id){
  const p=C.diagramForPath(d,C.diagramPathList(d)[0].id),v=C.foldPanelVisibility(p)[id]||[],out=[];
  p._sourceIndices.forEach((src,k)=>{if(v[k]!==false && !out.includes(src))out.push(src);});
  return out.sort((x,y)=>x-y).concat(['ambient']);
}
/* S6 + S7: the entry's effect list equals EXACTLY the oracle's full set over
   every common path, category and target (no duplicates, no invented items). */
function checkEffects(e,d0,d1,label){
  const pathIds=C.diagramPathList(d0).map(p=>p.id).filter(id=>C.diagramPathList(d1).some(p=>p.id===id));
  const panelIds=[...new Set((d0.panels||[]).map(p=>p.id).concat((d1.panels||[]).map(p=>p.id)))];
  const nodeIds=[...new Set(Object.keys(d0.nodes||{}).concat(Object.keys(d1.nodes||{})))];
  const want=[];
  for(const pathId of pathIds)for(const [cat,kind,ids] of [['state','panel',panelIds],['visibility','panel',panelIds],['tone','node',nodeIds]])for(const id of ids){
    const o=oracle(d0,d1,cat,id,pathId);if(o.changes.length)want.push(Object.assign({pathId,target:{kind,id},category:cat},o));
  }
  assert.equal((e.effects||[]).length,new Set((e.effects||[]).map(x=>JSON.stringify(plain(x)))).size,'S7 no duplicate effects '+label);
  assert.deepEqual(sortJ(e.effects),sortJ(want),'S6/S7 exact effect set '+label);
  return want;
}
/* Every non-null locus path resolves; field values equal the values at their paths. */
function at(sd,path){
  let root=sd.authored;if(path.startsWith('resolved:')){root=sd.resolved;path=path.slice(9);}
  if(path==='')return root;
  const toks=[...path.matchAll(/(?:^|\.)([A-Za-z_$][\w$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g)].map(m=>m[1]!=null?m[1]:m[2]!=null?Number(m[2]):JSON.parse(m[3]));
  return toks.reduce((v,k)=>v==null?undefined:v[k],root);
}
const tokens=path=>[...path.replace(/^resolved:/,'').matchAll(/(?:^|\.)([A-Za-z_$][\w$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g)].map(m=>m[1]!=null?m[1]:m[2]!=null?Number(m[2]):JSON.parse(m[3]));
function sectionOf(sd,path){const recs=C.sectionRecords(sd.authored),p=path.replace(/^resolved:/,'');let best=null;recs.forEach((r,i)=>{if((p===r.path || p.startsWith(r.path+'.')) && (best==null || r.path.length>recs[best].path.length))best=i;});return best;}
function checkLoci(out,A,B,label){
  for(const e of out){
    if((e.effects||[]).length)assert.equal(e.effect,'state','effect discriminator '+label);
    if(e.effect==='declaration')assert.deepEqual(e.effects,[],'declaration has no effects '+label);
    if(e.kind==='ledger' || e.kind==='document')continue;
    assert.ok(e.section && e.key,'section and key locus '+label+' '+e.kind);
    for(const [sd,path,w] of [[A,e.beforePath,'before'],[B,e.afterPath,'after']]){
      if(path==null){assert.equal(e.section[w],null,label);assert.equal(e.key[w],null,label);continue;}
      assert.equal(e.section[w],sectionOf(sd,path),'section.'+w+' '+label+' '+path);
      if(e.cause==='provider'){assert.notEqual(e.key[w],null,label);
        for(const f of e.fields||[]){const fp=w==='before'?f.beforePath:f.afterPath;if(fp==null)continue;const t=tokens(fp),k=t.indexOf(e.kind==='edge'?'edges':'nodes');
          assert.ok(fp.startsWith('resolved:') && k>=0,'provider field path '+label);assert.deepEqual(e.key[w],t[k+1],'provider key.'+w+' matches field path '+label);}
        continue;}
      const t=tokens(path),last=t[t.length-1],v=at(sd,path),want=v && typeof v==='object' && (typeof v.id==='string' && v.id || typeof v.id==='number')?v.id:last;
      assert.deepEqual(e.key[w],want,'key.'+w+' '+label+' '+path);
      if(e.kind==='step')assert.equal(e.step[w],last,'step.'+w+' '+label);
    }
    if(e.beforePath!=null)assert.notEqual(at(A,e.beforePath),undefined,'locus resolves '+label+' '+e.beforePath);
    if(e.afterPath!=null)assert.notEqual(at(B,e.afterPath),undefined,'locus resolves '+label+' '+e.afterPath);
    for(const f of e.fields||[]){
      if(f.beforePath!=null)assert.deepEqual(plain(at(A,f.beforePath)),plain(f.before),'field value '+label+' '+f.beforePath);
      if(f.afterPath!=null)assert.deepEqual(plain(at(B,f.afterPath)),plain(f.after),'field value '+label+' '+f.afterPath);
    }
    for(const r of e.resolved||[]){
      if(r.beforePath!=null)assert.notEqual(at(A,r.beforePath),undefined,'resolved locus '+label+' '+r.beforePath);
      if(r.afterPath!=null)assert.notEqual(at(B,r.afterPath),undefined,'resolved locus '+label+' '+r.afterPath);
    }
  }
}
/* LOCAL mutations: (spec, r) -> {kind, status?, path?, before?, after?, fields?, declaration?, ledger?} */
const F=(bp,ap,before,after)=>plain({beforePath:bp,afterPath:ap,before,after});
const LOCAL={
  patch(s,r){const d=s.page.sections[0].diagram,k=Math.floor(r()*d.steps.length),p=pick(r,d.panels);d.steps[k].panels=d.steps[k].panels||{};d.steps[k].panels[p.id]=Object.assign({},d.steps[k].panels[p.id],{stressNote:'m'});
    return {root:SEC+'.steps['+k+']',kind:'step',fields:[F(null,key(SEC+'.steps['+k+'].panels',p.id)+'.stressNote',undefined,'m')]};},
  caption(s,r){const d=s.page.sections[0].diagram,k=Math.floor(r()*d.steps.length),old=d.steps[k].text;d.steps[k].text=old+' (edited)';
    return {root:SEC+'.steps['+k+']',kind:'step',fields:[F(SEC+'.steps['+k+'].text',SEC+'.steps['+k+'].text',old,old+' (edited)')]};},
  node(s,r){const d=s.page.sections[0].diagram,id=pick(r,Object.keys(d.nodes)),old=d.nodes[id].sub,p=key(SEC+'.nodes',id)+'.sub';d.nodes[id].sub='mutated sub';
    return {root:key(SEC+'.nodes',id),kind:'node',origin:'local',fields:[F(old===undefined?null:p,p,old,'mutated sub')]};},
  edge(s,r){const d=s.page.sections[0].diagram;if(!d.edges.length)return null;const i=Math.floor(r()*d.edges.length),old=d.edges[i].label,p=SEC+'.edges['+i+'].label';d.edges[i].label='mutated label';
    return {root:SEC+'.edges['+i+']',kind:'edge',origin:'local',fields:[F(old===undefined?null:p,p,old,'mutated label')]};},
  tone(s,r){const d=s.page.sections[0].diagram,k=Math.floor(r()*d.steps.length),id=pick(r,Object.keys(d.nodes));if(d.steps[k].tone)return null;d.steps[k].tone={[id]:'alert'};
    return {root:SEC+'.steps['+k+']',kind:'step',fields:[F(null,key(SEC+'.steps['+k+'].tone',id),undefined,'alert')]};},
  visibility(s,r){const d=s.page.sections[0].diagram,k=Math.floor(r()*d.steps.length),p=pick(r,d.panels);if(d.steps[k].panelVisibility)return null;d.steps[k].panelVisibility={[p.id]:false};
    return {root:SEC+'.steps['+k+']',kind:'step',fields:[F(null,key(SEC+'.steps['+k+'].panelVisibility',p.id),undefined,false)]};},
  time(s,r){const d=s.page.sections[0].diagram,k=1+Math.floor(r()*(d.steps.length-1));if(d.steps[k].time!==undefined)return null;d.steps[k].time='+'+(k+1)+'h';
    return {root:SEC+'.steps['+k+']',kind:'step',fields:[F(null,SEC+'.steps['+k+'].time',undefined,'+'+(k+1)+'h')]};},
  title(s,r){const d=s.page.sections[0].diagram,i=Math.floor(r()*d.panels.length),old=d.panels[i].title;d.panels[i].title=old+' (renamed)';
    return {root:SEC+'.panels['+i+']',kind:'panel',declaration:true,panelId:d.panels[i].id,fields:[F(SEC+'.panels['+i+'].title',SEC+'.panels['+i+'].title',old,old+' (renamed)')]};},
  visible(s,r){const d=s.page.sections[0].diagram,i=Math.floor(r()*d.panels.length);if(d.panels[i].visible!==undefined)return null;d.panels[i].visible=false;
    return {root:SEC+'.panels['+i+']',kind:'panel',fields:[F(null,SEC+'.panels['+i+'].visible',undefined,false)]};},
  initial(s,r){const d=s.page.sections[0].diagram,i=Math.floor(r()*d.panels.length);d.panels[i].initial=Object.assign({},d.panels[i].initial,{stressNote:'m'});
    return {root:SEC+'.panels['+i+']',kind:'panel',fields:[F(null,SEC+'.panels['+i+'].initial.stressNote',undefined,'m')]};},
  docTitle(s){const old=s.page.title;s.page.title=old+' (retitled)';return {root:'',kind:'document',fields:[F('title','title',old,old+' (retitled)')]};},
  heading(s){const old=s.page.sections[0].heading;s.page.sections[0].heading=old+' (edited)';return {root:'sections[0]',kind:'section',fields:[F('sections[0].heading','sections[0].heading',old,old+' (edited)')]};},
  layout(s){const d=s.page.sections[0].diagram,old=d.layouts[0].name;d.layouts[0].name=old+' (renamed)';return {root:SEC+'.layouts[0]',kind:'layout',fields:[F(SEC+'.layouts[0].name',SEC+'.layouts[0].name',old,old+' (renamed)')]};},
  view(s){const sec=s.page.sections[0];if(sec.views)return null;sec.views=[{id:'stress-view',name:'Stress view'}];return {root:'sections[0].views[0]',kind:'view',status:'added',afterPath:'sections[0].views[0]',fields:[]};},
  storyTime(s){const d=s.page.sections[0].diagram;if(d.storyTime)return null;d.storyTime={start:'2026-09-24T22:30'};return {root:'sections[0]',kind:'section',fields:[F(null,SEC+'.storyTime.start',undefined,'2026-09-24T22:30')]};},
  path(s,r){const d=s.page.sections[0].diagram,old=d.paths[0].steps.slice(),k=1+Math.floor(r()*(old.length-1));d.paths[0].steps=old.filter((x,i)=>i!==k);
    return {root:SEC+'.paths[0]',kind:'path',fields:[F(SEC+'.paths[0].steps',SEC+'.paths[0].steps',old,d.paths[0].steps)]};},
  ledger(){return {root:'ledger',kind:'ledger',ledger:['one\ntwo','one\nTWO'],fields:[F('ledger:2-2','ledger:2-2','two','TWO')]};}
};

const scenarios=corpus.scenarios();
test('precondition: the engine lives in the shared validator.js logical bundle',()=>{
  const {readSource}=require('../tools/source-loader.cjs'),vm=require('node:vm'),V={URL,console};vm.createContext(V);vm.runInContext(readSource('validator.js'),V);
  assert.equal(typeof V.compareDocuments,'function','compareDocuments(before, after) is defined by the shared engine in the validator.js bundle');
});
test('precondition: the corpus supplies 48 scenarios with steps, panels and layouts',()=>{
  assert.equal(scenarios.length,48);
  scenarios.forEach(s=>{const d=build(s).page.sections[0].diagram;assert.ok(d.steps.length>=3 && d.panels.length>=1 && d.layouts.length>=1,s.id);assert.notDeepEqual(d.paths[0].steps,d.paths[1].steps,s.id+' has two distinct paths');});
});
for(const s of scenarios){
  test('stress '+s.id,()=>{
    const spec=build(s),r=rng(s.id.split('').reduce((h,c)=>h*31+c.charCodeAt(0),7));
    assert.deepEqual(compare(side(spec),side(spec),s.id),[],'S1 identity');
    let ran=0,altEffects=0;
    for(const name of Object.keys(LOCAL)){
      const next=plain(spec),m=LOCAL[name](next,r);if(!m)continue;ran++;
      const label=s.id+' '+name,A=side(spec,{ledger:m.ledger?m.ledger[0]:null}),B=side(next,{ledger:m.ledger?m.ledger[1]:null});
      const out=compare(A,B,label);
      assert.equal(out.length,1,'S5 one entry '+label+' '+JSON.stringify(out.map(e=>[e.kind,e.status,e.beforePath,e.afterPath])));
      const e=out[0];
      assert.equal(e.kind,m.kind,'S5 kind '+label);assert.equal(e.status,m.status||'modified','S5 status '+label);assert.equal(e.cause,'document','S5 cause '+label);
      if(m.origin)assert.equal(e.origin,m.origin,'S5 origin '+label);
      assert.equal(e.afterPath,m.root,'S5 record path after '+label);
      assert.equal(e.beforePath,(m.status||'modified')==='added'?null:m.root,'S5 record path before '+label);
      assert.deepEqual(sortJ(e.fields),sortJ(m.fields),'S5 fields '+label);
      const d0=spec.page.sections[0].diagram,d1=next.page.sections[0].diagram;
      if(m.declaration){
        assert.equal(e.effect,'declaration','S8 '+label);assert.deepEqual(e.effects,[],'S8 '+label);
        assert.deepEqual(e.scopeBefore,visibleScope(d0,m.panelId),'S8 scopeBefore '+label);assert.deepEqual(e.scopeAfter,visibleScope(d1,m.panelId),'S8 scopeAfter '+label);
      }else altEffects+=checkEffects(e,d0,d1,label).filter(w=>w.pathId==='alt').length;
    }
    assert.ok(ran>=14,'precondition: at least 14 mutation kinds applied to '+s.id+' (got '+ran+')');
    assert.ok(altEffects>0,'precondition: at least one mutation in '+s.id+' changes the second path, so per-path effects are exercised');
  });
}

/* IMPORT mutations over a topology fixture. */
function topo(){
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}});
  const provider=spec('provider',{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'ab'}],topologyExports:{public:{nodes:['a','b'],edges:['a->b']},onlyA:{nodes:['a'],edges:[]}}});
  const provider2=spec('provider2',{nodes:{a:{title:'A2'}},rows:[['a']],topologyExports:{public:{nodes:['a'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],panels:[{id:'g',type:'gauge',title:'G',initial:{value:1}}],steps:[{id:'t0',nodes:['local']},{id:'t1',nodes:['local']},{id:'t2',nodes:['local']}],topologyImports:[{spec:'provider',export:'public',as:'child'}]});
  return {provider,provider2,consumer,ctx:(p=provider)=>({version:1,id:'consumer',specs:[p,provider2,consumer]})};
}
const I=(kind,status,bp,ap,extra={})=>Object.assign({kind,status,origin:'imported',beforePath:bp,afterPath:ap},extra);
const IMPORT={
  providerNode:t=>{const p=plain(t.provider);p.page.sections[0].diagram.nodes.a.title='A!';return {root:SEC+'.topologyImports[0]',after:[t.consumer,t.ctx(p)],kind:'node',cause:'provider',fields:[F(R+'.nodes["child::a"].title',R+'.nodes["child::a"].title','A','A!')]};},
  providerEdge:t=>{const p=plain(t.provider);p.page.sections[0].diagram.edges[0].label='ab!';return {root:SEC+'.topologyImports[0]',after:[t.consumer,t.ctx(p)],kind:'edge',cause:'provider',fields:[F(R+'.edges[0].label',R+'.edges[0].label','ab','ab!')]};},
  providerAdd:t=>{/* key asserted explicitly below via m.key */const p=plain(t.provider),d=p.page.sections[0].diagram;d.nodes.c={title:'C'};d.rows=[['a','b','c']];d.topologyExports.public.nodes.push('c');return {root:SEC+'.topologyImports[0]',after:[t.consumer,t.ctx(p)],kind:'node',status:'added',cause:'provider',afterPath:SEC+'.topologyImports[0]',key:{before:null,after:'child::c'},fields:[]};},
  overrideNode:t=>{const c=plain(t.consumer);c.page.sections[0].diagram.topologyImports[0].nodeOverrides={a:{sub:'S'}};return {root:SEC+'.topologyImports[0]',after:[c,t.ctx()],kind:'import',cause:'document',fields:[F(null,SEC+'.topologyImports[0].nodeOverrides.a.sub',undefined,'S')],resolved:[I('node','modified',null,R+'.nodes["child::a"].sub',{after:'S'})]};},
  overrideEdge:t=>{const c=plain(t.consumer);c.page.sections[0].diagram.topologyImports[0].edgeOverrides={'a->b':{label:'X'}};return {root:SEC+'.topologyImports[0]',after:[c,t.ctx()],kind:'import',cause:'document',fields:[F(null,SEC+'.topologyImports[0].edgeOverrides["a->b"].label',undefined,'X')],resolved:[I('edge','modified',R+'.edges[0].label',R+'.edges[0].label',{before:'ab',after:'X'})]};},
  as:t=>{const c=plain(t.consumer);c.page.sections[0].diagram.topologyImports[0].as='kid';return {root:SEC+'.topologyImports[0]',after:[c,t.ctx()],kind:'import',cause:'document',fields:[F(SEC+'.topologyImports[0].as',SEC+'.topologyImports[0].as','child','kid')],
    resolved:[I('node','removed',R+'.nodes["child::a"]',null),I('node','removed',R+'.nodes["child::b"]',null),I('edge','removed',R+'.edges[0]',null),I('node','added',null,R+'.nodes["kid::a"]'),I('node','added',null,R+'.nodes["kid::b"]'),I('edge','added',null,R+'.edges[0]')]};},
  export:t=>{const c=plain(t.consumer);c.page.sections[0].diagram.topologyImports[0].export='onlyA';return {root:SEC+'.topologyImports[0]',after:[c,t.ctx()],kind:'import',cause:'document',fields:[F(SEC+'.topologyImports[0].export',SEC+'.topologyImports[0].export','public','onlyA')],resolved:[I('node','removed',R+'.nodes["child::b"]',null),I('edge','removed',R+'.edges[0]',null)]};},
  spec:t=>{const c=plain(t.consumer);c.page.sections[0].diagram.topologyImports[0].spec='provider2';return {root:SEC+'.topologyImports[0]',after:[c,t.ctx()],kind:'import',cause:'document',fields:[F(SEC+'.topologyImports[0].spec',SEC+'.topologyImports[0].spec','provider','provider2')],
    resolved:[I('node','modified',R+'.nodes["child::a"].title',R+'.nodes["child::a"].title',{before:'A',after:'A2'}),I('node','removed',R+'.nodes["child::b"]',null),I('edge','removed',R+'.edges[0]',null)]};},
  importedTone:t=>{const c=plain(t.consumer);c.page.sections[0].diagram.steps[1].tone={'child::b':'ok'};return {root:SEC+'.steps[1]',after:[c,t.ctx()],kind:'step',cause:'document',fields:[F(null,SEC+'.steps[1].tone["child::b"]',undefined,'ok')],effects:true};}
};
test('stress imported topology: every import mutation kind',()=>{
  const t=topo(),A=side(t.consumer,{context:t.ctx()});
  assert.deepEqual(compare(A,side(t.consumer,{context:t.ctx()}),'topo identity'),[],'S1 identity');
  for(const [name,make] of Object.entries(IMPORT)){
    const m=make(t),B=side(m.after[0],{context:m.after[1]}),out=compare(A,B,name);
    assert.equal(out.length,1,'S5 one entry '+name+' '+JSON.stringify(out.map(e=>[e.kind,e.status,e.cause,e.beforePath,e.afterPath])));
    const e=out[0];
    assert.equal(e.kind,m.kind,name);assert.equal(e.status,m.status||'modified',name);assert.equal(e.cause,m.cause,name);
    if(m.kind!=='step')assert.equal(e.origin,'imported',name);
    assert.equal(e.afterPath,m.root,'S5 record path after '+name);assert.equal(e.beforePath,(m.status||'modified')==='added'?null:m.root,'S5 record path before '+name);
    assert.deepEqual(sortJ(e.fields),sortJ(m.fields),'S5 fields '+name);
    if(m.resolved)assert.deepEqual(sortJ(e.resolved),sortJ(m.resolved),'S5 attached resolved '+name);
    if(m.key)assert.deepEqual(e.key,m.key,'S5 key '+name);
    checkEffects(e,A.resolved.sections[0].diagram,B.resolved.sections[0].diagram,name);
    if(m.effects)assert.ok(e.effects.length,'precondition-backed: imported tone has an effect '+name);
  }
});

/* S9: a generated large document — 400 steps, 300 nodes, 600 edges, 12 panels,
   3 paths, patches/tones/visibility on most steps — must compare against a
   copy with one edit at step 200 in under 2000 ms, and report it correctly. */
function large(){
  const nodes={},rows=[],edges=[];
  for(let i=0;i<300;i++){nodes['n'+i]={title:'Node '+i,sub:'sub '+i};if(i%10===0)rows.push([]);rows[rows.length-1].push('n'+i);}
  for(let i=0;i<600;i++)edges.push({from:'n'+(i%300),to:'n'+((i*7+1)%300),label:'e'+i});
  const panels=Array.from({length:12},(_,k)=>({id:'g'+k,type:'gauge',title:'G'+k,max:1000,initial:{value:k}}));
  const steps=Array.from({length:400},(_,i)=>({id:'t'+i,nodes:['n'+(i%300)],text:'Step '+i+': '+'The service validates the request and forwards it to the next hop. '.repeat(3),panels:{['g'+(i%12)]:{value:i}},tone:i%3?{['n'+(i%300)]:'warn'}:undefined,panelVisibility:i%17===0?{['g'+(i%12)]:i%2===0}:undefined}));
  const ids=steps.map(s=>s.id);
  return {page:{title:'Large',sections:[{id:'big',heading:'Big',diagram:{nodes,rows,edges,panels,steps:plain(steps),paths:[{id:'main',steps:ids},{id:'odd',steps:ids.filter((x,i)=>i%2)},{id:'tail',steps:ids.slice(200)}]}}]}};
}
test('S9 timing: large generated document compares in under 2000 ms and reports the one edit',()=>{
  const spec=large();assert.ok(JSON.stringify(spec).length>150000,'precondition: large document ('+JSON.stringify(spec).length+' bytes)');
  const next=plain(spec);next.page.sections[0].diagram.steps[200].panels.g8={value:9999};
  const A=side(spec),B=side(next);assert.equal(typeof C.compareDocuments,'function','compareDocuments(before, after) is defined by the shared engine');
  const t0=Date.now(),out=plain(C.compareDocuments(A,B)),ms=Date.now()-t0;
  assert.ok(ms<2000,'compare took '+ms+' ms');
  assert.equal(out.length,1);assert.equal(out[0].kind,'step');assert.equal(out[0].afterPath,SEC+'.steps[200]');
  checkEffects(out[0],spec.page.sections[0].diagram,next.page.sections[0].diagram,'large');
  const t1=Date.now();C.compareDocuments(A,side(spec));assert.ok(Date.now()-t1<2000,'identity compare under 2000 ms');
});
