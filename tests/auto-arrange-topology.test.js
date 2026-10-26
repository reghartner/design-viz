'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {composeSources}=require('../tools/source-loader.cjs');
const C={URL,setTimeout,clearTimeout};vm.createContext(C);
vm.runInContext(composeSources(['canon.js','validator.js','core/arrange/placement.js','core/arrange/routing.js','core/arrange/graph.js','core/arrange/groups.js','workbench/auto-arrange-core.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/layout.js','workbench/io-model.js','workbench/session.js','workbench/lifetime.js','workbench/auto-arrange.js']),C);
const plain=x=>JSON.parse(JSON.stringify(x)),d=s=>s.page.sections[0].diagram;
const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
function fixtures(mixed=false){
 const provider=spec('provider',{nodes:{a:{title:'API'},b:{title:'Store'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Persist',labelAt:.4,bend:40,fromDx:5,fromDy:6,toDx:7,toDy:8,labelDx:22,labelDy:23,curvePoints:[{t:.5,dx:10,dy:20}]}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
 const source=spec('consumer',{nodes:mixed?{local:{title:'Local'}}:{},rows:mixed?[['local']]:[[]],edges:mixed?[{from:'local',to:'shared::a',label:'Request',bend:15}]:[],topologyImports:[{spec:'provider',export:'core',as:'shared',nodeOverrides:{a:{title:'Consumer API'}},edgeOverrides:{'a->b':{label:'Consumer persist',labelDx:99}}}],autoplay:false});
 return {provider,source,context:{version:1,id:'consumer',specs:[provider,source]}};
}
function arrange(f){
 const text=JSON.stringify(f.source,null,2),got=C.builderArrangementSource(text,f.source,0,f.context);assert.equal(got.error,undefined);
 const result=C.autoArrangeCandidates(got.effective),plan=C.planAutoArrange(text,f.source,0,result,f.context);assert.equal(plan.error,undefined,plan.error);
 return {result,plan,source:JSON.parse(plan.text),effective:d(C.FlowTopology.resolveSource(JSON.parse(plan.text),f.context))};
}
for(const mixed of [false,true])test('whole graph arranges '+(mixed?'local and imported':'import-only')+' nodes with exact resolved geometry and authored ownership',()=>{
 const f=fixtures(mixed),before=plain(f),out=arrange(f),changed=d(out.source),original=d(f.source);
 assert.deepEqual(f,before);assert.deepEqual(changed.nodes,original.nodes);assert.equal(changed.topologyProvenance,undefined);
 assert.deepEqual(changed.floats.map(f=>f.id),mixed?['local']:[]);assert.equal(changed.edges.length,original.edges.length);
 assert.deepEqual(changed.topologyImports[0].nodeOverrides,original.topologyImports[0].nodeOverrides);
 const positions=C.layout(out.effective).pos;
 for(const p of out.result.positions){assert.equal(positions[p.id].cx,p.x);assert.equal(positions[p.id].cy,p.y);}
 out.effective.edges.forEach((edge,i)=>{
  for(const key of C.AUTO_ARRANGE_EDGE_FIELDS)assert.deepEqual(plain(edge[key]??null),plain(out.result.edges[i][key]??null),key);
 });
 const imp=changed.topologyImports[0],overlay=imp.edgeOverrides['a->b'];assert.equal(overlay.label,'Consumer persist');
 for(const key of ['bend','curvePoints','fromDx','fromDy','toDx','toDy'])assert.equal(overlay[key],null,key);
 assert.equal(out.effective.edges.at(-1).labelAt,.4);assert.equal(out.effective.nodes['shared::a'].title,'Consumer API');
 assert.deepEqual(changed.graphFrame,plain(out.result.frame));
});
test('imports can omit local nodes entirely and all resolved locks remain a no-op',()=>{
 const f=fixtures();delete d(f.source).nodes;delete d(f.source).edges;
 const out=arrange(f);assert.equal(d(out.source).nodes,undefined);assert.deepEqual(d(out.source).floats,[]);
 for(const node of Object.values(d(f.provider).nodes))node.locked=true;
 assert.deepEqual(plain(C.planAutoArrange(JSON.stringify(f.source),f.source,0,null,f.context)),{noop:true});
 const snapshot=C.FlowTopology.resolveSource(f.source,f.context);
 assert.match(C.planAutoArrange(JSON.stringify(snapshot),snapshot,0,null).error,/authored consumer/);
});
test('multiple direct imports preserve full nested relative identities and selection shares their writer',()=>{
 const f=fixtures(true),middle=spec('middle',{nodes:{},rows:[[]],edges:[],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::a','inner::b'],edges:['inner::a->inner::b']}}});
 d(f.source).topologyImports.push({spec:'middle',export:'nested',as:'outer'});f.context.specs.push(middle);
 const out=arrange(f),imports=d(out.source).topologyImports;
 assert.deepEqual(Object.keys(imports[1].nodePositions).sort(),['inner::a','inner::b']);assert.deepEqual(Object.keys(imports[1].edgeOverrides),['inner::a->inner::b']);
 assert.equal(imports[1].spec,'middle');assert.equal(imports[1].export,'nested');
 const targets=['shared::a','outer::inner::b'].map(id=>({kind:'node',section:0,id}));
 const plan=C.planTransformFloats(out.plan.text,out.source,targets,{type:'move',dx:20,dy:30},f.context);assert.equal(plan.error,undefined);
 const moved=C.layout(d(C.FlowTopology.resolveSource(JSON.parse(plan.text),f.context))).pos,before=C.layout(out.effective).pos;
 for(const {id} of targets){assert.equal(moved[id].cx,before[id].cx+20);assert.equal(moved[id].cy,before[id].cy+30);}
});
test('missing frozen context is reported before empty or missing-endpoint checks, including selection',()=>{
 for(const mixed of [false,true]){
  const f=fixtures(mixed),text=JSON.stringify(f.source),message='Open this spec from Canon to arrange imported nodes.';
  assert.equal(C.builderArrangementSource(text,f.source,0,null).error,message);
  assert.equal(C.planAutoArrange(text,f.source,0,null,null).error,message);
  assert.equal(C.planTransformFloats(text,f.source,['shared::a','shared::b'].map(id=>({kind:'node',section:0,id})),{type:'move',dx:1,dy:1},null).error,message);
 }
 const f=fixtures(),snapshot=C.FlowTopology.resolveSource(f.source,f.context),text=JSON.stringify(snapshot);
 assert.match(C.planAutoArrange(text,snapshot,0,C.autoArrangeCandidates(d(snapshot))).error,/authored consumer/);
});
test('public limits count resolved imported nodes and edges',()=>{
 for(const kind of ['nodes','edges']){
  const f=fixtures(true),provider=d(f.provider),count=kind==='nodes'?80:18,ids=Array.from({length:count},(_,i)=>'n'+i);
  provider.nodes=Object.fromEntries(ids.map(id=>[id,{title:id}]));provider.rows=[ids];
  provider.edges=kind==='nodes'?[]:ids.flatMap(from=>ids.filter(to=>to!==from).map(to=>({from,to}))).slice(0,160);
  provider.topologyExports.core={nodes:ids,edges:provider.edges.map(e=>e.from+'->'+e.to)};
  d(f.source).edges=[{from:'local',to:'shared::n0'}];delete d(f.source).topologyImports[0].nodeOverrides;delete d(f.source).topologyImports[0].edgeOverrides;
  const got=C.builderArrangementSource(JSON.stringify(f.source),f.source,0,f.context);assert.equal(got.error,undefined);
  assert.throws(()=>C.autoArrangeInput(got.effective),/80 nodes and 160 connections/);
 }
});
test('locks, other sections and one-step exact history survive imported arrangement',()=>{
 const f=fixtures(true);d(f.provider).nodes.a.locked=true;d(f.source).nodes.local.locked=true;
 f.source.page.sections.push({heading:'Untouched',diagram:{nodes:{x:{title:'Other'}},rows:[['x']]}});
 const beforeEffective=d(C.FlowTopology.resolveSource(f.source,f.context)),out=arrange(f),before=C.layout(beforeEffective).pos,after=C.layout(out.effective).pos;
 for(const id of ['local','shared::a']){assert.equal(after[id].cx,before[id].cx);assert.equal(after[id].cy,before[id].cy);}
 assert.deepEqual(out.source.page.sections[1],f.source.page.sections[1]);
 let text=JSON.stringify(f.source,null,2),saved;
 const session=C.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){},persistence:{read:()=>({}),preserve(){},cancel(){},save:(value,baseline,artifacts)=>saved=artifacts}});
 session.replaceProject(text,null,{topologyContext:f.context});const original=text,snapshot=session.snapshot();
 assert.equal(session.accept(out.plan,{snapshot}),true);const changed=text;session.undo();assert.equal(text,original);session.redo();assert.equal(text,changed);assert.deepEqual(plain(saved.topologyContext),f.context);
});
test('invalid imported geometry and excessive relative coordinates leave authored source unchanged',()=>{
 const f=fixtures(),out=arrange(f),text=JSON.stringify(f.source),bad=plain(out.result);bad.edges[0].curveControls=[{}];
 assert.match(C.planAutoArrange(text,f.source,0,bad,f.context).error,/invalid geometry/);
 d(f.source).topologyImports[0].position={x:-99900,y:0};const far=plain(out.result);far.positions.forEach(p=>p.x=99900);
 assert.match(C.planAutoArrange(JSON.stringify(f.source),f.source,0,far,f.context).error,/Relative node position/);
 assert.equal(d(f.source).topologyImports[0].nodePositions,undefined);
 for(const value of [Infinity,100001,'bad',{}])assert.throws(()=>C.FlowTopology.validateEdgeOverride({fromDx:value},'route'),/invalid fromDx/);
});
// Exercise async publication without a real DOM/worker: the browser suite covers
// the production worker, while this seam deliberately holds its response.
class Element extends EventTarget{
 constructor(){super();this.children=new Map();this.open=false;}
 querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
 setAttribute(){} appendChild(child){this.child=child;} focus(){} showModal(){this.open=true;} close(){this.open=false;} remove(){}
}
test('a provider-context revision invalidates pending controller geometry with identical text/project/section',async()=>{
 const f=fixtures(),text=JSON.stringify(f.source),effective=d(C.FlowTopology.resolveSource(f.source,f.context));
 let revision=1,resolve,commits=0;const button=new Element(),body=new Element();
 const controller=C.createAutoArrangeController({document:{body,createElement:()=>new Element()},button,src:new Element(),view:new Element(),pause(){},message(){},context:()=>({text,raw:f.source,project:1,section:0,topologyRevision:revision,topologyContext:f.context,diagram:effective}),run:()=>({promise:new Promise(r=>resolve=r),cancel(){}}),commit(){commits++;return true;}});
 button.dispatchEvent(new Event('click'));body.child.querySelector('[data-arrange-confirm]').dispatchEvent(new Event('click'));
 revision++;resolve(C.autoArrangeCandidates(effective));await new Promise(r=>setImmediate(r));
 assert.equal(commits,0);assert.match(body.child.querySelector('[data-arrange-status]').textContent,/changed/);controller.destroy();
});
