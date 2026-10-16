'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const c={URL,TextEncoder};vm.createContext(c);
vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/layout.js','workbench/commands/topology.js','workbench/io-model.js','workbench/session.js']),c);
const plain=x=>JSON.parse(JSON.stringify(x));
const ref=id=>({id,repository:'https://github.com/example/service',path:'src/'+id+'.js',revision:'a'.repeat(40),anchor:{start:'start',end:'end'}});
const d=s=>s.page.sections[0].diagram;
function fixtures(){
  const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
  const provider=spec('provider',{nodes:{api:{title:'API',codeRefs:[ref('inherited')]},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist',labelDx:5,curveControls:[{t:0,dx:20,dy:0},{t:1,dx:-20,dy:0}],fromPort:{side:'right',offset:.3}}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const source=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],edges:[{from:'local',to:'shared::api'}],topologyImports:[{spec:'provider',export:'core',as:'shared'}]});
  return {provider,source,context:{version:1,id:'consumer',specs:[provider,source]}};
}
function apply(f,fn){const text=JSON.stringify(f.source,null,2),plan=fn(text,f.source);assert.equal(plan.error,undefined,plan.error);return JSON.parse(plan.text);}
test('local refs append after inherited refs, validate evidence, and preserve provider snapshots',()=>{
  const f=fixtures(),before=plain(f.context),source=apply(f,(t,r)=>c.planTopologyNodeCodeRefs(t,r,0,'shared::api',[ref('local')],f.context));
  assert.deepEqual(d(source).topologyImports[0].nodeCodeRefs,{api:[ref('local')]});
  assert.deepEqual(plain(d(c.FlowTopology.resolveSource(source,f.context)).nodes['shared::api'].codeRefs),[ref('inherited'),ref('local')]);
  assert.deepEqual(f.context,before);assert.equal(d(source).nodes['shared::api'],undefined);
  const removed=apply({...f,source},(t,r)=>c.planTopologyNodeCodeRefs(t,r,0,'shared::api',[],f.context));
  assert.equal(d(removed).topologyImports[0].nodeCodeRefs,undefined);
  assert.match(c.planTopologyNodeCodeRefs(JSON.stringify(f.source),f.source,0,'shared::api',[{id:'bad'}],f.context).error,/repository/);
  const conflict={...ref('inherited'),path:'different.js'};
  assert.match(c.planTopologyNodeCodeRefs(JSON.stringify(f.source),f.source,0,'shared::api',[conflict],f.context).error,/conflicting/);
});
test('resolved imported edge index writes only geometry overlay, alternate curve nulls suppress inheritance, reset restores provider',()=>{
  const f=fixtures(),before=plain(f.context),points=[{t:.5,dx:10,dy:40}];
  const source=apply(f,(t,r)=>c.planEdgeCurve(t,r,0,1,points,false,f.context,'shared::api->shared::store'));
  assert.deepEqual(d(source).edges,d(f.source).edges);
  assert.deepEqual(d(source).topologyImports[0].edgeOverrides,{'api->store':{curvePoints:points,curveControls:null,bend:null}});
  const effective=d(c.FlowTopology.resolveSource(source,f.context)).edges[1];assert.deepEqual(plain(effective.curvePoints),points);assert.equal(effective.curveControls,undefined);assert.equal(effective.labelDx,5);
  const changed=apply({...f,source},(t,r)=>c.planEdgeLayout(t,r,0,1,'shared::api->shared::store',{fromPort:{side:'top',offset:.8},labelDx:22},f.context));
  assert.equal(d(c.FlowTopology.resolveSource(changed,f.context)).edges[1].fromPort.side,'top');
  const reset=apply({...f,source:changed},(t,r)=>c.planResetTopologyEdgeLayout(t,r,0,1,'shared::api->shared::store',f.context));
  assert.equal(d(reset).topologyImports[0].edgeOverrides,undefined);
  assert.deepEqual(plain(d(c.FlowTopology.resolveSource(reset,f.context)).edges[1]),plain(d(c.FlowTopology.resolveSource(f.source,f.context)).edges[1]));
  assert.deepEqual(f.context,before);
  const local=apply(f,(t,r)=>c.planEdgeLayout(t,r,0,0,'local->shared::api',{labelDx:33},f.context));assert.equal(d(local).edges[0].labelDx,33);assert.equal(d(local).topologyImports[0].edgeOverrides,undefined);
});
test('overlay planners reject stale source, wrong identity, snapshots, unknown fields and malformed geometry',()=>{
  const f=fixtures(),t=JSON.stringify(f.source),key='shared::api->shared::store';
  for(const patch of [{from:'other'},{kind:'rpc'},{label:'changed'},{labelDx:Infinity},{labelAt:2},{fromPort:{side:'top',offset:.5,extra:true}},{curvePoints:[{t:.5,dx:NaN,dy:0}]}])assert.ok(c.planEdgeLayout(t,f.source,0,1,key,patch,f.context).error);
  assert.match(c.planEdgeLayout(t+' ',{...f.source,extra:1},0,1,key,{labelDx:1},f.context).error,/source changed/);
  assert.match(c.planEdgeLayout(t,f.source,0,0,key,{labelDx:1},f.context).error,/connection changed/);
  const snapshot=c.FlowTopology.resolveSource(f.source,f.context);
  assert.match(c.planEdgeLayout(JSON.stringify(snapshot),snapshot,0,1,key,{labelDx:1},null).error,/authored consumer/);
  assert.match(c.planTopologyNodeCodeRefs(t,f.source,0,'shared::missing',[ref('local')],f.context).error,/Choose a node/);
});
test('selected identities and nested full provider-relative paths are enforced',()=>{
  const f=fixtures();d(f.source).topologyImports[0].nodeCodeRefs={api:[ref('local')]};d(f.source).topologyImports[0].edges=[];d(f.source).topologyImports[0].edgeOverrides={'api->store':{labelDx:1}};
  assert.throws(()=>c.FlowTopology.resolveSource(f.source,f.context),/not selected\/exported/);
  delete d(f.source).topologyImports[0].edgeOverrides;d(f.source).topologyImports[0].nodes=['store'];
  assert.throws(()=>c.FlowTopology.resolveSource(f.source,f.context),/nodeCodeRefs identity/);
  const g=fixtures(),middle=plain(g.source);middle.page.canon.id='middle';d(middle).edges=[];d(middle).topologyExports={nested:{nodes:['shared::api','shared::store'],edges:['shared::api->shared::store']}};
  d(g.source).topologyImports=[{spec:'middle',export:'nested',as:'outer'}];d(g.source).edges=[];g.context.specs=[g.provider,middle,g.source];
  const changed=apply(g,(t,r)=>c.planTopologyNodeCodeRefs(t,r,0,'outer::shared::api',[ref('nested')],g.context));
  assert.deepEqual(d(changed).topologyImports[0].nodeCodeRefs,{'shared::api':[ref('nested')]});
  const edge=apply({...g,source:changed},(t,r)=>c.planEdgeLayout(t,r,0,0,'outer::shared::api->outer::shared::store',{labelDy:44},g.context));
  assert.deepEqual(d(edge).topologyImports[0].edgeOverrides,{'shared::api->shared::store':{labelDy:44}});
});
test('one session transaction has exact undo/redo and frozen recovery with effective overlays',()=>{
  const f=fixtures();let text=JSON.stringify(f.source,null,2),saved;
  const session=c.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){},persistence:{read:()=>({}),preserve(){},cancel(){},save:(value,baseline,artifacts)=>saved={value,artifacts}}});
  session.replaceProject(text,null,{topologyContext:f.context});const before=text,snapshot=session.snapshot();
  const plan=c.planTopologyNodeCodeRefs(text,snapshot.raw,0,'shared::api',[ref('local')],session.topologyContext());assert.equal(session.accept(plan,{snapshot}),true);
  const after=text;assert.notEqual(before,after);session.undo();assert.equal(text,before);session.redo();assert.equal(text,after);
  assert.deepEqual(plain(saved.artifacts.topologyContext),f.context);
  assert.equal(d(session.resolve(JSON.parse(text))).nodes['shared::api'].codeRefs.length,2);
});

test('provider refresh retains local additions and only masks explicitly overridden geometry',()=>{
  const f=fixtures();d(f.source).topologyImports[0].nodeCodeRefs={api:[ref('local')]};d(f.source).topologyImports[0].edgeOverrides={'api->store':{labelDx:44,curveControls:null}};
  d(f.provider).nodes.api.codeRefs=[ref('new-inherited')];d(f.provider).edges[0].labelDy=17;d(f.provider).edges[0].labelDx=99;
  const effective=d(c.FlowTopology.resolveSource(f.source,f.context));
  assert.deepEqual(plain(effective.nodes['shared::api'].codeRefs),[ref('new-inherited'),ref('local')]);assert.equal(effective.edges[1].labelDx,44);assert.equal(effective.edges[1].labelDy,17);assert.equal(effective.edges[1].curveControls,undefined);
  d(f.provider).topologyExports.core.edges=[];assert.throws(()=>c.FlowTopology.resolveSource(f.source,f.context),/edgeOverrides identity/);
});
