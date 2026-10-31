'use strict';
/* Stress run for the shared compare engine (issue #847; Chuck's coverage
   ruling 2026-10-31: separate stress file). Inputs: the 48 deterministic
   panel-placement scenarios (tools/panel-placement/corpus.cjs), each built
   into a real spec, then a seeded set of single-field mutations.

   Invariants per mutation (all asserted):
   S1 identity        compare(x, x) is []
   S2 symmetry        compare(b, a) mirrors compare(a, b): added<->removed, paths swapped
   S3 immutability    neither side is mutated
   S4 determinism     two runs are deepEqual
   S5 localization    exactly one entry, exactly one field, at the expected
                      beforePath/afterPath with the expected values; no entry
                      for an unmutated field
   S6 completeness    every id whose folded state / tone / visibility differs
                      (independent oracle over the folds) has an effect equal to it
   S7 precision       no effect is reported for an id the oracle shows unchanged
   S8 declaration     a panel-declaration title edit (render-only) is
                      effect:'declaration' with no effects and a visible-step scope
   S9 timing          comparing the largest scenario with its mutation takes < 2000 ms
*/
const test=require('node:test'),assert=require('node:assert/strict');
const corpus=require('../tools/panel-placement/corpus.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const C=corpus.engine(),IMAGE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const build=s=>corpus.specification(C,s,IMAGE);
const SEC=i=>'sections[0].diagram';

function rng(seed){let s=seed>>>0||1;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const side=raw=>({authored:C.normalize(plain(raw)),resolved:C.normalize(plain(raw)),ledger:null});
function compare(a,b){
  assert.equal(typeof C.compareDocuments,'function','compareDocuments(before, after) is defined by the shared engine');
  const sa=plain(a),sb=plain(b),out=plain(C.compareDocuments(a,b));
  assert.deepEqual(plain(a),sa,'S3 before not mutated');assert.deepEqual(plain(b),sb,'S3 after not mutated');return out;
}
function oracle(d0,d1,category,id){
  const f={state:d=>C.foldPanelStates(d)[id],tone:d=>C.foldNodeTones(d).map(s=>s[id]),visibility:d=>C.foldPanelVisibility(d)[id]}[category];
  const a=f(d0)||[],b=f(d1)||[],out=[];
  for(let i=0;i<Math.max(a.length,b.length);i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i]))out.push(i);
  return out;
}
/* Each mutation returns {path, before, after, kind}. Paths are page-root paths. */
const MUTATIONS={
  patch(d,r){const k=Math.floor(r()*d.steps.length),p=d.panels[Math.floor(r()*d.panels.length)];d.steps[k].panels=d.steps[k].panels||{};const had=d.steps[k].panels[p.id];
    if(had){had.stressNote='m';return {kind:'step',path:'steps['+k+'].panels.'+p.id+'.stressNote',before:undefined,after:'m',beforeNull:true};}
    d.steps[k].panels[p.id]={stressNote:'m'};return {kind:'step',path:'steps['+k+'].panels.'+p.id,before:undefined,after:{stressNote:'m'},beforeNull:true};},
  caption(d,r){const k=Math.floor(r()*d.steps.length),old=d.steps[k].text;d.steps[k].text=old+' (edited)';return {kind:'step',path:'steps['+k+'].text',before:old,after:old+' (edited)'};},
  node(d,r){const ids=Object.keys(d.nodes),id=ids[Math.floor(r()*ids.length)],old=d.nodes[id].sub;d.nodes[id].sub='mutated sub';
    return {kind:'node',path:'nodes'+(/^[A-Za-z_$][\w$]*$/.test(id)?'.'+id:'['+JSON.stringify(id)+']')+'.sub',before:old,after:'mutated sub',beforeNull:old===undefined};},
  edge(d,r){if(!d.edges.length)return null;const i=Math.floor(r()*d.edges.length),old=d.edges[i].label;d.edges[i].label='mutated label';return {kind:'edge',path:'edges['+i+'].label',before:old,after:'mutated label',beforeNull:old===undefined};},
  tone(d,r){const k=Math.floor(r()*d.steps.length),ids=Object.keys(d.nodes),id=ids[Math.floor(r()*ids.length)];if(d.steps[k].tone)return null;d.steps[k].tone={[id]:'alert'};return {kind:'step',path:'steps['+k+'].tone',before:undefined,after:{[id]:'alert'},beforeNull:true};},
  visibility(d,r){const k=Math.floor(r()*d.steps.length),p=d.panels[Math.floor(r()*d.panels.length)];if(d.steps[k].panelVisibility)return null;d.steps[k].panelVisibility={[p.id]:false};return {kind:'step',path:'steps['+k+'].panelVisibility',before:undefined,after:{[p.id]:false},beforeNull:true};},
  title(d,r){const i=Math.floor(r()*d.panels.length),old=d.panels[i].title;d.panels[i].title=old+' (renamed)';return {kind:'panel',path:'panels['+i+'].title',before:old,after:old+' (renamed)',declaration:true};}
};

const scenarios=corpus.scenarios();
test('precondition: the corpus supplies 48 scenarios with steps and panels',()=>{
  assert.equal(scenarios.length,48);
  scenarios.forEach(s=>{const d=build(s).page.sections[0].diagram;assert.ok(d.steps.length>=1 && d.panels.length>=1,s.id);});
});

for(const s of scenarios){
  test('stress '+s.id,()=>{
    const spec=build(s),r=rng(s.id.split('').reduce((h,c)=>h*31+c.charCodeAt(0),7));
    const A=side(spec);
    assert.deepEqual(compare(A,side(spec)),[],'S1 identity');
    for(const name of Object.keys(MUTATIONS)){
      const next=plain(spec),d=next.page.sections[0].diagram,m=MUTATIONS[name](d,r);if(!m)continue;
      const B=side(next),ab=compare(A,B),ab2=compare(A,B),ba=compare(B,A);
      const label=s.id+' '+name+' '+m.path;
      assert.deepEqual(ab,ab2,'S4 determinism '+label);
      const flip={added:'removed',removed:'added',modified:'modified'};
      assert.deepEqual(ba.map(e=>[e.kind,e.status,e.beforePath,e.afterPath].join('|')).sort(),ab.map(e=>[e.kind,flip[e.status],e.afterPath,e.beforePath].join('|')).sort(),'S2 symmetry '+label);
      assert.equal(ab.length,1,'S5 one entry '+label+' '+JSON.stringify(ab.map(e=>[e.kind,e.beforePath,e.afterPath])));
      const e=ab[0],full=SEC()+'.'+m.path;
      assert.equal(e.kind,m.kind,'S5 kind '+label);
      assert.deepEqual(e.fields,[plain({beforePath:m.beforeNull?null:full,afterPath:full,before:m.before,after:m.after})],'S5 field '+label);
      const d0=spec.page.sections[0].diagram;
      if(m.declaration){
        assert.equal(e.effect,'declaration','S8 '+label);assert.deepEqual(e.effects,[],'S8 '+label);
        assert.ok(Array.isArray(e.scopeAfter) && e.scopeAfter.includes('ambient'),'S8 scope '+label);
        continue;
      }
      const ids={state:d0.panels.map(p=>p.id),visibility:d0.panels.map(p=>p.id),tone:Object.keys(d0.nodes)};
      for(const cat of Object.keys(ids))for(const id of ids[cat]){
        const want=oracle(d0,d,cat,id),got=(e.effects||[]).find(x=>x.category===cat && x.target.id===id);
        if(want.length){assert.ok(got,'S6 missing '+cat+' '+id+' '+label);assert.deepEqual(got.afterSteps.filter(x=>x!=='ambient'),want,'S6 '+cat+' '+id+' '+label);}
        else assert.equal(got,undefined,'S7 invented '+cat+' '+id+' '+label);
      }
    }
  });
}

test('S9 timing: largest scenario compare under 2000 ms',()=>{
  const sized=scenarios.map(s=>[s,JSON.stringify(build(s)).length]).sort((a,b)=>b[1]-a[1]);
  const spec=build(sized[0][0]),next=plain(spec);next.page.sections[0].diagram.steps[0].text+=' x';
  const A=side(spec),B=side(next),t0=Date.now();compare(A,B);const ms=Date.now()-t0;
  assert.ok(ms<2000,'compare took '+ms+' ms');
});
