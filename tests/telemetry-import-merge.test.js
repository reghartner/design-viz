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
