import {readFile} from 'node:fs/promises';
import {test,expect,paste,arrangeChapter,prepareEditorSurface} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

const spec=()=>{const raw=editorSpec(),d=raw.page.blocks[0].diagram;
  d.layouts[0].sectionLayout={default:[{x:0,y:0,w:8,h:14},{panel:'home',x:8,y:0,w:4,h:8},{controls:'steps',attachTo:'diagram',x:0,y:14,w:8,h:6}],confluence:[{x:0,y:0,w:12,h:14},{panel:'home',x:0,y:14,w:12,h:8}]};return raw;};
const source=page=>page.locator('#src').inputValue();
const saved=async page=>JSON.parse(await source(page)).page.blocks[0].diagram.layouts[0].sectionLayout;
async function open(page,server,raw){await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await prepareEditorSurface(page);await arrangeChapter(page);await page.evaluate(()=>document.fonts.ready);}

test('legacy geometry stays exact while24-column fields, pointer and keyboard gestures save one-step changes',async({page,server},testInfo)=>{
  const raw=spec(),original=JSON.stringify(raw);await open(page,server,raw);
  const section=page.locator('#docview .doc-sec').first(),grid=section.locator('.section-layout-grid');
  await section.evaluate(el=>{el.style.width='1000px';el.style.boxSizing='content-box';});
  await expect.poll(()=>grid.evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(1000,0);
  const geometry=await grid.evaluate((grid,legacy)=>{
    const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},base=box(grid);
    const reference=document.createElement('div');reference.style.cssText='position:fixed;left:0;top:0;width:1000px;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:32px;gap:8px;visibility:hidden';
    document.body.appendChild(reference);
    const records=legacy.filter(it=>!it.controls).map(it=>{const el=document.createElement('div');el.style.gridColumn=(it.x+1)+' / span '+it.w;el.style.gridRow=(it.y+1)+' / span '+it.h;reference.appendChild(el);
      const current=grid.querySelector('[data-layout-key="'+(it.panel?'panel:'+it.panel:'diagram')+'"]');return {reference:el,current};});
    const result=records.map(r=>{const actual=box(r.current);actual.x-=base.x;actual.y-=base.y;return {actual,legacy:box(r.reference)};});reference.remove();return result;
  },raw.page.blocks[0].diagram.layouts[0].sectionLayout.default);
  for(const item of geometry)for(const key of ['x','y','w','h'])expect(item.actual[key]).toBeCloseTo(item.legacy[key],1);
  expect(await source(page)).toBe(original);
  await expect(page.getByRole('spinbutton',{name:'Width',exact:true})).toHaveValue('16');
  await expect(page.getByRole('spinbutton',{name:'Width',exact:true})).toHaveAttribute('max','24');
  await page.getByRole('spinbutton',{name:'Width',exact:true}).fill('15');await page.getByRole('button',{name:'Apply size / position',exact:true}).click();
  expect((await saved(page)).columns).toBe(24);expect((await saved(page)).default[0].w).toBe(15);expect((await saved(page)).confluence[0].w).toBe(24);
  const first=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(first);
  await page.getByRole('combobox',{name:'Layout element',exact:true}).selectOption('panel:home');
  await page.getByRole('spinbutton',{name:'Column',exact:true}).fill('16');await page.getByRole('spinbutton',{name:'Width',exact:true}).fill('9');await page.getByRole('button',{name:'Apply size / position',exact:true}).click();
  expect((await saved(page)).default.find(it=>it.panel==='home')).toMatchObject({x:15,w:9});
  await page.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();
  const tile=grid.locator('[data-layout-key="diagram"]'),resize=tile.locator('.section-tile-resize');
  const beforeKeyboard=await source(page);await resize.focus();await page.keyboard.press('ArrowLeft');expect((await saved(page)).default[0].w).toBe(14);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeKeyboard);
  const handle=tile.locator('.section-tile-move');await handle.scrollIntoViewIfNeeded();const r=await handle.boundingBox();
  const pitch=await grid.evaluate(el=>(el.clientWidth+8)*Number(getComputedStyle(el).zoom)/24);
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+pitch,r.y+r.height/2);await page.mouse.up();
  expect((await saved(page)).default[0].x).toBe(1);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeKeyboard);
  await page.screenshot({path:testInfo.outputPath('grid-24-editor.png'),fullPage:true});
  await page.locator('#editor-tab-file').click();await page.locator('#workspace-export-trigger').click();const downloadPromise=page.waitForEvent('download');await page.locator('#file-save').click();const download=await downloadPromise;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));expect(exported.page.flowview.features).toContain('layout.grid-24');
  expect(exported.page.blocks[0].diagram.layouts[0].sectionLayout).toEqual(await saved(page));
  await page.locator('#file-input').setInputFiles(await download.path());await expect.poll(async()=>JSON.parse(await source(page))).toEqual(exported);await prepareEditorSurface(page);await arrangeChapter(page);expect((await saved(page)).default[0].w).toBe(15);expect((await saved(page)).default.find(it=>it.panel==='home').w).toBe(9);
  await section.evaluate(el=>{el.style.width='400px';el.style.boxSizing='content-box';});
  await expect.poll(()=>grid.evaluate(el=>Number(getComputedStyle(el).zoom))).toBeCloseTo(.4,4);
  const bounds=await grid.evaluate(el=>{const g=el.getBoundingClientRect();return Array.from(el.querySelectorAll('.section-layout-tile:not([hidden])')).map(t=>({right:t.getBoundingClientRect().right,limit:g.right}));});
  for(const b of bounds)expect(b.right).toBeLessThanOrEqual(b.limit+1);
  await page.screenshot({path:testInfo.outputPath('grid-24-narrow.png'),fullPage:true});
});
