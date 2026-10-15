import {test,expect,pastePage,closeTools,chooseAddDestination} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
const source=page=>page.locator('#src').inputValue();
const menu=page=>page.getByRole('menu',{name:'Add to diagram',exact:true});
function fixture(explore){const raw=editorSpec(),d=raw.page.blocks[0].diagram;d.layouts[0].presentation=explore?'explore':'standard';d.layouts[0].exploreLayout={panelPlacement:'canvas',canvas:{panels:[{panel:'home',x:700,y:100,w:280,h:160}]}};return raw;}
async function setup(page,server,explore){await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(fixture(explore)));await closeTools(page);}
// Find actual exposed background pixels, avoiding objects and editing chrome.
async function blank(page,section=0){return page.locator('.doc-sec[data-dv-section="'+section+'"] .board').evaluate(board=>{const r0=board.getBoundingClientRect(),r={left:Math.floor(r0.left),right:Math.floor(r0.right),top:Math.floor(r0.top),bottom:Math.floor(r0.bottom)},svg=board.querySelector('.boardcanvas>svg');for(let y=Math.min(r.bottom-20,innerHeight-20);y>Math.max(r.top+20,180);y-=35)for(let x=Math.min(r.right-20,innerWidth-20);x>r.left+20;x-=35){const el=document.elementFromPoint(x,y);if(el&&board.contains(el)&&!el.closest('button,input,textarea,a,.explore-window,.explore-player,[data-dv-node],[data-dv-edge],[data-dv-group],[data-dv-panel],[data-dv-row]')){const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());return {x,y,px:p.x,py:p.y};}}throw Error('No blank editing space');});}
async function open(page,section=0){const p=await blank(page,section);await page.mouse.click(p.x,p.y,{button:'right'});await expect(menu(page)).toBeVisible();return p;}
for(const explore of [false,true])test('blank Add '+(explore?'Explore':'Standard')+' directly edits text at pointer with one Undo',async({page,server},info)=>{
 await setup(page,server,explore);const before=await source(page),p=await open(page);
 await expect(menu(page).getByRole('menuitem',{name:'Text',exact:true})).toBeFocused();
 const r=await menu(page).boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(1200);
 await info.attach('blank-add-'+(explore?'explore':'standard'),{body:await page.screenshot({path:'/tmp/517-add-'+(explore?'explore':'standard')+'.png'}),contentType:'image/png'});
 await page.keyboard.press('Enter');await expect(page.getByRole('textbox',{name:'Edit text box',exact:true})).toBeFocused();
 const after=await source(page),d=JSON.parse(after).page.blocks[0].diagram,f=d.floats.at(-1);expect(f.x).toBeCloseTo(p.px,4);expect(f.y).toBeCloseTo(p.py,4);expect(d.nodes[f.id].type).toBe('text');expect(d.rows).toEqual(fixture(explore).page.blocks[0].diagram.rows);
 await page.keyboard.press('Escape');await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
});
test('inline keyboard dismissal, node presets, panel cancel/confirm and stale source',async({page,server})=>{
 await setup(page,server,true);const original=await source(page);
 await open(page);await page.keyboard.press('End');await expect(menu(page).getByRole('menuitem',{name:'Step',exact:true})).toBeFocused();await page.keyboard.press('Home');await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(original);
 await open(page);await page.locator('#diagram-add').click();await expect(menu(page)).toHaveCount(0);await page.keyboard.press('Escape');
 const nodePoint=await open(page);await menu(page).getByRole('menuitem',{name:'Node…'}).click();await expect(page.locator('#diagram-add-presets')).toBeVisible();await page.locator('[data-add-preset="0"]').click();let d=JSON.parse(await source(page)).page.blocks[0].diagram;expect(d.floats.at(-1).x).toBeCloseTo(nodePoint.px,4);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();await expect(page.locator('#panel-picker')).toBeVisible();await page.locator('#panel-picker-cancel').click();await expect(page.locator('#src')).toHaveValue(original);
 const p=await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();await page.locator('.panel-picker-card[data-panel-type="state"]').click();await page.locator('#panel-picker-add').click();const after=await source(page);d=JSON.parse(after).page.blocks[0].diagram;expect(d.panels).toHaveLength(2);const placement=d.layouts[0].exploreLayout.canvas.panels.at(-1);expect(placement.x).toBeCloseTo(p.px,4);expect(placement.y).toBeCloseTo(p.py,4);expect(placement.panel).toBe(d.panels.at(-1).id);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
 await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();const changed=original.replace('Browser contract','Changed');await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);await expect(page.locator('#panel-picker-add')).toBeDisabled();await page.evaluate(()=>document.querySelector('#panel-picker-add').click());await expect(page.locator('#src')).toHaveValue(changed);
});
test('objects, text editing, panel controls and read-only viewer retain their context behavior',async({page,server})=>{
 await setup(page,server,true);await page.locator('[data-dv-node="a"]').click({button:'right'});await expect(page.getByRole('menu',{name:'Object actions'})).toBeVisible();await expect(menu(page)).toHaveCount(0);await page.keyboard.press('Escape');
 await open(page);await menu(page).getByRole('menuitem',{name:'Text',exact:true}).click();const edit=page.getByRole('textbox',{name:'Edit text box',exact:true});await edit.click({button:'right'});await expect(menu(page)).toHaveCount(0);await expect(page.getByRole('menu',{name:'Object actions'})).toHaveCount(0);await edit.press('Escape');
 await page.locator('.explore-tools button').first().dispatchEvent('contextmenu',{button:2});await expect(menu(page)).toHaveCount(0);
 await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();await page.locator('#page-preview-view .board').first().dispatchEvent('contextmenu',{clientX:400,clientY:400,button:2});await expect(menu(page)).toHaveCount(0);await page.locator('#close-page-preview').click();
 await page.goto(server.origin+'/standalone.html');await page.locator('.board').first().dispatchEvent('contextmenu',{clientX:400,clientY:400,button:2});await expect(menu(page)).toHaveCount(0);
});

test('captured second section survives pan and independent canvas/diagram zoom',async({page,server})=>{
 const raw=fixture(true);raw.page.blocks.push(structuredClone(raw.page.blocks[0]));raw.page.blocks[1].heading='Second destination';
 await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(raw));await chooseAddDestination(page,'1');await closeTools(page);
 const board=page.locator('.doc-sec[data-dv-section="1"] .board');await expect(board).toBeVisible();
 await page.locator('#workspace-zoom-in').evaluate(el=>el.click());
 const prior=await board.locator('.boardcanvas>svg').evaluate(el=>el.getScreenCTM().a),at=await blank(page,1);await page.mouse.move(at.x,at.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await expect.poll(()=>board.locator('.boardcanvas>svg').evaluate(el=>el.getScreenCTM().a)).not.toBe(prior);
 await board.evaluate(el=>{el.scrollLeft+=75;el.scrollTop+=45;});
 const before=await source(page),p=await open(page,1);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();await page.locator('#panel-picker-add').click();
 const after=await source(page),next=JSON.parse(after);expect(next.page.blocks[0]).toEqual(raw.page.blocks[0]);expect(next.page.blocks[1].diagram.panels).toHaveLength(2);
 const placement=next.page.blocks[1].diagram.layouts[0].exploreLayout.canvas.panels.at(-1);expect(placement.x).toBeCloseTo(p.px,4);expect(placement.y).toBeCloseTo(p.py,4);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
});
test('view changes, project replacement and remount retire pending menus and pickers',async({page,server})=>{
 const raw=fixture(true),d=raw.page.blocks[0].diagram;d.layouts.push({...structuredClone(d.layouts[0]),id:'alternate',name:'Alternate'});
 await page.goto(server.origin+'/lifetime/index.html');await pastePage(page,JSON.stringify(raw));await closeTools(page);const before=await source(page);
 await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();
 await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Alternate',exact:true}).evaluate(el=>el.click());
 await expect(page.locator('#panel-picker-add')).toBeDisabled();await page.locator('#panel-picker-add').evaluate(el=>el.click());await expect(page.locator('#src')).toHaveValue(before);await page.keyboard.press('Escape');
 await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();const replacement=before; // Identical bytes still belong to a new project lifetime.
 await page.evaluate(text=>__editorTest.builder.loadText(text),replacement);await expect(page.locator('#panel-picker')).toBeHidden();await page.locator('#panel-picker-add').evaluate(el=>el.click());await expect(page.locator('#src')).toHaveValue(replacement);
 await closeTools(page);await open(page);await page.evaluate(()=>__editorTest.builder.destroy());await expect(menu(page)).toHaveCount(0);await page.evaluate(()=>__editorTest.remount());await closeTools(page);await open(page);await menu(page).getByRole('menuitem',{name:'Text',exact:true}).click();await expect(page.getByRole('textbox',{name:'Edit text box',exact:true})).toBeFocused();await page.keyboard.press('Escape');await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(replacement);
});

test('inline Standard panel, step and connection actions use the existing single-Undo commands',async({page,server})=>{
 await setup(page,server,false);const before=await source(page);
 await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();await page.locator('#panel-picker-add').click();let raw=JSON.parse(await source(page));expect(raw.page.blocks[0].diagram.panels).toHaveLength(2);expect(raw.page.blocks[0].diagram.layouts).toEqual(fixture(false).page.blocks[0].diagram.layouts);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await open(page);await menu(page).getByRole('menuitem',{name:'Step',exact:true}).click();expect(JSON.parse(await source(page)).page.blocks[0].diagram.steps).toHaveLength(4);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await open(page);await menu(page).getByRole('menuitem',{name:'Connection',exact:true}).click();await page.locator('[data-dv-node="b"]').click();await page.locator('[data-dv-node="c"]').click();expect(JSON.parse(await source(page)).page.blocks[0].diagram.edges).toHaveLength(2);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('Tab-owned Explore presentation places panels and retires same-layout view destinations',async({page,server})=>{
 const section=fixture(false).page.blocks[0];section.id='delivery';delete section.diagram.layouts;delete section.diagram.defaultLayout;
 const raw={page:{title:'Tab canvas',blocks:[{tabs:[{label:'Story',sections:[section],views:[{id:'first',name:'First canvas',presentation:'explore',sections:['delivery']},{id:'second',name:'Second canvas',presentation:'explore',sections:['delivery']}],defaultView:'first'}]}]}};
 await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(raw));await closeTools(page);const before=await source(page);
 await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();await page.locator('#docview > .explore-navigation').getByRole('button',{name:'Second canvas',exact:true}).evaluate(el=>el.click());await expect(page.locator('#panel-picker-add')).toBeDisabled();await page.locator('#panel-picker-add').evaluate(el=>el.click());await expect(page.locator('#src')).toHaveValue(before);await page.keyboard.press('Escape');
 const p=await open(page);await menu(page).getByRole('menuitem',{name:'Panel…'}).click();await page.locator('#panel-picker-add').click();const d=JSON.parse(await source(page)).page.blocks[0].tabs[0].sections[0].diagram;expect(d.panels).toHaveLength(2);const placement=d.layouts.flatMap(v=>v.exploreLayout?.canvas?.panels || []).at(-1);expect(placement.x).toBeCloseTo(p.px,4);expect(placement.y).toBeCloseTo(p.py,4);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});
