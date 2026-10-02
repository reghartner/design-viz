'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../tools/canon/core.cjs');
const source=()=>['platform','checkout'].map(id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8')));
const diagram=s=>s.page.sections[0].diagram;
const resolve=specs=>C.materializeTopology(specs);
test('materializes closed, namespaced topology with consumer narrative and binding; deterministic, nonmutating and idempotent',()=>{
  const specs=source(),before=structuredClone(specs),out=resolve(specs),d=diagram(out[1]);
  assert.deepEqual(specs,before);assert.deepEqual(resolve(specs),out);assert.deepEqual(resolve(out),out);
  assert.deepEqual(resolve([...specs].reverse()).reverse(),out);
  assert.deepEqual(d.rows,[['client'],['platform::api','platform::store']]);
  assert.equal(d.nodes['platform::api'].binding.entityRef,'component:default/api');
  assert.equal(d.nodes['platform::api'].group,'platform::backend');
  assert.deepEqual(d.groups['platform::backend'],{label:'Platform'});
  assert.deepEqual(d.steps,diagram(specs[1]).steps);assert.deepEqual(d.paths,diagram(specs[1]).paths);
  assert.equal(d.topologyImports,undefined);assert.equal(diagram(out[0]).topologyExports,undefined);
  assert.deepEqual(out.map(s=>C.validateSpec(s).errors),[[],[]]);
});
test('removed exported node referenced by consumer edge fails with consumer/import/export/identity',()=>{
  const specs=source(),d=diagram(specs[0]);delete d.nodes.api;d.rows=[['store']];d.edges=[];d.topologyExports.core={nodes:['store'],edges:[]};
  assert.throws(()=>resolve(specs),/checkout.*import platform.*platform export core.*missing node platform::api/);
});
test('removed exported edge used by consumer step or failure fails despite ordinary validator warnings',()=>{
  for(const failureOnly of [false,true]){
    const specs=source(),d=diagram(specs[0]);d.edges=[];d.topologyExports.core.edges=[];
    if(failureOnly){diagram(specs[1]).steps.splice(1,1);delete diagram(specs[1]).paths;}
    assert.throws(()=>resolve(specs),/checkout.*import platform.*platform export core.*missing edge platform::api->platform::store/);
  }
});
test('missing source/export, cycle and namespace/edge collisions fail',()=>{
  const cases=[
    [s=>diagram(s[1]).topologyImports[0].spec='absent',/checkout.*missing spec absent/],
    [s=>diagram(s[1]).topologyImports[0].export='absent',/checkout.*missing export absent/],
    [s=>diagram(s[0]).topologyImports=[{spec:'checkout',export:'core',as:'cycle'}],/cycle/],
    [s=>diagram(s[1]).nodes['platform::other']={title:'Collision'},/namespace collision/],
    [s=>diagram(s[1]).topologyImports.push({...diagram(s[1]).topologyImports[0]}),/duplicate namespace/],
    [s=>diagram(s[1]).edges.push({from:'platform::api',to:'platform::store'}),/edge collision/],
  ];
  for(const [mutate,pattern] of cases){const specs=source();mutate(specs);assert.throws(()=>resolve(specs),pattern);}
});
test('malformed declarations, incomplete export closure and broken placement fail',()=>{
  const cases=[
    s=>diagram(s[0]).topologyExports=[],
    s=>diagram(s[0]).topologyExports.core.nodes=['api','api'],
    s=>diagram(s[0]).topologyExports.core.edges=['absent->edge'],
    s=>diagram(s[0]).topologyExports.core.nodes=['api'],
    s=>diagram(s[0]).rows=[['api']],
    s=>diagram(s[0]).rows=[['api','api','store']],
    s=>diagram(s[1]).topologyImports={},
    s=>diagram(s[1]).topologyImports[0].as='bad::namespace',
    s=>diagram(s[1]).topologyImports[0].unknown=true,
    s=>diagram(s[0]).topologyExports.core.unknown=true,
  ];
  for(const mutate of cases){const specs=source();mutate(specs);assert.throws(()=>resolve(specs),/Topology/);}
});
test('provider additions/presentation changes are non-breaking; only selected topology crosses the boundary',()=>{
  const specs=source(),d=diagram(specs[0]);d.nodes.other={title:'Other'};d.rows.push(['other']);
  d.steps=[{edge:'api->store',text:'Provider narrative'}];d.edges[0].revealAt=4;d.nodes.api.title='API v2';
  const out=diagram(resolve(specs)[1]);assert.equal(out.nodes['platform::other'],undefined);assert.equal(out.nodes['platform::api'].title,'API v2');
  assert.equal(out.edges[1].revealAt,undefined);assert.deepEqual(out.steps,diagram(specs[1]).steps);
  d.topologyExports.core.nodes.push('other');
  assert.equal(diagram(resolve(specs)[1]).nodes['platform::other'].title,'Other');
});
test('nested providers resolve from the same batch and retain stable namespace identities',()=>{
  const specs=source(),consumer=diagram(specs[1]);consumer.topologyExports={story:{nodes:['platform::api','platform::store'],edges:['platform::api->platform::store']}};
  const outer={page:{title:'Outer',canon:{version:1,id:'outer',kind:'canonical',owner:'group:default/team'},sections:[{diagram:{topologyImports:[{spec:'checkout',export:'story',as:'shared'}]}}]}};
  const out=resolve([outer,...specs]);assert.ok(diagram(out[0]).nodes['shared::platform::api']);
});
test('Backstage indexes the same materializations and refuses unresolved inputs',async()=>{
  const {materializeCanonSpecs,buildEntityDiagramIndex,diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
  const specs=source(),materialized=materializeCanonSpecs(specs);assert.deepEqual(materialized,resolve(specs));
  assert.throws(()=>buildEntityDiagramIndex(specs),/materializeCanonSpecs/);
  const matches=diagramsForEntity(buildEntityDiagramIndex(materialized),'component:default/api').diagrams;
  assert.deepEqual(matches.map(s=>s.id).sort(),['checkout','platform']);
  assert.ok(matches.find(s=>s.id==='checkout').sections[0].paths.some(p=>p.steps.some(s=>s.id==='persist')));
});
test('publisher installs immutable materialized specs and preserves previous snapshot on failed compatibility',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'topology-library-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const specs=source(),write=s=>fs.writeFileSync(path.join(root,s.page.canon.id+'.json'),JSON.stringify(s));specs.forEach(write);
  fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify({version:1,diagrams:specs.map(s=>({id:s.page.canon.id,path:s.page.canon.id+'.json'}))}));
  const output=path.join(root,'published/diagrams.json'),options={registryPath:path.join(root,'registry.json'),output};
  const library=await publishLibrary(options),before=fs.readFileSync(output,'utf8');
  const loaded=library.diagrams.map(entry=>JSON.parse(fs.readFileSync(path.resolve(path.dirname(output),entry.specUrl),'utf8')));
  assert.deepEqual(loaded,resolve(specs));
  const oldUrl=library.diagrams[1].specUrl;
  diagram(specs[0]).nodes.api.title='Changed presentation';write(specs[0]);const next=await publishLibrary(options);
  assert.notEqual(next.diagrams[1].specUrl,oldUrl);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(path.dirname(output),oldUrl),'utf8')),loaded[1]);
  const good=fs.readFileSync(output,'utf8');diagram(specs[0]).edges=[];diagram(specs[0]).topologyExports.core.edges=[];write(specs[0]);
  await assert.rejects(publishLibrary(options),/checkout.*missing edge/);assert.equal(fs.readFileSync(output,'utf8'),good);assert.notEqual(good,before);
});
test('Workbench protects imported structure while allowing consumer narrative changes',()=>{
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),context={URL,TextEncoder};
  vm.createContext(context);vm.runInContext(loader.composeSources(['canon.js','validator.js']),context);
  const before=resolve(source())[1],after=structuredClone(before);diagram(after).steps[1].text='Updated narrative';
  assert.equal(context.FlowTopology.editError(before,after),null);
  diagram(after).edges.push({from:'client',to:'platform::store'});assert.equal(context.FlowTopology.editError(before,after),null);
  diagram(after).nodes['platform::api'].title='Overridden';assert.match(context.FlowTopology.editError(before,after),/read only/);
  assert.equal(context.FlowTopology.origin(diagram(before),'nodes','platform::api').spec,'platform');
});
test('central canon resolves the complete membership before authorizing consumers',async t=>{
  const {loadCanonDiagrams}=await import('../tools/canon/library.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'topology-canon-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const specs=source();
  for(const spec of specs){const id=spec.page.canon.id,folder=path.join(root,'diagrams',id);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,id+'.spec.json'),JSON.stringify(spec));}
  const file=path.join(root,'canon.json');fs.writeFileSync(file,JSON.stringify({version:1,diagrams:specs.map(s=>({folder:'diagrams/'+s.page.canon.id,owner:s.page.canon.owner}))}));
  const loaded=await loadCanonDiagrams(file,{authorize:entry=>entry.id==='checkout'});
  assert.equal(loaded.specs.length,1);assert.ok(diagram(loaded.specs[0]).nodes['platform::api']);
  assert.deepEqual(loaded.index.entities['component:default/api'].map(s=>s.id),['checkout']);
  const {registry}=await import('../tools/canon/registry.mjs'),reg=await registry(file);
  assert.deepEqual(reg.entries.map(e=>e.sourceSpec),specs,'authored inputs remain available for evidence baseline writes');
});
test('Workbench session rejects structure before writing or recording Undo; narrative change has one Undo',()=>{
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),context={URL,TextEncoder};
  vm.createContext(context);vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/session.js']),context);
  let text=JSON.stringify(resolve(source())[1]),writes=0;
  const original=text,persistence={read:()=>({}),save(){}};
  const session=context.createBuilderSession({source:{read:()=>text,write:value=>{text=value;writes++;}},persistence,render(){}});
  const changed=JSON.parse(text);diagram(changed).nodes['platform::api'].title='Override';
  assert.equal(session.accept({text:JSON.stringify(changed)}),false);assert.equal(writes,0);assert.equal(session.canUndo(),false);
  const narrative=JSON.parse(text);diagram(narrative).steps[0].text='Edited consumer';
  assert.equal(session.accept({text:JSON.stringify(narrative)}),true);assert.equal(writes,1);
  assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
});
