'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function harness(){
  const scheduled=new Map(),held=[],cancelled=[];let sequence=0;
  const c={setTimeout(fn){const id=++sequence;scheduled.set(id,fn);held.push(fn);return id;},
    clearTimeout(id){scheduled.delete(id);cancelled.push(id);}};
  vm.runInNewContext(readSource('workbench/lifetime.js'),c);
  return {create:c.createWorkbenchLifetime,scheduled,held,cancelled};
}
function target(){
  const records=[],held=[];
  return {records,held,
    addEventListener(type,fn,options){records.push({type,fn,capture:typeof options==='boolean'?options:!!options?.capture});held.push(fn);},
    removeEventListener(type,fn,capture){const at=records.findIndex(r=>r.type===type&&r.fn===fn&&r.capture===capture);if(at>=0)records.splice(at,1);},
    fire(type){records.slice().filter(r=>r.type===type).forEach(r=>r.fn.call(this,{type}));}};
}
test('listener ownership normalizes capture, native duplicate registration and once; retained wrappers retire',()=>{
  const h=harness(),a=h.create(),b=h.create(),el=target();let called=0,other=0;
  function callback(){assert.equal(this,el);called++;}
  a.listen(el,'click',callback,{capture:true});a.listen(el,'click',callback,true);
  a.listen(el,'click',callback,false);b.listen(el,'click',()=>other++);
  assert.equal(el.records.length,3);el.fire('click');assert.equal(called,2);assert.equal(other,1);
  const held=el.held.slice();a.destroy();a.destroy();assert.equal(el.records.length,1);
  held.slice(0,2).forEach(fn=>fn.call(el,{}));assert.equal(called,2);el.fire('click');assert.equal(other,2);
  let once=0;b.listen(el,'once',()=>once++,{once:true});el.fire('once');el.held.at(-1)({});assert.equal(once,1);
  b.destroy();assert.equal(el.records.length,0);
});
test('cancelled and destroyed timers stay inert even when already queued, and every cleanup runs before an error is reported',()=>{
  const h=harness(),life=h.create(),el=target(),order=[];let called=0;
  const first=life.delay(()=>called++,800);life.cancelDelay(first);h.held[0]();assert.equal(called,0);
  life.delay(()=>called++,0);life.listen(el,'click',()=>called++);
  life.own(()=>order.push('last'));life.own(()=>{order.push('throws');throw Error('cleanup failed');});life.own(()=>order.push('first'));
  assert.throws(()=>life.destroy(),/cleanup failed/);assert.deepEqual(order,['first','throws','last']);
  h.held.forEach(fn=>fn());el.held.forEach(fn=>fn({}));assert.equal(called,0);
  assert.equal(el.records.length,0);assert.equal(h.scheduled.size,0);life.destroy();
  assert.equal(life.delay(()=>called++,0),null);life.listen(el,'click',()=>called++);assert.equal(el.records.length,0);
});
