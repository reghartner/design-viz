'use strict';
const L=require('./model.cjs'),V2=require('./packing.cjs');
const VERSION='estimated-composition-1',clone=x=>JSON.parse(JSON.stringify(x)),key=t=>t.panel?'panel:'+t.panel:t.controls||'diagram';
function unpack(spec){const rows=L.layout(spec).filter(t=>!t.controls&&!t.hidden),end=Math.max(0,...rows.map(t=>t.y+t.h)),empty=[];for(let y=0;y<end;y++)if(!rows.some(t=>t.y<=y&&t.y+t.h>y))empty.push(y);return new Map(rows.map(t=>[key(t),{x:t.x,y:t.y-empty.filter(y=>y<t.y).length,w:t.w,h:t.h}]));}
function packingScore(map){const a=[...map.values()],end=Math.max(0,...a.map(t=>t.y+t.h)),unused=end*24-a.reduce((n,t)=>n+t.w*t.h,0);let cavity=0;for(let x=0;x<24;x++){let run=0;for(let y=0;y<end;y++){if(a.some(t=>x>=t.x&&x<t.x+t.w&&y>=t.y&&y<t.y+t.h))run=0;else cavity+=++run;}}return {height:end,unused,cavity,score:end*6+unused*.45+cavity*.06};}
function planControls(source,{geometry,packing=unpack(source),stepDepth={},controlPolicy=null,excludeLayout=null}={}){
 const old=L.layout(source),control=old.find(t=>t.controls==='steps');if(!control||control.hidden||control.attachTo)throw Error('Unsupported: detached controls required');
 const pitch=(geometry.gridWidth+8)/24,minWidth=Math.ceil(400/pitch),heights={};for(let w=minWidth;w<=24;w++)heights[w]=Math.max(3,Math.ceil(((stepDepth[w]?.neededHeight||110)+8)/40));
 const touched=new Set((L.diagram(source).steps||[]).flatMap(s=>Object.keys(s.panels||{}).map(id=>'panel:'+id))),candidates=[];
 for(const b of V2.controlBands(packing,heights[24],minWidth,heights)){
  if(stepDepth[b.control.w]?.unsupported)continue;
  if(controlPolicy&&b.kind!==controlPolicy)continue;if(b.control.h>40)continue;
  const placed=new Map(b.placed);placed.set('steps',b.control);const spec=clone(source);L.diagram(spec).sectionLayout.default=old.map(t=>({...t,...(t.hidden?{}:placed.get(key(t)))}));try{L.check(spec);}catch{continue;}
  if(excludeLayout){const previous=JSON.parse(excludeLayout),distance=L.layout(spec).reduce((sum,t,i)=>sum+['x','y','w','h'].reduce((n,k)=>n+Math.abs(t[k]-previous[i][k]),0),0);if(distance<6)continue;}
  const content=[...b.placed.values()],edge=V2.edgeMetrics(content,b.control),pack=packingScore(placed),depth=stepDepth[b.control.w]||{},bottom=geometry.gridTop+(b.control.y+b.control.h)*40*geometry.scale;
  const relevant=[...b.placed].filter(([id])=>touched.size?touched.has(id):id!=='diagram'),distance=relevant.reduce((n,[,r])=>n+Math.min(Math.abs(b.control.y+b.control.h-r.y),Math.abs(b.control.y-r.y-r.h)),0)/Math.max(1,relevant.length);
  // Narrative depth is measured in estimated wrapped lines across every step.
  // Deep narrow text is a reading task, not merely another button-sized tile.
  const lines=depth.maxLines||1,readingCost=Math.max(0,lines-3)*6+Math.max(0,(depth.neededHeight||110)-160)*.12;
  const topEdgeBonus=b.kind==='above-group'?edge.belowEdge*(pack.height<24?28:8):0;
  const score=pack.score+readingCost+(1-edge.solidEdge)*28+distance*1.4+Math.max(0,bottom-1000)*.3-edge.balance*(pack.height>24?48:6)-topEdgeBonus;
  const movement=old.filter(t=>!t.controls&&!t.hidden).map(t=>({key:key(t),deltaY:placed.get(key(t)).y-t.y}));
  candidates.push({spec,metadata:{version:VERSION,policy:b.kind,metrics:{...pack,score,readingCost,narrativeLines:lines,controlsBottomEstimate:bottom,relevanceDistanceRows:distance,...edge},controlDepth:depth,verticalMovement:movement,selectionRule:controlPolicy?'Best generic '+controlPolicy+' candidate for explicit feedback experiment':'Best control candidate for independently selected packing'}});
 }
 candidates.sort((a,b)=>a.metadata.metrics.score-b.metadata.metrics.score||L.stable(L.layout(a.spec)).localeCompare(L.stable(L.layout(b.spec))));if(!candidates.length)throw Error('Unsupported: no bounded distinct control placement');const result=candidates[0];if(L.semantic(result.spec)!==L.semantic(source))throw Error('Semantic identity changed');result.metadata.alternatives=candidates.slice(0,8).map(c=>({policy:c.metadata.policy,...c.metadata.metrics}));return result;
}
function solve(source,options){let packing,provenance;if(options.freezePacking){packing=unpack(source);provenance={rule:'Explicit frozen reference packing; dimensions and horizontal positions retained',sourceLayoutSha256:L.hash(L.stable(L.layout(source)))};}else{
  const candidates=[],failures=new Set();for(const controlPolicy of ['above-group','below-group','interior-band','column-band']){try{const x=V2.solve(source,{...options,controlPolicy,excludeLayout:null}),map=unpack(x.spec),p=packingScore(map),m=x.metadata.metrics;candidates.push({map,score:p.score+m.compression*80+m.growth*3+m.aspectWaste*12+(m.graphInterior?.emptyGridCells||0)*.85,source:x.metadata});}catch(e){if(!e.message.startsWith('Unsupported:'))throw e;failures.add(e.message);}}
  candidates.sort((a,b)=>a.score-b.score||L.stable([...a.map]).localeCompare(L.stable([...b.map])));if(!candidates.length)throw Error([...failures].join('; ')||'Unsupported: no generic packing');packing=candidates[0].map;provenance={rule:'Generic v2 packing candidates ranked without control-placement score',score:candidates[0].score,source:candidates[0].source};
 }
 if(!(L.diagram(source).steps||[]).length||L.diagram(source).view==='ambient-only'){const spec=clone(source);L.diagram(spec).sectionLayout.default=L.layout(spec).filter(t=>!t.controls).map(t=>({...t,...(t.hidden?{}:packing.get(key(t)))}));L.check(spec);return {spec,metadata:{version:VERSION,packing:provenance,policy:'ambient; no step controls'}};}
 const result=planControls(source,{...options,packing});result.metadata.packing=provenance;return result;
}
module.exports={VERSION,unpack,packingScore,planControls,solve};
