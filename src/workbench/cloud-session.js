/* Cloud persistence has its own attachment/operation lifetime. Only the exact
   authored artifact envelope crosses the API; local agent protocol files never
   enter this module. Transport and recovery adapters are injected for tests. */
function createCloudProjectSession(options){
  var attachment=null,epoch=0,pending=null,busy=false,disposed=false,loading=0,recoveryFailure='';
  function snap(){var s=options.snapshot();return {version:1,source:s.source,ledger:typeof s.ledger==='string'?s.ledger:null,topologyContext:s.topologyContext || null};}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function status(state,detail){if(!disposed && options.status)options.status({state:state,detail:[detail,recoveryFailure].filter(Boolean).join(' '),project:attachment && Object.assign({},attachment)});}
  function recover(value){var project=attachment && Object.assign({},attachment);if(project)delete project.saved;var operation=pending && Object.assign({},pending);if(operation && same(operation.envelope,value))operation.envelope=null;options.recover({project:project,envelope:value,operation:operation});}
  function detach(){epoch++;loading++;attachment=null;pending=null;busy=false;status('detached');}
  function changed(){if(!attachment || disposed)return;loading++;try{recover(snap());recoveryFailure='';}catch(error){recoveryFailure=error.message;}status('pending');}
  async function save(name){
    if(disposed || busy)return;
    if(!attachment){if(!name)return;attachment={projectId:null,revision:0,name:name};}
    var current=attachment,run=epoch;
    if(!pending && current.saved && same(current.saved,snap())){status('saved');return;}
    if(!pending)pending={operationId:options.uuid(),envelope:snap(),baseRevision:current.revision};
    var operation=pending;
    try{recover(snap());recoveryFailure='';}catch(error){recoveryFailure=error.message;}
    busy=true;status('saving');
    function active(){return !disposed && run===epoch && attachment===current;}
    try{
      var prepared=await options.api('POST','/uploads',{operationId:operation.operationId,projectId:current.projectId,baseRevision:operation.baseRevision,name:current.name});
      if(!active())return;
      var result=prepared.committed;
      if(!result){await options.upload(prepared.uploadUrl,operation.envelope);if(!active())return;result=await options.api('POST','/uploads/'+operation.operationId+'/commit',{});}
      if(!active())return;
      Object.assign(current,result,{saved:operation.envelope});pending=null;busy=false;
      if(same(operation.envelope,snap())){try{options.clearRecovery();}catch(error){recoveryFailure=error.message;}status('saved');}
      else{try{recover(snap());}catch(error){recoveryFailure=error.message;}status('pending');await save();}
    }catch(error){if(active()){busy=false;status(error.status===409?'conflict':'failed',error.message);}}
  }
  return {
    save:save,changed:changed,detach:detach,
    attachment:function(){return attachment && Object.assign({},attachment);},
    preserve:function(){if(attachment && (!attachment.saved || !same(attachment.saved,snap())))recover(snap());},
    open:async function(projectId){
      var request=++loading,run=epoch,before=snap();
      try{
        // Refuse destructive switching if the local recovery store cannot retain
        // the outgoing text, including handwritten invalid JSON and its ledger.
        options.archive();if(attachment)recover(before);
        var meta=await options.api('GET','/projects/'+encodeURIComponent(projectId));
        var value=await options.download(meta.downloadUrl);
        if(disposed || request!==loading || run!==epoch || !same(before,snap()))return false;
        options.replace(value); // synchronous project boundary retires prior work
        epoch++;attachment=Object.assign({},meta,{saved:value});pending=null;busy=false;status('saved');return true;
      }catch(error){if(!disposed && request===loading && run===epoch)status('failed',error.message);return false;}
    },
    copy:function(name){options.archive();detach();return save(name);},
    restore:async function(revision){
      if(!attachment || busy)return false;
      var current=attachment,run=epoch,before=snap(),request=++loading;
      try{
        options.archive();recover(before);busy=true;status('saving');
        var result=await options.api('POST','/projects/'+current.projectId+'/restore',{operationId:options.uuid(),baseRevision:current.revision,revision:revision});
        if(disposed || run!==epoch || current!==attachment)return false;
        busy=false;
        if(request!==loading || !same(before,snap())){status('conflict','A revision was restored online while you edited. Your draft is preserved. Reload online or save a copy.');return false;}
        return await this.open(result.projectId);
      }catch(error){if(!disposed && run===epoch){busy=false;status(error.status===409?'conflict':'failed',error.message);}return false;}
    },
    recover:function(entry){
      options.archive();options.replace(entry.envelope);epoch++;attachment=Object.assign({},entry.project);delete attachment.saved;
      pending=entry.operation?Object.assign({},entry.operation,{envelope:entry.operation.envelope || entry.envelope}):null;busy=false;status('pending','Recovered unsynced draft. Retry to save, or save a copy.');
    },
    destroy:function(){detach();disposed=true;}
  };
}
