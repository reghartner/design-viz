/* #1276 desktop Workbench: File → Open file, then Build with my agent → Update this diagram →
   pick the diagram's folder connects on the first attempt (no reload).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| A1 | After Open file, Update this diagram on the same folder reaches the agent step: Copy setup instructions is enabled and the folder holds the session files. | real-disk agent folder fixture (helpers/folder-agent.mjs) with story.spec.json; Open file returns that file's handle | `#folder-agent-copy` enabled; `.flowview-agent/session.json` written; no page errors | a first-attempt hang that only a reload clears |
*/
import {test,expect} from '@playwright/test';
import {writeFile,readFile,readdir} from 'node:fs/promises';
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
