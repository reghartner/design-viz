/* Browser-to-agent data only. No fetch, process launch, or browser automation. */
function createFolderAgentFiles(directory){
  var limit=8*1024*1024;
  return {
    read:async function(name){
      try{
        var handle=await directory.getFileHandle(name),file=await handle.getFile();
        if(file.size>limit)throw Error(name+' exceeds the session size limit.');
        return JSON.parse(await file.text());
      }catch(ex){if(ex.name==='NotFoundError')return null;throw ex;}
    },
    write:async function(name,value){
      var text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
      if(new TextEncoder().encode(text).length>limit)throw Error(name+' exceeds the session size limit.');
      var handle=await directory.getFileHandle(name,{create:true}),stream=await handle.createWritable();
      try{await stream.write(text);await stream.close();}
      catch(ex){try{await stream.abort();}catch(ignored){}throw ex;}
    }
  };
}

function createFolderAgentClient(opts){
  var files=opts.files,now=opts.now || Date.now,uuid=opts.uuid || function(){return crypto.randomUUID();};
  var connected=false,disposed=false,epoch=0,manifest=null,exchange=null,project=null;
  var lastState='',lastHeartbeat=-Infinity,pending=null,transcript=[],seen=new Set(),chain=Promise.resolve();
  function serial(action){var job=chain.then(action);chain=job.catch(function(){});return job;}
  function publish(state){if(!disposed && opts.changed)opts.changed(Object.assign({connected:connected,pending:pending,transcript:transcript.slice()},state));}
  function envelope(value){return Object.assign({sessionId:manifest.sessionId,connectionId:manifest.connectionId},value);}
  function belongs(value){return value && value.sessionId===manifest.sessionId && value.connectionId===manifest.connectionId;}
  function alive(token){return connected && !disposed && token===epoch;}
  function validId(value){return typeof value==='string' && /^[\w-]{1,120}$/.test(value);}
  function validText(value){return value && typeof value.id==='string' && /^[\w-]{1,120}$/.test(value.id) && typeof value.text==='string' && value.text.length<=32000;}
  async function saveTranscript(){await files.write('transcript.json',{sessionId:manifest.sessionId,messages:transcript.slice(-100)});}
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
    var token=epoch,sent=await snapshot(token);if(!sent || !alive(token))return;
    var proposal=await readOptional('proposal.json');if(!alive(token))return;
    if(belongs(proposal) && validId(proposal.id) && pending && proposal.requestId===pending && !seen.has(proposal.id)){
      // Retry a failed receipt write before considering the same proposal again.
      var ack=exchange.request(),message;
      if(!ack.result){
        if(typeof proposal.source==='string' && new TextEncoder().encode(proposal.source).length>4*1024*1024)proposal.source=null;
        message=exchange.receive({proposal:proposal},sent);ack=exchange.request();
      }else message=ack.result.message;
      if(ack.result){
        await files.write('result.json',envelope(Object.assign({},ack.result,{requestId:pending,at:now()})));
        if(!alive(token))return;
        seen.add(ack.result.id);exchange.receive({acknowledged:ack.result.id},ack);
        publish({status:message});
        await snapshot(token);if(!alive(token))return;
      }else if(message)publish({status:message});
    }
    var reply=await readOptional('reply.json');if(!alive(token))return;
    if((!belongs(proposal) || proposal.requestId!==pending || seen.has(proposal.id)) && belongs(reply) && validText(reply) && pending && reply.requestId===pending && !seen.has(reply.id)){
      seen.add(reply.id);transcript.push({role:'assistant',text:reply.text,requestId:pending});
      pending=null;publish({status:'Reply received. You can continue the conversation.',progress:''});
      await saveTranscript();if(!alive(token))return;
    }
    var progress=await readOptional('progress.json');if(!alive(token))return;
    if(belongs(progress) && validText(progress) && pending && progress.requestId===pending && !seen.has(progress.id)){
      seen.add(progress.id);publish({status:'Claude is working…',progress:progress.text});
    }
    var listener=await readOptional('listener.json');if(!alive(token))return;
    var listening=belongs(listener) && listener.listening===true && now()-listener.at>=0 && now()-listener.at<5000;
    publish({listening:listening});
  }
  return {
    start:function(resume){return serial(async function(){
      if(disposed)throw Error('Session was closed.');
      if(connected)throw Error('Disconnect before starting another session.');
      var existing=await files.read('session.json'),lease=await files.read('editor.json');
      if(resume && !existing)throw Error('Choose an existing Flowview session folder.');
      if(existing && !resume)throw Error('Choose a new session folder.');
      if(existing && (!validId(existing.sessionId) || !validId(existing.connectionId)))throw Error('Invalid saved session identity.');
      if(existing && existing.protocol!=='flowview-folder-v1')throw Error('Unsupported saved session.');
      if(existing && lease && lease.connected && now()-lease.at<15000)throw Error('This folder is still connected to another editor. Disconnect it first.');
      var snap=opts.snapshot();if(!snap.open)throw Error('Open a project before connecting.');
      if(existing){
        var previous=await files.read('state.json');
        if(!previous || previous.source!==snap.source)throw Error('Open story.spec.json from this folder before resuming its conversation.');
        var saved=await files.read('transcript.json');
        if(saved && saved.sessionId===existing.sessionId && Array.isArray(saved.messages))transcript=saved.messages.filter(function(item){
          return item && ['user','assistant'].includes(item.role) && typeof item.text==='string' && item.text.length<=32000;
        }).slice(-100);
      }
      if(disposed)return;
      manifest={protocol:'flowview-folder-v1',sessionId:existing?existing.sessionId:uuid(),connectionId:uuid(),createdAt:now()};
      project=snap.project;connected=true;epoch++;lastHeartbeat=-Infinity;lastState='';pending=null;seen.clear();
      exchange=createWorkbenchAgentExchange({clientId:manifest.connectionId,snapshot:opts.snapshot,busy:opts.busy,apply:opts.apply});
      try{
        await files.write('session.json',manifest);
        await snapshot(epoch);
        if(!connected)throw Error('Folder ownership changed during connection.');
      }catch(ex){connected=false;epoch++;publish({listening:false});throw ex;}
      publish({status:'Paste the connection instructions into Claude.',listening:false});
      return manifest;
    });},
    send:function(text){return serial(async function(){
      if(!connected || disposed)throw Error('Connect a folder first.');
      if(pending)throw Error('Wait for Claude’s reply before sending another message.');
      text=String(text).trim();if(!text || text.length>16000)throw Error('Enter a message of at most 16000 characters.');
      var token=epoch,sent=await snapshot(token);if(!sent || !alive(token))throw Error('Project changed. Reconnect before sending.');
      var id=uuid(),request=envelope({id:id,text:text,at:now(),revision:sent.snapshot.revision,
        selection:sent.snapshot.selection,views:sent.snapshot.views,project:sent.snapshot.project,technicalLevel:opts.level?opts.level():'story'});
      await files.write('request.json',request);if(!alive(token))return;
      pending=id;transcript.push({role:'user',text:text,requestId:id});
      publish({status:'Message saved — waiting for Claude.',progress:''});
      await saveTranscript();
    });},
    poll:function(){return serial(poll).catch(function(ex){publish({status:'Folder unavailable: '+ex.message});throw ex;});},
    disconnect:function(){
      connected=false;pending=null;epoch++;publish({status:'Disconnected. Files and conversation remain in your folder.',listening:false});
      return serial(async function(){if(manifest && belongs(await files.read('session.json')))await files.write('editor.json',envelope({connected:false,at:now()}));});
    },
    destroy:function(){connected=false;disposed=true;epoch++;},
    manifest:function(){return manifest;}
  };
}
