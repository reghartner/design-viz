'use strict';
const {readSource} = require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function context(extra={}){
  const c={URL,TextEncoder,...extra};vm.createContext(c);
  for(const name of ['canon','validator','engine','builder.workbench','clipboard.workbench'])vm.runInContext(readSource(name+'.js'),c);
  return c;
}
const C=context(),plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){return {page:{title:'Clipboard example',sections:[{heading:'Source',diagram:{
  nodes:{a:{title:'API',group:'service'},b:{title:'Worker',group:'service'},c:{title:'Other'}},rows:[['a','b','c']],
  groups:{service:{title:'Service',parent:'company'},company:{title:'Company'}},edges:[{from:'a',to:'b',kind:'https'},{from:'b',to:'c',kind:'mqtt'}],
  primaryPanel:'home',panels:[{id:'home',title:'Home',type:'homemap',outline:{w:240,h:150},
    devices:[{id:'cam',kind:'camera',label:'Camera',x:310,y:175,custom:'retained'},{id:'hub',kind:'hub',x:120,y:40}],
    subjects:[{id:'visitor',x:20,y:30},{id:'hidden',x:50,y:40}],rooms:[{label:'Porch',kind:'outdoor',x:240,y:120,w:80,h:60}],
    initial:{cam:'rec',visitor:{x:40,y:50},hidden:null,signals:[{from:'cam',to:'hub'}]}}],
  steps:[{id:'request',edge:'a->b',panels:{home:{cam:'detect',visitor:{x:100,y:100}}}},{id:'drop',failures:{'a->b':'dropped'},panels:{home:{cam:'off'}}}],
  paths:[{id:'happy',label:'Happy path',steps:['request']},{id:'failed',label:'Dropped',steps:['request','drop']}]
}},{heading:'Destination',diagram:{nodes:{a:{title:'Existing'}},rows:[['a']],edges:[],panels:[{id:'home',type:'homemap',devices:[{id:'cam-copy',kind:'sensor',x:10,y:10}],subjects:[{id:'cam-copy-2',x:30,y:20}]}]}}]}};}
const diagram=(raw,n=0)=>raw.page.sections[n].diagram;
function copy(raw,targets){const r=C.builderClipboardCopy(raw,targets);assert.equal(r.error,undefined);return r.data;}
function paste(raw,data,dest){const r=C.planPasteBuilderClipboard(JSON.stringify(raw),raw,data,dest);assert.equal(r.error,undefined);return {raw:JSON.parse(r.text),target:plain(r.target)};}
const homeTarget=(field,item=0)=>({kind:'home',section:0,index:0,field,item});

test('Home device copies reserve IDs across devices and subjects, offset within bounds, and leave timeline overrides alone',()=>{
  const raw=fixture(),before=JSON.stringify(raw),data=copy(raw,[homeTarget('devices')]);
  const out=paste(raw,data,{section:1,index:0}),home=diagram(out.raw,1).panels[0],device=home.devices[1];
  assert.equal(device.id,'cam-copy-3');assert.equal(device.custom,'retained');assert.equal(device.x,298);assert.equal(device.y,167);
  assert.equal(home.initial['cam-copy-3'],'rec');assert.equal(home.initial.signals,undefined);
  assert.deepEqual(diagram(out.raw).steps,diagram(raw).steps);assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(out.target,{kind:'home',section:1,index:0,field:'devices',item:1});
});
test('subject copies preserve hidden/initial placement and rooms remain inside the map',()=>{
  let raw=fixture(),out=paste(raw,copy(raw,[homeTarget('subjects')]),{section:0,index:0});
  let home=diagram(out.raw).panels[0];assert.deepEqual(home.initial['visitor-copy'],{x:52,y:58});assert.deepEqual(home.subjects[2],{id:'visitor-copy',x:32,y:38});
  out=paste(raw,copy(raw,[homeTarget('subjects',1)]),{section:0,index:0});assert.equal(diagram(out.raw).panels[0].initial['hidden-copy'],null);
  out=paste(raw,copy(raw,[homeTarget('rooms')]),{section:0,index:0});const room=diagram(out.raw).panels[0].rooms[1];
  assert.equal(room.kind,'outdoor');assert.equal(room.x,228);assert.equal(room.y,112);assert.equal(room.w,80);
});
test('whole-panel paste keeps internal layout and initial signals, makes an independent panel, and does not duplicate step patches',()=>{
  const raw=fixture(),data=copy(raw,[{kind:'panel',section:0,index:0}]),out=paste(raw,data,{section:0});
  const d=diagram(out.raw);assert.equal(d.panels[1].id,'home-copy');assert.deepEqual(d.panels[1].initial,d.panels[0].initial);
  assert.deepEqual(d.panels[1].devices,d.panels[0].devices);assert.deepEqual(d.steps,diagram(raw).steps);assert.equal(d.primaryPanel,'home');
  d.panels[1].devices[0].label='Changed';assert.equal(d.panels[0].devices[0].label,'Camera');
  const again=paste(out.raw,data,{section:0});assert.equal(diagram(again.raw).panels[2].id,'home-copy-2');
});
test('cross-diagram node copies remap internal edges, group parents and conflicting protocol definitions without linking existing nodes',()=>{
  const raw=fixture();raw.page.protocols={https:{label:'First API',color:'#123456'}};
  const data=copy(raw,[{kind:'node',section:0,id:'a'},{kind:'node',section:0,id:'b'}]);
  raw.page.protocols.https={label:'Other API',color:'#654321'};
  const out=paste(raw,data,{section:1}),d=diagram(out.raw,1);
  assert.deepEqual(d.rows,[['a'],['a-copy','b-copy']]);assert.equal(d.edges.length,1);
  assert.deepEqual(d.edges[0],{from:'a-copy',to:'b-copy',kind:'https-copy'});
  assert.equal(d.nodes['a-copy'].group,'service-copy');assert.equal(d.groups['service-copy'].parent,'company-copy');
  assert.equal(out.raw.page.protocols['https-copy'].label,'First API');assert.equal(out.raw.page.protocols.https.label,'Other API');
});
test('complete sections preserve alternates, failed communications, panel patches and lane meaning across specs',()=>{
  const raw=fixture();raw.page.lanes={net:{label:'Network',color:'#123456'}};diagram(raw).steps[0].lane='net';
  const data=copy(raw,[{kind:'section',section:0}]),other=fixture();other.page.lanes={net:{label:'Different',color:'#654321'}};
  const out=paste(other,data,{section:1}),d=diagram(out.raw,2);
  assert.deepEqual(d.paths,diagram(raw).paths);assert.deepEqual(d.steps[1],diagram(raw).steps[1]);
  assert.equal(d.steps[0].lane,'net-copy');assert.equal(out.raw.page.lanes['net-copy'].label,'Network');assert.equal(out.target.section,2);
});
test('node subsets preserve stacks, floating placement and default protocol meaning in another document',()=>{
  const raw=fixture(),d=diagram(raw);d.rows=[['a',['b']]];d.floats=[{id:'c',side:'above',dx:14}];delete d.edges[0].kind;
  const data=copy(raw,['a','b','c'].map(id=>({kind:'node',section:0,id})));
  const destination=fixture();destination.page.protocols={int:{label:'Different call',color:'#123456'}};
  const out=paste(destination,data,{section:1}),result=diagram(out.raw,1);
  assert.deepEqual(result.rows,[['a'],['a-copy',['b-copy']]]);assert.deepEqual(result.floats,[{id:'c-copy',side:'above',dx:14}]);
  assert.equal(result.edges[0].kind,'int-copy');assert.equal(out.raw.page.protocols['int-copy'].label,'service call');
});
test('invalid clipboard objects and destinations fail without changing source; Home limits remain enforced',()=>{
  const raw=fixture(),before=JSON.stringify(raw),data=copy(raw,[homeTarget('devices')]);
  for(const bad of ['', '{}','{"format":"flowview-clipboard","version":2}', '💡'.repeat(600000)])assert.ok(C.builderClipboardParse(bad).error);
  assert.match(C.planPasteBuilderClipboard(before,raw,data,{section:1}).error,/Home panel/);
  const bad=plain(data);bad.value.item.kind='unsupported';assert.match(C.planPasteBuilderClipboard(before,raw,bad,{section:0,index:0}).error,/device/);
  assert.equal(JSON.stringify(raw),before);
  const home=diagram(raw).panels[0];home.devices=Array.from({length:12},(_,i)=>({id:'device'+i,kind:'sensor',x:10,y:10}));
  assert.match(C.planPasteBuilderClipboard(JSON.stringify(raw),raw,data,{section:0,index:0}).error,/limit/);
});
test('pasting into a bare diagram preserves it inside a page and carries custom protocols',()=>{
  const source=fixture();source.page.protocols={https:{label:'Company API',color:'#123456'}};
  const data=copy(source,['a','b'].map(id=>({kind:'node',section:0,id}))),bare={nodes:{existing:{title:'Kept'}},rows:[['existing']],custom:{keep:true}};
  const out=paste(bare,data,{section:0});assert.equal(diagram(out.raw).nodes.existing.title,'Kept');assert.deepEqual(diagram(out.raw).custom,{keep:true});
  assert.equal(out.raw.page.protocols['https-copy'].label,'Company API');assert.equal(diagram(out.raw).edges[0].kind,'https-copy');
  assert.equal(bare.page,undefined);
});

function harness(clipboard){
  const events={},elements={};let selectedText=false,active=true;
  const document={activeElement:null,defaultView:{navigator:{clipboard},getSelection:()=>({isCollapsed:!selectedText})},
    addEventListener(type,fn){(events[type] ||= []).push(fn);},getElementById(id){return elements[id];},
    createElement:()=>element('temporary'),execCommand:()=>false,body:{appendChild(){}}};
  function element(id){const listeners={};return {id,isConnected:true,value:'',textContent:'',open:false,style:{},
    addEventListener(type,fn){(listeners[type] ||= []).push(fn);},closest:()=>null,
    focus(){document.activeElement=this;},select(){this.selected=true;},remove(){this.isConnected=false;},
    showModal(){this.open=true;},close(){this.open=false;},fire(type,extra={}){return fire(listeners,type,this,extra);}};}
  function fire(map,type,target,extra){const ev={target,preventDefault(){this.prevented=true;},stopPropagation(){},...extra};for(const fn of map[type] || [])fn(ev);return ev;}
  for(const id of ['object-clipboard','object-clipboard-text','object-clipboard-feedback','object-clipboard-status','object-clipboard-destination','object-copy','object-duplicate','object-paste','object-clipboard-cancel','object-clipboard-apply','object-clipboard-read'])elements[id]=element(id);
  let raw=fixture(),text=JSON.stringify(raw),targets=[homeTarget('devices')],dest={section:1,index:0},blocked=false;const undo=[];
  const c=context(),ctl=c.initBuilderClipboard(document,{isActive:()=>active,text:()=>text,selection:()=>targets,destination:()=>({...dest}),destinationLabel:()=> 'Destination Home',blocked:()=>blocked,
    apply(plan){undo.push(text);text=plan.text;return true;}});
  return {elements,document,ctl,undo,set active(v){active=v;},event:(type,extra={})=>fire(events,type,elements['object-copy'],extra),get text(){return text;},set text(v){text=v;},set targets(v){targets=v;},set blocked(v){blocked=v;},selectedText(v){selectedText=v;}};
}
test('native object copy/paste works without Clipboard API and makes exactly one undoable edit',()=>{
  const h=harness();let clipboard='';
  const copied=h.event('copy',{clipboardData:{setData(type,text){clipboard=text;}}});assert.equal(copied.prevented,true);
  const pasted=h.event('paste',{clipboardData:{getData:()=>clipboard}});assert.equal(pasted.prevented,true);assert.equal(h.undo.length,1);
  assert.equal(diagram(JSON.parse(h.text),1).panels[0].devices[1].id,'cam-copy-3');
  h.text=h.undo.pop();assert.equal(diagram(JSON.parse(h.text),1).panels[0].devices.length,1);
});
test('typing, selected prose and unrelated paste remain native; duplicate shortcut respects editing modes',()=>{
  const h=harness(),field={closest:()=>true};let writes=0;
  assert.equal(h.event('copy',{target:field,clipboardData:{setData(){writes++;}}}).prevented,undefined);
  h.selectedText(true);h.event('copy',{clipboardData:{setData(){writes++;}}});assert.equal(writes,0);h.selectedText(false);
  assert.equal(h.event('paste',{clipboardData:{getData:()=> 'ordinary text'}}).prevented,undefined);
  assert.equal(h.event('keydown',{target:field,ctrlKey:true,key:'d'}).prevented,undefined);
  h.blocked=true;h.event('keydown',{ctrlKey:true,key:'d'});assert.equal(h.undo.length,0);
  h.blocked=false;h.event('keydown',{metaKey:true,key:'d'});assert.equal(h.undo.length,1);
});
test('mobile buttons retain a manual clipboard fallback and refuse a destination changed while Paste is open',()=>{
  const h=harness();h.elements['object-copy'].fire('click');
  assert.equal(h.elements['object-clipboard'].open,true);assert.equal(h.elements['object-clipboard-text'].selected,true);
  assert.equal(JSON.parse(h.elements['object-clipboard-text'].value).format,'flowview-clipboard');
  h.text=JSON.stringify(fixture(),null,2);h.elements['object-clipboard-apply'].fire('click');assert.equal(h.undo.length,0);
  assert.match(h.elements['object-clipboard-status'].textContent,/destination changed/);
  h.elements['object-clipboard-cancel'].fire('click');h.elements['object-paste'].fire('click');h.elements['object-clipboard-apply'].fire('click');
  assert.equal(h.undo.length,1);assert.equal(h.elements['object-clipboard'].open,false);
});
test('late system clipboard responses cannot replace newly typed or closed-dialog content',async()=>{
  let finish;const h=harness({readText:()=>new Promise(resolve=>{finish=resolve;})});
  h.elements['object-paste'].fire('click');h.elements['object-clipboard-read'].fire('click');
  h.elements['object-clipboard-text'].value='my pasted text';h.elements['object-clipboard-text'].fire('input');finish('old system value');
  await Promise.resolve();await Promise.resolve();assert.equal(h.elements['object-clipboard-text'].value,'my pasted text');
  h.elements['object-clipboard-read'].fire('click');h.elements['object-clipboard-cancel'].fire('click');finish('late');
  await Promise.resolve();await Promise.resolve();assert.equal(h.elements['object-clipboard-text'].value,'my pasted text');
});

test('welcome screen leaves clipboard and duplicate keys native while the editor is hidden',()=>{
  const h=harness();let clipboard='';
  h.event('copy',{clipboardData:{setData(type,text){clipboard=text;}}});
  h.active=false;
  for(const [type,extra] of [
    ['copy',{clipboardData:{setData(){throw Error('hidden editor copied');}}}],
    ['paste',{clipboardData:{getData:()=>clipboard}}],
    ['keydown',{metaKey:true,key:'d'}]
  ]) assert.equal(h.event(type,extra).prevented,undefined);
  assert.equal(h.undo.length,0);
  h.active=true;h.event('paste',{clipboardData:{getData:()=>clipboard}});
  assert.equal(h.undo.length,1);
});

test('a copy failure after leaving the project does not open an obsolete fallback dialog',async()=>{
  let reject;const h=harness({writeText:()=>new Promise((resolve,no)=>{reject=no;})});
  h.ctl.copy();h.ctl.cancelPending();h.active=false;
  reject(new Error('Clipboard denied'));await Promise.resolve();await Promise.resolve();
  assert.equal(h.elements['object-clipboard'].open,false);
});
