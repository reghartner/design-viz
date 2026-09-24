const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=vm.createContext({URL,TextEncoder});
for(const f of ['canon','validator','engine','builder.workbench','clipboard.workbench','confluence'])vm.runInContext(readSource(f+'.js'),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const panel=()=>{const p={...plain(C.PANEL_TEMPLATES.deviceapp),id:'app',type:'deviceapp'};
 p.sources=[{id:'telemetry',label:'Device telemetry'},{id:'registry',label:'Device registry'}];
 p.fields.forEach((f,i)=>f.source=i<2?'telemetry':'registry');return p;};
const spec=p=>({page:{blocks:[{heading:'Camera',diagram:{nodes:{api:{title:'Telemetry'}},rows:[['api']],edges:[],panels:[p],steps:[{id:'start',nodes:['api']}]}}]}});
const patch=app=>({panels:{app}});
test('deviceapp merges field values and statuses independently; reset, source override and snapshots are isolated',()=>{
 const p=panel(),initial=JSON.stringify(p);
 const states=C.foldDeviceAppStates(p,[patch({battery:{status:'stale',detail:'2m ago'}}),patch({battery:{source:'registry'}}),patch({battery:null}),patch({battery:{value:70,status:'ready'}}),patch({})]);
 assert.equal(states[0].battery.value,68);assert.equal(states[0].battery.status,'stale');
 assert.equal(states[0].power.value,'Solar panel');assert.equal(states[1].battery.source,'registry');
 assert.equal(states[2].battery.value,null);assert.equal(states[2].battery.status,'unknown');
 assert.equal(C.deviceAppModel(p,states[2]).fields[0].source.id,'telemetry');
 assert.equal(states[3].battery.value,70);assert.deepEqual(plain(states[4]._updated),[]);
 states[4].battery.value=99;assert.equal(states[3].battery.value,70);assert.equal(JSON.stringify(p),initial);
});
test('unknown values remain unknown; provenance never triggers a fetch and invalid inputs warn safely',()=>{
 const p=panel();p.sources[0].color='red;background:url(https://bad.test)';p.sources[0].node='missing';
 p.initial.battery={value:999,status:'bogus',source:'missing'};
 p.fields.push({id:'note'},{id:'battery'},{id:'__proto__'});
 const result=C.validate(C.normalize(spec(p)));assert.equal(result.errors.length,0);
 for(const warning of ['\.color:', '\.node:', 'battery expects', '\.status:', '\.source:', 'unique letter-led'])assert.match(result.warnings.join(),new RegExp(warning));
 const html=C.deviceAppPanelHTML(p,p.initial,false);assert.doesNotMatch(html,/bad.test|999%|bogus/);assert.match(html,/No data/);
});
test('renderer escapes every authored label, endpoint and value; source colors are constrained',()=>{
 const p=panel();p.device='<img src=x onerror=bad()>';p.sources[0].endpoint='<script>bad()</script>';p.initial.power.value='<svg onload=bad()>';
 p.sources[0].id='" onclick="bad';p.fields[0].icon='" onload="bad';
 const html=C.deviceAppPanelHTML(p,p.initial,false);assert.doesNotMatch(html,/<script|<img|<svg onload|onclick=/);assert.match(html,/&lt;img/);assert.match(html,/&lt;svg onload/);
});
test('step rendering only animates a real adjacent advance and stops on jumps',()=>{
 const p=panel(),states=C.foldDeviceAppStates(p,[patch({}),patch({battery:{value:70}}),patch({battery:{status:'stale'}})]);
 const host={querySelector:()=>null};C.renderPanelBody(host,p,states[0],'pastel',states,0,false);
 C.renderPanelBody(host,p,states[1],'pastel',states,1,true);assert.match(host.innerHTML,/da-updated fresh/);
 C.renderPanelBody(host,p,states[0],'pastel',states,0,true);assert.doesNotMatch(host.innerHTML,/da-updated fresh/);
 C.renderPanelBody(host,p,states[2],'pastel',states,2,false);assert.doesNotMatch(host.innerHTML,/da-updated fresh/);assert.match(host.innerHTML,/Cached/);
});
test('typed editor exposes per-field numeric, status and source controls',()=>{
 const fields=plain(C.panelPatchFields(panel())),battery=fields.find(f=>f[0]==='battery');
 assert.equal(battery[1],'objf');assert.deepEqual(battery[2][0],['value','num']);
 assert.deepEqual(battery[2].find(f=>f[0]==='source')[2],['telemetry','registry']);
 const out=C.patchFieldsCollect(battery[2],{value:'72',status:'stale',source:'registry',detail:'cached'});
 assert.ok(!out.error,out.error);assert.equal(out.item.value,72);assert.equal(out.item.status,'stale');
});
test('rename and delete keep deviceapp source-to-node references valid',()=>{
 const p=panel();p.sources[0].node='api';const s=spec(p),text=JSON.stringify(s);
 const rename=C.planRenameNode(text,s,0,'api','health');assert.ok(!rename.error,rename.error);
 const renamed=JSON.parse(rename.text);assert.equal(renamed.page.blocks[0].diagram.panels[0].sources[0].node,'health');
 const del=C.planDeleteNode(rename.text,renamed,0,'health');assert.ok(!del.error,del.error);
 assert.equal(JSON.parse(del.text).page.blocks[0].diagram.panels[0].sources[0].node,undefined);
});
test('starter validates, exports for Confluence and has independent happy and outage snapshots',()=>{
 const raw=JSON.parse(fs.readFileSync(__dirname+'/../src/starters/device-app-sources.json','utf8'));
 const result=C.validate(C.normalize(raw));assert.deepEqual(plain(result),{errors:[],warnings:[]});
 assert.ok(!C.buildConfluenceExport(JSON.stringify(raw)).error);
 const d=raw.page.sections[0].diagram,p=d.panels[0];
 const path=id=>C.foldPanelStates({...d,steps:d.paths.find(p=>p.id===id).steps.map(id=>d.steps.find(s=>s.id===id))})[p.id];
 const happy=path('happy'),bad=path('telemetry-down');
 assert.equal(happy.at(-1).battery.value,68);assert.equal(happy.at(-1).battery.status,'ready');
 assert.equal(bad.at(-1).battery.value,67);assert.equal(bad.at(-1).battery.status,'stale');
 assert.equal(bad.at(-1).clip.status,'ready');assert.equal(bad.at(-1).firmware.status,'ready');
});
test('panel clipboard retains valid node mappings and drops unavailable destination references',()=>{
 const p=panel();p.sources[0].node='api';const raw=spec(p);
 const data=C.builderClipboardCopy(raw,[{kind:'panel',section:0,index:0}]).data;
 const same=C.planPasteBuilderClipboard(JSON.stringify(raw),raw,data,{section:0});assert.ok(!same.error,same.error);
 assert.equal(JSON.parse(same.text).page.blocks[0].diagram.panels[1].sources[0].node,'api');
 const dest=spec(panel());dest.page.blocks[0].diagram.nodes={other:{title:'Other'}};dest.page.blocks[0].diagram.rows=[['other']];
 const cross=C.planPasteBuilderClipboard(JSON.stringify(dest),dest,data,{section:0});assert.ok(!cross.error,cross.error);
 const copied=JSON.parse(cross.text).page.blocks[0].diagram.panels[1];assert.equal(copied.sources[0].node,undefined);assert.equal(copied.fields[0].source,'telemetry');assert.equal(copied.initial.battery.value,68);
});
test('Optimize gives the app and source map the available width and respects hidden panels',()=>{
 const d=spec(panel()).page.blocks[0].diagram;
 for(const target of ['default','backstage','confluence']){
  const items=C.sectionLayoutPreset(d,target,[]),app=items.find(i=>i.panel==='app');assert.equal(app.w,12);
  assert.ok(!C.sectionLayoutPreset(d,target,['panel:app']).some(i=>i.panel==='app'));
 }
});

test('source-free tiles and notifications validate without a source map or unmapped badges',()=>{
 const p={...plain(C.PANEL_TEMPLATES.deviceapp),id:'app',type:'deviceapp'};
 p.initial.notify={app:'Homestead',title:'Doorbell pressed',text:'Front door'};
 assert.equal(p.sources,undefined);
 assert.deepEqual(plain(C.validate(C.normalize(spec(p)))),{errors:[],warnings:[]});
 const state=C.foldDeviceAppStates(p,[])[0],html=C.deviceAppPanelHTML(p,state,false);
 assert.match(html,/da-standalone/);assert.match(html,/Doorbell pressed/);assert.match(html,/68%/);
 assert.doesNotMatch(html,/da-provenance|da-badge|data-da-source|Unmapped|<button/);
 assert.ok(!C.panelPatchFields(p).find(f=>f[0]==='battery')[2].some(f=>f[0]==='source'));
 const only={id:'app',type:'deviceapp',initial:{notify:{app:'Home',title:'Ready'}}};
 assert.deepEqual(plain(C.validate(C.normalize(spec(only)))),{errors:[],warnings:[]});
});
test('source visibility preserves mappings and notes, defaults old specs to their source map',()=>{
 const p=panel(),before=JSON.stringify(p),state=C.foldDeviceAppStates(p,[])[0];state.note='An app note';
 assert.match(C.deviceAppPanelHTML(p,state,false),/da-provenance/);
 const hidden=C.deviceAppPanelHTML({...p,showSources:false},state,false);
 assert.doesNotMatch(hidden,/da-provenance|da-badge|data-da-source|Unmapped/);assert.match(hidden,/da-app-note/);assert.match(hidden,/An app note/);
 assert.match(C.deviceAppPanelHTML({...p,showSources:true},state,false),/da-provenance/);assert.equal(JSON.stringify(p),before);
 const noSources={id:'app',type:'deviceapp',fields:[],sources:[],showSources:true};
 assert.doesNotMatch(C.deviceAppPanelHTML(noSources,{},false),/da-provenance/);
});
test('notifications accumulate independently of tiles; clear and same-step notify compose; snapshots are isolated',()=>{
 const p={id:'app',type:'deviceapp',fields:[{id:'battery',kind:'battery'}],initial:{battery:{value:70,status:'ready'},notify:{app:'Home',title:'Initial'}}};
 const one={app:'Home',title:'One'},two={app:'Home',title:'Two'},three={app:'Home',title:'Three'};
 const steps=[patch({notify:[one,two],battery:{value:69}}),patch({battery:{status:'stale'}}),patch({clear:true,notify:three}),patch({clear:true})];
 const original=JSON.stringify({p,steps}),states=C.foldDeviceAppStates(p,steps);
 assert.deepEqual(plain(states[0].notifications.map(n=>n.title)),['One','Two','Initial']);
 assert.deepEqual(plain(states[1].notifications),plain(states[0].notifications));assert.equal(states[1]._phoneAdded,0);
 assert.deepEqual(plain(states[2].notifications.map(n=>n.title)),['Three']);assert.equal(states[2].battery.value,69);assert.equal(states[2].battery.status,'stale');
 assert.deepEqual(plain(states[3].notifications),[]);assert.equal(states[3].battery.value,69);
 states[1].notifications[0].title='Changed snapshot';assert.equal(states[0].notifications[0].title,'One');assert.equal(JSON.stringify({p,steps}),original);
});
test('notification validation and rendering share the existing phone contract and escape authored HTML',()=>{
 const p={id:'app',type:'deviceapp',initial:{notify:[null,{app:4},{app:'<script>x</script>',title:'<img src=x>',text:'<svg onload=x>'},{app:'Home',title:5,other:true}],clear:false},showSources:'no'};
 const warnings=C.validate(C.normalize(spec(p))).warnings.join('\n');
 for(const text of ['notification ignored','app: required','title: must','not a notification field','clear: must','showSources: expected'])assert.ok(warnings.includes(text),warnings);
 const state=C.foldDeviceAppStates(p,[])[0],html=C.deviceAppPanelHTML(p,state,false);
 assert.equal(state.notifications.length,2);assert.doesNotMatch(html,/<script|<img|<svg onload/);assert.match(html,/&lt;script&gt;/);
 const warnings2=[];C.deviceAppWarnings({id:'app',fields:[{id:'notify'},{id:'clear'},{id:'notifications'}]}, {nodes:{}}, 'app',warnings2);assert.ok(warnings2.some(w=>w.includes('reserved')));
});
test('notification entry animation requires adjacent growth and settles for backward, jump and replacement',()=>{
 const p={id:'app',type:'deviceapp',fields:[{id:'battery'}],initial:{battery:{value:70,status:'ready'}}};
 const states=C.foldDeviceAppStates(p,[patch({}),patch({notify:{app:'Home',title:'One'}}),patch({battery:{value:69}}),patch({clear:true,notify:{app:'Home',title:'Replacement'}})]);
 const host={querySelector:()=>null};
 C.renderPanelBody(host,p,states[0],'pastel',states,0,false);C.renderPanelBody(host,p,states[1],'pastel',states,1,true);assert.match(host.innerHTML,/phonecard fresh/);
 C.renderPanelBody(host,p,states[2],'pastel',states,2,true);assert.doesNotMatch(host.innerHTML,/phonecard fresh/);
 C.renderPanelBody(host,p,states[1],'pastel',states,1,true);assert.doesNotMatch(host.innerHTML,/phonecard fresh/);
 C.renderPanelBody(host,p,states[3],'pastel',states,3,true);assert.doesNotMatch(host.innerHTML,/phonecard fresh/);
 C.renderPanelBody(host,p,states[0],'pastel',states,0,false);C.renderPanelBody(host,p,states[1],'pastel',states,1,false);assert.doesNotMatch(host.innerHTML,/phonecard fresh/);
});
test('notification history is path-local and source-free exports remain compatible with Confluence',()=>{
 const p={id:'app',type:'deviceapp',fields:[{id:'battery',kind:'battery'}],initial:{battery:{value:70,status:'ready'}}};
 const raw=spec(p),d=raw.page.blocks[0].diagram;
 d.steps=[{id:'start',nodes:['api']},{id:'success',nodes:['api'],panels:{app:{notify:{app:'Home',title:'Recording ready'}}}},{id:'fail',nodes:['api'],panels:{app:{notify:{app:'Home',title:'Camera unavailable'},battery:{status:'stale'}}}}];
 d.paths=[{id:'happy',label:'Happy path',steps:['start','success']},{id:'failure',label:'Unavailable',steps:['start','fail']}];
 const happy=C.foldPanelStates(C.diagramForPath(d,'happy')).app.at(-1),bad=C.foldPanelStates(C.diagramForPath(d,'failure')).app.at(-1);
 assert.equal(happy.notifications[0].title,'Recording ready');assert.equal(bad.notifications[0].title,'Camera unavailable');assert.equal(bad.notifications.length,1);assert.equal(bad.battery.value,70);
 assert.ok(!C.buildConfluenceExport(JSON.stringify(raw)).error);
});

test('phone screens and card visibility carry independently of notification and data history',()=>{
 const p=panel();p.initial.phoneScreen='home';p.initial.battery.visible=false;
 const before=JSON.stringify(p),states=C.foldDeviceAppStates(p,[patch({notify:{app:'Home',title:'Visitor'}}),
  patch({battery:{value:71}}),patch({phoneScreen:'app',battery:{visible:true}}),
  patch({battery:{visible:false}}),patch({phoneScreen:'home'}),patch({phoneScreen:'app',battery:{visible:true},clear:true})]);
 assert.equal(states[1].phoneScreen,'home');assert.equal(states[1].battery.visible,false);
 assert.equal(states[2].battery.value,71);assert.equal(states[2].battery.status,'ready');assert.equal(states[2].notifications.length,1);
 const home=C.deviceAppPanelHTML(p,states[1],false),opened=C.deviceAppPanelHTML(p,states[2],false),hidden=C.deviceAppPanelHTML(p,states[3],false);
 assert.match(home,/data-da-screen="home"/);assert.match(home,/Visitor/);assert.doesNotMatch(home,/data-da-field=/);
 assert.match(opened,/data-da-screen="app"/);assert.match(opened,/71%/);assert.doesNotMatch(hidden,/data-da-field="battery"/);
 assert.equal(states[5].battery.value,71);assert.equal(states[5].battery.visible,true);assert.equal(states[5].notifications.length,0);
 assert.equal(JSON.stringify(p),before);states[5].battery.visible=false;assert.equal(states[2].battery.visible,true);
 const legacy=panel();assert.equal(C.deviceAppModel(legacy,C.foldDeviceAppStates(legacy,[])[0]).screen,'app');
 assert.ok(C.deviceAppModel(legacy,{}).fields.every(f=>f.visible));
});
test('invalid navigation and visibility values warn and preserve prior state; full field reset restores visibility',()=>{
 const p=panel();p.initial.phoneScreen='home';p.initial.battery.visible=false;
 const raw=spec(p);raw.page.blocks[0].diagram.steps=[patch({phoneScreen:'browser',battery:{visible:'yes'}})];
 const result=C.validate(C.normalize(raw));assert.equal(result.errors.length,0);
 assert.match(result.warnings.join(),/phoneScreen: expected home or app/);assert.match(result.warnings.join(),/visible: expected true or false/);
 const states=C.foldDeviceAppStates(p,raw.page.blocks[0].diagram.steps);assert.equal(states[0].phoneScreen,'home');assert.equal(states[0].battery.visible,false);
 const reset=C.foldDeviceAppStates(p,[patch({battery:null})])[0];assert.equal(C.deviceAppModel(p,reset).fields[0].visible,true);assert.equal(reset.battery.value,null);
 p.appName='<img src=x onerror=x>';p.initial.clock='<script>x</script>';p.initial.note='<svg onload=x>';
 const html=C.deviceAppPanelHTML(p,C.foldDeviceAppStates(p,[])[0],false);
 assert.doesNotMatch(html,/<img|<script|<svg onload/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);
});
test('home/app animation requires an adjacent screen change and stops on repeat, jump, backward and reduced motion',()=>{
 const p=panel();p.initial.phoneScreen='home';
 const states=C.foldDeviceAppStates(p,[patch({}),patch({phoneScreen:'app'}),patch({phoneScreen:'home'}),patch({phoneScreen:'app'})]);
 const host={querySelector:()=>null};
 C.renderPanelBody(host,p,states[0],'pastel',states,0,false);C.renderPanelBody(host,p,states[1],'pastel',states,1,true);
 assert.match(host.innerHTML,/da-screen-app fresh/);C.renderPanelBody(host,p,states[1],'pastel',states,1,true);assert.doesNotMatch(host._lastHTML,/da-screen-app fresh/);
 C.renderPanelBody(host,p,states[2],'pastel',states,2,true);assert.match(host.innerHTML,/da-screen-home fresh/);
 C.renderPanelBody(host,p,states[0],'pastel',states,0,false);assert.doesNotMatch(host._lastHTML,/da-screen-home fresh/);
 C.renderPanelBody(host,p,states[3],'pastel',states,3,true);assert.doesNotMatch(host.innerHTML,/da-screen-app fresh/);
 C.renderPanelBody(host,p,states[0],'pastel',states,0,false);C.renderPanelBody(host,p,states[1],'pastel',states,1,false);assert.doesNotMatch(host.innerHTML,/da-screen-app fresh/);
});
test('alternate paths isolate screen choice, hidden cards, and background updates',()=>{
 const p=panel();p.initial.phoneScreen='home';p.initial.battery.visible=false;
 const raw=spec(p),d=raw.page.blocks[0].diagram;
 d.steps=[{id:'start',panels:{app:{notify:{app:'Home',title:'Visitor'}}}},{id:'open',panels:{app:{phoneScreen:'app',battery:{visible:true,value:72}}}},
  {id:'ignore',panels:{app:{power:{visible:false}}}}];
 d.paths=[{id:'opened',steps:['start','open']},{id:'ignored',steps:['start','ignore']}];
 const a=C.foldPanelStates(C.diagramForPath(d,'opened')).app.at(-1),b=C.foldPanelStates(C.diagramForPath(d,'ignored')).app.at(-1);
 assert.equal(a.phoneScreen,'app');assert.equal(a.battery.visible,true);assert.equal(b.phoneScreen,'home');assert.equal(b.battery.visible,false);
 assert.equal(b.battery.value,68);assert.equal(a.power.visible,undefined);assert.equal(b.power.visible,false);assert.equal(b.notifications.length,1);
});
test('navigation example validates and demonstrates cards appearing and leaving without data loss',()=>{
 const raw=JSON.parse(fs.readFileSync(__dirname+'/../examples/device-app-navigation/device-app-navigation.spec.json','utf8'));
 assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
 const d=raw.page.sections[0].diagram,states=C.foldPanelStates(d).app;
 assert.equal(states[0].phoneScreen,'home');assert.equal(states[2].phoneScreen,'app');assert.equal(states[3].clip.visible,true);
 assert.equal(states[4].power.visible,false);assert.equal(states[5].phoneScreen,'home');assert.equal(states[6].clip.value,'Just now');
 assert.ok(!C.buildConfluenceExport(JSON.stringify(raw)).error);
});
