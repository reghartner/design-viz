import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const starter=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
function fixture(canvas=true){
 const raw=structuredClone(starter),s=raw.page.sections[0],d=s.diagram;s.id='canvas-story';s.text='Section notes stay with the diagram.';d.autoplay=false;d.defaultLayout='service-flow';
 d.layouts[1].sectionLayout.default.forEach(t=>{if(t.panel)t.hidden=false;});
 d.layouts[1].exploreLayout={panelPlacement:canvas?'canvas':'floating',panels:[{panel:'home',x:.65,y:.1,w:.25,h:.3,stacked:false}],canvas:{panels:[
 {panel:'home',x:-380,y:20,w:340,h:300},{panel:'clip',x:500,y:450,w:340,h:280},{panel:'outcome',x:900,y:20,w:300,h:240}],prose:{x:900,y:310,w:300,h:180}}};
 return raw;
}
function intrinsicFixture(){
 const raw=fixture(),d=raw.page.sections[0].diagram,view=d.layouts[1],pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
 d.panels.push(
  {id:'radar',type:'radar',title:'Porch radar',initial:{subject:{x:132,y:108}}},
  {id:'zones',type:'zoneframe',title:'Camera zones',zones:[{id:'porch',label:'Porch',points:[[20,30],[150,22],[145,150],[28,145]]}],initial:{zones:[{id:'porch',state:'armed'}],subject:{x:90,y:92}}},
  {id:'reference',type:'image',title:'Reference',src:pixel,alt:'One pixel test image',caption:'Embedded reference caption',link:'https://example.com/reference'},
  {id:'orbit',type:'orbit',title:'Lifecycle',states:['IDLE','ACTIVE','DONE'],initial:{state:'IDLE'}}
 );
 ['radar','zones','reference','orbit'].forEach((panel,i)=>view.sectionLayout.default.push({panel,x:(i%2)*4,y:44+Math.floor(i/2)*8,w:4,h:8}));
 const panels=view.exploreLayout.canvas.panels;panels.find(p=>p.panel==='home').x=-360;panels.find(p=>p.panel==='home').y=0;panels.find(p=>p.panel==='clip').x=500;panels.find(p=>p.panel==='clip').y=0;panels.find(p=>p.panel==='outcome').x=900;panels.find(p=>p.panel==='outcome').y=0;
 panels.push({panel:'radar',x:-360,y:310,w:320,h:900},{panel:'zones',x:0,y:310,w:320,h:900},{panel:'reference',x:360,y:310,w:260,h:900},{panel:'orbit',x:660,y:310,w:320,h:900});
 return raw;
}
async function build(server,raw,name='canvas-objects'){
 const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/'+name+'.html';
}
async function open(page,server,raw,host){
 if(host==='workbench'){await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);}
 else if(host==='backstage' || host==='inline'){
  await writeFile(path.join(server.root,'objects-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'objects-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./objects-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/objects-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(({raw,expanded})=>{window.viewer=mount(document.querySelector('#host'),raw);if(expanded)viewer.setCanvas(true);},{raw,expanded:host==='backstage'});
 }else await page.goto(await build(server,raw));
 await expect(page.locator('.explore-canvas-objects [data-explore-panel=home]')).toBeVisible();
}
const home=page=>page.locator('[data-explore-panel=home]');
const outcome=page=>page.locator('[data-explore-panel=outcome]');
const clip=page=>page.locator('[data-explore-panel=clip]');
const board=page=>page.locator('.explore-board');
const source=page=>page.locator('#src').inputValue();
async function selectPlacement(page,value){await page.locator('.explore-panel-menu summary').click();await page.getByLabel('Default panel placement',{exact:true}).selectOption(value);await page.keyboard.press('Escape');}
async function fit(page,host){await page.locator(host==='workbench'?'#workspace-fit':'.explore-diagram-zoom button').filter(host==='workbench'?{}:{hasText:'Fit canvas'}).click();}
async function graphPoint(page,point){return board(page).evaluate((el,p)=>{const svg=el.querySelector('.boardcanvas>svg'),r=svg.getBoundingClientRect(),scale=r.width/svg.viewBox.baseVal.width;return {x:(p.x-r.x)/scale,y:(p.y-r.y)/scale,scale};},point);}
async function drag(page,locator,dx,dy){const r=await locator.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:5});await page.mouse.up();}
async function selectCanvas(locator){await locator.focus();await expect(locator).toHaveAttribute('aria-current','true');}
async function expectCanvasChrome(locator,selected){
 const border=await locator.evaluate(el=>{const style=getComputedStyle(el),viewport=el.closest('.section-viewport');return {color:style.borderTopColor,width:style.borderTopWidth,theme:getComputedStyle(viewport).getPropertyValue('--explore-border').trim()};});
 expect(border.width).toBe('1px');expect(border.color).toBe(await locator.evaluate((el,value)=>{const probe=document.createElement('i');probe.style.color=value;el.appendChild(probe);const color=getComputedStyle(probe).color;probe.remove();return color;},border.theme));
 await expect(locator.locator('.explore-window-header')).toHaveCSS('display',selected?'flex':'none');
 await expect(locator.locator('.explore-window-resize')).toHaveCSS('display',selected?'block':'none');
 if(selected){await expect(locator).toHaveClass(/explore-canvas-selected/);expect(await locator.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');}
 else{await expect(locator).not.toHaveClass(/explore-canvas-selected/);await expect(locator).not.toHaveAttribute('aria-current','true');await expect(locator).toHaveCSS('box-shadow','none');}
}
async function compactMetrics(locator){return locator.evaluate(el=>{const body=el.querySelector('.explore-window-body'),card=body.firstElementChild;return {outer:el.offsetHeight,body:body.clientHeight,content:card.scrollHeight,gap:body.clientHeight-card.scrollHeight,overflow:card.scrollHeight-body.clientHeight,width:el.offsetWidth,scrollable:body.scrollHeight>body.clientHeight};});}
async function emptyCanvasPoint(page){return board(page).evaluate(el=>{const r=el.getBoundingClientRect(),occupied='.explore-window,.explore-player,.explore-tools,a,button,input,select,textarea,[role="button"],[data-dv-node],[data-dv-step],[data-dv-edge],[data-dv-group],[data-dv-row]';for(let y=r.top+80;y<r.bottom-80;y+=30)for(let x=r.left+30;x<r.right-60;x+=30){const hit=document.elementFromPoint(x,y);if(hit && !hit.closest(occupied))return {x,y};}throw Error('No empty canvas point');});}
for(const host of ['reader','workbench','backstage'])test(host+': canvas objects pan and zoom with the graph, Fit recovers all objects at desktop sizes',async({page,server},info)=>{
 for(const [width,height] of [[1280,800],[1440,900],[1920,1200]]){
  await page.setViewportSize({width,height});await open(page,server,fixture(),host);await page.evaluate(()=>document.fonts.ready);await fit(page,host);
  expect((await compactMetrics(home(page))).gap).toBeLessThanOrEqual(2);expect((await compactMetrics(outcome(page))).gap).toBeLessThanOrEqual(2);expect((await compactMetrics(clip(page))).gap).toBeLessThanOrEqual(2);
  const stage=await page.locator('.explore-stage').boundingBox();
  for(const loc of [page.locator('.boardcanvas>svg'),...await page.locator('.explore-window:visible').all()]){const r=await loc.boundingBox();expect(r.x).toBeGreaterThanOrEqual(stage.x-2);expect(r.y).toBeGreaterThanOrEqual(stage.y-2);expect(r.x+r.width).toBeLessThanOrEqual(stage.x+stage.width+2);expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height+2);}
  const player=await page.locator('.explore-player').boundingBox(),before=await home(page).boundingBox();
  await board(page).evaluate(el=>{el.scrollLeft+=90;el.scrollTop+=65;});
  const after=await home(page).boundingBox();expect(after.x-before.x).toBeCloseTo(-90,0);expect(after.y-before.y).toBeCloseTo(-65,0);expect(await page.locator('.explore-player').boundingBox()).toEqual(player);
  const pointer={x:stage.x+stage.width*.55,y:stage.y+stage.height*.4},point=await graphPoint(page,pointer),h1=await home(page).boundingBox();
  await board(page).dispatchEvent('wheel',{clientX:pointer.x,clientY:pointer.y,deltaY:-65,ctrlKey:true,bubbles:true,cancelable:true});
  const next=await graphPoint(page,pointer),h2=await home(page).boundingBox();expect(Math.abs(next.x-point.x)).toBeLessThan(2);expect(Math.abs(next.y-point.y)).toBeLessThan(2);expect(h2.width/h1.width).toBeCloseTo(next.scale/point.scale,2);expect(h2.height/h1.height).toBeCloseTo(next.scale/point.scale,2);expect(await page.locator('.explore-player').boundingBox()).toEqual(player);
  await fit(page,host);const playerTop=(await page.locator('.explore-player').boundingBox()).y;for(const win of await page.locator('.explore-window:visible').all()){const r=await win.boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(playerTop-10);}
  await page.screenshot({path:'/tmp/explore-canvas-'+host+'-'+width+'x'+height+'.png'});await info.attach(host+' '+width+'x'+height,{body:await page.screenshot(),contentType:'image/png'});
 }
});
test('reader mode switching preserves independent layouts, story state, widget access and session isolation',async({page,server})=>{
 const raw=fixture();await open(page,server,raw,'reader');await fit(page,'reader');
 await page.getByRole('button',{name:'Next step',exact:true}).click();const hash=await page.evaluate(()=>location.hash);
 const h=home(page);await selectCanvas(h);await drag(page,h.locator('.explore-window-grip'),60,40);const moved=await h.getAttribute('style');
 await drag(page,h.locator('.explore-window-resize'),30,20);const resized=await h.getAttribute('style');expect(resized).not.toBe(moved);
 await selectPlacement(page,'floating');expect(await page.evaluate(()=>location.hash)).toBe(hash);expect(await h.evaluate(el=>el.parentElement.className)).toBe('explore-stage');await expect(page.locator('.explore-canvas-selected')).toHaveCount(0);const floating=await h.getAttribute('style');
 await selectPlacement(page,'canvas');expect(await h.getAttribute('style')).toBe(resized);expect(await page.evaluate(()=>location.hash)).toBe(hash);await expectCanvasChrome(h,false);
 await selectPlacement(page,'floating');expect(await h.getAttribute('style')).toBe(floating);
 await selectPlacement(page,'canvas');await fit(page,'reader');await selectCanvas(h);await h.locator('.explore-window-hide').click();await expect(h).toBeHidden();
 await page.locator('.explore-panel-menu summary').click();await page.locator('.explore-panel-choices label').filter({hasText:'The home'}).locator('input').check();await page.keyboard.press('Escape');await expect(h).toBeVisible();
 await page.reload();await expect(h).toHaveCSS('left','-380px');await expect(h).toHaveCSS('width','340px');
});
test('Workbench canvas mode and object gestures save one Undo action, preserve the other layout, and export',async({page,server,context})=>{
 const raw=fixture(false);await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);const states=[await source(page)];
 for(const action of [()=>selectPlacement(page,'canvas'),async()=>{await selectCanvas(home(page));await drag(page,home(page).locator('.explore-window-grip'),50,30);},async()=>{await selectCanvas(home(page));await drag(page,home(page).locator('.explore-window-resize'),30,25);},()=>panelPlacement(page,'Section notes','canvas'),async()=>{const notes=page.locator('[data-explore-content=prose]');await selectCanvas(notes);await drag(page,notes.locator('.explore-window-grip'),20,15);},async()=>{await page.locator('.explore-panel-menu summary').click();await page.getByRole('button',{name:'Shrink controls',exact:true}).click();await page.keyboard.press('Escape');}]){
  await closeTools(page);if(states.length>1)await fit(page,'workbench');await action();await expect.poll(async()=>await source(page)!==states.at(-1)).toBe(true);const next=await source(page);states.push(next);
  expect(JSON.parse(next).page.sections[0].diagram.layouts[1].exploreLayout.panels).toEqual(raw.page.sections[0].diagram.layouts[1].exploreLayout.panels);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(states.at(-2));await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(next);
 }
 for(let i=states.length-2;i>=0;i--){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(states[i]);}await expect(page.locator('#undo-builder')).toBeDisabled();
 for(const text of states.slice(1)){await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(text);}await expect(page.locator('#redo-builder')).toBeDisabled();
 const saved=JSON.parse(states.at(-1)),reader=await context.newPage();await reader.goto(await build(server,saved,'canvas-export'));const r=saved.page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='home');expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).left))).toBeCloseTo(r.x,1);expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).width))).toBeCloseTo(r.w,1);
 const layout=saved.page.sections[0].diagram.layouts[1].exploreLayout;expect(layout.overlayScale).toBeUndefined();expect(layout.canvas.controlsScale).toBe(.9);
 expect(await reader.locator('.explore-stage').evaluate(el=>el.style.getPropertyValue('--explore-overlay-scale'))).toBe('0.9');
 await selectPlacement(reader,'floating');await panelPlacement(reader,'Section notes','floating');expect(await reader.locator('.explore-stage').evaluate(el=>el.style.getPropertyValue('--explore-overlay-scale'))).toBe('1');
 expect((await home(reader).boundingBox()).width).toBeCloseTo((await reader.locator('.explore-stage').boundingBox()).width*.25,0);
 await selectPlacement(reader,'canvas');expect(await reader.locator('.explore-stage').evaluate(el=>el.style.getPropertyValue('--explore-overlay-scale'))).toBe('0.9');
 expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).width))).toBeCloseTo(r.w,1);await reader.close();
});

test('Fit recovers a far-away canvas panel and Floating retains its normal zoom floor',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.canvas.panels[0].x=9000;layout.canvas.panels[0].y=-9000;
 await open(page,server,raw,'reader');await fit(page,'reader');const r=await home(page).boundingBox(),stage=await page.locator('.explore-stage').boundingBox();expect(r.x).toBeGreaterThanOrEqual(stage.x);expect(r.y).toBeGreaterThanOrEqual(stage.y);expect(r.x+r.width).toBeLessThanOrEqual(stage.x+stage.width);expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height);
 expect((await graphPoint(page,{x:0,y:0})).scale).toBeLessThan(.15);
 await selectPlacement(page,'floating');await panelPlacement(page,'Section notes','floating');expect((await graphPoint(page,{x:0,y:0})).scale).toBeGreaterThanOrEqual(.149);
 await selectPlacement(page,'canvas');await fit(page,'reader');await expect(home(page)).toHaveCSS('left','9000px');
});

test('canvas selection is transient across Explore view teardown and rebuild',async({page,server})=>{
 await open(page,server,fixture(),'reader');const panel=home(page);await expectCanvasChrome(panel,false);
 await page.locator('#docview>.explore-navigation .diagram-view-choice button[aria-pressed="true"]').focus();
 for(let i=0;i<40 && !(await panel.getAttribute('aria-current'));i++)await page.keyboard.press('Tab');
 await expect(panel).toBeFocused();await expectCanvasChrome(panel,true);await page.keyboard.press('Escape');await expectCanvasChrome(panel,false);
 await page.locator('#docview>.explore-navigation .diagram-view-choice button[aria-pressed="true"]').focus();await selectCanvas(panel);await expect(page.locator('.explore-canvas-selected')).toHaveCount(1);
 await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(page.locator('.explore-canvas-selected')).toHaveCount(0);
 await page.getByRole('button',{name:'Service flow',exact:true}).click();await expect(home(page)).toBeVisible();await expectCanvasChrome(home(page),false);
});

test('compact canvas policies follow content, captions, long chips and themed borders',async({page,server},info)=>{
 for(const skin of ['pastel','aurora','editorial','terminal','blueprint']){
  const raw=fixture();raw.page.skin=skin;await open(page,server,raw,'reader');await page.evaluate(()=>document.fonts.ready);
  await expectCanvasChrome(home(page),false);await expectCanvasChrome(outcome(page),false);
 }
 const raw=fixture(),d=raw.page.sections[0].diagram,canvas=d.layouts[1].exploreLayout.canvas;
 canvas.panels.find(p=>p.panel==='home').w=140;canvas.panels.find(p=>p.panel==='home').h=9000;
 canvas.panels.find(p=>p.panel==='clip').h=9000;
 const stateRect=canvas.panels.find(p=>p.panel==='outcome');stateRect.w=150;stateRect.h=9000;
 const state=d.panels.find(p=>p.id==='outcome');state.states=Array.from({length:36},(_,i)=>'Long status '+String(i+1).padStart(2,'0'));state.initial.state=state.states[0];
 d.steps[1].panels.home.cam={state:'detect',audio:{connection:'connected',microphone:'listening',output:'speech',text:'Please leave the package beside the blue door.',source:'Resident'}};
 await open(page,server,raw,'reader');await page.evaluate(()=>document.fonts.ready);await fit(page,'reader');
 const initialHome=await compactMetrics(home(page)),initialClip=await compactMetrics(clip(page)),longState=await compactMetrics(outcome(page));
 expect(initialHome.width).toBe(140);expect(initialHome.gap).toBeLessThanOrEqual(2);expect(initialClip.outer).toBeLessThan(280);expect(initialClip.gap).toBeLessThanOrEqual(2);expect(longState.outer).toBe(320);expect(longState.overflow).toBeGreaterThan(0);expect(longState.scrollable).toBe(true);
 expect((await graphPoint(page,{x:0,y:0})).scale).toBeGreaterThan(.25);
 await page.screenshot({path:'/tmp/explore-compact-before-caption.png'});await info.attach('compact home and capped long state before caption',{body:await page.screenshot(),contentType:'image/png'});
 await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(home(page).locator('.hmaudio-captions')).toBeVisible();
 const captioned=await compactMetrics(home(page)),activeClip=await compactMetrics(clip(page));expect(captioned.outer).toBeGreaterThan(initialHome.outer);expect(captioned.gap).toBeLessThanOrEqual(2);expect(activeClip.outer).toBe(initialClip.outer);expect(activeClip.gap).toBeLessThanOrEqual(2);
 await page.screenshot({path:'/tmp/explore-compact-after-caption.png'});await info.attach('compact home after audio caption',{body:await page.screenshot(),contentType:'image/png'});
 await page.getByRole('button',{name:'Previous step',exact:true}).click();await expect.poll(async()=>(await compactMetrics(home(page))).outer).toBe(initialHome.outer);
});

test('intrinsic visual canvas panels fit their rendered shapes across step updates',async({page,server},info)=>{
 await page.setViewportSize({width:1280,height:800});await open(page,server,intrinsicFixture(),'reader');await page.evaluate(()=>document.fonts.ready);
 const ids=['home','clip','outcome','radar','zones','reference','orbit'];await expect(page.locator('[data-explore-panel=reference] img')).toHaveJSProperty('complete',true);
 await expect.poll(async()=>Math.max(...await Promise.all(ids.map(async id=>(await compactMetrics(page.locator('[data-explore-panel='+id+']'))).gap)))).toBeLessThanOrEqual(2);
 for(const id of ids)expect((await compactMetrics(page.locator('[data-explore-panel='+id+']'))).gap).toBeLessThanOrEqual(2);
 const orbitPanel=page.locator('[data-explore-panel=orbit]');expect(await orbitPanel.locator('.orbit').evaluate(el=>el.clientWidth/el.clientHeight)).toBeCloseTo(220/156,2);expect(await orbitPanel.locator('.orbit').evaluate(el=>el.clientWidth)).toBeGreaterThan(280);
 await fit(page,'reader');await page.screenshot({path:'/tmp/explore-compact-intrinsic-mixed-1280x800.png'});await info.attach('intrinsic visual panels 1280x800',{body:await page.screenshot(),contentType:'image/png'});
 await page.getByRole('button',{name:'Next step',exact:true}).click();for(const id of ['clip','radar','zones','reference','orbit'])expect((await compactMetrics(page.locator('[data-explore-panel='+id+']'))).gap).toBeLessThanOrEqual(2);
});

test('Workbench compact resize persists canonical geometry as one Undo action',async({page,server,context},info)=>{
 const raw=fixture();await open(page,server,raw,'workbench');await page.evaluate(()=>document.fonts.ready);await fit(page,'workbench');
 const initial=await source(page),initialHome=await compactMetrics(home(page));await expect(page.locator('#undo-builder')).toBeDisabled();
 expect(JSON.parse(initial).page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='home').h).toBe(300);expect(initialHome.outer).toBeLessThan(300);
 await selectCanvas(home(page));await drag(page,home(page).locator('.explore-window-grip'),24,16);const moved=await source(page),movedHome=JSON.parse(moved).page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='home');
 expect(movedHome.h).toBe(300);expect((await compactMetrics(home(page))).outer).toBe(initialHome.outer);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await expect(page.locator('#undo-builder')).toBeDisabled();
 await selectCanvas(home(page));await expect(home(page).locator('.explore-window-resize')).toHaveAttribute('aria-label',/visual proportions stay fixed; panel height fits content/);
 await page.screenshot({path:'/tmp/explore-compact-old-saved-snug.png'});await info.attach('old saved home rectangle displayed snugly',{body:await page.screenshot(),contentType:'image/png'});
 await drag(page,home(page).locator('.explore-window-resize'),0,28);const resized=await source(page),saved=JSON.parse(resized),savedHome=saved.page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='home'),homeMetrics=await compactMetrics(home(page));
 expect(resized).not.toBe(initial);expect(savedHome.w).toBeGreaterThan(340);expect(savedHome.h).toBeCloseTo(homeMetrics.outer,0);expect(homeMetrics.gap).toBeLessThanOrEqual(2);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await expect(page.locator('#undo-builder')).toBeDisabled();expect((await compactMetrics(home(page))).outer).toBe(initialHome.outer);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(resized);
 const beforeState=await source(page);await selectCanvas(outcome(page));await expect(outcome(page).locator('.explore-window-resize')).toHaveAttribute('aria-label',/height fits content from its width/);await outcome(page).locator('.explore-window-resize').focus();await page.keyboard.press('ArrowDown');
 const stateSource=await source(page),stateSaved=JSON.parse(stateSource).page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='outcome'),stateMetrics=await compactMetrics(outcome(page));
 expect(stateSource).not.toBe(beforeState);expect(stateSaved.w).toBeGreaterThan(300);expect(stateSaved.h).toBeCloseTo(stateMetrics.outer,0);expect(stateMetrics.gap).toBeLessThanOrEqual(2);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeState);
 const beforeClip=await source(page),oldClip=JSON.parse(beforeClip).page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='clip');expect(oldClip.h).toBe(280);expect((await compactMetrics(clip(page))).outer).toBeLessThan(oldClip.h);
 await selectCanvas(clip(page));await expect(clip(page).locator('.explore-window-resize')).toHaveAttribute('aria-label',/visual proportions stay fixed; panel height fits content/);await drag(page,clip(page).locator('.explore-window-resize'),24,0);
 const clipSource=await source(page),savedClip=JSON.parse(clipSource).page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='clip'),clipMetrics=await compactMetrics(clip(page));expect(savedClip.w).toBeGreaterThan(oldClip.w);expect(savedClip.h).toBeCloseTo(clipMetrics.outer,0);expect(clipMetrics.gap).toBeLessThanOrEqual(2);
 await page.screenshot({path:'/tmp/explore-compact-screen-after-resize.png'});await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeClip);
 const reader=await context.newPage();await reader.goto(await build(server,saved,'compact-canonical-reload'));expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).width))).toBeCloseTo(savedHome.w,1);expect((await compactMetrics(home(reader))).outer).toBeCloseTo(savedHome.h,0);await reader.close();
 await page.screenshot({path:'/tmp/explore-compact-after-resize.png'});await info.attach('explicit proportional home resize',{body:await page.screenshot(),contentType:'image/png'});
});

test('canvas widget buttons, keyboard handles, step content and visibility retain their interactions',async({page,server})=>{
 const raw=mixedFixture(),d=raw.page.sections[0].diagram,app=structuredClone(JSON.parse(await readFile(path.join(repo,'src/starters/device-app-sources.json'),'utf8')).page.sections[0].diagram.panels[0]);
 app.id='app';app.sources=[{id:'telemetry',label:'Device telemetry',node:'camera'}];app.fields.forEach(f=>f.source='telemetry');app.showSources=true;
 d.panels.push(app);d.layouts[1].sectionLayout.default.push({panel:'app',x:8,y:36,w:4,h:12});d.layouts[1].exploreLayout.canvas.panels.push({panel:'app',x:-380,y:360,w:340,h:720});
 d.steps[1].panels.app={battery:{value:42,status:'ready'}};d.steps[1].panelVisibility={outcome:false};
 await open(page,server,raw,'reader');await fit(page,'reader');const widget=page.locator('[data-explore-panel=app]'),button=widget.locator('[data-da-field=battery]');
 const target=await button.boundingBox();await board(page).dispatchEvent('wheel',{clientX:target.x+target.width/2,clientY:target.y+target.height/2,deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});
 const before=await board(page).evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));await button.click();await expect(page.locator('.boardcanvas>svg [data-dv-node=camera]')).toHaveClass(/da-node-focus/);expect(await board(page).evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}))).toEqual(before);await expect(widget).toHaveAttribute('aria-current','true');
 await fit(page,'reader');const h=home(page),r=await h.boundingBox();await selectCanvas(h);await h.locator('.explore-window-grip').focus();await page.keyboard.press('ArrowRight');const moved=await h.boundingBox();expect(moved.x-r.x).toBeCloseTo(8,0);
 await h.locator('.explore-window-resize').focus();await page.keyboard.press('ArrowDown');expect((await h.boundingBox()).height-moved.height).toBeCloseTo(8,0);
 await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(widget.locator('[data-da-field=battery] .da-value')).toHaveText('42%');await expect(page.locator('[data-explore-panel=outcome]')).toBeHidden();
 await page.getByRole('button',{name:'Previous step',exact:true}).click();await expect(page.locator('[data-explore-panel=outcome]')).toBeVisible();
});


test('inline Explore keeps far-below canvas objects inside its scrollable bounds and Fit recovers them',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.canvas.panels[0].x=500;layout.canvas.panels[0].y=9000;
 await page.setViewportSize({width:1440,height:900});await open(page,server,raw,'inline');await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('flowview-root.native-canvas,.workbench-diagram-canvas')).toHaveCount(0);
 const hostBounds=await page.locator('flowview-root').boundingBox(),canvasBounds=await page.locator('.viewer-diagram-canvas').boundingBox(),navBounds=await page.locator('.explore-navigation').boundingBox();
 expect(canvasBounds.x).toBeGreaterThanOrEqual(hostBounds.x);expect(canvasBounds.y).toBeCloseTo(navBounds.y+navBounds.height,0);expect(canvasBounds.x+canvasBounds.width).toBeLessThanOrEqual(hostBounds.x+hostBounds.width+1);expect(canvasBounds.y+canvasBounds.height).toBeLessThanOrEqual(hostBounds.y+hostBounds.height+1);
 const canvas=page.locator('.boardcanvas'),far=home(page),initial=await far.boundingBox(),container=await canvas.boundingBox();
 const margin=await board(page).evaluate(el=>parseFloat(el.style.getPropertyValue('--explore-margin-y')));
 // Absolute objects must have the same trailing scroll margin as the graph,
 // including before Fit, when the saved object is well outside the viewport.
 expect(container.y+container.height).toBeGreaterThanOrEqual(initial.y+initial.height+margin-2);
 const view=await board(page).boundingBox();await board(page).evaluate((el,delta)=>{el.scrollTop+=delta;},initial.y+initial.height/2-view.y-view.height/2);
 const centered=await far.boundingBox();expect(centered.y+centered.height/2).toBeCloseTo(view.y+view.height/2,0);
 await fit(page,'inline');const fitted=await board(page).boundingBox(),player=await page.locator('.explore-player').boundingBox();
 for(const loc of [page.locator('.boardcanvas>svg'),...await page.locator('.explore-window:visible').all()]){
  const r=await loc.boundingBox();expect(r.x).toBeGreaterThanOrEqual(fitted.x-2);expect(r.y).toBeGreaterThanOrEqual(fitted.y-2);expect(r.x+r.width).toBeLessThanOrEqual(fitted.x+fitted.width+2);expect(r.y+r.height).toBeLessThanOrEqual(Math.min(fitted.y+fitted.height,player.y-10)+2);
 }
 await expect(far).toHaveCSS('top','9000px');
});

function mixedFixture(){
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;
 layout.panelPlacements=[{panel:'clip',placement:'floating'}];
 layout.panels.push({panel:'clip',x:.75,y:.03,w:.22,h:.32,stacked:false});
 layout.overlayScale=.8;layout.canvas.controlsScale=.6;
 return raw;
}
async function panelPlacement(page,label,value){
 const menu=page.locator('.explore-panel-menu');if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();
 await page.getByLabel('Placement for '+label,{exact:true}).selectOption(value);await page.keyboard.press('Escape');
}
function overlaps(a,b){return a.x<b.x+b.width-1 && a.x+a.width>b.x+1 && a.y<b.y+b.height-1 && a.y+a.height>b.y+1;}
for(const host of ['reader','workbench','backstage','inline'])test(host+': mixed panel placement keeps floating windows anchored and fits around them',async({page,server},info)=>{
 for(const [width,height] of [[1280,800],[1440,900],[1920,1200]]){
  await page.setViewportSize({width,height});await open(page,server,mixedFixture(),host);await page.evaluate(()=>document.fonts.ready);await fit(page,host);
  expect((await compactMetrics(home(page))).gap).toBeLessThanOrEqual(2);expect((await compactMetrics(outcome(page))).gap).toBeLessThanOrEqual(2);
  expect(await clip(page).evaluate(el=>el.parentElement.className)).toBe('explore-stage');
  const original=host==='workbench'?await source(page):null,canvasPanel=home(page),notes=page.locator('[data-explore-content=prose]');
  await expectCanvasChrome(canvasPanel,false);await expectCanvasChrome(notes,false);
  await expect(clip(page).locator('.explore-window-header')).toHaveCSS('display','flex');await expect(clip(page).locator('.explore-window-resize')).toHaveCSS('display','block');
  const panelRect=await canvasPanel.boundingBox();await page.mouse.click(panelRect.x+4,panelRect.y+4);await expectCanvasChrome(canvasPanel,true);
  await info.attach(host+' selected canvas chrome '+width,{body:await page.screenshot(),contentType:'image/png'});
  const empty=await emptyCanvasPoint(page);await page.mouse.click(empty.x,empty.y);await expectCanvasChrome(canvasPanel,false);
  await notes.focus();await expectCanvasChrome(notes,true);await expect(notes.locator('.sec-prose')).toHaveCSS('color',/./);
  await page.mouse.click(empty.x,empty.y);await expectCanvasChrome(notes,false);
  if(host==='workbench'){await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();}
  const floating=await clip(page).boundingBox(),player=await page.locator('.explore-player').boundingBox(),stage=await page.locator('.explore-stage').boundingBox();
  expect(floating.width).toBeCloseTo(stage.width*.22*.8,0);
  for(const loc of [page.locator('.boardcanvas>svg'),...await page.locator('.explore-canvas-objects .explore-window:visible').all()]){
   const r=await loc.boundingBox();expect(r.x).toBeGreaterThanOrEqual(stage.x-2);expect(r.y).toBeGreaterThanOrEqual(stage.y-2);expect(r.x+r.width).toBeLessThanOrEqual(stage.x+stage.width+2);expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height+2);expect(overlaps(r,floating)).toBe(false);expect(overlaps(r,player)).toBe(false);
  }
  const before=await home(page).boundingBox();await board(page).evaluate(el=>{el.scrollLeft+=70;el.scrollTop+=45;});
  const after=await home(page).boundingBox();expect(after.x-before.x).toBeCloseTo(-70,0);expect(after.y-before.y).toBeCloseTo(-45,0);expect(await clip(page).boundingBox()).toEqual(floating);expect(await page.locator('.explore-player').boundingBox()).toEqual(player);
  const pointer={x:stage.x+stage.width*.4,y:stage.y+stage.height*.4},point=await graphPoint(page,pointer);
  await board(page).dispatchEvent('wheel',{clientX:pointer.x,clientY:pointer.y,deltaY:-50,ctrlKey:true,bubbles:true,cancelable:true});
  const next=await graphPoint(page,pointer);expect(Math.abs(next.x-point.x)).toBeLessThan(2);expect(Math.abs(next.y-point.y)).toBeLessThan(2);expect((await home(page).boundingBox()).width/after.width).toBeCloseTo(next.scale/point.scale,2);expect(await clip(page).boundingBox()).toEqual(floating);
  await fit(page,host);await page.screenshot({path:'/tmp/explore-mixed-'+host+'-'+width+'x'+height+'-closed.png'});await info.attach(host+' mixed closed '+width,{body:await page.screenshot(),contentType:'image/png'});await page.locator('.explore-panel-menu summary').click();
  await expect(page.getByLabel('Placement for The home',{exact:true})).toHaveValue('canvas');await expect(page.getByLabel('Placement for Porch camera · simulated clip',{exact:true})).toHaveValue('floating');await expect(page.getByLabel('Default panel placement')).toHaveValue('canvas');
  await page.screenshot({path:'/tmp/explore-mixed-'+host+'-'+width+'x'+height+'.png'});await info.attach(host+' mixed '+width,{body:await page.screenshot(),contentType:'image/png'});
 }
});

test('reader per-panel toggles preserve both geometries, hidden state, independent legacy notes and reload isolation',async({page,server})=>{
 const raw=mixedFixture();await open(page,server,raw,'reader');await fit(page,'reader');const floatingBefore=await clip(page).boundingBox();
 await selectCanvas(home(page));await drag(page,home(page).locator('.explore-window-grip'),30,20);await drag(page,home(page).locator('.explore-window-resize'),20,15);
 const canvasStyle=await home(page).getAttribute('style');
 await page.getByRole('button',{name:'Next step',exact:true}).click();const hash=await page.evaluate(()=>location.hash);
 await panelPlacement(page,'The home','floating');const floatStyle=await home(page).getAttribute('style');expect(await clip(page).boundingBox()).toEqual(floatingBefore);expect(await page.locator('[data-explore-content=prose]').evaluate(el=>el.parentElement.className)).toBe('explore-canvas-objects');
 await panelPlacement(page,'The home','canvas');expect(await home(page).getAttribute('style')).toBe(canvasStyle);expect(await page.evaluate(()=>location.hash)).toBe(hash);
 await panelPlacement(page,'The home','floating');expect(await home(page).getAttribute('style')).toBe(floatStyle);
 await home(page).locator('.explore-window-hide').click();await panelPlacement(page,'The home','canvas');await expect(home(page)).toBeHidden();
 await page.locator('.explore-panel-menu summary').click();await page.locator('.explore-panel-choices label').filter({hasText:'The home'}).locator('input').check();await page.keyboard.press('Escape');await expect(home(page)).toBeVisible();
 await selectPlacement(page,'floating');expect(await home(page).evaluate(el=>el.parentElement.className)).toBe('explore-canvas-objects');expect(await page.locator('[data-explore-content=prose]').evaluate(el=>el.parentElement.className)).toBe('explore-canvas-objects');
 await page.reload();await expect(home(page)).toHaveCSS('left','-380px');await expect(home(page)).toHaveCSS('width','340px');expect(await clip(page).evaluate(el=>el.parentElement.className)).toBe('explore-stage');
});

test('Workbench per-panel placement and gestures each undo once and export a mixed chapter',async({page,server,context})=>{
 const raw=mixedFixture();await open(page,server,raw,'workbench');const initial=await source(page),canvas=raw.page.sections[0].diagram.layouts[1].exploreLayout.canvas;
 await panelPlacement(page,'The home','floating');const toggled=await source(page);expect(toggled).not.toBe(initial);
 let layout=JSON.parse(toggled).page.sections[0].diagram.layouts[1].exploreLayout;expect(layout.panelPlacements).toEqual([{panel:'clip',placement:'floating'},{panel:'home',placement:'floating'}]);expect(layout.canvas).toEqual(canvas);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await expect(page.locator('.explore-canvas-objects [data-explore-panel=home]')).toBeVisible();
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(toggled);expect(await home(page).evaluate(el=>el.parentElement.className)).toBe('explore-stage');
 await home(page).locator('.explore-window-grip').focus();await page.keyboard.press('ArrowLeft');const moved=await source(page);expect(moved).not.toBe(toggled);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(toggled);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);
 await panelPlacement(page,'The home','canvas');const saved=JSON.parse(await source(page));layout=saved.page.sections[0].diagram.layouts[1].exploreLayout;expect(layout.canvas).toEqual(canvas);expect(layout.panels.find(p=>p.panel==='home')).not.toEqual(raw.page.sections[0].diagram.layouts[1].exploreLayout.panels[0]);
 const reader=await context.newPage();await reader.goto(await build(server,saved,'mixed-export'));await expect(reader.locator('.explore-canvas-objects [data-explore-panel=home]')).toBeVisible();expect(await clip(reader).evaluate(el=>el.parentElement.className)).toBe('explore-stage');await expect(home(reader)).toHaveCSS('left','-380px');await expect(home(reader)).toHaveCSS('width','340px');await reader.close();
});

test('mixed floating default remains responsive when another panel uses independently scaled canvas geometry',async({page,server})=>{
 const raw=fixture(false),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;delete layout.panels;layout.panelPlacements=[{panel:'home',placement:'canvas'}];layout.canvas.controlsScale=.5;layout.prose={hidden:true};
 await page.setViewportSize({width:1280,height:800});await open(page,server,raw,'reader');await page.evaluate(()=>document.fonts.ready);
 const r1=await clip(page).boundingBox();expect(await clip(page).evaluate(el=>getComputedStyle(el).getPropertyValue('--explore-overlay-scale'))).toBe('0.8');
 await page.setViewportSize({width:1440,height:900});await expect.poll(async()=>clip(page).evaluate(el=>getComputedStyle(el).getPropertyValue('--explore-overlay-scale'))).toBe('1');
 expect((await clip(page).boundingBox()).width/r1.width).toBeCloseTo(1.25,2);await expect(home(page)).toHaveCSS('width','340px');
});

test('hidden canvas objects are excluded from mixed Fit and stale invalid author source rejects placement edits',async({page,server})=>{
 const raw=mixedFixture();raw.page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels[0].x=9000;
 await open(page,server,raw,'workbench');await fit(page,'workbench');const far=(await graphPoint(page,{x:0,y:0})).scale;
 await selectCanvas(home(page));await home(page).locator('.explore-window-hide').click();await fit(page,'workbench');expect((await graphPoint(page,{x:0,y:0})).scale).toBeGreaterThan(far*2);
 const invalid=(await source(page))+'!';await page.locator('#src').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},invalid);
 await panelPlacement(page,'The home','floating');await expect(page.locator('#src')).toHaveValue(invalid);expect(await home(page).evaluate(el=>el.parentElement.className)).toBe('explore-canvas-objects');
 await page.locator('.explore-panel-menu summary').click();await expect(page.getByLabel('Placement for The home',{exact:true})).toHaveValue('canvas');
});

test('mixed Fit can use a narrow free region beside a large floating panel',async({page,server})=>{
 const raw=mixedFixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.overlayScale=1;layout.panels.find(p=>p.panel==='clip').x=.1;layout.panels.find(p=>p.panel==='clip').y=0;layout.panels.find(p=>p.panel==='clip').w=.85;layout.panels.find(p=>p.panel==='clip').h=.9;
 await page.setViewportSize({width:1280,height:800});await open(page,server,raw,'reader');await fit(page,'reader');
 const floating=await clip(page).boundingBox(),player=await page.locator('.explore-player').boundingBox(),stage=await page.locator('.explore-stage').boundingBox();
 for(const loc of [page.locator('.boardcanvas>svg'),...await page.locator('.explore-canvas-objects .explore-window:visible').all()]){
  const r=await loc.boundingBox();expect(overlaps(r,floating)).toBe(false);expect(overlaps(r,player)).toBe(false);expect(r.x).toBeGreaterThanOrEqual(stage.x-2);expect(r.x+r.width).toBeLessThanOrEqual(stage.x+stage.width+2);
 }
 const fitted=(await graphPoint(page,{x:0,y:0})).scale;expect(fitted).toBeLessThan(.1);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom out',exact:true}).click();expect((await graphPoint(page,{x:0,y:0})).scale).toBeCloseTo(fitted,2);
});

async function controlsPlacement(page,value){await page.locator('.explore-panel-menu summary').click();await page.locator('.explore-panel-menu').getByLabel('Step controls placement',{exact:true}).selectOption(value);await page.keyboard.press('Escape');}
const player=page=>page.locator('.explore-player');
const controlsRect=page=>player(page).evaluate(el=>Object.fromEntries(['x','y','w','h'].map(k=>[k,parseFloat(el.style.getPropertyValue('--float-'+k))])));
for(const host of ['reader','workbench','backstage'])test(host+': canvas step controls retain playback, graph geometry, fit and independent floating placement',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;
 layout.controls={x:.05,y:.75,w:.75,h:.2};layout.controlsPlacement='canvas';layout.canvas.controls={x:-800,y:900,w:720,h:220};
 await open(page,server,raw,host);await fit(page,host);
 await expect(page.locator('.explore-canvas-objects>.explore-player')).toBeVisible();
 await expect(player(page).locator('.explore-player-grip')).toHaveCSS('visibility','hidden');
 const r=await player(page).boundingBox(),stage=await page.locator('.explore-stage').boundingBox();
 expect(r.x).toBeGreaterThanOrEqual(stage.x-2);expect(r.y).toBeGreaterThanOrEqual(stage.y-2);expect(r.x+r.width).toBeLessThanOrEqual(stage.x+stage.width+2);expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height+2);
 await board(page).evaluate(el=>{el.scrollLeft+=60;el.scrollTop+=40;});
 const moved=await player(page).boundingBox();expect(moved.x-r.x).toBeCloseTo(-60,0);expect(moved.y-r.y).toBeCloseTo(-40,0);
 await fit(page,host);const before=await player(page).boundingBox(),point={x:stage.x+stage.width*.5,y:stage.y+stage.height*.5};
 await board(page).dispatchEvent('wheel',{clientX:point.x,clientY:point.y,deltaY:-35,ctrlKey:true,bubbles:true,cancelable:true});
 expect((await player(page).boundingBox()).width).toBeGreaterThan(before.width);await fit(page,host);
 const captionBefore=await player(page).locator('.stepline').textContent();await player(page).getByRole('button',{name:'Next step',exact:true}).click();
 await expect(player(page).locator('.stepline')).not.toHaveText(captionBefore);
 await expect(player(page)).toHaveClass(/explore-canvas-selected/);
 await drag(page,player(page).locator('.explore-player-grip'),40,20);const canvasRect=await controlsRect(page);
 await controlsPlacement(page,'floating');await expect(page.locator('.explore-stage>.explore-player')).toBeVisible();const floatingRect=await controlsRect(page);
 await controlsPlacement(page,'canvas');expect(await controlsRect(page)).toEqual(canvasRect);
 await controlsPlacement(page,'floating');expect(await controlsRect(page)).toEqual(floatingRect);
 if(host==='reader'){await page.reload();expect(await controlsRect(page)).toEqual(layout.canvas.controls);}
});

test('Workbench canvas step controls placement, move and resize each create one Undo and export with both rectangles',async({page,server,context})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.controls={x:.05,y:.75,w:.75,h:.2};
 await open(page,server,raw,'workbench');const original=await source(page);let previous=original;
 for(const action of [()=>controlsPlacement(page,'canvas'),async()=>{await fit(page,'workbench');await player(page).focus();await drag(page,player(page).locator('.explore-player-grip'),40,25);},async()=>{await fit(page,'workbench');await player(page).focus();await drag(page,player(page).locator('.explore-window-resize'),40,30);}]){
  await action();const shown=await player(page).boundingBox(),stageBounds=await page.locator('.explore-stage').boundingBox();expect(shown.y+shown.height).toBeLessThanOrEqual(stageBounds.y+stageBounds.height+2);await expect.poll(async()=>await source(page)!==previous).toBe(true);const next=await source(page);
  expect(JSON.parse(next).page.sections[0].diagram.layouts[1].exploreLayout.controls).toEqual(layout.controls);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(previous);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(next);previous=next;
 }
 const saved=JSON.parse(previous),reader=await context.newPage();await reader.goto(await build(server,saved,'canvas-controls-export'));
 await expect(reader.locator('.explore-canvas-objects>.explore-player')).toBeVisible();expect(await controlsRect(reader)).toEqual(saved.page.sections[0].diagram.layouts[1].exploreLayout.canvas.controls);
 await player(reader).focus();await player(reader).locator('.explore-player-grip').press('ArrowRight');expect(await controlsRect(reader)).not.toEqual(saved.page.sections[0].diagram.layouts[1].exploreLayout.canvas.controls);
 await reader.reload();expect(await controlsRect(reader)).toEqual(saved.page.sections[0].diagram.layouts[1].exploreLayout.canvas.controls);
});

test('canvas step controls survive chapter, profile, preview and editor reload; selection exposes supported actions',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.controlsPlacement='canvas';layout.canvas.controls={x:-800,y:900,w:720,h:220};
 await open(page,server,raw,'workbench');const saved=await source(page);await fit(page,'workbench');
 await player(page).focus();await page.keyboard.press('Enter');await expect(page.locator('#workspace-fit-selection')).toBeEnabled();
 await player(page).focus();await page.keyboard.press('Shift+F10');const menu=page.getByRole('menu',{name:'Object actions'});
 await expect(menu.getByRole('menuitem',{name:'Delete',exact:false})).toHaveAttribute('aria-disabled','true');
 await expect(menu.getByRole('menuitem',{name:'Duplicate',exact:false})).toHaveAttribute('aria-disabled','true');
 await menu.getByRole('menuitem',{name:'Fit selection',exact:true}).click();await closeTools(page);await fit(page,'workbench');
 // Alt marquee includes the controls, and Fit selection can frame them.
 const r=await player(page).boundingBox();await page.keyboard.down('Alt');await page.mouse.move(r.x-10,r.y-10);await page.mouse.down();await page.mouse.move(r.x+r.width+10,r.y+r.height+10,{steps:5});await page.mouse.up();await page.keyboard.up('Alt');
 await expect(player(page)).toHaveClass(/dv-sel/);await expect(player(page).locator('.explore-player-grip')).toHaveCSS('visibility','visible');await expect(page.locator('#workspace-fit-selection')).toBeEnabled();
 await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(page.locator('.explore-stage')).toBeHidden();
 await page.getByRole('button',{name:'Service flow',exact:true}).click();expect(await controlsRect(page)).toEqual(layout.canvas.controls);
 await page.locator('#workspace-appearance>summary').click();await page.getByRole('combobox',{name:'Preview host',exact:true}).selectOption('confluence');
 expect(await controlsRect(page)).toEqual(layout.canvas.controls);await expect(page.locator('#src')).toHaveValue(saved);
 if(!await page.locator('#open-page-preview').isVisible())await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
 const preview=page.locator('#page-preview-view'),previewPlayer=preview.locator('.explore-canvas-objects>.explore-player');await expect(previewPlayer).toBeVisible();
 await preview.getByRole('button',{name:'Fit canvas',exact:true}).click();await previewPlayer.getByRole('button',{name:'Next step',exact:true}).click();
 await previewPlayer.focus();await previewPlayer.locator('.explore-player-grip').press('ArrowRight');await expect(page.locator('#src')).toHaveValue(saved);
 await page.locator('#close-page-preview').click();expect(await controlsRect(page)).toEqual(layout.canvas.controls);
 await page.reload();await closeTools(page);await expect(page.locator('#src')).toHaveValue(saved);expect(await controlsRect(page)).toEqual(layout.canvas.controls);
});


test('step controls inspector placement preserves caption and both geometries with one Undo',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;
 layout.controlsPlacement='canvas';layout.controls={x:.05,y:.75,w:.75,h:.2};layout.canvas.controls={x:-800,y:900,w:720,h:220};layout.steps={textPosition:'right'};
 await open(page,server,raw,'workbench');await fit(page,'workbench');const saved=await source(page);
 await player(page).focus();await page.keyboard.press('Enter');await player(page).focus();await page.keyboard.press('Shift+F10');await page.getByRole('menu',{name:'Object actions'}).getByRole('menuitem',{name:'Inspect',exact:true}).click();
 await page.locator('#guide').getByLabel('Step controls placement',{exact:true}).selectOption('floating');
 const next=await source(page),changed=JSON.parse(next).page.sections[0].diagram.layouts[1].exploreLayout;
 expect(changed).toEqual({...layout,controlsPlacement:'floating'});await expect(page.locator('.explore-stage>.explore-player')).toBeVisible();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);await expect(page.locator('.explore-canvas-objects>.explore-player')).toBeVisible();
});

test('step controls inspector reveals a new canvas rectangle',async({page,server})=>{
 const raw=fixture();await open(page,server,raw,'workbench');
 await player(page).locator('.stepline').click();await page.locator('#guide').getByLabel('Step controls placement',{exact:true}).selectOption('canvas');
 await expect(page.locator('.explore-canvas-objects>.explore-player')).toBeVisible();
 const r=await player(page).boundingBox(),b=await page.locator('.explore-stage').boundingBox();
 expect(r.x).toBeGreaterThanOrEqual(b.x);expect(r.y).toBeGreaterThanOrEqual(b.y);expect(r.x+r.width).toBeLessThanOrEqual(b.x+b.width);expect(r.y+r.height).toBeLessThanOrEqual(b.y+b.height);
});

test('Standard chapters remain usable before and after canvas step controls activate',async({page,server})=>{
 const raw=fixture(),diagram=raw.page.sections[0].diagram;diagram.defaultLayout='home-story';diagram.layouts[1].exploreLayout.controlsPlacement='canvas';
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);
 await expect(page.locator('.doc-sec[data-view-id=home-story]')).toBeVisible();await expect(page.locator('.explore-stage')).toBeHidden();
 await expect(page.locator('#workspace-fit')).toHaveText('Fit diagram');const original=await source(page);
 await page.getByRole('button',{name:'Service flow',exact:true}).click();await expect(page.locator('.explore-canvas-objects>.explore-player')).toBeVisible();await expect(page.locator('#workspace-fit')).toHaveText('Fit canvas');
 await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(page.locator('.explore-stage')).toBeHidden();await expect(page.locator('#workspace-fit')).toHaveText('Fit diagram');
 await expect(page.locator('#src')).toHaveValue(original);
});
