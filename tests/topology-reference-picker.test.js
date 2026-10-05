'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const loader=require('../tools/source-loader.cjs'),C=require('../tools/canon/core.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const diagram=spec=>spec.page.sections[0].diagram;
function fixtures(){
  function spec(id,d){return {page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram:d}]}};}
  const provider=spec('provider',{nodes:{a:{title:'A',group:'g'},b:{title:'B',group:'g'},c:{title:'C'},private:{title:'Private'}},groups:{g:{label:'Owned'}},rows:[['a','b','c','private']],edges:[{from:'a',to:'b',kind:'custom'},{from:'b',to:'c'}],topologyExports:{public:{nodes:['a','b','c'],edges:['a->b','b->c']}}});
  provider.page.protocols={custom:{label:'Custom',color:'#667788'}};
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[]});
  return [provider,consumer];
}
function harness(extra={}){
  const context={URL,TextEncoder,Response,location:{href:'https://test.invalid/workbench/flowspec.html'},window:{crypto:webcrypto},...extra};
  vm.createContext(context);vm.runInContext(loader.composeSources(['canon.js','validator.js','viewer/workspace-handoff.js','library.workbench.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/topology.js','workbench/session.js']),context);return context;
}
const reference={spec:'provider',export:'public',as:'child',nodes:['a','b'],edges:['a->b']};
test('subsets preserve export safety, endpoint closure, groups, protocols and provider order',()=>{
  const specs=fixtures();diagram(specs[1]).topologyImports=[reference];
  diagram(specs[1]).edges.push({from:'local',to:'child::a'});diagram(specs[1]).steps=[{edge:'child::a->child::b'}];
  const original=clone(specs),resolved=C.materializeTopology(specs),d=diagram(resolved[1]);
  assert.deepEqual(Object.keys(d.nodes),['local','child::a','child::b']);assert.deepEqual(d.groups,{'child::g':{label:'Owned'}});
  assert.deepEqual(resolved[1].page.protocols,specs[0].page.protocols);assert.deepEqual(specs,original);
  diagram(specs[1]).topologyImports[0]={...reference,nodes:['b','a']};assert.deepEqual(C.materializeTopology(specs),resolved);
  for(const bad of [{nodes:['private'],edges:[]},{edges:['a->private']},{nodes:['a'],edges:['a->b']},{nodes:[]},{nodes:['a','a']},{edges:null}]){
    const broken=clone(original);diagram(broken[1]).topologyImports[0]={...reference,...bad};assert.throws(()=>C.materializeTopology(broken),/Topology.*(not exported|both endpoints|at least one|unique identities)/);
  }
  const removed=clone(original);diagram(removed[0]).topologyExports.public.edges=['b->c'];
  assert.throws(()=>C.materializeTopology(removed),/consumer.*import child.*not exported: a->b/);
});
test('node-only subset and independent omission defaults remain valid',()=>{
  const specs=fixtures();diagram(specs[1]).topologyImports=[{...reference,edges:[]}];
  assert.equal(diagram(C.materializeTopology(specs)[1]).edges.length,0);
  delete diagram(specs[1]).topologyImports[0].nodes;
  assert.equal(Object.keys(diagram(C.materializeTopology(specs)[1]).nodes).length,4);
  delete diagram(specs[1]).topologyImports[0].edges;
  assert.equal(diagram(C.materializeTopology(specs)[1]).edges.length,2);
});
test('headless insertion is surgical, rejects collisions and invalid candidates, and has one Undo',()=>{
  const c=harness(),specs=fixtures(),raw=specs[1],original=JSON.stringify(raw,null,4)+'\n',context={version:1,id:'consumer',specs,catalog:{version:3,diagrams:[]}};
  const plan=c.planAddTopologyImport(original,raw,0,reference,context);assert.equal(plan.error,undefined);
  const authored=JSON.parse(plan.text);assert.deepEqual(diagram(authored).topologyImports,[reference]);
  delete diagram(authored).topologyImports;assert.deepEqual(authored,raw);assert.ok(plan.text.endsWith('\n'));
  assert.equal(plan.id,'child::a');assert.ok(!plan.text.includes('topologyProvenance'));assert.ok(!plan.text.includes('child::a'));
  assert.match(c.planAddTopologyImport(plan.text,JSON.parse(plan.text),0,reference,context).error,/duplicate namespace/);
  assert.match(c.planAddTopologyImport(original,raw,0,{...reference,as:'not a token'},context).error,/namespace/);
  assert.equal(c.topologyNamespace({topologyImports:[reference]},'child'),'child-2');
  let text='',saved,preview;
  const session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},persistence:{read:()=>({}),preserve(){},cancel(){},save:(value,baseline,artifacts)=>saved={value,...artifacts}},render(){preview=session.resolve(JSON.parse(text));}});
  const initial={...context,specs:[raw]};session.replaceProject(original,null,{topologyContext:initial});
  const snapshot=session.snapshot();assert.equal(session.accept(plan,{snapshot,topologyContext:context}),true);
  assert.equal(text,plan.text);assert.ok(diagram(preview).nodes['child::b']);assert.equal(saved.topologyContext.specs.length,2);
  assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);assert.equal(session.redo(),true);assert.equal(text,plan.text);
  assert.equal(session.accept(plan,{snapshot,topologyContext:context}),false);
  const altered=clone(context);diagram(altered.specs[0]).nodes.a.title='Refresh';
  assert.equal(session.accept({...plan},{topologyContext:altered}),false);assert.equal(text,plan.text);
});
test('referenced block removal preflights every consumer-owned reference and succeeds as one undoable authored edit',()=>{
  const c=harness(),specs=fixtures(),raw=specs[1],d=diagram(raw),context={version:1,id:'consumer',specs,catalog:{version:3,diagrams:[]}};
  d.topologyImports=[reference];
  d.edges=[{from:'local',to:'child::a'}];
  d.nodes.local.group='child::g';
  d.steps=[{id:'use-import',edge:'child::a->child::b',failures:{'child::a->child::b':'blocked'},packets:[{edge:'child::a->child::b'}],nodes:['child::a'],tone:{'child::b':'warn'},conditions:[{kind:'delivery-failed',label:'Delivery failed',nodeId:'child::a'}],traceMatch:{serviceName:'provider',operation:'send',nodeId:'child::b'}}];
  d.topologyExports={relay:{nodes:['child::a','child::b'],edges:['child::a->child::b']}};
  d.panels=[{id:'phone',type:'deviceapp',sources:[{id:'provider',node:'child::a'}]}];
  const text=JSON.stringify(raw,null,2),blocked=c.planRemoveTopologyImport(text,raw,0,'child',context);
  assert.match(blocked.error,/Cannot remove referenced topology child/);
  assert.deepEqual(Array.from(blocked.blockers,b=>b.label),['Consumer connections','Group references','Story connection references','Failure references','Packet references','Step node references','Tone patches','Conditions','Trace matches','Shared topology exports','Panel references']);
  assert.match(blocked.error,/local->child::a/);assert.match(blocked.error,/use-import → child::a->child::b/);assert.match(blocked.error,/relay → node child::a/);assert.match(blocked.error,/phone → child::a/);
  assert.equal(JSON.stringify(raw,null,2),text);
  delete d.edges;delete d.nodes.local.group;delete d.steps;delete d.topologyExports;delete d.panels;
  const ready=JSON.stringify(raw,null,2),plan=c.planRemoveTopologyImport(ready,raw,0,'child',context);
  assert.equal(plan.error,undefined);assert.equal(diagram(JSON.parse(plan.text)).topologyImports,undefined);
  let current='',rendered;const session=c.createBuilderSession({source:{read:()=>current,write:value=>current=value},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}},render(){rendered=session.resolve(JSON.parse(current));}});
  session.replaceProject(ready,null,{topologyContext:context});const snapshot=session.snapshot();
  assert.equal(session.accept(plan,{snapshot}),true);assert.equal(diagram(rendered).nodes['child::a'],undefined);
  assert.equal(session.undo(),true);assert.ok(diagram(JSON.parse(current)).topologyImports);assert.equal(session.redo(),true);assert.equal(diagram(JSON.parse(current)).topologyImports,undefined);
});
test('catalog loader verifies frozen revisions, acquires only explicit closure, and never refetches a provider',async()=>{
  const {digest}=await import('../tools/canon/drift.mjs');const specs=fixtures(),hits=[];
  const catalog={version:3,diagrams:specs.map(spec=>({id:spec.page.canon.id,canon:spec.page.canon,title:spec.page.title,counts:{nodes:0,steps:0,panels:0},revision:digest(spec),specUrl:'../diagrams/'+spec.page.canon.id+'.json'}))};
  const c=harness({fetch:async url=>{hits.push(url);return new Response(JSON.stringify(specs.find(spec=>url.endsWith('/'+spec.page.canon.id+'.json'))));}});
  const context={version:1,id:'consumer',specs:[clone(specs[1])],catalog,catalogURL:'https://test.invalid/workbench/diagrams.json'};
  const client=c.createTopologyCatalogLoader(context);assert.equal(hits.length,0);
  const result=await client.load('provider');assert.equal(result.context.specs.length,2);assert.equal(hits.length,1);assert.equal(context.specs.length,1);
  diagram(specs[0]).nodes.a.title='Later deployment';
  assert.equal(diagram((await client.load('provider',result.context)).source).nodes.a.title,'A');assert.equal(hits.length,1);
  await assert.rejects(c.createTopologyCatalogLoader(context).load('provider'),/revision mismatch/);
  await assert.rejects(client.load('missing'),/Missing authored provider/);
  assert.throws(()=>c.createTopologyCatalogLoader({version:1,specs:[]}),/unavailable/);
});
test('an unsaved local consumer explicitly pins repository providers without persisting its ephemeral identity',async()=>{
  const {digest}=await import('../tools/canon/drift.mjs'),provider=fixtures()[0],raw={page:{title:'New draft',sections:[{diagram:{nodes:{local:{title:'Local'}},rows:[['local']],edges:[]}}]}};
  const catalog={version:3,diagrams:[{id:'provider',title:'Provider',canon:provider.page.canon,counts:{nodes:4,steps:0,panels:0},revision:digest(provider),specUrl:'provider.json'}]};
  const hits=[],c=harness({fetch:async url=>{hits.push(String(url));return new Response(JSON.stringify(String(url).endsWith('diagrams.json')?catalog:provider));}});
  const pinned=await c.connectTopologyRepository(raw);assert.equal(pinned.ephemeral,true);assert.match(pinned.id,/^workbench-draft/);assert.equal(JSON.stringify(raw).includes('canon'),false);
  const loaded=await c.createTopologyCatalogLoader(pinned).load('provider'),text=JSON.stringify(raw,null,2),plan=c.planAddTopologyImport(text,raw,0,reference,loaded.context);
  assert.equal(plan.error,undefined);assert.equal(JSON.stringify(JSON.parse(plan.text)).includes('workbench-draft'),false);
  let current='',saved;const session=c.createBuilderSession({source:{read:()=>current,write:value=>current=value},persistence:{read:()=>({}),preserve(){},cancel(){},save:(value,baseline,artifacts)=>saved={value,artifacts}},render(){session.resolve(JSON.parse(current));}});
  session.replaceProject(text);const snapshot=session.snapshot();assert.equal(session.accept(plan,{snapshot,topologyContext:loaded.context}),true);
  const authored=JSON.parse(current);assert.deepEqual(diagram(authored).topologyImports,[reference]);assert.equal(authored.page.canon,undefined);
  assert.equal(saved.artifacts.topologyContext.ephemeral,true);assert.deepEqual(hits.map(url=>url.split('/').pop()),['diagrams.json','provider.json']);
  await assert.rejects(harness({location:{href:'file:///tmp/flowspec.html'}}).connectTopologyRepository(raw),/deployed repository catalog/);
});
test('catalog acquisition loads nested dependencies once, fails transport safely, and refuses offline or foreign catalogs',async()=>{
  const {digest}=await import('../tools/canon/drift.mjs');const specs=fixtures(),nested=clone(specs[1]);
  nested.page.canon.id='nested';diagram(nested).topologyImports=[reference];
  diagram(nested).topologyExports={child:{nodes:['child::a','child::b'],edges:['child::a->child::b']}};specs.push(nested);
  const context={version:1,id:'consumer',specs:[specs[1]],catalogURL:'https://test.invalid/workbench/diagrams.json',catalog:{version:3,diagrams:specs.map(spec=>({id:spec.page.canon.id,canon:spec.page.canon,counts:{nodes:0,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))}};
  const hits=[],c=harness({fetch:async url=>{hits.push(String(url));return new Response(JSON.stringify(specs.find(spec=>String(url).endsWith('/'+spec.page.canon.id+'.json'))));}});
  const client=c.createTopologyCatalogLoader(context),result=await client.load('nested');
  assert.deepEqual(hits.map(url=>url.split('/').pop()),['nested.json','provider.json']);assert.equal(result.context.specs.length,3);
  result.source.page.title='caller mutation';assert.notEqual((await client.load('nested')).source.page.title,'caller mutation');assert.equal(hits.length,2);
  const failed=harness({fetch:async()=>{throw Error('Network offline');}});await assert.rejects(failed.createTopologyCatalogLoader(context).load('nested'),/Network offline/);
  const denied=harness({fetch:async()=>new Response('',{status:403})});await assert.rejects(denied.createTopologyCatalogLoader(context).load('nested'),/unavailable \(403\)/);
  assert.equal(context.specs.length,1);
  assert.throws(()=>harness({location:{href:'file:///tmp/workbench.html'}}).createTopologyCatalogLoader(context),/unavailable/);
  assert.throws(()=>c.createTopologyCatalogLoader({...context,catalogURL:'https://elsewhere.invalid/diagrams.json'}),/origin/);
});

for(const failure of ['network','403','malformed JSON','revision mismatch'])test('catalog retries '+failure+' without evicting successful frozen dependencies',async()=>{
  const {digest}=await import('../tools/canon/drift.mjs');const specs=fixtures(),nested=clone(specs[1]);
  nested.page.canon.id='nested';diagram(nested).topologyImports=[reference];specs.push(nested);
  const context={version:1,id:'consumer',specs:[specs[1]],catalogURL:'https://test.invalid/workbench/diagrams.json',catalog:{version:3,diagrams:specs.map(spec=>({id:spec.page.canon.id,canon:spec.page.canon,counts:{nodes:0,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))}};
  let repaired=false;const hits=[];
  const c=harness({fetch:async url=>{
    const id=String(url).split('/').pop().replace('.json','');hits.push(id);
    if(id==='provider' && !repaired){
      if(failure==='network')throw Error('Network offline');
      if(failure==='403')return new Response('',{status:403});
      if(failure==='malformed JSON')return new Response('not JSON');
      const changed=clone(specs[0]);changed.page.title='Wrong revision';return new Response(JSON.stringify(changed));
    }
    return new Response(JSON.stringify(specs.find(spec=>spec.page.canon.id===id)));
  }});
  const client=c.createTopologyCatalogLoader(context);
  const failed=await Promise.allSettled([client.load('nested'),client.load('nested')]);
  assert.ok(failed.every(result=>result.status==='rejected'));
  assert.deepEqual(hits,['nested','provider']);assert.equal(context.specs.length,1);
  repaired=true;const retried=await client.load('nested');assert.equal(retried.context.specs.length,3);
  assert.deepEqual(hits,['nested','provider','provider'],'only the rejected request is reacquired');
  diagram(specs[0]).nodes.a.title='Later deployment';nested.page.title='Later nested deployment';
  const frozen=await client.load('nested',retried.context);
  assert.equal(diagram(frozen.resolved).nodes['child::a'].title,'A');assert.notEqual(frozen.source.page.title,'Later nested deployment');
  assert.deepEqual(hits,['nested','provider','provider'],'successful provider snapshots stay cached');
});
