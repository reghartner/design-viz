/* Runtime step evidence. All identities are resolved within this source section
   and selected path; a duplicate step ID elsewhere is never consulted. */
function telemetryStepModel(diagram,index,pathId,page,snapshot,jiraMap,jiraOn){
  var step=(diagram.steps || [])[index];if(!step || !snapshot)return null;
  var direct=liveStatusStepCarriers(diagram,step,true),templates=telemetryTemplates()(page),narrowed=trackingStepProofTickets(diagram,step,page);
  // A step ticketFilter (#1103) narrows the Jira half of this step's verdict too.
  var carriers=direct.map(function(c){var b=carrierTelemetry(c.value,templates);return {id:c.id,tickets:jiraOn?(narrowed?narrowed[c.id]:trackingRefs(c.value).tickets):[],kind:b && b.kind,signals:b?b.signals:{},proof:b?b.proof:{}};});
  var proof=proofVerdicts({carriers:carriers,jiraMap:jiraMap,telemetryMap:snapshot.map,steps:[{id:'current',carriers:carriers.map(function(c){return c.id;})}]});
  var measured=carriers.some(function(c){return telemetryMetricNames(c).some(function(n){return telemetryReading(snapshot.map[c.id],n).value!==null;});});
  // Primary is the first directly selected carrier in the existing carrier walk
  // (edges, then explicit nodes), not whichever happens to return a trace.
  var primary=direct[0],binding=primary && carrierTelemetry(primary.value,templates),sample=primary && snapshot.map[primary.id];
  var headline=binding?telemetryCardContent(primary.value,binding,sample,proof.carriers[primary.id],trackingTelemetry(page).window):null;
  var caption=measured?[proof.steps.current.label].concat(headline?[headline.headline].concat(headline.details.filter(function(v){return !/unobserved|not bound/.test(v);})):[]).filter(Boolean).join(' · '):'';
  return {caption:caption,verdict:proof.steps.current.verdict,primary:primary && primary.id};
}

function telemetryClearStep(scope){
  var state=scope._telemetryStep;if(!state)return;
  state.stepper.clearTraceTiming();state.card.remove();delete scope._telemetryStep;
}
function telemetryPaintStep(binding,snapshot,jiraMap,jiraOn){
  var scope=binding.el,stepper=binding.stepper,d=binding.section.diagram;
  scope.querySelectorAll('.dv-proof-caption').forEach(function(el){el.remove();});
  var model=stepper && stepper.mode()==='step' && trackingTelemetry(binding.page).enabled?telemetryStepModel(d,stepper.sourceIndex(),stepper.path(),binding.page,snapshot,jiraMap,jiraOn):null;
  var bar=scope.querySelector('.termbar'),host=bar && bar.querySelector('.step-text');
  if(model && model.caption && host){var caption=host.ownerDocument.createElement('span');caption.className='dv-proof-caption';caption.textContent=' · '+model.caption;caption.setAttribute('data-verdict',model.verdict || '');host.appendChild(caption);}
  // Trace evidence belongs to the Status panel, never to step navigation.
  telemetryClearStep(scope);
}

/* Read-only mapping for one selected trace and one exact source section/path.
   The controller owns selection and lifetime; this model never fetches. */
// Display precision is independent of the raw provider evidence. Keep tiny
// positive values distinct from zero, and expose exact milliseconds accessibly.
function telemetryTraceDuration(ms){
  if(ms>0 && ms<.01)return '<0.01 ms';
  return Number(ms.toFixed(ms<10?2:ms<1000?1:0)).toLocaleString('en-US')+' ms';
}
function telemetryTraceModel(diagram,pathId,exemplar){
  var mapping=null,warning='';
  try{
    if(!exemplar.spans.length)throw new Error('Trace timeline unavailable.');
    var normalized={spans:exemplar.spans.map(function(s){return {id:s.id,parentId:s.parentId,serviceName:s.service,operation:s.name,startMs:s.startMs,durationMs:s.ms,error:s.error,statusCode:s.attributes['http.response.status_code'] || s.attributes['http.status_code'],attributes:s.attributes,links:s.links.filter(function(l){return l.traceId===exemplar.traceId;}).map(function(l){return l.spanId;})};}),warnings:exemplar.warnings};
    mapping=FlowTraceMatch.mapTrace(diagram,normalized,diagram.paths && diagram.paths.length?pathId:undefined);
  }catch(ex){warning=ex.message;}
  var nodes=Object.create(null),edges=Object.create(null),rows=[];
  if(mapping)mapping.steps.forEach(function(match){
    var step=(diagram.steps || []).find(function(s){return s.id===match.stepId;}),selector=FlowTraceMatch.selector(step,match) || {},keys=stepDeliveredKeys(step);
    var exact=(diagram.edges || []).filter(function(e){return keys.indexOf(e.from+'->'+e.to)>=0 && (!match.nodeId || e.to===match.nodeId);});
    var duration=match.status==='matched'?Math.max.apply(null,match.spans.map(function(s){return s.durationMs;})):null;
    var kinds=match.conditions.map(function(c){return c.kind;}),tone=match.status!=='matched'?'unknown':kinds.some(function(k){return k==='service-error' || k==='delivery-failed';})?'error':kinds.some(function(k){return ['slow','database-slow','queue-buildup','backpressure'].indexOf(k)>=0;})?'warning':'observed';
    var label=match.status==='matched'?telemetryTraceDuration(duration):match.status==='missing'?'Not observed':match.status==='ambiguous'?'Ambiguous':'Unmapped';
    // The step's other traceMatch alternatives, never the one behind this row. "seen" =
    // a span with that service and operation is in this trace: an alternative after the
    // matched one is not tried; one before it was rejected (ambiguous, parent, occurrence).
    var others=Array.isArray(step.traceMatch)?step.traceMatch.filter(function(a,i){return a && i!==match.alternative;}).map(function(a){
      return {name:a.serviceName+' '+a.operation,seen:normalized.spans.some(function(s){return s.serviceName===a.serviceName && s.operation===a.operation && (!a.namespace || s.attributes['service.namespace']===a.namespace) && Object.keys(a.attributes || {}).every(function(k){return s.attributes[k]===a.attributes[k];});})};
    }):[];
    var row={id:match.stepId,nodeId:match.nodeId,edgeIndex:exact.length===1?diagram.edges.indexOf(exact[0]):null,status:match.status,tone:tone,duration:duration,budget:selector.maxDurationMs,label:label,operation:selector.operation || step.text || step.id,service:selector.serviceName,alternative:match.alternative,optional:!!match.optional,otherAlternatives:others,detail:match.detail,conditions:match.conditions,spanIds:match.spans.map(function(s){return s.id;}),
      intervals:match.spans.map(function(s){return {id:s.id,startMs:s.startMs,durationMs:s.durationMs};})};rows.push(row);
    // Only explicit stable node IDs and a uniquely delivered edge may annotate
    // the canvas. A service name or display title is never a join key.
    if(match.nodeId && diagram.nodes[match.nodeId]){if(!nodes[match.nodeId])nodes[match.nodeId]=[];nodes[match.nodeId].push(row);}
    if(match.status==='matched' && exact.length===1){var key=exact[0].from+'->'+exact[0].to;if(!edges[key])edges[key]=[];edges[key].push(row);}
  });
  // Multiple authored steps claiming one edge cannot supply one exact duration.
  Object.keys(edges).forEach(function(key){if(edges[key].length!==1)delete edges[key];});
  var parents=Object.create(null);(exemplar.spans || []).forEach(function(s){parents[s.id]=s.parentId || null;});
  return {mapping:mapping,warning:warning,rows:rows,nodes:nodes,edges:edges,parents:parents};
}
/* #1185: each trace carrier's highlight level against the focused span: "current" (the focused
   span's step), "above" (an ancestor span's), "below" (a descendant span's) or "other". With no
   span focused every carrier is "below". A carrier takes its highest level (current, above,
   below, other) and the worst tone of its matched rows at that level. */
function telemetryTraceLevels(model,focus){
  var parents=model.parents || {},children=Object.create(null),above=Object.create(null),below=Object.create(null),focused=focus && focus.spanId,current=focus && focus.choice && focus.choice.row;
  Object.keys(parents).forEach(function(id){var p=parents[id];if(p)(children[p]=children[p] || []).push(id);});
  if(focused){
    for(var p=parents[focused];p && !above[p];p=parents[p])above[p]=true;
    var queue=(children[focused] || []).slice();
    while(queue.length){var id=queue.shift();if(below[id])continue;below[id]=true;queue=queue.concat(children[id] || []);}
  }
  var ranks={other:0,below:1,above:2,current:3},tones={unknown:0,observed:1,warning:2,error:3};
  function rowLevel(row){
    if(!focused)return 'below';
    if(current?row.id===current.id:row.spanIds.indexOf(focused)>=0)return 'current';
    if(row.spanIds.some(function(id){return above[id];}))return 'above';
    return row.spanIds.some(function(id){return below[id];})?'below':'other';
  }
  function carrier(rows){
    var best=null;
    rows.forEach(function(row){if(row.status!=='matched')return;var level=rowLevel(row);
      if(!best || ranks[level]>ranks[best.level])best={level:level,tone:row.tone};
      else if(level===best.level && tones[row.tone]>tones[best.tone])best.tone=row.tone;});
    return best;
  }
  var out={nodes:Object.create(null),edges:Object.create(null)};
  Object.keys(model.nodes).forEach(function(id){var c=carrier(model.nodes[id]);if(c)out.nodes[id]=c;});
  Object.keys(model.edges).forEach(function(key){var rows=model.edges[key],c=carrier(rows);if(c && rows[0].edgeIndex!=null)out.edges[rows[0].edgeIndex]=c;});
  return out;
}
/* Span navigation considers every authored path in this exact diagram. A shared
   step keeps its current path; without that context the reader chooses a path.
   Ambiguous match rows always require a deliberate choice, even a single row. */
function telemetryTraceChoices(diagram,pathId,exemplar,spanId){
  var choices=[];
  diagramPathList(diagram).forEach(function(path){
    var model=telemetryTraceModel(diagram,path.id,exemplar);
    model.rows.forEach(function(row){
      if(row.spanIds.indexOf(spanId)<0)return;
      var resolved=resolveSourceStep(diagram,path.id,row.id);
      if(!resolved || resolved.sourceIndex<0)return;
      var caption=String(diagram.steps[resolved.sourceIndex].text || row.operation).replace(/\s+/g,' ').trim();
      if(caption.length>96)caption=caption.slice(0,95)+'…';
      choices.push({key:JSON.stringify([path.id,row.id]),pathId:path.id,pathLabel:path.label,stepId:row.id,sourceIndex:resolved.sourceIndex,
        label:'Step '+(resolved.pathIndex+1)+': '+caption+' · '+path.label,row:row});
    });
  });
  return choices.filter(function(choice){return choice.pathId===pathId || !choices.some(function(other){return other.stepId===choice.stepId && other.pathId===pathId;});});
}
function telemetryClearTrace(scope){
  scope.querySelectorAll('.dv-trace-overlay,.dv-trace-focus-overlay,.dv-trace-edge-focus').forEach(function(el){el.remove();});
  scope.querySelectorAll('[data-trace-focus]').forEach(function(el){el.removeAttribute('data-trace-focus');});
  scope.querySelectorAll('[data-trace-tone]').forEach(function(el){el.removeAttribute('data-trace-tone');el.removeAttribute('data-trace-status');});
  scope.querySelectorAll('[data-trace-level]').forEach(function(el){el.removeAttribute('data-trace-level');});
}
/* Keep larger evidence text inside the existing SVG clip. This is transient
   label placement, never a viewBox/camera mutation. Prefer the authored route's
   other side before clamping an edge label into its bounded canvas. */
/* keepBelow (node labels, #1185): never lift the label up into its own card. A label that then
   runs past the frame's bottom is fitted by the status frame refresh, which grows the frame. */
function telemetryTraceConstrainLabel(text,alternatives,keepBelow){
  var svg=text.closest('svg');if(!svg || !svg.viewBox || !svg.getCTM || !text.getCTM)return;
  var frame=svg.viewBox.baseVal,pad=4,box=boardControlBox(text,svg);if(!box)return;
  function fits(b){return b.x>=frame.x+pad && b.y>=frame.y+pad && b.x+b.w<=frame.x+frame.width-pad && b.y+b.h<=frame.y+frame.height-pad;}
  if(fits(box))return;
  var original={x:text.getAttribute('x'),y:text.getAttribute('y')};
  for(var i=0;i<(alternatives || []).length;i++){
    text.setAttribute('x',alternatives[i].x);text.setAttribute('y',alternatives[i].y);box=boardControlBox(text,svg);
    if(box && fits(box))return;
  }
  text.setAttribute('x',original.x);text.setAttribute('y',original.y);box=boardControlBox(text,svg);if(!box)return;
  var dx=Math.max(frame.x+pad-box.x,Math.min(0,frame.x+frame.width-pad-box.x-box.w));
  var dy=Math.max(frame.y+pad-box.y,Math.min(0,frame.y+frame.height-pad-box.y-box.h));if(keepBelow)dy=Math.max(dy,0);
  var root=svg.getCTM(),local=text.getCTM();if(!root || !local)return;
  var inverse=root.inverse().multiply(local).inverse();
  text.setAttribute('x',Number(original.x)+inverse.a*dx+inverse.c*dy);text.setAttribute('y',Number(original.y)+inverse.b*dx+inverse.d*dy);
}
/* #1195: a trace label never sits on a connection (edge) label. The obstacles are measured once per
   paint: connection labels (also those a metric card hides, which show again when Metrics turns off),
   node cards, step coins and the trace labels already placed. A label is moved to the first clear spot
   among its candidate moves, inside the frame (4-unit pad). With none, it keeps its place, gets an
   opaque plate in the board ground colour and is raised above the connection labels. Connection
   labels never move. */
function telemetryTraceObstacles(svg){
  var out={connections:[],others:[]};
  svg.querySelectorAll('text.lbl').forEach(function(el){var b=boardControlBox(el,svg);if(b)out.connections.push(b);});
  svg.querySelectorAll('.node .card,.node .text-box-hit,g.coin').forEach(function(el){var b=boardControlBox(el,svg);if(b)out.others.push(b);});
  return out;
}
function telemetryTraceAvoidConnections(text,obstacles,moves){
  var svg=text.closest('svg');if(!svg || !svg.getCTM || !text.getCTM || !svg.viewBox || !obstacles)return;
  var box=boardControlBox(text,svg);if(!box)return;
  function onConnection(b){return obstacles.connections.some(function(c){return boardBoxesOverlap(b,c,2);});}
  if(!onConnection(box)){obstacles.others.push(box);return;}
  var frame=svg.viewBox.baseVal,pad=4,root=svg.getCTM(),local=text.getCTM();if(!root || !local)return;
  var inverse=root.inverse().multiply(local).inverse(),x=Number(text.getAttribute('x')),y=Number(text.getAttribute('y'));
  for(var i=0;i<moves.length;i++){
    var m=moves[i],next={x:box.x+m.dx,y:box.y+m.dy,w:box.w,h:box.h};
    if(next.x<frame.x+pad || next.x+next.w>frame.x+frame.width-pad || next.y<frame.y+pad || onConnection(next) || obstacles.others.some(function(o){return boardBoxesOverlap(next,o,2);}))continue;
    text.setAttribute('x',x+inverse.a*m.dx+inverse.c*m.dy);text.setAttribute('y',y+inverse.b*m.dx+inverse.d*m.dy);obstacles.others.push(next);return;
  }
  var group=text.parentNode,own=text.getBBox(),doc=text.ownerDocument,plate=doc.createElementNS('http://www.w3.org/2000/svg','rect');
  // Padded so text laid out again at another board scale (a few percent wider) stays on it. Plated
  // labels are not rechecked on a scale change; this padding is their only guard.
  plate.setAttribute('class','dv-trace-label-plate');plate.setAttribute('x',own.x-6);plate.setAttribute('y',own.y-2);plate.setAttribute('width',own.width+12);plate.setAttribute('height',own.height+4);plate.setAttribute('rx',3);
  group.insertBefore(plate,text);
  // Above every connection label: the top of the svg, in the same place.
  var placed=svg.getCTM().inverse().multiply(group.getCTM());
  // Out of g.node it keeps the node's step dimming through data-trace-lit (style: .stepmode rule).
  if(group.parentNode.matches && group.parentNode.matches('g.node')){group.setAttribute('data-trace-node',group.parentNode.getAttribute('data-dv-node'));group.setAttribute('data-trace-lit',String(group.parentNode.classList.contains('lit')));}
  group.setAttribute('transform','matrix('+[placed.a,placed.b,placed.c,placed.d,placed.e,placed.f].join(' ')+')');svg.appendChild(group);obstacles.others.push(box);
}
/* Time for one node's or edge's rows: each matched span counts its own start to
   end (its child spans included); several spans count the union of their
   intervals, so nested or overlapping spans are counted once. */
function telemetryTraceSpanTime(rows){
  var seen=Object.create(null),spans=[];
  rows.forEach(function(r){if(r.status==='matched')(r.intervals || []).forEach(function(s){if(!seen[s.id] && Number.isFinite(s.startMs) && Number.isFinite(s.durationMs)){seen[s.id]=true;spans.push(s);}});});
  if(!spans.length)return '';
  spans.sort(function(a,b){return a.startMs-b.startMs;});
  var total=0,start=spans[0].startMs,end=start+spans[0].durationMs;
  spans.slice(1).forEach(function(s){if(s.startMs>end){total+=end-start;start=s.startMs;}end=Math.max(end,s.startMs+s.durationMs);});
  return telemetryTraceDuration(total+end-start)+(spans.length>1?' across '+spans.length+' spans':'');
}
function telemetryTraceLabel(listed){
  // #1175: an optional step missing from this trace is left out of the label; the title lists it.
  var rows=listed.filter(function(r){return !r.optional;}),time=telemetryTraceSpanTime(rows),one=rows.length===1 && rows[0];
  function count(status,word){var n=rows.filter(function(r){return r.status===status;}).length;return n?n+' '+word:'';}
  function named(r){return r.alternative!=null && r.status==='matched'?'Matched: '+r.service+' '+r.operation:r.operation;}
  // On the canvas the service and operation are cut to 40 characters; the title keeps them whole.
  var name=one && one.service+' '+one.operation,text=one && one.status!=='matched'?one.label:one?[one.alternative!=null?'Matched: '+(name.length>40?name.slice(0,39)+'…':name):'',time || one.label].filter(Boolean).join(' · '):
    [rows.length+' operations',count('missing','unknown'),count('ambiguous','ambiguous'),time].filter(Boolean).join(' · ');
  var title=listed.map(function(r){
    var others=r.otherAlternatives || [],absent=others.filter(function(a){return !a.seen;}),unused=others.filter(function(a){return a.seen;});
    return [r.optional?'optional, not in this trace: '+r.service+' '+r.operation:named(r)+': '+(r.duration!=null?r.duration+' ms':r.label)+(r.budget!=null?' / '+r.budget+' ms budget':'')].concat(r.conditions.map(function(c){return c.label;}),
      absent.length?['not in this trace: '+absent.map(function(a){return a.name;}).join(', ')]:[],unused.length?['in this trace, not matched: '+unused.map(function(a){return a.name;}).join(', ')]:[]).join('; ');
  }).join(' · ')+(time?' · Time '+time+': each matched span counts start to end, including its child spans; overlapping spans count once.':'');
  return {text:text,title:title};
}
function telemetryPaintTrace(binding,model,focus){
  var scope=binding.el,d=binding.section.diagram;telemetryClearTrace(scope);if(!model)return;
  var levels=telemetryTraceLevels(model,focus),obstacleSets=[];
  function obstacles(svg){var hit=obstacleSets.find(function(o){return o.svg===svg;});if(!hit){hit={svg:svg,value:telemetryTraceObstacles(svg)};obstacleSets.push(hit);}return hit.value;}
  // Node labels: down first (up to 32), then sideways (up to 72 each way).
  var nodeMoves=[];for(var k=1;k<=8;k++)nodeMoves.push({dx:0,dy:k*4});[1,-1].forEach(function(side){for(var k=1;k<=6;k++)nodeMoves.push({dx:side*k*12,dy:0});});
  function counted(rows){return rows.filter(function(r){return !r.optional;});}
  function mark(target,rows,x,y,level){
    var ranks={unknown:0,observed:1,warning:2,error:3},tone=counted(rows).reduce(function(a,r){return ranks[r.tone]>ranks[a]?r.tone:a;},'unknown');
    target.setAttribute('data-trace-tone',tone);target.setAttribute('data-trace-status',counted(rows).map(function(r){return r.status;}).join(' '));
    var doc=target.ownerDocument,g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','dv-trace-overlay');g.setAttribute('data-tone',tone);g.setAttribute('pointer-events','none');
    var label=telemetryTraceLabel(rows),text=doc.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',x);text.setAttribute('y',y);text.setAttribute('text-anchor','middle');text.textContent=label.text+(tone==='error'?' · error':tone==='warning'?' · warning':'');g.appendChild(text);
    var title=doc.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=label.title;g.appendChild(title);
    if(level){g.setAttribute('data-trace-level',level.level);target.setAttribute('data-trace-level',level.level);}
    if(target.matches('path.edge'))g.setAttribute('data-trace-edge',target.getAttribute('data-dv-edge'));
    var parent=target.matches('g.node')?target:target.parentNode;if(!target.matches('g.node') && target.getAttribute('transform')!=null)g.setAttribute('transform',target.getAttribute('transform'));g.setAttribute('role','img');g.setAttribute('aria-label',title.textContent);parent.appendChild(g);return text;
  }
  scope.querySelectorAll('g.node[data-dv-node]:not(.node-text)').forEach(function(node){var rows=model.nodes[node.getAttribute('data-dv-node')],card=node.querySelector('.card');if(!rows || !counted(rows).length || !card)return;var box=card.getBBox();var level=levels.nodes[node.getAttribute('data-dv-node')],text=mark(node,rows,box.x+box.width/2,box.y+box.height+24,level);telemetryTraceConstrainLabel(text,null,true);var svg=text.closest('svg');
    // Sideways moves keep the whole label within its card's width; with no legal move it is plated.
    var half=text.getBBox().width/2;if(svg)telemetryTraceAvoidConnections(text,obstacles(svg),nodeMoves.filter(function(m){return Math.abs(m.dx)+half<=box.width/2;}));
    if(level && (level.level==='below' || level.level==='above'))telemetryPaintTraceBrackets(node,level.level,level.tone);});
  scope.querySelectorAll('g.node.node-text[data-dv-node]').forEach(function(node){var rows=model.nodes[node.getAttribute('data-dv-node')];if(!rows || !counted(rows).length)return;node.setAttribute('data-trace-tone','observed');
    var level=levels.nodes[node.getAttribute('data-dv-node')];if(!level)return;node.setAttribute('data-trace-level',level.level);
    if(level.level==='below' || level.level==='above')telemetryPaintTraceBrackets(node,level.level,level.tone);});
  scope.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
    var edge=d.edges[Number(path.getAttribute('data-dv-edge'))],rows=edge && model.edges[edge.from+'->'+edge.to];if(!rows)return;
    var length=path.getTotalLength(),mid=length/2,point=path.getPointAtLength(mid),a=path.getPointAtLength(Math.max(0,mid-1)),b=path.getPointAtLength(Math.min(length,mid+1));
    var dx=b.x-a.x,dy=b.y-a.y,norm=Math.sqrt(dx*dx+dy*dy) || 1,nx=-dy/norm,ny=dx/norm;if(ny<0){nx=-nx;ny=-ny;}if(!dx && !dy)ny=1;
    var level=levels.edges[Number(path.getAttribute('data-dv-edge'))],text=mark(path,rows,point.x,point.y,level),box=text.getBBox(),offset=Math.abs(nx)*box.width/2+Math.abs(ny)*box.height/2+18;
    // Opposite the usual protocol label and clear of the step coin. Account for
    // the text's width on vertical/bent edges, retaining the path's transform.
    var baseline=point.y-box.y-box.height/2;text.setAttribute('x',point.x+nx*offset);text.setAttribute('y',point.y+ny*offset+baseline);
    telemetryTraceConstrainLabel(text,[{x:point.x-nx*(offset+24),y:point.y-ny*(offset+24)+baseline}]);
    // Edge labels stay on their own side, within one label height of their anchor: away from the edge, then along it.
    var own=text.getBBox(),reach=Math.max(8,Math.ceil(own.height)),edgeMoves=[],svg=path.closest('svg');
    for(var k=4;k<=reach;k+=4)edgeMoves.push({dx:nx*k,dy:ny*k});
    for(k=4;k<=reach;k+=4)edgeMoves.push({dx:-ny*k,dy:nx*k},{dx:ny*k,dy:-nx*k});
    if(svg)telemetryTraceAvoidConnections(text,obstacles(svg),edgeMoves);
    if(level && (level.level==='below' || level.level==='above'))telemetryPaintTraceEdgeFocus(path,level.level,level.tone);
  });
  telemetryPaintTraceFocus(scope,focus);
}

/* Exterior brackets carry selection, independently of status/missing-work ink.
   Never replace a card/edge stroke or use a service name as a node identity. */
function telemetryPaintTraceFocus(scope,focus){
  if(!focus || !focus.choice)return;
  var row=focus.choice.row,tone=row.tone || 'observed';
  if(row.edgeIndex!=null)scope.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
    if(Number(path.getAttribute('data-dv-edge'))===row.edgeIndex)telemetryPaintTraceEdgeFocus(path,'current',tone);
  });
  if(!row.nodeId)return;
  scope.querySelectorAll('g.node[data-dv-node]').forEach(function(node){
    if(node.getAttribute('data-dv-node')!==row.nodeId)return;
    node.setAttribute('data-trace-focus','true');
    // A plated label raised out of this node is not dimmed either.
    scope.querySelectorAll('.dv-trace-overlay[data-trace-node]').forEach(function(g){if(g.getAttribute('data-trace-node')===row.nodeId)g.setAttribute('data-trace-focus','true');});
    var g=telemetryPaintTraceBrackets(node,'current',tone);if(!g)return;
    var x=Number(g.getAttribute('data-x')),y=Number(g.getAttribute('data-y')),doc=node.ownerDocument;
    var tag=doc.createElementNS('http://www.w3.org/2000/svg','rect');tag.setAttribute('x',x+13);tag.setAttribute('y',y-9);tag.setAttribute('width','45');tag.setAttribute('height','18');tag.setAttribute('rx','5');g.appendChild(tag);
    var text=doc.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',x+35.5);text.setAttribute('y',y+3);text.setAttribute('text-anchor','middle');text.textContent='Trace';g.appendChild(text);
  });
}
/* #1074 corner brackets outside a node card, at one highlight level, coloured by the span tone. */
function telemetryPaintTraceBrackets(node,level,tone){
  var card=node.querySelector('.card,.text-box-hit');if(!card)return null;
  var box=card.getBBox(),x=box.x-7,y=box.y-7,w=box.width+14,h=box.height+14,k=12,doc=node.ownerDocument;
  var g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','dv-trace-focus-overlay');g.setAttribute('pointer-events','none');g.setAttribute('aria-hidden','true');
  g.setAttribute('data-trace-level',level);g.setAttribute('data-trace-tone',tone);g.setAttribute('data-x',x);g.setAttribute('data-y',y);
  var brackets=doc.createElementNS('http://www.w3.org/2000/svg','path');brackets.setAttribute('class','dv-trace-focus-brackets');
  brackets.setAttribute('d','M'+x+','+(y+k)+'v-'+k+'h'+k+' M'+(x+w-k)+','+y+'h'+k+'v'+k+' M'+(x+w)+','+(y+h-k)+'v'+k+'h-'+k+' M'+(x+k)+','+(y+h)+'h-'+k+'v-'+k);g.appendChild(brackets);
  node.appendChild(g);return g;
}

/* A true transparent-center ring: no background-colored stroke covers semantic
   ink or nearby wires. Geometry stays in the original path's coordinate system;
   the overlay has no edge classes, identity attributes, arrows or interactions. */
function telemetryPaintTraceEdgeFocus(path,level,tone){
  // Failure/availability replaces the delivered path with its own broken glyph.
  // Do not draw a continuous delivery halo across that intentional break.
  if(path.classList.contains('comm-hidden') || path.classList.contains('dv-live-comm-hidden') || path.closest('.dv-fragment-hidden,.view-step-hidden'))return;
  var doc=path.ownerDocument,win=doc.defaultView,style=win && win.getComputedStyle(path);
  if(style && (style.display==='none' || style.visibility==='hidden'))return;
  var width=parseFloat(style && style.strokeWidth || path.getAttribute('stroke-width')) || 2,box=path.getBBox(),pad=width/2+10;
  var ns='http://www.w3.org/2000/svg',id='dv-trace-focus-mask-'+(doc._dvTraceMaskSequence=(doc._dvTraceMaskSequence || 0)+1),shape=path.getAttribute('d');
  if(!shape || !path.getAttribute('id'))return;
  function make(tag,attrs,parent){var el=doc.createElementNS(ns,tag);Object.keys(attrs).forEach(function(key){el.setAttribute(key,attrs[key]);});parent.appendChild(el);return el;}
  var g=doc.createElementNS(ns,'g');g.setAttribute('class','dv-trace-edge-focus');g.setAttribute('pointer-events','none');g.setAttribute('aria-hidden','true');
  g.setAttribute('data-trace-level',level || 'current');g.setAttribute('data-trace-tone',tone || 'observed');
  // The ring between the two mask strokes: 4 units each side for current, 2 for the dotted below/above.
  var outer=width+(level==='below' || level==='above'?12:16);
  if(path.getAttribute('transform')!=null)g.setAttribute('transform',path.getAttribute('transform'));
  var defs=make('defs',{},g),mask=make('mask',{id:id,maskUnits:'userSpaceOnUse',x:box.x-pad,y:box.y-pad,width:box.width+2*pad,height:box.height+2*pad,'mask-type':'luminance'},defs);
  make('path',{d:shape,fill:'none',stroke:'white','stroke-width':outer,'stroke-linecap':'round','stroke-linejoin':'round'},mask);
  make('path',{d:shape,fill:'none',stroke:'black','stroke-width':width+8,'stroke-linecap':'round','stroke-linejoin':'round'},mask);
  make('path',{'class':'dv-trace-edge-outline',d:shape,fill:'none',stroke:'#009fc7','stroke-width':outer,'stroke-linecap':'round','stroke-linejoin':'round',mask:'url(#'+id+')'},g);
  path.parentNode.insertBefore(g,path);
}
