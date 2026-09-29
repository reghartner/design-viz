import {test,expect,pastePage as paste,inspectPageElement} from '../helpers/test.mjs';

const raw={page:{sections:[{heading:'Panel state',diagram:{nodes:{service:{title:'Service'}},rows:[['service']],panels:[
  {id:'reading',type:'gauge',title:'Current draw',unit:'mA',max:400,initial:{value:12,future:{keep:true}}},
  {id:'chip',type:'state',title:'Device state',states:['OFF','ON'],initial:{state:'OFF'}}
],steps:[
  {id:'start',text:'Starts off',panels:{chip:{}}},
  {id:'on',text:'Turns on',panels:{chip:{state:'ON'}}},
  {id:'hold',text:'Remains on',panels:{chip:{}}}
]}}]}};

test('typed starting and step state show assignment meaning, effective origin, and exact history',async({page,server},testInfo)=>{
  const original=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=()=>page.locator('#src').inputValue();
  await inspectPageElement(page,root.locator('.pt-gauge .ptitle'));
  const initial=guide.locator('.initialedit');
  await expect(initial.getByLabel('Value assignment',{exact:true})).toHaveValue('set');
  await expect(initial.getByLabel('value',{exact:true})).toHaveValue('12');
  await initial.getByLabel('value',{exact:true}).fill('42');await initial.getByLabel('value',{exact:true}).press('Tab');
  let edited=JSON.parse(await source());expect(edited.page.sections[0].diagram.panels[0].initial).toEqual({value:42,future:{keep:true}});
  const changed=await source();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);

  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
  const patch=guide.locator('.patchedit[data-panel-state="step"]').filter({has:page.locator('summary').filter({hasText:/^chip ·/})});
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  await expect(patch.getByLabel('Current state assignment',{exact:true})).toHaveValue('omit');
  await expect(patch.getByLabel('state',{exact:true})).toBeEnabled();
  await expect(patch.locator('.panel-state-note')).toContainText('Inherited "ON" · Inherited from step 2');
  await patch.screenshot({path:testInfo.outputPath('typed-panel-state.png')});
  await patch.getByLabel('state',{exact:true}).selectOption('OFF');
  edited=JSON.parse(await source());expect(edited.page.sections[0].diagram.steps[2].panels.chip).toEqual({state:'OFF'});
});
