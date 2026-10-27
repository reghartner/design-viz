/* Runtime ticket evidence belongs to this page controller, never the spec.
   Navigation can replace SVGs and step controls independently; source indices
   and section identities keep the paint attached to the authored carriers. */
var LIVE_STATUS_STATES = ['todo','active','done','blocked','missing'];
var LIVE_STATUS_GLYPHS = {todo:'○',active:'◔',done:'✓',blocked:'!',missing:'?'};
function liveStatusRollup(states){
  states=(states || []).filter(function(state){return LIVE_STATUS_STATES.indexOf(state)>=0;});
  if(!states.length)return null;
  for(var i=0;i<3;i++){var state=['blocked','missing','active'][i];if(states.indexOf(state)>=0)return state;}
  if(states.every(function(state){return state==='done';}))return 'done';
  if(states.every(function(state){return state==='todo';}))return 'todo';
  return 'active';
}
function liveStatusTicketURL(tracking,key,entry){
  var site=deltaLinkUrl(tracking && tracking.jira && tracking.jira.site);
  return site?site.replace(/\/$/,'')+'/browse/'+key:deltaLinkUrl(entry && entry.url);
}
function liveStatusClass(el,state){
  LIVE_STATUS_STATES.forEach(function(value){
    var name='dv-live-'+value;
    if(value===state){if(!el.classList.contains(name))el.classList.add(name);}
    else if(el.classList.contains(name))el.classList.remove(name);
  });
}
function liveStatusCarrier(value,map){
  return liveStatusRollup(trackingRefs(value).tickets.map(function(key){return map[key] && map[key].state;}));
}
/* A carrier's own evidence stays independent of dependency evidence. Done
   carriers are traversed, but never marked; cycles visit each carrier once
   per blocker. Keys are node IDs or directed from->to edge keys. */
function liveStatusBlockingKeys(value,map){
  return trackingRefs(value).tickets.filter(function(key){return map[key] && ['blocked','missing'].indexOf(map[key].state)>=0;});
}
function liveStatusWaiting(diagram,states){
  var nodes=diagram.nodes || {},edges=diagram.edges || [],out=Object.create(null),carriers=Object.create(null),forward=Object.create(null);
  Object.keys(nodes).forEach(function(id){if(!isTextBoxNode(nodes[id])){carriers[id]=nodes[id];forward[id]=[];}});
  edges.forEach(function(edge){var key=edge.from+'->'+edge.to;carriers[key]=edge;forward[key]=[edge.to];if(forward[edge.from])forward[edge.from].push(key);});
  Object.keys(carriers).forEach(function(start){
    var state=liveStatusCarrier(carriers[start],states);if(state!=='blocked' && state!=='missing')return;
    var keys=liveStatusBlockingKeys(carriers[start],states),seen=Object.create(null),queue=(forward[start] || []).slice();seen[start]=true;
    while(queue.length){
      var key=queue.shift();if(seen[key])continue;seen[key]=true;
      if(!carriers[key])continue;
      var own=liveStatusCarrier(carriers[key],states);
      if(['done','blocked','missing'].indexOf(own)<0){
        var waiting=out[key] || (out[key]=[]);keys.forEach(function(ticket){if(waiting.indexOf(ticket)<0)waiting.push(ticket);});
      }
      queue=queue.concat(forward[key] || []);
    }
  });
  Object.keys(out).forEach(function(key){out[key].sort();});return out;
}
function liveStatusWaitingClass(el,keys){
  if(keys && keys.length){el.classList.add('dv-live-waiting');el.setAttribute('data-dv-live-waiting-on',keys.join(','));}
  else {el.classList.remove('dv-live-waiting');el.removeAttribute('data-dv-live-waiting-on');}
}
/* Reconstruct the engine's small communication-break input from each visible
   SVG. Live effects own separate classes/elements so the stepper can clear or
   settle its authored failures without erasing persistent ticket evidence. */
function liveStatusEdgeBreaks(scope,diagram,map,on){
  scope.querySelectorAll('.dv-live-comm-failure').forEach(function(el){el.remove();});
  scope.querySelectorAll('.dv-live-comm-hidden,.dv-live-packet-hidden,.dv-live-comm-suppressed').forEach(function(el){el.classList.remove('dv-live-comm-hidden','dv-live-packet-hidden','dv-live-comm-suppressed');});
  scope.querySelectorAll('svg').forEach(function(svg){
    var board={svg:svg,edgeIds:Object.create(null)},failures=Object.create(null),labels=Object.create(null);
    (diagram.edges || []).forEach(function(edge,index){
      var path=svg.querySelector('path.edge[data-dv-edge="'+index+'"]');if(!path)return;
      var state=on?liveStatusCarrier(edge,map):null,key=edge.from+'->'+edge.to;
      if(state==='blocked'){
        board.edgeIds[key]={e:edge,idx:index,pathEl:path,haloEl:svg.querySelector('path.halo[data-dv-edge="'+index+'"]')};
        failures[key]='blocked';labels[key]=liveStatusBlockingKeys(edge,map).join(', ');
        svg.querySelectorAll('g.comm-failure[data-dv-edge="'+index+'"]').forEach(function(el){el.classList.add('dv-live-comm-suppressed');});
      }
      if(state==='todo' || state==='blocked')svg.querySelectorAll('circle.pkt').forEach(function(dot){
        var mpath=dot.querySelector('mpath');if(mpath && mpath.getAttribute('href')==='#'+path.getAttribute('id'))dot.classList.add('dv-live-packet-hidden');
      });
    });
    showCommunicationFailures(board,failures,false,{live:true,labels:labels});
  });
}
function liveStatusStep(diagram,step,map){
  var states=[],nodes=stepNodes(step).slice(),keys=stepKeys(step).concat(Object.keys(stepFailures(step)));
  (diagram.edges || []).forEach(function(edge){
    if(keys.indexOf(edge.from+'->'+edge.to)<0)return;
    states.push(liveStatusCarrier(edge,map));nodes.push(edge.from,edge.to);
  });
  nodes.forEach(function(id){var node=(diagram.nodes || {})[id];if(node && !isTextBoxNode(node))states.push(liveStatusCarrier(node,map));});
  return liveStatusRollup(states);
}
function createLiveStatus(ctl,page,options,renderOptions){
  options=options || {};
  var view=ctl.view,records=sectionRecords(page),map=Object.create(null),on=true,retired=false,applied=false;
  var destroyListeners=[],listeners=[],controls=[],bindings=[],observer=null,frame=0,firstPaint=0,timer=0,pending=false,catchUp=false;
  var provider=typeof options.provider==='function'?options.provider:null,abort=provider?new AbortController():null;
  var refresh=Number(options.refreshMs),delay=isFinite(refresh)?Math.max(30000,refresh):30000;
  var noteText='',noteKind='info',actionLabel='',actionFn=null,pop=null,active=null,demoControls=null,demoDestroy=null,cacheUpdatedAt=null;
  var remotePages=Object.create(null),originalLoad=renderOptions && renderOptions.loadDetail,wrappedLoad=null;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function remoteKey(ref){return JSON.stringify([ref.spec,ref.revision || '']);}
  /* Loaded approved details join the same runtime map; they have their own
     page tracking site. The host still owns transport and cancellation. */
  if(typeof originalLoad==='function'){
    wrappedLoad=function(ref,signal){return Promise.resolve(originalLoad(ref,signal)).then(function(raw){
      if(!retired && !signal.aborted){remotePages[remoteKey(ref)]=normalize(raw);schedule();}
      return raw;
    });};
    renderOptions.loadDetail=wrappedLoad;
  }
  function refs(){
    var out={tickets:[],prs:[]};
    function collect(source){sectionRecords(source).forEach(function(record){
      var d=record.section.diagram || {};
      Object.keys(d.nodes || {}).map(function(id){return d.nodes[id];}).concat(d.edges || []).forEach(function(value){
        var found=trackingRefs(value);['tickets','prs'].forEach(function(field){found[field].forEach(function(ref){if(out[field].indexOf(ref)<0)out[field].push(ref);});});
      });
    });}
    collect(page);Object.keys(remotePages).forEach(function(key){collect(remotePages[key]);});return out;
  }
  function snapshot(){
    var counts={todo:0,active:0,done:0,blocked:0,missing:0},latest=null,stamp=-Infinity;
    refs().tickets.forEach(function(key){var entry=map[key];if(!entry)return;counts[entry.state]++;
      var at=Date.parse(entry.updatedAt);if(isFinite(at) && at>stamp){stamp=at;latest=entry.updatedAt;}
    });
    return {states:copy(map),counts:counts,updatedAt:cacheUpdatedAt || latest};
  }
  function notify(){refreshControls();listeners.slice().forEach(function(fn){fn(snapshot());});}
  function element(tag,cls,text,parent){var el=document.createElement(tag);el.className=cls;if(text!=null)el.textContent=String(text);if(parent)parent.appendChild(el);return el;}
  function link(parent,label,url){var el=element(url?'a':'span','nbacklink',label,parent);if(url){el.setAttribute('href',url);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}return el;}
  function close(focus){
    if(!active)return;
    var trigger=active;active=null;
    document.removeEventListener('click',outside,true);document.removeEventListener('keydown',escape,true);
    if(trigger)trigger.setAttribute('aria-expanded','false');
    if(pop){if(pop.hidePopover && pop.matches(':popover-open'))pop.hidePopover();pop.hidden=true;}
    if(focus && trigger && trigger.isConnected)trigger.focus();
  }
  function outside(ev){if(active && !active.contains(ev.target) && !pop.contains(ev.target))close(true);}
  function escape(ev){if(ev.key==='Escape' && active){ev.preventDefault();ev.stopPropagation();close(true);}}
  function show(trigger,value,tracking,label,waiting){
    if(retired)return;
    if(active===trigger){close(true);return;}close(false);
    if(!pop){pop=element('div','nbackpop dv-live-popover',null,view);pop.setAttribute('role','dialog');pop.setAttribute('popover','manual');pop.hidden=true;}
    pop.replaceChildren();pop.setAttribute('aria-label','Live tickets for '+label);
    element('strong','node-link-title','Live tickets · '+label,pop);
    var dismiss=element('button','node-link-close','×',pop);dismiss.type='button';dismiss.setAttribute('aria-label','Close live tickets');dismiss.addEventListener('click',function(){close(true);});
    if(waiting && waiting.length)element('div','dv-live-waiting-detail','waiting on '+waiting.join(', '),pop);
    var found=trackingRefs(value);
    found.tickets.forEach(function(key){
      var entry=map[key],row=element('div','dv-live-ticket',null,pop);
      link(row,key,liveStatusTicketURL(tracking,key,entry));
      element('span','dv-live-ticket-state',entry?entry.state:'No status',row);
      if(entry){
        if(entry.title)element('span','dv-live-ticket-title',entry.title,row);
        if(entry.assignee)element('span','dv-live-ticket-assignee',entry.assignee,row);
        if(entry.prs)element('span','dv-live-ticket-prs','PRs: '+entry.prs.count+' '+entry.prs.state,row);
        if(entry.detail)element('span','dv-live-ticket-detail',entry.detail,row);
      }
    });
    found.prs.forEach(function(url){link(pop,url,url);});
    active=trigger;trigger.setAttribute('aria-expanded','true');pop.hidden=false;if(pop.showPopover)pop.showPopover();
    var rect=trigger.getBoundingClientRect();
    pop.style.left=Math.max(8,Math.min(window.innerWidth-pop.offsetWidth-8,rect.left))+'px';
    pop.style.top=Math.max(8,Math.min(window.innerHeight-pop.offsetHeight-8,rect.bottom+6))+'px';
    dismiss.focus({preventScroll:true});document.addEventListener('click',outside,true);document.addEventListener('keydown',escape,true);
  }
  function badge(parent,value,state,tracking,label,x,y,edgeIndex,waiting){
    var badge=document.createElementNS(SVGNS,'g');badge.setAttribute('class','dv-live-badge');
    liveStatusClass(badge,state);liveStatusWaitingClass(badge,waiting);badge.setAttribute('transform','translate('+x+' '+y+')');
    badge.setAttribute('role','button');badge.setAttribute('tabindex','0');badge.setAttribute('aria-label','Live tickets for '+label+(waiting?' · waiting on '+waiting.join(', '):''));badge.setAttribute('aria-haspopup','dialog');badge.setAttribute('aria-expanded','false');
    if(edgeIndex!=null)badge.setAttribute('data-live-edge',String(edgeIndex));
    var circle=document.createElementNS(SVGNS,'circle');circle.setAttribute('r','9');badge.appendChild(circle);
    var text=document.createElementNS(SVGNS,'text');text.setAttribute('text-anchor','middle');text.setAttribute('y','4');text.textContent=waiting?'…':LIVE_STATUS_GLYPHS[state];badge.appendChild(text);
    if(waiting){var tag=document.createElementNS(SVGNS,'text');tag.setAttribute('class','dv-live-waiting-tag');tag.setAttribute('text-anchor','end');tag.setAttribute('y','-16');tag.textContent='waiting on '+waiting.join(', ');badge.appendChild(tag);}
    badge.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
    badge.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();show(badge,value,tracking,label,waiting);});
    badge.addEventListener('keydown',function(ev){if(ev.key==='Enter' || ev.key===' '){ev.preventDefault();ev.stopPropagation();show(badge,value,tracking,label,waiting);}});
    markFragmentElement(badge,value);parent.appendChild(badge);return badge;
  }
  function sourceBindings(){
    var found=[];
    ctl.sections.forEach(function(rec){var record=records.find(function(r){return r.reference===rec.reference;});if(record)found.push({el:rec.sectionEl,section:record.section,page:page});});
    var saved=ctl.details && ctl.details.snapshot(),activeSections=ctl.details && ctl.details.activeSections();
    if(saved && activeSections){
      var currentPage=page,record=detailSection(page,saved.section),section=record && record.section;
      saved.frames.forEach(function(savedFrame,index){
        var node=section && section.diagram && section.diagram.nodes[savedFrame.node],detail=node && node.detail;
        if(!detail){section=null;return;}
        if(detail.spec)currentPage=remotePages[remoteKey(detail)];
        var target=currentPage && (detail.section?detailSection(currentPage,detail.section):sectionRecords(currentPage).find(function(r){return r.section.diagram;}));
        section=target && target.section;
        var rec=activeSections[index+1];if(section && rec)found.push({el:rec.sectionEl,section:section,page:currentPage});
      });
    }
    return found;
  }
  function paintBinding(binding){
    var scope=binding.el,d=binding.section.diagram;if(!d)return;
    var waiting=on?liveStatusWaiting(d,map):{};
    scope.querySelectorAll('g.node[data-dv-node]').forEach(function(el){
      var id=el.getAttribute('data-dv-node'),value=(d.nodes || {})[id],state=on && !el.classList.contains('node-text')?liveStatusCarrier(value,map):null;
      var dependencies=waiting[id];liveStatusClass(el,state);liveStatusWaitingClass(el,dependencies);
      if(!state && !dependencies)return;
      var card=el.querySelector('.card');if(!card)return;
      var halo=card.cloneNode(false);halo.setAttribute('class','dv-live-halo');halo.removeAttribute('id');halo.setAttribute('aria-hidden','true');el.insertBefore(halo,el.firstChild);
      badge(el,value,state,binding.page.tracking,value.title || id,Number(card.getAttribute('width') || card.getAttribute('data-node-width'))-12,10,null,dependencies);
    });
    scope.querySelectorAll('path.edge[data-dv-edge],path.halo[data-dv-edge],text.lbl[data-dv-edge]').forEach(function(el){
      var index=Number(el.getAttribute('data-dv-edge')),value=(d.edges || [])[index],state=on?liveStatusCarrier(value,map):null;
      var dependencies=value && waiting[value.from+'->'+value.to];liveStatusClass(el,state);liveStatusWaitingClass(el,dependencies);
      if((!state && !dependencies) || !el.classList.contains('edge'))return;
      var svg=el.closest('svg'),label=scope.querySelector('text.lbl[data-dv-edge="'+index+'"]'),x,y;
      if(label){var box=null;try{box=label.getBBox();}catch(ex){}x=box && box.width?box.x+box.width+12:Number(label.getAttribute('x'))+12;y=Number(label.getAttribute('y'))-4;}
      else {var point=el.getPointAtLength(el.getTotalLength()/2);x=point.x;y=point.y-14;}
      var marker=badge(svg,value,state,binding.page.tracking,value.label || value.from+' → '+value.to,x,y,index,dependencies);
      if(el.getAttribute('data-dv-hidden')==='true')marker.setAttribute('data-dv-hidden','true');
      if(el.classList.contains('dv-fragment-hidden'))marker.classList.add('dv-fragment-hidden');
    });
    liveStatusEdgeBreaks(scope,d,map,on);
    scope.querySelectorAll('g.coin[data-dv-step],button.schip[data-step-source]').forEach(function(el){
      var index=Number(el.getAttribute(el.classList.contains('coin')?'data-dv-step':'data-step-source')),step=(d.steps || [])[index];
      liveStatusClass(el,on && step?liveStatusStep(d,step,map):null);
    });
  }
  function syncBindings(){
    var next=sourceBindings();
    bindings.forEach(function(binding){binding.el.removeEventListener('dv:pathrender',schedule);binding.el.removeEventListener('dv:pathchange',schedule);});
    bindings=next;bindings.forEach(function(binding){binding.el.addEventListener('dv:pathrender',schedule);binding.el.addEventListener('dv:pathchange',schedule);});
    if(observer)observer.disconnect();
    if(applied && typeof MutationObserver!=='undefined'){
      if(!observer)observer=new MutationObserver(schedule);
      bindings.forEach(function(binding){binding.el.querySelectorAll('.schips').forEach(function(el){observer.observe(el,{childList:true,subtree:true});});});
    }
  }
  function paint(){
    if(retired)return;
    close(false);syncBindings();
    if(applied){
      view.querySelectorAll('.dv-live-badge,.dv-live-halo').forEach(function(el){el.remove();});
      bindings.forEach(paintBinding);
    }
    refreshControls();
  }
  function schedule(){if(retired || frame)return;frame=requestAnimationFrame(function(){frame=0;paint();});}
  function relative(at){var seconds=Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000));return seconds<60?'just now':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';}
  function buildControl(control){
    var root=element('div','dv-live-control',null,control.host),toggle=element('button','reader-button dv-live-toggle','Live',root),counts={};toggle.type='button';
    LIVE_STATUS_STATES.forEach(function(state){counts[state]=element('span','dv-live-count',null,toggle);counts[state].setAttribute('data-live-count',state);});
    var note=element('span','dv-live-note',null,root),action=element('button','reader-button dv-live-action',null,root);action.type='button';note.setAttribute('role','status');
    toggle.addEventListener('click',function(){api.setEnabled(!on);});action.addEventListener('click',function(){if(!retired && controls.indexOf(control)>=0 && actionFn)actionFn();});
    control.root=root;control.toggle=toggle;control.counts=counts;control.note=note;control.action=action;
  }
  function refreshDemoControl(control){
    if(!demoControls){if(control.demo){control.demo.remove();control.demo=null;}return;}
    if(!control.demo){
      control.demo=element('span','dv-live-demo',null,control.root);
      control.demoPlay=element('button','reader-button',null,control.demo);control.demoPlay.type='button';
      control.demoNext=element('button','reader-button','Next day',control.demo);control.demoNext.type='button';
      control.demoPlay.addEventListener('click',function(){if(!retired && demoControls)demoControls.toggle();});
      control.demoNext.addEventListener('click',function(){if(!retired && demoControls)demoControls.next();});
    }
    control.demoPlay.textContent=demoControls.playing?'Pause':'Play';control.demoPlay.disabled=demoControls.manual || demoControls.ended;
    control.demoNext.disabled=demoControls.ended;
  }
  function refreshControls(){
    var value=snapshot(),available=refs().tickets.length>0;
    controls.forEach(function(control){
      if(!control.root){if(!available)return;buildControl(control);}
      control.root.hidden=!available || !(provider || applied || noteText || actionFn);
      control.toggle.setAttribute('aria-pressed',String(on));
      LIVE_STATUS_STATES.forEach(function(state){control.counts[state].textContent=state+' '+value.counts[state];control.counts[state].hidden=!value.counts[state];});
      if(value.updatedAt){if(!control.time)control.time=element('time','dv-live-updated',null,control.root);control.time.setAttribute('datetime',value.updatedAt);control.time.textContent='updated '+relative(value.updatedAt);}
      else if(control.time){control.time.remove();control.time=null;}
      control.note.textContent=noteText;control.note.hidden=!noteText;control.note.setAttribute('data-kind',noteKind);
      control.action.textContent=actionLabel;control.action.hidden=!actionFn;refreshDemoControl(control);
    });
  }
  function visible(){return !document.hidden;}
  function stopTimer(){if(timer){clearTimeout(timer);timer=0;}}
  function arm(){stopTimer();if(provider && !retired && visible())timer=setTimeout(function(){timer=0;fetchMap();},delay);}
  function fetchMap(){
    if(retired || !provider || !visible())return;
    if(pending){catchUp=true;return;}pending=true;stopTimer();
    Promise.resolve().then(function(){if(!retired)return provider(refs(),abort.signal);}).then(function(value){
      if(!retired){api.apply(value);if(noteKind==='error')api.note('','info');}
    },function(error){if(!retired)api.note(error && error.message || String(error),'error');}).then(function(){
      pending=false;if(retired)return;
      if(catchUp && visible()){catchUp=false;fetchMap();}else arm();
    });
  }
  function visibility(){stopTimer();if(visible())fetchMap();}
  var events=['diagram-tab-change','tab-view-change','diagram-view-change','navigation-mounted','detail-navigation'];
  var api={
    refs:refs,
    state:function(ref){return map[ref]?copy(map[ref]):null;},
    apply:function(value){
      if(retired)return;var next=Object.create(null);
      Object.keys(value || {}).forEach(function(key){
        var entry=value[key];if(!trackingKeyPattern.test(key) || !entry || LIVE_STATUS_STATES.indexOf(entry.state)<0)return;
        var item={state:entry.state};['title','assignee','detail','updatedAt'].forEach(function(field){if(typeof entry[field]==='string')item[field]=entry[field];});
        var url=deltaLinkUrl(entry.url);if(url)item.url=url;
        if(entry.prs && typeof entry.prs.count==='number' && isFinite(entry.prs.count) && entry.prs.count>=0 && ['open','merged'].indexOf(entry.prs.state)>=0)item.prs={count:entry.prs.count,state:entry.prs.state};
        next[key]=item;
      });
      // Cache age describes the lookup, independently of issue modification
      // times. Preserve it before filtering the map down to ticket entries.
      var storedAt=value && value.storedAt;
      cacheUpdatedAt=typeof storedAt==='number' && isFinite(new Date(storedAt).getTime())?new Date(storedAt).toISOString():null;
      map=next;applied=true;paint();notify();
    },
    clear:function(){if(retired)return;map=Object.create(null);cacheUpdatedAt=null;applied=true;paint();notify();},
    enabled:function(){return on;},
    setEnabled:function(value){if(retired)return;on=!!value;paint();notify();},
    onDestroy:function(fn){if(typeof fn!=='function')return function(){};if(retired){fn();return function(){};}destroyListeners.push(fn);return function(){var i=destroyListeners.indexOf(fn);if(i>=0)destroyListeners.splice(i,1);};},
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    note:function(text,kind){if(retired)return;noteText=typeof text==='string'?text:'';noteKind=['info','warn','error'].indexOf(kind)>=0?kind:'info';refreshControls();},
    action:function(label,fn){if(retired)return;actionLabel=typeof label==='string'?label:'';actionFn=actionLabel && typeof fn==='function'?fn:null;refreshControls();},
    setDemoControls:function(value){if(retired)return;demoControls=value;refreshControls();},
    mountControls:function(host){
      if(retired)return null;
      // Approved external details can introduce the page's first ticket later.
      // Retain only the host until then, with no placeholder DOM on empty pages.
      var control={host:host,root:null,time:null};controls.push(control);refreshControls();
      return {destroy:function(){var i=controls.indexOf(control);if(i>=0)controls.splice(i,1);if(control.root)control.root.remove();}};
    },
    destroy:function(){
      if(retired)return;retired=true;destroyListeners.splice(0).forEach(function(fn){try{fn();}catch(ex){}});close(false);stopTimer();if(abort)abort.abort();if(demoDestroy)demoDestroy();
      if(frame)cancelAnimationFrame(frame);if(firstPaint)cancelAnimationFrame(firstPaint);frame=firstPaint=0;
      if(observer)observer.disconnect();
      bindings.forEach(function(binding){binding.el.removeEventListener('dv:pathrender',schedule);binding.el.removeEventListener('dv:pathchange',schedule);});bindings.forEach(function(binding){if(binding.section.diagram)liveStatusEdgeBreaks(binding.el,binding.section.diagram,{},false);});bindings=[];
      events.forEach(function(type){view.removeEventListener(type,schedule);});if(provider)document.removeEventListener('visibilitychange',visibility);
      if(pop)pop.remove();controls.forEach(function(control){if(control.root)control.root.remove();});controls=[];listeners=[];
      if(applied){
        view.querySelectorAll('.dv-live-badge,.dv-live-halo').forEach(function(el){el.remove();});
        view.querySelectorAll('.dv-live-todo,.dv-live-active,.dv-live-done,.dv-live-blocked,.dv-live-missing,.dv-live-waiting').forEach(function(el){liveStatusClass(el,null);liveStatusWaitingClass(el,null);});
      }
      if(renderOptions && renderOptions.loadDetail===wrappedLoad)renderOptions.loadDetail=originalLoad;
    }
  };
  syncBindings();events.forEach(function(type){view.addEventListener(type,schedule);});
  if(provider){document.addEventListener('visibilitychange',visibility);firstPaint=requestAnimationFrame(function(){firstPaint=requestAnimationFrame(function(){firstPaint=0;fetchMap();});});}
  if(options.demo && typeof options.demo.mount==='function')demoDestroy=options.demo.mount(api);
  return api;
}
