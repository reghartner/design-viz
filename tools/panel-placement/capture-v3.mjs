import {createCapture} from './capture.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),L=require('./layouts.cjs');
// Native step-mode narrative, not section overview prose. No CSS fit overrides.
export async function createCaptureV3(){
 const base=await createCapture();
 async function inspectSteps(spec){return base.page.evaluate(async count=>{
  const states=[],tile=document.querySelector('[data-layout-key="steps"]'),bar=tile.querySelector('.termbar'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  for(let i=0;i<count;i++){
   window.ctl.sections[0].stepper.jump(i);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const caption=bar.querySelector('.step-text'),tr=rect(tile),br=rect(bar),scale=tr.width/tile.offsetWidth,walker=document.createTreeWalker(caption,NodeFilter.SHOW_TEXT),fragments=[];let n;while(n=walker.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width&&r.height)fragments.push({x:r.x,y:r.y,right:r.right,bottom:r.bottom});}
   const children=[...bar.children].filter(e=>!e.hidden).map(rect),bottom=Math.max(br.y,...children.map(r=>r.bottom),...fragments.map(r=>r.bottom)),neededHeight=(bottom-tr.y)/scale+parseFloat(getComputedStyle(bar).paddingBottom)+2;
   const buttons=[...bar.querySelectorAll('button')].filter(b=>!b.hidden&&b.getBoundingClientRect().width),out=r=>r.x<Math.max(tr.x,br.x)-1||r.right>Math.min(tr.right,br.right)+1||r.y<Math.max(tr.y,br.y)-1||r.bottom>Math.min(tr.bottom,br.bottom)+1;
   const lines=new Set(fragments.map(r=>Math.round(r.y*2)/2)).size;
   states.push({step:i,text:caption.textContent,textLength:caption.textContent.length,lines,neededHeight,captionClipped:fragments.filter(out).length,buttonsClipped:buttons.filter(b=>out(rect(b))).length,minimumTextPx:parseFloat(getComputedStyle(caption).fontSize)*scale,overflowX:Math.max(0,bar.scrollWidth-bar.clientWidth),overflowY:Math.max(0,bar.scrollHeight-bar.clientHeight),state:'native Step mode; full caption shown; no disclosure collapsed'});
  }
  return {states,neededHeight:Math.max(...states.map(s=>s.neededHeight)),maxLines:Math.max(...states.map(s=>s.lines)),worstStep:states.reduce((a,b)=>b.neededHeight>a.neededHeight?b:a).step};
 },L.diagram(spec).steps.length);}
 async function paint(spec,s,camera=null){const observed=await base.paint(spec,s,camera);observed.narrative=await inspectSteps(spec);await base.paint(spec,s,camera);return observed;}
 async function measureWidths(spec,s,geometry){const depth={},pitch=(geometry.gridWidth+8)/24;for(let w=Math.ceil(400/pitch);w<=24;w++){const probe=structuredClone(spec),tiles=L.layout(probe),c=tiles.find(t=>t.controls==='steps');Object.assign(c,{x:0,y:Math.max(...tiles.filter(t=>!t.controls&&!t.hidden).map(t=>t.y+t.h)),w,h:3});await base.paint(probe,s);depth[w]=await inspectSteps(probe);}await base.paint(spec,s);return depth;}
 return {...base,paint,measureWidths,inspectSteps,narrativePolicy:'Measure every authored step in native Step mode at each candidate control width; preserve snapshot5 for comparison capture'};
}
