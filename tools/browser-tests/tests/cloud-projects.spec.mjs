import {test as base,expect} from '@playwright/test';
import {startMock} from '../../../deploy/aws/mock.mjs';
import {source} from '../fixtures/editor-spec.mjs';
const test=base.extend({
  cloud:async({},use)=>{const cloud=await startMock();try{await use(cloud);}finally{await cloud.close();}},
  context:async({context},use)=>{await context.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(error){}});await use(context);},
  audit:[async({context,cloud},use,info)=>{
    const errors=[],expected=new Set();context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    await context.route('**/*',route=>{const url=route.request().url();if(/^https?:/.test(url) && new URL(url).origin!==cloud.origin){errors.push('Outbound request '+url);return route.abort();}return route.continue();});
    context.on('response',r=>{if(r.status()>=400 && !expected.has(r.status()))errors.push(r.status()+' '+r.url());});
    await use({allow:status=>expected.add(status)});await info.attach('cloud-network-audit',{body:JSON.stringify(errors),contentType:'application/json'});expect(errors).toEqual([]);
  },{auto:true}]
});
async function panel(page){if(await page.locator('#cloud-panel').isHidden())await page.locator('#cloud-toggle').click();}
async function login(page,origin,user='alice'){await page.goto(origin);await page.locator('#cloud-mock-user').selectOption(user);await page.locator('#cloud-sign-in').click();await expect(page.locator('#cloud-account')).toContainText(user);}
async function paste(page,text=source){if(await page.locator('#cloud-panel').isVisible())await page.locator('#cloud-close').click();await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(text);await page.locator('#welcome-paste-form button[type=submit]').click();await expect(page.locator('#src')).toHaveValue(text);}
async function edit(page,text){if(await page.locator('#cloud-panel').isVisible())await page.locator('#cloud-close').click();await page.locator('#editor-tab-json').click();await page.locator('#src').fill(text);}
async function save(page,name='Shared project'){await panel(page);await page.locator('#cloud-name').fill(name);await page.locator('#cloud-save').click();await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');}
async function snapshots(cloud){return [...cloud.memory.snapshots.values()];}

test('save, autosave, reopen in a fresh context, authenticated read-only share, revision restore',async({page,browser,cloud},info)=>{
 await login(page,cloud.origin);await paste(page);await save(page);
 await expect(page.locator('#workspace-provenance')).toHaveText('No local file');await page.screenshot({path:info.outputPath('cloud-saved.png')});
 const share=await page.locator('#cloud-share').getAttribute('href');expect(share).toContain('view=read');const id=new URL(share).searchParams.get('cloud');
 const changed=source.replace('Browser contract','Online change');await edit(page,changed);await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');await expect.poll(()=>cloud.memory.revisions.size).toBe(2);
 await panel(page);await expect(page.locator('#cloud-projects button').filter({hasText:'Shared project'})).toContainText('Version 2');await expect(page.locator('#cloud-current-description')).toContainText('Version 2');await page.locator('#cloud-close').click();
 const fresh=await browser.newContext({viewport:{width:1440,height:900}});await fresh.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(error){}});const reopened=await fresh.newPage();
 await login(reopened,cloud.origin,'bob');await reopened.locator('#cloud-projects button').filter({hasText:'Shared project'}).click();await expect(reopened.locator('#src')).toHaveValue(changed);
 const reader=await fresh.newPage();await reader.goto(share);await reader.locator('#cloud-sign-in').click();await expect(reader.locator('#cloud-status')).toHaveAttribute('data-state','reader');await expect(reader.locator('#workbench-workspace')).toBeHidden();await expect(reader.frameLocator('#cloud-reader iframe').locator('body')).toContainText('Online change');
 expect(cloud.memory.revisions.size).toBe(2);await expect(reader.locator('#workbench-editor-title')).toBeVisible();await expect(reader.locator('#workbench-editor-title')).toHaveText('Shared project');const skipTour=reader.frameLocator('#cloud-reader iframe').getByRole('button',{name:'Skip tour',exact:true});if(await skipTour.isVisible())await skipTour.click();const readerHeader=await reader.locator('.workbench-header').boundingBox(),readerContent=await reader.locator('#cloud-reader').boundingBox();expect(readerContent.y).toBeGreaterThanOrEqual(readerHeader.y+readerHeader.height);await reader.screenshot({path:info.outputPath('cloud-readonly-share.png')});
 await panel(page);await page.locator('#cloud-history').click();await page.locator('#cloud-revisions').selectOption('1');await page.screenshot({path:info.outputPath('cloud-revision-history.png')});await page.locator('#cloud-restore').click();await expect(page.locator('#src')).toHaveValue(source);await expect.poll(()=>cloud.memory.revisions.size).toBe(3);await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');
 expect([...cloud.memory.projects.values()][0].projectId).toBe(id);expect((await snapshots(cloud)).at(-1).source).toBe(source);
 await panel(reader);await reader.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});await reader.locator('#cloud-sign-out').click();await expect(reader.locator('#cloud-login')).toBeVisible();await expect(reader.locator('#cloud-reader iframe')).toHaveCount(0);expect(await reader.evaluate(()=>sessionStorage.getItem('flowview-cloud-auth:local-mock'))).toBeNull();await fresh.close();
});

test('two desktop contexts conflict and preserve both drafts; save copy recovers loser',async({page,browser,cloud,audit},info)=>{
 audit.allow(409);await login(page,cloud.origin);await paste(page);await save(page);
 const second=await browser.newContext({viewport:{width:1440,height:900}});await second.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(error){}});const bob=await second.newPage();await login(bob,cloud.origin,'bob');await bob.locator('#cloud-projects button').first().click();
 const a=source.replace('Browser contract','Alice latest'),b=source.replace('Browser contract','Bob draft');await edit(page,a);await expect.poll(()=>cloud.memory.revisions.size).toBe(2);
 await edit(bob,b);await expect(bob.locator('#cloud-status')).toHaveAttribute('data-state','conflict');await expect(bob.locator('#src')).toHaveValue(b);expect((await snapshots(cloud)).at(-1).source).toBe(a);
 await panel(bob);await bob.screenshot({path:info.outputPath('cloud-conflict.png')});await bob.locator('#cloud-copy-options summary').click();await bob.locator('#cloud-copy-name').fill('Bob copy');await bob.locator('#cloud-copy').click();await expect(bob.locator('#cloud-status')).toHaveAttribute('data-state','saved');await expect.poll(()=>cloud.memory.projects.size).toBe(2);await second.close();
});

test('upload failure and uncertain commit retry preserve invalid raw drafts without duplicate revisions',async({page,cloud,audit},info)=>{
 audit.allow(503);await login(page,cloud.origin);await paste(page);await save(page);cloud.memory.faults.upload=true;
 await edit(page,'{ unfinished source');await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','failed');expect(cloud.memory.revisions.size).toBe(1);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('flowview-cloud-recovery:pilot:alice')).envelope.source)).toBe('{ unfinished source');
 await panel(page);await page.screenshot({path:info.outputPath('cloud-save-failed.png')});cloud.memory.faults.upload=false;await page.locator('#cloud-retry').click();await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');expect((await snapshots(cloud)).at(-1).source).toBe('{ unfinished source');
 await page.request.post(cloud.origin+'/__faults',{data:{ack:true}});await edit(page,'{ still unfinished');await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','failed');expect(cloud.memory.revisions.size).toBe(3);
 await panel(page);await page.locator('#cloud-retry').click();await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');expect(cloud.memory.revisions.size).toBe(3);
 const link=await page.locator('#cloud-share').getAttribute('href');await page.goto(link);await expect(page.locator('#cloud-reader')).toContainText('cannot be displayed');
});

test('new/paste detach cloud identity, stale loads cannot overwrite typing, signout retires a held save',async({page,cloud})=>{
 await login(page,cloud.origin);await paste(page);await save(page,'First');await page.locator('#cloud-copy-options summary').click();await page.locator('#cloud-copy').click();await expect.poll(()=>cloud.memory.projects.size).toBe(2);
 let release,entered;const held=new Promise(resolve=>entered=resolve);await page.route('**/objects/*',async route=>{if(route.request().method()==='GET'){entered();await new Promise(resolve=>release=resolve);}await route.continue();});
 await panel(page);await page.locator('#cloud-projects button').first().click();await held;
 const local=source.replace('Browser contract','Typed during load');await edit(page,local);const resumed=page.waitForResponse(r=>r.url().includes('/objects/') && r.request().method()==='GET');release();await resumed;await page.unroute('**/objects/*');await expect(page.locator('#src')).toHaveValue(local);
 await page.locator('#workspace-home').click();await paste(page,source.replace('Browser contract','Pasted new'));await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','detached');
 await save(page,'Third');let releaseSave,saveEntered;const waiting=new Promise(resolve=>saveEntered=resolve);await page.route('**/api/uploads',async route=>{saveEntered();await new Promise(resolve=>releaseSave=resolve);await route.continue();});
 await edit(page,source.replace('Browser contract','Pending at signout'));await waiting;await panel(page);await page.locator('#cloud-sign-out').click();const resumedSave=page.waitForResponse(r=>r.url().endsWith('/api/uploads'));releaseSave();await resumedSave;await page.unroute('**/api/uploads');await expect(page.locator('#cloud-login')).toBeVisible();await expect(page.locator('#workbench-workspace')).toBeHidden();expect(await page.locator('#src').inputValue()).not.toContain('Pending at signout');
 await page.locator('#cloud-mock-user').selectOption('bob');await page.locator('#cloud-sign-in').click();await expect(page.locator('#cloud-recover')).toBeHidden();
});

test('matching agent scratch folder retains cloud project; reviewed source and ledger autosave together through Undo/Redo',async({page,cloud})=>{
 const {cloudFolder}=await import('../helpers/cloud-folder.mjs'),folder=await cloudFolder(page);
 try{
  await login(page,cloud.origin);await paste(page);await save(page,'Agent cloud');const project=[...cloud.memory.projects.values()][0].projectId;
  await page.locator('#cloud-close').click();await page.locator('#editor-tab-file').click();await page.locator('#working-folder-open').click();await expect(page.locator('#workbench-working-status')).toContainText('Saved to');
  await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');expect(cloud.memory.projects.size).toBe(1);
  await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();
  await folder.begin('Rename Backend, preserving coverage.');const request=await folder.read('request.json'),state=await folder.read('state.json'),proposed=source.replace('"Backend"','"Cloud reviewed service"'),ledger='# Coverage\n\nRenamed service; paths preserved.\n';
  await folder.write('candidate.spec.json',proposed);await folder.write('candidate.ledger.md',ledger);folder.run('propose','--request',request.id,'--revision',state.revision,'--file','candidate.spec.json','--ledger','candidate.ledger.md','--summary','Rename Backend');
  await page.locator('#agent-update-open').click();await page.locator('#agent-update-commit').click();await expect(page.locator('#src')).toHaveValue(proposed);
  await expect.poll(()=>[...cloud.memory.snapshots.values()].at(-1)?.ledger).toBe(ledger);expect([...cloud.memory.snapshots.values()].at(-1).source).toBe(proposed);expect([...cloud.memory.projects.values()][0].projectId).toBe(project);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await expect.poll(()=>[...cloud.memory.snapshots.values()].at(-1)?.source).toBe(source);expect([...cloud.memory.snapshots.values()].at(-1).ledger).toBe('');
  await page.locator('#redo-builder').click();await expect.poll(()=>[...cloud.memory.snapshots.values()].at(-1)?.source).toBe(proposed);expect([...cloud.memory.snapshots.values()].at(-1).ledger).toBe(ledger);
  expect(cloud.memory.projects.size).toBe(1);for(const snapshot of cloud.memory.snapshots.values())expect(Object.keys(snapshot).sort()).toEqual(['ledger','source','topologyContext','version']);
 }finally{await page.close();await folder.close();}
});

test('desktop library follows pastel and terminal themes, stays inside the viewport and restores keyboard focus',async({page,cloud},info)=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(cloud.origin);
 await expect(page.locator('#cloud-panel')).toBeVisible();await page.screenshot({path:info.outputPath('cloud-pastel-signed-out.png')});
 await page.locator('#cloud-sign-in').click();await expect(page.locator('#cloud-account')).toContainText('alice');await expect(page.locator('#cloud-save')).toBeHidden();await expect(page.locator('#cloud-empty')).toBeVisible();expect(cloud.memory.projects.size).toBe(0);
 await page.screenshot({path:info.outputPath('cloud-pastel-empty-library.png')});await page.keyboard.press('Escape');await expect(page.locator('#cloud-panel')).toBeHidden();await expect(page.locator('#cloud-toggle')).toBeFocused();
 await paste(page);await panel(page);await expect(page.locator('#cloud-name')).toHaveValue('Browser contract');await page.locator('#cloud-save').click();await expect(page.locator('#cloud-status')).toHaveAttribute('data-state','saved');await page.locator('#cloud-close').click();
 // Header controls remain in layout, without covering Export or the project title.
 const toggle=await page.locator('#cloud-toggle').boundingBox(),header=await page.locator('.workbench-header').boundingBox(),exportButton=await page.locator('#workspace-export-trigger').boundingBox();
 expect(toggle.x+toggle.width).toBeLessThanOrEqual(1440);expect(toggle.y).toBeGreaterThanOrEqual(header.y);expect(exportButton.x+exportButton.width).toBeLessThanOrEqual(toggle.x);
 await page.screenshot({path:info.outputPath('cloud-pastel-editor-status.png')});await page.evaluate(()=>window.dvSetSkin('terminal'));await panel(page);
 const colors=await page.locator('#cloud-panel').evaluate(el=>({background:getComputedStyle(el).backgroundColor,bodyCard:getComputedStyle(document.body).getPropertyValue('--card').trim(),color:getComputedStyle(el).color,font:getComputedStyle(el).fontFamily}));
 expect(colors.background).not.toBe('rgb(255, 255, 255)');expect(colors.font).toContain('IBM Plex Mono');expect(colors.color).not.toBe(colors.background);
 const bounds=await page.locator('#cloud-panel').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(1440);expect(bounds.y+bounds.height).toBeLessThanOrEqual(900);
 expect(await page.locator('#cloud-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('cloud-terminal-library.png')});await page.locator('#cloud-history').click();await expect(page.locator('#cloud-revisions')).toBeFocused();await page.screenshot({path:info.outputPath('cloud-terminal-history.png')});await page.keyboard.press('Escape');await expect(page.locator('#cloud-toggle')).toBeFocused();
});

test('sign-out always retires authentication and held saves when browser recovery is unavailable',async({page,cloud},info)=>{
 await login(page,cloud.origin);await paste(page);await save(page,'Recoverable work');
 let release,entered;const waiting=new Promise(resolve=>entered=resolve);await page.route('**/api/uploads',async route=>{entered();await new Promise(resolve=>release=resolve);await route.continue();});
 const unsynced=source.replace('Browser contract','Keep this unsynced draft');await edit(page,unsynced);await waiting;
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('dv-workbench') || key.startsWith('flowview-cloud-recovery'))throw new DOMException('Full','QuotaExceededError');return set.call(this,key,value);};});
 await panel(page);await page.locator('#cloud-sign-out').click();await expect(page.locator('#cloud-login')).toBeVisible();await expect(page.locator('#cloud-message')).toContainText('signed out of this editor');await expect(page.locator('#src')).toHaveValue(unsynced);expect(await page.evaluate(()=>sessionStorage.getItem('flowview-cloud-auth:local-mock'))).toBeNull();
 const resumed=page.waitForResponse(r=>r.url().endsWith('/api/uploads'));release();await resumed;await page.unroute('**/api/uploads');expect(cloud.memory.revisions.size).toBe(1);
 await page.screenshot({path:info.outputPath('cloud-signed-out-recovery-unavailable.png')});await page.locator('#cloud-sign-in').click();await expect(page.locator('#cloud-message')).toContainText('Download a recovery copy');expect(await page.evaluate(()=>sessionStorage.getItem('flowview-cloud-auth:local-mock'))).toBeNull();
 const download=page.waitForEvent('download');await page.locator('#cloud-download').click();expect((await download).suggestedFilename()).toBe('flowview-unsynced-recovery.json');await expect(page.locator('#src')).toHaveValue(unsynced);
 await edit(page,unsynced.replace('Keep this unsynced draft','Changed after recovery download'));await panel(page);await page.locator('#cloud-sign-in').click();await expect(page.locator('#cloud-message')).toContainText('Download a recovery copy');expect(await page.evaluate(()=>sessionStorage.getItem('flowview-cloud-auth:local-mock'))).toBeNull();
});
