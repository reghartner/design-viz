/* #1243 part 3: the desktop Workbench Links window, Log searches tab (mockup m5).
   The board-wide searches (tracking.telemetry.lookups), not linked to elements.
   row | fixture | assertion | rejects
   L1 list + preview | board below (validates with 0 errors, 0 warnings) | the tab says Log searches (3) before it opens; rows camera, device, errors in order with kinds Pick from list, Typed, No value; the region "Trace view preview (read only)" shows the three boxes in that order, has no focusable controls and no pointer cursor | a stale order, a preview that looks clickable
   L2 Later / Earlier | same | ↓ Later on camera writes device, camera, errors in one Undo step and the preview follows; Earlier on the first row is aria-disabled with its reason, and Enter on it writes nothing | a move that needs two Undo steps
   L3 drag reorder | same | dragging errors' handle above camera writes errors, camera, device in one Undo step; Esc mid-drag writes nothing | a drop that writes nothing, Esc that writes
   L4 inline edit | same | Edit camera, change Query, Tab out: one Undo step; an empty Label is refused beside Label with aria-invalid and nothing written | errors far from the field
   L5 Viewer value | same | Typed on camera clears its suggested values in one Undo step; None on device is aria-disabled with "Remove $value from the query", and Enter on it writes nothing | a None that leaves a dangling $value
   L6 add + remove | same | + New log search (label Order ID, query with $value) adds lookups.order-id last; Remove log search Order ID removes it; one Undo each | ids not made from the label
   L8 ignored searches | camera label 90 characters, device value with a quote, errors with values but no $value (0 validator errors, 3 warnings) | each row says "Not shown in the Trace view: …"; the preview names them instead of drawing boxes; the editor marks the faulty field aria-invalid with the warning beside it; Pick from list on a search without $value is aria-disabled with its reason and Enter writes nothing; after Typed, focus stays on Typed | a preview that draws searches the Trace view drops, a pick list that gets a search dropped
   L7 two-way sync | same | a Query edit in Links shows in Status board settings → Log searches; a label edit there shows in the Links row, with no reload | a stale copy in either place */
import {test,expect,paste,closeTools,pointerTo} from '../helpers/test.mjs';

const fixture={page:{title:'Doorbell',tracking:{telemetry:{lookups:{
  camera:{label:'Camera model',query:'{env="$env"} |= "Handling camera stats message" | cameraModel="$value"',values:['arch','wren']},
  device:{label:'Find by my device ID',query:'{env="$env"} | device_id="$value"'},
  errors:{label:'Recent errors',query:'{env="$env"} | severity_text="ERROR"'}}}},
  sections:[{heading:'Flow',diagram:{autoplay:false,nodes:{ctrl:{title:'Doorbell controller'},ingest:{title:'Event ingest'}},rows:[['ctrl','ingest']],edges:[{from:'ctrl',to:'ingest',label:'event'}],
    panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}};
const source=async page=>JSON.parse(await page.locator('#src').inputValue());
const lookups=raw=>raw.page.tracking.telemetry.lookups;
const order=async page=>Object.keys(lookups(await source(page)) || {});

async function open(page,server,spec=fixture){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html');
  const text=JSON.stringify(spec,null,2);await paste(page,text);
  await expect(page.locator('#docview g.node[data-dv-node="ctrl"]')).toBeVisible();await closeTools(page);
  await page.locator('#editor-tab-links').click();
  const links=page.locator('#workspace-window-links');await expect(links).toBeVisible();
  // The count shows before the tab is opened.
  await expect(links.getByRole('tab',{name:'Log searches ('+Object.keys(spec.page.tracking.telemetry.lookups).length+')',exact:true})).toBeVisible();
  await links.getByRole('tab',{name:/^Log searches/}).click();
  const panel=links.getByRole('tabpanel');await expect(panel.locator('[data-links-log]')).toHaveCount(Object.keys(spec.page.tracking.telemetry.lookups).length);
  return {links,panel,text};
}
const row=(panel,id)=>panel.locator('[data-links-log="'+id+'"]');

test('L1 the tab lists the searches in Trace view order with their kind, and a read-only preview',async({page,server})=>{
  const {panel}=await open(page,server);
  expect(await panel.locator('[data-links-log]').evaluateAll(list=>list.map(el=>el.getAttribute('data-links-log')))).toEqual(['camera','device','errors']);
  await expect(row(panel,'camera').locator('.links-log-kind')).toHaveText('Pick from list');
  await expect(row(panel,'device').locator('.links-log-kind')).toHaveText('Typed');
  await expect(row(panel,'errors').locator('.links-log-kind')).toHaveText('No value');
  const preview=panel.getByRole('region',{name:'Trace view preview (read only)',exact:true});await expect(preview).toBeVisible();
  await expect(preview.locator('.links-preview-box .links-preview-label')).toHaveText(['Camera model','Find by my device ID','Recent errors']);
  expect(await preview.evaluate(n=>n.querySelectorAll('a,button,input,select,textarea,[tabindex],[contenteditable]').length)).toBe(0);
  expect(await preview.evaluate(n=>[n,...n.querySelectorAll('*')].some(e=>getComputedStyle(e).cursor==='pointer'))).toBe(false);
});

test('L2 Later moves a search one place in one Undo step; Earlier on the first row is refused by keyboard',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await row(panel,'camera').getByRole('button',{name:'Move Camera model later',exact:true}).click();
  await expect.poll(()=>order(page)).toEqual(['device','camera','errors']);
  await expect(panel.getByRole('region',{name:'Trace view preview (read only)'}).locator('.links-preview-label')).toHaveText(['Find by my device ID','Camera model','Recent errors']);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  const earlier=row(panel,'camera').getByRole('button',{name:'Move Camera model earlier',exact:true});
  await expect(earlier).toHaveAttribute('aria-disabled','true');
  await expect(page.locator('#'+await earlier.getAttribute('aria-describedby'))).toContainText('first');
  await earlier.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#src')).toHaveValue(text);
});

test('L3 dragging a row handle reorders in one Undo step; Esc mid-drag writes nothing',async({page,server})=>{
  const {panel,text}=await open(page,server);
  const handle=row(panel,'errors').getByRole('button',{name:'Drag Recent errors to reorder',exact:true});
  const box=await handle.boundingBox();expect(box.width).toBeGreaterThanOrEqual(24);expect(box.height).toBeGreaterThanOrEqual(24);
  const top=await row(panel,'camera').boundingBox();
  await pointerTo(page,handle,row(panel,'camera'),{release:false});
  await page.mouse.move(top.x+top.width/2,top.y+4,{steps:4});
  await expect(row(panel,'camera')).toHaveClass(/links-log-drop-before/);
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('#src')).toHaveValue(text);
  await pointerTo(page,handle,row(panel,'camera'),{release:false});
  await page.mouse.move(top.x+top.width/2,top.y+4,{steps:4});
  await page.mouse.up();
  await expect.poll(()=>order(page)).toEqual(['errors','camera','device']);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('L4 the inline editor saves a field in one Undo step and refuses an empty label beside it',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await row(panel,'camera').getByRole('button',{name:'Edit Camera model',exact:true}).click();
  const form=panel.getByRole('group',{name:'Log search camera',exact:true});await expect(form).toBeVisible();
  const query=form.getByRole('textbox',{name:'Query',exact:true});
  await query.fill('{env="$env"} | cameraModel="$value"');await query.press('Tab');
  await expect.poll(async()=>lookups(await source(page)).camera.query).toBe('{env="$env"} | cameraModel="$value"');
  expect(lookups(await source(page)).camera.values).toEqual(['arch','wren']);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  const label=panel.getByRole('group',{name:'Log search camera',exact:true}).getByRole('textbox',{name:'Label',exact:true});
  await label.fill('');await label.press('Enter');
  await expect(label).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#'+await label.getAttribute('aria-describedby'))).toContainText('needs a label');
  await expect(page.locator('#src')).toHaveValue(text);
});

test('L5 Viewer value: Typed clears suggested values; None is refused while the query has $value',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await row(panel,'camera').getByRole('button',{name:'Edit Camera model',exact:true}).click();
  const viewer=panel.getByRole('group',{name:'Log search camera',exact:true}).getByRole('group',{name:'Viewer value',exact:true});
  await expect(viewer.getByRole('button',{name:'Pick from list',exact:true})).toHaveAttribute('aria-pressed','true');
  await viewer.getByRole('button',{name:'Typed',exact:true}).click();
  await expect.poll(async()=>lookups(await source(page)).camera.values).toBeUndefined();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
  await row(panel,'device').getByRole('button',{name:'Edit Find by my device ID',exact:true}).click();
  const none=panel.getByRole('group',{name:'Log search device',exact:true}).getByRole('group',{name:'Viewer value',exact:true}).getByRole('button',{name:'None',exact:true});
  await expect(none).toHaveAttribute('aria-disabled','true');
  await expect(page.locator('#'+await none.getAttribute('aria-describedby'))).toContainText('Remove $value from the query');
  await none.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#src')).toHaveValue(text);
});

test('L6 + New log search adds one with an id from its label; Remove deletes it; one Undo each',async({page,server})=>{
  const {panel,text}=await open(page,server);
  await panel.getByRole('button',{name:'+ New log search',exact:true}).click();
  const form=panel.getByRole('group',{name:'New log search',exact:true});
  await form.getByRole('textbox',{name:'Label',exact:true}).fill('Order ID');
  await form.getByRole('textbox',{name:'Query',exact:true}).fill('{env="$env"} |= "order placed" | order_id="$value"');
  await expect(form).toContainText('order-id');
  await form.getByRole('button',{name:'Add log search',exact:true}).click();
  await expect.poll(()=>order(page)).toEqual(['camera','device','errors','order-id']);
  expect(lookups(await source(page))['order-id']).toEqual({label:'Order ID',query:'{env="$env"} |= "order placed" | order_id="$value"'});
  const added=await page.locator('#src').inputValue();
  await row(panel,'order-id').getByRole('button',{name:'Edit Order ID',exact:true}).click();
  await panel.getByRole('button',{name:'Remove log search Order ID',exact:true}).click();
  await expect.poll(()=>order(page)).toEqual(['camera','device','errors']);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(added);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);
});

test('L7 an edit in Links shows in Status board settings, and an edit there shows in Links, with no reload',async({page,server})=>{
  const {panel,links}=await open(page,server);
  await row(panel,'camera').getByRole('button',{name:'Edit Camera model',exact:true}).click();
  const query=panel.getByRole('group',{name:'Log search camera',exact:true}).getByRole('textbox',{name:'Query',exact:true});
  await query.fill('{env="$env"} | camera="$value"');await query.press('Tab');
  await expect.poll(async()=>lookups(await source(page)).camera.query).toBe('{env="$env"} | camera="$value"');
  await page.locator('#editor-tab-inspect').click();await page.locator('#status-board-settings').click();
  const section=page.locator('#guide details.board-section[data-board-section="lookups"]');await expect(section).toHaveCount(1);
  if(!await section.evaluate(d=>d.open))await section.locator(':scope > summary').click();
  const fold=section.locator('details.log-search[data-log-search="camera"]');if(!await fold.evaluate(d=>d.open))await fold.locator(':scope > summary').click();
  await expect(section.getByLabel('camera query',{exact:true})).toHaveValue('{env="$env"} | camera="$value"');
  const deviceFold=section.locator('details.log-search[data-log-search="device"]');if(!await deviceFold.evaluate(d=>d.open))await deviceFold.locator(':scope > summary').click();
  const label=section.getByLabel('device label',{exact:true});await label.fill('Device ID');await label.press('Enter');
  await expect.poll(async()=>lookups(await source(page)).device.label).toBe('Device ID');
  await page.locator('#editor-tab-links').click();
  await expect(row(links.getByRole('tabpanel'),'device').locator('.links-log-label')).toHaveText('Device ID');
});

test('L8 searches the Trace view would drop are named, not drawn; warnings sit beside their field; Pick from list needs $value',async({page,server})=>{
  const spec=JSON.parse(JSON.stringify(fixture)),l=spec.page.tracking.telemetry.lookups;
  l.camera.label='Camera model '.repeat(7).trim();l.device.values=['a"b'];l.errors.values=['ERROR'];
  const {panel,text}=await open(page,server,spec);
  for(const id of ['camera','device','errors'])await expect(row(panel,id).locator('.links-log-ignored')).toContainText('Not shown in the Trace view');
  await expect(row(panel,'errors').locator('.links-log-ignored')).toContainText('no $value slot');
  const preview=panel.getByRole('region',{name:'Trace view preview (read only)'});
  await expect(preview.locator('.links-preview-ignored')).toHaveCount(3);await expect(preview.locator('.links-preview-control')).toHaveCount(0);
  await row(panel,'errors').getByRole('button',{name:'Edit Recent errors',exact:true}).click();
  const form=panel.getByRole('group',{name:'Log search errors',exact:true});
  const query=form.getByRole('textbox',{name:'Query',exact:true});
  await expect(query).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#'+await query.getAttribute('aria-describedby'))).toContainText('no $value slot');
  const pick=form.getByRole('group',{name:'Viewer value',exact:true}).getByRole('button',{name:'Pick from list',exact:true});
  await expect(pick).toHaveAttribute('aria-disabled','true');
  await expect(page.locator('#'+await pick.getAttribute('aria-describedby'))).toContainText('Add $value to the query');
  await pick.focus();await page.keyboard.press('Enter');await expect(page.locator('#src')).toHaveValue(text);
  // A refused choice keeps focus; so does a choice that writes (Typed on device keeps focus on Typed).
  await expect(pick).toBeFocused();
  await row(panel,'device').getByRole('button',{name:'Edit Find by my device ID',exact:true}).click();
  const typed=panel.getByRole('group',{name:'Log search device',exact:true}).getByRole('group',{name:'Viewer value',exact:true}).getByRole('button',{name:'Typed',exact:true});
  await typed.focus();await page.keyboard.press('Enter');
  await expect.poll(async()=>lookups(await source(page)).device.values).toBeUndefined();
  await expect(panel.getByRole('group',{name:'Log search device',exact:true}).getByRole('group',{name:'Viewer value',exact:true}).getByRole('button',{name:'Typed',exact:true})).toBeFocused();
  // Esc in an editor text box returns to that row's Edit button.
  await panel.getByRole('group',{name:'Log search device',exact:true}).getByRole('textbox',{name:'Label',exact:true}).focus();await page.keyboard.press('Escape');
  await expect(row(panel,'device').getByRole('button',{name:'Edit Find by my device ID',exact:true})).toBeFocused();
});
