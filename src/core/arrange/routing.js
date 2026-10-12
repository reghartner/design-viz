/* Shared deterministic graph arrangement; no runtime dependencies. */
var FlowArrangeRouting=(function(){
'use strict';
const {crosses,hitsBox}=FlowArrangePlacement;
const SIDES=['top','right','bottom','left'];
const round=v=>Math.round(v*100)/100;
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function port(n,side,offset=.5){const horizontal=side==='top'||side==='bottom';return {x:horizontal?n.x+n.width*(offset-.5):n.x+(side==='right'?1:-1)*n.width/2,y:horizontal?n.y+(side==='bottom'?1:-1)*n.height/2:n.y+n.height*(offset-.5),nx:horizontal?0:side==='right'?1:-1,ny:horizontal?(side==='bottom'?1:-1):0};}
function line(a,b){return [a,mix(a,b,1/3),mix(a,b,2/3),b];}
function rounded(points){
  const simple=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>.001);
  for(let i=simple.length-2;i>0;i--){const a=simple[i-1],b=simple[i],c=simple[i+1];if((a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y))simple.splice(i,1);}
  let current=simple[0];const segments=[];
  for(let i=1;i<simple.length-1;i++){
    const a=simple[i-1],b=simple[i],c=simple[i+1],u=Math.hypot(b.x-a.x,b.y-a.y),v=Math.hypot(c.x-b.x,c.y-b.y),radius=Math.min(20,u*.4,v*.4),before=mix(b,a,radius/u),after=mix(b,c,radius/v);
    if(Math.hypot(current.x-before.x,current.y-before.y)>.001)segments.push(line(current,before));
    segments.push([before,mix(before,b,.55228475),mix(after,b,.55228475),after]);current=after;
  }
  if(simple.length>1)segments.push(line(current,simple[simple.length-1]));return segments;
}
function flatten(segments,step=10){
  const points=[];
  for(const [a,b,c,d] of segments){const length=Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(c.x-b.x,c.y-b.y)+Math.hypot(d.x-c.x,d.y-c.y),count=Math.max(8,Math.ceil(length/step));if(!points.length)points.push(a);for(let i=1;i<=count;i++){const t=i/count,u=1-t;points.push({x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y});}}
  return points;
}
function simplify(points,tolerance=.35){
  if(points.length<3)return points;
  const first=points[0],last=points[points.length-1],dx=last.x-first.x,dy=last.y-first.y,len=dx*dx+dy*dy;
  let furthest=0,index=-1;
  for(let i=1;i<points.length-1;i++){const p=points[i],t=len?Math.max(0,Math.min(1,((p.x-first.x)*dx+(p.y-first.y)*dy)/len)):0,d=Math.hypot(p.x-first.x-t*dx,p.y-first.y-t*dy);if(d>furthest){furthest=d;index=i;}}
  if(furthest<=tolerance)return [first,last];
  return simplify(points.slice(0,index+1),tolerance).slice(0,-1).concat(simplify(points.slice(index),tolerance));
}
function traceBounds(points){return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};}
function collisionCount(points,nodes,from,to){
  let hits=0;
  for(let k=0;k<nodes.length;k++){
    const n=nodes[k],pad=(k===from||k===to)?-.4:7;
    for(let i=1;i<points.length;i++)if(hitsBox(points[i-1],points[i],n,n.width/2+pad,n.height/2+pad)){hits++;break;}
  }
  return hits;
}
function crossingCount(a,b){let count=0;for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++)if(crosses(a[i-1],a[i],b[j-1],b[j]))count++;return count;}
function overlapLength(a,b){
  let length=0;
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
    const p=a[i-1],q=a[i],r=b[j-1],s=b[j];
    if(Math.abs(p.x-q.x)<.01 && Math.abs(r.x-s.x)<.01 && Math.abs(p.x-r.x)<2)length+=Math.max(0,Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))-Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y)));
    else if(Math.abs(p.y-q.y)<.01 && Math.abs(r.y-s.y)<.01 && Math.abs(p.y-r.y)<2)length+=Math.max(0,Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))-Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x)));
  }
  return Math.max(0,length-24);
}
function pathLength(p){let d=0;for(let i=1;i<p.length;i++)d+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);return d;}
function candidates(nodes,from,to,index,offset=.5){
  const a=nodes[from],b=nodes[to],result=[];
  function add(fromSide,toSide,segments,extra=0){const points=flatten(segments);result.push({fromSide,toSide,offset,segments,points,hits:collisionCount(points,nodes,from,to),base:pathLength(points)/100+segments.length*.09+extra});}
  if(from===to){for(let side=0;side<4;side++)for(const direction of [-1,1])for(const reach of [32,48,72]){const fs=SIDES[side],ts=SIDES[(side+direction+4)%4],s=port(a,fs,offset),e=port(a,ts,offset);add(fs,ts,[[s,{x:s.x+s.nx*reach,y:s.y+s.ny*reach},{x:e.x+e.nx*reach,y:e.y+e.ny*reach},e]]);}return result;}
  const dx=b.x-a.x,dy=b.y-a.y;
  const fromH=dx>=0?'right':'left',toH=dx>=0?'left':'right',fromV=dy>=0?'bottom':'top',toV=dy>=0?'top':'bottom';
  for(const [fs,ts] of [[fromH,toH],[fromV,toV],[fromH,toV],[fromV,toH]]){
    const s=port(a,fs,offset),e=port(b,ts,offset),distance=Math.hypot(s.x-e.x,s.y-e.y),reach=Math.min(180,Math.max(30,distance*.42));
    add(fs,ts,[[s,{x:s.x+s.nx*reach,y:s.y+s.ny*reach},{x:e.x+e.nx*reach,y:e.y+e.ny*reach},e]],(fs===fromV&&Math.abs(dy)<1 || fs===fromH&&Math.abs(dx)<1)?2:0);
  }
  // Channel candidates can bypass intervening cards without changing placement.
  const xs=new Set(),ys=new Set();
  for(const n of nodes){xs.add(n.x-n.width/2-28);xs.add(n.x+n.width/2+28);ys.add(n.y-n.height/2-32);ys.add(n.y+n.height/2+32);}
  for(const y of ys){const fs=y<a.y?'top':'bottom',ts=y<b.y?'top':'bottom',s=port(a,fs,offset),e=port(b,ts,offset);if(Math.abs(y-s.y)<20||Math.abs(y-e.y)<20)continue;add(fs,ts,rounded([s,{x:s.x,y},{x:e.x,y},e]),.6);}
  for(const x of xs){const fs=x<a.x?'left':'right',ts=x<b.x?'left':'right',s=port(a,fs,offset),e=port(b,ts,offset);if(Math.abs(x-s.x)<20||Math.abs(x-e.x)<20)continue;add(fs,ts,rounded([s,{x,y:s.y},{x,y:e.y},e]),.6);}
  return result;
}

// Obstacle escape hatch: A* on a rectilinear visibility lattice. Each obstacle
// contributes its four expanded boundary coordinates; states include direction
// so a bend has an explicit price. The search is entirely independent of the
// viewer's router, and generated paths are rounded only within the clearance.
function mazeRoute(nodes,from,to){
  const start=nodes[from],end=nodes[to],xs=new Set(),ys=new Set(),margin=20;
  for(const n of nodes){for(const x of [n.x-n.width/2-margin,n.x,n.x+n.width/2+margin])xs.add(x);for(const y of [n.y-n.height/2-margin,n.y,n.y+n.height/2+margin])ys.add(y);}
  const X=[...xs].sort((a,b)=>a-b),Y=[...ys].sort((a,b)=>a-b),w=X.length,h=Y.length,total=w*h,blocked=new Uint8Array(total);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(nodes.some(n=>Math.abs(X[x]-n.x)<n.width/2+8&&Math.abs(Y[y]-n.y)<n.height/2+8))blocked[y*w+x]=1;
  const ports=n=>SIDES.map(side=>{const p=port(n,side),q={x:p.x+p.nx*margin,y:p.y+p.ny*margin};return {side,p,q,cell:Y.indexOf(q.y)*w+X.indexOf(q.x)};});
  const starts=ports(start),ends=ports(end),endMap=new Map(ends.map(p=>[p.cell,p]));
  const dist=new Float64Array(total*2).fill(Infinity),previous=new Int32Array(total*2).fill(-1),origin=new Int8Array(total*2).fill(-1),heap=[];
  const push=(state,cost,priority)=>{let i=heap.length;heap.push({state,cost,priority});while(i){const p=(i-1)>>1;if(heap[p].priority<=priority)break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let k=i*2+1;if(k>=heap.length)break;if(k+1<heap.length&&heap[k+1].priority<heap[k].priority)k++;if(heap[i].priority<=heap[k].priority)break;[heap[i],heap[k]]=[heap[k],heap[i]];i=k;}}return first;};
  function heuristic(cell){const x=X[cell%w],y=Y[Math.floor(cell/w)];return Math.min(...ends.map(p=>Math.abs(x-p.q.x)+Math.abs(y-p.q.y)));}
  starts.forEach((p,i)=>{const dir=p.p.nx?0:1,state=p.cell*2+dir;dist[state]=margin;origin[state]=i;push(state,margin,margin+heuristic(p.cell));});
  let found=-1;
  while(heap.length){const current=pop(),state=current.state;if(current.cost!==dist[state])continue;const cell=state>>1,dir=state%2,x=cell%w,y=Math.floor(cell/w);if(endMap.has(cell)){found=state;break;}
    for(const [nx,ny,nd] of [[x-1,y,0],[x+1,y,0],[x,y-1,1],[x,y+1,1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const nc=ny*w+nx;if(blocked[nc])continue;const A={x:X[x],y:Y[y]},B={x:X[nx],y:Y[ny]};if(nodes.some(n=>hitsBox(A,B,n,n.width/2+8,n.height/2+8)))continue;const ns=nc*2+nd,cost=current.cost+Math.abs(B.x-A.x)+Math.abs(B.y-A.y)+(nd===dir?0:28);if(cost<dist[ns]){dist[ns]=cost;previous[ns]=state;origin[ns]=origin[state];push(ns,cost,cost+heuristic(nc));}}
  }
  if(found<0)return null;
  const points=[],finish=endMap.get(found>>1),begin=starts[origin[found]];
  for(let s=found;s>=0;s=previous[s]){const cell=s>>1;points.push({x:X[cell%w],y:Y[Math.floor(cell/w)]});}points.reverse();points.unshift(begin.p);points.push(finish.p);
  const segments=rounded(points);if(segments.length>32)return null;const flat=flatten(segments);
  return {fromSide:begin.side,toSide:finish.side,offset:.5,segments,points:flat,hits:collisionCount(flat,nodes,from,to),base:pathLength(flat)/100+segments.length*.09+1};
}

function route(nodes,edges){
  const pairs=new Map();edges.forEach(([a,b],i)=>{const key=[a,b].sort((x,y)=>x-y).join(',');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(i);});
  const offsets=Array(edges.length).fill(.5);for(const indexes of pairs.values())indexes.forEach((i,j)=>{offsets[i]=.5+(j-(indexes.length-1)/2)*Math.min(.18,.7/indexes.length);});
  const all=edges.map(([a,b],i)=>{const list=candidates(nodes,a,b,i,offsets[i]);if(!list.some(r=>r.hits===0)){const fallback=mazeRoute(nodes,a,b);if(fallback)list.push(fallback);}return list.sort((a,b)=>a.hits-b.hits||a.base-b.base).slice(0,18);});
  let candidateId=0;for(const list of all)for(const r of list){r.trace=simplify(r.points);r.bounds=traceBounds(r.trace);r.id=candidateId++;}
  const conflictCache=new Map();
  function conflicts(a,b){const key=Math.min(a.id,b.id)*candidateId+Math.max(a.id,b.id);if(conflictCache.has(key))return conflictCache.get(key);const A=a.bounds,B=b.bounds;let cost=0;if(!(A.right<B.left||B.right<A.left||A.bottom<B.top||B.bottom<A.top))cost=crossingCount(a.trace,b.trace)*5+overlapLength(a.trace,b.trace)/22;conflictCache.set(key,cost);return cost;}
  const chosen=all.map(c=>c[0]);
  // Route hard/long relationships first, then reroute against the whole graph.
  const order=edges.map((_,i)=>i).sort((a,b)=>chosen[b].base-chosen[a].base||a-b);
  for(let pass=0;pass<3;pass++)for(const i of order){let best=Infinity;for(const r of all[i]){let cost=r.hits*100000+r.base;for(let j=0;j<edges.length;j++)if(j!==i && chosen[j]){
      // Shared card connections can fan out naturally; do not charge their
      // intentional common endpoint as a crossing.
      cost+=conflicts(r,chosen[j]);
    }if(cost<best){best=cost;chosen[i]=r;}}}
  const result=chosen.map((r,i)=>{
    const a=nodes[edges[i][0]],b=nodes[edges[i][1]],controls=r.segments.flatMap((s,j)=>j<r.segments.length-1?s.slice(1):s.slice(1,3));
    return {fromPort:{side:r.fromSide,offset:r.offset},toPort:{side:r.toSide,offset:r.offset},curveControls:controls.map((p,k)=>{const t=(k+1)/(controls.length+1);return {t,dx:round(p.x-a.x-(b.x-a.x)*t),dy:round(p.y-a.y-(b.y-a.y)*t)};})};
  });
  let crossings=0,sharedLength=0;for(let i=0;i<chosen.length;i++)for(let j=0;j<i;j++){crossings+=crossingCount(chosen[i].trace,chosen[j].trace);sharedLength+=overlapLength(chosen[i].trace,chosen[j].trace);}
  const points=chosen.flatMap(r=>r.points),bounds=points.length?{left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))}:null;
  return {edges:result,metrics:{cardIntrusions:chosen.reduce((s,r)=>s+r.hits,0),crossings,sharedLength:round(sharedLength)},bounds};
}
return {route,flatten,collisionCount,mazeRoute};

})();
