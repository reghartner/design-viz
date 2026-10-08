/* Draft storage and its single debounce lifetime. Browser APIs are injected;
   project/baseline policy belongs to the session, and no DOM is accessed here. */
function createBuilderPersistence(options){
  var draftKey='dv-workbench-draft', baselineKey='dv-workbench-baseline', archiveKey='dv-workbench-earlier-drafts';
  var timer=null, generation=0, disposed=false;
  function sameDraft(a,b){
    return a.text===b.text && a.baseline===b.baseline && a.ledger===b.ledger &&
      JSON.stringify(a.topologyContext)===JSON.stringify(b.topologyContext);
  }
  function archiveEntries(storage){
    var entries=JSON.parse(storage.getItem(archiveKey) || '[]');
    if(!Array.isArray(entries) || !entries.every(function(entry){return entry && typeof entry.text==='string';}))
      throw Error('Invalid earlier drafts');
    return entries;
  }
  function recentDrafts(entries){
    var recent=[];
    entries.forEach(function(entry){
      if(recent.length<2 && !recent.some(function(saved){return sameDraft(saved,entry);}))recent.push(entry);
    });
    return recent;
  }
  function read(){
    var draft=null, baseline=null;
    try {
      var saved=JSON.parse(options.storage().getItem(draftKey));
      if(saved && typeof saved.text==='string')draft=saved;
    } catch(ex){}
    try {
      var savedBaseline=JSON.parse(options.storage().getItem(baselineKey));
      if(savedBaseline && typeof savedBaseline.text==='string' && draft && savedBaseline.draftText===draft.text)
        baseline=savedBaseline.text;
    } catch(ex){}
    return {draft:draft,baseline:baseline};
  }
  function save(text,baseline,artifacts){
    if(disposed)return;
    try {
      var storage=options.storage();
      storage.setItem(baselineKey,JSON.stringify({text:baseline,draftText:text}));
      storage.setItem(draftKey,JSON.stringify(Object.assign({text:text,at:options.now()},artifacts && typeof artifacts.ledger==='string'?{ledger:artifacts.ledger}:{},artifacts && artifacts.topologyContext?{topologyContext:artifacts.topologyContext}:{})));
      if(options.status)options.status('saved');
    } catch(ex){if(options.status)options.status('unavailable'); /* unavailable storage does not prevent editing */ }
  }
  function cancel(){
    generation++;
    if(timer!=null)options.cancel(timer);
    timer=null;
  }
  return {
    read:read,save:save,
    archived:function(){
      try{
        var storage=options.storage(),entries=archiveEntries(storage),recent=recentDrafts(entries);
        if(recent.length===entries.length)return recent;
        try{storage.setItem(archiveKey,JSON.stringify(recent));return recent;}
        catch(ex){return entries;} // Keep every recoverable entry visible if compaction cannot be saved.
      }catch(ex){return [];} // Malformed archives are never overwritten.
    },
    preserve:function(text,baseline,artifacts){
      if(disposed || typeof text!=='string')return;
      // A direct Build handoff must not overwrite recovery data unless this
      // durable copy succeeds. Keep the exact text, including unfinished JSON.
      try{
        var storage=options.storage(),entries=archiveEntries(storage);
        var incoming=Object.assign({text:text,baseline:baseline,at:options.now()},artifacts && typeof artifacts.ledger==='string'?{ledger:artifacts.ledger}:{},artifacts && artifacts.topologyContext?{topologyContext:artifacts.topologyContext}:{});
        var recent=recentDrafts(entries);
        if(recent.length===entries.length && recent.length && sameDraft(recent[0],incoming))return;
        var previous=entries.find(function(entry){return !sameDraft(entry,incoming);});
        if(previous){
          try{storage.setItem(archiveKey,JSON.stringify([incoming,previous]));}
          catch(ex){storage.setItem(archiveKey,JSON.stringify([incoming]));} // A full browser may fit only the outgoing draft.
        }else storage.setItem(archiveKey,JSON.stringify([incoming]));
      }catch(ex){
        var failure=Error('Your earlier draft could not be saved. Download the current draft or free browser storage, then try again.');
        failure.code='DRAFT_ARCHIVE_FAILED';
        if(options.archiveFailure)options.archiveFailure(failure);
        throw failure;
      }
    },
    clear:function(){
      if(disposed)return;
      try {var storage=options.storage();storage.removeItem(draftKey);storage.removeItem(baselineKey);}catch(ex){}
    },
    schedule:function(saveCurrent){
      if(disposed)return;
      cancel();var token=generation;
      if(options.status)options.status('pending');
      timer=options.schedule(function(){
        if(disposed || token!==generation)return;
        timer=null;saveCurrent();
      },800);
    },
    cancel:cancel,
    destroy:function(){if(disposed)return;disposed=true;cancel();}
  };
}
