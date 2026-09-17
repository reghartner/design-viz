const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = vm.createContext({});
for (const name of ['validator','engine','builder.workbench'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/'+name+'.js'),'utf8'),C);
const plain = v => JSON.parse(JSON.stringify(v));
const home = () => ({id:'home',type:'homemap',devices:[{id:'cam',kind:'camera',x:130,y:80}],
  initial:{cam:'scan'}});
const diagram = () => ({nodes:{cam:{}},rows:[['cam']],panels:[home()],steps:[
  {id:'normal',nodes:['cam']}, {id:'warm',panels:{home:{cam:{thermal:'warm'}}}},
  {id:'off',panels:{home:{cam:{state:'off',thermal:'hot'}}}},
  {id:'cooled',panels:{home:{cam:{thermal:'normal'}}}},
  {id:'restart',panels:{home:{cam:'scan'}}},
  {id:'cold',panels:{home:{cam:{thermal:'cold'}}}}],
  paths:[{id:'happy',steps:['normal','warm','off','cooled','restart']},{id:'cold',steps:['normal','cold']}]});
const validate = d => C.validate(C.normalize(d));

test('cold and hot limits are inclusive, keep a safe interval and preserve legacy zones',()=>{
  const p={min:-30,max:90,lowCrit:-15,lowWarn:0,warn:50,crit:65};
  for(const [value,zone] of [[-20,'cold-crit'],[-15,'cold-crit'],[-5,'cold-warn'],[0,'cold-warn'],[1,'ok'],[49,'ok'],[50,'warn'],[65,'crit']])
    assert.equal(C.thermoModel(p,{value}).zone,zone);
  assert.equal(C.thermoModel(p,{value:-20,label:'OVERRIDE'}).zone,'cold-crit');
  assert.equal(C.thermoModel(p,{value:Infinity}).zone,'na');
  assert.equal(C.thermoModel({warn:50,crit:65},{value:-20}).zone,'ok');
  const host={querySelector:()=>null};
  C.renderPanelBody(host,{...p,type:'thermo'},{value:-15},'pastel',[{value:22},{value:-15}],1,false);
  assert.match(host.innerHTML,/COLD|TOO COLD/);
  assert.match(host.innerHTML,/thband cold-crit/);
  assert.match(host.innerHTML,/thguide cold-warn/);
  assert.doesNotMatch(host.innerHTML,/NaN|Infinity/);
});

test('malformed cold thresholds warn and render deterministically, never contradictory zones',()=>{
  const p={id:'temp',type:'thermo',min:-30,max:90,warn:50,crit:65,lowWarn:-15,lowCrit:0};
  assert.equal(C.thermoModel(p,{value:-20}).zone,'cold-crit');
  let warnings=validate({nodes:{a:{}},rows:[['a']],panels:[p]}).warnings;
  assert.ok(warnings.some(s=>s.includes('cold thresholds swapped')));
  p.lowWarn=60;p.lowCrit=-15;
  assert.equal(C.thermoModel(p,{value:55}).zone,'warn');
  assert.equal(C.thermoModel(p,{value:-20}).lowCrit,null);
  warnings=validate({nodes:{a:{}},rows:[['a']],panels:[p]}).warnings;
  assert.ok(warnings.some(s=>s.includes('ranges overlap')));
  p.lowWarn=Infinity;p.lowCrit=-15;
  assert.equal(C.thermoModel(p,{value:-20}).zone,'cold-crit');
  assert.ok(validate({nodes:{a:{}},rows:[['a']],panels:[p]}).warnings.some(s=>s.includes('lowWarn')));
});

test('temperature and operation fold independently through strings, objects, branches and recovery',()=>{
  const d=diagram();assert.deepEqual(plain(validate(d)),{errors:[],warnings:[]});
  const active=C.diagramForPath(d,'happy'),states=C.foldPanelStates(active).home;
  assert.deepEqual(plain(states.map(s=>{const m=C.homemapModel(d.panels[0],s).devices[0];return [m.state,m.thermal];})),
    [['scan','normal'],['scan','warm'],['off','hot'],['off','normal'],['scan','normal']]);
  assert.deepEqual(plain(states[2].cam),{state:'off',thermal:'hot'});
  const cold=C.foldPanelStates(C.diagramForPath(d,'cold')).home;
  assert.deepEqual(plain(cold[1].cam),{state:'scan',thermal:'cold'});
  const h={querySelector:()=>null};
  C.renderPanelBody(h,d.panels[0],states[2],'pastel',states,2,false);
  assert.match(h.innerHTML,/hm-camera hm-off/);
  assert.match(h.innerHTML,/thermal-hot/);
  assert.doesNotMatch(h.innerHTML,/class="hmwedge"/);
  C.renderPanelBody(h,d.panels[0],cold[1],'pastel',cold,1,false);
  assert.match(h.innerHTML,/thermal-frost/);assert.doesNotMatch(h.innerHTML,/thermal-hot/);
  C.renderPanelBody(h,d.panels[0],states[4],'pastel',states,4,false);
  assert.doesNotMatch(h.innerHTML,/class="hmthermal/);
});

test('thermal patches validate attributes and preserve literal legacy device IDs',()=>{
  const p=home();p.devices.push({id:'thermal',kind:'sensor',x:50,y:50});
  p.initial.thermal='ok';p.initial.cam={state:'off',thermal:'hot'};
  assert.equal(validate({nodes:{a:{}},rows:[['a']],panels:[p]}).warnings.length,0);
  const d={panels:[p],steps:[{panels:{home:{cam:{thermal:'<script>',state:'bogus',extra:true}}}}]};
  const states=C.foldPanelStates(d).home;
  assert.deepEqual(plain(states[0].cam),{state:'off',thermal:'hot'});
  const warnings=validate({...d,nodes:{a:{}},rows:[['a']]}).warnings;
  assert.equal(warnings.filter(s=>s.includes('invalid device attribute')).length,3);
  assert.equal(states[0].thermal,'ok');
  const invalidScalar=C.foldHomemapStates(p,[{panels:{home:{cam:'bogus'}}}])[0];
  assert.equal(C.homemapModel(p,invalidScalar).devices[0].state,'scan');
  assert.equal(C.homemapModel(p,invalidScalar).devices[0].thermal,'hot');
});

test('attribute editor preserves the other local attribute and removes only its own override',()=>{
  let d=diagram();
  function change(index,attribute,value){
    const before=JSON.stringify(d),plan=C.planHomemapDeviceAttribute(before,d,0,index,'home','cam',attribute,value);
    assert.ok(!plan.error,plan.error);assert.equal(JSON.stringify(d),before);d=JSON.parse(plan.text);
  }
  change(1,'state','rec');
  assert.deepEqual(d.steps[1].panels.home.cam,{thermal:'warm',state:'rec'});
  change(1,'state',undefined);
  assert.deepEqual(d.steps[1].panels.home.cam,{thermal:'warm'});
  change(1,'thermal',undefined);
  assert.equal(d.steps[1].panels,undefined);
  change(null,'thermal','cold');
  assert.deepEqual(d.panels[0].initial.cam,{state:'scan',thermal:'cold'});
  change(null,'state','off');
  assert.deepEqual(d.panels[0].initial.cam,{state:'off',thermal:'cold'});
  assert.ok(C.planHomemapDeviceAttribute(JSON.stringify(d),d,0,2,'home','cam','thermal','fire').error);
});

test('unavailable screen hides the scene, escapes its explanation, and clears on recovery',()=>{
  const panel={id:'video',type:'screen',scene:'person-through-door'},h={querySelector:()=>null};
  C.renderPanelBody(h,panel,{mode:'unavailable',reason:'Thermal shutdown <script>alert(1)</script>'},'pastel',[],0,false);
  assert.match(h.innerHTML,/Camera unavailable/);assert.match(h.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(h.innerHTML,/scene-entry|STANDBY|<script>/);
  C.renderPanelBody(h,panel,{mode:'active',reason:'Thermal shutdown'},'pastel',[],1,false);
  assert.match(h.innerHTML,/scene-entry/);assert.doesNotMatch(h.innerHTML,/Camera unavailable|Thermal shutdown/);
  C.renderPanelBody(h,panel,{mode:'unavailable',reason:null},'pastel',[],2,false);
  assert.match(h.innerHTML,/Video is temporarily unavailable/);
  assert.equal(validate({nodes:{a:{}},rows:[['a']],panels:[{...panel,initial:{mode:'unavailable',reason:'Too cold'}}]}).warnings.length,0);
  assert.ok(C.PANEL_PATCH_FIELDS.screen.find(f=>f[0]==='mode')[2].includes('unavailable'));
  assert.ok(C.PANEL_SETUP_FIELDS.thermo.some(f=>f[0]==='lowCrit'));
});

test('teaching flow keeps camera shutdown, health delivery, missed visits and restart gates distinct',()=>{
  const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/diagrams/thermal-doorbell/thermal-doorbell.spec.json')));
  assert.deepEqual(plain(validate(spec)),{errors:[],warnings:[]});
  const d=spec.page.sections[0].diagram,byId=id=>d.panels.find(p=>p.id===id);
  assert.equal(d.autoplay,false);
  assert.ok(d.sectionLayout.default.some(t=>!t.panel&&!t.controls),'Both views retain the topology');
  for(const id of ['hot','cold']){
    const active=C.diagramForPath(d,id),folded=C.foldPanelStates(active);
    const index=suffix=>active.steps.findIndex(s=>s.id===id+'-'+suffix);
    const shutdown=index('shutdown'),missed=index('missed'),safe=index('safe'),end=index('restored');
    assert.equal(folded.screen[shutdown].mode,'unavailable');
    assert.equal(C.phoneModel(folded.phone[shutdown]).notifications.length,0,'No alert before its delivery beat');
    assert.equal(C.phoneModel(folded.phone[index('notify')]).notifications.length,1);
    assert.match(C.phoneModel(folded.phone[end]).notifications[0].title,new RegExp(id==='hot'?'hot':'cold'));
    assert.equal(folded.home[missed].cam.state,'off');
    assert.equal(folded.home[missed].door,'closed');
    assert.equal(folded.screen[missed].mode,'unavailable');
    assert.equal(active.steps[missed].failures['camera->clips'],'blocked');
    assert.equal(folded.home[safe].cam.state,'off','Safe reading alone does not restart Camera');
    assert.equal(folded.screen[end].mode,'active');
    assert.equal(folded.battery[end].trend,'charging');
    assert.equal(folded.battery[end].cold,false);
    assert.equal(C.phoneModel(folded.phone[end]).notifications.length,1,'No invented recovery notice');
    assert.match(JSON.stringify(folded.cap[end]),/Missed/,'Recovery never creates the missed clip');
    if(id==='cold'){
      assert.equal(C.thermoModel(byId('temp'),folded.temp[index('cooling')]).zone,'ok');
      assert.equal(folded.screen[index('cooling')].mode,'unavailable');
      assert.equal(folded.home[index('warning')].cam.state,'scan');
      assert.equal(folded.battery[index('warning')].trend,'idle','Cold warning pauses charging without stopping Camera');
    }
  }
  const happy=C.foldPanelStates(C.diagramForPath(d,'happy'));
  const camera=byId('home').devices.find(device=>device.id==='cam');
  for(const stepIndex of [1,2]){
    const visitor=happy.home[stepIndex].visitor,dx=visitor.x-camera.x,dy=visitor.y-camera.y;
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    const offset=Math.abs((angle-camera.facing+540)%360-180);
    assert.ok(offset<=camera.spread/2 && Math.hypot(dx,dy)<=camera.range,'Approach and recording stay inside the camera coverage');
  }
  assert.equal(happy.home.at(-1).door,'open');
  assert.equal(happy.screen.at(-1).mode,'save');
  assert.match(C.phoneModel(happy.phone.at(-1)).notifications[0].title,/Visitor/);
});
