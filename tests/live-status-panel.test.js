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
 assert.match(preview,/Ready to demo/);assert.match(preview,/7 of 8 epic stories on diagram/);assert.match(preview,/UX-90/);assert.match(preview,/dv-live-ticket-owner/);assert.match(preview,/NOT ON DIAGRAM/);assert.doesNotMatch(preview,/dv-live-chip|On diagram<\/span>/);
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
 assert.deepEqual(d.panels,[panel,HISTORY_PANEL]);assert.equal(d.sectionLayout.columns,24);
 // Default (Chuck 2026-10-27): panel in the left half, diagram in the right half with the step controls attached; narrow host profiles stack full width.
 assert.equal(d.view,'ambient');
 const def=d.sectionLayout.default,panelTile=def.find(t=>t.panel==='status'),diagramTile=def.find(t=>t.panel==null && t.controls==null),stepsTile=def.find(t=>t.controls==='steps');
 assert.equal(def.length,4,'board, attached steps, status, history (#827)');assert.deepEqual([panelTile.x,panelTile.w,panelTile.y],[0,12,0]);assert.deepEqual([diagramTile.x,diagramTile.w,diagramTile.y],[12,12,0]);assert.equal(stepsTile.attachTo,'diagram');
 for(const profile of ['backstage','confluence']){const tiles=d.sectionLayout[profile];assert.equal(tiles.length,4);assert.equal(tiles[0].w,24);assert.equal(tiles[1].controls,'steps');assert.equal(tiles[2].panel,'status');assert.equal(tiles[2].w,24);assert.ok(tiles[2].y>=tiles[1].y+tiles[1].h);}
 assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 assert.match(fs.readFileSync('docs/live-status.md','utf8'),/## Live status panel/);assert.match(fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8'),/Always add the Live status panel/);
 assert.match(fs.readFileSync('contract/authoring-contract.md','utf8'),/live-status.*panel|panel.*live-status/);
 assert.doesNotMatch(fs.readFileSync('src/native/mount.d.ts','utf8'),/mountControls/);
 assert.match(fs.readFileSync('examples/live-status/live-status.html','utf8'),/PanelRegistry.define\('live-status'/);
});
test('L1 malformed and null patches still explain that live status has no authored state',()=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;d.panels[0].initial=null;d.steps=[null,42,[]].map(patch=>({panels:{status:patch}}));
 const result=C.validate(C.normalize(raw));assert.deepEqual(plain(result.errors),[]);assert.equal(result.warnings.filter(x=>x.includes('live status has no authored state')).length,4);
 assert.deepEqual(plain(definition().fold(d.panels[0],d.steps)),[{},{},{}]);
});

test('L8 rework the panel reference is extractable by widget_doc and publishing names its header',()=>{
 const {execFileSync}=require('node:child_process');
 const doc=execFileSync('python3',['tools/widget_doc.py','live-status'],{encoding:'utf8'});
 assert.match(doc,/^### panels/);assert.match(doc,/- `live-status` — runtime ticket progress/);
 assert.match(doc,/"id":"status","type":"live-status","title":"Epic status"/);
 assert.match(doc,/no authored state/);assert.match(doc,/panelVisibility/);assert.match(doc,/sectionLayout/);
 assert.deepEqual([...doc.matchAll(/^- `([^`]+)` /gm)].map(match=>match[1]),['live-status']);
 assert.match(doc,/Patches are SPARSE/);
 const skill=fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8');
 assert.match(skill,/After Continue the Live status panel header/);assert.doesNotMatch(skill,/Live chip/);
});

test('import-local ticket refs participate in live-status panel warnings before provider resolution',()=>{
 for(const field of ['nodeTracking','edgeTracking']){
  const raw={page:{sections:[{diagram:{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'canon',[field]:{[field==='nodeTracking'?'api':'api->db']:{tickets:['AA-1']}}}]}}]}};
  assert.ok(C.validate(C.normalize(raw)).warnings.some(x=>x.includes('no live-status panel declared')));
  raw.page.sections[0].diagram.panels=[{...panel}];
  assert.ok(!C.validate(C.normalize(raw)).warnings.some(x=>x.includes('this page has no ticket references')));
 }
});

/* #827 page.editHistory + edit-history panel. Contract source: #827 "What changes", #825 Design,
   Chuck 2026-10-30 (name: live profile name, else stored by.name, else "Someone").
   §0 ruling (Chuck 2026-10-30): the issue's own Test + flip plan; rows hosted here, in
   tests/live-status.test.js (controller + mounted panel + names) and
   tools/browser-tests/tests/edit-history.spec.mjs (real viewport).
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| H1 non-array warns once, ignored | editHistory:"x" | one warning `editHistory: must be an array…`; entries [] | an impl that warns per char or throws |
| H2 valid full + minimal entries kept | full entry; entry without by/path/label | no warnings; both returned | a presence check on optional fields |
| H3 each malformed shape warns individually, entry ignored | 34 bad shapes: a trailing fraction dot, a missing offset, impossible calendar dates and non-ISO shapes, missing fields, wrong types for every required and optional field, a bad change after a good one | one `editHistory[i]…entry ignored` per bad entry; good entry survives | an impl dropping the whole list on one bad entry |
| H4 >200 warns once, newest 200 kept | 201 entries with increasing at | one cap warning; 200 returned, newest first | an impl keeping the oldest 200 or warning per entry |
| H6 definition facets + completeness | PanelRegistry.get('edit-history') | label/since/no setup or patch fields/template/picker/compat/planAddPanel | a type missing from PANEL_TYPES or the picker |
| H6b authored state warns and folds empty | initial + step patches | 'edit history has no authored state' ×2; fold [{},{}] | folding authored state into the panel |
| H9 render shell without a controller | render({},panel,{}) | html has dv-edit-history-empty "No edits yet."; mounted is a function | an impl that needs page data to render |
| H10 example + skill + docs + contract carry the panel | files on disk | example declares it after status and places it below the board in every profile; html built; docs section before Story mode; skill template; contract bullet + field | a type registered but never placed |
*/
const HISTORY_PANEL={id:'history',type:'edit-history',title:'Edit history'};
const entryAt=(at,extra)=>Object.assign({at,by:{id:'u_alex',name:'Alex'},changes:[{op:'add',ticket:'AA-1',node:'a',path:['sections',0,'diagram','nodes','a'],label:'Node A'}]},extra||{});
function historyFixture(editHistory){const raw=fixture();raw.page.sections[0].diagram.panels.push({...HISTORY_PANEL});if(editHistory!==undefined)raw.page.editHistory=editHistory;return raw;}
const historyWarnings=raw=>plain(C.validate(C.normalize(raw)).warnings).filter(w=>w.startsWith('editHistory'));
test('H1 H2 editHistory: a non-array warns once and valid entries, full or minimal, pass clean',()=>{
 assert.equal(typeof C.editHistoryEntries,'function','validator exports editHistoryEntries(page)');
 const bad=historyFixture('nope');assert.deepEqual(historyWarnings(bad),['editHistory: must be an array of edit entries — ignored']);assert.deepEqual(plain(C.editHistoryEntries(C.normalize(bad))),[]);
 const full=entryAt('2026-10-30T16:23:15.987Z',{changes:[{op:'add',ticket:'AA-1',node:'a',path:['sections',0,'diagram','nodes','a'],label:'Node A'},{op:'remove',ticket:'BB-1',edge:['a','b'],path:['sections',0,'diagram','edges',0],label:'A → B'}]});
 const minimal={at:'2026-10-29T10:00:00Z',changes:[{op:'remove',ticket:'BB-1',edge:['a','b']}]};
 // Optional fields may be absent or empty without making the entry malformed (#827 field contract).
 const emptyBy={at:'2026-10-28T10:00:00Z',by:{},changes:[{op:'add',ticket:'AA-1',node:'a',path:[],label:''}]};
 const blankBy={at:'2026-10-27T10:00:00Z',by:{id:'',name:''},changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 // Real ISO-8601 date-times: seconds and milliseconds with Z, a numeric offset, and a leap day.
 const millis={at:'2026-10-26T08:00:00.250Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 const offset={at:'2026-10-25T23:30:00+02:00',changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 const leap={at:'2028-02-29T00:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 // Rework review cycle 4: ISO-8601 allows any number of fractional-second digits.
 const tenth={at:'2026-10-24T08:00:00.1Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 const micro={at:'2026-10-23T08:00:00.1234Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 const nano={at:'2026-10-22T08:00:00.123456789+05:30',changes:[{op:'add',ticket:'AA-1',node:'a'}]};
 const raw=historyFixture([minimal,full,blankBy,emptyBy,leap,offset,millis,nano,tenth,micro]);assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 assert.deepEqual(plain(C.editHistoryEntries(C.normalize(raw))),[leap,full,minimal,emptyBy,blankBy,millis,offset,tenth,micro,nano],'newest first, entries intact');
 assert.deepEqual(plain(C.validate(C.normalize(historyFixture()))),{errors:[],warnings:[]},'a declared panel without history is not a warning');
});
test('H3 editHistory: every malformed shape warns on its own index and only that entry is ignored',()=>{
 const good=entryAt('2026-10-30T12:00:00Z');
 const bad=[42,{changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'yesterday',changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00:00Z'},{at:'2026-10-30T12:00:00Z',changes:[]},
  {at:'2026-10-30T12:00:00Z',changes:[{op:'move',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'aa-1',node:'a'}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1'}]},
  {at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',edge:['a']}]},{at:'2026-10-30T12:00:00Z',by:'Alex',changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00:00Z',by:{name:7},changes:[{op:'add',ticket:'AA-1',node:'a'}]},
  {at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a',path:'sections.0'}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a',label:['A']}]},
  // Structural types (test review cycle 1): wrong-typed required and optional fields, not only missing ones.
  null,{at:123,changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00:00Z',changes:'AA-1'},{at:'2026-10-30T12:00:00Z',changes:[null]},{at:'2026-10-30T12:00:00Z',changes:[7]},
  {at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:5}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:''}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',edge:['a',2]}]},
  {at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',edge:'a->b'}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a',edge:['a','b']}]},{at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:7,node:'a'}]},
  {at:'2026-10-30T12:00:00Z',by:{id:7},changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00:00Z',by:null,changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00:00Z',by:['Alex'],changes:[{op:'add',ticket:'AA-1',node:'a'}]},
  {at:'2026-10-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'},{op:'add'}]},
  // Diff review cycle 3: Date.parse alone accepts impossible calendar dates; `at` must be a real ISO-8601 date-time.
  {at:'2026-02-30T12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-13-01T00:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T25:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]},
  {at:'2026-10-30 12:00:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T12:00Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]},
  {at:'2026-10-30T16:23:15.Z',changes:[{op:'add',ticket:'AA-1',node:'a'}]},{at:'2026-10-30T16:23:15.5',changes:[{op:'add',ticket:'AA-1',node:'a'}]}];
 const raw=historyFixture([good,...bad]),warnings=historyWarnings(raw);
 assert.equal(warnings.length,bad.length,warnings.join('\n'));
 bad.forEach((_,i)=>assert.match(warnings[i],new RegExp('^editHistory\\['+(i+1)+'\\].* — entry ignored$'),warnings[i]));
 assert.deepEqual(plain(C.editHistoryEntries(C.normalize(raw))),[good]);
 assert.deepEqual(plain(C.validate(C.normalize(raw)).errors),[],'warning-only policy');
});
test('H4 editHistory: more than 200 entries warns once and only the newest 200 are used',()=>{
 const entries=[];for(let i=0;i<201;i++)entries.push(entryAt(new Date(Date.UTC(2026,0,1,0,i)).toISOString()));
 const raw=historyFixture(entries),warnings=historyWarnings(raw);
 assert.deepEqual(warnings,['editHistory: 201 entries — only the newest 200 are used']);
 const kept=plain(C.editHistoryEntries(C.normalize(raw)));assert.equal(kept.length,200);
 assert.equal(kept[0].at,entries[200].at,'newest first');assert.equal(kept[199].at,entries[1].at,'the oldest entry is dropped');
 assert.deepEqual(historyWarnings(historyFixture(entries.slice(0,200))),[],'exactly 200 is silent');
});
test('H6 H6b H9 edit-history definition is complete for insertion, compatibility and the picker, and has no authored state',()=>{
 const d=C.PanelRegistry.get('edit-history');assert.ok(d,'edit-history definition');
 assert.equal(d.label,'Edit history');assert.equal(d.since,'0.2.0');assert.ok(C.PANEL_TYPES.includes('edit-history'));
 assert.deepEqual(plain(d.authoring.template),{title:'Edit history'});assert.deepEqual(plain(d.authoring.setupFields),[]);assert.deepEqual(plain(d.authoring.patchFields),[]);
 assert.deepEqual(plain(C.PANEL_SETUP_FIELDS['edit-history']),[]);assert.deepEqual(plain(C.PANEL_PATCH_FIELDS['edit-history']),[]);
 const entry=C.PANEL_CATALOG.find(x=>x.type==='edit-history');assert.equal(entry.name,'Edit history');assert.equal(entry.category,'Delivery');assert.ok(entry.tagline && entry.description.length>50);
 const raw={nodes:{a:{}},rows:[['a']]},added=C.planAddPanel(JSON.stringify(raw),raw,0,'edit-history');assert.equal(added.error,undefined);assert.equal(JSON.parse(added.text).panels[0].type,'edit-history');
 assert.ok(C.FlowviewCompatibility.detect(historyFixture()).includes('panel.edit-history'));assert.equal(C.FlowviewCompatibility.features['panel.edit-history'].since,'0.2.0');
 for(const [k,v] of Object.entries({supporting:false,large:true,attachControls:false}))assert.equal(d.layout[k],v,k);
 const authored=historyFixture([entryAt('2026-10-30T12:00:00Z')]),diagram=authored.page.sections[0].diagram;diagram.panels[1].initial={rows:1};diagram.steps=[{panels:{history:{rows:2}}},{}];
 const result=C.validate(C.normalize(authored));assert.deepEqual(plain(result.errors),[]);assert.equal(result.warnings.filter(x=>x.includes('edit history has no authored state')).length,2,result.warnings.join('\n'));
 assert.deepEqual(plain(d.fold(diagram.panels[1],diagram.steps)),[{},{}]);
 const shell=d.render({},HISTORY_PANEL,{},'pastel',[],0,false);assert.match(shell.html,/dv-edit-history-empty/);assert.match(shell.html,/No edits yet\./);assert.equal(typeof shell.mounted,'function');
 const sample=C.panelPickerExample('edit-history'),preview=d.render({},sample.panel,sample.state,'pastel',sample.states,0,false).html;assert.match(preview,/<details/);assert.match(preview,/dv-edit-summary/);
 for(const token of ['--dtext','--dink','--dfaint'])assert.ok(String(d.styles).includes(token),token);
});
test('H10 the live-status example, board skill, docs and contract carry the edit-history panel below the board',()=>{
 const raw=JSON.parse(fs.readFileSync('examples/live-status/live-status.spec.json')),d=raw.page.sections[0].diagram;
 assert.deepEqual(d.panels,[panel,HISTORY_PANEL],'declared after the live-status panel');
 assert.ok(Array.isArray(raw.page.editHistory) && raw.page.editHistory.length>=1,'a hand-written history ships with the example');
 assert.equal(C.editHistoryEntries(C.normalize(raw)).length,raw.page.editHistory.length);assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 for(const profile of ['default','backstage','confluence']){
  const tiles=d.sectionLayout[profile],history=tiles.find(t=>t.panel==='history'),board=tiles.find(t=>t.panel==null && t.controls==null);
  assert.ok(history,profile+' places the history panel');assert.equal(history.w,24,profile+' full width');
  for(const other of tiles)if(other!==history)assert.ok(history.y>=other.y+other.h,profile+': history below '+(other.panel || other.controls || 'board'));
  assert.ok(history.y>=board.y+board.h);
 }
 assert.match(fs.readFileSync('examples/live-status/live-status.html','utf8'),/PanelRegistry.define\('edit-history'/);
 const docs=fs.readFileSync('docs/live-status.md','utf8'),editIndex=docs.indexOf('\n## Edit history\n'),storyIndex=docs.indexOf('\n## Story mode\n');
 assert.ok(editIndex>0 && storyIndex>editIndex,'docs section immediately before Story mode');assert.equal(docs.slice(editIndex+1,storyIndex).match(/\n## /g),null,'no other level-2 section between');
 assert.match(docs.slice(editIndex,storyIndex),/"type":\s*"edit-history"/);
 const skill=fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8');assert.match(skill,/"type":"edit-history"/);assert.match(skill,/"panel":"history"/);
 const contract=fs.readFileSync('contract/authoring-contract.md','utf8');assert.match(contract,/^- `edit-history` — /m);assert.match(contract,/`editHistory`/);
 const {execFileSync}=require('node:child_process');const doc=execFileSync('python3',['tools/widget_doc.py','edit-history'],{encoding:'utf8'});assert.match(doc,/- `edit-history` — /);
});
