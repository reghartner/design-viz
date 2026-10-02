/* Draft storage and its single debounce lifetime. Browser APIs are injected;
   project/baseline policy belongs to the session, and no DOM is accessed here. */
function createBuilderPersistence(options){
  var draftKey='dv-workbench-draft', baselineKey='dv-workbench-baseline', archiveKey='dv-workbench-earlier-drafts';
  var timer=null, generation=0, disposed=false;
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
      try{var entries=JSON.parse(options.storage().getItem(archiveKey) || '[]');return Array.isArray(entries)?entries.filter(function(entry){return entry && typeof entry.text==='string';}):[];}catch(ex){return [];}
    },
    preserve:function(text,baseline,artifacts){
      if(disposed || typeof text!=='string')return;
      // A direct Build handoff must not overwrite recovery data unless this
      // durable copy succeeds. Keep the exact text, including unfinished JSON.
      try{
        var storage=options.storage(),entries=JSON.parse(storage.getItem(archiveKey) || '[]');
        if(!Array.isArray(entries))throw Error('Invalid earlier drafts');
        if(!entries.some(function(entry){return entry && entry.text===text && entry.baseline===baseline && entry.ledger===(artifacts && artifacts.ledger!==undefined?artifacts.ledger:undefined) && JSON.stringify(entry.topologyContext)===JSON.stringify(artifacts && artifacts.topologyContext);})){
          entries.unshift(Object.assign({text:text,baseline:baseline,at:options.now()},artifacts && typeof artifacts.ledger==='string'?{ledger:artifacts.ledger}:{},artifacts && artifacts.topologyContext?{topologyContext:artifacts.topologyContext}:{}));
          storage.setItem(archiveKey,JSON.stringify(entries));
        }
      }catch(ex){throw Error('Your earlier draft could not be saved. Save it to a file or free browser storage, then try again.');}
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
