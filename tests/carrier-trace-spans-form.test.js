'use strict';
/* #1290 PR 6: the Workbench "Trace spans" editor on a node or connection (desktop Inspect →
   Tracking), local and imported. Browser coverage: tools/browser-tests/tests/trace-spans-editor.spec.mjs.
| row | rule |
|---|---|
| E1 | Local node and connection: Add span (name, service, match, value, role), set each field, the three match modes replace each other, attribute rows, Remove span; each edit is one Undo step and writes node.trace / edge.trace. |
| E2 | Refusals in plain words, beside the field, with no change: bad or taken name, empty service, a prefix under 2 characters, an attributes-only span without an attribute, an unknown role. |
| E3 | Imported node and connection: each inherited span says which provider it comes from; a field edit stores only that field in the consumer overlay; hide and show again; Revert one span; Revert all (one Undo step); a consumer span is added here; tickets and metrics in the overlay are kept; the provider is untouched. Inherited span names are read only. |
| E4 | Validator messages for a span sit beside it. |
| E5 | A connection shows its receive side from the receiving node's process spans, and Declare receive span here adds a valid receive span. Text boxes get no editor. |
| E6 | A broken override is shown with its error, never as hidden; unrelated edits keep it as written; unsupported attributes are refused. |
| E7 | Rename a local or added span in one Undo, keeping its fields and traceScope.skip names; inherited names are read only. |
| E8 E9 | A receiver without process spans says so and offers Declare receive span here; attribute values have a type. |
| E10 | A name the provider declares is taken even while hidden here: rename and Add span are refused beside the name (provider title, else id); the note is a role=status region; the hide is kept. |
| E11 | A refused attribute type change is explained beside that type select. |
| E12 | Note slots stay in the page as status regions; a refusal clears then sets its note, so a repeated identical refusal is announced. |
| E13 | Hide or revert of a span the provider does not declare names the provider by its title. |
| E14 | revealTraceSpans (Links Edit in Inspect) opens the Trace spans fold for the next selection only. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/inspector','workbench/io-model']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
function harness(source,context){
  const e=inspectorEnvironment(names),h=e.mount(source);
  if(context)h.session.replaceProject(JSON.stringify(source,null,2),null,{topologyContext:context});
  const ui={e,h,
    select(t){h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    editor(){return h.guide.querySelector('details.trace-spans-editor');},
    control(name){const el=h.guide.querySelectorAll('input,select,textarea,button').find(c=>c.getAttribute('aria-label')===name || c.tagName==='BUTTON' && !c.getAttribute('aria-label') && c.textContent===name);assert.ok(el,'control "'+name+'" exists');return el;},
    has(name){return !!h.guide.querySelectorAll('input,select,textarea,button').find(c=>c.getAttribute('aria-label')===name || c.tagName==='BUTTON' && c.textContent===name);},
    set(name,value){const el=ui.control(name);el.value=value;el.fire('change');h.flush();return ui;},
    check(name,on){const el=ui.control(name);el.checked=on;el.fire('change');h.flush();return ui;},
    click(name){ui.control(name).fire('click');h.flush();return ui;},
    // The text beside a control: its describedby note.
    beside(name){const el=ui.control(name),id=el.getAttribute('aria-describedby');return id?(h.guide.querySelectorAll('p').find(p=>p.id===id) || {}).textContent || '':'';},
    texts(selector){return h.guide.querySelectorAll(selector).map(x=>x.textContent);}};
  return ui;
}
function oneStep(ui,act,target){
  const before=ui.text;act();const after=ui.text;assert.notEqual(after,before,'the edit changed the source');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'Undo restores the exact prior text');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after,'Redo restores the exact next text');
  ui.select(target);return after;
}
const board=()=>spec('board',{nodes:{api:{title:'API'},worker:{title:'Worker',tickets:['ORD-1']},note:{type:'text',text:'Read me'}},rows:[['api','worker','note']],
  edges:[{from:'api',to:'worker',label:'Publish'}],steps:[{id:'publish',text:'Publish',edge:'api->worker'}]});
const NODE={kind:'node',section:0,id:'worker'},EDGE={kind:'edge',section:0,index:0};
function addSpan(ui,{name,service,mode='operation',value,role}){
  ui.control('New span name').value=name;ui.control('New span service').value=service;ui.control('New span match').value=mode;
  ui.control('New span value').value=value;ui.control('New span role').value=role;ui.click('Add span');
}

test('E1 a local node and connection: add, edit every field, switch match modes, attributes, remove; one Undo step each',()=>{
  const ui=harness(board()).select(NODE);
  assert.ok(ui.editor(),'node Inspect → Tracking has a Trace spans editor');
  const worker=()=>diagramOf(ui.raw).nodes.worker;
  oneStep(ui,()=>addSpan(ui,{name:'process',service:'order-worker',value:'process orders',role:'process'}),NODE);
  assert.deepEqual(plain(worker().trace),{spans:{process:{serviceName:'order-worker',operation:'process orders',role:'process'}}});
  assert.deepEqual(plain(worker().tickets),['ORD-1'],'other node fields are kept');
  oneStep(ui,()=>ui.set('process service','order-worker-v2'),NODE);
  oneStep(ui,()=>ui.set('process value','process orders v2'),NODE);
  oneStep(ui,()=>ui.set('process namespace','eu'),NODE);
  oneStep(ui,()=>ui.set('process role','work'),NODE);
  assert.deepEqual(plain(worker().trace.spans.process),{serviceName:'order-worker-v2',operation:'process orders v2',role:'work',namespace:'eu'});
  oneStep(ui,()=>ui.set('process match','operationPrefix'),NODE);
  assert.deepEqual(plain(worker().trace.spans.process),{serviceName:'order-worker-v2',role:'work',namespace:'eu',operationPrefix:'process orders v2'},'operation becomes the prefix');
  ui.control('process new attribute name').value='db.system';ui.control('process new attribute value').value='redis';
  oneStep(ui,()=>ui.click('Add attribute to process'),NODE);
  assert.deepEqual(plain(worker().trace.spans.process.attributes),{'db.system':'redis'});
  oneStep(ui,()=>ui.set('process match','attributes'),NODE);
  assert.equal(Object.hasOwn(worker().trace.spans.process,'operationPrefix'),false,'attributes only drops the operation and prefix');
  assert.equal(ui.control('process value').disabled,true,'no value to enter for attributes only');
  // Back to an operation: there is no value yet, so the editor asks for one before writing anything.
  let held=ui.text;ui.set('process match','operation');assert.equal(ui.text,held);
  assert.equal(ui.control('process value').disabled,false);assert.match(ui.beside('process value'),/^Enter the operation, then press Enter\.$/);
  oneStep(ui,()=>ui.set('process value','process orders v3'),NODE);
  assert.deepEqual(plain(worker().trace.spans.process),{serviceName:'order-worker-v2',role:'work',namespace:'eu',attributes:{'db.system':'redis'},operation:'process orders v3'});
  oneStep(ui,()=>ui.click('Remove span process'),NODE);
  assert.equal(Object.hasOwn(worker(),'trace'),false,'the last span removes trace');
  // A connection.
  ui.select(EDGE);assert.ok(ui.editor());
  oneStep(ui,()=>addSpan(ui,{name:'send',service:'order-api',value:'publish orders',role:'send'}),EDGE);
  assert.deepEqual(plain(diagramOf(ui.raw).edges[0].trace),{spans:{send:{serviceName:'order-api',operation:'publish orders',role:'send'}}});
  assert.deepEqual(plain(ui.control('send role').options.map(o=>o.value)),['send','receive'],'connection roles');
  // Text boxes get no editor.
  ui.select({kind:'node',section:0,id:'note'});assert.equal(ui.editor(),null);
});

test('E2 refusals say what is wrong in plain words, beside the field, and change nothing',()=>{
  const ui=harness(board()).select(NODE);
  const refuse=(act,field,pattern)=>{const before=ui.text;act();assert.equal(ui.text,before,'no change');assert.match(ui.beside(field),pattern,field);};
  refuse(()=>addSpan(ui,{name:'1st',service:'s',value:'v',role:'process'}),'New span name',/A span name starts with a letter and uses only letters, digits, - and _\./);
  ui.select(NODE);refuse(()=>addSpan(ui,{name:'process',service:'',value:'v',role:'process'}),'New span service',/Enter the service name, exactly as the trace shows it\./);
  ui.select(NODE);refuse(()=>addSpan(ui,{name:'find',service:'s',mode:'operationPrefix',value:'f',role:'database'}),'New span value',/A prefix needs at least 2 characters\./);
  ui.select(NODE);refuse(()=>addSpan(ui,{name:'cache',service:'s',mode:'attributes',value:'',role:'cache'}),'New span value',/Attributes-only matching needs an attribute: enter it as name=value, for example db\.system=redis\./);
  ui.select(NODE);addSpan(ui,{name:'process',service:'s',value:'v',role:'process'});ui.select(NODE);
  refuse(()=>addSpan(ui,{name:'process',service:'s',value:'w',role:'process'}),'New span name',/A span named process already exists here; choose another name\./);
  ui.select(NODE);refuse(()=>ui.set('process service',''),'process service',/A span needs its service name\. To delete the span, use Remove span\./);
  ui.select(NODE);ui.set('process value','proc');ui.set('process match','operationPrefix');ui.select(NODE);
  assert.equal(diagramOf(ui.raw).nodes.worker.trace.spans.process.operationPrefix,'proc');
  refuse(()=>ui.set('process value','p'),'process value',/A prefix needs at least 2 characters\./);
});

function imported(){
  const provider=spec('provider',{nodes:{api:{title:'API'},worker:{title:'Worker',trace:{spans:{
    process:{serviceName:'order-worker',operation:'process orders',role:'process'},find:{serviceName:'order-worker',operationPrefix:'find ',role:'database'}}}}},
    rows:[['api','worker']],edges:[{from:'api',to:'worker',label:'Publish',trace:{spans:{send:{serviceName:'order-api',operation:'publish orders',role:'send'}}}}],
    topologyExports:{core:{nodes:['api','worker'],edges:['api->worker']}}});
  const consumer=spec('consumer',{nodes:{},rows:[[]],steps:[],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{worker:{tickets:['ORD-9'],telemetry:{extends:true,kind:'service',signals:{up:{grafana:'up'}}}}}}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
test('E3 imported carriers: the overlay stores only the change; hide, revert, revert all, add; tickets and metrics kept',()=>{
  const f=imported(),before=JSON.stringify(f.provider),ui=harness(f.consumer,f.context);
  const INODE={kind:'node',section:0,id:'shared::worker'};ui.select(INODE);
  assert.ok(ui.editor(),'imported node Inspect has the editor');
  assert.deepEqual(ui.texts('.trace-span-origin'),['Inherited from provider','Inherited from provider'],'each inherited span names its provider');
  assert.equal(ui.control('process name').readOnly,true,'inherited span names are read only');
  const overlay=()=>plain(diagramOf(ui.raw).topologyImports[0].nodeTracking.worker);
  oneStep(ui,()=>ui.set('process value','process orders v2'),INODE);
  assert.deepEqual(overlay(),{tickets:['ORD-9'],telemetry:{extends:true,kind:'service',signals:{up:{grafana:'up'}}},trace:{spans:{process:{operation:'process orders v2'}}}},'only the changed field; tickets and metrics kept');
  assert.deepEqual(ui.texts('.trace-span-origin'),['Inherited from provider, changed here','Inherited from provider']);
  oneStep(ui,()=>ui.check('find hidden for this document',true),INODE);
  assert.deepEqual(overlay().trace,{spans:{process:{operation:'process orders v2'}},hide:['find']});
  assert.ok(ui.has('find hidden for this document'),'a hidden span is listed to show again');
  oneStep(ui,()=>ui.check('find hidden for this document',false),INODE);
  assert.deepEqual(overlay().trace,{spans:{process:{operation:'process orders v2'}}});
  oneStep(ui,()=>ui.click('Revert process to inherited'),INODE);
  assert.equal(Object.hasOwn(overlay(),'trace'),false,'reverting the only change removes the overlay trace');
  oneStep(ui,()=>addSpan(ui,{name:'audit',service:'order-worker',value:'audit write',role:'database'}),INODE);
  assert.deepEqual(overlay().trace,{spans:{audit:{serviceName:'order-worker',operation:'audit write',role:'database'}}});
  assert.ok(ui.texts('.trace-span-origin').includes('Added here'));
  oneStep(ui,()=>ui.set('find namespace','eu'),INODE);oneStep(ui,()=>ui.check('process hidden for this document',true),INODE);
  oneStep(ui,()=>ui.click('Revert all trace spans'),INODE);
  assert.deepEqual(overlay(),{tickets:['ORD-9'],telemetry:{extends:true,kind:'service',signals:{up:{grafana:'up'}}}},'Revert all is one edit and keeps tickets and metrics');
  // An imported connection: a field patch, then Remove of a span added here.
  const IEDGE={kind:'edge',section:0,index:diagramOf(ui.e.C.FlowTopology.resolveSource(ui.raw,f.context)).edges.findIndex(e=>e.from==='shared::api')};
  ui.select(IEDGE);
  oneStep(ui,()=>ui.set('send namespace','eu'),IEDGE);
  assert.deepEqual(plain(diagramOf(ui.raw).topologyImports[0].edgeTracking['api->worker']),{trace:{spans:{send:{namespace:'eu'}}}});
  assert.equal(JSON.stringify(f.provider),before,'the provider is untouched');
});

test('E4 E5 validator messages beside their span; the receive side of a connection; Declare receive span here',()=>{
  const d=board();diagramOf(d).nodes.worker.trace={spans:{process:{serviceName:'order-worker',operation:'process orders',role:'process'},bad:{serviceName:'order-worker',role:'process'}}};
  const ui=harness(d).select(NODE);
  assert.match(ui.beside('bad value'),/needs operation, operationPrefix or attributes/,'a missing match sits beside the value');
  assert.equal(ui.beside('process service'),'');
  ui.select(EDGE);
  assert.match(ui.texts('.trace-span-receiver').join(' '),/^Receive side: Worker's process span \(process: order-worker process orders\)\. Declare a receive span here only when the receiving span is a different one\.$/);
  oneStep(ui,()=>ui.click('Declare receive span here'),EDGE);
  assert.deepEqual(plain(diagramOf(ui.raw).edges[0].trace),{spans:{receive:{serviceName:'order-worker',operation:'process orders',role:'receive'}}});
  assert.deepEqual(plain(ui.e.C.FlowCanon.validate(ui.raw)).filter(e=>/^edges\./.test(e)),[],'the declared receive span is valid');
});

test('E6 a broken override is shown with its error, never turned into a hide; unsupported attributes are refused',()=>{
  const f=imported(),ui=harness(f.consumer,f.context),INODE={kind:'node',section:0,id:'shared::worker'};
  const overlay=()=>plain(diagramOf(ui.raw).topologyImports[0].nodeTracking.worker);
  ui.select(INODE);
  // Chain 1: the editor refuses an attribute the board cannot match, beside the field.
  let held=ui.text;ui.control('process new attribute name').value='not.allowed';ui.control('process new attribute value').value='1';ui.click('Add attribute to process');
  assert.equal(ui.text,held,'nothing written');
  assert.match(ui.beside('process new attribute name'),/^Attribute not\.allowed is not one this board can match\. Use a supported attribute such as db\.system, or list it in a trace connection's allowedAttributes\.$/);
  ui.select(INODE);held=ui.text;addSpan(ui,{name:'weird',service:'s',mode:'attributes',value:'weird.attr=1',role:'cache'});
  assert.equal(ui.text,held);assert.match(ui.beside('New span value'),/Attribute weird\.attr is not one this board can match/);
  // Chain 2: a hand-written broken override and a typo'd added entry are shown with their errors.
  const broken=JSON.parse(ui.text);diagramOf(broken).topologyImports[0].nodeTracking.worker.trace={spans:{process:{role:'send'},procss:{operation:'x'}}};
  ui.h.session.replaceProject(JSON.stringify(broken,null,2),null,{topologyContext:{version:1,id:'consumer',specs:[f.provider,broken]}});ui.select(INODE);
  assert.ok(ui.has('process service'),'the broken inherited span is shown, not hidden');
  assert.ok(!ui.h.guide.querySelector('fieldset.trace-span-hidden'),'nothing is listed as hidden');
  assert.match(ui.beside('process role'),/role must be one of process, database, cache, call, work/,'its error sits beside the field');
  assert.ok(ui.has('procss service'),'a typo\'d added entry is shown');
  assert.match(ui.beside('procss service')+ui.beside('procss value'),/the provider declares no span procss/);
  // An unrelated edit keeps both entries byte for byte and adds no hide.
  ui.set('find namespace','eu');
  assert.deepEqual(overlay().trace,{spans:{process:{role:'send'},procss:{operation:'x'},find:{namespace:'eu'}}},'the broken entries are kept as written; no hide');
  // Fixing the role mends the override.
  ui.select(INODE);ui.set('process role','process');
  assert.equal(Object.hasOwn(overlay().trace.spans,'process'),false,'back to the inherited role: no override left');
  // Locally the same attribute is refused before it reaches node.trace.
  const local=harness(board()).select(NODE);addSpan(local,{name:'process',service:'s',value:'v',role:'process'});local.select(NODE);
  held=local.text;local.control('process new attribute name').value='not.allowed';local.control('process new attribute value').value='1';local.click('Add attribute to process');
  assert.equal(local.text,held);assert.match(local.beside('process new attribute name'),/is not one this board can match/);
});

test('E7 rename a local or added span, keeping its fields and the trace scope skips that name it, in one Undo step',()=>{
  const d=board();diagramOf(d).nodes.worker.trace={spans:{find:{serviceName:'order-worker',operationPrefix:'find ',namespace:'eu',attributes:{'db.system':'mongodb'},role:'database'}}};
  diagramOf(d).steps.push({id:'work',text:'Work',nodes:['worker'],traceScope:{skip:{worker:['find','role:cache']}}});
  const ui=harness(d).select(NODE);
  assert.equal(ui.control('find name').readOnly,false,'local span names can be renamed');
  oneStep(ui,()=>ui.set('find name','lookup'),NODE);
  const raw=ui.raw;
  assert.deepEqual(plain(diagramOf(raw).nodes.worker.trace),{spans:{lookup:{serviceName:'order-worker',operationPrefix:'find ',namespace:'eu',attributes:{'db.system':'mongodb'},role:'database'}}},'every field is kept');
  assert.deepEqual(plain(diagramOf(raw).steps[1].traceScope.skip),{worker:['lookup','role:cache']},'the skip follows the new name');
  const before=ui.text;ui.set('lookup name','1bad');assert.equal(ui.text,before);assert.match(ui.beside('lookup name'),/A span name starts with a letter/);
  // An imported carrier: a span added here can be renamed; an inherited one cannot.
  const f=imported(),im=harness(f.consumer,f.context),INODE={kind:'node',section:0,id:'shared::worker'};im.select(INODE);
  addSpan(im,{name:'audit',service:'order-worker',value:'audit write',role:'database'});im.select(INODE);
  oneStep(im,()=>im.set('audit name','auditing'),INODE);
  assert.deepEqual(plain(diagramOf(im.raw).topologyImports[0].nodeTracking.worker.trace.spans),{auditing:{serviceName:'order-worker',operation:'audit write',role:'database'}});
  assert.equal(im.control('process name').readOnly,true);
});

test('E8 E9 a receiver without process spans says so and still offers a receive span; attribute values have a type',()=>{
  const ui=harness(board()).select(EDGE);
  assert.match(ui.texts('.trace-span-receiver').join(' '),/^The receiving node Worker declares no process span, so this connection reads send only\. Declare a receive span here to time the hand-off\.$/);
  ui.click('Declare receive span here');
  assert.equal(ui.control('New span name').value,'receive');assert.equal(ui.control('New span role').value,'receive');
  // Attribute types: a number value is stored as a number.
  ui.select(NODE);addSpan(ui,{name:'process',service:'s',value:'v',role:'process'});ui.select(NODE);
  ui.control('process new attribute name').value='http.response.status_code';ui.control('process new attribute value').value='200';ui.control('process new attribute type').value='number';
  oneStep(ui,()=>ui.click('Add attribute to process'),NODE);
  assert.equal(diagramOf(ui.raw).nodes.worker.trace.spans.process.attributes['http.response.status_code'],200);
  oneStep(ui,()=>ui.set('process attribute http.response.status_code type','string'),NODE);
  assert.equal(diagramOf(ui.raw).nodes.worker.trace.spans.process.attributes['http.response.status_code'],'200');
});

test('E10 a span name the provider declares is taken even while hidden here: rename and add are refused beside the name',()=>{
  const f=imported();f.provider.page.title='Order platform';const ui=harness(f.consumer,f.context),INODE={kind:'node',section:0,id:'shared::worker'};
  const overlay=()=>plain(diagramOf(ui.raw).topologyImports[0].nodeTracking.worker.trace);
  ui.select(INODE);
  // Every string in the editor names the provider by its title.
  assert.equal(ui.texts('.trace-span-origin')[0],'Inherited from Order platform');
  const words=()=>ui.h.guide.querySelectorAll('p').map(p=>p.textContent).join(' ');
  assert.match(words(),/imported from Order platform\. Changes here are stored in this document; everything else keeps following Order platform\./);
  assert.equal(ui.control('process name').title,'Inherited span names come from Order platform. To rename one, hide it and add a new span.');
  assert.match(ui.control('process hidden for this document').title,/Order platform keeps it/);
  ui.check('find hidden for this document',true);
  addSpan(ui,{name:'audit',service:'order-worker',value:'audit write',role:'database'});ui.select(INODE);
  const kept={spans:{audit:{serviceName:'order-worker',operation:'audit write',role:'database'}},hide:['find']};
  assert.deepEqual(overlay(),kept);
  let held=ui.text;ui.set('audit name','find');
  assert.equal(ui.text,held,'the rename changes nothing');
  const note=ui.h.guide.querySelectorAll('p').find(p=>p.id===ui.control('audit name').getAttribute('aria-describedby'));
  assert.equal(note.getAttribute('role'),'status','the note is announced when a refusal appears');
  assert.match(ui.beside('audit name'),/^The provider Order platform declares a span named find, hidden in this document; pick another name, or show find and change it instead\.$/);
  ui.select(INODE);held=ui.text;addSpan(ui,{name:'find',service:'other',value:'get',role:'cache'});
  assert.equal(ui.text,held,'the add changes nothing');
  assert.match(ui.beside('New span name'),/^The provider Order platform declares a span named find, hidden in this document; pick another name, or show find and change it instead\.$/);
  assert.deepEqual(overlay(),kept,'the hide is kept');
  ui.select(INODE);assert.equal(ui.control('find hidden for this document').title,'Clear to show find from Order platform again.');
  ui.set('process namespace','eu');ui.select(INODE);
  assert.match(ui.control('Revert process to inherited').title,/follows Order platform again/);
});

test('E11 a refused attribute type change says why beside the type it changed',()=>{
  const ui=harness(board()).select(NODE);addSpan(ui,{name:'process',service:'s',value:'v',role:'process'});ui.select(NODE);
  ui.control('process new attribute name').value='http.response.status_code';ui.control('process new attribute value').value='200';ui.control('process new attribute type').value='number';ui.click('Add attribute to process');
  const held=ui.text;ui.set('process attribute http.response.status_code type','boolean');
  assert.equal(ui.text,held,'nothing written');
  assert.match(ui.beside('process attribute http.response.status_code type'),/true or false/,'the message sits beside the type select');
  assert.equal(ui.beside('process new attribute name'),'','not beside the new attribute name');
  assert.equal(ui.control('process attribute http.response.status_code type').value,'number','the select goes back to the stored type');
});

test('E12 note slots stay in the page; each refusal clears its note and sets it again, so a repeated refusal is announced',()=>{
  const ui=harness(board()).select(NODE);addSpan(ui,{name:'process',service:'s',value:'handle',role:'process'});ui.select(NODE);
  let value=ui.control('process value');const note=()=>ui.h.guide.querySelectorAll('p').find(p=>p.classList.contains('trace-span-note') && p.id===value.getAttribute('aria-describedby'));
  assert.ok(ui.h.guide.querySelectorAll('p').filter(p=>p.classList.contains('trace-span-note')).length>0,'note slots exist before any refusal');
  assert.ok(ui.h.guide.querySelectorAll('p').filter(p=>p.classList.contains('trace-span-note')).every(p=>!p.hidden && p.getAttribute('role')==='status'),'note slots are status regions in the page, not hidden');
  ui.set('process match','operationPrefix');ui.select(NODE);value=ui.control('process value');
  value.value='x';value.fire('change');
  assert.equal(note().textContent,'','the refusal first clears the note');
  ui.h.flush();assert.match(note().textContent,/A prefix needs at least 2 characters/,'then sets it');
  value.value='y';value.fire('change');
  assert.equal(note().textContent,'','a repeated refusal clears it again');
  ui.h.flush();assert.match(note().textContent,/A prefix needs at least 2 characters/,'and sets it again');
});

test('E13 a hide or revert of a span the provider does not declare names the provider by its title',()=>{
  const f=imported();f.provider.page.title='Order platform';const ui=harness(f.consumer,f.context),INODE={kind:'node',section:0,id:'shared::worker'};
  ['hide','revert'].forEach(op=>{
    const plan=ui.e.C.planCarrierTraceSpans(ui.text,ui.raw,INODE,{op,name:'nope',value:true},f.context);
    assert.equal(plan.error,'Span nope is not inherited from Order platform.');
  });
});

test('E14 Links "Edit in Inspect" asks Inspect to open the Trace spans fold for the next selection only',()=>{
  const d=board();diagramOf(d).nodes.worker.trace={spans:{process:{serviceName:'order-worker',operation:'process orders',role:'process'}}};
  const ui=harness(d);
  assert.equal(typeof ui.h.inspector.revealTraceSpans,'function','the Inspector offers revealTraceSpans');
  ui.select(EDGE);assert.equal(ui.editor().open,false,'closed by default');
  ui.h.inspector.revealTraceSpans(NODE);ui.select(EDGE);assert.equal(ui.editor().open,false,'another carrier\'s render leaves the request');ui.select(NODE);
  assert.equal(ui.editor().open,true,'open for the carrier Links asked for');
  ui.select(EDGE);assert.equal(ui.editor().open,false,'only once');
});
