'use strict';
const fs=require('node:fs'),path=require('node:path');
const M=require('./model.cjs'),S=require('./solver.cjs');
const SETUP='Run the one-time setup: node tools/arrange/setup.cjs';
async function createMeasurer(width){
 let chromium;
 try{const pkg=require('./node_modules/playwright-core/package.json');if(pkg.version!=='1.63.0')throw Error('wrong version');({chromium}=require('./node_modules/playwright-core'));}catch{throw Error('Pinned native measurement runtime is missing. '+SETUP);}
 const payload=path.join(__dirname,'generated-native.html');if(!fs.existsSync(payload))throw Error('Native measurement payload missing; rebuild with python3 tools/build.py or download a current authoring kit');
 let browser;try{browser=await chromium.launch({headless:true});}catch(e){throw Error('Pinned Chromium could not start. '+SETUP+'\n'+e.message);}
 const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{errors.push('Unsupported: external asset '+r.request().url()+'; embed required assets as data URLs before arranging');return r.abort();});
 await page.setContent(fs.readFileSync(payload,'utf8'));
 async function paint(spec,skin){const result=await page.evaluate(arg=>window.arrangementNative.paint(arg),{diagram:spec.diagram,skin});if(errors.length)throw Error(errors.join('\n'));return result;}
 async function observations(states){const results=[];for(const state of states)results.push(await page.evaluate(s=>window.arrangementNative.observe(s),state));if(errors.length)throw Error(errors.join('\n'));return results;}
 async function arrange(source,skin){
  source=M.clone(source);
  let initial=await paint(source,skin);
  for(const p of source.diagram.panels||[])if(!initial.registry[p.type])throw Error('Unsupported: panel type '+p.type+' is not registered in this runtime; use a matching authoring kit');
  if(initial.states.length>200)throw Error('Unsupported: more than 200 path/step states; split independent stories before arranging');
  const states=await observations(initial.states),frames=states.map(o=>o.graph?.contentBounds).filter(Boolean);
  if(frames.length){
   const x=Math.floor(Math.min(...frames.map(f=>f.x))),y=Math.floor(Math.min(...frames.map(f=>f.y)));
   const frame={x,y,w:Math.ceil(Math.max(...frames.map(f=>f.x+f.w)))-x,h:Math.ceil(Math.max(...frames.map(f=>f.y+f.h)))-y};
   if(Object.values(frame).some(n=>!Number.isFinite(n)||Math.abs(n)>100000)||frame.w<=0||frame.h<=0)throw Error('Unsupported: native graph framing exceeds bounded coordinates');
   source.diagram.graphFrame=frame;
   initial=await paint(source,skin);
  }
  const registry={get:type=>initial.registry[type]},geometry=initial.geometry;
  if(!(geometry.gridWidth>0&&geometry.scale>0))throw Error('Unsupported: native Standard grid not measurable');
  const measurements={},stepDepth={},minimums={},seen=new Set();let current=source;
  function remember(spec,observed){
   for(const o of observed)for(const p of o.panels){const w=M.layout(spec).find(t=>t.panel===p.id).w,m=measurements[p.id]||(measurements[p.id]={byWidth:{}}),previous=m.byWidth[w];
    if(!previous||p.intrinsicHeight>previous.intrinsicHeight)m.byWidth[w]=p;
    if(!m.text||p.text.length>m.text.length)m.text=p.text;
    Object.assign(m,{...m.byWidth[w],text:m.text,byWidth:m.byWidth});
   }
  }
  // Probe every feasible narrative width in the real step caption, across every
  // path and source step. Ambient is measured too, including no-step diagrams.
  const controlMin=Math.ceil(400/((geometry.gridWidth+8)/24));
  if((source.diagram.steps||[]).length&&source.diagram.view!=='ambient-only'){for(let w=controlMin;w<=24;w++){
   const probe=M.clone(source),t=M.layout(probe).find(t=>t.controls);t.w=w;t.h=40;
   await paint(probe,skin);const observed=await observations(initial.states);remember(probe,observed);
   const depths=observed.map(o=>o.controls).filter(Boolean);if(!depths.length)throw Error('Unsupported: authored steps have no measurable native controls');
   stepDepth[w]={neededHeight:Math.max(...depths.map(d=>d.neededHeight)),maxLines:Math.max(...depths.map(d=>d.maxLines)),unsupported:depths.some(d=>d.overflowX>4)};
  }}else remember(source,await observations(initial.states));
  let result;
  for(let iteration=0;iteration<8;iteration++){
   result=S.solve(source,{registry,geometry,measurements,minimums,stepDepth});current=result.spec;
   await paint(current,skin);const observed=await observations(initial.states);remember(current,observed);
   let changed=false;const failures=[];
   for(const o of observed){
    for(const p of o.panels){const t=M.layout(current).find(t=>t.panel===p.id),m=minimums[p.id]||(minimums[p.id]={});
     if(p.overflowX>4){m.w=Math.max(m.w||0,t.w+Math.ceil(p.overflowX/((geometry.gridWidth+8)/24)));changed=true;}
     if(p.overflowY>4){m.h=Math.max(m.h||0,Math.ceil((p.neededHeight+8)/40));changed=true;}
     // Native bounded scrolling is allowed; hidden overflow is not silently
     // treated as successfully fitted content.
     if(p.nestedOverflow.length)failures.push(p.id+' clips internal content in '+JSON.stringify(o.state)+': '+JSON.stringify(p.nestedOverflow));
    }
    if(o.controls&&(o.controls.clipped||o.controls.overflowX>4))failures.push('Step caption/buttons clip in '+JSON.stringify(o.state));
    if(o.graph&&o.graph.clipped){minimums.diagram={h:Math.max(minimums.diagram?.h||0,Math.ceil(o.graph.requiredHeight/40))};changed=true;}
    if(o.graph&&o.graph.minimumLabelPx!=null&&o.graph.minimumLabelPx<8)failures.push('Default native graph labels below 8px ('+o.graph.minimumLabelPx.toFixed(1)+')');
   }
   const signature=M.stable(M.layout(current));
   const expected=M.layout(current).filter(t=>t.panel&&!t.hidden).map(t=>t.panel).sort();
   for(const o of observed)if(M.stable(o.panels.map(p=>p.id).sort())!==M.stable(expected))failures.push('Native panel visibility differs from selected arrangement in '+JSON.stringify(o.state));
   if(!changed){if(failures.length)throw Error('Unsupported: '+[...new Set(failures)].join('; '));return {spec:current,diagnostics:{solver:S.VERSION,iterations:iteration+1,stateCount:observed.length,skin,viewportScope:'isolated section at requested host width; document scroll position is not measured',graph:observed.filter(o=>o.graph).map(o=>({state:o.state,...o.graph})),panels:expected,controls:observed.filter(o=>o.controls).map(o=>({state:o.state,bottom:o.controls.bottom,withinInitialViewport:o.controls.bottom<=1000})),policy:result.metadata.policy}};}
   if(seen.has(signature))throw Error('Unsupported: native content does not fit the bounded layout; '+failures.join('; '));seen.add(signature);
  }
  throw Error('Unsupported: native measured layout did not converge within 8 iterations');
 }
 return {arrange,close:()=>browser.close()};
}
module.exports={createMeasurer};
