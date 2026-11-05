'use strict';
/* Field-entry resolution for the in-place text editor (#960). Entries of one target
   kind are told apart by their own selectors; creation entries need none. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={};vm.createContext(C);vm.runInContext(readSource('workbench/inline-text.js'),C);
// A rendered element that matches only its own class selectors.
const element=(...classes)=>({matches:selector=>selector.split(',').some(part=>classes.some(name=>part.trim()==='.'+name))});
const nodeTarget=()=>({kind:'node',section:0,id:'api'});
const name={kind:'node',selector:'.t1',field:'title'},subtitle={kind:'node',selector:'.t2',field:'sub'};
const created={kind:'node',creation:true,field:'title'};

test('two entries of one kind resolve by their own selectors',()=>{
  for(const fields of [[name,subtitle],[subtitle,name]]){
    assert.equal(C.inlineTextField(fields,element('t1'),false,nodeTarget).entry,name);
    assert.equal(C.inlineTextField(fields,element('t2'),false,nodeTarget).entry,subtitle);
    assert.equal(C.inlineTextField(fields,element('t3'),false,nodeTarget),null);
  }
  assert.deepEqual(C.inlineTextField([name,subtitle],element('t2'),false,nodeTarget).target,nodeTarget());
});

test('a matching selector still needs the entry kind; creation entries open only at creation',()=>{
  const para={kind:'para',selector:'.t1'};
  assert.equal(C.inlineTextField([para,name],element('t1'),false,nodeTarget).entry,name);
  assert.equal(C.inlineTextField([created,name,subtitle],element('t2'),false,nodeTarget).entry,subtitle);
  assert.equal(C.inlineTextField([created],element('t2'),false,nodeTarget),null);
  assert.equal(C.inlineTextField([created,subtitle],element('t9'),true,nodeTarget).entry,created);
});

test('an entry resolver replaces the Workbench target for its own selector only',()=>{
  let generic=0;
  const step={kind:'step',selector:'.step-text',target:()=>({kind:'step',section:0,index:2})};
  const targetOf=()=>{generic++;return {kind:'step-controls',section:0};};
  const found=C.inlineTextField([name,step],element('step-text'),false,targetOf);
  assert.equal(found.entry,step);assert.deepEqual(found.target,{kind:'step',section:0,index:2});
  assert.equal(C.inlineTextField([step],element('other'),false,targetOf),null);
  assert.equal(generic,0);
});
