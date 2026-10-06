'use strict';
// Provisional, content-aware heuristics. Twelve human choices are not a fitted model.
const L=require('./layouts.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const SIZING=new Set(['residential-3','overview-3','capacity-3','video-2','health-2','experience-2']);
const CONTROLS=new Set(['warehouse-1','hardware-2','ingestion-3','security-1','api-1','distributed-1']);
function axis(id){if(SIZING.has(id))return 'panel-sizing';if(CONTROLS.has(id))return 'controls-placement';throw Error('Scenario is not in the focused round');}
function prior(panel,variant='compact'){
 const p=panel,initial=p.initial||{},rows=Math.max(p.fields?.length||0,p.checks?.length||0,p.tiles?.length||0,initial.rows?.length||0,initial.log?.length||0);
 const text=JSON.stringify({...p,title:undefined}).replace(/data:image\/[^" ]+/g,'').length;
 const defaults={state:[4,3],leds:[4,3],signal:[5,3],gauge:[4,3],battery:[4,3],thermo:[4,3],buffer:[4,3],queue:[5,3],orbit:[6,4],budget:[7,4],checks:[5,3],table:[7,4],tiles:[6,3],log:[5,4],xray:[9,5],phone:[4,9],deviceapp:[6,12],screen:[6,7],image:[8,6],appscreens:[8,6],homemap:[9,6],inflight:[7,5],replicas:[10,8],trace:[12,12],waterfall:[8,5],timeline:[8,5],'data-contract':[10,5],cost:[12,15],security:[14,17],dispatch:[14,13],radar:[8,5],zoneframe:[8,5]};
 let [w,h]=defaults[p.type]||[8,6];
 // Actual row count and verbose content can override a type's compact starting point.
 if(rows>3){w=Math.max(w,8);h=Math.max(h,Math.ceil(rows*.65)+2);}
 if(text>2400 && !['image','appscreens','security','dispatch','cost','trace'].includes(p.type)){w=Math.max(w,10);h=Math.max(h,8);}
 if(variant==='roomy'){w=Math.min(16,w+(['phone','deviceapp'].includes(p.type)?1:2));h+=rows>3?1:0;}
 return {w,h,rows,textBytes:text,reason:rows>3?'content rows':text>2400?'verbose content':'compact type prior'};
}
function graphBounds(d){const positions=d.floats||[];if(!positions.length)throw Error('Focused round requires frozen node positions');const xs=positions.map(p=>p.x),ys=positions.map(p=>p.y);return {x:Math.min(...xs)-75,y:Math.min(...ys)-22,w:Math.max(...xs)-Math.min(...xs)+150,h:Math.max(...ys)-Math.min(...ys)+44};}
function build(source,scenario,variant,policy,minimums={}){
 const spec=clone(source),d=L.diagram(spec),old=L.layout(source),graph=old.find(t=>!t.panel&&!t.controls),controls=old.find(t=>t.controls==='steps');
 if(!controls||controls.hidden||controls.attachTo)throw Error('Focused round requires visible detached controls');
 const bounds=graphBounds(d),narrow=bounds.w/bounds.h<1.4,video=scenario.id==='video-2';
 const graphW=narrow?(scenario.id==='warehouse-1'?14:scenario.id==='hardware-2'?13:scenario.host.width>=1200?9:11):12;
 const graphH=narrow?(scenario.id==='warehouse-1'?21:scenario.id==='hardware-2'?17:scenario.host.width>=1200?18:15):5;
 const sizes=Object.fromEntries(d.panels.map(p=>{const size=prior(p,variant),min=minimums[p.id]||{};return [p.id,{...size,w:Math.max(size.w,min.w||0),h:Math.max(size.h,min.h||0)}];}));
 const placed=new Map(),secondary=[],controlH=Math.max(3,minimums.steps?.h||0);let primaryH=0;
 function put(id,x,y,w,h){placed.set(id,{x,y,w,h});primaryH=Math.max(primaryH,y+h);}
 function packed(panels,x0,width,startY,cap){
  for(const p of panels){const sz=sizes[p.id],w=sz.w;let fit;if(w>width){secondary.push(p);continue;}
   for(let y=startY;y+sz.h<=cap&&!fit;y++)for(let x=x0;x+w<=x0+width;x++){
    if(![...placed.values()].some(r=>x<r.x+r.w&&x+w>r.x&&y<r.y+r.h&&y+sz.h>r.y)){fit={x,y,w,h:sz.h};break;}
   }
   if(fit)put(p.id,fit.x,fit.y,fit.w,fit.h);else secondary.push(p);
  }
 }

 if(scenario.id==='api-1'){put('diagram',0,0,24,5);secondary.push(...d.panels);}
 else if(video){
  // The tall frozen graph needs readable height. Controls precede the single compact panel row.
  put('diagram',0,0,24,25);secondary.push(...d.panels);
 }else if(!graph.hidden){
  put('diagram',0,0,graphW,Math.max(graphH,minimums.diagram?.h||0));
  if(['warehouse-1','hardware-2'].includes(scenario.id)){
   let y=0;for(const p of d.panels){const sz=sizes[p.id];put(p.id,graphW,y,24-graphW,sz.h);y+=sz.h;}
  }else packed(d.panels,graphW,24-graphW,0,Math.max(13,graphH));
 }else packed(d.panels,0,24,0,13);
 // Controls are an explicit band in the primary composition, before secondary reports.
 const shift=policy==='above-primary'?controlH:0;
 for(const rect of placed.values())rect.y+=shift;
 placed.set('steps',{x:0,y:policy==='above-primary'?0:primaryH,w:24,h:controlH});
 const secondaryStart=primaryH+controlH;
 if(video){const widths=variant==='compact'?[4,8,6,6]:[5,7,5,7];let x=0;d.panels.forEach((p,i)=>{placed.set(p.id,{x,y:secondaryStart,w:widths[i],h:sizes[p.id].h});x+=widths[i];});}
 for(const p of video?[]:secondary){const sz=sizes[p.id];let fit;
  for(let y=secondaryStart;y<500&&!fit;y++)for(let x=0;x+sz.w<=24;x++)if(![...placed.values()].some(r=>x<r.x+r.w&&x+sz.w>r.x&&y<r.y+r.h&&y+sz.h>r.y)){fit={x,y,w:sz.w,h:sz.h};break;}
  if(!fit)throw Error('Secondary packing exceeded bounds');placed.set(p.id,fit);
 }

 const next=old.map(t=>({...t,...(t.hidden?{}:placed.get(t.panel||t.controls||'diagram'))}));
 d.layouts[0].sectionLayout.default=next;L.check(spec);
 return {spec,metadata:{policy,variant,primaryRows:primaryH,secondaryIds:secondary.map(p=>p.id),graph:{narrow,bounds},priors:sizes}};
}
function pair(source,scenario,seed='round-2',minimums={}){
 const experimentAxis=axis(scenario.id),sizing=experimentAxis==='panel-sizing';
 const sizingPolicy=L.layout(source).find(t=>!t.panel&&!t.controls).hidden?'under-primary':'above-primary';
 const candidates=[build(source,scenario,'compact',sizing?sizingPolicy:'under-primary',minimums.compact||{}),build(source,scenario,sizing?'roomy':'compact',sizing?sizingPolicy:'above-primary',minimums[sizing?'roomy':'compact']||{})];
 const flip=parseInt(L.hash(seed+scenario.id).slice(0,2),16)%2,result={A:candidates[flip],B:candidates[1-flip],experimentAxis};
 L.checkPair(result.A.spec,result.B.spec);for(const label of ['A','B'])if(L.semantic(result[label].spec)!==L.semantic(source))throw Error('Frozen source content changed');
 if(!sizing){const sizes=s=>L.layout(s).filter(t=>t.panel).map(t=>[t.panel,t.w,t.h]);if(L.stable(sizes(result.A.spec))!==L.stable(sizes(result.B.spec)))throw Error('Controls comparison changed panel sizes');}
 return result;
}
function score(spec,observed){
 const tiles=L.layout(spec).filter(t=>!t.hidden),area=tiles.reduce((n,t)=>n+t.w*t.h,0),rows=Math.max(...tiles.map(t=>t.y+t.h));
 const packingWaste=1-area/(24*rows),panelWaste=observed.panels.reduce((n,p)=>n+p.emptyAreaFraction,0)/observed.panels.length;
 const controlsOutside=Math.max(0,observed.controls.bottom-1000),overflow=observed.panels.reduce((n,p)=>n+p.overflowX+p.overflowY,0),nodeClipping=observed.graph?.clippedNodes||0,readabilityDeficit=observed.graph?Math.max(0,8-observed.graph.minimumLabelPx):0,controlsClipping=(observed.controls.overflowX||0)+(observed.controls.overflowY||0),unreachable=observed.controls.reachableAfterScroll===false;
 return {packingWaste,panelWaste,controlsOutsideViewportPx:controlsOutside,contentOverflowPx:overflow,controlsClippingPx:controlsClipping,controlsReachable:!unreachable,clippedNodes:nodeClipping,minimumNodeLabelPx:observed.graph?.minimumLabelPx??null,
  penalty:Math.round(100*(packingWaste+panelWaste)+controlsOutside*10+overflow*100+nodeClipping*1000+readabilityDeficit*1000+controlsClipping*100+(unreachable?1000:0)),interpretation:'Provisional diagnostic penalty; not fitted preference probability'};
}
module.exports={axis,prior,graphBounds,build,pair,score,SIZING,CONTROLS};
