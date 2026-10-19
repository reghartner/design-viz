'use strict';
process.env.FLOWVIEW_PACKAGES = 'science';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {readSource, readStyles, panelAssets} = require('../tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
for (const file of ['validator.js', 'engine.js', 'builder.workbench.js', 'panel-picker.workbench.js']) vm.runInContext(readSource(file), C);
const plain = value => JSON.parse(JSON.stringify(value));
const panel = scene => ({id:'lesson',type:'nspstory',scene,initial:{phase:0}});
const diagram = (p,steps=[]) => ({nodes:{n:{}},rows:[['n']],panels:[p],steps});
const validate = d => plain(C.validate(C.normalize(d)));
const screenFrame = html => /<svg class="nspstory-frame nspstory-screen-frame"[\s\S]*?<\/svg>/.exec(html)[0];
const printFrame = html => /<svg class="nspstory-frame nspstory-print-frame"[\s\S]*?<\/svg>/.exec(html)[0];

test('nspstory discovery, starter parity and all four declared lessons validate', () => {
  assert.equal(panelAssets().features['panel.nspstory'].label,'NSP15 evidence story panel');
  for (const scene of ['reporter','dilution','origin','evidence']) assert.deepEqual(validate(diagram(panel(scene))),{errors:[],warnings:[]});
  const sample=C.panelPickerExample('nspstory');
  assert.deepEqual(validate(diagram(sample.panel)),{errors:[],warnings:[]});
  assert.ok(C.PANEL_CATALOG.some(p=>p.type==='nspstory'));
  const dir=path.join(__dirname,'../packages/science');
  const source=fs.readFileSync(path.join(dir,'diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json'),'utf8');
  assert.equal(source,fs.readFileSync(path.join(dir,'starters/nsp15-insertion-evidence.json'),'utf8'));
  assert.doesNotMatch(source,/tidylwave|Well [A-F]|\[embedded\]/);
  assert.deepEqual(plain(C.validate(C.normalize(JSON.parse(source)))),{errors:[],warnings:[]});
});

test('invalid phases and fields warn; invalid patches retain state; transient and alternate paths are isolated', () => {
  const p=panel('reporter'), steps=[
    {id:'a',panels:{lesson:{phase:1,caption:'Carried'}}},
    {id:'b',panels:{lesson:{phase:2,enterOnce:{phase:3,caption:'Once'}}}},
    {id:'c',panels:{lesson:{phase:99,caption:null}}},
    {id:'d',panels:{lesson:{phase:0}}},
  ];
  const d={...diagram(p,steps),paths:[{id:'main',label:'Main',steps:['a','b','c']},{id:'alt',label:'Alt',steps:['a','d']}]};
  const before=JSON.stringify(d);
  const main=plain(C.foldPanelStates(C.diagramForPath(d,'main')).lesson);
  const alt=plain(C.foldPanelStates(C.diagramForPath(d,'alt')).lesson);
  assert.deepEqual(main.map(x=>x.phase),[1,3,2]);
  assert.deepEqual(main.map(x=>x.caption),['Carried','Once',null]);
  assert.deepEqual(alt.map(x=>x.phase),[1,0]);
  assert.equal(JSON.stringify(d),before);
  const warnings=validate(diagram({...p,scene:'bad'},[{panels:{lesson:{phase:1.5,bogus:1,caption:42}}}])).warnings.join('\n');
  for(const expected of [/panels\[0\]\.scene: expected/,/steps\[0\]\.panels\.lesson\.phase: expected/,/\.bogus: unknown/,/\.caption: expected/]) assert.match(warnings,expected);
  for(const state of [null,[],42,'bad',{phase:Infinity},{phase:-1}]) assert.doesNotMatch(C.nspstoryHTML(p,state),/NaN|Infinity|undefined/);
  const settingWarnings=validate(diagram({...p,ambient:'yes',ambientIntensity:'huge',ambientTempo:'warp'})).warnings.join('\n');
  for(const expected of [/\.ambient: expected/,/\.ambientIntensity: expected/,/\.ambientTempo: expected/])assert.match(settingWarnings,expected);
});

test('ambient authoring settings validate, serialize and visibly control atmosphere', () => {
  const authoring=C.PanelRegistry.get('nspstory').authoring;
  assert.deepEqual(plain(authoring.setupFields.slice(0,4)),[
    ['scene','enum',['reporter','dilution','origin','evidence']],['ambient','bool'],
    ['ambientIntensity','enum',['quiet','medium','lively']],['ambientTempo','enum',['slow','normal','fast']]
  ]);
  const lively={...panel('reporter'),ambient:true,ambientIntensity:'lively',ambientTempo:'fast'};
  const livelyHTML=C.nspstoryHTML(lively,{phase:0});
  assert.match(livelyHTML,/data-ambient="on" data-ambient-intensity="lively" data-ambient-tempo="fast"/);
  assert.match(screenFrame(livelyHTML),/nspstory-ambient-lively nspstory-ambient-fast/);
  const offHTML=C.nspstoryHTML({...lively,ambient:false},{phase:0});
  assert.match(offHTML,/data-ambient="off"/);
  assert.doesNotMatch(screenFrame(offHTML),/nspstory-ambient/);
  assert.deepEqual(validate(diagram(lively)),{errors:[],warnings:[]});
  const normalized=plain(C.normalize(diagram(lively))).sections[0].diagram.panels[0];
  assert.deepEqual([normalized.ambient,normalized.ambientIntensity,normalized.ambientTempo],[true,'lively','fast']);
});

test('lessons expose truthful final frames, accessible summaries and escaped captions', () => {
  assert.match(screenFrame(C.nspstoryHTML(panel('reporter'),{phase:0})),/GFP OFF/);
  assert.doesNotMatch(screenFrame(C.nspstoryHTML(panel('reporter'),{phase:0})),/class="nspstory-cell nspstory-green/);
  assert.match(C.nspstoryHTML(panel('reporter'),{phase:2}),/Newly infected cells/);
  assert.match(C.nspstoryHTML(panel('dilution'),{phase:1}),/Still mixed/);
  assert.match(C.nspstoryHTML(panel('dilution'),{phase:1}),/never guarantees one founder/);
  assert.doesNotMatch(screenFrame(C.nspstoryHTML(panel('origin'),{phase:1})),/class="nspstory-fragment"/);
  const proposed=C.nspstoryHTML(panel('origin'),{phase:3});
  assert.match(proposed,/PROPOSED \/ NOT OBSERVED/);
  assert.match(proposed,/incorporation happens is unresolved/);
  assert.match(proposed,/class="nspstory-fragment"/);
  const distalWidth=Number(/data-rate="inactive-1"[^>]+width="([^"]+)"/.exec(screenFrame(C.nspstoryHTML(panel('evidence'),{phase:1})))[1]);
  assert.ok(Math.abs(distalWidth-.2*11.4)<1e-8,'the 0.2 cpm bar stays nonzero on the shared scale');
  assert.match(C.nspstoryHTML(panel('evidence'),{phase:2}),/0.99/);
  assert.match(C.nspstoryHTML(panel('evidence'),{phase:3}),/12 nt → 3 nt/);
  const hostile='<img src=x onerror=bad()>" onclick="bad()';
  assert.doesNotMatch(C.nspstoryHTML(panel('reporter'),{caption:hostile}),/<img|" onclick=/);
  for(const scene of ['reporter','dilution','origin','evidence'])for(let phase=0;phase<4;phase++) {
    const html=C.nspstoryHTML(panel(scene),{phase});
    assert.match(html,/role="img" aria-label="[^\"]+"/);
    assert.match(html,new RegExp('data-phase="'+phase+'"'));
    assert.doesNotMatch(html,/nspstory-motion/,'static render must not begin a new animation');
  }
});

test('each teaching phase owns one finite beat and later phases do not replay it', () => {
  const moving=(scene,phase)=>screenFrame(C.nspstoryHTML(panel(scene),{phase},true));
  assert.match(moving('reporter',0),/nspstory-arrive/);
  assert.doesNotMatch(moving('reporter',0),/nspstory-switch|nspstory-descendant/);
  assert.match(moving('reporter',1),/nspstory-switch/);
  assert.doesNotMatch(moving('reporter',1),/nspstory-arrive|nspstory-descendant/);
  assert.match(moving('reporter',2),/nspstory-descendant/);
  assert.doesNotMatch(moving('reporter',2),/nspstory-arrive|nspstory-switch/);
  assert.doesNotMatch(moving('reporter',3),/nspstory-arrive|nspstory-switch|nspstory-descendant/);
  assert.match(moving('dilution',1),/nspstory-separate/);
  assert.doesNotMatch(moving('dilution',2),/nspstory-separate/);
  assert.match(moving('dilution',2),/nspstory-reveal/);
  assert.doesNotMatch(moving('dilution',3),/nspstory-separate|nspstory-reveal/);
  assert.match(moving('dilution',3),/nspstory-boundary/);
});

test('published comparison bars and labels stay fixed at every phase', () => {
  const expected=[['wt-0',33.9],['inactive-0',6.93],['wt-1',16.7],['inactive-1',.2],['wt-2',.98],['inactive-2',.99]];
  for(let phase=0;phase<4;phase++) {
    const html=screenFrame(C.nspstoryHTML(panel('evidence'),{phase},true));
    for(const [id,value] of expected) {
      const width=Number(new RegExp('data-rate="'+id+'"[^>]+width="([^"]+)"').exec(html)[1]);
      assert.ok(Math.abs(width-value*11.4)<1e-8,`${id} phase ${phase} must stay at ${value}`);
      assert.match(html,new RegExp('>'+String(value).replace('.','\\.')+'<'));
    }
    assert.doesNotMatch(html,/nspstory-loss|--nsp-start|--nsp-end/);
  }
  assert.doesNotMatch(screenFrame(C.nspstoryHTML(panel('evidence'),{phase:0},true)),/84× reported/);
  assert.match(screenFrame(C.nspstoryHTML(panel('evidence'),{phase:1},true)),/84× reported/);
  assert.match(screenFrame(C.nspstoryHTML(panel('evidence'),{phase:2},true)),/near-equal pair/);
});

test('print summaries are complete and independent of selected phase', () => {
  const expectations={
    reporter:[/Newly infected cells/,/8\/18 green isolates/,/no inserts &gt;2 nt/],
    dilution:[/One founder/,/Still mixed/,/No founder/,/Sequence confirms the selected lineage/],
    origin:[/Matching source/,/Recipient \/ insertion/,/PROPOSED \/ NOT OBSERVED/,/incorporation happens is unresolved/],
    evidence:[/33\.9/,/6\.93/,/16\.7/,/>0\.2</,/0\.98/,/0\.99/]
  };
  for(const scene of Object.keys(expectations)) {
    const frames=[];
    for(let phase=0;phase<4;phase++) {
      const frame=printFrame(C.nspstoryHTML(panel(scene),{phase}));
      frames.push(frame);
      for(const expected of expectations[scene]) assert.match(frame,expected);
    }
    assert.equal(new Set(frames).size,1,`${scene} print summary must not depend on selected phase`);
  }
});

test('motion is finite presentation; reduced motion and print keep terminal geometry', () => {
  const render=C.PanelViews.get('nspstory'), p=panel('origin');
  assert.match(render({},p,{phase:3},null,[],3,true).html,/nspstory-motion/);
  assert.doesNotMatch(render({},p,{phase:3},null,[],3,false).html,/nspstory-motion/);
  const css=readStyles('style.core.css');
  assert.match(css,/@keyframes nspFragment/);
  assert.match(css,/@keyframes nspSeparate/);
  const source=fs.readFileSync(path.join(__dirname,'../packages/science/panels/types/nspstory.js'),'utf8');
  assert.doesNotMatch(source,/@keyframes nspLoss|scale\(\.65\)|drop-shadow/);
  assert.match(css,/nspstory-arrive\{animation:nspArrive \.75s/);
  assert.match(css,/nspstory-switch\{animation:nspSwitch \.6s/);
  assert.match(css,/nspstory-descendant\{animation:nspDescendant \.8s/);
  assert.match(css,/nspstory-fragment\{animation:nspFragment 1\.4s[^}]+\.3s both/);
  assert.match(css,/nspstory-ambient-primary\{animation:nspAmbientDrift var\(--nsp-ambient-primary\) ease-in-out infinite alternate/);
  assert.match(css,/nspstory-print-frame\{display:block!important/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.nspstory \*\{animation:none!important/);
  assert.match(css,/@media print\{\.nspstory[\s\S]*?animation:none!important/);
  assert.doesNotMatch(source,/setTimeout|setInterval|requestAnimationFrame|fetch\(|document\./);
  for(const scene of ['reporter','dilution','origin'])assert.match(screenFrame(C.nspstoryHTML(panel(scene),{phase:0},true)),/nspstory-ambient/);
  assert.doesNotMatch(screenFrame(C.nspstoryHTML(panel('evidence'),{phase:0},true)),/nspstory-ambient/);
});
