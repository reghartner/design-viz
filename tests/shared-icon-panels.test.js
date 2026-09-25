'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const C = vm.createContext({URL});
for (const name of ['validator.js', 'engine.js', 'builder.workbench.js']) vm.runInContext(readSource(name), C);
const plain = value => JSON.parse(JSON.stringify(value));
const patch = app => ({panels:{app}});
const app = () => ({id:'app',type:'deviceapp',fields:[
  {id:'power',kind:'battery',icon:'battery'}, {id:'temperature',icon:'temperature'},
],initial:{power:{value:80,status:'ready'},temperature:{value:21,status:'ready'}}});
const render = (type, panel, state) => C.PanelViews.get(type)({}, {type,...panel}, state, 'pastel', [], 0, false).html;

test('card icon overrides carry independently and null restores the declaration without mutating input', () => {
  const p = app();
  p.initial.power.icon = 'battery-full';
  const steps = [patch({power:{icon:'battery-low'}}),patch({power:{value:9}}),
    patch({power:{icon:'<script>'}}),patch({power:{icon:null}}),patch({power:null})];
  const before = JSON.stringify({p,steps}), states = C.foldDeviceAppStates(p,steps);
  assert.deepEqual(plain(states.map(s => C.deviceAppModel(p,s).fields[0].icon)),
    ['battery-low','battery-low','battery-low','battery','battery']);
  assert.equal(states[0].power.value,80);
  assert.equal(states[1].power.value,9);
  assert.equal(states[3].power.value,9);
  assert.equal(states[4].power.value,null);
  assert.equal(JSON.stringify({p,steps}),before);
  states[0].power.icon='alarm';
  assert.equal(states[1].power.icon,'battery-low');
});

test('card icons have typed initial/step authoring and validate without deriving temperature or alarms', () => {
  const p = app();
  const fields = C.panelPatchFields(p).find(f => f[0]==='power')[2];
  assert.deepEqual(plain(fields.find(f=>f[0]==='icon')),['icon','enum',plain(C.ICON_SET)]);
  assert.equal(C.PanelRegistry.get('deviceapp').authoring.initialFields,true);
  const warnings=[];
  C.deviceAppPatchWarnings({power:{icon:'battery-low'},temperature:{icon:'triggered'}},'patch',p,warnings);
  assert.deepEqual(warnings,[]);
  C.deviceAppPatchWarnings({power:{icon:'bad" onload="x'}},'patch',p,warnings);
  assert.match(warnings.join(),/power\.icon: unknown icon/);
  const state={power:{value:1,status:'ready'},temperature:{value:1000,status:'ready'}};
  const model=C.deviceAppModel(p,state);
  assert.equal(model.fields[0].icon,'battery');
  assert.equal(model.fields[1].icon,'temperature');
  const h=C.deviceAppPanelHTML(p,state,false);
  assert.match(h,/data-icon="temperature"/);
  assert.doesNotMatch(h,/data-icon="(?:hot|alarm|triggered|battery-low)"/);
});

test('battery and temperature retain threshold semantics, textual labels and easing-compatible readouts', () => {
  const p={low:30,crit:10};
  for (const [charge,tone] of [[80,'green'],[30,'amber'],[10,'red'],[null,'neutral']]) {
    const h=render('battery',p,{charge,label:'Reserve'});
    assert.match(h,new RegExp('data-icon-tone="'+tone+'"'));
    assert.match(h,/class="btval z-[^"]+">(?:\d+|&#8212;)<span/);
    assert.match(h,/Reserve/);
    assert.match(h,/class="btglyph"/);
  }
  const charging=render('battery',p,{charge:5,trend:'charging',cold:true});
  assert.match(charging,/data-icon="battery-charging"/);
  assert.match(charging,/data-icon="snowflake"/);
  assert.doesNotMatch(charging,/&#9889;|&#10052;/);
  const thermal={min:-20,max:90,lowCrit:-10,lowWarn:0,warn:50,crit:70};
  for(const [value,icon,tone] of [[20,'temperature','green'],[50,'hot','amber'],[70,'hot','red'],[-1,'cold','blue'],[-10,'cold','violet']]) {
    const h=render('thermo',thermal,{value});
    assert.match(h,new RegExp('data-icon="'+icon+'"'));
    assert.match(h,new RegExp('data-icon-tone="'+tone+'"'));
    assert.match(h,/class="thval z-[^"]+">-?\d+<span/);
    assert.match(h,/class="thbar"/);
  }
});

test('Home honors camera and hub symbols while preserving their behavior and omitted defaults', () => {
  const p={devices:[{id:'cam',kind:'camera',x:50,y:60},{id:'hub',kind:'hub',x:90,y:60}]};
  assert.deepEqual(plain(C.homemapModel(p,{}).devices.map(d=>d.icon)),['camera','router']);
  p.devices[0].icon='battery-low';p.devices[1].icon='cloud';
  const state={cam:{state:'rec',thermal:'cold'},hub:'online'};
  const m=C.homemapModel(p,state);
  assert.equal(m.devices[0].state,'rec');
  assert.equal(m.devices[0].thermal,'cold');
  const h=render('homemap',p,state);
  assert.match(h,/class="hmicon hmdeviceglyph"[^>]*><g[^>]*data-icon="battery-low"/);
  assert.match(h,/data-icon="cloud"/);assert.match(h,/data-icon="snowflake"/);
  assert.match(h,/class="hmrecdot"/);
  p.devices[0].icon='bad" onload="x';
  assert.equal(C.homemapModel(p,state).devices[0].icon,'gear');
});

test('Home icon facts carry through scalar states, reset to layout and stay isolated by story path', () => {
  const p={id:'home',type:'homemap',devices:[{id:'cam',kind:'camera',x:50,y:60}],
    subjects:[{id:'visitor',x:80,y:100}],initial:{cam:'scan',visitor:{icon:'car'}}};
  const step=(id,home)=>({id,panels:{home}});
  const d={nodes:{n:{}},rows:[['n']],panels:[p],steps:[step('start',{}),
    step('alert',{cam:{icon:'triggered'},visitor:{icon:'person'}}),step('record',{cam:'rec'}),
    step('reset',{cam:{icon:null},visitor:{icon:null}}),step('hide',{visitor:null}),
    step('hidden-icon',{visitor:{icon:'car'}}),step('show',{visitor:{x:110,y:120}})],
    paths:[{id:'normal',steps:['start','record']},{id:'incident',steps:['start','alert','record','reset','hide','hidden-icon','show']}]};
  const before=JSON.stringify(d);
  assert.deepEqual(plain(C.validate(C.normalize(d))),{errors:[],warnings:[]});
  const normal=C.foldPanelStates(C.diagramForPath(d,'normal')).home;
  const incident=C.foldPanelStates(C.diagramForPath(d,'incident')).home;
  assert.equal(C.homemapModel(p,normal[1]).devices[0].icon,'camera');
  assert.equal(C.homemapModel(p,incident[2]).devices[0].icon,'triggered');
  assert.equal(C.homemapModel(p,incident[2]).devices[0].state,'rec');
  assert.equal(C.homemapModel(p,incident[3]).devices[0].icon,'camera');
  assert.equal(C.homemapModel(p,incident[3]).subjects[0].icon,null,'reset keeps the default human dot');
  assert.equal(C.homemapModel(p,incident[5]).subjects[0].hidden,true);
  assert.equal(C.homemapModel(p,incident[6]).subjects[0].icon,'car');
  assert.equal(C.homemapModel(p,incident[6]).subjects[0].hidden,false);
  const host={querySelector:()=>null};
  for(const i of [2,3,1,0]) {
    C.renderPanelBody(host,p,incident[i],'pastel',incident,i,false);
    assert.equal(host.innerHTML.includes('data-icon="triggered"'),i===1 || i===2);
  }
  assert.equal(JSON.stringify(d),before);
});

test('Home icon planner preserves position, audio and operation, and rejects invalid icons or hidden replacement', () => {
  let d={nodes:{n:{}},rows:[['n']],panels:[{id:'home',type:'homemap',
    devices:[{id:'cam',kind:'camera',x:50,y:60}],subjects:[{id:'visitor',x:80,y:100}]}],
    steps:[{panels:{home:{cam:'rec',visitor:{x:85,y:105,audio:{output:'speech'}}}}}]};
  function edit(id,value,step=0) {
    const before=JSON.stringify(d),plan=C.planHomemapDeviceAttribute(before,d,0,step,'home',id,'icon',value);
    assert.ok(!plan.error,plan.error);assert.equal(JSON.stringify(d),before);d=JSON.parse(plan.text);
  }
  edit('cam','alarm');assert.deepEqual(d.steps[0].panels.home.cam,{state:'rec',icon:'alarm'});
  edit('visitor','car');assert.deepEqual(d.steps[0].panels.home.visitor,{x:85,y:105,audio:{output:'speech'},icon:'car'});
  edit('visitor',null);assert.equal(d.steps[0].panels.home.visitor.icon,null);
  edit('visitor',undefined);assert.deepEqual(d.steps[0].panels.home.visitor,{x:85,y:105,audio:{output:'speech'}});
  edit('cam','battery-low',null);assert.deepEqual(d.panels[0].initial.cam,{icon:'battery-low'});
  const bad=C.planHomemapDeviceAttribute(JSON.stringify(d),d,0,0,'home','cam','icon','<script>');
  assert.match(bad.error,/valid icon/);
  d.steps[0].panels.home.visitor=null;
  const hidden=C.planHomemapDeviceAttribute(JSON.stringify(d),d,0,0,'home','visitor','icon','car');
  assert.match(hidden.error,/hidden/);
  const warnings=[];
  C.homemapPatchWarnings({cam:{icon:'bad'},visitor:{icon:42}},'patch',
    {devices:{cam:d.panels[0].devices[0]},subjects:{visitor:d.panels[0].subjects[0]}},warnings);
  assert.equal(warnings.length,2);
  const states=C.foldHomemapStates(d.panels[0],[{panels:{home:{cam:{icon:'bad'}}}}]);
  assert.equal(C.homemapModel(d.panels[0],states[0]).devices[0].icon,'battery-low');
});

test('audio, camera, monitoring and responders consume the shared icon family', () => {
  for (const id of ['microphone','speaker','recorded','chime','siren','detection'])
    assert.match(C.FlowAudio.icon(id),new RegExp('data-icon="'+id+'"'));
  assert.match(C.FlowAudio.icon('__proto__'),/data-icon="speaker"/);
  assert.match(render('screen',{}, {mode:'unavailable'}),/data-icon="camera-off"/);
  const sensor={id:'door',kind:'door',label:'Front door'};
  const security=render('security',{sensors:[sensor]}, {status:'armed',door:{health:'online',alarm:'triggered'}});
  assert.match(security,/data-icon="armed"/);
  assert.match(security,/data-icon="door" data-icon-tone="red"/);
  assert.match(security,/Monitoring<\/div>/);
  assert.doesNotMatch(security,/data-icon="triggered"/);
  const response=render('dispatch',{responders:[{id:'unit',kind:'police'}]}, {unit:{status:'available'}});
  assert.match(response,/data-icon="police"/);assert.match(response,/data-icon="headset"/);
  assert.match(response,/dispatch-scene/);
});

test('branded phone surfaces, camera watermark and monitoring desk accept the shared brand', () => {
  const brand={app:'Acme',icon:'house'};
  for(const type of ['deviceapp','phone','screen','security']) {
    assert.equal(C.PanelRegistry.get(type).authoring.branding,true);
    const h=render(type,{brand},type==='screen'?{mode:'live'}:{});
    assert.match(h,/fv-brand/);assert.match(h,/data-icon="house"/);
  }
  assert.equal(C.phoneBrand({brand}).icon,'house');
  assert.equal(C.deviceAppModel({brand},{}).appName,'Acme');
  assert.match(C.deviceAppPanelHTML({brand,appName:'Doorbell app'},{},false),/fv-brand-name">Doorbell app<\/span>/);
  const legacy=C.phonePanelHTML({brand:{app:'Acme',logo:'AC'}},{},false);
  assert.match(legacy,/<span class="phonelogo" aria-hidden="true">AC<\/span>/);
  const p={...app(),brand},h=C.deviceAppPanelHTML(p,{phoneScreen:'home'},false);
  assert.match(h,/da-launcher-icon[^]*?data-icon="house"/);
});
