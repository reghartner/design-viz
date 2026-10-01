/* Direct manipulation of smooth through-points. Owns only editor chrome and
   gesture previews; every saved change goes through the builder transaction. */
function createEdgeCurveEditor(opts){
  var life=createWorkbenchLifetime(),view=opts.view,document=opts.document,window=opts.window;
  var selected=null,chrome=null,gesture=null,suppress=false;
  function clearChrome(){if(chrome)chrome.remove();chrome=null;}
  function context(el){
    if(!el || !el.isConnected || !el.matches('path.edge[data-dv-edge]'))return null;
    var snapshot=opts.session.snapshot(),sec=el.closest('.doc-sec');
    if(snapshot.error || !sec || snapshot.renderedText!=null && snapshot.renderedText!==snapshot.text)return null;
    var section=Number(sec.getAttribute('data-dv-section')),index=Number(el.getAttribute('data-dv-edge'));
    var got=builderDiagram(snapshot.text,snapshot.raw,section);if(got.error)return null;
    var edge=(got.d.edges || [])[index];if(!edge)return null;
    return {snapshot:snapshot,section:section,index:index,edge:edge,L:layout(got.d),svg:el.ownerSVGElement,el:el};
  }
  function element(tag,attrs){
    var el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.keys(attrs).forEach(function(key){el.setAttribute(key,String(attrs[key]));});return el;
  }
  function refresh(el){
    cancel();clearChrome();selected=el;
    var c=context(el);if(!c || opts.disabled())return;
    chrome=element('g',{'class':'dv-curve-editor','data-dv-edge':c.index});
    var hit=element('path',{'class':'dv-curve-hit',d:el.getAttribute('d'),'data-curve-line':''});chrome.appendChild(hit);
    var anchors=edgeCurveAnchors(c.edge,c.L);
    var matrix=c.svg.getScreenCTM(),scale=matrix?Math.hypot(matrix.a,matrix.b):1;
    if(!anchors.length){var mid=el.getPointAtLength(el.getTotalLength()/2);anchors=[{x:mid.x,y:mid.y}];}
    anchors.forEach(function(p,i){
      var handle=element('circle',{cx:p.x,cy:p.y,r:7/(scale || 1),'class':'dv-curve-point',tabindex:0,role:'button',
        'data-curve-point':hasEdgeCurve(c.edge)?i:-1,
        'aria-label':hasEdgeCurve(c.edge)?'Curve point '+(i+1)+'. Arrow keys move; Delete removes.':'Drag to shape arrow. Arrow keys also move.'});
      var title=element('title',{});title.textContent='Drag to shape · Arrow keys move · Delete removes point';handle.appendChild(title);chrome.appendChild(handle);
    });
    c.svg.appendChild(chrome);
  }
  function pointer(c,ev){
    var matrix=c.svg.getScreenCTM();if(!matrix)return null;
    try{var p=c.svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(matrix.inverse());}catch(ex){return null;}
  }
  function fresh(c){var now=opts.session.snapshot();return now.text===c.snapshot.text && now.project===c.snapshot.project;}
  function cancel(){
    if(!gesture)return;var g=gesture;gesture=null;
    if(g.ghost)g.ghost.remove();g.c.el.classList.remove('dv-free-edge-source');
    if(chrome)chrome.removeAttribute('visibility');
    if(g.capture && g.capture.hasPointerCapture && g.capture.hasPointerCapture(g.pointerId))g.capture.releasePointerCapture(g.pointerId);
  }
  function consumeClick(){suppress=true;life.delay(function(){suppress=false;},0);}
  function save(c,points,focus){
    if(!fresh(c)){opts.message('The source changed. Curve edit cancelled.');return;}
    var plan=planEdgeCurve(c.snapshot.text,c.snapshot.raw,c.section,c.index,points);
    if(plan.error){opts.message(plan.error);return;}
    opts.commit(plan,c.snapshot,c.section,c.index);
    if(focus!=null && chrome){
      var handle=chrome.querySelector('[data-curve-point="'+focus+'"]') || chrome.querySelector('.dv-curve-point');
      if(handle)handle.focus({preventScroll:true});
    }
  }
  function insertAt(c,p){
    var points=hasEdgeCurve(c.edge)?builderClone(c.edge.curvePoints):[],segments=edgeCurveSegments(c.edge,c.L);
    var paths=segments.length?segments.map(function(s){return 'M '+s[0].x+' '+s[0].y+' C '+s[1].x+' '+s[1].y+' '+s[2].x+' '+s[2].y+' '+s[3].x+' '+s[3].y;}):[c.el.getAttribute('d')];
    var best=Infinity,index=0,fraction=.5;
    paths.forEach(function(d,i){var samples=samplePathD(d);samples.forEach(function(q,j){
      var distance=Math.hypot(q.x-p.x,q.y-p.y);if(distance<best){best=distance;index=i;fraction=j/(samples.length-1);}
    });});
    var left=index?points[index-1].t:0,right=index<points.length?points[index].t:1;
    var t=left+(right-left)*fraction;
    points.splice(index,0,edgeCurvePoint(c.edge,c.L,p,t));return {points:points,index:index};
  }
  function nearbyEdge(ev){
    // SVG hit testing ignores the gaps in dashed strokes. Give the whole line
    // a small screen-space grab tolerance, without covering labels or cards.
    if(ev.target.closest('[data-dv-node],[data-dv-step],text,a,button,[role="button"]'))return null;
    var svg=ev.target.closest('svg');if(!svg)return null;
    var best=8,found=null;
    svg.querySelectorAll('path.edge[data-dv-edge]').forEach(function(el){
      var style=window.getComputedStyle(el);if(style.display==='none' || style.visibility==='hidden' || Number(style.opacity)<.05)return;
      var m=el.getScreenCTM();if(!m)return;
      var length=el.getTotalLength(),count=Math.max(1,Math.min(600,Math.ceil(length*Math.hypot(m.a,m.b)/5)));
      for(var i=0;i<=count;i++){
        var p=el.getPointAtLength(length*i/count),x=m.a*p.x+m.c*p.y+m.e,y=m.b*p.x+m.d*p.y+m.f;
        var distance=Math.hypot(ev.clientX-x,ev.clientY-y);if(distance<best){best=distance;found=el;}
      }
    });return found;
  }
  life.listen(view,'pointerdown',function(ev){
    if(ev.button!==0 || ev.altKey || ev.shiftKey || ev.ctrlKey || ev.metaKey || opts.disabled())return;
    var target=ev.target.closest && ev.target.closest('[data-curve-point],[data-curve-line],path.edge[data-dv-edge]');
    if(!target && ev.target.closest)target=nearbyEdge(ev);
    if(!target || target.closest('[data-dv-detail-preview]'))return;
    var handle=target.hasAttribute('data-curve-point')?Number(target.getAttribute('data-curve-point')):null;
    var el=target.matches('path.edge')?target:selected,c=context(el);if(!c)return;
    var p=pointer(c,ev);if(!p)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    if(selected!==el)opts.select(el,c.section,c.index);
    opts.pause();
    if(handle!=null && target.focus)target.focus({preventScroll:true});
    var edit=handle!=null && handle>=0?{points:builderClone(c.edge.curvePoints),index:handle}:insertAt(c,p);
    if(edit.points.length>32){opts.message('This arrow already has 32 curve points. Move or remove an existing point.');return;}
    gesture={c:c,points:edit.points,index:edit.index,start:p,x:ev.clientX,y:ev.clientY,moved:false,
      pointerId:ev.pointerId,capture:handle!=null?target:c.svg};
    // Existing handles remain mounted; a first selection uses the stable SVG.
    if(gesture.capture.setPointerCapture)gesture.capture.setPointerCapture(ev.pointerId);
  },true);
  life.listen(window,'pointermove',function(ev){
    var g=gesture;if(!g || ev.pointerId!==g.pointerId)return;
    if(!fresh(g.c)){cancel();opts.message('The source changed. Curve edit cancelled.');return;}
    if(Math.hypot(ev.clientX-g.x,ev.clientY-g.y)>3)g.moved=true;
    if(!g.moved)return;var p=pointer(g.c,ev);if(!p)return;
    g.points[g.index]=edgeCurvePoint(g.c.edge,g.c.L,p,g.points[g.index].t);
    if(!validCurvePoints(g.points)){cancel();opts.message('Curve point is outside the supported canvas.');return;}
    if(!g.ghost){g.ghost=g.c.el.cloneNode(false);g.ghost.removeAttribute('id');g.ghost.removeAttribute('data-dv-edge');
      g.ghost.setAttribute('class','edge dv-free-edge-preview');g.c.svg.appendChild(g.ghost);g.c.el.classList.add('dv-free-edge-source');}
    if(chrome)chrome.setAttribute('visibility','hidden');
    g.ghost.setAttribute('d',edgePath(Object.assign({},g.c.edge,{curvePoints:g.points}),g.c.L));
    ev.preventDefault();
  });
  life.listen(window,'pointerup',function(ev){
    var g=gesture;if(!g || ev.pointerId!==g.pointerId)return;cancel();consumeClick();
    if(g.moved)save(g.c,g.points);
  });
  life.listen(view,'click',function(ev){if(opts.disabled())return;if(suppress || ev.target.closest && ev.target.closest('.dv-curve-editor')){
    suppress=false;ev.preventDefault();ev.stopImmediatePropagation();
  }},true);
  life.listen(view,'keydown',function(ev){
    var handle=ev.target.closest && ev.target.closest('[data-curve-point]');if(!handle)return;
    var c=context(selected);if(!c || opts.disabled())return;
    var index=Number(handle.getAttribute('data-curve-point')),points=hasEdgeCurve(c.edge)?builderClone(c.edge.curvePoints):[];
    var arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(ev.key==='Delete' || ev.key==='Backspace'){
      ev.preventDefault();ev.stopImmediatePropagation();if(index<0)return;points.splice(index,1);save(c,points,Math.min(index,points.length-1));return;
    }
    if(!arrows[ev.key])return;
    ev.preventDefault();ev.stopImmediatePropagation();
    if(index<0){var mid=c.el.getPointAtLength(c.el.getTotalLength()/2);points=[edgeCurvePoint(c.edge,c.L,mid,.5)];index=0;}
    var delta=arrows[ev.key],step=ev.shiftKey?1:10;points[index].dx+=delta[0]*step;points[index].dy+=delta[1]*step;
    save(c,points,index);
  },true);
  life.listen(view,'dblclick',function(ev){
    var handle=ev.target.closest && ev.target.closest('[data-curve-point]');if(!handle || opts.disabled())return;
    var c=context(selected),index=Number(handle.getAttribute('data-curve-point'));if(!c || index<0)return;
    ev.preventDefault();ev.stopImmediatePropagation();var points=builderClone(c.edge.curvePoints);points.splice(index,1);save(c,points);
  },true);
  life.listen(window,'keydown',function(ev){if(ev.key==='Escape' && gesture){ev.preventDefault();ev.stopImmediatePropagation();cancel();}},true);
  life.listen(window,'blur',cancel);life.listen(window,'pointercancel',cancel);
  life.listen(opts.src,'input',function(){cancel();clearChrome();});
  return {refresh:refresh,cancel:cancel,busy:function(){return !!gesture;},clear:function(){cancel();clearChrome();selected=null;},
    destroy:function(){cancel();clearChrome();selected=null;life.destroy();}};
}
