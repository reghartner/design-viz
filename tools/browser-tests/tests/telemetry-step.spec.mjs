import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {stepFixture,recordedUrlEvidence,AT} from '../../../tests/helpers/step-evidence.mjs';
import {importedDetailSpec,nestedSpec,PANEL} from '../helpers/telemetry-cards.mjs';
const metric=r=>r.getByRole('button',{name:'Metrics',exact:true});
const card=r=>r.locator('.dv-trace-evidence');
const step=r=>r.getByRole('button',{name:'Step',exact:true});
const ambient=r=>r.getByRole('button',{name:'Ambient',exact:true});
const over=r=>r.getByRole('button',{name:'Over time',exact:true});
let saved;
async function setup(page,server,options={}){
 const f=structuredClone(saved || (saved=await stepFixture()));
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
 if(options.duplicate){
  const other=JSON.parse(JSON.stringify(f.spec.page.sections[0]).replaceAll('mcu','other-mcu').replaceAll('ingest','other-ingest').replaceAll('notify','other-notify').replaceAll('app','other-app'));other.id='other';other.heading='Independent duplicate step IDs';f.spec.page.sections.push(other);
  for(const [key,value] of Object.entries(structuredClone(f.samples))){const id=key.replaceAll('mcu','other-mcu').replaceAll('ingest','other-ingest').replaceAll('notify','other-notify').replaceAll('app','other-app');value.signals.rate={value:0};delete value.exemplars;f.samples[id]=value;}
 }
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
  const telemetry={provider,canChooseExemplar:()=>window.allowed,chooseExemplar:async(id,token,traceId)=>{window.calls.choose++;return {...structuredClone(f.alternative),selectionToken:token,traceId};},history:async(bindings,range)=>{window.calls.history++;return Object.fromEntries(bindings.map(b=>[b.id,{signals:{rate:{series:[[Date.parse('2026-10-28T00:00:00Z'),0],[Date.parse(AT),30]]}}}]));}};
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

test('caption, actual exemplar actions, missing-span never row, keyboard next/prev/path and Ambient',async({page,server})=>{
 const {root,f}=await setup(page,server);await expect(metric(root)).toHaveAttribute('aria-pressed','false');await expect(card(root)).toHaveCount(0);await metric(root).click();
 await expect(root.locator('.dv-proof-caption')).toContainText('PROVEN');await expect(root.locator('.dv-live-step-tickets')).toContainText('TRACE-1');await expect(root.getByRole('link',{name:'TRACE-1',exact:true}).first()).toHaveAttribute('href','https://jira.test/browse/TRACE-1');
 await expect(card(root)).toHaveAttribute('data-trace-id',f.samples['mcu->ingest'].exemplars[0].traceId);await expect(card(root).locator('.tr-op')).not.toHaveCount(0);
 await expect(card(root).locator('.dv-trace-never[data-step-id="push"]')).toBeVisible();await expect(card(root).locator('.dv-trace-never[data-step-id="push"]')).toContainText('absence here is one observed request, not proof that this never runs');
 await expect(card(root).getByRole('button',{name:'Pick passing trace',exact:true})).toBeVisible();await expect(card(root).getByRole('link')).toHaveCount(0);
 await capture(page,'trace-card-actions');const calls=await page.evaluate(()=>window.calls.provider);
 await root.getByRole('button',{name:'Next step',exact:true}).press('Enter');await expect(root.locator('.step-text')).toContainText('Publish the event');await expect(card(root).getByRole('button',{name:'Play this trace',exact:true})).toHaveCount(0);
 await root.getByRole('button',{name:'Previous step',exact:true}).press('Enter');await expect(root.locator('.step-text')).toContainText('Submit the doorbell event');
 await root.locator('[data-dv-path="short"]').first().click();await expect(card(root).locator('.dv-trace-never')).toHaveCount(0);
 await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(card(root)).toHaveCount(0);await root.getByRole('button',{name:'Previous step',exact:true}).click();await expect(card(root)).toHaveCount(1);
 await ambient(root).click();await expect(card(root)).toHaveCount(0);await step(root).press('Enter');await expect(card(root)).toHaveCount(1);expect(await page.evaluate(()=>window.calls.provider)).toBe(calls);await unchanged(page);
});

test('trace-only pin and real alternative are explicit, deduped and retired with Metrics off',async({page,server})=>{
 const {root,f}=await setup(page,server,{traceOnly:true});await metric(root).click();await expect(root.locator('.dv-live-proof')).toHaveCount(0);
 await card(root).getByRole('button',{name:'Pin as evidence',exact:true}).press('Enter');await card(root).getByRole('button',{name:'Pin as evidence',exact:true}).click();
 await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(1);expect(await page.evaluate(()=>window.calls.choose)).toBe(0);
 await card(root).getByRole('button',{name:'Pick passing trace',exact:true}).click();await expect(card(root)).toHaveAttribute('data-trace-id',f.alternative.traceId);expect(await page.evaluate(()=>window.calls.choose)).toBe(1);
 await metric(root).click();await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(0);await unchanged(page);
});

test('tandem Over time never borrows live traces; toggles stay independent and slider is read-only',async({page,server})=>{
 const {root}=await setup(page,server);await metric(root).click();await expect(card(root)).toHaveCount(1);await over(root).click();await expect(card(root)).toHaveCount(0);const slider=root.getByRole('slider',{name:'Day',exact:true});await expect(slider).toBeVisible();await slider.press('Home');await expect(root.locator('.dv-proof-caption')).toContainText('IN PROGRESS');
 await capture(page,'trace-over-time');const calls=await page.evaluate(()=>({...window.calls}));await slider.press('End');expect(await page.evaluate(()=>window.calls)).toEqual(calls);
 await metric(root).click();await expect(over(root)).toHaveAttribute('aria-pressed','true');await expect(root.locator('.dv-proof-caption')).toHaveCount(0);await metric(root).click();await expect(card(root)).toHaveCount(0);
 await root.getByRole('button',{name:'Live',exact:true}).click();await expect(card(root)).toHaveCount(1);await root.getByRole('button',{name:'Live',exact:true}).click();await expect(root.locator('.dv-proof-caption')).toContainText('HEALTHY');await expect(card(root)).toHaveCount(1);await expect(card(root)).toBeVisible();await unchanged(page);
});

for(const origin of ['local','direct','nested'])for(const loaded of [false,true])test(`${origin} imports ${loaded?'actually loaded and reloaded selected detail':'in root'} have scoped captions, edge and node traces`,async({page,server})=>{
 const {root}=await setup(page,server,{origin,loaded});await metric(root).click();await expect(card(root)).toHaveCount(1);await expect(root.locator('.dv-proof-caption')).toContainText('PROVEN');await expect(card(root).locator('.dv-trace-never[data-step-id="push"]')).toBeVisible();
 await root.locator('[data-dv-path="node-path"]').first().click();await expect(root.locator('.step-text')).toContainText('Selected imported node');await expect(card(root)).toHaveCount(1);await expect(card(root).getByRole('button',{name:'Play this trace',exact:true})).toHaveCount(0);
 if(loaded){await metric(root).click();await root.locator('.detail-breadcrumb button').first().click();await expect(page.locator('#host [data-dv-detail-preview]')).toHaveCount(0);await page.locator('#host').getByRole('button',{name:'Explore Imported service',exact:true}).click();await page.evaluate(()=>{window.detail.page.sections[1].diagram.steps[0].text='Reloaded selected request';window.releases.shift()();});const scope=page.locator('#host [data-dv-detail-preview]:visible');await step(scope).click();await metric(scope).click();await expect(scope.locator('.step-text')).toContainText('Reloaded selected request');await expect(card(scope)).toHaveCount(1);expect(await page.evaluate(()=>window.calls.loads)).toBe(2);}
 await unchanged(page);
});

for(const disabled of ['page','host'])test(`${disabled} disable hides card, pins and all dependent actions on actual loaded imports`,async({page,server})=>{const {root}=await setup(page,server,{origin:'nested',loaded:true,disabled});await expect(metric(root)).toBeHidden();await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-proof-caption')).toHaveCount(0);await over(root).click();await expect(root.getByRole('slider',{name:'Day',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.calls.provider)).toBe(0);});
for(const options of [{missing:true},{noTrace:true},{noHandler:true},{unknown:true},{preload:true},{noTimeline:true,noHandler:true}])test('missing capabilities / no sample / unknown alternatives / permitted preload '+JSON.stringify(options),async({page,server})=>{
 const {root}=await setup(page,server,options);
 if(options.missing){await expect(metric(root)).toBeHidden();await expect(card(root)).toHaveCount(0);return;}
 if(!options.preload)await metric(root).click();
 if(options.noTrace){await expect(card(root)).toHaveCount(0);return;}
 await expect(card(root)).toHaveCount(1);await expect(card(root).getByRole('button',{name:'Pick passing trace',exact:true})).toHaveCount(0);
 if(options.unknown)await expect(card(root).getByRole('link')).toHaveCount(0);
 if(options.noTimeline){await expect(card(root).getByText('Trace timeline unavailable.',{exact:true})).toBeVisible();await expect(card(root).locator('.dv-trace-never')).toHaveCount(0);await expect(card(root).getByRole('button',{name:'Play this trace',exact:true})).toHaveCount(0);}
 if(options.preload){await expect(metric(root)).toBeHidden();await card(root).getByRole('button',{name:'Pin as evidence',exact:true}).click();await page.evaluate(()=>window.ctl.telemetry.setEnabled(false));await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(0);await page.evaluate(()=>window.ctl.telemetry.apply(window.fixture.samples));await expect(card(root)).toHaveCount(0);}
});

test('real packet durations, concurrent start offsets and zero restore on navigation, history, off, clear and destroy; native sibling isolation',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const {root}=await setup(page,server,{timed:true,sibling:true});await metric(root).click();
 await expect(card(root).locator('.dv-trace-selection')).toContainText('Synthetic animation boundary fixture');
 await page.evaluate(()=>{window.starts=[];const native=SVGAnimationElement.prototype.beginElement;SVGAnimationElement.prototype.beginElement=function(){if(this.parentElement.classList.contains('dv-trace-packet'))window.starts.push({at:performance.now(),dur:this.getAttribute('dur'),actual:this.getSimpleDuration()});return native.call(this);};});
 const authored=await root.locator('.cpkt:not(.dv-trace-packet) animateMotion').evaluateAll(els=>els.map(el=>el.getAttribute('dur')));
 await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(3);
 await expect.poll(()=>page.evaluate(()=>window.starts.length)).toBe(2);const starts=await page.evaluate(()=>window.starts);expect(starts.map(s=>s.dur)).toEqual(['600ms','800ms']);expect(starts[0].actual).toBeCloseTo(0.6,6);expect(starts[1].actual).toBeCloseTo(0.8,6);expect(starts[1].at-starts[0].at).toBeGreaterThan(110);expect(starts[1].at-starts[0].at).toBeLessThan(300);
 await expect(root.locator('.dv-trace-packet').nth(2)).toHaveAttribute('transform',/translate/);await expect(root.locator('.dv-trace-packet').nth(2).locator('animateMotion')).toHaveAttribute('dur','0ms');await expect(page.locator('#sibling .dv-trace-packet')).toHaveCount(0);
 await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);expect(await root.locator('.cpkt animateMotion').evaluateAll(els=>els.map(el=>el.getAttribute('dur')))).toEqual(authored);await root.getByRole('button',{name:'Previous step',exact:true}).click();
 await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await root.locator('[data-dv-path="short"]').first().click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await root.locator('[data-dv-path="event"]').first().click();
 await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await card(root).getByRole('button',{name:'Pick passing trace',exact:true}).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await page.evaluate(()=>window.ctl.telemetry.apply(window.fixture.samples));
 await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await page.emulateMedia({reducedMotion:'reduce'});await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await page.emulateMedia({reducedMotion:'no-preference'});
 for(const action of ['history','off','clear']){await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();if(action==='history'){await over(root).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await root.getByRole('button',{name:'Live',exact:true}).click();}else if(action==='off'){await metric(root).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await metric(root).click();}else{await page.evaluate(()=>window.ctl.telemetry.clear());await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await page.evaluate(()=>window.ctl.telemetry.apply(window.fixture.samples));}}
 await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await page.evaluate(()=>{window.retained=document.querySelector('#host').shadowRoot;window.viewer.destroy();});expect(await page.evaluate(()=>window.retained.querySelectorAll('.dv-trace-packet,.dv-trace-evidence').length)).toBe(0);await expect(page.locator('#sibling .dv-trace-evidence')).toHaveCount(1);await unchanged(page);
});

test('reduced motion, capability removal and source rebind retire timing and pins',async({page,server})=>{
 const {root}=await setup(page,server);await metric(root).click();await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await expect(card(root).locator('[role="status"]')).toContainText('Reduced motion');
 await card(root).getByRole('button',{name:'Pin as evidence',exact:true}).click();await page.evaluate(()=>{window.allowed=false;window.ctl.telemetry.apply(window.fixture.samples);});await expect(card(root).getByRole('button',{name:'Pick passing trace',exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.ctl.telemetry.retractExemplars());await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(0);
 await page.evaluate(()=>window.ctl.telemetry.apply(window.fixture.samples));await card(root).getByRole('button',{name:'Pin as evidence',exact:true}).click();await page.evaluate(()=>window.ctl.telemetry.bindingsChanged(['mcu->ingest']));await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(0);
 await page.evaluate(()=>window.ctl.telemetry.setAvailable(false));await expect(metric(root)).toBeHidden();await unchanged(page);
});


test('Open uses the recorded safe provider UI URL and strips a transport URL',async({page,server})=>{
 const {root,f}=await setup(page,server,{recordedUrl:true});await metric(root).click();
 const url=f.samples['mcu->ingest'].exemplars[0].url;expect(url).toMatch(/^https:\/\/ui\.honeycomb\.io\//);
 await expect(card(root).getByRole('link',{name:'Open trace in Honeycomb'})).toHaveAttribute('href',url);
 await page.evaluate(()=>{const value=structuredClone(window.fixture.samples);value['mcu->ingest'].exemplars[0].url='https://mcp.honeycomb.io/query_results/private';window.ctl.telemetry.apply(value);});await expect(card(root).getByRole('link')).toHaveCount(0);
});


test('mixed verdict caption keeps primary headline and trace; duplicate IDs stay section scoped',async({page,server})=>{
 const {root,f}=await setup(page,server,{mixed:true,duplicate:true});const first=root.locator('#section-main'),second=root.locator('#section-other');
 await metric(first).click();await expect(first.locator('.dv-proof-caption')).toContainText('DONE · DEGRADED');await expect(card(first)).toHaveAttribute('data-trace-id',f.samples['mcu->ingest'].exemplars[0].traceId);
 const target=root.locator('.reader-tree-section[data-reader-section="other"]');if(!await target.isVisible())await root.locator('button.reader-button').filter({hasText:/^Contents/}).click();await target.click();await step(second).click();
 await expect(second.locator('.dv-proof-caption')).toContainText('DONE · UNPROVEN');await expect(card(second)).toHaveCount(0);await unchanged(page);
});

test('real view choice restores temporary timing without changing document layout',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const {root}=await setup(page,server,{views:true,timed:true});await metric(root).click();
 await card(root).getByRole('button',{name:'Play this trace',exact:true}).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(3);
 await root.getByRole('tab',{name:'Alternate view',exact:true}).click();await expect(root.locator('.dv-trace-packet')).toHaveCount(0);await expect(card(root)).toHaveCount(1);await expect(card(root)).toBeVisible();await unchanged(page);
});


test('generated standalone fixture demonstrates trace actions alongside Over time without live queries',async({page,server})=>{
 execFileSync('node',[path.join(repo,'tools/step-evidence-demo.mjs'),path.join(server.root,'step-demo')],{cwd:repo,stdio:'pipe'});
 await page.setViewportSize({width:1600,height:1200});await page.goto(server.origin+'/step-demo/step-evidence.html');const root=page.locator('#docview');
 await step(root).click();await metric(root).click();await expect(card(root)).toBeVisible();await expect(card(root).locator('.dv-trace-never[data-step-id="push"]')).toBeVisible();await capture(page,'standalone-trace-actions');
 await card(root).getByRole('button',{name:'Pin as evidence',exact:true}).click();await expect(root.locator('.dv-live-activity-entry').filter({hasText:'Pinned trace'})).toHaveCount(1);
 await over(root).click();await root.getByRole('slider',{name:'Day',exact:true}).press('Home');await expect(card(root)).toHaveCount(0);await expect(root.locator('.dv-proof-caption')).toContainText('IN PROGRESS');await capture(page,'standalone-over-time');
 await root.getByRole('button',{name:'Live',exact:true}).click();await expect(card(root)).toBeVisible();await card(root).getByRole('button',{name:'Pick passing trace',exact:true}).click();await expect(card(root).locator('.tr-op')).toHaveCount(3);
});
