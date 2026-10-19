// Actual desktop acceptance for the compact schematic Reporter and its scan.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '../../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const output=process.env.BIANCO_SCREENSHOTS || '/tmp/bianco-compact-reporter';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch(),results=[];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const sample=page=>page.locator('.nspstory-reporter-scan').evaluate(el=>{
 const cursor=el.querySelector('.nspstory-scan-cursor');
 const active=[...cursor.querySelectorAll('.nspstory-scan-position')].find(e=>+getComputedStyle(e).opacity>.5);
 const rect=active?.querySelector('.nspstory-triplet-focus').getBoundingClientRect();
 return {position:active?.dataset.position,x:rect?.x,width:rect?.width,transform:getComputedStyle(cursor).transform,
  times:el.getAnimations({subtree:true}).map(a=>a.currentTime),states:el.getAnimations({subtree:true}).map(a=>a.playState)};
});
try{
 for(const width of [1280,1440])for(const reducedMotion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width,height:width===1280?800:900},reducedMotion}),errors=[];
  await page.addInitScript(()=>localStorage.setItem('dv_tour_v1','done'));
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(here,'nsp15-insertion-evidence.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  const root=page.locator('#section-green-reporter'),scene=root.locator('.nspstory');
  await scene.evaluate(el=>window.reporterNodes=[el,el.querySelector('.nspstory-screen-frame'),el.querySelector('.nspstory-scene'),el.querySelector('.nspstory-reporter-scan'),...el.querySelectorAll('.nspstory-letter-cell')]);
  let baseline;
  for(const phase of [0,1,2,3,2,1,0]){
   await root.locator('[data-step-source="'+phase+'"]').first().click();
   await root.locator('.dv-caption-old').waitFor({state:'detached'});
   const geometry=await scene.evaluate(el=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    return {stage:rect(el.querySelector('.nspstory-screen-frame')),card:rect(el.closest('.pwidget')),dock:rect(el.querySelector('.nspstory-dock')),
     cards:[...el.closest('.doc-sec').querySelectorAll('.pwidget')].map(rect),page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
     preserved:reporterNodes.every(node=>node.isConnected),scrolling:[...el.closest('.doc-sec').querySelectorAll('.pwidget,.pbody,.swtablewrap')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>e.className)};
   });
   assert(geometry.preserved,'Steps preserve every letter cell and the scan layer');
   assert.deepEqual(geometry.scrolling,[],'No tile or evidence scroll/overflow');
   assert(geometry.cards.every(r=>r.x>=0&&r.right<=width&&r.bottom<=(width===1280?800:900)),'Both tiles visible at desktop browser 100%');
   assert.deepEqual(geometry.page,[width,width===1280?800:900],'Page fits the viewport without overflow');
   if(!baseline)baseline=geometry;
   for(const key of ['stage','card','dock'])assert.deepEqual(geometry[key],baseline[key],'Fixed Reporter dimensions across phases');
   await page.screenshot({path:path.join(output,width+'-'+reducedMotion+'-phase-'+phase+'.png')});
  }
  if(reducedMotion==='reduce'){
   assert.equal(await scene.locator('[data-nsp-action="play"]').isDisabled(),true);
   const before=await sample(page);await page.waitForTimeout(1100);assert.deepEqual(await sample(page),before,'Reduced motion remains a complete static letter track');assert.deepEqual(before.times,[]);
  }else{
   await scene.locator('[data-nsp-action="replay"]').click();
   await page.waitForTimeout(50);const start=await sample(page);
   await page.waitForTimeout(1100);const moved=await sample(page);
   assert.equal(start.position,'1');assert.equal(moved.position,'4');assert(moved.x-start.x>50,'Numbered index and triplet highlight visibly travel together');
   await page.waitForTimeout(600);const transitioning=await sample(page);
   await page.waitForTimeout(120);const transitioned=await sample(page);
   assert.notEqual(transitioning.transform,transitioned.transform,'Cursor travels between groups, rather than merely flashing labels');
   await scene.locator('[data-nsp-action="pause"]').click();await settle(page);const paused=await sample(page);await page.waitForTimeout(250);assert.deepEqual(await sample(page),paused,'Pause freezes the actual numbered triplet scan');
   await root.locator('[data-step-source="1"]').first().click();await root.locator('.dv-caption-old').waitFor({state:'detached'});assert.deepEqual((await sample(page)).times,paused.times,'Step changes preserve the paused scan clock');
   await scene.locator('[data-nsp-action="play"]').click();await page.waitForTimeout(180);assert((await sample(page)).times[0]>paused.times[0]);
   await scene.locator('[data-nsp-action="replay"]').click();await page.waitForTimeout(50);const restart=await sample(page);assert.equal(restart.position,'1');assert(restart.times.every(t=>t<200),'Restart resets every scan timeline');
   await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual((await sample(page)).times,[],'Live reduced-motion change retires the scan');
   results.push({width,motion:{start,moved,restart}});
  }
  await page.emulateMedia({media:'print'});await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  const print=root.locator('.nspstory-print-frame');assert(await print.isVisible());assert.equal(await print.locator('.nspstory-letter').count(),40);assert.equal(await print.locator('.nspstory-reading-group').count(),14);
  assert.equal(await page.locator('.nspstory').evaluateAll(els=>els.reduce((n,el)=>n+el.getAnimations({subtree:true}).length,0)),0);
  await root.screenshot({path:path.join(output,width+'-'+reducedMotion+'-print.png')});
  assert.deepEqual(errors,[]);results.push({width,reducedMotion,geometry:baseline});await page.close();
 }
 console.log(JSON.stringify({results,screenshots:output},null,2));
}finally{await browser.close();}
