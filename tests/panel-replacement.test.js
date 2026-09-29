const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['graph']);
const plain=value=>JSON.parse(JSON.stringify(value));
const fixture=()=>({page:{blocks:[{heading:'Keep',text:['Unchanged']},{tabs:[{label:'Operations',sections:[{heading:'Flow',diagram:{
 nodes:{n:{title:'Node'}},rows:[['n']],primaryPanel:'p',future:{keep:true},
 panels:[{id:'p',type:'queue',title:'Work waiting',visible:false,initial:{state:'full'},futureSetup:{keepInBackup:true}},{id:'keep',type:'gauge',initial:{value:9}}],
 steps:[{id:'shared',text:'Shared',nodes:['n'],panels:{p:{state:'full',futurePatch:true},keep:{value:5}},panelVisibility:{p:true}},
  {id:'alternate',text:'Alternative',nodes:['n'],patch:{p:{state:'empty'},keep:{value:7}},panelVisibility:{p:false}},
  {id:'dormant',text:'Dormant alias',nodes:['n'],panels:{p:{state:'processing'}},patch:{p:{old:true},keep:{value:99}}}],
 paths:[{id:'happy',label:'Happy path',steps:['shared','dormant']},{id:'failure',label:'Failure path',steps:['shared','alternate']}],
 layouts:[{id:'overview',name:'Overview',presentation:'explore',sectionLayout:{default:[{panel:'p',x:0,y:0,w:6,h:8},{panel:'keep',x:6,y:0,w:6,h:8}]},exploreLayout:{panels:[{panel:'p',x:20,y:30,w:300,h:250}]}}]
}}]}]}]}});
const diagram=raw=>raw.page.blocks[1].tabs[0].sections[0].diagram;
test('replacement seeds the destination and preserves identity, visibility, layouts and unrelated bytes',()=>{
 const raw=fixture(),source=JSON.stringify(raw,null,3),original=plain(raw),path=Array.from(C.specSectionPaths(raw)[1].diagram);
 const loc=C.jsonLocate(source,path),plan=C.planReplacePanel(source,raw,1,0,'timeline');assert.equal(plan.error,undefined);
 const next=JSON.parse(plan.text),d=diagram(next),expected=plain(C.panelAuthoring('timeline').template);
 Object.assign(expected,{id:'p',type:'timeline',title:'Work waiting',visible:false});assert.deepEqual(d.panels[0],expected);
 assert.deepEqual(next.page.blocks[0],raw.page.blocks[0]);assert.deepEqual(d.panels[1],diagram(raw).panels[1]);
 assert.deepEqual(d.layouts,diagram(raw).layouts);assert.equal(d.primaryPanel,'p');assert.deepEqual(d.future,{keep:true});
 const nextLoc=C.jsonLocate(plan.text,path);assert.equal(plan.text.slice(0,nextLoc.start),source.slice(0,loc.start));assert.equal(plan.text.slice(nextLoc.end),source.slice(loc.end));
 assert.deepEqual(plain(plan.replacement.removedFields),['initial','futureSetup']);assert.deepEqual(plain(plan.replacement.original),diagram(raw));assert.deepEqual(raw,original);
});
test('all shared, independent and dormant step overrides are reviewed and removed without activating aliases',()=>{
 const raw=fixture(),plan=C.planReplacePanel(JSON.stringify(raw),raw,1,0,'timeline'),d=diagram(JSON.parse(plan.text));
 assert.deepEqual(d.paths,diagram(raw).paths);assert.deepEqual(d.steps[0].panels,{keep:{value:5}});assert.deepEqual(d.steps[1].patch,{keep:{value:7}});
 assert.deepEqual(d.steps[2].panels,{});assert.deepEqual(d.steps[2].patch,{keep:{value:99}});assert.deepEqual(plain(C.stepPanelPatch(d.steps[2])),{});
 assert.deepEqual(d.steps.map(s=>s.panelVisibility),diagram(raw).steps.map(s=>s.panelVisibility));
 assert.equal(plan.replacement.steps.length,3);assert.deepEqual(plain(plan.replacement.steps[0].paths),['Happy path','Failure path']);
 assert.match(plan.replacement.steps[0].fields[0],/futurePatch/);assert.equal(plan.replacement.steps[2].fields.length,2);
});
test('branding survives only compatible destinations and instantiate respects story time',()=>{
 const raw={nodes:{n:{}},rows:[['n']],storyTime:{start:'2026-09-24T22:30'},panels:[{id:'p',type:'screen',title:'Device',brand:{app:'Acme',icon:'cloud'},scene:'old',initial:{mode:'on'}}]};
 const phone=C.planReplacePanel(JSON.stringify(raw),raw,0,0,'phone');assert.equal(phone.error,undefined);
 const p=JSON.parse(phone.text).panels[0];assert.deepEqual(p.brand,raw.panels[0].brand);assert.equal(p.initial.clock,undefined);assert.equal(p.scene,undefined);
 const queue=C.planReplacePanel(JSON.stringify(raw),raw,0,0,'queue');assert.equal(JSON.parse(queue.text).panels[0].brand,undefined);assert.ok(queue.replacement.removedFields.includes('brand'));
});
test('incompatible control attachments detach in all profiles without losing geometry or centerpiece',()=>{
 const raw={nodes:{},rows:[[]],panels:[{id:'home',type:'homemap',title:'Home'}],primaryPanel:'home',sectionLayout:{default:[{panel:'home',x:0,y:0,w:12,h:12},{controls:'steps',attachTo:'panel:home',x:0,y:12,w:12,h:5}]},layouts:[{id:'v',name:'View',sectionLayout:{backstage:[{panel:'home',x:0,y:0,w:12,h:12},{controls:'steps',attachTo:'panel:home',x:0,y:12,w:12,h:5}]}}]};
 const plan=C.planReplacePanel(JSON.stringify(raw),raw,0,0,'queue');assert.equal(plan.error,undefined);const next=JSON.parse(plan.text);
 assert.equal(next.primaryPanel,'home');assert.deepEqual(next.sectionLayout.default[1],{controls:'steps',x:0,y:12,w:12,h:5});
 assert.equal(next.layouts[0].sectionLayout.backstage[1].attachTo,undefined);assert.equal(plan.replacement.detached.length,2);
 assert.deepEqual(next.sectionLayout.default[0],raw.sectionLayout.default[0]);
});
test('every registered replacement is seeded with a valid template and malformed targets refuse publication',()=>{
 for(const type of C.PanelRegistry.types().filter(type=>C.panelAuthoring(type).picker)){
  const raw={nodes:{},rows:[[]],panels:[{id:'p',type:type==='queue'?'log':'queue',title:'Keep'}]};
  const plan=C.planReplacePanel(JSON.stringify(raw),raw,0,0,type);assert.equal(plan.error,undefined,type);
  assert.deepEqual(plain(C.validate(C.normalize(JSON.parse(plan.text))).errors),[],type);
 }
 const raw=fixture(),source=JSON.stringify(raw);
 for(const [section,index,type] of [[1,0,'queue'],[1,0,'missing'],[1,9,'phone'],[9,0,'phone']])assert.ok(C.planReplacePanel(source,raw,section,index,type).error);
 diagram(raw).panels[1].id='p';assert.ok(C.planReplacePanel(JSON.stringify(raw),raw,1,0,'phone').error);
});
