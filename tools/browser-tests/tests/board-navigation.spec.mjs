import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
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
  }else{await page.goto(server.origin+'/workbench.html');await paste(page,text);await prepareEditorSurface(page);}
  const board=page.locator('.board:visible');await expect(board).toBeVisible();
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
    const zoomed=await width(board);const edited=(await page.locator('#src').inputValue()).replace('Regular navigation','Renamed navigation');
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
  const standardSection=raw.page.sections[0],exploreSection=structuredClone(standardSection);exploreSection.id='explore-services';raw.page.sections=[{tabs:[{label:'Standard',sections:[standardSection]},{label:'Explore',presentation:'explore',sections:[exploreSection]}]}];
  const text=JSON.stringify(raw);await page.setViewportSize({width:1200,height:1000});
  if(surface==='standalone'){
    const input=path.join(server.root,'navigation-views.json');await writeFile(input,text);
    execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'navigation-views.html')]);
    await page.goto(server.origin+'/navigation-views.html');
  }else{await page.goto(server.origin+'/workbench.html');await paste(page,text);await prepareEditorSurface(page);}
  const board=page.locator('.board:visible');
  await board.getByRole('button',{name:'Zoom in',exact:true}).click();await board.getByRole('button',{name:'Zoom in',exact:true}).click();
  await board.evaluate(el=>{el.scrollLeft=120;el.scrollTop=140;});
  const initial={width:await width(board),scroll:await scroll(board)};
  for(const edit of [false,true]){
    await page.getByRole('tab',{name:'Explore',exact:true}).click();
    await page.getByRole('button',{name:'Fit diagram',exact:true}).click();
    await board.evaluate(el=>{el.scrollLeft+=300;el.scrollTop+=400;});
    if(edit && surface==='workbench'){
      const edited=(await page.locator('#src').inputValue()).replace('Regular navigation','Renamed navigation');
      // Render through the same public editor action while the reading surface
      // owns fullscreen; do not switch to Standard before snapshotting.
      await page.locator('#src').evaluate((el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},edited);
      await page.locator('#go').evaluate(el=>el.click());
      await expect(page.locator('#src')).toHaveValue(edited);
      await expect(page.getByRole('heading',{name:'Renamed navigation',exact:true,includeHidden:true})).toHaveCount(1);
      await expect(board).toHaveClass(/explore-board/);
    }
    await page.getByRole('tab',{name:'Standard',exact:true}).click();
    expect(await width(board)).toBeCloseTo(initial.width,0);expect(await scroll(board),'after source edit='+edit).toEqual(initial.scroll);
  }
});

for(const embedded of [false,true])test((embedded?'iframe':'standalone')+' Standard wheel reaches below-fold panels after fitting and at zoom boundaries',async({page,server},info)=>{
  const raw=spec(),section=raw.page.sections[0],d=section.diagram;
  raw.page.skin='pastel';section.id='services';
  d.panels=[{id:'below',type:'state',title:'Below-fold panel',states:['Ready'],initial:{state:'Ready'}}];
  const tiles=[{x:0,y:0,w:12,h:16},{panel:'below',x:0,y:22,w:12,h:20}];
  d.layouts=[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:tiles}},
    {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:tiles}}];d.defaultLayout='standard';
  const standardSection=raw.page.sections[0],exploreSection=structuredClone(standardSection);exploreSection.id='explore-services';raw.page.sections=[{tabs:[{label:'Standard',sections:[standardSection]},{label:'Explore',presentation:'explore',sections:[exploreSection]}]}];
  const input=path.join(server.root,'scroll-boundary.json'),output=path.join(server.root,'scroll-boundary.html');
  await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.setViewportSize({width:1280,height:800});
  let reader=page;
  if(embedded){
    await writeFile(path.join(server.root,'scroll-host.html'),'<!doctype html><style>body{margin:0}iframe{display:block;width:100%;height:740px;border:0}</style><iframe title="Embedded reader" src="scroll-boundary.html#tour=0"></iframe>');
    await page.goto(server.origin+'/scroll-host.html');reader=page.frameLocator('iframe');
  }else await page.goto(server.origin+'/scroll-boundary.html#tour=0');
  const board=reader.locator('.board:visible'),panel=reader.locator('[data-dv-panel="0"]:visible');
  const pageY=()=>reader.locator('body').evaluate(()=>scrollY);
  const resetPage=()=>reader.locator('body').evaluate(()=>scrollTo(0,0));
  const point=async()=>{const b=await board.boundingBox();return {x:b.x+b.width*.7,y:b.y+Math.min(b.height*.5,240)};};
  await expect(board).toBeVisible();await expect(panel).not.toBeInViewport();
  await board.getByRole('button',{name:'Fit diagram',exact:true}).click();
  await expect(board).toHaveClass(/board-zoomed/);
  await expect(board).toHaveCSS('overscroll-behavior-x','contain');
  await expect(board).toHaveCSS('overscroll-behavior-y','auto');
  expect(await board.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  let before=await pageY(),p=await point();await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,600);
  await expect.poll(pageY).toBeGreaterThan(before+200);
  await expect(panel).toBeInViewport();
  await page.screenshot({path:info.outputPath('standard-fit-scroll-'+(embedded?'iframe':'standalone')+'.png')});
  await resetPage();
  // Real modified wheel remains diagram zoom, without moving its containing page.
  before=await pageY();const fitted=await width(board);p=await point();await page.mouse.move(p.x,p.y);
  await page.keyboard.down('Control');await page.mouse.wheel(0,-180);await page.keyboard.up('Control');
  await expect.poll(()=>width(board)).toBeGreaterThan(fitted*1.5);expect(await pageY()).toBe(before);
  expect(await board.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(100);
  await board.evaluate(el=>{el.scrollTop=0;});p=await point();await page.mouse.move(p.x,p.y);await page.mouse.wheel(4,80);
  await expect.poll(()=>board.evaluate(el=>el.scrollTop)).toBeGreaterThan(20);expect(await pageY()).toBe(before);
  await board.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const contained=board.locator('[data-wheel-contained]');
  await board.evaluate(el=>{const scroller=document.createElement('div'),content=document.createElement('div');scroller.dataset.wheelContained='';Object.assign(scroller.style,{position:'absolute',left:el.scrollLeft+40+'px',top:el.scrollTop+80+'px',width:'140px',height:'80px',overflow:'auto',overscrollBehaviorY:'contain',zIndex:'20',background:'#fff'});content.style.height='240px';content.textContent='Contained wheel target';scroller.append(content);el.querySelector('.boardcanvas').append(scroller);scroller.scrollTop=scroller.scrollHeight;});
  await expect(contained).toBeVisible();await expect(contained).toHaveCSS('overscroll-behavior-y','contain');
  expect(await contained.evaluate(el=>el.scrollTop+el.clientHeight>=el.scrollHeight-1)).toBe(true);
  const containedBox=await contained.boundingBox(),containedBoard=await scroll(board);
  await page.mouse.move(containedBox.x+containedBox.width/2,containedBox.y+containedBox.height/2);for(let i=0;i<4;i++)await page.mouse.wheel(4,50);
  expect(await pageY()).toBe(before);expect(await scroll(board)).toEqual(containedBoard);await contained.evaluate(el=>el.remove());
  for(let i=0;i<12;i++)await page.mouse.wheel(4,50);
  await expect.poll(pageY).toBeGreaterThan(before+200);await expect(panel).toBeInViewport();
  expect(await pageY()).toBeLessThanOrEqual(before+600);
  before=await pageY();await board.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  for(let i=0;i<12;i++)await page.mouse.wheel(50,4);
  expect(await pageY()).toBeLessThanOrEqual(before+60);
  await board.evaluate(el=>{const spacer=document.createElement('div');spacer.dataset.wheelTopSpacer='';spacer.style.height='500px';el.closest('.doc-sec').before(spacer);el.scrollTop=0;el.scrollIntoView({block:'center'});});
  before=await pageY();expect(before).toBeGreaterThan(200);p=await point();await page.mouse.move(p.x,p.y);
  for(let i=0;i<6;i++)await page.mouse.wheel(4,-50);
  await expect.poll(pageY).toBeLessThan(before-200);expect(await pageY()).toBeGreaterThanOrEqual(before-300);
  await board.evaluate(el=>{document.querySelector('[data-wheel-top-spacer]').remove();el.scrollLeft=0;el.scrollTop=el.scrollHeight;});
  const camera={width:await width(board),scroll:await scroll(board)};
  await resetPage();await reader.getByRole('tab',{name:'Explore',exact:true}).click();
  await expect(board).toHaveClass(/explore-board/);
  await expect(board).toHaveCSS('overscroll-behavior-y','contain');
  await reader.getByRole('tab',{name:'Standard',exact:true}).click();
  expect(await width(board)).toBeCloseTo(camera.width,0);expect(await scroll(board)).toEqual(camera.scroll);
  await expect(reader.locator('body')).not.toHaveClass(/viewer-exploring/);
  await resetPage();p=await point();await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,600);
  await expect.poll(pageY).toBeGreaterThan(200);await expect(panel).toBeInViewport();
  if(embedded){
    await reader.locator('body').evaluate(()=>scrollTo(0,document.scrollingElement.scrollHeight));
    await page.locator('iframe').evaluate(el=>{for(const text of ['Host before','Host after']){const spacer=document.createElement('div');spacer.textContent=text;spacer.style.height='700px';el[text==='Host before'?'before':'after'](spacer);}});
    await page.evaluate(()=>scrollTo(0,650));const hostBefore=await page.evaluate(()=>scrollY),frameBox=await page.locator('iframe').boundingBox();
    await page.mouse.move(frameBox.x+frameBox.width/2,frameBox.y+frameBox.height/2);await page.mouse.wheel(0,600);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(hostBefore+200);
  }
});

test('workbench Standard board routes vertical-dominant wheel at its boundary to the workspace',async({page,server})=>{
  const raw=spec(),section=raw.page.sections[0],d=section.diagram;
  section.id='services';
  d.panels=[{id:'below',type:'state',title:'Below-fold panel',states:['Ready'],initial:{state:'Ready'}}];
  d.layouts=[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:[
    {x:0,y:0,w:12,h:16},{panel:'below',x:0,y:22,w:12,h:20}
  ]}}];d.defaultLayout='standard';
  const standardSection=raw.page.sections[0],exploreSection=structuredClone(standardSection);exploreSection.id='explore-services';raw.page.sections=[{tabs:[{label:'Standard',sections:[standardSection]},{label:'Explore',presentation:'explore',sections:[exploreSection]}]}];
  await page.setViewportSize({width:1280,height:800});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);await closeTools(page);
  const board=page.locator('.board:visible'),workspace=page.locator('.workmain'),panel=page.locator('[data-dv-panel="0"]:visible');
  const workspaceY=()=>workspace.evaluate(el=>el.scrollTop);
  await expect(panel).not.toBeInViewport();
  for(let i=0;i<4;i++)await board.getByRole('button',{name:'Zoom in',exact:true}).click();
  expect(await board.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(100);
  await board.evaluate(el=>{el.scrollTop=0;});
  let p=await background(board);await page.mouse.move(p.x,p.y);await page.mouse.wheel(4,80);
  await expect.poll(()=>board.evaluate(el=>el.scrollTop)).toBeGreaterThan(20);expect(await workspaceY()).toBe(0);
  await board.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  for(let i=0;i<12;i++)await page.mouse.wheel(4,50);
  await expect.poll(workspaceY).toBeGreaterThan(200);await expect(panel).toBeInViewport();
  expect(await workspaceY()).toBeLessThanOrEqual(600);
  await board.evaluate(el=>{const spacer=document.createElement('div');spacer.dataset.wheelTopSpacer='';spacer.style.height='500px';el.closest('.doc-sec').before(spacer);el.scrollTop=0;el.scrollIntoView({block:'center'});});
  const before=await workspaceY();expect(before).toBeGreaterThan(200);p=await background(board);await page.mouse.move(p.x,p.y);
  for(let i=0;i<6;i++)await page.mouse.wheel(4,-50);
  await expect.poll(workspaceY).toBeLessThan(before-200);expect(await workspaceY()).toBeGreaterThanOrEqual(before-300);
});
