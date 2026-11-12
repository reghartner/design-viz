'use strict';
/* #1239 desktop Workbench Status board settings → Traces: tracking.telemetry.traceConnections.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| C1 | Without traceConnections every company profile is Inherited and listed as resolved; Disable on one writes a map of the others only; the resolved list drops it; one Undo restores. | company profiles operations and archive; live-status board with a telemetry block | source map; resolved list items; exact text after Undo | a disabled profile still resolved; the other profiles dropped too |
| C2 | Use, then narrow to one environment and override the board label and that environment's label: the entry is written and the resolved list shows the overrides; the last environment cannot be turned off; each edit is one Undo step. | same | entry deepEqual; resolved item text; refusal | overrides the resolver ignores; an empty environment subset |
| C3 | An inline profile's allowed attributes: Add writes allowedAttributes; a secret-like name is refused with the resolver's message; Remove drops it (the key goes when empty); one Undo each. | board with one inline tempo profile | source list; refusal leaves the text; Undo | attributes written to company references; secrets accepted |
| C5 | A board that does not use traces inherits no company profile: the header says so, a profile offers Not used / Use (no Disable), and Use writes only that profile; with Allow metrics off the header says Off. | page without tracking.telemetry; page with enabled:false | header text; select options; source map | seeding every company profile into a board that never inherited them |
| C6 | A board adds allowed attributes to a company profile it uses (Chuck 2026-11-12): the entry keeps only the additions, the resolver allows the company list plus them, the company's own name and a secret-like name are refused, Remove drops one. | company operations with allowedAttributes ["service.region"] | entry list; resolved allowedAttributes; refusals | additions replacing the company list; secrets accepted |
| C4 | Inherit all company profiles removes the key; Advanced JSON writes the map and refuses non-objects; a validator warning for one connection sits in that profile's group; the Traces header names the state. | same | key absent; JSON written; group note text; header text | no way back to inheriting; warnings only at the end |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/trace-connections-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const BOARD={kind:'board'};
const profile=(label,extra={})=>({version:1,label,provider:'tempo',server:'Grafana',tool:'tempo_get_trace',readOnly:true,adapter:'tempo-v1',
  arguments:{traceId:'trace_id',start:'start',environment:'datasource'},time:{encoding:'iso8601',type:'string',defaultLookback:'2h'},
  environments:{production:{label:'Production',value:'tempo-prod'},staging:{label:'Staging',value:'tempo-stg'}},...extra});
const COMPANY={operations:profile('Operations Tempo'),archive:profile('Archive Tempo')};
function board(telemetry){
  return {page:{title:'Board',tracking:{telemetry:telemetry || {}},sections:[{heading:'Flow',diagram:{nodes:{api:{title:'API'},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db'}],
    panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
}
function harness(spec,company=COMPANY){
  const e=inspectorEnvironment(names);e.C.TELEMETRY_COMPANY_TRACE_CONNECTIONS=JSON.parse(JSON.stringify(company));
  const h=e.mount(spec);
  const ui={e,h,
    render(){h.session.target=BOARD;h.inspector.render();return ui;},
    get text(){return h.text;},get t(){return JSON.parse(h.text).page.tracking.telemetry;},
    traces(){return h.guide.querySelectorAll('details.board-section').find(s=>s.getAttribute('data-board-section')==='traces');},
    field(label){const el=h.guide.querySelector('[aria-label="'+label+'"]');assert.ok(el,'control "'+label+'" exists');return el;},
    set(label,value){const el=ui.field(label);el.value=value;el.fire('input');el.fire('change');h.flush();return ui.render();},
    check(label,on){const el=ui.field(label);el.checked=on;el.fire('change');h.flush();return ui.render();},
    click(label){const b=h.guide.querySelectorAll('button').find(x=>x.textContent===label || x.getAttribute('aria-label')===label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();return ui.render();},
    resolved(){const list=h.guide.querySelector('[aria-label="Resolved trace connections"]');return list?list.children.map(li=>li.textContent):[];},
    group(id){return h.guide.querySelectorAll('fieldset.trace-connection').find(f=>f.getAttribute('data-trace-profile')===id || f.getAttribute('data-trace-inline')===id);}};
  return ui.render();
}
function oneUndo(ui,before,first=true){
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores the exact text');
  if(first)assert.equal(ui.h.session.canUndo(),false,'the edit was one Undo step');ui.render();
}

test('C1 Disable a company profile: the map lists only the others and the resolved list drops it; one Undo restores',()=>{
  const ui=harness(board()),before=ui.text;
  assert.equal(ui.field('operations on this board').value,'inherit');
  assert.deepEqual(ui.resolved(),['operations · Operations Tempo · tempo · production (Production), staging (Staging)','archive · Archive Tempo · tempo · production (Production), staging (Staging)']);
  assert.equal(ui.traces().querySelector('summary').textContent,'Traces · Inherits 2 company profiles');
  ui.set('operations on this board','disable');
  assert.deepEqual(ui.t.traceConnections,{archive:{profile:'archive'}});
  assert.deepEqual(ui.resolved().map(s=>s.split(' · ')[0]),['archive'],'the disabled profile is no longer resolved');
  assert.equal(ui.field('operations on this board').value,'disable');
  assert.equal(ui.traces().querySelector('summary').textContent,'Traces · 1 connection');
  oneUndo(ui,before);
});

test('C2 narrow a profile to one environment and override labels; the resolved list shows the overrides',()=>{
  const ui=harness(board());
  ui.set('operations on this board','use');
  assert.deepEqual(ui.t.traceConnections,{operations:{profile:'operations'},archive:{profile:'archive'}},'leaving inheritance lists every company profile');
  let before=ui.text;
  ui.check('operations environment staging',false);
  assert.deepEqual(ui.t.traceConnections.operations,{profile:'operations',environments:{production:{}}});
  oneUndo(ui,before,false);ui.check('operations environment staging',false);
  before=ui.text;ui.check('operations environment production',false);assert.equal(ui.text,before,'the last environment cannot be turned off');
  ui.set('operations board label','Ops traces');
  ui.set('operations production label','Prod');
  assert.deepEqual(ui.t.traceConnections.operations,{profile:'operations',environments:{production:{label:'Prod'}},label:'Ops traces'});
  assert.equal(ui.resolved()[0],'operations · Ops traces · tempo · production (Prod)');
  ui.set('operations production value','tempo-prod-eu');assert.equal(ui.t.traceConnections.operations.environments.production.value,'tempo-prod-eu');
  ui.set('operations production label','');ui.set('operations production value','');ui.check('operations environment staging',true);
  assert.deepEqual(ui.t.traceConnections.operations,{profile:'operations',label:'Ops traces'},'all environments without overrides: the environments key goes');
});

test('C3 inline profile allowed attributes: add, refuse a secret-like name, remove; one Undo each',()=>{
  const ui=harness(board({traceConnections:{inline:profile('Inline Tempo')}})),before=ui.text;
  ui.set('inline new allowed attribute','device.model');ui.click('Add allowed attribute to inline');
  assert.deepEqual(ui.t.traceConnections.inline.allowedAttributes,['device.model']);
  oneUndo(ui,before);
  ui.set('inline new allowed attribute','auth.token');ui.click('Add allowed attribute to inline');
  assert.equal(ui.text,before,'a secret-like attribute name is refused');
  ui.set('inline new allowed attribute','device.model');ui.click('Add allowed attribute to inline');
  ui.click('Remove inline allowed attribute device.model');
  assert.equal(Object.hasOwn(ui.t.traceConnections.inline,'allowedAttributes'),false,'removing the last name removes the key');
  assert.match(ui.group('operations').querySelectorAll('.fnote').map(p=>p.textContent).join(' '),/allowed attributes from the company profile: none/,'company profiles show their list read-only');
});

test('C4 Inherit all, Advanced JSON, warnings in the profile group, header states',()=>{
  const ui=harness(board({traceConnections:{operations:{profile:'operations',environments:{nope:{}}}}}));
  assert.ok(ui.group('operations'),'the operations group exists');
  const note=ui.group('operations').querySelector('.trace-connection-warning');
  assert.match(note?.textContent || '',/Unknown profile environment/,'the warning sits in the operations group');
  assert.equal(ui.field('operations on this board').getAttribute('aria-invalid'),'true');
  ui.click('Inherit all company profiles');
  assert.equal(Object.hasOwn(ui.t || {},'traceConnections'),false,'the key is removed');
  ui.set('Trace connections JSON','{}');
  assert.deepEqual(ui.t.traceConnections,{},'Advanced JSON writes the map; {} disables direct loading');
  assert.deepEqual(ui.resolved(),[]);assert.equal(ui.traces().querySelector('summary').textContent,'Traces · None');
  const before=ui.text;ui.set('Trace connections JSON','[1]');assert.equal(ui.text,before,'a non-object is refused');
  const none=harness(board(),{});assert.equal(none.traces().querySelector('summary').textContent,'Traces · Not set');
});

test('C5 a board that does not use traces inherits nothing: header, options and Use write only the chosen profile',()=>{
  const plain={page:{title:'Board',tracking:{},sections:[{heading:'Flow',diagram:{nodes:{api:{title:'API'}},rows:[['api']]}}]}};
  const ui=harness(plain);
  assert.equal(ui.traces().querySelector('summary').textContent,'Traces · Not used (no traces)');
  const select=ui.field('operations on this board');
  assert.deepEqual(select.children.map(o=>o.value),['inherit','use'],'nothing to disable');
  assert.equal(select.children[0].textContent,'Not used');
  ui.set('operations on this board','use');
  assert.deepEqual(ui.t.traceConnections,{operations:{profile:'operations'}},'only the chosen profile is listed');
  assert.equal(ui.traces().querySelector('summary').textContent,'Traces · 1 connection');
  const off=harness(board({enabled:false}));
  assert.equal(off.traces().querySelector('summary').textContent,'Traces · Off');
  assert.match(off.traces().querySelector('.trace-connections-mode').textContent,/Use and Disable still save the choice\.$/,'a trace board with metrics off offers both');
  off.set('operations on this board','use');
  assert.deepEqual(off.t.traceConnections,{operations:{profile:'operations'},archive:{profile:'archive'}},'a trace board with metrics off still inherits both, so Use keeps archive');
  const offPlain=harness({page:{title:'Board',tracking:{telemetry:{enabled:false}},sections:[{heading:'Flow',diagram:{nodes:{api:{title:'API'}},rows:[['api']]}}]}});
  const offNote=offPlain.traces().querySelector('.trace-connections-mode').textContent;
  assert.match(offNote,/Use still saves the choice\.$/,'metrics off on a board without traces: Disable is not offered, so the note does not name it');
  assert.deepEqual(offPlain.field('operations on this board').children.map(o=>o.value),['inherit','use']);
  const broken=harness(board(),{operations:profile('Operations Tempo'),bad:{version:2}});
  assert.equal(broken.traces().querySelector('summary').textContent,'Traces · None','a trace board whose company profiles do not resolve says None, not "no traces"');
});

test('C6 a board adds allowed attributes to a company profile; the resolver allows the union',()=>{
  const company={operations:profile('Operations Tempo',{allowedAttributes:['service.region']}),archive:profile('Archive Tempo')};
  const ui=harness(board(),company);
  ui.set('operations on this board','use');const before=ui.text;
  ui.set('operations new allowed attribute','device.model');ui.click('Add allowed attribute to operations');
  assert.deepEqual(ui.t.traceConnections.operations,{profile:'operations',allowedAttributes:['device.model']},'the entry keeps only the board additions');
  const resolved=ui.e.C.FlowTraceConnections.resolve(JSON.parse(ui.text).page,ui.e.C.TELEMETRY_COMPANY_TRACE_CONNECTIONS);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.operations.allowedAttributes)),['service.region','device.model'],'company list plus the board additions');
  oneUndo(ui,before,false);
  for(const name of ['service.region','auth.token']){ui.set('operations new allowed attribute',name);ui.click('Add allowed attribute to operations');}
  assert.equal(ui.text,before,'the company\'s own name and a secret-like name are refused');
  ui.set('operations new allowed attribute','device.model');ui.click('Add allowed attribute to operations');
  ui.click('Remove operations allowed attribute device.model');
  assert.deepEqual(ui.t.traceConnections.operations,{profile:'operations'},'Remove drops the last addition and its key');
  const bad=[];ui.e.C.FlowTraceConnections.resolve({tracking:{telemetry:{traceConnections:{x:{profile:'operations',allowedAttributes:'device.model'}}}}},company,(path,message)=>bad.push(path+' '+message));
  assert.match(bad.join(' '),/\.traceConnections\.x .*Board allowedAttributes must be an array/,'a non-array board list is refused by the resolver');
  const secret=[];ui.e.C.FlowTraceConnections.resolve({tracking:{telemetry:{traceConnections:{x:{profile:'operations',allowedAttributes:['auth.token']}}}}},company,(path,message)=>secret.push(message));
  assert.match(secret.join(' '),/Board allowedAttributes\[0\]/,'the message names the index in the board list');
});
