import {test,expect,paste,trackResources} from '../helpers/test.mjs';
import {editorSpec,source} from '../fixtures/editor-spec.mjs';
import {pathToFileURL} from 'node:url';

function library(tour){
  const spec=editorSpec();
  spec.page.canon={version:1,id:'delivery',kind:'canonical',owner:'group:default/home'};
  if(tour)spec.page.tour=tour;
  return {version:1,diagrams:[{id:'delivery',title:'Reviewed delivery',spec}]};
}
async function publish(page,data=library()){
  await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
}
async function fresh(page){
  await page.addInitScript(()=>{localStorage.removeItem('dv_tour_v1');document.cookie='dv_tour=;path=/;max-age=0';});
}
async function openReader(page){
  await page.locator('#welcome-library').click();
  await page.locator('.canon-library-card').first().click();
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();
}

test('launch-page Canon visit offers the tour once, replays, and leaves the draft untouched',async({page,server},info)=>{
  const data=library();await publish(page,data);await fresh(page);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await expect(page.locator('.dv-tour-replay,.dv-tour')).toHaveCount(0);
  await page.locator('#workspace-home').click();await openReader(page);
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  await info.attach('canon-first-visit-tour',{body:await page.screenshot(),contentType:'image/png'});
  await page.locator('.dv-tour-choice').nth(2).click();
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  await page.getByRole('button',{name:'Skip the tour',exact:true}).click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('#src')).toHaveValue(source);
  expect(await page.evaluate(()=>localStorage.getItem('dv_tour_v1'))).toBe('done');
  await page.goBack();await expect(page.locator('.dv-tour,.dv-tour-replay')).toHaveCount(0);
  await page.goForward();await expect(page.locator('#canon-reader .dv-tour-replay')).toBeVisible();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  await page.getByRole('button',{name:'Replay the tour',exact:true}).click();
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  await page.keyboard.press('Escape');await page.locator('#canon-reader-edit').click();
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  await expect(page.locator('.dv-tour,.dv-tour-replay')).toHaveCount(0);
  expect(await page.evaluate(()=>typeof window.dvStartTour)).toBe('undefined');
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(data.diagrams[0].spec,null,2));
  await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts'))))
    .toContainEqual(expect.objectContaining({text:source,baseline:source}));
  await page.locator('#workspace-home').click();await page.locator('#welcome-earlier-drafts>summary').click();
  await page.locator('#welcome-earlier-list').getByRole('button',{name:/^Browser contract ·/}).click();
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
  await expect(page.locator('.dv-tour,.dv-tour-replay')).toHaveCount(0);
});

test('leaving a running demo cancels tour work and an unfinished tour can open again',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(trackResources);
  const data=library({version:1,steps:[
    {id:'play',diagramState:{mode:'step'},target:{selector:'.step-transport',within:'section'},
      demo:{advance:3,intervalMs:400},copy:{heading:'Company playback',body:'Walk through the reviewed flow.'}},
    {id:'done',kind:'done',copy:{heading:'Ready'}}
  ]});
  delete data.diagrams[0].spec.page.blocks[0].diagram.layouts;
  delete data.diagrams[0].spec.page.blocks[0].diagram.defaultLayout;
  await publish(page,data);await fresh(page);await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-library').click();await expect(page.locator('.canon-library-card')).toBeVisible();
  const resources=()=>page.evaluate(()=>{const {fonts,...counts}=window.__resourceCounts();return counts;});
  await expect.poll(async()=>(await resources()).timers).toBe(0);
  await expect.poll(async()=>(await resources()).frames).toBe(0);
  const baseline=await resources();
  await page.locator('.canon-library-card').click();
  await expect(page.locator('.dv-tour-ui .dv-tour-heading')).toHaveText('Company playback');
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  await expect(page.locator('#canon-reader .schip[aria-current=true]:visible')).toHaveText('2');
  await page.evaluate(()=>{window.retiredTourStart=window.dvStartTour;});
  await page.goBack();await expect(page.locator('#welcome-library-screen')).toBeVisible();
  await expect(page.locator('.dv-tour,.dv-tour-replay')).toHaveCount(0);
  expect(await page.evaluate(()=>({start:typeof window.dvStartTour,retired:window.retiredTourStart(),done:localStorage.getItem('dv_tour_v1')})))
    .toEqual({start:'undefined',retired:false,done:null});
  await expect.poll(resources).toEqual(baseline);
  await page.waitForTimeout(800); // beyond the next demo callback owned by the retired tour
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  await page.goForward();await expect(page.locator('.dv-tour-ui .dv-tour-heading')).toHaveText('Company playback');
  await page.locator('.dv-tour-next').click();await expect(page.locator('.dv-tour-ui .dv-tour-heading')).toHaveText('Ready');
  await page.locator('.dv-tour-next').click();await expect(page.locator('.dv-tour')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('dv_tour_v1'))).toBe('done');
});

test('published direct Canon links honor force and suppress flags without offering a tour in the editor',async({page,server})=>{
  await publish(page);
  await page.goto(server.origin+'/workbench.html?diagram=delivery#tour=1');
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  await page.goto(server.origin+'/workbench.html?diagram=delivery#tour=0');
  await page.reload(); // the flag is read when the reader mounts
  await expect(page.locator('#canon-reader .dv-tour-replay')).toBeVisible();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  await page.locator('#canon-reader-edit').click();
  await expect(page.locator('.dv-tour,.dv-tour-replay')).toHaveCount(0);
});

test('the offline Canon example shares the complete default tour and its styling',async({page,server})=>{
  await page.goto(pathToFileURL(server.root+'/workbench.html').href+'#tour=1');
  await openReader(page);await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  expect(await page.locator('.dv-tour').evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
  await page.locator('.dv-tour-choice').nth(2).click();
  let finished=false;
  for(let i=0;i<25;i++){
    const next=page.locator('.dv-tour-next');await expect(next).toBeVisible();
    const done=await next.textContent()==='Done';await next.click();
    if(done){finished=true;break;}
  }
  expect(finished).toBe(true);await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();
});

test('Canon Explore fills the browser and retires its canvas before editing the story',async({page,server})=>{
  const data=library(),d=data.diagrams[0].spec.page.blocks[0].diagram;
  d.layouts.push({...structuredClone(d.layouts[0]),id:'explore',name:'Explore',presentation:'explore'});d.defaultLayout='explore';
  await publish(page,data);await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#workspace-home').click();await openReader(page);
  const size=page.viewportSize();await expect(page.locator('#canon-reader .viewer-diagram-canvas')).toBeVisible();
  expect(await page.locator('#canon-reader .explore-board').boundingBox()).toEqual({x:0,y:0,width:size.width,height:size.height});
  await page.getByRole('button',{name:'Back to page',exact:true}).click();await page.locator('#canon-reader-edit').click();
  await expect(page.locator('#workspace-canvas .explore-board')).toBeVisible();await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
});
