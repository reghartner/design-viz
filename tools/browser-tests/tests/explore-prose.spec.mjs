import {test,expect,paste,closeTools,pagePreview,inspectPageElement} from '../helpers/test.mjs';
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
  const stage=await page.locator('.explore-stage').boundingBox(),board=await page.locator('.explore-board').boundingBox();expect(board).toEqual(stage);expect(stage.width).toBe(page.viewportSize().width);
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
  const graph=await page.locator('.explore-board .boardcanvas>svg').boundingBox(),width=(await notes(page).boundingBox()).width;await page.locator('#workspace-overlay-out').click();expect((await notes(page).boundingBox()).width).toBeCloseTo(width*.9,0);expect(await page.locator('.explore-board .boardcanvas>svg').boundingBox()).toEqual(graph);
  await pagePreview(page);await page.getByRole('button',{name:'Arrange section',exact:true}).click();const visible=page.getByRole('checkbox',{name:'Show Section notes in Explore',exact:true});const beforeHide=await source(page);await visible.uncheck();await expect(notes(page)).toBeHidden();expect(JSON.parse(await source(page)).page.sections[0].diagram.layouts[1].exploreLayout.prose.hidden).toBe(true);
  const hidden=await source(page);await page.getByRole('button',{name:'Optimize layout',exact:true}).click();await expect(notes(page)).toBeHidden();expect(JSON.parse(await source(page)).page.sections[0].diagram.layouts[1].exploreLayout.prose).toEqual({hidden:true});await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(hidden);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeHide);await expect(notes(page)).toBeVisible();await page.getByRole('button',{name:'Done arranging',exact:true}).click();await page.locator('#workspace-page').click();await closeTools(page);
  await inspectPageElement(page,notes(page).locator('[data-dv-para="0"]'));const text=page.locator('#guide .prose-editor textarea');await text.fill('**Updated explanation.** The recording stays local until delivery.');await text.press('Tab');await expect(notes(page).locator('strong')).toHaveText('Updated explanation.');await expect(page.locator('body')).toHaveClass(/workspace-diagram/);await closeTools(page);await verifySeparation(page);
  const saved=JSON.parse(await source(page));expect(saved.page.sections[0].diagram.layouts[0]).toEqual(fixture().page.sections[0].diagram.layouts[0]);expect(saved.page.sections[0].diagram.layouts[2]).toEqual(fixture().page.sections[0].diagram.layouts[2]);
  await page.screenshot({path:info.outputPath('explore-notes-editor.png')});
  const reader=await context.newPage();await reader.goto(await build(server,saved,'explore-notes-saved'));await verifySeparation(reader);await expect(notes(reader).locator('strong')).toHaveText('Updated explanation.');const r=await notes(reader).boundingBox(),s=await reader.locator('.explore-stage').boundingBox();expect(r.width/s.width).toBeCloseTo(saved.page.sections[0].diagram.layouts[1].exploreLayout.prose.w*.9,3);await reader.close();
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
