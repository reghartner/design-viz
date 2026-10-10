'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ctx=require('./workbench-command-context.cjs')(['graph','document','narrative','layout']);
const fixture=()=>JSON.parse(fs.readFileSync('examples/tab-views/tab-views.spec.json','utf8'));
const plain=v=>JSON.parse(JSON.stringify(v));
const tab=raw=>raw.page.blocks[0].tabs[0];
function plan(raw,section,id,action,value){const before=JSON.stringify(raw),result=ctx.planTabViewEdit(JSON.stringify(raw,null,2),raw,section,id,action,value);assert.ok(!result.error,result.error);assert.equal(JSON.stringify(raw),before);assert.deepEqual(plain(ctx.validate(ctx.normalize(JSON.parse(result.text))).errors),[]);return result;}
test('Views reference the original shared sections in explicit order and exclude domains',()=>{
 const raw=fixture(),page=ctx.normalize(raw),owner=ctx.tabViewOwners(page)[0],views=ctx.tabViewDefinitions(owner);
 assert.deepEqual(plain(views.map(v=>v.members.map(m=>m.record.section.id))),[['a','c'],['b','c'],['a']]);
 assert.equal(views[0].members[1].record.section,views[1].members[1].record.section);
 assert.equal(views[0].members[0].record.section,tab(raw).sections[0]);
 assert.equal(ctx.tabViewDefault(owner,views).id,'standard-ac');assert.equal(owner.records[3].domainOnly,true);
});
test('invalid View containers, IDs, members, defaults and cross-Tab arrangements fail validation',()=>{
 const invalid=[t=>t.views='x',t=>t.views=[],t=>t.views[0]=null,t=>t.views[1].id=t.views[0].id,t=>t.defaultView='missing',t=>t.views[0].sections=['a','a'],t=>t.views[0].sections=['notes'],t=>t.views[0].sections=['detail'],t=>t.views[0].sections=[{section:'a',layout:'missing'}],t=>t.views[0].presentation='all'];
 for(const mutate of invalid){const raw=fixture();mutate(tab(raw));assert.ok(ctx.validate(ctx.normalize(raw)).errors.length,JSON.stringify(tab(raw)));}
});
test('canonical View actions preserve content and publish one source result',()=>{
 let raw=fixture(),content=JSON.stringify(tab(raw).sections),r=plan(raw,0,'standard-ac','duplicate');raw=JSON.parse(r.text);const id=r.viewId;
 for(const [action,value] of [['name','Review'],['presentation','explore'],['sections',['c','b']],['default',null]]){r=plan(raw,0,id,action,value);raw=JSON.parse(r.text);assert.equal(JSON.stringify(tab(raw).sections),content);}
 assert.equal(tab(raw).defaultView,id);assert.deepEqual(tab(raw).views.find(v=>v.id===id).sections,['c','b']);
 r=plan(raw,0,id,'delete');raw=JSON.parse(r.text);assert.ok(tab(raw).views.some(v=>v.id===tab(raw).defaultView));assert.equal(JSON.stringify(tab(raw).sections),content);
});
test('legacy mixed arrangements migrate only after explicit authoring and preserve original layout bytes',()=>{
 const diagram={nodes:{a:{title:'A'}},rows:[['a']],layouts:[{id:'page',name:'Page',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}]};
 const raw={sections:[{heading:'First',diagram},{heading:'Second',diagram:{nodes:{b:{}},rows:[['b']]}}]},text=JSON.stringify(raw,null,2),owners=ctx.tabViewOwners(ctx.normalize(raw)),defs=ctx.tabViewDefinitions(owners[0]);
 assert.equal(JSON.stringify(raw,null,2),text);const explore=defs.find(v=>v.presentation==='explore');assert.equal(explore.members.length,1);
 const r=ctx.planTabViewEdit(text,raw,0,explore.id,'name','Canvas renamed');assert.ok(!r.error,r.error);const next=JSON.parse(r.text);assert.deepEqual(next.sections[0].diagram,diagram);assert.ok(next.views.some(v=>v.presentation==='explore'));assert.ok(next.views.some(v=>v.presentation==='standard'));assert.equal(next.sections.length,2);assert.equal(next.defaultView,ctx.tabViewDefault(owners[0],defs).id);
});
test('section insert, duplicate, rename, move and delete repair canonical membership atomically',()=>{
 let raw=fixture(),text=JSON.stringify(raw,null,2);let r=ctx.planAddSection(text,raw,1,'explore-bc');assert.ok(!r.error,r.error);raw=JSON.parse(r.text);assert.equal(tab(raw).views[1].sections.at(-1).section,tab(raw).sections.at(-1).id);assert.equal(tab(raw).views[0].sections.length,2);
 r=ctx.planDuplicateSection(r.text,raw,0);assert.ok(!r.error,r.error);raw=JSON.parse(r.text);assert.equal(tab(raw).views[0].sections[1],tab(raw).sections[1].id);assert.deepEqual(plain(ctx.validate(ctx.normalize(raw)).errors),[]);
 r=ctx.planSetSectionIdentity(r.text,raw,0,'id','renamed');assert.ok(!r.error,r.error);raw=JSON.parse(r.text);assert.equal(tab(raw).views[0].sections[0],'renamed');
 r=ctx.planMoveSection(r.text,raw,0,1);assert.ok(!r.error,r.error);raw=JSON.parse(r.text);assert.equal(tab(raw).views[0].sections[0],'renamed');
 r=ctx.planDeleteSection(r.text,raw,1);assert.ok(!r.error,r.error);raw=JSON.parse(r.text);assert.ok(!tab(raw).views.some(v=>v.sections.includes('renamed')));assert.deepEqual(plain(ctx.validate(ctx.normalize(raw)).errors),[]);
});
test('independent arrangement duplicates placement once without copying section content',()=>{
 const raw=fixture(),original=tab(raw).sections[2].diagram,r=plan(raw,2,'explore-bc','arrangement'),next=JSON.parse(r.text),diagram=tab(next).sections[2].diagram;
 assert.deepEqual(diagram.nodes,original.nodes);assert.deepEqual(diagram.steps,original.steps);assert.deepEqual(diagram.edges,original.edges);
 const member=tab(next).views[1].sections.find(m=>ctx.tabViewMemberReference(m)==='c');assert.equal(typeof member.layout,'string');assert.ok(diagram.layouts.some(layout=>layout.id===member.layout));assert.equal(tab(next).views[0].sections[1],'c');
});
test('deleting a Tab never rewrites the next Tab with removed View membership',()=>{
 const raw=fixture(),notes=raw.page.blocks[0].tabs[1];notes.views=[{id:'notes',name:'Notes',presentation:'standard',sections:['notes']}];notes.defaultView='notes';
 const r=ctx.planDeleteTab(JSON.stringify(raw,null,2),raw,0,0);assert.ok(!r.error,r.error);const next=JSON.parse(r.text);assert.deepEqual(next.page.blocks[0].tabs,[notes]);assert.deepEqual(plain(ctx.validate(ctx.normalize(next)).errors),[]);
});

test('direct page Views have an implicit owner and source plans preserve shared section identity',()=>{
 const original=tab(fixture()),raw={page:{title:'Implicit Tab',sections:original.sections,views:original.views,defaultView:original.defaultView}};
 const owners=ctx.tabViewOwners(ctx.normalize(raw));assert.equal(owners.length,1);assert.equal(owners[0].source,raw.page);
 const r=plan(raw,2,'explore-bc','name','Page journey'),next=JSON.parse(r.text);assert.equal(next.page.views[1].name,'Page journey');assert.deepEqual(next.page.sections,raw.page.sections);assert.equal(next.page.defaultView,'standard-ac');
});

test('one-section legacy Views retain authored names and their opening arrangement',()=>{
 const raw={sections:[{id:'one',diagram:{nodes:{a:{}},rows:[['a']],layouts:[
  {id:'brief',name:'Business',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
  {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}],defaultLayout:'brief'}}]};
 const owner=ctx.tabViewOwners(ctx.normalize(raw))[0],views=ctx.tabViewDefinitions(owner);
 assert.deepEqual(plain(views.map(v=>v.name)),['Business','Explore']);assert.equal(ctx.tabViewDefault(owner,views).legacyLayout,'brief');
});


test('legacy introductory prose preserves the first diagram default and authored View names',()=>{
 for(const presentation of ['standard','explore']){
  const raw={sections:[{id:'intro',text:'Introductory context'},{id:'diagram',diagram:{nodes:{a:{}},rows:[['a']],layouts:[
   {id:'opening',name:'Opening',presentation,sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
   {id:'other',name:'Other',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}],defaultLayout:'opening'}}]};
  const before=JSON.stringify(raw),owner=ctx.tabViewOwners(ctx.normalize(raw))[0],views=ctx.tabViewDefinitions(owner),selected=ctx.tabViewDefault(owner,views);
  assert.equal(selected.presentation,presentation);assert.equal(selected.members.at(-1).record.section.id,'diagram');
  assert.deepEqual(plain(views.map(v=>v.name)),['Standard','Opening','Other']);assert.equal(JSON.stringify(raw),before);
  if(presentation==='standard')assert.deepEqual(plain(selected.members.map(m=>m.record.section.id)),['intro','diagram']);
 }
});

test('canonical default View retains explicit prose-first member ordering',()=>{
 const raw={sections:[{id:'intro',text:'Introductory context'},{id:'diagram',diagram:{nodes:{a:{}},rows:[['a']]}}],
  views:[{id:'reading',name:'Reading',presentation:'explore',sections:['intro','diagram']}],defaultView:'reading'};
 const owner=ctx.tabViewOwners(ctx.normalize(raw))[0],selected=ctx.tabViewDefault(owner,ctx.tabViewDefinitions(owner));
 assert.equal(selected.id,'reading');assert.deepEqual(plain(selected.members.map(m=>m.record.section.id)),['intro','diagram']);
});


test('legacy prose plus a Standard arrangement has distinct aggregate and diagram View labels',()=>{
 const raw={sections:[{id:'intro',text:'Introduction'},{id:'story',heading:'Story',diagram:{nodes:{a:{}},rows:[['a']],layouts:[
  {id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}]}}]};
 const owner=ctx.tabViewOwners(ctx.normalize(raw))[0];assert.deepEqual(plain(ctx.tabViewDefinitions(owner).map(v=>v.name)),['Standard','Story · Standard']);
});
