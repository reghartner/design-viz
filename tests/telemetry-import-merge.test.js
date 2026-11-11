'use strict';
/* #1266 contract: an imported carrier's metrics are the provider binding plus consumer additions
   minus consumer filters, resolved in canon-topology so viewer, proof, export and validator agree.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| X1 | An overlay `{extends:true, signals:{c}, hide:['b']}` materialises to the provider signals a plus c; b, its limit and a ratio limit based on b are gone. | provider api {a,b} with limits; consumer overlay | resolved `telemetry` deepEquals the merge | replace (provider signals lost); hide that keeps b's limits |
| X2 | Provider updates flow: a later provider change to a's query, or a new provider signal, shows in the consumer unless hidden or overridden. | same overlay; provider edited | resolved a.query is the new provider query; new provider signal d is present | a consumer copy of the provider binding |
| X3 | A field override stores only that field: `signals:{a:{unit}}` keeps the provider query (and its later changes); `{loki, grafana:null}` switches source; proof/links/card patch per field, null deletes a field. | provider edge with card/links/proof | merged values | whole-entry replace; leftover source keys |
| X4 | Old overlays without `extends` keep the replace meaning. | T12 fixture overlay | resolved telemetry equals the overlay | changing the meaning of existing documents |
| X5 | Nested imports chain: provider → middle `extends` overlay → consumer `extends` overlay. | three specs | consumer sees provider + middle additions − consumer hides | merge applied only one level |
| X7 | The merge is a generic FlowTopology.mergeOverlay(base, overlay, rules) (replace / fields / entries, hide and drop rules) that other imported kinds can reuse; mergeTelemetry is the metrics rule set on it. | plain objects | merged values; base untouched | metrics-only merge code that other kinds would have to copy |
| X8 | A signal patch that names a source replaces the inherited source (a later provider switch, or a provider signal of the same name, never yields two sources); hiding every signal leaves the carrier unbound; nested provider drops are still reported under a merge overlay. | provider switches a to loki; provider adds c; nested provider with an unexpandable use | one source each; no telemetry; drop listed | 'use exactly one source' drops; an empty binding warning; silenced provider drops |
| X11 | (#1345, Chuck 2026-11-11) Telemetry never asks for a live-status panel: a canon page with signals and telemetry datasource settings, an importer with imported signals, and a page with local signals give no "no live-status panel declared"; tickets (local or import-local) and ticket tracking still do; telemetry still keeps a panel from "the panel will be empty". | provider, consumer, local and ticket pages without and with a panel | the panel warnings exactly | warning a canon page so its build needs --allow-warnings |
| X12 | (#1345) A consumer signal patch that names the inherited source with an object query and leaves out part of it warns at the overlay, naming the signal, the carrier and what is left out: Honeycomb calculations, filters (all or some), breakdowns; CloudWatch dimensions; CloudWatch Logs logGroups. | provider node, edge and store with Honeycomb, CloudWatch and CloudWatch Logs signals | warnings exactly | silently broken signals |
| X13 | (#1345) A patch that keeps all of the provider's query (a restatement), a string query, or a source switch is a note, not a warning; a field patch and a local binding give nothing. | same provider | notes exactly; no warnings | notes that fail builds, or findings on plain field patches |
| X14 | (#1345) Nested and twice-imported carriers: each overlay's findings sit at its own document and import; a middle diagram's finding is its own, not its importer's. | provider → middle → consumer; one provider imported twice | warnings and notes per document | findings at the wrong import or leaking across documents |
| X6 | Validator: a merge overlay produces no telemetry warnings; a malformed `hide` warns at its overlay path. Compatibility declares `flow.telemetry-merge` only for merge overlays. | consumer docs | warnings; features | warnings on valid merges; silent malformed filters; older runtimes treating merges as replaces |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js']),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const diagramOf=s=>s.page.sections[0].diagram;
const PROVIDER_API=()=>({kind:'service',signals:{a:{grafana:'qa',unit:'req'},b:{grafana:'qb',unit:'err'},r:{grafana:'qr'}},proof:{a:{min:1},b:{max:5},r:{maxRatioOf:'b',max:0.1,min:2}},links:{dashboard:'https://p.example/d'}});
const PROVIDER_EDGE=()=>({kind:'call',signals:{rate:{grafana:'rate_q',unit:'req/h'},errors:{grafana:'err_q'}},proof:{rate:{min:10},errors:{maxRatioOf:'rate',max:0.01}},
  links:{dashboard:'https://p.example/d',query:'https://p.example/q'},card:{side:'below',width:300}});
function fixtures(nodeOverlay,edgeOverlay,providerApi=PROVIDER_API()){
  const provider=spec('provider',{nodes:{api:{title:'API',telemetry:providerApi},store:{title:'Store'}},rows:[['api','store']],
    edges:[{from:'api',to:'store',label:'Persist',telemetry:PROVIDER_EDGE()}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const imp={spec:'provider',export:'core',as:'shared'};
  if(nodeOverlay)imp.nodeTracking={api:{telemetry:nodeOverlay}};
  if(edgeOverlay)imp.edgeTracking={'api->store':{telemetry:edgeOverlay}};
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[],panels:[{id:'status',type:'live-status'}],topologyImports:[imp]});
  return {provider,consumer,context:{version:1,id:'consumer',specs:[provider,consumer]}};
}
const resolve=f=>diagramOf(C.FlowTopology.resolveSource(f.consumer,f.context));
const nodeTelemetry=f=>plain(resolve(f).nodes['shared::api'].telemetry);
const edgeTelemetry=f=>plain(resolve(f).edges.find(e=>e.from==='shared::api' && e.to==='shared::store').telemetry);

test('#1266 X1 an extends overlay adds signals and hides inherited ones with their limits',()=>{
  const f=fixtures({extends:true,signals:{c:{loki:'qc',unit:'msgs'}},proof:{c:{min:3}},hide:['b']});
  assert.deepEqual(nodeTelemetry(f),{kind:'service',signals:{a:{grafana:'qa',unit:'req'},r:{grafana:'qr'},c:{loki:'qc',unit:'msgs'}},
    proof:{a:{min:1},r:{min:2},c:{min:3}},links:{dashboard:'https://p.example/d'}},'provider a and r plus local c; b, its limit and the ratio max based on b are gone');
  assert.deepEqual(plain(C.carrierTelemetry(resolve(f).nodes['shared::api'],{})).signals.c.source,'loki','the merged binding parses');
});

test('#1266 X2 provider changes still reach the consumer unless hidden or overridden',()=>{
  const overlay={extends:true,signals:{c:{loki:'qc'}},hide:['b']},changed=PROVIDER_API();
  changed.signals.a.grafana='qa_v2';changed.signals.b.grafana='qb_v2';changed.signals.d={grafana:'qd'};
  const t=nodeTelemetry(fixtures(overlay,null,changed));
  assert.equal(t.signals?.a?.grafana,'qa_v2','a provider query change shows in the consumer');
  assert.deepEqual(t.signals?.d,{grafana:'qd'},'a new provider signal shows in the consumer');
  assert.equal(Object.hasOwn(t.signals || {},'b'),false,'a hidden signal stays hidden after a provider change');
});

test('#1266 X3 field overrides store only the change; null deletes a field; card, links and proof patch per field',()=>{
  const unit=fixtures({extends:true,signals:{a:{unit:'msgs'}}});
  assert.deepEqual(nodeTelemetry(unit).signals.a,{grafana:'qa',unit:'msgs'},'an override of a.unit keeps the provider query');
  const later=PROVIDER_API();later.signals.a.grafana='qa_v3';
  assert.deepEqual(nodeTelemetry(fixtures({extends:true,signals:{a:{unit:'msgs'}}},null,later)).signals.a,{grafana:'qa_v3',unit:'msgs'},'a later provider query change still flows past a unit override');
  assert.deepEqual(nodeTelemetry(fixtures({extends:true,signals:{a:{loki:'la',grafana:null}}})).signals.a,{unit:'req',loki:'la'},'a source switch removes the provider source key');
  assert.deepEqual(nodeTelemetry(fixtures({extends:true,proof:{a:{max:9},b:{max:null}}})).proof,{a:{min:1,max:9},r:{maxRatioOf:'b',max:0.1,min:2}},'proof patches per field; an emptied limit is dropped');
  const edge=edgeTelemetry(fixtures(null,{extends:true,card:{width:420},links:{query:null},kind:'queue'}));
  assert.deepEqual(edge,{...PROVIDER_EDGE(),kind:'queue',card:{side:'below',width:420},links:{dashboard:'https://p.example/d'}},'kind replaces; card and links patch per field');
});

test('#1266 X4 an overlay without extends keeps the replace meaning',()=>{
  const replace={kind:'call',signals:{local:{grafana:'only_local'}}};
  assert.deepEqual(nodeTelemetry(fixtures(replace)),replace,'old documents keep their meaning');
  assert.deepEqual(nodeTelemetry(fixtures(null)),PROVIDER_API(),'no overlay inherits the provider binding');
});

test('#1266 X5 nested imports chain the merges',()=>{
  const f=fixtures(null,null);
  const middle=spec('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'inner',nodeTracking:{api:{telemetry:{extends:true,signals:{m:{grafana:'qm'}}}}}}],
    topologyExports:{nested:{nodes:['inner::api','inner::store'],edges:['inner::api->inner::store']}}});
  const consumer=spec('consumer',{nodes:{},rows:[],panels:[{id:'status',type:'live-status'}],
    topologyImports:[{spec:'middle',export:'nested',as:'outer',nodeTracking:{'inner::api':{telemetry:{extends:true,hide:['a']}}}}]});
  const d=diagramOf(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[f.provider,middle,consumer]}));
  assert.deepEqual(Object.keys(d.nodes['outer::inner::api'].telemetry?.signals || {}).sort(),['b','m','r'],'provider b and r, middle m; the consumer hides a');
});

test('#1266 X6 the validator accepts merge overlays and warns on malformed filters; compatibility declares flow.telemetry-merge',()=>{
  const ok=fixtures({extends:true,signals:{c:{loki:'qc'}},hide:['b'],proof:{a:{max:9}}},{extends:true,card:{width:420}});
  const telemetryWarnings=doc=>plain(C.validate(C.normalize(doc)).warnings.filter(w=>/telemetry/.test(w)));
  assert.deepEqual(telemetryWarnings(ok.consumer),[],'a valid merge overlay has no telemetry warnings');
  assert.deepEqual(telemetryWarnings(C.FlowTopology.resolveSource(ok.consumer,ok.context)),[],'nor does the resolved document');
  const bad=fixtures({extends:true,hide:'b'});
  assert.ok(telemetryWarnings(bad.consumer).some(w=>/topologyImports\[0\]\.nodeTracking\.api\.telemetry\.hide/.test(w)),'a malformed hide warns at its overlay path: '+telemetryWarnings(bad.consumer).join(' | '));
  const features=doc=>C.FlowviewCompatibility.detect(doc);
  assert.ok(features(ok.consumer).includes('flow.telemetry-merge'),'merge overlays declare flow.telemetry-merge');
  assert.ok(!features(fixtures({kind:'call',signals:{x:{grafana:'x'}}}).consumer).includes('flow.telemetry-merge'),'replace overlays do not');
});

// #1266 (Chuck: "for imported you should be able to hide or add anything"): the merge is a generic helper with metrics rules on top.
test('#1266 X7 FlowTopology.mergeOverlay is generic: replace, field and entry patches, hide and drop rules; metrics use it',()=>{
  const rules={hide:'refs',fields:{title:'replace',style:'fields',refs:'entries'}};
  const base={title:'Provider',style:{tint:'blue',shape:'round'},refs:{a:{path:'a.js',line:1},b:{path:'b.js'}},other:1};
  const out=plain(C.FlowTopology.mergeOverlay(base,{title:'Mine',style:{shape:null,size:'l'},refs:{a:{line:2},c:{path:'c.js'}},hide:['b']},rules));
  assert.deepEqual(out,{title:'Mine',style:{tint:'blue',size:'l'},refs:{a:{path:'a.js',line:2},c:{path:'c.js'}},other:1});
  assert.deepEqual(base.refs.a,{path:'a.js',line:1},'the inherited value is not modified');
  let dropped=null;const custom=plain(C.FlowTopology.mergeOverlay(base,{refs:{a:null}},{fields:{refs:'entries'},drop:(o,field,key)=>{dropped=field+':'+key;delete o[field][key];}}));
  assert.equal(dropped,'refs:a','a null entry goes through the kind\'s drop rule');assert.deepEqual(Object.keys(custom.refs),['b']);
  const t=plain(C.FlowTopology.mergeTelemetry(PROVIDER_API(),{extends:true,hide:['b']}));
  assert.deepEqual(t.proof,{a:{min:1},r:{min:2}},'mergeTelemetry is the metrics rule set on mergeOverlay');
});

test('#1266 X8 one source per merged signal, all hidden unbinds quietly, nested drops survive a merge overlay',()=>{
  const switched=PROVIDER_API();switched.signals.a={loki:'la_provider',unit:'req'};switched.signals.c={grafana:'provider_c'};
  const t=nodeTelemetry(fixtures({extends:true,signals:{a:{grafana:'mine'},c:{loki:'qc'}}},null,switched));
  assert.deepEqual(t.signals.a,{grafana:'mine',unit:'req'},'the consumer source replaces the provider\'s switched source');
  assert.deepEqual(t.signals.c,{loki:'qc'},'a local signal keeps its source when the provider adds one of the same name');
  assert.equal(plain(C.carrierTelemetry(resolve(fixtures({extends:true,signals:{a:{grafana:'mine'}}},null,switched)).nodes['shared::api'],{})).signals.a.source,'grafana','the merged signal parses');
  const hidden=resolve(fixtures({extends:true,hide:['a','b','r']})).nodes['shared::api'];
  assert.equal(Object.hasOwn(hidden,'telemetry'),false,'hiding every signal leaves the carrier unbound in this document');
  const f=fixtures(null,null);diagramOf(f.provider).nodes.api.telemetry={use:'missing'};
  const middle=spec('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::api','inner::store'],edges:['inner::api->inner::store']}}});
  const consumer=spec('consumer',{nodes:{},rows:[],panels:[{id:'status',type:'live-status'}],
    topologyImports:[{spec:'middle',export:'nested',as:'outer',nodeTracking:{'inner::api':{telemetry:{extends:true,signals:{m:{grafana:'qm'}}}}}}]});
  const d=diagramOf(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[f.provider,middle,consumer]}));
  assert.ok(C.FlowTopology.telemetryDrops(d).some(drop=>drop.id==='outer::inner::api'),'a nested provider drop is still reported under a merge overlay');
});

// #1266 review c1 (9): added signals in a merge overlay get the full signal checks.
test('#1266 X9 merge overlays validate added signals and orphan limits; field changes get field-name checks',()=>{
  const warningsFor=overlay=>{const f=fixtures(overlay);return plain(C.validate(C.normalize(f.consumer)).warnings).filter(w=>/nodeTracking\.api\.telemetry/.test(w));};
  assert.ok(warningsFor({extends:true,signals:{c:{loki:''}}}).some(w=>/telemetry\.signals\.c/.test(w)),'an added signal with an empty query warns at its overlay path');
  assert.ok(warningsFor({extends:true,signals:{c:{grafana:'x',bogus:1}}}).some(w=>/telemetry\.signals\.c\.bogus/.test(w)),'an added signal with an unknown field warns');
  assert.ok(warningsFor({extends:true,signals:{a:{colour:'red'}}}).some(w=>/telemetry\.signals\.a\.colour/.test(w)),'a field change with an unknown field warns');
  assert.deepEqual(warningsFor({extends:true,signals:{a:{unit:'msgs'},c:{loki:'qc'}},proof:{a:{max:9}}}),[],'valid additions and changes are quiet');
  // With the provider's names known (the Workbench and resolved validation), a new name needs a source and a limit needs a signal.
  const seen=[];C.telemetryMergeOverlayWarnings({extends:true,signals:{d:{unit:'x'}},proof:{q:{max:1},a:{max:2}}},(path,message)=>seen.push(path+': '+message),['a','b']);
  assert.ok(seen.some(w=>/^\.signals\.d/.test(w)),'a new signal without a source warns: '+seen.join(' | '));
  assert.ok(seen.some(w=>/^\.proof\.q: names no signal/.test(w)),'a limit for no signal warns');
  assert.ok(!seen.some(w=>/^\.proof\.a/.test(w)),'a limit on an inherited signal is fine');
  const resolved=fixtures({extends:true,signals:{d:{unit:'x'}}});
  assert.ok(plain(C.validate(C.normalize(C.FlowTopology.resolveSource(resolved.consumer,resolved.context))).warnings).some(w=>/nodes\.shared::api\.telemetry\.signals\.d/.test(w)),'resolved validation reports the incomplete added signal on the carrier');
});

// #1266 review (delta): an overlay stores a kind only when it differs from the provider's. If the provider later
// removes its whole binding, additions without a stored kind are reported, not silently dropped.
test('#1266 X10 a provider that removes its binding leaves additions without a kind reported by the validator',()=>{
  const f=fixtures({extends:true,signals:{c:{loki:'qc'}}});delete diagramOf(f.provider).nodes.api.telemetry;
  const t=nodeTelemetry(f);assert.deepEqual(t,{signals:{c:{loki:'qc'}}},'the additions are kept in the resolved document');
  const seen=[];assert.equal(C.carrierTelemetry(resolve(f).nodes['shared::api'],{},(path,message)=>seen.push(path+': '+message)),null);
  assert.ok(seen.some(w=>/^\.kind: /.test(w)),'the missing kind is reported: '+seen.join(' | '));
  const kept=fixtures({extends:true,kind:'service',signals:{c:{loki:'qc'}}});delete diagramOf(kept.provider).nodes.api.telemetry;
  assert.deepEqual(nodeTelemetry(kept),{kind:'service',signals:{c:{loki:'qc'}}},'a stored kind keeps them a valid binding');
});

/* #1345 fixtures: a provider whose node, edge and second node carry structured queries. */
const HC=()=>({dataset:'orders',calculations:[{op:'COUNT'}],filters:[{column:'service.name',op:'=',value:'api'},{column:'route',op:'=',value:'/x'}],breakdowns:['status']});
const CW=()=>({namespace:'AWS/SNS',metric:'NumberOfMessagesPublished',region:'us-east-1',accountId:'123456789012',dimensions:{TopicName:'orders',Region:'us-east-1'},statistic:'Sum'});
const CWL=()=>({logGroups:['g1','g2'],query:'filter level = "error" | stats count() as n',region:'us-east-1',valueField:'n'});
function structured(id='provider',page={}){
  return spec(id,{nodes:{api:{title:'API',telemetry:{kind:'service',signals:{received:{honeycomb:HC(),unit:'req'},errors:{loki:'sum(count_over_time({app="api"}[5m]))'}}}},
      store:{title:'Store',telemetry:{kind:'service',signals:{failures:{cloudwatchLogs:CWL()}}}}},rows:[['api','store']],
    edges:[{from:'api',to:'store',label:'Persist',telemetry:{kind:'call',signals:{published:{cloudwatch:CW()}}}}],
    topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}},page);
}
const consumerOf=(imports,extra={})=>spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[],panels:[{id:'status',type:'live-status'}],topologyImports:imports,...extra});
const findings=(doc,context)=>{const r=C.validate(C.normalize(C.FlowTopology.resolveSource(doc,context)));return {warnings:plain(r.warnings).filter(w=>/telemetry/.test(w)),notes:plain(r.notes || []).filter(w=>/telemetry/.test(w))};};
const PANEL='page.tracking: no live-status panel declared — add {"type": "live-status"} to a section\'s panels so viewers see the rollup';
const panelWarnings=doc=>plain(C.validate(C.normalize(doc)).warnings).filter(w=>/live-status panel declared|the panel will be empty/.test(w));

test('#1345 X11 telemetry never asks for a live-status panel; tickets still do',()=>{
  const canon=structured('provider',{tracking:{telemetry:{window:'24h',honeycomb:{environment:'prod',dataset:'orders'}}}});
  assert.deepEqual(panelWarnings(canon),[],'a canon page with signals and telemetry settings, no panel');
  const importer=spec('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'shared'}]});
  const context={version:1,id:'consumer',specs:[canon,importer]};
  assert.deepEqual(panelWarnings(importer),[],'an importer without a panel, unresolved');
  assert.deepEqual(panelWarnings(C.FlowTopology.resolveSource(importer,context)),[],'and resolved, with the imported signals on its carriers');
  const local=spec('local',{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{up:{grafana:'up'}}}}},rows:[['a']]});
  assert.deepEqual(panelWarnings(local),[],'a page with local signals, no panel');
  const ticketed=spec('ticketed',{nodes:{a:{title:'A',tickets:['AA-1'],telemetry:{kind:'service',signals:{up:{grafana:'up'}}}}},rows:[['a']]});
  assert.deepEqual(panelWarnings(ticketed),[PANEL],'tickets still ask for the panel');
  const tracked=spec('tracked',{nodes:{a:{title:'A'}},rows:[['a']]},{tracking:{jira:{site:'https://acme.atlassian.net'},telemetry:{window:'24h'}}});
  assert.deepEqual(panelWarnings(tracked),[PANEL],'ticket tracking settings still ask for the panel');
  const importTickets=spec('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{tickets:['AA-2']}}}]});
  assert.deepEqual(panelWarnings(importTickets),[PANEL],'import-local tickets still ask for it');
  const withPanel=structured('provider');diagramOf(withPanel).panels=[{id:'status',type:'live-status'}];
  assert.deepEqual(panelWarnings(withPanel),[],'signals keep a panel from reading empty');
  const settingsOnly=spec('settings',{nodes:{a:{title:'A'}},rows:[['a']],panels:[{id:'status',type:'live-status'}]},{tracking:{telemetry:{window:'24h'}}});
  assert.deepEqual(panelWarnings(settingsOnly),[],'a tracking block still keeps a panel from reading empty, as before');
});

test('#1345 X12 a source patch that leaves out part of the provider query warns, naming the signal, the carrier and the part',()=>{
  const provider=structured(),patch=(node,edge)=>{const imp={spec:'provider',export:'core',as:'shared'};if(node)imp.nodeTracking=node;if(edge)imp.edgeTracking=edge;return imp;};
  const run=imp=>{const consumer=consumerOf([imp]);return findings(consumer,{version:1,id:'consumer',specs:[provider,consumer]});};
  const at='sections[0].diagram.topologyImports[0]';
  let f=run(patch({api:{telemetry:{extends:true,signals:{received:{honeycomb:{dataset:'orders',filters:[{column:'feature',op:'=',value:'fc'}]}}}}}}));
  assert.deepEqual(f.warnings,[at+'.nodeTracking.api.telemetry.signals.received.honeycomb: signal received on node api: this Honeycomb patch replaces the provider\'s whole query and leaves out calculations, filters and breakdowns, so the signal no longer reads what the provider defined; to replace the query, write all of it']);
  assert.deepEqual(f.notes,[]);
  const some=HC();some.filters=[some.filters[0],{column:'feature',op:'=',value:'fc'}];
  f=run(patch({api:{telemetry:{extends:true,signals:{received:{honeycomb:some}}}}}));
  assert.deepEqual(f.warnings,[at+'.nodeTracking.api.telemetry.signals.received.honeycomb: signal received on node api: this Honeycomb patch replaces the provider\'s whole query and leaves out 1 of its filters, so the signal no longer reads what the provider defined; to replace the query, write all of it']);
  const dims=CW();delete dims.dimensions.Region;
  const logs=CWL();logs.logGroups=['g1'];
  f=run(patch({store:{telemetry:{extends:true,signals:{failures:{cloudwatchLogs:logs}}}}},{'api->store':{telemetry:{extends:true,signals:{published:{cloudwatch:dims}}}}}));
  assert.deepEqual(f.warnings,[
    at+'.nodeTracking.store.telemetry.signals.failures.cloudwatchLogs: signal failures on node store: this CloudWatch Logs patch replaces the provider\'s whole query and leaves out 1 of its logGroups, so the signal no longer reads what the provider defined; to replace the query, write all of it',
    at+'.edgeTracking.api->store.telemetry.signals.published.cloudwatch: signal published on connection api->store: this CloudWatch patch replaces the provider\'s whole query and leaves out dimension Region, so the signal no longer reads what the provider defined; to replace the query, write all of it']);
});

test('#1345 X13 a restatement, a string query or a source switch is a note; field patches and local bindings give nothing',()=>{
  const provider=structured(),at='sections[0].diagram.topologyImports[0].nodeTracking.api.telemetry.signals';
  const more=HC();more.filters.push({column:'feature',op:'=',value:'fc'});
  const consumer=consumerOf([{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{telemetry:{extends:true,signals:{received:{honeycomb:more},errors:{grafana:'sum(rate(errors[5m]))',loki:null}}}}}}],
    {nodes:{local:{title:'Local',telemetry:{kind:'service',signals:{up:{grafana:'up'}}}}}});
  let f=findings(consumer,{version:1,id:'consumer',specs:[provider,consumer]});
  assert.deepEqual(f.warnings,[]);
  assert.deepEqual(f.notes,[
    at+'.received.honeycomb: signal received on node api: this Honeycomb patch replaces the provider\'s whole query; later provider changes to it no longer reach this board',
    at+'.errors.grafana: signal errors on node api: this switches its source from Loki to Grafana; later provider changes to its query no longer reach this board']);
  const text=consumerOf([{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{telemetry:{extends:true,signals:{errors:{loki:'sum(count_over_time({app="api",feature="fc"}[5m]))'},received:{unit:'events'}}}}}}]);
  f=findings(text,{version:1,id:'consumer',specs:[provider,text]});
  assert.deepEqual(f,{warnings:[],notes:[at+'.errors.loki: signal errors on node api: this Loki patch replaces the provider\'s whole query; later provider changes to it no longer reach this board']},'a string query is a note; a unit patch gives nothing');
  const replace=consumerOf([{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{telemetry:{kind:'service',signals:{x:{grafana:'x'}}}}}}]);
  assert.deepEqual(findings(replace,{version:1,id:'consumer',specs:[provider,replace]}),{warnings:[],notes:[]},'a replacing binding (no extends) keeps its old meaning and gives nothing');
  const build=C.validate(C.normalize(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
  assert.deepEqual(plain(build.warnings),[],'notes never count as warnings');
});

test('#1345 X14 nested and twice-imported carriers: findings stay with their own document and import',()=>{
  const provider=structured();
  const drop={extends:true,signals:{received:{honeycomb:{dataset:'orders'}}}};
  const middle=spec('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'inner',nodeTracking:{api:{telemetry:drop}}}],
    topologyExports:{nested:{nodes:['inner::api','inner::store'],edges:['inner::api->inner::store']}}});
  const consumer=consumerOf([{spec:'middle',export:'nested',as:'outer',edgeTracking:{'inner::api->inner::store':{telemetry:{extends:true,signals:{published:{cloudwatch:{...CW(),dimensions:{}}}}}}}}]);
  const context={version:1,id:'consumer',specs:[provider,middle,consumer]};
  assert.deepEqual(findings(middle,{version:1,id:'middle',specs:[provider,middle]}).warnings,
    ['sections[0].diagram.topologyImports[0].nodeTracking.api.telemetry.signals.received.honeycomb: signal received on node api: this Honeycomb patch replaces the provider\'s whole query and leaves out calculations, filters and breakdowns, so the signal no longer reads what the provider defined; to replace the query, write all of it'],'the middle diagram reports its own patch');
  assert.deepEqual(findings(consumer,context).warnings,
    ['sections[0].diagram.topologyImports[0].edgeTracking.inner::api->inner::store.telemetry.signals.published.cloudwatch: signal published on connection inner::api->inner::store: this CloudWatch patch replaces the provider\'s whole query and leaves out dimensions TopicName, Region, so the signal no longer reads what the provider defined; to replace the query, write all of it'],
    'the consumer reports only its own patch on the nested carrier');
  // The consumer patches the nested carrier the middle already patched: compared with what it inherits (the middle's result).
  const again=consumerOf([{spec:'middle',export:'nested',as:'outer',nodeTracking:{'inner::api':{telemetry:{extends:true,signals:{received:{honeycomb:{dataset:'orders',filters:[]}}}}}}}]);
  assert.deepEqual(findings(again,{version:1,id:'consumer',specs:[provider,middle,again]}),{warnings:[],notes:['sections[0].diagram.topologyImports[0].nodeTracking.inner::api.telemetry.signals.received.honeycomb: signal received on node inner::api: this Honeycomb patch replaces the provider\'s whole query; later provider changes to it no longer reach this board']},
    'against the middle\'s query nothing is left out');
  const twice=consumerOf([
    {spec:'provider',export:'core',as:'fc',nodeTracking:{api:{telemetry:{extends:true,signals:{received:{honeycomb:{...HC(),calculations:undefined}}}}}}},
    {spec:'provider',export:'core',as:'et',position:{x:40,y:400},nodeTracking:{api:{telemetry:{extends:true,signals:{received:{honeycomb:HC()}}}}}}]);
  const both=JSON.parse(JSON.stringify(twice));
  assert.deepEqual(findings(both,{version:1,id:'consumer',specs:[provider,both]}),{
    warnings:['sections[0].diagram.topologyImports[0].nodeTracking.api.telemetry.signals.received.honeycomb: signal received on node api: this Honeycomb patch replaces the provider\'s whole query and leaves out calculations, so the signal no longer reads what the provider defined; to replace the query, write all of it'],
    notes:['sections[0].diagram.topologyImports[1].nodeTracking.api.telemetry.signals.received.honeycomb: signal received on node api: this Honeycomb patch replaces the provider\'s whole query; later provider changes to it no longer reach this board']});
});
