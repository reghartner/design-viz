import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(placement='floating',scale,shared=true){
 const exploreLayout={overlayScale:.8,prosePlacement:placement,controlsPlacement:placement,prose:{x:.65,y:.08,w:.32,h:.25,stacked:false},controls:{x:.03,y:.68,w:.92,h:.22},canvas:{prose:{x:700,y:0,w:400,h:180},controls:{x:0,y:300,w:720,h:220}},camera:{zoom:1,x:.5,y:1}};
 if(scale!==undefined)exploreLayout.textScale={prose:scale,controls:scale};
 return {page:{title:'Explore type',skin:'terminal',sections:[{heading:'Readable notes',text:['Section notes explain why delivery takes a different route when the connection is unavailable.','The frame and the text can be sized independently.'],bullets:['Retain the complete story.','Inspect the current outcome.'],diagram:{view:'step',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:Array.from({length:7},(_,i)=>({id:'s'+i,edge:'a->b',text:'The current caption explains how delivery reaches the destination.'})),paths:[{id:'normal',label:'Normal delivery',steps:['s0','s1',...(shared?['s6']:[])]},{id:'retry',label:'Retry the delivery after the overnight connection becomes available',steps:['s2','s3',...(shared?['s6']:[])]},{id:'recover',label:'Recover the previous delivery',steps:['s4','s5',...(shared?['s6']:[])]}],layouts:[{id:'explore',name:'Explore',presentation:'explore',pathLabelWidth:230,sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]},exploreLayout},{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]}}],defaultLayout:'explore'}}]}};
}
async function open(page,server,spec,host='reader'){
 if(host==='workbench'){await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await closeTools(page);}
 else if(host==='native'){
  await writeFile(path.join(server.root,'type-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'type-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./type-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/type-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},spec);
 }else{
  await writeFile(path.join(server.root,'type.json'),JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'type.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'type.html')]);await page.goto(server.origin+'/type.html');
 }
 await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.explore-player')).toBeVisible();
}
const notes=page=>page.locator('[data-explore-content=prose]');
const player=page=>page.locator('.explore-player');
async function typeMetrics(page){return page.locator('.explore-stage').evaluate(stage=>{
 const note=stage.querySelector('[data-explore-content=prose]'),controls=stage.querySelector('.explore-player');
 function metric(el,frame){return {logical:parseFloat(getComputedStyle(el).fontSize),physical:parseFloat(getComputedStyle(el).fontSize)*frame.getBoundingClientRect().width/frame.offsetWidth};}
 return {notes:metric(note.querySelector('.sec-text'),note),caption:metric(controls.querySelector('.stepline'),controls),chip:metric(controls.querySelector('.path-chip'),controls),transport:metric(controls.querySelector('.tbtn'),controls),scale:controls.getBoundingClientRect().width/controls.offsetWidth};
});}
async function checkControls(page){
 await expect.poll(()=>player(page).evaluate(el=>{
  const chips=el.querySelector('.schips'),caption=el.querySelector('.stepline:not(.dv-caption-old)'),transport=el.querySelector('.step-transport');
  const c=chips.getBoundingClientRect(),t=transport.getBoundingClientRect(),p=caption.getBoundingClientRect(),r=el.getBoundingClientRect();
  const disjoint=(a,b)=>a.right<=b.left+1 || b.right<=a.left+1 || a.bottom<=b.top+1 || b.bottom<=a.top+1;
  const stops=[...chips.querySelectorAll('.schip')].map(s=>s.getBoundingClientRect());
  return disjoint(c,t) && disjoint(c,p) && disjoint(t,p) && [c,t,p].every(box=>box.right<=r.right+1 && box.left>=r.left-1) && p.bottom<=r.bottom+1 && p.height>0 && stops.every((a,i)=>stops.slice(i+1).every(b=>disjoint(a,b)));
 })).toBe(true);
 const labels=await player(page).locator('.path-chip').evaluateAll(buttons=>buttons.map(b=>({title:b.title,text:b.textContent,height:b.querySelector('span').offsetHeight,line:parseFloat(getComputedStyle(b).lineHeight)})));
 for(const label of labels){expect(label.title).toBe(label.text);expect(label.height).toBeLessThanOrEqual(2*label.line+1);}
}
for(const host of ['reader','native'])for(const placement of ['floating','canvas'])test(`${host} ${placement} defaults stay readable across desktop widths and graph Fit`,async({page,server},info)=>{
 await page.setViewportSize({width:1280,height:1080});await open(page,server,fixture(placement),host);
 for(const width of [1280,1440,1920]){
  await page.setViewportSize({width,height:1080});await checkControls(page);
  const m=await typeMetrics(page);expect(m.notes.logical).toBe(18);expect(m.caption.logical).toBe(16);expect(m.chip.logical).toBe(13);expect(m.transport.logical).toBe(13);
  expect(m.caption.physical).toBeCloseTo(16*(placement==='canvas'?m.scale:1),1);expect(m.notes.physical).toBeCloseTo(18*(placement==='canvas'?m.scale:1),1);
  await page.screenshot({path:info.outputPath(`${placement}-${width}.png`)});
 }
 if(placement==='canvas'){
  await page.getByRole('button',{name:'Fit canvas',exact:true}).click();await checkControls(page);const fit=await typeMetrics(page);
  expect(fit.caption.logical).toBe(16);expect(fit.caption.physical).toBeCloseTo(16*fit.scale,2);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();const smaller=await typeMetrics(page);expect(smaller.caption.physical).toBeCloseTo(fit.caption.physical*.8,1);
 }else{
  const before=await typeMetrics(page);await page.getByRole('button',{name:'Shrink panels and controls',exact:true}).click();expect(await typeMetrics(page)).toEqual(before);
 }
});
for(const shared of [true,false])for(const placement of ['floating','canvas'])test(`${shared?'timeline':'matrix'} ${placement} enlarged text fits or scrolls inside narrow frames`,async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});const raw=fixture(placement,1.75,shared);raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.controls.w=480;
 await open(page,server,raw);await checkControls(page);const m=await typeMetrics(page);expect(m.notes.logical).toBe(31.5);expect(m.caption.logical).toBe(28);expect(m.chip.logical).toBe(22.75);
 const body=notes(page).locator('.explore-window-body');expect(await body.evaluate(el=>el.scrollHeight>el.clientHeight && getComputedStyle(el).overflowY==='auto')).toBe(true);
 const chips=player(page).locator('.schips');await chips.evaluate(el=>{el.scrollLeft=el.scrollWidth;});await player(page).locator('.schip').last().focus();await page.keyboard.press('Enter');
 await expect(player(page).locator('.schip[aria-current=true]')).toHaveCount(1);
});

test('Inspect edits notes and controls independently, retains frame geometry, and exports with exact Undo',async({page,server})=>{
 const spec=fixture();await page.setViewportSize({width:1440,height:1080});await open(page,server,spec,'workbench');
 const source=page.locator('#src'),before=await source.inputValue();
 await notes(page).locator('.sec-prose').click({position:{x:2,y:2}});if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
 const notesSize=page.getByRole('textbox',{name:'Section notes text size',exact:true});await expect(notesSize).toHaveValue('100');await notesSize.fill('125');await notesSize.press('Enter');
 await expect.poll(async()=>(await typeMetrics(page)).notes.logical).toBe(22.5);expect((await typeMetrics(page)).caption.logical).toBe(16);
 const notesEdited=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(notesEdited);
 await closeTools(page);await player(page).locator('.stepline').click();if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
 const controlsSize=page.getByRole('textbox',{name:'Step controls text size',exact:true});await controlsSize.fill('150');await controlsSize.press('Enter');await expect.poll(async()=>(await typeMetrics(page)).caption.logical).toBe(24);
 const after=await source.inputValue(),layout=JSON.parse(after).page.sections[0].diagram.layouts[0].exploreLayout;
 expect(layout).toEqual({...spec.page.sections[0].diagram.layouts[0].exploreLayout,textScale:{prose:1.25,controls:1.5}});
 await page.getByRole('button',{name:'Reset text size',exact:true}).click();await expect.poll(async()=>(await typeMetrics(page)).caption.logical).toBe(16);expect((await typeMetrics(page)).notes.logical).toBe(22.5);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(after);await closeTools(page);
 const prior=await typeMetrics(page);await player(page).locator('.explore-window-resize').press('ArrowRight');const resized=await typeMetrics(page);for(const key of ['notes','caption','chip','transport']){expect(resized[key].logical).toBe(prior[key].logical);expect(resized[key].physical).toBeCloseTo(prior[key].physical,2);}
 expect(JSON.parse(await source.inputValue()).page.sections[0].diagram.layouts[0].exploreLayout.textScale).toEqual({prose:1.25,controls:1.5});
 await open(page,server,JSON.parse(after),'native');expect((await typeMetrics(page)).caption.logical).toBe(24);expect((await typeMetrics(page)).notes.logical).toBe(22.5);
 await open(page,server,JSON.parse(after));expect((await typeMetrics(page)).caption.logical).toBe(24);
 await page.getByRole('button',{name:'Standard',exact:true}).click();await expect(page.locator('.explore-text-sizing')).toHaveCount(0);expect(await page.locator('.stepline').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(16);
});

for(const placement of ['floating','canvas'])for(const position of ['left','right'])test(`${placement} enlarged ${position} caption keeps transport and path tracks inside the frame`,async({page,server})=>{
 await page.setViewportSize({width:1280,height:1000});const spec=fixture(placement,1.75),layout=spec.page.sections[0].diagram.layouts[0].exploreLayout;layout.steps={textPosition:position};layout.controls.w=.58;
 await open(page,server,spec);await checkControls(page);
});
