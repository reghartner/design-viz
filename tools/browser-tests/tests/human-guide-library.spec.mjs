import {test,expect,paste} from '../helpers/test.mjs';
import {source,editorSpec} from '../fixtures/editor-spec.mjs';
import {pathToFileURL} from 'node:url';

function library(){
  const spec=editorSpec();spec.page.title='Reviewed delivery';spec.page.canon={version:1,id:'delivery',kind:'canonical',owner:'group:default/home'};
  delete spec.page.blocks[0].diagram.layouts;delete spec.page.blocks[0].diagram.defaultLayout;
  return {version:1,diagrams:[{id:'delivery',title:'Reviewed delivery',spec}]};
}
const guide=page=>page.locator('#human-guide');
const screen=(page,name)=>page.locator('#welcome-'+name+'-screen');
const openGuide=page=>page.locator('[data-open-human-guide]:visible').first().click();

test('human guide is readable, keyboard accessible and isolates the active editor',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(server.origin+'/workbench.html?layout=backstage#host');
  const before=await page.evaluate(()=>({url:location.href,length:history.length}));
  await openGuide(page);await expect(guide(page)).toBeVisible();
  await expect(guide(page).getByRole('heading',{name:'Start with a small, complete story.'})).toBeInViewport();
  await info.attach('human-guide-first-diagram',{body:await guide(page).screenshot(),contentType:'image/png'});
  await guide(page).getByRole('link',{name:'05 · Alternate outcomes'}).click();
  await expect(guide(page).getByRole('heading',{name:'Show where the same story goes differently.'})).toBeInViewport();
  await expect(guide(page).locator('.human-guide-timeline')).toBeInViewport();
  await info.attach('human-guide-alternates',{body:await guide(page).screenshot(),contentType:'image/png'});
  expect(await page.evaluate(()=>({url:location.href,length:history.length}))).toEqual(before);
  await page.keyboard.press('Escape');await expect(guide(page)).not.toBeVisible();await expect(page.locator('[data-open-human-guide]').first()).toBeFocused();
  await paste(page,source);await page.locator('#docview [data-dv-node="a"]').click();
  await page.locator('#guide').getByLabel('title',{exact:true}).fill('My camera');await page.locator('#guide').getByLabel('title',{exact:true}).press('Enter');
  const edited=await page.locator('#src').inputValue();const selection=await page.locator('#guide').textContent();
  await page.locator('#workspace-focus').click();await openGuide(page);
  await guide(page).getByRole('link',{name:'05 · Alternate outcomes'}).click();
  for(const key of ['Delete','Backspace','ControlOrMeta+d','ControlOrMeta+z','ControlOrMeta+k'])await page.keyboard.press(key);
  await expect(page.locator('#src')).toHaveValue(edited);await expect(guide(page)).toBeVisible();
  await page.locator('#hg-alternates').focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement.closest('#human-guide')!==null)).toBe(true);
  await page.keyboard.press('Escape');expect(await page.locator('#guide').textContent()).toBe(selection);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('guide and bundled canon example also work from a downloaded file',async({page,server})=>{
  await page.goto(pathToFileURL(server.root+'/workbench.html').href);await openGuide(page);
  await guide(page).getByRole('link',{name:'13 · When something surprises you'}).click();
  await expect(guide(page).getByRole('heading',{name:'Usually, it is the editing context.'})).toBeInViewport();
  await page.locator('#human-guide-close').click();await page.locator('#welcome-library').click();
  await expect(page.locator('#welcome-library-status')).toContainText('offline');
  await page.locator('.canon-library-card').first().click();await expect(page.locator('#canon-reader .doc-sec')).not.toHaveCount(0);
  await expect(page.locator('#workbench-workspace')).not.toBeVisible();await expect(page.locator('#canon-reader-edit')).toBeEnabled();
});

test('canon browsing is read-only and editing is an explicit undoable handoff with browser navigation',async({page,server},info)=>{
  const data=library();await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#workspace-home').click();const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text);
  await page.locator('#welcome-library').click();await expect(page.locator('#welcome-library-status')).toContainText('Published repository snapshot');
  await page.getByRole('button',{name:/CANONICAL.*Reviewed delivery/}).click();
  await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');await expect(page.locator('#workbench-workspace')).not.toBeVisible();
  await page.locator('#canon-reader [data-dv-node="a"]').click();await page.keyboard.press('Delete');
  await page.locator('#canon-reader .path-chip').filter({hasText:'Failure'}).click();
  await expect(page.locator('#src')).toHaveValue(source);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe(draft);
  await expect(page.locator('#canon-reader .dv-rowgrab,#canon-reader .home-layout-button')).toHaveCount(0);
  await info.attach('canon-reader',{body:await page.screenshot(),contentType:'image/png'});
  await page.goBack();await expect(screen(page,'library')).toBeVisible();await page.goForward();await expect(screen(page,'reader')).toBeVisible();
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();
  await expect(page.locator('#workbench-workspace')).toBeVisible();await expect(page.locator('#src')).toHaveValue(JSON.stringify(data.diagrams[0].spec,null,2));
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
  await page.goBack();await expect(screen(page,'reader')).toBeVisible();await page.reload();
  await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');await expect(page.locator('#workbench-workspace')).not.toBeVisible();
  await page.locator('#workbench-home').click();await page.locator('#welcome-resume').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('empty or invalid company libraries do not masquerade as demos and late loads do not navigate',async({page,server})=>{
  let data={version:1,diagrams:[]};await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();
  await expect(page.locator('#welcome-library-status')).toContainText('snapshot is empty');await expect(page.locator('.canon-library-card')).toHaveCount(0);
  data={version:99,diagrams:[]};await page.reload();await expect(page.locator('#welcome-library-status')).toContainText('Could not load');
  await expect(page.locator('.canon-library-card')).toHaveCount(0);data=library();await page.locator('#welcome-library-retry').click();
  await expect(page.locator('.canon-library-card')).toHaveCount(1);
  await page.unroute('**/diagrams.json');let release;const held=new Promise(resolve=>release=resolve);
  await page.route('**/diagrams.json',async route=>{await held;await route.fulfill({json:library()});});
  await page.reload();await expect(page.locator('#welcome-library-status')).toHaveText('Loading diagrams…');
  await page.goBack();release();await expect(page.locator('#welcome-home')).toBeVisible();await expect(page.locator('#src')).not.toHaveValue(JSON.stringify(library().diagrams[0].spec,null,2));
});
