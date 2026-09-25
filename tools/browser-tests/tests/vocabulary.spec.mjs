import {test,expect,paste} from '../helpers/test.mjs';
test('protocols and lanes can be chosen, created and renamed without JSON',async({page,server})=>{
 const original=JSON.stringify({view:'step',nodes:{a:{title:'Service'},b:{title:'Device'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Deliver'}],steps:[{id:'go',text:'Deliver',nodes:['a','b']}]},null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,original);
 const guide=page.locator('#guide'),source=async()=>JSON.parse(await page.locator('#src').inputValue());
 await page.locator('#docview text.lbl[data-dv-edge="0"]').click();
 const picker=guide.getByRole('combobox',{name:'Connection type',exact:true});
 for(const kind of ['https','int','mqtt','sqs','rmq','pulsar','tls','ws']){
  await picker.selectOption(kind);await expect(picker).toHaveValue(kind);expect((await source()).edges[0].kind).toBe(kind);
 }
 await expect(picker.locator('option[value=ws]')).toHaveText('WebSocket · ws');
 const before=await page.locator('#src').inputValue();
 await guide.getByText('New connection type…',{exact:true}).click();
 await guide.getByLabel('Name',{exact:true}).fill('Event stream');await guide.getByLabel('New color',{exact:true}).fill('#abcdef');
 await guide.getByRole('button',{name:'Create connection type',exact:true}).click();
 await expect(picker).toHaveValue('event-stream');
 expect((await source()).page.protocols['event-stream']).toEqual({label:'Event stream',color:'#abcdef'});
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();
 await page.locator('#docview text.lbl[data-dv-edge="0"]').click();await guide.getByText('Edit connection type',{exact:true}).click();
 await guide.getByLabel('Display name',{exact:true}).fill('Domain events');await guide.getByLabel('Display name',{exact:true}).press('Tab');
 expect((await source()).page.protocols['event-stream']).toEqual({label:'Domain events',color:'#abcdef'});
 await expect(guide.getByLabel('Display name',{exact:true})).toBeVisible();
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
 await guide.getByText('New lane…',{exact:true}).click();await guide.getByLabel('Name',{exact:true}).fill('Device cloud');
 await guide.getByRole('button',{name:'Create lane',exact:true}).click();
 await expect(guide.getByRole('combobox',{name:'Story lane',exact:true})).toHaveValue('device-cloud');
 expect((await source()).page.sections[0].diagram.steps[0].lane).toBe('device-cloud');
 const saved=await page.locator('#src').inputValue();
 await guide.getByText('New lane…',{exact:true}).click();await guide.getByLabel('Name',{exact:true}).fill('Device cloud');
 await guide.getByRole('button',{name:'Create lane',exact:true}).click();
 await expect(guide.locator('.ierr')).toContainText('already exists');await expect(page.locator('#src')).toHaveValue(saved);
});
