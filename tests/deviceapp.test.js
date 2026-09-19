const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=vm.createContext({URL,TextEncoder});
for(const f of ['canon','validator','engine','builder.workbench','clipboard.workbench','confluence'])vm.runInContext(readSource(f+'.js'),C);
const plain=v=>JSON.parse(JSON.stringify(v));
const panel=()=>({...plain(C.PANEL_TEMPLATES.deviceapp),id:'app',type:'deviceapp'});
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
