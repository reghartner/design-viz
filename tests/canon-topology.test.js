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
  const specs=source(),d=diagram(specs[0]);delete d.nodes.api;d.rows=[['store']];d.edges=[];d.topologyExports.core={nodes:['store'],edges:[]};
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
