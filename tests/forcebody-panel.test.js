const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {console};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js']) vm.runInContext(readSource(file), C);
const plain = v => JSON.parse(JSON.stringify(v));
const panel = () => ({id:'p',type:'forcebody',mass:2,label:'Puck',trial:'Trial A'});
const model = (p,s) => plain(C.forcebodyModel(p,s));
const diagram = p => ({nodes:{n:{}},rows:[['n']],panels:[p || panel()]});
const validate = d => plain(C.validate(C.normalize(d)));

test('forcebody sums SI components and divides by declared mass without integrating velocity', () => {
  const state = {forces:[{x:6,y:8},{x:-2,y:-2}],velocity:{x:3,y:0}};
  const m = model(panel(),state);
  assert.deepEqual(m.net, {x:4,y:6,magnitude:Math.hypot(4,6)});
  assert.deepEqual(m.acceleration,{x:2,y:3,magnitude:Math.hypot(4,6)/2});
  assert.deepEqual(m.velocity,{x:3,y:0});
  assert.equal(m.relation,'Moving · speeding up now');
  const heavy = model({...panel(),mass:4,trial:'Trial B'},state);
  assert.equal(heavy.acceleration.x,1); assert.equal(heavy.acceleration.y,1.5);
  assert.deepEqual(heavy.velocity,m.velocity);
  assert.deepEqual(model(panel(),state),m,'seeking the same snapshot repeats exactly');
  assert.deepEqual(state,{forces:[{x:6,y:8},{x:-2,y:-2}],velocity:{x:3,y:0}});
});

test('zero, opposing and perpendicular forces distinguish velocity from acceleration', () => {
  const balanced = model(panel(),{forces:[{x:4,y:0},{x:-4,y:0}],velocity:{x:2,y:0}});
  assert.deepEqual(balanced.net,{x:0,y:0,magnitude:0});
  assert.deepEqual(balanced.acceleration,{x:0,y:0,magnitude:0});
  assert.equal(balanced.relation,'Moving · no acceleration');
  const slowing = model(panel(),{forces:[{x:-4,y:0}],velocity:{x:2,y:0}});
  assert.equal(slowing.acceleration.x,-2); assert.equal(slowing.velocity.x,2);
  assert.equal(slowing.relation,'Moving · slowing now');
  assert.equal(model(panel(),{forces:[{x:0,y:4}],velocity:{x:2,y:0}}).relation,'Turning · no instantaneous speed change');
  assert.equal(model(panel(),{forces:[{x:4,y:0}],velocity:{x:0,y:0}}).relation,'At rest in this snapshot');
  assert.equal(model(panel(),{}).relation,'Velocity not specified');
});

test('sparse snapshots, complete force lists, enterOnce and alternate seeking remain independent', () => {
  const p = {...panel(),initial:{forces:[{label:'push',x:4,y:0}],velocity:{x:2,y:0}}};
  const d = {...diagram(p),paths:[{id:'one',label:'One',steps:['a','b','c']},{id:'two',label:'Two',steps:['a','d']}],steps:[
    {id:'a',nodes:['n']},
    {id:'b',nodes:['n'],panels:{p:{enterOnce:{forces:[{x:-4,y:0}]}}}},
    {id:'c',nodes:['n'],panels:{p:{caption:'Carry on'}}},
    {id:'d',nodes:['n'],panels:{p:{forces:[],velocity:null}}}
  ]};
  const before = JSON.stringify(d);
  const one = C.foldPanelStates(C.diagramForPath(d,'one')).p;
  const two = C.foldPanelStates(C.diagramForPath(d,'two')).p;
  assert.equal(model(p,one[1]).acceleration.x,-2);
  assert.equal(model(p,one[2]).acceleration.x,2);
  assert.equal(model(p,two[1]).acceleration.x,0);
  assert.equal(model(p,two[1]).velocity,null);
  assert.deepEqual(plain(C.foldPanelStates(C.diagramForPath(d,'one')).p),plain(one));
  assert.equal(JSON.stringify(d),before);
  assert.equal(C.forcebodyFold(p,[]).length,1);
  const invalid = C.forcebodyFold(p,[{panels:{p:{forces:[{x:'4',y:0}],mass:10}}}]);
  assert.equal(model(p,invalid[0]).net.x,4); assert.equal(model(p,invalid[0]).mass,2);
});

test('validation rejects invalid units, malformed vectors, oversized lists and mass patches', () => {
  const p = {...panel(),mass:0,trial:4,initial:{forces:[{x:Infinity,y:0}],velocity:{x:'2',y:0},caption:4}};
  const d = {...diagram(p),steps:[{id:'s',nodes:['n'],panels:{p:{forces:Array(5).fill({x:1,y:0}),mass:4,enterOnce:{velocity:3},extra:true}}}]};
  const warnings = validate(d).warnings.join('\n');
  for (const text of ['.mass: expected mass in kg','.trial: expected text','.initial.forces[0]','.initial.velocity','.initial.caption','0–4 force vectors','mass is a declaration','enterOnce.velocity','extra: unknown field']) assert.ok(warnings.includes(text),text+'\n'+warnings);
  assert.equal(model(p,p.initial).mass,null);
  assert.equal(model(p,p.initial).acceleration,null);
  assert.equal(model(p,p.initial).forces.length,0);
  for (const mass of [-1,0,1e-7,1e7,Infinity,NaN,'2']) assert.equal(C.forcebodyMass(mass),false);
  for (const mass of [1e-6,2,1e6]) assert.equal(C.forcebodyMass(mass),true);
  const bounded = model({...panel(),mass:1e-6},{forces:Array(4).fill({x:1e6,y:1e6}),velocity:{x:1e6,y:-1e6}});
  assert.ok(Number.isFinite(bounded.acceleration.magnitude));
  assert.equal(bounded.net.x,4e6);
});

test('render safely escapes authored text and handles malformed snapshots', () => {
  const hostile = '<img src=x onerror="bad()">&';
  const p = {...panel(),label:hostile,trial:hostile};
  const s = {forces:[{label:hostile,x:-4,y:0}],velocity:{x:2,y:0},caption:hostile,note:hostile};
  const html = C.forcebodyHTML(p,s);
  assert.doesNotMatch(html,/<img|onerror="bad|NaN|Infinity|undefined/);
  assert.match(html,/&lt;img/); assert.match(html,/role="img" aria-label=/);
  assert.match(html,/Moving · slowing now/); assert.match(html,/m\/s²/);
  assert.doesNotMatch(html,/forcebody-trail/); assert.match(html,/forcebody-velocity/);
  assert.match(html,/F1/); assert.match(html,/Force arrows share one scale/);
  for (const state of [null,2,[],{forces:'bad'},{forces:[null]},{velocity:{x:NaN,y:0}},{forces:Array(5).fill({x:0,y:0})}]) {
    assert.doesNotThrow(() => C.forcebodyHTML(p,state));
    assert.doesNotMatch(C.forcebodyHTML(p,state),/NaN|Infinity|undefined/);
  }
  const proto = JSON.parse('{"__proto__":{"velocity":{"x":9,"y":0}},"forces":[]}');
  assert.equal(model(panel(),proto).velocity,null);
  assert.doesNotMatch(C.forcebodyHTML(panel(),{velocity:{x:0,y:0}}),/class="forcebody-trail"/);
  assert.match(C.forcebodyHTML(panel(),{}),/Balanced/);
});

test('registry discovers forcebody picker, metadata, styles and render without central edits', () => {
  const template = {...plain(C.PANEL_TEMPLATES.forcebody),id:'p',type:'forcebody'};
  assert.deepEqual(validate(diagram(template)),{errors:[],warnings:[]});
  const before = JSON.stringify(C.PANEL_TEMPLATES.forcebody);
  const sample = C.panelPickerExample('forcebody');
  assert.deepEqual(validate(diagram(plain(sample.panel))),{errors:[],warnings:[]});
  assert.equal(model(sample.panel,sample.state).relation,'Moving · slowing now');
  assert.equal(JSON.stringify(C.PANEL_TEMPLATES.forcebody),before);
  assert.ok(C.PANEL_CATALOG.find(p => p.type === 'forcebody'));
  assert.deepEqual(panelAssets().features['panel.forcebody'],{label:'Force body panel',since:'0.2.0'});
  const desc = C.PanelRegistry.get('forcebody');
  assert.match(desc.render(null,panel(),{},'daylight').html,/forcebody-scene/);
  assert.ok(desc.authoring.setupFields.some(f => f[0] === 'mass'));
  assert.ok(!desc.authoring.patchFields.some(f => f[0] === 'mass'));
  assert.match(readStyles('style.core.css'),/\.forcebody\{/);
  assert.match(desc.styles,/prefers-reduced-motion/); assert.match(desc.styles,/@media print/);
});


test('direction rows distinguish authored velocity from computed acceleration without a motion history', () => {
  const html = C.forcebodyHTML(panel(), {forces:[{x:-4,y:0}],velocity:{x:2,y:0}});
  assert.match(html,/Velocity v<\/b><small>Authored snapshot/);
  assert.match(html,/Acceleration a<\/b><small>Calculated from forces/);
  assert.match(html,/\(\+2, 0\) m\/s<\/strong><span>Right/);
  assert.match(html,/\(-2, 0\) m\/s²<\/strong><span>Left/);
  assert.match(html,/class="forcebody-velocity"><line x1="60" y1="50" x2="100" y2="50"/);
  assert.match(html,/class="forcebody-acceleration"><line x1="60" y1="50" x2="20" y2="50"/);
  assert.doesNotMatch(html,/trail/);
  const zero = C.forcebodyHTML(panel(),{velocity:{x:0,y:0}});
  const unspecified = C.forcebodyHTML(panel(),{});
  assert.match(zero,/Zero vector/);
  assert.equal((zero.match(/class="forcebody-direction-zero"/g) || []).length,2);
  assert.match(unspecified,/Not specified/);
  assert.equal((unspecified.match(/class="forcebody-direction-unknown"/g) || []).length,1);
  assert.equal((unspecified.match(/class="forcebody-direction-zero"/g) || []).length,1);
  const unavailable = C.forcebodyHTML({...panel(),mass:null},{});
  assert.equal((unavailable.match(/class="forcebody-direction-unknown"/g) || []).length,2);
});

test('fixed acceleration scale preserves the mass comparison and explicitly marks overflow', () => {
  const state = {forces:[{x:4,y:0}],velocity:{x:2,y:0}};
  const light = C.forcebodyHTML(panel(),state);
  const heavy = C.forcebodyHTML({...panel(),mass:4},state);
  assert.match(light,/Acceleration magnitude 2 m\/s² on a fixed zero to four scale/);
  assert.match(heavy,/Acceleration magnitude 1 m\/s² on a fixed zero to four scale/);
  assert.match(light,/forcebody-meter-track"><span style="width:50%"/);
  assert.match(heavy,/forcebody-meter-track"><span style="width:25%"/);
  const large = C.forcebodyHTML(panel(),{forces:[{x:100,y:0}]});
  assert.match(large,/forcebody-meter-track"><span style="width:100%"/);
  assert.match(large,/value exceeds 4 m\/s²; bar capped/);
  assert.match(large,/full length: 100 N/);
});
