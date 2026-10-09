'use strict';
// Compatibility of the internal adapter name only: no browser measurements,
// subprocesses, package installation, runtime downloads or external resources.
const M=require('./model.cjs'),S=require('./solver.cjs'),E=require('./estimate.cjs'),P=require('./packing.cjs'),V=require('./contracts.cjs'),D=require('./diagnostics.cjs');
async function createMeasurer(width){
 return {close:async()=>{},arrange:async(input,skin)=>{
  const source=M.clone(input),options=E.inputs(source,width);
  if(Object.keys(source.diagram.nodes||{}).length)source.diagram.graphFrame=M.clone(options.geometry.bounds);
  const result=S.solve(source,options),tiles=M.layout(result.spec),pitch=(options.geometry.gridWidth+8)/24;
  const panels=tiles.filter(t=>t.panel&&!t.hidden).map(t=>{const estimate=options.measurements[t.panel].byWidth[t.w],panel=source.diagram.panels.find(p=>p.id===t.panel),contract=V.contract(panel,options.registry),size=V.dimensions(contract,t.w,pitch,estimate),nativeContent=V.nativeContentEstimate(contract,size,t.h*40-8,estimate,options.geometry.scale);return {id:t.panel,model:estimate.model,estimatedBodyHeight:size.bodyHeight,boundedScrolling:estimate.scroll,estimatedNativeContent:D.visibleNativeContent(panel,options.states,nativeContent),estimatedFullHeight:estimate.scroll?estimate.fullHeight:size.bodyHeight,nativeLimits:estimate.nativeLimits?{...estimate.nativeLimits,...(estimate.nativeLimits.nominalBodyFontPx?{estimatedBodyFontPx:estimate.nativeLimits.nominalBodyFontPx*options.geometry.scale}:{})}:null};});
  const graph=tiles.find(t=>!t.panel&&!t.controls&&!t.hidden),controlsTile=tiles.find(t=>t.controls&&!t.hidden);
  const graphDiagnostic=graph?{count:Object.keys(source.diagram.nodes||{}).length,bounds:options.geometry.bounds,estimatedLabelPx:P.graphWaste(options.geometry.bounds,graph.w,graph.h,pitch,options.geometry.scale).labelEstimate}:null;
  const controls=controlsTile?{estimatedLines:options.stepDepth[controlsTile.w].maxLines,estimatedTrackHeight:options.stepDepth[controlsTile.w].trackHeight,estimatedEvidenceHeight:options.stepDepth[controlsTile.w].evidenceHeight,estimatedRuntimeHeight:options.stepDepth[controlsTile.w].runtimeHeight,estimatedBottom:options.geometry.gridTop+(controlsTile.y+controlsTile.h)*40*options.geometry.scale,withinEstimatedInitialViewport:options.geometry.gridTop+(controlsTile.y+controlsTile.h)*40*options.geometry.scale<=D.THRESHOLDS.initialViewportBottomPx}:null;
  return {spec:result.spec,diagnostics:{solver:S.VERSION,measurement:'spec-derived estimates; not native pixel verification',stateCount:options.states.length,skin,targetWidth:width,resizeScope:'single target width only; Auto scales graph height with width while saved tile rows stay fixed; recompose or review after host resizing',viewportScope:'estimated isolated section with 80px total horizontal host inset; page chrome, skin width caps, embed overrides and fonts vary',graph:graphDiagnostic,panels,controls,warnings:D.warnings({graph:graphDiagnostic,panels,controls}),policy:result.metadata.policy}};
 }};
}
module.exports={createMeasurer};
