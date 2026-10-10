'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=()=>({page:{title:'Placement',blocks:[{diagram:{nodes:{a:{title:'A'},b:{title:'B'},f:{title:'Float'}},rows:[['a','b']],floats:[{id:'f',side:'below',dx:14,dy:-10}],edges:[{from:'a',to:'f'}],steps:[{edge:'a->f',text:'Send'}]}}]}});
const diagram=s=>s.page.blocks[0].diagram;
const route=(d,e)=>{const L=C.layout(d),adj=L.routing==='lanes'?C.laneRoutes(d,L):C.edgeAutoAdjust(d.edges,L);if(L.routing!=='lanes')C.resolveEdgeAvoidance(d.edges,L,adj);C.expandPlacedEdgeBounds(d.edges,L,adj);return {L,path:C.edgePath(e,L,adj[d.edges.indexOf(e)]),points:C.samplePathD(C.edgePath(e,L,adj[d.edges.indexOf(e)]))};};

test('fixed floats keep exact centers and preserve row geometry through moves, edge changes and bounds expansion',()=>{
  const raw=spec(),d=diagram(raw),baseline=C.layout(d),text=JSON.stringify(raw,null,2);
  const plan=C.planPlaceFloat(text,raw,0,'f',-180,650.14),next=JSON.parse(plan.text),placed=diagram(next),L=C.layout(placed);
  assert.deepEqual(plain(L.pos.a),plain(baseline.pos.a));assert.deepEqual(plain(L.pos.b),plain(baseline.pos.b));
  assert.deepEqual(placed.rows,d.rows);assert.deepEqual(placed.steps,d.steps);assert.deepEqual(placed.edges,d.edges);
  assert.deepEqual(placed.floats,[{id:'f',side:'below',x:-180,y:650.1}]);assert.equal(L.pos.f.cx,-180);assert.equal(L.pos.f.cy,650.1);
  assert.ok(L.vb.x<=L.pos.f.cx-L.pos.f.w/2-24);assert.ok(L.vb.y+L.vb.h>=L.pos.f.cy+L.pos.f.h/2+24);
  placed.edges=[{from:'b',to:'f'}];assert.equal(C.layout(placed).pos.f.cx,-180,'connections do not pull a pinned float');
  assert.equal(JSON.stringify(raw,null,2),text,'planning is immutable');
  const upper=C.planPlaceFloat(plan.text,next,0,'f',1420,-210),up=C.layout(diagram(JSON.parse(upper.text)));
  assert.ok(up.vb.y<-210);assert.ok(up.vb.x+up.vb.w>1495);assert.deepEqual(plain(up.pos.a),plain(baseline.pos.a));
});

test('Free placement lifts row nodes, supports a fully free diagram and resets to rows or automatic floats',()=>{
  const raw={nodes:{a:{title:'A'}},rows:[['a']],edges:[]};
  const free=C.planSetNodeFloat(JSON.stringify(raw),raw,0,'a','free'),d=JSON.parse(free.text);
  assert.deepEqual(d.rows,[[]]);assert.deepEqual(d.floats,[{id:'a',side:'below',x:590,y:69}]);
  assert.deepEqual(plain(C.validate(C.normalize(d))).errors,[]);
  const row=JSON.parse(C.planSetNodeFloat(free.text,d,0,'a','').text);assert.deepEqual(row.rows,[['a']]);assert.equal(row.floats,undefined);
  const base=spec(),original=C.layout(diagram(base));
  const pinned=C.planSetNodeFloat(JSON.stringify(base),base,0,'f','free'),fixed=diagram(JSON.parse(pinned.text));
  assert.equal(fixed.floats[0].x,original.pos.f.cx);assert.equal(fixed.floats[0].y,original.pos.f.cy);
  const automatic=diagram(JSON.parse(C.planSetNodeFloat(pinned.text,JSON.parse(pinned.text),0,'f','above').text));
  assert.deepEqual(automatic.floats,[{id:'f',side:'above'}]);assert.equal(C.layout(automatic).pos.f.free,undefined);
});

test('every explicit exit/entry side and offset stays pinned even under bend and obstacle avoidance',()=>{
  const d={nodes:{a:{},b:{},obstacle:{}},rows:[['a','obstacle','b']],edges:[]};
  for(const from of ['top','right','bottom','left'])for(const to of ['top','right','bottom','left'])for(const offset of [0,.25,1]){
    const e={from:'a',to:'b',fromPort:{side:from,offset},toPort:{side:to,offset:1-offset},bend:35};d.edges=[e];
    const {L,points}=route(d,e),start=C.edgePortPoint(L.pos.a,L.pos.b,e.fromPort),end=C.edgePortPoint(L.pos.b,L.pos.a,e.toPort);
    assert.equal(points[0].x,start.x);assert.equal(points[0].y,start.y);
    assert.ok(Math.abs(points.at(-1).x-end.x)<1e-6);assert.ok(Math.abs(points.at(-1).y-end.y)<1e-6);
    assert.ok(points.every(p=>p.x>=L.vb.x && p.x<=L.vb.x+L.vb.w && p.y>=L.vb.y && p.y<=L.vb.y+L.vb.h));
  }
});

test('explicit ports override only their edge in lanes; absent ports retain the original automatic routes',()=>{
  const d={routing:'lanes',nodes:{a:{},b:{},c:{}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}]};
  const before=d.edges.map(e=>route(d,e).path),rows=plain(C.layout(d).rows);
  d.edges[0].fromPort={side:'left',offset:.25};d.edges[0].toPort={side:'bottom',offset:.75};
  const r=route(d,d.edges[0]);assert.equal(r.L.routing,'lanes');assert.deepEqual(plain(r.L.rows),rows);assert.notEqual(r.path,before[0]);
  assert.equal(route(d,d.edges[1]).path,before[1]);
  delete d.edges[0].fromPort;delete d.edges[0].toPort;assert.equal(route(d,d.edges[0]).path,before[0]);
});

test('new coordinate and port validation rejects malformed inputs and compatibility advertises both capabilities',()=>{
  for(const coords of [{x:1},{x:null,y:1},{x:'2',y:3},{x:Infinity,y:4},{x:100001,y:4}]){
    const raw=spec();Object.assign(diagram(raw).floats[0],coords);assert.ok(C.validate(C.normalize(raw)).errors.some(e=>e.includes('free placement')));
  }
  for(const port of ['left',[],{side:'center'},{side:'top',offset:-.1},{side:'left',offset:1.1},{side:'right',offset:'0.5'}]){
    const raw=spec();diagram(raw).edges[0].fromPort=port;assert.ok(C.validate(C.normalize(raw)).errors.some(e=>e.includes('fromPort')));
  }
  const raw=spec();Object.assign(diagram(raw).floats[0],{x:720,y:150});diagram(raw).edges[0].fromPort={side:'right',offset:.4};
  assert.deepEqual(plain(C.validate(C.normalize(raw))).errors,[]);
  assert.deepEqual(plain(C.FlowviewCompatibility.detect(raw)),['layout.edge-ports','layout.free-nodes']);
  assert.ok(C.planPlaceFloat(JSON.stringify(raw),raw,0,'f',NaN,2).error);
});


test('canvas contains complete explicit-port curves between samples, including very large positive and negative bends',()=>{
  for(const bend of [-100000,100000]){
    const e={from:'a',to:'b',fromPort:{side:'top',offset:0},toPort:{side:'left',offset:1},bend};
    const d={nodes:{a:{},b:{}},rows:[['a','b']],edges:[e]},r=route(d,e);
    const v=r.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number),vb=r.L.vb;
    // Independent, much denser sampling catches extrema between the old .04 intervals.
    for(let i=0;i<=10000;i++){
      const t=i/10000,u=1-t;
      const x=u*u*u*v[0]+3*u*u*t*v[2]+3*u*t*t*v[4]+t*t*t*v[6];
      const y=u*u*u*v[1]+3*u*u*t*v[3]+3*u*t*t*v[5]+t*t*t*v[7];
      assert.ok(x>=vb.x && x<=vb.x+vb.w && y>=vb.y && y<=vb.y+vb.h);
    }
  }
});


function importedFixture(){
  const fs=require('node:fs'),path=require('node:path');
  return ['platform','checkout'].map(id=>JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/canon/topology/'+id+'.json'),'utf8')));
}
const importedDiagram=s=>s.page.sections[0].diagram;
test('individual imported centers persist by identity; block moves and reset preserve consumer/provider structure',()=>{
  const specs=importedFixture(),raw=specs[1],ctx={version:1,id:'checkout',specs},before=JSON.stringify(specs);
  const baseline=C.FlowTopology.resolveSource(raw,ctx),d=importedDiagram(baseline),origin=d.topologyProvenance.imports[0].position;
  const store=d.floats.find(f=>f.id==='platform::store'),api=d.floats.find(f=>f.id==='platform::api');
  const plan=C.planPlaceTopologyNode(JSON.stringify(raw),raw,0,'platform','platform::api',api.x-160,api.y+80,ctx);
  assert.equal(plan.error,undefined);const moved=JSON.parse(plan.text),imp=importedDiagram(moved).topologyImports[0];
  assert.deepEqual(imp.nodePositions,{api:{x:api.x-origin.x-160,y:api.y-origin.y+80}});
  assert.deepEqual(imp.position,plain(origin));assert.equal(importedDiagram(moved).floats,undefined);
  const resolved=importedDiagram(C.FlowTopology.resolveSource(moved,ctx));
  assert.deepEqual(plain(resolved.floats.find(f=>f.id===store.id)),plain(store));
  assert.deepEqual(plain(resolved.nodes),plain(d.nodes));assert.deepEqual(plain(resolved.edges),plain(d.edges));assert.deepEqual(plain(resolved.groups),plain(d.groups));
  assert.equal(JSON.stringify(specs),before);
  const block=C.planPlaceTopologyImport(plan.text,moved,0,'platform',origin.x+20,origin.y+40),shifted=JSON.parse(block.text);
  const shiftedD=importedDiagram(C.FlowTopology.resolveSource(shifted,ctx));
  for(const f of resolved.floats){const p=shiftedD.floats.find(p=>p.id===f.id);assert.equal(p.x,f.x+20);assert.equal(p.y,f.y+40);}
  const reset=C.planResetTopologyArrangement(block.text,shifted,0,'platform'),resetD=importedDiagram(C.FlowTopology.resolveSource(JSON.parse(reset.text),ctx));
  assert.deepEqual(importedDiagram(JSON.parse(reset.text)).topologyImports[0].position,{x:origin.x+20,y:origin.y+40});
  assert.equal(importedDiagram(JSON.parse(reset.text)).topologyImports[0].nodePositions,undefined);
  for(const f of d.floats){const p=resetD.floats.find(p=>p.id===f.id);assert.equal(p.x,f.x+20);assert.equal(p.y,f.y+40);}
  const refreshed=plain(ctx);refreshed.specs[0].page.sections[0].diagram.rows=[['store'],['api']];
  assert.deepEqual(plain(importedDiagram(C.FlowTopology.resolveSource(moved,refreshed)).floats.find(f=>f.id===api.id)),plain(resolved.floats.find(f=>f.id===api.id)));
  assert.ok(C.FlowTopology.editError(baseline,C.FlowTopology.resolveSource(moved,ctx)),'materialized snapshots still reject layout edits');
  assert.ok(C.planPlaceTopologyNode(JSON.stringify(baseline),baseline,0,'platform','platform::api',0,0,ctx).error);
  assert.ok(C.planPlaceTopologyNode(JSON.stringify(raw),raw,0,'platform','platform::absent',0,0,ctx).error);
});
test('imported node arrangement and reset each use one undoable transaction and stale snapshots never write',()=>{
  const specs=importedFixture(),ctx={version:1,id:'checkout',specs};let text='',writes=0;
  const session=C.createBuilderSession({source:{read:()=>text,write:value=>{text=value;writes++;}},persistence:{read:()=>({}),preserve(){},cancel(){},save(){},destroy(){}},render(){}});
  const original=JSON.stringify(specs[1],null,2);session.replaceProject(original,null,{topologyContext:ctx});writes=0;
  const snapshot=session.snapshot(),plan=C.planPlaceTopologyNode(text,JSON.parse(text),0,'platform','platform::store',450,600,ctx);
  assert.equal(session.accept(plan,{snapshot}),true);assert.equal(writes,1);const after=text;
  assert.equal(session.accept(plan,{snapshot}),false);assert.equal(writes,1);
  assert.equal(session.undo(),true);assert.equal(text,original);assert.equal(session.canUndo(),false);
  assert.equal(session.redo(),true);assert.equal(text,after);
  assert.equal(session.accept(C.planResetTopologyArrangement(text,JSON.parse(text),0,'platform'),{snapshot:session.snapshot()}),true);
  assert.equal(importedDiagram(JSON.parse(text)).topologyImports[0].nodePositions,undefined);
  assert.equal(session.undo(),true);assert.equal(text,after);
  const current=session.snapshot(),reset=C.planResetTopologyArrangement(text,JSON.parse(text),0,'platform'),count=writes;
  session.destroy();assert.equal(session.accept(reset,{snapshot:current}),false);assert.equal(writes,count);
});

test('a custom center cannot displace a later automatically positioned imported block',()=>{
  const specs=importedFixture(),raw=specs[1],d=importedDiagram(raw),ctx={version:1,id:'checkout',specs};
  d.topologyImports.push({spec:'platform',export:'core',as:'second'});
  const before=importedDiagram(C.FlowTopology.resolveSource(raw,ctx));
  const plan=C.planPlaceTopologyNode(JSON.stringify(raw),raw,0,'platform','platform::store',300,1500,ctx);
  const after=importedDiagram(C.FlowTopology.resolveSource(JSON.parse(plan.text),ctx));
  for(const f of before.floats.filter(f=>f.id!=='platform::store'))assert.deepEqual(plain(after.floats.find(p=>p.id===f.id)),plain(f));
});
