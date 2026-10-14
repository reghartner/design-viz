'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={TextEncoder};vm.createContext(C);
for(const name of ['validator.js','workbench/io-model.js'])vm.runInContext(readSource(name),C);

const SPEC=JSON.stringify({page:{title:'Imported story',sections:[{heading:'One',diagram:{nodes:{a:{title:'A'}},rows:[['a']],edges:[],steps:[]}}]}});
const MERMAID='sequenceDiagram\nparticipant A as App\nparticipant B as API\nA->>B: POST /orders\nNote over A: enrich this';

test('file preparation classifies supported content and produces useful summaries',()=>{
  const json=C.prepareFlowviewFileImport({name:'story.mmd',size:SPEC.length},SPEC);
  assert.equal(json.kind,'flowview');assert.equal(json.text,SPEC);assert.equal(json.summary.title,'Imported story');assert.equal(json.summary.sections,1);
  const sequence=C.prepareFlowviewFileImport({name:'sequence.json',size:MERMAID.length},MERMAID);
  assert.equal(sequence.kind,'mermaid');assert.equal(sequence.summary.participants,2);assert.equal(sequence.summary.messages,1);assert.equal(sequence.summary.todos,1);
  assert.equal(JSON.parse(sequence.text).page.sections[0].diagram.edges[0].kind,'https');
  const markdown=C.prepareFlowviewFileImport({name:'readme.md'},'# Design\n\n```mermaid\n'+MERMAID+'\n```\n');
  assert.equal(markdown.type,'Markdown Mermaid sequence');assert.equal(markdown.summary.messages,1);
});

test('file preparation rejects invalid, unsupported, binary and oversized sources',()=>{
  assert.throws(()=>C.prepareFlowviewFileImport({name:'bad.json'},'{'),/Invalid Flowview JSON/);
  assert.throws(()=>C.prepareFlowviewFileImport({name:'bad.mmd'},'graph TD\nA---B'),/Invalid Mermaid diagram.*directed/);
  assert.throws(()=>C.prepareFlowviewFileImport({name:'notes.txt'},'ordinary notes'),/Unsupported file/);
  assert.throws(()=>C.prepareFlowviewFileImport({name:'image.json'},'{}\0png'),/Binary files/);
  assert.throws(()=>C.prepareFlowviewFileImport({name:'large.json',size:C.FLOWVIEW_IMPORT_MAX_BYTES+1},SPEC),/4 MiB/);
  assert.throws(()=>C.prepareFlowviewFileImport({name:'invalid.json'},'{"page":{"sections":[]}}'),/required/);
});
