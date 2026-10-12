'use strict';
const {performance}=require('node:perf_hooks');
const {place}=require('./placement.cjs');
const {route}=require('./routing.cjs');

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
  if(graph.nodes.length>200||graph.edges.length>600)throw new RangeError('Experimental limit: 200 nodes and 600 edges');
  const started=performance.now(),nodes=graph.nodes.map(n=>{
    if(!n||typeof n.id!=='string'||!n.id.length)throw new TypeError('Every node needs a nonempty string id');
    const width=n.width??150,height=n.height??44;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>2000||height>2000)throw new TypeError(`Invalid dimensions for ${n.id}`);
    return {id:n.id,width,height};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const index=new Map(nodes.map((n,i)=>[n.id,i]));if(index.size!==nodes.length)throw new TypeError('Duplicate node id');
  const edges=graph.edges.map(e=>{if(!e||!index.has(e.from)||!index.has(e.to))throw new TypeError('Edge references an unknown node');return [index.get(e.from),index.get(e.to)];});
  // Canonical edge order makes route selection independent of serialization.
  const order=edges.map((_,i)=>i).sort((i,j)=>edges[i][0]-edges[j][0]||edges[i][1]-edges[j][1]||i-j),canonical=order.map(i=>edges[i]);
  if(!nodes.length)return {positions:[],edges:[],frame:{x:0,y:0,w:96,h:96},metrics:{nodes:0,edges:0,placementScore:0,cardIntrusions:0,crossings:0,runtimeMs:performance.now()-started}};
  const search=place(nodes,canonical,options),placedAt=performance.now();
  let placed,routed,selectionScore=Infinity;
  for(const candidate of search.candidates??[search]){
    const routes=route(candidate.positions,canonical),quality=candidate.score+routes.metrics.cardIntrusions*100000+routes.metrics.crossings*13+routes.metrics.sharedLength/22;
    if(quality<selectionScore){placed=candidate;routed=routes;selectionScore=quality;}
  }
  const routedAt=performance.now(),edgeResult=Array(edges.length);order.forEach((old,i)=>edgeResult[old]=routed.edges[i]);
  const left=Math.min(...placed.positions.map(p=>p.x-p.width/2),routed.bounds?.left??Infinity)-32,top=Math.min(...placed.positions.map(p=>p.y-p.height/2),routed.bounds?.top??Infinity)-32,right=Math.max(...placed.positions.map(p=>p.x+p.width/2),routed.bounds?.right??-Infinity)+32,bottom=Math.max(...placed.positions.map(p=>p.y+p.height/2),routed.bounds?.bottom??-Infinity)+32;
  if([left,top,right,bottom].some(v=>Math.abs(v)>100000))throw new RangeError('Generated geometry exceeds the native coordinate range');
  return {positions:placed.positions,edges:edgeResult,frame:{x:Math.floor(left),y:Math.floor(top),w:Math.ceil(right)-Math.floor(left),h:Math.ceil(bottom)-Math.floor(top)},metrics:{nodes:nodes.length,edges:edges.length,placementScore:placed.score,selectionScore,restart:placed.restart,...routed.metrics,placementMs:placedAt-started,routingMs:routedAt-placedAt,runtimeMs:performance.now()-started}};
}

function arrangeDiagram(diagram,options={}) {
  if(!diagram||!diagram.nodes||typeof diagram.nodes!=='object'||Array.isArray(diagram.nodes))throw new TypeError('Expected a diagram with a node dictionary');
  const source=structuredClone(diagram),graph={nodes:Object.keys(source.nodes).map(id=>({id,width:150,height:44})),edges:source.edges??[]};
  const result=arrangeGraph(graph,options),oldFloats=new Map((source.floats??[]).map(f=>[f.id,f]));
  source.rows=[[]];source.floats=result.positions.map(p=>{
    const entry={...(oldFloats.get(p.id)??{}),id:p.id,side:'below',x:p.x,y:p.y};
    for(const key of ['dx','dy','noSpread'])delete entry[key];return entry;
  });
  source.edges=graph.edges.map((e,i)=>{const next={...e,...result.edges[i]};for(const key of ['curvePoints','bend','labelDx','labelDy'])delete next[key];return next;});
  source.graphFrame=result.frame;
  // Lane routing is incompatible with free cards. It is geometric state.
  if(source.routing==='lanes')delete source.routing;
  return {diagram:source,metrics:result.metrics};
}

/** Clone a full JSON spec, arranging each diagram; preserve all other data. */
function arrangeSpec(spec,options={}) {
  if(!spec||typeof spec!=='object'||Array.isArray(spec))throw new TypeError('Expected a JSON spec object');
  const output=structuredClone(spec),reports=[];
  if(output.nodes){const result=arrangeDiagram(output,options);return {spec:result.diagram,reports:[{path:'$',...result.metrics}]};}
  const page=Object.prototype.hasOwnProperty.call(output,'page')?output.page:output;
  if(!page||typeof page!=='object'||Array.isArray(page))throw new TypeError('Expected a page object');
  const key=page.blocks?'blocks':'sections',blocks=page[key],prefix=page===output?'$':'$.page';
  function section(value,path){
    if(value?.diagram?.nodes){const result=arrangeDiagram(value.diagram,options);value.diagram=result.diagram;reports.push({path:path+'.diagram',...result.metrics});}
  }
  if(Array.isArray(blocks))blocks.forEach((block,i)=>{
    const path=`${prefix}.${key}[${i}]`;
    if(Array.isArray(block?.tabs))block.tabs.forEach((tab,j)=>{if(Array.isArray(tab?.sections))tab.sections.forEach((value,k)=>section(value,`${path}.tabs[${j}].sections[${k}]`));});
    else section(block,path);
  });
  if(!reports.length)throw new TypeError('No diagrams found');return {spec:output,reports};
}
module.exports={arrangeGraph,arrangeDiagram,arrangeSpec};
