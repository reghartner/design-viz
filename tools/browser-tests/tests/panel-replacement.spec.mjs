import {test,expect,pastePage,inspectPageElement} from '../helpers/test.mjs';
const fixture=()=>({page:{title:'Replacement review',sections:[{heading:'Work',diagram:{
 nodes:{n:{title:'Worker'}},rows:[['n']],primaryPanel:'work',
 panels:[{id:'work',type:'queue',title:'Work waiting',visible:true,initial:{state:'full'},futureSetup:{secret:'keep in backup'}},{id:'keep',type:'gauge',title:'Other panel',initial:{value:8}}],
 steps:[{id:'shared',text:'Shared work',nodes:['n'],panels:{work:{state:'full'},keep:{value:9}},panelVisibility:{work:true}},
 {id:'alternate',text:'Retry work',nodes:['n'],patch:{work:{state:'empty'}},panelVisibility:{work:false}}],
 paths:[{id:'happy',label:'Happy path',steps:['shared']},{id:'retry',label:'Retry path',steps:['shared','alternate']}]
}}]}});
const panel=page=>page.locator('#docview [data-dv-panel="0"]').first();
async function open(page,type='timeline'){
 await inspectPageElement(page,panel(page));await page.locator('#guide').getByRole('button',{name:'Change panel type…',exact:true}).click();
 await page.locator('#panel-picker-search').fill(type);await page.locator('.panel-picker-card[data-panel-type="'+type+'"]').click();
}
async function review(page){await page.locator('#panel-picker-add').click();await expect(page.locator('#panel-picker-review')).toBeVisible();}

test('panel replacement requires review, seeds setup, clears every path override and has one exact Undo',async({page,server},info)=>{
 const raw=fixture(),original=JSON.stringify(raw,null,2),src=page.locator('#src');await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
 await open(page);await expect(src).toHaveValue(original);await review(page);await expect(src).toHaveValue(original);
 const summary=page.locator('#panel-picker-review');await expect(summary).toContainText('futureSetup');await expect(summary).toContainText('initial');
 await expect(summary).toContainText('Happy path, Retry path');await expect(summary).toContainText('Step 2 · alternate');
 await expect(page.locator('#panel-picker-original')).toHaveValue(JSON.stringify(raw.page.sections[0].diagram,null,2));
 await info.attach('replacement-review',{body:await page.locator('#panel-picker').screenshot(),contentType:'image/png'});
 for(const key of ['Delete','ControlOrMeta+z'])await page.keyboard.press(key);await expect(src).toHaveValue(original);
 await page.locator('#panel-picker-back').click();await expect(summary).toBeHidden();await expect(src).toHaveValue(original);
 await review(page);await page.locator('#panel-picker-add').click();await expect(page.locator('#panel-picker')).toBeHidden();
 const replaced=await src.inputValue(),result=JSON.parse(replaced),d=result.page.sections[0].diagram;
 expect(d.panels[0]).toMatchObject({id:'work',type:'timeline',title:'Work waiting',visible:true,span:'6h'});expect(d.panels[0]).not.toHaveProperty('futureSetup');
 expect(d.panels[0].initial).not.toEqual({state:'full'});expect(d.panels[1]).toEqual(raw.page.sections[0].diagram.panels[1]);expect(d.primaryPanel).toBe('work');
 expect(d.steps[0].panels).toEqual({keep:{value:9}});expect(d.steps[1].patch).toEqual({});expect(d.paths).toEqual(raw.page.sections[0].diagram.paths);
 expect(d.steps.map(s=>s.panelVisibility)).toEqual([{work:true},{work:false}]);await expect(panel(page)).toHaveClass(/dv-sel/);
 await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);await page.locator('#redo-builder').click();await expect(src).toHaveValue(replaced);
 await page.locator('#add-panel').click();await expect(page.locator('#panel-picker-title')).toHaveText('Give your story another dimension.');
 await expect(page.locator('#panel-picker-review')).toBeHidden();await expect(page.locator('#panel-picker-add')).toHaveText('Add panel');
 await page.locator('#panel-picker-cancel').click();await expect(src).toHaveValue(replaced);
});

test('cancellation and stale source or target cannot apply a reviewed replacement',async({page,server})=>{
 const original=JSON.stringify(fixture(),null,2),src=page.locator('#src');await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
 await open(page);await review(page);await page.keyboard.press('Escape');await expect(src).toHaveValue(original);
 await expect(page.locator('#guide').getByRole('button',{name:'Change panel type…',exact:true})).toBeFocused();
 await open(page);await review(page);
 await page.evaluate(()=>document.querySelector('#docview [data-dv-panel="1"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 await expect(page.locator('#panel-picker-add')).toBeDisabled();await page.evaluate(()=>document.querySelector('#panel-picker-add').dispatchEvent(new MouseEvent('click',{bubbles:true})));await expect(src).toHaveValue(original);
 await page.keyboard.press('Escape');await open(page);await review(page);
 const changed=original.replace('Work waiting','Changed');await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);
 await expect(page.locator('#panel-picker-add')).toBeDisabled();await expect(page.locator('#panel-picker-status')).toContainText('changed');
 await page.evaluate(()=>document.querySelector('#panel-picker-add').dispatchEvent(new MouseEvent('click',{bubbles:true})));await expect(src).toHaveValue(changed);
});

test('replacement review retires on same-source project replacement and builder destroy, and fits narrow screens',async({page,server},info)=>{
 const original=JSON.stringify(fixture(),null,2),src=page.locator('#src');await page.goto(server.origin+'/lifetime/index.html');await pastePage(page,original);
 await open(page);await review(page);
 await page.evaluate(text=>__editorTest.builder.loadText(text),original);await expect(page.locator('#panel-picker')).toBeHidden();await expect(src).toHaveValue(original);
 await page.evaluate(()=>document.querySelector('#panel-picker-add').dispatchEvent(new MouseEvent('click',{bubbles:true})));await expect(src).toHaveValue(original);
 await open(page);await review(page);await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.locator('#panel-picker')).toBeHidden();
 await page.evaluate(()=>__editorTest.remount());await open(page);await review(page);await page.setViewportSize({width:720,height:800});
 const picker=page.locator('#panel-picker');expect(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await expect(page.locator('#panel-picker-add')).toBeInViewport();await info.attach('replacement-review-narrow',{body:await picker.screenshot(),contentType:'image/png'});
 await page.locator('#panel-picker-add').click();await expect(panel(page)).toHaveClass(/pt-timeline/);await page.locator('#undo-builder').click();await expect(src).toHaveValue(original);
});
