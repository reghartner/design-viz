import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function spec({hiddenStandardPanels=false}={}){
  const tiles=[{x:0,y:0,w:8,h:18},{controls:'steps',x:0,y:14,w:8,h:4,attachTo:'diagram'},
    {panel:'status',x:8,y:0,w:4,h:6},{panel:'queue',x:8,y:6,w:4,h:6}];
  const story=structuredClone(tiles);if(hiddenStandardPanels)for(const tile of story)if(tile.panel)tile.hidden=true;
  const basic={view:'step',autoplay:false,nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],
    edges:[{from:'a',to:'b'}],steps:[{id:'request',edge:'a->b',text:'Request'},{id:'response',edge:'a->b',text:'Response'}]};
  const rich={...structuredClone(basic),layouts:[
    {id:'story',name:'Business view',presentation:'standard',sectionLayout:{default:story}},
    {id:'engineering',name:'Engineering view',presentation:'explore',sectionLayout:{default:tiles}}],
    panels:[{id:'status',type:'state',title:'Device state',states:['Ready','Sent'],initial:{state:'Ready'}},
      {id:'queue',type:'state',title:'Delivery state',states:['Waiting','Done'],initial:{state:'Waiting'}}],
    steps:[{id:'start',edge:'a->b',text:'Shared start'},{id:'direct',edge:'a->b',text:'Send directly'},
      {id:'retry',edge:'a->b',text:'Retry delivery'},{id:'complete',edge:'a->b',text:'Shared completion',panels:{status:{state:'Sent'},queue:{state:'Done'}}}],
    paths:[{id:'normal',label:'Normal delivery',steps:['start','direct','complete']},
      {id:'retry-path',label:'Retry delivery',steps:['start','retry','complete']}]};
  return {page:{title:'A simple overview and a detailed flow',skin:'pastel',blocks:[{tabs:[
    {label:'Overview',sections:[{id:'overview',heading:'Overview only',diagram:basic}]},
    {label:'Details',sections:[{id:'details',heading:'Detailed flow',diagram:rich}]}]}]}};
}
async function build(server,source){
  const input=path.join(server.root,'tour-applicability.json'),output=path.join(server.root,'tour-applicability.html');
  await writeFile(input,JSON.stringify(source));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  return server.origin+'/tour-applicability.html';
}
const heading=page=>page.locator('.dv-tour-ui .dv-tour-heading');
const activeTab=page=>page.locator('.tabbtn[aria-selected="true"]');
const activeView=page=>page.locator('.tabpanel:not([hidden]) .diagram-view-choice button[aria-pressed="true"]');
const panel=(page,id)=>page.locator('[data-explore-panel="'+id+'"]');
function tourWarnings(page){
  const warnings=[];page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('tour step'))warnings.push(m.text());});return warnings;
}
async function walk(page,onLesson=async()=>{}){
  const lessons=[];
  for(let i=0;i<20;i++){
    await expect(page.locator('.dv-tour-ui')).toBeVisible();
    const title=await heading(page).textContent(),count=(await page.locator('.dv-tour-count').textContent()).split('/').map(Number);
    lessons.push({title,current:count[0],total:count[1]});await onLesson(title);
    const button=page.locator('.dv-tour-next'),done=(await button.textContent())==='Done';
    await button.click();if(done){await expect(page.locator('.dv-tour')).toBeHidden();return lessons;}
    await expect(heading(page)).not.toHaveText(title);
  }
  throw new Error('Tour never reached Done');
}
function expectContiguous(lessons){
  expect(lessons.map(x=>x.current)).toEqual(lessons.map((_,i)=>i+1));
  expect(lessons.map(x=>x.total)).toEqual(lessons.map(()=>lessons.length));
}
async function startBoth(page){await page.locator('.dv-tour-replay').click();await page.getByRole('button',{name:/Show me both/}).click();}

test('the built-in tour finds later-tab capabilities and numbers only the lessons it can show',async({page,server})=>{
  const warnings=tourWarnings(page),url=await build(server,spec());await page.goto(url);
  await expect(activeTab(page)).toHaveText('Overview');await startBoth(page);
  const detailTopics=['Choose your reading view','Flows can split','And they come back together',
    'The panels tell the story','Make room to explore','Bring a panel back'];
  const lessons=await walk(page,async title=>{
    if(detailTopics.includes(title))await expect(activeTab(page)).toHaveText('Details');
    if(title==='Make room to explore'){
      await expect(activeView(page)).toHaveText('Engineering view');
      await expect(page.locator('.explore-window:visible')).toHaveCount(2);
    }
  });
  expect(lessons.map(x=>x.title)).toEqual(expect.arrayContaining(detailTopics));expectContiguous(lessons);
  expect(warnings).toEqual([]);await expect(activeTab(page)).toHaveText('Overview');
  await page.getByRole('tab',{name:'Details',exact:true}).click();
  await expect(activeView(page)).toHaveText('Business view');
  await expect(page.locator('.path-chip[aria-pressed="true"]:visible')).toHaveText('Normal delivery');
});

test('a panel hidden in Standard is still taught using its available Explore view',async({page,server})=>{
  const warnings=tourWarnings(page),source=spec({hiddenStandardPanels:true});
  // Keep the rich section alone so this specifically tests view discovery.
  source.page.sections=source.page.blocks[0].tabs[1].sections;delete source.page.blocks;
  await page.goto(await build(server,source));
  await expect(activeView(page)).toHaveCount(0); // There are no tabs in this fixture.
  await expect(page.locator('.diagram-view-choice button[aria-pressed="true"]')).toHaveText('Business view');
  await expect(page.locator('.pwidget:visible')).toHaveCount(0);
  await startBoth(page);let sawPanels=false;
  const lessons=await walk(page,async title=>{
    if(title==='The panels tell the story'){
      sawPanels=true;await expect(page.locator('.diagram-view-choice button[aria-pressed="true"]')).toHaveText('Engineering view');
      await expect(page.locator('.pwidget:visible')).toHaveCount(2);
    }
  });
  expect(sawPanels).toBe(true);expectContiguous(lessons);expect(warnings).toEqual([]);
  await expect(page.locator('.diagram-view-choice button[aria-pressed="true"]')).toHaveText('Business view');
  await expect(page.locator('.pwidget:visible')).toHaveCount(0);
});

test('planning and completing the built-in tour preserve the reader view, path, tab and floating workspace',async({page,server})=>{
  const url=await build(server,spec());await page.goto(url+'#d=details&v=engineering&m=step&p=retry-path&s=retry');
  await expect(activeTab(page)).toHaveText('Details');await expect(activeView(page)).toHaveText('Engineering view');
  const status=panel(page,'status');
  await status.locator('.explore-window-grip').press('Shift+ArrowLeft');
  await status.locator('.explore-window-resize').press('Shift+ArrowLeft');
  await status.locator('.explore-window-resize').press('Shift+ArrowUp');
  await panel(page,'queue').getByRole('button',{name:'Hide Delivery state',exact:true}).click();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const geometry=()=>status.evaluate(el=>{
    const a=el.getBoundingClientRect(),b=el.closest('.explore-stage').getBoundingClientRect();
    return {x:a.x-b.x,y:a.y-b.y,width:a.width,height:a.height};
  });
  const before=await geometry(),zoom=await page.locator('.explore-zoom:visible').textContent(),hash=new URL(page.url()).hash;
  async function restored(){
    await expect(activeTab(page)).toHaveText('Details');await expect(activeView(page)).toHaveText('Engineering view');
    await expect(page.locator('.path-chip[aria-pressed="true"]:visible')).toHaveText('Retry delivery');
    await expect(page.locator('.schip[aria-current="true"]:visible')).toHaveText('2');
    await expect(page.locator('.termbar:visible')).toHaveAttribute('data-playback','paused');
    await expect(panel(page,'queue')).toBeHidden();await expect(page.locator('.explore-zoom:visible')).toHaveText(zoom);
    const after=await geometry();for(const key of Object.keys(before))expect(after[key],key+' restored').toBeCloseTo(before[key],0);
    expect(new URL(page.url()).hash).toBe(hash);
  }
  await startBoth(page);await expect(heading(page)).toHaveText('Choose your reading view');
  await page.locator('.dv-tour-exit').click();await expect(page.locator('.dv-tour')).toBeHidden();await restored();
  await startBoth(page);await walk(page);await restored();
});

test('a custom section target remains strict and retains its authored count and diagnostic',async({page,server})=>{
  const source=spec();source.page.tour={version:1,steps:[
    {id:'overview-panel',target:{selector:'.pwidget',within:'section'},diagramState:{section:'overview',mode:'step'},copy:{heading:'Must not use another section'}},
    {id:'details-panel',target:{selector:'.pwidget',within:'section'},diagramState:{section:'details',view:'engineering',mode:'step'},copy:{heading:'Explicit detail panel'}},
    {id:'done',kind:'done',copy:{heading:'Custom tour done'}}]};
  const warnings=tourWarnings(page);await page.goto((await build(server,source))+'#tour=1');
  await expect(heading(page)).toHaveText('Explicit detail panel');await expect(activeTab(page)).toHaveText('Details');
  await expect(page.locator('.dv-tour-count')).toHaveText('2 / 3');
  expect(warnings).toHaveLength(1);expect(warnings[0]).toContain('overview-panel');expect(warnings[0]).toContain('target not found');
  await page.locator('.dv-tour-next').click();await expect(heading(page)).toHaveText('Custom tour done');
  await expect(page.locator('.dv-tour-count')).toHaveText('3 / 3');await page.locator('.dv-tour-next').click();
  await expect(activeTab(page)).toHaveText('Overview');
});

test('the tour finds unfiltered branches and a later stop that reveals initially hidden panels',async({page,server})=>{
  const source=spec(),rich=source.page.blocks[0].tabs[1].sections[0].diagram;
  rich.layouts[0].steps=['start','complete'];
  rich.panels.forEach(panel=>{panel.visible=false;});
  rich.steps.find(step=>step.id==='complete').panelVisibility={status:true,queue:true};
  const warnings=tourWarnings(page);await page.goto(await build(server,source));await startBoth(page);
  const checked=[];
  const lessons=await walk(page,async title=>{
    if(title==='Flows can split'||title==='And they come back together'){
      checked.push(title);await expect(activeView(page)).toHaveText('Engineering view');
    }
    if(title==='The panels tell the story'){
      checked.push(title);await expect(page.locator('.pwidget:visible')).toHaveCount(2);
      await expect(page.locator('.termbar:visible .step-text')).toHaveText('Shared completion');
    }
  });
  expect(checked).toEqual(['Flows can split','And they come back together','The panels tell the story']);
  expectContiguous(lessons);expect(warnings).toEqual([]);
});
