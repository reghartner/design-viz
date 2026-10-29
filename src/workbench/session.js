/* Source/history/project policy without DOM ownership. Always read the source
   adapter at a transaction boundary: handwritten text may include invalid JSON
   or whitespace that has never been published through a builder command. */
function createBuilderSession(options){
  var persistence=options.persistence, recovered=persistence.read();
  var initialDraft=recovered.draft, recoveredBaseline=recovered.baseline;
  var baselineText=options.source.read(), projectOpen=!options.deferInitialSave;
  var undoStack=[], redoStack=[], target=null, insertSection=0,historyVersion=0;
  var importedText=null, project=0, disposed=false;
  var topologyContext=null,topologyRevision=0;
  function resolve(raw,context){return typeof FlowTopology==='undefined'?raw:FlowTopology.resolveSource(raw,arguments.length>1?context:topologyContext);}
  function checkTopologyContext(nextContext){
    if(nextContext===topologyContext)return;
    if(!topologyContext){
      if(!nextContext || nextContext.ephemeral!==true)throw Error('The frozen Canon session changed. Reopen the picker.');
    }else{
      if(!nextContext || nextContext.id!==topologyContext.id || nextContext.catalogURL!==topologyContext.catalogURL)throw Error('The frozen Canon session changed. Reopen the picker.');
      // A later index may replace the pinned catalog only while every frozen
      // provider keeps its published revision (#592 refresh).
      if(JSON.stringify(nextContext.catalog)!==JSON.stringify(topologyContext.catalog) && !catalogCompatible(topologyContext,nextContext))throw Error('A provider frozen in this session was republished. Reopen the diagram to use the latest deployment.');
      topologyContext.specs.forEach(function(spec){
        var next=nextContext.specs.find(function(item){return item.page.canon.id===spec.page.canon.id;});
        if(JSON.stringify(next)!==JSON.stringify(spec))throw Error('An existing frozen provider cannot be replaced.');
      });
    }
  }
  function catalogCompatible(current,next){
    var before=current.catalog,after=next.catalog;
    if(!before || !after || before.version!==3 || after.version!==3 || !Array.isArray(after.diagrams))return false;
    var revisions=new Map(after.diagrams.map(function(entry){return [entry.id,entry.revision];}));
    return current.specs.every(function(spec){
      var entry=(before.diagrams || []).find(function(item){return item.id===spec.page.canon.id;});
      return !entry || revisions.get(entry.id)===entry.revision;
    });
  }
  function artifacts(){return Object.assign({},options.artifacts?options.artifacts():{},topologyContext?{topologyContext:topologyContext}:{});}
  if(initialDraft && initialDraft.text===baselineText && recoveredBaseline!=null)baselineText=recoveredBaseline;
  function text(){return options.source.read();}
  function parse(value){
    try{return {raw:JSON.parse(value)};}
    catch(ex){return {error:'the JSON in the editor does not parse ('+ex.message+')'};}
  }
  function historyChanged(){if(options.historyChanged)options.historyChanged(!!undoStack.length,!!redoStack.length);}
  function pushUndo(value){
    historyVersion++;
    importedText=null;undoStack.push(value);
    if(undoStack.length>30)undoStack.shift();
    redoStack.length=0;historyChanged();
  }
  function save(){if(disposed)return;projectOpen=true;if(options.artifacts || topologyContext)persistence.save(text(),baselineText,artifacts());else persistence.save(text(),baselineText);if(options.saveWorking)options.saveWorking();}
  function render(origin,retention){return options.render({origin:origin,retention:retention || {}});}
  function historyStep(from,to,message){
    if(disposed || !from.length)return false;
    var entry=from[from.length-1];
    if(typeof entry!=='string'){
      var captured=entry.capture?entry.capture():entry.after;
      var restored=entry.restore(entry.before,message);if(restored===false)return false;
      if(restored==='expired'){from.pop();historyVersion++;historyChanged();return historyStep(from,to,message);}
      from.pop();to.push({kind:entry.kind,capture:entry.capture,restore:entry.restore,before:captured,after:entry.before});
      historyVersion++;historyChanged();return true;
    }
    historyVersion++;
    to.push(text());options.source.write(from.pop());historyChanged();target=null;
    var outcome=render('history');
    if(options.afterHistory)options.afterHistory(message,outcome);
    save();return true;
  }
  function preserveDraft(){
    if(projectOpen){if(options.artifacts || topologyContext)persistence.preserve(text(),baselineText,artifacts());else persistence.preserve(text(),baselineText);}
    else if(initialDraft)persistence.preserve(initialDraft.text,recoveredBaseline,initialDraft);
  }
  function invalidateProject(policy){
    if(disposed)return;
    // Leaving for Home retires async work, but returning to this same document
    // keeps its source and panel history. A replacement starts a fresh history.
    if(!policy || policy.preserveHistory!==true){
      undoStack.length=redoStack.length=0;importedText=null;historyVersion++;historyChanged();
    }
    project++;
    if(options.invalidateProject)options.invalidateProject(policy);
    target=null;
  }
  function replaceProject(value,baseline,hooks){
    if(disposed)return false;
    // Archive first: failure must leave the current document and history intact.
    preserveDraft();invalidateProject();persistence.cancel();
    topologyContext=hooks && hooks.topologyContext?JSON.parse(JSON.stringify(hooks.topologyContext)):null;
    topologyRevision++;
    options.source.write(value);baselineText=baseline==null?value:baseline;
    initialDraft=null;insertSection=0;
    if(hooks && hooks.beforeRender)hooks.beforeRender();
    var outcome=render('project');
    if(hooks && hooks.afterRender)hooks.afterRender(outcome);
    save();
    if(hooks && hooks.afterSave)hooks.afterSave();
    return true;
  }
  return {
    text:text,
    resolve:resolve,
    topologyContext:function(){return topologyContext?JSON.parse(JSON.stringify(topologyContext)):null;},
    connectTopology:function(context,expected){
      if(disposed || !expected || expected.text!==text() || expected.project!==project)return false;
      checkTopologyContext(context);resolve(JSON.parse(text()),context);
      topologyContext=JSON.parse(JSON.stringify(context));topologyRevision++;save();return true;
    },
    refreshLocalTopology:function(context,expected){
      if(disposed || !expected || expected.text!==text() || expected.project!==project || expected.topologyRevision!==topologyRevision)return false;
      if(!topologyContext || !topologyContext.local || !context || !context.local || context.id!==topologyContext.id)throw Error('Refresh local sources requires the current local repository snapshot.');
      var raw=JSON.parse(text());resolve(raw,context);
      function content(value){return JSON.stringify(value.specs.map(function(spec){return spec.page.canon.id===value.id?{page:{canon:spec.page.canon}}:spec;}).sort(function(a,b){return a.page.canon.id.localeCompare(b.page.canon.id);}));}
      if(content(context)===content(topologyContext))return 'unchanged';
      function capture(){return {text:text(),context:JSON.parse(JSON.stringify(topologyContext))};}
      function restore(value,message){
        var previous=capture(),outcome;
        topologyContext=JSON.parse(JSON.stringify(value.context));
        if(text()!==value.text)options.source.write(value.text);
        try{
          outcome=render('history');
          if(outcome && outcome.ok===false)throw Error('The refreshed topology could not be rendered.');
        }catch(error){
          topologyContext=previous.context;if(text()!==previous.text)options.source.write(previous.text);
          try{render('history');}catch(ignored){}
          throw error;
        }
        topologyRevision++;target=null;save();
        if(options.topologyChanged)options.topologyChanged();
        if(message && options.afterHistory)options.afterHistory(message,outcome);
        return true;
      }
      var before=capture(),after={text:text(),context:JSON.parse(JSON.stringify(context))};
      restore(after);
      pushUndo({kind:'topology',capture:capture,restore:restore,before:before,after:after});return true;
    },
    openFolder:function(context,expected){
      if(disposed || !expected || expected.text!==text() || expected.project!==project || expected.topologyRevision!==topologyRevision)return false;
      // Sharing the current draft keeps its project, baseline and fresh preview.
      // Validate before archival/history changes; context comes from preparation.
      resolve(JSON.parse(text()),context);preserveDraft();
      if(JSON.stringify(context || null)!==JSON.stringify(topologyContext)){
        topologyContext=context?JSON.parse(JSON.stringify(context)):null;topologyRevision++;
      }
      undoStack.length=redoStack.length=0;importedText=null;historyVersion++;historyChanged();
      if(options.renderedText && options.renderedText()!==text())render('edit');
      save();return true;
    },
    validate:function(raw,context){try{return validate(normalize(resolve(raw,arguments.length>1?context:topologyContext)));}catch(ex){return {errors:[ex.message],warnings:[]};}},
    parse:function(){return parse(text());},
    snapshot:function(){
      var value=text(),parsed=parse(value);
      return {text:value,raw:parsed.raw,error:parsed.error,project:project,topologyRevision:topologyRevision,
        renderedText:options.renderedText?options.renderedText():null};
    },
    get target(){return target;},set target(value){if(!disposed)target=value;},
    get insertSection(){return insertSection;},set insertSection(value){if(!disposed)insertSection=value;},
    accept:function(plan,hooks){
      if(disposed || !plan || plan.error)return false;
      var before=text(),expected=hooks && hooks.snapshot;
      if(expected && (expected.text!==before || expected.project!==project))return false;
      /* Locks are pins (#617): re-pin locked nodes this plan moved, in the same
         undo step. exactSource (Agent proposals) publishes the reviewed text
         unchanged; file import pins only within the same document (#628). */
      var guard=!(hooks && hooks.exactSource) && (!(hooks && hooks.lockGuard==='same-document') || builderSameDocument(before,plan.text));
      if(guard && typeof builderPinMovedLocks==='function'){
        var pinned=builderPinMovedLocks(before,plan.text);
        if(pinned){
          pinned.edits.forEach(function(edit){if(typeof plan.start==='number' && edit.at<=plan.start){plan.start+=edit.delta;if(typeof plan.end==='number')plan.end+=edit.delta;}});
          plan.text=pinned.text;
        }
      }
      var nextContext=hooks && hooks.topologyContext || topologyContext;
      if(nextContext){
        try{
          checkTopologyContext(nextContext);
          resolve(JSON.parse(plan.text),nextContext);
        }catch(ex){plan.error=ex.message;if(options.editError)options.editError(plan.error);return false;}
      }
      if(typeof FlowTopology!=='undefined'){
        var topologyError=FlowTopology.editError(parse(before).raw,parse(plan.text).raw);
        if(topologyError){plan.error=topologyError;if(options.editError)options.editError(topologyError);return false;}
      }
      pushUndo(hooks && hooks.history || before);
      if(nextContext!==topologyContext){topologyContext=JSON.parse(JSON.stringify(nextContext));topologyRevision++;}
      if(hooks && hooks.beforePublish)hooks.beforePublish();
      options.source.write(plan.text);var outcome=render('edit',hooks && hooks.retention);save();
      if(hooks && hooks.afterRender)hooks.afterRender(plan,outcome);
      if(outcome && outcome.restorePanelMenu)outcome.restorePanelMenu();
      return true;
    },
    restoreHistoryText:function(value){
      if(disposed)return false;
      options.source.write(value);target=null;render('history',{});save();return true;
    },
    rememberView:function(change){
      if(disposed || !change || typeof change.restore!=='function' || JSON.stringify(change.before)===JSON.stringify(change.after))return false;
      pushUndo({restore:change.restore,before:change.before,after:change.after});return true;
    },
    historyType:function(redo){var stack=redo?redoStack:undoStack;return !stack.length?null:typeof stack[stack.length-1]==='string'?'source':stack[stack.length-1].kind || 'view';},
    importText:function(value,hooks){
      if(disposed)return false;
      pushUndo(text());options.source.write(value);
      if(hooks && hooks.rememberImport)importedText=value;
      if(hooks && hooks.beforeRender)hooks.beforeRender();
      var outcome=render('import');
      if(hooks && hooks.afterRender)hooks.afterRender(outcome);
      save();return true;
    },
    undo:function(){return historyStep(undoStack,redoStack,'undid the last builder action — board re-rendered');},
    redo:function(){return historyStep(redoStack,undoStack,'redid the builder action — board re-rendered');},
    canUndo:function(){return !!undoStack.length;},canRedo:function(){return !!redoStack.length;},
    historyVersion:function(){return historyVersion;},
    imported:function(){return importedText!=null && text()===importedText;},
    noteInput:function(){
      if(disposed)return;
      historyVersion++;
      projectOpen=true;importedText=null;if(options.pendingWorking)options.pendingWorking();persistence.schedule(save);
    },
    save:save,markSaved:function(){if(!disposed)baselineText=text();},baseline:function(){return baselineText;},
    saveInitial:function(){if(!options.deferInitialSave && (!initialDraft || initialDraft.text===text()))save();},
    discardDraft:function(){if(disposed)return;persistence.clear();initialDraft=null;save();},
    draft:function(){return initialDraft?{text:initialDraft.text,at:initialDraft.at}:null;},
    forgetDraft:function(){if(!disposed){initialDraft=null;recoveredBaseline=null;}}, // Storage removal is the persistence cleanup.
    preserveDraft:preserveDraft,
    resetHistory:function(){undoStack.length=redoStack.length=0;historyVersion++;historyChanged();},
    earlierDrafts:persistence.archived,
    restoreEarlierDraft:function(entry,hooks){
      if(!entry || typeof entry.text!=='string')return false;
      var ok=replaceProject(entry.text,entry.baseline,Object.assign({},hooks,{topologyContext:entry.topologyContext}));if(ok && options.restoreArtifacts){options.restoreArtifacts(entry);save();}return ok;
    },
    isProjectOpen:function(){return projectOpen;},
    invalidateProject:invalidateProject,replaceProject:replaceProject,
    restoreDraft:function(hooks){
      if(disposed || !initialDraft)return false;
      var draft=initialDraft,missingBaseline=recoveredBaseline==null;
      replaceProject(draft.text,missingBaseline?draft.text:recoveredBaseline,Object.assign({},hooks,{topologyContext:draft.topologyContext}));
      if(options.restoreArtifacts){options.restoreArtifacts(draft);save();}
      return {missingBaseline:missingBaseline};
    },
    destroy:function(){if(disposed)return;disposed=true;project++;undoStack.length=redoStack.length=0;persistence.destroy();}
  };
}
