import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
function story(title,explore=false){const raw=editorSpec();raw.page.title=title;if(explore)raw.page.blocks[0].diagram.layouts[0].presentation='explore';return JSON.stringify(raw,null,2)+'\n';}
async function save(page,name){await page.locator('#checkpoint-name').fill(name);await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();}
async function edit(page,text){await page.locator('#editor-tab-json').click();await page.locator('#src').fill(text);}

test('History previews independently and restores exact source as one Undo action',async({page,server})=>{
  const source=story('Original checkpoint');await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const baseline=await page.evaluate(()=>localStorage.getItem('dv-workbench-baseline'));
  await page.locator('#open-history').click();await save(page,'Before redesign');
  await expect(page.locator('.checkpoint-view .doc-sec').first()).toBeVisible();await expect(page.getByRole('button',{name:'Restore checkpoint',exact:true})).toBeDisabled();
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();expect(await page.locator('#docview').count()).toBe(0);
  await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('#docview')).toHaveCount(1);await expect(page.locator('#open-history')).toBeFocused();
  const current=story('Changed title');await edit(page,current);await page.locator('#open-history').click();await page.locator('.checkpoint-row').click();
  await expect(page.locator('.checkpoint-info')).toContainText('structural change');await page.getByLabel('Rename checkpoint',{exact:true}).fill('Before edits');await page.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(page.locator('#src')).toHaveValue(current);await page.keyboard.press('Escape');await expect(page.locator('#docview')).toHaveCount(1);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#open-history').click();await page.locator('.checkpoint-row').filter({hasText:'Before edits'}).click();await page.getByRole('button',{name:'Restore checkpoint',exact:true}).click();
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#docview')).toHaveCount(1);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(current);
  await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('dv-workbench-baseline'))).text).toBe(JSON.parse(baseline).text);
  await page.locator('#workspace-export-trigger').click();const download=page.waitForEvent('download');await page.locator('#file-save').click();const file=await download;const chunks=[];
  for await(const chunk of await file.createReadStream())chunks.push(chunk);const exported=Buffer.concat(chunks).toString();
  expect(JSON.parse(exported).page.title).toBe('Original checkpoint');expect(exported).not.toContain('checkpoints');expect(exported).not.toContain('Before edits');
});

test('invalid checkpoint survives recovery, project archive, restore and explicit deletion',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,story('Start'));await edit(page,' \n{ unfinished checkpoint');const exact=await page.locator('#src').inputValue();
  await page.locator('#open-history').click();await save(page,'Unfinished');await expect(page.locator('.checkpoint-view')).toContainText('No visual preview:');
  await save(page,'unfinished');await expect(page.locator('.checkpoint-status')).toContainText('already has that name');await expect(page.locator('.checkpoint-row')).toHaveCount(1);
  await page.keyboard.press('Escape');await page.reload();await expect(page.locator('#src')).toHaveValue(exact);
  await page.locator('#open-history').click();await expect(page.locator('.checkpoint-row')).toContainText('Unfinished');await page.keyboard.press('Escape');
  const next=story('Second project');await page.locator('#file-input').setInputFiles({name:'next.json',mimeType:'application/json',buffer:Buffer.from(next)});
  await expect(page.locator('#src')).toHaveValue(next);await page.locator('#open-history').click();await expect(page.locator('.checkpoint-row')).toHaveCount(0);await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts'))[0].checkpoints[0].text)).toBe(exact);
  await edit(page,exact);await page.locator('#open-history').click();await save(page,'Unfinished again');await page.keyboard.press('Escape');await edit(page,next);
  await page.locator('#open-history').click();await page.locator('.checkpoint-row').click();await page.getByRole('button',{name:'Restore checkpoint',exact:true}).click();await expect(page.locator('#src')).toHaveValue(exact);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(next);
  await page.locator('#open-history').click();await page.locator('.checkpoint-row').click();await page.getByRole('button',{name:'Delete checkpoint…',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.checkpoint-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Delete checkpoint…',exact:true}).click();await page.getByRole('button',{name:'Confirm delete',exact:true}).click();await expect(page.locator('.checkpoint-row')).toHaveCount(0);
});

test('repeated Explore preview and Escape dispose reader DOM and keep authoring operable',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,story('Preview lifecycle',true));await page.locator('#open-history').click();await save(page,'First');
  await expect(page.locator('.checkpoint-surface')).toHaveClass(/viewer-exploring/);await page.screenshot({path:testInfo.outputPath('history-explore.png')});await page.keyboard.press('Escape');
  for(let i=0;i<3;i++){await page.locator('#open-history').click();await page.locator('.checkpoint-row').click();await expect(page.locator('.checkpoint-view .doc-sec').first()).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#docview')).toHaveCount(1);await expect(page.locator('.checkpoint-view')).toBeEmpty();}
  await edit(page,story('Still editable'));await page.locator('#go').click();await expect(page.locator('#docview')).toContainText('Still editable');
});
