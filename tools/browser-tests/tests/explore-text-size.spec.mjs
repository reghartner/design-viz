import {chooseAddDestination} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools,panelsOptions,chooseNavigation,arrangeChapter} from '../helpers/test.mjs';
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
 await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.termbar').first()).toBeVisible();
}
const notes=page=>page.locator('[data-explore-content=prose]');
const player=page=>page.locator('.explore-player');
async function typeMetrics(page){return page.locator('.doc-sec').first().evaluate(stage=>{
 const note=stage.querySelector('[data-explore-content=prose]') || stage.querySelector('.sec-prose'),explore=stage.querySelector('.explore-player'),controls=explore && explore.querySelector('.termbar')?explore:stage.querySelector('.termbar');
 function metric(el,frame){return {logical:parseFloat(getComputedStyle(el).fontSize),physical:parseFloat(getComputedStyle(el).fontSize)*frame.getBoundingClientRect().width/frame.offsetWidth};}
 const bar=controls.matches('.termbar')?controls:controls.querySelector('.termbar');
 return {notes:metric(note.querySelector('.sec-text'),note),caption:metric(controls.querySelector('.stepline'),bar),chip:metric(controls.querySelector('.path-chip'),bar),transport:metric(controls.querySelector('.tbtn'),bar),scale:controls.getBoundingClientRect().width/controls.offsetWidth};
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
  expect(m.caption.physical).toBeCloseTo(16*(placement==='canvas'?m.scale:.8),1);expect(m.notes.physical).toBeCloseTo(18*(placement==='canvas'?m.scale:1),1);
  await page.screenshot({path:info.outputPath(`${placement}-${width}.png`)});
 }
 if(placement==='canvas'){
  await page.getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();await checkControls(page);const fit=await typeMetrics(page);await page.screenshot({path:info.outputPath(`${host}-${placement}-fit.png`)});
  expect(fit.caption.logical).toBe(16);expect(fit.caption.physical).toBeCloseTo(16*fit.scale,2);
  await page.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) out$/,exact:true}).click();const smaller=await typeMetrics(page);expect(smaller.caption.physical).toBeCloseTo(fit.caption.physical*.8,1);
 }else{
  const before=await typeMetrics(page);await panelsOptions(page,page.locator('.reader-navigation'));await page.getByRole('button',{name:'Shrink step controls',exact:true}).click();const after=await typeMetrics(page);expect(after.notes).toEqual(before.notes);for(const key of ['caption','chip','transport']){expect(after[key].logical).toBe(before[key].logical);expect(after[key].physical).toBeCloseTo(before[key].physical*.7/.8,1);}await checkControls(page);
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
 await expect(page.getByRole('textbox',{name:'Step controls text size',exact:true})).toHaveCount(0);
 await closeTools(page);await panelsOptions(page);await page.getByRole('button',{name:'Enlarge step controls',exact:true}).click();
 const after=await source.inputValue(),layout=JSON.parse(after).page.sections[0].diagram.layouts[0].exploreLayout;
 expect(layout).toEqual({...spec.page.sections[0].diagram.layouts[0].exploreLayout,textScale:{prose:1.25},controlsScale:.9});
 await page.getByRole('button',{name:'Reset step controls size',exact:true}).click();await expect.poll(async()=>(await typeMetrics(page)).caption.physical).toBeCloseTo(16,1);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(after);await closeTools(page);
 const prior=await typeMetrics(page);await player(page).locator('.explore-window-resize').press('ArrowRight');const resized=await typeMetrics(page);for(const key of ['notes','caption','chip','transport']){expect(resized[key].logical).toBe(prior[key].logical);expect(resized[key].physical).toBeCloseTo(prior[key].physical,2);}
 expect(JSON.parse(await source.inputValue()).page.sections[0].diagram.layouts[0].exploreLayout.textScale).toEqual({prose:1.25});
 await open(page,server,JSON.parse(after),'native');expect((await typeMetrics(page)).caption.physical).toBeCloseTo(14.4,1);expect((await typeMetrics(page)).notes.logical).toBe(22.5);
 await open(page,server,JSON.parse(after));expect((await typeMetrics(page)).caption.physical).toBeCloseTo(14.4,1);
 await chooseNavigation(page.locator('.reader-navigation'),'View','Standard');await expect(page.locator('.explore-text-sizing')).toHaveCount(0);expect(await page.locator('.stepline').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(16);
});

for(const placement of ['floating','canvas'])for(const position of ['left','right'])test(`${placement} enlarged ${position} caption keeps transport and path tracks inside the frame`,async({page,server})=>{
 await page.setViewportSize({width:1280,height:1000});const spec=fixture(placement,1.75),layout=spec.page.sections[0].diagram.layouts[0].exploreLayout;layout.steps={textPosition:position};layout.controls.w=.58;
 await open(page,server,spec);await checkControls(page);
});

for(const placement of ['floating','canvas'])test(`${placement} notes heading scales within its fixed header`,async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});
 let chapterHeadingSize;
 for(const scale of [.75,1,1.75]){
  const spec=fixture(placement,scale),layout=spec.page.sections[0].diagram.layouts[0].exploreLayout;
  layout.prose.w=.15;layout.canvas.prose.w=180;
  await open(page,server,spec);
  if(placement==='canvas')await notes(page).focus();
  const grip=notes(page).getByRole('button',{name:'Move Section notes; use arrow keys',exact:true});
  await expect(grip).toBeVisible();await expect(grip).toHaveCSS('font-size',`${10*scale}px`);
  const metrics=await grip.evaluate(el=>{
   const header=el.parentElement,hide=header.querySelector('.explore-window-hide'),r=el.getBoundingClientRect(),h=header.getBoundingClientRect(),c=hide.getBoundingClientRect();
   return {headerHeight:header.offsetHeight,contentFits:el.scrollHeight<=el.clientHeight,inside:r.top>=h.top && r.bottom<=h.bottom,apart:r.right<=c.left,hideInside:c.top>=h.top && c.bottom<=h.bottom};
  });
  expect(metrics).toEqual({headerHeight:32,contentFits:true,inside:true,apart:true,hideInside:true});
  const headingSize=await page.locator('.sec-h').first().evaluate(el=>getComputedStyle(el).fontSize);
  chapterHeadingSize??=headingSize;expect(headingSize).toBe(chapterHeadingSize);
 }
});

for(const named of [true,false])test(`Tab-owned Explore text sizing preserves ${named?'named':'automatic'} section arrangements and Views`,async({page,server})=>{
 const raw=fixture(),sec=raw.page.sections[0];sec.id='story';
 if(named)delete sec.diagram.layouts[0].presentation;else {delete sec.diagram.layouts;delete sec.diagram.defaultLayout;}
 raw.page.views=[{id:'canvas',name:'Canvas',presentation:'explore',sections:[named?{section:'story',layout:'explore'}:'story']}];raw.page.defaultView='canvas';
 await page.setViewportSize({width:1440,height:1080});await open(page,server,raw,'workbench');
 const source=page.locator('#src'),before=await source.inputValue();
 await notes(page).locator('.sec-prose').click({position:{x:2,y:2}});await page.locator('#editor-tab-inspect').click();
 const input=page.getByRole('textbox',{name:'Section notes text size',exact:true});await expect(input).toHaveValue('100');await input.fill('125');await input.press('Enter');
 await expect.poll(async()=>(await typeMetrics(page)).notes.logical).toBe(22.5);
 const after=await source.inputValue(),saved=JSON.parse(after);expect(saved.page.views).toEqual(raw.page.views);
 expect(saved.page.sections[0].diagram.layouts.find(l=>l.id===(named?'explore':'flow')).exploreLayout.textScale).toEqual({prose:1.25});
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
 await closeTools(page);await player(page).locator('.stepline').click();await page.locator('#editor-tab-inspect').click();
 await expect(page.getByRole('textbox',{name:'Step controls text size',exact:true})).toHaveCount(0);
 await closeTools(page);await panelsOptions(page);await page.getByRole('button',{name:'Enlarge step controls',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.layouts.find(l=>l.id===(named?'explore':'flow')).exploreLayout.controlsScale).toBe(.9);
 expect(JSON.parse(await source.inputValue()).page.views).toEqual(raw.page.views);
});

test('Optimize Explore layout retains independent text sizes and hidden notes with one Undo',async({page,server})=>{
 const raw=fixture('floating',1.25);raw.page.sections[0].diagram.layouts[0].exploreLayout.prose.hidden=true;raw.page.sections[0].diagram.layouts[0].exploreLayout.controlsScale=.9;
 await page.setViewportSize({width:1440,height:1080});await open(page,server,raw,'workbench');
 const source=page.locator('#src'),before=await source.inputValue();await arrangeChapter(page);
 await page.getByRole('button',{name:'Optimize layout',exact:true}).click();
 const after=await source.inputValue(),layout=JSON.parse(after).page.sections[0].diagram.layouts[0].exploreLayout;
 expect(layout).toEqual({prose:{hidden:true},textScale:{prose:1.25,controls:1.25},controlsScale:.9});
 await expect(notes(page)).toBeHidden();expect((await typeMetrics(page)).caption.logical).toBe(20);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);
});

test('a Tab-owned Standard View does not expose Explore text settings from its arrangement',async({page,server})=>{
 const raw=fixture();raw.page.sections[0].id='story';raw.page.views=[{id:'read',name:'Read',presentation:'standard',sections:[{section:'story',layout:'explore'}]}];raw.page.defaultView='read';
 await page.setViewportSize({width:1440,height:1080});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);
 await page.locator('.sec-prose').click({position:{x:2,y:2}});await page.locator('#editor-tab-inspect').click();
 await expect(page.getByRole('textbox',{name:'Section notes text size',exact:true})).toHaveCount(0);
});

for(const placement of ['floating','canvas'])for(const scale of [1,1.75])for(const position of ['below','above'])test(`${placement} simple story at ${scale*100}% keeps wrapped transport clear of ${position} caption`,async({page,server},info)=>{
 const raw=fixture(placement,scale),d=raw.page.sections[0].diagram;delete d.paths;d.steps=d.steps.slice(0,2);d.layouts[0].exploreLayout.steps={textPosition:position};
 await page.setViewportSize({width:1280,height:1000});await open(page,server,raw);
 for(const width of [1280,1440]){
  await page.setViewportSize({width,height:1000});await checkControls(page);
  const geometry=await player(page).evaluate(el=>{
   const transport=el.querySelector('.step-transport'),caption=el.querySelector('.stepline:not(.dv-caption-old)'),status=el.querySelector('.playback-status'),chips=el.querySelector('.schips'),bar=el.querySelector('.termbar');
   const c=caption.getBoundingClientRect(),s=status.getBoundingClientRect();
   return {separate:s.bottom<=c.top+1 || c.bottom<=s.top+1,transportHeight:transport.offsetHeight,trackHeight:parseFloat(el.style.getPropertyValue('--explore-tracks-height')),chipsOverflow:chips.scrollHeight-chips.clientHeight,barOverflow:bar.scrollHeight-bar.clientHeight};
  });
  expect(geometry.separate).toBe(true);expect(geometry.trackHeight).toBeGreaterThanOrEqual(geometry.transportHeight);expect(geometry.chipsOverflow).toBeLessThanOrEqual(1);expect(geometry.barOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({path:info.outputPath(`${placement}-${scale}-${position}-${width}.png`)});
 }
});

for(const presentation of ['standard','explore'])for(const placement of ['floating','canvas'])test(`${presentation} ${placement}: active View owns complete step-control authoring`,async({page,server},info)=>{
 test.setTimeout(120000);
 const raw=fixture(placement,1.25),sec=raw.page.sections[0],d=sec.diagram;sec.id='story';
 d.layouts[0].exploreLayout.canvas.controls.w=1100;
 // Deliberately disagree with the arrangement's old presentation flag.
 d.layouts[0].presentation=presentation==='standard'?'explore':'standard';
 d.panels=[{id:'status',type:'state',title:'Status',states:['Ready'],initial:{state:'Ready'}}];
 raw.page.views=[{id:'active',name:'Active',presentation,sections:[{section:'story',layout:'explore'}]}];raw.page.defaultView='active';
 await page.setViewportSize({width:1920,height:1200});await open(page,server,raw,'workbench');
 const source=page.locator('#src'),initial=await source.inputValue(),controls=presentation==='standard'?page.locator('.termbar').first():player(page);
 if(presentation==='standard')await expect(page.locator('.standard-controls-player')).toHaveCount(0);
 await controls.locator('.path-chip').nth(1).click();await controls.getByRole('button',{name:'Next step',exact:true}).click();
 const selectedStep=await controls.locator('.stepid').textContent();
 if(presentation==='standard')await controls.locator('.schips').click({position:{x:2,y:2}});else await controls.locator('.stepline').click();await page.locator('#editor-tab-inspect').click();
 await expect(page.getByRole('textbox',{name:'Step controls text size',exact:true})).toHaveCount(0);
 const width=page.getByRole('textbox',{name:'Path label width',exact:true});await width.fill('300');await width.press('Enter');
 await expect.poll(()=>controls.locator('.schips').evaluate(el=>el.style.getPropertyValue('--path-label-width'))).toBe('300px');
 await expect.poll(()=>controls.locator('.path-chip').first().evaluate(el=>el.offsetWidth)).toBeGreaterThan(220);
 for(const transport of ['above','beside'])for(const caption of ['above','left','right','below']){
  await page.getByRole('combobox',{name:'Play buttons',exact:true}).selectOption(transport);
  await page.getByRole('combobox',{name:'Caption position',exact:true}).selectOption(caption);
  await expect.poll(()=>controls.evaluate((el,{transport,caption})=>{
   const t=el.querySelector('.step-transport').getBoundingClientRect(),c=el.querySelector('.schips').getBoundingClientRect(),p=el.querySelector('.stepline:not(.dv-caption-old)').getBoundingClientRect();
   return (transport==='above'?t.bottom<=c.top+1:t.right<=c.left+1) && (caption==='left'?p.right<=c.left+1:caption==='right'?p.left>=c.right-1:caption==='above'?p.bottom<=c.top+1:p.top>=c.bottom-1);
  },{transport,caption})).toBe(true);
  await expect(controls.locator('.stepid')).toHaveText(selectedStep);
 }
 await page.getByRole('combobox',{name:'Caption position',exact:true}).selectOption('right');
 if(presentation==='standard')await expect(page.getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveCount(0);
 else {
  const beforePlacement=await source.inputValue();await page.getByRole('combobox',{name:'Step controls placement',exact:true}).selectOption(placement==='canvas'?'floating':'canvas');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.layouts[0].exploreLayout.controlsPlacement).toBe(placement==='canvas'?'floating':'canvas');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(beforePlacement);await expect(controls.locator('.stepid')).toHaveText(selectedStep);
 }
 await closeTools(page);await panelsOptions(page);const before=await typeMetrics(page),beforeSize=await source.inputValue();
 if(presentation==='standard')await expect(page.getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Shrink step controls',exact:true}).click();
 const after=await source.inputValue(),saved=JSON.parse(after),layout=saved.page.sections[0].diagram.layouts[0].exploreLayout;
 const nextScale=presentation==='standard'?.9:placement==='canvas'?.9:.7,initialControlScale=presentation==='standard' || placement==='canvas'?1:.8;
 expect(layout.controlsScale).toBe(nextScale);expect(layout.textScale.controls).toBe(1.25);
 expect(layout.controls).toEqual(d.layouts[0].exploreLayout.controls);expect(layout.canvas).toEqual(d.layouts[0].exploreLayout.canvas);
 expect(saved.page.views).toEqual(raw.page.views);expect(saved.page.sections[0].diagram.layouts[1]).toEqual(d.layouts[1]);
 const scaled=await typeMetrics(page);for(const key of ['caption','chip','transport'])expect(scaled[key].physical).toBeCloseTo(before[key].physical*nextScale/initialControlScale,1);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(beforeSize);await page.locator('#redo-builder').click();await expect(source).toHaveValue(after);await expect(controls.locator('.stepid')).toHaveText(selectedStep);
 await closeTools(page);await panelsOptions(page);
 if(presentation==='explore'){
  const prior=await typeMetrics(page);await page.getByRole('button',{name:'Shrink floating panels',exact:true}).click();const panelSized=await typeMetrics(page);
  for(const key of ['caption','chip','transport'])expect(panelSized[key].physical).toBeCloseTo(prior[key].physical,1);
 }
 await page.keyboard.press('Escape');
 await page.screenshot({path:info.outputPath('controls.png')});
 expect(initial).not.toBe(after);
 await open(page,server,saved); // HTML roundtrip, including the normal Standard grid reader.
 if(presentation==='standard'){
  const bar=page.locator('.termbar').first();await expect(bar).toHaveCSS('zoom',String(layout.controlsScale));
  expect(await bar.locator('.schips').evaluate(el=>el.style.getPropertyValue('--path-label-width'))).toBe('300px');
  await expect.poll(()=>bar.evaluate(el=>{const p=el.querySelector('.stepline').getBoundingClientRect(),c=el.querySelector('.schips').getBoundingClientRect();return p.left>=c.right-1;})).toBe(true);
 }else {const exported=await typeMetrics(page);expect(exported.caption.logical).toBe(20);await checkControls(page);}
});

test('Standard sizing keeps independent section pages, grid controls, panels and prose with exact Undo',async({page,server})=>{
 const raw=fixture(),first=raw.page.sections[0];first.id='first';first.diagram.layouts[0].presentation='standard';delete first.diagram.layouts[0].exploreLayout.controlsPlacement;
 first.diagram.panels=[{id:'status',type:'state',title:'Status',states:['Ready'],initial:{state:'Ready'}}];
 const second=structuredClone(first);second.id='second';second.heading='Second section';raw.page.sections.push(second);
 raw.page.views=[{id:'standard',name:'Standard',presentation:'standard',sections:[{section:'first',layout:'explore'},{section:'second',layout:'explore'}]}];raw.page.defaultView='standard';
 await page.setViewportSize({width:1800,height:1400});await open(page,server,raw,'workbench');const source=page.locator('#src'),before=await source.inputValue();
 await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);await expect(page.locator('.standard-controls-player')).toHaveCount(0);
 await panelsOptions(page);await page.getByRole('button',{name:'Shrink step controls',exact:true}).click();
 const sized=await source.inputValue();expect(JSON.parse(sized).page.sections[0].diagram.layouts[0].exploreLayout.controlsScale).toBe(.9);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await page.locator('#redo-builder').click();await expect(source).toHaveValue(sized);
 await closeTools(page);await panelsOptions(page);await expect(page.locator('.explore-panel-menu[open]').getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveCount(0);
 await expect(page.locator('.standard-controls-player')).toHaveCount(0);
 await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);await expect(page.locator('.doc-sec')).toHaveCount(2);
 for(let i=0;i<2;i++){
  await chooseAddDestination(page,i);const sec=page.locator('.doc-sec[data-dv-section="'+i+'"]');await expect(page.locator('.doc-sec:visible')).toHaveCount(1);await expect(sec).toBeVisible();await expect(sec.locator('.pwidget[data-dv-panel]')).toBeVisible();await expect(sec.locator('.sec-prose')).toBeVisible();
  await expect(sec.locator('.explore-stage')).toBeHidden();await expect(sec.locator('.explore-window')).toHaveCount(0);
 }
 await chooseAddDestination(page,0);
 await closeTools(page);await page.locator('.doc-sec:visible .section-layout-grid .schips').click({position:{x:2,y:2}});await page.locator('#editor-tab-inspect').click();
 await expect(page.getByRole('combobox',{name:'Step controls placement',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Caption position',exact:true}).selectOption('left');await expect(page.locator('.doc-sec:visible .section-layout-grid .termbar')).toHaveAttribute('data-step-text-position','left');
 const captioned=await source.inputValue();await page.locator('#undo-builder').click();await expect(source).toHaveValue(sized);await page.locator('#redo-builder').click();await expect(source).toHaveValue(captioned);
});

test('Standard grid controls ignore negative saved canvas coordinates and graph zoom',async({page,server})=>{
 const raw=fixture('canvas'),d=raw.page.sections[0].diagram;d.layouts[0].presentation='standard';d.layouts[0].exploreLayout.canvas.controls={x:-400,y:-100,w:900,h:220};
 await page.setViewportSize({width:1800,height:1200});await open(page,server,raw,'workbench');const source=page.locator('#src'),before=await source.inputValue();
 const controls=page.locator('.section-layout-grid .termbar');await expect(page.locator('.standard-controls-player')).toHaveCount(0);const prior=await controls.boundingBox();
 await page.locator('.board-zoom').getByRole('button',{name:'Diagram zoom out',exact:true}).click();expect((await controls.boundingBox()).width).toBeCloseTo(prior.width,0);await expect(source).toHaveValue(before);
 await controls.scrollIntoViewIfNeeded();await expect(controls.locator('.stepline')).toBeInViewport();
});
