'use strict';
/* #1393 desktop Workbench: a node's, a connection's and an import's scoped telemetry variables are rows
   (the #1240 row control) instead of JSON textareas. Desktop only.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| R1 | Inspect → Tracking → Metrics shows variable rows for a local node, a local connection and an imported node (its own and its import's); no JSON textarea. | consumer with a local node, a local edge and an import fc of provider node dcf | row and Add controls by label; no "Variables for this node" textarea | textareas left; rows missing on edges or imports |
| R2 | Add, rename (in place) and remove write the right object: nodes.local.telemetry.variables, edges[0].telemetry.variables, the imported node's overlay (nodeTracking.dcf.telemetry.variables, never the provider) and topologyImports[0].variables; each is one Undo step; removing the last removes the key. | same | written objects; key order; provider untouched; Undo text | writing the provider's spec; a rename that moves the key; multi-step history |
| R3 | Names and values follow the validator: reserved env/account and a leading digit are refused; a value outside the scoped allowlist is refused with the validator's wording; an authored bad entry is warned at its row. | same | refusals leave the text; error text; row note | junk written and then ignored by the viewer |
| R4 | A value the viewer would refuse in this carrier's query (outside a string only a number fits) is refused with the viewer's reason; a number is accepted. | local node with `topk(${n}, up)` | refusal text names the signal; accepted value | a value written that keeps the signal from being sent |
| R5 | The viewer's built query uses the value: the imported signal's query sent has code="A" after adding code = A on the imported node. | provider signal `{app="dcf", code="${code}"}` | state.sent query text | a variable the viewer does not read |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const BYCODE='sum(count_over_time({app="dcf", code="${code}"}[5m]))';
const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
function fixtures(localVars){
  const provider=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{sent:{loki:BYCODE}}}}},rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
  const local={title:'Local',telemetry:{kind:'service',signals:{top:{grafana:'topk(${n}, up)'}}}};if(localVars)local.telemetry.variables=localVars;
  const consumer=spec('consumer',{nodes:{local,other:{title:'Other'}},rows:[['local','other']],
    edges:[{from:'local',to:'other',label:'calls',telemetry:{kind:'call',signals:{rate:{grafana:'sum(rate(x{route="${route}"}[5m]))'}}}}],
    panels:[{id:'status',type:'live-status'}],topologyImports:[{spec:'provider',export:'core',as:'fc'}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
const diagramOf=s=>s.page.sections[0].diagram;
const NODE={kind:'node',section:0,id:'fc::dcf'},LOCAL={kind:'node',section:0,id:'local'},EDGE={kind:'edge',section:0,index:0};
function inspector(f){
  const e=inspectorEnvironment(names),h=e.mount(f.consumer);
  h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const ui={e,h,
    select(t){ui.target=t;h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    named(label){return h.guide.querySelector('[aria-label="'+label+'"]');},
    field(label){const el=ui.named(label);assert.ok(el,'control "'+label+'" exists');return el;},
    set(label,value){const el=ui.field(label);el.value=value;el.fire('input');el.fire('change');h.flush();return ui.select(ui.target);},
    add(prefix,name,value){ui.field('New '+prefix+' variable name').value=name;ui.field('New '+prefix+' variable name').fire('input');
      ui.field('New '+prefix+' variable value').value=value;ui.field('New '+prefix+' variable value').fire('input');return ui.click('Add '+prefix+' variable');},
    // The form's message is read before the form is rebuilt for the next step.
    click(label){const b=h.guide.querySelectorAll('button').find(x=>x.textContent===label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();ui.lastError=ui.error();return ui.select(ui.target);},
    error(){const slot=h.guide.querySelector('.ierr');return slot?slot.textContent:'';},
    described(control){return (control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).map(id=>h.guide.querySelector('#'+id)?.textContent || '').join(' ');},
    state(t){return e.C.telemetryCarrierState(JSON.parse(h.text),t,f.context);}};
  return ui;
}
function oneStep(ui,act){
  const before=ui.text;act();const after=ui.text;assert.notEqual(after,before,'the edit changed the source');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the exact prior text');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after);ui.select(ui.target);return after;
}

test('R1 rows for a local node, a local connection and an imported node and its import; no JSON textarea',()=>{
  const ui=inspector(fixtures());
  for(const [t,prefixes] of [[LOCAL,['node']],[EDGE,['connection']],[NODE,['node','import fc']]]){
    ui.select(t);
    for(const prefix of prefixes){assert.ok(ui.named('New '+prefix+' variable name'),prefix+' rows on '+JSON.stringify(t));assert.ok(ui.h.guide.querySelectorAll('button').some(b=>b.textContent==='Add '+prefix+' variable'));}
    assert.equal(ui.h.guide.querySelectorAll('textarea').filter(x=>/^Variables for/.test(x.getAttribute('aria-label') || '')).length,0,'no JSON textarea');
  }
  ui.select(LOCAL);assert.equal(ui.named('New import fc variable name'),null,'a local node has no import rows');
});

test('R2 add, rename and remove write the right object, one Undo step each; the provider is untouched',()=>{
  const f=fixtures(),providerBefore=JSON.stringify(f.provider),ui=inspector(f);
  ui.select(LOCAL);oneStep(ui,()=>ui.add('node','n','5'));
  assert.deepEqual(diagramOf(ui.raw).nodes.local.telemetry.variables,{n:'5'});
  ui.add('node','zone','eu-1');ui.set('Node variable 1 name','count');
  assert.deepEqual(Object.keys(diagramOf(ui.raw).nodes.local.telemetry.variables),['count','zone'],'rename keeps the place');
  ui.click('Remove node variable count');ui.click('Remove node variable zone');
  assert.equal(Object.hasOwn(diagramOf(ui.raw).nodes.local.telemetry,'variables'),false,'removing the last removes the key');
  ui.select(EDGE);oneStep(ui,()=>ui.add('connection','route','checkout'));
  assert.deepEqual(diagramOf(ui.raw).edges[0].telemetry.variables,{route:'checkout'});
  ui.select(NODE);oneStep(ui,()=>ui.add('node','code','A'));
  assert.deepEqual(plain(diagramOf(ui.raw).topologyImports[0].nodeTracking.dcf.telemetry.variables),{code:'A'},'the imported node writes its overlay');
  oneStep(ui,()=>ui.add('import fc','region','eu'));
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].variables,{region:'eu'});
  ui.set('Import fc variable 1 value','us');assert.deepEqual(diagramOf(ui.raw).topologyImports[0].variables,{region:'us'});
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider is untouched');
});

test('R3 names and values follow the validator; an authored bad entry is warned at its row',()=>{
  const ui=inspector(fixtures({n:'5',env:'x'}));ui.select(LOCAL);
  const bad=ui.field('Node variable 2 name');assert.equal(bad.getAttribute('aria-invalid'),'true');
  assert.match(ui.described(bad),/Use a non-reserved name and non-empty string/,'the authored reserved name is warned at its row');
  const before=ui.text;
  for(const [name,value] of [['account','1'],['9x','1'],['ok','a/b'],['ok','x"y'],['ok','  ']])ui.add('node',name,value);
  assert.equal(ui.text,before,'reserved and invalid names, values outside the allowlist and empty values are refused');
  ui.add('node','ok','a/b');assert.match(ui.lastError,/A telemetry variable may hold only letters, digits and _ \. @ : -/,'the validator\'s wording');
});

test('R4 a value that keeps one of this carrier\'s signals from being sent is refused with the viewer\'s reason',()=>{
  const ui=inspector(fixtures());ui.select(LOCAL);const before=ui.text;
  ui.add('node','n','abc');assert.equal(ui.text,before);
  assert.match(ui.lastError,/With this value, signal top would not be sent: .*outside a string only a number or a duration/);
  ui.add('node','n','5');assert.deepEqual(diagramOf(ui.raw).nodes.local.telemetry.variables,{n:'5'});
  assert.equal(ui.state(LOCAL).sent.top.query,'topk(5, up)','the viewer sends the value');
});

test('R5 the viewer builds the imported signal\'s query with the value',()=>{
  const ui=inspector(fixtures());ui.select(NODE);
  assert.match(ui.state(NODE).sent.sent.error || '',/code/,'unset, the signal is not sent');
  ui.add('node','code','A');
  assert.equal(ui.state(NODE).sent.sent.query,'sum(count_over_time({app="dcf", code="A"}[5m]))');
});
