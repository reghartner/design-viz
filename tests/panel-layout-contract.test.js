'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function core(){
  const context = {URL, TextEncoder};
  for (const name of ['validator','engine','builder.workbench','layout.workbench','confluence','clipboard.workbench'])
    vm.runInNewContext(readSource(name + '.js'), context);
  return context;
}
function diagram(panels){
  return {nodes:{node:{}},rows:[['node']],panels,steps:[{nodes:['node']}]};
}

test('panel capabilities preserve primary sizing priority and legacy missing-tile heights', () => {
  const c = core();
  const d = diagram(['homemap','deviceapp','phone','screen','state'].map(type => ({id:type,type})));
  for (const target of ['default','backstage','confluence']){
    for (const primaryPanel of [undefined,'phone','screen','deviceapp']){
      const sizes = Object.fromEntries(c.sectionLayoutPreset({...d,primaryPanel},target).filter(t => t.panel).map(t => [t.panel,t.h]));
      assert.deepEqual(sizes,{homemap:12,deviceapp:23,phone:primaryPanel==='phone'?12:10,screen:primaryPanel==='screen'?12:8,state:6});
    }
    const legacy = c.sectionLayoutItems({...d,sectionLayout:{default:[]}},target);
    assert.deepEqual(plain(legacy.map(tile => tile.h)),[12,12,6,6,6,6]);
  }
});

test('a registered layout capability opts into focus, controls and saved-layout fallback', () => {
  const c = core();
  c.PanelRegistry.extend('layout-contract-probe', {layout:{focusByDefault:true,focusLabel:'Topology',attachControls:true,large:true,height:17,fallbackHeight:9,supporting:false}});
  const panel = {id:'probe',type:'layout-contract-probe',title:'Authored title'};
  const d = diagram([{id:'state',type:'state'},panel]);
  assert.equal(c.diagramFocusPanel(d),panel);
  assert.equal(c.diagramFocusPanel({...d,primaryPanel:'state'}).id,'state');
  const optimized = c.sectionLayoutOptimize({...d,primaryPanel:'probe'},'default',null);
  assert.equal(optimized.find(t => t.controls).attachTo,'panel:probe');
  const saved = {default:[{panel:'probe',x:0,y:0,w:12,h:17},{controls:'steps',x:0,y:17,w:12,h:4,attachTo:'panel:probe'}]};
  const warnings = [];
  c.sectionLayoutProfileWarnings(d,saved,'diagram',warnings);
  assert.deepEqual(warnings,[]);
  assert.equal(c.sectionLayoutItems({...d,sectionLayout:saved},'default').find(t => t.controls).attachTo,'panel:probe');
  assert.equal(c.sectionLayoutItems({...d,sectionLayout:{default:[]}},'default').find(t => t.panel==='probe').h,9);
  const hidden = c.sectionLayoutOptimize({...d,primaryPanel:'probe'},'default',[{panel:'probe',x:0,y:0,w:12,h:17,hidden:true}]);
  assert.equal(hidden.find(t => t.panel==='probe').hidden,true);
  assert.notEqual(c.sectionLayoutDock(hidden),'panel:probe');

  const buttons = [], group = {setAttribute(){},appendChild(button){buttons.push(button);}};
  c.document = {createElement(){return {setAttribute(){},addEventListener(){}};}};
  c.createDiagramFocusControl({viewChoicesHost:group},panel,null,null,null);
  assert.deepEqual(buttons.map(button => button.textContent),['Topology','Data flow']);
});

test('Confluence preferred focus and clipboard references use a new panel definition', () => {
  const c = core();
  c.PanelRegistry.extend('reference-contract-probe', {layout:{focusByDefault:true},references:{nodes:['links.*.source']}});
  const panel = {id:'probe',type:'reference-contract-probe',links:[{source:'node'},{source:'missing'}]};
  const raw = {page:{sections:[{diagram:diagram([panel])}]}},before = JSON.stringify(raw);
  const focused = c.confluenceDisplayPage(raw.page,{section:'all',focus:'home',skin:'spec'});
  assert.equal(focused.sections[0].diagram.primaryPanel,'probe');
  const copied = c.builderClipboardCopy(raw,[{kind:'panel',section:0,index:0}]);
  assert.equal(copied.error,undefined);
  const pasted = c.planPasteBuilderClipboard(before,raw,copied.data,{section:0});
  assert.equal(pasted.error,undefined);
  const panels = JSON.parse(pasted.text).page.sections[0].diagram.panels;
  assert.deepEqual(panels[1].links,[{source:'node'},{}]);
  assert.deepEqual(panels[0],panel);
  assert.equal(JSON.stringify(raw),before);
});
