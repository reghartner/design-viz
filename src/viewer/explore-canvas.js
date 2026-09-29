/* Standalone Explore uses the entire browser (or embedding frame). Curated
   standard views keep their document layout. Navigation never edits the spec. */
function initViewerExploreCanvas(ctl,view){
  var active=null,detailRoot=null,detailOriginExplore=false,pageOnly=false,seen=new Set(),frame=0,lastTarget=ctl.activeTarget && JSON.stringify(ctl.activeTarget);
  var navigation=document.createElement('div');navigation.className='explore-reader-navigation';
  var label=document.createElement('label');label.textContent='Story ';
  var sections=document.createElement('select');sections.setAttribute('aria-label','Explore story');label.appendChild(sections);navigation.appendChild(label);
  var embedded=ctl.sections.find(function(rec){return rec.sectionEl.classList.contains('dv-embed-target');});
  ctl.sections.filter(function(rec){return rec.hasDiagram && !rec.detailOnly && (!embedded || rec===embedded);}).forEach(function(rec){
    var option=document.createElement('option');option.value=rec.number;option.textContent=rec.sectionEl.querySelector('.sec-h')?.textContent.trim() || rec.reference || 'Section '+rec.number;sections.appendChild(option);
  });
  label.hidden=sections.options.length<2;
  var back=document.createElement('button');back.type='button';back.className='mbtn';back.textContent='Back to page';navigation.appendChild(back);
  function show(rec){
    var previous=active;active=rec && rec.viewport && rec.viewport.isExplore()?rec:null;
    if(previous && previous!==active){previous.sectionEl.classList.remove('explore-active-section');previous.viewport.setReaderCanvas(false);if(previous.sectionEl.hasAttribute('data-dv-detail-preview'))previous.viewport.setWorkbenchCanvas(false);}
    document.body.classList.toggle('viewer-exploring',!!active);view.classList.toggle('explore-full-window',!!active);
    if(!active){navigation.remove();return;}
    active.sectionEl.classList.add('explore-active-section');
    active.sectionEl.querySelector('.diagram-views').prepend(navigation);
    var detail=ctl.details && ctl.details.snapshot(),root=detail && ctl.sections.find(function(r){return r.reference===detail.section;});
    sections.value=String(root?root.number:active.number);
    active.viewport.setReaderCanvas(true);
    var definition=active.viewport.viewDefinition(),key=active.number+':'+definition.id;
    if(!seen.has(key)){
      cancelAnimationFrame(frame);frame=requestAnimationFrame(function(){
        // Boot-time indexing briefly visits other views. Only mark a view after
        // its frame actually opens, so those cancelled visits cannot skip Fit.
        if(active!==rec || active.viewport.viewDefinition().id!==definition.id)return;
        seen.add(key);
        if(!(definition.exploreLayout && definition.exploreLayout.camera))active.viewport.fitCanvas({left:24,right:260,top:108,bottom:180});
      });
    }
  }
  sections.addEventListener('change',function(){
    var rec=ctl.sections.find(function(r){return r.number===Number(sections.value);});if(!rec)return;
    pageOnly=false;detailRoot=null;
    if(ctl.details)ctl.details.showSection(rec.reference);
    if(rec.tabBlock)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false);
    ctl.activeTarget={kind:'diagram',section:rec.number};
    if(ctl.onChange)ctl.onChange();
    show(rec);if(!active)rec.sectionEl.scrollIntoView({block:'start'});
  });
  back.addEventListener('click',function(){var rec=active;pageOnly=true;if(document.fullscreenElement && document.exitFullscreen)document.exitFullscreen().catch(function(){});show(null);if(rec)rec.sectionEl.scrollIntoView({block:'start'});});
  function viewChanged(ev){
    var rec=ctl.sections.find(function(r){return r.sectionEl.contains(ev.target);});
    if(rec){pageOnly=false;show(rec);}
    else if(ctl.details && ctl.details.activeSections().some(function(r){return r.sectionEl.contains(ev.target);})){
      pageOnly=false;detailChanged();
    }
  }
  view.addEventListener('diagram-view-change',viewChanged);
  function detailChanged(){
    if(pageOnly)return;
    var stack=ctl.details && ctl.details.activeSections?ctl.details.activeSections():[];
    if(stack.length>1){
      if(detailRoot!==stack[0]){detailRoot=stack[0];detailOriginExplore=active===detailRoot;}
      var inherited=detailOriginExplore;
      stack.slice(1).forEach(function(rec){
        var p=rec.presentation,id=p && p.viewId && p.viewId(),definition=rec.viewport && rec.viewport.viewDefinition();
        var explicit=definition && !definition.legacy && p && p.views && p.views().some(function(v){return v.id===id;});
        rec.viewport.setWorkbenchCanvas(!explicit && inherited);inherited=rec.viewport.isExplore();
      });
      show(stack[stack.length-1]);
    }else if(detailRoot){var root=detailRoot;detailRoot=null;show(detailOriginExplore?root:null);}
    else if(active){var target=ctl.activeTarget;show(ctl.sections.find(function(r){return target && r.number===target.section;}));}
  }
  view.addEventListener('detail-navigation',detailChanged);
  function navigationChanged(){
    var target=ctl.activeTarget,key=JSON.stringify(target);if(key===lastTarget)return;lastTarget=key;
    pageOnly=false;detailRoot=null;
    var rec=target && target.kind==='diagram'?ctl.sections.find(function(r){return r.number===target.section;}):null;
    if(rec!==active)show(rec);
  }
  var priorChange=ctl.onChange;
  function changed(){if(priorChange)priorChange.apply(ctl,arguments);navigationChanged();}
  ctl.onChange=changed;
  window.addEventListener('hashchange',navigationChanged);
  var target=ctl.activeTarget,initial=target && target.kind==='diagram'?ctl.sections.find(function(r){return r.number===target.section;}):null;
  if(!initial)initial=ctl.sections.find(function(r){return !r.detailOnly && r.viewport && r.viewport.isExplore() && (!r.tabBlock || ctl.tabBlocks[r.tabBlock-1].active()===r.tab);});
  show(initial);if(ctl.details && ctl.details.activeSection && ctl.details.activeSection())detailChanged();
  return {destroy:function(){if(ctl.onChange===changed)ctl.onChange=priorChange;window.removeEventListener('hashchange',navigationChanged);view.removeEventListener('detail-navigation',detailChanged);view.removeEventListener('diagram-view-change',viewChanged);cancelAnimationFrame(frame);show(null);}};
}
