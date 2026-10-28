import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,chooseNavigation} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
function story(mode,position,caption='below',shared=false){
 const d={view:'step',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:Array.from({length:8},(_,i)=>({id:'s'+i,edge:'a->b',text:'This caption stays readable beside or above the step controls.'})),layouts:[]};
 if(mode!=='simple')d.paths=Array.from({length:3},(_,i)=>({id:'p'+i,label:'Delivery route '+i,steps:['s'+i*2,'s'+(i*2+1),...(shared?['s7']:[])]}));
 d.layouts=[{id:'chapter',name:'Chapter',presentation:['canvas','floating'].includes(mode)?'explore':'standard',playbackPosition:position,sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]},exploreLayout:{controlsPlacement:mode==='canvas'?'canvas':'floating',steps:{textPosition:caption},controls:{x:.03,y:.6,w:.92,h:.25},canvas:{controls:{x:0,y:400,w:900,h:250}}}}];
 return {page:{title:'Play button placement',skin:'pastel',sections:[{heading:'Routes',diagram:d}]}};
}
async function open(page,server,spec,host='reader'){
 if(host==='native'){
  await writeFile(path.join(server.root,'placement-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'placement-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./placement-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/placement-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(spec=>{window.viewer=mount(document.querySelector('#host'),spec);},spec);
 }else{
  await writeFile(path.join(server.root,'placement.json'),JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'placement.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'placement.html')]);
  await page.goto(server.origin+'/placement.html');
 }
 await expect(page.locator('.termbar')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
async function geometry(page,position,caption='below',explore=false){
 const bar=page.locator('.termbar').first();
 await expect.poll(()=>bar.evaluate((el,{position,caption,explore})=>{
  const tr=el.querySelector('.step-transport').getBoundingClientRect(),ch=el.querySelector('.schips').getBoundingClientRect(),ca=el.querySelector('.stepline:not(.dv-caption-old)').getBoundingClientRect();
  const placed=position==='above'?tr.bottom<=ch.top+1:tr.right<=ch.left+1 && Math.abs(tr.top-ch.top)<2;
  const captionPlaced=!explore || (caption==='left'?ca.right<=ch.left+1:caption==='right'?ca.left>=ch.right-1:caption==='above'?ca.bottom<=ch.top+1:ca.top>=ch.bottom-1);
  return placed && captionPlaced && ch.width>35 && ca.height>=(explore?30:10);
 },{position,caption,explore})).toBe(true);
 if(explore){
  await expect.poll(()=>bar.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
  await expect.poll(()=>bar.locator('.schips').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 }
}
async function standardCaptionBelow(page){
 await expect.poll(()=>page.locator('.termbar').first().evaluate(el=>{
  const tracks=el.querySelector('.schips').getBoundingClientRect();
  const caption=el.querySelector('.stepline:not(.dv-caption-old)').getBoundingClientRect();
  return caption.top>=tracks.bottom-1 && caption.height>=10;
 })).toBe(true);
}
test('Standard keeps below captions beneath numbered steps and path tracks',async({page,server},info)=>{
 await page.setViewportSize({width:1600,height:1200});
 for(const mode of ['simple','standard'])for(const position of ['auto','above','beside'])for(const explicit of [false,true]){
  const spec=story(mode,position);
  if(!explicit)delete spec.page.sections[0].diagram.layouts[0].exploreLayout.steps;
  await open(page,server,spec);
  await standardCaptionBelow(page);
  if(mode==='simple' && position==='auto' && !explicit)await page.screenshot({path:info.outputPath('standard-auto-below.png')});
 }
});
for(const mode of ['simple','standard','floating','canvas'])for(const position of ['above','beside'])test(`${mode}: play buttons ${position} steps`,async({page,server},info)=>{
 await page.setViewportSize({width:1600,height:1200});await open(page,server,story(mode,position,'below',mode==='canvas'));
 await geometry(page,position,'below',['floating','canvas'].includes(mode));
 const bar=page.locator('.termbar');await bar.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(bar.locator('.stepid')).toHaveText('s1');
 await bar.getByRole('button',{name:/^(Play|Replay)$/,exact:true}).click();await expect(bar).toHaveAttribute('data-playback','playing');
 await bar.getByRole('button',{name:'Pause',exact:true}).click();
 await page.screenshot({path:info.outputPath('placement.png')});await info.attach('placement',{path:info.outputPath('placement.png'),contentType:'image/png'});
});
for(const caption of ['above','left','right'])for(const position of ['above','beside'])test(`Explore caption ${caption}, play buttons ${position}`,async({page,server})=>{
 await page.setViewportSize({width:1600,height:1200});await open(page,server,story('canvas',position,caption,true));await geometry(page,position,caption,true);
});
for(const position of ['above','beside'])test(`native host renders ${position} override`,async({page,server})=>{
 await open(page,server,story('standard',position),'native');await geometry(page,position);
});
test('Inspect saves placement in both presentations with exact Undo/Redo and exported rendering',async({page,server})=>{
 for(const mode of ['standard','floating']){
  const spec=story(mode,'auto');await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
  const section=page.locator('#docview .doc-sec').first();
  if(mode==='floating')await section.locator('.stepline').click();else await section.locator('.schips').click({position:{x:2,y:2}});
  if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
  const control=page.getByRole('combobox',{name:'Play buttons',exact:true});await expect(control).toHaveValue('auto');const before=await page.locator('#src').inputValue();
  await control.selectOption('above');await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.layouts[0].playbackPosition).toBe('above');
  const after=await page.locator('#src').inputValue();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await open(page,server,JSON.parse(after));await geometry(page,'above','below',mode==='floating');
 }
});
test('Inspector moves a Standard caption from right to below immediately and preserves Undo/Redo',async({page,server})=>{
 const spec=story('simple','auto','right');
 await page.setViewportSize({width:1600,height:1200});
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 const bar=page.locator('#docview .termbar').first();
 await expect.poll(()=>bar.evaluate(el=>{
  const tracks=el.querySelector('.schips').getBoundingClientRect(),caption=el.querySelector('.stepline').getBoundingClientRect();
  return caption.left>=tracks.right-1;
 })).toBe(true);
 await bar.locator('.schips').click({position:{x:2,y:2}});
 if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
 const position=page.getByRole('combobox',{name:'Caption position',exact:true});await expect(position).toHaveValue('right');
 const before=await page.locator('#src').inputValue();
 await position.selectOption('below');await standardCaptionBelow(page);
 const after=await page.locator('#src').inputValue();
 expect(JSON.parse(after).page.sections[0].diagram.layouts[0].exploreLayout.steps).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);await standardCaptionBelow(page);
 await open(page,server,JSON.parse(after));await standardCaptionBelow(page);
});
test('Inspector places a fixed Standard steps tile caption below its tracks',async({page,server},info)=>{
 const spec=story('simple','auto','right'),layout=spec.page.sections[0].diagram.layouts[0];
 layout.sectionLayout.default=[{controls:'steps',x:0,y:0,w:24,h:3},{x:0,y:3,w:24,h:9}];
 await page.setViewportSize({width:1600,height:1200});
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
 const bar=page.locator('#docview .section-layout-tile[data-layout-key="steps"]>.termbar');await expect(bar).toBeVisible();
 await bar.locator('.schips').click({position:{x:2,y:2}});
 if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
 const position=page.getByRole('combobox',{name:'Caption position',exact:true});await expect(position).toHaveValue('right');
 await position.selectOption('below');await standardCaptionBelow(page);
 await expect.poll(()=>bar.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 const saved=JSON.parse(await page.locator('#src').inputValue());
 expect(saved.page.sections[0].diagram.layouts[0].exploreLayout.steps).toBeUndefined();
 await open(page,server,saved);await standardCaptionBelow(page);
 await page.screenshot({path:info.outputPath('fixed-steps-tile-below.png')});
});
test('Constrained Standard steps tile keeps Beside playback beside a Below caption',async({page,server})=>{
 const spec=story('simple','beside');
 spec.page.sections[0].diagram.layouts[0].sectionLayout.default=[{controls:'steps',x:0,y:0,w:9,h:4},{x:9,y:0,w:15,h:12}];
 await page.setViewportSize({width:1300,height:1000});await open(page,server,spec);
 await geometry(page,'beside');await standardCaptionBelow(page);
});

test('switching arrangements restores their own placement and Auto retains the existing path layout',async({page,server})=>{
 const spec=story('standard','above'),d=spec.page.sections[0].diagram;
 d.layouts[0].name='Above';d.layouts.push({...structuredClone(d.layouts[0]),id:'beside',name:'Beside',playbackPosition:'beside'},{...structuredClone(d.layouts[0]),id:'automatic',name:'Automatic',playbackPosition:'auto'});
 await open(page,server,spec);await geometry(page,'above');
 const nav=page.locator('.reader-navigation');await chooseNavigation(nav,'View','Beside');await geometry(page,'beside');
 await chooseNavigation(nav,'View','Automatic');await expect(page.locator('.termbar')).toHaveAttribute('data-playback-position','auto');await expect.poll(()=>page.locator('.termbar').evaluate(el=>getComputedStyle(el).display)).toBe('flex');
 await chooseNavigation(nav,'View','Above');await geometry(page,'above');
 await page.getByRole('button',{name:'Ambient',exact:true}).click();await expect(page.locator('.termbar')).toBeVisible();await expect(page.locator('.stepline')).toBeHidden();
});
for(const position of ['above','beside'])test(`narrow desktop canvas preserves side caption with ${position} buttons`,async({page,server})=>{
 const spec=story('canvas',position,'right',true);spec.page.sections[0].diagram.layouts[0].exploreLayout.canvas.controls.w=460;
 await page.setViewportSize({width:1440,height:1200});await open(page,server,spec);await geometry(page,position,'right',true);
});
for(const position of ['above','beside'])test(`Confluence shared renderer honors ${position} placement`,async({page,server})=>{
 const spec=story('standard',position);
 await page.addInitScript(raw=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{specJson:JSON.stringify(raw)},macro:{isConfiguring:false}}};return true;}};},spec);
 await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();await geometry(page,position);
});
for(const mode of ['floating','canvas'])test(`${mode}: Above keeps many paths scrollable and enlarged captions reachable`,async({page,server})=>{
 const spec=story(mode,'above','below',true),d=spec.page.sections[0].diagram;d.paths=Array.from({length:25},(_,i)=>({...structuredClone(d.paths[0]),id:'many'+i,label:'Delivery route '+i}));d.layouts[0].exploreLayout.textScale={controls:1.75};
 await page.setViewportSize({width:1440,height:850});await open(page,server,spec);
 const bar=page.locator('.termbar'),chips=bar.locator('.schips');
 await expect.poll(()=>chips.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
 await expect.poll(()=>bar.evaluate(el=>{const caption=el.querySelector('.stepline:not(.dv-caption-old)'),ch=el.querySelector('.schips').getBoundingClientRect(),ca=caption.getBoundingClientRect(),tr=el.querySelector('.step-transport').getBoundingClientRect();return tr.bottom<=ch.top+1 && ca.top>=ch.bottom-1 && ca.bottom<=el.getBoundingClientRect().bottom+1 && caption.clientHeight>=parseFloat(getComputedStyle(caption).lineHeight);})).toBe(true);
 await chips.evaluate(el=>{el.scrollTop=el.scrollHeight;});expect(await chips.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
});
test('Explore places playback around simple numbered steps in floating and canvas windows',async({page,server})=>{
 for(const mode of ['floating','canvas'])for(const position of ['above','beside']){
  const spec=story(mode,position);delete spec.page.sections[0].diagram.paths;
  await open(page,server,spec);await geometry(page,position,'below',true);
 }
});

for(const host of ['reader','native'])test(`${host}: Standard grid honors saved side caption and whole-control scale`,async({page,server})=>{
 const spec=story('standard','above','left',true),layout=spec.page.sections[0].diagram.layouts[0];layout.exploreLayout.controlsScale=.75;layout.pathLabelWidth=300;
 await page.setViewportSize({width:1600,height:1200});await open(page,server,spec,host);
 const bar=page.locator('.termbar').first();await expect(bar).toHaveCSS('zoom','0.75');await expect(page.locator('.explore-stage')).toBeHidden();
 await expect.poll(()=>bar.evaluate(el=>{
  const tr=el.querySelector('.step-transport').getBoundingClientRect(),ch=el.querySelector('.schips').getBoundingClientRect(),ca=el.querySelector('.stepline').getBoundingClientRect();
  return tr.bottom<=ch.top+1 && ca.right<=ch.left+1 && ca.height>0;
 })).toBe(true);
 expect(await bar.locator('.schips').evaluate(el=>el.style.getPropertyValue('--path-label-width'))).toBe('300px');
 await bar.getByRole('button',{name:'Next step',exact:true}).click();await expect(bar.locator('.stepid')).toHaveText('s1');
});
