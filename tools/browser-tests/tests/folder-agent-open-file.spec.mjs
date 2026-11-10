/* #1276 desktop Workbench: File → Open file, then Build with my agent → Update this diagram →
   pick the diagram's folder connects on the first attempt (no reload).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| A2 | A project change while the folder connection is in flight (the route the agent panel's 350 ms project check takes) never leaves the panel on a progress status: the superseded connection ends with a status that says what happened, and Connect is usable again. | same fixture; the session.json write is held; the editor's loadText replaces the project meanwhile | final status does not end in "…"; `#folder-agent-connect` enabled; no session claimed | a token-guard return that silently leaves "Opening …" on screen |
| A1 | After Open file, Update this diagram on the same folder reaches the agent step: Copy setup instructions is enabled and the folder holds the session files. | real-disk agent folder fixture (helpers/folder-agent.mjs) with story.spec.json; Open file returns that file's handle | `#folder-agent-copy` enabled; `.flowview-agent/session.json` written; no page errors | a first-attempt hang that only a reload clears |
*/
import {test,expect} from '@playwright/test';
import {writeFile,readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {source} from '../fixtures/editor-spec.mjs';
import {setup,openAgent,closeGuide} from '../helpers/folder-agent.mjs';

test('A1 desktop Open file then Update this diagram connects the same folder on the first attempt',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  // Open file returns a handle to the diagram inside the folder the agent will pick (same fake disk).
  await page.addInitScript(()=>{
    window.showOpenFilePicker=async()=>{const dir=await window.showDirectoryPicker();window.pickerCalls--;return [await dir.getFileHandle('story.spec.json')];};
  });
  const h=await setup(page);
  try{
    await writeFile(path.join(h.folder,'story.spec.json'),source);
    await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);
    await openAgent(page);await page.locator('#folder-agent-open-setup').click();
    await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
    const copy=page.locator('#folder-agent-copy');
    // The status names the step a hang stops at.
    await expect.poll(async()=>await copy.isEnabled()?'ready':'status: '+await page.locator('#folder-agent-status').textContent()+' | stage: '+await page.locator('#folder-agent-guide-title').textContent()+' | files: '+(await readdir(h.folder)).join(','),
      {message:'the first attempt reaches the agent step',timeout:15000}).toBe('ready');
    expect(JSON.parse(await readFile(path.join(h.folder,'.flowview-agent','session.json'),'utf8')).protocol).toBe('flowview-folder-v1');
    await closeGuide(page);await expect(page.locator('#src')).toHaveValue(source);
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});

test('A2 desktop a project change during the folder connection leaves a status, never a stuck progress message',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(()=>{
    window.showOpenFilePicker=async()=>{const dir=await window.showDirectoryPicker();window.pickerCalls--;return [await dir.getFileHandle('story.spec.json')];};
  });
  const h=await setup(page);
  try{
    // The editor test host exposes loadText, the same project replacement the panel's project check reacts to.
    const lifetime=path.join(process.env.FLOWVIEW_BROWSER_ROOT,'lifetime','index.html');
    await page.route(url=>new URL(url).pathname==='/index.html',async route=>route.fulfill({contentType:'text/html',body:await readFile(lifetime,'utf8')}));
    await page.reload();
    await writeFile(path.join(h.folder,'story.spec.json'),source);
    await page.locator('#welcome-open').click();await expect(page.locator('#src')).toHaveValue(source);
    let release,reached=false;const held=new Promise(resolve=>release=resolve);
    h.writeGate(async name=>{if(name==='session.json' && !reached){reached=true;await held;}});
    await openAgent(page);await page.locator('#folder-agent-open-setup').click();
    await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
    await expect.poll(()=>reached,{message:'the connection reached its session claim'}).toBe(true);
    const status=page.locator('#folder-agent-status');await expect(status).toHaveText(/…\s*$/);
    await page.evaluate(text=>window.__editorTest.builder.loadText(text),source.replace('Browser contract','Changed during connection'));
    await page.waitForTimeout(800);release();
    await expect.poll(async()=>(await status.textContent()).trim(),{message:'the superseded connection leaves a status',timeout:8000}).not.toMatch(/…$/);
    await expect(page.locator('#folder-agent-connect')).toBeEnabled();
    expect(h.errors).toEqual([]);
  }finally{await page.close();await h.cleanup();}
});
