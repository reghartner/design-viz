/* Trusted native measurement API, embedded at build time. Never evaluates spec
   text as JavaScript; no camera fitting or CSS changes to panel/control bodies. */
window.arrangementNative = (function () {
  var controller;
  var rect = function(e) { var r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
  async function settle() {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(function(i){return i.decode();}));
    await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});});
  }
  async function paint(arg) {
    if(controller)controller.destroy();
    applySkinClasses(document.body,view,arg.skin);
    controller=renderPage(view,normalize({page:{title:'Arrangement measurement',sections:[{title:'Diagram',diagram:arg.diagram}]}}),arg.skin,null,{layoutTarget:'default'});
    if(controller.sections[0].stepper)controller.sections[0].stepper.pause();
    await settle();
    return {registry:Object.fromEntries(PanelRegistry.types().map(function(type){return [type,{layout:PanelRegistry.get(type).layout||{}}];})),
      states:states(),geometry:geometry()};
  }
  function geometry() {
    var grid=view.querySelector('.section-layout-grid'),r=rect(grid),graph=view.querySelector('[data-layout-key="diagram"] .boardcanvas>svg'),b=graph && graph.viewBox.baseVal;
    return {gridWidth:grid.clientWidth,gridTop:r.y,scale:r.width/grid.offsetWidth,bounds:b?{x:b.x,y:b.y,w:b.width,h:b.height}:{x:0,y:0,w:1,h:1}};
  }
  function states() {
    var sp=controller.sections[0].stepper,result=[{mode:'ambient'}];
    if(sp)sp.paths().forEach(function(p){p.indices.forEach(function(i){result.push({mode:'step',path:p.id,index:i});});});
    return result;
  }
  async function observe(state) {
    var sp=controller.sections[0].stepper;
    if(sp){if(state.mode==='ambient')sp.enterAmbient();else if(!sp.jumpSource(state.index,state.path))throw Error('Cannot render path/step '+JSON.stringify(state));sp.pause();}
    await settle();
    var grid=view.querySelector('.section-layout-grid'),scale=rect(grid).width/grid.offsetWidth;
    var panels=Array.from(view.querySelectorAll('[data-layout-key^="panel:"]')).filter(function(t){return !t.hidden;}).map(function(tile){
      var widget=tile.querySelector('.pwidget'),body=tile.querySelector('.pbody');
      if(!widget||!body)throw Error('Missing native panel '+tile.dataset.layoutKey);
      var wr=rect(widget),br=rect(body),type=Array.from(widget.classList).find(function(c){return c.startsWith('pt-');}).slice(3),contract=(PanelRegistry.get(type).layout||{}).sectionSizing||{};
      var st=getComputedStyle(widget),bs=getComputedStyle(body),children=Array.from(body.children).map(rect);
      var element=contract.contentSelector&&body.querySelector(contract.contentSelector),er=element&&rect(element),content=er?{width:er.width/scale,height:er.height/scale}:null;
      if(element&&element.tagName.toLowerCase()==='svg'&&element.viewBox.baseVal.width){var v=element.viewBox.baseVal,k=Math.min(er.width/v.width,er.height/v.height)/scale;content={width:v.width*k,height:v.height*k};}
      return {id:tile.dataset.layoutKey.slice(6),text:widget.textContent,chrome:(br.y-wr.y)/scale+parseFloat(st.paddingBottom)+parseFloat(st.borderBottomWidth),paddingX:parseFloat(st.paddingLeft)+parseFloat(st.paddingRight)+parseFloat(bs.paddingLeft)+parseFloat(bs.paddingRight),intrinsicHeight:(Math.max(br.y,...children.map(function(c){return c.bottom;}))-br.y)/scale,nativeContent:content,
        extraHeight:contract.ancillarySelector?Array.from(body.querySelectorAll(contract.ancillarySelector)).reduce(function(n,e){var s=getComputedStyle(e);return n+rect(e).height/scale+parseFloat(s.marginTop)+parseFloat(s.marginBottom);},0):0,
        overflowX:Math.max(0,widget.scrollWidth-widget.clientWidth),overflowY:Math.max(0,widget.scrollHeight-widget.clientHeight),neededHeight:widget.scrollHeight,
        nestedOverflow:Array.from(body.querySelectorAll('*')).filter(function(e){var s=getComputedStyle(e);return e.clientWidth>1&&e.clientHeight>1&&((s.overflowX==='hidden'&&e.scrollWidth>e.clientWidth+4)||(s.overflowY==='hidden'&&e.scrollHeight>e.clientHeight+4));}).map(function(e){return {class:String(e.className),x:e.scrollWidth-e.clientWidth,y:e.scrollHeight-e.clientHeight};})};
    });
    var tile=view.querySelector('[data-layout-key="steps"]'),bar=tile&&tile.querySelector('.termbar'),controls=null;
    if(bar&&rect(bar).width&&state.mode==='step'){
      var tr=rect(tile),caption=bar.querySelector('.step-text'),fragments=[],walker=document.createTreeWalker(caption,NodeFilter.SHOW_TEXT),n;
      while(n=walker.nextNode()){if(!n.textContent.trim())continue;var range=document.createRange();range.selectNodeContents(n);Array.from(range.getClientRects()).forEach(function(r){if(r.width&&r.height)fragments.push(r);});}
      var children=Array.from(bar.children).filter(function(e){return !e.hidden;}).map(rect),bottom=Math.max(tr.y,...children.map(function(r){return r.bottom;}),...fragments.map(function(r){return r.bottom;}));
      var out=function(r){return r.x<tr.x-1||r.right>tr.right+1||r.y<tr.y-1||r.bottom>tr.bottom+1;};
      controls={neededHeight:(bottom-tr.y)/scale+parseFloat(getComputedStyle(bar).paddingBottom)+2,maxLines:new Set(fragments.map(function(r){return Math.round(r.y*2)/2;})).size,clipped:fragments.filter(out).length+Array.from(bar.querySelectorAll('button')).filter(function(e){return rect(e).width&&out(rect(e));}).length,overflowX:Math.max(0,bar.scrollWidth-bar.clientWidth),bottom:tr.bottom};
    }
    var gt=view.querySelector('[data-layout-key="diagram"]'),graph=null;
    if(gt&&!gt.hidden){var board=gt.querySelector('.board'),svg=gt.querySelector('.boardcanvas>svg'),nodes=Array.from(gt.querySelectorAll('.node[data-dv-node]')),f=rect(board),ss=rect(svg).width/svg.viewBox.baseVal.width,legend=gt.querySelector('.lg'),lh=legend?rect(legend).height:0;
      graph={count:nodes.length,contentBounds:boardContentBounds(svg),clipped:nodes.filter(function(n){var r=rect(n);return r.x<f.x-2||r.right>f.right+2||r.y<f.y+lh-2||r.bottom>f.bottom+2;}).length,minimumLabelPx:nodes.length?Math.min(...nodes.map(function(n){return parseFloat(getComputedStyle(n.querySelector('.t1')).fontSize)*ss;})):null,requiredHeight:Math.max(0,...nodes.map(function(n){return rect(n).bottom-f.y+lh+20;}))/scale+100};
    }
    return {state,panels,controls,graph};
  }
  return {paint:paint,observe:observe};
})();
