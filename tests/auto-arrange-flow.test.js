'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const C={URL};vm.runInNewContext(require('../tools/source-loader.cjs').entrypoint('workbench').body,C);
const plain=value=>JSON.parse(JSON.stringify(value));let viz;
test.before(async()=>{viz=await require('../src/workbench/vendor/viz-3.31.0.js').instance();});
function fixture(){
  const d={nodes:Object.fromEntries(['a','b','join','leaf','infra','legacy'].map(id=>[id,{title:id}])),edges:[['a','b'],['b','join'],['leaf','join'],['infra','join'],['infra','legacy']].map(([from,to])=>({from,to,label:from+' to '+to})),steps:[{id:'start',edge:'a->b',text:'Keep'}],paths:[{id:'path',steps:['start']}],panels:[{id:'panel',type:'deviceapp'}]};
  const r={positions:[['join',690,100],['b',690,350],['a',405,350],['leaf',405,100],['infra',690,225],['legacy',690,600]].map(([id,x,y])=>({id,x,y})),edges:d.edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);return {d,r};
}
function gap(r){let value=Infinity;r.positions.forEach((a,i)=>r.positions.slice(i+1).forEach(b=>value=Math.min(value,Math.hypot(Math.max(0,Math.abs(a.x-b.x)-150),Math.max(0,Math.abs(a.y-b.y)-44)))));return value;}
function safe(d,b,a){assert.equal(a.score.overlaps,0);assert.equal(a.score.hits,0);for(const k of ['crossings','incidentCrossings'])assert.ok(a.score[k]<=b.score[k],k);for(const k of ['width','height','length'])assert.ok(a.score[k]<=b.score[k]*1.3,k);assert.ok(a.score.area<=b.score.area*1.35);assert.ok(gap(a)>=gap(b)-.1);assert.ok(C.autoArrangeFlowMetrics(d,a).routeLength<=C.autoArrangeFlowMetrics(d,b).routeLength*1.25);assert.deepEqual(plain(a.score),plain(C.autoArrangeScore(d,a)));}
function semantics(d,r){const out=plain(C.autoArrangeDiagram(d,r));for(const k of ['nodes','steps','paths','panels'])assert.deepEqual(out[k],d[k]);assert.deepEqual(out.edges.map(({from,to,label})=>({from,to,label})),d.edges.map(({from,to,label})=>({from,to,label})));assert.deepEqual(plain(C.validate(C.normalize(out)).errors),[]);}

test('terminal-chain rotation clears an obstructed corridor using real paths and preserves content deterministically',()=>{
  const {d,r}=fixture(),unchanged=plain({d,r}),after=C.autoArrangeFlowClarity(d,r,viz),beforeMetric=C.autoArrangeFlowMetrics(d,r),afterMetric=C.autoArrangeFlowMetrics(d,after);
  assert.notEqual(after,r);safe(d,r,after);semantics(d,after);assert.ok(afterMetric.blocked<beforeMetric.blocked);assert.ok(afterMetric.routeExcess<beforeMetric.routeExcess);assert.ok(afterMetric.routeLength<beforeMetric.routeLength);
  assert.ok(beforeMetric.routeExcess>0,'automatic avoidance bows count even without authored curve controls');
  assert.deepEqual(plain({d,r}),unchanged);assert.deepEqual(plain(C.autoArrangeFlowClarity(d,r,viz)),plain(after));
  const names=Object.fromEntries(Object.keys(d.nodes).map((id,i)=>[id,i?'renamed-'+i:'__proto__']));
  const renamed={nodes:Object.fromEntries(Object.keys(d.nodes).reverse().map(id=>[names[id],{title:'Unrelated'}])),edges:d.edges.map(e=>({...e,from:names[e.from],to:names[e.to]}))};
  const seed={...r,positions:r.positions.map(p=>({...p,id:names[p.id]}))},other=C.autoArrangeFlowClarity(renamed,seed,viz);
  safe(renamed,seed,other);assert.ok(C.autoArrangeFlowMetrics(renamed,other).blocked<beforeMetric.blocked,'relabeling and declaration reordering retain the structural improvement');
});

test('flow search cannot spend safety or growth budgets and has bounded expensive work',()=>{
  const {d,r}=fixture(),score=C.autoArrangeScore,natural=C.autoArrangeNaturalRoutes;
  for(const key of ['hits','overlaps','crossings','incidentCrossings','width','height','area','length']){
    let checks=0,routes=0;
    try{C.autoArrangeScore=(diagram,candidate)=>({...score(diagram,candidate),[key]:['hits','overlaps','crossings','incidentCrossings'].includes(key)?r.score[key]+1:r.score[key]*2});C.autoArrangeNaturalRoutes=(...args)=>{checks++;return natural(...args);};
      assert.equal(C.autoArrangeFlowClarity(d,r,{renderJSON(...args){routes++;return viz.renderJSON(...args);}}),r,key);
      assert.ok(checks>0);assert.ok(checks<=C.AUTO_ARRANGE_FLOW_LIMITS.checks+C.AUTO_ARRANGE_FLOW_LIMITS.routes);assert.ok(routes<=C.AUTO_ARRANGE_FLOW_LIMITS.routes);
    }finally{C.autoArrangeScore=score;C.autoArrangeNaturalRoutes=natural;}
  }
  const metrics=C.autoArrangeFlowMetrics;let calls=0;
  try{C.autoArrangeFlowMetrics=(...args)=>{const m=metrics(...args);if(calls++)m.routeLength*=10;return m;};assert.equal(C.autoArrangeFlowClarity(d,r,viz),r,'actual routed-length growth is bounded');}finally{C.autoArrangeFlowMetrics=metrics;}
});

test('self/parallel edges and disconnected cards keep all identities and actual final score',()=>{
  const {d,r}=fixture();d.nodes.isolated={title:'Disconnected'};r.positions.push({id:'isolated',x:120,y:100});
  d.edges.push({from:'a',to:'a',label:'Self'},{from:'a',to:'b',label:'Parallel'});r.edges=d.edges.map(()=>({}));r.score=C.autoArrangeScore(d,r);
  const topology=C.autoArrangeFlowTopology(d);assert.equal(topology.adj.a.length,1,'self/parallel connections do not invent new neighbors');
  const after=C.autoArrangeFlowClarity(d,r,viz);if(after!==r)safe(d,r,after);semantics(d,after);assert.equal(after.positions.length,7);
});

test('49 nodes, 81 edges, grouped graphs and plain chains bypass optional flow search',()=>{
  const cases=[];let f=fixture();while(Object.keys(f.d.nodes).length<49)f.d.nodes['extra'+Object.keys(f.d.nodes).length]={};cases.push(f);
  f=fixture();f.d.edges=Array.from({length:81},(_,i)=>f.d.edges[i%5]);cases.push(f);
  f=fixture();f.d.nodes.a.group='g';cases.push(f);
  f=fixture();f.d.edges=['a','b','join','leaf','infra','legacy'].slice(1).map((to,i)=>({from:['a','b','join','leaf','infra'][i],to}));cases.push(f);
  const metrics=C.autoArrangeFlowMetrics;try{C.autoArrangeFlowMetrics=()=>assert.fail('bypass must avoid geometry work');for(const {d,r} of cases)assert.equal(C.autoArrangeFlowClarity(d,r,{renderJSON(){assert.fail('bypass must not route');}}),r);}finally{C.autoArrangeFlowMetrics=metrics;}
});

test('generated research routes improve safely; a compact cardinal tail is not unfolded for longer routes',()=>{
  // Automatic PR457 outputs from d18761273437cd533a4dbffe3f834e27bbd7350b,
  // frozen before this pass; these are regression seeds, not human preference labels.
  const seeds=require('./fixtures/auto-arrange-flow-seeds.json');
  for(const [file,id] of [['./fixtures/auto-arrange-training/round2-input.spec.json','research-compute-federation'],['../examples/auto-arrange-baselines/graph-input.spec.json','approval-diamond']]){
    const d=require(file).page.blocks.find(b=>b.id===id).diagram,r=plain(seeds[id]);r.score=C.autoArrangeScore(d,r);const after=C.autoArrangeFlowClarity(d,r,viz);safe(d,r,after);semantics(d,after);
    if(id==='approval-diamond')assert.equal(after,r,'straightening the tail does not justify longer total routes');
    else {assert.notEqual(after,r);assert.ok(C.autoArrangeFlowMetrics(d,after).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength);assert.ok(C.autoArrangeFlowMetrics(d,after).diagonal<=C.autoArrangeFlowMetrics(d,r).diagonal);}
  }
});

test('multiple competing chains receive declaration-independent geometry under the shared check budget',()=>{
  const d={nodes:{},edges:[]},r={positions:[],edges:[]};
  for(let i=0;i<6;i++){
    const f=fixture(),name=id=>'component-'+i+'-'+id;
    for(const [id,node] of Object.entries(f.d.nodes))d.nodes[name(id)]={...node};
    d.edges.push(...f.d.edges.map(e=>({...e,from:name(e.from),to:name(e.to)})));
    r.positions.push(...f.r.positions.map(p=>({...p,id:name(p.id),x:p.x+1140*i})));
  }
  r.edges=d.edges.map(()=>({}));r.score=C.autoArrangeScore(d,r);
  assert.equal(C.autoArrangeFlowTopology(d).chains.length,12,'enough competing chains to saturate the bounded search');
  const schedule=C.autoArrangeFlowSchedule,snapshots=[];let after;
  try{C.autoArrangeFlowSchedule=(queues,limit)=>{const selected=schedule(queues,limit);snapshots.push({sizes:queues.map(q=>q.length),limit,owners:selected.map(p=>queues.findIndex(q=>q.includes(p)))});return selected;};after=C.autoArrangeFlowClarity(d,r,viz);}finally{C.autoArrangeFlowSchedule=schedule;}
  safe(d,r,after);assert.notEqual(after,r);
  const first=snapshots[0],eligible=first.sizes.map((size,i)=>size?i:-1).filter(i=>i>=0);
  assert.ok(first.sizes.reduce((a,b)=>a+b,0)>C.AUTO_ARRANGE_FLOW_LIMITS.checks,'the regression exhausts the real budget');
  assert.equal(first.owners.length,Math.ceil(C.AUTO_ARRANGE_FLOW_LIMITS.checks/4));
  assert.deepEqual(first.owners.slice(0,eligible.length),eligible.slice(0,first.owners.length),'each checked motif gets a check before any gets a second');
  const original=Object.keys(d.nodes);
  for(const numeric of [false,true]){
  const names=Object.fromEntries(original.map((id,i)=>[id,numeric?String(original.length-i):'renamed-'+(original.length-i)]));
  const renamed={nodes:Object.fromEntries(original.slice().reverse().map(id=>[names[id],{title:'Different'}])),edges:d.edges.map(e=>({...e,from:names[e.from],to:names[e.to]}))};
  const seed={...r,positions:r.positions.map(p=>({...p,id:names[p.id]}))};if(numeric)seed.positions.reverse();
  const other=C.autoArrangeFlowClarity(renamed,seed,viz);safe(renamed,seed,other);
  const restore=Object.fromEntries(original.map(id=>[names[id],id]));
  const byOriginal=(a,b)=>original.indexOf(a.id)-original.indexOf(b.id);
  const restored=plain(other.positions.map(p=>({...p,id:restore[p.id]})));
  assert.deepEqual(restored.sort(byOriginal),plain(after.positions).sort(byOriginal));
  assert.deepEqual(plain(other.edges),plain(after.edges),'mapped routing is also independent of declarations and names');
  }
});

test('leaf-pair joins, forks and mixed arrows use the same horizontal run and reject an unrelated blocker',()=>{
  const nodes={left:{},right:{},hub:{},core:{},tail:{}},links=[['left','hub'],['right','hub'],['hub','core'],['core','tail'],['tail','hub']];
  const seed=[['left',405,100],['right',690,100],['hub',405,234.6],['core',120,369.2],['tail',405,503.8]].map(([id,x,y])=>({id,x,y}));
  let expected;
  for(const mode of ['join','fork','mixed']){
    const d={nodes,edges:links.map(([a,b],i)=>({from:mode==='fork'||mode==='mixed'&&i%2?b:a,to:mode==='fork'||mode==='mixed'&&i%2?a:b}))};
    const r={positions:plain(seed),edges:d.edges.map(()=>({}))};r.score=C.autoArrangeScore(d,r);
    const after=C.autoArrangeFlowClarity(d,r,viz),p=Object.fromEntries(after.positions.map(p=>[p.id,p]));safe(d,r,after);
    assert.equal(p.left.y,p.hub.y);assert.equal(p.right.y,p.hub.y);assert.ok(p.left.x<p.hub.x&&p.hub.x<p.right.x);
    if(expected)assert.deepEqual(plain(after.positions),expected);else expected=plain(after.positions);
    const blocked={nodes:{...nodes,blocker:{}},edges:d.edges},br={positions:seed.concat([{id:'blocker',x:120,y:234.6}]),edges:r.edges};br.score=C.autoArrangeScore(blocked,br);
    const kept=C.autoArrangeFlowClarity(blocked,br,viz);if(kept!==br)safe(blocked,br,kept);
    assert.deepEqual(plain(kept.positions.find(p=>p.id==='blocker')),br.positions.at(-1),'unrelated cards never move to make room');
  }
});

test('readability structure measures undirected degree-two bends identically for every arrow orientation',()=>{
  const nodes={a:{},b:{},c:{},d:{},e:{}},positions=[['a',120,100],['b',405,100],['c',405,234.6],['d',690,369.2],['e',975,369.2]].map(([id,x,y])=>({id,x,y}));
  let expected;
  for(const links of [[['a','b'],['b','c']],[['b','a'],['c','b']],[['a','b'],['c','b']],[['b','a'],['b','c']]]){
    const d={nodes,edges:links.map(([from,to])=>({from,to}))},metrics=plain(C.autoArrangeFlowStructure(d,positions,C.autoArrangeFlowTopology(d)));
    if(expected)assert.deepEqual(metrics,expected);else expected=metrics;
    assert.equal(metrics.turns,1);
  }
});

test('data-platform keeps both intake runs and aligns its top leaf pair without changing content',()=>{
  const d=require('../examples/auto-arrange-large-baselines/graph-input.spec.json').page.blocks.find(b=>b.id==='data-platform').diagram,r=plain(require('./fixtures/auto-arrange-flow-seeds.json')['data-platform']);r.score=C.autoArrangeScore(d,r);
  const after=C.autoArrangeFlowClarity(d,r,viz),p=Object.fromEntries(after.positions.map(p=>[p.id,p]));safe(d,r,after);semantics(d,after);
  for(const ids of [['orders-db','orders-cdc','event-bus'],['accounts-db','accounts-cdc','event-bus'],['iot-gateway','event-ingress','mobile-events']]){
    assert.ok(ids.every(id=>Math.abs(p[id].y-p[ids[0]].y)<.1),ids.join(' / ')+' shares a row');
  }
  assert.ok(p['iot-gateway'].x<p['event-ingress'].x&&p['event-ingress'].x<p['mobile-events'].x);
  assert.ok(Math.abs(p['legacy-warehouse'].y-p['legacy-etl'].y)<.1,'the warehouse can rise to its neighbor row');
  assert.ok(p['finance-export'].y<r.positions.find(p=>p.id==='finance-export').y-.1,'its attached leaf rises with it');
  assert.ok(C.autoArrangeFlowMetrics(d,after).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength);
});

test('early leaf tuck permits source and sink leaves on identical placed geometry',()=>{
  const positions=[{id:'hub',x:0,y:0},{id:'leaf',x:0,y:800},{id:'left',x:-408,y:0},{id:'right',x:408,y:0}],nodes=Object.fromEntries(positions.map(p=>[p.id,{}]));
  const forward={nodes,edges:[{from:'hub',to:'leaf'},{from:'hub',to:'left'},{from:'hub',to:'right'}]},reverse={nodes,edges:forward.edges.map(e=>({from:e.to,to:e.from}))};
  const a=C.autoArrangeLeafPositions(forward,{positions}),b=C.autoArrangeLeafPositions(reverse,{positions});assert.ok(a);assert.deepEqual(plain(a),plain(b));assert.equal(a.leaf.y,a.hub.y);
});

test('a beneficial terminal chain after the sixteenth is visited before a no-improvement round can stop',()=>{
  const d={nodes:{},edges:[]},r={positions:[],edges:[]};
  for(let component=0;component<6;component++){
    const x=component*2500,name=id=>'part'+component+'-'+id;
    const positions=[['hub',405,350],['left',120,350],['left-leaf',-165,350],['right',690,350],['right-leaf',975,350],['down',405,529],['down-leaf',component===5?750:405,component===5?529:708]];
    for(const [id,px,y] of positions){d.nodes[name(id)]={};r.positions.push({id:name(id),x:px+x,y});}
    for(const branch of ['left','right','down'])d.edges.push({from:name('hub'),to:name(branch)},{from:name(branch),to:name(branch+'-leaf')});
  }
  r.edges=d.edges.map(()=>({}));r.score=C.autoArrangeScore(d,r);
  assert.equal(Object.keys(d.nodes).length,42);assert.equal(C.autoArrangeFlowTopology(d).chains.length,18);
  const schedule=C.autoArrangeFlowSchedule,snapshots=[];let after;
  try{C.autoArrangeFlowSchedule=(queues,limit)=>schedule(queues,Math.min(limit,16));assert.equal(C.autoArrangeFlowClarity(d,r,viz),r,'a sixteen-check first round misses the only beneficial neighborhood');}finally{C.autoArrangeFlowSchedule=schedule;}
  try{C.autoArrangeFlowSchedule=(queues,limit)=>{const selected=schedule(queues,limit);snapshots.push({eligible:queues.filter(q=>q.length).length,owners:selected.map(p=>queues.findIndex(q=>q.includes(p)))});return selected;};after=C.autoArrangeFlowClarity(d,r,viz);}finally{C.autoArrangeFlowSchedule=schedule;}
  assert.equal(snapshots[0].eligible,18);assert.deepEqual(plain(snapshots[0].owners.slice(0,18)),Array.from({length:18},(_,i)=>i));
  assert.ok(snapshots.reduce((sum,s)=>sum+s.owners.length,0)<=C.AUTO_ARRANGE_FLOW_LIMITS.checks);
  assert.notEqual(after,r);safe(d,r,after);assert.ok(C.autoArrangeFlowMetrics(d,after).turns<C.autoArrangeFlowMetrics(d,r).turns);
  assert.ok(after.positions.some((p,i)=>p.id.startsWith('part5-')&&(p.x!==r.positions[i].x||p.y!==r.positions[i].y)),'the final component supplies the actual improvement');
});
