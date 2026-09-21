import {test,expect,paste} from '../helpers/test.mjs';

const serviceRef='component:default/recording';
const catalog={version:1,services:[
  {entityRef:serviceRef,title:'Recording service',apis:[{entityRef:'api:default/recording',operations:[{operationId:'record'}]}]},
  {entityRef:'component:default/notifications',title:'Notifications',apis:[]},
]};
const spec=()=>({page:{title:'Service choices',blocks:[{heading:'Services',diagram:{
  nodes:{a:{},b:{title:'Authored name'}},rows:[['a','b']],edges:[],
}}]}});

test('catalog selection seeds an empty title, preserves authored names, and undoes as one edit',async({page,server})=>{
  await page.route('**/catalog.json',route=>route.fulfill({json:catalog}));
  await page.goto(server.origin+'/workbench.html');
  const original=JSON.stringify(spec(),null,2);await paste(page,original);
  await expect(page.locator('.canon-catalog-status')).toHaveText('2 services · bundled catalog. Select a node to bind it.');
  const src=page.locator('#src'),guide=page.locator('#guide');
  const nodes=async()=>JSON.parse(await src.inputValue()).page.blocks[0].diagram.nodes;
  await page.locator('[data-dv-node="a"]').click();
  await guide.getByRole('combobox',{name:'Company service',exact:true}).selectOption(serviceRef);
  await expect(guide.getByLabel('title',{exact:true})).toHaveValue('Recording service');
  expect((await nodes()).a.binding.entityRef).toBe(serviceRef);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
  await page.locator('#redo-builder').click();
  expect((await nodes()).a.title).toBe('Recording service');
  expect((await nodes()).a.binding.entityRef).toBe(serviceRef);
  // API selection must not refill a title the author deliberately cleared.
  await page.locator('[data-dv-node="a"]').click();
  await guide.getByLabel('title',{exact:true}).fill('');await guide.getByLabel('title',{exact:true}).press('Enter');
  await guide.getByRole('combobox',{name:'Service API',exact:true}).selectOption('api:default/recording');
  await guide.getByRole('combobox',{name:'API operation',exact:true}).selectOption('record');
  expect((await nodes()).a.title).toBeUndefined();
  await page.locator('[data-dv-node="b"]').click();
  await guide.getByRole('combobox',{name:'Company service',exact:true}).selectOption(serviceRef);
  await expect(guide.getByLabel('title',{exact:true})).toHaveValue('Authored name');
  await guide.getByRole('combobox',{name:'Company service',exact:true}).selectOption('component:default/notifications');
  expect((await nodes()).b.title).toBe('Authored name');
  await guide.getByRole('combobox',{name:'Company service',exact:true}).selectOption('');
  expect((await nodes()).b).toEqual({title:'Authored name'});
});

test('right-click release leaves node links open for an ordinary click, with explicit dismissal',async({page,context,server})=>{
  await context.route('**/node-source',route=>route.fulfill({contentType:'text/plain',body:'Saved source destination'}));
  await page.goto(server.origin+'/workbench.html');
  const raw=spec();
  for(const node of Object.values(raw.page.blocks[0].diagram.nodes))node.link=server.origin+'/node-source';
  await paste(page,JSON.stringify(raw));
  const node=page.locator('[data-dv-node="a"]'),trigger=node.locator('.nrefs-trigger');
  const menu=page.getByRole('dialog',{name:'Links for a',exact:true});
  // Separate down/up exercises the contextmenu-before-release browser sequence.
  await node.hover();const box=await node.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down({button:'right'});await expect(menu).toBeVisible();
  await page.mouse.up({button:'right'});
  await expect.poll(()=>menu.evaluate(el=>el.matches(':popover-open'))).toBe(true);
  await expect(trigger).toHaveAttribute('aria-expanded','true');
  const opened=context.waitForEvent('page');
  await menu.getByRole('link',{name:'Source'}).click();const destination=await opened;
  await expect(destination.locator('body')).toHaveText('Saved source destination');await destination.close();
  await page.bringToFront();
  await node.click({button:'right'});await expect(menu).toBeVisible();
  await page.locator('.doc-title').click();await expect(menu).toBeHidden();
  await trigger.focus();await trigger.press('Shift+F10');await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(trigger).toBeFocused();
  await trigger.click();await menu.getByRole('button',{name:'Close node links'}).click();await expect(menu).toBeHidden();
  await node.click({button:'right'});await page.locator('[data-dv-node="b"]').click({button:'right'});
  await expect(menu).toBeHidden();
  await expect(page.getByRole('dialog',{name:'Links for Authored name',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await node.click();await expect(page.locator('#guide').getByLabel('id',{exact:true})).toHaveValue('a');
});
