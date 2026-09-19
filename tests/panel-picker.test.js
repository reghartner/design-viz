'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={};vm.createContext(context);
for(const name of ['validator.js','builder.workbench.js','panel-picker.workbench.js'])vm.runInContext(readSource(name),context);
const plain=value=>JSON.parse(JSON.stringify(value));

test('visual catalog covers each supported panel exactly once with useful descriptions',()=>{
  const catalog=plain(context.PANEL_CATALOG), types=catalog.map(entry=>entry.type);
  assert.equal(new Set(types).size,types.length);
  assert.deepEqual(types.sort(),plain(context.PANEL_TYPES).sort());
  for(const entry of catalog){
    assert.ok(entry.name && entry.category && entry.tagline,entry.type);
    assert.ok(entry.description.length>50,entry.type);
  }
});

test('every preview uses valid authored configuration without renderer fallback warnings',()=>{
  for(const {type} of context.PANEL_CATALOG){
    const {panel}=context.panelPickerExample(type);
    const spec={page:{blocks:[{diagram:{nodes:{},rows:[[]],panels:[panel]}}]}};
    const findings=context.validate(context.normalize(spec));
    assert.deepEqual(plain(findings.errors),[],type);
    assert.deepEqual(plain(findings.warnings),[],type);
  }
});

test('preview samples are independently cloned and never leak into added panel defaults',()=>{
  const original=plain(context.PANEL_TEMPLATES);
  for(const {type} of context.PANEL_CATALOG){
    const sample=context.panelPickerExample(type);
    const other=context.panelPickerExample(type);
    sample.panel.title='Modified preview';sample.state.changed='sample only';
    assert.notEqual(other.panel.title,'Modified preview');assert.equal(other.state.changed,undefined);
    const raw={nodes:{},rows:[[]]},plan=context.planAddPanel(JSON.stringify(raw),raw,0,type);
    assert.equal(plan.error,undefined,type);
    const added=JSON.parse(plan.text).panels[0];delete added.id;delete added.type;
    assert.deepEqual(added,original[type],type);
  }
  assert.deepEqual(plain(context.PANEL_TEMPLATES),original);
});

test('phone sample derives an absolute notification snapshot from valid authored operations',()=>{
  const sample=context.panelPickerExample('phone');
  assert.equal(sample.panel.initial.notifications,undefined);
  assert.equal(sample.state.notifications.length,1);
  assert.equal(sample.state.notifications[0].title,sample.panel.initial.notify[0].title);
});

test('source, destination, or edit-mode changes invalidate an open picker snapshot',()=>{
  const snapshot={text:'original source',section:1};
  assert.equal(context.panelPickerCurrent(snapshot,{text:'original source',section:1}),true);
  for(const current of [null,{text:'new source',section:1},{text:'original source',section:0},{text:'original source',section:1,error:'connecting'}]){
    assert.equal(context.panelPickerCurrent(snapshot,current),false);
  }
  assert.equal(context.panelPickerCurrent(null,snapshot),false);
});


test('late registered panel metadata drives insertion, field discovery, and isolated picker examples',()=>{
  context.PanelRegistry.extend('authoring-fixture',{authoring:{
    template:{title:'Reading',initial:{value:3}},
    setupFields:[['unit','text'],['initial','json']],patchFields:[['value','num']],
    expandPatchFields:decl=>[['value','num'],['status','enum',decl.states || ['idle']]],
    picker:{name:'Reading',category:'Extension fixtures',tagline:'A new panel',description:'A panel discovered from its own authoring contract after the editor scripts loaded.'},
    example(sample){sample.state.value=7;sample.panel.initial=JSON.parse(JSON.stringify(sample.state));return sample;}
  }});
  assert.ok(Object.keys(context.PANEL_TEMPLATES).includes('authoring-fixture'));
  assert.ok(Object.hasOwn(context.PANEL_SETUP_FIELDS,'authoring-fixture'));
  assert.deepEqual(plain(context.PANEL_PATCH_FIELDS['authoring-fixture']),[['value','num']]);
  assert.deepEqual(plain(context.panelPatchFields({type:'authoring-fixture',states:['ready']})),[['value','num'],['status','enum',['ready']]]);
  assert.ok(context.PANEL_CATALOG.find(entry=>entry.type==='authoring-fixture'));
  const sample=context.panelPickerExample('authoring-fixture');assert.equal(sample.state.value,7);
  sample.panel.initial.value=99;
  assert.equal(context.panelPickerExample('authoring-fixture').state.value,7);
  const raw={nodes:{},rows:[[]]},plan=context.planAddPanel(JSON.stringify(raw),raw,0,'authoring-fixture');
  assert.equal(plan.error,undefined);assert.equal(JSON.parse(plan.text).panels[0].initial.value,3);
});
