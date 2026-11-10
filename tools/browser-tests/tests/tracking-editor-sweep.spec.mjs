/* #1254 desktop Workbench Tracking editor: messages and focus in a real browser.
| row | item | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|---|
| W16 | 16 | A refused Add ticket shows its message in the field's row, in view, and marks the field invalid. | node with two tickets | role=alert in the Add ticket row is visible and in the viewport; aria-invalid="true" | message only in the top error box |
| W18 | 18 | Remove ticket 2 (the last row) moves focus to the next control, Add ticket; Remove ticket 1 keeps focus on the row that takes its place. | node with HW-1, HW-2, HW-3 | focused element after each click; source after each click | focus dropping to the page body |
| W25 | 25 | Adding a ticket that is already attached says so beside the field and clears it; the source is unchanged. | same node | role=status text; empty field; source unchanged | silent no-op with the typed text left behind |
*/
import {test,expect,paste,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
const raw={page:{title:'Tracking sweep',sections:[{heading:'Flow',diagram:{nodes:{api:{title:'API',tickets:['HW-1','HW-2','HW-3']},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}],panels:[{id:'status',type:'live-status'}]}}]}};
async function open(page,server){
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
  await inspectPageElement(page,page.locator('#docview [data-dv-node="api"] .t1').first());
  const tracking=page.locator('#guide').getByRole('group',{name:'Tracking',exact:true});await expect(tracking).toBeVisible();return tracking;
}
const tickets=async page=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.nodes.api.tickets;

test('W16 W25 desktop Add ticket refusals and duplicates are shown beside the field',async({page,server},info)=>{
  const tracking=await open(page,server),src=page.locator('#src'),before=await src.inputValue();
  const add=tracking.getByLabel('Add ticket',{exact:true});await add.fill('hw-9');await add.press('Enter');
  const row=add.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," frow ")][1]');
  const alert=row.getByRole('alert');await expect(alert).toContainText('Jira key');await expect(alert).toBeInViewport();
  await expect(add).toHaveAttribute('aria-invalid','true');await expect(src).toHaveValue(before);
  await page.screenshot({path:info.outputPath('tracking-field-error.png')});
  await add.fill('HW-2');await add.press('Enter');
  await expect(row.getByRole('status')).toHaveText('HW-2 is already attached.');await expect(add).toHaveValue('');
  await expect(add).not.toHaveAttribute('aria-invalid','true');await expect(src).toHaveValue(before);
});

test('W18 desktop Remove ticket keeps focus in the Tracking form',async({page,server})=>{
  const tracking=await open(page,server);
  await tracking.getByRole('button',{name:'Remove ticket 1',exact:true}).click();
  await expect.poll(()=>tickets(page)).toEqual(['HW-2','HW-3']);
  await expect(page.locator('#guide').getByRole('group',{name:'Tracking',exact:true}).getByRole('button',{name:'Remove ticket 1',exact:true})).toBeFocused();
  await page.locator('#guide').getByRole('group',{name:'Tracking',exact:true}).getByRole('button',{name:'Remove ticket 2',exact:true}).click();
  await expect.poll(()=>tickets(page)).toEqual(['HW-2']);
  await expect(page.locator('#guide').getByRole('group',{name:'Tracking',exact:true}).getByLabel('Add ticket',{exact:true})).toBeFocused();
});
