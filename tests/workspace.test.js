const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/workspace.workbench.js'),'utf8'),context);
test('floating preferences migrate the selected tool, reject invalid values, and keep only supported windows',()=>{
  for(const raw of ['no json','null','[]','{"tool":"unknown"}'])assert.equal(context.workspacePrefs(raw).tool,'inspect');
  assert.equal(context.workspacePrefs('{"tool":"agent","editor":800}').tool,'agent');
  const prefs=context.workspacePrefs('{"tool":"steps","windows":{"steps":{"x":200,"y":100,"w":400,"h":500,"open":true},"evil":{"open":true},"file":null}}');
  assert.deepEqual(JSON.parse(JSON.stringify(prefs)),{tool:'steps',windows:{steps:{x:200,y:100,w:400,h:500,open:true}}});
});
test('offscreen or oversized saved panels stay reachable after a smaller viewport',()=>{
  const r=context.workspacePanelRect({x:1600,y:1000,w:700,h:900},800,600);
  assert.ok(r.x>=12);assert.ok(r.y>=72);assert.ok(r.x+r.w<=788);assert.ok(r.y+r.h<=588);
  const narrow=context.workspacePanelRect({x:-1000,y:-1000,w:-20,h:-30},375,700,224);
  assert.equal(narrow.x,12);assert.equal(narrow.y,224);assert.equal(narrow.w,300);assert.equal(narrow.h,240);
});
test('missing and nonfinite geometry uses usable defaults without rewriting source data',()=>{
  const original={x:Infinity,y:NaN,w:NaN,h:Infinity};
  const r=context.workspacePanelRect(original,1400,1000);
  assert.equal(r.w,380);assert.equal(r.h,640);assert.equal(r.x,84);assert.equal(r.y,84);
  assert.equal(original.x,Infinity);assert.ok(Number.isNaN(original.y));
});

test('measured bottom tools reserve a reachable panel viewport in short windows',()=>{
  const r=context.workspacePanelRect({x:900,y:900,w:380,h:640},640,360,112,68);
  assert.equal(r.y,112);assert.equal(r.h,180);assert.equal(r.y+r.h,292);
  assert.ok(r.x+r.w<=628);
});

test('reader preview host changes rerender with explicit targets and widths',()=>{
  function node(name){
    const listeners={},attributes={};
    return {name,parentNode:null,children:[],hidden:false,open:false,style:{setProperty(name,value){this[name]=value;}},value:'',isConnected:true,classList:{add(){},remove(){}},
      addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},
      removeEventListener(type,fn){listeners[type]=(listeners[type]||[]).filter(value=>value!==fn);},
      setAttribute(name,value){attributes[name]=String(value);},getAttribute(name){return attributes[name]??null;},
      emit(type,event={}){(listeners[type]||[]).forEach(fn=>fn({target:this,preventDefault(){},stopPropagation(){},...event}));},
      appendChild(child){if(child.parentNode)child.remove();child.parentNode=this;this.children.push(child);return child;},
      before(child){const at=this.parentNode.children.indexOf(this);child.parentNode=this.parentNode;this.parentNode.children.splice(at,0,child);},
      remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;this.isConnected=false;},
      replaceWith(child){const at=this.parentNode.children.indexOf(this);child.parentNode=this.parentNode;this.parentNode.children[at]=child;this.parentNode=null;},
      replaceChildren(){this.children.forEach(child=>{child.parentNode=null;});this.children=[];},
      querySelector(selector){return selector==='header'?this.header:null;},querySelectorAll(){return [];},
      matches(){return false;},closest(){return null;},focus(){},showModal(){this.open=true;},close(){this.open=false;}};
  }
  const open=node('open'),back=node('back'),dialog=node('dialog'),header=node('dialog-header'),surface=node('surface'),view=node('reader'),workspace=node('workspace'),authorView=node('author'),workbenchHeader=node('workbench-header'),menu=node('menu'),settings=node('settings'),select=node('select'),width=node('input'),canvas=node('canvas'),body=node('body');
  dialog.header=header;dialog.appendChild(header);dialog.appendChild(surface);surface.appendChild(view);settings.appendChild(select);settings.appendChild(width);menu.appendChild(settings);workspace.appendChild(canvas);canvas.appendChild(authorView);body.appendChild(workbenchHeader);body.appendChild(menu);body.appendChild(workspace);body.appendChild(dialog);
  settings.querySelector=selector=>selector==='select'?select:selector==='input'?width:null;menu.querySelector=selector=>selector==='.layout-preview-tools'?settings:null;
  const ids={'open-page-preview':open,'close-page-preview':back,'page-preview':dialog,'page-preview-surface':surface,'page-preview-view':view,'workbench-workspace':workspace,docview:authorView,'workspace-appearance':menu,'workspace-canvas':canvas};
  const renders=[];
  const c={document:{body,activeElement:open,getElementById:id=>ids[id]||null,querySelector:selector=>selector==='.workbench-header'?workbenchHeader:null,createComment:name=>node(name)},window:{scrollX:0,scrollY:0,scrollTo(){}},
    applySkinClasses(){},syncNavigationPopover(){},
    workbenchReaderPreviewSnapshot(page,ctl){return {from:ctl.name};},
    initViewerExploreCanvas(){return {destroy(){}}}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/workbench/lifetime.js'),'utf8'),c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/workspace.workbench.js'),'utf8'),c);
  const authoring={name:'author',steppers:[]};
  const preview=c.initWorkbenchReaderPreview({page:()=>({}),controller:()=>authoring,skin:()=> 'pastel',render(view,page,skin,legacy,options){const ctl={name:options.layoutTarget,destroy(){}};renders.push({target:options.layoutTarget,host:surface.getAttribute('data-target'),width:surface.style.width,homeHeight:view.style['--home-max-height'],snapshot:options.snapshot,legacy});return ctl;}});
  select.value='default';width.value='';preview.show();
  select.value='backstage';width.value='1080';settings.emit('change');
  select.value='confluence';width.value='760';settings.emit('change');
  select.value='default';width.value='';settings.emit('change');
  assert.deepEqual(renders.map(render=>[render.target,render.host,render.width,render.homeHeight,render.legacy]),[
    ['default','default','100%','70vh',null],['backstage','backstage','1080px','70vh',null],['confluence','confluence','760px','560px',null],['default','default','100%','70vh',null]]);
  assert.deepEqual(renders.slice(1).map(render=>render.snapshot.from),['default','backstage','confluence']);
});

test('reader preview host identity owns the host shell without workspace frame sizing',()=>{
  const css=fs.readFileSync(require('node:path').join(__dirname,'../src/style.workbench.css'),'utf8');
  assert.match(css,/#page-preview-surface\[data-target="confluence"\]>#page-preview-view\{padding:12px;border-radius:0;\}/);
  assert.match(css,/#page-preview-surface\[data-target="backstage"\]>#page-preview-view\{padding:16px;border-radius:4px;\}/);
  assert.doesNotMatch(css,/#page-preview-surface[^{}]*width:100%!important/);
});
