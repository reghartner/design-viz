import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {canonTraceFixture} from '../../../tests/helpers/canon-trace-evidence.mjs';
import {stepFixture,recordedUrlEvidence,AT} from '../../../tests/helpers/step-evidence.mjs';
import {importedDetailSpec,nestedSpec,PANEL} from '../helpers/telemetry-cards.mjs';
const metric=r=>r.getByRole('switch',{name:'Metrics overlay',exact:true});
const card=r=>r.locator('.dv-trace-evidence');
const step=r=>r.getByRole('button',{name:'Step',exact:true});
const ambient=r=>r.getByRole('button',{name:'Ambient',exact:true});
const over=r=>r.getByRole('button',{name:'Over time',exact:true});
let saved;
async function setup(page,server,options={}){
 const f=options.canonical?await canonTraceFixture():structuredClone(saved || (saved=await stepFixture()));
 if(options.origin && options.origin!=='local'){
  const source=options.origin==='direct'?importedDetailSpec():nestedSpec(),section=source.page.sections.find(s=>s.id===(options.origin==='direct'?'selected':'main')),d=section.diagram;
  const edge=d.edges[0],key=edge.from+'->'+edge.to,node=edge.to;
  d.view='step';d.autoplay=false;d.panels=[PANEL];d.edges.forEach(e=>e.telemetry=structuredClone(f.spec.page.sections[0].diagram.edges[0].telemetry));
  d.nodes[node].telemetry=structuredClone(edge.telemetry);d.nodes[node].tickets=['TRACE-1'];edge.tickets=['TRACE-1'];
  d.steps=[{id:'submit',text:'Selected imported request',edge:key,traceMatch:{serviceName:'event-ingest',operation:'POST /v1/events',nodeId:node}},{id:'push',text:'Expected missing request',edge:key,traceMatch:{serviceName:'notify',operation:'push notification'}},{id:'node',text:'Selected imported node',nodes:[node],traceMatch:{serviceName:'event-ingest',operation:'POST /v1/events'}},{id:'unbound',text:'No telemetry',nodes:[edge.from]}];
  d.paths=[{id:'event',label:'Imported edge',steps:['submit','push','unbound']},{id:'node-path',label:'Imported node',steps:['node','unbound']}];
  const sample=f.samples['mcu->ingest'];f.samples=Object.fromEntries(d.edges.map(e=>[e.from+'->'+e.to,structuredClone(sample)]));f.samples[node]=structuredClone(sample);
  f.spec.page.sections=[{id:'main',heading:'Imported explicit mappings',diagram:d}];f.primary=key;
 }
 if(options.origin==='local'){const d=f.spec.page.sections[0].diagram;d.nodes.ingest.telemetry=structuredClone(d.edges[0].telemetry);d.nodes.ingest.tickets=['TRACE-1'];f.samples.ingest=structuredClone(f.samples['mcu->ingest']);d.steps.push({id:'node',text:'Selected imported node',nodes:['ingest'],traceMatch:{serviceName:'event-ingest',operation:'POST /v1/events'}});d.paths.push({id:'node-path',label:'Local node',steps:['node','unbound']});}
 if(options.mixed){const d=f.spec.page.sections[0].diagram;delete d.steps[0].edge;d.steps[0].edges=['mcu->ingest','ingest->notify'];d.edges[1].tickets=['TRACE-1'];d.edges[1].telemetry.proof.rate={max:1};f.samples['ingest->notify'].signals.rate={value:20};}
 if(options.sameIds){const other=structuredClone(f.spec.page.sections[0]);other.id='other';f.spec.page.sections.push(other);}
 if(options.duplicate){
  const other=JSON.parse(JSON.stringify(f.spec.page.sections[0]).replaceAll('mcu','other-mcu').replaceAll('ingest','other-ingest').replaceAll('notify','other-notify').replaceAll('app','other-app'));other.id='other';other.heading='Independent duplicate step IDs';f.spec.page.sections.push(other);
  for(const [key,value] of Object.entries(structuredClone(f.samples))){const id=key.replaceAll('mcu','other-mcu').replaceAll('ingest','other-ingest').replaceAll('notify','other-notify').replaceAll('app','other-app');value.signals.rate={value:0};delete value.exemplars;f.samples[id]=value;}
 }
 if(options.noPanel)f.spec.page.sections[0].diagram.panels=[];
 if(options.views){const d=f.spec.page.sections[0].diagram;d.layouts=['one','two'].map(id=>({id,name:id==='one'?'Full view':'Alternate view',sectionLayout:{columns:24,default:[{x:0,y:0,w:16,h:18},{controls:'steps',attachTo:'diagram',x:0,y:18,w:16,h:6},{panel:'status',x:16,y:0,w:8,h:24}]}}));d.defaultLayout='one';}
 if(options.recordedUrl)f.samples['mcu->ingest'].exemplars=[await recordedUrlEvidence()];
 if(options.traceOnly)Object.values(f.samples).forEach(s=>s.signals={});
 if(options.noTrace)Object.values(f.samples).forEach(s=>delete s.exemplars);
 if(options.noTimeline)Object.values(f.samples).forEach(s=>s.exemplars?.forEach(e=>{e.spans=[];e.completeness='unknown';}));
 if(options.unknown)Object.values(f.samples).forEach(s=>s.exemplars?.forEach(e=>{e.candidates.forEach(c=>c.status='unknown');delete e.url;}));
 if(options.disabled==='page')f.spec.page.tracking.telemetry={enabled:false};
 if(options.timed){
  const e=f.samples['mcu->ingest'].exemplars[0],base=e.spans[0],recordedId=e.traceId;
  // Labeled synthetic boundary case: actual animation assertions need visible
  // durations, overlapping attempts, and zero. Screenshots use only mock story.
  e.traceId='947'.padEnd(32,'0');e.selectionReason='Synthetic animation boundary fixture';e.completeness='unknown';delete e.url;
  e.candidates=[{traceId:e.traceId,time:base.time,status:'unknown'},...e.candidates.filter(c=>c.traceId!==recordedId)];
  e.warnings=['Synthetic timing spans: coherent absolute timestamps, overlapping attempts and true zero; not a recorded request.'];
  e.spans=[{id:'a'.repeat(16),startMs:0,ms:600},{id:'b'.repeat(16),startMs:150,ms:800},{id:'c'.repeat(16),startMs:300,ms:0}].map((timing,i)=>({...base,...timing,parentId:null,time:new Date(Date.parse(base.time)+timing.startMs).toISOString(),attributes:{'retry.attempt':i},events:[],links:[]}));
  f.spec.page.title='Synthetic animation boundary fixture';f.spec.page.sections[0].heading='Synthetic packet timing · coherent clocks';
  f.spec.page.sections[0].diagram.steps[0].traceMatch.repeat='attempts';
 }
 await page.setViewportSize({width:1600,height:1200});
 await writeFile(path.join(server.root,'step-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'step-native.html'),'<div id="host"></div><div id="sibling"></div><script type="module">import {mountNativeViewer} from "./step-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/step-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({f,options,AT})=>{
  Date.now=()=>Date.parse(AT);window.fixture=f;window.before=JSON.stringify(f.spec);window.calls={provider:0,choose:0,history:0,loads:0};window.allowed=true;window.releases=[];
  const provider=async()=>{window.calls.provider++;return structuredClone(f.samples);};
  const telemetry={provider,canChooseExemplar:()=>window.allowed,chooseExemplar:async(id,token,traceId)=>{window.calls.choose++;if(options.holdChoose)await new Promise(resolve=>window.releaseChoice=resolve);const e={...structuredClone(f.alternatives?.[traceId] || f.alternative),selectionToken:token,traceId};f.samples[id].exemplars=[e];return e;},history:async(bindings,range)=>{window.calls.history++;return Object.fromEntries(bindings.map(b=>[b.id,{signals:{rate:{series:[[Date.parse('2026-10-28T00:00:00Z'),0],[Date.parse(AT),30]]}}}]));}};
  if(options.noHandler)delete telemetry.canChooseExemplar;
  let spec=f.spec;
  if(options.loaded){
   window.detail=structuredClone(f.spec);window.detail.page.sections[0].id='selected';window.detail.page.sections.unshift({id:'decoy',heading:'Wrong detail',diagram:{nodes:{a:{title:'Decoy'}},rows:[['a']],steps:[{id:'submit',nodes:['a'],text:'Wrong step'}]}});
   spec={page:{title:'Async detail host',tracking:structuredClone(f.spec.page.tracking),sections:[{id:'main',diagram:{nodes:{parent:{title:'Imported service',detail:{spec:'detail',revision:'one',section:'selected'}}},rows:[['parent']],panels:[{id:'status',type:'live-status'}]}}]}};
  }
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:options.disabled==='host'?false:options.missing?undefined:options.preload?{}:telemetry,loadDetail:()=>{window.calls.loads++;return new Promise(resolve=>window.releases.push(()=>resolve(structuredClone(window.detail))));}});
  window.ctl=window.viewer.controller;
  window.ctl.liveStatus.apply({'TRACE-1':{state:'done',title:'Ship event handling'}});
  window.ctl.liveStatus.setHistory({load:()=>({days:[{key:'2026-10-27',at:'2026-10-28T00:00:00Z',label:'Earlier',states:{'TRACE-1':{state:'active'}}},{key:'2026-10-29',at:AT,label:'Today',states:{'TRACE-1':{state:'done'}}}],index:1})});
  if(options.preload || options.disabled)window.ctl.telemetry.apply(f.samples);
  if(options.sibling){window.sibling=window.mount(document.querySelector('#sibling'),f.spec,{telemetry:{}});window.sibling.controller.telemetry.apply(f.samples);}
 },{f,options,AT});
 let root=page.locator('#host');
 if(options.loaded){await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();await page.evaluate(()=>window.releases.shift()());root=root.locator('[data-dv-detail-preview]:visible');await expect(root).toHaveCount(1);}
 await step(root).first().click();
 return {root,f};
}
async function unchanged(page){expect(await page.evaluate(()=>JSON.stringify(window.fixture.spec)===window.before)).toBe(true);}

async function capture(page,name){const dir=path.join(repo,'.local/step-evidence/screenshots');await mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});}

const traceTab=r=>r.getByRole('button',{name:/^Trace(?: · \d+)?$/});
const selected=r=>r.locator('.dv-trace-selected');
// #1136: a board without ticket references opens on Trace and shows no Jira | Trace switch.
async function openTrace(root){if(await root.page().evaluate(()=>window.ctl.liveStatus.snapshot().available))await traceTab(root).click();else{await expect(traceTab(root)).toBeHidden();expect(await root.page().evaluate(()=>window.ctl.liveStatus.snapshot().mode)).toBe('trace');}if(await metric(root).getAttribute('aria-checked')==='false')await metric(root).click();await expect(selected(root)).toBeVisible();}

test('Status modes are exclusive; actual request selection paints SVG independently of stepping',async({page,server})=>{
 const {root,f}=await setup(page,server);await expect(root.getByRole('button',{name:'Jira',exact:true})).toHaveAttribute('aria-pressed','true');await metric(root).click();await expect(root.locator('.dv-proof-caption')).toContainText('PROVEN');await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-metrics-card').first()).toBeVisible();
 await openTrace(root);await expect(root.locator('.dv-live-tickets,.dv-live-proof,.dv-live-epic,.dv-live-activity')).toHaveCount(0);await expect(root.locator('.dv-trace-waterfall')).toHaveCount(1);await expect(root.locator('g.node[data-dv-node="ingest"]')).toHaveAttribute('data-trace-tone','error');await expect(root.locator('path.edge[data-dv-edge="0"]')).toHaveAttribute('data-trace-status','matched');await expect(root.locator('.dv-jira-cue,.dv-live-target:not(.dv-metrics-card),.dv-live-stale,.dv-live-changed')).toHaveCount(0);
 // Chuck 2026-11-08 (D13): the Metrics overlay draws in every view, beside the trace highlighting, without Jira work paint.
 await expect(root.locator('.dv-metrics-card').first()).toBeVisible();await expect(root.locator('.dv-metrics-card[data-live-appearance]')).toHaveCount(0);
 const id=f.samples['mcu->ingest'].exemplars[0].traceId,calls=await page.evaluate(()=>({...window.calls}));await capture(page,'status-trace-mode');
 await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(selected(root)).toHaveAttribute('data-trace-id',id);await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(selected(root)).toHaveAttribute('data-trace-id',id);expect(await page.evaluate(()=>window.calls)).toEqual(calls);
 await root.locator('.dv-trace-candidate[data-trace-id="'+f.alternative.traceId+'"]').first().click();await expect(selected(root)).toHaveAttribute('data-trace-id',f.alternative.traceId);await expect(root.locator('g.node[data-dv-node="ingest"]')).toHaveAttribute('data-trace-tone','observed');expect(await page.evaluate(()=>window.calls.choose)).toBe(1);
 await root.getByRole('button',{name:'Show on diagram',exact:true}).click();await expect(root.locator('[data-trace-tone]')).toHaveCount(0);await root.getByRole('button',{name:'Show on diagram',exact:true}).click();await expect(root.locator('[data-trace-tone]')).not.toHaveCount(0);
 await root.getByRole('button',{name:'Jira',exact:true}).click();await expect(root.getByRole('table',{name:'Tickets',exact:true})).toBeVisible();await expect(root.locator('.dv-jira-cue')).not.toHaveCount(0);await expect(root.locator('[data-trace-tone]')).toHaveCount(0);await traceTab(root).click();await expect(selected(root)).toHaveAttribute('data-trace-id',f.alternative.traceId);
 await expect(root.locator('.dv-metrics-card').first()).toBeVisible();await metric(root).click();await expect(metric(root)).toHaveAttribute('aria-checked','false');await expect(root.locator('.dv-metrics-card')).toHaveCount(0);await unchanged(page);
});

for(const origin of ['local','direct','nested'])for(const loaded of [false,true])test(`${origin} imports ${loaded?'async selected detail':'root'} map explicit nodes and edges with stable trace selection`,async({page,server})=>{
 const {root}=await setup(page,server,{origin,loaded});await openTrace(root);await expect(root.locator('g.node[data-trace-tone="error"]')).toHaveCount(1);await expect(root.locator('path.edge[data-trace-status="matched"]')).toHaveCount(1);
 const id=await selected(root).getAttribute('data-trace-id');await root.locator('[data-dv-path="node-path"]').first().click();await expect(selected(root)).toHaveAttribute('data-trace-id',id);await expect(root.locator('path.edge[data-trace-tone]')).toHaveCount(0);
 if(loaded){await root.locator('.detail-breadcrumb button').first().click();await expect(page.locator('#host [data-dv-detail-preview]')).toHaveCount(0);expect(await page.evaluate(()=>window.ctl.liveStatus.snapshot().trace.selected)).toBeNull();await page.locator('#host').getByRole('button',{name:'Explore Imported service',exact:true}).click();await page.evaluate(()=>window.releases.shift()());await expect(page.locator('#host [data-dv-detail-preview]')).toHaveCount(1);await expect(page.locator('#host [data-trace-tone]')).toHaveCount(0);}
 await unchanged(page);
});

for(const disabled of ['page','host'])test(`${disabled} opt-out never enables trace calls through nested imports`,async({page,server})=>{const {root}=await setup(page,server,{origin:'nested',loaded:true,disabled});await traceTab(root).click();await expect(metric(root)).toBeHidden();await expect(root.locator('.dv-trace-mode-status')).toContainText('unavailable');await expect(selected(root)).toHaveCount(0);expect(await page.evaluate(()=>window.calls.provider)).toBe(0);});

test('history, off, capability removal and destroy retire selected evidence; native sibling is isolated',async({page,server})=>{
 const {root}=await setup(page,server,{sibling:true});await openTrace(root);await root.getByRole('button',{name:'Pin as evidence',exact:true}).click();await root.getByRole('button',{name:'Jira',exact:true}).click();await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(1);await over(root).click();await traceTab(root).click();await expect(selected(root)).toHaveCount(0);await expect(root.locator('[data-trace-tone]')).toHaveCount(0);await expect(root.locator('.dv-trace-mode-status')).toContainText('Over time');
 await root.getByRole('button',{name:'Jira',exact:true}).click();await root.getByRole('button',{name:'Live',exact:true}).click();await traceTab(root).click();await root.locator('.dv-trace-candidate').first().click();await expect(selected(root)).toBeVisible();await expect(metric(root)).toHaveAttribute('aria-checked','true');await metric(root).click();await expect(selected(root)).toHaveCount(0);await expect(root.locator('[data-trace-tone]')).toHaveCount(0);
 await expect(metric(root)).toHaveAttribute('aria-checked','false');await metric(root).click();await root.locator('.dv-trace-candidate').first().click();await page.evaluate(()=>window.ctl.telemetry.retractExemplars());await expect(selected(root)).toHaveCount(0);await expect(page.locator('#sibling [data-trace-tone]')).toHaveCount(0);await page.evaluate(()=>{window.retained=document.querySelector('#host').shadowRoot;window.viewer.destroy();});expect(await page.evaluate(()=>window.retained.querySelectorAll('[data-trace-tone],.dv-trace-overlay').length)).toBe(0);await unchanged(page);
});

for(const options of [{noTrace:true},{noTimeline:true},{unknown:true},{noHandler:true},{preload:true}])test('honest trace limits and unavailable alternatives '+JSON.stringify(options),async({page,server})=>{
 const {root}=await setup(page,server,options);await traceTab(root).click();if(!options.preload){await expect(metric(root)).toHaveAttribute('aria-checked','false');await metric(root).click();}
 if(options.noTrace){await expect(selected(root)).toHaveCount(0);await expect(root.locator('.dv-trace-mode-status')).toContainText('No trace evidence');return;}
 await expect(selected(root)).toBeVisible();if(options.noTimeline){await expect(root.locator('[data-trace-tone]')).toHaveCount(0);await expect(root.locator('.dv-trace-limit')).toContainText('timeline unavailable');}
 if(options.noHandler)await expect(root.locator('.dv-trace-candidate[aria-pressed="false"]').first()).toBeDisabled();
 if(options.unknown)await expect(selected(root).getByRole('link')).toHaveCount(0);
 await unchanged(page);
});

test('safe provider URL and exact path mapping survive mode change without document edits',async({page,server})=>{const {root,f}=await setup(page,server,{recordedUrl:true});await openTrace(root);await expect(selected(root).getByRole('link',{name:'Open trace in Honeycomb'})).toHaveAttribute('href',f.samples['mcu->ingest'].exemplars[0].url);await page.evaluate(()=>{const s=structuredClone(window.fixture.samples);s['mcu->ingest'].exemplars[0].url='https://mcp.honeycomb.io/query_results/private';window.ctl.telemetry.apply(s);});await expect(selected(root).getByRole('link')).toHaveCount(0);await unchanged(page);});


test('canonical doorbell normal, slow database, service error, partial and backpressure update actual SVG',async({page,server})=>{
 const {root,f}=await setup(page,server,{canonical:true});await openTrace(root);await root.getByRole('button',{name:'Fit diagram',exact:true}).click();
 const db=root.locator('g.node[data-dv-node="database"]'),phone=root.locator('g.node[data-dv-node="phone"]'),queue=root.locator('g.node[data-dv-node="queue"]');
 await expect(db).toBeVisible();await expect(db).toHaveAttribute('data-trace-tone','observed');
 for(const [name,node,tone] of [['database-slow',db,'warning'],['service-error',root.locator('g.node[data-dv-node="cloud"]'),'error'],['partial',db,'unknown'],['backpressure',queue,'warning']]){
  await root.locator('.dv-trace-candidate[data-trace-id="'+f.ids[name]+'"]').click();await expect(selected(root)).toHaveAttribute('data-trace-id',f.ids[name]);await expect(node).toHaveAttribute('data-trace-tone',tone);
  if(name==='database-slow'){await expect(root.locator('.dv-trace-mappings')).toContainText('900 ms / 150 ms budget');const before=await page.evaluate(()=>({...window.calls}));await root.locator('.dv-trace-span').filter({hasText:'INSERT clip'}).click();await expect(root.locator('.dv-trace-operation-detail .dv-trace-duration')).toHaveText('900 ms');await expect(root.locator('.dv-trace-operation-detail')).toContainText('150 ms budget');expect(await page.evaluate(()=>window.calls)).toEqual(before);await capture(page,'canonical-database-slow');}
 }
 await unchanged(page);
});


test('late explicit alternative after off cannot restore trace selection or SVG',async({page,server})=>{
 const {root,f}=await setup(page,server,{holdChoose:true});await openTrace(root);await root.locator('.dv-trace-candidate[data-trace-id="'+f.alternative.traceId+'"]').first().click();await expect(root.locator('.dv-trace-mode-status')).toContainText('Loading selected trace');await expect(metric(root)).toHaveAttribute('aria-checked','true');await metric(root).click();await page.evaluate(()=>window.releaseChoice());await expect(selected(root)).toHaveCount(0);await expect(root.locator('[data-trace-tone]')).toHaveCount(0);expect(await page.evaluate(()=>window.ctl.liveStatus.snapshot().trace.selected)).toBeNull();
});
test('duplicate carrier IDs in distinct sections never borrow another section’s trace',async({page,server})=>{
 const {root}=await setup(page,server,{sameIds:true});const first=root.locator('#section-main');await traceTab(first).click();await expect(metric(first)).toHaveAttribute('aria-checked','false');await metric(first).click();await expect(first.locator('.dv-trace-mode-status')).toContainText('duplicate carrier IDs');await expect(root.locator('[data-trace-tone]')).toHaveCount(0);expect(await page.evaluate(()=>window.ctl.liveStatus.snapshot().trace.entries.length)).toBe(0);
});

test('reused host token cannot silently replace an explicitly selected trace',async({page,server})=>{
 const {root,f}=await setup(page,server);await openTrace(root);await root.locator('.dv-trace-candidate[data-trace-id="'+f.alternative.traceId+'"]').first().click();await expect(selected(root)).toHaveAttribute('data-trace-id',f.alternative.traceId);
 await page.evaluate(()=>window.ctl.telemetry.retry());await expect(selected(root)).toHaveAttribute('data-trace-id',f.alternative.traceId);
 await page.evaluate(()=>{const samples=structuredClone(window.fixture.samples);samples['mcu->ingest'].exemplars[0].traceId=samples['mcu->ingest'].exemplars[0].candidates.find(c=>c.traceId!==samples['mcu->ingest'].exemplars[0].traceId).traceId;window.ctl.telemetry.apply(samples);});await expect(selected(root)).toHaveCount(0);await expect(root.locator('[data-trace-tone]')).toHaveCount(0);await expect(root.locator('.dv-trace-mode-status')).toContainText('expired');
});

// The former step-owned rail is superseded by the existing Status panel modes.
for(const noPanel of [false,true])test('desktop trace evidence preserves diagram dimensions '+(noPanel?'without a Status panel':'inside the existing Status panel'),async({page,server})=>{
 const {root}=await setup(page,server,{noPanel});const diagram=root.locator('.boardcanvas').first();
 await page.evaluate(()=>window.ctl.telemetry.setEnabled(true));await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.status().busy)).toBe(false);
 if(noPanel)await expect(root.locator('.pt-live-status')).toHaveCount(0);
 if(!noPanel){await openTrace(root);await expect(root.locator('.pt-live-status .dv-trace-selected')).toHaveCount(1);await expect(root.locator('.dv-trace-waterfall')).toBeVisible();}
 await page.evaluate(()=>{const samples=structuredClone(window.fixture.samples);Object.values(samples).forEach(s=>delete s.exemplars);window.ctl.telemetry.apply(samples);});await expect(selected(root)).toHaveCount(0);const before=await diagram.boundingBox();
 await page.evaluate(()=>window.ctl.telemetry.apply(window.fixture.samples));if(!noPanel){await root.locator('.dv-trace-candidate').first().click();await expect(selected(root)).toBeVisible();}
 await expect(root.locator('.dv-trace-evidence,.dv-trace-rail,.dv-live-trace-slot')).toHaveCount(0);
 const after=await diagram.boundingBox();expect(Math.abs(after.width-before.width)).toBeLessThan(2);expect(Math.abs(after.height-before.height)).toBeLessThan(2);
 await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(root.locator('.dv-trace-evidence,.dv-trace-rail')).toHaveCount(0);await unchanged(page);
});
