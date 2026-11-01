/* Read-only proposed state, separate from the editor's document and history. */
function workbenchAgentConflictFeedback(review){
  var prefix=review.artifacts && review.artifacts.metadata==='.'?'':'.flowview-agent/';
  return ['Your proposed Flowview update could not be accepted. My current diagram has been preserved.',
    'Proposal: '+review.id, 'Starting revision: '+review.baseRevision, 'Current revision: '+review.revision,'',
    'Please resolve these conflicts or validation problems:',
    (review.conflicts || []).map(function(item){return '- '+item.path+': '+item.reason;}).join('\n'),'',
    'Reread '+prefix+'state.json and the accepted spec and ledger named in '+prefix+'project.json. Reconcile your intended changes with my latest edits, preserve unrelated work, reconcile the ledger with the complete story, validate it, and submit both artifacts in a new proposal with the revision you actually read. Do not just relabel the old proposal with a newer revision.'
  ].join('\n');
}
/* One side for the shared compare engine (#847): the authored page plus the
   same page resolved with the frozen topology context the preview renders. */
function workbenchAgentReviewEngineSide(text,ledger,resolve,context){
  var authored=normalize(JSON.parse(text)),raw=JSON.parse(text);
  var resolved=normalize(resolve?(context?resolve(raw,context):resolve(raw)):raw);
  return {authored:authored,resolved:resolved,ledger:typeof ledger==='string'?ledger:null};
}
/* #848: the preview mounts the shared side-by-side compare view (Before left,
   After right) with the engine's change list. Accept never depends on a side. */
function initWorkbenchAgentReview(opts){
  var doc=opts.document,life=createWorkbenchLifetime(),banner=doc.getElementById('agent-update-banner'),dialog=doc.getElementById('agent-update-dialog');
  var state=null,shown=null,view=null,entries=[],details=false,reviewedVersion=null,rendered=false;
  function el(id){return doc.getElementById('agent-update-'+id);}
  function retire(){if(view)view.destroy();view=null;rendered=false;el('compare').replaceChildren();}
  function displayState(){el('details-panel').hidden=!details;el('details').setAttribute('aria-expanded',String(details));}
  function showDetails(target){
    details=true;displayState();
    var field=el(target),disclosure=field.closest && field.closest('details');if(disclosure)disclosure.open=true;
    field.focus();
  }
  function updateCommit(){el('commit').disabled=!shown || !rendered || !shown.review.ok || reviewedVersion!==shown.review.version;}
  function changeStatus(){
    var counts={added:0,removed:0,modified:0};entries.forEach(function(e){if(counts[e.status]!=null)counts[e.status]++;});
    el('change-added').textContent=counts.added+' added';el('change-removed').textContent=counts.removed+' removed';el('change-modified').textContent=counts.modified+' modified';
    el('change-added').hidden=false;el('change-removed').hidden=false;
    el('change-status').setAttribute('aria-label',counts.added+' added, '+counts.removed+' removed, '+counts.modified+' modified');
  }
  function navigationStatus(message){
    el('previous').disabled=!entries.length;el('next').disabled=!entries.length;
    el('position').textContent=message || (entries.length?'Choose a change to inspect.':'No document or ledger changes.');
    el('position').title=el('position').textContent;
  }
  function onSelect(entry,index,result){
    var parts=[(index+1)+' of '+entries.length,result && result.label || (view && view.label?view.label(index):entry.kind)];
    /* The selection made when the preview opens never opens Details by itself. */
    var reveal=function(target){if(!(result && result.initial))showDetails(target);};
    if(entry.kind==='ledger'){parts.push('Coverage ledger · Shown in Details');navigationStatus(parts.join(' · '));reveal('ledger');return;}
    if(entry.kind==='document'){parts.push('Shown in Details; no rendered object');navigationStatus(parts.join(' · '));reveal('source');return;}
    var b=result && result.before || {},a=result && result.after || {};
    if(!a.shown && !b.shown && (a.reason==='view' || b.reason==='view')){parts.push('Section not included in a View · Inspect source in Details');navigationStatus(parts.join(' · '));reveal('source');return;}
    if(entry.status==='removed' || entry.afterPath==null)parts.push('Removed · not in the proposal');
    else if(entry.status==='added' || entry.beforePath==null)parts.push('Added · not in the current document');
    navigationStatus(parts.join(' · '));
  }
  function close(){if(dialog.open)dialog.close();retire();shown=null;entries=[];details=false;reviewedVersion=null;displayState();}
  function draw(){
    retire();el('commit').disabled=true;if(!shown)return;
    el('source').value=shown.source || '';el('source-before').value=shown.current || '';
    el('ledger').textContent=shown.ledger || 'No coverage ledger yet.';el('ledger-before').textContent=shown.currentLedger || 'No coverage ledger yet.';
    el('ledger-summary').textContent='Coverage ledger · '+(shown.ledger!==shown.currentLedger?'Changed in this update':'Unchanged');
    el('ledger-before-summary').textContent='Coverage ledger · Current state';
    entries=[];
    if(!shown.source){el('compare').textContent='Resolve the issues above with your agent to get a complete, valid preview.';changeStatus();navigationStatus();return;}
    try{
      // Each side resolves with the frozen session; source, highlights and
      // acceptance keep the authored declarations.
      var before=workbenchAgentReviewEngineSide(shown.current,shown.currentLedger,opts.resolve,shown.topologyContext);
      var after=workbenchAgentReviewEngineSide(shown.source,shown.ledger,opts.resolve,shown.topologyContext);
      [before.resolved,after.resolved].forEach(function(page){var findings=validate(page);if(findings.errors.length)throw Error(findings.errors.join('\n'));});
      entries=compareDocuments(before,after);changeStatus();navigationStatus();
      var failed=function(failure){rendered=false;updateCommit();navigationStatus((failure.side==='before'?'Before':'After')+' could not be rendered: '+failure.message);};
      view=mountCompareView(el('compare'),{before:before.resolved,after:after.resolved,entries:entries,skin:opts.skin,onSelect:onSelect,onRenderError:failed,
        ids:{before:{scroll:'agent-update-scroll-before',view:'agent-update-view-before'},after:{scroll:'agent-update-scroll',view:'agent-update-view'}}});
      /* Accept needs both sides rendered (a pane can fail during mount or when it completes later). */
      var errors=view.errors?view.errors():[];rendered=!errors.length;updateCommit();if(errors.length)failed(errors[0]);
    }catch(ex){retire();entries=[];el('compare').textContent='Could not render this preview: '+ex.message;changeStatus();navigationStatus();}
  }
  function refresh(){
    var next=opts.snapshot();if(!next){close();return;}
    var first=!shown,changed=shown && shown.review.version!==next.review.version;shown=next;
    if(first)reviewedVersion=next.review.version;
    if(changed)reviewedVersion=null;
    el('summary').textContent=next.review.summary;
    el('note').hidden=!!next.review.ok && !changed && !next.review.merged;
    el('review-refresh').hidden=!changed;
    el('note-text').textContent=!next.review.ok?'Your current story is unchanged. Share this feedback so your agent can revise the update.':
      changed?'The proposal changed while this preview was open. Review the refreshed version before accepting it.':
      'Your changes and the agent’s separate changes are combined in this preview.';
    el('issues').hidden=!!next.review.ok;el('feedback').value=workbenchAgentConflictFeedback(next.review);
    draw();
  }
  function setSkin(name){return !!(view && view.setSkin(name));}
  function open(){if(!state)return;if(!dialog.open)dialog.showModal();details=false;reviewedVersion=state.version;displayState();refresh();el('close').focus();}
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
  life.listen(dialog,'cancel',function(event){event.preventDefault();if(details){details=false;displayState();el('details').focus();}else close();});life.listen(dialog,'close',retire);
  life.listen(el('details'),'click',function(){details=!details;displayState();if(details)el('details-close').focus();});
  life.listen(el('previous'),'click',function(){if(view)view.previous();});
  life.listen(el('next'),'click',function(){if(view)view.next();});
  life.listen(el('details-close'),'click',function(){details=false;displayState();el('details').focus();});
  life.listen(el('review-refresh'),'click',function(){if(!shown)return;reviewedVersion=shown.review.version;el('review-refresh').hidden=true;el('note-text').textContent='You are reviewing the refreshed proposal.';updateCommit();el('compare').focus && el('compare').focus();});
  life.listen(el('commit'),'click',async function(){
    var latest=opts.snapshot();
    if(!shown || !latest || latest.review.version!==shown.review.version || reviewedVersion!==shown.review.version){refresh();return;}
    if(!rendered || !shown.review.ok)return;
    var version=shown.review.version;close();await opts.accept(version);
    if(state)open();
  });
  life.listen(el('discard'),'click',async function(){if(!shown)return;var version=shown.review.version;close();await opts.reject(null,version);});
  life.listen(el('copy-feedback'),'click',async function(){
    if(!shown)return;var version=shown.review.version,text=el('feedback').value;
    try{await navigator.clipboard.writeText(text);if(shown && shown.review.version===version){close();await opts.reject(text,version);}}
    catch(ex){el('feedback').focus();el('feedback').select();el('note').hidden=false;el('review-refresh').hidden=true;el('note-text').textContent='Press ⌘C / Ctrl+C to copy the feedback. Use Return for revision to release this proposal when you are ready.';}
  });
  life.listen(el('return'),'click',async function(){if(!shown)return;var version=shown.review.version,text=el('feedback').value;close();await opts.reject(text,version);});
  life.own(close);return {update:update,open:open,setSkin:setSkin,destroy:life.destroy};
}
