import {test,expect,paste} from '../helpers/test.mjs';

for(const type of ['screen','phone'])test(type+' temporary state editing preserves carried state and supports exact Undo',async({page,server},info)=>{
 const panel={id:'p',title:'Resident '+type,type,initial:{audio:{output:'silent'}}};
 if(type==='screen')Object.assign(panel,{scene:'static-noise',initial:{mode:'save',banner:'INITIAL',audio:{output:'silent'}}});
 const originalPatch={audio:{output:'chime'},enterOnce:{audio:{microphone:'capturing'}}};
 if(type==='screen')Object.assign(originalPatch,{banner:'LATER',enterOnce:{...originalPatch.enterOnce,banner:'FLASH'}});
 const d={view:'step',autoplay:false,nodes:{n:{title:'Service'}},rows:[['n']],panels:[panel],steps:[
  {id:'before',text:'Before',panels:{p:type==='screen'?{banner:'BASE',audio:{output:'speech'}}:{audio:{output:'speech'}}}},
  {id:'now',text:'Now',panels:{p:originalPatch}},
  {id:'after',text:'After',panels:{p:{}}}
 ]};
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify({page:{sections:[{heading:'Duration',diagram:d}]}},null,2));
 const root=page.locator('#docview'),guide=page.locator('#guide'),source=()=>page.locator('#src').inputValue();
 const diagram=async()=>JSON.parse(await source()).page.sections[0].diagram;
 const patch=guide.locator('.patchedit[data-panel-state="step"]');
 async function output(value){
  if(type==='screen')await expect(root.locator('.fva-audio')).toHaveAttribute('data-output',value);
  else await expect(root.locator('.phonecall')).toContainText({silent:'Speaker silent',speech:'Visitor speaking'}[value]);
 }
 async function selectStep(i){
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+i+'"]').click();await page.locator('#editor-tab-inspect').click();
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
 }
 await root.locator('.ptitle').click();await expect(guide.locator('[aria-label$=" duration"]')).toHaveCount(0);
 await selectStep(1);
 await expect(patch.locator('[aria-label$=" duration"]')).toHaveCount(type==='screen'?6:1);
 await expect(patch.getByLabel('audio duration',{exact:true})).toHaveValue('both');
 await output('silent');
 const before=await source();await patch.getByLabel('microphone',{exact:true}).selectOption('listening');
 await expect.poll(async()=>(await diagram()).steps[1].panels.p.enterOnce.audio.microphone).toBe('listening');
 expect((await diagram()).steps[1].panels.p.audio).toEqual({output:'chime'});
 const edited=await source();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
 await selectStep(1);await patch.getByLabel('audio duration',{exact:true}).selectOption('once');
 await expect(patch.getByLabel('audio duration',{exact:true})).toHaveValue('once');
 expect((await diagram()).steps[1].panels.p.audio).toBeUndefined();
 await selectStep(2);await output('speech');
 await expect(patch.getByLabel('audio duration',{exact:true})).toBeDisabled();
 await selectStep(1);const once=await source();await patch.getByLabel('audio duration',{exact:true}).selectOption('carry');
 await expect(patch.getByLabel('audio duration',{exact:true})).toHaveValue('carry');
 expect((await diagram()).steps[1].panels.p.audio).toEqual({microphone:'listening'});
 await selectStep(2);if(type==='screen')await expect(root.locator('.fva-audio')).toHaveAttribute('data-microphone','listening');else await expect(root.locator('.phonecall')).toContainText('Mic listening');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(once);
 await selectStep(1);const inheritedBefore=await source();await patch.getByLabel('audio duration',{exact:true}).selectOption('inherit');
 await expect(patch.getByLabel('audio duration',{exact:true})).toHaveValue('inherit');await expect(patch.getByLabel('audio duration',{exact:true})).toBeDisabled();
 await output('speech');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(inheritedBefore);
 await selectStep(1);
 if(type==='screen'){
  await expect(root.locator('.banner')).toHaveText('FLASH');
  await patch.getByLabel('banner',{exact:true}).fill('FLASH EDITED');await patch.getByLabel('banner',{exact:true}).press('Tab');
  await expect(root.locator('.banner')).toHaveText('FLASH EDITED');expect((await diagram()).steps[1].panels.p.banner).toBe('LATER');
  await selectStep(2);await expect(root.locator('.banner')).toHaveText('LATER');
  await selectStep(1);await patch.getByLabel('banner duration',{exact:true}).selectOption('once');
  await selectStep(2);await expect(root.locator('.banner')).toHaveText('BASE');
  await selectStep(1);
 }
 expect((await diagram()).panels[0].initial).toEqual(panel.initial);
 await patch.getByLabel('audio duration',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath(type+'-duration.png')});
});
