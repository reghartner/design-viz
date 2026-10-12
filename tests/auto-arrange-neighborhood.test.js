'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const C={URL};vm.runInNewContext(require('../tools/source-loader.cjs').entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v)),seeds=require('./fixtures/auto-arrange-neighborhood-seeds.json');
const inputs=[require('../examples/auto-arrange-large-baselines/graph-input.spec.json'),require('./fixtures/auto-arrange-training/round2-input.spec.json'),require('../examples/auto-arrange-baselines/graph-input.spec.json')];
const diagram=id=>plain(inputs.flatMap(s=>s.page.blocks).find(b=>b.id===id).diagram);
let viz;test.before(async()=>{viz=await require('../src/workbench/vendor/viz-3.31.0.js').instance();});
function seed(d,id){const r=plain(seeds[id]);r.score=C.autoArrangeScore(d,r);return r;}
function gap(r){return Math.min(...r.positions.flatMap((p,i)=>r.positions.slice(i+1).map(q=>Math.hypot(Math.max(0,Math.abs(p.x-q.x)-150),Math.max(0,Math.abs(p.y-q.y)-44)))));}
function safe(d,b,a){assert.equal(a.score.overlaps,0);assert.equal(a.score.hits,0);for(const k of ['crossings','incidentCrossings'])assert.ok(a.score[k]<=b.score[k],k);assert.ok(gap(a)>=gap(b)-.1);for(const k of ['width','height'])assert.ok(a.score[k]<=b.score[k]*1.1+.1);assert.ok(a.score.area<=b.score.area*1.05);assert.ok(a.score.length<=b.score.length*1.035);assert.ok(C.autoArrangeFlowMetrics(d,a).routeLength<=C.autoArrangeFlowMetrics(d,b).routeLength*1.05);assert.deepEqual(plain(a.score),plain(C.autoArrangeScore(d,a)));const out=plain(C.autoArrangeDiagram(d,a));assert.deepEqual(out.nodes,d.nodes);assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));}

test('internal two-neighbor corners reach the human Support, ML and Cost rows with clear actual paths',()=>{
  // Frozen automatic D geometry at 286f3178; separate human seed records the
  // requested positions, not an exact expected output for the entire graph.
  const d=diagram('data-platform'),r=seed(d,'data-platform'),before=plain(r),human=seeds['human-data-platform'];
  const after=C.autoArrangeNeighborhoodClarity(d,r,viz);safe(d,r,after);assert.deepEqual(plain(r),before);
  for(const id of ['support-model','ml-serving','cost-monitor']){const p=after.positions.find(p=>p.id===id),wanted=human.positions.find(p=>p.id===id);assert.ok(Math.abs(p.x-wanted.x)<.1 && Math.abs(p.y-wanted.y)<.1,id);}
  assert.ok(C.autoArrangeFlowMetrics(d,after).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength);assert.equal(after.score.incidentCrossings,0);
});

test('a leaf can sit beside its sibling when that removes an obstructed nominal cardinal link',()=>{
  const d=diagram('signage-distribution'),r=seed(d,'signage-distribution');
  const after=C.autoArrangeNeighborhoodClarity(d,r,viz);safe(d,r,after);
  const p=Object.fromEntries(after.positions.map(p=>[p.id,p]));
  assert.equal(p['sign-editor'].y,p['sign-bulk'].y);assert.ok(p['sign-editor'].x<p['sign-bulk'].x);
  const beforeLinks=C.autoArrangeVisibleLinks(d,r.positions),afterLinks=C.autoArrangeVisibleLinks(d,after.positions);
  assert.ok(afterLinks.blocked<beforeLinks.blocked);const editorOnly=r.positions.map(old=>old.id==='sign-editor'?p[old.id]:old),editorLinks=C.autoArrangeVisibleLinks(d,editorOnly);assert.ok(editorLinks.clear+editorLinks.blocked<beforeLinks.clear+beforeLinks.blocked,'the editor loses an obstructed axis alignment; another accepted leaf move may add one');
  for(const mode of ['reverse','mixed','renamed']){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,mode==='renamed'?String(100-i):id]));
    const changed={...d,nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.map((e,i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {...e,from:names[reverse?e.to:e.from],to:names[reverse?e.from:e.to]};})};
    const input={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges.map(()=>({}))};input.score=C.autoArrangeScore(changed,input);
    const output=C.autoArrangeNeighborhoodClarity(changed,input,viz),positions=Object.fromEntries(output.positions.map(p=>[p.id,p]));safe(changed,input,output);
    assert.equal(positions[names['sign-editor']].y,positions[names['sign-bulk']].y);assert.ok(positions[names['sign-editor']].x<positions[names['sign-bulk']].x);
  }
});

test('selective native repair keeps all 48 human positions and unrelated curves while eliminating both incident crossings',()=>{
  const d=diagram('data-platform'),r=seed(d,'human-data-platform'),unchanged=plain(r);
  assert.equal(r.score.crossings,1);assert.equal(r.score.incidentCrossings,2);
  const after=C.autoArrangeRerouteAffected(d,r,r.positions,new Set(['support-model']),viz);
  safe(d,r,after);assert.equal(after.score.crossings,1);assert.equal(after.score.incidentCrossings,0);assert.deepEqual(plain(after.positions),r.positions);assert.equal(after.positions.length,48);
  const changed=[];after.edges.forEach((e,i)=>{if(JSON.stringify(e)!==JSON.stringify(r.edges[i]))changed.push(i);});
  assert.deepEqual(changed,[27,30]);assert.deepEqual(plain(r),unchanged);
});

test('the full pipeline preserves the balanced three-branch diamond without a bowed branch corridor',()=>{
  const d=diagram('approval-diamond'),r=C.autoArrangeCandidates(d,viz,require('../src/workbench/vendor/webcola-3.4.0.js'));
  assert.equal(r.score.overlaps,0);assert.equal(r.score.hits,0);assert.equal(r.score.crossings,0);assert.equal(r.score.incidentCrossings,0);
  const accepted=seeds['approval-diamond-accepted'].positions,anchor=r.positions.find(p=>p.id===accepted[0].id),offset={x:anchor.x-accepted[0].x,y:anchor.y-accepted[0].y};
  for(const expected of accepted){const actual=r.positions.find(p=>p.id===expected.id);assert.ok(Math.abs(actual.x-expected.x-offset.x)<.001,expected.id+' retains its accepted column and branch role');assert.ok(Math.abs(actual.y-expected.y-offset.y)<.001,expected.id+' retains its accepted row');}
  const frames=C.autoArrangeBranchFrames(d,r.positions);assert.equal(frames.length,1);assert.deepEqual(Array.from(frames[0].branches).sort(),['policy','scan','store']);assert.equal(C.autoArrangeFlowMetrics(d,r).blocked,0);
  const changed=r.positions.map(p=>p.id==='store'?{...p,y:p.y-100}:p);assert.equal(C.autoArrangeBranchesIntact(changed,frames),false);
  const reversed={...d,edges:d.edges.map(e=>({...e,from:e.to,to:e.from}))};assert.deepEqual(plain(C.autoArrangeBranchFrames(reversed,r.positions)),plain(frames));
});

test('unsafe neighborhood proposals retain the source and bound native routing work',()=>{
  const d=diagram('signage-distribution'),r=seed(d,'signage-distribution'),score=C.autoArrangeScore,natural=C.autoArrangeNaturalRoutes;
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length']){
    let calls=0,routes=0,checks=0;try{C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};C.autoArrangeScore=(...args)=>{calls++;return {...score(...args),[key]:['hits','overlaps','crossings','incidentCrossings'].includes(key)?r.score[key]+1:r.score[key]*2};};
      assert.equal(C.autoArrangeNeighborhoodClarity(d,r,{renderJSON(...args){routes++;return viz.renderJSON(...args);}}),r,key);
      assert.ok(calls>0);assert.ok(routes<=C.AUTO_ARRANGE_NEIGHBOR_LIMITS.routes);assert.ok(checks-routes<=C.AUTO_ARRANGE_NEIGHBOR_LIMITS.checks);
    }finally{C.autoArrangeScore=score;C.autoArrangeNaturalRoutes=natural;}
  }
  for(const mutate of [d=>{d.nodes[Object.keys(d.nodes)[0]].group='g';},d=>{while(Object.keys(d.nodes).length<49)d.nodes['extra'+Object.keys(d.nodes).length]={};},d=>{d.edges=Array.from({length:81},(_,i)=>d.edges[i%d.edges.length]);}]){
    const input=plain(d);mutate(input);assert.equal(C.autoArrangeNeighborhoodClarity(input,r,{renderJSON(){assert.fail('oversized/grouped bypass must not route');}}),r);
  }
});

test('internal corner candidates use the same geometry under reversed arrows and relabeled declarations',()=>{
  const positions=[['a',120,100],['b',690,600],['c',405,350],['d',120,350],['e',975,100]].map(([id,x,y])=>({id,x,y})),links=[['a','b'],['b','c'],['c','d'],['d','a'],['c','e']];let expected;
  for(const mode of ['forward','reverse','mixed','renamed']){
    const names=Object.fromEntries(positions.map((p,i)=>[p.id,mode==='renamed'?String(10-i):p.id]));
    const d={nodes:Object.fromEntries(positions.slice().reverse().map(p=>[names[p.id],{}])),edges:links.map(([a,b],i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?b:a],to:names[reverse?a:b]};})},r={positions:positions.map(p=>({...p,id:names[p.id]})),edges:links.map(()=>({}))};r.score=C.autoArrangeScore(d,r);
    const after=C.autoArrangeNeighborhoodClarity(d,r,viz);assert.notEqual(after,r);safe(d,r,after);
    const actual=positions.map(p=>{const found=after.positions.find(q=>q.id===names[p.id]);return {id:p.id,x:found.x,y:found.y};});
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
    assert.deepEqual(actual.find(p=>p.id==='b'),{id:'b',x:405,y:100});
  }
});

test('parallel two-card branches retain their peer rows and matched columns through local cleanup',()=>{
  const d=diagram('media-platform'),r=seed(d,'media-platform'),frames=C.autoArrangeBranchFrames(d,r.positions),band=frames.find(f=>f.bands);
  assert.ok(band,'the three processing branches form a shared band despite the extra read connection');
  const jobs=['thumbnail','transcoder','captions'],stores=['thumbstore','videostore','textindex'];
  assert.deepEqual(Array.from(band.bands[0]).sort(),jobs.slice().sort());
  const after=C.autoArrangeNeighborhoodClarity(d,r,viz);safe(d,r,after);
  const p=Object.fromEntries(after.positions.map(p=>[p.id,p]));
  for(let i=0;i<jobs.length;i++){assert.equal(p[jobs[i]].y,p[jobs[0]].y);assert.equal(p[stores[i]].y,p[stores[0]].y);assert.equal(p[jobs[i]].x,p[stores[i]].x);}
  const broken=r.positions.map(p=>p.id==='thumbnail'?{...p,y:p.y-158}:p);assert.equal(C.autoArrangeBranchesIntact(broken,frames),false,'one aligned edge does not justify breaking its peer row');
  const moved=r.positions.map(p=>({...p,x:p.x+285,y:p.y+158}));assert.equal(C.autoArrangeBranchesIntact(moved,frames),true,'whole-band translations remain possible');
  for(const reverse of [true,false]){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,String(100-i)])),renamed={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.map((e,i)=>({from:names[reverse||i%2?e.to:e.from],to:names[reverse||i%2?e.from:e.to]}))},positions=r.positions.map(p=>({...p,id:names[p.id]})).reverse();
    const found=C.autoArrangeBranchFrames(renamed,positions);assert.ok(found.some(f=>f.bands && f.bands[0].includes(names.thumbnail)),'band recognition is independent of arrows, names and declarations');
  }
});

function junctionFixture(){
  const positions=[['hub',120,100],['a',405,100],['b',405,350],['c',690,350],['d',975,225],['e',975,100]].map(([id,x,y])=>({id,x,y})),edges=[['hub','a'],['hub','b'],['hub','c'],['hub','d'],['d','e']].map(([from,to])=>({from,to})),d={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges},r={positions,edges:edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);return {d,r};
}
test('a central junction can safely swap an occupied neighbor cell independently of arrow direction or names',()=>{
  const {d,r}=junctionFixture(),before=plain({d,r});let expected;
  for(const mode of ['forward','reverse','mixed','renamed']){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,mode==='renamed'?String(100-i):id])),input={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.map((e,i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?e.to:e.from],to:names[reverse?e.from:e.to]};})},seed={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges};seed.score=C.autoArrangeScore(input,seed);
    const after=C.autoArrangeJunctionClarity(input,seed,viz);safe(input,seed,after);
    const actual=r.positions.map(p=>{const q=after.positions.find(q=>q.id===names[p.id]);return {id:p.id,x:q.x,y:q.y};});
    assert.deepEqual(actual.find(p=>p.id==='hub'),{id:'hub',x:405,y:350});assert.deepEqual(actual.find(p=>p.id==='b'),{id:'b',x:120,y:100});
    assert.ok(C.autoArrangeFlowMetrics(input,after).routeLength<C.autoArrangeFlowMetrics(input,seed).routeLength*.9);
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
  }
  assert.deepEqual(plain({d,r}),before);
});

test('junction search retains both crossing ceilings, card safety, protected bands and its separate work caps',()=>{
  const {d,r}=junctionFixture(),score=C.autoArrangeScore,natural=C.autoArrangeNaturalRoutes;
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length']){
    let checks=0,routes=0;try{C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};C.autoArrangeScore=(...args)=>({...score(...args),[key]:['hits','overlaps','crossings','incidentCrossings'].includes(key)?r.score[key]+1:r.score[key]*2});
      assert.equal(C.autoArrangeJunctionClarity(d,r,{renderJSON(...args){routes++;return viz.renderJSON(...args);}}),r,key);
      assert.ok(checks>0);assert.ok(checks-routes<=C.AUTO_ARRANGE_JUNCTION_LIMITS.checks);assert.ok(routes<=C.AUTO_ARRANGE_JUNCTION_LIMITS.routes);
    }finally{C.autoArrangeScore=score;C.autoArrangeNaturalRoutes=natural;}
  }
  const media=diagram('media-platform'),placed=seed(media,'media-platform'),frames=C.autoArrangeBranchFrames(media,placed.positions),after=C.autoArrangeJunctionClarity(media,placed,viz);safe(media,placed,after);assert.ok(C.autoArrangeBranchesIntact(after.positions,frames));
});

test('side links on the second branch stage do not expose the Telemetry store band to isolated moves',()=>{
  const d=diagram('telemetry-fan'),r=seed(d,'telemetry-fan'),frames=C.autoArrangeBranchFrames(d,r.positions);
  assert.ok(frames.some(f=>f.bands && f.bands.some(band=>band.includes('metricdb')&&band.includes('logdb')&&band.includes('tracedb'))));
  const topology=C.autoArrangeFlowTopology(d);assert.equal(topology.adj.metricdb.length,3,'the metrics store has a side link');
  const altered=r.positions.map(p=>p.id==='metricdb'?{...p,y:p.y-125}:p);assert.equal(C.autoArrangeBranchesIntact(altered,frames),false);
  const after=C.autoArrangeLeafClarity(d,C.autoArrangeBlockClarity(d,C.autoArrangeJunctionClarity(d,r,viz),viz),viz);safe(d,r,after);assert.ok(C.autoArrangeBranchesIntact(after.positions,frames));
  const p=Object.fromEntries(after.positions.map(p=>[p.id,p]));assert.equal(p.metricdb.y,p.logdb.y);assert.equal(p.metricdb.y,p.tracedb.y);
});
function blockFixture(){
  const positions=[['a',120,100],['b',975,100],['c',975,225],['d',120,225],['t1',120,975],['t2',120,1100],['t3',120,1225],['t4',120,1350]].map(([id,x,y])=>({id,x,y})),edges=[['a','b'],['b','c'],['c','d'],['d','a'],['d','t1'],['t1','t2'],['t2','t3'],['t3','t4']].map(([from,to])=>({from,to})),d={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges},r={positions,edges:edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);return {d,r};
}
test('weak-cut block docking moves a whole connected group safely and ignores names, declaration order and arrows',()=>{
  const {d,r}=blockFixture(),original=plain({d,r});let expected,expectedBlocks;
  for(const mode of ['forward','reverse','mixed','renamed']){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,mode==='renamed'?String(100-i):id])),input={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.map((e,i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?e.to:e.from],to:names[reverse?e.from:e.to]};}).reverse()},seed={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges};seed.score=C.autoArrangeScore(input,seed);
    const restore=Object.fromEntries(Object.entries(names).map(([a,b])=>[b,a])),blocks=plain(C.autoArrangePlacedBlocks(input,seed.positions)).map(block=>block.map(id=>restore[id]));
    if(expectedBlocks)assert.deepEqual(blocks,expectedBlocks);else expectedBlocks=blocks;
    const after=C.autoArrangeBlockClarity(input,seed,viz);safe(input,seed,after);assert.ok(after.score.area<seed.score.area*.5);assert.ok(after.score.shape<=seed.score.shape);
    const actual=r.positions.map(p=>{const q=after.positions.find(q=>q.id===names[p.id]);return {id:p.id,x:q.x,y:q.y};});
    assert.equal(actual.filter((p,i)=>p.x!==r.positions[i].x || p.y!==r.positions[i].y).length,4,'an entire four-card connected block moves');
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
  }
  assert.deepEqual(plain({d,r}),original);
});
test('connected-block work is bounded and rejects safety, growth and needle-shape regressions',()=>{
  const {d,r}=blockFixture(),score=C.autoArrangeScore,natural=C.autoArrangeNaturalRoutes;
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length','shape']){
    let checks=0,routes=0;try{C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};C.autoArrangeScore=(...args)=>({...score(...args),[key]:['hits','overlaps','crossings','incidentCrossings','shape'].includes(key)?r.score[key]+1:r.score[key]*2});
      assert.equal(C.autoArrangeBlockClarity(d,r,{renderJSON(...args){routes++;return viz.renderJSON(...args);}}),r,key);
      assert.ok(checks>0);assert.ok(checks-routes<=C.AUTO_ARRANGE_BLOCK_LIMITS.checks);assert.ok(routes<=C.AUTO_ARRANGE_BLOCK_LIMITS.routes);
    }finally{C.autoArrangeScore=score;C.autoArrangeNaturalRoutes=natural;}
  }
  const grouped=plain(d);grouped.nodes.a.group='g';assert.equal(C.autoArrangeBlockClarity(grouped,r,{renderJSON(){assert.fail('grouped blocks must bypass search');}}),r);
});

test('publication translates cards, nested groups and exact cubic bounds together without changing viewer paths',()=>{
  for(const grouped of [false,true]){
    const positions=[['a',1200,1000],['b',1200,1300],['c',1200,1150],['d',1500,1500],['e',1800,1500]].map(([id,x,y])=>({id,x,y})),nodes=Object.fromEntries(positions.map(p=>[p.id,{title:p.id}]));
    if(grouped){nodes.a.group='inner';nodes.b.group='inner';nodes.c.group='inner';}
    const d={nodes,edges:[{from:'a',to:'b',label:'Automatic avoidance'},{from:'a',to:'d',label:'Native curve'},{from:'d',to:'e'},{from:'e',to:'e'}],groups:grouped?{outer:{title:'Outer'},inner:{title:'Inner',parent:'outer'}}:{}};
    const r={positions,edges:[{},{curveControls:[{t:1/3,dx:-550,dy:-500},{t:2/3,dx:-550,dy:-500}],labelDx:18,labelDy:-3},{},{}]};r.score=C.autoArrangeScore(d,r);const original=plain({d,r});
    function rendered(result){const out=C.autoArrangeDiagram(d,result),L=C.layout(out),adjust=C.autoArrangeAdjust(out,L),paths=out.edges.map((e,i)=>plain(C.samplePathD(C.edgePath(e,L,adjust[i]))));C.expandPlacedEdgeBounds(out.edges,L,adjust);return {out,L,paths,adjust};}
    const before=rendered(r),published=C.autoArrangePublish(d,r),after=rendered(published),bounds=C.autoArrangeOccupiedBounds(d,published),dx=published.positions[0].x-r.positions[0].x,dy=published.positions[0].y-r.positions[0].y;
    assert.ok(Math.abs(bounds.x-45)<1e-6);assert.ok(Math.abs(bounds.y-78)<1e-6);assert.ok(after.L.vb.w<before.L.vb.w-1,'origin padding shrinks, subject to the viewer minimum canvas width');assert.ok(after.L.vb.h<before.L.vb.h-500);
    assert.ok(before.adjust[0].avoidMx || before.adjust[0].avoidMy,'the fixture exercises an actual automatic avoidance bow');
    assert.deepEqual(plain(published.edges),r.edges,'relative native controls and label offsets are not translated twice');
    published.positions.forEach((p,i)=>{assert.ok(Math.abs(p.x-r.positions[i].x-dx)<1e-6);assert.ok(Math.abs(p.y-r.positions[i].y-dy)<1e-6);});
    before.paths.forEach((path,i)=>path.forEach((p,j)=>{assert.ok(Math.abs(after.paths[i][j].x-p.x-dx)<1e-6,'automatic and cubic paths translate rigidly');assert.ok(Math.abs(after.paths[i][j].y-p.y-dy)<1e-6);}));
    for(const id of Object.keys(before.L.groups)){assert.ok(Math.abs(after.L.groups[id].x-before.L.groups[id].x-dx)<1e-6);assert.ok(Math.abs(after.L.groups[id].y-before.L.groups[id].y-dy)<1e-6);}
    for(const key of Object.keys(r.score))assert.ok(Math.abs(published.score[key]-r.score[key])<1e-6,key+' is translation invariant');
    assert.deepEqual(plain(published.score),plain(C.autoArrangeScore(d,published)));assert.equal(C.autoArrangePublish(d,published),published,'publication is idempotent');assert.deepEqual(plain({d,r}),original);
  }
});

test('directed snake early return also publishes near-origin geometry without changing its two-row shape',()=>{
  const d={nodes:Object.fromEntries(Array.from({length:6},(_,i)=>['n'+i,{}])),edges:Array.from({length:5},(_,i)=>({from:'n'+i,to:'n'+(i+1)}))};
  const result=C.autoArrangeCandidates(d,viz,null),bounds=C.autoArrangeOccupiedBounds(d,result);
  assert.ok(Math.abs(bounds.x-45)<1e-6);assert.ok(Math.abs(bounds.y-78)<1e-6);assert.equal(new Set(result.positions.map(p=>p.x)).size,3);assert.equal(new Set(result.positions.map(p=>p.y)).size,2);
  assert.equal(result.score.overlaps,0);assert.equal(result.score.hits,0);assert.deepEqual(plain(result.score),plain(C.autoArrangeScore(d,result)));
});

function soleLeafFixture(){
  const positions=[['a',120,100],['b',690,100],['c',690,252],['d',120,252],['leaf',975,500]].map(([id,x,y])=>({id,x,y})),edges=[['a','b'],['b','c'],['c','d'],['d','a'],['b','leaf']].map(([from,to])=>({from,to})),d={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges},r={positions,edges:edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);return {d,r};
}
test('final own-hub adjacency completes remote Equipment leaves after block movement',()=>{
  const d=diagram('equipment-lending'),r=seed(d,'equipment-lending-post-block'),before=plain(r),after=C.autoArrangeLeafClarity(d,r,viz);safe(d,r,after);
  const p=Object.fromEntries(after.positions.map(p=>[p.id,p])),hub=p['lend-gateway'];
  assert.deepEqual(plain(p['lend-request-app']),{id:'lend-request-app',x:hub.x-285,y:hub.y});
  assert.deepEqual(plain(p['lend-partner']),{id:'lend-partner',x:hub.x,y:hub.y+152});
  for(const old of r.positions.filter(p=>!['lend-request-app','lend-partner'].includes(p.id)))assert.deepEqual(plain(p[old.id]),old);
  assert.ok(C.autoArrangeFlowMetrics(d,after).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength*.86);assert.deepEqual(plain(r),before);
  assert.deepEqual(plain(C.autoArrangeLeafClarity(d,after,viz)),plain(after),'completion settles without moving the central composition');
});

test('sole leaves reach their hub without siblings, independently of arrows and integer-like declarations',()=>{
  const {d,r}=soleLeafFixture();let expected;
  assert.deepEqual(Array.from(C.autoArrangeFlowTopology(d).adj.b.filter(id=>C.autoArrangeFlowTopology(d).adj[id].length===1)),['leaf']);
  for(const mode of ['forward','reverse','mixed','renamed']){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,mode==='renamed'?String(100-i):id])),input={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.map((e,i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?e.to:e.from],to:names[reverse?e.from:e.to]};})},placed={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges};placed.score=C.autoArrangeScore(input,placed);
    const after=C.autoArrangeLeafClarity(input,placed,viz);safe(input,placed,after);assert.notEqual(after,placed);
    const actual=r.positions.map(p=>{const q=after.positions.find(q=>q.id===names[p.id]);return {id:p.id,x:q.x,y:q.y};});
    const leaf=actual.find(p=>p.id==='leaf'),hub=actual.find(p=>p.id==='b');assert.ok(leaf.x===hub.x && Math.abs(leaf.y-hub.y)===152 || leaf.y===hub.y && Math.abs(leaf.x-hub.x)===285,'the sole leaf reaches a direct cardinal slot');
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
  }
});

test('final leaf completion fairly visits more than sixteen leaf queues and keeps safety/work caps',()=>{
  const positions=[],edges=[];for(let i=0;i<21;i++){positions.push({id:'hub'+i,x:120+800*i,y:500},{id:'leaf'+i,x:405+800*i,y:100});edges.push({from:'hub'+i,to:'leaf'+i});if(i)edges.push({from:'hub'+(i-1),to:'hub'+i});}
  const d={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges},r={positions,edges:edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);
  const natural=C.autoArrangeNaturalRoutes,score=C.autoArrangeScore,reroute=C.autoArrangeRerouteAffected,visited=[];let repairs=0;
  try{
    C.autoArrangeNaturalRoutes=(d,c,...rest)=>{visited.push(c.positions.find((p,i)=>p.x!==r.positions[i].x||p.y!==r.positions[i].y).id);return natural(d,c,...rest);};
    C.autoArrangeScore=(...args)=>({...score(...args),hits:1});C.autoArrangeRerouteAffected=()=>{repairs++;return {...r,score:{...r.score,hits:1}};};
    assert.equal(C.autoArrangeLeafClarity(d,r,viz),r);
    assert.equal(new Set(visited.slice(0,21)).size,21,'every leaf receives a first path check before second choices');
    assert.ok(visited.length<=C.AUTO_ARRANGE_LEAF_LIMITS.checks);assert.ok(repairs<=C.AUTO_ARRANGE_LEAF_LIMITS.routes);
  }finally{C.autoArrangeNaturalRoutes=natural;C.autoArrangeScore=score;C.autoArrangeRerouteAffected=reroute;}
  const fixture=soleLeafFixture();for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length'])try{
    C.autoArrangeScore=(...args)=>({...score(...args),[key]:['hits','overlaps','crossings','incidentCrossings'].includes(key)?fixture.r.score[key]+1:fixture.r.score[key]*2});
    assert.equal(C.autoArrangeLeafClarity(fixture.d,fixture.r,viz),fixture.r,key);
  }finally{C.autoArrangeScore=score;}
});

test('clean-block grid is explicit and ordinary clear layouts still bypass the search',()=>{
  const {d,r}=soleLeafFixture();assert.equal(r.score.crossings,0);assert.equal(r.edges.some(e=>C.hasCubicCurve(e)),false);
  assert.deepEqual(Array.from(C.autoArrangeGridPositions(d,r,false)),[]);
  const candidates=C.autoArrangeGridPositions(d,r,false,{cleanBlock:true});assert.ok(candidates.length>0);assert.ok(candidates.length<=C.AUTO_ARRANGE_GRID_LIMITS.finalists);
  const grouped=plain(d);grouped.nodes.a.group='g';assert.deepEqual(Array.from(C.autoArrangeGridPositions(grouped,r,false,{cleanBlock:true})),[]);
});

test('small-block grid reshapes the Equipment fulfillment interior with unchanged intake and full route safety',()=>{
  const d=diagram('equipment-lending'),r=C.autoArrangeLeafClarity(d,seed(d,'equipment-lending-post-block'),viz),original=plain(r),after=C.autoArrangeBlockGrid(d,r,viz);safe(d,r,after);
  assert.notEqual(after,r);assert.ok(after.score.area<r.score.area*.8);assert.ok(C.autoArrangeFlowMetrics(d,after).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength*.94);assert.ok(C.autoArrangeFlowMetrics(d,after).blocked<C.autoArrangeFlowMetrics(d,r).blocked);
  const before=Object.fromEntries(r.positions.map(p=>[p.id,p])),p=Object.fromEntries(after.positions.map(p=>[p.id,p]));
  for(const id of ['lend-request-app','lend-desk','lend-partner','lend-gateway','lend-identity','lend-registry','lend-eligibility','lend-inventory','lend-availability'])assert.deepEqual(plain(p[id]),plain(before[id]));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);assert.notEqual(distance(p['lend-reservation'],p['lend-pick']),distance(before['lend-reservation'],before['lend-pick']),'internal relationships change; this is not a rigid redocking');
  assert.deepEqual(plain(r),original);
  const blockGrid=C.autoArrangeBlockGrid;let invoked=0,published;try{C.autoArrangeBlockGrid=(...args)=>{invoked++;return blockGrid(...args);};published=C.autoArrangeCandidates(d,viz,require('../src/workbench/vendor/webcola-3.4.0.js'));}finally{C.autoArrangeBlockGrid=blockGrid;}
  assert.equal(invoked,1);assert.ok(published.score.area<r.score.area*.8);assert.equal(published.score.crossings,0);assert.equal(published.score.incidentCrossings,0);
  const publishedPoints=Object.fromEntries(published.positions.map(p=>[p.id,p]));assert.equal(publishedPoints['lend-identity'].y-publishedPoints['lend-registry'].y,152,'the full pipeline applies final straight-leaf tightening after block repacking');
  for(const mode of ['reverse','mixed','renamed']){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,mode==='renamed'?String(100-i):id])),input={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.slice().reverse().map((e,i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?e.to:e.from],to:names[reverse?e.from:e.to]};})},placed={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges.map(()=>({}))};placed.score=C.autoArrangeScore(input,placed);
    const output=C.autoArrangeBlockGrid(input,placed,viz);safe(input,placed,output);
    const actual=Object.fromEntries(output.positions.map(p=>[p.id,p]));for(const id of Object.keys(d.nodes)){assert.ok(Math.abs(actual[names[id]].x-p[id].x)<.001,id+' x '+mode);assert.ok(Math.abs(actual[names[id]].y-p[id].y)<.001,id+' y '+mode);}
  }
});

test('block-grid search bounds grid calls, path checks and repairs and rejects unsafe results',()=>{
  const d=diagram('equipment-lending'),r=C.autoArrangeLeafClarity(d,seed(d,'equipment-lending-post-block'),viz),grid=C.autoArrangeGridPositions,natural=C.autoArrangeNaturalRoutes,score=C.autoArrangeScore,repair=C.autoArrangeRerouteAffected;let grids=0,checks=0,repairs=0;const cache=[];
  try{
    C.autoArrangeGridPositions=(...args)=>{grids++;assert.ok(Object.keys(args[0].nodes).length<=12);assert.equal(args[3].cleanBlock,true);assert.deepEqual(plain(args[1].score),plain(score(args[0],args[1])),'the grid receives a real geometry score');const value=grid(...args);cache.push(value);return value;};
    C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};C.autoArrangeRerouteAffected=(...args)=>{repairs++;return repair(...args);};
    assert.notEqual(C.autoArrangeBlockGrid(d,r,viz),r);assert.ok(grids<=C.AUTO_ARRANGE_BLOCK_GRID_LIMITS.blocks);assert.ok(checks-repairs<=C.AUTO_ARRANGE_BLOCK_GRID_LIMITS.checks);assert.ok(repairs<=C.AUTO_ARRANGE_BLOCK_GRID_LIMITS.routes);
  }finally{C.autoArrangeGridPositions=grid;C.autoArrangeNaturalRoutes=natural;C.autoArrangeRerouteAffected=repair;}
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length','shape']){
    let index=0;try{C.autoArrangeGridPositions=()=>cache[index++];C.autoArrangeScore=(...args)=>({...score(...args),[key]:['hits','overlaps','crossings','incidentCrossings','shape'].includes(key)?r.score[key]+1:r.score[key]*2});assert.equal(C.autoArrangeBlockGrid(d,r,viz),r,key);}finally{C.autoArrangeGridPositions=grid;C.autoArrangeScore=score;}
  }
  for(const id of ['approval-diamond','telemetry-fan','media-platform']){
    const input=diagram(id),placed=seed(input,id==='approval-diamond'?'approval-diamond-accepted':id),frames=C.autoArrangeBranchFrames(input,placed.positions),output=C.autoArrangeBlockGrid(input,placed,viz);safe(input,placed,output);assert.ok(C.autoArrangeBranchesIntact(output.positions,frames),id);
  }
});

test('block-grid excludes strong frame members before grid search, retaining the accepted branch identities',()=>{
  const grid=C.autoArrangeGridPositions;
  for(const id of ['approval-diamond','telemetry-fan','media-platform']){
    const d=diagram(id),r=seed(d,id==='approval-diamond'?'approval-diamond-accepted':id),frames=C.autoArrangeBranchFrames(d,r.positions),protectedIds=new Set(frames.flatMap(f=>f.bands?Array.from(f.bands).flatMap(b=>Array.from(b)):Array.from(f.branches).concat(Array.from(f.ends))));
    assert.ok(protectedIds.size>0);let calls=0;
    try{C.autoArrangeGridPositions=(...args)=>{calls++;return grid(...args);};const a=C.autoArrangeBlockGrid(d,r,viz);safe(d,r,a);for(const old of r.positions.filter(p=>protectedIds.has(p.id)))assert.deepEqual(plain(a.positions.find(p=>p.id===old.id)),old);if(id==='approval-diamond'){assert.equal(calls,0);assert.equal(a,r);}}
    finally{C.autoArrangeGridPositions=grid;}
  }
});

test('final tightening shortens only an already-straight remote leaf toward its neighbor on the same side',()=>{
  const d=diagram('equipment-lending'),r=seed(d,'equipment-lending-repacked');let expected;
  for(const mode of ['forward','reverse','mixed','renamed']){
    const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,mode==='renamed'?String(100-i):id])),input={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.map((e,i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?e.to:e.from],to:names[reverse?e.from:e.to]};})},placed={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges.map(()=>({}))};placed.score=C.autoArrangeScore(input,placed);
    const a=C.autoArrangeLeafTighten(input,placed,viz);safe(input,placed,a);const actual=r.positions.map(p=>{const q=a.positions.find(q=>q.id===names[p.id]);return {id:p.id,x:q.x,y:q.y};}),points=Object.fromEntries(actual.map(p=>[p.id,p]));
    assert.equal(points['lend-registry'].x,points['lend-identity'].x);assert.equal(points['lend-registry'].y,points['lend-identity'].y-152);
    for(const old of r.positions.filter(p=>p.id!=='lend-registry'))assert.deepEqual(points[old.id],old);
    assert.ok(C.autoArrangeFlowMetrics(input,a).routeLength<=C.autoArrangeFlowMetrics(input,placed).routeLength-143.9);assert.ok(a.score.area<placed.score.area*.85);
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
    assert.equal(C.autoArrangeLeafTighten(input,a,viz),a,'adjacent leaves are not squeezed further');
  }
  const sole=soleLeafFixture();assert.equal(C.autoArrangeLeafTighten(sole.d,sole.r,viz),sole.r,'diagonal leaves are outside tightening eligibility');
  for(const id of ['approval-diamond','telemetry-fan']){const input=diagram(id),placed=seed(input,id==='approval-diamond'?'approval-diamond-accepted':id);assert.equal(C.autoArrangeLeafTighten(input,placed,viz),placed,'accepted '+id+' is unchanged');}
});

test('straight-leaf tightening retains safety, footprint and structural ceilings with bounded work',()=>{
  const d=diagram('equipment-lending'),r=seed(d,'equipment-lending-repacked'),natural=C.autoArrangeNaturalRoutes,score=C.autoArrangeScore,flow=C.autoArrangeFlowMetrics;let checks=0,routes=0;
  try{C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};C.autoArrangeLeafTighten(d,r,{renderJSON(...args){routes++;return viz.renderJSON(...args);}});assert.ok(checks-routes<=C.AUTO_ARRANGE_LEAF_TIGHTEN_LIMITS.checks);assert.ok(routes<=C.AUTO_ARRANGE_LEAF_TIGHTEN_LIMITS.routes);}finally{C.autoArrangeNaturalRoutes=natural;}
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area'])try{C.autoArrangeScore=(...args)=>({...score(...args),[key]:r.score[key]+1});assert.equal(C.autoArrangeLeafTighten(d,r,viz),r,key);}finally{C.autoArrangeScore=score;}
  for(const key of ['turns','diagonal','fanRows','sparseRows','blocked','routeLength'])try{C.autoArrangeFlowMetrics=(diagram,candidate,...rest)=>{const m=flow(diagram,candidate,...rest);return candidate===r?m:{...m,[key]:flow(d,r)[key]+1};};assert.equal(C.autoArrangeLeafTighten(d,r,viz),r,key);}finally{C.autoArrangeFlowMetrics=flow;}
});

test('inline connector proposals put Research Instrument gateway between its same-row neighbors',()=>{
  const d=diagram('research-compute-federation'),r=seed(d,'research-compute-federation-accepted'),a=C.autoArrangeNeighborhoodClarity(d,r,viz);safe(d,r,a);
  const p=Object.fromEntries(a.positions.map(p=>[p.id,p]));assert.equal(p['compute-instrument'].y,p['compute-legacy'].y);assert.equal(p['compute-instrument'].y,p['compute-staging'].y);assert.equal(p['compute-instrument'].x,(p['compute-legacy'].x+p['compute-staging'].x)/2,'equivalent straight routes prefer balanced spacing');
  assert.equal(C.autoArrangeFlowMetrics(d,a).diagonal,C.autoArrangeFlowMetrics(d,r).diagonal-2);assert.ok(C.autoArrangeFlowMetrics(d,a).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength-243);
  for(const old of r.positions.filter(p=>p.id!=='compute-instrument'))assert.deepEqual(plain(a.positions.find(p=>p.id===old.id)),old);
});

test('inline row and column connectors keep midpoint preference across arrows and declarations',()=>{
  const original=[['a',120,400],['b',1260,400],['connector',690,100],['other',1260,100],['leaf',1545,100],['anchorA',120,700],['anchorB',1260,700]].map(([id,x,y])=>({id,x,y})),links=[['a','connector'],['connector','b'],['b','other'],['other','a'],['other','leaf'],['a','anchorA'],['b','anchorB']];
  for(const axis of ['row','column'])for(const mode of ['forward','reverse','mixed','renamed']){
    const names=Object.fromEntries(original.map((p,i)=>[p.id,mode==='renamed'?String(100-i):p.id])),positions=original.map(p=>({id:names[p.id],x:axis==='row'?p.x:p.y*2,y:axis==='row'?p.y:p.x})).reverse(),edges=links.map(([a,b],i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?b:a],to:names[reverse?a:b]};}),d={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges},r={positions,edges:edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);
    const after=C.autoArrangeNeighborhoodClarity(d,r,viz);safe(d,r,after);const p=Object.fromEntries(after.positions.map(p=>[p.id,p])),a=p[names.a],b=p[names.b],connector=p[names.connector];assert.ok(Math.abs(connector.x-(a.x+b.x)/2)<.001);assert.ok(Math.abs(connector.y-(a.y+b.y)/2)<.001);
  }
});

test('three-boundary spatial paths coordinate the Freight right side with actual safety and bounded routing',()=>{
  const d=diagram('freight-operations'),r=seed(d,'freight-operations-accepted'),before=plain(r),members=['customer-updates','webhook-dispatch','analytics-feed'],groups=plain(C.autoArrangeSpatialPaths(d,r.positions));assert.ok(groups.some(group=>group.length===members.length&&members.every(id=>group.includes(id))));
  let routes=0,checks=0;const natural=C.autoArrangeNaturalRoutes;let a;
  try{C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};a=C.autoArrangeSpatialClarity(d,r,{renderJSON(...args){routes++;return viz.renderJSON(...args);}});}finally{C.autoArrangeNaturalRoutes=natural;}
  safe(d,r,a);assert.ok(a.score.area<r.score.area*.87);assert.ok(C.autoArrangeFlowMetrics(d,a).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength-670);assert.ok(routes<=C.AUTO_ARRANGE_SPATIAL_LIMITS.routes);assert.ok(checks-routes<=C.AUTO_ARRANGE_SPATIAL_LIMITS.checks);
  const points=Object.fromEntries(a.positions.map(p=>[p.id,p]));for(const old of r.positions){if(members.includes(old.id)){assert.equal(points[old.id].x,old.x);assert.ok(Math.abs(points[old.id].y-old.y+269.2)<.001);}else assert.deepEqual(plain(points[old.id]),old);}assert.deepEqual(plain(r),before);
  const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,String(100-i)])),input={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{}])),edges:d.edges.slice().reverse().map(e=>({...e,from:names[e.from],to:names[e.to]}))},placed={positions:r.positions.map(p=>({...p,id:names[p.id]})).reverse(),edges:r.edges.slice().reverse().map(({from,to,...route})=>route)};placed.score=C.autoArrangeScore(input,placed);const renamed=C.autoArrangeSpatialClarity(input,placed,viz);safe(input,placed,renamed);for(const p of a.positions){const q=renamed.positions.find(q=>q.id===names[p.id]);assert.ok(Math.abs(p.x-q.x)<.001);assert.ok(Math.abs(p.y-q.y)<.001);}
});

test('spatial discovery recognizes topology-varied paths without depending on identifiers or arrow direction',()=>{
  for(const count of [3,4])for(const mode of ['forward','reverse','mixed','renamed']){
    const nodes=[{id:'hubA',x:900,y:100},{id:'hubB',x:900,y:400},{id:'hubC',x:900,y:1000},{id:'coreA',x:330,y:400},{id:'coreB',x:330,y:1000}].concat(Array.from({length:count},(_,i)=>({id:'path'+i,x:1200,y:550+i*150}))),links=[['coreA','hubA'],['coreA','hubB'],['coreA','coreB'],['coreB','hubC'],['hubA','hubB'],['hubA','hubC'],['hubB','hubC'],['hubB','path0'],['hubA','path'+(count-1)],['hubC','path'+(count-1)]].concat(Array.from({length:count-1},(_,i)=>['path'+i,'path'+(i+1)])),names=Object.fromEntries(nodes.map((p,i)=>[p.id,mode==='renamed'?String(100-i):p.id])),positions=nodes.map(p=>({...p,id:names[p.id]})).reverse(),d={nodes:Object.fromEntries(positions.map(p=>[p.id,{}])),edges:links.map(([a,b],i)=>{const reverse=mode==='reverse'||mode==='mixed'&&i%2;return {from:names[reverse?b:a],to:names[reverse?a:b]};})},groups=plain(C.autoArrangeSpatialPaths(d,positions)),wanted=Array.from({length:count},(_,i)=>names['path'+i]);assert.ok(groups.some(group=>group.length===count&&wanted.every(id=>group.includes(id))));assert.ok(groups.length<=C.AUTO_ARRANGE_SPATIAL_LIMITS.groups);
  }
});

test('public pipeline emits the Research inline fix and bounded Freight right-side movement',()=>{
  const cola=require('../src/workbench/vendor/webcola-3.4.0.js');
  for(const id of ['research-compute-federation','freight-operations']){
    const d=diagram(id),before=seed(d,id+'-accepted'),a=C.autoArrangeCandidates(d,viz,cola);safe(d,before,a);const p=Object.fromEntries(a.positions.map(p=>[p.id,p]));
    if(id==='research-compute-federation'){assert.equal(p['compute-instrument'].y,p['compute-legacy'].y);assert.equal(p['compute-instrument'].y,p['compute-staging'].y);assert.ok(C.autoArrangeFlowMetrics(d,a).routeLength<C.autoArrangeFlowMetrics(d,before).routeLength-240);}
    else{assert.ok(a.score.height<before.score.height-268);assert.ok(C.autoArrangeFlowMetrics(d,a).routeLength<C.autoArrangeFlowMetrics(d,before).routeLength-670);assert.equal(p['analytics-feed'].y,p['billing-trigger'].y);}
  }
});

test('spatial docking retains both crossing ceilings and rejects card, shape and growth regressions',()=>{
  const d=diagram('freight-operations'),r=seed(d,'freight-operations-accepted'),score=C.autoArrangeScore;
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length','shape'])try{
    C.autoArrangeScore=(...args)=>({...score(...args),[key]:['hits','overlaps','crossings','incidentCrossings','shape'].includes(key)?r.score[key]+1:r.score[key]*2});assert.equal(C.autoArrangeSpatialClarity(d,r,viz),r,key);
  }finally{C.autoArrangeScore=score;}
  const grouped=plain(d);grouped.nodes[Object.keys(grouped.nodes)[0]].group='g';assert.equal(C.autoArrangeSpatialClarity(grouped,r,{renderJSON(){assert.fail('grouped diagrams bypass spatial docking');}}),r);
});
