'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {readSource, sourceFiles, readStyles, panelAssets} = require('../tools/source-loader.cjs');

const ROOT = path.join(__dirname, '..');
const TYPE = 'extension-meter';
const FEATURE = 'panel.' + TYPE;
const plain = value => JSON.parse(JSON.stringify(value));
let temp, src, baseline, oldCompatibility, C;

function inventory(root, relative = '') {
  const out = {};
  for (const entry of fs.readdirSync(path.join(root, relative), {withFileTypes:true})) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(out, inventory(root, name));
    else out[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
  }
  return out;
}
function context() {
  const result = {URL, TextEncoder};
  vm.createContext(result);
  for (const name of ['compatibility.js','canon.js','validator.js','engine.js','builder.workbench.js','panel-picker.workbench.js','clipboard.workbench.js'])
    vm.runInContext(readSource(name, src), result, {filename:name});
  return result;
}
function fixture() {
  return {nodes:{sensor:{title:'Sensor'},service:{title:'Service'}},rows:[['sensor','service']],
    panels:[{id:'meter',type:TYPE,title:'Reading',max:100,
      sources:[{node:'sensor',label:'Device'},{node:'service',label:'Backend'}],initial:{value:10,log:['initial']}}],
    steps:[
      {id:'shared',text:'Shared sample',panels:{meter:{value:20}}},
      {id:'success',text:'Success',panels:{meter:{value:75,log:['success']}}},
      {id:'pulse',text:'Transient reading',panels:{meter:{enterOnce:{value:99}}}},
      {id:'settled',text:'Settled',nodes:['sensor']},
      {id:'failure',text:'Failure',panels:{meter:{value:25,log:['failure']}}},
      {id:'end',text:'Failed route settled',nodes:['sensor']}
    ],
    paths:[{id:'happy',label:'Success',steps:['shared','success','pulse','settled']},
      {id:'failed',label:'Failure',steps:['shared','failure','end']}]
  };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function apply(plan) {
  assert.equal(plan.error, undefined);
  return JSON.parse(plan.text);
}

test.before(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowview-panel-extension-'));
  src = path.join(temp, 'src');
  fs.cpSync(path.join(ROOT, 'src'), src, {recursive:true});
  baseline = inventory(src);
  oldCompatibility = {};
  vm.runInNewContext(readSource('compatibility.js', src), oldCompatibility);
  fs.copyFileSync(path.join(__dirname, 'fixtures/panel-extension.js'), path.join(src, 'panels/types/' + TYPE + '.js'));
  C = context();
});
test.after(() => { if (temp) fs.rmSync(temp, {recursive:true, force:true}); });

test('one added definition is discovered without editing an existing source or assembly list', () => {
  const after = inventory(src);
  assert.deepEqual(Object.keys(after).filter(name => !Object.hasOwn(baseline,name)), ['panels/types/' + TYPE + '.js']);
  for (const [name, hash] of Object.entries(baseline)) assert.equal(after[name], hash, name);
  assert.ok(sourceFiles('validator.js',src).includes('panels/types/' + TYPE + '.js'));
  assert.ok(C.PANEL_TYPES.includes(TYPE));
  assert.equal(C.PanelViews.get(TYPE),C.PanelRegistry.get(TYPE).render);
  assert.equal(C.PanelViews.get(TYPE).options.ambientInitial,true);
  assert.equal(C.panelCapability(TYPE,'height'),9);
  assert.equal(C.diagramFocusPanel(fixture()).id,'meter');
  const ordered=C.panelOrder([{id:'meter',type:TYPE},{id:'gauge',type:'gauge'}]);
  assert.deepEqual(plain(ordered.map(panel=>panel.id)),['gauge','meter']);
  assert.equal('document' in C,false,'registration and discovery need no browser');
  assert.throws(()=>C.PanelRegistry.define('invalid type',{}),/Invalid panel definition/);
  assert.throws(()=>C.PanelRegistry.extend(TYPE,{label:'Duplicate'}),/Duplicate panel definition/);
  assert.equal(C.PanelRegistry.get(TYPE).label,'Extension meter');
});

test('new declaration and patch validators run headlessly with precise source paths', () => {
  assert.deepEqual(plain(C.validate(C.normalize(fixture()))),{errors:[],warnings:[]});
  const bad=fixture();bad.panels[0].max=0;
  assert.ok(C.validate(C.normalize(bad)).errors.some(message=>/panels\[0\]\.max: extension meter/.test(message)));
  const patch=fixture();patch.steps[4].panels.meter.value='bad';
  patch.steps[2].panels.meter.enterOnce.value=101;
  const warnings=Array.from(C.validate(C.normalize(patch)).warnings);
  assert.ok(warnings.some(message=>/steps\[4\]\.panels\.meter\.value: extension meter/.test(message)));
  assert.ok(warnings.some(message=>/steps\[2\]\.panels\.meter\.enterOnce\.value: extension meter/.test(message)));
  assert.equal(C.foldPanelStates(C.diagramForPath(patch,'failed')).meter[1].value,20,'the new reducer can reuse shared sparse-fold filtering');
});

test('a new reducer uses shared folding and provenance on independent alternate paths without mutating input', () => {
  const diagram=freeze(fixture()), before=JSON.stringify(diagram);
  const happy=C.foldPanelStates(C.diagramForPath(diagram,'happy')).meter;
  const failed=C.foldPanelStates(C.diagramForPath(diagram,'failed')).meter;
  assert.deepEqual(plain(happy.map(state=>state.value)),[20,75,99,75]);
  assert.deepEqual(plain(failed.map(state=>state.value)),[20,25,25]);
  assert.deepEqual(plain(failed[2].log),['initial','failure']);
  assert.equal(JSON.stringify(diagram),before);
  happy[2].log.push('only this output');happy[2].value=1;
  assert.deepEqual(plain(happy[3].log),['initial','success']);
  assert.equal(C.foldPanelStates(C.diagramForPath(diagram,'failed')).meter[2].value,25);
  const value=C.builderEffectivePanelStates(diagram,5,'failed').panels[0].fields.find(field=>field.key==='value');
  assert.equal(value.value,25);
  assert.deepEqual(plain(value.origin.inputs[0].path),['steps',4,'panels','meter','value']);
});

test('the new renderer reuses escaping, the common shell, level settling and unchanged-DOM suppression', () => {
  const fill={style:{}},readout={firstChild:{nodeValue:''}};
  let writes=0;
  const host={querySelector(selector){return selector==='.extension-meter-fill'?fill:selector==='.extension-meter-readout'?readout:null;},
    querySelectorAll(){return [];},set innerHTML(html){this.html=html;writes++;}};
  const panel=fixture().panels[0],state={value:32.5,note:'<img src=x onerror=alert(1)>'};
  C.renderPanelBody(host,panel,state,'pastel',[],0,false);
  C.renderPanelBody(host,panel,state,'pastel',[],0,false);
  assert.equal(writes,1);
  assert.match(host.html,/class="swpanel"/);
  assert.match(host.html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(host.html,/<img/);
  assert.equal(fill.style.width,'32.5%');assert.equal(fill.style.transition,'none');
  assert.equal(readout.firstChild.nodeValue,'32.5');
});

test('the same file supplies picker examples, insertion defaults, setup fields and ordinary/custom source edits', () => {
  const entry=C.PANEL_CATALOG.find(item=>item.type===TYPE);
  assert.equal(entry.name,'Extension meter');assert.equal(entry.category,'Extension fixtures');
  const sample=C.panelPickerExample(TYPE);assert.equal(sample.state.value,65);
  sample.panel.initial.value=999;sample.state.value=999;
  assert.equal(C.panelPickerExample(TYPE).state.value,65);
  const empty={nodes:{sensor:{}},rows:[['sensor']],steps:[{text:'Read',panels:{}}]};
  let raw=apply(C.planAddPanel(JSON.stringify(empty),empty,0,TYPE));
  const id=raw.panels[0].id;
  assert.equal(raw.panels[0].type,TYPE);assert.equal(raw.panels[0].initial.value,10);
  assert.deepEqual(plain(C.PANEL_SETUP_FIELDS[TYPE].map(field=>field[0])),['max','sources','initial']);
  const fields=C.panelPatchFields(raw.panels[0]);
  const input=C.patchFieldsCollect(fields,{value:'42',note:'typed field'});
  assert.equal(input.error,undefined);
  raw=apply(C.planStepTogglePanel(JSON.stringify(raw),raw,0,0,id));
  raw=apply(C.planStepSetPanelPatch(JSON.stringify(raw),raw,0,0,id,JSON.stringify(input.item)));
  assert.equal(C.foldPanelStates(raw)[id][0].value,42);
  let inspections=0,commits=0;
  const authoring=C.PanelRegistry.get(TYPE).authoring;
  const editor=authoring.editor({controls:{action:(label,run)=>({label,run})},
    commit(key,value){commits++;raw=apply(C.planSetField(JSON.stringify(raw),raw,['panels',0],key,value));return true;},
    inspect(){inspections++;}});
  const rows=[];editor.setupRows(raw.panels[0],raw,{kind:'panel',section:0,index:0},rows);rows[0].run();
  assert.equal(raw.panels[0].max,200);assert.equal(commits,1);assert.equal(inspections,1);
  assert.deepEqual(plain(C.validate(C.normalize(raw))),{errors:[],warnings:[]});
});

test('node rename, delete and cross-spec panel paste honor the new definition reference metadata', () => {
  const raw=fixture(),before=JSON.stringify(raw);
  const renamed=apply(C.planRenameNode(JSON.stringify(raw),raw,0,'sensor','renamed'));
  assert.deepEqual(renamed.panels[0].sources,[{node:'renamed',label:'Device'},{node:'service',label:'Backend'}]);
  const removed=apply(C.planDeleteNode(JSON.stringify(renamed),renamed,0,'renamed'));
  assert.deepEqual(removed.panels[0].sources,[{label:'Device'},{node:'service',label:'Backend'}]);
  const copied=C.builderClipboardCopy(raw,[{kind:'panel',section:0,index:0}]);assert.equal(copied.error,undefined);
  const destination={nodes:{sensor:{}},rows:[['sensor']]};
  const pasted=apply(C.planPasteBuilderClipboard(JSON.stringify(destination),destination,copied.data,{section:0}));
  const diagram=pasted.page.sections[0].diagram;
  assert.deepEqual(diagram.panels[0].sources,[{node:'sensor',label:'Device'},{label:'Backend'}]);
  assert.equal(diagram.panels[0].type,TYPE);assert.equal(diagram.panels[0].initial.value,10);
  assert.equal(JSON.stringify(raw),before,'source references and copied objects stay unchanged');
  assert.deepEqual(plain(copied.data.value.panels[0].sources),raw.panels[0].sources);
});

test('styles and compatibility feature metadata are derived from the same added file', () => {
  const assets=panelAssets(src);
  assert.deepEqual(assets.features[FEATURE],{label:'Extension meter panel',since:'9.7.0'});
  assert.match(readStyles('style.core.css',src),/\.extension-meter-fill\{height:8px;background:#245bdb\}/);
  assert.match(readStyles('style.workbench.css',src),/\.extension-meter-editor-note\{font-weight:600\}/);
  const original=fixture(),stamped=C.FlowviewCompatibility.stamp(original);
  assert.equal(original.flowview,undefined);
  assert.equal(stamped.page.flowview.minVersion,'9.7.0');
  assert.ok(stamped.page.flowview.features.includes(FEATURE));
  const older=oldCompatibility.FlowviewCompatibility.check(stamped);
  assert.ok(older.missingFeatures.includes(FEATURE));
  assert.ok(older.messages.some(message=>message.includes('9.7.0')));
  const upgraded=C.FlowviewCompatibility.check(stamped,{version:'9.7.0',contract:'1',features:C.FlowviewCompatibility.features});
  assert.equal(upgraded.status,'compatible');
});

test('the real build packages the added panel into viewer, editor and the headless backend without source edits', () => {
  for (const name of ['template','workbench','tools/canon','docs/diagrams/backstage','docs/diagrams/doorbell-perspectives','examples/canon/specs'])
    fs.mkdirSync(path.join(temp,name),{recursive:true});
  for (const name of ['tools/build.py','tools/source-loader.cjs','docs/diagrams/backstage/backstage.spec.json','docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json','examples/canon/registry.json','examples/canon/specs/doorbell.json'])
    fs.copyFileSync(path.join(ROOT,name),path.join(temp,name));
  const output=execFileSync('python3',[path.join(temp,'tools/build.py')],{cwd:temp,encoding:'utf8',timeout:30000});
  assert.match(output,/built template\/flowview.html/);
  for (const name of ['template/flowview.html','workbench/flowspec.html']) {
    const html=fs.readFileSync(path.join(temp,name),'utf8');
    assert.ok(html.includes("PanelRegistry.define('extension-meter'"),name);
    const styles=Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),match=>match[1]).join('\n');
    assert.match(styles,/\.extension-meter-fill\{height:8px;background:#245bdb\}/);
    if (name.startsWith('workbench')) assert.match(styles,/\.extension-meter-editor-note\{/);
    assert.ok(html.includes('"panel.extension-meter":{"label":"Extension meter panel","since":"9.7.0"}'));
  }
  const runtimePath=path.join(temp,'tools/canon/generated-runtime.cjs');
  const runtime=require(runtimePath);
  assert.deepEqual(runtime.validateSpec(fixture()),{errors:[],warnings:[]});
  const invalid=fixture();invalid.panels[0].max=0;
  assert.ok(runtime.validateSpec(invalid).errors.some(message=>message.includes('extension meter requires')));
  assert.equal(runtime.compatibility.features[FEATURE].since,'9.7.0');
  assert.deepEqual(runtime.viewerRouting().diagramPathList(fixture()).map(route=>route.id),['happy','failed']);
  delete require.cache[require.resolve(runtimePath)];
  const after=inventory(src);
  for (const [name,hash] of Object.entries(baseline)) assert.equal(after[name],hash,name);
  assert.equal(Object.keys(after).length,Object.keys(baseline).length+1,'the build needed one new source file only');
});
