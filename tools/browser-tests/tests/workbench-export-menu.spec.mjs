import {test,expect,pastePage} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';

const source=JSON.stringify({page:{title:'Export choices',sections:[{diagram:{nodes:{a:{title:'Start'}},rows:[['a']]}}]}},null,2);

for(const width of [1280,1800])test('Export disclosure is reachable and keyboard operable at '+width,async({page,server},info)=>{
  await page.setViewportSize({width,height:900});await page.goto(server.origin+'/workbench.html');await pastePage(page,source);
  const trigger=page.locator('#workspace-export-trigger'),menu=page.locator('#workspace-export');
  await expect(trigger).toBeInViewport();await expect(trigger).toHaveAccessibleName('Export');
  await trigger.focus();await page.keyboard.press('Enter');await expect(menu).toHaveAttribute('open','');await expect(page.locator('#file-save')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.locator('#file-save')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#file-export-html')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#file-export-both')).toBeFocused();
  for(const id of ['file-save','file-export-html','file-export-both'])await expect(page.locator('#'+id)).toBeInViewport();
  await info.attach('export-menu-'+width,{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(trigger).toBeFocused();
  await trigger.click();await page.locator('#workspace-provenance').click();await expect(menu).not.toHaveAttribute('open','');
  await trigger.click();await page.locator('#workspace-home').focus();await expect(menu).not.toHaveAttribute('open','');
  await trigger.click();await page.locator('.workspace-help>summary').click();await expect(menu).not.toHaveAttribute('open','');
  await page.locator('.workspace-help>summary').click();await expect(page.locator('.workspace-help .workspace-help-body')).toBeHidden();
  await trigger.focus();await expect(trigger).toBeFocused();await page.keyboard.press('Enter');
  // Native details toggle exposes its popover asynchronously. Wait for the choices before tabbing.
  await expect(menu).toHaveAttribute('open','');await expect(page.locator('#file-save')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.locator('#file-save')).toBeFocused();
  const download=page.waitForEvent('download');await page.keyboard.press('Enter');
  const file=await download;expect(file.suggestedFilename()).toBe('export-choices.spec.json');
  expect(JSON.parse(await readFile(await file.path(),'utf8')).page.title).toBe('Export choices');
  await expect(menu).not.toHaveAttribute('open','');await expect(trigger).toBeFocused();await expect(page.locator('#src')).toHaveValue(source);
});

test('JSON only preserves invalid source while HTML choices refuse it without downloads',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await pastePage(page,source);
  await page.locator('#editor-tab-json').click();const invalid=' { unfinished JSON\n';await page.locator('#src').fill(invalid);
  const downloads=[];page.on('download',download=>downloads.push(download));
  for(const id of ['file-export-html','file-export-both']){
    await page.locator('#workspace-export-trigger').click();await page.locator('#'+id).click();
    await expect(page.locator('#guide')).toContainText('export needs valid JSON');expect(downloads).toHaveLength(0);
    await expect(page.locator('#src')).toHaveValue(invalid);
  }
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  expect(await readFile(await(await download).path(),'utf8')).toBe(invalid);expect(downloads).toHaveLength(1);
});

test('Both falls back to two downloads without a directory picker',async({page,server})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
  await page.goto(server.origin+'/workbench.html');await pastePage(page,source);
  // The fixture has no adjacent template; serve the real built viewer at the first lookup.
  const template=await readFile(new URL('../../../template/flowview.html',import.meta.url),'utf8');
  await page.route('**/template/flowview.html',route=>route.fulfill({contentType:'text/html',body:template}));
  const downloads=[];page.on('download',download=>downloads.push(download));
  await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-both').click();
  await expect.poll(()=>downloads.length).toBe(2);
  expect(downloads.map(d=>d.suggestedFilename())).toEqual(['export-choices.spec.json','export-choices.html']);
  await expect(page.locator('#src')).toHaveValue(source);
});
