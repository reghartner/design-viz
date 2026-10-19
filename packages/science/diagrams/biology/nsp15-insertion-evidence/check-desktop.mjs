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
   for(const [visit,step] of order.entries()){
    await controls.locator(`[data-step-source="${step}"]`).first().click();
    await root.locator('.dv-caption-old').waitFor({state:'detached'});
    assert((await controls.innerText()).includes(section.diagram.steps[step].text),`${section.id}/${step}: wrong narrative`);
    const scene=root.locator('.nspstory');
    if(await scene.count()){
     const screen=scene.locator('.nspstory-screen-frame');
     assert.equal(await scene.getAttribute('data-phase'),String(step),`${section.id}: visual phase must follow forward/back seek`);
     const atmosphere={
      'green-reporter':['on','medium','slow'],'limiting-dilution':['on','medium','normal'],
      'origin-map':['on','medium','slow'],'class-signature':['off','medium','slow']
     }[section.id];
     if(atmosphere)assert.deepEqual(await scene.evaluate(el=>[el.dataset.ambient,el.dataset.ambientIntensity,el.dataset.ambientTempo]),atmosphere,`${section.id}: authored ambient settings must reach rendering`);
     const animations=await scene.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.animationName));
     if(atmosphere&&atmosphere[0]==='on'&&section.id!=='limiting-dilution'){
      const presentation=await scene.evaluate(el=>{const ambient=el.querySelector('.nspstory-ambient');return {opacity:getComputedStyle(ambient).opacity,durations:el.getAnimations({subtree:true}).filter(a=>a.animationName==='nspAmbientDrift').map(a=>a.effect.getTiming().duration).sort((a,b)=>a-b)};});
      assert.equal(presentation.opacity,'0.3',`${section.id}: medium intensity must visibly reach the ambient layer`);
      if(reducedMotion==='no-preference')assert.deepEqual([...new Set(presentation.durations)],[14000,18000],`${section.id}: slow tempo must drive ambient timing`);
     }
     if(reducedMotion==='reduce')assert.deepEqual(animations,[],'Reduced motion must be still');
     if(reducedMotion==='no-preference'){
      const ambient=animations.filter(name=>name==='nspAmbientDrift');
      const teaching=animations.filter(name=>name!=='nspAmbientDrift');
      const ambientCount={'green-reporter':4,'limiting-dilution':0,'origin-map':4,'class-signature':0}[section.id];
      if(ambientCount!==undefined)assert.equal(ambient.length,ambientCount,`${section.id}: decorative ambient layer must stay separate from the teaching beat`);
      const expected={
       'green-reporter':[['nspArrive'],['nspSwitch'],['nspDescendant','nspDescendant'],[]],
       'limiting-dilution':[[],[],[],[]],
       'class-signature':[['nspRowFocus','nspEmphasis'],['nspRowFocus','nspEmphasis','nspReveal'],['nspRowFocus','nspEmphasis','nspReveal'],[]],
       'origin-map':[[],[],[],['nspProposal','nspFragment']]
      }[section.id];
      if(expected){
       const expectedNames=visit===0&&step===0?[]:expected[step];
       assert.deepEqual(teaching.sort(),expectedNames.slice().sort(),`${section.id}/${step}: only this phase's teaching beat may run`);
      }
     }
     if(section.id==='green-reporter'&&step===2){
      if(reducedMotion==='no-preference')await scene.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.animationName==='nspAmbientDrift').forEach(a=>{a.pause();a.currentTime=4500;}));
      await page.screenshot({path:path.join(output,`${viewport.width}-ambient-${reducedMotion==='reduce'?'reduced':'normal'}.png`)});
     }
     if(['limiting-dilution','origin-map'].includes(section.id)){
      const labels=await scene.locator('.nspstory-controls button').allTextContents();
      assert.deepEqual(labels,['Quiet','Glow','Bloom','Gentle','Normal','Brisk','Play','Pause','Replay'],`${section.id}: persistent scene controls`);
      if(reducedMotion==='reduce'){
       assert.equal(await scene.locator('[data-nsp-action="play"]').isDisabled(),true,`${section.id}: reduced motion disables playback`);
       assert.equal(await scene.locator('.nspstory-playback-status').textContent(),'Reduced motion · still');
      }else if(visit===0&&step===0){
       await scene.locator('[data-nsp-light="lively"]').click();
       await scene.locator('[data-nsp-tempo="fast"]').click();
       assert.deepEqual(await scene.evaluate(el=>[el.dataset.liveIntensity,el.dataset.liveTempo]),['lively','fast'],`${section.id}: reader controls must visibly override authored atmosphere`);
       if(section.id==='limiting-dilution'){
        const live=await screen.locator('canvas').evaluate(el=>({running:el.dataset.canvasRunning,reduced:el.dataset.canvasReduced,dpr:Number(el.dataset.canvasDpr),progress:Number(el.dataset.canvasProgress)}));
        assert.equal(live.running,'true','Bloom runs the Canvas story loop');
        assert.equal(live.reduced,'false');assert(live.dpr>=1&&live.dpr<=2,'Canvas uses bounded DPR scaling');assert(Number.isFinite(live.progress));
       }else{
        const live=await scene.evaluate(el=>({opacity:getComputedStyle(el.querySelector('.nspstory-ambient')).opacity,durations:el.getAnimations({subtree:true}).filter(a=>a.animationName==='nspAmbientDrift').map(a=>a.effect.getTiming().duration).sort((a,b)=>a-b)}));
        assert.equal(live.opacity,'0.48',`${section.id}: Bloom reaches ambient artwork`);
        assert.deepEqual([...new Set(live.durations)],[6500,8500],`${section.id}: Brisk reaches ambient timing`);
       }
       await page.screenshot({path:path.join(output,`${viewport.width}-${section.id}-bloom-brisk.png`)});
       await scene.locator('[data-nsp-action="pause"]').click();
       if(section.id==='limiting-dilution'){
        const before=await screen.locator('canvas').getAttribute('data-canvas-frame');await page.waitForTimeout(120);const after=await screen.locator('canvas').getAttribute('data-canvas-frame');assert.equal(after,before,'Pause freezes every Canvas layer');
       }else assert((await scene.evaluate(el=>el.getAnimations({subtree:true}).every(a=>a.playState==='paused'))),`${section.id}: Pause must stop current illustrative motion`);
       await scene.locator('[data-nsp-action="play"]').click();
       assert.equal(await scene.locator('[data-nsp-action="play"]').getAttribute('aria-pressed'),'true');
       await scene.locator('[data-nsp-action="replay"]').click();
       await scene.locator('[data-nsp-light="medium"]').click();
       await scene.locator(`[data-nsp-tempo="${section.id==='limiting-dilution'?'normal':'slow'}"]`).click();
      }
     }
     if(reducedMotion==='no-preference'&&section.id==='origin-map'&&step===3){
      const finiteSnapshot=async()=>scene.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>({name:a.animationName,state:a.playState,time:a.currentTime,end:a.effect.getComputedTiming().endTime})).sort((a,b)=>a.name.localeCompare(b.name)));
      await scene.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a=>a.finish()));
      const settled=await finiteSnapshot();
      assert(settled.length>0&&settled.every(a=>a.state==='finished'&&Math.abs(a.time-a.end)<1),`${section.id}: teaching beat must reach its settled state`);
      await scene.locator('[data-nsp-light="lively"]').click();
      await scene.locator('[data-nsp-tempo="fast"]').click();
      await scene.locator('[data-nsp-action="play"]').click();
      await scene.locator('[data-nsp-action="pause"]').click();
      await scene.locator('[data-nsp-action="play"]').click();
      const preserved=await finiteSnapshot();
      assert.deepEqual(preserved.map(a=>a.name),settled.map(a=>a.name),`${section.id}: completed teaching animations must stay present`);
      assert(preserved.every(a=>a.state==='finished'&&Math.abs(a.time-a.end)<1),`${section.id}: Light, Tempo and Play/Pause must not restart a completed teaching beat`);
      await scene.locator('[data-nsp-action="replay"]').click();
      const replayed=await finiteSnapshot();
      assert(replayed.length===settled.length&&replayed.every(a=>a.state!=='finished'&&a.time<a.end),`${section.id}: Replay alone must restart the completed teaching beat`);
      await scene.locator('[data-nsp-light="medium"]').click();
      await scene.locator('[data-nsp-tempo="slow"]').click();
     }
     if(reducedMotion==='no-preference'&&section.id==='limiting-dilution'&&step===1){
      const canvas=screen.locator('canvas');await page.waitForTimeout(240);await scene.locator('[data-nsp-action="pause"]').click();
      await scene.locator('[data-nsp-light="quiet"]').click();assert.equal(await canvas.getAttribute('data-canvas-running'),'false','Pause—not Quiet—owns the stopped state');
      await scene.locator('[data-nsp-action="play"]').click();await page.waitForTimeout(50);assert.equal(await canvas.getAttribute('data-canvas-running'),'true','Quiet changes appearance while Play keeps motion active');
      await scene.locator('[data-nsp-action="pause"]').click();const before=Number(await canvas.getAttribute('data-canvas-progress'));await scene.locator('[data-nsp-light="lively"]').click();await scene.locator('[data-nsp-tempo="fast"]').click();await page.waitForTimeout(35);
      const changed=Number(await canvas.getAttribute('data-canvas-progress'));assert(Math.abs(changed-before)<.01,`Tempo preserves normalized authored story progress (${before} → ${changed})`);
      const frozen=await canvas.getAttribute('data-canvas-frame');await page.waitForTimeout(120);assert.equal(await canvas.getAttribute('data-canvas-frame'),frozen,'Pause freezes the Canvas story');
      await scene.locator('[data-nsp-action="play"]').click();await page.waitForTimeout(100);assert.notEqual(await canvas.getAttribute('data-canvas-frame'),frozen,'Play resumes the paused Canvas story');
      await scene.locator('[data-nsp-action="replay"]').click();await page.waitForTimeout(35);assert(Number(await canvas.getAttribute('data-canvas-progress'))<.12,'Replay alone returns the Canvas story to its opening');
      await scene.locator('[data-nsp-light="medium"]').click();await scene.locator('[data-nsp-tempo="normal"]').click();
     }
     if(section.id==='limiting-dilution'&&step===2){
      await page.screenshot({path:path.join(output,`${viewport.width}-wells-${reducedMotion==='reduce'?'reduced':'normal'}.png`)});
      if(reducedMotion==='no-preference'){
       await scene.locator('.nspstory-disclosure summary').click();
       await page.screenshot({path:path.join(output,`${viewport.width}-wells-evidence-open.png`)});
       await scene.locator('.nspstory-disclosure summary').click();
      }
     }
     // Fixed values must agree with labels at the start, middle and end of the
     // emphasis animation. No bar may interpolate from another observation.
     if(reducedMotion==='no-preference'&&section.id==='class-signature'&&step===1){
      for(const time of [0,250,500]){
       await scene.evaluate((el,time)=>el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=time;}),time);
       const sampled=await screen.locator('[data-rate]').evaluateAll(els=>els.map(e=>({id:e.dataset.rate,width:e.getBBox().width})));
       const expected=[33.9,6.93,16.7,.2,.98,.99];
       sampled.forEach((bar,i)=>assert(Math.abs(bar.width-expected[i]*11.4)<.05,`${bar.id} changed geometry at ${time}ms`));
       const labels=(await screen.locator('.nspstory-value').allTextContents()).map(Number);
       assert.deepEqual(labels,expected,`Published labels must match the six sampled bars at ${time}ms`);
       await page.screenshot({path:path.join(output,`${viewport.width}-evidence-${time}ms.png`)});
      }
     }
     if(reducedMotion==='no-preference'&&section.id==='origin-map'&&step===3){
      for(const [label,time] of [['0',0],['25',425],['50',850],['75',1275],['end',1700]]){
       const sample=await screen.evaluate((svg,time)=>{const animations=svg.closest('.nspstory').getAnimations({subtree:true});const fragmentAnimation=animations.find(x=>x.animationName==='nspFragment');if(!fragmentAnimation)return null;animations.forEach(a=>a.pause());fragmentAnimation.currentTime=time;const fragment=svg.querySelector('.nspstory-fragment').getBoundingClientRect();const hit=[...svg.querySelectorAll('text')].filter(text=>{const b=text.getBoundingClientRect();return fragment.left<b.right&&fragment.right>b.left&&fragment.top<b.bottom&&fragment.bottom>b.top;}).map(text=>text.textContent);return {transform:getComputedStyle(svg.querySelector('.nspstory-fragment')).transform,hit};},time);
       assert(sample&&sample.transform!=='none',`Fragment must have a defined position at ${label}%`);
       assert.deepEqual(sample.hit,[],`Proposed fragment crossed text at ${label}%`);
       await page.screenshot({path:path.join(output,`${viewport.width}-proposed-${label}.png`)});
      }
     }
     await scene.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a=>a.finish()));
     if(section.id==='green-reporter')assert.equal(await screen.locator('.nspstory-green').count(),step===0?0:step===1?1:3,'Cell signal and descendants must reset');
     if(section.id==='limiting-dilution'){
      const wells=await screen.locator('.nspstory-canvas-outcome').evaluateAll(els=>els.map(el=>({well:el.dataset.well,state:el.dataset.state,label:el.textContent.trim()})));
      assert.deepEqual(wells,[
       {well:'1',state:'candidate',label:'candidate'},{well:'2',state:'empty',label:'empty'},{well:'3',state:'mixed',label:'mixed'},
       {well:'4',state:'mixed',label:'mixed'},{well:'5',state:'candidate',label:'candidate'},{well:'6',state:'empty',label:'empty'},
       {well:'7',state:'empty',label:'empty'},{well:'8',state:'mixed',label:'mixed'},{well:'9',state:'candidate',label:'candidate'}
      ],'All nine illustrative wells need a readable state marker and matching label');
      assert.equal(await screen.locator('canvas').count(),1,'The illustrative stage uses one bounded Canvas renderer');
      assert(!(await screen.textContent()).match(/\bWell [A-I]\b|probability of|per well/i),'Well scene must not imply named samples or quantitative outcomes');
     }
     if(section.id==='origin-map'){
      const originText=await screen.textContent();
      for(const label of ['MATCHING SOURCE','RECIPIENT / INSERTION','PROPOSED / NOT OBSERVED','inferred boundary / unexpected patch','dashed = inferred source link'])assert(originText.includes(label),`${section.id}: missing ${label}`);
      assert.equal(await screen.locator('.nspstory-source').count(),1,'Observed matching source must remain static');
      assert.equal(await screen.locator('.nspstory-insert').count(),1,'Observed recipient insertion must remain static');
      assert.equal(await screen.locator('.nspstory-match').count(),1,'Dashed source inference must remain visible');
      assert.equal(await screen.locator('.nspstory-fragment').count(),step===3?1:0,'Proposed fragment appears only in model step');
      if(step===3)assert(originText.includes('incorporation unresolved'));
     }
     if(section.id==='class-signature'){
      const widths=await screen.locator('[data-rate]').evaluateAll(els=>els.map(e=>e.getBBox().width));
      const expected=[33.9,6.93,16.7,.2,.98,.99].map(v=>v*11.4);
      widths.forEach((w,i)=>assert(Math.abs(w-expected[i])<.05,'Terminal bars must use the same truthful linear scale'));
     }
     // SVG text cannot silently escape the artwork's viewBox.
     const clipped=await scene.locator('svg text').evaluateAll(els=>els.filter(e=>{const b=e.getBBox();return b.x<0||b.y<0||b.x+b.width>760||b.y+b.height>410;}).map(e=>e.textContent));
     assert.deepEqual(clipped,[],`${section.id}: clipped scene labels`);
    }
    if(section.id==='analysis-ladder'){
     const guide=await root.locator('.pwidget').filter({hasText:'FIVE QUESTIONS'}).innerText();
     for(const label of ['1 · Read','2 · Find','3 · Match','4 · Compare','5 · Interpret'])assert(guide.includes(label),`${label} must remain visible`);
    }
    if(['green-reporter','limiting-dilution','origin-map'].includes(section.id)){
     const titles=await root.locator('.pwidget>.ptitle').allTextContents();
     assert(titles.some(title=>title.startsWith('ILLUSTRATIVE ·')),`${section.id}: conceptual layer heading missing`);
     assert(titles.some(title=>title.startsWith('EVIDENCE')),`${section.id}: adjacent evidence/limits heading missing`);
    }
    await controls.scrollIntoViewIfNeeded();
    const geometry=await root.evaluate(el=>{
     const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     const controls=el.querySelector('.termbar');
     return {section:box(el),controls:box(controls),buttons:[...controls.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(box),
      panels:[...el.querySelectorAll('.pwidget')].filter(e=>e.getClientRects().length).map(e=>({title:e.innerText.split('\n')[0],box:box(e)})),
      overflow:[...el.querySelectorAll('.pwidget,.panel-fill-scroll,.pimage,.pnote,.tlstate,.tlsub,.termbar,.nspstory,.nspstory-caption')].filter(e=>e.clientHeight>4&&e.clientWidth>4&&(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)).map(e=>({class:e.className,scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight]})),
      pageOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert(geometry.controls.top>=100&&geometry.controls.bottom<=viewport.height,`${section.id}/${step}: controls out of view`);
    for(const b of geometry.buttons)assert(b.left>=geometry.controls.left-1&&b.right<=geometry.controls.right+1&&b.top>=geometry.controls.top-1&&b.bottom<=geometry.controls.bottom+1,`${section.id}/${step}: button clipped ${JSON.stringify({b,controls:geometry.controls})}`);
    if(['limiting-dilution','origin-map'].includes(section.id)){
     const art=geometry.panels.find(p=>p.title.startsWith('ILLUSTRATIVE ·')),evidence=geometry.panels.find(p=>p.title.startsWith('EVIDENCE'));
     assert(art&&evidence,`${section.id}: stacked illustrative and evidence panels must render`);
     assert(art.box.left>=0&&art.box.right<=viewport.width+1&&art.box.top>=100,`${section.id}/${step}: full-width stage outside desktop reading flow ${JSON.stringify(art.box)}`);
     assert(evidence.box.left>=0&&evidence.box.right<=viewport.width+1&&evidence.box.top>=art.box.bottom-1,`${section.id}/${step}: raw evidence must sit beneath the stage ${JSON.stringify({art:art.box,evidence:evidence.box})}`);
     assert(Math.abs((art.box.right-art.box.left)-(evidence.box.right-evidence.box.left))<2,`${section.id}/${step}: stage and raw evidence must share full reading width`);
    }else for(const p of geometry.panels)assert(p.box.top>=100&&p.box.bottom<=viewport.height+1&&p.box.left>=0&&p.box.right<=viewport.width+1,`${section.id}/${step}: ${p.title} out of viewport ${JSON.stringify(p.box)}`);
    assert.deepEqual(geometry.overflow,[],`${section.id}/${step}: panel content clipped`);
    assert(geometry.pageOverflow<=1,'Horizontal page overflow');
    if(step!==0||results.every(r=>r.width!==viewport.width||r.section!==section.id||r.reducedMotion!==reducedMotion)){
     await page.screenshot({path:path.join(output,`${viewport.width}-${reducedMotion}-${index+1}-${step+1}.png`),animations:'disabled'});
     results.push({width:viewport.width,reducedMotion,section:section.id,step:step+1,panels:geometry.panels.length});
    }
    if(reducedMotion==='no-preference'&&step===2&&['limiting-dilution','origin-map'].includes(section.id))await root.screenshot({path:path.join(output,`${viewport.width}-${section.id}-fullwidth-reading-flow.png`),animations:'disabled'});
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
 const printSections=['green-reporter','limiting-dilution','class-signature','origin-map'];
 for(const [printIndex,id] of printSections.entries()){
  const index=spec.page.sections.findIndex(s=>s.id===id), selectedPhase=printIndex%4;
  await printPage.emulateMedia({media:'screen'});
  await printPage.getByRole('button',{name:spec.page.sections[index].heading,exact:true}).first().click();
  await printPage.locator('section.doc-sec').nth(index).locator(`[data-step-source="${selectedPhase}"]`).first().click();
  const scene=printPage.locator('section.doc-sec').nth(index).locator('.nspstory');
  await printPage.emulateMedia({media:'print'});
  assert.equal(await scene.evaluate(el=>el.getAnimations({subtree:true}).length),0,`${id}: print must not animate`);
  assert.equal(await scene.locator('.nspstory-screen-frame').evaluate(el=>getComputedStyle(el).display),'none',`${id}: selected screen frame must not print`);
  assert.equal(await scene.locator('.nspstory-print-frame').evaluate(el=>getComputedStyle(el).display),'block',`${id}: deterministic summary must print`);
  assert.equal(await scene.locator('.nspstory-print-frame').evaluate(el=>getComputedStyle(el).filter),'none',`${id}: print uses direct grayscale colors`);
  if(id==='green-reporter')assert((await scene.locator('.nspstory-print-frame').textContent()).includes('8/18 green isolates'));
  if(id==='limiting-dilution'){
   assert.equal(await scene.locator('.nspstory-print-frame .nspstory-well').count(),9,'Print keeps all nine well outcomes');
   assert((await scene.locator('.nspstory-print-frame').textContent()).includes('Candidate, not proof'));
  }
  if(id==='origin-map'){
   const printText=await scene.locator('.nspstory-print-frame').textContent();
   for(const label of ['MATCHING SOURCE','RECIPIENT / INSERTION','PROPOSED / NOT OBSERVED','incorporation unresolved'])assert(printText.includes(label),`Print origin summary missing ${label}`);
  }
  if(id==='class-signature'){
   const widths=await scene.locator('.nspstory-print-frame [data-rate]').evaluateAll(els=>els.map(e=>e.getBBox().width));
   [33.9,6.93,16.7,.2,.98,.99].forEach((v,i)=>assert(Math.abs(widths[i]-v*11.4)<.05,'Print bars keep all published values'));
   assert.equal(await scene.locator('.nspstory-print-frame .nspstory-wt').first().evaluate(el=>getComputedStyle(el).fill),'rgb(34, 34, 34)');
   assert.equal(await scene.locator('.nspstory-print-frame .nspstory-inactive').first().evaluate(el=>getComputedStyle(el).fill),'rgb(153, 153, 153)');
  }
  await printPage.screenshot({path:path.join(output,`print-${id}-phase-${selectedPhase}.png`),fullPage:true});
 }
 await printPage.close();
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({browser:browser.version(),checks:results},null,2));
 console.log(`PASS: ${results.length} distinct desktop states; backward seeks; full-width stage/evidence reading flow; no clipped panel content or browser/network errors. Screenshots: ${output}`);
} finally {await browser.close();}
