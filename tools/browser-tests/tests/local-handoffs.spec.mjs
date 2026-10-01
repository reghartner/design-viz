import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,openInspectorGroup,paste,inspectPageElement} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const example=JSON.parse(await readFile(path.join(repo,'examples/tab-handoffs/tab-handoffs.spec.json'),'utf8'));
async function standalone(page,server,raw=example){
 const spec=path.join(server.root,'local-handoffs.json');await writeFile(spec,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),path.join(server.root,'local-handoffs.html')]);
 await page.goto(server.origin+'/local-handoffs.html');
}
const section=(page,id)=>page.locator('#section-'+id);

test('local handoffs switch spec tabs in place, return to the source beat and support browser Back/Forward',async({page,server,context})=>{
 await standalone(page,server);
 const orders=section(page,'orders'),delivery=section(page,'delivery');
 await orders.getByRole('button',{name:'Go to step 2',exact:true}).click();
 const sourceURL=page.url();
 const next=orders.getByRole('button',{name:'Open Delivery diagram in this spec',exact:true});
 await next.focus();await next.press('Enter');
 await expect(page.getByRole('tab',{name:'Delivery pipeline',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(delivery).toBeVisible();await expect(orders).toBeHidden();
 expect(context.pages()).toHaveLength(1);expect(page.url()).toContain('d=delivery');
 await delivery.getByRole('button',{name:'Go to step 3',exact:true}).click();
 await page.goBack();await expect(orders).toBeVisible();expect(page.url()).toBe(sourceURL);
 await page.goForward();await expect(delivery).toBeVisible();expect(page.url()).toContain('s=beat3');
 await page.getByRole('button',{name:'Back to Order intake',exact:false}).click();
 await expect(orders).toBeVisible();expect(page.url()).toContain('s=beat2');
 await expect(next).toBeFocused();
 await page.goBack();await expect(delivery).toBeVisible();expect(page.url()).toContain('s=beat3');
 await page.goForward();await expect(orders).toBeVisible();expect(page.url()).toContain('s=beat2');
 await next.press('Space');await expect(delivery).toBeVisible();expect(page.url()).toContain('s=beat3');
 await delivery.getByRole('button',{name:'Open Order intake diagram in this spec',exact:true}).click();
 await expect(orders).toBeVisible();expect(page.url()).toContain('s=beat2');
});

test('workbench authors a local handoff atomically, previews its arrow tip and undoes it',async({page,server})=>{
 const raw=structuredClone(example);delete raw.page.blocks[0].tabs[0].sections[0].diagram.nodes.continue.handoff;
 const source=JSON.stringify(raw,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 await inspectPageElement(page,page.locator('[data-dv-node="continue"] .t1').first());
 await openInspectorGroup(page.locator('#guide .node-handoff-editor'));
 await page.getByLabel('Handoff destination',{exact:true}).selectOption({label:'This spec'});
 await page.getByLabel('Destination section',{exact:true}).selectOption('delivery');
 await page.getByRole('button',{name:'Apply handoff',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[0].sections[0].diagram.nodes.continue.handoff).toEqual({localSection:'delivery'});
 const arrow=page.locator('[data-dv-handoff="delivery"]');await arrow.focus();await arrow.press('Enter');
 await expect(page.getByRole('tab',{name:'Delivery pipeline',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Back to Order intake',exact:false}).click();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
 await page.locator('#redo-builder').click();
 await expect(page.locator('[data-dv-handoff="delivery"]')).toBeVisible();
});

test('native local handoffs stay inside their viewer and release navigation on destroy',async({page,server})=>{
 await writeFile(path.join(server.root,'local-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'local-native.html'),'<div id="one"></div><div id="two"></div><script type="module">import {mountNativeViewer} from "./local-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/local-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.calls=0;window.first=mount(document.querySelector('#one'),raw,{onChange(){calls++;}});window.second=mount(document.querySelector('#two'),raw,{});},example);
 const one=page.locator('#one'),two=page.locator('#two');
 await one.getByRole('button',{name:'Go to step 2',exact:true}).first().click();
 await one.getByRole('button',{name:'Open Delivery diagram in this spec',exact:true}).click();
 await expect(one.getByRole('tab',{name:'Delivery pipeline',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(two.getByRole('tab',{name:'Order intake',exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>first.snapshot().section)).toBe('delivery');
 await one.getByRole('button',{name:'Back to Order intake',exact:false}).click();
 expect(await page.evaluate(()=>first.snapshot().step)).toBe('beat2');
 await page.evaluate(()=>{window.detached=first.root.querySelector('[data-dv-handoff]');first.destroy();window.after=calls;detached?.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 expect(await page.evaluate(()=>calls)).toBe(await page.evaluate(()=>after));await expect(one).toBeEmpty();
 await two.getByRole('button',{name:'Open Delivery diagram in this spec',exact:true}).click();
 await expect(two.getByRole('tab',{name:'Delivery pipeline',exact:true})).toHaveAttribute('aria-selected','true');
});

for(const narrow of [false,true])test(`Explore handoff and return preserve the source beat${narrow?' on a narrow screen':''}`,async({page,server},testInfo)=>{
 if(narrow)await page.setViewportSize({width:480,height:850});
 const raw=structuredClone(example);
 for(const tab of raw.page.blocks[0].tabs){
  const d=tab.sections[0].diagram;
  d.layouts=[{id:'canvas',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12},{controls:'steps',x:0,y:12,w:12,h:4}]}}];d.defaultLayout='canvas';
 }
 await standalone(page,server,raw);
 const orders=section(page,'orders'),delivery=section(page,'delivery');
 await expect(orders.locator('.explore-board')).toBeVisible();
 await orders.getByRole('button',{name:'Go to step 2',exact:true}).click();
 const next=orders.getByRole('button',{name:'Open Delivery diagram in this spec',exact:true});
 // Keyboard activation also works for an endpoint beyond the visible canvas.
 await next.focus();await next.press('Enter');
 await expect(delivery.locator('.explore-board')).toBeVisible();
 const back=delivery.getByRole('button',{name:'Back to Order intake',exact:false});
 await expect(back).toBeInViewport();
 await expect(delivery.locator('[data-dv-node="start"]')).toBeInViewport();
 await page.screenshot({path:testInfo.outputPath('handoff-destination.png')});
 await back.click();await expect(orders.locator('.explore-board')).toBeVisible();expect(page.url()).toContain('s=beat2');
 await expect(next).toBeFocused();
});

test('handoffs resolve duplicate tab labels across blocks and diagrams without steps',async({page,server})=>{
 const raw=structuredClone(example),tabs=raw.page.blocks[0].tabs;
 delete tabs[1].sections[0].diagram.steps;
 raw.page.blocks=[{heading:'Notes',text:'A prose section before both blocks.'},{tabs:[tabs[0]]},{tabs:[{...tabs[1],label:tabs[0].label}]}];
 await standalone(page,server,raw);
 await section(page,'orders').getByRole('button',{name:'Open Delivery diagram in this spec',exact:true}).click();
 await expect(section(page,'delivery').getByRole('button',{name:'Back to Order intake',exact:false})).toBeVisible();
 expect(page.url()).toContain('d=delivery');
 await page.reload();await expect(section(page,'delivery')).toBeInViewport();
 await section(page,'delivery').getByRole('button',{name:'Open Order intake diagram in this spec',exact:true}).click();
 expect(page.url()).toContain('d=orders');
});

test('a section embed follows local handoffs and restores the destination after reload',async({page,server})=>{
 await standalone(page,server);
 await page.goto(server.origin+'/local-handoffs.html#embed=orders');
 await section(page,'orders').getByRole('button',{name:'Open Delivery diagram in this spec',exact:true}).click();
 await expect(section(page,'delivery')).toBeVisible();await expect(section(page,'orders')).toBeHidden();
 await page.reload();await expect(section(page,'delivery')).toBeVisible();await expect(section(page,'orders')).toBeHidden();
 await section(page,'delivery').getByRole('button',{name:'Open Order intake diagram in this spec',exact:true}).click();
 await expect(section(page,'orders')).toBeVisible();
 await page.goBack();await expect(section(page,'delivery')).toBeVisible();
});
