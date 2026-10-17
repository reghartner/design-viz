'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os');
const {readSource}=require('../tools/source-loader.cjs');
const C=require('../tools/canon/core.cjs');
const context={FlowCanon:C,URL};vm.createContext(context);
for(const source of ['validator.js','library.workbench.js'])vm.runInContext(readSource(source),context);
const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/specs/doorbell.json')));
const manifest=()=>({version:1,diagrams:[{id:'doorbell',title:'Reviewed doorbell',spec:structuredClone(spec)}]});
test('reader handoff captures stable chapter, view, path and source step references',()=>{
  const stepper={mode:()=> 'step',paths:()=>[{id:'happy'},{id:'failure'}],path:()=> 'failure',ids:()=>['start','retry','done'],current:()=>({n:1,id:'retry'})};
  const ctl={activeTarget:{kind:'diagram',section:2},tabBlocks:[],sections:[
    {number:1,reference:'overview'},
    {number:2,reference:'delivery',presentation:{viewId:()=> 'flow'},stepper},
  ]};
  assert.deepEqual(JSON.parse(JSON.stringify(context.canonReaderTarget(ctl))),{d:'delivery',v:'flow',m:'step',p:'failure',s:'retry'});
  stepper.ids=()=>['start',null,'done'];
  assert.equal(context.canonReaderTarget(ctl).s,'2');
  ctl.views={current:()=>({id:'review-members',legacy:false})};
  assert.equal(context.canonReaderTarget(ctl).v,'review-members');
  ctl.views.current=()=>({id:'section-2-flow',legacy:true});
  assert.equal(context.canonReaderTarget(ctl).v,'flow');
  assert.equal(context.canonReaderTarget(null),null);
});
test('library parsing validates IDs and specs without changing the published snapshot',()=>{
  const raw=manifest(),before=JSON.stringify(raw);const entries=context.parseCanonLibrary(raw);
  assert.equal(entries[0].title,'Reviewed doorbell');assert.equal(JSON.stringify(raw),before);
  assert.equal(context.parseCanonLibrary({version:2,diagrams:[]}).length,0);
  for(const invalid of [null,{version:99,diagrams:[]},{version:1,diagrams:[{},{}]}])assert.throws(()=>context.parseCanonLibrary(invalid));
  const duplicate=manifest();duplicate.diagrams.push(duplicate.diagrams[0]);assert.throws(()=>context.parseCanonLibrary(duplicate),/unique ID/);
  const mismatch=manifest();mismatch.diagrams[0].id='wrong';assert.throws(()=>context.parseCanonLibrary(mismatch),/IDs differ/);
  const bad=manifest();bad.diagrams[0].spec.page.sections[0].diagram.edges.push({from:'missing',to:'also-missing'});assert.throws(()=>context.parseCanonLibrary(bad),/Invalid diagram/);
});
test('static publisher preserves canonical evidence and source files; browser accepts its output',async()=>{
  const {buildLibrary}=await import('../tools/canon/library.mjs');
  const registry=path.join(__dirname,'../examples/canon/registry.json'),before=fs.readFileSync(registry,'utf8');
  const result=await buildLibrary(registry);
  assert.equal(result.version,3);assert.equal(result.diagrams[0].spec,undefined);assert.deepEqual(result.diagrams[0].canon,spec.page.canon);
  assert.deepEqual(JSON.parse(JSON.stringify(context.canonLibrarySpec(spec,result.diagrams[0]))),spec);assert.equal(fs.readFileSync(registry,'utf8'),before);
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
  assert.ok(library.diagrams.every(d=>!Object.hasOwn(d,'spec')));
  assert.deepEqual(library.diagrams.map(d=>d.canon),[alpha.page.canon,zeta.page.canon]);
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
  assert.deepEqual(await buildLibraryFromDirectory(f.directory),{version:3,diagrams:[]});
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
  assert.deepEqual(JSON.parse(fs.readFileSync(output)),{version:3,diagrams:[]});
  f.write('nested/story.json',namedSpec('story'));await publishLibrary(options);fs.rmSync(file);await publishLibrary(options);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)),{version:3,diagrams:[]});
  await assert.rejects(publishLibrary({...options,output:path.join(f.directory,'manifest.json')}),/outside the diagram source directory/);
});

test('publisher CLI defaults to the company directory structure and retains explicit registry support',t=>{
  const {execFileSync,spawnSync}=require('node:child_process'),f=discoveryFixture(t);
  const cli=path.join(__dirname,'../tools/canon/library.mjs'),raw=namedSpec('company');f.write('feature/feature.spec.json',raw);
  const folder=path.join(f.root,'diagrams/company');fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'company.spec.json'),JSON.stringify(raw));
  fs.writeFileSync(path.join(f.root,'canon.json'),JSON.stringify({version:1,diagrams:[{folder:'diagrams/company',owner:raw.page.canon.owner}]}));
  execFileSync(process.execPath,[cli],{cwd:f.root});
  const generated=JSON.parse(fs.readFileSync(path.join(f.root,'workbench/diagrams.json')));
  assert.equal(generated.diagrams[0].specUrl,'../diagrams/company/company.spec.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'workbench',generated.diagrams[0].specUrl))),raw);
  assert.deepEqual(generated.diagrams[0].canon,raw.page.canon);
  const legacy=path.join(f.root,'legacy.json');execFileSync(process.execPath,[cli,'--registry',path.join(__dirname,'../examples/canon/registry.json'),'--out',legacy]);
  assert.deepEqual(JSON.parse(fs.readFileSync(legacy)).diagrams[0].canon,spec.page.canon);
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


test('published entries list several topology exports sorted by name, not in authoring order',async t=>{
  const {buildLibraryFromDirectory}=await import('../tools/canon/library.mjs');
  const f=discoveryFixture(t),provider=namedSpec('provider'),nodes=Object.keys(provider.page.sections[0].diagram.nodes);
  provider.page.sections[0].diagram.topologyExports={zeta:{nodes:[nodes[0]],edges:[]},alpha:{nodes:[nodes[1]],edges:[]}};
  f.write('provider.json',provider);
  assert.deepEqual((await buildLibraryFromDirectory(f.directory)).diagrams[0].exports,['alpha','zeta']);
});
test('version 2 and 3 indexes validate metadata and URLs without embedding or mutating source content',async()=>{
  const {buildLibrary}=await import('../tools/canon/library.mjs');
  const raw=await buildLibrary(path.join(__dirname,'../examples/canon/registry.json'));
  const entries=context.parseCanonLibrary(raw),entry=entries[0];
  assert.equal(context.parseCanonLibrary({...raw,version:2}).length,1);
  assert.throws(()=>context.parseCanonLibrary({...raw,diagrams:[{...raw.diagrams[0],revision:'bad'}]}),/revision/);
  assert.equal(entry.spec,undefined);assert.ok(entry.counts.nodes>0);assert.ok(entry.counts.steps>0);
  // #592: entries name their topology exports so pickers can list only real providers.
  assert.deepEqual(entry.exports,[]);
  assert.deepEqual(context.parseCanonLibrary({...raw,diagrams:[{...raw.diagrams[0],exports:['core',7,'edge']}]})[0].exports,['core','edge']);
  assert.equal(context.parseCanonLibrary({...raw,diagrams:[{...raw.diagrams[0],exports:undefined}]})[0].exports,undefined);
  const {buildLibraryFromDirectory}=await import('../tools/canon/library.mjs'),topology=path.join(__dirname,'../examples/canon/topology');
  const published=(await buildLibraryFromDirectory(topology)).diagrams;
  assert.deepEqual(published.find(item=>item.id==='platform').exports,['core']);
  assert.deepEqual(published.find(item=>item.id==='checkout').exports,[]);
  const original=structuredClone(spec);original.page.canon={id:'old',kind:'design'};
  const before=JSON.stringify(original),resolved=context.canonLibrarySpec(original,entry);
  assert.equal(resolved.page.canon.id,'doorbell');assert.equal(JSON.stringify(original),before);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved)),spec);
  for(const url of ['https://outside.test/spec.json','//outside.test/spec.json','/spec.json','data:text/plain,{}','javascript:alert(1)','a\\b.json','a.json?token=secret','a.json#hash','a.html']){
    const bad=structuredClone(raw);bad.diagrams[0].specUrl=url;assert.throws(()=>context.parseCanonLibrary(bad),/URL/);
  }
  for(const patch of [{canon:{...entry.canon,id:'other'}},{counts:{nodes:-1,steps:0,panels:0}},{canon:null}]){
    const bad=structuredClone(raw);Object.assign(bad.diagrams[0],patch);assert.throws(()=>context.parseCanonLibrary(bad));
  }
  assert.equal(context.canonLibrarySpecURL('../diagrams/a/a.spec.json','https://company.test/prefix/workbench/diagrams.json'),'https://company.test/prefix/diagrams/a/a.spec.json');
});

test('published URLs address authored sources with encoded filenames',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs'),{fileURLToPath,pathToFileURL}=require('node:url');
  const f=discoveryFixture(t),file=f.write('nested/a #1.json',namedSpec('encoded'));
  const output=path.join(f.root,'workbench/diagrams.json');
  const library=await publishLibrary({diagramsDir:f.directory,output});
  const url=library.diagrams[0].specUrl;
  assert.equal(url,'../docs/diagrams/nested/a%20%231.json');
  const published=fileURLToPath(new URL(url,pathToFileURL(output)));
  assert.equal(published,file);assert.deepEqual(JSON.parse(fs.readFileSync(published)),JSON.parse(fs.readFileSync(file)));
  assert.ok(!JSON.stringify(library).includes('rows'));assert.ok(!JSON.stringify(library).includes('codeRefs'));
});

// #583 — optional diagram description and tags (spec page level), validated,
// published to the v3 index and read back by the library.
// row | fixture | assertion (scoped) | rejects
// 1 valid accepted | doorbell spec + page.description + page.tags | validator findings and tools/validate.js output name no page.description/page.tags error | a validator that rejects the new optional fields
// 1b limits accepted | 200-char description; 12 tags incl. a 32-char tag and an inner-hyphen tag | no page.description/page.tags finding | off-by-one limits
// 2 invalid rejected, clear message | non-string, blank, multi-line, 201-char description; non-array, 13 tags, uppercase, spaced, 33-char, non-string, leading/trailing/double hyphen, duplicate tag | one finding per case, prefixed by its own path (page.description / page.tags / page.tags[i]) and naming the rule | silent acceptance, a generic message, or the wrong field blamed
// 3 CLI | spec file with a duplicate tag | tools/validate.js exits 1 and prints the page.tags[1] duplicate finding | a check only the browser runs
// 4 publish carries them | canon.json with one described+tagged and one plain diagram | described entry has exactly the authored description/tags; plain entry has neither key | publish dropping them, or writing empty placeholders
// 5 publish rejects invalid | described spec edited to an uppercase tag | publishLibrary rejects naming the file and page.tags[0]; the prior index bytes survive | publishing invalid metadata
// 6 older index loads | v3 index whose entries lack the keys | parseCanonLibrary yields description '' and tags [] without throwing | requiring the new keys
// 7 index read back | published v3 index; v1 manifest embedding a spec | parseCanonLibrary surfaces the authored description and tags | a reader that drops them
// 8 canon.json + Backstage unaffected | same canon.json through publish and loadCanonDiagrams (the Backstage snapshot adapter) | published canon equals canon.json membership (ID, owner); the snapshot loads both specs, keeps the authored description/tags in the served spec, and lists the described diagram under exactly the same Backstage entities as the identical plain one | metadata leaking into membership, or a Backstage path that rejects/strips the new fields
test('#583 diagram description and tags validate, publish to the index and load from older indexes',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs'),{spawnSync}=require('node:child_process');
  const findings=raw=>plain(context.validate(context.normalize(raw)).errors);
  const described=structuredClone(spec);described.page.description='Rings the hallway chime when a visitor arrives';described.page.tags=['hallway','alerts-v2'];
  assert.deepEqual(findings(described).filter(e=>/^page\.(description|tags)/.test(e)),[]);
  const withPage=patch=>{const raw=structuredClone(spec);Object.assign(raw.page,patch);return raw;};
  const limits=withPage({description:'d'.repeat(200),tags:['a'.repeat(32),'a-b-c',...Array.from({length:10},(_,i)=>'t'+i)]});
  assert.deepEqual(findings(limits).filter(e=>/^page\.(description|tags)/.test(e)),[]);
  for(const [patch,pattern] of [
    [{description:7},/^page\.description: .*text/],
    [{description:'   '},/^page\.description: .*empty/],
    [{description:'one\ntwo'},/^page\.description: .*one line/],
    [{description:'x'.repeat(201)},/^page\.description: .*200 characters.*201/],
    [{tags:'hallway'},/^page\.tags: .*list/],
    [{tags:Array.from({length:13},(_,i)=>'t'+i)},/^page\.tags: .*12 tags.*13/],
    [{tags:['ok','Upper']},/^page\.tags\[1\]: .*lowercase/],
    [{tags:['two words']},/^page\.tags\[0\]: .*lowercase/],
    [{tags:['a'.repeat(33)]},/^page\.tags\[0\]: .*32 characters/],
    [{tags:[5]},/^page\.tags\[0\]: .*lowercase/],
    [{tags:['-tag']},/^page\.tags\[0\]: .*hyphens/],
    [{tags:['tag-']},/^page\.tags\[0\]: .*hyphens/],
    [{tags:['a--b']},/^page\.tags\[0\]: .*hyphens/],
    [{tags:['alerts','hallway','alerts']},/^page\.tags\[2\]: duplicate tag "alerts"/],
  ]){
    const errors=findings(withPage(patch)).filter(e=>/^page\.(description|tags)/.test(e));
    assert.equal(errors.length,1,JSON.stringify(patch)+' → '+JSON.stringify(errors));assert.match(errors[0],pattern);
  }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-describe-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const cliFile=path.join(root,'duplicate.spec.json');fs.writeFileSync(cliFile,JSON.stringify(withPage({tags:['alerts','alerts']})));
  const cli=spawnSync(process.execPath,[path.join(__dirname,'../tools/validate.js'),'--quiet',cliFile],{encoding:'utf8'});
  assert.equal(cli.status,1);assert.match(cli.stdout,/page\.tags\[1\]: duplicate tag "alerts"/);
  const okFile=path.join(root,'ok.spec.json');fs.writeFileSync(okFile,JSON.stringify(described));
  const ok=spawnSync(process.execPath,[path.join(__dirname,'../tools/validate.js'),'--quiet',okFile],{encoding:'utf8'});
  assert.equal(ok.status,0,ok.stdout);assert.doesNotMatch(ok.stdout,/page\.(description|tags)/);
  const write=(id,raw)=>{const folder=path.join(root,'diagrams',id);fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,id+'.spec.json');const copy=structuredClone(raw);delete copy.page.canon;fs.writeFileSync(file,JSON.stringify(copy));return file;};
  const describedFile=write('described',described);write('plain',spec);
  fs.writeFileSync(path.join(root,'canon.json'),JSON.stringify({version:1,diagrams:['described','plain'].map(id=>({folder:'diagrams/'+id,owner:'group:default/home-team'}))}));
  const output=path.join(root,'workbench/diagrams.json'),options={registryPath:path.join(root,'canon.json'),output};
  const library=await publishLibrary(options),byId=Object.fromEntries(library.diagrams.map(d=>[d.id,d]));
  assert.equal(byId.described.description,'Rings the hallway chime when a visitor arrives');assert.deepEqual(byId.described.tags,['hallway','alerts-v2']);
  assert.equal(Object.hasOwn(byId.plain,'description'),false);assert.equal(Object.hasOwn(byId.plain,'tags'),false);
  const parsed=Object.fromEntries(context.parseCanonLibrary(JSON.parse(fs.readFileSync(output,'utf8'))).map(e=>[e.id,e]));
  assert.equal(parsed.described.description,'Rings the hallway chime when a visitor arrives');assert.deepEqual(plain(parsed.described.tags),['hallway','alerts-v2']);
  assert.equal(parsed.plain.description,'');assert.deepEqual(plain(parsed.plain.tags),[]);
  const before=fs.readFileSync(output,'utf8'),bad=JSON.parse(fs.readFileSync(describedFile,'utf8'));bad.page.tags=['Hallway'];fs.writeFileSync(describedFile,JSON.stringify(bad));
  await assert.rejects(publishLibrary(options),/described\.spec\.json.*page\.tags\[0\]/);assert.equal(fs.readFileSync(output,'utf8'),before);
  const legacy=JSON.parse(before);delete legacy.diagrams[0].description;delete legacy.diagrams[0].tags;
  for(const entry of context.parseCanonLibrary(legacy)){assert.equal(entry.description,'');assert.deepEqual(plain(entry.tags),[]);}
  for(const entry of library.diagrams)assert.deepEqual(entry.canon,{version:1,id:entry.id,kind:'canonical',owner:'group:default/home-team'});
  const good=JSON.parse(fs.readFileSync(describedFile,'utf8'));good.page.tags=['hallway','alerts-v2'];fs.writeFileSync(describedFile,JSON.stringify(good));
  const {loadCanonDiagrams}=await import('../tools/canon/library.mjs'),snapshot=await loadCanonDiagrams(path.join(root,'canon.json'),{publicBaseUrl:'https://flows.test'});
  assert.deepEqual(snapshot.specs.map(s=>s.page.canon.id).sort(),['described','plain']);
  const served=snapshot.loadSpec('described');assert.equal(served.page.description,'Rings the hallway chime when a visitor arrives');assert.deepEqual(served.page.tags,['hallway','alerts-v2']);
  const listed=id=>Object.keys(snapshot.index.entities).filter(ref=>snapshot.index.entities[ref].some(d=>d.id===id)).sort();
  assert.ok(listed('plain').length>0);assert.deepEqual(listed('described'),listed('plain'));
  const embedded=manifest();embedded.diagrams[0].spec=described;
  const v1=context.parseCanonLibrary(embedded)[0];assert.equal(v1.description,'Rings the hallway chime when a visitor arrives');assert.deepEqual(plain(v1.tags),['hallway','alerts-v2']);
});
function plain(value){return JSON.parse(JSON.stringify(value));}

// #583 row 9 — cross-document linking is unaffected by the metadata.
// row | fixture | assertion (scoped) | rejects
// 9a topology import | described+tagged provider exporting nodes/edges, described+tagged consumer importing it, both in canon.json | publish succeeds and indexes both with their own description/tags; the consumer's resolved diagram (C.materializeTopology) deep-equals resolution of the same specs without metadata | metadata breaking provider resolution or leaking into the consumer graph
// 9b document links | the consumer page with documentLinks.siteBaseUrl | documentReference and documentSiteURL equal those of the metadata-free page | metadata altering link identity or URLs
test('#583 description and tags leave shared topology imports and document links unchanged',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs');
  const make=meta=>{
    const spec=(id,d,extra)=>({page:{title:id,...(meta?{description:'About '+id,tags:[id,'shared']}:{}),...extra,sections:[{id:'delivery',diagram:d}]}});
    return [spec('provider',{nodes:{a:{title:'Dispatcher'},b:{title:'Push'}},rows:[['a','b']],edges:[{from:'a',to:'b',kind:'https'}],topologyExports:{channels:{nodes:['a','b'],edges:['a->b']}}}),
      spec('consumer',{topologyImports:[{spec:'provider',export:'channels',as:'notify'}],steps:[{id:'send',edge:'notify::a->notify::b'}]},{documentLinks:{siteBaseUrl:'https://flows.test/site/'}})];
  };
  const withCanon=specs=>specs.map(s=>{const c=structuredClone(s);c.page.canon={version:1,id:s.page.title,kind:'canonical',owner:'group:default/home-team'};return c;});
  const resolved=specs=>plain(C.materializeTopology(withCanon(specs))[1].page.sections[0].diagram);
  assert.deepEqual(resolved(make(true)),resolved(make(false)));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-describe-links-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const s of make(true)){const folder=path.join(root,'diagrams',s.page.title);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,s.page.title+'.spec.json'),JSON.stringify(s));}
  fs.writeFileSync(path.join(root,'canon.json'),JSON.stringify({version:1,diagrams:['provider','consumer'].map(id=>({folder:'diagrams/'+id,owner:'group:default/home-team'}))}));
  const library=await publishLibrary({registryPath:path.join(root,'canon.json'),output:path.join(root,'workbench/diagrams.json')});
  for(const id of ['provider','consumer']){const entry=library.diagrams.find(d=>d.id===id);assert.equal(entry.description,'About '+id);assert.deepEqual(entry.tags,[id,'shared']);}
  const [withMeta,without]=[make(true),make(false)].map(specs=>withCanon(specs)[1].page);
  assert.deepEqual(plain(context.documentReference(withMeta)),plain(context.documentReference(without)));
  const ref=plain(context.documentReference(withMeta));assert.equal(ref.spec,'consumer');
  assert.equal(context.documentSiteURL(withMeta.documentLinks.siteBaseUrl,{...ref,step:'send'}),context.documentSiteURL(without.documentLinks.siteBaseUrl,{...plain(context.documentReference(without)),step:'send'}));
});

// #608: thumbnails are bounded structured summaries, not source markup or a
// second renderer. Selection must respect opening View membership and layouts.
test('published previews select the authored opening View and visible diagram without mutating inputs',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs');
  const graph=title=>({nodes:{a:{title},b:{title:'Worker'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]});
  const raw={page:{title:'Views',canon:{version:1,id:'views',kind:'canonical',owner:'group:default/home'},sections:[
    {id:'other',heading:'Hidden from opening view',diagram:graph('PRIVATE')},
    {id:'intro',heading:'Introduction',text:'Start here'},
    {id:'chosen',heading:'Actual entry',diagram:graph('Chosen service')},
  ],views:[{id:'opening',name:'Overview',presentation:'standard',sections:['intro','chosen']},{id:'other',name:'Other',presentation:'standard',sections:['other']}],defaultView:'opening'}};
  const before=JSON.stringify(raw),preview=C.libraryPreview(raw);
  assert.equal(JSON.stringify(raw),before);assert.equal(preview.kind,'graph');assert.equal(preview.label,'Actual entry');assert.equal(preview.nodes[0].label,'Chosen service');assert.ok(!JSON.stringify(preview).includes('PRIVATE'));
  assert.deepEqual(C.libraryPreview(raw),preview);
  raw.page.views[0].sections=['chosen','other'];assert.equal(C.libraryPreview(raw).label,'Actual entry');
  const d=raw.page.sections[2].diagram;d.panels=[{id:'summary',type:'code',title:'Order processing',language:'text',code:'received'}];
  d.sectionLayout={default:[{x:0,y:0,w:12,h:8,hidden:true},{panel:'summary',x:0,y:0,w:12,h:8}]};
  const panels=C.libraryPreview(raw);assert.equal(panels.kind,'panels');assert.deepEqual(panels.panels,[{title:'Order processing',type:'code'}]);assert.ok(!JSON.stringify(panels).includes('Chosen service'));
  d.layouts=[{id:'hidden',name:'Panel view',sectionLayout:d.sectionLayout},{id:'graph',name:'Graph view',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}}];d.defaultLayout='graph';
  raw.page.views[0].sections=[{section:'chosen',layout:'hidden'}];assert.equal(C.libraryPreview(raw).kind,'panels');
  d.view='step';d.steps=[{id:'initial',panelVisibility:{summary:false}}];assert.equal(C.libraryPreview(raw),null);
  d.steps[0].panelVisibility.summary=true;d.panels[0].visible=false;assert.equal(C.libraryPreview(raw).kind,'panels');
  d.steps[0].panelVisibility={};assert.equal(C.libraryPreview(raw),null);
  d.view='ambient';assert.equal(C.libraryPreview(raw).kind,'panels');
  const legacy={page:{sections:[{heading:'Intro',text:'Welcome'},{heading:'Primary panel',diagram:{...graph('Not the opening view'),primaryPanel:'home',panels:[{id:'home',type:'homemap',title:'Home',outline:{w:280,h:160},rooms:[],devices:[],subjects:[]}],sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}}}]}};
  assert.equal(C.libraryPreview(legacy).kind,'panels');
  legacy.page.sections[1].diagram.layouts=[{id:'overview',name:'Overview',sectionLayout:{default:[{x:0,y:0,w:12,h:8}]}}];
  assert.equal(C.libraryPreview(legacy).kind,'graph');
  const tabs={page:{blocks:[{tabs:[{label:'Opening',sections:[{id:'prose',heading:'Start',text:'Read this'}]},{label:'Private',sections:[{diagram:graph('Inactive service')}]}]}]}};
  assert.equal(C.libraryPreview(tabs),null);
  tabs.page.blocks[0].tabs[0].sections.push({diagram:graph('Visible service')});assert.equal(C.libraryPreview(tabs).nodes[0].label,'Visible service');
  const f=discoveryFixture(t);f.write('preview.json',JSON.parse(before));
  const library=await publishLibrary({diagramsDir:f.directory,output:path.join(f.root,'workbench/diagrams.json')});
  assert.deepEqual(library.diagrams[0].preview,preview);assert.deepEqual(plain(context.parseCanonLibrary(library)[0].preview),preview);
});

test('large graph previews are bounded, deterministic and honest about truncation',()=>{
  const nodes=Object.fromEntries(Array.from({length:30},(_,i)=>['n'+i,{title:'Service '+i+' '+'.'.repeat(100)}]));
  const ids=Object.keys(nodes),raw={page:{sections:[{heading:'Large network',diagram:{nodes,rows:[ids],edges:ids.slice(1).map(id=>({from:'n0',to:id}))}}]}};
  const preview=C.libraryPreview(raw);assert.equal(preview.total,30);assert.equal(preview.nodes.length,12);assert.ok(preview.edges.length<=20);assert.ok(preview.nodes.every(n=>n.label.length<=80));
  assert.deepEqual(preview,C.libraryPreview(raw));assert.ok(Buffer.byteLength(JSON.stringify(preview))<4000);assert.ok(context.libraryPreviewData(preview));
  raw.page.sections[0].diagram.nodes=Object.fromEntries(Array.from({length:501},(_,i)=>['n'+i,{title:'Service'}]));assert.equal(C.libraryPreview(raw),null);
});

test('legacy and malformed optional previews fall back without breaking library membership',async()=>{
  const {buildLibrary}=await import('../tools/canon/library.mjs');const raw=await buildLibrary(path.join(__dirname,'../examples/canon/registry.json'));
  const good=C.libraryPreview({page:{sections:[{diagram:{nodes:{a:{title:'Service'}},rows:[['a']],edges:[]}}]}});assert.equal(good.kind,'graph');
  for(const preview of [undefined,null,{}, {...good,version:2},{...good,total:-1},{...good,nodes:Array(13).fill(good.nodes[0])},{...good,nodes:[{...good.nodes[0],x:Infinity}]},{...good,nodes:[{...good.nodes[0],label:'x'.repeat(81)}]},{...good,edges:[{from:0,to:900}]},{version:1,kind:'panels',label:'Panels',total:1,panels:[{title:[],type:'code'}]}]){
    const entry=context.parseCanonLibrary({...raw,diagrams:[{...raw.diagrams[0],preview}]})[0];assert.equal(entry.preview,null);assert.equal(entry.id,'doorbell');
  }
  const hostile=structuredClone(good);hostile.nodes[0].label='<img src=x onerror=alert(1)>';hostile.svg='<script>alert(1)</script>';
  const parsed=context.libraryPreviewData(hostile);assert.equal(parsed.nodes[0].label,hostile.nodes[0].label);assert.equal(parsed.svg,undefined);
  assert.equal(context.parseCanonLibrary(manifest())[0].preview,undefined);
  assert.equal(context.libraryTeamName('group:default/payments-platform'),'Payments Platform');assert.equal(context.libraryTeamName('group:europe/payments-platform'),'Payments Platform · europe');
});
