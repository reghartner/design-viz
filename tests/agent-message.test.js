'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c={};vm.createContext(c);
for(const file of ['workbench/targets.js','workbench/agent-message.js'])vm.runInContext(readSource(file),c);
function fixture(){return {page:{title:'Recording',blocks:[{heading:'Introduction',text:'Overview'},
  {tabs:[{title:'Services',sections:[{heading:'Delivery',diagram:{nodes:{camera:{title:'Camera',link:'https://example.test/camera-design',codeRefs:[{id:'capture',path:'capture.js',revision:'a'.repeat(40)}],binding:{entityRef:'component:default/camera'}},store:{title:'Store'}},rows:[['camera','store']],
    edges:[{from:'camera',to:'store',label:'Upload'}],panels:[{id:'screen',type:'screen',title:'Camera clip'}],
    steps:[{id:'failure',text:'Failed',codeRefs:[{id:'retry',path:'retry.js'}]}]}}]}]},
  {heading:'Other flow',diagram:{nodes:{camera:{title:'Other camera'}},rows:[['camera']]}}
]}};}
function snapshot(selection=[],overrides={}){return {open:true,project:'story-1',source:JSON.stringify(fixture(),null,4)+'\n',previewCurrent:true,selection,
  views:[{section:1,view:'engineering',path:'failed',mode:'step',sourceStep:0}],technicalLevel:'engineering',...overrides};}
test('one captured selection supplies nodes, steps, panels and edges in their raw tab paths',()=>{
  const selection=[{section:1,kind:'node',id:'camera'},{section:1,kind:'step',index:0},{section:1,kind:'panel',index:0,id:'screen'},{section:1,kind:'edge',index:0}];
  const current=snapshot(selection),before=JSON.stringify(current),message=c.workbenchAgentMessage(current,{message:'Explain the selected flow.'});
  for(const kind of ['node','step','panel','edge'])assert.match(message,new RegExp('"kind":\\s*"'+kind+'"'));
  assert.match(message,/"tabs",\s*0,\s*"sections",\s*0/);
  assert.match(message,/"nodes",\s*"camera"/);assert.match(message,/"steps",\s*0/);assert.match(message,/"panels",\s*0/);assert.match(message,/"edges",\s*0/);
  assert.match(message,/example\.test\/camera-design/);assert.match(message,/capture\.js/);assert.match(message,/retry\.js/);assert.match(message,/component:default\/camera/);
  assert.match(message,/engineering/);assert.match(message,/failed/);
  assert.equal(JSON.stringify(current),before,'copying cannot change the captured selection or source');
});
test('copy includes the request and URLs without the complete source or unrelated objects',()=>{
  const current=snapshot(),request='Compare this with docs/design.md and https://example.test/recording';
  const message=c.workbenchAgentMessage(current,{message:request});
  assert.ok(message.includes(request));assert.ok(!message.includes(current.source));
  assert.doesNotMatch(message,/Other camera|capture\.js|retry\.js|Complete diagram source/);
  assert.match(message,/seeded candidate files, work in those copies/);assert.doesNotMatch(message,/Read the current spec and ledger/);
  assert.equal(c.workbenchAgentMessage(current,{message:'  '}),'');
});
test('bare diagram paths and script-looking labels are serialized as data',()=>{
  const current=snapshot([{section:0,kind:'node',id:'a.b',label:'<script>alert(1)</script>'}],{source:JSON.stringify({nodes:{'a.b':{title:'<script>alert(1)</script>'}},rows:[['a.b']]})});
  const message=c.workbenchAgentMessage(current,{message:'Compare it.'});
  assert.match(message,/"nodes",\s*"a.b"/);assert.match(message,/"label":\s*"<script>alert\(1\)<\/script>"/);
});
test('unrendered source omits stale-preview context and invalid or closed projects cannot be copied',()=>{
  const current=snapshot([{section:1,kind:'node',id:'camera'}],{previewCurrent:false}),message=c.workbenchAgentMessage(current,{message:'Use my newest JSON.'});
  assert.ok(!message.includes(current.source));assert.match(message,/"selection":\s*\[\]/);assert.match(message,/"views":\s*\[\]/);
  assert.throws(()=>c.workbenchAgentMessage(snapshot([],{source:'{'}),{message:'Review'}),/JSON|repair|fix/i);
  assert.throws(()=>c.workbenchAgentMessage(snapshot([],{parseError:'Broken JSON'}),{message:'Review'}),/JSON|repair|fix/i);
  assert.throws(()=>c.workbenchAgentMessage(snapshot([],{open:false}),{message:'Review'}),/open|project|diagram/i);
  for(const source of ['null','false','7','"text"','[]'])assert.throws(()=>c.workbenchAgentMessage(snapshot([],{source}),{message:'Review'}),/JSON|object|diagram|repair|fix/i);
});
test('selecting a whole document, tab, section, or large panel copies addresses without their contents',()=>{
  const raw=fixture();raw.page.blocks[2].text='UNRELATED DOCUMENT CONTENT '.repeat(5000);
  raw.page.blocks[1].tabs[0].sections[0].diagram.panels[0].image='data:image/png;base64,'+'EMBEDDED IMAGE '.repeat(5000);
  const current=snapshot([{kind:'document'}, {kind:'tab',block:1,tab:0}, {kind:'section',section:2},
    {kind:'panel',section:1,index:0,id:'screen'}],{source:JSON.stringify(raw)});
  const message=c.workbenchAgentMessage(current,{message:'Simplify these.'});
  assert.match(message,/"path":\s*\[\s*"page"\s*\]/);
  assert.match(message,/"kind":\s*"section"/);assert.match(message,/"panels",\s*0/);
  assert.doesNotMatch(message,/UNRELATED DOCUMENT CONTENT|EMBEDDED IMAGE|data:image|"value"/);
  assert.ok(message.length<3000,'copy size follows focus metadata, not document size');
});
test('context-only copy works with a selection and no message, but not with an empty or stale selection',()=>{
  const current=snapshot([{section:1,kind:'node',id:'camera'}]),before=JSON.stringify(current);
  const message=c.workbenchAgentMessage(current,{contextOnly:true});
  assert.match(message,/Selection context only/);assert.match(message,/capture\.js/);
  assert.ok(!message.includes(current.source));assert.equal(JSON.stringify(current),before);
  assert.equal(c.workbenchAgentMessage(snapshot(),{contextOnly:true}),'');
  assert.equal(c.workbenchAgentMessage({...current,previewCurrent:false},{contextOnly:true}),'');
  assert.equal(c.workbenchAgentMessage(current,{message:''}),'','the message composer still requires a request');
});
test('prepared edit requests compose new diagrams and preserve existing layout for paired preview',()=>{
  const message=c.workbenchAgentMessage(snapshot([{section:1,kind:'node',id:'camera'}]),{message:'Add a relay after the camera.'});
  assert.ok(message.includes('For a wholly new diagram'));
  assert.ok(message.includes('node tools/compose-page-layout.cjs'));
  assert.ok(message.includes('nodes, panels and step controls without a browser or dependency install'));
  assert.doesNotMatch(message,/manually author panel/);
  assert.ok(message.includes('Preserve unrelated existing placement, routes and panel rectangles unless this request asks for rearrangement.'));
  assert.ok(message.includes('unpositioned {id,side:"below",noSpread:true} float'));
  assert.ok(message.includes('submit it for Workbench preview'));
  assert.ok(message.includes('browserless agent checks are not visual QA'));
  assert.doesNotMatch(message,/tools\/arrange-spec|Chromium|Playwright/);
});
