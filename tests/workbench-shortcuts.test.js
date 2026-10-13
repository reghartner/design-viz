'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function target(kind){
  const listeners=[];
  return {kind,listeners,isConnected:true,open:false,classList:{contains:()=>false},
    addEventListener(type,fn,options){listeners.push({type,fn,capture:!!(options===true||options&&options.capture)});},
    removeEventListener(type,fn,capture){const i=listeners.findIndex(x=>x.type===type&&x.fn===fn&&x.capture===!!capture);if(i>=0)listeners.splice(i,1);},
    fire(type,event={}){event.target??=this;listeners.filter(x=>x.type===type).slice().forEach(x=>x.fn.call(this,event));},
    closest(selector){
      if(kind==='input' && selector.includes('input'))return this;
      if(kind==='panel' && selector.includes('.pwidget'))return this;
      if(kind==='node' && selector.includes('[data-dv-object-menu]'))return this;
      if(kind==='button' && selector.includes('button'))return this;
      return null;
    },
    focus(){},showModal(){this.open=true;},close(){if(!this.open)return;this.open=false;this.fire('close',{});}
  };
}
function harness(){
  const doc=target('document'),body=target('body'),canvas=target('canvas'),view=target('view'),dialog=target('dialog'),open=target('button'),close=target('button');
  const ids={'keyboard-shortcuts':dialog,'workspace-shortcuts':open,'keyboard-shortcuts-close':close,'workspace-canvas':canvas};
  canvas.contains=el=>!!el.inCanvas;view.contains=el=>!!el.inCanvas;doc.body=body;doc.activeElement=body;
  doc.getElementById=id=>ids[id]||null;doc.querySelector=selector=>selector==='dialog[open]'&&dialog.open?dialog:null;
  const win={getSelection:()=>({isCollapsed:true,toString:()=>''})},calls=[];
  const c={setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(readSource('workbench/lifetime.js'),c);vm.runInContext(readSource('workbench/shortcuts.js'),c);
  const options={document:doc,window:win,view,isActive:()=>true,
    selectAll:()=>{calls.push('select-all');return true;},fitDiagram:()=>{calls.push('fit-diagram');return true;},
    fitSelection:()=>{calls.push('fit-selection');return true;},inspect:()=>{calls.push('inspect');return true;}};
  return {c,doc,win,dialog,open,close,calls,options,mount:()=>c.createBuilderWorkflowShortcuts(options)};
}
function key(key,extra={}){return {key,prevented:false,preventDefault(){this.prevented=true;},...extra};}

test('shortcut intent owns only the collision-audited combinations',()=>{
  const h=harness(),intent=h.c.workbenchShortcutIntent;
  assert.deepEqual(plain([intent(key('?',{shiftKey:true})),intent(key('a',{metaKey:true})),intent(key('a',{ctrlKey:true})),intent(key('f')),intent(key('F',{shiftKey:true})),intent(key('F2'))]),['help','select-all','select-all','fit-diagram','fit-selection','inspect']);
  for(const event of [key('Enter'),key('f',{ctrlKey:true}),key('a',{ctrlKey:true,shiftKey:true}),key('F2',{shiftKey:true}),key('?',{altKey:true})])assert.equal(intent(event),null);
});

test('controller gates native fields, panel widgets, selected prose, modal and inactive preview',()=>{
  const h=harness(),owner=h.mount(),input=target('input');input.inCanvas=true;let event=key('f',{target:input});h.doc.fire('keydown',event);assert.equal(event.prevented,false);
  const panel=target('panel');panel.inCanvas=true;event=key('F2',{target:panel});h.doc.fire('keydown',event);assert.equal(event.prevented,false);
  const node=target('node');node.inCanvas=true;h.win.getSelection=()=>({isCollapsed:false,toString:()=> 'selected prose'});event=key('f',{target:node});h.doc.fire('keydown',event);assert.equal(event.prevented,false);
  h.win.getSelection=()=>({isCollapsed:true,toString:()=>''});h.dialog.open=true;event=key('f',{target:node});h.doc.fire('keydown',event);assert.equal(event.prevented,false);
  h.dialog.open=false;h.options.isActive=()=>false;owner.destroy();const inactive=h.mount();event=key('f',{target:node});h.doc.fire('keydown',event);assert.equal(event.prevented,false);assert.deepEqual(h.calls,[]);inactive.destroy();
});

test('canvas actions and help fire once and listener ownership survives destroy/remount',()=>{
  const h=harness(),node=target('node');node.inCanvas=true;const first=h.mount();
  for(const event of [key('a',{target:node,ctrlKey:true}),key('f',{target:node}),key('F',{target:node,shiftKey:true}),key('F2',{target:node})]){h.doc.fire('keydown',event);assert.equal(event.prevented,true);}
  assert.deepEqual(h.calls,['select-all','fit-diagram','fit-selection','inspect']);
  const help=key('?',{target:h.doc.body,shiftKey:true});h.doc.fire('keydown',help);assert.equal(help.prevented,true);assert.equal(h.dialog.open,true);h.close.fire('click',{});assert.equal(h.dialog.open,false);
  const toolbar=target('button'),buttonHelp=key('?',{target:toolbar,shiftKey:true});h.doc.fire('keydown',buttonHelp);assert.equal(buttonHelp.prevented,true);assert.equal(h.dialog.open,true);h.close.fire('click',{});
  const held=h.doc.listeners.filter(x=>x.type==='keydown').map(x=>x.fn);first.destroy();held.forEach(fn=>fn(key('f',{target:node})));assert.equal(h.calls.length,4);
  const second=h.mount(),fit=key('f',{target:node});h.doc.fire('keydown',fit);assert.equal(fit.prevented,true);assert.deepEqual(h.calls.slice(-1),['fit-diagram']);second.destroy();assert.equal(h.doc.listeners.length,0);
});
