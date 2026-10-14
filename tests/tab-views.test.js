'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
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

function topologyViewsHarness(){
 const context={URL,TextEncoder};vm.createContext(context);vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/layout.js','workbench/session.js']),context);return context;
}
function topologyViewsFixture(){
 const canon=id=>({version:1,id,kind:'canonical',owner:'group:default/views'});
 const provider={page:{title:'Provider',canon:canon('provider'),sections:[{id:'services',diagram:{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}}}]}};
 const consumer={page:{title:'Consumer',canon:canon('consumer'),sections:[{id:'story',diagram:{topologyImports:[{spec:'provider',export:'core',as:'shared',nodes:['api','store'],edges:['api->store']}],nodes:{client:{title:'Client'}},rows:[['client']],edges:[{from:'client',to:'shared::api'}],steps:[{id:'request',edge:'client->shared::api'},{id:'store',edge:'shared::api->shared::store'}]}}],views:[{id:'main',name:'Main',presentation:'standard',sections:['story']}],defaultView:'main'}};
 return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
test('New View and Duplicate View validate through frozen imported topology and commit one authored transaction',()=>{
 const c=topologyViewsHarness();
 for(const action of ['create','duplicate']){
  const fixture=topologyViewsFixture(),original=JSON.stringify(fixture.consumer,null,2),frozen=JSON.stringify(fixture.context);let text=original,preview,saved;
  const session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},persistence:{read:()=>({}),preserve(){},cancel(){},save:(source,baseline,artifacts)=>saved={source,baseline,artifacts}},render(){preview=session.resolve(JSON.parse(text));}});
  session.replaceProject(original,null,{topologyContext:fixture.context});const snapshot=session.snapshot();
  const plan=c.planTabViewEdit(text,snapshot.raw,0,'main',action,undefined,session.validate);
  assert.equal(plan.error,undefined,action);assert.equal(session.accept(plan,{snapshot}),true,action);
  const authored=JSON.parse(text),diagram=authored.page.sections[0].diagram;
  assert.equal(authored.page.views.length,2);assert.deepEqual(plain(diagram.topologyImports),plain(fixture.consumer.page.sections[0].diagram.topologyImports));
  assert.deepEqual(Object.keys(diagram.nodes),['client']);assert.equal(diagram.topologyProvenance,undefined);
  const rendered=preview.page.sections[0].diagram;assert.ok(rendered.nodes['shared::api']);assert.ok(rendered.edges.some(edge=>edge.from==='shared::api' && edge.to==='shared::store'));
  assert.equal(JSON.stringify(session.topologyContext()),frozen);assert.equal(JSON.stringify(saved.artifacts.topologyContext),frozen);
  assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
 }
});
test('View edits still reject unresolved or invalid imported topology without publishing a candidate',()=>{
 const c=topologyViewsHarness(),fixture=topologyViewsFixture(),text=JSON.stringify(fixture.consumer,null,2);
 const disconnected=c.planTabViewEdit(text,fixture.consumer,0,'main','duplicate');
 assert.match(disconnected.error,/unresolved topology declarations/);assert.equal(disconnected.text,undefined);
 let source=text;const session=c.createBuilderSession({source:{read:()=>source,write:value=>source=value},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){}});
 const missing={...fixture.context,specs:[fixture.consumer]};session.replaceProject(text,null,{topologyContext:missing});
 const invalid=c.planTabViewEdit(text,fixture.consumer,0,'main','create',undefined,session.validate);
 assert.match(invalid.error,/missing spec provider/);assert.equal(invalid.text,undefined);
});

test('default geometry never adds or renames Views, including after Arrange and JSON reload',()=>{
 for(const explicit of [false,true]){
  const raw={sections:[{id:'story',diagram:{nodes:{a:{title:'A'}},rows:[['a']]}}]};
  if(explicit)raw.views=[{id:'reading',name:'Standard',presentation:'standard',sections:['story']}];
  const choices=value=>{const owner=ctx.tabViewOwners(ctx.normalize(value))[0];return plain(ctx.tabViewDefinitions(owner).map(v=>[v.id,v.name]));};
  const before=choices(raw);
  const result=ctx.planSectionLayout(JSON.stringify(raw),raw,0,'default',[{x:0,y:2,w:24,h:18}]);assert.ok(!result.error,result.error);
  const saved=JSON.parse(result.text);assert.deepEqual(choices(saved),before);
  assert.deepEqual(plain(ctx.diagramLayoutViews(saved.sections[0].diagram)),[]);
  assert.deepEqual(plain(ctx.sectionLayoutItems(saved.sections[0].diagram,'default')),[{x:0,y:2,w:24,h:18}]);
  assert.equal(saved.sections[0].diagram.layouts,undefined);
  assert.deepEqual(plain(ctx.validate(ctx.normalize(saved)).errors),[]);
 }
});
test('default placement retains existing Home/Data flow choices and compatibility member references',()=>{
 const raw={sections:[{id:'story',diagram:{nodes:{a:{}},rows:[['a']],primaryPanel:'home',panels:[{id:'home',type:'homemap',title:'Home'}]}}]};
 const choices=()=>{const o=ctx.tabViewOwners(ctx.normalize(raw))[0],v=ctx.tabViewDefinitions(o);return plain([v.map(v=>[v.id,v.name]),ctx.tabViewDefault(o,v).id]);};
 const before=choices();raw.sections[0].diagram.sectionLayout={default:[{x:0,y:0,w:12,h:12}]};assert.deepEqual(choices(),before);
 for(const layout of ['layout','default']){
  raw.views=[{id:'reading',name:'Standard',presentation:'standard',sections:[{section:'story',layout}]}];
  assert.deepEqual(plain(ctx.validate(ctx.normalize(raw)).errors),[]);
 }
 raw.sections[0].diagram.layouts=[{id:'named',name:'Named',sectionLayout:raw.sections[0].diagram.sectionLayout}];
 assert.ok(ctx.validate(ctx.normalize(raw)).errors.some(e=>e.includes('.layout')));
});
test('presentation promotion keeps geometry-only diagrams to one Standard arrangement',()=>{
 const d={nodes:{a:{}},rows:[['a']],sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]}};
 const result=ctx.planSectionViewPresentation(JSON.stringify(d),d,0,'flow','explore');assert.ok(!result.error,result.error);
 const saved=JSON.parse(result.text);assert.deepEqual(saved.layouts.map(v=>v.name),['Standard']);assert.deepEqual(saved.layouts[0].sectionLayout,d.sectionLayout);
});
test('upstream perspective migrations retain every original profile and both deliberate choices',()=>{
 for(const expected of require('./fixtures/legacy-section-layouts.cjs')){
  const raw=JSON.parse(fs.readFileSync(expected.file,'utf8')),page=ctx.normalize(raw);
  assert.deepEqual(plain(ctx.validate(page).errors),[]);
  const d=ctx.sectionRecords(page).map(r=>r.section.diagram).find(d=>d && d.layouts?.some(v=>v.name===expected.name));assert.ok(d,expected.name);
  assert.equal(d.defaultLayout,'layout');assert.deepEqual(d.layouts.map(v=>[v.id,v.name]),[['layout',expected.name],['flow','Data flow']]);
  assert.deepEqual(d.layouts[0].sectionLayout,expected.profiles);assert.equal(d.sectionLayout,undefined);
 }
});
