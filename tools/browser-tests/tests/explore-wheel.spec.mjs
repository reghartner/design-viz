import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools,pagePreview,trackResources,resources} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {repo} from '../helpers/prepare.mjs';

function spec(){
  const raw=editorSpec(),d=raw.page.blocks[0].diagram;raw.page.blocks[0].id='story';
  const standard={...d.layouts[0],id:'standard',name:'Standard',presentation:'standard'};delete standard.steps;
  d.layouts=[standard,{...structuredClone(standard),id:'explore',name:'Explore',presentation:'explore',exploreLayout:{camera:{zoom:1,x:.5,y:.5}}}];
  d.defaultLayout='explore';return raw;
}
const width=board=>board.evaluate(el=>parseFloat(el.style.getPropertyValue('--explore-width')));
async function point(board){
  return board.evaluate(el=>{
    const r=el.getBoundingClientRect(),root=el.getRootNode();
    for(let y=Math.max(190,r.top+120);y<Math.min(innerHeight-200,r.bottom-100);y+=40)
      for(let x=Math.max(110,r.left+40);x<Math.min(innerWidth-250,r.right-250);x+=40){
        const hit=root.elementFromPoint(x,y);if(hit && hit.closest('.explore-board')===el)return {x,y};
      }
    throw Error('No reachable graph area');
  });
}
async function wheel(page,board,delta,modifier='Control'){
  const p=await point(board);await page.mouse.move(p.x,p.y);await page.keyboard.down(modifier);
  try{await page.mouse.wheel(0,delta);}finally{await page.keyboard.up(modifier);}
}
async function dispatch(board,deltaY,options={}){
  return board.evaluate((el,{deltaY,options})=>{
    const e=new WheelEvent('wheel',{bubbles:true,composed:true,cancelable:true,ctrlKey:true,deltaY,...options});el.dispatchEvent(e);return e.defaultPrevented;
  },{deltaY,options});
}

for(const surface of ['standalone','workbench','native'])test(surface+' Ctrl-scroll zooms the graph once, while plain wheel scrolls',async({page,server})=>{
  const raw=spec(),text=JSON.stringify(raw,null,2);let board,sibling,originalSibling,hash;
  if(surface==='standalone'){
    const input=path.join(server.root,'wheel.json'),output=path.join(server.root,'wheel.html');await writeFile(input,text);
    execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
    await page.goto(server.origin+'/wheel.html');board=page.locator('.explore-board');
  }else if(surface==='workbench'){
    await page.goto(server.origin+'/workbench.html');await paste(page,text);await closeTools(page);board=page.locator('.explore-board');
  }else{
    await page.setViewportSize({width:1920,height:1400});await page.goto(server.origin+'/native/index.html#host-wheel');await page.waitForFunction(()=>!!window.__host);
    await page.evaluate(()=>{__host.left(true);__host.right(true);});
    await page.locator('#alpha').getByRole('button',{name:'Explore',exact:true}).click();await page.locator('#beta').getByRole('button',{name:'Explore',exact:true}).click();
    board=page.locator('#alpha .explore-board');sibling=page.locator('#beta .explore-board');originalSibling=await width(sibling);hash=new URL(page.url()).hash;
  }
  await expect(board).toBeVisible();if(surface==='workbench')await page.clock.install();const before=await width(board),viewport=await page.evaluate(()=>({w:innerWidth,h:innerHeight,scale:visualViewport.scale}));
  await wheel(page,board,-60);await expect.poll(()=>width(board)).toBeCloseTo(before*Math.exp(.36),0);
  await wheel(page,board,60);await expect.poll(()=>width(board)).toBeCloseTo(before,0);
  // Trackpad pinch arrives as pixel-mode Ctrl-wheel; Meta-wheel is supported on Mac.
  expect(await dispatch(board,-20)).toBe(true);await expect.poll(()=>width(board)).toBeCloseTo(before*Math.exp(.12),0);
  expect(await dispatch(board,20,{ctrlKey:false,metaKey:true})).toBe(true);await expect.poll(()=>width(board)).toBeCloseTo(before,0);
  const p=await point(board);await page.mouse.move(p.x,p.y);const y=await board.evaluate(el=>el.scrollTop);await page.mouse.wheel(0,80);
  await expect.poll(()=>board.evaluate(el=>el.scrollTop)).toBeGreaterThan(y);expect(await width(board)).toBeCloseTo(before,0);
  expect(await page.evaluate(()=>({w:innerWidth,h:innerHeight,scale:visualViewport.scale}))).toEqual(viewport);
  if(surface==='workbench'){
    await page.clock.fastForward(400);await expect(page.locator('#src')).toHaveValue(text);await expect(page.locator('#undo-builder')).toBeDisabled();
    expect(Number((await page.locator('#workspace-zoom').textContent()).replace('%',''))).toBe(100);
  }
  if(sibling){expect(await width(sibling)).toBe(originalSibling);expect(new URL(page.url()).hash).toBe(hash);}
});

test('contained editor wheel zoom is one authored camera edit, and stale or cancelled gestures cannot write',async({page,server})=>{
  const text=JSON.stringify(spec(),null,2);await page.goto(server.origin+'/workbench.html');await paste(page,text);await pagePreview(page);
  const board=page.locator('.explore-board');await board.scrollIntoViewIfNeeded();await page.clock.install();
  const initial=await width(board);for(let i=0;i<3;i++)expect(await dispatch(board,-20)).toBe(true);
  await page.clock.fastForward(300);await expect.poll(()=>page.locator('#src').inputValue()).not.toBe(text);
  const saved=await page.locator('#src').inputValue(),camera=JSON.parse(saved).page.blocks[0].diagram.layouts[1].exploreLayout.camera;
  expect(camera.zoom).toBeCloseTo(Math.exp(.36),4);expect(await width(board)).toBeCloseTo(initial*Math.exp(.36),0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);await expect(page.locator('#redo-builder')).toBeDisabled();
  await dispatch(board,-30);await page.locator('#section-story').getByRole('button',{name:'Standard',exact:true}).click();
  await page.clock.fastForward(400);await expect(page.locator('#src')).toHaveValue(saved);
  await page.locator('#section-story').getByRole('button',{name:'Explore',exact:true}).click();await pagePreview(page);
  const invalid=saved+'\n{ unfinished';await page.locator('#src').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},invalid);
  const staleWidth=await width(board);expect(await dispatch(board,-30)).toBe(true);await page.clock.fastForward(400);
  expect(await width(board)).toBe(staleWidth);await expect(page.locator('#src')).toHaveValue(invalid);
});

test('wheel units and limits are consistent; inactive and destroyed viewports release the gesture',async({page,server})=>{
  await page.addInitScript(trackResources);await page.goto(server.origin+'/native/index.html');await page.waitForFunction(()=>!!window.__host);const baseline=await resources(page);
  await page.evaluate(()=>__host.left(true));const host=page.locator('#alpha');await host.getByRole('button',{name:'Explore',exact:true}).click();
  const board=host.locator('.explore-board'),before=await width(board),held=await board.elementHandle();
  expect(await dispatch(board,-1,{deltaMode:1})).toBe(true);await expect.poll(()=>width(board)).toBeCloseTo(before*Math.exp(.096),0);
  expect(await dispatch(board,16)).toBe(true);await expect.poll(()=>width(board)).toBeCloseTo(before,0);
  const ratio=await board.evaluate(el=>el.querySelector('.boardcanvas>svg').viewBox.baseVal.width);
  await dispatch(board,-100000);expect(await width(board)/ratio).toBeCloseTo(4,5);await dispatch(board,100000);expect(await width(board)/ratio).toBeCloseTo(.15,5);
  await host.getByRole('button',{name:'Business',exact:true}).click();
  // The regular view now owns Ctrl-wheel after Explore releases the board.
  const regularGraph=host.locator('.board .boardcanvas>svg'),regularWidth=await regularGraph.evaluate(el=>el.getBoundingClientRect().width);
  expect(await held.evaluate(el=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-50});el.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
  expect(await regularGraph.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(regularWidth);
  await page.evaluate(()=>__host.left(false));await expect(host.locator('.docview')).toHaveCount(0);
  expect(await held.evaluate(el=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-50});el.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);
  await expect.poll(()=>resources(page)).toEqual(baseline);await held.dispose();
});
