'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint,readSource}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('standalone').body,C);
const plain=x=>JSON.parse(JSON.stringify(x));
const raw={kind:'service',signals:{matched:{cloudwatch:{namespace:'AWS/IoT',metric:'TopicMatch',statistic:'Sum',region:'us-east-1',accountId:'111111111111',dimensions:{RuleName:'a_very_long_rule_name'}},label:'Matched events',unit:'events',links:{query:'https://metrics.example/query?env=$env'}},accepted:{honeycomb:{calculations:[{op:'COUNT'}]},unit:'events'},other:{grafana:'counter',label:'<b>plain text</b>'},missing:{sql:'select 1'},trace:{tempo:'{}'}},links:{query:'https://carrier.example/ambiguous'}};
test('labels and per-signal URLs validate, survive resolution, and display all numeric signals without changing proof',()=>{
 const warnings=[],b=C.carrierTelemetry({telemetry:raw},{},(a,m)=>warnings.push(a+m),{environment:'stg'});assert.deepEqual(warnings,[]);assert.equal(b.signals.matched.label,'Matched events');assert.equal(b.signals.matched.links.query,'https://metrics.example/query?env=stg');
 const map={signals:{matched:{value:0},accepted:{value:8,links:{query:'https://ui.honeycomb.io/team/result/q'}},other:{value:17,links:{query:'https://grafana.example/explore?q=other'}},trace:{value:999}}};
 const rows=plain(C.telemetryMetricRows(b,map,{missing:true}));assert.deepEqual(rows.map(r=>r.name),['matched','accepted','other','missing']);assert.deepEqual(rows.map(r=>r.label),['Matched events','accepted','<b>plain text</b>','missing']);assert.deepEqual(rows.map(r=>r.text),['0 events','8 events','17','Loading…']);assert.deepEqual(rows.map(r=>r.url),['https://metrics.example/query?env=stg','https://ui.honeycomb.io/team/result/q','https://grafana.example/explore?q=other',null]);
 assert.equal(C.telemetryCardScope(b.signals.matched),'This rule');assert.match(rows[0].scope,/a_very_long_rule_name.*111111111111/);
 for(const id of ['local','direct::api','outer::inner::api','loaded::api']){const binding={...b,id,title:id,tickets:['AA-1']},verdicts=C.proofVerdicts({carriers:[binding],jiraMap:{'AA-1':{state:'done'}},telemetryMap:{[id]:map}}),row=C.liveStatusProofPresentation({carriers:[binding],map:{[id]:map},verdicts},'24h').rows[0];assert.equal(row.kpis.length,4,id);assert.equal(row.label,'DONE · traffic not measured');assert.equal(verdicts.carriers[id].verdict,'done-traffic-unmeasured');}
});
test('unsafe query links and invalid labels are dropped, plain text is never HTML, valid zero and sibling links survive normalization',()=>{
 for(const url of ['javascript:alert(1)','//evil.test','https://user:secret@example.test/q','https://example.test\\@evil.test/q','https://mcp.honeycomb.io/query_results/SECRET','https://api.honeycomb.io/trace_results/TOKEN']){
  const warnings=[],b=C.carrierTelemetry({telemetry:{kind:'service',signals:{n:{grafana:'up',links:{query:url}}}}},{},(a,m)=>warnings.push(a+m));assert.equal(b.signals.n.links.query,undefined,url);assert.ok(warnings.length);
  const sample=C.telemetrySample({signals:{n:{value:0,links:{query:url}},peer:{value:2,links:{query:'https://valid.test/q'}}}});assert.equal(sample.signals.n.value,0);assert.equal(sample.signals.n.links,undefined);assert.equal(sample.signals.peer.links.query,'https://valid.test/q');
 }
 for(const label of ['', 'x'.repeat(121),'line\nbreak',42]){const warnings=[],b=C.carrierTelemetry({telemetry:{kind:'service',signals:{n:{grafana:'up',label}}}},{},(a,m)=>warnings.push(a+m));assert.equal(b.signals.n.label,undefined);assert.ok(warnings.length);}
 const merged=C.telemetryProviderMerge([{id:{signals:{a:{value:1,links:{query:'https://a.test/q'}}}}},{id:{signals:{b:{value:0,links:{query:'https://b.test/q'}}}}}]);assert.equal(merged.id.signals.a.links.query,'https://a.test/q');assert.equal(merged.id.signals.b.links.query,'https://b.test/q');
});
test('authored URL wins, fallback is restricted to one signal, preview cannot invent provider URLs, whole-account scope stays explicit',()=>{
 const binding={signals:{n:{source:'grafana',query:'up',links:{query:'https://authored.test/q'}}},links:{query:'https://carrier.test/q'}},sample={signals:{n:{value:3,links:{query:'https://provider.test/q'}}},links:{query:'https://legacy.test/q'}};
 assert.equal(C.telemetryMetricUrl(binding,sample,'n'),'https://authored.test/q');delete binding.signals.n.links;assert.equal(C.telemetryMetricUrl(binding,sample,'n'),'https://provider.test/q');delete sample.signals.n.links;assert.equal(C.telemetryMetricUrl(binding,sample,'n'),'https://carrier.test/q');binding.signals.trace={source:'tempo',query:'{}'};assert.equal(C.telemetryMetricUrl(binding,sample,'n'),null);
 const preview=C.telemetryCardPreview({edges:[{from:'a',to:'b',telemetry:raw}]},{});assert.equal(preview.preview,true);assert.ok(Object.values(preview.map['a->b'].signals).every(s=>!s.links));assert.equal(preview.map['a->b'].signals.trace,undefined);
 const cw={source:'cloudwatch',query:{namespace:'AWS/IoT',metric:'PublishIn.AuthError',dimensions:{},accountId:'111111111111'}};assert.equal(C.telemetryCardScope(cw),'All topics · whole account');assert.match(C.telemetrySignalScope(cw),/111111111111/);
});

test('safe integer totals stay exact while fractional gauges and extreme values remain compact',()=>{
 const binding={signals:{count:{unit:'events'}}};
 for(const value of [0,12345,24114,1000000000,Number.MAX_SAFE_INTEGER])assert.equal(C.telemetryCardValue(binding,{signals:{count:{value}}},'count'),value.toLocaleString('en-US')+' events');
 assert.equal(C.telemetryCardValue(binding,{signals:{count:{value:12.34567}}},'count'),'12.35 events');
 assert.equal(C.telemetryCardValue(binding,{signals:{count:{value:1e100}}},'count'),'1.000e+100 events');
});

test('showOnCard only filters canvas display, including series, scope, COUNT caveats and pending peers',()=>{
 const raw={kind:'queue',signals:{in:{grafana:'traffic',unit:'req/h',showOnCard:false},received:{cloudwatch:{namespace:'AWS/IoT',metric:'TopicMatch',statistic:'Sum',region:'us-east-1',accountId:'111111111111',dimensions:{RuleName:'exact'}},label:'Received'},events:{honeycomb:{calculations:[{op:'COUNT'}]},showOnCard:false}},proof:{in:{min:1}}};
 const binding=C.carrierTelemetry({telemetry:raw},{}),sample={signals:{in:{value:5,series:[[1,5],[2,5]]},received:{value:24114,series:[[1,2],[2,24114]]}}};
 const content=C.telemetryCardContent({from:'a',to:'b',telemetry:raw},binding,sample,{telemetry:'observed'},'24h',{events:true});
 assert.deepEqual(plain(content.rows.map(r=>r.name)),['received']);assert.deepEqual(plain(content.series),[[1,2],[2,24114]]);assert.equal(content.countNote,'');assert.doesNotMatch(content.note,/Loading|Refreshing/);assert.equal(C.telemetryMetricRows(binding,sample).length,3);
 for(const id of ['local','direct::api','outer::inner::api','loaded::api'])assert.equal(C.proofVerdicts({carriers:[{...binding,id,tickets:['AA-1']}],jiraMap:{'AA-1':{state:'done'}},telemetryMap:{[id]:sample}}).carriers[id].verdict,'proven');
 binding.signals.received.showOnCard=false;assert.equal(C.telemetryMetricNames(C.telemetryCardBinding(binding)).length,0);
 for(const value of ['false',0,null]){const warnings=[],b=C.carrierTelemetry({telemetry:{kind:'service',signals:{x:{grafana:'up',showOnCard:value}}}},{},(a,m)=>warnings.push(a+m));assert.equal(b.signals.x.showOnCard,undefined);assert.match(warnings.join(' '),/boolean/);}
});

test('optional display variables cannot suppress queries across the template and consumer environment passes',()=>{
 const template={params:['service'],kind:'service',signals:{count:{grafana:'$service{env="${env}"}',label:'$service ${missingLabel}',links:{query:'https://grafana.test/${env}?q=$service&view=${missingUrl}'}}}};
 const config={environment:'stg',variables:{serviceName:'orders'}},raw={use:'metric',service:'${serviceName}'},templates={metric:template};
 for(const [carrier,tpl] of [[{telemetry:raw},templates],[{telemetry:C.telemetryExpand(raw,templates)},{}]]){
  const warnings=[],binding=C.carrierTelemetry(carrier,tpl,(a,m)=>warnings.push(a+m),config),signal=binding.signals.count;
  assert.equal(signal.query,'orders{env="stg"}');assert.equal(signal.error,undefined);assert.equal(signal.label,undefined);assert.equal(signal.links,undefined);assert.equal(warnings.length,2);assert.ok(warnings.every(w=>w.includes('display metadata ignored')));assert.equal(C.telemetryMetricRows(binding,{signals:{count:{value:3}}})[0].label,'count');assert.equal(C.telemetryGrafanaJobs([{...binding,id:'local'}])[0].signals[0].error,undefined);
 }
 const errors=C.carrierTelemetry({telemetry:{kind:'service',signals:{count:{grafana:'${missingQuery}',label:'${missingLabel}',links:{query:'https://grafana.test/${missingUrl}'}}}}},{},undefined,config).signals.count;assert.match(errors.error,/missingQuery/);assert.equal(errors.label,undefined);assert.equal(errors.links,undefined);
 const ready=C.carrierTelemetry({telemetry:raw},templates,undefined,{...config,variables:{...config.variables,missingLabel:'accepted',missingUrl:'exact'}}).signals.count;assert.equal(ready.label,'orders accepted');assert.equal(ready.links.query,'https://grafana.test/stg?q=orders&view=exact');
 const once=C.carrierTelemetry({telemetry:{kind:'service',signals:{count:{grafana:'up',label:'${caption}',links:{query:'https://grafana.test/?q=${target}'}}}}},{},undefined,{variables:{caption:'${literal}',target:'${literal}'}}).signals.count;assert.equal(once.error,undefined);assert.equal(once.label,'${literal}');assert.equal(once.links.query,'https://grafana.test/?q=${literal}');
});

test('hidden peers never enable ambiguous legacy card links; full binding owns URL resolution',()=>{
 const binding={kind:'service',signals:{visible:{source:'cloudwatch',query:{namespace:'AWS/IoT',metric:'TopicMatch',dimensions:{RuleName:'exact'}}},hidden:{source:'honeycomb',query:{calculations:[{op:'COUNT'}]},showOnCard:false}},proof:{}},sample={signals:{visible:{value:12345},hidden:{value:30}}},edge={from:'a',to:'b'};
 for(const owner of ['authored','provider']){
  binding.links=owner==='authored'?{query:'https://ui.honeycomb.io/team/result/hidden'}:{};sample.links=owner==='provider'?{query:'https://ui.honeycomb.io/team/result/hidden'}:{};
  const card=()=>C.telemetryCardContent(edge,binding,sample,{telemetry:'observed'},'24h');
  assert.equal(C.telemetryMetricRows(binding,sample)[0].url,null,owner+' Inspect');assert.equal(card().rows[0].url,null,owner+' card');assert.equal(card().rows.length,1);assert.equal(card().countNote,'');
  sample.signals.visible.links={query:'https://cloudwatch.test/provider-query'};assert.equal(card().rows[0].url,'https://cloudwatch.test/provider-query');
  binding.signals.visible.links={query:'https://cloudwatch.test/authored-query'};assert.equal(card().rows[0].url,'https://cloudwatch.test/authored-query');delete binding.signals.visible.links;delete sample.signals.visible.links;
 }
});
