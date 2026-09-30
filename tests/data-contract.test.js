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

test('all contract content carries forward and temporary overrides restore the carried values',()=>{
  const p=panel(), original=JSON.stringify(p);
  const changed=[{id:'new',label:'New field',cells:{custom:0}}];
  const d=diagram(p,[{panels:{contract:{columns:[{id:'custom',label:'Custom',width:200}],fields:changed,fieldWidth:240}}},
    {panels:{contract:{enterOnce:{fields:[],columns:[],fieldWidth:80}}}},
    {panels:{contract:{highlights:{new:{color:'green'}}}}}]);
  const states=C.foldPanelStates(d).contract;
  assert.match(render(p,states[0]),/>Custom<.*New field.*>0</s);
  assert.match(render(p,states[0]),/<col style="width:240px">/);
  assert.match(render(p,states[1]),/colspan="1".*No fields declared/);
  assert.match(render(p,states[1]),/<col style="width:80px">/);
  assert.match(render(p,states[2]),/>Custom<.*New field.*>0</s);
  assert.match(render(p,states[2]),/--contract-highlight:#22c55e/);
  assert.deepEqual(plain(C.validate(C.normalize(d))),{errors:[],warnings:[]});
  assert.equal(JSON.stringify(p),original);
});

test('step row editor uses inherited columns and preserves typed and unknown cell values',()=>{
  let projected,config,saved;
  const element=()=>({setAttribute(){},querySelector(){return {};}});
  const editor=definition.authoring.editor({controls:{
    rows(key,items,shape,options){projected=items;config=options;return element();},
    block(label,control){return control;}
  }});
  const inherited=[{id:'new',label:'New',cells:{custom:0,hidden:{keep:true}},extra:true}];
  editor.patchControl(['fields','jsonArr'],{panel:panel(),effective:{value:inherited},
    effectiveFields:{columns:{value:[{id:'custom',label:'Custom'}]},fields:{value:inherited}},
    commit(value){saved=plain(value);return true;}});
  assert.equal(projected[0].cell0,'0');
  projected[0].label='Renamed';
  config.commitValue(config.collect(projected).value);
  assert.deepEqual(saved,[{id:'new',label:'Renamed',cells:{custom:0,hidden:{keep:true}},extra:true}]);
  projected[0].cell0='changed';
  config.commitValue(config.collect(projected).value);
  assert.equal(saved[0].cells.custom,'changed');
});

test('invalid step content warns and renders safe declared fallbacks',()=>{
  const p=panel(), state={columns:'bad',fields:false,fieldWidth:-5};
  const result=C.validate(C.normalize(diagram(p,[{panels:{contract:state}}])));
  for(const key of ['columns','fields','fieldWidth'])assert.ok(result.warnings.some(w=>w.includes('panels.contract.'+key)),key);
  assert.equal(render(p,state),render(p));
});

test('step widths validate before committing and columns edit through step assignments',()=>{
  let change,config,saved,error;
  const editor=definition.authoring.editor({error(message){error=message;},controls:{
    number(value,commit){assert.equal(value,240);change=commit;return {};},
    rows(key,items,shape,options){config=options;return {querySelector(){return {};},setAttribute(){}};},
    block(label,control){return control;}
  }});
  const options={panel:panel(),effective:{value:240},commit(value){saved=plain(value);return true;}};
  editor.patchControl(['fieldWidth','num'],options);
  assert.equal(change(20),false);assert.match(error,/at least 40/);assert.equal(saved,undefined);
  change(300);assert.equal(saved,300);
  editor.patchControl(['columns','jsonArr'],{panel:panel(),commit(value){saved=plain(value);return true;}});
  config.commitValue(config.collect([{_sourceIndex:0,label:'New type',width:210}]).value);
  assert.deepEqual(saved,[{id:'type',label:'New type',width:210}]);
});

test('highlight validation uses fields carried on the active path, not removed or future fields',()=>{
  const p=panel();p.fields=[{id:'a'}];p.initial={};
  const d=diagram(p,[
    {id:'replace',panels:{contract:{fields:[{id:'b'}]}}},
    {id:'highlight',panels:{contract:{highlights:{a:{color:'blue'},b:{color:'green'},future:{color:'red'}}}}},
    {id:'future',panels:{contract:{fields:[{id:'future'}]}}}
  ]);
  let result=C.validate(C.normalize(d));
  assert.ok(result.warnings.some(w=>w.includes('highlights.a: unknown')));
  assert.ok(result.warnings.some(w=>w.includes('highlights.future: unknown')));
  assert.ok(!result.warnings.some(w=>w.includes('highlights.b: unknown')));
  d.paths=[{id:'left',steps:['replace','highlight']},{id:'right',steps:['future']}];
  result=C.validate(C.normalize(d));
  assert.ok(result.warnings.some(w=>w.includes('highlights.future: unknown')));
  assert.ok(!result.warnings.some(w=>w.includes('highlights.b: unknown')));
});

test('temporary field declarations validate locally and do not carry into later highlights',()=>{
  const p=panel();p.initial={};
  const d=diagram(p,[
    {panels:{contract:{enterOnce:{fields:[{id:'temporary'}],highlights:{temporary:{color:'blue'}}}}}},
    {panels:{contract:{highlights:{temporary:{color:'blue'}}}}}
  ]);
  const result=C.validate(C.normalize(d));
  assert.equal(result.warnings.length,1);
  assert.match(result.warnings[0],/steps\[1\].*highlights.temporary: unknown/);
});
