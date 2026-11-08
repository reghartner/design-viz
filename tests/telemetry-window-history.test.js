'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const NOW=Date.UTC(2026,10,6,15),HOUR=3600000,DAY=24*HOUR,iso=n=>new Date(n).toISOString(),plain=x=>JSON.parse(JSON.stringify(x));
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
function context(now=NOW){const C={URL,TextEncoder,TextDecoder,AbortController,console,Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}},document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
const cw=(statistic='Sum')=>({namespace:'AWS/SQS',metric:'Received',region:'us-east-1',accountId:'111111111111',dimensions:{QueueName:'queue_$env'},statistic});
const rows=(values=[2,4],times=[NOW-2*HOUR,NOW-HOUR])=>({timestamps:times,values,statistics:{avg:999,sum:999,count:999}});
const days=()=>{const now=new Date(NOW),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(today);end.setDate(end.getDate()+1);return [-1,0,1].map(offset=>{const date=new Date(today),at=new Date(end);date.setDate(date.getDate()+offset);at.setDate(at.getDate()+offset);return {key:date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'),at:at.toISOString()};});};
function carrier(signals){return {telemetry:{kind:'service',signals:plain(signals),proof:{}}};}
async function setup({signals={total:{cloudwatch:cw()}},answer,window='24h'}={}){
 const C=context(),page={tracking:{telemetry:{window,environment:'stg',environments:{stg:{},prd:{}},grafana:{cloudwatch:'cw',prometheus:'prom',loki:'logs',sql:'sql'},honeycomb:{environment:'test',dataset:'test'}}}},nodes={local:carrier(signals),'imported::nested::api':carrier(signals)},calls=[];
 const tools=[{server:'Grafana',tools:['query_cloudwatch','query_cloudwatch_logs','query_prometheus','query_loki_logs','query_sql']},{server:'Honeycomb',tools:[{name:'run_query',inputSchema:{type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:'string'},query_spec:{type:'object'}},required:['environment_slug','query_spec']}}]}];
 const adapter=C.createTelemetryProviders(page,{claude:{use:async()=>({listTools:async()=>tools,callTool:async(server,tool,input,options)=>{const call={server,tool,input:plain(input),signal:options?.signal};calls.push(call);return answer?answer(call):{payload:rows([2,4],[Date.parse(input.end)-2*HOUR,Date.parse(input.end)-HOUR])};}})}}),api=C.createTelemetry(page,adapter.options,{carriers:fn=>Object.entries(nodes).forEach(([id,node])=>fn(node,id,page))}),handle=adapter.attach({telemetry:api},page);await settle();return {C,page,nodes,calls,api,close(){handle.destroy();api.destroy();}};
}
test('periods are useful and retention/point limits are checked; authored period is never silently changed',()=>{
 const C=context(),range=hours=>({from:iso(NOW-hours*HOUR),to:iso(NOW)});
 for(const [hours,period] of [[6,300],[24,3600],[48,3600]])assert.equal(C.telemetryCloudwatchPeriod(cw(),range(hours),NOW),period);
 assert.equal(C.telemetryCloudwatchPeriod({...cw(),period:120},range(24),NOW),120);
 for(const period of [0,5,61,60.5])assert.throws(()=>C.telemetryCloudwatchPeriod({...cw(),period},range(48),NOW));
 assert.throws(()=>C.telemetryCloudwatchPeriod({...cw(),period:60},{from:iso(NOW-20*DAY),to:iso(NOW-19*DAY)},NOW),/./);
 assert.equal(C.telemetryCloudwatchPeriod(cw(),{from:iso(NOW-70*DAY),to:iso(NOW-69*DAY)},NOW),3600);
 assert.throws(()=>C.telemetryCloudwatchPeriod(cw(),{from:iso(NOW-456*DAY),to:iso(NOW-455*DAY)},NOW));
});
test('five statistics aggregate sorted actual periods; Average uses unequal underlying weights, never tool point summary',()=>{
 const C=context(),payload=rows([20,10],[NOW-HOUR,NOW-2*HOUR]);
 for(const [stat,value] of [['Sum',30],['Maximum',20],['Minimum',10],['SampleCount',30]]){const s=C.telemetryGrafanaCloudwatch(payload,stat);assert.equal(s.value,value);assert.deepEqual(plain(s.series),[[NOW-2*HOUR,10],[NOW-HOUR,20]]);}
 assert.equal(C.telemetryGrafanaCloudwatch(payload,'Average',rows([0.5,4.5],[NOW-HOUR,NOW-2*HOUR])).value,11);
 assert.equal(C.telemetryGrafanaCloudwatch(payload,'Average',rows([1,9],[NOW-HOUR,NOW-2*HOUR])).value,11);
 for(const bad of [undefined,rows([1]),rows([0,1]),rows([1,-1]),rows([1,1],[NOW,NOW-HOUR]),rows([1,1],[NOW-HOUR,NOW-HOUR])])assert.equal(C.telemetryGrafanaCloudwatch(payload,'Average',bad),null);
 for(const bad of [{values:[1],timestamps:[]},rows([1,2],[NOW,NOW]),rows([NaN]),{status:'error',...rows()}])assert.equal(C.telemetryGrafanaCloudwatch(bad,'Sum'),null);
 assert.equal(C.telemetryGrafanaCloudwatch(rows([0],[NOW-HOUR]),'Maximum').value,0);
});
test('Today loads while enabled in Over time, past cache retains full metadata, future days never query, return Live works',async t=>{
 const h=await setup();t.after(h.close);h.api.openHistory(days(),1);assert.equal(h.calls.length,0);h.api.setEnabled(true);await settle();assert.equal(h.calls.length,2);
 for(const c of h.calls){assert.equal(c.input.end,iso(NOW));assert.equal(c.input.start,iso(NOW-DAY));assert.equal(c.input.period,3600);}
 for(const id of Object.keys(h.nodes)){const s=h.api.snapshot().map[id];assert.equal(s.signals.total.value,6);assert.equal(s.signals.total.series.length,2);assert.deepEqual(plain(s.window),{from:iso(NOW-DAY),to:iso(NOW)});}
 h.api.historyDay(0);await settle();const past=h.calls.at(-1).input.end;assert.equal(past,days()[0].at);const n=h.calls.length;h.api.historyDay(2);await settle();assert.equal(h.calls.length,n);assert.deepEqual(plain(h.api.snapshot().map),{});assert.match(h.api.status().note,/Future/);
 h.api.historyDay(0);await settle();assert.equal(h.calls.length,n);h.api.historyDay(1);await settle();assert.equal(h.calls.length,n+2,'Today is fetched again');h.api.closeHistory();await settle();assert.equal(h.calls.length,n+4);assert.equal(h.api.snapshot().historical,false);
});
test('pending peer cannot hide completed source; environment, off, replacement load, and destroy reject stale progress',async()=>{
 for(const stop of ['environment','off','replacement','destroy']){
  let releases=[];const h=await setup({signals:{total:{cloudwatch:cw()},honey:{honeycomb:{calculations:[{op:'COUNT'}]}}},answer:call=>call.tool==='run_query'?new Promise(resolve=>releases.push(()=>resolve({structuredContent:{results:[{data:{COUNT:999}}]}}))):{payload:rows()}});
  h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();assert.equal(h.api.snapshot().map.local.signals.total.value,6);assert.equal(h.api.snapshot().pending.local.honey,true);assert.equal(h.api.snapshot().pending.local.total,undefined);
  const old=h.calls.map(c=>c.signal),release=releases.splice(0);
  if(stop==='environment')h.api.setEnvironment('prd');else if(stop==='off')h.api.setEnabled(false);else if(stop==='replacement')h.api.bindingsChanged(['local','imported::nested::api']);else h.close();
  assert.ok(old.every(s=>s.aborted));release.forEach(f=>f());await settle();assert.notEqual(h.api.snapshot().map.local?.signals.honey?.value,999);h.close();releases.forEach(f=>f());await settle();
 }
});
test('Average failure cannot expose last bucket; successful same-carrier counter survives',async t=>{
 const h=await setup({signals:{avg:{cloudwatch:cw('Average')},total:{cloudwatch:cw()}},answer:c=>{if(c.input.statistic==='SampleCount')throw {code:'tool_error',message:'weights denied'};return {payload:rows()};}});t.after(h.close);h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();assert.equal(h.api.snapshot().map.local.signals.avg,undefined);assert.equal(h.api.snapshot().map.local.signals.total.value,6);assert.match(h.api.status().note,/weights denied/);assert.deepEqual(plain(h.api.snapshot().pending),{});
 const windows=h.calls.map(c=>[c.input.start,c.input.end,c.input.period]);assert.ok(windows.every(w=>JSON.stringify(w)===JSON.stringify(windows[0])));
});
test('Logs auto trend recognizes only plain counts, uses uncapped minute units, keeps scalar independent of malformed/truncated trend',async t=>{
 const C=context(),q={query:'filter topic = "a|b" | parse @message /foo(?<id>.*)/ | stats count() as n',valueField:'n',logGroups:['test'],region:'us-east-1'};
 const derived=C.telemetryLogTrend(q,6*HOUR);assert.match(derived.query,/bin\(3m\)/);assert.doesNotMatch(derived.query,/\d+s/);
 for(const query of ['fields @message | limit 10','stats sum(bytes) as n','stats count() as n by device','filter name = "stats count() as n"','stats count() as n | sort n desc'])assert.equal(C.telemetryLogTrend({...q,query},DAY),null);
 let fail=false;const h=await setup({signals:{logs:{cloudwatchLogs:q}},answer:c=>({payload:c.input.limit===1000?(fail?{status:'Timeout',logs:[]}:{status:'Complete',logs:[{flowview_time:iso(NOW-2*HOUR),n:'2'},{flowview_time:iso(NOW-HOUR),n:'4'}],totalFound:9000}):{status:'Complete',logs:[{n:'999'}],totalFound:2000}})});t.after(h.close);h.api.setEnabled(true);await settle();let sample=h.api.snapshot().map.local.signals.logs;assert.equal(sample.value,999);assert.equal(sample.series.length,2);assert.equal(sample.observedAt,null);assert.ok(h.calls.every(c=>c.input.start===iso(NOW-DAY)&&c.input.end===iso(NOW)));
 fail=true;h.api.retry();await settle();sample=h.api.snapshot().map.local.signals.logs;assert.equal(sample.value,999);assert.equal(sample.series,undefined);assert.match(h.api.status().note,/trend/);
 const truncated={status:'Complete',logs:Array.from({length:1000},(_,i)=>({t:iso(NOW-DAY+i*60000),v:'1'}))};assert.equal(C.telemetryGrafanaLogTrend(truncated,{timeField:'t',valueField:'v'},{from:iso(NOW-DAY),to:iso(NOW)}).truncated,true);
});
test('historical Honeycomb evaluates nonadditive scalar once per selected window with hosted absolute strings and unknown as-of intact',async t=>{
 const h=await setup({signals:{p95:{honeycomb:{calculations:[{op:'P95',column:'duration_ms'}]}}},answer:c=>({structuredContent:{results:[{data:{'P95(duration_ms)':123}}]}})});t.after(h.close);h.api.openHistory(days(),0);h.api.setEnabled(true);await settle();assert.equal(h.calls.length,2);
 for(const c of h.calls){assert.equal(c.tool,'run_query');assert.equal(c.input.query_spec.to,days()[0].at);assert.equal(c.input.query_spec.from,iso(Date.parse(days()[0].at)-DAY));assert.equal(c.input.query_spec.calculations[0].op,'P95');}
 const s=h.api.snapshot().map.local;assert.equal(s.signals.p95.value,123);assert.equal(s.signals.p95.observedAt,null);assert.equal(s.signals.p95.retrievedAt,iso(NOW));assert.equal(s.window.to,days()[0].at);
});
test('historical SQL requires authored time-aware macros; unavailable query does not suppress good SQL/Prom/Loki peers',async t=>{
 const h=await setup({signals:{bad:{sql:'select count(*) from mutable'},inert:{sql:'select count(*) as n, $$ $__from $__to $$ as note from requests'},good:{sql:'select count(*) from requests where $__timeFilter(created_at)'},prom:{grafana:'up'},loki:{loki:'sum(count_over_time({app="x"}[5m]))'}},answer:c=>({payload:c.tool==='query_sql'?{rows:[[42]]}:c.tool==='query_prometheus'?{data:{result:[{values:[[(NOW-HOUR)/1000,'5']]}]}}:{status:'success',data:{resultType:'matrix',result:[{values:[[(NOW-HOUR)/1000+'','3']]}]}}})});t.after(h.close);h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();assert.equal(h.calls.filter(c=>c.tool==='query_sql').length,2);const s=h.api.snapshot().map.local;assert.equal(s.signals.bad,undefined);assert.equal(s.signals.inert,undefined);assert.equal(s.signals.good.value,42);assert.equal(s.signals.prom.value,5);assert.match(h.api.status().note,/Historical SQL/);assert.ok(h.calls.filter(c=>c.tool==='query_sql').every(c=>c.input.start===iso(NOW-DAY)&&c.input.end===iso(NOW)));
});
test('timestamp-proportional mini charts preserve isolated points and sparse gaps',()=>{
 const C=context(),range={from:iso(NOW-DAY),to:iso(NOW)},g=C.telemetrySparkline([[NOW-DAY,1],[NOW-DAY+HOUR,2],[NOW-HOUR,3]],240,12,DAY,range);assert.equal(g.points.length,3);assert.equal(g.points[1].x,10);assert.equal(g.lines.length,1);assert.equal(C.telemetrySparkline([[NOW-HOUR,0]],240,12,DAY,range).points.length,1);
});

test('period boundaries, fractional weights, AWS bin caps and known-interval gaps stay honest',()=>{
 const C=context(),from=NOW-DAY+3*60000,range={from:iso(from),to:iso(NOW)},first=Math.floor(from/HOUR)*HOUR;
 const sample=C.telemetryGrafanaCloudwatch(rows([3,9],[first,NOW-HOUR]),'Sum',null,range,3600);assert.equal(sample.value,12);
 assert.equal(C.telemetryGrafanaCloudwatch(rows([3],[first-HOUR]),'Sum',null,range,3600),null);assert.equal(C.telemetryGrafanaCloudwatch(rows([3],[NOW]),'Sum',null,range,3600),null);
 const query={query:'stats count() as n'},trend=C.telemetryLogTrend(query,7*DAY);assert.match(trend.query,/bin\(2h\)/);assert.equal(trend.binSeconds,7200);
 const explicit={query:'stats count() as n by bin(5m) as t',timeField:'t',valueField:'n',binSeconds:300};
 const rounded=Math.floor(from/300000)*300000;assert.equal(C.telemetryGrafanaLogTrend({status:'Complete',logs:[{t:iso(rounded),n:'3'}]},explicit,range).series[0][0],rounded);
 assert.throws(()=>C.telemetryGrafanaLogTrend({status:'Complete',logs:[{t:iso(rounded-300000),n:'3'}]},explicit,range));
 const chart=C.telemetrySparkline([[first,3],[first+HOUR,4],[first+6*HOUR,5]],240,12,DAY,range,HOUR);assert.equal(chart.points[0].x,0);assert.equal(chart.lines.length,1,'five missing hours must not become a connected line');assert.ok(chart.points.at(-1).x<240,'quiet tail stays visible');
});
test('optional trend variables cannot block scalar; query variables still do, and schema/editor preserve new fields',()=>{
 const C=context(),config={variables:{}},source={cloudwatchLogs:{logGroups:['test'],region:'x',query:'stats count() as n',trend:{query:'filter device = "${optional}" | stats count() as n by bin(5m) as t',timeField:'t',valueField:'n',binSeconds:300}}};
 let b=C.carrierTelemetry(carrier({count:source}),{},null,config);assert.equal(b.signals.count.error,undefined);assert.match(b.signals.count.trendError,/optional/);
 source.cloudwatchLogs.query='filter x = "${required}" | stats count() as n';b=C.carrierTelemetry(carrier({count:source}),{},null,config);assert.match(b.signals.count.error,/required/);
 for(const period of [0,-1,1.5,'300',Infinity])assert.equal(C.telemetryCloudwatchQuery({...cw(),period}),false);assert.equal(C.telemetryCloudwatchQuery({...cw(),period:300}),true);
 for(const trend of [true,{}, {query:'q',timeField:'t',valueField:'v',binSeconds:0}])assert.equal(C.telemetryCloudwatchLogsQuery({...source.cloudwatchLogs,trend}),false);
});
test('new selected-window mode honors local DST keys and a closed board whose final day is past',async()=>{
 const old=process.env.TZ;process.env.TZ='America/New_York';let api;
 try{
  const now=Date.UTC(2026,2,8,17),C=context(now),calls=[],page={tracking:{telemetry:{window:'24h'}}},node=carrier({rate:{grafana:'up'}});
  api=C.createTelemetry(page,{historyMode:'window',provider:async()=>({}),history:async(b,r)=>{calls.push(plain(r));return {a:{signals:{rate:{value:1}}}}; }},{carriers:fn=>fn(node,'a',page)});
  const past={key:'2026-03-07',at:'2026-03-08T05:00:00.000Z'},today={key:'2026-03-08',at:'2026-03-09T04:00:00.000Z'},future={key:'2026-03-09',at:'2026-03-10T04:00:00.000Z'};
  api.openHistory([past],0);api.setEnabled(true);await settle();assert.equal(calls[0].window.to,past.at,'last index does not imply Today');
  api.openHistory([past,today,future],1);await settle();assert.equal(calls[1].window.to,iso(now));assert.equal(calls[1].window.from,iso(now-DAY));assert.equal(calls[1].endpoints[0].at,today.at,'query bound and calendar endpoint remain distinct');
  api.historyDay(2);await settle();assert.equal(calls.length,2);assert.deepEqual(plain(api.snapshot().map),{});
 }finally{api?.destroy();if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('loaded bindings reuse completed peer windows while changed same-ID bindings never reuse stale samples',async t=>{
 const h=await setup();t.after(h.close);h.api.openHistory(days(),0);h.api.setEnabled(true);await settle();assert.equal(h.calls.length,2);
 h.nodes['loaded::api']=carrier({total:{cloudwatch:cw()}});h.api.bindingsChanged();assert.equal(h.api.snapshot().map.local.signals.total.value,6);await settle();assert.equal(h.calls.length,3);assert.equal(h.api.snapshot().map['loaded::api'].signals.total.value,6);
 delete h.nodes['loaded::api'];h.api.bindingsChanged(['loaded::api']);await settle();assert.equal(h.calls.length,3);
 h.nodes.local.telemetry.signals.total.cloudwatch.metric='Changed';h.api.bindingsChanged();await settle();assert.equal(h.calls.length,4);assert.equal(h.calls.at(-1).input.metricName,'Changed');
});
test('selected-window paired AWS and Honeycomb tools share six slots with Jira without nested queue deadlock',async t=>{
 let active=0,max=0,releases=[];
 const h=await setup({signals:{avg:{cloudwatch:cw('Average')},logs:{cloudwatchLogs:{logGroups:['test'],region:'x',query:'stats count() as n',valueField:'n'}},honey:{honeycomb:{calculations:[{op:'COUNT'}]}}},answer:c=>new Promise(resolve=>{active++;max=Math.max(max,active);releases.push(()=>{active--;resolve(c.tool==='run_query'?{structuredContent:{results:[{data:{COUNT:5}}]}}:c.tool==='query_cloudwatch'?{payload:rows(c.input.statistic==='Average'?[20,10]:[0.5,4.5])}:{payload:{status:'Complete',logs:c.input.limit===1000?[]:[{n:'12'}],totalFound:0}});});})});t.after(h.close);
 const jira=Array.from({length:5},()=>h.C.liveStatusHistoryCall(()=>new Promise(resolve=>{active++;max=Math.max(max,active);releases.push(()=>{active--;resolve();});})));
 h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();assert.equal(max,6);
 for(let i=0;i<30 && (h.api.status().busy || active);i++){releases.splice(0).forEach(fn=>fn());await settle();}
 await Promise.all(jira);assert.equal(h.api.status().busy,false);assert.equal(active,0);assert.equal(max,6);assert.equal(h.calls.length,10);assert.equal(h.api.snapshot().map.local.signals.logs.value,12);assert.equal(h.api.snapshot().map.local.signals.honey.value,5);
});

test('explicit retry bypasses historical cache; formatted Honeycomb fallback preserves unknown measurement time and its own link',async t=>{
 let value='12.35';const h=await setup({signals:{honey:{honeycomb:{calculations:[{op:'P95',column:'duration_ms'}]}}},answer:()=>({payload:'# Results\n\n| P95(duration_ms) |\n| --- |\n| '+value+' |\n\n  query_url: "https://ui.honeycomb.io/team/result/fixture"\n'})});t.after(h.close);h.api.openHistory(days(),0);h.api.setEnabled(true);await settle();
 let s=h.api.snapshot().map.local.signals.honey;assert.equal(s.value,12.35);assert.equal(s.provenance,'formatted-text');assert.equal(s.observedAt,null);assert.equal(s.series.length,0);assert.equal(s.links.query,'https://ui.honeycomb.io/team/result/fixture');
 value='19.75';const count=h.calls.length;h.api.retry();await settle();assert.equal(h.calls.length,count+2);assert.equal(h.api.snapshot().map.local.signals.honey.value,19.75);assert.equal(h.api.snapshot().map.local.signals.honey.observedAt,null);
});
test('numeric selected history ignores trace bindings without querying trace tools or leaking unsupported diagnostics',async t=>{
 const h=await setup({signals:{total:{cloudwatch:cw()},request:{tempo:'{ service.name = "api" }'},trace:{honeycomb:{query_spec:{filters:[]}}}}});t.after(h.close);h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.tool==='query_cloudwatch'));assert.equal(h.api.status().note,'');assert.equal(h.api.snapshot().map.local.signals.total.value,6);
});

test('empty historical Prometheus stays unobserved while explicit zero and recognized Loki empty counts remain observed',async t=>{
 const h=await setup({signals:{empty:{grafana:'empty'},zero:{grafana:'zero'},logs:{loki:'sum(count_over_time({app="x"}[5m]))'}},answer:c=>({payload:c.tool==='query_prometheus'?{data:{result:c.input.expr==='zero'?[{values:[[(NOW-HOUR)/1000,'0']]}]:[]}}:{status:'success',data:{resultType:'matrix',result:[]}}})});t.after(h.close);h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();const s=h.api.snapshot().map.local.signals;assert.equal(s.empty,undefined);assert.equal(s.zero.value,0);assert.equal(s.logs.value,0);assert.match(h.api.status().note,/no numeric observation/);
});

test('native custom window providers and sparklines work without hosted connector code',async t=>{
 const N={URL,AbortController,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('native').source,N);
 assert.equal(typeof N.createTelemetryClaude,'undefined');assert.equal(N.telemetryWindowMs('6h'),6*HOUR);assert.equal(N.telemetryWindowMs('1w'),7*DAY);
 const page={tracking:{telemetry:{window:'6h'}}},node=carrier({rate:{grafana:'up',unit:'req/s'}}),calls=[];
 const api=N.createTelemetry(page,{historyMode:'window',provider:async()=>({}),history:async(bindings,range)=>{calls.push(range);return {local:{signals:{rate:{value:5,series:[[Date.parse(range.window.to)-HOUR,5]]}}}};}},{carriers:fn=>fn(node,'local',page)});t.after(()=>api.destroy());
 api.openHistory(days(),0);api.setEnabled(true);await settle();assert.equal(calls.length,1);assert.equal(Date.parse(calls[0].window.to)-Date.parse(calls[0].window.from),6*HOUR);assert.equal(api.snapshot().map.local.signals.rate.value,5);
 const sample=api.snapshot().map.local,chart=N.telemetrySparkline(sample.signals.rate.series,100,12,N.telemetryWindowMs('6h'),sample.window);assert.equal(chart.points.length,1);
});

test('SQL history eligibility ignores dialect strings/comments and rejects ambiguous quoting',()=>{
 const C=context();
 const inert=[
  "select count(*) from requests -- $__timeFilter(created_at)",
  "select count(*) from requests # $__timeFilter(created_at)",
  "select count(*) from requests /* $__from $__to */",
  "select count(*) from requests /* outer /* nested */ $__from $__to */",
  "select count(*) as n, $$ $__from $__to $$ as note from requests",
  "select count(*) as n, $note$ $__timeFilter(created_at) $note$ as note from requests",
  "select '$__from $__to' from requests",
  'select count(*) as [name ]] $__from $__to] from requests',
  'select count(*) as "name "" $__from $__to" from requests',
  'select count(*) as `name `` $__from $__to` from requests',
  'select count(*) from requests where at > $__from',
  'select count(*) where $__timeFilter(at) /* unterminated',
  'select count(*) where $__timeFilter(at) and note = $tag$ unterminated',
  "select count(*) where $__timeFilter(at) and note = 'unterminated",
  "select count(*) where $__timeFilter(at) and note = 'a"+String.fromCharCode(92)+"b'"
 ];
 for(const q of inert)assert.equal(C.telemetrySqlHistoryQuery(q),false,q);
 for(const q of [
  'select count(*) from requests where $__timeFilter(created_at)',
  'select count(*) from requests where at >= $__from and at < $__to',
  'select $$example$$ from requests where $__timeFilter(at) # ignored',
  'select $note$example$note$ from requests /* outer /* nested */ comment */ where at >= $__from and at < $__to',
  'select count(*) from requests -- ignored\nwhere $__timeFilter(at)'
 ])assert.equal(C.telemetrySqlHistoryQuery(q),true,q);
});

test('direct Honeycomb legacy history cannot accidentally issue a present-day query',async()=>{
 const C=context(),adapter=C.createTelemetryHoneycomb({tracking:{telemetry:{enabled:true}}},{claude:{use(){throw new Error('History must not connect without a window');}}},null,()=>true),notes=[];
 const result=await adapter.options.history([],{from:iso(NOW-DAY),to:iso(NOW)},new AbortController().signal,{note:s=>notes.push(s)});
 assert.deepEqual(plain(result),{});assert.match(notes[0],/selected observation window/);
});

// #1075: Grafana query_cloudwatch returns a bucket stamped exactly at `end` for dense metrics.
const PAST_TO=Date.UTC(2026,10,6),PAST={from:iso(PAST_TO-DAY),to:iso(PAST_TO)};
const dense=(from,to,value=t=>(t-from)/HOUR%5===2?7:0,last=100)=>{const times=[];for(let t=Math.floor(from/HOUR)*HOUR;t<to;t+=HOUR)times.push(t);return rows([...times.map(value),last],[...times,to]);};
test('dense hourly Sum with explicit zeros and a bucket stamped at the window end returns the in-window sum',()=>{
 const C=context(),payload=dense(PAST_TO-DAY,PAST_TO);assert.equal(payload.timestamps.length,25);assert.equal(payload.timestamps.at(-1),PAST_TO);
 const s=C.telemetryGrafanaCloudwatch(payload,'Sum',null,PAST,3600);assert.ok(s,'end bucket must not reject the series');
 assert.equal(s.value,5*7);assert.equal(s.series.length,24);assert.equal(s.series.at(-1)[0],PAST_TO-HOUR);assert.equal(s.observedAt,iso(PAST_TO-HOUR));
 assert.equal(C.telemetryGrafanaCloudwatch(payload,'SampleCount',null,PAST,3600).value,5*7);
});
test('dense hourly Maximum ignores the bucket stamped at the window end',()=>{
 const C=context(),s=C.telemetryGrafanaCloudwatch(dense(PAST_TO-DAY,PAST_TO),'Maximum',null,PAST,3600);assert.ok(s);assert.equal(s.value,7);assert.equal(s.series.length,24);
 assert.equal(C.telemetryGrafanaCloudwatch(dense(PAST_TO-DAY,PAST_TO,()=>0,0),'Maximum',null,PAST,3600).value,0);
});
test('dense hourly Average drops the window-end bucket from values and SampleCount weights alike',()=>{
 const C=context(),from=PAST_TO-DAY,payload=dense(from,PAST_TO,t=>(t-from)/HOUR<12?10:20,1000);
 const weights=dense(from,PAST_TO,t=>(t-from)/HOUR<12?1:3,1000000);
 const s=C.telemetryGrafanaCloudwatch(payload,'Average',weights,PAST,3600);assert.ok(s);assert.equal(s.value,(12*10*1+12*20*3)/(12+36));assert.equal(s.series.length,24);
 const trimmed={...weights,timestamps:weights.timestamps.slice(0,-1),values:weights.values.slice(0,-1)};
 assert.equal(C.telemetryGrafanaCloudwatch(payload,'Average',trimmed,PAST,3600).value,(12*10*1+12*20*3)/(12+36),'weights without the end bucket still pair exactly');
 const shifted={...weights,timestamps:weights.timestamps.map((t,i)=>i===3?t+60000:t)};assert.equal(C.telemetryGrafanaCloudwatch(payload,'Average',shifted,PAST,3600),null,'in-window pairing stays exact');
 assert.equal(C.telemetryGrafanaCloudwatch(payload,'Average',{...trimmed,timestamps:trimmed.timestamps.slice(1),values:trimmed.values.slice(1)},PAST,3600),null,'a missing in-window weight still fails');
});
test('sparse CloudWatch series inside the window is unchanged',()=>{
 const C=context(),payload=rows([3,9],[PAST_TO-20*HOUR,PAST_TO-4*HOUR]);
 for(const [stat,value] of [['Sum',12],['Maximum',9],['Minimum',3]]){const s=C.telemetryGrafanaCloudwatch(payload,stat,null,PAST,3600);assert.equal(s.value,value);assert.deepEqual(plain(s.series),[[PAST_TO-20*HOUR,3],[PAST_TO-4*HOUR,9]]);assert.equal(s.observedAt,iso(PAST_TO-4*HOUR));}
});
test('a CloudWatch point before the rounded window start still fails even with a window-end bucket',()=>{
 const C=context(),payload=dense(PAST_TO-DAY,PAST_TO);payload.timestamps.unshift(PAST_TO-DAY-HOUR);payload.values.unshift(1);
 assert.equal(C.telemetryGrafanaCloudwatch(payload,'Sum',null,PAST,3600),null);
 const from=PAST_TO-DAY+3*60000,range={from:iso(from),to:iso(PAST_TO)};assert.equal(C.telemetryGrafanaCloudwatch(dense(from,PAST_TO,()=>1),'Sum',null,range,3600).value,24,'the rounded start bucket is in the window');
});
test('Over time past day reads a dense end-stamped CloudWatch series while Live and Today are unchanged',async t=>{
 const h=await setup({signals:{total:{cloudwatch:cw()},avg:{cloudwatch:cw('Average')}},answer:c=>{const end=Date.parse(c.input.end),start=Date.parse(c.input.start);
  if(end===NOW)return {payload:rows([2,4],[end-2*HOUR,end-HOUR])};
  return {payload:dense(start,end,c.input.statistic==='SampleCount'?()=>2:()=>5,100)};}});t.after(h.close);
 h.api.setEnabled(true);await settle();let s=h.api.snapshot().map.local;assert.equal(s.signals.total.value,6);assert.equal(s.signals.total.series.length,2);assert.equal(s.signals.avg.value,(2*2+4*4)/6,'Live Average unchanged');
 assert.ok(h.calls.every(c=>c.input.end===iso(NOW)));
 h.api.openHistory(days(),1);await settle();s=h.api.snapshot().map.local;assert.equal(s.signals.total.value,6,'Today unchanged');
 h.api.historyDay(0);await settle();const past=h.calls.at(-1).input;assert.equal(past.end,days()[0].at);
 const n=Math.ceil((Date.parse(past.end)-Math.floor(Date.parse(past.start)/HOUR)*HOUR)/HOUR);
 s=h.api.snapshot().map.local;assert.equal(s.signals.total.value,5*n,'past-day dense Sum is the in-window sum, not Unobserved');assert.equal(s.signals.avg.value,5);assert.doesNotMatch(h.api.status().note || '',/malformed/);
});
