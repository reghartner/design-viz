/* This function is compiled in the renderer's instance scope. No URL boot,
   address-bar synchronization, storage, clipboard or request transport runs. */
function mountNativeSpec(environment, spec, options){
  var page=normalize(spec), findings=validate(page);
  if(findings.errors.length)throw new Error(findings.errors.join('\n'));
  var skin=resolveSkin('',options.skin || page.skin), view=document.createElement('div');
  environment.body.appendChild(view);applySkinClasses(environment.body,view,skin);
  var records=sectionRecords(page), controller=renderPage(view,page,skin,options.backlinks || {},
    {autoplay:false,layoutTarget:options.layoutTarget || 'backstage',compatibilityNotice:false,loadDetail:options.loadDetail,onDetailNavigate:options.onDetailNavigate,resolveDiagramLink:options.resolveDiagramLink});
  function protectLinks(){
    view.querySelectorAll('a[href]').forEach(function(link){
      var url=FlowCanon.http(link.getAttribute('href'));
      if(url){link.setAttribute('href',url);link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');}
      else link.removeAttribute('href');
    });
  }
  function linkClick(event){
    var link=event.target.closest && event.target.closest('a');
    if(!link || !view.contains(link))return;
    if(!FlowCanon.http(link.getAttribute('href'))){event.preventDefault();return;}
    link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer');
  }
  var navigating=false;
  var canvas=false,canvasSection=null,canvasFrame=0,canvasSeen=new Set(),canvasNav=null,canvasSelect=null;
  function createCanvasNavigation(){
    canvasNav=document.createElement('label');canvasNav.className='native-canvas-story';canvasNav.textContent='Story ';
    canvasSelect=document.createElement('select');canvasSelect.setAttribute('aria-label','Explore story');canvasNav.appendChild(canvasSelect);
    controller.sections.filter(function(rec){return rec.viewport;}).forEach(function(rec){
      var option=document.createElement('option');option.value=rec.reference;option.textContent=rec.sectionEl.querySelector('.sec-h')?.textContent || rec.reference;canvasSelect.appendChild(option);
    });
    canvasSelect.addEventListener('change',function(){
      var rec=controller.sections.find(function(r){return r.reference===canvasSelect.value;});if(!rec)return;
      if(rec.tabBlock!=null)controller.tabBlocks[rec.tabBlock-1].select(rec.tab,false,false);
      controller.activeTarget={kind:'diagram',section:rec.number};canvasSync();changed();
    });
  }
  function canvasSync(){
    if(!canvas && !canvasSection)return;
    if(!canvasNav)createCanvasNavigation();
    var target=controller.activeTarget || {};
    var next=canvas && (controller.sections.find(function(rec){return rec.viewport &&
      (rec.number===target.section || target.kind==='tab' && rec.tabBlock===target.tabBlock && rec.tab===target.tab);}) || canvasSection || controller.sections.find(function(rec){return rec.viewport;}));
    if(canvasSection && canvasSection!==next){
      canvasSection.viewport.setReaderCanvas(false);canvasSection.viewport.setWorkbenchCanvas(false);
      canvasSection.sectionEl.classList.remove('explore-active-section');
    }
    canvasSection=next || null;view.classList.toggle('explore-full-window',!!canvasSection);
    environment.body.classList.toggle('native-canvas',!!canvasSection);
    if(!canvasSection){canvasNav.remove();return;}
    if(canvasSection.tabBlock!=null)controller.tabBlocks[canvasSection.tabBlock-1].select(canvasSection.tab,false,false);
    controller.activeTarget={kind:'diagram',section:canvasSection.number};
    canvasSection.sectionEl.classList.add('explore-active-section');
    // Reuse the transient diagram canvas: opening it never changes the authored
    // presentation, including a curated Home view's saved primary panel.
    canvasSection.viewport.setWorkbenchCanvas(true);canvasSection.viewport.setReaderCanvas(true);
    canvasSection.sectionEl.querySelector('.diagram-views').prepend(canvasNav);canvasSelect.value=canvasSection.reference;
    var definition=canvasSection.viewport.viewDefinition(),key=canvasSection.reference+':'+definition.id;
    if(!canvasSeen.has(key)){
      canvasSeen.add(key);cancelAnimationFrame(canvasFrame);var rec=canvasSection;
      canvasFrame=requestAnimationFrame(function(){if(canvasSection===rec)rec.viewport.fitCanvas({left:24,right:24,top:165,bottom:190});});
    }
  }
  function snapshot(){
    var active=controller.activeTarget || {}, section=(controller.sections || []).find(function(s){return s.number===active.section;});
    if(!section && active.kind==='tab')section=controller.sections.find(function(s){return s.tabBlock===active.tabBlock && s.tab===active.tab && s.hasDiagram;});
    if(!section)return null;
    var target={section:section.reference}, presentation=section.presentation, sp=section.stepper;
    if(presentation && presentation.viewId)target.view=presentation.viewId();
    else if(section.hasDiagram)target.view='flow';
    if(sp && sp.mode()==='step'){target.path=sp.path();target.step=sp.current().id || String(sp.current().n+1);}
    var drilldown=controller.details && controller.details.snapshot();
    if(drilldown)target.drilldown=drilldown;
    return target;
  }
  function changed(){if(environment.disposed || navigating)return;canvasSync();protectLinks();if(options.onChange)options.onChange(snapshot());}
  controller.onChange=changed;
  environment.listen(view,'click',linkClick,true);environment.listen(view,'auxclick',linkClick,true);
  var size=new ResizeObserver(function(){if(options.onResize)options.onResize(Math.ceil(view.getBoundingClientRect().height));});size.observe(view);
  environment.fontsReady.then(function(){if(!environment.disposed && options.onResize)options.onResize(Math.ceil(view.getBoundingClientRect().height));},function(){
    if(!environment.disposed && options.onWarning)options.onWarning('Bundled viewer fonts could not load.');
  });
  protectLinks();
  return {
    root:environment.root, controller:controller, warnings:findings.warnings,
    resources:environment.resources,
    snapshot:snapshot,
    setCanvas:function(on){
      if(environment.disposed)throw new Error('This viewer has been destroyed.');
      if(canvas===!!on)return;canvas=!!on;changed();
    },
    navigate:function(target){
      if(environment.disposed)throw new Error('This viewer has been destroyed.');
      var destination=records.find(function(r){return r.reference===target.section;}) || records.find(function(r){return r.aliases && r.aliases.indexOf(target.section)>=0;});
      var section=destination && controller.sections.find(function(s){return s.reference===destination.reference;});
      if(!section)throw new Error('This section is no longer in the published diagram. Refresh diagrams.');
      navigating=true;
      try{
        if(controller.details)controller.details.showSection(section.reference);
        if(section.tabBlock!=null)controller.tabBlocks[section.tabBlock-1].select(section.tab,false,false);
        controller.activeTarget={kind:'diagram',section:section.number};
        var presentation=section.presentation;
        if(target.view!=null && (presentation ? !presentation.setView || !presentation.setView(target.view) : target.view!=='flow' || !section.hasDiagram))
          throw new Error('This view is no longer in the published diagram. Refresh diagrams.');
        var sp=section.stepper;
        if(sp && (target.path || target.step)){
          var source=records.find(function(record){return record.reference===section.reference;}).section.diagram;
          var resolved=resolveSourceStep(source,target.path || sp.path(),target.step);
          if(!resolved)throw new Error('This path is no longer in the published diagram. Refresh diagrams.');
          if(target.step){
            if(resolved.sourceIndex<0)throw new Error('This step is no longer in the published diagram. Refresh diagrams.');
            if(!sp.jumpSource(resolved.sourceIndex,resolved.path.id))throw new Error('This step is unavailable in this diagram.');
          }else if(!sp.selectPath(resolved.path.id))throw new Error('This path has no visible steps in the current view. Select a view that includes it.');
        }
        if(target.drilldown && controller.details)controller.details.restore(target.drilldown);
        if(!canvas && options.scrollIntoView!==false)section.sectionEl.scrollIntoView({block:'start',behavior:'instant'});
      }finally{navigating=false;changed();}
    },
    pause:function(){if(controller.details)controller.details.pause();if(!environment.disposed)controller.steppers.forEach(function(s){s.stepper.pause();});},
    destroy:function(){if(environment.disposed)return;if(canvasFrame)cancelAnimationFrame(canvasFrame);try{controller.destroy();}finally{environment.destroy();}}
  };
}
