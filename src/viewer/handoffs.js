/* Diagram continuation artwork stays within the ordinary node bounds, so edge
   routing, stack placement, step focus and semantic tones remain shared. */
function handoffNodeContent(node, position, id, prefix, options){
  options=options || {};
  var w=position.w,h=position.h,tip=19;
  var local=node.handoff && node.handoff.localSection!=null;
  var destination=local && options.localHandoffTarget && options.localHandoffTarget(node.handoff);
  var href=local?null:diagramHandoffURL(node.handoff,options.resolveDiagramLink);
  var title=node.title || id, available=!!(href || destination);
  var hint=available?'Open '+title+' diagram'+(local?' in this spec':' (new tab)'):local?'Diagram destination unavailable. Choose an existing diagram section.':'Diagram destination unavailable. Add a URL or configure the host diagram-link resolver.';
  var caption=available?(local?'CONTINUE →':'OPEN DIAGRAM ↗'):'DESTINATION UNAVAILABLE';
  var max=Math.max(10,Math.floor((w-tip-22)/6.6));
  var chars=Array.from(title),shown=chars.length>max?chars.slice(0,max-1).join('')+'…':title;
  var outline='M10 0H'+(w-tip)+'L'+w+' '+(h/2)+'L'+(w-tip)+' '+h+'H10Q0 '+h+' 0 '+(h-10)+'V10Q0 0 10 0Z';
  var body='<path class="card handoff-card" data-node-width="'+w+'" data-node-height="'+h+'" d="'+outline+'"/>'+
    '<path class="handoff-stripe" d="M'+(w-tip-5)+' 10L'+(w-6)+' '+h/2+'L'+(w-tip-5)+' '+(h-10)+'"/>'+
    '<text class="t1" x="12" y="'+(h/2-2)+'">'+esc(shown)+'</text>'+
    '<text class="t2 handoff-caption" x="12" y="'+(h/2+14)+'">'+caption+'</text>';
  var tooltip=esc(title+(node.sub?' · '+node.sub:'')+' — '+hint);
  if(!available)return '<g class="handoff-unavailable" role="img" aria-label="'+esc(title+' — '+hint)+'"><title>'+tooltip+'</title>'+body+'</g>';
  var tag=local?'g':'a';
  var attrs=' class="handoff-link" '+(local?'role="button" tabindex="0" data-dv-handoff="'+esc(destination.reference)+'"':'href="'+esc(href)+'" target="_blank" rel="noopener noreferrer"')+' aria-label="'+esc(hint)+'"';
  // In the builder, the body remains selectable; the arrow tip is the preview link.
  if(options.authoring)return '<title>'+tooltip+'</title>'+body+'<'+tag+attrs+'><title>'+esc(hint)+'</title><path class="handoff-hit" d="M'+(w-tip-7)+' 0H'+(w-tip)+'L'+w+' '+h/2+'L'+(w-tip)+' '+h+'H'+(w-tip-7)+'Z"/></'+tag+'>';
  return '<'+tag+attrs+'><title>'+tooltip+'</title>'+body+'</'+tag+'>';
}

/* Switch mounted sections instead of creating a drill-down. The return trail is
   owned by this viewer; playback stays paused and each diagram keeps its state. */
function wireLocalHandoffs(ctl, page){
  var trail=[],disposed=false,checkpoint=0,nextCheckpoint=0;
  var historyOwner=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),checkpoints=new Map([[0,[]]]);
  function remember(){
    checkpoint=++nextCheckpoint;checkpoints.set(checkpoint,trail.slice());
    if(checkpoints.size>100)checkpoints.delete(checkpoints.keys().next().value);
  }
  var back=document.createElement('button');back.type='button';back.className='mbtn handoff-back';
  function reader(rec){return rec.presentation && rec.presentation.snapshotReaderState?rec.presentation:rec.viewport;}
  function save(rec, trigger){
    var sp=rec.stepper,r=reader(rec),board=rec.sectionEl.querySelector('.board');
    var active=ctl.details && ctl.details.activeSection(),node=trigger.closest('[data-dv-node]');
    var heading=(active || rec).sectionEl.querySelector('.sec-h'),detailReader=active && reader(active);
    return {rec:rec,trigger:trigger,node:node && node.getAttribute('data-dv-node'),label:heading && heading.textContent.trim(),
      tabView:ctl.views && ctl.views.current(rec) && ctl.views.current(rec).id,detailReader:detailReader && detailReader.snapshotReaderState(),view:rec.presentation && rec.presentation.viewId(),
      mode:sp && sp.mode(),path:sp && sp.path(),sourceIndex:sp && sp.sourceIndex(),
      reader:r && r.snapshotReaderState(),scroll:board && {x:board.scrollLeft,y:board.scrollTop},
      drill:ctl.details && ctl.details.snapshot()};
  }
  function restore(saved){
    var rec=saved.rec,sp=rec.stepper,r=reader(rec);
    if(ctl.views)ctl.views.ensure(rec,saved.tabView,true);
    if(!ctl.views && rec.presentation && saved.view!=null && rec.presentation.viewId()!==saved.view)rec.presentation.setView(saved.view);
    if(sp){
      sp.pause();
      if(saved.mode==='step')sp.jumpSource(saved.sourceIndex,saved.path);
      else {if(saved.path && sp.path()!==saved.path)sp.selectPath(saved.path);sp.enterAmbient();}
    }
    if(r && saved.reader)r.restoreReaderState(saved.reader);
    var board=rec.sectionEl.querySelector('.board');
    if(board && saved.scroll){board.scrollLeft=saved.scroll.x;board.scrollTop=saved.scroll.y;}
    if(saved.drill && ctl.details){
      ctl.details.restore(saved.drill);
      var active=ctl.details.activeSection(),detailReader=active && reader(active);
      if(detailReader && saved.detailReader)detailReader.restoreReaderState(saved.detailReader);
    }
  }
  function paintBack(rec){
    back.remove();
    if(!trail.length || !rec)return;
    var previous=trail[trail.length-1].rec,record=detailSection(page,previous.reference);
    back.textContent='← Back to '+(trail[trail.length-1].label || record.section.heading || record.tabLabel || previous.reference);
    (rec.sectionEl.querySelector('.diagram-views') || rec.sectionEl).prepend(back);
  }
  function activate(rec, saved){
    if(disposed)return;
    var notify=ctl.onChange,visible=rec;
    // Restoring a view or step can emit changes. Publish only the final route so
    // hosts and browser history never observe an intermediate destination.
    ctl.onChange=null;
    try{
      ctl.steppers.forEach(function(item){item.stepper.pause();});
      if(ctl.details)ctl.details.close(true);
      if(rec.tabBlock!=null)ctl.tabBlocks[rec.tabBlock-1].select(rec.tab,false,false);
      if(ctl.view.querySelector('.dv-embed-target')){
        ctl.sections.forEach(function(item){item.sectionEl.classList.toggle('dv-embed-target',item===rec);});
      }
      if(ctl.views && !ctl.views.ensure(rec,saved && saved.tabView,true))return;
      rec.sectionEl.hidden=false;
      if(rec.stepper){rec.stepper.onShow();rec.stepper.pause();}
      ctl.activeTarget={kind:'diagram',section:rec.number};
      // Workbench canvas selection must move to the base section before a saved
      // detail stack is restored; its detail-navigation refresh uses that base.
      ctl.view.dispatchEvent(new CustomEvent('local-handoff-navigation',{detail:{section:rec.number-1}}));
      if(saved)restore(saved);
      visible=ctl.details && ctl.details.activeSection() || rec;
      paintBack(visible);
      remember();
    }finally{ctl.onChange=notify;}
    ctl.handoffHistoryPush=true;
    if(ctl.onChange)ctl.onChange();
    ctl.handoffHistoryPush=false;
    visible.sectionEl.scrollIntoView({block:'start',behavior:'instant'});
    var restoredTrigger=saved && Array.from(visible.sectionEl.querySelectorAll('[data-dv-handoff]')).find(function(el){
      var node=el.closest('[data-dv-node]');return node && node.getAttribute('data-dv-node')===saved.node;
    });
    var focus=restoredTrigger || (back.isConnected?back:visible.sectionEl.querySelector('.sec-h'));
    if(focus){if(!focus.hasAttribute('tabindex') && focus.tagName!=='BUTTON')focus.setAttribute('tabindex','-1');focus.focus({preventScroll:true});}
  }
  function follow(event){
    var trigger=event.target.closest && event.target.closest('[data-dv-handoff]');
    if(!trigger || !ctl.view.contains(trigger) || disposed)return;
    if(event.type==='keydown' && event.key!=='Enter' && event.key!==' ')return;
    event.preventDefault();event.stopPropagation();
    var reference=trigger.getAttribute('data-dv-handoff');
    var target=ctl.sections.find(function(rec){return rec.reference===reference && rec.hasDiagram && !rec.detailOnly;});
    var source=ctl.sections.find(function(rec){return rec.sectionEl.contains(trigger);});
    var drill=null;
    if(!source && ctl.details){drill=ctl.details.snapshot();source=drill && ctl.sections.find(function(rec){return rec.reference===drill.section;});}
    if(!target || !source || (target===source && !drill))return;
    trail.push(save(source,trigger));if(trail.length>50)trail.shift();
    activate(target);
  }
  function goBack(){if(!disposed && trail.length){var saved=trail.pop();activate(saved.rec,saved);}}
  ctl.view.addEventListener('click',follow);ctl.view.addEventListener('keydown',follow);
  back.addEventListener('click',goBack);
  return {
    historyState:function(){return {owner:historyOwner,checkpoint:checkpoint};},
    restoreHistory:function(state,rec){
      if(state && state.owner===historyOwner && checkpoints.has(state.checkpoint)){checkpoint=state.checkpoint;trail=checkpoints.get(checkpoint).slice();}
      else {trail=[];remember();}
      paintBack(ctl.details && ctl.details.activeSection() || rec);
    },
    destroy:function(){disposed=true;trail=[];checkpoints.clear();back.remove();back.removeEventListener('click',goBack);ctl.view.removeEventListener('click',follow);ctl.view.removeEventListener('keydown',follow);}
  };
}
