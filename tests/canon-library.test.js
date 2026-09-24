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

function discoveryFixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-discovery-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'docs/diagrams');fs.mkdirSync(directory,{recursive:true});
  return {root,directory,write(name,value){
    const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,JSON.stringify(value));return file;
  }};
}
function namedSpec(id,kind='canonical'){
  const raw=structuredClone(spec);raw.page.title='Story '+id;raw.page.canon.id=id;raw.page.canon.kind=kind;return raw;
}

test('directory discovery finds nested canon documents deterministically and preserves all evidence',async t=>{
  const {buildLibraryFromDirectory}=await import('../tools/canon/library.mjs');
  const f=discoveryFixture(t),alpha=namedSpec('alpha'),zeta=namedSpec('zeta','design');
  const z=f.write('z/deep/anything.json',zeta),a=f.write('a/alpha.spec.json',alpha);
  f.write('manifest.json',{pages:[{spec:'a/alpha.spec.json'}]});
  const ordinary=structuredClone(spec);delete ordinary.page.canon;f.write('unlisted.spec.json',ordinary);
  const before=[a,z].map(file=>fs.readFileSync(file,'utf8'));
  const library=await buildLibraryFromDirectory(f.directory);
  assert.deepEqual(library.diagrams.map(d=>d.id),['alpha','zeta']);
  assert.deepEqual(library.diagrams.map(d=>d.spec),[alpha,zeta]);
  assert.deepEqual([a,z].map(file=>fs.readFileSync(file,'utf8')),before);
  assert.deepEqual(await buildLibraryFromDirectory(f.directory),library);
  assert.equal(context.parseCanonLibrary(library).length,2);
});

test('discovery reports duplicate IDs, bad metadata, invalid graphs and malformed JSON with filenames',async t=>{
  const {buildLibraryFromDirectory}=await import('../tools/canon/library.mjs');
  const f=discoveryFixture(t);f.write('a.json',namedSpec('same'));const b=f.write('nested/b.json',namedSpec('same'));
  await assert.rejects(buildLibraryFromDirectory(f.directory),/Duplicate canon ID same:.*a\.json.*b\.json/);
  fs.rmSync(b);
  for(const canon of [null,{}, {version:1,id:'bad-owner',kind:'canonical',owner:'no-team-reference'}]){
    const invalid=namedSpec('bad');invalid.page.canon=canon;f.write('invalid.json',invalid);
    await assert.rejects(buildLibraryFromDirectory(f.directory),/invalid\.json/);
  }
  const invalid=namedSpec('bad-graph');invalid.page.sections[0].diagram.edges.push({from:'absent',to:'missing'});f.write('invalid.json',invalid);
  await assert.rejects(buildLibraryFromDirectory(f.directory),/Invalid diagram.*invalid\.json/);
  fs.writeFileSync(path.join(f.directory,'invalid.json'),'{');
  await assert.rejects(buildLibraryFromDirectory(f.directory),/invalid\.json/);
});

test('discovery ignores symlinks and fails explicitly for a missing source directory',async t=>{
  const {buildLibraryFromDirectory}=await import('../tools/canon/library.mjs');
  const f=discoveryFixture(t),external=path.join(f.root,'outside');fs.mkdirSync(external);
  fs.writeFileSync(path.join(external,'private.json'),JSON.stringify(namedSpec('outside')));
  fs.symlinkSync(external,path.join(f.directory,'linked-dir'),'dir');
  fs.symlinkSync(path.join(external,'private.json'),path.join(f.directory,'linked.json'));
  assert.deepEqual(await buildLibraryFromDirectory(f.directory),{version:1,diagrams:[]});
  await assert.rejects(buildLibraryFromDirectory(path.join(f.root,'typo')),/ENOENT/);
});

test('publishing follows additions, edits and removals and never replaces a good snapshot on errors',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs');
  const f=discoveryFixture(t),output=path.join(f.root,'workbench/diagrams.json'),options={diagramsDir:f.directory,output};
  const file=f.write('nested/story.json',namedSpec('story'));await publishLibrary(options);
  const initial=fs.readFileSync(output,'utf8');fs.writeFileSync(file,'{');
  await assert.rejects(publishLibrary(options),/story\.json/);assert.equal(fs.readFileSync(output,'utf8'),initial);
  const updated=namedSpec('story');updated.page.title='Updated story';fs.writeFileSync(file,JSON.stringify(updated));await publishLibrary(options);
  assert.equal(JSON.parse(fs.readFileSync(output)).diagrams[0].title,'Updated story');
  delete updated.page.canon;fs.writeFileSync(file,JSON.stringify(updated));await publishLibrary(options);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)),{version:1,diagrams:[]});
  f.write('nested/story.json',namedSpec('story'));await publishLibrary(options);fs.rmSync(file);await publishLibrary(options);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)),{version:1,diagrams:[]});
  await assert.rejects(publishLibrary({...options,output:path.join(f.directory,'manifest.json')}),/outside the diagram source directory/);
});

test('publisher CLI defaults to the company directory structure and retains explicit registry support',t=>{
  const {execFileSync,spawnSync}=require('node:child_process'),f=discoveryFixture(t);
  const cli=path.join(__dirname,'../tools/canon/library.mjs'),raw=namedSpec('company');f.write('feature/feature.spec.json',raw);
  execFileSync(process.execPath,[cli],{cwd:f.root});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'workbench/diagrams.json'))).diagrams[0].spec,raw);
  const legacy=path.join(f.root,'legacy.json');execFileSync(process.execPath,[cli,'--registry',path.join(__dirname,'../examples/canon/registry.json'),'--out',legacy]);
  assert.deepEqual(JSON.parse(fs.readFileSync(legacy)).diagrams[0].spec,spec);
  for(const args of [['--registry'],['--diagrams','docs/diagrams','--registry','registry.json'],['--out','a','--out','b'],['__proto__']]){
    assert.notEqual(spawnSync(process.execPath,[cli,...args],{cwd:f.root}).status,0);
  }
});

test('output aliases cannot overwrite discovered specs or an explicit registry source',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs');
  const f=discoveryFixture(t),file=f.write('story.json',namedSpec('story')),before=fs.readFileSync(file,'utf8');
  const alias=path.join(f.root,'alias');fs.symlinkSync(f.directory,alias,'dir');
  for(const options of [
    {diagramsDir:alias,output:file},
    {diagramsDir:f.directory,output:path.join(alias,'story.json')},
    {diagramsDir:f.directory,output:path.join(alias,'not-created-yet/library.json')},
  ]){
    await assert.rejects(publishLibrary(options),/outside the diagram source directory/);
    assert.equal(fs.readFileSync(file,'utf8'),before);
  }
  const registryFile=path.join(f.directory,'registry.json');
  fs.writeFileSync(registryFile,JSON.stringify({version:1,diagrams:[{id:'story',path:'story.json'}]}));
  const registryBefore=fs.readFileSync(registryFile,'utf8');
  await assert.rejects(publishLibrary({registryPath:registryFile,output:path.join(alias,'story.json')}),/overwrite a source spec/);
  await assert.rejects(publishLibrary({registryPath:registryFile,output:path.join(alias,'registry.json')}),/overwrite the source registry/);
  assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(fs.readFileSync(registryFile,'utf8'),registryBefore);
});
