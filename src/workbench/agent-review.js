/* Read-only proposed state, separate from the editor's document and history. */
function workbenchAgentConflictFeedback(review){
  return ['Your proposed Flowview update could not be committed. My current diagram has been preserved.',
    'Proposal: '+review.id, 'Starting revision: '+review.baseRevision, 'Current revision: '+review.revision,'',
    'Please resolve these conflicts or validation problems:',
    (review.conflicts || []).map(function(item){return '- '+item.path+': '+item.reason;}).join('\n'),'',
    'Reread state.json and story.spec.json in our shared folder. Reconcile your intended changes with my latest edits, preserve unrelated work, validate the complete story, and submit a new proposal with the revision you actually read. Do not just relabel the old proposal with a newer revision.'
  ].join('\n');
}
function initWorkbenchAgentReview(opts){
  var doc=opts.document,life=createWorkbenchLifetime(),banner=doc.getElementById('agent-update-banner'),dialog=doc.getElementById('agent-update-dialog');
  var state=null,shown=null,ctl=null,canvas=null,viewing='proposed',rendered=false;
  function el(id){return doc.getElementById('agent-update-'+id);}
  function retire(){if(canvas)canvas.destroy();canvas=null;if(ctl)ctl.destroy();ctl=null;el('view').replaceChildren();rendered=false;}
  function close(){if(dialog.open)dialog.close();retire();shown=null;}
  function draw(){
    retire();if(!shown)return;
    el('commit').disabled=true;
    el('current').setAttribute('aria-pressed',String(viewing==='current'));el('proposed').setAttribute('aria-pressed',String(viewing==='proposed'));
    var source=viewing==='current'?shown.current:shown.source;
    el('source').value=source || '';
    if(!source){el('view').textContent='Resolve the issues above with your agent to get a complete, valid preview.';return;}
    try{
      var page=normalize(JSON.parse(source)),findings=validate(page);if(findings.errors.length)throw Error(findings.errors.join('\n'));
      ctl=renderPage(el('view'),page,page.skin,null,{autoplay:false});
      canvas=initViewerExploreCanvas(ctl,el('view'));rendered=true;
      el('commit').disabled=!shown.review.ok || viewing!=='proposed';
    }catch(ex){el('view').textContent='Could not render this preview: '+ex.message;}
  }
  function refresh(){
    var next=opts.snapshot();if(!next){close();return;}
    var changed=shown && shown.review.version!==next.review.version;shown=next;
    el('summary').textContent=next.review.summary;
    el('note').textContent=!next.review.ok?'Your current story is unchanged. Share this feedback so your agent can revise the update.':
      (changed?'The diagram changed, so this preview has been refreshed. Review it again. ':next.review.merged?'Your changes and the agent’s separate changes are combined below. ':'')+'Commit applies this preview as one undoable change.';
    el('issues').hidden=!!next.review.ok;el('feedback').value=workbenchAgentConflictFeedback(next.review);
    draw();
  }
  function open(){if(!state)return;if(!dialog.open)dialog.showModal();viewing='proposed';refresh();el('close').focus();}
  function update(review){
    state=review;banner.hidden=!review;
    if(review){
      el('banner-title').textContent=review.ok?'Agent updates are ready':'Agent update needs attention';
      el('banner-summary').textContent=review.ok?(review.merged?'Includes your latest edits. ':'')+review.summary:'Conflicts or validation problems need a revision from your agent.';
      el('open').textContent=review.ok?'Preview Agent Updates':'Review conflicts';
    }
    if(dialog.open && !review){close();return;}
    if(dialog.open && (!shown || shown.review.version!==review.version))refresh();
  }
  life.listen(el('open'),'click',open);life.listen(el('close'),'click',close);
  life.listen(dialog,'cancel',function(event){event.preventDefault();close();});life.listen(dialog,'close',retire);
  life.listen(el('current'),'click',function(){viewing='current';draw();});life.listen(el('proposed'),'click',function(){viewing='proposed';draw();});
  life.listen(el('commit'),'click',async function(){
    if(!shown || !rendered || !shown.review.ok || viewing!=='proposed')return;
    var version=shown.review.version;close();await opts.accept(version);
    if(state)open();
  });
  life.listen(el('discard'),'click',async function(){if(!shown)return;var version=shown.review.version;close();await opts.reject(null,version);});
  life.listen(el('copy-feedback'),'click',async function(){
    if(!shown)return;var version=shown.review.version,text=el('feedback').value;
    try{await navigator.clipboard.writeText(text);if(shown && shown.review.version===version){close();await opts.reject(text,version);}}
    catch(ex){el('feedback').focus();el('feedback').select();el('note').textContent='Press ⌘C / Ctrl+C to copy the feedback. Use Return for revision to release this proposal when you are ready.';}
  });
  life.listen(el('return'),'click',async function(){if(!shown)return;var version=shown.review.version,text=el('feedback').value;close();await opts.reject(text,version);});
  life.own(close);return {update:update,open:open,destroy:life.destroy};
}
