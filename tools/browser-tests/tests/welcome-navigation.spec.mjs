import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';
import {pathToFileURL} from 'node:url';

const home=page=>page.locator('#welcome-home');
const editor=page=>page.locator('#workbench-workspace');
const screen=(page,name)=>page.locator('#welcome-'+name+'-screen');

test('browser navigation follows entry screens, retains unfinished input and can leave the app',async({page,server})=>{
  await page.route('**/previous.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Previous page</h1>'}));
  await page.addInitScript(()=>history.replaceState({...history.state,hostMarker:'preserved'},'',location.href));
  await page.goto(server.origin+'/previous.html');
  await page.goto(server.origin+'/workbench.html?layout=backstage#host-fragment');
  await expect(home(page)).toBeVisible();
  await page.locator('#welcome-new').click();await expect(screen(page,'new')).toBeVisible();
  await page.locator('#welcome-new-agent').click();await expect(screen(page,'agent')).toBeVisible();
  await page.locator('#welcome-brief').fill('Private draft: compare the recording paths');
  await page.locator('#welcome-agent-paste').click();
  await page.locator('#welcome-json').fill('{"unfinished":');
  const length=await page.evaluate(()=>history.length);
  await page.locator('#welcome-paste-form button[type=submit]').click();
  await expect(page.locator('#welcome-paste-error')).toBeVisible();
  expect(await page.evaluate(()=>history.length)).toBe(length);
  await page.goBack();await expect(screen(page,'agent')).toBeVisible();
  await expect(page.locator('#welcome-brief')).toHaveValue('Private draft: compare the recording paths');
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goForward();await expect(screen(page,'new')).toBeVisible();
  await page.goForward();await expect(screen(page,'agent')).toBeVisible();
  await page.goForward();await expect(screen(page,'paste')).toBeVisible();
  await expect(page.locator('#welcome-json')).toHaveValue('{"unfinished":');
  const state=await page.evaluate(()=>({length:history.length,state:history.state,url:location.href}));
  expect(state.length).toBe(length);expect(state.state.hostMarker).toBe('preserved');
  expect(new URL(state.url).searchParams.get('layout')).toBe('backstage');
  expect(new URL(state.url).hash).toBe('#host-fragment');
  expect(JSON.stringify(state.state)+state.url).not.toContain('Private draft');
  expect(JSON.stringify(state.state)+state.url).not.toContain('unfinished');
  await page.goBack();await expect(screen(page,'agent')).toBeVisible();
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goBack();await expect(page.getByRole('heading',{name:'Previous page'})).toBeVisible();
});

test('Back and Forward preserve edited source and Undo; editor reload restores an unfinished draft',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('[data-dv-node="a"]').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});
  await title.fill('Retained camera');await title.press('Enter');
  const edited=source.replace('"title": "Doorbell"','"title": "Retained camera"');
  const src=page.locator('#src');await expect(src).toHaveValue(edited);
  await page.locator('#editor-tab-json').click();const unfinished=edited+'\n  {';
  await src.fill(unfinished);
  await page.goBack();await expect(screen(page,'paste')).toBeVisible();
  await expect(page.locator('#welcome-json')).toHaveValue(source);await expect(src).toHaveValue(unfinished);
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goForward();await expect(screen(page,'paste')).toBeVisible();
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(unfinished);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(unfinished);
  await page.locator('#workspace-home').click();await expect(home(page)).toBeVisible();
  await page.goBack();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(unfinished);
  await page.waitForFunction(text=>JSON.parse(localStorage.getItem('dv-workbench-draft'))?.text===text,unfinished);
  await page.reload();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(unfinished);
});

test('template navigation returns to the picker and Forward retains the same project',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();
  await expect(editor(page)).toBeVisible();
  await page.locator('#editor-tab-json').click();
  const src=page.locator('#src'),initial=await src.inputValue();
  const changed=initial.replace('Untitled project','My retained project');await src.fill(changed);
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(changed);
  await page.waitForFunction(text=>JSON.parse(localStorage.getItem('dv-workbench-draft'))?.text===text,changed);
  await page.locator('#workspace-home').click();await page.locator('#welcome-agent').click();
  await page.reload();await expect(screen(page,'agent')).toBeVisible();
  await page.locator('[data-welcome-back]:visible').click();await expect(home(page)).toBeVisible();
  await page.locator('#welcome-resume').click();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(changed);
});

test('browser Back retires pending welcome and editor file reads',async({page,server})=>{
  await page.addInitScript(()=>{
    const Native=FileReader;
    window.FileReader=class extends Native{
      get result(){return this.heldText===undefined?super.result:this.heldText;}
      readAsText(file,...args){if(file.name!=='pending.json')return super.readAsText(file,...args);window.__heldRead=this;this.pendingText=file.text();}
    };
    window.__releaseRead=async()=>{const reader=window.__heldRead;reader.heldText=await reader.pendingText;reader.onload?.(new ProgressEvent('load'));};
  });
  const file={name:'pending.json',mimeType:'application/json',buffer:Buffer.from(source.replace('Browser contract','STALE FILE'))};
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-paste').click();
  await page.locator('#welcome-file').setInputFiles(file);await page.waitForFunction(()=>!!window.__heldRead);
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.evaluate(()=>__releaseRead());await expect(home(page)).toBeVisible();
  await paste(page,source);await page.evaluate(()=>{window.__heldRead=null;});
  await page.locator('#file-input').setInputFiles(file);await page.waitForFunction(()=>!!window.__heldRead);
  await page.goBack();await expect(screen(page,'paste')).toBeVisible();
  await page.evaluate(()=>__releaseRead());await expect(screen(page,'paste')).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(source);
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(source);
});

test('canonical entry has no duplicate stop and older entries cannot resurrect detached review URLs',async({page,server})=>{
  let loads=0;
  await page.route('**/api/canon/context?*',route=>{
    loads++;return route.fulfill({json:{catalog:{version:1,services:[]},spec:JSON.parse(source),revision:'canonical-revision',simulated:true}});
  });
  await page.route('**/previous.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Previous page</h1>'}));
  await page.goto(server.origin+'/previous.html');const previousLength=await page.evaluate(()=>history.length);
  await page.goto(server.origin+'/workbench.html?canon=doorbell&review=123&layout=backstage#host-fragment');
  await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(JSON.stringify(JSON.parse(source),null,2));
  expect(await page.evaluate(()=>history.length)).toBe(previousLength+1);
  await page.locator('#workspace-home').click();const replacement=source.replace('Browser contract','Local replacement');
  await paste(page,replacement);
  for(const target of [screen(page,'paste'),home(page),editor(page)]){
    await page.goBack();await expect(target).toBeVisible();await expect(page.locator('#src')).toHaveValue(replacement);
    const url=new URL(page.url());expect(url.searchParams.has('canon')).toBe(false);expect(url.searchParams.has('review')).toBe(false);
    expect(url.searchParams.get('layout')).toBe('backstage');expect(url.hash).toBe('#host-fragment');
  }
  await page.reload();await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(replacement);
  expect(loads).toBe(1);
});

test('a late canonical response does not reopen the editor after navigating away',async({page,server})=>{
  let pending;
  await page.route('**/api/canon/context?*',route=>{pending=route;});
  await page.goto(server.origin+'/workbench.html?canon=doorbell');
  await expect(editor(page)).toBeVisible();await expect.poll(()=>!!pending).toBe(true);
  await page.locator('#workspace-home').click();await page.locator('#welcome-paste').click();
  await page.locator('#welcome-json').fill('{"unfinished":');
  const length=await page.evaluate(()=>history.length);
  await pending.fulfill({json:{catalog:{version:1,services:[]},spec:JSON.parse(source),revision:'canonical-revision',simulated:true}});
  await expect(page.locator('.canon-tools [role="status"]').first()).toHaveText('SIMULATED · doorbell · changes are submitted for review.');
  await expect(screen(page,'paste')).toBeVisible();await expect(page.locator('#welcome-json')).toHaveValue('{"unfinished":');
  expect(await page.evaluate(()=>history.length)).toBe(length);
});

test('downloaded workbench files support Back and Forward without a server',async({page,server})=>{
  await page.goto(pathToFileURL(server.root+'/workbench.html').href);
  await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();
  await expect(editor(page)).toBeVisible();const original=await page.locator('#src').inputValue();
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goForward();await expect(screen(page,'new')).toBeVisible();
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(original);
});
