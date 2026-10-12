/* Topology and dimensions only: authored positions never enter the search. */
var FlowArrangeGraph=(function(){
'use strict';
const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
const {place}=FlowArrangePlacement;
const {route}=FlowArrangeRouting;

function optionsChecked(options={}) {
  const result={...options};
  for(const [key,min,max] of [['seed',0,4294967295],['restarts',1,12],['iterations',1,1000000],['aspectRatio',.25,4],['columnGap',40,1000],['rowGap',40,1000]]){
    if(result[key]!==undefined && (!Number.isFinite(result[key])||result[key]<min||result[key]>max || ['seed','restarts','iterations'].includes(key)&&!Number.isInteger(result[key])))throw new TypeError(`Invalid ${key}`);
  }
  return result;
}

/** Pure topology-and-dimensions API. No coordinates or labels are consumed. */
function arrangeGraph(graph,options={}) {
  options=optionsChecked(options);
  if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))throw new TypeError('Expected nodes and edges arrays');
  if(graph.nodes.length>80||graph.edges.length>160)throw new RangeError('Auto arrange supports up to 80 nodes and 160 connections per diagram.');
  const started=clock(),nodes=graph.nodes.map(n=>{
    if(!n||typeof n.id!=='string'||!n.id.length)throw new TypeError('Every node needs a nonempty string id');
    const width=n.width??150,height=n.height??44;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>2000||height>2000)throw new TypeError(`Invalid dimensions for ${n.id}`);
    return {id:n.id,width,height};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const index=new Map(nodes.map((n,i)=>[n.id,i]));if(index.size!==nodes.length)throw new TypeError('Duplicate node id');
  const edges=graph.edges.map(e=>{if(!e||!index.has(e.from)||!index.has(e.to))throw new TypeError('Edge references an unknown node');return [index.get(e.from),index.get(e.to)];});
  // Canonical edge order makes route selection independent of serialization.
  const order=edges.map((_,i)=>i).sort((i,j)=>edges[i][0]-edges[j][0]||edges[i][1]-edges[j][1]||i-j),canonical=order.map(i=>edges[i]);
  if(!nodes.length)return {positions:[],edges:[],frame:{x:0,y:0,w:96,h:96},metrics:{nodes:0,edges:0,placementScore:0,cardIntrusions:0,crossings:0,runtimeMs:clock()-started}};
  const search=place(nodes,canonical,options),placedAt=clock();
  let placed,routed,selectionScore=Infinity;
  for(const candidate of search.candidates??[search]){
    const routes=route(candidate.positions,canonical),quality=candidate.score+routes.metrics.cardIntrusions*100000+routes.metrics.crossings*13+routes.metrics.sharedLength/22;
    if(quality<selectionScore){placed=candidate;routed=routes;selectionScore=quality;}
  }
  const routedAt=clock(),edgeResult=Array(edges.length);order.forEach((old,i)=>edgeResult[old]=routed.edges[i]);
  const left=Math.min(...placed.positions.map(p=>p.x-p.width/2),routed.bounds?.left??Infinity)-32,top=Math.min(...placed.positions.map(p=>p.y-p.height/2),routed.bounds?.top??Infinity)-32,right=Math.max(...placed.positions.map(p=>p.x+p.width/2),routed.bounds?.right??-Infinity)+32,bottom=Math.max(...placed.positions.map(p=>p.y+p.height/2),routed.bounds?.bottom??-Infinity)+32;
  if([left,top,right,bottom].some(v=>Math.abs(v)>100000))throw new RangeError('Generated geometry exceeds the native coordinate range');
  return {positions:placed.positions,edges:edgeResult,frame:{x:Math.floor(left),y:Math.floor(top),w:Math.ceil(right)-Math.floor(left),h:Math.ceil(bottom)-Math.floor(top)},metrics:{nodes:nodes.length,edges:edges.length,placementScore:placed.score,selectionScore,restart:placed.restart,...routed.metrics,placementMs:placedAt-started,routingMs:routedAt-placedAt,runtimeMs:clock()-started}};
}

return {arrangeGraph,optionsChecked};
})();
