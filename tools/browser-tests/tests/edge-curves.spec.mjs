import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage as paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const example={page:{title:'Shape an arrow',blocks:[{heading:'Smooth curves',diagram:{
  nodes:{a:{title:'Source'},b:{title:'Destination'},c:{title:'Obstacle'}},rows:[[]],
  floats:[{id:'a',x:150,y:220},{id:'b',x:850,y:220},{id:'c',x:500,y:400}],
  edges:[{from:'a',to:'b',label:'Request'}],steps:[{edge:'a->b',text:'Follow the curve'}],autoplay:false
}}]}};
const source=page=>page.locator('#src').inputValue();
const edge=page=>page.locator('#docview path.edge[data-dv-edge="0"]').first();
const points=async page=>JSON.parse(await source(page)).page.blocks[0].diagram.edges[0].curvePoints;
async function open(page,server){await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(example,null,2));await expect(page.locator('#docview g.node').first()).toBeVisible();await expect(edge(page)).toBeAttached();}
async function location(locator,fraction=.5){return locator.evaluate((el,f)=>{
  const p=el.getPointAtLength(el.getTotalLength()*f),m=el.getScreenCTM(),q=new DOMPoint(p.x,p.y).matrixTransform(m);
  return {x:q.x,y:q.y,sx:m.a,sy:m.d};
},fraction);}
async function drag(page,locator,fraction,dx,dy,release=true){
  const p=await location(locator,fraction);await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.mouse.move(p.x+dx*p.sx,p.y+dy*p.sy,{steps:12});if(release)await page.mouse.up();
}

test('dragging the arrow creates smooth through-points, adds an S-curve, and resets with exact Undo/Redo',async({page,server})=>{
 await open(page,server);const before=await source(page);
 await drag(page,edge(page),.35,-20,-100);
 await expect.poll(async()=> (await points(page))?.length).toBe(1);
 let shaped=await source(page);const pathOne=await edge(page).getAttribute('d');
 expect(pathOne.match(/ C /g)).toHaveLength(2);
 await expect(page.locator('.dv-curve-point')).toHaveCount(1);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(shaped);
 // A different part of the selected arrow adds a second independent point.
 await drag(page,edge(page),.8,15,105);
 await expect.poll(async()=> (await points(page))?.length).toBe(2);
 expect((await edge(page).getAttribute('d')).match(/ C /g)).toHaveLength(3);
 const priorPoints=await points(page),handle=page.locator('[data-curve-point="1"]'),box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2-30,{steps:8});await page.mouse.up();
 await expect.poll(async()=> (await points(page))[1].dy).not.toBe(priorPoints[1].dy);
 expect((await points(page))[0]).toEqual(priorPoints[0]);
 const two=await source(page);
 await page.screenshot({path:path.join(repo,'.local/edge-curves-editor.png')});
 await page.locator('[data-curve-point="0"]').dblclick();await expect.poll(async()=> (await points(page))?.length).toBe(1);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(two);
 // History clears selection; select the arrow again to expose Reset curve.
 const p=await location(edge(page),.2);await page.mouse.click(p.x,p.y);
 await page.locator('#guide').getByRole('button',{name:'Reset curve',exact:true}).click();
 await expect.poll(()=>points(page)).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(two);
 await page.locator('#redo-builder').click();await expect.poll(()=>points(page)).toBeUndefined();
});

test('handles support keyboard movement/removal; Escape and source edits cancel held drags',async({page,server})=>{
 await open(page,server);await drag(page,edge(page),.4,0,-90);
 await expect.poll(async()=> (await points(page))?.length).toBe(1);
 const handle=page.locator('[data-curve-point="0"]'),before=await source(page),old=(await points(page))[0];
 await handle.focus();await page.keyboard.press('ArrowRight');
 await expect.poll(async()=> (await points(page))[0].dx).toBe(old.dx+10);
 await expect(page.locator('[data-curve-point="0"]')).toBeFocused();
 await page.keyboard.press('Delete');await expect.poll(()=>points(page)).toBeUndefined();
 expect(JSON.parse(await source(page)).page.blocks[0].diagram.edges).toHaveLength(1);
 await page.locator('#undo-builder').click();
 const saved=await source(page),route=await edge(page).getAttribute('d');
 await drag(page,edge(page),.65,0,-50,false);
 await page.keyboard.press('Escape');await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(saved);await expect(edge(page)).toHaveAttribute('d',route);
 await expect(page.locator('.dv-free-edge-preview')).toHaveCount(0);
 await drag(page,edge(page),.65,0,-50,false);
 await page.locator('#src').evaluate(el=>{el.value+='\n';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.mouse.up();await expect(page.locator('#src')).toHaveValue(saved+'\n');
 await expect(page.locator('.dv-free-edge-preview')).toHaveCount(0);
 expect(before).not.toBe(saved);
});

test('saved curves render unchanged in a standalone export and keep labels and step markers on the path',async({page,server,context})=>{
 await open(page,server);await drag(page,edge(page),.3,0,-120);
 await expect.poll(async()=> (await points(page))?.length).toBe(1);
 const raw=await source(page),expected=await edge(page).getAttribute('d');
 const spec=path.join(server.root,'curve-spec.json'),out=path.join(server.root,'curve-export.html');
 await writeFile(spec,raw);execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),out]);
 const exported=await context.newPage();await exported.goto(server.origin+'/curve-export.html');
 await expect(exported.locator('path.edge').first()).toHaveAttribute('d',expected);
 await expect(exported.locator('.dv-curve-editor')).toHaveCount(0);
 await expect(exported.locator('text.lbl').first()).toBeVisible();
 await expect(exported.locator('g.coin').first()).toBeVisible();
 const distance=await exported.locator('g.coin').first().evaluate(coin=>{
   const path=coin.ownerSVGElement.querySelector('path.edge'),circle=coin.querySelector('circle');
   const x=Number(circle.getAttribute('cx')),y=Number(circle.getAttribute('cy'));
   let best=Infinity;for(let i=0;i<=400;i++){const p=path.getPointAtLength(path.getTotalLength()*i/400);best=Math.min(best,Math.hypot(p.x-x,p.y-y));}return best;
 });expect(distance).toBeLessThan(3);
});

test('destroying the builder cancels a captured curve drag; remount creates only one edit',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(example,null,2));
 const before=await source(page);
 await drag(page,edge(page),.35,0,-80,false);
 await expect(page.locator('.dv-free-edge-preview')).toHaveCount(1);
 const svg=await edge(page).evaluateHandle(el=>el.ownerSVGElement);
 expect(await svg.evaluate(el=>el.hasPointerCapture(1))).toBe(true);
 await page.evaluate(()=>__editorTest.builder.destroy());await page.mouse.up();
 expect(await svg.evaluate(el=>el.hasPointerCapture(1))).toBe(false);await svg.dispose();
 await expect(page.locator('.dv-free-edge-preview,.dv-curve-editor')).toHaveCount(0);
 await expect(page.locator('#src')).toHaveValue(before);
 await page.evaluate(()=>__editorTest.remount());await drag(page,edge(page),.35,0,-80);
 await expect.poll(async()=> (await points(page))?.length).toBe(1);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await expect(page.locator('#undo-builder')).toBeDisabled();
});
