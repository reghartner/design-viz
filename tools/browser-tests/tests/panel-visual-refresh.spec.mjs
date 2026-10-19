import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{entrypoint,entrypointAssets,readSource}=require('../../source-loader.cjs');
const assets=entrypointAssets('native');
const script=entrypoint('native').body+'\n'+readSource('builder.workbench.js')+'\n'+readSource('panel-picker.workbench.js');
const html=`<!doctype html><meta charset="utf-8"><style>${assets.styles.map(a=>a.source).join('\n')}\nbody{margin:0;padding:20px}#gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}.pwidget{max-height:none}.audit-label{font:600 13px sans-serif;margin-bottom:8px;color:var(--dink)}</style>${assets.icons}<main class="docview" id="gallery"></main><script>${script.replace(/<\/script/gi,'<\\/script')}\nwindow.paint=(skin,width)=>{applySkinClasses(document.body,gallery,skin);gallery.innerHTML='';const ref=panelPickerReferenceImage();PANEL_CATALOG.forEach(e=>{const card=panelPickerPreview(e.type,ref,skin==='daylight'?'daylight':'aurora');card.dataset.type=e.type;card.style.width=(width||PanelRegistry.get(e.type).layout.sectionSizing.minWidth)+'px';gallery.append(card)});};</script>`;
for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint'])test('catalog renders at its own minimum and wider desktop panel sizes: '+skin,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(html);
 for(const width of [null,340,640]){
  await page.evaluate(({skin,width})=>paint(skin,width),{skin,width});
  await expect(page.locator('.pwidget')).toHaveCount(42);
  const bad=await page.locator('.pwidget').evaluateAll(cards=>cards.filter(c=>!c.textContent.trim()||c.offsetHeight<20||c.scrollWidth>c.clientWidth+2).map(c=>({type:c.dataset.type,width:c.clientWidth,overflow:c.scrollWidth-c.clientWidth})));
  expect(bad,'outer cards contain content; deliberate internal table scrollers remain allowed').toEqual([]);
 }
 expect(errors).toEqual([]);
 await page.evaluate(skin=>paint(skin,340),skin);
 await info.attach('catalog-'+skin,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.emulateMedia({media:'print'});
 expect(await page.locator('.screenbox .scene').first().evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(0);
});
test('new stock clips wait, play independently, preserve overlays, and offer stills',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setContent(html);
 await page.evaluate(()=>{
  applySkinClasses(document.body,gallery,'pastel');gallery.innerHTML='';
  window.clipHosts=['driveway-arrival','garage-opening','side-gate'].map(scene=>{const host=document.createElement('div');host.className='pbody';host.style.width='360px';gallery.append(host);const panel={id:scene,type:'screen',scene};renderPanelBody(host,panel,{mode:'rec',scenePlayback:'waiting'},'aurora',[],0,false);return {host,panel,scene:host.querySelector('.scene')};});
 });
 const subjects=['.driveway-car','.garage-moving','.side-gate-leaf'];
 for(const selector of subjects)expect(await page.locator(selector).evaluate(e=>e.getAnimations().length)).toBe(0);
 await expect(page.locator('.driveway-car')).toBeHidden();
 await page.evaluate(()=>clipHosts.forEach(({host,panel})=>renderPanelBody(host,panel,{mode:'rec',scenePlayback:'playing',spotlight:'on'},'aurora',[],0,false)));
 for(const selector of subjects){const el=page.locator(selector);await expect(el).toBeVisible();expect(await el.evaluate(e=>e.getAnimations().length)).toBeGreaterThan(0);}
 expect(await page.evaluate(()=>clipHosts.every(x=>x.scene===x.host.querySelector('.scene')))).toBe(true);
 await expect(page.locator('.recdot')).toHaveCount(3);
 const poses=await page.locator('.driveway-car,.garage-moving,.side-gate-leaf').evaluateAll(els=>els.map(e=>{const a=e.getAnimations()[0];a.pause();a.currentTime=0;const before=getComputedStyle(e).transform;a.currentTime=5000;return {before,after:getComputedStyle(e).transform};}));
 expect(poses.every(p=>p.before!==p.after)).toBe(true);
 await page.evaluate(()=>renderPanelBody(clipHosts[0].host,clipHosts[0].panel,{mode:'rec',scenePlayback:'waiting'},'aurora',[],0,false));
 expect(await page.locator('.garage-moving').evaluate(e=>e.getAnimations().length)).toBe(1);
 for(const media of [{reducedMotion:'reduce'},{reducedMotion:'no-preference',media:'print'}]){
  await page.emulateMedia(media);
  expect(await page.locator('.garage-moving,.side-gate-leaf').evaluateAll(els=>els.every(e=>e.getAnimations().length===0&&e.getBoundingClientRect().height>0))).toBe(true);
 }
});

// A native width promise includes panel chrome, not just the handset itself.
test('phone minimum retains its native handset width under every skin',async({page},info)=>{
 await page.setContent(html);
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await page.evaluate(skin=>{paint(skin,null);[...gallery.children].filter(e=>e.dataset.type!=='phone').forEach(e=>e.remove());},skin);
  const card=page.locator('.pt-phone'),frame=card.locator('.phoneframe');
  await card.evaluate(e=>{e.style.boxSizing='border-box';});
  expect(await card.evaluate(e=>e.getBoundingClientRect().width),skin).toBeCloseTo(254,0);
  expect(await frame.evaluate(e=>e.getBoundingClientRect().width),skin).toBeCloseTo(220,0);
  expect(await card.evaluate(e=>e.scrollWidth-e.clientWidth),skin).toBe(0);
  await card.screenshot({path:info.outputPath('phone-'+skin+'-minimum.png')});
 }
});
