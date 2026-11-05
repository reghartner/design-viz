'use strict';
/* #941 PR 1 of 2 contract matrix: desktop Workbench Inspect → Tracking → Metrics editor,
   Document settings telemetry block, Undo/Redo and Export project. The field family is #937
   (docs/live-status.md "Telemetry bindings"). The Preview metrics layout toggle is PR 2.
| row | rule | fixture | structurally scoped assertion | plausible broken implementation it rejects |
|---|---|---|---|---|
| M1 | A node or connection shows a Metrics sub-section inside Inspect → Tracking. Unbound: a note says no overlay and no verdict; Metrics kind + New signal name/source/query/unit + Add signal bind the first signal and keep the carrier's tickets. | `board()`: connection ingest->notify with tickets, no telemetry; node ingest | `fieldset.metrics-editor` is inside `fieldset.tracking-editor`; choosing a kind alone leaves the source unchanged; after Add signal the edge deepEquals the original plus `telemetry:{kind:'queue',signals:{in:{loki,unit}}}` | writing `{kind}` on kind change (a binding without signals); rewriting the edge and dropping tickets; controls outside Tracking |
| M2 | Raw signal rows edit name (proof keys and maxRatioOf references follow), source (string sources ↔ Honeycomb JSON object), query and unit; bad names, duplicates, empty queries and non-object Honeycomb queries are refused with a message and no history. | connection with `rate`, `errors` and `errors.maxRatioOf:'rate'` | rename keeps signal order and moves `proof.rate` and `errors.maxRatioOf`; Honeycomb stores an object; each refusal leaves the text and canUndo unchanged and fills `.ierr` | a rename that leaves stale proof keys or references; storing a Honeycomb query as a string; accepting `[]`, `{}` or invalid JSON |
| M3 | Per-signal proof limits: min and max are finite numbers, ratio of names another signal; an emptied entry is removed, an emptied proof is removed, min above max is refused. Infinity, -Infinity, NaN and numeric strings are refused. | same connection; pure `telemetryEditBinding` calls | `proof.requests` deepEquals `{min:10,max:5000}`; refusals leave the text unchanged; the pure edit returns an error for each non-finite value and for `'10'` | accepting `Infinity` (Number('Infinity')) or NaN; storing a numeric string; leaving `{}` entries the parser warns on |
| M4 | Removing the last raw signal removes the `telemetry` object; Remove metrics removes it too. | bound connection | `Object.hasOwn(edge,'telemetry')===false`; Undo restores the exact bound text | leaving `{kind, signals:{}}` |
| M5 | Signals from switches between raw signals and a page template: a template writes `{use}` (card and links kept), one Template parameter input per declared $param, proof limits overlay per signal (back to the template value drops the override); switching back to raw expands the template into raw signals. | page template `kafka-topic` (queue, params topic/group, in/lag, limits, dashboard link) | `{use:'kafka-topic'}`; inputs for topic and group; `proof:{lag:{max:100}}` then no proof; raw expansion deepEquals the substituted template plus card, and `carrierTelemetry` matches the template binding | copying the whole template proof onto the carrier; losing card on a mode switch; writing the draft kind over the template kind |
| M6 | Link-outs Dashboard link and Query link take absolute http(s) URLs (normalized); invalid refused; empty removes the key, then `links`. | connection with one raw signal | `links` deepEquals the normalized URLs; refusals leave the text unchanged; clearing both removes `links` | storing raw text; accepting `javascript:` or relative URLs; leaving `links:{}` |
| M7 | Card side (right/left/above/below) and Card offset (-1000..1000) only for connections; invalid refused; empty removes the key, then `card`. | same connection; node ingest | Card side options are exactly `['',right,left,above,below]`; offset 2000 refused; node form has no Card side row | showing edge placement on nodes; an unbounded offset |
| M8 | Imported carriers (node and connection): the inherited binding is read only and names its provider; local edits write the consumer overlay `topologyImports[i].nodeTracking/edgeTracking[key].telemetry` (tickets kept, provider unchanged); removing it restores the inherited binding. | provider with node `api` and edge `api->store` bindings; consumer importing them as `shared` with node overlay tickets | state `inherited` deepEquals the provider binding; the inspector note names `provider / core` and the binding; overlay entries deepEqual the edits; the resolved carrier carries the inherited binding again after Remove metrics; provider JSON unchanged | writing into the provider; dropping overlay tickets; copying the inherited binding into the overlay; showing an inherited carrier as Unbound |
| M9 | Inline validation lists the #937 parser warnings for the carrier, the same text the validator emits at that carrier, including provider bindings the resolver dropped. | connection with a two-source signal, an unknown limit, a non-http link; provider node with an unexpandable `use` | the `Metrics warnings` list deepEquals the validator warnings at that carrier with the carrier prefix removed | hand-written messages that drift from the validator; missing provider drops |
| M10 | Document settings → Tracking → Metrics edits page `tracking.telemetry`: Grafana Prometheus/Loki/Tempo/SQL UIDs, Honeycomb environment/dataset, window (duration) and refresh (≥ 60000 ms). Empty values remove keys; an empty block removes `tracking.telemetry`; Jira settings are untouched. Page warnings are listed. | page with `tracking.jira`; a page with an invalid window and UID | each field lands at its key and `tracking.jira` is deepEqual-unchanged; bad window/refresh refused; clearing all leaves `tracking` deepEqual `{jira}`; warnings deepEqual the validator's `tracking.telemetry` warnings | rewriting `tracking.jira`; leaving `telemetry:{}`; accepting `refreshMs:1000` |
| M11 | Templates editor: add (name, kind, parameters, first signal); rename a template signal (its limit follows), change its source and query; edit kind/parameters/proof/links; remove a signal (never the last); remove a template (refused while a carrier uses it). Every edit is undoable and preserved by export. | document target on `board()` | the template deepEquals the expected object after each step; export `templates` deepEquals the source; the last-signal and in-use removals are refused with messages | orphaned limits after a rename; a source change that drops the query; templates the parser would drop; orphaning carriers |
| M12 | Each edit is one Undo step; Undo and Redo restore the exact prior and next source text. A no-op edit adds no history. | every edit above | `oneStep`: text changes, Undo restores the exact prior text, Redo the exact next text; a trimmed no-op then Undo reverts the previous real edit | multi-step edits; phantom history entries |
| M13 | Export project round-trip: the stamped export keeps carrier, overlay and page telemetry exactly and declares flow.telemetry. | editor-written edge template binding, node Honeycomb signal, page window, consumer overlay | `stampText` export deepEquals authored `tracking` and `sections`; `flow.telemetry` declared | an export that strips `telemetry` or template parameters |
| M14 | Text boxes show no Metrics sub-section and the planner refuses them. | text-box node `note` | no `fieldset.metrics-editor`; the plan error names text boxes | binding telemetry to text boxes |
| M15 | docs/live-status.md "Workbench" describes the Metrics editor and the Document settings block. | docs file | the Workbench section contains every control name | missing docs |
| P1 | Preview metrics layout toggle: desktop browser coverage in telemetry-preview.spec.mjs. | n/a | n/a | n/a |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/inspector','workbench/io-model']
  // The RED baseline has no telemetry command or editor module; load only what exists so the contract assertions fail, not the loader.
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));
const plain=v=>JSON.parse(JSON.stringify(v));
const LOKI_IN='sum(count_over_time({app="ingest"} |= "event queued" [5m]))';
const PROM_RATE='sum(rate(push_sent_total{app="notify"}[5m]))*3600';
const PROM_ERRORS='sum(rate(push_failed_total{app="notify"}[5m]))*3600';
const LAG='max(kafka_consumergroup_lag{topic="$topic",group="$group"})';
const TEMPLATES=()=>({'kafka-topic':{kind:'queue',params:['topic','group'],
  signals:{in:{grafana:'sum(rate(kafka_messagesin_total{topic="$topic"}[5m]))*3600',unit:'msg/h'},lag:{grafana:LAG,unit:'msgs'}},
  proof:{in:{min:10},lag:{max:500}},links:{dashboard:'https://acme.grafana.net/d/kafka?var-topic=$topic'}}});
function board(edgeTelemetry,pageTelemetry){
  const edge={from:'ingest',to:'notify',label:'route',tickets:['BE-67']};if(edgeTelemetry)edge.telemetry=edgeTelemetry;
  const tracking={jira:{site:'https://acme.atlassian.net',epic:'DOOR-100'}};if(pageTelemetry)tracking.telemetry=pageTelemetry;
  return {page:{title:'Board',tracking,sections:[{heading:'Flow',diagram:{nodes:{ingest:{title:'Ingest',tickets:['BE-66']},notify:{title:'Notify'},note:{type:'text',text:'Read me'}},
    rows:[['ingest','notify','note']],edges:[edge],panels:[{id:'status',type:'live-status'}]}}]}};
}
const diagramOf=s=>s.page.sections[0].diagram;
function api(C){
  for(const name of ['telemetryEditBinding','telemetryEditPage','planCarrierTelemetry','planPageTelemetry','telemetryCarrierState','telemetryPageState'])
    assert.equal(typeof C[name],'function','M12: '+name+' is a pure Workbench telemetry command (src/workbench/commands/telemetry.js)');
  return C;
}
function harness(spec,target){
  const e=inspectorEnvironment(names),h=e.mount(spec);
  const ui={e,h,
    select(t){h.session.target=t;h.inspector.render();return ui;},
    get text(){return h.text;},get raw(){return JSON.parse(h.text);},
    metrics(){const box=h.guide.querySelector('fieldset.metrics-editor');assert.ok(box,'M1: Inspect → Tracking gains a Metrics sub-section');return box;},
    settings(){const box=h.guide.querySelector('fieldset.metrics-settings');assert.ok(box,'M10: Document settings → Tracking gains a Metrics block');return box;},
    row(label){const row=h.guide.querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent===label);return row?row.children[1]:null;},
    control(label){const el=ui.row(label);assert.ok(el,'control "'+label+'" exists');return el;},
    set(label,value){const el=ui.control(label);el.value=value;el.fire('change');h.flush();return ui;},
    button(label){return h.guide.querySelectorAll('button').find(b=>b.textContent===label) || null;},
    click(label){const b=ui.button(label);assert.ok(b,'button "'+label+'" exists');b.fire('click');h.flush();return ui;},
    error(){const slot=h.guide.querySelector('.ierr');return slot?slot.textContent:'';},
    warnings(label){const list=h.guide.querySelector('[aria-label="'+(label || 'Metrics warnings')+'"]');return list?list.children.map(li=>li.textContent):[];},
    rerender(){h.session.target=target;h.inspector.render();return ui;}};
  if(target)ui.select(target);
  return ui;
}
const EDGE={kind:'edge',section:0,index:0};
const edgeOf=ui=>diagramOf(ui.raw).edges[0];
// Each step must change the source, add exactly one undo entry, and Undo/Redo must restore exact text.
function oneStep(ui,act,target){
  const before=ui.text;act();const after=ui.text;assert.notEqual(after,before,'the edit changed the source');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'M12: Undo restores the exact prior text');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after,'M12: Redo restores the exact next text');
  ui.select(target || EDGE);return after;
}

test('M1 M4 M12 an unbound connection gets its first raw signal from Tracking → Metrics with one Undo/Redo; removing the last signal unbinds it',()=>{
  const ui=harness(board(),EDGE),box=ui.metrics();
  assert.ok(box.closest('fieldset.tracking-editor'),'M1: Metrics sits inside the Tracking fieldset');
  assert.equal(box.querySelector('legend').textContent,'Metrics');
  assert.match(box.textContent+box.querySelectorAll('p').map(p=>p.textContent).join(' '),/Unbound: no metrics overlay and no proof verdict/);
  assert.equal(ui.button('Remove metrics'),null,'nothing to remove while unbound');
  assert.equal(ui.row('Dashboard link'),null,'link-outs appear once bound');
  const original=ui.text;
  ui.set('Metrics kind','queue');assert.equal(ui.text,original,'the kind of an unbound carrier is a draft until a signal or template binds it');
  ui.control('New signal name').value='in';ui.control('New signal source').value='loki';ui.control('New signal query').value=LOKI_IN;ui.control('New signal unit').value='msgs';
  const bound=oneStep(ui,()=>ui.click('Add signal'));
  assert.deepEqual(edgeOf(ui),{from:'ingest',to:'notify',label:'route',tickets:['BE-67'],telemetry:{kind:'queue',signals:{in:{loki:LOKI_IN,unit:'msgs'}}}});
  assert.equal(api(ui.e.C).carrierTelemetry(edgeOf(ui),{}).signals.in.source,'loki','the written binding parses');
  assert.equal(ui.metrics().querySelectorAll('p').some(p=>/Unbound/.test(p.textContent)),false);
  assert.equal(ui.control('Metrics kind').value,'queue');assert.equal(ui.control('in query').value,LOKI_IN);assert.equal(ui.control('in source').value,'loki');
  // Removing the last signal removes the whole object.
  oneStep(ui,()=>ui.click('Remove signal in'));
  assert.deepEqual(edgeOf(ui),{from:'ingest',to:'notify',label:'route',tickets:['BE-67']});
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,bound);ui.select(EDGE);
  oneStep(ui,()=>ui.click('Remove metrics'));assert.equal(Object.hasOwn(edgeOf(ui),'telemetry'),false);
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,original);
});

test('M1 M14 nodes get the Metrics sub-section without card placement; text boxes get none and the planner refuses them',()=>{
  const C=api(harness(board()).e.C),ui=harness(board(),{kind:'node',section:0,id:'ingest'});
  ui.metrics();assert.equal(ui.row('Card side'),null,'edge-card placement is a connection field');
  ui.control('New signal name').value='rate';ui.control('New signal source').value='grafana';ui.control('New signal query').value=PROM_RATE;
  ui.set('Metrics kind','service');ui.click('Add signal');
  assert.deepEqual(diagramOf(ui.raw).nodes.ingest,{title:'Ingest',tickets:['BE-66'],telemetry:{kind:'service',signals:{rate:{grafana:PROM_RATE}}}});
  ui.select({kind:'node',section:0,id:'ingest'});assert.equal(ui.row('Card side'),null);
  const text=harness(board(),{kind:'node',section:0,id:'note'});
  assert.equal(text.h.guide.querySelector('fieldset.metrics-editor'),null,'M14: text boxes never carry telemetry');
  const raw=board(),plan=C.planCarrierTelemetry(JSON.stringify(raw,null,2),raw,{kind:'node',section:0,id:'note'},{op:'addSignal',name:'rate',source:'grafana',query:'up',kind:'call'},null);
  assert.match(plan.error || '',/[Tt]ext boxes/);
});

test('M2 M3 M12 raw signal rows rename, change source, query and unit, and edit proof limits; invalid input is refused without history',()=>{
  const binding={kind:'call',signals:{rate:{grafana:PROM_RATE,unit:'req/h'},errors:{grafana:PROM_ERRORS,unit:'req/h'}},proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01}}};
  const ui=harness(board(binding),EDGE);ui.metrics();
  assert.deepEqual(ui.control('errors ratio of').options.map(o=>o.value),['','rate'],'ratio of offers the other signals only');
  // Rename moves the signal (order kept), its proof entry and every maxRatioOf reference.
  oneStep(ui,()=>ui.set('rate name','requests'));
  assert.deepEqual(Object.keys(edgeOf(ui).telemetry.signals),['requests','errors']);
  assert.deepEqual(edgeOf(ui).telemetry.proof,{requests:{min:10},errors:{maxRatioOf:'requests',max:0.01}});
  for(const [label,value,message] of [['requests name','2fast',/letter/],['requests name','errors',/already/],['requests query','',/query/],['requests source','honeycomb',/Honeycomb/]]){
    const before=ui.text,undo=ui.h.session.canUndo();ui.set(label,value);
    assert.equal(ui.text,before,label+' '+value+' is refused');assert.match(ui.error(),message);assert.equal(ui.h.session.canUndo(),undo);ui.select(EDGE);
  }
  oneStep(ui,()=>ui.set('requests source','loki'));assert.deepEqual(edgeOf(ui).telemetry.signals.requests,{loki:PROM_RATE,unit:'req/h'});
  oneStep(ui,()=>ui.set('requests query','{"calc":"COUNT","where":"service.name = notify"}'));
  oneStep(ui,()=>ui.set('requests source','honeycomb'));
  assert.deepEqual(edgeOf(ui).telemetry.signals.requests,{honeycomb:{calc:'COUNT',where:'service.name = notify'},unit:'req/h'},'a JSON query text becomes the Honeycomb query object');
  assert.equal(ui.control('requests query').value,JSON.stringify({calc:'COUNT',where:'service.name = notify'}));
  for(const bad of ['[]','{}','not json']){const before=ui.text;ui.set('requests query',bad);assert.equal(ui.text,before);assert.match(ui.error(),/Honeycomb/);ui.select(EDGE);}
  oneStep(ui,()=>ui.set('requests source','grafana'));assert.equal(edgeOf(ui).telemetry.signals.requests.grafana,JSON.stringify({calc:'COUNT',where:'service.name = notify'}));
  oneStep(ui,()=>ui.set('requests unit',''));assert.deepEqual(edgeOf(ui).telemetry.signals.requests,{grafana:JSON.stringify({calc:'COUNT',where:'service.name = notify'})});
  oneStep(ui,()=>ui.set('requests unit','req/h'));
  // Proof limits.
  oneStep(ui,()=>ui.set('requests max','5000'));assert.deepEqual(edgeOf(ui).telemetry.proof.requests,{min:10,max:5000});
  {const before=ui.text;ui.set('requests min','6000');assert.equal(ui.text,before);assert.match(ui.error(),/above max/);ui.select(EDGE);}
  {const before=ui.text;ui.set('requests min','ten');assert.equal(ui.text,before);ui.select(EDGE);}
  // Limits are finite numbers: Number('Infinity') and NaN never reach the source, through the control or the pure edit.
  for(const bad of ['Infinity','-Infinity','NaN']){
    for(const field of ['min','max']){const before=ui.text;ui.set('requests '+field,bad);assert.equal(ui.text,before,'M3: '+bad+' is not a finite '+field);assert.ok(ui.error(),bad+' explains the refusal');ui.select(EDGE);}
  }
  const C=api(ui.e.C);
  for(const bad of [Infinity,-Infinity,NaN,'10'])for(const field of ['min','max'])
    assert.match(C.telemetryEditBinding(edgeOf(ui).telemetry,{op:'proof',signal:'requests',field,value:bad},{}).error || '',/finite number/,'M3: the pure edit refuses '+String(bad)+' as '+field);
  oneStep(ui,()=>ui.set('requests min',''));oneStep(ui,()=>ui.set('requests max',''));
  assert.deepEqual(edgeOf(ui).telemetry.proof,{errors:{maxRatioOf:'requests',max:0.01}},'an emptied entry is removed');
  oneStep(ui,()=>ui.set('errors ratio of',''));assert.deepEqual(edgeOf(ui).telemetry.proof,{errors:{max:0.01}});
  oneStep(ui,()=>ui.set('errors ratio of','requests'));assert.deepEqual(edgeOf(ui).telemetry.proof,{errors:{max:0.01,maxRatioOf:'requests'}});
  oneStep(ui,()=>ui.set('errors ratio of',''));oneStep(ui,()=>ui.set('errors max',''));
  assert.equal(Object.hasOwn(edgeOf(ui).telemetry,'proof'),false,'an emptied proof is removed');
  // Add a second signal, then the ratio picker offers it; a no-op edit adds no history.
  ui.control('New signal name').value='p95';ui.control('New signal source').value='tempo';ui.control('New signal query').value='{ name = "push" } | quantile_over_time(duration, .95)';
  oneStep(ui,()=>ui.click('Add signal'));assert.deepEqual(edgeOf(ui).telemetry.signals.p95,{tempo:'{ name = "push" } | quantile_over_time(duration, .95)'});
  ui.control('New signal name').value='p95';ui.control('New signal source').value='grafana';ui.control('New signal query').value='x';
  {const before=ui.text;ui.click('Add signal');assert.equal(ui.text,before);assert.match(ui.error(),/already/);ui.select(EDGE);}
  // A no-op edit adds no history: Undo after it reverts the previous real edit.
  const beforeKind=ui.text;oneStep(ui,()=>ui.set('Metrics kind','service'));assert.equal(edgeOf(ui).telemetry.kind,'service');
  const kindSet=ui.text;ui.set('requests unit','req/h ');assert.equal(ui.text,kindSet,'a value that trims to the stored one is a no-op');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,beforeKind,'M12: the no-op added no undo entry');assert.equal(ui.h.session.redo(),true);
});

test('M5 M7 Signals from switches to a page template with parameters and proof overrides, keeps card placement, and expands back into raw signals',()=>{
  const ui=harness(board(null,{templates:TEMPLATES()}),EDGE);ui.metrics();
  assert.deepEqual(ui.control('Signals from').options.map(o=>o.value),['','kafka-topic']);
  ui.set('Metrics kind','service');
  oneStep(ui,()=>ui.set('Signals from','kafka-topic'));
  assert.deepEqual(edgeOf(ui).telemetry,{use:'kafka-topic'},'the template supplies the kind; the draft kind is not written');
  assert.ok(ui.warnings().some(w=>/^telemetry\.topic: template "kafka-topic" needs this parameter/.test(w)),'missing parameters are reported inline');
  assert.equal(ui.row('New signal name'),null,'template signals are edited in Document settings');
  assert.match(ui.metrics().querySelectorAll('p').map(p=>p.textContent).join(' '),/Template signals: in \(grafana, msg\/h\), lag \(grafana, msgs\)/);
  oneStep(ui,()=>ui.set('Template parameter topic','device-events'));oneStep(ui,()=>ui.set('Template parameter group','notify'));
  assert.deepEqual(edgeOf(ui).telemetry,{use:'kafka-topic',topic:'device-events',group:'notify'});assert.deepEqual(ui.warnings(),[]);
  assert.equal(ui.control('lag max').value,'500','proof inputs show the effective template limit');
  oneStep(ui,()=>ui.set('lag max','100'));assert.deepEqual(edgeOf(ui).telemetry.proof,{lag:{max:100}},'only the changed limit is overlaid');
  oneStep(ui,()=>ui.set('lag max','500'));assert.equal(Object.hasOwn(edgeOf(ui).telemetry,'proof'),false,'back to the template value drops the override');
  {const before=ui.text;ui.set('in min','');assert.equal(ui.text,before);assert.match(ui.error(),/template/i);ui.select(EDGE);}
  oneStep(ui,()=>ui.set('Card side','below'));oneStep(ui,()=>ui.set('Card offset','12'));
  assert.equal(ui.control('Metrics kind').options.find(o=>o.value==='').textContent,'(template kind: queue)');
  oneStep(ui,()=>ui.set('Metrics kind','call'));assert.equal(edgeOf(ui).telemetry.kind,'call');
  oneStep(ui,()=>ui.set('Metrics kind',''));assert.equal(Object.hasOwn(edgeOf(ui).telemetry,'kind'),false,'(template kind) removes the override');
  const templated=edgeOf(ui).telemetry;assert.deepEqual(templated,{use:'kafka-topic',topic:'device-events',group:'notify',card:{side:'below',offset:12}});
  oneStep(ui,()=>ui.set('Signals from',''));
  assert.deepEqual(edgeOf(ui).telemetry,{kind:'queue',
    signals:{in:{grafana:'sum(rate(kafka_messagesin_total{topic="device-events"}[5m]))*3600',unit:'msg/h'},lag:{grafana:'max(kafka_consumergroup_lag{topic="device-events",group="notify"})',unit:'msgs'}},
    proof:{in:{min:10},lag:{max:500}},links:{dashboard:'https://acme.grafana.net/d/kafka?var-topic=device-events'},card:{side:'below',offset:12}},'raw signals start from the expanded template');
  const C=ui.e.C,tpl=C.trackingTelemetry(ui.raw.page).templates;
  assert.deepEqual(plain(C.carrierTelemetry(edgeOf(ui),tpl)),plain(C.carrierTelemetry({telemetry:templated},tpl)),'the expansion binds exactly what the template binding did');
});

test('M6 M7 link-outs and card placement validate, normalize and remove empty objects',()=>{
  const ui=harness(board({kind:'call',signals:{rate:{grafana:PROM_RATE}}}),EDGE);ui.metrics();
  oneStep(ui,()=>ui.set('Dashboard link','https://acme.grafana.net/d/notify/push'));
  oneStep(ui,()=>ui.set('Query link','HTTPS://acme.grafana.net/explore?left=push'));
  assert.deepEqual(edgeOf(ui).telemetry.links,{dashboard:'https://acme.grafana.net/d/notify/push',query:'https://acme.grafana.net/explore?left=push'});
  for(const [label,value] of [['Dashboard link','acme.grafana.net/d'],['Query link','javascript:alert(1)'],['Card offset','2000'],['Card offset','x']]){
    const before=ui.text;ui.set(label,value);assert.equal(ui.text,before,label+' '+value+' is refused');assert.ok(ui.error(),label+' explains the refusal');ui.select(EDGE);
  }
  assert.deepEqual(ui.control('Card side').options.map(o=>o.value),['','right','left','above','below']);
  for(const bad of [Infinity,-Infinity,NaN,'12'])assert.match(api(ui.e.C).telemetryEditBinding(edgeOf(ui).telemetry,{op:'card',field:'offset',value:bad},{}).error || '',/between/,'card offset refuses '+String(bad));
  oneStep(ui,()=>ui.set('Card side','left'));oneStep(ui,()=>ui.set('Card offset','-12'));
  assert.deepEqual(edgeOf(ui).telemetry.card,{side:'left',offset:-12});
  oneStep(ui,()=>ui.set('Card side',''));oneStep(ui,()=>ui.set('Card offset',''));assert.equal(Object.hasOwn(edgeOf(ui).telemetry,'card'),false);
  oneStep(ui,()=>ui.set('Dashboard link',''));oneStep(ui,()=>ui.set('Query link',''));assert.equal(Object.hasOwn(edgeOf(ui).telemetry,'links'),false);
  assert.deepEqual(edgeOf(ui).telemetry,{kind:'call',signals:{rate:{grafana:PROM_RATE}}});
});

test('M9 inline warnings are the validator messages for this carrier',()=>{
  const bad={kind:'call',signals:{rate:{grafana:PROM_RATE,loki:LOKI_IN},errors:{grafana:PROM_ERRORS}},proof:{errors:{maxRatioOf:'rate',max:0.01},lag:{max:1}},links:{dashboard:'ftp://x'}};
  const spec=board(bad),ui=harness(spec,EDGE);ui.metrics();
  const C=ui.e.C,prefix='sections[0].diagram.edges[0].';
  const validator=plain(C.validate(C.normalize(spec)).warnings).filter(w=>w.startsWith(prefix+'telemetry')).map(w=>w.slice(prefix.length));
  assert.ok(validator.length>=4,'the fixture has several carrier warnings');
  assert.deepEqual(ui.warnings(),validator,'M9: same text as the validator, relative to the carrier');
  assert.deepEqual(plain(C.telemetryCarrierState(spec,EDGE,null).warnings),validator);
  ui.select({kind:'node',section:0,id:'ingest'});assert.deepEqual(ui.warnings(),[],'a carrier without telemetry has no warnings');
});

function topologyFixtures(){
  const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API',telemetry:{kind:'service',signals:{up:{grafana:'up{job="api"}'}}}},store:{title:'Store',telemetry:{use:'missing'}}},rows:[['api','store']],
    edges:[{from:'api',to:'store',label:'Persist',telemetry:{kind:'call',signals:{rate:{loki:LOKI_IN}}}}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[],panels:[{id:'status',type:'live-status'}],
    topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{tickets:['API-1']}}}]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}

test('M8 M9 imported carriers show the inherited binding read only and edit the consumer overlay; the provider is untouched',()=>{
  const C=api(harness(board()).e.C),f=topologyFixtures(),providerBefore=JSON.stringify(f.provider);
  const node={kind:'node',section:0,id:'shared::api'};
  const state=C.telemetryCarrierState(f.consumer,node,f.context);
  assert.equal(state.imported,true);assert.equal(state.binding,null);assert.equal(state.provider,'provider / core','the inherited binding names its provider');
  assert.deepEqual(plain(state.inherited),{kind:'service',signals:{up:{grafana:'up{job="api"}'}}});
  let text=JSON.stringify(f.consumer,null,2),raw=JSON.parse(text);
  const apply=(target,edit)=>{const plan=C.planCarrierTelemetry(text,raw,target,edit,f.context);assert.equal(plan.error,undefined,plan.error);text=plan.text;raw=JSON.parse(text);};
  apply(node,{op:'addSignal',name:'rate',source:'grafana',query:PROM_RATE,kind:'service'});
  assert.deepEqual(diagramOf(raw).topologyImports[0].nodeTracking.api,{tickets:['API-1'],telemetry:{kind:'service',signals:{rate:{grafana:PROM_RATE}}}},'M8: the overlay entry keeps its tickets');
  let resolved=diagramOf(C.FlowTopology.resolveSource(raw,f.context));
  assert.deepEqual(plain(resolved.nodes['shared::api'].telemetry),{kind:'service',signals:{rate:{grafana:PROM_RATE}}},'the local binding replaces the inherited one');
  assert.deepEqual(plain(C.telemetryCarrierState(raw,node,f.context).inherited),{kind:'service',signals:{up:{grafana:'up{job="api"}'}}},'the inherited binding stays visible');
  // The imported edge has no overlay entry yet; one is created.
  const edgeIndex=resolved.edges.findIndex(e=>e.from==='shared::api' && e.to==='shared::store'),edge={kind:'edge',section:0,index:edgeIndex};
  assert.match(C.planCarrierTelemetry(text,raw,edge,{op:'link',key:'dashboard',value:'https://acme.grafana.net/d/x'},f.context).error || '',/[Aa]dd a signal or choose a template/,'links need a binding first');
  assert.match(C.planCarrierTelemetry(text,raw,{...edge,key:'shared::store->shared::api'},{op:'addSignal',name:'rate',source:'grafana',query:PROM_RATE,kind:'call'},f.context).error || '',/changed/,'a stale connection identity is refused');
  apply(edge,{op:'addSignal',name:'rate',source:'grafana',query:PROM_RATE,kind:'call'});
  apply(edge,{op:'card',field:'side',value:'right'});
  assert.deepEqual(diagramOf(raw).topologyImports[0].edgeTracking,{'api->store':{telemetry:{kind:'call',signals:{rate:{grafana:PROM_RATE}},card:{side:'right'}}}});
  apply(node,{op:'remove'});assert.deepEqual(diagramOf(raw).topologyImports[0].nodeTracking.api,{tickets:['API-1']},'removing the local binding keeps the tickets');
  resolved=diagramOf(C.FlowTopology.resolveSource(raw,f.context));
  assert.deepEqual(plain(resolved.nodes['shared::api'].telemetry),{kind:'service',signals:{up:{grafana:'up{job="api"}'}}},'the inherited binding applies again');
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider spec is untouched');
  assert.equal(JSON.stringify(f.context.specs[0]),providerBefore);
  // A provider binding its own templates cannot expand is reported at the imported carrier.
  const store=C.telemetryCarrierState(raw,{kind:'node',section:0,id:'shared::store'},f.context);
  assert.equal(store.inherited,null);assert.ok(store.warnings.some(w=>/provider "provider" .*telemetry\.use: /.test(w)),'M9: provider drops are listed');
  const prefix='sections[0].diagram.nodes.shared::store.';
  assert.deepEqual(plain(store.warnings),plain(C.validate(C.normalize(C.FlowTopology.resolveSource(raw,f.context))).warnings).filter(w=>w.startsWith(prefix+'telemetry')).map(w=>w.slice(prefix.length)));
});

test('M8 the inspector shows an imported carrier inherited binding read only and edits its overlay',()=>{
  const f=topologyFixtures(),ui=harness(f.consumer);
  ui.h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const node={kind:'node',section:0,id:'shared::api'};ui.select(node);
  const box=ui.metrics(),notes=box.querySelectorAll('p').map(p=>p.textContent).join(' ');
  assert.match(notes,/Inherited metrics from provider \/ core \(read only\): service · up \(grafana\)/);
  assert.match(notes,/replaces/);assert.doesNotMatch(notes,/Unbound/,'an inherited binding is not unbound');
  ui.control('New signal name').value='rate';ui.control('New signal source').value='grafana';ui.control('New signal query').value=PROM_RATE;ui.set('Metrics kind','service');
  oneStep(ui,()=>ui.click('Add signal'),node);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.api,{tickets:['API-1'],telemetry:{kind:'service',signals:{rate:{grafana:PROM_RATE}}}});
  assert.ok(ui.button('Remove metrics'));oneStep(ui,()=>ui.click('Remove metrics'),node);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.api,{tickets:['API-1']});
  // The imported connection: the provider binding is read only and named; the local overlay is editable.
  const C=ui.e.C,providerBefore=JSON.stringify(f.provider),resolvedEdge=()=>diagramOf(C.FlowTopology.resolveSource(ui.raw,f.context)).edges.find(e=>e.from==='shared::api' && e.to==='shared::store');
  const edge={kind:'edge',section:0,index:diagramOf(C.FlowTopology.resolveSource(ui.raw,f.context)).edges.findIndex(e=>e.from==='shared::api' && e.to==='shared::store')};
  assert.ok(edge.index>=0,'the imported connection resolves');
  ui.select(edge);
  const inherited=()=>ui.metrics().querySelectorAll('p').map(p=>p.textContent).join(' ');
  assert.match(inherited(),/Inherited metrics from provider \/ core \(read only\): call · rate \(loki\)\. A binding saved here replaces it in this consumer\./);
  assert.doesNotMatch(inherited(),/Unbound/);assert.equal(ui.button('Remove metrics'),null,'the inherited binding is not removable here');
  assert.equal(ui.row('rate query'),null,'inherited signals are not editable rows');
  ui.control('New signal name').value='rate';ui.control('New signal source').value='grafana';ui.control('New signal query').value=PROM_RATE;ui.set('Metrics kind','call');
  oneStep(ui,()=>ui.click('Add signal'),edge);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].edgeTracking,{'api->store':{telemetry:{kind:'call',signals:{rate:{grafana:PROM_RATE}}}}});
  assert.match(inherited(),/Inherited metrics from provider \/ core \(read only\): call · rate \(loki\)/,'the inherited binding stays visible beside the local one');
  oneStep(ui,()=>ui.set('Card side','below'),edge);oneStep(ui,()=>ui.set('rate min','5'),edge);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].edgeTracking['api->store'].telemetry,{kind:'call',signals:{rate:{grafana:PROM_RATE}},card:{side:'below'},proof:{rate:{min:5}}});
  assert.deepEqual(plain(resolvedEdge().telemetry),{kind:'call',signals:{rate:{grafana:PROM_RATE}},card:{side:'below'},proof:{rate:{min:5}}},'the local binding replaces the inherited one');
  oneStep(ui,()=>ui.click('Remove metrics'),edge);
  assert.equal(Object.hasOwn(diagramOf(ui.raw).topologyImports[0],'edgeTracking'),false,'the empty overlay entry is removed');
  assert.deepEqual(plain(resolvedEdge().telemetry),{kind:'call',signals:{rate:{loki:LOKI_IN}}},'the inherited binding applies again');
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider spec is untouched');
});

test('M10 M12 Document settings edit the page telemetry block, validate window and refresh, and leave Jira untouched',()=>{
  const DOC={kind:'document'},ui=harness(board(),DOC),box=ui.settings();
  assert.ok(box.closest('fieldset.tracking-editor'),'the block sits in Document settings → Tracking');
  const tracking=()=>ui.raw.page.tracking,jira={site:'https://acme.atlassian.net',epic:'DOOR-100'};
  for(const [label,group,key,value] of [['Grafana Prometheus UID','grafana','prometheus','prom-main'],['Grafana Loki UID','grafana','loki','loki-main'],['Grafana Tempo UID','grafana','tempo','tempo-main'],['Grafana SQL UID','grafana','sql','lake'],['Honeycomb environment','honeycomb','environment','prod'],['Honeycomb dataset','honeycomb','dataset','doorbell-prod']]){
    oneStep(ui,()=>ui.set(label,value),DOC);assert.equal(tracking().telemetry[group][key],value);assert.deepEqual(tracking().jira,jira);
  }
  for(const [label,value,message] of [['Metrics window','90x',/duration/],['Metrics window','0h',/duration/],['Metrics refresh ms','1000',/60000/],['Metrics refresh ms','-5',/60000/]]){
    const before=ui.text;ui.set(label,value);assert.equal(ui.text,before,label+' '+value+' is refused');assert.match(ui.error(),message);ui.select(DOC);
  }
  for(const bad of [Infinity,NaN,'300000'])assert.match(api(ui.e.C).telemetryEditPage({},{op:'refreshMs',value:bad}).error || '',/60000/,'refresh refuses '+String(bad));
  oneStep(ui,()=>ui.set('Metrics window','6h'),DOC);oneStep(ui,()=>ui.set('Metrics refresh ms','300000'),DOC);
  assert.deepEqual(tracking().telemetry,{grafana:{prometheus:'prom-main',loki:'loki-main',tempo:'tempo-main',sql:'lake'},honeycomb:{environment:'prod',dataset:'doorbell-prod'},window:'6h',refreshMs:300000});
  assert.deepEqual(plain(ui.e.C.trackingTelemetry(ui.raw.page)),{enabled:true,grafana:{prometheus:'prom-main',loki:'loki-main',tempo:'tempo-main',sql:'lake'},honeycomb:{environment:'prod',dataset:'doorbell-prod'},window:'6h',refreshMs:300000,templates:{}});
  for(const label of ['Grafana Prometheus UID','Grafana Loki UID','Grafana Tempo UID','Grafana SQL UID','Honeycomb environment','Honeycomb dataset','Metrics window','Metrics refresh ms'])oneStep(ui,()=>ui.set(label,''),DOC);
  assert.deepEqual(tracking(),{jira},'an empty block removes tracking.telemetry');
  // Page warnings: an authored invalid value is listed until fixed.
  const bad=board(null,{window:'forever',grafana:{prometheus:''}}),warned=harness(bad,DOC);warned.settings();
  assert.deepEqual(warned.warnings('Metrics settings warnings'),plain(warned.e.C.validate(warned.e.C.normalize(bad)).warnings).filter(w=>w.startsWith('tracking.telemetry')));
  assert.ok(warned.warnings('Metrics settings warnings').length>=2);
});

test('M11 M12 the templates editor adds, edits and removes templates; a template in use cannot be removed',()=>{
  const DOC={kind:'document'},ui=harness(board(),DOC);ui.settings();
  const tpl=()=>ui.raw.page.tracking.telemetry.templates;
  const add=(name,kind,params,signal,source,query,unit)=>{ui.control('New template name').value=name;ui.control('New template kind').value=kind;ui.control('New template parameters').value=params;
    ui.control('New template signal name').value=signal;ui.control('New template signal source').value=source;ui.control('New template signal query').value=query;ui.control('New template signal unit').value=unit;ui.click('Add template');};
  for(const [args,message] of [[['kafka topic','queue','topic','lag','grafana',LAG,''],/letter/],[['kafka-topic','queue','kind','lag','grafana',LAG,''],/kind/],[['kafka-topic','queue','topic, topic','lag','grafana',LAG,''],/[Dd]uplicate/],[['kafka-topic','queue','topic','lag','grafana','',''],/query/]]){
    const before=ui.text;add(...args);assert.equal(ui.text,before,args.join(' ')+' is refused');assert.match(ui.error(),message);ui.select(DOC);
  }
  oneStep(ui,()=>add('kafka-topic','queue','topic, group','lag','grafana',LAG,'msgs'),DOC);
  assert.deepEqual(tpl(),{'kafka-topic':{kind:'queue',params:['topic','group'],signals:{lag:{grafana:LAG,unit:'msgs'}}}});
  {const before=ui.text;add('kafka-topic','queue','topic','lag','grafana',LAG,'');assert.equal(ui.text,before);assert.match(ui.error(),/already/);ui.select(DOC);}
  ui.control('kafka-topic new signal name').value='in';ui.control('kafka-topic new signal source').value='grafana';ui.control('kafka-topic new signal query').value='sum(rate(kafka_messagesin_total{topic="$topic"}[5m]))*3600';
  oneStep(ui,()=>ui.click('Add kafka-topic signal'),DOC);
  oneStep(ui,()=>ui.set('kafka-topic in unit','msg/h'),DOC);oneStep(ui,()=>ui.set('kafka-topic in min','10'),DOC);oneStep(ui,()=>ui.set('kafka-topic lag max','500'),DOC);
  oneStep(ui,()=>ui.set('kafka-topic dashboard link','https://acme.grafana.net/d/kafka?var-topic=$topic'),DOC);
  assert.deepEqual(tpl()['kafka-topic'],{kind:'queue',params:['topic','group'],signals:{lag:{grafana:LAG,unit:'msgs'},in:{grafana:'sum(rate(kafka_messagesin_total{topic="$topic"}[5m]))*3600',unit:'msg/h'}},proof:{in:{min:10},lag:{max:500}},links:{dashboard:'https://acme.grafana.net/d/kafka?var-topic=$topic'}});
  assert.deepEqual(plain(ui.e.C.trackingTelemetry(ui.raw.page).templates['kafka-topic'].params),['topic','group'],'the parser accepts the edited template');
  oneStep(ui,()=>ui.set('kafka-topic template parameters','topic, group, cluster'),DOC);assert.deepEqual(tpl()['kafka-topic'].params,['topic','group','cluster']);
  {const before=ui.text;ui.set('kafka-topic template parameters','topic, use');assert.equal(ui.text,before);assert.match(ui.error(),/use/);ui.select(DOC);}
  oneStep(ui,()=>ui.set('kafka-topic template kind',''),DOC);assert.equal(Object.hasOwn(tpl()['kafka-topic'],'kind'),false,'a template kind is optional');
  oneStep(ui,()=>ui.set('kafka-topic template kind','queue'),DOC);
  // An existing template signal: rename (its limit follows, order kept), change source, change query; each undoable.
  const BACKLOG='sum(count_over_time({topic="$topic"} |= "consumer lag" [5m]))';
  oneStep(ui,()=>ui.set('kafka-topic lag name','backlog'),DOC);
  assert.deepEqual(Object.keys(tpl()['kafka-topic'].signals),['backlog','in']);assert.deepEqual(tpl()['kafka-topic'].proof,{in:{min:10},backlog:{max:500}});
  {const before=ui.text;ui.set('kafka-topic backlog name','in');assert.equal(ui.text,before);assert.match(ui.error(),/already/);ui.select(DOC);}
  oneStep(ui,()=>ui.set('kafka-topic backlog source','loki'),DOC);assert.deepEqual(tpl()['kafka-topic'].signals.backlog,{loki:LAG,unit:'msgs'});
  oneStep(ui,()=>ui.set('kafka-topic backlog query',BACKLOG),DOC);assert.deepEqual(tpl()['kafka-topic'].signals.backlog,{loki:BACKLOG,unit:'msgs'});
  {const before=ui.text;ui.set('kafka-topic backlog query','');assert.equal(ui.text,before);assert.match(ui.error(),/query/);ui.select(DOC);}
  const edited={kind:'queue',params:['topic','group','cluster'],signals:{backlog:{loki:BACKLOG,unit:'msgs'},in:{grafana:'sum(rate(kafka_messagesin_total{topic="$topic"}[5m]))*3600',unit:'msg/h'}},
    proof:{in:{min:10},backlog:{max:500}},links:{dashboard:'https://acme.grafana.net/d/kafka?var-topic=$topic'}};
  assert.deepEqual(tpl()['kafka-topic'],edited);
  const exported=JSON.parse(ui.e.C.FlowviewCompatibility.stampText(ui.text,ui.raw));
  assert.deepEqual(exported.page.tracking.telemetry.templates,{'kafka-topic':edited},'M11: Export project keeps the renamed signal, its source and its query');
  assert.deepEqual(plain(ui.e.C.trackingTelemetry(exported.page).templates['kafka-topic'].signals.backlog),{loki:BACKLOG,unit:'msgs'},'the exported template parses');
  oneStep(ui,()=>ui.click('Remove kafka-topic signal in'),DOC);assert.deepEqual(Object.keys(tpl()['kafka-topic'].signals),['backlog']);
  assert.equal(Object.hasOwn(tpl()['kafka-topic'].proof,'in'),false,'the removed signal takes its limit with it');
  {const before=ui.text;ui.click('Remove kafka-topic signal backlog');assert.equal(ui.text,before);assert.match(ui.error(),/at least one signal/);ui.select(DOC);}
  // A carrier uses the template; removing it is refused until the carrier stops using it.
  ui.select(EDGE);ui.set('Signals from','kafka-topic');assert.equal(edgeOf(ui).telemetry.use,'kafka-topic');
  ui.select(DOC);{const before=ui.text;ui.click('Remove template kafka-topic');assert.equal(ui.text,before);assert.match(ui.error(),/1 carrier uses template "kafka-topic"/);ui.select(DOC);}
  ui.select(EDGE);ui.click('Remove metrics');ui.select(DOC);
  oneStep(ui,()=>ui.click('Remove template kafka-topic'),DOC);
  assert.deepEqual(ui.raw.page.tracking,{jira:{site:'https://acme.atlassian.net',epic:'DOOR-100'}},'removing the only template removes the empty block');
});

test('M13 Export project keeps carrier, overlay and page telemetry written by the editor and declares flow.telemetry',()=>{
  const ui=harness(board(null,{templates:TEMPLATES()}),EDGE),C=api(ui.e.C);ui.metrics();
  ui.set('Signals from','kafka-topic');ui.select(EDGE);ui.set('Template parameter topic','device-events');ui.select(EDGE);ui.set('Template parameter group','notify');ui.select(EDGE);ui.set('Card side','above');
  ui.select({kind:'node',section:0,id:'ingest'});ui.control('New signal name').value='rate';ui.control('New signal source').value='honeycomb';ui.control('New signal query').value='{"calc":"COUNT","where":"service.name = ingest"}';ui.set('Metrics kind','service');ui.click('Add signal');
  ui.select({kind:'document'});ui.set('Metrics window','1h');
  const authored=ui.raw,exported=JSON.parse(C.FlowviewCompatibility.stampText(ui.text,authored));
  assert.ok(exported.page.flowview.features.includes('flow.telemetry'));
  assert.deepEqual(exported.page.tracking,authored.page.tracking);assert.deepEqual(exported.page.sections,authored.page.sections);
  assert.deepEqual(diagramOf(exported).edges[0].telemetry,{use:'kafka-topic',topic:'device-events',group:'notify',card:{side:'above'}});
  assert.deepEqual(diagramOf(exported).nodes.ingest.telemetry,{kind:'service',signals:{rate:{honeycomb:{calc:'COUNT',where:'service.name = ingest'}}}});
  assert.deepEqual(exported.page.tracking.telemetry,{templates:TEMPLATES(),window:'1h'});
  // A consumer overlay written by the editor survives the authored export unchanged.
  const f=topologyFixtures();let text=JSON.stringify(f.consumer,null,2);
  const plan=C.planCarrierTelemetry(text,JSON.parse(text),{kind:'node',section:0,id:'shared::api'},{op:'addSignal',name:'rate',source:'grafana',query:PROM_RATE,kind:'service'},f.context);text=plan.text;
  const stamped=JSON.parse(C.FlowviewCompatibility.stampText(text,C.FlowTopology.resolveSource(JSON.parse(text),f.context)));
  assert.deepEqual(diagramOf(stamped).topologyImports[0].nodeTracking.api.telemetry,{kind:'service',signals:{rate:{grafana:PROM_RATE}}});
  assert.ok(stamped.page.flowview.features.includes('flow.telemetry'));
});

test('M15 docs describe the Workbench Metrics editor',()=>{
  const doc=fs.readFileSync(path.join(repo,'docs/live-status.md'),'utf8'),start=doc.indexOf('\n## Workbench'),end=doc.indexOf('\n## ',start+5),section=doc.slice(start,end);
  for(const phrase of ['Metrics','Add signal','Signals from','Template parameter','Remove metrics','Card side','Document settings → Tracking → Metrics','Add template','Undo','Export project','read only'])
    assert.ok(section.includes(phrase),'Workbench section mentions '+phrase);
});

test('Allow metrics preserves authored settings and bindings with one Undo, no-op and retired-form protection',()=>{
  const spec=board({kind:'call',signals:{rate:{grafana:'up'}}},{templates:TEMPLATES(),future:{keep:['unknown']},window:'24h'});
  const target={kind:'document'},ui=harness(spec,target),original=ui.text;
  const toggle=()=>ui.control('Allow metrics').querySelector('input');
  assert.equal(toggle().checked,true,'absence permits availability');
  const set=value=>{toggle().checked=value;toggle().fire('change');ui.h.flush();};
  oneStep(ui,()=>set(false),target);
  assert.deepEqual(ui.raw,{...spec,page:{...spec.page,tracking:{...spec.page.tracking,telemetry:{...spec.page.tracking.telemetry,enabled:false}}}});
  const disabled=ui.text;
  oneStep(ui,()=>set(true),target);
  set(true);assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,disabled,'no-op did not consume an Undo');
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,original,'exactly two logical edits');
  ui.select(target);const stale=toggle();ui.select(EDGE);stale.checked=false;stale.fire('change');ui.h.flush();assert.equal(ui.text,original,'retired controls cannot commit');
});

test('Allow metrics pure plans preserve bare/wrapped page bytes, reject malformed settings and require a boolean',()=>{
  const C=api(harness(board()).e.C),spec=board(null,{future:{x:1},templates:TEMPLATES()});
  for(const raw of [spec,spec.page]){
    const text=' \n'+JSON.stringify(raw,null,2)+'\n ';
    for(const value of [false,true]){
      const plan=C.planPageTelemetry(text,raw,{op:'enabled',value});assert.equal(plan.error,undefined);
      const next=JSON.parse(plan.text),page=next.page || next;
      assert.deepEqual(page.tracking,{...spec.page.tracking,telemetry:{...spec.page.tracking.telemetry,enabled:value}});
      assert.deepEqual(page.sections,spec.page.sections);assert.ok(plan.text.startsWith(' \n'));assert.ok(plan.text.endsWith('\n '));
      assert.equal(C.planPageTelemetry(plan.text,next,{op:'enabled',value}).text,plan.text);
    }
  }
  for(const value of [null,undefined,'false',0,{},[]])assert.match(C.telemetryEditPage({}, {op:'enabled',value}).error,/true or false/);
  for(const field of ['tracking','telemetry']){
    const raw=board();if(field==='tracking')raw.page.tracking='handwritten';else raw.page.tracking.telemetry=['handwritten'];
    const text=JSON.stringify(raw);assert.match(C.planPageTelemetry(text,raw,{op:'enabled',value:false}).error,/repair/);assert.equal(JSON.stringify(raw),text);
  }
  const bare=spec.page.sections[0].diagram;assert.match(C.planPageTelemetry(JSON.stringify(bare),bare,{op:'enabled',value:false}).error,/document settings/);
});
