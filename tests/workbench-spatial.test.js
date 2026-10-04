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
test('mixed duplicate remaps IDs and placements and mixed delete resolves panel ID atomically',()=>{
 const raw=fixture(),text=JSON.stringify(raw),plan=B.planDuplicateSpatial(text,raw,targets,'explore',rects);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
 assert.ok(d.nodes.a1);assert.equal(d.panels[1].id,'p1');assert.deepEqual(d.floats[1],{id:'a1',x:124,y:104});assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[1],{panel:'p1',x:324,y:224,w:240,h:80});assert.equal(d.layouts[0].sectionLayout.default[1].panel,'p1');assert.equal(d.layouts[0].exploreLayout.panelPlacements[0].placement,'canvas');
 const del=B.planBulkDelete(plan.text,[targets[0],{kind:'panel',section:0,index:99,id:'p'}]);assert.ok(!del.error,del.error);const next=JSON.parse(del.text).page.sections[0].diagram;assert.equal(next.nodes.a,undefined);assert.deepEqual(next.panels.map(p=>p.id),['p1']);assert.equal(next.layouts[0].exploreLayout.canvas.panels.length,1);
 assert.match(B.planBulkDelete(text,[targets[0],{kind:'panel',section:0,id:'missing'}]).error,/no longer exists/);assert.ok(raw.page.sections[0].diagram.nodes.a);
});
