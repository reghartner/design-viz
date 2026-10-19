// Serialized desktop-only acceptance for the actual self-contained teaching page.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium,expect} from '../../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
import {chooseNavigation} from '../../../../../tools/browser-tests/helpers/test.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const spec=JSON.parse(await fs.readFile(path.join(here,'nsp15-insertion-evidence.spec.json'),'utf8'));
const output=process.env.BIANCO_SCREENSHOTS || '/tmp/bianco-desktop-review';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try {
 for(const width of [1280,1440])for(const reducedMotion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion});
  const errors=[];
  await page.addInitScript(()=>localStorage.setItem('dv_tour_v1','done'));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route(/^https?:\/\//,route=>{errors.push('Unexpected network: '+route.request().url());return route.abort();});
  await page.goto(pathToFileURL(path.join(here,'nsp15-insertion-evidence.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  for(const tab of spec.page.blocks[0].tabs){
   const section=tab.sections[0];
   await chooseNavigation(page.locator('.reader-navigation'),'Tab',tab.label);
   const root=page.locator('#section-'+section.id);
   await expect(root).toBeVisible();
   if(!section.diagram)continue;
   const scene=root.locator('.nspstory'),canvas=scene.locator('canvas');
   for(const step of [...section.diagram.steps.keys(),0]){
    await root.locator('[data-step-source="'+step+'"]').first().click();
    await root.locator('.dv-caption-old').waitFor({state:'detached'});
    await frame(page);
    if(await scene.count())await expect(scene).toHaveAttribute('data-phase',String(step));
    if(await canvas.count()){
     await canvas.scrollIntoViewIfNeeded();
     await expect(canvas).toHaveAttribute('data-canvas-live','true');
     await expect(canvas).toHaveAttribute('data-canvas-running',String(reducedMotion==='no-preference'));
     const box=await canvas.boundingBox();assert(box.width>300&&box.height>120,'Canvas must have usable desktop geometry');
     if(reducedMotion==='reduce'){
      await expect(scene.locator('[data-nsp-action="play"]')).toBeDisabled();
      await expect(canvas).toHaveAttribute('data-canvas-progress','1.000');
      const before=await canvas.getAttribute('data-canvas-frame');await frame(page);
      assert.equal(await canvas.getAttribute('data-canvas-frame'),before,'Reduced motion must not allocate recurring frames');
     }else if(step===1){
      await scene.locator('[data-nsp-action="pause"]').click();await frame(page);
      const before=await canvas.getAttribute('data-canvas-frame');
      await frame(page);assert.equal(await canvas.getAttribute('data-canvas-frame'),before,'Pause freezes every layer');
      const progress=Number(await canvas.getAttribute('data-canvas-progress'));
      await scene.locator('[data-nsp-light="lively"]').click();
      await scene.locator('[data-nsp-tempo="fast"]').click();await frame(page);
      assert.equal(Number(await canvas.getAttribute('data-canvas-progress')),progress,'Light and tempo preserve teaching progress');
      await expect(scene).toHaveAttribute('data-live-intensity','lively');
      await expect(scene).toHaveAttribute('data-live-tempo','fast');
      await scene.locator('[data-nsp-action="play"]').click();await frame(page);
      await expect(canvas).toHaveAttribute('data-canvas-running','true');
      await scene.locator('[data-nsp-action="replay"]').click();
     }
     if(section.id==='limiting-dilution'){
      assert.deepEqual(await scene.locator('.nspstory-screen-frame [data-well]').evaluateAll(els=>els.map(e=>e.dataset.state)),
       ['candidate','empty','mixed','mixed','candidate','empty','empty','mixed','candidate']);
     }
    }
    if(section.id==='class-signature'){
     const values=[33.9,6.93,16.7,.2,.98,.99];
     const widths=await scene.locator('.nspstory-screen-frame [data-rate]').evaluateAll(els=>els.map(e=>Number(e.getAttribute('width'))));
     assert.deepEqual(widths,values.map(v=>v*11.4),'Published values never interpolate');
    }
    if(step===0){
     const geometry=await root.evaluate(el=>{
      const panels=[...el.querySelectorAll('.pwidget')].filter(e=>e.getClientRects().length);
      return {overflow:document.documentElement.scrollWidth-innerWidth,
       panels:panels.map(e=>({title:e.querySelector('.ptitle')?.textContent,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),
       clipped:[...el.querySelectorAll('.pwidget,.nspstory-dock,.swtablewrap')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2).map(e=>e.className)};
     });
     assert(geometry.overflow<=1,'No horizontal desktop page overflow');
     for(const p of geometry.panels)assert(p.left>=0&&p.right<=width+1,p.title+' stays in the desktop');
     assert.deepEqual(geometry.clipped,[],'Panel content fits its allocated width');
     await root.screenshot({path:path.join(output,width+'-'+reducedMotion+'-'+section.id+'.png')});
    }
   }
   // Hold the departed Canvas so hidden-DOM removal alone cannot conceal a live loop.
   if(await canvas.count())await canvas.evaluate(el=>window.departedScienceCanvas=el);
   else await page.evaluate(()=>window.departedScienceCanvas=null);
   results.push({width,reducedMotion,tab:tab.label,steps:section.diagram.steps.length});
   await chooseNavigation(page.locator('.reader-navigation'),'Tab','Sources');
   await frame(page);
   assert.equal(await page.locator('.nspstory-canvas').count(),0,'Inactive chapter bodies are unmounted');
   const retired=await page.evaluate(()=>window.departedScienceCanvas&&({frame:departedScienceCanvas.dataset.canvasFrame,width:departedScienceCanvas.width,running:departedScienceCanvas.dataset.canvasRunning}));
   if(retired){assert.equal(retired.width,0);assert.equal(retired.running,'false');await frame(page);assert.equal(await page.evaluate(()=>departedScienceCanvas.dataset.canvasFrame),retired.frame);}
  }
  if(reducedMotion==='no-preference'){
   await chooseNavigation(page.locator('.reader-navigation'),'Tab','Find source');
   await page.locator('#section-origin-map [data-step-source="3"]').first().click();
   await page.emulateMedia({reducedMotion:'reduce'});await frame(page);
   await expect(page.locator('.nspstory [data-nsp-action="play"]')).toBeDisabled();
   await expect(page.locator('.nspstory-canvas')).toHaveAttribute('data-canvas-progress','1.000');
  }
  await page.emulateMedia({media:'print'});
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.nspstory-print-frame')).toHaveCount(4);
  assert.equal(await page.locator('canvas[data-canvas-running="true"]').count(),0,'Print releases all live Canvas resources');
  await page.screenshot({path:path.join(output,width+'-'+reducedMotion+'-print.png'),fullPage:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({media:'screen'});
  assert.deepEqual(errors,[],'Offline browser audit');
  await page.close();
 }
 console.log(JSON.stringify({checks:results,screenshots:output},null,2));
}finally{await browser.close();}
