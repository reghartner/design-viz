'use strict';
const {readSource} = require('../tools/source-loader.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = {URL}; vm.createContext(C);
for (const name of ['validator','engine','trace-import'])
  vm.runInContext(readSource(name+'.js'),C);
const plain = x => JSON.parse(JSON.stringify(x));
function graph(ids,pairs){
  const edges=pairs.map(([from,to])=>({from,to}));
  return {nodes:Object.fromEntries(ids.map(id=>[id,{title:id}])),rows:C.traceRows(ids,edges),edges,routing:'lanes'};
}
function verify(d){
  const before=JSON.stringify(d), L=C.layout(d), routes=C.laneRoutes(d,L);
  assert.equal(JSON.stringify(d),before);
  assert.equal(routes.length,d.edges.length);
  for (const [i,r] of routes.entries()){
    assert.ok(r.path && !/NaN|Infinity/.test(r.path));
    const segs=C.laneSegments(r.points), e=d.edges[i];
    for (const [j,s] of segs.entries()){
      for (const [id,p] of Object.entries(L.pos)){
        if (id===e.from && j===0 || id===e.to && j===segs.length-1) continue;
        assert.equal(C.laneSegmentHits(s,p,0),false,`${e.from}→${e.to} segment ${j} hits ${id}`);
      }
      for (const p of [s.a,s.b]) assert.ok(p.x>=0 && p.x<=1180 && p.y>=0 && p.y<=L.H);
    }
  }
  assert.deepEqual(plain(routes),plain(C.laneRoutes(d,C.layout(d))));
  return {L,routes};
}
test('dependency rows follow parent levels, pack at four and remain editable serpentine rows',()=>{
  const d=graph(['root','a','b','c','d','e','db'],[['root','a'],['root','b'],['root','c'],['root','d'],['root','e'],['a','db'],['b','db']]);
  assert.deepEqual(plain(d.rows[0]),['root']);
  assert.ok(d.rows.every(row=>row.length<=4));
  assert.deepEqual([...d.rows.flat()].sort(),Object.keys(d.nodes).sort());
  assert.ok(d.rows.findIndex(r=>r.includes('db'))>d.rows.findIndex(r=>r.includes('a')));
  verify(d);
});
test('barycentric ordering removes an avoidable crossed pair',()=>{
  const d=graph(['a','b','x','y'],[['a','y'],['b','x']]);
  const L=C.layout(d);
  assert.ok((L.pos.a.cx-L.pos.b.cx)*(L.pos.y.cx-L.pos.x.cx)>0);
  verify(d);
});
test('service cycles, reverse pairs, disconnected roots, skip links and fan-in clear every card',()=>{
  verify(graph(['a','b','c','d','e','f','g','h'],[['a','b'],['b','c'],['c','a'],['a','c'],['a','d'],['d','e'],['b','e'],['e','f'],['h','f'],['g','f']]));
});
test('seeded dense graphs retain all services and edges without lines through cards',()=>{
  let seed=1909;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for (let run=0; run<12; run++){
    const ids=Array.from({length:15},(_,i)=>'n'+i), pairs=[];
    for(let i=0;i<ids.length;i++) for(let j=0;j<ids.length;j++) if(i!==j && random()<.14) pairs.push([ids[i],ids[j]]);
    verify(graph(ids,pairs));
  }
});
test('fan-out uses distinct attachment ports, reserved rails and no coincident connector segments',()=>{
  const ids=['root',...Array.from({length:12},(_,i)=>'n'+i)];
  const {routes}=verify(graph(ids,ids.slice(1).map(id=>['root',id])));
  assert.equal(new Set(routes.map(r=>r.points[0].x)).size,12);
  for(let i=0;i<routes.length;i++) for(let j=0;j<i;j++)
    for(const a of C.laneSegments(routes[i].points)) for(const b of C.laneSegments(routes[j].points))
      assert.ok(C.laneConflict(a,b)<1000,'coincident or nearly coincident segments');
});
test('unsupported stacks, floats and self loops retain classic routing with a diagnostic',()=>{
  for (const change of [{rows:[[['a','b']]]},{floats:[{id:'b'}],rows:[['a']]},{edges:[{from:'a',to:'a'}]}]){
    const d=Object.assign(graph(['a','b'],[['a','b']]),change);
    assert.equal(C.layout(d).routing,undefined);
    assert.match(C.validate(C.normalize(d)).warnings.join('\n'),/using curves/);
  }
});
test('polyline sampling includes every leg, and classic paths are unchanged by explicit curves mode',()=>{
  const pts=C.samplePathD('M 0 0 L 0 20 L 30 20 L 30 40');
  assert.ok(pts.some(p=>p.x===30 && p.y>30));
  const d=graph(['a','b'],[['a','b']]); delete d.routing;
  const a=C.layout(d); d.routing='curves'; const b=C.layout(d);
  assert.equal(C.edgePath(d.edges[0],a),C.edgePath(d.edges[0],b));
});
