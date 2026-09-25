'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const C = {URL}; vm.createContext(C);
for (const name of ['validator','engine','builder.workbench','workbench/inspector-model']) vm.runInContext(readSource(name+'.js'), C);
const plain = value => JSON.parse(JSON.stringify(value));
const panel = type => ({id:'p',type,initial:{date:'Thu, Sep 24'}});
const step = (id, patch) => ({id,nodes:['app'],...(patch ? {panels:{p:patch}} : {})});
const diagram = (p, steps=[]) => ({nodes:{app:{}},rows:[['app']],panels:[p],steps});
const render = (p,state) => C.PanelViews.get(p.type)({querySelector:()=>null},p,state,'daylight',[],0,false).html;

for (const type of ['phone','deviceapp','appscreens']) {
  test(type+': optional dates carry, hide, restore and isolate alternate paths with accurate origins', () => {
    const p=panel(type), d=diagram(p,[step('start'),step('tomorrow',{date:'Fri, Sep 25'}),step('invalid',{date:42}),step('hide',{date:''}),step('after'),{id:'legacy',nodes:['app'],patch:{p:{date:'Sat, Sep 26'}}}]);
    const before=JSON.stringify(d), states=C.foldPanelStates(d).p;
    assert.deepEqual(plain(states).map(s=>s.date),['Thu, Sep 24','Fri, Sep 25','Fri, Sep 25','','','Sat, Sep 26']);
    assert.equal(JSON.stringify(d),before);
    assert.equal(C.builderEffectivePanelStates(d,2).panels[0].fields.find(f=>f.key==='date').origin.label,'Inherited from step 2');
    assert.equal(C.builderEffectivePanelStates(d,3).panels[0].fields.find(f=>f.key==='date').origin.kind,'step');
    d.paths=[{id:'later',steps:['start','tomorrow','hide']},{id:'today',steps:['start','invalid']}];
    assert.deepEqual(plain(C.foldPanelStates(C.diagramForPath(d,'today')).p).map(s=>s.date),['Thu, Sep 24','Thu, Sep 24']);
    assert.equal(C.foldPanelStates(C.diagramForPath(d,'later')).p.at(-1).date,'');
    assert.deepEqual(plain(C.validate(C.normalize(diagram(p)))).warnings,[]);
    assert.match(C.validate(C.normalize(d)).warnings.join(),/\.date:/);
    for(const invalid of [null,42,{},[]]) {
      p.initial.date=invalid;
      assert.match(C.validate(C.normalize(diagram(p))).warnings.join(),/\.date:/);
      assert.equal(C.foldPanelStates(diagram(p)).p[0].date,undefined);
    }
    delete p.initial.date;
    assert.equal(C.foldPanelStates(diagram(p)).p[0].date,undefined);
    assert.doesNotMatch(render(p,C.foldPanelStates(diagram(p)).p[0]),/class="(?:phonedate|da-date|appscreen-statusbar)"/);
  });

  test(type+': date text is escaped, hidden when empty and exposed as an editable patch field', () => {
    const p=panel(type), date='<img src=x onerror="bad()">';
    assert.match(render(p,{date}),/&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
    assert.doesNotMatch(render(p,{date}),/<img src=x/);
    assert.doesNotMatch(render(p,{date:''}),/class="(?:phonedate|da-date|appscreen-statusbar)"/);
    assert.ok(C.panelPatchFields(p).some(field=>field[0]==='date' && field[1]==='text'));
    if(type==='appscreens') {
      p.frame='none'; assert.doesNotMatch(render(p,{date}),/appscreen-statusbar/);
      p.initial.date='Today';
      assert.deepEqual(plain(C.foldPanelStates(diagram(p,[step('once',{enterOnce:{date:'Tomorrow'}}),step('after')])).p).map(s=>s.date),['Tomorrow','Today']);
    }
    if(type==='deviceapp') {
      p.fields=[{id:'date'}];p.sources=[{id:'date'}];
      assert.match(C.validate(C.normalize(diagram(p))).warnings.join(),/date.*reserved/);
      assert.equal(C.deviceAppItems(p,'fields').length,0);
      for(const phoneScreen of ['home','app'])assert.match(render(p,{date:'Sep 24',phoneScreen}),/class="da-date" title="Sep 24">Sep 24/);
    }
  });
}

test('app screens keeps the time beside the date; each field carries and clears independently', () => {
  const p=panel('appscreens');p.initial.clock='9:41';
  const d=diagram(p,[step('start'),step('change',{clock:'10:00'}),step('bad',{clock:42}),step('hide-date',{date:''}),step('hide-time',{clock:''})]);
  const states=plain(C.foldPanelStates(d).p);
  assert.deepEqual(states.map(s=>s.clock),['9:41','10:00','10:00','10:00','']);
  assert.match(C.validate(C.normalize(d)).warnings.join(),/\.clock:/);
  assert.match(render(p,states[0]),/appscreen-clock.*9:41.*appscreen-date.*Thu, Sep 24/);
  assert.match(render(p,states[3]),/appscreen-clock/);assert.doesNotMatch(render(p,states[3]),/appscreen-date/);
  assert.doesNotMatch(render(p,states[4]),/appscreen-statusbar/);
  assert.match(render(p,{clock:'<b>9</b>'}),/&lt;b&gt;9&lt;\/b&gt;/);
  assert.equal(C.builderEffectivePanelStates(d,2).panels[0].fields.find(f=>f.key==='clock').origin.label,'Inherited from step 2');
});
