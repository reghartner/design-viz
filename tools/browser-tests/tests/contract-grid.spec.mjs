/* #1304 section contract blocks as grid tables.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| B1 | Reader: a grid block is a real table named by its title, with column and row headers and a dash for a missing cell. | section (no diagram) with a 3-column grid | getByRole('table', name = title); column headers; row headers; dash cell | k/v/g rows; an unnamed table |
| B2 | Reader: a wide grid (12 columns × 160px) scrolls inside its block, not the page; the scroll region is keyboard-focusable; the same at 390px wide (reading only). | 12-column grid | region scrollWidth > clientWidth; scrollLeft moves; page has no horizontal overflow; region focusable | page-wide overflow; a grid that clips columns |
| B3 | Reader: a grid row with revealAt:2 is hidden at step 1 and shown at step 2. | section with a diagram and two steps, grid row revealAt:2 | row hidden at s=send, visible at s=reply | grid rows that ignore step reveals |
| B4 | Workbench (desktop): Add grid table from the Add menu; Add column, reorder a column and edit a cell are each one Undo step; Use columns (grid) converts a classic block in one Undo step. | page with one classic block and a heading-only section | source after each edit and after its Undo | edits that need several Undo steps; no Add grid table entry |
*/
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage as paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const grid=(columns=[{id:'yoda',label:'Yoda',width:70},{id:'jyn',label:'Jyn'},{id:'han',label:'Han'}])=>({id:'calls',title:'Calls per location load',span:12,fieldLabel:'Scenario',columns,
  fields:[{k:'SS3 location',cells:{yoda:2,jyn:7,han:1},hot:true},{k:'SS2 location',cells:{yoda:3}},{k:'Camera only',cells:{jyn:4,han:0}}]});
async function reader(page,server,name,raw,hash=''){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
  await page.goto(server.origin+'/'+name+'.html'+hash);return page.locator('.docview');
}

test('B1 reader grid block is a real table named by its title',async({page,server},info)=>{
  await page.setViewportSize({width:1280,height:900});
  const root=await reader(page,server,'grid-b1',{page:{title:'Grid',sections:[{heading:'Calls',contracts:[grid()]}]}});
  const table=root.getByRole('table',{name:'Calls per location load',exact:true});await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['Scenario','Yoda','Jyn','Han']);
  await expect(table.getByRole('rowheader')).toHaveText(['SS3 location','SS2 location','Camera only']);
  await expect(table.locator('tbody tr').nth(1).locator('td')).toHaveText(['3','—','—']);
  await expect(table.locator('td.ctv,td.ctg')).toHaveCount(0);
  await root.locator('.ctcard').screenshot({path:info.outputPath('grid-block.png')});
});

test('B2 reader wide grid scrolls inside its block, not the page, also at 390px',async({page,server},info)=>{
  const columns=Array.from({length:12},(_,i)=>({id:'c'+i,label:'Service '+(i+1)}));
  const root=await reader(page,server,'grid-b2',{page:{title:'Grid',sections:[{heading:'Calls',contracts:[grid(columns)]}]}});
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});
    const region=root.getByRole('region',{name:'Calls per location load',exact:true});await expect(region).toBeVisible();
    const sizes=await region.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
    expect(sizes.scroll,'the grid is wider than its block at '+width).toBeGreaterThan(sizes.client);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no page-wide horizontal scroll at '+width).toBe(true);
    await region.focus();await expect(region).toBeFocused();
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    await region.evaluate(el=>{el.scrollLeft=el.scrollLeft||200;});
    expect(await region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    await page.screenshot({path:info.outputPath('grid-wide-'+width+'.png')});
    await region.evaluate(el=>{el.scrollLeft=0;});
  }
});

test('B3 reader step reveal shows a grid row at its step',async({page,server})=>{
  await page.setViewportSize({width:1280,height:900});
  const g=grid();g.fields[2].revealAt=2;
  const raw={page:{title:'Grid',sections:[{heading:'Calls',diagram:{nodes:{a:{title:'Doorbell'},b:{title:'Cloud'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
    steps:[{id:'send',edge:'a->b',text:'Send.'},{id:'reply',edge:'a->b',text:'Reply.'}]},contracts:[g]}]}};
  let root=await reader(page,server,'grid-b3',raw,'#d=calls&m=step&s=send');
  const row=root.getByRole('rowheader',{name:'Camera only',exact:true});
  await expect(root.getByRole('rowheader',{name:'SS2 location',exact:true})).toBeVisible();
  await expect(row).toBeHidden();
  await page.goto(server.origin+'/grid-b3.html#d=calls&m=step&s=reply');root=page.locator('.docview');
  await expect(root.getByRole('rowheader',{name:'Camera only',exact:true})).toBeVisible();
});

test('B4 workbench grid edits are one Undo step each; Add grid table and Use columns create grids',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:950});
  const raw={page:{title:'Grid',sections:[{heading:'Calls',contracts:[grid(),{id:'classic',title:'Classic',fields:[{k:'event',v:'press',g:'Meaning'}]}]}]}};
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
  await page.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
  const root=page.locator('#docview'),guide=page.locator('#guide'),src=page.locator('#src'),undo=page.locator('#undo-builder');
  const contracts=async()=>JSON.parse(await src.inputValue()).page.sections[0].contracts;
  async function oneStep(act,check){
    const before=await src.inputValue();await act();
    await expect.poll(async()=>(await src.inputValue())!==before).toBe(true);await check(await contracts());
    await undo.click();await expect(src).toHaveValue(before);await page.locator('#redo-builder').click();await expect.poll(async()=>(await src.inputValue())!==before).toBe(true);
  }
  // Add column
  await root.locator('[data-dv-contract="0"] .cttitle>span').click();
  const columns=guide.locator('[data-contract-editor="columns"]');await expect(columns).toBeVisible();
  await oneStep(async()=>{await columns.getByRole('button',{name:'+ Add column',exact:true}).click();const name=columns.getByLabel('Column name *').last();await name.fill('Leia');await name.press('Tab');},
    list=>expect(list[0].columns.map(c=>c.label)).toEqual(['Yoda','Jyn','Han','Leia']));
  // Reorder a column
  await root.locator('[data-dv-contract="0"] .cttitle>span').click();
  await oneStep(async()=>{await guide.locator('[data-contract-editor="columns"] .rowcard').nth(1).getByRole('button',{name:'↑',exact:true}).click();},
    list=>expect(list[0].columns.map(c=>c.id)).toEqual(['jyn','yoda','han','leia']));
  // Edit a cell on a row
  await root.locator('[data-dv-contract="0"] .ctrow').nth(1).click();
  await oneStep(async()=>{const cell=guide.getByLabel('Han',{exact:true});await cell.fill('5');await cell.press('Enter');},
    list=>expect(list[0].fields[1].cells.han).toBe('5'));
  await expect(root.locator('[data-dv-contract="0"] .ctrow').nth(1).locator('[data-contract-cell="han"]')).toHaveText('5');
  // Convert the classic block
  await root.locator('[data-dv-contract="1"] .cttitle>span').click();
  await oneStep(async()=>{await guide.getByRole('button',{name:'Use columns (grid)',exact:true}).click();},
    list=>{expect(list[1].columns.map(c=>c.id)).toEqual(['value','notes']);expect(list[1].fields[0].cells).toEqual({value:'press',notes:'Meaning'});});
  await guide.screenshot({path:info.outputPath('grid-inspector.png')});
  // Add grid table from the Add menu
  const count=(await contracts()).length;
  await page.locator('#diagram-add').click();await page.locator('.diagram-add-structure>summary').click();
  await page.getByRole('button',{name:'Add grid table',exact:true}).click();
  await expect.poll(async()=>(await contracts()).length).toBe(count+1);
  expect(Array.isArray((await contracts()).at(-1).columns)).toBe(true);
  await expect(root.getByRole('table',{name:'New grid',exact:true})).toBeVisible();
});
