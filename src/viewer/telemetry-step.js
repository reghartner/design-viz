/* Runtime step evidence. All identities are resolved within this source section
   and selected path; a duplicate step ID elsewhere is never consulted. */
function telemetryStepModel(diagram,index,pathId,page,snapshot,jiraMap,jiraOn){
  var step=(diagram.steps || [])[index];if(!step || !snapshot)return null;
  var direct=liveStatusStepCarriers(diagram,step,true),templates=telemetryTemplates()(page),filter=trackingStepFilter(step);
  // A step ticketFilter (#1103) narrows the Jira half of this step's verdict too.
  var carriers=direct.map(function(c){var b=carrierTelemetry(c.value,templates);return {id:c.id,tickets:jiraOn?trackingRefs(c.value).tickets.filter(function(key){return !filter || filter.indexOf(key)>=0;}):[],kind:b && b.kind,signals:b?b.signals:{},proof:b?b.proof:{}};});
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
    var step=(diagram.steps || []).find(function(s){return s.id===match.stepId;}),selector=step.traceMatch || {},keys=stepDeliveredKeys(step);
    var exact=(diagram.edges || []).filter(function(e){return keys.indexOf(e.from+'->'+e.to)>=0 && (!match.nodeId || e.to===match.nodeId);});
    var duration=match.status==='matched'?Math.max.apply(null,match.spans.map(function(s){return s.durationMs;})):null;
    var kinds=match.conditions.map(function(c){return c.kind;}),tone=match.status!=='matched'?'unknown':kinds.some(function(k){return k==='service-error' || k==='delivery-failed';})?'error':kinds.some(function(k){return ['slow','database-slow','queue-buildup','backpressure'].indexOf(k)>=0;})?'warning':'observed';
    var label=match.status==='matched'?telemetryTraceDuration(duration):match.status==='missing'?'Not observed':match.status==='ambiguous'?'Ambiguous':'Unmapped';
    var row={id:match.stepId,nodeId:match.nodeId,edgeIndex:exact.length===1?diagram.edges.indexOf(exact[0]):null,status:match.status,tone:tone,duration:duration,budget:selector.maxDurationMs,label:label,operation:selector.operation || step.text || step.id,detail:match.detail,conditions:match.conditions,spanIds:match.spans.map(function(s){return s.id;})};rows.push(row);
    // Only explicit stable node IDs and a uniquely delivered edge may annotate
    // the canvas. A service name or display title is never a join key.
    if(match.nodeId && diagram.nodes[match.nodeId]){if(!nodes[match.nodeId])nodes[match.nodeId]=[];nodes[match.nodeId].push(row);}
    if(match.status==='matched' && exact.length===1){var key=exact[0].from+'->'+exact[0].to;if(!edges[key])edges[key]=[];edges[key].push(row);}
  });
  // Multiple authored steps claiming one edge cannot supply one exact duration.
  Object.keys(edges).forEach(function(key){if(edges[key].length!==1)delete edges[key];});
  return {mapping:mapping,warning:warning,rows:rows,nodes:nodes,edges:edges};
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
}
/* Keep larger evidence text inside the existing SVG clip. This is transient
   label placement, never a viewBox/camera mutation. Prefer the authored route's
   other side before clamping an edge label into its bounded canvas. */
function telemetryTraceConstrainLabel(text,alternatives){
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
  var dy=Math.max(frame.y+pad-box.y,Math.min(0,frame.y+frame.height-pad-box.y-box.h));
  var root=svg.getCTM(),local=text.getCTM();if(!root || !local)return;
  var inverse=root.inverse().multiply(local).inverse();
  text.setAttribute('x',Number(original.x)+inverse.a*dx+inverse.c*dy);text.setAttribute('y',Number(original.y)+inverse.b*dx+inverse.d*dy);
}
function telemetryPaintTrace(binding,model,focus){
  var scope=binding.el,d=binding.section.diagram;telemetryClearTrace(scope);if(!model)return;
  function mark(target,rows,x,y){
    var ranks={unknown:0,observed:1,warning:2,error:3},tone=rows.reduce(function(a,r){return ranks[r.tone]>ranks[a]?r.tone:a;},'unknown');
    target.setAttribute('data-trace-tone',tone);target.setAttribute('data-trace-status',rows.map(function(r){return r.status;}).join(' '));
    var doc=target.ownerDocument,g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','dv-trace-overlay');g.setAttribute('data-tone',tone);g.setAttribute('pointer-events','none');
    var text=doc.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',x);text.setAttribute('y',y);text.setAttribute('text-anchor','middle');var unknown=rows.filter(function(r){return r.status!=='matched';}).length;var label=rows.length===1?rows[0].label:rows.length+' operations'+(unknown?' · '+unknown+' unknown':' · max '+telemetryTraceDuration(Math.max.apply(null,rows.map(function(r){return r.duration || 0;}))));text.textContent=label+(tone==='error'?' · error':tone==='warning'?' · warning':'');g.appendChild(text);
    var title=doc.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=rows.map(function(r){return r.operation+': '+(r.duration!=null?r.duration+' ms':r.label)+(r.budget!=null?' / '+r.budget+' ms budget':'')+' '+r.conditions.map(function(c){return c.label;}).join('; ');}).join(' · ');g.appendChild(title);
    if(target.matches('path.edge'))g.setAttribute('data-trace-edge',target.getAttribute('data-dv-edge'));
    var parent=target.matches('g.node')?target:target.parentNode;if(!target.matches('g.node') && target.getAttribute('transform')!=null)g.setAttribute('transform',target.getAttribute('transform'));g.setAttribute('role','img');g.setAttribute('aria-label',title.textContent);parent.appendChild(g);return text;
  }
  scope.querySelectorAll('g.node[data-dv-node]:not(.node-text)').forEach(function(node){var rows=model.nodes[node.getAttribute('data-dv-node')],card=node.querySelector('.card');if(!rows || !card)return;var box=card.getBBox();var text=mark(node,rows,box.x+box.width/2,box.y+box.height+24);telemetryTraceConstrainLabel(text);});
  scope.querySelectorAll('g.node.node-text[data-dv-node]').forEach(function(node){var rows=model.nodes[node.getAttribute('data-dv-node')];if(rows)node.setAttribute('data-trace-tone','observed');});
  scope.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
    var edge=d.edges[Number(path.getAttribute('data-dv-edge'))],rows=edge && model.edges[edge.from+'->'+edge.to];if(!rows)return;
    var length=path.getTotalLength(),mid=length/2,point=path.getPointAtLength(mid),a=path.getPointAtLength(Math.max(0,mid-1)),b=path.getPointAtLength(Math.min(length,mid+1));
    var dx=b.x-a.x,dy=b.y-a.y,norm=Math.sqrt(dx*dx+dy*dy) || 1,nx=-dy/norm,ny=dx/norm;if(ny<0){nx=-nx;ny=-ny;}if(!dx && !dy)ny=1;
    var text=mark(path,rows,point.x,point.y),box=text.getBBox(),offset=Math.abs(nx)*box.width/2+Math.abs(ny)*box.height/2+18;
    // Opposite the usual protocol label and clear of the step coin. Account for
    // the text's width on vertical/bent edges, retaining the path's transform.
    var baseline=point.y-box.y-box.height/2;text.setAttribute('x',point.x+nx*offset);text.setAttribute('y',point.y+ny*offset+baseline);
    telemetryTraceConstrainLabel(text,[{x:point.x-nx*(offset+24),y:point.y-ny*(offset+24)+baseline}]);
  });
  telemetryPaintTraceFocus(scope,focus);
}

/* Exterior brackets carry selection, independently of status/missing-work ink.
   Never replace a card/edge stroke or use a service name as a node identity. */
function telemetryPaintTraceFocus(scope,focus){
  if(!focus || !focus.choice)return;
  var row=focus.choice.row;
  if(row.edgeIndex!=null)scope.querySelectorAll('path.edge[data-dv-edge]').forEach(function(path){
    if(Number(path.getAttribute('data-dv-edge'))===row.edgeIndex)telemetryPaintTraceEdgeFocus(path);
  });
  if(!row.nodeId)return;
  scope.querySelectorAll('g.node[data-dv-node]').forEach(function(node){
    if(node.getAttribute('data-dv-node')!==row.nodeId)return;
    node.setAttribute('data-trace-focus','true');
    var card=node.querySelector('.card,.text-box-hit');if(!card)return;
    var box=card.getBBox(),x=box.x-7,y=box.y-7,w=box.width+14,h=box.height+14,k=12,doc=node.ownerDocument;
    var g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','dv-trace-focus-overlay');g.setAttribute('pointer-events','none');g.setAttribute('aria-hidden','true');
    var brackets=doc.createElementNS('http://www.w3.org/2000/svg','path');brackets.setAttribute('class','dv-trace-focus-brackets');
    brackets.setAttribute('d','M'+x+','+(y+k)+'v-'+k+'h'+k+' M'+(x+w-k)+','+y+'h'+k+'v'+k+' M'+(x+w)+','+(y+h-k)+'v'+k+'h-'+k+' M'+(x+k)+','+(y+h)+'h-'+k+'v-'+k);g.appendChild(brackets);
    var tag=doc.createElementNS('http://www.w3.org/2000/svg','rect');tag.setAttribute('x',x+13);tag.setAttribute('y',y-9);tag.setAttribute('width','45');tag.setAttribute('height','18');tag.setAttribute('rx','5');g.appendChild(tag);
    var text=doc.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',x+35.5);text.setAttribute('y',y+3);text.setAttribute('text-anchor','middle');text.textContent='Trace';g.appendChild(text);node.appendChild(g);
  });
}

/* A true transparent-center ring: no background-colored stroke covers semantic
   ink or nearby wires. Geometry stays in the original path's coordinate system;
   the overlay has no edge classes, identity attributes, arrows or interactions. */
function telemetryPaintTraceEdgeFocus(path){
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
  if(path.getAttribute('transform')!=null)g.setAttribute('transform',path.getAttribute('transform'));
  var defs=make('defs',{},g),mask=make('mask',{id:id,maskUnits:'userSpaceOnUse',x:box.x-pad,y:box.y-pad,width:box.width+2*pad,height:box.height+2*pad,'mask-type':'luminance'},defs);
  make('path',{d:shape,fill:'none',stroke:'white','stroke-width':width+12,'stroke-linecap':'round','stroke-linejoin':'round'},mask);
  make('path',{d:shape,fill:'none',stroke:'black','stroke-width':width+8,'stroke-linecap':'round','stroke-linejoin':'round'},mask);
  make('path',{'class':'dv-trace-edge-outline',d:shape,fill:'none',stroke:'#009fc7','stroke-width':width+12,'stroke-linecap':'round','stroke-linejoin':'round',mask:'url(#'+id+')'},g);
  path.parentNode.insertBefore(g,path);
}
