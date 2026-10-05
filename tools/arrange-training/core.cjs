'use strict';
// Offline only. No learned model is loaded by the shipped arranger.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const {entrypoint} = require('../source-loader.cjs');
const DEFAULT_CORPUS = path.resolve(__dirname, '../../tests/fixtures/auto-arrange-training');
const FEATURES = ['crowDistance', 'footprint', 'neighborhoodSpan', 'axisWaste', 'elongation'];
const ROUTE_KEYS = ['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy'];
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
function loadEngine(root = path.resolve(__dirname, '../..')) {
  root = fs.realpathSync(root);
  const loaded = entrypoint('workbench', path.join(root, 'src')), C = {URL};
  vm.runInNewContext(loaded.body, C, {timeout:10000});
  const git = args => {try {return cp.execFileSync('git', ['-C',root,...args], {encoding:'utf8'}).trim();} catch {return null;}};
  return {C, root, provenance:{root, commit:git(['rev-parse','HEAD']), trackedDirty:!!git(['status','--porcelain','--untracked-files=no']),
    sourceSha256:hash(loaded.body), sourceFiles:loaded.records.map(r=>({file:r.file,sha256:hash(r.source)})),
    loaderSha256:hash(fs.readFileSync(path.resolve(__dirname,'../source-loader.cjs'))), node:process.version}};
}
function safeFile(root, name) {
  const target=path.resolve(root,name); if(!target.startsWith(path.resolve(root)+path.sep)) throw Error('Corpus path escapes root'); return target;
}
function loadCorpus(root = DEFAULT_CORPUS) {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'corpus.json'),'utf8'));
  if(manifest.version!==1 || !Array.isArray(manifest.pairs) || !manifest.pairs.length) throw Error('Invalid or empty corpus');
  const evidence={};
  for(const [file,digest] of Object.entries(manifest.evidenceHashes)) {
    const raw=fs.readFileSync(safeFile(root,file)); if(hash(raw)!==digest) throw Error('Evidence hash mismatch'); evidence[file]=JSON.parse(raw);
  }
  const ids=new Set();
  return manifest.pairs.map(pair=>{
    if(ids.has(pair.id) || !['A','B'].includes(pair.choice)) throw Error('Invalid pair identity/choice'); ids.add(pair.id);
    const e=evidence[pair.evidence], record=e?.graphs ? e.graphs[pair.record] : e;
    if(!record || (record.choice || String(record.preferred).split(':')[0])!==pair.choice || (record.graphId || record.graph)!==pair.id) throw Error('Label provenance mismatch');
    const diagrams={};
    for(const label of ['A','B']) {
      const item=pair.candidates[label], declared=record[label] || record.candidates?.[label];
      if(!declared || declared.sha256!==item.sha256 || declared.agentVariant!==item.agentVariant) throw Error('Candidate provenance mismatch');
      const raw=fs.readFileSync(safeFile(root,item.file)); if(hash(raw)!==item.sha256) throw Error('Candidate hash mismatch');
      const block=JSON.parse(raw).page.blocks[item.block];
      if(!block?.diagram || block.id!==item.blockId) throw Error('Candidate block mismatch');
      diagrams[label]=block.diagram;
    }
    const topology=d=>stable({nodes:Object.entries(d.nodes).map(([id,n])=>[id,n.group || null]).sort(),groups:d.groups || {},edges:(d.edges || []).map(e=>[e.from,e.to]).sort()});
    if(topology(diagrams.A)!==topology(diagrams.B)) throw Error('A/B topology mismatch');
    return {...pair, diagrams};
  });
}
// Only geometry/topology enter the viewer or the learner. Text, icons, tint,
// graph IDs and human labels are never features. Preserve routing explicitly.
function geometry(d) {
  return {nodes:Object.fromEntries(Object.entries(d.nodes || {}).map(([id,n])=>[id,n.group?{group:n.group}:{}])),
    groups:Object.fromEntries(Object.entries(d.groups || {}).map(([id,g])=>[id,g.parent?{parent:g.parent}:{}])),
    rows:clone(d.rows || [[]]), floats:clone(d.floats || []), ...(d.routing ? {routing:clone(d.routing)}:{}),
    edges:(d.edges || []).map(e=>Object.fromEntries(['from','to',...ROUTE_KEYS].filter(k=>e[k]!==undefined).map(k=>[k,clone(e[k])]))) };
}
function rect(p) { return {x:p.cx-p.w/2,y:p.cy-p.h/2,w:p.w,h:p.h}; }
function overlap(a,b) {return a.x<b.x+b.w-.1 && b.x<a.x+a.w-.1 && a.y<b.y+b.h-.1 && b.y<a.y+a.h-.1;}
function bounds(boxes) {
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
}
function crosses(a,b) {
  const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
    const p=a[i-1],q=a[i],r=b[j-1],s=b[j];
    if(Math.max(p.x,q.x)<Math.min(r.x,s.x)||Math.max(r.x,s.x)<Math.min(p.x,q.x)||Math.max(p.y,q.y)<Math.min(r.y,s.y)||Math.max(r.y,s.y)<Math.min(p.y,q.y))continue;
    if(side(p,q,r)*side(p,q,s)<-1e-8 && side(r,s,p)*side(r,s,q)<-1e-8)return true;
  }return false;
}
function measure(engine, original) {
  if((original.floats || []).some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>=1e7||Math.abs(p.y)>=1e7))throw Error('Nonfinite or out-of-bounds geometry');
  const C=engine.C,d=geometry(original),ids=C.autoArrangeInput(d),L=C.layout(d);
  if(ids.some(id=>!L.pos[id] || !['cx','cy','w','h'].every(k=>Number.isFinite(L.pos[id][k]) && Math.abs(L.pos[id][k])<1e7)))throw Error('Nonfinite or out-of-bounds geometry');
  const cards=ids.map(id=>rect(L.pos[id])),groups=Object.keys(L.groups || {});
  let overlaps=0,hits=0,ordinaryCrossings=0,incidentCrossings=0,renderedLength=0,crowLength=0,axisEdges=0,minCardClearance=null;
  cards.forEach((a,i)=>cards.slice(i+1).forEach(b=>{
    if(overlap(a,b))overlaps++;
    const gap=Math.hypot(Math.max(0,a.x-b.x-b.w,b.x-a.x-a.w),Math.max(0,a.y-b.y-b.h,b.y-a.y-a.h));
    minCardClearance=minCardClearance===null?gap:Math.min(minCardClearance,gap);
  }));
  const parents=C.sanitizedGroupParents(d.groups);
  const ancestor=(a,b)=>{const seen=new Set();while(b!=null&&!seen.has(b)){if(a===b)return true;seen.add(b);b=parents[b];}return false;};
  groups.forEach((g,i)=>{
    groups.slice(i+1).forEach(h=>{if(!ancestor(g,h)&&!ancestor(h,g)&&overlap(L.groups[g],L.groups[h]))overlaps++;});
    ids.forEach((id,j)=>{if(!ancestor(g,d.nodes[id].group)&&overlap(L.groups[g],cards[j]))overlaps++;});
  });
  let adjust=L.routing==='lanes'?C.laneRoutes(d,L):C.edgeAutoAdjust(d.edges,L);
  if(L.routing!=='lanes'&&C.resolveEdgeAvoidance)adjust=C.resolveEdgeAvoidance(d.edges,L,adjust);
  const paths=d.edges.map((e,i)=>{
    const points=C.samplePathD(C.edgePath(e,L,adjust[i]));
    if(points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e7||Math.abs(p.y)>1e7))throw Error('Invalid viewer path');
    hits+=C.countPathRectHits(points,ids.filter(id=>id!==e.from&&id!==e.to).map(id=>rect(L.pos[id])));
    for(let j=1;j<points.length;j++)renderedLength+=Math.hypot(points[j].x-points[j-1].x,points[j].y-points[j-1].y);
    const a=L.pos[e.from],b=L.pos[e.to];crowLength+=Math.hypot(a.cx-b.cx,a.cy-b.cy);
    if(Math.abs(a.cx-b.cx)<1e-6||Math.abs(a.cy-b.cy)<1e-6)axisEdges++;
    return points;
  });
  const ordinaryPairs=[],incidentPairs=[];
  paths.forEach((a,i)=>paths.slice(i+1).forEach((b,j)=>{j+=i+1;if(crosses(a,b)){
    const e=d.edges[i],f=d.edges[j],incident=e.from===f.from||e.from===f.to||e.to===f.from||e.to===f.to;
    (incident?incidentPairs:ordinaryPairs).push([i,j]);if(incident)incidentCrossings++;else ordinaryCrossings++;
  }}));
  const occupied=bounds([...cards,...groups.map(g=>L.groups[g]),...paths.flat().map(p=>({x:p.x,y:p.y,w:0,h:0}))]);
  const n=ids.length,m=d.edges.length,unit=Math.hypot(150,44),area=occupied.w*occupied.h;
  let span=0;
  for(const id of ids){const neighbors=new Set([id]);for(const e of d.edges){if(e.from===id)neighbors.add(e.to);if(e.to===id)neighbors.add(e.from);}
    const b=bounds([...neighbors].map(k=>rect(L.pos[k])));span+=Math.hypot(b.w,b.h)/unit;}
  const aspect=occupied.w/occupied.h;
  const features={crowDistance:crowLength/Math.max(1,m)/unit,footprint:Math.log1p(area/(n*150*44)),neighborhoodSpan:span/n,
    axisWaste:m?1-axisEdges/m:0,elongation:Math.max(0,Math.abs(Math.log(aspect))-Math.log(3))};
  if(!Object.values(features).every(Number.isFinite))throw Error('Nonfinite features');
  const positions=ids.map(id=>({id,x:L.pos[id].cx,y:L.pos[id].cy}));
  const engineScore=C.autoArrangeScore(d,{positions,edges:d.edges.map(e=>Object.fromEntries(ROUTE_KEYS.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])))});
  return {features,safety:{overlaps,hits,ordinaryCrossings,incidentCrossings},crossingPairs:{ordinary:ordinaryPairs,incident:incidentPairs},
    diagnostics:{nodes:n,edges:m,minCardClearance,crowLength,renderedLength,area,width:occupied.w,height:occupied.h,aspect,axisEdges,
      manualRouteEdges:d.edges.filter(e=>ROUTE_KEYS.some(k=>e[k]!==undefined)).length},engineScore,positions};
}
function evaluateCorpus(engine,corpus) {return corpus.map(p=>({id:p.id,choice:p.choice,A:measure(engine,p.diagrams.A),B:measure(engine,p.diagrams.B)}));}
function vector(m) {return FEATURES.map(k=>m.features[k]);}
function dot(a,b) {return a.reduce((sum,v,i)=>sum+v*b[i],0);}
function fit(rows) {
  if(!Array.isArray(rows)||!rows.length)throw Error('Cannot train empty corpus');
  if(rows.some(r=>!['A','B'].includes(r.choice)||!['A','B'].every(l=>vector(r[l]).every(Number.isFinite))))throw Error('Invalid training row');
  // RMS scales use fitting pairs only. No corpus-wide normalization or tuning.
  const diffs=rows.map(r=>{const win=vector(r[r.choice]),lose=vector(r[r.choice==='A'?'B':'A']);return lose.map((v,i)=>v-win[i]);});
  const scales=FEATURES.map((_,i)=>Math.max(0.1,Math.sqrt(diffs.reduce((s,d)=>s+d[i]*d[i],0)/diffs.length)));
  const xs=diffs.map(d=>d.map((v,i)=>v/scales[i]));
  if(!xs.some(d=>d.some(v=>Math.abs(v)>1e-12)))throw Error('Untrainable: all pair features identical');
  let w=FEATURES.map(()=>0);const lambda=0.2,steps=1200,rate=0.08;
  for(let t=0;t<steps;t++){
    const grad=w.map(v=>lambda*v);
    for(const x of xs){const p=1/(1+Math.exp(Math.min(700,dot(w,x))));x.forEach((v,i)=>{grad[i]-=v*p/xs.length;});}
    w=w.map((v,i)=>Math.max(0,Math.min(4,v-rate*grad[i])));
  }
  return {features:FEATURES,weights:w,scales,fitIds:rows.map(r=>r.id),settings:{lambda,steps,rate,bounds:[0,4]},status:w.some(v=>v>1e-10)?'fitted':'no-nonnegative-direction'};
}
function cost(model,m) {return dot(model.weights,vector(m).map((v,i)=>v/model.scales[i]));}
function rank(model,row) {
  const margin=cost(model,row.B)-cost(model,row.A),rawChoice=Math.abs(margin)<1e-10?'tie':margin>0?'A':'B';
  const admissible=['A','B'].filter(label=>safe(row[label]));
  return {choice:admissible.length===2?rawChoice:admissible[0] || 'neither-safe',rawGeometryChoice:rawChoice,admissible,marginBMinusA:margin,humanMargin:row.choice==='A'?margin:-margin,
    crossings:{A:row.A.safety,B:row.B.safety}};
}
function engineRank(engine,row) {
  const a=row.A.engineScore,b=row.B.engineScore;
  const delta=engine.C.autoArrangeCompare?engine.C.autoArrangeCompare({score:a},{score:b}):a.crossings-b.crossings||a.length-b.length||a.area-b.area;
  return {choice:delta<0?'A':delta>0?'B':'tie',comparisonDelta:delta,policy:engine.C.autoArrangeCompare?'autoArrangeCompare (default compact=false)':'crossings, engine length, area'};
}
function leaveOneOut(rows) {
  if(rows.length<2)throw Error('Leave-one-out requires at least two pairs');
  return rows.map((held,i)=>{try {const model=fit(rows.filter((_,j)=>j!==i));return {id:held.id,model,...rank(model,held)};}catch(error){return {id:held.id,error:error.message};}});
}
function safe(m) {return m.safety.overlaps===0&&m.safety.hits===0;}
function preservesCrossings(candidate,base) {
  return ['ordinary','incident'].every(k=>{const old=new Set(base.crossingPairs[k].map(p=>p.join(':')));return candidate.crossingPairs[k].every(p=>old.has(p.join(':')));});
}
function contract(engine,diagram,model,{maxChecks=24}={}) {
  if(!Number.isInteger(maxChecks)||maxChecks<1||maxChecks>48)throw Error('maxChecks must be 1..48');
  const start=performance.now(),baseline=measure(engine,diagram);let best=clone(diagram),metrics=baseline,checks=0,accepted=0;
  const clearanceFloor=Math.min(baseline.diagnostics.minCardClearance??Infinity,engine.C.AUTO_ARRANGE_CARD_GAP);
  if(!safe(baseline))return {diagram:best,baseline,metrics,checks,accepted,reason:'unsafe baseline; unchanged',runtimeMs:performance.now()-start};
  // Global affine contraction preserves every exact shared row/column, ordering,
  // and topology. Automatic natural curves are re-evaluated after each proposal.
  for(const factor of [.94,.88,.80,.70])for(const axes of [['x'],['y'],['x','y']]){
    if(checks>=maxChecks)break;
    const proposed=clone(diagram);proposed.rows=[[]];
    const centers={x:baseline.positions.reduce((s,p)=>s+p.x,0)/baseline.positions.length,y:baseline.positions.reduce((s,p)=>s+p.y,0)/baseline.positions.length};
    proposed.floats=baseline.positions.map(p=>({id:p.id,side:'below',x:axes.includes('x')?centers.x+(p.x-centers.x)*factor:p.x,y:axes.includes('y')?centers.y+(p.y-centers.y)*factor:p.y}));
    delete proposed.routing;proposed.edges=proposed.edges.map(e=>{e=clone(e);ROUTE_KEYS.forEach(k=>delete e[k]);return e;});
    checks++;const next=measure(engine,proposed);
    // A newly crossing pair is rejected even if another crossing disappears.
    if(safe(next)&&(next.diagnostics.minCardClearance===null||next.diagnostics.minCardClearance>=clearanceFloor-1e-7)&&preservesCrossings(next,baseline)&&preservesCrossings(next,metrics)&&cost(model,next)<cost(model,metrics)-1e-8){best=proposed;metrics=next;accepted++;}
  }
  return {diagram:best,baseline,metrics,checks,accepted,clearanceFloor,reason:accepted?'learned cost decreased with safety guards':'no admissible lower-cost contraction; unchanged',runtimeMs:performance.now()-start};
}
module.exports={DEFAULT_CORPUS,FEATURES,ROUTE_KEYS,loadEngine,loadCorpus,geometry,measure,evaluateCorpus,fit,cost,rank,engineRank,leaveOneOut,contract,safe,preservesCrossings,hash,clone};
