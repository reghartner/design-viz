/* Browser-to-agent data only. No fetch, process launch, or browser automation. */
function createFolderAgentFiles(directory){
  var limit=8*1024*1024;
  async function readText(name,maxBytes){
    if(!/^[\w.-]+$/.test(name) || name==='.' || name==='..')throw Error('Use a plain session filename.');
    try{
      var handle=await directory.getFileHandle(name),file=await handle.getFile(),bound=Math.min(limit,maxBytes || limit);
      if(file.size>bound)throw Error(name+' exceeds the session size limit.');
      var text=await file.text();
      if(new TextEncoder().encode(text).length>bound)throw Error(name+' exceeds the session size limit.');
      return text;
    }catch(ex){if(ex.name==='NotFoundError')return null;throw ex;}
  }
  return {
    readText:readText,
    remove:async function(name){
      if(!/^state-[\w-]{1,120}\.json$/.test(name))throw Error('Only staged session snapshots may be removed.');
      try{await directory.removeEntry(name);}catch(ex){if(ex.name!=='NotFoundError')throw ex;}
    },
    read:async function(name){var text=await readText(name);return text===null?null:JSON.parse(text);},
    write:async function(name,value,guard){
      var text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
      if(new TextEncoder().encode(text).length>limit)throw Error(name+' exceeds the session size limit.');
      if(guard)await guard({name:name,created:false,phase:'before-open'});
      var handle,created=false;
      try{handle=await directory.getFileHandle(name);}catch(ex){
        if(ex.name!=='NotFoundError')throw ex;
        handle=await directory.getFileHandle(name,{create:true});created=true;
      }
      var stream=await handle.createWritable();
      try{
        if(guard)await guard({name:name,created:created,phase:'before-write'});
        await stream.write(text);
        if(guard)await guard({name:name,created:created,phase:'before-close'});
        await stream.close();
      }
      catch(ex){try{await stream.abort();}catch(ignored){}throw ex;}
    }
  };
}

function folderAgentValidId(value){return typeof value==='string' && /^[\w-]{1,120}$/.test(value);}
function folderAgentSavedMessages(saved,sessionId){
  return saved && saved.sessionId===sessionId && Array.isArray(saved.messages)?saved.messages.filter(function(item){
    return item && ['user','assistant'].includes(item.role) && typeof item.text==='string' && item.text.length<=32000;
  }).slice(-100):[];
}
function folderAgentSavedChanges(saved,sessionId){
  return saved && saved.sessionId===sessionId && Array.isArray(saved.changes)?saved.changes.filter(function(item){
    return item && folderAgentValidId(item.id) && folderAgentValidId(item.requestId) &&
      ['applied','unchanged','rejected','validated','cancelled'].includes(item.status) &&
      typeof item.summary==='string' && item.summary.length<=1000 && JSON.stringify(item).length<=16000;
  }).slice(-100):[];
}
async function inspectFolderAgentSession(files,snapshot,now){
  var existing=await files.read('session.json');
  if(!existing)throw Error('Choose an existing Flowview session folder.');
  if(!folderAgentValidId(existing.sessionId) || !folderAgentValidId(existing.connectionId))throw Error('Invalid saved session identity.');
  if(existing.protocol!=='flowview-folder-v1')throw Error('Unsupported saved session.');
  var previous,lease=await files.read('editor.json');
  try{previous=await files.read('state.json');}catch(ex){
    if(ex.name!=='SyntaxError' || existing.recoveryState!=='state-'+existing.connectionId+'.json')throw ex;
    previous=null;
  }
  // A startup claim publishes this identity-bound snapshot before rotating the
  // manifest. If later writes fail (including permission loss), explicit resume
  // can still inspect a consistent pair without mutating files or trusting an
  // unrelated connection's canonical state.
  if((!previous || previous.sessionId!==existing.sessionId || previous.connectionId!==existing.connectionId) &&
      existing.recoveryState==='state-'+existing.connectionId+'.json')previous=await files.read(existing.recoveryState);
  if(!previous || previous.sessionId!==existing.sessionId || previous.connectionId!==existing.connectionId ||
      typeof previous.source!=='string' || new TextEncoder().encode(previous.source).length>4*1024*1024 ||
      typeof previous.revision!=='string')throw Error('The saved story snapshot is missing or invalid.');
  var transcript=await files.read('transcript.json'),changes=await files.read('changes.json');
  var current=typeof snapshot==='function'?snapshot():snapshot,at=typeof now==='function'?now():Number.isFinite(now)?now:Date.now();
  var ownsLease=lease && lease.sessionId===existing.sessionId && lease.connectionId===existing.connectionId;
  return {identity:{sessionId:existing.sessionId,connectionId:existing.connectionId},createdAt:existing.createdAt,
    savedSource:previous.source,savedRevision:previous.revision,sourceMatches:!!current && previous.source===current.source,
    transcript:folderAgentSavedMessages(transcript,existing.sessionId),changes:folderAgentSavedChanges(changes,existing.sessionId),
    lease:{connected:!!(ownsLease && lease.connected),active:!!(ownsLease && lease.connected && Number.isFinite(lease.at) && at-lease.at<15000),at:ownsLease?lease.at:null}};
}

function createFolderAgentClient(opts){
  var files=opts.files,now=opts.now || Date.now,uuid=opts.uuid || function(){return crypto.randomUUID();};
  var connected=false,disposed=false,epoch=0,manifest=null,exchange=null,project=null;
  var lastState='',lastHeartbeat=-Infinity,pending=null,transcript=[],seen=new Set(),nativeSeen=new Set(),chain=Promise.resolve();
  var activity=[],activitySeen=new Set(),requestAt=null,lastAgentAt=null,turnEpoch=0,changes=[],preflight=null,changesDirty=false,reviewMode=opts.reviewMode!==false,reviewCandidate=null,reviewDecision=null,pendingReviewResult=null,reviewVersion=0;
  function serial(action){var job=chain.then(action);chain=job.catch(function(){});return job;}
  function publish(state){
    var quietSeconds=pending?Math.max(0,Math.floor((now()-(lastAgentAt===null?requestAt:lastAgentAt))/1000)):0;
    var phase=!connected?'disconnected':!pending?(activity.length?'complete':'idle'):activity.length && activity[activity.length-1].phase==='permission-needed'?'permission-needed':quietSeconds>=30?'quiet':lastAgentAt===null?'waiting':'responding';
    if(!disposed && opts.changed)opts.changed(Object.assign({connected:connected,pending:pending,transcript:transcript.slice(),
      activity:activity.slice(),activityPhase:phase,quietSeconds:quietSeconds,agentResponded:lastAgentAt!==null,changes:changes.slice(),preflight:preflight,reviewMode:reviewMode,review:connected && reviewCandidate?reviewCandidate.public:null},state));
  }
  function envelope(value){return Object.assign({sessionId:manifest.sessionId,connectionId:manifest.connectionId},value);}
  function belongs(value){return value && value.sessionId===manifest.sessionId && value.connectionId===manifest.connectionId;}
  function alive(token){return connected && !disposed && token===epoch;}
  var validId=folderAgentValidId;
  function validText(value){return value && typeof value.id==='string' && /^[\w-]{1,120}$/.test(value.id) && typeof value.text==='string' && value.text.length<=32000;}
  async function saveTranscript(){await files.write('transcript.json',{sessionId:manifest.sessionId,messages:transcript.slice(-100)});}
  async function saveChanges(){await files.write('changes.json',{sessionId:manifest.sessionId,changes:changes.slice(-100)});changesDirty=false;}
  function receipt(result,proposal,requestId){
    if(changes.some(function(item){return item.id===result.id;}))return;
    var entry={id:result.id,requestId:requestId,status:result.status,summary:String(proposal.summary || result.message || 'Story update').slice(0,1000),
      message:String(result.message || '').slice(0,4000),baseRevision:String(result.baseRevision || '').slice(0,160),revision:result.revision,at:now()};
    if(result.description && JSON.stringify(result.description).length<=8000)entry.description=result.description;
    changes.push(entry);changes=changes.slice(-100);changesDirty=true;
    publish({});
  }
  function clearReview(){reviewCandidate=null;reviewDecision=null;}
  function reviewProposal(proposal){
    var current=exchange.request().snapshot,signature=JSON.stringify(proposal)+'\n'+current.revision;
    if(reviewDecision && reviewDecision.signature===signature)return reviewDecision.action;
    if(!reviewMode && !reviewCandidate && !reviewDecision)return 'accept';
    if(reviewCandidate && reviewCandidate.signature===signature)return 'wait';
    reviewDecision=null;
    var preview=exchange.preview(proposal);
    reviewCandidate={signature:signature,proposal:proposal,preview:preview,public:{version:++reviewVersion,id:proposal.id,requestId:proposal.requestId,
      summary:String(proposal.summary || 'Your agent proposed a story update.').slice(0,1000),baseRevision:String(proposal.baseRevision || '').slice(0,160),
      revision:preview.current.revision,kind:'replacement',ok:preview.ok,merged:!!preview.merged,conflicts:preview.conflicts || []}};
    publish({status:preview.ok?'Agent updates are ready to preview. Your current story is unchanged.':'Agent update needs attention. Copy the feedback to your agent to resolve it.'});
    return 'wait';
  }
  function clearReceipt(){pendingReviewResult=null;if(exchange){var ack=exchange.request();if(ack.result)exchange.receive({acknowledged:ack.result.id},ack);}}

  async function snapshot(token){
    var current=await files.read('session.json');
    if(!alive(token))return null;
    if(!belongs(current)){connected=false;epoch++;publish({status:'Another connection owns this folder. Reconnect explicitly.'});return null;}
    var sent=exchange.request();
    if(sent.snapshot.project!==project || !sent.snapshot.open){
      connected=false;epoch++;
      await files.write('editor.json',envelope({connected:false,at:now()}));
      publish({status:'Disconnected — open the same project and reconnect to continue.'});return null;
    }
    var serialized=JSON.stringify(sent.snapshot);
    if(serialized!==lastState){
      await files.write('state.json',envelope(sent.snapshot));if(!alive(token))return null;
      await files.write('story.spec.json',sent.snapshot.source);if(!alive(token))return null;
      lastState=serialized;
    }
    if(now()-lastHeartbeat>=1000){
      await files.write('editor.json',envelope({connected:true,at:now()}));lastHeartbeat=now();
    }
    return alive(token)?sent:null;
  }
  async function readOptional(name){
    try{return await files.read(name);}catch(ex){
      if(ex instanceof SyntaxError || ex.name==='NotReadableError')return null;
      throw ex;
    }
  }
  async function poll(){
    if(!connected || disposed)return;
    var token=epoch,turn=turnEpoch,requestId=pending,sent=await snapshot(token);if(!sent || !alive(token) || turn!==turnEpoch)return;
    if(opts.workflow==='external'){
      var incoming=await readOptional('agent-request.json');if(!alive(token) || turn!==turnEpoch)return;
      if(pending && nativeSeen.has(pending) && belongs(incoming) && incoming.id===pending && incoming.withdrawn===true){
        var expiredId=pending;pending=null;turnEpoch++;clearReceipt();clearReview();activity=[];activitySeen.clear();requestAt=null;lastAgentAt=null;
        transcript.forEach(function(item){if(item.requestId===expiredId && item.role==='user')item.cancelled=true;});
        await files.write('cancel.json',envelope({id:uuid(),requestId:expiredId,at:now(),reason:'The agent timed out before receiving acknowledgement. Retry this request.'}));
        if(!alive(token))return;await saveTranscript();publish({status:'The agent request expired before acknowledgement. Ask your agent to retry.'});return;
      }
      if(!pending && belongs(incoming) && validId(incoming.id) && typeof incoming.text==='string' && incoming.text.trim() && incoming.text.length<=16000 && Number.isFinite(incoming.expiresAt) && incoming.expiresAt>now() && !nativeSeen.has(incoming.id)){
        var request=envelope({id:incoming.id,text:incoming.text,at:now(),revision:sent.snapshot.revision,selection:[],views:[],
          technicalLevel:opts.level?opts.level():'story',replySurface:'agent',delivery:'native',expiresAt:incoming.expiresAt});
        exchange.pin(sent.snapshot);
        try{await files.write('request.json',request,function(){
          if(!alive(token) || turn!==turnEpoch || now()>=incoming.expiresAt){var expired=Error('Native request expired before publication.');expired.name='NativeRequestExpiredError';throw expired;}
        });}catch(ex){if(ex.name!=='NativeRequestExpiredError')throw ex;nativeSeen.add(incoming.id);if(alive(token))publish({status:'The agent request expired before acknowledgement. Ask your agent to retry.'});return;}
        if(!alive(token) || turn!==turnEpoch)return;
        if(now()>=incoming.expiresAt){
          nativeSeen.add(incoming.id);
          await files.write('cancel.json',envelope({id:uuid(),requestId:incoming.id,at:now(),reason:'Native request expired during publication. Retry this request.'}));
          if(alive(token))publish({status:'The agent request expired before acknowledgement. Ask your agent to retry.'});return;
        }
        nativeSeen.add(incoming.id);pending=requestId=incoming.id;turn=++turnEpoch;requestAt=now();lastAgentAt=null;
        activity=[];activitySeen.clear();clearReceipt();clearReview();
        transcript.push({role:'user',text:incoming.text,requestId:incoming.id});await saveTranscript();
        publish({status:'Your agent is preparing an update. It will wait for your review.'});
      }
    }
    if(changesDirty){await saveChanges();if(!alive(token) || turn!==turnEpoch)return;}
    var proposal=await readOptional('proposal.json');if(!alive(token) || turn!==turnEpoch)return;
    if(belongs(proposal) && validId(proposal.id) && pending && proposal.requestId===pending && !seen.has(proposal.id)){
      // Retry a failed receipt write before considering the same proposal again.
      var ack=exchange.request(),message;
      if(pendingReviewResult)ack.result=pendingReviewResult;
      var decision=ack.result?'accept':reviewProposal(proposal);
      if(decision!=='wait'){
        if(decision==='reject'){
          message=reviewDecision && reviewDecision.message || 'Change declined in the editor. The agent can revise its proposal.';
          pendingReviewResult={id:proposal.id,baseRevision:proposal.baseRevision,status:'rejected',message:message,revision:ack.snapshot.revision};
          ack.result=pendingReviewResult;
        }
        if(!ack.result){
          if(typeof proposal.source==='string' && new TextEncoder().encode(proposal.source).length>4*1024*1024)proposal.source=null;
          var accepted=reviewDecision && reviewDecision.preview;
          var applying=accepted?Object.assign({},proposal,{source:accepted.source,baseRevision:accepted.current.revision}):proposal;
          message=exchange.receive({proposal:applying},sent);ack=exchange.request();
          if(ack.result)ack.result.baseRevision=proposal.baseRevision;
        }else message=ack.result.message;
        if(ack.result){
          clearReview();receipt(ack.result,proposal,requestId);
          await saveChanges();if(!alive(token) || turn!==turnEpoch)return;
          await files.write('result.json',envelope(Object.assign({},ack.result,{requestId:requestId,at:now()})));
          if(!alive(token) || turn!==turnEpoch)return;
          seen.add(ack.result.id);exchange.receive({acknowledged:ack.result.id},ack);pendingReviewResult=null;
          publish({status:message});
          await snapshot(token);if(!alive(token) || turn!==turnEpoch)return;
        }else if(message){
          // A busy editor did not apply the approved version. Require another
          // explicit click; closing the refreshed preview must never apply it.
          if(reviewMode && reviewDecision && reviewDecision.action==='accept')reviewDecision=null;
          publish({status:message});
        }
      }
    }
    // Read accumulated progress before a final reply so a fast turn cannot hide
    // updates that were written between two browser polls.
    var progress=await readOptional('progress.json');if(!alive(token) || turn!==turnEpoch)return;
    if(belongs(progress) && pending && progress.requestId===pending){
      var updated=false;
      var entries=Array.isArray(progress.events)?progress.events.slice(-100):[progress];
      entries.forEach(function(item){
        if(!validText(item) || activitySeen.has(item.id))return;
        activitySeen.add(item.id);lastAgentAt=now();updated=true;
        activity.push({id:item.id,text:item.text,at:Number.isFinite(item.at)?item.at:now(),phase:item.phase==='permission-needed'?'permission-needed':'working'});
      });
      activity=activity.slice(-100);
      if(updated)publish({status:'Claude sent an update.'});
    }
    var reply=await readOptional('reply.json');if(!alive(token) || turn!==turnEpoch)return;
    if((!belongs(proposal) || proposal.requestId!==pending || seen.has(proposal.id)) && belongs(reply) && validText(reply) && pending && reply.requestId===pending && !seen.has(reply.id)){
      seen.add(reply.id);transcript.push({role:'assistant',text:reply.text,requestId:pending});
      pending=null;publish({status:'Reply received. You can continue the conversation.',progress:''});
      await saveTranscript();if(!alive(token))return;
    }
    var listener=await readOptional('listener.json');if(!alive(token) || turn!==turnEpoch)return;
    var listening=belongs(listener) && listener.listening===true && now()-listener.at>=0 && now()-listener.at<5000;
    var checked=await readOptional('preflight.json');if(!alive(token) || turn!==turnEpoch)return;
    if(belongs(checked) && Array.isArray(checked.checks))preflight={ready:checked.ready===true,at:checked.at,checks:checked.checks.slice(0,12).filter(function(item){
      return item && typeof item.id==='string' && item.id.length<=80 && ['ready','missing','unverified'].includes(item.status) && typeof item.message==='string' && item.message.length<=1000;
    })};
    publish({listening:listening,accessError:null});
  }
  return {
    start:function(resume,choice){var started=epoch;return serial(async function(){
      if(disposed || started!==epoch)throw Error('Session was closed.');
      var opening=opts.snapshot();
      if(connected)throw Error('Disconnect before starting another session.');
      var existing=await files.read('session.json'),preview=null;
      if(resume && !existing)throw Error('Choose an existing Flowview session folder.');
      if(existing && !resume)throw Error('Choose a new session folder.');
      if(existing){
        preview=await inspectFolderAgentSession(files,opts.snapshot,now);
        if(existing.sessionId!==preview.identity.sessionId || existing.connectionId!==preview.identity.connectionId)
          throw Error('The saved session changed during recovery. Review it again before reconnecting.');
      }
      if(preview && preview.lease.active)throw Error('This folder is still connected to another editor. Disconnect it first.');
      var snap=opts.snapshot();if(!snap.open || !opening.open || snap.project!==opening.project)throw Error('Open the same project before connecting.');
      if(preview){
        if(choice && !['saved','current'].includes(choice.resumeSource))throw Error('Choose the saved story or the current draft.');
        if(choice && (choice.expectedSessionId!==undefined && choice.expectedSessionId!==preview.identity.sessionId ||
            choice.expectedConnectionId!==undefined && choice.expectedConnectionId!==preview.identity.connectionId))
          throw Error('The saved session changed since the recovery preview. Select the session folder again to resume.');
        if(choice && (choice.expectedSavedRevision!==preview.savedRevision || choice.expectedSavedSource!==preview.savedSource))
          throw Error('The saved story changed since the recovery preview. Review it again before reconnecting.');
        if(preview.savedSource!==snap.source && (!choice || choice.resumeSource!=='current'))
          throw Error('The editor story changed during resume. Select the session folder again to load its saved story.');
        transcript=preview.transcript;changes=preview.changes;changesDirty=false;
      }else{transcript=[];changes=[];changesDirty=false;}
      function checkOpening(){
        if(disposed || started!==epoch)throw Error('Session was closed.');
        var current=opts.snapshot();
        if(current.project!==opening.project || !current.open || current.source!==snap.source)throw Error('Project changed during connection.');
      }
      checkOpening();
      if(preview){
        // Recheck the exact preview immediately before claiming; no interrupted turn is replayed.
        var checked=await inspectFolderAgentSession(files,opts.snapshot,now);checkOpening();
        if(checked.identity.connectionId!==preview.identity.connectionId || checked.identity.sessionId!==preview.identity.sessionId ||
            checked.savedSource!==preview.savedSource || checked.savedRevision!==preview.savedRevision || checked.lease.active)
          throw Error('The saved session changed during recovery. Review it again before reconnecting.');
        if(choice && choice.resumeSource==='current' && preview.savedSource!==snap.source){
          await files.write('saved-story-'+uuid()+'.spec.json',preview.savedSource);checkOpening();
          var archivedCheck=await inspectFolderAgentSession(files,opts.snapshot,now);checkOpening();
          if(archivedCheck.identity.connectionId!==preview.identity.connectionId || archivedCheck.identity.sessionId!==preview.identity.sessionId ||
              archivedCheck.savedSource!==preview.savedSource || archivedCheck.savedRevision!==preview.savedRevision || archivedCheck.lease.active)
            throw Error('The saved session changed while preserving its story. Review recovery again.');
        }
      }
      manifest={protocol:'flowview-folder-v1',workflow:opts.workflow || 'embedded',sessionId:existing?existing.sessionId:uuid(),connectionId:uuid(),createdAt:preview?preview.createdAt:now()};
      project=snap.project;connected=true;epoch++;turnEpoch++;clearReview();pendingReviewResult=null;lastHeartbeat=-Infinity;lastState='';pending=null;seen.clear();
      activity=[];activitySeen.clear();requestAt=null;lastAgentAt=null;preflight=null;
      exchange=createWorkbenchAgentExchange({clientId:manifest.connectionId,snapshot:opts.snapshot,busy:opts.busy,apply:opts.apply,validate:opts.validate});
      var recoveryState='state-'+manifest.connectionId+'.json';
      manifest.recoveryState=recoveryState;
      try{
        var token=epoch,initial=exchange.request();
        function checkInitial(){
          if(!alive(token))throw Error('Session was closed.');
          var current=opts.snapshot();
          if(!current.open || current.project!==snap.project || current.source!==snap.source)throw Error('Project changed during connection.');
        }
        async function checkOwner(){
          var owner=await files.read('session.json');checkInitial();
          if(!belongs(owner))throw Error('Folder ownership changed during connection.');
        }
        // Publish an identity-bound recovery snapshot before claiming ownership.
        // Failed later writes never require a rollback over another owner's data.
        async function checkClaim(write){
          var beforeClaim;
          try{beforeClaim=await files.read('session.json');}catch(ex){
            // Native File System Access creates an empty directory entry before
            // createWritable commits bytes. Only this new claim's own empty
            // placeholder is allowed; malformed files seen before startup or
            // any nonempty/previously existing manifest remain errors.
            if(existing || ex.name!=='SyntaxError' || !write || !write.created || write.name!=='session.json' ||
                typeof files.readText!=='function' || await files.readText('session.json')!=='')throw ex;
            beforeClaim=null;
          }
          checkInitial();
          if(existing?(!beforeClaim || beforeClaim.sessionId!==existing.sessionId || beforeClaim.connectionId!==existing.connectionId):beforeClaim)
            throw Error('Folder ownership changed during connection.');
          if(preview){
            // The old owner may wake with the same identity while the staged
            // snapshot or manifest is buffering. Recheck the exact saved story
            // and lease at every pre-commit guard, not just its connection ID.
            var latest=await inspectFolderAgentSession(files,opts.snapshot,now);checkInitial();
            if(latest.identity.sessionId!==preview.identity.sessionId || latest.identity.connectionId!==preview.identity.connectionId ||
                latest.savedSource!==preview.savedSource || latest.savedRevision!==preview.savedRevision || latest.lease.active)
              throw Error('The saved session changed before connection. Review recovery again.');
          }
        }
        await files.write(recoveryState,envelope(initial.snapshot),checkInitial);checkInitial();
        await checkClaim();
        await files.write('session.json',manifest,checkClaim);await checkOwner();
        await files.write('state.json',envelope(initial.snapshot),checkOwner);await checkOwner();
        await files.write('story.spec.json',initial.snapshot.source,checkOwner);await checkOwner();
        await files.write('editor.json',envelope({connected:true,at:now()}),checkOwner);await checkOwner();
        var committed=Object.assign({},manifest);delete committed.recoveryState;
        await files.write('session.json',committed,checkOwner);await checkOwner();manifest=committed;
        lastState=JSON.stringify(initial.snapshot);lastHeartbeat=now();
        if(typeof files.remove==='function'){
          try{await files.remove(recoveryState);}catch(ignored){} // Cleanup is optional; the canonical pair is committed.
        }
        if(!alive(token))throw Error('Session was closed.');
      }catch(ex){connected=false;epoch++;publish({listening:false});throw ex;}
      publish({status:'Paste the connection instructions into Claude.',listening:false});
      return manifest;
    });},
    send:function(text,context){
      // Capture the user's focus at Send, before queued polling or disk I/O.
      var captured;
      try{
        var focus=context || opts.snapshot();
        captured=JSON.parse(JSON.stringify({source:focus.source,project:focus.project,selection:focus.selection,
          views:focus.views,previewCurrent:focus.previewCurrent,replySurface:focus.replySurface,delivery:focus.delivery,technicalLevel:opts.level?opts.level():'story'}));
      }catch(ex){return Promise.reject(ex);}
      return serial(async function(){
      if(!connected || disposed)throw Error('Connect a folder first.');
      if(pending)throw Error('Wait for Claude’s reply before sending another message.');
      text=context?String(text):String(text).trim();if(!text.trim() || text.length>16000)throw Error('Enter a message of at most 16000 characters.');
      var token=epoch,turn=++turnEpoch,id=uuid();pending=id;requestAt=now();lastAgentAt=null;
      activity=[];activitySeen.clear();clearReceipt();clearReview();publish({status:'Saving your message…'});
      try{
        var sent=await snapshot(token);if(!sent || !alive(token))throw Error('Project changed. Reconnect before sending.');
        if(turn!==turnEpoch)throw Error('Turn stopped before the message was sent.');
        var current=opts.snapshot();
        if(sent.snapshot.project!==captured.project || sent.snapshot.source!==captured.source ||
          !current.open || current.project!==captured.project || current.source!==captured.source)
          throw Error('The story changed while saving your message. Check the selection and send it again.');
        var request=envelope({id:id,text:text,at:now(),revision:sent.snapshot.revision,
          selection:captured.selection,views:captured.views,previewCurrent:captured.previewCurrent,project:captured.project,technicalLevel:captured.technicalLevel,replySurface:captured.replySurface,delivery:captured.delivery});
        exchange.pin(sent.snapshot);
        await files.write('request.json',request);if(!alive(token) || turn!==turnEpoch)throw Error('Turn stopped while the message was being saved.');
        transcript.push({role:'user',text:text,requestId:id,context:{selection:request.selection,views:request.views,technicalLevel:request.technicalLevel,previewCurrent:request.previewCurrent}});
        publish({status:'Message saved — waiting for Claude.',progress:''});
        await saveTranscript();return request;
      }catch(ex){
        // A committed request remains pending when only its transcript failed to save.
        if(!transcript.some(function(item){return item.requestId===id;})){if(pending===id)pending=null;publish({});}
        throw ex;
      }
    });},
    reviewContent:function(){return reviewCandidate && reviewCandidate.preview.ok?reviewCandidate.preview.source:reviewCandidate && reviewCandidate.proposal.source || '';},
    reviewSnapshot:function(){return connected && reviewCandidate?{review:reviewCandidate.public,source:reviewCandidate.preview.source || null,current:reviewCandidate.preview.current.source}:null;},
    setReviewMode:function(value){reviewMode=value===true;publish({});},
    acceptReview:function(version){
      if(!connected || disposed || !reviewCandidate || !reviewCandidate.preview.ok || reviewCandidate.public.requestId!==pending || version!==undefined && version!==reviewCandidate.public.version)return Promise.resolve(false);
      reviewDecision={signature:reviewCandidate.signature,action:'accept',preview:reviewCandidate.preview};
      publish({status:'Checking the proposed change…'});
      return serial(poll).then(function(){return !reviewCandidate;});
    },
    rejectReview:function(message,version){
      if(!connected || disposed || !reviewCandidate || reviewCandidate.public.requestId!==pending || version!==undefined && version!==reviewCandidate.public.version)return Promise.resolve(false);
      reviewDecision={signature:reviewCandidate.signature,action:'reject',message:message};
      publish({status:'Returning the proposed change…'});
      return serial(poll).then(function(){return !reviewCandidate;});
    },
    cancel:function(){
      var requestId=pending,token=epoch;
      if(!connected || disposed || !requestId)return Promise.resolve(false);
      pending=null;turnEpoch++;clearReceipt();clearReview();activity=[];activitySeen.clear();requestAt=null;lastAgentAt=null;
      transcript.forEach(function(item){if(item.requestId===requestId && item.role==='user')item.cancelled=true;});
      publish({status:'Stopped accepting this turn. Claude may still be computing; interrupt it in its session if needed.',progress:''});
      return serial(async function(){
        if(!alive(token) || !belongs(await files.read('session.json')) || !alive(token))return false;
        await files.write('cancel.json',envelope({id:uuid(),requestId:requestId,at:now(),reason:'Stopped accepting this turn in the editor.'}));
        if(!alive(token))return false;
        if(changesDirty){await saveChanges();if(!alive(token))return false;}
        await saveTranscript();return true;
      });
    },
    readLedger:function(){return serial(async function(){
      if(!connected || disposed || typeof files.readText!=='function')return null;
      var token=epoch,sent=await snapshot(token);if(!sent || !alive(token))return null;
      var text=await files.readText('story.ledger.md',256*1024);if(text===null || !alive(token))return null;
      if(new TextEncoder().encode(text).length>256*1024)throw Error('Story brief exceeds the 256 KiB size limit.');
      var owner=await files.read('session.json');if(!alive(token) || !belongs(owner))return null;
      var current=opts.snapshot();if(!current.open || current.project!==project || current.source!==sent.snapshot.source)return null;
      return {text:text,filename:'story.ledger.md',sessionId:manifest.sessionId,connectionId:manifest.connectionId,
        sourceRevision:null,sharedRevision:sent.snapshot.revision,sourceMatches:null,verified:false,at:now(),readAt:now()};
    });},
    poll:function(){return serial(poll).catch(function(ex){publish({status:'Folder unavailable: '+ex.message,listening:false,accessError:ex.name==='NotAllowedError'?'permission':'unavailable'});throw ex;});},
    disconnect:function(){
      connected=false;pending=null;epoch++;clearReview();publish({status:'Disconnected. Files and conversation remain in your folder.',listening:false});
      return serial(async function(){if(manifest && belongs(await files.read('session.json')))await files.write('editor.json',envelope({connected:false,at:now()}));});
    },
    destroy:function(){connected=false;disposed=true;epoch++;clearReview();},
    manifest:function(){return manifest;}
  };
}
