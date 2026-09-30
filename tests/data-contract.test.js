'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={};vm.createContext(C);
for(const name of ['validator','engine','builder.workbench','panel-picker.workbench'])vm.runInContext(readSource(name+'.js'),C);
const plain=value=>JSON.parse(JSON.stringify(value));
const definition=C.PanelRegistry.get('data-contract');
const panel=()=>({id:'contract',type:'data-contract',...plain(definition.authoring.template)});
const render=(p,state={})=>definition.render({},p,state).html;
const diagram=(p,steps=[])=>({nodes:{service:{}},rows:[['service']],panels:[p],steps});

test('data contract is discoverable, insertable, and has a valid preview',()=>{
  const sample=C.panelPickerExample('data-contract');
  assert.deepEqual(plain(C.validate(C.normalize(diagram(sample.panel)))),{errors:[],warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(item=>item.type==='data-contract'));
  const raw=diagram(panel());const plan=C.planAddPanel(JSON.stringify(raw),raw,0,'data-contract');
  assert.equal(plan.error,undefined);
  assert.equal(JSON.parse(plan.text).panels[1].type,'data-contract');
});

test('contract fields render scalar values, custom columns and safe authored colors',()=>{
  const p=panel();p.title='<script>unsafe</script>';
  p.columns=[{id:'zero',label:'<Zero>',width:120},{id:'bool'},{id:'nil'},{id:'missing'},{id:'object'},{id:'text'}];
  p.fields=[{id:'field',label:'<field>',cells:{zero:0,bool:false,nil:null,object:{nested:1},text:'<img src=x onerror=bad()>'}}];
  const html=render(p,{highlights:{field:{color:'#9d29c7',label:'<Key>'}}});
  for(const value of ['>0<','>false<','>null<','&lt;Zero&gt;','&lt;field&gt;','&lt;Key&gt;','&lt;img','--contract-highlight:#9d29c7'])assert.ok(html.includes(value),value);
  assert.doesNotMatch(html,/<script>|<img|>Change<|swbadge/);
  assert.equal((html.match(/scope="col"/g)||[]).length,7);
  assert.match(html,/<col style="width:120px">/);
  assert.doesNotMatch(render(p,{highlights:{field:{color:'red; background:url(bad)'}}}),/dcontract-highlight|url\(bad\)/);
});

test('contract highlights inherit, clear, and resume after a one-step override without mutating fields',()=>{
  const p=panel();p.initial.highlights={'order-id':{color:'blue'}};
  const steps=[{}, {panels:{contract:{enterOnce:{highlights:{status:{color:'amber',label:'Validate'}}}}}}, {},
    {panels:{contract:{highlights:{}}}}, {}];
  const original=JSON.stringify(p),states=C.foldPanelStates(diagram(p,steps)).contract;
  assert.deepEqual(plain(states.map(state=>state.highlights)),[
    {'order-id':{color:'blue'}},{status:{color:'amber',label:'Validate'}},{'order-id':{color:'blue'}},{},{}
  ]);
  assert.match(render(p,states[1]),/--contract-highlight:#f59e0b/);
  assert.doesNotMatch(render(p,states[3]),/class="dcontract-highlight"/);
  assert.equal(JSON.stringify(p),original);
});

test('malformed contracts warn and render bounded fallbacks without unsafe CSS',()=>{
  const p=panel();p.fieldWidth=-3;p.columns[0].width='20px" onclick="bad()';
  p.fields.push(null,{id:'status',cells:[]});
  p.initial.highlights={status:{color:'nope'},missing:{color:'blue'}};
  const result=C.validate(C.normalize(diagram(p,[{panels:{contract:{enterOnce:{highlights:{status:false}}}}}])));
  assert.equal(result.errors.length,0);
  for(const expected of ['fieldWidth','columns[0].width','fields[3].id','fields[4].id','highlights.status.color','highlights.missing','enterOnce.highlights.status'])
    assert.ok(result.warnings.some(warning=>warning.includes(expected)),expected);
  assert.doesNotMatch(render(p,p.initial),/onclick|class="dcontract-highlight"/);
  p.columns=[];p.fields=[];p.initial={};delete p.fieldWidth;
  assert.deepEqual(plain(C.validate(C.normalize(diagram(p)))),{errors:[],warnings:[]});
  assert.match(render(p),/colspan="1".*No fields declared/);
});

test('highlight edits compose before a deferred form refresh, including clear and failed commits',()=>{
  const selects=[],labels=[],actions=[];
  const element=()=>({appendChild(){},setAttribute(){},options:[{}]});
  const context={document:{createElement:element},listen(){},error(message){throw new Error(message);},controls:{
    action(name,commit){actions.push(commit);return element();},
    select(choices,value,commit){selects.push(commit);return element();},
    text(value,commit){labels.push(commit);return element();},
    block(name,control){return control;},row(name,control){return control;}
  }};
  let saved,accept=true;
  definition.authoring.editor(context).patchControl(['highlights','json'],{
    panel:panel(),value:undefined,effective:{value:{'customer-id':{color:'teal'}}},
    commit(next){if(!accept)return false;saved=plain(next);return true;}
  });
  selects[0]('purple');labels[0]('Primary key');selects[1]('amber');
  assert.deepEqual(saved,{'customer-id':{color:'teal'},'order-id':{color:'purple',label:'Primary key'},status:{color:'amber'}});
  accept=false;selects[0]('red');accept=true;labels[0]('Still purple');
  assert.equal(saved['order-id'].color,'purple');
  actions[0]();selects[1]('green');
  assert.deepEqual(saved,{status:{color:'green'}});
});
