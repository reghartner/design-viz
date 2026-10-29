'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {composeSources}=require('../tools/source-loader.cjs');
const C={URL};vm.createContext(C);
vm.runInContext(composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/layout.js','workbench/io-model.js','workbench/session.js']),C);
const plain=x=>JSON.parse(JSON.stringify(x)),diagram=s=>s.page.sections[0].diagram;
function fixture(){
 const spec=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{diagram:d}]}});
 const provider=spec('provider',{nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'}},rows:[[]],floats:[{id:'a',x:100,y:100},{id:'b',x:350,y:350},{id:'c',x:900,y:900}],topologyExports:{core:{nodes:['a','b','c'],edges:[]}}});
 const source=spec('consumer',{nodes:{local:{title:'Local'},locked:{title:'Locked',locked:true}},rows:[[]],floats:[{id:'local',x:100,y:100},{id:'locked',x:200,y:200}],topologyImports:[{spec:'provider',export:'core',as:'shared'}]});
 return {source,provider,context:{version:1,id:'consumer',specs:[provider,source]}};
}
const positions=(f,source=f.source)=>C.layout(diagram(C.FlowTopology.resolveSource(source,f.context))).pos;
function selection(f,ids){const pos=positions(f);return {targets:ids.map(id=>({kind:'node',section:0,id})),rects:ids.map(id=>({x:pos[id].cx-pos[id].w/2,y:pos[id].cy-pos[id].h/2,w:pos[id].w,h:pos[id].h}))};}
function assertMoved(f,next,ids,dx,dy){const before=positions(f),after=positions(f,next);for(const id of Object.keys(before)){assert.equal(after[id].cx,before[id].cx+(ids.includes(id)?dx:0),id+' x');assert.equal(after[id].cy,before[id].cy+(ids.includes(id)?dy:0),id+' y');}}
for(const ids of [['shared::a'],['shared::a','shared::b'],['local','shared::a'],['shared::a','local'],['local']])test('nudge preserves ownership and all unselected positions: '+ids.join(', '),()=>{
 const f=fixture(),before=plain(f),{targets,rects}=selection(f,ids),text=JSON.stringify(f.source,null,2),plan=C.planNudgeSpatial(text,f.source,targets,null,rects,30,50,f.context);assert.equal(plan.error,undefined,plan.error);
 const next=JSON.parse(plan.text);assertMoved(f,next,ids,30,50);assert.deepEqual(f,before);assert.deepEqual(diagram(next).nodes,diagram(f.source).nodes);assert.deepEqual(diagram(next).floats.map(f=>f.id),['local','locked']);assert.equal(diagram(next).topologyProvenance,undefined);
 const imp=diagram(next).topologyImports[0];assert.ok(imp.position);assert.deepEqual(Object.keys(imp.nodePositions || {}).sort(),ids.filter(id=>id.startsWith('shared::')).map(id=>id.slice(8)).sort());
});
test('mixed nudge keeps locked locals fixed and row locals require Free placement',()=>{
 const f=fixture(),{targets,rects}=selection(f,['locked','shared::a']);const plan=C.planNudgeSpatial(JSON.stringify(f.source),f.source,targets,null,rects,10,0,f.context);assert.equal(plan.error,undefined);assertMoved(f,JSON.parse(plan.text),['shared::a'],10,0);
 diagram(f.source).rows=[['local']];diagram(f.source).floats.shift();const row=selection(f,['local','shared::a']);assert.match(C.planNudgeSpatial(JSON.stringify(f.source),f.source,row.targets,null,row.rects,10,0,f.context).error,/Free placement/);
});
test('nested imported nudge writes full direct-import relative identity',()=>{
 const f=fixture(),middle={page:{title:'Middle',canon:{version:1,id:'middle',kind:'canonical',owner:'group:default/test'},sections:[{diagram:{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::a','inner::b','inner::c'],edges:[]}}}}]}};
 f.context.specs.push(middle);diagram(f.source).topologyImports=[{spec:'middle',export:'nested',as:'outer'}];const {targets,rects}=selection(f,['outer::inner::b']);const plan=C.planNudgeSpatial(JSON.stringify(f.source),f.source,targets,null,rects,-10,50,f.context);assert.equal(plan.error,undefined);const next=JSON.parse(plan.text);assertMoved(f,next,['outer::inner::b'],-10,50);assert.deepEqual(Object.keys(diagram(next).topologyImports[0].nodePositions),['inner::b']);
});
for(const mixed of [false,true])for(const direction of ['horizontal','vertical'])test('distribution equalizes '+direction+' gaps for '+(mixed?'mixed':'import-only')+' selection',()=>{
 const f=fixture(),ids=mixed?['local','shared::a','shared::c']:['shared::a','shared::b','shared::c'],{targets,rects}=selection(f,ids),axis=direction==='horizontal'?'x':'y',center=axis==='x'?'cx':'cy',size=axis==='x'?'w':'h';
 const plan=C.planDistributeSpatial(JSON.stringify(f.source),f.source,targets,null,direction,rects,f.context);assert.equal(plan.error,undefined,plan.error);const next=JSON.parse(plan.text),before=positions(f),after=positions(f,next),ordered=ids.toSorted((a,b)=>before[a][center]-before[b][center]);
 assert.equal(after[ordered[0]][center],before[ordered[0]][center]);assert.equal(after[ordered[2]][center],before[ordered[2]][center]);const gap=(a,b)=>after[b][center]-after[b][size]/2-after[a][center]-after[a][size]/2;assert.ok(Math.abs(gap(ordered[0],ordered[1])-gap(ordered[1],ordered[2]))<.001);for(const id of Object.keys(before).filter(id=>!ids.includes(id)))assert.deepEqual(plain(after[id]),plain(before[id]));
 assert.deepEqual(diagram(next).nodes,diagram(f.source).nodes);assert.equal(diagram(next).topologyProvenance,undefined);
});
test('spacing shares imported ownership and preserves unselected nodes',()=>{
 const f=fixture(),{targets,rects}=selection(f,['shared::a','shared::b']);const plan=C.planExpandSpatial(JSON.stringify(f.source),f.source,targets,null,'column',rects,f.context);assert.equal(plan.error,undefined);assertMoved(f,JSON.parse(plan.text),['shared::b'],50,0);
});
test('invalid or missing topology context, stale raw, missing identities and resolved snapshots refuse movement',()=>{
 const f=fixture(),{targets,rects}=selection(f,['shared::a']),text=JSON.stringify(f.source);
 assert.match(C.planNudgeSpatial(text,f.source,targets,null,rects,10,0).error,/Canon/);
 assert.ok(C.planNudgeSpatial(text,f.source,targets,null,rects,10,0,{version:1,id:'consumer',specs:[]}).error);
 assert.match(C.planNudgeSpatial(text,{...f.source,extra:true},targets,null,rects,10,0,f.context).error,/source changed/);
 assert.ok(C.planNudgeSpatial(text,f.source,[{kind:'node',section:0,id:'shared::missing'}],null,rects,10,0,f.context).error);
 const resolved=C.FlowTopology.resolveSource(f.source,f.context);assert.match(C.planNudgeSpatial(JSON.stringify(resolved),resolved,targets,null,rects,10,0,f.context).error,/authored consumer/);
 assert.equal(diagram(f.source).topologyImports[0].nodePositions,undefined);
});
test('one nudge transaction restores exact source, effective positions and provider context through Undo/Redo',()=>{
 const f=fixture();let text=JSON.stringify(f.source,null,2);const original=text,session=C.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}}});session.replaceProject(text,null,{topologyContext:f.context});const snapshot=session.snapshot(),{targets,rects}=selection(f,['shared::a','local']);const plan=C.planNudgeSpatial(text,snapshot.raw,targets,null,rects,30,50,session.topologyContext());assert.equal(session.accept(plan,{snapshot}),true);const after=text;assertMoved(f,JSON.parse(after),['shared::a','local'],30,50);session.undo();assert.equal(text,original);assert.deepEqual(plain(positions(f,JSON.parse(text))),plain(positions(f)));session.redo();assert.equal(text,after);assert.deepEqual(plain(session.topologyContext()),f.context);
});
function routingFixture(){const f=fixture();diagram(f.provider).edges=[{from:'a',to:'b',bend:60,fromPort:{side:'right'},label:'Provider route',labelDx:7},{from:'b',to:'c',curvePoints:[{t:.5,dx:0,dy:40}]}];diagram(f.provider).topologyExports.core.edges=['a->b','b->c'];diagram(f.source).edges=[{from:'local',to:'shared::a',toPort:{side:'left'},label:'Local route',labelDy:9}];diagram(f.source).topologyImports[0].edgeOverrides={'a->b':{label:'Consumer route',labelDx:12,curveControls:[{t:0,dx:0,dy:20},{t:1,dx:0,dy:-20}]}};return f;}
for(const scope of [{targets:[{kind:'edge',section:0,index:1,key:'shared::a->shared::b',imported:true}]},{targets:[{kind:'node',section:0,id:'shared::a'}]},{targets:[{kind:'edge',section:0,index:0},{kind:'edge',section:0,index:1,key:'shared::a->shared::b',imported:true}]},{all:true,section:0}])test('clear effective imported routing through '+JSON.stringify(scope),()=>{
 const f=routingFixture(),before=plain(f),text=JSON.stringify(f.source,null,2),plan=C.planClearCustomEdges(text,f.source,scope,f.context);assert.equal(plan.error,undefined,plan.error);assert.ok(plan.count>=1);const next=JSON.parse(plan.text),effective=diagram(C.FlowTopology.resolveSource(next,f.context)),imp=diagram(next).topologyImports[0];assert.deepEqual(f,before);assert.deepEqual(diagram(next).nodes,diagram(f.source).nodes);assert.equal(diagram(next).topologyProvenance,undefined);
 const selected=effective.edges[1];for(const key of C.BUILDER_EDGE_ROUTING_FIELDS)assert.equal(selected[key],undefined,key);assert.equal(selected.label,'Consumer route');assert.equal(selected.labelDx,12);for(const key of C.BUILDER_EDGE_ROUTING_FIELDS)assert.equal(imp.edgeOverrides['a->b'][key],null,key);
 if(!scope.all)assert.deepEqual(effective.edges[2],diagram(C.FlowTopology.resolveSource(f.source,f.context)).edges[2]);assert.equal(C.planClearCustomEdges(plan.text,next,scope,f.context).noop,true);
});
test('nested custom routing uses full relative identity and exact Undo/Redo',()=>{
 const f=routingFixture(),middle={page:{title:'Middle',canon:{version:1,id:'middle',kind:'canonical',owner:'group:default/test'},sections:[{diagram:{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::a','inner::b','inner::c'],edges:['inner::a->inner::b','inner::b->inner::c']}}}}]}};f.context.specs.push(middle);diagram(f.source).edges=[];diagram(f.source).topologyImports=[{spec:'middle',export:'nested',as:'outer'}];let text=JSON.stringify(f.source,null,2);const original=text,session=C.createBuilderSession({source:{read:()=>text,write:v=>text=v},render(){},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}}});session.replaceProject(text,null,{topologyContext:f.context});const snapshot=session.snapshot(),scope={targets:[{kind:'edge',section:0,index:0,key:'outer::inner::a->outer::inner::b',imported:true}]},plan=C.planClearCustomEdges(text,snapshot.raw,scope,session.topologyContext());assert.equal(plan.error,undefined);assert.equal(session.accept(plan,{snapshot}),true);const after=text;assert.deepEqual(Object.keys(diagram(JSON.parse(text)).topologyImports[0].edgeOverrides),['inner::a->inner::b']);session.undo();assert.equal(text,original);session.redo();assert.equal(text,after);
});
test('clear routing rejects stale source and missing context, preserves snapshots and no-ops for automatic effective routes',()=>{
 const f=routingFixture(),text=JSON.stringify(f.source),scope={all:true,section:0};assert.match(C.planClearCustomEdges(text,{...f.source,extra:true},scope,f.context).error,/source changed/);assert.match(C.planClearCustomEdges(text,f.source,scope).error,/Canon/);
 const resolved=C.FlowTopology.resolveSource(f.source,f.context),onlyImported={targets:[{kind:'edge',section:0,index:1,key:'shared::a->shared::b',imported:true}]},snapshot=C.planClearCustomEdges(JSON.stringify(resolved),resolved,onlyImported,f.context);assert.ok(snapshot.noop || snapshot.error);assert.equal(snapshot.text,undefined);
 const plan=C.planClearCustomEdges(text,f.source,scope,f.context);assert.equal(plan.error,undefined);assert.equal(C.planClearCustomEdges(plan.text,JSON.parse(plan.text),scope,f.context).noop,true);
});
test('an import-only consumer can omit authored nodes and floats while nudging and distributing',()=>{
 const f=fixture();delete diagram(f.source).nodes;delete diagram(f.source).floats;const {targets,rects}=selection(f,['shared::a','shared::b','shared::c']),text=JSON.stringify(f.source);for(const plan of [C.planNudgeSpatial(text,f.source,targets,null,rects,10,0,f.context),C.planDistributeSpatial(text,f.source,targets,null,'horizontal',rects,f.context)]){assert.equal(plan.error,undefined,plan.error);const next=diagram(JSON.parse(plan.text));assert.equal(next.nodes,undefined);assert.equal(next.floats,undefined);assert.ok(next.topologyImports[0].nodePositions);}
});
