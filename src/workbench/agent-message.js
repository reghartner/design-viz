/* A context composer for the user's existing agent conversation. No agent runtime. */
function workbenchAgentContext(raw, selection){
  var nodes=[],references=[],selectedPaths=new Set();
  (selection || []).forEach(function(target){
    var path=builderTargetPath(raw,target);if(path)selectedPaths.add(JSON.stringify(path));
  });
  function reference(path,value,label,selected){
    references.push({key:JSON.stringify(path),path:path,value:value,label:label,selected:selected});
  }
  function evidence(value,path,label,selected){
    if(!value || typeof value!=='object')return;
    if(value.binding)reference(path.concat(['binding']),value.binding,label+' · '+(value.binding.entityRef || 'Service binding'),selected);
    (Array.isArray(value.codeRefs)?value.codeRefs:[]).forEach(function(ref,index){
      reference(path.concat(['codeRefs',index]),ref,label+' · '+(ref && (ref.path || ref.id) || 'Code reference '+(index+1)),selected);
    });
  }
  specSectionPaths(raw).forEach(function(rec,section){
    var diagram=specValueAt(raw,rec.diagram),block=specValueAt(raw,rec.section);
    if(!diagram || typeof diagram!=='object')return;
    var heading='Section '+(section+1)+(block && block.heading?' · '+block.heading:'');
    Object.keys(diagram.nodes || {}).forEach(function(id){
      var value=diagram.nodes[id],path=rec.diagram.concat(['nodes',id]),key=JSON.stringify(path);
      if(!value || typeof value!=='object')return;
      var label=heading+' / '+(value.title || id)+' ('+id+')',selected=selectedPaths.has(key);
      // References have independent checkboxes; deselecting one must omit it.
      var content=Object.assign({},value);delete content.codeRefs;delete content.binding;
      nodes.push({key:key,path:path,value:content,label:label,selected:selected,target:{kind:'node',section:section,id:id,label:value.title || id,sectionLabel:heading}});
      evidence(value,path,label,selected);
    });
    (Array.isArray(diagram.steps)?diagram.steps:[]).forEach(function(step,index){
      if(!step || typeof step!=='object')return;
      var path=rec.diagram.concat(['steps',index]);
      evidence(step,path,heading+' / Step '+(index+1)+(step.id?' ('+step.id+')':''),selectedPaths.has(JSON.stringify(path)));
    });
  });
  return {title:raw && (raw.page || raw).title || 'Untitled diagram',nodes:nodes,references:references};
}

function workbenchAgentMessage(context, options){
  var request=options.message.trim();if(!request)return '';
  function included(entries,keys){
    return entries.filter(function(entry){return keys.has(entry.key);}).map(function(entry){return {path:entry.path,value:entry.value};});
  }
  var payload={document:context.title,nodes:included(context.nodes,options.nodes),references:included(context.references,options.references)};
  var extra=options.extra.trim();if(extra)payload.additionalReferences=extra.split(/\r?\n/).map(function(line){return line.trim();}).filter(Boolean);
  return [request,'','Context selected in Flowview Workbench:',JSON.stringify(payload,null,2),'',
    'The paths above address the authored JSON. Selected excerpts are context, not a complete diagram. Ask for the current spec or source files if needed; preserve unrelated content when editing.',
    'Continue our conversation in this agent app. References are pointers to evidence; verify their contents before relying on them.'
  ].join('\n')+(options.source?'\n\nComplete diagram source (JSON):\n'+options.source:'');
}

function initWorkbenchAgentMessage(opts){
  var doc=opts.document,dialog=doc.getElementById('agent-message-dialog'),button=doc.getElementById('agent-message-open');
  if(!dialog || !button)return null;
  var life=createWorkbenchLifetime(),snapshot=null,context=null,epoch=0,draftProject=null,draftSource=null,sending=false,timer=null,prepared=null;
  function el(id){return doc.getElementById('agent-message-'+id);}
  var message=el('text'),extra=el('extra'),source=el('source'),preview=el('preview'),status=el('status'),copy=el('copy'),send=el('send');
  var nodes=new Set(),references=new Set();
  function delivery(){
    var connection=opts.connection?opts.connection():{connected:false};
    copy.disabled=sending || !fresh() || !preview.value || !!(connection.connected && connection.pending && (!prepared || prepared.requestId!==connection.pending || prepared.source!==snapshot.text || prepared.project!==snapshot.project || prepared.message!==preview.value));
    el('cancel-turn').hidden=!connection.pending;
    send.disabled=sending || !fresh() || !preview.value || !connection.connected || !connection.listening || connection.pending || preview.value.length>16000;
    el('connect').hidden=connection.connected;
    el('connection').textContent=connection.connected?
      (connection.pending?'A request is active. Continue the conversation in your agent, or stop accepting this turn to prepare a new request.':preview.value.length>16000?'This message exceeds the connected session’s 16,000 character limit. Choose less context or use Copy message.':
        'Shared folder: '+connection.folderName+(connection.listening?' · Direct Send is available through Claude Monitor.':' · Copy and paste is ready. Direct Send requires Claude Monitor; see the connection instructions.')):
      'Connect your local Claude folder to send directly, or copy the message into any agent.';
  }
  function watch(){
    if(!dialog.open)return;
    if(snapshot && !fresh())update();else delivery();
    timer=life.delay(watch,500);
  }
  function fresh(){
    var current=opts.snapshot();
    return snapshot && current.open && current.project===snapshot.project && current.text===snapshot.text;
  }
  function update(){
    epoch++;
    if(!fresh()){
      preview.value='';copy.disabled=true;send.disabled=true;status.textContent='The diagram changed. Close and reopen this message to choose current context.';return;
    }
    preview.value=workbenchAgentMessage(context,{message:message.value,nodes:nodes,references:references,extra:extra.value,source:source.checked?snapshot.text:''});
    copy.disabled=!preview.value;
    status.textContent='Copy this message into your agent. You can also send it directly through your connected Claude folder.';
    el('count').textContent=nodes.size+' nodes · '+references.size+' references';
    delivery();
  }
  function list(id,entries,chosen,empty,seed){
    var host=el(id);host.replaceChildren();
    if(!entries.length){var note=doc.createElement('p');note.className='reuse-note';note.textContent=empty;host.appendChild(note);}
    entries.forEach(function(entry){
      if(seed && entry.selected)chosen.add(entry.key);
      var label=doc.createElement('label'),input=doc.createElement('input'),text=doc.createElement('span');
      input.type='checkbox';input.value=entry.key;input.checked=chosen.has(entry.key);text.textContent=entry.label;
      label.append(input,text);host.appendChild(label);
    });
  }
  function open(preserve){
    if(!life.alive() || dialog.open)return;
    snapshot=opts.snapshot();if(!snapshot.open)return;
    if(opts.pause)opts.pause();
    var keep=preserve===true && draftProject===snapshot.project && draftSource===snapshot.text;
    if(draftProject!==snapshot.project){message.value='';extra.value='';source.checked=false;draftProject=snapshot.project;}
    draftSource=snapshot.text;
    if(!keep){nodes=new Set();references=new Set();}
    context=snapshot.error?null:workbenchAgentContext(snapshot.raw,snapshot.previewCurrent?snapshot.selection:[]);
    var error=snapshot.error?'Fix the diagram’s JSON before preparing a message.':!snapshot.previewCurrent?'The preview is behind your source. Choose context below from the current JSON.':'';
    el('error').textContent=error;el('error').hidden=!error;
    el('nodes').replaceChildren();el('references').replaceChildren();
    message.disabled=extra.disabled=source.disabled=!!snapshot.error;
    preview.value='';copy.disabled=true;send.disabled=true;el('count').textContent='';
    if(context){
      list('nodes',context.nodes,nodes,'This diagram has no nodes.',!keep);
      list('references',context.references,references,'No code or service references yet. Add a URL or file path below.',!keep);
      update();
    }else status.textContent='Close this message to repair the source.';
    delivery();dialog.showModal();(context?message:el('close')).focus({preventScroll:true});watch();
  }
  function close(focus){
    epoch++;snapshot=null;life.cancelDelay(timer);
    if(dialog.open)dialog.close();
    if(focus!==false && button.isConnected)button.focus({preventScroll:true});
  }
  life.listen(button,'click',open);
  life.listen(el('close'),'click',function(){close();});
  life.listen(el('connect'),'click',function(){close(false);if(opts.connect)opts.connect();});
  life.listen(dialog,'cancel',function(ev){ev.preventDefault();close();});
  life.listen(dialog,'close',function(){epoch++;snapshot=null;life.cancelDelay(timer);});
  [message,extra,source].forEach(function(input){life.listen(input,'input',update);});
  ['nodes','references'].forEach(function(id){life.listen(el(id),'change',function(ev){
    var input=ev.target;if(input.type!=='checkbox')return;
    var chosen=id==='nodes'?nodes:references;
    if(input.checked)chosen.add(input.value);else chosen.delete(input.value);update();
  });});
  function focus(delivery){return {source:snapshot.text,project:snapshot.project,views:snapshot.views || [],previewCurrent:snapshot.previewCurrent,replySurface:'agent',delivery:delivery,
    selection:context.nodes.filter(function(node){return nodes.has(node.key);}).map(function(node){return node.target;})};}
  life.listen(el('cancel-turn'),'click',async function(){
    try{await opts.cancel();prepared=null;status.textContent='This turn is no longer accepted. Interrupt your agent in its own app if it is still working.';delivery();}
    catch(ex){status.textContent=ex.message;}
  });
  life.listen(copy,'click',async function(){
    update();if(copy.disabled)return;
    var token=epoch,text=preview.value,connection=opts.connection();
    function current(){return life.alive() && dialog.open && token===epoch && fresh();}
    sending=true;delivery();
    try{
      if(connection.connected){
        if(!prepared || prepared.requestId!==connection.pending || prepared.message!==text || !connection.pending){
          // The full message travels on the clipboard. Keep registration small
          // when source/context exceeds the direct transport's message limit.
          var registered=text.length<=16000?text:'A long message ('+text.length+' characters) is being copied to our native agent conversation. Wait for the complete pasted message and follow its instructions and selected context. The shared state.json contains the complete current diagram.';
          var captured=focus('clipboard'),request=await opts.send(registered,captured);
          prepared={requestId:request.id,source:captured.source,project:captured.project,message:text,text:'Read CONNECT.md in our shared folder '+JSON.stringify(connection.folderName)+'. Use registered request '+JSON.stringify(request.id)+' (session '+JSON.stringify(request.sessionId)+', connection '+JSON.stringify(request.connectionId)+'). Read its saved context and the latest state.json before editing. Reply and ask questions here in this agent conversation. Submit changes for preview; do not overwrite the shared source.\n\n'+text};
        }
        text=prepared.text;
      }
      if(!current())return;
      try{await navigator.clipboard.writeText(text);if(current())status.textContent='Copied. Paste into your agent’s conversation. The folder watcher will not send this copied request automatically.';}
      catch(ex){if(current()){preview.value=text;preview.focus();preview.select();status.textContent='Press ⌘C / Ctrl+C to copy this prepared message, then paste into your agent. You can also stop accepting this turn to cancel it.';}}
    }catch(ex){if(current())status.textContent='Could not prepare the message: '+ex.message;}
    finally{sending=false;if(life.alive() && dialog.open)delivery();}
  });
  life.listen(send,'click',async function(){
    update();if(send.disabled)return;
    var token=epoch,text=preview.value;
    var captured=focus('monitor');
    sending=true;delivery();status.textContent='Sending through your local Claude folder…';
    try{
      await opts.send(text,captured);
      if(life.alive() && dialog.open && token===epoch)status.textContent='Message saved for Claude. Continue in Claude for replies, follow-up questions, and interrupts.';
    }catch(ex){if(life.alive() && dialog.open && token===epoch)status.textContent='Could not send: '+ex.message;}
    finally{sending=false;if(life.alive() && dialog.open)delivery();}
  });
  life.own(function(){close(false);});
  return {open:open,close:close,destroy:life.destroy};
}
