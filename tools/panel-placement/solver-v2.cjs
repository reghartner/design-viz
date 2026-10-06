'use strict';
// Generic experimental composition. No corpus IDs, audience labels or votes are
// inputs. v1 stays frozen in solver.cjs for audited fresh-case comparisons.
const L = require('./layouts.cjs');
const V1 = require('./solver.cjs');
const {graphBounds} = require('./adaptive.cjs');
const VERSION = 'control-bands-v2';
const clone = value => JSON.parse(JSON.stringify(value));
const overlaps = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;

function edgeMetrics(rectangles, control) {
  // Measure the occupied edge facing controls, not merely distance to a box.
  let above=0, below=0;
  for(let x=control.x;x<control.x+control.w;x++) {
    if(rectangles.some(r=>x>=r.x&&x<r.x+r.w&&r.y+r.h===control.y))above++;
    if(rectangles.some(r=>x>=r.x&&x<r.x+r.w&&r.y===control.y+control.h))below++;
  }
  const areaAbove=rectangles.reduce((n,r)=>n+r.w*Math.max(0,Math.min(r.h,control.y-r.y)),0);
  const areaBelow=rectangles.reduce((n,r)=>n+r.w*Math.max(0,Math.min(r.h,r.y+r.h-control.y-control.h)),0);
  return {solidEdge:Math.max(above,below)/control.w,aboveEdge:above/control.w,belowEdge:below/control.w,
    balance:Math.min(areaAbove,areaBelow)/Math.max(1,Math.max(areaAbove,areaBelow)),areaAbove,areaBelow};
}
function controlBands(base, controlHeight=3, minWidth=10, heights={}) {
  controlHeight=Math.max(controlHeight,heights[24]||0);
  const values=[...base.values()],end=Math.max(0,...values.map(r=>r.y+r.h));
  const result=[];
  function insert(cut) {
    // A full-width band must never split a tile. Crossing tiles are shifted
    // whole to the next band; cavity candidates below do not move other tiles.
    const map=new Map([...base].map(([key,r])=>[key,{...r}]));
    for(const r of map.values())if(r.y>=cut||r.y+r.h>cut)r.y=Math.max(cut,r.y)+controlHeight;
    result.push({placed:map,control:{x:0,y:cut,w:24,h:controlHeight},kind:cut===0?'above-group':cut===end?'below-group':'interior-band'});
  }
  for(const cut of [...new Set([0,end,...values.flatMap(r=>[r.y,r.y+r.h])])].sort((a,b)=>a-b))insert(cut);
  // Existing column cavities offer a central control band without moving or
  // truncating a long neighboring report. The native renderer measures wrap.
  for(const y of [...new Set([0,...values.map(r=>r.y+r.h)])]) {
    let x=0;
    while(x<24){while(x<24&&values.some(r=>overlaps({x,y,w:1,h:controlHeight},r)))x++;const start=x;
      while(x<24&&!values.some(r=>overlaps({x,y,w:1,h:controlHeight},r)))x++;
      const h=Math.max(3,heights[x-start]||0);
      if(x-start>=minWidth&&x-start<24&&!values.some(r=>overlaps({x:start,y,w:x-start,h},r)))result.push({placed:new Map([...base].map(([k,r])=>[k,{...r}])),control:{x:start,y,w:x-start,h},kind:'column-band'});
    }
  }
  return result;
}
function graphWaste(bounds,w,h,pitch,scale) {
  // Node geometry, not the surrounding graph tile, is occupied visual area.
  // Estimate the same height-limited camera fit conservatively; the native
  // capture still enforces node containment and its unchanged label floor.
  const width=w*pitch-8,height=h*40-133;
  const fit=Math.min((width-64)/Math.max(1,bounds.w),height/Math.max(1,bounds.h));
  const usedWidth=Math.min(width,bounds.w*Math.max(0,fit)+64);
  return {horizontalFraction:Math.max(0,1-usedWidth/width),emptyGridCells:Math.max(0,(width-usedWidth)/pitch*h),labelEstimate:12*fit*scale};
}
function solve(source,{registry,geometry,measurements={},minimums={},snapshot=5,excludeLayout=null,controlPolicy=null}={}) {
  if(controlPolicy&&!['above-group','below-group','interior-band','column-band'].includes(controlPolicy))throw Error('Unsupported: unknown control policy');
  if(!registry||!geometry||!(geometry.gridWidth>0&&geometry.scale>0))throw Error('Native geometry and registry required');
  const d=L.diagram(source),old=L.layout(source),g=old.find(t=>!t.panel&&!t.controls),ct=old.find(t=>t.controls==='steps');
  if(!ct||ct.hidden||ct.attachTo)throw Error('Unsupported: detached controls required');
  const pitch=(geometry.gridWidth+8)/24,bounds=graphBounds(d),graphVisible=!g.hidden;
  const graphScale=10/12/geometry.scale,minGraphW=Math.ceil((bounds.w*graphScale+64)/pitch);
  const graphH=Math.max(4,Math.ceil((bounds.h*graphScale+133)/40),minimums.diagram?.h||0);
  if(graphVisible&&(minGraphW>24||graphH>40))throw Error('Unsupported: frozen graph exceeds readable bounds');
  const widths=graphVisible?[...new Set([Math.max(6,minGraphW),Math.min(24,minGraphW+2),24])]:[0];
  const touched=new Set(Object.keys(d.steps?.[snapshot]?.panels||{}));
  const panels=d.panels.filter(p=>!old.find(t=>t.panel===p.id)?.hidden).map((p,order)=>{
    const c=V1.contract(p,registry),m=measurements[p.id]||{},min=minimums[p.id]||{},textLength=m.text?.length||0;
    // Actual snapshot content can make a nominally small type a detailed report.
    // Fixed-aspect surfaces retain their contract; they never stretch to fill.
    const preferred=c.grow>0&&textLength>220?Math.min(c.maxWidth,Math.max(c.preferredWidth,240+Math.sqrt(textLength)*7)):c.preferredWidth;
    return {id:p.id,order,c:{...c,preferredWidth:preferred},m,min,textLength};
  });
  const candidates=[];
  for(const strategy of ['minimum','preferred'])for(const ordering of ['prominent','tall-first','short-first'])for(const gw of widths) {
    const entries=panels.map(p=>{
      const target=strategy==='preferred'?p.c.preferredWidth:p.c.minWidth;
      const w=Math.max(Math.ceil((p.c.minWidth+8)/pitch),Math.round(((p.c.grow?target:p.c.preferredWidth)+8)/pitch),p.min.w||0);
      const size=V1.dimensions(p.c,w,pitch,p.m,p.min);
      if(w>24||size.h>40)throw Error('Unsupported: panel dimensions exceed grid '+p.id);
      return {...p,...size};
    });
    entries.sort((a,b)=>ordering==='tall-first'?b.h-a.h||a.order-b.order:ordering==='short-first'?a.h-b.h||a.order-b.order:(touched.has(b.id)-touched.has(a.id))||a.order-b.order);
    const base=new Map();if(graphVisible)base.set('diagram',{x:0,y:0,w:gw,h:graphH});
    for(const e of entries) {
      const ys=[0,...[...base.values()].map(r=>r.y+r.h)].sort((a,b)=>a-b);let found;
      for(const y of ys){for(let x=0;x+e.w<=24;x++)if(![...base.values()].some(r=>overlaps({x,y,w:e.w,h:e.h},r))){found={x,y,w:e.w,h:e.h};break;}if(found)break;}
      if(!found||found.y>500)throw Error('Unsupported: packing bounds');base.set(e.id,found);
    }
    // Grow a complete compatible row, then check every rectangle before applying.
    for(const y of [...new Set(entries.map(e=>base.get(e.id).y))]) {
      const group=entries.filter(e=>base.get(e.id).y===y).sort((a,b)=>base.get(a.id).x-base.get(b.id).x).map(e=>({...e,w:base.get(e.id).w}));
      const x0=base.get(group[0].id).x,available=24-x0;V1.rowFill(group,available,pitch);let x=x0;const changed=new Map();
      for(const e of group){const size=V1.dimensions(e.c,e.w,pitch,e.m,e.min);changed.set(e.id,{x,y,w:e.w,h:size.h});x+=e.w;}
      if([...changed.values()].every(r=>![...base].some(([id,q])=>!changed.has(id)&&overlaps(r,q))))for(const [id,r]of changed)base.set(id,r);
    }
    const controlH=Math.max(3,minimums.steps?.h||0);
    for(const band of controlBands(base,controlH,Math.ceil(400/pitch),minimums.stepsByWidth||{})) {
      if(controlPolicy&&band.kind!==controlPolicy)continue;
      const placed=band.placed;placed.set('steps',band.control);
      const spec=clone(source);L.diagram(spec).layouts[0].sectionLayout.default=old.map(t=>({...t,...(t.hidden?{}:placed.get(t.panel||t.controls||'diagram'))}));
      try{L.check(spec);}catch{continue;}
      if(excludeLayout){const previous=JSON.parse(excludeLayout),distance=L.layout(spec).reduce((n,t,i)=>n+['x','y','w','h'].reduce((v,k)=>v+Math.abs(t[k]-previous[i][k]),0),0);if(distance<6)continue;}
      const all=[...placed.values()],content=[...placed].filter(([id])=>id!=='steps').map(([,r])=>r),totalRows=Math.max(...all.map(r=>r.y+r.h)),occupied=all.reduce((n,r)=>n+r.w*r.h,0),unused=24*totalRows-occupied;
      const edge=edgeMetrics(content,band.control),controlBottom=geometry.gridTop+(band.control.y+band.control.h)*40*geometry.scale;
      const relevant=entries.filter(e=>touched.size?touched.has(e.id):true);
      const distance=relevant.reduce((n,e)=>{const r=placed.get(e.id);return n+Math.min(Math.abs(band.control.y+band.control.h-r.y),Math.abs(band.control.y-r.y-r.h));},0)/Math.max(1,relevant.length);
      const compression=entries.reduce((n,e)=>n+Math.max(0,(e.c.preferredWidth-(placed.get(e.id).w*pitch-8))/e.c.preferredWidth)*(1+Math.min(2,e.textLength/500)),0);
      const growth=entries.reduce((n,e)=>n+Math.max(0,(placed.get(e.id).w*pitch-8-e.c.preferredWidth)/e.c.preferredWidth),0);
      const aspectWaste=entries.reduce((n,e)=>{const r=placed.get(e.id),z=V1.dimensions(e.c,r.w,pitch,e.m,e.min),body=Math.max(1,r.h*40-8-z.chrome);return n+(e.c.grow===0?Math.abs(body-z.bodyHeight)/body:0);},0);
      // Penalize deep empty columns more than equal-area shallow row gaps.
      let cavityDepth=0;for(let x=0;x<24;x++){let run=0;for(let y=0;y<totalRows;y++){if(all.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h))run=0;else{run++;cavityDepth+=run;}}}
      const narrowControlPenalty=band.control.w<24?(24-band.control.w)/24*(totalRows<15?150:24):0;
      const graphInterior=graphVisible?graphWaste(bounds,gw,graphH,pitch,geometry.scale):{horizontalFraction:0,emptyGridCells:0,labelEstimate:null};
      const score=graphInterior.emptyGridCells*.85+narrowControlPenalty+totalRows*6+unused*.45+cavityDepth*.06+compression*80+growth*3+aspectWaste*12+(1-edge.solidEdge)*24+distance*1.5+Math.max(0,controlBottom-1000)*.25-edge.balance*(totalRows>18?65:8);
      candidates.push({spec,metadata:{version:VERSION,policy:band.kind,strategy,ordering,graph:{bounds,width:gw,height:graphH,labelTarget:10},contracts:Object.fromEntries(entries.map(e=>[e.id,e.c])),metrics:{score,graphInterior,narrowControlPenalty,totalRows,unusedGridCells:unused,cavityDepth,compression,growth,aspectWaste,controlBottomEstimate:controlBottom,relevanceDistanceRows:distance,...edge},relevanceRule:touched.size?'current-step panel patches':'all visible evidence, balanced around control band'}});
    }
  }
  const unique=new Map();for(const c of candidates){const key=L.stable(L.layout(c.spec));if(!unique.has(key)||c.metadata.metrics.score<unique.get(key).metadata.metrics.score)unique.set(key,c);}
  const ranked=[...unique.values()].sort((a,b)=>a.metadata.metrics.score-b.metadata.metrics.score||L.stable(L.layout(a.spec)).localeCompare(L.stable(L.layout(b.spec))));
  if(!ranked.length)throw Error('Unsupported: no distinct bounded composition');const result=ranked[0];
  if(L.semantic(result.spec)!==L.semantic(source))throw Error('Frozen semantic identity changed');
  result.metadata.alternatives=ranked.slice(0,12).map(c=>({policy:c.metadata.policy,...c.metadata.metrics}));result.metadata.selectionRule=(excludeLayout?'Best generic candidate excluding identical baseline geometry':'Best generic candidate')+(controlPolicy?' constrained to '+controlPolicy+' for explicit experiment':'');return result;
}
module.exports={VERSION,solve,edgeMetrics,controlBands,graphWaste};
