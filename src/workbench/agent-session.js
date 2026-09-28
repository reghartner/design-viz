/* Optional local-file transport. No browser-control or script-execution commands. */
function createWorkbenchAgentExchange(opts){
  var lastSource=null,lastProject=null,sequence=0,pending=null,baselines=new Map(),baselineBytes=0,pinned=null;
  function snapshot(){
    var value=opts.snapshot();
    if(value.source!==lastSource || value.project!==lastProject){
      if(value.project!==lastProject){baselines.clear();baselineBytes=0;pinned=null;}
      lastSource=value.source;lastProject=value.project;sequence++;
      baselines.set(opts.clientId+'-'+sequence,{source:value.source,project:value.project});baselineBytes+=value.source.length;
      while(baselines.size>32 || baselineBytes>16*1024*1024 && baselines.size>1){var key=baselines.keys().next().value;baselineBytes-=baselines.get(key).source.length;baselines.delete(key);}
    }
    value.revision=opts.clientId+'-'+sequence;
    return value;
  }
  return {
    pin:function(){var current=snapshot();pinned={revision:current.revision,source:current.source,project:current.project};},
    preview:function(proposal){
      var current=snapshot(),base=baselines.get(proposal.baseRevision) || (pinned && pinned.revision===proposal.baseRevision?pinned:null),outcome;
      function blocked(reason){return {ok:false,current:current,conflicts:[{path:'/',reason:reason}]};}
      if(!current.open)return blocked('Open the original project before reviewing this update.');
      if(Object.prototype.hasOwnProperty.call(proposal,'operations') || Object.prototype.hasOwnProperty.call(proposal,'dryRun'))return blocked('Submit a complete updated document in source.');
      if(typeof proposal.source!=='string' || new TextEncoder().encode(proposal.source).length>4*1024*1024)return blocked('Invalid or oversized proposed source.');
      if(!base || base.project!==current.project)return blocked('The starting revision is no longer available. Reread state.json and reconcile your proposal with the latest story.');
      try{outcome=mergeWorkbenchAgentSource(base.source,current.source,proposal.source);}catch(ex){return blocked('The document is too complex to merge safely. Ask for a revised proposal.');}outcome.current=current;
      if(outcome.ok && new TextEncoder().encode(outcome.source).length>4*1024*1024)return blocked('The combined story exceeds the 4 MiB size limit.');
      if(outcome.ok && opts.validate){
        try{var error=opts.validate(outcome.source);if(error)return blocked('The combined story failed validation: '+error);}
        catch(ex){return blocked('The combined story failed validation: '+ex.message);}
      }
      return outcome;
    },
    request:function(){return {clientId:opts.clientId,snapshot:snapshot(),result:pending};},
    receive:function(reply,sent){
      if(pending && sent.result && pending.id===sent.result.id && reply.acknowledged===pending.id)pending=null;
      if(reply.occupied)return 'Another tab is connected. Disconnect it or close it and wait a few seconds.';
      if(reply.fileError)return 'Proposal file: '+reply.fileError;
      var proposal=reply.proposal;
      if(!proposal)return null;
      var current=snapshot();
      function result(status,message){pending={id:proposal.id,baseRevision:proposal.baseRevision,status:status,message:message,revision:current.revision};return message;}
      if(Object.prototype.hasOwnProperty.call(proposal,'operations') || Object.prototype.hasOwnProperty.call(proposal,'dryRun'))
        return result('rejected','Submit the complete updated document in source. Operation and dry-run proposals are no longer supported.');
      if(!current.open)return result('rejected','Open a project before applying agent changes.');
      if(proposal.baseRevision!==current.revision)return result('rejected','Your document changed. The agent must reread state.json and revise its proposal.');
      if(opts.busy())return 'Agent update waiting — finish editing or dragging, then click the canvas.';
      var source=proposal.source;
      if(typeof source!=='string' || source.length>4*1024*1024)return result('rejected','Invalid or oversized source.');
      if(source===current.source)return result('unchanged','Agent proposal matches the current document.');
      var outcome;
      try{outcome=opts.apply(source,current,proposal);}
      catch(ex){return result('rejected','Could not apply proposal: '+ex.message);}
      if(!outcome || !outcome.ok)return result('rejected',outcome && outcome.error || 'Document changed before the proposal could apply.');
      current=snapshot();
      return result('applied',(proposal.summary || 'Agent update applied.')+(outcome.rendered===false?' Preview failed; use Undo or repair the source.':' Undo is available.'));
    }
  };
}

function initWorkbenchAgentSession(opts){
  var doc=opts.document,configElement=doc.getElementById('flowview-local-agent');
  if(!configElement)return {destroy:function(){}};
  var config;
  try{config=JSON.parse(configElement.textContent);}catch(ex){return {destroy:function(){}};}
  if(config.protocolVersion!==1 || !/^[a-f0-9]{64}$/.test(config.token) ||
     location.protocol!=='http:' || location.hostname!=='127.0.0.1')return {destroy:function(){}};
  configElement.remove();
  var life=createWorkbenchLifetime(),running=false,generation=0,controller=null,timer=null,pointerHeld=false;
  var host=doc.querySelector('.workbench-header'),button=doc.createElement('button');
  button.type='button';button.id='local-agent-toggle';button.className='bbtn';host.appendChild(button);
  var details=doc.createElement('details');details.className='canon-tools';details.id='local-agent-details';
  var summary=doc.createElement('summary');summary.textContent='Local agent session';details.appendChild(summary);
  var status=doc.createElement('p');status.id='local-agent-status';status.setAttribute('role','status');details.appendChild(status);
  var path=doc.createElement('code');path.textContent=config.scratch;path.style.overflowWrap='anywhere';details.appendChild(path);
  var help=doc.createElement('p');help.textContent='Give your agent this folder’s README.md. It reads state.json and writes proposal.json. Updates apply automatically as one Undo action; click outside a field when you are ready. Save still writes your chosen project file.';details.appendChild(help);
  doc.getElementById('editor-company').appendChild(details);
  var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  var clientId=Array.from(bytes,function(byte){return byte.toString(16).padStart(2,'0');}).join('');
  var exchange=createWorkbenchAgentExchange({clientId:clientId,snapshot:opts.snapshot,busy:function(){return pointerHeld || opts.busy();},apply:opts.apply});
  function label(message){status.textContent=message;button.title=message;}
  function send(payload,signal){
    return fetch('/__flowview_agent/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Flowview-Session':config.token},
      body:JSON.stringify(payload),signal:signal,credentials:'omit',cache:'no-store'}).then(function(response){
        if(!response.ok)throw Error('Local helper returned '+response.status+'.');return response.json();
      });
  }
  async function tick(epoch){
    if(!running || !life.alive() || epoch!==generation)return;
    var requestController=new AbortController();controller=requestController;
    var deadline=life.delay(function(){requestController.abort();},5000);
    try{
      var sent=exchange.request(),reply=await send(sent,requestController.signal);
      if(!running || !life.alive() || epoch!==generation)return;
      var message=exchange.receive(reply,sent);
      if(message)label(message);
      else if(!sent.snapshot.open)label('Connected — open a project to share it with the agent.');
      else if(!status.textContent || /Connecting|unavailable|open a project|Another tab/.test(status.textContent))label('Connected — document and selection are shared through local files.');
    }catch(ex){if(running && life.alive() && epoch===generation)label('Helper unavailable; retrying. Your edits remain in the workbench.');}
    finally{
      life.cancelDelay(deadline);
      if(running && life.alive() && epoch===generation)timer=life.delay(function(){tick(epoch);},750);
    }
  }
  function start(){
    if(running || !life.alive())return;
    running=true;generation++;button.textContent='Agent files · Disconnect';button.setAttribute('aria-pressed','true');
    label('Connecting to local files…');tick(generation);
  }
  function stop(){
    if(!running)return;
    running=false;generation++;life.cancelDelay(timer);if(controller)controller.abort();
    button.textContent='Agent files · Connect';button.setAttribute('aria-pressed','false');label('Disconnected. Scratch retains the last shared snapshot.');
    var payload=exchange.request();payload.disconnect=true;
    send(payload).catch(function(){});
  }
  life.listen(button,'click',function(){if(running)stop();else start();});
  life.listen(window,'pointerdown',function(){pointerHeld=true;},true);
  ['pointerup','pointercancel','blur'].forEach(function(type){life.listen(window,type,function(){pointerHeld=false;},true);});
  life.listen(window,'pagehide',stop);
  life.own(function(){stop();button.remove();details.remove();});
  start();
  return {destroy:life.destroy};
}
