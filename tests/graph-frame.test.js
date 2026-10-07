'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource,moduleSource}=require('../tools/source-loader.cjs');
const C={TextEncoder};vm.runInNewContext(readSource('validator.js')+'\n'+readSource('compatibility.js')+'\n'+readSource('confluence.js'),C);
const plain=x=>JSON.parse(JSON.stringify(x));
const diagram=()=>({nodes:{a:{title:'A'},b:{title:'B',group:'inside'}},groups:{inside:{title:'A group'}},rows:[[]],floats:[{id:'a',side:'below',x:100,y:100},{id:'b',side:'below',x:350,y:100}],edges:[{from:'a',to:'b',curveControls:[{t:0,dx:-40,dy:-140},{t:1,dx:40,dy:-140}]}],steps:[]});
const raw=d=>({page:{title:'Framing',sections:[{diagram:d}]}});
test('unmarked and malformed graph frames preserve legacy layout safely without mutation',()=>{
 const d=diagram(),before=JSON.stringify(d),legacy=plain(C.layout(d));assert.equal(legacy.vb.w,1180);assert.equal(JSON.stringify(d),before);
 for(const graphFrame of [null,[],true,42,'content',{x:0,y:0,w:0,h:40},{x:Infinity,y:0,w:100,h:50},{x:0,y:0,w:100001,h:50}]){
  const bad={...d,graphFrame};assert.deepEqual(plain(C.layout(bad)),legacy);assert.ok(C.validate(raw(bad).page).warnings.some(w=>w.includes('.graphFrame:')));
 }
});
test('saved frame round-trips and pure geometry expands for cards groups and explicit curves',()=>{
 const d=diagram();d.graphFrame={x:20,y:50,w:420,h:100};const before=JSON.stringify(d),L=C.layout(d);
 assert.equal(JSON.stringify(C.normalize(raw(d)).sections[0].diagram),before);assert.ok(L.vb.w<1180);
 for(const p of Object.values(L.pos)){assert.ok(p.cx-p.w/2>=L.vb.x);assert.ok(p.cx+p.w/2<=L.vb.x+L.vb.w);}
 for(const b of Object.values(L.groups)){assert.ok(b.x>=L.vb.x);assert.ok(b.y>=L.vb.y);assert.ok(b.y+b.h<=L.vb.y+L.vb.h);}
 C.expandPlacedEdgeBounds(d.edges,L,[]);assert.ok(L.vb.y<0);assert.equal(JSON.stringify(d),before);
 const backend={module:{exports:{}},URL,TextEncoder};vm.runInNewContext(moduleSource('backend','cjs'),backend);const B=backend.module.exports;
 assert.deepEqual(plain(B.viewerRouting().layout(d)),plain(C.layout(d)));assert.equal(B.validateSpec(raw(d)).errors.length,0);assert.ok(B.exportAnonymousLayout(raw(d)).diagrams.length===1);
 const exported=C.buildConfluenceExport(JSON.stringify(raw(d)));assert.equal(exported.error,undefined);assert.deepEqual(JSON.parse(exported.text),raw(d));
});
test('saved framing advertises a capability and older hosts report it',()=>{
 const d=diagram();d.graphFrame={x:0,y:0,w:500,h:300};const compatibility=C.FlowviewCompatibility,stamped=compatibility.stamp(raw(d));
 assert.ok(stamped.page.flowview.features.includes('layout.graph-frame'));const older={...compatibility.features};delete older['layout.graph-frame'];
 assert.ok(compatibility.check(stamped,{version:compatibility.version,contract:'1',features:older}).missingFeatures.includes('layout.graph-frame'));
 assert.ok(!compatibility.detect(raw(diagram())).includes('layout.graph-frame'));
});
