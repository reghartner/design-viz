#!/usr/bin/env node
/* Coordinator-only check of the actual built native renderer. Source-free
   author kits use visibility-check.cjs without any browser dependencies. */
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {nativeViewerSource} from '../native-viewer-build.mjs';
import {createRequire} from 'node:module';
const visibility=createRequire(import.meta.url)('../visibility-check.cjs');

export async function watchBrowserEvidence(page,origin,issues){
    page.on('pageerror',error=>issues.push('pageerror: '+error.message));
    page.on('console',message=>{if(message.type()==='error')issues.push('console: '+message.text());});
    page.on('requestfailed',request=>issues.push('requestfailed: '+request.url()));
    page.on('response',response=>{if(response.status()>=400)issues.push('HTTP '+response.status()+': '+response.url());});
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(url===origin+'/' || url===origin+'/renderer.mjs')return route.continue();
      issues.push('blocked request: '+url);return route.abort();
    });
}

// Runs in the browser; trusted target addresses come only from panel definitions.
export function observeEvidence(target){
        const root=viewer.root;
        const section=Array.from(root.querySelectorAll('[data-dv-section]')).find(el=>Number(el.getAttribute('data-dv-section'))===target.sectionNumber-1);
        const panel=section && Array.from(section.querySelectorAll('.pwidget[data-dv-panel]')).find(el=>Number(el.getAttribute('data-dv-panel'))===target.panelIndex);
        // Whole-panel evidence measures the body: docked transport remains
        // visible when panelVisibility hides the panel's actual contents.
        let element=panel && panel.querySelector('.pbody');
        if(target.address && element)element=Array.from(element.querySelectorAll('*')).find(el=>el.getAttribute(target.address.attribute)===target.address.value);
        if(!element)return {visibility:'hidden',reason:'Rendered evidence element is absent'};
        for(let ancestor=element;ancestor;ancestor=ancestor.parentElement){
          const style=getComputedStyle(ancestor);
          if(ancestor.hidden || style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse' || Number(style.opacity)===0)
            return {visibility:'hidden',reason:'Element or ancestor is CSS-hidden'};
        }
        const rect=element.getBoundingClientRect();
        if(rect.width<=0 || rect.height<=0)return {visibility:'hidden',reason:'Element has no rendered area'};
        let clip={left:Math.max(0,rect.left),top:Math.max(0,rect.top),right:Math.min(innerWidth,rect.right),bottom:Math.min(innerHeight,rect.bottom)};
        for(let parent=element.parentElement;parent;parent=parent.parentElement){
          const style=getComputedStyle(parent),r=parent.getBoundingClientRect();
          if(/hidden|clip|auto|scroll/.test(style.overflowX)){clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}
          if(/hidden|clip|auto|scroll/.test(style.overflowY)){clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}
        }
        const area=Math.max(0,clip.right-clip.left)*Math.max(0,clip.bottom-clip.top),fraction=area/(rect.width*rect.height);
        if(fraction<0.999)return {visibility:area?'partial':'offscreen',reason:'Evidence is clipped by viewport or overflow ancestor',visibleAreaFraction:fraction};
        const points=[[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]];
        const hits=points.filter(([x,y])=>{const hit=root.elementFromPoint(rect.left+rect.width*x,rect.top+rect.height*y);return hit && (hit===element || element.contains(hit));}).length;
        return {visibility:hits===points.length?'visible':'occluded',reason:hits===points.length?'Full bounding box and five hit-test samples are visible':'Hit-test samples are occluded',visibleAreaFraction:fraction,unoccludedSamples:hits,totalSamples:points.length};

}

export async function auditVisibility(raw,expectations,{viewport={width:1440,height:1000}}={}){
  const logical=visibility.check(raw,expectations),issues=[];
  const source=await nativeViewerSource(); // Current production assembly, never a hand-written renderer.
  const html='<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0"><div id="host"></div><script type="module">import {mountNativeViewer} from "/renderer.mjs";window.mount=mountNativeViewer;</script></body></html>';
  const server=createServer((request,response)=>{
    const resource=request.url==='/renderer.mjs'?source:request.url==='/'?html:null;
    response.writeHead(resource===null?404:200,{'Content-Type':request.url==='/renderer.mjs'?'text/javascript':'text/html'});
    response.end(resource || 'Not found');
  });
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    try{browser=await chromium.launch();}catch(error){throw new Error('Chromium unavailable: run npm ci --prefix tools/browser-tests and npm run install:browser --prefix tools/browser-tests. '+error.message);}
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    await watchBrowserEvidence(page,origin,issues);
    await page.goto(origin+'/');await page.waitForFunction(()=>!!window.mount);
    let profile=null;
    const results=[];
    for(const entry of logical.results){
      const result={index:entry.index,target:entry.target,status:'not-checked',reason:entry.reason};
      // Invalid, unsupported and unreachable targets must never be navigated as
      // exact-preview jumps (which intentionally expose filtered author steps).
      if(!entry.resolved){results.push(result);continue;}
      const target=entry.resolved;
      if(profile!==target.profile){
        await page.evaluate(({raw,profile})=>{if(window.viewer)viewer.destroy();window.viewer=mount(document.querySelector('#host'),raw,{layoutTarget:profile,onWarning:message=>console.error(message)});}, {raw,profile:target.profile});
        profile=target.profile;
        await page.evaluate(()=>document.fonts.ready);
      }
      await page.evaluate(target=>{viewer.navigate(target);viewer.pause();const section=viewer.controller.sections.find(s=>s.reference===target.section);if(!section || !section.stepper || section.stepper.sourceIndex()!==target.sourceIndex || section.stepper.path()!==target.path)throw Error('Renderer navigation did not reach the requested source step');},target);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const measurement=await page.evaluate(observeEvidence,target);
      result.measurement=measurement;
      const observed=measurement.visibility==='visible';
      // Only actual absence/CSS-hidden qualifies as intentionally hidden.
      // Clipping/occlusion is a defect for either expectation, not hidden success.
      result.status=(entry.target.visible?observed:measurement.visibility==='hidden')?'pass':'fail';
      result.reason=measurement.reason;results.push(result);
    }
    return {version:1,kind:'rendered-visibility',ok:logical.ok && !issues.length && results.every(result=>result.status==='pass'),
      renderer:'native',rendererSha256:createHash('sha256').update(source).digest('hex'),viewport,browser:browser.version(),logical,results,issues,
      limitations:'Native renderer at the recorded viewport after normal section navigation. No scrolling of panels/cards to rescue evidence. Bounding-box clipping and five occlusion samples do not prove every pixel, legibility, value correctness or source truth; other hosts are untested.'};
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==2 || args.includes('--help')){console.error('Usage: node tools/browser-tests/visibility-audit.mjs SPEC.json EXPECTATIONS.json');process.exitCode=args.includes('--help')?0:2;}
  else try{const report=await auditVisibility(JSON.parse(await readFile(args[0],'utf8')),JSON.parse(await readFile(args[1],'utf8')));console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;}
  catch(error){console.error('visibility-audit: '+error.message);process.exitCode=2;}
}
