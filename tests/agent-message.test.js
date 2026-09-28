'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const c={};vm.createContext(c);
for(const file of ['workbench/targets.js','workbench/agent-message.js'])vm.runInContext(readSource(file),c);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){return {page:{title:'Recording',blocks:[{heading:'Introduction',text:'Overview'},
  {tabs:[{title:'Services',sections:[{heading:'Delivery',diagram:{nodes:{camera:{title:'Camera',codeRefs:[{id:'capture',path:'capture.js',revision:'a'.repeat(40)}],binding:{entityRef:'component:default/camera'}},store:{title:'Store'}},rows:[['camera','store']],
    steps:[{id:'failure',text:'Failed',codeRefs:[{id:'retry',path:'retry.js'}]}]}}]}]},
  {heading:'Other flow',diagram:{nodes:{camera:{title:'Other camera'}},rows:[['camera']]}}
]}};}
test('context addresses selected nodes and step refs in raw tabs without confusing repeated IDs',()=>{
  const raw=fixture(),before=JSON.stringify(raw),context=c.workbenchAgentContext(raw,[{section:1,kind:'node',id:'camera'},{section:1,kind:'step',index:0}]);
  assert.equal(context.nodes.length,3);assert.equal(context.references.length,3);
  assert.deepEqual(plain(context.nodes.filter(n=>n.selected).map(n=>n.path)),[['page','blocks',1,'tabs',0,'sections',0,'diagram','nodes','camera']]);
  assert.equal(context.references.filter(r=>r.selected).length,3);
  assert.equal(context.references[1].value.revision,'a'.repeat(40));
  assert.equal(JSON.stringify(raw),before);
});
test('unchecked references are absent from selected node excerpts and full source is opt-in',()=>{
  const raw=fixture(),context=c.workbenchAgentContext(raw,[]),nodes=new Set([context.nodes[0].key]),references=new Set([context.references[2].key]);
  const options={message:'Explain the retry.',nodes,references,extra:'  docs/design.md\n\nhttps://example.test/recording  '};
  const output=c.workbenchAgentMessage(context,options);
  assert.match(output,/retry\.js/);assert.doesNotMatch(output,/capture\.js|component:default\/camera|Other camera/);
  assert.match(output,/docs\/design\.md/);assert.match(output,/https:\/\/example.test\/recording/);
  assert.doesNotMatch(output,/Complete diagram source/);
  const source=JSON.stringify(raw,null,4)+'\n';
  assert.ok(c.workbenchAgentMessage(context,{...options,source}).endsWith(source));
  assert.equal(c.workbenchAgentMessage(context,{...options,message:'  '}),'');
});
test('bare diagrams retain root node addresses and arbitrary text is serialized as data',()=>{
  const context=c.workbenchAgentContext({nodes:{'a.b':{title:'<script>alert(1)</script>'}},rows:[['a.b']]},[{section:0,kind:'node',id:'a.b'}]);
  assert.deepEqual(plain(context.nodes[0].path),['nodes','a.b']);
  assert.equal(context.nodes[0].selected,true);
  const output=c.workbenchAgentMessage(context,{message:'Compare it.',nodes:new Set([context.nodes[0].key]),references:new Set(),extra:''});
  assert.match(output,/"a.b"/);assert.match(output,/"title": "<script>alert\(1\)<\/script>"/);
});
