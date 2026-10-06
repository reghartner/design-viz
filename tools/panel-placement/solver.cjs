'use strict';
// Experimental contract solver. Inputs are panel declarations, frozen topology and
// native measured geometry, never corpus scenario IDs or hand-assigned rectangles.
const L=require('./layouts.cjs'),{graphBounds}=require('./adaptive.cjs');
const VERSION='contracts-v1';
const clone=v=>JSON.parse(JSON.stringify(v));
function contract(panel,registry){
 const layout=registry.get(panel.type)?.layout||{},declared=layout.sectionSizing;
 const result={minWidth:190,preferredWidth:layout.large?480:280,maxWidth:layout.large?1000:600,aspectPolicy:layout.canvasSizing?.mode==='fixed-aspect'?'fixed':'content',bodyAspect:layout.canvasSizing?.aspect,grow:layout.canvasSizing?.mode==='fixed-aspect'?0:1,...declared};
 const rows=Math.max(panel.fields?.length||0,panel.checks?.length||0,panel.tiles?.length||0,panel.initial?.rows?.length||0,panel.initial?.log?.length||0);
 if(result.aspectPolicy==='content'&&rows>4){result.preferredWidth=Math.max(result.preferredWidth,360);result.minWidth=Math.max(result.minWidth,250);result.maxWidth=Math.max(result.maxWidth,result.preferredWidth);}
 return {...result,rows,fallback:!declared};
}
function dimensions(c,w,pitch,measurement={},minimum={}){
 measurement=measurement.byWidth?.[w]||measurement;
 const nativeWidth=w*pitch-8,chrome=measurement.chrome||42,padding=measurement.paddingX||24;
 const available=Math.max(1,nativeWidth-padding-(c.bodyInset||0));
 let bodyHeight=c.aspectPolicy==='fixed'&&c.bodyAspect?available/c.bodyAspect+Math.max(c.bodyInset||0,measurement.extraHeight||0):measurement.intrinsicHeight||Math.max(58,c.rows*24);
 if(c.aspectPolicy==='intrinsic'&&measurement.nativeContent)bodyHeight=measurement.intrinsicHeight||measurement.nativeContent.height;
 return {w,h:Math.max(3,Math.ceil((bodyHeight+chrome+8)/40),minimum.h||0),nativeWidth,bodyHeight,chrome};
}
function rowFill(entries,width,pitch){
 let left=width-entries.reduce((n,e)=>n+e.w,0);
 while(left>0){const e=entries.filter(e=>e.c.grow>0&&(e.w+1)*pitch-8<=e.c.maxWidth).sort((a,b)=>a.w/a.c.grow-b.w/b.c.grow||a.order-b.order)[0];if(!e)break;e.w++;left--;}
 return entries;
}
function solve(source,{registry,geometry,measurements={},minimums={},snapshot=5}={}){
 if(!registry||!geometry||!(geometry.gridWidth>0&&geometry.scale>0))throw Error('Native geometry and registry required');
 const d=L.diagram(source),old=L.layout(source),graph=old.find(t=>!t.panel&&!t.controls),controls=old.find(t=>t.controls==='steps');
 if(!controls||controls.hidden||controls.attachTo)throw Error('Unsupported: solver needs detached visible controls');
 const pitch=(geometry.gridWidth+8)/24,bounds=graphBounds(d),graphVisible=!graph.hidden,controlH=Math.max(3,minimums.steps?.h||0);
 const measured=Object.fromEntries(Object.entries(measurements).map(([k,v])=>[k,v]));
 const panels=d.panels.filter(p=>!old.find(t=>t.panel===p.id)?.hidden).map((p,order)=>{
  const c=contract(p,registry),m=measured[p.id]||{},min=minimums[p.id]||{};
  let w=Math.max(Math.ceil((c.minWidth+8)/pitch),Math.round(((c.grow>0?c.minWidth:c.preferredWidth)+8)/pitch),min.w||0);
  // Fixed bodies cannot gain width merely to fill a row. Match their native
  // aspect with separate measured title/padding chrome and integer track height.
  if(w>24)throw Error('Unsupported: panel minimum width exceeds grid '+p.id);let size=dimensions(c,w,pitch,m,min);
  if(size.h>40)throw Error('Unsupported: panel exceeds maximum height '+p.id);
  return {id:p.id,order,c,m,min,...size};
 });
 const touched=new Set(Object.keys(d.steps?.[snapshot]?.panels||{}));
 const relevance=e=>touched.has(e.id)?4:e.c.aspectPolicy==='content'&&e.h<=7?2:1;
 const ordered=[...panels].sort((a,b)=>relevance(b)-relevance(a)||a.order-b.order);
 const labelTarget=10,graphScale=labelTarget/12/geometry.scale;
 const graphMinW=Math.ceil((bounds.w*graphScale+56+8)/pitch),graphH=Math.max(4,Math.ceil((bounds.h*graphScale+125+8)/40),minimums.diagram?.h||0);
 if(graphVisible&&(graphMinW>24||graphH>40))throw Error('Unsupported: frozen graph cannot meet preferred label size at this host');
 const widths=graphVisible?[...new Set([Math.max(6,graphMinW),Math.min(24,Math.max(6,graphMinW)+2),24])]:[0];
 const candidates=[];
 for(const mode of ['relevant-bands','compact-group'])for(const gw of widths)for(const policy of ['above-primary','under-primary']){
  const placed=new Map(),primary=[],secondary=[];let primaryH=graphVisible?graphH:0;
  if(graphVisible)placed.set('diagram',{x:0,y:0,w:gw,h:graphH});
  function rows(items,x0,width,start,cap){
   const pending=[...items],unplaced=[];
   for(const e of pending){
    let fit;const ys=[start,...[...placed.values()].map(r=>r.y+r.h).filter(y=>y>=start)].sort((a,b)=>a-b);
    for(const y of ys){for(let x=x0;x+e.w<=x0+width;x++)if(y+e.h<=cap&&![...placed.values()].some(r=>x<r.x+r.w&&x+e.w>r.x&&y<r.y+r.h&&y+e.h>r.y)){fit={x,y,w:e.w,h:e.h};break;}if(fit)break;}
    if(fit)placed.set(e.id,fit);else unplaced.push(e);
   }
   // Rebalance a row together so early panels can grow too. Reject expansion
   // if a panel in another band occupies the required rectangle.
   for(const y of [...new Set(pending.filter(e=>placed.has(e.id)).map(e=>placed.get(e.id).y))]){
    const group=pending.filter(e=>placed.has(e.id)&&placed.get(e.id).y===y).sort((a,b)=>placed.get(a.id).x-placed.get(b.id).x).map(e=>({...e,w:placed.get(e.id).w}));
    rowFill(group,width,pitch);let x=x0;const changes=new Map();for(const e of group){const sz=dimensions(e.c,e.w,pitch,e.m,e.min);changes.set(e.id,{x,y,w:e.w,h:sz.h});x+=e.w;}
    if([...changes.values()].every(r=>r.y+r.h<=cap&&![...placed.entries()].some(([id,q])=>!changes.has(id)&&r.x<q.x+q.w&&r.x+r.w>q.x&&r.y<q.y+q.h&&r.y+r.h>q.y)))for(const [id,r]of changes)placed.set(id,r);
   }
   return unplaced;
  }
  const primaryCandidates=mode==='compact-group'?[...ordered].sort((a,b)=>b.h-a.h||a.order-b.order):ordered.filter(e=>e.h<=Math.max(8,graphH)||touched.has(e.id));
  secondary.push(...ordered.filter(e=>!primaryCandidates.includes(e)));
  const leftover=rows(primaryCandidates,gw,24-gw,0,mode==='compact-group'?Math.max(graphVisible?graphH:0,...panels.map(e=>e.h))*2:graphVisible?graphH:12);secondary.push(...leftover);
  for(const e of panels)if(placed.has(e.id))primary.push(e.id);
  primaryH=Math.max(primaryH,...[...placed.values()].map(r=>r.y+r.h),0);
  if(!primaryH&&panels.length)continue;
  const shift=policy==='above-primary'?controlH:0;for(const r of placed.values())r.y+=shift;
  placed.set('steps',{x:0,y:policy==='above-primary'?0:primaryH,w:24,h:controlH});
  const rest=rows(secondary.sort((a,b)=>a.order-b.order),0,24,primaryH+controlH,500);if(rest.length)continue;
  const spec=clone(source);L.diagram(spec).layouts[0].sectionLayout.default=old.map(t=>({...t,...(t.hidden?{}:placed.get(t.panel||t.controls||'diagram'))}));
  try{L.check(spec);}catch{continue;}
  const rects=[...placed.values()],totalH=Math.max(...rects.map(r=>r.y+r.h)),occupied=rects.reduce((n,r)=>n+r.w*r.h,0),waste=24*totalH-occupied;
  const ct=placed.get('steps'),controlBottom=geometry.gridTop+(ct.y+ct.h)*40*geometry.scale;
  const relevant=panels.filter(e=>touched.size?touched.has(e.id):primary.includes(e.id));
  const distance=relevant.reduce((n,e)=>{const r=placed.get(e.id);return n+Math.min(Math.abs(ct.y+ct.h-r.y),Math.abs(ct.y-r.y-r.h));},0)/Math.max(1,relevant.length);
  // Under short primary groups is a useful boundary; overflow and distance can
  // outweigh that small preference. This is an explicit heuristic, not fitting.
  const aspectWaste=panels.reduce((n,e)=>{const r=placed.get(e.id),sz=dimensions(e.c,r.w,pitch,e.m,e.min),body=Math.max(1,r.h*40-8-sz.chrome);return n+(e.c.grow===0?Math.abs(body-sz.bodyHeight)/body:0);},0);
  const growth=panels.reduce((n,e)=>n+Math.max(0,(placed.get(e.id).w*pitch-8-e.c.preferredWidth)/e.c.preferredWidth),0);
  const score=totalH*10+waste*.5+aspectWaste*10+growth*2+Math.max(0,controlBottom-1000)*.5+distance*3+(policy==='above-primary'?8:0);
  candidates.push({spec,metadata:{version:VERSION,policy,grouping:mode,primaryIds:primary,secondaryIds:secondary.map(e=>e.id),graph:{bounds,width:gw,height:graphH,labelTarget},contracts:Object.fromEntries(panels.map(e=>[e.id,e.c])),metrics:{score,totalRows:totalH,unusedGridCells:waste,aspectWaste,growth,controlBottomEstimate:controlBottom,relevanceDistanceRows:distance},relevanceRule:touched.size?'current-step panel patches':'compact evidence in primary group'}});
 }
 if(!candidates.length)throw Error('Unsupported: no bounded placement');
 candidates.sort((a,b)=>a.metadata.metrics.score-b.metadata.metrics.score||L.stable(L.layout(a.spec)).localeCompare(L.stable(L.layout(b.spec))));
 const result=candidates[0];if(L.semantic(result.spec)!==L.semantic(source))throw Error('Solver changed frozen semantics');result.metadata.alternatives=candidates.map(c=>({policy:c.metadata.policy,graphWidth:c.metadata.graph.width,...c.metadata.metrics}));return result;
}
module.exports={VERSION,contract,dimensions,rowFill,solve};
