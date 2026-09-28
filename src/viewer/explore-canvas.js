/* Standalone Explore uses the entire browser (or embedding frame). Curated
   standard views keep their document layout. Navigation never edits the spec. */
function initViewerExploreCanvas(ctl,view){
  var active=null,seen=new Set(),frame=0;
  var navigation=document.createElement('div');navigation.className='explore-reader-navigation';
  var label=document.createElement('label');label.textContent='Story ';
  var sections=document.createElement('select');sections.setAttribute('aria-label','Explore story');label.appendChild(sections);navigation.appendChild(label);
  ctl.sections.filter(function(rec){return rec.hasDiagram;}).forEach(function(rec){
    var option=document.createElement('option');option.value=rec.number;option.textContent=rec.sectionEl.querySelector('.sec-h')?.textContent || rec.reference || 'Section '+rec.number;sections.appendChild(option);
  });
  var back=document.createElement('button');back.type='button';back.className='mbtn';back.textContent='Back to page';navigation.appendChild(back);
  function show(rec){
    var previous=active;active=rec && rec.viewport && rec.viewport.isExplore()?rec:null;
    if(previous && previous!==active){previous.sectionEl.classList.remove('explore-active-section');previous.viewport.setReaderCanvas(false);}
    document.body.classList.toggle('viewer-exploring',!!active);view.classList.toggle('explore-full-window',!!active);
    if(!active){navigation.remove();return;}
    active.sectionEl.classList.add('explore-active-section');
    active.sectionEl.querySelector('.diagram-views').prepend(navigation);sections.value=String(active.number);
    active.viewport.setReaderCanvas(true);
    var definition=active.viewport.viewDefinition(),key=active.number+':'+definition.id;
    if(!seen.has(key)){
      seen.add(key);cancelAnimationFrame(frame);frame=requestAnimationFrame(function(){
        if(active===rec && !(definition.exploreLayout && definition.exploreLayout.camera))active.viewport.fitCanvas({left:24,right:260,top:108,bottom:180});
      });
    }
  }
  sections.addEventListener('change',function(){
    var rec=ctl.sections.find(function(r){return r.number===Number(sections.value);});if(!rec)return;
    if(rec.tabBlock)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false);
    show(rec);if(!active)rec.sectionEl.scrollIntoView({block:'start'});
  });
  back.addEventListener('click',function(){var rec=active;if(document.fullscreenElement && document.exitFullscreen)document.exitFullscreen().catch(function(){});show(null);if(rec)rec.sectionEl.scrollIntoView({block:'start'});});
  function viewChanged(ev){
    var rec=ctl.sections.find(function(r){return r.sectionEl.contains(ev.target);});if(rec)show(rec);
  }
  view.addEventListener('diagram-view-change',viewChanged);
  var target=ctl.activeTarget,initial=target && target.kind==='diagram'?ctl.sections.find(function(r){return r.number===target.section;}):null;
  if(!initial)initial=ctl.sections.find(function(r){return r.viewport && r.viewport.isExplore() && (!r.tabBlock || ctl.tabBlocks[r.tabBlock-1].active()===r.tab);});
  show(initial);
  return {destroy:function(){view.removeEventListener('diagram-view-change',viewChanged);cancelAnimationFrame(frame);show(null);}};
}
