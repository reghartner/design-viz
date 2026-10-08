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
  if(value.canvasPanels)saved.canvasPanels=JSON.parse(JSON.stringify(value.canvasPanels));else delete saved.canvasPanels;
  saved.controls=value.controls?JSON.parse(JSON.stringify(value.controls)):null;
  if(value.layout){
    ['panels','prose','controls','overlayScale','prosePlacement','controlsPlacement','panelPlacement','panelPlacements','canvas'].forEach(function(key){
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
  var moved=[], windows=[], gesture=null, selectedCanvasWindow=null, z=1, zoom=null, fitFloor=null, lastWidth=0, lastHeight=0;
  var shell=document.createElement('div');shell.className='section-viewport';
  toolbar.parentNode.insertBefore(shell,toolbar);shell.appendChild(toolbar);shell.appendChild(grid);
  var stage=document.createElement('div');stage.className='explore-stage';stage.hidden=true;shell.appendChild(stage);
  var canvas=document.createElement('div');canvas.className='explore-canvas';stage.appendChild(canvas);
  var objectLayer=document.createElement('div');objectLayer.className='explore-canvas-objects';
  var tools=document.createElement('div');tools.className='explore-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','Explore sizing and zoom');stage.appendChild(tools);
  var player=document.createElement('div');player.className='explore-player';stage.appendChild(player);
  player.setAttribute('data-dv-step-controls','');player.setAttribute('role','group');
  var actions=document.createElement('div');actions.className='viewport-actions';toolbar.appendChild(actions);
  function button(text,action,host,cls){var b=document.createElement('button');b.type='button';b.className=cls || 'mbtn';b.textContent=text;b.addEventListener('click',action);(host || actions).appendChild(b);return b;}
  var menu=document.createElement('details');menu.className='explore-panel-menu';menu.hidden=false;
  var summary=document.createElement('summary');summary.textContent='Panels';menu.appendChild(summary);
  var choices=document.createElement('div');choices.className='explore-panel-choices';menu.appendChild(choices);actions.appendChild(menu);
  var legendMenu=document.createElement('details');legendMenu.className='explore-legend-menu';legendMenu.hidden=false;
  var legendSummary=document.createElement('summary');legendSummary.textContent='Legend';legendMenu.appendChild(legendSummary);
  var legendItems=document.createElement('div');legendItems.className='lg explore-edge-legend';legendItems.setAttribute('role','group');legendItems.setAttribute('aria-label','Edge legend');legendMenu.appendChild(legendItems);actions.appendChild(legendMenu);
  var panelBody=document.createElement('div');panelBody.className='explore-panel-body';menu.appendChild(panelBody);panelBody.appendChild(choices);
  var placementLabel=document.createElement('label');placementLabel.className='explore-placement';placementLabel.textContent='Default placement';
  var placement=document.createElement('select');placement.setAttribute('aria-label','Default panel placement');
  [['floating','Floating'],['canvas','On canvas']].forEach(function(pair){var option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];placement.appendChild(option);});
  placementLabel.appendChild(placement);panelBody.appendChild(placementLabel);
  var placementHint=document.createElement('small');placementHint.className='explore-placement-hint';placementHint.textContent='Default applies to panels without overrides.';placementLabel.appendChild(placementHint);placementLabel.hidden=true;placement.addEventListener('change',function(){changePlacement(placement.value);});
  var focus=button('Hide panels',function(){memory.focus=!memory.focus;paint();});focus.hidden=true;
  var stack=button('Stack at edge',function(){var token=beginEdit(true);if(token===false)return;windows.filter(function(w){return available(w) && !canvasWindow(w);}).forEach(function(w){w.state.stacked=true;setWindowHidden(w,false);w.state.automatic=false;rememberRect(w);});memory.focus=false;paint();publish(token);});stack.classList.add('explore-stack');stack.hidden=true;
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
  var fitButton=button('Fit diagram',function(){fitCanvas();},diagramZoom);
  var overlayZoom=zoomGroup('Panels & controls','explore-overlay-zoom');
  var overlayOut=button('−',function(){changeOverlayScale(sizingScale()-.1);},overlayZoom);overlayOut.setAttribute('aria-label','Shrink panels and controls');
  var overlayLabel=button('100%',function(){changeOverlayScale(1);},overlayZoom,'mbtn explore-overlay-value');overlayLabel.setAttribute('aria-label','Reset panels and controls size');overlayLabel.title='Reset panels and controls to 100%';
  var overlayIn=button('+',function(){changeOverlayScale(sizingScale()+.1);},overlayZoom);overlayIn.setAttribute('aria-label','Enlarge panels and controls');
  panelBody.appendChild(focus);panelBody.appendChild(stack);panelBody.appendChild(overlayZoom);
  if(document.getElementById('workspace-canvas')){button('Saved visibility…',function(){var chapter=box.querySelector('.section-view-options');if(chapter){chapter.open=true;menu.open=false;chapter.querySelector('summary').focus();}},panelBody);}
  var playerGrip=button('⠿',function(){},player,'explore-player-grip');
  playerGrip.setAttribute('aria-label','Move step controls; use arrow keys');playerGrip.title='Drag to move step controls; arrow keys also move';
  var playerResize=button('◢',function(){},player,'explore-window-resize');
  var playerWindow={el:player,panel:{type:'controls'},label:'step controls',resize:playerResize};
  var controlsPlacementLabel=document.createElement('label');controlsPlacementLabel.className='explore-placement';controlsPlacementLabel.textContent='Step controls';controlsPlacementLabel.hidden=true;
  var controlsPlacement=document.createElement('select');controlsPlacement.setAttribute('aria-label','Step controls placement');
  [['floating','Floating'],['canvas','On canvas']].forEach(function(pair){var option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];controlsPlacement.appendChild(option);});
  controlsPlacementLabel.appendChild(controlsPlacement);panelBody.appendChild(controlsPlacementLabel);
  controlsPlacement.addEventListener('change',function(){changePlacement(controlsPlacement.value,playerWindow);});
  player.addEventListener('pointerdown',function(){if(canvasWindow(playerWindow))selectCanvasWindow(playerWindow);});
  player.addEventListener('focusin',function(){if(canvasWindow(playerWindow))selectCanvasWindow(playerWindow);});
  playerGrip.addEventListener('pointerdown',function(ev){begin(ev,playerWindow,'move',playerGrip);});
  playerResize.addEventListener('pointerdown',function(ev){begin(ev,playerWindow,'resize',playerResize);});
  playerGrip.addEventListener('keydown',function(ev){keyboard(ev,playerWindow,'move');});
  playerResize.addEventListener('keydown',function(ev){keyboard(ev,playerWindow,'resize');});
  var legend=board.querySelector('.lg');
  if(legend)Array.prototype.slice.call(legend.querySelectorAll('.li')).forEach(function(item){legendItems.appendChild(item);});
  function syncTools(){
    // Every reader Explore surface shares the compact row. Workbench canvas
    // controls have their own owner, so its panel sizing stays in the menu.
    if(active && (!workbenchCanvas || readerCanvas)){shell.insertBefore(tools,stage);tools.appendChild(overlayZoom);}
    else{stage.appendChild(tools);panelBody.appendChild(overlayZoom);}
  }
  function standardPanels(){
    if(active)return;choices.replaceChildren();summary.textContent='Panels';overlayZoom.hidden=true;placementLabel.hidden=true;
    Array.prototype.forEach.call(panelSource.querySelectorAll('.pwidget[data-dv-panel]'),function(card){var index=Number(card.getAttribute('data-dv-panel')),panel=d.panels[index];if(!panel)return;var label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!card.hidden;check.addEventListener('change',function(){card.hidden=!check.checked;});label.appendChild(check);var title=document.createElement('span');title.textContent=panel.title || panel.id;label.appendChild(title);choices.appendChild(label);});
    if(prose){var label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');check.type='checkbox';check.checked=!prose.collapsed;text.textContent='Section notes';check.addEventListener('change',function(){setProseCollapsed(prose,!check.checked,false,window);});label.appendChild(check);label.appendChild(text);choices.appendChild(label);}
  }
  menu.addEventListener('toggle',function(){if(menu.open && !active)standardPanels();});
  standardPanels();
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function panelGeometry(value){
    var panels={};Object.keys(value.panels).forEach(function(id){var state=value.panels[id];panels[id]={x:state.x,y:state.y,w:state.w,h:state.h,stacked:state.stacked===true};});
    return {panels:panels,canvasPanels:value.canvasPanels?copy(value.canvasPanels):undefined,prose:value.prose?{x:value.prose.x,y:value.prose.y,w:value.prose.w,h:value.prose.h,stacked:value.prose.stacked===true}:null,controls:value.controls?copy(value.controls):null,layout:{panels:value.layout.panels?copy(value.layout.panels):undefined,prose:value.layout.prose?copy(value.layout.prose):undefined,controls:value.layout.controls?copy(value.layout.controls):undefined,overlayScale:value.layout.overlayScale,prosePlacement:value.layout.prosePlacement,controlsPlacement:value.layout.controlsPlacement,panelPlacement:value.layout.panelPlacement,panelPlacements:value.layout.panelPlacements?copy(value.layout.panelPlacements):undefined,canvas:value.layout.canvas?copy(value.layout.canvas):undefined}};
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
    // Once a notes rectangle is authored, preserve it just like a reopened file.
    if(ok && token.authored && memory.layout.canvas && memory.layout.canvas.prose && memory.canvasPanels && memory.canvasPanels.prose)memory.canvasPanels.prose.automatic=false;
    if(ok && token.panels){var after=panelGeometry(memory);if(JSON.stringify(token.panels)!==JSON.stringify(after))shell.dispatchEvent(new CustomEvent('workbench-panel-geometry',{bubbles:true,detail:{view:definition.id,before:token.panels,after:after}}));}
    return ok;
  }
  // Old specs retain their initial notes placement until an explicit placement edit.
  function windowPlacement(w){
    if(w===playerWindow)return memory.layout.controlsPlacement || 'floating';
    if(w.prose)return memory.layout.prosePlacement || memory.layout.panelPlacement || 'floating';
    var override=(memory.layout.panelPlacements || []).find(function(p){return p.panel===w.panel.id;});
    return override?override.placement:memory.layout.panelPlacement || 'floating';
  }
  function canvasWindow(w){return windowPlacement(w)==='canvas';}
  function canvasSizing(w){return canvasWindow(w) && !w.prose?w.canvasSizing:null;}
  // Workbench queries placement for Standard views too, before any Explore
  // memory exists and after a canvas view has left its player state behind.
  function onCanvas(){return active && (canvasWindow(playerWindow) || windows.some(canvasWindow));}
  function hasFloatingPanels(){return windows.some(function(w){return !w.prose && !canvasWindow(w);});}
  function hasFloating(){return windows.some(function(w){return !canvasWindow(w);});}
  function canvasWindowLabel(w,selected){var label=w.label+(w===playerWindow?' on canvas':' canvas panel');return selected?label+', selected':'Select '+label;}
  function syncCanvasWindow(w){
    var mode=canvasWindow(w),selected=mode && selectedCanvasWindow===w,sizing=mode && w.canvasSizing;
    w.el.classList.toggle('explore-canvas-selected',selected);
    if(mode){w.el.tabIndex=0;w.el.setAttribute('aria-label',canvasWindowLabel(w,selected));}
    else{w.el.removeAttribute('tabindex');w.el.setAttribute('aria-label',w.label);}
    w.resize.title=sizing && sizing.mode==='fixed-aspect'?'Drag vertically or horizontally; visual proportions stay fixed and panel height fits content':sizing?'Drag vertically or horizontally; height fits content from its width':'Drag to resize; arrow keys to resize';
    if(selected)w.el.setAttribute('aria-current','true');else w.el.removeAttribute('aria-current');
  }
  function selectCanvasWindow(w){
    if(w && (!active || !canvasWindow(w) || !visible(w)))w=null;
    if(selectedCanvasWindow===w)return;
    var previous=selectedCanvasWindow;selectedCanvasWindow=w;
    if(previous)syncCanvasWindow(previous);
    if(w){syncCanvasWindow(w);raise(w);}
  }
  // Notes retain readable text and independent geometry when panels are scaled.
  // Dormant canvas controls sizing must never resize floating panel content.
  function windowScale(w){return w.prose?1:w===playerWindow?overlayScale():floatingOverlayScale();}
  function zoomFloor(){
    if(!onCanvas())return workbenchCanvas && fitFloor!==null?Math.min(.15,fitFloor):.15;
    var extent=canvasExtent();return Math.min(.15,200/Math.max(1,extent.w),200/Math.max(1,extent.h),fitFloor===null?4:fitFloor);
  }
  function graphScale(){return graphPixels/graphWidth() || 1;}
  function graphRect(r){return {x:r.x,y:r.y,w:r.w,h:r.h};}
  function canvasState(w,index){
    var states=memory.canvasPanels || (memory.canvasPanels=Object.create(null)),key=w===playerWindow?'controls':w.prose?'prose':'panel:'+w.panel.id;
    if(!states[key]){
      var layout=memory.layout.canvas || {},saved=w===playerWindow?layout.controls:w.prose?layout.prose:(layout.panels || []).find(function(p){return p.panel===w.panel.id;});
      // Floating panels do not consume a canvas slot before new notes.
      var slot=w.prose?windows.filter(function(item){return !item.prose && canvasWindow(item);}).length:index;
      states[key]=Object.assign(saved?graphRect(saved):w===playerWindow?{x:0,y:Math.min(10000,(board.querySelector('.boardcanvas>svg').viewBox.baseVal.height || 800)+40),w:720,h:220}:{x:Math.min(10000,graphWidth()+40+Math.floor(slot/3)*380),y:(slot%3)*330,w:340,h:300},{hidden:w.state && w.state.hidden,stacked:false,automatic:w.prose && !saved});
    }
    return states[key];
  }
  function setWindowHidden(w,value){
    w.state.hidden=value;
    var floating=w.prose?memory.prose:memory.panels[w.panel.id];if(floating)floating.hidden=value;
    var canvas=memory.canvasPanels && memory.canvasPanels[w.prose?'prose':'panel:'+w.panel.id];if(canvas)canvas.hidden=value;
  }
  function mountWindows(){
    selectCanvasWindow(null);
    if(contentObserver)contentObserver.disconnect();
    windows.forEach(function(w,index){
      var mode=canvasWindow(w);
      w.state=mode?canvasState(w,index):(w.prose?memory.prose:memory.panels[w.panel.id]);
      if(!mode){var saved=savedWindowRect(w);if(saved && saved.w)Object.assign(w.state,absolute(saved));}
      (mode?objectLayer:stage).appendChild(w.el);
      if(w.placement)w.placement.value=mode?'canvas':'floating';
      syncCanvasWindow(w);
      if(contentObserver && mode && w.canvasSizing)contentObserver.observe(w.card);
    });
    var canvasControls=canvasWindow(playerWindow);
    if(!canvasControls && memory.layout.controls)memory.controls=absolute(memory.layout.controls);
    playerWindow.state=canvasControls?canvasState(playerWindow,0):memory.controls;
    (canvasControls?objectLayer:stage).appendChild(player);
    controlsPlacement.value=canvasControls?'canvas':'floating';controlsPlacementLabel.hidden=false;
    syncCanvasWindow(playerWindow);
    var mode=onCanvas(),controlsOnly=mode && !hasFloatingPanels();
    placement.value=memory.layout.panelPlacement || 'floating';placementLabel.hidden=false;stack.hidden=!hasFloating();
    fitButton.textContent=mode?'Fit canvas':'Fit diagram';
    overlayZoom.hidden=canvasControls && !hasFloatingPanels();
    overlayZoom.querySelector('.explore-zoom-title').textContent=canvasControls?'Floating panels':controlsOnly?'Controls':mode?'Floating panels & controls':'Panels & controls';
    overlayOut.setAttribute('aria-label',canvasControls?'Shrink floating panels':controlsOnly?'Shrink controls':'Shrink panels and controls');overlayIn.setAttribute('aria-label',canvasControls?'Enlarge floating panels':controlsOnly?'Enlarge controls':'Enlarge panels and controls');
    overlayLabel.setAttribute('aria-label',canvasControls?'Reset floating panels size':controlsOnly?'Reset controls size':'Reset panels and controls size');overlayLabel.title=canvasControls?'Reset floating panels to 100%':controlsOnly?'Reset controls to 100%':'Reset panels and controls to 100%';
  }
  function changePlacement(value,w){
    if(!active || retired || (w?windowPlacement(w):memory.layout.panelPlacement || 'floating')===value)return;
    finish(true);clearScrollEdit();var token=beginEdit(true);if(token===false){mountWindows();return;}
    selectCanvasWindow(null);var firstCanvas=value==='canvas' && (!onCanvas() || w===playerWindow && !(memory.layout.canvas && memory.layout.canvas.controls));
    // Capture the legacy fallback before changing any panel/default placement.
    // Persist it with the same edit so a preview rebuild cannot move notes.
    if(prose && memory.layout.prosePlacement===undefined)memory.layout.prosePlacement=memory.layout.panelPlacement || 'floating';
    if(w===playerWindow){
      if(!canvasWindow(w) && !memory.layout.controls)rememberRect(w);
      memory.layout.controlsPlacement=value;
    }else if(w && w.prose){
      if(!canvasWindow(w) && !(memory.layout.prose && memory.layout.prose.w))rememberRect(w);
      memory.layout.prosePlacement=value;
    }else if(w){
      var placements=memory.layout.panelPlacements || (memory.layout.panelPlacements=[]),index=placements.findIndex(function(p){return p.panel===w.panel.id;}),entry={panel:w.panel.id,placement:value};
      if(index<0)placements.push(entry);else placements[index]=entry;
    }else memory.layout.panelPlacement=value;
    mountWindows();paint();sizeGraph(true);if(firstCanvas)fitCanvas();
    windows.concat([playerWindow]).filter(canvasWindow).forEach(rememberRect);
    if(!publish(token)){mountWindows();paint();}
    shell.dispatchEvent(new CustomEvent('explore-placement-change',{bubbles:true}));
  }
  function relative(r){var b=bounds(),out={};['x','y','w','h'].forEach(function(k){out[k]=Math.round(clamp(r[k]/(k==='x'||k==='w'?b.w:b.h),0,1)*1000000)/1000000;});return out;}
  function absolute(r){var b=bounds();return {x:r.x*b.w,y:r.y*b.h,w:r.w*b.w,h:r.h*b.h};}
  function rememberRect(w){
    // Geometry is stored at 100% logical size. Preserve the effective scale
    // that was visible when a responsive default first becomes authored or a
    // reader session first customizes it, so the gesture cannot change size.
    if(canvasWindow(w)){
      var layout=memory.layout.canvas || (memory.layout.canvas={}),r=graphRect(w.state);
      if(w===playerWindow)layout.controls=r;
      else if(w.prose)layout.prose=r;
      else{var panels=layout.panels || (layout.panels=[]),i=panels.findIndex(function(p){return p.panel===w.panel.id;}),value=Object.assign({panel:w.panel.id},r);if(i<0)panels.push(value);else panels[i]=value;}
      return;
    }
    latchOverlayScale();
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
    return {zoom:clamp(graphPixels/graphWidth(),.001,4),x:(board.scrollLeft+(width || board.clientWidth)/2-marginX)/(graphPixels || 1),y:(board.scrollTop+(height || board.clientHeight)/2-marginY)/((graphPixels || 1)*ratio)};
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
    if(!onCanvas()){zoom=clamp(graphScale()*Math.exp(-delta*.006),.15,4);sizeGraph(true);return;}
    var r=board.getBoundingClientRect(),px=ev.clientX-r.left,py=ev.clientY-r.top,scale=graphScale();
    var point={x:(board.scrollLeft+px-marginX)/scale,y:(board.scrollTop+py-marginY)/scale};
    zoom=clamp(scale*Math.exp(-delta*.006),zoomFloor(),4);sizeGraph(false);
    board.scrollLeft=marginX+point.x*graphScale()-px;board.scrollTop=marginY+point.y*graphScale()-py;
  }

  function move(node,host){
    if(!node || !node.parentNode)return;
    var anchor=document.createComment('explore position');node.parentNode.insertBefore(anchor,node);
    moved.push({node:node,anchor:anchor});host.appendChild(node);
  }
  function available(w){if(w===playerWindow)return !!bar || !!player.querySelector('.playback-mode-rail');return !w.authoredHidden && !w.card.classList.contains('panel-step-hidden');}
  function visible(w){if(w===playerWindow)return available(w);return available(w) && !w.state.hidden && !memory.focus;}
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
  function savedOverlayGeometry(layout){
    return !!(layout && (layout.controls && layout.controls.w || layout.prose && layout.prose.w || layout.panels && layout.panels.length));
  }
  function responsiveOverlayScale(){
    var width=bounds().w;
    // Compact stages need the controls' full logical height; scaling their
    // outer dock can otherwise clip the step text below the transport rows.
    if(!width || width<800)return 1;
    return Math.round((.8+.2*clamp((width-1280)/160,0,1))*100)/100;
  }
  function floatingOverlayScale(){
    if(!memory)return 1;
    if(memory.layout.overlayScale!==undefined)return memory.layout.overlayScale;
    return savedOverlayGeometry(memory.layout)?1:responsiveOverlayScale();
  }
  function overlayScale(){return onCanvas() && memory.layout.canvas && memory.layout.canvas.controlsScale!==undefined?memory.layout.canvas.controlsScale:floatingOverlayScale();}
  function sizingScale(){return hasFloatingPanels()?floatingOverlayScale():overlayScale();}
  function latchOverlayScale(){if(memory.layout.overlayScale===undefined && !savedOverlayGeometry(memory.layout))memory.layout.overlayScale=floatingOverlayScale();}
  // Panel dimensions and control height describe the size at 100%. Controls
  // retain their chosen horizontal span so smaller text exposes more steps.
  // Positions stay in viewport coordinates; the diagram camera is independent.
  function scaledRect(w,r,inverse){
    if(canvasWindow(w))return graphRect(r);
    var scale=windowScale(w),s=inverse?1/scale:scale,controls=w===playerWindow;
    return {x:r.x,y:r.y,w:controls?r.w:r.w*s,h:controls?r.h*s:32+(r.h-32)*s};
  }
  function changeOverlayScale(value){
    if(!active || retired || !Number.isFinite(value))return;
    var explicit=onCanvas() && !hasFloatingPanels()?memory.layout.canvas && memory.layout.canvas.controlsScale:memory.layout.overlayScale;
    value=Math.round(clamp(value,.5,1.25)*100)/100;if(value===sizingScale() && value===overlayScale() && explicit===value)return;
    finish(true);clearScrollEdit();var token=beginEdit(true);if(token===false)return;
    if(onCanvas() && !canvasWindow(playerWindow)){var canvasLayout=memory.layout.canvas || (memory.layout.canvas={});canvasLayout.controlsScale=value;}
    if(!onCanvas() || hasFloatingPanels())memory.layout.overlayScale=value;
    paint();publish(token);paint();
    if(!retired && active)shell.dispatchEvent(new CustomEvent('explore-overlay-scale',{bubbles:true}));
  }
  function constrain(w,r){
    if(canvasWindow(w))return {x:clamp(r.x,-10000,10000),y:clamp(r.y,-10000,10000),w:clamp(r.w,minimum(w),10000),h:clamp(r.h,72,10000)};
    var b=bounds(),scale=windowScale(w),minW=Math.min(w===playerWindow?minimum(w):Math.max(96,minimum(w)*scale),Math.max(80,b.w-24));
    var minH=w===playerWindow?((parseFloat(player.style.getPropertyValue('--explore-tracks-height')) || 34)+58)*scale:32+40*scale;
    var maxW=w===playerWindow?b.w:b.w*scale,maxH=w===playerWindow?b.h*scale:32+(b.h-32)*scale;
    var width=clamp(r.w,minW,Math.max(minW,Math.min(b.w-24,maxW))),height=clamp(r.h,minH,Math.max(minH,Math.min(b.h-24,maxH)));
    return {x:clamp(r.x,12,Math.max(12,b.w-width-12)),y:clamp(r.y,12,Math.max(12,b.h-height-12)),w:width,h:height};
  }
  function stackInsets(){
    var canvasTools=workbenchCanvas && document.getElementById('workspace-canvas-controls'),toolRect=canvasTools && canvasTools.getBoundingClientRect();
    return {top:12,bottom:workbenchCanvas?Math.max(68,toolRect?stage.getBoundingClientRect().bottom-toolRect.top+12:68):12};
  }
  function apply(w,r){
    w.rect=r;Object.keys(r).forEach(function(k){w.el.style.setProperty('--float-'+k,r[k]+'px');});
    w.el.classList.toggle('explore-stacked',w.state.stacked);
    var sizing=canvasSizing(w),instruction=sizing && sizing.mode==='fixed-aspect'?'; visual proportions stay fixed; panel height fits content':sizing?'; height fits content from its width':'';
    w.resize.setAttribute('aria-label','Resize '+w.label+instruction+'; use arrow keys');
  }
  function fittedCanvasRect(w,r){
    var sizing=canvasSizing(w);if(!sizing)return r;
    // Probe at the authored width. Fitted cards opt out of the usual 100%
    // minimum height, so scrollHeight is intrinsic rendered content rather
    // than the stale saved rectangle.
    apply(w,r);
    var height=Math.ceil(w.card.scrollHeight);
    if(!Number.isFinite(height) || height<=0)return r;
    return {x:r.x,y:r.y,w:r.w,h:clamp(height,72,Number.isFinite(sizing.maxHeight)?Math.max(72,sizing.maxHeight):10000)};
  }
  function sizeAutomaticWindow(w){
    if(!w.state.automatic)return;
    var b=bounds(),scale=windowScale(w),type=w.prose?'prose':w.panel.type;
    var preferred=w.prose && canvasWindow(w)?440:/^(screen|homemap|image)$/.test(type)?340:/^(prose|phone|deviceapp)$/.test(type)?320:300;
    var logicalWidth=Math.min(preferred,Math.max(96,(b.w-24)/scale));
    // Probe at the preferred width so the default follows rendered content.
    // A short second pass absorbs scrollbar wrapping and font rounding.
    w.state.w=logicalWidth;w.state.h=72;
    apply(w,constrain(w,scaledRect(w,w.state)));
    var contentHeight=Math.ceil(w.body.scrollHeight),insets=stackInsets(),laneHeight=Math.max(72,b.h-insets.top-insets.bottom);
    var logicalMax=32+Math.max(40,laneHeight-32)/scale;
    w.state.h=Math.min(logicalMax,Math.max(72,(canvasWindow(w)?2:44)+contentHeight));
    apply(w,constrain(w,scaledRect(w,w.state)));
    var overflow=Math.ceil(w.body.scrollHeight-w.body.clientHeight);
    if(overflow>0)w.state.h=Math.min(logicalMax,w.state.h+overflow);
    // Pristine notes keep fitting fluid type through viewport changes.
    // Gestures and authored rectangles leave automatic sizing explicitly.
  }
  function paint(){
    if(!active || retired)return;
    var b=bounds();if(!b.w || !b.h)return;
    if(selectedCanvasWindow && (!canvasWindow(selectedCanvasWindow) || !visible(selectedCanvasWindow)))selectCanvasWindow(null);
    var contentScale=overlayScale();player.style.setProperty('--explore-overlay-scale',String(canvasWindow(playerWindow)?1:contentScale));stage.style.setProperty('--explore-overlay-scale',String(contentScale));
    var textPosition=memory.layout.steps && memory.layout.steps.textPosition || 'below';
    player.setAttribute('data-step-text-position',textPosition);
    player.setAttribute('data-explore-layout',definition.id);
    var sizing=sizingScale();overlayLabel.textContent=Math.round(sizing*100)+'%';overlayOut.disabled=sizing<=.5;overlayIn.disabled=sizing>=1.25;
    var boundsChanged=b.w!==lastWidth || b.h!==lastHeight;
    var priorCamera=boundsChanged && graphPixels && lastWidth && lastHeight?camera(lastWidth,lastHeight):memory.layout.camera;
    if(boundsChanged){
      // Defaults are viewport fractions. Initial mounting and full-browser
      // promotion can both change bounds after panel DOM has been created.
      windows.forEach(function(w){if(canvasWindow(w))return;var saved=savedWindowRect(w);if(saved && saved.w)Object.assign(w.state,absolute(saved));});
      if(memory.layout.controls)memory.controls=absolute(memory.layout.controls);
    }
    // State changes can replace panel content without changing the viewport.
    // Reveal before measuring so a panel hidden during the last paint can use
    // its current content and the current stage bounds.
    windows.forEach(function(w){w.el.style.setProperty('--explore-overlay-scale',String(canvasWindow(w)?1:windowScale(w)));if(w.state.automatic && visible(w)){w.el.hidden=false;sizeAutomaticWindow(w);}});
    var stacked=windows.filter(function(w){return !canvasWindow(w) && visible(w) && w.state.stacked;}),gap=8,canvasGeometryChanged=false;
    var insets=stackInsets(),insetTop=insets.top,insetBottom=insets.bottom;
    var stackBottom=Math.max(insetTop,b.h-insetBottom),laneHeight=Math.max(0,stackBottom-insetTop),columnRight=b.w-12,columnWidth=0,y=insetTop,stackLeft=b.w;
    var stackRects=new Map();
    stacked.forEach(function(w){
      var r=constrain(w,scaledRect(w,w.state));
      // Never compress a panel to fit the lane. An oversized panel owns a
      // top-aligned column (and may overflow below); the next panel wraps left.
      if(y>insetTop && (r.h>laneHeight || y+r.h>stackBottom)){columnRight-=columnWidth+gap;columnWidth=0;y=insetTop;}
      r.x=columnRight-r.w;r.y=y;stackRects.set(w,r);
      y+=r.h+gap;columnWidth=Math.max(columnWidth,r.w);stackLeft=Math.min(stackLeft,r.x);
    });
    var maxWidth=stacked.length?b.w-stackLeft:0;
    windows.forEach(function(w){
      var can=available(w),shown=visible(w);w.el.hidden=!shown;w.check.disabled=!can;w.check.checked=shown;
      w.note.textContent=w.authoredHidden?'Hidden in this view':!can?'Hidden at this step':'';
      if(!shown)return;
      var previous=w.rect,scaled=scaledRect(w,w.state),r=w.state.stacked?stackRects.get(w):constrain(w,scaled);
      if(canvasWindow(w))r=fittedCanvasRect(w,r);
      if(canvasWindow(w) && previous && ['x','y','w','h'].some(function(key){return Math.abs(previous[key]-r[key])>.01;}))canvasGeometryChanged=true;
      apply(w,r);
    });
    var chips=bar && bar.querySelector('.schips'),timeline=chips && chips.querySelector('.path-timeline,.path-matrix');
    var padding=chips?getComputedStyle(chips):null;
    var tracks=timeline?Math.min(180,Math.max(34,timeline.offsetHeight+(parseFloat(padding.paddingTop)||0)+(parseFloat(padding.paddingBottom)||0))):34;
    player.style.setProperty('--explore-tracks-height',tracks+'px');
    var controls=canvasWindow(playerWindow)?canvasState(playerWindow,0):memory.controls;
    if(!controls){
      var right=maxWidth && b.w-maxWidth>420?maxWidth+28:12,controlWidth=workbenchCanvas?Math.max(300,b.w-right-84):b.w-right-12;
      var height=Math.min((b.h-24)/contentScale,tracks+112+(Math.min(b.w-24,controlWidth*contentScale)<560?64:0));
      controls=workbenchCanvas?{x:84,y:b.h-height*contentScale-insetBottom,w:controlWidth,h:height}:{x:12,y:b.h-height*contentScale-12,w:controlWidth,h:height};
    }
    playerWindow.state=canvasWindow(playerWindow)?controls:memory.controls || Object.assign({},controls);
    apply(playerWindow,constrain(playerWindow,scaledRect(playerWindow,controls)));
    player.hidden=!bar && !player.querySelector('.playback-mode-rail');
    player.classList.toggle('player-ambient',!!bar && bar.hidden);
    focus.textContent=memory.focus?'Restore panels':'Hide panels';focus.setAttribute('aria-pressed',String(memory.focus));
    summary.textContent='Panels · '+windows.filter(visible).length;
    if(boundsChanged){lastWidth=b.w;lastHeight=b.h;sizeGraph(false);if(priorCamera)positionCamera(priorCamera);}
    else if(canvasGeometryChanged && graphPixels && !gesture)sizeGraph(true);
  }
  function graphWidth(){var svg=board.querySelector('.boardcanvas>svg');return svg && svg.viewBox && svg.viewBox.baseVal.width || 1180;}
  function sizeGraph(preserve){
    if(!active || retired || !board.clientWidth || !board.clientHeight)return;
    var prior=graphPixels?camera():null,natural=graphWidth();
    var width=zoom!==null?natural*zoom:boardSize && boardSize.mode()==='readable'?natural:board.clientWidth;
    graphPixels=clamp(width,natural*zoomFloor(),natural*4);
    var extent=canvasExtent();
    marginX=Math.max(board.clientWidth*2,-extent.x*graphScale()+board.clientWidth);marginY=Math.max(board.clientHeight*2,-extent.y*graphScale()+board.clientHeight);
    objectLayer.style.transform='translate('+marginX+'px,'+marginY+'px) scale('+graphScale()+')';
    board.style.setProperty('--explore-width',graphPixels+'px');
    board.style.setProperty('--explore-margin-x',marginX+'px');board.style.setProperty('--explore-margin-y',marginY+'px');
    var svg=board.querySelector('.boardcanvas>svg'),graphHeight=svg && svg.viewBox.baseVal.width?graphPixels*svg.viewBox.baseVal.height/svg.viewBox.baseVal.width:0;
    board.style.setProperty('--explore-canvas-height',(((workbenchCanvas || readerCanvas || onCanvas())?Math.max(board.clientHeight,graphHeight,(extent.y+extent.h)*graphScale()):board.clientHeight)+2*marginY)+'px');
    board.style.setProperty('--explore-canvas-width',(Math.max(board.clientWidth,graphPixels,(extent.x+extent.w)*graphScale())+2*marginX)+'px');
    var percent=graphPixels/natural*100;zoomLabel.textContent=(percent<1?Math.round(percent*100)/100:Math.round(percent))+'%';
    if(preserve && prior)positionCamera(prior);
    else if(preserve){if(memory.layout.camera)positionCamera(memory.layout.camera);else{board.scrollLeft=marginX;board.scrollTop=marginY;}}
  }
  function changeZoom(factor){
    if(!active || retired)return;clearScrollEdit();var token=beginEdit();if(token===false)return;
    zoom=clamp((graphPixels || graphWidth())/graphWidth()*factor,zoomFloor(),4);sizeGraph(true);saveCamera(token);
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
      paint();
    }
    if(g.handle.hasPointerCapture && g.handle.hasPointerCapture(g.id))g.handle.releasePointerCapture(g.id);
    shell.classList.remove('viewport-gesturing');
    if(!cancel && g.changed){
      if(g.kind==='pan')saveCamera(g.token);
      else{g.w.state.automatic=false;rememberRect(g.w);if(canvasWindow(g.w))sizeGraph(true);if(!publish(g.token)){Object.assign(g.w.state,g.before);if(g.w===playerWindow && g.automatic)memory.controls=null;paint();}}
    }
  }
  function begin(ev,w,kind,handle){
    if(!active || ev.button!==0 || gesture)return;
    ev.preventDefault();ev.stopPropagation();handle.focus({preventScroll:true});
    /* Leaving an Inspector field can synchronously rebuild this viewport. */
    if(retired || !active || !handle.isConnected)return;
    clearScrollEdit();var token=beginEdit(true);if(token===false)return;
    raise(w);
    var before=Object.assign({},w.state),r=Object.assign({},w.rect),automatic=w===playerWindow && !canvasWindow(w) && !memory.controls;
    if(w===playerWindow && !canvasWindow(w))memory.controls=w.state=scaledRect(w,r,true);
    else w.state.automatic=false;
    gesture={w:w,kind:kind,handle:handle,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,rect:r,before:before,token:token,automatic:automatic};
    handle.setPointerCapture(ev.pointerId);shell.classList.add('viewport-gesturing');
  }
  function pointerMove(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;
    var scale=stage.offsetWidth?stage.getBoundingClientRect().width/stage.offsetWidth:1;
    var dx=(ev.clientX-g.startX)/(scale || 1),dy=(ev.clientY-g.startY)/(scale || 1);g.changed=g.changed || Math.abs(dx)+Math.abs(dy)>2;
    if(g.kind==='pan'){board.scrollLeft=g.left-dx;board.scrollTop=g.top-dy;return;}
    if(canvasWindow(g.w)){dx/=graphScale();dy/=graphScale();}
    var sizing=canvasSizing(g.w);
    if(g.kind==='move'){
      var moved=scaledRect(g.w,constrain(g.w,{x:g.rect.x+dx,y:g.rect.y+dy,w:g.rect.w,h:g.rect.h}),true);if(sizing)moved.h=g.before.h;
      Object.assign(g.w.state,moved,{stacked:false});
    }
    else if(sizing && sizing.resizeAxis==='width'){
      var vertical=dy*(Number.isFinite(sizing.aspect) && sizing.aspect>0?sizing.aspect:1),delta=Math.abs(dx)>=Math.abs(vertical)?dx:vertical;
      Object.assign(g.w.state,scaledRect(g.w,constrain(g.w,{x:g.rect.x,y:g.rect.y,w:g.rect.w+delta,h:g.rect.h}),true));
    }else Object.assign(g.w.state,scaledRect(g.w,constrain(g.w,{x:g.rect.x,y:g.rect.y,w:g.rect.w+(g.before.stacked?-dx:dx),h:g.rect.h+dy}),true));
    paint();
    if(g.kind==='resize' && sizing)g.w.state.h=g.w.rect.h;
  }
  function keyboard(ev,w,kind){
    var dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},dir=dirs[ev.key];if(!dir)return;
    var token=beginEdit(true);if(token===false)return;
    ev.preventDefault();ev.stopPropagation();raise(w);
    var before=Object.assign({},w.state),r=Object.assign({},w.rect),automatic=w===playerWindow && !canvasWindow(w) && !memory.controls;
    if(w===playerWindow && !canvasWindow(w))memory.controls=w.state=scaledRect(w,w.rect,true);
    else w.state.automatic=false;
    var n=(ev.shiftKey?24:8)/(canvasWindow(w)?graphScale():1);
    var sizing=canvasSizing(w);
    if(kind==='resize' && sizing && sizing.resizeAxis==='width'){
      var delta=(dir[0] || dir[1]*(Number.isFinite(sizing.aspect) && sizing.aspect>0?sizing.aspect:1))*n;
      Object.assign(w.state,scaledRect(w,constrain(w,{x:r.x,y:r.y,w:r.w+delta,h:r.h}),true));
    }else if(kind==='resize')Object.assign(w.state,scaledRect(w,constrain(w,{x:r.x,y:r.y,w:r.w+dir[0]*n,h:r.h+dir[1]*n}),true));
    else{
      var moved=scaledRect(w,constrain(w,{x:r.x+dir[0]*n,y:r.y+dir[1]*n,w:r.w,h:r.h}),true);if(sizing)moved.h=before.h;
      Object.assign(w.state,moved,{stacked:false});
    }
    paint();
    if(kind==='resize' && sizing)w.state.h=w.rect.h;
    if(['x','y','w','h'].every(function(key){return Math.abs(w.rect[key]-r[key])<.01;})){
      Object.assign(w.state,before);if(automatic)memory.controls=null;paint();return;
    }
    w.state.automatic=false;rememberRect(w);if(canvasWindow(w))sizeGraph(true);publish(token);
  }
  function floatingWindow(card,panel,it,notes){
    var label=notes?'Section notes':panel.title || panel.id;
    var saved=notes?memory.layout.prose:(memory.layout.panels || []).find(function(p){return p.panel===panel.id;});
    var state=notes?memory.prose:memory.panels[panel.id];
    if(!state){
      state=saved && saved.w?Object.assign(absolute(saved),{stacked:saved.stacked===true,hidden:false,automatic:false}):{x:12,y:12,w:300,h:72,stacked:!(saved && saved.stacked===false),hidden:false,automatic:true};
      if(notes)memory.prose=state;else memory.panels[panel.id]=state;
    }
    var el=document.createElement('article');el.className='explore-window'+(notes?' explore-prose-window':'');
    el.setAttribute(notes?'data-explore-content':'data-explore-panel',notes?'prose':panel.id);el.setAttribute('aria-label',label);
    var header=document.createElement('div');header.className='explore-window-header';el.appendChild(header);
    var grip=button(label,function(){},header,'explore-window-grip');grip.title='Drag to move; arrow keys to move';grip.setAttribute('aria-label','Move '+label+'; use arrow keys');
    var hide=button('×',function(){selectCanvasWindow(null);setWindowHidden(w,true);paint();summary.focus();},header,'explore-window-hide');hide.setAttribute('aria-label','Hide '+label);
    var body=document.createElement('div');body.className='explore-window-body';el.appendChild(body);move(card,body);
    var sizing=!notes && panelCapability(panel.type,'canvasSizing',null);
    var resize=button('◢',function(){},el,'explore-window-resize');resize.title='Drag to resize; arrow keys to resize';stage.appendChild(el);
    var choice=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),note=document.createElement('small');
    check.type='checkbox';text.textContent=label;choice.appendChild(check);choice.appendChild(text);choice.appendChild(note);choices.appendChild(choice);
    var w={el:el,body:body,card:card,panel:panel,prose:!!notes,label:label,state:state,grip:grip,resize:resize,check:check,note:note,authoredHidden:!!it.hidden,canvasSizing:sizing};
    if(sizing)el.setAttribute('data-explore-canvas-sizing',sizing.mode);
    {
      var row=document.createElement('div');row.className='explore-panel-choice';choice.replaceWith(row);row.appendChild(choice);
      var placementLabel=document.createElement('label');placementLabel.className='explore-placement';placementLabel.textContent='Placement';
      var select=document.createElement('select');select.setAttribute('aria-label','Placement for '+label);
      [['floating','Floating'],['canvas','On canvas']].forEach(function(pair){var option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];select.appendChild(option);});
      placementLabel.appendChild(select);row.appendChild(placementLabel);w.placement=select;
      select.addEventListener('change',function(){changePlacement(select.value,w);});
      if(notes){var hint=document.createElement('div');hint.className='explore-placement-hint explore-notes-size-hint';hint.textContent='Section notes ignore Panels & controls sizing. Resize the notes window.';row.appendChild(hint);}
    }
    check.addEventListener('change',function(){setWindowHidden(w,!check.checked);if(check.checked)memory.focus=false;paint();});
    grip.addEventListener('pointerdown',function(ev){begin(ev,w,'move',grip);});resize.addEventListener('pointerdown',function(ev){begin(ev,w,'resize',resize);});
    grip.addEventListener('keydown',function(ev){keyboard(ev,w,'move');});resize.addEventListener('keydown',function(ev){keyboard(ev,w,'resize');});
    el.addEventListener('pointerdown',function(){if(canvasWindow(w))selectCanvasWindow(w);else raise(w);});
    el.addEventListener('focusin',function(){if(canvasWindow(w))selectCanvasWindow(w);else raise(w);});
    windows.push(w);
  }
  var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){if(gesture)finish(true);paint();}):null;
  var contentObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){if(active && !gesture)paint();}):null;
  if(observer)observer.observe(stage);
  // Panel renderers replace body children after step/state changes. Observe
  // those replacements and card visibility; paint only changes outer-window
  // styles, so this callback cannot observe itself.
  var visibilityObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){paint();}):null;
  var graphObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){sizeGraph(true);}):null;
  var tracksObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){paint();}):null;
  // Font metrics can settle after the first rendered measurement without a
  // DOM mutation or stage resize. Remeasure automatic windows once the active
  // font set is ready and after later font loads; authored/manual sizes ignore
  // this paint because their automatic flag is false.
  var fontSet=document.fonts;
  function fontsSettled(){if(active && !retired)paint();}
  function settleFonts(){if(fontSet && fontSet.ready)fontSet.ready.then(fontsSettled);}
  if(fontSet && fontSet.addEventListener)fontSet.addEventListener('loadingdone',fontsSettled);
  function paintBoardVisibility(){
    // The canvas also owns panels and playback. Hide only its graph while
    // Explore is active, leaving those authored objects and navigation usable.
    board.hidden=active?false:canvasBoardHidden;
    board.classList.toggle('authored-diagram-hidden',active && canvasBoardHidden);
  }
  function enter(){
    if(active || !definition || !workbenchCanvas && definition.presentation!=='explore')return;
    if(boardSize && boardSize.suspend)boardSize.suspend();
    active=true;choices.replaceChildren();memory=memories[definition.id] || (memories[definition.id]={panels:Object.create(null),focus:false,scroll:null,zoom:null,layout:copy(definition.exploreLayout || {})});
    zoom=memory.zoom!==null?memory.zoom:memory.layout.camera?memory.layout.camera.zoom:null;
    fitFloor=memory.fitFloor!==undefined?memory.fitFloor:memory.layout.camera?memory.layout.camera.zoom:null;
    stage.hidden=false;grid.hidden=true;shell.classList.add('viewport-explore');menu.hidden=focus.hidden=stack.hidden=false;
    var cards=Array.prototype.slice.call(panelSource.querySelectorAll('.pwidget[data-dv-panel]'));
    var modeRail=box.querySelector('.playback-mode-rail');if(modeRail)move(modeRail,player);
    if(bar)move(bar,player);move(board,canvas);board.querySelector('.boardcanvas').appendChild(objectLayer);if(legend)move(legend,tools);overlayZoom.hidden=false;syncTools();
    // Reuse the rendered samples so protocol overrides, skins and response
    // dashes stay identical to Standard. The move anchors restore them on leave.
    legendMenu.hidden=false;
    board.classList.add('explore-board');paintBoardVisibility();fitHeight();
    cards.forEach(function(card){var index=Number(card.getAttribute('data-dv-panel')),panel=d.panels[index],it=items.find(function(v){return v.panel===panel.id;}) || {};floatingWindow(card,panel,it,false);if(visibilityObserver)visibilityObserver.observe(card,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});});
    if(prose){prose.setFloating(true);floatingWindow(prose.proseEl,null,memory.layout.prose || {},true);}
    mountWindows();
    if(visibilityObserver && bar)visibilityObserver.observe(bar,{attributes:true,attributeFilter:['hidden']});
    if(graphObserver)graphObserver.observe(board.querySelector('.boardcanvas'),{childList:true});
    if(tracksObserver && bar)tracksObserver.observe(bar.querySelector('.schips'),{childList:true,subtree:true});
    fitHeight();if(memory.controls===undefined)memory.controls=memory.layout.controls?absolute(memory.layout.controls):null;
    lastWidth=lastHeight=graphPixels=0;paint();sizeGraph(false);settleFonts();
    // A reader view can enter at page size before becoming full-browser. Restore the
    // graph-relative center; raw scroll offsets describe the old viewport.
    if(memory.scroll){if(memory.scroll.camera)positionCamera(memory.scroll.camera);else{board.scrollLeft=memory.scroll.x;board.scrollTop=memory.scroll.y;}}
    else if(memory.layout.camera)positionCamera(memory.layout.camera);
    else{board.scrollLeft=marginX;board.scrollTop=marginY;}
  }
  function leave(holdNavigation){
    // Composition temporarily reparents the board through hidden grids. Keep
    // the regular camera suspended until the destination layout is mounted.
    if(holdNavigation && boardSize && boardSize.suspend)boardSize.suspend();
    if(!active)return;clearScrollEdit();finish(true);selectCanvasWindow(null);
    if(graphPixels && board.clientWidth && board.clientHeight){memory.scroll={x:board.scrollLeft,y:board.scrollTop,camera:readerCanvas || workbenchCanvas?camera(lastWidth,lastHeight):undefined};memory.zoom=zoom;memory.fitFloor=fitFloor;}active=false;
    if(visibilityObserver)visibilityObserver.disconnect();if(graphObserver)graphObserver.disconnect();if(tracksObserver)tracksObserver.disconnect();if(contentObserver)contentObserver.disconnect();
    moved.slice().reverse().forEach(function(rec){if(rec.anchor.parentNode)rec.anchor.parentNode.replaceChild(rec.node,rec.anchor);});moved=[];
    if(prose)prose.setFloating(false);
    stage.appendChild(player);controlsPlacementLabel.hidden=true;objectLayer.remove();windows.forEach(function(w){w.el.remove();});windows=[];choices.replaceChildren();menu.open=false;legendMenu.open=false;legendMenu.hidden=false;
    stage.hidden=true;grid.hidden=false;board.hidden=canvasBoardHidden;board.classList.remove('explore-board','authored-diagram-hidden');player.removeAttribute('data-explore-layout');player.removeAttribute('data-step-text-position');['--explore-width','--explore-margin-x','--explore-margin-y','--explore-canvas-height','--explore-canvas-width'].forEach(function(k){board.style.removeProperty(k);});
    shell.classList.remove('viewport-explore');syncTools();menu.hidden=false;focus.hidden=stack.hidden=true;standardPanels();
    if(!holdNavigation && boardSize && boardSize.resume)boardSize.resume();
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
    else if(legendMenu.open){ev.preventDefault();ev.stopPropagation();legendMenu.open=false;legendSummary.focus();}
    else if(menu.open){ev.preventDefault();ev.stopPropagation();menu.open=false;summary.focus();}
    else if(expanded){ev.preventDefault();ev.stopPropagation();exitExpanded();}
    else if(selectedCanvasWindow){ev.preventDefault();ev.stopPropagation();selectCanvasWindow(null);}
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
    if(!active || ev.button!==0 || gesture || ev.target.closest('.explore-window,.explore-player,a,button,input,select,textarea,[role="button"],[data-dv-node],[data-dv-step],[data-dv-edge],[data-dv-group],[data-dv-row]'))return;
    clearScrollEdit();var token=beginEdit();if(token===false)return;
    ev.preventDefault();gesture={token:token,kind:'pan',handle:board,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,left:board.scrollLeft,top:board.scrollTop};board.setPointerCapture(ev.pointerId);shell.classList.add('viewport-gesturing');
  }
  function clearCanvasSelection(ev){
    if(!selectedCanvasWindow || ev.button!==0)return;
    var r=board.getBoundingClientRect();
    if(ev.clientX<r.left || ev.clientX>r.right || ev.clientY<r.top || ev.clientY>r.bottom)return;
    if(!ev.target.closest('.explore-window,.explore-player,.explore-tools,a,button,input,select,textarea,[role="button"],[data-dv-node],[data-dv-step],[data-dv-edge],[data-dv-group],[data-dv-row]'))selectCanvasWindow(null);
  }
  shell.addEventListener('pointermove',pointerMove);shell.addEventListener('pointerup',pointerEnd);shell.addEventListener('pointercancel',pointerCancel);shell.addEventListener('lostpointercapture',captureLost);shell.addEventListener('keydown',keydown);
  window.addEventListener('pointerup',pointerEnd,true);
  board.addEventListener('wheel',wheel,{passive:false});board.addEventListener('keydown',scrollKey);
  board.addEventListener('pointerdown',panStart);document.addEventListener('pointerdown',clearCanvasSelection,true);window.addEventListener('blur',cancel);window.addEventListener('resize',resized);document.addEventListener('fullscreenchange',fullscreenChanged);
  function canvasExtent(){
    var svg=board.querySelector('.boardcanvas>svg'),height=svg && svg.viewBox.baseVal.height || 800;
    var x=0,y=0,right=graphWidth(),bottom=height;
    windows.concat([playerWindow]).filter(function(w){return canvasWindow(w) && visible(w);}).forEach(function(w){var r=w.rect || constrain(w,w.state);x=Math.min(x,r.x);y=Math.min(y,r.y);right=Math.max(right,r.x+r.w);bottom=Math.max(bottom,r.y+r.h);});
    return {x:x,y:y,w:right-x,h:bottom-y};
  }
  function fitCanvas(insets,selection,extraObstacles){
      if(!active)return;insets=insets || (workbenchCanvas?{left:84,right:24,top:145,bottom:canvasWindow(playerWindow)?24:180}:{left:24,right:windows.length?260:24,top:108,bottom:canvasWindow(playerWindow)?24:180});
      insets=Object.assign({},insets);
      if(onCanvas() && !selection)insets.right=24;
      // Subtract fixed overlays into free rectangles, then choose the rectangle
      // that fits the entire graph/object extent at the largest scale.
      var regions=[{x:insets.left,y:insets.top,w:Math.max(1,board.clientWidth-insets.left-insets.right),h:Math.max(1,board.clientHeight-insets.top-insets.bottom)}];
      var obstacles=windows.filter(function(w){return !canvasWindow(w) && visible(w);}).map(function(w){return w.rect;});
      if(extraObstacles)obstacles=obstacles.concat(extraObstacles);
      if(!player.hidden && !canvasWindow(playerWindow))obstacles.push(playerWindow.rect);
      obstacles.filter(Boolean).forEach(function(r){
        var next=[],o={x:r.x-16,y:r.y-16,right:r.x+r.w+16,bottom:r.y+r.h+16};
        regions.forEach(function(a){
          var right=a.x+a.w,bottom=a.y+a.h;
          if(o.right<=a.x || o.x>=right || o.bottom<=a.y || o.y>=bottom){next.push(a);return;}
          if(o.x>a.x)next.push({x:a.x,y:a.y,w:o.x-a.x,h:a.h});
          if(o.right<right)next.push({x:o.right,y:a.y,w:right-o.right,h:a.h});
          if(o.y>a.y)next.push({x:a.x,y:a.y,w:a.w,h:o.y-a.y});
          if(o.bottom<bottom)next.push({x:a.x,y:o.bottom,w:a.w,h:bottom-o.bottom});
        });
        if(next.length)regions=next;
      });
      var fitExtent=selection || canvasExtent();regions.sort(function(a,b){return Math.min(b.w/fitExtent.w,b.h/fitExtent.h)-Math.min(a.w/fitExtent.w,a.h/fitExtent.h);});
      var region=regions[0],w=region.w,h=region.h;insets.left=region.x;insets.top=region.y;
      var extent=selection || canvasExtent();
      // A narrow free region may need a lower floor than the usual 200px
      // canvas extent. Keep that reachable through subsequent zoom gestures.
      fitFloor=(selection || onCanvas())?Math.max(.001,Math.min(w/extent.w,h/extent.h)):null;
      zoom=clamp(Math.min(w/extent.w,h/extent.h,1.5),zoomFloor(),4);sizeGraph(false);
      board.scrollLeft=marginX+(extent.x+extent.w/2)*graphScale()-(insets.left+w/2);board.scrollTop=marginY+(extent.y+extent.h/2)*graphScale()-(insets.top+h/2);
  }
  return {
    isWorkbenchCanvas:function(){return workbenchCanvas;},
    setBoardHidden:function(hidden){canvasBoardHidden=hidden;paintBoardVisibility();},
    isExplore:function(){return active;},
    revealProse:function(){
      if(!active)return false;var w=windows.find(function(item){return item.prose;});
      if(!w || !available(w))return false;
      setWindowHidden(w,false);memory.focus=false;paint();return true;
    },
    viewDefinition:function(){return definition;},
    setReaderCanvas:function(on){
      readerCanvas=on;shell.classList.toggle('viewer-diagram-canvas',on);
      syncTools();fitHeight();paint();
    },
    setWorkbenchCanvas:function(on){
      if(retired || workbenchCanvas===on)return;
      leave();if(on)canvasBoardHidden=board.hidden;var previous=memories;memories=otherMemories;otherMemories=previous;workbenchCanvas=on;shell.classList.toggle('workbench-diagram-canvas',on);
      if(!definition)definition={id:'flow',presentation:'standard'};
      enter();
    },
    currentCamera:function(){return camera();},
    panelPlacement:function(){return onCanvas()?'canvas':'floating';},
    canvasCommand:function(){return expand;},
    canvasZoom:function(value){if(value==null)return graphPixels/graphWidth();zoom=clamp(value,zoomFloor(),4);sizeGraph(true);},
    overlayScale:sizingScale,setOverlayScale:changeOverlayScale,
    fitCanvas:fitCanvas,
    fitSelection:function(extent,insets,obstacles){if(workbenchCanvas)fitCanvas(insets,extent,obstacles);},
    restoreInitialCamera:function(force){
      if(!active || !memory || !force && memory.scroll || !(memory.layout && memory.layout.camera))return false;
      sizeGraph(false);positionCamera(memory.layout.camera);return true;
    },
    setView:function(view,tiles,sourceGrid){leave(true);definition=view;items=tiles || [];panelSource=sourceGrid || grid;standardPanels();var fresh=!memories[view.id];enter();if(!active && boardSize && boardSize.resume)boardSize.resume();if(workbenchCanvas && fresh)shell.dispatchEvent(new CustomEvent('workbench-canvas-view',{bubbles:true}));shell.dispatchEvent(new CustomEvent('diagram-view-change',{bubbles:true}));},
    setArranging:function(value){shell.classList.toggle('viewport-arranging',!!value);},
    setAuthor:function(value){if(!value){clearScrollEdit();finish(true);}author=value;},
    adoptLayout:function(id,value){
      if(retired || !active || !author || definition.id!==id)return false;
      var normalized=sectionExploreLayout(d,value);
      if(JSON.stringify(normalized)!==JSON.stringify(sectionExploreLayout(d,memory.layout)))return false;
      definition.exploreLayout=copy(normalized);return true;
    },
    reset:function(){
      if(!active)return;var token=beginEdit(true);if(token===false)return;
      var id=definition.id,defaults=memory.layout.prose && memory.layout.prose.hidden?{prose:{hidden:true}}:{};leave();delete memories[id];
      var previous=definition;definition=Object.assign({},definition,{exploreLayout:defaults});enter();definition=previous;publish(token);
    },
    scrollTarget:function(){return active?stage:grid;},
    refresh:resized,
    snapshotCanvasState:function(){
      if(workbenchCanvas && active && graphPixels && board.clientWidth && board.clientHeight){memory.scroll={x:board.scrollLeft,y:board.scrollTop,camera:camera(lastWidth,lastHeight)};memory.zoom=zoom;}
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
      if(workbenchCanvas && active && definition.id===id){mountWindows();paint();sizeGraph(true);}
      return true;
    },
    snapshotReaderState:function(){
      if(active && graphPixels && board.clientWidth && board.clientHeight){memory.scroll={x:board.scrollLeft,y:board.scrollTop,camera:readerCanvas || workbenchCanvas?camera(lastWidth,lastHeight):undefined};memory.zoom=zoom;}
      return {memories:copy(workbenchCanvas?otherMemories:memories),canvasMemories:copy(workbenchCanvas?memories:otherMemories),expanded:expanded,fullscreen:isFullscreen(),stageHeight:stage.style.height,menuOpen:menu.open,legendOpen:legendMenu.open};
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
      menu.open=saved.menuOpen;legendMenu.open=!!saved.legendOpen;
    },
    suspend:function(){leave(true);},
    destroy:function(){if(retired)return;retired=true;pendingFullscreen++;leave();if(isFullscreen() && document.exitFullscreen){var p=document.exitFullscreen();if(p && p.catch)p.catch(function(){});}if(observer)observer.disconnect();if(contentObserver)contentObserver.disconnect();if(visibilityObserver)visibilityObserver.disconnect();if(graphObserver)graphObserver.disconnect();if(tracksObserver)tracksObserver.disconnect();clearScrollEdit();author=null;if(legend)legend.removeEventListener('click',onLegendClick);board.removeEventListener('pointerdown',panStart);board.removeEventListener('wheel',wheel);board.removeEventListener('keydown',scrollKey);document.removeEventListener('pointerdown',clearCanvasSelection,true);window.removeEventListener('pointerup',pointerEnd,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',resized);document.removeEventListener('fullscreenchange',fullscreenChanged);if(fontSet && fontSet.removeEventListener)fontSet.removeEventListener('loadingdone',fontsSettled);}
  };
}
