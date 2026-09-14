'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const C = {URL}; vm.createContext(C);
for (const name of ['validator', 'engine', 'builder.workbench'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/' + name + '.js'), 'utf8'), C);
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../src/starters/homemap-story.json'), 'utf8'));
const diagram = spec => spec.page.sections[0].diagram;
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
test('static signals and textual states survive paused jumps and reduced motion, and clear in ambient', () => {
  const d = diagram(fixture()), panel = d.panels[0];
  const snapshot = C.builderHomemapStep(d, 1, 'home', 'happy');
  const host = {querySelector:()=>null};
  C.renderPanelBody(host, panel, snapshot.state, 'pastel', [], 1, false);
  assert.match(host.innerHTML, /class="hmlink"/); assert.match(host.innerHTML, />detect<\/text>/);
  assert.doesNotMatch(host.innerHTML, /class="hmsig"/);
  const oldMotion = C.RM; C.RM = true;
  try {
    const quiet = {querySelector:()=>null};
    C.renderPanelBody(quiet, panel, snapshot.state, 'pastel', [], 1, true);
    assert.match(quiet.innerHTML, /class="hmlink"/);
    assert.doesNotMatch(quiet.innerHTML, /class="hmsig"|class="hmsweep"/);
  } finally { C.RM = oldMotion; }
  C.renderPanelBody(host, panel, panel.initial, 'pastel', [], -1, false);
  assert.doesNotMatch(host.innerHTML, /class="hmlink"/);
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
  draw({x:80,y:90}); assert.match(host.innerHTML, /class="hmtrail" d="M20 30 L80 90"/);
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
