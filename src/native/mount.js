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
  function changed(){if(environment.disposed)return;protectLinks();if(options.onChange)options.onChange();}
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
    navigate:function(target){
      if(environment.disposed)throw new Error('This viewer has been destroyed.');
      var destination=records.find(function(r){return r.reference===target.section;}) || records.find(function(r){return r.aliases && r.aliases.indexOf(target.section)>=0;});
      var section=destination && controller.sections.find(function(s){return s.reference===destination.reference;});
      if(!section)throw new Error('This section is no longer in the published diagram. Refresh diagrams.');
      if(controller.details)controller.details.showSection(section.reference);
      if(section.tabBlock!=null)controller.tabBlocks[section.tabBlock-1].select(section.tab,false,false);
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
      if(options.scrollIntoView!==false)section.sectionEl.scrollIntoView({block:'start',behavior:'instant'});
      changed();
    },
    pause:function(){if(controller.details)controller.details.pause();if(!environment.disposed)controller.steppers.forEach(function(s){s.stepper.pause();});},
    destroy:function(){if(environment.disposed)return;try{controller.destroy();}finally{environment.destroy();}}
  };
}
