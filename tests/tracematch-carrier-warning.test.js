'use strict';
// #1096: traceMatch is read only from steps. A traceMatch on a node or an edge
// is ignored by matching, so the validator warns (never errors) and names it.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../tools/canon/core.cjs');

const match={serviceName:'api',operation:'POST /orders'};
const local=()=>({nodes:{api:{title:'API'},db:{title:'DB'}},rows:[['api','db']],edges:[{from:'api',to:'db'}],
  steps:[{id:'write',edge:'api->db'}]});
const carrierWarnings=result=>result.warnings.filter(w=>/traceMatch/.test(w));

test('traceMatch on a local node warns with the node id and points to the step',()=>{
  const d=local();d.nodes.api.traceMatch=match;
  const result=C.validateSpec(d);
  assert.deepEqual(result.errors,[]);
  const found=carrierWarnings(result);
  assert.equal(found.length,1,JSON.stringify(result.warnings));
  assert.match(found[0],/nodes\.api\.traceMatch/);
  assert.match(found[0],/read only from steps/);
  assert.match(found[0],/node api is ignored/);
  assert.match(found[0],/step/);
});

test('traceMatch on a local edge warns with the edge id and points to the step',()=>{
  const d=local();d.edges[0].traceMatch=match;
  const result=C.validateSpec(d);
  assert.deepEqual(result.errors,[]);
  const found=carrierWarnings(result);
  assert.equal(found.length,1,JSON.stringify(result.warnings));
  assert.match(found[0],/edges\[0\]\.traceMatch/);
  assert.match(found[0],/edge api->db is ignored/);
});

test('traceMatch on an exported provider node warns at the provider build, not again on its imported copies',()=>{
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/orders'},sections:[{id:'flow',diagram:d}]}});
  const provider=local();provider.nodes.api.traceMatch=match;provider.edges[0].traceMatch=match;
  provider.topologyExports={core:{nodes:['api','db'],edges:['api->db']}};
  const consumer=c=>spec(c,{nodes:{web:{title:'Web',traceMatch:match}},rows:[['web']],
    edges:[{from:'web',to:'orders::api',traceMatch:match}],topologyImports:[{spec:'orders',export:'core',as:'orders'}],
    steps:[{id:'call',edge:'orders::api->orders::db'}]});
  const resolved=C.materializeTopology([spec('orders',provider),consumer('shop'),consumer('admin')]);
  const providerFound=carrierWarnings(C.validateSpec(resolved[0]));
  assert.equal(providerFound.length,2,JSON.stringify(providerFound));
  assert.ok(providerFound.some(w=>/node api is ignored/.test(w)));
  assert.ok(providerFound.some(w=>/edge api->db is ignored/.test(w)));
  for(const imported of resolved.slice(1)){
    const d=imported.page.sections[0].diagram;
    assert.ok(d.nodes['orders::api'].traceMatch,'the imported node still carries the provider value');
    assert.ok(d.edges.find(e=>e.from==='orders::api').traceMatch,'the imported edge still carries the provider value');
    const result=C.validateSpec(imported);
    assert.deepEqual(result.errors,[]);
    const found=carrierWarnings(result);
    assert.equal(found.length,2,JSON.stringify(found));
    assert.ok(found.some(w=>/nodes\.web\.traceMatch/.test(w) && /node web is ignored/.test(w)));
    assert.ok(found.some(w=>/edges\[0\]\.traceMatch/.test(w) && /edge web->orders::api is ignored/.test(w)));
  }
});

test('traceMatch on a step does not warn',()=>{
  const d=local();d.steps[0].traceMatch=match;
  const result=C.validateSpec(d);
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(carrierWarnings(result),[]);
});
