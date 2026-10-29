/* Runtime ticket evidence belongs to this page controller, never the spec.
   Navigation can replace SVGs and step controls independently; source indices
   and section identities keep the paint attached to the authored carriers. */
var LIVE_STATUS_STATES = ['todo','active','done','blocked','missing'];
var LIVE_STATUS_APPEARANCES = LIVE_STATUS_STATES.concat(['unchanged']);
function liveStatusRollup(states){
  states=(states || []).filter(function(state){return LIVE_STATUS_STATES.indexOf(state)>=0;});
  if(!states.length)return null;
  for(var i=0;i<3;i++){var state=['blocked','missing','active'][i];if(states.indexOf(state)>=0)return state;}
  if(states.every(function(state){return state==='done';}))return 'done';
  if(states.every(function(state){return state==='todo';}))return 'todo';
  return 'active';
}
function liveStatusTicketURL(tracking,key,entry,authoredURL){
  var site=deltaLinkUrl(tracking && tracking.jira && tracking.jira.site);
  var authored=trackingTicket(authoredURL);
  return site?site.replace(/\/$/,'')+'/browse/'+key:deltaLinkUrl(entry && entry.url) || (authored && authored.key===key?authored.url:null);
}
function liveStatusPageTicketURL(page,key){
  var url=null;
  sectionRecords(page).some(function(record){
    var d=record.section.diagram || {};
    return Object.keys(d.nodes || {}).map(function(id){return d.nodes[id];}).concat(d.edges || []).some(function(value){url=trackingTicketURL(value,key);return !!url;});
  });return url;
}
function liveStatusOwnerURL(tracking,entry){
  // Confluence people page of the Jira assignee (#764): page site plus a non-blank accountId, encoded as one path
  // segment. Atlassian ids keep their literal colon (712020:uuid) so the URL matches the one Atlassian itself emits.
  var site=deltaLinkUrl(tracking && tracking.jira && tracking.jira.site),id=entry && typeof entry.assigneeId==='string'?entry.assigneeId.trim():'';
  return site && id?site.replace(/\/$/,'')+'/wiki/people/'+encodeURIComponent(id).replace(/%3A/g,':'):null;
}
/* Pull request evidence travels with a ticket entry and never paints a carrier.
   Links are sanitized once here, so the panel and the popover render the same shape. */
var LIVE_STATUS_PR_STATES=['open','draft','merged','closed'],LIVE_STATUS_PR_CHECKS=['none','pending','passing','failing'],LIVE_STATUS_PR_REVIEWS=['none','approved','changes-requested','commented'];
function liveStatusPRLinks(list){
  var out=[],urls=[];
  (Array.isArray(list)?list:[]).forEach(function(pr){
    var url=pr && typeof pr==='object' && deltaLinkUrl(pr.url);
    if(!url || urls.indexOf(url)>=0)return;urls.push(url);
    var link={url:url,state:LIVE_STATUS_PR_STATES.indexOf(pr.state)>=0?pr.state:'open',checks:LIVE_STATUS_PR_CHECKS.indexOf(pr.checks)>=0?pr.checks:'none',
      review:LIVE_STATUS_PR_REVIEWS.indexOf(pr.review)>=0?pr.review:'none',source:pr.source==='github-search'?'github-search':'authored'};
    if(typeof pr.number==='number' && isFinite(pr.number) && pr.number>0)link.number=Math.floor(pr.number);
    ['title','repo','author','branch','mergedAt'].forEach(function(field){if(typeof pr[field]==='string' && pr[field])link[field]=pr[field];});
    out.push(link);
  });
  return out;
}
function liveStatusPRSummary(links){
  return {count:links.length,state:links.some(function(pr){return pr.state==='open' || pr.state==='draft';})?'open':links.every(function(pr){return pr.state==='merged';})?'merged':'declined'};
}
function liveStatusPRNumber(url){var match=/\/(?:pull|pulls|pull-requests|merge_requests|merge-requests)\/(\d+)/.exec(url);return match?match[1]:null;}
function liveStatusPRHost(url){try{return new URL(url).host.replace(/^www\./,'');}catch(ex){return '';}}
/* Tooltip and accessible name of one pull request icon: state, checks, review,
   author and repository. No relative times (Chuck, 2026-10-27). */
function liveStatusPRLabel(pr){
  var number=pr.number!=null?'#'+pr.number:liveStatusPRNumber(pr.url)?'#'+liveStatusPRNumber(pr.url):'';
  var checks={pending:'checks pending',passing:'checks passing',failing:'checks failing'}[pr.checks],review={approved:'approved','changes-requested':'changes requested',commented:'review comments'}[pr.review];
  var head=[number,pr.title].filter(Boolean).join(' '),facts=[pr.state,checks,review].filter(Boolean).join(' · '),who=[pr.author,pr.repo].filter(Boolean).join(' · ');
  return {label:['Pull request '+head,facts,who].filter(Boolean).join(' · '),title:[head,facts,who].filter(Boolean).join('\n')};
}
/* One icon for the Tickets table and the carrier popover. A plain authored URL
   keeps the monochrome icon; GitHub evidence colours it by state and adds a
   checks dot. The icon markup is written once and kept across repaints. */
function liveStatusPRDecorate(node,pr){
  var doc=node.ownerDocument || document,enriched=!!(pr && typeof pr==='object'),url=enriched?pr.url:pr;
  node.className='nbacklink dv-live-pr-link';node.setAttribute('href',url);node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');
  if(!node._livePRIcon){node.innerHTML=FlowIcons.render('pull-request',{className:'dv-live-pr-icon',monochrome:true});node._livePRIcon=true;}
  var dot=node._livePRChecks;
  if(!enriched){
    var number=liveStatusPRNumber(url),host=liveStatusPRHost(url);
    node.removeAttribute('data-pr-state');node.setAttribute('aria-label','Pull request'+(number?' #'+number:'')+(host?' on '+host:''));node.setAttribute('title',url);
    if(dot){dot.remove();node._livePRChecks=null;}
    return node;
  }
  var text=liveStatusPRLabel(pr);node.setAttribute('data-pr-state',pr.state);node.setAttribute('aria-label',text.label);node.setAttribute('title',text.title);
  if(pr.checks && pr.checks!=='none'){
    if(!dot){dot=node._livePRChecks=doc.createElement('i');dot.className='dv-live-pr-checks';dot.setAttribute('aria-hidden','true');node.appendChild(dot);}
    dot.setAttribute('data-checks',pr.checks);
  }else if(dot){dot.remove();node._livePRChecks=null;}
  return node;
}
function liveStatusClass(el,state){
  LIVE_STATUS_APPEARANCES.forEach(function(value){
    var name='dv-live-'+value;
    if(value===state){if(!el.classList.contains(name))el.classList.add(name);}
    else if(el.classList.contains(name))el.classList.remove(name);
  });
  if(state){el.setAttribute('data-live-appearance',state);liveStatusInk(el,state);}
  else {el.removeAttribute('data-live-appearance');el.style.removeProperty('--dv-live-ink');el.style.removeProperty('--dv-live-print-ink');}
}
/* Choose ink against the actual host surface plus the configured status tint.
   Walk transparent ancestors; use the board ground for SVG carriers. */
function liveStatusInk(el,state){
  var doc=el.ownerDocument,win=doc && doc.defaultView;if(!win || !win.getComputedStyle)return;
  var computed=win.getComputedStyle(el),tint=state && rgba(computed.getPropertyValue('--dv-live-'+state)),strength=parseFloat(computed.getPropertyValue('--dv-live-fill')),amount=tint ? (Number.isFinite(strength)?strength/100:.15) : 0;tint=tint || [0,0,0];
  // Edge labels have no tinted backing; their ink must follow the ground alone.
  if(el.classList.contains('lbl'))amount=0;
  function rgba(raw){
    var match=/^#([0-9a-f]{6})$/i.exec(raw.trim());if(match)return [parseInt(match[1].slice(0,2),16),parseInt(match[1].slice(2,4),16),parseInt(match[1].slice(4,6),16),1];
    match=/rgba?\(([^)]+)\)/.exec(raw);if(match){var c=match[1].split(/[, /]+/).map(Number);return [c[0],c[1],c[2],c.length>3?c[3]:1];}
    match=/color\(srgb ([^)]+)\)/.exec(raw);if(match){var p=match[1].split(/[ /]+/).map(Number);return [p[0]*255,p[1]*255,p[2]*255,p.length>3?p[3]:1];}
    return null;
  }
  var board=el.closest('.board'),layers=[],ground=board && rgba(win.getComputedStyle(board).getPropertyValue('--dv-board-ground'));
  if(ground)layers.push(ground);
  else for(var host=el.parentElement;host;host=host.parentElement || (host.getRootNode && host.getRootNode().host)){
    var color=rgba(win.getComputedStyle(host).backgroundColor);if(!color)continue;
    if(color[3]>0)layers.push(color);if(color[3]===1)break;
  }
  var rgb=[255,255,255];layers.reverse().forEach(function(layer){rgb=rgb.map(function(v,i){return v*(1-layer[3])+layer[i]*layer[3];});});
  function ink(rgb){var lum=rgb.map(function(v,i){var n=(v*(1-amount)+tint[i]*amount)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});
  var light=lum[0]*.2126+lum[1]*.7152+lum[2]*.0722;return light>.179?'#000000':'#ffffff';}
  el.style.setProperty('--dv-live-ink',ink(rgb));
  // Print uses white board grounds; retain contrast even with a fully opaque tint.
  el.style.setProperty('--dv-live-print-ink',ink([255,255,255]));
}
/* Preserve authored Node Styles while live classes supply shared appearance.
   Presets also support the unknown-evidence construction fallback. */
var LIVE_STATUS_PRESETS = {todo:'slate',active:'azure',done:'moss',blocked:'rose',missing:'rose',unchanged:'moss'};
function liveStatusPreset(el,token){
  var saved=el._livePreset;
  if(!saved && !token)return;
  if(!saved){
    var authored=null;(el.getAttribute('class') || '').split(/\s+/).forEach(function(name){if(/^ns-/.test(name))authored=name.slice(3);});
    saved=el._livePreset={styled:el.classList.contains('node-styled'),token:authored,current:null};
  }
  if(saved.current)el.classList.remove('ns-'+saved.current);
  if(saved.token)el.classList.remove('ns-'+saved.token);
  if(token){el.classList.add('node-styled');el.classList.add('ns-'+token);saved.current=token;return;}
  if(!saved.styled)el.classList.remove('node-styled');
  if(saved.token)el.classList.add('ns-'+saved.token);
  delete el._livePreset;
}
function liveStatusCarrier(value,map){
  return liveStatusRollup(trackingRefs(value).tickets.map(function(key){return map[key] && map[key].state;}));
}
function liveStatusEvidence(value,map){
  return liveStatusPresentationRollup(trackingRefs(value).tickets.map(function(key){return map[key] && map[key].state || 'unknown';}));
}
/* Presentation is distinct from provider evidence: uncovered authored intent wins,
   and missing provider evidence never claims completion or no-change. */
function liveStatusPresentation(value,map){
  var keys=trackingRefs(value).tickets,states=keys.map(function(key){return map[key] && map[key].state || 'unknown';});
  if(value && value.missingWork===true)states.push('missing');
  return liveStatusPresentationRollup(states.length?states:['unchanged']);
}
// Unmarked edges retain evidence-only paint; a marker adds authored missing
// intent without turning an ordinary unticketed connection into a status carrier.
function liveStatusEdgePresentation(value,map,markerOn){
  return markerOn!==false && value && value.missingWork===true?liveStatusPresentation(value,map):liveStatusEvidence(value,map);
}
function liveStatusPresentationRollup(states){
  for(var i=0;i<3;i++){var state=['blocked','missing','active'][i];if(states.indexOf(state)>=0)return state;}
  if(states.indexOf('unknown')>=0)return null;
  var work=states.filter(function(state){return state && state!=='unchanged';});
  return work.length?liveStatusRollup(work):states.indexOf('unchanged')>=0?'unchanged':null;
}
/* Availability is separate from Jira state: every attached ticket needs explicit
   Done evidence, including tickets omitted from a partial response. */
function liveStatusUnavailable(value,map){
  return !!trackingExistsWhen(value) && !trackingRefs(value).tickets.every(function(key){return map[key] && map[key].state==='done';});
}
function liveStatusAvailability(value,map,diagram){
  var causes=[];
  function add(carrier,id){
    if(!liveStatusUnavailable(carrier,map))return;
    var tickets=trackingRefs(carrier).tickets,awaiting=!tickets.some(function(key){var state=map[key] && map[key].state;return LIVE_STATUS_STATES.indexOf(state)>=0 && state!=='done';});
    causes.push({id:id,label:carrier.title || id,value:carrier,tickets:tickets,awaiting:awaiting});
  }
  if(value){
    add(value,value.from?value.from+' → '+value.to:'This node');
    if(diagram && value.from)[value.from,value.to].filter(function(id,index,list){return list.indexOf(id)===index;}).forEach(function(id){var node=(diagram.nodes || {})[id];if(node)add(node,id);});
  }
  return causes.length?causes:null;
}
function liveStatusAvailabilityLabel(causes){
  return causes?causes.map(function(cause){return cause.awaiting?'Awaiting Jira status · '+cause.label+' requires confirmed Done status for '+cause.tickets.join(', '):'Not built yet · '+cause.label+' requires '+cause.tickets.join(', ')+' to be Done';}).join('; '):'';
}
function liveStatusAvailabilityClass(el,causes){
  el.classList.toggle('dv-live-unavailable',!!causes);
}
/* Bounded node artwork, always inside the card's authored geometry. No IDs or
   pattern definitions: native siblings and rebuilt boards cannot collide. */
function liveStatusNodeConstruction(el,value,state,causes){
  el.querySelectorAll('.dv-live-construction').forEach(function(item){item.remove();});
  el.classList.remove('dv-live-reserved','dv-live-blueprint');
  if(!causes)return;
  var card=el.querySelector('.card');if(!card)return;
  var w=Number(card.getAttribute('width') || card.getAttribute('data-node-width')),
    h=Number(card.getAttribute('height') || card.getAttribute('data-node-height')),
    body=Number(el.getAttribute('data-dv-body-height')) || h-32,active=state==='active';
  if(!isFinite(w) || !isFinite(h) || w<40 || h<40)return;
  el.classList.add(active?'dv-live-blueprint':'dv-live-reserved');
  var doc=el.ownerDocument || document;
  function svg(tag,attrs,parent){var item=doc.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(key){item.setAttribute(key,attrs[key]);});parent.appendChild(item);return item;}
  var art=svg('g',{'class':'dv-live-construction','aria-hidden':'true','pointer-events':'none'},card.parentNode);
  if(active)card.parentNode.insertBefore(art,card.nextSibling);
  var right=w-(el.classList.contains('node-handoff')?28:10);
  if(active){
    var strokes=[],left=8,top=8,bottom=h-8,width=right-left,height=bottom-top;
    for(var x=-height;x<width;x+=10){
      var x1=Math.max(0,x),y1=Math.max(0,-x),x2=Math.min(width,x+height),y2=Math.min(height,width-x);
      strokes.push('M'+(left+x1)+' '+(top+y1)+'L'+(left+x2)+' '+(top+y2));
    }
    svg('path',{'class':'dv-live-hatching',d:strokes.join('')},art);
    svg('path',{'class':'dv-live-construction-frame',d:'M4 17V4H17M'+(right-11)+' 4H'+(right+2)+'V17M'+(right+2)+' '+(h-17)+'V'+(h-4)+'H'+(right-11)+'M17 '+(h-4)+'H4V'+(h-17)},art);
    return;
  }
  var icon=el.querySelector('use'),image=el.querySelector('.node-image');
  if(icon || image){
    var ix=icon?Number(icon.getAttribute('x')):18,iy=icon?Number(icon.getAttribute('y')):body/2-8;
    svg('path',{'class':'dv-live-placeholder-icon',transform:'translate('+ix+' '+iy+')',d:'M1 4L8 1L15 4V12L8 15L1 12ZM1 4L8 7L15 4M8 7V15'},art);
  }
  svg('path',{'class':'dv-live-reservation-divider',d:'M10 '+(body+1)+'H'+right},art);
  var caption=causes.every(function(cause){return cause.awaiting;})?'AWAITING JIRA STATUS':'NOT BUILT YET';
  var captionEl=svg('text',{'class':'dv-live-reservation-title',x:10,y:body+12},art);captionEl.textContent=caption;
  // Narrow handoff cards tighten letter spacing rather than reducing glyph size.
  if(caption.length*6>right-10){captionEl.setAttribute('textLength',right-10);captionEl.setAttribute('lengthAdjust','spacing');}
  var tickets=trackingRefs(value).tickets,budget=Math.max(4,Math.floor((right-10)/6)),summary=tickets.join(' + ');
  if(summary.length>budget){
    var suffix=tickets.length>1?' +'+(tickets.length-1):'',limit=Math.max(1,budget-suffix.length-1);
    summary=tickets[0].slice(0,limit)+(tickets[0].length>limit?'…':'')+suffix;
  }
  svg('text',{'class':'dv-live-reservation-tickets',x:10,y:body+25},art).textContent=summary;
}
function liveStatusBlockingKeys(value,map){
  return trackingRefs(value).tickets.filter(function(key){return map[key] && ['blocked','missing'].indexOf(map[key].state)>=0;});
}
/* Dependencies are ticket -> ticket (#765), never carrier -> carrier, and never
   inferred from edge direction: edges are data flow. Two sources merge by
   provenance: Jira issue links on the map entry (source "jira") and authored
   page.tracking.dependencies pairs (source "authored"). */
function liveStatusDependencies(pages,map){
  var out=Object.create(null);
  function add(ticket,key,source,linkType,reason){
    var list=out[ticket] || (out[ticket]=[]),item=null;
    list.some(function(entry){if(entry.key===key)item=entry;return !!item;});
    if(!item){item={key:key,sources:[]};list.push(item);}
    if(item.sources.indexOf(source)<0)item.sources.push(source);
    if(typeof linkType==='string' && linkType && !item.linkType)item.linkType=linkType;
    if(typeof reason==='string' && reason && !item.reason)item.reason=reason;
  }
  Object.keys(map || {}).forEach(function(ticket){
    var entry=map[ticket];if(!entry || !Array.isArray(entry.dependsOn))return;
    entry.dependsOn.forEach(function(dep){if(dep && typeof dep.key==='string' && dep.key!==ticket)add(ticket,dep.key,dep.source==='authored'?'authored':'jira',dep.linkType,dep.reason);});
  });
  (pages || []).forEach(function(page){trackingDependencies(page).forEach(function(pair){add(pair.ticket,pair.on,'authored',null,pair.reason);});});
  return out;
}
/* X waits on Y while Y is not done, unless X is already active or done (then the
   link is listed but X is not waiting). A blocked or missing X still waits: the
   panel and popover record it, while the canvas keeps X's own stronger paint.
   Tone from the DIRECT upstream: unfinished grey; blocked or missing (including
   no entry) red. */
function liveStatusWaitingTone(state){return state==='blocked' || state==='missing'?'red':'grey';}
function liveStatusTicketWaiting(dependencies,map){
  var out=Object.create(null);
  // An empty map is no evidence at all: nothing waits before the first answer or after clear().
  if(!map || !Object.keys(map).length)return out;
  Object.keys(dependencies || {}).forEach(function(ticket){
    var own=map[ticket] && map[ticket].state;
    if(own==='active' || own==='done')return;
    var on=[];
    dependencies[ticket].forEach(function(dep){
      var state=map[dep.key] && LIVE_STATUS_STATES.indexOf(map[dep.key].state)>=0?map[dep.key].state:'missing';
      if(state==='done')return;
      on.push({key:dep.key,state:state,tone:liveStatusWaitingTone(state)});
    });
    if(!on.length)return;
    on.sort(function(a,b){return a.key<b.key?-1:a.key>b.key?1:0;});
    out[ticket]={tone:on.some(function(item){return item.tone==='red';})?'red':'grey',on:on};
  });
  return out;
}
/* A carrier waits when any of its tickets waits; red wins over grey. Keys are
   node IDs or from->to edge keys, the upstream keys sorted. */
function liveStatusCarrierWaiting(diagram,map,waiting){
  var out=Object.create(null),nodes=diagram.nodes || {};
  function visit(id,value){
    var tickets=trackingRefs(value).tickets,keys=[],red=false;
    tickets.forEach(function(ticket){var item=waiting && waiting[ticket];if(!item)return;if(item.tone==='red')red=true;item.on.forEach(function(up){if(keys.indexOf(up.key)<0)keys.push(up.key);});});
    if(keys.length){keys.sort();out[id]={tone:red?'red':'grey',keys:keys};}
  }
  Object.keys(nodes).forEach(function(id){if(!isTextBoxNode(nodes[id]))visit(id,nodes[id]);});
  (diagram.edges || []).forEach(function(edge){visit(edge.from+'->'+edge.to,edge);});
  return out;
}
/* One chain per path from a root upstream (one that waits on nothing itself)
   through each waiting hop; a cycle ends a chain at its first repeat. */
function liveStatusDependencyChains(waiting){
  var downstream=Object.create(null),roots=[],chains=[];
  Object.keys(waiting || {}).forEach(function(ticket){waiting[ticket].on.forEach(function(up){(downstream[up.key] || (downstream[up.key]=[])).push(ticket);if(!waiting[up.key] && roots.indexOf(up.key)<0)roots.push(up.key);});});
  if(!roots.length)Object.keys(downstream).sort().slice(0,1).forEach(function(key){roots.push(key);});
  function walk(path){
    var next=(downstream[path[path.length-1]] || []).filter(function(key){return path.indexOf(key)<0;}).sort();
    if(!next.length){chains.push(path);return;}
    next.forEach(function(key){if(chains.length<200)walk(path.concat([key]));});
  }
  roots.sort().forEach(function(root){walk([root]);});
  return chains;
}
/* Transitive downstream tickets of one key through waiting links. */
function liveStatusDownstreamTickets(key,waiting){
  var out=[],queue=[key],cursor=0;
  while(cursor<queue.length){var current=queue[cursor++];Object.keys(waiting || {}).forEach(function(ticket){
    if(out.indexOf(ticket)>=0 || ticket===key)return;
    if(waiting[ticket].on.some(function(up){return up.key===current;})){out.push(ticket);queue.push(ticket);}
  });}
  return out;
}
function liveStatusWaitingClass(el,waiting){
  if(waiting && waiting.keys && waiting.keys.length){el.classList.add('dv-live-waiting');el.setAttribute('data-dv-live-waiting-on',waiting.keys.join(','));el.setAttribute('data-dv-live-waiting-tone',waiting.tone);}
  else {el.classList.remove('dv-live-waiting');el.removeAttribute('data-dv-live-waiting-on');el.removeAttribute('data-dv-live-waiting-tone');}
}
/* Reconstruct the engine's small communication-break input from each visible
   SVG. Live effects own separate classes/elements so the stepper can clear or
   settle its authored failures without erasing persistent ticket evidence. */
function liveStatusEdgeBreaks(scope,diagram,map,on,availabilityOn){
  scope.querySelectorAll('.dv-live-comm-failure').forEach(function(el){el.remove();});
  scope.querySelectorAll('.dv-live-comm-hidden,.dv-live-packet-hidden,.dv-live-comm-suppressed').forEach(function(el){el.classList.remove('dv-live-comm-hidden','dv-live-packet-hidden','dv-live-comm-suppressed');});
  scope.querySelectorAll('svg').forEach(function(svg){
    var board={svg:svg,edgeIds:Object.create(null)},failures=Object.create(null),labels=Object.create(null);
    (diagram.edges || []).forEach(function(edge,index){
      var path=svg.querySelector('path.edge[data-dv-edge="'+index+'"]');if(!path)return;
      var state=on?liveStatusEdgePresentation(edge,map,availabilityOn):null,key=edge.from+'->'+edge.to,unavailable=on && availabilityOn!==false?liveStatusAvailability(edge,map,diagram):null,missing=on && availabilityOn!==false && edge.missingWork===true;
      if(state==='blocked' || missing || unavailable){
        board.edgeIds[key]={e:edge,idx:index,pathEl:path,haloEl:svg.querySelector('path.halo[data-dv-edge="'+index+'"]')};
        failures[key]='blocked';labels[key]=[edge.missingWork===true?'Missing work: additional work remains without a linked ticket':'',unavailable?liveStatusAvailabilityLabel(unavailable):liveStatusBlockingKeys(edge,map).join(', ')].filter(Boolean).join('; ');
        svg.querySelectorAll('g.comm-failure[data-dv-edge="'+index+'"]').forEach(function(el){el.classList.add('dv-live-comm-suppressed');});
      }
      if(state==='todo' || state==='blocked' || missing || unavailable)svg.querySelectorAll('circle.pkt').forEach(function(dot){
        var mpath=dot.querySelector('mpath');if(mpath && mpath.getAttribute('href')==='#'+path.getAttribute('id'))dot.classList.add('dv-live-packet-hidden');
      });
    });
    showCommunicationFailures(board,failures,false,{live:true,labels:labels});
    svg.querySelectorAll('g.dv-live-comm-failure').forEach(function(el){
      var edge=diagram.edges[Number(el.getAttribute('data-dv-edge'))],causes=on && availabilityOn!==false?liveStatusAvailability(edge,map,diagram):null;
      liveStatusAvailabilityClass(el,causes);liveStatusClass(el,on?liveStatusEdgePresentation(edge,map,availabilityOn):null);
    });
    // A live break is the glyph alone: the edge names its ends, and the badge,
    // popover and the group's title/aria-label carry the blocking keys. Canvas
    // text here would sit on the edge label, its coin or a node card.
    svg.querySelectorAll('g.dv-live-comm-failure .dv-live-break-label').forEach(function(el){el.remove();});
  });
}
function liveStatusStep(diagram,step,map){
  return liveStatusPresentationRollup(liveStatusStepCarriers(diagram,step,true).map(function(carrier){
    return liveStatusPresentation(carrier.value,map) || 'unknown';
  }));
}
/* Carrier identities are section-local; ticket keys are deduplicated only when
   counting work. Broad aggregates may include the endpoints of selected hops;
   visible step state, captions and ticket lists use direct carriers only. */
function liveStatusStepCarriers(diagram,step,directOnly){
  var out=[],nodes=stepNodes(step).slice(),keys=stepKeys(step).concat(Object.keys(stepFailures(step)));
  (diagram.edges || []).forEach(function(edge){
    var key=edge.from+'->'+edge.to;if(keys.indexOf(key)<0)return;
    out.push({id:key,value:edge});if(!directOnly)nodes.push(edge.from,edge.to);
  });
  nodes.filter(function(id,i){return nodes.indexOf(id)===i;}).forEach(function(id){
    var node=(diagram.nodes || {})[id];if(node && !isTextBoxNode(node))out.push({id:id,value:node});
  });return out;
}
function liveStatusStepTickets(diagram,step,directOnly){
  var keys=[];liveStatusStepCarriers(diagram,step,directOnly).forEach(function(carrier){
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
function liveStatusCaption(diagram,step,map,waiting){
  var keys=liveStatusStepTickets(diagram,step,true).filter(function(key){return map[key];}),state=liveStatusStep(diagram,step,map);
  if(!state)return liveStatusStepTickets(diagram,step,true).length?'AWAITING TICKET STATUS':'';
  if(state==='done')return 'DONE';
  if(state==='unchanged')return 'NO CHANGE NEEDED';
  if(state==='missing' && !keys.some(function(key){return map[key].state==='missing';}))return 'MISSING WORK · unlinked work remains';
  if(state==='blocked' || state==='missing'){
    var blockers=keys.filter(function(key){return map[key].state===state;}),detail=state==='blocked' && map[blockers[0]].detail;
    return state.toUpperCase()+' · '+blockers.join(', ')+(detail?' · '+detail:'');
  }
  var text=(state==='active'?'IN PROGRESS':'TODO')+' · '+keys.length+' tickets';
  if(state==='todo' && waiting){
    var carriers=liveStatusCarrierWaiting(diagram,map,waiting),upstream=[];
    liveStatusStepCarriers(diagram,step,true).forEach(function(carrier){(carriers[carrier.id] ? carriers[carrier.id].keys : []).forEach(function(key){if(upstream.indexOf(key)<0)upstream.push(key);});});
    if(upstream.length)text+=' · waiting on '+upstream.sort().join(', ');
  }
  return text;
}
function liveStatusStale(entry,now,staleDays){
  var days=typeof staleDays==='number' && isFinite(staleDays) && staleDays>0?staleDays:7;
  var at=entry && Date.parse(entry.updatedAt);
  return !!(entry && entry.state==='active' && isFinite(at) && now-at>days*86400000);
}
function liveStatusReadiness(page,map,waiting){
  var result={total:0,done:0,ready:true,blockers:0,waiting:0},primaryCount=0,blockers=[];
  sectionRecords(page).forEach(function(record){var d=record.section.diagram;if(!d)return;
    var carriers=Object.keys(d.nodes || {}).filter(function(id){return !isTextBoxNode(d.nodes[id]);}).map(function(id){return d.nodes[id];}).concat(d.edges || []);
    function complete(value){return value.missingWork!==true && trackingRefs(value).tickets.every(function(key){return map[key] && map[key].state==='done';});}
    carriers.forEach(function(value){var keys=trackingRefs(value).tickets;if(!keys.length && value.missingWork!==true)return;result.total++;if(complete(value))result.done++;
      liveStatusBlockingKeys(value,map).forEach(function(key){if(blockers.indexOf(key)<0)blockers.push(key);});
    });
    result.waiting+=Object.keys(liveStatusCarrierWaiting(d,map,waiting || {})).length;
    var primary=diagramPathList(d)[0];
    (primary?primary.indices:[]).forEach(function(index){liveStatusStepCarriers(d,d.steps[index]).forEach(function(carrier){
      if(!trackingRefs(carrier.value).tickets.length && carrier.value.missingWork!==true)return;primaryCount++;if(!complete(carrier.value))result.ready=false;
    });});
  });result.ready=result.ready && primaryCount>0;result.blockers=blockers.length;return result;
}
/* Coverage counts keys, independently of paint, readiness and lane rollups. */
function liveStatusContainer(key,entry,roots){
  return (roots || []).indexOf(key)>=0 || !!(entry && (entry.kind==='epic' || entry.kind==='initiative'));
}
function liveStatusCoverage(page,map,refs,pages){
  var roots=refs && refs.epics || trackingEpics(page),keys=(refs && refs.tickets || []).filter(function(key){return !liveStatusContainer(key,map[key],roots);});
  var epics=[],initiatives=[],members=[],included=[],excluded=[];
  // Resolve each source separately: one page's exclusions cannot erase another
  // approved detail page's intentional inherited membership.
  (pages || [page]).forEach(function(source){
    var sourceRoots=pages?trackingEpics(source):roots,omit=trackingExclusions(source);
    var sourceInitiatives=sourceRoots.filter(function(key){return map[key] && map[key].kind==='initiative';});
    var sourceEpics=sourceRoots.filter(function(key){return sourceInitiatives.indexOf(key)<0;});
    Object.keys(map || {}).forEach(function(key){
      var entry=map[key];if(!entry || !(entry.initiatives || []).some(function(root){return sourceInitiatives.indexOf(root)>=0;}))return;
      var epic=entry.kind==='epic'?key:entry.epic;if(epic && sourceEpics.indexOf(epic)<0)sourceEpics.push(epic);
    });
    sourceEpics.forEach(function(key){if(epics.indexOf(key)<0)epics.push(key);});
    sourceInitiatives.forEach(function(key){if(initiatives.indexOf(key)<0)initiatives.push(key);});
    omit.forEach(function(key){if(!liveStatusContainer(key,map[key],roots) && excluded.indexOf(key)<0)excluded.push(key);});
    Object.keys(map || {}).forEach(function(key){
      var entry=map[key];if(!entry || liveStatusContainer(key,entry,roots) || sourceEpics.indexOf(entry.epic)<0)return;
      if(members.indexOf(key)<0)members.push(key);
      if(omit.indexOf(key)<0 && included.indexOf(key)<0)included.push(key);
    });
  });
  var out={epics:epics,onDiagram:keys,notOnDiagram:included.filter(function(key){return keys.indexOf(key)<0;}),
    notInEpic:roots.length?keys.filter(function(key){return members.indexOf(key)<0;}):[],excluded:excluded};
  if(initiatives.length)out.initiatives=initiatives;
  return out;
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
  var view=ctl.view,authoring=!!(renderOptions && renderOptions.authoring),records=sectionRecords(page),map=Object.create(null),on=true,retired=false,applied=false,availabilityOn=true;
  var destroyListeners=[],listeners=[],bindings=[],observer=null,frame=0,firstPaint=0,timer=0,pending=false,catchUp=false,painting=false;
  var provider=typeof options.provider==='function'?options.provider:null,abort=provider?new AbortController():null;
  var refresh=Number(options.refreshMs),delay=isFinite(refresh)?Math.max(30000,refresh):30000;
  var noteText='',noteKind='info',actionLabel='',actionFn=null,pop=null,active=null,demoControls=null,demoDestroy=null,cacheUpdatedAt=null;
  var activity=[],seenKeys=Object.create(null),changedKeys=[],stepHooks=[],coverageRequest=0;
  // Connector evidence for the panel header (#769): who supplies the map, whether a fetch is in flight, when it last answered.
  var LIVE_STATUS_CONNECTIONS=['none','disconnected','approval','connecting','connected','error','demo'];
  var demoMode=!!(options.demo && typeof options.demo.mount==='function');
  var connection={state:provider?(demoMode?'demo':'connecting'):'none',busy:false,checkedAt:null,source:demoMode?'Demo':provider?'Host':'',github:{state:'none',busy:false}};
  // GitHub is a second, optional connector (#756): its state rides beside the Jira state and never replaces it.
  var LIVE_STATUS_GITHUB_CONNECTIONS=['none','disconnected','connecting','connected','error'];
  function setStatus(value){
    if(retired || !value || typeof value!=='object')return;
    if(typeof value.state==='string' && LIVE_STATUS_CONNECTIONS.indexOf(value.state)>=0)connection.state=value.state;
    if(typeof value.busy==='boolean')connection.busy=value.busy;
    if(typeof value.source==='string' && value.source)connection.source=value.source;
    if(value.checkedAt!=null){var at=typeof value.checkedAt==='number'?value.checkedAt:Date.parse(value.checkedAt);if(isFinite(at))connection.checkedAt=new Date(at).toISOString();}
    var github=value.github;
    if(github && typeof github==='object'){
      if(typeof github.state==='string' && LIVE_STATUS_GITHUB_CONNECTIONS.indexOf(github.state)>=0)connection.github.state=github.state;
      if(typeof github.busy==='boolean')connection.github.busy=github.busy;
    }
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
  function sources(){return [page].concat(Object.keys(remotePages).map(function(key){return remotePages[key];}));}
  // Dependency evidence is recomputed from the map and the authored pairs on every paint (#765).
  var dependencies=Object.create(null),ticketWaiting=Object.create(null),dependencyKeys=[];
  function refreshDependencies(){
    var all=liveStatusDependencies(sources(),map),coverage=liveStatusCoverage(page,map,refs(),sources()),queue=coverage.onDiagram.concat(coverage.notOnDiagram),seen=[];
    dependencies=Object.create(null);
    // Keep only upstream evidence reachable from an included story, including
    // transitive links. Every displayed upstream story joins the board totals.
    for(var i=0;i<queue.length;i++){
      var key=queue[i];if(seen.indexOf(key)>=0)continue;seen.push(key);
      if(all[key]){dependencies[key]=all[key];all[key].forEach(function(dep){queue.push(dep.key);});}
    }
    dependencyKeys=seen.filter(function(key){return coverage.onDiagram.indexOf(key)<0 && coverage.notOnDiagram.indexOf(key)<0 && !liveStatusContainer(key,map[key],refs().epics);});
    ticketWaiting=liveStatusTicketWaiting(dependencies,map);
  }
  // refs() collects the whole page; refs(key) narrows to the carriers that hold that ticket (their tickets are just the key).
  function refs(key){
    var byKey=typeof key==='string',out={tickets:[],prs:[],epics:[]};
    function collect(source){if(!byKey)trackingEpics(source).forEach(function(key){if(out.epics.indexOf(key)<0)out.epics.push(key);});sectionRecords(source).forEach(function(record){
      var d=record.section.diagram || {};
      Object.keys(d.nodes || {}).map(function(id){return d.nodes[id];}).concat(d.edges || []).forEach(function(value){
        var found=trackingRefs(value);if(byKey){if(found.tickets.indexOf(key)<0)return;found.tickets=[key];}
        ['tickets','prs'].forEach(function(field){found[field].forEach(function(ref){if(out[field].indexOf(ref)<0)out[field].push(ref);});});
      });
    });}
    collect(page);Object.keys(remotePages).forEach(function(key){collect(remotePages[key]);});return out;
  }
  function snapshot(){
    refreshDependencies();
    var coverage=liveStatusCoverage(page,map,refs(),sources()),storyKeys=coverage.onDiagram.concat(coverage.notOnDiagram,dependencyKeys);
    coverage.dependencies=dependencyKeys.slice();
    var counts={todo:0,active:0,done:0,blocked:0,missing:0},latest=null,stamp=-Infinity;
    storyKeys.forEach(function(key){var entry=map[key];if(!entry)return;counts[entry.state]++;
      var at=Date.parse(entry.updatedAt);if(isFinite(at) && at>stamp){stamp=at;latest=entry.updatedAt;}
    });
    var pages=laneRecords(),readiness=liveStatusReadiness(page,map,ticketWaiting);
    var initiatives=coverage.initiatives || [],scopeKeys=initiatives.concat(refs().epics.filter(function(key){return initiatives.indexOf(key)<0;}));
    var blocked=storyKeys.filter(function(key){return map[key] && ['blocked','missing'].indexOf(map[key].state)>=0;}).length;
    // Board waiting describes visible story dependents. Keep direct upstream
    // container evidence, but never present a hidden container as a waiting row.
    var boardWaiting=Object.create(null);storyKeys.forEach(function(key){if(ticketWaiting[key])boardWaiting[key]=ticketWaiting[key];});
    var waiting=Object.keys(boardWaiting).length;
    var verdict=(readiness.ready?'Ready to demo · ':'')+blocked+' blockers · '+waiting+' waiting';
    if(storyKeys.length)verdict+=' · '+coverage.onDiagram.length+' of '+storyKeys.length+' stories on diagram';
    var tickets=ticketRows(pages,coverage),outside=coverage.notInEpic.length+dependencyKeys.filter(function(key){return refs().epics.length && coverage.epics.indexOf(map[key] && map[key].epic)<0;}).length;
    var excluded=coverage.excluded.map(function(key){
      var entry=map[key] || {},source=sources().filter(function(source){return trackingExclusions(source).indexOf(key)>=0;})[0] || page;
      return {key:key,url:liveStatusTicketURL(source.tracking,key,entry),title:entry.title || '—',state:entry.state || 'No status',
        included:storyKeys.indexOf(key)>=0,reason:coverage.onDiagram.indexOf(key)>=0?'Included by manual attachment':dependencyKeys.indexOf(key)>=0?'Included as dependency':storyKeys.indexOf(key)>=0?'Included by another source':'Excluded from story totals'};
    });
    // Authored pairs the Jira links do not know yet: a hint for the author, never a write.
    var suggestions=[];sources().forEach(function(source){trackingDependencies(source).forEach(function(pair){
      var linked=(dependencies[pair.ticket] || []).some(function(dep){return dep.key===pair.on && dep.sources.indexOf('jira')>=0;});
      if(storyKeys.indexOf(pair.ticket)>=0 && !linked && !suggestions.some(function(item){return item.ticket===pair.ticket && item.on===pair.on;}))suggestions.push({ticket:pair.ticket,on:pair.on});
    });});
    var epicState=null;if(scopeKeys.length){var entry=map[scopeKeys[0]];epicState=entry && LIVE_STATUS_STATES.indexOf(entry.state)>=0?entry.state:
      !storyKeys.length?null:storyKeys.some(function(key){return map[key] && map[key].state==='blocked';})?'blocked':storyKeys.every(function(key){return map[key] && map[key].state==='done';})?'done':storyKeys.some(function(key){return !map[key] || map[key].state!=='todo';})?'active':'todo';}
    var epic={keys:scopeKeys,url:scopeKeys.length?liveStatusTicketURL(page.tracking,scopeKeys[0],map[scopeKeys[0]]):null,
      title:scopeKeys.length && map[scopeKeys[0]] && map[scopeKeys[0]].title || '',state:epicState,
      initiatives:initiatives.slice(),epics:coverage.epics.slice(),
      stories:storyKeys.length,done:storyKeys.filter(function(key){return map[key] && map[key].state==='done';}).length,onDiagram:storyKeys.filter(function(key){return coverage.onDiagram.indexOf(key)>=0;}).length,
      blocked:blocked,waiting:waiting,outside:outside,ready:readiness.ready};
    return {states:copy(map),counts:counts,updatedAt:cacheUpdatedAt || latest,enabled:on,
      available:!!(refs().tickets.length || refs().epics.length || coverage.excluded.length || hasMissingWork()),hasData:!!(provider || applied || hasMissingWork()),
      note:{text:noteText,kind:noteKind},actionLabel:actionFn?actionLabel:'',firstBlocker:!!firstBlocker(),
      lanes:panelLanes(pages),blockers:panelBlockers(pages),tickets:tickets,excluded:excluded,
      dependencies:copy(dependencies),waiting:copy(boardWaiting),chains:liveStatusDependencyChains(boardWaiting),suggestions:suggestions,epic:epic,
      coverage:coverage,readiness:readiness,activity:copy(activity.filter(function(item){return storyKeys.indexOf(item.key)>=0;})).map(function(item){item.relative=item.at?relative(item.at):'time unavailable';return item;}),
      demo:demoControls?{playing:!!demoControls.playing,manual:!!demoControls.manual,ended:!!demoControls.ended}:null,verdict:verdict,
      updatedText:cacheUpdatedAt || latest?'updated '+relative(cacheUpdatedAt || latest):'',
      connection:{state:connection.state,busy:connection.busy,checkedAt:connection.checkedAt,source:connection.source,checkedText:connection.checkedAt?'refreshed '+relative(connection.checkedAt):'',github:{state:connection.github.state,busy:connection.github.busy}}};
  }
  function hasMissingWork(){return sources().some(function(source){return sectionRecords(source).some(function(record){var d=record.section.diagram || {};return Object.values(d.nodes || {}).some(function(node){return !isTextBoxNode(node) && node.missingWork===true;}) || (d.edges || []).some(function(edge){return edge.missingWork===true;});});});}
  function presentationActive(){return applied || hasMissingWork();}
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
  function outside(ev){if(active && !active.contains(ev.target) && !pop.contains(ev.target) && carrierFrom(ev.target)!==active)close(true);}
  function escape(ev){if(ev.key==='Escape' && active){ev.preventDefault();ev.stopPropagation();close(true);}}
  function show(trigger,value,tracking,label,waiting,availability){
    if(retired)return;
    if(active===trigger){close(true);return;}close(false);
    if(!pop){pop=element('div','nbackpop dv-live-popover',null,view);pop.setAttribute('role','dialog');pop.setAttribute('popover','manual');pop.hidden=true;}
    pop.replaceChildren();pop.setAttribute('aria-label',(trackingRefs(value).tickets.length?'Live tickets for ':'Work status for ')+label);
    element('strong','node-link-title','Work status · '+label,pop);
    var dismiss=element('button','node-link-close','×',pop);dismiss.type='button';dismiss.setAttribute('aria-label','Close live tickets');dismiss.addEventListener('click',function(){close(true);});
    var found=trackingRefs(value);
    if(value && value.missingWork===true)element('p','dv-live-coverage-detail','Missing work: additional work remains without a linked ticket. Clear this Missing work marker when covered.',pop);
    else if(!found.tickets.length)element('p','dv-live-coverage-detail','No change needed: no linked tickets or missing-work marker.',pop);
    if(availability){
      element('p','dv-live-availability-detail',liveStatusAvailabilityLabel(availability),pop);
      availability.forEach(function(cause){cause.tickets.forEach(function(key){
        if(found.tickets.indexOf(key)<0)found.tickets.push(key);
      });});
    }
    if(waiting && waiting.keys && waiting.keys.length){
      // "Waiting on KEY · state" per direct upstream, then the chain(s) this carrier's tickets sit in.
      var shown=[];found.tickets.forEach(function(ticket){(ticketWaiting[ticket] ? ticketWaiting[ticket].on : []).forEach(function(up){
        if(shown.indexOf(up.key)>=0)return;shown.push(up.key);
        var row=element('div','dv-live-waiting-detail','Waiting on '+up.key+' · '+up.state,pop);row.setAttribute('data-tone',up.tone);
      });});
      // Only chains in which one of this carrier's tickets is a waiting hop; a chain
      // this carrier merely holds up belongs to the downstream carrier's popover.
      liveStatusDependencyChains(ticketWaiting).forEach(function(chain){
        if(!chain.some(function(key,index){return index>0 && found.tickets.indexOf(key)>=0;}))return;
        element('div','dv-live-waiting-chain',chain.join(' holds '),pop);
      });
    }
    found.tickets.forEach(function(key){
      var entry=map[key],row=element('div','dv-live-ticket',null,pop);
      link(row,key,liveStatusTicketURL(tracking,key,entry,trackingTicketURL(value,key) || (availability || []).map(function(cause){return trackingTicketURL(cause.value,key);}).filter(Boolean)[0]));
      var pill=element('span','dv-live-ticket-state dv-live-state-pill',entry?entry.state:'No status',row);liveStatusClass(pill,entry?entry.state:null);
      if(entry){
        if(entry.title)element('span','dv-live-ticket-title',entry.title,row);
        if(entry.assignee)element('span','dv-live-ticket-assignee',entry.assignee,row);
        if(entry.prs)element('span','dv-live-ticket-prs','PRs: '+entry.prs.count+' '+entry.prs.state,row);
        if(entry.prs && entry.prs.links){var icons=element('span','dv-live-ticket-links',null,row);entry.prs.links.forEach(function(pr){liveStatusPRDecorate(element('a',null,null,icons),pr);});}
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
  /* Carriers are their own ticket triggers (#762; Chuck 2026-10-27 removed the
     canvas badges): a ticketed node's card, and an edge's line or label.
     Pointer aliases on the line, halo and live break share the label's button
     (the path or visible live break when unlabelled), so each edge has just
     one keyboard stop. In
     the reader the trigger is a named button reached by Tab; under authoring
     the Workbench owns carrier clicks, selection and focus, so the trigger
     stays inert and the Tickets table remains the route to the popover. */
  var CARRIER_ATTRS=['role','tabindex','aria-label','aria-haspopup','aria-expanded'];
  function carrierTarget(el,id,value,state,tracking,label,waiting,availability){
    if(!el._liveSaved){el._liveSaved={};CARRIER_ATTRS.forEach(function(name){el._liveSaved[name]=el.getAttribute(name);});}
    el.classList.add('dv-live-target');el.setAttribute('data-live-carrier',id);
    el._liveCarrier={value:value,state:state,tracking:tracking,label:label,waiting:waiting,availability:availability};
    if(authoring)return el;
    el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-expanded','false');
    el.setAttribute('aria-label',(trackingRefs(value).tickets.length?'Live tickets for ':'Work status for ')+label+(state?' · '+(state==='unchanged'?'No change needed':state==='missing' && value.missingWork===true?'Missing work':state):'')+(availability?' · '+liveStatusAvailabilityLabel(availability):'')+(waiting && waiting.keys?' · waiting on '+waiting.keys.join(', '):''));
    return el;
  }
  function clearTarget(el){
    var saved=el._liveSaved || {};el.classList.remove('dv-live-target');el.removeAttribute('data-live-carrier');
    CARRIER_ATTRS.forEach(function(name){if(saved[name]==null)el.removeAttribute(name);else el.setAttribute(name,saved[name]);});
    el._liveSaved=null;el._liveCarrier=null;
  }
  function clearTargets(){
    view.querySelectorAll('.dv-live-pointer').forEach(function(el){el.classList.remove('dv-live-pointer');el._livePointerTarget=null;});
    view.querySelectorAll('.dv-live-target').forEach(clearTarget);
  }
  function carrierPointer(el,target){
    if(!el || !target || authoring)return;
    el.classList.add('dv-live-pointer');el._livePointerTarget=target;
  }
  // A node's own controls (links menu, detail, handoff, anchors) keep their clicks.
  var CARRIER_SKIP='a,button,input,select,textarea,summary,[role="button"]:not(.dv-live-target),.nlink,.nbackref,[data-dv-detail],[data-dv-handoff]';
  function carrierFrom(target){
    if(!target || !target.closest)return null;
    var direct=target.closest('.dv-live-target');if(direct && view.contains(direct))return direct;
    var pointer=target.closest('.dv-live-pointer');
    if(pointer && view.contains(pointer) && view.contains(pointer._livePointerTarget))return pointer._livePointerTarget;
    var node=target.closest('g.node[data-dv-node]');if(!node || !view.contains(node) || target.closest(CARRIER_SKIP))return null;
    return node.querySelector('.card.dv-live-target');
  }
  function openCarrier(el){var c=el._liveCarrier;show(el,c.value,c.tracking,c.label,c.waiting,c.availability);}
  function carrierClick(ev){
    if(authoring || retired || ev.defaultPrevented || ev.button>0)return;
    var el=carrierFrom(ev.target);if(!el || !el._liveCarrier)return;
    ev.preventDefault();ev.stopPropagation();openCarrier(el);
  }
  function carrierKey(ev){
    if(authoring || retired || ev.defaultPrevented || (ev.key!=='Enter' && ev.key!==' '))return;
    var el=ev.target;if(!el || !el.classList || !el.classList.contains('dv-live-target') || !el._liveCarrier)return;
    ev.preventDefault();ev.stopPropagation();openCarrier(el);
  }
  view.addEventListener('click',carrierClick);view.addEventListener('keydown',carrierKey);
  destroyListeners.push(function(){view.removeEventListener('click',carrierClick);view.removeEventListener('keydown',carrierKey);});
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
    var stepper=binding.stepper,d=binding.section.diagram,scope=binding.el;
    scope.querySelectorAll('.dv-live-caption').forEach(function(el){el.remove();});
    var step=on && stepper && stepper.mode()==='step' && (d.steps || [])[stepper.sourceIndex()];
    var host=step && scope.querySelector('.termbar .step-text'),keys=step?liveStatusStepTickets(d,step,true):[];
    var row=host && host.querySelector('.dv-live-step-tickets');
    scope.querySelectorAll('.dv-live-step-tickets').forEach(function(el){if(el!==row || !keys.length)el.remove();});
    if(!host)return;
    if(keys.length){
      var tickets=keys.map(function(key){return {key:key,url:liveStatusTicketURL(binding.page.tracking,key,map[key],liveStatusPageTicketURL(binding.page,key))};});
      var signature=JSON.stringify(tickets);
      // Keep keyboard focus on an unchanged link when fresh status arrives.
      if(!row || row._liveStepTickets!==signature){
        if(row)row.remove();
        row=element('span','dv-live-step-tickets','',host);row.setAttribute('role','group');row.setAttribute('aria-label','Jira tickets for this step');
        tickets.forEach(function(ticket){var item=element('span','dv-live-step-ticket','',row);link(item,ticket.key,ticket.url);element('span','dv-live-state-pill dv-live-step-state','',item);});row._liveStepTickets=signature;
      }
      var labels={todo:'To do',active:'In progress',done:'Done',blocked:'Blocked',missing:'Missing'};
      tickets.forEach(function(ticket,index){
        var entry=map[ticket.key],item=row.children[index],state=entry && entry.state,pill=item.querySelector('.dv-live-step-state');
        var title=entry && entry.title && entry.title.trim(),titleEl=item.querySelector('.dv-live-step-title');
        if(title){
          if(!titleEl){titleEl=element('span','dv-live-step-title','',item);item.insertBefore(titleEl,pill);}
          titleEl.textContent=title;titleEl.setAttribute('title',title);
        }else if(titleEl)titleEl.remove();
        pill.textContent=labels[state] || 'No status';liveStatusClass(pill,state || null);
      });
    }
    var text=availabilityOn && presentationActive()?liveStatusCaption(d,step,map,ticketWaiting):'';
    if(text){var caption=element('span','dv-live-caption dv-live-state-pill',text,host);liveStatusClass(caption,liveStatusStep(d,step,map));if(!caption.getAttribute('data-live-appearance'))liveStatusInk(caption,null);}
  }
  function laneLabel(id,source){return ((source.lanes || {})[id] || {}).label || id;}
  function laneRecords(){
    return [page].concat(Object.keys(remotePages).map(function(key){return remotePages[key];})).map(function(source){
      return {page:source,lanes:liveStatusLanes(source,map)};
    });
  }
  function paintLanes(){
    // Status boards put each ticket's state beneath the prose. Ordinary
    // diagrams keep their authored team context, independently of Live.
    bindings.forEach(function(binding){var stepper=binding.stepper;if(!stepper)return;
      var d=binding.section.diagram,step=(d.steps || [])[stepper.sourceIndex()];
      var statusBoard=(d.panels || []).some(function(panel){return panel && panel.type==='live-status';});
      binding.el.querySelectorAll('.lanepill').forEach(function(el){
        if(step && step.lane)el.textContent=laneLabel(step.lane,binding.page);
        el.classList.toggle('dv-live-board-lane',statusBoard);
        liveStatusClass(el,null);el.removeAttribute('title');el.removeAttribute('tabindex');
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
    var d=binding.section.diagram,carriers=liveStatusStepCarriers(d,d.steps[index],true);
    var carrier=carriers.find(function(carrier){return liveStatusBlockingKeys(carrier.value,map).length || carrier.value.missingWork===true;});if(!carrier)return;
    focusCarrier(binding,carrier.id);
  }
  function focusCarrier(binding,id){
    var target=Array.from(binding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===id;});
    if(target)target.focus({preventScroll:true});
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
    var coverage=liveStatusCoverage(page,map,refs(),sources());
    return coverage.onDiagram.concat(coverage.notOnDiagram,dependencyKeys).filter(function(key){return map[key] && ['blocked','missing'].indexOf(map[key].state)>=0;}).map(function(key){
      var entry=map[key],labels=[],carriers=0,steps=0;
      pages.forEach(function(record){Object.keys(record.lanes).forEach(function(id){
        var label=laneLabel(id,record.page);if(record.lanes[id].keys.indexOf(key)>=0 && labels.indexOf(label)<0)labels.push(label);
      });});
      // Downstream = carriers whose tickets wait, directly or through a chain, on this key.
      var downstreamTickets=liveStatusDownstreamTickets(key,ticketWaiting),partial=Object.create(null);downstreamTickets.forEach(function(ticket){partial[ticket]=ticketWaiting[ticket];});
      sectionRecords(page).forEach(function(record){var d=record.section.diagram;if(!d)return;var waiting=liveStatusCarrierWaiting(d,map,partial);
        carriers+=Object.keys(waiting).length;
        steps+=(d.steps || []).filter(function(step){return liveStatusStepCarriers(d,step).some(function(carrier){return waiting[carrier.id];});}).length;
      });
      return {key:key,url:liveStatusTicketURL(page.tracking,key,entry,liveStatusPageTicketURL(page,key)),state:entry.state,lanes:labels.join(', '),
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
    // Use the same extra upstream stories as the summary counts.
    var linked=dependencyKeys;
    return coverage.onDiagram.concat(coverage.notOnDiagram,linked).filter(function(key,index,all){return all.indexOf(key)===index && !liveStatusContainer(key,map[key],refs().epics);}).sort(function(a,b){
      var diff=rank.indexOf(map[a]?map[a].state:'missing')-rank.indexOf(map[b]?map[b].state:'missing');return diff || (a<b?-1:a>b?1:0);
    }).map(function(key){
      var entry=map[key] || {},owners=carriers[key] || [],laneColor=null,urls=[];
      pages.some(function(record){return Object.keys(record.lanes).some(function(id){
        if(record.lanes[id].keys.indexOf(key)<0 && entry.lane!==id)return false;
        laneColor=(record.page.lanes[id] || {}).color;return !!laneColor;
      });});
      var source=owners.length?owners[0].page:pages.filter(function(record){return trackingEpics(record.page).some(function(root){return root===entry.epic || (entry.initiatives || []).indexOf(root)>=0;});}).map(function(record){return record.page;})[0] || page;
      owners.forEach(function(carrier){trackingRefs(carrier.value).prs.forEach(function(url){if(urls.indexOf(url)<0)urls.push(url);});});
      var dependsOn=(dependencies[key] || []).map(function(dep){
        var up=map[dep.key],state=up && LIVE_STATUS_STATES.indexOf(up.state)>=0?up.state:'missing';
        return {key:dep.key,state:state,tone:state==='done'?'done':liveStatusWaitingTone(state),sources:dep.sources.slice(),linkType:dep.linkType || '',reason:dep.reason || '',url:liveStatusTicketURL(source.tracking,dep.key,up,liveStatusPageTicketURL(source,dep.key))};
      });
      return {key:key,url:liveStatusTicketURL(source.tracking,key,entry,liveStatusPageTicketURL(source,key)),title:entry.title || '—',state:entry.state || 'No status',
        owner:entry.assignee || 'Unassigned',ownerUrl:entry.assignee?liveStatusOwnerURL(source.tracking,entry):null,dependsOn:dependsOn,waiting:ticketWaiting[key]?ticketWaiting[key].tone:null,
        epicLabel:entry.epic && ((coverage.initiatives || []).length || coverage.epics.indexOf(entry.epic)<0)?'epic '+entry.epic:'',
        prs:entry.prs?copy(entry.prs):null,urls:urls,laneColor:laneColor,
        carriers:owners.map(function(carrier){var route=carrierRoute(carrier),mounted=carrierBinding(carrier);
          return {id:carrier.id,label:carrier.label,reference:carrier.reference,pageKey:carrier.pageKey || '',
            disabled:!on || (!mounted && (!route || (route.frames.length && (!ctl.details || !ctl.details.restore)))),
            title:!mounted?'Detail page: '+(carrier.section.heading || carrier.reference):''};
        }),tag:linked.indexOf(key)>=0?'DEPENDENCY ONLY':!owners.length?'NOT ON DIAGRAM':coverage.notInEpic.indexOf(key)>=0?(coverage.initiatives?'NOT IN SCOPE':'NOT IN EPIC'):''};
    });
  }
  function paintBinding(binding){
    var scope=binding.el,d=binding.section.diagram;if(!d)return;
    var waiting=on?liveStatusCarrierWaiting(d,map,ticketWaiting):{},coverageActive=presentationActive();
    scope.querySelectorAll('g.node[data-dv-node]').forEach(function(el){
      var id=el.getAttribute('data-dv-node'),value=(d.nodes || {})[id],state=on && availabilityOn && !el.classList.contains('node-text')?(coverageActive?liveStatusPresentation(value,map):liveStatusCarrier(value,map)):null;
      // A blocked or missing carrier keeps its own paint (solid or dotted rose): the stronger state wins
      // over the dashed waiting stroke; the popover and panel still record what it waits on.
      var unavailable=on && availabilityOn?liveStatusAvailability(value,map):null;liveStatusAvailabilityClass(el,unavailable);
      var waits=waiting[id],painted=state==='blocked' || state==='missing'?null:waits;decorateCarrier(el,el.classList.contains('node-text')?null:value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,painted);
      // Waiting tone wears the upstream's preset: slate while unfinished, rose when blocked or missing.
      liveStatusPreset(el,unavailable?(state==='active'?'azure':state==='blocked' || state==='missing'?'rose':'slate'):painted?(painted.tone==='red'?'rose':'slate'):state?LIVE_STATUS_PRESETS[state]:null);
      liveStatusNodeConstruction(el,value,state,unavailable);
      if(!state && !waits && !unavailable)return;
      var card=el.querySelector('.card');if(!card)return;
      var halo=card.cloneNode(false);halo.setAttribute('class','dv-live-halo');halo.removeAttribute('id');halo.setAttribute('aria-hidden','true');el.insertBefore(halo,el.firstChild);
      carrierTarget(card,id,value,state,binding.page.tracking,value.title || id,waits,unavailable);
    });
    scope.querySelectorAll('path.edge[data-dv-edge],path.halo[data-dv-edge],text.lbl[data-dv-edge]').forEach(function(el){
      var index=Number(el.getAttribute('data-dv-edge')),value=(d.edges || [])[index],state=on?liveStatusEdgePresentation(value,map,availabilityOn):null;
      var unavailable=on && availabilityOn?liveStatusAvailability(value,map,d):null;liveStatusAvailabilityClass(el,unavailable);
      var waits=value && waiting[value.from+'->'+value.to],painted=state==='blocked' || state==='missing'?null:waits;decorateCarrier(el,value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,painted);
      if((!state && !waits && !unavailable) || !el.classList.contains('edge'))return;
      var svg=el.closest('svg'),label=svg.querySelector('text.lbl[data-dv-edge="'+index+'"]');
      var target=carrierTarget(label || el,value.from+'->'+value.to,value,state,binding.page.tracking,value.label || value.from+' → '+value.to,waits,unavailable);
      carrierPointer(el,target);carrierPointer(svg.querySelector('path.halo[data-dv-edge="'+index+'"]'),target);
    });
    liveStatusEdgeBreaks(scope,d,map,on,availabilityOn);
    scope.querySelectorAll('g.dv-live-comm-failure[data-dv-edge]').forEach(function(el){
      var svg=el.closest('svg'),path=svg && svg.querySelector('path.edge[data-dv-edge="'+el.getAttribute('data-dv-edge')+'"]');
      var target=path && path._livePointerTarget;if(!target)return;
      // A live break hides its original path. Without a label, move the single
      // keyboard button onto the visible replacement so Escape can focus it.
      if(target===path){
        var carrier=path._liveCarrier;
        target=carrierTarget(el,path.getAttribute('data-live-carrier'),carrier.value,carrier.state,carrier.tracking,carrier.label,carrier.waiting,carrier.availability);
        clearTarget(path);carrierPointer(path,target);carrierPointer(svg.querySelector('path.halo[data-dv-edge="'+el.getAttribute('data-dv-edge')+'"]'),target);
      }
      carrierPointer(el,target);
    });
    scope.querySelectorAll('g.coin[data-dv-step],button.schip[data-step-source]').forEach(function(el){
      var index=Number(el.getAttribute(el.classList.contains('coin')?'data-dv-step':'data-step-source')),step=(d.steps || [])[index];
      liveStatusClass(el,on && availabilityOn && step && coverageActive?liveStatusStep(d,step,map):null);
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
      var focused=view.ownerDocument && view.ownerDocument.activeElement,focusCarrier=focused && focused.classList && focused.classList.contains('dv-live-target') && focused.getAttribute('data-live-carrier'),focusBinding=focusCarrier && bindings.find(function(binding){return binding.el.contains(focused);});
      close(false);syncBindings();clearTargets();refreshDependencies();
      if(applied || availabilityOn){
        view.querySelectorAll('.dv-live-halo').forEach(function(el){el.remove();});
        bindings.forEach(paintBinding);
      }
      bindings.forEach(paintStory);paintLanes();
      if(focusBinding){var replacement=Array.from(focusBinding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===focusCarrier;});if(replacement)replacement.focus({preventScroll:true});}
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
  var events=['reader-skin-change','diagram-tab-change','tab-view-change','diagram-view-change','navigation-mounted','detail-navigation'];
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
        var item={state:entry.state};if(['initiative','epic','story'].indexOf(entry.kind)>=0)item.kind=entry.kind;
        if(Array.isArray(entry.initiatives))item.initiatives=entry.initiatives.filter(function(key,index,all){return typeof key==='string' && trackingKeyPattern.test(key) && all.indexOf(key)===index;});
        ['title','assignee','assigneeId','detail','updatedAt','epic','parent','lane'].forEach(function(field){if(typeof entry[field]==='string')item[field]=entry[field];});
        var url=deltaLinkUrl(entry.url);if(url)item.url=url;
        var links=liveStatusPRLinks(entry.prs && entry.prs.links);
        if(Array.isArray(entry.dependsOn)){var deps=[];entry.dependsOn.forEach(function(dep){
          if(!dep || typeof dep!=='object' || typeof dep.key!=='string' || !trackingKeyPattern.test(dep.key) || ['jira','authored'].indexOf(dep.source)<0)return;
          var link={key:dep.key,source:dep.source};if(typeof dep.linkType==='string' && dep.linkType)link.linkType=dep.linkType;if(typeof dep.reason==='string' && dep.reason)link.reason=dep.reason;deps.push(link);
        });if(deps.length)item.dependsOn=deps;}
        if(entry.prs && typeof entry.prs.count==='number' && isFinite(entry.prs.count) && entry.prs.count>=0 && ['open','merged','declined'].indexOf(entry.prs.state)>=0)item.prs={count:entry.prs.count,state:entry.prs.state};
        else if(links.length)item.prs=liveStatusPRSummary(links);
        if(links.length)item.prs.links=links;
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
      if(applied)liveStatusCoverage(page,next,refs(),sources()).notOnDiagram.forEach(function(key){
        if(seenKeys[key])return;
        var stamp=Date.parse(next[key].updatedAt),at=isFinite(stamp)?new Date(stamp).toISOString():cacheUpdatedAt;
        activity.unshift({key:key,added:true,at:at});
      });
      activity=activity.slice(0,20);Object.keys(next).forEach(function(key){seenKeys[key]=true;});
      map=next;applied=true;availabilityOn=true;paint();notify();
    },
    clear:function(){if(retired)return;availabilityOn=false;map=Object.create(null);cacheUpdatedAt=null;activity=[];seenKeys=Object.create(null);changedKeys=[];applied=true;paint();notify();},
    enabled:function(){return on;},
    setEnabled:function(value){if(retired)return;on=!!value;if(on)availabilityOn=true;paint();notify();},
    onDestroy:function(fn){if(typeof fn!=='function')return function(){};if(retired){fn();return function(){};}destroyListeners.push(fn);return function(){var i=destroyListeners.indexOf(fn);if(i>=0)destroyListeners.splice(i,1);};},
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    note:function(text,kind){if(retired)return;noteText=typeof text==='string'?text:'';noteKind=['info','warn','error'].indexOf(kind)>=0?kind:'info';notify();},
    action:function(label,fn){if(retired)return;actionLabel=typeof label==='string'?label:'';actionFn=actionLabel && typeof fn==='function'?fn:null;notify();},
    setDemoControls:function(value){if(retired)return;demoControls=value;notify();},
    status:function(value){setStatus(value);},
    destroy:function(){
      if(retired)return;on=false;paintLanes();retired=true;releaseColors();liveStatusControllers.delete(view);coverageRequest++;if(motion && motion.removeEventListener)motion.removeEventListener('change',motionChanged);releaseBindings();destroyListeners.splice(0).forEach(function(fn){try{fn();}catch(ex){}});close(false);stopTimer();if(abort)abort.abort();if(demoDestroy)demoDestroy();
      if(frame)cancelAnimationFrame(frame);if(firstPaint)cancelAnimationFrame(firstPaint);frame=firstPaint=0;
      if(observer)observer.disconnect();
      bindings.forEach(function(binding){binding.el.removeEventListener('dv:pathrender',schedule);binding.el.removeEventListener('dv:pathchange',schedule);});bindings.forEach(function(binding){if(binding.section.diagram)liveStatusEdgeBreaks(binding.el,binding.section.diagram,{},false);});bindings=[];
      events.forEach(function(type){view.removeEventListener(type,schedule);});if(provider)document.removeEventListener('visibilitychange',visibility);
      if(pop)pop.remove();listeners=[];
      view.querySelectorAll('.dv-live-board-lane').forEach(function(el){el.classList.remove('dv-live-board-lane');});
      view.querySelectorAll('.dv-live-step-tickets,.dv-live-caption').forEach(function(el){el.remove();});
      if(applied || availabilityOn){
        clearTargets();view.querySelectorAll('.dv-live-halo,.dv-live-construction').forEach(function(el){el.remove();});
        view.querySelectorAll('[data-dv-node],[data-dv-edge]').forEach(function(el){if(el._livePulseEnd){el.removeEventListener('animationend',el._livePulseEnd);delete el._livePulseEnd;}});
        view.querySelectorAll('.dv-live-todo,.dv-live-active,.dv-live-done,.dv-live-blocked,.dv-live-missing,.dv-live-unchanged,.dv-live-waiting,.dv-live-stale,.dv-live-changed,.dv-live-unavailable').forEach(function(el){liveStatusClass(el,null);liveStatusWaitingClass(el,null);liveStatusPreset(el,null);el.classList.remove('dv-live-stale','dv-live-changed','dv-live-unavailable','dv-live-reserved','dv-live-blueprint');});
      }
      if(renderOptions && renderOptions.loadDetail===wrappedLoad)renderOptions.loadDetail=originalLoad;
    }
  };
  var releaseColors=options.colorsPreview?function(){}:FlowStatusColors.connect(view,schedule);
  liveStatusControllers.set(view,api);
  connectPanels();
  paint();events.forEach(function(type){view.addEventListener(type,schedule);});
  if(provider){document.addEventListener('visibilitychange',visibility);firstPaint=requestAnimationFrame(function(){firstPaint=requestAnimationFrame(function(){firstPaint=0;fetchMap();});});}
  if(options.demo && typeof options.demo.mount==='function')demoDestroy=options.demo.mount(api);
  return api;
}
