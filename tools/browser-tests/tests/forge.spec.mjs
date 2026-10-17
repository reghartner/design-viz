import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
test.use({reducedMotion:'no-preference'});
test('copied production Forge resource imports, saves and reloads through only the simulated bridge',async({page,context,server})=>{
  const raw=JSON.parse(await readFile(path.join(repo,'src/starters/homemap-story.json'),'utf8')),diagram=raw.page.sections[0].diagram;
  diagram.autoplay=false;diagram.nodes.camera.link='https://example.com/hld';
  diagram.layouts=[
    {id:'resident',name:'Resident story',sectionLayout:{confluence:[{panel:'home',x:0,y:0,w:8,h:16},{x:8,y:0,w:4,h:16},{controls:'steps',attachTo:'panel:home',x:0,y:16,w:8,h:6}]}},
    {id:'flow',name:'Data flow',sectionLayout:{confluence:[{x:0,y:0,w:12,h:16},{panel:'home',x:0,y:22,w:12,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:12,h:6}]}},
  ];diagram.defaultLayout='resident';
  async function open(page,configuring,config={}){
    await page.addInitScript(({configuring,config})=>{
      window.__calls=[];window.__bridge={callBridge:async(method,payload)=>{
        __calls.push({method,payload});
        if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config,macro:{isConfiguring:configuring}}};
        if(['submit','close','navigate'].includes(method))return true;
        throw Error('Unexpected Forge bridge call: '+method);
      }};
    },{configuring,config});
    await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();
  }
  await open(page,true);await page.locator('#spec-input').fill(JSON.stringify(raw,null,2));await page.locator('#validate').click();
  await expect(page.locator('.hmframe')).toBeVisible();await expect(page.locator('#save')).toBeEnabled();await expect(page.locator('.playback-status')).toHaveText('Paused');
  await page.locator('#save').click();await page.waitForFunction(()=>__calls.some(c=>c.method==='submit'));
  const config=await page.evaluate(()=>__calls.find(c=>c.method==='submit').payload.config);expect(JSON.parse(config.specJson)).toEqual(raw);
  await page.locator('#spec-input').fill('{');await page.locator('#validate').click();await expect(page.locator('#save')).toBeDisabled();await expect(page.locator('#docview')).toBeEmpty();
  await page.locator('#cancel').click();await page.waitForFunction(()=>__calls.some(c=>c.method==='close'));
  const published=await context.newPage();await open(published,false,config);
  await expect(published.locator('#configuration')).toBeHidden();await expect(published.locator('#spec-editor')).toHaveCount(0);
  await expect(published.locator('.hmframe')).toBeVisible();const grid=published.locator('.section-layout-grid');await expect(grid).toHaveAttribute('data-layout-target','confluence');
  await published.getByRole('button',{name:'Go to step 3 on Internet down',exact:true}).click();await expect(published.locator('.stepline')).toContainText('STEP 3/4');
  const caption=await published.locator('.stepline').innerText();await published.locator('[data-view-layout][data-layout-id="flow"]').click();await expect(grid).toBeVisible();await expect(grid).toHaveAttribute('data-layout-id','flow');
  await published.locator('a[href="https://example.com/hld"]').click();await published.waitForFunction(()=>__calls.some(c=>c.method==='navigate'));
  expect(await published.evaluate(()=>__calls.find(c=>c.method==='navigate').payload)).toEqual({url:'https://example.com/hld',type:'new-tab'});
  await published.locator('[data-view-layout][data-layout-id="resident"]').click();await expect(grid).toBeVisible();await expect(grid).toHaveAttribute('data-layout-id','resident');await expect(published.locator('.stepline')).toHaveText(caption,{useInnerText:true});await expect(published.locator('.termbar')).toHaveCount(1);
  await published.locator('.playback-button').click();await expect(published.locator('.playback-status')).toContainText('Playing');
  await published.locator('.playback-button').click();await expect(published.locator('.playback-status')).toHaveText('Paused');
});

test('Forge Explore height converges when the host resizes its iframe to content',async({page,server})=>{
  const raw=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
  raw.page.sections[0].diagram.defaultLayout='service-flow';raw.page.sections[0].diagram.autoplay=false;
  await page.addInitScript(config=>{
    window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config,macro:{isConfiguring:false}}};throw Error('Unexpected bridge call '+method);}};
  },{specJson:JSON.stringify(raw)});
  await page.setViewportSize({width:1600,height:600});await page.goto(server.origin+'/forge/index.html');
  const stage=page.locator('.explore-stage');await expect(stage).toBeVisible();
  const initial=(await stage.boundingBox()).height;expect(initial).toBeGreaterThan(740);expect(initial).toBeLessThan(780);
  async function settle(){
    const heights=[];
    for(let i=0;i<3;i++){
      const h=await page.evaluate(()=>document.documentElement.scrollHeight);heights.push(h);
      await page.setViewportSize({width:1600,height:h});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    expect(heights[2]).toBeCloseTo(heights[1],0);
  }
  await settle();expect((await stage.boundingBox()).height).toBeCloseTo(initial,0);
  await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Host policy'));});
  await page.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect(page.locator('.viewport-status')).toContainText('unavailable');
  expect((await stage.boundingBox()).height).toBeGreaterThan(990);await settle();
  await page.getByRole('button',{name:'Exit expanded diagram view',exact:true}).click();expect((await stage.boundingBox()).height).toBeCloseTo(initial,0);
});

// #602: "?" opens the reader keyboard shortcut sheet in the Confluence Forge viewer.
// row | fixture | assertion (scoped) | rejects
// 1 one "?" control | copied Forge resource, published macro (isConfiguring false) with software-systems starter (two tabs), 1440x900 | inside #docview: exactly one visible button whose own text is "?", accessible name "Keyboard shortcuts", aria-controls names a closed dialog | no control; a control outside the rendered reader
// 2 key opens that sheet | real click on the "Software request" tab (sheet closed first) then keyboard.press('?') | that dialog is the single open dialog, accessible name "Keyboard shortcuts" | key unwired; key opens a different sheet
// 3 roster lists only keys this reader handles | same open sheet | ordered [dt, dd] pairs of its dl rows equal FORGE_KEYS (Anywhere + Tab bar; no step or Present rows: the Forge viewer has no presenter) | the standalone roster listing Present/step keys that do nothing here; an empty sheet
// 4 Esc closes, focus returns | same | keyboard.press('Escape'): dialog not open; the tab is focused | a sheet that traps the reader or drops focus
// 5 listed tab keys work | tab bar focused | each listed key on the two-tab bar: ArrowRight selects+focuses "IoT reconciliation", ArrowLeft "Software request", End "IoT reconciliation", Home "Software request" | a roster row for keys that are not handled
// 6 button opens the sheet | real click on the "?" button | dialog open; Esc closes it and focuses the "?" button | button unwired
// 7 bridge untouched | same | the simulated bridge saw only getContext (no navigate/submit/close) while the sheet opened and closed | a "?" handler that routes through the Confluence bridge
// 8 text input | configuring macro: JSON pasted, Preview rendered (its "?" control visible = contrasting precondition); real click in #spec-input, Ctrl/Meta+A selects its text, type "?" | #spec-input value is exactly "?" (the key reached the field and replaced the selection); no dialog open | a "?" that is stolen from the import textarea
const FORGE_KEYS=[
  ['?','Open this shortcut sheet'],
  ['Esc','Close this sheet, an open menu or a popover'],
  ['← / →','Previous or next tab'],
  ['Home / End','First or last tab'],
];
test('Forge viewer: "?" opens the reader shortcut sheet listing only its keys, never from the import textarea',async({page,context,server})=>{
  const raw=JSON.parse(await readFile(path.join(repo,'src/starters/software-systems.json'),'utf8'));
  async function open(page,configuring,config={}){
    await page.addInitScript(({configuring,config})=>{
      window.__calls=[];window.__bridge={callBridge:async(method,payload)=>{
        __calls.push({method,payload});
        if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config,macro:{isConfiguring:configuring}}};
        if(['submit','close','navigate'].includes(method))return true;
        throw Error('Unexpected Forge bridge call: '+method);
      }};
    },{configuring,config});
    await page.setViewportSize({width:1440,height:900});
    await page.goto(server.origin+'/forge/index.html');await expect(page.locator('#app-status')).toBeHidden();
  }
  await open(page,false,{specJson:JSON.stringify(raw)});
  const reader=page.locator('#docview');
  const help=reader.locator('button:visible').filter({hasText:/^\s*\?\s*$/});
  await expect(help).toHaveCount(1);expect(await help.evaluate(b=>b.textContent.trim())).toBe('?');
  await expect(help).toHaveAccessibleName('Keyboard shortcuts');
  const id=await help.getAttribute('aria-controls');expect(id).toBeTruthy();
  const sheet=page.locator('dialog#'+id);await expect(sheet).toHaveCount(1);await expect(sheet).not.toHaveAttribute('open','');
  const first=reader.getByRole('tab',{name:'Software request',exact:true});
  await first.click();await expect(first).toBeFocused();
  await page.keyboard.press('?');
  await expect(page.locator('dialog[open]')).toHaveCount(1);await expect(page.locator('dialog[open]')).toHaveAttribute('id',id);
  await expect(sheet).toBeVisible();await expect(sheet).toHaveAccessibleName('Keyboard shortcuts');
  const rows=await sheet.locator('dl').evaluateAll(lists=>lists.flatMap(list=>[...list.querySelectorAll(':scope > dt')].map(dt=>[dt.textContent.replace(/\s+/g,' ').trim(),dt.nextElementSibling.textContent.replace(/\s+/g,' ').trim()])));
  expect(rows).toEqual(FORGE_KEYS);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveAttribute('open','');await expect(first).toBeFocused();
  const second=reader.getByRole('tab',{name:'IoT reconciliation',exact:true});
  await page.keyboard.press('ArrowRight');await expect(second).toHaveAttribute('aria-selected','true');await expect(second).toBeFocused();
  await page.keyboard.press('ArrowLeft');await expect(first).toHaveAttribute('aria-selected','true');await expect(first).toBeFocused();
  await page.keyboard.press('End');await expect(second).toHaveAttribute('aria-selected','true');await expect(second).toBeFocused();
  await page.keyboard.press('Home');await expect(first).toHaveAttribute('aria-selected','true');await expect(first).toBeFocused();
  await help.click();await expect(sheet).toHaveAttribute('open','');
  await page.keyboard.press('Escape');await expect(sheet).not.toHaveAttribute('open','');await expect(help).toBeFocused();
  expect(await page.evaluate(()=>__calls.map(c=>c.method))).toEqual(['getContext']);
  const configure=await context.newPage();await open(configure,true);
  const input=configure.locator('#spec-input'),json=JSON.stringify(raw);
  await input.fill(json);await configure.locator('#validate').click();
  await expect(configure.locator('#docview').locator('button:visible').filter({hasText:/^\s*\?\s*$/})).toHaveCount(1);
  await input.click();await configure.keyboard.press('ControlOrMeta+a');await configure.keyboard.type('?');
  await expect(input).toHaveValue('?');
  await expect(configure.locator('dialog[open]')).toHaveCount(0);
});
