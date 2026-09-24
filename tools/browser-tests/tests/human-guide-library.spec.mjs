import {test,expect,paste} from '../helpers/test.mjs';
import {source,editorSpec} from '../fixtures/editor-spec.mjs';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

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
  await page.locator('#editor-tab-file').click();await page.locator('.workspace-preferences summary').click();
  await page.locator('#workspace-focus').click();await page.locator('#editor-tab-inspect').click();await openGuide(page);
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
  await page.getByRole('link',{name:/CANONICAL.*Reviewed delivery/}).click();
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


test('a saved canon document builds into the real served library without registration',async({page,server})=>{
  const directory=path.join(server.root,'docs/diagrams/feature'),file=path.join(directory,'story.json'),output=path.join(server.root,'diagrams.json');
  await mkdir(directory,{recursive:true});const spec=library().diagrams[0].spec;
  await writeFile(file,JSON.stringify(spec));
  const publish=()=>execFileSync(process.execPath,[path.join(repo,'tools/canon/library.mjs'),'--diagrams',path.join(server.root,'docs/diagrams'),'--out',output]);
  try{
    publish();await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();
    await expect(page.locator('#welcome-library-status')).toContainText('Published repository snapshot · 1 diagram');
    await page.getByRole('link',{name:/CANONICAL.*Reviewed delivery/}).click();
    await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
    await page.locator('#canon-reader-edit').click();await expect(page.locator('#src')).toHaveValue(JSON.stringify(spec,null,2));
    expect(JSON.parse(await readFile(file,'utf8'))).toEqual(spec);
    delete spec.page.canon;await writeFile(file,JSON.stringify(spec));publish();
    await page.goto(server.origin+'/workbench.html');await page.locator('#workspace-home').click();await page.locator('#welcome-library').click();
    await expect(page.locator('#welcome-library-status')).toContainText('snapshot is empty');
    await expect(page.locator('.canon-library-card')).toHaveCount(0);
  }finally{await rm(output,{force:true});await rm(path.join(server.root,'docs'),{recursive:true,force:true});}
});


test('published diagram links open directly in fresh tabs, preserve drafts, and copy a stable URL',async({page,server})=>{
  await page.context().route('**/diagrams.json',route=>route.fulfill({json:library()}));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedLink=text;}}});});
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('#workspace-home').click();
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text);
  await page.locator('#welcome-library').click();
  const card=page.getByRole('link',{name:/CANONICAL.*Reviewed delivery/}),url=server.origin+'/workbench.html?diagram=delivery';
  await expect(card).toHaveAttribute('href',url);
  // This new browser tab has no workbench history entry or selected diagram state.
  const fresh=await page.context().newPage();await fresh.goto(await card.getAttribute('href'));
  await expect(fresh.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
  await expect(fresh.locator('#workbench-workspace')).not.toBeVisible();
  expect(await fresh.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe(draft);
  await fresh.reload();await expect(fresh.locator('#canon-reader-edit')).toBeEnabled();
  await fresh.close();
  await card.click();await expect(page).toHaveURL(url);
  await page.getByRole('button',{name:'Copy link',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.copiedLink)).toBe(url);
  await page.goBack();await expect(screen(page,'library')).toBeVisible();expect(new URL(page.url()).searchParams.has('diagram')).toBe(false);
  await page.goForward();await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
  await page.locator('#canon-reader-edit').click();expect(new URL(page.url()).searchParams.has('diagram')).toBe(false);
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(library().diagrams[0].spec,null,2));
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('direct readers report missing documents and snapshots, retry, and offer a manual copy fallback',async({page,server,audit})=>{
  let data=library(),missing=false,backendCalls=0;
  await page.route('**/diagrams.json',route=>missing?route.fulfill({status:404,body:'No published snapshot'}):route.fulfill({json:data}));
  await page.route('**/api/canon/**',route=>{backendCalls++;return route.fulfill({status:500});});
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('Denied'))}});
    document.execCommand=()=>false;
  });
  await page.goto(server.origin+'/workbench.html?diagram=delivery&canon=old&review=secret');
  await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');expect(backendCalls).toBe(0);
  await page.getByRole('button',{name:'Copy link',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Copy this link manually'})).toHaveValue(server.origin+'/workbench.html?diagram=delivery');
  await page.goto(server.origin+'/workbench.html?diagram=missing');
  await expect(page.locator('#canon-reader-error')).toContainText('no longer in the published library');
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();await expect(page.locator('#canon-reader-copy')).toBeDisabled();
  missing=true;await page.goto(server.origin+'/workbench.html?diagram=delivery');
  await expect(page.locator('#canon-reader-error')).toContainText('No published diagram library');
  await expect(page.locator('#canon-reader .doc-sec')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  // This test intentionally exercises an actual HTTP 404. Keep every other
  // browser/network failure subject to the shared audit.
  const expected=['HTTP 404: '+server.origin+'/diagrams.json','console: Failed to load resource: the server responded with a status of 404 (Not Found)'];
  for(const message of expected){expect(audit).toContain(message);audit.splice(audit.indexOf(message),1);}
  missing=false;await page.locator('#canon-reader-retry').click();await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
});
