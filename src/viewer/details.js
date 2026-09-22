/* Instance-owned drill-down navigation. No transport or host routing is assumed.
   Frames retain their DOM so Back restores the exact layout, scroll and panels. */
function wireDetailFlows(ctl, page, skin, backlinks, options){
  options=options || {};
  var session=null, serial=100000, disposed=false, pending=null, generation=0, restoring=false, restoreValue=null;
  var frames=new Map(), liveRoots=new Map();
  ctl.sections.forEach(function(rec){
    var record=detailSection(page,rec.reference);
    var frame={rec:rec,section:record.section,page:page,root:rec,original:true};
    frames.set(rec.sectionEl,frame);liveRoots.set(rec.reference,frame);
    if(record.section.detailOnly && !options.authoring){rec.sectionEl.hidden=true;if(rec.stepper){rec.stepper.pause();rec.stepper.onHide();}}
  });
  function current(){return session && session.stack[session.stack.length-1];}
  function retire(frame){
    frames.delete(frame.rec.sectionEl);
    if(frame.original)return;
    if(frame.rec.stepper)frame.rec.stepper.destroy();
    if(frame.rec.boardSize)frame.rec.boardSize.destroy();
    if(frame.rec.presentation)frame.rec.presentation.destroy();
    if(frame.rec.destroy)frame.rec.destroy();
    frame.rec.sectionEl.remove();
  }
  function pause(frame){if(frame && frame.rec.stepper)frame.rec.stepper.pause();}
  function notice(frame,message){
    var box=frame.rec.sectionEl.querySelector(':scope > .detail-notice');
    if(!box){box=document.createElement('p');box.className='detail-notice';box.setAttribute('role','status');frame.rec.sectionEl.prepend(box);}
    box.textContent=message;
  }
  function cancel(){
    generation++;restoreValue=null;
    if(pending){pending.abort();frames.forEach(function(frame){var status=frame.rec.sectionEl.querySelector(':scope > .detail-notice');if(status && status.textContent==='Loading detail diagram…')status.textContent='';});}
    pending=null;
  }
  function changed(navigation){
    if(disposed || restoring)return;
    ctl.detailHistoryPush=!!navigation;
    if(session)ctl.activeTarget={kind:'diagram',section:session.root.rec.number};
    if(ctl.onChange)ctl.onChange();
    if(options.onDetailNavigate)options.onDetailNavigate(snapshot());
  }
  function restoreOriginal(frame){
    frame.rec.sectionEl.hidden=!!(frame.section.detailOnly && !options.authoring);
    if(frame.rec.stepper && !frame.rec.sectionEl.hidden)frame.rec.stepper.onShow();
  }
  function close(silent){
    cancel();if(!session)return;
    var root=session.root;
    while(session.stack.length>1)retire(session.stack.pop());
    restoreOriginal(root);session=null;
    if(!silent)changed(true);
  }
  function back(index,silent){
    cancel();if(!session)return;
    var departed=session.stack.slice(index+1).find(function(item){return item.via;});
    var returnNode=departed && departed.via;
    while(session.stack.length>index+1)retire(session.stack.pop());
    var frame=current();frame.rec.sectionEl.hidden=false;
    if(frame.rec.stepper)frame.rec.stepper.onShow();
    if(index===0){session=null;}
    if(!silent){
      changed(true);
      var buttons=Array.from(frame.rec.sectionEl.querySelectorAll('[data-dv-detail]'));
      var button=buttons.find(function(el){return el.getAttribute('data-dv-detail')===returnNode;}) || buttons[0];
      if(button)button.focus();
    }
  }
  function breadcrumb(frame){
    var nav=document.createElement('nav');nav.className='detail-breadcrumb';nav.setAttribute('aria-label','Diagram drill-down');
    session.stack.forEach(function(item,i){
      if(i){var arrow=document.createElement('span');arrow.textContent='›';arrow.setAttribute('aria-hidden','true');nav.appendChild(arrow);}
      var button=document.createElement('button');button.type='button';button.textContent=i===0?'Overview':(item.section.heading || item.section.id || 'Detail').split(' · ')[0];button.title=item.section.heading || item.section.id || 'Overview';
      if(item===frame){button.setAttribute('aria-current','page');button.disabled=true;}
      else button.addEventListener('click',function(){back(i);});
      nav.appendChild(button);
    });
    if(options.authoring && frame.page===page){
      var edit=document.createElement('button');edit.type='button';edit.textContent='Edit detail section';edit.className='detail-edit';
      edit.addEventListener('click',function(){var ref=sectionRecords(page).find(function(r){return r.section===frame.section;});if(!ref)return;close(true);var original=liveRoots.get(ref.reference);if(original){original.rec.sectionEl.hidden=false;original.rec.sectionEl.scrollIntoView({block:'start'});}});nav.appendChild(edit);
    }
    frame.rec.sectionEl.prepend(nav);
    if(frame.originStep){var context=document.createElement('p');context.className='detail-context';context.textContent='From '+frame.originStep;nav.after(context);}
    var levels=[];
    session.stack.forEach(function(parent,i){
      var child=session.stack[i+1];if(!child || !child.via)return;
      var diagram=parent.section.diagram;
      var node=diagram.nodes[child.via];if(!node)return;
      levels.push({diagram:diagram,node:child.via,label:node.title || child.via,title:parent.section.heading || parent.section.id || 'Overview',index:i});
    });
    if(levels.length){
      var header=document.createElement('div');header.className='detail-head';
      var intro=document.createElement('div');intro.className='detail-head-intro';header.appendChild(intro);
      var el=frame.rec.sectionEl;el.prepend(header);
      Array.from(el.children).forEach(function(child){if(child.matches('.detail-breadcrumb,.detail-context,.sec-eyebrow,.sec-heading-row,.sec-prose,.sec-teaser'))intro.appendChild(child);});
      header.appendChild(buildDetailOverview(levels,function(index){back(index);}));
    }
  }
  function stepState(frame){
    var sp=frame.rec.stepper,presentation=frame.rec.presentation;
    var state=sp?{path:sp.path(),step:sp.current().id || String(sp.current().n+1),mode:sp.mode()}:{};
    if(frame.rec.boardSize)state.size=frame.rec.boardSize.mode();
    if(presentation){state.focus=presentation.mode();if(presentation.layoutId)state.layout=presentation.layoutId();if(presentation.diagramVisible)state.diagramVisible=presentation.diagramVisible();}
    return state;
  }
  function applyStep(frame,target){
    var presentation=frame.rec.presentation;
    if(target && presentation){
      if(target.layout && presentation.setLayout)presentation.setLayout(target.layout);
      if(target.focus)presentation.setMode(target.focus);
      if(typeof target.diagramVisible==='boolean' && presentation.setDiagramVisible)presentation.setDiagramVisible(target.diagramVisible);
    }
    if(target && target.size && frame.rec.boardSize)frame.rec.boardSize.setMode(target.size);
    var sp=frame.rec.stepper;if(!sp)return;
    sp.pause();
    if(target && target.mode==='ambient'){sp.enterAmbient();return;}
    var path=target && target.path || diagramPathList(frame.section.diagram)[0].id;
    if(target && target.step){
      var resolved=resolveSourceStep(frame.section.diagram,path,target.step);
      if(!resolved || resolved.sourceIndex<0)throw new Error('The requested detail step or path is unavailable.');
      if(!sp.jumpSource(resolved.sourceIndex,path))throw new Error('The requested detail step is unavailable in this view.');
    }else if(target && target.path){
      if(!sp.selectPath(path))throw new Error('The requested detail path is unavailable in this view.');
      sp.enterStep(false);
    }
  }
  function build(section, childPage, root){
    var host=document.createElement('div');
    root.rec.sectionEl.parentNode.insertBefore(host,root.rec.sectionEl.nextSibling);
    var built;
    try{built=buildSection(host,section,serial++,'detail-'+serial,resolveProtocols(childPage),skinBase(skin),resolveLanes(childPage),backlinks,
      function(){changed(false);},null,Object.assign({},options,{autoplay:false}));}
    catch(error){host.remove();throw error;}
    var el=built.sectionEl;host.replaceWith(el);
    el.setAttribute('data-dv-detail-preview','');
    var eyebrow=el.querySelector('.sec-eyebrow');if(eyebrow)eyebrow.textContent='Detail flow';
    el.querySelectorAll('.embedcopy').forEach(function(b){b.remove();});
    if(ctl.bindDetailCopy && built.stepper)ctl.bindDetailCopy(built.stepper.copyButton);
    if(root.rec.sectionEl.classList.contains('dv-embed-target'))el.classList.add('dv-embed-target');
    var frame={rec:built,section:section,page:childPage,root:root.rec};frames.set(el,frame);
    return frame;
  }
  function begin(frame){
    if(session && session.stack.indexOf(frame)>=0)return;
    if(!restoring)close(true);session={root:frame,stack:[frame]};
  }
  function openLocal(frame,id,detail,childPage,childSection,target){
    if(session && session.stack.length>=DETAIL_MAX_DEPTH)throw new Error('Maximum drill-down depth reached. Use the breadcrumb to return.');
    begin(frame);pause(frame);
    var next=build(childSection,childPage,session.root);
    try{applyStep(next,target);}catch(error){retire(next);throw error;}
    next.via=id;next.external=detail.spec?{spec:detail.spec,revision:detail.revision,section:detail.section}:null;
    next.originStep=frame.rec.stepper && frame.rec.stepper.mode()==='step' ? 'step '+(frame.rec.stepper.current().n+1):null;
    frame.rec.sectionEl.hidden=true;session.stack.push(next);breadcrumb(next);changed(true);
    var heading=next.rec.sectionEl.querySelector('.detail-breadcrumb button');if(heading)heading.focus();
  }
  function open(frame,id){
    var node=frame.section.diagram.nodes[id], detail=node && node.detail;
    if(!detail)return;
    cancel();
    var target=detailStepTarget(detail,frame.rec.stepper);
    try{
      var local=detailTarget(frame.page,detail);
      if(local){openLocal(frame,id,detail,frame.page,local.section,target);return;}
      if(detail.spec && typeof options.loadDetail==='function'){
        cancel();pause(frame);pending=new AbortController();var signal=pending.signal,request=++generation;
        notice(frame,'Loading detail diagram…');
        Promise.resolve().then(function(){return options.loadDetail({spec:detail.spec,revision:detail.revision,section:detail.section},signal);}).then(function(raw){
          if(disposed || signal.aborted || request!==generation)return;
          var child=normalize(raw),findings=validate(child);if(findings.errors.length)throw new Error(findings.errors.join('\n'));
          var section=detail.section?detailSection(child,detail.section):sectionRecords(child).find(function(r){return r.section.diagram;});
          if(!section || !section.section.diagram)throw new Error('The detail section is unavailable in this revision.');
          notice(frame,'');openLocal(frame,id,detail,child,section.section,target);
        }).catch(function(error){if(!disposed && !signal.aborted && request===generation)notice(frame,error.message || 'Unable to load detail diagram.');});
      }else if(detailURL(detail.url)){
        var a=document.createElement('a');a.href=detailURL(detail.url);a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open detail diagram ↗';
        frame.rec.sectionEl.appendChild(a);a.click();a.remove();
      }else notice(frame,'This detail requires an approved-spec loader from the host. Add a fallback URL to open it separately.');
    }catch(error){notice(frame,error.message);}
  }
  function gesture(event){
    var trigger=event.target.closest && event.target.closest('[data-dv-detail]');
    if(!trigger || !ctl.view.contains(trigger))return;
    if(event.type==='keydown' && event.key!=='Enter' && event.key!==' ')return;
    var frame=frames.get(trigger.closest('.doc-sec'));if(!frame)return;
    event.preventDefault();event.stopPropagation();open(frame,trigger.getAttribute('data-dv-detail'));
  }
  ctl.view.addEventListener('click',gesture,true);ctl.view.addEventListener('keydown',gesture,true);
  function snapshot(){
    if(restoreValue)return restoreValue;
    if(!session)return null;
    return {section:session.root.rec.reference,rootState:stepState(session.root),frames:session.stack.slice(1).map(function(f){return {node:f.via || null,expanded:[],state:stepState(f)};})};
  }
  async function restore(value){
    close(true);if(!value)return;
    if(!specObject(value) || !Array.isArray(value.frames) || value.frames.length>=DETAIL_MAX_DEPTH)return;
    var source=detailSection(page,value.section),root=source && liveRoots.get(source.reference);if(!root)return;
    restoreValue=Object.assign({},value,{section:root.rec.reference});
    var request=++generation;
    try{
      restoring=true;applyStep(root,value.rootState);restoring=false;
      for(var i=0;i<value.frames.length;i++){
        if(disposed || request!==generation)return;
        var saved=value.frames[i],frame=current() || root;
        if(!specObject(saved))break;
        if(saved.node){
          var node=frame.section.diagram.nodes[saved.node],detail=node && node.detail,target=detailTarget(frame.page,detail),childPage=frame.page;
          if(!target && detail && detail.spec && typeof options.loadDetail==='function'){
            pending=new AbortController();var signal=pending.signal;notice(frame,'Loading detail diagram…');
            var raw=await options.loadDetail({spec:detail.spec,revision:detail.revision,section:detail.section},signal);
            if(disposed || signal.aborted || request!==generation)return;
            childPage=normalize(raw);var findings=validate(childPage);if(findings.errors.length)throw new Error(findings.errors.join('\n'));
            target=detail.section?detailSection(childPage,detail.section):sectionRecords(childPage).find(function(r){return r.section.diagram;});notice(frame,'');pending=null;
          }
          if(!target || !target.section.diagram)throw new Error('The saved detail flow is unavailable in this revision.');
          restoring=true;
          // begin() closes an unrelated session; establish the root without
          // cancelling this in-flight restoration's generation.
          if(!session)session={root:root,stack:[root]};
          openLocal(frame,saved.node,detail,childPage,target.section,saved.state);
          restoring=false;
        }
        restoring=true;
        // Legacy expansion arrays are ignored; retain the containing flow and
        // continue restoring ordinary focused frames without rewriting source.
        if(current())applyStep(current(),saved.state);
        restoring=false;
      }
    }catch(error){if(!disposed && request===generation)notice(current() || root,error.message || 'Unable to restore the detail flow.');}
    finally{restoring=false;if(request===generation){restoreValue=null;if(ctl.onChange)ctl.onChange();}}
  }
  function cancelInteraction(){if(pending){cancel();changed(false);}}
  ctl.view.addEventListener('pointerdown',cancelInteraction,true);

  return {snapshot:snapshot,restore:restore,close:close,
    showSection:function(reference){close(true);liveRoots.forEach(function(f){restoreOriginal(f);});var frame=liveRoots.get(reference);if(frame){frame.rec.sectionEl.hidden=false;if(frame.rec.stepper)frame.rec.stepper.onShow();}},
    activeStepper:function(){return current() && current().rec.stepper;},
    pause:function(){if(session)session.stack.forEach(pause);},
    destroy:function(){disposed=true;close(true);ctl.view.removeEventListener('click',gesture,true);ctl.view.removeEventListener('keydown',gesture,true);ctl.view.removeEventListener('pointerdown',cancelInteraction,true);}
  };
}
