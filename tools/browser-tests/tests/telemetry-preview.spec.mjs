/* Desktop #941: real controls plus production named-assembly owners. No connector
   is installed by authoring. Exact counts, geometry, history and retired callbacks
   are observed at the DOM/session boundaries, never by replacing the painter. */
import {test,expect,paste,prepareEditorSurface,trackResources} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {importedDetailSpec,nestedSpec} from '../helpers/telemetry-cards.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const raw={page:{title:'Metrics authoring',tracking:{telemetry:{templates:{unused:{kind:'call',signals:{rate:{grafana:'up'}}}},future:{keep:true}}},sections:[{id:'flow',heading:'Delivery',diagram:{view:'ambient',nodes:{a:{title:'Sender',tickets:['TEST-1']},b:{title:'Receiver'},c:{title:'Unbound'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',label:'A deliberately long delivery label for geometry',telemetry:binding},{from:'b',to:'c',label:'Unbound delivery'}],panels:[{id:'status',type:'live-status'}]}}]}};
const toggle=page=>page.getByRole('checkbox',{name:'Preview metrics layout',exact:true});
const cards=page=>page.locator('#docview .dv-metrics-card');
const edge=text=>JSON.parse(text).page.sections[0].diagram.edges[0];
async function open(page,server,spec=raw){
 await page.setViewportSize({width:1680,height:1100});await useProjectDownloads({page});
 await page.addInitScript(()=>{
  window.metricToolCalls=[];
  const mcp={listTools(){window.metricToolCalls.push('discovery');return Promise.resolve([]);},callTool(){window.metricToolCalls.push('data');return Promise.resolve({});}};
  window.claude={use(name){window.metricToolCalls.push('namespace:'+name);return Promise.resolve(mcp);}};
  window.flowviewTelemetry={provider(){window.metricToolCalls.push('host-data');return Promise.resolve({});}};
 });
 await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(spec,null,2));await prepareEditorSurface(page);
}
async function settings(page){await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();}
async function exported(page){const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await pending);return JSON.parse(files[Object.keys(files).find(k=>k.endsWith('.spec.json'))]);}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function box(card){return card.evaluate(el=>{const r=el.querySelector('rect'),m=el.transform.baseVal.consolidate().matrix;return {x:m.e,y:m.f,w:+r.getAttribute('width'),h:+r.getAttribute('height'),side:el.dataset.side};});}

test('P1 desktop preview cards are explicit synthetic selection targets; side/offset Undo Redo and toggles never add history',async({page,server},testInfo)=>{
 await open(page,server);const source=page.locator('#src'),before=await source.inputValue();
 await expect(toggle(page)).not.toBeChecked();await expect(cards(page)).toHaveCount(0);
 const undoBefore=await page.locator('#undo-builder').isEnabled();
 await toggle(page).check();await expect(cards(page)).toHaveCount(1);await expect(cards(page)).toHaveAttribute('data-metrics-card','a->b');
 await expect(page.locator('#docview .dv-live-proof,#docview .dv-live-proof-table')).toHaveCount(0);
 await expect(cards(page).locator('.dv-metrics-card-note')).toHaveText('Preview · synthetic');await expect(cards(page)).toHaveAttribute('data-verdict','preview');
 await expect(page.locator('#docview .dv-metrics-stream,#docview .dv-metrics-seal')).toHaveCount(0);
 await expect(source).toHaveValue(before);expect(await page.locator('#undo-builder').isEnabled()).toBe(undoBefore);
 await page.locator('#docview').screenshot({path:testInfo.outputPath('metrics-layout-preview.png')});
 await page.getByRole('checkbox',{name:'Demo live status',exact:true}).check();await expect(cards(page)).toHaveCount(1);await expect(cards(page)).toHaveAttribute('data-verdict','preview');
 await page.getByRole('checkbox',{name:'Demo live status',exact:true}).uncheck();await expect(cards(page)).toHaveCount(1);await expect(source).toHaveValue(before);
 const initial=await box(cards(page));await cards(page).click();await page.locator('#editor-tab-inspect').click();
 await expect(page.locator('#guide').getByLabel('Card side',{exact:true})).toHaveValue('below');await expect(page.locator('.dv-live-popover:visible')).toHaveCount(0);
 await page.locator('#guide').getByLabel('Card side',{exact:true}).selectOption('above');
 await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.side).toBe('above');await expect(cards(page)).toHaveAttribute('data-side','above');
 const sideText=await source.inputValue(),above=await box(cards(page));expect(above.y).toBeLessThan(initial.y);
 await cards(page).click();const offset=page.locator('#guide').getByLabel('Card offset',{exact:true});await offset.fill('240');await offset.press('Enter');
 await expect.poll(async()=>edge(await source.inputValue()).telemetry.card.offset).toBe(240);const edited=await source.inputValue(),shifted=await box(cards(page));expect(shifted.x).not.toBe(above.x);
 await toggle(page).uncheck();await expect(cards(page)).toHaveCount(0);await toggle(page).check();await expect(cards(page)).toHaveCount(1);await expect(source).toHaveValue(edited);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(sideText);await expect.poll(()=>box(cards(page))).toEqual(above);
 await page.locator('#redo-builder').click();await expect(source).toHaveValue(edited);await expect.poll(()=>box(cards(page))).toEqual(shifted);
 const saved=await exported(page);expect(saved.page.sections[0].diagram.edges[0].telemetry.card).toEqual({side:'above',offset:240});expect(JSON.stringify(saved)).not.toContain('metricsPreview');
 expect(await page.evaluate(()=>window.metricToolCalls)).toEqual([]);
});

for(const wrapped of [true,false])test('P2 Allow metrics false/true is one Undo each, preserves settings and bindings, suppresses preview and exports both booleans ('+(wrapped?'wrapped':'bare page')+')',async({page,server})=>{
 const doc=value=>value.page || value,read=text=>doc(JSON.parse(text));
 await open(page,server,wrapped?raw:raw.page);await toggle(page).check();await expect(cards(page)).toHaveCount(1);await settings(page);
 const source=page.locator('#src'),before=await source.inputValue(),allow=page.getByRole('checkbox',{name:'Allow metrics',exact:true});
 await expect(allow).toBeChecked();await allow.uncheck();
 await expect.poll(async()=>read(await source.inputValue()).tracking.telemetry.enabled).toBe(false);
 const disabled=await source.inputValue();await expect(cards(page)).toHaveCount(0);await expect(toggle(page)).toBeDisabled();
 expect(read(disabled).tracking.telemetry).toEqual({...raw.page.tracking.telemetry,enabled:false});expect(read(disabled).sections[0].diagram.edges[0].telemetry).toEqual(binding);
 await expect(page.locator('#docview').getByRole('button',{name:'Metrics',exact:true})).toHaveCount(0);
 expect(doc(await exported(page)).tracking.telemetry.enabled).toBe(false);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);await expect(cards(page)).toHaveCount(1);
 await page.locator('#redo-builder').click();await expect(source).toHaveValue(disabled);await expect(cards(page)).toHaveCount(0);
 await settings(page);await allow.check();const enabled=await source.inputValue();expect(read(enabled).tracking.telemetry.enabled).toBe(true);await expect(cards(page)).toHaveCount(1);
 await page.locator('#undo-builder').click();await expect(source).toHaveValue(disabled);await page.locator('#redo-builder').click();await expect(source).toHaveValue(enabled);
 expect(doc(await exported(page)).tracking.telemetry).toEqual({...raw.page.tracking.telemetry,enabled:true});expect(await page.evaluate(()=>window.metricToolCalls)).toEqual([]);
});

test('P3 invalid source retains preview identity; toggle preserves handwriting and old controls cannot resurrect a replaced project',async({page,server})=>{
 await open(page,server);await toggle(page).check();await expect(cards(page)).toHaveCount(1);
 await settings(page);const oldAllow=await page.getByRole('checkbox',{name:'Allow metrics',exact:true}).elementHandle();
 const oldToggle=await toggle(page).elementHandle();await page.evaluate(()=>{window.oldMetricController=window.__editorTest.preview.controller();});
 await page.locator('#editor-tab-json').click();await page.locator('#src').fill('{ handwritten');await page.locator('#go').click();
 await expect(page.locator('#src')).toHaveValue('{ handwritten');await expect(cards(page)).toHaveCount(1);expect(await page.evaluate(()=>window.oldMetricController===window.__editorTest.preview.controller())).toBe(true);
 await oldAllow.evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'));});await expect(page.locator('#src')).toHaveValue('{ handwritten');
 await toggle(page).uncheck();await expect(cards(page)).toHaveCount(0);await expect(page.locator('#src')).toHaveValue('{ handwritten');
 await oldToggle.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change'));});await settle(page);await expect(cards(page)).toHaveCount(0);
 await page.evaluate(spec=>window.__editorTest.builder.loadText(JSON.stringify(spec)),raw);await expect(toggle(page)).not.toBeChecked();await expect(cards(page)).toHaveCount(0);
 expect(await page.evaluate(()=>window.metricToolCalls)).toEqual([]);
});

// Isolated production preview owners share a document but get explicit toolbar
// anchors. The loader is the real loadDetail transport seam; no fabricated DOM.
async function owners(page,server,spec=raw,detail=importedDetailSpec()){
 await open(page,server);await page.evaluate(({spec,detail})=>{
  window.previewOwners=[];window.detailLoads=[];window.heldDetails=[];
  for(let i=0;i<2;i++){
   const host=document.createElement('section');host.id='metrics-owner-'+i;host.style.cssText='width:1400px;position:relative';
   const toolbar=document.createElement('div'),button=document.createElement('button'),view=document.createElement('div');button.textContent='Reader';toolbar.append(button);host.append(toolbar,view);document.body.append(host);
   const p=window.__editorTest.createPreview({view,previewButton:button,skin:()=> 'pastel',present(){},findings(result){if(result.errors.length)throw Error(result.errors.join(';'));},
    loadDetail(ref,signal){window.detailLoads.push({i,ref,aborted:signal.aborted});return window.holdDetail?new Promise(resolve=>window.heldDetails.push(()=>resolve(structuredClone(detail)))):Promise.resolve(structuredClone(detail));}});
   p.render(JSON.stringify(spec),{origin:'project'});window.previewOwners.push(p);
  }
 },{spec,detail});
 return [page.locator('#metrics-owner-0'),page.locator('#metrics-owner-1')];
}

test('P4 independent preview owners clear cards/listeners on off, project/import replacement and destroy, including held detail completion',async({page,server})=>{
 const spec=structuredClone(raw);spec.page.sections[0].diagram.nodes.a.detail={spec:'approved-detail',revision:'r1',section:'selected'};
 const [a,b]=await owners(page,server,spec);const ca=a.locator('.dv-metrics-card'),cb=b.locator('.dv-metrics-card');
 await a.getByRole('checkbox',{name:'Preview metrics layout'}).check();await b.getByRole('checkbox',{name:'Preview metrics layout'}).check();await expect(ca).toHaveCount(1);await expect(cb).toHaveCount(1);
 await page.evaluate(()=>window.previewOwners[0].render(JSON.stringify({nodes:{x:{title:'Replacement'}},rows:[['x']]}),{origin:'import'}));await expect(ca).toHaveCount(0);await expect(a.getByRole('checkbox',{name:'Preview metrics layout'})).not.toBeChecked();await expect(cb).toHaveCount(1);
 await page.evaluate(()=>window.holdDetail=true);await b.getByRole('button',{name:'Explore Sender',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.heldDetails.length)).toBe(1);
 const old=await b.getByRole('checkbox',{name:'Preview metrics layout'}).elementHandle();await page.evaluate(()=>window.previewOwners[1].destroy());await expect(cb).toHaveCount(0);await expect(b.getByRole('checkbox',{name:'Preview metrics layout'})).toHaveCount(0);
 await page.evaluate(()=>{window.heldDetails.splice(0).forEach(done=>done());window.previewOwners[1].setMetricsPreview(true);});await old.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change'));});await settle(page);
 await expect(cb).toHaveCount(0);await expect(b.locator('[data-dv-detail-preview]')).toHaveCount(0);await expect(ca).toHaveCount(0);
 await page.evaluate(()=>window.previewOwners[0].destroy());
});

test('P5 actual selected loaded detail with imported edges follows preview and root availability, retaining detail across toggle',async({page,server})=>{
 const spec=structuredClone(raw);spec.page.sections[0].diagram.nodes.a.detail={spec:'approved-detail',revision:'r1',section:'selected'};
 const [a]=await owners(page,server,spec);await a.getByRole('checkbox',{name:'Preview metrics layout'}).check();await a.getByRole('button',{name:'Explore Sender',exact:true}).click();
 const detail=a.locator('[data-dv-detail-preview]:visible');await expect(detail.locator('.sec-h')).toHaveText('Selected imported detail');await expect(detail.locator('.dv-metrics-card')).toHaveCount(2);
 await expect(detail.locator('.dv-metrics-card-note')).toHaveText(['Preview · synthetic','Preview · synthetic']);
 expect(await page.evaluate(()=>window.detailLoads[0])).toEqual({i:0,ref:{spec:'approved-detail',revision:'r1',section:'selected'},aborted:false});
 await a.getByRole('checkbox',{name:'Preview metrics layout'}).uncheck();await expect(detail.locator('.sec-h')).toHaveText('Selected imported detail');await expect(a.locator('.dv-metrics-card')).toHaveCount(0);
 await a.getByRole('checkbox',{name:'Preview metrics layout'}).check();await expect(detail.locator('.dv-metrics-card')).toHaveCount(2);
 spec.page.tracking.telemetry.enabled=false;await page.evaluate(spec=>window.previewOwners[0].render(JSON.stringify(spec),{origin:'edit'}),spec);await expect(detail.locator('.sec-h')).toHaveText('Selected imported detail');await expect(a.locator('.dv-metrics-card')).toHaveCount(0);await expect(a.getByRole('checkbox',{name:'Preview metrics layout'})).toBeDisabled();
 await page.evaluate(()=>window.previewOwners.forEach(p=>p.destroy()));
});

test('P6 nested imports render placeholders through the same reader geometry with authored side/offset',async({page,server})=>{
 const spec=nestedSpec();spec.page.sections[0].diagram.edges[0].telemetry.card={side:'right',offset:160};
 const [a]=await owners(page,server,spec);await a.getByRole('checkbox',{name:'Preview metrics layout'}).check();await expect(a.locator('.dv-metrics-card')).toHaveCount(1);
 const preview=await box(a.locator('.dv-metrics-card'));await expect(a.locator('.dv-metrics-card')).toHaveAttribute('data-metrics-card','outer::inner::a->outer::inner::b');
 await page.evaluate(spec=>{
  const host=document.createElement('div');host.id='metrics-reader';host.style.width='1400px';document.body.append(host);
  window.geometryReader=window.__editorTest.renderPage(host,window.__editorTest.normalize(spec),'pastel',null,{autoplay:false,telemetry:{provider:()=>({'outer::inner::a->outer::inner::b':{signals:{rate:{value:12,series:[[0,12],[1,12]]},errors:{value:12,series:[[0,12],[1,12]]}}}})}});
  window.geometryReader.telemetry.setEnabled(true);
 },spec);
 const reader=page.locator('#metrics-reader .dv-metrics-card');await expect(reader).toHaveCount(1);const measured=await box(reader);
 expect(preview.side).toBe('right');expect(preview.x).toBe(measured.x);expect(preview.y).toBe(measured.y);expect(preview.h).toBe(measured.h);expect(preview.w).toBe(measured.w);
 await page.evaluate(()=>{window.geometryReader.destroy();window.previewOwners.forEach(p=>p.destroy());});
});

function imports(){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{a:{title:'Provider A',telemetry:{kind:'service',signals:{rate:{grafana:'up'}}}},b:{title:'Provider B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Provider delivery',telemetry:binding}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
 const middle=spec('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::a','inner::b'],edges:['inner::a->inner::b']}}});
 const consumer=spec('consumer',{nodes:{x:{title:'Local X'},y:{title:'Local Y'}},rows:[['x','y']],edges:[{from:'x',to:'y',label:'Local',telemetry:binding},{from:'y',to:'x',label:'Unbound'}],
  topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}},{spec:'middle',export:'nested',as:'outer',position:{x:50,y:500}}]});
 return {provider,middle,consumer};
}
test('P7 local/direct/nested bindings and inherited read-only forms keep provider intact when adding a consumer override',async({page,server})=>{
 await open(page,server);const {provider,middle,consumer}=imports();
 await page.evaluate(({provider,middle,consumer})=>{window.metricsImportContext={version:1,id:'consumer',specs:[provider,middle,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.metricsImportContext);},{provider,middle,consumer});
 await toggle(page).check();await expect(cards(page)).toHaveCount(3);
 expect(await cards(page).evaluateAll(els=>els.map(e=>e.dataset.metricsCard).sort())).toEqual(['direct::a->direct::b','outer::inner::a->outer::inner::b','x->y']);
 const inherited=page.locator('#docview .dv-metrics-card[data-metrics-card="direct::a->direct::b"]');await inherited.click();await page.locator('#editor-tab-inspect').click();
 const guide=page.locator('#guide');await expect(guide.locator('.metrics-inherited')).toContainText('provider / core (read only)');await expect(guide.getByLabel('rate query',{exact:true})).toHaveCount(0);await expect(guide.getByLabel('Card side',{exact:true})).toHaveCount(0);
 const before=await page.locator('#src').inputValue();await guide.getByLabel('New signal name',{exact:true}).fill('localRate');await guide.getByLabel('New signal query',{exact:true}).fill('consumer_rate');await guide.getByRole('button',{name:'Add signal',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.topologyImports[0].edgeTracking?.['a->b']?.telemetry?.signals?.localRate).toEqual({grafana:'consumer_rate'});
 const after=await page.locator('#src').inputValue();await expect(cards(page)).toHaveCount(3);await inherited.click();await guide.getByLabel('Card side',{exact:true}).selectOption('above');await expect(inherited).toHaveAttribute('data-side','above');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(after);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(cards(page)).toHaveCount(3);
 expect(await page.evaluate(()=>window.metricsImportContext.specs[0])).toEqual(provider);
 await page.locator('#docview g.node[data-dv-node="outer::inner::a"]').click();await expect(guide.locator('.metrics-inherited')).toContainText('(read only)');await expect(guide.getByLabel('rate query',{exact:true})).toHaveCount(0);
 await settings(page);await page.getByRole('checkbox',{name:'Allow metrics',exact:true}).uncheck();await expect(cards(page)).toHaveCount(0);await page.locator('#undo-builder').click();await expect(cards(page)).toHaveCount(3);
 expect(await page.evaluate(()=>window.metricToolCalls)).toEqual([]);
});

test('P8 repeated toggles and preview destruction release owner resources while a sibling remains mounted',async({page,server})=>{
 await page.addInitScript(trackResources);const [a,b]=await owners(page,server);await settle(page);
 // Compare stable owners: toolbar toggling must not accumulate listeners,
 // observers or intervals. Short-lived animation frames may settle separately.
 const counts=()=>page.evaluate(()=>{const {listeners,observers,intervals,fonts}=window.__resourceCounts();return {listeners,observers,intervals,fonts};});
 const baseline=await counts();
 for(let i=0;i<3;i++){await a.getByRole('checkbox',{name:'Preview metrics layout'}).check();await expect(a.locator('.dv-metrics-card')).toHaveCount(1);await a.getByRole('checkbox',{name:'Preview metrics layout'}).uncheck();await expect(a.locator('.dv-metrics-card')).toHaveCount(0);}
 await expect.poll(counts).toEqual(baseline);
 await b.getByRole('checkbox',{name:'Preview metrics layout'}).check();await expect(b.locator('.dv-metrics-card')).toHaveCount(1);
 await page.evaluate(()=>window.previewOwners[0].destroy());const one=await counts();expect(one.listeners).toBeLessThan(baseline.listeners);await expect(b.locator('.dv-metrics-card')).toHaveCount(1);
 await page.evaluate(()=>window.previewOwners[1].destroy());const none=await counts();expect(none.listeners).toBeLessThan(one.listeners);expect(none.observers).toBeLessThan(one.observers);
});

test('P9 preview mode retains the chosen named view, path and canvas scroll through a same-document source render',async({page,server})=>{
 const spec=structuredClone(raw),d=spec.page.sections[0].diagram;d.view='step';d.steps=[{id:'first',edge:'a->b',text:'First route'},{id:'second',edge:'a->b',text:'Second route'}];d.paths=[{id:'first',label:'First path',steps:['first']},{id:'second',label:'Second path',steps:['second']}];
 d.layouts=['first','second'].map(name=>({id:name+'-view',name:name==='first'?'First view':'Second view',sectionLayout:{default:[{diagram:true,x:0,y:0,w:12,h:12},{panel:'status',x:0,y:12,w:12,h:4}]}}));d.defaultLayout='first-view';
 spec.page.sections[0].text=Array.from({length:15},()=> 'Context for this delivery. '.repeat(15));
 await open(page,server,spec);await page.getByRole('tab',{name:'Second view',exact:true}).click();await page.locator('#docview .path-chip[data-dv-path="second"]').click();
 const state=()=>page.evaluate(()=>{const r=window.__editorTest.preview.controller().sections[0];return {view:r.presentation.viewId(),path:r.stepper.path(),mode:r.stepper.mode()};});
 const before=await state();expect(before).toMatchObject({view:'second-view',path:'second'});
 const canvas=page.locator('#workspace-canvas');await canvas.evaluate(el=>{el.scrollTop=160;});const scroll=await canvas.evaluate(el=>el.scrollTop);
 await toggle(page).check();await expect(cards(page)).toHaveCount(1);expect(await state()).toEqual(before);expect(await canvas.evaluate(el=>el.scrollTop)).toBe(scroll);
 await page.locator('#editor-tab-json').click();const text=await page.locator('#src').inputValue();await page.locator('#src').fill(text+'\n');await page.locator('#go').click();
 await expect(toggle(page)).toBeChecked();await expect(cards(page)).toHaveCount(1);expect(await state()).toEqual(before);await expect(page.locator('#src')).toHaveValue(text+'\n');
});

test.afterEach(async({page})=>{expect(await page.evaluate(()=>window.metricToolCalls || []),'Authoring never acquires a connector, discovers tools or requests data').toEqual([]);});


test('P10 diagram-only SVG export omits synthetic cards and leaders, restores authored labels and leaves preview untouched',async({page,server})=>{
 await open(page,server);const source=await page.locator('#src').inputValue();await toggle(page).check();await expect(cards(page)).toHaveCount(1);
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();
 const download=await pending,svg=await readFile(await download.path(),'utf8');
 const exported=await page.evaluate(text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml');return {cards:doc.querySelectorAll('.dv-metrics-card').length,leaders:doc.querySelectorAll('.dv-metrics-leader').length,labels:Array.from(doc.querySelectorAll('text.lbl')).map(el=>({text:el.textContent,hidden:el.classList.contains('dv-metrics-label-hidden'),opacity:el.style.opacity,visibility:el.style.visibility}))};},svg);
 expect(exported.cards,'synthetic preview cards are not export content').toBe(0);expect(exported.leaders).toBe(0);expect(svg).not.toContain('Preview · synthetic');
 const label=exported.labels.find(el=>el.text===raw.page.sections[0].diagram.edges[0].label);expect(label).toBeTruthy();expect(label.hidden).toBe(false);expect(label.opacity).not.toBe('0');expect(label.visibility).not.toBe('hidden');
 await expect(cards(page)).toHaveCount(1);await expect(toggle(page)).toBeChecked();await expect(page.locator('#src')).toHaveValue(source);
});
