'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
function largeLeafDiagonals(d,result){
  const points=Object.fromEntries(result.positions.map(p=>[p.id,p])),degree=Object.fromEntries(Object.keys(d.nodes).map(id=>[id,0]));
  d.edges.forEach(e=>{degree[e.from]++;degree[e.to]++;});
  return Object.keys(degree).filter(id=>{
    if(degree[id]!==1)return false;
    const e=d.edges.find(e=>e.from===id || e.to===id),a=points[e.from],b=points[e.to];
    return Math.abs(a.x-b.x)>.1 && Math.abs(a.y-b.y)>.1;
  });
}
const fixture=require('./fixtures/auto-arrange-grouped.json');
const Viz=require('../src/workbench/vendor/viz-3.31.0.js'),cola=require('../src/workbench/vendor/webcola-3.4.0.js');
let viz;test.before(async()=>{viz=await Viz.instance();});
function simple(){return {nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'}]};}
function assertAutoPorts(edges){
  edges.forEach(e=>{assert.equal(Object.hasOwn(e,'fromPort'),false);assert.equal(Object.hasOwn(e,'toPort'),false);});
}
function minimumCardGap(result){
  let closest=Infinity;
  result.positions.forEach((a,i)=>result.positions.slice(i+1).forEach(b=>{
    const dx=Math.max(0,Math.abs(a.x-b.x)-150),dy=Math.max(0,Math.abs(a.y-b.y)-44);
    closest=Math.min(closest,Math.hypot(dx,dy));
  }));
  return closest;
}

test('approved 20-node grouped fixture retains groups and native routes with clear final viewer paths',()=>{
  const d=fixture.page.blocks[0].diagram,result=C.autoArrangeCandidates(d,viz,cola),out=C.autoArrangeDiagram(d,result);
  assert.equal(result.positions.length,20);assert.equal(result.edges.length,36);assertAutoPorts(result.edges);assertAutoPorts(out.edges);
  assert.deepEqual(plain(out.groups),d.groups);assert.deepEqual(plain(out.nodes),d.nodes);
  assert.deepEqual(plain(out.edges.map(e=>[e.from,e.to,e.label])),plain(d.edges.map(e=>[e.from,e.to,e.label])));
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.ok(result.score.crossings<=10,JSON.stringify(result.score));
  assert.ok(minimumCardGap(result)>=48,minimumCardGap(result));
  out.edges.forEach(e=>{if(!e.curveControls){assert.equal(e.labelDx,undefined);assert.equal(e.labelDy,undefined);}});
  assert.deepEqual(plain(C.autoArrangeCandidates(d,viz,cola)),plain(result));
});

test('layered and force-directed candidates keep visibly separated card rectangles',()=>{
  const d=simple();
  for(const direction of ['TB','LR']){
    const result=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,direction),{engine:'dot'}));
    assert.ok(minimumCardGap(result)>=48,direction+' '+minimumCardGap(result));
  }
  for(const seed of [1,91]){
    const positions=C.autoArrangeColaPositions(d,cola,seed);
    const result=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'LR',positions),{engine:'nop2'}));
    assert.ok(minimumCardGap(result)>=48,'cola '+seed+' '+minimumCardGap(result));
  }
  assert.ok(minimumCardGap(C.autoArrangeCandidates(d,viz,cola))>=48);
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
    out.edges.forEach(e=>{if(e.curveControls)assert.ok(C.validCurveControls(e.curveControls));assert.ok(!/NaN|Infinity/.test(C.edgePath(e,L)));});
    assert.equal(C.FlowviewCompatibility.detect(out).includes('layout.cubic-curves'),out.edges.some(e=>!!e.curveControls));
  }
  assert.throws(()=>C.autoArrangeInput({nodes:{}}),/Add a node/);
  assert.throws(()=>C.autoArrangeInput({nodes:{a:{}},edges:[{from:'a',to:'missing'}]}),/missing nodes/);
  assert.throws(()=>C.autoArrangeInput({nodes:Object.fromEntries(Array.from({length:81},(_,i)=>[i,{}]))}),/80 nodes/);
});

test('atomic planner preserves semantic content, other sections and source; rejects malformed worker results',()=>{
  const d=simple();d.steps=[{edge:'a->b',text:'Keep'}];d.panels=[{id:'panel',type:'deviceapp'}];d.paths=[{id:'path',steps:[1]}];
  d.edges[0].label='Keep label';d.edges[0].bend=42;d.edges[0].labelDx=123;
  d.edges[0].fromPort={side:'left',offset:.2};d.edges[0].toPort={side:'top',offset:.8};
  const raw={page:{title:'Keep',sections:[{diagram:d},{heading:'Unaffected',diagram:simple()}]}},text=JSON.stringify(raw,null,2);
  const result=C.autoArrangeCandidates(d,viz,cola),plan=C.planAutoArrange(text,raw,0,result),out=JSON.parse(plan.text);
  assert.notEqual(plan.text,text);assert.equal(JSON.stringify(raw,null,2),text);
  assert.deepEqual(out.page.sections[1],raw.page.sections[1]);
  const next=out.page.sections[0].diagram;
  for(const k of ['nodes','steps','paths','panels'])assert.deepEqual(next[k],d[k]);
  assertAutoPorts(next.edges);
  assert.equal(next.edges[0].label,'Keep label');assert.equal(next.edges[0].bend,undefined);assert.equal(next.edges[0].curveControls,undefined);assert.equal(next.edges[0].labelDx,undefined);
  const invalid=plain(result);invalid.positions[0].x=NaN;assert.ok(C.planAutoArrange(text,raw,0,invalid).error);
  const poison=plain(result);poison.edges[0].from='missing';
  poison.edges[0].fromPort={side:'right'};poison.edges[0].toPort={side:'invalid'};poison.edges[0].labelDx=123;
  assert.equal(JSON.parse(C.planAutoArrange(text,raw,0,poison).text).page.sections[0].diagram.edges[0].labelDx,undefined);
  for(const controls of [null,[],[{}],[{t:2,dx:0,dy:0},{t:.5,dx:0,dy:0}]]){
    const invalid=plain(result);invalid.edges[0].curveControls=controls;assert.ok(C.planAutoArrange(text,raw,0,invalid).error);
  }
  for(const edge of [null,[],42,'invalid']){const invalid=plain(result);invalid.edges[0]=edge;assert.ok(C.planAutoArrange(text,raw,0,invalid).error);}
  assertAutoPorts(JSON.parse(C.planAutoArrange(text,raw,0,poison).text).page.sections[0].diagram.edges);
  assertAutoPorts(C.autoArrangeDiagram(d,poison).edges);
  assert.equal(JSON.parse(C.planAutoArrange(text,raw,0,poison).text).page.sections[0].diagram.edges[0].from,'a');
});

test('native cubic split preserves shape; controls, joins, endpoints, deletion and bounds remain editable',()=>{
  const d=simple(),out=C.autoArrangeDiagram(d,C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'LR'),{engine:'dot'}))),e=out.edges[0],L=C.layout(out);
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
  assert.deepEqual(plain(segs[0][0]),plain(C.edgePortPoint(final.pos[e.from],{cx:firstAnchor.x,cy:firstAnchor.y})));
  C.expandPlacedEdgeBounds(out.edges,final,C.edgeAutoAdjust(out.edges,final));
  for(const p of C.samplePathD(C.edgePath(e,final)))assert.ok(p.x>=final.vb.x && p.x<=final.vb.x+final.vb.w && p.y>=final.vb.y && p.y<=final.vb.y+final.vb.h);
});

test('auto attachments change sides with moved nodes and ignore prior manual ports when placing labels',()=>{
  const d={nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Connection'}]};
  const json=viz.renderJSON(C.autoArrangeDot(d,'LR'),{engine:'dot'}),result=C.autoArrangeRead(d,json);
  const manual=plain(d);manual.edges[0].fromPort={side:'left',offset:.2};manual.edges[0].toPort={side:'top',offset:.8};
  assert.deepEqual(plain(C.autoArrangeRead(manual,json)),plain(result),'manual ports do not skew label nudges');
  const out=C.autoArrangeDiagram(manual,result),edge=out.edges[0],before=C.edgeCurveSegments(edge,C.layout(out));
  assertAutoPorts(out.edges);assert.equal(before[0][0].nx,1);assert.equal(before.at(-1).at(-1).nx,-1);
  const from=out.floats.find(f=>f.id==='a'),to=out.floats.find(f=>f.id==='b');to.x=from.x;to.y=from.y+800;
  const after=C.edgeCurveSegments(edge,C.layout(out));
  assert.equal(after[0][0].ny,1);assert.equal(after.at(-1).at(-1).ny,-1);
  assert.ok(C.validCurveControls(edge.curveControls));
  assert.ok(!/NaN|Infinity/.test(C.edgePath(edge,C.layout(out))));
});

test('safe automatic routes have natural labels, dynamic attachments and editable handles',()=>{
  const d={nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Natural',labelDx:999,labelDy:-999}]};
  const result=C.autoArrangeCandidates(d,viz,cola),out=C.autoArrangeDiagram(d,result),e=out.edges[0],L=C.layout(out);
  assert.deepEqual(plain(result.edges),[{}]);assert.equal(e.labelDx,undefined);assert.equal(e.labelDy,undefined);assertAutoPorts(out.edges);
  assert.equal(C.FlowviewCompatibility.detect(out).includes('layout.cubic-curves'),false);
  assert.equal(C.placedEdgePoints(e,L,{})[0].nx,1);
  const from=out.floats.find(f=>f.id==='a'),to=out.floats.find(f=>f.id==='b');to.x=from.x;to.y=from.y+300;
  const moved=C.layout(out),points=C.placedEdgePoints(e,moved,{});assert.equal(points[0].ny,1);assert.equal(points[3].ny,-1);
  const shaped={...e,curveControls:points.slice(1,-1).map((p,i)=>C.edgeCurvePoint(e,moved,p,(i+1)/3))};
  assert.ok(C.validCurveControls(shaped.curveControls));assert.ok(C.splitEdgeCubic(shaped,moved,0,.5).points.length>2);
});

test('natural route selection and scoring use the same avoidance geometry as the viewer',()=>{
  const d={nodes:{a:{},b:{},obstacle:{},outlet:{}},edges:[{from:'a',to:'b'},{from:'obstacle',to:'outlet'}]};
  // The obstacle lies directly between a and b; its own edge goes right, leaving
  // a clear automatic bow to the left. Fixed positions isolate viewer routing.
  const positions={a:{x:100,y:100},b:{x:100,y:500},obstacle:{x:100,y:300},outlet:{x:500,y:300}};
  const native=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'LR',positions),{engine:'nop2'}));
  const result=C.autoArrangeNaturalRoutes(d,plain(native)),out=C.autoArrangeDiagram(d,result),L=C.layout(out);
  const index=0,edge=out.edges[index];assert.equal(edge.curveControls,undefined);
  assert.deepEqual(plain(result.edges),[{},{}],'both routes use shared automatic geometry');
  const rects=Object.entries(L.pos).filter(([id])=>id!==edge.from && id!==edge.to).map(([,p])=>({x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h}));
  const adjustments=C.resolveEdgeAvoidance(out.edges,L,C.edgeAutoAdjust(out.edges,L));
  assert.ok(C.countPathRectHits(C.samplePathD(C.edgePath(edge,L)),rects)>0,'the unadjusted route would hit a card');
  assert.equal(C.countPathRectHits(C.samplePathD(C.edgePath(edge,L,adjustments[index])),rects),0);
  assert.equal(result.score.hits,0);assert.deepEqual(plain(result.score),plain(C.autoArrangeScore(d,result)));
  const original=C.autoArrangeScore;let scores=0;
  C.autoArrangeScore=(...args)=>{scores++;return original(...args);};
  try{
    C.autoArrangeNaturalRoutes(d,native);assert.equal(scores,1,'selection scores the final layout once, not once per edge');
  }finally{C.autoArrangeScore=original;}
});

test('edge length scores straight center distances while curves still determine card hits and bounds',()=>{
  const d={nodes:{a:{},b:{},c:{}},edges:[{from:'a',to:'b'}]};
  const result={positions:[{id:'a',x:100,y:100},{id:'b',x:500,y:100},{id:'c',x:300,y:300}],
    edges:[{curveControls:[{t:1/3,dx:0,dy:0},{t:2/3,dx:0,dy:0}]}]};
  const straight=C.autoArrangeScore(d,result),bowed=plain(result);
  bowed.edges[0].curveControls.forEach(p=>p.dy=800/3);
  const curve=C.autoArrangeScore(d,bowed);
  assert.equal(straight.length,400);assert.equal(curve.length,400);
  assert.equal(straight.hits,0);assert.ok(curve.hits>0,'the drawn curve still checks unrelated cards');
  bowed.edges[0].curveControls.forEach(p=>p.dy=600);
  assert.ok(C.autoArrangeScore(d,bowed).area>straight.area,'the drawn curve still contributes occupied bounds');
  const diagonal={...result,positions:[{id:'a',x:100,y:100},{id:'b',x:400,y:500},{id:'c',x:900,y:100}]};
  assert.equal(C.autoArrangeScore(d,diagonal).length,500,'distance uses both axes and card centers');
  d.edges.push({from:'a',to:'b'},{from:'a',to:'a'});diagonal.edges.push(diagonal.edges[0],diagonal.edges[0]);
  assert.equal(C.autoArrangeScore(d,diagonal).length,1000,'parallel edges each count; a self edge has zero center distance');
});

test('native geometry roundtrips, resets both representations, validates shape, and advertises its capability',()=>{
  const d=C.autoArrangeDiagram(simple(),C.autoArrangeRead(simple(),viz.renderJSON(C.autoArrangeDot(simple(),'LR'),{engine:'dot'}))),raw={page:{title:'Native',blocks:[{diagram:d}]}},text=JSON.stringify(raw);
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

test('directed paths follow topology in balanced snake rows with at most four cards',()=>{
  for(const count of [1,4,5,6,9,12,13]){
    const ids=Array.from({length:count},(_,i)=>'n'+i);
    // Neither declaration nor edge order supplies the traversal order.
    const d={nodes:Object.fromEntries(ids.slice().reverse().map(id=>[id,{title:id}])),rows:[ids],
      edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id})).reverse()};
    const columns=Math.ceil(count/Math.ceil(count/4));
    const result=C.autoArrangeCandidates(d,viz,cola),byId=Object.fromEntries(result.positions.map(p=>[p.id,p]));
    const rows=new Map();
    ids.forEach((id,i)=>{const p=byId[id];if(!rows.has(p.y))rows.set(p.y,[]);rows.get(p.y).push(id);
      if(i && i%columns){assert.equal(p.y,byId[ids[i-1]].y);assert.ok(Math.floor(i/columns)%2?p.x<byId[ids[i-1]].x:p.x>byId[ids[i-1]].x);}
      if(i && !(i%columns)){assert.ok(p.y>byId[ids[i-1]].y);assert.equal(p.x,byId[ids[i-1]].x);}
    });
    assert.deepEqual([...rows.values()].map(row=>row.length),Array.from({length:Math.ceil(count/4)},(_,i)=>Math.min(columns,count-i*columns)));
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);
    if(count>1)assert.ok(minimumCardGap(result)>=48);
    if(count>4 && count<=12){
      const rowYs=[...rows.keys()];assert.equal(rowYs[1]-rowYs[0],204,'short chains do not add empty rows to chase screen aspect');
      assert.equal(Math.abs(byId[ids[1]].x-byId[ids[0]].x),204);
    }
    if(count>12)assert.ok(result.score.aspect>=1 && result.score.aspect<=16/9);
    if(count===6)assert.deepEqual([...rows.values()].map(row=>row.length),[3,3]);
  }
  assert.equal(C.autoArrangeChainPositions(simple()),null,'cycles do not become chains');
  assert.equal(C.autoArrangeChainPositions({nodes:{a:{},b:{},c:{}},edges:[{from:'a',to:'b'},{from:'a',to:'c'}]}),null,'forks do not become chains');
});

test('candidate ordering minimizes crossings before footprint, then center distances and occupied area',()=>{
  const candidate=(crossings,shape,length,area)=>({score:{crossings,shape,length,area}});
  assert.ok(C.autoArrangeCompare(candidate(0,3,2000,10000),candidate(1,0,10,100))<0);
  assert.ok(C.autoArrangeCompare(candidate(0,0,2000,10000),candidate(0,.2,10,100))<0);
  assert.ok(C.autoArrangeCompare(candidate(0,0,10,10000),candidate(0,0,20,100))<0);
  assert.ok(C.autoArrangeCompare(candidate(0,0,10,100),candidate(0,0,10,200))<0);
  const d={nodes:{a:{},b:{}},rows:[['a','b']],edges:[]};
  function score(dx,dy){return C.autoArrangeScore(d,{positions:[{id:'a',x:100,y:100},{id:'b',x:100+dx,y:100+dy}],edges:[]});}
  assert.equal(score(150,256).aspect,1);assert.equal(score(150,256).shape,0);
  assert.equal(score(250,181).aspect,16/9);assert.equal(score(250,181).shape,0);
  assert.ok(score(0,256).shape>0);assert.ok(score(600,100).shape>0);
  assert.equal(score(150,256).area,300*300,'minimum viewer width is excluded');
});

test('small-diagram leaf refinement preserves the selected fork and improves compactness before edge length',()=>{
  const d=require('../examples/auto-arrange-baselines/graph-input.spec.json').page.blocks[1].diagram;
  const seed=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'TB',null,1.5),{engine:'dot'}));seed.score=C.autoArrangeScore(d,seed);
  let attempts=0;const result=C.autoArrangeCandidates(d,{renderJSON(...args){attempts++;return viz.renderJSON(...args);}},cola);
  const before=Object.fromEntries(seed.positions.map(p=>[p.id,p])),after=Object.fromEntries(result.positions.map(p=>[p.id,p]));
  for(const id of Object.keys(d.nodes).filter(id=>id!=='archive'))assert.deepEqual(plain(after[id]),plain(before[id]),'the fork retains '+id);
  assert.equal(after.archive.y,after.publish.y);assert.equal(after.archive.x-after.publish.x,204);
  assert.equal(result.score.width,962);assert.equal(result.score.height,624);
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);
  assert.ok(minimumCardGap(result)>=48);assertAutoPorts(result.edges);
  assert.ok(result.score.length>seed.score.length,'tucking a leaf can shorten the footprint despite a longer connection');
  assert.ok(C.autoArrangeCompare(result,seed,true)<0);assert.ok(C.autoArrangeCompare(result,seed)>0);
  assert.equal(attempts,7,'only one extra routing attempt refines the chosen structural seed');
  assert.equal(C.autoArrangeSmall({nodes:Object.fromEntries(Array.from({length:13},(_,i)=>[i,{}])),edges:[]}),false);
  assert.equal(C.autoArrangeSmall({nodes:{a:{},b:{}},edges:Array(25).fill({from:'a',to:'b'})}),false);
});

test('terminal-leaf refinement skips blocked card positions and rejects unsafe rerouting',()=>{
  const positions=[{id:'parent',x:0,y:0},{id:'leaf',x:0,y:800},{id:'right',x:204,y:0},
    {id:'left',x:-204,y:0},{id:'below',x:0,y:116},{id:'above',x:0,y:-116}];
  const blocked={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges:[{from:'parent',to:'leaf'}]};
  assert.equal(C.autoArrangeLeafPositions(blocked,{positions}),null,'every adjacent position is occupied');
  const d=require('../examples/auto-arrange-baselines/graph-input.spec.json').page.blocks[1].diagram;
  const seed=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'TB',null,1.5),{engine:'dot'}));
  let refinements=0;
  const result=C.autoArrangeCandidates(d,{renderJSON(source,options){
    const json=viz.renderJSON(source,options);
    if(options.engine==='nop2'){
      refinements++;const nodes=json.objects.filter(n=>/^n\d+$/.test(n.name));nodes[1].pos=nodes[0].pos;
      assert.ok(C.autoArrangeScore(d,C.autoArrangeRead(d,json)).overlaps>0);
    }
    return json;
  }},null);
  assert.equal(refinements,1);assert.deepEqual(plain(result.positions),plain(seed.positions));
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);
});

test('unsafe candidate geometry is rejected even when every attempt returns it',()=>{
  const d=simple(),json=viz.renderJSON(C.autoArrangeDot(d,'TB'),{engine:'dot'});
  const nodes=json.objects.filter(n=>/^n\d+$/.test(n.name));nodes[1].pos=nodes[0].pos;
  assert.ok(C.autoArrangeScore(d,C.autoArrangeRead(d,json)).overlaps>0);
  assert.throws(()=>C.autoArrangeCandidates(d,{renderJSON:()=>json},null),/clear cards and connections/);
});

test('six reproducible baselines preserve semantics and fit complex graphs within square to 16:9',()=>{
  const input=require('../examples/auto-arrange-baselines/graph-input.spec.json');
  const saved=require('../examples/auto-arrange-baselines/auto-arranged.spec.json');
  for(const spec of [input,saved])assert.deepEqual(plain(C.validate(C.normalize(spec)).errors),[]);
  assert.equal(input.page.blocks.length,6);
  input.page.blocks.forEach((block,i)=>{
    const d=block.diagram,result=C.autoArrangeCandidates(d,viz,cola),out=plain(C.autoArrangeDiagram(d,result));
    assert.deepEqual(out,saved.page.blocks[i].diagram,block.id+' reproduces exactly');
    assertAutoPorts(result.edges);assertAutoPorts(out.edges);
    const retained=out.edges.filter(e=>e.curveControls);
    assert.equal(retained.length,[0,0,0,0,0,0][i],block.id+' retains only needed curves');
    assert.equal(C.FlowviewCompatibility.detect(out).includes('layout.cubic-curves'),retained.length>0);
    out.edges.forEach((edge,index)=>{
      if(!edge.curveControls){assert.equal(edge.labelDx,undefined);assert.equal(edge.labelDy,undefined);return;}
      assert.ok(C.validCurveControls(edge.curveControls));
      const natural=plain(result);natural.edges[index]={};const score=C.autoArrangeScore(d,natural);
      assert.ok(score.hits>0 || score.crossings>result.score.crossings,block.id+' needs the retained curve '+index);
    });
    assert.deepEqual(out.nodes,d.nodes);assert.deepEqual(out.groups,d.groups);
    assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
    assert.ok(minimumCardGap(result)>=48,block.id+' gap '+minimumCardGap(result));
    if(i===0){assert.equal(result.score.width,558);assert.equal(result.score.height,248);}
    else{assert.ok(result.score.aspect>=1 && result.score.aspect<=16/9,block.id+' aspect '+result.score.aspect);assert.equal(result.score.shape,0);}
    assert.equal(result.score.crossings,i===5?1:0,block.id);
    if(i===2 || i===3){
      for(const axis of ['x','y']){
        const values=[...new Set(result.positions.map(p=>p[axis]))].sort((a,b)=>a-b),gap=values[1]-values[0];
        values.slice(1).forEach((value,j)=>assert.ok(Math.abs(value-values[j]-gap)<.1,block.id+' has equally spaced occupied '+axis+' centers'));
      }
      assert.equal(out.edges.some(e=>e.curveControls),false,'aligned cases retain natural curves');
      const byId=Object.fromEntries(result.positions.map(p=>[p.id,p]));
      if(i===2){
        const expectedRows=[['app','edge','jobs'],['collector'],['logs','router','alerts'],['logdb','traces','metrics','metricdb'],['tracedb'],['dashboard']];
        expectedRows.forEach((row,index)=>row.forEach(id=>assert.equal(byId[id].y,100+116*index,id+' is on the intended shared row')));
        const expectedColumns=[['app','logs','logdb'],['edge','collector','router','traces','tracedb','dashboard'],['jobs','metrics'],['alerts','metricdb']];
        expectedColumns.forEach((column,index)=>column.forEach(id=>assert.equal(byId[id].x,120+240*index,id+' is on the intended shared column')));
        assert.equal(result.score.width,870);assert.equal(result.score.height,624);
      }else{
        assert.equal(result.score.width,762);assert.equal(result.score.height,644);assert.ok(result.score.length<4200);
        const expectedRows=[['buyer','storefront','gateway'],['cart','checkout'],['payment','risk','inventory'],['warehouse','events','order'],['carrier','notify','analytics','ops'],['mail']];
        expectedRows.forEach((row,index)=>row.forEach(id=>assert.equal(byId[id].y,100+120*index,id+' shares the compact processing row')));
        assert.ok(byId.buyer.x<byId.storefront.x && byId.storefront.x<byId.gateway.x,'entrance reads left to right');
        for(const [from,to] of [['warehouse','carrier'],['notify','mail']])assert.equal(byId[from].x,byId[to].x,'terminal chain stays in its column');
      }
    }
    if(i===4){
      assert.ok(result.score.width<=1200 && result.score.height<=900);assert.ok(result.score.length<7000);
      for(const axis of ['x','y']){
        const values=[...new Set(result.positions.map(p=>p[axis]))].sort((a,b)=>a-b),gap=values[1]-values[0];
        values.slice(1).forEach((value,j)=>assert.equal((value-values[j])%gap,0,'media uses a regular '+axis+' grid'));
      }
    }
    if(i>=4)assert.equal(result.score.incidentCrossings,0,'fan-in and fan-out curves do not weave after their shared endpoint');
    if(i===5)assert.ok(result.score.length<2600,'nonplanar graph keeps compact center distances');
    if(i>=2 && i<=4){assert.ok(Object.values(d.nodes).some(n=>n.title.startsWith('Legacy')));assert.ok(d.edges.some(e=>e.label));}
  });
});

test('failed aligned rerouting retains the safe selected layout',()=>{
  const d=require('../examples/auto-arrange-baselines/graph-input.spec.json').page.blocks[2].diagram;
  const align=C.autoArrangeAlignedPositions;
  try{
    C.autoArrangeAlignedPositions=()=>null;
    const expected=C.autoArrangeCandidates(d,viz,null);
    C.autoArrangeAlignedPositions=()=>{
      const unsafe=plain(expected);unsafe.positions[1].x=unsafe.positions[0].x;unsafe.positions[1].y=unsafe.positions[0].y;
      unsafe.score=C.autoArrangeScore(d,unsafe);assert.ok(unsafe.score.overlaps>0);return unsafe;
    };
    let retries=0;
    const result=C.autoArrangeCandidates(d,{renderJSON(source,options){
      if(options.engine==='nop2'){retries++;throw new Error('routing unavailable');}
      return viz.renderJSON(source,options);
    }},null);
    assert.equal(retries,1);assert.deepEqual(plain(result),plain(expected));
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);
  }finally{C.autoArrangeAlignedPositions=align;}
});

test('compact corridor search is name-independent, bounded, and cannot replace a safe layout with failed routing',()=>{
  const d=require('../examples/auto-arrange-baselines/graph-input.spec.json').page.blocks[3].diagram,fold=C.autoArrangeFoldedPositions;
  let seed;
  try{C.autoArrangeFoldedPositions=()=>[];seed=C.autoArrangeCandidates(d,viz,null);}
  finally{C.autoArrangeFoldedPositions=fold;}
  const positions=fold(d,seed);assert.ok(positions.length>0 && positions.length<=4);
  const ids=Object.keys(d.nodes),names=Object.fromEntries(ids.map((id,i)=>[id,'renamed_'+i]));
  const renamed={...d,nodes:Object.fromEntries(ids.map(id=>[names[id],d.nodes[id]])),edges:d.edges.map(e=>({...e,from:names[e.from],to:names[e.to]}))};
  const renamedSeed={...seed,positions:seed.positions.map(p=>({...p,id:names[p.id]}))};
  const again=fold(renamed,renamedSeed);
  assert.deepEqual(plain(again.map(p=>ids.map(id=>p[names[id]]))),plain(positions.map(p=>ids.map(id=>p[id]))));
  let retries=0;
  try{
    C.autoArrangeFoldedPositions=()=>{
      const unsafe=plain(positions[0]);unsafe[ids[1]]={...unsafe[ids[0]]};return [unsafe];
    };
    const result=C.autoArrangeCandidates(d,{renderJSON(source,options){
      if(options.engine==='nop2'){retries++;throw new Error('routing unavailable');}
      return viz.renderJSON(source,options);
    }},null);
    assert.equal(retries,1);assert.deepEqual(plain(result),plain(seed));
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);
  }finally{C.autoArrangeFoldedPositions=fold;}
  const tooLarge={nodes:Object.fromEntries(Array.from({length:21},(_,i)=>['n'+i,{}])),edges:[]};
  assert.deepEqual(plain(fold(tooLarge,{positions:[]})),[],'large layouts skip folding before any geometry work');
});

test('extra aspect attempts stay within the small-graph budget, including the supported 80-node grouped case',()=>{
  function attempts(d){
    const sources=[];
    // Exhaust every attempt without paying for native routing. A failed engine
    // must not cause more optional work than a successful candidate would.
    assert.throws(()=>C.autoArrangeCandidates(d,{renderJSON(source){sources.push(source);throw new Error('test routing failure');}},null),/clear cards/);
    return sources;
  }
  function sized(nodes,edges){
    return {nodes:Object.fromEntries(Array.from({length:nodes},(_,i)=>['n'+i,{group:'g'}])),groups:{g:{}},
      edges:Array.from({length:edges},()=>({from:'n0',to:'n1'}))};
  }
  assert.equal(attempts(sized(24,48)).filter(source=>source.includes('ratio=')).length,2);
  for(const d of [sized(25,48),sized(24,49)]){
    const sources=attempts(d);assert.equal(sources.length,2);assert.ok(sources.every(source=>!source.includes('ratio=')));
  }
  const d={nodes:{},groups:{},edges:[]},source=fixture.page.blocks[0].diagram;
  for(let copy=0;copy<4;copy++){
    const prefix='copy'+copy+'_';
    for(const [id,node] of Object.entries(source.nodes))d.nodes[prefix+id]={...node,group:prefix+node.group};
    for(const [id,group] of Object.entries(source.groups)){
      d.groups[prefix+id]={...group};if(group.parent)d.groups[prefix+id].parent=prefix+group.parent;
    }
    d.edges.push(...source.edges.map(edge=>({...edge,from:prefix+edge.from,to:prefix+edge.to})));
  }
  assert.equal(Object.keys(d.nodes).length,80);assert.equal(d.edges.length,144);
  assert.equal(attempts(d).length,2,'large supported grouped graphs keep the original two-candidate routing budget');
});

test('route-bounds pruning retains crossings and ignores distant disconnected routes',()=>{
  const d={nodes:{a:{},b:{},c:{},d:{},e:{},f:{}},rows:[['a','b','c','d','e','f']],
    edges:[{from:'a',to:'b'},{from:'c',to:'d'},{from:'e',to:'f'}]};
  const positions={a:{x:0,y:0},b:{x:400,y:400},c:{x:0,y:400},d:{x:400,y:0},e:{x:1000,y:0},f:{x:1000,y:400}};
  const result=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'LR',positions),{engine:'nop2'}));
  const score=C.autoArrangeScore(d,result);
  assert.equal(score.overlaps,0);assert.equal(score.hits,0);assert.equal(score.crossings,1);
});

test('long grouped chains keep compact snake geometry across the optional candidate cutoff',()=>{
  for(const count of [24,25,80])for(const grouping of ['common','nested','rows']){
    const ids=Array.from({length:count},(_,i)=>'n'+i),groups=grouping==='nested'?{outer:{title:'Outer'},common:{title:'Shared',parent:'outer'}}:{common:{title:'Shared'}};
    const nodes=Object.fromEntries(ids.map((id,i)=>{
      const group=grouping==='rows'?'row'+Math.floor(i/4):'common';
      if(grouping==='rows')groups[group]={title:'Stage '+Math.floor(i/4)};
      return [id,{title:id,group}];
    }));
    const d={nodes,groups,rows:[ids],edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id}))};
    let attempts=0;
    const result=C.autoArrangeCandidates(d,{renderJSON(...args){attempts++;return viz.renderJSON(...args);}},cola);
    const out=plain(C.autoArrangeDiagram(d,result));
    assert.equal(attempts,1,count+' '+grouping+' accepts the safe snake directly');
    assert.deepEqual(out.nodes,nodes);assert.deepEqual(out.groups,groups);
    assert.deepEqual(out.edges.map(({from,to})=>({from,to})),d.edges);
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);
    assert.ok(result.score.aspect>=1 && result.score.aspect<=16/9,count+' '+grouping+' '+result.score.aspect);
    assert.ok(minimumCardGap(result)>=48);
    const rows=new Map();result.positions.forEach(p=>rows.set(p.y,(rows.get(p.y)||0)+1));
    assert.equal(rows.size,Math.ceil(count/4));assert.ok([...rows.values()].every(count=>count<=4));
  }
});

test('grouped snakes with overlapping group boxes fall back to safe clustered candidates',()=>{
  const ids=Array.from({length:6},(_,i)=>'n'+i);
  const d={nodes:Object.fromEntries(ids.map((id,i)=>[id,{group:i%2?'odd':'even'}])),groups:{odd:{},even:{}},rows:[ids],
    edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id}))};
  const snake=C.autoArrangeRead(d,viz.renderJSON(C.autoArrangeDot(d,'LR',C.autoArrangeChainPositions(d)),{engine:'nop2'}));
  assert.ok(C.autoArrangeScore(d,snake).overlaps>0);
  let attempts=0;const result=C.autoArrangeCandidates(d,{renderJSON(...args){attempts++;return viz.renderJSON(...args);}},cola);
  assert.ok(attempts>1);assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
  assert.deepEqual(plain(C.autoArrangeDiagram(d,result).groups),d.groups);
});


test('natural grid search is deterministic and independent of IDs, titles and tints on synthetic bipartite graphs',()=>{
  const ids=['p0','p1','p2','q0','q1','q2'];
  const d={nodes:Object.fromEntries(ids.map(id=>[id,{title:id}])),edges:ids.slice(0,3).flatMap(from=>ids.slice(3).map(to=>({from,to}))),rows:[ids]};
  const result=C.autoArrangeCandidates(d,viz,cola);
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,1);
  assert.ok(result.score.length<2600);assert.equal(result.score.shape,0);assert.ok(result.edges.every(e=>!e.curveControls));
  const names=Object.fromEntries(ids.map((id,i)=>[id,'different_'+(19-i)]));
  const renamed={nodes:Object.fromEntries(ids.map(id=>[names[id],{title:'Unrelated text',tint:'auth'}])),edges:d.edges.map(e=>({from:names[e.from],to:names[e.to]})),rows:[ids.map(id=>names[id])]};
  const again=C.autoArrangeCandidates(renamed,viz,cola);
  assert.deepEqual(plain(again.positions),plain(result.positions.map(p=>({...p,id:names[p.id]}))));
  assert.deepEqual(plain(again.score),plain(result.score));
});

test('optional natural grid proposals cannot regress final viewer safety, crossings, shape or length',()=>{
  const d=require('../examples/auto-arrange-baselines/graph-input.spec.json').page.blocks[5].diagram,grid=C.autoArrangeGridPositions;
  try{
    C.autoArrangeGridPositions=()=>[];const expected=C.autoArrangeCandidates(d,viz,cola);
    const overlap=plain(expected);overlap.positions[1]={...overlap.positions[0],id:overlap.positions[1].id};
    const longer=plain(expected);longer.positions.forEach(p=>{p.x*=2;p.y*=2;});
    const tall=plain(expected);tall.positions.forEach(p=>{p.y*=2;});
    const crossed={positions:Object.keys(d.nodes).map((id,i)=>({id,x:120+(i%3)*204+(i>=3?13:0),y:100+Math.floor(i/3)*240+i*7})),edges:d.edges.map(()=>({}))};
    assert.ok(C.autoArrangeScore(d,overlap).overlaps>0);
    assert.ok(C.autoArrangeScore(d,crossed).crossings>expected.score.crossings);
    C.autoArrangeGridPositions=()=>[overlap,longer,tall,crossed];
    assert.deepEqual(plain(C.autoArrangeCandidates(d,viz,cola)),plain(expected));
  }finally{C.autoArrangeGridPositions=grid;}
});

test('natural grid search skips resolved, grouped, self-loop and over-budget graphs before building cell geometry',()=>{
  const pending={score:{crossings:1},edges:[]},resolved={score:{crossings:0},edges:[]};
  const sized=(nodes,edges)=>({nodes:Object.fromEntries(Array.from({length:nodes},(_,i)=>['v'+i,{}])),edges:Array.from({length:edges},()=>({from:'v0',to:'v1'}))});
  for(const d of [sized(21,1),sized(20,33),sized(80,144),{...sized(6,9),nodes:{a:{group:'g'}}},{...sized(6,0),edges:[{from:'v0',to:'v0'}]}]){
    assert.deepEqual(plain(C.autoArrangeGridPositions(d,pending)),[]);
  }
  assert.deepEqual(plain(C.autoArrangeGridPositions(sized(20,24),resolved)),[]);
});


test('incident route scoring detects fan-out weaving beyond a shared port and clears a distributed fan',()=>{
  const ids=Array.from({length:6},(_,i)=>'v'+i),d={nodes:Object.fromEntries(ids.map(id=>[id,{}])),rows:[[]],edges:ids.slice(1).map(to=>({from:ids[0],to}))};
  const positions=[{id:ids[0],x:528,y:300},...ids.slice(1).map((id,i)=>({id,x:120+i*204,y:420}))];
  const crowded={positions,edges:d.edges.map(()=>({}))},score=C.autoArrangeScore(d,crowded);
  assert.equal(score.overlaps,0);assert.equal(score.hits,0);assert.equal(score.crossings,0);
  assert.equal(score.incidentCrossings,2,'automatic curves overshoot the nearby sink row and weave');
  const distributed=plain(crowded);distributed.positions[1].y=300;distributed.positions[5].y=300;
  const clear=C.autoArrangeScore(d,distributed);
  assert.equal(clear.overlaps,0);assert.equal(clear.hits,0);assert.equal(clear.crossings,0);assert.equal(clear.incidentCrossings,0);
  const reversed={...d,edges:d.edges.map(e=>({from:e.to,to:e.from}))};
  assert.equal(C.autoArrangeScore(reversed,crowded).incidentCrossings,2,'fan-in receives the same geometric check');
});

test('large cleanup straightens branches and shares ranks without worsening final route safety',()=>{
  const input=require('../examples/auto-arrange-large-baselines/graph-input.spec.json');
  const refine=C.autoArrangeLargeAligned,motifs=C.autoArrangeMotifCandidates,global=C.autoArrangeGlobalLattice,terminal=C.autoArrangeTerminalFolds,geometry=C.autoArrangeMotifGeometry;
  C.autoArrangeMotifCandidates=(d,result)=>result;C.autoArrangeGlobalLattice=(d,result)=>result;C.autoArrangeTerminalFolds=(d,result)=>result;C.autoArrangeMotifGeometry=(d,result)=>result;
  try{
  for(const [i,block] of input.page.blocks.entries()){
    const d=block.diagram;let before;
    try{C.autoArrangeLargeAligned=(d,result)=>result;before=C.autoArrangeCandidates(d,viz,cola);}
    finally{C.autoArrangeLargeAligned=refine;}
    const started=performance.now(),result=C.autoArrangeCandidates(d,viz,cola),out=plain(C.autoArrangeDiagram(d,result));
    assert.ok(performance.now()-started<20000,block.id+' stays inside worker deadline');
    assert.deepEqual(plain(refine(d,before)),plain(result),block.id+' cleanup is deterministic');
    if(i===1){
      const names=Object.fromEntries(Object.keys(d.nodes).map((id,j)=>[id,'renamed-'+j]));
      const renamed={nodes:Object.fromEntries(Object.keys(d.nodes).map(id=>[names[id],{title:'Different label',tint:'data'}])),edges:d.edges.map(e=>({from:names[e.from],to:names[e.to]}))};
      const seed={positions:before.positions.map(p=>({...p,id:names[p.id]})),edges:before.edges,score:before.score};
      const renamedResult=refine(renamed,seed);
      assert.deepEqual(plain(renamedResult.positions.map(({x,y})=>({x,y}))),plain(result.positions.map(({x,y})=>({x,y}))),'alignment ignores IDs, labels and tints');
    }
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
    assert.ok(result.score.crossings<=before.score.crossings,block.id+' ordinary crossings');
    assert.ok(result.score.incidentCrossings<=before.score.incidentCrossings,block.id+' incident crossings');
    assert.ok(Math.hypot(result.score.width,result.score.height)<=Math.hypot(before.score.width,before.score.height)+.1,block.id+' footprint');
    assert.ok(result.score.length<=before.score.length*1.03,block.id+' center distance stays bounded');
    assert.ok(largeLeafDiagonals(d,result).length<largeLeafDiagonals(d,before).length,block.id+' fewer diagonal leaves');
    assert.ok(largeLeafDiagonals(d,result).length<=[0,0,1,3][i],block.id+' safe branch alignment');
    const lines=r=>['x','y'].reduce((n,axis)=>n+new Set(r.positions.map(p=>Math.round(p[axis]*10))).size,0);
    assert.ok(lines(result)<lines(before),block.id+' more shared row/column coordinates');
    assert.ok(result.edges.filter(e=>e.curveControls).length<=before.edges.filter(e=>e.curveControls).length);
    assertAutoPorts(out.edges);assert.deepEqual(out.nodes,d.nodes);
    assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));
    assert.deepEqual(plain(C.validate(C.normalize(out)).errors),[]);
  }
  }finally{C.autoArrangeMotifCandidates=motifs;C.autoArrangeGlobalLattice=global;C.autoArrangeTerminalFolds=terminal;C.autoArrangeMotifGeometry=geometry;}
});

test('large alignment refuses unsafe proposals and bounds geometry checks at the maximum graph size',()=>{
  const d={nodes:{},edges:[]},positions=[];
  for(let i=0;i<80;i++){const id='node'+i;d.nodes[id]={};positions.push({id,x:120+(i%10)*211+(i%3)*13,y:100+Math.floor(i/10)*117});}
  for(let i=0;i<160;i++)d.edges.push({from:'node'+(i%80),to:'node'+((i+1+(i>=80?7:0))%80)});
  const original={positions,edges:d.edges.map(()=>({})),score:{overlaps:0,hits:0,crossings:0,incidentCrossings:0,length:1e6,width:2200,height:1000}};
  const score=C.autoArrangeScore;let checks=0;
  try{
    C.autoArrangeScore=()=>{checks++;return {...original.score,hits:1};};
    assert.equal(C.autoArrangeLargeAligned(d,original),original,'all unsafe changes retain the selected candidate');
    assert.ok(checks>0);assert.ok(checks<=Math.floor(C.AUTO_ARRANGE_LARGE_ALIGNMENT_LIMITS.work/(80*160)),checks+' bounded full-geometry checks');
    d.nodes.node0.group='group';checks=0;
    assert.equal(C.autoArrangeLargeAligned(d,original),original);assert.equal(checks,0,'grouped layouts are outside this pass');
  }finally{C.autoArrangeScore=score;}
});

test('motif scaffolds find corridors, fans and joins from wiring alone',()=>{
  const nodes=Object.fromEntries(['a','b','c','d','e','f','g','h'].map(id=>[id,{title:'Ignored',tint:'auth'}]));
  const d={nodes,edges:[['a','b'],['b','c'],['c','d'],['c','e'],['d','f'],['e','f'],['f','g'],['g','c'],['f','h']].map(([from,to])=>({from,to}))};
  const ranks=plain(C.autoArrangeMotifScaffolds(d));
  assert.ok(ranks.some(r=>r.join(',')==='0,1,2'),'entry corridor');
  assert.ok(ranks.some(r=>r.includes(3)&&r.includes(4)),'split/rejoin siblings');
  assert.ok(ranks.some(r=>r.join(',')==='5,6,2'),'feedback corridor');
  const ids=Object.keys(nodes),names=Object.fromEntries(ids.map((id,i)=>[id,'changed-'+i]));
  const renamed={nodes:Object.fromEntries(ids.map(id=>[names[id],{}])),edges:d.edges.map(e=>({from:names[e.from],to:names[e.to]}))};
  assert.deepEqual(plain(C.autoArrangeMotifScaffolds(renamed)),ranks);
});

test('global composition creates reproducible safe shared axes and a square freight scaffold',()=>{
  const input=require('../examples/auto-arrange-large-baselines/graph-input.spec.json'),saved=require('../examples/auto-arrange-large-baselines/auto-arranged.spec.json');
  const motif=C.autoArrangeMotifCandidates,global=C.autoArrangeGlobalLattice,terminal=C.autoArrangeTerminalFolds,geometry=C.autoArrangeMotifGeometry;
  for(const [i,block] of input.page.blocks.entries()){
    const d=block.diagram;let before;
    try{C.autoArrangeMotifCandidates=(d,result)=>result;C.autoArrangeGlobalLattice=(d,result)=>result;C.autoArrangeTerminalFolds=(d,result)=>result;C.autoArrangeMotifGeometry=(d,result)=>result;before=C.autoArrangeCandidates(d,viz,cola);}
    finally{C.autoArrangeMotifCandidates=motif;C.autoArrangeGlobalLattice=global;C.autoArrangeTerminalFolds=terminal;C.autoArrangeMotifGeometry=geometry;}
    const started=performance.now();let beforeFold,afterFold,result;
    try{C.autoArrangeTerminalFolds=(d,r,v)=>{beforeFold=r;afterFold=terminal(d,r,v);return afterFold;};result=C.autoArrangeCandidates(d,viz,cola);}
    finally{C.autoArrangeTerminalFolds=terminal;}
    const out=plain(C.autoArrangeDiagram(d,result));
    assert.ok(performance.now()-started<20000,block.id+' worker deadline');
    assert.deepEqual(out,saved.page.blocks[i].diagram,block.id+' deterministic generated output');
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
    assert.ok(result.score.crossings<=before.score.crossings);assert.ok(result.score.incidentCrossings<=before.score.incidentCrossings);
    assert.ok(Math.hypot(result.score.width,result.score.height)<Math.hypot(before.score.width,before.score.height));
    assert.ok(minimumCardGap(result)>=53.9,block.id+' retains normal card clearance');
    assertAutoPorts(result.edges);assert.deepEqual(out.nodes,d.nodes);
    assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));
    const axes=axis=>[...new Set(result.positions.map(p=>Math.round(p[axis]*10)/10))].sort((a,b)=>a-b);
    assert.ok(axes('x').length<=[6,7,8,9][i],block.id+' uses shared graph-wide columns');
    for(const value of axes('x'))assert.ok(Math.abs((value-axes('x')[0])/204-Math.round((value-axes('x')[0])/204))<.001,block.id+' all composed motifs share the same x lattice');
    if(i<2){
      assert.ok(axes('y').length<=10,block.id+' reuses shared rows');
      for(const axis of ['x','y']){
        const values=axes(axis),step=axis==='x'?204:98;
        for(const value of values)assert.ok(Math.abs((value-values[0])/step-Math.round((value-values[0])/step))<.001,block.id+' every node remains on the global '+axis+' lattice');
      }
      assert.ok(result.score.area<before.score.area*.5,block.id+' materially smaller footprint');
      assert.ok(result.score.length<before.score.length*.8,block.id+' shorter center distances');
    }
    if(i===0){
      const original=Object.fromEntries(beforeFold.positions.map(p=>[p.id,p])),folded=Object.fromEntries(afterFold.positions.map(p=>[p.id,p]));
      assert.ok(d.edges.some(e=>original[e.to].y>original[e.from].y && folded[e.to].y<folded[e.from].y),'an originally downward edge is accepted pointing upward');
      assert.ok(new Set(afterFold.positions.map(p=>p.y)).size<=7,'terminal corridors reuse interior rows');
      assert.ok(afterFold.score.area<beforeFold.score.area*.7,'upward fold removes more than thirty percent of footprint');
      assert.ok(afterFold.score.length<=beforeFold.score.length*1.03,'upward folding keeps the original length allowance');
      assert.equal(afterFold.score.crossings,beforeFold.score.crossings);assert.equal(afterFold.score.incidentCrossings,beforeFold.score.incidentCrossings);
      assert.equal(result.score.crossings,0);assert.equal(result.score.incidentCrossings,0,'compound motif moves remove the remaining fan intersection');
      assert.ok(result.score.length<afterFold.score.length*.8,'compound composition shortens links by more than twenty percent');
      assert.ok(result.score.area<=afterFold.score.area*1.03,'clarity improvement stays near the old occupied area');
      const motifs=C.autoArrangeConnectedMotifs(d),positions=Object.fromEntries(result.positions.map(p=>[p.id,p])),ids=Object.keys(d.nodes);
      const tail=motifs.chains.find(chain=>chain.ids.length===3 && d.edges.some(e=>e.from===ids[chain.anchor] && e.to===ids[chain.ids[0]]));
      assert.ok(tail);const tailPoints=tail.ids.map(i=>positions[ids[i]]);
      assert.equal(new Set(tailPoints.map(p=>p.y)).size,1,'terminal tail docks as a shared bottom row');
      assert.ok(tailPoints.every(p=>p.y>positions[ids[tail.anchor]].y));
      assert.ok(result.score.length<before.score.length*.9,'incident links become shorter');const cardWidth=axes('x').at(-1)-axes('x')[0]+150,cardHeight=axes('y').at(-1)-axes('y')[0]+44;
      assert.ok(cardWidth>=cardHeight-204,'incident falls short of square by at most one global column pitch');
      assert.ok(result.score.area<afterFold.score.area*.85,'portrait exception materially reduces occupied area');}
    if(i===1)assert.ok(result.score.area<before.score.area*.92,'billing removes surplus row spacing');
    if(i===2){
      assert.ok(result.score.aspect>=1 && result.score.aspect<=16/9,'freight fits square to landscape without padding');
      assert.ok(result.score.height<before.score.height*.65);assert.ok(result.score.length<before.score.length*1.1);
      assert.ok(axes('y').length<=15,'freight preserves composed rows');
      const rows=new Map();result.positions.forEach(p=>rows.set(p.y,(rows.get(p.y)||0)+1));
      assert.ok([...rows.values()].some(n=>n>=5),'several connected local motifs share an expanded row');
    }
    if(i===3){assert.ok(axes('y').length<=17,'data preserves composed rows');assert.ok(result.score.crossings<=2);assert.equal(result.score.incidentCrossings,0);assert.ok(result.score.length<before.score.length*.75);}
    assert.deepEqual(plain(C.validate(C.normalize(out)).errors),[]);
  }
});

test('motif composition keeps unsafe layouts out and bounds routing attempts',()=>{
  const d={nodes:{},edges:[]},positions=[];
  for(let i=0;i<80;i++){d.nodes['n'+i]={};positions.push({id:'n'+i,x:120+(i%10)*240,y:100+Math.floor(i/10)*160});}
  for(let i=0;i<79;i++)d.edges.push({from:'n'+i,to:'n'+(i+1)});
  for(let i=0;i<65;i++)d.edges.push({from:'n'+i,to:'n'+(i+8)});
  const result={positions,edges:d.edges.map(()=>({})),score:{overlaps:0,hits:0,crossings:0,incidentCrossings:0,length:1e5,width:2400,height:1400,shape:0}};
  const routes=C.autoArrangeNaturalRoutes;let calls=0;
  try{
    C.autoArrangeNaturalRoutes=(d,r)=>({...r,score:{...result.score,hits:1}});
    assert.equal(C.autoArrangeMotifCandidates(d,result,{renderJSON(){calls++;throw Error('No route');}}),result);
    assert.ok(calls>0);assert.ok(calls<=Math.floor(C.AUTO_ARRANGE_MOTIF_LIMITS.work/(80*144)));
    d.nodes.n0.group='group';calls=0;
    assert.equal(C.autoArrangeMotifCandidates(d,result,{renderJSON(){calls++;}}),result);assert.equal(calls,0);
  }finally{C.autoArrangeNaturalRoutes=routes;}
});

test('real ungrouped 80-node 160-edge composition stays inside the worker deadline',()=>{
  const d={nodes:{},rows:[[]],edges:[]};
  for(let i=0;i<80;i++){d.nodes['n'+i]={title:'Node '+i};d.rows[0].push('n'+i);}
  for(let i=0;i<79;i++)d.edges.push({from:'n'+i,to:'n'+(i+1)});
  for(let i=0;i<65;i++)d.edges.push({from:'n'+i,to:'n'+(i+8)});
  for(let i=0;i<16;i++)d.edges.push({from:'n'+i,to:'n'+(i+16)});
  const started=performance.now(),result=C.autoArrangeCandidates(d,viz,cola);
  assert.ok(performance.now()-started<20000);assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
  assert.equal(result.positions.length,80);assert.equal(result.edges.length,160);assertAutoPorts(result.edges);
});

test('a better motif shape cannot add incident crossings to the current best',()=>{
  const d={nodes:Object.fromEntries(Array.from({length:21},(_,i)=>['n'+i,{}])),edges:[]};
  const positions=Object.keys(d.nodes).map((id,i)=>({id,x:120+i*204,y:100}));
  const score={overlaps:0,hits:0,crossings:0,incidentCrossings:2,length:10000,width:2000,height:2000,shape:1};
  const original={positions,edges:[],score},scaffolds=C.autoArrangeMotifScaffolds,read=C.autoArrangeRead,routes=C.autoArrangeNaturalRoutes;
  let calls=0,first;
  try{
    C.autoArrangeMotifScaffolds=()=>[[0,1],[2,3]];
    C.autoArrangeRead=()=>{const candidate={positions,edges:[],score:{...score,incidentCrossings:calls===1?0:1,shape:calls===1?.5:0}};if(calls===1)first=candidate;return candidate;};
    C.autoArrangeNaturalRoutes=(d,r)=>r.score?r:{...r,score:{...score,hits:1}};
    const result=C.autoArrangeMotifCandidates(d,original,{renderJSON(){calls++;return {};}});
    assert.equal(result,first);assert.equal(result.score.incidentCrossings,0);
  }finally{C.autoArrangeMotifScaffolds=scaffolds;C.autoArrangeRead=read;C.autoArrangeNaturalRoutes=routes;}
});

test('long corridor and fan motifs retain their local edges in bounded overlapping windows',()=>{
  const nodes=Object.fromEntries(Array.from({length:21},(_,i)=>['v'+i,{}]));
  const corridor={nodes,edges:Array.from({length:10},(_,i)=>({from:'v'+i,to:'v'+(i+1)})).concat([{from:'v0',to:'v11'}])};
  const ranks=plain(C.autoArrangeMotifScaffolds(corridor));
  for(let i=0;i<10;i++)assert.ok(ranks.some(r=>r.includes(i)&&r.includes(i+1)),'corridor edge '+i+' survives windowing');
  assert.ok(ranks.every(r=>r.length>=2&&r.length<=C.AUTO_ARRANGE_MOTIF_LIMITS.span));
  assert.deepEqual(plain(C.autoArrangeMotifScaffolds(corridor)),ranks,'corridor windows are deterministic');
  const fan={nodes,edges:Array.from({length:13},(_,i)=>({from:'v0',to:'v'+(i+1)}))};
  const fanRanks=plain(C.autoArrangeMotifScaffolds(fan));
  assert.ok(fanRanks.every(r=>r.length>=2&&r.length<=C.AUTO_ARRANGE_MOTIF_LIMITS.span));
  for(let i=1;i<=13;i++)assert.ok(fanRanks.some(r=>r.includes(i)),'fan attachment '+i+' survives windowing');
  assert.equal(fanRanks.length,3,'fan partition grows linearly instead of enumerating subsets');
  assert.deepEqual(plain(C.autoArrangeMotifScaffolds(fan)),fanRanks,'fan windows are deterministic');
});

test('motif compaction cannot squeeze a preferred-band source into portrait shape',()=>{
  const d={nodes:Object.fromEntries(Array.from({length:21},(_,i)=>['n'+i,{}])),edges:[]};
  const positions=Object.keys(d.nodes).map((id,i)=>({id,x:120+i*300,y:100}));
  const score={overlaps:0,hits:0,crossings:0,incidentCrossings:0,length:10000,width:1200,height:1000,shape:0};
  const original={positions,edges:[],score},scaffolds=C.autoArrangeMotifScaffolds,routes=C.autoArrangeNaturalRoutes;let checks=0;
  try{
    C.autoArrangeMotifScaffolds=()=>[];
    C.autoArrangeNaturalRoutes=(d,r)=>{checks++;return {...r,score:{...score,length:8000,width:900,height:1000,shape:Math.log(1000/900)}};};
    assert.equal(C.autoArrangeMotifCandidates(d,original,{}),original,'smaller portrait proposals cannot leave the preferred band');
    assert.ok(checks>0);
  }finally{C.autoArrangeMotifScaffolds=scaffolds;C.autoArrangeNaturalRoutes=routes;}
});

test('global lattice rejects unsafe proposals, bounds rerouting, and skips unsupported sizes before geometry work',()=>{
  const nodes=Object.fromEntries(Array.from({length:32},(_,i)=>['n'+i,{}]));
  const d={nodes,edges:Array.from({length:31},(_,i)=>({from:'n'+i,to:'n'+(i+1)}))};
  const result={positions:Object.keys(nodes).map((id,i)=>({id,x:120+(i%8)*240,y:100+Math.floor(i/8)*160})),edges:d.edges.map(()=>({})),score:{overlaps:0,hits:0,crossings:0,incidentCrossings:0,length:10000,width:2000,height:1800,area:3600000,shape:0}};
  const before=plain(result),score=C.autoArrangeScore;let calls=0,checks=0;
  try{
    C.autoArrangeScore=()=>{checks++;return {...result.score,hits:1};};
    assert.equal(C.autoArrangeGlobalLattice(d,result,{renderJSON(){calls++;throw Error('Unsafe route');}}),result);
    assert.ok(calls>0);assert.ok(calls<=C.AUTO_ARRANGE_GLOBAL_LIMITS.attempts+C.AUTO_ARRANGE_GLOBAL_LIMITS.columnAttempts);assert.deepEqual(plain(result),before);
    d.nodes.n0.group='group';calls=checks=0;
    assert.equal(C.autoArrangeGlobalLattice(d,result,{}),result);assert.equal(checks,0);assert.equal(calls,0);
    delete d.nodes.n0.group;
    for(let i=32;i<49;i++)d.nodes['n'+i]={};
    assert.equal(C.autoArrangeGlobalLattice(d,result,{}),result);assert.equal(checks,0,'large graphs retain the preceding bounded motif layout');
  }finally{C.autoArrangeScore=score;}
});


test('terminal folding rejects failed routes, caps proposals and skips groups and oversized graphs',()=>{
  const nodes=Object.fromEntries(Array.from({length:21},(_,i)=>['n'+i,{}]));
  const d={nodes,edges:[[0,1],[1,2],[2,3],[0,4],[0,5]].map(([a,b])=>({from:'n'+a,to:'n'+b}))};
  const result={positions:Object.keys(nodes).map((id,i)=>({id,x:120+(i%6)*204,y:100+Math.floor(i/6)*116})),edges:d.edges.map(()=>({})),score:{overlaps:0,hits:0,crossings:0,incidentCrossings:0,length:100000,area:10000000,width:4000,height:2500,shape:0}};
  for(let i=0;i<4;i++){result.positions[i].x=120;result.positions[i].y=680+i*116;}
  const original=plain(result),score=C.autoArrangeScore;let calls=0;
  try{
    C.autoArrangeScore=()=>({...result.score,hits:1});
    const failingViz={renderJSON(){calls++;throw Error('No safe route');}};
    assert.equal(C.autoArrangeTerminalFolds(d,result,failingViz),result);
    assert.ok(calls>0 && calls<=64);assert.deepEqual(plain(result),original);
    calls=0;d.nodes.n0.group='group';assert.equal(C.autoArrangeTerminalFolds(d,result,failingViz),result);assert.equal(calls,0);
    delete d.nodes.n0.group;for(let i=21;i<49;i++)d.nodes['n'+i]={};
    assert.equal(C.autoArrangeTerminalFolds(d,result,failingViz),result);assert.equal(calls,0);
  }finally{C.autoArrangeScore=score;}
});

test('connected motifs derive source fans, terminal docks and two-boundary blocks from topology alone',()=>{
  const nodes=Object.fromEntries(Array.from({length:15},(_,i)=>['n'+i,{}]));
  const pairs=[[0,1],[1,2],[3,2],[2,4],[4,5],[5,6],[5,7],[6,7],[6,8],[7,8],[8,5],[5,9],[9,2],[8,10],[10,11],[11,12]];
  const d={nodes,edges:pairs.map(([a,b])=>({from:'n'+a,to:'n'+b}))},motifs=C.autoArrangeConnectedMotifs(d);
  assert.ok(motifs.chains.some(chain=>chain.anchor===2 && chain.ids.join(',')==='1,0'));
  assert.ok(motifs.chains.some(chain=>chain.anchor===8 && chain.ids.join(',')==='10,11,12'));
  assert.ok(motifs.blocks.some(block=>block.join(',')==='5,6,7,8,10,11,12'),'two boundary links expose the block and its attached tail');
  assert.deepEqual([...motifs.fanNodes].sort((a,b)=>a-b),[0,1,2,3]);
  assert.ok(motifs.blocks.length<=C.AUTO_ARRANGE_GEOMETRY_LIMITS.blocks);
  const renamed={nodes:Object.fromEntries(Object.keys(nodes).map((_,i)=>['renamed'+i,{title:'Unrelated text',tint:'data'}])),edges:pairs.map(([a,b])=>({from:'renamed'+a,to:'renamed'+b}))};
  const shape=m=>plain({chains:m.chains,blocks:m.blocks,fans:[...m.fanNodes],core:[...m.blockCoreNodes],hubs:[...m.blockHubNodes]});
  assert.deepEqual(shape(C.autoArrangeConnectedMotifs(renamed)),shape(motifs));
  d.edges.push({...d.edges[0]});assert.deepEqual(plain(C.autoArrangeConnectedMotifs(d).chains),plain(motifs.chains),'parallel routes do not change terminal node degree');
});

test('compound motif search retains its source on unsafe routing and bounds all optional passes',()=>{
  const nodes=Object.fromEntries(Array.from({length:21},(_,i)=>['n'+i,{}]));
  const pairs=[[0,2],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,5],[5,9],[9,10],[10,11]];
  const d={nodes,edges:pairs.map(([a,b])=>({from:'n'+a,to:'n'+b}))};
  const result={positions:Object.keys(nodes).map((id,i)=>({id,x:120+(i%4)*204,y:100+Math.floor(i/4)*116})),edges:d.edges.map(()=>({})),score:{overlaps:0,hits:0,crossings:0,incidentCrossings:0,length:100000,area:10000000,width:4000,height:2500,shape:0}};
  const original=plain(result),score=C.autoArrangeScore;let calls=0;
  try{
    C.autoArrangeScore=()=>({...result.score,hits:1});
    const failingViz={renderJSON(){calls++;throw Error('No safe route');}};
    assert.equal(C.autoArrangeMotifGeometry(d,result,failingViz),result);
    const limit=C.AUTO_ARRANGE_GEOMETRY_LIMITS;
    assert.ok(calls>0 && calls<=limit.attempts+limit.finishing+limit.polishing);assert.deepEqual(plain(result),original);
    calls=0;d.nodes.n0.group='group';assert.equal(C.autoArrangeMotifGeometry(d,result,failingViz),result);assert.equal(calls,0);
    delete d.nodes.n0.group;for(let i=21;i<49;i++)d.nodes['n'+i]={};
    assert.equal(C.autoArrangeMotifGeometry(d,result,failingViz),result);assert.equal(calls,0);
  }finally{C.autoArrangeScore=score;}
});


test('local fan polishing accepts a diagonal shared-grid slot using actual routes',()=>{
  const coordinates=[[324,296],[528,296],[528,492],[324,492],[936,394],[120,296],[324,394]];
  for(const y of [100,198,688,786])for(const x of [120,324,528,732,936])if(coordinates.length<21)coordinates.push([x,y]);
  const d={nodes:Object.fromEntries(coordinates.map((_,i)=>['n'+i,{}])),edges:[{from:'n1',to:'n0'},{from:'n2',to:'n0'},{from:'n0',to:'n3'}]};
  const source={positions:coordinates.map(([x,y],i)=>({id:'n'+i,x,y})),edges:d.edges.map(()=>({}))};source.score=C.autoArrangeScore(d,source);
  const limits=C.AUTO_ARRANGE_GEOMETRY_LIMITS,attempts=limits.attempts,finishing=limits.finishing,polishing=limits.polishing;
  try{
    // Isolate the existing polishing budget: neither block search nor global
    // finishing can create the diagonal placement exercised here. All four
    // cardinal hub slots are occupied, and one proposal cannot take two steps.
    limits.attempts=0;limits.finishing=0;limits.polishing=1;
    const result=C.autoArrangeMotifGeometry(d,source,viz),hub=result.positions.find(p=>p.id==='n0');
    assert.equal(hub.x,528);assert.equal(hub.y,394);
    assert.equal(result.score.crossings,0);assert.equal(result.score.incidentCrossings,0);assert.equal(result.score.hits,0);assert.equal(result.score.overlaps,0);
    assert.ok(minimumCardGap(result)>=53.9);assert.ok(result.score.length<source.score.length*.7);assert.equal(result.score.shape,0);assertAutoPorts(result.edges);
    assert.deepEqual(plain(source.positions),coordinates.map(([x,y],i)=>({id:'n'+i,x,y})),'source remains unchanged');
    const renamed={nodes:Object.fromEntries(coordinates.map((_,i)=>['v'+i,{title:'Different',tint:'data'}])),edges:d.edges.map(e=>({from:e.from.replace('n','v'),to:e.to.replace('n','v')}))};
    const other={positions:source.positions.map(p=>({...p,id:p.id.replace('n','v')})),edges:source.edges,score:source.score};
    const equivalent=C.autoArrangeMotifGeometry(renamed,other,viz);
    assert.deepEqual(plain(equivalent.positions.map(p=>[p.x,p.y])),plain(result.positions.map(p=>[p.x,p.y])),'labels and IDs do not affect refinement');
  }finally{limits.attempts=attempts;limits.finishing=finishing;limits.polishing=polishing;}
});

test('fan crowding penalizes nearly parallel branches without a direction preference',()=>{
  const adj=[[1,2,3],[0],[0],[0]],narrow=[{x:0,y:0},{x:200,y:0},{x:200,y:30},{x:200,y:-30}],wide=[{x:0,y:0},{x:200,y:0},{x:0,y:200},{x:-200,y:0}];
  assert.ok(C.autoArrangeFanCrowding(narrow,adj)>100);assert.equal(C.autoArrangeFanCrowding(wide,adj),0);
  const rotated=narrow.map(p=>({x:100-p.y,y:70+p.x}));
  assert.ok(Math.abs(C.autoArrangeFanCrowding(rotated,adj)-C.autoArrangeFanCrowding(narrow,adj))<1e-9);
});

test('final incident controls are necessary even when naturalized in combinations',()=>{
  const d=require('../examples/auto-arrange-large-baselines/auto-arranged.spec.json').page.blocks[0].diagram;
  const result={positions:plain(d.floats),edges:plain(d.edges)},score=C.autoArrangeScore(d,result),controlled=d.edges.map((e,i)=>e.curveControls?i:-1).filter(i=>i>=0);
  assert.equal(controlled.length,3);assert.equal(score.hits,0);assert.equal(score.crossings,0);assert.equal(score.incidentCrossings,0);
  assertAutoPorts(d.edges);d.edges.forEach(e=>{assert.equal(e.labelDx,undefined);assert.equal(e.labelDy,undefined);});
  for(let mask=1;mask<(1<<controlled.length);mask++){
    const naturalized={positions:result.positions,edges:result.edges.map((e,i)=>controlled.some((index,k)=>index===i && (mask&(1<<k)))?{}:e)},s=C.autoArrangeScore(d,naturalized);
    assert.ok(s.hits>0 || s.crossings>score.crossings || s.incidentCrossings>score.incidentCrossings,'control-removal subset '+mask+' must avoid a real obstruction');
  }
  const cleaned=C.autoArrangeNaturalRoutes(d,plain(result),true);
  assert.deepEqual(plain(C.autoArrangeDiagram(d,cleaned)),d,'final automatic-route cleanup is stable');
});

test('a collinear skip connection cannot hide a hit on its intervening card',()=>{
  const d={nodes:{a:{},b:{},c:{}},edges:[{from:'a',to:'c'}]},positions=[{id:'a',x:120,y:100},{id:'b',x:324,y:100},{id:'c',x:528,y:100}];
  for(const edges of [[{}],[{curveControls:[{t:1/3,dx:0,dy:0},{t:2/3,dx:0,dy:0}]}]])assert.equal(C.autoArrangeScore(d,{positions,edges}).hits,1);
});


test('compact column exception rejects weak gains, larger bounds and excessive shape loss',()=>{
  const source={positions:[0,1,2,3,4].map((x,i)=>({id:'n'+i,x:120+x*204,y:i===4?900:100})),score:{width:1000,height:900,area:900000,length:1000}};
  const candidate={positions:source.positions.map(p=>({...p,x:Math.min(p.x,732)})),score:{width:800,height:900,area:720000,length:970}};
  const accepts=(c=candidate,s=source,r=900,sr=1000)=>C.autoArrangeCompactColumnTrade(c,s,r,sr);
  assert.equal(accepts(),true);
  for(const [key,value] of [['area',765001],['length',980.01],['width',1000.2],['height',900.2]])assert.equal(accepts({...candidate,score:{...candidate.score,[key]:value}}),false,key);
  assert.equal(accepts(candidate,source,1000,1000),false,'sampled routes must strictly shorten');
  assert.equal(accepts({...candidate,positions:source.positions}),false,'must remove one populated column');
  assert.equal(accepts({...candidate,positions:candidate.positions.map(p=>({...p,x:Math.min(p.x,528)}))}),false,'cannot remove two columns');
  assert.equal(accepts({...candidate,positions:candidate.positions.map(p=>({...p,x:120+(p.x-120)*.8}))}),false,'cannot squeeze card width beyond one pitch');
  assert.equal(accepts({...candidate,positions:candidate.positions.map(p=>({...p,y:p.y===900?1200:p.y}))}),false,'card height cannot grow');
  assert.equal(accepts({...candidate,positions:candidate.positions.map(p=>({...p,y:p.y===900?300:p.y}))}),false,'cannot become excessively landscape');
  const tall={...source,positions:source.positions.map(p=>({...p,y:p.y===900?1200:p.y}))};
  assert.equal(accepts(candidate,tall),false,'source card silhouette must be preferred before losing a column');
  const routeBulge={...candidate,score:{...candidate.score,width:850,area:765000}};
  assert.equal(accepts(routeBulge),true,'a safe route bulge does not define card aspect');
});
