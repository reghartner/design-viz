import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';

// Real Chromium FileSystemDirectoryHandle/FileSystemFileHandle semantics in OPFS.
// Only the user folder picker is substituted. This does not prove native picker consent.
test('a new connection and explicit resume use native buffered filesystem handles',async({page,server})=>{
  await page.addInitScript(()=>{
    window.showDirectoryPicker=async()=>{
      const root=await navigator.storage.getDirectory();
      return root;
    };
  });
  await page.goto(server.origin+'/workbench.html');await paste(page,source);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-workflow').selectOption('embedded');await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-connection')).toHaveText('Waiting for Claude listener');
  const first=await page.evaluate(async()=>{
    const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('.flowview-agent');
    const read=async name=>JSON.parse(await(await directory.getFileHandle(name)).getFile().then(file=>file.text()));
    return {manifest:await read('session.json'),state:await read('state.json')};
  });
  expect(first.state.connectionId).toBe(first.manifest.connectionId);expect(first.state.source).toBe(source);
  await page.locator('#folder-agent-close-guide').click();await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await page.locator('#folder-agent-open-setup').click();await expect(page.locator('#folder-agent-connect')).toBeVisible();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-connection')).toHaveText('Waiting for Claude listener');
  const next=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('.flowview-agent');return JSON.parse(await(await directory.getFileHandle('session.json')).getFile().then(file=>file.text()));});
  expect(next.sessionId).toBe(first.manifest.sessionId);expect(next.connectionId).not.toBe(first.manifest.connectionId);
});
