/* #1236 desktop Workbench Status board settings.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| B1 | Inspect → Board settings (accessible name "Status board settings") on a live-status board shows five sections (Jira, Metrics, Traces, Environments, Log searches); at 1280×720 the Inspect header buttons share one row and all five section headers are in view without scrolling; Jira site there writes `tracking.jira.site`; one Undo restores the source; Find objects → Board settings opens the same area. | live-status board with tracking.jira, no telemetry, and a Live status panel | button tops equal; five `details.board-section` summaries in viewport; source value after the edit and after Undo; the Find objects button shows the same sections | no entry point; a header that wraps; open forms that push headers out of view; an edit that needs two Undo steps |
| B2 | An invalid `tracking.staleDays` and Jira site show their validator warnings in the Jira section; a warning opens a section that is closed by default (Environments). | the same board with staleDays 0, a bad site and a bad environment id | `Jira warnings` list inside the Jira section contains both paths; Jira and Environments sections are open; Traces stays closed | warnings missing or in another section; warnings hidden in a closed section |
| B4 | #1233 Log searches: New log search with a label and a query adds `tracking.telemetry.lookups.<id>` with them; one Undo removes it; suggested values on a query without a $value slot show the warning next to the Query field. | live-status board without lookups | source shape; source after Undo; aria-invalid Query with its visible note | an editor that writes several history steps, or warnings only at the bottom |
| B3 | Make this a status board on a bare diagram adds a page wrapper, an empty tracking block and a Live status panel; a status line confirms it and focus moves to the Jira header; one Undo restores the bare diagram. | bare {nodes,rows,edges} diagram | source shape after the click; the preview shows the Live status panel; status text; focused Jira summary; source after Undo equals the bare text | several Undo steps; a lost diagram; no panel; focus dropped to the page |
*/
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
const diagram=()=>({nodes:{api:{title:'API',tickets:['DOOR-101']},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'write'}]});
function board(tracking){
  const d=diagram();d.panels=[{id:'status',type:'live-status',title:'Epic status'}];
  return {page:{title:'Board',tracking:tracking || {jira:{site:'https://acme.atlassian.net',epic:'DOOR-100'}},sections:[{heading:'Flow',diagram:d}]}};
}
const TITLES=['Jira','Metrics','Traces','Environments','Log searches'];
const sections=guide=>guide.locator('details.board-section');
const section=(guide,id)=>guide.locator('details.board-section[data-board-section="'+id+'"]');
async function open(page,server,spec,size={width:1440,height:1000}){
  await page.setViewportSize(size);
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();
}
async function titles(guide){return (await sections(guide).locator(':scope > summary').allTextContents()).map(t=>t.split(' · ')[0]);}

test('B1 desktop Status board settings shows five sections; Jira site edits tracking.jira.site with one Undo; Find objects opens it too',async({page,server},info)=>{
  await open(page,server,board(),{width:1280,height:720});
  const guide=page.locator('#guide'),src=page.locator('#src');
  const entry=page.getByRole('group',{name:'Document actions'}).getByRole('button',{name:'Status board settings',exact:true});
  await expect(entry).toHaveText('Board settings');
  const tops=await page.evaluate(()=>['document-settings','status-board-settings','diagram-import-open'].map(id=>Math.round(document.getElementById(id).getBoundingClientRect().top)));
  expect(new Set(tops).size,'the Inspect header buttons share one row at 1280: '+tops.join(',')).toBe(1);
  await entry.click();
  await expect(guide.locator('.inspector-title')).toHaveText('Status board settings');
  expect(await titles(guide)).toEqual(TITLES);
  for(const summary of await sections(guide).locator(':scope > summary').all())await expect(summary).toBeInViewport({ratio:1});
  await section(guide,'jira').locator(':scope > summary').click();
  const site=section(guide,'jira').getByLabel('Jira site',{exact:true});await expect(site).toBeVisible();
  const before=await src.inputValue();
  await site.fill('https://door.atlassian.net');await site.press('Enter');
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.jira.site).toBe('https://door.atlassian.net/');
  expect(JSON.parse(await src.inputValue()).page.tracking.jira.epic).toBe('DOOR-100');
  await page.screenshot({path:info.outputPath('status-board-settings.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
  await page.locator('#editor-tab-outline').click();await page.locator('#outline-status-board-settings').click();
  await expect(guide.locator('.inspector-title')).toHaveText('Status board settings');expect(await titles(guide)).toEqual(TITLES);
});

test('B2 desktop invalid staleDays and Jira site show their warnings in the Jira section',async({page,server})=>{
  await open(page,server,board({staleDays:0,jira:{site:'not a url'},telemetry:{environments:{'9bad':{}}}}));
  const guide=page.locator('#guide');await page.locator('#status-board-settings').click();
  const jira=section(guide,'jira');await expect(jira).toHaveAttribute('open','');
  const list=jira.getByRole('list',{name:'Jira warnings',exact:true});await expect(list).toBeVisible();
  await expect(list).toContainText('tracking.staleDays');await expect(list).toContainText('tracking.jira.site');
  await expect(jira.locator(':scope > summary')).toContainText('2 warnings');
  await expect(section(guide,'environments')).toHaveAttribute('open','');
  await expect(section(guide,'environments').getByRole('list',{name:'Environments warnings',exact:true})).toBeVisible();
  await expect(section(guide,'traces')).not.toHaveAttribute('open','');
});

test('B3 desktop Make this a status board on a bare diagram adds page, tracking and Live status panel as one Undo step',async({page,server},info)=>{
  const bare=diagram();await open(page,server,bare);
  const guide=page.locator('#guide'),src=page.locator('#src'),before=await src.inputValue();
  await page.locator('#status-board-settings').click();
  await expect(sections(guide)).toHaveCount(0);
  await guide.getByRole('button',{name:'Make this a status board',exact:true}).click();
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page?.tracking).toEqual({});
  const raw=JSON.parse(await src.inputValue()),d=raw.page.sections[0].diagram;
  expect(d.panels.map(p=>p.type)).toEqual(['live-status']);delete d.panels;expect(d).toEqual(bare);
  await expect(page.locator('#docview .pt-live-status')).toHaveCount(1);
  expect(await titles(guide)).toEqual(TITLES);
  await expect(guide.getByRole('status')).toHaveText('Status board ready. Undo removes it.');
  await expect(section(guide,'jira').locator(':scope > summary')).toBeFocused();
  await page.screenshot({path:info.outputPath('make-status-board.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});

test('B4 desktop Log searches: add a search, one Undo removes it; values without a $value slot warn at the Query field',async({page,server},info)=>{
  await open(page,server,board());
  const guide=page.locator('#guide'),src=page.locator('#src');await page.locator('#status-board-settings').click();
  const lookups=section(guide,'lookups');await lookups.locator(':scope > summary').click();
  const before=await src.inputValue();
  const add=lookups.locator('details.log-search-add');if(!await add.evaluate(d=>d.open))await add.locator(':scope > summary').click();
  await lookups.getByLabel('New log search label',{exact:true}).fill('Order ID');
  await lookups.getByLabel('New log search query',{exact:true}).fill('{env="$env"} |= "order placed" | order_id="$value"');
  await lookups.getByRole('button',{name:'Add log search',exact:true}).click();
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.telemetry?.lookups).toEqual({'order-id':{label:'Order ID',query:'{env="$env"} |= "order placed" | order_id="$value"'}});
  await expect(lookups.locator('details.log-search > summary')).toHaveText(['Log search order-id · Order ID']);
  await page.screenshot({path:info.outputPath('log-searches-added.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect.poll(async()=>Object.keys(JSON.parse(await src.inputValue()).page.tracking.telemetry.lookups)).toEqual(['order-id']);
  const fold=lookups.locator('details.log-search').first();if(!await fold.evaluate(d=>d.open))await fold.locator(':scope > summary').click();
  const query=fold.getByLabel('order-id query',{exact:true});await query.fill('{env="$env"} |= "order placed"');await query.blur();
  const values=fold.getByLabel('order-id suggested values',{exact:true});await values.fill('A-1\nA-2');await values.blur();
  await expect.poll(async()=>JSON.parse(await src.inputValue()).page.tracking.telemetry.lookups['order-id'].values).toEqual(['A-1','A-2']);
  const warned=section(guide,'lookups').getByLabel('order-id query',{exact:true});await expect(warned).toHaveAttribute('aria-invalid','true');
  const note=page.locator('#'+await warned.getAttribute('aria-describedby'));await expect(note).toBeVisible();await expect(note).toContainText('has suggested values but no $value slot');
  await page.screenshot({path:info.outputPath('log-searches-warning.png')});
});
