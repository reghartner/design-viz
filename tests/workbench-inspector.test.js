'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const pureNames=['validator','workbench/source-edit','workbench/targets','workbench/commands/common',
  'workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/inspector-model','workbench/controls','workbench/inspector'];
function environment(){
  const doc={activeElement:null},listeners={};
  function element(tag = 'div', id = ''){
    const attrs = {}, handlers = {};
    const el = {tagName: tag.toUpperCase(), id, className: '', children: [], style: {}, scrollTop:0, scrollLeft:0,
      value: '', hidden: false, disabled: false, textContent: '',
      addEventListener(type, fn){ (handlers[type] ||= []).push(fn); },
      appendChild(child){ this.children.push(child); child.parentNode = this; return child; },
      setAttribute(k, v){ if (k === 'class') this.className = String(v); else attrs[k] = String(v); },
      removeAttribute(k){ delete attrs[k]; },
      get firstChild(){ return this.children[0] || null; },
      removeChild(child){ child.remove(); child.parentNode = null; },
      cloneNode(deep){
        const clone = element(tag);
        clone.className = this.className;
        for (const [k, v] of Object.entries(attrs)) clone.setAttribute(k, v);
        if (deep) for (const child of this.children) clone.appendChild(child.cloneNode(true));
        return clone;
      },
      getAttribute(k){ return attrs[k] ?? null; },
      hasAttribute(k){ return Object.hasOwn(attrs, k); },
      remove(){ if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
      focus(){ doc.activeElement = this; },
      setSelectionRange(start,end,direction){ this.selectionStart=start; this.selectionEnd=end; this.selectionDirection=direction; },
      contains(child){ return child === this || this.children.some(c => c.contains(child)); },
      matches(selector){
        if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        const tagMatch = selector.match(/^[a-z]+/i);
        if (tagMatch && this.tagName.toLowerCase() !== tagMatch[0]) return false;
        for (const [, cls] of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g))
          if (!this.className.split(' ').includes(cls)) return false;
        for (const [, key, value] of selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g))
          if (value === undefined ? !this.hasAttribute(key) : this.getAttribute(key) !== value) return false;
        return true;
      },
      closest(selectors){
        for (let at = this; at; at = at.parentNode){
          if (selectors.split(',').some(s => at.matches(s.trim()))) return at;
        }
        return null;
      },
      querySelectorAll(selector){
        return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
      },
      querySelector(selector){ return this.querySelectorAll(selector)[0] || null; },
      fire(type, props = {}){
        const ev = {target: this, key: '', preventDefault(){ this.defaultPrevented = true; },
          stopPropagation(){ this.stopped = true; }, ...props};
        for (const rec of listeners[type] || []) if (rec.capture) rec.fn(ev);
        if (!ev.stopped){
          for (let at = this; at; at = at.parentNode) for (const fn of at.handlers[type] || []) fn(ev);
          for (const rec of listeners[type] || []) if (!rec.capture) rec.fn(ev);
        }
        return ev;
      }, handlers
    };
    el.classList = {
      add(...cs){ el.className += ' ' + cs.join(' '); },
      remove(...cs){ el.className = el.className.split(' ').filter(x => !cs.includes(x)).join(' '); },
      contains(c){ return el.className.split(' ').includes(c); }
    };
    Object.defineProperty(el,'innerHTML',{set(){if(el.contains(doc.activeElement))doc.activeElement=doc.body;for(const child of el.children)child.parentNode=null;el.children=[];},get(){return '';}});
    Object.defineProperty(el,'childNodes',{get(){return el.children;}});
    Object.defineProperty(el,'options',{get(){return el.children;}});

    return el;
  }

  doc.body=element('body');doc.createElement=element;
  doc.createTextNode=text=>Object.assign(element('span'),{textContent:text});
  doc.getElementById=id=>doc.body.querySelector('#'+id);
  const C={document:doc,URL};vm.createContext(C);
  for(const name of pureNames)vm.runInContext(readSource(name+'.js'),C);
  function mount(spec){
    const guide=doc.body.appendChild(element()),timers=new Map(),scheduled=[];
    let text=JSON.stringify(spec,null,2),next=0,inspector,reveals=0,selectionCalls=0;
    const session=C.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},
      persistence:C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}}),
      invalidateProject(){inspector.retire();}});
    session.target={kind:'panel',section:0,index:0};
    inspector=C.createBuilderInspector({document:doc,guide,session,
      apply(plan,opt,snapshot){return session.accept(plan,{snapshot,afterRender(){if(opt?.after)opt.after(plan);}});},
      schedule(fn){timers.set(++next,fn);scheduled.push(fn);return next;},cancel:id=>timers.delete(id),
      surface:{show(){},reveal(){reveals++;},hideDiff(){},retire(){}},
      selection:{select(){selectionCalls++;},range(){selectionCalls++;},rehighlight(){selectionCalls++;},remove(){},removeMany(){}},
      preview:{stepper:()=>null,targetElement:()=>null},
      modes:{adding:()=>null,connecting:()=>null,toggleAdding(){},editPathStep(){}},
      clipboard:{current:()=>null,selectHome(){selectionCalls++;},clearHome(){}}});
    return {inspector,session,guide,timers,scheduled,get text(){return text;},get reveals(){return reveals;},get selectionCalls(){return selectionCalls;},
      flush(){const run=[...timers.values()];timers.clear();run.forEach(fn=>fn());}};
  }
  return {C,doc,element,mount};
}
const home=()=>({nodes:{},rows:[],panels:[{id:'home',type:'homemap',outline:{w:300,h:164,future:'keep'}}],steps:[{panels:{home:{}}}]});
const named=(guide,name)=>guide.querySelectorAll('.obj-field').find(label=>label.textContent===name)?.querySelector('input');

test('commit helper keeps blur opt-in, textarea Enter native, unchanged policy and rejected retry explicit',()=>{
  const C={};vm.runInNewContext(readSource('workbench/controls.js'),C);
  function control(tag,options){
    const events={},input={value:'old',tagName:tag,addEventListener:(name,fn)=>events[name]=fn},saved=[];
    C.wireBuilderCommit(input,()=>{saved.push(input.value);return input.value!=='bad';},options);
    return {input,events,saved};
  }
  const ordinary=control('INPUT');assert.equal(ordinary.events.blur,undefined);
  ordinary.events.change();assert.deepEqual(ordinary.saved,[]);
  ordinary.input.value='new';ordinary.events.keydown({key:'Enter',preventDefault(){}});ordinary.events.change();
  assert.deepEqual(ordinary.saved,['new']);
  ordinary.input.value='bad';ordinary.events.change();ordinary.input.value='new';ordinary.events.change();
  assert.deepEqual(ordinary.saved,['new','bad','new']);
  const typed=control('INPUT',{blur:true});typed.input.value='next';typed.events.blur();typed.events.change();assert.deepEqual(typed.saved,['next']);
  const area=control('TEXTAREA',{blur:true});area.input.value='a\nb';area.events.keydown({key:'Enter',preventDefault(){assert.fail('textarea newline was prevented');}});
  assert.deepEqual(area.saved,[]);area.events.blur();assert.deepEqual(area.saved,['a\nb']);
  const forced=control('INPUT',{commitUnchanged:true});forced.events.change();assert.deepEqual(forced.saved,['old']);
});

test('deferred Home refresh preserves Enter caret/scroll and the latest Tab destination without stealing outside focus',()=>{
  for(const destination of ['same','next','outside']){
    const e=environment(),h=e.mount(home());h.inspector.render();
    const width=named(h.guide,'Width'),height=named(h.guide,'Height'),before=h.text;
    assert.ok(width);assert.ok(height);width.focus();width.value='280';width.setSelectionRange(1,2,'backward');
    h.guide.scrollTop=137;width.fire('keydown',{key:'Enter'});
    assert.equal(JSON.parse(h.text).panels[0].outline.w,280);
    assert.equal(JSON.parse(h.text).panels[0].outline.future,'keep');
    const outside=e.doc.body.appendChild(e.element('input'));
    if(destination==='next'){width.fire('blur');height.focus();height.setSelectionRange(0,1,'forward');}
    if(destination==='outside')outside.focus();
    h.flush();
    assert.equal(h.guide.contains(width),false);
    const expected=destination==='same'?named(h.guide,'Width'):destination==='next'?named(h.guide,'Height'):outside;
    assert.equal(e.doc.activeElement,expected);
    if(destination!=='outside')assert.deepEqual([expected.selectionStart,expected.selectionEnd,expected.selectionDirection],
      destination==='same'?[1,2,'backward']:[0,1,'forward']);
    assert.equal(h.guide.scrollTop,137);
    h.session.undo();assert.equal(h.text,before);assert.equal(h.session.canUndo(),false);
  }
});

test('queued refreshes retire on target, route, project, source, explicit retirement and destroy',()=>{
  for(const reason of ['target','route','project','source','retire','destroy']){
    const e=environment(),h=e.mount(home());h.inspector.render();h.inspector.refresh();
    const callback=h.scheduled.at(-1),shown=h.reveals;
    if(reason==='target')h.session.target={kind:'node',section:0,id:'other'};
    if(reason==='route')h.session.target.pathId='other';
    if(reason==='project')h.session.replaceProject(h.text);
    if(reason==='source')h.inspector.sourceChanged();
    if(reason==='retire')h.inspector.retire();
    if(reason==='destroy')h.inspector.destroy();
    callback();assert.equal(h.reveals,shown,reason);
  }
});

test('inspector expansion and panel factory caches are per instance, and held contexts cannot revive a destroyed owner',()=>{
  const e=environment(),spec={nodes:{},rows:[],panels:[{id:'state',type:'state'}],steps:[{panels:{state:{state:'ON'}}}]},a=e.mount(spec),b=e.mount(spec);
  a.session.target={kind:'step',section:0,index:0};b.session.target={kind:'step',section:0,index:0};
  a.inspector.render();b.inspector.render();
  for(const selector of ['.patchedit','.effective-state']){
    const details=a.guide.querySelector(selector);assert.ok(details,selector+' '+a.guide.querySelector('.ierr')?.textContent);details.open=true;details.fire('toggle');
  }
  a.inspector.render();b.inspector.render();
  assert.equal(a.guide.querySelector('.patchedit').open,true);assert.equal(b.guide.querySelector('.patchedit').open,false);
  assert.equal(a.guide.querySelector('.effective-state').open,true);assert.equal(b.guide.querySelector('.effective-state').open,false);
  const contexts=[];let made=0;
  const authoring={editor(ctx){contexts.push(ctx);return {identity:++made};}};
  e.C.PanelRegistry.define('test-inspector',{authoring});
  const first=a.inspector.panel('test-inspector');assert.equal(a.inspector.panel('test-inspector'),first);
  assert.notEqual(b.inspector.panel('test-inspector'),first);assert.equal(made,2);
  authoring.editor=ctx=>{contexts.push(ctx);return {identity:++made};};
  assert.notEqual(a.inspector.panel('test-inspector'),first);assert.equal(made,3);
  const held=contexts[0],before=a.text,selection=a.selectionCalls;
  let actions=0;const heldAction=held.controls.action('Old action',()=>actions++);
  a.inspector.refresh();const pending=a.scheduled.at(-1);a.inspector.destroy();
  pending();heldAction.fire('click');assert.equal(actions,0);
  assert.equal(held.clipboard(),null);assert.equal(held.stepper(0),null);
  held.refresh();held.inspect();held.select({kind:'step'});held.rehighlight();held.selectClipboard({kind:'panel'});
  a.inspector.renderMulti([{kind:'node',id:'a'},{kind:'node',id:'b'}]);a.inspector.panel('test-inspector');
  assert.equal(held.commit('title','"retired"'),false);assert.equal(held.transact(()=>({text:'{}'})),false);
  assert.equal(a.guide.children.length,0);assert.equal(a.timers.size,0);assert.equal(a.selectionCalls,selection);
  assert.equal(a.text,before);assert.equal(made,3);assert.equal(b.inspector.panel('test-inspector').identity,4);
});

test('two inspectors keep group suggestions in their own DOM and retire those nodes on destroy',()=>{
  const e=environment(),spec=group=>({nodes:{a:{group}},rows:[['a']],groups:{[group]:{title:group}},steps:[]});
  const a=e.mount(spec('left')),b=e.mount(spec('right'));
  for(const h of [a,b]){h.session.target={kind:'node',section:0,id:'a'};h.inspector.render();}
  const left=a.guide.querySelector('datalist'),right=b.guide.querySelector('datalist');
  assert.notEqual(left.id,right.id);
  assert.deepEqual(left.children.map(option=>option.value),['left']);
  assert.deepEqual(right.children.map(option=>option.value),['right']);
  assert.ok(a.guide.querySelectorAll('input').some(input=>input.getAttribute('list')===left.id));
  assert.ok(b.guide.querySelectorAll('input').some(input=>input.getAttribute('list')===right.id));
  a.inspector.destroy();assert.equal(e.doc.body.contains(left),false);assert.equal(e.doc.body.contains(right),true);
  assert.equal(e.C.OPEN_PATCH_EDITORS,undefined);assert.equal(e.C.OPEN_EFFECTIVE_PANELS,undefined);
});

test('same multiselection refresh keeps its active field and scroll, while changed targets start fresh',()=>{
  const e=environment(),h=e.mount({nodes:{a:{},b:{},c:{}},rows:[['a','b','c']]}),before=h.text;
  const targets=['a','b'].map(id=>({kind:'node',section:0,id}));h.session.target=null;
  const tint=()=>h.guide.querySelectorAll('.frow').find(row=>row.querySelector('.flab')?.textContent==='tint').querySelector('select');
  h.inspector.renderMulti(targets);const old=tint();old.focus();h.guide.scrollTop=91;
  old.value='dev';old.fire('change');
  assert.deepEqual(Object.values(JSON.parse(h.text).nodes).map(node=>node.tint),['dev','dev',undefined]);
  h.inspector.renderMulti([...targets].reverse());
  assert.equal(h.guide.contains(old),false);assert.equal(e.doc.activeElement,tint());assert.equal(h.guide.scrollTop,91);
  h.inspector.renderMulti([targets[0],{kind:'node',section:0,id:'c'}]);
  assert.notEqual(e.doc.activeElement,tint());assert.equal(h.guide.scrollTop,0);
  h.session.undo();assert.equal(h.text,before);assert.equal(h.session.canUndo(),false);
});
