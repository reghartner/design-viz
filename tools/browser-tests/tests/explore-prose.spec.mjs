import {panelsOptions} from '../helpers/test.mjs';
import {arrangeChapter} from '../helpers/test.mjs';
import {test,expect,paste,closeTools,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
function fixture(defaultLayout='business'){
  const tiles=[{x:0,y:0,w:8,h:12},{panel:'queue',x:8,y:0,w:4,h:7},{controls:'steps',x:0,y:12,w:8,h:4}];
  return {page:{title:'Visitor delivery',skin:'pastel',sections:[{id:'delivery',heading:'Delivery explained',collapsed:true,
    text:['**Why this matters.** The visitor gets a recording even when the upload must wait.','The camera sends `recording_id` to the [recording service](https://example.test/design).'],
    bullets:[{text:'Capture locally',sub:['Keep a copy until acknowledged']},{text:'Upload is complete',revealAt:1}],
    diagram:{view:'step',autoplay:false,nodes:{camera:{title:'Doorbell',icon:'camera'},service:{title:'Recording service',icon:'cloud'}},rows:[['camera','service']],edges:[{from:'camera',to:'service'}],
      panels:[{id:'queue',type:'queue',title:'Upload queue',initial:{state:'held',label:'Clip ready'}}],steps:[{id:'capture',text:'Capture the visitor',nodes:['camera']},{id:'upload',text:'Deliver the clip',edge:'camera->service',panels:{queue:{state:'dequeue'}}}],
      layouts:[{id:'business',name:'Business',presentation:'standard',sectionLayout:{default:tiles}},
        {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:tiles},exploreLayout:{prose:{x:.65,y:.23,w:.32,h:.38,stacked:false},panels:[{panel:'queue',x:.76,y:.64,w:.2,h:.18,stacked:false}]}},
        {id:'compact',name:'Compact',presentation:'explore',sectionLayout:{default:tiles},exploreLayout:{prose:{hidden:true}}}],defaultLayout}}]}};
}
const notes=page=>page.locator('[data-explore-content="prose"]');
const source=page=>page.locator('#src').inputValue();
async function build(server,spec,name='explore-notes'){
  const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);return server.origin+'/'+name+'.html';
}
async function verifySeparation(page,root=page){
  const panel=root.locator('[data-explore-content="prose"]');await expect(panel).toBeVisible();await expect(panel.locator('.sec-prose')).toHaveCount(1);
  await expect(panel.locator('.doc-sec,.board,.boardcanvas,.section-viewport,.termbar,.diagram-views,.ctcard')).toHaveCount(0);
  await expect(root.locator('.explore-canvas>.board .boardcanvas>svg')).toHaveCount(1);await expect(root.locator('.explore-player .termbar')).toHaveCount(1);
}

test('Explore floats only prose, keeps live formatting/reveals and restores the exact standard prose node',async({page,server},info)=>{
  const url=await build(server,fixture());await page.goto(url);await expect(page.locator('.doc-sec>.sec-prose')).toBeHidden();
  await page.evaluate(()=>window.__proseNode=document.querySelector('.sec-prose'));
  await page.getByRole('button',{name:'Explore',exact:true}).click();await verifySeparation(page);await expect(page.locator('.explore-canvas [data-dv-node="camera"]')).toBeInViewport();
  expect(await page.evaluate(()=>document.querySelector('.explore-prose-window .sec-prose')===window.__proseNode)).toBe(true);
  await expect(notes(page).locator('strong')).toHaveText('Why this matters.');await expect(notes(page).locator('code')).toHaveText('recording_id');
  await expect(notes(page).locator('[data-dv-bullet-path="0.0"]')).toHaveText('Keep a copy until acknowledged');
  await expect(notes(page).locator('[data-dv-bullet-path="1"]')).toHaveClass(/dv-fragment-hidden/);await page.getByRole('button',{name:'Next step',exact:true}).click();await expect(notes(page).locator('[data-dv-bullet-path="1"]')).not.toHaveClass(/dv-fragment-hidden/);
  const shell=await page.locator('.viewer-diagram-canvas').boundingBox(),nav=await page.locator('.explore-navigation').boundingBox();
  const stage=await page.locator('.explore-stage').boundingBox(),board=await page.locator('.explore-board').boundingBox(),prose=await notes(page).boundingBox(),viewport=page.viewportSize();
  expect(shell).toEqual({x:0,y:0,width:viewport.width,height:viewport.height});expect(stage.y).toBeGreaterThanOrEqual(nav.y+nav.height);
  expect(board).toEqual(stage);expect(prose.x).toBeGreaterThanOrEqual(stage.x);expect(prose.y).toBeGreaterThanOrEqual(stage.y);expect(prose.x+prose.width).toBeLessThanOrEqual(stage.x+stage.width);expect(prose.y+prose.height).toBeLessThanOrEqual(stage.y+stage.height);
  const original=await notes(page).boundingBox();await notes(page).getByRole('button',{name:'Move Section notes; use arrow keys',exact:true}).press('ArrowLeft');expect((await notes(page).boundingBox()).x).toBeCloseTo(original.x-8,0);
  await notes(page).getByRole('button',{name:'Hide Section notes',exact:true}).click();await expect(notes(page)).toBeHidden();await page.locator('.explore-panel-menu summary').click();await page.getByRole('checkbox',{name:'Section notes',exact:true}).check();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Compact',exact:true}).click();await expect(notes(page)).toBeHidden();await page.getByRole('button',{name:'Explore',exact:true}).click();await expect(notes(page)).toBeVisible();
  await expect(page.locator('.explore-canvas [data-dv-node="camera"]')).toBeInViewport();await page.screenshot({path:info.outputPath('explore-notes-reader.png')});
  await page.getByRole('button',{name:'Business',exact:true}).click();await expect(page.locator('.doc-sec>.sec-prose')).toBeHidden();expect(await page.evaluate(()=>document.querySelector('.doc-sec>.sec-prose')===window.__proseNode)).toBe(true);
  await page.getByRole('button',{name:'Show prose for Delivery explained',exact:true}).click();await expect(page.locator('.doc-sec>.sec-prose')).toBeVisible();await expect(page.locator('.explore-window')).toHaveCount(0);
  await page.getByRole('button',{name:'Explore',exact:true}).click();await page.reload();expect((await notes(page).boundingBox()).x).toBeCloseTo(original.x,0);
});

test('editor notes move/resize/visibility and zoom author one view, keep Explore while editing, and export',async({page,server,context},info)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture('explore'),null,2));await closeTools(page);await verifySeparation(page);
  const initial=await source(page),grip=notes(page).getByRole('button',{name:'Move Section notes; use arrow keys',exact:true});
  await grip.press('ArrowLeft');const moved=await source(page);expect(moved).not.toBe(initial);await expect(grip).toBeFocused();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);await closeTools(page);
  const beforeResize=await notes(page).boundingBox();await notes(page).getByRole('button',{name:'Resize Section notes; use arrow keys',exact:true}).press('Shift+ArrowRight');expect((await notes(page).boundingBox()).width).toBeCloseTo(beforeResize.width+24,0);
  const resized=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(resized);await closeTools(page);
  const beforeDrag=await notes(page).boundingBox(),handle=await grip.boundingBox();await page.mouse.move(handle.x+28,handle.y+12);await page.mouse.down();await page.mouse.move(handle.x-72,handle.y+36,{steps:8});await page.mouse.up();expect((await notes(page).boundingBox()).x).toBeCloseTo(beforeDrag.x-100,0);
  const dragged=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(resized);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(dragged);await closeTools(page);
  const graph=await page.locator('.explore-board .boardcanvas>svg').boundingBox(),width=(await notes(page).boundingBox()).width;await panelsOptions(page);await page.locator('#docview .explore-navigation').getByRole('button',{name:'Shrink panels and controls',exact:true}).click();expect((await notes(page).boundingBox()).width).toBeCloseTo(width,0);expect(await page.locator('.explore-board .boardcanvas>svg').boundingBox()).toEqual(graph);
  await prepareEditorSurface(page);await arrangeChapter(page);const visible=page.getByRole('checkbox',{name:'Show Section notes in Explore',exact:true});const beforeHide=await source(page);await visible.uncheck();await expect(notes(page)).toBeHidden();expect(JSON.parse(await source(page)).page.sections[0].diagram.layouts[1].exploreLayout.prose.hidden).toBe(true);
  const hidden=await source(page);await page.getByRole('button',{name:'Optimize layout',exact:true}).click();await expect(notes(page)).toBeHidden();expect(JSON.parse(await source(page)).page.sections[0].diagram.layouts[1].exploreLayout.prose).toEqual({hidden:true});await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(hidden);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeHide);await expect(notes(page)).toBeVisible();await page.getByRole('button',{name:'Done arranging',exact:true}).click();await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await closeTools(page);
  await inspectPageElement(page,notes(page).locator('[data-dv-para="0"]'));const text=page.locator('#guide .prose-editor textarea');await text.fill('**Updated explanation.** The recording stays local until delivery.');await text.press('Tab');await expect(notes(page).locator('strong')).toHaveText('Updated explanation.');await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await closeTools(page);await verifySeparation(page);
  const saved=JSON.parse(await source(page));expect(saved.page.sections[0].diagram.layouts[0]).toEqual(fixture().page.sections[0].diagram.layouts[0]);expect(saved.page.sections[0].diagram.layouts[2]).toEqual(fixture().page.sections[0].diagram.layouts[2]);
  await page.screenshot({path:info.outputPath('explore-notes-editor.png')});
  const reader=await context.newPage();await reader.goto(await build(server,saved,'explore-notes-saved'));await verifySeparation(reader);await expect(notes(reader).locator('strong')).toHaveText('Updated explanation.');const r=await notes(reader).boundingBox(),s=await reader.locator('.explore-stage').boundingBox();expect(r.width/s.width).toBeCloseTo(saved.page.sections[0].diagram.layouts[1].exploreLayout.prose.w,3);await reader.close();
});

test('native notes are isolated, keep exact prose on view switches, and retire with their viewer',async({page,server})=>{
  await page.goto(server.origin+'/native/index.html');await page.waitForFunction(()=>!!window.__host);await page.evaluate(()=>{__host.left(true);__host.right(true);});
  const alpha=page.locator('#alpha'),beta=page.locator('#beta');await expect(alpha.locator('.preadout')).toHaveText('Success');await expect(beta.locator('.preadout')).toHaveText('Success');
  await alpha.getByRole('button',{name:'Explore',exact:true}).click();await beta.getByRole('button',{name:'Explore',exact:true}).click();await verifySeparation(page,alpha);await verifySeparation(page,beta);
  const left=alpha.locator('[data-explore-content="prose"]'),right=beta.locator('[data-explore-content="prose"]'),before=await right.boundingBox();await left.getByRole('button',{name:'Move Section notes; use arrow keys',exact:true}).press('ArrowLeft');expect(await right.boundingBox()).toEqual(before);
  await left.getByRole('button',{name:'Hide Section notes',exact:true}).click();await expect(left).toBeHidden();await expect(right).toBeVisible();await alpha.getByRole('button',{name:'Business',exact:true}).click();await expect(alpha.locator('.doc-sec[data-dv-section="1"]>.sec-prose')).toBeVisible();
  await page.evaluate(()=>__host.left(false));await expect(alpha.locator('.docview')).toHaveCount(0);await expect(right).toBeVisible();await page.evaluate(()=>__host.right(false));await expect(beta.locator('.docview')).toHaveCount(0);
});

test('Standard to Explore frames a short graph after indexing, and preserves a reader camera on return',async({page,server})=>{
  const spec=fixture();delete spec.page.sections[0].text;delete spec.page.sections[0].bullets;
  await page.goto(await build(server,spec,'no-notes'));await page.getByRole('button',{name:'Explore',exact:true}).click();
  const node=page.locator('.explore-canvas [data-dv-node="camera"]');await expect(node).toBeInViewport();await expect(notes(page)).toHaveCount(0);
  const board=page.locator('.explore-board');const camera=await board.evaluate(b=>{b.scrollLeft+=80;return {x:b.scrollLeft,y:b.scrollTop};});
  await page.getByRole('button',{name:'Business',exact:true}).click();await page.getByRole('button',{name:'Explore',exact:true}).click();
  await expect.poll(()=>board.evaluate(b=>({x:b.scrollLeft,y:b.scrollTop}))).toEqual(camera);
});

test('first prose from Add or section inspector creates visible notes and keeps Explore with exact history',async({page,server})=>{
  const raw=fixture('explore');raw.page.sections[0].text='';delete raw.page.sections[0].bullets;
  const original=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  const input=page.locator('#guide').getByLabel('Prose text',{exact:true});
  for(const [route,kind] of [['add','paragraph'],['section','paragraph'],['add','bullet'],['section','bullet']]){
    await closeTools(page);await expect(notes(page)).toHaveCount(0);await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
    if(route==='section'){
      await prepareEditorSurface(page);await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Delivery explained');await page.locator('#outline-results .outline-item').filter({hasText:'section · Delivery explained'}).click();await page.locator('#outline-inspect').click();
      await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
      await page.locator('#guide').getByRole('button',{name:kind==='paragraph'?'Add an introduction':'Add first point',exact:true}).click();
    }else{await page.locator('#diagram-add').click();await page.locator('[data-add-kind="'+kind+'"]').click();}
    await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await verifySeparation(page);
    const field=kind==='paragraph'?'text':'bullets',label=kind==='paragraph'?'New paragraph':'New point';
    const selector=kind==='paragraph'?'[data-dv-para="0"]':'[data-dv-bullet-path="0"]';
    await expect(notes(page).locator(selector)).toHaveCount(1);await expect(notes(page).locator(selector)).toHaveClass(/dv-sel/);
    await expect(input).toHaveValue(label);await expect(input).toBeFocused();
    const added=await source(page),expected=structuredClone(raw);expected.page.sections[0][field]=[label];expect(JSON.parse(added)).toEqual(expected);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(notes(page)).toHaveCount(0);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(added);await expect(notes(page)).toBeVisible();
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  }
});

test('adding prose restores temporarily hidden notes without changing saved visibility or the selected view',async({page,server})=>{
  const raw=fixture('explore');await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
  await notes(page).getByRole('button',{name:'Hide Section notes',exact:true}).click();await expect(notes(page)).toBeHidden();
  await page.locator('#diagram-add').click();await page.locator('[data-add-kind="paragraph"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await verifySeparation(page);await expect(notes(page).locator('[data-dv-para]')).toHaveCount(3);
  await expect(page.locator('#guide').getByLabel('Prose text',{exact:true})).toHaveValue('New paragraph');
  const saved=JSON.parse(await source(page));expect(saved.page.sections[0].diagram).toEqual(raw.page.sections[0].diagram);
});

test('deleting the notes surface preserves the section, Standard bounds and exact Undo/Redo',async({page,server},info)=>{
  const raw=fixture('explore'),original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await paste(page,original);await closeTools(page);
  const geometry=()=>page.locator('.doc-sec').evaluate(sec=>{
    const box=sec.getBoundingClientRect(),viewport=sec.querySelector('.section-viewport').getBoundingClientRect();
    const board=sec.querySelector('.board').getBoundingClientRect(),svg=sec.querySelector('.boardcanvas>svg');
    return {width:box.width,viewportWidth:viewport.width,viewportHeight:viewport.height,boardWidth:board.width,boardHeight:board.height,
      contained:box.bottom>=viewport.bottom && box.right>=viewport.right,viewBox:svg.getAttribute('viewBox')};
  });
  await page.getByRole('button',{name:'Business',exact:true}).click();const before=await geometry();
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  const expected=structuredClone(raw);delete expected.page.sections[0].text;delete expected.page.sections[0].bullets;
  for(const route of ['inspector','keyboard']){
    // Both prose padding and the remaining empty window body used to select
    // the enclosing section, turning a text deletion into diagram deletion.
    await closeTools(page);await notes(page).locator('.explore-window-body').click({position:{x:5,y:route==='inspector'?5:300}});
    await expect(notes(page)).toHaveClass(/dv-sel/);await expect(page.locator('.doc-sec')).not.toHaveClass(/dv-sel/);
    if(route==='inspector'){
      await page.locator('#editor-tab-inspect').click();await expect(page.getByRole('button',{name:'delete section',exact:true})).toHaveCount(0);
      await page.getByRole('button',{name:'Delete Section notes',exact:true}).click();
    }else await page.keyboard.press('Delete');
    await expect(notes(page)).toHaveCount(0);const removed=await source(page);expect(JSON.parse(removed)).toEqual(expected);
    await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
    await page.getByRole('button',{name:'Business',exact:true}).click();await closeTools(page);
    expect(await geometry()).toEqual(before);expect(before.contained).toBe(true);expect(before.boardHeight).toBeGreaterThan(100);
    await page.screenshot({path:info.outputPath('standard-after-notes-deletion-'+route+'.png')});
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(removed);expect(await geometry()).toEqual(before);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
    await page.getByRole('button',{name:'Explore',exact:true}).click();await expect(notes(page)).toBeVisible();
  }
});

for(const value of ['The last paragraph',['The last paragraph']])test('deleting the last '+(Array.isArray(value)?'array':'string')+' paragraph leaves the diagram intact in Standard',async({page,server})=>{
    const raw=fixture('explore');raw.page.sections[0].text=value;delete raw.page.sections[0].bullets;
    await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
    await inspectPageElement(page,notes(page).locator('[data-dv-para="0"]'));
    await page.getByRole('button',{name:'Delete paragraph',exact:true}).click();await expect(notes(page)).toHaveCount(0);
    expect(JSON.parse(await source(page)).page.sections[0].diagram).toEqual(raw.page.sections[0].diagram);
    await closeTools(page);await page.getByRole('button',{name:'Business',exact:true}).click();
    await expect(page.locator('.doc-sec .boardcanvas>svg')).toBeVisible();await expect(page.locator('.doc-sec .sec-h')).toContainText('Delivery explained');
    await page.locator('#undo-builder').click();await page.getByRole('button',{name:'Explore',exact:true}).click();await expect(notes(page)).toBeVisible();
});

for(const skin of ['aurora','daylight','pastel','editorial','terminal','blueprint'])test('notes remain readable in '+skin+' in the reader and workbench',async({page,server},info)=>{
  const raw=fixture('explore');raw.page.skin=skin;
  for(const surface of ['reader','workbench']){
    if(surface==='reader')await page.goto(await build(server,raw,'notes-'+skin));
    else{await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);}
    await expect(notes(page)).toBeVisible();await page.evaluate(()=>document.fonts.ready);
    for(const item of await notes(page).locator('.sec-prose,.sec-text,.sec-bullets').all())await expect(item).toHaveCSS('font-size','18px');
    const contrast=await notes(page).evaluate(el=>{
      function luminance(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
      const bg=luminance(getComputedStyle(el).backgroundColor);
      return [...el.querySelectorAll('.sec-text,.sec-bullets,.sec-text a,.sec-text code,.explore-window-grip')].map(node=>{
        const fg=luminance(getComputedStyle(node).color);return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
      });
    });
    expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
    await notes(page).screenshot({path:info.outputPath('notes-'+skin+'-'+surface+'.png')});
  }
});

async function place(page,label,value){
  const menu=page.locator('.explore-panel-menu');if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();
  await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);await page.keyboard.press('Escape');
}
async function parentClass(locator){return locator.evaluate(el=>el.parentElement.className);}

test('legacy notes placement stays independent of the last panel and default, with temporary reader overrides',async({page,server})=>{
 for(const legacy of ['floating','canvas']){
  const raw=fixture('explore'),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.panelPlacement=legacy;
  await page.goto(await build(server,raw,'legacy-notes-'+legacy));const expected=legacy==='canvas'?'explore-canvas-objects':'explore-stage';
  expect(await parentClass(notes(page))).toBe(expected);
  await place(page,'Default panel placement',legacy==='canvas'?'floating':'canvas');expect(await parentClass(notes(page))).toBe(expected);
  await place(page,'Placement for Upload queue','floating');expect(await parentClass(notes(page))).toBe(expected);
  await place(page,'Placement for Upload queue','canvas');expect(await parentClass(notes(page))).toBe(expected);
  const panel=page.locator('[data-explore-panel="queue"]'),controls=page.locator('.explore-player');
  await place(page,'Placement for Section notes',legacy==='canvas'?'floating':'canvas');expect(await parentClass(panel)).toBe('explore-canvas-objects');expect(await parentClass(controls)).toBe('explore-stage');
  await place(page,'Placement for Upload queue','floating');expect(await parentClass(notes(page))).toBe(legacy==='canvas'?'explore-stage':'explore-canvas-objects');
  await page.getByRole('button',{name:'Business',exact:true}).click();await page.getByRole('button',{name:'Explore',exact:true}).click();expect(await parentClass(notes(page))).toBe(legacy==='canvas'?'explore-stage':'explore-canvas-objects');
  await page.reload();expect(await parentClass(notes(page))).toBe(expected);expect(await parentClass(panel)).toBe(expected);
 }
});

test('notes placement and both geometries save, undo, redo and reopen independently',async({page,server,context})=>{
 const raw=fixture('explore');await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
 const initial=await source(page);
 await place(page,'Default panel placement','canvas');const panelChanged=await source(page);
 expect(JSON.parse(panelChanged).page.sections[0].diagram.layouts[1].exploreLayout.prosePlacement).toBe('floating');expect(await parentClass(notes(page))).toBe('explore-stage');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(initial);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(panelChanged);
 await place(page,'Placement for Section notes','canvas');const onCanvas=await source(page);expect(await parentClass(notes(page))).toBe('explore-canvas-objects');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(panelChanged);expect(await parentClass(notes(page))).toBe('explore-stage');
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(onCanvas);await closeTools(page);
 await notes(page).focus();await notes(page).getByRole('button',{name:'Move Section notes; use arrow keys',exact:true}).press('ArrowRight');const moved=await source(page);
 await notes(page).getByRole('button',{name:'Resize Section notes; use arrow keys',exact:true}).press('Shift+ArrowRight');const resized=await source(page);
 expect(resized).not.toBe(moved);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(resized);
 const canvasRect=JSON.parse(resized).page.sections[0].diagram.layouts[1].exploreLayout.canvas.prose;
 await place(page,'Placement for Section notes','floating');const floating=await source(page);expect(JSON.parse(floating).page.sections[0].diagram.layouts[1].exploreLayout.prose).toEqual(raw.page.sections[0].diagram.layouts[1].exploreLayout.prose);
 await closeTools(page);await notes(page).getByRole('button',{name:'Resize Section notes; use arrow keys',exact:true}).press('ArrowRight');const floatingResized=await source(page),floatRect=JSON.parse(floatingResized).page.sections[0].diagram.layouts[1].exploreLayout.prose;
 expect(JSON.parse(floatingResized).page.sections[0].diagram.layouts[1].exploreLayout.canvas.prose).toEqual(canvasRect);
 await place(page,'Placement for Section notes','canvas');await place(page,'Placement for Upload queue','floating');const savedText=await source(page),saved=JSON.parse(savedText),layout=saved.page.sections[0].diagram.layouts[1].exploreLayout;
 expect(layout.prose).toEqual(floatRect);expect(layout.canvas.prose).toEqual(canvasRect);expect(layout.controlsPlacement).toBeUndefined();
 const reader=await context.newPage();await reader.goto(await build(server,saved,'independent-notes-saved'));expect(await parentClass(notes(reader))).toBe('explore-canvas-objects');expect(await parentClass(reader.locator('[data-explore-panel="queue"]'))).toBe('explore-stage');
 expect(await notes(reader).evaluate(el=>({x:parseFloat(el.style.getPropertyValue('--float-x')),w:parseFloat(el.style.getPropertyValue('--float-w'))}))).toEqual({x:canvasRect.x,w:canvasRect.w});
 await place(reader,'Placement for Section notes','floating');expect(await source(page)).toBe(savedText);await reader.close();
});

for(const width of [1280,1440,1920])test('notes remain readable and independently sized at '+width+'px',async({page,server},info)=>{
 await page.setViewportSize({width,height:1000});const raw=fixture('explore');delete raw.page.sections[0].diagram.layouts[1].exploreLayout.prose;
 await page.goto(await build(server,raw,'readable-notes-'+width));await page.evaluate(()=>document.fonts.ready);
 for(const item of await notes(page).locator('.sec-prose,.sec-text,.sec-bullets').all())await expect(item).toHaveCSS('font-size','18px');const before=await notes(page).boundingBox();
 await page.getByRole('button',{name:'Shrink panels and controls',exact:true}).click();expect(await notes(page).boundingBox()).toEqual(before);
 expect(await notes(page).locator('.explore-window-body').evaluate(el=>({overflow:el.scrollHeight-el.clientHeight,scale:getComputedStyle(el).transform}))).toEqual({overflow:0,scale:'matrix(1, 0, 0, 1, 0, 0)'});
 await page.screenshot({path:info.outputPath('section-notes-'+width+'.png')});
 await place(page,'Placement for Section notes','canvas');await place(page,'Placement for Upload queue','floating');await page.getByRole('button',{name:'Fit canvas',exact:true}).click();
 await expect(notes(page)).toBeInViewport();
 const metrics=await notes(page).evaluate(el=>{const texts=[...el.querySelectorAll('.sec-text,.sec-bullets')],body=el.querySelector('.explore-window-body'),scale=el.getBoundingClientRect().width/el.offsetWidth;return {font:Math.min(...texts.map(text=>parseFloat(getComputedStyle(text).fontSize)*scale)),logicalFont:parseFloat(getComputedStyle(texts[0]).fontSize),scale,overflow:body.scrollHeight-body.clientHeight};});
 expect(metrics.logicalFont).toBe(18);expect(metrics.font).toBeCloseTo(18*metrics.scale,2);expect(metrics.overflow).toBeLessThanOrEqual(1);
 await info.attach('canvas-notes-rendered-size-'+width,{body:JSON.stringify(metrics),contentType:'application/json'});
 await page.screenshot({path:info.outputPath('section-notes-canvas-'+width+'.png')});
 await page.locator('.explore-panel-menu summary').click();
 await expect(page.getByText('Section notes ignore Panels & controls sizing. Resize the notes window.',{exact:true})).toBeVisible();
 await page.locator('.explore-panel-menu .explore-panel-body').screenshot({path:info.outputPath('section-notes-menu-'+width+'.png')});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 const reduced=await notes(page).evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.sec-text')).fontSize)*el.getBoundingClientRect().width/el.offsetWidth);
 expect(reduced).toBeCloseTo(metrics.font*.8,1);
});

async function notesGeometry(page){return notes(page).evaluate(el=>({x:parseFloat(el.style.getPropertyValue('--float-x')),y:parseFloat(el.style.getPropertyValue('--float-y')),w:parseFloat(el.style.getPropertyValue('--float-w')),h:parseFloat(el.style.getPropertyValue('--float-h'))}));}
async function notesOverflow(page){return notes(page).locator('.explore-window-body').evaluate(el=>el.scrollHeight-el.clientHeight);}
for(const gesture of ['Move','Resize'])test('pristine canvas notes refit on live desktop resize until '+gesture.toLowerCase(),async({page,server},info)=>{
 await page.setViewportSize({width:1920,height:1000});const raw=fixture('explore');raw.page.sections[0].diagram.layouts[1].exploreLayout.prosePlacement='canvas';
 await page.goto(await build(server,raw,'live-notes-'+gesture));await page.evaluate(()=>document.fonts.ready);
 const wide=await notesGeometry(page);expect(await notesOverflow(page)).toBe(0);
 // Explore uses fixed 18px notes text, so width and intrinsic height stay stable across desktop widths.
 await page.setViewportSize({width:1280,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(wide);await expect.poll(()=>notesOverflow(page)).toBe(0);await expect(notes(page)).toBeInViewport();
 await page.screenshot({path:info.outputPath('section-notes-live-1920-to-1280.png')});
 await page.setViewportSize({width:1920,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(wide);expect(await notesOverflow(page)).toBe(0);
 await notes(page).focus();await notes(page).getByRole('button',{name:gesture+' Section notes; use arrow keys',exact:true}).press('ArrowRight');const manual=await notesGeometry(page);expect(manual).not.toEqual(wide);
 await page.setViewportSize({width:1280,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(manual);
 await page.setViewportSize({width:1920,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(manual);
});

test('saved and newly authored canvas notes retain their rectangle on live browser resize',async({page,server})=>{
 const raw=fixture('explore'),layout=raw.page.sections[0].diagram.layouts[1].exploreLayout;layout.prosePlacement='canvas';layout.canvas={prose:{x:1220,y:0,w:440,h:280}};
 await page.setViewportSize({width:1920,height:1000});await page.goto(await build(server,raw,'saved-notes-resize'));
 expect(await notesGeometry(page)).toEqual(layout.canvas.prose);await page.setViewportSize({width:1280,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(layout.canvas.prose);
 await page.setViewportSize({width:1920,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture('explore'),null,2));await closeTools(page);
 await place(page,'Placement for Section notes','canvas');const savedText=await source(page),saved=JSON.parse(savedText).page.sections[0].diagram.layouts[1].exploreLayout.canvas.prose;
 expect(await notesGeometry(page)).toEqual(saved);
 await page.setViewportSize({width:1280,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(saved);await expect(page.locator('#src')).toHaveValue(savedText);
 await page.setViewportSize({width:1920,height:1000});await expect.poll(()=>notesGeometry(page)).toEqual(saved);await expect(page.locator('#src')).toHaveValue(savedText);
});

test('pristine Workbench canvas notes preserve live camera navigation on resize',async({page,server})=>{
 const raw=fixture('explore');raw.page.sections[0].diagram.layouts[1].exploreLayout.prosePlacement='canvas';
 await page.setViewportSize({width:1920,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
 const board=page.locator('.explore-board');
 const camera=()=>board.evaluate(el=>{const width=parseFloat(el.style.getPropertyValue('--explore-width')),margin=parseFloat(el.style.getPropertyValue('--explore-margin-x'));return {zoom:width/el.querySelector('.boardcanvas>svg').viewBox.baseVal.width,x:(el.scrollLeft+el.clientWidth/2-margin)/width};});
 await page.getByRole('button',{name:'Zoom canvas in',exact:true}).click();
 const beforePan=await camera(),area=await board.boundingBox();await page.mouse.move(area.x+area.width*.45,area.y+area.height*.5);await page.mouse.down();await page.mouse.move(area.x+area.width*.45+120,area.y+area.height*.5,{steps:6});await page.mouse.up();
 const navigated=await camera();expect(navigated.x).not.toBeCloseTo(beforePan.x,2);
 await page.setViewportSize({width:1280,height:1000});await expect.poll(camera).toEqual(expect.objectContaining({zoom:navigated.zoom}));
 expect((await camera()).x).toBeCloseTo(navigated.x,2);
});

test('Workbench Fit selection keeps its camera framing on resize with pristine notes',async({page,server})=>{
 const raw=fixture('explore');raw.page.sections[0].diagram.layouts[1].exploreLayout.prosePlacement='canvas';
 await page.setViewportSize({width:1920,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
 const board=page.locator('.explore-board'),camera=()=>board.evaluate(el=>{const width=parseFloat(el.style.getPropertyValue('--explore-width')),margin=parseFloat(el.style.getPropertyValue('--explore-margin-x'));return {zoom:width/el.querySelector('.boardcanvas>svg').viewBox.baseVal.width,x:(el.scrollLeft+el.clientWidth/2-margin)/width};});
 const beforeFit=await camera(),node=page.locator('.explore-canvas [data-dv-node="camera"]');await node.focus();await node.press('Enter');await expect(page.locator('#workspace-fit-selection')).toBeEnabled();
 await page.locator('#workspace-fit-selection').click();const fitted=await camera();expect(fitted.zoom).not.toBeCloseTo(beforeFit.zoom,2);
 await page.setViewportSize({width:1280,height:1000});await expect.poll(camera).toEqual(expect.objectContaining({zoom:fitted.zoom}));expect((await camera()).x).toBeCloseTo(fitted.x,2);
});
