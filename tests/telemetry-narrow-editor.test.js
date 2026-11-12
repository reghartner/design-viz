'use strict';
/* #1363 (epic #1344, narrowing PR 5): the desktop Workbench editor for `narrow`, `needsNarrow` and
   scoped `variables`, in Inspect → Tracking → Metrics. Imported nodes and connections are the main
   case and edit like local ones. Desktop only.
| row | rule | fixture | structurally scoped assertion | plausible broken implementation it rejects |
|---|---|---|---|---|
| E1 | An imported signal's narrowing: Add narrowing stores only the board's fragment after the inherited ones; inherited fragments cannot be removed; a refused fragment is not stored; an edit of another field keeps the narrowing and writes no null; removing the last own fragment removes the overlay. | provider Loki signal with needsNarrow code and a provider `| json`; consumer importing it | the consumer overlay; plan errors; source unchanged on refusal | storing the whole merged list; dropping narrow on a unit edit; writing narrow:null |
| E2 | Round trip: mergeTelemetry(inherited, telemetryDiffImported(inherited, effective)) equals effective with inherited and board fragments and needsNarrow; the diff holds only the board's fragments and fields. | same | canonical equality; diff contents | a diff that repeats the inherited fragments or nulls them |
| E3 | A local signal: add and remove narrowing (text and Honeycomb JSON), set needsNarrow (fields, any, clear); other field edits keep both. | local node with Loki and Honeycomb signals | the node's telemetry | losing narrow on an edit; storing invalid JSON |
| E4 | An imported needsNarrow can add fields, never drop the provider's. | E1 fixture | overlay; plan error | a board removing the provider's requirement |
| E5 | Variables: for this node or connection (telemetry.variables; on imported carriers in the overlay, kept across other edits) and for the import (topologyImports[i].variables); invalid values refused; empty removes. | local node; E1 fixture | the written objects; errors | variables dropped by a later edit; writing the import's into the carrier |
| E6 | The read model gives each signal the viewer's Not shown reason and the query sent: an unmet needsNarrow, a narrowed query, an unset and a refused scoped variable (with the copy hint). | E1 fixture plus a `${code}` signal | state.sent | an editor that shows a different reason than the viewer |
| E7 | The inspector shows inherited fragments read-only, the board's with Remove, Add narrowing, Not shown, Query sent, needsNarrow, both Variables rows and Copy provider queries; each edit is one Undo step; a refused fragment shows its reason and changes nothing. | E1 fixture in the inspector | control labels, notes, one Undo each | edits outside the Inspect panel; multi-step history |
| E8 | Copy provider queries turns an imported carrier's merge overlay into a replacing binding with the same resolved metrics, one Undo step; a local carrier refuses it. | E1 fixture | overlay is the effective binding without extends; resolved telemetry unchanged | a copy that loses the narrowing or needsNarrow |
| E9 | docs/live-status.md "Workbench" names the narrowing and variables controls. | docs | each control name | missing docs |
| E10 | (review c1) What the provider requires is read-only and cannot be dropped: a provider's binding-level needsNarrow on an imported carrier, and the carrier's requirement on a copied (replacing) binding; the editable field holds only the board's own fields. | provider binding with a binding-level needsNarrow; the E1 fixture after Copy provider queries | read model needs; read-only control; plan errors | a field that clears the provider's requirement without a word |
| W1 | Workbench → spec → viewer, desktop: tools/browser-tests/tests/metrics-narrow-editor.spec.mjs. | n/a | n/a | n/a |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/trace-connections-editor','workbench/inspector','workbench/io-model']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>JSON.stringify(v,(k,x)=>x && typeof x==='object' && !Array.isArray(x)?Object.keys(x).sort().reduce((o,key)=>(o[key]=x[key],o),{}):x);
const LOKI='sum(count_over_time({app="dcf"}[5m]))',BYCODE='sum(count_over_time({app="dcf", code="${code}"}[5m]))';
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
function fixtures(signals){
  const provider=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:signals || {sent:{loki:LOKI,needsNarrow:['code'],narrow:{loki:'| json'}},up:{grafana:'up{job="dcf"}'}}}}},
    rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local',telemetry:{kind:'service',signals:{n:{loki:LOKI},hc:{honeycomb:{calculations:[{op:'COUNT'}]}}}}}},rows:[['local']],edges:[],
    panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'provider',export:'core',as:'fc'}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
const diagramOf=s=>s.page.sections[0].diagram;
const NODE={kind:'node',section:0,id:'fc::dcf'},LOCAL={kind:'node',section:0,id:'local'};
function planner(f){
  const e=inspectorEnvironment(names),C=e.C;
  for(const name of ['planCarrierTelemetry','telemetryCarrierState','telemetryDiffImported'])assert.ok(typeof C[name]==='function',name+' exists');
  let text=JSON.stringify(f.consumer,null,2),raw=JSON.parse(text);
  const p={C,
    get raw(){return raw;},get text(){return text;},
    plan(target,edit){return C.planCarrierTelemetry(text,raw,target,edit,f.context);},
    apply(target,edit){const plan=p.plan(target,edit);assert.equal(plan.error,undefined,plan.error);text=plan.text;raw=JSON.parse(text);return p;},
    refuse(target,edit,pattern){const plan=p.plan(target,edit);assert.match(plan.error || '',pattern,JSON.stringify(edit));return plan.error;},
    state(target){return C.telemetryCarrierState(raw,target,f.context);},
    overlay(){const t=diagramOf(raw).topologyImports[0].nodeTracking;return t && t.dcf?t.dcf.telemetry:undefined;},
    local(){return diagramOf(raw).nodes.local.telemetry;},
    resolved(){return plain(diagramOf(C.FlowTopology.resolveSource(raw,f.context)).nodes['fc::dcf'].telemetry);}};
  return p;
}

test('E1 an imported signal: Add narrowing stores only the board\'s fragment; inherited ones stay; refusals change nothing',()=>{
  const f=fixtures(),p=planner(f),providerBefore=JSON.stringify(f.provider);
  const s=p.state(NODE);
  assert.ok(s.narrow && s.narrow.sent,'the read model lists each signal\'s narrowing');
  assert.deepEqual(plain(s.narrow.sent),{source:'loki',inherited:['| json'],own:[],needs:{inherited:['code'],own:[]}});
  p.apply(NODE,{op:'narrow',name:'sent',action:'add',fragment:'| code="A"'});
  assert.deepEqual(plain(p.overlay()),{extends:true,signals:{sent:{narrow:{loki:['| code="A"']}}}},'only the board\'s fragment is stored');
  assert.deepEqual(plain(p.state(NODE).narrow.sent),{source:'loki',inherited:['| json'],own:['| code="A"'],needs:{inherited:['code'],own:[]}});
  const before=p.text;
  p.refuse(NODE,{op:'narrow',name:'sent',action:'remove',index:0},/from the provider/);
  p.refuse(NODE,{op:'narrow',name:'sent',action:'add',fragment:'| code="B" | drop x'},/second "\|"/);
  p.refuse(NODE,{op:'narrow',name:'sent',action:'add',fragment:'  '},/narrowing/);
  assert.equal(p.text,before,'refusals change nothing');
  p.apply(NODE,{op:'signal',name:'sent',field:'unit',value:'events'});
  assert.deepEqual(plain(p.overlay()),{extends:true,signals:{sent:{narrow:{loki:['| code="A"']},unit:'events'}}},'another field edit keeps the narrowing and writes no null');
  p.apply(NODE,{op:'signal',name:'sent',field:'unit',value:null});
  p.apply(NODE,{op:'narrow',name:'sent',action:'remove',index:1});
  assert.equal(p.overlay(),undefined,'removing the last own fragment leaves nothing to store');
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider is untouched');
});

test('E2 round trip: merge(inherited, diff(inherited, effective)) equals effective with fragments and needsNarrow',()=>{
  const f=fixtures(),p=planner(f),C=p.C,inherited=plain(p.state(NODE).inherited);
  const effective=plain(inherited);
  effective.signals.sent.narrow={loki:['| json','| code="A"','|= "x"']};effective.signals.sent.needsNarrow=['code','type'];
  effective.signals.up.narrow={grafana:['job="dcf"']};effective.signals.up.unit='req/s';
  const diff=plain(C.telemetryDiffImported(inherited,effective,null));
  assert.deepEqual(diff,{extends:true,signals:{sent:{narrow:{loki:['| code="A"','|= "x"']},needsNarrow:['type']},up:{narrow:{grafana:['job="dcf"']},unit:'req/s'}}},'the diff holds only the board\'s fragments and fields');
  assert.equal(canonical(C.FlowTopology.mergeTelemetry(inherited,diff)),canonical(effective),'the round trip is exact');
  assert.doesNotMatch(JSON.stringify(diff),/null/,'no null for narrow or needsNarrow');
});

test('E3 a local signal: add and remove narrowing, Honeycomb JSON fragments, needsNarrow; other edits keep both',()=>{
  const f=fixtures(),p=planner(f);
  p.apply(LOCAL,{op:'narrow',name:'n',action:'add',fragment:'| code="A"'});
  assert.deepEqual(plain(p.local().signals.n),{loki:LOKI,narrow:{loki:['| code="A"']}});
  p.apply(LOCAL,{op:'needsNarrow',name:'n',value:'code, type'});
  assert.deepEqual(plain(p.local().signals.n.needsNarrow),['code','type']);
  p.apply(LOCAL,{op:'signal',name:'n',field:'unit',value:'events'});
  assert.deepEqual(plain(p.local().signals.n),{loki:LOKI,unit:'events',narrow:{loki:['| code="A"']},needsNarrow:['code','type']},'a unit edit keeps narrow and needsNarrow');
  p.apply(LOCAL,{op:'signal',name:'n',field:'query',value:'sum(count_over_time({app="other"}[5m]))'});
  assert.deepEqual(plain(p.local().signals.n.narrow),{loki:['| code="A"']},'a query edit keeps the narrowing');
  p.apply(LOCAL,{op:'needsNarrow',name:'n',value:'any'});assert.equal(p.local().signals.n.needsNarrow,true);
  p.apply(LOCAL,{op:'needsNarrow',name:'n',value:null});assert.equal(Object.hasOwn(p.local().signals.n,'needsNarrow'),false);
  p.apply(LOCAL,{op:'narrow',name:'n',action:'remove',index:0});assert.equal(Object.hasOwn(p.local().signals.n,'narrow'),false,'no empty narrow is left');
  p.apply(LOCAL,{op:'narrow',name:'hc',action:'add',fragment:'{"filters":[{"column":"code","op":"=","value":"A"}]}'});
  assert.deepEqual(plain(p.local().signals.hc.narrow),{honeycomb:[{filters:[{column:'code',op:'=',value:'A'}]}]});
  p.refuse(LOCAL,{op:'narrow',name:'hc',action:'add',fragment:'code = A'},/JSON/);
  p.refuse(LOCAL,{op:'narrow',name:'hc',action:'add',fragment:'{"column":"code"}'},/Honeycomb narrowing/);
  p.refuse(LOCAL,{op:'narrow',name:'missing',action:'add',fragment:'| a="1"'},/not found/);
});

test('E4 an imported needsNarrow adds fields and never drops the provider\'s',()=>{
  const f=fixtures(),p=planner(f);
  p.apply(NODE,{op:'needsNarrow',name:'sent',value:'code, type'});
  assert.deepEqual(plain(p.overlay()),{extends:true,signals:{sent:{needsNarrow:['type']}}});
  p.refuse(NODE,{op:'needsNarrow',name:'sent',value:'type'},/provider/);
  p.refuse(NODE,{op:'needsNarrow',name:'sent',value:null},/provider/);
  p.apply(NODE,{op:'needsNarrow',name:'sent',value:'code'});
  assert.equal(p.overlay(),undefined,'back to the provider\'s requirement: nothing to store');
});

test('E5 variables for this node or connection and for the import',()=>{
  const f=fixtures(),p=planner(f);
  p.apply(LOCAL,{op:'variables',value:'{"code":"A"}'});assert.deepEqual(plain(p.local().variables),{code:'A'});
  p.refuse(LOCAL,{op:'variables',value:'{"code":1}'},/string/);
  p.refuse(LOCAL,{op:'variables',value:'{"env":"x"}'},/reserved/);
  p.refuse(LOCAL,{op:'variables',value:'not json'},/JSON/);
  p.apply(LOCAL,{op:'variables',value:null});assert.equal(Object.hasOwn(p.local(),'variables'),false);
  p.apply(NODE,{op:'variables',value:'{"code":"A"}'});
  assert.deepEqual(plain(p.overlay()),{extends:true,variables:{code:'A'}},'an imported carrier\'s variables go in its overlay');
  p.apply(NODE,{op:'narrow',name:'sent',action:'add',fragment:'| code="${code}"'});
  assert.deepEqual(plain(p.overlay()),{extends:true,variables:{code:'A'},signals:{sent:{narrow:{loki:['| code="${code}"']}}}},'a later edit keeps the variables');
  assert.deepEqual(plain(p.state(NODE).variables),{own:{code:'A'},inherited:{}});
  p.apply(NODE,{op:'importVariables',value:'{"region":"eu"}'});
  assert.deepEqual(plain(diagramOf(p.raw).topologyImports[0].variables),{region:'eu'});
  assert.deepEqual(plain(p.state(NODE).importVariables),{as:'fc',value:{region:'eu'}});
  p.refuse(NODE,{op:'importVariables',value:'{"region":""}'},/string/);
  p.refuse(LOCAL,{op:'importVariables',value:'{"region":"eu"}'},/imported/);
  p.apply(NODE,{op:'importVariables',value:null});assert.equal(Object.hasOwn(diagramOf(p.raw).topologyImports[0],'variables'),false);
});

test('E6 the read model gives each signal the viewer\'s Not shown reason and the query sent',()=>{
  const f=fixtures({sent:{loki:LOKI,needsNarrow:['code'],narrow:{loki:'| json'}},bycode:{loki:BYCODE}}),p=planner(f);
  let s=p.state(NODE);
  assert.ok(s.sent,'the read model has the query each signal sends');
  assert.equal(s.sent.sent.error,'The provider asks each board to narrow this signal by code, and nothing narrows it here, so it is not shown.');
  assert.equal(s.sent.bycode.error,'Set telemetry variable ${code} for this import, this node or connection, or the active environment.');
  p.apply(NODE,{op:'narrow',name:'sent',action:'add',fragment:'| code="A"'});
  p.apply(NODE,{op:'importVariables',value:'{"code":"FULL"}'});
  s=p.state(NODE);
  assert.equal(s.sent.sent.error,undefined);
  assert.equal(s.sent.sent.query,'sum(count_over_time({app="dcf"} | json | code="A" [5m]))');
  assert.equal(s.sent.bycode.query,'sum(count_over_time({app="dcf", code="FULL"}[5m]))');
  p.apply(NODE,{op:'importVariables',value:'{"code":"a\\"b"}'});
  assert.equal(p.state(NODE).sent.bycode.error,'Variable ${code} from this import or carrier cannot be filled in safely here (a telemetry variable may hold only letters, digits and _ . @ : - (and spaces inside a string)), so the signal is not shown. Use another value, or copy the provider\'s query and edit it.');
});

function inspector(f){
  const e=inspectorEnvironment(names),h=e.mount(f.consumer);
  h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const ui={e,h,
    select(t){h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    metrics(){const box=h.guide.querySelector('fieldset.metrics-editor');assert.ok(box,'Inspect has a Metrics editor');return box;},
    row(label){const row=h.guide.querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent===label);return row?row.children[1]:null;},
    control(label){const el=ui.row(label);assert.ok(el,'control "'+label+'" exists');return el;},
    set(label,value){const el=ui.control(label);el.value=value;el.fire('change');h.flush();return ui;},
    type(label,value){const el=ui.control(label);el.value=value;el.fire('input');return ui;},
    button(label){return h.guide.querySelectorAll('button').find(b=>b.textContent===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();return ui;},
    notes(){return ui.metrics().querySelectorAll('p').map(p=>p.textContent);},
    error(){const slot=h.guide.querySelector('.ierr');return slot?slot.textContent:'';}};
  return ui;
}
function oneStep(ui,act,target){
  const before=ui.text;act();const after=ui.text;assert.notEqual(after,before,'the edit changed the source');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'Undo restores the exact prior text');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after,'Redo restores the exact next text');
  ui.select(target);return after;
}

test('E7 the inspector edits narrowing, needsNarrow and variables on an imported node, one Undo each, with the viewer\'s reasons',()=>{
  const f=fixtures(),ui=inspector(f).select(NODE),overlay=()=>diagramOf(ui.raw).topologyImports[0].nodeTracking?.dcf?.telemetry;
  assert.ok(ui.notes().includes('sent narrowing from the provider: | json'),'an inherited fragment is shown read-only');
  assert.ok(ui.notes().includes('Not shown: The provider asks each board to narrow this signal by code, and nothing narrows it here, so it is not shown.'),'the editor shows the viewer\'s reason');
  const required=ui.control('sent required by the provider');assert.equal(required.readOnly,true);assert.equal(required.value,'code','the provider\'s requirement is read-only');
  assert.equal(ui.control('sent boards must narrow by').value,'','the field holds only the board\'s own fields');
  assert.ok(!ui.h.guide.querySelectorAll('button').some(b=>/^Remove sent narrowing/.test(b.textContent)),'an inherited fragment has no Remove');
  ui.type('sent add narrowing','| code="A" | drop x');
  const before=ui.text;ui.click('Add sent narrowing');
  assert.match(ui.error(),/second "\|"/,'a refused fragment shows its reason');assert.equal(ui.text,before,'and is not stored');
  ui.select(NODE);ui.type('sent add narrowing','| code="A"');
  oneStep(ui,()=>ui.click('Add sent narrowing'),NODE);
  assert.deepEqual(overlay(),{extends:true,signals:{sent:{narrow:{loki:['| code="A"']}}}});
  assert.ok(ui.notes().includes('sent narrowing: | code="A"'));
  assert.ok(ui.button('Remove sent narrowing 1'),'the board\'s first own fragment is number 1');assert.equal(ui.button('Remove sent narrowing 2'),null);
  assert.ok(!ui.notes().some(n=>/^Not shown/.test(n)),'the narrowed signal is shown');
  const sentQuery=ui.control('sent query sent');assert.equal(sentQuery.readOnly,true);
  assert.equal(sentQuery.value,'sum(count_over_time({app="dcf"} | json | code="A" [5m]))');
  oneStep(ui,()=>ui.set('sent boards must narrow by','type'),NODE);
  assert.deepEqual(overlay().signals.sent.needsNarrow,['type']);assert.equal(ui.control('sent boards must narrow by').value,'type');
  // #1393: scoped variables are rows (the #1240 row control).
  oneStep(ui,()=>{ui.type('New node variable name','code');ui.type('New node variable value','A');ui.click('Add node variable');},NODE);
  assert.deepEqual(overlay().variables,{code:'A'});
  assert.ok(ui.notes().some(n=>n.startsWith('Apply to every node and connection from import fc')));
  oneStep(ui,()=>{ui.type('New import fc variable name','region');ui.type('New import fc variable value','eu');ui.click('Add import fc variable');},NODE);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].variables,{region:'eu'});
  oneStep(ui,()=>ui.click('Remove sent narrowing 1'),NODE);
  assert.equal(overlay().signals.sent.narrow,undefined);
  // A local node gets the same controls, without the import's.
  ui.select(LOCAL);assert.ok(ui.row('n add narrowing'));assert.ok(ui.row('New node variable name'));assert.equal(ui.row('New import fc variable name'),null);
  assert.equal(ui.button('Copy provider queries'),null,'a local carrier has no provider to copy');
});

test('E8 Copy provider queries turns the merge overlay into a replacing binding with the same resolved metrics, one Undo step',()=>{
  const f=fixtures(),p=planner(f);
  p.apply(NODE,{op:'narrow',name:'sent',action:'add',fragment:'| code="A"'});
  const resolvedBefore=p.resolved();
  p.apply(NODE,{op:'copyProviderQuery'});
  assert.deepEqual(plain(p.overlay()),{kind:'service',signals:{sent:{loki:LOKI,needsNarrow:['code'],narrow:{loki:['| json','| code="A"']}},up:{grafana:'up{job="dcf"}'}}},'the copy is the effective binding, without extends');
  assert.equal(canonical(p.resolved().signals),canonical(resolvedBefore.signals),'the resolved signals are unchanged');assert.equal(p.resolved().kind,resolvedBefore.kind);
  assert.equal(p.state(NODE).merge,null,'the carrier now edits its own binding');
  p.refuse(NODE,{op:'copyProviderQuery'},/already/);
  p.refuse(LOCAL,{op:'copyProviderQuery'},/imported/);
  const ui=inspector(fixtures()).select(NODE);
  assert.ok(ui.notes().includes('Saves the provider\'s queries in this document; later provider changes no longer reach it. Required narrowing still applies.'),'the consequence is visible beside the button');
  oneStep(ui,()=>ui.click('Copy provider queries'),NODE);
  assert.equal(diagramOf(ui.raw).topologyImports[0].nodeTracking.dcf.telemetry.extends,undefined);
});

test('E9 docs name the narrowing and variables controls',()=>{
  const doc=fs.readFileSync(path.join(repo,'docs/live-status.md'),'utf8');
  for(const name of ['Add <signal> narrowing','boards must narrow by','query sent','Variables for this node','Variables for import','Copy provider queries'])
    assert.ok(doc.includes(name),'docs/live-status.md names '+name);
});

test('E10 what the provider requires is read-only and cannot be dropped: binding-level needsNarrow, and on a copied binding',()=>{
  // A provider binding-level needsNarrow applies to every signal of the carrier.
  const f=fixtures(),bound=f.provider.page.sections[0].diagram.nodes.dcf.telemetry;bound.needsNarrow=['tenant'];
  const p=planner(f);
  assert.ok(p.state(NODE).narrow,'the read model lists each signal\'s narrowing');
  assert.deepEqual(plain(p.state(NODE).narrow.up.needs),{inherited:['tenant'],own:[]},'a binding-level requirement is the provider\'s');
  assert.deepEqual(plain(p.state(NODE).narrow.sent.needs),{inherited:['code','tenant'],own:[]});
  p.refuse(NODE,{op:'needsNarrow',name:'up',value:null},/tenant/);
  p.refuse(NODE,{op:'needsNarrow',name:'up',value:'x'},/never remove/);
  p.apply(NODE,{op:'needsNarrow',name:'up',value:'tenant, x'});
  assert.ok(p.overlay().signals.up.needsNarrow.includes('x'));
  // After Copy provider queries, the carrier's requirement still applies and stays read-only.
  const g=fixtures(),q=planner(g);
  q.apply(NODE,{op:'copyProviderQuery'});
  assert.deepEqual(plain(q.state(NODE).narrow.sent.needs),{inherited:['code'],own:[]});
  assert.deepEqual(plain(q.state(NODE).narrow.up.needs),{inherited:['code'],own:[]},'every signal of a copy gets the carrier\'s requirement');
  q.refuse(NODE,{op:'needsNarrow',name:'sent',value:null},/provider/);
  q.apply(NODE,{op:'needsNarrow',name:'sent',value:'code, type'});
  assert.deepEqual(plain(q.overlay().signals.sent.needsNarrow),['code','type']);
  const ui=inspector(fixtures()).select(NODE);ui.click('Copy provider queries');ui.select(NODE);
  const required=ui.control('sent required by the provider');assert.equal(required.readOnly,true);assert.equal(required.value,'code');
  assert.equal(ui.control('sent boards must narrow by').value,'');
  oneStep(ui,()=>ui.set('sent boards must narrow by','type'),NODE);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.dcf.telemetry.signals.sent.needsNarrow,['code','type'],'the copy keeps the requirement and adds the board\'s field');
});
