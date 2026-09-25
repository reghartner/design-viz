import {test,expect,paste} from '../helpers/test.mjs';
const board=()=>({nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a'],['b']],edges:[{from:'a',to:'b',bend:30}],steps:[]});

test('section routing preserves imported lanes, changes only the selected diagram, and supports Undo/Redo',async({page,server},testInfo)=>{
  const raw={page:{title:'Routing settings',blocks:[{heading:'Authored lanes',diagram:{...board(),routing:'lanes'}},
    {tabs:[{label:'Services',sections:[{heading:'Target diagram',diagram:board()}]}]}]}};
  const before=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,before);
  const sections=page.locator('#docview .doc-sec'),routing=page.getByRole('combobox',{name:'Edge routing',exact:true});
  await expect(sections.nth(0).locator('.lane-bridge')).toHaveCount(1);
  await expect(sections.nth(1).locator('.lane-bridge')).toHaveCount(0);
  await page.locator('#docview h3').filter({hasText:'Target diagram'}).click();
  await expect(routing).toHaveValue('curves');
  await routing.selectOption('lanes');
  await expect(sections.nth(1).locator('.lane-bridge')).toHaveCount(1);
  const on=await page.locator('#src').inputValue(),changed=JSON.parse(on);
  expect(changed.page.blocks[0]).toEqual(raw.page.blocks[0]);
  expect(changed.page.blocks[1].tabs[0].sections[0].diagram).toEqual({...board(),routing:'lanes'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await expect(sections.nth(1).locator('.lane-bridge')).toHaveCount(0);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(on);
  await expect(sections.nth(1).locator('.lane-bridge')).toHaveCount(1);
  await page.locator('#docview h3').filter({hasText:'Target diagram'}).click();
  await routing.focus();await expect(routing).toBeFocused();await routing.selectOption('curves');
  await expect(routing).toHaveValue('curves');
  await expect(sections.nth(1).locator('.lane-bridge')).toHaveCount(0);
  await page.locator('#guide').screenshot({path:testInfo.outputPath('edge-routing-inspector.png')});
});
