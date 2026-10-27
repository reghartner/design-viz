const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {readSource,readStyles}=require('../tools/source-loader.cjs');
const C=vm.createContext({URL,TextEncoder});
for(const file of ['compatibility','canon','validator','engine','builder.workbench','panel-picker.workbench'])vm.runInContext(readSource(file+'.js'),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const panel={id:'status',type:'live-status',title:'Epic status'};
const fixture=()=>({page:{tracking:{jira:{epic:'EP-1'}},sections:[{diagram:{nodes:{a:{tickets:['AA-1']}},rows:[['a']],panels:[{...panel}],steps:[{nodes:['a']}]}}]}});
function definition(){const d=C.PanelRegistry.get('live-status');assert.ok(d,'L1 live-status definition');return d;}
test('L1 L7 live-status facets support generic insertion and compatibility',()=>{
 const d=definition();assert.equal(d.label,'Live status');assert.equal(d.since,'0.2.0');
 assert.deepEqual(plain(d.presentation),{ambientInitial:true});
 for(const [k,v] of Object.entries({height:10,fallbackHeight:10,supporting:false,large:true,attachControls:false}))assert.equal(d.layout[k],v,k);
 assert.deepEqual(plain(d.layout.canvasSizing),{mode:'content-fit',maxHeight:640,resizeAxis:'width'});assert.ok(d.layout.sectionSizing.preferredWidth>=720);
 assert.deepEqual(plain(d.authoring.template),{title:'Live status'});assert.deepEqual(plain(d.authoring.setupFields),[]);assert.deepEqual(plain(d.authoring.patchFields),[]);
 const entry=C.PANEL_CATALOG.find(x=>x.type==='live-status');assert.equal(entry.name,'Live status');assert.equal(entry.category,'Delivery');assert.ok(entry.tagline && entry.description);
 const raw={nodes:{a:{}},rows:[['a']]},added=C.planAddPanel(JSON.stringify(raw),raw,0,'live-status');assert.equal(added.error,undefined);assert.equal(JSON.parse(added.text).panels[0].type,'live-status');
 assert.ok(C.FlowviewCompatibility.detect(fixture()).includes('panel.live-status'));assert.equal(C.FlowviewCompatibility.features['panel.live-status'].since,'0.2.0');
});
test('L1 authored states warn and fold empty snapshots while visibility remains engine-owned',()=>{
 const d=definition(),raw=fixture(),diagram=raw.page.sections[0].diagram;diagram.panels[0].initial={bad:1};diagram.steps=[{panels:{status:{bad:2}},panelVisibility:{status:false}},{panelVisibility:{status:true}}];
 const result=C.validate(C.normalize(raw));assert.deepEqual(plain(result.errors),[]);assert.equal(result.warnings.filter(x=>x.includes('live status has no authored state')).length,2);
 assert.deepEqual(plain(d.fold(diagram.panels[0],diagram.steps)),[{},{}]);assert.deepEqual(plain(d.fold(panel,[])),[{}]);
 assert.deepEqual(plain(C.foldPanelVisibility(diagram).status),[false,true]);
});
test('L1 L2 picker sample and render shell are useful without DOM registration',()=>{
 const d=definition(),sample=C.panelPickerExample('live-status'),result=d.render({},panel,{},'pastel',[],0,false);
 assert.match(result.html,/dv-live-head/);assert.equal(typeof result.mounted,'function');
 const preview=d.render({},sample.panel,sample.state,'pastel',sample.states,0,false).html;
 assert.match(preview,/Ready to demo/);assert.match(preview,/7 of 8 epic stories on diagram/);assert.match(preview,/UX-90/);
 const css=readStyles('style.core.css');for(const cls of ['dv-live-head','dv-live-tickets','dv-live-ring-done'])assert.ok(d.styles.includes('.'+cls));
 assert.match(d.styles,/--dtext/);assert.match(d.styles,/--dink/);assert.match(d.styles,/--dfaint/);assert.match(d.styles,/--explore-border/);assert.match(d.styles,/IBM Plex/);
 assert.match(d.styles,/prefers-reduced-motion/);assert.match(d.styles,/@media print/);assert.doesNotMatch(css,/\.dv-live-panel[,{]/);
});
test('L6 headless validator warns for missing and empty panels across sections',()=>{
 const raw=fixture();assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 delete raw.page.sections[0].diagram.panels;
 assert.ok(C.validate(C.normalize(raw)).warnings.includes('page.tracking: no live-status panel declared — add {"type": "live-status"} to a section\'s panels so viewers see the rollup'));
 delete raw.page.tracking;assert.ok(C.validate(C.normalize(raw)).warnings.some(x=>x.includes('no live-status panel declared')));
 raw.page.sections.push({diagram:{nodes:{b:{}},rows:[['b']],panels:[panel]}});assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 delete raw.page.sections[0].diagram.nodes.a.tickets;const result=C.validate(C.normalize(raw));assert.deepEqual(plain(result.errors),[]);assert.ok(result.warnings.some(x=>/this page has no ticket references — the panel will be empty/.test(x)));
});
test('L5 L8 L9 L11 authored example, guidance and built artifact carry the panel',()=>{
 const raw=JSON.parse(fs.readFileSync('examples/live-status/live-status.spec.json')),d=raw.page.sections[0].diagram;
 assert.deepEqual(d.panels,[panel]);assert.equal(d.sectionLayout.columns,24);
 for(const profile of ['default','backstage','confluence']){const tiles=d.sectionLayout[profile];assert.equal(tiles.length,3);assert.equal(tiles[0].w,24);assert.equal(tiles[1].controls,'steps');assert.equal(tiles[2].panel,'status');assert.equal(tiles[2].w,24);assert.ok(tiles[2].y>=tiles[1].y+tiles[1].h);}
 assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 assert.match(fs.readFileSync('docs/live-status.md','utf8'),/## Live status panel/);assert.match(fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8'),/Always add the Live status panel/);
 assert.match(fs.readFileSync('contract/authoring-contract.md','utf8'),/live-status.*panel|panel.*live-status/);
 assert.doesNotMatch(fs.readFileSync('src/native/mount.d.ts','utf8'),/mountControls/);
 assert.match(fs.readFileSync('examples/live-status/live-status.html','utf8'),/PanelRegistry.define\('live-status'/);
});
