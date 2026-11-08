'use strict';
// #1095: company trace profiles are inherited only by boards that use traces.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const PROFILE=require('./fixtures/trace-connection-profile.json'),clone=x=>JSON.parse(JSON.stringify(x));
const PANEL={id:'status',type:'live-status',title:'Status'};
const SIGNALS={kind:'service',signals:{requests:{honeycomb:{calculations:[{op:'COUNT'}]}}}};
const MATCH={serviceName:'checkout',operation:'/cart/checkout'};
function context(){const C={URL,AbortController,TextEncoder,TextDecoder,console,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);C.TELEMETRY_COMPANY_TRACE_CONNECTIONS={operations:clone(PROFILE)};return C;}
function diagram(extra){return Object.assign({nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]},extra);}
function page(extra,d){return Object.assign({title:'Board',sections:[{id:'main',diagram:diagram(d)}]},extra);}
const NO_TRACES={
  'plain board':page({},{}),
  'Jira live-status board without telemetry':page({tracking:{jira:{site:'https://jira.test'}}},{nodes:{a:{title:'A',tickets:['ACME-1']},b:{title:'B'}},panels:[PANEL]}),
  'live-status panel without tracking':page({},{panels:[PANEL]}),
  'telemetry board without a live-status panel':page({tracking:{telemetry:{honeycomb:{environment:'prod',dataset:'api'}}}},{nodes:{a:{title:'A',telemetry:clone(SIGNALS)},b:{title:'B'}}}),
};
const USES_TRACES={
  'traceMatch step':page({},{steps:[{id:'checkout',nodes:['a'],traceMatch:clone(MATCH)}]}),
  'traceMatch step in a tab section':{title:'Tabs',blocks:[{tabs:[{label:'One',sections:[{id:'plain',diagram:diagram({})}]},{label:'Two',sections:[{id:'traced',diagram:diagram({steps:[{id:'checkout',nodes:['a'],traceMatch:clone(MATCH)}]})}]}]}]},
  'traceMatch step in a nested tab under a tab blocks key':{title:'Nested tabs',blocks:[{tabs:[{label:'Outer',blocks:[{id:'plain',diagram:diagram({})},{tabs:[{label:'Inner',sections:[{id:'traced',diagram:diagram({steps:[{id:'checkout',nodes:['a'],traceMatch:clone(MATCH)}]})}]}]}]}]}]},
  'live-status panel with page telemetry':page({tracking:{telemetry:{}}},{panels:[PANEL]}),
  'live-status panel with a node telemetry binding':page({},{nodes:{a:{title:'A',telemetry:clone(SIGNALS)},b:{title:'B'}},panels:[PANEL]}),
  'live-status panel with an edge telemetry binding':page({},{edges:[{from:'a',to:'b',telemetry:clone(SIGNALS)}],panels:[PANEL]}),
  'live-status panel with an imported carrier telemetry overlay':page({},{panels:[PANEL],topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{telemetry:clone(SIGNALS)}}}]}),
};

test('company profile + board that never uses traces resolves no trace connection anywhere',()=>{
  const C=context();
  for(const [name,p] of Object.entries(NO_TRACES)){
    const before=JSON.stringify(p);
    assert.deepEqual(clone(C.FlowTraceConnections.resolve(p,C.TELEMETRY_COMPANY_TRACE_CONNECTIONS)),{},name);
    assert.equal(C.trackingTelemetry(p).traceConnections,undefined,name+': trackingTelemetry');
    const direct=C.createTelemetryDirect(p,null);assert.equal(direct.snapshot().profiles.length,0,name+': Load trace form');direct.destroy();
    assert.equal(JSON.stringify(p),before,name+': source unchanged');
  }
});

test('company profile + board that uses traces inherits the profile as before',()=>{
  const C=context();
  for(const [name,p] of Object.entries(USES_TRACES)){
    assert.deepEqual(Object.keys(C.FlowTraceConnections.resolve(p,C.TELEMETRY_COMPANY_TRACE_CONNECTIONS)),['operations'],name);
    assert.equal(C.trackingTelemetry(p).traceConnections.operations.tool,'get_trace',name+': trackingTelemetry');
    const direct=C.createTelemetryDirect(p,null);assert.deepEqual(clone(direct.snapshot().profiles.map(x=>x.id)),['operations'],name+': Load trace form');direct.destroy();
  }
});

test('an explicit page map still selects on any board; {} and enabled:false still disable',()=>{
  const C=context(),company=C.TELEMETRY_COMPANY_TRACE_CONNECTIONS;
  for(const p of [...Object.values(NO_TRACES),...Object.values(USES_TRACES)].map(clone)){
    p.tracking=Object.assign({},p.tracking,{telemetry:Object.assign({},p.tracking && p.tracking.telemetry,{traceConnections:{reader:{profile:'operations',environments:{prod:{}}}}})});
    const selected=C.FlowTraceConnections.resolve(p,company);
    assert.deepEqual(Object.keys(selected),['reader']);assert.deepEqual(Object.keys(selected.reader.environments),['prod']);
    assert.deepEqual(Object.keys(C.trackingTelemetry(p).traceConnections),['reader']);
    p.tracking.telemetry.traceConnections={};
    assert.deepEqual(clone(C.FlowTraceConnections.resolve(p,company)),{});
  }
  for(const p of Object.values(USES_TRACES).map(clone)){
    p.tracking=Object.assign({},p.tracking,{telemetry:Object.assign({},p.tracking && p.tracking.telemetry,{enabled:false})});
    assert.deepEqual(clone(C.FlowTraceConnections.resolve(p,company)),{});
  }
});
