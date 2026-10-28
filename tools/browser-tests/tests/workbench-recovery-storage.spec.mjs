import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';
import {readFile} from 'node:fs/promises';

// recoveryBytesLabel prints whole KB below 1 MB and one decimal above it.
const size=String.raw`\d+(?:\.\d)? (?:KB|MB)`;

// Two large earlier drafts: the realistic hog of the per-site Web Storage quota (#406).
const earlier=[
  {text:'{"page":{"title":"Big earlier A","blocks":[]}}'+' '.repeat(300000),at:1},
  {text:'{"page":{"title":"Big earlier B","blocks":[]}}'+' '.repeat(300000),at:2}
];

test('a full browser offers one-click cleanup beside the recovery status and saves the draft again',async({page,server})=>{
  await page.addInitScript(entries=>{
    localStorage.setItem('dv-workbench-earlier-drafts',JSON.stringify(entries));
    // Simulate the per-site quota: every Web Storage write beyond the seeded data plus a small margin fails.
    let base=0;for(let i=0;i<localStorage.length;i++)base+=localStorage.getItem(localStorage.key(i)).length;
    const limit=base+1500,original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      let used=0;for(let i=0;i<this.length;i++){const k=this.key(i);if(k!==key)used+=this.getItem(k).length;}
      if(used+String(value).length>limit)throw new DOMException('Quota exceeded','QuotaExceededError');
      return original.call(this,key,value);
    };
  },earlier);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#editor-tab-file').click();
  const status=page.locator('#workbench-recovery-status'),cleanup=page.locator('#workbench-recovery-cleanup');
  await expect(status).toContainText('Browser recovery unavailable');
  await expect(cleanup).toBeVisible();
  await cleanup.click();
  await expect(status).toContainText('Draft saved in this browser');
  await expect(status).toContainText(new RegExp(String.raw`Draft saved in this browser · Freed about ${size} of Flowview recovery data\.`));
  await expect(cleanup).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-earlier-drafts'))).toBeNull();
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).text).toBe(source);
  expect(await page.evaluate(()=>localStorage.getItem('dv_tour_v1'))).toBe('done');
});

test('Home lists earlier drafts with export and delete, reports Flowview storage use, and frees it without touching other site data or the current draft',async({page,server})=>{
  const current='{"page":{"title":"Current unsaved","blocks":[]}}';
  await page.addInitScript(({entries,current})=>{
    // Init scripts run again on reload; seed once so the final reload shows the emptied store.
    if(sessionStorage.getItem('dv-test-seeded'))return;sessionStorage.setItem('dv-test-seeded','1');
    localStorage.setItem('dv-workbench-earlier-drafts',JSON.stringify(entries));
    localStorage.setItem('dv-workbench-draft',JSON.stringify({text:current,at:3}));
    localStorage.setItem('host-preference','kept');
  },{entries:earlier,current});
  await page.goto(server.origin+'/workbench.html');
  await expect(page.locator('#welcome-resume')).toBeVisible();
  await page.locator('#welcome-earlier-drafts>summary').click();
  const entries=page.locator('.welcome-earlier-entry'),usage=page.locator('#welcome-recovery-storage'),result=page.locator('#welcome-recovery-result');
  await expect(entries).toHaveCount(2);
  await expect(usage).toContainText(new RegExp(String.raw`about ${size} · 2 earlier drafts \(${size}\) · current draft \(${size}\)`));
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Big earlier A'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('flowview-earlier-draft-big-earlier-a.spec.json');
  expect(await readFile(await download.path(),'utf8')).toBe(earlier[0].text);
  await page.getByRole('button',{name:'Delete Big earlier A'}).click();
  await expect(entries).toHaveCount(1);
  await expect(result).toContainText(new RegExp(String.raw`Removed “Big earlier A” and freed about ${size}\.`));
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')))).map(entry=>entry.text)).toEqual([earlier[1].text]);
  await page.locator('#welcome-recovery-cleanup').click();
  await expect(result).toContainText(new RegExp(String.raw`Freed about ${size} by removing 1 earlier draft\. The current draft was kept\.`));
  await expect(entries).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-earlier-drafts'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('host-preference'))).toBe('kept');
  await expect(page.locator('#welcome-resume')).toBeVisible();
  // The current draft goes only through the in-page confirmation.
  const confirm=page.locator('#welcome-recovery-confirm');
  await page.locator('#welcome-recovery-draft').click();
  await expect(confirm).toBeVisible();await expect(confirm).toContainText('Current unsaved');
  await page.locator('#welcome-recovery-confirm-keep').click();
  await expect(confirm).toBeHidden();
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).text).toBe(current);
  await page.locator('#welcome-recovery-draft').click();
  const keep=page.waitForEvent('download');await page.locator('#welcome-recovery-confirm-download').click();
  expect(await readFile(await (await keep).path(),'utf8')).toBe(current);
  await page.locator('#welcome-recovery-confirm-remove').click();
  await expect(result).toContainText(new RegExp(String.raw`Removed the current browser draft and freed about ${size}\.`));
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-baseline'))).toBeNull();
  await expect(page.locator('#welcome-resume')).toBeHidden();
  await expect(page.locator('#welcome-recovery-draft')).toBeHidden();
  await page.reload();await expect(page.locator('#welcome-home')).toBeVisible();
  expect(await page.evaluate(()=>['dv-workbench-draft','dv-workbench-baseline','dv-workbench-earlier-drafts'].map(key=>localStorage.getItem(key)))).toEqual([null,null,null]);
  await expect(page.locator('#welcome-resume')).toBeHidden();
  await expect(page.locator('#welcome-earlier-drafts')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('host-preference'))).toBe('kept');
});
