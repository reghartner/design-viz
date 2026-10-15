/* A working destination belongs to one mounted editor/document. The queue is
   shared across remounts so an already-started close finishes before new writes.
   Handles are deliberately not persisted: recovery after reload is browser-only. */
var builderWorkingFileQueues=new WeakMap();
function createBuilderWorkingFile(opts){
  var queue=builderWorkingFileQueues.get(opts.owner),association=null,disposed=false,revision=0;
  if(!queue){queue={pending:Promise.resolve()};builderWorkingFileQueues.set(opts.owner,queue);}
  function report(state,detail){
    if(!disposed && opts.changed)opts.changed({state:state,name:association?association.name:null,
      paired:!!(association && association.paired),detail:detail || '',connected:!!association});
  }
  function current(value){return !disposed && association===value;}
  function enqueue(action){var job=queue.pending.then(action);queue.pending=job.catch(function(){});return job;}
  function clear(message){
    var old=association;association=null;revision++;
    if(old && old.close){var closing=old.close();closing.catch(function(){});enqueue(function(){return closing;}).catch(function(){});}
    report('browser',message);return queue.pending;
  }
  function invalid(snapshot){try{return snapshot.error || opts.validate(snapshot.text);}catch(ex){return ex.message;}}
  function pending(){revision++;if(association)report(association.failed?'failed':'pending',association.failed);}
  function save(){
    var value=association,snapshot=opts.snapshot(),run=++revision;
    if(!value || disposed || value.external)return queue.pending;
    var error=value.flush?null:invalid(snapshot);
    if(error){report('paused','Repair the JSON. The last valid file is unchanged.');return queue.pending;}
    if(value.failed){report('failed',value.failed);return queue.pending;}
    if(!value.flush)report('saving');
    return enqueue(async function(){
      if(!current(value))return;
      function guard(){if(!current(value))throw Error('Working destination changed.');}
      try{
        if(value.flush)await value.flush();
        else{
          var source=snapshot.text;
          async function check(){guard();var found=await(await value.handle.getFile()).text();guard();
            if(found!==value.expected)throw Error('The file changed outside Flowview. Reopen it to review those changes; no outside edits were overwritten.');}
          await check();
          if(source!==value.expected){
            var stream=await value.handle.createWritable();
            try{await check();await stream.write(source);await check();await stream.close();value.expected=source;}
            catch(ex){try{await stream.abort();}catch(ignored){}throw ex;}
          }
        }
        if(!value.flush && current(value) && run===revision)report('saved',!value.paired && typeof snapshot.ledger==='string'?'Coverage ledger is in browser recovery. Choose its folder to save the pair.':'');
      }catch(ex){if(current(value)){value.failed=ex.message || String(ex);report('failed',value.failed);}}
    });
  }
  return {
    pending:pending,save:save,clear:clear,drain:function(){return queue.pending;},
    attach:function(value){
      clear();if(disposed)return;
      association=value;revision++;report(value.external?'saving':'saved');
    },
    attached:function(){return association;},
    report:function(value,state,detail){if(current(value)){if(state==='failed')value.failed=detail;else if(state==='saved')value.failed=null;report(state,detail);}},
    retry:async function(){
      var value=association;if(!value || disposed)return;
      try{
        // Called directly by the Retry click; never prompt from an autosave.
        if(value.handle && value.handle.requestPermission && await value.handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('Write permission was not granted. Retry or reopen the file.');
        if(!current(value))return;
        if(value.reconnectOnly)throw Error('Reopen the working folder to recover the interrupted connection.');
        value.failed=null;revision++;return value.retry?await value.retry():save();
      }catch(ex){if(current(value)){value.failed=ex.message;report('failed',value.failed);}}
    },
    destroy:function(){if(disposed)return;clear();disposed=true;}
  };
}

/* Same-folder export keeps working artifacts under their authoritative writer.
   Verify the raw authored snapshot, then omit redundant writes while the normal
   exporter writes its frozen HTML/README. Never rewrite JSON merely to stamp it. */
async function prepareBuilderWorkingExport(opts){
  var binding=opts.binding,dir=opts.directory,retained=new Map();
  if(!binding)return null;
  var sameFolder=binding.paired && (binding.handle===dir || dir.isSameEntry && await dir.isSameEntry(binding.handle));
  for(var file of opts.files){
    if(sameFolder && binding.artifacts && (file.name===binding.artifacts.spec || file.name===binding.artifacts.ledger))retained.set(file.name,null);
    else if(!binding.paired && file.name.endsWith('.spec.json')){
      try{var handle=await dir.getFileHandle(file.name);if(handle===binding.handle || handle.isSameEntry && await handle.isSameEntry(binding.handle))retained.set(file.name,null);}
      catch(ex){if(ex.name!=='NotFoundError')throw ex;}
    }
  }
  if(!retained.size)return null;
  function current(){if(!opts.current())throw Error('The working document changed after Export started. Retry Export with its current accepted state.');}
  current();await opts.flush();current();
  if(binding.failed)throw Error('Working file save needs attention: '+binding.failed);
  for(var name of retained.keys()){
    var text=await opts.readText(name),expected=name.endsWith('.ledger.md')?opts.ledger:opts.source;
    if(text!==expected)throw Error('The working artifacts changed outside Flowview. Reopen them to review the changes before exporting.');
    retained.set(name,text);
  }
  // A single-file grant never supplied a ledger. The explicit export-folder
  // grant lets us preserve any sibling evidence instead of writing a placeholder.
  if(!binding.paired && opts.ledger==null){
    for(var file of opts.files)if(file.name.endsWith('.ledger.md')){var notes=await opts.readText(file.name);if(notes!==null)retained.set(file.name,notes);}
  }
  async function guard(){
    current();
    for(var entry of retained){if(await opts.readText(entry[0])!==entry[1])throw Error('The working artifacts changed during Export. No outside edits were overwritten; review the files and retry the complete export.');}
    current();
  }
  await guard();return {skip:function(name){return retained.has(name);},guard:guard};
}
