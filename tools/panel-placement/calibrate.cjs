'use strict';
const L=require('./layouts.cjs');
// Pure orchestration: callers supply the native measurer and validator. No
// scenario names, timers or random retries. Constraints only grow; repeated
// geometry must either validate or report an explicit unsupported condition.
async function calibrate(source,{solve,measure,validate,initial,maxIterations=8}){
 let observed=initial,previous='',result;const minimums={},seen=new Set(),measurements=new Map();
 function remember(spec,o){for(const p of o.panels){const width=L.layout(spec).find(t=>t.panel===p.key.slice(6)).w,cache=measurements.get(p.key)||{};cache[width]=Object.fromEntries(['chrome','paddingX','intrinsicHeight','extraHeight','nativeContent'].map(k=>[k,p[k]]));measurements.set(p.key,cache);p.byWidth=cache;}}
 remember(source,observed);
 for(let iteration=0;iteration<maxIterations;iteration++){
  result=solve(source,observed,minimums);observed=await measure(result.spec);remember(result.spec,observed);
  for(const p of observed.panels){const id=p.key.slice(6),tile=L.layout(result.spec).find(t=>t.panel===id),m=minimums[id]||{};if(p.overflowX>4)m.w=Math.max(m.w||0,tile.w+Math.ceil(p.overflowX/p.nativeColumnPitch));if(p.overflowY>4)m.h=Math.max(m.h||0,Math.ceil((p.neededHeight+8)/40));minimums[id]=m;}
  if(observed.controls.overflowY>4||observed.controls.clippedButtons)minimums.steps={h:Math.max(minimums.steps?.h||0,Math.ceil((observed.controls.neededHeight+8)/40))};
  if(observed.graph&&(observed.graph.clippedNodes||observed.graph.minimumLabelPx<8))minimums.diagram={h:(minimums.diagram?.h||result.metadata.graph.height)+2};
  const signature=L.stable(L.layout(result.spec));
  if(signature===previous){validate(result.spec,observed);return {...result,observed,calibration:{iterations:iteration+1,minimums}};}
  const state=signature+L.stable([...measurements]);if(seen.has(state))throw Error('Unsupported: measured sizing oscillated');seen.add(state);previous=signature;
 }
 throw Error('Unsupported: measured sizing did not converge within '+maxIterations+' iterations');
}
module.exports={calibrate};
