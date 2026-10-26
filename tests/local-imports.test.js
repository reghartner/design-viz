'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function specs(){
  const make=(title,diagram)=>({page:{title,sections:[{id:'main',diagram}]}});
  return {
    base:make('Base',{nodes:{api:{title:'Shared API'}},rows:[['api']],topologyExports:{core:{nodes:['api'],edges:[]}}}),
    middle:make('Middle',{topologyImports:[{spec:'base',export:'core',as:'base'}],topologyExports:{core:{nodes:['base::api'],edges:[]}}}),
    consumer:make('Consumer',{topologyImports:[{spec:'middle',export:'core',as:'shared',position:{x:100,y:120}}]})
  };
}
async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'flowview-local-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const inputs=specs(),entries=Object.keys(inputs).map(id=>({folder:'diagrams/team/'+id,owner:'group:default/test'}));
  entries.push({folder:'diagrams/unrelated',owner:'group:default/test'});
  await fs.writeFile(path.join(root,'canon.json'),JSON.stringify({version:1,diagrams:entries}));
  for(const [id,raw] of Object.entries(inputs)){await fs.mkdir(path.join(root,'diagrams/team',id),{recursive:true});await fs.writeFile(path.join(root,'diagrams/team',id,id+'.spec.json'),JSON.stringify(raw));}
  function handle(base){return {name:path.basename(base),async *values(){for(const file of await fs.readdir(base,{withFileTypes:true}))yield {name:file.name,kind:file.isDirectory()?'directory':'file'};},
    async getDirectoryHandle(name){const next=path.join(base,name);try{await fs.stat(next);}catch(e){throw Object.assign(e,{name:'NotFoundError'});}return handle(next);},
    async getFileHandle(name){const next=path.join(base,name);let stat;try{stat=await fs.stat(next);}catch(e){throw Object.assign(e,{name:'NotFoundError'});}if(!stat.isFile())throw Object.assign(Error('Not a file'),{name:'TypeMismatchError'});return {async getFile(){const text=await fs.readFile(next,'utf8');return {size:Buffer.byteLength(text),text:async()=>text};}};}};}
  const ctx=vm.createContext({TextEncoder});
  for(const file of ['validator.js','canon.js','../tools/canon/manifest.cjs','workbench/folder-agent.js','workbench/local-repository.js','workbench/agent-project.js'])vm.runInContext(readSource(file),ctx);
  return {root,inputs,ctx,handle:handle(root),consumer:path.join(root,'diagrams/team/consumer/consumer.spec.json')};
}
test('CLI and browser resolve the same registered transitive closure without touching authored source or unrelated entries',async t=>{
  const h=await setup(t),before=await fs.readFile(h.consumer,'utf8');
  const {resolveLocalImports}=await import('../tools/canon/local-imports.mjs');
  const result=await resolveLocalImports(h.consumer,h.root);
  assert.equal(result.id,'consumer');assert.deepEqual(result.specs.map(s=>s.page.canon.id),['base','middle','consumer']);
  assert.equal(result.resolved.page.sections[0].diagram.nodes['shared::base::api'].title,'Shared API');
  const choices=await h.ctx.openFolderAgentProject(h.handle);assert.equal(choices.selectionRequired,true);
  const found=await h.ctx.openFolderAgentProject(h.handle,'diagrams/team/consumer/consumer.spec.json');
  assert.equal(found.directory.name,'consumer');assert.equal(found.source,before);
  assert.deepEqual(JSON.parse(JSON.stringify(found.topologyContext.specs)),result.specs);
  assert.equal(await fs.readFile(h.consumer,'utf8'),before);
  await assert.rejects(fs.stat(path.join(h.root,'diagrams/team/consumer/.flowview-agent')),/ENOENT/);
  // Filesystem changes cannot mutate a captured, persistable context.
  await fs.writeFile(path.join(h.root,'diagrams/team/base/base.spec.json'),'{}');
  const resolved=h.ctx.FlowTopology.resolveSource(JSON.parse(before),JSON.parse(JSON.stringify(found.topologyContext)));
  assert.equal(resolved.page.sections[0].diagram.nodes['shared::base::api'].title,'Shared API');
});
test('missing IDs and cycles fail before folder metadata creation',async t=>{
  for(const dependency of ['missing','consumer']){
    const h=await setup(t);h.inputs.base.page.sections[0].diagram.topologyImports=[{spec:dependency,export:'core',as:'bad'}];
    await fs.writeFile(path.join(h.root,'diagrams/team/base/base.spec.json'),JSON.stringify(h.inputs.base));
    const {resolveLocalImports}=await import('../tools/canon/local-imports.mjs');
    await assert.rejects(resolveLocalImports(h.consumer,h.root),/missing spec|cycle/);
    await assert.rejects(h.ctx.openFolderAgentProject(h.handle,'diagrams/team/consumer/consumer.spec.json'),/missing spec|cycle/);
    await assert.rejects(fs.stat(path.join(h.root,'diagrams/team/consumer/.flowview-agent')),/ENOENT/);
  }
});
test('nested-folder import diagnostic explains the required root grant',async t=>{
  const h=await setup(t);h.ctx.authoredTopologyDependencies=raw=>h.ctx.FlowTopology.dependencies(raw);
  assert.throws(()=>h.ctx.prepareLocalFolderTopology(JSON.stringify(h.inputs.consumer),{},null),/Choose the repository root.*Browsers cannot read a parent/);
});
test('explicit registries retain their identity contract and reject escaped provider paths',async t=>{
  const h=await setup(t),{resolveLocalImports}=await import('../tools/canon/local-imports.mjs');
  const entries=Object.keys(h.inputs).map(id=>({id,path:'diagrams/team/'+id+'/'+id+'.spec.json'}));
  const registry=path.join(h.root,'registry.json');await fs.writeFile(registry,JSON.stringify({version:1,diagrams:entries}));
  await assert.rejects(resolveLocalImports(h.consumer,registry),/Registry and spec IDs differ/);
  for(const [id,raw] of Object.entries(h.inputs)){raw.page.canon={version:1,id,kind:'canonical',owner:'group:default/local'};await fs.writeFile(path.join(h.root,entries.find(e=>e.id===id).path),JSON.stringify(raw));}
  assert.equal((await resolveLocalImports(h.consumer,registry)).resolved.page.canon.id,'consumer');
  entries.find(e=>e.id==='base').path='../outside.spec.json';await fs.writeFile(registry,JSON.stringify({version:1,diagrams:entries}));
  await assert.rejects(resolveLocalImports(h.consumer,registry),/path escapes its root/);
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'flowview-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.writeFile(path.join(outside,'base.json'),JSON.stringify(h.inputs.base));
  const provider=path.join(h.root,'diagrams/team/base/base.spec.json');await fs.rm(provider);await fs.symlink(path.join(outside,'base.json'),provider);
  await assert.rejects(resolveLocalImports(h.consumer,h.root),/spec escapes its root/);
});
test('empty registry and directory named canon.json preserve ordinary folders; malformed registries and oversize files fail clearly',async t=>{
  const h=await setup(t);await fs.writeFile(path.join(h.root,'ordinary.spec.json'),'{}');
  const manifest=path.join(h.root,'canon.json');
  await fs.writeFile(manifest,JSON.stringify({version:1,diagrams:[]}));
  assert.equal((await h.ctx.openFolderAgentProject(h.handle)).spec,'ordinary.spec.json');
  await fs.rm(manifest);await fs.mkdir(manifest);
  assert.equal((await h.ctx.openFolderAgentProject(h.handle)).spec,'ordinary.spec.json');
  await fs.rm(manifest,{recursive:true});
  for(const raw of ['{broken','[]','{"version":2,"diagrams":[]}']){
    await fs.writeFile(manifest,raw);await assert.rejects(h.ctx.openFolderAgentProject(h.handle),/Invalid local canon.json:.*Repair the registry/);
  }
  let textRead=false;
  await assert.rejects(h.ctx.openLocalRepositoryFolder({getFileHandle:async()=>({getFile:async()=>({size:4*1024*1024+1,text:async()=>{textRead=true;return '{}';}})})}),/4 MiB registry limit/);
  assert.equal(textRead,false);
});
test('ordinary folder opening reuses approved frozen contexts and refuses missing local providers without network',async t=>{
  const h=await setup(t),found=await h.ctx.openFolderAgentProject(h.handle,'diagrams/team/consumer/consumer.spec.json');
  vm.runInContext(readSource('library.workbench.js'),h.ctx);
  let fetches=0;h.ctx.connectTopologyRepository=async()=>{fetches++;throw Error('Unexpected network');};
  for(const local of [true,false]){
    const context={...JSON.parse(JSON.stringify(found.topologyContext)),local};
    const prepared=await h.ctx.prepareLocalFolderTopology(found.source,{},context);
    const resolved=h.ctx.FlowTopology.resolveSource(JSON.parse(found.source),prepared);
    assert.equal(resolved.page.sections[0].diagram.nodes['shared::base::api'].title,'Shared API');
    assert.equal(prepared.specs.find(s=>s.page.canon.id==='base').page.sections[0].diagram.nodes.api.title,'Shared API');
  }
  const context=JSON.parse(JSON.stringify(found.topologyContext));context.specs=context.specs.filter(s=>s.page.canon.id!=='middle');
  assert.throws(()=>h.ctx.prepareLocalFolderTopology(found.source,{},context),/Choose the repository root/);assert.equal(fetches,0);
});
test('unreadable unrelated entries do not block a valid closure; unreadable providers retain their filesystem error',async t=>{
  for(const failure of ['ENOTDIR','ELOOP']){
    const h=await setup(t),{resolveLocalImports}=await import('../tools/canon/local-imports.mjs');
    const unrelated=path.join(h.root,'diagrams/unrelated');
    if(failure==='ENOTDIR')await fs.writeFile(unrelated,'file');
    else{await fs.mkdir(unrelated);const file=path.join(unrelated,'unrelated.spec.json');await fs.symlink(file,file);}
    assert.equal((await resolveLocalImports(h.consumer,h.root)).id,'consumer');
    const provider=path.join(h.root,'diagrams/team/base');await fs.rm(provider,{recursive:true});
    if(failure==='ENOTDIR')await fs.writeFile(provider,'file');
    else{await fs.mkdir(provider);const file=path.join(provider,'base.spec.json');await fs.symlink(file,file);}
    await assert.rejects(resolveLocalImports(h.consumer,h.root),error=>error.code===failure);
  }
});
test('aliased membership fails deterministically and invoking the resolver via a symlink emits JSON',async t=>{
  const h=await setup(t),{resolveLocalImports}=await import('../tools/canon/local-imports.mjs');
  const registry=path.join(h.root,'registry.json');
  for(const entries of [[{id:'first',path:'diagrams/team/consumer/consumer.spec.json'},{id:'second',path:'diagrams/team/consumer/consumer.spec.json'}],[{id:'second',path:'diagrams/team/consumer/consumer.spec.json'},{id:'first',path:'diagrams/team/consumer/consumer.spec.json'}]]){
    await fs.writeFile(registry,JSON.stringify({version:1,diagrams:entries}));await assert.rejects(resolveLocalImports(h.consumer,registry),/Ambiguous registry membership/);
  }
  const executable=path.join(h.root,'resolve.mjs');await fs.symlink(path.resolve(__dirname,'../tools/canon/local-imports.mjs'),executable);
  const result=require('node:child_process').spawnSync(process.execPath,[executable,h.consumer,h.root],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).page.canon.id,'consumer');
});
