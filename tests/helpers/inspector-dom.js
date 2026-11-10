'use strict';
/* Minimal DOM plus a mounted Workbench inspector over a real builder session.
   Shared by node-level inspector tests; callers pass the source names to load. */
const vm=require('node:vm');
const {readSource}=require('../../tools/source-loader.cjs');
function inspectorEnvironment(names){
  const doc={activeElement:null},listeners={};
  function element(tag = 'div', id = ''){
    const attrs = {}, handlers = {};
    const el = {tagName: tag.toUpperCase(), id, className: '', children: [], style: {}, scrollTop:0, scrollLeft:0,
      value: '', hidden: false, disabled: false, textContent: '',
      addEventListener(type, fn){ (handlers[type] ||= []).push(fn); },
      removeEventListener(type,fn){handlers[type]=(handlers[type] || []).filter(f=>f!==fn);},
      appendChild(child){ this.children.push(child); child.parentNode = this; return child; },
      append(...children){ children.forEach(child=>this.appendChild(child)); },
      replaceChildren(...children){ this.children.forEach(child=>child.parentNode=null);this.children=[];this.append(...children); },
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
        if (selector === ':disabled') return !!this.disabled;
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
      contains(c){ return el.className.split(' ').includes(c); },
      toggle(c,force){const on=force===undefined?!this.contains(c):!!force;this[on?'add':'remove'](c);return on;}
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
  for(const name of names)vm.runInContext(readSource(name+'.js'),C);
  function mount(spec,options={}){
    const guide=doc.body.appendChild(element()),timers=new Map(),scheduled=[];
    let text=JSON.stringify(spec,null,2),next=0,inspector,reveals=0,selectionCalls=0,retireCalls=0,selected=null;
    const session=C.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},
      persistence:C.createBuilderPersistence({storage:()=>({getItem:()=>null,setItem(){},removeItem(){}}),now:()=>0,schedule(){},cancel(){}}),
      invalidateProject(){inspector.retire();},
      // As in the builder: a refused edit without its own handler replaces the Inspector with the message.
      editError(message){inspector.message(message);}});
    session.target={kind:'panel',section:0,index:0};
    inspector=C.createBuilderInspector({document:doc,guide,session,
      apply(plan,opt,snapshot){if(plan?.error){inspector.error(plan.error);return false;}return session.accept(plan,{snapshot,editError:opt?.editError,afterRender(){if(opt?.after)opt.after(plan);}});},
      schedule(fn){timers.set(++next,fn);scheduled.push(fn);return next;},cancel:id=>timers.delete(id),
      surface:{show(){},reveal(){reveals++;},hideDiff(){},retire(){retireCalls++;}},
      selection:{select(target){selectionCalls++;selected=target;},range(){selectionCalls++;},rehighlight(){selectionCalls++;},remove(){},removeMany(){}},
      preview:{stepper:()=>options.stepper || null,targetElement:()=>null},
      modes:{adding:()=>null,connecting:()=>null,toggleAdding(){},editPathStep(){}},
      clipboard:{current:()=>null,selectHome(){selectionCalls++;},clearHome(){}}});
    return {inspector,session,guide,timers,scheduled,get text(){return text;},get reveals(){return reveals;},get retireCalls(){return retireCalls;},get selectionCalls(){return selectionCalls;},get selected(){return selected;},
      writeSource(value){text=value;inspector.sourceChanged();},
      flush(){const run=[...timers.values()];timers.clear();run.forEach(fn=>fn());}};
  }
  return {C,doc,element,mount};
}
module.exports={inspectorEnvironment};
