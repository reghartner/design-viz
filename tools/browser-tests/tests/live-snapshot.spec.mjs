/* #1265 part B: an agent's snapshot (tools/live-snapshot.js) shown in the desktop Workbench preview.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| W1 Load snapshot | the doorbell example board pasted; File → Load snapshot… with a snapshot file | the "Snapshot from <time>" checkbox appears checked beside Demo live status; carriers wear the snapshot states; the Epic status connection line reads "Snapshot from …" with data-state snapshot; the Metrics line reads "Metrics: snapshot from …"; the ingest carrier has a metrics card; Demo turns Snapshot off and Snapshot turns Demo off | snapshot data shown as Demo or as live; a control that only appears in the source |
| W2 never exported | W1, then Export project | the editor source is unchanged and no exported file holds a snapshot title, assignee or the snapshot kind | snapshot data leaking into a saved, exported or published board |
| W3 offered next to the board | a working folder holding doorbell.spec.json and doorbell.snapshot.json | after Choose working folder… the "Snapshot from <time>" checkbox is offered unchecked and the carriers are not painted; checking it paints them | a snapshot that turns itself on |
All three fail at the baseline: there is no Load snapshot… control and no Snapshot choice. */
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
   telemetry:{start:'2026-11-10T10:44:00.000Z',stepSeconds:360,carriers:{ingest:{rate:{values,unit:'req/h'},errors:{values:[0,0,1],unit:'req/h'}}}}}],errors:[]};
}
const node=(view,id)=>view.locator('g.node[data-dv-node="'+id+'"]').first();
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
 const file=info.outputPath('doorbell.snapshot.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(snapshotFile()));
 await loadSnapshot(page,file);
 await expect(snapshotToggle(page)).toBeChecked();await expect(demoToggle(page)).not.toBeChecked();
 // FW-45 is blocked in the snapshot; the controller node holds FW-45 and FW-46.
 await expect(node(view,'mcu')).toHaveClass(/dv-live-blocked/);await expect(node(view,'button')).toHaveClass(/dv-live-done/);
 const connection=panel.locator('.dv-live-connection');await expect(connection).toHaveAttribute('data-state','snapshot');await expect(connection).toHaveText(/^Snapshot from /);
 await expect(panel.locator('.dv-live-metrics-connection')).toHaveText(/^Metrics: snapshot from /);
 await expect(view.locator('g.dv-metrics-card[data-metrics-card="ingest"]')).toHaveCount(1);
 await expect(panel.locator('tr[data-live-ticket="FW-45"] .dv-live-ticket-title')).toHaveText('Snapshot title FW-45');
 await page.screenshot({path:info.outputPath('snapshot-workbench.png')});
 // One choice at a time.
 await demoToggle(page).check();await expect(snapshotToggle(page)).not.toBeChecked();await expect(panel.locator('.dv-live-connection')).toHaveAttribute('data-state','demo');
 await snapshotToggle(page).check();await expect(demoToggle(page)).not.toBeChecked();await expect(panel.locator('.dv-live-connection')).toHaveAttribute('data-state','snapshot');
 await snapshotToggle(page).uncheck();await expect(node(view,'mcu')).not.toHaveClass(/dv-live-blocked/);await snapshotToggle(page).check();
 // W2: the snapshot never reaches the document or an export.
 await expect(page.locator('#src')).toHaveValue(text);
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
 const files=await projectFiles(await pending);
 for(const [name,body] of Object.entries(files))for(const leak of ['Snapshot title','Snapshot Person','flowview-live-snapshot','Doorbell epic from the snapshot'])expect(body.includes(leak),name+' holds "'+leak+'"').toBe(false);
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
