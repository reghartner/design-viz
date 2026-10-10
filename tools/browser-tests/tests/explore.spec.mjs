import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const named=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
async function build(server,{unstacked=false,oversized=false}={}){
 const spec=structuredClone(named),sec=spec.page.sections[0],d=sec.diagram;sec.id='doorbell';d.autoplay=false;
 delete d.layouts[1].exploreLayout;d.layouts[1].sectionLayout.default.forEach(t=>{if(t.panel)t.hidden=false;});
 d.panels.push({id:'queue',type:'queue',title:'Upload queue',initial:{depth:3}});
 if(unstacked)d.layouts[1].exploreLayout={
  panels:d.panels.map((panel,index)=>({panel:panel.id,x:.02+index*.2,y:.12,w:.18,h:oversized && panel.id==='outcome' ? 1 : .22,stacked:false})),
  prose:{x:.02,y:.52,w:.22,h:.26,stacked:false}
 };
 d.steps[1].panelVisibility={queue:false};d.steps[1].text='A deliberately long engineering caption. '.repeat(60);
 for(let r=0;r<8;r++){const row=[];for(let c=0;c<8;c++){const id='extra'+r+'_'+c;d.nodes[id]={title:'Service '+r+'.'+c};row.push(id);}d.rows.push(row);}
 const input=path.join(server.root,'explore.json'),output=path.join(server.root,'explore.html');await writeFile(input,JSON.stringify(spec));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/explore.html';
}
async function buildDynamic(server){
 const columns=[{id:'event',label:'Event'},{id:'status',label:'Status'}];
 const panel=id=>({id,type:'table',title:id[0].toUpperCase()+id.slice(1),columns,initial:{rows:[{id:'ready',cells:{event:'Ready',status:'Waiting'}}]}});
 const rich=Array.from({length:6},(_,index)=>({id:'event-'+index,cells:{event:'Event '+(index+1),status:index<5?'Processed':'Ready'}}));
 const raw={page:{title:'Dynamic Explore panels',sections:[{id:'dynamic',heading:'Dynamic panels',diagram:{autoplay:false,view:'step',defaultLayout:'flow',nodes:{service:{title:'Service'}},rows:[['service']],panels:['dynamic','revealed','authored','manual'].map(panel),steps:[
  {id:'short',text:'Panels begin with one row.',panelVisibility:{revealed:false}},
  {id:'rich',text:'Panels gain a moderate event history.',panelVisibility:{revealed:true},panels:{dynamic:{rows:rich},revealed:{rows:rich},authored:{rows:rich},manual:{rows:rich}}}
 ],layouts:[{id:'flow',name:'Flow',presentation:'explore',exploreLayout:{panels:[{panel:'authored',x:.73,y:.02,w:.25,h:.15,stacked:true}]},sectionLayout:{default:[{x:0,y:0,w:8,h:18},{controls:'steps',x:0,y:18,w:8,h:6},{panel:'dynamic',x:8,y:0,w:4,h:6},{panel:'revealed',x:8,y:6,w:4,h:6},{panel:'authored',x:8,y:12,w:4,h:6},{panel:'manual',x:8,y:18,w:4,h:6}]}}]}}]}};
 const input=path.join(server.root,'dynamic-explore.json'),output=path.join(server.root,'dynamic-explore.html');await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/dynamic-explore.html#d=dynamic&v=flow&m=step&s=short';
}
const floats=p=>p.locator('.explore-window:visible');
const rect=loc=>loc.boundingBox();
const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
const responsiveScale=width=>width<800?1:Math.round((.8+.2*Math.max(0,Math.min(1,(width-1280)/160)))*100)/100;
test('Business remains standard; linked Explore has a full-height canvas and independent edge stack',async({page,server})=>{
 const url=await build(server);await page.goto(url);await expect(page.locator('.explore-stage')).toBeHidden();
 await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 await expect(page.locator('.explore-stage')).toBeVisible();await expect(floats(page)).toHaveCount(5);
 const before=await page.locator('.boardcanvas>svg').count();
 const shell=await rect(page.locator('.viewer-diagram-canvas')),nav=await rect(page.locator('.explore-navigation'));
 const stage=await rect(page.locator('.explore-stage')),board=await rect(page.locator('.explore-board')),viewport=page.viewportSize();
 expect(nav.y).toBe(0);expect(shell).toEqual({x:0,y:nav.height,width:viewport.width,height:viewport.height-nav.height});
 expect(stage.y).toBeGreaterThanOrEqual(nav.y+nav.height);
 expect(stage.x).toBeGreaterThanOrEqual(shell.x);expect(stage.x+stage.width).toBeLessThanOrEqual(shell.x+shell.width);
 expect(board).toEqual(stage);
 const stacked=await Promise.all((await floats(page).all()).map(rect));
 const rights=stacked.map(r=>r.x+r.width),rightmost=Math.max(...rights);
 expect(Math.abs(rightmost-stage.x-stage.width+12)).toBeLessThan(3);
 expect(Math.min(...rights)).toBeLessThan(rightmost-100);
 for(const r of stacked)expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height-10);
 const play=page.getByRole('button',{name:'Next step',exact:true}),pos=await rect(play);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await page.locator('.explore-board').evaluate(el=>{el.scrollLeft=1000;el.scrollTop=900;});
 const after=await rect(play);expect(after.x).toBeCloseTo(pos.x,0);expect(after.y).toBeCloseTo(pos.y,0);
 await play.click();await expect(floats(page)).toHaveCount(4);const long=await rect(play);expect(long.x).toBeCloseTo(pos.x,0);expect(long.y).toBeLessThanOrEqual(pos.y);
 // The automatic dock now grows upward to fit a longer caption while staying
 // anchored above the reader utilities; graph pan and zoom still leave it stationary.
 const player=await rect(page.locator('.explore-player')),utilities=await rect(page.locator('#docview > .reader-page-actions'));
 expect(player.y+player.height).toBeCloseTo(utilities.y-12,0);expect(overlaps(player,utilities)).toBe(false);
 expect(await page.locator('.explore-player .stepline').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
 await page.getByRole('button',{name:'Home story',exact:true}).click();await expect(page.locator('.explore-stage')).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
 await page.getByRole('button',{name:'Service flow',exact:true}).click();await expect(page.locator('.explore-stage')).toBeVisible();
 expect(await page.locator('.boardcanvas>svg').count()).toBe(before);
 await page.getByRole('button',{name:'Fit diagram',exact:true}).click();await page.screenshot({path:'/tmp/flowview-explore-live.png',fullPage:true});
});
test('right and top-right remain free placement; Stack at edge preserves size and wraps left',async({page,server})=>{
 const url=await build(server,{unstacked:true});await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 const stage=await rect(page.locator('.explore-stage')),cards=await floats(page).all();expect(cards).toHaveLength(5);
 const home=page.locator('[data-explore-panel=home]'),grip=home.locator('.explore-window-grip');
 const start=await rect(home),handle=await rect(grip),target={x:stage.x+stage.width-start.width-12,y:stage.y+12};
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
 await page.mouse.move(handle.x+handle.width/2+target.x-start.x,handle.y+handle.height/2+target.y-start.y,{steps:5});await page.mouse.up();
 await expect(home).not.toHaveClass(/explore-stacked/);const placed=await rect(home);
 expect(placed.x).toBeCloseTo(target.x,0);expect(placed.y).toBeCloseTo(target.y,0);
 await expect(grip).toHaveAttribute('title','Drag to move; arrow keys to move');
 const freeSizes=await Promise.all(cards.map(async card=>{const r=await rect(card);return {width:r.width,height:r.height};}));
 await page.locator('.explore-panel-menu summary').click();await page.getByRole('button',{name:'Stack at edge',exact:true}).click();await page.keyboard.press('Escape');
 for(const card of cards)await expect(card).toHaveClass(/explore-stacked/);
 const stacked=await Promise.all(cards.map(rect));
 stacked.forEach((r,index)=>{expect(r.width).toBeCloseTo(freeSizes[index].width,0);expect(r.height).toBeCloseTo(freeSizes[index].height,0);});
 const rights=stacked.map(r=>r.x+r.width),rightmost=Math.max(...rights);
 expect(Math.abs(rightmost-stage.x-stage.width+12)).toBeLessThan(3);
 expect(Math.min(...rights)).toBeLessThan(rightmost-100);
 const columns=[];stacked.forEach(r=>{const right=r.x+r.width;let column=columns.find(c=>Math.abs(c.right-right)<2);if(!column){column={right,rects:[]};columns.push(column);}column.rects.push(r);});
 expect(columns.length).toBeGreaterThan(1);
 for(const column of columns){
  column.rects.sort((a,b)=>a.y-b.y);expect(column.rects[0].y).toBeCloseTo(stage.y+12,0);
  column.rects.forEach((r,index)=>{expect(r.y+r.height).toBeLessThanOrEqual(stage.y+stage.height-10);if(index)expect(r.y-column.rects[index-1].y-column.rects[index-1].height).toBeCloseTo(8,0);});
 }
});
test('automatic Explore panels open at readable content size across desktop viewports and Workbench',async({page,server},info)=>{
 const url=await build(server);
 for(const [surface,width,height] of [['reader',1280,800],['reader',1440,900],['reader',1920,1200],['workbench',1280,800],['workbench',1440,900]]){
  await page.setViewportSize({width,height});
  if(surface==='reader')await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
  else{await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,await readFile(path.join(server.root,'explore.json'),'utf8'));await closeTools(page);await page.getByRole('button',{name:'Service flow',exact:true}).click();}
  await page.evaluate(()=>document.fonts.ready);
  const stage=await rect(page.locator('.explore-stage')),scale=responsiveScale(stage.width);
  await expect(page.locator('.explore-overlay-value')).toHaveText(Math.round(scale*100)+'%');
  const windows=await floats(page).evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.explore-window-body');return {id:el.getAttribute('data-explore-panel') || el.getAttribute('data-explore-content'),x:r.x,y:r.y,width:r.width,height:r.height,clientHeight:body.clientHeight,scrollHeight:body.scrollHeight};}));
  expect(windows.map(w=>w.id).sort()).toEqual(['clip','home','outcome','prose','queue']);
  for(const win of windows){
   const preferred={clip:340,home:340,outcome:300,prose:320,queue:300}[win.id];expect(win.width,win.id).toBeCloseTo(preferred*(win.id==='prose'?1:scale),0);
   expect(win.scrollHeight-win.clientHeight,win.id).toBeLessThanOrEqual(2);
   expect(win.x,win.id+' left bound').toBeGreaterThanOrEqual(stage.x+10);expect(win.y,win.id+' top bound').toBeGreaterThanOrEqual(stage.y+10);
   expect(win.x+win.width,win.id+' right bound').toBeLessThanOrEqual(stage.x+stage.width-10);expect(win.y+win.height,win.id+' bottom bound').toBeLessThanOrEqual(stage.y+stage.height-10);
  }
  // Notes remain 320px at 100%; allow two columns with an 8px gap.
  const footprint=stage.x+stage.width-12-Math.min(...windows.map(win=>win.x));
  expect(footprint,surface+' panel footprint').toBeLessThanOrEqual(Math.ceil(Math.max(320,340*scale)+340*scale+8));
  for(let a=0;a<windows.length;a++)for(let b=a+1;b<windows.length;b++)expect(overlaps(windows[a],windows[b]),windows[a].id+' overlaps '+windows[b].id).toBe(false);
  const controls=await rect(page.locator('.explore-player'));
  for(const win of windows)expect(overlaps(win,controls),win.id+' overlaps controls').toBe(false);
  await info.attach(surface+'-'+width+'x'+height+'-geometry',{body:JSON.stringify({stage,scale,footprint,windows,controls}),contentType:'application/json'});
  await info.attach(surface+'-'+width+'x'+height,{body:await page.screenshot(),contentType:'image/png'});
  if(width===1280)await page.screenshot({path:'/tmp/explore-'+surface+'-1280x800-responsive.png'});
 }
});
test('automatic panels remeasure when a late font changes rendered content metrics',async({page,server})=>{
 const fontName='explore-late-font.woff2';
 await writeFile(path.join(server.root,fontName),await readFile(path.join(repo,'src/fonts/ibm-plex-mono-latin-400-normal.woff2')));
 await page.setViewportSize({width:1280,height:800});await page.goto(await build(server)+'#d=doorbell&v=service-flow&m=step&s=quiet');
 await page.evaluate(()=>document.fonts.ready);
 const outcome=page.locator('[data-explore-panel=outcome]'),before=await rect(outcome);
 await page.evaluate(async font=>{
  const style=document.createElement('style');
  style.textContent='@font-face{font-family:"Explore late metric";src:url("/'+font+'") format("woff2")} [data-explore-panel="outcome"] .pchip{font:20px/32px "Explore late metric",monospace}';
  document.head.appendChild(style);await document.fonts.load('20px "Explore late metric"');await document.fonts.ready;
 },fontName);
 await expect.poll(()=>outcome.locator('.explore-window-body').evaluate(el=>el.scrollHeight-el.clientHeight),{message:'Late font metrics trigger an automatic panel remeasure'}).toBeLessThanOrEqual(2);
 expect((await rect(outcome)).height).toBeGreaterThan(before.height+10);
});
test('automatic panels follow richer step content while authored and manual geometry stay fixed',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(await buildDynamic(server));await page.evaluate(()=>document.fonts.ready);
 const dynamic=page.locator('[data-explore-panel=dynamic]'),revealed=page.locator('[data-explore-panel=revealed]');
 const authored=page.locator('[data-explore-panel=authored]'),manual=page.locator('[data-explore-panel=manual]');
 await expect(revealed).toBeHidden();await manual.locator('.explore-window-resize').press('ArrowDown');
 await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const before={dynamic:await rect(dynamic),authored:await rect(authored),manual:await rect(manual)};
 await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(revealed).toBeVisible();
 await expect.poll(async()=>(await rect(dynamic)).height).toBeGreaterThan(before.dynamic.height+40);
 const after={dynamic:await rect(dynamic),revealed:await rect(revealed),authored:await rect(authored),manual:await rect(manual)};
 for(const key of ['authored','manual']){expect(after[key].width).toBeCloseTo(before[key].width,0);expect(after[key].height).toBeCloseTo(before[key].height,0);}
 for(const panel of [dynamic,revealed])expect(await panel.locator('.explore-window-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(2);
 const visible=[after.dynamic,after.revealed,after.authored,after.manual];
 for(let a=0;a<visible.length;a++)for(let b=a+1;b<visible.length;b++)expect(overlaps(visible[a],visible[b])).toBe(false);
 const controls=await rect(page.locator('.explore-player'));for(const panel of visible)expect(overlaps(panel,controls)).toBe(false);
 await info.attach('dynamic-panels-1280x800',{body:await page.screenshot(),contentType:'image/png'});
});
for(const surface of ['reader','workbench'])test(surface+' keeps a maximum-height stacked panel full-size and sends the following panel left',async({page,server})=>{
 const url=await build(server,{unstacked:true,oversized:true});
 if(surface==='reader')await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 else{await page.goto(server.origin+'/workbench.html');await paste(page,await readFile(path.join(server.root,'explore.json'),'utf8'));await closeTools(page);await page.getByRole('button',{name:'Service flow',exact:true}).click();}
 const stage=await rect(page.locator('.explore-stage')),oversized=page.locator('[data-explore-panel=outcome]'),following=page.locator('[data-explore-panel=clip]');
 const beforeOversized=await rect(oversized),beforeFollowing=await rect(following);
 const tools=surface==='workbench'?await rect(page.locator('#workspace-canvas-controls')):null;
 const utilities=surface==='reader'?await rect(page.locator('#docview > .reader-page-actions')):null;
 const insetBottom=tools?Math.max(68,stage.y+stage.height-tools.y+12):stage.y+stage.height-utilities.y+12,laneHeight=stage.height-12-insetBottom;
 if(surface==='workbench')expect(beforeOversized.height).toBeGreaterThan(laneHeight);
 else expect(beforeOversized.height).toBeCloseTo(laneHeight,0);
 await page.locator('.explore-panel-menu summary').click();await page.getByRole('button',{name:'Stack at edge',exact:true}).click();await page.keyboard.press('Escape');
 const afterOversized=await rect(oversized),afterFollowing=await rect(following);
 expect(afterOversized.width).toBeCloseTo(beforeOversized.width,0);expect(afterOversized.height).toBeCloseTo(beforeOversized.height,0);
 expect(afterFollowing.width).toBeCloseTo(beforeFollowing.width,0);expect(afterFollowing.height).toBeCloseTo(beforeFollowing.height,0);
 expect(afterOversized.y).toBeCloseTo(stage.y+12,0);expect(afterFollowing.y).toBeCloseTo(stage.y+12,0);
 if(surface==='workbench')expect(afterOversized.y+afterOversized.height).toBeGreaterThan(stage.y+stage.height-insetBottom);
 else{expect(afterOversized.y+afterOversized.height).toBeCloseTo(utilities.y-12,0);expect(overlaps(afterOversized,utilities)).toBe(false);}
 expect(afterFollowing.x+afterFollowing.width).toBeCloseTo(afterOversized.x-8,0);
});
test('panels resize inward below 210px, detach, cancel, hide and restore independently',async({page,server})=>{
 const url=await build(server);await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 const home=page.locator('[data-explore-panel=home]'),handle=home.locator('.explore-window-resize');
 const initial=await rect(home);let r=await rect(handle);await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+initial.width-145,r.y+15,{steps:5});await page.mouse.up();
 expect((await rect(home)).width).toBeLessThan(160);const narrow=await rect(home);
 const grip=home.locator('.explore-window-grip');await grip.focus();await page.keyboard.press('ArrowLeft');await expect(home).not.toHaveClass(/explore-stacked/);
 const detached=await rect(home);await grip.press('ArrowLeft');expect((await rect(home)).x).toBeLessThan(detached.x);
 r=await rect(grip);const start=await rect(home);await page.mouse.move(r.x+20,r.y+15);await page.mouse.down();await page.mouse.move(r.x-220,r.y+100,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();expect((await rect(home)).x).toBeCloseTo(start.x,0);
 await home.getByRole('button',{name:/^Hide /}).click();await expect(home).toBeHidden();
 await page.locator('.explore-panel-menu summary').click();await page.locator('.explore-panel-choices label').filter({hasText:'Home'}).getByRole('checkbox').check();await page.keyboard.press('Escape');
 await expect(home).toBeVisible();expect((await rect(home)).width).toBeCloseTo(narrow.width,0);
 await page.locator('.explore-panel-menu summary').click();await page.getByRole('button',{name:'Hide panels',exact:true}).click();await expect(floats(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Restore panels',exact:true}).click();await expect(floats(page)).toHaveCount(5);
 await page.getByRole('button',{name:'Stack at edge',exact:true}).click();await expect(home).toHaveClass(/explore-stacked/);
 await page.getByRole('button',{name:'Home story',exact:true}).click();await page.getByRole('button',{name:'Service flow',exact:true}).click();expect((await rect(home)).width).toBeCloseTo(narrow.width,0);
});
test('fullscreen is explicit and refusal keeps an exit-able in-page view',async({page,server})=>{
 const url=await build(server);await page.goto(url+'#d=doorbell&v=service-flow&m=step&s=quiet');
 expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await expect(page.locator('.explore-navigation')).toBeVisible();expect(await page.locator('.explore-navigation').evaluate(el=>document.fullscreenElement.contains(el))).toBe(true);
 await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Host policy'));});
 await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect(page.locator('.viewport-status')).toContainText('unavailable');
 await page.locator('.explore-panel-menu summary').click();await page.getByRole('button',{name:'Hide panels',exact:true}).focus();await page.keyboard.press('Escape');await expect(page.locator('.explore-panel-menu')).not.toHaveAttribute('open','');await expect(page.locator('.explore-panel-menu summary')).toBeFocused();await expect(page.locator('.section-viewport')).toHaveClass(/viewport-expanded/);
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
 const dock=await page.locator('.explore-player').boundingBox(),mode=await page.locator('.explore-player .playback-mode-rail').boundingBox();expect(dock.height-mode.height).toBeLessThan(190);expect(mode.y+mode.height).toBeLessThanOrEqual(transport.y);expect(caption.y+caption.height).toBeLessThanOrEqual(dock.y+dock.height);
 const margins=await board.evaluate(el=>{
  const svg=el.querySelector('.boardcanvas>svg');el.scrollLeft=0;el.scrollTop=0;const start=svg.getBoundingClientRect(),b=el.getBoundingClientRect();
  el.scrollLeft=el.scrollWidth;el.scrollTop=el.scrollHeight;const end=svg.getBoundingClientRect();
  return {left:start.left-b.left,top:start.top-b.top,right:b.left+el.clientWidth-end.right,bottom:b.top+el.clientHeight-end.bottom,w:el.clientWidth,h:el.clientHeight};
 });
 expect(margins.left).toBeGreaterThan(margins.w*.24);expect(margins.right,JSON.stringify(margins)).toBeGreaterThan(margins.w*.24);expect(margins.top).toBeGreaterThan(margins.h*.24);expect(margins.bottom).toBeGreaterThan(margins.h*.24);
});
