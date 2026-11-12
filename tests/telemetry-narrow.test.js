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
| N12 | (#1354) LogQL placement (a label filter after drop, keep or label_format fails closed, #1356 c1 minor 4): each stage goes at the end of every log pipeline, after the selector's stages and before an inherited unwrap, a [range], a closing ) or the end; every leg of a ratio; $__range and offset untouched; a line filter meeting an inherited line_format, or a query without a stream selector, fails closed. |
| N13 | (#1354) LogQL fragment safety: one line filter (with or chains), label filter expression or parser per entry; anything else fails closed: a second "|", [ ] { }, #, a newline, unbalanced quotes or parentheses, a refused stage (line_format, label_format, unwrap, drop, keep, decolorize, distinct); a variable value that breaks the stage says so. |
| N14 | (#1354) PromQL placement (keywords are case-insensitive, #1356 c1 minor 3): the matcher text goes into every vector selector, inside its braces or as braces after a bare metric name; by/without/on/ignoring/group_left/group_right lists are skipped; ranges with $__rate_interval stay; a $var outside strings and ranges, an unknown token, or no selector fails closed. |
| N15 | (#1354) PromQL fragment safety: matcher text only (label op "value" joined by commas); a }, or, unless, a trailing comma, an unquoted value or a newline fails closed. |
| N16 | (#1354) Logs Insights placement: "| filter …" before the first stats, or at the end; breakdown and trend queries are narrowed too, and a failure there sets only their own error; only fields, filter, filterIndex, parse, sort, unmask, unnest and SOURCE may come before the insertion point; any other command fails closed, named (#1356 review c2). A provider's parse <field> /regex/ at command start, and like, not like or =~ after an operand, are opaque; any other / is a division; provider text is never rewritten (#1356 review c1 MAJOR 2, c2). |
| N17 | (#1354) Logs Insights fragment safety: one filter command; a "|", "#", a newline, unbalanced quotes or a non-filter command fails closed; a board's fragment may hold no / outside a quoted string (no regex literal, no division; #1356 review c1 MAJOR 1 and c2 MAJOR) and no \ at all (c3). |
| N18 | (#1354) needsNarrow pins with text: a PromQL or LogQL label "=" with a value; a Logs Insights top-level and chain of field = value or field in [...] (no parentheses or functions); a fragment with or (or not) pins nothing; true is met by a LogQL |= line filter whose every alternative is non-empty. |
| N19 | (#1353 review c1 minor 5) A narrowed Honeycomb trace search (query_spec) is not shown, with a narrowing reason. |
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
  assert.deepEqual(narrow('loki','sum(count_over_time({app="a"}[5m]))',{loki:'| a="1"'}),{query:'sum(count_over_time({app="a"} | a="1" [5m]))',fragments:['| a="1"']},'#1354: LogQL fragments now apply');
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

const lq=(q,frag)=>narrow('loki',q,{loki:frag});
test('N12 LogQL: each stage goes at the end of every log pipeline',()=>{
  const ok=(q,frag,want)=>{const r=lq(q,frag);assert.equal(r.error,undefined,q+' | '+JSON.stringify(frag)+': '+r.error);assert.equal(r.query,want);};
  ok('{app="dcf"}','| event_code="X"','{app="dcf"} | event_code="X"');
  ok('{app="dcf"} | json','| event_code="X"','{app="dcf"} | json | event_code="X"');
  ok('sum(count_over_time({app="dcf"} |= "err" [5m]))',['| json','| code="E1"'],'sum(count_over_time({app="dcf"} |= "err" | json | code="E1" [5m]))');
  ok('sum(count_over_time({app="a"}[$__range]))','| code="E1"','sum(count_over_time({app="a"} | code="E1" [$__range]))');
  ok('sum(count_over_time({app="a"}[5m] offset 1h))','| code="E1"','sum(count_over_time({app="a"} | code="E1" [5m] offset 1h))');
  ok('sum(sum_over_time({app="a"} | json | unwrap bytes [5m]))','| code="E1"','sum(sum_over_time({app="a"} | json | code="E1" | unwrap bytes [5m]))');
  ok('sum(rate({app="a"} |= "x" [5m])) / sum(rate({app="a"}[5m]))','|= "FULL"','sum(rate({app="a"} |= "x" |= "FULL" [5m])) / sum(rate({app="a"} |= "FULL" [5m]))');
  ok('sum by (code) (count_over_time({app="a", env=~"p.*"} | logfmt [1h]))','| code!="200"','sum by (code) (count_over_time({app="a", env=~"p.*"} | logfmt | code!="200" [1h]))');
  ok('{app="a"} | line_format "{{.msg}}"','| code="E1"','{app="a"} | line_format "{{.msg}}" | code="E1"');
  assert.deepEqual(lq('{app="a"} | line_format "{{.msg}}"','|= "FULL"'),{kind:'placement',error:'This LogQL query reformats its lines with line_format, so a line filter cannot be added safely; it is not shown.'});
  // #1356 review c1 minor 4: a label filter after drop, keep or label_format reads changed labels.
  for(const q of ['{a="b"} | drop code','{a="b"} | keep c','sum by (code) (count_over_time({a="b"} | json | label_format code=`{{.x}}` [5m]))'])
    assert.deepEqual(lq(q,'| code="E1"'),{kind:'placement',error:'This LogQL query changes its labels with drop, keep or label_format, so a label filter cannot be added safely; it is not shown.'},q);
  ok('{a="b"} | drop code','|= "x"','{a="b"} | drop code |= "x"');
  assert.deepEqual(lq('vector(1)','| a="1"'),{kind:'placement',error:'This LogQL query has no stream selector Flowview can find, so the narrowing cannot be added; it is not shown.'});
  assert.deepEqual(lq('{app="a" | json','| a="1"'),{kind:'placement',error:'This LogQL query has unbalanced braces, brackets or parentheses, so the narrowing cannot be added; it is not shown.'});
  assert.deepEqual(lq('{app="a} | json','| a="1"'),{kind:'placement',error:'This LogQL query has an unclosed string, so the narrowing cannot be added; it is not shown.'});
  assert.deepEqual(lq('{app="a"} # note','| a="1"'),{kind:'placement',error:'This LogQL query has a # comment, so the narrowing cannot be added; it is not shown.'});
  // The validator: a fragment fault as written warns anywhere; a query it cannot be placed in, only where signals are shown.
  const page=(signal,panel)=>({page:{title:'t',sections:[{id:'main',diagram:{nodes:{a:{title:'A',telemetry:{kind:'service',signals:{logs:signal}}}},rows:[['a']],...(panel?{panels:[{id:'s',type:'live-status'}]}:{})}}]}});
  const warn=doc=>plain(C.validate(C.normalize(doc)).warnings).filter(w=>/telemetry/.test(w));
  assert.deepEqual(warn(page({loki:'{app="a"}',narrow:{loki:['| json','| a="x" | drop b']}},false)),['sections[0].diagram.nodes.a.telemetry.signals.logs.narrow.loki[1]: one stage per entry: this one has a second "|" — signal not shown']);
  const unplaceable={loki:'vector(1)',narrow:{loki:'| a="x"'}};
  assert.deepEqual(warn(page(unplaceable,false)),[],'a canon page still builds');
  assert.deepEqual(warn(page(unplaceable,true)),['sections[0].diagram.nodes.a.telemetry.signals.logs: This LogQL query has no stream selector Flowview can find, so the narrowing cannot be added; it is not shown.']);
});

test('N13 LogQL: only one safe stage per entry; every escape attempt fails closed',()=>{
  for(const frag of ['|= "a"','!= "a"','|~ "a.*b"','!~ "x"','|= "a" or "b"','| json','| logfmt','| unpack','| regexp "(?P<code>\\\\w+)"','| pattern "<_> code=<code>"','| a="x"','| a=~"x|y" and b!="z"','| status >= 500','| duration > 1.5s, size < 10KB','| (a="1" or b="2") and c="3"','| json code="event.code"'])
    assert.equal(lq('{app="a"}',frag).error,undefined,frag);
  const bad=(frag,why)=>assert.deepEqual(lq('sum(count_over_time({app="a"}[5m]))',frag),{kind:'shape',written:true,error:'A LogQL narrowing of this signal is not valid ('+why+'), so it is not shown.'},JSON.stringify(frag));
  const stage='a LogQL narrowing is one line filter (|= "x"), label filter (| a="x") or parser (| json)';
  bad('| a="x" [5m])) or vector(1)','a LogQL narrowing cannot hold { } [ ]');
  bad('| a="x" | line_format "x"','one stage per entry: this one has a second "|"');
  bad('|= "x" |= "y"','one stage per entry: this one has a second "|"');
  bad('| a="x" # rest','"#" would comment out the rest of the query');
  bad('| a="x"\n| b="y"','a narrowing is one line');
  bad('} |= "x"','a LogQL narrowing cannot hold { } [ ]');
  bad('|= "x','its quotes are unbalanced');
  bad('| (a="x"','its parentheses are unbalanced');
  bad('| line_format {{.a}}','a LogQL narrowing cannot hold { } [ ]');
  bad('| line_format "x"','line_format changes what is counted and cannot narrow');
  for(const word of ['label_format a="b"','unwrap bytes','drop a','keep a','decolorize','distinct a'])bad('| '+word,word.split(' ')[0]+' changes what is counted and cannot narrow');
  bad('| a',stage);bad('a="x"',stage);bad('| a="x" b="y"',stage);bad('|= x',stage);bad('',stage);
  // A variable value that adds a quote breaks the stage after it is filled in.
  const s=plain(C.carrierTelemetry({telemetry:{kind:'service',signals:{logs:{loki:'sum(count_over_time({app="a"}[5m]))',narrow:{loki:'| code="${code}"'}}}}},{},undefined,{variables:{code:'x" | line_format "y'}}).signals.logs);
  assert.equal(s.error,'After its variables were filled in, a LogQL narrowing of this signal is not valid (one stage per entry: this one has a second "|"), so it is not shown.');
  assert.equal(s.query,'sum(count_over_time({app="a"}[5m]))','nothing is spliced');
});

const pq=(q,frag)=>narrow('grafana',q,{grafana:frag});
test('N14 PromQL: the matcher text goes into every vector selector',()=>{
  const ok=(q,frag,want)=>{const r=pq(q,frag);assert.equal(r.error,undefined,q+': '+r.error);assert.equal(r.query,want);};
  ok('sum(rate(http_requests_total{job="api"}[5m]))','code="500"','sum(rate(http_requests_total{job="api",code="500"}[5m]))');
  ok('up','code="500"','up{code="500"}');
  ok('x{a="b",}','code="500"','x{a="b",code="500"}');
  ok('sum by (job) (rate(x[5m]))','type="full"','sum by (job) (rate(x{type="full"}[5m]))');
  ok('sum(rate(a_total[5m])) / on(job) group_left(team) sum(rate(b_total[$__rate_interval]))','type="full"','sum(rate(a_total{type="full"}[5m])) / on(job) group_left(team) sum(rate(b_total{type="full"}[$__rate_interval]))');
  ok('histogram_quantile(0.9, sum without (pod) (rate(h_bucket{le!=""}[5m])))','type="full"','histogram_quantile(0.9, sum without (pod) (rate(h_bucket{le!="",type="full"}[5m])))');
  ok('{__name__="x"} * 3600','type="full"','{__name__="x",type="full"} * 3600');
  ok('rate(x[5m] offset 1h) > bool 0','type="full"','rate(x{type="full"}[5m] offset 1h) > bool 0');
  ok('label_replace(up{job="a"}, "dst", "$1", "src", "(.*)")','type="full"','label_replace(up{job="a",type="full"}, "dst", "$1", "src", "(.*)")');
  ok('count{job="a"}','type="full"','count{job="a",type="full"}');
  ok('sum(rate(x[5m]))',['type="full"','region="eu"'],'sum(rate(x{type="full",region="eu"}[5m]))');
  // #1356 review c1 minor 3: PromQL keywords are case-insensitive.
  ok('sum BY (job) (rate(x[5m]))','t="1"','sum BY (job) (rate(x{t="1"}[5m]))');
  ok('x OR y','t="1"','x{t="1"} OR y{t="1"}');
  ok('up == Inf','t="1"','up{t="1"} == Inf');
  ok('a UNLESS ON(job) b','t="1"','a{t="1"} UNLESS ON(job) b{t="1"}');
  ok('SUM(rate(x[5m]))','t="1"','SUM(rate(x{t="1"}[5m]))');
  assert.deepEqual(pq('sum(rate(x{job="$job"}[5m])) / $total','type="full"'),{kind:'placement',error:'This PromQL query has a $ variable outside a string or range, so the narrowing cannot be added; it is not shown.'});
  assert.deepEqual(pq('vector(1)','type="full"'),{kind:'placement',error:'This PromQL query has no vector selector Flowview can find, so the narrowing cannot be added; it is not shown.'});
  assert.deepEqual(pq('sum(rate(x[5m]) ; drop','type="full"'),{kind:'placement',error:'This PromQL query has a token Flowview does not recognise (;), so the narrowing cannot be added; it is not shown.'});
  assert.deepEqual(pq('sum(rate(x[5m])','type="full"'),{kind:'placement',error:'This PromQL query has unbalanced braces, brackets or parentheses, so the narrowing cannot be added; it is not shown.'});
});

test('N15 PromQL: matcher text only; every escape attempt fails closed',()=>{
  for(const frag of ['type="full"','type=~"a|b",region!="test"','a!~\'x\'','a=`raw`','a="say \\"hi\\""'])assert.equal(pq('up',frag).error,undefined,frag);
  const bad=frag=>assert.deepEqual(pq('up',frag),{kind:'shape',written:true,error:'A Prometheus narrowing of this signal is not valid (use PromQL matcher text such as type="full_charge"), so it is not shown.'},JSON.stringify(frag));
  for(const frag of ['type="1"} or vector(1)','type="1" or up','type="1" unless up','type="1",','type=1','type="1"\n','}','type="1"}[5m]','{type="1"}','type="1" #','type','"a"="b"',''])bad(frag);
});

const logs=(query,frag,extra={})=>narrow('cloudwatchLogs',{logGroups:['g'],query,region:'us-east-1',...extra},{cloudwatchLogs:frag});
test('N16 Logs Insights: "| filter …" before the first stats, or at the end; breakdown and trend too',()=>{
  const ok=(q,frag,want)=>{const r=logs(q,frag);assert.equal(r.error,undefined,q+': '+r.error);assert.equal(r.query.query,want);};
  ok('fields @message | filter level="error" | stats count() as n','filter code = "E1"','fields @message | filter level="error" | filter code = "E1" | stats count() as n');
  ok('filter a = 1 | stats count() as n | stats sum(n) as m','filter code = "E1"','filter a = 1 | filter code = "E1" | stats count() as n | stats sum(n) as m');
  ok('fields @timestamp, @message','filter code = "E1"','fields @timestamp, @message | filter code = "E1"');
  ok('fields @message | stats count() as n',['filter a = 1','filter b like "x|y"'],'fields @message | filter a = 1 | filter b like "x|y" | stats count() as n');
  const r=logs('filter a = 1 | stats count() as n','filter code = "E1"',{breakdown:{query:'filter a = 1 | stats count() as n by clientId | sort n desc | limit 20',labelField:'clientId',valueField:'n',limit:20},trend:{query:'filter a = 1 | stats count() as n by bin(1h)',timeField:'bin(1h)',valueField:'n'}});
  assert.equal(r.query.breakdown.query,'filter a = 1 | filter code = "E1" | stats count() as n by clientId | sort n desc | limit 20','a limit after stats is fine');
  assert.equal(r.query.trend.query,'filter a = 1 | filter code = "E1" | stats count() as n by bin(1h)');
  // #1356 review c1 MAJOR 2: a provider parse /regex/ is opaque, and provider text is never rewritten.
  ok('parse @message /(?<level>INFO|WARN|ERROR)/ | stats count() as n by level','filter tenant = "A"','parse @message /(?<level>INFO|WARN|ERROR)/ | filter tenant = "A" | stats count() as n by level');
  ok('parse @message /a|stats x/ | stats count() as n','filter tenant = "A"','parse @message /a|stats x/ | filter tenant = "A" | stats count() as n');
  ok('parse /(?<a>[^#]+)/ | stats count() as n','filter tenant = "A"','parse /(?<a>[^#]+)/ | filter tenant = "A" | stats count() as n');
  ok('fields a|filter b = 1|stats sum(bytes)/1024 as kb','filter tenant = "A"','fields a|filter b = 1|filter tenant = "A" | stats sum(bytes)/1024 as kb');
  ok('fields  bytes / 1024 as kb ','filter tenant = "A"','fields  bytes / 1024 as kb | filter tenant = "A"');
  assert.deepEqual(logs('fields a | limit 10 | stats count() as n','filter code = "E1"'),{kind:'placement',error:'This Logs Insights query has a limit command before its stats, so a filter cannot be added safely; it is not shown.'});
  // #1356 review c2: before the insertion point only known commands are accepted; any other fails closed, named.
  for(const [q,word] of [['fields a | head 10 | stats count() as n','head'],['pattern @message | stats count() as n','pattern'],['fields a | diff | stats count() as n','diff'],['dedup a | stats count() as n','dedup'],['fields a | display a','display']])
    assert.deepEqual(logs(q,'filter code = "E1"'),{kind:'placement',error:'This Logs Insights query has a '+word+' command before its stats, so a filter cannot be added safely; it is not shown.'},q);
  ok('SOURCE logGroups(namePrefix: ["/aws"]) | fields a | filterIndex region = "x" | unmask @message | unnest x into y | sort @timestamp desc | stats count() as n','filter code = "E1"','SOURCE logGroups(namePrefix: ["/aws"]) | fields a | filterIndex region = "x" | unmask @message | unnest x into y | sort @timestamp desc | filter code = "E1" | stats count() as n');
  // The provider's regex: parse <field> /…/ only at command start; like and =~ only after an operand.
  ok('fields a|parse @message /a|b/|stats count() as n','filter code = "E1"','fields a|parse @message /a|b/|filter code = "E1" | stats count() as n');
  ok('filter m like /a|stats x/ | stats count() as n','filter code = "E1"','filter m like /a|stats x/ | filter code = "E1" | stats count() as n');
  ok('filter m not like /x|y/ and k =~ /p|q/ | stats count() as n','filter code = "E1"','filter m not like /x|y/ and k =~ /p|q/ | filter code = "E1" | stats count() as n');
  ok('filter parse / 2 > 1 | stats count() as n','filter code = "E1"','filter parse / 2 > 1 | filter code = "E1" | stats count() as n');
  ok('filter like / 2 > 1 | stats count() as n','filter code = "E1"','filter like / 2 > 1 | filter code = "E1" | stats count() as n');
  // #1356 review c3 minor 2: a regex after a keyword is not read as one; the reason says so.
  assert.deepEqual(logs('filter by like /a|b/ | stats count() as n','filter code = "E1"'),{kind:'placement',error:'This Logs Insights query has a regex after like or =~ that Flowview cannot read, so a filter cannot be added safely; it is not shown.'});
  const side=logs('stats count() as n','filter code = "E1"',{breakdown:{query:'dedup clientId | stats count() as n by clientId',labelField:'clientId',valueField:'n',limit:20}});
  assert.equal(side.error,undefined,'the total is still narrowed and shown');
  assert.equal(side.breakdownError,'This Logs Insights query has a dedup command before its stats, so a filter cannot be added safely; it is not shown.');
  const s=plain(C.carrierTelemetry({telemetry:{kind:'service',signals:{fail:{cloudwatchLogs:{logGroups:['g'],query:'stats count() as n',region:'us-east-1',valueField:'n',breakdown:{query:'dedup c | stats count() as n by c',labelField:'c',valueField:'n',limit:20}},narrow:{cloudwatchLogs:'filter code = "E1"'}}}}},{}).signals.fail);
  assert.equal(s.error,undefined);assert.equal(s.query.query,'filter code = "E1" | stats count() as n');
  assert.match(s.breakdownError,/has a dedup command before its stats/,'only the details query fails');
});

test('N17 Logs Insights: one filter command; every escape attempt fails closed',()=>{
  for(const frag of ['filter a = "x"','FILTER a in ["x","y"]','filter @message like "a|b#c"','filter a = \'x\' and b != 2'])assert.equal(logs('stats count() as n',frag).error,undefined,frag);
  const bad=(frag,why)=>assert.deepEqual(logs('stats count() as n',frag),{kind:'shape',written:true,error:'A Logs Insights narrowing of this signal is not valid ('+why+'), so it is not shown.'},JSON.stringify(frag));
  bad('filter a = "x" | stats count() as n','one filter command: this one has a "|"');
  bad('filter a = "x" # c','"#" would comment out the rest of the query');
  bad('filter a = "x"\n| fields b','a narrowing is one line');
  bad('filter a = "x','its quotes are unbalanced');
  bad('fields a','a Logs Insights narrowing is one filter command');
  // #1356 review c1 MAJOR 1: a regex opens only after a standalone like, not like or =~; x.like / … is a division.
  bad('filter x.like / 1 or 1 = 1 | stats count(*) as n # / and tenant = "A"','a Logs Insights narrowing may not contain / (use like \"text\" or a quoted string)');
  bad('filter x.like / 2 | stats sum(bytes) as n | filter n / 1 > 0','a Logs Insights narrowing may not contain / (use like \"text\" or a quoted string)');
  // #1356 review c2 MAJOR: a board's fragment holds no / at all: no regex literal, no division.
  for(const frag of ['filter parse / 1 or 1 = 1 | stats count(*) as n # / and tenant = "A"','filter like / 1 or 1 = 1 | stats count(*) as n # / and tenant = "A"','filter tenant = "A" and parse / 1 or 1 / 1 = 1','filter tenant = "A" and like / 1','filter @message like /a|b/','filter x =~ /a/','filter bytes / 2 > 1','filter m not like /x/'])bad(frag,'a Logs Insights narrowing may not contain / (use like \"text\" or a quoted string)');
  assert.match(narrow('cloudwatchLogs',{logGroups:['g'],query:'stats count() as n',region:'us-east-1'},{cloudwatchLogs:'filter tenant = "A" and x.like / 1 or 1 / 1 = 1'},['tenant']).error || '',/may not contain \//,'refused outright, so it never counts as narrowing by tenant');
  // #1356 review c3 minor 1: a board fragment holds no \, so its safety never rests on how Logs Insights reads escapes.
  for(const frag of ['filter tenant = "A\\" | stats count() as n # "',"filter tenant = 'A\\' | stats count() as n # '",'filter path = "a\\b"'])bad(frag,'a Logs Insights narrowing may not contain \\');
  for(const frag of ['filter @message like "a/b"','filter @message not like "x"','filter path = "/a/b"'])assert.equal(logs('stats count() as n',frag).error,undefined,'a / inside a string is fine: '+frag);
  bad('stats count()','a Logs Insights narrowing is one filter command');
});

test('N18 needsNarrow pins with text fragments',()=>{
  const met=(source,query,frag,needs)=>narrow(source,query,{[source]:frag},needs).error===undefined;
  assert.ok(met('grafana','up','code="500"',['code']));
  for(const f of ['code=~"5.."','code!="1"','code=""'])assert.ok(!met('grafana','up',f,['code']),f);
  assert.ok(met('loki','{a="b"}','| code="E1"',['code']));assert.ok(met('loki','{a="b"}','| code=="E1"',['code']));
  for(const f of ['| code!="E1"','| code="E1" or code="E2"','| code=~"E.*"','|= "code"'])assert.ok(!met('loki','{a="b"}',f,['code']),f);
  assert.ok(met('loki','{a="b"}','|= "FULL"',true),'true is met by a |= line filter');
  assert.ok(!met('loki','{a="b"}','!= "FULL"',true));
  const q={logGroups:['g'],query:'stats count() as n',region:'us-east-1'};
  assert.ok(met('cloudwatchLogs',q,'filter code = "E1"',['code']));assert.ok(met('cloudwatchLogs',q,'filter code in ["a","b"]',['code']));
  for(const f of ['filter code = "E1" or x = 1','filter not code = "E1"','filter code != "E1"','filter code like "E"'])assert.ok(!met('cloudwatchLogs',q,f,['code']),f);
  // #1356 review c1 minors 1 and 2.
  assert.ok(!met('loki','{a="b"}','|= "x" or ""',true),'an empty alternative matches every line');
  assert.ok(met('loki','{a="b"}','|= "x" or "y"',true));
  assert.ok(!met('loki','{a="b"}','|~ "x"',true),'a regex line filter does not pin');
  for(const f of ['filter ispresent(tenant = "A")','filter (tenant = "A" or tenant = "B")','filter tenant = "A" or x = 1'])assert.ok(!met('cloudwatchLogs',q,f,['tenant']),f);
  assert.ok(met('cloudwatchLogs',q,'filter tenant = "A" and level > 3',['tenant']),'an and chain pins');
  assert.equal(narrow('loki','{a="b"}',{loki:'| code!="E1"'},['code']).error,'The provider asks each board to narrow this signal by code; a filter on code counts only with = and a value, so it is not shown.');
});

test('N19 a narrowed Honeycomb trace search is not shown, with a narrowing reason',()=>{
  const trace={query_spec:{calculations:[{op:'COUNT'}],filters:[{column:'service.name',op:'=',value:'dcf'}]},raw_row_columns:['trace.trace_id'],results_limit:5};
  assert.deepEqual(narrow('honeycomb',trace,{honeycomb:{filters:[{column:'event_code',op:'=',value:'X'}]}}),{kind:'unsupported',written:true,error:'This Honeycomb trace search cannot be narrowed, so it is not shown.'});
});
