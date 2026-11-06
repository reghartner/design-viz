/* Runtime ticket evidence belongs to this page controller, never the spec.
   Navigation can replace SVGs and step controls independently; source indices
   and section identities keep the paint attached to the authored carriers. */
var LIVE_STATUS_STATES = ['todo','active','testing','done','blocked','missing'];
var LIVE_STATUS_APPEARANCES = LIVE_STATUS_STATES.concat(['unchanged']);
/* Proof presentation consumes one normalized controller snapshot. It neither
   resolves bindings nor judges evidence: proofVerdicts remains the only engine.
   No clock, page walk, queries, or mutations belong in this presentation seam. */
function liveStatusLogDetails(snapshot){
  var out=[];
  if(!snapshot.enabled || snapshot.historical)return out;
  (snapshot.carriers || []).forEach(function(binding){Object.keys(binding.signals || {}).forEach(function(name){
    var signal=binding.signals[name],config=signal.source==='cloudwatchLogs' && signal.query.breakdown;
    if(!config)return;
    var sample=snapshot.map[binding.id],entry=sample && sample.signals[name],details=signal.breakdownError?telemetryLogDetails({status:'error',error:signal.breakdownError}):entry && entry.breakdown;
    out.push({key:JSON.stringify([snapshot.environment,binding.id,name,signal]),id:binding.id,signal:name,title:binding.title || binding.id,
      config:config,scope:telemetrySignalScope(signal),total:telemetryCardValue(binding,sample,name),details:details || null});
  });});
  return out;
}
function liveStatusProofPresentation(snapshot,window){
  if(!snapshot)return null;
  // Map keys, links and markers are not measurements. Use only already-resolved
  // bound carriers/signals, including measured zero and finite series points.
  var observed=snapshot.carriers.some(function(binding){
    if(!snapshot.verdicts.carriers[binding.id].bound)return false;
    var sample=(snapshot.map || {})[binding.id];
    return telemetryMetricNames(binding).some(function(name){
      var entry=sample && sample.signals && sample.signals[name];
      return telemetryObject(entry) && (telemetryNumber(entry.value) || Array.isArray(entry.series) && entry.series.some(telemetryPoint));
    });
  });
  var pending=snapshot.pending || {},querying=snapshot.carriers.some(function(binding){return telemetryMetricNames(binding).some(function(name){return pending[binding.id] && pending[binding.id][name];});});
  if(!observed && !querying)return null;
  var counts=Object.assign({},snapshot.verdicts.rollups),offset=0;
  counts.neutral=counts.bound-counts.proven-counts.degraded-counts.unproven-counts.liveEarly;
  var arcs=['proven','degraded','unproven','liveEarly'].map(function(key){
    var size=counts.bound?100*counts[key]/counts.bound:0,arc={key:key,count:counts[key],size:size,offset:offset};offset+=size;return arc;
  });
  var duration=/^(\d+)([smhdw])$/.exec(window),windowMs=duration?Number(duration[1])*({s:1000,m:60000,h:3600000,d:86400000,w:604800000})[duration[2]]:86400000;
  function number(value){return Number(value.toPrecision(4)).toLocaleString('en-US');}
  function predicate(binding,names){
    var words=[];
    (names || telemetryMetricProofNames(binding)).forEach(function(name){
      var limit=binding.proof[name];if(proofVerdicts.isTraceSignal(binding.signals[name]))return;var unit=binding.signals[name] && binding.signals[name].unit || '';
      if(telemetryNumber(limit.min))words.push(name+' at least '+number(limit.min)+(unit?' '+unit:''));
      if(telemetryNumber(limit.max))words.push(limit.maxRatioOf?name+' no more than '+number(limit.max*100)+'% of '+limit.maxRatioOf:name+' at most '+number(limit.max)+(unit?' '+unit:''));
    });
    return words.length?words.join('; '):'Observed signals; no authored thresholds';
  }
  var rows=snapshot.carriers.filter(function(binding){return snapshot.verdicts.carriers[binding.id].bound;}).map(function(binding){
    var waiting=pending[binding.id] || {},loading=telemetryMetricNames(binding).some(function(name){return waiting[name];}),measured=telemetryMetricNames(binding).some(function(name){return telemetryReading(snapshot.map[binding.id],name).value!==null;});
    var result=snapshot.verdicts.carriers[binding.id],sample=snapshot.map[binding.id],primary=telemetryPrimary(binding,true),queue=binding.kind==='queue';
    var reading=primary?telemetryReading(sample,primary):{series:[]},times=reading.series.map(function(p){return Date.parse(telemetryTime(p[0]));}).filter(isFinite);
    // Each primary signal owns its measurement window. A carrier timestamp may
    // summarize a newer peer and must not clip this signal's older points.
    var entry=sample && sample.signals && sample.signals[primary],explicit=entry && telemetryOwn(entry,'observedAt');
    var end=Date.parse(snapshot.historical?snapshot.at:!entry?null:explicit?entry.observedAt:sample && sample.observedAt);
    if(!isFinite(end) && !explicit && times.length)end=Math.max.apply(null,times);
    var start=end-windowMs,points=reading.series.map(function(p){return {at:Date.parse(telemetryTime(p[0])),value:p[1]};}).filter(function(p){return isFinite(end) && p.at>=start && p.at<=end;}).sort(function(a,b){return a.at-b.at;});
    var markers=(sample && sample.markers || []).filter(function(m){return m.kind==='done' || m.kind==='deploy';}).map(function(m){return {at:Date.parse(m.at),label:m.label || m.kind,kind:m.kind};});
    if(result.since.doneAt)markers.push({at:Date.parse(result.since.doneAt),label:'Done',kind:'done'});
    markers=markers.filter(function(m,i,all){return isFinite(end) && m.at>=start && m.at<=end && !all.slice(0,i).some(function(other){return other.at===m.at && other.kind===m.kind;});});
    var low=points.length?Math.min.apply(null,points.map(function(p){return p.value;})):0,high=points.length?Math.max.apply(null,points.map(function(p){return p.value;})):0;
    var plotted=points.map(function(p){return {x:2+96*(p.at-start)/windowMs,y:high===low?16:28-24*(p.value-low)/(high-low)};});
    // Sparse daily endpoints are dots, never a fictitious continuous sparkline.
    var continuous=points.length>=3 && points.every(function(p,i){return !i || p.at-points[i-1].at<=windowMs/4;});
    var url=null,authored=binding.links || {},provider=sample && sample.links || {};
    [authored.dashboard,authored.query,provider.dashboard,provider.query].some(function(value){url=deltaLinkUrl(value);return !!url;});
    var since=[];if(result.since.doneAt){since.push('Done '+result.since.doneAt);if(result.since.firstTrafficAt)since.push('First observed traffic '+result.since.firstTrafficAt);}
    if(!snapshot.historical && result.since.doneAt)telemetryMetricNames(binding).forEach(function(name){
      var entry=sample && sample.signals && sample.signals[name],aggregate=telemetryAggregate(entry,sample && sample.observedAt);
      if(!aggregate || aggregate.from!==result.since.doneAt)return;
      since.push(name+' total: '+String(entry.value)+(entry.unit?' '+entry.unit:'')+' through '+aggregate.to);
    });
    return {id:binding.id,title:binding.title,kind:binding.kind,tickets:binding.tickets.slice(),jira:result.jira || 'No tickets',
      loading:loading,initialLoading:loading && !measured,telemetry:result.telemetry,verdict:result.verdict,label:loading && !measured?'Loading…':result.label || 'UNOBSERVED',predicate:predicate(binding)+(telemetryCountNote(binding)?' · '+telemetryCountNote(binding):'')+(telemetrySignalScope(binding.signals[primary])?' · '+telemetrySignalScope(binding.signals[primary]):''),failing:result.failing.slice(),
      kpis:[{label:queue?'in':'rate',text:telemetryCardValue(binding,sample,primary,waiting)},
        {label:queue?'lag':'errors',text:telemetryCardValue(binding,sample,queue?'lag':telemetryErrorSignal(binding,primary) || 'errors',waiting)},
        {label:queue?'age':'p95',text:telemetryCardValue(binding,sample,queue?'age':'p95',waiting)}],
      since:since.join(' · ') || 'unavailable',url:url,
      linkLabel:primary && binding.signals[primary].source==='grafana'?'Open in Grafana':primary && binding.signals[primary].source==='honeycomb'?'Open in Honeycomb':'Open telemetry',
      explanation:result.failing.length?'Outside proof threshold: '+result.failing.map(function(name){return name+' is '+telemetryCardValue(binding,sample,name)+'; requires '+predicate(binding,[name]);}).join('. ')+(loading?'. Another query is loading.':''):loading?(measured?'Refreshing queried evidence.':'Waiting for queried evidence.'):
        result.telemetry==='silent'?'No traffic observed in this window.':result.telemetry==='unobserved'?'Evidence is missing or incomplete.':result.telemetry==='unmeasured'?'Traffic proof requires an observed signal with an authored minimum.':'Observed signals meet the authored proof thresholds.',
      chart:{pending:!!waiting[primary],observedAt:isFinite(end)?new Date(end).toISOString():null,points:plotted,line:continuous?plotted.map(function(p){return p.x+','+p.y;}).join(' '):null,
        markers:markers.map(function(m){return {x:2+96*(m.at-start)/windowMs,label:m.label,kind:m.kind};})}};
  });
  var predicates=rows.map(function(row){return row.predicate;}).filter(function(value,i,all){return all.indexOf(value)===i;});
  return {counts:counts,arcs:arcs,rows:rows,window:window,historical:!!snapshot.historical,
    sentence:counts.proven+' of '+counts.bound+' bound carriers proven · '+counts.unproven+' Done carriers unproven · '+counts.unbound+' carriers unbound.',
    predicate:predicates.length===1?predicates[0]:'Proof thresholds are shown for each carrier below.'};
}
/* Runtime Activity consumes only accepted live observations. Reconciliation
   retires binding scopes; reading this log and rendering never emit events. */
function liveStatusTelemetryActivity(){
  var scopes=Object.create(null),events=[];
  function reconcile(carriers){
    var keys=Object.create(null);carriers.forEach(function(binding){if(Object.keys(binding.signals).length)keys[binding.id]=telemetryBindingKey(binding);});
    Object.keys(scopes).forEach(function(id){if(scopes[id].key!==keys[id])delete scopes[id];});
    events=events.filter(function(event){return event.binding===keys[event.carrier];});
  }
  function observe(snapshot){
    reconcile(snapshot.carriers);if(snapshot.historical)return;
    var presentation=liveStatusProofPresentation(snapshot,'24h');if(!presentation)return;
    snapshot.carriers.forEach(function(binding){
      var sample=snapshot.map[binding.id],result=snapshot.verdicts.carriers[binding.id],key=telemetryBindingKey(binding);
      if(!result.bound || !sample)return;
      var measured=telemetryMetricNames(binding).some(function(name){return telemetryReading(sample,name).value!==null;});if(!measured)return;
      var scope=scopes[binding.id] || (scopes[binding.id]={key:key,at:Object.create(null),values:Object.create(null),ratios:Object.create(null),first:Object.create(null),silent:Object.create(null),limits:Object.create(null)});
      function time(name){return telemetrySignalTime(sample.signals && sample.signals[name],sample.observedAt);}
      // Each signal owns its watermark. A newer source on this carrier cannot
      // date another signal's Activity or suppress that signal's next sample.
      function fresh(name){var at=time(name);return !at || scope.at[name]===undefined || Date.parse(at)>scope.at[name];}
      var row=presentation.rows.find(function(row){return row.id===binding.id;});
      function add(kind,text,time,signal){events.unshift({type:'telemetry',kind:kind,carrier:binding.id,binding:key,title:binding.title,text:text,at:time || null,signal:signal || null,url:row.url});}
      var done=result.since.doneAt,first=result.since.firstTrafficAt,primary=telemetryPrimary(binding),reading=telemetryReading(sample,primary),at=time(primary),stamp=at?Date.parse(at):null;
      if(done && !scope.first[done]){
        // The engine supplies actual series traffic; a positive headline is an
        // observation at observedAt, never a fabricated earlier first timestamp.
        var traffic=first || (fresh(primary) && reading.value>0 && stamp!==null && stamp>=Date.parse(done)?at:null);
        // Core first-traffic evidence spans all rate-like signals, not just the
        // chart primary. Keep its actual timestamp and carrier-wide bounds.
        var bound=first?telemetryTime(sample.observedAt):at,boundStamp=bound?Date.parse(bound):null;
        if(traffic && (boundStamp===null || Date.parse(traffic)<=boundStamp)){
          var owns=!first || reading.series.some(function(point){return point[1]>0 && telemetryTime(point[0])===first;});
          scope.first[done]=true;add('first-traffic','First observed traffic after Done',traffic,owns?primary:null);
        }
      }
      if(fresh(primary) && done && !scope.first[done] && result.telemetry==='silent' && stamp!==null && stamp>=Date.parse(done)){
        var hours=Math.floor((stamp-Date.parse(done))/3600000);
        if(scope.silent[done]===undefined || hours>scope.silent[done]){scope.silent[done]=hours;add('silent','Still silent '+hours+' h after Done',at,primary);}
      }
      telemetryMetricProofNames(binding).forEach(function(name){
        var limit=binding.proof[name],reading=telemetryReading(sample,name);
        var crossingAt=time(name);
        if(limit.maxRatioOf){
          // A ratio has two independently clocked inputs. Reuse unchanged
          // accepted measurements, but reject stale or conflicting replays.
          var inputs=[name,limit.maxRatioOf].map(function(dependency){
            return {name:dependency,value:telemetryReading(sample,dependency).value,at:time(dependency)};
          });
          if(inputs.some(function(input){
            var watermark=scope.at[input.name],stamp=input.at?Date.parse(input.at):null;
            return !binding.signals[input.name] || input.value===null || watermark!==undefined &&
              (stamp===null || stamp<watermark || stamp===watermark && input.value!==scope.values[input.name]);
          }))return;
          var prior=scope.ratios[name];
          var changed=inputs.filter(function(input,index){return !prior || input.value!==prior[index].value;});
          scope.ratios[name]=inputs;
          if(prior && !changed.length)return;
          // Only changed values contribute to this crossing; an unchanged
          // newer numerator or an unrelated peer cannot supply its date.
          crossingAt=changed.some(function(input){return !input.at;})?null:changed.map(function(input){return input.at;}).sort().pop();
        }else if(!fresh(name) || reading.value===null)return;
        var failed=result.failing.indexOf(name)>=0,previous=scope.limits[name];
        if(previous!==undefined && previous!==failed)add('threshold',name+' crossed '+(failed?'outside':'back within')+' its proof threshold',crossingAt,name);
        scope.limits[name]=failed;
      });
      telemetryMetricNames(binding).forEach(function(name){var at=time(name);if(at && fresh(name) && telemetryReading(sample,name).value!==null){scope.at[name]=Date.parse(at);scope.values[name]=telemetryReading(sample,name).value;}});
    });
    events=liveStatusActivity([],events);
  }
  function pin(binding,exemplar,at){
    var key=telemetryBindingKey(binding),identity=JSON.stringify([key,exemplar.provider,exemplar.traceId]);
    if(events.some(function(e){return e.carrier===binding.id && e.identity===identity;}))return false;
    var candidate=exemplar.candidates.find(function(c){return c.traceId===exemplar.traceId;});
    events.unshift({type:'telemetry',kind:'trace-pin',carrier:binding.id,binding:key,title:binding.title,identity:identity,
      traceId:exemplar.traceId,provider:exemplar.provider,at:at,traceAt:candidate && candidate.time || exemplar.spans.map(function(s){return s.time;}).sort(function(a,b){return Date.parse(a)-Date.parse(b);})[0] || null,
      text:'Pinned trace '+exemplar.traceId+' as evidence (this session)',url:telemetryTraceUrl(exemplar.url,exemplar.provider)});
    events=liveStatusActivity([],events);return true;
  }
  return {pin:pin,observe:observe,reconcile:reconcile,reconcileTraces:function(snapshot){if(!snapshot.historical)events=events.filter(function(e){return e.kind!=='trace-pin' || snapshot.map[e.carrier] && (snapshot.map[e.carrier].exemplars || []).length;});},retire:function(ids){ids.forEach(function(id){delete scopes[id];});events=events.filter(function(event){return ids.indexOf(event.carrier)<0;});},
    clear:function(){scopes=Object.create(null);events=[];},snapshot:function(){return JSON.parse(JSON.stringify(events));}};
}
function liveStatusActivity(jira,telemetry){
  return jira.concat(telemetry).map(function(item,index){return {item:item,index:index,at:Date.parse(item.at)};}).sort(function(a,b){
    return (isFinite(b.at)?b.at:-Infinity)-(isFinite(a.at)?a.at:-Infinity) || a.index-b.index;
  }).slice(0,20).map(function(entry){return entry.item;});
}
function liveStatusRollup(states){
  states=(states || []).filter(function(state){return LIVE_STATUS_STATES.indexOf(state)>=0;});
  if(!states.length)return null;
  for(var i=0;i<4;i++){var state=['blocked','missing','active','testing'][i];if(states.indexOf(state)>=0)return state;}
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
var LIVE_STATUS_PRESETS = {todo:'slate',active:'azure',testing:'violet',done:'moss',blocked:'rose',missing:'rose',unchanged:'moss'};
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
  for(var i=0;i<4;i++){var state=['blocked','missing','active','testing'][i];if(states.indexOf(state)>=0)return state;}
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
    body=Number(el.getAttribute('data-dv-body-height')) || h-32,active=state==='active' || state==='testing';
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
/* Over time (#1012): a ticket with no status on a past day has the Missing paint, but it is a gap in the
   record, not a blocker. Only the day overlay sets noTicket; a ticket missing today still blocks. */
function liveStatusBlocks(entry){return !!entry && !entry.noTicket && ['blocked','missing'].indexOf(entry.state)>=0;}
function liveStatusWithoutGaps(map){var out=Object.create(null);Object.keys(map).forEach(function(key){if(!map[key].noTicket)out[key]=map[key];});return out;}
function liveStatusBlockingKeys(value,map){
  return trackingRefs(value).tickets.filter(function(key){return liveStatusBlocks(map[key]);});
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
/* X waits on Y while Y is not done, unless X is already active, testing or done (then the
   link is listed but X is not waiting). A blocked or missing X still waits: the
   panel and popover record it, while the canvas keeps X's own stronger paint.
   Tone from the DIRECT upstream: unfinished grey; blocked or missing (including
   no entry) red. */
function liveStatusWaitingTone(state){return state==='blocked' || state==='missing'?'red':'grey';}
function liveStatusUpstreamTone(entry,state){return entry && entry.noTicket?'grey':liveStatusWaitingTone(state);}
function liveStatusTicketWaiting(dependencies,map){
  var out=Object.create(null);
  // An empty map is no evidence at all: nothing waits before the first answer or after clear().
  if(!map || !Object.keys(map).length)return out;
  Object.keys(dependencies || {}).forEach(function(ticket){
    var own=map[ticket] && map[ticket].state;
    if(own==='active' || own==='testing' || own==='done')return;
    var on=[];
    dependencies[ticket].forEach(function(dep){
      var state=map[dep.key] && LIVE_STATUS_STATES.indexOf(map[dep.key].state)>=0?map[dep.key].state:'missing';
      if(state==='done')return;
      on.push({key:dep.key,state:state,tone:liveStatusUpstreamTone(map[dep.key],state)});
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
    if(svg._layoutStatusCoins)svg._layoutStatusCoins();
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
  var text=(state==='active'?'IN PROGRESS':state==='testing'?'TESTING':'TODO')+' · '+keys.length+' tickets';
  if(state==='todo' && waiting){
    var carriers=liveStatusCarrierWaiting(diagram,map,waiting),upstream=[];
    liveStatusStepCarriers(diagram,step,true).forEach(function(carrier){(carriers[carrier.id] ? carriers[carrier.id].keys : []).forEach(function(key){if(upstream.indexOf(key)<0)upstream.push(key);});});
    if(upstream.length)text+=' · waiting on '+upstream.sort().join(', ');
  }
  return text;
}
/* Over time (#929, #1012): one past day over today's map. Status comes from the day and everything
   else stays as of today, so a ticket keeps its row, title and place in the total. A ticket the day
   does not name is Missing, because an uncolored carrier would hide that it did not exist.
   updatedAt is dropped because it describes today, not that day. */
function liveStatusDayMap(today,states){
  var out=Object.create(null);
  Object.keys(today || {}).forEach(function(key){
    var entry=Object.assign({},today[key]),day=states && states[key];
    delete entry.state;delete entry.detail;delete entry.updatedAt;
    if(day && LIVE_STATUS_STATES.indexOf(day.state)>=0){entry.state=day.state;if(typeof day.detail==='string')entry.detail=day.detail;}
    else{entry.state='missing';entry.noTicket=true;entry.detail='No ticket on this day';}
    out[key]=entry;
  });
  return out;
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
/* One host provider loop, shared by the Jira map and the telemetry map (#939).
   start() calls at once (callers defer it past first paint), then every `delay`
   ms while the document is visible; a hidden document pauses the timer and
   becoming visible runs one catch-up call. A request while a call is in flight
   becomes one catch-up after it. stop() aborts the signal handed to `call`,
   retires the timer and the visibility listener, and drops any late answer;
   start() after stop() begins again with a fresh signal. hooks: busy() before
   each call, result(value) and error(error) after it. */
function liveStatusPoller(call,delay,hooks){
  var abort=null,timer=0,pending=false,catchUp=false,running=false,paused=false,generation=0;
  function visible(){return !document.hidden;}
  function stopTimer(){if(timer){clearTimeout(timer);timer=0;}}
  function arm(){stopTimer();if(running && !paused && visible())timer=setTimeout(function(){timer=0;run();},delay);}
  function run(){
    if(!running || paused || !visible())return;
    if(pending){catchUp=true;return;}
    pending=true;stopTimer();var current=generation,signal=abort.signal;hooks.busy();
    Promise.resolve().then(function(){if(current===generation)return call(signal);}).then(function(value){
      if(current===generation)hooks.result(value);
    },function(error){if(current===generation)hooks.error(error);}).then(function(){
      if(current!==generation)return;pending=false;
      if(catchUp && !paused && visible()){catchUp=false;run();}else arm();
    });
  }
  function visibility(){stopTimer();if(visible())run();}
  return {
    pause:function(){paused=true;stopTimer();},
    resume:function(){paused=false;if(running)run();else this.start();},
    start:function(){if(running)return;running=true;paused=false;abort=new AbortController();document.addEventListener('visibilitychange',visibility);run();},
    stop:function(){if(!running)return;running=false;generation++;pending=catchUp=false;stopTimer();document.removeEventListener('visibilitychange',visibility);abort.abort();}
  };
}
function createLiveStatus(ctl,page,options,renderOptions){
  options=options || {};page=page || {};
  var view=ctl.view,authoring=!!(renderOptions && renderOptions.authoring),records=sectionRecords(page),map=Object.create(null),on=true,retired=false,applied=false,availabilityOn=true;
  // #827: the validated edit history rides the snapshot so the edit-history panel can read it through this seam.
  var editHistory=typeof editHistoryEntries==='function'?editHistoryEntries(page):[];
  // #828: the shared-board editor outlives this controller (each edit re-renders the page); Workbench authoring never edits here.
  var editor=!authoring && renderOptions && renderOptions.boardEditor || null;
  function editing(){return !!(editor && editor.state().active);}
  var destroyListeners=[],listeners=[],bindings=[],observer=null,frame=0,firstPaint=0,painting=false;
  var provider=typeof options.provider==='function'?options.provider:null;
  var refresh=Number(options.refreshMs),delay=isFinite(refresh)?Math.max(30000,refresh):30000;
  var noteText='',noteKind='info',actionLabel='',actionFn=null,pop=null,active=null,asked=false,demoControls=null,demoDestroy=null,cacheUpdatedAt=null;
  var activity=[],telemetryActivity=liveStatusTelemetryActivity(),seenKeys=Object.create(null),changedKeys=[],stepHooks=[],coverageRequest=0;
  // Over time (#929): while `over` is set, `map` is the chosen day and `over.live` is the map to return to.
  var overSource=null,over=null,overLoading=false,overProgress='',overError='',overRequest=0;
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
  function motionChanged(){if(motion.matches){view.querySelectorAll('.dv-live-changed').forEach(function(el){el.classList.remove('dv-live-changed');});bindings.forEach(function(b){if(b.stepper && b.stepper.clearTraceTiming)b.stepper.clearTraceTiming();});}}
  if(motion && motion.addEventListener)motion.addEventListener('change',motionChanged);
  var remotePages=Object.create(null),originalLoad=renderOptions && renderOptions.loadDetail,wrappedLoad=null;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function remoteKey(ref){return JSON.stringify([ref.spec,ref.revision || '']);}
  /* Loaded approved details join the same runtime map; they have their own
     page tracking site. The host still owns transport and cancellation. */
  if(typeof originalLoad==='function'){
    wrappedLoad=function(ref,signal){return Promise.resolve(originalLoad(ref,signal)).then(function(raw){
      if(!retired && !signal.aborted){
        var previous=JSON.stringify(refs()),old=remotePages[remoteKey(ref)],retiredIds=[];
        if(old)sectionRecords(old).forEach(function(record){var d=record.section.diagram;if(d){retiredIds=retiredIds.concat(Object.keys(d.nodes || {}),(d.edges || []).map(function(edge){return edge.from+'->'+edge.to;}));}});
        remotePages[remoteKey(ref)]=normalize(raw);telemetry.bindingsChanged(retiredIds);schedule();
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
  /* One walk over every carrier of the root page (resolved imported topology
     included) and its loaded detail pages, in page order: fn(value, id, source).
     refs() and the telemetry bindings (#939) share it. */
  function eachDiagram(fn){sources().forEach(function(source){sectionRecords(source).forEach(function(record){if(record.section.diagram)fn(record.section.diagram,source);});});}
  function eachCarrier(fn){eachDiagram(function(d,source){
    Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,source);});
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge){fn(edge,edge && typeof edge==='object'?edge.from+'->'+edge.to:null,source);});
  });}
  // refs() collects the whole page; refs(key) narrows to the carriers that hold that ticket (their tickets are just the key).
  function refs(key){
    var byKey=typeof key==='string',out={tickets:[],prs:[],epics:[]};
    if(!byKey)sources().forEach(function(source){trackingEpics(source).forEach(function(epic){if(out.epics.indexOf(epic)<0)out.epics.push(epic);});});
    eachCarrier(function(value){
      var found=trackingRefs(value);if(byKey){if(found.tickets.indexOf(key)<0)return;found.tickets=[key];}
      ['tickets','prs'].forEach(function(field){found[field].forEach(function(ref){if(out[field].indexOf(ref)<0)out[field].push(ref);});});
    });
    return out;
  }
  /* ctl.telemetry (#939): the host telemetry provider behind the panel's Metrics
     button, over the same carrier walk. Its changes repaint the canvas cues and
     the panel header. Without a host telemetry option, a Live status demo source
     that carries `telemetry` (the #live=demo player, #944) supplies it as Demo. */
  var telemetryOptions=renderOptions && renderOptions.telemetry===false?false:renderOptions && renderOptions.telemetry || (demoMode && options.telemetry) || null;
  var telemetryDemo=!!(telemetryOptions && (demoMode && telemetryOptions===options.telemetry || telemetryOptions.demo && typeof telemetryOptions.demo.mount==='function'));
  function historyCarriers(fn){
    // Root diagrams plus the mounted drill-down stack. Cached but closed remote
    // pages still contribute Jira refs, but no longer own historical requests.
    var diagrams=[];sectionRecords(page).forEach(function(record){if(record.section.diagram)diagrams.push({diagram:record.section.diagram,page:page});});
    sourceBindings().forEach(function(binding){if(binding.page!==page && binding.section.diagram)diagrams.push({diagram:binding.section.diagram,page:binding.page});});
    diagrams.forEach(function(item){var d=item.diagram;Object.keys(d.nodes || {}).forEach(function(id){fn(d.nodes[id],id,item.page);});
      (d.edges || []).forEach(function(edge){fn(edge,edge.from+'->'+edge.to,item.page);});});
  }
  var telemetryHooks={carriers:eachCarrier,historyCarriers:historyCarriers,diagrams:eachDiagram,jira:function(){return map;},
    observed:telemetryActivity.observe,reset:telemetryActivity.clear,retire:telemetryActivity.retire,
    changed:function(){if(!retired){telemetryActivity.reconcile(telemetry.snapshot().carriers);telemetryActivity.reconcileTraces(telemetry.snapshot());paint();notify();}}};
  var telemetry=createTelemetry(page,telemetryOptions,telemetryHooks);
  ctl.telemetry=telemetry;
  // Metrics canvas cues on every bound section, beside the Jira paint (src/viewer/telemetry.js).
  var metricsPreview=authoring && !!(renderOptions && renderOptions.metricsPreview) && trackingTelemetry(page).enabled;
  function paintMetrics(){
    var metricsView=statusMode==='trace'?null:telemetryHooks.view();
    bindings.forEach(function(binding){
      var scope=binding.el,d=binding.section.diagram;if(!d)return;
      var templates=trackingTelemetry(binding.page).templates;
      telemetryPaintCues(scope,d,templates,metricsView);
      var cardsView=statusMode!=='trace' && metricsPreview && trackingTelemetry(binding.page).enabled?telemetryCardPreview(d,templates):metricsView;
      telemetryPaintCards(scope,d,templates,cardsView,trackingTelemetry(page).window,function(card,path,edge,index){
        if(authoring){
          if(binding.ordinal!=null){card.setAttribute('data-metrics-section',binding.ordinal);card.setAttribute('tabindex','0');card.setAttribute('role','button');card.setAttribute('aria-label',(edge.label || edge.from+' to '+edge.to)+'. Drag metrics card to move. Arrow keys move 10 units; Shift moves 50.');}
          return;
        }
        var previous=path._livePointerTarget || path,c=previous._liveCarrier;
        carrierTarget(card,edge.from+'->'+edge.to,edge,c && c.state,binding.page.tracking,edge.label || edge.from+' → '+edge.to,c && c.waiting,c && c.availability,binding.ordinal!=null?{section:binding.ordinal,kind:'edge',index:index}:null);
        carrierPointer(path,card);carrierPointer(path.closest('svg').querySelector('path.halo[data-dv-edge="'+index+'"]'),card);
      },telemetry.config());
      scope.querySelectorAll('svg').forEach(function(svg){if(svg._layoutStatusCoins)svg._layoutStatusCoins();});
    });
  }
  // A named connector (#943: 'Grafana') reads "<source> connected · <window> window · refreshed <time>".
  var telemetryWindow=trackingTelemetry(page).window;
  function telemetrySource(){
    var source=telemetryOptions && telemetryOptions.source;
    if(typeof source==='function'){try{source=source();}catch(e){source='';}}
    return typeof source==='string'?source.trim():'';
  }
  // Selection belongs to a section object and carrier token, never to a step.
  var statusMode='jira',traceSelection=null,traceInitial=true,traceRequest=0,traceNotice='',traceShow=true,tracePending=null;
  var traceSections=new WeakMap(),traceSectionSerial=0;
  function traceSources(){
    var evidence=telemetry.snapshot(),entries=[],owners=Object.create(null),mounted=sourceBindings(),ambiguous=new Set();
    eachDiagram(function(d,source){Object.keys(d.nodes || {}).concat((d.edges || []).map(function(e){return e.from+'->'+e.to;})).forEach(function(id){if(!owners[id])owners[id]=[];if(owners[id].indexOf(d)<0)owners[id].push(d);});});
    if(evidence.historical)return {entries:[],evidence:evidence};
    mounted.forEach(function(binding){
      var d=binding.section.diagram;if(!d || !trackingTelemetry(binding.page).enabled)return;
      if(!traceSections.has(binding.section))traceSections.set(binding.section,++traceSectionSerial);
      if(!traceSections.has(d))traceSections.set(d,++traceSectionSerial);
      var sectionId=traceSections.get(binding.section)+'/'+traceSections.get(d),seen=new Set();
      Object.keys(d.nodes || {}).concat((d.edges || []).map(function(e){return e.from+'->'+e.to;})).forEach(function(id){
        if(seen.has(id) || !owners[id])return;seen.add(id);if(owners[id].length!==1){if(evidence.map[id] && (evidence.map[id].exemplars || []).length)ambiguous.add(id);return;}
        var sample=evidence.map[id];(sample && sample.exemplars || []).forEach(function(exemplar){
          var key=JSON.stringify([sectionId,id,exemplar.selectionToken]);
          entries.push({key:key,carrier:id,binding:binding,exemplar:exemplar,label:(binding.section.heading || binding.section.id || 'Diagram')+' · '+id});
        });
      });
    });
    return {entries:entries,evidence:evidence,ambiguous:ambiguous.size};
  }
  function traceSnapshot(){
    var source=traceSources(),entries=source.entries,evidence=source.evidence,hasMappings=false;
    eachDiagram(function(d){if((d.steps || []).some(function(step){return !!step.traceMatch;}))hasMappings=true;});
    var hasBindings=evidence.carriers.some(function(binding){return Object.keys(binding.signals).some(function(name){return proofVerdicts.isTraceSignal(binding.signals[name]);});});
    var traceStatus=telemetryOptions && typeof telemetryOptions.traceStatus==='function'?telemetryOptions.traceStatus():{available:evidence.available,note:''};
    var selected=traceSelection && entries.find(function(e){return e.key===traceSelection.key && e.exemplar.traceId===traceSelection.traceId;});
    if(!selected && traceSelection && tracePending && tracePending.request===traceRequest && tracePending.key===traceSelection.key){selected=entries.find(function(e){return e.key===tracePending.key && e.exemplar.traceId===tracePending.traceId;});if(selected)traceSelection.traceId=selected.exemplar.traceId;}
    if(traceSelection && !selected){traceSelection=null;tracePending=null;traceInitial=false;traceRequest++;traceNotice='Trace selection expired. Select current evidence.';}
    if(!selected && traceInitial && statusMode==='trace' && entries.length){selected=entries[0];traceSelection={key:selected.key,traceId:selected.exemplar.traceId};traceInitial=false;}
    var model=selected?telemetryTraceModel(selected.binding.section.diagram,selected.binding.stepper && selected.binding.stepper.path(),selected.exemplar):null;
    return {entries:entries.map(function(e){return {key:e.key,carrier:e.carrier,label:e.label,exemplar:e.exemplar,candidates:e.exemplar.candidates.map(function(c){return Object.assign({},c,{available:c.traceId===e.exemplar.traceId || telemetry.canChooseExemplar(e.carrier,e.exemplar.selectionToken,c.traceId)});})};}),selected:selected?{key:selected.key,carrier:selected.carrier,exemplar:selected.exemplar,model:model}:null,
      hasMappings:hasMappings,hasBindings:hasBindings,historical:evidence.historical,enabled:evidence.enabled,available:traceStatus.available,status:{busy:hasBindings && evidence.status.busy,note:traceStatus.note},notice:[traceNotice,source.ambiguous?'Trace evidence with duplicate carrier IDs across source diagrams is excluded; use unique stable IDs.':''].filter(Boolean).join(' '),show:traceShow};
  }
  function paintTrace(){
    var trace=traceSnapshot(),selected=trace.selected,sources=traceSources().entries;
    bindings.forEach(function(binding){telemetryPaintTrace(binding,statusMode==='trace' && traceShow && selected && traceSelection && sources.some(function(e){return e.key===selected.key && e.binding.section===binding.section && e.binding.el===binding.el;})?selected.model:null);});
  }
  function metricsSnapshot(){
    var evidence=telemetry.snapshot(),status=evidence.status;
    return {environment:evidence.environment,environments:evidence.environments,proof:liveStatusProofPresentation(evidence,telemetryWindow),logDetails:liveStatusLogDetails(evidence),available:status.state!=='absent',enabled:telemetry.enabled(),demo:telemetryDemo,state:status.state,busy:status.busy,
      refreshedAt:status.refreshedAt,note:status.note,checkedText:status.refreshedAt?'refreshed '+clockTime(status.refreshedAt):'',
      source:telemetrySource(),window:telemetryWindow};
  }
  function snapshot(){
    refreshDependencies();
    var coverage=liveStatusCoverage(page,map,refs(),sources()),storyKeys=coverage.onDiagram.concat(coverage.notOnDiagram,dependencyKeys);
    coverage.dependencies=dependencyKeys.slice();
    var counts={todo:0,active:0,testing:0,done:0,blocked:0,missing:0},latest=null,stamp=-Infinity;
    storyKeys.forEach(function(key){var entry=map[key];if(!entry)return;counts[entry.state]++;
      var at=Date.parse(entry.updatedAt);if(isFinite(at) && at>stamp){stamp=at;latest=entry.updatedAt;}
    });
    var pages=laneRecords(),readiness=liveStatusReadiness(page,map,ticketWaiting);
    var initiatives=coverage.initiatives || [],scopeKeys=initiatives.concat(refs().epics.filter(function(key){return initiatives.indexOf(key)<0;}));
    var blocked=storyKeys.filter(function(key){return liveStatusBlocks(map[key]);}).length;
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
      !storyKeys.length?null:storyKeys.some(function(key){return map[key] && map[key].state==='blocked';})?'blocked':storyKeys.every(function(key){return map[key] && map[key].state==='done';})?'done':storyKeys.some(function(key){return map[key] && map[key].state==='testing';})?liveStatusPresentationRollup(storyKeys.map(function(key){return map[key] && map[key].state || 'unknown';})):storyKeys.some(function(key){return !map[key] || map[key].state!=='todo';})?'active':'todo';}
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
      coverage:coverage,readiness:readiness,activity:copy(liveStatusActivity(activity.filter(function(item){return storyKeys.indexOf(item.key)>=0;}),telemetryActivity.snapshot())).map(function(item){item.relative=telemetryTime(item.at)?relative(item.at):'time unavailable';return item;}),
      demo:demoControls?{ended:!!demoControls.ended,first:!demoControls.prev || !!demoControls.first}:null,verdict:verdict,
      overTime:overTimeState(),
      editHistory:copy(editHistory),edit:editState(),
      updatedText:cacheUpdatedAt || latest?'updated '+relative(cacheUpdatedAt || latest):'',
      connection:{state:connection.state,busy:connection.busy,checkedAt:connection.checkedAt,source:connection.source,checkedText:connection.checkedAt?'refreshed '+clockTime(connection.checkedAt):'',github:{state:connection.github.state,busy:connection.github.busy}},
      metrics:metricsSnapshot(),mode:statusMode,trace:traceSnapshot()};
  }
  function editState(){var state=editor?editor.state():null;return state && over && !state.blocked?Object.assign({},state,{blocked:'Editing is off while a past day is shown.'}):state;}
  function overTimeState(){
    if(!overSource)return null;
    var base={active:!!over,loading:overLoading,progress:overProgress,error:overError,available:!!(applied && Object.keys(map).length),disabled:editing()};
    if(!over)return base;
    var days=over.days;base.index=over.index;base.count=days.length;base.first=days[0].short;base.last=days[days.length-1].short;base.label=days[over.index].label;return base;
  }
  function overShow(){map=liveStatusDayMap(over.today,over.days[over.index].states);changedKeys=[];telemetry.historyDay(over.index);paint();notify();telemetryHooks.jiraChanged();}
  // Returning to Live restores the live map, then applies any evidence that arrived meanwhile as a normal refresh.
  function overClose(){
    var left=over;over=null;map=left.live;changedKeys=[];telemetry.closeHistory();
    if(overSource.close)overSource.close();
    if(left.held)api.apply(left.value);else{paint();notify();telemetryHooks.jiraChanged();}
  }
  /* Every provider map, and a history source's today map, passes this one check. */
  function cleanMap(value){
    var next=Object.create(null);
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
    return next;
  }
  function overLoad(request,result){
    if(retired || request!==overRequest)return;overLoading=false;
    var days=result && Array.isArray(result.days)?result.days:[];
    if(!days.length){overError='History could not load. Try Over time again.';notify();return;}
    var index=result.index;if(typeof index!=='number' || index<0 || index>=days.length)index=days.length-1;
    over={live:map,today:result.today?cleanMap(result.today):map,days:days,index:index,held:false,value:null};on=true;availabilityOn=true;telemetry.openHistory(days,index);overShow();
  }
  function hasMissingWork(){return sources().some(function(source){return sectionRecords(source).some(function(record){var d=record.section.diagram || {};return Object.values(d.nodes || {}).some(function(node){return !isTextBoxNode(node) && node.missingWork===true;}) || (d.edges || []).some(function(edge){return edge.missingWork===true;});});});}
  function presentationActive(){return applied || hasMissingWork();}
  function connectPanels(){liveStatusPending.slice().forEach(function(pending){if(liveStatusControllerFor(pending.host)===api)pending.connect(api);});}
  function notify(){connectPanels();var value=snapshot();listeners.slice().forEach(function(fn){fn(value);});}
  function element(tag,cls,text,parent){var el=document.createElement(tag);el.className=cls;if(text!=null)el.textContent=String(text);if(parent)parent.appendChild(el);return el;}
  function link(parent,label,url){var el=element(url?'a':'span','nbacklink',label,parent);if(url){el.setAttribute('href',url);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}return el;}
  function close(focus){
    if(!active)return;
    // #855: closing the post-drop question (Keep, Escape, outside click) keeps the
    // marker; a repaint or a re-render only redraws it, so the question stays pending.
    if(asked && !painting && !retired && editor)editor.endQuestion();
    var trigger=active;active=null;asked=false;
    document.removeEventListener('click',outside,true);document.removeEventListener('keydown',escape,true);
    if(trigger)trigger.setAttribute('aria-expanded','false');
    if(pop){if(pop.hidePopover && pop.matches(':popover-open'))pop.hidePopover();pop.hidden=true;}
    if(focus && trigger && trigger.isConnected)trigger.focus();
  }
  function outside(ev){
    if(active && pop.querySelector('.dv-live-production') && view.contains(ev.target) && ev.target.closest('.dv-live-over-time-slider,.dv-live-step'))return;
    if(active && !active.contains(ev.target) && !pop.contains(ev.target) && carrierFrom(ev.target)!==active)close(true);
  }
  function escape(ev){if(ev.key==='Escape' && active){ev.preventDefault();ev.stopPropagation();close(true);}}
  function productionRow(trigger){
    if(authoring || !trigger || !trigger._liveCarrier)return null;
    var evidence=telemetry.snapshot();if(!liveStatusProofPresentation(evidence,telemetryWindow))return null;
    var id=trigger.getAttribute('data-live-carrier'),scope=bindings.find(function(binding){return binding.el.contains(trigger);});
    if(!scope)return null;
    // Resolve the activated carrier in its own loaded detail/template scope.
    // Display titles can repeat and are never telemetry lookup keys.
    var input=telemetryProofInput(function(fn){fn(trigger._liveCarrier.value,id,scope.page);},function(){},map,evidence.map,evidence.environment);
    evidence.carriers=evidence.carriers.filter(function(binding){return binding.id!==id;}).concat(input.carriers);
    evidence.verdicts=proofVerdicts({carriers:evidence.carriers,jiraMap:map,telemetryMap:evidence.map});
    var proof=liveStatusProofPresentation(evidence,telemetryWindow);
    return proof && proof.rows.find(function(row){return row.id===id;}) || null;
  }
  function paintProduction(trigger){
    var row=productionRow(trigger),block=pop.querySelector('.dv-live-production');
    if(!row){if(block)block.remove();return false;}
    if(!block)block=element('section','dv-live-production',null,pop);
    block.setAttribute('data-loading',row.initialLoading?'true':'false');block.setAttribute('data-production-carrier',row.id);block.setAttribute('data-verdict',row.verdict || 'unobserved');
    function text(tag,cls,value){var node=block.querySelector('.'+cls);if(!node)node=element(tag,cls,null,block);if(node.textContent!==value)node.textContent=value;return node;}
    var environment=telemetry.environment();
    text('h3','dv-live-production-heading',(environment?environment.toUpperCase()+' ':'')+'Evidence');
    text('p','dv-live-production-verdict',row.label+' · '+row.explanation);
    text('p','dv-live-proof-predicate',row.predicate);
    var chart=block.querySelector('.dv-live-production-chart') || element('div','dv-live-production-chart',null,block);chart.replaceChildren();
    if(row.chart.points.length || row.chart.markers.length){
      var svg=telemetrySvg(document,'svg',{class:'dv-live-proof-sparkline',viewBox:'0 0 100 32',role:'img','aria-label':telemetryWindow+' window: '+row.chart.points.length+' observed points'},chart);
      if(row.chart.line)telemetrySvg(document,'polyline',{class:'dv-live-proof-series',points:row.chart.line},svg);
      row.chart.points.forEach(function(point){telemetrySvg(document,'circle',{class:'dv-live-proof-point',cx:point.x,cy:point.y,r:1.8},svg);});
      row.chart.markers.forEach(function(marker){var tick=telemetrySvg(document,'line',{class:'dv-live-proof-marker',x1:marker.x,x2:marker.x,y1:2,y2:30,'data-kind':marker.kind},svg);telemetrySvg(document,'title',{},tick).textContent=marker.label;});
    }else element('span','',row.chart.pending?'Loading…':'No observed series in this window',chart);
    var kpis=block.querySelector('.dv-live-production-kpis') || element('div','dv-live-production-kpis',null,block);
    row.kpis.forEach(function(kpi,i){var tile=kpis.children[i] || element('div','dv-live-production-kpi',null,kpis);tile.textContent=kpi.label+': '+kpi.text;});
    text('p','dv-live-production-since','Since Done: '+row.since);
    var anchor=block.querySelector('.dv-live-production-link');
    if(row.url){if(!anchor){anchor=link(block,'',row.url);anchor.classList.add('dv-live-production-link');anchor.innerHTML=FlowIcons.render('external-link',{className:'dv-live-pr-icon',monochrome:true});element('span','',null,anchor);}anchor.setAttribute('href',row.url);anchor.querySelector('span').textContent=row.linkLabel;}
    else if(anchor){var root=pop.getRootNode();if(root.activeElement===anchor)pop.querySelector('.node-link-close').focus({preventScroll:true});anchor.remove();}
    return true;
  }
  function refreshPopover(){
    if(!active || !pop)return;
    var hadProduction=!!pop.querySelector('.dv-live-production');
    if(!paintProduction(active) && hadProduction){close(true);return;}
    pop.querySelectorAll('.dv-live-ticket[data-live-ticket]').forEach(function(row){
      var entry=map[row.getAttribute('data-live-ticket')],pill=row.querySelector('.dv-live-ticket-state');
      if(pill){pill.textContent=entry?entry.state:'No status';liveStatusClass(pill,entry?entry.state:null);}
    });
    active.setAttribute('aria-expanded','true');
  }
  function show(trigger,value,tracking,label,waiting,availability,ref,asking){
    if(retired)return;
    if(active===trigger){close(true);return;}close(false);
    if(!pop){pop=element('div','nbackpop dv-live-popover',null,view);pop.setAttribute('role','dialog');pop.setAttribute('popover','manual');pop.hidden=true;}
    pop.replaceChildren();pop.setAttribute('aria-label',(trackingRefs(value).tickets.length?'Live tickets for ':'Work status for ')+label);
    element('strong','node-link-title','Work status · '+label,pop);
    var dismiss=element('button','node-link-close','×',pop);dismiss.type='button';dismiss.setAttribute('aria-label','Close live tickets');dismiss.addEventListener('click',function(){close(true);});
    var found=trackingRefs(value);
    if(value && value.missingWork===true)element('p','dv-live-coverage-detail','Missing work: additional work remains without a linked ticket. Clear this Missing work marker when covered.',pop);
    else if(!found.tickets.length)element('p','dv-live-coverage-detail','No change needed: no linked tickets or missing-work marker.',pop);
    // #855 Edit mode: clear a marker set on this board; an inherited one names its source diagram.
    var marker=ref && editing() && value && value.missingWork===true?editor.missingWork(ref):null;
    if(asking && !(marker && marker.clearable)){editor.endQuestion();asking=null;}
    if(marker && !marker.clearable)element('p','dv-live-missing-source','Missing work comes from the source diagram "'+marker.source+'" and must be cleared there.',pop);
    if(marker && marker.clearable){
      var choice=element('div','dv-live-clear',null,pop);
      if(asking)element('p','dv-live-question','Does '+asking.ticket+' cover the missing work?',choice);
      var clear=element('button','reader-button dv-live-clear-missing','Clear Missing work',choice);clear.type='button';
      clear.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();editor.endQuestion();close(false);setTimeout(function(){editor.clearMissingWork(ref);},0);});
      if(asking){
        var keep=element('button','reader-button dv-live-keep','Keep',choice);keep.type='button';
        keep.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();close(true);});
      }
    }
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
    // Edit mode: Remove only for tickets authored on this carrier, never for availability causes or provider-inherited ones.
    var removable=ref && editing()?editor.removable(ref):[];
    found.tickets.forEach(function(key){
      var entry=map[key],row=element('div','dv-live-ticket',null,pop);row.setAttribute('data-live-ticket',key);
      if(removable.indexOf(key)>=0){
        var remove=element('button','reader-button dv-live-remove','Remove',row);remove.type='button';remove.setAttribute('aria-label','Remove '+key+' from '+label);
        remove.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();close(false);setTimeout(function(){editor.remove(ref,key);},0);});
      }
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
    paintProduction(trigger);
    active=trigger;asked=!!(asking && marker && marker.clearable);trigger.setAttribute('aria-expanded','true');pop.hidden=false;if(pop.showPopover)pop.showPopover();
    var rect=trigger.getBoundingClientRect();
    pop.style.left=Math.max(8,Math.min(window.innerWidth-pop.offsetWidth-8,rect.left))+'px';
    pop.style.top=Math.max(8,Math.min(window.innerHeight-pop.offsetHeight-8,rect.bottom+6))+'px';
    dismiss.focus({preventScroll:true});document.addEventListener('click',outside,true);document.addEventListener('keydown',escape,true);
  }
  /* Cards and edge labels remain the single keyboard ticket triggers. Small
     Jira cues are pointer aliases, never an additional status badge or tab stop.
     Pointer aliases on the line, halo and live break share the label's button
     (the path or visible live break when unlabelled), so each edge has just
     one keyboard stop. In
     the reader the trigger is a named button reached by Tab; under authoring
     the Workbench owns carrier clicks, selection and focus, so the trigger
     stays inert and the Tickets table remains the route to the popover. */
  var CARRIER_ATTRS=['role','tabindex','aria-label','aria-haspopup','aria-expanded'];
  function carrierTarget(el,id,value,state,tracking,label,waiting,availability,ref){
    if(!el._liveSaved){el._liveSaved={};CARRIER_ATTRS.forEach(function(name){el._liveSaved[name]=el.getAttribute(name);});}
    el.classList.add('dv-live-target');el.setAttribute('data-live-carrier',id);
    el._liveCarrier={value:value,state:state,tracking:tracking,label:label,waiting:waiting,availability:availability,ref:ref || null};
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
    view.querySelectorAll('.dv-jira-cue').forEach(function(el){el.remove();});
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
  function openCarrier(el,asking){var c=el._liveCarrier;show(el,c.value,c.tracking,c.label,c.waiting,c.availability,c.ref,asking);}
  /* #855: the drop re-renders the page, so the post-drop question is the editor's
     until answered; each paint reopens it on the carrier's popover. */
  function askPending(){
    var q=editing() && editor.question();if(!q || asked)return;
    var el=Array.prototype.find.call(view.querySelectorAll('.dv-live-target'),function(candidate){
      var r=candidate._liveCarrier && candidate._liveCarrier.ref;
      return !!r && r.section===q.ref.section && r.kind===q.ref.kind && (r.kind==='node'?r.id===q.ref.id:r.index===q.ref.index);
    });
    if(!el)return;
    if(active)close(false);
    openCarrier(el,q);
  }
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
  /* #828 Edit mode drop targets: a Tickets row dragged onto a node card or an
     edge (line, halo, label, live break or its Jira cue) adds its key to that
     carrier of this page. Detail pages loaded from other specs are not editable. */
  var EDIT_TICKET_TYPE='application/x-flowview-ticket',dropOver=null;
  function dropRef(target){
    if(!editing() || !target || !target.closest)return null;
    var inside=bindings.filter(function(binding){return binding.ordinal!=null && binding.el.contains(target);});
    var binding=inside.filter(function(candidate){return !inside.some(function(other){return other!==candidate && candidate.el.contains(other.el);});})[0];
    if(!binding)return null;
    var node=target.closest('g.node[data-dv-node]');
    if(node && binding.el.contains(node))return node.classList.contains('node-text')?null:{el:node,ref:{section:binding.ordinal,kind:'node',id:node.getAttribute('data-dv-node')}};
    var edge=target.closest('[data-dv-edge]'),index=edge?Number(edge.getAttribute('data-dv-edge')):NaN;
    if(!edge || !binding.el.contains(edge) || !isFinite(index))return null;
    var svg=edge.closest('svg');
    return {el:svg && svg.querySelector('path.edge[data-dv-edge="'+index+'"]') || edge,ref:{section:binding.ordinal,kind:'edge',index:index}};
  }
  function setDropOver(el){if(dropOver===el)return;if(dropOver)dropOver.classList.remove('dv-edit-over');dropOver=el;if(el)el.classList.add('dv-edit-over');}
  function carriesTicket(ev){return !!(ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [],EDIT_TICKET_TYPE)>=0);}
  function dragOver(ev){
    if(!carriesTicket(ev))return;
    var hit=dropRef(ev.target);setDropOver(hit && hit.el);if(!hit)return;
    ev.preventDefault();ev.dataTransfer.dropEffect='copy';
  }
  function dragLeave(ev){var hit=dropRef(ev.relatedTarget);if(!hit || hit.el!==dropOver)setDropOver(null);}
  function drop(ev){
    if(!carriesTicket(ev))return;
    var hit=dropRef(ev.target);setDropOver(null);if(!hit)return;
    ev.preventDefault();
    var key=ev.dataTransfer.getData(EDIT_TICKET_TYPE);if(!trackingKeyPattern.test(key))return;
    // The editor re-renders the page; leave this event's dispatch first.
    setTimeout(function(){if(editor)editor.add(hit.ref,key);},0);
  }
  if(editor){
    view.addEventListener('dragover',dragOver);view.addEventListener('dragleave',dragLeave);view.addEventListener('drop',drop);
    var offEditor=editor.onChange(function(){if(!retired){paint();notify();}});
    destroyListeners.push(function(){offEditor();setDropOver(null);view.removeEventListener('dragover',dragOver);view.removeEventListener('dragleave',dragLeave);view.removeEventListener('drop',drop);});
  }
  function sourceBindings(){
    var found=[];
    ctl.sections.forEach(function(rec){var index=records.findIndex(function(r){return r.reference===rec.reference;});if(index>=0)found.push({el:rec.sectionEl,section:records[index].section,page:page,stepper:rec.stepper,ordinal:index});});
    var saved=ctl.details && ctl.details.snapshot(),activeSections=ctl.details && ctl.details.activeSections();
    if(saved && activeSections){
      var currentPage=page,record=detailSection(page,saved.section),section=record && record.section;
      saved.frames.forEach(function(savedFrame,index){
        var node=section && section.diagram && section.diagram.nodes[savedFrame.node],detail=node && node.detail;
        if(!detail){section=null;return;}
        if(detail.spec)currentPage=remotePages[remoteKey(detail)];
        var target=currentPage && (detail.section?detailSection(currentPage,detail.section):sectionRecords(currentPage).find(function(r){return r.section.diagram;}));
        section=target && target.section;
        var rec=activeSections[index+1],ordinal=currentPage===page?records.findIndex(function(r){return r.section===section;}):-1;
        if(section && rec)found.push({el:rec.sectionEl,section:section,page:currentPage,stepper:rec.stepper,ordinal:ordinal>=0?ordinal:null});
      });
    }
    return found;
  }
  function decorateCarrier(el,value,tracking){
    var keys=trackingRefs(value).tickets,media=reducedMotion(),paintOn=statusMode!=='trace' && on;
    el.classList.toggle('dv-live-stale',paintOn && keys.some(function(key){return liveStatusStale(map[key],Date.now(),tracking && tracking.staleDays);}));
    if(!paintOn || !keys.some(function(key){return map[key];}) || (media && media.matches)){el.classList.remove('dv-live-changed');return;}
    if(!el.classList.contains('node') && !el.classList.contains('edge'))return;
    if(!keys.some(function(key){return changedKeys.indexOf(key)>=0;}))return;
    el.classList.remove('dv-live-changed');
    // Restart only for new evidence; navigation and identical maps never pulse.
    if(el.getBoundingClientRect)el.getBoundingClientRect();
    el.classList.add('dv-live-changed');
    if(!el._livePulseEnd){el._livePulseEnd=function(ev){if(!ev.animationName || ev.animationName==='dvnodepulse'){el.classList.remove('dv-live-changed');}};el.addEventListener('animationend',el._livePulseEnd);}
  }
  function pinTrace(id,exemplar){
    var snapshot=telemetry.snapshot(),sample=snapshot.map[id],binding=snapshot.carriers.find(function(c){return c.id===id;});
    if(retired || snapshot.historical || !binding || !sample || !(sample.exemplars || []).some(function(e){return e.traceId===exemplar.traceId && e.selectionToken===exemplar.selectionToken;}))return false;
    var added=telemetryActivity.pin(binding,exemplar,new Date().toISOString());notify();return added;
  }
  function paintStory(binding){
    var stepper=binding.stepper,d=binding.section.diagram,scope=binding.el;
    scope.querySelectorAll('.dv-live-caption').forEach(function(el){el.remove();});
    if(statusMode==='trace'){scope.querySelectorAll('.dv-live-step-tickets,.dv-proof-caption').forEach(function(el){el.remove();});telemetryClearStep(scope);return;}
    var step=on && stepper && stepper.mode()==='step' && (d.steps || [])[stepper.sourceIndex()];
    var host=step && scope.querySelector('.termbar .step-text'),keys=step?liveStatusStepTickets(d,step,true):[];
    var row=host && host.querySelector('.dv-live-step-tickets');
    scope.querySelectorAll('.dv-live-step-tickets').forEach(function(el){if(el!==row || !keys.length)el.remove();});
    if(!host){telemetryPaintStep(binding,telemetry.snapshot(),map,on);return;}
    if(keys.length){
      var tickets=keys.map(function(key){return {key:key,url:liveStatusTicketURL(binding.page.tracking,key,map[key],liveStatusPageTicketURL(binding.page,key))};});
      var signature=JSON.stringify(tickets);
      // Keep keyboard focus on an unchanged link when fresh status arrives.
      if(!row || row._liveStepTickets!==signature){
        if(row)row.remove();
        row=element('span','dv-live-step-tickets','',host);row.setAttribute('role','group');row.setAttribute('aria-label','Jira tickets for this step');
        tickets.forEach(function(ticket){var item=element('span','dv-live-step-ticket','',row);link(item,ticket.key,ticket.url);element('span','dv-live-state-pill dv-live-step-state','',item);});row._liveStepTickets=signature;
      }
      var labels={todo:'To do',active:'In progress',testing:'Testing',done:'Done',blocked:'Blocked',missing:'Missing'};
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
    telemetryPaintStep(binding,telemetry.snapshot(),map,on);
  }
  function laneLabel(id,source){return ((source.lanes || {})[id] || {}).label || id;}
  function laneRecords(){
    return [page].concat(Object.keys(remotePages).map(function(key){return remotePages[key];})).map(function(source){
      return {page:source,lanes:liveStatusLanes(source,map)};
    });
  }
  function paintLanes(){
    var on=statusMode!=='trace' && api.enabled();
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
    var evidence=liveStatusWithoutGaps(map),activeStepper=ctl.activeStepper && ctl.activeStepper(),candidates=bindings.filter(function(binding){return binding.stepper && (!activeStepper || binding.stepper===activeStepper);});
    for(var b=0;b<candidates.length;b++){
      var binding=candidates[b],stepper=binding.stepper,d=binding.section.diagram;
      var path=diagramPathList(d).find(function(path){return path.id===stepper.path();});
      var index=path && path.indices.find(function(index){return ['blocked','missing'].indexOf(liveStatusStep(d,d.steps[index],evidence))>=0;});
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
    return coverage.onDiagram.concat(coverage.notOnDiagram,dependencyKeys).filter(function(key){return liveStatusBlocks(map[key]);}).map(function(key){
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
    var carriers=Object.create(null),rank=['blocked','missing','active','testing','todo','done'];
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
        return {key:dep.key,state:state,tone:state==='done'?'done':liveStatusUpstreamTone(up,state),sources:dep.sources.slice(),linkType:dep.linkType || '',reason:dep.reason || '',url:liveStatusTicketURL(source.tracking,dep.key,up,liveStatusPageTicketURL(source,dep.key))};
      });
      return {key:key,url:liveStatusTicketURL(source.tracking,key,entry,liveStatusPageTicketURL(source,key)),title:entry.title || '—',state:entry.state || 'No status',
        owner:entry.assignee || 'Unassigned',ownerUrl:entry.assignee?liveStatusOwnerURL(source.tracking,entry):null,dependsOn:dependsOn,waiting:ticketWaiting[key]?ticketWaiting[key].tone:null,
        epicLabel:entry.epic && ((coverage.initiatives || []).length || coverage.epics.indexOf(entry.epic)<0)?'epic '+entry.epic:'',
        prs:entry.prs?copy(entry.prs):null,urls:urls,laneColor:laneColor,
        carriers:owners.map(function(carrier){var route=carrierRoute(carrier),mounted=carrierBinding(carrier);
          return {id:carrier.id,label:carrier.label,reference:carrier.reference,pageKey:carrier.pageKey || '',
            disabled:!on || (!mounted && (!route || (route.frames.length && (!ctl.details || !ctl.details.restore)))),
            title:!mounted?'Detail page: '+(carrier.section.heading || carrier.reference):''};
        }),tag:linked.indexOf(key)>=0?'DEPENDENCY ONLY':!owners.length?'NOT ON DIAGRAM':coverage.notInEpic.indexOf(key)>=0?(coverage.initiatives?'NOT IN PARENT INITIATIVE':'NOT IN PARENT EPIC'):''};
    });
  }
  /* Jira is a link affordance, independent of provider evidence and Live paint.
     Reserve the complete 22-unit pointer area. Candidates follow the measured
     route (including reversed/vertical curves), then search farther off it;
     nodes prefer an inside corner and fall back just outside a crowded corner. */
  function paintJiraCues(scope,d){
    scope.querySelectorAll('svg').forEach(function(svg){
      var obstacles=[];
      svg.querySelectorAll('.node .card,.node .icbg,.node use,.node image,.node text,.handoff-stripe,.nlink,.nbackref,.detail-trigger,.handoff-link,[data-dv-handoff],.dvdelta,.node-review-badge,.coin,.coin-base,.comm-break,text.lbl,.dv-metrics-card-box').forEach(function(el){
        var box=boardControlBox(el,svg);if(box)obstacles.push({el:el,box:box});
      });
      function free(point,ignore){
        return !obstacles.some(function(item){var b=item.box;return item.el!==ignore && boardBoxesOverlap({x:point.x-13,y:point.y-13,w:26,h:26},b);});
      }
      // If even the bounded local search is crowded, keep the link discoverable
      // in clear space beside the drawing; frame expansion includes that slot.
      function overflow(point){
        return {x:obstacles.reduce(function(right,item){return Math.max(right,item.box.x+item.box.w+14);},point.x),y:point.y};
      }
      function cue(parent,target,value,point,local){
        var tickets=trackingRefs(value).tickets;if(!tickets.length || !point)return;
        var marker=document.createElementNS(SVGNS,'g');marker.setAttribute('class','dv-jira-cue'+(tickets.length>1?' dv-jira-stack':''));
        marker.setAttribute('transform','translate('+(point.x-(local?local.x:0))+' '+(point.y-(local?local.y:0))+')');
        marker.setAttribute('aria-hidden','true');marker.setAttribute('data-jira-carrier',target.getAttribute('data-live-carrier') || value.from+'->'+value.to);
        if(parent===svg)marker.setAttribute('data-dv-edge',target.getAttribute('data-dv-edge'));
        function add(tag,attrs){var el=document.createElementNS(SVGNS,tag);Object.keys(attrs).forEach(function(key){el.setAttribute(key,attrs[key]);});marker.appendChild(el);return el;}
        add('rect',{'class':'dv-jira-hit',x:-11,y:-11,width:22,height:22,rx:5});
        if(tickets.length>1)add('use',{'class':'dv-jira-back',href:'#i-jira',x:-3,y:-9,width:12,height:12});
        add('use',{'class':'dv-jira-icon',href:'#i-jira',x:tickets.length>1?-8:-6,y:tickets.length>1?-4:-6,width:12,height:12});
        add('title',{}).textContent='Jira · '+tickets.join(', ');
        parent.appendChild(marker);
        // A handoff owns its whole card; keep its link and keyboard action intact.
        // Only these cards transfer the ticket button to the separate Jira cue.
        if(target.closest('.handoff-link')){
          var carrier=target._liveCarrier,id=target.getAttribute('data-live-carrier');clearTarget(target);
          if(carrier){marker.removeAttribute('aria-hidden');carrierTarget(marker,id,carrier.value,carrier.state,carrier.tracking,carrier.label,carrier.waiting,carrier.availability,carrier.ref);}
        }else carrierPointer(marker,target);
        obstacles.push({el:marker,box:{x:point.x-11,y:point.y-11,w:22,h:22}});
      }
      svg.querySelectorAll('g.node[data-dv-node]:not(.node-text)').forEach(function(node){
        var value=(d.nodes || {})[node.getAttribute('data-dv-node')],card=node.querySelector('.card'),box=boardControlBox(card,svg);
        if(!box || !trackingRefs(value).tickets.length)return;
        var point=null,candidates=[{x:box.x+box.w-13,y:box.y+13},{x:box.x+box.w-13,y:box.y+box.h-13},{x:box.x+13,y:box.y+13},{x:box.x+13,y:box.y+box.h-13}];
        for(var ring=1;ring<=32;ring++){
          var gap=13+ring*24;
          candidates.push({x:box.x+box.w+gap-24,y:box.y+13},{x:box.x+box.w-13,y:box.y-gap+24},{x:box.x+box.w-13,y:box.y+box.h+gap-24},{x:box.x-gap+24,y:box.y+13});
        }
        point=candidates.find(function(p){return free(p,card);}) || overflow(candidates[0]);
        cue(node,card,value,point,{x:box.x,y:box.y});
      });
      svg.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
        var value=(d.edges || [])[Number(path.getAttribute('data-dv-edge'))];
        if(!trackingRefs(value).tickets.length || path.closest('.dv-fragment-hidden') || value.hidden===true)return;
        var length=path.getTotalLength(),point=null;
        for(var ring=0;ring<32 && !point;ring++){
          var offset=16+ring*24;
          [.5,.35,.65,.2,.8].some(function(fraction){
            var at=length*fraction,p=path.getPointAtLength(at),a=path.getPointAtLength(Math.max(0,at-2)),b=path.getPointAtLength(Math.min(length,at+2)),dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1;
            return [-1,1].some(function(side){var candidate={x:p.x-side*dy/n*offset,y:p.y+side*dx/n*offset};if(!free(candidate))return false;point=candidate;return true;});
          });
        }
        var markerTarget=path._livePointerTarget || path;
        cue(svg,markerTarget,value,point || overflow(path.getPointAtLength(length/2)));
      });
      if(svg._refreshStatusFrame)svg._refreshStatusFrame();
    });
  }
  function paintBinding(binding){
    var on=statusMode!=='trace' && api.enabled();
    var scope=binding.el,d=binding.section.diagram;if(!d)return;
    var waiting=on?liveStatusCarrierWaiting(d,map,ticketWaiting):{},coverageActive=presentationActive();
    scope.querySelectorAll('g.node[data-dv-node]').forEach(function(el){
      var id=el.getAttribute('data-dv-node'),value=(d.nodes || {})[id],state=on && availabilityOn && !el.classList.contains('node-text')?(coverageActive?liveStatusPresentation(value,map):liveStatusCarrier(value,map)):null;
      // A blocked or missing carrier keeps its own paint (solid or dotted rose): the stronger state wins
      // over the dashed waiting stroke; the popover and panel still record what it waits on.
      var unavailable=on && availabilityOn?liveStatusAvailability(value,map):null;liveStatusAvailabilityClass(el,unavailable);
      var waits=waiting[id],painted=state==='blocked' || state==='missing'?null:waits;decorateCarrier(el,el.classList.contains('node-text')?null:value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,painted);
      // Waiting tone wears the upstream's preset: slate while unfinished, rose when blocked or missing.
      liveStatusPreset(el,unavailable?(state==='active'?'azure':state==='testing'?'violet':state==='blocked' || state==='missing'?'rose':'slate'):painted?(painted.tone==='red'?'rose':'slate'):state?LIVE_STATUS_PRESETS[state]:null);
      liveStatusNodeConstruction(el,value,state,unavailable);
      if(statusMode==='trace')return;
      if(!state && !waits && !unavailable && !trackingRefs(value).tickets.length)return;
      var card=el.querySelector('.card');if(!card)return;
      if(state || waits || unavailable){var halo=card.cloneNode(false);halo.setAttribute('class','dv-live-halo');halo.removeAttribute('id');halo.setAttribute('aria-hidden','true');el.insertBefore(halo,el.firstChild);}
      carrierTarget(card,id,value,state,binding.page.tracking,value.title || id,waits,unavailable,binding.ordinal!=null?{section:binding.ordinal,kind:'node',id:id}:null);
    });
    scope.querySelectorAll('path.edge[data-dv-edge],path.halo[data-dv-edge],text.lbl[data-dv-edge]').forEach(function(el){
      var index=Number(el.getAttribute('data-dv-edge')),value=(d.edges || [])[index],state=on?liveStatusEdgePresentation(value,map,availabilityOn):null;
      var unavailable=on && availabilityOn?liveStatusAvailability(value,map,d):null;liveStatusAvailabilityClass(el,unavailable);
      var waits=value && waiting[value.from+'->'+value.to],painted=state==='blocked' || state==='missing'?null:waits;decorateCarrier(el,value,binding.page.tracking);liveStatusClass(el,state);liveStatusWaitingClass(el,painted);
      if(statusMode==='trace')return;
      if((!state && !waits && !unavailable && !trackingRefs(value).tickets.length) || !el.classList.contains('edge'))return;
      var svg=el.closest('svg'),label=svg.querySelector('text.lbl[data-dv-edge="'+index+'"]');
      var target=carrierTarget(label || el,value.from+'->'+value.to,value,state,binding.page.tracking,value.label || value.from+' → '+value.to,waits,unavailable,binding.ordinal!=null?{section:binding.ordinal,kind:'edge',index:index}:null);
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
        target=carrierTarget(el,path.getAttribute('data-live-carrier'),carrier.value,carrier.state,carrier.tracking,carrier.label,carrier.waiting,carrier.availability,carrier.ref);
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
    releaseBindings();var previous=bindings;bindings=sourceBindings();
    previous.forEach(function(old){if(!bindings.some(function(b){return b.el===old.el && b.stepper===old.stepper;})){telemetryClearStep(old.el);telemetryClearTrace(old.el);}});
    bindings.forEach(function(binding){
      ['dv:pathrender','dv:pathchange','dv:stepchange'].forEach(function(type){binding.el.addEventListener(type,schedule);});
      if(binding.stepper && binding.stepper.onBeforeAdvance)stepHooks.push(binding.stepper.onBeforeAdvance(function(index){
        var d=binding.section.diagram,state=statusMode!=='trace' && on && liveStatusStep(d,d.steps[index],map);
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
      var focusRoot=typeof view.getRootNode==='function'?view.getRootNode():view.ownerDocument;
      var focused=focusRoot && focusRoot.activeElement,focusCarrier=focused && focused.classList && focused.classList.contains('dv-live-target') && focused.getAttribute('data-live-carrier'),focusBinding=focusCarrier && bindings.find(function(binding){return binding.el.contains(focused);});
      var openId=active && active.getAttribute('data-live-carrier'),openBinding=active && bindings.find(function(binding){return binding.el.contains(active);});
      if(asked || active && !pop.querySelector('.dv-live-production'))close(false);syncBindings();clearTargets();refreshDependencies();
      if(applied || availabilityOn || refs().tickets.length){
        view.querySelectorAll('.dv-live-halo').forEach(function(el){el.remove();});
        bindings.forEach(paintBinding);
      }
      bindings.forEach(paintStory);paintLanes();paintMetrics();paintTrace();
      // Paint Jira cues once, after cards and coins reserve their final boxes.
      // Handoffs transfer their ticket target from the card to the cue; a second
      // cue paint would discard that target after its source has been cleared.
      bindings.forEach(function(binding){if(statusMode!=='trace' && binding.section.diagram)paintJiraCues(binding.el,binding.section.diagram);});
      view.querySelectorAll('.dv-edit-target').forEach(function(el){el.classList.remove('dv-edit-target');});
      if(editing())bindings.forEach(function(binding){if(binding.ordinal!=null)binding.el.querySelectorAll('g.node[data-dv-node]:not(.node-text),path.edge[data-dv-edge]').forEach(function(el){el.classList.add('dv-edit-target');});});
      if(focusBinding){var replacement=Array.from(focusBinding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===focusCarrier && !el.classList.contains('dv-metrics-label-hidden');});if(replacement)replacement.focus({preventScroll:true});}
      if(active){
        var target=openBinding && openBinding.el.isConnected && Array.from(openBinding.el.querySelectorAll('.dv-live-target')).find(function(el){return el.getAttribute('data-live-carrier')===openId && !el.classList.contains('dv-metrics-label-hidden');});
        if(target){active=target;refreshPopover();}else close(false);
      }
      changedKeys=[];
    }finally{
      painting=false;if(!retired)observeBindings();
    }
    if(!retired && editor)askPending();
  }
  function schedule(){if(retired || painting || frame)return;frame=requestAnimationFrame(function(){frame=0;paint();notify();});}
  /* Last-refresh stamp in the viewer's local clock (Chuck, 2026-11-02): a relative
     "just now" froze between repaints. The date is added only when it is not today. */
  function clockTime(at){var d=new Date(at);if(!isFinite(d.getTime()))return '';var time=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});
    return d.toDateString()===new Date().toDateString()?time:d.toLocaleDateString([],{month:'short',day:'numeric'})+' '+time;}
  function relative(at){var seconds=Math.max(0,Math.floor((Date.now()-Date.parse(at))/1000));return seconds<60?'just now':seconds<3600?Math.floor(seconds/60)+'m ago':seconds<86400?Math.floor(seconds/3600)+'h ago':Math.floor(seconds/86400)+'d ago';}
  var poller=provider?liveStatusPoller(function(signal){return provider(refs(),signal);},delay,{
    busy:function(){setStatus({busy:true});},
    result:function(value){api.apply(value);if(noteKind==='error')api.note('','info');setStatus({state:demoMode?'demo':'connected',busy:false,checkedAt:Date.now()});},
    error:function(error){api.note(error && error.message || String(error),'error');setStatus({state:'error',busy:false});}
  }):null;
  function historyDetailChanged(){if(!retired)telemetry.bindingsChanged();}
  view.addEventListener('detail-navigation',historyDetailChanged);
  destroyListeners.push(function(){view.removeEventListener('detail-navigation',historyDetailChanged);});
  var events=['reader-skin-change','diagram-tab-change','tab-view-change','diagram-view-change','navigation-mounted','detail-navigation'];
  var api={
    refs:refs,
    snapshot:snapshot,
    setStatusMode:function(mode){if(retired || ['jira','trace'].indexOf(mode)<0)return;statusMode=mode;close(false);paint();notify();},
    setTraceShow:function(value){if(retired)return;traceShow=!!value;paint();notify();},
    chooseTrace:async function(choice){
      if(retired || statusMode!=='trace')return;
      var entry=traceSources().entries.find(function(e){return e.key===choice.key;});if(!entry)return;
      var request=++traceRequest;tracePending=null;traceInitial=false;traceNotice='';
      if(choice.traceId===entry.exemplar.traceId){traceSelection={key:entry.key,traceId:choice.traceId};paint();notify();return;}
      if(!telemetry.canChooseExemplar(entry.carrier,entry.exemplar.selectionToken,choice.traceId))return;
      tracePending={request:request,key:entry.key,traceId:choice.traceId};traceNotice='Loading selected trace…';notify();
      try{await telemetry.chooseExemplar(entry.carrier,entry.exemplar.selectionToken,choice.traceId);if(retired || request!==traceRequest)return;traceSelection={key:entry.key,traceId:choice.traceId};traceNotice='';}
      catch(ex){if(retired || request!==traceRequest)return;traceNotice=ex.message;}
      tracePending=null;paint();notify();
    },
    pinSelectedTrace:function(){var selected=traceSnapshot().selected;if(selected){traceNotice=pinTrace(selected.carrier,selected.exemplar)?'Pinned in this session’s Activity.':'Already pinned in this session’s Activity.';notify();}},
    firstBlocker:jumpFirstBlocker,
    focusCarrier:showCarrier,
    runAction:function(){if(!retired && actionFn)actionFn();},
    prevDemo:function(){if(!retired && demoControls && demoControls.prev)demoControls.prev();},
    nextDemo:function(){if(!retired && demoControls)demoControls.next();},
    state:function(ref){return map[ref]?copy(map[ref]):null;},
    apply:function(value){
      if(retired)return;
      // A past day is on screen: this evidence waits for the return to Live.
      if(over){over.held=true;over.value=value;return;}
      if(editor)editor.rememberMap(value);
      var next=cleanMap(value);
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
      map=next;applied=true;availabilityOn=true;paint();notify();telemetryHooks.jiraChanged();
    },
    setHistory:function(source){if(retired)return;if(over)overClose();overRequest++;overLoading=false;overError='';overSource=source && typeof source.load==='function'?source:null;notify();},
    // The reader's click is the only thing that loads history.
    overTime:function(){
      if(retired || overLoading || over)return;
      if(!overSource || !applied || !Object.keys(map).length || editing())return;
      var request=++overRequest;overLoading=true;overError='';overProgress='';notify();
      Promise.resolve().then(function(){return overSource.load(function(done,total){if(!retired && request===overRequest){overProgress=done+' of '+total;notify();}});}).then(function(result){overLoad(request,result);},function(){overLoad(request,null);});
    },
    overTimeClose:function(){if(!retired && over)overClose();},
    overTimeStep:function(delta){if(!retired && over)api.overTimeDay(over.index+delta);},
    overTimeDay:function(index){
      if(retired || !over || typeof index!=='number' || !isFinite(index) || Math.floor(index)!==index)return;
      index=Math.max(0,Math.min(over.days.length-1,index));if(index===over.index)return;
      over.index=index;if(overSource.day)overSource.day(index);overShow();
    },
    clear:function(){if(retired)return;overRequest++;overLoading=false;overError='';if(over){over=null;telemetry.closeHistory();if(overSource.close)overSource.close();}availabilityOn=false;map=Object.create(null);cacheUpdatedAt=null;activity=[];seenKeys=Object.create(null);changedKeys=[];applied=true;paint();notify();telemetryHooks.jiraChanged();},
    enabled:function(){return on;},
    setEnabled:function(value){if(retired)return;on=!!value;if(on)availabilityOn=true;paint();notify();},
    // The panel's Metrics button (#939); Jira Live above is independent of it.
    setMetricsEnvironment:function(value){if(!retired)telemetry.setEnvironment(value);},
    setMetricsEnabled:function(value){if(!retired)telemetry.setEnabled(value);},
    // The same controller as ctl.telemetry, so a demo player mounted on this API can feed it.
    telemetry:telemetry,
    onDestroy:function(fn){if(typeof fn!=='function')return function(){};if(retired){fn();return function(){};}destroyListeners.push(fn);return function(){var i=destroyListeners.indexOf(fn);if(i>=0)destroyListeners.splice(i,1);};},
    onChange:function(fn){if(typeof fn!=='function' || retired)return function(){};listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    note:function(text,kind){if(retired)return;noteText=typeof text==='string'?text:'';noteKind=['info','warn','error'].indexOf(kind)>=0?kind:'info';notify();},
    action:function(label,fn){if(retired)return;actionLabel=typeof label==='string'?label:'';actionFn=actionLabel && typeof fn==='function'?fn:null;notify();},
    setDemoControls:function(value){if(retired)return;demoControls=value;notify();},
    status:function(value){setStatus(value);},
    editStart:function(){if(!retired && editor && !over)editor.start();},
    editDone:function(){if(!retired && editor)editor.done();},
    editSave:function(){if(!retired && editor)editor.save();},
    editDiscard:function(){if(!retired && editor)editor.discard();},
    destroy:function(){
      if(retired)return;on=false;paintLanes();retired=true;bindings.forEach(function(b){telemetryClearStep(b.el);telemetryClearTrace(b.el);b.el.querySelectorAll('.dv-proof-caption').forEach(function(el){el.remove();});});releaseColors();liveStatusControllers.delete(view);coverageRequest++;if(motion && motion.removeEventListener)motion.removeEventListener('change',motionChanged);releaseBindings();destroyListeners.splice(0).forEach(function(fn){try{fn();}catch(ex){}});close(false);if(poller)poller.stop();telemetry.destroy();telemetryClearCues(view);telemetryClearCards(view);if(demoDestroy)demoDestroy();
      if(frame)cancelAnimationFrame(frame);if(firstPaint)cancelAnimationFrame(firstPaint);frame=firstPaint=0;
      if(observer)observer.disconnect();
      bindings.forEach(function(binding){binding.el.removeEventListener('dv:pathrender',schedule);binding.el.removeEventListener('dv:pathchange',schedule);});bindings.forEach(function(binding){if(binding.section.diagram)liveStatusEdgeBreaks(binding.el,binding.section.diagram,{},false);});bindings=[];
      events.forEach(function(type){view.removeEventListener(type,schedule);});
      if(pop)pop.remove();listeners=[];
      view.querySelectorAll('.dv-live-board-lane').forEach(function(el){el.classList.remove('dv-live-board-lane');});
      view.querySelectorAll('.dv-live-step-tickets,.dv-live-caption').forEach(function(el){el.remove();});
      if(applied || availabilityOn || refs().tickets.length){
        clearTargets();view.querySelectorAll('.dv-live-halo,.dv-live-construction').forEach(function(el){el.remove();});
        view.querySelectorAll('[data-dv-node],[data-dv-edge]').forEach(function(el){if(el._livePulseEnd){el.removeEventListener('animationend',el._livePulseEnd);delete el._livePulseEnd;}});
        view.querySelectorAll('.dv-live-todo,.dv-live-active,.dv-live-testing,.dv-live-done,.dv-live-blocked,.dv-live-missing,.dv-live-unchanged,.dv-live-waiting,.dv-live-stale,.dv-live-changed,.dv-live-unavailable').forEach(function(el){liveStatusClass(el,null);liveStatusWaitingClass(el,null);liveStatusPreset(el,null);el.classList.remove('dv-live-stale','dv-live-changed','dv-live-unavailable','dv-live-reserved','dv-live-blueprint');});
      }
      if(renderOptions && renderOptions.loadDetail===wrappedLoad)renderOptions.loadDetail=originalLoad;
    }
  };
  var releaseColors=options.colorsPreview?function(){}:FlowStatusColors.connect(view,schedule);
  liveStatusControllers.set(view,api);
  connectPanels();
  paint();events.forEach(function(type){view.addEventListener(type,schedule);});
  var metricFonts=view.ownerDocument && view.ownerDocument.fonts;
  function metricsFontsChanged(){if(!retired && (telemetry.enabled() || metricsPreview))schedule();}
  if(metricFonts && metricFonts.ready)metricFonts.ready.then(metricsFontsChanged);
  if(metricFonts && metricFonts.addEventListener){metricFonts.addEventListener('loadingdone',metricsFontsChanged);destroyListeners.push(function(){metricFonts.removeEventListener('loadingdone',metricsFontsChanged);});}
  // An edit re-renders the page: the new controller starts from the last live map so colors never reset.
  if(editor && editor.lastMap())api.apply(editor.lastMap());
  if(poller)firstPaint=requestAnimationFrame(function(){firstPaint=requestAnimationFrame(function(){firstPaint=0;poller.start();});});
  if(options.demo && typeof options.demo.mount==='function')demoDestroy=options.demo.mount(api);
  return api;
}
