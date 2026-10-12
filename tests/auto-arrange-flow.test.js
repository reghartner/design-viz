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

test('generated research tail improves without moving its junction; a compact cardinal tail is not unfolded for longer routes',()=>{
  // Automatic PR457 outputs from d18761273437cd533a4dbffe3f834e27bbd7350b,
  // frozen before this pass; these are regression seeds, not human preference labels.
  const seeds=require('./fixtures/auto-arrange-flow-seeds.json');
  for(const [file,id] of [['./fixtures/auto-arrange-training/round2-input.spec.json','research-compute-federation'],['../examples/auto-arrange-baselines/graph-input.spec.json','approval-diamond']]){
    const d=require(file).page.blocks.find(b=>b.id===id).diagram,r=plain(seeds[id]);r.score=C.autoArrangeScore(d,r);const after=C.autoArrangeFlowClarity(d,r,viz);safe(d,r,after);semantics(d,after);
    if(id==='approval-diamond')assert.equal(after,r,'straightening the tail does not justify longer total routes');
    else {assert.notEqual(after,r);assert.ok(C.autoArrangeFlowMetrics(d,after).routeLength<C.autoArrangeFlowMetrics(d,r).routeLength);const topology=C.autoArrangeFlowTopology(d),old=Object.fromEntries(r.positions.map(p=>[p.id,p]));for(const p of after.positions)if(topology.adj[p.id].length>2)assert.deepEqual(plain(p),old[p.id],'external junction connections keep their useful positions');}
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
  assert.equal(first.owners.length,C.AUTO_ARRANGE_FLOW_LIMITS.checks);
  assert.deepEqual(first.owners.slice(0,eligible.length),eligible,'every feasible chain gets a check before any gets a second');
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
