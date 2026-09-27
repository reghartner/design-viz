import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

// Keep this fixture small enough to exercise the controls themselves instead
// of depending on a starter's story, panel types, or default tour wording.
const spot=(id,selector,diagramState={},extra={})=>({id,target:{selector,within:'section'},
  diagramState:{mode:'step',...diagramState},copy:{heading:id,body:'Try this control.'},...extra});
const done={id:'finished',kind:'done',copy:{heading:'Finished',body:'Return to the diagram.'}};
async function build(server,steps,{explore=true,exploreId="engineering"}={}){
  const tiles=[{x:0,y:0,w:8,h:18},{controls:'steps',x:0,y:14,w:8,h:4,attachTo:'diagram'},
    {panel:'status',x:8,y:0,w:4,h:6},{panel:'queue',x:8,y:6,w:4,h:6}];
  const layouts=[{id:'business',name:'Business view',presentation:'standard',sectionLayout:{default:tiles}}];
  if(explore)layouts.push({id:exploreId,name:'Engineering view',presentation:'explore',sectionLayout:{default:tiles}},
    {id:'other-engineering',name:'Other engineering view',presentation:'explore',sectionLayout:{default:tiles}});
  const spec={page:{title:'Tour controls',skin:'pastel',tour:{version:1,steps:[...steps,done]},sections:[{
    id:'flow',heading:'One service story',diagram:{view:'step',autoplay:false,nodes:{a:{title:'Camera'},b:{title:'Service'}},
      rows:[['a','b']],edges:[{from:'a',to:'b'}],layouts,
      panels:[{id:'status',type:'state',title:'Device state',states:['Ready','Uploading','Done'],initial:{state:'Ready'}},
        {id:'queue',type:'state',title:'Delivery state',states:['Waiting','Queued','Sent'],initial:{state:'Waiting'}}],
      steps:[{id:'ready',edge:'a->b',text:'First stop',panels:{status:{state:'Ready'}}},
        {id:'upload',edge:'a->b',text:'Second stop',panels:{status:{state:'Uploading'},queue:{state:'Queued'}}},
        {id:'complete',edge:'a->b',text:'Third stop',panels:{status:{state:'Done'},queue:{state:'Sent'}}}]}}]}};
  const input=path.join(server.root,'tour-explore.json'),output=path.join(server.root,'tour-explore.html');
  await writeFile(input,JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  return server.origin+'/tour-explore.html';
}
const heading=page=>page.locator('.dv-tour-ui .dv-tour-heading');
const selectedStep=page=>page.locator('.schip[aria-current="true"]:visible');
const panel=(page,id)=>page.locator('[data-explore-panel="'+id+'"]');
const selectedView=page=>page.locator('.diagram-view-choice button[aria-pressed="true"]');
const panelRect=async(page,id)=>{
  const rect=await panel(page,id).boundingBox(),stage=await page.locator('.explore-stage').boundingBox();
  return {...rect,x:rect.x-stage.x,y:rect.y-stage.y};
};

test('tour selects named presentations, spotlights a visible panel, and honors an explicit view',async({page,server})=>{
  const url=await build(server,[
    spot('Standard panels','.panelcol, .pwidget',{presentation:'standard'}),
    spot('Explore panels','.panelcol, .pwidget',{presentation:'explore'}),
    spot('Explicit view wins','.pwidget',{presentation:'explore',view:'business'})]);
  await page.goto(url+'#tour=1');
  await expect(heading(page)).toHaveText('Standard panels');
  await expect(selectedView(page)).toHaveText('Business view');
  await expect(page.locator('.panelcol')).toBeHidden();
  // A stale sidebar selector must not win over the visible moved widget.
  await expect.poll(()=>page.evaluate(()=>{
    const ring=document.querySelector('.dv-tour-ring')?.getBoundingClientRect();
    const card=[...document.querySelectorAll('.pwidget')].find(e=>e.getClientRects().length)?.getBoundingClientRect();
    return !!ring&&!!card&&ring.left<=card.left&&ring.right>=card.right&&ring.top<=card.top&&ring.bottom>=card.bottom;
  })).toBe(true);
  await page.locator('.dv-tour-next').click();
  await expect(heading(page)).toHaveText('Explore panels');
  await expect(selectedView(page)).toHaveText('Engineering view');
  await expect(page.locator('.explore-stage')).toBeVisible();
  await expect(page.locator('.dv-tour-ring')).toBeVisible();
  await page.locator('.dv-tour-next').click();
  await expect(heading(page)).toHaveText('Explicit view wins');
  await expect(selectedView(page)).toHaveText('Business view');
  await expect(page.locator('.explore-stage')).toBeHidden();
});

test('an unavailable presentation skips its topic instead of teaching the wrong view',async({page,server})=>{
  const warnings=[];page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  const url=await build(server,[spot('No Explore here','.pwidget',{presentation:'explore'}),
    spot('Available Standard','.pwidget',{presentation:'standard'})],{explore:false});
  await page.goto(url+'#tour=1');
  await expect(heading(page)).toHaveText('Available Standard');
  await expect(selectedView(page)).toHaveText('Business view');
  expect(warnings.some(w=>w.includes('No Explore here')&&w.includes('did not resolve'))).toBe(true);
});

test('Replay example returns to its authored stop and runs the demonstration again',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const url=await build(server,[spot('Watch the delivery','.step-transport',
    {presentation:'explore',step:'ready'},{demo:{advance:2,intervalMs:700}})]);
  await page.goto(url+'#tour=1');
  await expect(heading(page)).toHaveText('Watch the delivery');
  await expect(selectedStep(page)).toHaveText('3');
  await page.getByRole('button',{name:'Replay example',exact:true}).click();
  await expect(selectedStep(page)).toHaveText('1');
  await expect(selectedStep(page)).toHaveText('3');
  await expect(heading(page)).toHaveText('Watch the delivery');
});

test('Try the controls gives keyboard arrows to the highlighted panel grip',async({page,server})=>{
  const url=await build(server,[spot('Move this panel','[data-explore-panel="status"]',{presentation:'explore'})]);
  await page.goto(url+'#d=flow&v=engineering&m=step&s=ready');
  const grip=panel(page,'status').locator('.explore-window-grip');
  await grip.focus();await grip.press('Shift+ArrowLeft');await grip.press('Shift+ArrowLeft');
  await page.locator('.dv-tour-replay').click();
  await expect(heading(page)).toHaveText('Move this panel');
  await page.getByRole('button',{name:'Try the controls',exact:true}).click();
  await expect(grip).toBeFocused();
  const before=await panel(page,'status').boundingBox();
  await expect(page.locator('.dv-tour-ring')).toBeVisible();
  const ringBefore=await page.locator('.dv-tour-ring').boundingBox();
  const offset={x:ringBefore.x-before.x,y:ringBefore.y-before.y};
  await page.keyboard.press('ArrowRight');
  await expect.poll(async()=>(await panel(page,'status').boundingBox()).x).toBeGreaterThan(before.x);
  // The spotlight must travel with the control while it moves, not only
  // after a resize or a later page click.
  await expect.poll(async()=>{
    const frame=await panel(page,'status').boundingBox(),ring=await page.locator('.dv-tour-ring').boundingBox();
    return Math.abs(ring.x-frame.x-offset.x);
  }).toBeLessThan(1);
  const handle=await grip.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
  await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-30,handle.y+handle.height/2+30,{steps:4});
  await expect.poll(async()=>{
    const frame=await panel(page,'status').boundingBox(),ring=await page.locator('.dv-tour-ring').boundingBox();
    return Math.abs(ring.x-frame.x-offset.x)+Math.abs(ring.y-frame.y-offset.y);
  }).toBeLessThan(1);
  await page.mouse.up();
  await expect(heading(page)).toHaveText('Move this panel');
  await expect(selectedStep(page)).toHaveText('1');
});

test('Escape restores paused playback, the selected stop, panel geometry and visibility, and zoom',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const url=await build(server,[spot('Try the workspace','.section-viewport',{presentation:'explore',step:'ready'})]);
  await page.goto(url+'#d=flow&v=engineering&m=step&s=upload');
  const status=panel(page,'status'),queue=panel(page,'queue');
  const grip=status.locator('.explore-window-grip'),resize=status.locator('.explore-window-resize');
  await grip.press('Shift+ArrowLeft');await grip.press('Shift+ArrowLeft');
  await resize.press('Shift+ArrowLeft');await resize.press('Shift+ArrowUp');
  await queue.getByRole('button',{name:'Hide Delivery state',exact:true}).click();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const before=await panelRect(page,'status'),zoom=await page.locator('.explore-zoom').textContent(),hash=new URL(page.url()).hash;
  await expect(page.locator('.termbar')).toHaveAttribute('data-playback','paused');
  await page.locator('.dv-tour-replay').click();
  await expect(heading(page)).toHaveText('Try the workspace');
  await expect(selectedStep(page)).toHaveText('1');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await grip.press('Shift+ArrowLeft');await resize.press('Shift+ArrowDown');
  await page.locator('.explore-panel-menu summary').click();
  await page.locator('.explore-panel-choices label').filter({hasText:'Delivery state'}).getByRole('checkbox').check();
  await page.locator('.explore-panel-menu summary').click();
  await expect(queue).toBeVisible();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.termbar')).toHaveAttribute('data-playback','playing');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.termbar')).toHaveAttribute('data-playback','paused');
  await expect(selectedStep(page)).toHaveText('2');
  await expect(queue).toBeHidden();
  await expect(page.locator('.explore-zoom')).toHaveText(zoom);
  const after=await panelRect(page,'status');
  for(const key of ['x','y','width','height'])expect(after[key],key+' restored').toBeCloseTo(before[key],0);
  expect(new URL(page.url()).hash).toBe(hash);
});

test('starting playback during a tour cannot leave an originally paused stop playing',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const url=await build(server,[spot('Try playback','.step-transport',{presentation:'explore',step:'ready'})]);
  await page.goto(url+'#d=flow&v=engineering&m=step&s=ready');
  await expect(page.locator('.termbar')).toHaveAttribute('data-playback','paused');
  await page.locator('.dv-tour-replay').click();
  await expect(heading(page)).toHaveText('Try playback');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.termbar')).toHaveAttribute('data-playback','playing');
  // The stop has not changed: restoration must pause explicitly, rather
  // than depending on a jump to a different stop to stop the timer.
  await expect(selectedStep(page)).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.termbar')).toHaveAttribute('data-playback','paused');
  await expect(selectedStep(page)).toHaveText('1');
});

test('a real Expand keeps the tour in the fullscreen surface and leaving the tour restores the page',async({page,server})=>{
  const url=await build(server,[spot('Expand this diagram','.viewport-actions',{presentation:'explore'})]);
  await page.goto(url+'#tour=1');
  await expect(heading(page)).toHaveText('Expand this diagram');
  await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  expect(await page.evaluate(()=>document.fullscreenElement.contains(document.querySelector('.dv-tour')))).toBe(true);
  await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  expect(await page.locator('.dv-tour').evaluate(el=>el.parentNode===document.body)).toBe(true);
  await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  // A real click inside fullscreen proves the narration remains usable.
  await page.locator('.dv-tour-exit').click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await expect(selectedView(page)).toHaveText('Business view');
  await expect(page.getByRole('button',{name:'Expand diagram view',exact:true})).toBeVisible();
});

test('leaving a tour restores a section that was already in real fullscreen',async({page,server})=>{
  const url=await build(server,[spot('Try expanding',
    '[aria-label="Expand diagram view"], [aria-label="Exit expanded diagram view"]',{presentation:'explore'})]);
  await page.goto(url+'#d=flow&v=engineering&m=step&s=ready');
  await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  // The page-level replay button is outside the fullscreen section. The
  // public start hook exercises replay without first leaving fullscreen.
  await page.evaluate(()=>window.dvStartTour());
  await expect(heading(page)).toHaveText('Try expanding');
  await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  // A real gesture permits the restoration request under browser policy.
  await page.locator('.dv-tour-exit').click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===document.querySelector('.section-viewport'))).toBe(true);
  await expect(selectedView(page)).toHaveText('Engineering view');
  await expect(page.getByRole('button',{name:'Exit expanded diagram view',exact:true})).toBeVisible();
});

test('restoring an in-page expansion does not upgrade it to browser fullscreen',async({page,server})=>{
  const url=await build(server,[spot('Try expanding',
    '[aria-label="Expand diagram view"], [aria-label="Exit expanded diagram view"]',{presentation:'explore'})]);
  await page.goto(url+'#d=flow&v=engineering&m=step&s=ready');
  await page.evaluate(()=>{
    window.__fullscreenRequests=0;
    Element.prototype.requestFullscreen=function(){
      window.__fullscreenRequests++;
      return Promise.reject(new Error('Embedding host does not allow fullscreen'));
    };
  });
  await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();
  await expect(page.locator('.viewport-status')).toContainText('unavailable');
  await expect(page.locator('.section-viewport')).toHaveClass(/viewport-expanded/);
  await page.evaluate(()=>window.dvStartTour());
  await expect(heading(page)).toHaveText('Try expanding');
  await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();
  await expect(page.locator('.section-viewport')).not.toHaveClass(/viewport-expanded/);
  await page.locator('.dv-tour-exit').click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.section-viewport')).toHaveClass(/viewport-expanded/);
  expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  expect(await page.evaluate(()=>window.__fullscreenRequests)).toBe(1);
  await expect(page.getByRole('button',{name:'Exit expanded diagram view',exact:true})).toBeVisible();
});

test('the default tour keeps the Explore player and highlighted panel on screen after recentering',async({page,server})=>{
  await page.setViewportSize({width:1500,height:1000});
  const spec=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
  spec.page.sections[0].diagram.autoplay=false;
  const input=path.join(server.root,'tour-explore-named.json'),output=path.join(server.root,'tour-explore-named.html');
  await writeFile(input,JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/tour-explore-named.html#tour=1');
  await page.locator('.dv-tour-choice').nth(2).click();
  for(let i=0;i<15;i++){
    const previous=await heading(page).textContent();
    if(previous==='Make room to explore')break;
    await page.locator('.dv-tour-next').click();
    await expect(heading(page)).not.toHaveText(previous);
  }
  await expect(heading(page)).toHaveText('Make room to explore');
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  // Tour scrolls the panel into view; the stage must refit against that
  // new position so its pinned transport does not disappear below it.
  await expect.poll(()=>page.locator('.explore-player').evaluate(el=>{
    const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;
  })).toBe(true);
  await expect.poll(()=>page.locator('.explore-window:visible').first().evaluate(el=>{
    const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;
  })).toBe(true);
  await expect.poll(()=>page.locator('.dv-tour-note').evaluateAll(notes=>notes.every(el=>{
    const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;
  }))).toBe(true);
});


test('tour restoration preserves unvisited views with prototype-name IDs',async({page,server})=>{
  const url=await build(server,[spot('Controls','.step-transport')],{exploreId:'constructor'});
  await page.goto(url+'#tour=1');
  await expect(heading(page)).toHaveText('Controls');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Engineering view',exact:true}).click();
  await expect(panel(page,'status')).toBeVisible();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect(page.locator('.explore-zoom')).not.toHaveText('');
});
