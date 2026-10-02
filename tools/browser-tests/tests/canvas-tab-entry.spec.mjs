import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function diagram(prefix,count,camera,presentation='explore'){
 const ids=Array.from({length:count},(_,i)=>prefix+i),nodes={};
 ids.forEach((id,i)=>nodes[id]={title:prefix.toUpperCase()+' '+(i+1)});
 const exploreLayout=camera?{camera}:undefined;
 return {nodes,rows:[ids],layouts:[{id:presentation,name:presentation==='explore'?'Explore':'Standard',presentation,
  sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},...(exploreLayout?{exploreLayout}: {})}],defaultLayout:presentation};
}
function mixedFixture(){
 const explore=diagram('x',7);
 explore.layouts.push({id:'fresh',name:'Fresh view',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}});
 explore.layouts.push({id:'authored',name:'Authored',presentation:'explore',
  sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},exploreLayout:{camera:{zoom:.55,x:.5,y:.5}}});
 return {page:{title:'Mixed stories',blocks:[{tabs:[
  {label:'Standard story',sections:[{id:'standard',heading:'Standard story',diagram:diagram('s',2,null,'standard')}]},
  {label:'Explore story',sections:[{id:'context',heading:'Context',text:'Read this first.'},{id:'explore',heading:'Explore story',diagram:explore}]}
 ]}]}};
}
function fixture(){
 return {page:{title:'Explore stories',blocks:[{tabs:[
  {label:'Small story',sections:[{id:'small',heading:'Small story',diagram:diagram('a',2)}]},
  {label:'Large story',sections:[{id:'large',heading:'Large story',diagram:diagram('b',7)}]}
 ]}]}};
}
async function standalone(page,server,raw){
 const input=path.join(server.root,'canvas-tab-entry.json'),output=path.join(server.root,'canvas-tab-entry.html');
 await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/canvas-tab-entry.html');
}
async function afterTwoFrames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('workbench first entry into a hidden Explore tab frames its diagram',async({page,server})=>{
 const source=JSON.stringify(fixture(),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 const board=page.locator('#section-large .board');await board.evaluate(el=>el.style.display='none');
 await page.locator('#diagram-add-target').selectOption('1');
 await expect(page.locator('#tab-0-1')).toHaveAttribute('aria-selected','true');
 await afterTwoFrames(page);await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await board.evaluate(el=>el.style.removeProperty('display'));
 await expect(page.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect(page.locator('#section-large [data-dv-node="b6"]')).toBeInViewport();
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('reader first entry into a hidden Explore story frames its diagram',async({page,server})=>{
 await standalone(page,server,fixture());
 await page.getByLabel('Explore story',{exact:true}).selectOption('2');
 await expect(page.locator('#section-large [data-dv-node="b0"]')).toBeInViewport();
 await expect(page.locator('#section-large [data-dv-node="b6"]')).toBeInViewport();
});

test('workbench entering Explore through an ordinary document tab frames its diagram',async({page,server})=>{
 const source=JSON.stringify(mixedFixture(),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
 await page.locator('#tab-0-1').click();
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
 const board=page.locator('#section-explore .explore-board'),box=await board.boundingBox();
 await page.locator('#workspace-zoom-in').click();await page.locator('#workspace-pan').click();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2-70,box.y+box.height/2-45,{steps:6});await page.mouse.up();
 await page.locator('#workspace-pan').click();
 const camera=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop})),zoom=await page.locator('#workspace-zoom').textContent();
 await page.locator('#workspace-page').click();await page.locator('#tab-0-0').click();
 await page.locator('#tab-0-0').press('ArrowRight');
 await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
 await expect(page.locator('#workspace-zoom')).toHaveText(zoom);
 await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(camera);
 await board.evaluate(el=>el.style.display='none');
 await page.getByRole('button',{name:'Fresh view',exact:true}).click();await afterTwoFrames(page);
 await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await page.evaluate(()=>{
  document.querySelector('#section-explore .board').style.removeProperty('display');
  Array.from(document.querySelectorAll('#section-explore .diagram-views button')).find(el=>el.textContent==='Explore').click();
 });
 await afterTwoFrames(page);
 await expect(page.locator('#workspace-zoom')).toHaveText(zoom);
 await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(camera);
 await page.getByRole('button',{name:'Fresh view',exact:true}).click();
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
 await afterTwoFrames(page);
 const freshCamera=await board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop})),freshZoom=await page.locator('#workspace-zoom').textContent();
 await page.locator('#workspace-fit').click();await expect(page.locator('#workspace-zoom')).toHaveText(freshZoom);
 await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(freshCamera);
 await page.getByRole('button',{name:'Authored',exact:true}).click();
 await expect(page.locator('#workspace-zoom')).toHaveText('55%');
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await expect(page.locator('#workspace-zoom')).toHaveText(zoom);
 await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(camera);
 await expect(page.locator('#diagram-add-target')).toHaveValue('2');
 await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('reader entering Explore through an ordinary document tab frames its diagram',async({page,server})=>{
 await standalone(page,server,mixedFixture());
 const board=page.locator('#section-explore .board');await board.evaluate(el=>el.style.display='none');
 await page.locator('#tab-0-1').click();
 await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
 await afterTwoFrames(page);await expect.poll(()=>board.evaluate(el=>el.clientWidth)).toBe(0);
 await board.evaluate(el=>el.style.removeProperty('display'));
 await expect(page.locator('#section-explore [data-dv-node="x0"]')).toBeInViewport();
 await expect(page.locator('#section-explore [data-dv-node="x6"]')).toBeInViewport();
});
