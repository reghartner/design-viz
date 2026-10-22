import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(presentation='standard'){
 return {page:{title:'Follow active camera',sections:[{id:'follow',heading:'Follow the request',diagram:{
  view:'step',autoplay:false,nodes:{a:{title:'Entry'},b:{title:'Local handler'},c:{title:'Remote destination'}},rows:[[]],floats:[{id:'a',x:-500,y:-180},{id:'b',x:400,y:120},{id:'c',x:2400,y:1050}],
  edges:[{from:'a',to:'b',label:'Full route label',labelDy:-160},{from:'b',to:'c',label:'Remote handoff'}],
  steps:[{id:'entry',nodes:['a'],text:'Start at entry'},{id:'remote',nodes:['c'],text:'Inspect remote destination'},{id:'route',edge:'a->b',text:'Read the complete route'},{id:'empty',text:'No diagram activity'}],
  layouts:[{id:'main',name:'Main',presentation,sectionLayout:{default:[{x:0,y:0,w:12,h:14}]}}],defaultLayout:'main'
 }}]}};
}
const section=page=>page.locator('#section-follow');
const board=page=>section(page).locator('.board');
const follow=page=>section(page).locator('.follow-active');
const next=page=>section(page).getByRole('button',{name:'Next step',exact:true});
const previous=page=>section(page).getByRole('button',{name:'Previous step',exact:true});
async function open(page,server,presentation='standard',reader=false,data=fixture(presentation)){
 await page.setViewportSize({width:1440,height:1000});
 const input=JSON.stringify(data,null,2);
 if(reader){const source=path.join(server.root,'follow.json'),output=path.join(server.root,'follow.html');await writeFile(source,input);execFileSync('python3',[path.join(repo,'tools/inject.py'),source,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/follow.html');}
 else{await page.goto(server.origin+'/workbench.html');await paste(page,input);await closeTools(page);}
 await page.evaluate(()=>document.fonts.ready);await expect(follow(page)).toBeVisible();return input;
}
async function camera(page){return board(page).evaluate(el=>{const svg=el.querySelector('.boardcanvas>svg'),s=svg.getBoundingClientRect(),b=el.getBoundingClientRect();return {x:s.x-b.x,y:s.y-b.y,w:s.width};});}
async function background(page){
 return board(page).evaluate(el=>{
  const r=el.getBoundingClientRect(),root=el.getRootNode(),legend=el.classList.contains('explore-board')?null:el.querySelector('.lg')?.getBoundingClientRect();
  for(let y=Math.max(r.top+40,legend?legend.bottom+40:0);y<Math.min(innerHeight,r.bottom)-40;y+=20)
   for(let x=Math.max(0,r.left)+80;x<Math.min(innerWidth,r.right)-80;x+=20){
    const hit=root.elementFromPoint(x,y);
    if(hit?.closest('.boardcanvas') && !hit.closest('a,button,[role="button"],[data-dv-node],[data-dv-step],[data-dv-edge],[data-dv-group],[data-dv-row]'))return {x,y};
   }
  throw Error('No blank diagram canvas found');
 });
}
async function frames(page,n=2){await page.evaluate(n=>new Promise(resolve=>{function frame(){if(--n<=0)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}),n);}
async function fit(page,selectors){
 await expect.poll(()=>board(page).evaluate((el,selectors)=>{
  const b=el.getBoundingClientRect(),legend=el.classList.contains('explore-board')?null:el.querySelector('.lg'),top=legend?Math.max(b.top,legend.getBoundingClientRect().bottom):b.top;
  return selectors.every(selector=>{const nodes=Array.from(el.querySelectorAll(selector));return nodes.length>0 && nodes.every(node=>{const r=node.getBoundingClientRect();return r.left>=b.left+20 && r.right<=b.right-20 && r.top>=top+20 && r.bottom<=b.bottom-20;});});
 },selectors)).toBe(true);
}
for(const presentation of ['standard','explore'])test(`${presentation} follows with intermediate motion, retargets, pauses and resumes without edits`,async({page,server},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const input=await open(page,server,presentation);
 const before=await camera(page);await next(page).click();await frames(page,12);const during=await camera(page);expect(during.w).toBeGreaterThan(before.w);const max=await board(page).locator('svg').evaluate(svg=>svg.viewBox.baseVal.width*1.35);expect(during.w).toBeLessThan(max-1);
 await info.attach('during',{body:await page.screenshot({path:'/tmp/follow-active-'+presentation+'-during.png'}),contentType:'image/png'});
 const turning=await previous(page).evaluate(el=>{const board=el.closest('.doc-sec').querySelector('.board'),svg=board.querySelector('svg'),read=()=>({x:board.scrollLeft,y:board.scrollTop,w:svg.getBoundingClientRect().width});const before=read();el.click();return {before,after:read()};});expect(turning.after).toEqual(turning.before);await frames(page,4);const retarget=await camera(page);
 await fit(page,['[data-dv-node=a]']);await frames(page,50);const settled=await camera(page);expect(retarget).not.toEqual(settled);
 await next(page).click();await frames(page,8);
 const point=await background(page);await page.mouse.move(point.x,point.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-80);await page.keyboard.up('Control');await expect(follow(page)).toHaveText('Resume follow');await frames(page,3);const cancelled=await camera(page);await frames(page,50);expect(await camera(page)).toEqual(cancelled);
 await follow(page).click();await fit(page,['[data-dv-node=c]']);await frames(page,50);expect(await camera(page)).not.toEqual(settled);
 await next(page).click();await fit(page,['[data-dv-node=a]','[data-dv-node=b]','path[data-dv-edge="0"]','text[data-dv-edge="0"]']);await frames(page,50);
 await page.screenshot({path:'/tmp/follow-active-'+presentation+'-route.png'});const route=await camera(page);await next(page).click();await frames(page,50);expect(await camera(page)).toEqual(route);
 await section(page).getByRole('button',{name:'Ambient',exact:true}).click();await frames(page,3);expect((await camera(page)).w).toBe(route.w);const ambient=await camera(page);await frames(page,5);expect(await camera(page)).toEqual(ambient);
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
 await info.attach('final route',{body:await page.screenshot(),contentType:'image/png'});
});
for(const presentation of ['standard','explore'])test(`${presentation} reader honors reduced motion and settles full route bounds`,async({page,server})=>{
 await open(page,server,presentation,true);await next(page).click();await frames(page,3);await fit(page,['[data-dv-node=c]']);const final=await camera(page);await frames(page,4);expect(await camera(page)).toEqual(final);
 await next(page).click();await frames(page,3);await fit(page,['[data-dv-node=a]','[data-dv-node=b]','text[data-dv-edge="0"]']);
 await board(page).focus();await board(page).press('ArrowRight');await expect(follow(page)).toHaveText('Resume follow');
 // Native keyboard panning animates on some desktop platforms even under
 // reduced motion. Force that browser scroll phase before immediate Resume.
 await board(page).evaluate(el=>el.scrollBy({left:80,behavior:'smooth'}));
 await follow(page).click();await frames(page,20);await fit(page,['[data-dv-node=a]','[data-dv-node=b]']);
});

for(const presentation of ['standard','explore'])test(`${presentation} path overview follows the lit route then returns to one-step focus`,async({page,server})=>{
 const data=fixture(presentation),d=data.page.sections[0].diagram;
 d.steps=[{id:'note',nodes:['a'],text:'Node-only introduction'},{id:'first',edge:'a->b',text:'First leg'},{id:'last',edge:'b->c',text:'Last leg'},{id:'other',nodes:['b'],text:'Alternative'}];
 d.paths=[{id:'route',label:'Complete route',steps:['note','first','last']},{id:'other',label:'Other route',steps:['other']}];
 const input=await open(page,server,presentation,false,data);
 await section(page).locator('.path-chip[data-dv-path="other"]').click();await frames(page,3);
 await section(page).locator('.path-chip[data-dv-path="route"]').click();await frames(page,3);
 await fit(page,['[data-dv-node=a]','[data-dv-node=b]','[data-dv-node=c]','text[data-dv-edge]']);
 await expect(section(page).locator('[data-dv-node=c]')).toHaveClass(/lit/);const route=await camera(page);
 await next(page).click();await frames(page,3);await fit(page,['[data-dv-node=a]','[data-dv-node=b]','text[data-dv-edge="0"]']);
 await expect(section(page).locator('[data-dv-node=c]')).not.toHaveClass(/lit/);expect((await camera(page)).w).toBeGreaterThan(route.w);
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('Explore follow avoids floating overlays while canvas objects remain attached',async({page,server})=>{
 const data=fixture('explore'),d=data.page.sections[0].diagram;
 d.panels=[{id:'canvas',type:'state',title:'On canvas',states:['Ready'],initial:{state:'Ready'}},{id:'float',type:'state',title:'Floating',states:['Ready'],initial:{state:'Ready'}}];
 d.layouts[0].sectionLayout.default=[{x:0,y:0,w:8,h:14},{panel:'canvas',x:8,y:0,w:4,h:7},{panel:'float',x:8,y:7,w:4,h:7}];
 d.layouts[0].exploreLayout={panelPlacement:'canvas',panelPlacements:[{panel:'float',placement:'floating'}],canvas:{panels:[{panel:'canvas',x:2700,y:0,w:280,h:300}]}};
 const input=await open(page,server,'explore',false,data);await next(page).click();await frames(page,4);await fit(page,['[data-dv-node=c]']);
 const measured=await section(page).evaluate(sec=>{const graph=sec.querySelector('.boardcanvas>svg'),board=sec.querySelector('.board'),node=sec.querySelector('[data-dv-node=c]').getBoundingClientRect(),object=sec.querySelector('[data-explore-panel=canvas]').getBoundingClientRect(),svg=graph.getBoundingClientRect();return {scale:svg.width/graph.viewBox.baseVal.width,object:object.width,obstacles:Array.from(sec.querySelectorAll('[data-explore-panel=float],.explore-player')).map(el=>{const r=el.getBoundingClientRect();return node.right<=r.left || node.left>=r.right || node.bottom<=r.top || node.top>=r.bottom;}),board:board.clientWidth};});
 expect(measured.obstacles.every(Boolean)).toBe(true);expect(measured.object).toBeCloseTo(280*measured.scale,0);
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
});

for(const presentation of ['standard','explore'])for(const reducedMotion of ['reduce','no-preference'])test(`${presentation} Render and Undo preserve enabled and paused follow cameras (${reducedMotion})`,async({page,server})=>{
 await page.emulateMedia({reducedMotion});
 const data=fixture(presentation);data.page.sections[0].diagram.layouts[0].steps=['remote'];
 const input=await open(page,server,presentation,false,data);await frames(page,4);
 await page.locator('#editor-tab-json').click();const initial=await camera(page);
 await page.locator('#go').click();await frames(page,reducedMotion==='reduce'?4:50);expect(await camera(page)).toEqual(initial);await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 await closeTools(page);const point=await background(page);await page.mouse.move(point.x,point.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-80);await page.keyboard.up('Control');await expect(follow(page)).toHaveText('Resume follow');await frames(page,4);
 await page.locator('#editor-tab-json').click();const manual=await camera(page);
 await page.locator('#go').click();await frames(page,reducedMotion==='reduce'?4:50);expect(await camera(page)).toEqual(manual);await expect(follow(page)).toHaveText('Resume follow');
 await closeTools(page);await follow(page).click();await fit(page,['[data-dv-node=c]']);await frames(page,reducedMotion==='reduce'?4:50);
 await section(page).locator('[data-dv-node=c]').click();await page.locator('#editor-tab-inspect').click();await frames(page,4);const paused=await camera(page);
 const name=page.locator('#guide').getByLabel('Name',{exact:true});await name.fill('Renamed destination');await name.press('Enter');await frames(page,reducedMotion==='reduce'?4:50);
 const edited=await page.locator('#src').inputValue();expect(edited).not.toBe(input);expect(await camera(page)).toEqual(paused);await expect(follow(page)).toHaveText('Resume follow');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(input);await frames(page,reducedMotion==='reduce'?4:50);expect(await camera(page)).toEqual(paused);await expect(follow(page)).toHaveText('Resume follow');
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await frames(page,reducedMotion==='reduce'?4:50);expect(await camera(page)).toEqual(paused);await expect(follow(page)).toHaveText('Resume follow');

});

test('Render and section changes retire in-flight follow without stealing the saved camera',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const data=fixture('explore');data.page.sections.push({id:'other',heading:'Other section',diagram:{nodes:{x:{title:'Other'}},rows:[['x']]}});
 const input=await open(page,server,'explore',false,data);await next(page).click();await frames(page,8);
 await page.locator('#editor-tab-json').click();await page.locator('#go').click();await closeTools(page);await frames(page,4);const restored=await camera(page);await frames(page,50);expect(await camera(page)).toEqual(restored);
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 await previous(page).click();await frames(page,8);await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Previous page',exact:true}).click();await frames(page,50);
 await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Next page',exact:true}).click();await frames(page,4);const returned=await camera(page);await frames(page,50);expect(await camera(page)).toEqual(returned);
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('Standard follows inside outer canvas zoom and Fit returns to the overview',async({page,server})=>{
 const input=await open(page,server);const nav=page.locator('#docview>.explore-navigation');
 await nav.getByLabel('Canvas zoom',{exact:true}).click();await nav.getByRole('button',{name:'Zoom 125%',exact:true}).click();
 await next(page).click();await frames(page,4);await fit(page,['[data-dv-node=c]']);
 expect(await section(page).evaluate(el=>el.style.zoom)).toBe('1.25');
 await section(page).getByRole('button',{name:'Fit diagram',exact:true}).click();await expect(follow(page)).toHaveText('Resume follow');await frames(page,4);
 const fitted=await camera(page);await frames(page,5);expect(await camera(page)).toEqual(fitted);
 await follow(page).click();await frames(page,4);await fit(page,['[data-dv-node=c]']);
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('Standard on-canvas step controls follow the active camera scale without editing the arrangement',async({page,server})=>{
 const data=fixture(),layout=data.page.sections[0].diagram.layouts[0];
 layout.exploreLayout={controlsPlacement:'canvas',controlsScale:.9,canvas:{controls:{x:0,y:0,w:720,h:220}}};
 const input=await open(page,server,'standard',false,data),controls=section(page).locator('.standard-controls-player');
 await expect(controls).toBeVisible();
 const before=await camera(page);await next(page).click();await frames(page,4);await fit(page,['[data-dv-node=c]']);
 expect((await camera(page)).w).toBeGreaterThan(before.w);
 await expect.poll(()=>board(page).evaluate(el=>{
  const svg=el.querySelector('.boardcanvas>svg'),controls=el.querySelector('.standard-controls-player');
  return Math.abs(controls.getBoundingClientRect().width/parseFloat(controls.style.getPropertyValue('--float-w'))-svg.getBoundingClientRect().width/svg.viewBox.baseVal.width);
 })).toBeLessThan(.01);
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
});


test.describe('Desktop touchscreen takeover',()=>{
 test.use({hasTouch:true});
 test('native touch pan on blank Standard canvas pauses follow without intercepting scrolling',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});const input=await open(page,server);
  await next(page).click();await fit(page,['[data-dv-node=c]']);await frames(page,50);
  await previous(page).click();await frames(page,6);const point=await background(page);
  await board(page).evaluate(el=>{el.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')window.__followTouchEvent=event;},{once:true});});
  const touch=await page.context().newCDPSession(page);
  const send=(type,x=point.x,y=point.y)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,radiusX:4,radiusY:4,force:1,id:1}]});
  await send('touchStart');await expect(follow(page)).toHaveText('Resume follow');
  expect(await page.evaluate(()=>__followTouchEvent.defaultPrevented)).toBe(false);await expect(board(page)).not.toHaveClass(/board-dragging/);
  const paused=await camera(page);await frames(page,12);expect(await camera(page)).toEqual(paused);
  const beforePan=await board(page).evaluate(el=>el.scrollLeft);
  for(let i=1;i<=8;i++){await send('touchMove',point.x+i*10);await frames(page,2);}
  await expect.poll(()=>board(page).evaluate(el=>el.scrollLeft)).toBeLessThan(beforePan-20);
  // Finish without a fling so camera stability measures Follow, not native inertia.
  await frames(page,10);await send('touchEnd');await frames(page,10);const panned=await camera(page);
  await next(page).evaluate(el=>el.click());await frames(page,50);expect(await camera(page)).toEqual(panned);await expect(follow(page)).toHaveText('Resume follow');
  await follow(page).click();await fit(page,['[data-dv-node=c]']);await frames(page,50);
  await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();await touch.detach();
 });
});

function pathFixture(presentation){
 const data=fixture(presentation),d=data.page.sections[0].diagram;
 // Authored frames remeasure SVG ink after each path render. Repeated equal
 // viewBox writes used to cancel normal Follow before its first camera tick.
 d.graphFrame={x:-600,y:-300,w:3500,h:1700};
 d.steps=[{id:'entry',nodes:['a'],text:'Entry'},{id:'local',edge:'a->b',text:'Local route'},{id:'remote',edge:'b->c',text:'Remote route'}];
 d.paths=[{id:'local',label:'Local route',steps:['entry','local']},{id:'remote',label:'Remote route',steps:['remote']}];
 return data;
}

// Opening overview and explicit first selection have separate camera ownership.
test('Explore reader opening fit keeps follow enabled',async({page,server})=>{
 await open(page,server,'explore',true);await frames(page,8);
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 const overview=await camera(page);await frames(page,8);expect(await camera(page)).toEqual(overview);
 await section(page).locator('.schip').first().click();await fit(page,['[data-dv-node=a]']);
 expect((await camera(page)).w).toBeGreaterThan(overview.w*1.5);
});
for(const presentation of ['standard','explore'])for(const reducedMotion of ['reduce','no-preference'])test(`${presentation} first explicit step and different path click frame immediately (${reducedMotion})`,async({page,server})=>{
 await page.emulateMedia({reducedMotion});
 const data=pathFixture(presentation);
 const input=await open(page,server,presentation,false,data);await frames(page,8);
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 const overview=await camera(page);
 await section(page).locator('.schip[data-step-source="0"]').first().click();
 await fit(page,['[data-dv-node=a]']);await frames(page,reducedMotion==='reduce'?4:50);
 expect((await camera(page)).w).toBeGreaterThan(overview.w*1.5);
 const first=await camera(page);
 await section(page).locator('.path-chip[data-dv-path="remote"]').click();
 await expect(section(page).locator('[data-dv-node=c]')).toHaveClass(/lit/);
 await fit(page,['[data-dv-node=b]','[data-dv-node=c]','text[data-dv-edge="1"]']);await frames(page,reducedMotion==='reduce'?4:50);
 expect(await camera(page)).not.toEqual(first);
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
});
for(const presentation of ['standard','explore'])for(const reducedMotion of ['reduce','no-preference'])test(`${presentation} reader first selection after tab arrival frames current step and changed path (${reducedMotion})`,async({page,server})=>{
 await page.emulateMedia({reducedMotion});
 const data=pathFixture(presentation),target=data.page.sections[0],other=structuredClone(target);other.id='other';other.heading='Other';
 data.page.blocks=[{tabs:[{label:'Target tab',sections:[target]},{label:'Other tab',sections:[other]}]}];delete data.page.sections;
 await open(page,server,presentation,true,data);await frames(page,8);
 const nav=page.locator('#docview>.explore-navigation');
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 await nav.getByRole('button',{name:'Next page',exact:true}).click();await frames(page,5);
 await nav.getByRole('button',{name:'Previous page',exact:true}).click();await frames(page,5);
 const overview=await camera(page);await frames(page,8);expect(await camera(page)).toEqual(overview);
 await section(page).locator('.schip[data-step-source="0"]').click();await fit(page,['[data-dv-node=a]']);await frames(page,reducedMotion==='reduce'?4:50);
 expect((await camera(page)).w).toBeGreaterThan(overview.w*1.5);const before=await camera(page);
 await section(page).locator('.path-chip[data-dv-path="remote"]').click();
 await expect(section(page).locator('[data-dv-node=c]')).toHaveClass(/lit/);
 await fit(page,['[data-dv-node=b]','[data-dv-node=c]','text[data-dv-edge="1"]']);await frames(page,reducedMotion==='reduce'?4:50);
 expect(await camera(page)).not.toEqual(before);
 await nav.getByRole('button',{name:'Next page',exact:true}).click();await frames(page,5);
 await nav.getByRole('button',{name:'Previous page',exact:true}).click();await frames(page,5);
 const arrived=await camera(page);await frames(page,50);expect(await camera(page)).toEqual(arrived);
 await section(page).locator('.schip[data-step-source="0"]').click();await fit(page,['[data-dv-node=a]']);await frames(page,reducedMotion==='reduce'?4:50);
 expect((await camera(page)).w).toBeGreaterThan(arrived.w*1.5);
 await expect(follow(page)).toHaveAttribute('aria-pressed','true');
});
for(const presentation of ['standard','explore'])for(const reader of [false,true])test(`${presentation} ${reader?'reader':'editor'} first step click after section and View navigation survives path render`,async({page,server})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 const data=pathFixture(presentation),other=structuredClone(data.page.sections[0]);other.id='other';other.heading='Other section';data.page.sections.push(other);
 data.page.views=[{id:'main',name:'Main',presentation,sections:['follow','other']},{id:'alternate',name:'Alternate',presentation,sections:['follow']}];
 const input=await open(page,server,presentation,reader,data),nav=page.locator('#docview>.explore-navigation');await frames(page,8);
 await nav.getByRole('button',{name:'Next page',exact:true}).click();await frames(page,5);
 await nav.getByRole('button',{name:'Previous page',exact:true}).click();await frames(page,5);
 const overview=await camera(page);await frames(page,8);expect(await camera(page)).toEqual(overview);
 await section(page).locator('.schip[data-step-source="0"]').click();await fit(page,['[data-dv-node=a]']);await frames(page,50);
 expect((await camera(page)).w).toBeGreaterThan(overview.w*1.5);
 await section(page).locator('.path-chip[data-dv-path="remote"]').click();await fit(page,['[data-dv-node=b]','[data-dv-node=c]']);await frames(page,50);
 await nav.getByRole('tab',{name:'Alternate',exact:true}).click();await frames(page,5);
 const arrived=await camera(page);await frames(page,50);expect(await camera(page)).toEqual(arrived);
 await section(page).locator('.schip[data-step-source="0"]').click();await fit(page,['[data-dv-node=a]']);await frames(page,50);
 expect((await camera(page)).w).toBeGreaterThan(arrived.w*1.5);await expect(follow(page)).toHaveAttribute('aria-pressed','true');
 // Automatic opening/layout work must preserve an explicit pause too.
 await follow(page).click();await expect(follow(page)).toHaveAttribute('aria-pressed','false');
 await nav.getByRole('tab',{name:'Main',exact:true}).click();await frames(page,5);await expect(follow(page)).toHaveAttribute('aria-pressed','false');
 const paused=await camera(page);await section(page).locator('.path-chip[data-dv-path="remote"]').click();await frames(page,50);expect(await camera(page)).toEqual(paused);
 if(!reader){await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();}
});
