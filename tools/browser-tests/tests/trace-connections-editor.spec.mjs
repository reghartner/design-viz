/* #1239 desktop Workbench Status board settings → Traces (tracking.telemetry.traceConnections).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| T1 | Choosing Disable for company profile operations writes a map without it; the Workbench resolved list and the saved spec's Trace view connection choices no longer list it. | build with company profiles operations, archive, audit; live-status board with a telemetry block | source map; resolved list items; viewer `Trace connection` options | a disabled profile still offered to readers |
| T2 | Use operations, uncheck its stage environment and type a board label: the entry is written and the resolved list shows the label and only prod. | same | entry; resolved item text | overrides the resolver ignores |
| T3 | Typing an allowed attribute on an inline profile and pressing Enter writes allowedAttributes; one Undo removes it. | board with one inline profile | source list; source after Undo | attributes written elsewhere; two Undo steps |
Company profiles are put into the page the way a company build does: the TELEMETRY_COMPANY_TRACE_CONNECTIONS value in the served HTML. Desktop only.
*/
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,openStatusBoard,boardSection} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const COMPANY={operations:{...PROFILE,label:'Operations'},archive:{...PROFILE,label:'Archive'},audit:{...PROFILE,label:'Audit'}};
const EMPTY='var TELEMETRY_COMPANY_TRACE_CONNECTIONS={}',WITH='var TELEMETRY_COMPANY_TRACE_CONNECTIONS='+JSON.stringify(COMPANY);
function board(telemetry={}){
  return {page:{title:'Traced board',tracking:{telemetry},sections:[{id:'main',heading:'Flow',diagram:{nodes:{api:{title:'API'},db:{title:'Store'}},rows:[['api','db']],edges:[{from:'api',to:'db'}],
    panels:[{id:'status',type:'live-status',title:'Epic status'}]}}]}};
}
async function open(page,server,spec){
  await page.setViewportSize({width:1440,height:1000});
  await page.route(server.origin+'/workbench.html',async route=>{const response=await route.fetch(),body=await response.text();expect(body.includes(EMPTY),'the build has the company profile slot').toBe(true);await route.fulfill({response,body:body.replace(EMPTY,WITH)});});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec,null,2));await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();await openStatusBoard(page,'traces');
  return boardSection(page.locator('#guide'),'traces');
}
const resolvedIds=async traces=>(await traces.getByRole('list',{name:'Resolved trace connections',exact:true}).locator('li').allTextContents()).map(t=>t.split(' · ')[0]);
const map=async src=>JSON.parse(await src.inputValue()).page.tracking.telemetry.traceConnections;

test('T1 desktop Disable a company profile: the source drops it, the resolved list and the viewer no longer offer it',async({page,server},info)=>{
  const traces=await open(page,server,board()),src=page.locator('#src');
  expect(await resolvedIds(traces)).toEqual(['operations','archive','audit']);
  await traces.getByLabel('operations on this board',{exact:true}).selectOption('disable');
  await expect.poll(()=>map(src)).toEqual({archive:{profile:'archive'},audit:{profile:'audit'}});
  await expect.poll(()=>resolvedIds(traces)).toEqual(['archive','audit']);
  await page.screenshot({path:info.outputPath('trace-connections-disabled.png')});
  // The saved spec in the viewer, with the same company profiles in the page.
  const file=path.join(server.root,'trace-connections-editor.json'),out=path.join(server.root,'trace-connections-editor.html');
  await writeFile(file,await src.inputValue());execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);
  const html=await readFile(out,'utf8');expect(html.includes(EMPTY)).toBe(true);await writeFile(out,html.replace(EMPTY,WITH));
  const view=await page.context().newPage();await view.setViewportSize({width:1440,height:900});
  await view.addInitScript(()=>localStorage.setItem('dv_tour_v1','done'));await view.goto(server.origin+'/trace-connections-editor.html');
  const choices=view.locator('#docview select[aria-label="Trace connection"] option');
  await expect.poll(async()=>(await choices.evaluateAll(nodes=>nodes.map(n=>n.value))).filter(Boolean)).toEqual(['archive','audit']);
  await view.close();
});

test('T2 desktop Use a profile, narrow it to one environment and set a board label; the resolved list shows them',async({page,server},info)=>{
  const traces=await open(page,server,board()),src=page.locator('#src');
  await traces.getByLabel('operations on this board',{exact:true}).selectOption('use');
  const stage=traces.getByLabel('operations environment stage',{exact:true});await expect(stage).toBeChecked();await stage.click();
  await expect.poll(async()=>(await map(src)).operations).toEqual({profile:'operations',environments:{prod:{}}});
  const label=traces.getByLabel('operations board label',{exact:true});await label.fill('Ops traces');await label.press('Enter');
  await expect.poll(async()=>(await map(src)).operations).toEqual({profile:'operations',environments:{prod:{}},label:'Ops traces'});
  await expect(traces.getByRole('list',{name:'Resolved trace connections',exact:true}).locator('li').first()).toHaveText('operations · Ops traces · honeycomb · prod (Production)');
  await page.screenshot({path:info.outputPath('trace-connections-narrowed.png')});
});

test('T3 desktop add an allowed attribute to an inline profile; one Undo removes it',async({page,server},info)=>{
  const traces=await open(page,server,board({traceConnections:{inline:{...PROFILE,label:'Inline'}}})),src=page.locator('#src'),before=await src.inputValue();
  const add=traces.getByLabel('inline new allowed attribute',{exact:true});await add.click();await add.pressSequentially('device.model');await add.press('Enter');
  await expect.poll(async()=>(await map(src)).inline.allowedAttributes).toEqual(['device.model']);
  await expect(traces.getByRole('button',{name:'Remove inline allowed attribute device.model',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('trace-connections-attribute.png')});
  await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
});
