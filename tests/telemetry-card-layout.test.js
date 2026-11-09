'use strict';
// #1163 review c2: the Workbench card drag preview redraws a card's leader with the
// same gap at trace labels as the live paint, on a plain click (select) and on a drag.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={setTimeout,clearTimeout};vm.createContext(C);
for(const name of ['workbench/lifetime','viewer/telemetry-cards','workbench/telemetry-card-layout'])vm.runInContext(readSource(name+'.js'),C);
// The source resolution and SVG box measurement are covered elsewhere; here they are fixed.
C.telemetryCarrierTarget=()=>({});C.boardControlBox=el=>el.box;

function events(){const map={};return {addEventListener(type,fn){(map[type]=map[type] || []).push(fn);},removeEventListener(type,fn){map[type]=(map[type] || []).filter(f=>f!==fn);},fire(type,ev){(map[type] || []).slice().forEach(fn=>fn(ev));}};}
function board(){
 const identity={inverse:()=>identity};
 const label={box:{x:-20,y:20,w:40,h:15}},leader={setAttribute(k,v){this[k]=v;}};
 const svg={querySelector:sel=>sel==='.dv-metrics-leader[data-dv-edge="0"]'?leader:null,querySelectorAll:sel=>sel==='.dv-trace-overlay text'?[label]:[],
  getScreenCTM:()=>identity,createSVGPoint:()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}})};
 const attrs={'data-metrics-section':'0','data-dv-edge':'0','data-metrics-card':'a->b','data-metrics-anchor-x':'0','data-metrics-anchor-y':'0'};
 // An 80x40 card whose top-left is 60 below the edge midpoint (0,0); the label sits between them.
 const card={isConnected:true,ownerSVGElement:svg,getAttribute:k=>attrs[k],setAttribute(k,v){attrs[k]=v;},closest(sel){return sel==='a'?null:this;},
  transform:{baseVal:{consolidate:()=>({matrix:{e:-40,f:60}})}},querySelector:()=>({getAttribute:k=>k==='width'?'80':'40'}),
  classList:{add(){},remove(){}},focus(){},setPointerCapture(){},hasPointerCapture:()=>false};
 const view=Object.assign(events(),{ownerDocument:events(),querySelectorAll:()=>[]}),win=events(),snapshot={text:'{}',raw:{},project:'p'},selected=[];
 C.createTelemetryCardLayoutEditor({view,window:win,src:events(),session:{snapshot:()=>snapshot},disabled:()=>false,pause(){},select:c=>selected.push(c),message(){},commit(){}});
 const pointer=(clientX,clientY)=>({target:card,button:0,clientX,clientY,pointerId:1,preventDefault(){},stopImmediatePropagation(){}});
 return {leader,label,selected,view,win,pointer};
}

test('selecting a card in the Workbench keeps the leader gap at a trace label',()=>{
 const b=board();b.view.fire('pointerdown',b.pointer(0,0));b.win.fire('pointerup',b.pointer(0,0));
 assert.equal(b.selected.length,1,'a plain click selects the card');
 assert.equal(b.leader.d,'M0 0L0 17M0 38L0 60','the leader stops before the label and resumes after it');
 assert.equal(b.leader.d,C.telemetryCardLeaderTo({x:0,y:0},{x:-40,y:60,w:80,h:40},[b.label.box]),'the same path the live paint draws');
});
test('dragging a card in the Workbench redraws its leader with the gap',()=>{
 const b=board();b.view.fire('pointerdown',b.pointer(0,0));b.win.fire('pointermove',b.pointer(0,40));
 assert.equal(b.leader.d,'M0 0L0 17M0 38L0 100','a card dragged 40 lower still leaves the gap');
});
