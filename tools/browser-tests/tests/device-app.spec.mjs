import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'examples/device-app-notifications/device-app-notifications.spec.json'),'utf8');
const raw=JSON.parse(source);
const navigationSource=await readFile(path.join(repo,'examples/device-app-navigation/device-app-navigation.spec.json'),'utf8');
const navigationRaw=JSON.parse(navigationSource);
const diagram=raw=>raw.page.sections[0].diagram;
const app=root=>root.locator('.pt-deviceapp');
async function step(root,index){await root.getByRole('button',{name:'Go to step '+index,exact:true}).click();}
async function verifyStory(root){
 const phone=app(root);await expect(phone.locator('.da-provenance')).toHaveCount(0);
 await expect(phone.locator('.da-badge')).toHaveCount(0);await expect(phone.locator('.da-field')).toHaveCount(5);
 await step(root,3);await expect(phone.locator('.phonetitle')).toHaveText(['Doorbell pressed']);
 await expect(phone.locator('[data-da-field=battery] .da-value')).toHaveText('68%');
 await step(root,4);await expect(phone.locator('.phonetitle')).toHaveText(['Recording ready','Doorbell pressed']);
 await expect(phone.locator('[data-da-field=clip] .da-value')).toHaveText('Just now');
 await step(root,5);await expect(phone.locator('.phonecard')).toHaveCount(0);
 await expect(phone.locator('[data-da-field=clip] .da-value')).toHaveText('Just now');
 await step(root,3);await expect(phone.locator('.phonetitle')).toHaveText(['Doorbell pressed']);
 await expect(phone.locator('[data-da-field=clip] .da-value')).toHaveText('Yesterday');
 await step(root,1);await expect(phone.locator('.phonecard')).toHaveCount(0);
}

test('source visibility and notifications edit independently with Undo and Redo',async({page,server})=>{
 const mapped=structuredClone(raw),p=diagram(mapped).panels[0];
 p.sources=[{id:'telemetry',label:'Device telemetry',node:'events'}];p.fields[0].source='telemetry';
 const original=JSON.stringify(mapped,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,original);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 await expect(app(root).locator('.da-provenance')).toBeVisible();
 await app(root).locator('[data-da-field=battery]').click();await expect(root.locator('[data-dv-node=events]')).toHaveClass(/da-node-focus/);
 await app(root).locator('.ptitle').click();
 await guide.getByRole('combobox',{name:'Show data sources',exact:true}).selectOption('Hide');
 await expect(app(root).locator('.da-provenance')).toHaveCount(0);await expect(root.locator('.da-node-focus')).toHaveCount(0);
 const edited=JSON.parse(await page.locator('#src').inputValue());expect(diagram(edited).panels[0].sources).toEqual(p.sources);
 expect(diagram(edited).panels[0].showSources).toBe(false);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(app(root).locator('.da-provenance')).toBeVisible();
 await page.locator('#redo-builder').click();await expect(app(root).locator('.da-provenance')).toHaveCount(0);
 const hidden=await page.locator('#src').inputValue();
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
 const patch=guide.locator('.patchedit').filter({has:page.locator('summary').filter({hasText:/^app ·/})});
 if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
 const notify=patch.getByLabel('notify',{exact:true});await notify.fill('{"app":"Homestead","title":"Visitor detected","text":"Check the door."}');await notify.press('Tab');
 await expect(app(root).locator('.phonetitle')).toHaveText(['Visitor detected']);
 expect(diagram(JSON.parse(await page.locator('#src').inputValue())).steps[3]).toEqual(diagram(raw).steps[3]);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(hidden);
 await expect(app(root).locator('.phonetitle')).toHaveText(['Doorbell pressed']);
});

test('the picker demonstrates notifications but inserts a plain source-free tiled phone',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 await page.locator('#diagram-add').click();await page.locator('[data-add-kind=panel]').click();
 const card=page.locator('.panel-picker-card[data-panel-type=deviceapp]');await card.click();
 await expect(card.locator('.da-fields')).toBeVisible();await expect(card.locator('.phonetitle')).toHaveText('Doorbell pressed');await expect(card.locator('.da-provenance')).toHaveCount(0);
 await page.locator('#panel-picker-add').click();
 const inserted=diagram(JSON.parse(await page.locator('#src').inputValue())).panels.at(-1);
 expect(inserted.type).toBe('deviceapp');expect(inserted.sources).toBeUndefined();expect(inserted.initial.notify).toBeUndefined();expect(inserted.fields).toHaveLength(4);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
 await step(page.locator('#docview'),4);
 await page.screenshot({path:testInfo.outputPath('device-app-editor.png')});
});

test('standalone and native Backstage viewers preserve notifications and tiles across steps and skins',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'device-app.json'),source);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'device-app.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'device-app.html')]);
 await page.goto(server.origin+'/device-app.html');await verifyStory(page.locator('.docview'));
 await step(page.locator('.docview'),4);await page.screenshot({path:testInfo.outputPath('device-app-standalone.png')});
 await writeFile(path.join(server.root,'device-app-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'device-app-native.html'),'<div id="host" style="width:1200px"></div><script type="module">import {mountNativeViewer} from "./device-app-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/device-app-native.html');await page.waitForFunction(()=>!!window.mount);
 const root=page.locator('#host');
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await page.evaluate(({raw,skin})=>{window.viewer?.destroy();window.viewer=mount(document.querySelector('#host'),raw,{skin});},{raw,skin});
  await verifyStory(root);await step(root,4);
  for(const width of [1200,800]){
   await root.evaluate((el,w)=>el.style.width=w+'px',width);
   await expect.poll(()=>app(root).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   expect(await app(root).locator('.da-phone').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  }
 }
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('Confluence renders and saves the source-free combined phone through its bridge',async({page,server})=>{
 await page.addInitScript(()=>{window.__calls=[];window.__bridge={callBridge:async(method,payload)=>{
  __calls.push({method,payload});if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{},macro:{isConfiguring:true}}};
  if(['submit','close','navigate'].includes(method))return true;throw Error('Unexpected bridge call: '+method);
 }};});
 await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();
 await page.locator('#spec-input').fill(source);await page.locator('#validate').click();
 await verifyStory(page.locator('#docview'));await page.locator('#save').click();
 await expect.poll(()=>page.evaluate(()=>__calls.some(c=>c.method==='submit'))).toBe(true);
 expect(await page.evaluate(()=>JSON.parse(__calls.find(c=>c.method==='submit').payload.config.specJson))).toEqual(raw);
});

async function verifyNavigation(root){
 const phone=app(root),shell=phone.locator('.da-phone');
 await step(root,1);await expect(shell).toHaveAttribute('data-da-screen','home');
 await expect(phone.locator('.da-field')).toHaveCount(0);await expect(phone.locator('.da-launcher')).toBeVisible();
 const initial=await shell.boundingBox();expect(initial.height/initial.width).toBeGreaterThan(1.9);expect(initial.height/initial.width).toBeLessThan(2.2);
 await step(root,2);await expect(phone.locator('.phonetitle')).toHaveText('Doorbell pressed');
 await step(root,3);await expect(shell).toHaveAttribute('data-da-screen','app');await expect(phone.locator('.da-field')).toHaveCount(3);
 await expect(phone.locator('.phonecard')).toHaveCount(0);
 await step(root,4);await expect(phone.locator('[data-da-field=clip] .da-value')).toHaveText('Just now');await expect(phone.locator('.da-field')).toHaveCount(4);
 await step(root,5);await expect(phone.locator('.da-field')).toHaveCount(2);await expect(phone.locator('[data-da-field=power]')).toHaveCount(0);
 const focused=await shell.boundingBox();expect(Math.abs(initial.height-focused.height)).toBeLessThan(1);expect(Math.abs(initial.width-focused.width)).toBeLessThan(1);
 await step(root,6);await expect(shell).toHaveAttribute('data-da-screen','home');await expect(phone.locator('.da-field')).toHaveCount(0);
 await step(root,7);await expect(phone.locator('.da-field')).toHaveCount(2);await expect(phone.locator('[data-da-field=clip] .da-value')).toHaveText('Just now');
 await step(root,2);await expect(shell).toHaveAttribute('data-da-screen','home');await expect(phone.locator('.phonetitle')).toHaveText('Doorbell pressed');
 await expect(phone.locator('.fresh')).toHaveCount(0);
 await step(root,3);await expect(phone.locator('.da-field')).toHaveCount(3);await expect(phone.locator('[data-da-field=clip]')).toHaveCount(0);
}

test('home/app navigation and card visibility keep one phone frame in standalone and native viewers',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'phone-navigation.json'),navigationSource);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'phone-navigation.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'phone-navigation.html')]);
 await page.goto(server.origin+'/phone-navigation.html');const standalone=page.locator('.docview');await verifyNavigation(standalone);
 for(const [index,name] of [[2,'home-notification'],[4,'device-app-cards'],[5,'device-app-focused']]){
  await step(standalone,index);await testInfo.attach(name,{body:await app(standalone).screenshot(),contentType:'image/png'});
 }
 await writeFile(path.join(server.root,'navigation-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'navigation-native.html'),'<div id="host" style="width:1200px"></div><script type="module">import {mountNativeViewer} from "./navigation-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/navigation-native.html');await page.waitForFunction(()=>!!window.mount);
 const root=page.locator('#host');
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await page.evaluate(({raw,skin})=>{window.viewer?.destroy();window.viewer=mount(document.querySelector('#host'),raw,{skin});},{raw:navigationRaw,skin});
  await verifyNavigation(root);
 }
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('workbench edits the starting screen and per-step cards with independent Undo/Redo',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,navigationSource);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 await app(root).locator('.ptitle').click();await guide.getByRole('combobox',{name:'Starting phone screen',exact:true}).selectOption('app');
 await expect(app(root).locator('.da-phone')).toHaveAttribute('data-da-screen','app');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(navigationSource);
 await app(root).locator('.ptitle').click();
 const initialClip=guide.locator('.initialedit .frow').filter({has:page.locator(':scope > .flab').filter({hasText:/^clip$/})});
 await initialClip.getByRole('combobox',{name:'Card visibility',exact:true}).selectOption('true');
 let updated=diagram(JSON.parse(await page.locator('#src').inputValue()));
 expect(updated.panels[0].initial.clip).toEqual({value:'Yesterday',status:'ready',visible:true});expect(updated.panels[0].initial.phoneScreen).toBe('home');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(navigationSource);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
 const patch=guide.locator('.patchedit').filter({has:page.locator('summary').filter({hasText:/^app ·/})});
 if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
 await patch.getByRole('combobox',{name:'Phone screen',exact:true}).selectOption('home');
 await expect(app(root).locator('.da-phone')).toHaveAttribute('data-da-screen','home');
 await page.locator('#undo-builder').click();await expect(app(root).locator('.da-phone')).toHaveAttribute('data-da-screen','app');
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
 const clip=patch.locator('.frow').filter({has:page.locator(':scope > .flab').filter({hasText:/^clip$/})});
 await clip.getByRole('combobox',{name:'Card visibility',exact:true}).selectOption('true');
 await expect(app(root).locator('[data-da-field=clip] .da-value')).toHaveText('Yesterday');
 updated=diagram(JSON.parse(await page.locator('#src').inputValue()));expect(updated.steps[2].panels.app.clip).toEqual({visible:true});expect(updated.steps[2].panels.app.clear).toBe(true);
 await page.locator('#undo-builder').click();await expect(app(root).locator('[data-da-field=clip]')).toHaveCount(0);
 await page.locator('#redo-builder').click();await expect(app(root).locator('[data-da-field=clip] .da-value')).toHaveText('Yesterday');
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
 await clip.getByRole('combobox',{name:'Card visibility',exact:true}).selectOption('false');await expect(app(root).locator('[data-da-field=clip]')).toHaveCount(0);
});

test('Forge uses the same home screen and step-controlled cards',async({page,server})=>{
 await page.addInitScript(()=>{window.__bridge={callBridge:async(method)=>{
  if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{},macro:{isConfiguring:true}}};
  if(['submit','close','navigate'].includes(method))return true;throw Error('Unexpected bridge call: '+method);
 }};});
 await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();
 await page.locator('#spec-input').fill(navigationSource);await page.locator('#validate').click();await verifyNavigation(page.locator('#docview'));
});

test('phone transitions animate only forward and settle on jumps or reduced motion',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto(server.origin+'/workbench.html');await paste(page,navigationSource);
 const root=page.locator('#docview'),screen=app(root).locator('.da-screen');
 await root.getByRole('button',{name:'Next step',exact:true}).click();
 await root.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(screen).toHaveClass(/da-screen-app fresh/);
 // The story drives the view; the frame remains steady while its screen enters.
 await expect(screen).toHaveClass(/da-screen-app/);
 await step(root,1);await expect(app(root).locator('.fresh')).toHaveCount(0);
 await step(root,6);await expect(screen).toHaveClass(/da-screen-home/);await expect(app(root).locator('.fresh')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await step(root,7);
 expect(await screen.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('long card lists scroll inside the phone and removing all cards keeps its outline',async({page,server})=>{
 const raw=structuredClone(navigationRaw),d=diagram(raw),p=d.panels[0];
 p.fields=Array.from({length:12},(_,i)=>({id:'card'+i,label:'Camera data '+i}));
 p.initial={phoneScreen:'app'};const hide={};
 for(const f of p.fields){p.initial[f.id]={value:'Reported device information',status:'ready',detail:'A detailed reading that occupies several lines on this device card.'};hide[f.id]={visible:false};}
 d.steps=[{id:'all',nodes:['resident']},{id:'empty',nodes:['resident'],panels:{app:hide}}];
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));
 const root=page.locator('#docview'),phone=app(root),screen=phone.locator('.da-screen'),shell=phone.locator('.da-phone');
 const before=await shell.boundingBox();expect(await screen.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await screen.focus();await page.keyboard.press('End');
 await expect.poll(()=>screen.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await expect(phone.locator('[data-da-field=card11]')).toBeInViewport();
 await step(root,2);await expect(phone.locator('.da-field')).toHaveCount(0);await expect(phone.locator('.da-empty-cards')).toBeVisible();
 const after=await shell.boundingBox();expect(Math.abs(before.height-after.height)).toBeLessThan(1);expect(Math.abs(before.width-after.width)).toBeLessThan(1);
 await expect(phone.locator('.da-home')).toBeVisible();
});

test('changing paths to an adjacent ordinal does not replay screen or notification entry',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 const raw=structuredClone(navigationRaw),d=diagram(raw);
 d.steps=[{id:'start',nodes:['resident']},{id:'wait',nodes:['resident']},
  {id:'open',nodes:['resident'],panels:{app:{phoneScreen:'app',notify:{app:'Home',title:'Other path'}}}},
  {id:'back',nodes:['resident'],panels:{app:{phoneScreen:'home'}}}];
 d.paths=[{id:'waiting',label:'Waiting',steps:['start','wait']},{id:'opened',label:'Opened',steps:['start','open','back']}];
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));const root=page.locator('#docview');
 await expect(app(root).locator('.da-phone')).toHaveAttribute('data-da-screen','home');
 await root.getByRole('button',{name:'Go to step 2 on Opened',exact:true}).click();
 await expect(app(root).locator('.da-phone')).toHaveAttribute('data-da-screen','app');await expect(app(root).locator('.phonetitle')).toHaveText('Other path');
 await expect(app(root).locator('.fresh')).toHaveCount(0);
 await root.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(app(root).locator('.da-phone')).toHaveAttribute('data-da-screen','home');
 await expect(app(root).locator('.phonetitle')).toHaveText('Other path');
});

test('phone text and geometry scale together when its tile gets narrower or shorter',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'phone-sizing.json'),navigationSource);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'phone-sizing.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'phone-sizing.html')]);
 await page.goto(server.origin+'/phone-sizing.html');
 async function check(root){
  const tile=root.locator('.section-layout-tile:has(.pt-deviceapp)'),phone=app(root),shell=phone.locator('.da-phone');
  for(const [width,height] of [[500,792],[500,400],[220,792],[220,400],[500,792]]){
   await tile.evaluate((el,{width,height})=>{el.style.width=width+'px';el.style.height=height+'px';},{width,height});
   for(const index of [2,5]){
    await step(root,index);
    const size=await shell.evaluate(el=>{
     const box=el.getBoundingClientRect(),body=el.closest('.pbody'),text=el.querySelector('.phonetitle')||el.querySelector('.da-value');
     return {width:box.width,height:box.height,font:parseFloat(getComputedStyle(text).fontSize),bodyHeight:body.clientHeight,bodyScroll:body.scrollHeight,overflow:el.scrollWidth-el.clientWidth};
    });
    expect(size.width).toBeLessThanOrEqual(330);expect(size.width).toBeGreaterThan(140);
    expect(Math.abs(size.height/size.width-18.5/9)).toBeLessThan(.02);
    expect(size.font).toBeCloseTo((index===2?12:29)*size.width/330,1);
    expect(size.bodyScroll).toBeLessThanOrEqual(size.bodyHeight+1);expect(size.overflow).toBeLessThanOrEqual(1);
    if(width===220 || height===400)expect(size.width).toBeLessThan(200);
    else expect(size.width).toBeCloseTo(330,0);
   }
  }
  await tile.evaluate(el=>{el.style.width='240px';el.style.height='440px';});
  await testInfo.attach('scaled-phone',{body:await tile.screenshot(),contentType:'image/png'});
 }
 await check(page.locator('.docview'));
 await page.goto(server.origin+'/workbench.html');await paste(page,navigationSource);
 await check(page.locator('#docview'));
 // The same CSS must work in the native ShadowRoot, including a host resize.
 await writeFile(path.join(server.root,'sizing-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'sizing-native.html'),'<div id="host" style="width:1200px"></div><script type="module">import {mountNativeViewer} from "./sizing-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/sizing-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},navigationRaw);
 await check(page.locator('#host'));
 // Scaling the phone must not shrink the explanatory source map beside it.
 const mapped=structuredClone(navigationRaw),p=diagram(mapped).panels[0];
 p.sources=[{id:'health',label:'Device telemetry'}];p.fields[0].source='health';
 await page.evaluate(raw=>{viewer.destroy();window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},mapped);
 const root=page.locator('#host'),tile=root.locator('.section-layout-tile:has(.pt-deviceapp)');
 for(const height of [792,400]){
  await tile.evaluate((el,h)=>{el.style.width='500px';el.style.height=h+'px';},height);await step(root,5);
  expect(await root.locator('.da-source .da-badge').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBe(11);
  expect(await root.locator('.da-heading h3').evaluate(el=>parseFloat(getComputedStyle(el).letterSpacing))).toBeLessThan(0);
 }
 await page.emulateMedia({media:'print'});
 expect((await root.locator('.da-phone').boundingBox()).width).toBeGreaterThan(200);
 expect(await root.locator('.pt-deviceapp>.pbody').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(600);
 await page.evaluate(()=>viewer.destroy());
});


test('starting state uses typed fields, preserves advanced data, and leaves step overrides untouched',async({page,server},testInfo)=>{
 const spec=structuredClone(raw),d=diagram(spec);delete d.layouts;delete d.defaultLayout;
 d.panels[0].initial.battery.custom='keep nested';d.panels[0].initial.custom='keep top';d.panels[0].initial.battery.detail=null;
 d.panels.push({id:'camera',type:'screen',title:'Camera',scene:'person-through-door',initial:{mode:'off',banner:'Ready',custom:17}});
 d.steps[1].panels={...d.steps[1].panels,camera:{mode:'rec'}};
 const original=JSON.stringify(spec,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,original);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 await app(root).locator('.ptitle').click();
 const battery=guide.locator('.initialedit .frow').filter({has:page.locator(':scope > .flab').filter({hasText:/^battery$/})});
 await battery.getByLabel('value',{exact:true}).fill('42');await battery.getByLabel('value',{exact:true}).press('Tab');
 await expect(app(root).locator('[data-da-field=battery] .da-value')).toHaveText('42%');
 let edited=diagram(JSON.parse(await page.locator('#src').inputValue()));
 expect(edited.panels[0].initial.battery).toEqual({...d.panels[0].initial.battery,value:42});
 expect(edited.panels[0].initial.custom).toBe('keep top');expect(edited.steps).toEqual(d.steps);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.locator('#redo-builder').click();await expect(app(root).locator('[data-da-field=battery] .da-value')).toHaveText('42%');
 await root.locator('.pt-screen .ptitle').click();
 await guide.locator('.initialedit').getByLabel('mode',{exact:true}).selectOption('live');
 edited=diagram(JSON.parse(await page.locator('#src').inputValue()));
 expect(edited.panels[1].initial).toEqual({mode:'live',banner:'Ready',custom:17});expect(edited.steps).toEqual(d.steps);
 await testInfo.attach('typed-starting-state',{body:await guide.screenshot(),contentType:'image/png'});
 await page.locator('#undo-builder').click();
 expect(diagram(JSON.parse(await page.locator('#src').inputValue())).panels[1].initial.mode).toBe('off');
});
