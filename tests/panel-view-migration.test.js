'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {migrate}=require('../tools/migrate-panel-views.cjs');
const c=require('./workbench-command-context.cjs')(['graph','layout']);
const plain=v=>JSON.parse(JSON.stringify(v));
const diagram=(type='homemap')=>({nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],panels:[{id:'main',type,title:'Scene'}],steps:[{id:'one',nodes:['a']},{id:'two',edge:'a->b'}],paths:[{id:'happy',name:'Happy',steps:['one','two']},{id:'alternate',name:'Alternate',steps:['one']}]});
function check(raw){const before=JSON.stringify(raw),result=migrate(raw);assert.equal(JSON.stringify(raw),before);assert.deepEqual(plain(c.validate(c.normalize(result.spec)).errors),[]);assert.deepEqual(migrate(result.spec).spec,result.spec);assert.equal(migrate(result.spec).report.changed,false);return result;}
test('every panel kind and retired focus flags leave one Standard View and the same opening',()=>{
 c.PanelRegistry.extend('probe',{layout:{focusByDefault:true,focusLabel:'Special',large:true,height:12}});
 for(const panels of [[],[{id:'main',type:'homemap'}],[{id:'main',type:'data-contract'}],[{id:'main',type:'probe'}],[{id:'main',type:'homemap'},{id:'other',type:'homemap'}]]){
  const d={...diagram(),panels,primaryPanel:'main'},owner=c.tabViewOwners(c.normalize(d))[0],views=c.tabViewDefinitions(owner);
  assert.deepEqual(plain(views.map(v=>[v.id,v.name])),[['standard','Standard']]);assert.equal(c.tabViewDefault(owner,views).id,'standard');
  const p=c.planSectionViewPresentation(JSON.stringify(d),d,0,'flow','explore');assert.ok(!p.error,p.error);assert.equal(JSON.parse(p.text).layouts.length,1);
  assert.ok(c.planSectionViewPresentation(JSON.stringify(d),d,0,'home','explore').error);
 }
});
test('bare focus diagrams become explicit shared section Views, preserving opening, links and story',()=>{
 for(const type of ['homemap','data-contract','screen'])for(const primary of [false,true]){
  const raw=diagram(type);if(primary)raw.primaryPanel='main';
  const {spec,report}=check(raw);
  if(type==='screen' && !primary){assert.deepEqual(spec,raw);assert.equal(report.changed,false);continue;}
  const d=spec.sections[0].diagram;assert.equal(d.primaryPanel,undefined);assert.deepEqual(d.layouts.map(v=>v.id),['home','flow']);
  assert.equal(d.defaultLayout,primary?'home':'flow');assert.equal(spec.defaultView,primary?'section-1-home':'section-1-flow');
  assert.equal(d.layouts[0].sectionLayout.default.find(t=>!t.panel && !t.controls).hidden,true);
  assert.equal(d.layouts[1].sectionLayout.default.find(t=>!t.panel && !t.controls).hidden,undefined);
  for(const key of ['nodes','rows','edges','panels','steps','paths'])assert.deepEqual(d[key],raw[key]);
  assert.ok(report.links.filter(link=>link.kind==='view-id').every(link=>link.from===link.to));assert.equal(spec.sections.length,1);
 }
});
test('existing named arrangements and host profiles remain exact while retired fields disappear',()=>{
 const raw=diagram();raw.primaryPanel='main';raw.layouts=[{id:'authored',name:'Authored',presentation:'explore',sectionLayout:{columns:24,default:[{x:1,y:3,w:15,h:7}],confluence:[{panel:'main',x:0,y:0,w:24,h:12}]},exploreLayout:{camera:{x:2,y:3,zoom:1}},steps:['one']}];raw.defaultLayout='authored';
 const {spec}=check({page:{sections:[{id:'story',diagram:raw}],views:[{id:'kept',name:'Kept',presentation:'explore',sections:[{section:'story',layout:'authored'}]}],defaultView:'kept'}});
 assert.deepEqual(spec.page.sections[0].diagram.layouts,raw.layouts);assert.equal(spec.page.sections[0].diagram.defaultLayout,'authored');assert.equal(spec.page.defaultView,'kept');
});
test('canonical legacy references and geometry-only profiles gain real arrangements without changing View identity',()=>{
 for(const focus of [true,false]){
  const d=diagram();if(!focus)d.panels=[];d.sectionLayout={columns:24,default:[{x:2,y:4,w:20,h:13}],backstage:[{x:0,y:0,w:24,h:8}],confluence:[{x:0,y:2,w:24,h:10}]};
  const raw={sections:[{id:'s',diagram:d}],views:[{id:'flow-link',name:'Flow',presentation:'standard',sections:[{section:'s',layout:'flow'}]}],defaultView:'flow-link'};
  if(focus)raw.views.push({id:'home-link',name:'Scene',presentation:'standard',sections:[{section:'s',layout:'home'}]});
  const {spec}=check(raw);assert.deepEqual(spec.views,raw.views);assert.equal(spec.defaultView,raw.defaultView);assert.deepEqual(spec.sections[0].diagram.layouts.find(v=>v.id==='flow').sectionLayout,d.sectionLayout);
 }
});
test('multiple sections and Tabs preserve ownership, multiple maps, defaults and existing arrangements',()=>{
 const one=diagram();one.primaryPanel='main';one.panels.push({id:'second',type:'homemap'});
 const two=diagram('screen');two.primaryPanel='main';
 const raw={page:{blocks:[{tabs:[{label:'First',sections:[{heading:'Intro',text:'Notes'},{id:'one',diagram:one},{id:'plain',diagram:{nodes:{a:{}},rows:[['a']]}}]},{label:'Second',sections:[{id:'two',diagram:two}],views:[{id:'existing',name:'Existing',presentation:'standard',sections:[{section:'two',layout:'home'}]}],defaultView:'existing'}]}]}};
 const {spec}=check(raw),tabs=spec.page.blocks[0].tabs;
 assert.equal(tabs[0].defaultView,'standard');assert.equal(tabs[0].views.length,3);assert.deepEqual(tabs[1].views,raw.page.blocks[0].tabs[1].views);assert.equal(tabs[1].defaultView,'existing');assert.equal(tabs[0].sections[1].diagram.panels.length,2);
});
test('missing aliases alongside explicit arrangements append only required geometry and preserve defaults',()=>{
 const d=diagram();d.layouts=[{id:'custom',name:'Custom',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}}];d.defaultLayout='custom';
 const raw={sections:[{id:'s',diagram:d}],views:[{id:'legacy',name:'Legacy',presentation:'standard',sections:[{section:'s',layout:'home'}]}]};
 const {spec}=check(raw);assert.deepEqual(spec.sections[0].diagram.layouts[0],d.layouts[0]);assert.deepEqual(spec.sections[0].diagram.layouts.map(v=>v.id),['custom','home']);assert.equal(spec.sections[0].diagram.defaultLayout,'custom');
});
test('CLI checks without writes, refuses invalid input and never overwrites source or existing output',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panel-views-')),input=path.join(dir,'in.json'),output=path.join(dir,'out.json');
 try{
  const text=JSON.stringify(diagram());fs.writeFileSync(input,text);
  const run=(...args)=>cp.spawnSync(process.execPath,['tools/migrate-panel-views.cjs',input,...args],{encoding:'utf8'});
  assert.equal(run('--check').status,0);assert.equal(fs.existsSync(output),false);
  assert.equal(run('--output',output).status,0);const saved=fs.readFileSync(output,'utf8');
  assert.equal(run('--output',output).status,1);assert.equal(run('--output',input).status,1);assert.equal(fs.readFileSync(input,'utf8'),text);assert.equal(fs.readFileSync(output,'utf8'),saved);
  fs.writeFileSync(input,'{"nodes":{},"rows":[],"steps":[{"edge":"missing->x"}]}');assert.equal(run('--output',path.join(dir,'invalid.json')).status,1);assert.equal(fs.existsSync(path.join(dir,'invalid.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('geometry aliases and legacy fragment shortcuts have explicit link mappings',()=>{
 for(const alias of ['layout','default']){
  const d=diagram();d.primaryPanel='main';d.sectionLayout={default:[{x:0,y:0,w:12,h:9}]};
  const raw={sections:[{id:'story',diagram:d}],views:[{id:'kept',name:'Kept',presentation:'standard',sections:[{section:'story',layout:alias}]}]};
  const {spec,report}=check(raw);assert.equal(spec.views[0].sections[0].layout,'flow');assert.ok(report.links.some(l=>l.from===alias && l.to==='flow'));
 }
 const {report}=check(diagram());assert.ok(report.links.some(l=>l.kind==='fragment-view' && l.from==='home' && l.to==='section-1-home'));assert.ok(report.links.some(l=>l.kind==='fragment-view' && l.from==='flow' && l.to==='section-1-flow'));
});

test('detail-only owners materialize arrangements without inventing empty Views',()=>{
 for(const explicit of [true,false]){
  const detail={id:'detail',diagram:diagram()};if(explicit)detail.detailOnly=true;
  const main={id:'main',diagram:{nodes:{a:{title:'A'}},rows:[['a']]}};if(!explicit)main.diagram.nodes.a.detail={section:'detail'};
  const raw={blocks:[detail,{tabs:[{label:'Main',sections:[main]}]}]};
  const {spec}=check(raw);assert.equal(spec.views,undefined);assert.equal(spec.defaultView,undefined);assert.equal(spec.blocks[0].diagram.layouts.length,2);assert.deepEqual(spec.blocks[1],raw.blocks[1]);
 }
});
