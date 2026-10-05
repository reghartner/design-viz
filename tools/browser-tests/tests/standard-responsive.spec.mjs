import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,arrangeChapter,prepareEditorSurface} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(){
  const raw=editorSpec(),d=raw.page.blocks[0].diagram;delete d.layouts[0].steps;
  d.layouts[0].sectionLayout.default=[{x:0,y:0,w:8,h:12},{panel:'home',x:8,y:2,w:4,h:8},{controls:'steps',attachTo:'diagram',x:0,y:12,w:8,h:4}];
  d.layouts.push({...structuredClone(d.layouts[0]),id:'alternate',name:'Second chapter'});
  raw.page.blocks.push({heading:'After arrangement',text:'Following content stays immediately after the scaled section.'});
  return raw;
}
async function geometry(root){
  return root.locator('.section-layout-grid').first().evaluate(grid=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
    return {grid:rect(grid),shell:rect(grid.parentElement),zoom:parseFloat(getComputedStyle(grid).zoom),
      tiles:Array.from(grid.querySelectorAll('.section-layout-tile:not([hidden])')).map(rect),controls:rect(grid.querySelector('.termbar')),
      following:rect(grid.closest('.doc-sec').nextElementSibling),section:rect(grid.closest('.doc-sec'))};
  });
}
async function settledGeometry(root,width){
  let actual;
  // Auto width can match the host before ResizeObserver applies canvas zoom.
  await expect.poll(async()=>{
    actual=await geometry(root);
    return {width:actual.grid.w,zoom:actual.zoom};
  }).toEqual({width:expect.closeTo(width,0),zoom:expect.closeTo(Math.min(1,width/1000),4)});
  return actual;
}
async function verifyResize(root){
  const section=root.locator('.doc-sec').first();
  await section.evaluate(el=>{el.style.width='1000px';el.style.boxSizing='content-box';});
  const base=await settledGeometry(root,1000);
  for(const width of [800,640,400,720,1000,1100]){
    await section.evaluate((el,width)=>{el.style.width=width+'px';},width);
    const actual=await settledGeometry(root,width),scale=Math.min(1,width/1000);
    expect(actual.zoom).toBeCloseTo(scale,4);
    expect(actual.grid.h).toBeCloseTo(base.grid.h*scale,0);
    expect(actual.controls.h).toBeCloseTo(base.controls.h*scale,0);
    for(let i=0;i<base.tiles.length;i++){
      expect(actual.tiles[i].h).toBeCloseTo(base.tiles[i].h*scale,0);
      if(width<=1000){
        expect(actual.tiles[i].w).toBeCloseTo(base.tiles[i].w*scale,0);
        expect(actual.tiles[i].x-actual.grid.x).toBeCloseTo((base.tiles[i].x-base.grid.x)*scale,0);
        expect(actual.tiles[i].y-actual.grid.y).toBeCloseTo((base.tiles[i].y-base.grid.y)*scale,0);
      }
      expect(actual.tiles[i].right).toBeLessThanOrEqual(actual.shell.right+1);
      expect(actual.tiles[i].bottom).toBeLessThanOrEqual(actual.grid.bottom+1);
    }
    // Both the flow box and following section track the rendered height.
    expect(actual.shell.bottom-actual.grid.bottom).toBeLessThan(1);
    expect(actual.following.y-actual.section.bottom).toBeCloseTo(base.following.y-base.section.bottom,0);
  }
  await section.evaluate(el=>{el.style.width='';el.style.boxSizing='';});
}
async function verifyControls(root){
  await root.getByRole('button',{name:'Second chapter',exact:true}).click();
  await expect(root.getByRole('button',{name:'Second chapter',exact:true})).toHaveAttribute('aria-pressed','true');
  await root.getByRole('button',{name:'Next step',exact:true}).click();
  await expect(root.locator('.stepline')).toContainText('Recording ready');
}

test('Standard page preview preserves proportions when only its host width changes',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture()));
  await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
  const root=page.locator('#page-preview-view');await verifyResize(root);
  await page.setViewportSize({width:520,height:800});
  await expect.poll(async()=>(await geometry(root)).zoom).toBeLessThan(.6);
  await verifyControls(root);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(521);
});

test('exported Standard layout scales, remains interactive, and prints without zoom',async({page,server})=>{
  const input=path.join(server.root,'responsive.json'),output=path.join(server.root,'responsive.html');
  await writeFile(input,JSON.stringify(fixture()));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/responsive.html');const root=page.locator('.docview');await verifyResize(root);
  await page.setViewportSize({width:440,height:800});await expect.poll(async()=>(await geometry(root)).zoom).toBeLessThan(.5);
  await verifyControls(root);
  const board=root.locator('.section-layout-tile .board'),drawing=board.locator('.boardcanvas>svg');
  const before=await drawing.boundingBox(),frame=await board.boundingBox();
  await root.getByRole('button',{name:'Zoom in',exact:true}).click();
  expect((await drawing.boundingBox()).width).toBeCloseTo(before.width*1.25,0);
  expect((await board.boundingBox()).height).toBeCloseTo(frame.height,0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(441);
  await page.emulateMedia({media:'print'});
  expect(await root.locator('.section-layout-grid').evaluate(el=>({zoom:getComputedStyle(el).zoom,display:getComputedStyle(el).display}))).toEqual({zoom:'1',display:'block'});
});

test('arrangement dragging uses the visible scaled row height',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture()));await prepareEditorSurface(page);await arrangeChapter(page);
  await page.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();
  const section=page.locator('#docview .doc-sec').first();await section.evaluate(el=>{el.style.width='600px';el.style.boxSizing='content-box';});
  const grid=section.locator('.section-layout-grid');await expect.poll(()=>grid.evaluate(el=>parseFloat(getComputedStyle(el).zoom))).toBeCloseTo(.6,4);
  const tile=grid.locator('[data-layout-key="panel:home"]'),handle=tile.locator('.section-tile-move');
  await handle.hover();const r=await handle.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2+48);await page.mouse.up();
  expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.layouts[0].sectionLayout.default.find(it=>it.panel==='home').y).toBe(4);
});
