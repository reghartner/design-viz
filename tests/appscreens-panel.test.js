'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
const C = vm.createContext({URL, TextEncoder});
for (const name of ['compatibility','canon','validator','engine','builder.workbench','clipboard.workbench','panel-picker.workbench']) vm.runInContext(readSource(name + '.js'), C);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
const plain = value => JSON.parse(JSON.stringify(value));
const panel = () => ({id:'app',type:'appscreens',frame:'phone',transition:'crossfade',screens:['home','connecting','live','error'].map(id => ({id,label:id,alt:'The '+id+' screen',src:png,width:390,height:844})),initial:{screen:'home'}});
const diagram = (p = panel(), steps = []) => ({nodes:{app:{title:'App'}},rows:[['app']],panels:[p],steps});
const step = (id, patch) => ({id,nodes:['app'],...(patch ? {panels:{app:patch}} : {})});

test('screens carry by ID, restore on backwards reads, and fold each alternate from its own history', () => {
  const d = diagram(panel(), [step('home'),step('connecting',{screen:'connecting'}),step('wait'),step('live',{screen:'live'}),step('error',{screen:'error'})]);
  d.paths = [{id:'success',steps:['home','connecting','wait','live']},{id:'failed',steps:['home','connecting','error']}];
  const source = JSON.stringify(d), fold = path => plain(C.foldPanelStates(C.diagramForPath(d,path)).app);
  const happy = fold('success'); assert.deepEqual(happy.map(s=>s.screen), ['home','connecting','connecting','live']);
  assert.deepEqual(fold('failed').map(s=>s.screen), ['home','connecting','error']);
  assert.equal(happy[0].screen, 'home'); assert.equal(happy[2].screen, 'connecting');
  assert.deepEqual(fold('success'), happy); assert.equal(JSON.stringify(d), source);
  assert.equal(C.foldPanelStates(diagram()).app[0].screen, 'home');
  assert.ok(happy.every(snapshot => !JSON.stringify(snapshot).includes('base64')), 'folded state never copies image payloads');
});

test('unknown screen IDs do not erase a good selection, null clears, enterOnce does not carry, legacy patches work', () => {
  const d = diagram(panel(), [step('bad',{screen:'missing'}),step('once',{enterOnce:{screen:'error'}}),step('after'),step('blank',{screen:null}),step('still-blank'),{id:'legacy',nodes:['app'],patch:{app:{screen:'live'}}}]);
  assert.deepEqual(plain(C.foldPanelStates(d).app).map(s=>s.screen), ['home','error','home',null,null,'live']);
  const findings = C.validate(C.normalize(d)); assert.deepEqual(plain(findings.errors), []);
  assert.match(findings.warnings.join(), /declared screen ID/);
  d.steps = [step('bad',{src:'https://bad.test/a.png',screen:[],enterOnce:{screen:'missing'}})];
  assert.equal(C.foldPanelStates(d).app[0].screen, 'home');
  assert.match(C.validate(C.normalize(d)).warnings.join(), /unknown app screens state field/);
});

test('validation rejects remote, active and oversized images and warns on broken collections and dimensions', () => {
  assert.deepEqual(plain(C.validate(C.normalize(diagram()))), {errors:[],warnings:[]});
  for (const src of ['https://example.com/ui.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,'+Buffer.alloc(512*1024+1).toString('base64')]) {
    const p = panel(); p.screens[0].src = src;
    assert.match(C.validate(C.normalize(diagram(p))).errors.join(), /embedded PNG/);
    const model = C.PanelViews.get('appscreens')({querySelector:()=>null},p,{screen:'home'},'pastel',[],0,false);
    assert.doesNotMatch(model.html, /<img/);
  }
  const p = panel(); p.screens.push({...p.screens[0]}); p.screens[1].width = '1;background:url(https://bad.test)';
  const warnings = C.validate(C.normalize(diagram(p))).warnings.join();
  assert.match(warnings, /duplicate id/); assert.match(warnings, /integer from 1 to 4096/);
});

test('renderer escapes authored text, preserves image proportions and has safe source links', () => {
  const p = panel(); Object.assign(p.screens[0], {label:'<script>name</script>',alt:'" onerror="bad',caption:'<img src=x>',link:'javascript:alert(1)'});
  let model = C.PanelViews.get('appscreens')({querySelector:()=>null},p,{screen:'home'},'pastel',[],0,false);
  assert.match(model.html, /&lt;script&gt;name/); assert.match(model.html, /alt="&quot; onerror=&quot;bad"/); assert.match(model.html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(model.html, /<a|onerror="bad/); assert.match(model.html, /--appscreen-ratio:0.462085/);
  p.screens[0].link = 'https://www.figma.com/design/example?node-id=1-2'; p.frame = 'none';
  model = C.PanelViews.get('appscreens')({querySelector:()=>null},p,{screen:'home'},'pastel',[],0,false);
  assert.match(model.html, /rel="noopener noreferrer"/); assert.doesNotMatch(model.html, /appscreen-phone/);
});

test('paused and reduced-motion renders settle old images, and unchanged screens keep their DOM', () => {
  const p = panel(), outgoing = {parentNode:{removeChild(){removed++;}}}; let writes=0, removed=0;
  const host = {querySelector:()=>null,querySelectorAll:selector=>selector === '.appscreen-previous' ? [outgoing] : [],set innerHTML(value){writes++;this.html=value;}};
  C.renderPanelBody(host,p,{screen:'home'},'pastel',[],0,false);
  C.renderPanelBody(host,p,{screen:'home'},'pastel',[],1,false);
  assert.equal(writes,1); assert.equal(removed,2);
  const fakeOld = {getAttribute:()=>png}, renderer = C.PanelViews.get('appscreens');
  p.screens[1].src = 'data:image/png;base64,AAAA';
  const animated = renderer({querySelector:()=>fakeOld},p,{screen:'connecting'},'pastel',[],1,true);
  assert.match(animated.html,/appscreen-previous/); assert.doesNotMatch(animated.baseline,/appscreen-previous/);
  assert.doesNotMatch(renderer({querySelector:()=>fakeOld},p,{screen:'connecting'},'pastel',[],1,false).html,/appscreen-previous/);
  p.transition = 'cut'; assert.doesNotMatch(renderer({querySelector:()=>fakeOld},p,{screen:'connecting'},'pastel',[],1,true).html,/appscreen-previous/);
});

test('the panel is discovered by insertion, picker, compatibility and clipboard without new shared switches', () => {
  const p = plain(C.PANEL_TEMPLATES.appscreens);
  assert.deepEqual(plain(C.validate(C.normalize(diagram({...p,id:'app',type:'appscreens'})))),{errors:[],warnings:[]});
  const raw = diagram(); raw.panels = [];
  const added = JSON.parse(C.planAddPanel(JSON.stringify(raw),raw,0,'appscreens').text).panels[0];
  assert.equal(added.type,'appscreens'); assert.equal(added.initial.screen,null);
  const sample = C.panelPickerExample('appscreens', {referenceImage:png});
  assert.equal(sample.panel.screens[0].src,png); assert.equal(sample.state.screen,'sample');
  const copied = C.builderClipboardCopy(diagram(), [{kind:'panel',section:0,index:0}]);
  assert.equal(copied.error,undefined); assert.deepEqual(plain(copied.data.value.panels[0].screens),panel().screens);
  assert.ok(C.FlowviewCompatibility.detect(diagram()).includes('panel.appscreens'));
});
