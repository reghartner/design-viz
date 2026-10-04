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
async function build(server,raw,name='canvas-objects'){
 const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/'+name+'.html';
}
async function open(page,server,raw,host){
 if(host==='workbench'){await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);}
 else if(host==='backstage'){
  await writeFile(path.join(server.root,'objects-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'objects-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./objects-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/objects-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},raw);
 }else await page.goto(await build(server,raw));
 await expect(page.locator('.explore-canvas-objects [data-explore-panel=home]')).toBeVisible();
}
const home=page=>page.locator('[data-explore-panel=home]');
const board=page=>page.locator('.explore-board');
const source=page=>page.locator('#src').inputValue();
async function selectPlacement(page,value){await page.locator('.explore-panel-menu summary').click();await page.getByLabel('Panel placement',{exact:true}).selectOption(value);await page.keyboard.press('Escape');}
async function fit(page,host){await page.locator(host==='workbench'?'#workspace-fit':'.explore-diagram-zoom button').filter(host==='workbench'?{}:{hasText:'Fit canvas'}).click();}
async function graphPoint(page,point){return board(page).evaluate((el,p)=>{const svg=el.querySelector('.boardcanvas>svg'),r=svg.getBoundingClientRect(),scale=r.width/svg.viewBox.baseVal.width;return {x:(p.x-r.x)/scale,y:(p.y-r.y)/scale,scale};},point);}
async function drag(page,locator,dx,dy){const r=await locator.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:5});await page.mouse.up();}
for(const host of ['reader','workbench','backstage'])test(host+': canvas objects pan and zoom with the graph, Fit recovers all objects at desktop sizes',async({page,server},info)=>{
 for(const [width,height] of [[1280,800],[1440,900],[1920,1200]]){
  await page.setViewportSize({width,height});await open(page,server,fixture(),host);await page.evaluate(()=>document.fonts.ready);await fit(page,host);
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
 const h=home(page);await drag(page,h.locator('.explore-window-grip'),60,40);const moved=await h.getAttribute('style');
 await drag(page,h.locator('.explore-window-resize'),30,20);const resized=await h.getAttribute('style');expect(resized).not.toBe(moved);
 await selectPlacement(page,'floating');expect(await page.evaluate(()=>location.hash)).toBe(hash);expect(await h.evaluate(el=>el.parentElement.className)).toBe('explore-stage');const floating=await h.getAttribute('style');
 await selectPlacement(page,'canvas');expect(await h.getAttribute('style')).toBe(resized);expect(await page.evaluate(()=>location.hash)).toBe(hash);
 await selectPlacement(page,'floating');expect(await h.getAttribute('style')).toBe(floating);
 await selectPlacement(page,'canvas');await fit(page,'reader');await h.locator('.explore-window-hide').click();await expect(h).toBeHidden();
 await page.locator('.explore-panel-menu summary').click();await page.locator('.explore-panel-choices label').filter({hasText:'The home'}).locator('input').check();await page.keyboard.press('Escape');await expect(h).toBeVisible();
 await page.reload();await expect(h).toHaveCSS('left','-380px');await expect(h).toHaveCSS('width','340px');
});
test('Workbench canvas mode and object gestures save one Undo action, preserve the other layout, and export',async({page,server,context})=>{
 const raw=fixture(false);await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);const states=[await source(page)];
 for(const action of [()=>selectPlacement(page,'canvas'),()=>drag(page,home(page).locator('.explore-window-grip'),50,30),()=>drag(page,home(page).locator('.explore-window-resize'),30,25),()=>drag(page,page.locator('[data-explore-content=prose] .explore-window-grip'),20,15),async()=>{await page.locator('.explore-panel-menu summary').click();await page.getByRole('button',{name:'Shrink controls',exact:true}).click();await page.keyboard.press('Escape');}]){
  await closeTools(page);if(states.length>1)await fit(page,'workbench');await action();await expect.poll(async()=>await source(page)!==states.at(-1)).toBe(true);const next=await source(page);states.push(next);
  expect(JSON.parse(next).page.sections[0].diagram.layouts[1].exploreLayout.panels).toEqual(raw.page.sections[0].diagram.layouts[1].exploreLayout.panels);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(states.at(-2));await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(next);
 }
 for(let i=states.length-2;i>=0;i--){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(states[i]);}await expect(page.locator('#undo-builder')).toBeDisabled();
 for(const text of states.slice(1)){await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(text);}await expect(page.locator('#redo-builder')).toBeDisabled();
 const saved=JSON.parse(states.at(-1)),reader=await context.newPage();await reader.goto(await build(server,saved,'canvas-export'));const r=saved.page.sections[0].diagram.layouts[1].exploreLayout.canvas.panels.find(p=>p.panel==='home');expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).left))).toBeCloseTo(r.x,1);expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).width))).toBeCloseTo(r.w,1);
 const layout=saved.page.sections[0].diagram.layouts[1].exploreLayout;expect(layout.overlayScale).toBeUndefined();expect(layout.canvas.controlsScale).toBe(.9);
 expect(await reader.locator('.explore-stage').evaluate(el=>el.style.getPropertyValue('--explore-overlay-scale'))).toBe('0.9');
 await selectPlacement(reader,'floating');expect(await reader.locator('.explore-stage').evaluate(el=>el.style.getPropertyValue('--explore-overlay-scale'))).toBe('1');
 expect((await home(reader).boundingBox()).width).toBeCloseTo((await reader.locator('.explore-stage').boundingBox()).width*.25,0);
 await selectPlacement(reader,'canvas');expect(await reader.locator('.explore-stage').evaluate(el=>el.style.getPropertyValue('--explore-overlay-scale'))).toBe('0.9');
 expect(await home(reader).evaluate(el=>parseFloat(getComputedStyle(el).width))).toBeCloseTo(r.w,1);await reader.close();
});

test('Fit recovers a far-away canvas panel and Floating retains its normal zoom floor',async({page,server})=>{
 const raw=fixture(),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.canvas.panels[0].x=9000;layout.canvas.panels[0].y=-9000;
 await open(page,server,raw,'reader');await fit(page,'reader');const r=await home(page).boundingBox(),stage=await page.locator('.explore-stage').boundingBox();expect(r.x).toBeGreaterThanOrEqual(stage.x);expect(r.y).toBeGreaterThanOrEqual(stage.y);expect(r.x+r.width).toBeLessThanOrEqual(stage.x+stage.width);expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height);
 expect((await graphPoint(page,{x:0,y:0})).scale).toBeLessThan(.15);
 await selectPlacement(page,'floating');expect((await graphPoint(page,{x:0,y:0})).scale).toBeGreaterThanOrEqual(.149);
 await selectPlacement(page,'canvas');await fit(page,'reader');await expect(home(page)).toHaveCSS('left','9000px');
});

test('canvas widget buttons, keyboard handles, step content and visibility retain their interactions',async({page,server})=>{
 const raw=fixture(),d=raw.page.sections[0].diagram,app=structuredClone(JSON.parse(await readFile(path.join(repo,'src/starters/device-app-sources.json'),'utf8')).page.sections[0].diagram.panels[0]);
 app.id='app';app.sources=[{id:'telemetry',label:'Device telemetry',node:'camera'}];app.fields.forEach(f=>f.source='telemetry');app.showSources=true;
 d.panels.push(app);d.layouts[1].sectionLayout.default.push({panel:'app',x:8,y:36,w:4,h:12});d.layouts[1].exploreLayout.canvas.panels.push({panel:'app',x:-380,y:360,w:340,h:720});
 d.steps[1].panels.app={battery:{value:42,status:'ready'}};d.steps[1].panelVisibility={outcome:false};
 await open(page,server,raw,'reader');await fit(page,'reader');const widget=page.locator('[data-explore-panel=app]'),button=widget.locator('[data-da-field=battery]');
 const target=await button.boundingBox();await board(page).dispatchEvent('wheel',{clientX:target.x+target.width/2,clientY:target.y+target.height/2,deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});
 const before=await board(page).evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));await button.click();await expect(page.locator('.boardcanvas>svg [data-dv-node=camera]')).toHaveClass(/da-node-focus/);expect(await board(page).evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}))).toEqual(before);
 await fit(page,'reader');const h=home(page),r=await h.boundingBox();await h.locator('.explore-window-grip').focus();await page.keyboard.press('ArrowRight');const moved=await h.boundingBox();expect(moved.x-r.x).toBeCloseTo(8,0);
 await h.locator('.explore-window-resize').focus();await page.keyboard.press('ArrowDown');expect((await h.boundingBox()).height-moved.height).toBeCloseTo(8,0);
 await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(widget.locator('[data-da-field=battery] .da-value')).toHaveText('42%');await expect(page.locator('[data-explore-panel=outcome]')).toBeHidden();
 await page.getByRole('button',{name:'Previous step',exact:true}).click();await expect(page.locator('[data-explore-panel=outcome]')).toBeVisible();
});
