import {test,expect,paste} from '../helpers/test.mjs';
const ref=name=>'component:default/'+name;
const catalog={version:1,source:'Example company · approved catalog',services:[
  {entityRef:ref('doorbell'),title:'Doorbell gateway',owner:'group:default/devices',dependsOn:[ref('recording')],consumesApis:['api:default/notification']},
  {entityRef:ref('recording'),title:'Recording service',owner:'group:default/video',apis:[]},
  {entityRef:ref('notifications'),title:'Resident notifications',owner:'group:default/experience',apis:[{entityRef:'api:default/notification',title:'Notification API'}]},
  {entityRef:ref('identity'),title:'Identity service',owner:'group:default/platform',apis:[]},
  {entityRef:ref('media'),title:'Media library',owner:'group:default/video',apis:[]},
  {entityRef:ref('health'),title:'Device health',owner:'group:default/devices',apis:[]},
]};
const source=()=>JSON.stringify({page:{title:'Existing design',blocks:[{heading:'First',diagram:{nodes:{first:{title:'First'}},rows:[['first']]}},
  {tabs:[{label:'Details',sections:[{heading:'Target services',diagram:{nodes:{authored:{title:'My gateway',binding:{entityRef:ref('doorbell')}}},rows:[['authored']],steps:[],panels:[{id:'q',type:'queue'}]}}]}]}]}});
const spec=async page=>JSON.parse(await page.locator('#src').inputValue());
const choose=async(page,name)=>page.locator('#catalog-services').getByRole('checkbox',{name:new RegExp(name)}).check();
const openAdd=async page=>{await page.locator('#diagram-add').click();await page.locator('[data-add-kind=catalog]').click();};

test('homepage seeds selected services with catalog bindings, optional edges and searchable selection',async({page,server},testInfo)=>{
  await page.route('**/catalog.json',route=>route.fulfill({json:catalog}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-catalog').click();
  await expect(page.locator('#catalog-count')).toContainText('6 services shown');
  await page.locator('#catalog-project-title').fill('Doorbell platform');
  await choose(page,'Doorbell gateway');await choose(page,'Recording service');
  await page.locator('#catalog-search').fill('experience');await page.locator('#catalog-select-visible').click();
  await expect(page.locator('#catalog-count')).toContainText('3 selected · 1 of 6');
  await page.locator('#catalog-search').fill('');await expect(page.locator('#catalog-preview')).toContainText('3 new nodes · 0 already on the diagram · 2 new connections');
  const dialog=page.locator('#catalog-picker');expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await testInfo.attach('catalog-picker',{body:await dialog.screenshot(),contentType:'image/png'});
  await page.locator('#catalog-add').click();await expect(dialog).toBeHidden();await expect(page.locator('#workbench-workspace')).toBeVisible();
  const created=await spec(page),d=created.page.blocks[0].diagram;
  expect(created.page.title).toBe('Doorbell platform');expect(d.edges).toHaveLength(2);expect(d.steps).toEqual([]);
  expect(Object.values(d.nodes).map(n=>n.binding.entityRef)).toEqual([ref('doorbell'),ref('recording'),ref('notifications')]);
  await expect(page.locator('#docview [data-dv-node]')).toHaveCount(3);
  await expect(page.locator('#docview')).toContainText('Catalog relationship');
  await testInfo.attach('catalog-seeded-diagram',{body:await page.locator('#docview').screenshot(),contentType:'image/png'});
  await page.locator('#workspace-home').click();await page.locator('#welcome-new').click();await page.locator('#welcome-new-catalog').click();
  await choose(page,'Doorbell gateway');await choose(page,'Recording service');await page.locator('#catalog-edges').uncheck();
  await expect(page.locator('#catalog-preview')).toContainText('0 new connections');await page.locator('#catalog-add').click();
  expect((await spec(page)).page.blocks[0].diagram.edges).toEqual([]);
  await page.locator('#undo-builder').click();expect((await spec(page)).page.title).toBe('Doorbell platform');
});

test('Add seeds only the destination, reuses nodes and supports one-action undo without duplicate inserts',async({page,server})=>{
  await page.route('**/catalog.json',route=>route.fulfill({json:catalog}));
  await page.goto(server.origin+'/workbench.html');const before=source();await paste(page,before);
  await page.locator('#diagram-add-target').selectOption('1');await openAdd(page);
  await expect(page.locator('#catalog-destination')).toContainText('Target services');
  await choose(page,'Doorbell gateway');await choose(page,'Recording service');
  await expect(page.locator('#catalog-preview')).toContainText('1 new nodes · 1 already on the diagram · 1 new connections');
  await page.locator('#catalog-add').click();
  const after=await page.locator('#src').inputValue(),raw=JSON.parse(after),d=raw.page.blocks[1].tabs[0].sections[0].diagram;
  expect(raw.page.blocks[0]).toEqual(JSON.parse(before).page.blocks[0]);expect(d.nodes.authored.title).toBe('My gateway');expect(d.panels).toEqual([{id:'q',type:'queue'}]);
  expect(d.rows).toEqual([['authored'],['recording-1']]);expect(d.edges[0].from).toBe('authored');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await openAdd(page);await choose(page,'Doorbell gateway');await choose(page,'Recording service');
  await expect(page.locator('#catalog-add')).toBeDisabled();await expect(page.locator('#catalog-error')).toContainText('already');
  await page.keyboard.press('Escape');await expect(page.locator('#diagram-add')).toBeFocused();await expect(page.locator('#src')).toHaveValue(after);
});

test('missing catalog can be imported from the homepage; bad snapshots preserve the selection',async({page,server})=>{
  await page.route('**/catalog.json',route=>route.fulfill({json:{version:1,services:[]}}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-catalog').click();
  await expect(page.locator('#catalog-empty')).toContainText('No services loaded');await expect(page.locator('#catalog-add')).toBeDisabled();
  await page.locator('#catalog-import summary').click();await page.locator('#catalog-json').fill(JSON.stringify(catalog));await page.locator('#catalog-load').click();
  await choose(page,'Recording service');
  await page.locator('#catalog-import summary').click();await page.locator('#catalog-json').fill('{');await page.locator('#catalog-load').click();
  await expect(page.locator('#catalog-import-error')).not.toBeEmpty();await expect(page.locator('#catalog-count')).toContainText('1 selected');
  await page.locator('#catalog-add').click();expect(Object.values((await spec(page)).page.blocks[0].diagram.nodes)[0].title).toBe('Recording service');
});

test('late catalog load refreshes an open picker; cancellation and stale source cannot mutate the diagram',async({page,server})=>{
  let release;const ready=new Promise(resolve=>{release=resolve;});
  await page.route('**/catalog.json',async route=>{await ready;await route.fulfill({json:catalog});});
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-catalog').click();
  await expect(page.locator('#catalog-add')).toBeDisabled();release();await choose(page,'Recording service');
  await page.keyboard.press('Escape');await expect(page.locator('#welcome-catalog')).toBeFocused();await expect(page.locator('#workbench-workspace')).toBeHidden();
  const before=source();await paste(page,before);await openAdd(page);await choose(page,'Recording service');
  const changed=before.replace('Existing design','Changed while choosing');
  await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);
  await expect(page.locator('#catalog-add')).toBeDisabled();await expect(page.locator('#catalog-error')).toContainText('changed');
  await page.evaluate(()=>document.querySelector('#catalog-add').click());await expect(page.locator('#src')).toHaveValue(changed);
  await page.goBack();await expect(page.locator('#catalog-picker')).toBeHidden();await expect(page.locator('#src')).toHaveValue(changed);
});
