const {readSource}=require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);for(const file of ['validator','engine'])vm.runInContext(readSource(file+'.js'),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
const flow={x:0,y:12,w:8,h:12},home={panel:'home',x:0,y:0,w:8,h:12},steps={controls:'steps',x:0,y:24,w:8,h:6};
test('hiding the flow reclaims its rows while keeping panels, controls, and source geometry',()=>{
 const items=[home,flow,steps],before=JSON.stringify(items);
 assert.deepEqual(plain(ctx.sectionLayoutWithoutFlow(items,0)),[home,{...steps,y:12}]);assert.equal(JSON.stringify(items),before);
});
test('rows shared with supporting panels stay sized and intentional gaps are preserved',()=>{
 const side={panel:'phone',x:8,y:12,w:4,h:6},last={panel:'screen',x:0,y:30,w:8,h:6};
 assert.deepEqual(plain(ctx.sectionLayoutWithoutFlow([home,flow,side,last],0)),[home,side,{...last,y:24}]);
});
test('legacy combined tiles shrink to the live controls instead of hiding the timeline',()=>{
 assert.deepEqual(plain(ctx.sectionLayoutWithoutFlow([home,flow,{...steps,y:26}],6)),[home,{...flow,h:6},{...steps,y:20}]);
 assert.equal(ctx.sectionLayoutWithoutFlow([{...flow,h:3}],6)[0].h,3);
});
