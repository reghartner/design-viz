'use strict';
// #1197: Honeycomb get_trace returns no span attributes. A Honeycomb trace profile
// that lists allowedAttributes (and names its dataset) makes one run_query call
// after get_trace, for the loaded trace ID, and joins the attributes onto spans
// by span id. The example-trace path applies the same allowed list.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const fixture=require('./fixtures/trace-connection-profile.json');
// Recorded get_trace answer: the 19 fixed columns, no attribute column.
const recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8');
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0',X_SPAN='b01a8fd7791f709b',Y_SPAN='3b8c2e88761b259e';
const clone=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
// SYNTHETIC run_query raw rows for the trace: the event-type attribute per span id.
const ATTRIBUTE_ROWS=['# Raw Rows','','| trace.span_id | device.model |','| --- | --- |',`| ${X_SPAN} | X |`,`| ${Y_SPAN} | Y |`,'| dbd662d250034c44 |  |'].join('\n');
const RUN_QUERY={name:'run_query',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:'string'},query_spec:{type:'object'},raw_row_columns:{type:'array',items:{type:'string'}},results_limit:{type:'integer'}},required:['environment_slug','query_spec']}};
const GET_TRACE={name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},additionalProperties:false}};
function context(now,timers){
  class Clock extends Date{static now(){return now===undefined?super.now():Date.parse(now);}}
  const C={URL,AbortController,TextEncoder,TextDecoder,console,setTimeout:timers?timers.set:setTimeout,clearTimeout:timers?timers.clear:clearTimeout,Date:now===undefined?Date:Clock,document:{hidden:false,addEventListener(){},removeEventListener(){}}};
  vm.runInNewContext(entrypoint('standalone').body,C);return C;
}
function profile(allowed=['device.model']){const p=clone(fixture);if(allowed){p.allowedAttributes=allowed;p.dataset='events';}return p;}
function page(p){
  return {tracking:{telemetry:{traceConnections:{company:p}}},sections:[{id:'one',diagram:{nodes:{catalog:{}},rows:[['catalog']],steps:[
    {id:'lookup',text:'Look up the product for device model X',traceMatch:{serviceName:'productcatalog',operation:'msdemo.ProductCatalogService/GetProduct',nodeId:'catalog',attributes:{'device.model':'X'}}}
  ]}}]};
}
function bridge(server,answers,runQuery=RUN_QUERY){
  const calls=[];
  const mcp={calls,
    listTools:async()=>[{server,tools:[{name:GET_TRACE.name,annotations:GET_TRACE.annotations},{name:RUN_QUERY.name,annotations:RUN_QUERY.annotations}]}],
    describeTool:async(s,name)=>clone(name==='run_query'?runQuery:GET_TRACE),
    callTool:async(s,name,args)=>{calls.push({server:s,name,args:clone(args)});return answers(name,args);}};
  return {mcp,win:{claude:{use:async n=>n==='permissions'?{request:async keys=>Object.fromEntries(keys.map(k=>[k,'granted']))}:mcp}}};
}
async function load(C,p,answers=(name)=>({payload:name==='get_trace'?recorded:ATTRIBUTE_ROWS}),verify=false,runQuery){
  const {mcp,win}=bridge(fixture.server,answers,runQuery);
  const adapter=C.createTelemetryProviders(p,win),api=C.createTelemetryDirect(p,adapter.options.directTrace,{sections:()=>[{id:'one',label:'Diagram'}]});
  api.set('environment','prod');api.set('input',ID);
  const e=await api.load(verify),report=api.snapshot().report;api.destroy();
  return {e,report,calls:mcp.calls};
}
const status=(C,p,e)=>C.telemetryTraceModel(p.sections[0].diagram,undefined,e).rows.find(r=>r.id==='lookup');

test('1. allowedAttributes: Load makes exactly one run_query after get_trace and the step maps only the X span',async()=>{
  const C=context(),p=page(profile());
  const {e,report,calls}=await load(C,p);
  assert.ok(e,'trace loads: '+JSON.stringify(report));
  assert.deepEqual(calls.map(c=>c.name),['get_trace','run_query']);
  assert.deepEqual(calls[1].args,{environment_slug:'production',dataset_slug:'events',query_spec:{filters:[{column:'trace.trace_id',op:'=',value:ID}],from:'-2h'},raw_row_columns:['trace.span_id','device.model'],results_limit:200});
  assert.equal(e.spans.find(s=>s.id===X_SPAN).attributes['device.model'],'X');
  assert.equal(e.spans.find(s=>s.id===Y_SPAN).attributes['device.model'],'Y');
  const row=status(C,p,e);assert.equal(row.status,'matched');assert.deepEqual(clone(row.spanIds),[X_SPAN]);
});

test('2. without allowedAttributes: no extra call, the attribute is absent and the step is missing',async()=>{
  const C=context(),p=page(profile(null));
  const {e,calls}=await load(C,p);
  assert.ok(e);
  assert.deepEqual(calls.map(c=>c.name),['get_trace']);
  assert.equal(e.spans.find(s=>s.id===X_SPAN).attributes['device.model'],undefined);
  assert.equal(status(C,p,e).status,'missing');
});

test('3. Verify makes the same single extra call',async()=>{
  const C=context(),p=page(profile());
  const {e,calls}=await load(C,p,undefined,true);
  assert.ok(e);
  assert.deepEqual(calls.map(c=>c.name),['get_trace','run_query']);
  assert.equal(status(C,p,e).status,'matched');
});

test('4. a failed or truncated attribute query still loads the trace and names what is missing',async()=>{
  for(const [label,answer] of [
    ['error result',()=>({isError:true,content:[{type:'text',text:'dataset not found'}]})],
    ['thrown',()=>{throw Object.assign(new Error('boom'),{code:'tool_error'});}],
    ['unsupported table',()=>({payload:'no table here'})],
  ]){
    const C=context(),p=page(profile());
    const {e,report,calls}=await load(C,p,name=>name==='get_trace'?{payload:recorded}:answer());
    assert.ok(e,label+': trace loads: '+JSON.stringify(report));
    assert.deepEqual(calls.map(c=>c.name),['get_trace','run_query'],label);
    assert.equal(e.spans.length,55,label);
    assert.ok(e.warnings.some(w=>/device\.model/.test(w) && /not loaded/i.test(w)),label+': '+JSON.stringify(e.warnings));
    assert.equal(status(C,p,e).status,'missing',label);
  }
  // A full page of rows may be cut off: the trace keeps the rows it got and says so.
  const C=context(),p=page(profile());
  const rows=Array.from({length:200},(_,i)=>`| ${i.toString(16).padStart(16,'0')} | Z |`);
  const full=['# Raw Rows','','| trace.span_id | device.model |','| --- | --- |',`| ${X_SPAN} | X |`,...rows.slice(1)].join('\n');
  const {e}=await load(C,p,name=>({payload:name==='get_trace'?recorded:full}));
  assert.equal(e.spans.find(s=>s.id===X_SPAN).attributes['device.model'],'X');
  assert.ok(e.warnings.some(w=>/200/.test(w) && /device\.model/.test(w)),JSON.stringify(e.warnings));
});

test('5. profile schema: dataset is a Honeycomb dataset name; the validator no longer warns that Honeycomb returns no attributes',()=>{
  const C=context(),F=C.FlowTraceConnections;
  assert.equal(F.profile(profile()).dataset,'events');
  const tempo={...clone(fixture),provider:'tempo',adapter:'tempo-v1',tool:'get_tempo_trace',dataset:'events'};assert.throws(()=>F.profile(tempo),/dataset/);
  for(const bad of ['',7,'x'.repeat(201)]){const p=profile();p.dataset=bad;assert.throws(()=>F.profile(p),/dataset/);}
  const plain=clone(fixture);assert.equal(F.profile(plain).dataset,undefined);
  const warn=p=>clone(C.validate(p).warnings.filter(w=>/traceMatch\.attributes/.test(w)));
  assert.deepEqual(warn(page(profile())),[]);
  const numeric=page(profile());numeric.sections[0].diagram.steps[0].traceMatch.attributes['device.model']=7;
  assert.deepEqual(warn(numeric),['steps.lookup.traceMatch.attributes.device.model: Honeycomb table cells are text; a number value never matches']);
});

// Example-trace path (Trace view samples from an authored trace signal).
const CANDIDATES=['# Raw Rows','','| timestamp | trace.trace_id |','| --- | --- |',`| 2026-10-29T23:00:00Z | ${ID} |`].join('\n');
const wrapper={honeycomb:{query_spec:{filters:[{column:'service.name',op:'=',value:'productcatalog'}]},raw_row_columns:['trace.trace_id'],results_limit:5}};
function examplePage(signal,connections){
  return {tracking:{telemetry:{honeycomb:{environment:'flowview-demo',dataset:'doorbell'},grafana:{tempo:'tempo-main'},...(connections?{traceConnections:connections}:{})}},sections:[{id:'main',diagram:{nodes:{a:{telemetry:{kind:'service',signals:{trace:signal}}}},rows:[['a']]}}]};
}
async function example(raw,mcp){
  const C=context('2026-10-30T00:00:00Z'),p=C.normalize(raw),win={claude:{use:async n=>n==='permissions'?{request:async keys=>Object.fromEntries(keys.map(k=>[k,'granted']))}:mcp}};
  const adapter=C.createTelemetryProviders(p,win);
  const api=C.createTelemetry(p,adapter.options,{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram||{};Object.keys(d.nodes||{}).forEach(id=>fn(d.nodes[id],id,p));})});
  const handle=adapter.attach({telemetry:api,liveStatus:{onDestroy:()=>()=>{}}},p);await settle();
  api.setEnabled(true);await settle();const s=api.snapshot();handle.destroy();api.destroy();return s;
}
function honeycombExampleBridge(){
  const calls=[];
  return {calls,
    listTools:async()=>[{server:'Honeycomb',tools:[RUN_QUERY,GET_TRACE]}],
    describeTool:async(s,name)=>clone(name==='run_query'?RUN_QUERY:GET_TRACE),
    callTool:async(server,name,args)=>{calls.push({server,name,args:clone(args)});
      if(name==='get_trace')return {payload:recorded};
      return {payload:args.raw_row_columns[0]==='trace.span_id'?ATTRIBUTE_ROWS:CANDIDATES};}};
}

test('6. example traces (Honeycomb): a page profile listing the attribute adds one run_query for the chosen trace',async()=>{
  const listed=profile(),mcp=honeycombExampleBridge();
  const s=await example(examplePage(wrapper,{company:listed}),mcp);
  const e=s.map.a && s.map.a.exemplars && s.map.a.exemplars[0];
  assert.ok(e,JSON.stringify(s.status));
  assert.deepEqual(mcp.calls.map(c=>c.name),['run_query','get_trace','run_query']);
  const extra=mcp.calls[2].args;
  assert.deepEqual(extra.raw_row_columns,['trace.span_id','device.model']);
  assert.deepEqual(extra.query_spec.filters,[{column:'trace.trace_id',op:'=',value:ID}]);
  assert.equal(extra.environment_slug,'flowview-demo');assert.equal(extra.dataset_slug,'doorbell');assert.equal(extra.query_spec.from,'-24h');
  assert.equal(e.spans.find(x=>x.id===X_SPAN).attributes['device.model'],'X');
  // Without a listing profile: no extra call, no attribute.
  const bare=honeycombExampleBridge(),plain=await example(examplePage(wrapper,{company:clone(fixture)}),bare);
  assert.deepEqual(bare.calls.map(c=>c.name),['run_query','get_trace']);
  assert.equal(plain.map.a.exemplars[0].spans.find(x=>x.id===X_SPAN).attributes['device.model'],undefined);
  // #1205: a listing profile without a dataset cannot fetch attributes, so it adds no call.
  const noDataset=profile();delete noDataset.dataset;
  const skipped=honeycombExampleBridge();await example(examplePage(wrapper,{company:noDataset}),skipped);
  assert.deepEqual(skipped.calls.map(c=>c.name),['run_query','get_trace']);
});

test('7. example traces (Tempo): the page Tempo profile allowed list keeps the span attribute',async()=>{
  const TEMPO={version:1,label:'Company Tempo',provider:'tempo',server:'Grafana',tool:'get_tempo_trace',readOnly:true,adapter:'tempo-v1',arguments:{traceId:'trace_id',start:'start',end:'end'},time:{encoding:'iso8601',type:'string',defaultLookback:'2h'},literals:{datasourceUid:'tempo-main'},environments:{prod:{}},links:[]};
  const search={name:'search_tempo_traces',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{datasourceUid:{type:'string'},query:{type:'string'},start:{type:'string'},end:{type:'string'},limit:{type:'integer'},spss:{type:'integer'}}}};
  const detail={name:'get_tempo_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{datasourceUid:{type:'string'},trace_id:{type:'string'},start:{type:'string'},end:{type:'string'}}}};
  const run=async connections=>{
    const calls=[],mcp={calls,listTools:async()=>[{server:'Grafana',tools:[search,detail]}],describeTool:async(s,n)=>clone(n===search.name?search:detail),
      callTool:async(server,name,args)=>{calls.push({name,args:clone(args)});
        if(name==='search_tempo_traces')return {payload:{traces:[{traceID:ID,startTimeMs:1761778800000,durationMs:5}]}};
        return {payload:{traceId:ID,spans:[{id:X_SPAN,parentId:null,serviceName:'consumer',name:'consume',startTimeMs:1761778800000,durationMs:5,attributes:{'device.model':'X','debug.payload':'body'}}]}};}};
    const s=await example(examplePage({tempo:'{ resource.service.name = "consumer" }'},connections),mcp);
    assert.ok(s.map.a && s.map.a.exemplars,JSON.stringify(s.status));
    return {span:s.map.a.exemplars[0].spans[0],calls};
  };
  const listed=clone(TEMPO);listed.allowedAttributes=['device.model'];
  const kept=await run({tempo:listed});
  assert.equal(kept.span.attributes['device.model'],'X');
  assert.equal(kept.span.attributes['debug.payload'],undefined);
  assert.deepEqual(kept.calls.map(c=>c.name),['search_tempo_traces','get_tempo_trace']);
  const dropped=await run({tempo:clone(TEMPO)});
  assert.equal(dropped.span.attributes['device.model'],undefined);
});

test('8. a Honeycomb profile with allowedAttributes but no dataset still resolves: the validator warns, Load skips the extra query and names the missing attributes',async()=>{
  const C=context(),missing=profile();delete missing.dataset;
  assert.equal(C.FlowTraceConnections.profile(missing).dataset,undefined);
  const p=page(missing);
  assert.deepEqual(clone(C.FlowCanon.validate(p).filter(m=>/traceMatch|dataset/.test(m))),[]);
  assert.deepEqual(clone(C.validate(p).warnings.filter(w=>/dataset/.test(w))),['tracking.telemetry.traceConnections.company: allowedAttributes on a Honeycomb profile need `dataset` to fetch span attributes; without it they stay Not observed']);
  assert.deepEqual(clone(C.validate(page(profile())).warnings.filter(w=>/dataset/.test(w))),[]);
  const {e,report,calls}=await load(C,p);
  assert.ok(e,'trace loads: '+JSON.stringify(report));
  assert.deepEqual(calls.map(c=>c.name),['get_trace']);
  assert.equal(e.spans.length,55);
  assert.ok(e.warnings.some(w=>/device\.model/.test(w) && /dataset/.test(w)),JSON.stringify(e.warnings));
  assert.equal(status(C,p,e).status,'missing');
});

test('9. a slow run_query times out on its own: the loaded trace stays, only the attributes are missing',async()=>{
  const pending=new Map();let serial=0;
  const timers={set:(fn,ms)=>{pending.set(++serial,{fn,ms});return serial;},clear:id=>pending.delete(id)};
  const C=context(undefined,timers),p=page(profile());
  const {mcp,win}=bridge(fixture.server,name=>name==='get_trace'?{payload:recorded}:new Promise(()=>{}));
  const adapter=C.createTelemetryProviders(p,win),api=C.createTelemetryDirect(p,adapter.options.directTrace,{sections:()=>[{id:'one',label:'Diagram'}]});
  api.set('environment','prod');api.set('input',ID);
  const loading=api.load(false);await settle();
  assert.deepEqual(mcp.calls.map(c=>c.name),['get_trace','run_query']);
  assert.equal(pending.size,1,'only the attribute deadline is pending');
  const [[,timer]]=[...pending];assert.ok(timer.ms>0 && timer.ms<=30000,String(timer.ms));
  pending.clear();timer.fn();
  const e=await loading,report=api.snapshot().report;api.destroy();
  assert.ok(e,'trace kept: '+JSON.stringify(report));
  assert.equal(report.stage,'complete');assert.equal(e.spans.length,55);
  assert.ok(e.warnings.some(w=>/device\.model/.test(w) && /run_query timed out/.test(w)),JSON.stringify(e.warnings));
  assert.equal(status(C,p,e).status,'missing');
});

test('10. span ids join on the exact get_trace string; ids that match no span warn',async()=>{
  const C=context(),p=page(profile());
  const other=['# Raw Rows','','| trace.span_id | device.model |','| --- | --- |','| not-a-span | X |'].join('\n');
  const {e}=await load(C,p,name=>({payload:name==='get_trace'?recorded:other}));
  assert.ok(e.warnings.some(w=>/device\.model/.test(w) && /span_id/.test(w)),JSON.stringify(e.warnings));
  assert.equal(status(C,p,e).status,'missing');
  // A non-hex provider span id still joins when the strings are equal.
  const rows=['# Raw Rows','','| trace.span_id | device.model |','| --- | --- |','| span-x | X |'].join('\n');
  const joined=C.telemetryHoneycombTrace({payload:recorded},ID,['device.model']).spans.map(sp=>({...sp,id:sp.id===X_SPAN?'span-x':sp.id}));
  assert.deepEqual(clone(C.telemetryTraceAttributeJoin(joined,{payload:rows},['device.model'])),[]);
  assert.equal(joined.find(sp=>sp.id==='span-x').attributes['device.model'],'X');
});

test('11. profile literals and context reach run_query where its schema names them',async()=>{
  const schema=clone(RUN_QUERY);schema.inputSchema.properties.team_slug={type:'string'};
  const C=context(),p=page(profile());
  const {calls}=await load(C,p,undefined,false,schema);
  assert.equal(calls[1].args.team_slug,'example-team');
  assert.equal(calls[1].args.view_mode,undefined,'a get_trace literal the run_query schema does not name is not sent');
  // An environment supplied as a literal (no environment argument mapping).
  const literal=profile();delete literal.arguments.environment;literal.literals={...literal.literals,environment_slug:'production'};
  for(const id of Object.keys(literal.environments)){delete literal.environments[id].value;}
  const q=await load(C,page(literal),undefined,false,schema);
  assert.equal(q.calls[1].args.environment_slug,'production');
});
