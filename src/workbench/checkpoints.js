/* Local checkpoint UI. Preview has its own reader and lifetime; source changes
   only through the session's explicit, stale-checked Restore transaction. */
function builderCheckpointComparison(before,after){
  if(before===after)return {summary:'Matches the current source exactly.',findings:[]};
  try{
    var result=diffSpecTexts(before,after);
    if(result.error)return {summary:'Source differs. Structural comparison is unavailable because '+result.error.replace('baseline','checkpoint')+'.',findings:[]};
    return {summary:result.findings.length?result.findings.length+' structural change'+(result.findings.length===1?'':'s')+' from checkpoint to current.':'Source differs; no structural changes detected (formatting or unreported fields may differ).',findings:result.findings};
  }catch(ex){return {summary:'Source differs. Structural comparison is unavailable for this document.',findings:[]};}
}
function initWorkbenchCheckpoints(opts){
  var opener=document.getElementById('open-history');
  if(!opener)return {show:function(){},close:function(){},destroy:function(){}};
  var session=opts.session,life=createWorkbenchLifetime(),rows=createWorkbenchLifetime(),reader=null,canvas=null,anchor=null,scroll=null,snapshot=null,selected=null;
  var dialog=document.createElement('dialog');
  dialog.id='checkpoint-history';dialog.className='checkpoint-history';dialog.setAttribute('aria-labelledby','checkpoint-title');
  dialog.innerHTML='<header><div><h2 id="checkpoint-title">History</h2><p>Named checkpoints in this browser</p></div><button type="button" class="bbtn" data-close>Close</button></header>'+
    '<p class="checkpoint-note">Keep up to 20 checkpoints / 1 MiB per project. These local copies stay with browser recovery and are not included in exports. Restore is one Undo action.</p>'+
    '<form class="checkpoint-create"><label for="checkpoint-name">Checkpoint name</label><input id="checkpoint-name" maxlength="80" required placeholder="Before the redesign"><button class="rbtn" type="submit">Save checkpoint</button></form>'+
    '<p class="checkpoint-status" role="status" aria-live="polite"></p><div class="checkpoint-columns"><nav class="checkpoint-list" aria-label="Checkpoints"></nav><section class="checkpoint-detail" aria-label="Checkpoint comparison"><div class="checkpoint-info"></div><div class="checkpoint-surface"><div class="checkpoint-view" id="checkpoint-preview-view"></div></div></section></div>';
  document.body.appendChild(dialog);
  var list=dialog.querySelector('.checkpoint-list'),info=dialog.querySelector('.checkpoint-info'),view=dialog.querySelector('.checkpoint-view'),status=dialog.querySelector('.checkpoint-status'),name=dialog.querySelector('#checkpoint-name');
  function node(tag,text,parent){var el=document.createElement(tag);el.textContent=text;if(parent)parent.appendChild(el);return el;}
  function button(text,parent,fn){var el=node('button',text,parent);el.type='button';el.className='bbtn';rows.listen(el,'click',fn);return el;}
  function destroyReader(){if(canvas)canvas.destroy();canvas=null;if(reader)reader.destroy();reader=null;view.replaceChildren();}
  function reattach(){
    if(anchor && anchor.parentNode)anchor.replaceWith(opts.authorView);anchor=null;
    if(scroll)scroll.forEach(function(saved){saved.el.scrollLeft=saved.x;saved.el.scrollTop=saved.y;});scroll=null;
  }
  function close(refocus){
    destroyReader();reattach();snapshot=null;selected=null;rows.destroy();rows=createWorkbenchLifetime();
    if(dialog.open)dialog.close();
    if(refocus!==false && opener && opener.isConnected)opener.focus({preventScroll:true});
  }
  function preview(entry){
    try{
      var page=normalize(session.resolve(JSON.parse(entry.text))),verdict=validate(page);
      if(verdict.errors.length)throw Error(verdict.errors[0]);
      if(!anchor && opts.authorView.parentNode){
        scroll=[];for(var el=opts.authorView;el;el=el.parentElement)scroll.push({el:el,x:el.scrollLeft,y:el.scrollTop});
        anchor=document.createComment('history author view');opts.authorView.before(anchor);opts.authorView.remove();
      }
      var skin=opts.skin?opts.skin(page):'pastel';
      // Reader options deliberately omit authoring and borrow no current-page
      // navigation state. Frozen provider context belongs to the project.
      reader=renderWorkbenchReaderPreview(view,page,skin,null,{snapshot:{}});
      applySkinClasses(null,view,skin);
      view.classList.add('checkpoint-view');
      canvas=initViewerExploreCanvas(reader,view,{container:view.parentElement});
    }catch(ex){destroyReader();reattach();node('p','No visual preview: '+ex.message+' Exact source is still available to restore.',view);}
  }
  function refresh(){
    destroyReader();rows.destroy();rows=createWorkbenchLifetime();list.replaceChildren();info.replaceChildren();
    snapshot=session.snapshot();var entries=session.checkpoints(),entry=entries.find(function(saved){return saved.id===selected;});
    entries.forEach(function(saved){
      var row=button(saved.name,list,function(){selected=saved.id;status.textContent='';refresh();});
      row.classList.add('checkpoint-row');row.setAttribute('aria-current',saved.id===selected?'true':'false');
      node('small',new Date(saved.at).toLocaleString(),row);
      node('small',builderCheckpointComparison(saved.text,snapshot.text).summary,row);
    });
    if(!entries.length)node('p','No checkpoints yet. Name the current source to keep a point you can return to.',list);
    if(!entry){reattach();node('p','Choose a checkpoint to compare and preview it.',info);return;}
    node('h3',entry.name,info);node('p','Checkpoint preview · '+new Date(entry.at).toLocaleString(),info);
    var comparison=builderCheckpointComparison(entry.text,snapshot.text);node('p',comparison.summary,info);
    var changes=node('details','',info);node('summary','Changes from checkpoint to current',changes);
    comparison.findings.slice(0,100).forEach(function(f){node('p',f.text,changes);});
    if(comparison.findings.length>100)node('p','Showing the first 100 changes.',changes);
    var actions=node('div','',info);actions.className='checkpoint-actions';
    var restore=button('Restore checkpoint',actions,function(){
      var expected=snapshot,id=entry.id;close(false);
      if(session.restoreCheckpoint(id,expected)){if(opener)opener.focus({preventScroll:true});}
      else {show();status.textContent='The source changed while History was open. Review it again before restoring.';}
    });restore.disabled=entry.text===snapshot.text;
    var renameGroup=node('div','',info),renameLabel=node('label','Rename checkpoint',renameGroup),rename=node('input','',renameLabel);rename.value=entry.name;rename.maxLength=80;
    button('Rename',renameGroup,function(){var result=session.saveCheckpoint(rename.value,entry.id);status.textContent=result.error || 'Checkpoint renamed.';if(!result.error)refresh();});
    var deletion=node('div','',info);
    button('Delete checkpoint…',deletion,function(){
      deletion.replaceChildren();node('span','Delete “'+entry.name+'”? This cannot be undone. ',deletion);
      button('Confirm delete',deletion,function(){session.deleteCheckpoint(entry.id);selected=null;refresh();status.textContent='Checkpoint deleted.';});
      button('Cancel',deletion,refresh);
    });
    preview(entry);
  }
  function show(){
    if(!life.alive() || dialog.open)return;
    if(opts.pause)opts.pause();status.textContent='';name.value='';selected=null;dialog.showModal();refresh();name.focus();
  }
  life.listen(opener,'click',show);
  life.listen(dialog.querySelector('[data-close]'),'click',function(){close();});
  life.listen(dialog,'cancel',function(ev){ev.preventDefault();close();});
  life.listen(dialog,'close',function(){if(snapshot && !dialog.open)close(false);});
  life.listen(dialog,'keydown',function(ev){ev.stopPropagation();});
  life.listen(dialog.querySelector('form'),'submit',function(ev){
    ev.preventDefault();var result=session.saveCheckpoint(name.value);
    status.textContent=result.error || 'Checkpoint saved. Check File for browser recovery status.';
    if(!result.error){selected=result.id;name.value='';refresh();}
  });
  return {show:show,close:close,destroy:function(){close(false);life.destroy();rows.destroy();dialog.remove();}};
}
