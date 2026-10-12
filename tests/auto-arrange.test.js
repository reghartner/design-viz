'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
const fixture=require('./fixtures/auto-arrange-grouped.json');
function simple(){return {nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'}]};}

function safeNative(d){
  const L=C.layout(d),ids=Object.keys(d.nodes),parents=C.sanitizedGroupParents(d.groups),groups=Object.keys(L.groups);
  const rect=p=>({x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h});
  const overlap=(a,b)=>a.x<b.x+b.w-.01&&b.x<a.x+a.w-.01&&a.y<b.y+b.h-.01&&b.y<a.y+a.h-.01;
  const ancestor=(a,b)=>{while(b!=null){if(a===b)return true;b=parents[b];}return false;};
  ids.forEach((id,i)=>ids.slice(i+1).forEach(other=>assert.ok(!overlap(rect(L.pos[id]),rect(L.pos[other])))));
  groups.forEach((id,i)=>{
    const g=L.groups[id];
    groups.slice(i+1).forEach(other=>{if(!ancestor(id,other)&&!ancestor(other,id))assert.ok(!overlap(g,L.groups[other]),id+' overlaps '+other);});
    ids.forEach(node=>{const card=rect(L.pos[node]);if(ancestor(id,d.nodes[node].group)){
      assert.ok(card.x>=g.x+14-.01&&card.x+card.w<=g.x+g.w-14+.01);
      assert.ok(card.y>=g.y+34-.01&&card.y+card.h<=g.y+g.h-14+.01,'native title strip stays clear');
    }else assert.ok(!overlap(g,card),node+' enters '+id);});
    if(parents[id]){const outer=L.groups[parents[id]];assert.ok(g.x>=outer.x+14-.01&&g.y>=outer.y+34-.01&&g.x+g.w<=outer.x+outer.w-14+.01&&g.y+g.h<=outer.y+outer.h-14+.01);}
    assert.ok(g.x>=d.graphFrame.x&&g.y>=d.graphFrame.y&&g.x+g.w<=d.graphFrame.x+d.graphFrame.w&&g.y+g.h<=d.graphFrame.y+d.graphFrame.h);
  });
  for(const edge of d.edges){
    assert.ok(C.validCurveControls(edge.curveControls));assert.ok(C.validEdgePort(edge.fromPort));assert.ok(C.validEdgePort(edge.toPort));
    const path=C.samplePathD(C.edgePath(edge,L));
    assert.equal(C.countPathRectHits(path,ids.filter(id=>id!==edge.from&&id!==edge.to).map(id=>rect(L.pos[id]))),0);
    assert.equal(C.countPathRectHits(path,groups.map(id=>({...L.groups[id],h:20}))),0,'native group title strips stay clear of routes');
  }
}
test('native grouped fixture preserves semantics, separates containers and routes clear of cards',()=>{
  const d=fixture.page.blocks[0].diagram,original=JSON.stringify(d),result=C.autoArrangeCandidates(d),out=C.autoArrangeDiagram(d,result);
  assert.equal(JSON.stringify(d),original);assert.deepEqual(plain(out.nodes),d.nodes);assert.deepEqual(plain(out.groups),d.groups);
  assert.deepEqual(plain(out.edges.map(e=>[e.from,e.to,e.label])),plain(d.edges.map(e=>[e.from,e.to,e.label])));safeNative(out);
});
test('nested, inferred, empty and tolerated cyclic groups retain the native containment semantics',()=>{
  for(const variant of ['nested','inferred','cyclic']){
    const d=simple();d.nodes.d={title:'Outside'};d.nodes.e={title:'Deep'};d.nodes.f={title:'Sibling'};d.rows[0].push('d','e','f');d.edges.push({from:'c',to:'d'},{from:'e',to:'a'});
    d.groups={outer:{title:'Outer'},inner:{parent:'outer'},deep:{parent:'inner'},sibling:{},empty:{parent:'outer'}};
    Object.assign(d.nodes.a,{group:'inner'});d.nodes.b.group='outer';d.nodes.c.group='sibling';d.nodes.e.group='deep';d.nodes.f.group='sibling';
    if(variant==='inferred'){delete d.groups.inner;d.nodes.f.group='inferred';}
    if(variant==='cyclic'){d.groups.outer.parent='deep';}
    const out=C.autoArrangeDiagram(d,C.autoArrangeCandidates(d));assert.deepEqual(plain(out.groups),d.groups);assert.deepEqual(plain(out.nodes),d.nodes);safeNative(out);
    assert.equal(C.layout(out).groups.empty,undefined,'empty groups retain their metadata without invented members');
  }
});
test('transaction preserves semantics and exact ports/frame, rejects malformed geometry, and changes one section only',()=>{
  const d=simple();d.steps=[{edge:'a->b',text:'Keep'}];d.paths=[{id:'p',steps:[1]}];d.panels=[{id:'app',type:'deviceapp'}];d.custom={keep:true};d.floats=[{id:'a',x:0,y:0,custom:'float metadata'}];
  d.edges[0]={...d.edges[0],id:'original',kind:'int',label:'Keep label',labelAt:.4,fromDx:8,bend:42,labelDx:123};
  const raw={page:{sections:[{diagram:d},{heading:'Untouched',diagram:simple()}]}},text=JSON.stringify(raw,null,2),result=C.autoArrangeCandidates(d),plan=C.planAutoArrange(text,raw,0,result),out=JSON.parse(plan.text);
  assert.equal(JSON.stringify(raw,null,2),text);assert.deepEqual(out.page.sections[1],raw.page.sections[1]);
  const changed=out.page.sections[0].diagram;
  for(const key of ['nodes','steps','paths','panels','custom'])assert.deepEqual(changed[key],d[key]);
  assert.deepEqual(changed.graphFrame,plain(result.frame));assert.equal(changed.floats.find(f=>f.id==='a').custom,'float metadata');
  changed.edges.forEach((e,i)=>{assert.deepEqual(e.fromPort,plain(result.edges[i].fromPort));assert.deepEqual(e.toPort,plain(result.edges[i].toPort));assert.deepEqual(e.curveControls,plain(result.edges[i].curveControls));});
  assert.equal(changed.edges[0].id,'original');assert.equal(changed.edges[0].labelAt,.4);assert.equal(changed.edges[0].fromDx,undefined);
  for(const alter of [r=>r.positions[0].x=NaN,r=>r.positions[1].id='a',r=>r.frame.w=-1,r=>r.frame=null,r=>r.edges[0].fromPort={side:'invalid'},r=>r.edges[0].toPort.offset=2,r=>r.edges[0].curveControls=[{}],r=>r.edges[0]=null]){
    const bad=plain(result);alter(bad);assert.ok(C.planAutoArrange(text,raw,0,bad).error);
  }
  const poison=plain(result);Object.assign(poison.edges[0],{from:'missing',id:'replace',label:'replace'});
  const clean=JSON.parse(C.planAutoArrange(text,raw,0,poison).text).page.sections[0].diagram;assert.equal(clean.edges[0].from,'a');assert.equal(clean.edges[0].id,'original');assert.equal(clean.edges[0].label,'Keep label');
});
test('public limits reject before placement work',()=>{
  assert.throws(()=>C.autoArrangeInput({nodes:{}}),/Add a node/);
  assert.throws(()=>C.autoArrangeInput({nodes:{a:{}},edges:[{from:'a',to:'missing'}]}),/missing nodes/);
  assert.throws(()=>C.autoArrangeInput({nodes:Object.fromEntries(Array.from({length:81},(_,i)=>[i,{}]))}),/80 nodes/);
  assert.throws(()=>C.autoArrangeInput({nodes:{a:{}},edges:Array.from({length:161},()=>({from:'a',to:'a'}))}),/160 connections/);
});
test('native cubic split preserves shape; controls, joins, endpoints, deletion and bounds remain editable',()=>{
  const d=simple(),out=C.autoArrangeDiagram(d,C.autoArrangeCandidates(d)),e=out.edges[0],L=C.layout(out);
  const before=C.edgeCurveSegments(e,L),split=C.splitEdgeCubic(e,L,0,.4),shaped={...e,curveControls:split.points},after=C.edgeCurveSegments(shaped,L);
  assert.equal(after.length,before.length+1);
  function at(s,t){const u=1-t;return {x:u*u*u*s[0].x+3*u*u*t*s[1].x+3*u*t*t*s[2].x+t*t*t*s[3].x,y:u*u*u*s[0].y+3*u*u*t*s[1].y+3*u*t*t*s[2].y+t*t*t*s[3].y};}
  for(let i=0;i<=100;i++){const t=i/100,a=at(before[0],t),b=t<=.4?at(after[0],t/.4):at(after[1],(t-.4)/.6);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6);}
  let controls=plain(split.points),old=plain(controls),idx=split.index;
  C.moveEdgeCurvePoint(shaped,controls,idx,{...controls[idx],dx:controls[idx].dx+12,dy:controls[idx].dy-7});
  for(const j of [idx-1,idx,idx+1]){assert.equal(controls[j].dx,old[j].dx+12);assert.equal(controls[j].dy,old[j].dy-7);}
  assert.ok(C.validCurveControls(C.removeEdgeCurvePoint(shaped,controls,idx)));
  const oldAnchors=C.edgeCurveAnchors(e,L);
  out.floats.forEach(f=>{f.x+=90;f.y+=50;});const moved=C.layout(out),anchors=C.edgeCurveAnchors(e,moved);
  anchors.forEach((p,i)=>{assert.ok(Math.abs(p.x-oldAnchors[i].x-90)<1e-8);assert.ok(Math.abs(p.y-oldAnchors[i].y-50)<1e-8);});
  out.floats.find(f=>f.id===e.from).x+=100;const final=C.layout(out),segs=C.edgeCurveSegments(e,final);
  const firstAnchor=C.edgeCurveAnchors(e,final)[0];
  assert.deepEqual(plain(segs[0][0]),plain(C.edgePortPoint(final.pos[e.from],{cx:firstAnchor.x,cy:firstAnchor.y},e.fromPort)));
  C.expandPlacedEdgeBounds(out.edges,final,C.edgeAutoAdjust(out.edges,final));
  for(const p of C.samplePathD(C.edgePath(e,final)))assert.ok(p.x>=final.vb.x && p.x<=final.vb.x+final.vb.w && p.y>=final.vb.y && p.y<=final.vb.y+final.vb.h);
});

test('native geometry roundtrips, resets both representations, validates shape, and advertises its capability',()=>{
  const d=C.autoArrangeDiagram(simple(),C.autoArrangeCandidates(simple())),raw={page:{title:'Native',blocks:[{diagram:d}]}},text=JSON.stringify(raw);
  assert.equal(C.edgePath(d.edges[0],C.layout(d)),C.edgePath(JSON.parse(text).page.blocks[0].diagram.edges[0],C.layout(d)));
  assert.ok(C.FlowviewCompatibility.detect(d).includes('layout.cubic-curves'));
  const reset=JSON.parse(C.planEdgeCurve(text,raw,0,0,[]).text).page.blocks[0].diagram.edges[0];assert.equal(reset.curveControls,undefined);assert.equal(reset.curvePoints,undefined);
  for(const value of [[],[{}],[{t:.5,dx:0,dy:0}],Array(3).fill({t:.5,dx:0,dy:0}),[{t:2,dx:0,dy:0},{t:.5,dx:0,dy:0}],Array(98).fill({t:.5,dx:0,dy:0})]){
    const invalid=plain(raw);invalid.page.blocks[0].diagram.edges[0].curveControls=value;
    assert.ok(C.validate(C.normalize(invalid)).errors.some(e=>e.includes('curveControls')));
  }
  assert.ok(!entrypoint('standalone').source.includes('Viz.js 3.31.0'));
  assert.doesNotMatch(C.AUTO_ARRANGE_WORKER_SOURCE,/WebAssembly|importScripts|\bfetch\(/);
});
