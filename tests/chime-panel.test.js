const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const {readSource, readStyles} = require('../tools/source-loader.cjs');
const C = vm.createContext({URL, TextEncoder});
for (const file of ['compatibility', 'canon', 'validator', 'engine', 'builder.workbench', 'panel-picker.workbench']) vm.runInContext(readSource(file + '.js'), C);
const example = require('../examples/doorbell-chime/doorbell-chime.spec.json');
const diagram = () => structuredClone(example.page.sections[0].diagram);
const plain = value => JSON.parse(JSON.stringify(value));
test('chime is discovered by validation, picker, compatibility and standard inspector', () => {
  assert.deepEqual(plain(C.validate(C.normalize(example))), {errors:[],warnings:[]});
  const entry = C.PANEL_CATALOG.find(item => item.type === 'chime');
  assert.equal(entry.name, 'Doorbell chime');
  assert.equal(C.PanelRegistry.get('chime').authoring.initialFields, true);
  assert.ok(C.FlowviewCompatibility.detect(example).includes('panel.chime'));
  const sample = C.panelPickerExample('chime');
  assert.equal(sample.state.playback, 'playing');
  sample.panel.initial.playback = 'stopped';
  assert.equal(C.panelPickerExample('chime').state.playback, 'playing');
  const empty = {nodes:{n:{}},rows:[['n']],steps:[{text:'Ring'}]};
  const added = C.planAddPanel(JSON.stringify(empty),empty,0,'chime');
  assert.equal(added.error, undefined);
  let raw = JSON.parse(added.text); const panel = raw.panels[0];
  assert.equal(panel.initial.playback, 'stopped');
  const collected = C.patchFieldsCollect(C.panelPatchFields(panel), {playback:'playing',text:'Welcome home.'});
  assert.equal(collected.error, undefined);
  raw = JSON.parse(C.planStepTogglePanel(JSON.stringify(raw),raw,0,0,panel.id).text);
  const edited = C.planStepSetPanelPatch(JSON.stringify(raw),raw,0,0,panel.id,JSON.stringify(collected.item));
  assert.equal(edited.error, undefined);
  assert.equal(C.foldPanelStates(JSON.parse(edited.text))[panel.id][0].text, 'Welcome home.');
});
test('chime carries sparse state, resets text, isolates paths and restores one-step values', () => {
  const d = diagram(), before = JSON.stringify(d);
  const normal = C.foldPanelStates(C.diagramForPath(d, 'ring')).bell;
  assert.deepEqual(plain(normal.map(s => s.playback)), ['stopped','playing','stopped']);
  const quiet = C.foldPanelStates(C.diagramForPath(d,'quiet')).bell;
  assert.deepEqual(plain(quiet.map(s => s.playback)), ['stopped','stopped']);
  assert.equal(JSON.stringify(d),before);
  d.steps = [{panels:{bell:{playback:'playing',text:'Visitor'}}},{panels:{bell:{enterOnce:{playback:'stopped',text:''}}}},{panels:{bell:{text:null}}},{}];
  delete d.paths;
  const states = C.foldPanelStates(d).bell;
  assert.deepEqual(plain(states.map(s => s.playback)), ['playing','stopped','playing','playing']);
  assert.deepEqual(plain(states.map(s => s.text)), ['Visitor','',null,null]);
  assert.equal(C.foldPanelStates({...d,steps:[]}).bell[0].playback,'stopped');
});
test('invalid state warns with source paths and never replaces valid playback or text', () => {
  const d = diagram(); delete d.paths;
  d.panels[0].initial = {playback:true,text:42};
  d.steps = [{panels:{bell:{playback:'playing',text:'Valid'}}},{panels:{bell:{playback:'yes',text:[],enterOnce:{playback:1,text:{}}}}},{panels:{bell:[]}},{panels:{bell:{enterOnce:'bad'}}}];
  const warnings = C.validate(C.normalize(d)).warnings.join('\n');
  for(const path of ['initial.playback','initial.text','steps[1].panels.bell.playback','steps[1].panels.bell.enterOnce.text']) assert.ok(warnings.includes(path),path);
  const states = C.foldPanelStates(d).bell;
  assert.deepEqual(plain(states.map(s=>s.playback)), ['playing','playing','playing','playing']);
  assert.deepEqual(plain(states.map(s=>s.text)), ['Valid','Valid','Valid','Valid']);
});
test('rendered status is explicit, text is escaped, and presentation settles without motion', () => {
  const render = C.PanelRegistry.get('chime').render, panel = diagram().panels[0];
  for (const [state, expected] of [[{},'Not playing'],[{playback:'playing'},'Playing']]) {
    const html = render({},panel,state,'pastel',[],0,false).html;
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes(expected));
    assert.ok(!html.includes('chime-motion'));
  }
  assert.match(render({},panel,{playback:'playing',text:'<script>"&</script>'},'pastel',[],0,true).html,/&lt;script&gt;/);
  assert.doesNotMatch(render({},panel,{text:''},'pastel',[],0,false).html,/chime-text/);
  assert.match(render({},panel,{playback:'playing',text:null},'pastel',[],0,false).html,/Someone is at the door/);
  const css=readStyles('style.core.css');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.chime-motion/);
  assert.match(css,/@media print\{\.chime-motion/);
});
