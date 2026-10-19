// Serialized desktop-only acceptance for the actual self-contained teaching page.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium,expect} from '../../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
import {chooseNavigation} from '../../../../../tools/browser-tests/helpers/test.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const spec=JSON.parse(await fs.readFile(path.join(here,'nsp15-insertion-evidence.spec.json'),'utf8'));
const output=process.env.BIANCO_SCREENSHOTS || '/tmp/bianco-svg-desktop-review';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const motion=scene=>scene.evaluate(root=>{
 const ambient=root.querySelector('.nspstory-ambient'),dot=ambient?.querySelector('.nspstory-ambient-primary');
 const matrix=dot&&new DOMMatrix(getComputedStyle(dot).transform),scale=dot?.getScreenCTM();
 return {transform:dot&&getComputedStyle(dot).transform,x:matrix&&matrix.e,y:matrix&&matrix.f,scale:scale&&Math.hypot(scale.a,scale.b),opacity:ambient&&getComputedStyle(ambient).opacity,duration:dot&&getComputedStyle(dot).animationDuration,
  times:root.getAnimations({subtree:true}).map(a=>a.currentTime),states:root.getAnimations({subtree:true}).map(a=>a.playState)};
});
try {
 for(const width of [1280,1440])for(const reducedMotion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width,height:width===1280?800:900},reducedMotion});
  const errors=[];
  await page.addInitScript(()=>localStorage.setItem('dv_tour_v1','done'));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route(/^https?:\/\//,route=>{errors.push('Unexpected network: '+route.request().url());return route.abort();});
  await page.goto(pathToFileURL(path.join(here,'nsp15-insertion-evidence.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  for(const tab of spec.page.blocks[0].tabs){
   if(process.env.BIANCO_REPORTER_ONLY && tab.label!=='Reporter')continue;
   const section=tab.sections[0];
   await chooseNavigation(page.locator('.reader-navigation'),'Tab',tab.label);
   const root=page.locator('#section-'+section.id);
   await expect(root).toBeVisible();
   if(!section.diagram)continue;
   const scene=root.locator('.nspstory'),svg=scene.locator('.nspstory-screen-frame');
   let reporterBounds=null;
   if(await scene.count())await scene.evaluate(el=>window.savedScience={root:el,svg:el.querySelector('.nspstory-screen-frame'),ambient:el.querySelector('.nspstory-ambient'),controls:el.querySelector('.nspstory-controls')});
   for(const step of section.id==='green-reporter'?[0,1,2,3,2,1,0]:[...section.diagram.steps.keys(),0]){
    if(section.id==='green-reporter')await scene.evaluate(el=>{
     window.reporterTransition=[];
     window.sampleReporter=when=>{const stage=el.querySelector('.nspstory-screen-frame').getBoundingClientRect(),card=el.closest('.pwidget').getBoundingClientRect();reporterTransition.push({when,stageWidth:stage.width,stageHeight:stage.height,cardWidth:card.width,cardHeight:card.height,stageTop:stage.top,cardTop:card.top});};
     sampleReporter('before');
     el.closest('.doc-sec').addEventListener('click',()=>{sampleReporter('click');requestAnimationFrame(()=>{sampleReporter('frame1');requestAnimationFrame(()=>sampleReporter('frame2'));});},{once:true});
    });
    await root.locator('[data-step-source="'+step+'"]').first().click();
    await root.locator('.dv-caption-old').waitFor({state:'detached'});
    await frame(page);
    if(await scene.count())await expect(scene).toHaveAttribute('data-phase',String(step));
    if(await svg.count()){
     assert.equal(await scene.locator('canvas').count(),0);
     assert(await scene.evaluate(el=>el===savedScience.root&&el.querySelector('.nspstory-screen-frame')===savedScience.svg&&el.querySelector('.nspstory-ambient')===savedScience.ambient&&el.querySelector('.nspstory-controls')===savedScience.controls),'Step preserves root, SVG, ambient layer and controls');
     const geometry=await svg.evaluate(el=>{const m=el.getScreenCTM(),r=el.getBoundingClientRect();return {tag:el.tagName,viewBox:el.getAttribute('viewBox'),x:Math.hypot(m.a,m.b),y:Math.hypot(m.c,m.d),width:r.width,height:r.height,opacity:getComputedStyle(el).opacity,sceneOpacity:getComputedStyle(el.querySelector('.nspstory-scene')).opacity};});
     const reporter=section.id==='green-reporter',viewWidth=reporter?560:760,viewHeight=reporter?610:410;
     assert.equal(geometry.tag,'svg');assert.equal(geometry.viewBox,'0 0 '+viewWidth+' '+viewHeight);
     assert(geometry.width>300&&geometry.height>120);
     assert(Math.abs(geometry.x/geometry.y-1)<.003,'Drawing preserves proportional scale');
     assert(geometry.x*viewWidth<=geometry.width+1&&geometry.y*viewHeight<=geometry.height+1,'Artwork fits without cropping');
     if(reporter){
      const transition=await scene.evaluate(()=>{sampleReporter('settled');return reporterTransition;});
      assert(transition.some(sample=>sample.when==='frame2'),'Transient geometry includes both animation frames');
      for(const sample of transition)for(const dimension of ['stageWidth','stageHeight','cardWidth','cardHeight'])assert(Math.abs(sample[dimension]-transition[0][dimension])<.1,'Reporter '+dimension+' never jumps during '+sample.when+' on step '+step);
      const bounds=await scene.evaluate(el=>{
       const rect=target=>{const r=target.getBoundingClientRect();return {width:r.width,height:r.height};};
       const svg=el.querySelector('.nspstory-screen-frame'),m=svg.getScreenCTM(),scale=Math.hypot(m.a,m.b);
       return {stage:rect(svg),card:rect(el.closest('.pwidget')),dock:rect(el.querySelector('.nspstory-dock')),caption:rect(el.querySelector('.nspstory-caption')),
        text:[...svg.querySelectorAll('text')].map(t=>{const b=t.getBBox();return {text:t.textContent,x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height,size:parseFloat(getComputedStyle(t).fontSize)*scale,primary:t.classList.contains('nspstory-small')};}),
        captionFits:el.querySelector('.nspstory-caption').scrollHeight<=el.querySelector('.nspstory-caption').clientHeight+1,
        contentFits:el.querySelector('.nspstory-caption').getBoundingClientRect().bottom<=el.closest('.pwidget').getBoundingClientRect().bottom-2};
      });
      if(!reporterBounds)reporterBounds={stage:bounds.stage,card:bounds.card,dock:bounds.dock,caption:bounds.caption};
      for(const key of ['stage','card','dock','caption'])for(const dimension of ['width','height'])assert(Math.abs(bounds[key][dimension]-reporterBounds[key][dimension])<.1,'Reporter '+key+' '+dimension+' stays stable through forward/reverse steps');
      assert(Math.abs(bounds.stage.width/bounds.stage.height-560/610)<.003,'Reporter has an independently authored near-square stage');
      assert(bounds.captionFits,'The reserved caption region contains all authored prose');
      assert(bounds.contentFits,'Reporter artwork, controls and caption all fit inside the card');
      for(const text of bounds.text){assert(text.x>=0&&text.y>=0&&text.right<=560&&text.bottom<=610,'Reporter text stays inside its drawing: '+text.text);if(text.primary)assert(text.size>=12,'Reporter teaching text remains readable: '+text.text);}
      await root.screenshot({path:path.join(output,width+'-'+reducedMotion+'-reporter-phase-'+step+'.png')});
     }
     assert.equal(geometry.opacity,'1');assert.equal(geometry.sceneOpacity,'1','Complete authored states have no entrance fade');
     const ambient=await scene.locator('.nspstory-ambient').count();
     if(reducedMotion==='reduce'){
      assert.deepEqual((await motion(scene)).times,[],'Reduced motion has no CSS timelines');
      if(ambient)await expect(scene.locator('[data-nsp-action="play"]')).toBeDisabled();
     }else if(ambient&&step===1){
      await scene.locator('[data-nsp-light="quiet"]').click();
      await scene.locator('[data-nsp-tempo="slow"]').click();
      await scene.locator('[data-nsp-action="replay"]').click();await frame(page);
      const quietStart=await motion(scene);await page.waitForTimeout(700);const quietEnd=await motion(scene);
      assert(Math.hypot(quietEnd.x-quietStart.x,quietEnd.y-quietStart.y)*quietStart.scale>1.5,'Quiet must visibly move at least 1.5 CSS pixels within 700 ms');
      assert(Number(quietStart.opacity)>=.35,'Quiet remains perceptible on the dark SVG stage');
      const moving=await motion(scene);await page.waitForTimeout(240);const moved=await motion(scene);
      assert(moved.times.length&&moved.times[0]>moving.times[0],'Ambient motion continues after the lesson step');
      assert.notEqual(moved.transform,moving.transform,'Decorative geometry visibly moves');
      await scene.locator('[data-nsp-action="pause"]').click();await frame(page);
      const paused=await motion(scene);await page.waitForTimeout(120);
      assert.deepEqual((await motion(scene)).times,paused.times,'Pause freezes every layer');
      await scene.locator('[data-nsp-light="quiet"]').click();const quiet=await motion(scene);
      await scene.locator('[data-nsp-light="lively"]').click();await scene.locator('[data-nsp-tempo="fast"]').click();
      const changed=await motion(scene);
      assert(Number(changed.opacity)>Number(quiet.opacity),'Bloom visibly changes intensity');
      assert.notEqual(changed.duration,paused.duration,'Brisk changes duration');
      assert.deepEqual(changed.times,paused.times,'Settings preserve the timeline');
      await scene.locator('[data-nsp-action="play"]').click();await frame(page);
      assert((await motion(scene)).states.every(state=>state==='running'));
      await scene.locator('[data-nsp-action="replay"]').click();await frame(page);
      assert((await motion(scene)).times.every(time=>time<200),'Replay restarts the decorative timeline');
      await scene.locator('[data-nsp-action="pause"]').click();
     }
     if(ambient&&step===2&&reducedMotion==='no-preference')await expect(scene).toHaveAttribute('data-playing','false');
     if(section.id==='limiting-dilution')assert.deepEqual(await svg.locator('[data-well]').evaluateAll(els=>els.map(e=>e.dataset.state)),
      ['candidate','empty','mixed','mixed','candidate','empty','empty','mixed','candidate']);
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
       tableOverflow:[...el.querySelectorAll('.swtablewrap')].filter(e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight+2).map(e=>({scroll:e.scrollHeight,client:e.clientHeight})),
       panels:panels.map(e=>({title:e.querySelector('.ptitle')?.textContent,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),
       clipped:[...el.querySelectorAll('.pwidget,.nspstory-dock,.swtablewrap')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2).map(e=>e.className)};
     });
     assert(geometry.overflow<=1,'No horizontal desktop page overflow');
     for(const p of geometry.panels)assert(p.left>=0&&p.right<=width+1,p.title+' stays in the desktop');
     assert.deepEqual(geometry.clipped,[],'Panel content fits its allocated width');
     assert.deepEqual(geometry.tableOverflow,[],'All evidence rows fit without an inner scroll');
     await root.screenshot({path:path.join(output,width+'-'+reducedMotion+'-'+section.id+'.png')});
    }
   }
   const hasScene=await scene.count(),saved=hasScene?await motion(scene):null;
   if(hasScene)await scene.evaluate(el=>{window.retiredScience=el;window.retiredAnimations=el.getAnimations({subtree:true});});
   results.push({width,reducedMotion,tab:tab.label,steps:section.diagram.steps.length});
   await chooseNavigation(page.locator('.reader-navigation'),'Tab','Sources');await frame(page);
   assert.equal(await page.locator('.nspstory-screen-frame').count(),0,'Inactive chapter bodies unmount');
   if(hasScene){
    assert(await page.evaluate(()=>retiredScience.dataset.motionLive==='false'&&retiredAnimations.every(a=>a.playState==='idle')),'Departure cancels every retained animation');
    await chooseNavigation(page.locator('.reader-navigation'),'Tab',tab.label);await frame(page);
    await expect(scene).toHaveAttribute('data-phase','0');
    if(reporterBounds){const returned=await svg.boundingBox();assert(Math.abs(returned.width-reporterBounds.stage.width)<.1&&Math.abs(returned.height-reporterBounds.stage.height)<.1,'Reporter stage preserves its geometry on tab return');results.push({width,reducedMotion,reporterBounds});}
    if(saved.times.length){
     assert.deepEqual((await motion(scene)).times,saved.times,'Tab return preserves the paused timeline');
     await expect(scene).toHaveAttribute('data-live-intensity','lively');await expect(scene).toHaveAttribute('data-live-tempo','fast');
    }
   }
  }
  if(reducedMotion==='no-preference'){
   await chooseNavigation(page.locator('.reader-navigation'),'Tab','Find source');
   await page.locator('#section-origin-map [data-step-source="3"]').first().click();
   const running=page.locator('.nspstory');
   await running.locator('[data-nsp-action="play"]').click();await page.waitForTimeout(100);
   const beforeDeparture=await motion(running);
   await running.evaluate(el=>{window.retiredScience=el;window.retiredAnimations=el.getAnimations({subtree:true});});
   await chooseNavigation(page.locator('.reader-navigation'),'Tab','Sources');await frame(page);
   assert(await page.evaluate(()=>retiredAnimations.every(a=>a.playState==='idle')&&retiredScience.getAnimations({subtree:true}).length===0),'Leaving a playing tab cancels all SVG animations');
   await chooseNavigation(page.locator('.reader-navigation'),'Tab','Find source');await frame(page);
   const returned=await motion(running);
   assert(returned.times[0]>=beforeDeparture.times[0]&&returned.times[0]<beforeDeparture.times[0]+1000,'Tab return resumes the decorative phase without entrance replay');
   assert(returned.states.every(state=>state==='running'));
   await expect(running).toHaveAttribute('data-phase','3');
   assert(await running.locator('.nspstory-screen-frame').evaluate(el=>getComputedStyle(el).opacity==='1'&&el.querySelector('.nspstory-scene').children.length>0),'Returned SVG is complete and opaque');
   await page.emulateMedia({reducedMotion:'reduce'});await frame(page);
   await expect(page.locator('.nspstory [data-nsp-action="play"]')).toBeDisabled();
   assert.deepEqual((await motion(page.locator('.nspstory'))).times,[],'Live reduced-motion change retires CSS motion');
  }
  await page.emulateMedia({media:'print'});
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.nspstory-print-frame')).toHaveCount(4);
  assert.equal(await page.locator('canvas').count(),0);
  assert(await page.locator('.nspstory').evaluateAll(els=>els.every(el=>el.getAnimations({subtree:true}).length===0)),'Print has no live motion');
  await page.screenshot({path:path.join(output,width+'-'+reducedMotion+'-print.png'),fullPage:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({media:'screen'});
  assert.deepEqual(errors,[],'Offline browser audit');
  await page.close();
 }
 console.log(JSON.stringify({checks:results,screenshots:output},null,2));
}finally{await browser.close();}
