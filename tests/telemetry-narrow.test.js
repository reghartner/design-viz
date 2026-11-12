'use strict';
/* #1348 (epic #1344 PR 2): a signal's `narrow` holds fragments in its provider's own language,
   keyed by source; Flowview appends them when the query is built (carrierTelemetry) and never
   translates them. `needsNarrow` says every board must narrow. Anything unsafe fails closed: the
   signal is not shown, with a reason. This slice applies Honeycomb filters and CloudWatch
   dimensions. Merge rows (imports): tests/telemetry-import-merge.test.js X16-X21.
| row | rule |
|---|---|
| N1 | Honeycomb: narrow filters are appended after the provider's (an absent filters list is created); calculations, havings, orders and breakdowns stay; one fragment or a list; the applied fragments are listed for display. |
| N2 | CloudWatch: narrow dimensions are added to the query's; the same value adds nothing; a different value than the query's or another fragment's fails closed naming both values. |
| N3 | needsNarrow: met when a fragment names each field (a Honeycomb filter column, a CloudWatch dimension); true is met by any fragment; unmet fails closed naming the missing fields. |
| N4 | Fail closed with a reason: a fragment in another source's language, Grafana SQL and Tempo, text sources (not yet), a malformed fragment, a narrow that is not keyed by source, a Honeycomb OR query. |
| N5 | carrierTelemetry applies the narrowing to the query that is sent, after variables are filled in (fragments may use ${name}); a failure sets signal.error and keeps the query unnarrowed and unsent; local carriers too. |
| N6 | Validator: a fragment fault as written warns at its path on any page; an unmet needsNarrow, an OR query or a dimension conflict warns only on a page with a live-status panel, so a canon page that requires narrowing still builds. Field patches in an overlay get fragment checks too. |
| N7 | Compatibility: a signal or overlay with narrow or needsNarrow declares flow.telemetry-narrow. |
| N8 | Viewer: a carrier whose signal is not shown reads "Not shown: <reason>" instead of "Evidence is missing or incomplete." in Proof and the metrics popup; a narrowed signal lists its fragments in the Proof predicate ("Narrowed: …"). |
| N9 | (review c1 minor 2) needsNarrow counts only a filter that pins values: Honeycomb = or in with a value, a CloudWatch dimension with a value. exists, !=, not-in, does-not-exist (and an empty =) do not; true needs one pinning filter too. The reason names the field. |
| N10 | (minor 1) No link opens an unnarrowed query: a signal that fails closed loses its own and the carrier's query link; a narrowed signal's card never falls back to the carrier's query link. |
| N11 | (minor 6) The text view prints "Not shown: <reason>" for a fail-closed signal instead of its provider query; a narrowed signal prints the narrowed query. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js','core/text-view.js']),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const HC=()=>({calculations:[{op:'COUNT'}],filters:[{column:'service.name',op:'=',value:'dcf'}],breakdowns:['status'],havings:[{calculate_op:'COUNT',op:'>',value:0}],orders:[{op:'COUNT',order:'descending'}]});
const CW=()=>({namespace:'AWS/SNS',metric:'NumberOfMessagesPublished',region:'us-east-1',accountId:'123456789012',dimensions:{TopicName:'notify'},statistic:'Sum'});
const bind=signals=>({telemetry:{kind:'service',signals}});
const sig=(signals,name,env)=>plain(C.carrierTelemetry(bind(signals),{},undefined,env).signals[name]);
// Without the narrowing core the calls return a marker, so each row fails on what it returns.
const narrowQuery=(...a)=>(C.telemetryNarrowQuery || (()=>({missing:'telemetryNarrowQuery'})))(...a);
const narrow=(source,query,n,needs)=>plain(narrowQuery(source,query,n,needs));

test('N1 Honeycomb filters are appended; the rest of the query stays',()=>{
  const f={column:'event_code',op:'=',value:'FULL_CHARGE'};
  assert.deepEqual(narrow('honeycomb',HC(),{honeycomb:{filters:[f]}}),{query:{...HC(),filters:[HC().filters[0],f]},fragments:['event_code = FULL_CHARGE']});
  assert.deepEqual(narrow('honeycomb',{calculations:[{op:'COUNT'}]},{honeycomb:[{filters:[f]},{filters:[{column:'region',op:'in',value:['eu','us']}]}]}),
    {query:{calculations:[{op:'COUNT'}],filters:[f,{column:'region',op:'in',value:['eu','us']}]},fragments:['event_code = FULL_CHARGE','region in [eu, us]']},'a list of fragments; filters created');
  assert.deepEqual(narrow('honeycomb',HC(),null),{query:HC(),fragments:[]},'no narrowing, no change');
  const input=HC();narrowQuery('honeycomb',input,{honeycomb:{filters:[f]}});assert.deepEqual(input,HC(),'the query passed in is not changed');
});

test('N2 CloudWatch dimensions are added; a different value fails closed',()=>{
  assert.deepEqual(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{NotificationType:'FULL_CHARGE'}}}),{query:{...CW(),dimensions:{TopicName:'notify',NotificationType:'FULL_CHARGE'}},fragments:['NotificationType = FULL_CHARGE']});
  assert.deepEqual(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{TopicName:'notify'}}}),{query:CW(),fragments:[]},'the same value adds nothing');
  assert.deepEqual(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{TopicName:'other'}}}),{kind:'conflict',error:'Dimension TopicName is notify in the provider\'s query and other in another narrowing, so nothing can match; it is not shown.'});
  assert.deepEqual(narrow('cloudwatch',CW(),{cloudwatch:[{dimensions:{NotificationType:'1'}},{dimensions:{NotificationType:'2'}}]}),{kind:'conflict',error:'Dimension NotificationType is 1 in one narrowing and 2 in another narrowing, so nothing can match; it is not shown.'});
});

test('N3 needsNarrow is met when a fragment names each field, or any fragment for true',()=>{
  const f={filters:[{column:'event_code',op:'=',value:'X'}]};
  assert.equal(narrow('honeycomb',HC(),{honeycomb:f},['event_code']).error,undefined);
  assert.deepEqual(narrow('honeycomb',HC(),null,['event_code','region']),{kind:'unmet',error:'The provider asks each board to narrow this signal by event_code and region, and nothing narrows it here, so it is not shown.'});
  assert.deepEqual(narrow('honeycomb',HC(),{honeycomb:f},['event_code','region']),{kind:'unmet',error:'The provider asks each board to narrow this signal by region, and nothing narrows it here, so it is not shown.'});
  assert.deepEqual(narrow('cloudwatch',CW(),null,true),{kind:'unmet',error:'The provider asks each board to narrow this signal, and nothing narrows it here, so it is not shown.'});
  assert.equal(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{Kind:'a'}}},true).error,undefined,'true is met by any fragment');
  assert.equal(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{Kind:'a'}}},['Kind']).error,undefined,'a dimension name counts');
});

test('N4 every fail-closed reason',()=>{
  const f={filters:[{column:'a',op:'=',value:'1'}]};
  assert.deepEqual(narrow('honeycomb',HC(),{loki:'| a="1"'}),{kind:'language',written:true,error:'This signal reads from Honeycomb, so a LogQL narrowing cannot apply; it is not shown.'});
  assert.deepEqual(narrow('sql','SELECT 1',{sql:'WHERE a=1'}),{kind:'unsupported',written:true,error:'Grafana SQL signals cannot be narrowed, so this one is not shown. Ask the provider to write a ${name} placeholder in its query, then set that variable.'});
  assert.deepEqual(narrow('tempo','{}',null,['x']),{kind:'unsupported',written:false,error:'Tempo signals cannot be narrowed, so this one is not shown. Ask the provider to write a ${name} placeholder in its query, then set that variable.'});
  assert.deepEqual(narrow('loki','sum(count_over_time({app="a"}[5m]))',{loki:'| a="1"'}),{kind:'unsupported',written:true,error:'Flowview cannot narrow LogQL signals yet, so this one is not shown.'});
  assert.equal(narrow('loki','q',null).error,undefined,'a text signal without narrowing is untouched');
  assert.deepEqual(narrow('honeycomb',HC(),{honeycomb:{filters:[{column:'a',op:'like',value:'1'}]}}),{kind:'shape',written:true,error:'A Honeycomb narrowing of this signal is not valid (use a Honeycomb filter operator such as "=" or "in"), so it is not shown.'});
  assert.equal(narrow('honeycomb',HC(),{honeycomb:{filters:[{column:'a',op:'exists',value:1}]}}).error,'A Honeycomb narrowing of this signal is not valid (exists takes no value), so it is not shown.');
  assert.equal(narrow('honeycomb',HC(),{honeycomb:{filters:[{column:'a',op:'in',value:'x'}]}}).error,'A Honeycomb narrowing of this signal is not valid (in takes a list of values), so it is not shown.');
  assert.equal(narrow('honeycomb',HC(),{honeycomb:{filters:[],calculations:[]}}).error,'A Honeycomb narrowing of this signal is not valid (a Honeycomb narrowing holds only filters, so calculations cannot be used), so it is not shown.');
  assert.equal(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{A:1}}}).error,'A CloudWatch narrowing of this signal is not valid (a CloudWatch dimension has a text name and a text value), so it is not shown.');
  assert.deepEqual(narrow('honeycomb',HC(),'event_code = X'),{kind:'shape',written:true,error:'This signal\'s narrowing is not keyed by its source, so it is not shown.'});
  assert.deepEqual(narrow('honeycomb',{...HC(),filter_combination:'OR'},{honeycomb:f}),{kind:'or',error:'This Honeycomb query combines its filters with OR, so a filter cannot be added safely; it is not shown.'});
});

test('N5 carrierTelemetry sends the narrowed query, after variables; a failure is an unsent signal with its reason',()=>{
  const filters=[{column:'event_code',op:'=',value:'${feature}'}];
  const s=sig({received:{honeycomb:HC(),narrow:{honeycomb:{filters}},needsNarrow:['event_code']}},'received',{variables:{feature:'FULL_CHARGE'}});
  assert.deepEqual(s.query.filters,[HC().filters[0],{column:'event_code',op:'=',value:'FULL_CHARGE'}],'the variable is filled in inside the fragment');
  assert.deepEqual(s.query.calculations,HC().calculations);assert.deepEqual(s.narrow,['event_code = FULL_CHARGE']);assert.equal(s.error,undefined);
  const unmet=sig({received:{honeycomb:HC(),needsNarrow:['event_code']}},'received');
  assert.equal(unmet.error,'The provider asks each board to narrow this signal by event_code, and nothing narrows it here, so it is not shown.');
  assert.equal(unmet.narrowFailure,'unmet');assert.deepEqual(unmet.query,HC(),'the query stays unnarrowed');
  const unset=sig({received:{honeycomb:HC(),narrow:{honeycomb:{filters}}}},'received',{variables:{}});
  assert.match(unset.error,/^Set telemetry variable \$\{feature\}/,'an unset variable keeps its own reason, the first failure');
  const cw=sig({queued:{cloudwatch:CW(),narrow:{cloudwatch:{dimensions:{NotificationType:'FULL_CHARGE'}}}}},'queued');
  assert.deepEqual(cw.query.dimensions,{TopicName:'notify',NotificationType:'FULL_CHARGE'},'a local carrier narrows too');
});

test('N6 validator: fragment faults warn anywhere; needsNarrow, OR and conflicts only where signals are shown',()=>{
  const spec=(nodes,panel)=>({page:{title:'t',sections:[{id:'main',diagram:{nodes,rows:[Object.keys(nodes)],...(panel?{panels:[{id:'s',type:'live-status'}]}:{})}}]}});
  const warnings=doc=>plain(C.validate(C.normalize(doc)).warnings);
  const needs={dcf:{title:'DCF',...bind({received:{honeycomb:HC(),needsNarrow:['event_code']}})}};
  assert.deepEqual(warnings(spec(needs,false)),[],'a canon page that asks boards to narrow builds');
  assert.deepEqual(warnings(spec(needs,true)),['sections[0].diagram.nodes.dcf.telemetry.signals.received: The provider asks each board to narrow this signal by event_code, and nothing narrows it here, so it is not shown.']);
  const or={dcf:{title:'DCF',...bind({received:{honeycomb:{...HC(),filter_combination:'OR'},narrow:{honeycomb:{filters:[{column:'a',op:'=',value:'1'}]}}}})}};
  assert.deepEqual(warnings(spec(or,true)),['sections[0].diagram.nodes.dcf.telemetry.signals.received: This Honeycomb query combines its filters with OR, so a filter cannot be added safely; it is not shown.']);
  const bad={dcf:{title:'DCF',...bind({received:{honeycomb:HC(),narrow:{honeycomb:{filters:[{column:'a',op:'like',value:'1'}]},loki:'| x'},needsNarrow:'event_code'}})}};
  assert.deepEqual(warnings(spec(bad,false)),[
    'sections[0].diagram.nodes.dcf.telemetry.signals.received.narrow.honeycomb.filters[0].op: use a Honeycomb filter operator such as "=" or "in" — signal not shown',
    'sections[0].diagram.nodes.dcf.telemetry.signals.received.narrow.loki: this signal reads from Honeycomb, so a LogQL narrowing cannot apply — signal not shown',
    'sections[0].diagram.nodes.dcf.telemetry.signals.received.needsNarrow: must be true or a list of the field names a board must narrow by — ignored'],'faults as written, each once, on any page');
  const overlay={page:{title:'c',sections:[{id:'main',diagram:{nodes:{},rows:[[]],topologyImports:[{spec:'p',export:'core',as:'fc',nodeTracking:{dcf:{telemetry:{extends:true,signals:{received:{narrow:{honeycomb:{filters:[{column:'',op:'='}]}}}}}}}}]}}]}};
  assert.deepEqual(warnings(overlay),['sections[0].diagram.topologyImports[0].nodeTracking.dcf.telemetry.signals.received.narrow.honeycomb.filters[0].column: name the Honeycomb column to filter on — signal not shown'],'a field patch\'s fragment is checked by its key');
});

test('N7 compatibility declares flow.telemetry-narrow',()=>{
  const features=doc=>plain(C.FlowviewCompatibility.detect(doc));
  const local={page:{title:'t',sections:[{diagram:{nodes:{a:bind({x:{honeycomb:HC(),needsNarrow:true}})},rows:[['a']]}}]}};
  assert.ok(features(local).includes('flow.telemetry-narrow'));
  const overlay={page:{title:'c',sections:[{diagram:{nodes:{},rows:[[]],topologyImports:[{spec:'p',export:'core',as:'fc',nodeTracking:{dcf:{telemetry:{extends:true,signals:{x:{narrow:{honeycomb:{filters:[{column:'a',op:'=',value:'1'}]}}}}}}}}]}}]}};
  assert.ok(features(overlay).includes('flow.telemetry-narrow'));
  assert.ok(!features({page:{title:'t',sections:[{diagram:{nodes:{a:bind({x:{honeycomb:HC()}})},rows:[['a']]}}]}}).includes('flow.telemetry-narrow'));
});

test('N8 viewer: "Not shown: <reason>" and the narrowed fragments',()=>{
  const V={URL,AbortController,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};
  vm.runInNewContext(loader.entrypoint('native').source,V);
  const proofRow=telemetry=>{
    const carrier={title:'DCF',tickets:['AA-1'],telemetry},page={};
    const api=V.createTelemetry(page,{demo:{mount:()=>()=>{}}},{carriers:fn=>fn(carrier,'dcf',page),jira:()=>({'AA-1':{state:'done'}})});
    const row=plain(V.liveStatusProofPresentation(api.snapshot(),'24h',true).rows.find(r=>r.id==='dcf'));api.destroy();return row;
  };
  const unmet=proofRow({kind:'service',signals:{received:{honeycomb:HC(),needsNarrow:['event_code']}}});
  assert.equal(unmet.explanation,'Not shown: The provider asks each board to narrow this signal by event_code, and nothing narrows it here, so it is not shown.');
  assert.equal(unmet.metrics.explanation,unmet.explanation,'the metrics popup says the same');
  const plainRow=proofRow({kind:'service',signals:{received:{honeycomb:HC()}}});
  assert.equal(plainRow.explanation,'Evidence is missing or incomplete.','a signal that is merely not measured yet reads as before');
  const narrowed=proofRow({kind:'service',signals:{received:{honeycomb:HC(),narrow:{honeycomb:{filters:[{column:'event_code',op:'=',value:'FULL_CHARGE'}]}}}}});
  assert.match(narrowed.predicate,/ · Narrowed: event_code = FULL_CHARGE$/);
});

test('N9 needsNarrow counts only filters that pin values; the reason names the field',()=>{
  const needs=['tenant'],only=(f)=>narrow('honeycomb',HC(),{honeycomb:{filters:[f]}},needs);
  const weak='The provider asks each board to narrow this signal by tenant; a filter on tenant counts only with = or in and a value, so it is not shown.';
  for(const f of [{column:'tenant',op:'exists'},{column:'tenant',op:'!=',value:'a'},{column:'tenant',op:'not-in',value:['a']},{column:'tenant',op:'does-not-exist'},{column:'tenant',op:'=',value:''},{column:'tenant',op:'contains',value:'a'}])
    assert.deepEqual(only(f),{kind:'unmet',error:weak},f.op+' does not pin tenant');
  assert.equal(only({column:'tenant',op:'=',value:'acme'}).error,undefined);
  assert.equal(only({column:'tenant',op:'in',value:['acme','beta']}).error,undefined);
  assert.equal(narrow('honeycomb',HC(),{honeycomb:{filters:[{column:'tenant',op:'exists'},{column:'region',op:'=',value:'eu'}]}},['tenant','region']).error,weak,'region pinned, tenant only tested');
  assert.equal(narrow('honeycomb',HC(),{honeycomb:{filters:[{column:'x',op:'exists'}]}},true).error,'The provider asks each board to narrow this signal; a filter counts only with = or in and a value, so it is not shown.','true needs one pinning filter');
  assert.equal(narrow('honeycomb',HC(),{honeycomb:{filters:[{column:'x',op:'=',value:0}]}},true).error,undefined,'a number pins');
  assert.equal(narrow('cloudwatch',CW(),{cloudwatch:{dimensions:{Tenant:'acme'}}},['Tenant']).error,undefined,'a CloudWatch dimension pins');
});

test('N10 no query link opens an unnarrowed query',()=>{
  const links={query:'https://ui.honeycomb.io/q/provider'};
  const failed=plain(C.carrierTelemetry({telemetry:{kind:'service',links,signals:{received:{honeycomb:HC(),needsNarrow:['event_code'],links:{query:'https://ui.honeycomb.io/q/signal'}}}}},{}));
  assert.equal(failed.signals.received.links,undefined,'a fail-closed signal loses its own query link');
  assert.equal(failed.links.query,undefined,'and the carrier\'s');
  const kept=plain(C.carrierTelemetry({telemetry:{kind:'service',links:{...links,dashboard:'https://grafana.test/d'},signals:{received:{honeycomb:HC()}}}},{}));
  assert.deepEqual(kept.links,{query:'https://ui.honeycomb.io/q/provider',dashboard:'https://grafana.test/d'},'an unnarrowed carrier keeps its links');
  const V={URL,AbortController,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};
  vm.runInNewContext(loader.entrypoint('native').source,V);
  const binding=narrowed=>({links,signals:{received:{source:'honeycomb',query:HC(),...(narrowed?{narrow:['event_code = X']}:{})}}});
  assert.equal(V.telemetryMetricUrl(binding(true),null,'received'),null,'a narrowed signal never falls back to the carrier query link');
  assert.equal(V.telemetryMetricUrl(binding(false),null,'received'),'https://ui.honeycomb.io/q/provider','an unnarrowed single signal still does');
});

test('N11 the text view says why a signal is not shown, and prints a narrowed query as sent',()=>{
  const page=C.normalize({page:{title:'t',sections:[{id:'main',diagram:{nodes:{
    a:{title:'A',telemetry:{kind:'service',signals:{received:{honeycomb:HC(),needsNarrow:['event_code']}}}},
    b:{title:'B',telemetry:{kind:'service',signals:{received:{honeycomb:HC(),narrow:{honeycomb:{filters:[{column:'event_code',op:'=',value:'FULL'}]}}}}}}},rows:[['a','b']]}}]}});
  const flat=C.textViewFlat(C.textViewModel(page)).split('\n');
  assert.ok(flat.includes('node a metric.received.query Not shown: The provider asks each board to narrow this signal by event_code, and nothing narrows it here, so it is not shown.'),flat.filter(l=>/metric/.test(l)).join('\n'));
  assert.ok(!flat.some(l=>/^node a metric\.received\.query\./.test(l)),'the provider query is not printed for it');
  assert.ok(flat.includes('node b metric.received.query.filters[1].column event_code'),flat.filter(l=>/node b metric/.test(l)).join('\n'));
  const elements=String(C.textViewElements(C.textViewModel(page)));
  assert.match(elements,/Not shown: The provider asks each board to narrow this signal by event_code/,'the elements view says so too');
});
