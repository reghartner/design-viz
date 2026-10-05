const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {spawnSync}=require('node:child_process'),path=require('node:path'),os=require('node:os');
const context={};vm.runInNewContext(readSource('compatibility.js'),context);
const C=context.FlowviewCompatibility;
const spec=()=>({page:{contract:'1',title:'Compatibility test',blocks:[{tabs:[{label:'Story',sections:[{
  heading:'Doorbell',diagram:{nodes:{cam:{title:'Doorbell'}},rows:[['cam']],edges:[],
    panels:[{id:'home',type:'homemap'},{id:'phone',type:'deviceapp'}],
    steps:[{id:'start'},{id:'done'},{id:'lost',failures:{'cam->cloud':'dropped'}}],
    paths:[{id:'happy',steps:['start','done']},{id:'failed',steps:['start','lost']}],
    layouts:[{id:'home',steps:['start','done']}]}
}]}]}]}});
const plain=v=>JSON.parse(JSON.stringify(v));
test('saved Explore scale declares a capability so older viewers can report it',()=>{
  const raw={page:{sections:[{diagram:{nodes:{a:{}},rows:[['a']],layouts:[{id:'engineering',presentation:'explore',exploreLayout:{overlayScale:.75}}]}}]}};
  assert.ok(C.detect(raw).includes('layout.explore-scale'));
  const stamped=C.stamp(raw),available={...C.features};delete available['layout.explore-scale'];
  assert.ok(C.check(stamped,{version:C.version,contract:'1',features:available}).missingFeatures.includes('layout.explore-scale'));
  delete raw.page.sections[0].diagram.layouts[0].exploreLayout.overlayScale;
  assert.ok(!C.detect(raw).includes('layout.explore-scale'));
});

test('stable inserted floats declare their capability for older viewers',()=>{
  const raw={page:{sections:[{diagram:{nodes:{a:{},b:{}},rows:[['b']],
    floats:[{id:'a',side:'below',x:1400,y:90,noSpread:true}],edges:[]}}]}};
  const stamped=C.stamp(raw),features=stamped.page.flowview.features;
  assert.ok(features.includes('layout.inserted-floats'));
  const older={...C.features};delete older['layout.inserted-floats'];
  const result=C.check(stamped,{version:C.version,contract:'1',features:older});
  assert.ok(result.missingFeatures.includes('layout.inserted-floats'));
  assert.match(result.messages.join(' '),/Stable placement of inserted nodes/);
});

test('semver compares numeric components, prereleases and metadata without lexical mistakes',()=>{
  for(const [a,b] of [['1.9.0','1.10.0'],['1.0.0-alpha','1.0.0-alpha.1'],['1.0.0-beta.2','1.0.0-beta.11'],
    ['1.0.0-9','1.0.0-alpha'],['1.0.0-rc.1','1.0.0'],['2.0.0','10.0.0']]){
    assert.equal(C.compare(a,b),-1);assert.equal(C.compare(b,a),1);
  }
  assert.equal(C.compare('1.0.0+company.1','1.0.0+other'),0);
  for(const version of ['1.0','v1.2.3','01.2.3','1.0.0-01',null])assert.equal(C.compare(version,'1.0.0'),null);
});
test('legacy specs still work and a newer authoring tool alone does not require an upgrade',()=>{
  const raw=spec();assert.equal(C.check(raw).status,'unversioned');assert.equal(C.check(raw).messages.length,0);
  raw.page.flowview={authoredWith:'9.0.0',minVersion:C.version};
  assert.equal(C.check(raw).status,'compatible');
});
test('reports required/installed releases and exact unavailable features across nested sections',()=>{
  const raw=spec(),detected=plain(C.detect(raw));
  assert.deepEqual(detected,['content.deviceapp','flow.alternates','flow.failures','layout.named','layout.step-subsets','panel.deviceapp','panel.homemap']);
  raw.page.flowview={minVersion:'1.10.0',features:['panel.future']};
  const available={...C.features};delete available['panel.deviceapp'];
  const result=C.check(raw,{version:'1.9.0',contract:'1',features:available});
  assert.equal(result.status,'partial');assert.equal(result.minVersion,'1.10.0');
  assert.deepEqual(plain(result.missingFeatures),['panel.deviceapp','panel.future']);
  assert.match(result.messages.join(' '),/Device app panel/);assert.match(result.messages.join(' '),/1.9.0/);
  assert.match(result.messages.join(' '),/1.10.0/);
});
test('schema mismatches and malformed metadata are reported instead of claiming compatibility',()=>{
  const raw=spec();raw.page.contract='2';assert.equal(C.check(raw).status,'unsupported');
  raw.page.contract='1';
  for(const metadata of [[],false,'1',{minVersion:'latest'},{features:'homemap'},{authoredWith:42},{features:[null]}]){
    raw.page.flowview=metadata;assert.equal(C.check(raw).status,'partial');
    assert.ok(C.metadataWarnings(raw).length);
  }
});
test('stamping infers feature requirements, preserves future declarations and never mutates the editor value',()=>{
  const raw=spec();raw.page.flowview={minVersion:'9.0.0',features:['panel.future'],companyField:'kept'};
  const before=JSON.stringify(raw),stamped=C.stamp(raw);
  assert.equal(JSON.stringify(raw),before);assert.equal(stamped.page.flowview.minVersion,'9.0.0');
  assert.equal(stamped.page.flowview.authoredWith,C.version);assert.equal(stamped.page.flowview.companyField,'kept');
  assert.ok(stamped.page.flowview.features.includes('panel.future'));
  assert.ok(stamped.page.flowview.features.includes('panel.deviceapp'));
  assert.deepEqual(plain(C.stamp(stamped)),plain(stamped));
  assert.equal(C.stampText('{unfinished'),'{unfinished');
  assert.equal(C.stampText('{"value":1e400}'),'{"value":1e400}');
  assert.equal(C.stamp({nodes:{a:{}},rows:[['a']]}).page.contract,'1');
});
test('new feature release requirements are inferred rather than stamping every spec with the current editor version',()=>{
  const source=readSource('compatibility.js').replace(/\bversion = '[^']*'/,"version = '2.0.0'");
  const newer={};vm.runInNewContext(source,newer);const N=newer.FlowviewCompatibility;
  N.features['panel.deviceapp'].since='1.2.0';
  const stamped=N.stamp(spec());
  assert.equal(stamped.page.flowview.authoredWith,'2.0.0');assert.equal(stamped.page.flowview.minVersion,'1.2.0');
});
test('all current panel types have an explicit compatibility capability',()=>{
  const validator={};vm.runInNewContext(readSource('validator.js'),validator);
  for(const type of validator.PANEL_TYPES)assert.ok(C.features['panel.'+type],type+' requires a capability entry');
  for(const feature of Object.values(C.features)){
    assert.notEqual(C.compare(feature.since,C.version),null);assert.ok(C.compare(feature.since,C.version)<=0);
  }
});
test('CLI stamps to stdout without changing input and exits nonzero for incompatible specs',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-compatibility-'));
  try{
    const file=path.join(dir,'spec.json'),raw=spec(),before=JSON.stringify(raw);fs.writeFileSync(file,before);
    const stamped=spawnSync(process.execPath,['tools/compatibility.js','--stamp',file],{encoding:'utf8'});
    assert.equal(stamped.status,0,stamped.stderr);assert.equal(JSON.parse(stamped.stdout).page.flowview.authoredWith,C.version);
    assert.equal(fs.readFileSync(file,'utf8'),before);
    raw.page.flowview={minVersion:'9.0.0'};fs.writeFileSync(file,JSON.stringify(raw));
    const checked=spawnSync(process.execPath,['tools/compatibility.js',file],{encoding:'utf8'});
    assert.equal(checked.status,1);assert.equal(JSON.parse(checked.stdout).status,'partial');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('audio and spotlight features are stamped across endpoint panels, Home subjects and transient patches',()=>{
  const raw={page:{sections:[{diagram:{nodes:{cam:{}},rows:[['cam']],panels:[
    {id:'home',type:'homemap',devices:[{id:'cam'}],subjects:[{id:'visitor'}]},
    {id:'phone',type:'phone'}, {id:'camera',type:'screen'}, {id:'monitor',type:'security'}],steps:[
    {panels:{home:{visitor:{x:20,y:30,audio:{output:'speech'}},cam:{spotlight:'on'}}}},
    {patch:{phone:{enterOnce:{audio:{microphone:'muted'}}}}}
  ]}}]}};
  const stamped=C.stamp(raw);
  assert.ok(stamped.page.flowview.features.includes('media.audio'));
  assert.ok(stamped.page.flowview.features.includes('media.spotlight'));
  const older={...C.features};delete older['media.audio'];delete older['media.spotlight'];
  assert.deepEqual(plain(C.check(stamped,{version:C.version,contract:'1',features:older}).missingFeatures),['media.audio','media.spotlight']);
  const d=raw.page.sections[0].diagram;
  d.steps=[];d.panels[2].initial={audio:{output:'recorded'}};
  assert.ok(C.detect(raw).includes('media.audio'));
  d.panels[2].initial={};d.steps=[{panels:{monitor:{enterOnce:{audio:{output:'speech'},spotlight:'flash'}}}}];
  assert.ok(C.detect(raw).includes('media.spotlight'));
  d.steps=[];assert.ok(!C.detect(raw).includes('media.audio'));
});


test('device app notifications and optional sources warn older viewers without changing existing source maps',()=>{
  const raw=spec(),d=raw.page.blocks[0].tabs[0].sections[0].diagram,p=d.panels[1];
  p.sources=[{id:'device'}];assert.ok(!C.detect(raw).includes('content.deviceapp'));
  const older={...C.features};delete older['content.deviceapp'];
  for(const configure of [()=>p.showSources=false,()=>p.initial={notify:{app:'Home'}},()=>d.steps[0].panels={phone:{clear:true}}]){
    configure();const stamped=C.stamp(raw);
    assert.deepEqual(plain(C.check(stamped,{version:C.version,contract:'1',features:older}).missingFeatures),['content.deviceapp']);
    delete p.showSources;delete p.initial;delete d.steps[0].panels;
  }
});

test('device app phone screens and card visibility require the navigation capability',()=>{
 const raw={page:{sections:[{diagram:{panels:[{id:'app',type:'deviceapp',sources:[{id:'backend'}],fields:[{id:'battery'}]}]}}]}};
 const d=raw.page.sections[0].diagram,p=d.panels[0],older={...C.features};delete older['content.deviceapp-navigation'];
 for(const patch of [{phoneScreen:'home'},{battery:{visible:false}}]){
  p.initial=patch;
  assert.ok(C.detect(raw).includes('content.deviceapp-navigation'));
  assert.deepEqual(plain(C.check(C.stamp(raw),{version:C.version,contract:'1',features:older}).missingFeatures),['content.deviceapp-navigation']);
  delete p.initial;d.steps=[{patch:{app:patch}}];assert.ok(C.detect(raw).includes('content.deviceapp-navigation'));delete d.steps;
 }
 assert.ok(!C.detect(raw).includes('content.deviceapp-navigation'));
});


test('whole-panel visibility advertises a capability for older installed viewers',()=>{
  const d={nodes:{a:{}},rows:[['a']],panels:[{id:'phone',type:'phone',visible:false}],steps:[{panelVisibility:{phone:true}}]};
  assert.ok(C.detect(d).includes('flow.panel-visibility'));
  delete d.panels[0].visible;assert.ok(C.detect(d).includes('flow.panel-visibility'));
  delete d.steps[0].panelVisibility;assert.ok(!C.detect(d).includes('flow.panel-visibility'));
  d.panels[0].visible=false;
  const old={version:'0.1.0',contract:'1',features:{'panel.phone':{since:'0.1.0'}}};
  assert.ok(C.check(d,old).missingFeatures.includes('flow.panel-visibility'));
});

test('Explore named views advertise their capability without requiring it for Standard views',()=>{
  const raw=spec(),d=raw.page.blocks[0].tabs[0].sections[0].diagram;
  for(const presentation of [undefined,'standard','unknown']){
    d.layouts[0].presentation=presentation;assert.ok(!C.detect(raw).includes('layout.explore'));
  }
  d.layouts[0].presentation='explore';assert.ok(C.detect(raw).includes('layout.explore'));
  const stamped=C.stamp(raw);assert.ok(stamped.page.flowview.features.includes('layout.explore'));
  const older={...C.features};delete older['layout.explore'];
  const result=C.check(stamped,{version:C.version,contract:'1',features:older});
  assert.deepEqual(plain(result.missingFeatures),['layout.explore']);
  assert.match(result.messages.join(' '),/Explore view presentation/);
});

test('view-specific paths advertise their capability independently of step subsets',()=>{
  const raw=spec(),view=raw.page.blocks[0].tabs[0].sections[0].diagram.layouts[0];
  assert.ok(!C.detect(raw).includes('layout.path-subsets'));
  view.paths=['happy'];assert.ok(C.detect(raw).includes('layout.path-subsets'));
  const available={...C.features};delete available['layout.path-subsets'];
  const result=C.check(C.stamp(raw),{version:C.version,contract:'1',features:available});
  assert.deepEqual(plain(result.missingFeatures),['layout.path-subsets']);
  assert.match(result.messages.join(' '),/View-specific alternate paths/);
});

test('floating prose declares a capability for content or saved per-view defaults, including tab sections',()=>{
  const raw=spec(),section=raw.page.blocks[0].tabs[0].sections[0],view=section.diagram.layouts[0];
  section.text=['Explanation'];assert.ok(!C.detect(raw).includes('layout.explore-prose'));
  view.presentation='explore';assert.ok(C.detect(raw).includes('layout.explore-prose'));
  const available={...C.features};delete available['layout.explore-prose'];
  assert.ok(C.check(C.stamp(raw),{version:C.version,contract:'1',features:available}).missingFeatures.includes('layout.explore-prose'));
  delete section.text;assert.ok(!C.detect(raw).includes('layout.explore-prose'));
  section.bullets=['A point'];assert.ok(C.detect(raw).includes('layout.explore-prose'));delete section.bullets;
  view.exploreLayout={prose:{hidden:true}};assert.ok(C.detect(raw).includes('layout.explore-prose'));
});

const SCREEN_FEATURES=['media.scene-raccoon-at-night','media.screen-playing','media.screen-scene-override'];
const screenUse=raw=>plain(C.detect(raw)).filter(id=>SCREEN_FEATURES.includes(id));
const withoutScreenFeatures=()=>{const older={...C.features};SCREEN_FEATURES.forEach(id=>delete older[id]);return older;};

test('Screen Playing, per-step scene overrides and the raccoon clip are 0.2.0 capabilities; the baseline stays 0.1.0',()=>{
  assert.equal(C.version,'0.2.0');
  for(const id of SCREEN_FEATURES)assert.equal(C.features[id].since,'0.2.0',id);
  for(const id of ['panel.screen','panel.security','media.audio','media.spotlight','flow.panel-visibility','flow.alternates'])
    assert.equal(C.features[id].since,'0.1.0',id);
  // A Screen story using only older scenes and modes keeps the baseline minimum.
  const legacy={nodes:{a:{}},rows:[['a']],panels:[{id:'cam',type:'screen',scene:'package-drop',initial:{mode:'off',scenePlayback:'waiting'}}],
    steps:[{panels:{cam:{mode:'rec'}}},{panels:{cam:{mode:'save',banner:'Saved',enterOnce:{mode:'live'}}}}]};
  assert.deepEqual(screenUse(legacy),[]);
  const stamped=C.stamp(legacy);
  assert.equal(stamped.page.flowview.minVersion,'0.1.0');assert.equal(stamped.page.flowview.authoredWith,'0.2.0');
  assert.equal(C.check(stamped).status,'compatible');
});

test('Screen capabilities are detected from declarations, initial, panels/legacy patch steps and enterOnce, including tabs',()=>{
  const raw=spec(),d=raw.page.blocks[0].tabs[0].sections[0].diagram,cam={id:'cam',type:'screen',scene:'kitchen-fire'};
  d.panels.push(cam);
  const at=(setup,expected)=>{delete cam.initial;d.steps=[{id:'start'},{id:'done'},{id:'lost'}];cam.scene='kitchen-fire';setup();
    assert.deepEqual(screenUse(raw),expected,JSON.stringify({cam,steps:d.steps}));};
  at(()=>{},[]);
  at(()=>cam.scene='raccoon-at-night',['media.scene-raccoon-at-night']);
  at(()=>cam.initial={mode:'playing'},['media.screen-playing']);
  at(()=>d.steps[1].panels={cam:{mode:'playing',banner:'Clip'}},['media.screen-playing']);
  at(()=>d.steps[1].patch={cam:{mode:'playing'}},['media.screen-playing']);
  at(()=>d.steps[1].panels={cam:{enterOnce:{mode:'playing'}}},['media.screen-playing']);
  // Any per-state scene, including an older clip or the null reset, needs the override.
  at(()=>d.steps[1].panels={cam:{scene:null}},['media.screen-scene-override']);
  at(()=>d.steps[1].panels={cam:{mode:'rec',scene:'kitchen-fire'}},['media.screen-scene-override']);
  at(()=>cam.initial={scene:'package-drop'},['media.screen-scene-override']);
  at(()=>d.steps[2].patch={cam:{enterOnce:{scene:'raccoon-at-night'}}},['media.scene-raccoon-at-night','media.screen-scene-override']);
  // Modes and banners from earlier releases, or a patch for another panel, need nothing new.
  at(()=>{d.steps[1].panels={cam:{mode:'rec',scenePlayback:'playing'},home:{mode:'playing',scene:null}};},[]);
});

test('shared Security monitoring requires only the raccoon clip, never Screen-only semantics',()=>{
  const d={nodes:{a:{}},rows:[['a']],panels:[{id:'monitor',type:'security',scene:'person-through-door'}],steps:[]},p=d.panels[0];
  assert.deepEqual(screenUse(d),[]);
  p.initial={video:'reviewing',scene:'kitchen-fire',mode:'playing'};assert.deepEqual(screenUse(d),[],'older state scene is supported');
  delete p.initial;p.scene='raccoon-at-night';assert.deepEqual(screenUse(d),['media.scene-raccoon-at-night']);
  p.scene='person-through-door';
  for(const step of [{panels:{monitor:{scene:'raccoon-at-night'}}},{patch:{monitor:{enterOnce:{scene:'raccoon-at-night'}}}}]){
    d.steps=[step];assert.deepEqual(screenUse(d),['media.scene-raccoon-at-night']);
  }
  d.steps=[{panels:{monitor:{scene:null}}}];assert.deepEqual(screenUse(d),[]);
  // Unrelated panel types with similarly named fields never require Screen capabilities.
  const other={nodes:{a:{}},rows:[['a']],panels:[{id:'s',type:'state',scene:'raccoon-at-night',initial:{mode:'playing',scene:null}},
    {id:'phone',type:'phone',initial:{mode:'playing',scene:'raccoon-at-night'}},
    {id:'home',type:'homemap',devices:[{id:'cam'}],initial:{cam:{mode:'playing',scene:'raccoon-at-night'}}}],
    steps:[{panels:{s:{mode:'playing'},phone:{enterOnce:{scene:null}},home:{cam:{scene:'raccoon-at-night'}}}}]};
  assert.deepEqual(screenUse(other),[]);
});

test('the stamped Kestrel overnight story declares 0.2.0 Screen capabilities that an older viewer reports missing',()=>{
  const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/kestrel-overnight/story.spec.json'),'utf8'));
  const declared=raw.page.flowview,stamped=C.stamp(raw).page.flowview;
  assert.deepEqual(plain(stamped),plain(declared),'committed metadata matches a fresh stamp');
  assert.equal(declared.authoredWith,'0.2.0');assert.equal(declared.minVersion,'0.2.0');
  for(const id of SCREEN_FEATURES)assert.ok(declared.features.includes(id),id);
  assert.ok(!declared.features.includes('flow.panel-visibility'));
  const current=C.check(raw);
  assert.equal(current.status,'compatible');assert.deepEqual(plain(current.missingFeatures),[]);
  // The 0.1.0 viewer knew panel.screen but none of the new Screen semantics.
  const old=C.check(raw,{version:'0.1.0',contract:'1',features:withoutScreenFeatures()});
  assert.equal(old.status,'partial');
  assert.deepEqual(plain(old.missingFeatures),SCREEN_FEATURES);
  assert.equal(old.minVersion,'0.2.0');
  const text=old.messages.join(' ');
  assert.match(text,/requires Flowview 0\.2\.0 or newer\. This viewer uses 0\.1\.0/);
  assert.match(text,/Camera screen Playing mode/);assert.match(text,/Camera screen scene changes per step/);assert.match(text,/Raccoon-at-night camera clip/);
  // Without the metadata, content detection still reports the same gaps.
  delete raw.page.flowview;
  assert.deepEqual(plain(C.check(raw,{version:'0.1.0',contract:'1',features:withoutScreenFeatures()}).missingFeatures),SCREEN_FEATURES);
});

test('independent camera sirens advertise compatibility in initial and transient states',()=>{
  for(const type of ['screen','security']){
    const raw={nodes:{n:{}},rows:[['n']],edges:[],panels:[{id:'cam',type,initial:{siren:'on'}}],steps:[]};
    assert.ok(C.detect(raw).includes('media.camera-siren'));
    raw.panels[0].initial={};raw.steps=[{panels:{cam:{enterOnce:{siren:'off'}}}}];
    assert.ok(C.detect(raw).includes('media.camera-siren'));
    delete raw.steps[0].panels.cam.enterOnce.siren;
    assert.ok(!C.detect(raw).includes('media.camera-siren'));
  }
});

test('Explore canvas geometry declares its compatibility requirement even when Floating is selected',()=>{
  const view={id:'engineering',presentation:'explore',exploreLayout:{panelPlacement:'canvas'}};
  const raw={page:{sections:[{diagram:{nodes:{a:{}},rows:[['a']],layouts:[view]}}]}};
  assert.ok(C.detect(raw).includes('layout.explore-canvas'));
  const available={...C.features};delete available['layout.explore-canvas'];
  assert.ok(C.check(C.stamp(raw),{version:C.version,contract:'1',features:available}).missingFeatures.includes('layout.explore-canvas'));
  view.exploreLayout={panelPlacement:'floating',canvas:{panels:[]}};assert.ok(C.detect(raw).includes('layout.explore-canvas'));
  delete view.exploreLayout.canvas;assert.ok(!C.detect(raw).includes('layout.explore-canvas'));
});

test('per-panel Explore placement exports require the independent-placement capability even without geometry',()=>{
 const raw={page:{sections:[{diagram:{nodes:{a:{}},rows:[['a']],layouts:[{id:'eng',presentation:'explore',exploreLayout:{panelPlacements:[{panel:'home',placement:'canvas'}]}}]}}]}};
 assert.ok(C.detect(raw).includes('layout.explore-panel-placement'));
 const available={...C.features};delete available['layout.explore-panel-placement'];
 assert.ok(C.check(C.stamp(raw),{version:C.version,contract:'1',features:available}).missingFeatures.includes('layout.explore-panel-placement'));
});

test('canvas step controls declare placement capability even with dormant graph geometry',()=>{
 for(const exploreLayout of [{controlsPlacement:'canvas'},{controlsPlacement:'floating',canvas:{controls:{x:0,y:900,w:720,h:220}}}]){
  const raw={page:{sections:[{diagram:{layouts:[{id:'story',presentation:'explore',exploreLayout}]}}]}};
  assert.ok(C.detect(raw).includes('layout.explore-controls-placement'));
  const available={...C.features};delete available['layout.explore-controls-placement'];
  assert.ok(C.check(C.stamp(raw),{version:C.version,contract:'1',features:available}).missingFeatures.includes('layout.explore-controls-placement'));
 }
});
