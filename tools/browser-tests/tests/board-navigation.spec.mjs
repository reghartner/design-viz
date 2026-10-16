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
    const rect=el.getBoundingClientRect(),root=el.getRootNode(),legend=el.querySelector('.lg')?.getBoundingClientRect();
    for(let y=Math.max(rect.top+20,legend?legend.bottom+15:0);y<Math.min(innerHeight,rect.bottom)-20;y+=15)
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
  const board=page.locator('.board');await expect(board).toBeVisible();
  await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).focus();
  const before=await width(board),height=(await board.boundingBox()).height,pageY=await page.evaluate(()=>scrollY);
  await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
  expect(await width(board)).toBeCloseTo(before*1.25,0);
  expect((await board.boundingBox()).height).toBeCloseTo(height,0);
  expect(await page.evaluate(()=>scrollY)).toBe(pageY);
  await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
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
  // Compare the same full-width surface across the mobile gutter breakpoint.
  if(surface==='standalone')await page.locator('.reader-top>button').click();
  await page.setViewportSize({width:680,height:1000});const wide=await width(board);
  await page.setViewportSize({width:620,height:1000});
  // Page gutters also change at a mobile breakpoint; the SVG should follow
  // its actual column, never jump back to the old 1180px readable floor.
  expect(await width(board)).toBeCloseTo(await board.evaluate(el=>el.clientWidth),0);
  // The pushed Contents column closes at the compact breakpoint, returning its
  // width to the Standard page rather than preserving a desktop-sized gutter.
  if(surface==='workbench')expect(await width(board)).toBeGreaterThan(wide);
  else expect(Math.abs(await width(board)-wide)).toBeLessThan(100);
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
  }else{await page.goto(server.origin+'/workbench.html');await paste(page,text);await prepareEditorSurface(page);}
  const board=page.locator('.board');
  await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
  await board.evaluate(el=>{el.scrollLeft=120;el.scrollTop=140;});
  const initial={width:await width(board),scroll:await scroll(board)};
  for(const edit of [false,true]){
    await page.getByRole('button',{name:'Explore',exact:true}).click();
    if(surface==='standalone')await page.locator('.reader-zoom-menu>summary').click();
    await page.getByRole('button',{name:'Fit diagram',exact:true}).click();
    if(surface==='standalone')await page.keyboard.press('Escape');
    await board.evaluate(el=>{el.scrollLeft+=300;el.scrollTop+=400;});
    if(edit && surface==='workbench'){
      const edited=text.replace('Regular navigation','Renamed navigation');
      // Render through the same public editor action while the reading surface
      // owns fullscreen; do not switch to Standard before snapshotting.
      await page.locator('#src').evaluate((el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},edited);
      await page.locator('#go').evaluate(el=>el.click());
      await expect(page.locator('#src')).toHaveValue(edited);
      await expect(page.getByRole('heading',{name:'Renamed navigation',exact:true})).toHaveCount(1);
      await expect(board).toHaveClass(/explore-board/);
    }
    await page.getByRole('button',{name:'Standard',exact:true}).click();
    expect(await width(board)).toBeCloseTo(initial.width,0);expect(await scroll(board)).toEqual(initial.scroll);
  }
});

for(const embedded of [false,true])test((embedded?'iframe':'standalone')+' Standard wheel reaches below-fold panels after fitting and at zoom boundaries',async({page,server},info)=>{
  const raw=spec(),section=raw.page.sections[0],d=section.diagram;
  raw.page.skin='pastel';section.id='services';
  d.panels=[{id:'below',type:'state',title:'Below-fold panel',states:['Ready'],initial:{state:'Ready'}}];
  const tiles=[{x:0,y:0,w:12,h:16},{panel:'below',x:0,y:22,w:12,h:20}];
  d.layouts=[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:tiles}},
    {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:tiles}}];d.defaultLayout='standard';
  const input=path.join(server.root,'scroll-boundary.json'),output=path.join(server.root,'scroll-boundary.html');
  await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.setViewportSize({width:1280,height:800});
  let reader=page;
  if(embedded){
    await writeFile(path.join(server.root,'scroll-host.html'),'<!doctype html><style>body{margin:0}iframe{display:block;width:100%;height:740px;border:0}</style><iframe title="Embedded reader" src="scroll-boundary.html#embed=services&tour=0"></iframe>');
    await page.goto(server.origin+'/scroll-host.html');reader=page.frameLocator('iframe');
  }else await page.goto(server.origin+'/scroll-boundary.html#tour=0');
  const board=reader.locator('.board'),panel=reader.locator('[data-dv-panel="0"]');
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
  const geometry=()=>board.evaluate(el=>({y:el.scrollTop,max:el.scrollHeight-el.clientHeight,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,width:el.clientWidth,rect:el.getBoundingClientRect().toJSON(),legend:el.querySelector('.lg').getBoundingClientRect().toJSON(),legendHeight:el.querySelector('.lg').offsetHeight,css:el.getAttribute('style'),grid:el.closest('.section-layout-grid')?.getAttribute('style')}));
  const beforeGeometry=await geometry();
  await resetPage();await reader.getByRole('button',{name:'Explore',exact:true}).click();
  await expect(board).toHaveClass(/explore-board/);
  await expect(board).toHaveCSS('overscroll-behavior-y','contain');
  await reader.getByRole('button',{name:'Standard',exact:true}).click();
  await info.attach('standard-scroll-geometry',{body:JSON.stringify({before:beforeGeometry,after:await geometry()}),contentType:'application/json'});
  expect(await width(board)).toBeCloseTo(camera.width,0);expect(await scroll(board)).toEqual(camera.scroll);
  // Hash/API routing must release the borrowed sizing controls before the
  // Standard camera is restored, just like a click in Contents.
  for(const presentation of ['explore','standard']){
    await reader.locator('body').evaluate((el,presentation)=>{const params=new URLSearchParams(location.hash.slice(1));params.set('d','services');params.set('v',presentation);location.hash=params.toString();},presentation);
    if(presentation==='explore')await expect(board).toHaveClass(/explore-board/);else await expect(board).not.toHaveClass(/explore-board/);
  }
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
  await page.setViewportSize({width:1280,height:800});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);await closeTools(page);
  const board=page.locator('.board'),workspace=page.locator('.workmain'),panel=page.locator('[data-dv-panel="0"]');
  const workspaceY=()=>workspace.evaluate(el=>el.scrollTop);
  await expect(panel).not.toBeInViewport();
  for(let i=0;i<4;i++)await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
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

/* #550 viewer step keys outside Present. Contract matrix (standalone reader, one
   stepped section "main" with Standard + Explore Views; scoped to #section-main
   .stepline:not(.dv-caption-old) > b (the live caption, not the motion ghost), its .termbar[data-playback], the focused element, the board's scroll):
   row | fixture | assertion (scoped) | rejects
   R1 focused diagram ArrowRight | real click on board background, STEP 1/3, not presenting | board focused; STEP 2/3 | handler still gated on presenting()
   R2 focused diagram ArrowLeft | after R1 | STEP 1/3 | Right-only wiring
   R3 focused diagram Space plays | paused, autoplay off, motion allowed | data-playback=playing; keydown defaultPrevented (no page scroll) | Space left to scroll the page
   R4 Space again pauses | after R3 | data-playback=paused, STEP unchanged; keydown defaultPrevented | Space that only starts play, or scrolls the page when pausing
   R5 text input in the section | denied clipboard makes the in-section "Copy this link manually" field | ArrowLeft/ArrowRight/Space reach the field un-prevented (native caret keys); field keeps focus; STEP and playback unchanged | text fields hijacked
   R6 tab strip | "Views in selected Tab" Standard tab focused | ArrowRight focuses Explore tab; STEP unchanged | tabs hijacked
   R7 zoomed Standard board | Zoom in, board focused | ArrowRight scrolls board right; STEP unchanged | pan keys hijacked on a pannable board
   R8 Explore board | Explore View, zoomed, board keyboard-focused | ArrowRight scrolls board right; STEP unchanged | Explore arrow panning hijacked
   R9 focus outside any diagram | real click on the page title (body focused), then PRESENT button focused; not presenting | Space and ArrowRight/ArrowLeft not defaultPrevented, the page scrolls down on Space, STEP and playback unchanged | page-wide Space/arrow hijack
   R10 Present unchanged | PRESENT clicked, EXIT button (outside the section) focused | ArrowRight/ArrowLeft step, Space toggles play, Escape exits | Present path narrowed to focused diagrams */
function stepKeysSpec(){
  const layout=(id,name)=>({id,name,presentation:id,sectionLayout:{default:[{x:0,y:0,w:12,h:20}]}});
  return {page:{title:'Step keys',sections:[{id:'main',heading:'Main flow',diagram:{view:'step',autoplay:false,
    nodes:{a:{title:'Source'},b:{title:'Relay'},c:{title:'Destination'}},rows:[['a','b','c']],
    edges:[{from:'a',to:'b'},{from:'b',to:'c'}],
    steps:[{id:'one',text:'One',edge:'a->b'},{id:'two',text:'Two',edge:'b->c'},{id:'three',text:'Three',edge:'a->b'}],
    layouts:[layout('standard','Standard'),layout('explore','Explore')],defaultLayout:'standard'}}]}};
}
test('standalone focused diagram steps with arrows and Space outside Present without taking other keys',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:900});
  const input=path.join(server.root,'step-keys.json');await writeFile(input,JSON.stringify(stepKeysSpec()));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'step-keys.html')]);
  await page.goto(server.origin+'/step-keys.html');
  await page.evaluate(()=>{window.stepKeyLog=[];addEventListener('keydown',ev=>window.stepKeyLog.push(ev.key+':'+ev.defaultPrevented));});
  const lastKey=()=>page.evaluate(()=>window.stepKeyLog.at(-1));
  const section=page.locator('#section-main'),board=section.locator('.board'),step=section.locator('.stepline:not(.dv-caption-old) > b'),bar=section.locator('.termbar');
  await expect(page.locator('body')).not.toHaveClass(/presenting/);
  await expect(step).toHaveText('STEP 1/3');await expect(bar).toHaveAttribute('data-playback','paused');
  // R1-R4: a focused diagram owns ArrowRight / ArrowLeft / Space.
  const p=await background(board);await page.mouse.click(p.x,p.y);await expect(board).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(step).toHaveText('STEP 2/3');
  await page.keyboard.press('ArrowLeft');await expect(step).toHaveText('STEP 1/3');
  await page.keyboard.press('Space');await expect(bar).toHaveAttribute('data-playback','playing');expect(await lastKey()).toBe(' :true');
  await page.keyboard.press('Space');await expect(bar).toHaveAttribute('data-playback','paused');await expect(step).toHaveText('STEP 1/3');expect(await lastKey()).toBe(' :true');
  // R5: a text field inside the section keeps its keys.
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Denied');};document.execCommand=()=>false;});
  await section.getByRole('button',{name:'Copy link to this diagram step',exact:true}).click();
  const field=section.getByRole('textbox',{name:'Copy this link manually',exact:true});await expect(field).toBeFocused();
  for(const key of ['ArrowLeft','ArrowRight','Space']){await page.keyboard.press(key);expect(await lastKey()).toBe((key==='Space'?' ':key)+':false');}
  await expect(field).toBeFocused();await expect(step).toHaveText('STEP 1/3');await expect(bar).toHaveAttribute('data-playback','paused');
  // R6: the Views tab strip keeps its roving arrows.
  const strip=page.getByRole('tablist',{name:'Views in selected Tab'});
  await strip.getByRole('tab',{name:'Standard',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(strip.getByRole('tab',{name:'Explore',exact:true})).toBeFocused();await expect(step).toHaveText('STEP 1/3');
  // R7: a zoomed Standard board keeps native arrow panning.
  await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
  await board.getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
  await board.evaluate(el=>{el.scrollLeft=0;});const z=await background(board);await page.mouse.click(z.x,z.y);await expect(board).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect.poll(()=>board.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);await expect(step).toHaveText('STEP 1/3');
  // R8: an Explore board keeps native arrow panning.
  await strip.getByRole('tab',{name:'Explore',exact:true}).click();await expect(board).toHaveClass(/explore-board/);
  await page.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
  await page.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();
  await board.evaluate(el=>{el.scrollLeft=0;});await board.focus();await expect(board).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect.poll(()=>board.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);await expect(step).toHaveText('STEP 1/3');
  await strip.getByRole('tab',{name:'Standard',exact:true}).click();
  // R9: focus outside every diagram leaves the keys to the page.
  const present=page.getByRole('button',{name:'Enter presenter mode (fullscreen)',exact:true});
  await page.evaluate(()=>scrollTo(0,0));await page.getByRole('heading',{name:'Step keys',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.activeElement===document.body)).toBe(true);
  await page.keyboard.press('Space');expect(await lastKey()).toBe(' :false');await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  for(const key of ['ArrowRight','ArrowLeft']){await page.keyboard.press(key);expect(await lastKey()).toBe(key+':false');}
  await expect(step).toHaveText('STEP 1/3');await expect(bar).toHaveAttribute('data-playback','paused');
  await page.evaluate(()=>scrollTo(0,0));
  await present.focus();await page.keyboard.press('ArrowRight');expect(await lastKey()).toBe('ArrowRight:false');await expect(step).toHaveText('STEP 1/3');
  // R10: Present keeps stepping whatever is focused.
  await present.click();await expect(page.locator('body')).toHaveClass(/presenting/);await expect(present).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(step).toHaveText('STEP 2/3');
  await page.keyboard.press('ArrowLeft');await expect(step).toHaveText('STEP 1/3');
  await page.keyboard.press('Space');await expect(bar).toHaveAttribute('data-playback','playing');
  await page.keyboard.press('Space');await expect(bar).toHaveAttribute('data-playback','paused');
  await page.keyboard.press('Escape');await expect(page.locator('body')).not.toHaveClass(/presenting/);
});
