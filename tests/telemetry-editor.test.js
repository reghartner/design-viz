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
| M8 | #1266 Imported carriers (node and connection) edit the provider binding merged with this document's changes: Add signal adds, inherited signals can be hidden (and shown again) or have single fields changed (Revert to inherited), card and link edits store only the changed field; the consumer overlay `topologyImports[i].nodeTracking/edgeTracking[key].telemetry` is `{extends:true,…}` (tickets kept, provider unchanged); Revert all removes it; an older replacing overlay keeps its meaning and Merge with provider converts it. | provider with bindings; consumer importing it | overlay shapes after each edit; resolved bindings; one Undo per step | a consumer binding that replaces (drops) the provider's signals; card edits that copy the whole binding |
| M9 | Inline validation lists the #937 parser warnings for the carrier, the same text the validator emits at that carrier, including provider bindings the resolver dropped. | connection with a two-source signal, an unknown limit, a non-http link; provider node with an unexpandable `use` | the `Metrics warnings` list deepEquals the validator warnings at that carrier with the carrier prefix removed | hand-written messages that drift from the validator; missing provider drops |
| M10 | Status board settings → Metrics (#1236; was Document settings → Tracking → Metrics) edits page `tracking.telemetry`: Grafana Prometheus/Loki/Tempo/SQL UIDs, Honeycomb environment/dataset, window (duration) and refresh (≥ 60000 ms). Empty values remove keys; an empty block removes `tracking.telemetry`; Jira settings are untouched. Page warnings are listed. | page with `tracking.jira`; a page with an invalid window and UID | each field lands at its key and `tracking.jira` is deepEqual-unchanged; bad window/refresh refused; clearing all leaves `tracking` deepEqual `{jira}`; warnings deepEqual the validator's `tracking.telemetry` warnings | rewriting `tracking.jira`; leaving `telemetry:{}`; accepting `refreshMs:1000` |
| M11 | Templates editor: add (name, kind, parameters, first signal); rename a template signal (its limit follows), change its source and query; edit kind/parameters/proof/links; remove a signal (never the last); remove a template (refused while a carrier uses it). Every edit is undoable and preserved by export. | document target on `board()` | the template deepEquals the expected object after each step; export `templates` deepEquals the source; the last-signal and in-use removals are refused with messages | orphaned limits after a rename; a source change that drops the query; templates the parser would drop; orphaning carriers |
| M12 | Each edit is one Undo step; Undo and Redo restore the exact prior and next source text. A no-op edit adds no history. | every edit above | `oneStep`: text changes, Undo restores the exact prior text, Redo the exact next text; a trimmed no-op then Undo reverts the previous real edit | multi-step edits; phantom history entries |
| M13 | Export project round-trip: the stamped export keeps carrier, overlay and page telemetry exactly and declares flow.telemetry. | editor-written edge template binding, node Honeycomb signal, page window, consumer overlay | `stampText` export deepEquals authored `tracking` and `sections`; `flow.telemetry` declared | an export that strips `telemetry` or template parameters |
| M14 | Text boxes show no Metrics sub-section and the planner refuses them. | text-box node `note` | no `fieldset.metrics-editor`; the plan error names text boxes | binding telemetry to text boxes |
| M15 | docs/live-status.md "Workbench" describes the Metrics editor and the Status board settings block. | docs file | the Workbench section contains every control name | missing docs |
| P1 | Preview metrics layout toggle: desktop browser coverage in telemetry-preview.spec.mjs. | n/a | n/a | n/a |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/inspector','workbench/io-model']
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
    settings(){const box=h.guide.querySelector('fieldset.metrics-settings');assert.ok(box,'M10: Status board settings → Metrics holds the page Metrics block');return box;},
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
  assert.equal(ui.row('New signal name'),null,'template signals are edited in Status board settings');
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

test('M8 M9 #1266 imported carriers merge consumer additions, filters and overrides with the inherited binding; the provider is untouched',()=>{
  const C=api(harness(board()).e.C),f=topologyFixtures(),providerBefore=JSON.stringify(f.provider),UP={kind:'service',signals:{up:{grafana:'up{job="api"}'}}};
  const node={kind:'node',section:0,id:'shared::api'};
  const state=C.telemetryCarrierState(f.consumer,node,f.context);
  assert.equal(state.imported,true);assert.equal(state.provider,'provider / core','the inherited binding names its provider');
  assert.deepEqual(plain(state.inherited),UP);assert.deepEqual(plain(state.binding),UP,'the editor starts from the inherited binding');
  assert.deepEqual(plain(state.merge),{overlay:null,inheritedNames:['up'],hidden:[],staleHidden:[],overridden:[],allHidden:false});
  let text=JSON.stringify(f.consumer,null,2),raw=JSON.parse(text);
  const apply=(target,edit)=>{const plan=C.planCarrierTelemetry(text,raw,target,edit,f.context);assert.equal(plan.error,undefined,plan.error);text=plan.text;raw=JSON.parse(text);};
  const overlay=()=>diagramOf(raw).topologyImports[0].nodeTracking.api;
  const resolvedNode=()=>plain(diagramOf(C.FlowTopology.resolveSource(raw,f.context)).nodes['shared::api'].telemetry);
  apply(node,{op:'addSignal',name:'rate',source:'grafana',query:PROM_RATE,kind:'service'});
  assert.deepEqual(overlay(),{tickets:['API-1'],telemetry:{extends:true,signals:{rate:{grafana:PROM_RATE}}}},'M8: Add signal stores only the addition; the overlay keeps its tickets');
  assert.deepEqual(resolvedNode(),{kind:'service',signals:{up:{grafana:'up{job="api"}'},rate:{grafana:PROM_RATE}}},'the inherited signal stays beside the added one');
  apply(node,{op:'signal',name:'up',field:'unit',value:'req/s'});
  assert.deepEqual(overlay().telemetry.signals.up,{unit:'req/s'},'an inherited field edit stores only that field');
  assert.deepEqual(plain(C.telemetryCarrierState(raw,node,f.context).merge.overridden),['up']);
  apply(node,{op:'revert',name:'up'});assert.deepEqual(overlay().telemetry,{extends:true,signals:{rate:{grafana:PROM_RATE}}},'Revert to inherited removes the override');
  apply(node,{op:'hide',name:'up',value:true});assert.deepEqual(overlay().telemetry.hide,['up']);
  assert.deepEqual(resolvedNode(),{kind:'service',signals:{rate:{grafana:PROM_RATE}}},'a hidden inherited signal is gone in this document');
  assert.deepEqual(plain(C.telemetryCarrierState(raw,node,f.context).merge.hidden),['up']);
  apply(node,{op:'hide',name:'up',value:false});assert.equal(Object.hasOwn(overlay().telemetry,'hide'),false,'Show removes the filter');
  assert.match(C.planCarrierTelemetry(text,raw,node,{op:'hide',name:'rate',value:true},f.context).error || '',/not inherited/,'only inherited signals can be hidden');
  // The imported edge: links and card settings patch the inherited binding instead of copying it.
  let resolved=diagramOf(C.FlowTopology.resolveSource(raw,f.context));
  const edgeIndex=resolved.edges.findIndex(e=>e.from==='shared::api' && e.to==='shared::store'),edge={kind:'edge',section:0,index:edgeIndex};
  assert.match(C.planCarrierTelemetry(text,raw,{...edge,key:'shared::store->shared::api'},{op:'addSignal',name:'rate',source:'grafana',query:PROM_RATE,kind:'call'},f.context).error || '',/changed/,'a stale connection identity is refused');
  apply(edge,{op:'link',key:'dashboard',value:'https://acme.grafana.net/d/x'});apply(edge,{op:'card',field:'side',value:'right'});
  assert.deepEqual(diagramOf(raw).topologyImports[0].edgeTracking,{'api->store':{telemetry:{extends:true,links:{dashboard:'https://acme.grafana.net/d/x'},card:{side:'right'}}}},'card and link edits store only the change');
  apply(node,{op:'remove'});assert.deepEqual(overlay(),{tickets:['API-1']},'Revert all removes the overlay binding and keeps the tickets');
  assert.deepEqual(resolvedNode(),UP,'the inherited binding applies unchanged');
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider spec is untouched');
  assert.equal(JSON.stringify(f.context.specs[0]),providerBefore);
  // An older replacing overlay keeps its meaning and is edited as a whole binding.
  const old=plain(raw);diagramOf(old).topologyImports[0].nodeTracking.api.telemetry={kind:'service',signals:{rate:{grafana:PROM_RATE}}};
  const oldState=C.telemetryCarrierState(old,node,f.context);assert.equal(oldState.merge,null);assert.deepEqual(plain(oldState.binding),{kind:'service',signals:{rate:{grafana:PROM_RATE}}});
  text=JSON.stringify(old,null,2);raw=JSON.parse(text);apply(node,{op:'signal',name:'rate',field:'unit',value:'req/h'});
  assert.deepEqual(overlay().telemetry,{kind:'service',signals:{rate:{grafana:PROM_RATE,unit:'req/h'}}},'a replace overlay stays a replace overlay');
  // A provider binding its own templates cannot expand is reported at the imported carrier.
  const store=C.telemetryCarrierState(raw,{kind:'node',section:0,id:'shared::store'},f.context);
  assert.equal(store.inherited,null);assert.ok(store.warnings.some(w=>/provider "provider" .*telemetry\.use: /.test(w)),'M9: provider drops are listed');
  const prefix='sections[0].diagram.nodes.shared::store.';
  assert.deepEqual(plain(store.warnings),plain(C.validate(C.normalize(C.FlowTopology.resolveSource(raw,f.context))).warnings).filter(w=>w.startsWith(prefix+'telemetry')).map(w=>w.slice(prefix.length)));
});

test('M8 #1266 the inspector lists inherited and added signals, hides and shows inherited ones and reverts overrides, one Undo each',()=>{
  const f=topologyFixtures(),ui=harness(f.consumer);
  ui.h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const node={kind:'node',section:0,id:'shared::api'};ui.select(node);
  const notes=()=>ui.metrics().querySelectorAll('p').map(p=>p.textContent).join(' '),titles=()=>ui.metrics().querySelectorAll('details.metrics-signal').map(d=>d.querySelector('summary').textContent);
  assert.match(notes(),/Inherited metrics from provider \/ core: service · up \(grafana\)\. Signals you add here are added to the provider's in this document/);
  assert.doesNotMatch(notes(),/replaces|Unbound/);
  assert.deepEqual(titles(),['Signal up · inherited']);assert.equal(ui.control('up name').readOnly,true,'inherited names come from the provider');
  assert.equal(ui.button('Remove signal up'),null,'inherited signals are hidden, not removed');assert.equal(ui.button('Remove metrics'),null);assert.equal(ui.button('Revert all metrics to inherited'),null);
  assert.equal(ui.control('Metrics kind').options.find(o=>o.value==='service').textContent,'service (inherited)');
  ui.control('New signal name').value='rate';ui.control('New signal source').value='grafana';ui.control('New signal query').value=PROM_RATE;
  oneStep(ui,()=>ui.click('Add signal'),node);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.api,{tickets:['API-1'],telemetry:{extends:true,signals:{rate:{grafana:PROM_RATE}}}},'Add signal adds; the inherited signal stays');
  assert.deepEqual(titles(),['Signal up · inherited','Signal rate · added here']);assert.ok(ui.button('Remove signal rate'));assert.ok(ui.button('Revert all metrics to inherited'));
  oneStep(ui,()=>ui.set('up unit','req/s'),node);
  assert.deepEqual(titles(),['Signal up · inherited, changed here','Signal rate · added here']);
  oneStep(ui,()=>ui.click('Revert up to inherited'),node);assert.equal(Object.hasOwn(diagramOf(ui.raw).topologyImports[0].nodeTracking.api.telemetry.signals,'up'),false);
  const toggle=(checked)=>{const input=ui.control('up hidden for this document').querySelector('input');assert.equal(input.getAttribute('aria-label'),'up hidden for this document');input.checked=checked;input.fire('change');ui.h.flush();};
  oneStep(ui,()=>toggle(true),node);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.api.telemetry.hide,['up']);
  assert.deepEqual(titles(),['Signal rate · added here'],'a hidden signal leaves the list');
  assert.ok(ui.metrics().querySelectorAll('details.metrics-hidden').length===1,'hidden inherited signals are listed');
  oneStep(ui,()=>toggle(false),node);assert.deepEqual(titles(),['Signal up · inherited','Signal rate · added here']);
  oneStep(ui,()=>ui.click('Revert all metrics to inherited'),node);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.api,{tickets:['API-1']});
  // The imported connection: a card edit stores only the change.
  const C=ui.e.C,resolved=()=>diagramOf(C.FlowTopology.resolveSource(ui.raw,f.context));
  const edge={kind:'edge',section:0,index:resolved().edges.findIndex(e=>e.from==='shared::api' && e.to==='shared::store')};ui.select(edge);
  oneStep(ui,()=>ui.set('Card side','below'),edge);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].edgeTracking,{'api->store':{telemetry:{extends:true,card:{side:'below'}}}});
  assert.deepEqual(plain(resolved().edges.find(e=>e.from==='shared::api' && e.to==='shared::store').telemetry),{kind:'call',signals:{rate:{loki:LOKI_IN}},card:{side:'below'}});
});

test('M10 M12 Document settings edit the page telemetry block, validate window and refresh, and leave Jira untouched',()=>{
  const DOC={kind:'board'},ui=harness(board(),DOC),box=ui.settings();
  assert.equal(box.closest('details.board-section')?.getAttribute('data-board-section'),'metrics','the block sits in Status board settings → Metrics');
  const tracking=()=>ui.raw.page.tracking,jira={site:'https://acme.atlassian.net',epic:'DOOR-100'};
  for(const [label,group,key,value] of [['Grafana Prometheus UID','grafana','prometheus','prom-main'],['Grafana Loki UID','grafana','loki','loki-main'],['Grafana Tempo UID','grafana','tempo','tempo-main'],['Grafana SQL UID','grafana','sql','lake'],['Honeycomb environment','honeycomb','environment','prod'],['Honeycomb dataset','honeycomb','dataset','doorbell-prod']]){
    oneStep(ui,()=>ui.set(label,value),DOC);assert.equal(tracking().telemetry[group][key],value);assert.deepEqual(tracking().jira,jira);
  }
  for(const [label,value,message] of [['Metrics window','90x',/duration/],['Metrics window','0h',/duration/],['Metrics window','+6h',/duration/],['Metrics window','now--6h',/duration/],['Metrics refresh ms','1000',/60000/],['Metrics refresh ms','-5',/60000/]]){
    const before=ui.text;ui.set(label,value);assert.equal(ui.text,before,label+' '+value+' is refused');assert.match(ui.error(),message);ui.select(DOC);
  }
  for(const bad of [Infinity,NaN,'300000'])assert.match(api(ui.e.C).telemetryEditPage({},{op:'refreshMs',value:bad}).error || '',/60000/,'refresh refuses '+String(bad));
  for(const value of [' -6h ',' now-6h ']){
    oneStep(ui,()=>ui.set('Metrics window',value),DOC);
    assert.equal(tracking().telemetry.window,value.trim(),'editor keeps the entered alias');
    assert.equal(ui.e.C.trackingTelemetry(ui.raw.page).window,'6h','providers receive the canonical duration');
  }
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
  const DOC={kind:'board'},ui=harness(board(),DOC);ui.settings();
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
  ui.select({kind:'board'});ui.set('Metrics window','1h');
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
  assert.deepEqual(diagramOf(stamped).topologyImports[0].nodeTracking.api.telemetry,{extends:true,signals:{rate:{grafana:PROM_RATE}}},'#1266: the merge overlay is exported as authored');
  assert.ok(stamped.page.flowview.features.includes('flow.telemetry'));
  assert.ok(stamped.page.flowview.features.includes('flow.telemetry-merge'),'#1266: a merge overlay declares flow.telemetry-merge');
});

test('M15 docs describe the Workbench Metrics editor',()=>{
  const doc=fs.readFileSync(path.join(repo,'docs/live-status.md'),'utf8'),start=doc.indexOf('\n## Workbench'),end=doc.indexOf('\n## ',start+5),section=doc.slice(start,end);
  for(const phrase of ['Metrics','Add signal','Signals from','Template parameter','Remove metrics','Card side','Status board settings → Metrics','Add template','Undo','Export project','read only'])
    assert.ok(section.includes(phrase),'Workbench section mentions '+phrase);
});

test('Allow metrics preserves authored settings and bindings with one Undo, no-op and retired-form protection',()=>{
  const spec=board({kind:'call',signals:{rate:{grafana:'up'}}},{templates:TEMPLATES(),future:{keep:['unknown']},window:'24h'});
  const target={kind:'board'},ui=harness(spec,target),original=ui.text;
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
      // #1254 item 9: true is the default and is not written; false is.
      assert.deepEqual(page.tracking,value?spec.page.tracking:{...spec.page.tracking,telemetry:{...spec.page.tracking.telemetry,enabled:false}});
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

test('environment profiles are desktop controls with one Undo, defaults, inherited fields and export',()=>{
  const ui=harness(board(null,{grafana:{prometheus:'prom-$env'}}),{kind:'board'});
  const step=act=>oneStep(ui,act,{kind:'board'});
  function add(id){ui.set('New environment id',id);step(()=>ui.click('Add environment'));}
  add('qa');add('stg');add('prd');
  step(()=>ui.set('Default environment','prd'));
  step(()=>ui.set('qa Grafana Prometheus UID','qa-prom'));
  step(()=>ui.set('prd Honeycomb environment','production'));
  const t=ui.raw.page.tracking.telemetry;
  assert.equal(t.environment,'prd');assert.deepEqual(t.environments,{qa:{grafana:{prometheus:'qa-prom'}},stg:{},prd:{honeycomb:{environment:'production'}}});
  const stamped=JSON.parse(ui.e.C.FlowviewCompatibility.stampText(ui.text,ui.raw));assert.deepEqual(stamped.page.tracking.telemetry,t);
  step(()=>ui.set('qa Grafana Prometheus UID',''));assert.deepEqual(ui.raw.page.tracking.telemetry.environments.qa,{});
  step(()=>ui.click('Remove environment prd'));assert.equal(ui.raw.page.tracking.telemetry.environment,'qa');
  step(()=>ui.click('Remove environment qa'));step(()=>ui.click('Remove environment stg'));
  assert.deepEqual(ui.raw.page.tracking.telemetry,{grafana:{prometheus:'prom-$env'}});
  ui.set('New environment id','qa"');ui.click('Add environment');assert.match(ui.error(),/Environment ids/);
});

test('manual card position validates both finite axes, preserves template semantics and reset/no-op history',()=>{
  const binding={use:'kafka-topic',topic:'events',group:'workers',card:{side:'left',offset:42}},ui=harness(board(binding,{templates:TEMPLATES()}),EDGE),C=api(ui.e.C);
  for(const value of [{x:0},{x:'2',y:3},{x:NaN,y:1},{x:1,y:Infinity},[],false])assert.ok(C.telemetryEditBinding(binding,{op:'card',field:'position',value}).error);
  const before=ui.text,position={x:-217.25,y:133.5};
  const plan=C.planCarrierTelemetry(before,ui.raw,EDGE,{op:'card',field:'position',value:position});assert.ok(!plan.error,plan.error);
  oneStep(ui,()=>ui.h.session.accept(plan,{snapshot:ui.h.session.snapshot()}));
  assert.deepEqual(edgeOf(ui).telemetry,{...binding,card:{...binding.card,position}});
  assert.equal(C.planCarrierTelemetry(ui.text,ui.raw,EDGE,{op:'card',field:'position',value:position}).text,ui.text);
  oneStep(ui,()=>ui.click('Reset card to automatic'));
  assert.deepEqual(edgeOf(ui).telemetry,binding);
  assert.equal(C.planCarrierTelemetry(ui.text,ui.raw,EDGE,{op:'card',field:'position',value:null}).text,ui.text);
});

test('moving inherited cards writes only the consumer overlay and preserves the resolved binding and annotations',()=>{
  const f=topologyFixtures(),C=api(inspectorEnvironment(names).C);
  f.provider.page.tracking={telemetry:{templates:TEMPLATES()}};
  diagramOf(f.provider).edges[0].telemetry={use:'kafka-topic',topic:'delivery',group:'workers',proof:{lag:{max:17}},links:{query:'https://example.com/query'}};
  const providerBefore=JSON.stringify(f.provider);
  const resolved=diagramOf(C.FlowTopology.resolveSource(f.consumer,f.context)),index=resolved.edges.findIndex(e=>e.from==='shared::api'),target={kind:'edge',section:0,index},inherited=plain(resolved.edges[index].telemetry);
  const consumer=structuredClone(f.consumer);diagramOf(consumer).topologyImports[0].edgeTracking={'api->store':{tickets:['TEST-9'],prs:['https://github.com/acme/service/pull/9']}};
  const text=JSON.stringify(consumer,null,2),plan=C.planCarrierTelemetry(text,consumer,target,{op:'card',field:'position',value:{x:-40,y:60}},f.context);assert.ok(!plan.error,plan.error);
  const next=JSON.parse(plan.text),entry=diagramOf(next).topologyImports[0].edgeTracking['api->store'];
  // #1266: the move stores only the card position; the provider binding keeps flowing to this consumer.
  assert.deepEqual(entry,{tickets:['TEST-9'],prs:['https://github.com/acme/service/pull/9'],telemetry:{extends:true,card:{position:{x:-40,y:60}}}});
  const merged=plain(diagramOf(C.FlowTopology.resolveSource(next,f.context)).edges[index].telemetry);
  assert.deepEqual(merged,{...inherited,card:{...inherited.card,position:{x:-40,y:60}}},'the resolved binding is the inherited one with the moved card');
  assert.equal(merged.proof.lag.max,17);assert.match(merged.signals.in.grafana,/delivery/);
  assert.equal(JSON.stringify(f.provider),providerBefore);assert.equal(JSON.stringify(f.context.specs[0]),providerBefore);
});
test('signal label and query link edit with one Undo/Redo and survive ordinary signal edits and exported source',()=>{
 const ui=harness(board({kind:'call',signals:{events:{grafana:'events',unit:'events'}}}),EDGE);
 oneStep(ui,()=>ui.set('events label','Accepted events'));oneStep(ui,()=>ui.set('events query link','https://grafana.example/explore?expr=events'));
 oneStep(ui,()=>ui.set('events unit','items'));oneStep(ui,()=>ui.set('events query','updated_events'));
 assert.deepEqual(edgeOf(ui).telemetry.signals.events,{grafana:'updated_events',unit:'items',label:'Accepted events',links:{query:'https://grafana.example/explore?expr=events'}});
 const before=ui.text;ui.set('events query link','https://user:secret@example.test');assert.equal(ui.text,before);assert.match(ui.error(),/without credentials/);
 ui.set('events label','x'.repeat(121));assert.equal(ui.text,before);assert.match(ui.error(),/120/);
 const exported=ui.e.C.stampText?ui.e.C.stampText(ui.text):ui.text;assert.ok(JSON.stringify(exported).includes('Accepted events'));
});

test('signal show on card is one reversible edit and survives label, source and query edits',()=>{
 const ui=harness(board({kind:'queue',signals:{received:{grafana:'received'}}}),EDGE);ui.metrics();
 oneStep(ui,()=>{const toggle=ui.control('received show on card').querySelector('input');toggle.checked=false;toggle.fire('change');ui.h.flush();});
 assert.equal(edgeOf(ui).telemetry.signals.received.showOnCard,false);oneStep(ui,()=>ui.set('received label','Received'));oneStep(ui,()=>ui.set('received query','new_received'));
 assert.equal(edgeOf(ui).telemetry.signals.received.showOnCard,false);
 oneStep(ui,()=>{const toggle=ui.control('received show on card').querySelector('input');toggle.checked=true;toggle.fire('change');ui.h.flush();});assert.equal(edgeOf(ui).telemetry.signals.received.showOnCard,true);
});

// #1194: scope "" hides the scope line. The Workbench keeps it through other edits and can set it on purpose.
test('#1194 scope "" survives other signal edits, "hide scope" sets and clears it, and whitespace alone is refused',()=>{
 const ui=harness(board({kind:'queue',signals:{received:{grafana:'received',unit:'msgs',scope:''}}}),EDGE);ui.metrics();
 assert.equal(ui.control('received hide scope').querySelector('input').checked,true);
 oneStep(ui,()=>ui.set('received unit','msgs/h'));oneStep(ui,()=>ui.set('received label','Received'));oneStep(ui,()=>ui.set('received query','new_received'));
 oneStep(ui,()=>{const toggle=ui.control('received show on card').querySelector('input');toggle.checked=false;toggle.fire('change');ui.h.flush();});
 assert.equal(edgeOf(ui).telemetry.signals.received.scope,'','unit, label, query and show-on-card edits keep scope ""');
 oneStep(ui,()=>{const toggle=ui.control('received hide scope').querySelector('input');toggle.checked=false;toggle.fire('change');ui.h.flush();});
 assert.equal(Object.prototype.hasOwnProperty.call(edgeOf(ui).telemetry.signals.received,'scope'),false,'unchecking removes the key');
 oneStep(ui,()=>{const toggle=ui.control('received hide scope').querySelector('input');toggle.checked=true;toggle.fire('change');ui.h.flush();});
 assert.equal(edgeOf(ui).telemetry.signals.received.scope,'','checking sets scope ""');
 const C=api(ui.e.C),binding=edgeOf(ui).telemetry;
 assert.equal(C.telemetryEditBinding(binding,{op:'signal',name:'received',field:'scope',value:''},{}).value.signals.received.scope,'','the pure edit accepts ""');
 assert.match(C.telemetryEditBinding(binding,{op:'signal',name:'received',field:'scope',value:'   '},{}).error || '',/non-empty text/,'whitespace alone is refused');
});

test('#1111 loki and grafana signals get an empty result reads 0 toggle that survives other edits; checking it removes the key; other sources drop it',()=>{
 const ui=harness(board({kind:'queue',signals:{received:{loki:LOKI_IN},sent:{grafana:'sent',missingMeansZero:true},trace:{tempo:'{}'}}}),EDGE);ui.metrics();
 assert.equal(ui.row('trace empty result reads 0'),null,'no toggle where the field means nothing');
 const toggle=()=>ui.control('received empty result reads 0').querySelector('input');
 assert.equal(ui.control('sent empty result reads 0').querySelector('input').checked,true);
 oneStep(ui,()=>ui.set('sent unit','req'));assert.equal(edgeOf(ui).telemetry.signals.sent.missingMeansZero,true,'an authored true survives other edits');
 assert.equal(toggle().checked,true,'absent reads as the default');
 oneStep(ui,()=>{const t=toggle();t.checked=false;t.fire('change');ui.h.flush();});
 assert.equal(edgeOf(ui).telemetry.signals.received.missingMeansZero,false);assert.equal(toggle().checked,false);
 oneStep(ui,()=>ui.set('received unit','events'));oneStep(ui,()=>ui.set('received label','Received'));oneStep(ui,()=>ui.set('received query','sum(count_over_time({app="x"}[5m]))'));
 assert.equal(edgeOf(ui).telemetry.signals.received.missingMeansZero,false);
 oneStep(ui,()=>ui.set('received source','grafana'));assert.equal(edgeOf(ui).telemetry.signals.received.missingMeansZero,false,'kept between loki and grafana');
 oneStep(ui,()=>{const t=toggle();t.checked=true;t.fire('change');ui.h.flush();});assert.equal(Object.hasOwn(edgeOf(ui).telemetry.signals.received,'missingMeansZero'),false,'checking returns to the default without writing true');
 oneStep(ui,()=>{const t=toggle();t.checked=false;t.fire('change');ui.h.flush();});
 oneStep(ui,()=>ui.set('received source','tempo'));assert.equal(Object.hasOwn(edgeOf(ui).telemetry.signals.received,'missingMeansZero'),false,'dropped where it means nothing');
 assert.deepEqual(ui.warnings(),[]);
});

test('#1112 Inspect sets connection card title and width with one Undo each; invalid values are refused; nodes get neither row',()=>{
  const ui=harness(board({kind:'call',signals:{rate:{grafana:PROM_RATE}},card:{side:'below'}}),EDGE);ui.metrics();
  oneStep(ui,()=>ui.set('Card title','  Camera stats consumer · RabbitMQ '));oneStep(ui,()=>ui.set('Card width','360'));
  assert.deepEqual(edgeOf(ui).telemetry.card,{side:'below',title:'Camera stats consumer · RabbitMQ',width:360});
  assert.equal(ui.control('Card title').value,'Camera stats consumer · RabbitMQ');assert.equal(ui.control('Card width').value,'360');
  for(const [label,value] of [['Card title','x'.repeat(121)],['Card width','139'],['Card width','481'],['Card width','wide']]){
    const before=ui.text;ui.set(label,value);assert.equal(ui.text,before,label+' '+value+' is refused');assert.ok(ui.error(),label+' explains the refusal');ui.select(EDGE);
  }
  const C=api(ui.e.C);
  for(const bad of [NaN,Infinity,'300'])assert.match(C.telemetryEditBinding(edgeOf(ui).telemetry,{op:'card',field:'width',value:bad},{}).error || '',/140 and 480/,'card width refuses '+String(bad));
  assert.match(C.telemetryEditBinding(edgeOf(ui).telemetry,{op:'card',field:'title',value:'bell\u0007'},{}).error || '',/1–120/);
  oneStep(ui,()=>ui.set('Card title',''));oneStep(ui,()=>ui.set('Card width',''));assert.deepEqual(edgeOf(ui).telemetry.card,{side:'below'});
  const node=harness(board(),{kind:'node',section:0,id:'ingest'});node.metrics();assert.equal(node.row('Card title'),null);assert.equal(node.row('Card width'),null);
});

test('#1112 an inherited imported connection without an overlay shows the card rows in Inspect; Card width creates the consumer overlay in one Undo step',()=>{
  const f=topologyFixtures(),ui=harness(f.consumer),providerBefore=JSON.stringify(f.provider);
  ui.h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const C=ui.e.C,resolved=()=>diagramOf(C.FlowTopology.resolveSource(ui.raw,f.context));
  const edge={kind:'edge',section:0,index:resolved().edges.findIndex(e=>e.from==='shared::api' && e.to==='shared::store')};ui.select(edge);
  assert.equal(Object.hasOwn(diagramOf(ui.raw).topologyImports[0],'edgeTracking'),false,'no overlay before the edit');
  ui.metrics();for(const label of ['Card side','Card offset','Card title'])assert.ok(ui.row(label),label+' is in Inspect for the inherited card');
  assert.equal(ui.control('Card width').value,'');const before=ui.text;
  for(const field of ['title','width','position'])assert.equal(C.planCarrierTelemetry(before,ui.raw,edge,{op:'card',field,value:null},f.context).text,before,'clearing an unset inherited '+field+' creates no overlay');
  oneStep(ui,()=>ui.set('Card width','400'),edge);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].edgeTracking,{'api->store':{telemetry:{extends:true,card:{width:400}}}},'#1266: only the card change is stored');
  assert.equal(C.carrierTelemetry(resolved().edges[edge.index],{}).card.width,400);assert.equal(ui.control('Card width').value,'400');
  assert.equal(JSON.stringify(f.provider),providerBefore,'the provider spec is untouched');
  const after=ui.text;assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo removes the created overlay');
  assert.equal(ui.h.session.redo(),true);assert.equal(ui.text,after,'Redo restores the created overlay');
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].edgeTracking['api->store'].telemetry.card,{width:400});
});

// #1201 review: a Workbench signal edit keeps the authored error role.
test('#1201 editing a signal unit, query or Show on card keeps role "error"',()=>{
  const vm=require('node:vm'),{composeSources}=require('../tools/source-loader.cjs'),V={URL,TextEncoder};vm.createContext(V);
  vm.runInContext(composeSources(['canon.js','validator.js','workbench/commands/telemetry.js']),V);
  const binding={kind:'queue',signals:{dlq:{grafana:'max(dlq_depth)',unit:'msgs',role:'error'}},proof:{dlq:{max:0}}};
  for(const [field,value] of [['unit','messages'],['query','max(dlq_depth_total)'],['showOnCard',false]]){
    const out=V.telemetryEditBinding(JSON.parse(JSON.stringify(binding)),{op:'signal',name:'dlq',field,value},{});
    assert.equal(out.error,undefined,field);assert.equal(out.value.signals.dlq.role,'error',field+' keeps role');
  }
});

// #1228 test plan 2: folds use the Inspector <details> disclosure state.
test('#1228 the Metrics editor folds each signal, New signal, Links and Card; folds start closed on a new selection and an open fold survives an edit to the same carrier',()=>{
  const binding={kind:'call',signals:{rate:{grafana:PROM_RATE,unit:'req/h'},errors:{grafana:PROM_ERRORS,unit:'req/h'}},card:{side:'below',offset:0}};
  const ui=harness(board(binding,{templates:TEMPLATES()}),EDGE);
  const folds=()=>ui.metrics().querySelectorAll('details.metrics-fold');
  const fold=title=>folds().find(f=>f.querySelector('summary').textContent===title);
  const title=f=>f.querySelector('summary').textContent;
  assert.deepEqual(folds().map(title),['Signal rate','Signal errors','New signal','Links','Card']);
  for(const [label,owner] of [['rate query','Signal rate'],['errors unit','Signal errors'],['errors max','Signal errors'],['New signal name','New signal'],['Dashboard link','Links'],['Query link','Links'],['Card side','Card'],['Card width','Card']])
    assert.equal(ui.control(label).closest('details'),fold(owner),label+' is in the '+owner+' fold');
  assert.equal(ui.button('Remove signal errors').closest('details'),fold('Signal errors'));
  assert.equal(ui.button('Add signal').closest('details'),fold('New signal'));
  for(const label of ['Metrics kind','Signals from'])assert.equal(ui.control(label).closest('details'),null,label+' stays outside the folds');
  assert.equal(ui.button('Remove metrics').closest('details'),null,'Remove metrics stays outside the folds');
  assert.deepEqual(folds().map(f=>f.open),[false,false,false,false,false],'folds start closed on a new selection');
  fold('Card').open=true;fold('Signal errors').open=true;
  ui.set('Card width','300');assert.equal(edgeOf(ui).telemetry.card.width,300);
  assert.deepEqual(folds().map(f=>[title(f),f.open]),[['Signal rate',false],['Signal errors',true],['New signal',false],['Links',false],['Card',true]],'open folds stay open across the same-carrier refresh');
  ui.set('errors unit','msgs');assert.equal(fold('Signal errors').open,true);assert.equal(fold('Card').open,true);
  ui.set('errors name','failures');assert.ok(edgeOf(ui).telemetry.signals.failures);
  assert.deepEqual(folds().map(f=>[title(f),f.open]),[['Signal rate',false],['Signal failures',true],['New signal',false],['Links',false],['Card',true]],'a renamed signal keeps its fold open');
  ui.select({kind:'node',section:0,id:'ingest'});ui.select(EDGE);
  assert.deepEqual(folds().map(f=>f.open),[false,false,false,false,false],'a new selection starts every fold closed');
});

test('#1228 Status board settings → Metrics folds each template and New template (#1236: Environments is its own section); template signal folds nest inside and keep their open state',()=>{
  const page={templates:TEMPLATES(),environments:{qa:{grafana:{prometheus:'prom-qa'}}}};
  const ui=harness(board(null,page),{kind:'board'});
  const box=()=>ui.settings(),title=f=>f.querySelector('summary').textContent;
  const top=()=>box().querySelectorAll('details.metrics-fold').filter(f=>!f.parentNode.closest('details.metrics-fold'));
  const find=(list,name)=>list.find(f=>title(f)===name);
  const outer=el=>{let found=null;for(let d=el.closest('details.metrics-fold');d;d=d.parentNode && d.parentNode.closest('details.metrics-fold'))found=d;return found;};
  const section=el=>el.closest('details.board-section')?.getAttribute('data-board-section');
  assert.deepEqual(top().map(title),['Template kafka-topic','New template']);
  const template=()=>find(top(),'Template kafka-topic'),nested=()=>template().querySelectorAll('details.metrics-fold');
  assert.deepEqual(nested().map(title),['Signal in','Signal lag','New kafka-topic signal']);
  for(const label of ['qa Grafana Prometheus UID','New environment id'])assert.equal(section(ui.control(label)),'environments',label+' is in the Environments section');
  for(const [label,owner] of [['kafka-topic template kind','Template kafka-topic'],['New template name','New template']])
    assert.equal(outer(ui.control(label)),find(top(),owner),label+' is in the '+owner+' fold');
  assert.equal(ui.control('kafka-topic lag unit').closest('details'),find(nested(),'Signal lag'));
  for(const label of ['Allow metrics','Grafana Prometheus UID','Metrics window']){
    assert.equal(ui.control(label).closest('details.metrics-fold'),null,label+' stays outside the folds');assert.equal(section(ui.control(label)),'metrics');
  }
  assert.deepEqual(box().querySelectorAll('details.metrics-fold').map(f=>f.open),[false,false,false,false,false]);
  template().open=true;find(nested(),'Signal lag').open=true;
  ui.set('kafka-topic lag unit','items');assert.equal(ui.raw.page.tracking.telemetry.templates['kafka-topic'].signals.lag.unit,'items');
  assert.equal(template().open,true);assert.equal(find(nested(),'Signal lag').open,true);assert.equal(find(nested(),'Signal in').open,false);
});

// #1228 problem 1: the imported-element form returned before finishForm, so a same-selection refresh lost focus and the Inspector scroll.
test('#1228 an inherited imported connection keeps focus on Card width across the refresh that saves the consumer override',()=>{
  const f=topologyFixtures(),ui=harness(f.consumer);
  ui.h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const C=ui.e.C,resolved=()=>diagramOf(C.FlowTopology.resolveSource(ui.raw,f.context));
  const edge={kind:'edge',section:0,index:resolved().edges.findIndex(e=>e.from==='shared::api' && e.to==='shared::store')};ui.select(edge);
  const width=ui.control('Card width');
  assert.ok(width.getAttribute('data-inspector-control'),'the imported form finishes like other forms: controls carry their retention keys');
  width.focus();ui.set('Card width','400');
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].edgeTracking['api->store'].telemetry.card,{width:400});
  assert.equal(ui.e.doc.activeElement,ui.control('Card width'),'focus returns to Card width after the refresh');
  assert.equal(ui.control('Card width').value,'400');
});

/* #1255 sweep (Metrics editor).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| S2a | Renaming a page template signal renames the proof limit and maxRatioOf on every carrier and overlay entry that uses the template, in any section, in the same plan; a carrier that defines a signal of the old or new name itself keeps its limits. | template kafka-topic; edge, node, an import overlay entry and an edge in a second section use it with carrier limits; two carriers with their own `lag` / `backlog` signals | each carrier `proof` uses `backlog`; own-signal carriers unchanged; one Undo restores the exact text | limits left on the old name, ignored silently; a carrier's own limit overwritten |
| S2b | Removing a page template signal removes those carrier limits; a ratio limit on the removed signal loses maxRatioOf and its ratio max (min stays); emptied limits and proofs are dropped. A raw carrier's removed signal does the same. | same; a raw binding with a ratio | `proof` keys gone; `{min}` kept; no absolute max left behind | dangling limits; a ratio ceiling turned into an absolute ceiling |
| S17 | An imported carrier that inherits a provider binding shows the inherited kind, labelled inherited, and Add signal saves that kind. | consumer importing provider node api (kind service) | Metrics kind value `service`, option text "service (inherited)"; overlay `kind:'service'` | the default `call` replacing the provider kind |
| S19 | New signal / New template / New environment drafts and an unbound carrier's draft kind survive a re-render of the same selection, clear after a successful add and on a new selection, and stay after a refused add; flowMetricsDom.draft itself stores nothing (callers such as Log searches keep their own drafts). | unbound edge; page settings | values after re-render; after Add; after a refused Add; after another selection; the drafts map after typing in a plain draft | typed drafts lost on any refresh; a second draft layer that resurrects cleared values |
*/
const KT=()=>({use:'kafka-topic',topic:'t',group:'g',proof:{lag:{max:100},in:{maxRatioOf:'lag',max:2,min:5}}});
function sweepBoard(){
  const spec=board(KT(),{templates:TEMPLATES()}),d=diagramOf(spec);
  d.nodes.ingest.telemetry={use:'kafka-topic',topic:'t',group:'g',proof:{lag:{min:1}}};
  // Carriers that define a signal of the old or the new name themselves keep their own limits.
  d.nodes.notify.telemetry={use:'kafka-topic',topic:'t',group:'g',signals:{backlog:{grafana:'own_backlog'}},proof:{lag:{max:100},backlog:{max:5}}};
  d.edges.push({from:'notify',to:'ingest',label:'replay',telemetry:{use:'kafka-topic',topic:'t',group:'g',signals:{lag:{grafana:'own_lag'}},proof:{lag:{max:9}}}});
  d.topologyImports=[{spec:'provider',export:'core',as:'shared',edgeTracking:{'api->store':{telemetry:{use:'kafka-topic',topic:'t',group:'g',proof:{lag:{max:7}}}}}}];
  spec.page.sections.push({heading:'Second',diagram:{nodes:{x:{title:'X'},y:{title:'Y'}},rows:[['x','y']],edges:[{from:'x',to:'y',telemetry:{use:'kafka-topic',topic:'t',group:'g',proof:{lag:{max:3}}}}]}});
  return spec;
}
test('#1255 S2a renaming a template signal renames carrier and overlay limits in the same plan',()=>{
  const C=api(harness(board()).e.C),spec=sweepBoard(),text=JSON.stringify(spec,null,2);
  const plan=C.planPageTelemetry(text,JSON.parse(text),{op:'template',template:'kafka-topic',edit:{op:'signal',name:'lag',field:'name',value:'backlog'}});
  assert.equal(plan.error,undefined);const out=JSON.parse(plan.text),d=diagramOf(out);
  assert.deepEqual(Object.keys(out.page.tracking.telemetry.templates['kafka-topic'].signals),['in','backlog']);
  assert.deepEqual(d.edges[0].telemetry.proof,{backlog:{max:100},in:{maxRatioOf:'backlog',max:2,min:5}},'edge limit and ratio follow the rename');
  assert.deepEqual(d.nodes.ingest.telemetry.proof,{backlog:{min:1}},'node limit follows the rename');
  assert.deepEqual(d.topologyImports[0].edgeTracking['api->store'].telemetry.proof,{backlog:{max:7}},'overlay limit follows the rename');
  assert.deepEqual(out.page.sections[1].diagram.edges[0].telemetry.proof,{backlog:{max:3}},'a carrier in another section follows the rename');
  assert.deepEqual(d.nodes.notify.telemetry.proof,{lag:{max:100},backlog:{max:5}},'a carrier with its own backlog signal keeps both limits');
  assert.deepEqual(d.edges[1].telemetry.proof,{lag:{max:9}},'a carrier that overrides lag itself keeps its limit');
  // Through the editor: one Undo step restores everything.
  const ui=harness(spec,{kind:'board'}),before=ui.text;
  oneStep(ui,()=>ui.set('kafka-topic lag name','backlog'),{kind:'board'});
  assert.deepEqual(diagramOf(ui.raw).edges[0].telemetry.proof.backlog,{max:100});
  assert.equal(ui.h.session.undo(),true);assert.equal(ui.text,before,'one Undo restores every carrier');
});
test('#1255 S2b removing a template signal removes carrier limits and ratio references; raw removals drop ratio references too',()=>{
  const C=api(harness(board()).e.C),text=JSON.stringify(sweepBoard(),null,2);
  const plan=C.planPageTelemetry(text,JSON.parse(text),{op:'template',template:'kafka-topic',edit:{op:'removeSignal',name:'lag'}});
  assert.equal(plan.error,undefined);const d=diagramOf(JSON.parse(plan.text));
  assert.deepEqual(d.edges[0].telemetry.proof,{in:{min:5}},'the removed limit, its ratio reference and the ratio max are gone; min stays');
  assert.equal(Object.hasOwn(d.nodes.ingest.telemetry,'proof'),false,'an emptied proof is dropped');
  assert.equal(Object.hasOwn(d.topologyImports[0].edgeTracking['api->store'].telemetry,'proof'),false);
  assert.equal(Object.hasOwn(JSON.parse(plan.text).page.sections[1].diagram.edges[0].telemetry,'proof'),false,'a carrier in another section loses the limit');
  assert.deepEqual(d.edges[1].telemetry.proof,{lag:{max:9}},'a carrier that defines lag itself keeps its limit');
  const raw=C.telemetryEditBinding({kind:'call',signals:{a:{grafana:'a'},b:{grafana:'b'}},proof:{a:{maxRatioOf:'b',max:2,min:1},b:{max:1}}},{op:'removeSignal',name:'b'},{});
  assert.deepEqual(plain(raw.value.proof),{a:{min:1}},'a raw removal drops the ratio reference and its ratio max, never leaving an absolute ceiling');
  const only=C.telemetryEditBinding({kind:'call',signals:{a:{grafana:'a'},b:{grafana:'b'}},proof:{a:{maxRatioOf:'b'}}},{op:'removeSignal',name:'b'},{});
  assert.equal(Object.hasOwn(only.value,'proof'),false,'a limit left empty is dropped with its proof');
});
test('#1255 S17 an imported carrier that inherits a binding starts from the inherited kind, labelled inherited',()=>{
  const f=topologyFixtures(),ui=harness(f.consumer);
  ui.h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const node={kind:'node',section:0,id:'shared::api'};ui.select(node);ui.metrics();
  const kind=ui.control('Metrics kind');
  assert.equal(kind.value,'service','the inherited kind, not the default call');
  assert.equal(kind.options.find(o=>o.value==='service').textContent,'service (inherited)');
  ui.control('New signal name').value='local';ui.control('New signal query').value='consumer_up';
  oneStep(ui,()=>ui.click('Add signal'),node);
  // #1266: the merge overlay keeps the inherited kind by not storing one.
  assert.equal(Object.hasOwn(diagramOf(ui.raw).topologyImports[0].nodeTracking.api.telemetry,'kind'),false,'the inherited kind is not copied');
  assert.equal(diagramOf(ui.e.C.FlowTopology.resolveSource(ui.raw,f.context)).nodes['shared::api'].telemetry.kind,'service','the resolved binding keeps the inherited kind');
});
test('#1255 S19 New signal, New template and New environment drafts survive a same-selection re-render and clear after Add or a new selection',()=>{
  const ui=harness(board(),EDGE);ui.metrics();
  const type=(label,value)=>{const el=ui.control(label);el.value=value;el.fire('input');};
  ui.set('Metrics kind','queue');
  type('New signal name','in');type('New signal query',LOKI_IN);type('New signal unit','msgs');
  const source=ui.control('New signal source');source.value='loki';source.fire('change');
  ui.rerender();
  assert.deepEqual(['Metrics kind','New signal name','New signal source','New signal query','New signal unit'].map(l=>ui.control(l).value),['queue','in','loki',LOKI_IN,'msgs'],'drafts survive a re-render');
  oneStep(ui,()=>ui.click('Add signal'));
  assert.deepEqual(edgeOf(ui).telemetry,{kind:'queue',signals:{in:{loki:LOKI_IN,unit:'msgs'}}});
  assert.deepEqual(['New signal name','New signal query','New signal unit'].map(l=>ui.control(l).value),['','',''],'a successful Add clears its drafts');
  assert.equal(ui.control('New signal source').value,'grafana');
  // A refused Add keeps what was typed.
  type('New signal name','in');type('New signal query','again');const kept=ui.text;ui.click('Add signal');
  assert.equal(ui.text,kept,'a duplicate name is refused');assert.match(ui.error(),/./);ui.rerender();
  assert.deepEqual(['New signal name','New signal query'].map(l=>ui.control(l).value),['in','again'],'a refused Add keeps its drafts');
  type('New signal name','later');ui.select({kind:'node',section:0,id:'ingest'});ui.select(EDGE);
  assert.equal(ui.control('New signal name').value,'','a new selection starts with empty drafts');
  // Page settings: an edit to an existing template keeps the New template and New environment drafts.
  const page=harness(board(null,{templates:TEMPLATES()}),{kind:'board'});page.settings();
  const put=(label,value)=>{const el=page.control(label);el.value=value;el.fire('input');};
  put('New template name','orders');put('New template signal name','rate');put('New template signal query','up');put('New environment id','qa');
  page.set('kafka-topic template kind','call');assert.equal(page.raw.page.tracking.telemetry.templates['kafka-topic'].kind,'call');
  assert.deepEqual(['New template name','New template signal name','New template signal query','New environment id'].map(l=>page.control(l).value),['orders','rate','up','qa'],'page drafts survive an edit elsewhere');
});
test('#1255 S19 flowMetricsDom.draft stores nothing in the drafts map; only the Metrics editor fields keep drafts',()=>{
  const ui=harness(board()),C=ui.e.C,doc=ui.e.doc,drafts=new Map();
  const dom=C.flowMetricsDom({document:doc,drafts,controls:{row(label,control){const r=doc.createElement('label');r.appendChild(control);return r;}},listen(t,type,fn){t.addEventListener(type,fn);}});
  const parent=doc.createElement('div'),field=dom.draft(parent,'New log search label','text',null,'');
  field.value='Order ID';field.fire('input');field.fire('change');
  assert.equal(drafts.size,0,'a caller-owned draft field adds no metrics: key');
  const kept=dom.keptDraft(parent,'New signal name','text',null,'');kept.value='rate';kept.fire('input');
  assert.deepEqual([...drafts.entries()],[['metrics:New signal name','rate']]);
});

// #1266 Q3: an older replacing overlay converts in one step into the merge overlay with the same result.
test('#1266 Merge with provider converts a replacing overlay into an extends overlay with the same resolved binding, one Undo step',()=>{
  const f=topologyFixtures(),ui=harness(f.consumer);
  const replacing={kind:'service',signals:{rate:{grafana:PROM_RATE}},proof:{rate:{min:2}}};
  diagramOf(f.consumer).topologyImports[0].nodeTracking.api.telemetry=replacing;
  ui.h.session.replaceProject(JSON.stringify(f.consumer,null,2),null,{topologyContext:f.context});
  const node={kind:'node',section:0,id:'shared::api'},C=ui.e.C,resolved=()=>plain(diagramOf(C.FlowTopology.resolveSource(ui.raw,f.context)).nodes['shared::api'].telemetry);
  ui.select(node);
  assert.match(ui.metrics().querySelectorAll('p').map(p=>p.textContent).join(' '),/This document replaces it with its own binding/);
  const before=resolved();assert.deepEqual(before,replacing);
  oneStep(ui,()=>ui.click('Merge with provider'),node);
  assert.deepEqual(diagramOf(ui.raw).topologyImports[0].nodeTracking.api,{tickets:['API-1'],telemetry:{extends:true,hide:['up'],signals:{rate:{grafana:PROM_RATE}},proof:{rate:{min:2}}}},'the provider signal the old binding dropped is hidden; the rest are additions');
  assert.deepEqual(resolved(),before,'the resolved binding is unchanged');
  assert.equal(ui.button('Merge with provider'),null,'a merge overlay offers no conversion');
  assert.match(C.planCarrierTelemetry(ui.text,ui.raw,node,{op:'mergeWithProvider'},f.context).error || '',/replaces an inherited one/);
  // Round trip: any edit's stored overlay reproduces the edited merged binding.
  const inherited={kind:'call',signals:{a:{grafana:'qa',unit:'u'},b:{loki:'qb'}},proof:{a:{min:1},b:{maxRatioOf:'a',max:0.5}},links:{dashboard:'https://d.example'},card:{side:'below'}};
  for(const effective of [{kind:'queue',signals:{a:{grafana:'qa2'},c:{tempo:'qc'}},proof:{c:{max:3}},card:{side:'below',width:300}},{kind:'call',signals:{b:{grafana:'qb2'}}},{kind:'call',signals:{}}]){
    const overlay=C.telemetryDiffImported(inherited,effective);assert.equal(overlay.extends,true);
    assert.equal(JSON.stringify(plain(C.FlowTopology.mergeTelemetry(inherited,overlay))),JSON.stringify(plain(effective)),'merge(inherited, diff(inherited, effective)) reproduces '+JSON.stringify(effective));
  }
});

// #1266 review c1: always merge on imported carriers; stale hides; Merge with provider effects; all hidden is a quiet state.
test('#1266 c1 imported carriers merge before the provider has a binding, keep stale hides, name Merge with provider effects and show all-hidden quietly',()=>{
  const C=api(harness(board()).e.C),f=topologyFixtures();
  // The provider edge has no binding until later: Add signal still writes an extends overlay.
  delete diagramOf(f.provider).edges[0].telemetry;
  let text=JSON.stringify(f.consumer,null,2),raw=JSON.parse(text);
  const apply=(target,edit,context=f.context)=>{const plan=C.planCarrierTelemetry(text,raw,target,edit,context);assert.equal(plan.error,undefined,plan.error);text=plan.text;raw=JSON.parse(text);};
  const resolvedEdges=context=>diagramOf(C.FlowTopology.resolveSource(raw,context)).edges;
  const edge={kind:'edge',section:0,index:resolvedEdges(f.context).findIndex(e=>e.from==='shared::api' && e.to==='shared::store')};
  assert.equal(C.telemetryCarrierState(raw,edge,f.context).binding,null,'nothing inherited and nothing added: unbound');
  assert.match(C.planCarrierTelemetry(text,raw,edge,{op:'use',name:'svc'},f.context).error || '',/template would replace them\. To use a template's signals here, add them with New signal/,'the template refusal says why and what to do instead');
  apply(edge,{op:'addSignal',name:'local',source:'grafana',query:PROM_RATE,kind:'call'});
  assert.deepEqual(diagramOf(raw).topologyImports[0].edgeTracking['api->store'].telemetry,{extends:true,kind:'call',signals:{local:{grafana:PROM_RATE}}},'always an extends overlay on an imported carrier');
  const later=structuredClone(f.provider);diagramOf(later).edges[0].telemetry={kind:'call',signals:{rate:{loki:LOKI_IN}}};
  const laterContext={...f.context,specs:[later,f.consumer]};
  assert.deepEqual(Object.keys(resolvedEdges(laterContext)[edge.index].telemetry.signals),['rate','local'],'a provider binding added later merges with the addition');
  // A hide for a signal the provider no longer has is kept through other edits and listed as stale.
  diagramOf(raw).topologyImports[0].edgeTracking['api->store'].telemetry.hide=['gone'];text=JSON.stringify(raw,null,2);
  apply(edge,{op:'signal',name:'local',field:'unit',value:'req/h'},laterContext);
  assert.deepEqual(diagramOf(raw).topologyImports[0].edgeTracking['api->store'].telemetry.hide,['gone'],'the stale hide survives an unrelated edit');
  assert.deepEqual(plain(C.telemetryCarrierState(raw,edge,laterContext).merge.staleHidden),['gone']);
  apply(edge,{op:'hide',name:'gone',value:false},laterContext);
  assert.equal(Object.hasOwn(diagramOf(raw).topologyImports[0].edgeTracking['api->store'].telemetry,'hide'),false,'a stale hide can be removed');
  // Hiding every inherited signal is a quiet state: unbound in the resolved document, no warning.
  apply(edge,{op:'removeSignal',name:'local'},laterContext);apply(edge,{op:'hide',name:'rate',value:true},laterContext);
  const quiet=C.telemetryCarrierState(raw,edge,laterContext);
  assert.equal(quiet.merge.allHidden,true);assert.deepEqual(plain(quiet.warnings),[],'no "needs at least one valid signal" warning');
  assert.equal(Object.hasOwn(resolvedEdges(laterContext)[edge.index],'telemetry'),false,'all hidden: the carrier is unbound in this document');
  // Merge with provider names what conversion changes: a template is copied, and signal order follows the provider.
  const g=topologyFixtures();g.consumer.page.tracking={telemetry:{templates:{svcx:{kind:'service',signals:{z:{grafana:'z'},up:{grafana:'up{job="api"}'}}}}}};
  diagramOf(g.consumer).topologyImports[0].nodeTracking.api.telemetry={use:'svcx'};
  const effects=C.telemetryCarrierState(g.consumer,{kind:'node',section:0,id:'shared::api'},g.context).mergeEffects;
  assert.ok(effects.some(e=>/template "svcx" are copied/.test(e)),'the template effect is named: '+effects.join(' | '));
  assert.ok(effects.some(e=>/provider's order/.test(e)),'the order effect is named');
});
