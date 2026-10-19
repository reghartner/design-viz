import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const home=page=>page.locator('#welcome-home');
const editor=page=>page.locator('#workbench-workspace');
const screen=(page,name)=>page.locator('#welcome-'+name+'-screen');

async function blockDraftArchive(page){
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==='dv-workbench-earlier-drafts')throw new DOMException('Archive full','QuotaExceededError');
      return original.call(this,key,value);
    };
  });
}

test('failed Build archive keeps source and Undo, shows recovery, and downloads exact draft',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('[data-dv-node="a"]').click();
  const title=page.locator('#guide').getByLabel('Name',{exact:true});
  await title.fill('Retained camera');await title.press('Enter');
  const edited=source.replace('"title": "Doorbell"','"title": "Retained camera"');
  await expect(page.locator('#src')).toHaveValue(edited);
  await expect(page.locator('#undo-builder')).toBeEnabled();
  await page.locator('#workspace-home').click();await page.locator('#welcome-new').click();
  await page.evaluate(()=>localStorage.setItem('dv-workbench-earlier-drafts',JSON.stringify([{text:'{"title":"older"}',at:1}])));
  const earlier=await page.evaluate(()=>localStorage.getItem('dv-workbench-earlier-drafts'));
  await blockDraftArchive(page);
  await page.locator('#welcome-new-agent').click();
  await expect(screen(page,'new')).toBeVisible();await expect(editor(page)).toBeHidden();
  await expect(page.locator('#workbench-draft-recovery [role="alert"]')).toContainText('earlier draft could not be saved');
  await expect(page.locator('#workbench-draft-recovery-download')).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(edited);
  await expect(page.locator('#undo-builder')).toBeEnabled();
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-earlier-drafts'))).toBe(earlier);
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();
  await expect(page.locator('#welcome-template-error')).toBeHidden();
  await expect(page.locator('#workbench-draft-recovery [role="alert"]')).toContainText('earlier draft could not be saved');
  await testInfo.attach('failed-archive-visible-alert',{body:await page.screenshot(),contentType:'image/png'});
  const downloadPromise=page.waitForEvent('download');await page.locator('#workbench-draft-recovery-download').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('flowview-draft-recovery.spec.json');
  expect(await readFile(await download.path(),'utf8')).toBe(edited);
  await page.locator('#welcome-header-resume').click();await expect(editor(page)).toBeVisible();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('failed Resume archive keeps recovered draft on Welcome with a direct download',async({page,server})=>{
  await page.addInitScript(text=>localStorage.setItem('dv-workbench-draft',JSON.stringify({text,at:1})),source);
  await page.goto(server.origin+'/workbench.html');await expect(page.locator('#welcome-resume')).toBeVisible();
  await blockDraftArchive(page);
  await page.locator('#welcome-resume').click();
  await expect(home(page)).toBeVisible();await expect(editor(page)).toBeHidden();
  await expect(page.locator('#workbench-draft-recovery [role="alert"]')).toContainText('earlier draft could not be saved');
  const downloadPromise=page.waitForEvent('download');await page.locator('#workbench-draft-recovery-download').click();
  const download=await downloadPromise;
  expect(await readFile(await download.path(),'utf8')).toBe(source);
});

test('the Flowview brand is a real workbench navigation target and still returns home in-app',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');const homeLink=page.locator('#workbench-home');
 await expect(homeLink).toHaveAttribute('href','/workbench.html');
 const modified=await homeLink.evaluate(link=>{
   let observed=false,defaultPrevented;
   const observe=event=>{observed=true;defaultPrevented=event.defaultPrevented;event.preventDefault();};
   window.addEventListener('click',observe);
   try{link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true}));}
   finally{window.removeEventListener('click',observe);}
   return {isAnchor:link.tagName==='A',href:new URL(link.href).pathname,observed,defaultPrevented};
 });
 expect(modified).toEqual({isAnchor:true,href:'/workbench.html',observed:true,defaultPrevented:false});
 await expect(home(page)).toBeVisible();
 await paste(page,source);await expect(editor(page)).toBeVisible();await homeLink.click();
 await expect(home(page)).toBeVisible();expect(new URL(page.url()).pathname).toBe('/workbench.html');
});

test('browser navigation follows entry screens, retains unfinished input and can leave the app',async({page,server})=>{
  await page.route('**/previous.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Previous page</h1>'}));
  await page.addInitScript(()=>history.replaceState({...history.state,hostMarker:'preserved'},'',location.href));
  await page.goto(server.origin+'/previous.html');
  await page.goto(server.origin+'/workbench.html?layout=backstage#host-fragment');
  await expect(home(page)).toBeVisible();
  await page.locator('#welcome-new').click();await expect(screen(page,'new')).toBeVisible();
  await page.locator('#welcome-new-prompt').click();await expect(screen(page,'agent')).toBeVisible();
  await page.locator('#welcome-brief').fill('Private draft: compare the recording paths');
  await page.locator('#welcome-agent-paste').click();
  await page.locator('#welcome-json').fill('{"unfinished":');
  const length=await page.evaluate(()=>history.length);
  await page.locator('#welcome-paste-form button[type=submit]').click();
  await expect(page.locator('#welcome-paste-error')).toBeVisible();
  expect(await page.evaluate(()=>history.length)).toBe(length);
  await page.goBack();await expect(screen(page,'agent')).toBeVisible();
  await expect(page.locator('#welcome-brief')).toHaveValue('Private draft: compare the recording paths');
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goForward();await expect(screen(page,'new')).toBeVisible();
  await page.goForward();await expect(screen(page,'agent')).toBeVisible();
  await page.goForward();await expect(screen(page,'paste')).toBeVisible();
  await expect(page.locator('#welcome-json')).toHaveValue('{"unfinished":');
  const state=await page.evaluate(()=>({length:history.length,state:history.state,url:location.href}));
  expect(state.length).toBe(length);expect(state.state.hostMarker).toBe('preserved');
  expect(new URL(state.url).searchParams.get('layout')).toBe('backstage');
  expect(new URL(state.url).hash).toBe('#host-fragment');
  expect(JSON.stringify(state.state)+state.url).not.toContain('Private draft');
  expect(JSON.stringify(state.state)+state.url).not.toContain('unfinished');
  await page.goBack();await expect(screen(page,'agent')).toBeVisible();
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goBack();await expect(page.getByRole('heading',{name:'Previous page'})).toBeVisible();
});

test('Back and Forward preserve edited source and Undo; editor reload restores an unfinished draft',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.locator('[data-dv-node="a"]').click();
  const title=page.locator('#guide').getByLabel('Name',{exact:true});
  await title.fill('Retained camera');await title.press('Enter');
  const edited=source.replace('"title": "Doorbell"','"title": "Retained camera"');
  const src=page.locator('#src');await expect(src).toHaveValue(edited);
  await page.locator('#editor-tab-json').click();const unfinished=edited+'\n  {';
  await src.fill(unfinished);
  await page.goBack();await expect(screen(page,'paste')).toBeVisible();
  await expect(page.locator('#welcome-json')).toHaveValue(source);await expect(src).toHaveValue(unfinished);
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goForward();await expect(screen(page,'paste')).toBeVisible();
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(unfinished);
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(source);
  await page.locator('#redo-builder').click();await expect(src).toHaveValue(unfinished);
  await page.locator('#workspace-home').click();await expect(home(page)).toBeVisible();
  await page.goBack();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(unfinished);
  await page.waitForFunction(text=>JSON.parse(localStorage.getItem('dv-workbench-draft'))?.text===text,unfinished);
  await page.reload();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(unfinished);
});

test('template navigation returns to the picker and Forward retains the same project',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();
  await expect(editor(page)).toBeVisible();
  await page.locator('#editor-tab-json').click();
  const src=page.locator('#src'),initial=await src.inputValue();
  const changed=initial.replace('Untitled project','My retained project');await src.fill(changed);
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(changed);
  await page.waitForFunction(text=>JSON.parse(localStorage.getItem('dv-workbench-draft'))?.text===text,changed);
  await page.locator('#workspace-home').click();await page.locator('#welcome-agent-prompt').click();
  await page.reload();await expect(screen(page,'agent')).toBeVisible();
  await page.locator('[data-welcome-back]:visible').click();await expect(home(page)).toBeVisible();
  await page.locator('#welcome-resume').click();await expect(editor(page)).toBeVisible();await expect(src).toHaveValue(changed);
});

// #545 — Start new project text filter. Fixture: the 13 core built-in templates + Blank,
// plus one routed team template (starters.json) in the company grid and any
// explicitly enabled package templates.
// row | fixture | assertion (scoped) | rejects
// 1 precondition | empty query, All examples | core cards, Blank and the team card; #welcome-template-empty hidden | a filter that starts narrowed or omits a starter
// 2 Tab + focus | picker after entry | Tab presses (no clicks) focus the "Search templates" searchbox; :focus-visible with a ≥2px non-none outline | a mouse-only field or a suppressed focus ring
// 3 name, case-insensitive | "PERSPECTIVES" | visible titles exactly [One story, two perspectives] | case-sensitive or name-blind matching
// 4 description | "deadlines" (only in Retries & recovery's desc) | exactly [Retries & recovery] | name-only matching
// 5 tag | "observed EXECUTION" (only in A trace, explained's tag) | exactly [A trace, explained] | ignoring the eyebrow tag
// 6 service name | "traffic router" (a node title only in Rollout decisions' spec) | exactly [Rollout decisions] | matching only card text
// 7 team templates | "payroll" (name), "FINANCE" (desc), "tax ledger" (node title) | each exactly [Payroll handoff] from #welcome-company-grid | filtering only the built-in grid, or team templates by name only
// 8 composes with tabs | "traffic router" + Connected devices | zero cards and the empty state; All examples restores [Rollout decisions] | a query that overrides or resets the category
// 9 Science | only when the package is enabled, each starter can be found through the Science filter | unconditional science UI or missing package examples
// 10 no matches | "zzqx" | zero visible cards (Blank included) and #welcome-template-empty visible naming the query | a blank grid, or Blank kept as a false match
// 11 clear | empty query + All examples | all original cards back; empty state hidden | a filter that cannot be undone
const visibleTemplateTitles=page=>page.locator('#welcome-new-screen .welcome-template-card').evaluateAll(cards=>cards.filter(card=>card.checkVisibility()).map(card=>card.querySelector('.welcome-template-title').firstChild.textContent));
test('Start new project filters built-in and team templates by name, description, tag and service name',async({page,server})=>{
  await page.route('**/starters.json',route=>route.fulfill({json:[{name:'Payroll handoff',desc:'Pay runs between finance systems.',spec:{page:{title:'Payroll',sections:[{diagram:{nodes:{a:{title:'Tax Ledger'}},rows:[['a']],edges:[]}}]}}}]}));
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-new').click();
  await expect(page.locator('#welcome-company-grid .welcome-template-card')).toHaveCount(1);
  const all=await visibleTemplateTitles(page),empty=page.locator('#welcome-template-empty');
  const enabledPackages=new Set((process.env.FLOWVIEW_PACKAGES||'').split(','));
  const scienceEnabled=enabledPackages.has('science'),physicsEnabled=enabledPackages.has('physics');
  const scienceTitles=['From viral RNA copying to sequencing evidence','The insertion signature of NSP15'];
  const physicsTitles=['Waves & forces'];
  expect(all).toHaveLength(15+(scienceEnabled?scienceTitles.length:0)+(physicsEnabled?physicsTitles.length:0));
  expect(all).toEqual(expect.arrayContaining(['Blank diagram','Payroll handoff','Rollout decisions']));
  expect(all).not.toContain('Sequencing walkthrough');
  if(scienceEnabled)expect(all).toEqual(expect.arrayContaining(scienceTitles));
  else for(const title of scienceTitles)expect(all).not.toContain(title);
  if(physicsEnabled)expect(all).toEqual(expect.arrayContaining(physicsTitles));
  else for(const title of physicsTitles)expect(all).not.toContain(title);
  await expect(empty).toBeHidden();
  const search=page.getByRole('searchbox',{name:'Search templates'});
  for(let presses=0;presses<12 && !await page.evaluate(()=>document.activeElement?.type==='search');presses++)await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  const ring=await search.evaluate(input=>{const style=getComputedStyle(input);return {visible:input.matches(':focus-visible'),style:style.outlineStyle,width:parseFloat(style.outlineWidth)};});
  expect(ring.visible).toBe(true);expect(ring.style).not.toBe('none');expect(ring.width).toBeGreaterThanOrEqual(2);
  const query=async text=>{await search.fill('');await search.pressSequentially(text);};
  await query('PERSPECTIVES');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['One story, two perspectives']);await expect(empty).toBeHidden();
  await query('deadlines');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Retries & recovery']);
  await query('observed EXECUTION');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['A trace, explained']);
  await query('traffic router');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Rollout decisions']);
  await page.locator('#welcome-template-filters').getByRole('button',{name:'Connected devices'}).click();
  await expect.poll(()=>visibleTemplateTitles(page)).toEqual([]);await expect(empty).toBeVisible();await expect(search).toHaveValue('traffic router');
  await page.locator('#welcome-template-filters').getByRole('button',{name:'All examples'}).click();
  await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Rollout decisions']);await expect(empty).toBeHidden();
  await query('payroll');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Payroll handoff']);
  await expect(page.locator('#welcome-company-grid .welcome-template-card').filter({visible:true})).toHaveCount(1);
  await query('FINANCE');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Payroll handoff']);
  await query('tax ledger');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Payroll handoff']);
  await search.fill('');
  const science=page.locator('#welcome-template-filters').getByRole('button',{name:'Science',exact:true});
  if(scienceEnabled){
    await science.click();await expect(science).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Blank diagram',...scienceTitles,'Payroll handoff']);
    await expect(empty).toBeHidden();
    await query('RNA-seq');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['From viral RNA copying to sequencing evidence']);
    await query('NSP15');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['The insertion signature of NSP15']);
  }else await expect(science).toHaveCount(0);
  const physics=page.locator('#welcome-template-filters').getByRole('button',{name:'Physics',exact:true});
  if(physicsEnabled){
    await search.fill('');
    await physics.click();await expect(physics).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Blank diagram','Waves & forces','Payroll handoff']);
    await query('Waves & forces');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Waves & forces']);
    await page.locator('#welcome-template-filters').getByRole('button',{name:'All examples'}).click();
    await expect(search).toHaveValue('Waves & forces');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(['Waves & forces']);
  }else await expect(physics).toHaveCount(0);
  await query('zzqx');await expect.poll(()=>visibleTemplateTitles(page)).toEqual([]);
  await expect(empty).toBeVisible();await expect(empty).toContainText('No templates match');await expect(empty).toContainText('zzqx');
  await search.fill('');await expect.poll(()=>visibleTemplateTitles(page)).toEqual(all);await expect(empty).toBeHidden();
});

test('browser Back retires pending welcome and editor file reads',async({page,server})=>{
  await page.addInitScript(()=>{
    const Native=FileReader;
    window.FileReader=class extends Native{
      get result(){return this.heldText===undefined?super.result:this.heldText;}
      readAsText(file,...args){if(file.name!=='pending.json')return super.readAsText(file,...args);window.__heldRead=this;this.pendingText=file.text();}
    };
    window.__releaseRead=async()=>{const reader=window.__heldRead;reader.heldText=await reader.pendingText;reader.onload?.(new ProgressEvent('load'));};
  });
  const file={name:'pending.json',mimeType:'application/json',buffer:Buffer.from(source.replace('Browser contract','STALE FILE'))};
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-paste').click();
  await page.locator('#welcome-file').setInputFiles(file);await page.waitForFunction(()=>!!window.__heldRead);
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.evaluate(()=>__releaseRead());await expect(home(page)).toBeVisible();
  await paste(page,source);await page.evaluate(()=>{window.__heldRead=null;});
  await page.locator('#file-input').setInputFiles(file);await page.waitForFunction(()=>!!window.__heldRead);
  await page.goBack();await expect(screen(page,'paste')).toBeVisible();
  await page.evaluate(()=>__releaseRead());await expect(screen(page,'paste')).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(source);
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(source);
});

test('canonical entry has no duplicate stop and older entries cannot resurrect detached review URLs',async({page,server})=>{
  let loads=0;
  await page.route('**/api/canon/context?*',route=>{
    loads++;return route.fulfill({json:{catalog:{version:1,services:[]},spec:JSON.parse(source),revision:'canonical-revision',simulated:true}});
  });
  await page.route('**/previous.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Previous page</h1>'}));
  await page.goto(server.origin+'/previous.html');const previousLength=await page.evaluate(()=>history.length);
  await page.goto(server.origin+'/workbench.html?canon=doorbell&review=123&layout=backstage#host-fragment');
  await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(JSON.stringify(JSON.parse(source),null,2));
  expect(await page.evaluate(()=>history.length)).toBe(previousLength+1);
  await page.locator('#workspace-home').click();const replacement=source.replace('Browser contract','Local replacement');
  await paste(page,replacement);
  for(const target of [screen(page,'paste'),home(page),editor(page)]){
    await page.goBack();await expect(target).toBeVisible();await expect(page.locator('#src')).toHaveValue(replacement);
    const url=new URL(page.url());expect(url.searchParams.has('canon')).toBe(false);expect(url.searchParams.has('review')).toBe(false);
    expect(url.searchParams.get('layout')).toBe('backstage');expect(url.hash).toBe('#host-fragment');
  }
  await page.reload();await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(replacement);
  expect(loads).toBe(1);
});

test('a late canonical response does not reopen the editor after navigating away',async({page,server})=>{
  let pending;
  await page.route('**/api/canon/context?*',route=>{pending=route;});
  await page.goto(server.origin+'/workbench.html?canon=doorbell');
  await expect(editor(page)).toBeVisible();await expect.poll(()=>!!pending).toBe(true);
  await page.locator('#workspace-home').click();await page.locator('#welcome-paste').click();
  await page.locator('#welcome-json').fill('{"unfinished":');
  const length=await page.evaluate(()=>history.length);
  await pending.fulfill({json:{catalog:{version:1,services:[]},spec:JSON.parse(source),revision:'canonical-revision',simulated:true}});
  await expect(page.locator('.canon-tools [role="status"]').first()).toHaveText('SIMULATED · doorbell · changes are submitted for review.');
  await expect(screen(page,'paste')).toBeVisible();await expect(page.locator('#welcome-json')).toHaveValue('{"unfinished":');
  expect(await page.evaluate(()=>history.length)).toBe(length);
});

test('downloaded workbench files support Back and Forward without a server',async({page,server})=>{
  await page.goto(pathToFileURL(server.root+'/workbench.html').href);
  await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();
  await expect(editor(page)).toBeVisible();const original=await page.locator('#src').inputValue();
  await page.goBack();await expect(screen(page,'new')).toBeVisible();
  await page.goBack();await expect(home(page)).toBeVisible();
  await page.goForward();await expect(screen(page,'new')).toBeVisible();
  await page.goForward();await expect(editor(page)).toBeVisible();await expect(page.locator('#src')).toHaveValue(original);
});

// #544 — the Welcome page's way back in sits inside the first desktop viewport.
// row | fixture                         | assertion (scoped)                                              | rejects
// 1   | 1280×800, no draft               | #welcome-open rect inside 0..innerWidth × 0..innerHeight at scrollY 0 | action cards left below the hero (top≈1020 on main)
// 2   | 1280×800, no draft               | #welcome-library rect inside the viewport                        | Canon entry left under the action grid
// 3   | 1440×900, no draft               | rows 1–2 at this size                                           | a fix tuned for one viewport only
// 4   | 1280×800 + saved draft           | #welcome-resume visible, rect inside the viewport, its title names the draft, its cue says Continue | resume card pushed under the fold, or a generic unnamed card
// 5   | 1280×800 + saved draft           | #welcome-open and #welcome-library still inside the viewport     | the resume card displacing Open/Browse below the fold
// 6   | 1440×900 + saved draft           | rows 4–5 at this size                                           | a fix tuned for one viewport only
// 7   | 1920×1080, with and without draft | rows 1–5 at this size                                           | a large-screen regression
// 8   | every row                        | precondition: no draft → #welcome-resume hidden; draft → visible | a vacuous pass from the wrong state
const draftTitle=JSON.parse(source).page.title;
for(const [width,height] of [[1280,800],[1440,900],[1920,1080]])for(const draft of [false,true]){
  test(`Welcome keeps Open file, Canon diagrams${draft?' and the draft Continue card':''} above the fold at ${width}×${height}`,async({page,server})=>{
    await page.setViewportSize({width,height});
    if(draft)await page.addInitScript(text=>localStorage.setItem('dv-workbench-draft',JSON.stringify({text,at:1})),source);
    await page.goto(server.origin+'/workbench.html');
    await expect(home(page)).toBeVisible();
    // The example preview sizes itself after it renders; measure the settled layout.
    await expect(page.locator('#welcome-example-stage')).toBeAttached();
    await expect.poll(()=>page.locator('#welcome-example-view').evaluate(view=>view.style.height)).not.toBe('');
    const resume=page.locator('#welcome-resume');
    if(draft){
      await expect(resume).toBeVisible();
      await expect(page.locator('#welcome-resume-title')).toContainText(draftTitle);
      await expect(resume.locator(':scope>span:last-child')).toHaveText(/Continue/);
    }else await expect(resume).toBeHidden();
    const ids=['welcome-open','welcome-library',...(draft?['welcome-resume']:[])];
    const placement=await page.evaluate(ids=>({scrollY:window.scrollY,width:window.innerWidth,height:window.innerHeight,
      rects:Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)}];}))}),ids);
    expect(placement.scrollY).toBe(0);
    for(const id of ids){
      const r=placement.rects[id];
      expect.soft(r.top,`${id} top`).toBeGreaterThanOrEqual(0);
      expect.soft(r.left,`${id} left`).toBeGreaterThanOrEqual(0);
      expect.soft(r.right,`${id} right`).toBeLessThanOrEqual(placement.width);
      expect.soft(r.bottom,`${id} bottom inside the ${width}×${height} viewport`).toBeLessThanOrEqual(placement.height);
    }
  });
}

// #547 — Welcome and the template picker link the examples gallery only when the
// build's site config names it ("examples" in site.json). No runtime request decides it.
// row | fixture                                                        | assertion (scoped)                                                         | rejects
// 1   | site/workbench/flowspec.html built with --config {examples:"../examples/index.html"}, gallery beside it | #welcome-home #welcome-gallery visible; its href resolves to site/examples/index.html | no Welcome link, or one pointing elsewhere
// 2   | same, real click on #welcome-new                                 | #welcome-new-screen #welcome-new-gallery visible with the same resolved href | a link on only one surface
// 3   | same, real click on #welcome-gallery                             | the opened tab has doctype html, characterSet UTF-8, .sub reads "N pages · every diagram", the Auralis card .t reads "Auralis Presence — mmWave …", no "â€"/"Â·" in its text | the generated page without doctype/charset (mojibake)
// 4   | row 1–2 loads                                                    | the workbench itself requests nothing under examples/ before the click  | a runtime probe kept alongside the config
// 5   | unconfigured build (--no-config) at site/workbench/flowspec.html with the gallery present beside it | zero requests under examples/ through Welcome and the picker; #welcome-gallery and #welcome-new-gallery hidden | a link shown, or a probe sent, without config
async function gallerySite(server,html){
  const root=await mkdtemp(path.join(server.root,'gallery-site-')),workbench=path.join(root,'workbench');
  await mkdir(workbench);await writeFile(path.join(workbench,'flowspec.html'),html);
  for(const name of ['catalog.json','starters.json'])await cp(path.join(server.root,name),path.join(workbench,name));
  await mkdir(path.join(root,'examples'));await cp(path.join(repo,'examples/index.html'),path.join(root,'examples/index.html'));
  const base=server.origin+'/'+path.basename(root);
  return {url:base+'/workbench/flowspec.html',gallery:base+'/examples/index.html',cleanup:()=>rm(root,{recursive:true,force:true})};
}
// Build with a site config naming the gallery; restore the shared build output after.
async function configuredWorkbench(){
  const dir=await mkdtemp(path.join(tmpdir(),'flowview-gallery-config-')),target=path.join(repo,'workbench/flowspec.html'),original=await readFile(target);
  try{
    await writeFile(path.join(dir,'site.json'),JSON.stringify({version:1,landing:{spec:path.join(repo,'src/starters/onboarding.json')},examples:'../examples/index.html'}));
    execFileSync('python3',[path.join(repo,'tools/build.py'),'--config',path.join(dir,'site.json')],{cwd:dir,stdio:'pipe'});
    return await readFile(target,'utf8');
  }finally{await writeFile(target,original);await rm(dir,{recursive:true,force:true});}
}
function examplesRequests(page){
  const seen=[];page.on('request',request=>{if(new URL(request.url()).pathname.includes('/examples/'))seen.push(request.method()+' '+request.url());});
  return seen;
}

test('a configured examples gallery is linked from Welcome and the template picker and renders UTF-8 text',async({page,server})=>{
  const site=await gallerySite(server,await configuredWorkbench());
  try{
    const requests=examplesRequests(page);
    await page.goto(site.url);await expect(home(page)).toBeVisible();
    const homeLink=home(page).locator('#welcome-gallery');
    await expect(homeLink).toBeVisible();
    expect(await homeLink.evaluate(link=>link.href)).toBe(site.gallery);
    await page.locator('#welcome-new').click();await expect(screen(page,'new')).toBeVisible();
    const pickerLink=screen(page,'new').locator('#welcome-new-gallery');
    await expect(pickerLink).toBeVisible();
    expect(await pickerLink.evaluate(link=>link.href)).toBe(site.gallery);
    await page.waitForLoadState('networkidle');expect(requests).toEqual([]);
    await page.locator('#welcome-new-screen [data-welcome-back]').click();await expect(homeLink).toBeVisible();
    const opened=page.waitForEvent('popup');await homeLink.click();
    const tab=await opened;await tab.waitForLoadState();
    expect(tab.url()).toBe(site.gallery);
    expect(await tab.evaluate(()=>({doctype:document.doctype&&document.doctype.name,charset:document.characterSet}))).toEqual({doctype:'html',charset:'UTF-8'});
    await expect(tab.locator('.sub')).toHaveText(/^\d+ pages · every diagram /);
    await expect(tab.locator('a.card .t').filter({hasText:'Auralis Presence'})).toHaveText('Auralis Presence — mmWave room sensing, fall safety, offline autonomy');
    const text=await tab.locator('body').innerText();
    expect(text).not.toContain('â€');expect(text).not.toContain('Â·');
    await tab.close();
  }finally{await site.cleanup();}
});

test('without site config the examples gallery links stay hidden and nothing is requested',async({page,server})=>{
  const site=await gallerySite(server,await readFile(path.join(server.root,'workbench.html'),'utf8'));
  try{
    const requests=examplesRequests(page);
    await page.goto(site.url);
    await expect(home(page)).toBeVisible();await expect(page.locator('#welcome-library')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(home(page).locator('#welcome-gallery')).toBeHidden();
    await page.locator('#welcome-new').click();await expect(screen(page,'new')).toBeVisible();
    await expect(page.locator('#welcome-templates .welcome-template-card').first()).toBeVisible();
    await expect(screen(page,'new').locator('#welcome-new-gallery')).toBeHidden();
    await page.waitForLoadState('networkidle');
    expect(requests).toEqual([]);
  }finally{await site.cleanup();}
});
