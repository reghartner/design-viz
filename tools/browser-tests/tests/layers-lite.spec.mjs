import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

test('Layers syncs selection, lock history, source lifecycle, section navigation, keyboard, and Standard/Explore',async({page,server})=>{
 const raw=editorSpec();raw.page.blocks.push({heading:'Notes only',text:'No diagram in this section.'});
 const original=JSON.stringify(raw,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,original);
 await page.locator('#editor-tab-layers').click();
 const win=page.locator('#workspace-window-layers'),rows=win.locator('.layer-row');
 await expect(win).toBeVisible();await expect(rows).toHaveCount(3);
 await expect(rows.locator('.layer-title')).toHaveText(['Doorbell','Backend','Storage']);

 const search=win.locator('#layers-search');await search.focus();await page.keyboard.press('ArrowDown');
 await expect(rows.first().locator('.layer-select')).toBeFocused();
 await rows.filter({hasText:'Backend'}).locator('.layer-select').click();
 await expect(rows.filter({hasText:'Backend'})).toHaveClass(/is-selected/);
 await expect(page.locator('#docview [data-dv-node="b"]')).toHaveClass(/dv-sel/);
 await page.locator('#docview [data-dv-node="c"] .t1').click();
 await expect(rows.filter({hasText:'Storage'})).toHaveClass(/is-selected/);

 const storage=rows.filter({hasText:'Storage'}),lock=storage.locator('.layer-lock');await lock.click();
 await expect(lock).toHaveAttribute('aria-pressed','true');
 expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].diagram.nodes.c.locked).toBe(true);
 await expect(page.locator('#docview [data-dv-node="c"]')).toHaveAttribute('data-dv-position-locked','true');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await expect(storage.locator('.layer-lock')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#undo-builder')).toBeDisabled();

 await search.fill('back');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Backend');await search.fill('');
 const navigation=page.locator('#docview .explore-navigation');
 await navigation.getByRole('button',{name:'Notes only',exact:true}).click();
 await expect(page.locator('.workspace-active-section.workspace-empty-section .sec-h')).toHaveText('Notes only');
 await expect(win.locator('.layers-empty')).toContainText('no diagram');
 await navigation.getByRole('button',{name:'Delivery',exact:true}).click();
 await expect(page.locator('.workspace-active-section .sec-h')).toHaveText('Delivery');await expect(rows).toHaveCount(3);

 await page.locator('#src').evaluate(el=>{const raw=JSON.parse(el.value);delete raw.page.blocks[0].diagram;el.value=JSON.stringify(raw,null,2);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(win.locator('.layers-empty')).toContainText('no diagram');
 await page.locator('#src').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},original);await expect(rows).toHaveCount(3);

 await page.locator('#src').evaluate(el=>{const raw=JSON.parse(el.value);raw.page.blocks[0].diagram.layouts[0].presentation='explore';el.value=JSON.stringify(raw,null,2);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(rows).toHaveCount(3);await page.locator('#go').click();await expect(page.locator('.workspace-active-section .explore-stage')).toBeVisible();
 await expect(win).toBeVisible();await expect(rows).toHaveCount(3);
});
