const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../src/workspace.workbench.js'), 'utf8');

function harness(saved, unavailable = false, current = null){
  function element(){
    const events = {}, attrs = {}, classes = new Set(), properties = {};
    return {events, attrs, properties, clientWidth:1240, height:200, scrollTop:0, open:true,
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
  const names = ['workspace-columns','spec-editor','sec-inspect','sec-source','sec-steps','sec-insert','sec-outline',
    'workspace-focus','workspace-expand','workspace-reset','src','guide'];
  ['inspect','steps','json'].forEach(n=>names.push('editor-tab-'+n,'editor-'+n));
  const elements = Object.fromEntries(names.map(id=>[id,element()]));
  const wrap = element(), body = element(), toolbar = element(), win = element();
  toolbar.height=42; win.scrollY=500;
  win.scrollTo=(x,y)=>{ win.scrollY=y; };
  const storage = {'dv-workbench-layout-v1':saved,'dv-workbench-layout-v2':current}, writes=[];
  const context = {window:win, document:{body,getElementById:id=>elements[id],
    querySelector:s=>s === '.workwrap' ? wrap : toolbar},
    getComputedStyle:()=>({paddingLeft:'22px',paddingRight:'22px'}),
    localStorage:{getItem(k){ if(unavailable)throw Error('unavailable'); return storage[k] || null; },
      setItem(k,v){ if(unavailable)throw Error('unavailable'); storage[k]=v; writes.push(k); }}};
  vm.createContext(context); vm.runInContext(code,context); const ctl=context.initWorkbenchWorkspace();
  return {...elements,wrap,body,win,context,storage,writes,ctl};
}

test('workspace migrates saved widths without the obsolete inspector split and clamps only the displayed width',()=>{
  const h=harness('{"editor":1000,"inspector":65}'), col=h['workspace-columns'];
  assert.equal(col.attrs['aria-valuenow'],'872'); // 1240 - 44 padding - 300 preview - 24 divider
  h.wrap.clientWidth=1720; h.win.fire('resize');
  assert.equal(col.attrs['aria-valuenow'],'1000');
  assert.equal(h.ctl.tool(),'inspect'); assert.equal(h.writes.length,0);
  for(const raw of ['no json','null','[]','{"editor":"800","tool":"missing"}']){
    assert.equal(h.context.workspacePrefs(raw).editor,440);
    assert.equal(h.context.workspacePrefs(raw).tool,'inspect');
  }
  const v2=harness('{"editor":850}',false,'{"editor":640,"tool":"steps"}');
  assert.equal(v2['workspace-columns'].attrs['aria-valuenow'],'640');
  assert.equal(v2.ctl.tool(),'steps'); assert.equal(v2['editor-steps'].hidden,false);
});

test('keyboard divider enforces bounds, balances on double-click and leaves editor shortcuts alone',()=>{
  const h=harness(), col=h['workspace-columns'];
  col.fire('keydown',{key:'ArrowLeft'}); assert.equal(col.attrs['aria-valuenow'],'460');
  col.fire('keydown',{key:'End'}); assert.equal(col.attrs['aria-valuenow'],'872');
  col.fire('keydown',{key:'Home'}); assert.equal(col.attrs['aria-valuenow'],'320');
  const ignored=col.fire('keydown',{key:'ArrowLeft',metaKey:true}); assert.equal(ignored.prevented,undefined);
  col.fire('dblclick'); assert.equal(col.attrs['aria-valuenow'],'586');
  assert.deepEqual([...new Set(h.writes)],['dv-workbench-layout-v2']);
});

test('pointer capture commits once; cancellation, lost focus and window resize restore the preference',()=>{
  const h=harness(), col=h['workspace-columns'];
  col.fire('pointerdown'); col.fire('pointermove',{clientX:730});
  assert.equal(col.attrs['aria-valuenow'],'510'); assert.equal(h.writes.length,0);
  col.fire('pointerup'); assert.equal(h.writes.length,1); assert.equal(col.capture,null);
  for(const action of ['pointercancel','blur','resize','lostpointercapture']){
    col.fire('pointerdown'); col.fire('pointermove',{clientX:1000});
    if(action==='blur'||action==='resize')h.win.fire(action);else col.fire(action);
    assert.equal(col.attrs['aria-valuenow'],'510',action); assert.equal(h.writes.length,1);
    assert.equal(h.body.classList.contains('workspace-dragging'),false);
  }
  col.fire('pointerdown',{isPrimary:false}); col.fire('pointermove',{clientX:400});
  assert.equal(col.attrs['aria-valuenow'],'510');
});

test('expansion retains the split width, selected tool and content; Return restores the earlier focus and scroll',()=>{
  const h=harness(), expand=h['workspace-expand'];
  h.ctl.showTool('json'); const src=h.src;
  src.value='unsaved source';src.selectionStart=3;src.selectionEnd=8;src.scrollTop=200;
  const selected={path:'offline',step:'lost'};h['editor-inspect'].form=selected;
  const click=expand.fire('click');assert.equal(click.prevented,true);assert.equal(click.stopped,true);
  assert.equal(h.ctl.expanded(),true);assert.equal(h.body.classList.contains('workspace-focus'),true);
  assert.equal(h['spec-editor'].open,true);assert.equal(h.win.scrollY,0);
  h['workspace-columns'].fire('pointerdown');h['workspace-columns'].fire('keydown',{key:'End'});
  assert.equal(h['workspace-columns'].attrs['aria-valuenow'],'440','hidden divider cannot resize while expanded');
  expand.fire('click');assert.equal(h.ctl.expanded(),false);assert.equal(h.win.scrollY,500);
  assert.equal(h.body.classList.contains('workspace-focus'),false);
  assert.equal(h.ctl.tool(),'json');assert.equal(h.src,src);assert.equal(src.value,'unsaved source');
  assert.equal(src.selectionStart,3);assert.equal(src.selectionEnd,8);assert.equal(src.scrollTop,200);
  assert.equal(h['editor-inspect'].form,selected);
  assert.equal(h.writes.length,1,'only the explicit tab choice persists, not focus or expansion');
  h['workspace-focus'].fire('click');expand.fire('click');expand.fire('click');
  assert.equal(h.body.classList.contains('workspace-focus'),true,'Return retains preexisting focus mode');
});

test('editor tabs expose one pane, support arrow navigation and preserve the same source and inspector nodes',()=>{
  const h=harness(),src=h.src,form={caption:'draft caption'};
  h['editor-inspect'].form=form;src.value='draft JSON';src.selectionStart=2;src.selectionEnd=7;
  h.guide.scrollTop=520;
  h['editor-tab-inspect'].fire('keydown',{key:'ArrowRight'});
  h.guide.scrollTop=0; // a hidden scrolling form may have its offset clamped by the browser
  assert.equal(h.ctl.tool(),'steps');assert.equal(h['editor-tab-steps'].focused,true);
  assert.equal(h['editor-tab-inspect'].tabIndex,-1);assert.equal(h['editor-tab-steps'].tabIndex,0);
  h['editor-tab-steps'].fire('keydown',{key:'End'});assert.equal(h.ctl.tool(),'json');
  src.scrollTop=340;
  h['editor-tab-json'].fire('keydown',{key:'ArrowRight'});assert.equal(h.ctl.tool(),'inspect');
  assert.equal(h.guide.scrollTop,520);
  h.ctl.showTool('json');assert.equal(src.scrollTop,340);
  assert.equal(h.src,src);assert.equal(src.value,'draft JSON');assert.equal(src.selectionStart,2);assert.equal(src.selectionEnd,7);
  assert.equal(h['editor-inspect'].form,form);
  for(const name of ['inspect','steps','json']){
    assert.equal(h['editor-'+name].hidden,name!=='json');
    assert.equal(h['editor-tab-'+name].attrs['aria-selected'],String(name==='json'));
  }
  assert.equal(h.ctl.showTool('missing'),false);assert.equal(h.ctl.tool(),'json');
  h.guide.firstChild={title:'Newly selected step'};h.guide.scrollTop=520;
  h.ctl.showTool('inspect');assert.equal(h.guide.scrollTop,0,'a new selection starts at the top of its own form');
});

test('explicit tool navigation reveals the outer editor and keeps optional utilities out of its way',()=>{
  const h=harness();h['spec-editor'].open=false;
  h.ctl.showTool('json',{closeUtilities:true});
  assert.equal(h['spec-editor'].open,true);assert.equal(h['sec-source'].open,true);
  assert.equal(h['sec-insert'].open,false);assert.equal(h['sec-outline'].open,false);
});

test('reset restores width without changing the active tool and works when storage is unavailable',()=>{
  const h=harness(null,true);
  h.ctl.showTool('steps');h['workspace-columns'].fire('keydown',{key:'End'});
  h['workspace-expand'].fire('click');h['workspace-reset'].fire('click');
  assert.equal(h['workspace-columns'].attrs['aria-valuenow'],'440');
  assert.equal(h.ctl.expanded(),false);assert.equal(h.ctl.tool(),'steps');assert.equal(h.win.scrollY,500);
});
