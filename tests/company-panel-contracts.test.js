'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load,check}=require('./helpers/company-panel-contracts.cjs');
const {scratch}=require('./helpers/company-panel-fixture.cjs');
const actual=load();
for(const entry of actual.entries)test('company panel contract: '+entry.type+' ('+entry.source+')',()=>check(entry,actual.context));
test('automatic panel discovery and headless contracts run in a real scratch fork even with an empty upstream overlay',()=>{
 const root=scratch();
 try{
  const loaded=load(root);assert.equal(loaded.entries.length,9);
  for(const entry of loaded.entries)check(entry,loaded.context);
  const entry=loaded.entries[0],file=path.join(root,entry.source);
  // Add a new, unlisted type: discovery must pick it up without suite edits.
  fs.writeFileSync(path.join(root,'company/panels/types/contract-added.js'),"contractFixture('contract-added','responsive');");
  assert.ok(load(root).entries.some(e=>e.type==='contract-added'));
  const exampleDir=path.join(root,'company/examples/fallback');fs.mkdirSync(exampleDir,{recursive:true});
  fs.writeFileSync(path.join(exampleDir,'sample.spec.json'),JSON.stringify({nodes:{},rows:[[]],panels:[{id:'sample',type:'contract-added'}]}));
  fs.writeFileSync(path.join(root,'company/panels/types/contract-added.js'),"PanelRegistry.define('contract-added',{render:function(){return {html:'<p>Example</p>'};}});");
  const fallback=load(root),exampleOnly=fallback.entries.find(e=>e.type==='contract-added');
  assert.equal(exampleOnly.samples.length,1);check(exampleOnly,fallback.context);
  for(const [source,rule] of [
   ["PanelRegistry.define('"+entry.type+"',{render:function(){},authoring:{template:{}},fold:function(p){p.initial={changed:true};return [{}];}});",/nonmutating fold/],
   ["PanelRegistry.define('"+entry.type+"',{render:function(){},authoring:{template:{}},validateDeclaration:function(p){p.changed=true;}});",/nonmutating validation/],
   ["PanelRegistry.define('"+entry.type+"',{render:function(){},authoring:{template:{}},layout:{canvasSizing:{mode:'fixed-aspect',aspect:0}}});",/canvasSizing.aspect/],
   ["PanelRegistry.define('"+entry.type+"',{render:function(){}});",/sample|template/],
   ["var contractCounter=0;PanelRegistry.define('"+entry.type+"',{render:function(){},authoring:{template:{}},fold:function(){return [{count:++contractCounter}];}});",/deterministic fold/],
   ["var contractCounter=0;PanelRegistry.define('"+entry.type+"',{render:function(){},authoring:{template:{}},validateDeclaration:function(p,path,warnings){warnings.push(String(++contractCounter));}});",/deterministic validation/],
   ["PanelRegistry.define('"+entry.type+"',{authoring:{template:{}}});",/renderer/],
   ["PanelRegistry.define('"+entry.type+"',{render:function(){},authoring:{template:{}},validateDeclaration:function(p,path,warnings,errors){errors.push('invalid sample');}});",/validates/],
   ['document.createElement("div");',/DOM-free/]
  ]){
   fs.writeFileSync(file,source);
   assert.throws(()=>{const broken=load(root);check(broken.entries.find(e=>e.type===entry.type),broken.context);},rule);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
