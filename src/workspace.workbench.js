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
    if(saved.docked===true)rect.docked=true;
    ['x','y','w','h'].forEach(function(key){if(Number.isFinite(saved[key]))rect[key]=saved[key];});
    prefs.windows[name]=rect;
  });
  return prefs;
}
function workspacePanelRect(rect,width,height,chromeTop,chromeBottom,chromeLeft){
  // The measured navigation edge reserves space for every wrapped lane.
  var top=Number.isFinite(chromeTop)?chromeTop:72,bottom=Number.isFinite(chromeBottom)?chromeBottom:12,left=Number.isFinite(chromeLeft)?chromeLeft:12,availableH=Math.max(1,height-top-bottom);
  var minW=Math.min(300,Math.max(1,width-left-12)),minH=Math.min(240,availableH);
  var w=Math.max(minW,Math.min(width-left-12,Number.isFinite(rect.w)?rect.w:380));
  var h=Math.max(minH,Math.min(availableH,Number.isFinite(rect.h)?rect.h:640));
  return {x:Math.max(left,Math.min(width-w-12,Number.isFinite(rect.x)?rect.x:84)),
    y:Math.max(top,Math.min(height-h-bottom,Number.isFinite(rect.y)?rect.y:84)),w:w,h:h};
}

/* A reader preview is a second renderer, not an authoring canvas with its
   controls hidden. Detach the authoring tree while it is open: both renderers
   use stable fragment IDs, and global SVG lookups must see only one tree. */
function initWorkbenchReaderPreview(opts){
  var open=document.getElementById('open-page-preview'),back=document.getElementById('close-page-preview');
  var dialog=document.getElementById('page-preview'),surface=document.getElementById('page-preview-surface'),view=document.getElementById('page-preview-view');
  var workspace=document.getElementById('workbench-workspace'),authorView=document.getElementById('docview'),header=document.querySelector('.workbench-header');
  var menu=document.getElementById('workspace-appearance'),settings=menu.querySelector('.layout-preview-tools');
  if(!open || !back || !dialog || !surface || !view || !workspace || !authorView || !header || !settings)return null;
  var life=createWorkbenchLifetime(),ctl=null,canvas=null,state=null;
  function active(){return !!state;}
  function setReaderSkin(skin){if(!state)return;state.skin=skin;applySkinClasses(document.body,view,skin);}
  life.listen(view,'reader-skin-change',function(ev){if(state)state.skin=ev.detail.skin;});
  function suspend(authoring){
    return (authoring.steppers || []).map(function(rec){
      var stepper=rec.stepper,playing=!!(stepper && stepper.playing && stepper.playing());
      if(stepper && stepper.pause)stepper.pause();
      return {stepper:stepper,playing:playing};
    });
  }
  function destroyReader(){
    if(canvas)canvas.destroy();canvas=null;
    if(ctl)ctl.destroy();ctl=null;view.replaceChildren();
  }
  function restoreAuthoring(restore){
    if(restore.anchor.parentNode)restore.anchor.replaceWith(authorView);
    if(restore.settingsAnchor.parentNode)restore.settingsAnchor.replaceWith(settings);
    workspace.hidden=restore.workspaceHidden;header.hidden=restore.headerHidden;
    document.body.classList.remove('workbench-reader-preview-active');
    restore.popovers.forEach(function(body){if(body.isConnected && !body.matches(':popover-open'))body.showPopover();});
    restore.playback.forEach(function(saved){
      if(saved.playing && saved.stepper && saved.stepper.playing && !saved.stepper.playing())saved.stepper.toggleAuto();
    });
    restore.scroll.forEach(function(saved){saved.element.scrollLeft=saved.x;saved.element.scrollTop=saved.y;});
    if(restore.canvas){restore.canvas.scrollLeft=restore.canvasX;restore.canvas.scrollTop=restore.canvasY;}
    window.scrollTo(restore.windowX,restore.windowY);
  }
  function hide(refocus){
    if(!state)return;
    var restore=state;state=null;destroyReader();if(dialog.open)dialog.close();restoreAuthoring(restore);
    if(refocus!==false && restore.focused && restore.focused.isConnected){
      // Preview lives inside nested responsive menus. Reopen every ancestor so
      // focus returns to a visible command rather than an inert hidden button.
      for(var owner=restore.focused.closest('details');owner;owner=owner.parentElement && owner.parentElement.closest('details')){owner.open=true;syncNavigationPopover(owner);}
      restore.focused.focus({preventScroll:true});
    }
  }
  function renderReader(){
    var reading=ctl?workbenchReaderPreviewSnapshot(state.page,ctl):state.reading;
    destroyReader();
    var target=settings.querySelector('select').value,width=settings.querySelector('input').value;
    surface.setAttribute('data-target',target);
    surface.style.width=target==='default'?'100%':width+'px';
    view.style.setProperty('--home-max-height',target==='confluence'?'560px':'70vh');
    try{
      ctl=opts.render(view,state.page,state.skin,null,{layoutTarget:target,snapshot:reading});
      canvas=initViewerExploreCanvas(ctl,view,{container:surface});
    }catch(ex){hide();throw ex;}
  }
  function show(){
    if(state)return;
    var page=opts.page(),authoring=opts.controller();if(!page || !authoring)return;
    var authorCanvas=document.getElementById('workspace-canvas'),focused=document.activeElement;
    var anchor=document.createComment('workbench author view position'),settingsAnchor=document.createComment('preview settings position');
    state={page:page,skin:opts.skin(page),reading:workbenchReaderPreviewSnapshot(page,authoring),focused:focused,
      windowX:window.scrollX,windowY:window.scrollY,anchor:anchor,settingsAnchor:settingsAnchor,canvas:authorCanvas,
      canvasX:authorCanvas?authorCanvas.scrollLeft:0,canvasY:authorCanvas?authorCanvas.scrollTop:0,
      headerHidden:header.hidden,workspaceHidden:workspace.hidden,playback:suspend(authoring),
      scroll:Array.from(authorView.querySelectorAll('*')).filter(function(el){return el.scrollLeft || el.scrollTop;}).map(function(el){return {element:el,x:el.scrollLeft,y:el.scrollTop};}),
      popovers:Array.from(authorView.querySelectorAll(':popover-open'))};
    state.popovers.forEach(function(body){body.hidePopover();});
    menu.open=false;syncNavigationPopover(menu);
    settings.before(settingsAnchor);dialog.querySelector('header').appendChild(settings);
    document.body.classList.add('workbench-reader-preview-active');
    authorView.before(anchor);authorView.remove();workspace.hidden=true;header.hidden=true;
    dialog.showModal();renderReader();back.focus({preventScroll:true});
  }
  life.listen(open,'click',show);life.listen(back,'click',hide);
  life.listen(dialog,'cancel',function(ev){ev.preventDefault();hide();});
  life.listen(dialog,'keydown',function(ev){ev.stopPropagation();});
  life.listen(settings,'change',function(){if(state)renderReader();});
  return {active:active,show:show,hide:hide,setSkin:setReaderSkin,destroy:function(){hide(false);life.destroy();}};
}

function initWorkbenchWorkspace(){
  var wrap=document.querySelector('.workwrap'),editor=document.getElementById('spec-editor');
  if(!wrap || !editor)return null;
  var names=['agent','brief','inspect','steps','outline','json','file'],labels={agent:'Agent',brief:'Story brief',inspect:'Inspect',steps:'Steps',outline:'Find objects',json:'JSON source',file:'Project files'};
  var tabs={},panes={},windows={},key='dv-workbench-floating-v1',raw=null,z=80,gesture=null,hidden=false,placements={},selectionFrame=0,selectionKey=null,dockFrame=0,dockRevision=0;
  try{raw=localStorage.getItem(key) || localStorage.getItem('dv-workbench-layout-v2');}catch(ex){}
  var prefs=workspacePrefs(raw),hasSaved=Object.keys(prefs.windows).length>0,revealFreshInspect=!hasSaved;
  document.body.classList.add('workspace-canvas');
  document.querySelector('.workbench-header').addEventListener('keydown',function(ev){if(!((ev.ctrlKey || ev.metaKey) && ['z','k'].includes(ev.key.toLowerCase())))ev.stopPropagation();if(ev.key==='Escape'){var detail=ev.target.closest('details[open]');if(detail){ev.preventDefault();detail.open=false;detail.querySelector('summary').focus();}}});
  document.addEventListener('toggle',function(ev){
    var selector='.workbench-header details,#workspace-canvas-tools,#docview .explore-navigation details';
    if(!ev.target.matches(selector))return;
    if(ev.target.open)document.querySelectorAll(selector).forEach(function(other){if(other!==ev.target && other.open && !(other===more && compactActions===false) && !other.contains(ev.target) && !ev.target.contains(other)){other.open=false;syncNavigationPopover(other);}});
    syncNavigationPopover(ev.target);
  },true);
  var more=document.getElementById('workspace-more'),compactActions=null;
  function paintMore(){var compact=matchMedia('(max-width:1180px)').matches;if(compact===compactActions)return;compactActions=compact;more.open=!compact;}
  paintMore();window.addEventListener('resize',paintMore);
  var rail=document.querySelector('.workspace-rail');rail.setAttribute('role','toolbar');
  rail.removeAttribute('aria-orientation');
  function persist(){try{localStorage.setItem(key,JSON.stringify(prefs));}catch(ex){}}
  function visibleRect(selector){
    var el=document.querySelector(selector),r=el && el.getBoundingClientRect();
    return r && r.width && r.height && getComputedStyle(el).visibility!=='hidden'?r:null;
  }
  function bounds(){
    var styles=getComputedStyle(document.body),left=12,top=parseFloat(styles.getPropertyValue('--workspace-content-top')) || 72;
    ['.workspace-rail','#docview .reader-contents'].forEach(function(selector){var r=visibleRect(selector);if(r)left=Math.max(left,r.right+12);});
    ['.workbench-header','#docview > .explore-navigation'].forEach(function(selector){var r=visibleRect(selector);if(r)top=Math.max(top,r.bottom+10);});
    var controls=visibleRect('#workspace-canvas-controls');
    return {left:left,top:top,bottom:controls?innerHeight-controls.top+12:12};
  }
  function defaults(name){var b=bounds();return {x:name==='agent'?b.left:innerWidth-392,y:b.top,w:name==='json'?500:380,h:Math.min(700,innerHeight-b.top-b.bottom),open:false};}
  function docked(){return names.find(function(name){return prefs.windows[name] && prefs.windows[name].docked && prefs.windows[name].open && !hidden && !(windows[name] && windows[name].classList.contains('workspace-focus-tucked'));});}
  function dockWidth(){var b=bounds(),name=docked();return name?Math.min(Math.max(300,prefs.windows[name].w),Math.max(300,(innerWidth-b.left)*.45)):0;}
  function boundRect(value,name){
    var b=bounds(),reserve=docked() && docked()!==name?dockWidth()+12:0;
    return workspacePanelRect(value,innerWidth-reserve,innerHeight,b.top,b.bottom,b.left);
  }
  function rect(name){
    if(docked()===name){var b=bounds(),w=dockWidth();return {x:innerWidth-w-12,y:b.top,w:w,h:Math.max(1,innerHeight-b.top-b.bottom)};}
    return boundRect(placements[name] || prefs.windows[name],name);
  }
  function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
  function selectedRects(){
    return Array.from(document.querySelectorAll('#docview .dv-sel')).map(function(el){
      var r=el.getBoundingClientRect(),clip=el.closest('.explore-board'),c=clip && clip.getBoundingClientRect();
      var x=Math.max(r.left,c?c.left:0),y=Math.max(r.top,c?c.top:0),right=Math.min(r.right,c?c.right:innerWidth),bottom=Math.min(r.bottom,c?c.bottom:innerHeight);
      return {x:x-8,y:y-8,w:Math.max(0,right-x)+16,h:Math.max(0,bottom-y)+16};
    }).filter(function(r){return r.w>16 && r.h>16;});
  }
  // Automatic avoidance is display-only: moving the user's selection must not
  // overwrite an intentional floating preference or move the authored camera.
  function place(name,opening){
    if(docked()===name)return;
    var preferred=boundRect(prefs.windows[name],name),current=rect(name),b=bounds(),selected=(name==='inspect' || prefs.windows.inspect.open)?selectedRects():[];
    var other=names.filter(function(n){return n!==name && prefs.windows[n] && prefs.windows[n].open && !hidden;}).map(rect);
    function score(r){return selected.reduce(function(sum,s){return sum+overlap(r,s)*100;},0)+other.reduce(function(sum,o){
      // Keep other windows' title bars and resize handles reachable when possible.
      return sum+overlap(r,{x:o.x,y:o.y,w:o.w,h:48})*4+overlap(r,{x:o.x+o.w-24,y:o.y+o.h-24,w:24,h:24})*4+overlap({x:r.x,y:r.y,w:r.w,h:48},o)*4+overlap({x:r.x+r.w-24,y:r.y+r.h-24,w:24,h:24},o)*4;
    },0);}
    if(!selected.some(function(s){return overlap(current,s)>0;}) && !opening)return;
    if(score(preferred)===0){delete placements[name];return;}
    var candidates=[current,preferred],availableWidth=innerWidth-(docked()?dockWidth()+12:0);
    function clamp(value){return workspacePanelRect(value,availableWidth,innerHeight,b.top,b.bottom,b.left);}
    // In a crowded desktop, a temporary narrower/shorter window can expose
    // both windows' controls without discarding either saved floating size.
    [preferred,Object.assign({},preferred,{w:300}),Object.assign({},preferred,{h:240}),Object.assign({},preferred,{w:300,h:240})].forEach(function(size){
      var xs=[b.left,innerWidth-size.w-12-(docked()?dockWidth()+12:0)],ys=[b.top,innerHeight-b.bottom-size.h];
      selected.forEach(function(r){xs.push(r.x-size.w-12,r.x+r.w+12);ys.push(r.y-size.h-12,r.y+r.h+12);});
      other.forEach(function(r){xs.push(r.x+r.w+12,r.x-size.w-12,r.x-36);ys.push(r.y+52);});
      xs.forEach(function(x){ys.forEach(function(y){candidates.push(clamp(Object.assign({},size,{x:x,y:y})));});});
    });
    var best=candidates.reduce(function(a,r){return score(r)<score(a)?r:a;},preferred);
    placements[name]=best;
  }
  function reserveCanvas(){
    document.body.style.setProperty('--workspace-dock-width',docked()?(dockWidth()+12)+'px':'0px');
  }
  function paint(name){
    reserveCanvas();
    var win=windows[name],r=rect(name),open=prefs.windows[name].open,isDocked=docked()===name;
    win.dataset.docked=String(isDocked);
    var toggle=win.querySelector('.workspace-window-dock');toggle.textContent=isDocked?'Float':'Dock';toggle.setAttribute('aria-label',(isDocked?'Float ':'Dock ')+labels[name]+' panel');
    win.querySelector('.workspace-window-grip').disabled=isDocked;win.querySelector('.workspace-window-resize').hidden=isDocked;
    win.style.left=r.x+'px';win.style.top=r.y+'px';win.style.width=r.w+'px';win.style.height=r.h+'px';
    win.hidden=!open || hidden;panes[name].hidden=!open;
    document.dispatchEvent(new CustomEvent('workbench-tool-visibility',{detail:{name:name,open:open && !hidden}}));
    tabs[name].setAttribute('aria-pressed',String(open && !hidden));tabs[name].setAttribute('aria-expanded',String(open && !hidden));
    tabs[name].tabIndex=name===prefs.tool?0:-1;
  }
  function paintAll(){names.forEach(paint);}
  document.addEventListener('workbench-chrome-resize',paintAll);
  function front(name){prefs.tool=name;windows[name].style.zIndex=++z;names.forEach(function(n){tabs[n].tabIndex=n===name?0:-1;});}
  function focusTab(name){tabs[name].focus({preventScroll:true});tabs[name].scrollIntoView({block:'nearest',inline:'nearest'});}
  function showTool(name,options){
    if(!windows[name])return false;
    revealFreshInspect=false;
    if(hidden)setHidden(false);
    if(name==='agent' && document.getElementById('guide').hidden){prefs.windows.inspect.open=false;paint('inspect');}
    var opening=!prefs.windows[name].open;prefs.windows[name].open=true;front(name);place(name,opening);paintAll();
    var section=document.getElementById(name==='json'?'sec-source':'sec-'+name);if(section)section.open=true;
    if(options && options.focus)focusTab(name);
    persist();return true;
  }
  var fileButton=document.getElementById('workspace-file');
  if(fileButton)fileButton.addEventListener('click',function(){showTool('file',{focus:true});});
  function close(name){
    retireDock();prefs.windows[name].open=false;delete placements[name];
    names.forEach(function(n){if(prefs.windows[n].open && placements[n]){delete placements[n];place(n,true);}});
    paintAll();persist();focusTab(name);
  }
  function inspectSelection(){
    if(!revealFreshInspect)return false;
    revealFreshInspect=false;return showTool('inspect');
  }
  function retireDock(){dockRevision++;cancelAnimationFrame(dockFrame);dockFrame=0;}
  function selectionChanged(force){
    retireDock();
    cancelAnimationFrame(selectionFrame);selectionFrame=requestAnimationFrame(function(){
      var next=Array.from(document.querySelectorAll('#docview .dv-sel')).map(function(el){var section=el.closest('[data-dv-section]');return [section && section.getAttribute('data-dv-section'),el.tagName,JSON.stringify(el.dataset)];});
      var key=JSON.stringify(next);if(key===selectionKey && !force)return;selectionKey=key;
      if(prefs.windows.inspect.open && !hidden && !gesture){place('inspect',false);paint('inspect');}
    });
  }
  function finish(cancel){
    if(!gesture)return;
    var g=gesture;gesture=null;
    if(cancel){prefs.windows[g.name]=g.before;if(g.placement)placements[g.name]=g.placement;else delete placements[g.name];}
    document.body.classList.remove('workspace-dragging');document.body.style.cursor='';
    if(g.handle.hasPointerCapture(g.id))g.handle.releasePointerCapture(g.id);
    paint(g.name);if(!cancel)persist();
  }
  function begin(ev,name,kind,handle){
    if(ev.button!==0 || !ev.isPrimary || gesture || docked()===name)return;
    retireDock();ev.preventDefault();front(name);handle.focus({preventScroll:true});
    gesture={id:ev.pointerId,name:name,kind:kind,handle:handle,x:ev.clientX,y:ev.clientY,rect:rect(name),before:Object.assign({},prefs.windows[name]),placement:placements[name]};
    handle.setPointerCapture(ev.pointerId);document.body.classList.add('workspace-dragging');document.body.style.cursor=kind==='move'?'grabbing':'nwse-resize';
  }
  function move(ev){
    if(!gesture || ev.pointerId!==gesture.id)return;
    var g=gesture,r=Object.assign({},g.rect),dx=ev.clientX-g.x,dy=ev.clientY-g.y;
    if(g.kind==='move'){r.x+=dx;r.y+=dy;}else{r.w+=dx;r.h+=dy;}
    delete placements[g.name];Object.assign(prefs.windows[g.name],boundRect(r,g.name));paint(g.name);
  }
  function keyMove(ev,name,kind){
    if(ev.altKey || ev.ctrlKey || ev.metaKey || !/^Arrow(Left|Right|Up|Down)$/.test(ev.key))return;
    if(docked()===name)return;
    retireDock();ev.preventDefault();ev.stopPropagation();var r=rect(name),amount=ev.shiftKey?50:10;
    var axis=/Left|Right/.test(ev.key)?(kind==='move'?'x':'w'):(kind==='move'?'y':'h');
    r[axis]+=/Left|Up/.test(ev.key)?-amount:amount;
    delete placements[name];Object.assign(prefs.windows[name],boundRect(r,name));paint(name);persist();
  }
  names.forEach(function(name,index){
    var pane=panes[name]=document.getElementById('editor-'+name),tab=tabs[name]=document.getElementById('editor-tab-'+name);
    var win=document.createElement('section');win.className='workspace-window';win.id='workspace-window-'+name;win.setAttribute('aria-label',labels[name]);
    var head=document.createElement('div');head.className='workspace-window-header';
    var grip=document.createElement('button');grip.type='button';grip.className='workspace-window-grip';grip.textContent=labels[name];
    grip.setAttribute('aria-label','Move '+labels[name]+' panel');grip.title='Drag to move · arrow keys move · Shift moves farther';
    var hide=document.createElement('button');hide.type='button';hide.className='workspace-window-close';hide.textContent='×';hide.setAttribute('aria-label','Close '+labels[name]+' panel');
    var resize=document.createElement('button');resize.type='button';resize.className='workspace-window-resize';resize.textContent='◢';resize.setAttribute('aria-label','Resize '+labels[name]+' panel');resize.title='Drag to resize · arrow keys resize';
    var dock=document.createElement('button');dock.type='button';dock.className='workspace-window-dock';dock.title='Reserve canvas space on the right, or restore floating placement';
    dock.addEventListener('click',function(){
      retireDock();finish(true);var revision=dockRevision,anchor=document.querySelector('#docview .dv-sel'),board=anchor && anchor.closest('.explore-board'),before=board && anchor.getBoundingClientRect();
      var on=!prefs.windows[name].docked;names.forEach(function(n){delete prefs.windows[n].docked;});
      if(on)prefs.windows[name].docked=true;placements={};paintAll();persist();
      // Let the viewport's ResizeObserver finish preserving its camera first.
      dockFrame=requestAnimationFrame(function(){if(revision!==dockRevision)return;dockFrame=requestAnimationFrame(function(){
        dockFrame=0;if(revision!==dockRevision)return;
        if(before && anchor.isConnected && anchor.classList.contains('dv-sel') && board.getBoundingClientRect().width){
          var after=anchor.getBoundingClientRect(),area=board.getBoundingClientRect();
          var x=Math.max(area.left+12,Math.min(area.right-after.width-12,before.left)),y=Math.max(area.top+12,Math.min(area.bottom-after.height-12,before.top));
          board.scrollLeft+=after.left-x;board.scrollTop+=after.top-y;
        }
        selectionChanged(true);
      });});
    });
    head.append(grip,dock,hide);pane.before(win);win.append(head,pane,resize);pane.removeAttribute('role');
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
  function setHidden(on){retireDock();hidden=on;paintAll();var button=document.getElementById('workspace-panels');button.textContent=on?'Show tools':'Hide tools';button.setAttribute('aria-pressed',String(on));}
  document.getElementById('workspace-panels').addEventListener('click',function(){setHidden(!hidden);});
  document.getElementById('workspace-focus').addEventListener('click',function(){setHidden(true);});
  document.getElementById('workspace-reset').addEventListener('click',function(){
    retireDock();finish(true);placements={};names.forEach(function(name){var open=prefs.windows[name].open;prefs.windows[name]=Object.assign(defaults(name),{open:open});});paintAll();persist();
  });
  window.addEventListener('keydown',function(ev){if(ev.key==='Escape' && gesture){ev.preventDefault();ev.stopPropagation();finish(true);}},true);
  window.addEventListener('blur',function(){retireDock();finish(true);});window.addEventListener('resize',function(){retireDock();finish(true);paintAll();});
  // A deferred viewport adjustment belongs only to the Dock/Float gesture that
  // requested it. Selection, navigation, project replacement and newer canvas
  // gestures retire it before any old anchor can move the new camera.
  document.getElementById('workspace-focus-diagram').addEventListener('click',retireDock);
  var view=document.getElementById('docview');
  ['diagram-view-change','diagram-tab-change','tab-view-change','detail-navigation','workbench-view-section','pointerdown','wheel','keydown'].forEach(function(type){view.addEventListener(type,retireDock,true);});
  // A fresh editor has no selection, so keep the authored controls and panels
  // available until the user chooses a tool. Saved open windows still restore.
  var restoredDock=false;names.forEach(function(name){if(prefs.windows[name].docked){if(restoredDock)delete prefs.windows[name].docked;else restoredDock=true;}});
  front(prefs.tool);paintAll();
  var canvas=initWorkbenchCanvas({
    snapshotTools:function(){return {hidden:hidden,tool:prefs.tool,open:names.map(function(name){return prefs.windows[name].open;})};},
    restoreTools:function(state){if(!state)return;finish(true);names.forEach(function(name,index){prefs.windows[name].open=state.open[index];});front(state.tool);setHidden(state.hidden);persist();}
  });
  var controls=document.getElementById('workspace-canvas-controls');
  if(controls && typeof ResizeObserver!=='undefined'){var controlsObserver=new ResizeObserver(paintAll);controlsObserver.observe(controls);}
  var preset=document.getElementById('workspace-preset');
  function applyPreset(value){
    if(!['story','engineering','present'].includes(value))return;
    retireDock();finish(true);hidden=false;placements={};
    names.forEach(function(name){prefs.windows[name]=Object.assign(defaults(name),{open:false});});
    if(value==='story'){prefs.windows.agent.open=true;front('agent');}
    if(value==='engineering'){
      prefs.windows.brief=Object.assign(defaults('brief'),{x:bounds().left,w:350,open:true});
      if(innerWidth>=1100)prefs.windows.inspect.open=true;
      front('brief');
    }
    document.getElementById('workspace-panels').textContent='Hide tools';
    document.getElementById('workspace-panels').setAttribute('aria-pressed','false');
    document.body.dataset.workspacePreset=value;paintAll();persist();
    requestAnimationFrame(function(){canvas.fit();});
  }
  if(preset)preset.addEventListener('change',function(){applyPreset(preset.value);});

  return {setHistory:function(value){retireDock();finish(true);canvas.setHistory(value);},selectionChanged:selectionChanged,showTool:showTool,hideTool:close,inspectSelection:inspectSelection,applyPreset:applyPreset,tool:function(){return prefs.tool;},isOpen:function(name){return !!prefs.windows[name] && prefs.windows[name].open && !hidden;},canvas:canvas};
}
