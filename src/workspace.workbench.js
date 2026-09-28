/* Floating editor windows are browser preferences, never authored geometry. */
function workspacePrefs(raw){
  var prefs={tool:'inspect',windows:{}},value;
  try{value=JSON.parse(raw);}catch(ex){return prefs;}
  if(!value || typeof value!=='object' || Array.isArray(value))return prefs;
  if(['agent','brief','inspect','steps','outline','json','file'].includes(value.tool))prefs.tool=value.tool;
  Object.keys(value.windows || {}).forEach(function(name){
    if(!['agent','brief','inspect','steps','outline','json','file'].includes(name))return;
    var saved=value.windows[name];if(!saved || typeof saved!=='object')return;
    var rect={open:saved.open===true};
    ['x','y','w','h'].forEach(function(key){if(Number.isFinite(saved[key]))rect[key]=saved[key];});
    prefs.windows[name]=rect;
  });
  return prefs;
}
function workspacePanelRect(rect,width,height){
  var minW=Math.min(300,Math.max(1,width-24)),minH=Math.min(240,Math.max(1,height-96));
  var w=Math.max(minW,Math.min(width-24,Number.isFinite(rect.w)?rect.w:380));
  var h=Math.max(minH,Math.min(height-96,Number.isFinite(rect.h)?rect.h:640));
  return {x:Math.max(12,Math.min(width-w-12,Number.isFinite(rect.x)?rect.x:84)),
    y:Math.max(72,Math.min(height-h-12,Number.isFinite(rect.y)?rect.y:84)),w:w,h:h};
}
function initWorkbenchWorkspace(){
  var wrap=document.querySelector('.workwrap'),editor=document.getElementById('spec-editor');
  if(!wrap || !editor)return null;
  var names=['agent','brief','inspect','steps','outline','json','file'],labels={agent:'Agent · Claude',brief:'Story brief',inspect:'Inspect',steps:'Story steps',outline:'Outline',json:'JSON source',file:'Project files'};
  var tabs={},panes={},windows={},key='dv-workbench-floating-v1',raw=null,z=80,gesture=null,hidden=false,history=null;
  try{raw=localStorage.getItem(key) || localStorage.getItem('dv-workbench-layout-v2');}catch(ex){}
  var prefs=workspacePrefs(raw),hasSaved=Object.keys(prefs.windows).length>0;
  document.body.classList.add('workspace-canvas');
  var rail=document.querySelector('.workspace-rail');rail.setAttribute('role','toolbar');
  rail.removeAttribute('aria-orientation');
  function persist(){try{localStorage.setItem(key,JSON.stringify(prefs));}catch(ex){}}
  function defaults(name){return {x:name==='agent'?84:Math.max(84,innerWidth-408),y:154,w:name==='json'?500:380,h:Math.min(700,innerHeight-226),open:false};}
  function rect(name){return workspacePanelRect(prefs.windows[name],innerWidth,innerHeight);}
  function paint(name){
    var win=windows[name],r=rect(name),open=prefs.windows[name].open;
    win.style.left=r.x+'px';win.style.top=r.y+'px';win.style.width=r.w+'px';win.style.height=r.h+'px';
    win.hidden=!open || hidden;panes[name].hidden=!open;
    document.dispatchEvent(new CustomEvent('workbench-tool-visibility',{detail:{name:name,open:open && !hidden}}));
    tabs[name].setAttribute('aria-pressed',String(open && !hidden));tabs[name].setAttribute('aria-expanded',String(open && !hidden));
    tabs[name].tabIndex=name===prefs.tool?0:-1;
  }
  function paintAll(){names.forEach(paint);}
  function front(name){prefs.tool=name;windows[name].style.zIndex=++z;names.forEach(function(n){tabs[n].tabIndex=n===name?0:-1;});}
  function focusTab(name){tabs[name].focus({preventScroll:true});tabs[name].scrollIntoView({block:'nearest',inline:'nearest'});}
  function showTool(name,options){
    if(!windows[name])return false;
    if(hidden)setHidden(false);
    if(name==='agent' && document.getElementById('guide').hidden){prefs.windows.inspect.open=false;paint('inspect');}
    prefs.windows[name].open=true;front(name);paint(name);
    var section=document.getElementById(name==='json'?'sec-source':'sec-'+name);if(section)section.open=true;
    if(options && options.focus)focusTab(name);
    persist();return true;
  }
  function close(name){prefs.windows[name].open=false;paint(name);persist();focusTab(name);}
  function geometry(name){var value=prefs.windows[name],out={};['x','y','w','h'].forEach(function(k){out[k]=value[k];});return out;}
  function remember(name,before){
    if(!history || JSON.stringify(workspacePanelRect(before,innerWidth,innerHeight))===JSON.stringify(rect(name)))return;
    history({before:before,after:geometry(name),restore:function(value){
      finish(true);Object.assign(prefs.windows[name],value);paint(name);persist();return true;
    }});
  }
  function finish(cancel){
    if(!gesture)return;
    var g=gesture;gesture=null;
    if(cancel)prefs.windows[g.name]=g.before;
    document.body.classList.remove('workspace-dragging');document.body.style.cursor='';
    if(g.handle.hasPointerCapture(g.id))g.handle.releasePointerCapture(g.id);
    paint(g.name);if(!cancel){persist();remember(g.name,g.geometry);}
  }
  function begin(ev,name,kind,handle){
    if(ev.button!==0 || !ev.isPrimary || gesture)return;
    ev.preventDefault();front(name);handle.focus({preventScroll:true});
    gesture={id:ev.pointerId,name:name,kind:kind,handle:handle,x:ev.clientX,y:ev.clientY,rect:rect(name),before:Object.assign({},prefs.windows[name]),geometry:geometry(name)};
    handle.setPointerCapture(ev.pointerId);document.body.classList.add('workspace-dragging');document.body.style.cursor=kind==='move'?'grabbing':'nwse-resize';
  }
  function move(ev){
    if(!gesture || ev.pointerId!==gesture.id)return;
    var g=gesture,r=Object.assign({},g.rect),dx=ev.clientX-g.x,dy=ev.clientY-g.y;
    if(g.kind==='move'){r.x+=dx;r.y+=dy;}else{r.w+=dx;r.h+=dy;}
    Object.assign(prefs.windows[g.name],workspacePanelRect(r,innerWidth,innerHeight));paint(g.name);
  }
  function keyMove(ev,name,kind){
    if(ev.altKey || ev.ctrlKey || ev.metaKey || !/^Arrow(Left|Right|Up|Down)$/.test(ev.key))return;
    ev.preventDefault();ev.stopPropagation();var before=geometry(name),r=rect(name),amount=ev.shiftKey?50:10;
    var axis=/Left|Right/.test(ev.key)?(kind==='move'?'x':'w'):(kind==='move'?'y':'h');
    r[axis]+=/Left|Up/.test(ev.key)?-amount:amount;
    Object.assign(prefs.windows[name],workspacePanelRect(r,innerWidth,innerHeight));paint(name);persist();remember(name,before);
  }
  names.forEach(function(name,index){
    var pane=panes[name]=document.getElementById('editor-'+name),tab=tabs[name]=document.getElementById('editor-tab-'+name);
    var win=document.createElement('section');win.className='workspace-window';win.id='workspace-window-'+name;win.setAttribute('aria-label',labels[name]);
    var head=document.createElement('div');head.className='workspace-window-header';
    var grip=document.createElement('button');grip.type='button';grip.className='workspace-window-grip';grip.textContent=labels[name];
    grip.setAttribute('aria-label','Move '+labels[name]+' panel');grip.title='Drag to move · arrow keys move · Shift moves farther';
    var hide=document.createElement('button');hide.type='button';hide.className='workspace-window-close';hide.textContent='×';hide.setAttribute('aria-label','Close '+labels[name]+' panel');
    var resize=document.createElement('button');resize.type='button';resize.className='workspace-window-resize';resize.textContent='◢';resize.setAttribute('aria-label','Resize '+labels[name]+' panel');resize.title='Drag to resize · arrow keys resize';
    head.append(grip,hide);pane.before(win);win.append(head,pane,resize);pane.removeAttribute('role');
    windows[name]=win;prefs.windows[name]=Object.assign(defaults(name),prefs.windows[name]);
    tab.setAttribute('role','button');tab.removeAttribute('aria-selected');tab.setAttribute('aria-controls',win.id);
    tab.addEventListener('click',function(){showTool(name);});
    tab.addEventListener('keydown',function(ev){
      if(ev.altKey || ev.ctrlKey || ev.metaKey)return;
      var next=ev.key==='ArrowDown'||ev.key==='ArrowRight'?(index+1)%names.length:ev.key==='ArrowUp'||ev.key==='ArrowLeft'?(index+names.length-1)%names.length:ev.key==='Home'?0:ev.key==='End'?names.length-1:-1;
      if(next<0)return;ev.preventDefault();showTool(names[next],{focus:true});
    });
    hide.addEventListener('click',function(){close(name);});
    win.addEventListener('pointerdown',function(){front(name);});
    win.addEventListener('focusin',function(){front(name);});
    [[grip,'move'],[resize,'resize']].forEach(function(pair){
      var handle=pair[0],kind=pair[1];
      handle.addEventListener('pointerdown',function(ev){begin(ev,name,kind,handle);});handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',function(ev){if(gesture && ev.pointerId===gesture.id)finish(false);});
      handle.addEventListener('pointercancel',function(){finish(true);});handle.addEventListener('lostpointercapture',function(){finish(true);});
      handle.addEventListener('keydown',function(ev){keyMove(ev,name,kind);});
    });
  });
  // Keep shared editing notices with Inspect, and source validation with JSON.
  ['draftbar','msgs'].forEach(function(id){var el=document.getElementById(id);if(el)panes.json.appendChild(el);});
  var insertion=editor.querySelector('.editor-add-status');if(insertion)panes.inspect.prepend(insertion);
  function setHidden(on){hidden=on;paintAll();var button=document.getElementById('workspace-panels');button.textContent=on?'Show tools':'Hide tools';button.setAttribute('aria-pressed',String(on));}
  document.getElementById('workspace-panels').addEventListener('click',function(){setHidden(!hidden);});
  document.getElementById('workspace-focus').addEventListener('click',function(){setHidden(true);});
  document.getElementById('workspace-reset').addEventListener('click',function(){
    finish(true);names.forEach(function(name){var open=prefs.windows[name].open;prefs.windows[name]=Object.assign(defaults(name),{open:open});});paintAll();persist();
  });
  window.addEventListener('keydown',function(ev){if(ev.key==='Escape' && gesture){ev.preventDefault();ev.stopPropagation();finish(true);}},true);
  window.addEventListener('blur',function(){finish(true);});window.addEventListener('resize',function(){finish(true);paintAll();});
  if(!hasSaved)prefs.windows[prefs.tool].open=true;
  front(prefs.tool);paintAll();
  var canvas=initWorkbenchCanvas();
  var preset=document.getElementById('workspace-preset');
  function applyPreset(value){
    if(!['story','engineering','present'].includes(value))return;
    finish(true);hidden=false;
    names.forEach(function(name){prefs.windows[name]=Object.assign(defaults(name),{open:false});});
    if(value==='story'){prefs.windows.agent.open=true;front('agent');}
    if(value==='engineering'){
      prefs.windows.brief=Object.assign(defaults('brief'),{x:84,w:350,open:true});
      if(innerWidth>=1100)prefs.windows.inspect.open=true;
      front('brief');
    }
    document.getElementById('workspace-panels').textContent='Hide tools';
    document.getElementById('workspace-panels').setAttribute('aria-pressed','false');
    document.body.dataset.workspacePreset=value;paintAll();persist();
    requestAnimationFrame(function(){canvas.fit();});
  }
  if(preset)preset.addEventListener('change',function(){applyPreset(preset.value);});

  return {setHistory:function(value){finish(true);history=value;canvas.setHistory(value);},showTool:showTool,applyPreset:applyPreset,tool:function(){return prefs.tool;},isOpen:function(name){return !!prefs.windows[name] && prefs.windows[name].open && !hidden;},canvas:canvas};
}
