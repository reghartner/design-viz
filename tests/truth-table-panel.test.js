'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {readSource}=require('../tools/source-loader.cjs');
const C={};vm.createContext(C);
for(const name of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js'])vm.runInContext(readSource(name),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const fixture=()=>JSON.parse(fs.readFileSync('examples/device-power-truth-table/device-power-truth-table.spec.json','utf8'));
const diagram=()=>fixture().page.sections[0].diagram;
const definition=C.PanelRegistry.get('truth-table');

test('truth table registers, inserts, previews and validates the authored example',()=>{
  assert.deepEqual(plain(C.validate(C.normalize(fixture()))),{errors:[],warnings:[]});
  assert.equal(C.PANEL_CATALOG.find(p=>p.type==='truth-table').name,'Truth table');
  const raw={nodes:{},rows:[[]]},plan=C.planAddPanel(JSON.stringify(raw),raw,0,'truth-table');
  assert.equal(plan.error,undefined);assert.equal(JSON.parse(plan.text).panels[0].cases.length,4);
  const sample=C.panelPickerExample('truth-table');assert.equal(sample.panel.cases[0].cells.batteryIcon.length,2);
  assert.equal(sample.panel.columns.filter(c=>c.kind==='icons').length,2);
  assert.equal(C.panelPatchFields(sample.panel).find(f=>f[0]==='active')[3].nullLabel,'No active case');
  // #921 slice 2: the Active case control owns inherit/default, case and No active case choices itself.
  for(const mode of ['initial','step']){
    const meta=Object.fromEntries(C.panelPatchFields(sample.panel).map(f=>[f[0],C.panelFieldPresentation(sample.panel,f,mode)]));
    assert.equal(meta.active.assignment,false,mode+': no separate assignment selector for active');
    assert.notEqual(meta.note.assignment,false,mode+': Explanation keeps the shared assignment selector');
  }
  assert.deepEqual(plain(sample.panel.initial),{active:'solar'},'template keeps its starting highlight');
  assert.deepEqual(plain(C.panelPatchFields(sample.panel).map(f=>f[0])),['active','note']);
  assert.equal(definition.since,'0.2.0');assert.equal(definition.authoring.initialFields,true);
});

test('active cases carry, reset, transiently override and remain isolated across paths without mutation',()=>{
  const d=diagram(),before=JSON.stringify(d);
  const normal=C.foldPanelStates(C.diagramForPath(d,'normal')).power;
  assert.deepEqual(plain(normal.map(s=>s.active)),['solar','mains','mains','battery',null]);
  assert.deepEqual(plain(C.foldPanelStates(C.diagramForPath(d,'low')).power.map(s=>s.active)),['solar','low',null]);
  const p=d.panels[0],steps=[{panels:{power:{active:'mains'}}},{panels:{power:{enterOnce:{active:'low'}}}},{},{panels:{power:{active:'bogus'}}},{panels:{power:{active:null}}}];
  assert.deepEqual(plain(definition.fold(p,steps).map(s=>s.active)),['mains','low','mains','mains',null]);
  assert.equal(definition.fold(p,[])[0].active,'solar');assert.equal(JSON.stringify(d),before);
});

test('malformed declarations and patches warn precisely and render safely',()=>{
  const p={id:'power',type:'truth-table',columns:[{id:'x'},{id:'x'},null,{id:'output',kind:'icons'}],cases:[null,{id:'a',cells:{x:{bad:true},unknown:3,output:[null,{icon:'nope'},{icon:'battery',label:7}]}},{id:'a'}],initial:[]};
  const warnings=[];definition.validateDeclaration(p,'panel',warnings);
  definition.validatePatch({active:'missing',enterOnce:[],note:4,unknown:true},'step',p,warnings);
  assert.ok(warnings.some(w=>w.includes('panel.columns[1].id: duplicate')));
  assert.ok(warnings.some(w=>w.includes('panel.cases[1].cells.output[1].icon')));
  assert.ok(warnings.some(w=>w.includes('step.active')));assert.ok(warnings.some(w=>w.includes('step.enterOnce')));
  const html=definition.render(null,p,{}).html;assert.ok(html.includes('<table'));assert.equal((html.match(/<svg/g)||[]).length,1);
  for(const patch of [[],true,'bad',8])assert.equal(definition.fold(diagram().panels[0],[{panels:{power:patch}}])[0].active,'solar');
});

test('semantic cells, multiple inline icons, empty outputs and escaping are independent of color',()=>{
  const p={id:'power',type:'truth-table',title:'<img onerror="bad">',columns:[{id:'a',label:'<b>A</b>'},{id:'b'},{id:'c'},{id:'d'},{id:'e'},{id:'power',kind:'icons'},{id:'battery',kind:'icons'}],cases:[{id:'row',label:'<script>bad</script>',cells:{a:0,b:false,c:null,d:'',power:[{icon:'solar',label:'<img>'}],battery:[{icon:'battery-charging'},{icon:'battery'}]}},{id:'none',cells:{power:[],battery:[]}}]};
  const html=definition.render(null,p,{active:'row'}).html;
  assert.ok(html.includes('scope="row"'));assert.ok(html.includes('aria-current="true"'));assert.ok(html.includes('>Active</span>'));
  for(const text of ['>0</td>','>false</td>','>null</td>','>(empty)</td>','>—</td>','No icons','&lt;script&gt;','&lt;img&gt;'])assert.ok(html.includes(text),text);
  assert.equal((html.match(/<svg/g)||[]).length,3);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<use'));assert.match(definition.styles,/@media print/);assert.match(definition.styles,/overflow:auto/);
});

test('case editor projection retains scalar types, icons and unknown fields across reorder and rename',()=>{
  const p=diagram().panels[0];p.cases[0].future={keep:true};p.cases[0].cells.hidden={keep:true};
  const rows=C.truthTableCaseRows(p),first=rows.shift();rows.push(first);first.id='renamed';first.label='New name';
  const result=plain(C.truthTableCollectCases(rows,p));assert.equal(result.error,undefined);
  const renamed=result.value[3];assert.deepEqual(renamed.cells.powerIcon,p.cases[0].cells.powerIcon);assert.deepEqual(renamed.cells.batteryIcon,p.cases[0].cells.batteryIcon);assert.deepEqual(renamed.future,{keep:true});
  assert.equal(renamed.cells.charging,true);assert.deepEqual(renamed.cells.hidden,{keep:true});assert.equal(renamed.id,'renamed');
  rows[0].id='renamed';assert.match(C.truthTableCollectCases(rows,p).error,/unique ID/);
  assert.equal(C.truthTableCaseRows({...p,cases:[null]}),null);
});
