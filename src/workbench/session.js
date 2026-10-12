/* Source/history/project policy without DOM ownership. Always read the source
   adapter at a transaction boundary: handwritten text may include invalid JSON
   or whitespace that has never been published through a builder command. */
/* Browser-only checkpoint payloads. The byte budget counts UTF-16 serialized
   storage, including escaped source and metadata; never silently evict a name. */
var BUILDER_CHECKPOINT_LIMIT=20, BUILDER_CHECKPOINT_BYTES=1024*1024;
function builderCheckpointName(value){return typeof value==='string'?value.trim():'';}
function builderCheckpointBytes(entries){return JSON.stringify(entries).length*2;}
function sanitizeBuilderCheckpoints(value){
  var kept=[];
  if(!Array.isArray(value))return kept;
  value.forEach(function(entry){
    if(!entry || typeof entry.id!=='string' || !entry.id || entry.id.length>100 || typeof entry.text!=='string' ||
      !Number.isFinite(entry.at) || entry.at<0)return;
    var name=builderCheckpointName(entry.name);
    if(!name || name.length>80 || kept.length>=BUILDER_CHECKPOINT_LIMIT || kept.some(function(saved){return saved.id===entry.id || saved.name.toLowerCase()===name.toLowerCase();}))return;
    var clean={id:entry.id,name:name,at:entry.at,text:entry.text};
    if(builderCheckpointBytes(kept.concat([clean]))<=BUILDER_CHECKPOINT_BYTES)kept.push(clean);
  });
  return kept;
}
function createBuilderSession(options){
  var persistence=options.persistence, recovered=persistence.read();
  var initialDraft=recovered.draft, recoveredBaseline=recovered.baseline;
  if(initialDraft && initialDraft.checkpoints)initialDraft=Object.assign({},initialDraft,{checkpoints:sanitizeBuilderCheckpoints(initialDraft.checkpoints)});
  var baselineText=options.source.read(), projectOpen=!options.deferInitialSave;
  var undoStack=[], redoStack=[], target=null, insertSection=0,historyVersion=0;
  var importedText=null, project=0, disposed=false;
  var topologyContext=null,topologyRevision=0;
  var checkpoints=sanitizeBuilderCheckpoints(initialDraft && initialDraft.text===baselineText?initialDraft.checkpoints:null),checkpointSequence=0;
  function resolve(raw,context){return typeof FlowTopology==='undefined'?raw:FlowTopology.resolveSource(raw,arguments.length>1?context:topologyContext);}
  function checkTopologyContext(nextContext){
    if(nextContext===topologyContext)return;
    if(!topologyContext){
      if(!nextContext || nextContext.ephemeral!==true)throw Error('The frozen Canon session changed. Reopen the picker.');
    }else{
      if(!nextContext || nextContext.id!==topologyContext.id || nextContext.catalogURL!==topologyContext.catalogURL || JSON.stringify(nextContext.catalog)!==JSON.stringify(topologyContext.catalog))throw Error('The frozen Canon session changed. Reopen the picker.');
      topologyContext.specs.forEach(function(spec){
        var next=nextContext.specs.find(function(item){return item.page.canon.id===spec.page.canon.id;});
        if(JSON.stringify(next)!==JSON.stringify(spec))throw Error('An existing frozen provider cannot be replaced.');
      });
    }
  }
  function artifacts(){return Object.assign({},options.artifacts?options.artifacts():{},topologyContext?{topologyContext:topologyContext}:{},checkpoints.length?{checkpoints:checkpoints}:{});}
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
  function save(){if(disposed)return;projectOpen=true;if(options.artifacts || topologyContext || checkpoints.length)persistence.save(text(),baselineText,artifacts());else persistence.save(text(),baselineText);}
  function render(origin,retention){return options.render({origin:origin,retention:retention || {}});}
  function historyStep(from,to,message){
    if(disposed || !from.length)return false;
    var entry=from[from.length-1];
    if(typeof entry!=='string'){
      var captured=entry.capture?entry.capture():entry.after;
      var restored=entry.restore(entry.before);if(restored===false)return false;
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
    if(projectOpen){if(options.artifacts || topologyContext || checkpoints.length)persistence.preserve(text(),baselineText,artifacts());else persistence.preserve(text(),baselineText);}
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
    checkpoints=sanitizeBuilderCheckpoints(hooks && hooks.checkpoints);
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
    checkpoints:function(){return checkpoints.map(function(entry){return Object.assign({},entry);});},
    checkpointLimits:function(){return {count:BUILDER_CHECKPOINT_LIMIT,bytes:BUILDER_CHECKPOINT_BYTES,used:builderCheckpointBytes(checkpoints)};},
    saveCheckpoint:function(name,id){
      if(disposed)return {error:'This project is closed.'};
      name=builderCheckpointName(name);
      if(!name || name.length>80)return {error:'Use a checkpoint name of 1–80 characters.'};
      if(checkpoints.some(function(entry){return entry.id!==id && entry.name.toLowerCase()===name.toLowerCase();}))return {error:'A checkpoint already has that name. Choose another name.'};
      var existing=id && checkpoints.find(function(entry){return entry.id===id;});
      if(id && !existing)return {error:'This checkpoint is no longer available.'};
      if(existing && existing.name===name)return {id:id,unchanged:true};
      var at=options.now?options.now():Date.now(),entry=existing?Object.assign({},existing,{name:name}):{id:'checkpoint-'+at+'-'+(++checkpointSequence),name:name,at:at,text:text()};
      while(!existing && checkpoints.some(function(saved){return saved.id===entry.id;}))entry.id='checkpoint-'+at+'-'+(++checkpointSequence);
      var next=existing?checkpoints.map(function(saved){return saved.id===id?entry:saved;}):[entry].concat(checkpoints);
      if(next.length>BUILDER_CHECKPOINT_LIMIT || builderCheckpointBytes(next)>BUILDER_CHECKPOINT_BYTES)return {error:'History is full (20 checkpoints or 1 MiB). Delete a checkpoint before saving another.'};
      checkpoints=next;save();return {id:entry.id};
    },
    deleteCheckpoint:function(id){
      if(disposed || !checkpoints.some(function(entry){return entry.id===id;}))return false;
      checkpoints=checkpoints.filter(function(entry){return entry.id!==id;});save();return true;
    },
    restoreCheckpoint:function(id,expected){
      if(disposed || !expected || expected.project!==project || expected.text!==text() || expected.topologyRevision!==topologyRevision)return false;
      var entry=checkpoints.find(function(saved){return saved.id===id;});
      if(!entry || entry.text===text())return false;
      pushUndo(text());options.source.write(entry.text);target=null;
      var outcome=render('history');
      if(options.afterCheckpoint)options.afterCheckpoint(outcome);
      save();return true;
    },
    resolve:resolve,
    topologyContext:function(){return topologyContext?JSON.parse(JSON.stringify(topologyContext)):null;},
    connectTopology:function(context,expected){
      if(disposed || !expected || expected.text!==text() || expected.project!==project)return false;
      checkTopologyContext(context);resolve(JSON.parse(text()),context);
      topologyContext=JSON.parse(JSON.stringify(context));topologyRevision++;save();return true;
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
      projectOpen=true;importedText=null;persistence.schedule(save);
    },
    save:save,markSaved:function(){if(!disposed)baselineText=text();},baseline:function(){return baselineText;},
    saveInitial:function(){if(!options.deferInitialSave && (!initialDraft || initialDraft.text===text()))save();},
    discardDraft:function(){if(disposed)return;persistence.clear();initialDraft=null;save();},
    draft:function(){return initialDraft?{text:initialDraft.text,at:initialDraft.at}:null;},
    preserveDraft:preserveDraft,
    resetHistory:function(){undoStack.length=redoStack.length=0;historyVersion++;historyChanged();},
    earlierDrafts:persistence.archived,
    restoreEarlierDraft:function(entry,hooks){
      if(!entry || typeof entry.text!=='string')return false;
      var ok=replaceProject(entry.text,entry.baseline,Object.assign({},hooks,{topologyContext:entry.topologyContext,checkpoints:entry.checkpoints}));if(ok && options.restoreArtifacts){options.restoreArtifacts(entry);save();}return ok;
    },
    isProjectOpen:function(){return projectOpen;},
    invalidateProject:invalidateProject,replaceProject:replaceProject,
    restoreDraft:function(hooks){
      if(disposed || !initialDraft)return false;
      var draft=initialDraft,missingBaseline=recoveredBaseline==null;
      replaceProject(draft.text,missingBaseline?draft.text:recoveredBaseline,Object.assign({},hooks,{topologyContext:draft.topologyContext,checkpoints:draft.checkpoints}));
      if(options.restoreArtifacts){options.restoreArtifacts(draft);save();}
      return {missingBaseline:missingBaseline};
    },
    destroy:function(){if(disposed)return;disposed=true;project++;undoStack.length=redoStack.length=0;persistence.destroy();}
  };
}
