'use strict';
const {readSource, readStyles} = require('../tools/source-loader.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
function load(extra = {}) {
  const c = vm.createContext({URL, ...extra});
  for (const name of ['validator', 'engine', 'builder.workbench']) vm.runInContext(readSource(name + '.js'), c);
  return c;
}
const C = load(), plain = value => JSON.parse(JSON.stringify(value));
const home = () => ({id:'home', type:'homemap', title:'Home',
  devices:[{id:'cam',kind:'camera',label:'Porch camera',x:65,y:45,facing:70},
    {id:'speaker',kind:'sensor',label:'Kitchen speaker',icon:'speaker',x:220,y:60},
    {id:'door',kind:'entry',label:'Door',display:'door',x:160,y:150}],
  subjects:[{id:'visitor',label:'Visitor',x:110,y:145}],
  initial:{cam:{state:'scan',thermal:'normal'},speaker:'ok',visitor:{x:100,y:140}}});
const diagram = () => ({nodes:{n:{}},rows:[['n']],panels:[home()],steps:[
  {id:'arrive',nodes:['n']},
  {id:'talk',panels:{home:{cam:{state:'rec',spotlight:'on',audio:{connection:'connected',microphone:'capturing',output:'speech',text:'Can I help?'}},visitor:{audio:{output:'speech',text:'A delivery for you.'}}}}},
  {id:'warning',panels:{home:{speaker:{audio:{output:'recorded',text:'Leave the package outside.'}}}}},
  {id:'failure',panels:{home:{cam:{audio:{connection:'interrupted',microphone:'unavailable',reason:'Wi-Fi lost'}}}}},
  {id:'rejoin',nodes:['n']},
  {id:'clear',panels:{home:{cam:{spotlight:'off',audio:null},visitor:{audio:null},speaker:{audio:null}}}}],
  paths:[{id:'talk',steps:['arrive','talk','warning','rejoin','clear']},{id:'offline',steps:['arrive','failure','rejoin','clear']}]});
function render(panel,state,host={querySelector:()=>null},index=0) {
  C.renderPanelBody(host,panel,state,'pastel',[],index,false);return host;
}
function apply(plan) {assert.ok(!plan.error,plan.error);return JSON.parse(plan.text);}

test('Home audio snapshots carry, replace, clear and ignore malformed facts independently of other conditions',()=>{
  const p=home();p.initial.cam={state:'off',thermal:'hot',spotlight:'flash',audio:{connection:'connected',output:'recorded',text:'Warning',reason:'old'}};
  const original=JSON.stringify(p);
  const states=C.foldHomemapStates(p,[
    {panels:{home:{cam:{audio:{connection:'ended'}},visitor:{audio:{output:'speech',text:'Hello'}}}}},
    {panels:{home:{cam:{state:'rec',audio:{output:'bogus',reason:3}},visitor:{x:120,y:60}}}},
    {panels:{home:{cam:{audio:{output:'chime',invalid:true},spotlight:'bad'},visitor:{audio:null}}}},
    {panels:{home:{cam:{audio:null}}}},{}]);
  assert.deepEqual(plain(states[0].cam),{state:'off',thermal:'hot',spotlight:'flash',audio:{connection:'ended'}});
  assert.deepEqual(plain(states[1].cam.audio),{connection:'ended'});assert.equal(states[1].cam.state,'rec');
  assert.deepEqual(plain(states[1].visitor),{x:120,y:60,audio:{output:'speech',text:'Hello'}});
  assert.deepEqual(plain(states[2].cam.audio),{output:'chime'});assert.equal(states[2].cam.spotlight,'flash');
  assert.equal(states[2].visitor.audio,null);assert.equal(states[4].cam.audio,null);assert.equal(states[4].cam.thermal,'hot');
  assert.equal(JSON.stringify(p),original);assert.equal(C.homemapModel(home(),{}).devices[0].spotlight,'off');
  assert.doesNotMatch(render(home(),{}).innerHTML,/hmaudio-source|hmaudio-captions|hmspotlight|fva-audio/);
});

test('audio-only subject changes preserve coordinates and hidden subjects remain hidden until placed',()=>{
  const p=home(),states=C.foldHomemapStates(p,[{panels:{home:{visitor:null}}},
    {panels:{home:{visitor:{audio:{output:'speech',text:'Out of frame'}}}}},{panels:{home:{visitor:{x:60,y:90}}}}]);
  assert.equal(C.homemapModel(p,states[1]).subjects[0].hidden,true);
  assert.doesNotMatch(render(p,states[1]).innerHTML,/Out of frame|data-home-audio="visitor"/);
  const shown=C.homemapModel(p,states[2]).subjects[0];assert.equal(shown.hidden,false);assert.equal(shown.x,60);assert.equal(shown.audio.text,'Out of frame');
  const malformed=C.foldHomemapStates(p,[{panels:{home:{visitor:{x:'bad',y:30,audio:{output:'speech'}}}}}])[0];
  assert.equal(C.homemapModel(p,malformed).subjects[0].x,100);assert.equal(malformed.visitor.audio.output,'speech');
});

test('two-way conversations, warning playback, failure branches and reverse jumps remain deterministic',()=>{
  const d=diagram(),p=d.panels[0],host={querySelector:()=>null};
  assert.deepEqual(plain(C.validate(C.normalize(d))),{errors:[],warnings:[]});
  const talk=C.foldPanelStates(C.diagramForPath(d,'talk')).home,offline=C.foldPanelStates(C.diagramForPath(d,'offline')).home;
  assert.equal(talk[3].cam.audio.connection,'connected');assert.equal(talk[3].speaker.audio.output,'recorded');
  assert.equal(offline[2].cam.audio.connection,'interrupted');assert.equal(offline[2].speaker,'ok');
  render(p,talk[2],host,2);
  assert.match(host.innerHTML,/data-home-audio="cam"[\s\S]*fva-capture/);
  assert.match(host.innerHTML,/data-home-audio="visitor"[\s\S]*data-sound="speech"/);
  assert.match(host.innerHTML,/data-home-audio="speaker"[\s\S]*data-sound="recorded"/);
  assert.match(host.innerHTML,/Kitchen speaker/);assert.match(host.innerHTML,/href="#i-speaker"/);
  render(p,offline[2],host,2);assert.match(host.innerHTML,/Wi-Fi lost/);
  assert.doesNotMatch(host.innerHTML,/data-sound=|hmspotlight|Can I help|Leave the package/);
  render(p,talk[1],host,1);assert.match(host.innerHTML,/Can I help\?/);assert.doesNotMatch(host.innerHTML,/Wi-Fi lost/);
  render(p,talk[4],host,4);assert.doesNotMatch(host.innerHTML,/fva-audio|hmspotlight|fva-emission|fva-capture/);
});

test('unplayed sound explains its outcome without emission and heard alarms never set physical device state',()=>{
  const p=home();
  for(const playback of ['queued','suppressed','failed','stopped']){
    const state={speaker:{audio:{output:'siren',playback,reason:'Authored '+playback}},cam:{audio:{microphone:'capturing',detection:'smoke-alarm'}}};
    const model=C.homemapModel(p,state),html=render(p,state).innerHTML;
    assert.equal(model.devices[0].state,'scan');assert.equal(model.devices[1].state,'ok');assert.equal(model.devices[0].spotlight,'off');
    assert.match(html,/Smoke alarm heard/);assert.match(html,new RegExp('Authored '+playback));
    assert.doesNotMatch(html,/data-home-audio="speaker"|data-sound="siren"/);assert.match(html,/data-home-audio="cam"/);
  }
  const html=render(p,{door:{audio:{output:'chime'}},speaker:{audio:{output:'siren'}}}).innerHTML;
  assert.match(html,/data-home-audio="door" transform="translate\(160 180\)"/);
  assert.match(html,/data-sound="chime"/);assert.match(html,/data-sound="siren"/);
});

test('warnings locate bad nested audio; source identity, captions and explanations escape safely',()=>{
  const p=home();p.initial.cam.audio={output:'noise',text:3};
  const d={...diagram(),panels:[p],steps:[{nodes:['n'],panels:{home:{cam:{audio:{microphone:'spy',source:[]},spotlight:'laser'},visitor:{audio:42}}}}]};delete d.paths;
  const warnings=C.validate(C.normalize(d)).warnings.join('\n');
  for(const field of ['initial.cam.audio.output','initial.cam.audio.text','panels.home.cam.audio.microphone','panels.home.cam.audio.source','panels.home.cam.spotlight','panels.home.visitor.audio'])assert.ok(warnings.includes(field),field);
  p.devices[0].id='c"/><script>';p.devices[0].label='<img onerror="bad">';
  const html=render(p,{[p.devices[0].id]:{spotlight:'on',audio:{output:'speech',text:'<script>bad</script>',source:'"<b>',reason:'<img>'}}}).innerHTML;
  assert.doesNotMatch(html,/<script>|<img|<b>/);assert.match(html,/&lt;script&gt;bad/);assert.match(html,/&lt;img onerror=&quot;bad&quot;&gt;/);
  const css=readStyles('style.core.css');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.hmspotlight-flash\{animation:none/);
  assert.match(css,/@media print\{\.hmspotlight-flash\{animation:none/);
  assert.doesNotMatch(html,/NaN|Infinity|<audio|autoplay/);
});

test('attribute planners retain sibling fields and remove only the chosen local override',()=>{
  let d=diagram();const edit=(step,id,field,value)=>d=apply(C.planHomemapDeviceAttribute(JSON.stringify(d),d,0,step,'home',id,field,value));
  edit(1,'cam','audio',{output:'recorded',text:'Stay outside'});
  assert.deepEqual(d.steps[1].panels.home.cam,{state:'rec',spotlight:'on',audio:{output:'recorded',text:'Stay outside'}});
  edit(1,'cam','audio',undefined);assert.deepEqual(d.steps[1].panels.home.cam,{state:'rec',spotlight:'on'});
  edit(1,'cam','spotlight','flash');assert.equal(d.steps[1].panels.home.cam.spotlight,'flash');
  edit(null,'visitor','audio',{output:'speech',text:'Hello'});
  assert.deepEqual(d.panels[0].initial.visitor,{x:100,y:140,audio:{output:'speech',text:'Hello'}});
  edit(null,'visitor','audio',undefined);assert.deepEqual(d.panels[0].initial.visitor,{x:100,y:140});
  edit(1,'visitor','audio',null);assert.deepEqual(d.steps[1].panels.home.visitor,{audio:null});
  edit(1,'visitor','audio',undefined);assert.equal(d.steps[1].panels.home.visitor,undefined);
  for(const [id,field,value] of [['cam','spotlight','laser'],['cam','audio',{output:'noise'}],['visitor','audio',[]],['visitor','spotlight','on']])
    assert.ok(C.planHomemapDeviceAttribute(JSON.stringify(d),d,0,1,'home',id,field,value).error);
  const scene=C.builderHomemapLayoutScene({...home(),initial:{visitor:{x:15,y:30,audio:{output:'speech'}}}});assert.equal(scene.model.subjects[0].audio.output,'speech');
});

function element(tag='div'){
  return {tag,children:[],attrs:{},events:{},style:{},classList:{add(){},remove(){},toggle(){}},
    appendChild(child){this.children.push(child);return child;},setAttribute(k,v){this.attrs[k]=String(v);},
    addEventListener(k,fn){this.events[k]=fn;},querySelector(){return null;},querySelectorAll(){return [];}};
}
function descendants(e){return [e,...e.children.flatMap(descendants)];}
function editorHarness(){
  const c=load({document:{createElement:element,createElementNS:(_,tag)=>element(tag)}});
  let raw=diagram(),source=JSON.stringify(raw),lastError;
  function input(tag,value,save){const e=element(tag);e.value=value;e.save=save;return e;}
  const context={source:()=>source,stepper:()=>({path:()=> 'talk',sourceIndex:()=>1}),target:()=>({kind:'step',section:0,index:1}),
    controls:{row:(label,ctl)=>{const row=element();row.label=label;row.appendChild(ctl);return row;},
      action:(label,run)=>{const e=element('button');e.textContent=label;e.run=run;return e;},
      number:(v,save)=>input('input',v,save),text:(v,save)=>input('input',v,save),select:(options,v,save)=>input('select',v,save)},
    editingBlocked:()=>false,error:message=>lastError=message,inspect(){},listen:(e,k,fn)=>e.events[k]=fn,
    transact(fn){const plan=fn(raw);if(plan.error){lastError=plan.error;return false;}source=plan.text;raw=JSON.parse(source);return true;},
    clipboard:()=>null,select(){},rehighlight(){}};
  const editor=c.PanelRegistry.get('homemap').authoring.editor(context);
  return {raw:()=>raw,error:()=>lastError,step:()=>editor.stepControl(raw,raw.panels[0],{section:0,index:1,pathId:'talk'}),
    initial(){const rows=[];editor.setupRows(raw.panels[0],raw,{section:0,index:0},rows);const e=element();rows.forEach(row=>e.appendChild(row));return e;}};
}
test('typed step and initial controls author channels and spotlight while placement preserves speech',()=>{
  const h=editorHarness(),field=(tree,label)=>descendants(tree).find(e=>e.attrs['aria-label']===label);
  let tree=h.step();
  for(const label of ['Porch camera audio connection','Porch camera audio microphone','Porch camera audio output','Porch camera audio playback','Porch camera audio detection','Porch camera audio text','Porch camera audio reason','Visitor audio output','Porch camera spotlight'])assert.ok(field(tree,label),label);
  const output=field(tree,'Porch camera audio output');output.value='recorded';output.events.change();
  assert.equal(h.raw().steps[1].panels.home.cam.audio.output,'recorded');assert.equal(h.raw().steps[1].panels.home.cam.audio.microphone,'capturing');
  tree=h.step();field(tree,'Visitor x').save(145);
  assert.deepEqual(h.raw().steps[1].panels.home.visitor,{x:145,y:140,audio:{output:'speech',text:'A delivery for you.'}});
  tree=h.step();const audio=field(tree,'Visitor audio snapshot');audio.value='inherit';audio.events.change();
  assert.deepEqual(h.raw().steps[1].panels.home.visitor,{x:145,y:140});
  tree=h.initial();field(tree,'Porch camera initial spotlight').save('on');assert.equal(h.raw().panels[0].initial.cam.spotlight,'on');
  tree=h.initial();const initial=field(tree,'Visitor initial audio output');initial.value='speech';initial.events.change();
  assert.deepEqual(h.raw().panels[0].initial.visitor,{x:100,y:140,audio:{output:'speech'}});assert.equal(h.error(),undefined);
});
