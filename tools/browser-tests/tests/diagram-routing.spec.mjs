import {test,expect,pastePage as paste} from '../helpers/test.mjs';
const board=()=>({nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a'],['b']],edges:[{from:'a',to:'b',bend:30}],steps:[]});

/* #1216 (Chuck's spoken ruling, option B): lane routing is no longer offered. An authored lanes diagram still
   draws its lane routes; Inspect shows Edge routing only there, to switch it off. A diagram without lanes gets no
   control. Desktop only. */
test('section routing keeps drawing authored lanes, offers Lanes nowhere, and switches them off with Undo/Redo',async({page,server},testInfo)=>{
  const raw={page:{title:'Routing settings',blocks:[{heading:'Authored lanes',diagram:{...board(),routing:'lanes'}},
    {tabs:[{label:'Services',sections:[{heading:'Target diagram',diagram:board()}]}]}]}};
  const before=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,before);
  const sections=page.locator('#docview .doc-sec'),routing=page.getByRole('combobox',{name:'Edge routing',exact:true});
  await expect(sections.nth(0).locator('.lane-bridge')).toHaveCount(1);
  await expect(sections.nth(1).locator('.lane-bridge')).toHaveCount(0);
  await page.locator('#docview h3').filter({hasText:'Target diagram'}).click();
  await expect(page.locator('#guide')).toContainText('Target diagram');await expect(routing).toHaveCount(0);
  await page.locator('#docview h3').filter({hasText:'Authored lanes'}).click();
  await expect(routing).toHaveValue('lanes');await expect(routing.locator('option')).toHaveText(['Lanes (no longer offered)','Curves']);
  await page.locator('#guide').screenshot({path:testInfo.outputPath('edge-routing-inspector.png')});
  await routing.selectOption('curves');
  await expect(sections.nth(0).locator('.lane-bridge')).toHaveCount(0);
  const off=JSON.parse(await page.locator('#src').inputValue());
  expect(off.page.blocks[0].diagram).toEqual(board());expect(off.page.blocks[1]).toEqual(raw.page.blocks[1]);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await expect(sections.nth(0).locator('.lane-bridge')).toHaveCount(1);
});
