'use strict';
/* #1099: find a trace from a Loki log line in Load trace. Test names carry the
   ticket's test plan number. The browser contract trace-log-lookup.spec.mjs covers
   the form, loading the found trace and focusing its span (plan 1, 2 and 6). */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const fixture=require('./fixtures/trace-connection-profile.json');
const clone=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
const TRACE='1e4cef70fde7bde26ca79f1e74c05bcb',SPAN='b4be3d5412c33b2e',OTHER='8413cd87a9f15b6bfe8e1acf5b3346d0';
const QUERY='{env="$env", k8s_namespace_name="${namespace}"} |= "Handling camera stats message" | cameraModel="$value"';
const EXPANDED='{env="stg", k8s_namespace_name="cameras-stg"} |= "Handling camera stats message" | cameraModel="arch"';
// #1158: "Only lines with a trace ID" is checked by default and appends this filter.
const FILTER='\n| trace_id =~ "[0-9a-fA-F]{16,32}"';
function context(name='standalone',timers={setTimeout,clearTimeout}){const C={URL,AbortController,TextEncoder,TextDecoder,console,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint(name).body,C);return C;}
function board(lookups={camera:{label:'Camera model',query:QUERY,values:['arch','wren']}}){
 return {tracking:{telemetry:{grafana:{loki:'loki-$env'},environment:'stg',environments:{stg:{variables:{namespace:'cameras-stg'}},prd:{variables:{namespace:'cameras-prd'}}},lookups,traceConnections:{company:clone(fixture)}}},sections:[{id:'one',diagram:{nodes:{a:{}},rows:[['a']]}}]};
}
// One log line as grafana/mcp-grafana tools/loki.go returns it (format full).
function entry({at='1794044533123456789',meta={cameraModel:'arch',deviceId:'cam-1',trace_id:TRACE,span_id:SPAN},labels={env:'stg',k8s_namespace_name:'cameras-stg',severity_text:'DEBUG'},line='Handling camera stats message'}={}){
 return {timestamp:at,line,labels,...(meta?{structuredMetadata:meta}:{})};
}
const GRAFANA={server:'Grafana',tools:[{name:'query_loki_logs',annotations:{readOnlyHint:true}}]},DETAIL={server:fixture.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true}}]};
function setup({p=board(),data=[entry()],servers=[DETAIL,GRAFANA],lookback={start:'',end:'',lookback:'2h'},C=context(),answer,day}={}){
 const calls=[],counts={lists:0};let changes=0;
 const mcp={listTools:async()=>{counts.lists++;return clone(servers);},callTool:async(server,tool,args)=>{calls.push({server,tool,args:clone(args)});if(answer)return answer();return {content:[{type:'text',text:JSON.stringify({data,metadata:{linesReturned:data.length,maxLinesAllowed:10,resultsTruncated:false}})}]};}};
 const transport=C.createTelemetryProviders(p,{claude:{use:async()=>mcp}}).options.directTrace;
 const api=C.createTelemetryLogLookup(p,transport,{config:()=>C.telemetryEnvironmentConfig(p,'stg'),lookback:()=>lookback,changed:()=>changes++,...(day?{day}:{})});
 return {C,p,api,calls,counts,changes:()=>changes};
}
const rows=api=>clone(api.snapshot().result.rows).map(r=>[r.time,r.value,r.traceId,r.spanId,r.missing]);

test('plan 1: an authored lookup with a value makes one query_loki_logs call with the expanded query, the lookback range and limit 10',async()=>{
 const later=entry({at:'1794040000000000000',meta:{cameraModel:'arch',trace_id:OTHER}}),h=setup({data:[entry(),later].concat(Array.from({length:10},()=>later))});
 assert.equal(h.api.snapshot().available,false,'the connector is checked before lookups are offered');await settle();
 let s=h.api.snapshot();assert.equal(s.available,true);assert.equal(h.counts.lists,1);assert.equal(h.calls.length,0,'discovery calls no data tool');
 assert.deepEqual(clone(s.lookups),[{id:'camera',label:'Camera model',slot:true,values:['arch','wren']}]);assert.equal(s.form.lookup,'camera');
 h.api.set('value','arch');assert.equal(h.calls.length,0,'typing a value calls nothing');
 await h.api.find();
 assert.deepEqual(h.calls,[{server:'Grafana',tool:'query_loki_logs',args:{datasourceUid:'loki-stg',logql:EXPANDED+FILTER,startRfc3339:'now-2h',endRfc3339:'now',limit:10,direction:'backward',queryType:'range'}}]);
 s=h.api.snapshot();assert.equal(s.busy,false);assert.equal(s.result.error,undefined);assert.equal(s.result.query,EXPANDED+FILTER);assert.equal(s.result.rows.length,10,'at most 10 lines are listed');
 assert.deepEqual(rows(h.api).slice(0,2),[['2026-11-07T09:42:13.123Z','arch',TRACE,SPAN,''],['2026-11-07T08:26:40.000Z','arch',OTHER,null,'']]);
 // Absolute Load trace bounds reach Loki unchanged; a missing environment variable calls nothing.
 const absolute=setup({lookback:{start:'2026-11-07T06:00:00Z',end:'2026-11-07T10:00:00.5Z',lookback:'2h'}});await settle();absolute.api.set('value','arch');await absolute.api.find();
 assert.equal(absolute.calls[0].args.startRfc3339,'2026-11-07T06:00:00Z');assert.equal(absolute.calls[0].args.endRfc3339,'2026-11-07T10:00:00.5Z');
 const unset=board();delete unset.tracking.telemetry.environments.stg.variables;const missing=setup({p:unset});await settle();missing.api.set('value','arch');assert.equal(await missing.api.find(),null);
 assert.equal(missing.calls.length,0);assert.match(missing.api.snapshot().result.error,/\$\{namespace\}/);
 // A value that could leave its LogQL string is refused before any call.
 h.api.set('value','arch" or "x');assert.equal(await h.api.find(),null);assert.equal(h.calls.length,1);assert.match(h.api.snapshot().result.error,/quotes/);
});

test('plan 3: the trace id is read from structured metadata or a label; a line without it says "This log line has no trace_id"',async()=>{
 const C=context(),fields={traceId:'trace_id',spanId:'span_id'};
 const parsed=C.telemetryLogLines({data:[entry(),entry({meta:null,labels:{env:'stg',trace_id:TRACE,span_id:SPAN}}),entry({meta:{cameraModel:'arch'}})]},fields);
 assert.deepEqual(clone(parsed.rows).map(r=>[r.traceId,r.spanId,r.missing]),[[TRACE,SPAN,''],[TRACE,SPAN,''],[null,null,'This log line has no trace_id']]);
 const named=C.telemetryLogLines({data:[entry({meta:{tid:TRACE,sid:SPAN}}),entry({meta:{}})]},{traceId:'tid',spanId:'sid'});
 assert.deepEqual(clone(named.rows).map(r=>[r.traceId,r.spanId,r.missing]),[[TRACE,SPAN,''],[null,null,'This log line has no tid']]);
 assert.throws(()=>C.telemetryLogLines({streams:[]},fields),/no log lines/);
 const h=setup({data:[entry({meta:{cameraModel:'arch'}})]});await settle();h.api.set('value','arch');h.api.set('traced',false);await h.api.find();
 assert.deepEqual(rows(h.api),[['2026-11-07T09:42:13.123Z','arch',null,null,'This log line has no trace_id']]);
});

test('plan 4: a reader-typed LogQL log query runs the same way',async()=>{
 const typed='{env="$env"} |= "Handling camera stats message" | cameraModel="wren"',h=setup({p:board({}),data:[entry({line:'Handling camera stats message model=wren'})]});await settle();
 let s=h.api.snapshot();assert.deepEqual(clone(s.lookups),[]);assert.equal(s.form.lookup,h.C.TELEMETRY_LOG_TYPED);
 h.api.set('logql',typed);await h.api.find();
 assert.deepEqual(h.calls,[{server:'Grafana',tool:'query_loki_logs',args:{datasourceUid:'loki-stg',logql:'{env="stg"} |= "Handling camera stats message" | cameraModel="wren"'+FILTER,startRfc3339:'now-2h',endRfc3339:'now',limit:10,direction:'backward',queryType:'range'}}]);
 assert.deepEqual(rows(h.api),[['2026-11-07T09:42:13.123Z','Handling camera stats message model=wren',TRACE,SPAN,'']]);
 const metric=setup({p:board({}),data:[{values:[{timestamp:'1794044533.000',value:3}],labels:{env:'stg'}}]});await settle();metric.api.set('logql','count_over_time({env="stg"}[5m])');await metric.api.find();
 assert.match(metric.api.snapshot().result.note,/metric query/);assert.equal(metric.calls[0].args.logql,'count_over_time({env="stg"}[5m])','#1158: a metric query gets no label filter');
 h.api.set('logql','');assert.equal(await h.api.find(),null);assert.equal(h.calls.length,1);
});

test('plan 5: malformed lookups fail with their field path',()=>{
 const C=context(),warnings=[],lookups={
  noQuery:{label:'No query'},noSlot:{label:'No slot',query:'{env="$env"} |= "x"',values:['arch']},badTrace:{label:'Bad trace field',query:QUERY,fields:{traceId:'trace-id'}},
  badSpan:{label:'Bad span field',query:QUERY,fields:{spanId:'1span'}},badValue:{label:'Bad value',query:QUERY,values:['a"b']},unknown:{label:'Unknown',query:QUERY,extra:true},good:{label:'Good',query:QUERY}};
 const parsed=C.trackingTelemetry({tracking:{telemetry:{lookups}}},(at,message)=>warnings.push(at));
 assert.deepEqual(Object.keys(parsed.lookups),['good']);assert.deepEqual(clone(parsed.lookups.good),{label:'Good',query:QUERY,fields:{traceId:'trace_id',spanId:'span_id'}});
 assert.deepEqual(warnings.sort(),['.lookups.badSpan.fields.spanId','.lookups.badTrace.fields.traceId','.lookups.badValue.values[0]','.lookups.noQuery.query','.lookups.noSlot.query','.lookups.unknown.extra']);
 const result=C.validate({tracking:{telemetry:{lookups}},sections:[{id:'s',diagram:{nodes:{a:{}},rows:[['a']]}}]});
 for(const at of ['noQuery.query','noSlot.query','badTrace.fields.traceId','badSpan.fields.spanId'])assert.ok(result.warnings.some(w=>w.startsWith('tracking.telemetry.lookups.'+at+':')),at);
 const shape=[];C.trackingTelemetry({tracking:{telemetry:{lookups:[]}}},at=>shape.push(at));assert.deepEqual(shape,['.lookups']);
});

test('plan 6: without a Grafana connector lookups are disabled with a message and call nothing',async()=>{
 const h=setup({servers:[DETAIL]});h.api.snapshot();await settle();
 const s=h.api.snapshot();assert.equal(s.available,false);assert.match(s.note,/Grafana connector with query_loki_logs/);
 h.api.set('value','arch');assert.equal(await h.api.find(),null);assert.equal(h.calls.length,0);
 const C=context(),native=C.createTelemetryLogLookup(board(),{describe(){},call(){}},{});assert.equal(native.snapshot().available,false);assert.match(native.snapshot().note,/Grafana connector/);
 assert.equal(C.createTelemetryLogLookup({tracking:{telemetry:{}}},null,{}).snapshot(),null,'a board without lookups has no log section');
});

test('review: a ${value} slot is filled like $value and never reported as a missing variable',async()=>{
 const braced=QUERY.replace('"$value"','"${value}"'),h=setup({p:board({camera:{label:'Camera model',query:braced,values:['arch']}})});await settle();
 assert.equal(h.api.snapshot().lookups[0].slot,true);h.api.set('value','arch');await h.api.find();
 assert.equal(h.api.snapshot().result.error,undefined);assert.deepEqual(h.calls.map(c=>c.args.logql),[EXPANDED+FILTER]);
 // Outside an authored slot query, ${value} is an unset variable: a typed query or a datasource is not sent with it.
 const typed=setup({p:board({camera:{label:'Camera model',query:braced,datasource:'loki-${value}'}})});await settle();typed.api.set('value','arch');assert.equal(await typed.api.find(),null);assert.match(typed.api.snapshot().result.error,/\$\{value\}/);
 typed.api.set('lookup',typed.C.TELEMETRY_LOG_TYPED);typed.api.set('logql','{env="$env"} | cameraModel="${value}"');assert.equal(await typed.api.find(),null);assert.match(typed.api.snapshot().result.error,/\$\{value\}/);assert.equal(typed.calls.length,0);
});

test('review: a non-object lookups value is ignored by the viewer as it is by inject',()=>{
 for(const lookups of [[],null,'camera',3]){
  const C=context(),warnings=[],p=board(lookups);
  assert.equal(C.trackingTelemetry(p,at=>warnings.push(at)).lookups,undefined,JSON.stringify(lookups));assert.deepEqual(warnings,['.lookups']);
  assert.equal(C.createTelemetryLogLookup(p,{logsConnector(){},queryLogs(){}},{}).snapshot(),null,'no log section for '+JSON.stringify(lookups));
 }
});

test('review: a Grafana call that never answers times out after 30 s and its late answer is ignored',async()=>{
 const pending=[];let release;const timers={setTimeout:(fn,ms)=>{pending.push({fn,ms});return pending.length;},clearTimeout:id=>{if(pending[id-1])pending[id-1].fn=null;}};
 const h=setup({C:context('standalone',timers),answer:()=>new Promise(resolve=>release=()=>resolve({content:[{type:'text',text:JSON.stringify({data:[entry()]})}]}))});
 h.api.set('value','arch');const found=h.api.find();await settle();
 assert.equal(h.calls.length,1);assert.equal(h.api.snapshot().busy,true);
 const timeout=pending.find(t=>t.ms===30000 && t.fn);assert.ok(timeout,'Find arms a 30 s timeout');timeout.fn();
 let s=h.api.snapshot();assert.equal(s.busy,false);assert.match(s.result.error,/timed out/);
 release();assert.equal(await found,null);await settle();s=h.api.snapshot();assert.match(s.result.error,/timed out/);assert.deepEqual(clone(s.result.rows),[]);
 // An answered Find clears its timer: firing a left-over one must not turn its lines into a timeout.
 const before=pending.length,again=h.api.find();await settle();const armed=pending.slice(before).find(t=>t.ms===30000);assert.ok(armed,'the second Find arms its own timeout');
 release();assert.equal(clone(await again).rows.length,1);if(armed.fn)armed.fn();
 s=h.api.snapshot();assert.equal(s.result.error,undefined);assert.equal(s.result.rows.length,1);assert.equal(armed.fn,null,'an answered Find clears its 30 s timer');
});

test('review: hex trace and span ids from a log line are lowercased',async()=>{
 const C=context(),out=C.telemetryLogLines({data:[entry({meta:{trace_id:TRACE.toUpperCase(),span_id:SPAN.toUpperCase()}})]},{traceId:'trace_id',spanId:'span_id'});
 assert.deepEqual([out.rows[0].traceId,out.rows[0].spanId],[TRACE,SPAN]);
});

test('#1141 with a selected day Find searches exactly that day; typed Lookback still wins; Live keeps now-2h',async()=>{
 const DAY={key:'2026-11-06',today:false,from:'2026-11-06T05:00:00.000Z',to:'2026-11-07T05:00:00.000Z',label:'Nov 6 00:00–24:00 local',short:'Nov 6'};
 let day=null;const h=setup({day:()=>day});await settle();h.api.set('value','arch');
 assert.equal(h.api.snapshot().search,'','Live names no day');await h.api.find();
 assert.deepEqual([h.calls[0].args.startRfc3339,h.calls[0].args.endRfc3339],['now-2h','now']);
 day=DAY;assert.equal(h.api.snapshot().search,'Loki · Nov 6 00:00–24:00 local');await h.api.find();
 assert.deepEqual(h.calls[1].args,{...h.calls[0].args,startRfc3339:DAY.from,endRfc3339:DAY.to},'the same call with the day as its window');
 const typed=setup({day:()=>DAY,lookback:{start:'-6h',end:'',lookback:'2h'}});await settle();typed.api.set('value','arch');
 assert.equal(typed.api.snapshot().search,'');await typed.api.find();assert.deepEqual([typed.calls[0].args.startRfc3339,typed.calls[0].args.endRfc3339],['now-6h','now'],'Trace start under Lookback wins');
 const empty=setup({day:()=>DAY,data:[]});await settle();empty.api.set('value','arch');await empty.api.find();
 assert.equal(empty.api.snapshot().result.note,'No log lines with a trace ID on Nov 6. Clear "Only lines with a trace ID" to see every line.');
 empty.api.set('traced',false);await empty.api.find();assert.equal(empty.api.snapshot().result.note,'No matching log lines on Nov 6.');
 // The day line shows only when the search can run.
 const C=context(),native=C.createTelemetryLogLookup(board(),{describe(){},call(){}},{day:()=>DAY});
 assert.equal(native.snapshot().available,false);assert.equal(native.snapshot().search,'','no day line above a disabled Find');
});

/* #1158: "Only lines with a trace ID", checked by default. Test names carry the ticket's test plan item. */
test('#1158 checked by default, Find appends the trace ID label filter: an authored lookup uses its fields.traceId, typed LogQL uses trace_id',async()=>{
 const custom=setup({p:board({camera:{label:'Camera model',query:QUERY,values:['arch'],fields:{traceId:'tid',spanId:'sid'}}}),data:[entry({meta:{cameraModel:'arch',tid:TRACE,sid:SPAN}})]});await settle();
 assert.equal(custom.api.snapshot().form.traced,true,'the checkbox starts checked');
 custom.api.set('value','arch');await custom.api.find();
 assert.deepEqual(custom.calls.map(c=>c.args.logql),[EXPANDED+'\n| tid =~ "[0-9a-fA-F]{16,32}"'],'the filter goes after the $value fill, on the lookup field');
 assert.equal(custom.api.snapshot().result.query,EXPANDED+'\n| tid =~ "[0-9a-fA-F]{16,32}"');assert.deepEqual(rows(custom.api),[['2026-11-07T09:42:13.123Z','arch',TRACE,SPAN,'']]);
 const typed=setup({p:board({})});await settle();typed.api.set('logql','{env="$env"} |= "Handling camera stats message"');await typed.api.find();
 assert.deepEqual(typed.calls.map(c=>c.args.logql),['{env="stg"} |= "Handling camera stats message"'+FILTER]);
});

test('#1158 unchecked, Find sends the query unchanged and lists every line',async()=>{
 const h=setup({data:[entry(),entry({meta:{cameraModel:'arch'}}),entry({meta:{cameraModel:'arch',trace_id:'not-a-trace-id'}})]});await settle();
 h.api.set('value','arch');h.api.set('traced',false);assert.equal(h.api.snapshot().form.traced,false);await h.api.find();
 assert.deepEqual(h.calls.map(c=>c.args.logql),[EXPANDED]);
 assert.deepEqual(rows(h.api).map(r=>[r[2],r[4]]),[[TRACE,''],[null,'This log line has no trace_id'],[null,'This log line\'s trace_id is not a trace ID']]);
});

test('#1158 checked, a returned line without a valid trace ID is not listed',async()=>{
 const h=setup({data:[entry({meta:{cameraModel:'arch'}}),entry({at:'1794040000000000000',meta:{cameraModel:'arch',trace_id:OTHER}}),entry({meta:{cameraModel:'arch',trace_id:'zz'.repeat(16)}}),entry()]});await settle();
 h.api.set('value','arch');await h.api.find();
 assert.deepEqual(rows(h.api).map(r=>r[2]),[OTHER,TRACE],'only lines with a trace ID, in Loki order');
 assert.equal(h.api.next(0),1,'the next line with a trace ID is the next listed line');
});

test('#1158 checked, an empty result gives the note naming the checkbox',async()=>{
 for(const data of [[],[entry({meta:{cameraModel:'arch'}})]]){
  const h=setup({data});await settle();h.api.set('value','arch');await h.api.find();
  const s=h.api.snapshot();assert.deepEqual(clone(s.result.rows),[]);
  assert.equal(s.result.note,'No log lines with a trace ID in the last 2h. Clear "Only lines with a trace ID" to see every line.',JSON.stringify(data));
 }
 const absolute=setup({data:[],lookback:{start:'2026-11-07T06:00:00Z',end:'2026-11-07T10:00:00Z',lookback:'2h'}});await settle();absolute.api.set('value','arch');await absolute.api.find();
 assert.equal(absolute.api.snapshot().result.note,'No log lines with a trace ID in the selected range. Clear "Only lines with a trace ID" to see every line.');
});

test('#1158 a trace ID field that is not a valid LogQL label name leaves the query unchanged and still hides lines without a trace ID',async()=>{
 // The board validator refuses such a name; replacing the parsed field reaches Find's own guard.
 const C=context(),parse=C.trackingTelemetry;
 C.trackingTelemetry=(page,invalid)=>{const out=parse(page,invalid);if(out.lookups && out.lookups.camera)out.lookups.camera.fields.traceId='trace.id';return out;};
 const h=setup({C,data:[entry({meta:{cameraModel:'arch','trace.id':TRACE}}),entry({meta:{cameraModel:'arch'}})]});await settle();
 h.api.set('value','arch');await h.api.find();
 assert.deepEqual(h.calls.map(c=>c.args.logql),[EXPANDED]);assert.deepEqual(rows(h.api).map(r=>r[2]),[TRACE]);
});

test('#1158 changing the checkbox clears the results and makes no call',async()=>{
 const h=setup();await settle();h.api.set('value','arch');await h.api.find();
 assert.equal(h.calls.length,1);assert.equal(h.api.snapshot().result.rows.length,1);
 const before=h.changes();h.api.set('traced',false);
 let s=h.api.snapshot();assert.equal(s.form.traced,false);assert.equal(s.result,null,'the results are cleared');assert.ok(h.changes()>before,'the panel repaints');
 h.api.set('traced',true);s=h.api.snapshot();assert.equal(s.form.traced,true);assert.equal(s.form.value,'arch','the typed value stays');
 await settle();assert.equal(h.calls.length,1,'the checkbox never runs Find');
 // The checkbox takes booleans only; the text fields still take strings only.
 h.api.set('traced','false');h.api.set('value',false);s=h.api.snapshot();assert.deepEqual([s.form.traced,s.form.value],[true,'arch']);
});

test('#1158 review: a query whose last line ends with a # comment still gets the filter, on its own line',async()=>{
 // LogQL reads # to the end of the line as a comment, so a filter on that line would be ignored.
 const typed=setup({p:board({})});await settle();typed.api.set('logql','{env="$env"} |= "Handling camera stats message" # newest first');await typed.api.find();
 const sent='{env="stg"} |= "Handling camera stats message" # newest first\n| trace_id =~ "[0-9a-fA-F]{16,32}"';
 assert.deepEqual(typed.calls.map(c=>c.args.logql),[sent]);assert.equal(typed.api.snapshot().result.query,sent);
 const authored=setup({p:board({camera:{label:'Camera model',query:QUERY+' # one camera model',values:['arch']}})});await settle();authored.api.set('value','arch');await authored.api.find();
 assert.deepEqual(authored.calls.map(c=>c.args.logql),[EXPANDED+' # one camera model\n| trace_id =~ "[0-9a-fA-F]{16,32}"']);
});

/* #1233 (plan 2): no fixed number of lookups; the per-field rules are unchanged. */
test('#1233 plan 2: telemetryLookups accepts 20 lookups without a count warning; per-field validation unchanged',()=>{
 const C=context(),warnings=[],lookups=Object.fromEntries(Array.from({length:20},(_,i)=>['search'+i,{label:'Search '+i,query:QUERY}]));
 lookups.noSlot={label:'No slot',query:'{env="$env"} |= "x"',values:['arch']};
 const parsed=C.trackingTelemetry({tracking:{telemetry:{lookups}}},(at,message)=>warnings.push(at+': '+message));
 assert.equal(Object.keys(parsed.lookups).length,20,'all 20 good lookups are kept');assert.equal(parsed.lookups.noSlot,undefined);
 assert.deepEqual(warnings,['.lookups.noSlot.query: has suggested values but no $value slot — lookup ignored']);
 const result=C.validate({tracking:{telemetry:{lookups}},sections:[{id:'s',diagram:{nodes:{a:{}},rows:[['a']]}}]});
 assert.ok(!result.warnings.some(w=>/at most \d+ lookups/.test(w)),'no count warning: '+result.warnings.join(' | '));
 assert.ok(result.warnings.some(w=>w.startsWith('tracking.telemetry.lookups.noSlot.query:')));
});
/* #1233: each search box keeps its own value; Find on a box runs that box's lookup; typing in one box leaves
   another box's results alone; the shared "Only lines with a trace ID" still clears them. */
test('#1233 each search keeps its own value and Find runs the box it is given',async()=>{
 const DEVICE='{env="$env"} |= "Handling camera stats message" | deviceId="$value"';
 const h=setup({p:board({camera:{label:'Camera model',query:QUERY,values:['arch','wren']},device:{label:'Search for my device ID',query:DEVICE}})});await settle();
 h.api.set('value','arch','camera');h.api.set('value','cam-7','device');assert.equal(h.calls.length,0);
 assert.deepEqual(clone(h.api.snapshot().form.values || null),{camera:'arch',device:'cam-7'},'each box keeps its own value');
 await h.api.find('device');
 assert.deepEqual(h.calls.map(c=>c.args.logql),['{env="stg"} |= "Handling camera stats message" | deviceId="cam-7"'+FILTER],'the second box runs its own query with its own value');
 let s=h.api.snapshot();assert.equal(s.result.lookup,'device');assert.equal(s.form.lookup,'device');
 h.api.set('value','wren','camera');assert.equal(h.api.snapshot().result.lookup,'device','typing in another box keeps these results');
 h.api.set('value','cam-8','device');assert.equal(h.api.snapshot().result,null,'typing in the box that ran clears its results');
 await h.api.find('camera');assert.equal(h.calls.at(-1).args.logql,EXPANDED.replace('"arch"','"wren"')+FILTER);assert.equal(h.api.snapshot().result.lookup,'camera');
 h.api.set('logql','{env="$env"}');assert.equal(h.api.snapshot().result.lookup,'camera','typing a LogQL query keeps an authored box\'s results');
 await h.api.find(h.C.TELEMETRY_LOG_TYPED);assert.equal(h.calls.at(-1).args.logql,'{env="stg"}'+FILTER);assert.equal(h.api.snapshot().result.lookup,h.C.TELEMETRY_LOG_TYPED);
 h.api.set('traced',false);assert.equal(h.api.snapshot().result,null,'the shared checkbox clears the results');
 assert.equal(await h.api.find('nope'),null,'an unknown box runs nothing new');
});
