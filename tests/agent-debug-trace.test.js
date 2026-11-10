'use strict';
// #1276: the agent-connection trace is off unless localStorage has dv-agent-debug=1, and never throws.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function context(storage){
  const lines=[],C={console:{info:(...args)=>lines.push(args.map(String).join(' '))},Date};
  if(storage!==undefined)C.localStorage=storage;
  vm.createContext(C);vm.runInContext(readSource('workbench/session.js'),C);return {C,lines};
}
test('#1276 flowviewAgentDebug is silent by default and logs only with dv-agent-debug=1',()=>{
  const off=context({getItem:()=>null});assert.equal(off.C.flowviewAgentDebug('step: start'),false);assert.equal(off.lines.length,0);
  const missing=context(undefined);assert.equal(missing.C.flowviewAgentDebug('step: start'),false,'no localStorage (node, workers) is off');
  const blocked=context({getItem:()=>{throw Error('denied');}});assert.equal(blocked.C.flowviewAgentDebug('step: start'),false,'blocked storage is off');
  const on=context({getItem:key=>key==='dv-agent-debug'?'1':null});
  assert.equal(on.C.flowviewAgentDebug('client start: end',{generation:3}),true);
  assert.equal(on.lines.length,1);assert.match(on.lines[0],/^\[flowview-agent \d\d:\d\d:\d\d\.\d{3}\] client start: end/);
});
