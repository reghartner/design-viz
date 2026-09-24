'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os');
const {readSource}=require('../tools/source-loader.cjs');
const C=require('../tools/canon/core.cjs');
const context={FlowCanon:C};vm.createContext(context);
for(const source of ['validator.js','library.workbench.js'])vm.runInContext(readSource(source),context);
const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/specs/doorbell.json')));
const manifest=()=>({version:1,diagrams:[{id:'doorbell',title:'Reviewed doorbell',spec:structuredClone(spec)}]});
test('library parsing validates IDs and specs without changing the published snapshot',()=>{
  const raw=manifest(),before=JSON.stringify(raw);const entries=context.parseCanonLibrary(raw);
  assert.equal(entries[0].title,'Reviewed doorbell');assert.equal(JSON.stringify(raw),before);
  assert.equal(context.parseCanonLibrary({version:1,diagrams:[]}).length,0);
  for(const invalid of [null,{version:2,diagrams:[]},{version:1,diagrams:[{},{}]}])assert.throws(()=>context.parseCanonLibrary(invalid));
  const duplicate=manifest();duplicate.diagrams.push(duplicate.diagrams[0]);assert.throws(()=>context.parseCanonLibrary(duplicate),/unique ID/);
  const mismatch=manifest();mismatch.diagrams[0].id='wrong';assert.throws(()=>context.parseCanonLibrary(mismatch),/IDs differ/);
  const bad=manifest();bad.diagrams[0].spec.page.sections[0].diagram.edges.push({from:'missing',to:'also-missing'});assert.throws(()=>context.parseCanonLibrary(bad),/Invalid diagram/);
});
test('static publisher preserves canonical evidence and source files; browser accepts its output',async()=>{
  const {buildLibrary}=await import('../tools/canon/library.mjs');
  const registry=path.join(__dirname,'../examples/canon/registry.json'),before=fs.readFileSync(registry,'utf8');
  const result=await buildLibrary(registry);
  assert.deepEqual(result.diagrams[0].spec,spec);assert.equal(fs.readFileSync(registry,'utf8'),before);
  assert.equal(context.parseCanonLibrary(result).length,1);assert.equal(Object.hasOwn(result.diagrams[0],'path'),false);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-library-'));
  try{
    const bad=structuredClone(spec);bad.page.sections[0].diagram.edges.push({from:'missing',to:'also-missing'});
    fs.writeFileSync(path.join(dir,'spec.json'),JSON.stringify(bad));fs.writeFileSync(path.join(dir,'registry.json'),JSON.stringify({version:1,diagrams:[{id:'doorbell',path:'spec.json'}]}));
    await assert.rejects(buildLibrary(path.join(dir,'registry.json')),/Invalid diagram/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
