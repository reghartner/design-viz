/* Editor-only worker payload, expanded by the source loader. */
var AUTO_ARRANGE_WORKER_SOURCE=/* @auto-arrange-worker */ "";
function startAutoArrangeWorker(d){
  var worker=null,url=null,timer=null,settle;
  var promise=new Promise(function(resolve,reject){
    settle=function(error,result){
      if(timer!=null)clearTimeout(timer);if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);
      timer=null;worker=null;url=null;error?reject(new Error(error)):resolve(result);
    };
    try{
      url=URL.createObjectURL(new Blob([AUTO_ARRANGE_WORKER_SOURCE],{type:'text/javascript'}));
      worker=new Worker(url);
      worker.onmessage=function(event){settle(event.data.error,event.data.result);};
      worker.onerror=function(event){event.preventDefault();settle('Auto arrange could not start. This browser must allow local workers and WebAssembly.');};
      timer=setTimeout(function(){settle('Auto arrange took too long. Try a smaller diagram. The source is unchanged.');},20000);
      worker.postMessage(d);
    }catch(error){settle('Auto arrange is unavailable in this browser. The source is unchanged.');}
  });
  return {promise:promise,cancel:function(){if(worker)settle('Auto arrange cancelled.');}};
}
function createAutoArrangeController(opts){
  var life=createWorkbenchLifetime(),button=opts.button,job=null,snapshot=null,invalid=false;
  if(!button)return {destroy:function(){},cancel:function(){}};
  var dialog=opts.document.createElement('dialog');dialog.className='workspace-change-dialog';dialog.id='auto-arrange-dialog';dialog.setAttribute('aria-labelledby','auto-arrange-title');
  dialog.innerHTML='<h2 id="auto-arrange-title">Auto arrange this diagram?</h2><p data-arrange-warning></p><p>This replaces node placement and edge settings, including ports, bends, curve handles and label nudges. You can tweak the result and undo the entire arrangement with one Undo.</p><p data-arrange-status role="status" aria-live="polite"></p><div><button type="button" data-arrange-cancel>Cancel</button> <button type="button" class="rbtn" data-arrange-confirm>Auto arrange</button></div>';
  opts.document.body.appendChild(dialog);
  var confirm=dialog.querySelector('[data-arrange-confirm]'),cancel=dialog.querySelector('[data-arrange-cancel]'),status=dialog.querySelector('[data-arrange-status]');
  function fresh(){var now=opts.context();return !invalid && !now.error && now.text===snapshot.text && now.project===snapshot.project && now.section===snapshot.section;}
  function stop(){if(job){job.cancel();job=null;}snapshot=null;invalid=false;button.disabled=false;button.textContent='Auto arrange';if(dialog.open)dialog.close();}
  function stale(){if(!snapshot)return;invalid=true;if(job)job.cancel();status.textContent='The diagram or active section changed. Close this dialog and try again.';confirm.disabled=true;}
  life.listen(button,'click',function(){
    var current=opts.context();if(current.error){opts.message(current.error);return;}
    try{autoArrangeInput(current.diagram);}catch(error){opts.message(error.message);return;}
    snapshot=current;invalid=false;status.textContent='';confirm.disabled=false;cancel.textContent='Cancel';
    dialog.querySelector('[data-arrange-warning]').textContent=current.label || 'Arrange the active diagram.';
    opts.pause();dialog.showModal();cancel.focus();
  });
  life.listen(confirm,'click',async function(){
    if(!snapshot || job)return;if(!fresh()){stale();return;}
    var captured=snapshot;confirm.disabled=true;button.disabled=true;button.textContent='Arranging…';status.textContent='Finding clear routes…';
    var running=opts.run(captured.diagram);job=running;
    try{
      var result=await running.promise;
      if(!life.alive() || job!==running)return;
      if(!fresh()){stale();return;}
      var plan=planAutoArrange(captured.text,captured.raw,captured.section,result);
      if(plan.error)throw new Error(plan.error);
      if(!opts.commit(plan,captured))throw new Error('The source changed. Auto arrange cancelled.');
      stop();opts.message('Diagram arranged. Drag nodes and curve handles to refine it. Undo restores the previous layout.');
    }catch(error){
      if(!life.alive() || job!==running)return;
      status.textContent=error.message;cancel.textContent='Close';confirm.disabled=true;
    }finally{if(job===running){job=null;button.disabled=false;button.textContent='Auto arrange';}}
  });
  life.listen(cancel,'click',stop);life.listen(dialog,'cancel',function(event){event.preventDefault();stop();});
  life.listen(opts.src,'input',stale);
  life.listen(opts.view,'workbench-view-section',function(){if(snapshot && opts.context().section!==snapshot.section)stale();});
  return {cancel:stop,destroy:function(){stop();life.destroy();dialog.remove();}};
}
