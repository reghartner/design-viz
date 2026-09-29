import {test,expect,pastePage as paste} from '../helpers/test.mjs';

const spec={page:{title:'Authoring actions',sections:[{heading:'Example',diagram:{view:'step',autoplay:false,
  nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{text:'First',nodes:['a']},{text:'Second',nodes:['b']}]}}]}};

test('clipboard actions reflect capabilities, retain targetless Paste and duplicate a step with one Undo',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));
  const copy=page.locator('#object-copy'),duplicate=page.locator('#object-duplicate'),pasteButton=page.locator('#object-paste');
  await expect(copy).toBeDisabled();await expect(duplicate).toBeDisabled();await expect(pasteButton).toBeEnabled();
  await expect(pasteButton).toHaveText('Paste into Section 1…');await pasteButton.click();await expect(page.locator('#object-clipboard')).toBeVisible();await page.locator('#object-clipboard-cancel').click();
  await page.locator('#docview [data-dv-node="a"]').click();await expect(copy).toBeEnabled();await expect(duplicate).toBeEnabled();
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
  await expect(copy).toBeDisabled();await expect(duplicate).toBeEnabled();await expect(page.locator('#guide').getByRole('button',{name:'duplicate step',exact:true})).toHaveCount(0);
  const before=await page.locator('#src').inputValue();await duplicate.click();
  expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.steps).toHaveLength(3);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await expect(copy).toBeDisabled();await expect(duplicate).toBeDisabled();
});

test('Download JSON is explicit and browser recovery reports a real write failure and recovery',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));
  await expect(page.locator('#file-save')).toHaveText('Download JSON');
  await page.locator('#editor-tab-file').click();await expect(page.locator('#workbench-recovery-status')).toHaveText('Draft saved in this browser');
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='dv-workbench-draft')throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
  await page.locator('#editor-tab-json').click();const source=page.locator('#src'),before=await source.inputValue();await source.fill(before+' ');
  await page.locator('#editor-tab-file').click();await expect(page.locator('#workbench-recovery-status')).toContainText('Browser recovery unavailable');
  await page.evaluate(()=>window.restoreStorage());await page.locator('#editor-tab-json').click();await source.fill(before+'\n');
  await page.locator('#editor-tab-file').click();await expect(page.locator('#workbench-recovery-status')).toHaveText('Draft saved in this browser');
  const download=page.waitForEvent('download');await page.locator('#file-save').click();expect((await download).suggestedFilename()).toMatch(/\.json$/);
});
