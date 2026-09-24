import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'examples/shared-downstream/shared-downstream.spec.json'),'utf8');
const blocksSource=await readFile(path.join(repo,'examples/shared-downstream/shared-blocks.spec.json'),'utf8');
const raw=JSON.parse(source),blocksRaw=JSON.parse(blocksSource);
const diagram=spec=>spec.page.sections[0].diagram;
const sourceIndex=(spec,id)=>diagram(spec).steps.findIndex(step=>step.id===id);
const step=(root,index)=>root.locator('button.schip[data-step-source="'+index+'"]');
const chip=(root,pathId,index)=>root.locator('button.schip[data-step-path="'+pathId+'"][data-step-source="'+index+'"]');
const route=(root,pathId)=>root.locator('.path-chip[data-dv-path="'+pathId+'"]');
const processIndex=sourceIndex(raw,'process'),persistIndex=sourceIndex(raw,'persist'),notifyIndex=sourceIndex(raw,'notify');
async function choose(root,pathId,label){
 await route(root,pathId).click();
 await expect(route(root,pathId)).toHaveAttribute('aria-pressed','true');
 await expect(root.locator('.path-timeline-owner')).toHaveText('Following '+label);
 await expect(root.locator('.schip[aria-current="true"]')).toHaveText('1');
}
async function standalone(page,server,name,text){
 await writeFile(path.join(server.root,name+'.json'),text);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
 await page.goto(server.origin+'/'+name+'.html');
 return page.locator('.docview');
}
async function checkGeometry(root){
 const issues=await root.locator('.path-timeline').evaluate(timeline=>{
  const outer=timeline.getBoundingClientRect(),issues=[];
  const controls=[...timeline.querySelectorAll('.path-chip,button.schip')].map((element,index)=>({
   label:element.getAttribute('aria-label') || element.textContent || String(index),rect:element.getBoundingClientRect()
  }));
  for(const {label,rect} of controls){
   if(rect.left<outer.left-1 || rect.top<outer.top-1 || rect.right>outer.right+1 || rect.bottom>outer.bottom+1)issues.push('Outside timeline: '+label);
  }
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
   const a=controls[i],b=controls[j];
   if(Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1 &&
      Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1)issues.push('Overlapping controls: '+a.label+' / '+b.label);
  }
  return issues;
 });
 expect(issues).toEqual([]);
}
async function checkShared(root){
 await expect(root.locator('.path-timeline')).toHaveCount(1);await expect(root.locator('.path-matrix')).toHaveCount(0);
 await expect(root.locator('.path-shared-block,.path-shared-heading,.path-shared-caption')).toHaveCount(0);
 expect(await root.locator('.path-timeline').evaluate(el=>el.offsetHeight)).toBeLessThanOrEqual(90);
 await expect(root.locator('.shared-step-link')).toHaveCount(0);
 for(const index of [processIndex,persistIndex,notifyIndex]){
  await expect(step(root,index)).toHaveCount(1);await expect(step(root,index)).toHaveClass(/shared-downstream-step/);
  await expect(step(root,index)).not.toHaveClass(/shared-step-shadow/);
 }
 const shared=step(root,processIndex);
 await choose(root,'button','Button press');await expect(shared).toHaveText('3');await expect(shared).toHaveAttribute('data-step-path','button');
 await expect(shared).toHaveAttribute('title','Shared step — Button press (step 3), Motion detected (step 4)');
 await choose(root,'motion','Motion detected');await expect(shared).toHaveText('4');await expect(shared).toHaveAttribute('data-step-path','motion');
 await expect(shared).toHaveCSS('opacity','1');await expect(shared).toHaveCSS('background-color','rgb(13, 148, 136)');
 await shared.click();await expect(shared).toHaveAttribute('aria-current','true');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Button press (step 3)');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');
 await choose(root,'button','Button press');await shared.click();await expect(shared).toHaveText('3');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Button');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Motion detected (step 4)');
 await checkGeometry(root);
}

test('standalone joins form one shared ending in all skins and preserve each input state',async({page,server},testInfo)=>{
 const root=await standalone(page,server,'shared',source);
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await page.evaluate(skin=>window.dvSetSkin(skin),skin);await checkShared(root);
  await choose(root,'motion','Motion detected');await step(root,notifyIndex).click();
  await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');await expect(root.locator('.pt-log')).toContainText('Notify resident');
  await chip(root,'motion',sourceIndex(raw,'detect')).click();await expect(root.locator('.step-shared-note')).toBeHidden();
 }
 await page.evaluate(()=>window.dvSetSkin('pastel'));await choose(root,'motion','Motion detected');await step(root,processIndex).click();
 await page.screenshot({path:testInfo.outputPath('shared-downstream-standalone.png'),fullPage:true});
 // The next shared operation stays keyboard reachable and runs on the selected route.
 await page.keyboard.press('Tab');await expect(step(root,persistIndex)).toBeFocused();await expect(step(root,persistIndex)).toHaveCSS('opacity','1');
 await expect(step(root,persistIndex)).toHaveAttribute('aria-current','false');await page.keyboard.press('Enter');
 await expect(step(root,persistIndex)).toHaveAttribute('aria-current','true');await expect(step(root,persistIndex)).toHaveAttribute('data-step-path','motion');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');await expect(root.locator('.pt-log')).toContainText('Persist event');
});

test('workbench can detach a downstream shared step and Undo restores its shared circle',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);const root=page.locator('#docview');await checkShared(root);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-path').selectOption('motion');
 await page.locator('#steps-list [data-step-index="'+processIndex+'"]').click();
 await expect(page.locator('#steps-shared-with')).toContainText('Shared with Button press');await page.locator('#steps-independent').click();
 await expect(chip(root,'button',processIndex)).not.toHaveClass(/shared-downstream-step/);
 const updated=diagram(JSON.parse(await page.locator('#src').inputValue()));
 const copy=updated.steps.findIndex(step=>step.id===updated.paths[1].steps[3]);
 expect(copy).not.toBe(processIndex);await expect(chip(root,'motion',copy)).not.toHaveClass(/shared-step-shadow|shared-downstream-step/);
 await expect(step(root,persistIndex)).toHaveCount(1);await expect(step(root,persistIndex)).toHaveClass(/shared-downstream-step/);
 await expect(root.locator('.shared-step-link')).toHaveCount(0);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
 await expect(step(root,processIndex)).toHaveCount(1);await expect(step(root,processIndex)).toHaveClass(/shared-downstream-step/);
 await choose(root,'motion','Motion detected');await step(root,processIndex).click();await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');
 await page.screenshot({path:testInfo.outputPath('shared-downstream-editor.png')});
});

test('native viewer keeps joins when a named view hides the separate input steps',async({page,server})=>{
 const spec=structuredClone(raw),d=diagram(spec);d.steps[processIndex].delta=true;
 const composition={default:[{x:0,y:0,w:8,h:22},{panel:'origin',x:8,y:0,w:4,h:7},{panel:'work',x:8,y:7,w:4,h:15},{controls:'steps',attachTo:'diagram',x:0,y:22,w:8,h:8}]};
 d.layouts=[{id:'full',name:'Full story',sectionLayout:composition},{id:'brief',name:'Processing only',steps:['process','persist','notify'],sectionLayout:composition}];d.defaultLayout='full';
 await writeFile(path.join(server.root,'shared-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'shared-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./shared-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/shared-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(spec=>window.viewer=mount(document.querySelector('#host'),spec),spec);const root=page.locator('#host');
 await root.getByRole('button',{name:'Full story',exact:true}).click();await checkShared(root);
 await root.getByRole('button',{name:'Processing only',exact:true}).click();
 const shared=step(root,processIndex);
 await expect(shared).toHaveCount(1);await expect(shared).toHaveText('1');await expect(shared).toHaveClass(/dvd/);
 await expect(shared).toHaveClass(/shared-downstream-step/);await expect(root.locator('.shared-step-link')).toHaveCount(0);
 await expect(root.locator('.path-shared-block,.path-shared-heading,.path-shared-caption')).toHaveCount(0);
 await choose(root,'motion','Motion detected');await shared.click();await expect(shared).toHaveAttribute('data-step-path','motion');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Motion');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Button press (step 1)');
 await expect(shared).toHaveCSS('background-color','rgb(13, 148, 136)');
 await choose(root,'button','Button press');await shared.click();await expect(shared).toHaveText('1');await expect(shared).toHaveAttribute('data-step-path','button');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Button');
 await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in Motion detected (step 1)');
 await checkGeometry(root);await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('Forge renders one downstream shared run through the production bridge resource',async({page,server})=>{
 await page.addInitScript(raw=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{specJson:JSON.stringify(raw)},macro:{isConfiguring:false}}};return true;}};},raw);
 await page.goto(server.origin+'/forge/index.html');await checkShared(page.locator('#docview'));
});

test('middle shared operations split and rejoin with route state intact while offline stops early',async({page,server},testInfo)=>{
 const root=await standalone(page,server,'shared-blocks',blocksSource),d=diagram(blocksRaw);
 const indices=Object.fromEntries(d.steps.map((step,index)=>[step.id,index]));
 const readout=id=>root.locator('.pt-state[data-dv-panel="'+d.panels.findIndex(panel=>panel.id===id)+'"] .preadout');
 const log=root.locator('.pt-log'),next=root.getByRole('button',{name:'Next step',exact:true});
 await expect(root.locator('.path-timeline')).toHaveCount(1);await expect(root.locator('.path-matrix')).toHaveCount(0);
 expect(await root.locator('.path-timeline').evaluate(el=>el.offsetHeight)).toBeLessThanOrEqual(170);
 await expect(root.locator('.path-shared-block,.path-shared-heading,.path-shared-caption')).toHaveCount(0);
 for(const index of [indices.store,indices.index,indices.ready]){
  await expect(step(root,index)).toHaveCount(1);await expect(step(root,index)).toHaveClass(/shared-downstream-step/);
 }
 await expect(root.locator('.shared-step-link')).toHaveCount(0);await checkGeometry(root);
 const positions=await root.locator('.path-timeline').evaluate((timeline,indices)=>Object.fromEntries(
  ['store','index','notify','notify-recovery','ready'].map(id=>{
   const rect=timeline.querySelector('button.schip[data-step-source="'+indices[id]+'"]').getBoundingClientRect();
   return [id,{x:rect.x,y:rect.y}];
  })),indices);
 expect(positions.store.y).toBe(positions.index.y);expect(positions.ready.y).toBe(positions.store.y);
 expect(positions.notify.y).toBeLessThan(positions.store.y);expect(positions['notify-recovery'].y).toBeGreaterThan(positions.store.y);
 expect(positions.index.x).toBeLessThan(positions.notify.x);expect(positions.notify.x).toBeLessThan(positions.ready.x);
 for(const state of [
  {id:'normal',label:'First attempt',value:'First attempt',storeNumber:3,notice:'Doorbell alert',notification:'notify',ownLog:'First attempt: recording captured',otherLog:'Retry: recording captured',noticeLog:'Doorbell alert received',otherNoticeLog:'Recovery notice received',peer:'After retry (step 4)'},
  {id:'retry',label:'After retry',value:'Retried',storeNumber:4,notice:'Recovery notice',notification:'notify-recovery',ownLog:'Retry: recording captured',otherLog:'First attempt: recording captured',noticeLog:'Recovery notice received',otherNoticeLog:'Doorbell alert received',peer:'First attempt (step 3)'}
 ]){
  await choose(root,state.id,state.label);await expect(readout('route')).toHaveText('Waiting');await expect(readout('notice')).toHaveText('None');
  await step(root,indices.store).click();await expect(step(root,indices.store)).toHaveText(String(state.storeNumber));
  await expect(step(root,indices.store)).toHaveAttribute('data-step-path',state.id);await expect(step(root,indices.store)).toHaveAttribute('aria-current','true');
  await expect(readout('route')).toHaveText(state.value);await expect(readout('notice')).toHaveText('None');
  await expect(log).toContainText(state.ownLog);await expect(log).not.toContainText(state.otherLog);await expect(log).toContainText('Recording stored');
  await expect(root.locator('.step-shared-note')).toHaveText('Shared step · also in '+state.peer);
  if(state.id==='retry')await expect(log).toContainText('First attempt: recording failed');
  else await expect(log).not.toContainText('First attempt: recording failed');
  await next.click();await expect(step(root,indices.index)).toHaveAttribute('aria-current','true');await expect(step(root,indices.index)).toHaveText(String(state.storeNumber+1));
  await expect(readout('route')).toHaveText(state.value);await expect(log).toContainText('Clip indexed in event history');
  await next.click();await expect(chip(root,state.id,indices[state.notification])).toHaveAttribute('aria-current','true');
  await expect(readout('notice')).toHaveText(state.notice);await expect(root.locator('.step-shared-note')).toBeHidden();
  await next.click();await expect(step(root,indices.ready)).toHaveAttribute('aria-current','true');await expect(step(root,indices.ready)).toHaveText(String(state.storeNumber+3));
  await expect(readout('route')).toHaveText(state.value);await expect(readout('notice')).toHaveText(state.notice);
  await expect(log).toContainText(state.noticeLog);await expect(log).not.toContainText(state.otherNoticeLog);await expect(log).toContainText('Clip ready in event history');
  await expect(next).toBeDisabled();await expect(root.locator('.path-timeline-owner')).toHaveText('Following '+state.label);
 }
 await page.screenshot({path:testInfo.outputPath('shared-middle-split-rejoin.png'),fullPage:true});
 await choose(root,'offline','Device offline');await next.click();
 await expect(chip(root,'offline',indices.offline)).toHaveAttribute('aria-current','true');await expect(chip(root,'offline',indices.offline)).toHaveText('2');
 await expect(readout('route')).toHaveText('Offline');await expect(readout('notice')).toHaveText('None');
 await expect(log).toContainText('Offline: recording request not sent');await expect(log).not.toContainText('Recording stored');await expect(log).not.toContainText('Clip ready');
 await expect(root.locator('.shared-downstream-step[aria-current="true"]')).toHaveCount(0);
 await expect(root.locator('.step-shared-note')).toBeHidden();await expect(next).toBeDisabled();await expect(root.locator('.playback-status')).toHaveText('Paused · reduced motion');
});
