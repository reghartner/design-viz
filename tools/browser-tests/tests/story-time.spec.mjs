import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const example=await readFile(path.join(repo,'examples/story-time/story-time.spec.json'),'utf8');
const chip=(root,index)=>root.locator('.schip[data-step-source="'+index+'"]').first();
const d=s=>s.page.sections[0].diagram;
/* [phone clock, phone date, device-app clock, battery readout] per step. */
const expected=[['10:30','Thu, Sep 24','10:30','38'],['12:40','Fri, Sep 25','12:40','36'],['12:41','Fri, Sep 25','12:41','35'],['12:41','Fri, Sep 25','12:41','35'],
  ['4:15','Fri, Sep 25','4:15','33'],['6:50','Fri, Sep 25','6:50','32'],['8:20','Fri, Sep 25','8:20','41'],['8:21','Fri, Sep 25','8:21','41']];
async function check(root,index){
  const [clock,date,app,charge]=expected[index];
  await chip(root,index).click();
  await expect(root.locator('.pt-phone .phoneclock')).toHaveText(clock);
  await expect(root.locator('.pt-phone .phonedate')).toHaveText(date);
  await expect(root.locator('.pt-battery .btval')).toHaveText(charge+'%');
  if(await root.locator('.pt-deviceapp .da-statusbar').count())await expect(root.locator('.pt-deviceapp .da-statusbar > span').first()).toHaveText(app);
  else await expect(root.locator('.pt-deviceapp .da-home-clock strong')).toHaveText(app);
}

test('standalone and native viewers show step time on every clock and drain the battery with elapsed time',async({page,server},testInfo)=>{
  await writeFile(path.join(server.root,'story-time.json'),example);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'story-time.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'story-time.html')]);
  await page.goto(server.origin+'/story-time.html');const root=page.locator('.docview');
  for(const index of [0,1,2,3,4,5,6,7,4,0])await check(root,index);
  await expect(root.locator('.pt-battery .bttrend')).toHaveText('idle');
  await chip(root,6).click();await expect(root.locator('.pt-battery .bttrend')).toHaveText('charging');
  await page.screenshot({path:testInfo.outputPath('story-time-standalone.png'),fullPage:true});
  await writeFile(path.join(server.root,'story-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'story-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./story-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/story-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);},JSON.parse(example));
  for(const index of [0,5,7])await check(page.locator('#host'),index);
  await page.evaluate(()=>viewer.destroy());
});

test('workbench story time, step time, battery constants and extra drain edit the spec with exact Undo/Redo',async({page,server},testInfo)=>{
  const raw={page:{title:'Story time',sections:[{heading:'Night',diagram:{view:'step',nodes:{cam:{title:'Camera'}},rows:[['cam']],
    panels:[{id:'phone',type:'phone',title:'Phone'},{id:'bat',type:'battery',title:'Battery',initial:{charge:50}}],
    steps:[{id:'armed',nodes:['cam'],text:'Armed'},{id:'later',nodes:['cam'],text:'Later',panels:{bat:{}}}]}}]}};
  const source=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  const root=page.locator('#docview'),guide=page.locator('#guide'),src=page.locator('#src');
  const spec=async()=>JSON.parse(await src.inputValue());
  await expect(root.locator('.pt-phone .phoneclock')).toHaveText('');
  await page.locator('#docview h3').filter({hasText:'Night'}).click();
  await expect(guide.getByRole('combobox',{name:'Clock format',exact:true})).toBeDisabled();
  const start=guide.getByRole('textbox',{name:'Story start',exact:true});
  await start.fill('tonight');await start.press('Tab');await expect(guide).toContainText('Use a start such as');
  await expect(src).toHaveValue(source);
  await start.fill('2026-09-24T22:30');await start.press('Tab');
  await expect(root.locator('.pt-phone .phoneclock')).toHaveText('10:30');
  await expect(root.locator('.pt-phone .phonedate')).toHaveText('Thu, Sep 24');
  expect(d(await spec()).storyTime).toEqual({start:'2026-09-24T22:30'});
  const started=await src.inputValue();
  await page.locator('#docview h3').filter({hasText:'Night'}).click();
  await guide.getByRole('combobox',{name:'Clock format',exact:true}).selectOption('24h');
  await expect(root.locator('.pt-phone .phoneclock')).toHaveText('22:30');
  await page.locator('#docview h3').filter({hasText:'Night'}).click();
  await guide.getByRole('combobox',{name:'Date format',exact:true}).selectOption('iso');
  await expect(root.locator('.pt-phone .phonedate')).toHaveText('2026-09-24');
  await page.locator('#docview h3').filter({hasText:'Night'}).click();
  const drain=guide.getByRole('textbox',{name:'Battery drain % per hour',exact:true});
  await expect(drain).toHaveAttribute('placeholder','Built-in default · 1 %/h (placeholder)');
  await drain.fill('2');await drain.press('Tab');
  expect(d(await spec()).deviceDefaults).toEqual({battery:{drainPerHour:2}});
  expect(d(await spec()).storyTime).toEqual({start:'2026-09-24T22:30',clock:'24h',date:'iso'});
  await page.locator('#guide').screenshot({path:testInfo.outputPath('story-time-section-inspector.png')});

  // Step time: relative value, resolved note, clocks and battery drift.
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  await expect(guide.locator('.step-time-note')).toContainText('2026-09-24 · 22:30');
  const before=await src.inputValue();
  const time=guide.getByRole('textbox',{name:'Step time',exact:true});
  await time.fill('soon');await time.press('Tab');await expect(guide).toContainText('Use +15m, 23:10');await expect(src).toHaveValue(before);
  await time.fill('+3h');await time.press('Tab');
  await expect(root.locator('.pt-phone .phoneclock')).toHaveText('01:30');
  await expect(root.locator('.pt-phone .phonedate')).toHaveText('2026-09-25');
  await expect(root.locator('.pt-battery .btval')).toHaveText('44%');
  expect(d(await spec()).steps[1].time).toBe('+3h');
  await expect(guide.locator('.step-time-note')).toContainText('2026-09-25 · 01:30');
  const timed=await src.inputValue();
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
  await expect(root.locator('.pt-battery .btval')).toHaveText('50%');
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(timed);

  // Extra drain at the step.
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="1"]').click();await page.locator('#editor-tab-inspect').click();
  const patch=guide.locator('.patchedit').filter({has:page.locator(':scope > summary').filter({hasText:/^bat ·/})});
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  const extra=patch.getByLabel('drain',{exact:true});
  await expect(extra).toHaveAttribute('placeholder','Extra % used at this step');
  await extra.fill('1.5');await extra.press('Tab');
  await expect(root.locator('.pt-battery .btval')).toHaveText('43%');
  expect(d(await spec()).steps[1].panels.bat).toEqual({drain:1.5});
  await page.locator('#guide').screenshot({path:testInfo.outputPath('story-time-step-inspector.png')});

  // Panel constant overrides the diagram default.
  await root.locator('.pt-battery .ptitle').click();
  const own=guide.getByRole('textbox',{name:'Drain % per hour',exact:true});
  await expect(own).toHaveAttribute('placeholder','Diagram default · 2 %/h');
  await own.fill('0');await own.press('Tab');
  await chip(root,1).click();await expect(root.locator('.pt-battery .btval')).toHaveText('49%');
  expect(d(await spec()).panels[1].drainPerHour).toBe(0);
  await page.locator('#undo-builder').click();await chip(root,1).click();await expect(root.locator('.pt-battery .btval')).toHaveText('43%');

  // Clearing the start turns story time off and restores the legacy panels.
  await page.locator('#docview h3').filter({hasText:'Night'}).click();
  await start.fill('');await start.press('Tab');
  expect(d(await spec()).storyTime).toBeUndefined();
  await expect(root.locator('.pt-phone .phoneclock')).toHaveText('');
  await page.locator('#undo-builder').click();await expect(root.locator('.pt-phone .phoneclock')).not.toHaveText('');
  expect(started.length).toBeGreaterThan(source.length);
});
