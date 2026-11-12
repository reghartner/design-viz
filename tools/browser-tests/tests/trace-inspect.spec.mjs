import {test,expect,pastePage,inspectPageElement} from '../helpers/test.mjs';

/* #996: the trace panel's spans field is a list. Inspect must save an edited
   list, the panel must show it, and one Undo must restore the exact source. */
const spans=[
  {id:'request',service:'api',name:'handle request',startMs:0,ms:100},
  {id:'parse',parentId:'request',service:'api',name:'parse input',startMs:5,ms:20},
  {id:'query',parentId:'request',service:'database',name:'query',startMs:30,ms:50}
];
const spec={page:{sections:[{heading:'Inside the service',diagram:{nodes:{api:{title:'API'}},rows:[['api']],panels:[
  {id:'trace',type:'trace',title:'Inside the service',spans,initial:{selected:'request'}}
]}}]}};

test('trace spans edited in Inspect save, render and undo in one step',async({page,server})=>{
  const original=JSON.stringify(spec,null,2);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const guide=page.locator('#guide'),source=page.locator('#src'),root=page.locator('#docview');
  const panel=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0];
  const names=root.locator('.pt-trace .tr-opname');
  await expect(names.filter({hasText:'parse input'})).toHaveCount(1);

  await inspectPageElement(page,root.locator('.pt-trace .ptitle'));
  // Spans use a row editor since #1000; its raw JSON fallback still saves a whole list.
  const rows=guide.locator('.frow').filter({has:page.locator(':scope > .flab',{hasText:/^Spans$/})});
  await rows.locator('details.rawjson > summary').click();
  const field=rows.locator('details.rawjson textarea');
  await expect(field).toHaveValue(JSON.stringify(spans));
  const edited=spans.map(s=>s.id==='parse'?{...s,name:'validate input'}:s);
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(JSON.stringify(edited));
  await page.keyboard.press('Tab');

  await expect.poll(async()=>(await panel()).spans).toEqual(edited);
  await expect(guide.locator('.ierr')).toBeHidden();
  await expect(names.filter({hasText:'validate input'})).toHaveCount(1);
  await expect(names.filter({hasText:'parse input'})).toHaveCount(0);
  expect((await panel()).initial).toEqual({selected:'request'});

  const changed=await source.inputValue();
  await page.locator('#undo-builder').click();
  await expect(source).toHaveValue(original);
  await expect(names.filter({hasText:'parse input'})).toHaveCount(1);
  await page.locator('#redo-builder').click();
  await expect(source).toHaveValue(changed);
  await expect(names.filter({hasText:'validate input'})).toHaveCount(1);
});
