import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'examples/app-screens/app-screens.spec.json'),'utf8');
const raw=JSON.parse(source), diagram=value=>value.page.sections[0].diagram;
const assets=diagram(raw).panels[0].screens;
const upload=id=>({name:id+'.png',mimeType:'image/png',buffer:Buffer.from(assets.find(screen=>screen.id===id).src.split(',')[1],'base64')});
const panel=root=>root.locator('.pt-appscreens');
const chip=(root,id)=>root.locator('.schip[data-step-source="'+id+'"]').first();
async function screen(root,id){await expect(panel(root).locator('.appscreen-current')).toHaveAttribute('data-screen-id',id);await expect.poll(()=>panel(root).locator('.appscreen-current').evaluate(el=>el.complete && el.naturalWidth>0)).toBe(true);}
async function inspect(page){await panel(page.locator('#docview')).locator('.ptitle').click();}
async function inspectStep(page,index){await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+index+'"]').click();await page.locator('#editor-tab-inspect').click();}
async function publish(server,name,content=source){
  await writeFile(path.join(server.root,name+'.json'),content);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
}

test('the panel library inserts an empty collection and its controls fit a narrow editor',async({page,server},testInfo)=>{
  const simple=structuredClone(raw),d=diagram(simple);d.panels=[];delete d.sectionLayout;d.steps.forEach(step=>delete step.panels);
  const original=JSON.stringify(simple,null,2);
  await page.setViewportSize({width:1150,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,original);
  await page.locator('#diagram-add').click();await page.locator('[data-add-kind=panel]').click();
  const card=page.locator('.panel-picker-card[data-panel-type=appscreens]');await card.click();
  await expect(card.locator('.appscreen-current')).toBeVisible();
  await page.locator('#panel-picker-add').focus();await page.keyboard.press('Enter');
  const guide=page.locator('#guide'),src=page.locator('#src');
  expect(diagram(JSON.parse(await src.inputValue())).panels[0].screens).toEqual([]);
  await guide.getByLabel('Upload app screens',{exact:true}).setInputFiles(upload('home'));
  await screen(page.locator('#docview'),'home');
  await guide.getByLabel('Frame',{exact:true}).selectOption('none');
  await expect(panel(page.locator('#docview')).locator('.appscreen-phone')).toHaveCount(0);
  await guide.getByLabel('Transition',{exact:true}).selectOption('crossfade');
  expect(diagram(JSON.parse(await src.inputValue())).panels[0].transition).toBe('crossfade');
  const controls=guide.locator('.appscreen-editor');expect(await controls.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('app-screens-narrow-inspector.png')});
});

test('upload, replace, starting screen and per-step choices use the real inspector and exact Undo/Redo',async({page,server},testInfo)=>{
  const empty=structuredClone(raw),d=diagram(empty);d.panels[0].screens=[];d.panels[0].initial.screen=null;
  d.steps.forEach(step=>delete step.panels);const original=JSON.stringify(empty,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await inspect(page);
  const root=page.locator('#docview'),guide=page.locator('#guide'),src=page.locator('#src');
  await guide.getByLabel('Upload app screens',{exact:true}).setInputFiles([upload('home'),upload('connecting')]);
  await screen(root,'home');
  const imported=await src.inputValue(),p=diagram(JSON.parse(imported)).panels[0];
  expect(p.screens.map(s=>s.id)).toEqual(['home','connecting']);expect(p.initial.screen).toBe('home');expect(p.screens[0].width).toBe(390);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(imported);await inspect(page);
  await guide.locator('.appscreen-card summary').filter({hasText:/^home$/}).click();
  const name=guide.getByLabel('Name for home',{exact:true});await name.fill('Home screen');await name.press('Tab');
  await expect(panel(root).locator('figcaption strong')).toHaveText('Home screen');
  await guide.getByLabel('Starting screen',{exact:true}).selectOption('connecting');await screen(root,'connecting');
  const starting=await src.inputValue();await page.locator('#undo-builder').click();await screen(root,'home');
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(starting);
  await inspectStep(page,1);await guide.getByLabel('App screen · Product experience',{exact:true}).selectOption('id:home');await screen(root,'home');
  const changed=await src.inputValue();expect(diagram(JSON.parse(changed)).steps[1].panels.product).toEqual({screen:'home'});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(starting);
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(changed);await inspect(page);
  const home=guide.locator('.appscreen-card').filter({has:page.locator('summary').filter({hasText:/^Home screen$/})});
  if(await home.getAttribute('open')===null)await home.locator('summary').click();
  await home.getByLabel('Replace image for home',{exact:true}).setInputFiles(upload('live'));
  await expect.poll(async()=>diagram(JSON.parse(await src.inputValue())).panels[0].screens[0].src).toBe(assets[2].src);
  expect(diagram(JSON.parse(await src.inputValue())).steps[1].panels.product.screen).toBe('home');
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(changed);
  await page.screenshot({path:testInfo.outputPath('app-screens-editor.png')});
});

test('removing a referenced screen updates starting state and every path in one undoable operation',async({page,server})=>{
  const edited=structuredClone(raw),d=diagram(edited);d.panels[0].initial.screen='connecting';
  d.steps[4].panels.product.enterOnce={screen:'connecting'};const original=JSON.stringify(edited,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await inspect(page);
  const guide=page.locator('#guide'),card=guide.locator('.appscreen-card').filter({has:page.locator('summary').filter({hasText:/^Connecting$/})});
  await card.locator('summary').click();await card.getByRole('button',{name:'Remove Connecting',exact:true}).click();
  const after=await page.locator('#src').inputValue(),next=diagram(JSON.parse(after));
  expect(next.panels[0].screens.map(s=>s.id)).toEqual(['home','live','error']);expect(next.panels[0].initial.screen).toBe('home');
  expect(next.steps[1].panels.product.screen).toBeUndefined();expect(next.steps[4].panels.product.enterOnce.screen).toBeUndefined();
  expect(next.steps[4].panels.product.screen).toBe('error');expect(next.paths).toEqual(d.paths);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
});

test('invalid and retired file reads preserve all existing images and source',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await inspect(page);
  const input=page.getByLabel('Upload app screens',{exact:true}),src=page.locator('#src');
  await input.setInputFiles({name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(512*1024+1)});
  await expect(page.locator('#guide')).toContainText('up to 512 KiB');await expect(src).toHaveValue(source);
  await input.setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
  await expect(page.locator('#guide')).toContainText('not a readable image');await expect(src).toHaveValue(source);
  // Hold an actual FileReader completion across inspector retirement.
  await page.evaluate(()=>{
    const Native=window.FileReader;window.FileReader=class extends Native{
      readAsDataURL(file){const callback=this.onload;this.onload=()=>{window.releaseUpload=()=>callback?.();};super.readAsDataURL(file);}
    };
  });
  await input.setInputFiles(upload('live'));await page.waitForFunction(()=>!!window.releaseUpload);
  await inspectStep(page,1);await page.evaluate(()=>releaseUpload());
  await expect(src).toHaveValue(source);await expect(page.getByLabel('App screen · Product experience',{exact:true})).toBeVisible();
});

test('standalone and native Backstage restore screens across paths, hidden steps, skins and narrow layouts',async({page,server},testInfo)=>{
  await publish(server,'app-screens');await page.goto(server.origin+'/app-screens.html');
  const root=page.locator('.docview');await screen(root,'home');
  await chip(root,1).click();await screen(root,'connecting');await chip(root,2).click();await screen(root,'connecting');
  await chip(root,3).click();await screen(root,'live');
  await root.locator('.schip[data-step-source="4"]').click();await screen(root,'error');
  await root.locator('[data-dv-path=connected]').click();await screen(root,'home');
  await page.screenshot({path:testInfo.outputPath('app-screens-standalone.png')});
  await writeFile(path.join(server.root,'app-screens-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'app-screens-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./app-screens-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/app-screens-native.html');await page.waitForFunction(()=>!!window.mount);
  const host=page.locator('#host'),filtered=structuredClone(raw),d=diagram(filtered);
  d.layouts=[{id:'full',name:'Full',sectionLayout:d.sectionLayout},{id:'brief',name:'Brief',steps:['home','wake','live','error'],sectionLayout:d.sectionLayout}];d.defaultLayout='full';
  for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
    await page.evaluate(({raw,skin})=>{window.viewer?.destroy();window.viewer=mount(document.querySelector('#host'),raw,{skin});},{raw:filtered,skin});
    await host.getByRole('button',{name:'Full',exact:true}).click();await screen(host,'home');
    const before=await panel(host).locator('.appscreen-viewport').boundingBox();expect(before.width).toBeGreaterThan(100);expect(before.height).toBeGreaterThan(200);
    await chip(host,3).click();await screen(host,'live');const after=await panel(host).locator('.appscreen-viewport').boundingBox();
    expect(Math.abs(before.width-after.width)).toBeLessThan(1);expect(Math.abs(before.height-after.height)).toBeLessThan(1);
    await host.getByRole('button',{name:'Brief',exact:true}).click();await chip(host,2).click();await screen(host,'connecting');
    await host.locator('.schip[data-step-source="4"]').click();await screen(host,'error');
    await host.locator('[data-dv-path=connected]').click();await screen(host,'home');
    for(const width of [1100,650]){
      await host.evaluate((el,width)=>el.style.width=width+'px',width);
      await expect.poll(()=>panel(host).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      const image=await panel(host).locator('.appscreen-current').boundingBox();expect(image.height).toBeGreaterThan(100);
    }
  }
  await page.screenshot({path:testInfo.outputPath('app-screens-native-narrow.png')});
  await page.emulateMedia({media:'print'});await expect(panel(host).locator('.appscreen-current')).toBeVisible();
  await page.evaluate(()=>viewer.destroy());await expect(host).toBeEmpty();
});

test('crossfade runs only on a sequential screen change and settles on pause or reduced motion',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await publish(server,'app-screens-motion');await page.goto(server.origin+'/app-screens-motion.html');
  const root=page.locator('.docview');await screen(root,'home');
  await page.evaluate(()=>{window.fades=0;document.addEventListener('animationstart',event=>{if(event.animationName==='appscreen-crossfade')fades++;});});
  await chip(root,1).click();await screen(root,'connecting');await expect.poll(()=>page.evaluate(()=>fades)).toBe(1);
  await expect(panel(root).locator('.appscreen-previous')).toHaveCount(0);
  await chip(root,2).click();expect(await page.evaluate(()=>fades)).toBe(1);
  await chip(root,0).click();await screen(root,'home');await expect(panel(root).locator('.appscreen-previous')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await chip(root,0).click();await chip(root,1).click();await screen(root,'connecting');
  await expect(panel(root).locator('.appscreen-previous')).toHaveCount(0);
});
