'use strict';
// #1079: traceMatch.attributes may use attributes the trace connection profile allows.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const fixture=require('./fixtures/trace-connection-profile.json'),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8');
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0',clone=x=>JSON.parse(JSON.stringify(x));
const X_SPAN='b01a8fd7791f709b',Y_SPAN='3b8c2e88761b259e';
function context(name='standalone'){const C={URL,AbortController,TextEncoder,TextDecoder,console,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint(name).body,C);return C;}
// SYNTHETIC: Honeycomb get_trace returns a fixed 19 columns and no span
// attributes (company report 2026-11-07). This variant adds a device.model
// column only to exercise the retention path. Two productcatalog GetProduct server spans
// carry X and Y; the rest are blank.
function withDeviceModel(text){
  return text.split('\n').map(line=>{
    if(/\|\s*is_collapsed\s*\|\s*$/.test(line))return line+' device.model |';
    if(/^\s*\|(?:\s*-+\s*\|)+\s*$/.test(line))return line+' --- |';
    if(!/^\s*\|/.test(line))return line;
    const value=line.includes('| '+X_SPAN+' |')?'X':line.includes('| '+Y_SPAN+' |')?'Y':'';
    return line+' '+value+' |';
  }).join('\n');
}
function tool(){return {name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},additionalProperties:false}};}
const TEMPO={version:1,label:'Company Tempo',provider:'tempo',server:'Company Grafana',tool:'get_tempo_trace',readOnly:true,adapter:'tempo-v1',arguments:{traceId:'trace_id',start:'start',end:'end'},time:{encoding:'iso8601',type:'string',defaultLookback:'2h'},literals:{datasourceUid:'tempo-main'},environments:{prod:{}},links:[]};
function page(profile,connections={company:profile}){
  return {tracking:{telemetry:{traceConnections:connections}},sections:[{id:'one',diagram:{nodes:{catalog:{}},rows:[['catalog']],steps:[
    {id:'lookup',text:'Look up the product for device model X',traceMatch:{serviceName:'productcatalog',operation:'msdemo.ProductCatalogService/GetProduct',nodeId:'catalog',attributes:{'device.model':'X'}}}
  ]}}]};
}
async function load(C,p){
  const mcp={listTools:async()=>[{server:fixture.server,tools:[tool()]}],describeTool:async()=>tool(),callTool:async()=>({payload:withDeviceModel(recorded)})};
  const win={claude:{use:async n=>n==='permissions'?{request:async keys=>Object.fromEntries(keys.map(k=>[k,'granted']))}:mcp}};
  const adapter=C.createTelemetryProviders(p,win),api=C.createTelemetryDirect(p,adapter.options.directTrace,{sections:()=>[{id:'one',label:'Diagram'}]});
  api.set('environment','prod');api.set('input',ID);
  const e=await api.load(false);api.destroy();
  assert.ok(e,'trace loads: '+JSON.stringify(api.snapshot().report));
  return e;
}
const attributeErrors=(C,p)=>clone(C.FlowCanon.validate(p).filter(m=>/traceMatch/.test(m)));

test('1. profile lists device.model: the step maps only the span carrying X',async()=>{
  const C=context(),profile=clone(fixture);profile.allowedAttributes=['device.model'];
  const p=page(profile);
  assert.deepEqual(attributeErrors(C,p),[]);
  const e=await load(C,p);
  assert.equal(e.spans.find(s=>s.id===X_SPAN).attributes['device.model'],'X');
  assert.equal(e.spans.find(s=>s.id===Y_SPAN).attributes['device.model'],'Y');
  const model=C.telemetryTraceModel(p.sections[0].diagram,undefined,e),row=model.rows.find(r=>r.id==='lookup');
  assert.equal(row.status,'matched');
  assert.deepEqual(clone(row.spanIds),[X_SPAN]);
  // Values match exactly, as for built-in attributes.
  const other=clone(p);other.sections[0].diagram.steps[0].traceMatch.attributes['device.model']='x';
  assert.equal(C.telemetryTraceModel(other.sections[0].diagram,undefined,e).rows[0].status,'missing');
  // Tempo span attributes are retained the same way.
  const tempo={traceId:ID,spans:[{id:'aaaaaaaaaaaaaaaa',parentId:null,serviceName:'consumer',name:'consume',startTimeMs:1791779586602,durationMs:3,attributes:{'device.model':'X','debug.payload':'secret body'}}]};
  const parsed=C.telemetryTempoTrace({payload:tempo},ID,['device.model']).spans[0];
  assert.equal(parsed.attributes['device.model'],'X');
  assert.equal(parsed.attributes['debug.payload'],undefined);
});

test('2. without the profile listing, device.model keeps today\'s result: rejected by validation and not retained for matching',async()=>{
  const C=context(),p=page(clone(fixture));
  assert.deepEqual(attributeErrors(C,p),['traceMatch.attributes: use supported operational attributes only']);
  const e=await load(C,p);
  assert.equal(e.spans.find(s=>s.id===X_SPAN).attributes['device.model'],undefined);
  assert.equal(C.telemetryTraceModel(p.sections[0].diagram,undefined,e).rows.find(r=>r.id==='lookup').status,'missing');
  // A different profile's listing does not allow an unrelated attribute.
  const listed=clone(fixture);listed.allowedAttributes=['routing.key'];
  assert.deepEqual(attributeErrors(C,page(listed)),['traceMatch.attributes: use supported operational attributes only']);
});

test('3. profile schema: allowedAttributes must be an array of non-empty strings; malformed fails with its field path',()=>{
  const F=context('backend').FlowTraceConnections,good=clone(fixture);good.allowedAttributes=['device.model','messaging.rabbitmq.destination.routing_key'];
  assert.deepEqual(clone(F.profile(good).allowedAttributes),['device.model','messaging.rabbitmq.destination.routing_key']);
  for(const [value,path] of [['device.model',/allowedAttributes/],[{0:'device.model'},/allowedAttributes/],[['device.model',''],/allowedAttributes\[1\]/],[[7],/allowedAttributes\[0\]/],[['device.model',null],/allowedAttributes\[1\]/]]){
    const bad=clone(fixture);bad.allowedAttributes=value;
    assert.throws(()=>F.profile(bad),path,JSON.stringify(value));
  }
  // Credential-shaped names are rejected; ordinary names that contain the letters are not.
  for(const k of ['session.id','user.jwt','db.pwd','aws.access_key','http.auth','tls.private_key','client.passwd','http.bearer'])
    {const bad=clone(fixture);bad.allowedAttributes=[k];assert.throws(()=>F.profile(bad),/allowedAttributes\[0\]/,k);}
  const author=clone(fixture);author.allowedAttributes=['document.author'];assert.deepEqual(clone(F.profile(author).allowedAttributes),['document.author']);
  // The board-level path names the connection and the field.
  const bad=clone(fixture);bad.allowedAttributes=['ok',''];const errors=[];
  assert.deepEqual(clone(F.resolve({tracking:{telemetry:{traceConnections:{company:bad}}}},{},(at,m)=>errors.push(at+' '+m))),{});
  assert.match(errors.join('\n'),/\.traceConnections\.company .*allowedAttributes\[1\]/);
});

test('validation warns when only Honeycomb connections list the attribute, and when a Honeycomb-only attribute uses a non-string value',()=>{
  const C=context(),honeycomb=clone(fixture);honeycomb.allowedAttributes=['device.model'];
  const warn=p=>clone(C.validate(p).warnings.filter(w=>/traceMatch\.attributes/.test(w)));
  const only=page(honeycomb);
  assert.deepEqual(attributeErrors(C,only),[]);
  assert.deepEqual(warn(only),['steps.lookup.traceMatch.attributes.device.model: only Honeycomb connections list this attribute; Honeycomb get_trace does not return span attributes, so this step shows Not observed']);
  const numeric=page(honeycomb);numeric.sections[0].diagram.steps[0].traceMatch.attributes['device.model']=7;
  assert.deepEqual(warn(numeric).map(w=>w.replace(/^.*?: /,'')),['only Honeycomb connections list this attribute; Honeycomb get_trace does not return span attributes, so this step shows Not observed','Honeycomb table cells are text; a number value never matches']);
  const tempo=clone(TEMPO);tempo.allowedAttributes=['device.model'];
  const mixed=page(null,{company:honeycomb,tempo});
  assert.deepEqual(attributeErrors(C,mixed),[]);
  assert.deepEqual(warn(mixed),[]);
});

test('paused telemetry (enabled:false) still validates profile-allowed attributes',()=>{
  const C=context(),profile=clone(fixture);profile.allowedAttributes=['device.model'];
  const p=page(profile);p.tracking.telemetry.enabled=false;
  assert.deepEqual(attributeErrors(C,p),[]);
});

test('company-level profile allowedAttributes feed validation, inherited or referenced by the board',()=>{
  const C=context('backend'),acme=clone(TEMPO);acme.allowedAttributes=['device.model'];
  C.TELEMETRY_COMPANY_TRACE_CONNECTIONS={acme};
  const inherited=page(null);delete inherited.tracking;
  assert.deepEqual(attributeErrors(C,inherited),[]);
  assert.deepEqual(attributeErrors(C,page(null,{chosen:{profile:'acme'}})),[]);
  C.TELEMETRY_COMPANY_TRACE_CONNECTIONS={acme:TEMPO};
  assert.deepEqual(attributeErrors(C,inherited),['traceMatch.attributes: use supported operational attributes only']);
});
