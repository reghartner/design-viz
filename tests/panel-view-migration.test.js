'use strict';
/* #677 contract matrix (topology-importing specs; ticket "Fix direction" + Chuck's ruling: extend this file).
   row | fixture | scoped assertion | rejects
   1 provider-backed check passes | examples/canon/topology/checkout.json + platform.json | migrate(spec,{providers}) returns, report.changed false, spec deepEqual input | impl that validates the unresolved spec (throws "Invalid input")
   2 authored imports kept, nothing materialized into output | same | spec diagram.topologyImports deepEqual input, no "platform::" node keys | impl that migrates the pre-resolved spec
   3 focus panel under imports gains arrangements | checkout + homemap panel 'main' + second import from provider 'audit' (platform copy) | diagram.layouts ids ['home','flow'], topologyImports kept, output materializes with provider and validates clean, rerun unchanged | impl that skips migration for topology sections
   4 inputs never mutated | rows 1 and 3 | JSON of spec and provider identical before/after | in-place materialization
   5 missing provider refused with the resolution error | checkout without provider | throws /missing spec platform/ | impl that drops the unresolved-topology error
   6 CLI --provider is repeatable | row 3 fixture + platform.json + audit provider file | --check with both exit 0; either provider alone exit 1; --output writes authored spec (topologyImports kept); without --provider exit 1, no output file; --provider without a value exit 1 | CLI with no provider option, or one that keeps only the first/last --provider */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {migrate}=require('../tools/migrate-panel-views.cjs'),core=require('../tools/canon/core.cjs');
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

test('topology-importing specs migrate with authored providers and keep their imports',()=>{
 const checkoutFile='examples/canon/topology/checkout.json',platformFile='examples/canon/topology/platform.json';
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),checkout=read(checkoutFile),platform=read(platformFile),imports=checkout.page.sections[0].diagram.topologyImports;
 assert.ok(imports.length && Object.keys(checkout.page.sections[0].diagram.nodes).every(id=>!id.includes('::')),'fixture must import its platform nodes');
 const run=(raw,providers)=>{const before=JSON.stringify([raw,providers]),result=migrate(raw,{providers});assert.equal(JSON.stringify([raw,providers]),before);return result;};
 const plainResult=run(checkout,[platform]);
 assert.equal(plainResult.report.changed,false);assert.deepEqual(plainResult.spec,checkout);
 const audit=plain(platform);audit.page.canon.id='audit';audit.page.title='Audit';
 const focused=plain(checkout);focused.page.sections[0].diagram.panels=[{id:'main',type:'homemap',title:'Map'}];focused.page.sections[0].diagram.topologyImports.push({spec:'audit',export:'core',as:'audit'});
 const focusedImports=plain(focused.page.sections[0].diagram.topologyImports);
 const {spec,report}=run(focused,[platform,audit]),d=spec.page.sections[0].diagram;
 assert.equal(report.changed,true);assert.deepEqual(d.layouts.map(v=>v.id),['home','flow']);assert.deepEqual(d.topologyImports,focusedImports);
 assert.deepEqual(Object.keys(d.nodes),['client']);
 const resolved=core.materializeTopology([spec,platform,audit])[0];assert.ok(resolved.page.sections[0].diagram.nodes['platform::api'] && resolved.page.sections[0].diagram.nodes['audit::api']);
 assert.deepEqual(plain(c.validate(c.normalize(resolved)).errors),[]);
 assert.equal(run(spec,[platform,audit]).report.changed,false);
 assert.throws(()=>migrate(checkout),/missing spec platform/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panel-views-topology-')),input=path.join(dir,'in.json'),output=path.join(dir,'out.json'),auditFile=path.join(dir,'audit.json');
 try{
  fs.writeFileSync(input,JSON.stringify(focused));fs.writeFileSync(auditFile,JSON.stringify(audit));
  const cli=(...args)=>cp.spawnSync(process.execPath,['tools/migrate-panel-views.cjs',input,...args],{encoding:'utf8'});
  const checked=cli('--check','--provider',platformFile,'--provider',auditFile);assert.equal(checked.status,0,checked.stderr);assert.equal(fs.existsSync(output),false);
  assert.equal(cli('--output',path.join(dir,'none.json')).status,1);assert.equal(fs.existsSync(path.join(dir,'none.json')),false);
  assert.equal(cli('--check','--provider',platformFile).status,1);assert.equal(cli('--check','--provider',auditFile).status,1);
  assert.equal(cli('--check','--provider').status,1);
  const written=cli('--output',output,'--provider',platformFile,'--provider',auditFile);assert.equal(written.status,0,written.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),spec);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
