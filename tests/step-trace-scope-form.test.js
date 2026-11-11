'use strict';
/* #1290 PR 7: the Workbench step trace scope form (desktop Inspect → step → Code and trace
   evidence). A step maps a loaded trace either by its own span (traceMatch, #1238 form) or from
   the spans declared on the nodes and connections it lights (traceScope). Browser coverage:
   tools/browser-tests/tests/step-trace-scope-form.spec.mjs.
| row | rule |
|---|---|
| S1 | Without a scope the form says what the step inherits, naming a shared node or connection and the other step by title, per path when paths differ (as the core D9 rule counts); a receive-only connection gets a hint; a step whose carriers declare nothing opens on its own span as before, and its scope view says so; the spans are listed read only. |
| S2 | Mode switch: the radios change only the view; "Use its nodes and connections (removes this step's trace match)", Add trace scope, Remove trace scope and Add trace match (replaces the scope) are one Undo step each. |
| S3 | Skip checkboxes name the span, its service and its operation; checked means the span counts; unchecking writes skip, checking again removes it (no empty skip left); role checkboxes write role:<role>; a connection lists only its send spans and says a receive span times the hand-off. |
| S4 | An imported node lists its merged spans (consumer overlay added and hidden spans included); skip uses the namespaced id; the import is untouched. |
| S5 | Trace root (both fields, one edit), Parent step (no self, no loop), attributes (allowlist, types), Optional, Time budget and Max queue depth: each one Undo step; refusals say why beside the field and change nothing. |
| S6 | A skip that names a span or carrier the step no longer has is listed with its reason and a Remove button. |
| S7 | A step without an ID cannot take a scope: the refusal sits beside Add trace scope and Go to Step ID focuses the existing Step ID field. |
| S8 | Validator messages for the step's traceScope sit beside the field they name, in status notes; the fold summary counts them. |
| S9 | Renaming a step ID rewrites traceMatch.parentStepId and traceScope.parentStepId references to it in the same edit (one Undo step). |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/inspector','workbench/io-model']
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
function boards(){
  const provider=spec('provider',{nodes:{store:{title:'Store',trace:{spans:{write:{serviceName:'store-svc',operation:'INSERT orders',role:'database'},read:{serviceName:'store-svc',operationPrefix:'SELECT ',role:'database'}}}}},
    rows:[['store']],topologyExports:{core:{nodes:['store'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{
      api:{title:'API',trace:{spans:{handle:{serviceName:'order-api',operation:'POST /orders',role:'process'}}}},
      worker:{title:'Worker',trace:{spans:{process:{serviceName:'order-worker',operation:'process orders',role:'process'},find:{serviceName:'order-worker',operationPrefix:'find ',role:'database'},cache:{serviceName:'order-worker',attributes:{'db.system':'redis'},role:'cache'}}}},
      plain:{title:'Plain'}},
    rows:[['api','worker','plain']],
    edges:[{from:'api',to:'worker',label:'Publish',trace:{spans:{publish:{serviceName:'order-api',operation:'publish orders',role:'send'},receive:{serviceName:'order-worker',operation:'receive orders',role:'receive'}}}}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{store:{trace:{spans:{audit:{serviceName:'store-svc',operation:'audit write',role:'database'}},hide:['read']}}}}],
    steps:[
      {id:'request',text:'Request',nodes:['api'],traceMatch:{serviceName:'order-api',operation:'POST /orders'}},
      {id:'publish',text:'Publish',edge:'api->worker'},
      {id:'work',text:'Work',nodes:['worker']},
      {id:'again',text:'Work again',nodes:['worker']},
      {id:'store',text:'Store it',nodes:['shared::store']},
      {text:'No id',nodes:['plain']},
      {id:'bare',text:'Bare',nodes:['plain']}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
function harness(edit){
  const f=boards();if(edit)edit(diagramOf(f.consumer),f);
  const e=inspectorEnvironment(names),h=e.mount(f.consumer);
  h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  let current=null;
  const ui={e,h,f,
    select(index){current={kind:'step',section:0,index};h.session.target=current;h.inspector.render();return ui;},
    reselect(){h.session.target=current;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    step(i){return diagramOf(ui.raw).steps[i];},
    has(name){return !!h.guide.querySelectorAll('input,select,textarea,button').find(c=>c.getAttribute('aria-label')===name || c.tagName==='BUTTON' && !c.getAttribute('aria-label') && c.textContent===name);},
    control(name){const el=h.guide.querySelectorAll('input,select,textarea,button').find(c=>c.getAttribute('aria-label')===name || c.tagName==='BUTTON' && !c.getAttribute('aria-label') && c.textContent===name);assert.ok(el,'control "'+name+'" exists');return el;},
    set(name,value){const el=ui.control(name);el.value=value;el.fire('change');h.flush();return ui;},
    check(name,on){const el=ui.control(name);el.checked=on;el.fire('change');h.flush();return ui;},
    click(name){ui.control(name).fire('click');h.flush();return ui;},
    texts(selector){return h.guide.querySelectorAll(selector).map(x=>x.textContent);},
    beside(name){const el=ui.control(name),id=el.getAttribute('aria-describedby');return id?(h.guide.querySelectorAll('p').find(p=>p.id===id) || {}).textContent || '':'';},
    note(name){const el=ui.control(name),id=el.getAttribute('aria-describedby');return id?h.guide.querySelectorAll('p').find(p=>p.id===id):null;}};
  return ui;
}
function oneStep(ui,act){
  const before=ui.text;act();const after=ui.text;assert.notEqual(after,before,'the edit changed the source');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'Undo restores the exact prior text');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after,'Redo restores the exact next text');
  ui.reselect();return after;
}
const refused=(ui,act)=>{const before=ui.text;act();assert.equal(ui.text,before,'a refusal changes nothing');};
const SCOPE='From its nodes and connections (trace scope)',OWN='Own span (trace match)';

test('S1 without a scope: what the step inherits, the shared carrier and the other step by title, read-only spans',()=>{
  const ui=harness();
  assert.equal(typeof ui.e.C.planStepTraceScope,'function','planStepTraceScope is a Workbench step command (src/workbench/commands/narrative.js)');
  ui.select(2);
  assert.equal(ui.control(SCOPE).checked,true,'a step without a trace match opens on its nodes and connections');assert.equal(ui.control(OWN).checked,false);
  assert.deepEqual(ui.texts('.trace-scope-status'),['Inherits nothing: Worker is also lit by step “Work again”; add a trace scope to choose its spans.']);
  assert.deepEqual(ui.texts('.trace-scope-span'),['process · order-worker process orders','find · order-worker find … (prefix)','cache · order-worker where db.system=redis']);
  assert.equal(ui.has('process on Worker counts for this step'),false,'without a scope the spans are read only');
  ui.select(4);
  assert.deepEqual(ui.texts('.trace-scope-status'),['Inherits from Store (2 spans).']);
  assert.deepEqual(ui.texts('.trace-scope-span'),['write · store-svc INSERT orders','audit · store-svc audit write'],'the merged spans: the overlay adds audit and hides read');
  ui.select(1);
  assert.deepEqual(ui.texts('.trace-scope-status'),['Inherits from API → Worker (1 span).']);
  ui.select(6);
  assert.equal(ui.control(OWN).checked,true,'a step whose nodes declare no spans opens on its own span, as before');
  ui.check(SCOPE,true);
  assert.deepEqual(ui.texts('.trace-scope-status'),['Its nodes and connections declare no trace spans, so a loaded trace leaves this step unmapped. Declare spans in Inspect on a node or connection, or use a trace match.']);
  ui.select(0);
  assert.equal(ui.control(OWN).checked,true,'a step with a trace match opens on its own span');
  assert.ok(ui.h.guide.querySelector('fieldset.trace-match-editor'),'the #1238 form is shown');
  // Sharing is per path, as the core and the validator count it: Work again is only on Path A.
  const two=harness(d=>{d.paths=[{id:'a',label:'Path A',steps:['request','publish','work','again']},{id:'b',label:'Path B',steps:['request','work','store']}];}).select(2);
  assert.deepEqual(two.texts('.trace-scope-status'),['On Path A: inherits nothing (Worker is also lit by step “Work again”). On Path B: inherits from Worker (3 spans).']);
  assert.deepEqual(two.texts('.trace-scope-also'),['Also lit by step “Work again” on Path A.']);
  two.select(4);
  assert.deepEqual(two.texts('.trace-scope-status'),['Inherits from Store (2 spans).'],'one path: the plain line');
  // A connection that declares only a receive span gives an edge step nothing of its own.
  const recv=harness(d=>{delete d.edges[0].trace.spans.publish;}).select(1);
  assert.deepEqual(recv.texts('.trace-scope-status'),['Inherits nothing: its nodes and connections declare no spans this step can own.']);
  assert.deepEqual(recv.texts('.trace-scope-hint'),['This connection declares only a receive span; declare a send span on it for this step to have spans of its own.']);
});

test('S2 mode switch: radios change the view only; each write is one Undo step',()=>{
  const ui=harness().select(0);
  let before=ui.text;ui.check(SCOPE,true);assert.equal(ui.text,before,'the radio writes nothing');
  assert.equal(ui.control(SCOPE).checked,true);
  oneStep(ui,()=>ui.click('Use its nodes and connections (removes this step\'s trace match)'));
  assert.deepEqual(plain(ui.step(0)),{id:'request',text:'Request',nodes:['api'],traceScope:{}});
  ui.check(OWN,true);
  ui.control('new trace match service name').value='order-api';ui.control('new trace match operation').value='POST /orders';
  oneStep(ui,()=>ui.click('Add trace match (replaces this step\'s trace scope)'));
  assert.deepEqual(plain(ui.step(0)),{id:'request',text:'Request',nodes:['api'],traceMatch:{serviceName:'order-api',operation:'POST /orders'}});
  ui.select(2);
  oneStep(ui,()=>ui.click('Add trace scope'));
  assert.deepEqual(plain(ui.step(2).traceScope),{});
  assert.deepEqual(ui.texts('.trace-scope-status'),['Inherits from Worker (3 of 3 spans).']);
  oneStep(ui,()=>ui.click('Remove trace scope'));
  assert.equal(Object.hasOwn(ui.step(2),'traceScope'),false);
});

test('S3 skip checkboxes: name, service and operation; checked counts; roles; a connection lists its send spans',()=>{
  const ui=harness(d=>{d.steps[2].traceScope={};d.steps[1].traceScope={};}).select(2);
  const box=ui.control('process on Worker counts for this step');
  assert.equal(box.type,'checkbox');assert.equal(box.checked,true);
  assert.deepEqual(ui.texts('.trace-scope-span'),['process · order-worker process orders','find · order-worker find … (prefix)','cache · order-worker where db.system=redis']);
  oneStep(ui,()=>ui.check('process on Worker counts for this step',false));
  assert.deepEqual(plain(ui.step(2).traceScope),{skip:{worker:['process']}});
  assert.deepEqual(ui.texts('.trace-scope-status'),['Inherits from Worker (2 of 3 spans).']);
  assert.equal(ui.control('process on Worker counts for this step').checked,false);
  oneStep(ui,()=>ui.check('process on Worker counts for this step',true));
  assert.deepEqual(plain(ui.step(2).traceScope),{},'checking it again leaves no empty skip');
  oneStep(ui,()=>ui.check('database spans on Worker count for this step',false));
  assert.deepEqual(plain(ui.step(2).traceScope),{skip:{worker:['role:database']}});
  assert.equal(ui.control('find on Worker counts for this step').checked,false);assert.equal(ui.control('find on Worker counts for this step').disabled,true);
  assert.match(ui.beside('find on Worker counts for this step'),/^Not counted: every database span on Worker is skipped\.$/);
  ui.select(1);
  assert.equal(ui.control('publish on API → Worker counts for this step').checked,true);
  assert.equal(ui.has('receive on API → Worker counts for this step'),false,'a receive span is not the step\'s own span');
  assert.equal(ui.has('send spans on API → Worker count for this step'),false,'no role boxes on a connection');
  assert.deepEqual(ui.texts('.trace-scope-handoff'),['receive · order-worker receive orders times the hand-off; it is not this step\'s span.']);
  oneStep(ui,()=>ui.check('publish on API → Worker counts for this step',false));
  assert.deepEqual(plain(ui.step(1).traceScope),{skip:{'api->worker':['publish']}});
  assert.deepEqual(ui.texts('.trace-scope-status'),['Inherits nothing: every declared span is skipped.']);
});

test('S4 an imported node: merged spans, a namespaced skip, the import untouched',()=>{
  const ui=harness(d=>{d.steps[4].traceScope={};}).select(4),imports=JSON.stringify(diagramOf(ui.raw).topologyImports);
  assert.equal(ui.control('write on Store counts for this step').checked,true);
  assert.equal(ui.control('audit on Store counts for this step').checked,true,'a span the consumer added');
  assert.equal(ui.has('read on Store counts for this step'),false,'a span the consumer hid');
  oneStep(ui,()=>ui.check('audit on Store counts for this step',false));
  assert.deepEqual(plain(ui.step(4).traceScope),{skip:{'shared::store':['audit']}});
  assert.equal(JSON.stringify(diagramOf(ui.raw).topologyImports),imports,'the import and its overlay are untouched');
  assert.deepEqual(plain(ui.e.C.FlowCanon.validate(ui.raw)).filter(m=>/traceScope/.test(m)),[]);
});

test('S5 root, parent, attributes, optional, budget and queue depth: one Undo each; refusals beside the field',()=>{
  const ui=harness(d=>{d.steps[3].traceScope={};}).select(3),scope=()=>plain(ui.step(3).traceScope);
  // Trace root: both fields in one edit.
  ui.control('Trace root service').value='web';
  refused(ui,()=>ui.click('Set trace root'));
  assert.equal(ui.beside('Trace root operation'),'Enter the root operation too: a trace root is a service and an operation.');
  ui.control('Trace root service').value='web';ui.control('Trace root operation').value='POST /checkout';
  oneStep(ui,()=>ui.click('Set trace root'));assert.deepEqual(scope(),{root:{serviceName:'web',operation:'POST /checkout'}});
  oneStep(ui,()=>ui.set('Trace root operation','POST /cart'));assert.deepEqual(scope().root,{serviceName:'web',operation:'POST /cart'});
  refused(ui,()=>ui.set('Trace root service',''));
  assert.match(ui.beside('Trace root service'),/^A trace root needs a service and an operation\. To remove it, use Clear trace root\.$/);
  oneStep(ui,()=>ui.click('Clear trace root'));assert.equal(Object.hasOwn(scope(),'root'),false);
  // Parent step: steps with an ID, never this one.
  assert.deepEqual(ui.control('Parent step').options.map(o=>o.value),['','request','publish','work','store','bare']);
  assert.equal(ui.control('Parent step').options.find(o=>o.value==='work').textContent,'“Work” (work)');
  oneStep(ui,()=>ui.set('Parent step','work'));assert.equal(scope().parentStepId,'work');
  ui.select(2);oneStep(ui,()=>ui.click('Add trace scope'));
  refused(ui,()=>ui.set('Parent step','again'));
  assert.equal(ui.beside('Parent step'),'Step “Work again” already depends on this step, so this would loop. Choose another parent step.');
  ui.select(3);oneStep(ui,()=>ui.set('Parent step',''));assert.equal(Object.hasOwn(scope(),'parentStepId'),false);
  // Attributes: the board's allowlist, and a type.
  ui.control('new scope attribute name').value='not.allowed';ui.control('new scope attribute value').value='x';
  refused(ui,()=>ui.click('Add scope attribute'));
  assert.equal(ui.beside('new scope attribute name'),'Attribute not.allowed is not one this board can match. Use a supported attribute such as db.system, or list it in a trace connection\'s allowedAttributes.');
  ui.control('new scope attribute name').value='http.response.status_code';ui.control('new scope attribute value').value='200';ui.control('new scope attribute type').value='number';
  oneStep(ui,()=>ui.click('Add scope attribute'));assert.deepEqual(scope().attributes,{'http.response.status_code':200});
  oneStep(ui,()=>ui.set('scope attribute http.response.status_code type','string'));assert.deepEqual(scope().attributes,{'http.response.status_code':'200'});
  refused(ui,()=>ui.set('scope attribute http.response.status_code type','boolean'));
  assert.match(ui.beside('scope attribute http.response.status_code type'),/true or false/);
  oneStep(ui,()=>ui.click('Remove scope attribute http.response.status_code'));assert.equal(Object.hasOwn(scope(),'attributes'),false);
  // Optional, Time budget, Max queue depth.
  oneStep(ui,()=>ui.check('Optional',true));assert.equal(scope().optional,true);
  oneStep(ui,()=>ui.check('Optional',false));assert.equal(Object.hasOwn(scope(),'optional'),false);
  oneStep(ui,()=>ui.set('Time budget (ms)','250'));assert.equal(scope().maxDurationMs,250);
  refused(ui,()=>ui.set('Time budget (ms)','-1'));assert.equal(ui.beside('Time budget (ms)'),'Time budget is a number of milliseconds, 0 or more.');
  oneStep(ui,()=>ui.set('Time budget (ms)',''));assert.equal(Object.hasOwn(scope(),'maxDurationMs'),false);
  oneStep(ui,()=>ui.set('Max queue depth','10'));assert.equal(scope().maxQueueDepth,10);
  refused(ui,()=>ui.set('Max queue depth','many'));assert.equal(ui.beside('Max queue depth'),'Max queue depth is a number, 0 or more.');
  assert.equal(ui.note('Max queue depth').getAttribute('role'),'status','refusals are announced');
  assert.deepEqual(plain(ui.e.C.FlowCanon.validate(ui.raw)).filter(m=>/traceScope/.test(m)),[]);
});

test('S6 a skip that no longer applies is listed with its reason and can be removed',()=>{
  const ui=harness(d=>{d.steps[2].traceScope={skip:{worker:['gone','role:audit','process'],ghost:['x']}};}).select(2);
  assert.deepEqual(ui.texts('.trace-scope-stale'),['Skip gone on Worker: Worker declares no span gone.','Skip role:audit on Worker: Worker declares no span with role audit.','Skip x on ghost: this step does not light ghost.']);
  oneStep(ui,()=>ui.click('Remove skip gone from Worker'));
  assert.deepEqual(plain(ui.step(2).traceScope.skip),{worker:['role:audit','process'],ghost:['x']});
  oneStep(ui,()=>ui.click('Remove skip x from ghost'));
  assert.deepEqual(plain(ui.step(2).traceScope.skip),{worker:['role:audit','process']});
});

test('S7 a step without an ID: the refusal sits beside Add trace scope and Go to Step ID focuses the Step ID field',()=>{
  const ui=harness().select(5);ui.check(SCOPE,true);
  refused(ui,()=>ui.click('Add trace scope'));
  assert.equal(ui.beside('Add trace scope'),'A trace scope needs a stable step ID. Enter one in Step ID above, then add the scope.');
  ui.click('Go to Step ID');
  const focused=ui.e.doc.activeElement;
  assert.ok(focused && focused.tagName==='INPUT' && focused.placeholder==='optional stable-step-id','the existing Step ID field has focus');
});

test('S8 validator messages sit beside their field; the fold summary counts them',()=>{
  const ui=harness(d=>{d.steps[3].traceScope={maxDurationMs:-5,parentStepId:'nope',root:{serviceName:'web'}};}).select(3);
  assert.match(ui.beside('Time budget (ms)'),/traceScope\.maxDurationMs: nonnegative number required/);
  assert.match(ui.beside('Parent step'),/traceScope: unknown or self parentStepId/);
  assert.equal(ui.control('Parent step').options.find(o=>o.value==='nope').textContent,'nope (unknown)','an unknown parent stays visible');
  assert.match(ui.beside('Trace root service'),/traceScope\.root: expected \{serviceName, operation\}/);
  assert.equal(ui.note('Trace root service').getAttribute('role'),'status');
  assert.equal(ui.texts('summary').find(x=>x.startsWith('Code and trace evidence')),'Code and trace evidence · trace scope set · 3 warnings');
  // In a document that imports, an edit that leaves the materialized spec invalid is not applied and says why (#1238 rule).
  refused(ui,()=>ui.set('Time budget (ms)','100'));
  assert.match((ui.h.guide.querySelector('.ierr') || {}).textContent || '',/^This edit was not applied: .*unknown or self parentStepId/);
  ui.reselect();oneStep(ui,()=>ui.click('Remove trace scope'));
  assert.equal(Object.hasOwn(ui.step(3),'traceScope'),false);
  assert.equal(ui.texts('summary').find(x=>x.startsWith('Code and trace evidence')),'Code and trace evidence');
});

test('S9 renaming a step ID rewrites the trace match and trace scope parent references to it, in one Undo step',()=>{
  const ui=harness(d=>{d.steps[3].traceScope={parentStepId:'work'};
    d.steps[1].traceMatch=[{serviceName:'order-api',operation:'publish orders',parentStepId:'work'},{serviceName:'order-api',operation:'publish',parentStepId:'request'}];
    d.steps[6].traceMatch={serviceName:'x',operation:'y',parentStepId:'work'};}).select(2);
  const id=ui.h.guide.querySelectorAll('input').find(i=>i.placeholder==='optional stable-step-id');
  assert.equal(id.value,'work');
  oneStep(ui,()=>{id.value='labor';id.fire('change');ui.h.flush();});
  const steps=diagramOf(ui.raw).steps;
  assert.equal(steps[2].id,'labor');
  assert.equal(steps[3].traceScope.parentStepId,'labor');
  assert.deepEqual(plain(steps[1].traceMatch).map(m=>m.parentStepId),['labor','request']);
  assert.equal(steps[6].traceMatch.parentStepId,'labor');
  assert.deepEqual(plain(ui.e.C.FlowCanon.validate(ui.raw)).filter(m=>/parentStepId/.test(m)),[]);
});
