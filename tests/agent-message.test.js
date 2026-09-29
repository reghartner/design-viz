'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c={};vm.createContext(c);
for(const file of ['workbench/targets.js','workbench/agent-message.js'])vm.runInContext(readSource(file),c);
function fixture(){return {page:{title:'Recording',blocks:[{heading:'Introduction',text:'Overview'},
  {tabs:[{title:'Services',sections:[{heading:'Delivery',diagram:{nodes:{camera:{title:'Camera',codeRefs:[{id:'capture',path:'capture.js',revision:'a'.repeat(40)}],binding:{entityRef:'component:default/camera'}},store:{title:'Store'}},rows:[['camera','store']],
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
  assert.match(message,/capture\.js/);assert.match(message,/retry\.js/);assert.match(message,/component:default\/camera/);
  assert.match(message,/engineering/);assert.match(message,/failed/);
  assert.equal(JSON.stringify(current),before,'copying cannot change the captured selection or source');
});
test('copy includes exact complete source and accepts ordinary URLs in the shared draft',()=>{
  const current=snapshot(),request='Compare this with docs/design.md and https://example.test/recording';
  const message=c.workbenchAgentMessage(current,{message:request});
  assert.ok(message.includes(request));assert.ok(message.endsWith(current.source));
  assert.equal(c.workbenchAgentMessage(current,{message:'  '}),'');
});
test('bare diagram paths and script-looking labels are serialized as data',()=>{
  const current=snapshot([{section:0,kind:'node',id:'a.b',label:'<script>alert(1)</script>'}],{source:JSON.stringify({nodes:{'a.b':{title:'<script>alert(1)</script>'}},rows:[['a.b']]})});
  const message=c.workbenchAgentMessage(current,{message:'Compare it.'});
  assert.match(message,/"nodes",\s*"a.b"/);assert.match(message,/"label":\s*"<script>alert\(1\)<\/script>"/);
});
test('unrendered source retains stale-preview context and invalid or closed projects cannot be copied',()=>{
  const current=snapshot([{section:1,kind:'node',id:'camera'}],{previewCurrent:false}),message=c.workbenchAgentMessage(current,{message:'Use my newest JSON.'});
  assert.ok(message.endsWith(current.source));assert.match(message,/"selection":\s*\[\]/);assert.match(message,/"views":\s*\[\]/);
  assert.throws(()=>c.workbenchAgentMessage(snapshot([],{source:'{'}),{message:'Review'}),/JSON|repair|fix/i);
  assert.throws(()=>c.workbenchAgentMessage(snapshot([],{parseError:'Broken JSON'}),{message:'Review'}),/JSON|repair|fix/i);
  assert.throws(()=>c.workbenchAgentMessage(snapshot([],{open:false}),{message:'Review'}),/open|project|diagram/i);
  for(const source of ['null','false','7','"text"','[]'])assert.throws(()=>c.workbenchAgentMessage(snapshot([],{source}),{message:'Review'}),/JSON|object|diagram|repair|fix/i);
});
