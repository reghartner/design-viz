'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');

function harness(){
  const c={URL,TextEncoder};vm.createContext(c);
  vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js',
    'workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/document.js','workbench/commands/clipboard.js',
    'workbench/io-model.js','workbench/commands/diagram-import.js','workbench/commands/extraction.js','workbench/session.js']),c);
  return c;
}
const plain=value=>JSON.parse(JSON.stringify(value));
const canon=id=>({version:1,id,kind:'canonical',owner:'group:default/transactions'});
function provider(){return {page:{title:'Provider',canon:canon('provider'),sections:[{id:'services',diagram:{
  nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store'}],
  topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}
}}]}};}
function importedDiagram(){return {
  topologyImports:[{spec:'provider',export:'core',as:'shared',nodes:['api','store'],edges:['api->store']}],
  nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'},{from:'b',to:'shared::api'}],
  steps:[{id:'local',edge:'a->b'},{id:'provider',edge:'shared::api->shared::store'}]
};}
function consumer(){return {page:{title:'Consumer',canon:canon('consumer'),sections:[
  {heading:'Imported story',diagram:importedDiagram()},
  {heading:'Local destination',diagram:{nodes:{keep:{title:'Keep'}},rows:[['keep']],edges:[]}}
]}};}
function contextFor(source){return {version:1,id:'consumer',specs:[provider(),source]};}
function sessionFor(c,source){
  let text=JSON.stringify(source,null,2),rendered,saved;
  const session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){rendered=session.resolve(JSON.parse(text));},
    persistence:{read:()=>({}),preserve(){},cancel(){},save:(value,baseline,artifacts)=>saved={value,baseline,artifacts}}});
  session.replaceProject(text,null,{topologyContext:contextFor(source)});
  return {session,get text(){return text;},get rendered(){return rendered;},get saved(){return saved;}};
}
function accept(c,source,makePlan){
  const state=sessionFor(c,source),snapshot=state.session.snapshot(),frozen=JSON.stringify(state.session.topologyContext());
  const plan=makePlan(state.text,snapshot.raw,state.session.validate);
  assert.equal(plan.error,undefined,plan.error);assert.equal(state.session.accept(plan,{snapshot}),true);
  assert.equal(JSON.stringify(state.session.topologyContext()),frozen);assert.equal(JSON.stringify(state.saved.artifacts.topologyContext),frozen);
  return {state,plan,authored:JSON.parse(state.text)};
}
function assertImportStaysAuthored(raw,index=0){
  const d=raw.page.sections[index].diagram;
  assert.deepEqual(plain(d.topologyImports),plain(importedDiagram().topologyImports));
  assert.equal(d.topologyProvenance,undefined);assert.equal(d.nodes['shared::api'],undefined);
}

test('object paste validates the authored transaction through the frozen topology context',()=>{
  const c=harness(),source=consumer(),data=c.builderClipboardCopy(source,[{kind:'node',section:1,id:'keep'}]).data,text=JSON.stringify(source,null,2);
  assert.match(c.planPasteBuilderClipboard(text,source,data,{section:0}).error,/unresolved topology declarations|missing node|unknown edge/);
  const {state,authored}=accept(c,source,(value,raw,validateSource)=>c.planPasteBuilderClipboard(value,raw,data,{section:0},validateSource));
  assertImportStaysAuthored(authored);assert.ok(authored.page.sections[0].diagram.nodes['keep-copy'] || authored.page.sections[0].diagram.nodes.keep);
  assert.ok(state.rendered.page.sections[0].diagram.nodes['shared::api']);
});

test('graph-only Add diagram validates the whole destination through frozen topology without making imports writable',()=>{
  const c=harness(),source=consumer(),incoming={nodes:{x:{title:'X'},y:{title:'Y'}},rows:[['x','y']],edges:[{from:'x',to:'y'}]},text=JSON.stringify(source,null,2);
  assert.match(c.planAddBuilderDiagram(text,source,incoming,0,1).error,/unresolved topology declarations|missing node|unknown edge/);
  const {plan,authored}=accept(c,source,(value,raw,validateSource)=>c.planAddBuilderDiagram(value,raw,incoming,0,1,null,validateSource));
  assertImportStaysAuthored(authored);assert.ok(plan.targets.every(target=>authored.page.sections[1].diagram.nodes[target.id]));assert.equal(authored.page.sections[0].diagram.nodes.x,undefined);
  assert.match(c.planAddBuilderDiagram(text,source,incoming,0,0,null,()=>({errors:[],warnings:[]})).error,/shared-topology canvas/);
});

test('independent extraction validates its parent through frozen topology and its standalone child normally',()=>{
  const c=harness(),source=consumer(),text=JSON.stringify(source,null,2),options={mode:'local',title:'Local domain'};
  assert.match(c.planExtractIndependentDiagram(text,source,0,['a','b'],options).error,/source validation errors/);
  const {state,plan,authored}=accept(c,source,(value,raw,validateSource)=>c.planExtractIndependentDiagram(value,raw,0,['a','b'],options,validateSource));
  assertImportStaysAuthored(authored);assert.equal(c.validate(c.normalize(plan.childSpec)).errors.length,0);
  assert.ok(state.rendered.page.sections[0].diagram.nodes['shared::api']);assert.ok(plan.childSpec.page.sections[0].diagram.nodes.a);
});

function tabbedConsumer(importIndex){
  const imported={label:'Imported',sections:[{heading:'Imported story',diagram:importedDiagram()}]};
  const local={label:'Local',sections:[{heading:'Local story',diagram:{nodes:{local:{title:'Local'}},rows:[['local']]}}]};
  const tabs=importIndex===0?[imported,local]:[local,imported];
  return {page:{title:'Tabbed consumer',canon:canon('consumer'),blocks:[{tabs}]}};
}
test('real + tab and imported-section duplication survive flat-ordinal shifts with or without the import before the edit',()=>{
  const c=harness();
  for(const importIndex of [0,1]){
    const source=tabbedConsumer(importIndex);
    const added=accept(c,source,(text,raw)=>c.planAddTab(text,raw,0,0));
    assert.equal(added.authored.page.blocks[0].tabs.length,3);assert.equal(added.state.rendered.page.blocks[0].tabs.length,3);
    const importedOrdinal=importIndex===0?0:1;
    const duplicated=accept(c,source,(text,raw)=>c.planDuplicateSection(text,raw,importedOrdinal));
    assert.equal(c.specSectionPaths(duplicated.authored).length,3);
    const importCopies=c.specSectionPaths(duplicated.authored).map(rec=>c.specValueAt(duplicated.authored,rec.diagram)).filter(d=>d && d.topologyImports);
    assert.equal(importCopies.length,2);assert.ok(importCopies.every(d=>!d.topologyProvenance && !d.nodes['shared::api']));
  }
});
