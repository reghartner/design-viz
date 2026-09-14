const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = ['validator.js', 'engine.js', 'workspace.workbench.js']
  .map(name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8')).join('\n');

function element(){
  const classes = new Set();
  return {children:[], attrs:{}, events:{}, classList:{
    toggle(name, on){ if(on) classes.add(name); else classes.delete(name); },
    contains:name=>classes.has(name)},
    appendChild(child){ this.children.push(child); },
    setAttribute(name, value){ this.attrs[name] = value; },
    addEventListener(name, fn){ this.events[name] = fn; }};
}
function harness(width=320, scrollWidth=1180){
  const observers = [];
  const context = {document:{createElement:element}, ResizeObserver:class {
    constructor(fn){ this.fn=fn; observers.push(this); }
    observe(target){ this.target=target; }
    disconnect(){ this.disconnected=true; }
  }};
  vm.createContext(context); vm.runInContext(code, context);
  const board = element(), legend = element();
  Object.assign(board,{clientWidth:width,scrollWidth,scrollLeft:0});
  const ctl = context.createBoardSizeControl(board, legend, 'Checkout');
  return {context,board,legend,ctl,observer:observers[0],
    buttons:legend.children[0].children.filter(el=>el.events.click)};
}

test('diagram sizing exposes mutually exclusive native controls without accepting unknown modes',()=>{
  const h=harness();
  assert.equal(h.board.tabIndex,0);
  assert.equal(h.board.attrs.role,'region');
  assert.match(h.board.attrs['aria-label'],/Checkout diagram/);
  assert.equal(h.legend.children[0].attrs['aria-label'],'Diagram size');
  assert.deepEqual(h.buttons.map(b=>b.attrs['aria-pressed']),['true','false','false']);
  h.buttons[1].events.click();
  assert.equal(h.ctl.mode(),'fit');
  assert.deepEqual(h.buttons.map(b=>b.attrs['aria-pressed']),['false','true','false']);
  assert.equal(h.board.classList.contains('board-size-auto'),false);
  h.ctl.setMode('broken'); assert.equal(h.ctl.mode(),'fit');
  h.buttons[2].events.click(); assert.equal(h.ctl.mode(),'readable');
  h.buttons[0].events.click(); assert.equal(h.ctl.mode(),'auto');
});

test('new overflow starts centered; resizing and revealing a tab preserve an existing pan',()=>{
  const h=harness(0,0);
  assert.equal(h.board.scrollLeft,0);
  Object.assign(h.board,{clientWidth:320,scrollWidth:1180}); h.observer.fn();
  assert.equal(h.board.scrollLeft,430);
  assert.equal(h.board.classList.contains('board-overflow'),true);
  h.board.scrollLeft=720; h.board.clientWidth=390; h.observer.fn();
  assert.equal(h.board.scrollLeft,720);
  h.board.clientWidth=0; h.observer.fn();
  h.board.clientWidth=390; h.observer.fn(); assert.equal(h.board.scrollLeft,720);
  // The browser clamps scrollLeft when Fit removes overflow.
  h.board.scrollWidth=390; h.board.scrollLeft=0; h.ctl.setMode('fit');
  assert.equal(h.board.classList.contains('board-overflow'),false);
  h.board.scrollWidth=1180; h.ctl.setMode('readable');
  assert.equal(h.board.scrollLeft,395);
});

test('destroy disconnects the observer and rejects callbacks or events from a replaced board',()=>{
  const h=harness(); h.ctl.destroy(); h.ctl.destroy();
  assert.equal(h.observer.disconnected,true);
  h.board.scrollWidth=320; h.observer.fn(); h.buttons[1].events.click();
  assert.equal(h.ctl.mode(),'auto');
  assert.equal(h.board.classList.contains('board-overflow'),true);
});

test('page disposal releases diagram sizing even when a diagram has no stepper',()=>{
  const h=harness(), page=h.context.renderPage(element(), {sections:[]}, 'aurora');
  page.sections.push({boardSize:h.ctl});
  page.destroy();
  assert.equal(h.observer.disconnected,true);
});

test('size choices survive edits independently of playback, including diagrams without steps',()=>{
  const h=harness();
  const page={title:'Request',sections:[{heading:'Checkout',diagram:{routing:'lanes',
    nodes:{api:{},db:{}},steps:[{id:'duplicate'},{id:'duplicate'}]}}]};
  const makeCtl = (size,stepper=null) => ({sections:[{number:1,boardSize:size,stepper}]});
  const prior = makeCtl(h.ctl,{mode:()=> 'step',current:()=>({n:0})});
  h.ctl.setMode('fit');
  const before=JSON.stringify(page), saved=h.context.workbenchPreviewSnapshot(page,prior);
  const next=harness(), after=JSON.parse(before); after.skin='daylight';
  h.context.restoreWorkbenchPreview(after,makeCtl(next.ctl),saved);
  assert.equal(next.ctl.mode(),'fit'); // ambiguous step identity does not discard sizing
  after.sections[0].diagram.steps=[];
  const noSteps=h.context.workbenchPreviewSnapshot(after,makeCtl(next.ctl));
  next.ctl.setMode('auto'); h.context.restoreWorkbenchPreview(after,makeCtl(next.ctl),noSteps);
  assert.equal(next.ctl.mode(),'fit');
  assert.equal(JSON.stringify(page),before);
  next.ctl.setMode('auto'); after.title='New document';
  h.context.restoreWorkbenchPreview(after,makeCtl(next.ctl),saved); assert.equal(next.ctl.mode(),'auto');
  after.title=page.title; after.sections.push(JSON.parse(JSON.stringify(after.sections[0])));
  h.context.restoreWorkbenchPreview(after,makeCtl(next.ctl),saved); assert.equal(next.ctl.mode(),'auto');
});
