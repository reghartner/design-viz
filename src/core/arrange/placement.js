/* Shared deterministic graph arrangement; no runtime dependencies. */
var FlowArrangePlacement=(function(){
'use strict';

// A bounded lattice search. There are no authored coordinates, names, types,
// or reference graphs in this module's input: only adjacency and card sizes.
function random(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function topology(n, edges) {
  const neighbors = Array.from({length:n}, () => []), out = Array.from({length:n}, () => []);
  for (const [a,b] of edges) if (a !== b) { if (!neighbors[a].includes(b)) neighbors[a].push(b); if (!neighbors[b].includes(a)) neighbors[b].push(a); if (!out[a].includes(b)) out[a].push(b); }
  neighbors.forEach(a=>a.sort((x,y)=>x-y)); out.forEach(a=>a.sort((x,y)=>x-y));
  const seen = new Set(), order = [], active = new Set(), feedback = new Set();
  function visit(a) { seen.add(a); active.add(a); for (const b of out[a]) { if (active.has(b)) feedback.add(a+','+b); else if (!seen.has(b)) visit(b); } active.delete(a); order.push(a); }
  const incoming=Array(n).fill(0); out.forEach(a=>a.forEach(b=>incoming[b]++));
  [...Array(n).keys()].sort((a,b)=>incoming[a]-incoming[b] || a-b).forEach(a=>{if(!seen.has(a))visit(a);}); order.reverse();
  const rank = Array(n).fill(0); for (const a of order) for (const b of out[a]) if (!feedback.has(a+','+b)) rank[b]=Math.max(rank[b],rank[a]+1);
  const distances = neighbors.map((_,start)=>{const d=Array(n).fill(Infinity),q=[start];d[start]=0;for(let i=0;i<q.length;i++)for(const b of neighbors[q[i]])if(!Number.isFinite(d[b])){d[b]=d[q[i]]+1;q.push(b);}return d;});
  return {neighbors, out, rank, feedback, distances};
}

function stressSeed(t, width, height, rng, mode) {
  const n=t.neighbors.length, maxRank=Math.max(1,...t.rank);
  let p=Array.from({length:n},(_,i)=>mode%2 ? {x:Math.cos(i*2.399963+mode)*Math.sqrt(i+1),y:Math.sin(i*2.399963+mode)*Math.sqrt(i+1)} : {x:(rng()-.5)*Math.sqrt(n),y:t.rank[i]/maxRank*Math.sqrt(n)});
  // Majorization of graph-distance stress, with a small gravity toward the
  // directed depth. The latter fixes rotation without enforcing layers.
  for(let step=0;step<180;step++) {
    const next=p.map((a,i)=>{let x=0,y=0,w=0;for(let j=0;j<n;j++)if(i!==j && Number.isFinite(t.distances[i][j])){const d=t.distances[i][j],weight=1/(d*d),dx=a.x-p[j].x,dy=a.y-p[j].y,len=Math.hypot(dx,dy)||.001;x+=weight*(p[j].x+dx/len*d);y+=weight*(p[j].y+dy/len*d);w+=weight;}const guide=.08;return {x:x/(w||1),y:(y+guide*t.rank[i])/(w+guide)};});
    p=next;
  }
  const xs=p.map(a=>a.x),ys=p.map(a=>a.y),minX=Math.min(...xs),minY=Math.min(...ys),sx=(width-1)/(Math.max(...xs)-minX||1),sy=(height-1)/(Math.max(...ys)-minY||1);
  const occupied=new Set(), result=Array(n);
  [...Array(n).keys()].sort((a,b)=>t.neighbors[b].length-t.neighbors[a].length || a-b).forEach(i=>{
    const tx=(p[i].x-minX)*sx,ty=(p[i].y-minY)*sy;
    let best=Infinity,point;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(occupied.has(y*width+x))continue;const cost=(x-tx)**2+(y-ty)**2;if(cost<best){best=cost;point={x,y};}}
    occupied.add(point.y*width+point.x);result[i]=point;
  });
  return result;
}

function crosses(a,b,c,d) {
  const abx=b.x-a.x,aby=b.y-a.y,cdx=d.x-c.x,cdy=d.y-c.y;
  return ((abx*(c.y-a.y)-aby*(c.x-a.x))*(abx*(d.y-a.y)-aby*(d.x-a.x))<-.00001 &&
    (cdx*(a.y-c.y)-cdy*(a.x-c.x))*(cdx*(b.y-c.y)-cdy*(b.x-c.x))<-.00001);
}
function hitsBox(a,b,c,halfX=.34,halfY=.25) {
  const dx=b.x-a.x,dy=b.y-a.y;
  let lo=0,hi=1,u,v;
  if(Math.abs(dx)<1e-10){if(a.x<=c.x-halfX||a.x>=c.x+halfX)return false;}
  else {u=(c.x-halfX-a.x)/dx;v=(c.x+halfX-a.x)/dx;if(u>v){const t=u;u=v;v=t;}lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>=hi)return false;}
  if(Math.abs(dy)<1e-10){if(a.y<=c.y-halfY||a.y>=c.y+halfY)return false;}
  else {u=(c.y-halfY-a.y)/dy;v=(c.y+halfY-a.y)/dy;if(u>v){const t=u;u=v;v=t;}lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>=hi)return false;}
  return hi>0&&lo<1;
}

function score(p, edges, t, aspect, strideRatio, moved=null) {
  let cost=0;
  // Reuse topology-only masks and exact distance terms across the two scores
  // for a move. Accumulation order and every floating-point term stay intact.
  const key=moved?(moved[0]+1)*(p.length+1)+(moved.length>1?moved[1]+1:0):0;
  let touched=t.scoreMasks&&t.scoreMasks[key];
  if(!touched){touched=edges.map(([a,b])=>!moved||moved.includes(a)||moved.includes(b));if(t.scoreMasks)t.scoreMasks[key]=touched;}
  for(let ei=0;ei<edges.length;ei++) {
    const a=edges[ei][0],b=edges[ei][1]; if(a===b)continue;
    const A=p[a],B=p[b];
    if(touched[ei]){
      const dx=B.x-A.x,dy=B.y-A.y;
      let distanceCost;
      if(t.distanceCosts){const key=Math.abs(dx)*(p.length*2+1)+Math.abs(dy);distanceCost=t.distanceCosts[key];if(distanceCost===undefined){const dist=Math.hypot(dx,dy);distanceCost=t.distanceCosts[key]=1.7*dist + .32*dist*dist;}}
      else {const dist=Math.hypot(dx,dy);distanceCost=1.7*dist + .32*dist*dist;}
      cost+=distanceCost;
      // An axial relationship reads as a phrase. Diagonal branches remain legal.
      if(dx && dy)cost+=1.25+ .25*Math.min(Math.abs(dx),Math.abs(dy));
      if(dy<0 && !(t.feedbackEdges?t.feedbackEdges[ei]:t.feedback.has(a+','+b)))cost+=1.4*Math.min(3,-dy);
      for(let i=0;i<p.length;i++)if(i!==a && i!==b && hitsBox(A,B,p[i]))cost+=22;
      const comparisons=t.disjointEdges&&t.disjointEdges[ei];
      for(let k=0;k<(comparisons?comparisons.length:edges.length);k++) {
        const ej=comparisons?comparisons[k]:k;
        if(ej===ei || touched[ej]&&ej>ei)continue;
        const c=edges[ej][0],d=edges[ej][1];if(!comparisons&&(a===c||a===d||b===c||b===d||c===d))continue;
        if(crosses(A,B,p[c],p[d]))cost+=13;
      }
    }else for(const i of moved)if(i!==a&&i!==b&&hitsBox(A,B,p[i]))cost+=22;
  }
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<p.length;i++){
    const P=p[i];minX=Math.min(minX,P.x);maxX=Math.max(maxX,P.x);minY=Math.min(minY,P.y);maxY=Math.max(maxY,P.y);
    if(t.neighbors[i].length===2){const [a,b]=t.neighbors[i];if(!moved||moved.includes(i)||moved.includes(a)||moved.includes(b)){const A=p[a],B=p[b];if(A.x===P.x&&B.x===P.x || A.y===P.y&&B.y===P.y)cost-=1.1;}}
  }
  const w=maxX-minX+1,h=maxY-minY+1,ratio=w*strideRatio/h;
  cost+=.42*w*h + 1.4*p.length*Math.log(ratio/aspect)**2;
  return cost;
}

// Bound larger searches while preserving the default schedule below 50 nodes.
function defaultIterations(n){return Math.min(64000,Math.max(16000,n*1300));}

function place(nodes, inputEdges, options={}) {
  const n=nodes.length;if(!n)return {positions:[],score:0};
  const edges=Array.from(new Map(inputEdges.filter(([a,b])=>a!==b).map(e=>[e.join(','),e])).values());
  const t=topology(n,edges),aspect=options.aspectRatio??1.45;
  t.scoreMasks=[];t.distanceCosts=[];t.feedbackEdges=edges.map(([a,b])=>t.feedback.has(a+','+b));
  t.disjointEdges=edges.map(([a,b],ei)=>edges.map((e,i)=>i).filter(ej=>{const [c,d]=edges[ej];return ei!==ej&&a!==c&&a!==d&&b!==c&&b!==d&&c!==d;}));
  const xStep=Math.max(...nodes.map(n=>n.width))+ (options.columnGap??176),yStep=Math.max(...nodes.map(n=>n.height))+(options.rowGap??138);
  const strideRatio=xStep/yStep,baseCols=Math.max(2,Math.round(Math.sqrt(n*1.6*aspect/strideRatio)));
  const restarts=options.restarts??4,iterations=options.iterations??defaultIterations(n);
  let best=null;const candidates=[];
  for(let restart=0;restart<restarts;restart++) {
    const width=Math.min(n,Math.max(1,baseCols+(restart%3)-1)),height=Math.max(1,Math.ceil(n*1.55/width));
    const rng=random((options.seed??71)+restart*1009),p=stressSeed(t,width,height,rng,restart),occupied=new Int32Array(width*height).fill(-1);p.forEach((a,i)=>occupied[a.y*width+a.x]=i);
    let value=score(p,edges,t,aspect,strideRatio),localBest=value,local=p.map(a=>({...a}));
    for(let iter=0;iter<iterations;iter++) {
      const i=Math.floor(rng()*n),old=p[i];let target;
      if(rng()<.7){const radius=rng()<.85?1:2;target={x:Math.max(0,Math.min(width-1,old.x+Math.floor(rng()*(2*radius+1))-radius)),y:Math.max(0,Math.min(height-1,old.y+Math.floor(rng()*(2*radius+1))-radius))};}
      else if(rng()<.7 && t.neighbors[i].length){const q=p[t.neighbors[i][Math.floor(rng()*t.neighbors[i].length)]];target={x:Math.max(0,Math.min(width-1,q.x+Math.floor(rng()*3)-1)),y:Math.max(0,Math.min(height-1,q.y+Math.floor(rng()*3)-1))};}
      else target={x:Math.floor(rng()*width),y:Math.floor(rng()*height)};
      const cell=target.y*width+target.x,j=occupied[cell];if(j===i)continue;
      const moved=j>=0?[i,j]:[i],before=score(p,edges,t,aspect,strideRatio,moved);
      p[i]=target;if(j>=0)p[j]=old;
      const candidate=value+score(p,edges,t,aspect,strideRatio,moved)-before,fraction=iter/iterations,temperature=6.5*(1-fraction)**3+.035;
      if(candidate<value || rng()<Math.exp((value-candidate)/temperature)){
        occupied[cell]=i;occupied[old.y*width+old.x]=j;value=candidate;
        if(value<localBest){localBest=value;local=p.map(a=>({...a}));}
      }else{p[i]=old;if(j>=0)p[j]=target;}
    }
    localBest=score(local,edges,t,aspect,strideRatio);
    const candidate={positions:local,score:localBest,restart};candidates.push(candidate);
    if(!best||localBest<best.score)best=candidate;
  }
  for(const candidate of candidates){const minX=Math.min(...candidate.positions.map(p=>p.x)),minY=Math.min(...candidate.positions.map(p=>p.y));
    candidate.positions=candidate.positions.map((p,i)=>({id:nodes[i].id,x:(p.x-minX)*xStep+Math.max(...nodes.map(n=>n.width))/2+48,y:(p.y-minY)*yStep+Math.max(...nodes.map(n=>n.height))/2+48,width:nodes[i].width,height:nodes[i].height}));
  }
  return {...best,candidates};
}

return {place,topology,crosses,hitsBox,score,defaultIterations};

})();
