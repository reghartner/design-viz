'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const core=require('../tools/arrange/core.cjs'),{arrangeGraph}=core;
function arrangeDiagram(d,options){const result=core.autoArrangeCandidates(d,options);return {diagram:core.autoArrangeDiagram(d,result),metrics:result.metrics};}
const quick={seed:71,restarts:1,iterations:1600};
const geometry=vm.createContext({URL});
vm.runInContext('function clamp(n,a,b){return Math.max(a,Math.min(b,n));}\n'+fs.readFileSync(path.join(__dirname,'../src/core/tracking.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/core/geometry.js'),'utf8'),geometry);
const diagram=(ids,edges)=>({nodes:Object.fromEntries(ids.map(id=>[id,{title:id,icon:'server'}])),rows:[ids],edges:edges.map(([from,to],i)=>({id:'edge-'+i,from,to}))});
function bare(result){const clone=structuredClone(result);for(const key of ['runtimeMs','placementMs','routingMs']){delete clone.metrics?.[key];clone.reports?.forEach(r=>delete r[key]);}return clone;}
function assertGeometry(d){
  const L=geometry.layout(d),ids=Object.keys(d.nodes);
  assert.equal(d.floats.length,ids.length);
  assert.equal(new Set(d.floats.map(f=>f.id)).size,ids.length);
  for(let i=0;i<ids.length;i++)for(let j=0;j<i;j++){
    const a=L.pos[ids[i]],b=L.pos[ids[j]];
    assert.ok(Math.abs(a.cx-b.cx)>=(a.w+b.w)/2+20||Math.abs(a.cy-b.cy)>=(a.h+b.h)/2+20,'Cards need a readable gap');
  }
  for(const e of d.edges){
    assert.ok(geometry.validCurveControls(e.curveControls));
    const segments=geometry.edgeCurveSegments(e,L);assert.ok(segments.length);
    // Independently sample the actual renderer's decoded cubic geometry. This
    // does not call the arrangement router's sampler or collision function.
    for(const [a,b,c,z] of segments)for(let k=1;k<300;k++){
      const t=k/300,u=1-t,x=u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*z.x,y=u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*z.y;
      assert.ok(Number.isFinite(x)&&Number.isFinite(y));
      for(const id of ids){const n=L.pos[id];assert.ok(!(Math.abs(x-n.cx)<n.w/2-.1&&Math.abs(y-n.cy)<n.h/2-.1),`${e.from}->${e.to} enters ${id}`);}
      assert.ok(x>=d.graphFrame.x-1&&x<=d.graphFrame.x+d.graphFrame.w+1&&y>=d.graphFrame.y-1&&y<=d.graphFrame.y+d.graphFrame.h+1,'The declared frame contains the route');
    }
  }
}

test('arranges and routes a fork, reconvergence, skip link and feedback without mutating input',()=>{
  const d=diagram(['a','b','c','d','e','f'],[['a','b'],['b','c'],['b','d'],['c','e'],['d','e'],['e','f'],['a','e'],['e','b']]),copy=structuredClone(d);
  const result=arrangeDiagram(d,quick);assert.deepEqual(d,copy);assert.deepEqual(result.diagram.nodes,d.nodes);assert.equal(result.metrics.cardIntrusions,0);assertGeometry(result.diagram);
});

test('arrangement reserves gated node footers for both flat and grouped layouts',()=>{
 for(const grouped of [false,true]){
  const d=diagram(['a','b','c','d'],[['a','b'],['b','c'],['c','d']]);
  for(const node of Object.values(d.nodes))Object.assign(node,{existsWhen:'tickets-done',tickets:['API-1'],sub:'Body subtitle'});
  if(grouped){d.groups={box:{title:'Construction'}};d.nodes.b.group='box';d.nodes.c.group='box';}
  const result=arrangeDiagram(d,quick);assertGeometry(result.diagram);
  const L=geometry.layout(result.diagram);for(const p of Object.values(L.pos))assert.equal(p.h,90);
 }
});

test('ignores previous authored geometry and node presentation',()=>{
  const d=diagram(['a','b','c','d'],[['a','b'],['b','c'],['c','d']]);
  const changed=structuredClone(d);changed.rows=[['d'],['c','b','a']];changed.floats=Object.keys(d.nodes).map((id,i)=>({id,x:5000-i*970,y:-2000+i*87}));changed.graphFrame={x:-9999,y:-9999,w:99999,h:99999};
  changed.edges.forEach(e=>Object.assign(e,{fromPort:{side:'left'},curvePoints:[{t:.5,dx:567,dy:-800}],bend:150,labelDx:700,labelDy:-100}));
  changed.nodes.a={title:'A totally different title',icon:'phone',tint:'data'};
  const a=arrangeDiagram(d,quick).diagram,b=arrangeDiagram(changed,quick).diagram;
  assert.deepEqual(a.floats,b.floats);assert.deepEqual(a.edges,b.edges);assert.deepEqual(a.graphFrame,b.graphFrame);
});

test('deterministic placement and routes survive node and edge serialization order',()=>{
  const d=diagram(['gamma','beta','alpha','delta','epsilon'],[['alpha','beta'],['alpha','gamma'],['beta','delta'],['gamma','delta'],['delta','epsilon']]);
  const a=arrangeDiagram(d,quick),b=arrangeDiagram({...d,nodes:Object.fromEntries(Object.entries(d.nodes).reverse()),edges:[...d.edges].reverse()},quick);
  assert.deepEqual(a.diagram.floats,b.diagram.floats);assert.deepEqual(a.diagram.edges,[...b.diagram.edges].reverse());
  assert.deepEqual(bare(a),bare(arrangeDiagram(d,quick)));
});

test('empty, singleton and disconnected diagrams retain all nodes',()=>{
  assert.throws(()=>arrangeDiagram({nodes:{},rows:[[]],edges:[]},quick),/Add a node/);
  for(const d of [diagram(['a'],[]),diagram(['a','b','c','d','e'],[['a','b'],['c','d']])])assertGeometry(arrangeDiagram(d,quick).diagram);
});

test('self loops and parallel/reverse edges have finite, distinct, decodable geometry',()=>{
  const d=diagram(['a','b','c'],[['a','a'],['a','b'],['a','b'],['b','a'],['b','c'],['c','c']]);
  const out=arrangeDiagram(d,quick).diagram;assertGeometry(out);
  assert.notDeepEqual(out.edges[1].curveControls,out.edges[2].curveControls);assert.notDeepEqual(out.edges[1].fromPort,out.edges[2].fromPort);
});

test('dimension API separates mixed rectangular cards and ignores supplied coordinates',()=>{
  const input={nodes:[{id:'a',width:330,height:90,x:10000,y:-200},{id:'b',width:80,height:180},{id:'c',width:160,height:60},{id:'d',width:210,height:35}],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'b',to:'d'}]};
  const result=arrangeGraph(input,quick);assert.equal(result.metrics.cardIntrusions,0);
  for(let i=0;i<result.positions.length;i++)for(let j=0;j<i;j++){const a=result.positions[i],b=result.positions[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2+20||Math.abs(a.y-b.y)>=(a.height+b.height)/2+20);}
  const changed=structuredClone(input);changed.nodes.forEach(n=>{n.x=0;n.y=0;});assert.deepEqual(result.positions,arrangeGraph(changed,quick).positions);
});

test('placement defaults add room between columns and rows while explicit gaps remain exact',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/core/arrange/placement.js'),'utf8'),context);
  const place=context.FlowArrangePlacement.place,nodes=[{id:'a',width:100,height:40},{id:'b',width:100,height:40}],edges=[[0,1]],options={seed:71,restarts:1,iterations:200};
  function gaps(extra){const positions=place(nodes,edges,{...options,...extra}).positions;return {x:Math.abs(positions[0].x-positions[1].x)-100,y:Math.abs(positions[0].y-positions[1].y)-40};}
  assert.equal(gaps({aspectRatio:4}).x,176);
  assert.equal(gaps({aspectRatio:.25}).y,138);
  assert.equal(gaps({aspectRatio:4,columnGap:76,rowGap:88}).x,76);
  assert.equal(gaps({aspectRatio:.25,columnGap:76,rowGap:88}).y,88);
});

test('cycles and nonplanar topology produce complete valid native diagrams',()=>{
  const cycle=diagram(['a','b','c','d','e'],[['a','b'],['b','c'],['c','d'],['d','a'],['a','c'],['c','e']]);
  const bipartite=diagram(['a','b','c','d','e','f'],['a','b','c'].flatMap(a=>['d','e','f'].map(b=>[a,b])));
  for(const d of [cycle,bipartite])assertGeometry(arrangeDiagram(d,quick).diagram);
});

test('invalid topology, dimensions and options fail explicitly',()=>{
  const good={nodes:[{id:'a'}],edges:[]};
  for(const input of [null,{}, {nodes:[{id:'a'},{id:'a'}],edges:[]},{nodes:[{id:'a',width:NaN}],edges:[]},{nodes:[{id:'a',height:-3}],edges:[]},{...good,edges:[{from:'a',to:'missing'}]}])assert.throws(()=>arrangeGraph(input,quick));
  for(const options of [{seed:NaN},{restarts:0},{iterations:2.3},{aspectRatio:0},{columnGap:-1},{rowGap:Infinity}])assert.throws(()=>arrangeGraph(good,options));
});

test('incremental search energy equals complete recomputation for moves and swaps',()=>{
  const {score,topology}=(()=>{const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/core/arrange/placement.js'),'utf8'),context);return context.FlowArrangePlacement;})();
  const edges=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,1],[2,6],[0,6],[6,4]],t=topology(7,edges),points=[{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:2,y:2},{x:0,y:2},{x:1,y:3},{x:3,y:1}];
  for(let a=0;a<7;a++)for(let b=-1;b<7;b++){
    if(a===b)continue;
    const next=points.map(p=>({...p})),moved=b<0?[a]:[a,b];if(b<0)next[a]={x:4,y:4};else [next[a],next[b]]=[next[b],next[a]];
    const full=score(next,edges,t,1.45,226/132)-score(points,edges,t,1.45,226/132),incremental=score(next,edges,t,1.45,226/132,moved)-score(points,edges,t,1.45,226/132,moved);
    assert.ok(Math.abs(full-incremental)<1e-8,`Incremental mismatch for ${a},${b}`);
  }
});


test('default iteration schedule keeps small searches and caps large ones deterministically',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/core/arrange/placement.js'),'utf8'),context);
  const budget=context.FlowArrangePlacement.defaultIterations;
  for(const [n,expected] of [[1,16000],[12,16000],[13,16900],[48,62400],[49,63700],[50,64000],[80,64000]])assert.equal(budget(n),expected);
});
