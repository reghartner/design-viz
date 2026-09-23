'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={console,URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
const card=(title,span=12)=>({title,span,fields:[{k:'event',v:title,g:'Description'}]});
const doc=sec=>({page:{blocks:[{heading:'Other'},{tabs:[{label:'Wire',sections:[sec]}]}]}});
const section=raw=>raw.page.blocks[1].tabs[0].sections[0];

test('contracts render legacy plus ordered blocks, independent addresses and validated widths',()=>{
 const sec={contract:card('Existing',6),contracts:[null,{...card('Request',6),id:'request'},card('Response',4)]};
 const records=plain(C.sectionContracts(sec));
 assert.deepEqual(records.map(r=>[r.key,r.reference,r.path]),[['legacy','legacy',['contract']],['1','request',['contracts',1]],['2','3',['contracts',2]]]);
 const html=C.contractBlocksHTML(sec,'wire');
 assert.equal((html.match(/class="ctcard"/g)||[]).length,3);
 for(const id of ['contract-wire','contract-wire-block-request','contract-wire-block-3'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('data-dv-contract="1"'));assert.ok(html.includes('--contract-span:6'));
 assert.equal(C.contractColumnSpan('6'),12);assert.equal(C.contractColumnSpan('6;position:fixed'),12);
 const hostile=C.contractBlocksHTML({contracts:[{...card('<script>bad()</script>'),id:'" onclick="oops'}]},'x');
 assert.ok(!hostile.includes('onclick='));assert.ok(hostile.includes('&lt;script&gt;'));
});

test('malformed contract lists, duplicate IDs and invalid widths warn without crashing',()=>{
 for(const contracts of [{},[null,[],{...card('Bad'),span:5,id:'legacy'},{...card('One'),id:'same'},{...card('Two'),id:'same'}]]){
  const result=C.validate(C.normalize(doc({contracts})));
  assert.equal(result.errors.length,0);assert.ok(result.warnings.some(w=>w.includes('contracts')));
 }
 const good=C.validate(C.normalize(doc({contracts:[{...card('Request',6),id:'request'},card('Reply',6)]})));
 assert.equal(good.errors.length,0);assert.equal(good.warnings.length,0);
});

test('contract links address a specific block and local row while preserving old links',()=>{
 const manifest={tabBlocks:[],sections:[{number:1,reference:'wire',hasCard:true,rowCount:1,cards:[{reference:'legacy',rowCount:1},{reference:'reply',rowCount:2}]}]};
 const hash=C.buildHash({c:'wire',ct:'reply',r:'2'});assert.equal(hash,'#c=wire&ct=reply&r=2');
 const target=C.resolveHashTarget(C.parseHash(hash),manifest);assert.equal(target.card.cardIndex,1);assert.equal(target.card.row,1);
 const old=C.resolveHashTarget(C.parseHash('#c=wire&r=1'),manifest);assert.equal(old.card.row,0);assert.equal(old.card.cardIndex,undefined);
 assert.equal(C.resolveHashTarget(C.parseHash('#c=wire&ct=gone'),manifest).kind,'invalid');
 assert.equal(C.resolveHashTarget(C.parseHash('#c=wire&ct=reply&r=99'),manifest).kind,'card');
});

test('editing and deleting rows in separate blocks use distinct raw paths, including a tab wrapper',()=>{
 const raw=doc({contract:card('Legacy'),contracts:[card('One'),card('Two')]}),text=JSON.stringify(raw,null,2);
 const t={section:1,kind:'crow',card:'1',index:0},path=C.builderTargetPath(raw,t);
 assert.deepEqual(plain(path),['page','blocks',1,'tabs',0,'sections',0,'contracts',1,'fields',0]);
 const edited=C.planSetField(text,raw,path,'v','"updated"'),next=JSON.parse(edited.text);
 assert.equal(section(next).contracts[1].fields[0].v,'updated');assert.equal(section(next).contracts[0].fields[0].v,'One');assert.equal(section(next).contract.fields[0].v,'Legacy');
 const deleted=C.planBulkDelete(text,[{...t,card:'0'},{...t,card:'1'}]);
 assert.deepEqual(section(JSON.parse(deleted.text)).contracts.map(c=>c.fields),[[],[]]);
 assert.equal(section(JSON.parse(deleted.text)).contract.fields.length,1);assert.equal(JSON.stringify(raw,null,2),text);
});

test('add, duplicate, reorder, add field and remove block preserve other sections and explicit source values',()=>{
 let raw=doc({contract:card('Legacy'),text:'Keep this prose'}),text=JSON.stringify(raw,null,2).replace('"heading": "Other"','"heading"  :  "Other"');
 function apply(plan){assert.ok(!plan.error,plan.error);text=plan.text;raw=JSON.parse(text);assert.ok(text.includes('"heading"  :  "Other"'));return plan;}
 const added=apply(C.planAddContract(text,raw,1));assert.equal(added.card,'0');assert.equal(section(raw).contract.title,'Legacy');
 const duplicate=apply(C.planAddContract(text,raw,1,section(raw).contracts[0]));assert.equal(duplicate.card,'1');assert.notEqual(section(raw).contracts[0].id,section(raw).contracts[1].id);
 const moved=apply(C.planMoveContract(text,raw,{section:1,kind:'contract',card:'1'},-1));assert.equal(moved.card,'1'); // legacy is still first, array now includes all three
 assert.equal(section(raw).contracts[1].title,'New contract (copy)');assert.equal(section(raw).contracts[2].title,'New contract');
 apply(C.planAddContractField(text,raw,{section:1,kind:'contract',card:'1'}));assert.equal(section(raw).contracts[1].fields.length,2);assert.equal(section(raw).contracts[2].fields.length,1);
 apply(C.builderDeletePlan(text,raw,{section:1,kind:'contract',card:'1'}));assert.equal(section(raw).contracts.length,2);assert.equal(section(raw).text,'Keep this prose');
});

test('invalid contract list edits are refused instead of discarding malformed authored content',()=>{
 const raw=doc({contract:card('Legacy'),contracts:[null,card('One')]});
 assert.ok(C.planMoveContract(JSON.stringify(raw),raw,{section:1,kind:'contract',card:'1'},-1).error);
 const wrong=doc({contracts:{title:'Not an array'}});assert.ok(C.planAddContract(JSON.stringify(wrong),wrong,1).error);
 assert.ok(C.planAddContract('{}',{},0).error);
});

test('outline and compatibility include contract blocks in tabbed sections',()=>{
 const raw=doc({contracts:[{...card('Request',6),id:'request'},card('Reply',6)]});
 const entries=C.builderOutline(raw,'contract');assert.equal(entries.length,2);assert.equal(entries[1].target.card,'1');
 assert.ok(C.FlowviewCompatibility.detect(raw).includes('content.contracts'));
 assert.ok(C.FlowviewCompatibility.detect(doc({contract:card('Legacy',6)})).includes('content.contracts'));
});
