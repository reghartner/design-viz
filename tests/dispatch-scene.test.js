'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {readSource} = require('../tools/source-loader.cjs');
const C = {URL};
vm.createContext(C);
for (const file of ['validator.js','engine.js','builder.workbench.js']) vm.runInContext(readSource(file),C,{filename:file});
const def = C.PanelRegistry.get('dispatch');
const plain = value => JSON.parse(JSON.stringify(value));
const panel = () => ({id:'response',type:'dispatch',...plain(def.authoring.template)});
const render = (p,state,host = {},animate = false) => def.render(host,p,state,'pastel',[],0,animate);
const fixture = p => ({nodes:{n:{title:'Response service'}},rows:[['n']],edges:[],panels:[p],steps:[]});
const vehicle = (html,id) => html.match(new RegExp('<g class="dispatch-vehicle [^>]+data-unit-id="'+id+'"[^>]*>'))?.[0];

test('response scene shows distinct authored unit kinds and never infers assignment from incident/global status', () => {
  const p=panel();p.responders=['police','fire','medical','security'].map(kind=>({id:kind,kind,callsign:kind}));
  const state={status:'enroute',timeOfDay:'night'};
  assert.doesNotMatch(render(p,state).html,/data-unit-id=/);
  for(const kind of ['police','fire','medical','security'])state[kind]={status:'enroute',progress:35};
  const html=render(p,state).html;
  for(const kind of ['police','fire','medical','security']){
    assert.match(vehicle(html,kind),new RegExp('dispatch-vehicle-'+kind));
    assert.match(vehicle(html,kind),/data-progress="35"/);
  }
  assert.match(html,/dispatch-scene-night/);assert.match(html,/dispatch-destination-house/);
  assert.match(html,/RESPONSE BASE/);assert.match(html,/Neighborhood response scene/);
  assert.match(html,/>FIRE</);assert.doesNotMatch(html,/\sid="/);
});

test('parked, arriving, unavailable and released units respect explicit status and lights',()=>{
  const p=panel();
  for(const status of ['available','assigned']){
    const html=render(p,{patrol:{status,progress:100,lights:'on'}}).html;
    assert.match(vehicle(html,'patrol'),/data-progress="0"/);
    assert.doesNotMatch(vehicle(html,'patrol'),/dispatch-lights-on/);
    assert.doesNotMatch(html,/class="dispatch-arrival"/);
  }
  for(const status of ['unknown','unavailable','released'])assert.equal(vehicle(render(p,{patrol:{status,progress:90,lights:'on'}}).html,'patrol'),undefined);
  for(const state of [{},{patrol:null},{patrol:{}},{status:'onscene'}])assert.equal(vehicle(render(p,state).html,'patrol'),undefined);
  const travelling=render(p,{patrol:{status:'enroute',progress:100,lights:'off'}}).html;
  assert.match(vehicle(travelling,'patrol'),/data-progress="100"/);
  assert.doesNotMatch(vehicle(travelling,'patrol'),/dispatch-lights-on/);
  assert.doesNotMatch(travelling,/class="dispatch-arrival"/);
  const arrived=render(p,{patrol:{status:'onscene',progress:3}}).html;
  assert.match(vehicle(arrived,'patrol'),/data-progress="100"/);
  assert.match(arrived,/class="dispatch-arrival"/);
  assert.match(render(p,{patrol:{status:'enroute'}}).html,/data-progress="45"/);
});

test('numeric route validation rejects malformed values without resetting good carried state',()=>{
  const p=panel();p.initial.patrol={status:'enroute',progress:25,eta:'4 min'};
  for(const invalid of [-1,101,Infinity,NaN,'25',null,{},[]]){
    const steps=[{panels:{response:{patrol:{progress:invalid}}}}];
    const snapshots=def.fold(p,steps);
    assert.deepEqual(plain(snapshots[0].patrol),p.initial.patrol);
    const warnings=[];def.validatePatch(steps[0].panels.response,'d.steps[0].panels.response',p,warnings);
    assert.ok(warnings.some(w=>w.includes('.patrol.progress: expected a finite number from 0 to 100')));
    assert.doesNotMatch(render(p,{patrol:{status:'enroute',progress:invalid}}).html,/NaN|Infinity/);
  }
  for(const progress of [0,100,13.25]){
    const patch={patrol:{status:'enroute',progress}},warnings=[];
    def.validatePatch(patch,'d.step',p,warnings);assert.deepEqual(warnings,[]);
    assert.equal(def.fold(p,[{panels:{response:patch}}])[0].patrol.progress,progress);
  }
});

test('progress obeys whole-unit replacement and one-step transient semantics',()=>{
  const p=panel();p.initial.patrol={status:'assigned',progress:0,eta:'4 min'};
  const steps=[{panels:{response:{patrol:{status:'enroute',progress:35},enterOnce:{patrol:{status:'enroute',progress:80,lights:'off'}}}}},{nodes:['n']},{panels:{response:{patrol:{status:'onscene'}}}}];
  const before=JSON.stringify(steps),snapshots=def.fold(p,steps);
  assert.deepEqual(plain(snapshots[0].patrol),{status:'enroute',lights:'off',progress:80});
  assert.deepEqual(plain(snapshots[1].patrol),{status:'enroute',progress:35});
  assert.deepEqual(plain(snapshots[2].patrol),{status:'onscene'});
  assert.equal(JSON.stringify(steps),before);
});

test('direct, reverse and alternate navigation uses absolute route positions without progress leakage',()=>{
  const p=panel(),d=fixture(p);d.steps=[{id:'request',panels:{response:{patrol:{status:'assigned'}}}},{id:'travel',panels:{response:{patrol:{status:'enroute',progress:35}}}},{id:'near',panels:{response:{patrol:{status:'enroute',progress:78}}}},{id:'arrival',panels:{response:{patrol:{status:'onscene'}}}},{id:'blocked',panels:{response:{status:'blocked',patrol:{status:'unavailable'}}}}];
  d.paths=[{id:'happy',steps:['request','travel','near','arrival']},{id:'blocked',steps:['request','blocked']}];
  const good=C.foldPanelStates(C.diagramForPath(d,'happy')).response,bad=C.foldPanelStates(C.diagramForPath(d,'blocked')).response;
  const h={},first=render(p,good[1],h,true);assert.equal(first.baseline,null);
  const onward=render(p,good[2],h,true);assert.match(onward.html,/dispatch-vehicle-travel" style="transform:translate\(-/);
  assert.ok(onward.baseline);assert.doesNotMatch(onward.baseline,/dispatch-vehicle-travel" style=/);
  assert.equal(onward.baseline,render(p,good[2],{},true).html);
  const same=render(p,{...good[2],note:'Different note only'},h,true);assert.equal(same.baseline,null);assert.doesNotMatch(same.html,/dispatch-vehicle-travel" style=/);
  const reverse=render(p,good[1],h,true);assert.match(reverse.html,/dispatch-vehicle-travel" style="transform:translate\([0-9]/);
  assert.equal(vehicle(render(p,bad[1],h,true).html,'patrol'),undefined);
  const revisit=render(p,good[2],h,true);assert.equal(revisit.baseline,null);
  assert.deepEqual(plain(bad[1].patrol),{status:'unavailable'});
});

test('frozen render lands at authored position and CSS motion uses shared lifecycle only',()=>{
  const p=panel(),host={};render(p,{patrol:{status:'enroute',progress:10}},host,true);
  const target={patrol:{status:'enroute',progress:78}},frozen=render(p,target,host,false);
  assert.equal(frozen.baseline,null);assert.doesNotMatch(frozen.html,/dispatch-vehicle-travel" style=/);
  assert.match(frozen.html,/data-motion="still"/);assert.match(vehicle(frozen.html,'patrol'),/data-progress="78"/);
  assert.equal(frozen.html,render(p,target,{},false).html);
  assert.equal(frozen.glide.multiple,true);assert.equal(frozen.glide.selector,'.dispatch-vehicle-travel[style]');
  const source=fs.readFileSync(path.join(__dirname,'../src/panels/types/dispatch.js'),'utf8');
  assert.doesNotMatch(source,/setTimeout\(|setInterval\(|requestAnimationFrame\(/);
  assert.match(def.styles,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(def.styles,/dispatch-scene\[data-motion="still"\] \*\{animation:none!important;transition:none!important/);
});

test('unrelated support updates preserve the scene subtree instead of resetting motion',()=>{
  const p=panel(),root={className:''},header={},content={},scene={token:'original scene'},wrapper={querySelector:()=>null,insertAdjacentHTML(){}};
  const host={querySelector:s=>({'.dispatch':root,'.dispatch-hero':header,'.dispatch-support':content,'.swpanel':wrapper,'.dispatch-scene':scene}[s])};
  const state={patrol:{status:'enroute',progress:45}};
  const first=render(p,state,host,true);assert.equal(first.patch(),false);
  const next=render(p,{...state,detail:'Operator confirms the address'},host,true);
  assert.equal(next.patch(),true);assert.match(content.innerHTML,/Operator confirms the address/);
  assert.equal(host.querySelector('.dispatch-scene'),scene);
  const changed=render(p,{patrol:{status:'enroute',progress:65}},host,true);assert.equal(changed.patch(),false);
});

test('scene fields appear in editor and numeric progress is valid authored provenance',()=>{
  const p=panel(),fields=plain(C.panelPatchFields(p));
  assert.deepEqual(fields.find(f=>f[0]==='timeOfDay'),['timeOfDay','enum',['day','dusk','night']]);
  const unit=fields.find(f=>f[0]==='patrol');
  assert.ok(unit[2].some(f=>f[0]==='progress'&&f[1]==='num'));
  assert.deepEqual(unit[2].find(f=>f[0]==='lights'),['lights','enum',['on','off']]);
  const d=fixture(p);d.steps=[{id:'drive',panels:{response:{patrol:{progress:65,status:'enroute'}}}}];
  const effective=C.builderEffectivePanelStates(d,0).panels[0];
  assert.equal(effective.fields.find(f=>f.key==='patrol').origin.kind,'step');
  d.steps[0].panels.response.patrol={progress:'not a number'};
  assert.equal(C.builderEffectivePanelStates(d,0).panels[0].fields.find(f=>f.key==='patrol').origin.kind,'initial');
});

test('scene text is escaped and prototype or colliding IDs cannot create markers',()=>{
  const p=panel(),attack='<script>alert(1)</script>';
  p.responders=[{id:'patrol',kind:'police',callsign:attack},{id:'timeOfDay',kind:'fire'},{id:'constructor',kind:'fire'},{id:'__proto__',kind:'fire'}];
  const state=JSON.parse('{"patrol":{"status":"enroute","progress":45},"__proto__":{"status":"enroute"},"constructor":{"status":"onscene"}}');state.location=attack;
  const html=render(p,state).html;
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|data-unit-id="(?:timeOfDay|constructor|__proto__)"|\sid="/);
});
