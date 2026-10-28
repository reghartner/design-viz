'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const B=require('./workbench-command-context.cjs')(['graph','layout']);
for(const name of ['workbench/lifetime.js','workbench/spatial-selection.js'])vm.runInContext(readSource(name),B);
function fixture(){return {page:{title:'Keep exact outside',sections:[{diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['b']],floats:[{id:'a',x:100,y:80}],panels:[{id:'p',type:'state',states:['idle'],initial:{state:'idle'}}],layouts:[{id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:[{panel:'p',x:0,y:0,w:4,h:4}]},exploreLayout:{panelPlacement:'canvas',canvas:{panels:[{panel:'p',x:300,y:200,w:240,h:900}]}}}]}}]}};}
const targets=[{kind:'node',section:0,id:'a'},{kind:'panel',section:0,index:0,id:'p'}];
const rects=[{x:40,y:50,w:120,h:60},{x:300,y:200,w:240,h:80}];
test('mixed alignment anchors first center, canonicalizes fitted panel size, and preserves outside bytes',()=>{
 const raw=fixture(),text=JSON.stringify(raw,null,2).replace('"title": "Keep exact outside"','"title" :  "Keep exact outside"');
 for(const direction of ['horizontal','vertical']){const plan=B.planAlignSpatial(text,raw,targets,'explore',direction,rects);assert.ok(!plan.error,plan.error);assert.ok(plan.text.includes('"title" :  "Keep exact outside"'));const d=JSON.parse(plan.text).page.sections[0].diagram,p=d.layouts[0].exploreLayout.canvas.panels[0];assert.equal(direction==='horizontal'?p.y+p.h/2:p.x+p.w/2,direction==='horizontal'?80:100);assert.equal(p.w,240);assert.equal(p.h,80);assert.deepEqual(d.floats,[{id:'a',x:100,y:80}]);}
 assert.equal(raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0].h,900);
 assert.match(B.planAlignSpatial(text,raw,[{kind:'node',section:0,id:'b'},targets[1]],'explore','horizontal',rects).error,/Free placement/);
});
test('alignment preserves the other node axis and an aligned repeat is a source no-op',()=>{
 const raw=fixture(),nodeRects=[{x:40,y:50,w:120,h:60},{x:360,y:210,w:120,h:60}],nodeTargets=[targets[0],{kind:'node',section:0,id:'b'}];
 raw.page.sections[0].diagram.rows=[[]];raw.page.sections[0].diagram.floats.push({id:'b',x:420,y:240,dx:7,dy:9});
 const text=JSON.stringify(raw);
 for(const direction of ['horizontal','vertical']){
  const current=JSON.stringify(raw),plan=B.planAlignSpatial(current,raw,nodeTargets,'explore',direction,nodeRects,1);assert.ok(!plan.error,plan.error);const next=JSON.parse(plan.text),floats=next.page.sections[0].diagram.floats;
  assert.deepEqual(floats.find(f=>f.id==='b'),raw.page.sections[0].diagram.floats.find(f=>f.id==='b'));
  const moved=floats.find(f=>f.id==='a');assert.equal(moved[direction==='horizontal'?'x':'y'],raw.page.sections[0].diagram.floats[0][direction==='horizontal'?'x':'y']);
  const alignedRects=direction==='horizontal'?[{x:40,y:210,w:120,h:60},nodeRects[1]]:[{x:360,y:50,w:120,h:60},nodeRects[1]];
  const repeat=B.planAlignSpatial(plan.text,next,nodeTargets,'explore',direction,alignedRects,1);assert.equal(repeat.noop,true);assert.equal(repeat.error,undefined);assert.equal(repeat.text,undefined);
 }
 assert.equal(JSON.stringify(raw),text);
});
test('alignment pins both effective centers for an automatic float before clearing its offsets',()=>{
 for(const direction of ['horizontal','vertical']){
  const raw=fixture(),d=raw.page.sections[0].diagram;d.rows=[[]];d.floats[0]={id:'a',side:'above',dx:30,dy:20,custom:'keep'};d.floats.push({id:'b',x:420,y:240});
  const text=JSON.stringify(raw),nodeTargets=[targets[0],{kind:'node',section:0,id:'b'}],nodeRects=[{x:70,y:110,w:120,h:60},{x:360,y:210,w:120,h:60}];
  const plan=B.planAlignSpatial(text,raw,nodeTargets,'explore',direction,nodeRects,1);assert.ok(!plan.error,plan.error);const next=JSON.parse(plan.text),moved=next.page.sections[0].diagram.floats[0];
  assert.deepEqual(moved,direction==='horizontal'?{id:'a',side:'above',custom:'keep',x:130,y:240}:{id:'a',side:'above',custom:'keep',x:420,y:140});
  const alignedRects=direction==='horizontal'?[{x:70,y:210,w:120,h:60},nodeRects[1]]:[{x:360,y:110,w:120,h:60},nodeRects[1]];
  const repeat=B.planAlignSpatial(plan.text,next,nodeTargets,'explore',direction,alignedRects,1);assert.equal(repeat.noop,true);assert.equal(repeat.text,undefined);
 }
});
test('alignment pins an automatic clicked anchor only when another object changes',()=>{
 for(const direction of ['horizontal','vertical']){
  const raw=fixture(),d=raw.page.sections[0].diagram;d.nodes.r={};d.nodes.c={};d.rows=[['r']];d.floats=[{id:'a',side:'below',noSpread:true},{id:'b',side:'below',noSpread:true},{id:'c',side:'below',noSpread:true}];
  const text=JSON.stringify(raw),nodeTargets=[{kind:'node',section:0,id:'a'},{kind:'node',section:0,id:'b'}];
  const nodeRects=direction==='horizontal'?[{x:1265,y:39,w:150,h:50},{x:1265,y:123,w:150,h:50}]:[{x:1125,y:39,w:150,h:50},{x:1265,y:123,w:150,h:50}];
  const plan=B.planAlignSpatial(text,raw,nodeTargets,'explore',direction,nodeRects,1);assert.ok(!plan.error,plan.error);const next=JSON.parse(plan.text),floats=next.page.sections[0].diagram.floats;
  assert.deepEqual(floats,direction==='horizontal'?[{id:'a',side:'below',noSpread:true,x:1340,y:148},{id:'b',side:'below',noSpread:true,x:1340,y:148},{id:'c',side:'below',noSpread:true,x:1340,y:247}]:[{id:'a',side:'below',noSpread:true,x:1340,y:64},{id:'b',side:'below',noSpread:true,x:1340,y:148},{id:'c',side:'below',noSpread:true}]);
  const laid=B.layout(next.page.sections[0].diagram);assert.equal(laid.pos.b.cx,1340);assert.equal(laid.pos.b.cy,148);assert.equal(laid.pos.a[direction==='horizontal'?'cy':'cx'],direction==='horizontal'?148:1340);
  assert.equal(laid.pos.c.cx,1340);assert.equal(laid.pos.c.cy,247);
  const repeat=B.planAlignSpatial(plan.text,next,nodeTargets,'explore',direction,nodeRects.map((r,i)=>i?{...r}:{...r,[direction==='horizontal'?'y':'x']:direction==='horizontal'?126:1265}),1);assert.equal(repeat.noop,true);assert.equal(repeat.text,undefined);
 }
 const raw=fixture(),d=raw.page.sections[0].diagram;d.rows=[[]];d.floats=[{id:'a',x:100,y:80},{id:'b',side:'below',noSpread:true}];const text=JSON.stringify(raw);
 const noop=B.planAlignSpatial(text,raw,[{kind:'node',section:0,id:'a'},{kind:'node',section:0,id:'b'}],'explore','vertical',[{x:40,y:50,w:120,h:60},{x:40,y:180,w:120,h:60}],1);
 assert.equal(noop.noop,true);assert.deepEqual(raw.page.sections[0].diagram.floats[1],{id:'b',side:'below',noSpread:true});
});
test('mixed alignment accepts a nonfirst visual anchor without rewriting its authored placement',()=>{
 const raw=fixture(),text=JSON.stringify(raw),authored=raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0];
 for(const direction of ['horizontal','vertical']){
  const plan=B.planAlignSpatial(text,raw,targets,'explore',direction,rects,1);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
  assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],authored);
  assert.deepEqual(d.floats[0],direction==='horizontal'?{id:'a',x:100,y:240}:{id:'a',x:420,y:80});
 }
 assert.match(B.planAlignSpatial(text,raw,targets,'explore','horizontal',rects,2).error,/selected object/);
});
test('mixed duplicate remaps IDs and placements and mixed delete resolves panel ID atomically',()=>{
 const raw=fixture(),text=JSON.stringify(raw),plan=B.planDuplicateSpatial(text,raw,targets,'explore',rects);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
 assert.ok(d.nodes.a1);assert.equal(d.panels[1].id,'p1');assert.deepEqual(d.floats[1],{id:'a1',x:132,y:112});assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[1],{panel:'p1',x:324,y:224,w:240,h:80});assert.equal(d.layouts[0].sectionLayout.default[1].panel,'p1');assert.equal(d.layouts[0].exploreLayout.panelPlacements[0].placement,'canvas');
 const del=B.planBulkDelete(plan.text,[targets[0],{kind:'panel',section:0,index:99,id:'p'}]);assert.ok(!del.error,del.error);const next=JSON.parse(del.text).page.sections[0].diagram;assert.equal(next.nodes.a,undefined);assert.deepEqual(next.panels.map(p=>p.id),['p1']);assert.equal(next.layouts[0].exploreLayout.canvas.panels.length,1);
 assert.match(B.planBulkDelete(text,[targets[0],{kind:'panel',section:0,id:'missing'}]).error,/no longer exists/);assert.ok(raw.page.sections[0].diagram.nodes.a);
});
function distribution(){const raw=fixture(),d=raw.page.sections[0].diagram;d.rows=[[]];d.floats.push({id:'b',x:240,y:280});return {raw,targets:[...targets,{kind:'node',section:0,id:'b'}],rects:[{x:0,y:0,w:100,h:40},{x:600,y:600,w:240,h:80},{x:170,y:170,w:140,h:220}]};}
test('distribution orders unequal mixed bounds and preserves outer bounds, sizes, axes, IDs and outside source',()=>{
 for(const direction of ['horizontal','vertical']){const {raw,targets,rects}=distribution(),text=JSON.stringify(raw,null,2).replace('"title": "Keep exact outside"','"title" :  "Keep exact outside"'),before=JSON.stringify(raw),plan=B.planDistributeSpatial(text,raw,targets,'explore',direction,rects);assert.ok(!plan.error,plan.error);assert.ok(plan.text.includes('"title" :  "Keep exact outside"'));assert.equal(JSON.stringify(raw),before);const d=JSON.parse(plan.text).page.sections[0].diagram;assert.deepEqual(d.floats[0],raw.page.sections[0].diagram.floats[0]);assert.deepEqual(d.layouts,raw.page.sections[0].diagram.layouts);const b=d.floats[1];if(direction==='horizontal'){assert.equal(b.x,350);assert.equal(b.y,280);}else{assert.equal(b.y,320);assert.equal(b.x,240);}assert.deepEqual(Object.keys(d.nodes),['a','b']);}
});
test('distribution rejects insufficient counts, row placement, impossible gaps and no-ops',()=>{
 const {raw,targets,rects}=distribution(),text=JSON.stringify(raw);
 assert.match(B.planDistributeSpatial(text,raw,targets.slice(0,2),'explore','horizontal',rects.slice(0,2)).error,/at least three/);
 assert.match(B.planDistributeSpatial(text,raw,targets,'explore','horizontal',rects.map((r,i)=>({...r,x:i*10}))).error,/overlap|insufficient/);
 const even=rects.map(r=>({...r}));even[2].x=280;assert.match(B.planDistributeSpatial(text,raw,targets,'explore','horizontal',even).error,/already/);
 raw.page.sections[0].diagram.floats.pop();assert.match(B.planDistributeSpatial(JSON.stringify(raw),raw,targets,'explore','horizontal',rects).error,/Free placement/);
});
test('nudge applies one graph delta to mixed objects, keeps panel dimensions and unrelated axes, and rejects invalid movements',()=>{
 const {raw,targets,rects}=distribution(),text=JSON.stringify(raw),plan=B.planNudgeSpatial(text,raw,targets,'explore',rects,10,0);assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
 assert.equal(d.floats[0].x,60);assert.equal(d.floats[0].y,80);assert.equal(d.floats[1].x,250);assert.equal(d.floats[1].y,280);assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],{panel:'p',x:610,y:200,w:240,h:900});
 assert.match(B.planNudgeSpatial(text,raw,targets,'explore',rects,Infinity,0).error,/finite/);assert.match(B.planNudgeSpatial(text,raw,targets,'explore',rects,0,0).error,/already/);
});

function expansion(){
 const raw=fixture(),d=raw.page.sections[0].diagram;d.nodes.b={title:'B'};d.nodes.c={title:'C'};d.rows=[[]];d.floats=[{id:'a',x:100,y:100},{id:'b',x:100,y:300},{id:'c',x:500,y:300}];
 d.layouts[0].exploreLayout.canvas.panels[0]={panel:'p',x:180,y:60,w:200,h:80};
 const byId={a:{target:{kind:'node',section:0,id:'a'},rect:{x:50,y:70,w:100,h:60}},b:{target:{kind:'node',section:0,id:'b'},rect:{x:25,y:260,w:150,h:80}},c:{target:{kind:'node',section:0,id:'c'},rect:{x:440,y:250,w:120,h:100}},p:{target:{kind:'panel',section:0,id:'p',index:0},rect:{x:180,y:60,w:200,h:80}}};
 const ids=['c','a','p','b'];return {raw,targets:ids.map(id=>byId[id].target),rects:ids.map(id=>byId[id].rect),byId};
}
test('spacing expansion uses measured center lanes, mixed sizes and stable ordering on both axes',()=>{
 for(const direction of ['column','row']){
  const {raw,targets,rects,byId}=expansion(),text=JSON.stringify(raw,null,2).replace('"title": "Keep exact outside"','"title" :  "Keep exact outside"'),before=JSON.stringify(raw);
  const plan=B.planExpandSpatial(text,raw,targets,'explore',direction,rects);assert.ok(!plan.error,plan.error);assert.ok(plan.text.includes('"title" :  "Keep exact outside"'));assert.equal(JSON.stringify(raw),before);
  const d=JSON.parse(plan.text).page.sections[0].diagram,p=d.layouts[0].exploreLayout.canvas.panels[0],floats=Object.fromEntries(d.floats.map(f=>[f.id,f]));
  if(direction==='column'){
   assert.deepEqual(floats,{a:{id:'a',x:100,y:100},b:{id:'b',x:100,y:300},c:{id:'c',x:600,y:300}});assert.deepEqual(p,{panel:'p',x:230,y:60,w:200,h:80});
  }else{
   assert.deepEqual(floats,{a:{id:'a',x:100,y:100},b:{id:'b',x:100,y:350},c:{id:'c',x:500,y:350}});assert.deepEqual(p,{panel:'p',x:180,y:60,w:200,h:80});
  }
  const reversedTargets=targets.toReversed(),reversedRects=rects.toReversed(),reversed=B.planExpandSpatial(text,raw,reversedTargets,'explore',direction,reversedRects);assert.ok(!reversed.error,reversed.error);assert.deepEqual(JSON.parse(reversed.text),JSON.parse(plan.text));
  const next=JSON.parse(plan.text),repeatRects=rects.map((r,i)=>({...r,[direction==='column'?'x':'y']:r[direction==='column'?'x':'y']+(direction==='column'?(targets[i].id==='p'?50:targets[i].id==='c'?100:0):(targets[i].id==='b'||targets[i].id==='c'?50:0))}));
  const repeat=B.planExpandSpatial(plan.text,next,targets,'explore',direction,repeatRects);assert.ok(!repeat.error,repeat.error);const repeated=JSON.parse(repeat.text).page.sections[0].diagram;
  assert.equal(direction==='column'?repeated.floats.find(f=>f.id==='c').x:repeated.floats.find(f=>f.id==='c').y,direction==='column'?700:400);
 }
});
test('spacing expansion excludes locks from lane ordering and gives actionable refusals',()=>{
 const {raw,targets,rects}=expansion(),d=raw.page.sections[0].diagram,text=()=>JSON.stringify(raw);d.nodes.c.locked=true;
 const plan=B.planExpandSpatial(text(),raw,targets,'explore','column',rects);assert.ok(!plan.error,plan.error);const next=JSON.parse(plan.text).page.sections[0].diagram;
 assert.equal(next.floats.find(f=>f.id==='c').x,500);assert.equal(next.layouts[0].exploreLayout.canvas.panels[0].x,230,'the locked far-right lane must not increase movable lane indexes');
 d.nodes.a.locked=true;d.nodes.b.locked=true;assert.match(B.planExpandSpatial(text(),raw,targets.filter(t=>t.kind==='node'), 'explore','column',rects.filter((_,i)=>targets[i].kind==='node')).error,/at least two unlocked/);
 const same=expansion();same.rects=same.rects.map(r=>({...r,x:100-r.w/2}));assert.match(B.planExpandSpatial(JSON.stringify(same.raw),same.raw,same.targets,'explore','column',same.rects).error,/two distinct column positions/);
 const row=expansion();row.raw.page.sections[0].diagram.rows=[['a']];row.raw.page.sections[0].diagram.floats=row.raw.page.sections[0].diagram.floats.filter(f=>f.id!=='a');assert.match(B.planExpandSpatial(JSON.stringify(row.raw),row.raw,row.targets,'explore','row',row.rects).error,/Free placement/);
 const invalid=expansion();assert.match(B.planExpandSpatial(JSON.stringify(invalid.raw),invalid.raw,invalid.targets,'explore','diagonal',invalid.rects).error,/column or row/);assert.match(B.planExpandSpatial(JSON.stringify(invalid.raw),invalid.raw,invalid.targets,'explore','column',invalid.rects.slice(1)).error,/Render all selected/);
 const limit=B.planExpandSpatial(JSON.stringify(invalid.raw),invalid.raw,[invalid.byId.a.target,invalid.byId.c.target],'explore','column',[invalid.byId.a.rect,{x:99940,y:250,w:100,h:100}]);assert.match(limit.error,/outside the supported/);assert.equal(limit.text,undefined);assert.equal(JSON.stringify(invalid.raw),JSON.stringify(expansion().raw));
 assert.match(B.planExpandSpatial(JSON.stringify(invalid.raw),invalid.raw,[{kind:'step-controls',section:0}], 'explore','column',[{x:0,y:0,w:10,h:10}]).error,/nodes and canvas panels/);
});
test('spacing expansion pins automatic selected axes and preserves unselected automatic positions',()=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;d.nodes.r={};d.nodes.b={};d.nodes.c={};d.nodes.z={};d.rows=[['r']];d.floats=[{id:'a',side:'below',noSpread:true,custom:'keep'},{id:'b',side:'below',noSpread:true},{id:'c',side:'below',noSpread:true},{id:'z',x:1450,y:160,custom:'explicit'}];
 const originalLayout=B.layout(d).pos,before=originalLayout.c,explicitBefore=originalLayout.z,text=JSON.stringify(raw),targets=[{kind:'node',section:0,id:'b'},{kind:'node',section:0,id:'a'}],rects=[{x:1265,y:123,w:150,h:50},{x:1125,y:39,w:150,h:50}];
 const plan=B.planExpandSpatial(text,raw,targets,'explore','column',rects);assert.ok(!plan.error,plan.error);assert.equal(JSON.stringify(raw),text);const next=JSON.parse(plan.text),floats=next.page.sections[0].diagram.floats,laid=B.layout(next.page.sections[0].diagram);
 assert.deepEqual(floats.find(f=>f.id==='a'),{id:'a',side:'below',noSpread:true,custom:'keep',x:1200,y:64});assert.deepEqual(floats.find(f=>f.id==='b'),{id:'b',side:'below',noSpread:true,x:1390,y:148});
 assert.equal(laid.pos.c.cx,before.cx);assert.equal(laid.pos.c.cy,before.cy);assert.equal(laid.pos.a.cy,64);assert.equal(laid.pos.b.cy,148);
 assert.deepEqual(floats.find(f=>f.id==='z'),{id:'z',x:1450,y:160,custom:'explicit'});assert.equal(laid.pos.z.cx,explicitBefore.cx);assert.equal(laid.pos.z.cy,explicitBefore.cy);
});

test('point insertions preserve unrelated geometry and place canvas panels only in the captured view',()=>{
 const raw=fixture(),text=JSON.stringify(raw,null,2),point={x:-120.5,y:890.25};
 for(const plan of [B.planAddNode(text,raw,0,null,point),B.planAddTextBox(text,raw,0,point)]){
  assert.ok(!plan.error,plan.error);const d=JSON.parse(plan.text).page.sections[0].diagram;
  assert.deepEqual(d.floats.slice(0,-1),raw.page.sections[0].diagram.floats);assert.deepEqual(d.rows,raw.page.sections[0].diagram.rows);assert.deepEqual(d.layouts,raw.page.sections[0].diagram.layouts);
  assert.equal(d.floats.at(-1).x,point.x);assert.equal(d.floats.at(-1).y,point.y);assert.equal(d.floats.at(-1).noSpread,true);
 }
 const destination={point,explore:true,chapter:'explore'},plan=B.planAddPanel(text,raw,0,'state',destination);assert.ok(!plan.error,plan.error);
 const d=JSON.parse(plan.text).page.sections[0].diagram,p=d.panels.at(-1),ex=d.layouts[0].exploreLayout;assert.deepEqual(JSON.parse(plan.text.slice(plan.start,plan.end)),p);
 assert.deepEqual(d.floats,raw.page.sections[0].diagram.floats);assert.deepEqual(ex.canvas.panels[0],raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0]);assert.deepEqual(ex.canvas.panels.at(-1),{panel:p.id,x:point.x,y:point.y,w:320,h:240});assert.deepEqual(ex.panelPlacements.at(-1),{panel:p.id,placement:'canvas'});
 const standard=B.planAddPanel(text,raw,0,'state',{point,explore:false});assert.deepEqual(JSON.parse(standard.text).page.sections[0].diagram.layouts,raw.page.sections[0].diagram.layouts);
 assert.match(B.planAddPanel(text,raw,0,'state',{...destination,chapter:'missing'}).error,/view changed/);assert.match(B.planAddTextBox(text,raw,0,{x:NaN,y:2}).error,/coordinates/);assert.equal(JSON.stringify(raw,null,2),text);
});

function spatialElement(tag='div'){
 const attrs={},listeners={},el={tagName:tag.toUpperCase(),className:'',children:[],parentNode:null,style:{},isConnected:true,
  addEventListener(type,fn){(listeners[type] ||= []).push(fn);},removeEventListener(type,fn){listeners[type]=(listeners[type] || []).filter(item=>item!==fn);},
  appendChild(child){child.parentNode=this;this.children.push(child);return child;},
  setAttribute(name,value){attrs[name]=String(value);},getAttribute(name){return Object.hasOwn(attrs,name)?attrs[name]:null;},hasAttribute(name){return Object.hasOwn(attrs,name);},removeAttribute(name){delete attrs[name];},
  matches(selector){return selector.split(',').some(part=>{part=part.trim();const tagName=part.match(/^[a-z]+/i),classes=[...part.matchAll(/\.([\w-]+)/g)].map(match=>match[1]),properties=[...part.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];return (!tagName || this.tagName===tagName[0].toUpperCase()) && classes.every(name=>this.className.split(/\s+/).includes(name)) && properties.every(match=>match[2]==null?this.hasAttribute(match[1]):this.getAttribute(match[1])===match[2]);});},
  closest(selector){for(let current=this;current;current=current.parentNode)if(current.matches(selector))return current;return null;},
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);},querySelector(selector){return this.querySelectorAll(selector)[0] || null;},
  getBoundingClientRect(){return {left:0,top:0,right:120,bottom:60,width:120,height:60};},getClientRects(){return [{}];},remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}};
 el.classList={contains(name){return el.className.split(/\s+/).includes(name);},add(name){if(!this.contains(name))el.className+=(el.className?' ':'')+name;},remove(name){el.className=el.className.split(/\s+/).filter(item=>item!==name).join(' ');}};
 return el;
}

test('selection refresh and batch candidates scan once per section and discard traversal state between operations',()=>{
 const sections=Array.from({length:4},(_,section)=>{const nodes={};for(let index=0;index<50;index++)nodes['s'+section+'n'+index]={title:'Section '+section+' node '+index,...(index===1?{locked:true}:{})};return {diagram:{nodes,rows:[Object.keys(nodes).slice(1)],floats:[{id:'s'+section+'n0',x:100,y:80}]}};}),raw={page:{sections}},resolved=JSON.parse(JSON.stringify(raw));
 resolved.page.sections.forEach((section,index)=>{section.diagram.nodes['provider::s'+index]={title:'Imported '+index};});
 let currentRaw=raw,currentText=JSON.stringify(raw),currentResolved=resolved,snapshots=0,resolutions=0,selected=[];
 const doc=spatialElement('document'),view=spatialElement(),win=spatialElement('window');doc.getElementById=()=>null;doc.createElement=spatialElement;
 const all=[],shells=[];
 sections.forEach((section,sectionIndex)=>{const host=view.appendChild(spatialElement());host.className='doc-sec'+(sectionIndex===0?' workspace-active-section':'');host.setAttribute('data-dv-section',sectionIndex);const shell=host.appendChild(spatialElement());shell.className='section-viewport';shells.push(shell);
  for(const id of [...Object.keys(section.diagram.nodes),'provider::s'+sectionIndex]){const node=shell.appendChild(spatialElement('g'));node.className='node';node.setAttribute('data-dv-node',id);all.push(node);}
 });
 const refreshSelector='.section-viewport .boardcanvas g.node[data-dv-node],.viewport-explore .explore-canvas-objects [data-explore-panel],.viewport-explore .explore-canvas-objects .explore-player',candidateSelector='.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel],.explore-canvas-objects .explore-player';
 view.querySelectorAll=selector=>selector===refreshSelector?all:[];view.querySelector=selector=>selector==='.doc-sec.workspace-active-section'?view.children[0]:null;
 shells.forEach(shell=>{shell.querySelectorAll=selector=>selector===candidateSelector?shell.children:selector==='.boardcanvas [data-dv-node]'?shell.children:[];shell.querySelector=selector=>selector==='.boardcanvas [data-dv-node]'?shell.children[0]:null;});
 const session={insertSection:0,snapshot(){snapshots++;return {raw:currentRaw,text:currentText,renderedText:currentText};},resolve(){resolutions++;return currentResolved;},text(){return currentText;}};
 const originalLocate=B.jsonLocate;let scans=0;B.jsonLocate=function(){scans++;return originalLocate.apply(this,arguments);};
 const spatial=B.createBuilderSpatialSelection({document:doc,window:win,view,src:spatialElement('textarea'),session,targetFromEvent:()=>null,selection:()=>selected,select(value){selected=value;},toggle(){},find(){},apply(){},busy:()=>false,inspect(){}});
 try{
  all[0].setAttribute('role','img');all[0].setAttribute('title','Original title');spatial.refresh();
  assert.equal(scans,4,'refresh source scans must scale with section count');assert.equal(snapshots,1);assert.equal(resolutions,1);assert.ok(all.every(node=>node.getAttribute('tabindex')==='0'));
  assert.match(all[1].getAttribute('aria-description'),/Position locked/);assert.match(all[2].getAttribute('aria-description'),/Row nodes/);assert.match(all[50].getAttribute('aria-description'),/imported node/);

  scans=0;snapshots=0;resolutions=0;assert.equal(spatial.selectAllNodes(),true);assert.equal(scans,1,'candidate traversal must scan the active section once');assert.equal(snapshots,1);assert.equal(resolutions,1);assert.equal(selected.length,51);assert.equal(selected.at(-1).imported,true);

  const nextRaw=JSON.parse(JSON.stringify(raw));delete nextRaw.page.sections[0].diagram.nodes.s0n49;currentRaw=nextRaw;currentText=JSON.stringify(nextRaw);currentResolved=JSON.parse(currentText);scans=0;snapshots=0;resolutions=0;assert.equal(spatial.selectAllNodes(),true);assert.equal(scans,1);assert.equal(snapshots,1);assert.equal(resolutions,1);assert.equal(selected.length,49,'a later operation must not reuse prior source or provider resolution');
  assert.equal(spatial.target(shells[0].children.at(-1)),null);currentResolved=resolved;assert.equal(spatial.target(shells[0].children.at(-1)).imported,true);assert.equal(snapshots,3,'standalone targets must take a fresh snapshot for every user action');assert.equal(resolutions,3);
 }finally{spatial.destroy();B.jsonLocate=originalLocate;}
 assert.equal(all[0].getAttribute('role'),'img');assert.equal(all[0].getAttribute('title'),'Original title');assert.equal(all[0].getAttribute('tabindex'),null);
});

/* #474 canvas panel position locks live on the view's canvas rectangle and
   share the node-lock interaction semantics for mixed selections. */
function lockedPanel(){const raw=fixture(),d=raw.page.sections[0].diagram;d.rows=[[]];d.floats.push({id:'b',x:240,y:280});d.layouts[0].exploreLayout.canvas.panels[0].locked=true;return {raw,targets:[...targets,{kind:'node',section:0,id:'b'}],rects:[{x:40,y:50,w:120,h:60},{x:300,y:200,w:240,h:80},{x:170,y:170,w:140,h:220}]};}
test('a locked canvas panel stays fixed while mixed nudge, align, distribute and spacing move the unlocked members',()=>{
 const {raw,targets,rects}=lockedPanel(),text=JSON.stringify(raw),panel=()=>raw.page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0];
 const nudged=B.planNudgeSpatial(text,raw,targets,'explore',rects,10,0);assert.ok(!nudged.error,nudged.error);let d=JSON.parse(nudged.text).page.sections[0].diagram;
 assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],panel());assert.equal(d.floats[0].x,110);assert.equal(d.floats[1].x,250);
 const aligned=B.planAlignSpatial(text,raw,targets,'explore','horizontal',rects,1);assert.ok(!aligned.error,aligned.error);d=JSON.parse(aligned.text).page.sections[0].diagram;
 assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],panel());assert.equal(d.floats[0].y,240);assert.equal(d.floats[1].y,240);
 const distributed=B.planDistributeSpatial(text,raw,targets,'explore','vertical',[{x:40,y:0,w:120,h:60},{x:300,y:400,w:240,h:80},{x:170,y:100,w:140,h:100}]);assert.ok(!distributed.error,distributed.error);d=JSON.parse(distributed.text).page.sections[0].diagram;
 assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],panel());assert.equal(d.floats[1].y,230,'b is re-centered on its rendered bounds with a 120 gap after a');
 const expanded=B.planExpandSpatial(text,raw,targets,'explore','column',rects);assert.ok(!expanded.error,expanded.error);d=JSON.parse(expanded.text).page.sections[0].diagram;
 assert.deepEqual(d.layouts[0].exploreLayout.canvas.panels[0],panel());assert.equal(d.floats[0].x,100);assert.equal(d.floats[1].x,290,'the locked far-right panel is not a movable lane');
 const panelOnly=[targets[1]],panelRect=[rects[1]];
 const noop=plan=>{assert.equal(plan.error,undefined);assert.equal(plan.noop,true);assert.equal(plan.text,undefined);};
 noop(B.planNudgeSpatial(text,raw,panelOnly,'explore',panelRect,10,0));
 raw.page.sections[0].diagram.nodes.a.locked=true;raw.page.sections[0].diagram.nodes.b.locked=true;const all=JSON.stringify(raw);
 noop(B.planNudgeSpatial(all,raw,targets,'explore',rects,10,0));noop(B.planAlignSpatial(all,raw,targets,'explore','vertical',rects));noop(B.planDistributeSpatial(all,raw,targets,'explore','horizontal',rects));
 assert.match(B.planExpandSpatial(all,raw,targets,'explore','column',rects).error,/at least two unlocked/);
});
test('locking a mixed selection is one plan that pins nodes and materializes the canvas rectangle it protects',()=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;d.layouts[0].exploreLayout.canvas.panels=[];const text=JSON.stringify(raw,null,2).replace('"title": "Keep exact outside"','"title" :  "Keep exact outside"');
 const plan=B.planSetSpatialLocked(text,raw,targets,'explore',rects,true);assert.ok(!plan.error,plan.error);assert.ok(plan.text.includes('"title" :  "Keep exact outside"'));
 const next=JSON.parse(plan.text).page.sections[0].diagram;assert.equal(next.nodes.a.locked,true);assert.deepEqual(next.floats,[{id:'a',x:100,y:80}]);
 assert.deepEqual(next.layouts[0].exploreLayout.canvas.panels,[{panel:'p',x:300,y:200,w:240,h:80,locked:true}]);
 const repeat=B.planSetSpatialLocked(plan.text,JSON.parse(plan.text),targets,'explore',rects,true);assert.equal(repeat.noop,true);assert.equal(repeat.text,undefined);
 const unlock=B.planSetSpatialLocked(plan.text,JSON.parse(plan.text),targets,'explore',rects,false);assert.ok(!unlock.error,unlock.error);const after=JSON.parse(unlock.text).page.sections[0].diagram;
 assert.equal(after.nodes.a.locked,undefined);assert.deepEqual(after.layouts[0].exploreLayout.canvas.panels,[{panel:'p',x:300,y:200,w:240,h:80}]);
 const panelOnly=B.planSetSpatialLocked(text,raw,[targets[1]],'explore',[rects[1]],true);assert.ok(!panelOnly.error,panelOnly.error);assert.equal(JSON.parse(panelOnly.text).page.sections[0].diagram.nodes.a.locked,undefined);
 assert.match(B.planSetSpatialLocked(text,raw,[targets[1]],'explore',[null],true).error,/Render/);
 assert.match(B.planSetSpatialLocked(text,raw,[targets[1]],'missing',[rects[1]],true).error,/Explore view/);
 assert.match(B.planSetSpatialLocked(text,raw,[{kind:'step-controls',section:0}],'explore',[rects[1]],true).error,/nodes and canvas panels/);
 assert.match(B.planSetSpatialLocked(text,raw,targets,'explore',rects,'yes').error,/locked or unlocked/);
 assert.equal(JSON.stringify(raw),JSON.stringify(fixture()).replace('"canvas":{"panels":[{"panel":"p","x":300,"y":200,"w":240,"h":900}]}','"canvas":{"panels":[]}'));
});
test('duplicating a locked canvas panel copies it unlocked and renaming keeps the lock',()=>{
 const {raw}=lockedPanel(),text=JSON.stringify(raw);
 const dup=B.planDuplicateSpatial(text,raw,[targets[1]],'explore',[{x:300,y:200,w:240,h:80}]);assert.ok(!dup.error,dup.error);const d=JSON.parse(dup.text).page.sections[0].diagram;
 assert.equal(d.layouts[0].exploreLayout.canvas.panels[0].locked,true);assert.equal(d.layouts[0].exploreLayout.canvas.panels[1].locked,undefined);
 const renamed=B.planRenamePanel(text,raw,0,0,'status');assert.ok(!renamed.error,renamed.error);assert.deepEqual(JSON.parse(renamed.text).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0],{panel:'status',x:300,y:200,w:240,h:900,locked:true});
});
