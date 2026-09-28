import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const named=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
async function build(server){
 const spec=structuredClone(named),sec=spec.page.sections[0],d=sec.diagram;sec.id='doorbell';d.autoplay=false;
 delete d.layouts[1].exploreLayout;d.layouts[1].sectionLayout.default.forEach(t=>{if(t.panel)t.hidden=false;});
 d.panels.push({id:'queue',type:'queue',title:'Upload queue',initial:{depth:3}});
 d.steps[1].panelVisibility={queue:false};d.steps[1].text='A deliberately long engineering caption. '.repeat(60);
 for(let r=0;r<8;r++){const row=[];for(let c=0;c<8;c++){const id='extra'+r+'_'+c;d.nodes[id]={title:'Service '+r+'.'+c};row.push(id);}d.rows.push(row);}
 const input=path.join(server.root,'explore.json'),output=path.join(server.root,'explore.html');await writeFile(input,JSON.stringify(spec));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/explore.html';
}
const floats=p=>p.locator('.explore-window:visible');
const rect=loc=>loc.boundingBox();
test('Business remains standard; linked Explore has a full-height canvas and independent vertical stack',async({page,server})=>{
 const url=await build(server);await page.goto(url);await expect(page.locator('.explore-stage')).toBeHidden();
 await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 await expect(page.locator('.explore-stage')).toBeVisible();await expect(floats(page)).toHaveCount(4);
 const before=await page.locator('.boardcanvas>svg').count();
 const stage=await rect(page.locator('.explore-stage')),board=await rect(page.locator('.explore-board'));
 expect(stage).toEqual({x:0,y:0,width:page.viewportSize().width,height:page.viewportSize().height});expect(board).toEqual(stage);
 let bottom=stage.y;for(const card of await floats(page).all()){const r=await rect(card);expect(r.y).toBeGreaterThanOrEqual(bottom);expect(Math.abs(r.x+r.width-stage.x-stage.width+13)).toBeLessThan(3);bottom=r.y+r.height;}
 expect(bottom).toBeLessThan(stage.y+stage.height);
 const play=page.getByRole('button',{name:'Next step',exact:true}),pos=await rect(play);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await page.locator('.explore-board').evaluate(el=>{el.scrollLeft=1000;el.scrollTop=900;});
 const after=await rect(play);expect(after.x).toBeCloseTo(pos.x,0);expect(after.y).toBeCloseTo(pos.y,0);
 await play.click();await expect(floats(page)).toHaveCount(3);const long=await rect(play);expect(long.x).toBeCloseTo(pos.x,0);expect(long.y).toBeCloseTo(pos.y,0);
 await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(page.locator('.explore-stage')).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
 await page.getByRole('button',{name:'Service flow',exact:true}).click();await expect(page.locator('.explore-stage')).toBeVisible();
 expect(await page.locator('.boardcanvas>svg').count()).toBe(before);
 await page.getByRole('button',{name:'Fit diagram',exact:true}).click();await page.screenshot({path:'/tmp/flowview-explore-live.png',fullPage:true});
});
test('panels resize inward below 210px, detach, cancel, hide and restore independently',async({page,server})=>{
 const url=await build(server);await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 const home=page.locator('[data-explore-panel=home]'),handle=home.locator('.explore-window-resize');
 let r=await rect(handle);await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+100,r.y+15,{steps:5});await page.mouse.up();
 expect((await rect(home)).width).toBeLessThan(160);const narrow=await rect(home);
 const grip=home.locator('.explore-window-grip');await grip.focus();await page.keyboard.press('ArrowLeft');await expect(home).not.toHaveClass(/explore-stacked/);
 const detached=await rect(home);await grip.press('ArrowLeft');expect((await rect(home)).x).toBeLessThan(detached.x);
 r=await rect(grip);const start=await rect(home);await page.mouse.move(r.x+20,r.y+15);await page.mouse.down();await page.mouse.move(r.x-220,r.y+100,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();expect((await rect(home)).x).toBeCloseTo(start.x,0);
 await home.getByRole('button',{name:/^Hide /}).click();await expect(home).toBeHidden();
 await page.locator('.explore-panel-menu summary').click();await page.locator('.explore-panel-choices label').filter({hasText:'Home'}).getByRole('checkbox').check();await page.keyboard.press('Escape');
 await expect(home).toBeVisible();expect((await rect(home)).width).toBeCloseTo(narrow.width,0);
 await page.getByRole('button',{name:'Hide panels',exact:true}).click();await expect(floats(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Restore panels',exact:true}).click();await expect(floats(page)).toHaveCount(4);
 await page.getByRole('button',{name:'Stack at edge',exact:true}).click();await expect(home).toHaveClass(/explore-stacked/);
 await page.getByRole('button',{name:'Home story',exact:true}).click();await page.getByRole('button',{name:'Service flow',exact:true}).click();expect((await rect(home)).width).toBeCloseTo(narrow.width,0);
});
test('fullscreen is explicit and refusal keeps an exit-able in-page view',async({page,server})=>{
 const url=await build(server);await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Host policy'));});
 await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect(page.locator('.viewport-status')).toContainText('unavailable');
 await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).press('Escape');await expect(page.locator('.section-viewport')).not.toHaveClass(/viewport-expanded/);
 await page.getByRole('button',{name:'Home story',exact:true}).click();await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect(page.locator('.section-viewport')).toHaveClass(/viewport-expanded/);await expect(page.locator('.explore-stage')).toBeHidden();
});
test('ordinary diagrams can expand without named views, with a bounded fallback',async({page,server})=>{
 const input=path.join(server.root,'plain-expand.json'),out=path.join(server.root,'plain-expand.html');
 await writeFile(input,JSON.stringify({page:{title:'Plain',sections:[{diagram:{nodes:{a:{title:'Service'}},rows:[['a']]}}]}}));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),out]);
 await page.goto(server.origin+'/plain-expand.html');
 const surface=page.locator('.standard-view-surface'),before=await rect(surface);
 await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Host policy'));});
 await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();
 await expect(page.locator('.viewport-status')).toContainText('unavailable');expect((await rect(surface)).height).toBeGreaterThan(before.height+100);
 await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();expect((await rect(surface)).height).toBeCloseTo(before.height,0);
});

test('Explore height is scroll-independent, controls share the top row and canvas has quarter-screen margins',async({page,server})=>{
 const url=await build(server);await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 const stage=page.locator('.explore-stage'),board=page.locator('.explore-board');
 const initial=(await stage.boundingBox()).height;expect(initial).toBeGreaterThan(1000);
 for(let n=0;n<2;n++){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.reload();await expect(stage).toBeVisible();expect((await stage.boundingBox()).height).toBeCloseTo(initial,0);}
 const transport=await page.locator('.explore-player .step-transport').boundingBox(),chips=await page.locator('.explore-player .schips').boundingBox(),caption=await page.locator('.explore-player .stepline').boundingBox();
 expect(chips.y).toBeCloseTo(transport.y,0);expect(chips.x).toBeGreaterThan(transport.x+transport.width);expect(caption.y).toBeGreaterThan(transport.y+transport.height);
 expect((await page.locator('.explore-player').boundingBox()).height).toBeLessThan(190);
 const margins=await board.evaluate(el=>{
  const svg=el.querySelector('.boardcanvas>svg');el.scrollLeft=0;el.scrollTop=0;const start=svg.getBoundingClientRect(),b=el.getBoundingClientRect();
  el.scrollLeft=el.scrollWidth;el.scrollTop=el.scrollHeight;const end=svg.getBoundingClientRect();
  return {left:start.left-b.left,top:start.top-b.top,right:b.left+el.clientWidth-end.right,bottom:b.top+el.clientHeight-end.bottom,w:el.clientWidth,h:el.clientHeight};
 });
 expect(margins.left).toBeGreaterThan(margins.w*.24);expect(margins.right,JSON.stringify(margins)).toBeGreaterThan(margins.w*.24);expect(margins.top).toBeGreaterThan(margins.h*.24);expect(margins.bottom).toBeGreaterThan(margins.h*.24);
});
