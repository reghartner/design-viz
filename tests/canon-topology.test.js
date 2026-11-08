'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../tools/canon/core.cjs');
const source=()=>['platform','checkout'].map(id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8')));
const diagram=s=>s.page.sections[0].diagram;
const resolve=specs=>C.materializeTopology(specs);
function notificationSource(selected){
  const targets=['push','email','sms'],ids=['dispatcher',...targets];
  const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/notifications'},sections:[{id:'delivery',diagram:d}]}});
  const keys=selected.map(id=>'notify::dispatcher->notify::'+id);
  return [spec('notification-child',{
    nodes:Object.fromEntries(ids.map(id=>[id,{title:id}])),rows:[['dispatcher'],targets],
    edges:targets.map(to=>({from:'dispatcher',to,kind:'https'})),
    topologyExports:{channels:{nodes:ids,edges:targets.map(id=>'dispatcher->'+id)}},
  }),spec('notification-parent',{
    topologyImports:[{spec:'notification-child',export:'channels',as:'notify'}],
    steps:[{id:'send-first',edge:keys[0]},{id:'send-second',edge:keys[1]},{id:'send-both',edges:keys}],
    paths:[{id:'separate',steps:['send-first','send-second']},{id:'together',steps:['send-both']}],
  })];
}
test('a parent can fire any chosen two of three imported notification edges in its own steps',()=>{
  const routing=C.viewerRouting();
  for(const selected of [['push','email'],['push','sms'],['email','sms']]){
    const specs=notificationSource(selected),consumer=diagram(resolve(specs)[1]);
    const keys=selected.map(id=>'notify::dispatcher->notify::'+id);
    assert.deepEqual(consumer.steps,diagram(specs[1]).steps);
    assert.deepEqual(routing.diagramForPath(consumer,'separate').steps.flatMap(routing.stepKeys),keys);
    assert.deepEqual(routing.diagramForPath(consumer,'together').steps.flatMap(routing.stepKeys),keys);
    const unused=['push','email','sms'].find(id=>!selected.includes(id));
    const unusedKey='notify::dispatcher->notify::'+unused;
    assert.equal(consumer.edges.length,3);assert.ok(consumer.edges.some(e=>e.from+'->'+e.to===unusedKey));
    assert.ok(!consumer.steps.flatMap(routing.stepKeys).includes(unusedKey));
    assert.deepEqual(C.validateSpec({page:{sections:[{diagram:consumer}]}}).errors,[]);
  }
});
test('removing or renaming either notification edge chosen by the parent rejects the whole snapshot',()=>{
  for(const selected of [['push','email'],['push','sms'],['email','sms']])for(const target of selected)for(const change of ['remove','rename']){
    const specs=notificationSource(selected),provider=diagram(specs[0]),exp=provider.topologyExports.channels;
    if(change==='remove'){
      provider.edges=provider.edges.filter(e=>e.to!==target);exp.edges=exp.edges.filter(key=>key!=='dispatcher->'+target);
    }else{
      const renamed=target+'-renamed';provider.nodes[renamed]=provider.nodes[target];delete provider.nodes[target];
      provider.rows=provider.rows.map(row=>row.map(id=>id===target?renamed:id));
      provider.edges.find(e=>e.to===target).to=renamed;
      exp.nodes=exp.nodes.map(id=>id===target?renamed:id);exp.edges=exp.edges.map(key=>key==='dispatcher->'+target?'dispatcher->'+renamed:key);
    }
    const before=structuredClone(specs);
    assert.throws(()=>resolve(specs),error=>error.message.includes('notification-parent') &&
      error.message.includes('import notify (notification-child export channels)') &&
      error.message.includes('missing edge notify::dispatcher->notify::'+target));
    assert.deepEqual(specs,before);
  }
});
test('materializes closed, namespaced topology with consumer narrative and binding; deterministic, nonmutating and idempotent',()=>{
  const specs=source(),before=structuredClone(specs),out=resolve(specs),d=diagram(out[1]);
  assert.deepEqual(specs,before);assert.deepEqual(resolve(specs),out);assert.deepEqual(resolve(out),out);
  assert.deepEqual(resolve([...specs].reverse()).reverse(),out);
  assert.deepEqual(d.rows,[['client']]);
  assert.deepEqual(d.floats.map(f=>f.id),['platform::api','platform::store']);
  assert.ok(d.floats.every(f=>Number.isFinite(f.x) && Number.isFinite(f.y)));
  assert.equal(d.nodes['platform::api'].binding.entityRef,'component:default/api');
  assert.equal(d.nodes['platform::api'].group,'platform::backend');
  assert.deepEqual(d.groups['platform::backend'],{label:'Platform'});
  assert.deepEqual(d.steps,diagram(specs[1]).steps);assert.deepEqual(d.paths,diagram(specs[1]).paths);
  assert.equal(d.topologyImports,undefined);assert.equal(diagram(out[0]).topologyExports,undefined);
  assert.deepEqual(out.map(s=>C.validateSpec(s).errors),[[],[]]);
});
test('removed exported node referenced by consumer edge fails with consumer/import/export/identity',()=>{
  const specs=source(),d=diagram(specs[0]);delete d.nodes.api;d.rows=[['store']];d.edges=[];d.topologyExports={core:{nodes:['store'],edges:[]}};
  assert.throws(()=>resolve(specs),/checkout.*import platform.*platform export core.*missing node platform::api/);
});
test('float-only exported fragments preserve relative coordinates without importing the provider row anchor',()=>{
  const specs=source(),provider=diagram(specs[0]);
  provider.nodes.anchor={title:'Provider anchor'};provider.rows=[['anchor']];
  provider.floats=[{id:'api',x:100,y:100},{id:'store',x:300,y:100}];
  const before=structuredClone(specs),out=resolve(specs),consumer=diagram(out[1]);
  assert.deepEqual(specs,before);assert.deepEqual(consumer.rows,[['client']]);
  assert.equal(consumer.floats[1].x-consumer.floats[0].x,200);
  assert.equal(consumer.floats[1].y-consumer.floats[0].y,0);
  assert.equal(consumer.nodes['platform::anchor'],undefined);
  assert.deepEqual(consumer.edges[1],{from:'platform::api',to:'platform::store',kind:'https',label:'Persist'});
  assert.deepEqual(C.validateSpec(out[1]).errors,[]);assert.deepEqual(resolve(out),out);
});
test('floating imports do not bypass validation of unplaced local connection endpoints',()=>{
  const specs=source(),provider=diagram(specs[0]);
  provider.nodes.anchor={title:'Provider anchor'};provider.rows=[['anchor']];
  provider.floats=[{id:'api',x:100,y:100},{id:'store',x:300,y:100}];
  delete diagram(specs[1]).rows;
  assert.throws(()=>resolve(specs),/Topology checkout: invalid materialized spec:.*client.*not a placed node/);
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
test('protocol imports dedupe identical definitions and deterministically remap real collisions without mutating sources',()=>{
  const specs=source(),provider=specs[0],consumer=specs[1];
  provider.page.protocols={custom:{color:'#123456',label:'Provider'}};
  diagram(provider).edges[0].kind='custom';
  consumer.page.protocols={custom:{label:'Consumer',color:'#654321'},same:{label:'Same',color:'#abcdef'}};
  provider.page.protocols.same={color:'#abcdef',label:'Same'};
  diagram(provider).edges.push({from:'store',to:'api',kind:'same'});
  diagram(provider).topologyExports.core.edges.push('store->api');
  const before=structuredClone(specs),first=resolve(specs),second=resolve(specs),out=diagram(first[1]);
  assert.deepEqual(specs,before);assert.deepEqual(first,second);
  assert.equal(out.edges.find(e=>e.from==='platform::api').kind,'platform-custom');
  assert.equal(out.edges.find(e=>e.from==='platform::store').kind,'same');
  assert.deepEqual(first[1].page.protocols.custom,consumer.page.protocols.custom);
  assert.deepEqual(first[1].page.protocols['platform-custom'],provider.page.protocols.custom);
  assert.equal(first[1].page.protocols['platform-same'],undefined);
});
test('multiple and nested protocol collisions remain distinct, stable, and never overwrite built-ins',()=>{
  const specs=source(),provider=specs[0],consumer=specs[1];
  provider.page.protocols={https:{label:'Provider HTTPS',color:'#112233'},custom:{label:'Provider custom',color:'#223344'}};
  diagram(provider).edges[0].kind='https';
  consumer.page.protocols={custom:{label:'Consumer custom',color:'#334455'},'platform-custom':{label:'Occupied',color:'#445566'}};
  diagram(provider).edges.push({from:'store',to:'api',kind:'custom'});diagram(provider).topologyExports.core.edges.push('store->api');
  diagram(consumer).topologyImports.push({spec:'platform',export:'core',as:'other'});
  diagram(consumer).topologyExports={story:{nodes:['platform::api','platform::store'],edges:['platform::api->platform::store','platform::store->platform::api']}};
  const outer={page:{title:'Outer',canon:{version:1,id:'outer',kind:'canonical',owner:'group:default/team'},protocols:{'platform-https':{label:'Occupied nested HTTPS',color:'#556677'},'platform-custom-2':{label:'Occupied nested custom',color:'#667788'}},sections:[{diagram:{topologyImports:[{spec:'checkout',export:'story',as:'shared'}]}}]}};
  const before=structuredClone([outer,...specs]),out=resolve([outer,...specs]),checkout=diagram(out[2]),nested=diagram(out[0]);
  assert.deepEqual([outer,...specs],before);
  assert.equal(checkout.edges.find(e=>e.from==='platform::api').kind,'platform-https');
  assert.equal(checkout.edges.find(e=>e.from==='platform::store').kind,'platform-custom-2');
  assert.equal(checkout.edges.find(e=>e.from==='other::api').kind,'other-https');
  assert.equal(checkout.edges.find(e=>e.from==='other::store').kind,'other-custom');
  assert.equal(nested.edges.find(e=>e.from==='shared::platform::api').kind,'shared-platform-https');
  assert.equal(nested.edges.find(e=>e.from==='shared::platform::store').kind,'shared-platform-custom-2');
  assert.deepEqual(out[0].page.protocols.https,undefined);
  assert.deepEqual(out[2].page.protocols.https,undefined);
});
test('floating blocks preserve mixed row, stack and provider-float center geometry and saved origins',()=>{
  for(const nativeFloat of [{id:'audit',side:'below',dx:30,dy:-10},{id:'audit',x:-120,y:310}]){
    const specs=source(),provider=diagram(specs[0]),consumer=diagram(specs[1]);
    provider.nodes.cache={title:'Cache'};provider.nodes.audit={title:'Audit'};
    provider.rows=[[['api','store'],'cache']];provider.floats=[nativeFloat];
    provider.topologyExports.core.nodes.push('cache','audit');
    consumer.topologyImports[0].position={x:280,y:460};
    const before=structuredClone(specs),expected=C.viewerRouting().layout(provider).pos,out=diagram(resolve(specs)[1]);
    const actual=C.viewerRouting().layout(out).pos;
    for(const a of Object.keys(expected))for(const b of Object.keys(expected)){
      assert.equal(actual['platform::'+a].cx-actual['platform::'+b].cx,expected[a].cx-expected[b].cx);
      assert.equal(actual['platform::'+a].cy-actual['platform::'+b].cy,expected[a].cy-expected[b].cy);
    }
    assert.equal(Math.min(...out.floats.map(f=>f.x)),280);assert.equal(Math.min(...out.floats.map(f=>f.y)),460);
    assert.deepEqual(out.rows,[['client']]);assert.deepEqual(specs,before);
    provider.rows=[['api','cache'],['store']];
    const refreshed=diagram(resolve(specs)[1]);
    assert.equal(Math.min(...refreshed.floats.map(f=>f.x)),280);assert.equal(Math.min(...refreshed.floats.map(f=>f.y)),460);
    assert.notDeepEqual(refreshed.floats,out.floats);
  }
});
test('unpositioned imports form separate floating blocks, including an import-only parent',()=>{
  const specs=source(),consumer=diagram(specs[1]);
  consumer.topologyImports.push({spec:'platform',export:'core',as:'second'});
  const out=diagram(resolve(specs)[1]);assert.deepEqual(out.rows,consumer.rows);
  const [first,second]=out.topologyProvenance.imports;
  assert.ok(second.position.y>first.position.y);
  const only=notificationSource(['push','sms']),resolved=diagram(resolve(only)[1]);
  assert.deepEqual(resolved.rows,[[]]);assert.equal(resolved.floats.length,4);
  assert.deepEqual(C.validateSpec(resolve(only)[1]).errors,[]);
});
test('malformed or overflowing block placements fail with consumer/import diagnostics',()=>{
  for(const position of [null,[],{}, {x:2},{x:'2',y:4},{x:0,y:100001},{x:0,y:0,z:1},{x:100000,y:0}]){
    const specs=source();diagram(specs[1]).topologyImports[0].position=position;
    assert.throws(()=>resolve(specs),/Topology checkout.*import.*position|Topology checkout.*import.*coordinate/);
  }
});
test('placing an import rewrites only authored position and has one Undo; invalid/stale writes nothing',()=>{
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),context={URL,TextEncoder};
  vm.createContext(context);vm.runInContext(loader.composeSources(['validator.js','canon.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/layout.js','workbench/session.js']),context);
  const specs=source(),original='  '+JSON.stringify(specs[1],null,2)+'\n',provider=JSON.stringify(specs[0]);let text='',writes=0;
  const session=context.createBuilderSession({source:{read:()=>text,write:value=>{text=value;writes++;}},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){}});
  session.replaceProject(original,null,{topologyContext:{version:1,id:'checkout',specs}});writes=0;
  const snapshot=session.snapshot(),plan=context.planPlaceTopologyImport(text,JSON.parse(text),0,'platform',333.34,-70.25);
  const expected=structuredClone(specs[1]);diagram(expected).topologyImports[0].position={x:333.3,y:-70.2};
  assert.equal(session.accept(plan,{snapshot}),true);assert.equal(writes,1);assert.deepEqual(JSON.parse(text),expected);
  assert.ok(text.startsWith('  '));assert.ok(text.endsWith('\n'));assert.equal(JSON.stringify(specs[0]),provider);
  const after=text;assert.equal(session.accept(plan,{snapshot}),false);assert.equal(text,after);
  assert.ok(context.planPlaceTopologyImport(text,JSON.parse(text),0,'platform',Infinity,0).error);
  assert.ok(context.planPlaceTopologyImport(text,JSON.parse(text),0,'missing',0,0).error);
  assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
  assert.equal(session.redo(),true);assert.equal(text,after);
});
test('Backstage resolves approved authored snapshots in memory and retains source for editing',async()=>{
  const {materializeCanonSpecs,prepareCanonSnapshot,buildEntityDiagramIndex,diagramsForEntity}=await import('../tools/canon/entity-diagrams.mjs');
  const specs=source(),materialized=materializeCanonSpecs(specs);assert.deepEqual(materialized,resolve(specs));
  assert.deepEqual(buildEntityDiagramIndex(specs),buildEntityDiagramIndex(materialized));
  const prepared=prepareCanonSnapshot(specs),workspace=prepared.loadWorkspace('checkout');
  assert.deepEqual(workspace.source,specs[1]);assert.deepEqual(prepared.loadSpec('checkout'),materialized[1]);
  assert.equal(workspace.topologyContext.specs.length,2);
  assert.equal(prepareCanonSnapshot(specs,{authorize:s=>s.page.canon.id==='checkout'}).loadSpec('checkout'),null);
  assert.throws(()=>prepareCanonSnapshot(specs,{authorize:async()=>false}),/must return a boolean/);
  const matches=diagramsForEntity(buildEntityDiagramIndex(materialized),'component:default/api').diagrams;
  assert.deepEqual(matches.map(s=>s.id).sort(),['checkout','platform']);
  assert.ok(matches.find(s=>s.id==='checkout').sections[0].paths.some(p=>p.steps.some(s=>s.id==='persist')));
});
test('publisher writes only an authored-source index and preserves it on failed compatibility',async t=>{
  const {publishLibrary}=await import('../tools/canon/library.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'topology-library-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const specs=source(),write=s=>fs.writeFileSync(path.join(root,s.page.canon.id+'.json'),JSON.stringify(s));specs.forEach(write);
  fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify({version:1,diagrams:specs.map(s=>({id:s.page.canon.id,path:s.page.canon.id+'.json'}))}));
  const output=path.join(root,'published/diagrams.json'),options={registryPath:path.join(root,'registry.json'),output};
  const library=await publishLibrary(options),before=fs.readFileSync(output,'utf8');
  const loaded=library.diagrams.map(entry=>JSON.parse(fs.readFileSync(path.resolve(path.dirname(output),entry.specUrl),'utf8')));
  assert.equal(library.version,3);assert.deepEqual(loaded,specs);
  assert.deepEqual(fs.readdirSync(path.dirname(output)),['diagrams.json']);
  const oldUrl=library.diagrams[1].specUrl;
  diagram(specs[0]).nodes.api.title='Changed presentation';write(specs[0]);const next=await publishLibrary(options);
  assert.equal(next.diagrams[1].specUrl,oldUrl);
  assert.notEqual(next.diagrams[0].revision,library.diagrams[0].revision);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(path.dirname(output),oldUrl),'utf8')),loaded[1]);
  const good=fs.readFileSync(output,'utf8');diagram(specs[0]).edges=[];diagram(specs[0]).topologyExports.core.edges=[];write(specs[0]);
  await assert.rejects(publishLibrary(options),/checkout.*missing edge/);assert.equal(fs.readFileSync(output,'utf8'),good);assert.notEqual(good,before);
});
test('backend proposals validate the full authored batch without flattening the proposed consumer',async()=>{
  const {propose,initialState,digest}=await import('../tools/canon/drift.mjs');
  const specs=source(),edited=structuredClone(specs[1]);diagram(edited).steps[0].text='Reviewed narrative';
  const result=propose(specs,initialState(),{id:'checkout',spec:edited,baseRevision:digest(specs[1])});
  assert.deepEqual(result.state.reviews[result.id].proposedSpec,edited);
  diagram(edited).steps[1].edge='platform::removed->platform::store';
  assert.throws(()=>propose(specs,initialState(),{id:'checkout',spec:edited,baseRevision:digest(specs[1])}),/missing edge/);
});
test('reference backend serves derived runtime views and authored workspace context from the same snapshot',async t=>{
  const {createCanonServer}=await import('../apps/backstage-mock/server.mjs');
  const {digest}=await import('../tools/canon/drift.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'topology-backend-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const specs=source();
  for(const spec of specs)fs.writeFileSync(path.join(root,spec.page.canon.id+'.json'),JSON.stringify(spec));
  for(const name of ['catalog.json','repositories.json'])fs.copyFileSync(path.join(__dirname,'../examples/canon',name),path.join(root,name));
  const registryPath=path.join(root,'registry.json');
  fs.writeFileSync(registryPath,JSON.stringify({version:1,diagrams:specs.map(s=>({id:s.page.canon.id,path:s.page.canon.id+'.json'}))}));
  const server=await createCanonServer({registryPath,statePath:path.join(root,'state.json')});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  const get=async suffix=>{const response=await fetch(base+suffix);assert.equal(response.status,200);return response.json();};
  const index=await get('/api/canon/entity-diagrams?entityRef=component:default/api');
  const entry=index.diagrams.find(d=>d.id==='checkout');
  const rendered=await get('/api/canon/specs/checkout?revision='+entry.revision);
  assert.equal(digest(rendered),entry.revision);assert.deepEqual(rendered,resolve(specs)[1]);
  const workspace=await get('/api/canon/context?id=checkout');
  assert.deepEqual(workspace.source,specs[1]);assert.deepEqual(workspace.spec,rendered);
  assert.equal(workspace.topologyContext.specs.length,2);
  const library=await get('/workbench/diagrams.json');
  assert.deepEqual(library.diagrams.find(d=>d.id==='checkout').source,specs[1]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'checkout.json'))),specs[1]);
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
  const denied=await loadCanonDiagrams(file,{authorize:entry=>entry.id==='checkout'});
  assert.equal(denied.specs.length,0);
  const loaded=await loadCanonDiagrams(file);
  assert.ok(diagram(loaded.loadSpec('checkout')).nodes['platform::api']);
  assert.deepEqual(loaded.loadWorkspace('checkout').source,specs[1]);
  const {registry}=await import('../tools/canon/registry.mjs'),reg=await registry(file);
  assert.deepEqual(reg.entries.map(e=>e.spec),specs,'authored inputs remain available for evidence baseline writes');
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

test('authored editor sessions resolve a frozen closure while preserving source, Undo, recovery and export',()=>{
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),context={URL,TextEncoder};
  vm.createContext(context);vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/session.js','workbench/io-model.js']),context);
  const specs=source(),snapshot={version:1,id:'checkout',specs},original=JSON.stringify(specs[1]);
  let text='',saved,preview;
  const session=context.createBuilderSession({source:{read:()=>text,write:value=>text=value},
    persistence:{read:()=>({}),preserve(){},cancel(){},save:(text,baseline,artifacts)=>{saved={text,baseline,...artifacts};}},
    render(){preview=session.resolve(JSON.parse(text));}});
  session.replaceProject(original,null,{topologyContext:snapshot});
  diagram(specs[0]).nodes.api.title='CHANGED AFTER OPEN';
  assert.equal(diagram(session.resolve(JSON.parse(text))).nodes['platform::api'].title,'API');
  const edited=JSON.parse(text);diagram(edited).steps[1].text='Local narrative';
  diagram(edited).edges.push({from:'client',to:'platform::store'});
  assert.equal(session.accept({text:JSON.stringify(edited)}),true);
  assert.equal(diagram(preview).steps[1].text,'Local narrative');
  assert.ok(diagram(preview).edges.some(e=>e.from==='client' && e.to==='platform::store'));
  assert.deepEqual(JSON.parse(saved.text),edited);assert.equal(saved.baseline,original);
  assert.ok(diagram(saved.topologyContext.specs[1]).topologyImports);
  assert.equal(diagram(JSON.parse(saved.text)).topologyProvenance,undefined);
  const invalid=structuredClone(edited);diagram(invalid).steps[1].edge='platform::gone->platform::store';
  assert.equal(session.accept({text:JSON.stringify(invalid)}),false);assert.deepEqual(JSON.parse(text),edited);
  const template='<title>Example</title>\n<script type="application/json" id="flowspec">\n{}\n</script>';
  const exported=context.prepareExportSnapshot(text,session.resolve);
  const html=context.buildExportHtml(template,exported.text).html;
  assert.ok(!html.includes('flowview-topology'));assert.ok(!html.includes('topologyImports'));assert.ok(!html.includes('topologyProvenance'));
  assert.ok(html.includes('platform::api'));assert.deepEqual(JSON.parse(text),edited);
  assert.equal(session.undo(),true);assert.equal(text,original);
});


test('custom import centers validate selected identities, shape and relative/absolute bounds',()=>{
  for(const nodePositions of [null,[],{api:null},{api:{x:1}},{api:{x:'1',y:2}},{api:{x:NaN,y:2}},{api:{x:0,y:Infinity}},{api:{x:100001,y:0}},{api:{x:1,y:2,z:3}},{missing:{x:0,y:0}},{'platform::api':{x:0,y:0}}]){
    const specs=source();diagram(specs[1]).topologyImports[0].nodePositions=nodePositions;
    assert.throws(()=>resolve(specs),/Topology checkout.*import.*nodePositions/);
  }
  const specs=source(),imp=diagram(specs[1]).topologyImports[0];imp.position={x:90000,y:0};imp.nodePositions={api:{x:20000,y:0}};
  assert.throws(()=>resolve(specs),/placement exceeds supported coordinate range/);
});
test('subsets and nested imports support custom centers without copying structure',()=>{
  const specs=notificationSource(['push','sms']),consumer=diagram(specs[1]),imp=consumer.topologyImports[0];
  imp.nodes=['dispatcher','push','sms'];imp.edges=['dispatcher->push','dispatcher->sms'];imp.position={x:200,y:300};imp.nodePositions={push:{x:-80,y:120}};
  const baseline=resolve(specs);assert.deepEqual(diagram(baseline[1]).floats.find(f=>f.id==='notify::push'),{id:'notify::push',side:'below',x:120,y:420});
  imp.nodePositions.email={x:0,y:0};assert.throws(()=>resolve(specs),/not selected\/exported: email/);delete imp.nodePositions.email;
  consumer.topologyExports={shared:{nodes:['notify::push','notify::sms'],edges:[]}};
  const outer={page:{title:'Outer',canon:{version:1,id:'outer',kind:'canonical',owner:'group:default/team'},sections:[{diagram:{topologyImports:[{spec:'notification-parent',export:'shared',as:'outer',position:{x:100,y:100},nodePositions:{'notify::sms':{x:40,y:-80}}}]}}]}};
  const result=resolve([...specs,outer]);assert.deepEqual(diagram(result[2]).floats.find(f=>f.id==='outer::notify::sms'),{id:'outer::notify::sms',side:'below',x:140,y:20});
  assert.deepEqual(diagram(result[1]),diagram(baseline[1]));assert.deepEqual(resolve(result),result);
});

test('source and packaged validators agree on browse URL imports and ordinary carrier warnings',()=>{
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),ctx={URL,TextEncoder};vm.createContext(ctx);
  vm.runInContext(loader.composeSources(['canon.js','validator.js']),ctx);
  const plain=value=>JSON.parse(JSON.stringify(value)),specs=notificationSource(['push','email']);
  const imp=diagram(specs[1]).topologyImports[0];
  imp.nodeTracking={dispatcher:{tickets:['https://jira.test/jira/browse/API-123?view=detail#comments','API-123']}};
  imp.edgeTracking={'dispatcher->push':{tickets:['https://jira.test/browse/API-124']}};
  const before=structuredClone(specs),packaged=C.materializeTopology(specs),fromSource=plain(ctx.FlowTopology.materialize(specs));
  assert.deepEqual(packaged,fromSource);assert.deepEqual(specs,before);
  for(const spec of packaged)assert.deepEqual(C.validateSpec(spec),plain(ctx.validate(ctx.normalize(spec))));
  imp.nodeTracking.dispatcher.tickets=['https://user:pass@jira.test/browse/API-123'];
  assert.throws(()=>C.materializeTopology(specs),/invalid tickets entry 0/);
  assert.throws(()=>ctx.FlowTopology.materialize(specs),/invalid tickets entry 0/);
  const carrier={nodes:{a:{tickets:['https://jira.test/browse/API-123','https://jira.test/issues/API-124']}},rows:[['a']]};
  const result=C.validateSpec(carrier);assert.deepEqual(result,plain(ctx.validate(ctx.normalize(carrier))));
  assert.equal(result.errors.length,0);assert.ok(result.warnings.some(w=>w.includes('tickets[1]')));
});
// #1104 PR 1: provider step sets (stepExports). Nothing crosses to consumers yet.
function stepProvider(){
  return {page:{title:'Payments',canon:{version:1,id:'payments',kind:'canonical',owner:'group:default/payments'},sections:[{id:'flow',diagram:{
    nodes:{gateway:{title:'Gateway'},auth:{title:'Auth'},ledger:{title:'Ledger'},audit:{title:'Audit'}},
    rows:[['gateway','auth','ledger','audit']],
    edges:[{from:'gateway',to:'auth'},{from:'auth',to:'ledger'},{from:'ledger',to:'audit'}],
    panels:[{id:'jobs',type:'queue'}],
    topologyExports:{core:{nodes:['gateway','auth','ledger'],edges:['gateway->auth','auth->ledger']},audit:{nodes:['audit'],edges:[]}},
    steps:[
      {id:'authorize',edge:'gateway->auth',text:'Authorize the payment',traceMatch:{serviceName:'auth',operation:'POST /authorize',nodeId:'auth'}},
      {id:'persist',edges:['auth->ledger'],nodes:['ledger'],tone:{ledger:'ok'},contracts:{'auth->ledger':{json:{amount:1}}},
        conditions:[{kind:'slow',label:'Ledger is slow',nodeId:'ledger'}],
        traceMatch:{serviceName:'ledger',operation:'INSERT payment',nodeId:'ledger',parentStepId:'authorize',panelId:'jobs'},
        // Local fields are stripped on import, so they may name provider-only panels and edges.
        panels:{jobs:{state:'full'}},panelVisibility:{jobs:true},coinOffsets:{'auth->ledger':{dx:4,dy:2}},packets:[{edge:'ledger->audit'}],lane:'payments',color:'#123456'},
      {id:'declined',failures:{'auth->ledger':'blocked'},text:'Ledger rejects the write'},
      {id:'record',edge:'ledger->audit',text:'Record the audit entry'},
    ],
    stepExports:{payment:{export:'core',steps:['authorize','persist','declined']}},
  }}]}};
}
function stepConsumer(){
  return {page:{title:'Shop',canon:{version:1,id:'shop',kind:'canonical',owner:'group:default/shop'},sections:[{id:'buy',diagram:{
    topologyImports:[{spec:'payments',export:'core',as:'pay'}],nodes:{cart:{title:'Cart'}},rows:[['cart']],
    edges:[{from:'cart',to:'pay::gateway'}],steps:[{id:'checkout',edge:'cart->pay::gateway',text:'Check out'}],
  }}]}};
}
const stepDiagram=s=>s.page.sections[0].diagram,stepById=(s,id)=>stepDiagram(s).steps.find(step=>step.id===id);
test('provider stepExports declare named step sets; materialization drops the declaration and no step crosses yet',()=>{
  const specs=[stepProvider(),stepConsumer()],before=structuredClone(specs),out=resolve(specs);
  assert.deepEqual(specs,before);assert.deepEqual(resolve(specs),out);
  assert.equal(stepDiagram(out[0]).stepExports,undefined);assert.equal(stepDiagram(out[0]).topologyExports,undefined);
  assert.deepEqual(stepDiagram(out[0]).steps,stepDiagram(before[0]).steps);
  assert.deepEqual(stepDiagram(out[1]).steps,stepDiagram(before[1]).steps);
  assert.deepEqual(out.map(s=>C.validateSpec(s).errors),[[],[]]);
  // Closure checks run even when nobody imports the provider.
  assert.equal(stepDiagram(resolve([stepProvider()])[0]).stepExports,undefined);
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),ctx={URL,TextEncoder};vm.createContext(ctx);
  vm.runInContext(loader.composeSources(['canon.js','validator.js']),ctx);
  const local=stepProvider();delete local.page.canon;
  assert.equal(ctx.FlowTopology.resolveSource(local,null).page.sections[0].diagram.stepExports,undefined);
  // A section that declares only stepExports is still a topology declaration.
  const lone=stepProvider();delete stepDiagram(lone).topologyExports;
  assert.equal(ctx.FlowTopology.hasDeclarations(lone),true);
  assert.throws(()=>resolve([lone]),/payments section flow step set payment: export core is not declared in this section/);
  assert.ok(C.validateSpec(lone).errors.some(e=>e.includes('unresolved topology declarations')));
});
test('step sets fail closure when a crossing reference leaves the bound export, naming spec, section, set and step',()=>{
  const at='Topology payments section flow step set payment: ';
  const cases=[
    [s=>stepById(s,'authorize').edge='ledger->audit','step authorize edge references edge ledger->audit outside export core'],
    [s=>stepById(s,'persist').edges.push('ledger->audit'),'step persist edges references edge ledger->audit outside export core'],
    [s=>stepById(s,'persist').nodes=['audit'],'step persist nodes references node audit outside export core'],
    [s=>stepById(s,'persist').tone={audit:'warn'},'step persist tone references node audit outside export core'],
    [s=>stepById(s,'persist').contracts={'ledger->audit':{json:{}}},'step persist contracts references edge ledger->audit outside export core'],
    [s=>stepById(s,'declined').failures={'ledger->audit':'dropped'},'step declined failures references edge ledger->audit outside export core'],
    [s=>stepById(s,'persist').traceMatch.nodeId='audit','step persist traceMatch.nodeId references node audit outside export core'],
    [s=>stepById(s,'persist').conditions[0].nodeId='audit','step persist conditions[0].nodeId references node audit outside export core'],
    [s=>stepById(s,'persist').traceMatch.parentStepId='record','step persist traceMatch.parentStepId record is not in this step set'],
    // traceMatch may list alternatives (#1100); each one is checked.
    [s=>{const step=stepById(s,'authorize');step.traceMatch=[step.traceMatch,{serviceName:'audit',operation:'write',nodeId:'audit'}];},'step authorize traceMatch[1].nodeId references node audit outside export core'],
    [s=>{const step=stepById(s,'persist');step.traceMatch=[{serviceName:'ledger',operation:'read'},{...step.traceMatch,parentStepId:'record'}];},'step persist traceMatch[1].parentStepId record is not in this step set'],
    [s=>stepDiagram(s).stepExports.payment.steps.push('record'),'step record edge references edge ledger->audit outside export core'],
    [s=>stepDiagram(s).stepExports.payment.steps=['authorize','absent'],'missing or ambiguous exported step absent'],
    [s=>stepDiagram(s).steps.push({id:'authorize',edge:'gateway->auth'}),'missing or ambiguous exported step authorize'],
    [s=>{stepDiagram(s).steps.push({id:'bad id',edge:'gateway->auth'});stepDiagram(s).stepExports.payment.steps.push('bad id');},'step bad id needs a stable id'],
  ];
  for(const [mutate,message] of cases)for(const withConsumer of [false,true]){
    const specs=withConsumer?[stepProvider(),stepConsumer()]:[stepProvider()];mutate(specs[0]);
    const before=structuredClone(specs);
    assert.throws(()=>resolve(specs),error=>error.message.startsWith(at+message),message);
    assert.deepEqual(specs,before);
  }
});
test('malformed step-set declarations and bindings fail',()=>{
  const at='Topology payments section flow';
  const cases=[
    [s=>stepDiagram(s).stepExports=[],at+': stepExports must be a named object'],
    [s=>stepDiagram(s).stepExports={'bad name':{export:'core',steps:['authorize']}},at+': invalid or duplicate step set bad name'],
    [s=>stepDiagram(s).stepExports.payment.hidden=true,at+' step set payment: expected an object with fields export, steps'],
    [s=>delete stepDiagram(s).stepExports.payment.export,at+' step set payment: export must be a name'],
    [s=>stepDiagram(s).stepExports.payment.export=[],at+' step set payment: export must be a name'],
    [s=>stepDiagram(s).stepExports.payment.export=['core','core'],at+' step set payment: export must be a name'],
    [s=>stepDiagram(s).stepExports.payment.export='absent',at+' step set payment: export absent is not declared in this section'],
    [s=>stepDiagram(s).stepExports.payment.export=['core','absent'],at+' step set payment: export absent is not declared in this section'],
    [s=>stepDiagram(s).stepExports.payment.steps=[],at+' step set payment: export at least one step'],
    [s=>stepDiagram(s).stepExports.payment.steps=['authorize','authorize'],at+' step set payment steps: expected an array of unique identities'],
    [s=>stepDiagram(s).stepExports.payment.steps='authorize',at+' step set payment steps: expected an array of unique identities'],
    [s=>{s.page.sections.push({id:'other',diagram:{nodes:{x:{title:'X'}},rows:[['x']],topologyExports:{side:{nodes:['x'],edges:[]}},steps:[{id:'x-step',nodes:['x']}],
      stepExports:{payment:{export:'side',steps:['x-step']}}}});},'Topology payments section other: invalid or duplicate step set payment'],
    [s=>{s.page.sections.push({id:'other',diagram:{nodes:{x:{title:'X'}},rows:[['x']],topologyExports:{side:{nodes:['x'],edges:[]}}}});
      stepDiagram(s).stepExports.payment.export='side';},at+' step set payment: export side is not declared in this section'],
  ];
  for(const [mutate,message] of cases){
    const specs=[stepProvider()];mutate(specs[0]);
    assert.throws(()=>resolve(specs),error=>error.message.startsWith(message),message);
  }
});
test('array-bound step sets close over the merged export union; scalar sets keep the declared edge boundary',()=>{
  const split=binding=>{const s=stepProvider(),d=stepDiagram(s);
    d.topologyExports={entry:{nodes:['gateway','auth'],edges:['gateway->auth']},store:{nodes:['ledger'],edges:[]}};
    d.stepExports.payment.export=binding;return s;};
  // auth->ledger spans entry and store; only the merged union includes it.
  assert.equal(stepDiagram(resolve([split(['entry','store'])])[0]).stepExports,undefined);
  assert.throws(()=>resolve([split('entry')]),/step set payment: step persist edges references edge auth->ledger outside export entry$/);
  assert.throws(()=>resolve([split(['entry'])]),/step set payment: step persist edges references edge auth->ledger outside export entry$/);
  // One export whose declared edges leave out auth->ledger: the scalar binding
  // keeps that boundary, the one-name array adds the edge between its nodes.
  const narrow=binding=>{const s=stepProvider(),d=stepDiagram(s);
    d.topologyExports.core={nodes:['gateway','auth','ledger'],edges:['gateway->auth']};d.stepExports.payment.export=binding;return s;};
  assert.throws(()=>resolve([narrow('core')]),/step set payment: step persist edges references edge auth->ledger outside export core$/);
  assert.equal(stepDiagram(resolve([narrow(['core'])])[0]).stepExports,undefined);
});
test('step-set closure reads step references the way checkReferences does',()=>{
  // stepKeys ignores a stale edge when edges is present, so closure ignores it too.
  const specs=[stepProvider()];stepById(specs[0],'persist').edge='ledger->audit';
  assert.equal(stepDiagram(resolve(specs)[0]).stepExports,undefined);
});
test('a stepExports-only section fails its binding in the resolver, HTML snapshot, validate.js, library build, entity index and visibility check',async t=>{
  const message='step set payment: export core is not declared in this section';
  const lone=()=>{const s=stepProvider();delete stepDiagram(s).topologyExports;return s;};
  const vm=require('node:vm'),loader=require('../tools/source-loader.cjs'),ctx={URL,TextEncoder};vm.createContext(ctx);
  vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/io-model.js']),ctx);
  // A bare diagram without a context resolves instead of passing through.
  assert.throws(()=>ctx.FlowTopology.resolveSource(stepDiagram(lone()),null),new RegExp('Topology local-export section 0 '+message));
  const bare=stepDiagram(stepProvider());
  assert.equal(ctx.FlowTopology.resolveSource(bare,null).stepExports,undefined);
  // With a context, a candidate holding only stepExports is a bare diagram.
  assert.throws(()=>ctx.FlowTopology.resolveSource({stepExports:stepDiagram(stepProvider()).stepExports},{version:1,id:'payments',specs:[stepProvider()]}),
    new RegExp('Topology payments section 0 '+message));
  // The HTML snapshot drops the declaration even when the resolver leaves it.
  const snapshot=ctx.prepareExportSnapshot(JSON.stringify(stepProvider()),raw=>raw);
  assert.equal(snapshot.error,undefined);assert.equal(stepDiagram(JSON.parse(snapshot.text)).stepExports,undefined);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-step-sets-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'payments.json'),JSON.stringify(lone()));
  const cli=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'../tools/validate.js'),path.join(dir,'payments.json')],{encoding:'utf8'});
  assert.equal(cli.status,1,cli.stdout+cli.stderr);assert.ok(cli.stdout.includes(message),cli.stdout);
  assert.ok(!cli.stdout.includes('unresolved topology declarations'),cli.stdout);
  const {buildLibraryFromDirectory}=await import('../tools/canon/library.mjs');
  await assert.rejects(buildLibraryFromDirectory(dir),error=>error.message.includes(message));
  const {buildEntityDiagramIndex}=await import('../tools/canon/entity-diagrams.mjs');
  assert.throws(()=>buildEntityDiagramIndex([lone()]),error=>error.message.includes(message));
  assert.throws(()=>require('../tools/visibility-check.cjs').check(lone(),{version:1,expectations:[]}),error=>error.message.includes(message));
});
test('a consumer can declare a step set over its own steps on imported topology it re-exports',()=>{
  const specs=source(),consumer=diagram(specs[1]);
  consumer.topologyExports={story:{nodes:['platform::api','platform::store'],edges:['platform::api->platform::store']}};
  consumer.stepExports={orders:{export:'story',steps:['persist','unavailable']}};
  const out=resolve(specs);assert.equal(diagram(out[1]).stepExports,undefined);assert.deepEqual(diagram(out[1]).steps,consumer.steps);
  consumer.stepExports.orders.steps.unshift('request');
  assert.throws(()=>resolve(specs),/checkout section checkout step set orders: step request edge references edge client->platform::api outside export story/);
});
// #1104 PR 2: consumers splice imported step sets (stepImports) with namespaced, remapped references.
function stepImporter(stepImports,diagramPatch={}){
  const s=stepConsumer(),d=stepDiagram(s);
  d.topologyImports[0].stepImports=stepImports;
  d.nodes.receipt={title:'Receipt'};d.rows=[['cart','receipt']];d.edges.push({from:'pay::ledger',to:'receipt'});
  d.steps.push({id:'receipt',edge:'pay::ledger->receipt',text:'Show the receipt'},{id:'done',nodes:['cart'],text:'Done'});
  Object.assign(d,diagramPatch);return s;
}
const stepIds=s=>stepDiagram(s).steps.map(step=>step.id);
test('imported step sets splice after their anchor with namespaced ids and remapped references; local fields are stripped',()=>{
  const provider=stepProvider(),persist=stepById(provider,'persist');
  Object.assign(persist,{verdict:'keep',ref:'R-1',sticky:true,delta:true,deltaText:'New in v2',link:'https://example.test/persist'});
  const specs=[provider,stepImporter([{set:'payment',after:'checkout'}])],before=structuredClone(specs),out=resolve(specs),consumer=out[1];
  assert.deepEqual(specs,before);assert.deepEqual(resolve(specs),out);assert.deepEqual(resolve(out),out);
  assert.deepEqual(stepIds(consumer),['checkout','pay::authorize','pay::persist','pay::declined','receipt','done']);
  assert.deepEqual(stepById(consumer,'pay::authorize'),{id:'pay::authorize',edge:'pay::gateway->pay::auth',text:'Authorize the payment',
    traceMatch:{serviceName:'auth',operation:'POST /authorize',nodeId:'pay::auth'}});
  assert.deepEqual(stepById(consumer,'pay::persist'),{id:'pay::persist',edges:['pay::auth->pay::ledger'],nodes:['pay::ledger'],tone:{'pay::ledger':'ok'},
    contracts:{'pay::auth->pay::ledger':{json:{amount:1}}},conditions:[{kind:'slow',label:'Ledger is slow',nodeId:'pay::ledger'}],
    traceMatch:{serviceName:'ledger',operation:'INSERT payment',nodeId:'pay::ledger',parentStepId:'pay::authorize'},
    delta:true,deltaText:'New in v2',link:'https://example.test/persist'});
  assert.deepEqual(stepById(consumer,'pay::declined'),{id:'pay::declined',failures:{'pay::auth->pay::ledger':'blocked'},text:'Ledger rejects the write'});
  assert.equal(stepById(consumer,'pay::record'),undefined);
  assert.deepEqual(stepDiagram(consumer).topologyProvenance.imports[0].steps,['pay::authorize','pay::persist','pay::declined']);
  assert.deepEqual(C.validateSpec(consumer).errors,[]);
  // An array import covers an array binding's merged closure.
  const merged=stepProvider();stepDiagram(merged).topologyExports.core.edges=['gateway->auth'];stepDiagram(merged).stepExports.payment.export=['core'];
  const arrayImport=stepImporter([{set:'payment'}]);stepDiagram(arrayImport).topologyImports[0].export=['core'];
  assert.deepEqual(stepById(resolve([merged,arrayImport])[1],'pay::persist').edges,['pay::auth->pay::ledger']);
  // Each traceMatch alternative is remapped, and its local panelId is stripped.
  const alternatives=stepProvider(),alt=stepById(alternatives,'persist');
  alt.traceMatch=[{serviceName:'ledger',operation:'INSERT payment',nodeId:'ledger',panelId:'jobs'},{serviceName:'ledger',operation:'UPSERT payment',parentStepId:'authorize'}];
  assert.deepEqual(stepById(resolve([alternatives,stepImporter([{set:'payment'}])])[1],'pay::persist').traceMatch,
    [{serviceName:'ledger',operation:'INSERT payment',nodeId:'pay::ledger'},{serviceName:'ledger',operation:'UPSERT payment',parentStepId:'pay::authorize'}]);
  // An import without stepImports keeps its provenance shape.
  assert.equal(Object.hasOwn(diagram(resolve(source())[1]).topologyProvenance.imports[0],'steps'),false);
});
test('step sets without an anchor append; several sets keep declaration order; an earlier imported step can anchor a later set',()=>{
  const two=()=>{const p=stepProvider();stepDiagram(p).stepExports={payment:{export:'core',steps:['authorize','persist']},retry:{export:'core',steps:['declined']}};return p;};
  const ids=stepImports=>stepIds(resolve([two(),stepImporter(stepImports)])[1]);
  assert.deepEqual(ids([{set:'payment'}]),['checkout','receipt','done','pay::authorize','pay::persist']);
  assert.deepEqual(ids([{set:'payment',after:'checkout'},{set:'retry',after:'checkout'}]),['checkout','pay::authorize','pay::persist','pay::declined','receipt','done']);
  assert.deepEqual(ids([{set:'payment',after:'checkout'},{set:'retry',after:'pay::authorize'}]),['checkout','pay::authorize','pay::declined','pay::persist','receipt','done']);
  assert.deepEqual(ids([{set:'retry',after:'receipt'},{set:'payment',after:'checkout'}]),['checkout','pay::authorize','pay::persist','receipt','pay::declined','done']);
});
test('reveal indices at or after the insertion point shift by the inserted count; consumers with paths do not shift',()=>{
  const revealing=(stepImports,patch)=>{
    const s=stepImporter(stepImports,patch),d=stepDiagram(s),sec=s.page.sections[0];
    d.edges[0].revealAt=1;d.edges[1].revealAt=0;d.edges[1].hideAt=2;
    sec.bullets=['plain',{text:'a',revealAt:0},{text:'b',revealAt:1,sub:[{text:'c',hideAt:2},'d']}];
    sec.contracts=[{title:'Order',fields:[{k:'id',revealAt:2},{k:'total'}]}];return s;};
  const reveals=s=>{const d=stepDiagram(s),sec=s.page.sections[0];
    return {edges:d.edges.filter(e=>!e.from.startsWith('pay::') || e.to==='receipt').map(e=>[e.revealAt,e.hideAt]),
      bullets:[sec.bullets[1].revealAt,sec.bullets[2].revealAt,sec.bullets[2].sub[0].hideAt],row:sec.contracts[0].fields[0].revealAt};};
  // Three steps land at index 1: every index >= 1 moves by 3, index 0 stays.
  const shifted=resolve([stepProvider(),revealing([{set:'payment',after:'checkout'}])])[1];
  assert.deepEqual(reveals(shifted),{edges:[[4,undefined],[0,5]],bullets:[0,4,5],row:5});
  assert.deepEqual(C.validateSpec(shifted).errors,[]);
  // Two insertions apply in order: three steps at 1, then one at the end of the resolved array.
  const two=stepProvider();stepDiagram(two).stepExports.retry={export:'core',steps:['declined']};stepDiagram(two).stepExports.payment.steps=['authorize','persist'];
  assert.deepEqual(reveals(resolve([two,revealing([{set:'payment',after:'checkout'},{set:'retry',after:'receipt'}])])[1]),{edges:[[3,undefined],[0,5]],bullets:[0,3,5],row:5});
  // Appending at the end moves nothing that is in range.
  assert.deepEqual(reveals(resolve([stepProvider(),revealing([{set:'payment'}])])[1]),{edges:[[1,undefined],[0,2]],bullets:[0,1,2],row:2});
  // Paths order the steps: imported steps join the registry and nothing shifts.
  const paths=[{id:'happy',steps:['checkout','pay::authorize','pay::persist','receipt']}];
  const withPaths=resolve([stepProvider(),revealing([{set:'payment'}],{paths})])[1];
  assert.deepEqual(stepIds(withPaths),['checkout','receipt','done','pay::authorize','pay::persist','pay::declined']);
  assert.deepEqual(reveals(withPaths),{edges:[[1,undefined],[0,2]],bullets:[0,1,2],row:2});
  assert.deepEqual(C.validateSpec(withPaths).errors,[]);
  assert.deepEqual(C.viewerRouting().diagramForPath(stepDiagram(withPaths),'happy').steps.map(s=>s.id),paths[0].steps);
});
test('relative step time crosses; absolute and time-of-day times are stripped and listed in validator output',()=>{
  const provider=stepProvider();provider.page.sections[0].diagram.storyTime={start:'2026-09-25T06:00'};
  stepById(provider,'authorize').time='+5m';stepById(provider,'persist').time='2026-09-25T06:50';stepById(provider,'declined').time='07:10';
  const consumer=stepImporter([{set:'payment',after:'checkout'}],{storyTime:{start:'2026-09-25T09:00'}});
  const out=resolve([provider,consumer])[1];
  assert.equal(stepById(out,'pay::authorize').time,'+5m');
  assert.equal(Object.hasOwn(stepById(out,'pay::persist'),'time'),false);assert.equal(Object.hasOwn(stepById(out,'pay::declined'),'time'),false);
  const warnings=C.validateSpec(out).warnings.filter(w=>w.includes('was not imported'));
  assert.deepEqual(warnings,[
    'sections[0].diagram.steps[2].time: provider "payments" sections[0].diagram.steps[1].time "2026-09-25T06:50" is not a relative time and was not imported; only relative times (+…) cross',
    'sections[0].diagram.steps[3].time: provider "payments" sections[0].diagram.steps[2].time "07:10" is not a relative time and was not imported; only relative times (+…) cross',
  ]);
  assert.equal(JSON.stringify(out).includes('was not imported'),false);
});
test('step imports fail with consumer, namespace, provider, set and step named',()=>{
  const at='Topology shop section buy import pay (payments export core)';
  const cases=[
    [()=>[stepProvider(),stepImporter([{set:'absent'}])],at+' step set absent: missing step set absent'],
    [()=>{const p=stepProvider(),d=stepDiagram(p);d.topologyExports.side={nodes:['gateway','auth'],edges:['gateway->auth']};d.stepExports.side={export:'side',steps:['authorize']};
      return [p,stepImporter([{set:'side'}])];},at+' step set side: step set binds export side, which this import does not include'],
    [()=>{const c=stepImporter([{set:'payment'}]),imp=stepDiagram(c).topologyImports[0];imp.nodes=['gateway','auth'];imp.edges=['gateway->auth'];
      stepDiagram(c).edges=[{from:'cart',to:'pay::gateway'}];stepDiagram(c).steps=[{id:'checkout',edge:'cart->pay::gateway'}];stepDiagram(c).rows=[['cart']];delete stepDiagram(c).nodes.receipt;
      return [stepProvider(),c];},at+' step set payment: imported step persist edges references edge auth->ledger, which this import does not select'],
    // An array binding closes over connections between its nodes; a scalar import keeps the declared edges only.
    [()=>{const p=stepProvider(),d=stepDiagram(p);d.topologyExports.core.edges=['gateway->auth'];d.stepExports.payment.export=['core'];return [p,stepImporter([{set:'payment'}])];},
      at+' step set payment: imported step persist edges references edge auth->ledger, which this import does not select'],
    [()=>[stepProvider(),stepImporter([{set:'payment',after:'absent'}])],at+' step set payment: after absent is not a step in this diagram'],
    [()=>[stepProvider(),stepImporter([{set:'payment',after:'pay::authorize'}])],at+' step set payment: after pay::authorize is not a step in this diagram'],
    [()=>{const p=stepProvider();stepDiagram(p).stepExports.retry={export:'core',steps:['authorize']};return [p,stepImporter([{set:'payment'},{set:'retry'}])];},
      at+' step set retry: duplicate imported step pay::authorize'],
    [()=>[stepProvider(),stepImporter([{set:'payment'},{set:'payment'}])],at+' stepImports 1: requires a unique step set name'],
    [()=>[stepProvider(),stepImporter([{set:'payment',hidden:true}])],at+' stepImports 0: expected an object with fields set, after'],
    [()=>[stepProvider(),stepImporter({set:'payment'})],'Topology shop section buy import 0: stepImports must be an array'],
    [()=>[stepProvider(),stepImporter([{set:'payment',after:'checkout'}],{paths:[{id:'happy',steps:['checkout']}]})],at+' stepImports 0: this diagram has paths, which order its steps; remove after'],
    [()=>{const c=stepImporter([{set:'payment'}]);stepDiagram(c).steps.push({id:'pay::local',nodes:['cart']});return [stepProvider(),c];},
      'Topology shop section buy: local step id pay::local cannot contain ::'],
  ];
  for(const [build,message] of cases){
    const specs=build(),before=structuredClone(specs);
    assert.throws(()=>resolve(specs),error=>error.message.startsWith(message),message);assert.deepEqual(specs,before);
  }
});
test('removing or renaming a provider step the consumer uses fails the build naming the import and set',()=>{
  const at='Topology shop section buy import pay (payments export core) step sets payment: ';
  const uses={
    path:[{paths:[{id:'happy',steps:['checkout','pay::authorize','pay::persist']}]},'path happy references missing step pay::persist'],
    parent:[{},'step done traceMatch references missing step pay::persist'],
    alternative:[{},'step done traceMatch references missing step pay::persist'],
    view:[{layouts:[{id:'focus',steps:['pay::persist']}]},'view focus references missing step pay::persist'],
    stepMap:[{},'node cart detail stepMap references missing step pay::persist'],
  };
  for(const [kind,[patch,message]] of Object.entries(uses))for(const change of ['remove','rename']){
    const consumer=stepImporter([{set:'payment'}],patch),d=stepDiagram(consumer);
    if(kind==='parent')stepById(consumer,'done').traceMatch={serviceName:'shop',operation:'GET /done',parentStepId:'pay::persist'};
    if(kind==='alternative')stepById(consumer,'done').traceMatch=[{serviceName:'shop',operation:'GET /done'},{serviceName:'shop',operation:'GET /done',parentStepId:'pay::persist'}];
    if(kind==='stepMap')d.nodes.cart.detail={url:'https://example.test/payments',mode:'link',stepMap:{'pay::persist':{}}};
    assert.equal(stepDiagram(resolve([stepProvider(),structuredClone(consumer)])[1]).steps.length,6,kind+': resolves before the change');
    const provider=stepProvider(),pd=stepDiagram(provider);
    if(change==='remove')pd.stepExports.payment.steps=['authorize','declined'];
    else{stepById(provider,'persist').id='persist-v2';pd.stepExports.payment.steps=['authorize','persist-v2','declined'];}
    assert.throws(()=>resolve([provider,consumer]),error=>error.message.startsWith(at+message),kind+' '+change);
  }
});
test('nested providers re-export imported steps under nested namespaces and provenance',()=>{
  const middle=stepImporter([{set:'payment',after:'checkout'}]),md=stepDiagram(middle);
  middle.page.canon.id='middle';
  md.topologyExports={flow:{nodes:['cart','pay::gateway','pay::auth','pay::ledger'],edges:['cart->pay::gateway','pay::gateway->pay::auth','pay::auth->pay::ledger']}};
  md.stepExports={buy:{export:'flow',steps:['checkout','pay::authorize','pay::persist']}};
  const outer={page:{title:'Outer',canon:{version:1,id:'outer',kind:'canonical',owner:'group:default/outer'},sections:[{id:'o',diagram:{
    topologyImports:[{spec:'middle',export:'flow',as:'mid',stepImports:[{set:'buy'}]}]}}]}};
  const out=resolve([stepProvider(),middle,outer])[2],od=stepDiagram(out);
  assert.deepEqual(stepIds(out),['mid::checkout','mid::pay::authorize','mid::pay::persist']);
  assert.equal(stepById(out,'mid::pay::persist').traceMatch.parentStepId,'mid::pay::authorize');
  assert.deepEqual(stepById(out,'mid::pay::persist').edges,['mid::pay::auth->mid::pay::ledger']);
  assert.deepEqual(od.topologyProvenance.imports.map(imp=>[imp.as,imp.steps]),[['mid',['mid::checkout','mid::pay::authorize','mid::pay::persist']],['mid::pay',['mid::pay::authorize','mid::pay::persist']]]);
  assert.deepEqual(C.validateSpec(out).errors,[]);
});
test('step imports declare the flow.imported-steps capability',()=>{
  const vm=require('node:vm'),ctx={};vm.runInNewContext(require('../tools/source-loader.cjs').readSource('compatibility.js'),ctx);
  const F=ctx.FlowviewCompatibility,raw=stepImporter([{set:'payment'}]);
  assert.ok(F.detect(raw).includes('flow.imported-steps'));assert.ok(!F.detect(stepConsumer()).includes('flow.imported-steps'));
  const older={...F.features};delete older['flow.imported-steps'];
  assert.ok(F.check(F.stamp(raw),{version:F.version,contract:'1',features:older}).missingFeatures.includes('flow.imported-steps'));
});
