'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
const fixture=require('./fixtures/auto-arrange-grouped.json');
const Viz=require('../src/workbench/vendor/viz-3.31.0.js'),cola=require('../src/workbench/vendor/webcola-3.4.0.js');
let viz;test.before(async()=>{viz=await Viz.instance();});
function simple(){return {nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'}]};}

test('approved 20-node grouped fixture retains groups and native routes with clear final viewer paths',()=>{
  const d=fixture.page.blocks[0].diagram,result=C.autoArrangeCandidates(d,viz,cola),out=C.autoArrangeDiagram(d,result);
  assert.equal(result.positions.length,20);assert.equal(result.edges.length,36);
  assert.deepEqual(plain(out.groups),d.groups);assert.deepEqual(plain(out.nodes),d.nodes);
  assert.deepEqual(plain(out.edges.map(e=>[e.from,e.to,e.label])),plain(d.edges.map(e=>[e.from,e.to,e.label])));
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.ok(result.score.crossings<=10,JSON.stringify(result.score));
  assert.ok(out.edges.find(e=>e.label==='retry').labelDx!==undefined);
  assert.deepEqual(plain(C.autoArrangeCandidates(d,viz,cola)),plain(result));
});

test('cyclic, disconnected, nested, self and parallel connections preserve identity and route every edge',()=>{
  for(const variant of ['free','nested','singleton']){
    let d=simple();
    if(variant==='nested'){d.groups={parent:{title:'Parent'},child:{parent:'parent'},other:{}};d.nodes.a.group='child';d.nodes.b.group='parent';d.nodes.c.group='other';}
    if(variant==='singleton')d={nodes:{a:{}},rows:[['a']],edges:[]};
    else{d.nodes.isolated={};d.rows[0].push('isolated');d.edges.push({from:'a',to:'a',label:'Self'},{from:'a',to:'b',label:'Parallel',kind:'int'});}
    const result=C.autoArrangeCandidates(d,viz,cola),out=C.autoArrangeDiagram(d,result),L=C.layout(out);
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
    assert.equal(out.edges.length,d.edges.length);assert.deepEqual(plain(out.nodes),d.nodes);
    out.edges.forEach(e=>{assert.ok(C.validCurveControls(e.curveControls));assert.ok(!/NaN|Infinity/.test(C.edgePath(e,L)));});
  }
  assert.throws(()=>C.autoArrangeInput({nodes:{}}),/Add a node/);
  assert.throws(()=>C.autoArrangeInput({nodes:{a:{}},edges:[{from:'a',to:'missing'}]}),/missing nodes/);
  assert.throws(()=>C.autoArrangeInput({nodes:Object.fromEntries(Array.from({length:81},(_,i)=>[i,{}]))}),/80 nodes/);
});

test('atomic planner preserves semantic content, other sections and source; rejects malformed worker results',()=>{
  const d=simple();d.steps=[{edge:'a->b',text:'Keep'}];d.panels=[{id:'panel',type:'deviceapp'}];d.paths=[{id:'path',steps:[1]}];
  d.edges[0].label='Keep label';d.edges[0].bend=42;d.edges[0].labelDx=123;
  const raw={page:{title:'Keep',sections:[{diagram:d},{heading:'Unaffected',diagram:simple()}]}},text=JSON.stringify(raw,null,2);
  const result=C.autoArrangeCandidates(d,viz,cola),plan=C.planAutoArrange(text,raw,0,result),out=JSON.parse(plan.text);
  assert.notEqual(plan.text,text);assert.equal(JSON.stringify(raw,null,2),text);
  assert.deepEqual(out.page.sections[1],raw.page.sections[1]);
  const next=out.page.sections[0].diagram;
  for(const k of ['nodes','steps','paths','panels'])assert.deepEqual(next[k],d[k]);
  assert.equal(next.edges[0].label,'Keep label');assert.equal(next.edges[0].bend,undefined);assert.ok(next.edges[0].curveControls);
  const invalid=plain(result);invalid.positions[0].x=NaN;assert.ok(C.planAutoArrange(text,raw,0,invalid).error);
  const poison=plain(result);poison.edges[0].from='missing';
  assert.equal(JSON.parse(C.planAutoArrange(text,raw,0,poison).text).page.sections[0].diagram.edges[0].from,'a');
});

test('native cubic split preserves shape; controls, joins, endpoints, deletion and bounds remain editable',()=>{
  const d=simple(),out=C.autoArrangeDiagram(d,C.autoArrangeCandidates(d,viz,cola)),e=out.edges[0],L=C.layout(out);
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
  assert.deepEqual(plain(segs[0][0]),plain(C.edgePortPoint(final.pos[e.from],final.pos[e.to],e.fromPort)));
  C.expandPlacedEdgeBounds(out.edges,final,C.edgeAutoAdjust(out.edges,final));
  for(const p of C.samplePathD(C.edgePath(e,final)))assert.ok(p.x>=final.vb.x && p.x<=final.vb.x+final.vb.w && p.y>=final.vb.y && p.y<=final.vb.y+final.vb.h);
});

test('native geometry roundtrips, resets both representations, validates shape, and advertises its capability',()=>{
  const d=C.autoArrangeDiagram(simple(),C.autoArrangeCandidates(simple(),viz,cola)),raw={page:{title:'Native',blocks:[{diagram:d}]}},text=JSON.stringify(raw);
  assert.equal(C.edgePath(d.edges[0],C.layout(d)),C.edgePath(JSON.parse(text).page.blocks[0].diagram.edges[0],C.layout(d)));
  assert.ok(C.FlowviewCompatibility.detect(d).includes('layout.cubic-curves'));
  const reset=JSON.parse(C.planEdgeCurve(text,raw,0,0,[]).text).page.blocks[0].diagram.edges[0];assert.equal(reset.curveControls,undefined);assert.equal(reset.curvePoints,undefined);
  for(const value of [[],[{}],[{t:.5,dx:0,dy:0}],Array(3).fill({t:.5,dx:0,dy:0}),[{t:2,dx:0,dy:0},{t:.5,dx:0,dy:0}],Array(98).fill({t:.5,dx:0,dy:0})]){
    const invalid=plain(raw);invalid.page.blocks[0].diagram.edges[0].curveControls=value;
    assert.ok(C.validate(C.normalize(invalid)).errors.some(e=>e.includes('curveControls')));
  }
  assert.ok(!entrypoint('standalone').source.includes('Viz.js 3.31.0'));
  assert.ok(C.AUTO_ARRANGE_WORKER_SOURCE.includes('Viz.js 3.31.0'));
});
