'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');

function events(){
  const listeners={};
  return {listeners,
    addEventListener(type,fn){(listeners[type] ||= []).push(fn);},
    removeEventListener(type,fn){listeners[type]=(listeners[type] || []).filter(value=>value!==fn);},
    fire(type){(listeners[type] || []).slice().forEach(fn=>fn({type}));}};
}
function svg(initiallyPaused=false){
  let stopped=initiallyPaused,time=0;
  return {isConnected:true,parent:null,querySelector:()=>({}),animationsPaused:()=>stopped,
    pauseAnimations(){stopped=true;},unpauseAnimations(){stopped=false;},
    tick(amount){if(!stopped)time+=amount;},time:()=>time};
}
function harness({focus=true,active=true}={}){
  const doc=Object.assign(events(),{hidden:false,hasFocus:()=>focus}),win=events(),classes=new Set();
  let boards=[];const observed=[],sets=[];
  win.MutationObserver=class{constructor(fn){this.fn=fn;observed.push(this);}observe(target,options){this.target=target;this.options=options;}disconnect(){this.disconnected=true;}};
  const view={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);},remove:name=>classes.delete(name)},
    querySelectorAll(){return boards;},contains(node){return boards.includes(node);}};
  class TrackedSet extends Set{constructor(){super();sets.push(this);}}
  const context={Set:TrackedSet};vm.runInNewContext(readSource('workbench/motion-lifetime.js'),context);
  const owner=context.createWorkbenchMotionLifetime({document:doc,window:win,view,active:()=>active,activityTarget:{}});
  return {doc,win,view,classes,observed,owner,paused:sets[0],setBoards(next){boards=next;next.forEach(node=>node.parent=view);},
    setFocus(value){focus=value;},setActive(value){active=value;},notifyActivity(){observed[0].fn();}};
}

test('focus and visibility suspend only authoring graph SMIL clocks and resume clocks this owner paused',()=>{
  const h=harness(),running=svg(),prePaused=svg(true);h.setBoards([running,prePaused]);h.owner.refresh();
  running.tick(1);prePaused.tick(1);assert.equal(running.time(),1);assert.equal(prePaused.time(),0);
  h.win.fire('blur');running.tick(1);assert.equal(running.time(),1);assert.ok(h.classes.has('dv-workbench-motion-paused'));
  h.win.fire('focus');running.tick(1);prePaused.tick(1);assert.equal(running.time(),2);assert.equal(prePaused.time(),0);
  h.doc.hidden=true;h.doc.fire('visibilitychange');running.tick(1);assert.equal(running.time(),2);
  h.doc.hidden=false;h.setFocus(true);h.doc.fire('visibilitychange');running.tick(1);assert.equal(running.time(),3);
});

test('replacement, Home transitions and teardown reconcile fresh boards without reviving retired callbacks',()=>{
  const h=harness({focus:false}),first=svg(),replacement=svg();h.setBoards([first]);h.owner.refresh();
  first.tick(1);assert.equal(first.time(),0);
  first.isConnected=false;h.setBoards([replacement]);h.owner.refresh();replacement.tick(1);assert.equal(replacement.time(),0);
  assert.equal(h.paused.size,1,'replacement refresh drops the detached SVG instead of retaining every old board');
  h.setFocus(true);h.win.fire('focus');replacement.tick(1);assert.equal(replacement.time(),1);
  h.setActive(false);h.notifyActivity();replacement.tick(1);assert.equal(replacement.time(),1);
  h.owner.destroy();replacement.tick(1);first.tick(1);assert.equal(replacement.time(),2);assert.equal(first.time(),0,'detached clocks are retired during refresh');assert.equal(h.classes.size,0);
  assert.equal(h.observed[0].disconnected,true);h.win.fire('blur');replacement.tick(1);assert.equal(replacement.time(),3);
  h.owner.destroy();
});
