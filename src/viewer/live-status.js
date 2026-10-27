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
    var keys=liveStatusBlockingKeys(carriers[start],states),seen=Object.create(null),queue=[],cursor=0;seen[start]=true;
    function enqueue(key){if(!seen[key]){seen[key]=true;queue.push(key);}}
    (forward[start] || []).forEach(enqueue);
    while(cursor<queue.length){
      var key=queue[cursor++];
      if(!carriers[key])continue;
      var own=liveStatusCarrier(carriers[key],states);
      if(['done','blocked','missing'].indexOf(own)<0){
        var waiting=out[key] || (out[key]=[]);keys.forEach(function(ticket){if(waiting.indexOf(ticket)<0)waiting.push(ticket);});
      }
      (forward[key] || []).forEach(enqueue);
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
/* Carrier identities are section-local; ticket keys are deduplicated only when
   counting work. Failed hops involve both endpoints, just like step rollups. */
function liveStatusStepCarriers(diagram,step){
  var out=[],nodes=stepNodes(step).slice(),keys=stepKeys(step).concat(Object.keys(stepFailures(step)));
  (diagram.edges || []).forEach(function(edge){
    var key=edge.from+'->'+edge.to;if(keys.indexOf(key)<0)return;
    out.push({id:key,value:edge});nodes.push(edge.from,edge.to);
  });
  nodes.filter(function(id,i){return nodes.indexOf(id)===i;}).forEach(function(id){
    var node=(diagram.nodes || {})[id];if(node && !isTextBoxNode(node))out.push({id:id,value:node});
  });return out;
}
function liveStatusStepTickets(diagram,step){
  var keys=[];liveStatusStepCarriers(diagram,step).forEach(function(carrier){
    trackingRefs(carrier.value).tickets.forEach(function(key){if(keys.indexOf(key)<0)keys.push(key);});
  });return keys;
}
function liveStatusLanes(page,map){
  var out=Object.create(null);Object.keys(page.lanes || {}).forEach(function(id){out[id]={total:0,done:0,state:null,keys:[]};});
  sectionRecords(page).forEach(function(record){var d=record.section.diagram || {};
    (d.steps || []).forEach(function(step){var lane=out[step.lane];if(!lane)return;
      liveStatusStepTickets(d,step).forEach(function(key){if(lane.keys.indexOf(key)<0)lane.keys.push(key);});
    });
  });
  Object.keys(out).forEach(function(id){var lane=out[id];lane.total=lane.keys.length;
    lane.done=lane.keys.filter(function(key){return map[key] && map[key].state==='done';}).length;
    lane.state=liveStatusRollup(lane.keys.map(function(key){return map[key] && map[key].state;}));
  });return out;
}
function liveStatusCaption(diagram,step,map){
  var keys=liveStatusStepTickets(diagram,step).filter(function(key){return map[key];}),state=liveStatusStep(diagram,step,map);
  if(!state)return '';
  if(state==='done')return 'DONE';
  if(state==='blocked' || state==='missing'){
    var blockers=keys.filter(function(key){return map[key].state===state;}),detail=state==='blocked' && map[blockers[0]].detail;
    if(state==='blocked' && (!detail || detail.indexOf('waiting on')<0)){
      var waiting=liveStatusWaiting(diagram,map),dependencies=[];
      liveStatusStepCarriers(diagram,step).forEach(function(carrier){(waiting[carrier.id] || []).forEach(function(key){if(dependencies.indexOf(key)<0)dependencies.push(key);});});
      if(dependencies.length)detail='waiting on '+dependencies.join(', ');
    }
    return state.toUpperCase()+' · '+blockers.join(', ')+(detail?' · '+detail:'');
  }
  return (state==='active'?'IN PROGRESS':'TODO')+' · '+keys.length+' tickets';
}
function liveStatusStale(entry,now,staleDays){
  var days=typeof staleDays==='number' && isFinite(staleDays) && staleDays>0?staleDays:7;
  var at=entry && Date.parse(entry.updatedAt);
  return !!(entry && entry.state==='active' && isFinite(at) && now-at>days*86400000);
}
function liveStatusReadiness(page,map){
  var result={total:0,done:0,ready:true,blockers:0,waiting:0},primaryCount=0,blockers=[];
  sectionRecords(page).forEach(function(record){var d=record.section.diagram;if(!d)return;
    var carriers=Object.keys(d.nodes || {}).filter(function(id){return !isTextBoxNode(d.nodes[id]);}).map(function(id){return d.nodes[id];}).concat(d.edges || []);
    function complete(value){return trackingRefs(value).tickets.every(function(key){return map[key] && map[key].state==='done';});}
    carriers.forEach(function(value){var keys=trackingRefs(value).tickets;if(!keys.length)return;result.total++;if(complete(value))result.done++;
      liveStatusBlockingKeys(value,map).forEach(function(key){if(blockers.indexOf(key)<0)blockers.push(key);});
    });
    result.waiting+=Object.keys(liveStatusWaiting(d,map)).length;
    var primary=diagramPathList(d)[0];
    (primary?primary.indices:[]).forEach(function(index){liveStatusStepCarriers(d,d.steps[index]).forEach(function(carrier){
      if(!trackingRefs(carrier.value).tickets.length)return;primaryCount++;if(!complete(carrier.value))result.ready=false;
    });});
  });result.ready=result.ready && primaryCount>0;result.blockers=blockers.length;return result;
}
/* Coverage counts keys, independently of paint, readiness and lane rollups. */
function liveStatusCoverage(page,map,refs){
  var epics=refs && refs.epics || trackingEpics(page),keys=refs && refs.tickets || [];
  return {epics:epics.slice(),onDiagram:keys.slice(),
    notOnDiagram:Object.keys(map || {}).filter(function(key){return keys.indexOf(key)<0 && map[key] && epics.indexOf(map[key].epic)>=0;}),
    notInEpic:epics.length?keys.filter(function(key){return !map[key] || epics.indexOf(map[key].epic)<0;}):[]};
}
/* Panels can mount before renderPage finishes constructing its controller. The
   pending bridge is released by the same panel cleanup as ordinary listeners. */
var liveStatusControllers = new WeakMap(), liveStatusPending = [];
function liveStatusControllerFor(element){
  for(var node=element;node;node=node.parentNode || node.host){
    var controller=liveStatusControllers.get(node);if(controller)return controller;
  }
  return null;
}
function liveStatusWhenReady(host,connect){
  var pending={host:host,connect:connect};liveStatusPending.push(pending);
  return function(){var i=liveStatusPending.indexOf(pending);if(i>=0)liveStatusPending.splice(i,1);};
}
function createLiveStatus(ctl,page,options,renderOptions){
  options=options || {};page=page || {};
  var view=ctl.view,records=sectionRecords(page),map=Object.create(null),on=true,retired=false,applied=false;
  var destroyListeners=[],listeners=[],bindings=[],observer=null,frame=0,firstPaint=0,timer=0,pending=false,catchUp=false,painting=false;
  var provider=typeof options.provider==='function'?options.provider:null,abort=provider?new AbortController():null;
  var refresh=Number(options.refreshMs),delay=isFinite(refresh)?Math.max(30000,refresh):30000;
  var noteText='',noteKind='info',actionLabel='',actionFn=null,pop=null,active=null,demoControls=null,demoDestroy=null,cacheUpdatedAt=null;
  var activity=[],seenKeys=Object.create(null),changedKeys=[],stepHooks=[],coverageRequest=0;
  // Connector evidence for the panel header (#769): who supplies the map, whether a fetch is in flight, when it last answered.
  var LIVE_STATUS_CONNECTIONS=['none','disconnected','approval','connecting','connected','error','demo'];
  var demoMode=!!(options.demo && typeof options.demo.mount==='function');
  var connection={state:provider?(demoMode?'demo':'connecting'):'none',busy:false,checkedAt:null,source:demoMode?'Demo':provider?'Host':''};
  function setStatus(value){
    if(retired || !value || typeof value!=='object')return;
    if(typeof value.state==='string' && LIVE_STATUS_CONNECTIONS.indexOf(value.state)>=0)connection.state=value.state;
    if(typeof value.busy==='boolean')connection.busy=value.busy;
    if(typeof value.source==='string' && value.source)connection.source=value.source;
    if(value.checkedAt!=null){var at=typeof value.checkedAt==='number'?value.checkedAt:Date.parse(value.checkedAt);if(isFinite(at))connection.checkedAt=new Date(at).toISOString();}
    notify();
  }
  function reducedMotion(){return typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');}
  var motion=reducedMotion();
  function motionChanged(){if(motion.matches)view.querySelectorAll('.dv-live-changed').forEach(function(el){el.classList.remove('dv-live-changed');});}
  if(motion && motion.addEventListener)motion.addEventListener('change',motionChanged);
  var remotePages=Object.create(null),originalLoad=renderOptions && renderOptions.loadDetail,wrappedLoad=null;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function remoteKey(ref){return JSON.stringify([ref.spec,ref.revision || '']);}
  /* Loaded approved details join the same runtime map; they have their own
     page tracking site. The host still owns transport and cancellation. */
  if(typeof originalLoad==='function'){
    wrappedLoad=function(ref,signal){return Promise.resolve(originalLoad(ref,signal)).then(function(raw){
      if(!retired && !signal.aborted){
        var previous=JSON.stringify(refs());remotePages[remoteKey(ref)]=normalize(raw);schedule();
        if(JSON.stringify(refs())!==previous)notify();
      }
      return raw;
    });};
    renderOptions.loadDetail=wrappedLoad;
  }
  function refs(){
    var out={tickets:[],prs:[],epics:[]};
    function collect(source){trackingEpics(source).forEach(function(key){if(out.epics.indexOf(key)<0)out.epics.push(key);});sectionRecords(source).forEach(function(record){
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
    var pages=laneRecords(),coverage=liveStatusCoverage(page,map,refs()),readiness=liveStatusReadiness(page,map);
    var epicKeys=Object.keys(map).filter(function(key){return coverage.epics.indexOf(map[key].epic)>=0;});
    var verdict=readiness.ready?'Ready to demo':readiness.blockers+' blockers · '+readiness.waiting+' waiting';
    // Only count epic stories when the map actually carries epic membership; "0 of 0" says nothing.
    if(coverage.epics.length && epicKeys.length)verdict+=' · '+epicKeys.filter(function(key){return coverage.onDiagram.indexOf(key)>=0;}).length+' of '+epicKeys.length+' epic stories on diagram';
    return {states:copy(map),counts:counts,updatedAt:cacheUpdatedAt || latest,enabled:on,
      available:!!(refs().tickets.length || refs().epics.length),hasData:!!(provider || applied),
      note:{text:noteText,kind:noteKind},actionLabel:actionFn?actionLabel:'',firstBlocker:!!firstBlocker(),
      lanes:panelLanes(pages),blockers:panelBlockers(pages),tickets:ticketRows(pages,coverage),
      coverage:coverage,readiness:readiness,activity:copy(activity).map(function(item){item.relative=item.at?relative(item.at):'time unavailable';return item;}),
      demo:demoControls?{playing:!!demoControls.playing,manual:!!demoControls.manual,ended:!!demoControls.ended}:null,verdict:verdict,
      updatedText:cacheUpdatedAt || latest?'updated '+relative(cacheUpdatedAt || latest):'',
      connection:{state:connection.state,busy:connection.busy,checkedAt:connection.checkedAt,source:connection.source,checkedText:connection.checkedAt?'refreshed '+relative(connection.checkedAt):''}};
  }
  function connectPanels(){liveStatusPending.slice().forEach(function(pending){if(liveStatusControllerFor(pending.host)===api)pending.connect(api);});}
  function notify(){connectPanels();var value=snapshot();listeners.slice().forEach(function(fn){fn(value);});}
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
        if(liveStatusStale(entry,Date.now(),tracking && tracking.staleDays))element('span','dv-live-stale-detail','no activity '+Math.floor((Date.now()-Date.parse(entry.updatedAt))/86400000)+' d',row);
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
    liveStatusClass(badge,state);liveStatusWaitingClass(badge,waiting);
    badge.setAttribute('data-live-tickets',trackingRefs(value).tickets.join(','));
    if(trackingRefs(value).tickets.some(function(key){return liveStatusStale(map[key],Date.now(),tracking && tracking.staleDays);}))badge.classList.add('dv-live-stale');badge.setAttribute('transform','translate('+x+' '+y+')');
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
    ctl.sections.forEach(function(rec){var record=records.find(function(r){return r.reference===rec.reference;});if(record)found.push({el:rec.sectionEl,section:record.section,page:page,stepper:rec.stepper});});
    var saved=ctl.details && ctl.details.snapshot(),activeSections=ctl.details && ctl.details.activeSections();
    if(saved && activeSections){
      var currentPage=page,record=detailSection(page,saved.section),section=record && record.section;
      saved.frames.forEach(function(savedFrame,index){
        var node=section && section.diagram && section.diagram.nodes[savedFrame.node],detail=node && node.detail;
        if(!detail){section=null;return;}
        if(detail.spec)currentPage=remotePages[remoteKey(detail)];
        var target=currentPage && (detail.section?detailSection(currentPage,detail.section):sectionRecords(currentPage).find(function(r){return r.section.diagram;}));
        section=target && target.section;
        var rec=activeSections[index+1];if(section && rec)found.push({el:rec.sectionEl,section:section,page:currentPage,stepper:rec.stepper});
      });
    }
    return found;
  }
  function decorateCarrier(el,value,tracking){
    var keys=trackingRefs(value).tickets,media=reducedMotion();
    el.classList.toggle('dv-live-stale',on && keys.some(function(key){return liveStatusStale(map[key],Date.now(),tracking && tracking.staleDays);}));
    if(!on || !keys.some(function(key){return map[key];}) || (media && media.matches)){el.classList.remove('dv-live-changed');return;}
    if(!el.classList.contains('node') && !el.classList.contains('edge'))return;
    if(!keys.some(function(key){return changedKeys.indexOf(key)>=0;}))return;
    el.classList.remove('dv-live-changed');
    // Restart only for new evidence; navigation and identical maps never pulse.
    if(el.getBoundingClientRect)el.getBoundingClientRect();
    el.classList.add('dv-live-changed');
    if(!el._livePulseEnd){el._livePulseEnd=function(ev){if(!ev.animationName || ev.animationName==='dvnodepulse'){el.classList.remove('dv-live-changed');}};el.addEventListener('animationend',el._livePulseEnd);}
  }
  function paintStory(binding){
    var stepper=binding.stepper,d=binding.section.diagram;
    binding.el.querySelectorAll('.dv-live-caption').forEach(function(el){el.remove();});
    if(!on || !stepper || stepper.mode()!=='step')return;
    var step=d.steps[stepper.sourceIndex()],text=step && liveStatusCaption(d,step,map),host=binding.el.querySelector('.termbar .step-text');
    if(text && host)element('span','dv-live-caption',text,host);
  }
  function laneLabel(id,source){return ((source.lanes || {})[id] || {}).label || id;}
  function laneRecords(){
    return [page].concat(Object.keys(remotePages).map(function(key){return remotePages[key];})).map(function(source){
      return {page:source,lanes:liveStatusLanes(source,map)};
    });
  }
  function decorateLane(el,id,lanes,source){
    var lane=lanes[id];if(!lane)return;
    var enabled=on && applied && refs().tickets.length>0;
    el.textContent=laneLabel(id,source)+(enabled?' · '+lane.done+'/'+lane.total+' done':'');
    liveStatusClass(el,enabled?lane.state:null);
    if(enabled){el.setAttribute('title',lane.keys.map(function(key){return key+' · '+(map[key]?map[key].state:'No status');}).join('\n'));el.setAttribute('tabindex','0');}
    else {el.removeAttribute('title');el.removeAttribute('tabindex');}
  }
  function paintLanes(){
    if(!applied || !refs().tickets.length)return;
    var pages=laneRecords();
    bindings.forEach(function(binding){var stepper=binding.stepper;if(!stepper)return;
      var lanes=pages.find(function(record){return record.page===binding.page;}).lanes;
      var step=(binding.section.diagram.steps || [])[stepper.sourceIndex()];
      binding.el.querySelectorAll('.lanepill').forEach(function(el){
        if(!step || !step.lane){liveStatusClass(el,null);el.removeAttribute('title');el.removeAttribute('tabindex');return;}
        decorateLane(el,step.lane,lanes,binding.page);
      });
    });
  }
  function firstBlocker(){
    if(!on)return null;
    var activeStepper=ctl.activeStepper && ctl.activeStepper(),candidates=bindings.filter(function(binding){return binding.stepper && (!activeStepper || binding.stepper===activeStepper);});
    for(var b=0;b<candidates.length;b++){
      var binding=candidates[b],stepper=binding.stepper,d=binding.section.diagram;
      var path=diagramPathList(d).find(function(path){return path.id===stepper.path();});
      var index=path && path.indices.find(function(index){return ['blocked','missing'].indexOf(liveStatusStep(d,d.steps[index],map))>=0;});
      if(index!=null)return {binding:binding,index:index};
    }return null;
  }
  function focusBlocker(binding,index){
    var d=binding.section.diagram,carriers=liveStatusStepCarriers(d,d.steps[index]);
    var carrier=carriers.find(function(carrier){return liveStatusBlockingKeys(carrier.value,map).length;});if(!carrier)return;
    focusCarrier(binding,carrier.id);
  }
  function focusCarrier(binding,id){
    var badge=Array.from(binding.el.querySelectorAll('.dv-live-badge')).find(function(el){return el.getAttribute('data-live-carrier')===id;});
    if(badge)badge.focus({preventScroll:true});
  }
  function carrierBinding(carrier){
    var source=carrier.pageKey?remotePages[carrier.pageKey]:page;
    var record=source && detailSection(source,carrier.reference);
    return bindings.slice().reverse().find(function(binding){
      if(!record || binding.page!==source || binding.section!==record.section)return false;
      for(var el=binding.el;el && el!==view;el=el.parentElement)if(el.hidden)return false;
      return true;
    });
  }
  /* Follow only authored detail links into pages already approved and loaded.
     The existing detail controller owns restoration, cancellation and history. */
  function carrierRoute(carrier){
    var queue=[],seen=[];
    records.forEach(function(record){if(record.section.diagram && !record.section.detailOnly)queue.push({page:page,record:record,section:record.reference,frames:[]});});
    for(var cursor=0;cursor<queue.length;cursor++){
      var route=queue[cursor],section=route.record.section;
      if(route.page===carrier.page && section===carrier.section)return route;
      if(seen.indexOf(section)>=0 || route.frames.length>=DETAIL_MAX_DEPTH-1)continue;
      seen.push(section);
      Object.keys(section.diagram && section.diagram.nodes || {}).forEach(function(id){
        var detail=section.diagram.nodes[id].detail;if(!detail)return;
        var source=detail.spec?remotePages[remoteKey(detail)]:route.page;
        var target=source && (detail.section?detailSection(source,detail.section):sectionRecords(source).find(function(record){return record.section.diagram;}));
        if(!target || !target.section.diagram)return;
        queue.push({page:source,record:target,section:route.section,frames:route.frames.concat([{node:id,state:{mode:'ambient'}}])});
      });
    }return null;
  }
  function showCarrier(carrier){
    if(retired || !on)return;
    var request=++coverageRequest,binding=carrierBinding(carrier);
    if(binding){focusCarrier(binding,carrier.id);return;}
    var source=carrier.pageKey?remotePages[carrier.pageKey]:page,record=source && detailSection(source,carrier.reference);
    var route=record && carrierRoute({page:source,section:record.section});
    var root=route && ctl.sections.find(function(rec){return rec.reference===route.section;});
    if(!root || (route.frames.length && (!ctl.details || !ctl.details.restore)))return;
    var focused=view.ownerDocument && view.ownerDocument.activeElement;
    if(root.tabBlock && ctl.tabBlocks)ctl.tabBlocks[root.tabBlock-1].select(root.tab,false);
    if(ctl.views && !ctl.views.ensure(root))return;
    if(ctl.details)ctl.details.showSection(root.reference);
    var restored=ctl.details?ctl.details.restore({section:route.section,frames:route.frames}):null;
    Promise.resolve(restored).then(function(){
      if(retired || request!==coverageRequest)return;
      // A later keyboard/click choice supersedes this pending focus request.
      var current=view.ownerDocument && view.ownerDocument.activeElement;
      if(current && current!==focused && current!==view.ownerDocument.body && current.isConnected &&
        !(current.closest && current.closest('.detail-breadcrumb')))return;
      paint();var target=carrierBinding(carrier);if(!target)return;
      if(target.el.scrollIntoView)target.el.scrollIntoView({block:'nearest'});
      focusCarrier(target,carrier.id);
    },function(error){if(!retired && request===coverageRequest)api.note(error && error.message || 'Unable to open detail','error');});
  }
  function jumpFirstBlocker(){
    var first=firstBlocker();if(!first)return;
    first.binding.stepper.jumpSource(first.index,first.binding.stepper.path());paint();focusBlocker(first.binding,first.index);
  }
  function panelLanes(pages){
    var lanes=[];pages.forEach(function(record){Object.keys(record.lanes).forEach(function(id){
      var lane=record.lanes[id],enabled=on && applied && refs().tickets.length>0;
      lanes.push({id:id,label:laneLabel(id,record.page),done:lane.done,total:lane.total,state:enabled?lane.state:null,
        text:laneLabel(id,record.page)+(enabled?' · '+lane.done+'/'+lane.total+' done':''),
        title:enabled?lane.keys.map(function(key){return key+' · '+(map[key]?map[key].state:'No status');}).join('\n'):''});
    });});return lanes;
  }
  function panelBlockers(pages){
    return refs().tickets.filter(function(key){return map[key] && ['blocked','missing'].indexOf(map[key].state)>=0;}).map(function(key){
      var entry=map[key],labels=[],carriers=0,steps=0;
      pages.forEach(function(record){Object.keys(record.lanes).forEach(function(id){
        var label=laneLabel(id,record.page);if(record.lanes[id].keys.indexOf(key)>=0 && labels.indexOf(label)<0)labels.push(label);
      });});
      sectionRecords(page).forEach(function(record){var d=record.section.diagram;if(!d)return;var waiting=liveStatusWaiting(d,map);
        carriers+=Object.keys(waiting).filter(function(id){return waiting[id].indexOf(key)>=0;}).length;
        steps+=(d.steps || []).filter(function(step){return liveStatusStepCarriers(d,step).some(function(carrier){return waiting[carrier.id] && waiting[carrier.id].indexOf(key)>=0;});}).length;
      });
      return {key:key,url:liveStatusTicketURL(page.tracking,key,entry),state:entry.state,lanes:labels.join(', '),
        downstream:carriers+' downstream carriers · '+steps+' steps'};
    });
  }
  function ticketRows(pages,coverage){
    var carriers=Object.create(null),rank=['blocked','missing','active','todo','done'];
    pages.forEach(function(record){sectionRecords(record.page).forEach(function(section){
      var d=section.section.diagram || {};
      var list=Object.keys(d.nodes || {}).filter(function(id){return !isTextBoxNode(d.nodes[id]);}).map(function(id){return {id:id,value:d.nodes[id],label:d.nodes[id].title || id};});
      (d.edges || []).forEach(function(edge){list.push({id:edge.from+'->'+edge.to,value:edge,label:edge.label || edge.from+' → '+edge.to});});
      list.forEach(function(carrier){carrier.page=record.page;carrier.section=section.section;carrier.reference=section.reference;
        carrier.pageKey=Object.keys(remotePages).find(function(key){return remotePages[key]===record.page;});
        trackingRefs(carrier.value).tickets.forEach(function(key){(carriers[key] || (carriers[key]=[])).push(carrier);});
      });
    });});
    return coverage.onDiagram.concat(coverage.notOnDiagram).filter(function(key,index,all){return all.indexOf(key)===index;}).sort(function(a,b){
      var diff=rank.indexOf(map[a]?map[a].state:'missing')-rank.indexOf(map[b]?map[b].state:'missing');return diff || (a<b?-1:a>b?1:0);
    }).map(function(key){
      var entry=map[key] || {},owners=carriers[key] || [],laneColor=null,urls=[];
      pages.some(function(record){return Object.keys(record.lanes).some(function(id){
        if(record.lanes[id].keys.indexOf(key)<0 && entry.lane!==id)return false;
        laneColor=(record.page.lanes[id] || {}).color;return !!laneColor;
      });});
      var source=owners.length?owners[0].page:pages.filter(function(record){return trackingEpics(record.page).indexOf(entry.epic)>=0;}).map(function(record){return record.page;})[0] || page;
      owners.forEach(function(carrier){trackingRefs(carrier.value).prs.forEach(function(url){if(urls.indexOf(url)<0)urls.push(url);});});
      return {key:key,url:liveStatusTicketURL(source.tracking,key,entry),title:entry.title || '—',state:entry.state || 'No status',
        owner:(entry.assignee || 'Unassigned')+' · '+(isFinite(Date.parse(entry.updatedAt))?relative(entry.updatedAt):'time unavailable'),
        prs:entry.prs?copy(entry.prs):null,urls:urls,laneColor:laneColor,
        carriers:owners.map(function(carrier){var route=carrierRoute(carrier),mounted=carrierBinding(carrier);
          return {id:carrier.id,label:carrier.label,reference:carrier.reference,pageKey:carrier.pageKey || '',
            disabled:!on || (!mounted && (!route || (route.frames.length && (!ctl.details || !ctl.details.restore)))),
            title:!mounted?'Detail page: '+(carrier.section.heading || carrier.reference):''};
        }),tag:!owners.length?'NOT ON DIAGRAM':coverage.notInEpic.indexOf(key)>=0?'NOT IN EPIC':''};
    });
  }
  function paintBinding(binding){
    var scope=binding.el,d=binding.section.diagram;if(!d)return;
    var waiting=on?liveStatusWaiting(d,map):{};
    scope.querySelectorAll('g.node[data-dv-node]').forEach(function(el){
      var id=el.getAttribute('data-dv-node'),value=(d.nodes || {})[id],state=on && !el.classList.contains('node-text')?liveStatusCarrier(value,map):null;
      var dependencies=waiting[id];decorateCarrier(el,el.classList.contains('node-text')?null:value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,dependencies);
      if(!state && !dependencies)return;
      var card=el.querySelector('.card');if(!card)return;
      var halo=card.cloneNode(false);halo.setAttribute('class','dv-live-halo');halo.removeAttribute('id');halo.setAttribute('aria-hidden','true');el.insertBefore(halo,el.firstChild);
      badge(el,value,state,binding.page.tracking,value.title || id,Number(card.getAttribute('width') || card.getAttribute('data-node-width'))-12,10,null,dependencies).setAttribute('data-live-carrier',id);
    });
    scope.querySelectorAll('path.edge[data-dv-edge],path.halo[data-dv-edge],text.lbl[data-dv-edge]').forEach(function(el){
      var index=Number(el.getAttribute('data-dv-edge')),value=(d.edges || [])[index],state=on?liveStatusCarrier(value,map):null;
      var dependencies=value && waiting[value.from+'->'+value.to];decorateCarrier(el,value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,dependencies);
      if((!state && !dependencies) || !el.classList.contains('edge'))return;
      var svg=el.closest('svg'),label=scope.querySelector('text.lbl[data-dv-edge="'+index+'"]'),x,y;
      if(label){var box=null;try{box=label.getBBox();}catch(ex){}x=box && box.width?box.x+box.width+12:Number(label.getAttribute('x'))+12;y=Number(label.getAttribute('y'))-4;}
      else {var point=el.getPointAtLength(el.getTotalLength()/2);x=point.x;y=point.y-14;}
      var marker=badge(svg,value,state,binding.page.tracking,value.label || value.from+' → '+value.to,x,y,index,dependencies);
      marker.setAttribute('data-live-carrier',value.from+'->'+value.to);
      if(el.getAttribute('data-dv-hidden')==='true')marker.setAttribute('data-dv-hidden','true');
      if(el.classList.contains('dv-fragment-hidden'))marker.classList.add('dv-fragment-hidden');
    });
    liveStatusEdgeBreaks(scope,d,map,on);
    paintStory(binding);
    scope.querySelectorAll('g.coin[data-dv-step],button.schip[data-step-source]').forEach(function(el){
      var index=Number(el.getAttribute(el.classList.contains('coin')?'data-dv-step':'data-step-source')),step=(d.steps || [])[index];
      liveStatusClass(el,on && step?liveStatusStep(d,step,map):null);
    });
  }
  function releaseBindings(){
    bindings.forEach(function(binding){['dv:pathrender','dv:pathchange','dv:stepchange'].forEach(function(type){binding.el.removeEventListener(type,schedule);});});
    stepHooks.splice(0).forEach(function(off){off();});
  }
  function syncBindings(){
    releaseBindings();bindings=sourceBindings();
    bindings.forEach(function(binding){
      ['dv:pathrender','dv:pathchange','dv:stepchange'].forEach(function(type){binding.el.addEventListener(type,schedule);});
      if(binding.stepper && binding.stepper.onBeforeAdvance)stepHooks.push(binding.stepper.onBeforeAdvance(function(index){
        var d=binding.section.diagram,state=on && liveStatusStep(d,d.steps[index],map);
        if(state!=='blocked' && state!=='missing')return true;
        paint();focusBlocker(binding,index);return false;
      }));
    });
  }
  function observeBindings(){
    if(applied && typeof MutationObserver!=='undefined'){
      if(!observer)observer=new MutationObserver(schedule);
      bindings.forEach(function(binding){binding.el.querySelectorAll('.schips').forEach(function(el){observer.observe(el,{childList:true,subtree:true});});});
    }
  }
  function paint(){
    if(retired || painting)return;
    if(frame){cancelAnimationFrame(frame);frame=0;}
    painting=true;
    // Observer callbacks run after this stack. Disconnect before our writes,
    // rather than relying on a flag that would be reset before delivery.
    if(observer)observer.disconnect();
    try{
      var focused=view.ownerDocument && view.ownerDocument.activeElement,focusCarrier=focused && focused.classList && focused.classList.contains('dv-live-badge') && focused.getAttribute('data-live-carrier'),focusBinding=focusCarrier && bindings.find(function(binding){return binding.el.contains(focused);});
      close(false);syncBindings();
      if(applied){
        view.querySelectorAll('.dv-live-badge,.dv-live-halo').forEach(function(el){el.remove();});
        bindings.forEach(paintBinding);
      }
      paintLanes();
      if(focusBinding){var replacement=Array.from(focusBinding.el.querySelectorAll('.dv-live-badge')).find(function(el){return el.getAttribute('data-live-carrier')===focusCarrier;});if(replacement)replacement.focus({preventScroll:true});}
      changedKeys=[];
    }finally{
      painting=false;if(!retired)observeBindings();
    }
  }
  function schedule(){if(retired || painting || frame)return;frame=requestAnimationFrame(function(){frame=0;paint();notify();});}
  function relative(at){var seconds=Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000));return seconds<60?'just now':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';}
  function visible(){return !document.hidden;}
  function stopTimer(){if(timer){clearTimeout(timer);timer=0;}}
  function arm(){stopTimer();if(provider && !retired && visible())timer=setTimeout(function(){timer=0;fetchMap();},delay);}
  function fetchMap(){
    if(retired || !provider || !visible())return;
    if(pending){catchUp=true;return;}pending=true;stopTimer();setStatus({busy:true});
    Promise.resolve().then(function(){if(!retired)return provider(refs(),abort.signal);}).then(function(value){
      if(!retired){api.apply(value);if(noteKind==='error')api.note('','info');setStatus({state:demoMode?'demo':'connected',busy:false,checkedAt:Date.now()});}
    },function(error){if(!retired){api.note(error && error.message || String(error),'error');setStatus({state:'error',busy:false});}}).then(function(){
      pending=false;if(retired)return;
      if(catchUp && visible()){catchUp=false;fetchMap();}else arm();
    });
  }
  function visibility(){stopTimer();if(visible())fetchMap();}
  var events=['diagram-tab-change','tab-view-change','diagram-view-change','navigation-mounted','detail-navigation'];
  var api={
    refs:refs,
    snapshot:snapshot,
    firstBlocker:jumpFirstBlocker,
    focusCarrier:showCarrier,
    runAction:function(){if(!retired && actionFn)actionFn();},
    toggleDemo:function(){if(!retired && demoControls)demoControls.toggle();},
    nextDemo:function(){if(!retired && demoControls)demoControls.next();},
    state:function(ref){return map[ref]?copy(map[ref]):null;},
    apply:function(value){
      if(retired)return;var next=Object.create(null);
      Object.keys(value || {}).forEach(function(key){
        var entry=value[key];if(!trackingKeyPattern.test(key) || !entry || LIVE_STATUS_STATES.indexOf(entry.state)<0)return;
        var item={state:entry.state};['title','assignee','detail','updatedAt','epic','lane'].forEach(function(field){if(typeof entry[field]==='string')item[field]=entry[field];});
        var url=deltaLinkUrl(entry.url);if(url)item.url=url;
        if(entry.prs && typeof entry.prs.count==='number' && isFinite(entry.prs.count) && entry.prs.count>=0 && ['open','merged','declined'].indexOf(entry.prs.state)>=0)item.prs={count:entry.prs.count,state:entry.prs.state};
        next[key]=item;
      });
      // Cache age describes the lookup, independently of issue modification
      // times. Preserve it before filtering the map down to ticket entries.
      var storedAt=value && value.storedAt;
      cacheUpdatedAt=typeof storedAt==='number' && isFinite(new Date(storedAt).getTime())?new Date(storedAt).toISOString():null;
      changedKeys=[];
      if(applied)refs().tickets.forEach(function(key){
        var oldState=map[key]?map[key].state:'No status',newState=next[key]?next[key].state:'No status';
        if(oldState===newState)return;
        changedKeys.push(key);
        var stamp=Date.parse(next[key] && next[key].updatedAt),at=isFinite(stamp)?new Date(stamp).toISOString():cacheUpdatedAt;
        activity.unshift({key:key,old:oldState,state:newState,at:at});
      });
      if(applied)liveStatusCoverage(page,next,refs()).notOnDiagram.forEach(function(key){
        if(seenKeys[key])return;
        var stamp=Date.parse(next[key].updatedAt),at=isFinite(stamp)?new Date(stamp).toISOString():cacheUpdatedAt;
        activity.unshift({key:key,added:true,at:at});
      });
      activity=activity.slice(0,20);Object.keys(next).forEach(function(key){seenKeys[key]=true;});
      map=next;applied=true;paint();notify();
    },
    clear:function(){if(retired)return;map=Object.create(null);cacheUpdatedAt=null;activity=[];seenKeys=Object.create(null);changedKeys=[];applied=true;paint();notify();},
    enabled:function(){return on;},
    setEnabled:function(value){if(retired)return;on=!!value;paint();notify();},
    onDestroy:function(fn){if(typeof fn!=='function')return function(){};if(retired){fn();return function(){};}destroyListeners.push(fn);return function(){var i=destroyListeners.indexOf(fn);if(i>=0)destroyListeners.splice(i,1);};},
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    note:function(text,kind){if(retired)return;noteText=typeof text==='string'?text:'';noteKind=['info','warn','error'].indexOf(kind)>=0?kind:'info';notify();},
    action:function(label,fn){if(retired)return;actionLabel=typeof label==='string'?label:'';actionFn=actionLabel && typeof fn==='function'?fn:null;notify();},
    setDemoControls:function(value){if(retired)return;demoControls=value;notify();},
    status:function(value){setStatus(value);},
    destroy:function(){
      if(retired)return;on=false;paintLanes();retired=true;liveStatusControllers.delete(view);coverageRequest++;if(motion && motion.removeEventListener)motion.removeEventListener('change',motionChanged);releaseBindings();destroyListeners.splice(0).forEach(function(fn){try{fn();}catch(ex){}});close(false);stopTimer();if(abort)abort.abort();if(demoDestroy)demoDestroy();
      if(frame)cancelAnimationFrame(frame);if(firstPaint)cancelAnimationFrame(firstPaint);frame=firstPaint=0;
      if(observer)observer.disconnect();
      bindings.forEach(function(binding){binding.el.removeEventListener('dv:pathrender',schedule);binding.el.removeEventListener('dv:pathchange',schedule);});bindings.forEach(function(binding){if(binding.section.diagram)liveStatusEdgeBreaks(binding.el,binding.section.diagram,{},false);});bindings=[];
      events.forEach(function(type){view.removeEventListener(type,schedule);});if(provider)document.removeEventListener('visibilitychange',visibility);
      if(pop)pop.remove();listeners=[];
      if(applied){
        view.querySelectorAll('.dv-live-badge,.dv-live-halo,.dv-live-caption').forEach(function(el){el.remove();});
        view.querySelectorAll('[data-dv-node],[data-dv-edge]').forEach(function(el){if(el._livePulseEnd){el.removeEventListener('animationend',el._livePulseEnd);delete el._livePulseEnd;}});
        view.querySelectorAll('.dv-live-todo,.dv-live-active,.dv-live-done,.dv-live-blocked,.dv-live-missing,.dv-live-waiting,.dv-live-stale,.dv-live-changed').forEach(function(el){liveStatusClass(el,null);liveStatusWaitingClass(el,null);el.classList.remove('dv-live-stale','dv-live-changed');});
      }
      if(renderOptions && renderOptions.loadDetail===wrappedLoad)renderOptions.loadDetail=originalLoad;
    }
  };
  liveStatusControllers.set(view,api);
  connectPanels();
  syncBindings();events.forEach(function(type){view.addEventListener(type,schedule);});
  if(provider){document.addEventListener('visibilitychange',visibility);firstPaint=requestAnimationFrame(function(){firstPaint=requestAnimationFrame(function(){firstPaint=0;fetchMap();});});}
  if(options.demo && typeof options.demo.mount==='function')demoDestroy=options.demo.mount(api);
  return api;
}
