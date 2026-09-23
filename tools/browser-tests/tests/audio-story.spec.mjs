import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'src/starters/audio-story.json'),'utf8');
const spec=JSON.parse(source);
async function start(page,server){
 await writeFile(path.join(server.root,'audio-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'audio-native.html'),'<div id="host" style="width:1400px"></div><script type="module">import {mountNativeViewer} from "./audio-native.js";window.mountAudio=mountNativeViewer;</script>');
 await page.goto(server.origin+'/audio-native.html');await page.waitForFunction(()=>!!window.mountAudio);
}
async function mount(page,chapter,skin='pastel'){
 await page.evaluate(({section,skin})=>{window.viewer?.destroy();window.viewer=mountAudio(document.querySelector('#host'),{page:{skin,sections:[section]}},{skin});},{section:spec.page.sections[chapter],skin});
}
async function navigate(page,chapter,path,step){await page.evaluate(target=>viewer.navigate(target),{section:spec.page.sections[chapter].id,path,step});}

test('audio endpoints show direction and failed output without restarting video across skins',async({page,server})=>{
 await start(page,server);const host=page.locator('#host');
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await mount(page,0,skin);await navigate(page,0,'conversation','speak');
  await expect(host.locator('.pt-phone .phonecall')).toContainText('You are speaking');
  await expect(host.locator('.pt-screen .screen-audio-slot')).toContainText('Please leave the package');
  await expect(host.locator('.pt-homemap [data-home-audio="cam"] [data-sound="speech"]')).toBeVisible();
  const clip=host.locator('.pt-screen .scene');await clip.evaluate(el=>window.audioClip=el);
  await navigate(page,0,'conversation','reply');expect(await clip.evaluate(el=>el===window.audioClip)).toBe(true);
  await expect(host.locator('.pt-homemap [data-home-audio="visitor"] [data-sound="speech"]')).toBeVisible();
  await expect(host.locator('.pt-screen .screen-audio-slot')).toContainText('Camera hearing visitor');
  await navigate(page,0,'mic-denied','mic-denied');
  await expect(host.locator('.pt-phone .phonecall')).toContainText('Microphone permission denied');
  await expect(host.locator('.pt-screen .screenbox')).toHaveClass(/m-rec/);
  await expect(host.locator('.pt-homemap [data-home-audio="cam"] [data-sound]')).toHaveCount(0);
  await navigate(page,0,'automatic','quiet-hours');
  await expect(host.locator('.pt-homemap')).toContainText('suppressed');
  await expect(host.locator('.pt-homemap [data-home-audio="speaker"] [data-sound]')).toHaveCount(0);
  for(const width of [1400,960]){
   await host.evaluate((el,w)=>el.style.width=w+'px',width);
   for(const selector of ['.pt-homemap','.pt-screen','.pt-phone'])expect(await host.locator(selector).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  }
 }
 await page.evaluate(()=>viewer.destroy());await expect(host).toBeEmpty();
});

test('operator voice, siren confirmation and heard-alarm evidence stay independent in native viewers',async({page,server})=>{
 await start(page,server);await mount(page,1);const host=page.locator('#host');
 await navigate(page,1,'talk-down','challenge');
 await expect(host.locator('.secmon-stage')).toHaveClass(/secmon-audio-speaking/);
 const clip=host.locator('.secmon-video .scene');await clip.evaluate(el=>window.operatorClip=el);
 await navigate(page,1,'talk-down','reply');
 await expect(host.locator('.secmon-stage')).toHaveClass(/secmon-audio-listening/);
 expect(await clip.evaluate(el=>el===window.operatorClip)).toBe(true);
 await navigate(page,1,'escalation','siren-queued');
 await expect(host.locator('.pt-homemap [data-sound="siren"]')).toHaveCount(0);
 await navigate(page,1,'escalation','siren');
 await expect(host.locator('.pt-homemap [data-sound="siren"]')).toBeVisible();
 await expect(host.locator('.pt-homemap .hmspotlight-flash')).toBeVisible();
 await expect(host.locator('.dispatch')).toHaveClass(/dispatch-idle/);
 await navigate(page,1,'audio-lost','audio-lost');
 await expect(clip).toBeVisible();await expect(host.locator('.pt-homemap [data-sound]')).toHaveCount(0);
 await expect(host.locator('.secmon')).toContainText('Voice downlink interrupted');
 await mount(page,2);await navigate(page,2,'recognized','classified');
 await expect(host.locator('.pt-screen')).toContainText('Smoke alarm heard');
 await expect(host.locator('.pt-phone')).toContainText('Smoke alarm sound heard');
 await navigate(page,2,'uncertain','unclassified');
 await expect(host.locator('.pt-phone')).not.toContainText('Smoke alarm sound heard');
 await expect(host.locator('.pt-screen')).toContainText('Sound class is uncertain');
 await page.evaluate(()=>viewer.destroy());await expect(host).toBeEmpty();
});

test('workbench Home audio controls edit only the selected step and Undo restores exact source',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').first().click();
 await page.locator('#editor-tab-inspect').click();
 await page.locator('#guide summary').filter({hasText:/^Doorbell · audio$/}).click();
 const control=page.getByLabel('Doorbell audio output',{exact:true});
 await control.selectOption('recorded');
 await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps[1].panels.home.cam.audio.output).toBe('recorded');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});
