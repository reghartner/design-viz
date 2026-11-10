'use strict';
/* #1238 Workbench step trace match form (replaces the raw "Trace match JSON" box).
   Test plan item 4 (node): round-trip of every form field through the command layer.
   Items 1-3 are browser tests in tools/browser-tests/tests/step-trace-match-form.spec.mjs.
| row | rule |
|---|---|
| F1 | Service name, operation, node, namespace, occurrence and retry attempts each write their traceMatch key through planStepTraceMatch and read back unchanged through traceMatchFormAlternatives; clearing removes the key. |
| F2 | Attribute rows add, rename (order kept), retype and remove `attributes.<key>`; an emptied map is removed. |
| F3 | A key only Advanced JSON edits (maxDurationMs, parentStepId, optional, ...) survives every form edit with its source text unchanged; Advanced JSON replaces only those keys. |
| F4 | Add alternative turns the object into an array (the new entry copies the last); Remove alternative down to one returns the object form; Remove trace match removes the field. |
| F5 | Refusals (bad occurrence, occurrence with retry attempts, form keys in Advanced JSON, duplicate attribute, a non-number for a number attribute) return an error and change nothing. |
| F6 | Inspect: the form controls make each edit one Undo step; the Node list includes imported nodes; validator messages appear next to the field they name. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/inspector','workbench/io-model']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
function api(C){
  for(const name of ['traceMatchFormAlternatives','traceMatchFormEdit','planStepTraceMatch'])
    assert.equal(typeof C[name],'function',name+' is a pure Workbench step command (src/workbench/commands/narrative.js)');
  return C;
}
const ADVANCED={maxDurationMs:500,parentStepId:'request',optional:false};
function board(match){
  const steps=[{id:'request',text:'Request',nodes:['api'],traceMatch:{serviceName:'gateway',operation:'POST /orders'}},
    {id:'charge',text:'Charge the card',nodes:['payment']}];
  if(match!==undefined)steps[1].traceMatch=match;
  return {page:{title:'Checkout',sections:[{heading:'Flow',diagram:{nodes:{api:{title:'API'},payment:{title:'Payment'},note:{type:'text',text:'Read me'}},
    rows:[['api','payment','note']],edges:[{from:'api',to:'payment',label:'charge'}],steps}}]}};
}
const stepOf=raw=>raw.page.sections[0].diagram.steps[1];
/* Applies edits in order through the planner; returns the text after each. */
function driver(C,spec){
  let text=JSON.stringify(spec,null,2),raw=JSON.parse(text);
  const d={get text(){return text;},get raw(){return raw;},get match(){return stepOf(raw).traceMatch;},
    apply(edit){const plan=C.planStepTraceMatch(text,raw,0,1,edit);assert.equal(plan.error,undefined,plan.error);assert.ok(!plan.noop,'the edit changes the source');text=plan.text;raw=JSON.parse(text);return d;},
    refuse(edit,pattern){const plan=C.planStepTraceMatch(text,raw,0,1,edit);assert.match(plan.error || '',pattern);assert.equal(plan.text,undefined,'a refusal plans no text');return d;}};
  return d;
}
const advancedText=raw=>JSON.stringify(Object.fromEntries(Object.entries(stepOf(raw).traceMatch).filter(([k])=>k in ADVANCED)));

test('F1 F3 every scalar form field round-trips through the command layer and a JSON-only field survives',()=>{
  const C=api(inspectorEnvironment(names).C),d=driver(C,board({serviceName:'payment',operation:'Charge',...ADVANCED}));
  const advanced=advancedText(d.raw);
  const fields=[['serviceName','payments-v2'],['operation','grpc.Payment/Charge'],['nodeId','payment'],['namespace','shop']];
  for(const [field,value] of fields){
    d.apply({op:'set',alternative:0,field,value:'  '+value+'  '});
    assert.equal(d.match[field],value,field+' is written trimmed');
    assert.deepEqual(plain(C.traceMatchFormAlternatives(d.match))[0][field],value,field+' reads back through the form model');
    assert.equal(advancedText(d.raw),advanced,'Advanced JSON keys are unchanged after a '+field+' edit');
  }
  d.apply({op:'set',alternative:0,field:'occurrence',value:'2'});assert.equal(d.match.occurrence,2,'occurrence is stored as a number');
  d.refuse({op:'set',alternative:0,field:'repeat',value:true},/Clear Occurrence first/);
  d.apply({op:'set',alternative:0,field:'occurrence',value:''});assert.equal(Object.hasOwn(d.match,'occurrence'),false);
  d.apply({op:'set',alternative:0,field:'repeat',value:true});assert.equal(d.match.repeat,'attempts');
  d.refuse({op:'set',alternative:0,field:'occurrence',value:'3'},/Turn off Retry attempts first/);
  d.apply({op:'set',alternative:0,field:'repeat',value:false});assert.equal(Object.hasOwn(d.match,'repeat'),false);
  for(const bad of ['0','1.5','x','-1'])d.refuse({op:'set',alternative:0,field:'occurrence',value:bad},/whole number from 1/);
  for(const field of ['serviceName','operation'])d.refuse({op:'set',alternative:0,field,value:'  '},/needs a service name and an operation\. To delete it, use Remove trace match/);
  for(const [field] of fields.slice(2)){d.apply({op:'set',alternative:0,field,value:null});assert.equal(Object.hasOwn(d.match,field),false,'clearing '+field+' removes it');}
  assert.deepEqual(plain(d.match),{serviceName:'payments-v2',operation:'grpc.Payment/Charge',...ADVANCED},'only the form keys changed; Advanced keys kept their values and order');
  assert.equal(advancedText(d.raw),advanced);
  // A no-op edit plans nothing.
  assert.equal(C.planStepTraceMatch(d.text,d.raw,0,1,{op:'set',alternative:0,field:'serviceName',value:'payments-v2'}).noop,true);
  // The other step's traceMatch is never touched.
  assert.deepEqual(d.raw.page.sections[0].diagram.steps[0].traceMatch,{serviceName:'gateway',operation:'POST /orders'});
});

test('F2 attribute rows add, rename in place, retype and remove attributes.<key>',()=>{
  const C=api(inspectorEnvironment(names).C),d=driver(C,board({serviceName:'payment',operation:'Charge',maxDurationMs:500}));
  d.apply({op:'attribute',alternative:0,key:null,name:'deployment.environment.name',value:'prod',type:'string'});
  d.apply({op:'attribute',alternative:0,key:null,name:'http.response.status_code',value:'200',type:'number'});
  d.apply({op:'attribute',alternative:0,key:null,name:'flow.backpressure',value:'true',type:'boolean'});
  assert.deepEqual(plain(d.match.attributes),{'deployment.environment.name':'prod','http.response.status_code':200,'flow.backpressure':true});
  d.refuse({op:'attribute',alternative:0,key:null,name:'flow.backpressure',value:'false',type:'boolean'},/already on this alternative/);
  d.refuse({op:'attribute',alternative:0,key:'http.response.status_code',name:'http.response.status_code',value:'ok',type:'number'},/enter a number/);
  d.refuse({op:'attribute',alternative:0,key:'flow.backpressure',name:'flow.backpressure',value:'yes',type:'boolean'},/true or false/);
  d.refuse({op:'attribute',alternative:0,key:null,name:'  ',value:'x',type:'string'},/Enter an attribute name/);
  d.apply({op:'attribute',alternative:0,key:'deployment.environment.name',name:'deployment.environment',value:'prod',type:'string'});
  assert.deepEqual(Object.keys(d.match.attributes),['deployment.environment','http.response.status_code','flow.backpressure'],'a rename keeps the row in place');
  d.apply({op:'attribute',alternative:0,key:'http.response.status_code',name:'http.response.status_code',value:'200',type:'string'});
  assert.equal(d.match.attributes['http.response.status_code'],'200','retyping to text stores a string (Honeycomb table cells are text)');
  d.apply({op:'attribute',alternative:0,key:'deployment.environment',name:'deployment.environment',value:'staging'});
  assert.equal(d.match.attributes['deployment.environment'],'staging');
  for(const key of ['deployment.environment','http.response.status_code','flow.backpressure'])d.apply({op:'attribute',alternative:0,key,name:null});
  assert.equal(Object.hasOwn(d.match,'attributes'),false,'an emptied attribute map is removed');
  assert.equal(d.match.maxDurationMs,500);
  assert.deepEqual(plain(C.traceMatchFormAlternatives({serviceName:'a',operation:'b',attributes:{x:{nested:true}}})),null,'non-scalar attributes are not form-editable');
});

test('F3 Advanced JSON replaces only the keys the form does not edit',()=>{
  const C=api(inspectorEnvironment(names).C),d=driver(C,board({serviceName:'payment',operation:'Charge',nodeId:'payment',maxDurationMs:500}));
  d.apply({op:'advanced',alternative:0,value:{maxDurationMs:800,maxQueueDepth:10,optional:true}});
  assert.deepEqual(plain(d.match),{serviceName:'payment',operation:'Charge',nodeId:'payment',maxDurationMs:800,maxQueueDepth:10,optional:true});
  d.refuse({op:'advanced',alternative:0,value:{serviceName:'x'}},/Edit serviceName in the form fields/);
  d.refuse({op:'advanced',alternative:0,value:[1]},/is an object/);
  d.apply({op:'advanced',alternative:0,value:null});
  assert.deepEqual(plain(d.match),{serviceName:'payment',operation:'Charge',nodeId:'payment'});
  // Keys that stay keep their authored place; new keys follow.
  const mixed=driver(C,board({serviceName:'payment',maxDurationMs:500,operation:'Charge',optional:true,nodeId:'payment'}));
  mixed.apply({op:'advanced',alternative:0,value:{optional:false,maxDurationMs:600,role:'database'}});
  assert.deepEqual(Object.keys(mixed.match),['serviceName','maxDurationMs','operation','optional','nodeId','role']);
  assert.deepEqual(plain(mixed.match),{serviceName:'payment',maxDurationMs:600,operation:'Charge',optional:false,nodeId:'payment',role:'database'});
  assert.deepEqual(plain(C.traceMatchFormEdit(undefined,{op:'create',serviceName:' svc ',operation:'op'})),{value:{serviceName:'svc',operation:'op'}},'a new trace match is the object form with both strings');
  assert.match(C.traceMatchFormEdit(undefined,{op:'create',serviceName:'svc',operation:' '}).error,/Enter both/);
  assert.match(C.traceMatchFormEdit({serviceName:'a',operation:'b'},{op:'create',serviceName:'svc',operation:'op'}).error,/already has a trace match/);
  assert.match(C.traceMatchFormEdit(undefined,{op:'set',alternative:0,field:'namespace',value:'ns'}).error,/no longer exists/,'fields need a trace match first');
});

test('F4 alternatives: add turns the object into an array, removal back to one returns the object form',()=>{
  const C=api(inspectorEnvironment(names).C),d=driver(C,board({serviceName:'payment',operation:'Charge',maxDurationMs:500}));
  d.apply({op:'add-alternative'});
  assert.ok(Array.isArray(d.match));assert.deepEqual(plain(d.match),[{serviceName:'payment',operation:'Charge',maxDurationMs:500},{serviceName:'payment',operation:'Charge',maxDurationMs:500}],'the new alternative copies the last one');
  d.apply({op:'set',alternative:1,field:'serviceName',value:'payment-legacy'});d.apply({op:'set',alternative:1,field:'operation',value:'POST /charge'});
  d.apply({op:'attribute',alternative:1,key:null,name:'service.version',value:'1',type:'string'});
  assert.deepEqual(plain(d.match[1]),{serviceName:'payment-legacy',operation:'POST /charge',maxDurationMs:500,attributes:{'service.version':'1'}});
  assert.deepEqual(plain(d.match[0]),{serviceName:'payment',operation:'Charge',maxDurationMs:500},'editing one alternative leaves the other unchanged');
  d.apply({op:'add-alternative'});assert.equal(d.match.length,3);
  d.apply({op:'remove-alternative',alternative:2});assert.equal(d.match.length,2,'removing one of three keeps an array');
  d.apply({op:'remove-alternative',alternative:0});
  assert.deepEqual(plain(d.match),{serviceName:'payment-legacy',operation:'POST /charge',maxDurationMs:500,attributes:{'service.version':'1'}},'one left returns to the single object form');
  d.refuse({op:'set',alternative:1,field:'serviceName',value:'x'},/no longer exists/);
  d.apply({op:'add-alternative'});d.refuse({op:'set',alternative:1,field:'operation',value:''},/To delete it, use Remove alternative/);d.apply({op:'remove-alternative',alternative:1});
  d.apply({op:'clear'});assert.equal(Object.hasOwn(stepOf(d.raw),'traceMatch'),false,'Remove trace match removes the field');
  assert.match(C.traceMatchFormEdit(undefined,{op:'add-alternative'}).error,/Set a service name and operation first/);
  assert.equal(C.traceMatchFormEdit(undefined,{op:'clear'}).noop,true);
  // A one-entry authored array keeps its shape on field edits.
  assert.deepEqual(plain(C.traceMatchFormEdit([{serviceName:'a',operation:'b'}],{op:'set',alternative:0,field:'namespace',value:'ns'})),{value:[{serviceName:'a',operation:'b',namespace:'ns'}]});
  assert.equal(C.traceMatchFormAlternatives('payment'),null,'a non-object is left to the JSON box');
});

function harness(spec){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={e,h,
    select(t){h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    editor(){const box=h.guide.querySelector('fieldset.trace-match-editor');assert.ok(box,'the step form has a Trace match fieldset');return box;},
    control(name){const el=h.guide.querySelectorAll('input,select,textarea,button').find(c=>c.getAttribute('aria-label')===name || c.tagName==='BUTTON' && !c.getAttribute('aria-label') && c.textContent===name);assert.ok(el,'control "'+name+'" exists');return el;},
    set(name,value){const el=ui.control(name);el.value=value;el.fire('change');h.flush();return ui;},
    check(name,on){const el=ui.control(name);el.checked=on;el.fire('change');h.flush();return ui;},
    click(name){const b=h.guide.querySelectorAll('button').find(x=>x.getAttribute('aria-label')===name || x.textContent===name);assert.ok(b,'button "'+name+'" exists');b.fire('click');h.flush();return ui;},
    error(){const slot=h.guide.querySelector('.ierr');return slot?slot.textContent:'';},
    warningFor(name){const el=ui.control(name),id=el.getAttribute('aria-describedby');return id?(h.guide.querySelectorAll('p').find(p=>p.id===id) || {}).textContent || '':'';}};
  return ui;
}
const STEP={kind:'step',section:0,index:1};
function oneStep(ui,act){
  const before=ui.text;act();const after=ui.text;assert.notEqual(after,before,'the edit changed the source');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'Undo restores the exact prior text');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after,'Redo restores the exact next text');
  ui.select(STEP);return after;
}

test('F6 Inspect form controls over a consumer with imported nodes: one Undo step per edit, imported nodes listed and written',()=>{
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local worker'}},rows:[['local']],edges:[],
    topologyImports:[{spec:'provider',export:'core',as:'canon'}],
    steps:[{id:'request',text:'Request',nodes:['local'],traceMatch:{serviceName:'gateway',operation:'POST /orders'}},{id:'persist',text:'Persist',nodes:['canon::api'],traceMatch:{serviceName:'store',operation:'INSERT',maxDurationMs:250}}]});
  const ui=harness(consumer);
  ui.h.session.replaceProject(JSON.stringify(consumer,null,2),null,{topologyContext:{version:1,id:'consumer',specs:[provider,consumer]}});
  ui.select(STEP);ui.editor();
  assert.equal(ui.h.guide.querySelectorAll('textarea').some(t=>t.closest('.frow')?.querySelector('.flab')?.textContent==='Trace match JSON'),false,'the raw Trace match JSON box is gone for a form-editable match');
  const nodeOptions=ui.control('node').options.map(o=>o.value);
  assert.deepEqual(nodeOptions,['','local','canon::api','canon::store'],'the Node list holds local and imported nodes');
  assert.equal(ui.control('node').options.find(o=>o.value==='canon::api').textContent,'API · canon::api');
  const match=()=>ui.raw.page.sections[0].diagram.steps[1].traceMatch;
  oneStep(ui,()=>ui.set('service name','store-v2'));assert.equal(match().serviceName,'store-v2');
  oneStep(ui,()=>ui.set('operation','INSERT orders'));assert.equal(match().operation,'INSERT orders');
  oneStep(ui,()=>ui.set('node','canon::api'));assert.equal(match().nodeId,'canon::api','an imported node is written by its namespaced id');
  assert.equal(ui.warningFor('node'),'','an imported nodeId is valid');
  oneStep(ui,()=>ui.set('namespace','shop'));assert.equal(match().namespace,'shop');
  oneStep(ui,()=>ui.set('occurrence','2'));assert.equal(match().occurrence,2);
  assert.equal(ui.control('retry attempts').disabled,true,'retry attempts is disabled while an occurrence is set');
  oneStep(ui,()=>ui.set('occurrence',''));
  oneStep(ui,()=>ui.check('retry attempts',true));assert.equal(match().repeat,'attempts');
  assert.equal(ui.control('occurrence').disabled,true);
  oneStep(ui,()=>ui.check('retry attempts',false));
  ui.control('new attribute name').value='deployment.environment.name';ui.control('new attribute value').value='prod';
  oneStep(ui,()=>ui.click('Add attribute'));assert.deepEqual(plain(match().attributes),{'deployment.environment.name':'prod'});
  oneStep(ui,()=>ui.set('attribute 1 value','staging'));assert.deepEqual(plain(match().attributes),{'deployment.environment.name':'staging'});
  oneStep(ui,()=>ui.set('attribute 1 name','service.version'));assert.deepEqual(plain(match().attributes),{'service.version':'staging'});
  oneStep(ui,()=>ui.click('Remove attribute service.version'));assert.equal(Object.hasOwn(match(),'attributes'),false);
  oneStep(ui,()=>ui.set('advanced JSON','{"maxDurationMs": 900, "optional": true}'));assert.equal(match().maxDurationMs,900);assert.equal(match().optional,true);
  assert.equal(ui.warningFor('advanced JSON'),'');
  // A refused edit leaves the source and history alone and says why.
  // In a document that imports nodes an invalid resolved spec is refused before applying; the form and the typed text stay.
  ui.select(STEP);let held=ui.text;const area=ui.control('advanced JSON');area.value='{"maxDurationMs": -1}';area.fire('change');ui.h.flush();
  assert.equal(ui.text,held,'the source is unchanged');assert.match(ui.error(),/^This edit was not applied: .*nonnegative number required/);
  assert.ok(ui.h.guide.querySelector('fieldset.trace-match-editor'),'the form stays');assert.equal(ui.control('advanced JSON'),area,'the same textarea stays');assert.equal(area.value,'{"maxDurationMs": -1}','the typed text stays');
  assert.equal(ui.h.session.undo(),true);assert.notEqual(ui.text,held,'Undo still reverts the previous real edit');assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,held);ui.select(STEP);
  let before=ui.text;ui.set('occurrence','0');assert.equal(ui.text,before);assert.match(ui.error(),/whole number from 1/);
  ui.select(STEP);before=ui.text;ui.set('operation','');assert.equal(ui.text,before,'emptying a required field is refused');assert.match(ui.error(),/needs a service name and an operation\. To delete it, use Remove trace match/);
  // Alternatives: labels name the alternative; removing back to one returns the object form.
  ui.select(STEP);oneStep(ui,()=>ui.click('Add alternative'));assert.equal(match().length,2);
  oneStep(ui,()=>ui.set('Alternative 2 service name','store-legacy'));assert.equal(match()[1].serviceName,'store-legacy');assert.equal(match()[0].serviceName,'store-v2');
  oneStep(ui,()=>ui.set('Alternative 2 node','canon::store'));assert.equal(match()[1].nodeId,'canon::store');assert.equal(match()[0].nodeId,'canon::api');
  oneStep(ui,()=>ui.click('Remove alternative 1'));assert.equal(Array.isArray(match()),false);assert.equal(match().serviceName,'store-legacy');
  oneStep(ui,()=>ui.click('Remove trace match'));assert.equal(Object.hasOwn(ui.raw.page.sections[0].diagram.steps[1],'traceMatch'),false);
  // Without a trace match the form asks for both strings and writes them in one edit.
  assert.equal(ui.h.guide.querySelectorAll('button').some(b=>b.textContent==='Add alternative'),false,'no alternative to copy without a trace match');
  before=ui.text;ui.control('new trace match service name').value='store';ui.click('Add trace match');assert.equal(ui.text,before);assert.match(ui.error(),/Enter both the service name and the operation/);
  ui.select(STEP);ui.control('new trace match service name').value='store';ui.control('new trace match operation').value='INSERT';
  oneStep(ui,()=>ui.click('Add trace match'));assert.deepEqual(plain(match()),{serviceName:'store',operation:'INSERT'});
  // The import is never edited.
  assert.deepEqual(plain(ui.raw.page.sections[0].diagram.topologyImports),[{spec:'provider',export:'core',as:'canon'}]);
});

test('F6 validator messages for this step\'s trace match sit beside the field they name',()=>{
  const raw=board({serviceName:'payment',operation:'Charge',nodeId:'ghost',maxDurationMs:-5,attributes:{'not.supported':'x'}});
  raw.page.sections[0].diagram.steps[0].traceMatch={serviceName:'gateway',operation:'POST /orders',maxDurationMs:-1};
  const ui=harness(raw).select(STEP);ui.editor();
  assert.match(ui.warningFor('node'),/^traceMatch: unknown nodeId ghost$/);
  assert.equal(ui.control('node').getAttribute('aria-invalid'),'true');
  assert.equal(ui.control('node').options.find(o=>o.value==='ghost').textContent,'ghost (unknown)','an unknown node stays visible');
  assert.deepEqual(ui.control('node').options.map(o=>o.value),['','api','payment','ghost'],'text boxes are not trace match nodes');
  assert.match(ui.warningFor('advanced JSON'),/^traceMatch\.maxDurationMs: nonnegative number required$/,'only this step\'s message, once, although step 1 has the same fault');
  assert.equal(ui.h.guide.querySelector('details.trace-match-advanced').hasAttribute('data-inspector-reveal'),true,'Advanced opens when it holds a fault');
  const attrs=ui.h.guide.querySelector('[aria-label="attributes"]'),attrNote=ui.h.guide.querySelectorAll('p').find(p=>p.id===attrs.getAttribute('aria-describedby'));
  assert.equal(attrNote.textContent,'traceMatch.attributes: use supported operational attributes only','the attribute rows are described by their message');
  assert.equal(ui.warningFor('service name'),'');
  assert.equal(ui.h.guide.querySelectorAll('summary').find(x=>x.textContent.startsWith('Code and trace evidence')).textContent,'Code and trace evidence · trace match set · 3 warnings','the closed fold flags the warnings');
  // Fixing the field clears its message on the next render.
  oneStep(ui,()=>ui.set('node','payment'));assert.equal(ui.warningFor('node'),'');
  oneStep(ui,()=>ui.set('advanced JSON','{"maxDurationMs": 800}'));assert.equal(ui.warningFor('advanced JSON'),'');
  // Alternatives: messages land on the alternative they name.
  oneStep(ui,()=>ui.click('Remove attribute not.supported'));
  oneStep(ui,()=>ui.click('Add alternative'));
  oneStep(ui,()=>ui.set('Alternative 2 occurrence','2'));
  oneStep(ui,()=>ui.set('Alternative 2 advanced JSON','{"maxDurationMs": 800, "parentStepId": "nope"}'));
  assert.match(ui.warningFor('Alternative 2 advanced JSON'),/^traceMatch\[1\]: unknown or self parentStepId$/);
  assert.equal(ui.warningFor('Alternative 1 advanced JSON'),'');
  oneStep(ui,()=>ui.set('Alternative 1 advanced JSON','{"maxDurationMs": 800, "optional": true}'));
  assert.deepEqual(ui.h.guide.querySelector('[aria-label="Trace match warnings"]').children.map(li=>li.textContent),['traceMatch: set optional on every alternative or on none']);
  // A trace match the form cannot show keeps the JSON box.
  const odd=harness(board('payment')).select(STEP);
  const box=odd.h.guide.querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent==='Trace match JSON');
  assert.ok(box,'a non-object trace match is edited as JSON');
});

test('F7 Inspect keeps every source fixable: occurrence with repeat, string occurrence, true/false values, drafts, one reveal, cached validation',()=>{
  const ui=harness(board({serviceName:'payment',operation:'Charge',occurrence:2,repeat:'attempts'})).select(STEP);
  const match=()=>stepOf(ui.raw).traceMatch;
  assert.match(ui.warningFor('occurrence'),/occurrence and repeat cannot be combined/);
  assert.equal(ui.control('occurrence').disabled,false,'a source with both stays fixable from Occurrence');
  assert.equal(ui.control('retry attempts').disabled,false,'and from Retry attempts');
  assert.equal(ui.control('retry attempts').checked,true);
  oneStep(ui,()=>ui.set('occurrence',''));
  assert.deepEqual(plain(match()),{serviceName:'payment',operation:'Charge',repeat:'attempts'},'clearing Occurrence leaves a valid trace match in one Undo step');
  assert.equal(ui.warningFor('retry attempts'),'');assert.equal(ui.warningFor('occurrence'),'');
  // The other way round: unchecking Retry attempts fixes it too.
  const other=harness(board({serviceName:'payment',operation:'Charge',occurrence:2,repeat:'attempts'})).select(STEP);
  oneStep(other,()=>other.check('retry attempts',false));assert.deepEqual(plain(stepOf(other.raw).traceMatch),{serviceName:'payment',operation:'Charge',occurrence:2});
  // Only repeat:"attempts" shows as checked.
  for(const repeat of [false,'retries'])assert.equal(harness(board({serviceName:'a',operation:'b',repeat})).select(STEP).control('retry attempts').checked,false,'repeat '+JSON.stringify(repeat)+' is not checked');
  const unset=harness(board({serviceName:'a',operation:'b',repeat:null,occurrence:null})).select(STEP);
  assert.equal(unset.control('occurrence').disabled,false,'repeat:null does not disable Occurrence');assert.equal(unset.control('retry attempts').disabled,false,'occurrence:null does not disable Retry attempts');
  // A string occurrence is normalized by entering the same number.
  const text=harness(board({serviceName:'a',operation:'b',occurrence:'2'})).select(STEP);
  assert.equal(text.control('occurrence').value,'2');
  oneStep(text,()=>text.set('occurrence','2'));assert.equal(stepOf(text.raw).traceMatch.occurrence,2);
  // True/false attributes pick their value from a list; an empty name is refused, × deletes.
  const attrs=harness(board({serviceName:'a',operation:'b',attributes:{'flow.backpressure':true,'service.version':'1'}})).select(STEP);
  const flag=attrs.control('attribute 1 value');assert.equal(flag.tagName,'SELECT');assert.deepEqual(flag.options.map(o=>o.value),['true','false']);assert.equal(flag.value,'true');
  oneStep(attrs,()=>attrs.set('attribute 1 value','false'));assert.equal(stepOf(attrs.raw).traceMatch.attributes['flow.backpressure'],false);
  let before=attrs.text;attrs.set('attribute 2 type','boolean');
  assert.equal(attrs.text,before,'a value that is not true/false is never dropped by a type change');
  assert.equal(attrs.error(),"Value '1' is not true or false; change the value first.");assert.equal(attrs.control('attribute 2 type').value,'string','the type select reverts');
  attrs.select(STEP);before=attrs.text;attrs.set('attribute 2 type','number');assert.equal(stepOf(attrs.raw).traceMatch.attributes['service.version'],1,'"1" becomes the number 1');
  attrs.select(STEP);before=attrs.text;attrs.set('attribute 2 value','v1');assert.equal(attrs.text,before);assert.match(attrs.error(),/enter a number/);
  attrs.select(STEP);before=attrs.text;attrs.set('attribute 1 name','');assert.equal(attrs.text,before);assert.match(attrs.error(),/needs a name\. To delete flow\.backpressure, use its × button/);
  attrs.select(STEP);attrs.control('new attribute type').value='boolean';attrs.control('new attribute type').fire('change');
  assert.equal(attrs.control('new attribute value').hidden,true);assert.equal(attrs.control('new attribute true/false value').hidden,false);
  attrs.control('new attribute name').value='flow.delivery_failed';attrs.control('new attribute true/false value').value='false';
  oneStep(attrs,()=>attrs.click('Add attribute'));assert.equal(stepOf(attrs.raw).traceMatch.attributes['flow.delivery_failed'],false);
  // Add-row text survives a re-render of the same selection; a new selection starts empty.
  attrs.control('new attribute name').value='service.namespace';attrs.control('new attribute name').fire('input');
  attrs.control('new attribute value').value='shop';attrs.control('new attribute value').fire('input');
  attrs.select(STEP);assert.equal(attrs.control('new attribute name').value,'service.namespace');assert.equal(attrs.control('new attribute value').value,'shop');
  attrs.select({kind:'step',section:0,index:0});attrs.select(STEP);assert.equal(attrs.control('new attribute name').value,'','another selection drops the draft');
  // Removing an alternative drops the add-row drafts, which are kept by position.
  const two=harness(board([{serviceName:'a',operation:'b'},{serviceName:'c',operation:'d'}])).select(STEP);
  two.control('Alternative 1 new attribute name').value='service.version';two.control('Alternative 1 new attribute name').fire('input');
  two.select(STEP);assert.equal(two.control('Alternative 1 new attribute name').value,'service.version');
  oneStep(two,()=>two.click('Remove alternative 1'));assert.deepEqual(plain(stepOf(two.raw).traceMatch),{serviceName:'c',operation:'d'});
  assert.equal(two.control('new attribute name').value,'','the removed alternative\'s draft does not reappear');
  const fresh=harness(board()).select(STEP);
  fresh.control('new trace match service name').value='payment';fresh.control('new trace match service name').fire('input');
  fresh.select(STEP);assert.equal(fresh.control('new trace match service name').value,'payment');
  // Advanced (JSON) opens once for a new message, then the author's choice holds.
  const adv=harness(board({serviceName:'a',operation:'b',maxDurationMs:-1})).select(STEP);
  assert.equal(adv.h.guide.querySelector('details.trace-match-advanced').hasAttribute('data-inspector-reveal'),true);
  adv.select(STEP);assert.equal(adv.h.guide.querySelector('details.trace-match-advanced').hasAttribute('data-inspector-reveal'),false,'the same message does not reopen it');
  adv.set('advanced JSON','{"maxDurationMs": -1, "parentStepId": "nope"}');assert.equal(stepOf(adv.raw).traceMatch.parentStepId,'nope');
  assert.equal(adv.h.guide.querySelector('details.trace-match-advanced').hasAttribute('data-inspector-reveal'),true,'a new message opens it again');
  // Re-rendering the same source reuses the two validations.
  const cached=harness(board({serviceName:'a',operation:'b'})),validate=cached.h.session.validate;let calls=0;
  cached.h.session.validate=(...args)=>{calls++;return validate(...args);};
  cached.select(STEP);const first=calls;cached.select(STEP);cached.select(STEP);
  assert.equal(first,2);assert.equal(calls,2,'no validation for an unchanged source');
});
