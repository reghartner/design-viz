const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const code=['validator.js','engine.js'].map(name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8')).join('\n');

function element(tag='div'){
  return {tag,children:[],attrs:{},events:{},scrolls:[],focuses:[],
    appendChild(child){this.children.push(child);child.parentNode=this;},
    removeChild(child){this.children=this.children.filter(c=>c!==child);child.parentNode=null;},
    setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},
    removeAttribute(k){delete this.attrs[k];},
    addEventListener(k,fn){this.events[k]=fn;},removeEventListener(k,fn){if(this.events[k]===fn)delete this.events[k];},
    querySelector(q){return q==='.card'?this.children.find(c=>c.attrs.class==='card'):null;},
    getClientRects(){return this.hidden?[]:[{width:150,height:54}];},
    focus(options){this.focuses.push(options);},scrollIntoView(options){this.scrolls.push(options);}};
}
function harness(){
  const context={document:{createElement:element,createElementNS:(_,tag)=>element(tag)}};
  vm.createContext(context);vm.runInContext(code,context);
  const board=element(),legend=element();
  const nodes={a:{title:'A very long service name that remains complete'},b:{title:'Repeated'},c:{title:'Repeated'},
    unsafe:{title:'<img src=x onerror=alert(1)>'},unplaced:{title:'Not drawn'}};
  const nodeEls={};
  for(const id of ['a','b','c','unsafe']){
    const node=element('g'),card=element('rect');
    node.setAttribute('class','node tint-cmd tone-alert');
    card.setAttribute('class','card');card.setAttribute('width','150');card.setAttribute('height','54');
    node.appendChild(card);nodeEls[id]=node;
  }
  let pauses=0;
  const ctl=context.createBoardNodeFinder(board,legend,nodeEls,nodes,()=>pauses++);
  const wrap=legend.children[0],select=wrap.children[0].children[0],show=wrap.children[1],status=wrap.children[2];
  return {context,board,legend,nodes,nodeEls,ctl,select,show,status,pauses:()=>pauses,
    choose(id){select.value=id;select.events.change();},find(id){this.choose(id);show.events.click();}};
}

test('finder lists full rendered names, disambiguates duplicates and treats markup as text',()=>{
  const h=harness(),options=h.select.children;
  assert.deepEqual(options.map(o=>o.value),['','a','b','c','unsafe']);
  assert.equal(options[1].textContent,h.nodes.a.title);
  assert.equal(options[2].textContent,'Repeated · b');assert.equal(options[3].textContent,'Repeated · c');
  assert.equal(options[4].textContent,h.nodes.unsafe.title);assert.equal(options[4].innerHTML,undefined);
  assert.equal(h.show.disabled,true);
  assert.equal(h.context.createBoardNodeFinder(element(),element(),{},h.nodes),null);
});

test('only explicit Show navigates and pauses; step tones and authored data are untouched',()=>{
  const h=harness(),node=h.nodeEls.a,card=node.querySelector('.card'),before=JSON.stringify(h.nodes);
  h.choose('a');assert.equal(h.show.disabled,false);assert.equal(card.scrolls.length,0);assert.equal(h.pauses(),0);
  h.show.events.click();assert.equal(h.pauses(),1);
  assert.deepEqual(JSON.parse(JSON.stringify(card.scrolls)),[{block:'center',inline:'center',behavior:'instant'}]);
  assert.equal(node.focuses[0].preventScroll,true);
  assert.equal(node.attrs.class,'node tint-cmd tone-alert');assert.equal(node.children[1].attrs.class,'board-find-ring');
  assert.equal(node.children[1].attrs.width,'158');assert.equal(node.children[1].attrs['aria-hidden'],'true');
  assert.equal(JSON.stringify(h.nodes),before);assert.match(h.status.textContent,/Showing A very long/);
});

test('Escape returns focus, removes the mark and restores pre-existing accessibility attributes',()=>{
  const h=harness(),node=h.nodeEls.a;
  node.setAttribute('role','img');node.setAttribute('aria-label','Original');node.setAttribute('tabindex','0');
  h.find('a');let prevented=0,stopped=0;
  const event={key:'Escape',target:node,preventDefault:()=>prevented++,stopPropagation:()=>stopped++};
  h.board.events.keydown({...event,target:h.nodeEls.b});assert.equal(prevented,0);
  h.board.events.keydown(event);assert.equal(prevented,1);assert.equal(stopped,1);
  assert.equal(h.select.focuses.length,1);assert.equal(node.children.length,1);
  assert.equal(node.attrs.role,'img');assert.equal(node.attrs['aria-label'],'Original');assert.equal(node.attrs.tabindex,'0');
  h.find('b');h.board.events.focusout({target:h.nodeEls.b});
  assert.equal(h.nodeEls.b.children.length,1);assert.equal(h.nodeEls.b.getAttribute('tabindex'),null);
});

test('unknown choices and hidden cards never navigate a different node',()=>{
  const h=harness();h.find('unplaced');assert.equal(h.show.disabled,true);assert.equal(h.pauses(),0);
  h.nodeEls.b.querySelector('.card').hidden=true;h.find('b');
  assert.match(h.status.textContent,/not visible/);assert.equal(h.pauses(),0);
  assert.equal(h.nodeEls.a.querySelector('.card').scrolls.length,0);
  assert.equal(h.nodeEls.b.focuses.length,0);
});

test('synchronous focusout during tabindex removal cannot interrupt Escape recovery',()=>{
  const h=harness(),node=h.nodeEls.a,remove=node.removeAttribute.bind(node);
  node.removeAttribute=function(attr){
    remove(attr);
    if(attr==='tabindex') h.board.events.focusout({target:node});
  };
  h.find('a');h.board.events.keydown({target:node,key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(h.select.focuses.length,1);assert.equal(node.children.length,1);
  assert.equal(node.getAttribute('role'),null);assert.equal(node.getAttribute('aria-label'),null);
});

test('replacing or disposing a finder removes old marks and rejects stale callbacks',()=>{
  const h=harness();h.find('a');h.find('c');assert.equal(h.nodeEls.a.children.length,1);
  assert.equal(h.nodeEls.c.children.length,2);
  const stale=h.show.events.click,oldKey=h.board.events.keydown;
  const page=h.context.renderPage(element(),{sections:[]},'aurora');page.sections.push({nodeFinder:h.ctl});page.destroy();
  h.ctl.destroy();assert.equal(h.nodeEls.c.children.length,1);assert.equal(h.board.events.keydown,undefined);
  assert.equal(h.board.events.focusout,undefined);
  stale();oldKey({key:'Escape',target:h.nodeEls.c,preventDefault:()=>assert.fail('stale event')});
  assert.equal(h.pauses(),2);assert.equal(h.nodeEls.c.children.length,1);
});
