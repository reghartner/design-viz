import {test,expect,paste,chooseNavigation,workspaceAction} from '../helpers/test.mjs';
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
async function openGuide(page){if(!await page.locator('[data-open-human-guide]:visible').count())await page.locator('.workspace-help>summary').click();await page.locator('[data-open-human-guide]:visible').first().click();}

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
  await page.locator('#guide').getByLabel('Name',{exact:true}).fill('My camera');await page.locator('#guide').getByLabel('Name',{exact:true}).press('Enter');
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

for(const offline of [false,true])test('agent walkthrough opens at its chapter and preserves the workflow'+(offline?' offline':''),async({page,server},info)=>{
  await page.setViewportSize({width:offline?760:1440,height:1000});
  await page.goto(offline?pathToFileURL(server.root+'/workbench.html').href:server.origin+'/workbench.html');
  await paste(page,source);await page.locator('#docview [data-dv-node="a"]').click();
  const title=page.locator('#guide').getByLabel('Name',{exact:true});
  await title.fill('Walkthrough draft');await title.press('Enter');
  const edited=await page.locator('#src').inputValue();
  await page.locator('#workbench-home').click();await page.locator('#welcome-agent').click();
  const setup=page.locator('#folder-agent-guide');await expect(setup).toBeVisible();
  const before=await page.evaluate(()=>({url:location.href,length:history.length,draft:localStorage.getItem('dv-workbench-draft')}));
  const entry=setup.locator('[data-open-human-guide]');
  await entry.click();
  await expect(page.locator('#hg-agent')).toBeFocused();
  await expect(guide(page).getByRole('heading',{name:'Your agent talks. The workbench shows the result.'})).toBeInViewport();
  await expect(guide(page).getByRole('link',{name:'12 · Work with an agent'})).toHaveAttribute('aria-current','location');
  await info.attach('agent-walkthrough'+(offline?'-narrow':''),{body:await guide(page).screenshot(),contentType:'image/png'});
  // All three alternate-route disclosures must remain keyboard reachable.
  const disclosures=page.locator('#hg-agent summary');
  await page.keyboard.press('Tab');await expect(disclosures.nth(0)).toBeFocused();
  await page.keyboard.press('Enter');await expect(disclosures.nth(0).locator('..')).toHaveAttribute('open','');
  await page.keyboard.press('Tab');await expect(disclosures.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');await expect(disclosures.nth(2)).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#human-guide-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(disclosures.nth(2)).toBeFocused();
  await page.keyboard.press('Escape');await expect(guide(page)).not.toBeVisible();await expect(entry).toBeFocused();
  expect(await page.evaluate(()=>({url:location.href,length:history.length,draft:localStorage.getItem('dv-workbench-draft')}))).toEqual(before);
  // Opening help from an existing modal must not dismiss or reset that modal.
  const help=entry;
  await page.locator('#folder-agent-start-resume').click();
  await help.click();await expect(page.locator('#hg-agent')).toBeFocused();
  await guide(page).getByRole('link',{name:'05 · Alternate outcomes'}).click();
  for(const key of ['Delete','ControlOrMeta+z'])await page.keyboard.press(key);
  await page.keyboard.press('Escape');await expect(guide(page)).not.toBeVisible();
  await expect(setup).toBeVisible();await expect(help).toBeFocused();
  await expect(page.locator('#folder-agent-start-resume')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#src')).toHaveValue(edited);
  // Contextual reopening resets only the guide chapter, not the folder form.
  await help.click();await expect(page.locator('#hg-agent')).toBeFocused();
  await page.locator('#human-guide-close').click();await expect(help).toBeFocused();
  await page.locator('#folder-agent-close-guide').click();await (await workspaceAction(page,'undo-builder')).click();
  await expect(page.locator('#src')).toHaveValue(source);
});

test('canon browsing is read-only and editing opens a separate project while preserving the earlier draft',async({page,server},info)=>{
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
  const published=JSON.stringify(data.diagrams[0].spec,null,2);
  await expect(page.locator('#workbench-workspace')).toBeVisible();await expect(page.locator('#src')).toHaveValue(published);
  await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(entry=>entry.text))).toContain(source);
  await page.goBack();await expect(screen(page,'reader')).toBeVisible();await page.reload();
  await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');await expect(page.locator('#workbench-workspace')).not.toBeVisible();
  await page.locator('#workbench-home').click();await page.locator('#welcome-resume').click();await expect(page.locator('#src')).toHaveValue(published);
  await page.locator('#workspace-home').click();await page.locator('#welcome-earlier-drafts>summary').click();
  await page.locator('#welcome-earlier-list').getByRole('button',{name:/^Browser contract ·/}).click();
  await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('Canon success keeps its document title in a compact unobscured app header across reader modes',async({page,server},info)=>{
  const data=library(),title='Sections and Views · Product journey',diagram=data.diagrams[0].spec.page.blocks[0].diagram;
  data.diagrams[0].title=data.diagrams[0].spec.page.title=title;
  diagram.layouts=[
    {id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
    {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}
  ];diagram.defaultLayout='standard';
  const second=structuredClone(data.diagrams[0]);second.id=second.spec.page.canon.id='inventory';second.title=second.spec.page.title='Inventory handoff';data.diagrams.push(second);
  await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html?diagram=delivery');
  const heading=page.getByRole('heading',{name:title,exact:true}),nav=page.locator('#canon-reader>.explore-navigation');
  await expect(heading).toBeVisible();await expect(heading).toHaveAttribute('title',title);
  await expect(page.locator('#workbench-reader-title')).toContainText(title);
  async function geometry(){
    await page.evaluate(()=>document.fonts.ready);
    return page.evaluate(()=>{
      const box=node=>{const r=node.getBoundingClientRect();return {top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};};
      const header=document.querySelector('.workbench-header'),brand=document.querySelector('.workbench-brand'),title=document.querySelector('#canon-reader-title');
      const back=document.querySelector('.canon-reader-toolbar .welcome-back'),nav=document.querySelector('#canon-reader>.explore-navigation');
      const surface=Array.from(document.querySelectorAll('#canon-reader .board')).find(node=>node.checkVisibility());
      const contents=document.querySelector('#canon-reader .reader-contents');
      return {header:box(header),brand:box(brand),title:box(title),back:box(back),nav:box(nav),surface:box(surface),
        contents:contents && contents.checkVisibility()?box(contents):null,intro:getComputedStyle(document.querySelector('#canon-reader-intro')).display,
        titleFits:title.scrollHeight<=title.clientHeight+1 && title.scrollWidth<=title.clientWidth+1,titleText:title.textContent};
    });
  }
  await page.getByRole('button',{name:'User guide',exact:true}).click();await expect(guide(page)).toBeVisible();await page.keyboard.press('Escape');await expect(guide(page)).not.toBeVisible();
  for(const width of [1440,900,390]){
    await page.setViewportSize({width,height:900});
    for(const mode of ['Standard','Explore']){
      await chooseNavigation(nav,'View',mode);const g=await geometry();
      expect(g.header.height).toBe(54);expect(Math.abs(g.nav.top-g.header.bottom)).toBeLessThanOrEqual(1);
      expect(g.title.left).toBeGreaterThanOrEqual(g.brand.right);expect(g.title.right).toBeLessThanOrEqual(g.back.left+1);
      expect(g.title.top).toBeGreaterThanOrEqual(g.header.top);expect(g.title.bottom).toBeLessThanOrEqual(g.header.bottom);
      expect(g.surface.top).toBeGreaterThanOrEqual(g.nav.bottom-1);if(g.contents)expect(g.contents.top).toBeGreaterThanOrEqual(g.nav.bottom-1);
      expect(g.intro).toBe('none');expect(g.titleFits).toBe(true);expect(g.titleText).toBe(title);
      await info.attach('canon-header-'+mode.toLowerCase()+'-'+width,{body:await page.screenshot(),contentType:'image/png'});
    }
  }
  const titleNode=await heading.elementHandle();await page.setViewportSize({width:900,height:900});
  await page.locator('.canon-reader-toolbar .welcome-back').click();await expect(page.locator('#welcome-home')).toBeVisible();await page.locator('#welcome-library').click();await expect(screen(page,'library')).toBeVisible();
  await page.getByRole('link',{name:/Inventory handoff/}).click();await expect(page.getByRole('heading',{name:'Inventory handoff',exact:true})).toBeVisible();
  expect(await titleNode.evaluate(node=>node===document.querySelector('#canon-reader-title'))).toBe(true);
  await page.locator('#canon-reader-edit').click();await expect(page.locator('#workbench-workspace')).toBeVisible();
  await page.goBack();await expect(page.getByRole('heading',{name:'Inventory handoff',exact:true})).toBeVisible();
  await page.locator('.canon-reader-toolbar .welcome-back').click();await expect(screen(page,'library')).toBeVisible();
  await expect(page.locator('#workbench-reader-title')).toBeHidden();await expect(page.locator('#canon-reader-intro>#canon-reader-title')).toHaveCount(1);
  await page.goto(server.origin+'/workbench.html?diagram=missing');
  await expect(page.locator('#welcome-home')).toBeVisible();await expect(page.locator('#welcome-link-error')).toContainText('“missing”');
  await expect(page.locator('body')).not.toHaveClass(/canon-reader-active/);await expect(page.locator('#workbench-reader-title')).toBeHidden();
});

test('Canon edit and browser Back preserve the selected chapter, path and step with stale-state fallback',async({page,server},info)=>{
  const data=library();await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();
  await page.getByRole('link',{name:/CANONICAL.*Reviewed delivery/}).click();
  const reader=page.locator('#canon-reader');
  await expect(reader.locator('[data-view-id]')).toHaveAttribute('data-view-id','flow');
  await expect(reader.locator('.stepid')).toHaveText('press');
  await reader.getByRole('button',{name:'Data flow',exact:true}).click();
  await reader.locator('.path-chip[data-dv-path="failed"]').click();
  await expect(reader.locator('.stepid')).toHaveText('failed');
  await info.attach('canon-reader-selected-position',{body:await page.screenshot(),contentType:'image/png'});

  await page.goBack();await expect(page.locator('#welcome-library-screen')).toBeVisible();
  await page.goForward();await expect(page.locator('#welcome-reader-screen')).toBeVisible();
  await expect(reader.locator('.stepid')).toHaveText('failed');
  await expect(reader.locator('.path-chip[data-dv-path="failed"]')).toHaveAttribute('aria-pressed','true');

  await page.locator('#canon-reader-edit').click();
  const editor=page.locator('#docview');
  await expect(editor.locator('[data-view-id]')).toHaveAttribute('data-view-id','flow');
  await expect(editor.locator('.stepid')).toHaveText('failed');
  await expect(editor.locator('.path-chip[data-dv-path="failed"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#undo-builder')).toBeDisabled();
  await info.attach('canon-editor-preserved-position',{body:await page.screenshot(),contentType:'image/png'});

  await page.goBack();await expect(page.locator('#welcome-reader-screen')).toBeVisible();
  await expect(reader.locator('[data-view-id]')).toHaveAttribute('data-view-id','flow');
  await expect(reader.locator('.stepid')).toHaveText('failed');
  await expect(reader.locator('.path-chip[data-dv-path="failed"]')).toHaveAttribute('aria-pressed','true');

  await page.evaluate(()=>{
    const state=structuredClone(history.state);
    state.flowviewWorkbenchEntry.readerTarget={d:'removed-chapter',v:'removed-view',m:'step',p:'removed-path',s:'removed-step'};
    history.replaceState(state,'');
  });
  await page.reload();
  await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
  await expect(reader.locator('[data-view-id]')).toHaveAttribute('data-view-id','flow');
  await expect(reader.locator('.stepid')).toHaveText('press');
  expect((await page.evaluate(()=>history.state.flowviewWorkbenchEntry)).readerTarget).toBeUndefined();
  await page.locator('#canon-reader-edit').click();
  await expect(editor.locator('[data-view-id]')).toHaveAttribute('data-view-id','flow');
  await expect(editor.locator('.stepid')).toHaveText('press');
  await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('Canon edit and browser Back retain the canonical owner View and its selected member',async({page,server})=>{
  const spec=JSON.parse(await readFile(path.join(repo,'examples/tab-views/tab-views.spec.json'),'utf8'));
  spec.page.canon={version:1,id:'delivery',kind:'canonical',owner:'group:default/home'};
  const data={version:1,diagrams:[{id:'delivery',title:'Reviewed delivery',spec}]};await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();await page.getByRole('link',{name:/CANONICAL.*Reviewed delivery/}).click();
  const reader=page.locator('#canon-reader'),navigation=reader.locator(':scope>.explore-navigation');
  await navigation.getByRole('button',{name:'Explore B + C',exact:true}).click();await navigation.locator('.reader-tree-sections[data-reader-view="explore-bc"]').getByRole('button',{name:'Section C',exact:true}).click();
  await expect(reader.locator('#section-c')).toBeVisible();await expect(reader.locator('#section-b')).toBeHidden();
  expect(await page.evaluate(()=>history.state.flowviewWorkbenchEntry.readerTarget)).toMatchObject({d:'c',v:'explore-bc'});
  await page.locator('#canon-reader-edit').click();
  await expect(page.locator('#docview>.explore-navigation').getByRole('button',{name:'Explore B + C',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#docview #section-c')).toBeVisible();expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(spec);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.goBack();await expect(navigation.getByRole('button',{name:'Explore B + C',exact:true})).toHaveAttribute('aria-pressed','true');await expect(reader.locator('#section-c')).toBeVisible();await expect(reader.locator('#section-b')).toBeHidden();
  await page.reload();await expect(navigation.getByRole('button',{name:'Explore B + C',exact:true})).toHaveAttribute('aria-pressed','true');await expect(reader.locator('#section-c')).toBeVisible();
});

/* #607 hosted reader row (contract matrix in reader-contents.spec.mjs):
   H1 ?diagram= deep link | tab-views example published as "delivery", its Notes Tab given two Views (Notes pages: 2 sections, Notes brief: 1); fresh load of workbench.html?diagram=delivery#d=c&v=explore-bc at 1440x900 | #canon-reader Contents: Section C row in explore-bc aria-current=page and #section-c visible; Product and Notes Tab rows aria-expanded=true; every View disclosure in both Tabs aria-expanded=true with its own member rows | a hosted reader that expands only the linked Tab, or a deep link that loses its section */
test('#607 a ?diagram= deep link lands on its section with every Contents Tab and View expanded',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  const spec=JSON.parse(await readFile(path.join(repo,'examples/tab-views/tab-views.spec.json'),'utf8'));
  spec.page.canon={version:1,id:'delivery',kind:'canonical',owner:'group:default/home'};
  const notes=spec.page.blocks[0].tabs.find(tab=>tab.label==='Notes');notes.sections.push({id:'notes-more',heading:'More notes',text:['A second Notes section.']});
  notes.views=[{id:'notes-pages',name:'Notes pages',presentation:'standard',sections:['notes','notes-more']},{id:'notes-brief',name:'Notes brief',presentation:'standard',sections:['notes-more']}];
  const data={version:1,diagrams:[{id:'delivery',title:'Reviewed delivery',spec}]};await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html?diagram=delivery#d=c&v=explore-bc');
  const reader=page.locator('#canon-reader'),navigation=reader.locator(':scope>.explore-navigation');
  const group=label=>navigation.locator('.reader-contents-tab').filter({has:page.locator('.reader-tree-tab').filter({hasText:label})});
  await expect(navigation.locator('.reader-contents')).toBeVisible();await expect(reader.locator('#section-c')).toBeVisible();
  await expect(navigation.locator('.reader-tree-sections[data-reader-view="explore-bc"]').getByRole('button',{name:'Section C',exact:true})).toHaveAttribute('aria-current','page');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(group('Product').locator('.reader-tree-tab')).toHaveAttribute('aria-expanded','true');await expect(group('Notes').locator('.reader-tree-tab')).toHaveAttribute('aria-expanded','true');await expect(group('Notes').locator('.reader-tree-view')).toHaveText(['Notes pages','Notes brief']);
  for(const [label,id,count] of [['Product','standard-ac',2],['Product','explore-bc',2],['Product','explore-a',1],['Notes','notes-pages',2],['Notes','notes-brief',1]]){
    await expect(group(label).locator('.reader-tree-view[data-tab-view="'+id+'"]').locator('..').locator('.reader-view-disclosure'),id).toHaveAttribute('aria-expanded','true');
    await expect(group(label).locator('.reader-tree-sections[data-reader-view="'+id+'"] .reader-tree-section')).toHaveCount(count);
  }
});

test('Canon edit and browser Back preserve Ambient mode while stale modes use the authored default',async({page,server})=>{
  const data=library();await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();
  await page.getByRole('link',{name:/CANONICAL.*Reviewed delivery/}).click();
  const reader=page.locator('#canon-reader'),editor=page.locator('#docview');
  await reader.getByRole('button',{name:'Ambient',exact:true}).click();
  await expect(reader.getByRole('button',{name:'Ambient',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.termbar')).toBeHidden();

  await page.locator('#canon-reader-edit').click();
  await expect(editor.getByRole('button',{name:'Ambient',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(editor.locator('.termbar')).toBeHidden();
  await page.goBack();await expect(page.locator('#welcome-reader-screen')).toBeVisible();
  await expect(reader.getByRole('button',{name:'Ambient',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.termbar')).toBeHidden();

  await page.evaluate(()=>{
    const state=structuredClone(history.state);
    state.flowviewWorkbenchEntry.readerTarget.m='retired-mode';history.replaceState(state,'');
  });
  await page.reload();await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
  await expect(reader.getByRole('button',{name:'Step',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.termbar')).toBeVisible();
  expect((await page.evaluate(()=>history.state.flowviewWorkbenchEntry.readerTarget)).m).toBeUndefined();
  await page.locator('#canon-reader-edit').click();
  await expect(editor.getByRole('button',{name:'Step',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(editor.locator('.termbar')).toBeVisible();
});

// #546 — the published-library entry uses plain wording ("Browse diagrams"), not the internal term "Canon diagrams".
// row | fixture                                   | assertion (scoped)                                                                 | rejects
// 1   | 1440×900 home, library served             | precondition: #welcome-home visible, #welcome-library-screen hidden                | a vacuous pass that starts on the library screen
// 2   | home                                      | #welcome-library's own <b> label has exact text "Browse diagrams"                   | label left as "Canon diagrams" / renamed to some other wording
// 3   | home                                      | getByRole('button',{name:/^Browse diagrams/}) resolves to #welcome-library and a real click on it opens #welcome-library-screen | label changed only in a hidden node while the accessible name still says Canon; id renamed
// 4   | library screen                            | #welcome-library-screen h1 has exact text "Browse diagrams."                        | card renamed but the screen heading still says "Canon diagrams."
// 5   | in-app user guide, §09 (#hg-evidence)     | its first <b> is exactly "Browse diagrams" and the section text has no "Canon diagrams" | guide still telling users to choose "Canon diagrams"
// 6   | library load fails (version 99 snapshot)  | #welcome-library-status says "Could not load" and contains no "canon" (any case)     | failure status still naming the internal term
// 7   | ?diagram=missing direct link              | #welcome-link-error names "Browse diagrams" and not "Canon diagrams"                 | stale-diagram recovery still pointing at the old label
test('the published-library entry, its screen, the user guide and its recovery text use the plain "Browse diagrams" label',async({page,server})=>{
  let data=library();await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');
  await expect(page.locator('#welcome-home')).toBeVisible();await expect(screen(page,'library')).toBeHidden();
  const entry=page.locator('#welcome-library');
  await expect(entry.locator('b')).toHaveText('Browse diagrams');
  const named=page.getByRole('button',{name:/^Browse diagrams/});
  await expect(named).toHaveCount(1);expect(await named.evaluate(el=>el.id)).toBe('welcome-library');
  await openGuide(page);const evidence=guide(page).locator('#hg-evidence');
  await expect(evidence.locator('b').first()).toHaveText('Browse diagrams');await expect(evidence).not.toContainText('Canon diagrams');
  await page.locator('#human-guide-close').click();await expect(guide(page)).not.toBeVisible();
  await named.click();await expect(screen(page,'library')).toBeVisible();
  await expect(screen(page,'library').locator('h1')).toHaveText('Browse diagrams.');
  data={version:99,diagrams:[]};await page.reload();await expect(screen(page,'library')).toBeVisible();
  const status=page.locator('#welcome-library-status');await expect(status).toContainText('Could not load');await expect(status).not.toContainText(/canon/i);
  data=library();await page.goto(server.origin+'/workbench.html?diagram=missing');
  const error=page.locator('#welcome-link-error');await expect(error).toContainText('“missing”');
  await expect(error).toContainText('Browse diagrams');await expect(error).not.toContainText('Canon diagrams');
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
  await page.getByRole('button',{name:'Copy link to current position',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.copiedLink)).not.toBeUndefined();const copied=new URL(await page.evaluate(()=>window.copiedLink));
  expect(copied.origin+copied.pathname+copied.search).toBe(url);expect(copied.hash).toContain('d=delivery');expect(copied.hash).toContain('v=flow');
  await page.goBack();await expect(screen(page,'library')).toBeVisible();expect(new URL(page.url()).searchParams.has('diagram')).toBe(false);
  await page.goForward();await expect(page.locator('#canon-reader-title')).toHaveText('Reviewed delivery');
  await page.locator('#canon-reader-edit').click();expect(new URL(page.url()).searchParams.has('diagram')).toBe(false);
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(library().diagrams[0].spec,null,2));
  await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts')).map(entry=>entry.text))).toContain(source);
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
  await page.setViewportSize({width:390,height:800});const utilities=page.locator('#canon-reader .reader-utilities');await utilities.locator('summary').click();
  await page.getByRole('button',{name:'Copy link to current position',exact:true}).click();
  const fallback=page.getByRole('textbox',{name:'Copy this link manually'});await expect(fallback).toHaveValue(/\?diagram=delivery#.*d=delivery/);const fallbackURL=new URL(await fallback.inputValue());
  expect(fallbackURL.origin+fallbackURL.pathname+fallbackURL.search).toBe(server.origin+'/workbench.html?diagram=delivery');expect(fallbackURL.hash).toContain('d=delivery');
  await expect(fallback).toBeVisible();expect(await fallback.evaluate(el=>{const r=el.getBoundingClientRect(),u=el.parentElement.getBoundingClientRect();el.focus();el.select();return {contained:r.left>=u.left && r.right<=u.right && r.top>=u.top && r.bottom<=u.bottom && r.left>=0 && r.right<=innerWidth,selected:el.selectionStart===0 && el.selectionEnd===el.value.length};})).toEqual({contained:true,selected:true});
  await page.goto(server.origin+'/workbench.html?diagram=missing');
  await expect(page.locator('#welcome-link-error')).toContainText('“missing”');
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

// #548 (Chuck 2026-10-16) — `?diagram=<published ID>` opens one published diagram
// read-only with an Edit action. Every form that opens a diagram on main keeps
// working; an unknown value, including any address- or path-shaped value, lands
// on Welcome with one message naming it, and nothing else opens.
// row | fixture                                              | assertion (scoped)                                                                                        | rejects
// 1   | 1440×900, no query                                   | precondition: #welcome-home visible, #welcome-link-error hidden, #canon-reader-title hidden                | a vacuous pass that already starts elsewhere or shows the error
// 2   | ?diagram=delivery                                    | #canon-reader-title "Reviewed delivery"; #canon-reader-edit enabled "Edit in Workbench →"; workspace hidden; #welcome-link-error hidden | the plain ID form broken, or opening straight into the editor
// 3   | ?diagram=team.delivery_v2 (dots/underscore)          | #canon-reader-title "Team delivery v2"; Edit enabled; #welcome-link-error hidden                          | a stricter ID check that drops legal canon/document-link IDs
// 4   | ?diagram=Ops.Delivery-2 (mixed case, hyphen)         | #canon-reader-title "Ops delivery 2"; Edit enabled; #welcome-link-error hidden                            | case-folding or lower-case-only checks
// 4b  | ?diagram=2024.q3-review_1 (digit-leading)            | #canon-reader-title "Q3 review"; Edit enabled; #welcome-link-error hidden                                 | a letter-first shape check
// 4d  | ?diagram=7 (one character, the shortest legal ID)    | #canon-reader-title "Seven"; Edit enabled; #welcome-link-error hidden                                    | a minimum-length check
// 4c  | ?diagram=<200-character ID> (library maximum)        | #canon-reader-title "Longest ID"; Edit enabled; #welcome-link-error hidden                                | a length cap below the library's 200
// 5   | ?diagram=team%2Edelivery%5Fv2 (percent-encoded)      | #canon-reader-title "Team delivery v2"                                                                    | matching the raw query bytes instead of the decoded value
// 6   | ?layout=backstage&diagram=delivery#d=delivery&p=failed (other query + deep-link fragment) | #canon-reader-title "Reviewed delivery"; #welcome-link-error hidden                  | extra parameters or a fragment breaking the link
// 7   | row 2, real click on #canon-reader-edit              | #workbench-workspace visible                                                                              | a reader with a dead Edit action
// 8   | ?diagram=never-published                             | #welcome-home visible; #welcome-link-error visible and names “never-published”; #canon-reader-title hidden; body not .canon-reader-active; #workbench-workspace hidden; #welcome-{paste,new,agent,library,reader}-screen each hidden | the old reader error screen; an error that does not name the value; an editor opened
// 9   | row 8, every Welcome home action (#welcome-agent, tour, #welcome-example-expand, #welcome-catalog, #welcome-paste, #welcome-open, #welcome-new, #welcome-library, #welcome-agent-prompt) | each is visible, enabled and the top element at its own centre (not covered by the message); real clicks on each, from a fresh unknown-link landing, reach its own destination: paste/new/library/agent screens; #welcome-agent → #workbench-workspace; tour and #welcome-example-expand → dialog.workbench-tour-host open; #welcome-catalog → #catalog-picker open; #welcome-open (stubbed native picker returning the fixture file) → #src holds that file | an error state that hides, disables or covers any Welcome action
// 10  | ?diagram=https://evil.example/x.spec.json            | as row 8, and #welcome-link-error text equals row 8's text with the value substituted                    | a separate refusal path that looks different from unknown
// 11  | ?diagram=//evil.example/x.spec.json                  | as row 10                                                                                                 | protocol-relative addresses handled differently
// 12  | ?diagram=diagrams/delivery/delivery.spec.json        | as row 10                                                                                                 | same-origin paths handled differently
// 12c | ?diagram=DELIVERY (wrong case of published "delivery") | as row 10                                                                                               | case-folded matching instead of the exact match main uses
// 12b | ?diagram= (empty value)                              | as row 10 (message names “”)                                                                              | an empty value silently treated as a plain Welcome visit
// 13  | rows 10–12                                           | 0 requests to evil.example; 0 requests whose path ends in delivery.spec.json                              | values used as a spec transport
// 14  | in-app user guide §09 (#hg-evidence)                 | exactly one <code> in #hg-evidence contains "?diagram="                                                    | the parameter left undocumented in the guide
// 15  | docs/workbench-user-guide.md                         | exactly one paragraph names `?diagram=<diagram ID>`; it says published diagram, read-only, Edit in Workbench, home page | the written guide left without the parameter or its error behaviour
// Cross-document link compatibility (Claude artifacts, hosted site, Backstage) stays
// owned by document-links, handoffs, context-handoffs, canon-lazy-library and
// backstage-workspace specs; rows 2–6 (with 4b, 4c) pin the ?diagram= forms that open today.
test('a ?diagram= link opens one published diagram read-only, and unknown values land on Welcome with a message naming them',async({page,server})=>{
  const data=library();
  const longId='L'+'o'.repeat(198)+'9';
  for(const [id,title] of [['team.delivery_v2','Team delivery v2'],['Ops.Delivery-2','Ops delivery 2'],['2024.q3-review_1','Q3 review'],['7','Seven'],[longId,'Longest ID']]){
    const entry=library().diagrams[0];entry.id=id;entry.title=title;entry.spec.page.title=title;entry.spec.page.canon.id=id;data.diagrams.push(entry);
  }
  await page.route('**/diagrams.json',route=>route.fulfill({json:data}));
  const foreign=[],specFetches=[];
  // Match by host: a glob would also match the Workbench URL whose query holds the address.
  await page.route(url=>url.hostname==='evil.example',route=>{foreign.push(route.request().url());return route.fulfill({json:{}});});
  page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('delivery.spec.json'))specFetches.push(request.url());});
  // Native file picker stand-in, as in working-file.spec.mjs: returns the fixture spec.
  await page.addInitScript(({source})=>{
    window.showOpenFilePicker=async()=>{
      const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('linked.spec.json',{create:true});
      const stream=await handle.createWritable();await stream.write(source);await stream.close();return [handle];
    };
  },{source});
  await page.setViewportSize({width:1440,height:900});
  const home=page.locator('#welcome-home'),linkError=page.locator('#welcome-link-error'),title=page.locator('#canon-reader-title');
  const edit=page.locator('#canon-reader-edit'),workspace=page.locator('#workbench-workspace');
  await page.goto(server.origin+'/workbench.html');
  await expect(home).toBeVisible();await expect(linkError).toBeHidden();await expect(title).toBeHidden();
  for(const [query,expected] of [['?diagram=delivery','Reviewed delivery'],['?diagram=team.delivery_v2','Team delivery v2'],['?diagram=Ops.Delivery-2','Ops delivery 2'],
    ['?diagram=2024.q3-review_1','Q3 review'],['?diagram=7','Seven'],['?diagram='+longId,'Longest ID'],['?diagram=team%2Edelivery%5Fv2','Team delivery v2'],['?layout=backstage&diagram=delivery#d=delivery&p=failed','Reviewed delivery']]){
    await page.goto(server.origin+'/workbench.html'+query);
    await expect(title).toHaveText(expected);await expect(edit).toBeEnabled();await expect(edit).toHaveText('Edit in Workbench →');
    await expect(workspace).toBeHidden();await expect(linkError).toBeHidden();
  }
  await page.goto(server.origin+'/workbench.html?diagram=delivery');await expect(title).toHaveText('Reviewed delivery');
  await edit.click();await expect(workspace).toBeVisible();
  async function landsOnWelcome(value){
    // Raw query bytes, as a person would paste them (none of these values contains & # + or %).
    await page.goto(server.origin+'/workbench.html?diagram='+value);
    await expect(home).toBeVisible();await expect(linkError).toBeVisible();await expect(linkError).toContainText('“'+value+'”');
    await expect(title).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/canon-reader-active/);await expect(workspace).toBeHidden();
    for(const other of ['paste','new','agent','library','reader'])await expect(page.locator('#welcome-'+other+'-screen')).toBeHidden();
    return await linkError.textContent();
  }
  const unknown=await landsOnWelcome('never-published');
  for(const selector of ['#welcome-agent','#welcome-home [data-workbench-tour]','#welcome-example-expand','#welcome-catalog','#welcome-paste','#welcome-open','#welcome-new','#welcome-library','#welcome-agent-prompt']){
    const action=page.locator(selector);await expect(action).toBeVisible();await expect(action).toBeEnabled();
    expect(await action.evaluate(el=>{el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!top && el.contains(top);}),selector).toBe(true);
  }
  for(const [action,target] of [['#welcome-paste','#welcome-paste-screen'],['#welcome-new','#welcome-new-screen'],['#welcome-library','#welcome-library-screen'],['#welcome-agent-prompt','#welcome-agent-screen'],
    ['#welcome-agent','#workbench-workspace'],['#welcome-home [data-workbench-tour]','dialog.workbench-tour-host'],['#welcome-example-expand','dialog.workbench-tour-host'],['#welcome-catalog','#catalog-picker'],['#welcome-open','#workbench-workspace']]){
    if(action!=='#welcome-paste')await landsOnWelcome('never-published');
    await page.locator(action).click();await expect(page.locator(target),action).toBeVisible();
    if(action==='#welcome-open')await expect(page.locator('#src')).toHaveValue(source);
  }
  for(const value of ['https://evil.example/x.spec.json','//evil.example/x.spec.json','diagrams/delivery/delivery.spec.json','','DELIVERY'])
    expect(await landsOnWelcome(value)).toBe(unknown.replace('never-published',value));
  expect(foreign).toEqual([]);expect(specFetches).toEqual([]);
  await openGuide(page);
  await expect(guide(page).locator('#hg-evidence code',{hasText:'?diagram='})).toHaveCount(1);
  const written=await readFile(path.join(repo,'docs/workbench-user-guide.md'),'utf8');
  const paragraphs=written.split(/\n\s*\n/).filter(block=>block.includes('`?diagram=<diagram ID>`'));
  expect(paragraphs).toHaveLength(1);
  for(const phrase of ['published diagram','read-only','Edit in Workbench','home page'])expect(paragraphs[0]).toContain(phrase);
});
