import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'examples/device-app-notifications/device-app-notifications.spec.json'),'utf8');
const raw=JSON.parse(source);
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
 await page.locator('#diagram-add').click();await page.locator('[data-add-kind=panel]').click();await page.locator('#add-panel').click();
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
