/* #865 Epic status board template. Contract source: #865 "How it should look", "Chuck's arrangement
   (2026-11-02)" and "Test + flip"; parent #862 item 2. Desktop only (1440×1000), real clicks only.
   Fixture: the built Workbench (--no-config build, empty starters.json), Start new project.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| T1 card + thumbnail | All examples (precondition: Delivery status not pressed) | in #welcome-templates the Epic status board card is visible beside other categories' cards, its art svg differs from Simple service flow's | no card; a card that falls back to the default flow drawing |
| T2 Delivery status filter | real click on the Delivery status filter button | the button is aria-pressed; visible titles in #welcome-templates are exactly [Blank diagram, Epic status board] | no filter; the card filed under Engineering too; a filter that shows every template |
| T3 opens with demo on | real click on the card | the editor shows; the preview's Demo live status checkbox is checked | a template that opens like Paste JSON, demo off |
| T4 authored source | #src after T3 | page.tracking.jira.epic, panels status:live-status and history:edit-history, sectionLayout.default equals Chuck's arrangement, backstage/confluence keep the example's; the text never contains demoLiveStatus (the flag is template metadata, Chuck 2026-11-02) | a copy of the worked example without Chuck's arrangement; the demo flag written into the saved document |
| T5 diagram + attached steps | #docview after T3 | the diagram tile holds the .board and the one .termbar, whose box lies inside the tile; no separate steps tile | step controls in their own tile, or no steps |
| T6 Epic status filled | the panel:status tile | .pwidget.pt-live-status shows .dv-live-panel-body and at least two visible "state N" counts | the panel showing only its title (demo off) |
| T7 Edit history | the panel:history tile | .pwidget.pt-edit-history shows at least one details.dv-edit-details row | a template without the history panel or its entries |
| T8 carriers painted | #docview | at least one g.node[data-live-appearance] is visible | the checkbox checked but no paint |
| T9 Chuck's arrangement | tile bounding boxes | status right ≤ diagram left; status and diagram tops align; history top ≥ diagram bottom; history left ≥ status right; no other tile starts left of status's right edge | the worked example's default (history full width under everything) |
| T10 demo comes from the template open | uncheck (real click; carriers lose paint), Home, Start new project, Delivery status, card again | Demo live status is checked and carriers are painted again | demo state carried over from the previous preview instead of set by the template open |
Second test: every other way in opens with the demo off (Chuck 2026-11-02, option 1). Before EACH row the
Epic status board is opened from Start new project and its checkbox is asserted checked with a painted node
(precondition), then Home. "Off" for a ticketed document = the Demo live status checkbox is visible and unchecked,
no #docview g.node[data-live-appearance], no .pt-live-status .dv-live-panel-body.
| T11 Paste JSON | Paste JSON of examples/live-status/live-status.spec.json (tickets, the same two panels) | off | every ticketed document opening with demo on; demo left on after the template |
| T12 Open file | the browser has no writable-file picker (showOpenFilePicker undefined, as in working-file.spec "unsupported writable access"), so Open file uses the welcome file input: real click on #welcome-open, Playwright file chooser, setInputFiles(the same example) | off | Open file taking a demo-on path |
| T13 other built-in template | Start new project, All examples, real click on Simple service flow. No other built-in template has tickets, so the checkbox is NOT SHOWN: count 0, no [data-live-appearance], no .pt-live-status | not shown, nothing painted | demo state leaking into the next template |
| T14 ticketed team template | starters.json (routed) offers "Team delivery board": the worked example plus "demoLiveStatus": true in the manifest entry; real click in #welcome-company-grid | off | demo turned on for every template, or a team manifest able to set the built-in flag |
*/
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const ARRANGEMENT=[
  {x:12,y:0,w:12,h:21},
  {x:12,y:30,w:12,h:5,controls:'steps',attachTo:'diagram'},
  {x:0,y:0,w:12,h:31,panel:'status'},
  {x:12,y:21,w:12,h:10,panel:'history'}
];
const HOST_PROFILE=[
  {x:0,y:0,w:24,h:10},
  {controls:'steps',x:0,y:10,w:24,h:6},
  {panel:'status',x:0,y:16,w:24,h:16},
  {panel:'history',x:0,y:32,w:24,h:8}
];
const grid=page=>page.locator('#welcome-templates');
const card=(page,name)=>grid(page).locator('.welcome-template-card').filter({has:page.locator('.welcome-template-title',{hasText:name})});
const visibleTitles=page=>grid(page).locator('.welcome-template-card').evaluateAll(cards=>cards.filter(card=>card.checkVisibility()).map(card=>card.querySelector('.welcome-template-title').firstChild.textContent));
const right=box=>box.x+box.width,bottom=box=>box.y+box.height;

async function openTemplate(page){
  await page.locator('#welcome-new').click();
  const filter=page.locator('#welcome-template-filters').getByRole('button',{name:'Delivery status',exact:true});
  await filter.click();await expect(filter).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>visibleTitles(page)).toEqual(['Blank diagram','Epic status board']);
  await card(page,'Epic status board').click();
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  await prepareEditorSurface(page);
}

test.describe('Epic status board template (#865)',()=>{
  test('Delivery status lists the Epic status board, which opens with Demo live status on in Chuck\'s arrangement',async({page,server},info)=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-new').click();
    // T1: All examples first, so the narrowed result below cannot pass on setup alone.
    const delivery=page.locator('#welcome-template-filters').getByRole('button',{name:'Delivery status',exact:true});
    await expect(page.locator('#welcome-template-filters').getByRole('button',{name:'All examples',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(card(page,'Epic status board')).toBeVisible();await expect(card(page,'Simple service flow')).toBeVisible();
    expect((await visibleTitles(page)).length).toBeGreaterThan(2);
    const art=name=>card(page,name).locator('.welcome-template-art svg').evaluate(svg=>svg.innerHTML);
    expect(await art('Epic status board')).not.toBe(await art('Simple service flow'));
    await expect(delivery).toHaveAttribute('aria-pressed','false');
    await page.locator('[data-welcome-back]:visible').click();

    // T2 + T3
    await openTemplate(page);
    const demo=page.getByRole('checkbox',{name:'Demo live status',exact:true});
    await expect(demo).toBeChecked();

    // T4
    const text=await page.locator('#src').inputValue(),source=JSON.parse(text),d=source.page.sections[0].diagram;
    expect(text,'the demo flag never enters the document').not.toContain('demoLiveStatus');
    expect(source.page.tracking.jira.epic).toBeTruthy();
    expect(d.panels.map(p=>[p.id,p.type])).toEqual([['status','live-status'],['history','edit-history']]);
    expect(d.sectionLayout.default).toEqual(ARRANGEMENT);
    expect(d.sectionLayout.backstage).toEqual(HOST_PROFILE);expect(d.sectionLayout.confluence).toEqual(HOST_PROFILE);

    // T5
    const view=page.locator('#docview'),tile=key=>view.locator('.section-layout-tile[data-layout-key="'+key+'"]');
    const diagram=tile('diagram'),status=tile('panel:status'),history=tile('panel:history');
    await expect(diagram).toBeVisible();await expect(diagram.locator('.board').first()).toBeVisible();
    await expect(view.locator('.termbar')).toHaveCount(1);
    const steps=diagram.locator('.termbar');await expect(steps).toBeVisible();
    await expect(tile('steps')).toHaveCount(0);

    // T6
    const epic=status.locator('.pwidget.pt-live-status');
    await expect(epic).toBeVisible();await expect(epic.locator('.dv-live-panel-body')).toBeVisible();
    const counts=epic.locator('.dv-live-count').filter({visible:true});
    await expect.poll(()=>counts.count()).toBeGreaterThanOrEqual(2);
    for(const text of await counts.allTextContents())expect(text.trim()).toMatch(/^(todo|active|done|blocked|missing) [1-9]\d*$/);

    // T7
    const edits=history.locator('.pwidget.pt-edit-history');
    await expect(edits).toBeVisible();await expect(edits.locator('details.dv-edit-details').first()).toBeVisible();

    // T8
    await expect(view.locator('g.node[data-live-appearance]').first()).toBeVisible();

    // T9
    const [diagramBox,stepsBox,statusBox,historyBox]=await Promise.all([diagram,steps,status,history].map(locator=>locator.boundingBox()));
    expect(right(statusBox),'Epic status left of the diagram').toBeLessThanOrEqual(diagramBox.x+1);
    expect(Math.abs(statusBox.y-diagramBox.y),'Epic status and the diagram share the top row').toBeLessThanOrEqual(1);
    expect(historyBox.y,'Edit history below the diagram').toBeGreaterThanOrEqual(bottom(diagramBox)-1);
    expect(historyBox.x,'Edit history right of Epic status').toBeGreaterThanOrEqual(right(statusBox)-1);
    expect(stepsBox.x).toBeGreaterThanOrEqual(diagramBox.x-1);expect(right(stepsBox)).toBeLessThanOrEqual(right(diagramBox)+1);
    expect(stepsBox.y).toBeGreaterThanOrEqual(diagramBox.y-1);expect(bottom(stepsBox),'step controls inside the diagram tile').toBeLessThanOrEqual(bottom(diagramBox)+1);
    const lefts=await view.locator('.section-layout-tile:not([data-layout-key="panel:status"])').evaluateAll(tiles=>tiles.filter(t=>t.checkVisibility()).map(t=>t.getBoundingClientRect().left));
    expect(lefts.length).toBe(2);
    for(const left of lefts)expect(left,'nothing under Epic status').toBeGreaterThanOrEqual(right(statusBox)-1);
    await page.screenshot({path:info.outputPath('epic-status-board-template.png')});

    // T10: demo is set by choosing the template, not carried over from the last preview.
    await demo.uncheck();await expect(demo).not.toBeChecked();
    await expect(view.locator('g.node[data-live-appearance]')).toHaveCount(0);
    await page.locator('#workspace-home').click();await expect(page.locator('#welcome-home')).toBeVisible();
    await openTemplate(page);
    await expect(page.getByRole('checkbox',{name:'Demo live status',exact:true})).toBeChecked();
    await expect(page.locator('#docview g.node[data-live-appearance]').first()).toBeVisible();
  });

  test('Paste JSON, Open file and other templates open with Demo live status off after the Epic status board',async({page,server})=>{
    test.setTimeout(90000);
    const examplePath=path.join(repo,'examples/live-status/live-status.spec.json'),example=await readFile(examplePath,'utf8');
    await page.addInitScript(()=>{window.showOpenFilePicker=undefined;window.showDirectoryPicker=undefined;});
    await page.route('**/starters.json',route=>route.fulfill({json:[{name:'Team delivery board',desc:'A team copy of the worked status board.',demoLiveStatus:true,spec:JSON.parse(example)}]}));
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(server.origin+'/workbench.html');
    const demo=()=>page.getByRole('checkbox',{name:'Demo live status',exact:true}),view=page.locator('#docview');
    const home=async()=>{await page.locator('#workspace-home').click();await expect(page.locator('#welcome-home')).toBeVisible();};
    async function boardWithDemoOn(){
      await openTemplate(page);
      await expect(demo()).toBeChecked();await expect(view.locator('g.node[data-live-appearance]').first()).toBeVisible();
      await home();
    }
    async function expectOff(label){
      await prepareEditorSurface(page);
      await expect(demo(),label).toBeVisible();await expect(demo(),label).not.toBeChecked();
      await expect(view.locator('.pwidget.pt-live-status'),label).toBeVisible();
      await expect(view.locator('g.node[data-live-appearance]'),label).toHaveCount(0);
      await expect(view.locator('.pt-live-status .dv-live-panel-body'),label).toHaveCount(0);
    }

    // T11 Paste JSON
    await boardWithDemoOn();
    await paste(page,example);await expectOff('Paste JSON');

    // T12 Open file
    await home();await boardWithDemoOn();
    const chooser=page.waitForEvent('filechooser');await page.locator('#welcome-open').click();
    await (await chooser).setInputFiles(examplePath);
    await expect(page.locator('#workbench-workspace')).toBeVisible();await expect(page.locator('#src')).toHaveValue(example);
    await expectOff('Open file');

    // T13 another built-in template (no tickets: the checkbox is not shown)
    await home();await boardWithDemoOn();
    await page.locator('#welcome-new').click();
    await page.locator('#welcome-template-filters').getByRole('button',{name:'All examples',exact:true}).click();
    await card(page,'Simple service flow').click();
    await expect(page.locator('#workbench-workspace')).toBeVisible();await prepareEditorSurface(page);
    expect(JSON.parse(await page.locator('#src').inputValue()).page.title).toBe('Simple service flow');
    await expect(demo()).toHaveCount(0);
    await expect(view.locator('[data-live-appearance]')).toHaveCount(0);await expect(view.locator('.pt-live-status')).toHaveCount(0);

    // T14 a ticketed team template whose manifest entry claims the flag
    await home();await boardWithDemoOn();
    await page.locator('#welcome-new').click();
    await page.locator('#welcome-company-grid .welcome-template-card').filter({has:page.locator('.welcome-template-title',{hasText:'Team delivery board'})}).click();
    await expect(page.locator('#workbench-workspace')).toBeVisible();
    expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(JSON.parse(example));
    await expectOff('team template');
  });
});
