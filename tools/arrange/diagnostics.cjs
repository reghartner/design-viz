'use strict';
// Actionable concerns from existing spec-derived measurements. These are
// estimates, not browser observations; keep targets and remedies local.
const THRESHOLDS=Object.freeze({graphLabelPx:10,panelTextPx:8,initialViewportBottomPx:1000});
const BASIS='spec-derived estimate; not native pixel verification';
const rounded=value=>Math.round(value*100)/100;
function deviceItems(panel,key){
 const seen=new Set(),reserved=new Set(['phoneScreen','clock','date','note','notify','clear','notifications','constructor','prototype']);
 return (Array.isArray(panel?.[key])?panel[key]:[]).filter(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.id)||seen.has(item.id)||reserved.has(item.id))return false;
  seen.add(item.id);return true;
 }).slice(0,key==='sources'?6:12);
}
// A nominal role is diagnostic evidence only when production-equivalent
// normalized content paints that role in at least one reachable folded state.
// Unknown panel contracts are omitted until their visibility can be proved.
function visiblePanelFontRoles(panel,states,roles){
 if(panel?.type!=='deviceapp')return [];
 const fields=deviceItems(panel,'fields'),sources=deviceItems(panel,'sources'),visible=new Set();
 if(sources.length&&panel.showSources!==false)visible.add('detail'); // .da-source-fields is always painted.
 for(const entry of states||[]){
  const state=entry?.panels?.[panel.id]||{};if(state.phoneScreen==='home')continue;
  for(const field of fields){
   const value=state[field.id]&&typeof state[field.id]==='object'&&!Array.isArray(state[field.id])?state[field.id]:{};
   if(value.visible===false)continue;
   visible.add('metadata');if(typeof value.detail==='string'&&value.detail)visible.add('detail');
  }
 }
 return (roles||[]).filter(role=>visible.has(role));
}
function visibleNativeContent(panel,states,estimate){
 if(!estimate)return null;
 const roles=visiblePanelFontRoles(panel,states,Object.keys(estimate.estimatedFontPx||{}));
 return {...estimate,estimatedFontPx:Object.fromEntries(roles.map(role=>[role,estimate.estimatedFontPx[role]])),visibleFontRoles:roles};
}
function record(code,target,value,threshold,comparison,remedy,detail={}){
 return {code,level:'warning',basis:BASIS,target,actual:{value:rounded(value),unit:'CSS px'},threshold:{comparison,value:threshold,unit:'CSS px'},remedy,...detail};
}
function panelFonts(panel){
 const values=[];
 for(const [role,value] of Object.entries(panel.estimatedNativeContent?.estimatedFontPx||{}))if(Number.isFinite(value))values.push({role,value});
 const body=panel.nativeLimits?.estimatedBodyFontPx;if(Number.isFinite(body))values.push({role:'body',value:body});
 return values.sort((a,b)=>a.value-b.value||a.role.localeCompare(b.role));
}
function warnings({graph=null,panels=[],controls=null}={}){
 const result=[];
 if(Number.isFinite(graph?.estimatedLabelPx)&&graph.estimatedLabelPx<THRESHOLDS.graphLabelPx)result.push(record(
  'estimated-small-graph-label','graph',graph.estimatedLabelPx,THRESHOLDS.graphLabelPx,'minimum',
  'Review the rendered graph at the target host. If labels are too small, recompose for a wider host or simplify the selected graph without changing its meaning.'
 ));
 for(const panel of panels){
  const fonts=panelFonts(panel);if(!fonts.length||fonts[0].value>=THRESHOLDS.panelTextPx)continue;
  result.push(record('estimated-small-panel-text','panel:'+panel.id,fonts[0].value,THRESHOLDS.panelTextPx,'minimum',
   'Review this panel at the target host. Use a wider host or place essential evidence in an existing readable field; native caps, truncation and scrolling remain unchanged.',
   {fontRoles:fonts.filter(font=>font.value<THRESHOLDS.panelTextPx).map(font=>font.role)}));
 }
 if(Number.isFinite(controls?.estimatedBottom)&&controls.estimatedBottom>THRESHOLDS.initialViewportBottomPx)result.push(record(
  'estimated-controls-below-initial-viewport','controls:steps',controls.estimatedBottom,THRESHOLDS.initialViewportBottomPx,'maximum',
  'Review the initial viewport. If the step controls must appear immediately, make a scoped layout repair around the controls; they remain available through normal page scrolling.'
 ));
 return result;
}
module.exports={THRESHOLDS,BASIS,visiblePanelFontRoles,visibleNativeContent,panelFonts,warnings};
