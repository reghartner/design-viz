'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ctx=require('./workbench-command-context.cjs')(['graph','document','narrative','layout']);
const plain=v=>JSON.parse(JSON.stringify(v));
const fixture=()=>({sections:[{id:'intro',text:['Hello'],views:[{id:'standard',name:'Reading',presentation:'standard'}]},{id:'story',text:['Shared'],diagram:{nodes:{a:{title:'Original'}},rows:[['a']]},views:[{id:'standard',name:'Business',presentation:'standard'},{id:'data',name:'Data',presentation:'explore'}]}],opening:{section:'story',view:'data'}});
function plan(raw,section,id,action,value){const text=JSON.stringify(raw,null,2),r=ctx.planTabViewEdit(text,raw,section,id,action,value);assert.equal(r.error,undefined);assert.equal(JSON.stringify(raw,null,2),text);assert.deepEqual(plain(ctx.validate(ctx.normalize(JSON.parse(r.text))).errors),[]);return r;}
test('section-local IDs, prose, independent presentation and canonical paging order',()=>{
 const raw=fixture(),owner=ctx.tabViewOwners(raw)[0],defs=ctx.tabViewDefinitions(owner);
 assert.deepEqual(plain(defs.map(v=>[v.members[0].record.reference,v.id,v.presentation])),[['intro','standard','standard'],['story','standard','standard'],['story','data','explore']]);
 assert.equal(ctx.tabViewDefault(owner,defs),defs[2]);assert.equal(new Set(defs.map(v=>v.key)).size,3);assert.equal(defs[1].members[0].record.section,defs[2].members[0].record.section);
});
test('first visibility edit isolates implicit arrangements and duplicate isolates explicit arrangement',()=>{
 let raw=fixture(),r=plan(raw,1,'standard','visibility',false);raw=JSON.parse(r.text);const sec=raw.sections[1],business=sec.views[0],data=sec.views[1];
 assert.notEqual(business.layout,data.layout);assert.equal(ctx.sectionLayoutItems(sec.diagram,'default',business.layout).find(i=>!i.panel && !i.controls).hidden,true);assert.notEqual(ctx.sectionLayoutItems(sec.diagram,'default',data.layout).find(i=>!i.panel && !i.controls).hidden,true);
 r=plan(raw,1,'data','duplicate');const next=JSON.parse(r.text);assert.notEqual(next.sections[1].views[2].layout,data.layout);assert.deepEqual(next.sections[1].diagram.nodes,raw.sections[1].diagram.nodes);
});
test('rename/delete/move section and delete opening View repair opening without content duplication',()=>{
 let raw=fixture(),text=JSON.stringify(raw,null,2),r=ctx.planSetSectionIdentity(text,raw,1,'id','renamed');assert.equal(r.error,undefined);raw=JSON.parse(r.text);assert.equal(raw.opening.section,'renamed');
 r=ctx.planMoveSection(r.text,raw,1,-1);assert.equal(r.error,undefined);raw=JSON.parse(r.text);assert.equal(raw.opening.section,'renamed');
 r=plan(raw,0,'data','delete');raw=JSON.parse(r.text);assert.deepEqual(raw.opening,{section:'renamed',view:'standard'});assert.equal(raw.sections[0].defaultView,undefined);
 r=ctx.planDeleteSection(r.text,raw,0);assert.equal(r.error,undefined);raw=JSON.parse(r.text);assert.equal(raw.opening,undefined);assert.deepEqual(plain(ctx.validate(ctx.normalize(raw)).errors),[]);
});
test('conversion is deterministic, idempotent, preserves content and reports regrouping',()=>{
 const input={sections:[{id:'a',text:'A'},{id:'b',text:'B'}],views:[{id:'business',name:'Business',presentation:'standard',sections:['b','a']},{id:'data',name:'Data',presentation:'explore',sections:['a']}],defaultView:'business'},before=JSON.stringify(input);
 const one=ctx.migrateSectionViews(input),two=ctx.migrateSectionViews(input);assert.deepEqual(plain(one),plain(two));assert.equal(JSON.stringify(input),before);assert.deepEqual(plain(one.spec.opening),{section:'b',view:'business'});assert.equal(one.spec.sections[0].text,'A');assert.equal(one.spec.views,undefined);assert.match(one.report.changes.join(' '),/section order/);assert.deepEqual(plain(ctx.migrateSectionViews(one.spec).spec),plain(one.spec));assert.equal(ctx.migrateSectionViews(one.spec).report.changed,false);
});
test('conversion refuses unreferenced legacy content rather than adding pages or deleting content',()=>{
 const input={sections:[{id:'a',text:'A'},{id:'hidden',text:'Keep me'}],views:[{id:'one',name:'One',presentation:'standard',sections:['a']}]},before=JSON.stringify(input);
 assert.throws(()=>ctx.migrateSectionViews(input),/omitted from all legacy Views/);assert.equal(JSON.stringify(input),before);
});
test('malformed local View containers, mixed ownership and dangling openings fail validation',()=>{
 for(const mutate of [r=>r.sections[0].views=[],r=>r.sections[0].views=null,r=>r.sections[0].views[0]=null,r=>r.sections[0].views.push({...r.sections[0].views[0]}),r=>r.sections[0].defaultView='missing',r=>r.opening={section:'intro',view:'data'},r=>r.sections[0].views[0].layout='other',r=>r.views=[{id:'old',name:'Old',presentation:'standard',sections:['intro']}],r=>r.sections[0].views[0].sections=['story']]){const raw=fixture();mutate(raw);assert.ok(ctx.validate(raw).errors.length);}
});
test('offline conversion validates malformed input and retains named legacy arrangements and defaults',()=>{
 const {migrate}=require('../tools/migrate-section-views.cjs');
 for(const input of [null,{sections:{}},{sections:[null]},{sections:[{views:'wrong'}]}])assert.throws(()=>migrate(input),/Invalid spec/);
 const diagram={nodes:{a:{}},rows:[['a']],defaultLayout:'data',layouts:[{id:'business',name:'Business',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},{id:'data',name:'Data',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}]},input={sections:[{id:'intro',text:'Notes'},{id:'story',diagram}]};
 const result=migrate(input),section=result.spec.sections[1];assert.deepEqual(section.diagram,diagram);assert.equal(result.spec.opening.section,'story');assert.equal(section.views.find(v=>v.id===result.spec.opening.view).layout,'data');assert.ok(result.report.links.some(l=>l.legacyLayout==='data'));assert.deepEqual(migrate(result.spec).spec,result.spec);
});
test('offline dry-run preserves input bytes and output refuses overwrites',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'section-view-migration-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const input=path.join(dir,'input.json'),out=path.join(dir,'new.json'),source='{ "sections" : [{ "text": "Unchanged notes" }] }\n';fs.writeFileSync(input,source);
 const run=args=>spawnSync(process.execPath,['tools/migrate-section-views.cjs',input,...args],{encoding:'utf8'});
 let r=run(['--dry-run']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).changed,true);assert.equal(fs.readFileSync(input,'utf8'),source);assert.equal(fs.existsSync(out),false);
 r=run(['--output',out]);assert.equal(r.status,0,r.stderr);const written=JSON.parse(fs.readFileSync(out));assert.equal(written.sections[0].views[0].presentation,'standard');assert.equal(written.flowview.minVersion,'0.2.0');assert.ok(written.flowview.features.includes('document.section-views'));r=run(['--output',input]);assert.notEqual(r.status,0);assert.equal(fs.readFileSync(input,'utf8'),source);
 const invalid='{"flowview":{"minVersion":"invalid"},"sections":[{"text":"Keep me"}]}\n',rejected=path.join(dir,'rejected.json');fs.writeFileSync(input,invalid);r=run(['--output',rejected]);assert.notEqual(r.status,0);assert.match(r.stderr,/Invalid compatibility metadata/);assert.equal(fs.existsSync(rejected),false);assert.equal(fs.readFileSync(input,'utf8'),invalid);
});
test('explicit View rename preserves handwritten content bytes and invalid source is never published',()=>{
 const diagram='{"nodes" : {"a": {"title":"Keep spaces"}}, "rows":[["a"]]}',text='{\n "title" : "Keep title",\n "sections" : [{"id":"one", "text" : ["Keep prose"], "diagram" : '+diagram+'}]\n}\n';
 const raw=JSON.parse(text),r=ctx.planTabViewEdit(text,raw,0,'standard','name','Reading');assert.equal(r.error,undefined);assert.ok(r.text.includes('"diagram" : '+diagram));assert.ok(r.text.includes('"title" : "Keep title"'));assert.ok(r.text.includes('"text" : ["Keep prose"]'));assert.ok(r.text.endsWith('\n'));assert.equal(JSON.stringify(raw),JSON.stringify(JSON.parse(text)));
 const invalid=fixture();invalid.sections[1].views[0].presentation='invalid';const bad=ctx.planTabViewEdit(JSON.stringify(invalid),invalid,1,'standard','name','No');assert.ok(bad.error);assert.equal(bad.text,undefined);
});
test('bare diagrams convert and author with exact original content retained',()=>{
 const source='{ "nodes": {"a": {"title":"Bare"}}, "rows": [["a"]] }\n',raw=JSON.parse(source),r=ctx.planTabViewEdit(source,raw,0,'standard','name','Bare reader');assert.equal(r.error,undefined);const section=JSON.parse(r.text).sections[0];assert.deepEqual(section.diagram,raw);assert.equal(section.views[0].name,'Bare reader');assert.ok(r.text.includes(source.trimEnd()));assert.deepEqual(plain(ctx.migrateSectionViews(raw).spec.sections[0].diagram),raw);
});
test('offline conversion stamps new and migrated documents without dropping future declarations',()=>{
 const {migrate}=require('../tools/migrate-section-views.cjs'),C=require('../tools/canon/core.cjs').compatibility;
 const sources=[
  {page:{sections:[{id:'a',text:'A'}]}},
  {page:{contract:'1',flowview:{authoredWith:'0.1.0',minVersion:'0.1.0',features:[]},sections:[{id:'a',text:'A'}]}},
  {page:{contract:'1',flowview:{authoredWith:'9.0.0',minVersion:'9.0.0',features:['panel.future','document.tab-views'],companyField:'kept'},sections:[{id:'a',text:'A'}]}}
 ];
 for(const input of sources){
  const before=JSON.stringify(input),result=migrate(input),metadata=result.spec.page.flowview;
  assert.equal(JSON.stringify(input),before);assert.equal(result.spec.page.contract,'1');assert.equal(metadata.authoredWith,C.version);
  assert.ok(metadata.features.includes('document.section-views'));assert.equal(metadata.minVersion,input.page.flowview?.minVersion==='9.0.0'?'9.0.0':'0.2.0');
  assert.ok(C.check(result.spec,{version:'0.1.0',contract:'1',features:{}}).missingFeatures.includes('document.section-views'));
  for(const feature of input.page.flowview?.features || [])assert.ok(metadata.features.includes(feature));
  if(input.page.flowview?.companyField)assert.equal(metadata.companyField,'kept');
  assert.equal(result.report.changed,true);const again=migrate(result.spec);assert.deepEqual(again.spec,result.spec);assert.equal(again.report.changed,false);
 }
});
test('offline conversion reports compatibility-only changes and rejects malformed metadata without mutation',()=>{
 const {migrate}=require('../tools/migrate-section-views.cjs');
 const canonical={page:{sections:[{id:'a',text:'A',views:[{id:'standard',name:'Standard',presentation:'standard'}]}]}};
 const result=migrate(canonical);assert.equal(result.report.changed,true);assert.equal(result.report.changes.length,1);assert.match(result.report.changes[0],/compatibility metadata/);assert.deepEqual(result.spec.page.sections,canonical.page.sections);
 for(const metadata of ['bad',[],{authoredWith:'future'},{minVersion:2},{features:'document.section-views'},{features:['Bad Feature']}]){
  const input={page:{...canonical.page,flowview:metadata}},before=JSON.stringify(input);
  assert.throws(()=>migrate(input),/Invalid compatibility metadata: page.flowview/);assert.equal(JSON.stringify(input),before);
 }
});
