/* Optional local-file transport. No browser-control or script-execution commands. */
function createWorkbenchAgentExchange(opts){
  var lastSource=null,lastLedger=null,lastProject=null,lastTopology=null,sequence=0,pending=null,baselines=new Map(),baselineBytes=0,pinned=null,reviewBase=null;
  function snapshot(){
    var value=opts.snapshot();
    if(value.source!==lastSource || value.ledger!==lastLedger || value.project!==lastProject || value.topologyRevision!==lastTopology){
      if(value.project!==lastProject){baselines.clear();baselineBytes=0;pinned=null;reviewBase=null;}
      lastSource=value.source;lastLedger=value.ledger;lastProject=value.project;lastTopology=value.topologyRevision;sequence++;
      baselines.set(opts.clientId+'-'+sequence,{source:value.source,ledger:value.ledger,project:value.project});baselineBytes+=value.source.length;
      while(baselines.size>32 || baselineBytes>16*1024*1024 && baselines.size>1){var key=baselines.keys().next().value;baselineBytes-=baselines.get(key).source.length;baselines.delete(key);}
    }
    value.revision=opts.clientId+'-'+sequence;
    return value;
  }
  return {
    pin:function(current){current=current || snapshot();pinned={revision:current.revision,source:current.source,ledger:current.ledger,project:current.project};reviewBase=null;},
    preview:function(proposal){
      var current=snapshot(),base=baselines.get(proposal.baseRevision) || (pinned && pinned.revision===proposal.baseRevision?pinned:null) || (reviewBase && reviewBase.revision===proposal.baseRevision?reviewBase:null),outcome;
      function blocked(reason){return {ok:false,current:current,conflicts:[{path:'/',reason:reason}]};}
      if(!current.open)return blocked('Open the original project before reviewing this update.');
      if(Object.prototype.hasOwnProperty.call(proposal,'operations') || Object.prototype.hasOwnProperty.call(proposal,'dryRun'))return blocked('Submit a complete updated document in source.');
      if(typeof proposal.source!=='string' || new TextEncoder().encode(proposal.source).length>4*1024*1024)return blocked('Invalid or oversized proposed source.');
      if(!base || base.project!==current.project)return blocked('The starting revision is no longer available. Reread state.json and reconcile your proposal with the latest story.');
      reviewBase={revision:proposal.baseRevision,source:base.source,ledger:base.ledger,project:base.project};
      try{outcome=mergeWorkbenchAgentSource(base.source,current.source,proposal.source);}catch(ex){return blocked('The document is too complex to merge safely. Ask for a revised proposal.');}outcome.current=current;
      if(outcome.ok && new TextEncoder().encode(outcome.source).length>4*1024*1024)return blocked('The combined story exceeds the 4 MiB size limit.');
      if(outcome.ok && opts.requireLedger){
        if(typeof proposal.ledger!=='string' || !proposal.ledger.trim() || new TextEncoder().encode(proposal.ledger).length>256*1024)return blocked('Include the complete coverage ledger (up to 256 KiB) with this spec.');
        var before=base.ledger || '',local=current.ledger || '',incoming=proposal.ledger;
        if(local!==before && incoming!==before && local!==incoming)return {ok:false,current:current,conflicts:[{path:'/ledger',reason:'Both changed the coverage ledger. Reread the accepted pair and reconcile it.'}]};
        outcome.ledger=incoming===before?local:incoming;
      }
      function validated(context){
        if(outcome.ok && opts.validate){
          try{var error=opts.prepare?opts.validate(outcome.source,context):opts.validate(outcome.source);if(error)return blocked('The combined story failed validation: '+error);}
          catch(ex){return blocked('The combined story failed validation: '+ex.message);}
        }
        if(opts.prepare)outcome.topologyContext=context;
        return outcome;
      }
      // Remain synchronous for transports without asynchronous preparation.
      // This context comes only from the editor callback, never proposal fields.
      if(outcome.ok && opts.prepare)return Promise.resolve().then(function(){return opts.prepare(outcome.source);}).then(validated,function(ex){return blocked('The combined story failed validation: '+ex.message);});
      return validated();
    },
    request:function(){return {clientId:opts.clientId,snapshot:snapshot(),result:pending};},
    receive:function receive(reply,sent,context,guard){
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
      if(opts.requireLedger && (typeof proposal.ledger!=='string' || !proposal.ledger.trim() || new TextEncoder().encode(proposal.ledger).length>256*1024))return result('rejected','A complete coverage ledger is required.');
      var source=proposal.source;
      if(typeof source!=='string' || source.length>4*1024*1024)return result('rejected','Invalid or oversized source.');
      if(source===current.source && (!opts.requireLedger || proposal.ledger===current.ledger))return result('unchanged','Agent proposal matches the current document.');
      // The automatic local transport supplies its lifetime guard. Prepare
      // only an exact-current replacement: never merge or adopt a new revision.
      // Folder review instead passes its already-approved private context.
      if(guard && opts.prepare){
        var revision=current.revision;
        function prepared(nextContext,error){
          if(!guard())return null;
          current=snapshot();
          if(!current.open || current.revision!==revision)return result('rejected','Your document changed while preparing the proposal. Reread state.json and revise it.');
          if(error)return result('rejected','Could not prepare proposal: '+error.message);
          try{var validation=opts.validate && opts.validate(source,nextContext);if(validation)return result('rejected','Proposal failed validation: '+validation);}
          catch(ex){return result('rejected','Proposal failed validation: '+ex.message);}
          // Recheck focus/gestures and all normal acceptance rules after I/O.
          return receive(reply,sent,nextContext);
        }
        return Promise.resolve().then(function(){if(guard())return opts.prepare(source);}).then(function(value){return prepared(value);},function(error){return prepared(null,error);});
      }
      var outcome;
      try{outcome=opts.apply(source,current,proposal,context);}
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
  var exchange=createWorkbenchAgentExchange({clientId:clientId,snapshot:opts.snapshot,busy:function(){return pointerHeld || opts.busy();},apply:opts.apply,prepare:opts.prepare,validate:opts.validate});
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
      life.cancelDelay(deadline);
      var message=await exchange.receive(reply,sent,undefined,function(){return running && life.alive() && epoch===generation;});
      if(!running || !life.alive() || epoch!==generation)return;
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
