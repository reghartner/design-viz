'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./workbench-command-context.cjs')(['graph','layout']);
function fixture(){return {page:{title:'Keep exact outside',sections:[{diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['b']],floats:[{id:'a',x:100,y:80}],panels:[{id:'p',type:'state',states:['idle'],initial:{state:'idle'}}],layouts:[{id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:[{panel:'p',x:0,y:0,w:4,h:4}]},exploreLayout:{panelPlacement:'canvas',canvas:{panels:[{panel:'p',x:300,y:200,w:240,h:900}]}}}]}}]}};}
const targets=[{kind:'node',section:0,id:'a'},{kind:'panel',section:0,index:0,id:'p'}];
const rects=[{x:40,y:50,w:120,h:60},{x:300,y:200,w:240,h:80}];
test('mixed alignment anchors first center, canonicalizes fitted panel size, and preserves outside bytes',()=>{
 const raw=fixture(),text=JSON.stringify(raw,null,2).replace('"title": "Keep exact outside"','"title" :  "Keep exact outside"');
 for(const direction of ['horizontal','vertical']){const plan=B.planAlignSpatial(text,raw,targets,'explore',direction,rects);assert.ok(!plan.error,plan.error);assert.ok(plan.text.includes('"title" :  "Keep exact outside"'));const d=JSON.parse(plan.text).page.sections[0].diagram,p=d.layouts[0].exploreLayout.canvas.panels[0];assert.equal(direction==='horizontal'?p.y+p.h/2:p.x+p.w/2,direction==='horizontal'?80:100);assert.equal(p.w,240);assert.equal(p.h,80);assert.deepEqual(d.floats,[{id:'a',x:100,y:80}]);}
 assert.equal(raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0].h,900);
 assert.match(B.planAlignSpatial(text,raw,[{kind:'node',section:0,id:'b'},targets[1]],'explore','horizontal',rects).error,/Free placement/);
});
test('mixed alignment accepts a nonfirst visual anchor without rewriting its authored placement',()=>{
 const raw=fixture(),text=JSON.stringify(raw),authored=raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0];
 for(const direction of ['horizontal','vertical']){
  const plan=B.planAlignSpatial(text,raw,targets,'explore',direction,rects,1);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
  assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],authored);
  assert.deepEqual(d.floats[0],direction==='horizontal'?{id:'a',x:100,y:240}:{id:'a',x:420,y:80});
 }
 assert.match(B.planAlignSpatial(text,raw,targets,'explore','horizontal',rects,2).error,/selected object/);
});
test('mixed duplicate remaps IDs and placements and mixed delete resolves panel ID atomically',()=>{
 const raw=fixture(),text=JSON.stringify(raw),plan=B.planDuplicateSpatial(text,raw,targets,'explore',rects);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
 assert.ok(d.nodes.a1);assert.equal(d.panels[1].id,'p1');assert.deepEqual(d.floats[1],{id:'a1',x:124,y:104});assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[1],{panel:'p1',x:324,y:224,w:240,h:80});assert.equal(d.layouts[0].sectionLayout.default[1].panel,'p1');assert.equal(d.layouts[0].exploreLayout.panelPlacements[0].placement,'canvas');
 const del=B.planBulkDelete(plan.text,[targets[0],{kind:'panel',section:0,index:99,id:'p'}]);assert.ok(!del.error,del.error);const next=JSON.parse(del.text).page.sections[0].diagram;assert.equal(next.nodes.a,undefined);assert.deepEqual(next.panels.map(p=>p.id),['p1']);assert.equal(next.layouts[0].exploreLayout.canvas.panels.length,1);
 assert.match(B.planBulkDelete(text,[targets[0],{kind:'panel',section:0,id:'missing'}]).error,/no longer exists/);assert.ok(raw.page.sections[0].diagram.nodes.a);
});
function distribution(){const raw=fixture(),d=raw.page.sections[0].diagram;d.rows=[[]];d.floats.push({id:'b',x:240,y:280});return {raw,targets:[...targets,{kind:'node',section:0,id:'b'}],rects:[{x:0,y:0,w:100,h:40},{x:600,y:600,w:240,h:80},{x:170,y:170,w:140,h:220}]};}
test('distribution orders unequal mixed bounds and preserves outer bounds, sizes, axes, IDs and outside source',()=>{
 for(const direction of ['horizontal','vertical']){const {raw,targets,rects}=distribution(),text=JSON.stringify(raw,null,2).replace('"title": "Keep exact outside"','"title" :  "Keep exact outside"'),before=JSON.stringify(raw),plan=B.planDistributeSpatial(text,raw,targets,'explore',direction,rects);assert.ok(!plan.error,plan.error);assert.ok(plan.text.includes('"title" :  "Keep exact outside"'));assert.equal(JSON.stringify(raw),before);const d=JSON.parse(plan.text).page.sections[0].diagram;assert.deepEqual(d.floats[0],raw.page.sections[0].diagram.floats[0]);assert.deepEqual(d.layouts,raw.page.sections[0].diagram.layouts);const b=d.floats[1];if(direction==='horizontal'){assert.equal(b.x,350);assert.equal(b.y,280);}else{assert.equal(b.y,320);assert.equal(b.x,240);}assert.deepEqual(Object.keys(d.nodes),['a','b']);}
});
test('distribution rejects insufficient counts, row placement, impossible gaps and no-ops',()=>{
 const {raw,targets,rects}=distribution(),text=JSON.stringify(raw);
 assert.match(B.planDistributeSpatial(text,raw,targets.slice(0,2),'explore','horizontal',rects.slice(0,2)).error,/at least three/);
 assert.match(B.planDistributeSpatial(text,raw,targets,'explore','horizontal',rects.map((r,i)=>({...r,x:i*10}))).error,/overlap|insufficient/);
 const even=rects.map(r=>({...r}));even[2].x=280;assert.match(B.planDistributeSpatial(text,raw,targets,'explore','horizontal',even).error,/already/);
 raw.page.sections[0].diagram.floats.pop();assert.match(B.planDistributeSpatial(JSON.stringify(raw),raw,targets,'explore','horizontal',rects).error,/Free placement/);
});
test('nudge applies one graph delta to mixed objects, keeps panel dimensions and unrelated axes, and rejects invalid movements',()=>{
 const {raw,targets,rects}=distribution(),text=JSON.stringify(raw),plan=B.planNudgeSpatial(text,raw,targets,'explore',rects,10,0);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
 assert.equal(d.floats[0].x,60);assert.equal(d.floats[0].y,80);assert.equal(d.floats[1].x,250);assert.equal(d.floats[1].y,280);assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],{panel:'p',x:610,y:200,w:240,h:900});
 assert.match(B.planNudgeSpatial(text,raw,targets,'explore',rects,Infinity,0).error,/finite/);assert.match(B.planNudgeSpatial(text,raw,targets,'explore',rects,0,0).error,/already/);
});
