import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'examples/app-screens/phone-dates.spec.json'),'utf8'),raw=JSON.parse(source);
const diagram=value=>value.page.sections[0].diagram;
const panels=[['appscreens','screens','.appscreen-date'],['phone','phone','.phonedate'],['deviceapp','device','.da-date']];
const panel=(root,type)=>root.locator('.pt-'+type);
async function step(root,index){await root.locator('.schip[data-step-source="'+index+'"]').first().click();}
async function dates(root,text){
  for(const [type,,selector] of panels){
    const date=panel(root,type).locator(selector);
    if(!text){await expect(date).toHaveCount(0);continue;}
    await expect(date).toHaveText(text);await expect(date).toBeVisible();
    expect(await date.evaluate(el=>{
      const b=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
      return b.width>0 && b.height>0 && b.x>=p.x && b.right<=p.right+1 && el.scrollWidth<=el.clientWidth+1;
    }),'Date fits inside its status bar').toBe(true);
  }
  const header=panel(root,'appscreens').locator('.appscreen-statusbar');
  await expect(header.locator('.appscreen-clock')).toHaveText('9:41');
  if(text)expect(await header.evaluate(el=>{
    const clock=el.querySelector('.appscreen-clock').getBoundingClientRect(),date=el.querySelector('.appscreen-date').getBoundingClientRect();
    return Math.abs(clock.y+clock.height/2-date.y-date.height/2)<1 && clock.right<=date.x;
  }),'Time and date share one header line').toBe(true);
}
async function playback(root){
  for(const [index,text] of [[0,'Thu, Sep 24'],[1,'Fri, Sep 25'],[2,''],[3,'Sat, Sep 26'],[0,'Thu, Sep 24']]){
    await step(root,index);await dates(root,text);
    await expect(panel(root,'deviceapp').locator('.da-phone')).toHaveAttribute('data-da-screen',index===1||index===2?'app':'home');
    const image=panel(root,'appscreens').locator('.appscreen-current');
    await expect(image).toHaveAttribute('data-screen-id','home');
    await expect.poll(()=>image.evaluate(el=>el.complete && el.naturalWidth>0)).toBe(true);
  }
}
async function inspectStep(page,index){await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+index+'"]').click();await page.locator('#editor-tab-inspect').click();}

test('dates fit all three status bars and survive seeks, narrow layouts and native skins',async({page,server},testInfo)=>{
  await writeFile(path.join(server.root,'dates.json'),source);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'dates.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'dates.html')]);
  await page.goto(server.origin+'/dates.html');const root=page.locator('.docview');
  for(const width of [1300,650]){
    await page.setViewportSize({width,height:1200});await playback(root);
    await page.screenshot({path:testInfo.outputPath('dates-'+width+'.png'),fullPage:true});
  }
  await page.emulateMedia({media:'print'});await dates(root,'Thu, Sep 24');await page.emulateMedia({media:'screen'});
  await writeFile(path.join(server.root,'dates-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'dates-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./dates-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/dates-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.setViewportSize({width:1300,height:1200});
  for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
    await page.evaluate(({raw,skin})=>{window.viewer?.destroy();window.viewer=mount(document.querySelector('#host'),raw,{skin});},{raw,skin});
    await playback(page.locator('#host'));
  }
  await page.evaluate(()=>viewer.destroy());await expect(page.locator('#host')).toBeEmpty();
});

test('starting and step date edits preserve other state with exact Undo/Redo',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const root=page.locator('#docview'),guide=page.locator('#guide'),src=page.locator('#src');
  for(const [type,id,selector] of panels){
    await step(root,0);await panel(root,type).locator('.ptitle').click();
    const original=await src.inputValue(),date=guide.getByLabel('Starting date',{exact:true});
    await date.fill('Wed, Sep 23');await date.press('Tab');
    await expect(panel(root,type).locator(selector)).toHaveText('Wed, Sep 23');
    const edited=await src.inputValue(),expected=diagram(JSON.parse(original)).panels.find(p=>p.id===id);
    expected.initial.date='Wed, Sep 23';
    expect(diagram(JSON.parse(edited)).panels.find(p=>p.id===id)).toEqual(expected);
    await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
    await page.locator('#redo-builder').click();await expect(src).toHaveValue(edited);
    if(type==='appscreens'){
      await panel(root,type).locator('.ptitle').click();
      const time=guide.getByLabel('Starting time',{exact:true});await time.fill('10:05');await time.press('Tab');
      await expect(panel(root,type).locator('.appscreen-clock')).toHaveText('10:05');
      await page.locator('#undo-builder').click();await expect(src).toHaveValue(edited);
    }
    await panel(root,type).locator('.ptitle').click();await date.fill('');await date.press('Tab');
    await expect(panel(root,type).locator(selector)).toHaveCount(0);
    await page.locator('#undo-builder').click();await expect(src).toHaveValue(edited);
    await inspectStep(page,1);
    let input;
    if(type==='appscreens')input=guide.getByLabel('Date · App screens',{exact:true});
    else{
      const patch=guide.locator('.patchedit').filter({has:page.locator(':scope > summary').filter({hasText:new RegExp('^'+id+' ·')})});
      if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
      input=patch.getByLabel('date',{exact:true});
    }
    const before=await src.inputValue();await input.fill('Sun, Sep 27');await input.press('Tab');
    await expect(panel(root,type).locator(selector)).toHaveText('Sun, Sep 27');
    const changed=await src.inputValue(),expectedPatch=diagram(JSON.parse(before)).steps[1].panels[id];
    expectedPatch.date='Sun, Sep 27';expect(diagram(JSON.parse(changed)).steps[1].panels[id]).toEqual(expectedPatch);
    await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
    await page.locator('#redo-builder').click();await expect(src).toHaveValue(changed);
    if(type==='appscreens'){
      await inspectStep(page,1);
      const time=guide.getByLabel('Time · App screens',{exact:true});await time.fill('10:30');await time.press('Tab');
      await expect(panel(root,type).locator('.appscreen-clock')).toHaveText('10:30');
      await page.locator('#undo-builder').click();await expect(src).toHaveValue(changed);await inspectStep(page,1);
      await guide.getByRole('button',{name:'Hide date',exact:true}).click();await expect(panel(root,type).locator(selector)).toHaveCount(0);
      await guide.getByRole('button',{name:'Inherit date',exact:true}).click();await expect(panel(root,type).locator(selector)).toHaveText('Wed, Sep 23');
      await panel(root,type).locator('.ptitle').click();await guide.getByLabel('Frame',{exact:true}).selectOption('none');
      await expect(panel(root,type).locator(selector)).toHaveCount(0);
      await guide.getByLabel('Frame',{exact:true}).selectOption('phone');await expect(panel(root,type).locator(selector)).toHaveText('Wed, Sep 23');
    }
  }
});
