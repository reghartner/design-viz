/* Source/history/project policy without DOM ownership. Always read the source
   adapter at a transaction boundary: handwritten text may include invalid JSON
   or whitespace that has never been published through a builder command. */
function createBuilderSession(options){
  var persistence=options.persistence, recovered=persistence.read();
  var initialDraft=recovered.draft, recoveredBaseline=recovered.baseline;
  var baselineText=options.source.read(), projectOpen=!options.deferInitialSave;
  var undoStack=[], redoStack=[], target=null, insertSection=0;
  var importedText=null, projectUndoText=null, project=0, disposed=false;
  if(initialDraft && initialDraft.text===baselineText && recoveredBaseline!=null)baselineText=recoveredBaseline;
  function text(){return options.source.read();}
  function parse(value){
    try{return {raw:JSON.parse(value)};}
    catch(ex){return {error:'the JSON in the editor does not parse ('+ex.message+')'};}
  }
  function historyChanged(){if(options.historyChanged)options.historyChanged(!!undoStack.length,!!redoStack.length);}
  function pushUndo(value){
    importedText=null;undoStack.push(value);
    if(undoStack.length>30)undoStack.shift();
    redoStack.length=0;historyChanged();
  }
  function save(){if(disposed)return;projectOpen=true;persistence.save(text(),baselineText);}
  function render(origin,retention){return options.render({origin:origin,retention:retention || {}});}
  function historyStep(from,to,message){
    if(disposed || !from.length)return false;
    to.push(text());options.source.write(from.pop());historyChanged();target=null;
    var outcome=render('history');
    if(options.afterHistory)options.afterHistory(message,outcome);
    save();return true;
  }
  function invalidateProject(){
    if(disposed)return;
    project++;
    if(options.invalidateProject)options.invalidateProject();
    target=null;
  }
  function replaceProject(value,baseline,hooks){
    if(disposed)return false;
    invalidateProject();persistence.cancel();
    // A pending recovery is the first Undo target, never the boot demo.
    pushUndo(!projectOpen && initialDraft ? initialDraft.text : text());
    options.source.write(value);baselineText=baseline==null?value:baseline;
    projectUndoText=value;initialDraft=null;insertSection=0;
    if(hooks && hooks.beforeRender)hooks.beforeRender();
    var outcome=render('project');
    if(hooks && hooks.afterRender)hooks.afterRender(outcome);
    save();
    if(hooks && hooks.afterSave)hooks.afterSave();
    return true;
  }
  return {
    text:text,
    parse:function(){return parse(text());},
    snapshot:function(){
      var value=text(),parsed=parse(value);
      return {text:value,raw:parsed.raw,error:parsed.error,project:project,
        renderedText:options.renderedText?options.renderedText():null};
    },
    get target(){return target;},set target(value){if(!disposed)target=value;},
    get insertSection(){return insertSection;},set insertSection(value){if(!disposed)insertSection=value;},
    accept:function(plan,hooks){
      if(disposed || !plan || plan.error)return false;
      var before=text(),expected=hooks && hooks.snapshot;
      if(expected && (expected.text!==before || expected.project!==project))return false;
      pushUndo(before);
      if(hooks && hooks.beforePublish)hooks.beforePublish();
      options.source.write(plan.text);var outcome=render('edit',hooks && hooks.retention);save();
      if(hooks && hooks.afterRender)hooks.afterRender(plan,outcome);
      return true;
    },
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
    imported:function(){return importedText!=null && text()===importedText;},
    canUndoProject:function(){return projectUndoText!=null && text()===projectUndoText && !!undoStack.length;},
    clearProjectUndo:function(){if(!disposed)projectUndoText=null;},
    noteInput:function(){
      if(disposed)return;
      projectOpen=true;importedText=null;persistence.schedule(save);
    },
    save:save,markSaved:function(){if(!disposed)baselineText=text();},baseline:function(){return baselineText;},
    saveInitial:function(){if(!options.deferInitialSave && (!initialDraft || initialDraft.text===text()))save();},
    discardDraft:function(){if(disposed)return;persistence.clear();initialDraft=null;save();},
    draft:function(){return initialDraft?{text:initialDraft.text,at:initialDraft.at}:null;},
    isProjectOpen:function(){return projectOpen;},
    invalidateProject:invalidateProject,replaceProject:replaceProject,
    restoreDraft:function(hooks){
      if(disposed || !initialDraft)return false;
      var draft=initialDraft,missingBaseline=recoveredBaseline==null;
      replaceProject(draft.text,missingBaseline?draft.text:recoveredBaseline,hooks);
      return {missingBaseline:missingBaseline};
    },
    destroy:function(){if(disposed)return;disposed=true;project++;persistence.destroy();}
  };
}
