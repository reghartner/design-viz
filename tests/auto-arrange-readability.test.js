'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const C={URL};vm.runInNewContext(require('../tools/source-loader.cjs').entrypoint('workbench').body,C);
const Viz=require('../src/workbench/vendor/viz-3.31.0.js');let viz;test.before(async()=>{viz=await Viz.instance();});
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const d={nodes:Object.fromEntries(['a','b','c','d','e','f'].map(id=>[id,{title:id}])),edges:[['a','d'],['b','d'],['c','d'],['d','e'],['e','f']].map(([from,to])=>({from,to,label:from+' to '+to})),steps:[{id:'start',edge:'a->d',text:'Keep'}],paths:[{id:'path',steps:['start']}],panels:[{id:'panel',type:'deviceapp'}]};
  const result={positions:[['a',120,100],['b',405,100],['c',690,100],['d',405,252],['e',690,404],['f',690,556]].map(([id,x,y])=>({id,x,y})),edges:d.edges.map(()=>({}))};result.score=C.autoArrangeScore(d,result);return {d,result};
}
function minGap(r){let gap=Infinity;r.positions.forEach((a,i)=>r.positions.slice(i+1).forEach(b=>{gap=Math.min(gap,Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44)));}));return gap;}
function assertSafe(before,after){assert.equal(after.score.overlaps,0);assert.equal(after.score.hits,0);assert.ok(after.score.crossings<=before.score.crossings);assert.ok(after.score.incidentCrossings<=before.score.incidentCrossings);assert.ok(minGap(after)>=minGap(before)-.1);assert.ok(after.score.width<=before.score.width*1.1+.1);assert.ok(Math.hypot(after.score.width,after.score.height)<=Math.hypot(before.score.width,before.score.height)+.1);}

test('sparse rows fold adjacent terminal links without reversing a source join or enforcing screen aspect',()=>{
  const {d,result}=fixture(),unchanged=plain({d,result}),after=C.autoArrangeReadability(d,result,viz),out=plain(C.autoArrangeDiagram(d,after));
  assertSafe(result,after);assert.ok(after.score.height<result.score.height);assert.ok(after.score.area<result.score.area*.75);
  assert.equal(result.score.shape,0);assert.ok(after.score.aspect>16/9,'a shorter drawing may be wider than a monitor');
  const positions=Object.fromEntries(after.positions.map(p=>[p.id,p]));
  for(const id of ['a','b','c'])assert.ok(positions[id].y<=positions.d.y,'inputs retain their join direction');
  for(const [a,b] of [['d','e'],['e','f']])assert.ok(positions[a].x===positions[b].x || positions[a].y===positions[b].y,'terminal links use cardinal neighbors');
  for(const key of ['nodes','steps','paths','panels'])assert.deepEqual(out[key],d[key]);assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges);
  assert.deepEqual(plain({d,result}),unchanged,'search is nonmutating');assert.deepEqual(plain(C.autoArrangeReadability(d,result,viz)),plain(after),'bounded search is deterministic');
  const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,'node-'+i]));
  const renamed={nodes:Object.fromEntries(Object.keys(d.nodes).map(id=>[names[id],{title:'Unrelated'}])),edges:d.edges.map(e=>({...e,from:names[e.from],to:names[e.to]}))};
  const seed={positions:result.positions.map(p=>({...p,id:names[p.id]})),edges:result.edges,score:result.score};
  assert.deepEqual(plain(C.autoArrangeReadability(renamed,seed,viz).positions.map(({x,y})=>({x,y}))),plain(after.positions.map(({x,y})=>({x,y}))));
});

test('row candidates cannot spend either crossing budget or introduce card hits, and work is bounded',()=>{
  const {d,result}=fixture(),score=C.autoArrangeScore;
  for(const key of ['hits','overlaps','crossings','incidentCrossings']){
    let checks=0,routes=0;
    try{C.autoArrangeScore=(d,r)=>{checks++;return {...score(d,r),[key]:result.score[key]+1};};
      const after=C.autoArrangeReadability(d,result,{renderJSON(...args){routes++;return viz.renderJSON(...args);}});
      assert.equal(after,result,key+' cannot be traded for fewer rows');assert.ok(checks>0);assert.ok(checks<=C.AUTO_ARRANGE_READABILITY_LIMITS.checks+C.AUTO_ARRANGE_READABILITY_LIMITS.routes);assert.ok(routes<=C.AUTO_ARRANGE_READABILITY_LIMITS.routes);
    }finally{C.autoArrangeScore=score;}
  }
});

test('feedback, disconnected nodes and self/parallel connections retain identities and safe final routes',()=>{
  const {d,result}=fixture();d.nodes.isolated={title:'Unconnected'};result.positions.push({id:'isolated',x:975,y:100});
  d.edges.push({from:'f',to:'d',label:'Feedback'},{from:'a',to:'a',label:'Self'},{from:'a',to:'d',label:'Parallel'});result.edges=d.edges.map(()=>({}));result.score=C.autoArrangeScore(d,result);
  const after=C.autoArrangeReadability(d,result,viz),out=plain(C.autoArrangeDiagram(d,after));
  // The seed itself need not be safe; any published change must not add defects.
  if(after!==result)assertSafe(result,after);
  assert.deepEqual(out.nodes,d.nodes);assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges);
  assert.equal(after.positions.length,Object.keys(d.nodes).length);assert.deepEqual(plain(C.validate(C.normalize(out)).errors),[]);
});

test('grouped and over-budget graphs bypass the extra search',()=>{
  const {d,result}=fixture();d.nodes.a.group='g';d.groups={g:{title:'Group'}};
  const fail={renderJSON(){assert.fail('unsupported graph must not route');}};
  assert.equal(C.autoArrangeReadability(d,result,fail),result);delete d.nodes.a.group;
  for(let i=0;i<80;i++)d.nodes['extra'+i]={};assert.equal(C.autoArrangeReadability(d,result,fail),result);
});

test('edge-over-budget and irregular-row layouts bypass candidate scoring and routing',()=>{
  const many=fixture(),irregular=fixture();
  many.d.edges=Array.from({length:C.AUTO_ARRANGE_READABILITY_LIMITS.edges+1},(_,i)=>({...many.d.edges[i%many.d.edges.length]}));
  many.result.edges=many.d.edges.map(()=>({}));many.result.score=C.autoArrangeScore(many.d,many.result);
  irregular.result.positions.at(-1).y+=12;irregular.result.score=C.autoArrangeScore(irregular.d,irregular.result);
  const score=C.autoArrangeScore,fail={renderJSON(){assert.fail('bypassed layouts must not route');}};
  try{C.autoArrangeScore=()=>assert.fail('bypassed layouts must not score candidates');
    for(const {d,result} of [many,irregular])assert.equal(C.autoArrangeReadability(d,result,fail),result);
  }finally{C.autoArrangeScore=score;}
});

test('generated research seed loses a sparse row with its source fan intact; telemetry rejects a reversed input',()=>{
  const seeds=require('./fixtures/auto-arrange-readability-seeds.json');
  for(const [file,id] of [['./fixtures/auto-arrange-training/round2-input.spec.json','research-compute-federation'],['../examples/auto-arrange-baselines/graph-input.spec.json','telemetry-fan']]){
    const d=require(file).page.blocks.find(b=>b.id===id).diagram,before=plain(seeds[id]);before.score=C.autoArrangeScore(d,before);const after=C.autoArrangeReadability(d,before,viz);assertSafe(before,after);
    if(id==='research-compute-federation'){
      assert.ok(new Set(after.positions.map(p=>p.y)).size<new Set(before.positions.map(p=>p.y)).size);
      assert.ok(after.score.area<before.score.area*.92);assert.equal(after.score.incidentCrossings,0);
      const p=Object.fromEntries(after.positions.map(p=>[p.id,p]));
      for(const edge of d.edges.filter(e=>!d.edges.some(f=>f.to===e.from)))assert.ok(p[edge.from].y<=p[edge.to].y,'original downward source inputs retain clear join direction');
    }else assert.deepEqual(plain(after),plain(before),'saving one row does not justify a source bowing back upward into the join');
    assert.deepEqual(plain(C.validate(C.normalize(C.autoArrangeDiagram(d,after))).errors),[]);
  }
});

test('full automatic pipeline publishes the compact incident graph after spacing, preserving semantics',()=>{
  const d=require('../examples/auto-arrange-large-baselines/graph-input.spec.json').page.blocks.find(b=>b.id==='incident-response').diagram;
  const refine=C.autoArrangeReadability,cola=require('../src/workbench/vendor/webcola-3.4.0.js');let before,refined,calls=0;
  let result;try{C.autoArrangeReadability=(diagram,seed,renderer)=>{calls++;before=seed;refined=refine(diagram,seed,renderer);return refined;};result=C.autoArrangeCandidates(d,viz,cola);}
  finally{C.autoArrangeReadability=refine;}
  assert.equal(calls,1);assertSafe(before,refined);assert.notEqual(result,refined,'the full pipeline publishes the later flow refinement');
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.equal(result.score.crossings,0);assert.equal(result.score.incidentCrossings,0);assert.ok(minGap(result)>=minGap(refined)-.1);
  assert.ok(result.score.area<=refined.score.area*1.35);assert.ok(C.autoArrangeFlowMetrics(d,result).blocked<C.autoArrangeFlowMetrics(d,refined).blocked);
  assert.ok(C.autoArrangeFlowMetrics(d,result).routeLength<C.autoArrangeFlowMetrics(d,refined).routeLength);
  assert.ok(new Set(result.positions.map(p=>p.y)).size<=new Set(before.positions.map(p=>p.y)).size-2);
  assert.ok(refined.score.area<before.score.area*.85);assert.deepEqual(plain(C.autoArrangeScore(d,result)),plain(result.score),'stored score measures the final viewer geometry');
  const out=plain(C.autoArrangeDiagram(d,result));assert.deepEqual(out.nodes,d.nodes);assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));
  assert.deepEqual(plain(C.validate(C.normalize(out)).errors),[]);
});
