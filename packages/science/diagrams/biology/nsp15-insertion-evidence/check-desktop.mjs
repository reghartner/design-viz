// Desktop-only, offline acceptance sweep. Requires the repository's pinned browser install.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '../../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const spec=JSON.parse(await fs.readFile(path.join(here,'nsp15-insertion-evidence.spec.json'),'utf8'));
const output=process.env.BIANCO_SCREENSHOTS || '/tmp/bianco-desktop-review';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
try {
 for(const viewport of [{width:1280,height:800},{width:1440,height:900}])for(const reducedMotion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport,reducedMotion});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route(/^https?:\/\//,route=>{errors.push('Unexpected network: '+route.request().url());return route.abort();});
  await page.goto(pathToFileURL(path.join(here,'nsp15-insertion-evidence.html')).href);
  const skip=page.getByText('Skip tour',{exact:true});if(await skip.isVisible())await skip.click();
  await page.evaluate(()=>document.fonts.ready);
  for(const [index,section] of spec.page.sections.entries()){
   await page.getByRole('button',{name:section.heading,exact:true}).first().click();
   await page.waitForTimeout(400); // allow the reader's smooth section scroll to settle
   if(!section.diagram){await page.screenshot({path:path.join(output,`${viewport.width}-${reducedMotion}-${index+1}-sources.png`)});continue;}
   const root=page.locator('section.doc-sec').nth(index);
   const controls=root.locator('.termbar');
   // Visit every step and then revisit the first to catch stale carried state.
   const order=[...section.diagram.steps.keys(),0];
   for(const step of order){
    await controls.locator(`[data-step-source="${step}"]`).first().click();
    await root.locator('.dv-caption-old').waitFor({state:'detached'});
    assert((await controls.innerText()).includes(section.diagram.steps[step].text),`${section.id}/${step}: wrong narrative`);
    const scene=root.locator('.nspstory');
    if(await scene.count()){
     assert.equal(await scene.getAttribute('data-phase'),String(step),`${section.id}: visual phase must follow forward/back seek`);
     const animations=await scene.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.animationName));
     if(reducedMotion==='reduce')assert.deepEqual(animations,[],'Reduced motion must be still');
     // Sample real CSS motion at a controlled midpoint, then settle. This tests
     // interpolation without depending on screenshots racing a wall-clock delay.
     if(reducedMotion==='no-preference'&&['reporter','dilution','evidence'].includes(await scene.getAttribute('data-scene'))&&step===1){
      assert(animations.length>0,`${section.id}: expected live animation`);
     }
     if(reducedMotion==='no-preference'&&section.id==='origin-map'&&step===3){
      const mid=await scene.evaluate(el=>{const a=el.getAnimations({subtree:true}).find(x=>x.animationName==='nspFragment');if(!a)return null;a.pause();a.currentTime=1400;return getComputedStyle(el.querySelector('.nspstory-fragment')).transform;});
      assert(mid&&mid!=='none'&&mid!=='matrix(1, 0, 0, 1, 0, 0)','Fragment must visibly move along proposed path');
      await page.screenshot({path:path.join(output,`${viewport.width}-proposed-mid-motion.png`)});
     }
     await scene.evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>a.finish()));
     if(section.id==='green-reporter')assert.equal(await scene.locator('.nspstory-green').count(),step===0?0:step===1?1:3,'Cell signal and descendants must reset');
     if(section.id==='limiting-dilution')assert.equal(await scene.locator('.nspstory-separate').count(),step===0?0:3,'Founder distribution must reset');
     if(section.id==='origin-map'){
      assert((await scene.innerText()).includes(step===0?'Tandem · nearby':'Distal · separated'),'Wrong donor/recipient arc');
      assert.equal(await scene.locator('.nspstory-fragment').count(),step===3?1:0,'Proposed fragment appears only in model step');
      if(step===3)assert((await scene.innerText()).includes('PROPOSED / NOT OBSERVED'));
     }
     if(section.id==='class-signature'){
      const widths=await scene.locator('[data-rate]').evaluateAll(els=>els.map(e=>e.getBBox().width));
      const expected=[33.9,6.93,16.7,.2,.98,.99].map(v=>v*11.4);
      widths.forEach((w,i)=>assert(Math.abs(w-expected[i])<.05,'Terminal bars must use the same truthful linear scale'));
     }
     // SVG text cannot silently escape the artwork's viewBox.
     const clipped=await scene.locator('svg text').evaluateAll(els=>els.filter(e=>{const b=e.getBBox();return b.x<0||b.y<0||b.x+b.width>760||b.y+b.height>410;}).map(e=>e.textContent));
     assert.deepEqual(clipped,[],`${section.id}: clipped scene labels`);
    }
    const geometry=await root.evaluate(el=>{
     const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     const controls=el.querySelector('.termbar');
     return {controls:box(controls),buttons:[...controls.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(box),
      panels:[...el.querySelectorAll('.pwidget')].filter(e=>e.getClientRects().length).map(e=>({title:e.innerText.split('\n')[0],box:box(e)})),
      overflow:[...el.querySelectorAll('.pwidget,.panel-fill-scroll,.pimage,.pnote,.tlstate,.tlsub,.termbar,.nspstory,.nspstory-caption')].filter(e=>e.clientHeight>4&&e.clientWidth>4&&(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)).map(e=>({class:e.className,scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight]})),
      pageOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert(geometry.controls.top>=100&&geometry.controls.bottom<=viewport.height,`${section.id}/${step}: controls out of view`);
    for(const b of geometry.buttons)assert(b.left>=geometry.controls.left-1&&b.right<=geometry.controls.right+1&&b.top>=geometry.controls.top-1&&b.bottom<=geometry.controls.bottom+1,`${section.id}/${step}: button clipped ${JSON.stringify({b,controls:geometry.controls})}`);
    for(const p of geometry.panels)assert(p.box.top>=100&&p.box.bottom<=viewport.height+1&&p.box.left>=0&&p.box.right<=viewport.width+1,`${section.id}/${step}: ${p.title} out of viewport`);
    assert.deepEqual(geometry.overflow,[],`${section.id}/${step}: panel content clipped`);
    assert(geometry.pageOverflow<=1,'Horizontal page overflow');
    if(step!==0||results.every(r=>r.width!==viewport.width||r.section!==section.id||r.reducedMotion!==reducedMotion)){
     await page.screenshot({path:path.join(output,`${viewport.width}-${reducedMotion}-${index+1}-${step+1}.png`),animations:'disabled'});
     results.push({width:viewport.width,reducedMotion,section:section.id,step:step+1,panels:geometry.panels.length});
    }
   }
  }
  assert.deepEqual(errors,[],'Offline browser errors');
  await page.close();
 }
 // A separate print surface avoids browser scroll anchoring from the print
 // reflow affecting screen viewport assertions above.
 const printPage=await browser.newPage({viewport:{width:1440,height:900}});
 await printPage.goto(pathToFileURL(path.join(here,'nsp15-insertion-evidence.html')).href);
 const printSkip=printPage.getByText('Skip tour',{exact:true});if(await printSkip.isVisible())await printSkip.click();
 const originIndex=spec.page.sections.findIndex(s=>s.id==='origin-map');
 await printPage.getByRole('button',{name:spec.page.sections[originIndex].heading,exact:true}).first().click();
 await printPage.locator('section.doc-sec').nth(originIndex).locator('[data-step-source="3"]').first().click();
 await printPage.emulateMedia({media:'print'});
 assert.equal(await printPage.locator('.nspstory').evaluateAll(els=>els.reduce((n,el)=>n+el.getAnimations({subtree:true}).length,0)),0,'Print must not animate any lesson');
 assert.equal(await printPage.locator('.nspstory-fragment').evaluate(el=>getComputedStyle(el).transform),'none','Print keeps final fragment position');
 await printPage.screenshot({path:path.join(output,'print-still.png'),fullPage:true});
 await printPage.close();
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({browser:browser.version(),checks:results},null,2));
 console.log(`PASS: ${results.length} distinct desktop states; backward seeks; controls/panels in viewport; no clipped panel content or browser/network errors. Screenshots: ${output}`);
} finally {await browser.close();}
