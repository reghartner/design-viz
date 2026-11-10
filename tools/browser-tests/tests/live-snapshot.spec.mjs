/* #1265 part B: an agent's snapshot (tools/live-snapshot.js) shown in the desktop Workbench preview.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| W1 Load snapshot | the doorbell example board pasted; File → Load snapshot… with a snapshot file | the "Snapshot from <time>" checkbox appears checked beside Demo live status; carriers wear the snapshot states; the Epic status connection line reads "Snapshot from …" with data-state snapshot; the Metrics line reads "Metrics: snapshot from …"; the bound edge mcu → ingest has a metrics card showing the snapshot's rate (cards are drawn on edges; nodes get cues); Demo turns Snapshot off and Snapshot turns Demo off | snapshot data shown as Demo or as live; a control that only appears in the source |
| W2 never exported | W1, then Export project | the editor source is unchanged and no exported file holds a snapshot title, assignee or the snapshot kind | snapshot data leaking into a saved, exported or published board |
| W3 offered next to the board | a working folder holding doorbell.spec.json and doorbell.snapshot.json | after Choose working folder… the "Snapshot from <time>" checkbox is offered unchecked and the carriers are not painted; checking it paints them | a snapshot that turns itself on |
| W2 SVG export (review c1) | W1 with Snapshot on, then off | while it shows, Download SVG is refused with a reason and nothing downloads; once it is off the SVG has exactly the live-status names an export before any snapshot had (the board's ticket buttons), no state paint and no snapshot value | real states or metric numbers in a diagram-only SVG |
| W4 the author's choices come back (review c1) | Demo live status and Preview metrics layout on, then Load snapshot, then Snapshot off | while the snapshot shows both are off (metrics disabled); unchecking Snapshot brings back Demo and Preview metrics layout | a snapshot that silently switches the author's choices off |
W1–W3 fail at the baseline: there is no Load snapshot… control and no Snapshot choice. */
import {test,expect,paste,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {repo} from '../helpers/prepare.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const raw=JSON.parse(await readFile(path.join(repo,'examples/live-status/live-status.spec.json'),'utf8'));
const AT='2026-11-10T11:02:00.000Z';
// One day of the demo story format plus snapshotAt, as tools/live-snapshot.js writes it.
function snapshotFile(){
 const issue=(state,summary)=>({state,summary,assignee:'Snapshot Person',updated:'2026-11-10T10:00:00.000+0000',epic:'DOOR-100'});
 const values=[120,140,160];
 return {version:1,kind:'flowview-live-snapshot',snapshotAt:AT,board:'doorbell.spec.json',intervalSeconds:6,epics:{'DOOR-100':{summary:'Doorbell epic from the snapshot'}},
  days:[{label:'Snapshot from '+AT,issues:{'HW-123':issue('done','Snapshot title HW-123'),'FW-45':issue('blocked','Snapshot title FW-45'),'FW-46':issue('active','Snapshot title FW-46'),
   'HW-124':issue('done','Snapshot title HW-124'),'BE-67':issue('active','Snapshot title BE-67'),'BE-68':issue('todo','Snapshot title BE-68'),'UX-89':issue('todo','Snapshot title UX-89')},
   telemetry:{start:'2026-11-10T10:44:00.000Z',stepSeconds:360,carriers:{ingest:{rate:{values,unit:'req/h'},errors:{values:[0,0,1],unit:'req/h'}},'mcu->ingest':{rate:{values:[1200,1350,1462],unit:'req/h'},errors:{values:[0,0,0],unit:'req/h'}}}}}],errors:[]};
}
// The live-status class and custom property names in an exported SVG.
const liveTokens=svg=>[...new Set(svg.match(/(?:--)?dv-live-[a-z-]+/g) || [])].sort();
async function downloadSvg(page){const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();return readFile(await (await pending).path(),'utf8');}
const node=(view,id)=>view.locator('g.node[data-dv-node="'+id+'"]').first();
const metricsToggle=page=>page.getByRole('checkbox',{name:'Preview metrics layout',exact:true});
const snapshotToggle=page=>page.getByRole('checkbox',{name:/^Snapshot from /});
const demoToggle=page=>page.getByRole('checkbox',{name:'Demo live status',exact:true});
async function loadSnapshot(page,file){
 await closeTools(page);await page.locator('#editor-tab-file').click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Load snapshot…',exact:true}).click();
 await (await chooser).setFiles(file);
}

test('W1 W2 File → Load snapshot shows the snapshot as Snapshot from <time>, and nothing of it is exported',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');
 const text=JSON.stringify(raw,null,2);await paste(page,text);await prepareEditorSurface(page);
 const view=page.locator('#docview'),panel=view.locator('.pt-live-status');
 // Contrasting precondition: without a snapshot there is no Snapshot choice and no paint.
 await expect(snapshotToggle(page)).toHaveCount(0);await expect(node(view,'mcu')).not.toHaveClass(/dv-live-blocked/);
 // The board's own live-status markup (ticket buttons and the like) is in every export; only snapshot paint must not be.
 const baseline=liveTokens(await downloadSvg(page));
 const file=info.outputPath('doorbell.snapshot.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(snapshotFile()));
 await loadSnapshot(page,file);
 await expect(snapshotToggle(page)).toBeChecked();await expect(demoToggle(page)).not.toBeChecked();
 const status=page.locator('#live-snapshot-status');await expect(status).toContainText('Showing Snapshot from');await expect(status).toContainText('7 tickets');
 // FW-45 is blocked in the snapshot; the controller node holds FW-45 and FW-46.
 await expect(node(view,'mcu')).toHaveClass(/dv-live-blocked/);await expect(node(view,'button')).toHaveClass(/dv-live-done/);
 const connection=panel.locator('.dv-live-connection');await expect(connection).toHaveAttribute('data-state','snapshot');await expect(connection).toHaveText(/^Snapshot from /);
 await expect(panel.locator('.dv-live-metrics-connection')).toHaveText(/^Metrics: snapshot from /);
 const card=view.locator('g.dv-metrics-card[data-metrics-card="mcu->ingest"]');await expect(card).toHaveCount(1);await expect(card).toContainText(/1[,.]?462/);
 await expect(panel.locator('tr[data-live-ticket="FW-45"] .dv-live-ticket-title')).toHaveText('Snapshot title FW-45');
 await page.screenshot({path:info.outputPath('snapshot-workbench.png')});
 // One choice at a time.
 await demoToggle(page).check();await expect(snapshotToggle(page)).not.toBeChecked();await expect(panel.locator('.dv-live-connection')).toHaveAttribute('data-state','demo');
 await expect(status).toContainText('Loaded, not shown');
 await snapshotToggle(page).check();await expect(demoToggle(page)).not.toBeChecked();await expect(panel.locator('.dv-live-connection')).toHaveAttribute('data-state','snapshot');
 // Off again brings back the demo the author had on (review c1); with both off nothing is painted.
 await snapshotToggle(page).uncheck();await expect(demoToggle(page)).toBeChecked();await demoToggle(page).uncheck();await expect(node(view,'mcu')).not.toHaveClass(/dv-live-blocked/);await snapshotToggle(page).check();
 // W2: the snapshot never reaches the document or an export.
 await expect(page.locator('#src')).toHaveValue(text);
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
 const files=await projectFiles(await pending);
 for(const [name,body] of Object.entries(files))for(const leak of ['Snapshot title','Snapshot Person','flowview-live-snapshot','Doorbell epic from the snapshot'])expect(body.includes(leak),name+' holds "'+leak+'"').toBe(false);
 // The diagram-only SVG is copied from the preview: refused while the snapshot shows.
 let downloads=0;page.on('download',()=>downloads++);
 await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();
 await expect(page.locator('#guide')).toContainText('SVG export is off while the preview shows a snapshot');await page.waitForTimeout(500);expect(downloads).toBe(0);
 await snapshotToggle(page).uncheck();await expect(node(view,'mcu')).not.toHaveClass(/dv-live-blocked/);
 const svg=await downloadSvg(page);
 expect(liveTokens(svg),'the same live-status names as before any snapshot').toEqual(baseline);
 for(const paint of ['dv-live-todo','dv-live-active','dv-live-testing','dv-live-done','dv-live-blocked','dv-live-missing','--dv-live-ink'])expect(svg.includes(paint) && !baseline.includes(paint),'snapshot paint "'+paint+'" in the SVG').toBe(false);
 for(const leak of ['1,462','Snapshot title','Snapshot Person'])expect(svg.includes(leak),'the SVG holds "'+leak+'"').toBe(false);
});

test('W4 turning the snapshot off brings back Demo live status and Preview metrics layout',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
 await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
 const view=page.locator('#docview'),connection=view.locator('.pt-live-status .dv-live-connection');
 await demoToggle(page).check();await metricsToggle(page).check();await expect(connection).toHaveAttribute('data-state','demo');await expect(metricsToggle(page)).toBeChecked();
 const file=info.outputPath('doorbell.snapshot.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(snapshotFile()));
 await loadSnapshot(page,file);
 await expect(snapshotToggle(page)).toBeChecked();await expect(demoToggle(page)).not.toBeChecked();await expect(connection).toHaveAttribute('data-state','snapshot');
 await expect(metricsToggle(page)).not.toBeChecked();await expect(metricsToggle(page)).toBeDisabled();
 await snapshotToggle(page).uncheck();
 await expect(demoToggle(page)).toBeChecked();await expect(connection).toHaveAttribute('data-state','demo');
 await expect(metricsToggle(page)).toBeChecked();await expect(metricsToggle(page)).toBeEnabled();
});

test('W3 a snapshot next to the board in the working folder is offered, not turned on',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 const text=JSON.stringify(raw,null,2),snapshot=JSON.stringify(snapshotFile());
 await page.addInitScript(()=>{window.showDirectoryPicker=async()=>navigator.storage.getDirectory();});
 await page.goto(server.origin+'/workbench.html');
 await page.evaluate(async({text,snapshot})=>{const root=await navigator.storage.getDirectory();
  for(const [name,body] of [['doorbell.spec.json',text],['doorbell.snapshot.json',snapshot]]){const handle=await root.getFileHandle(name,{create:true}),stream=await handle.createWritable();await stream.write(body);await stream.close();}},{text,snapshot});
 await paste(page,text);await prepareEditorSurface(page);
 await closeTools(page);await page.locator('#editor-tab-file').click();await page.locator('#working-folder-open').click();
 const dialog=page.locator('dialog[open]');if(await dialog.count()){await dialog.locator('select').selectOption('doorbell.spec.json');await dialog.getByRole('button',{name:'Open',exact:true}).click();}
 await expect(page.locator('#workbench-working-status')).toContainText('doorbell.spec.json');
 const view=page.locator('#docview');
 await expect(snapshotToggle(page)).toBeVisible();await expect(snapshotToggle(page)).not.toBeChecked();await expect(node(view,'mcu')).not.toHaveClass(/dv-live-blocked/);
 await snapshotToggle(page).check();await expect(node(view,'mcu')).toHaveClass(/dv-live-blocked/);
});

/* #1272 review minors (follow-up).
| row | fixture | assertion | rejects |
|---|---|---|---|
| W5 a refusal stays | a file that is not a snapshot, then Demo live status checked | the "Snapshot not loaded: …" line is still there after the Demo change | a refusal wiped by an unrelated toggle |
| W6 coverage follows edits | the snapshot loaded, then a ticket the snapshot lacks added to the board in the JSON | the status line says 7 of this board's 8 tickets are in it | a count from before the edit | */
test('W5 W6 the snapshot status line keeps a refusal through a Demo change and follows the board through an edit',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
 const text=JSON.stringify(raw,null,2);await paste(page,text);await prepareEditorSurface(page);
 const status=page.locator('#live-snapshot-status'),bad=info.outputPath('not-a-snapshot.json'),good=info.outputPath('doorbell.snapshot.json');
 await mkdir(path.dirname(bad),{recursive:true});await writeFile(bad,JSON.stringify({version:1,days:[]}));await writeFile(good,JSON.stringify(snapshotFile()));
 await loadSnapshot(page,bad);await expect(status).toContainText('Snapshot not loaded: The file is not a Flowview live snapshot');
 await demoToggle(page).check();await expect(page.locator('#docview .pt-live-status .dv-live-connection')).toHaveAttribute('data-state','demo');
 await expect(status).toContainText('Snapshot not loaded: The file is not a Flowview live snapshot');await expect(status).toHaveAttribute('data-kind','error');
 await demoToggle(page).uncheck();
 // W6: the board gains a ticket the snapshot does not hold.
 await loadSnapshot(page,good);await expect(status).toContainText('Showing Snapshot from');await expect(status).not.toContainText('of this board');
 const edited=JSON.parse(text),nodes=edited.page.sections.map(s=>s.diagram && s.diagram.nodes).find(n=>n && n.ingest);nodes.ingest.tickets=nodes.ingest.tickets.concat(['NEW-1']);
 await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(edited,null,2));await page.locator('#go').click();
 await expect(status).toContainText('7 of this board\'s 8 tickets are in it');
});

/* #1279 review: a snapshot that cannot be read for the board when the preview draws.
| row | fixture | assertion | rejects |
|---|---|---|---|
| W7 a render-time read failure is named | a snapshot whose HW-123 carries a pull-request link marked W7-THROW; it loads normally, then the page's JSON.stringify throws only for output holding the marker, and the preview redraws with Snapshot still wanted (Update preview) | the line says "Snapshot not shown: doorbell.snapshot.json could not be read for this board.", data-kind error, no exception text; the Snapshot box is unticked; the throw fired at least once and only inside liveStatusDemoMap (the reader's per-render copy of prs.links) | a silent untick |
No file reaches this path (every ticket is read once at load), so the test makes the render-time copy throw. The reader
names are local to the page script, so the test patches only JSON.stringify, which it restores in a finally. */
test('W7 a snapshot that cannot be read when the preview draws is named in plain words and left unticked',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
 await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
 const data=snapshotFile();data.days[0].issues['HW-123'].prs={count:1,state:'open',links:[{url:'W7-THROW'}]};
 const file=info.outputPath('doorbell.snapshot.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data));
 await loadSnapshot(page,file);await expect(snapshotToggle(page)).toBeChecked();
 const status=page.locator('#live-snapshot-status');await expect(status).toContainText('Showing Snapshot from');
 try{
  await page.evaluate(()=>{
   const original=JSON.stringify;window.__w7={original,stacks:[]};
   JSON.stringify=function(){const out=original.apply(this,arguments);
    if(typeof out==='string' && out.includes('W7-THROW')){const failure=new TypeError('W7 marker copy refused');window.__w7.stacks.push(String(failure.stack));throw failure;}
    return out;};
  });
  // Redraw with Snapshot still wanted: Update preview, never an untick and re-tick.
  await page.locator('#editor-tab-json').click();await page.locator('#go').click();
  await expect(status).toHaveText('Snapshot not shown: doorbell.snapshot.json could not be read for this board.');await expect(status).toHaveAttribute('data-kind','error');
  await expect(snapshotToggle(page)).not.toBeChecked();
  const stacks=await page.evaluate(()=>window.__w7.stacks);
  expect(stacks.length).toBeGreaterThan(0);
  for(const stack of stacks)expect(stack).toContain('liveStatusDemoMap');
 }finally{
  await page.evaluate(()=>{if(window.__w7)JSON.stringify=window.__w7.original;});
 }
});
