'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
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
  assert.ok(out.edges.find(e=>e.label==='retry').labelDx!==undefined);
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
    out.edges.forEach(e=>{assert.ok(C.validCurveControls(e.curveControls));assert.ok(!/NaN|Infinity/.test(C.edgePath(e,L)));});
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
  assert.equal(next.edges[0].label,'Keep label');assert.equal(next.edges[0].bend,undefined);assert.ok(next.edges[0].curveControls);
  const invalid=plain(result);invalid.positions[0].x=NaN;assert.ok(C.planAutoArrange(text,raw,0,invalid).error);
  const poison=plain(result);poison.edges[0].from='missing';
  poison.edges[0].fromPort={side:'right'};poison.edges[0].toPort={side:'invalid'};
  assertAutoPorts(JSON.parse(C.planAutoArrange(text,raw,0,poison).text).page.sections[0].diagram.edges);
  assertAutoPorts(C.autoArrangeDiagram(d,poison).edges);
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

test('directed paths follow topology in balanced snake rows with at most four cards',()=>{
  for(const count of [1,4,5,6,9]){
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
    if(count>4)assert.ok(result.score.aspect>=1 && result.score.aspect<=16/9);
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
    assert.deepEqual(out.nodes,d.nodes);assert.deepEqual(out.groups,d.groups);
    assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));
    assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);
    assert.ok(minimumCardGap(result)>=48,block.id+' gap '+minimumCardGap(result));
    assert.ok(result.score.aspect>=1 && result.score.aspect<=16/9,block.id+' aspect '+result.score.aspect);assert.equal(result.score.shape,0);
    assert.equal(result.score.crossings,i===5?3:0,block.id);
    if(i>=2 && i<=4){assert.ok(Object.values(d.nodes).some(n=>n.title.startsWith('Legacy')));assert.ok(d.edges.some(e=>e.label));}
  });
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
