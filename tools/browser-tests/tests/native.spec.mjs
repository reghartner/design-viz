import {test,expect,trackResources,resources} from '../helpers/test.mjs';
test('native Explore targets retain independent panels and fullscreen ownership through destroy',async({page,server})=>{
  await page.setViewportSize({width:1920,height:1400});await page.addInitScript(trackResources);
  await page.goto(server.origin+'/native/index.html#host-explore-route');await page.waitForFunction(()=>!!window.__host);
  const baseline=await resources(page);
  await page.evaluate(()=>{__host.left(true);__host.right(true);});
  const alpha=page.locator('#alpha'),beta=page.locator('#beta');
  await expect(alpha.locator('.preadout')).toHaveText('Success');await expect(beta.locator('.preadout')).toHaveText('Success');
  await page.evaluate(()=>__host.navigate({section:'delivery-2',view:'explore',path:'failed',step:'failure'}));
  await beta.getByRole('button',{name:'Explore',exact:true}).click();
  await expect(alpha.locator('.explore-stage')).toBeVisible();await expect(beta.locator('.explore-stage')).toBeVisible();
  await expect(alpha.locator('[data-view-id]')).toHaveAttribute('data-view-id','explore');
  await expect(alpha.locator('.stepid')).toHaveText('failure');
  await expect(alpha.locator('.preadout')).toHaveText('Failed');await expect(beta.locator('.preadout')).toHaveText('Success');
  expect(await page.evaluate(()=>__host.requests.length)).toBe(2);
  await page.evaluate(()=>document.fonts.ready);
  const leftPanel=alpha.locator('[data-explore-panel="state"]'),rightPanel=beta.locator('[data-explore-panel="state"]');
  const openUtilities=async scope=>{
    const pageUtilities=scope.locator('.reader-navigation .reader-page-utilities'),utilities=await pageUtilities.locator(':scope>summary').isVisible()?pageUtilities:scope.locator('.reader-navigation .reader-utilities');
    if(!await utilities.evaluate(el=>el.open))await utilities.locator(':scope>summary').click();
  };
  const clickUtility=async(scope,name)=>{
    const button=scope.getByRole('button',{name,exact:true});
    if(!await button.isVisible())await openUtilities(scope);
    await expect(button).toBeVisible();await button.click();
  };
  const openAlphaPanels=async()=>{
    const menu=alpha.locator('.reader-navigation .explore-panel-menu'),summary=menu.locator(':scope>summary');
    if(!await summary.isVisible()){
      await openUtilities(alpha);
      await expect(summary).toBeVisible();
    }
    await summary.click();
  };
  const originalRight=await rightPanel.boundingBox();
  const leftBefore=await leftPanel.boundingBox(),graphBefore=await alpha.locator('.explore-board .boardcanvas>svg').boundingBox();
  await openAlphaPanels();await expect(alpha.locator('.explore-overlay-value')).toHaveText('100%');
  await alpha.getByRole('button',{name:'Shrink floating panels',exact:true}).click();
  await expect(alpha.locator('.explore-overlay-value')).toHaveText('90%');
  expect((await leftPanel.boundingBox()).width).toBeCloseTo(leftBefore.width*.9,0);
  expect(await rightPanel.boundingBox()).toEqual(originalRight);
  expect(await alpha.locator('.explore-board .boardcanvas>svg').boundingBox()).toEqual(graphBefore);
  await alpha.getByRole('button',{name:'Reset floating panels size',exact:true}).click();await page.keyboard.press('Escape');
  const resetLeft=await leftPanel.boundingBox();
  await leftPanel.getByRole('button',{name:'Move state; use arrow keys',exact:true}).press('ArrowLeft');
  await expect(leftPanel).not.toHaveClass(/explore-stacked/);await expect(rightPanel).toHaveClass(/explore-stacked/);
  await leftPanel.getByRole('button',{name:'Resize state; use arrow keys',exact:true}).press('ArrowLeft');
  const narrow=await leftPanel.boundingBox();expect(narrow.width).toBeLessThan(resetLeft.width);
  expect(await rightPanel.boundingBox()).toEqual(originalRight);
  await leftPanel.getByRole('button',{name:'Hide state',exact:true}).click();
  await expect(leftPanel).toBeHidden();await expect(rightPanel).toBeVisible();
  await page.evaluate(()=>__host.navigate({section:'delivery-2',view:'brief',path:'happy',step:'done'}));
  await expect(alpha.locator('.explore-stage')).toBeHidden();await expect(beta.locator('.explore-stage')).toBeVisible();
  await page.evaluate(()=>__host.navigate({section:'delivery-2',view:'explore',path:'happy',step:'done'}));
  await expect(alpha.locator('.explore-stage')).toBeVisible();await expect(leftPanel).toBeHidden();
  await openAlphaPanels();
  await alpha.locator('.explore-panel-choices').getByRole('checkbox',{name:'state',exact:true}).check();
  await page.keyboard.press('Escape');await expect(leftPanel).toBeVisible();
  expect((await leftPanel.boundingBox()).width).toBeCloseTo(narrow.width,0);
  await clickUtility(alpha,'Expand diagram view');
  await expect.poll(()=>alpha.locator('.docview').evaluate(el=>el.getRootNode().fullscreenElement===el && el.contains(el.querySelector('.explore-navigation')))).toBe(true);
  await expect(beta.locator('.section-viewport')).not.toHaveClass(/viewport-expanded/);
  expect(await beta.locator('.section-viewport').evaluate(el=>el.getRootNode().fullscreenElement)).toBeNull();
  await page.evaluate(()=>__host.right(false));await expect(beta.locator('.docview')).toHaveCount(0);
  await expect.poll(()=>alpha.locator('.docview').evaluate(el=>el.getRootNode().fullscreenElement===el && el.contains(el.querySelector('.explore-navigation')))).toBe(true);
  await clickUtility(alpha,'Exit expanded diagram view');
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await page.evaluate(()=>__host.right(true));await beta.getByRole('button',{name:'Explore',exact:true}).click();
  await clickUtility(beta,'Expand diagram view');
  await expect.poll(()=>beta.locator('.docview').evaluate(el=>el.getRootNode().fullscreenElement===el && el.contains(el.querySelector('.explore-navigation')))).toBe(true);
  await expect(alpha.locator('.section-viewport')).not.toHaveClass(/viewport-expanded/);
  await page.evaluate(()=>__host.left(false));await expect(alpha.locator('.docview')).toHaveCount(0);
  await expect.poll(()=>beta.locator('.docview').evaluate(el=>el.getRootNode().fullscreenElement===el && el.contains(el.querySelector('.explore-navigation')))).toBe(true);
  await page.evaluate(()=>__host.right(false));await expect(beta.locator('.docview')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await expect.poll(()=>resources(page)).toEqual(baseline);
  expect(await page.evaluate(()=>document.body.className)).toBe('host-theme');
  expect(new URL(page.url()).hash).toBe('#host-explore-route');
});
test('native node menus survive right-button release and dismiss across viewer boundaries',async({page,server})=>{
  await page.goto(server.origin+'/native/index.html');await page.waitForFunction(()=>!!window.__host);
  await page.evaluate(()=>{__host.left(true);__host.right(true);});
  const alpha=page.locator('#alpha'),beta=page.locator('#beta');
  const menu=scope=>scope.getByRole('dialog',{name:'Links for Recording'});
  await alpha.locator('[data-dv-node="service"]').click({button:'right'});
  await expect(menu(alpha)).toBeVisible();
  await expect.poll(()=>menu(alpha).evaluate(el=>el.matches(':popover-open'))).toBe(true);
  await expect(menu(alpha).getByRole('link')).toBeFocused();
  await beta.locator('[data-dv-node="service"]').click({button:'right'});
  await expect(menu(alpha)).toBeHidden();await expect(menu(beta)).toBeVisible();
  await expect.poll(()=>menu(beta).evaluate(el=>el.matches(':popover-open'))).toBe(true);
  await page.locator('#host-sentinel').click();await expect(menu(beta)).toBeHidden();
  await beta.locator('.nrefs-trigger').click();await expect(menu(beta)).toBeVisible();
  await page.keyboard.press('Escape');await expect(menu(beta)).toBeHidden();
  await expect(beta.locator('.nrefs-trigger')).toBeFocused();
});
test('actual React native viewers isolate styles/navigation and retire stale revisions and resources',async({page,server})=>{
  await page.setViewportSize({width:1920,height:1400});await page.addInitScript(trackResources);
  await page.goto(server.origin+'/native/index.html#host-route');await page.waitForFunction(()=>!!window.__host);
  const baseline=await resources(page),hostStyle=await page.locator('#host-sentinel').evaluate(e=>({font:getComputedStyle(e).fontSize,bg:getComputedStyle(e).backgroundColor}));
  await page.evaluate(()=>{__host.left(true);__host.right(true);});
  const alpha=page.locator('#alpha'),beta=page.locator('#beta');
  await expect(alpha.locator('.preadout')).toHaveText('Success');await expect(beta.locator('.preadout')).toHaveText('Success');
  await expect(page.locator('iframe')).toHaveCount(0);
  const styles=await Promise.all([alpha,beta].map(view=>view.locator('.doc-title').evaluate(e=>({size:getComputedStyle(e).fontSize,family:getComputedStyle(e).fontFamily}))));
  expect(styles[0].size).not.toBe('5px');expect(styles[1].size).not.toBe('5px');expect(styles[0].family).not.toBe(styles[1].family);
  expect(await alpha.locator('svg').first().evaluate(e=>getComputedStyle(e).display)).not.toBe('none');
  await page.evaluate(()=>document.fonts.ready);expect((await resources(page)).fonts).toBeGreaterThan(baseline.fonts);
  await page.evaluate(()=>__host.navigate({section:'delivery-2',path:'failed',step:'failure'}));
  await expect(alpha.locator('.stepid')).toHaveText('failure');await expect(alpha.locator('.preadout')).toHaveText('Failed');await expect(beta.locator('.preadout')).toHaveText('Success');
  await page.evaluate(()=>__host.navigate({section:'missing',path:'happy'}));await expect(alpha.getByRole('alert')).toBeVisible();await expect(alpha.locator('.preadout')).toHaveText('Failed');
  await page.evaluate(()=>__host.navigate({section:'delivery-2',path:'happy',step:'2'}));
  await expect(alpha.locator('.stepid')).toHaveText('2');await expect(alpha.locator('.preadout')).toHaveText('Quiet');
  await page.evaluate(()=>__host.navigate({section:'delivery-2',path:'happy',step:'done'}));await expect(alpha.locator('.preadout')).toHaveText('Success');
  await page.evaluate(()=>__host.revision('r2'));await page.waitForFunction(()=>__host.requests.some(r=>r.revision==='r2'));
  await page.evaluate(()=>__host.revision('r3'));await expect(alpha.locator('.doc-title')).toHaveText('alpha newest');
  expect(await page.evaluate(()=>__host.requests.find(r=>r.revision==='r2').signal.aborted)).toBe(true);
  // The fixture flushes a host commit after the held promise reaction runs.
  await page.evaluate(()=>__host.resolveOld());await expect(page.locator('#host-columns')).toHaveAttribute('data-response-barrier','1');
  await expect(alpha.locator('.doc-title')).toHaveText('alpha newest');
  await page.evaluate(()=>__host.left(false));await expect(alpha.locator('.docview')).toHaveCount(0);await expect(beta.locator('.preadout')).toHaveText('Success');
  await page.evaluate(()=>__host.left(true));await expect(alpha.locator('.doc-title')).toHaveText('alpha newest');
  await alpha.getByRole('button',{name:'Fit width',exact:true}).click();await expect(beta.getByRole('button',{name:'Auto',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>{__host.left(false);__host.right(false);});
  await expect(alpha.locator('.docview')).toHaveCount(0);await expect(beta.locator('.docview')).toHaveCount(0);
  await expect.poll(()=>resources(page)).toEqual(baseline);
  expect(await page.evaluate(()=>document.body.className)).toBe('host-theme');expect(new URL(page.url()).hash).toBe('#host-route');
  expect(await page.locator('#host-sentinel').evaluate(e=>({font:getComputedStyle(e).fontSize,bg:getComputedStyle(e).backgroundColor}))).toEqual(hostStyle);
});
// #602: "?" opens the reader keyboard shortcut sheet in the Backstage native viewer.
// row | fixture | assertion (scoped) | rejects
// 1 one "?" control per viewer | native host, alpha+beta InlineFlowview mounted, 1920x1400 | inside EACH of #alpha/#beta: exactly one visible button whose own text is "?", accessible name "Keyboard shortcuts", aria-controls names a closed dialog in that same viewer | no control; one shared control for both mounts
// 2 key opens that viewer's own sheet | real click on the background of alpha's focusable diagram region (focus inside alpha's root, where native keyboard actions live; both sheets closed first) then keyboard.press('?') | alpha's dialog open, accessible name "Keyboard shortcuts"; beta's dialog not open | key unwired; one key press opening every mounted viewer's sheet
// 3 roster lists only keys this reader handles | same open alpha sheet | ordered [dt, dd] pairs of its dl rows equal NATIVE_KEYS (Anywhere + Tab bar; no step or Present rows: the native mount has no presenter) | the standalone roster listing Present/step keys that do nothing here; an empty sheet
// 4 Esc closes, focus returns | same | keyboard.press('Escape'): alpha dialog not open; alpha's diagram region focused again | a sheet that traps the reader or drops focus
// 5 listed tab keys work | real click on alpha's selected "Business" view tab (the reader's visible tablist "Views in selected Tab"; the document Tab bar is folded into Contents here) | each listed key on the two-tab list (roving focus): ArrowRight focuses "Explore", ArrowLeft "Business", End "Explore", Home "Business"; "Business" stays aria-selected (keys move focus, Enter/click selects) | a roster row for keys that are not handled
// 6 button opens the sheet | real click on beta's "?" button | beta dialog open, alpha dialog not open; beta's own [dt, dd] rows equal NATIVE_KEYS (each mount checked, not alpha standing for both); Esc closes it and focuses beta's "?" button | button unwired / opens the other viewer's sheet / a second mount with the standalone roster
// 7 text input in the host page | real click in host #host-search, type "?" | the input value is "?"; no dialog open in either viewer | a handler on the host document that steals "?" from portal search fields
// 8 linking and cleanup untouched | same | page hash stays "#host-route", history.length unchanged; after unmounting both, tracked resources equal the pre-mount baseline | a "?" handler that writes the URL, or leaks listeners/dialogs after destroy
const NATIVE_KEYS=[
  ['?','Open this shortcut sheet'],
  ['Esc','Close this sheet, an open menu or a popover'],
  ['← / →','Previous or next tab'],
  ['Home / End','First or last tab'],
];
test('native viewers: "?" opens each viewer\'s own reader shortcut sheet listing only its keys',async({page,server})=>{
  await page.setViewportSize({width:1920,height:1400});await page.addInitScript(trackResources);
  await page.goto(server.origin+'/native/index.html#host-route');await page.waitForFunction(()=>!!window.__host);
  const baseline=await resources(page),history=await page.evaluate(()=>window.history.length);
  await page.evaluate(()=>{__host.left(true);__host.right(true);});
  const alpha=page.locator('#alpha'),beta=page.locator('#beta');
  await expect(alpha.locator('.preadout')).toHaveText('Success');await expect(beta.locator('.preadout')).toHaveText('Success');
  const sheets={};
  for(const [name,viewer] of [['alpha',alpha],['beta',beta]]){
    const help=viewer.locator('button:visible').filter({hasText:/^\s*\?\s*$/});
    await expect(help).toHaveCount(1);expect(await help.evaluate(b=>b.textContent.trim())).toBe('?');
    await expect(help).toHaveAccessibleName('Keyboard shortcuts');
    const id=await help.getAttribute('aria-controls');expect(id).toBeTruthy();
    const sheet=viewer.locator('dialog#'+id);await expect(sheet).toHaveCount(1);await expect(sheet).not.toHaveAttribute('open','');
    sheets[name]={help,sheet};
  }
  const board=alpha.getByRole('region',{name:/diagram; drag background to pan/});
  await expect(board).toHaveCount(1);
  const box=await board.boundingBox();await page.mouse.click(box.x+8,box.y+box.height-8);await expect(board).toBeFocused();
  await page.keyboard.press('?');
  await expect(sheets.alpha.sheet).toHaveAttribute('open','');await expect(sheets.alpha.sheet).toBeVisible();
  await expect(sheets.alpha.sheet).toHaveAccessibleName('Keyboard shortcuts');
  await expect(sheets.beta.sheet).not.toHaveAttribute('open','');
  const rows=sheet=>sheet.locator('dl').evaluateAll(lists=>lists.flatMap(list=>[...list.querySelectorAll(':scope > dt')].map(dt=>[dt.textContent.replace(/\s+/g,' ').trim(),dt.nextElementSibling.textContent.replace(/\s+/g,' ').trim()])));
  expect(await rows(sheets.alpha.sheet)).toEqual(NATIVE_KEYS);
  await page.keyboard.press('Escape');
  await expect(sheets.alpha.sheet).not.toHaveAttribute('open','');await expect(board).toBeFocused();
  const views=alpha.locator('.reader-view-strip');
  const business=views.locator('.reader-top-view').filter({hasText:'Business'});
  await expect(business).toHaveAttribute('aria-selected','true');
  const second=views.locator('.reader-top-view').filter({hasText:'Explore'}),picker=alpha.getByRole('combobox',{name:'Choose View',exact:true});
  if(await business.isVisible()){
    await business.click();await expect(business).toBeFocused();
    await page.keyboard.press('ArrowRight');await expect(second).toBeFocused();
    await page.keyboard.press('ArrowLeft');await expect(business).toBeFocused();
    await page.keyboard.press('End');await expect(second).toBeFocused();
    await page.keyboard.press('Home');await expect(business).toBeFocused();await expect(business).toHaveAttribute('aria-selected','true');
  }else{
    await expect(picker).toBeVisible();await picker.focus();await picker.selectOption({label:'Explore'});await expect(second).toHaveAttribute('aria-selected','true');await picker.selectOption({label:'Business'});await expect(business).toHaveAttribute('aria-selected','true');await expect(picker).toBeFocused();
  }
  await sheets.beta.help.click();
  await expect(sheets.beta.sheet).toHaveAttribute('open','');await expect(sheets.alpha.sheet).not.toHaveAttribute('open','');
  await expect(sheets.beta.sheet).toHaveAccessibleName('Keyboard shortcuts');expect(await rows(sheets.beta.sheet)).toEqual(NATIVE_KEYS);
  await page.keyboard.press('Escape');
  await expect(sheets.beta.sheet).not.toHaveAttribute('open','');await expect(sheets.beta.help).toBeFocused();
  const search=page.locator('#host-search');await search.click();await page.keyboard.type('?');
  await expect(search).toHaveValue('?');
  await expect(sheets.alpha.sheet).not.toHaveAttribute('open','');await expect(sheets.beta.sheet).not.toHaveAttribute('open','');
  expect(new URL(page.url()).hash).toBe('#host-route');expect(await page.evaluate(()=>window.history.length)).toBe(history);
  await page.evaluate(()=>{__host.left(false);__host.right(false);});
  await expect(alpha.locator('.docview')).toHaveCount(0);await expect(beta.locator('.docview')).toHaveCount(0);
  await expect.poll(()=>resources(page)).toEqual(baseline);
});
