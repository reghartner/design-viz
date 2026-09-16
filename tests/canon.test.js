'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../tools/canon/core.cjs');
const eq=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),b);
const fixture=()=>JSON.parse(fs.readFileSync('examples/canon/specs/doorbell.json'));
const registry=()=>C.catalog(JSON.parse(fs.readFileSync('examples/canon/catalog.json')));
test('fictional canonical flow validates and indexes all stable step references',()=>{
  eq(C.validate(fixture()),[]);
  assert.equal(C.references(fixture()).length,3);
  eq(C.references(fixture()).map(r=>r.targetId),['detect','upload','notify']);
});
test('catalog operations are bound only to the owning API and retain portable snapshots',()=>{
  const r=registry(), before=JSON.stringify(r),b=C.binding(r,'component:default/recording-service','api:default/recording-service','createRecording');
  assert.equal(b.api.path,'/recordings');assert.equal(b.telemetry.serviceName,'recording-service');
  assert.throws(()=>C.binding(r,b.entityRef,'api:default/porch-hub'),/belong/);
  assert.throws(()=>C.binding(r,b.entityRef,b.api.entityRef,'unknown'),/belong/);
  b.api.endpoints.development='changed';assert.equal(JSON.stringify(r),before);
});
test('references relocate after unrelated lines move and ambiguous anchors require repair',()=>{
  const a={start:'// begin',end:'// end'},body='// begin\nrun();\n// end';
  eq(C.locate('unrelated\n'+body,a),{startLine:2,endLine:4,text:body});
  assert.match(C.locate(body+'\n'+body,a).error,/ambiguous/);
  assert.ok(C.locate('// begin\nmissing end',a).error);
});
test('immutable source links reject credentials, javascript URLs, traversal and moving branches',()=>{
  const ref=C.references(fixture())[0].reference;
  assert.match(C.codeUrl(ref),/\/blob\/1{40}\/src\/porch-hub.js#L2-L6$/);
  for(const patch of [{repository:'javascript:alert(1)'},{repository:'https://user:secret@example.test/repo'},{revision:'main'},{path:'../secret'},{path:'/etc/passwd'}]) assert.equal(C.codeUrl({...ref,...patch}),null);
});
test('conflicting identities, missing step IDs and malformed reference lists are surfaced',()=>{
  const spec=fixture(),steps=C.sections(spec)[0].diagram.steps;
  steps[2].codeRefs[0].id=steps[1].codeRefs[0].id;
  assert.match(C.validate(spec).join(' '),/conflicting/);
  delete steps[1].id;assert.match(C.validate(spec).join(' '),/stable IDs/);
  steps[1].codeRefs={};assert.match(C.validate(spec).join(' '),/expected an array/);
});
test('HLD specs and incomplete editor input remain compatible',()=>{
  eq(C.validate({page:{sections:[]}}),[]);
  eq(C.validate({page:{blocks:'bad'}}),[]);
  eq(C.links({binding:{catalogUrl:'javascript:bad',api:{endpoints:{prod:'data:bad'}}}}),[]);
});
