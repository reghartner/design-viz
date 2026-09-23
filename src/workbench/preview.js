/* Preview position and layout never enter the spec or undo history. */
function workbenchPreviewSections(page){
  var sections = [];
  if (!page) return sections;
  function add(sec, tab){
    var d = sec.diagram || {};
    sections.push({diagram:d, key:JSON.stringify([tab, sec.heading || '',
      Object.keys(d.nodes || {}).sort(), VIEW_SET.indexOf(d.view) >= 0 ? d.view : 'ambient'])});
  }
  blocksOf(page).forEach(function(block){
    if (block.type === 'section') add(block.sec, null);
    else block.tabs.forEach(function(tab){ tab.sections.forEach(function(sec){ add(sec, tab.label); }); });
  });
  return sections;
}
function workbenchPreviewSnapshot(page, ctl){
  var sections = workbenchPreviewSections(page), saved = [];
  ((ctl && ctl.sections) || []).forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    if (!section || sections.filter(function(s){ return s.key === section.key; }).length !== 1) return;
    var prior = {key:section.key};
    if (rec.boardSize) prior.sizeMode = rec.boardSize.mode();
    if (rec.flowDisclosure){ prior.flowOpen = rec.flowDisclosure.open; prior.primaryPanel = section.diagram.primaryPanel; }
    if (rec.presentation){ prior.focusMode = rec.presentation.mode(); prior.focusPanel = rec.presentation.panelId; }
    if(rec.presentation && rec.presentation.layoutId)prior.layoutId=rec.presentation.layoutId();
    if (rec.presentation && rec.presentation.diagramVisible){
      prior.layoutFlowVisible = rec.presentation.diagramVisible();
      prior.layoutConfig = JSON.stringify([section.diagram.sectionLayout,section.diagram.layouts]);
    }
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
  return {title:page && page.title || '', sections:saved};
}
function restoreWorkbenchPreview(page, ctl, saved){
  if (!saved || (page.title || '') !== saved.title) return;
  var sections = workbenchPreviewSections(page);
  ctl.sections.forEach(function(rec){
    var section = sections[rec.number - 1], stepper = rec.stepper;
    if (!section || sections.filter(function(s){ return s.key === section.key; }).length !== 1) return;
    var matches = saved.sections.filter(function(s){ return s.key === section.key; });
    if (matches.length !== 1) return;
    var prior = matches[0];
    if(rec.presentation && rec.presentation.setLayout && prior.layoutId)rec.presentation.setLayout(prior.layoutId);
    if (rec.presentation && rec.presentation.setDiagramVisible && prior.layoutConfig===JSON.stringify([section.diagram.sectionLayout,section.diagram.layouts]) &&
        (!rec.presentation.layoutId || rec.presentation.layoutId()===prior.layoutId)) rec.presentation.setDiagramVisible(prior.layoutFlowVisible);
    if (rec.boardSize) rec.boardSize.setMode(prior.sizeMode);
    if (rec.flowDisclosure && typeof prior.flowOpen === 'boolean' && prior.primaryPanel === section.diagram.primaryPanel)
      rec.flowDisclosure.open = prior.flowOpen;
    if (rec.presentation && prior.focusPanel === rec.presentation.panelId && prior.primaryPanel === section.diagram.primaryPanel)
      rec.presentation.setMode(prior.focusMode);
    if (!stepper || !prior.mode) return;
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
  var tabs = activeTabReferences(previousCtl);
  var saved = workbenchPreviewSnapshot(previousPage, previousCtl);
  if(lifecycle && lifecycle.beforeReplace)lifecycle.beforeReplace();
  if (previousCtl) previousCtl.destroy();
  var target = typeof document !== 'undefined' && document.getElementById ? document.getElementById('layout-preview-target') : null;
  var ctl = renderPage(view, page, skin, null, {autoplay:false,authoring:true,layoutTarget:target ? target.value : (typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search).get('layout') : 'default')});
  try{
    restoreActiveTabs(ctl, tabs);
    restoreWorkbenchPreview(page, ctl, saved);
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
    var replaced=false,previousPage=page,previousCtl=ctl;
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
  return {
    render:function(text,request){
      request=request || {origin:'manual'};
      var raw;
      try{raw=JSON.parse(text);}catch(ex){
        opts.findings({errors:['JSON parse: '+ex.message],warnings:[]});
        return finish({ok:false,replaced:false,text:text,reason:'parse',origin:request.origin});
      }
      var next=normalize(raw),verdict=validate(next),lint=verdict.errors.length?[]:lintPage(next);
      opts.findings({errors:verdict.errors,warnings:verdict.warnings.concat(lint)});
      if(verdict.errors.length)return finish({ok:false,replaced:false,text:text,reason:'validation',origin:request.origin});
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
