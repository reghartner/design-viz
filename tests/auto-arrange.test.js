'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource,entrypoint}=require('../tools/source-loader.cjs');
const B=require('./workbench-command-context.cjs')(['layout','auto-arrange']);
B.structuredClone=structuredClone;
vm.runInContext(readSource('vendor/dagre/dagre.min.js'),B);
const clone=x=>JSON.parse(JSON.stringify(x));
function arrange(d){const text=JSON.stringify(d,null,2),plan=B.planAutoArrangeNodes(text,d,0);assert.equal(plan.error,undefined);return JSON.parse(plan.text);}
function noOverlap(d){const boxes=Object.values(B.layout(d).pos);for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(Math.abs(a.cx-b.cx)>=(a.w+b.w)/2 || Math.abs(a.cy-b.cy)>=(a.h+b.h)/2);}}
const crossed={nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'},d:{title:'D'}},rows:[['a','b'],['c','d']],edges:[{from:'a',to:'d'},{from:'b',to:'c'}]};
function crossings(d){const pos=B.layout(d).pos;function side(a,b,c){return (b.cx-a.cx)*(c.cy-a.cy)-(b.cy-a.cy)*(c.cx-a.cx);}let n=0;d.edges.forEach((e,i)=>d.edges.slice(i+1).forEach(f=>{const a=pos[e.from],b=pos[e.to],c=pos[f.from],d=pos[f.to];if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0)n++;}));return n;}
test('deterministic positions reduce deliberately crossed edges and ignore old placement',()=>{
 const next=arrange(crossed);assert.equal(crossings(crossed),1);assert.equal(crossings(next),0);noOverlap(next);
 assert.deepEqual(arrange(next),next);
 const moved=clone(crossed);moved.rows=[[]];moved.floats=Object.keys(moved.nodes).map(id=>({id,x:500,y:500,dx:32,dy:99}));
 assert.deepEqual(arrange(moved),next);assert.deepEqual(next.rows,[[]]);assert.equal(next.routing,'curves');
});
test('one diagram rewrite preserves wrapper bytes, story, groups, identity and styles while clearing geometry',()=>{
 const d=clone(crossed);d.nodes.a.group='g';d.groups={g:{label:'Group'}};
 Object.assign(d.edges[0],{kind:'int',label:'A label',ret:true,curvePoints:[{t:.5,dx:30,dy:50}],bend:5,fromPort:{side:'top'},toPort:{side:'right'},fromDx:4,toDy:6,labelDx:40,labelDy:20,labelAt:.8});
 d.steps=[{id:'s1',edge:'a->d',text:'Keep me'}];d.paths=[{id:'main',steps:['s1']}];d.layouts=[{id:'one',name:'View',steps:['s1']}];d.homemap={nodes:['a','d']};d.panels=[{id:'p',type:'queue'}];
 const raw={page:{title:'Untouched',blocks:[{heading:'Arrange',diagram:d},{heading:'Other',diagram:clone(crossed)}]}};
 const text=JSON.stringify(raw,null,3)+'\n',plan=B.planAutoArrangeNodes(text,raw,0);assert.equal(plan.error,undefined);
 const next=JSON.parse(plan.text);assert.deepEqual(next.page.blocks[1],raw.page.blocks[1]);
 const range=B.jsonLocate(text,['page','blocks',0,'diagram']);const nextRange=B.jsonLocate(plan.text,['page','blocks',0,'diagram']);
 assert.equal(plan.text.slice(0,nextRange.start),text.slice(0,range.start));assert.equal(plan.text.slice(nextRange.end),text.slice(range.end));
 const arranged=next.page.blocks[0].diagram;
 for(const key of ['nodes','groups','steps','paths','layouts','homemap','panels'])assert.deepEqual(arranged[key],d[key]);
 assert.deepEqual(arranged.edges[0],{from:'a',to:'d',kind:'int',label:'A label',ret:true});assert.deepEqual(arranged.edges[1],d.edges[1]);noOverlap(arranged);
});
test('nested groups are disjoint with correct title padding; cycles, loops, parallel and disconnected nodes survive',()=>{
 const d={nodes:{a:{group:'inner'},b:{group:'inner'},c:{group:'outer'},d:{group:'other'},e:{},f:{}},groups:{inner:{parent:'outer'},outer:{},other:{}},rows:[['a','b','c','d','e','f']],edges:[{from:'a',to:'b'},{from:'b',to:'a'},{from:'b',to:'a'},{from:'c',to:'c'},{from:'b',to:'d'},{from:'d',to:'e'}]};
 const next=arrange(d);noOverlap(next);assert.deepEqual(next.edges,d.edges);assert.deepEqual(next.groups,d.groups);assert.deepEqual(arrange(next),next);
 const L=B.layout(next),inner=L.groups.inner,outer=L.groups.outer,other=L.groups.other;
 assert.ok(inner.y>=outer.y+34);assert.ok(inner.x>=outer.x+14);
 assert.ok(outer.x+outer.w<=other.x || other.x+other.w<=outer.x || outer.y+outer.h<=other.y || other.y+other.h<=outer.y);
 for(const id of ['e','f']){const p=L.pos[id];assert.ok(p.cx+p.w/2<=outer.x || p.cx-p.w/2>=outer.x+outer.w || p.cy+p.h/2<=outer.y || p.cy-p.h/2>=outer.y+outer.h);}
});
test('refuses malformed, oversized and deeply nested graphs without publication',()=>{
 for(const d of [{nodes:{},rows:[[]]}, {nodes:{a:{}},rows:[['a']],edges:[{from:'a',to:'missing'}]}, {nodes:{a:{}},rows:null}, {nodes:Object.fromEntries(Array.from({length:151},(_,i)=>['n'+i,{}])),rows:[[]]}]){
  const before=JSON.stringify(d);assert.ok(B.planAutoArrangeNodes(before,d,0).error);assert.equal(JSON.stringify(d),before);
 }
 function nested(depth){const d={nodes:{a:{group:'g0'}},groups:{},rows:[['a']]};for(let i=0;i<depth;i++)d.groups['g'+i]=i<depth-1?{parent:'g'+(i+1)}:{};return d;}
 const allowed=nested(20),next=arrange(allowed);assert.deepEqual(next.groups,allowed.groups);assert.equal(next.floats.length,1);noOverlap(next);
 const excessive=nested(21),before=JSON.stringify(excessive);
 assert.match(B.planAutoArrangeNodes(before,excessive,0).error,/nesting/);assert.equal(JSON.stringify(excessive),before);
});
test('the dependency is editor-only, with no network or source-map sidecar',()=>{
 assert.ok(readSource('builder.workbench.js').includes('var dagre='));
 for(const name of ['standalone','backend','native'])assert.ok(!entrypoint(name).body.includes('var dagre='));
 assert.ok(!readSource('vendor/dagre/dagre.min.js').includes('sourceMappingURL'));
});
