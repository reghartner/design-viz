/* #1371: the Status controls panel (desktop). The telemetry proof board (helpers/telemetry-proof.mjs: Jira states, a
   telemetry provider and an Over time history) gains a Status controls panel beside its Status panel; the native mount
   is wrapped so setup builds it unchanged otherwise.
| row | fixture | assertion | rejects |
|---|---|---|---|
| C1 Standard | both panels | the controls panel holds Jira/Trace, the Metrics overlay, Live/Over time; the Status panel has none of them; Metrics, Over time, a day and Trace from the controls repaint the canvas and the Status panel | controls repeated in Status; a controls panel with its own state |
| C2 Explore | an Explore View showing the controls and hiding the Status panel | the controls work with Status hidden; showing Status from the Panels menu adds no controls to it; hiding the controls panel brings them back into Status | controls that can all be hidden; duplicates |
| C3 no panel | the same board without the controls panel | the Status panel has every control, as before | a change to existing boards |
| C5 Explore, Status hidden by the View (option A) | the C2 Views | the Status controls window has no Hide button; its Panels menu checkbox is checked, disabled and notes "Shows while the View hides Status"; in the View that shows Status the checkbox is enabled again | a reader hiding every control while the ticket list cannot be shown |
| C6 Standard, a step hides the controls panel (review c1) | the board's second step sets panelVisibility controls:false | at that step the controls panel is step-hidden and Live, Over time and the Metrics switch show in the Status panel and work; back on the first step they leave Status again | a step-hidden controls panel that still counts as shown |
| C4 Workbench | the doorbell example pasted, Add → Panel… → Status controls | the spec gains the panel and the preview shows it holding the controls, with none in the Status panel | a type the picker cannot add |
*/
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {setup} from '../helpers/telemetry-proof.mjs';

// Wrap the native mount: add the Status controls panel and, with `views`, a Standard and an Explore View whose Explore
// tiles hide the Status panel (per-View visibility).
async function withControls(page,{panel=true,views=false,hideAt=null}={}){
 await page.addInitScript(({panel,views,hideAt})=>{
  let real=null;const add=raw=>{const spec=JSON.parse(JSON.stringify(raw)),d=spec.page.sections[0].diagram;
   if(panel)d.panels.push({id:'controls',type:'status-controls',title:'Status controls'});
   if(hideAt)d.steps.find(st=>st.id===hideAt).panelVisibility={controls:false};
   if(views){const tiles=hide=>[{x:0,y:0,w:16,h:18},{controls:'steps',x:0,y:18,w:16,h:6},{panel:'controls',x:16,y:0,w:8,h:6},{panel:'status',x:16,y:6,w:8,h:18,...(hide?{hidden:true}:{})}];
    d.layouts=[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{columns:24,default:tiles(false)}},{id:'explore',name:'Explore',presentation:'explore',sectionLayout:{columns:24,default:tiles(true)}},{id:'both',name:'Explore all',presentation:'explore',sectionLayout:{columns:24,default:tiles(false)}}];d.defaultLayout='standard';}
   return spec;};
  // mountCues' first mount checks the plain Status panel; setup's own mount (after it sets window.calls) gets the panel.
  Object.defineProperty(window,'mount',{configurable:true,get(){return real && ((host,raw,opts)=>real(host,window.calls?add(raw):raw,opts));},set(fn){real=fn;}});
 },{panel,views,hideAt});
}
const statusPanel=root=>root.locator('.pwidget.pt-live-status'),controlsPanel=root=>root.locator('.pwidget.pt-status-controls');
const metrics=scope=>scope.getByRole('switch',{name:'Metrics overlay',exact:true});
const button=(scope,name)=>scope.getByRole('button',{name,exact:true});
// The view controls a reader can see in a scope: Jira/Trace, the Metrics overlay, Live/Over time, the day slider.
const visibleControls=scope=>scope.locator('.dv-status-modes,.dv-live-metrics,.dv-live-time,input.dv-live-over-time-slider,.dv-live-connection').filter({visible:true}).count();
async function day(scope,index){const s=scope.getByRole('slider',{name:'Day',exact:true});await s.focus();await s.press('Home');for(let i=0;i<index;i++)await s.press('ArrowRight');await expect(s).toHaveValue(String(index));}
const card=(root,id)=>root.locator('[data-metrics-card="'+id+'"]').filter({visible:true}).first();

test('C1 Standard: the Status controls drive the board and the Status panel has no duplicate controls',async({page,server},info)=>{
 await withControls(page);const root=await setup(page,server),status=statusPanel(root),controls=controlsPanel(root);
 await expect(controls).toBeVisible();await expect(status).toBeVisible();
 await expect(button(controls,'Jira')).toBeVisible();await expect(metrics(controls)).toBeVisible();await expect(button(controls,'Live')).toBeVisible();await expect(button(controls,'Over time')).toBeVisible();
 expect(await visibleControls(status),'no view control repeated in the Status panel').toBe(0);
 await expect(status.locator('table.dv-live-tickets')).toBeVisible();
 // Metrics from the controls: cards on the canvas, Proof in the Status panel.
 await metrics(controls).click();await expect(card(root,'ingest->app')).toContainText('100 req/h');await expect(status.locator('.dv-live-proof-row')).toHaveCount(6);
 // Over time and a day from the controls: the slider is there, the canvas shows that day, Status has no slider.
 await button(controls,'Over time').click();await expect.poll(()=>page.evaluate(()=>window.calls.history.length)).toBe(1);
 await day(controls,2);await expect(card(root,'ingest->app')).toContainText('50 req/h');await day(controls,0);await expect(card(root,'ingest->app')).toHaveAttribute('data-verdict','done-unproven');
 await expect(status.getByRole('slider',{name:'Day',exact:true})).toHaveCount(0);expect(await visibleControls(status)).toBe(0);
 await info.attach('c1-standard-over-time',{body:await page.screenshot(),contentType:'image/png'});
 await button(controls,'Live').click();await expect(card(root,'ingest->app')).toContainText('100 req/h');
 // Trace from the controls: the Status panel shows the Trace view.
 await controls.getByRole('button',{name:/^Trace( · \d+)?$/}).click();await expect(status.locator('.dv-live-trace')).toBeVisible();
 expect(await visibleControls(status)).toBe(0);
});

test('C2 Explore: with Status hidden by the View the controls work; hiding the controls brings them back into Status',async({page,server},info)=>{
 await withControls(page,{views:true});const root=await setup(page,server);
 const view=name=>page.locator('.reader-view-strip [role="tab"]').filter({hasText:new RegExp('^'+name+'$')}).first();
 await view('Explore').click();await expect(root.locator('.explore-stage').first()).toBeVisible();
 const controls=root.locator('[data-explore-panel="controls"]'),status=root.locator('[data-explore-panel="status"]'),canvasCard=()=>root.locator('.explore-stage [data-metrics-card="ingest->app"]').first();
 await expect(controls).toBeVisible();await expect(status,'the Explore View hides the Status panel').toBeHidden();
 await metrics(controls).click();await expect(canvasCard()).toContainText('100 req/h');
 await button(controls,'Over time').click();await day(controls,2);await expect(canvasCard()).toContainText('50 req/h');
 await info.attach('c2-explore-controls-only',{body:await page.screenshot(),contentType:'image/png'});
 // An Explore View showing both panels: Status has no controls; hiding the controls panel brings them back into Status,
 // still on the selected day.
 await view('Explore all').click();await expect(status).toBeVisible();await expect(controls).toBeVisible();
 await expect(status.locator('.dv-live-panel-body').first()).toBeVisible();expect(await visibleControls(status),'no duplicates in Status').toBe(0);
 await controls.getByRole('button',{name:'Hide Status controls',exact:true}).click();await expect(controls).toBeHidden();
 await expect(button(status,'Live')).toBeVisible();await expect(status.getByRole('slider',{name:'Day',exact:true})).toHaveValue('2');await expect(metrics(status)).toHaveAttribute('aria-checked','true');
 await info.attach('c2-explore-controls-in-status',{body:await page.screenshot(),contentType:'image/png'});
 await button(status,'Live').click();await expect(canvasCard()).toContainText('100 req/h');
 // Shown again from the Panels menu: the controls leave the Status panel.
 await root.locator('.explore-panel-menu summary').first().click();await root.locator('.explore-panel-choices label').filter({hasText:'Status controls'}).getByRole('checkbox').check();await page.keyboard.press('Escape');
 await expect(controls).toBeVisible();await expect.poll(()=>visibleControls(status)).toBe(0);
});

test('C5 Explore: while the View hides Status, the Status controls cannot be hidden',async({page,server})=>{
 await withControls(page,{views:true});const root=await setup(page,server);
 const view=name=>page.locator('.reader-view-strip [role="tab"]').filter({hasText:new RegExp('^'+name+'$')}).first();
 await view('Explore').click();await expect(root.locator('.explore-stage').first()).toBeVisible();
 const controls=root.locator('[data-explore-panel="controls"]'),row=root.locator('.explore-panel-choices label').filter({hasText:'Status controls'});
 await expect(controls).toBeVisible();await expect(controls.getByRole('button',{name:'Hide Status controls',exact:true}),'no Hide button').toBeHidden();
 await root.locator('.explore-panel-menu summary').first().click();
 await expect(row.getByRole('checkbox')).toBeChecked();await expect(row.getByRole('checkbox')).toBeDisabled();await expect(row).toContainText('Shows while the View hides Status');
 await page.keyboard.press('Escape');await expect(controls).toBeVisible();
 // The View that shows Status: the controls can be hidden again.
 await view('Explore all').click();await expect(root.locator('[data-explore-panel="status"]')).toBeVisible();
 await expect(controls.getByRole('button',{name:'Hide Status controls',exact:true})).toBeVisible();
 await root.locator('.explore-panel-menu summary').first().click();await expect(row.getByRole('checkbox')).toBeEnabled();await expect(row).not.toContainText('Shows while the View hides Status');
});

test('C6 Standard: a step that hides the Status controls panel brings the controls into the Status panel',async({page,server},info)=>{
 await withControls(page,{hideAt:'retry'});const root=await setup(page,server),status=statusPanel(root),controls=controlsPanel(root);
 const chip=index=>root.locator('.schip[data-step-source="'+index+'"]').first();
 await chip(0).click();await expect(controls).not.toHaveClass(/panel-step-hidden/);await expect(button(controls,'Live')).toBeVisible();expect(await visibleControls(status)).toBe(0);
 await chip(1).click();await expect(controls,'the step hides the controls panel').toHaveClass(/panel-step-hidden/);
 await expect(button(status,'Live'),'the controls are in the Status panel').toBeVisible();await expect(button(status,'Over time')).toBeVisible();await expect(metrics(status)).toBeVisible();
 await metrics(status).click();await expect(card(root,'ingest->app')).toContainText('100 req/h');
 await info.attach('c6-step-hidden-controls-in-status',{body:await page.screenshot(),contentType:'image/png'});
 await chip(0).click();await expect(controls).not.toHaveClass(/panel-step-hidden/);await expect.poll(()=>visibleControls(status),{message:'back on step one they leave Status'}).toBe(0);
 await expect(metrics(controls)).toHaveAttribute('aria-checked','true');
});

test('C3 a board without the Status controls panel keeps every control in the Status panel',async({page,server})=>{
 await withControls(page,{panel:false});const root=await setup(page,server),status=statusPanel(root);
 await expect(controlsPanel(root)).toHaveCount(0);
 await expect(button(status,'Jira')).toBeVisible();await expect(metrics(status)).toBeVisible();await expect(button(status,'Live')).toBeVisible();await expect(button(status,'Over time')).toBeVisible();
 await metrics(status).click();await expect(card(root,'ingest->app')).toContainText('100 req/h');
});

test('C4 Workbench: Add → Panel… offers Status controls; the preview shows it holding the controls',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
 const raw=JSON.parse(await readFile(path.join(repo,'examples/live-status/live-status.spec.json'),'utf8'));
 await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
 await page.locator('#diagram-add').click();await page.locator('[data-add-kind=panel]').click();await expect(page.locator('#panel-picker')).toBeVisible();
 const pick=page.locator('.panel-picker-card[data-panel-type="status-controls"]');await expect(pick).toContainText('Status controls');await pick.click();await page.locator('#panel-picker-add').click();
 const spec=JSON.parse(await page.locator('#src').inputValue());const panels=(spec.page.sections || spec.page.blocks)[0].diagram.panels;
 expect(panels.at(-1).type).toBe('status-controls');
 const view=page.locator('#docview'),controls=view.locator('.pwidget.pt-status-controls'),status=view.locator('.pwidget.pt-live-status');
 await expect(controls).toBeVisible();await expect(controls.locator('.dv-status-header')).toBeVisible();
 await expect(button(controls,'Jira')).toBeVisible();
 expect(await visibleControls(status),'the Status panel leaves the controls to it').toBe(0);
 await info.attach('c4-workbench',{body:await page.screenshot(),contentType:'image/png'});
});
