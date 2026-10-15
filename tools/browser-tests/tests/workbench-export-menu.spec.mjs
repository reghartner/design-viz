import {test,expect,pastePage} from '../helpers/test.mjs';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const source=JSON.stringify({page:{title:'Export choices',sections:[{diagram:{nodes:{a:{title:'Start'}},rows:[['a']]}}]}},null,2);
const filenames=['export-choices.spec.json','export-choices.html','export-choices.ledger.md','README.md'];

for(const width of [1280,1800])test('Export project and SVG are reachable by keyboard at '+width,async({page,server},info)=>{
  await useProjectDownloads({page});await page.setViewportSize({width,height:900});await page.goto(server.origin+'/workbench.html');await pastePage(page,source);
  const trigger=page.locator('#workspace-export-trigger'),menu=page.locator('#workspace-export');
  await expect(trigger).toBeInViewport();await trigger.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#file-save')).toHaveText('Export project');
  await expect(page.locator('#file-export-html,#file-export-both')).toHaveCount(0);
  for(const id of ['file-save','file-export-svg','file-copy-svg']){await page.keyboard.press('Tab');await expect(page.locator('#'+id)).toBeFocused();await expect(page.locator('#'+id)).toBeInViewport();}
  await info.attach('export-menu-'+width,{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(trigger).toBeFocused();
  await trigger.click();await page.locator('#workspace-provenance').click();await expect(menu).not.toHaveAttribute('open','');
  await trigger.click();await page.locator('#workspace-home').focus();await expect(menu).not.toHaveAttribute('open','');
  await trigger.focus();await page.keyboard.press('Enter');await expect(page.locator('#file-save')).toBeVisible();await page.keyboard.press('Tab');
  const download=page.waitForEvent('download');await page.keyboard.press('Enter');const file=await download;
  expect(file.suggestedFilename()).toBe('export-choices.zip');const files=await projectFiles(file);expect(Object.keys(files)).toEqual(filenames);
  expect(JSON.parse(files[filenames[0]]).page.title).toBe('Export choices');expect(files[filenames[2]]).toContain('unverified placeholder');
  await expect(menu).not.toHaveAttribute('open','');await expect(trigger).toBeFocused();await expect(page.locator('#src')).toHaveValue(source);
});

test('invalid JSON refuses complete export and explains repair without downloads',async({page,server})=>{
  await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await pastePage(page,source);
  await page.locator('#editor-tab-json').click();const invalid=' { unfinished JSON\n';await page.locator('#src').fill(invalid);
  const downloads=[];page.on('download',download=>downloads.push(download));
  await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  await expect(page.locator('#guide')).toContainText('export needs valid JSON');await expect(page.locator('#guide')).toContainText('Copy unfinished text');
  expect(downloads).toHaveLength(0);await expect(page.locator('#src')).toHaveValue(invalid);
});

test('native folder export preserves the ledger, excludes live metadata and reopens a clean project',async({page,context,server},info)=>{
  const ledger='\ufeff# Evidence\r\n\r\n- Café 🦉 — reviewed source  \r\n';
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle(window.selectedFolder || 'working',{create:true});};});
  await page.goto(server.origin+'/workbench.html');
  await page.evaluate(async({source,ledger})=>{
    const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('working',{create:true});
    for(const [name,text]of [['export-choices.spec.json',source],['export-choices.ledger.md',ledger]]){const writer=await(await dir.getFileHandle(name,{create:true})).createWritable();await writer.write(text);await writer.close();}
  },{source,ledger});
  await pastePage(page,source);
  async function connect(){
    await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();
    await page.locator('#folder-agent-setup-mode-embedded').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();
  }
  await connect();
  const originalIdentity=await page.evaluate(async()=>{const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('working'),meta=await dir.getDirectoryHandle('.flowview-agent');return (await(await meta.getFileHandle('session.json')).getFile()).text();});
  await page.evaluate(()=>window.selectedFolder='exported');
  await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();await expect(page.locator('#guide')).toContainText('Exported project:');
  const files=await page.evaluate(async()=>{
    const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('exported'),files={};
    for await(const entry of dir.values()){if(entry.kind!=='file')throw Error('Unexpected directory '+entry.name);files[entry.name]=new TextDecoder('utf-8',{ignoreBOM:true}).decode(await(await entry.getFile()).arrayBuffer());}return files;
  });
  expect(Object.keys(files).sort()).toEqual([...filenames].sort());expect(files[filenames[2]]).toBe(ledger);
  expect(files['README.md']).toContain('JSON and Markdown ledger together');expect(files['README.md']).toContain('all three project artifacts: JSON, HTML and ledger');
  expect(await page.evaluate(async()=>{const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('working'),meta=await dir.getDirectoryHandle('.flowview-agent');return (await(await meta.getFileHandle('session.json')).getFile()).text();})).toBe(originalIdentity);
  // The included reader is self-contained after source and connection access stop.
  const htmlPath=info.outputPath('export-choices.html');await writeFile(htmlPath,files[filenames[1]]);
  await context.setOffline(true);const reader=await context.newPage();await reader.goto(pathToFileURL(htmlPath).href+'#tour=0');
  await expect(reader.locator('g.node[data-dv-node="a"]')).toBeVisible();await reader.close();await context.setOffline(false);
  if(!await page.locator('#folder-agent-disconnect').isVisible())await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await connect();await expect(page.locator('#src')).toHaveValue(files[filenames[0]]);
  const reopened=await page.evaluate(async()=>{
    const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('exported'),meta=await dir.getDirectoryHandle('.flowview-agent');
    const read=async name=>JSON.parse(await(await meta.getFileHandle(name)).getFile().then(f=>f.text()));
    return {mapping:await read('project.json'),identity:await read('session.json'),state:await read('state.json'),readme:await(await dir.getFileHandle('README.md')).getFile().then(f=>f.text())};
  });
  expect(reopened.mapping).toMatchObject({spec:filenames[0],ledger:filenames[2]});expect(reopened.state.ledger).toBe(ledger);
  expect(reopened.identity.sessionId).not.toBe(JSON.parse(originalIdentity).sessionId);expect(reopened.readme).toBe(files['README.md']);
  if(!await page.locator('#folder-agent-disconnect').isVisible())await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  const recoveredDraft=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));
  expect(recoveredDraft.ledger).toBe(ledger);
  await page.locator('#workspace-home').click();await pastePage(page,source.replace('Export choices','Unrelated'));await page.evaluate(()=>{
    window.selectedFolder='unrelated';const pick=window.showDirectoryPicker;
    window.showDirectoryPicker=options=>new Promise(resolve=>{window.releaseExportPicker=()=>resolve(pick(options));});
  });
  await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();await expect(page.locator('#guide')).toContainText('Exporting project: unrelated…');
  await expect(page.locator('#guide')).not.toContainText('Exported project:');await page.evaluate(()=>window.releaseExportPicker());
  await expect(page.locator('#guide')).toContainText('Exported project: unrelated.spec.json, unrelated.html, unrelated.ledger.md, README.md');
  expect(await page.evaluate(async()=>{const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('unrelated');return (await(await dir.getFileHandle('unrelated.ledger.md')).getFile()).text();})).toContain('unverified placeholder');
});


test('browser recovery exports its saved ledger and keeps later projects independent',async({page,server})=>{
  const ledger='\ufeff# Recovered evidence\r\nUnchanged notes.  \r\n';
  await useProjectDownloads({page});
  await page.addInitScript(({source,ledger})=>{
    localStorage.setItem('dv-workbench-draft',JSON.stringify({text:source,ledger,at:Date.now()}));
    localStorage.setItem('dv-workbench-baseline',JSON.stringify({text:source,draftText:source}));
  },{source,ledger});
  await page.goto(server.origin+'/workbench.html');
  if(await page.locator('#welcome-resume').isVisible())await page.locator('#welcome-resume').click();
  await expect(page.locator('#src')).toHaveValue(source);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await download);expect(files[filenames[2]]).toBe(ledger);
});
