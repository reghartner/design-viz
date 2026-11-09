'use strict';
/* #1216 (Chuck's spoken ruling, option B): lane routing is no longer offered. A spec that has
   diagram.routing "lanes" still draws lanes; the validator reports a NOTE for it, in `notes`,
   never in warnings or errors, so nothing that gates on warnings rejects it.
   Step lanes (page.lanes, step.lane) are a different feature and get no note. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};vm.runInNewContext(entrypoint('standalone').body,C);
const NOTE='sections[0].diagram.routing: "lanes" is no longer recommended; omit routing to draw curves';
const diagram=extra=>({nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a'],['b']],edges:[{from:'a',to:'b'}],...extra});
const check=page=>JSON.parse(JSON.stringify(C.validate(C.normalize({page}))));
test('#1216 routing "lanes" gets one note, not a warning; no routing, curves and step lanes get no note',()=>{
 const lanes=check({sections:[{id:'s',diagram:diagram({routing:'lanes'})}]});
 assert.deepEqual(lanes,{errors:[],warnings:[],notes:[NOTE]});
 for(const page of [{sections:[{id:'s',diagram:diagram({})}]},{sections:[{id:'s',diagram:diagram({routing:'curves'})}]},
  {lanes:{NET:{color:'#38E1FF',label:'NET'}},sections:[{id:'s',diagram:diagram({steps:[{id:'one',nodes:['a'],lane:'NET'}]})}]}]){
  assert.deepEqual(check(page),{errors:[],warnings:[]},JSON.stringify(page));
 }
});
