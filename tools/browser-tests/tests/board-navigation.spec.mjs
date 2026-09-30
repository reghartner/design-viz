import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,pagePreview,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function spec(){
  const nodes={},rows=[];
  for(let r=0;r<5;r++){const row=[];for(let c=0;c<4;c++){const id='n'+r+c;nodes[id]={title:'Service '+r+'.'+c};row.push(id);}rows.push(row);}
  return {page:{title:'Regular navigation',sections:[{heading:'Services',diagram:{nodes,rows,edges:[],view:'step',autoplay:false}}]}};
}
const width=board=>board.locator('.boardcanvas>svg').evaluate(el=>el.getBoundingClientRect().width);
const scroll=board=>board.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
async function background(board){
  return board.evaluate(el=>{
    const rect=el.getBoundingClientRect(),root=el.getRootNode(),legend=el.querySelector('.lg').getBoundingClientRect();
    for(let y=Math.max(rect.top+20,legend.bottom+15);y<Math.min(innerHeight,rect.bottom)-20;y+=15)
      for(let x=Math.max(0,rect.left)+25;x<Math.min(innerWidth,rect.right)-25;x+=15){
        const hit=root.elementFromPoint(x,y);
        if(hit?.closest('.boardcanvas') && !hit.closest('a,button,[role="button"],[data-dv-node],[data-dv-step],[data-dv-edge],[data-dv-group],[data-dv-row]'))return {x,y};
      }
    throw Error('No diagram background found');
  });
}
for(const surface of ['standalone','workbench'])test(surface+' regular diagram pans and zooms without moving the page',async({page,server},testInfo)=>{
  const text=JSON.stringify(spec());await page.setViewportSize({width:1000,height:1000});
  if(surface==='standalone'){
    const input=path.join(server.root,'navigation.json');await writeFile(input,text);
    execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'navigation.html')]);
    await page.goto(server.origin+'/navigation.html');
  }else{await page.goto(server.origin+'/workbench.html');await paste(page,text);await pagePreview(page);}
  const board=page.locator('.board');await expect(board).toBeVisible();
  await board.getByRole('button',{name:'Zoom in',exact:true}).focus();
  const before=await width(board),height=(await board.boundingBox()).height,pageY=await page.evaluate(()=>scrollY);
  await board.getByRole('button',{name:'Zoom in',exact:true}).click();
  expect(await width(board)).toBeCloseTo(before*1.25,0);
  expect((await board.boundingBox()).height).toBeCloseTo(height,0);
  expect(await page.evaluate(()=>scrollY)).toBe(pageY);
  await board.getByRole('button',{name:'Zoom in',exact:true}).click();
  const start=await scroll(board),p=await background(board);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x-80,p.y-65,{steps:8});await page.mouse.up();
  const dragged=await scroll(board);expect(dragged.x).toBeGreaterThan(start.x+50);expect(dragged.y).toBeGreaterThan(start.y+40);
  const q=await background(board);await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(q.x+40,q.y+30,{steps:4});
  await page.keyboard.press('Escape');await page.mouse.up();expect(await scroll(board)).toEqual(dragged);
  const preWheel=await width(board);const w=await background(board);await page.mouse.move(w.x,w.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-30);await page.keyboard.up('Control');
  await expect.poll(()=>width(board)).toBeGreaterThan(preWheel);expect(await page.evaluate(()=>scrollY)).toBe(pageY);
  if(surface==='workbench'){
    await expect(page.locator('#src')).toHaveValue(text);
    const zoomed=await width(board);const edited=text.replace('Regular navigation','Renamed navigation');
    await page.locator('#editor-tab-json').click();await page.locator('#src').fill(edited);await page.locator('#go').click();await closeTools(page);
    await expect(page.getByRole('heading',{name:'Renamed navigation',exact:true})).toBeVisible();
    expect(await width(board)).toBeCloseTo(zoomed,0);
  }
  await board.getByRole('button',{name:'Fit diagram',exact:true}).click();
  const fitted=await board.evaluate(el=>{const b=el.getBoundingClientRect(),s=el.querySelector('.boardcanvas>svg').getBoundingClientRect();return {width:s.width,available:el.clientWidth,bottom:s.bottom,frameBottom:b.bottom};});
  expect(fitted.width).toBeLessThanOrEqual(fitted.available+1);expect(fitted.bottom).toBeLessThanOrEqual(fitted.frameBottom+1);
  await board.getByRole('button',{name:'Auto',exact:true}).click();
  await page.setViewportSize({width:680,height:1000});const wide=await width(board);
  await page.setViewportSize({width:620,height:1000});
  // Page gutters also change at a mobile breakpoint; the SVG should follow
  // its actual column, never jump back to the old 1180px readable floor.
  expect(await width(board)).toBeCloseTo(await board.evaluate(el=>el.clientWidth),0);
  expect(Math.abs(await width(board)-wide)).toBeLessThan(100);
  expect(await board.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('regular-navigation.png'),fullPage:true});
});

for(const surface of ['standalone','workbench'])test(surface+' keeps regular navigation separate from Explore camera',async({page,server})=>{
  const raw=spec(),d=raw.page.sections[0].diagram;
  d.layouts=[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:20}]}},
    {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:20}]}}];d.defaultLayout='standard';
  const text=JSON.stringify(raw);await page.setViewportSize({width:1200,height:1000});
  if(surface==='standalone'){
    const input=path.join(server.root,'navigation-views.json');await writeFile(input,text);
    execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'navigation-views.html')]);
    await page.goto(server.origin+'/navigation-views.html');
  }else{await page.goto(server.origin+'/workbench.html');await paste(page,text);await pagePreview(page);}
  const board=page.locator('.board');
  await board.getByRole('button',{name:'Zoom in',exact:true}).click();await board.getByRole('button',{name:'Zoom in',exact:true}).click();
  await board.evaluate(el=>{el.scrollLeft=120;el.scrollTop=140;});
  const initial={width:await width(board),scroll:await scroll(board)};
  for(const edit of [false,true]){
    await page.getByRole('button',{name:'Explore',exact:true}).click();
    await page.getByRole('button',{name:'Fit diagram',exact:true}).click();
    await board.evaluate(el=>{el.scrollLeft+=300;el.scrollTop+=400;});
    if(edit && surface==='workbench'){
      const edited=text.replace('Regular navigation','Renamed navigation');
      // Render through the same public editor action while the reading surface
      // owns fullscreen; do not switch to Standard before snapshotting.
      await page.locator('#src').evaluate((el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},edited);
      await page.locator('#go').evaluate(el=>el.click());
      await expect(page.locator('#src')).toHaveValue(edited);
      await expect(page.getByRole('heading',{name:'Renamed navigation',exact:true,includeHidden:true})).toHaveCount(1);
      await expect(board).toHaveClass(/explore-board/);
    }
    await page.getByRole('button',{name:'Standard',exact:true}).click();
    expect(await width(board)).toBeCloseTo(initial.width,0);expect(await scroll(board)).toEqual(initial.scroll);
  }
});
