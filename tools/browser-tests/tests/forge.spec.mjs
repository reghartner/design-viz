import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
test.use({reducedMotion:'no-preference'});
test('copied production Forge resource imports, saves and reloads through only the simulated bridge',async({page,context,server})=>{
  const raw=JSON.parse(await readFile(path.join(repo,'src/starters/homemap-story.json'),'utf8')),diagram=raw.page.sections[0].diagram;
  diagram.autoplay=false;diagram.nodes.camera.link='https://example.com/hld';
  diagram.sectionLayout={confluence:[{panel:'home',x:0,y:0,w:8,h:16},{x:8,y:0,w:4,h:16},{controls:'steps',attachTo:'panel:home',x:0,y:16,w:8,h:6}]};
  async function open(page,configuring,config={}){
    await page.addInitScript(({configuring,config})=>{
      window.__calls=[];window.__bridge={callBridge:async(method,payload)=>{
        __calls.push({method,payload});
        if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config,macro:{isConfiguring:configuring}}};
        if(['submit','close','navigate'].includes(method))return true;
        throw Error('Unexpected Forge bridge call: '+method);
      }};
    },{configuring,config});
    await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();
  }
  await open(page,true);await page.locator('#spec-input').fill(JSON.stringify(raw,null,2));await page.locator('#validate').click();
  await expect(page.locator('.hmframe')).toBeVisible();await expect(page.locator('#save')).toBeEnabled();await expect(page.locator('.playback-status')).toHaveText('Paused');
  await page.locator('#save').click();await page.waitForFunction(()=>__calls.some(c=>c.method==='submit'));
  const config=await page.evaluate(()=>__calls.find(c=>c.method==='submit').payload.config);expect(JSON.parse(config.specJson)).toEqual(raw);
  await page.locator('#spec-input').fill('{');await page.locator('#validate').click();await expect(page.locator('#save')).toBeDisabled();await expect(page.locator('#docview')).toBeEmpty();
  await page.locator('#cancel').click();await page.waitForFunction(()=>__calls.some(c=>c.method==='close'));
  const published=await context.newPage();await open(published,false,config);
  await expect(published.locator('#configuration')).toBeHidden();await expect(published.locator('#spec-editor')).toHaveCount(0);
  await expect(published.locator('.hmframe')).toBeVisible();const grid=published.locator('.section-layout-grid');await expect(grid).toHaveAttribute('data-layout-target','confluence');
  await published.getByRole('button',{name:'Go to step 3 on Internet down',exact:true}).click();await expect(published.locator('.stepline')).toContainText('STEP 3/4');
  const caption=await published.locator('.stepline').innerText();await published.locator('[data-view-focus="flow"]').click();await expect(grid).toBeHidden();
  await published.locator('a[href="https://example.com/hld"]').click();await published.waitForFunction(()=>__calls.some(c=>c.method==='navigate'));
  expect(await published.evaluate(()=>__calls.find(c=>c.method==='navigate').payload)).toEqual({url:'https://example.com/hld',type:'new-tab'});
  await published.locator('[data-view-layout]').click();await expect(grid).toBeVisible();await expect(published.locator('.stepline')).toHaveText(caption,{useInnerText:true});await expect(published.locator('.termbar')).toHaveCount(1);
  await published.locator('.playback-button').click();await expect(published.locator('.playback-status')).toContainText('Playing');
  await published.locator('.playback-button').click();await expect(published.locator('.playback-status')).toHaveText('Paused');
});
