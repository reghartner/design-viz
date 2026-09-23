import {readFile} from 'node:fs/promises';
import {test,expect,paste} from '../helpers/test.mjs';

const spec={page:{title:'Independent domains',sections:[{id:'overview',heading:'Overview',diagram:{
  nodes:{outside:{title:'Caller'},a:{title:'Validate'},b:{title:'Store'},end:{title:'Receiver'}},
  rows:[['outside','a','b','end']],edges:[{from:'outside',to:'a'},{from:'a',to:'b'},{from:'b',to:'end'}],
  panels:[{id:'state',type:'state'}],autoplay:false,
  steps:[{id:'enter',text:'Receive',edge:'outside->a'},{id:'inside',text:'Process',edge:'a->b',panels:{state:{state:'READY'}}},{id:'leave',text:'Return',edge:'b->end'}],
  paths:[{id:'happy',label:'Happy',steps:['enter','inside','leave']},{id:'alternate',label:'Alternate',steps:['enter','leave']}]
}}]}};
const source=JSON.stringify(spec,null,2);
async function start(page,server){
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#section-overview [data-dv-node="a"]').click();
  await page.locator('#section-overview [data-dv-node="b"]').click({modifiers:['Shift']});
  await page.getByRole('button',{name:'Create domain from selected nodes',exact:true}).click();
  await expect(page.locator('.extraction-preview')).toBeVisible();
}

test('branched parent extraction previews changes, keeps an independent child and undoes once',async({page,server},testInfo)=>{
  await start(page,server);const preview=page.locator('.extraction-preview'),src=page.locator('#src');
  const undoWasDisabled=await page.locator('#undo-builder').isDisabled();
  await expect(preview.getByRole('combobox',{name:'Destination',exact:true})).toHaveValue('local');
  await preview.getByLabel('Domain title').fill('Orders');
  await expect(src).toHaveValue(source);expect(await page.locator('#undo-builder').isDisabled()).toBe(undoWasDisabled);
  await expect(preview.locator('.extraction-report')).toContainText('outside->a');
  await expect(preview.locator('.extraction-report')).toContainText('0 child steps');
  await page.screenshot({path:testInfo.outputPath('extraction-local.png')});
  await preview.getByRole('button',{name:'Apply extraction',exact:true}).click();
  const result=JSON.parse(await src.inputValue()),parent=result.page.sections[0].diagram,child=result.page.sections[1].diagram;
  expect(parent.paths).toEqual(spec.page.sections[0].diagram.paths);expect(parent.panels).toEqual(spec.page.sections[0].diagram.panels);
  expect(parent.nodes.domain1.detail).toEqual({section:result.page.sections[1].id,mode:'focus'});
  expect(child.steps).toEqual([]);expect(child.paths).toBeUndefined();expect(child.initial).toBeUndefined();
  // The authored parent node body continues to select its inspector.
  await page.locator('#section-overview [data-dv-node="domain1"]').click();
  await expect(page.locator('#guide').getByLabel('title',{exact:true})).toHaveValue('Orders');
  const extracted=await src.inputValue();await page.locator('#undo-builder').click();await expect(src).toHaveValue(source);
  expect(await page.locator('#undo-builder').isDisabled()).toBe(undoWasDisabled);await page.locator('#redo-builder').click();await expect(src).toHaveValue(extracted);
});

test('separate document downloads before Apply, remains usable at phone width and cancels by keyboard',async({page,server},testInfo)=>{
  await start(page,server);await page.setViewportSize({width:390,height:844});
  const preview=page.locator('.extraction-preview'),src=page.locator('#src');
  await preview.getByLabel('Domain title').fill('Orders');
  await preview.getByRole('combobox',{name:'Destination',exact:true}).selectOption('external');
  await preview.getByLabel('Spec ID',{exact:true}).fill('approved-orders');
  await preview.getByLabel('Section ID',{exact:true}).fill('orders');
  await expect(preview.getByRole('button',{name:'Apply extraction',exact:true})).toBeDisabled();
  const pending=page.waitForEvent('download');await preview.getByRole('button',{name:'Download destination JSON',exact:true}).click();
  const downloaded=await pending;expect(downloaded.suggestedFilename()).toBe('orders.spec.json');
  const draft=JSON.parse(await readFile(await downloaded.path(),'utf8'));
  expect(draft.page.sections[0].id).toBe('orders');expect(draft.page.sections[0].diagram.steps).toEqual([]);
  await expect(src).toHaveValue(source);await expect(preview.getByRole('button',{name:'Apply extraction',exact:true})).toBeEnabled();
  expect(await preview.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('extraction-external-phone.png')});
  await preview.getByLabel('Domain title').fill('Revised orders');
  await expect(preview.getByRole('button',{name:'Apply extraction',exact:true})).toBeDisabled();
  await preview.getByLabel('Domain title').press('Escape');await expect(preview).toHaveCount(0);await expect(src).toHaveValue(source);
  await page.getByRole('button',{name:'Create domain from selected nodes',exact:true}).click();
  await expect(page.locator('.extraction-preview')).toBeVisible();
  await preview.getByRole('combobox',{name:'Destination',exact:true}).selectOption('external');
  await preview.getByLabel('Spec ID',{exact:true}).fill('approved-orders');
  const again=page.waitForEvent('download');await preview.getByRole('button',{name:'Download destination JSON',exact:true}).click();await again;
  await preview.getByRole('button',{name:'Apply extraction',exact:true}).click();
  const result=JSON.parse(await src.inputValue());expect(result.page.sections).toHaveLength(1);
  expect(result.page.sections[0].diagram.nodes.domain1.handoff).toEqual({spec:'approved-orders',section:'domain1-detail'});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(source);
});

test('an extracted child opens empty and later plays its own steps independently of the parent path',async({page,server})=>{
  await start(page,server);await page.getByRole('button',{name:'Apply extraction',exact:true}).click();
  const parent=page.locator('#section-overview'),detail=page.locator('[data-dv-detail-preview]:visible'),src=page.locator('#src');
  await parent.locator('[data-dv-detail="domain1"]').click();await expect(detail.locator('.schip')).toHaveCount(0);
  await detail.locator('.detail-breadcrumb button').first().click();
  const authored=JSON.parse(await src.inputValue());
  authored.page.sections[1].diagram.view='step';
  authored.page.sections[1].diagram.steps=[{id:'own-first',text:'Child first beat',nodes:['a']},{id:'own-last',text:'Child second beat',nodes:['b']}];
  const text=JSON.stringify(authored,null,2);
  await page.getByRole('tab',{name:'JSON',exact:true}).click();await src.fill(text);await page.locator('#go').click();
  await parent.getByRole('button',{name:'STEP',exact:true}).click();
  await parent.locator('.schip[data-step-path="alternate"][data-step-source="2"]').click();
  const caption=await parent.locator('.stepline').innerText();
  await expect(parent.locator('[data-dv-path="alternate"]')).toHaveAttribute('aria-pressed','true');
  await parent.locator('[data-dv-detail="domain1"]').click();
  await expect(detail.locator('.schip')).toHaveCount(2);await expect(detail.locator('.stepline')).toContainText('Child first beat');
  await detail.locator('.schip').nth(1).click();await expect(detail.locator('.stepline')).toContainText('Child second beat');
  await detail.locator('.detail-breadcrumb button').first().click();
  await expect(parent.locator('[data-dv-path="alternate"]')).toHaveAttribute('aria-pressed','true');
  await expect(parent.locator('.stepline')).toHaveText(caption,{useInnerText:true});await expect(src).toHaveValue(text);
});
