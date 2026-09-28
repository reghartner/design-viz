import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(exploreLayout){
  const raw=editorSpec(),section=raw.page.blocks[0],d=section.diagram;section.id='delivery';
  const standard={...d.layouts[0],id:'standard',name:'Standard story',presentation:'standard'};delete standard.steps;
  const explore={...structuredClone(standard),id:'explore',name:'Explore story',presentation:'explore'};
  if(exploreLayout)explore.exploreLayout=structuredClone(exploreLayout);
  d.layouts=[standard,explore];d.defaultLayout='explore';return raw;
}
const section=page=>page.locator('#section-delivery');
const panel=page=>section(page).locator('[data-explore-panel="home"]');
const controls=page=>section(page).locator('.explore-player');
const source=page=>page.locator('#src').inputValue();
async function open(page,server,raw){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
  await expect(page.locator('#workspace-view')).toHaveValue('diagram');
  await expect(section(page)).toHaveAttribute('data-view-id','explore');await expect(panel(page)).toBeVisible();
}
async function drag(page,handle,dx,dy){
  await handle.hover();const r=await handle.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();
}
async function rectangle(locator){
  return locator.evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.explore-stage').getBoundingClientRect();
    return {x:(r.x-s.x)/s.width,y:(r.y-s.y)/s.height,w:r.width/s.width,h:r.height/s.height};});
}
async function camera(page){
  return section(page).locator('.explore-board').evaluate(el=>{
    const svg=el.querySelector('svg'),width=parseFloat(el.style.getPropertyValue('--explore-width'));
    const mx=parseFloat(el.style.getPropertyValue('--explore-margin-x')),my=parseFloat(el.style.getPropertyValue('--explore-margin-y'));
    return {zoom:width/svg.viewBox.baseVal.width,x:(el.scrollLeft+el.clientWidth/2-mx)/width,
      y:(el.scrollTop+el.clientHeight/2-my)/(width*svg.viewBox.baseVal.height/svg.viewBox.baseVal.width)};
  });
}
async function expectSavedGeometry(page,layout){
  for(const [locator,saved] of [[panel(page),layout.panels.find(p=>p.panel==='home')],[controls(page),layout.controls]]){
    await expect.poll(async()=>{
      const actual=await rectangle(locator);return Math.max(...['x','y','w','h'].map(k=>Math.abs(actual[k]-saved[k])));
    },{message:'Rendered normalized rectangle matches authored Explore layout'}).toBeLessThan(.003);
  }
  if(layout.camera)await expect.poll(async()=>{
    const actual=await camera(page);return Math.max(...['zoom','x','y'].map(k=>Math.abs(actual[k]-layout.camera[k])));
  },{message:'Authored camera survives initial fitting'}).toBeLessThan(.01);
}
async function exported(context,server,text,name){
  const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,text);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  const reader=await context.newPage();await reader.setViewportSize({width:1440,height:1000});
  await reader.goto(server.origin+'/'+name+'.html');await expect(section(reader)).toHaveAttribute('data-view-id','explore');
  await expect(reader.locator('body')).toHaveClass(/viewer-exploring/);return reader;
}

test('main canvas Explore gestures author one history entry each and survive standalone export and editor reload',async({page,server,context},info)=>{
  const raw=fixture();await open(page,server,raw);const states=[await source(page)];
  const gestures=[
    [()=>panel(page).locator('.explore-window-grip'),-450,100],
    [()=>panel(page).locator('.explore-window-resize'),70,45],
    [()=>controls(page).locator('.explore-player-grip'),180,-170],
    [()=>controls(page).locator('.explore-window-resize'),90,45],
  ];
  await expect(page.locator('#undo-builder')).toBeDisabled();
  for(const [handle,dx,dy] of gestures){
    const before=states.at(-1);await drag(page,handle(),dx,dy);
    await expect.poll(async()=>await source(page)!==before,{message:'The canvas gesture must update exportable authored layout'}).toBe(true);
    const changed=await source(page);states.push(changed);
    expect(JSON.parse(changed).page.blocks[0].diagram.layouts[0]).toEqual(raw.page.blocks[0].diagram.layouts[0]);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
  }
  const saved=states.at(-1),layout=JSON.parse(saved).page.blocks[0].diagram.layouts[1].exploreLayout;
  expect(layout.panels.find(p=>p.panel==='home').stacked).toBe(false);expect(layout.controls).toBeTruthy();
  await expectSavedGeometry(page,layout);
  // Walking the complete stack catches a second temporary-geometry entry for
  // the same authored gesture, even if an immediate Undo looked correct.
  for(let i=states.length-2;i>=0;i--){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(states[i]);}
  await expect(page.locator('#undo-builder')).toBeDisabled();
  for(const text of states.slice(1)){await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(text);}
  await expect(page.locator('#redo-builder')).toBeDisabled();
  await expectSavedGeometry(page,layout);
  const reader=await exported(context,server,saved,'canvas-gesture-export');
  await expectSavedGeometry(reader,layout);await info.attach('exported-explore-layout',{body:await reader.screenshot(),contentType:'image/png'});
  await reader.close();
  // A normal reload restores the accepted editor document, without re-pasting
  // it or retaining the old runtime's temporary panel memories.
  await page.reload();await closeTools(page);await expect(page.locator('#src')).toHaveValue(saved);
  await expect(section(page)).toHaveAttribute('data-view-id','explore');await expectSavedGeometry(page,layout);
  await section(page).getByRole('button',{name:'Standard story',exact:true}).click();await expect(page.locator('#src')).toHaveValue(saved);
  const standardBefore=await rectangle(panel(page));await drag(page,panel(page).locator('.explore-window-grip'),-120,40);
  expect(await rectangle(panel(page))).not.toEqual(standardBefore);await expect(page.locator('#src')).toHaveValue(saved);
  await page.locator('#undo-builder').click();await expect.poll(()=>rectangle(panel(page))).toEqual(standardBefore);
  await expect(page.locator('#src')).toHaveValue(saved);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('authored Explore rectangles and camera use final full-canvas bounds in editor and fresh export',async({page,server,context},info)=>{
  const layout={panels:[{panel:'home',x:.2,y:.4,w:.2,h:.25,stacked:false}],controls:{x:.08,y:.78,w:.52,h:.16},camera:{zoom:.7,x:.5,y:.5}};
  const raw=fixture(layout);await open(page,server,raw);const original=await source(page);
  await expectSavedGeometry(page,layout);await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  const reader=await exported(context,server,original,'canvas-authored-export');await expectSavedGeometry(reader,layout);
  await info.attach('authored-export-geometry',{body:JSON.stringify({panels:await rectangle(panel(reader)),controls:await rectangle(controls(reader)),camera:await camera(reader)},null,2),contentType:'application/json'});
  await reader.reload();await expectSavedGeometry(reader,layout);await reader.close();
});
