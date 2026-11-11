/* #1322 reader Text button and read-only text window (src/viewer/text-view.js).
   The page is PR 1's fixture board with its provider import resolved, so the
   window shows imported nodes and edges and long Prometheus/CloudWatch queries. */
import {writeFile,readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const require=createRequire(import.meta.url);
const {composeSources}=require(path.join(repo,'tools/source-loader.cjs'));
const FIXTURE=path.join(repo,'tests/fixtures/text-view');
function board(skin){
  const C={URL,TextEncoder};vm.createContext(C);vm.runInContext(composeSources(['canon.js','validator.js']),C);
  const read=name=>JSON.parse(readFileSync(path.join(FIXTURE,name),'utf8'));
  const raw=JSON.parse(JSON.stringify(C.FlowTopology.materialize([read('board.json'),read('platform.json')])[0]));
  if(skin)raw.page.skin=skin;
  return raw;
}
async function open(page,server,raw=board(),name='text-view'){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
  await page.goto(server.origin+'/'+name+'.html');return page.locator('#docview');
}
const launcher=root=>root.getByRole('button',{name:'Text view',exact:true});
const dialogOf=root=>root.getByRole('dialog',{name:'Text view',exact:true});
const textOf=dialog=>dialog.getByRole('tabpanel').locator('pre');
// Fully shown: inside every overflow ancestor (across shadow hosts), inside the
// viewport, and the elementFromPoint hit at its centre.
async function shown(locator){
  return locator.evaluate(node=>{
    const r=node.getBoundingClientRect();if(!r.width || !r.height)return 'empty';
    const up=a=>a.parentElement || (a.getRootNode() && a.getRootNode().host) || null;
    for(let a=up(node);a;a=up(a)){const s=getComputedStyle(a);if(/hidden|clip|auto|scroll/.test(s.overflowX+' '+s.overflowY)){const b=a.getBoundingClientRect();if(r.left<b.left-1 || r.right>b.right+1 || r.top<b.top-1 || r.bottom>b.bottom+1)return 'clipped by '+(a.className || a.tagName);}}
    if(r.left<-1 || r.top<-1 || r.right>innerWidth+1 || r.bottom>innerHeight+1)return 'outside viewport';
    const hit=node.getRootNode().elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return hit===node || node.contains(hit)?'ok':'covered by '+(hit && (hit.className || hit.tagName));
  });
}
const focusInside=dialog=>dialog.evaluate(d=>{let a=d.getRootNode().activeElement;while(a && a.shadowRoot && a.shadowRoot.activeElement)a=a.shadowRoot.activeElement;return d.contains(a);});
const isFocused=locator=>locator.evaluate(n=>n.getRootNode().activeElement===n);

for(const width of [1440,1024])test('Text sits beside Search in the top bar at '+width+', opens a labelled window and closes with Escape and Close while Contents stays open',async({page,server})=>{
  await page.setViewportSize({width,height:900});const root=await open(page,server,board(),'text-view-'+width);const button=launcher(root);
  await expect(button).toBeVisible();await expect(button).toHaveText('Text');expect(await shown(button)).toBe('ok');
  expect(await button.evaluate(n=>!!n.closest('.reader-top') && !n.closest('.reader-utilities,.reader-utility-options,.reader-page-utilities'))).toBe(true);
  expect(await button.evaluate(n=>{const launch=n.closest('.text-view-launch');return !!launch && !!launch.previousElementSibling && launch.previousElementSibling.classList.contains('document-search-launch');})).toBe(true);
  await expect(button).toHaveAttribute('aria-expanded','false');
  const contents=root.locator('.reader-contents');const contentsOpen=await contents.isVisible();
  await button.click();const dialog=dialogOf(root);await expect(dialog).toBeVisible();await expect(button).toHaveAttribute('aria-expanded','true');
  expect(await focusInside(dialog)).toBe(true);expect(await shown(textOf(dialog))).toBe('ok');
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(await isFocused(button)).toBe(true);
  expect(await contents.isVisible()).toBe(contentsOpen);
  await button.click();await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Close text view',exact:true}).click();await expect(dialog).toBeHidden();expect(await isFocused(button)).toBe(true);
});

test('Escape leaves Contents open, closes an open zoom menu first, and arrow keys in the window do not move the diagram step',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server,board(),'text-view-keys');
  const contents=root.locator('.reader-contents');await expect(contents).toBeVisible();
  const stepState=()=>root.locator('#section-delivery').evaluate(sec=>({current:Array.from(sec.querySelectorAll('[aria-current="true"]')).map(n=>n.getAttribute('data-step-source') || n.textContent.trim()),text:Array.from(sec.querySelectorAll('.step-text')).map(n=>n.textContent)}));
  const before=await stepState();
  await launcher(root).click();const dialog=dialogOf(root);await expect(dialog).toBeVisible();
  await dialog.getByRole('tab',{name:'Steps'}).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
  await textOf(dialog).focus();for(const key of ['ArrowRight','ArrowLeft','ArrowDown',' '])await page.keyboard.press(key);
  expect(await stepState()).toEqual(before);
  const zoom=root.getByRole('button',{name:'Zoom',exact:true}).or(root.locator('.reader-zoom-menu>summary')).first();await zoom.click();
  await expect(root.locator('.reader-zoom-menu')).toHaveAttribute('open','');
  await page.keyboard.press('Escape');await expect(root.locator('.reader-zoom-menu')).not.toHaveAttribute('open','');await expect(dialog).toBeVisible();
  await dialog.getByRole('tab',{name:'Steps'}).focus();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(contents).toBeVisible();
});

test('Text and Search never overlap: opening one closes the other',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server,board(),'text-view-search');
  const search=root.locator('.document-search'),dialog=dialogOf(root);
  await root.getByRole('button',{name:'Search document',exact:true}).click();await expect(search).toBeVisible();
  await launcher(root).click();await expect(dialog).toBeVisible();await expect(search).toBeHidden();
  await root.getByRole('button',{name:'Search document',exact:true}).click();await expect(search).toBeVisible();await expect(dialog).toBeHidden();
  await expect(launcher(root)).toHaveAttribute('aria-expanded','false');
});

test('a bar that turns narrow hides the launcher, closes the window and moves focus to a visible bar control',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server,board(),'text-view-narrow');
  await launcher(root).click();const dialog=dialogOf(root);await expect(dialog).toBeVisible();expect(await focusInside(dialog)).toBe(true);
  await page.setViewportSize({width:600,height:900});
  await expect(dialog).toBeHidden();await expect(launcher(root)).toBeHidden();
  expect(await root.locator('.reader-top').evaluate(top=>{let a=top.getRootNode().activeElement;return !!a && top.contains(a) && a.getClientRects().length>0;})).toBe(true);
});

test('three tabs switch content, Queries reaches Steps only, the path chooser follows the reader and choices are remembered',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server);
  await root.locator('[data-dv-path="refused"]').first().click();
  await launcher(root).click();const dialog=dialogOf(root),text=textOf(dialog);
  const tabs=dialog.getByRole('tab');await expect(tabs).toHaveText(['Steps','Elements','Flat lines']);
  await expect(dialog.getByRole('tab',{name:'Steps'})).toHaveAttribute('aria-selected','true');
  const chooser=dialog.getByRole('combobox',{name:'Path',exact:true});await expect(chooser).toHaveValue('refused');
  await expect(text).toContainText('Path: Refused publish');
  await chooser.selectOption('happy');await expect(text).toContainText('Path: Connected');
  await expect(text).toContainText('metric errors (grafana) unit req/h');await expect(text).not.toContainText('sum(rate(http_server_requests_total');
  await expect(text).toContainText('node `platform::api` Orders API · imported (tv-platform core as platform)');
  const names=dialog.getByRole('button',{name:'Query names',exact:true}),full=dialog.getByRole('button',{name:'Full queries',exact:true});
  await expect(names).toHaveAttribute('aria-pressed','true');
  await full.click();await expect(full).toHaveAttribute('aria-pressed','true');await expect(text).toContainText('sum(rate(http_server_requests_total');
  await names.click();await expect(text).not.toContainText('sum(rate(http_server_requests_total');
  await dialog.getByRole('tab',{name:'Steps'}).focus();await page.keyboard.press('ArrowRight');
  const elements=dialog.getByRole('tab',{name:'Elements'});await expect(elements).toHaveAttribute('aria-selected','true');expect(await isFocused(elements)).toBe(true);
  await expect(text).toContainText('| Element | Kind | Metrics | Trace rules | Tickets | Code refs | Steps |');
  await expect(text).toContainText('| platform::api | node · imported |');
  await expect(text).toContainText('sum(rate(http_server_requests_total');
  await expect(names).toBeDisabled();await expect(full).toBeDisabled();await expect(chooser).toBeDisabled();
  await page.keyboard.press('End');const flat=dialog.getByRole('tab',{name:'Flat lines'});await expect(flat).toHaveAttribute('aria-selected','true');
  await expect(text).toContainText('edge delivery/device->ingest metric.rate.query grafana sum(rate(');
  await expect(text).toContainText('node delivery/platform::api origin imported');
  await page.keyboard.press('Home');await expect(dialog.getByRole('tab',{name:'Steps'})).toHaveAttribute('aria-selected','true');
  await elements.click();await dialog.getByRole('switch',{name:'Wrap lines',exact:true}).click();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await launcher(root).click();await expect(dialog.getByRole('tab',{name:'Elements'})).toHaveAttribute('aria-selected','true');
  await expect(dialog.getByRole('switch',{name:'Wrap lines',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(chooser).toHaveValue('happy');await dialog.getByRole('tab',{name:'Steps'}).click();await expect(text).toContainText('Path: Connected');
});

test('with wrap off a long query scrolls sideways inside the text block only; wrap on folds it',async({page,server})=>{
  await page.setViewportSize({width:1280,height:860});const root=await open(page,server,board(),'text-view-wrap');
  await launcher(root).click();const dialog=dialogOf(root),text=textOf(dialog);
  await dialog.getByRole('tab',{name:'Flat lines'}).click();
  const wrap=dialog.getByRole('switch',{name:'Wrap lines',exact:true});await expect(wrap).toHaveAttribute('aria-checked','false');
  await expect(text).toContainText('stats count() as n, latest(reason) as sampleReason by clientId | sort n desc | limit 20');
  const off=await text.evaluate(pre=>{
    const dialog=pre.closest('[role="dialog"]'),html=document.documentElement;
    const node=pre.firstChild,lines=node.data.split('\n');let at=0,end=0,longest=0;
    lines.forEach(line=>{if(line.length>longest){longest=line.length;end=at+line.length;}at+=line.length+1;});
    pre.scrollLeft=pre.scrollWidth;const range=document.createRange();range.setStart(node,end-1);range.setEnd(node,end);
    pre.scrollTop=Math.max(0,range.getBoundingClientRect().top-pre.getBoundingClientRect().top+pre.scrollTop-pre.clientHeight/2);
    const c=range.getBoundingClientRect(),p=pre.getBoundingClientRect(),hit=pre.getRootNode().elementFromPoint(c.left+c.width/2,c.top+c.height/2);
    return {scrolls:pre.scrollWidth>pre.clientWidth+20,dialog:dialog.scrollWidth<=dialog.clientWidth+1,page:html.scrollWidth<=html.clientWidth,
      endVisible:c.left>=p.left-1 && c.right<=p.right+1 && c.top>=p.top-1 && c.bottom<=p.bottom+1,hit:hit===pre,white:getComputedStyle(pre).whiteSpace};
  });
  expect(off).toEqual({scrolls:true,dialog:true,page:true,endVisible:true,hit:true,white:'pre'});
  await wrap.click();await expect(wrap).toHaveAttribute('aria-checked','true');
  const on=await text.evaluate(pre=>({fits:pre.scrollWidth<=pre.clientWidth+1,white:getComputedStyle(pre).whiteSpace,page:document.documentElement.scrollWidth<=document.documentElement.clientWidth}));
  expect(on).toEqual({fits:true,white:'pre-wrap',page:true});
});

test('Copy Markdown copies full queries even when Steps shows names, and a refused clipboard offers the text to copy by hand',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:server.origin});
  const root=await open(page,server,board(),'text-view-copy');await launcher(root).click();const dialog=dialogOf(root),text=textOf(dialog);
  await expect(dialog.getByRole('button',{name:'Query names',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(text).not.toContainText('sum(rate(http_server_requests_total');
  const copy=dialog.getByRole('button',{name:'Copy Markdown',exact:true});await copy.click();
  await expect(dialog.getByRole('status')).toContainText('copied');
  const clip=await page.evaluate(()=>navigator.clipboard.readText());
  expect(clip).toContain('# Doorbell delivery as text — steps');expect(clip).toContain('sum(rate(http_server_requests_total');
  expect(clip.split('\n').length).toBeGreaterThan(20);
  await dialog.getByRole('tab',{name:'Flat lines'}).click();await expect(dialog.getByRole('button',{name:'Copy Markdown',exact:true})).toHaveCount(0);
  const copyLines=dialog.getByRole('button',{name:'Copy lines',exact:true});await copyLines.click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(await text.evaluate(pre=>pre.textContent));

  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Denied');};document.execCommand=()=>false;});
  await dialog.getByRole('tab',{name:'Steps'}).click();await copy.click();
  const manual=dialog.getByRole('textbox',{name:'Copy this text manually',exact:true});await expect(manual).toBeVisible();
  const value=await manual.inputValue();expect(value).toContain('sum(rate(http_server_requests_total');expect(value.split('\n').length).toBeGreaterThan(20);
  await expect(dialog.getByRole('status')).toContainText('Copy failed');
  // No Clipboard API at all (not only a refused write) also reaches the box.
  await page.reload();await launcher(root).click();
  await page.evaluate(()=>{Object.defineProperty(Navigator.prototype,'clipboard',{get:()=>undefined,configurable:true});document.execCommand=()=>false;});
  expect(await page.evaluate(()=>navigator.clipboard)).toBeUndefined();
  await dialog.getByRole('button',{name:'Copy Markdown',exact:true}).click();await expect(manual).toBeVisible();
  expect(await manual.inputValue()).toContain('sum(rate(http_server_requests_total');await expect(dialog.getByRole('status')).toContainText('Copy failed');
});

test('the Text window works inside the Backstage native ShadowRoot host',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  await writeFile(path.join(server.root,'text-view-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'text-view-native.html'),'<style>body{margin:0}.host{width:1200px;height:800px;overflow:auto;position:relative}</style><div id="one" class="host"></div><script type="module">import {mountNativeViewer} from "./text-view-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/text-view-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(spec=>{window.one=mount(document.querySelector('#one'),spec);},board());
  const shadow=await page.evaluate(()=>{const r=document.querySelector('#one').shadowRoot;return {root:!!r,button:!!(r && r.querySelector('.reader-top .text-view-launch button')),light:!!document.querySelector('#one .text-view-launch')};});
  expect(shadow).toEqual({root:true,button:true,light:false});
  const host=page.locator('#one'),button=launcher(host);await expect(button).toBeVisible();expect(await shown(button)).toBe('ok');
  await button.click();const dialog=dialogOf(host);await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>!!document.querySelector('#one').shadowRoot.querySelector('[role="dialog"].text-view:not([hidden])'))).toBe(true);
  expect(await focusInside(dialog)).toBe(true);expect(await shown(textOf(dialog))).toBe('ok');
  await expect(textOf(dialog)).toContainText('node `platform::api` Orders API · imported');
  await dialog.getByRole('tab',{name:'Flat lines'}).click();await expect(textOf(dialog)).toContainText('node delivery/platform::api origin imported');
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(await isFocused(button)).toBe(true);
  await page.evaluate(()=>window.one.destroy());
});

test('desktop Workbench preview offers the Text window and reopens it with rebuilt text when the document rerenders',async({page,server})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
  const raw=board();await paste(page,JSON.stringify(raw));await closeTools(page);const root=page.locator('#docview'),before=await page.locator('#src').inputValue();
  await launcher(root).click();const dialog=dialogOf(root);await expect(dialog).toBeVisible();
  await expect(textOf(dialog)).toContainText('# Doorbell delivery as text — steps');expect(await shown(textOf(dialog))).toBe('ok');
  await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#editor-tab-json').click();raw.page.title='Doorbell delivery renamed';await page.locator('#src').fill(JSON.stringify(raw));await page.locator('#go').click();
  await expect(textOf(dialog)).toContainText('# Doorbell delivery renamed — steps');await expect(dialog).toBeVisible();
  await expect(launcher(root)).toHaveAttribute('aria-expanded','true');expect(await shown(textOf(dialog))).toBe('ok');
});

test('the Text window uses readable theme colours in all nine skins',async({page,server})=>{
  await page.setViewportSize({width:1280,height:900});
  for(const skin of ['aurora','daylight','editorial','terminal','pastel','blueprint','rose','lavender','lilac']){
    const root=await open(page,server,board(skin),'text-view-'+skin);await launcher(root).click();const dialog=dialogOf(root);await expect(dialog).toBeVisible();
    const styles=await textOf(dialog).evaluate(pre=>{const d=pre.closest('[role="dialog"]'),s=getComputedStyle(d),p=getComputedStyle(pre),r=d.getBoundingClientRect();return {color:s.color,background:s.backgroundColor,text:p.color,right:r.right,bottom:r.bottom};});
    expect(styles.color).not.toBe(styles.background);expect(styles.text).not.toBe(styles.background);expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.right).toBeLessThanOrEqual(1280);expect(styles.bottom).toBeLessThanOrEqual(900);
  }
});
