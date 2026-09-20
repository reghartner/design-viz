/* Draft storage and its single debounce lifetime. Browser APIs are injected;
   project/baseline policy belongs to the session, and no DOM is accessed here. */
function createBuilderPersistence(options){
  var draftKey='dv-workbench-draft', baselineKey='dv-workbench-baseline';
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
  function save(text,baseline){
    if(disposed)return;
    try {
      var storage=options.storage();
      storage.setItem(baselineKey,JSON.stringify({text:baseline,draftText:text}));
      storage.setItem(draftKey,JSON.stringify({text:text,at:options.now()}));
    } catch(ex){ /* unavailable storage does not prevent editing */ }
  }
  function cancel(){
    generation++;
    if(timer!=null)options.cancel(timer);
    timer=null;
  }
  return {
    read:read,save:save,
    clear:function(){
      if(disposed)return;
      try {var storage=options.storage();storage.removeItem(draftKey);storage.removeItem(baselineKey);}catch(ex){}
    },
    schedule:function(saveCurrent){
      if(disposed)return;
      cancel();var token=generation;
      timer=options.schedule(function(){
        if(disposed || token!==generation)return;
        timer=null;saveCurrent();
      },800);
    },
    cancel:cancel,
    destroy:function(){if(disposed)return;disposed=true;cancel();}
  };
}
