import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools,pagePreview} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(twoSections=false){
  const raw=editorSpec(),section=raw.page.blocks[0],d=section.diagram;section.id='delivery';
  const resident={...d.layouts[0],id:'resident',name:'Resident story',presentation:'standard'};delete resident.steps;
  const engineering={...structuredClone(resident),id:'engineering',name:'Engineering',presentation:'explore'};
  d.layouts=[resident,engineering];d.defaultLayout='resident';
  if(twoSections){const other=structuredClone(section);other.id='billing';other.heading='Billing';other.diagram.nodes.a.title='Billing service';raw.page.blocks.push(other);}
  return raw;
}
const section=(page,index=0)=>page.locator('#docview .doc-sec[data-dv-section="'+index+'"]');
const settings=(page,index=0)=>section(page,index).locator('.section-view-settings');
const presentation=(page,index=0)=>settings(page,index).getByRole('combobox',{name:'View type',exact:true});
const text=page=>page.locator('#src').inputValue();
async function open(page,server,raw=fixture()){
  const source=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,source);await closeTools(page);
  await expect(page.locator('#workspace-view')).toHaveCount(0);await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);await expect(settings(page)).toBeVisible();return source;
}
async function options(page,index=0){
  const details=settings(page,index).locator('details');
  if(await details.getAttribute('open')===null)await details.getByText('View options',{exact:true}).click();
  return details;
}
async function writeSource(page,value){await page.locator('#src').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function reachable(control){
  await expect(control).toBeVisible();
  expect(await control.evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return r.width>0 && r.height>0 && r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1 && (hit===el || el.contains(hit));
  })).toBe(true);
}

test('canvas view settings edit only the selected sibling and save one undoable opening choice',async({page,server,context})=>{
  const raw=fixture(true),original=await open(page,server,raw);
  await expect(page.locator('.workbench-diagram-canvas')).toHaveCount(0);await expect(presentation(page)).toHaveValue('standard');await expect(settings(page).getByRole('button',{name:'Default view',exact:true})).toBeDisabled();
  await section(page).getByRole('button',{name:'Engineering',exact:true}).click();
  await expect(section(page)).toHaveAttribute('data-view-id','engineering');await expect(presentation(page)).toHaveValue('explore');await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
  await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await presentation(page).selectOption('standard');await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);
  const expected=structuredClone(raw);expected.page.blocks[0].diagram.layouts[1].presentation='standard';
  expect(JSON.parse(await text(page))).toEqual(expected);const changed=await text(page);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await expect(presentation(page)).toHaveValue('explore');await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
  await page.locator('#undo-builder').click();await settings(page).getByRole('button',{name:'Make default',exact:true}).click();
  const withDefault=structuredClone(raw);withDefault.page.blocks[0].diagram.defaultLayout='engineering';
  expect(JSON.parse(await text(page))).toEqual(withDefault);const saved=await text(page);
  await expect(settings(page).getByRole('button',{name:'Default view',exact:true})).toBeDisabled();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(saved);
  await section(page).getByRole('button',{name:'Resident story',exact:true}).click();
  await expect(presentation(page)).toHaveValue('standard');await expect(page.locator('#src')).toHaveValue(saved);
  await expect(settings(page).getByRole('button',{name:'Make default',exact:true})).toBeEnabled();
  await page.locator('#diagram-add-target').selectOption('1');await expect(settings(page,1)).toBeVisible();
  await expect(presentation(page,1)).toHaveValue('standard');await expect(settings(page,1).getByRole('button',{name:'Default view',exact:true})).toBeDisabled();
  await expect(page.locator('#src')).toHaveValue(saved);

  // Inject the accepted editor bytes into the real standalone template. This
  // generates only a test artifact, with no selected-view URL fragment.
  const input=path.join(server.root,'canvas-view-default.json'),output=path.join(server.root,'canvas-view-default.html');await writeFile(input,saved);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  const reader=await context.newPage();await reader.goto(server.origin+'/canvas-view-default.html');
  await expect(reader.locator('#section-delivery')).toHaveAttribute('data-view-id','engineering');
  await expect(reader.locator('#section-delivery .explore-board')).toBeVisible();await expect(reader.locator('body')).toHaveClass(/viewer-exploring/);
  await expect(reader.locator('.section-view-settings')).toHaveCount(0);
  await reader.locator('#section-delivery').getByRole('button',{name:'Resident story',exact:true}).click();
  await expect(reader.locator('#section-delivery .explore-stage')).toBeHidden();await expect(reader.locator('body')).not.toHaveClass(/viewer-exploring/);
  await expect(page.locator('#src')).toHaveValue(saved);await reader.close();
  await pagePreview(page);await expect(settings(page,1)).toBeVisible();
  await expect(section(page).getByRole('button',{name:'Arrange section',exact:true})).toBeVisible();await expect(page.locator('#src')).toHaveValue(saved);
});

test('View options duplicates and renames a sibling without changing its source view',async({page,server})=>{
  const raw=fixture(),original=await open(page,server,raw);await options(page);
  await settings(page).getByRole('button',{name:'Duplicate view',exact:true}).click();
  const duplicated=await text(page),d=JSON.parse(duplicated).page.blocks[0].diagram,copy=d.layouts.at(-1);
  expect(d.layouts).toHaveLength(3);expect(d.layouts.slice(0,2)).toEqual(raw.page.blocks[0].diagram.layouts);expect(d.defaultLayout).toBe('resident');
  expect(copy.sectionLayout).toEqual(d.layouts[0].sectionLayout);expect(copy.presentation).toBe('standard');
  await expect(section(page)).toHaveAttribute('data-view-id',copy.id);await expect(presentation(page)).toHaveValue('standard');
  await presentation(page).selectOption('explore');const explored=await text(page);
  expect(JSON.parse(explored).page.blocks[0].diagram.layouts.slice(0,2)).toEqual(raw.page.blocks[0].diagram.layouts);
  await options(page);const name=settings(page).getByRole('textbox',{name:'View name',exact:true});await name.fill('Workshop');
  await settings(page).getByRole('button',{name:'Rename view',exact:true}).click();
  await expect(section(page).getByRole('button',{name:'Workshop',exact:true})).toBeVisible();
  const renamed=JSON.parse(await text(page));expect(renamed.page.blocks[0].diagram.layouts.at(-1)).toEqual({...copy,presentation:'explore',name:'Workshop'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(explored);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(duplicated);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('arranged views filter whole paths before their step subset without copying story content',async({page,server})=>{
  const raw=fixture(),original=await open(page,server,raw),sec=section(page);
  await sec.getByRole('button',{name:'Arrange section',exact:true}).click();
  const pathSummary=page.getByText('Paths shown in this view · All 2',{exact:true});
  const stepSummary=page.getByText('Steps shown in this view · All 3',{exact:true});
  await expect(pathSummary).toBeVisible();await expect(stepSummary).toBeVisible();
  expect(await pathSummary.evaluate((paths,steps)=>Boolean(paths.compareDocumentPosition(steps)&Node.DOCUMENT_POSITION_FOLLOWING),await stepSummary.elementHandle())).toBe(true);
  await pathSummary.click();
  await page.getByRole('checkbox',{name:'Show path Failure in Resident story',exact:true}).uncheck();
  const saved=JSON.parse(await text(page)),diagram=saved.page.blocks[0].diagram;
  expect(diagram.layouts[0].paths).toEqual(['happy']);expect(diagram.paths).toEqual(raw.page.blocks[0].diagram.paths);expect(diagram.steps).toEqual(raw.page.blocks[0].diagram.steps);
  await expect(page.getByText('Paths shown in this view · 1 selected',{exact:true})).toBeVisible();
  await expect(sec.locator('[data-dv-path="failed"], [data-path-row="failed"]')).toHaveCount(0);
  await expect(sec.locator('.printsteps > li')).toHaveCount(2);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('a pending view-name draft does not consume a physical Duplicate view click',async({page,server})=>{
  const raw=fixture(),original=await open(page,server,raw);await options(page);
  await settings(page).getByRole('textbox',{name:'View name',exact:true}).fill('Uncommitted name');
  const duplicate=settings(page).getByRole('button',{name:'Duplicate view',exact:true});await duplicate.hover();const r=await duplicate.boundingBox();
  // One physical click: do not retry a locator after blur or pre-commit with Tab.
  await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
  const d=JSON.parse(await text(page)).page.blocks[0].diagram;
  expect(d.layouts).toHaveLength(3);expect(d.layouts.slice(0,2)).toEqual(raw.page.blocks[0].diagram.layouts);
  expect(d.layouts.at(-1).name).not.toContain('Uncommitted');await expect(section(page)).toHaveAttribute('data-view-id',d.layouts.at(-1).id);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

for(const legacy of [false,true])test('direct canvas Explore selection promotes '+(legacy?'a legacy saved arrangement':'an automatic view')+' in one Undo',async({page,server})=>{
  const raw=fixture(),d=raw.page.blocks[0].diagram,arrangement=structuredClone(d.layouts[0].sectionLayout);
  delete d.layouts;delete d.defaultLayout;if(legacy){d.sectionLayout=arrangement;d.layoutName='Saved home';}
  const original=await open(page,server,raw);await expect(presentation(page)).toHaveValue('standard');
  await expect(settings(page).getByRole('button',{name:'Default view',exact:true})).toBeDisabled();
  await presentation(page).selectOption('explore');const promoted=await text(page),next=JSON.parse(promoted).page.blocks[0].diagram;
  expect(next.layouts).toHaveLength(2);const selected=legacy?'layout':'flow';expect(next.layouts.find(v=>v.id===selected).presentation).toBe('explore');expect(next.layouts.find(v=>v.id!==selected).presentation || 'standard').toBe('standard');expect(next.defaultLayout).toBe(selected);
  if(legacy)expect(next.layouts[0].sectionLayout).toEqual(arrangement);
  const retained=structuredClone(next);delete retained.layouts;delete retained.defaultLayout;const expected=structuredClone(d);delete expected.sectionLayout;delete expected.layoutName;
  expect(retained).toEqual(expected);await expect(presentation(page)).toHaveValue('explore');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(promoted);await expect(presentation(page)).toHaveValue('explore');
});

test('invalid or unrendered JSON and detached view controls cannot rewrite an unrelated story',async({page,server})=>{
  const original=await open(page,server);await section(page).getByRole('button',{name:'Engineering',exact:true}).click();await options(page);
  const held=await settings(page).evaluateHandle(el=>({presentation:el.querySelector('[aria-label="View type"]'),name:el.querySelector('[aria-label="View name"]'),
    rename:[...el.querySelectorAll('button')].find(b=>b.textContent==='Rename view'),duplicate:[...el.querySelectorAll('button')].find(b=>b.textContent==='Duplicate view'),default:[...el.querySelectorAll('button')].find(b=>b.textContent==='Make default')}));
  async function staleEvents(){await held.evaluate(controls=>{
    controls.presentation.value='standard';controls.presentation.dispatchEvent(new Event('change',{bubbles:true}));
    controls.name.value='Stale name';controls.name.dispatchEvent(new Event('change',{bubbles:true}));controls.rename.click();controls.duplicate.click();controls.default.click();
  });}
  const invalid=original+'\n{ unfinished';await writeSource(page,invalid);await staleEvents();await expect(page.locator('#src')).toHaveValue(invalid);await expect(page.locator('#undo-builder')).toBeDisabled();
  const other=fixture();other.page.title='Unrelated story';other.page.blocks[0].id='other';other.page.blocks[0].heading='Other section';
  const replacement=JSON.stringify(other,null,2);await writeSource(page,replacement);await staleEvents();await expect(page.locator('#src')).toHaveValue(replacement);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#file-input').setInputFiles({name:'other.json',mimeType:'application/json',buffer:Buffer.from(replacement)});
  expect(await held.evaluate(controls=>Object.values(controls).every(el=>!el.isConnected))).toBe(true);
  await staleEvents();await expect(page.locator('#src')).toHaveValue(replacement);await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#redo-builder')).toBeDisabled();
  await expect(presentation(page)).toHaveValue('standard');await held.dispose();
});

for(const size of [{width:1800,height:1200},{width:390,height:844},{width:500,height:844},{width:650,height:844}])test('canvas view controls stay reachable at '+size.width+'px',async({page,server},info)=>{
  await page.setViewportSize(size);const original=await open(page,server);
  const select=presentation(page),summary=settings(page).locator('summary');await reachable(select);await reachable(summary);
  await summary.focus();await page.keyboard.press('Enter');const name=settings(page).getByRole('textbox',{name:'View name',exact:true});
  await reachable(name);const duplicate=settings(page).getByRole('button',{name:'Duplicate view',exact:true});await reachable(duplicate);
  await info.attach('canvas-view-options-'+size.width,{body:await page.screenshot(),contentType:'image/png'});
  await summary.click();await section(page).getByRole('button',{name:'Engineering',exact:true}).click();
  const makeDefault=settings(page).getByRole('button',{name:'Make default',exact:true});await reachable(select);await reachable(makeDefault);
  await expect(select).toHaveValue('explore');await expect(page.locator('#src')).toHaveValue(original);
  await makeDefault.focus();await page.keyboard.press('Enter');expect(JSON.parse(await text(page)).page.blocks[0].diagram.defaultLayout).toBe('engineering');
  await info.attach('canvas-view-default-'+size.width,{body:await page.screenshot(),contentType:'image/png'});
});


test('an arranging sibling cannot steal view navigation, and Back to page survives a heading edit',async({page,server})=>{
  const input=fixture(true);delete input.page.blocks[1].id;
  await open(page,server,input);
  await section(page).getByRole('button',{name:'Arrange section',exact:true}).click();
  await section(page,1).getByRole('button',{name:'Engineering',exact:true}).click();
  await expect(section(page,1)).toHaveClass(/workspace-active-section/);
  await expect(page.locator('#diagram-add-target')).toHaveValue('1');
  await page.locator('#workspace-page').click();await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);
  const changed=JSON.parse(await text(page));changed.page.blocks[1].heading='Billing revised';
  await writeSource(page,JSON.stringify(changed,null,2));
  await page.locator('#editor-tab-json').click();await page.locator('#go').click();await closeTools(page);
  await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);await expect(page.locator('#workspace-page')).toHaveText('Open Explore');
  await page.locator('#workspace-page').click();await expect(section(page,1)).toHaveClass(/workspace-active-section/);
});


test('changing automatic Data to Explore preserves Home and its opening default',async({page,server})=>{
  const input=fixture(),d=input.page.blocks[0].diagram;delete d.layouts;delete d.defaultLayout;d.primaryPanel='home';
  const original=await open(page,server,input);
  await section(page).getByRole('button',{name:'Data flow',exact:true}).click();
  await presentation(page).selectOption('explore');
  const saved=JSON.parse(await text(page)).page.blocks[0].diagram;
  expect(saved.defaultLayout).toBe('home');expect(saved.layouts.map(v=>v.id)).toEqual(['home','flow']);
  expect(saved.layouts[1].presentation).toBe('explore');expect(saved.layouts[0].presentation || 'standard').toBe('standard');
  await expect(section(page)).toHaveAttribute('data-view-id','flow');await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
  await section(page).getByRole('button',{name:'Home',exact:true}).click();await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);
  await expect(presentation(page)).toHaveValue('standard');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});
