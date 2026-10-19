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
const screenFrame = html => /(?:<svg class="nspstory-frame nspstory-screen-frame"[\s\S]*?<\/svg>|<div class="nspstory-frame nspstory-screen-frame nspstory-canvas-frame"[\s\S]*?<\/div>)/.exec(html)[0];
const printFrame = html => /<svg class="nspstory-frame nspstory-print-frame"[\s\S]*?<\/svg>/.exec(html)[0];
const count = (text, pattern) => (text.match(pattern) || []).length;

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
  const authored=JSON.parse(source);
  assert.deepEqual(plain(C.validate(C.normalize(authored))),{errors:[],warnings:[]});
  const tabs=authored.page.blocks[0].tabs;
  assert.deepEqual(tabs.map(tab=>tab.label),['Reporter','Separate','Read evidence','Compare','Find source','Second virus','Test limits','Sources']);
  assert.ok(tabs.every(tab=>tab.sections.length===1),'each chapter tab owns one teaching surface');
  const sections=tabs.flatMap(tab=>tab.sections);
  for(const id of ['green-reporter','limiting-dilution','origin-map']){
    const section=sections.find(item=>item.id===id), titles=section.diagram.panels.map(item=>item.title);
    assert.ok(titles.some(title=>title.startsWith('ILLUSTRATIVE ·')),`${id} needs a visible conceptual layer`);
    assert.ok(titles.some(title=>title.startsWith('EVIDENCE')),`${id} needs an adjacent evidence/limits layer`);
    if(id!=='green-reporter'){
      const layout=section.diagram.sectionLayout.default;
      const artPanel=section.diagram.panels.find(item=>item.title.startsWith('ILLUSTRATIVE ·'));
      const evidencePanel=section.diagram.panels.find(item=>item.title.startsWith('EVIDENCE'));
      const art=layout.find(item=>item.panel===artPanel.id), evidence=layout.find(item=>item.panel===evidencePanel.id);
      assert.deepEqual([art.x,art.w],[0,14],`${id} needs a compact illustrative stage`);
      assert.deepEqual([evidence.x,evidence.w],[14,10],`${id} needs an adjacent readable evidence rail`);
      assert.equal(evidence.y,art.y,`${id} evidence must be visible beside the illustration`);
    }
  }
  assert.match(source,/18 WT; 16 inactive GFP-positive isolates examined/);
  assert.match(source,/12,063 \/ 13,816 = 87%/);
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
  for(const scene of ['reporter','dilution','origin']){
    const canvasHTML=screenFrame(C.nspstoryHTML({...panel(scene),ambient:true,ambientIntensity:'medium',ambientTempo:'slow'},{phase:1}));
    assert.match(canvasHTML,/<canvas class="nspstory-canvas"/);
    assert.doesNotMatch(canvasHTML,/<svg|nspstory-ambient-/,'reader teaching scenes use the shared Canvas seam');
  }
  const controls=C.nspstoryHTML({...panel('dilution'),ambient:true,ambientIntensity:'medium',ambientTempo:'slow'},{phase:1});
  for(const expected of ['Evidence + limits','Quiet','Glow','Bloom','Gentle','Normal','Brisk','Play','Pause','Replay'])assert.match(controls,new RegExp('>'+expected.replace(/[+]/g,'\\+')+'<'));
  assert.match(controls,/data-nsp-light="medium" aria-pressed="true">Glow/);
  assert.match(controls,/data-nsp-tempo="slow" aria-pressed="true">Gentle/);
  assert.match(controls,/Fixed illustrative outcomes—not well counts, probabilities, or a protocol/);
  const offHTML=C.nspstoryHTML({...lively,ambient:false},{phase:0});
  assert.match(offHTML,/data-ambient="off"/);
  assert.match(screenFrame(offHTML),/<canvas class="nspstory-canvas"/);
  assert.deepEqual(validate(diagram(lively)),{errors:[],warnings:[]});
  const normalized=plain(C.normalize(diagram(lively))).sections[0].diagram.panels[0];
  assert.deepEqual([normalized.ambient,normalized.ambientIntensity,normalized.ambientTempo],[true,'lively','fast']);
});

test('lessons expose truthful final frames, accessible summaries and escaped captions', () => {
  assert.match(screenFrame(C.nspstoryHTML(panel('reporter'),{phase:0})),/GFP reporter is off/);
  assert.match(C.nspstoryHTML(panel('reporter'),{phase:2}),/Newly infected cells/);
  const wells=screenFrame(C.nspstoryHTML(panel('dilution'),{phase:1}));
  assert.equal(count(wells,/data-well="[1-9]"/g),9);
  assert.equal(count(wells,/data-state="candidate"/g),3);
  assert.equal(count(wells,/data-state="mixed"/g),3);
  assert.equal(count(wells,/data-state="empty"/g),3);
  assert.equal(count(wells,/>candidate<|>mixed<|>empty</g),9,'every well needs a readable outcome label');
  assert.match(C.nspstoryHTML(panel('dilution'),{phase:2}),/candidate, not proof/i);
  assert.doesNotMatch(wells,/Well [A-I]|probability of|per well/i);
  const proposed=C.nspstoryHTML(panel('origin'),{phase:3});
  assert.match(proposed,/PROPOSED \/ NOT OBSERVED/);
  assert.match(proposed,/incorporation unresolved/);
  assert.match(proposed,/inferred boundary \/ unexpected patch/);
  assert.match(proposed,/dashed = inferred source link/);
  assert.match(printFrame(proposed),/class="nspstory-fragment"/);
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

test('all illustrative lessons use Canvas while evidence geometry remains literal', () => {
  const moving=(scene,phase)=>screenFrame(C.nspstoryHTML(panel(scene),{phase},true));
  for(const scene of ['reporter','dilution','origin'])for(let phase=0;phase<4;phase++) {
    const frame=moving(scene,phase);
    assert.match(frame,/<canvas class="nspstory-canvas"/);
    assert.doesNotMatch(frame,/nspstory-arrive|nspstory-switch|nspstory-descendant|nspstory-disperse|nspstory-fragment/);
  }
  assert.equal(count(moving('dilution',1),/data-well="[1-9]"/g),9);
  assert.match(moving('evidence',1),/data-rate="inactive-1"/);
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
    dilution:[/data-well="1"/,/data-well="9"/,/>candidate</,/>mixed</,/>empty</,/Candidate, not proof/,/sequence-check the recovered lineage/],
    origin:[/MATCHING SOURCE/,/RECIPIENT \/ INSERTION/,/PROPOSED \/ NOT OBSERVED/,/dashed = inferred source link/,/incorporation unresolved/],
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

test('shared science Canvas seam scales to DPR, carries settings and cleans observers and frames', () => {
  let next=0,cancelled=[],observerDisconnected=false,observed=null,draws=[];
  const frames=new Map();
  C.requestAnimationFrame=callback=>{const id=++next;frames.set(id,callback);return id;};
  C.cancelAnimationFrame=id=>{cancelled.push(id);frames.delete(id);};
  C.ResizeObserver=class {constructor(callback){this.callback=callback;}observe(value){observed=value;}disconnect(){observerDisconnected=true;}};
  const media={matches:false,addEventListener(){},removeEventListener(){}};
  const ctx={setTransform(){}};
  const canvas={width:0,height:0,attributes:{},ownerDocument:{defaultView:{devicePixelRatio:3,matchMedia:()=>media}},getBoundingClientRect:()=>({width:320,height:180}),getContext:()=>ctx,setAttribute(key,value){this.attributes[key]=value;}};
  const host={};
  const controller=C.scienceCanvasScene(host,canvas,{prefs:{intensity:'medium'},render:(context,state)=>draws.push([context===ctx,state.width,state.height,state.dpr,state.prefs.intensity]),shouldAnimate:state=>state.prefs.intensity!=='quiet'});
  assert.equal(observed,canvas);assert.deepEqual([canvas.width,canvas.height],[640,360],'DPR is capped at 2');
  frames.get(host._thTween)(0);
  assert.deepEqual(draws[0],[true,320,180,2,'medium']);
  controller.setPrefs({intensity:'quiet'});const pending=host._thTween;frames.get(pending)(16);
  assert.equal(canvas.attributes['data-canvas-running'],'false');assert.equal(controller.state.elapsed,0,'settings do not reset the story timeline');
  controller.setPrefs({intensity:'medium'});const cancellable=host._thTween;controller.destroy();
  assert.equal(observerDisconnected,true);assert.equal(host._thTween,null);assert(cancelled.includes(cancellable));
});

test('Canvas lifecycle is bounded; reduced motion and print keep terminal geometry', () => {
  const render=C.PanelViews.get('nspstory'), p=panel('origin');
  assert.match(render({},p,{phase:3},null,[],3,true).html,/nspstory-motion/);
  assert.doesNotMatch(render({},p,{phase:3},null,[],3,false).html,/nspstory-motion/);
  const css=readStyles('style.core.css');
  assert.match(css,/@keyframes nspFragment/);
  const source=fs.readFileSync(path.join(__dirname,'../packages/science/panels/types/nspstory.js'),'utf8');
  assert.doesNotMatch(source,/@keyframes nspLoss|scale\(\.65\)|drop-shadow/);
  assert.match(css,/nspstory-print-frame\{display:block!important/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.nspstory \*\{animation:none!important/);
  assert.match(css,/@media print\{\.nspstory[\s\S]*?animation:none!important/);
  assert.doesNotMatch(source,/setTimeout|setInterval|fetch\(|document\./);
  assert.match(source,/scienceLazyCanvasScene\(host,canvas/);
  assert.match(readSource('validator.js'),/data:image\/jpeg;base64,/,'build-time loader embeds the atmosphere for offline use');
  const helper=fs.readFileSync(path.join(__dirname,'../packages/science/panels/canvas-scene.js'),'utf8');
  assert.match(helper,/devicePixelRatio/);
  assert.match(helper,/ResizeObserver/);
  assert.match(helper,/requestAnimationFrame/);
  assert.match(helper,/prefers-reduced-motion: reduce/);
  assert.match(helper,/_panelMotionCleanup=destroy/);
  assert.match(source,/animation\.playState === 'paused'\) animation\.play\(\)/,'Play resumes paused animations only');
  assert.match(source,/action === 'replay'[^\n]+finiteAnimations\(\)/,'Replay alone resets finite teaching beats');
  assert.match(helper,/IntersectionObserver/);
  assert.match(helper,/data-canvas-live/);
  for(const scene of ['reporter','dilution','origin'])assert.match(screenFrame(C.nspstoryHTML(panel(scene),{phase:0},true)),/<canvas class="nspstory-canvas"/);
  assert.doesNotMatch(screenFrame(C.nspstoryHTML(panel('evidence'),{phase:0},true)),/<canvas/);
});

test('Canvas paints synchronously without rAF and retires live reduced-motion listeners', () => {
  const originalRAF=C.requestAnimationFrame;
  C.requestAnimationFrame=undefined;
  let paints=0,listener,removed=false;
  const canvas={ownerDocument:{defaultView:{matchMedia:()=>({matches:true,addEventListener(type,fn){listener=fn;},removeEventListener(type,fn){removed=fn===listener;}})}},
    getBoundingClientRect:()=>({width:500,height:300}),getContext:()=>({setTransform(){}}),setAttribute(){}};
  const controller=C.scienceCanvasScene({},canvas,{render:()=>paints++});
  assert.equal(paints,1,'A settled render is painted before mount returns, including without rAF');
  assert.equal(controller.canAnimate(),false);
  controller.destroy();assert.equal(removed,true);
  C.requestAnimationFrame=originalRAF;
});

test('lazy Canvas observes reduced motion while unmounted with one lifetime listener', () => {
  const original={raf:C.requestAnimationFrame,caf:C.cancelAnimationFrame,resize:C.ResizeObserver,intersection:C.IntersectionObserver};
  try {
    for(const legacy of [false,true]){
      const listeners=new Set(),frames=new Map(),changes=[],painted=[];
      let next=0,intersect,contexts=0,disconnected=false;
      const media={matches:false};
      if(legacy){media.addListener=fn=>listeners.add(fn);media.removeListener=fn=>listeners.delete(fn);}
      else{media.addEventListener=(type,fn)=>listeners.add(fn);media.removeEventListener=(type,fn)=>listeners.delete(fn);}
      const change=value=>{media.matches=value;for(const listener of listeners)listener({matches:value});};
      C.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};C.cancelAnimationFrame=id=>frames.delete(id);
      C.ResizeObserver=class{observe(){}disconnect(){}};
      C.IntersectionObserver=class{constructor(fn){intersect=shown=>fn([{target:canvas,isIntersecting:shown}]);}observe(){}disconnect(){disconnected=true;}};
      const canvas={isConnected:true,ownerDocument:{defaultView:{matchMedia:()=>media}},getClientRects:()=>[{}],closest:()=>null,
        getBoundingClientRect:()=>({width:500,height:300}),getContext:()=>{contexts++;return {setTransform(){}};},setAttribute(){}};
      const host={saved:{prefs:{intensity:'medium'},playing:true,elapsed:55,reduced:true}};
      const proxy=C.scienceLazyCanvasScene(host,canvas,{memoryKey:'saved',render:(ctx,state)=>painted.push(state.reduced),onStateChange:state=>changes.push(state.reduced)});
      assert.equal(proxy.state.reduced,false,'Current media preference overrides stale saved state');
      assert.equal(proxy.canAnimate(),true);assert.equal(listeners.size,1);assert.equal(contexts,0);
      change(true);
      assert.equal(proxy.state.reduced,true);assert.equal(proxy.canAnimate(),false);assert.equal(changes.at(-1),true);
      assert.equal(frames.size,0);assert.equal(contexts,0,'An offscreen preference change must not mount a drawing context');
      proxy.pause();proxy.play();assert.equal(proxy.state.playing,false,'Reduced motion prevents Play even without an inner controller');
      change(false);proxy.play();intersect(true);
      assert.equal(proxy.live(),true);assert.equal(painted.at(-1),false);assert.equal(proxy.state.elapsed,55);
      assert.equal(listeners.size,1,'Mount must not add an inner media listener');
      change(true);
      for(const [id,fn] of [...frames]){frames.delete(id);fn(16);}
      assert.equal(proxy.canAnimate(),false);assert.equal(painted.at(-1),true);assert.equal(frames.size,0);
      intersect(false);assert.equal(proxy.live(),false);assert.equal(listeners.size,1);
      change(false);assert.equal(proxy.canAnimate(),true);assert.equal(changes.at(-1),false);assert.equal(frames.size,0);
      change(true);intersect(true);
      assert.equal(painted.at(-1),true,'Remount paints the latest reduced-motion state synchronously');
      assert.equal(listeners.size,1);assert.equal(frames.size,0);
      const lateListener=[...listeners][0];proxy.destroy();proxy.destroy();
      assert.equal(disconnected,true);assert.equal(listeners.size,0);assert.equal(frames.size,0);assert.equal(proxy.canAnimate(),false);
      const count=changes.length;lateListener({matches:false});assert.equal(changes.length,count,'Queued media events cannot notify a destroyed proxy');
    }
  } finally { C.requestAnimationFrame=original.raf;C.cancelAnimationFrame=original.caf;C.ResizeObserver=original.resize;C.IntersectionObserver=original.intersection; }
});

test('teaching motion ends once, while reduced-motion source transit uses the terminal endpoint', () => {
  const lines=[];
  const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),moveTo:(x,y)=>lines.push([x,y])},{get:(target,key)=>target[key]||(()=>{})});
  const state={width:600,height:360,elapsed:15000,reduced:false,prefs:{intensity:'quiet',tempo:'fast'}};
  C.nspstoryDrawReporterCanvas(ctx,state,C.nspstoryModel(panel('reporter'),{phase:0}),null);
  assert.equal(state.canvasProgress,1,'Reporter grouping is complete; decorative light must not hide its geometry');
  C.nspstoryDrawDilution(ctx,state,C.nspstoryModel(panel('dilution'),{phase:1}),null);
  assert.equal(state.canvasProgress,1,'Completed dilution spread cannot restart on later decorative loops');
  state.reduced=true;state.elapsed=0;
  C.nspstoryDrawOriginCanvas(ctx,state,C.nspstoryModel(panel('origin'),{phase:3}),null);
  assert.deepEqual(lines.at(-1),[600*.84-22,360*.63-360*.05],'Reduced motion places the proposed fragment at its terminal endpoint');
});

test('travelling lineage shapes agree with every fixed well, including empty wells', () => {
  const original={curve:C.nspstoryCurve,token:C.nspstoryCanvasToken,well:C.nspstoryDrawWell};
  const travellers=[];let current=[];
  const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});
  try {
    C.nspstoryCurve=(...args)=>{current=[];return original.curve(...args);};
    C.nspstoryCanvasToken=(ctx,x,y,shape)=>current.push(shape);
    C.nspstoryDrawWell=(ctx,x,y,rx,well)=>travellers.push({actual:current.slice(),expected:plain(well.shapes)});
    C.nspstoryDrawDilution(ctx,{width:600,height:360,elapsed:1800,reduced:false,prefs:{}},C.nspstoryModel(panel('dilution'),{phase:1}),null);
    assert.equal(travellers.length,9);
    for(const well of travellers)assert.deepEqual(well.actual,well.expected,'Tokens cannot change identity or enter an authored empty well');
  } finally { C.nspstoryCurve=original.curve;C.nspstoryCanvasToken=original.token;C.nspstoryDrawWell=original.well; }
});

test('reporter groups from the upstream start without losing the downstream GFP message', () => {
  for(let phase=0;phase<4;phase++){
    const reading=plain(C.nspstoryReporterReading(phase)),[shifted,restored]=reading.rows;
    assert.deepEqual(shifted.gfp,restored.gfp,'Only upstream schematic length changes; GFP glyphs must remain identical');
    assert.deepEqual(restored.leader.slice(0,shifted.leader.length),shifted.leader,'The insertion preserves the existing leader symbols');
    assert.deepEqual(restored.added,[7,8],'Only the extra leader symbols carry addition marks');
    assert.equal(shifted.boundary%3,1,'Shifted GFP boundary falls inside a triplet');
    assert.equal(restored.boundary%3,0,'Restored GFP boundary begins a triplet');
    for(const row of reading.rows){
      assert.deepEqual(row.tokens.slice(row.boundary),row.gfp);
      assert.deepEqual(row.groups.map(group=>group.start),row.groups.map((group,index)=>index*3),'Grouping is anchored at START, never restarted at GFP');
    }
    assert.equal(reading.green,phase>0);
    assert.equal(reading.rows.find(row=>row.active).id,phase===0?'shifted':'restored');
    const accessible=screenFrame(C.nspstoryHTML(panel('reporter'),{phase}));
    for(const phrase of [/three-letter groups/,/GFP symbols are unchanged/,/not a sequence or actual mutation size/,/not a direct NSP15 measurement/])assert.match(accessible,phrase);
  }
});

test('reporter dark and green Canvas labels stay truthful in live and reduced-motion scenes', () => {
  for(const reduced of [false,true])for(let phase=0;phase<4;phase++){
    const labels=[];
    const ctx=new Proxy({fillText:text=>labels.push(text),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});
    const state={width:760,height:410,elapsed:0,reduced,prefs:{intensity:'medium',tempo:'slow'}};
    C.nspstoryDrawReporterCanvas(ctx,state,C.nspstoryModel(panel('reporter'),{phase}),null);
    assert.ok(labels.includes('START'));assert.ok(labels.includes('leader'));assert.ok(labels.includes('GFP region'));
    assert.equal(labels.includes('GFP ON'),phase>0);
    assert.equal(labels.includes('Cell makes functional GFP'),phase>0);
    assert.equal(labels.includes('GFP OFF'),phase===0);
    assert.equal(labels.includes('No functional GFP'),phase===0);
    assert.equal(state.canvasProgress,1,'All grouping geometry is visible even at the first frame');
  }
  const printed=printFrame(C.nspstoryHTML(panel('reporter'),{phase:0}));
  for(const phrase of [/SHIFTED LEADER/,/GFP OUT OF FRAME/,/GFP IN FRAME/,/START/,/GFP region/,/direct NSP15 measurement/])assert.match(printed,phrase);
  assert.equal(count(printed,/class="nspstory-reading-group"/g),14,'Both strips retain their triplet boxes in print');
  assert.equal(count(printed,/class="nspstory-added-symbol"/g),2,'The added symbols remain identifiable in print');
  assert.match(printed,/Insertion = extra RNA letters/);
  assert.match(readStyles('style.core.css'),/\.nspstory-reading-group\{[^}]*stroke:var\(--ns-line\)/,'Print boxes must remain distinct from the strip background');
});

test('Reporter contains its authored aspect without stretching at desktop and resized frame dimensions', () => {
  for(const [width,height] of [[504,232],[598,251],[860,282],[420,600],[760,410]])for(const reduced of [false,true]){
    const viewport=plain(C.nspstoryReporterViewport(width,height)),scales=[],translations=[];
    assert.ok(viewport.width<=width+.001&&viewport.height<=height+.001,'The complete scene fits its frame');
    assert.ok(Math.abs(viewport.width/viewport.height-760/410)<1e-10);
    assert.ok(Math.abs(viewport.x*2+viewport.width-width)<1e-10);
    assert.ok(Math.abs(viewport.y*2+viewport.height-height)<1e-10);
    const ctx=new Proxy({scale:(x,y)=>scales.push([x,y]),translate:(x,y)=>translations.push([x,y]),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});
    C.nspstoryDrawReporterCanvas(ctx,{width,height,elapsed:0,reduced,prefs:{}},C.nspstoryModel(panel('reporter'),{phase:1}),null);
    assert.deepEqual(scales,[[viewport.scale,viewport.scale]],'Glyphs, cells and text use one identical X/Y scale');
    assert.deepEqual(translations,[[viewport.x,viewport.y]],'Unused space is balanced around the scene');
  }
});
