/* One section owns its viewing surface. Existing panels and playback DOM move
   into it; gestures are reader state and never write the authored layout. */
function createSectionViewport(box, toolbar, grid, board, bar, d, boardSize){
  var retired=false, active=false, arranging=false, expanded=false, pendingFullscreen=0;
  var definition=null, items=[], memories=Object.create(null), memory=null;
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
  var stack=button('Stack at edge',function(){windows.forEach(function(w){w.state.stacked=true;w.state.hidden=false;});memory.focus=false;paint();});stack.hidden=true;
  var expand=button('Expand',toggleExpanded);expand.setAttribute('aria-pressed','false');expand.setAttribute('aria-label','Expand diagram view');
  var status=document.createElement('span');status.className='viewport-status';status.setAttribute('role','status');actions.appendChild(status);
  var zoomOut=button('−',function(){changeZoom(.8);},tools);zoomOut.setAttribute('aria-label','Zoom out');
  var zoomLabel=document.createElement('span');zoomLabel.className='explore-zoom';tools.appendChild(zoomLabel);
  var zoomIn=button('+',function(){changeZoom(1.25);},tools);zoomIn.setAttribute('aria-label','Zoom in');
  var legend=board.querySelector('.lg');
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
    stage.style.height=Math.max(340,Math.min(1000,window.innerHeight-Math.max(12,stage.getBoundingClientRect().top)-24))+'px';
  }
  function minimum(w){
    /* Portrait screens can become much narrower than charts and maps. */
    return /^(phone|deviceapp)$/.test(w.panel.type)?112:/^(screen|homemap|image)$/.test(w.panel.type)?140:128;
  }
  function constrain(w,r){
    var b=bounds(),minW=Math.min(minimum(w),Math.max(80,b.w-24));
    var width=clamp(r.w,minW,Math.max(minW,b.w-24)),height=clamp(r.h,72,Math.max(72,b.h-24));
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
    var stacked=windows.filter(function(w){return visible(w) && w.state.stacked;}),gap=8;
    var total=stacked.reduce(function(n,w){return n+w.state.h;},0),room=Math.max(0,b.h-24-gap*Math.max(0,stacked.length-1));
    var scale=Math.min(1,room/(total || 1)),y=12,maxWidth=0;
    windows.forEach(function(w){
      var can=available(w),shown=visible(w);w.el.hidden=!shown;w.check.disabled=!can;w.check.checked=shown;
      w.note.textContent=w.authoredHidden?'Hidden in this view':!can?'Hidden at this step':'';
      if(!shown)return;
      var r=constrain(w,w.state);
      if(w.state.stacked){r.x=b.w-r.w-12;r.y=y;r.h=Math.max(1,w.state.h*scale);y+=r.h+gap;maxWidth=Math.max(maxWidth,r.w);}
      apply(w,r);
    });
    player.style.right=(maxWidth && b.w-maxWidth>340?maxWidth+28:12)+'px';
    player.hidden=!bar || bar.hidden;
    focus.textContent=memory.focus?'Restore panels':'Hide panels';focus.setAttribute('aria-pressed',String(memory.focus));
    summary.textContent='Panels · '+windows.filter(visible).length;
    if(b.w!==lastWidth || b.h!==lastHeight){lastWidth=b.w;lastHeight=b.h;sizeGraph(true);}
  }
  function graphWidth(){var svg=board.querySelector('.boardcanvas>svg');return svg && svg.viewBox && svg.viewBox.baseVal.width || 1180;}
  function sizeGraph(preserve){
    if(!active || retired)return;
    var natural=graphWidth(),prev=parseFloat(board.style.getPropertyValue('--explore-width')) || board.clientWidth;
    var width=zoom!==null?natural*zoom:boardSize && boardSize.mode()==='readable'?natural:board.clientWidth;
    width=clamp(width,160,Math.max(160,natural*4));
    var cx=(board.scrollLeft+board.clientWidth/2)/(prev || width),cy=(board.scrollTop+board.clientHeight/2)/(prev || width);
    board.style.setProperty('--explore-width',width+'px');
    zoomLabel.textContent=Math.round(width/natural*100)+'%';
    if(preserve){board.scrollLeft=cx*width-board.clientWidth/2;board.scrollTop=cy*width-board.clientHeight/2;}
  }
  function changeZoom(factor){zoom=clamp((parseFloat(board.style.getPropertyValue('--explore-width')) || graphWidth())/graphWidth()*factor,.15,4);sizeGraph(true);}
  function onLegendClick(ev){if(ev.target.closest('.board-size>.mbtn:not(.board-pan-button)')){zoom=null;sizeGraph(true);}}
  if(legend)legend.addEventListener('click',onLegendClick);
  function raise(w){w.el.style.zIndex=String(++z);}
  function finish(cancel){
    if(!gesture)return;var g=gesture;gesture=null;
    if(g.kind==='pan'){
      if(cancel){board.scrollLeft=g.left;board.scrollTop=g.top;}
    }else{
      if(cancel)Object.assign(g.w.state,g.before);
      else if(g.kind==='move')g.w.state.stacked=g.w.rect.x+g.w.rect.w>=stage.clientWidth-36;
      paint();
    }
    if(g.handle.hasPointerCapture && g.handle.hasPointerCapture(g.id))g.handle.releasePointerCapture(g.id);
    shell.classList.remove('viewport-gesturing');
  }
  function begin(ev,w,kind,handle){
    if(!active || ev.button!==0 || gesture)return;
    ev.preventDefault();ev.stopPropagation();raise(w);
    var before=Object.assign({},w.state),r=Object.assign({},w.rect);
    gesture={w:w,kind:kind,handle:handle,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,rect:r,before:before};
    handle.setPointerCapture(ev.pointerId);shell.classList.add('viewport-gesturing');
  }
  function pointerMove(ev){
    var g=gesture;if(!g || ev.pointerId!==g.id)return;
    var dx=ev.clientX-g.startX,dy=ev.clientY-g.startY;
    if(g.kind==='pan'){board.scrollLeft=g.left-dx;board.scrollTop=g.top-dy;return;}
    if(g.kind==='move')Object.assign(g.w.state,constrain(g.w,{x:g.rect.x+dx,y:g.rect.y+dy,w:g.rect.w,h:g.rect.h}),{stacked:false});
    else Object.assign(g.w.state,constrain(g.w,{x:g.rect.x,y:g.rect.y,w:g.rect.w+(g.before.stacked?-dx:dx),h:g.rect.h+dy}));
    paint();
  }
  function keyboard(ev,w,kind){
    var dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},dir=dirs[ev.key];if(!dir)return;
    ev.preventDefault();ev.stopPropagation();raise(w);
    var n=ev.shiftKey?24:8,r=w.rect;
    if(kind==='resize')Object.assign(w.state,constrain(w,{x:r.x,y:r.y,w:r.w+dir[0]*n,h:r.h+dir[1]*n}));
    else Object.assign(w.state,constrain(w,{x:r.x+dir[0]*n,y:r.y+dir[1]*n,w:r.w,h:r.h}),{stacked:false});
    paint();
  }
  function panelWindow(card,panel,it,index){
    var label=panel.title || panel.id;
    var state=memory.panels[panel.id] || (memory.panels[panel.id]={x:12,y:12,w:220,h:panel.type==='homemap'?250:220,stacked:true,hidden:false});
    var el=document.createElement('article');el.className='explore-window';el.setAttribute('data-explore-panel',panel.id);el.setAttribute('aria-label',label);
    var header=document.createElement('div');header.className='explore-window-header';el.appendChild(header);
    var grip=button(label,function(){},header,'explore-window-grip');grip.title='Drag to move; arrow keys to move; drop at the right edge to stack';grip.setAttribute('aria-label','Move '+label+'; use arrow keys');
    var hide=button('×',function(){state.hidden=true;paint();summary.focus();},header,'explore-window-hide');hide.setAttribute('aria-label','Hide '+label);
    var body=document.createElement('div');body.className='explore-window-body';el.appendChild(body);move(card,body);
    var resize=button('◢',function(){},el,'explore-window-resize');resize.title='Drag to resize; arrow keys to resize';stage.appendChild(el);
    var choice=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),note=document.createElement('small');
    check.type='checkbox';text.textContent=label;choice.appendChild(check);choice.appendChild(text);choice.appendChild(note);choices.appendChild(choice);
    var w={el:el,card:card,panel:panel,label:label,state:state,grip:grip,resize:resize,check:check,note:note,authoredHidden:!!it.hidden};
    check.addEventListener('change',function(){state.hidden=!check.checked;if(check.checked)memory.focus=false;paint();});
    grip.addEventListener('pointerdown',function(ev){begin(ev,w,'move',grip);});resize.addEventListener('pointerdown',function(ev){begin(ev,w,'resize',resize);});
    grip.addEventListener('keydown',function(ev){keyboard(ev,w,'move');});resize.addEventListener('keydown',function(ev){keyboard(ev,w,'resize');});
    el.addEventListener('pointerdown',function(){raise(w);});el.addEventListener('focusin',function(){raise(w);});
    windows.push(w);
  }
  var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){if(gesture)finish(true);paint();}):null;
  if(observer)observer.observe(stage);
  var visibilityObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){paint();}):null;
  var graphObserver=typeof MutationObserver!=='undefined'?new MutationObserver(function(){sizeGraph(false);}):null;
  function enter(){
    if(active || !definition || definition.presentation!=='explore' || arranging)return;
    active=true;memory=memories[definition.id] || (memories[definition.id]={panels:Object.create(null),focus:false,scroll:null,zoom:null});zoom=memory.zoom;
    stage.hidden=false;grid.hidden=true;shell.classList.add('viewport-explore');menu.hidden=focus.hidden=stack.hidden=false;
    var cards=Array.prototype.slice.call(grid.querySelectorAll('.pwidget[data-dv-panel]'));
    if(bar)move(bar,player);move(board,canvas);if(legend)move(legend,tools);
    board.classList.add('explore-board');
    cards.forEach(function(card){var index=Number(card.getAttribute('data-dv-panel')),panel=d.panels[index],it=items.find(function(v){return v.panel===panel.id;}) || {};panelWindow(card,panel,it,index);if(visibilityObserver)visibilityObserver.observe(card,{attributes:true,attributeFilter:['class']});});
    if(visibilityObserver && bar)visibilityObserver.observe(bar,{attributes:true,attributeFilter:['hidden']});
    if(graphObserver)graphObserver.observe(board.querySelector('.boardcanvas'),{childList:true});
    fitHeight();lastWidth=lastHeight=0;paint();sizeGraph(false);
    if(memory.scroll){board.scrollLeft=memory.scroll.x;board.scrollTop=memory.scroll.y;}
  }
  function leave(){
    if(!active)return;finish(true);
    memory.scroll={x:board.scrollLeft,y:board.scrollTop};memory.zoom=zoom;active=false;
    if(visibilityObserver)visibilityObserver.disconnect();if(graphObserver)graphObserver.disconnect();
    moved.slice().reverse().forEach(function(rec){if(rec.anchor.parentNode)rec.anchor.parentNode.replaceChild(rec.node,rec.anchor);});moved=[];
    windows.forEach(function(w){w.el.remove();});windows=[];choices.replaceChildren();menu.open=false;
    stage.hidden=true;grid.hidden=false;board.classList.remove('explore-board');board.style.removeProperty('--explore-width');
    shell.classList.remove('viewport-explore');menu.hidden=focus.hidden=stack.hidden=true;
  }
  function isFullscreen(){return document.fullscreenElement===shell;}
  function setExpanded(value){expanded=value;shell.classList.toggle('viewport-expanded',value);expand.textContent=value?'Exit expanded view':'Expand';expand.setAttribute('aria-label',value?'Exit expanded diagram view':'Expand diagram view');expand.setAttribute('aria-pressed',String(value));paint();}
  function exitExpanded(){
    pendingFullscreen++;setExpanded(false);status.textContent='';
    if(isFullscreen() && document.exitFullscreen){var result=document.exitFullscreen();if(result && result.catch)result.catch(function(){});}
    if(!retired)expand.focus({preventScroll:true});
  }
  function toggleExpanded(){
    if(expanded){exitExpanded();return;}setExpanded(true);
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
  function cancel(){finish(true);}
  function resized(){cancel();fitHeight();paint();}
  function panStart(ev){
    if(!active || ev.button!==0 || gesture || ev.target.closest('a,button,input,select,textarea,[role="button"],[data-dv-node],[data-dv-step]'))return;
    ev.preventDefault();gesture={kind:'pan',handle:board,id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,left:board.scrollLeft,top:board.scrollTop};board.setPointerCapture(ev.pointerId);shell.classList.add('viewport-gesturing');
  }
  shell.addEventListener('pointermove',pointerMove);shell.addEventListener('pointerup',function(){finish(false);});shell.addEventListener('pointercancel',cancel);shell.addEventListener('lostpointercapture',cancel);shell.addEventListener('keydown',keydown);
  board.addEventListener('pointerdown',panStart);window.addEventListener('blur',cancel);window.addEventListener('resize',resized);document.addEventListener('fullscreenchange',fullscreenChanged);
  return {
    setView:function(view,tiles){leave();definition=view;items=tiles || [];enter();},
    setArranging:function(value){if(arranging===value)return;arranging=value;if(value){leave();if(expanded)exitExpanded();}else enter();expand.hidden=value;},
    scrollTarget:function(){return active?stage:grid;},
    suspend:leave,
    destroy:function(){if(retired)return;retired=true;pendingFullscreen++;leave();if(isFullscreen() && document.exitFullscreen){var p=document.exitFullscreen();if(p && p.catch)p.catch(function(){});}if(observer)observer.disconnect();if(visibilityObserver)visibilityObserver.disconnect();if(graphObserver)graphObserver.disconnect();if(legend)legend.removeEventListener('click',onLegendClick);board.removeEventListener('pointerdown',panStart);window.removeEventListener('blur',cancel);window.removeEventListener('resize',resized);document.removeEventListener('fullscreenchange',fullscreenChanged);}
  };
}
