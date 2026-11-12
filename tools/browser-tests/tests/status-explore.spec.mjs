/* #1366: status boards in Explore. Each test takes an existing live-status fixture, adds a Standard View and an
   Explore View with the same tiles, opens the Explore View and checks one area of the Status panel there.
| row | fixture | assertion (in Explore) | rejects |
|---|---|---|---|
| X1 | the doorbell example board (examples/live-status), host Jira provider refreshing every 30 s | the Status panel floats over the canvas; node and edge carriers wear their Jira states; a refresh repaints them and the Tickets table; the panel moves and resizes; the Panels menu hides and restores it | a Status panel or carrier paint that only works in Standard |
| X2 | the doorbell story with its demo timeline (#live=demo) | Next day in the Status panel advances the day note and repaints carriers | a demo that cannot drive the Explore canvas |
| X3 | the doorbell board pasted in the Workbench, File → Load snapshot… | the snapshot states paint the Explore canvas and the connection line says Snapshot from … | a snapshot that only paints Standard |
| X4 | the telemetry proof board (helpers/telemetry-proof.mjs) | Metrics on: cards on the Explore canvas, Proof rows in the panel; Over time loads the history once and moves the cards to a day | metrics that do not reach the Explore canvas |
| X5 | the Load trace log-search board (trace-log-lookup.spec.mjs) | Trace view: Find log lines, Load trace on a row, the line's span is focused | a Trace view that breaks in a floating window |
| X6 | the board-edit board (helpers/board-edit.mjs), editor runtime | Edit in the Status panel; dragging a NOT ON DIAGRAM ticket onto a node on the Explore canvas and Save publishes it on that node | Edit mode that cannot target the Explore canvas |
Desktop only (1440 px). */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {setup as metricsBoard} from '../helpers/telemetry-proof.mjs';
import {boardSpec,buildBoard,mockRuntime,openBoard,ticketRow,cardPoint,nodeCard,dragTicket,startEditing,save} from '../helpers/board-edit.mjs';

const EXAMPLE=JSON.parse(await readFile(path.join(repo,'examples/live-status/live-status.spec.json'),'utf8'));
// A Standard View and an Explore View with the diagram's own tiles (its legacy sectionLayout, else a default grid).
function addExplore(d){
 const panels=(d.panels || []).map(p=>p.id),steps=(d.steps || []).length>0,share=Math.max(4,Math.floor(24/Math.max(1,panels.length)));
 const tiles=d.sectionLayout && Array.isArray(d.sectionLayout.default)?d.sectionLayout.default:
  [{x:0,y:0,w:16,h:steps?18:24},...(steps?[{controls:'steps',x:0,y:18,w:16,h:6}]:[]),...panels.map((id,i)=>({panel:id,x:16,y:i*share,w:8,h:share}))];
 const columns=d.sectionLayout && d.sectionLayout.columns;
 const layout=extra=>({sectionLayout:{...(columns?{columns}:{}),default:structuredClone(tiles)},...extra});
 d.layouts=[layout({id:'standard',name:'Standard',presentation:'standard'}),layout({id:'explore',name:'Explore',presentation:'explore'})];
 d.defaultLayout='standard';delete d.sectionLayout;return d;
}
function exampleWithExplore(){const spec=structuredClone(EXAMPLE);addExplore(spec.page.sections[0].diagram);return spec;}
async function inject(server,name,spec,extra=[]){
 const file=path.join(server.root,name+'.json'),out=path.join(server.root,name+'.html');await writeFile(file,JSON.stringify(spec));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out,...extra]);return server.origin+'/'+name+'.html';
}
// The reader's Explore View: its tab in the toolbar's Views strip (the in-section Views buttons are hidden while
// the reader toolbar carries them), else the Choose View picker; then the Explore stage.
async function enterExplore(scope){
 const page=scope.page(),tab=page.locator('.reader-view-strip [role="tab"]').filter({hasText:/^Explore$/}).first(),picker=page.locator('select.reader-view-picker').first();
 await expect(tab.or(picker).first()).toBeVisible();
 if(await tab.isVisible())await tab.click();else await picker.selectOption({label:'Explore'});
 await expect(scope.locator('.explore-stage').first()).toBeVisible();
}
const statusWindow=scope=>scope.locator('[data-explore-panel="status"]');
// The visible Explore canvas's node and edge.
const node=(scope,id)=>scope.locator('.explore-stage g.node[data-dv-node="'+id+'"]').first();
const edge=(scope,index)=>scope.locator('.explore-stage path.edge[data-dv-edge="'+index+'"]').first();
const shot=async(page,info,name)=>info.attach(name,{body:await page.screenshot(),contentType:'image/png'});

test('X1 Explore: Jira carriers, a refresh, panel move and resize, and the Panels menu',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.clock.install();
 const maps=[{'HW-123':{state:'active'},'FW-45':{state:'done'},'FW-46':{state:'todo'},'HW-124':{state:'blocked'},'BE-67':{state:'done'},'BE-68':{state:'active'},'UX-89':{state:'todo'}},
  {'HW-123':{state:'done'},'FW-45':{state:'done'},'FW-46':{state:'done'},'HW-124':{state:'done'},'BE-67':{state:'done'},'BE-68':{state:'done'},'UX-89':{state:'done'}}];
 await page.addInitScript(maps=>{try{localStorage.setItem('dv_tour_v1','done');}catch(e){}window.liveCalls=0;window.flowviewLiveStatus={refreshMs:30000,provider:async()=>structuredClone(maps[Math.min(window.liveCalls++,maps.length-1)])};},maps);
 await page.goto(await inject(server,'status-explore-jira',exampleWithExplore()));
 const root=page.locator('#docview');await expect(root.locator('.pt-live-status').first()).toBeVisible();
 await enterExplore(root);const status=statusWindow(root);await expect(status).toBeVisible();
 await expect(status.locator('table.dv-live-tickets')).toBeVisible();
 await expect(node(root,'button'),'node carrier paint').toHaveClass(/\bdv-live-active\b/);await expect(node(root,'chime')).toHaveClass(/\bdv-live-blocked\b/);
 await expect(edge(root,0),'edge carrier paint').toHaveClass(/\bdv-live-blocked\b/);
 await expect(status.locator('tr[data-live-ticket="HW-123"]')).toContainText('active');
 await shot(page,info,'x1-jira');
 // The 30 s host refresh repaints the Explore canvas and the floating panel.
 await page.clock.fastForward(31000);await expect.poll(()=>page.evaluate(()=>window.liveCalls),{message:'refresh ran'}).toBeGreaterThanOrEqual(2);
 await expect(node(root,'button'),'refresh repaints the node').toHaveClass(/\bdv-live-done\b/);await expect(edge(root,0)).toHaveClass(/\bdv-live-done\b/);
 await expect(status.locator('tr[data-live-ticket="HW-123"]')).toContainText('done');
 // Move by the grip and resize by the corner.
 const before=await status.boundingBox(),grip=await status.locator('.explore-window-grip').boundingBox();
 await page.mouse.move(grip.x+20,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x-180,grip.y+80,{steps:6});await page.mouse.up();
 const moved=await status.boundingBox();expect(moved.x,'the panel moved left').toBeLessThan(before.x-100);
 const corner=await status.locator('.explore-window-resize').boundingBox();
 await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();await page.mouse.move(corner.x+corner.width/2+120,corner.y+corner.height/2+60,{steps:6});await page.mouse.up();
 const resized=await status.boundingBox();expect(resized.width,'the panel resized wider').toBeGreaterThan(moved.width+60);
 await expect(status.locator('table.dv-live-tickets')).toBeVisible();
 await shot(page,info,'x1-moved-resized');
 // Panels menu: hide the Status panel, then show it again.
 await root.locator('.explore-panel-menu summary').first().click();
 const choice=root.locator('.explore-panel-choices label').filter({hasText:'Epic status'}).getByRole('checkbox');await expect(choice).toBeChecked();
 await choice.uncheck();await expect(status).toBeHidden();await choice.check();await page.keyboard.press('Escape');await expect(status).toBeVisible();
 await expect(node(root,'button'),'paint survives the menu').toHaveClass(/\bdv-live-done\b/);
});

test('X2 Explore: the demo story advances its days',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(e){}});
 const url=await inject(server,'status-explore-demo',exampleWithExplore(),['--timeline',path.join(repo,'examples/live-status/live-status.timeline.json')]);
 await page.goto(url+'#live=demo');const root=page.locator('#docview');await expect(root.locator('.dv-live-note').first()).toHaveText('Day 1 — kickoff');
 await enterExplore(root);const status=statusWindow(root),next=status.getByRole('button',{name:'Next day',exact:true});await expect(next).toBeVisible();
 await expect(status.locator('.dv-live-note')).toHaveText('Day 1 — kickoff');const first=await node(root,'button').getAttribute('class');
 for(let day=2;day<=12;day++)await next.click();
 await expect(status.locator('.dv-live-note')).not.toHaveText('Day 1 — kickoff');
 await expect.poll(()=>node(root,'button').getAttribute('class'),{message:'the demo repaints the Explore canvas'}).not.toBe(first);
 await shot(page,info,'x2-demo');
});

test('X3 Explore in the Workbench preview: a loaded snapshot paints the canvas',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
 await paste(page,JSON.stringify(exampleWithExplore(),null,2));await prepareEditorSurface(page);
 const view=page.locator('#docview');await enterExplore(view);
 const AT='2026-11-10T11:02:00.000Z',issue=state=>({state,summary:'Snapshot '+state,assignee:'Snapshot Person',updated:'2026-11-10T10:00:00.000+0000',epic:'DOOR-100'});
 const snapshot={version:1,kind:'flowview-live-snapshot',snapshotAt:AT,board:'doorbell.spec.json',intervalSeconds:6,epics:{'DOOR-100':{summary:'Doorbell epic'}},
  days:[{label:'Snapshot from '+AT,issues:{'HW-123':issue('done'),'FW-45':issue('blocked'),'FW-46':issue('active'),'HW-124':issue('done'),'BE-67':issue('active'),'BE-68':issue('todo'),'UX-89':issue('todo')}}],errors:[]};
 const file=info.outputPath('doorbell.snapshot.json');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(snapshot));
 await closeTools(page);await page.locator('#editor-tab-file').click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Load snapshot…',exact:true}).click();await (await chooser).setFiles(file);
 await expect(page.getByRole('checkbox',{name:/^Snapshot from /})).toBeChecked();
 await expect(view.locator('.explore-stage'),'still in Explore').toBeVisible();
 await expect(node(view,'mcu'),'snapshot paint on the Explore canvas').toHaveClass(/\bdv-live-blocked\b/);await expect(node(view,'button')).toHaveClass(/\bdv-live-done\b/);
 await expect(statusWindow(view).locator('.dv-live-connection')).toHaveAttribute('data-state','snapshot');
 await shot(page,info,'x3-snapshot');
});

test('X4 Explore: Metrics cards on the canvas, Proof, and Over time',async({page,server},info)=>{
 // Wrap the native mount so the proof board gains the two Views (setup builds and mounts the board itself).
 await page.addInitScript(()=>{
  let real=null;const add=raw=>{const spec=JSON.parse(JSON.stringify(raw)),d=spec.page.sections[0].diagram,panels=(d.panels || []).map(p=>p.id),steps=(d.steps || []).length>0;
   const tiles=[{x:0,y:0,w:16,h:steps?18:24},...(steps?[{controls:'steps',x:0,y:18,w:16,h:6}]:[]),...panels.map((id,i)=>({panel:id,x:16,y:i*8,w:8,h:8}))];
   d.layouts=[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{default:tiles}},{id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:JSON.parse(JSON.stringify(tiles))}}];d.defaultLayout='standard';return spec;};
  Object.defineProperty(window,'mount',{configurable:true,get(){return real && ((host,raw,opts)=>real(host,add(raw),opts));},set(fn){real=fn;}});
 });
 const root=await metricsBoard(page,server);await enterExplore(root);const status=statusWindow(root);await expect(status).toBeVisible();
 await status.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 await expect(root.locator('.explore-stage .dv-metrics-card').first(),'metrics cards on the Explore canvas').toBeVisible();
 await expect(status.locator('.dv-live-proof-row')).toHaveCount(6);
 const card=root.locator('.explore-stage [data-metrics-card="ingest->app"]');await expect(card,'Live value on the Explore canvas').toContainText('100 req/h');
 await shot(page,info,'x4-metrics');
 await status.getByRole('button',{name:'Over time',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.calls.history.length),{message:'Over time loads the history'}).toBe(1);
 // Move to day 2, then day 0: the panel names the day and the canvas card shows that day's value.
 const slider=status.getByRole('slider',{name:'Day',exact:true}),day=async index=>{await slider.focus();await slider.press('Home');for(let i=0;i<index;i++)await slider.press('ArrowRight');await expect(slider).toHaveValue(String(index));};
 await day(2);await expect(status.locator('.dv-live-over-time-day')).toHaveText('Day 2');await expect(card,'day 2 value on the Explore canvas').toContainText('50 req/h');
 await day(0);await expect(status.locator('.dv-live-over-time-day')).toHaveText('Day 0');await expect(card,'day 0 verdict on the Explore canvas').toHaveAttribute('data-verdict','done-unproven');await expect(card).not.toContainText('50 req/h');
 await shot(page,info,'x4-over-time');
});

test('X5 Explore: Trace view log search, trace load and span focus',async({page,server},info)=>{
 const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
 const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8');
 const ID='8413cd87a9f15b6bfe8e1acf5b3346d0',SPAN='011114cbd1fd62de';
 const LINES={data:[{timestamp:'1794044533123456789',line:'Handling camera stats message',labels:{env:'stg'},structuredMetadata:{cameraModel:'arch',trace_id:ID,span_id:SPAN}}]};
 await page.setViewportSize({width:1440,height:1000});const calls=[];
 await page.exposeFunction('logTools',()=>[{server:PROFILE.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false}}]},{server:'Grafana',tools:[{name:'query_loki_logs',annotations:{readOnlyHint:true}}]}]);
 await page.exposeFunction('logDescribe',()=>({name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string',enum:['full']}},required:['trace_id','from','environment_slug','team_slug','view_mode'],additionalProperties:false}}));
 await page.exposeFunction('logPermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
 await page.exposeFunction('logCall',(server,tool,args)=>{calls.push(tool);return tool==='query_loki_logs'?{content:[{type:'text',text:JSON.stringify(LINES)}]}:{payload:RECORDED};});
 await page.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(e){}window.claude={use:async name=>name==='permissions'?{request:keys=>window.logPermission(keys)}:{listTools:()=>window.logTools(),describeTool:()=>window.logDescribe(),callTool:(s,n,a)=>window.logCall(s,n,a)}};});
 const spec={page:{title:'Camera stats',tracking:{telemetry:{grafana:{loki:'loki-$env'},environment:'stg',environments:{stg:{},prd:{}},traceConnections:{company:PROFILE},
  lookups:{camera:{label:'Camera model',query:'{env="$env"} |= "Handling camera stats message" | cameraModel="$value"',values:['arch']}}}},
  // The log line's span (frontend client msdemo.CurrencyService/GetSupportedCurrencies) belongs to the frontend node:
  // declared spans (#1290) and a step traceMatch on that node, so focusing it highlights the node on the canvas.
  sections:[{id:'main',diagram:addExplore({view:'step',autoplay:false,
   nodes:{frontend:{title:'Checkout frontend',trace:{spans:{currencies:{serviceName:'frontend',operation:'msdemo.CurrencyService/GetSupportedCurrencies',role:'call'}}}},currency:{title:'Currency service',trace:{spans:{process:{serviceName:'currency',operationPrefix:'grpc.msdemo.CurrencyService/',role:'process'}}}}},
   rows:[['frontend','currency']],edges:[{from:'frontend',to:'currency',label:'GetSupportedCurrencies'}],
   steps:[{id:'currencies',text:'Ask for the supported currencies',nodes:['frontend'],traceMatch:{serviceName:'frontend',operation:'msdemo.CurrencyService/GetSupportedCurrencies',nodeId:'frontend'}}],
   panels:[{id:'status',type:'live-status',title:'Status'}]})}]}};
 await page.goto(await inject(server,'status-explore-trace',spec));const root=page.locator('#docview');await expect(root.locator('.dv-live-trace').first()).toBeVisible();
 await enterExplore(root);const status=statusWindow(root);await expect(status.locator('.dv-live-trace')).toBeVisible();
 await status.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 const logs=status.locator('.dv-trace-logs');await logs.getByLabel('Camera model',{exact:true}).fill('arch');await logs.getByRole('button',{name:'Find log lines for Camera model',exact:true}).click();
 await expect(logs.locator('.dv-trace-log-row')).toHaveCount(1);expect(calls).toEqual(['query_loki_logs']);
 await logs.getByRole('button',{name:'Load trace '+ID,exact:true}).click();
 await expect(status.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);
 const span=status.locator('.dv-trace-span[data-span-id="'+SPAN+'"]');await expect(span,'the line\'s span is focused').toHaveAttribute('aria-pressed','true');
 await expect(span,'and shown in the floating panel').toBeInViewport();
 // The focused span is highlighted on the Explore canvas, on the node it belongs to.
 const focus=root.locator('.explore-stage g.node[data-dv-node="frontend"] .dv-trace-focus-overlay[data-trace-level="current"]');
 await expect(focus,'span highlight on the Explore canvas').toHaveCount(1);
 await expect(root.locator('.explore-stage .dv-trace-focus-overlay[data-trace-level="current"]'),'only that node').toHaveCount(1);
 await shot(page,info,'x5-trace');
});

test('X6 Explore: board Edit mode drops a ticket on a node of the Explore canvas and saves',async({page,server},info)=>{
 const spec=boardSpec();addExplore(spec.page.sections[0].diagram);const board=await buildBoard(server,'explore-edit',spec);await mockRuntime(page);
 await page.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(e){}});
 const {root}=await openBoard(page,board);await page.setViewportSize({width:1440,height:1000});await enterExplore(root);
 const status=statusWindow(root);await expect(status.locator('table.dv-live-tickets')).toBeVisible();
 await startEditing(status);await expect(ticketRow(status,'EX-1')).toHaveAttribute('draggable','true');
 const target=nodeCard(root.locator('.explore-stage'),'b');await dragTicket(page,status,'EX-1',await cardPoint(target));
 await shot(page,info,'x6-edit-dropped');
 const text=await save(page,status,1),saved=JSON.parse(text);
 expect(saved.page.sections[0].diagram.nodes.b.tickets,'saved on the Explore canvas node').toEqual(['EX-1']);
 expect(saved.page.sections[0].diagram.layouts.map(l=>l.id),'the Views are kept').toEqual(['standard','explore']);
});
