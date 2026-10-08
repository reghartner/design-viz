'use strict';
// Compatibility of the internal adapter name only: no browser measurements,
// subprocesses, package installation, runtime downloads or external resources.
const M=require('./model.cjs'),S=require('./solver.cjs'),E=require('./estimate.cjs');
async function createMeasurer(width){
 return {close:async()=>{},arrange:async(input,skin)=>{
  const source=M.clone(input),options=E.inputs(source,width);
  if(Object.keys(source.diagram.nodes||{}).length)source.diagram.graphFrame=M.clone(options.geometry.bounds);
  const result=S.solve(source,options),tiles=M.layout(result.spec),pitch=(options.geometry.gridWidth+8)/24;
  const panels=tiles.filter(t=>t.panel&&!t.hidden).map(t=>{const estimate=options.measurements[t.panel].byWidth[t.w];return {id:t.panel,model:estimate.model,estimatedBodyHeight:estimate.intrinsicHeight,boundedScrolling:estimate.scroll,estimatedFullHeight:estimate.fullHeight};});
  const graph=tiles.find(t=>!t.panel&&!t.controls&&!t.hidden),controls=tiles.find(t=>t.controls&&!t.hidden);
  return {spec:result.spec,diagnostics:{solver:S.VERSION,measurement:'spec-derived estimates; not native pixel verification',stateCount:options.states.length,skin,viewportScope:'estimated isolated section at requested host width; page chrome and fonts vary',graph:graph?{count:Object.keys(source.diagram.nodes||{}).length,bounds:options.geometry.bounds,estimatedLabelPx:12*Math.min((graph.w*pitch-72)/options.geometry.bounds.w,(graph.h*40-133)/options.geometry.bounds.h)*options.geometry.scale}:null,panels,controls:controls?{estimatedLines:options.stepDepth[controls.w].maxLines,estimatedBottom:options.geometry.gridTop+(controls.y+controls.h)*40*options.geometry.scale,withinEstimatedInitialViewport:options.geometry.gridTop+(controls.y+controls.h)*40*options.geometry.scale<=1000}:null,policy:result.metadata.policy}};
 }};
}
module.exports={createMeasurer};
