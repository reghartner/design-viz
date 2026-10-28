/* Draft storage and its single debounce lifetime. Browser APIs are injected;
   project/baseline policy belongs to the session, and no DOM is accessed here.
   Footprint and cleanup touch only the three recovery keys; which keys share the
   per-site quota is recorded in docs/workbench-modules.md (#406). */
function recoveryBytesLabel(bytes){
  if(!(bytes>0))return '0 KB';
  if(bytes<1048576)return Math.max(1,Math.round(bytes/1024))+' KB';
  return (bytes/1048576).toFixed(1).replace(/\.0$/,'')+' MB';
}
// Length plus two hashes: the baseline record names its draft without a second copy.
function recoveryDraftKey(text){
  var a=2166136261,b=5381;
  for(var i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return text.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
function recoveryExportName(entry){
  var title='';
  try{var raw=JSON.parse(entry.text);title=String((raw.page || raw).title || '');}catch(ex){}
  var slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
  return 'flowview-earlier-draft'+(slug?'-'+slug:'')+'.spec.json';
}
function createBuilderPersistence(options){
  var draftKey='dv-workbench-draft', baselineKey='dv-workbench-baseline', archiveKey='dv-workbench-earlier-drafts';
  var timer=null, generation=0, disposed=false;
  // A null baseline means "same as the text" (restore already reads it so).
  function baselineOf(entry){return entry.baseline==null?entry.text:entry.baseline;}
  function sameDraft(a,b){
    return a.text===b.text && baselineOf(a)===baselineOf(b) && a.ledger===b.ledger &&
      JSON.stringify(a.topologyContext)===JSON.stringify(b.topologyContext);
  }
  function validDraft(entry){return entry && typeof entry.text==='string';}
  function archiveEntries(storage){
    var entries=JSON.parse(storage.getItem(archiveKey) || '[]');
    if(!Array.isArray(entries) || !entries.every(validDraft))
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
  function withArtifacts(record,artifacts){
    return Object.assign(record,artifacts && typeof artifacts.ledger==='string'?{ledger:artifacts.ledger}:{},artifacts && artifacts.topologyContext?{topologyContext:artifacts.topologyContext}:{});
  }
  // UTF-16 code units, the unit browsers meter Web Storage in.
  function bytesOf(storage,key){var value=storage.getItem(key);return value==null?0:2*(key.length+value.length);}
  function read(){
    var draft=null, baseline=null;
    try {
      var saved=JSON.parse(options.storage().getItem(draftKey));
      if(saved && typeof saved.text==='string')draft=saved;
    } catch(ex){}
    try {
      var savedBaseline=JSON.parse(options.storage().getItem(baselineKey));
      if(savedBaseline && typeof savedBaseline.text==='string' && draft &&
        (savedBaseline.draftText===draft.text || savedBaseline.draftKey===recoveryDraftKey(draft.text)))
        baseline=savedBaseline.text;
    } catch(ex){}
    return {draft:draft,baseline:baseline};
  }
  function save(text,baseline,artifacts){
    if(disposed)return;
    try {
      var storage=options.storage();
      storage.setItem(baselineKey,JSON.stringify({text:baseline,draftKey:recoveryDraftKey(text)}));
      storage.setItem(draftKey,JSON.stringify(withArtifacts({text:text,at:options.now()},artifacts)));
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
        var storage=options.storage(),entries=JSON.parse(storage.getItem(archiveKey) || '[]');
        if(!Array.isArray(entries))return [];
        var readable=entries.filter(validDraft);
        if(readable.length!==entries.length)return readable; // Show valid legacy drafts without rewriting malformed bytes.
        var recent=recentDrafts(entries);
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
        var incoming=withArtifacts({text:text,baseline:baseline===text?null:baseline,at:options.now()},artifacts);
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
    footprint:function(){
      try{
        var storage=options.storage(),draft=bytesOf(storage,draftKey),baseline=bytesOf(storage,baselineKey),archive=bytesOf(storage,archiveKey),count=0;
        try{var entries=JSON.parse(storage.getItem(archiveKey) || '[]');count=Array.isArray(entries)?entries.length:(archive?1:0);}
        catch(ex){count=archive?1:0;}
        return {total:draft+baseline+archive,draft:draft,baseline:baseline,archive:archive,count:count};
      }catch(ex){return {total:0,draft:0,baseline:0,archive:0,count:0,unavailable:true};}
    },
    // An explicit removal may rewrite the archive; unreadable neighbours stay as they are.
    removeArchived:function(entry){
      if(disposed || !validDraft(entry))return {freed:0,removed:false};
      var storage=options.storage(),before=bytesOf(storage,archiveKey),entries;
      try{entries=JSON.parse(storage.getItem(archiveKey) || '[]');}catch(ex){return {freed:0,removed:false};}
      if(!Array.isArray(entries))return {freed:0,removed:false};
      var remaining=entries.filter(function(saved){return !(validDraft(saved) && sameDraft(saved,entry));});
      if(remaining.length===entries.length)return {freed:0,removed:false};
      if(remaining.length)storage.setItem(archiveKey,JSON.stringify(remaining));else storage.removeItem(archiveKey);
      return {freed:before-bytesOf(storage,archiveKey),removed:true};
    },
    // Frees Flowview's own recovery copies only. The current draft needs the explicit
    // choice; callers confirm it in the page first.
    cleanup:function(choice){
      if(disposed)return {freed:0,archive:0,draft:false};
      var storage=options.storage(),usage=this.footprint(),withDraft=!!(choice && choice.draft);
      storage.removeItem(archiveKey);
      if(withDraft){storage.removeItem(draftKey);storage.removeItem(baselineKey);}
      return {freed:usage.archive+(withDraft?usage.draft+usage.baseline:0),archive:usage.count,draft:withDraft};
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
