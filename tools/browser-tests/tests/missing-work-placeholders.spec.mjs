/* Desktop authoring: local/imported placeholders, shared coverage prompt, keyless rows, step paint and Undo. */
import {test,expect,paste,prepareEditorSurface,inspectPageElement,closeTools} from '../helpers/test.mjs';
import {ticketRow,nodeCard,cardPoint,dragTicket} from '../helpers/board-edit.mjs';
import {digest} from '../../canon/drift.mjs';
const first={id:'MISSING-1',title:'Set thermal issue bits'},second={id:'MISSING-2',title:'Report thermal issue bits'};
const diagram=()=>({autoplay:false,nodes:{mcu:{title:'MCU',missingWork:[first,second]},source:{title:'Existing work',tickets:['EX-1']}},rows:[['mcu','source']],edges:[{from:'mcu',to:'source',label:'Report'}],panels:[{id:'status',type:'live-status'}],steps:[{id:'bits',nodes:['mcu','source'],text:'Set bits',ticketFilter:['MISSING-1']},{id:'report',nodes:['mcu','source'],text:'Report bits',ticketFilter:['MISSING-2','MISSING-1']},{id:'finished',nodes:['mcu','source'],text:'Existing work',ticketFilter:['EX-1']}]});
const model=d=>({page:{title:'Missing work',sections:[{id:'main',diagram:d}]}}),source=async page=>JSON.parse(await page.locator('#src').inputValue()),d=raw=>raw.page.sections[0].diagram;
async function open(page,server,change){const raw=model(diagram());if(change)change(d(raw));await page.setViewportSize({width:1600,height:1100});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);}
async function add(page,id,key){await inspectPageElement(page,page.locator('#docview g.node[data-dv-node="'+id+'"] .t1').first());const field=page.locator('#guide').getByRole('group',{name:'Tracking',exact:true}).getByLabel('Add ticket',{exact:true});await field.fill(key);await field.press('Enter');return page.getByRole('dialog',{name:'Cover missing work',exact:true});}

test('desktop Inspect chooses one placeholder, rewrites all filters in one Undo; Keep and Escape retain work',async({page,server})=>{
 await open(page,server);const before=await page.locator('#src').inputValue();let dialog=await add(page,'mcu','EX-2');await expect(dialog).toBeVisible();await expect(dialog).toContainText('Does EX-2 cover: Set thermal issue bits?');
 await dialog.getByLabel('Missing work to replace').selectOption('1');await expect(dialog).toContainText('Does EX-2 cover: Report thermal issue bits?');await dialog.getByRole('button',{name:'Clear',exact:true}).click();
 await expect.poll(async()=>d(await source(page)).nodes.mcu.missingWork).toEqual([first]);await expect.poll(async()=>d(await source(page)).steps.map(st=>st.ticketFilter)).toEqual([['MISSING-1'],['EX-2','MISSING-1'],['EX-1']]);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.getByRole('dialog',{name:'Cover missing work'})).toHaveCount(0);await page.locator('#undo-builder').click();
 dialog=await add(page,'mcu','EX-3');await dialog.getByRole('button',{name:'Keep',exact:true}).click();await expect.poll(async()=>d(await source(page)).nodes.mcu.tickets).toEqual(['EX-3']);expect(d(await source(page)).nodes.mcu.missingWork).toEqual([first,second]);expect(d(await source(page)).steps.map(st=>st.ticketFilter)).toEqual(d(JSON.parse(before)).steps.map(st=>st.ticketFilter));
 await page.locator('#undo-builder').click();dialog=await add(page,'mcu','EX-4');await dialog.press('Escape');await expect.poll(async()=>d(await source(page)).nodes.mcu.tickets).toEqual(['EX-4']);expect(d(await source(page)).nodes.mcu.missingWork).toEqual([first,second]);
});

test('desktop preview drop asks the same question; placeholder rows have no Jira key or drag payload',async({page,server})=>{
 await open(page,server);await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();await closeTools(page);
 const view=page.locator('#docview'),panel=view.locator('.pt-live-status'),rows=panel.locator('tr[data-missing-work]');await expect(rows).toHaveCount(2);
 for(const row of await rows.all()){await expect(row.locator('.dv-live-ticket-key')).toHaveText('—');await expect(row.locator('.dv-live-ticket-key a')).toHaveCount(0);await expect(row).not.toHaveAttribute('draggable','true');await expect(row).not.toHaveAttribute('data-live-ticket',/./);}
 const before=await page.locator('#src').inputValue();await ticketRow(panel,'EX-1').scrollIntoViewIfNeeded();await dragTicket(page,panel,'EX-1',await cardPoint(nodeCard(view,'mcu')));
 const dialog=page.getByRole('dialog',{name:'Cover missing work'});await expect(dialog).toContainText('Does EX-1 cover: Set thermal issue bits?');await dialog.getByRole('button',{name:'Clear',exact:true}).click();
 await expect.poll(async()=>d(await source(page)).nodes.mcu.missingWork).toEqual([second]);expect(d(await source(page)).steps[0].ticketFilter).toEqual(['EX-1']);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});

test('desktop selected-step paint and checklist scope a shared node marker to listed placeholders',async({page,server})=>{
 await open(page,server,diagram=>{diagram.edges[0].missingWork=[{id:'EDGE-WORK',title:'Delivery retry'}];diagram.steps.forEach(step=>step.edge='mcu->source');diagram.steps[1].ticketFilter.push('EDGE-WORK');});await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();await closeTools(page);
 const node=page.locator('#docview g.node[data-dv-node="mcu"]'),chips=page.locator('#docview button.schip[data-step-source]');const edge=page.locator('#docview path.edge[data-dv-edge="0"]');await chips.nth(0).click();await expect(node).toHaveClass(/dv-live-missing/);await expect(edge).not.toHaveClass(/dv-live-missing/);await chips.nth(2).click();await expect(node).not.toHaveClass(/dv-live-missing/);await expect(edge).not.toHaveClass(/dv-live-missing/);await chips.nth(1).click();await expect(node).toHaveClass(/dv-live-missing/);await expect(edge).toHaveClass(/dv-live-missing/);
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
 const list=page.locator('#guide').getByRole('group',{name:'Tickets on this step',exact:true});await expect(list.getByRole('checkbox',{name:'Set thermal issue bits (MISSING-1, missing work)',exact:true})).toBeChecked();await expect(list.getByRole('checkbox',{name:'Report thermal issue bits (MISSING-2, missing work)',exact:true})).not.toBeChecked();
});

test('desktop inherited placeholder is replaced in a consumer overlay; Undo restores inheritance',async({page,server})=>{
 await page.setViewportSize({width:1600,height:1100});const make=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=make('provider',{nodes:{mcu:{title:'MCU',missingWork:[first,second]}},rows:[['mcu']],topologyExports:{core:{nodes:['mcu'],edges:[]}}}),consumer=make('consumer',{nodes:{source:{title:'Existing work',tickets:['EX-1']}},rows:[['source']],topologyImports:[{spec:'provider',export:'core',as:'canon'}],steps:[{id:'bits',nodes:['canon::mcu','source'],text:'Set bits',ticketFilter:['MISSING-1']},{id:'done',nodes:['canon::mcu','source'],text:'Existing work',ticketFilter:['EX-1']}],panels:[{id:'status',type:'live-status'}]});
 const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:1,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});await expect(page.locator('#docview g.node[data-dv-node="canon::mcu"]')).toBeVisible();await closeTools(page);
 await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();await closeTools(page);
 const importedNode=page.locator('#docview g.node[data-dv-node="canon::mcu"]'),chips=page.locator('#docview button.schip[data-step-source]');await chips.nth(0).click();await expect(importedNode).toHaveClass(/dv-live-missing/);await chips.nth(1).click();await expect(importedNode).not.toHaveClass(/dv-live-missing/);
 const before=await page.locator('#src').inputValue(),dialog=await add(page,'canon::mcu','EX-2');await expect(dialog).toContainText('Does EX-2 cover: Set thermal issue bits?');await dialog.getByRole('button',{name:'Clear',exact:true}).click();await expect.poll(async()=>d(await source(page)).topologyImports[0].nodeTracking).toEqual({mcu:{tickets:['EX-2'],missingWork:[second]}});expect(d(await source(page)).steps[0].ticketFilter).toEqual(['EX-2']);expect(provider.page.sections[0].diagram.nodes.mcu.missingWork).toEqual([first,second]);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});

test('desktop Links assignment shares the coverage chooser and a held question cannot overwrite changed source',async({page,server})=>{
 await open(page,server);const before=await page.locator('#src').inputValue();await closeTools(page);await page.locator('#editor-tab-links').click();
 await page.locator('#workspace-window-links [data-links-ticket="EX-1"]').getByRole('button',{name:'Assign EX-1',exact:true}).click();await page.getByRole('dialog',{name:'Assign EX-1',exact:true}).getByRole('checkbox',{name:'MCU',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Cover missing work',exact:true});await expect(dialog).toContainText('Does EX-1 cover: Set thermal issue bits?');await dialog.getByRole('button',{name:'Clear',exact:true}).click();await expect.poll(async()=>d(await source(page)).nodes.mcu.missingWork).toEqual([second]);
 await page.keyboard.press('Escape');await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 dialog=await add(page,'mcu','EX-2');await expect(dialog).toBeVisible();
 const changed=JSON.parse(before);changed.page.title='Changed while question was open';const changedText=JSON.stringify(changed,null,2);
 await page.locator('#src').evaluate((input,text)=>{input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));},changedText);
 await dialog.getByRole('button',{name:'Clear',exact:true}).click();await expect(page.locator('#src')).toHaveValue(changedText);expect(d(await source(page)).nodes.mcu.missingWork).toEqual([first,second]);expect(d(await source(page)).nodes.mcu.tickets).toBeUndefined();
});
