const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../src/workspace.workbench.js'), 'utf8');

function harness(saved, unavailable = false){
  function element(){
    const events = {}, attrs = {}, classes = new Set(), properties = {};
    return {events, attrs, properties, clientWidth:1240, height:200,
      style:{cursor:'', setProperty(k,v){ properties[k] = String(v); }},
      classList:{contains:k=>classes.has(k), add:k=>classes.add(k), remove:k=>classes.delete(k),
        toggle(k,on){ on ? classes.add(k) : classes.delete(k); }},
      setAttribute(k,v){ attrs[k] = String(v); },
      addEventListener(k,fn){ (events[k] ||= []).push(fn); },
      getBoundingClientRect(){ return {height:this.height}; },
      focus(){ this.focused = true; }, setPointerCapture(id){ this.capture = id; },
      hasPointerCapture(id){ return this.capture === id; }, releasePointerCapture(){ this.capture = null; },
      fire(k,values={}){ const ev = {button:0,isPrimary:true,pointerId:1,clientX:800,clientY:200,
        preventDefault(){ this.prevented=true; },stopPropagation(){ this.stopped=true; },...values};
        for (const fn of events[k] || []) fn(ev); return ev; }
    };
  }
  const names = ['workspace-columns','workspace-rows','sec-inspect','sec-source','workspace-focus','workspace-reset'];
  const elements = Object.fromEntries(names.map(id=>[id,element()]));
  const wrap = element(), body = element(), toolbar = element(), win = element();
  toolbar.height=42; win.scrollY=500;
  win.scrollTo=(x,y)=>{ win.scrollY=y; };
  const storage = {'dv-workbench-layout-v1':saved}, writes=[];
  const context = {window:win, document:{body,getElementById:id=>elements[id],
    querySelector:s=>s === '.workwrap' ? wrap : toolbar},
    getComputedStyle:()=>({paddingLeft:'22px',paddingRight:'22px'}),
    localStorage:{getItem(k){ if(unavailable)throw Error('unavailable'); return storage[k] || null; },
      setItem(k,v){ if(unavailable)throw Error('unavailable'); storage[k]=v; writes.push(k); }}};
  vm.createContext(context); vm.runInContext(code,context); context.initWorkbenchWorkspace();
  return {...elements,wrap,body,win,context,storage,writes};
}

test('workspace bounds protect the preview and preserve a saved width across smaller windows',()=>{
  const h=harness('{"editor":850,"inspector":65}'), col=h['workspace-columns'];
  assert.equal(col.attrs['aria-valuenow'],'612'); // 1240 - 44 padding - 560 preview - 24 gaps
  h.wrap.clientWidth=1720; h.win.fire('resize');
  assert.equal(col.attrs['aria-valuenow'],'850');
  assert.equal(h['workspace-rows'].attrs['aria-valuenow'],'65');
  assert.equal(h.writes.length,0);
  for(const raw of ['no json','null','[]','{"editor":"800","inspector":null}']){
    assert.equal(h.context.workspacePrefs(raw).editor,440);
    assert.equal(h.context.workspacePrefs(raw).inspector,40);
  }
});

test('keyboard dividers enforce bounds and do not consume editor shortcuts',()=>{
  const h=harness(), col=h['workspace-columns'], row=h['workspace-rows'];
  col.fire('keydown',{key:'ArrowLeft'}); assert.equal(col.attrs['aria-valuenow'],'460');
  col.fire('keydown',{key:'End'}); assert.equal(col.attrs['aria-valuenow'],'612');
  col.fire('keydown',{key:'Home'}); assert.equal(col.attrs['aria-valuenow'],'340');
  const ignored=col.fire('keydown',{key:'ArrowLeft',metaKey:true}); assert.equal(ignored.prevented,undefined);
  row.fire('keydown',{key:'ArrowDown',shiftKey:true}); assert.equal(row.attrs['aria-valuenow'],'50');
  row.fire('keydown',{key:'End'}); assert.equal(row.attrs['aria-valuenow'],'80');
  row.fire('keydown',{key:'Home'}); assert.equal(row.attrs['aria-valuenow'],'20');
  assert.deepEqual([...new Set(h.writes)],['dv-workbench-layout-v1']);
});

test('pointer capture commits one layout preference; cancellation and lost focus restore it',()=>{
  const h=harness(), col=h['workspace-columns'], row=h['workspace-rows'];
  col.fire('pointerdown'); col.fire('pointermove',{clientX:730});
  assert.equal(col.attrs['aria-valuenow'],'510'); assert.equal(h.writes.length,0);
  col.fire('pointerup'); assert.equal(h.writes.length,1); assert.equal(col.capture,null);
  col.fire('pointerdown'); col.fire('pointermove',{clientX:1000}); col.fire('pointercancel');
  assert.equal(col.attrs['aria-valuenow'],'510'); assert.equal(h.writes.length,1);
  row.fire('pointerdown'); row.fire('pointermove',{clientY:300});
  assert.equal(row.attrs['aria-valuenow'],'65'); h.win.fire('blur');
  assert.equal(row.attrs['aria-valuenow'],'40'); assert.equal(h.body.classList.contains('workspace-dragging'),false);
  col.fire('pointerdown',{isPrimary:false}); col.fire('pointermove',{clientX:400});
  assert.equal(col.attrs['aria-valuenow'],'510');
});

test('focus is temporary, restores page scroll, and reset works when storage is blocked',()=>{
  const h=harness(null,true), focus=h['workspace-focus'];
  focus.fire('click'); assert.equal(h.body.classList.contains('workspace-focus'),true);
  assert.equal(h.win.scrollY,0); assert.equal(focus.textContent,'Exit focus');
  focus.fire('click'); assert.equal(h.win.scrollY,500); assert.equal(focus.attrs['aria-pressed'],'false');
  h['workspace-columns'].fire('keydown',{key:'End'});
  h['workspace-rows'].fire('keydown',{key:'End'});
  h['workspace-reset'].fire('click');
  assert.equal(h['workspace-columns'].attrs['aria-valuenow'],'440');
  assert.equal(h['workspace-rows'].attrs['aria-valuenow'],'40');
});
