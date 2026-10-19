import {test,expect,chooseNavigation} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

test.use({reducedMotion:'no-preference'});

// Instrument a real mounted renderer at the shared panel boundary. The probe
// owns actual Canvas, rAF, ResizeObserver and window-listener resources, so an
// empty/hidden DOM assertion alone cannot conceal a leaked controller.
const probe = `
window.panelProbe={renders:[],mounts:[],live:[],cleanups:[],ticks:{},events:{},observations:{},maxLive:0};
var probeRender=function(host,panel,state,skin,states,index,animate){
  var stats=window.panelProbe;
  stats.renders.push({id:panel.id,state:state.state,animate:animate});
  return {html:'<canvas aria-label="'+panel.title+'" data-state="'+state.state+'"></canvas>',mounted:function(){
    var canvas=host.querySelector('canvas'),width=host.getBoundingClientRect().width;
    canvas.width=Math.max(1,Math.round(width));canvas.height=40;
    canvas.getContext('2d').fillRect(0,0,canvas.width,40);
    stats.mounts.push({id:panel.id,width:width,state:state.state,animate:animate});stats.live.push(panel.id);
    stats.maxLive=Math.max(stats.maxLive,stats.live.length);
    var stopped=false,frame;
    function tick(){if(stopped)return;stats.ticks[panel.id]=(stats.ticks[panel.id]||0)+1;frame=requestAnimationFrame(tick);}
    function event(){stats.events[panel.id]=(stats.events[panel.id]||0)+1;}
    var observer=new ResizeObserver(function(){stats.observations[panel.id]=(stats.observations[panel.id]||0)+1;});
    observer.observe(canvas);window.addEventListener('panel-probe',event);frame=requestAnimationFrame(tick);
    host._panelMotionCleanup=function(){stopped=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('panel-probe',event);stats.live.splice(stats.live.indexOf(panel.id),1);stats.cleanups.push(panel.id);};
  }};
};
PanelRegistry.get('state').render=probeRender;
PanelRegistry.get('phone').render=probeRender;
var originalRenderPage=renderPage;
renderPage=function(){var ctl=originalRenderPage.apply(null,arguments);window.lazyCtl=ctl;return ctl;};
`;

function section(id){return {id,heading:id,diagram:{view:'step',autoplay:false,
  nodes:{n:{title:'Node'}},rows:[['n']],
  panels:[{id,type:'state',title:id,states:['Start','Finish'],initial:{state:'Start'}}],
  steps:[{id:'start',nodes:['n'],text:'Start',panels:{[id]:{state:'Start'}}},
    {id:'finish',nodes:['n'],text:'Finish',panels:{[id]:{state:'Finish'}}}]
}};}
function fixture(){return {page:{title:'Lazy panels',blocks:[{tabs:[
  {label:'One',sections:[section('alpha')]},
  {label:'Two',sections:[section('beta'),section('gamma')],defaultView:'beta-view',views:[
    {id:'beta-view',name:'Beta view',presentation:'standard',sections:['beta']},
    {id:'gamma-view',name:'Gamma view',presentation:'standard',sections:['gamma']}
  ]}
]}]}};}
async function open(page,server,raw=fixture()){
  const input=path.join(server.root,'lazy-panels.json'),output=path.join(server.root,'lazy-panels.html');
  await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  const html=await readFile(output,'utf8');
  expect(html).toContain('/* boot.flowview.js');
  await writeFile(output,html.replace('/* boot.flowview.js',probe+'\n/* boot.flowview.js'));
  await page.goto(server.origin+'/lazy-panels.html');
  await expect(page.locator('#section-alpha .pbody > :first-child')).toBeAttached();
}
const canvas=(page,id)=>page.locator('#section-'+id+' .pbody canvas');
const tab=(page,name)=>chooseNavigation(page.locator('.reader-navigation'),'Tab',name);
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function live(page,ids){await expect.poll(()=>page.evaluate(()=>panelProbe.live.slice().sort())).toEqual(ids.slice().sort());}

test('tab and View activation mounts only visible panels and restores folded state without replay',async({page,server})=>{
  await open(page,server);
  await live(page,['alpha']);
  await expect(page.locator('.pwidget')).toHaveCount(3);
  await expect(canvas(page,'beta')).toHaveCount(0);await expect(canvas(page,'gamma')).toHaveCount(0);
  expect(await page.evaluate(()=>panelProbe.renders.filter(r=>r.id!=='alpha'))).toEqual([]);
  // Updating a hidden step and selecting its View must record state only.
  await page.evaluate(()=>{
    const beta=lazyCtl.sections.find(r=>r.reference==='beta');
    beta.stepper.jump(1);lazyCtl.views.select(beta,'gamma-view');lazyCtl.views.select(beta,'beta-view');
  });
  await live(page,['alpha']);
  expect(await page.evaluate(()=>panelProbe.renders.every(r=>r.id==='alpha'))).toBe(true);
  await canvas(page,'alpha').evaluate(el=>window.departedCanvas=el);
  await tab(page,'Two');await live(page,['beta']);
  await expect(canvas(page,'alpha')).toHaveCount(0);await expect(canvas(page,'beta')).toHaveAttribute('data-state','Finish');
  expect(await page.evaluate(()=>({connected:departedCanvas.isConnected,width:departedCanvas.width,height:departedCanvas.height}))).toEqual({connected:false,width:0,height:0});
  const retired=await page.evaluate(()=>({ticks:panelProbe.ticks.alpha,events:panelProbe.events.alpha||0,observations:panelProbe.observations.alpha}));
  await page.evaluate(()=>window.dispatchEvent(new Event('panel-probe')));await frames(page);
  expect(await page.evaluate(()=>({ticks:panelProbe.ticks.alpha,events:panelProbe.events.alpha||0,observations:panelProbe.observations.alpha}))).toEqual(retired);
  await chooseNavigation(page.locator('.reader-navigation'),'View','Gamma view');await live(page,['gamma']);
  await expect(canvas(page,'beta')).toHaveCount(0);
  await chooseNavigation(page.locator('.reader-navigation'),'View','Beta view');await live(page,['beta']);
  await expect(canvas(page,'beta')).toHaveAttribute('data-state','Finish');
  // Leave while playing: hide settles first, but may not remount after teardown.
  await page.evaluate(()=>{const s=lazyCtl.sections.find(r=>r.reference==='beta').stepper;s.jump(0);s.toggleAuto();});
  await tab(page,'One');await live(page,['alpha']);await frames(page);
  await expect(canvas(page,'beta')).toHaveCount(0);
  await tab(page,'Two');await live(page,['beta']);
  expect(await page.evaluate(()=>lazyCtl.sections.find(r=>r.reference==='beta').stepper.playing())).toBe(false);
  expect(await page.evaluate(()=>panelProbe.mounts.every(m=>m.width>0))).toBe(true);
  expect(await page.evaluate(()=>panelProbe.mounts.at(-1).animate)).toBe(false);
  expect(await page.evaluate(()=>panelProbe.maxLive)).toBe(1);
  await page.evaluate(()=>lazyCtl.destroy());await live(page,[]);
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await live(page,[]);
  await expect(page.locator('.pbody canvas')).toHaveCount(0);
});

test('printing materializes static panels and restores the lazy screen lifecycle',async({page,server})=>{
  const raw=fixture();
  // Phone is one of the existing printable panel types; keep that policy.
  raw.page.blocks[0].tabs.forEach(t=>t.sections.forEach(s=>s.diagram.panels[0].type='phone'));
  await open(page,server,raw);await live(page,['alpha']);
  await page.emulateMedia({media:'print'});
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.pbody canvas')).toHaveCount(3);await live(page,[]);
  await expect(canvas(page,'beta')).toBeVisible();
  const stopped=await page.evaluate(()=>JSON.stringify(panelProbe.ticks));await frames(page);
  expect(await page.evaluate(()=>JSON.stringify(panelProbe.ticks))).toBe(stopped);
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({media:'screen'});await live(page,['alpha']);
  await expect(canvas(page,'beta')).toHaveCount(0);await expect(canvas(page,'gamma')).toHaveCount(0);
});

test('ordinary non-tabbed documents eagerly render every panel',async({page,server})=>{
  await open(page,server,{page:{title:'Ordinary document',sections:[section('alpha'),section('beta')]}});
  await live(page,['alpha','beta']);await expect(canvas(page,'beta')).toHaveAttribute('data-state','Start');
  await page.locator('#section-beta .schip').nth(1).click();
  await expect(canvas(page,'beta')).toHaveAttribute('data-state','Finish');
});

test('direct page Views defer excluded sections until selected',async({page,server})=>{
  const raw=fixture(),second=raw.page.blocks[0].tabs[1];
  await open(page,server,{page:{title:'Direct Views',sections:[section('alpha'),section('beta')],defaultView:'alpha-view',views:[
    {id:'alpha-view',name:'Alpha view',presentation:'standard',sections:['alpha']},second.views[0]
  ]}});
  await live(page,['alpha']);expect(await page.evaluate(()=>panelProbe.renders.every(r=>r.id==='alpha'))).toBe(true);
  await chooseNavigation(page.locator('.reader-navigation'),'View','Beta view');await live(page,['beta']);
  await expect(canvas(page,'alpha')).toHaveCount(0);
});

test('returning to a Screen panel restores its settled CSS scene without replay',async({page,server})=>{
  const raw=fixture(),diagram=raw.page.blocks[0].tabs[0].sections[0].diagram;
  diagram.panels=[{id:'alpha',type:'screen',title:'Entry',scene:'person-through-door',initial:{mode:'active'}}];
  diagram.steps.forEach(step=>{step.panels={alpha:{mode:'active'}};});
  await open(page,server,raw);
  await expect(page.locator('#section-alpha .entry-person')).toHaveCount(1);
  await tab(page,'Two');await expect(page.locator('#section-alpha .pbody')).toBeEmpty();
  await tab(page,'One');await expect(page.locator('#section-alpha .entry-person')).toHaveCount(1);
  const animations=await page.locator('#section-alpha .pbody').evaluate(el=>el.getAnimations({subtree:true})
    .filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.playState));
  expect(animations.length).toBeGreaterThan(0);expect(animations.every(state=>state==='finished')).toBe(true);
});
