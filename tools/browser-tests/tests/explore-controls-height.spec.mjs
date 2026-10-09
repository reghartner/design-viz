import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const starter=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
function fixture(placement,count=6,width=720,position='below'){
 const raw=structuredClone(starter),d=raw.page.sections[0].diagram;
 d.autoplay=false;d.defaultLayout='service-flow';
 for(let i=2;i<count;i++)d.paths.push({...structuredClone(d.paths[0]),id:'path-'+i,label:'Path '+(i+1)});
 Object.assign(d.layouts[1].exploreLayout,{controlsPlacement:placement,steps:{textPosition:position},canvas:{controls:{x:0,y:500,w:width,h:220}}});
 return raw;
}
async function open(page,server,raw,host){
 if(host==='workbench'){await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);}
 else if(host==='native'){
  await writeFile(path.join(server.root,'height-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'height-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./height-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/height-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},raw);
 }else{
  const input=path.join(server.root,'height.json'),output=path.join(server.root,'height.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/height.html');
 }
 await expect(page.locator('.explore-player')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
const player=page=>page.locator('.explore-player');
const metrics=page=>player(page).evaluate(el=>{
 const chips=el.querySelector('.schips'),caption=el.querySelector('.stepline:not(.dv-caption-old)'),bar=el.querySelector('.termbar'),timeline=chips.querySelector('.path-timeline,.path-matrix');
 return {height:el.offsetHeight,width:el.offsetWidth,x:el.style.getPropertyValue('--float-x'),y:el.style.getPropertyValue('--float-y'),chips:chips.clientHeight,tracks:timeline.offsetHeight,overflow:chips.scrollHeight-chips.clientHeight,caption:caption.clientHeight,barOverflow:bar.scrollHeight-bar.clientHeight,captionVisible:caption.getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom+1};
});
for(const host of ['workbench','reader','native'])for(const placement of ['canvas','floating'])test(host+' '+placement+': taller Explore controls expose all paths and the caption',async({page,server},info)=>{
 await page.setViewportSize({width:1280,height:800});await open(page,server,fixture(placement),host);
 await player(page).locator('.path-chip').nth(1).press('Enter');
 await player(page).getByRole('button',{name:'Next step',exact:true}).press('Enter');
 const selected=await player(page).locator('.path-chip[aria-pressed="true"]').textContent();
 const graph=page.locator('.explore-board .boardcanvas>svg'),graphWidth=(await graph.boundingBox()).width;
 const source=host==='workbench'?await page.locator('#src').inputValue():null;
 const initial=await metrics(page),step=await player(page).locator('.stepid').textContent();
 for(const height of [1100,1400,800]){
  await page.setViewportSize({width:1280,height});
  await expect.poll(async()=>{const m=await metrics(page);return m.overflow;}).toBeLessThanOrEqual(1);
  const m=await metrics(page);expect(m.caption).toBeGreaterThanOrEqual(34);expect(m.captionVisible).toBe(true);expect(m.barOverflow).toBeLessThanOrEqual(1);
  if(placement==='canvas'){expect(m.width).toBe(720);expect(m.x).toBe(initial.x);expect(m.y).toBe(initial.y);}
  expect(await player(page).locator('.stepid').textContent()).toBe(step);
  expect(await player(page).locator('.path-chip[aria-pressed="true"]').textContent()).toBe(selected);
  expect((await graph.boundingBox()).width).toBeCloseTo(graphWidth,0);
  if(source!==null)await expect(page.locator('#src')).toHaveValue(source);
  await info.attach('geometry-'+height,{body:JSON.stringify(m),contentType:'application/json'});
  await page.screenshot({path:info.outputPath(placement+'-'+height+'.png')});
 }
 if(placement==='canvas'){
  await page.locator(host==='workbench'?'#workspace-fit':'.explore-diagram-zoom button').filter(host==='workbench'?{}:{hasText:'Fit canvas'}).click();
  await expect(player(page)).toBeInViewport();
 }
});
for(const placement of ['canvas','floating'])test(placement+': constrained timeline scrolls and grows as vertical room returns',async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});await open(page,server,fixture(placement,26),'reader');
 const before=await metrics(page);expect(before.overflow).toBeGreaterThan(0);expect(before.caption).toBeGreaterThanOrEqual(34);expect(before.captionVisible).toBe(true);
 const chips=player(page).locator('.schips');await chips.evaluate(el=>{el.scrollTop=el.scrollHeight;});expect(await chips.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.setViewportSize({width:1280,height:1400});await expect.poll(async()=>(await metrics(page)).overflow).toBeLessThanOrEqual(1);
 expect((await metrics(page)).height).toBeGreaterThan(before.height);
});
for(const position of ['above','left','right'])test('canvas caption '+position+' remains reachable after resize',async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});await open(page,server,fixture('canvas',6,720,position),'reader');
 await page.setViewportSize({width:1280,height:1100});const m=await metrics(page);expect(m.overflow).toBeLessThanOrEqual(1);expect(m.caption).toBeGreaterThanOrEqual(34);expect(m.captionVisible).toBe(true);
});
test('narrow desktop canvas controls grow beyond the compact timeline cap',async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});await open(page,server,fixture('canvas',6,480),'reader');
 await page.setViewportSize({width:1280,height:1100});const m=await metrics(page);expect(m.overflow).toBeLessThanOrEqual(1);expect(m.caption).toBeGreaterThanOrEqual(34);expect(m.captionVisible).toBe(true);
});

test('Workbench control moves preserve authored size and one Undo after runtime fitting',async({page,server})=>{
 await page.setViewportSize({width:1280,height:1100});const raw=fixture('canvas');await open(page,server,raw,'workbench');
 const source=page.locator('#src'),before=await source.inputValue();
 await player(page).focus();await expect(player(page)).toHaveAttribute('aria-current','true');
 await player(page).locator('.explore-player-grip').press('ArrowRight');
 const moved=JSON.parse(await source.inputValue()).page.sections[0].diagram.layouts[1].exploreLayout.canvas.controls;
 expect(moved.x).toBeGreaterThan(0);expect(moved.y).toBe(500);expect(moved.w).toBe(720);expect(moved.h).toBe(220);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
 expect((await metrics(page)).overflow).toBeLessThanOrEqual(1);
});

for(const position of ['below','above','left','right'])test('step text changes refit the '+position+' caption without a window resize',async({page,server})=>{
 const raw=fixture('floating',6,720,position),d=raw.page.sections[0].diagram;
 d.steps[1].text='Detailed explanation of what happens at this step. '.repeat(20);
 await page.setViewportSize({width:1280,height:1100});await open(page,server,raw,'reader');
 const before=(await metrics(page)).height;
 await player(page).getByRole('button',{name:'Next step',exact:true}).click();
 await expect.poll(async()=>(await metrics(page)).height).toBeGreaterThan(before);
 expect(await player(page).locator('.stepline:not(.dv-caption-old)').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
});

test('authored floating controls grow without moving when content fits near the stage bottom',async({page,server})=>{
 const raw=fixture('floating'),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;
 layout.controls={x:.08,y:.64,w:.6,h:.1};
 await page.setViewportSize({width:1280,height:1100});await open(page,server,raw,'workbench');
 const source=page.locator('#src'),original=await source.inputValue();
 for(const height of [1100,1400,1100]){
  await page.setViewportSize({width:1280,height});
  await expect.poll(()=>player(page).evaluate((el,saved)=>{
   const r=el.getBoundingClientRect(),stage=el.closest('.explore-stage').getBoundingClientRect();
   return Math.max(Math.abs(r.x-stage.x-saved.x*stage.width),Math.abs(r.y-stage.y-saved.y*stage.height),Math.abs(r.width-saved.w*stage.width));
  },layout.controls)).toBeLessThan(1);
  const geometry=await player(page).evaluate(el=>{const r=el.getBoundingClientRect(),stage=el.closest('.explore-stage').getBoundingClientRect();return {height:r.height/stage.height,bottom:r.bottom-stage.bottom};});
  expect(geometry.height).toBeGreaterThan(layout.controls.h);expect(geometry.bottom).toBeLessThanOrEqual(-12);
  const m=await metrics(page);expect(m.overflow).toBeLessThanOrEqual(1);expect(m.captionVisible).toBe(true);
  await expect(source).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 }
});
