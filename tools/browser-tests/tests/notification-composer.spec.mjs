import {test,expect,paste} from '../helpers/test.mjs';

for(const type of ['phone','deviceapp'])test(type+' notification composer edits initial and step stacks with Undo',async({page,server},testInfo)=>{
 const panel={id:'resident',type,title:'Resident phone',appName:'Home',brand:{app:'Home'},fields:[],initial:{phoneScreen:'home',clock:'9:41',notify:{app:'Home',title:'Earlier'}}};
 if(type==='phone'){delete panel.phoneScreen;delete panel.initial.phoneScreen;delete panel.fields;delete panel.appName;}
 else delete panel.brand;
 const d={view:'step',nodes:{service:{title:'Service'}},rows:[['service']],panels:[panel],steps:[
  {id:'start',text:'Ready',nodes:['service'],panels:{resident:{}}},
  {id:'alert',text:'Alert',nodes:['service'],panels:{resident:{clock:'10:00',notify:{app:'Home',title:'Visitor'}}}}
 ]};
 const original=JSON.stringify({page:{title:'Notifications',sections:[{heading:'At home',diagram:d}]}},null,2);
 const source=async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram;
 await page.goto(server.origin+'/workbench.html');await paste(page,original);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 await root.locator('.ptitle').click();
 const initial=guide.locator('.initialedit');
 await initial.getByLabel('Title',{exact:true}).fill('Welcome');await initial.getByLabel('Title',{exact:true}).press('Tab');
 await expect(root.locator('.phonetitle')).toHaveText('Welcome');expect((await source()).steps).toEqual(d.steps);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
 const patch=guide.locator('.patchedit');await patch.locator(':scope > summary').click();
 await expect(root.locator('.phonetitle')).toHaveText(['Visitor','Earlier']);
 await patch.getByLabel('Clear earlier notifications',{exact:true}).check();
 await expect(root.locator('.phonetitle')).toHaveText('Visitor');
 const cleared=await page.locator('#src').inputValue();
 await patch.getByRole('button',{name:'Add notification',exact:true}).click();
 const second=patch.locator('.notification-editor').nth(1);
 await second.getByLabel('Title',{exact:true}).fill('Clip ready');await second.getByLabel('Title',{exact:true}).press('Tab');
 await second.getByLabel('Message',{exact:true}).fill('<b>Watch safely</b>');await second.getByLabel('Message',{exact:true}).press('Tab');
 await expect.poll(async()=>((await source()).steps[1].panels.resident.notify[1] || {}).text).toBe('<b>Watch safely</b>');
 await second.getByRole('button',{name:'Move up',exact:true}).click();
 await expect(root.locator('.phonetitle')).toHaveText(['Clip ready','Visitor']);
 await expect(root.locator('.phonetext')).toHaveText('<b>Watch safely</b>');await expect(root.locator('.phonetext b')).toHaveCount(0);
 expect((await source()).panels[0].initial).toEqual(panel.initial);expect((await source()).steps[1].panels.resident.clock).toBe('10:00');
 await page.locator('#undo-builder').click();await expect(root.locator('.phonetitle')).toHaveText(['Visitor','Clip ready']);
 await page.locator('#redo-builder').click();await expect(root.locator('.phonetitle')).toHaveText(['Clip ready','Visitor']);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
 if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
 const before=await page.locator('#src').inputValue();
 await patch.locator('.notification-editor').first().getByLabel('App',{exact:true}).fill('');
 await patch.locator('.notification-editor').first().getByLabel('App',{exact:true}).press('Tab');
 await expect(page.locator('#src')).toHaveValue(before);await expect(guide.locator('.ierr')).toHaveText('An app name is required.');
 await patch.locator('.notification-editor').first().getByLabel('App',{exact:true}).fill('Home');
 await patch.locator('.notification-editor').first().getByLabel('App',{exact:true}).press('Tab');
 await testInfo.attach('notification-composer',{body:await guide.screenshot(),contentType:'image/png'});
 await patch.locator('.notification-editor').first().getByRole('button',{name:'Remove notification',exact:true}).click();
 await expect(root.locator('.phonetitle')).toHaveText('Visitor');
 expect((await source()).steps[1].panels.resident.clear).toBe(true);
 expect((await source()).steps[1].panels.resident.notify).toEqual([{app:'Home',title:'Visitor'}]);
 expect(cleared).toContain('Visitor');
});
