'use strict';
const {readSource} = require('../tools/source-loader.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const C = {URL}; vm.createContext(C);
for (const name of ['validator', 'engine', 'builder.workbench'])
  vm.runInContext(readSource(name+'.js'), C);
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../src/starters/homemap-story.json'), 'utf8'));
const diagram = spec => spec.page.sections[0].diagram;
function selectionFixture(){
  function element(attrs={},parent=null,classes=[]){
    return {parent,getAttribute:key=>attrs[key] ?? null,closest(selector){
      for(let node=this;node;node=node.parent){
        if(selector.split(',').some(s=>node.matches(s.trim()))) return node;
      }
      return null;
    },matches(selector){
      if(selector==='button') return attrs.tag==='button';
      if(/^[a-z]/.test(selector)) return false;
      return [...selector.matchAll(/\.([\w-]+)/g)].every(m=>classes.includes(m[1])) &&
        [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(m=>m[2]===undefined ? Object.hasOwn(attrs,m[1]) : attrs[m[1]]===m[2]);
    }};
  }
  const section=element({'data-dv-section':'2'},null,['doc-sec']);
  const card=element({'data-dv-panel':'1'},section,['pt-homemap']);
  return {card,section,element,
    marker:kind=>element({},element({[kind]:'x'},card)),
    button:element({tag:'button','data-home-layout':''},card),
    title:element({},card)};
}

test('ambient map markers select shared layout even when a stepper exists; step view still selects its beat',()=>{
  const f=selectionFixture();let mode='ambient';
  const player=()=>({mode:()=>mode,sourceIndex:()=>6});
  for(const attr of ['data-device','data-subject','data-home-room']){
    const target=C.builderHomemapClickTarget(f.marker(attr),player,null);
    assert.equal(target.kind,'panel');assert.equal(target.section,2);assert.equal(target.index,1);assert.equal(target.el,f.card);
  }
  mode='step';assert.deepEqual(plain(C.builderHomemapClickTarget(f.marker('data-device'),player,null)),{kind:'step',section:2,index:6});
  assert.equal(C.builderHomemapClickTarget(f.marker('data-subject'),()=>null,null).kind,'panel');
});

test('explicit layout and title selection work in step view and retain layout scope only for this map',()=>{
  const f=selectionFixture(),player=()=>({mode:()=> 'step',sourceIndex:()=>6});
  assert.equal(C.builderHomemapClickTarget(f.button,player,null).kind,'panel');
  assert.equal(C.builderHomemapClickTarget(f.title,player,null).kind,'panel');
  const editing={kind:'panel',section:2,index:1};
  assert.equal(C.builderHomemapClickTarget(f.marker('data-home-room'),player,editing).kind,'panel');
  assert.equal(C.builderHomemapClickTarget(f.marker('data-home-room'),player,{...editing,index:0}).kind,'step');
  assert.equal(C.builderHomemapClickTarget(f.element({tag:'button'},f.card),player,null),null);
  assert.equal(C.builderHomemapClickTarget(f.section,player,null),null);
});

test('numeric outline controls keep unknown fields, allow defaults, and reject invalid numbers',()=>{
  const shape=C.PANEL_SETUP_FIELDS.homemap.find(f=>f[0]==='outline')[2];
  const base={w:300,h:164,future:'keep'};
  assert.deepEqual(plain(C.objFieldsCollect(shape,base,{w:'280',h:'164'}).obj),{w:280,h:164,future:'keep'});
  assert.deepEqual(plain(C.objFieldsCollect(shape,base,{w:'',h:'150'}).obj),{h:150,future:'keep'});
  assert.equal(C.objFieldsCollect(shape,base,{w:'',h:''}).obj,null);
  assert.ok(C.objFieldsCollect(shape,base,{w:'wide',h:'150'}).error);
  assert.deepEqual(plain(C.objFieldsCollect(shape,base,{w:'150',h:'160',x:'164',y:'10'}).obj),{w:150,h:160,x:164,y:10,future:'keep'});
});

test('typed controls save on leaving a field and avoid duplicate undo entries after Enter or change',()=>{
  const wire=(input,commit)=>C.wireBuilderCommit(input,commit,{blur:true});
  const events={},input={value:'300',tagName:'INPUT',addEventListener:(name,fn)=>events[name]=fn};
  const saved=[];wire(input,()=>{if(input.value==='invalid') return false;saved.push(input.value);});
  input.value='260';events.blur();assert.deepEqual(saved,['260']);
  events.change();assert.deepEqual(saved,['260']);
  input.value='240';events.keydown({key:'Enter',preventDefault(){}});events.change();events.blur();
  assert.deepEqual(saved,['260','240']);
  input.value='invalid';events.blur();input.value='240';events.blur();
  assert.deepEqual(saved,['260','240','240'],'a rejected value must not prevent restoring the previous value');
});

const outdoorFixture = name => JSON.parse(fs.readFileSync(path.join(__dirname,'../src/starters/' + name + '.json'),'utf8'));

test('outdoor starters validate and the threshold paths keep door and occupancy state independent',()=>{
  for(const name of ['whole-home-outdoors','front-door-threshold']){
    const spec=outdoorFixture(name),result=C.validate(C.normalize(spec));
    assert.deepEqual(plain(result.errors),[],name);assert.deepEqual(plain(result.warnings),[],name);
    const d=diagram(spec);assert.equal(d.primaryPanel,'home');
    assert.ok(d.panels[0].rooms.some(r=>r.kind==='outdoor'));
    assert.ok(d.panels[0].devices.some(d=>d.display==='door'));
  }
  const d=diagram(outdoorFixture('front-door-threshold'));
  const state=(id,path)=>C.builderHomemapStep(d,d.steps.findIndex(s=>s.id===id),'home',path);
  const door=s=>s.model.devices.find(d=>d.id==='front-door').state;
  assert.equal(door(state('notify','welcome')),'closed');
  assert.equal(door(state('open','welcome')),'open');
  assert.equal(door(state('cross','welcome')),'open');
  assert.equal(door(state('close','welcome')),'closed');
  assert.equal(door(state('wait','leave-outside')),'closed');
  assert.equal(door(state('leave','leave-outside')),'closed');
  const visitor=s=>s.model.subjects.find(s=>s.id==='visitor');
  assert.ok(visitor(state('cross','welcome')).x>164);
  assert.ok(visitor(state('wait','leave-outside')).x<164);
  assert.equal(visitor(state('leave','leave-outside')).hidden,true);
  assert.equal(state('leave','leave-outside').model.subjects.find(s=>s.id==='parcel').hidden,false);
});

test('positioned outlines clamp to the frame and omitted or invalid axes remain centered',()=>{
  const model=outline=>plain(C.homemapModel({outline},{}).outline);
  assert.deepEqual(model({w:150,h:160,x:164,y:10}),{w:150,h:160,x:164,y:10});
  assert.deepEqual(model({w:150,h:160,x:-30,y:300}),{w:150,h:160,x:0,y:20});
  assert.deepEqual(model({w:150,h:160,x:Infinity,y:NaN}),{w:150,h:160,x:85,y:10});
  assert.deepEqual(model({w:150,h:160,y:0}),{w:150,h:160,x:85,y:0});
  assert.deepEqual(model({w:400,h:400,x:100,y:100}),{w:320,h:180,x:0,y:0});
});

test('shared layout works without steps and moves or resizes the house and rooms without moving contents',()=>{
  const spec=outdoorFixture('front-door-threshold'),d=diagram(spec);
  delete d.steps;delete d.paths;d.view='ambient-only';
  const original=JSON.stringify(spec),panel=d.panels[0];panel.outline.extra='keep';
  const edit=(kind,key,point)=>{
    const result=C.planHomemapLayoutPosition(JSON.stringify(spec),spec,0,'home',kind,key,point);
    assert.ok(!result.error,result.error);return diagram(JSON.parse(result.text)).panels[0];
  };
  const moved=edit('outline','',{x:140,y:15});
  assert.deepEqual(moved.outline,{...panel.outline,x:140,y:15});
  assert.deepEqual(moved.rooms,panel.rooms);assert.deepEqual(moved.devices,panel.devices);
  const resized=edit('room',0,{x:6,y:10,w:130,h:140});
  assert.deepEqual(resized.rooms[0],{...panel.rooms[0],w:130,h:140});
  assert.deepEqual(resized.devices,panel.devices);assert.deepEqual(resized.subjects,panel.subjects);
  delete panel.outline;
  assert.deepEqual(edit('outline','',{x:0,y:0,w:280,h:150}).outline,{x:0,y:0,w:280,h:150});
  for(const [kind,key,point] of [['outline','',null],['outline','',{x:200,y:0,w:300,h:160}],
    ['outline','',{x:0,y:0,w:5,h:160}],['room',0,{x:6,y:10,w:0,h:100}],
    ['room',0,{x:6,y:10,w:200,h:180}],['room',0,{x:6,y:10,w:Infinity,h:100}]])
    assert.ok(C.planHomemapLayoutPosition(original,spec,0,'home',kind,key,point).error);
});

test('shared subject placement updates initial coordinates while preserving hidden state and every step override',()=>{
  for(const initial of [undefined,null,{x:42,y:50,extra:'keep'}]){
    const spec=outdoorFixture('front-door-threshold'),panel=diagram(spec).panels[0];
    if(initial===undefined) delete panel.initial.visitor;else panel.initial.visitor=initial;
    const before=JSON.stringify(spec),scene=C.builderHomemapLayoutScene(panel);
    assert.equal(scene.model.subjects[0].hidden,false);
    assert.equal(scene.hidden.includes('visitor'),initial===null);
    assert.equal(scene.model.subjects[0].x,initial && initial.x || panel.subjects[0].x);
    const result=C.planHomemapLayoutPosition(before,spec,0,'home','subject','visitor',{x:80,y:90});
    assert.ok(!result.error,result.error);
    const next=diagram(JSON.parse(result.text));
    assert.deepEqual(next.steps,diagram(spec).steps);assert.deepEqual(next.paths,diagram(spec).paths);
    assert.deepEqual(next.panels[0].subjects[0],{...panel.subjects[0],x:80,y:90});
    assert.deepEqual(next.panels[0].initial.visitor,initial && {...initial,x:80,y:90});
    assert.equal(JSON.stringify(spec),before,'preview and planner preserve the source');
  }
});

test('shared drag geometry clamps full rooms and house sizes, and uses the original pointer offset',()=>{
  const drag=(item,at,resize=false,min=1)=>plain(C.builderHomemapLayoutDrag(item,{x:100,y:100},at,resize,min));
  assert.deepEqual(drag({x:164,y:108},{x:86,y:110}),{x:150,y:118});
  assert.deepEqual(drag({x:80,y:40,w:160,h:100},{x:300,y:300}),{x:160,y:80});
  assert.deepEqual(drag({x:80,y:40,w:160,h:100},{x:-20,y:-20}),{x:0,y:0});
  assert.deepEqual(drag({x:164,y:10,w:150,h:160},{x:500,y:500},true,20),{x:164,y:10,w:156,h:170});
  assert.deepEqual(drag({x:164,y:10,w:150,h:160},{x:-500,y:-500},true,20),{x:164,y:10,w:20,h:20});
  assert.deepEqual(drag({x:167,y:13,w:144,h:154},{x:-500,y:-500},true),{x:167,y:13,w:1,h:1});
});

test('outdoor lighting excludes people and devices inside the house, and grounds paint beneath it',()=>{
  const panel={type:'homemap',outline:{x:80,y:40,w:160,h:100},
    rooms:[{label:'INSIDE',x:82,y:42,w:156,h:96},{label:'OUTSIDE',kind:'outdoor',x:0,y:0,w:320,h:180}],
    devices:[{id:'inside',kind:'sensor',x:160,y:60},{id:'outside',kind:'camera',x:20,y:30}],
    subjects:[{id:'visitor',x:120,y:90}]};
  const tones=state=>plain(C.homemapRoomModel(panel,C.homemapModel(panel,state)).map(r=>r.tone));
  assert.deepEqual(tones({inside:'alert'}),['alert','quiet']);
  assert.deepEqual(tones({outside:'detect'}),['occupied','alert']);
  assert.deepEqual(tones({visitor:{x:30,y:80}}),['quiet','occupied']);
  assert.deepEqual(tones({visitor:{x:80,y:80}}),['quiet','occupied'],'the exterior threshold belongs outside');
  const host={querySelector:()=>null};C.renderPanelBody(host,panel,{},'pastel',[],0,false);
  assert.ok(host.innerHTML.indexOf('data-home-room="1"')<host.innerHTML.indexOf('class="hmoutline"'));
  assert.ok(host.innerHTML.indexOf('data-home-room="0"')>host.innerHTML.indexOf('class="hmoutline"'));
});

test('architectural doors bound geometry, keep legacy entry markers, and escape labels and IDs',()=>{
  const panel={type:'homemap',devices:[{id:'door',kind:'entry',display:'door',x:164,y:108,facing:-90,doorWidth:100,doorSwing:-90}]};
  let d=C.homemapModel(panel,{door:'open'}).devices[0];
  assert.equal(d.facing,270);assert.equal(d.doorWidth,48);assert.equal(d.doorSwing,-90);
  panel.devices[0].doorWidth=NaN;panel.devices[0].doorSwing='90';panel.devices[0].facing=Infinity;
  d=C.homemapModel(panel,{}).devices[0];assert.equal(d.doorWidth,24);assert.equal(d.doorSwing,90);assert.equal(d.facing,0);
  panel.devices[0].doorWidth=-1;panel.devices[0].doorSwing=0;
  d=C.homemapModel(panel,{}).devices[0];assert.equal(d.doorWidth,8);assert.equal(d.doorSwing,90);
  const warnings=[];C.homemapDeclarationWarnings(panel,'home',warnings);assert.ok(warnings.some(w=>w.includes('doorSwing')));
  panel.devices[0].label='<door & "guest">';panel.devices[0].id='door" onload="bad';
  const host={querySelector:()=>null};C.renderPanelBody(host,panel,{},'pastel',[],0,false);
  assert.match(host.innerHTML,/hm-floor-door/);assert.match(host.innerHTML,/&lt;door &amp; &quot;guest&quot;&gt;/);
  assert.doesNotMatch(host.innerHTML,/ onload="bad|NaN|Infinity/);
  delete panel.devices[0].display;C.renderPanelBody(host,panel,{},'pastel',[],0,false);
  assert.doesNotMatch(host.innerHTML,/hm-floor-door/);assert.match(host.innerHTML,/class="hmentry"/);
  panel.devices[0].kind='sensor';panel.devices[0].display='door';
  assert.equal(C.homemapModel(panel,{}).devices[0].display,undefined);
});

test('wall doors swing between open and closed, retain final poses without motion, and move as devices',()=>{
  const spec=outdoorFixture('front-door-threshold'),d=diagram(spec),panel=d.panels[0],host={querySelector:()=>null};
  const draw=(state,animate=true)=>C.renderPanelBody(host,panel,{'front-door':state},'pastel',[],0,animate);
  draw('open');assert.doesNotMatch(host.innerHTML,/hm-floor-opening|hm-floor-closing/);
  assert.match(host.innerHTML,/hm-entry hm-open hm-floor-door/);
  draw('closed');assert.match(host.innerHTML,/hm-floor-closing/);
  assert.doesNotMatch(host._lastHTML,/hm-floor-closing/);
  draw('alert');assert.doesNotMatch(host.innerHTML,/hm-floor-closing|hm-floor-opening/);
  draw('open');assert.match(host.innerHTML,/hm-floor-opening/);
  draw('closed',false);assert.doesNotMatch(host.innerHTML,/hm-floor-closing/);
  const old=C.RM;C.RM=true;
  try{draw('open');assert.match(host.innerHTML,/hm-entry hm-open/);assert.doesNotMatch(host.innerHTML,/hm-floor-opening/);}finally{C.RM=old;}
  const moved=C.planHomemapLayoutPosition(JSON.stringify(spec),spec,0,'home','device','front-door',{x:165,y:110});
  assert.ok(!moved.error,moved.error);
  const next=diagram(JSON.parse(moved.text)).panels[0].devices.find(d=>d.id==='front-door');
  assert.deepEqual(next,{...panel.devices.find(d=>d.id==='front-door'),x:165,y:110});
});

function edit(spec, step, key, value, pid = 'home'){
  const result = C.planStepHomemapField(JSON.stringify(spec, null, 2), spec, 0, step, pid, key, value);
  assert.ok(!result.error, result.error); return JSON.parse(result.text);
}

test('home story validates, focuses its map, and keeps the outage local', () => {
  const spec = fixture(), d = diagram(spec), result = C.validate(C.normalize(spec));
  assert.deepEqual(plain(result.errors), []); assert.deepEqual(plain(result.warnings), []);
  assert.equal(d.primaryPanel, 'home');
  const healthy = C.builderHomemapStep(d, 4, 'home', 'happy');
  const outage = C.builderHomemapStep(d, 6, 'home', 'offline');
  assert.equal(healthy.model.subjects[0].hidden, false);
  assert.equal(outage.model.subjects[0].hidden, true);
  assert.equal(outage.model.devices.find(x => x.id === 'door').state, 'closed');
});
test('a new step patch changes one field and its reset restores the untouched source', () => {
  const spec = fixture(); const before = JSON.stringify(spec);
  const next = edit(spec, 0, 'door', 'open');
  assert.equal(JSON.stringify(spec), before, 'planner must not mutate its input');
  assert.deepEqual(diagram(next).steps[0].panels, {home:{door:'open'}});
  assert.deepEqual(edit(next, 0, 'door', undefined), spec);
});
test('editing an alternate preserves every unrelated patch and shows its inherited value', () => {
  const spec = fixture(), original = diagram(spec).steps[5].panels;
  const next = edit(spec, 5, 'door', 'open');
  assert.deepEqual(diagram(next).steps[5].panels, {...original, home:{...original.home, door:'open'}});
  const snapshot = C.builderHomemapStep(diagram(next), 5, 'home', 'offline');
  assert.equal(snapshot.position, 2);
  assert.equal(snapshot.before.devices.find(d => d.id === 'door').state, 'closed');
  assert.equal(snapshot.model.devices.find(d => d.id === 'door').state, 'open');
  assert.deepEqual(edit(next, 5, 'door', undefined), spec);
});
test('shared steps use the selected incoming history after a branch rejoins', () => {
  const d = diagram(fixture());
  d.steps.push({id:'rejoin'}); d.paths[0].steps.push('rejoin'); d.paths[1].steps.push('rejoin');
  const i = d.steps.length - 1;
  assert.equal(C.builderHomemapStep(d, i, 'home', 'happy').before.devices.find(x=>x.id==='hub').state, 'rx');
  assert.equal(C.builderHomemapStep(d, i, 'home', 'offline').before.devices.find(x=>x.id==='hub').state, 'alert');
  assert.ok(C.builderHomemapStep(d, 100, 'home').error);
});
test('subject positions carry, null hides, reset restores the earlier position', () => {
  let spec = fixture(); spec = edit(spec, 5, 'visitor', {x:180, y:80});
  let d = diagram(spec); d.steps[6] = {id:'leave'};
  assert.deepEqual(plain(C.builderHomemapStep(d, 6, 'home', 'offline').model.subjects[0]),
    {id:'visitor', label:'Visitor', icon:null, x:180, y:80, hidden:false});
  spec = edit(spec, 6, 'visitor', null);
  assert.equal(C.builderHomemapStep(diagram(spec), 6, 'home', 'offline').model.subjects[0].hidden, true);
  spec = edit(spec, 6, 'visitor', undefined);
  assert.equal(C.builderHomemapStep(diagram(spec), 6, 'home', 'offline').model.subjects[0].x, 180);
});
test('signals can be added to an unpatched step and never carry', () => {
  const spec = edit(fixture(), 5, 'signals', [{from:'cam',to:'hub'}]), d = diagram(spec);
  assert.equal(C.builderHomemapStep(d, 5, 'home', 'offline').model.signals.length, 1);
  assert.equal(C.builderHomemapStep(d, 6, 'home', 'offline').model.signals.length, 0);
  assert.ok(!Object.hasOwn(diagram(edit(spec, 5, 'signals', undefined)).steps[5].panels.home, 'signals'));
});
test('invalid fields, device states, coordinates and endpoints fail before source edits', () => {
  const spec = fixture();
  for (const [key, value] of [['absent','off'], ['cam','open'], ['visitor',{x:-1,y:5}],
    ['visitor',{x:2,y:181}], ['visitor',{x:NaN,y:4}], ['visitor',{}], ['signals',{}],
    ['signals',[{from:'cam',to:'visitor'}]], ['signals',[null]]])
    assert.ok(C.planStepHomemapField(JSON.stringify(spec), spec, 0, 0, 'home', key, value).error, key);
});
test('legacy patch aliases and special IDs remain ordinary own keys', () => {
  let spec = fixture(), d = diagram(spec);
  d.panels[0].id = '__proto__'; d.primaryPanel = '__proto__';
  d.panels[0].devices.push({id:'constructor',kind:'hub',x:100,y:100});
  d.steps[0].patch = JSON.parse('{"__proto__":{"constructor":"idle"},"other":{"value":7}}');
  spec = edit(spec, 0, 'constructor', 'tx', '__proto__');
  assert.equal(diagram(spec).steps[0].patch.__proto__.constructor, 'tx');
  assert.equal(diagram(spec).steps[0].patch.other.value, 7);
  assert.equal(diagram(spec).steps[0].panels, undefined);
  spec = edit(spec, 0, 'constructor', undefined, '__proto__');
  assert.deepEqual(diagram(spec).steps[0].patch, {other:{value:7}});
});
test('centerpiece references rename and delete with their panel; unknown IDs warn and fall back', () => {
  let spec = fixture();
  let result = C.planRenamePanel(JSON.stringify(spec), spec, 0, 0, 'house');
  spec = JSON.parse(result.text); assert.equal(diagram(spec).primaryPanel, 'house');
  result = C.planDeletePanel(JSON.stringify(spec), spec, 0, 0);
  assert.equal(diagram(JSON.parse(result.text)).primaryPanel, undefined);
  assert.ok(C.planPrimaryPanel(JSON.stringify(spec), spec, 0, 'missing').error);
  diagram(spec).primaryPanel = 'missing';
  assert.ok(C.validate(C.normalize(spec)).warnings.some(w=>w.includes('.primaryPanel:')));
  result = C.planPrimaryPanel(JSON.stringify(spec), spec, 0, null);
  assert.equal(diagram(JSON.parse(result.text)).primaryPanel, undefined);
});
test('state titles and visual cues survive without chips when paused, in reduced motion, and in ambient', () => {
  const d = diagram(fixture()), panel = d.panels[0];
  const snapshot = C.builderHomemapStep(d, 1, 'home', 'happy');
  const host = {querySelector:()=>null};
  C.renderPanelBody(host, panel, snapshot.state, 'pastel', [], 1, false);
  assert.match(host.innerHTML, /class="hmlink"/); assert.match(host.innerHTML, /: detect<\/title>/);
  assert.match(host.innerHTML, /hm-camera hm-detect/);
  assert.doesNotMatch(host.innerHTML, /hmstatus|>detect<\/text>/);
  assert.doesNotMatch(host.innerHTML, /class="hmsig"/);
  const oldMotion = C.RM; C.RM = true;
  try {
    const quiet = {querySelector:()=>null};
    C.renderPanelBody(quiet, panel, snapshot.state, 'pastel', [], 1, true);
    assert.match(quiet.innerHTML, /class="hmlink"/);
    assert.match(quiet.innerHTML, /: detect<\/title>/);
    assert.match(quiet.innerHTML, /hm-camera hm-detect/);
    assert.doesNotMatch(quiet.innerHTML, /hmstatus/);
    assert.doesNotMatch(quiet.innerHTML, /class="hmsig"|class="hmsweep"/);
  } finally { C.RM = oldMotion; }
  C.renderPanelBody(host, panel, panel.initial, 'pastel', [], -1, false);
  assert.doesNotMatch(host.innerHTML, /class="hmlink"/);
  assert.doesNotMatch(host.innerHTML, /hmstatus/);
  assert.match(host.innerHTML, /: scan<\/title>/);
});

test('subject labels opt in without losing names, markers, motion, or hidden-state behavior', () => {
  const panel = diagram(fixture()).panels[0], host = {querySelector:()=>null};
  panel.subjects[0].label = '<Visitor & guest>';
  const draw = (state = {}) => C.renderPanelBody(host, panel, state, 'pastel', [], 0, true);
  draw();
  assert.doesNotMatch(host.innerHTML, /hmactor-label/);
  assert.match(host.innerHTML, /<title>&lt;Visitor &amp; guest&gt;<\/title>/);
  assert.match(host.innerHTML, /data-subject="visitor"/);
  assert.match(host.innerHTML, /text-anchor="middle">Porch cam<\/text>/);
  panel.showSubjectLabels = true; draw({visitor:{x:180,y:80}});
  assert.match(host.innerHTML, /hmactor-label[^>]*>&lt;Visitor &amp; guest&gt;<\/text>/);
  assert.match(host.innerHTML, /transform:translate/);
  assert.match(host._lastHTML, /hmactor-label/);
  draw({visitor:null}); assert.doesNotMatch(host.innerHTML, /data-subject=|hmactor-label/);
  for (const value of [false, undefined, 'true', 1, null]){
    panel.showSubjectLabels = value; draw();
    assert.doesNotMatch(host.innerHTML, /hmactor-label/);
    assert.match(host.innerHTML, /<title>&lt;Visitor &amp; guest&gt;<\/title>/);
  }
});

test('subject label preference survives normalization and validates as a boolean', () => {
  for (const value of [true, false, undefined, 'true', 1, null]){
    const spec = fixture(); diagram(spec).panels[0].showSubjectLabels = value;
    const normalized = C.normalize(spec), result = C.validate(normalized);
    assert.deepEqual(plain(result.errors), []);
    assert.equal(normalized.sections[0].diagram.panels[0].showSubjectLabels, value);
    assert.equal(result.warnings.some(w=>w.includes('.showSubjectLabels:')), value !== undefined && typeof value !== 'boolean');
  }
});

test('device layout moves affect every path without changing states, subjects, or other declarations', () => {
  const spec = fixture(), original = JSON.stringify(spec), d = diagram(spec);
  const result = C.planHomemapLayoutPosition(JSON.stringify(spec, null, 2), spec, 0, 'home', 'device', 'cam', {x:75,y:85});
  assert.ok(!result.error, result.error);
  const next = JSON.parse(result.text), expected = JSON.parse(original);
  Object.assign(diagram(expected).panels[0].devices[0], {x:75,y:85});
  assert.deepEqual(next, expected);
  assert.equal(JSON.stringify(spec), original);
  for (const [pathId, index] of [['happy', 2], ['offline', 5]]){
    const before = C.builderHomemapStep(d, index, 'home', pathId);
    const after = C.builderHomemapStep(diagram(next), index, 'home', pathId);
    assert.deepEqual(plain(after.state), plain(before.state));
    assert.equal(after.model.devices[0].x, 75); assert.equal(after.model.devices[0].y, 85);
    if (after.model.signals.length) assert.equal(after.model.signals[0].fromXY.x, 75);
  }
});

test('room layout moves preserve dimensions, occupants, and original indices through invalid rooms', () => {
  const spec = fixture(), panel = diagram(spec).panels[0];
  panel.rooms.unshift(null, {label:'Invalid',x:-1,y:0,w:30,h:30});
  const before = JSON.stringify(spec);
  const result = C.planHomemapLayoutPosition(before, spec, 0, 'home', 'room', 2, {x:20,y:0});
  assert.ok(!result.error, result.error);
  const next = JSON.parse(result.text), expected = JSON.parse(before);
  Object.assign(diagram(expected).panels[0].rooms[2], {x:20,y:0});
  assert.deepEqual(next, expected);
  assert.equal(JSON.stringify(spec), before);
  const host = {querySelector:()=>null}; C.renderPanelBody(host, panel, {}, 'pastel');
  assert.match(host.innerHTML, /data-home-room="2"/);
  assert.doesNotMatch(host.innerHTML, /data-home-room="[01]"/);
});

test('layout moves reject invalid identities and coordinates and support nested pages and special IDs', () => {
  const spec = fixture(), source = JSON.stringify(spec);
  for (const [kind, key, point] of [['device','missing',{x:1,y:1}], ['subject','missing',{x:1,y:1}],
    ['room',-1,{x:1,y:1}], ['room','0',{x:1,y:1}], ['room',0,{x:320,y:180}],
    ['device','cam',{x:321,y:1}], ['device','cam',{x:-1,y:1}], ['device','cam',{x:0,y:181}],
    ['device','cam',{x:Infinity,y:1}], ['device','cam',{x:'20',y:1}], ['device','cam',null]])
    assert.ok(C.planHomemapLayoutPosition(source, spec, 0, 'home', kind, key, point).error);
  assert.ok(C.planHomemapLayoutPosition(source, spec, 0, 'absent', 'device', 'cam', {x:1,y:1}).error);
  assert.equal(JSON.stringify(spec), source);
  const panel = diagram(spec).panels[0]; panel.id = '__proto__'; panel.devices[0].id = 'constructor';
  spec.page.blocks = [{tabs:[{label:'Map',sections:spec.page.sections}]}]; delete spec.page.sections;
  const moved = C.planHomemapLayoutPosition(JSON.stringify(spec), spec, 0, '__proto__', 'device', 'constructor', {x:320,y:180});
  assert.ok(!moved.error, moved.error);
  const device = JSON.parse(moved.text).page.blocks[0].tabs[0].sections[0].diagram.panels[0].devices[0];
  assert.equal(device.x, 320); assert.equal(device.y, 180);
});
test('room geometry is bounded and labels are escaped before SVG rendering', () => {
  const panel = diagram(fixture()).panels[0], warnings = [];
  panel.rooms = [{label:'<script>bad</script>',x:10,y:10,w:100,h:100}, {x:-2,y:0,w:5,h:5}, {x:0,y:0,w:1000,h:10}, null];
  assert.equal(C.homemapRooms(panel, 'home', warnings).length, 1); assert.equal(warnings.length, 3);
  const host = {querySelector:()=>null}; C.renderPanelBody(host, panel, {}, 'pastel');
  assert.match(host.innerHTML, /&lt;script&gt;bad/); assert.doesNotMatch(host.innerHTML, /<script>/);
});

test('room lighting prioritizes device alerts, then warnings, then visible occupants', () => {
  const panel = diagram(fixture()).panels[0];
  panel.rooms = [{x:0,y:0,w:320,h:180}];
  const tone = state => C.homemapRoomModel(panel, C.homemapModel(panel, state))[0].tone;
  assert.equal(tone({}), 'occupied');
  assert.equal(tone({visitor:null}), 'quiet');
  assert.equal(tone({motion:'warn'}), 'warn');
  assert.equal(tone({motion:'warn',hub:'alert'}), 'alert');
  assert.equal(tone({cam:'detect'}), 'alert');
  assert.equal(tone({cam:'rec',hub:'tx',visitor:null}), 'quiet', 'ordinary activity is not an alarm');
  const before = JSON.stringify(panel);
  tone({motion:'alert'});
  assert.equal(JSON.stringify(panel), before, 'lighting cannot write back device states');
});

test('room lighting assigns shared boundaries once, includes frame edges, and ignores invalid rooms', () => {
  const panel = {devices:[], subjects:[{id:'person',x:160,y:90}], rooms:[
    {x:0,y:0,w:160,h:90}, {x:160,y:0,w:160,h:90},
    {x:0,y:90,w:160,h:90}, {x:160,y:90,w:160,h:90},
    {x:0,y:0,w:400,h:180}, null
  ]};
  const tones = state => plain(C.homemapRoomModel(panel, C.homemapModel(panel, state)).map(r=>r.tone));
  assert.deepEqual(tones({}), ['quiet','quiet','quiet','occupied']);
  assert.deepEqual(tones({person:{x:320,y:180}}), ['quiet','quiet','quiet','occupied']);
  assert.deepEqual(tones({person:{x:0,y:0}}), ['occupied','quiet','quiet','quiet']);
  assert.deepEqual(tones({person:null}), ['quiet','quiet','quiet','quiet']);
});

test('doors animate only between physical open/closed states and keep a stable final baseline', () => {
  const panel = diagram(fixture()).panels[0], host = {querySelector:()=>null};
  const draw = (state, animate=true) => C.renderPanelBody(host, panel, {door:state}, 'pastel', [], 0, animate);
  draw('open');
  assert.doesNotMatch(host.innerHTML, /hmdoor-opening|hmdoor-closing/);
  draw('closed');
  assert.match(host.innerHTML, /hmdoor-closing/);
  assert.doesNotMatch(host._lastHTML, /hmdoor-opening|hmdoor-closing/);
  host.innerHTML = 'UNCHANGED'; draw('closed');
  assert.equal(host.innerHTML, 'UNCHANGED');
  draw('alert');
  assert.doesNotMatch(host.innerHTML, /hmdoor-opening|hmdoor-closing/, 'closed to alert stays physically closed');
  draw('open'); assert.match(host.innerHTML, /hmdoor-opening/);
  draw('closed', false); assert.doesNotMatch(host.innerHTML, /hmdoor-opening|hmdoor-closing/);
  const oldMotion = C.RM; C.RM = true;
  try {
    draw('open');
    assert.match(host.innerHTML, /hm-entry hm-open/);
    assert.doesNotMatch(host.innerHTML, /hmdoor-opening|hmdoor-closing/);
  } finally { C.RM = oldMotion; }
});

test('subject trails connect only visible animated moves and never survive hiding or immediate renders', () => {
  const panel = diagram(fixture()).panels[0], host = {querySelector:()=>null};
  const draw = (value, animate=true) => C.renderPanelBody(host, panel, {visitor:value}, 'pastel', [], 0, animate);
  draw({x:20,y:30}); assert.doesNotMatch(host.innerHTML, /class="hmtrail"/);
  draw({x:80,y:90}); assert.match(host.innerHTML, /class="hmtrail" d="M20 36 L80 108"/);
  assert.doesNotMatch(host._lastHTML, /class="hmtrail"/);
  draw(null); assert.doesNotMatch(host.innerHTML, /hmtrail|data-subject=/);
  draw({x:100,y:120}); assert.doesNotMatch(host.innerHTML, /class="hmtrail"/);
  draw({x:150,y:120}, false); assert.doesNotMatch(host.innerHTML, /class="hmtrail"/);
  const oldMotion = C.RM; C.RM = true;
  try {
    draw({x:200,y:120}); assert.doesNotMatch(host.innerHTML, /class="hmtrail"/);
    assert.match(host.innerHTML, /class="hmsubjectdot" cx="200" cy="120"/);
  } finally { C.RM = oldMotion; }
});

test('taller Home display preserves spec coordinates and inversely maps placement without stretching markers', () => {
  const spec = fixture(), panel = diagram(spec).panels[0], before = JSON.stringify(spec);
  const host = {querySelector:()=>null};
  C.renderPanelBody(host, panel, {}, 'pastel', [], 0, false);
  assert.match(host.innerHTML, /viewBox="0 0 320 216"/);
  assert.match(host.innerHTML, /data-device="door" transform="translate\(0 18\.000\)"/);
  assert.match(host.innerHTML, /class="hmmarker" cx="102" cy="90" r="8\.5"/);
  assert.match(host.innerHTML, /transform="translate\(0 26\.000\)"><g class="hmsubject" data-subject="visitor"/);
  assert.equal(JSON.stringify(spec), before, 'display projection never rewrites authored geometry');
  for (const [display, expected] of [
    [{x:0,y:0},{x:0,y:0}], [{x:102,y:108},{x:102,y:90}],
    [{x:35,y:156},{x:35,y:130}], [{x:320,y:216},{x:320,y:180}],
    [{x:-20,y:-10},{x:0,y:0}], [{x:350,y:260},{x:320,y:180}]
  ]) assert.deepEqual(plain(C.homemapPointFromDisplay(display)),expected);
  const moved = C.planHomemapLayoutPosition(JSON.stringify(spec),spec,0,'home','device','door',C.homemapPointFromDisplay({x:120,y:144}));
  assert.ok(!moved.error,moved.error);
  const door = diagram(JSON.parse(moved.text)).panels[0].devices.find(d=>d.id==='door');
  assert.deepEqual({x:door.x,y:door.y},{x:120,y:120}, 'drag destination stays in the original authoring frame');
});
