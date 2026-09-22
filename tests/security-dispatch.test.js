'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const C = {URL};
vm.createContext(C);
for (const file of ['compatibility.js','validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js'])
  vm.runInContext(readSource(file), C, {filename:file});
const plain = value => JSON.parse(JSON.stringify(value));
const definition = type => C.PanelRegistry.get(type);
const panel = type => ({id:type,type,...plain(definition(type).authoring.template)});
const render = (panel, state) => definition(panel.type).render({},panel,state).html;
const fixture = panels => ({nodes:{n:{title:'Incident service'}},rows:[['n']],edges:[],panels,steps:[]});
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze);Object.freeze(value); }
  return value;
}
function verify(p, patch) {
  const d = fixture([p]);
  if (patch !== undefined) d.steps.push({id:'inspect',text:'Inspect',panels:{[p.id]:patch}});
  return plain(C.validate(C.normalize(d)));
}

test('security and dispatch register complete DOM-free panel contracts and valid templates/previews', () => {
  assert.equal('document' in C,false);
  for (const type of ['security','dispatch']) {
    const def = definition(type), p = panel(type), sample = C.panelPickerExample(type);
    assert.equal(def.since,'0.1.0');
    assert.equal(def.layout.attachControls,true);
    assert.deepEqual(verify(p),{errors:[],warnings:[]});
    assert.deepEqual(verify(sample.panel),{errors:[],warnings:[]});
    assert.ok(C.PANEL_CATALOG.some(item => item.type === type));
    assert.ok(render(p,sample.state).includes(type === 'security' ? 'secmon' : 'dispatch'));
  }
});

test('missing state reports unknown assessment, health, alarms and response availability', () => {
  const monitor = panel('security'), response = panel('dispatch');
  const a = render(monitor,{}), b = render(response,{});
  assert.match(a,/Status unknown/);assert.match(a,/Unverified/);
  assert.equal((a.match(/secmon-health-unknown/g)||[]).length,3);
  assert.equal((a.match(/Not assessed/g)||[]).length,3);
  assert.doesNotMatch(a,/secmon-alarm-clear/);
  assert.match(b,/Dispatch status unknown/);assert.match(b,/Priority not set/);
  assert.equal((b.match(/dispatch-unit-unknown/g)||[]).length,2);
  assert.doesNotMatch(b,/is-current|Arrival confirmed|Ready for assignment/);
});

test('top-level patches carry, but a sensor/unit object replaces only that entire item', () => {
  for (const [type,key,first,second,htmlExpectation] of [
    ['security','frontDoor',{health:'online',alarm:'triggered',detail:'Original'},{alarm:'acknowledged'},/secmon-health-unknown/],
    ['dispatch','patrol',{status:'enroute',eta:'4 min',detail:'Original'},{status:'onscene'},/Arrival confirmed/]
  ]) {
    const p = panel(type), source = freeze(fixture([p]));
    const steps = [{panels:{[type]:{note:'Carry me',[key]:first}}},{panels:{[type]:{[key]:second}}},{nodes:['n']}];
    const before = JSON.stringify(steps), snapshots = definition(type).fold(p,steps);
    assert.deepEqual(plain(snapshots[0][key]),first);
    assert.deepEqual(plain(snapshots[1][key]),second);
    assert.deepEqual(plain(snapshots[2][key]),second);
    assert.equal(snapshots[2].note,'Carry me');
    assert.equal(snapshots[1][key].detail,undefined);
    assert.match(render(p,snapshots[1]),htmlExpectation);
    assert.equal(JSON.stringify(steps),before);assert.equal(source.panels[0],p);
  }
});

test('null and empty item objects reset to unknown rather than implying clear or available', () => {
  for (const [type,key] of [['security','frontDoor'],['dispatch','patrol']]) {
    const p = panel(type), snapshots = definition(type).fold(p,[
      {panels:{[type]:{[key]:null}}},{panels:{[type]:{[key]:{}}}}
    ]);
    assert.equal(snapshots[0][key],null);
    assert.deepEqual(plain(snapshots[1][key]),{});
    for (const state of snapshots) assert.match(render(p,state),type === 'security' ? /secmon-health-unknown/ : /dispatch-unit-unknown/);
  }
});

test('malformed root/item patches and invalid enum values cannot corrupt valid carried state', () => {
  for (const [type,key,field,bad] of [['security','frontDoor','health','healthy'],['dispatch','patrol','status','flying']]) {
    const p = panel(type), initial = plain(p.initial), snapshots = definition(type).fold(p,[
      {panels:{[type]:'invalid'}},{panels:{[type]:{status:42,[key]:[]}}},
      {panels:{[type]:{[key]:{[field]:bad},enterOnce:{status:'<script>'}}}},
      {panels:{[type]:{[key]:{unexpected:true},enterOnce:false}}}
    ]);
    for (const state of snapshots) {
      assert.equal(state.status,initial.status);
      assert.deepEqual(plain(state[key]),initial[key]);
    }
    const invalid = verify(p,{status:'bogus',[key]:{[field]:bad},enterOnce:{[key]:{detail:[]}}});
    assert.ok(invalid.warnings.some(w => w.includes('.panels.'+type+'.status')));
    assert.ok(invalid.warnings.some(w => w.includes('.'+key+'.'+field)));
    assert.ok(invalid.warnings.some(w => w.includes('.enterOnce.'+key+'.detail')));
  }
});

test('enterOnce applies sanitized item replacements for one step without changing carried state', () => {
  for (const [type,key,transient] of [
    ['security','frontDoor',{alarm:'triggered'}],['dispatch','patrol',{status:'enroute',eta:'2 min'}]
  ]) {
    const p = panel(type), initial = plain(p.initial[key]);
    const result = definition(type).fold(p,[{panels:{[type]:{note:'steady',enterOnce:{note:'temporary',[key]:transient}}}},{nodes:['n']}]);
    assert.deepEqual(plain(result[0][key]),transient);assert.equal(result[0].note,'temporary');
    assert.deepEqual(plain(result[1][key]),initial);assert.equal(result[1].note,'steady');
    assert.equal(result[1].enterOnce,undefined);
  }
});

test('security alarms and assessment never initiate or advance dispatch without a patch', () => {
  const monitor = panel('security'), response = panel('dispatch'), d = fixture([monitor,response]);
  d.steps = [{id:'trigger',panels:{security:{status:'alarm',frontDoor:{health:'online',alarm:'triggered'}}}},
    {id:'verify',panels:{security:{status:'verified',assessment:'verified'}}}];
  const result = C.foldPanelStates(d);
  assert.equal(result.security[1].status,'verified');
  assert.deepEqual(plain(result.dispatch.map(s => s.status)),['idle','idle']);
  assert.match(render(response,result.dispatch[1]),/No dispatch requested/);
  assert.doesNotMatch(render(response,result.dispatch[1]),/is-current/);
});

test('alternate paths isolate outcomes and replay is deterministic without mutating source', () => {
  const response = panel('dispatch'), d = fixture([response]);
  d.steps = [{id:'request',panels:{dispatch:{status:'requested'}}},
    {id:'send',panels:{dispatch:{status:'enroute',patrol:{status:'enroute',eta:'3 min'}}}},
    {id:'arrive',panels:{dispatch:{status:'onscene',patrol:{status:'onscene'}}}},
    {id:'fail',panels:{dispatch:{status:'blocked',patrol:{status:'unavailable'}}}}];
  d.paths = [{id:'success',steps:['request','send','arrive']},{id:'failure',steps:['request','fail']}];
  freeze(d);const before = JSON.stringify(d);
  const happy = C.foldPanelStates(C.diagramForPath(d,'success')).dispatch;
  const failed = C.foldPanelStates(C.diagramForPath(d,'failure')).dispatch;
  assert.deepEqual(plain(happy.map(s=>s.status)),['requested','enroute','onscene']);
  assert.deepEqual(plain(failed.map(s=>s.status)),['requested','blocked']);
  assert.equal(failed[1].patrol.eta,undefined);
  const final = render(response,happy[2]);render(response,failed[1]);render(response,happy[0]);
  assert.equal(render(response,happy[2]),final);
  failed[1].patrol.status='enroute';
  assert.equal(C.foldPanelStates(C.diagramForPath(d,'failure')).dispatch[1].patrol.status,'unavailable');
  assert.equal(JSON.stringify(d),before);
});

test('response stage only marks the authored current stage; resolution does not fabricate arrival', () => {
  const p = panel('dispatch');
  for (const status of ['requested','assigned','enroute','onscene']) {
    const html = render(p,{status});
    assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
    assert.equal((html.match(/is-current/g)||[]).length,1);
    assert.doesNotMatch(html,/dispatch-unit-onscene/);
  }
  for (const status of ['blocked','cancelled','resolved','idle','unknown']) {
    assert.doesNotMatch(render(p,{status}),/aria-current="step"|is-current/);
    assert.doesNotMatch(render(p,{status}),/Arrival confirmed/);
  }
  assert.match(render(p,{status:'blocked',detail:'Transport rejected request'}),/Handoff not accepted/);
});

test('security health, alarm and assessment remain independent declared facts', () => {
  const p = panel('security');
  const html = render(p,{status:'armed',assessment:'unverified',frontDoor:{health:'offline',alarm:'clear'}});
  assert.match(html,/secmon-armed/);assert.match(html,/secmon-health-offline/);assert.match(html,/secmon-alarm-clear/);
  assert.match(html,/Unverified/);assert.doesNotMatch(html,/Incident verified/);
  assert.match(render(p,{status:'cleared',assessment:'false-alarm'}),/False alarm/);
});

test('declared rows are bounded, invalid IDs are ignored and hostile strings render as text', () => {
  const hostile = '<img src=x onerror="alert(1)">';
  for (const [type,collection,max,key] of [['security','sensors',12,'frontDoor'],['dispatch','responders',8,'patrol']]) {
    const p = panel(type);
    p.site = p.agency = hostile;
    p[collection] = [{id:key,label:hostile,kind:'constructor',zone:hostile,callsign:hostile},
      {id:key,label:'Duplicate'},null,{id:'status',label:'Reserved'},{id:'__proto__',label:'Unsafe'},
      ...Array.from({length:max},(_,i)=>({id:'extra'+i,label:'Extra'}))];
    const issues = verify(p);
    assert.ok(issues.warnings.some(w=>w.includes('duplicate id')));
    assert.ok(issues.warnings.some(w=>w.includes('reserved')));
    assert.ok(issues.warnings.some(w=>w.includes('only the first '+max)));
    const html = render(p,{operator:hostile,dispatcher:hostile,incident:hostile,location:hostile,detail:hostile,note:hostile,
      [key]:type==='security'?{health:'online',alarm:'triggered',detail:hostile}:{status:'enroute',eta:hostile,detail:hostile}});
    assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|function Object|data-(?:sensor|responder)-id="status"/);
    assert.equal((html.match(new RegExp('data-(?:sensor|responder)-id="'+key+'"','g'))||[]).length,1);
    assert.ok((html.match(/data-(?:sensor|responder)-id=/g)||[]).length<=max);
  }
});

test('prototype-shaped source data cannot inject properties or leak an undeclared row', () => {
  for (const type of ['security','dispatch']) {
    const p = panel(type), raw = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"detail":"bad"},"status":"unknown"}');
    const snapshots = definition(type).fold(p,[{panels:{[type]:raw}}]);
    assert.equal(snapshots[0].polluted,undefined);
    assert.equal(Object.prototype.polluted,undefined);
    assert.equal(Object.hasOwn(snapshots[0],'__proto__'),false);
    assert.equal(Object.hasOwn(snapshots[0],'constructor'),false);
    assert.doesNotMatch(render(p,snapshots[0]),/polluted|>bad</);
  }
});

test('editor exposes declared sensor/unit controls and ignores invalid patch provenance', () => {
  for (const [type,key,child] of [['security','frontDoor','alarm'],['dispatch','patrol','eta']]) {
    const p = panel(type), fields = plain(C.panelPatchFields(p));
    assert.equal(fields.find(f=>f[0]==='status')[1],'enum');
    const item = fields.find(f=>f[0]===key);
    assert.equal(item[1],'objf');assert.ok(item[2].some(f=>f[0]===child));
    const d = fixture([p]);d.steps = [{id:'invalid',panels:{[type]:{status:'invalid',enterOnce:{status:'invalid'}}}}];
    const effective = C.builderEffectivePanelStates(d,0).panels[0];
    assert.equal(effective.fields.find(f=>f.key==='status').origin.kind,'initial');
  }
});

test('new presentations use the shared lifecycle and explicit reduced-motion/print CSS', () => {
  for (const type of ['security','dispatch']) {
    const src = fs.readFileSync(path.join(__dirname,'../src/panels/types',type+'.js'),'utf8');
    assert.doesNotMatch(src,/setTimeout\(|setInterval\(|requestAnimationFrame\(/);
    assert.match(src,/foldSanitizedPanelStates/);
    assert.match(definition(type).styles,/@media\(prefers-reduced-motion:reduce\)/);
    assert.match(definition(type).styles,/@media print/);
    assert.match(definition(type).styles,/@container\(max-width:260px\)/);
  }
});
