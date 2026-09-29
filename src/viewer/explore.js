/* One section owns its viewing surface. Existing panels and playback DOM move
   into it. Readers keep session overrides; the workbench supplies an explicit
   commit seam for undoable authored defaults. */
/* Restore only temporary panel geometry, including a view not visited since a
   preview rebuild. This never selects the view or changes its camera. */
function restoreCanvasPanelMemory(d, memories, id, value){
  var view=id==='flow'?{id:'flow'}:diagramLayoutViews(d).find(function(v){return v.id===id;});
  if(!view)return false;
  var saved=memories[id] || (memories[id]={panels:Object.create(null),focus:false,scroll:null,zoom:null,layout:JSON.parse(JSON.stringify(view.exploreLayout || {}))});
  Object.keys(value.panels).forEach(function(key){
    if(!(d.panels || []).some(function(panel){return panel.id===key;}))return;
    saved.panels[key]=Object.assign(saved.panels[key] || {hidden:false},value.panels[key]);
  });
  if(value.prose)saved.prose=Object.assign(saved.prose || {hidden:false},value.prose);
  else delete saved.prose;
  saved.controls=value.controls?JSON.parse(JSON.stringify(value.controls)):null;
  if(value.layout){
    ['panels','prose','controls','overlayScale'].forEach(function(key){
      if(value.layout[key]===undefined)delete saved.layout[key];else saved.layout[key]=JSON.parse(JSON.stringify(value.layout[key]));
    });
  }
  return true;
}
function createSectionViewport(box, toolbar, grid, board, bar, d, boardSize, prose){
  var retired=false, active=false, expanded=false, pendingFullscreen=0,workbenchCanvas=false,readerCanvas=false;
  var author=null,scrollTimer=null,scrollEdit=null,marginX=0,marginY=0,graphPixels=0;
  var definition=null, items=[], memories=Object.create(null), otherMemories=Object.create(null), memory=null,canvasBoardHidden=false;
  var panelSource=grid;
  var moved=[], windows=[], gesture=null, z=1, zoom=null, lastWidth=0, lastHeight=0;
  var shell=document.createElement('div');shell.className='section-viewport';
  toolbar.parentNode.insertBefore(shell,toolbar);shell.appendChild(toolbar);shell.appendChild(grid);
  var stage=document.createElement('div');stage.className='explore-stage';stage.hidden=true;shell.appendChild(stage);
  var canvas=document.createElement('div');canvas.className='explore-canvas';stage.appendChild(canvas);
  var tools=document.createElement('div');tools.className='explore-tools';stage.appendChild(tools);
  var player=document.createElement('div');player.className='explore-player';stage.appendChild(player);
  var actions=document.createElement('div');actions.className='viewport-actions';toolbar.appendChild(actions);
  function button(text,action,host,cls){var b=document.createElement('button');b.type='button';b.className=cls || 'mbtn';b.textContent=text;b.addEventListener('click',action);(host || actions).appendChild(b);return b;}
  var menu=document.createElement('details');menu.className='explore-panel-menu';menu.hidden=true;
  var summary=document.createElement('summary');summary.textContent='Panels';menu.appendChild(summary);
  var choices=document.createElement('div');choices.className='explore-panel-choices';menu.appendChild(choices);actions.appendChild(menu);
  var focus=button('Hide panels',function(){memory.focus=!memory.focus;paint();});focus.hidden=true;
  var stack=button('Stack at edge',function(){var token=beginEdit(true);if(token===false)return;windows.forEach(function(w){w.state.stacked=true;w.state.hidden=false;rememberRect(w);});memory.focus=false;paint();publish(token);});stack.classList.add('explore-stack');stack.hidden=true;
  var expand=button('Expand',toggleExpanded);expand.setAttribute('aria-pressed','false');expand.setAttribute('aria-label','Expand diagram view');
  var status=document.createElement('span');status.className='viewport-status';status.setAttribute('role','status');actions.appendChild(status);
  function zoomGroup(label,cls){
    var group=document.createElement('div');group.className='explore-zoom-group '+cls;group.setAttribute('role','group');group.setAttribute('aria-label',label);
    var title=document.createElement('span');title.className='explore-zoom-title';title.textContent=label;group.appendChild(title);tools.appendChild(group);return group;
  }
  var diagramZoom=zoomGroup('Diagram','explore-diagram-zoom');
  var zoomOut=button('−',function(){changeZoom(.8);},diagramZoom);zoomOut.setAttribute('aria-label','Zoom out');
  var zoomLabel=document.createElement('span');zoomLabel.className='explore-zoom';diagramZoom.appendChild(zoomLabel);
  var zoomIn=button('+',function(){changeZoom(1.25);},diagramZoom);zoomIn.setAttribute('aria-label','Zoom in');
  button('Fit diagram',function(){fitCanvas();},diagramZoom);
  var overlayZoom=zoomGroup('Panels & controls','explore-overlay-zoom');
  var overlayOut=button('−',function(){changeOverlayScale(overlayScale()-.1);},overlayZoom);overlayOut.setAttribute('aria-label','Shrink panels and controls');
  var overlayLabel=button('100%',function(){changeOverlayScale(1);},overlayZoom,'mbtn explore-overlay-value');overlayLabel.setAttribute('aria-label','Reset panels and controls size');overlayLabel.title='Reset panels and controls to 100%';
  var overlayIn=button('+',function(){changeOverlayScale(overlayScale()+.1);},overlayZoom);overlayIn.setAttribute('aria-label','Enlarge panels and controls');
  var playerGrip=button('⠿',function(){},player,'explore-player-grip');
  playerGrip.setAttribute('aria-label','Move step controls; use arrow keys');playerGrip.title='Drag to move step controls; arrow keys also move';
  var playerResize=button('◢',function(){},player,'explore-window-resize');
  var playerWindow={el:player,panel:{type:'controls'},label:'step controls',resize:playerResize};
  playerGrip.addEventListener('pointerdown',function(ev){begin(ev,playerWindow,'move',playerGrip);});
  playerResize.addEventListener('pointerdown',function(ev){begin(ev,playerWindow,'resize',playerResize);});
  playerGrip.addEventListener('keydown',function(ev){keyboard(ev,playerWindow,'move');});
  playerResize.addEventListener('keydown',function(ev){keyboard(ev,playerWindow,'resize');});
  var legend=board.querySelector('.lg');
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function panelGeometry(value){
    var panels={};Object.keys(value.panels).forEach(function(id){var state=value.panels[id];panels[id]={x:state.x,y:state.y,w:state.w,h:state.h,stacked:state.stacked===true};});
    return {panels:panels,prose:value.prose?{x:value.prose.x,y:value.prose.y,w:value.prose.w,h:value.prose.h,stacked:value.prose.stacked===true}:null,controls:value.controls?copy(value.controls):null,layout:{panels:value.layout.panels?copy(value.layout.panels):undefined,prose:value.layout.prose?copy(value.layout.prose):undefined,controls:value.layout.controls?copy(value.layout.controls):undefined,overlayScale:value.layout.overlayScale}};
  }
  function beginEdit(panels){
    if(!active || retired)return false;
    var authored=author && (!workbenchCanvas || panels && definition.presentation==='explore');
    var token=authored?author.begin(definition.id):null;if(token===false)return false;
    return {token:token,authored:!!authored,layout:copy(memory.layout),camera:camera(),zoom:zoom,panels:workbenchCanvas && !authored && panels?panelGeometry(memory):null};
  }
  function publish(token){
    if(retired || !active || token===false)return false;
    var ok=!token.authored || !author || author.commit(definition.id,copy(memory.layout),token.token)!==false;
    if(!ok){memory.layout=token.layout;zoom=token.zoom;sizeGraph(false);positionCamera(token.camera);}
    if(ok && token.panels){var after=panelGeometry(memory);if(JSON.stringify(token.panels)!==JSON.stringify(after))shell.dispatchEvent(new CustomEvent('workbench-panel-geometry',{bubbles:true,detail:{view:definition.id,before:token.panels,after:after}}));}
    return ok;
  }
  function relative(r){var b=bounds(),out={};['x','y','w','h'].forEach(function(k){out[k]=Math.round(clamp(r[k]/(k==='x'||k==='w'?b.w:b.h),0,1)*1000000)/1000000;});return out;}
  function absolute(r){var b=bounds();return {x:r.x*b.w,y:r.y*b.h,w:r.w*b.w,h:r.h*b.h};}
  function rememberRect(w){
    var r=relative(w.state);
    if(w===playerWindow)memory.layout.controls=r;
    else if(w.prose)memory.layout.prose=Object.assign({},memory.layout.prose || {},r,{stacked:w.state.stacked===true});
    else{
      var panels=memory.layout.panels || (memory.layout.panels=[]),i=panels.findIndex(function(p){return p.panel===w.panel.id;});
      var value=Object.assign({panel:w.panel.id},r,{stacked:w.state.stacked===true});
      if(i<0)panels.push(value);else panels[i]=value;
    }
  }
  function savedWindowRect(w){return w.prose?memory.layout.prose:(memory.layout.panels || []).find(function(p){return p.panel===w.panel.id;});}
  function camera(width,height){
    var svg=board.querySelector('.boardcanvas>svg'),ratio=svg && svg.viewBox.baseVal.height/svg.viewBox.baseVal.width || 1;
    return {zoom:clamp(graphPixels/graphWidth(),.15,4),x:(board.scrollLeft+(width || board.clientWidth)/2-marginX)/(graphPixels || 1),y:(board.scrollTop+(height || board.clientHeight)/2-marginY)/((graphPixels || 1)*ratio)};
  }
  function positionCamera(c){
    var svg=board.querySelector('.boardcanvas>svg'),ratio=svg && svg.viewBox.baseVal.height/svg.viewBox.baseVal.width || 1;
    board.scrollLeft=marginX+c.x*graphPixels-board.clientWidth/2;
    board.scrollTop=marginY+c.y*graphPixels*ratio-board.clientHeight/2;
  }
  function saveCamera(token){
    if(!active || retired)return;
    // Canvas navigation lives in scroll/zoom memory. Keeping it out of the
    // authorable layout also prevents a later panel move from exporting it.
    if(!workbenchCanvas)memory.layout.camera=camera();
    publish(token);
  }
  function clearScrollEdit(){if(scrollTimer!==null)window.clearTimeout(scrollTimer);scrollTimer=null;scrollEdit=null;}
  function scrollIntent(){
    if(!active || retired || gesture)return false;
    if(!author)return true;
    if(!scrollEdit){var token=beginEdit();if(token===false)return false;scrollEdit={token:token};}
    if(scrollTimer!==null)window.clearTimeout(scrollTimer);
    scrollTimer=window.setTimeout(function(){var edit=scrollEdit;clearScrollEdit();if(active && edit && JSON.stringify(memory.layout.camera)!==JSON.stringify(camera()))saveCamera(edit.token);},250);
    return true;
  }
  function wheel(ev){
    if(!active || retired)return;
    if(!ev.ctrlKey && !ev.metaKey){scrollIntent();return;}
    ev.preventDefault();
    if(!ev.deltaY || !scrollIntent())return;
    // Pixel-mode includes trackpad pinch. Normalize line/page-mode mouse wheels.
    var delta=ev.deltaY*(ev.deltaMode===1?16:ev.deltaMode===2?board.clientHeight:1);
    zoom=clamp((graphPixels || graphWidth())/graphWidth()*Math.exp(-delta*.006),.15,4);sizeGraph(true);
  }

  function move(node,host){
    if(!node || !node.parentNode)return;
    var anchor=document.createComment('explore position');node.parentNode.insertBefore(anchor,node);
    moved.push({node:node,anchor:anchor});host.appendChild(node);
  }
  function available(w){return !w.authoredHidden && !w.card.classList.contains('panel-step-hidden');}
  function visible(w){return available(w) && !w.state.hidden && !memory.focus;}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function bounds(){return {w:stage.clientWidth,h:stage.clientHeight};}
  function fitHeight(){
    if(!active || retired)return;
    /* Stable across page scroll and refresh; no document-position feedback. */
    var styles=getComputedStyle(shell),inset=parseFloat(styles.getPropertyValue('--workspace-toolbar')) || 0;
    var fixed=parseFloat(styles.getPropertyValue('--explore-height'));
    stage.style.height=(workbenchCanvas || readerCanvas)?window.innerHeight+'px':Math.max(340,Number.isFinite(fixed) && fixed>0?fixed:window.innerHeight-inset-toolbar.getBoundingClientRect().height-36)+'px';
  }
  function minimum(w){
    /* Portrait screens can become much narrower than charts and maps. */
    return w===playerWindow?300:w.prose?220:/^(phone|deviceapp)$/.test(w.panel.type)?112:/^(screen|homemap|image)$/.test(w.panel.type)?140:128;
  }
  function overlayScale(){return memory && memory.layout.overlayScale || 1;}
  // Panel dimensions and control height describe the size at 100%. Controls
  // retain their chosen horizontal span so smaller text exposes more steps.
  // Positions stay in viewport coordinates; the diagram camera is independent.
  function scaledRect(w,r,inverse){
    var scale=overlayScale(),s=inverse?1/scale:scale,controls=w===playerWindow;
    return {x:r.x,y:r.y,w:controls?r.w:r.w*s,h:controls?r.h*s:32+(r.h-32)*s};
  }
  function changeOverlayScale(value){
    if(!active || retired || !Number.isFinite(value))return;
    value=Math.round(clamp(value,.5,1.25)*100)/100;if(value===overlayScale())return;
    finish(true);clearScrollEdit();var token=beginEdit(true);if(token===false)return;
    if(value===1)delete memory.layout.overlayScale;else memory.layout.overlayScale=value;
    paint();publish(token);paint();
    if(!retired && active)shell.dispatchEvent(new CustomEvent('explore-overlay-scale',{bubbles:true}));
  }
  function constrain(w,r){
    var b=bounds(),scale=overlayScale(),minW=Math.min(w===playerWindow?minimum(w):Math.max(96,minimum(w)*scale),Math.max(80,b.w-24));
    var minH=w===playerWindow?((parseFloat(player.style.getPropertyValue('--explore-tracks-height')) || 34)+58)*scale:32+40*scale;
    var maxW=w===playerWindow?b.w:b.w*scale,maxH=w===playerWindow?b.h*scale:32+(b.h-32)*scale;
    var width=clamp(r.w,minW,Math.max(minW,Math.min(b.w-24,maxW))),height=clamp(r.h,minH,Math.max(minH,Math.min(b.h-24,maxH)));
    return {x:clamp(r.x,12,Math.max(12,b.w-width-12)),y:clamp(r.y,12,Math.max(12,b.h-height-12)),w:width,h:height};
  }
  function apply(w,r){
    w.rect=r;Object.keys(r).forEach(function(k){w.el.style.setProperty('--float-'+k,r[k]+'px');});
    w.el.classList.toggle('explore-stacked',w.state.stacked);
    w.resize.setAttribute('aria-label','Resize '+w.label+'; use arrow keys');
  }
  function paint(){
    if(!active || retired)return;
    var b=bounds();if(!b.w || !b.h)return;
    var contentScale=overlayScale();stage.style.setProperty('--explore-overlay-scale',String(contentScale));
    overlayLabel.textContent=Math.round(contentScale*100)+'%';overlayOut.disabled=contentScale<=.5;overlayIn.disabled=contentScale>=1.25;
    var boundsChanged=b.w!==lastWidth || b.h!==lastHeight;
    var priorCamera=boundsChanged && graphPixels && lastWidth && lastHeight?camera(lastWidth,lastHeight):memory.layout.camera;
    if(boundsChanged){
      // Defaults are viewport fractions. Initial mounting and full-browser
      // promotion can both change bounds after panel DOM has been created.
      windows.forEach(function(w){var saved=savedWindowRect(w);if(saved && saved.w)Object.assign(w.state,absolute(saved));});
      if(memory.layout.controls)memory.controls=absolute(memory.layout.controls);
    }
    var stacked=windows.filter(function(w){return visible(w) && w.state.stacked;}),gap=8;
    var insetTop=workbenchCanvas?142:readerCanvas?96:12,insetBottom=workbenchCanvas?68:12;
    var total=stacked.reduce(function(n,w){return n+scaledRect(w,w.state).h;},0),room=Math.max(0,b.h-insetTop-insetBottom-gap*Math.max(0,stacked.length-1));
    var scale=Math.min(1,room/(total || 1)),y=insetTop,maxWidth=0;
    windows.forEach(function(w){
      var can=available(w),shown=visible(w);w.el.hidden=!shown;w.check.disabled=!can;w.check.checked=shown;
      w.note.textContent=w.authoredHidden?'Hidden in this view':!can?'Hidden at this step':'';
      if(!shown)return;
      var scaled=scaledRect(w,w.state),r=constrain(w,scaled);
      if(w.state.stacked){r.x=b.w-r.w-12;r.y=y;r.h=Math.max(1,scaled.h*scale);y+=r.h+gap;maxWidth=Math.max(maxWidth,r.w);}
      apply(w,r);
    });
    var chips=bar && bar.querySelector('.schips'),timeline=chips && chips.querySelector('.path-timeline,.path-matrix');
    var padding=chips?getComputedStyle(chips):null;
    var tracks=timeline?Math.min(180,Math.max(34,timeline.offsetHeight+(parseFloat(padding.paddingTop)||0)+(parseFloat(padding.paddingBottom)||0))):34;
    player.style.setProperty('--explore-tracks-height',tracks+'px');
    var controls=memory.controls;
    if(!controls){
      var height=Math.min((b.h-24)/contentScale,tracks+76),right=maxWidth && b.w-maxWidth>420?maxWidth+28:12;
      controls=workbenchCanvas?{x:84,y:b.h-height*contentScale-68,w:Math.max(300,b.w-right-84),h:height}:{x:12,y:b.h-height*contentScale-12,w:b.w-right-12,h:height};
    }
    playerWindow.state=memory.controls || Object.assign({},controls);
    apply(playerWindow,constrain(playerWindow,scaledRect(playerWindow,controls)));
    player.hidden=!bar || bar.hidden;
    focus.textContent=memory.focus?'Restore panels':'Hide panels';focus.setAttribute('aria-pressed',String(memory.focus));
    summary.textContent='Panels · '+windows.filter(visible).length;
    if(boundsChanged){lastWidth=b.w;lastHeight=b.h;sizeGraph(false);if(priorCamera)positionCamera(priorCamera);}
  }
  function graphWidth(){var svg=board.querySelector('.boardcanvas>svg');return svg && svg.viewBox && svg.viewBox.baseVal.width || 1180;}
  function sizeGraph(preserve){
    if(!active || retired || !board.clientWidth || !board.clientHeight)return;
    var prior=graphPixels?camera():null,natural=graphWidth();
    var width=zoom!==null?natural*zoom:boardSize && boardSize.mode()==='readable'?natural:board.clientWidth;
    graphPixels=clamp(width,natural*.15,natural*4);
    marginX=board.clientWidth*2;marginY=board.clientHeight*2;
    board.style.setProperty('--explore-width',graphPixels+'px');
    board.style.setProperty('--explore-margin-x',marginX+'px');board.style.setProperty('--explore-margin-y',marginY+'px');
    var svg=board.querySelector('.boardcanvas>svg'),graphHeight=svg && svg.viewBox.baseVal.width?graphPixels*svg.viewBox.baseVal.height/svg.viewBox.baseVal.width:0;
    board.style.setProperty('--explore-canvas-height',(((workbenchCanvas || readerCanvas)?Math.max(board.clientHeight,graphHeight):board.clientHeight)+2*marginY)+'px');
    board.style.setProperty('--explore-canvas-width',(Math.max(board.clientWidth,graphPixels)+2*marginX)+'px');
    zoomLabel.textContent=Math.round(graphPixels/natural*100)+'%';
    if(preserve && prior)positionCamera(prior);
    else if(preserve){if(memory.layout.camera)positionCamera(memory.layout.camera);else{board.scrollLeft=marginX;board.scrollTop=marginY;}}
  }
  function changeZoom(factor){
    if(!active || retired)return;clearScrollEdit();var token=beginEdit();if(token===false)return;
    zoom=clamp((graphPixels || graphWidth())/graphWidth()*factor,.15,4);sizeGraph(true);saveCamera(token);
  }
  function onLegendClick(ev){if(!active || retired)return;if(ev.target.closest('.board-size>.mbtn:not(.board-pan-button)')){var token=beginEdit();if(token===false)return;zoom=null;sizeGraph(true);saveCamera(token);}}
  if(legend)legend.addEventListener('click',onLegendClick);
  function raise(w){w.el.style.zIndex=String(++z);}
  function finish(cancel){
    if(!gesture)return;var g=gesture;gesture=null;
    if(g.kind==='pan'){
      if(cancel){board.scrollLeft=g.left;board.scrollTop=g.top;}
    }else{
      if(['x','y','w','h'].every(function(key){return Math.abs(g.w.rect[key]-g.rect[key])<.01;}))g.changed=false;
      if(cancel || !g.changed){Object.assign(g.w.state,g.before);if(g.w===playerWindow && g.automatic)memory.controls=null;}
      else if(g.kind==='move' && g.w!==playerWindow)g.w.state.stacked=g.w.rect.x+g.w.rect.w>=stage.clientWidth-36;
      paint();
    }
    if(g.handle.hasPointerCapture && g.handle.hasPointerCapture(g.id))g.handle.releasePointerCapture(g.id);
    shell.classList.remove('viewport-gesturing');
    if(!cancel && g.changed){
      if(g.kind==='pan')saveCamera(g.token);
      else{rememberRect(g.w);if(!publish(g.token)){Object.assign(g.w.state,g.before);if(g.w===playerWindow && g.automatic)memory.controls=null;paint();}}
    }
  }
  function begin(ev,w,kind,handle){
    if(!active || ev.button!==0 || gesture)return;
    ev.preventDefault();ev.stopPropagation();handle.focus({preventScroll:true});
    /* Leaving an Inspector field can synchronously rebuild this viewport. */
    if(retired || !active || !handle.isConnected)return;
    clearScrollEdit();var token=beginEdit(true);if(token===false)return;
    raise(w);
    var before=Object.assign({},w.state),r=Object.assign({},w.rect),automatic=w===playerWindow && !memory.controls;
    if(w===playerWindow)memory.controls=w.state=scaledRect(w,r,true);
    gesture={w:w,kind:kind,handle:handle,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,rect:r,before:before,token:token,automatic:automatic};
    handle.setPointerCapture(ev.pointerId);shell.classList.add('viewport-gesturing');
  }
  function pointerMove(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;
    var scale=stage.offsetWidth?stage.getBoundingClientRect().width/stage.offsetWidth:1;
    var dx=(ev.clientX-g.startX)/(scale || 1),dy=(ev.clientY-g.startY)/(scale || 1);g.changed=g.changed || Math.abs(dx)+Math.abs(dy)>2;
    if(g.kind==='pan'){board.scrollLeft=g.left-dx;board.scrollTop=g.top-dy;return;}
    if(g.kind==='move')Object.assign(g.w.state,scaledRect(g.w,constrain(g.w,{x:g.rect.x+dx,y:g.rect.y+dy,w:g.rect.w,h:g.rect.h}),true),{stacked:false});
    else Object.assign(g.w.state,scaledRect(g.w,constrain(g.w,{x:g.rect.x,y:g.rect.y,w:g.rect.w+(g.before.stacked?-dx:dx),h:g.rect.h+dy}),true));
    paint();
  }
  function keyboard(ev,w,kind){
    var dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},dir=dirs[ev.key];if(!dir)return;
    var token=beginEdit(true);if(token===false)return;
    ev.preventDefault();ev.stopPropagation();raise(w);
    var before=Object.assign({},w.state),r=Object.assign({},w.rect),automatic=w===playerWindow && !memory.controls;
    if(w===playerWindow)memory.controls=w.state=scaledRect(w,w.rect,true);
    var n=ev.shiftKey?24:8;
    if(kind==='resize')Object.assign(w.state,scaledRect(w,constrain(w,{x:r.x,y:r.y,w:r.w+dir[0]*n,h:r.h+dir[1]*n}),true));
    else Object.assign(w.state,scaledRect(w,constrain(w,{x:r.x+dir[0]*n,y:r.y+dir[1]*n,w:r.w,h:r.h}),true),{stacked:false});
    paint();
    if(['x','y','w','h'].every(function(key){return Math.abs(w.rect[key]-r[key])<.01;})){
      Object.assign(w.state,before);if(automatic)memory.controls=null;paint();return;
    }
    rememberRect(w);publish(token);
  }
  function floatingWindow(card,panel,it,notes){
    var label=notes?'Section notes':panel.title || panel.id;
    var saved=notes?memory.layout.prose:(memory.layout.panels || []).find(function(p){return p.panel===panel.id;});
    var state=notes?memory.prose:memory.panels[panel.id];
    if(!state){
      state=saved && saved.w?Object.assign(absolute(saved),{stacked:saved.stacked===true,hidden:false}):{x:12,y:12,w:notes?320:220,h:notes?280:panel.type==='homemap'?250:220,stacked:!(saved && saved.stacked===false),hidden:false};
      if(notes)memory.prose=state;else memory.panels[panel.id]=state;
    }
    var el=document.createElement('article');el.className='explore-window'+(notes?' explore-prose-window':'');
    el.setAttribute(notes?'data-explore-content':'data-explore-panel',notes?'prose':panel.id);el.setAttribute('aria-label',label);
    var header=document.createElement('div');header.className='explore-window-header';el.appendChild(header);
    var grip=button(label,function(){},header,'explore-window-grip');grip.title='Drag to move; arrow keys to move; drop at the right edge to stack';grip.setAttribute('aria-label','Move '+label+'; use arrow keys');
    var hide=button('×',function(){state.hidden=true;paint();summary.focus();},header,'explore-window-hide');hide.setAttribute('aria-label','Hide '+label);
    var body=document.createElement('div');body.className='explore-window-body';el.appendChild(body);move(card,body);
    var resize=button('◢',function(){},el,'explore-window-resize');resize.title='Drag to resize; arrow keys to resize';stage.appendChild(el);
    var choice=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),note=document.createElement('small');
    check.type='checkbox';text.textContent=label;choice.appendChild(check);choice.appendChild(text);choice.appendChild(note);choices.appendChild(choice);
    var w={el:el,card:card,panel:panel,prose:!!notes,label:label,state:state,grip:grip,resize:resize,check:check,note:note,authoredHidden:!!it.hidden};
    check.addEventListener('change',function(){state.hidden=!check.checked;if(check.checked)memory.focus=false;paint();});
    grip.addEventListener('pointerdown',function(ev){begin(ev,w,'move',grip);});resize.addEventListener('pointerdown',function(ev){begin(ev,w,'resize',resize);});
    grip.addEventListener('keydown',function(ev){keyboard(ev,w,'move');});resize.addEventListener('keydown',function(ev){keyboard(ev,w,'resize');});
    el.addEventListener('pointerdown',function(){raise(w);});el.addEventListener('focusin',function(){raise(w);});
    windows.push(w);
  }
  var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){if(gesture)finish(true);paint();}):null;
  if(observer)observer.observe(stage);
  var visibilityObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){paint();}):null;
  var graphObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){sizeGraph(true);}):null;
  var tracksObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){paint();}):null;
  function enter(){
    if(active || !definition || !workbenchCanvas && definition.presentation!=='explore')return;
    active=true;memory=memories[definition.id] || (memories[definition.id]={panels:Object.create(null),focus:false,scroll:null,zoom:null,layout:copy(definition.exploreLayout || {})});
    zoom=memory.zoom!==null?memory.zoom:memory.layout.camera?memory.layout.camera.zoom:null;
    stage.hidden=false;grid.hidden=true;shell.classList.add('viewport-explore');menu.hidden=focus.hidden=stack.hidden=false;
    var cards=Array.prototype.slice.call(panelSource.querySelectorAll('.pwidget[data-dv-panel]'));
    if(bar)move(bar,player);move(board,canvas);if(legend)move(legend,tools);
    board.classList.add('explore-board');if(workbenchCanvas)board.hidden=false;fitHeight();
    cards.forEach(function(card){var index=Number(card.getAttribute('data-dv-panel')),panel=d.panels[index],it=items.find(function(v){return v.panel===panel.id;}) || {};floatingWindow(card,panel,it,false);if(visibilityObserver)visibilityObserver.observe(card,{attributes:true,attributeFilter:['class']});});
    if(prose){prose.setFloating(true);floatingWindow(prose.proseEl,null,memory.layout.prose || {},true);}
    if(visibilityObserver && bar)visibilityObserver.observe(bar,{attributes:true,attributeFilter:['hidden']});
    if(graphObserver)graphObserver.observe(board.querySelector('.boardcanvas'),{childList:true});
    if(tracksObserver && bar)tracksObserver.observe(bar.querySelector('.schips'),{childList:true,subtree:true});
    fitHeight();if(memory.controls===undefined)memory.controls=memory.layout.controls?absolute(memory.layout.controls):null;
    lastWidth=lastHeight=graphPixels=0;paint();sizeGraph(false);
    // A reader view can enter at page size before becoming full-browser. Restore the
    // graph-relative center; raw scroll offsets describe the old viewport.
    if(memory.scroll){if(memory.scroll.camera)positionCamera(memory.scroll.camera);else{board.scrollLeft=memory.scroll.x;board.scrollTop=memory.scroll.y;}}
    else if(memory.layout.camera)positionCamera(memory.layout.camera);
    else{board.scrollLeft=marginX;board.scrollTop=marginY;}
  }
  function leave(){
    if(!active)return;clearScrollEdit();finish(true);
    if(graphPixels && board.clientWidth && board.clientHeight){memory.scroll={x:board.scrollLeft,y:board.scrollTop,camera:readerCanvas?camera(lastWidth,lastHeight):undefined};memory.zoom=zoom;}active=false;
    if(visibilityObserver)visibilityObserver.disconnect();if(graphObserver)graphObserver.disconnect();if(tracksObserver)tracksObserver.disconnect();
    moved.slice().reverse().forEach(function(rec){if(rec.anchor.parentNode)rec.anchor.parentNode.replaceChild(rec.node,rec.anchor);});moved=[];
    if(prose)prose.setFloating(false);
    windows.forEach(function(w){w.el.remove();});windows=[];choices.replaceChildren();menu.open=false;
    stage.hidden=true;grid.hidden=false;if(workbenchCanvas)board.hidden=canvasBoardHidden;board.classList.remove('explore-board');['--explore-width','--explore-margin-x','--explore-margin-y','--explore-canvas-height','--explore-canvas-width'].forEach(function(k){board.style.removeProperty(k);});
    shell.classList.remove('viewport-explore');menu.hidden=focus.hidden=stack.hidden=true;
  }
  function isFullscreen(){return document.fullscreenElement===shell;}
  function setExpanded(value){expanded=value;shell.classList.toggle('viewport-expanded',value);expand.textContent=value?'Exit expanded view':'Expand';expand.setAttribute('aria-label',value?'Exit expanded diagram view':'Expand diagram view');expand.setAttribute('aria-pressed',String(value));paint();}
  function exitExpanded(){
    pendingFullscreen++;setExpanded(false);status.textContent='';
    if(isFullscreen() && document.exitFullscreen){var result=document.exitFullscreen();if(result && result.catch)result.catch(function(){});}
    if(!retired)expand.focus({preventScroll:true});
  }
  function toggleExpanded(){if(expanded)exitExpanded();else enterExpanded();}
  function enterExpanded(){
    setExpanded(true);
    var token=++pendingFullscreen;
    function failed(){if(retired || token!==pendingFullscreen)return;status.textContent='Expanded in this page. Browser fullscreen is unavailable.';}
    try{
      if(!shell.requestFullscreen){failed();return;}
      var promise=shell.requestFullscreen();if(promise && promise.then)promise.then(function(){if(retired || token!==pendingFullscreen){if(isFullscreen() && document.exitFullscreen)document.exitFullscreen().catch(function(){});}},failed);
    }catch(_){failed();}
  }
  function fullscreenChanged(){if(!isFullscreen() && expanded){setExpanded(false);status.textContent='';}}
  function keydown(ev){
    if(ev.key!=='Escape')return;
    if(gesture){ev.preventDefault();ev.stopPropagation();finish(true);}
    else if(menu.open){ev.preventDefault();ev.stopPropagation();menu.open=false;summary.focus();}
    else if(expanded){ev.preventDefault();ev.stopPropagation();exitExpanded();}
  }
  function scrollKey(ev){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].indexOf(ev.key)>=0 && ev.target===board)scrollIntent();}
  function cancel(){finish(true);}
  function pointerEnd(ev){if(gesture && ev.pointerId===gesture.id && (ev.buttons&1)===0)finish(false);}
  function pointerCancel(ev){if(gesture && ev.pointerId===gesture.id)finish(true);}
  function captureLost(ev){
    if(!gesture || ev.pointerId!==gesture.id)return;
    // A host can consume pointerup or release capture outside the viewport.
    // Primary button released means the drag completed. Pointercancel/blur/
    // Escape still cancel first; losing capture while held also cancels.
    finish((ev.buttons&1)!==0);
  }
  function resized(){cancel();fitHeight();paint();}
  function panStart(ev){
    if(!active || ev.button!==0 || gesture || ev.target.closest('a,button,input,select,textarea,[role="button"],[data-dv-node],[data-dv-step],[data-dv-edge],[data-dv-group],[data-dv-row]'))return;
    clearScrollEdit();var token=beginEdit();if(token===false)return;
    ev.preventDefault();gesture={token:token,kind:'pan',handle:board,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,left:board.scrollLeft,top:board.scrollTop};board.setPointerCapture(ev.pointerId);shell.classList.add('viewport-gesturing');
  }
  shell.addEventListener('pointermove',pointerMove);shell.addEventListener('pointerup',pointerEnd);shell.addEventListener('pointercancel',pointerCancel);shell.addEventListener('lostpointercapture',captureLost);shell.addEventListener('keydown',keydown);
  window.addEventListener('pointerup',pointerEnd,true);
  board.addEventListener('wheel',wheel,{passive:false});board.addEventListener('keydown',scrollKey);
  board.addEventListener('pointerdown',panStart);window.addEventListener('blur',cancel);window.addEventListener('resize',resized);document.addEventListener('fullscreenchange',fullscreenChanged);
  function fitCanvas(insets){
      if(!active)return;insets=insets || (workbenchCanvas?{left:84,right:24,top:145,bottom:180}:{left:24,right:windows.length?260:24,top:108,bottom:180});
      insets=Object.assign({},insets);
      windows.filter(visible).forEach(function(win){var r=win.rect;if(!r)return;
        if(r.x<board.clientWidth/2)insets.left=Math.max(insets.left,Math.min(board.clientWidth*.4,r.x+r.w+16));
        else insets.right=Math.max(insets.right,Math.min(board.clientWidth*.4,board.clientWidth-r.x+16));
      });
      var natural=graphWidth(),svg=board.querySelector('.boardcanvas>svg'),ratio=svg && svg.viewBox.baseVal.width?svg.viewBox.baseVal.height/svg.viewBox.baseVal.width:1;
      var w=Math.max(240,board.clientWidth-insets.left-insets.right),h=Math.max(200,board.clientHeight-insets.top-insets.bottom);
      zoom=clamp(Math.min(w/natural,h/(natural*ratio),1.5),.15,4);sizeGraph(false);
      board.scrollLeft=marginX+graphPixels/2-(insets.left+w/2);board.scrollTop=marginY+graphPixels*ratio/2-(insets.top+h/2);
  }
  return {
    isWorkbenchCanvas:function(){return workbenchCanvas;},
    setBoardHidden:function(hidden){canvasBoardHidden=hidden;board.hidden=workbenchCanvas?false:hidden;},
    isExplore:function(){return active;},
    revealProse:function(){
      if(!active)return false;var w=windows.find(function(item){return item.prose;});
      if(!w || !available(w))return false;
      w.state.hidden=false;memory.focus=false;paint();return true;
    },
    viewDefinition:function(){return definition;},
    setReaderCanvas:function(on){readerCanvas=on;shell.classList.toggle('viewer-diagram-canvas',on);fitHeight();paint();},
    setWorkbenchCanvas:function(on){
      if(retired || workbenchCanvas===on)return;
      leave();if(on)canvasBoardHidden=board.hidden;var previous=memories;memories=otherMemories;otherMemories=previous;workbenchCanvas=on;shell.classList.toggle('workbench-diagram-canvas',on);
      if(!definition)definition={id:'flow',presentation:'standard'};
      enter();
    },
    canvasZoom:function(value){if(value==null)return graphPixels/graphWidth();zoom=clamp(value,.15,4);sizeGraph(true);},
    overlayScale:overlayScale,setOverlayScale:changeOverlayScale,
    fitCanvas:fitCanvas,
    setView:function(view,tiles,sourceGrid){leave();definition=view;items=tiles || [];panelSource=sourceGrid || grid;var fresh=!memories[view.id];enter();if(workbenchCanvas && fresh)shell.dispatchEvent(new CustomEvent('workbench-canvas-view',{bubbles:true}));shell.dispatchEvent(new CustomEvent('diagram-view-change',{bubbles:true}));},
    setArranging:function(value){shell.classList.toggle('viewport-arranging',!!value);},
    setAuthor:function(value){if(!value){clearScrollEdit();finish(true);}author=value;},
    adoptLayout:function(id,value){
      if(retired || !active || !author || definition.id!==id)return false;
      var normalized=sectionExploreLayout(d,value);
      if(JSON.stringify(normalized)!==JSON.stringify(sectionExploreLayout(d,memory.layout)))return false;
      definition.exploreLayout=copy(normalized);return true;
    },
    reset:function(){
      if(!active)return;var token=beginEdit();if(token===false)return;
      var id=definition.id,defaults=memory.layout.prose && memory.layout.prose.hidden?{prose:{hidden:true}}:{};leave();delete memories[id];
      var previous=definition;definition=Object.assign({},definition,{exploreLayout:defaults});enter();definition=previous;publish(token);
    },
    scrollTarget:function(){return active?stage:grid;},
    refresh:resized,
    snapshotCanvasState:function(){
      if(workbenchCanvas && active && graphPixels && board.clientWidth && board.clientHeight){memory.scroll={x:board.scrollLeft,y:board.scrollTop,camera:readerCanvas?camera(lastWidth,lastHeight):undefined};memory.zoom=zoom;}
      return copy(workbenchCanvas?memories:otherMemories);
    },
    restoreCanvasState:function(saved){
      if(workbenchCanvas){leave();memories=Object.assign(Object.create(null),copy(saved));enter();}
      else otherMemories=Object.assign(Object.create(null),copy(saved));
    },
    restoreCanvasPanelGeometry:function(id,value){
      if(retired)return false;
      finish(true);
      if(!restoreCanvasPanelMemory(d,workbenchCanvas?memories:otherMemories,id,value))return false;
      if(workbenchCanvas && active && definition.id===id)paint();
      return true;
    },
    snapshotReaderState:function(){
      if(active && graphPixels && board.clientWidth && board.clientHeight){memory.scroll={x:board.scrollLeft,y:board.scrollTop,camera:readerCanvas?camera(lastWidth,lastHeight):undefined};memory.zoom=zoom;}
      return {memories:copy(workbenchCanvas?otherMemories:memories),canvasMemories:copy(workbenchCanvas?memories:otherMemories),expanded:expanded,fullscreen:isFullscreen(),stageHeight:stage.style.height,menuOpen:menu.open};
    },
    restoreReaderState:function(saved){
      if(!saved || retired)return;
      leave();
      memories=Object.assign(Object.create(null),copy((workbenchCanvas?saved.canvasMemories:saved.memories) || {}));
      otherMemories=Object.assign(Object.create(null),copy((workbenchCanvas?saved.memories:saved.canvasMemories) || {}));
      Object.keys(memories).forEach(function(id){memories[id].panels=Object.assign(Object.create(null),memories[id].panels);});
      enter();
      if(!saved.expanded){if(expanded)exitExpanded();}
      else if(saved.fullscreen){if(!isFullscreen())enterExpanded();else setExpanded(true);}
      else {
        var token=++pendingFullscreen;setExpanded(true);
        if(isFullscreen() && document.exitFullscreen){
          var result=document.exitFullscreen();
          if(result && result.then)result.then(function(){if(!retired && pendingFullscreen===token)setExpanded(true);},function(){});
        }
      }
      stage.style.height=saved.stageHeight;paint();
      menu.open=saved.menuOpen;
    },
    suspend:leave,
    destroy:function(){if(retired)return;retired=true;pendingFullscreen++;leave();if(isFullscreen() && document.exitFullscreen){var p=document.exitFullscreen();if(p && p.catch)p.catch(function(){});}if(observer)observer.disconnect();if(visibilityObserver)visibilityObserver.disconnect();if(graphObserver)graphObserver.disconnect();if(tracksObserver)tracksObserver.disconnect();clearScrollEdit();author=null;if(legend)legend.removeEventListener('click',onLegendClick);board.removeEventListener('pointerdown',panStart);board.removeEventListener('wheel',wheel);board.removeEventListener('keydown',scrollKey);window.removeEventListener('pointerup',pointerEnd,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',resized);document.removeEventListener('fullscreenchange',fullscreenChanged);}
  };
}
