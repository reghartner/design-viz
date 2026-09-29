'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={};vm.createContext(C);
for(const name of ['validator','workbench/panel-collections'])vm.runInContext(readSource(name+'.js'),C);
const plain=value=>JSON.parse(JSON.stringify(value));

test('keyed snapshots retain unknown entries and fields without mutating input',()=>{
  const input={gate:{status:'pass',detail:'',future:4},future:{keep:true}};
  assert.deepEqual(plain(C.panelKeyedStateChange(input,'gate','status','fail').value),{gate:{status:'fail',detail:'',future:4},future:{keep:true}});
  assert.deepEqual(plain(C.panelKeyedStateChange(input,'gate',null,undefined).value),{future:{keep:true}});
  assert.deepEqual(plain(C.panelKeyedStateChange({gate:{}},'gate',null,undefined).value),{});
  assert.deepEqual(plain(C.panelKeyedStateChange(undefined,'latency',null,null).value),{latency:null});
  assert.equal(input.gate.status,'pass');
  assert.match(C.panelKeyedStateChange([], 'gate',null,undefined).error,/Advanced JSON/);
  assert.match(C.panelKeyedStateChange({gate:8},'gate','status','pass').error,/default/);
});

test('table reorder and rename retain row identity, unknown cells, and scalar types',()=>{
  const columns=[{id:'value'},{id:'flag'},{id:'empty'}];
  const input=[{id:'one',future:9,cells:{value:' padded ',flag:false,empty:null,hidden:{keep:true}}},{id:'two',status:'future',cells:{value:42,flag:true,empty:'',hidden:8}}];
  const ui=C.panelTableEditorRows(input,columns);
  ui[0].value0=ui[0].value0.trim();ui[1].id='renamed';
  const out=plain(C.panelTableEditorCollect([ui[1],ui[0]],input,columns).value);
  assert.deepEqual(out,[{...input[1],id:'renamed'},input[0]]);
  assert.equal(input[1].id,'two');
  assert.deepEqual(plain(C.panelTableEditorCollect([],input,columns).value),[]);
});

test('table typed edits reject invalid values and retain advanced cells',()=>{
  const columns=[{id:'value'}],input=[{id:'one',cells:{value:{nested:true}},future:'yes'}];
  const ui=C.panelTableEditorRows(input,columns);
  assert.equal(ui[0].type0,'advanced');
  assert.deepEqual(plain(C.panelTableEditorCollect(ui,input,columns).value),input);
  ui[0].value0='{"nested":false}';assert.match(C.panelTableEditorCollect(ui,input,columns).error,/Advanced JSON/);
  ui[0].type0='boolean';ui[0].value0='yes';assert.match(C.panelTableEditorCollect(ui,input,columns).error,/true or false/);
  ui[0].value0='false';assert.equal(C.panelTableEditorCollect(ui,input,columns).value[0].cells.value,false);
  ui[0].type0='number';ui[0].value0='Infinity';assert.match(C.panelTableEditorCollect(ui,input,columns).error,/finite/);
  ui[0].value0='0';assert.equal(C.panelTableEditorCollect(ui,input,columns).value[0].cells.value,0);
  assert.match(C.panelTableEditorCollect([ui[0],ui[0]],input,columns).error,/unique/);
  assert.equal(C.panelTableEditorRows([{id:'bad',cells:[]}],columns),null);
});

test('log edits preserve unknown fields, legacy strings and scalar text across reorder',()=>{
  const input=[' original ',{tag:'NET',text:42,future:{keep:true}}];
  const out=C.panelLogEditorCollect([{_sourceIndex:1,tag:'NET',text:'42'},{_sourceIndex:0,text:'original'}],input);
  assert.deepEqual(plain(out.value),[input[1],input[0]]);
  assert.deepEqual(plain(C.panelLogEditorCollect([{_sourceIndex:1,tag:'NEW',text:'updated'}],input).value),[{tag:'NEW',text:'updated',future:{keep:true}}]);
  assert.deepEqual(plain(C.panelLogEditorCollect([],input).value),[]);
});
