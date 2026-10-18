/* Selected views and playback are preview state. Explore geometry is authored
   separately through the layout editor and restored from the spec. */
function workbenchPreviewSections(page){
  return sectionRecords(page).map(function(record){
    var sec=record.section,d=sec.diagram || {};
    return {diagram:d,sectionId:typeof sec.id==='string' && sec.id ? sec.id : null,
      context:JSON.stringify([record.tabLabel,sec.heading || '']),content:JSON.stringify(d)};
  });
}
/* Match sections one-to-one, without treating editable node IDs, headings or
   page titles as document identity. Explicit IDs survive arbitrary edits;
   unique contextual headings survive graph edits; unchanged diagrams survive
   heading/tab renames. Ambiguous copies never borrow another section's view. */
function matchWorkbenchPreviewSections(previous,next){
  var matches=new Map(),used=new Set();
  ['sectionId','context','content'].forEach(function(key){
    next.forEach(function(section,index){
      var value=section[key];
      if(matches.has(index) || value==null || next.filter(function(s){return s[key]===value;}).length!==1)return;
      var candidates=previous.filter(function(s){return s[key]===value;});
      if(candidates.length!==1 || used.has(candidates[0]))return;
      if(key==='context' && section.sectionId && candidates[0].sectionId && section.sectionId!==candidates[0].sectionId)return;
      matches.set(index,candidates[0]);used.add(candidates[0]);
    });
  });
  return matches;
}
function workbenchPreviewSnapshot(page, ctl, options){
  var sections = workbenchPreviewSections(page), saved = [];
  ((ctl && ctl.sections) || []).forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    if (!section) return;
    var prior = {number:rec.number,sectionId:section.sectionId,context:section.context,content:section.content,
      playbackDefault:VIEW_SET.indexOf(section.diagram.view)>=0 ? section.diagram.view : 'ambient'};
    if(options && options.reader && rec.viewport)prior.reader=rec.viewport.snapshotReaderState();
    if (rec.boardSize) prior.sizeMode = rec.boardSize.mode();
    if (rec.boardSize && rec.boardSize.snapshot) prior.boardNavigation = rec.boardSize.snapshot();
    if (rec.presentation){
      if(rec.presentation.viewId)prior.viewId=rec.presentation.viewId();
    }
    if(rec.presentation && rec.presentation.layoutId)prior.layoutId=rec.presentation.layoutId();
    if(ctl.views){var owner=ctl.views.owner(rec),view=ctl.views.current(rec);if(owner && view){prior.tabView=view.id;prior.tabViewLegacyLayout=view.legacy?view.legacyLayout:null;prior.tabViewSelected=owner.selected===rec;}}
    saved.push(prior);
    if (!stepper) return;
    if (stepper.path) prior.path = stepper.path();
    var route=diagramPathList(section.diagram).find(function(p){return p.id===prior.path;}) || diagramPathList(section.diagram)[0];
    var sourceSteps=section.diagram.steps || [];
    var steps=route.indices.map(function(i){return sourceSteps[i];});
    var sourceIndex=stepper.sourceIndex?stepper.sourceIndex():route.indices[stepper.current().n];
    var step=sourceSteps[sourceIndex];
    var id = step && typeof step.id === 'string' && step.id ? step.id : null;
    var signature = JSON.stringify(step);
    /* No positional fallback: repeated identities must not restore a different beat. */
    if (stepper.mode() === 'step' && (id
      ? steps.filter(function(s){ return s && s.id === id; }).length !== 1
      : steps.filter(function(s){ return JSON.stringify(s) === signature; }).length !== 1)) return;
    prior.mode = stepper.mode(); prior.id = id; prior.signature = signature;
  });
  return {sections:saved};
}
/* Authoring a legacy View materializes its generated ID as an explicit ID.
   That ID remains authoritative through Undo/Redo. Layout identity is needed
   only while the destination still derives its Views from section positions. */
function workbenchPreviewViewReference(ctl,rec,prior){
  var owner=ctl.views && ctl.views.owner(rec),authored=owner && owner.views && owner.views.some(function(view){return !view.legacy && view.id===prior.tabView && view.members.some(function(member){return member.record.runtime===rec;});});
  return prior.tabViewLegacyLayout && !authored?prior.tabViewLegacyLayout:prior.tabView;
}
function restoreWorkbenchPreview(page, ctl, saved, options){
  if (!saved) return;
  var sections = workbenchPreviewSections(page),matches=matchWorkbenchPreviewSections(saved.sections,sections);
  var restoredOwners=new Set();
  ctl.sections.forEach(function(rec){var prior=matches.get(rec.number-1),owner=ctl.views && ctl.views.owner(rec);if(prior && owner && !restoredOwners.has(owner) && prior.tabView){var reference=workbenchPreviewViewReference(ctl,rec,prior);if((reference!==prior.tabView?ctl.views.ensure(rec,reference,true):ctl.views.select(rec,reference,undefined,true)))restoredOwners.add(owner);}});
  ctl.sections.forEach(function(rec){var prior=matches.get(rec.number-1);if(prior && prior.tabViewSelected && ctl.views)ctl.views.ensure(rec,workbenchPreviewViewReference(ctl,rec,prior),true);});
  ctl.sections.forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    var prior=matches.get(rec.number-1);
    if (!section || !prior) return;
    if(rec.presentation && !(ctl.views && prior.tabView)){
      if(prior.viewId!=null && rec.presentation.setView)rec.presentation.setView(prior.viewId);
      else {
        if(rec.presentation.setLayout && prior.layoutId)rec.presentation.setLayout(prior.layoutId);
      }
    }
    if (rec.boardSize) rec.boardSize.setMode(prior.sizeMode);
    if (rec.boardSize && rec.boardSize.restore) rec.boardSize.restore(prior.boardNavigation);
    if (!stepper || !prior.mode || !(options && options.comparison) && prior.playbackDefault!==(VIEW_SET.indexOf(section.diagram.view)>=0 ? section.diagram.view : 'ambient')) return;
    if (prior.mode === 'ambient'){
      if(prior.path && stepper.selectPath && !stepper.selectPath(prior.path))return;
      if (stepper.mode() !== 'ambient') stepper.enterAmbient();
      return;
    }
    var indices = [];
    var route=diagramPathList(section.diagram).find(function(p){return p.id===prior.path;}) || (!section.diagram.paths && diagramPathList(section.diagram)[0]);
    if(!route)return;
    route.indices.forEach(function(i){
      var step=section.diagram.steps[i];
      if (prior.id ? step && step.id === prior.id : JSON.stringify(step) === prior.signature) indices.push(i);
    });
    if (indices.length !== 1) return;
    if (stepper.mode() !== 'step') stepper.enterStep(false);
    if(stepper.jumpSource){
      stepper.jumpSource(indices[0],prior.path);
      stepper.jump(stepper.current().n); /* restoration is settled, including hidden authored beats */
    }
    else if(stepper.current().n!==indices[0])stepper.jump(indices[0]);
  });
}
function renderWorkbenchPreview(view, page, skin, previousPage, previousCtl, lifecycle){
  var tabs = previousPage ? activeTabReferences(previousCtl) : null;
  var saved = previousPage ? workbenchPreviewSnapshot(previousPage, previousCtl) : null;
  if(lifecycle && lifecycle.beforeReplace)lifecycle.beforeReplace();
  if (previousCtl) previousCtl.destroy();
  var ctl = renderPage(view, page, skin, null, {autoplay:false,authoring:true,layoutTarget:'default'});
  /* An unpublished draft has no public document ID. Its controls deliberately
     use this Workbench document as a local/recovery base; Canon supplies its
     stable published route in library.workbench.js. */
  /* Practice chapters run in an opaque about:srcdoc frame. They deliberately
     have no durable public address, so leave their copy controls inert instead
     of aborting the practice bootstrap with an invalid fixed link base. */
  var linkBase=typeof window!=='undefined' && typeof fixedDeepLinkBase==='function'?
    fixedDeepLinkBase(String(window.location.href).split('#')[0],window):null;
  var links=typeof wireDeepLinks==='function' && linkBase?wireDeepLinks(ctl,window,null,{history:false,linkBase:linkBase}):null,destroy=ctl.destroy;
  ctl.destroy=function(){if(links)links.destroy();destroy();};
  try{
    restoreActiveTabs(ctl, tabs);
    restoreWorkbenchPreview(page, ctl, saved);
  }catch(ex){ctl.destroy();throw ex;}
  return ctl;
}

/* The full-page preview is a real reader controller. It borrows only the
   author's current reading position; no authoring option or listeners cross
   into the new surface. */
function workbenchReaderPreviewSnapshot(page,ctl){
  /* activeTarget is address-bar/navigation state and can lag the canvas that is
     actually being presented after an authoring rerender. The visible Explore
     section is authoritative when handing the reader its opening surface. */
  var activeExplore=(ctl.sections || []).find(function(rec){
    return rec.sectionEl && (rec.sectionEl.classList.contains('workspace-active-section') || rec.sectionEl.classList.contains('explore-active-section')) &&
      rec.viewport && rec.viewport.isExplore && rec.viewport.isExplore();
  });
  var target=activeExplore?{kind:'diagram',section:activeExplore.number}:
    ctl.activeTarget && Object.assign({},ctl.activeTarget);
  return {tabs:activeTabReferences(ctl),sections:workbenchPreviewSnapshot(page,ctl,{reader:true}),
    target:target,details:ctl.details && ctl.details.snapshot()};
}
/* A target's section number belongs to its old registry. Resolve it through
   the same stable section match used for playback before selecting a new tab. */
function restoreWorkbenchReaderPreviewSnapshot(page,ctl,saved){
  restoreActiveTabs(ctl,saved.tabs);restoreWorkbenchPreview(page,ctl,saved.sections,{comparison:true});
  var matches=matchWorkbenchPreviewSections(saved.sections.sections,workbenchPreviewSections(page));
  var oldNumber=saved.target && saved.target.section,rec=null,fallback=null;
  matches.forEach(function(prior,index){if(prior.number===oldNumber)rec=ctl.sections.find(function(r){return r.number===index+1;});});
  if(rec){
    if(rec.tabBlock)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false);
    if(ctl.views && !ctl.views.ensure(rec,undefined,true)){fallback='Section not included in a View; showing the opening section';rec=null;}
    if(rec){
      ctl.activeTarget={kind:'diagram',section:rec.number};
      var prior=matches.get(rec.number-1),stepper=rec.stepper,currentView=ctl.views && ctl.views.current(rec);
      var viewReference=workbenchPreviewViewReference(ctl,rec,prior);
      if(currentView && currentView.id!==viewReference && currentView.legacyLayout!==viewReference)fallback='Matching View unavailable; showing a View containing this section';
      if(prior.path && (!stepper || stepper.path()!==prior.path))fallback='Matching path unavailable; showing the section’s opening path';
      else if(prior.mode==='step' && (!stepper || prior.id && stepper.current().id!==prior.id))fallback='Matching step unavailable; showing the section’s opening step';
    }
  }
  if(saved.details && ctl.details)ctl.details.restore(saved.details);
  return {matches:matches,target:rec,missing:!!oldNumber && !rec,fallback:fallback || (oldNumber && !rec?'Section unavailable; showing the document’s opening section':null),page:page};
}
function restoreWorkbenchReaderCameras(ctl,restored){
  ctl.sections.forEach(function(rec){
    var prior=restored.matches.get(rec.number-1);if(!prior || !prior.reader || !rec.viewport)return;
    var fresh=rec.viewport.snapshotReaderState(),record=sectionRecords(restored.page)[rec.number-1],d=record.section.diagram || {};
    var definitions=diagramLayoutViews(d),active=rec.viewport.viewDefinition();
    if(active && !definitions.some(function(definition){return definition.id===active.id;}))definitions.push(active);
    // Carry only viewing coordinates. Old layout/panel geometry must never
    // conceal the proposed side's authored layout changes.
    definitions.forEach(function(definition){var old=prior.reader.memories[definition.id];if(!old)return;
      var memory=fresh.memories[definition.id] || (fresh.memories[definition.id]={panels:{},focus:false,layout:definition.exploreLayout || {}});
      memory.scroll=old.scroll;memory.zoom=old.zoom;memory.fitFloor=old.fitFloor;
    });
    rec.viewport.restoreReaderState(fresh);
  });
}
function renderWorkbenchReaderPreview(view,page,skin,authoringCtl,options){
  options=options || {};
  var saved=options.snapshot || workbenchReaderPreviewSnapshot(page,authoringCtl);
  var ctl=renderPage(view,page,skin,null,{autoplay:false,layoutTarget:options.layoutTarget});
  var linkBase=typeof window!=='undefined' && typeof fixedDeepLinkBase==='function'?
    fixedDeepLinkBase(String(window.location.href).split('#')[0],window):null;
  var links=typeof wireDeepLinks==='function' && linkBase?wireDeepLinks(ctl,window,null,{history:false,linkBase:linkBase}):null,destroy=ctl.destroy;
  ctl.destroy=function(){if(links)links.destroy();destroy();};
  ctl.suppressFragmentWrites=true;
  try{
    restoreActiveTabs(ctl,saved.tabs);restoreWorkbenchPreview(page,ctl,saved.sections);
    if(saved.target)ctl.activeTarget=saved.target;
    if(saved.details && ctl.details)ctl.details.restore(saved.details);
  }catch(ex){ctl.destroy();throw ex;}
  return ctl;
}

/* One owner for preview identity and controlled replacement outcomes. The host
   supplies presentation callbacks; callers never infer a render from DOM mutation. */
function createWorkbenchPreviewController(opts){
  var page=null,ctl=null,renderedText=null;
  function finish(outcome){if(opts.completed)opts.completed(outcome);return outcome;}
  function replace(next,text,skin,request){
    /* Rebuilding panels can force layout while the document is only partially
       mounted. Browsers then clamp/anchor the page (or Focus workspace scroller)
       to that temporary height. Restore after all synchronous reconciliation,
       before paint; no deferred scroll may override the user's next gesture. */
    var scroll=[];
    if(page && request.origin!=='project' && request.origin!=='import'){
      for(var el=opts.view;el;el=el.parentElement){
        if(typeof el.scrollTop==='number')scroll.push({el:el,x:el.scrollLeft,y:el.scrollTop});
      }
    }
    try{return rebuild(next,text,skin,request);}
    finally{
      scroll.forEach(function(saved){
        if(saved.el.isConnected===false)return;
        saved.el.scrollLeft=saved.x;saved.el.scrollTop=saved.y;
      });
    }
  }
  function rebuild(next,text,skin,request){
    var replaced=false,previousPage=request.origin==='project' || request.origin==='import' ? null : page,previousCtl=ctl;
    try{
      var nextCtl=renderWorkbenchPreview(opts.view,next,skin,previousPage,previousCtl,{
        beforeReplace:function(){
          if(opts.beforeReplace)opts.beforeReplace(request);
          replaced=true;page=null;ctl=null;renderedText=null;
        }
      });
    }catch(ex){
      // Invalid source never enters replacement. A renderer failure after teardown
      // cannot leave the retired controller advertised as a usable preview.
      if(replaced)opts.view.textContent='';
      opts.findings({errors:['Render failed: '+ex.message],warnings:[]});
      return finish({ok:false,replaced:replaced,text:text,reason:'render',error:ex,origin:request.origin});
    }
    page=next;ctl=nextCtl;renderedText=text;
    opts.present(skin);
    return finish({ok:true,replaced:true,text:text,origin:request.origin});
  }
  function retainExplore(next,text,request){
    var hint=request.origin==='edit' && request.retention && request.retention.exploreLayout;
    if(!hint || !page || !ctl || !Number.isInteger(hint.section) || hint.section<0 || typeof hint.id!=='string')return false;
    function target(doc){
      var record=sectionRecords(doc)[hint.section],d=record && record.section.diagram;
      var matches=d && Array.isArray(d.layouts)?d.layouts.filter(function(v){return v.id===hint.id;}):[];
      return matches.length===1?matches[0]:null;
    }
    var before=target(page),after=target(next),rec=(ctl.sections || []).find(function(r){return r.number===hint.section+1;});
    var presentation=rec && rec.presentation,effective=rec && rec.viewport && rec.viewport.viewDefinition();
    if(!before || !after || !effective || effective.presentation!=='explore' || !presentation || !presentation.viewId || presentation.viewId()!==hint.id || !presentation.adoptExploreLayout)return false;
    var candidate=JSON.parse(JSON.stringify(page)),candidateView=target(candidate);
    if(Object.prototype.hasOwnProperty.call(after,'exploreLayout'))candidateView.exploreLayout=after.exploreLayout;
    else delete candidateView.exploreLayout;
    // The hint is only an optimization request, never permission to skip any
    // other change. Keep the current model identity captured by live renderers.
    if(JSON.stringify(candidate)!==JSON.stringify(next) || !presentation.adoptExploreLayout(hint.id,after.exploreLayout))return false;
    if(Object.prototype.hasOwnProperty.call(after,'exploreLayout'))before.exploreLayout=JSON.parse(JSON.stringify(after.exploreLayout));
    else delete before.exploreLayout;
    renderedText=text;
    return finish({ok:true,replaced:false,retained:'explore',text:text,origin:request.origin});
  }
  return {
    render:function(text,request){
      request=request || {origin:'manual'};
      var raw;
      try{raw=JSON.parse(text);}catch(ex){
        opts.findings({errors:['JSON parse: '+ex.message],warnings:[]});
        return finish({ok:false,replaced:false,text:text,reason:'parse',origin:request.origin});
      }
      try{if(opts.resolve)raw=opts.resolve(raw);}catch(ex){
        opts.findings({errors:[ex.message],warnings:[]});return finish({ok:false,replaced:false,text:text,reason:'validation',origin:request.origin});
      }
      var next=normalize(raw),verdict=validate(next),lint=verdict.errors.length?[]:lintPage(next);
      opts.findings({errors:verdict.errors,warnings:verdict.warnings.concat(lint)});
      if(verdict.errors.length)return finish({ok:false,replaced:false,text:text,reason:'validation',origin:request.origin});
      var retained=retainExplore(next,text,request);if(retained)return retained;
      return replace(next,text,opts.skin(next),request);
    },
    repaint:function(skin){
      if(!page)return {ok:false,replaced:false,text:renderedText,reason:'missing',origin:'skin'};
      return replace(page,renderedText,skin,{origin:'skin'});
    },
    forgetDocument:function(){page=null;},
    controller:function(){return ctl;},page:function(){return page;},renderedText:function(){return renderedText;}
  };
}
