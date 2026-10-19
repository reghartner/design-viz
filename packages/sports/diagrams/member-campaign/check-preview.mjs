import {chromium} from '../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const url='http://127.0.0.1:8879/.local/member-campaign/preview.html?theme=islanders#embed=member-campaign&sk=islanders';
const spec=JSON.parse(await readFile(path.join(repo,'diagrams/friends/member-campaign/member-campaign.spec.json'),'utf8'));
const d=spec.page.sections[0].diagram;
// story.source.json retains the geometry imported from Chuck's saved export.
const saved=JSON.parse(await readFile(new URL('./story.source.json',import.meta.url),'utf8')).page.sections[0].diagram;
assert.deepEqual(d.floats,saved.floats);assert.deepEqual(d.edges,saved.edges);assert.deepEqual(d.graphFrame,saved.graphFrame);
assert.deepEqual(d.sectionLayout,saved.sectionLayout);
const browser=await chromium.launch();
try{
  for(const width of [1280,1440]){
    const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    const fan=page.locator('[data-dv-panel="0"]'),marketing=page.locator('[data-dv-panel="1"]');
    await fan.locator('.appscreen-current').waitFor();
    const skip=page.getByRole('button',{name:'Skip tour',exact:true});if(await skip.isVisible())await skip.click();
    assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
    const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.appscreen-previous'));};
    const state=async(f,m)=>{
      await settle();
      assert.equal(await fan.locator('.appscreen-current').getAttribute('data-screen-id'),f);
      assert.equal(await marketing.locator('.appscreen-current').getAttribute('data-screen-id'),m);
      assert.equal(await fan.locator('.appscreen-clock').innerText(),'9:41');
      assert.ok(await fan.locator('.appscreen-statusbar').isVisible());
      assert.equal(await fan.locator('.appscreen-glyphs svg').count(),2);
      assert.equal(await marketing.locator('.appscreen-phone').count(),0);
    };
    const snap=async(name)=>{await settle();await page.waitForTimeout(700);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(repo,'.local/member-campaign/'+name+'-'+width+'.png'),fullPage:true});};
    const next=page.getByRole('button',{name:'Next step',exact:true});
    await state('email','email');await snap('native-email');
    await next.click();await state('member','content');
    await next.click();await state('member-linked','content');await snap('native-contentful');
    await fan.screenshot({path:path.join(repo,'.local/member-campaign/phone-statusbar-'+width+'.png')});
    await next.click();await state('ticketing','content');
    await next.click();await state('confirmation','journey');await snap('native-journey');
    await page.getByRole('button',{name:'Previous step',exact:true}).click();await state('ticketing','content');
    await page.getByRole('button',{name:'Needs sign-in',exact:true}).click();await state('email','email');
    await next.click();await state('signin','content');await next.click();await state('member','content');await next.click();await state('ticketing','content');
    await page.getByRole('button',{name:'Offer has ended',exact:true}).click();await state('email','email');
    await next.click();await state('expired','ended');await next.click();await state('expired-linked','ended');await snap('native-expired');
    await next.click();await state('general','ended');
    await page.getByRole('button',{name:'Recognized member',exact:true}).click();await state('email','email');
    const body=await page.locator('body').innerText();assert.ok(!/â†|â€™|â€œ|ï¿½|\uFFFD/.test(body));
    assert.equal(await page.locator('table').count(),0);
    const svgText=(await page.locator('svg').allTextContents()).join(' ');
    for(const name of ['Salesforce','Contentful','Member site','Ticketmaster'])assert.ok(svgText.includes(name));
    assert.ok(await next.isVisible());assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,phoneStatusBar:true,fanScreens:9,marketingScreens:4,paths:3,backwardRestore:true,savedLayoutPreserved:true,errors}));
    await page.close();
  }
}finally{await browser.close();}
