'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function specs(){
  const make=(title,diagram)=>({page:{title,sections:[{id:'main',diagram}]}});
  return {
    base:make('Base',{nodes:{api:{title:'Shared API'},store:{title:'Shared store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api'],edges:[]},storage:{nodes:['api','store'],edges:[]}}}),
    middle:make('Middle',{topologyImports:[{spec:'base',export:['core','storage'],as:'base',nodeOverrides:{api:{style:'moss'}},edgeOverrides:{'api->store':{label:'Local persistence'}}}],topologyExports:{core:{nodes:['base::api','base::store'],edges:['base::api->base::store']}}}),
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
test('CLI and browser resolve merged exports and nested reexports without touching authored references or unrelated entries',async t=>{
  const h=await setup(t),before=await fs.readFile(h.consumer,'utf8');
  const authored=await Promise.all(Object.keys(h.inputs).map(id=>fs.readFile(path.join(h.root,'diagrams/team',id,id+'.spec.json'),'utf8')));
  const {resolveLocalImports}=await import('../tools/canon/local-imports.mjs');
  const result=await resolveLocalImports(h.consumer,h.root);
  assert.equal(result.id,'consumer');assert.deepEqual(result.specs.map(s=>s.page.canon.id),['base','middle','consumer']);
  const diagram=result.resolved.page.sections[0].diagram;
  assert.deepEqual(Object.keys(diagram.nodes).sort(),['shared::base::api','shared::base::store']);
  assert.equal(diagram.nodes['shared::base::api'].title,'Shared API');assert.equal(diagram.nodes['shared::base::api'].style,'moss');
  assert.equal(diagram.edges.length,1);assert.equal(diagram.edges[0].from,'shared::base::api');assert.equal(diagram.edges[0].to,'shared::base::store');assert.equal(diagram.edges[0].label,'Local persistence');
  const choices=await h.ctx.openFolderAgentProject(h.handle);assert.equal(choices.selectionRequired,true);
  const found=await h.ctx.openFolderAgentProject(h.handle,'diagrams/team/consumer/consumer.spec.json');
  assert.equal(found.directory.name,'consumer');assert.equal(found.source,before);
  assert.deepEqual(JSON.parse(JSON.stringify(found.topologyContext.specs)),result.specs);
  assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.FlowTopology.resolveSource(JSON.parse(before),found.topologyContext))),result.resolved);
  assert.deepEqual(await Promise.all(Object.keys(h.inputs).map(id=>fs.readFile(path.join(h.root,'diagrams/team',id,id+'.spec.json'),'utf8'))),authored);
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
  h.ctx.prepareAuthoredTopology=async()=>{throw Error('Missing authored provider middle');};
  await assert.rejects(h.ctx.prepareLocalFolderTopology(JSON.stringify(h.inputs.consumer),{},null),/Missing authored provider middle\nChoose the repository root.*Browsers cannot read a parent/);
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
    assert.equal(prepared.specs.find(s=>s.page.canon.id==='base').page.sections[0].diagram.nodes.api.title,'Shared API');assert.equal(prepared.localSource,undefined,'a copied ephemeral consumer cannot inherit another registered source path');
  }
  const context=JSON.parse(JSON.stringify(found.topologyContext));context.specs=context.specs.filter(s=>s.page.canon.id!=='middle');
  assert.throws(()=>h.ctx.prepareLocalFolderTopology(found.source,{},context),/Choose the repository root/);assert.equal(fetches,0);
  const transitive=JSON.parse(JSON.stringify(found.topologyContext));transitive.specs=transitive.specs.filter(s=>s.page.canon.id!=='base');
  const prepared=await h.ctx.prepareLocalFolderTopology(found.source,{},transitive);
  assert.throws(()=>h.ctx.FlowTopology.resolveSource(JSON.parse(found.source),prepared),/missing spec/i);assert.equal(fetches,0);
});
test('ordinary folders without a frozen context retain deployed provider acquisition',async t=>{
  const h=await setup(t),found=await h.ctx.openFolderAgentProject(h.handle,'diagrams/team/consumer/consumer.spec.json');
  vm.runInContext(readSource('library.workbench.js'),h.ctx);
  let fetches=0;h.ctx.connectTopologyRepository=async()=>{fetches++;return {...JSON.parse(JSON.stringify(found.topologyContext)),local:false};};
  const prepared=await h.ctx.prepareLocalFolderTopology(found.source,{},null);
  assert.equal(fetches,1);assert.equal(prepared.local,false);
  assert.equal(h.ctx.FlowTopology.resolveSource(JSON.parse(found.source),prepared).page.sections[0].diagram.nodes['shared::base::api'].title,'Shared API');
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
async function writeProvider(h,id,raw){await fs.writeFile(path.join(h.root,'diagrams/team',id,id+'.spec.json'),typeof raw==='string'?raw:JSON.stringify(raw));}
const consumerPath='diagrams/team/consumer/consumer.spec.json';
test('refresh resolves the exact current draft, new transitive dependencies and stacked overlays without reopening consumer files',async t=>{
 const h=await setup(t),found=await h.ctx.openLocalRepositoryFolder(h.handle,consumerPath),before=JSON.stringify(found.topologyContext);
 const draft=JSON.parse(found.source),imp=draft.page.sections[0].diagram.topologyImports[0];
 imp.nodeOverrides={'base::api':{title:'My consumer title'}};imp.nodePositions={'base::api':{x:345,y:456}};
 imp.edgeOverrides={'base::api->base::store':{label:'My edge'}};
 h.inputs.base.page.sections[0].diagram.nodes.store.title='Changed on disk';await writeProvider(h,'base',h.inputs.base);
 // New dependency is reachable only through the newly saved middle provider.
 const extra=specs().base;extra.page.title='Extra';
 await fs.mkdir(path.join(h.root,'diagrams/team/extra'));await writeProvider(h,'extra',extra);
 const registry=JSON.parse(await fs.readFile(path.join(h.root,'canon.json')));registry.diagrams.push({folder:'diagrams/team/extra',owner:'group:default/test'});await fs.writeFile(path.join(h.root,'canon.json'),JSON.stringify(registry));
 h.inputs.middle.page.sections[0].diagram.topologyImports.push({spec:'extra',export:'core',as:'extra'});await writeProvider(h,'middle',h.inputs.middle);
 await fs.writeFile(h.consumer,'{ invalid disk consumer must not be read');
 const source=' \n'+JSON.stringify(draft)+'\n',next=await h.ctx.readLocalRepositoryTopology(h.handle,source,consumerPath),resolved=h.ctx.FlowTopology.resolveSource(JSON.parse(source),next).page.sections[0].diagram;
 assert.equal(resolved.nodes['shared::base::api'].title,'My consumer title');assert.equal(resolved.nodes['shared::base::api'].style,'moss');assert.equal(resolved.nodes['shared::base::store'].title,'Changed on disk');assert.equal(resolved.edges[0].label,'My edge');
 assert.deepEqual(Array.from(next.specs,s=>s.page.canon.id),['base','extra','middle','consumer']);assert.equal(JSON.stringify(found.topologyContext),before);
 assert.equal(await fs.readFile(h.consumer,'utf8'),'{ invalid disk consumer must not be read');assert.equal(next.localSource.path,consumerPath);
});
test('refresh rejects malformed providers, orphan overlays, missing registrations and invalid drafts with identity diagnostics',async t=>{
 const h=await setup(t),source=JSON.stringify(h.inputs.consumer);
 await writeProvider(h,'base','{');await assert.rejects(h.ctx.readLocalRepositoryTopology(h.handle,source,consumerPath),/consumer.*provider base.*base.spec.json/i);
 await writeProvider(h,'base',h.inputs.base);
 h.inputs.consumer.page.sections[0].diagram.topologyImports[0].nodePositions={'renamed':{x:1,y:2}};
 await assert.rejects(h.ctx.readLocalRepositoryTopology(h.handle,JSON.stringify(h.inputs.consumer),consumerPath),/consumer.*import shared.*middle.*nodePositions.*renamed/i);
 await assert.rejects(h.ctx.readLocalRepositoryTopology(h.handle,'{',consumerPath),/Repair the consumer JSON/);
 await fs.writeFile(path.join(h.root,'canon.json'),'{"version":1,"diagrams":[]}');await assert.rejects(h.ctx.readLocalRepositoryTopology(h.handle,source,consumerPath),/consumer.*no longer registered/);
});
function observedRoot(root,onRead){
 function wrap(dir,prefix=''){return {name:dir.name,async getDirectoryHandle(name){return wrap(await dir.getDirectoryHandle(name),prefix+name+'/');},async getFileHandle(name){const handle=await dir.getFileHandle(name);return {async getFile(){const file=await handle.getFile(),text=await file.text();return {size:file.size,text:async()=>onRead(prefix+name,text)};}};}};}
 return wrap(root);
}
test('refresh deduplicates diamond acquisition, compares exact bytes and retries a racing save only once',async t=>{
 const h=await setup(t),raw=h.inputs.consumer;raw.page.sections[0].diagram.topologyImports.push({spec:'base',export:'core',as:'direct'});
 const counts=new Map(),root=observedRoot(h.handle,(name,text)=>{counts.set(name,(counts.get(name)||0)+1);return text;});
 await h.ctx.readLocalRepositoryTopology(root,JSON.stringify(raw),consumerPath);
 assert.equal(counts.get('diagrams/team/base/base.spec.json'),2,'one acquisition plus one independent byte verification, despite diamond');assert.equal(counts.has(consumerPath),false);assert.equal(counts.has('diagrams/unrelated/unrelated.spec.json'),false);
 let read=0;const unstable=observedRoot(h.handle,(name,text)=>name==='canon.json' && ++read%2===0?text+' ':text);
 await assert.rejects(h.ctx.readLocalRepositoryTopology(unstable,JSON.stringify(raw),consumerPath),/changed during refresh/);assert.equal(read,4);
 let baseRead=0;const settles=observedRoot(h.handle,(name,text)=>name.endsWith('/base.spec.json') && ++baseRead===1?text.replace('Shared API','Before API'):text);
 const next=await h.ctx.readLocalRepositoryTopology(settles,JSON.stringify(raw),consumerPath);assert.equal(next.specs[0].page.sections[0].diagram.nodes.api.title,'Shared API');assert.equal(baseRead,4);
});
test('refresh never shares provider caches between same-name roots and retires delayed acquisition',async t=>{
 const one=await setup(t),two=await setup(t);one.handle.name=two.handle.name='worktree';two.inputs.base.page.sections[0].diagram.nodes.api.title='Other root';await writeProvider(two,'base',two.inputs.base);
 const source=JSON.stringify(one.inputs.consumer),a=await one.ctx.readLocalRepositoryTopology(one.handle,source,consumerPath),b=await one.ctx.readLocalRepositoryTopology(two.handle,source,consumerPath);
 assert.equal(a.specs[0].page.sections[0].diagram.nodes.api.title,'Shared API');assert.equal(b.specs[0].page.sections[0].diagram.nodes.api.title,'Other root');
 let active=true;const late=observedRoot(one.handle,(name,text)=>{if(name.endsWith('/base.spec.json'))active=false;return text;});
 await assert.rejects(one.ctx.readLocalRepositoryTopology(late,source,consumerPath,()=>{if(!active)throw Error('Retired project');}),/Retired project/);
 const denied={...one.handle,queryPermission:async()=> 'denied'};await assert.rejects(one.ctx.readLocalRepositoryTopology(denied,source,consumerPath),/permission was lost/);
 const deniedProvider=observedRoot(one.handle,(name,text)=>{if(name.endsWith('/base.spec.json'))throw Object.assign(Error('Permission lost inside provider read'),{name:'NotAllowedError'});return text;});await assert.rejects(one.ctx.readLocalRepositoryTopology(deniedProvider,source,consumerPath),error=>error.name==='NotAllowedError' && /provider base.*Permission lost/.test(error.message));
});
test('oversize provider acquisition is rejected before reading its body',async t=>{
 const h=await setup(t);let bodyRead=false;
 function wrap(dir){return {name:dir.name,async getDirectoryHandle(name){return wrap(await dir.getDirectoryHandle(name));},async getFileHandle(name){if(name==='base.spec.json')return {async getFile(){return {size:4*1024*1024+1,text:async()=>{bodyRead=true;return '{}';}};}};return dir.getFileHandle(name);}};}
 await assert.rejects(h.ctx.readLocalRepositoryTopology(wrap(h.handle),JSON.stringify(h.inputs.consumer),consumerPath),/provider base.*4 MiB/);assert.equal(bodyRead,false);
});

test('refresh acquisition retains structured lifetime guard failures through nested provider reads',async t=>{
  const h=await setup(t),failure=Object.assign(Error('Cloud projects use their saved snapshot'),{refreshCode:'cloud_project'});let checks=0;
  await assert.rejects(h.ctx.readLocalRepositoryTopology(h.handle,JSON.stringify(h.inputs.consumer),'diagrams/team/consumer/consumer.spec.json',()=>{if(++checks===10)throw failure;}),error=>error===failure && error.refreshCode==='cloud_project');
});
