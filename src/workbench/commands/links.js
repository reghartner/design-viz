/* #1243 Links view, Tickets tab: a read model of which nodes, edges and steps
   carry which Jira tickets, and planners that write the same JSON the Inspector
   Tracking editor writes. A node or edge carries `tickets`; an imported one
   carries the consumer's `nodeTracking` / `edgeTracking` overlay (provider
   tickets are inherited and read only). A step carries no tickets of its own:
   it shows the tickets of the nodes and edges it lights, narrowed by its
   `ticketFilter` (#1103), so a step link is shown or hidden through that filter. */

function linksResolve(raw,context){
  return typeof FlowTopology==='undefined'?raw:FlowTopology.resolveSource(raw,context);
}
function linksElementId(link){
  return link.kind+':'+link.section+':'+(link.kind==='node'?link.id:link.index);
}
function linksCompareKeys(a,b){
  var pa=/^(.*)-(\d+)$/.exec(a),pb=/^(.*)-(\d+)$/.exec(b);
  if(pa && pb && pa[1]===pb[1])return Number(pa[2])-Number(pb[2]);
  return a<b?-1:a>b?1:0;
}
/* Authored entries the Tracking form cannot read: kept as written, named here. */
function linksUnreadable(value){
  if(!value || value.tickets==null)return {unreadable:[],notList:false};
  if(!Array.isArray(value.tickets))return {unreadable:[],notList:true};
  return {unreadable:value.tickets.filter(function(entry){return trackingTicket(entry)==null;}).map(function(entry){return typeof entry==='string'?entry:JSON.stringify(entry);}),notList:false};
}
function linksNotList(own,value,label){
  var bad=linksUnreadable(value);
  if(bad.notList && own.editable && !own.overlay)return Object.assign({},own,bad,{editable:false,reason:'Tickets on '+label+' in the JSON is not a list. Fix it in JSON first.'});
  return Object.assign({},own,bad);
}
function linksStepLabel(st,index){
  var name=st && typeof st.id==='string' && st.id?st.id:st && typeof st.text==='string' && st.text?st.text:'untitled';
  return 'Step '+(index+1)+' · '+name;
}
/* The provider-only tickets of imported carriers: resolve once with every
   consumer tracking overlay removed. */
function linksInheritedSource(raw,context){
  var base=builderClone(raw),stripped=false;
  specSectionPaths(base).forEach(function(rec){
    var d=specValueAt(base,rec.diagram);
    (d && Array.isArray(d.topologyImports)?d.topologyImports:[]).forEach(function(imp){
      if(imp && typeof imp==='object'){if(imp.nodeTracking){delete imp.nodeTracking;stripped=true;}if(imp.edgeTracking){delete imp.edgeTracking;stripped=true;}}
    });
  });
  if(!stripped)return null;
  try{return linksResolve(base,context);}catch(ex){return null;}
}

/* {error} or {sections:[{section,label}], elements:[...], tickets:[{key,ref,links:[...]}]}.
   Node and edge elements: {kind,section,id|index,key,label,imported,editable,reason,keys,inherited,refs}.
   Step elements: {kind:'step',section,index,label,caption,lit,shown,filtered,via}. */
function linksTicketModel(text,raw,context){
  var resolved;try{resolved=linksResolve(raw,context);}catch(ex){return {error:ex.message};}
  var stripped=linksInheritedSource(raw,context),page=normalize(resolved),records=page?sectionRecords(page):[];
  var paths=specSectionPaths(resolved),authoredPaths=specSectionPaths(raw),sections=[],elements=[];
  paths.forEach(function(rec,section){
    var d=specValueAt(resolved,rec.diagram),authored=authoredPaths[section] && specValueAt(raw,authoredPaths[section].diagram);
    if(!d || typeof d!=='object' || !d.nodes || typeof d.nodes!=='object')return;
    var view=records[section] && records[section].section && records[section].section.diagram || d;
    var plain=stripped && specValueAt(stripped,rec.diagram),sec=specValueAt(resolved,rec.section) || {};
    var imports=authored && Array.isArray(authored.topologyImports)?authored.topologyImports:[];
    sections.push({section:section,label:sec.heading || 'Section '+(section+1)});
    function title(id){var n=d.nodes[id];return n && (n.title || n.label) || id;}
    function ownership(kind,id,authoredHere){
      var owner=typeof FlowTopology!=='undefined'?FlowTopology.origin(d,kind,id):null;
      if(!owner || authoredHere)return {imported:!!owner,editable:true};
      var at=imports.findIndex(function(imp){return imp && imp.as===owner.as;});
      return at>=0?{imported:true,editable:true,overlay:true}:{imported:true,editable:false,reason:'Open the authored consumer with its providers to edit tickets on imported elements.'};
    }
    Object.keys(d.nodes).forEach(function(id){
      var node=d.nodes[id];if(!node || typeof node!=='object' || isTextBoxNode(node))return;
      var own=ownership('nodes',id,!!(authored && authored.nodes && Object.prototype.hasOwnProperty.call(authored.nodes,id)));
      var keys=trackingRefs(node).tickets,inherited=own.overlay && plain && plain.nodes && plain.nodes[id]?trackingRefs(plain.nodes[id]).tickets:[];
      var refs={};trackingStoredRefs(node).tickets.forEach(function(ref,i){refs[keys[i]]=ref;});
      elements.push(Object.assign({kind:'node',section:section,id:id,label:title(id),keys:keys,inherited:inherited.filter(function(k){return keys.indexOf(k)>=0;}),refs:refs},linksNotList(own,own.overlay?null:node,'node '+id)));
    });
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge,index){
      if(!edge || typeof edge!=='object')return;
      var key=builderEdgeKey(edge),local=authored && Array.isArray(authored.edges) && authored.edges.some(function(e){return builderEdgeKey(e)===key;});
      var own=ownership('edges',key,!!local),keys=trackingRefs(edge).tickets;
      var plainEdge=own.overlay && plain && Array.isArray(plain.edges)?plain.edges.find(function(e){return builderEdgeKey(e)===key;}):null;
      var inherited=plainEdge?trackingRefs(plainEdge).tickets:[];
      var refs={};trackingStoredRefs(edge).tickets.forEach(function(ref,i){refs[keys[i]]=ref;});
      elements.push(Object.assign({kind:'edge',section:section,index:index,key:key,
        label:title(edge.from)+' → '+title(edge.to)+(typeof edge.label==='string' && edge.label?' · '+edge.label:''),
        keys:keys,inherited:inherited.filter(function(k){return keys.indexOf(k)>=0;}),refs:refs},linksNotList(own,own.overlay?null:edge,'connection '+key.replace('->',' → '))));
    });
    (Array.isArray(d.steps)?d.steps:[]).forEach(function(st,index){
      if(!st || typeof st!=='object')return;
      var lit=trackingStepLitTickets(view,st,page),filter=trackingStepTicketFilter(view,st,page);
      var via={};trackingStepCarriers(view,st,true).forEach(function(carrier){
        trackingCarrierStepTickets(page,carrier.value).forEach(function(k){var name=carrier.value && carrier.value.from!=null && carrier.id.indexOf('->')>0?'connection '+title(carrier.value.from)+' → '+title(carrier.value.to):'node '+title(carrier.id);
          if(!via[k])via[k]=[];if(via[k].indexOf(name)<0)via[k].push(name);});
      });
      elements.push({kind:'step',section:section,index:index,label:linksStepLabel(st,index),caption:typeof st.text==='string'?st.text:'',
        lit:lit,shown:filter || lit.slice(),filtered:!!filter,via:via,editable:true});
    });
  });
  var byKey=Object.create(null);
  elements.forEach(function(el){
    var keys=el.kind==='step'?el.shown:el.keys;
    keys.forEach(function(key){
      var row=byKey[key] || (byKey[key]={key:key,ref:null,links:[]});
      if(!row.ref && el.refs && el.refs[key])row.ref=el.refs[key];
      row.links.push({kind:el.kind,section:el.section,id:el.id,index:el.index,key:el.key,label:el.label,
        inherited:!!(el.inherited && el.inherited.indexOf(key)>=0),editable:el.editable,imported:!!el.imported,
        via:el.kind==='step'?el.via[key] || []:null});
    });
  });
  var tickets=Object.keys(byKey).sort(linksCompareKeys).map(function(key){var row=byKey[key];if(!row.ref)row.ref=key;return row;});
  return {sections:sections,elements:elements,tickets:tickets};
}
function linksFindElement(model,link){
  return model.elements.find(function(el){return el.kind===link.kind && el.section===link.section && (el.kind==='node'?el.id===link.id:el.index===link.index);}) || null;
}

/* Add or remove one ticket on one node or edge. `ref` is the stored form (key
   or browse URL); `key` its Jira key. Same rules as the Inspector: authored
   entries the form cannot read are kept, a non-list value is refused, and an
   imported carrier writes the consumer overlay. A no-op returns {text}. */
function linksCarrierTicketPlan(text,raw,carrier,key,ref,remove,context){
  var got=builderDiagram(text,raw,carrier.section);if(got.error)return got;
  var resolved;try{resolved=linksResolve(raw,context);}catch(ex){return {error:ex.message};}
  var rec=specSectionPaths(resolved)[carrier.section],d=rec && specValueAt(resolved,rec.diagram);
  if(!d)return {error:'Diagram not found. Render and try again.'};
  var path=null,label;
  if(carrier.kind==='node'){
    if(!d.nodes || !Object.prototype.hasOwnProperty.call(d.nodes,carrier.id))return {error:'Node '+carrier.id+' is not on the board. Render and try again.'};
    if(isTextBoxNode(d.nodes[carrier.id]))return {error:'Text boxes do not carry tickets.'};
    label='node '+carrier.id;
    if(got.d.nodes && Object.prototype.hasOwnProperty.call(got.d.nodes,carrier.id))path=got.path.concat(['nodes',carrier.id]);
    else return linksOverlayPlan(text,raw,carrier.section,'node',carrier.id,key,ref,remove,context,undefined);
  }else if(carrier.kind==='edge'){
    var edge=(d.edges || [])[carrier.index];
    if(!edge || carrier.key && builderEdgeKey(edge)!==carrier.key)return {error:'The connection changed. Render and try again.'};
    var edgeKey=builderEdgeKey(edge);label='connection '+edgeKey.replace('->',' → ');
    var localIndex=(got.d.edges || [])[carrier.index] && builderEdgeKey(got.d.edges[carrier.index])===edgeKey?carrier.index:(got.d.edges || []).findIndex(function(e){return builderEdgeKey(e)===edgeKey;});
    if(localIndex>=0)path=got.path.concat(['edges',localIndex]);
    else return linksOverlayPlan(text,raw,carrier.section,'edge',edgeKey,key,ref,remove,context,carrier.index);
  }else return {error:'Tickets attach to nodes and connections.'};
  var current=specValueAt(raw,path),authored=current && current.tickets;
  if(!current)return {error:'Element not found. Render and try again.'};
  if(authored!=null && !Array.isArray(authored))return {error:'Tickets on '+label+' in the JSON is not a list. Fix it in JSON first; nothing was changed.'};
  var list=Array.isArray(authored)?authored.slice():[];
  function same(entry){return (trackingTicket(entry) || {}).key===key;}
  if(remove){if(!list.some(same))return {text:text};list=list.filter(function(entry){return !same(entry);});}
  else {if(list.some(same))return {text:text};list.push(ref);}
  return planSetField(text,raw,path,'tickets',list.length?JSON.stringify(list):null);
}
function linksOverlayPlan(text,raw,section,kind,id,key,ref,remove,context,index){
  var t=topologyTrackingTarget(text,raw,section,kind,id,context,index);if(t.error)return t;
  if(remove && t.inherited.tickets.indexOf(key)>=0 && trackingRefs(t.local).tickets.indexOf(key)<0)return {error:key+' is inherited from the provider and cannot be removed here.'};
  return planTopologyTracking(text,raw,section,kind,id,'tickets',remove?key:ref,remove,context,index);
}

/* Show or hide one lit ticket on a step through its ticketFilter, the field
   the Inspector's "Tickets on this step" checklist writes. */
function linksStepTicketPlan(text,raw,step,key,show,context){
  var resolved;try{resolved=linksResolve(raw,context);}catch(ex){return {error:ex.message};}
  var page=normalize(resolved),records=page?sectionRecords(page):[],rec=specSectionPaths(raw)[step.section];
  var view=records[step.section] && records[step.section].section && records[step.section].section.diagram;
  var d=rec && specValueAt(raw,rec.diagram),st=d && Array.isArray(d.steps)?d.steps[step.index]:null;
  if(!st || !view)return {error:'Step not found. Render and try again.'};
  var label=linksStepLabel(st,step.index),lit=trackingStepLitTickets(view,st,page);
  if(lit.indexOf(key)<0)return {error:label+' does not light a node or connection that carries '+key+'. A step shows the tickets of the nodes and connections it lights: add '+key+' to one of those.'};
  var shown=trackingStepTicketFilter(view,st,page) || lit.slice(),next;
  // Filter keys the step no longer lights stay listed, as the Inspector checklist keeps them.
  var unlit=(trackingStepFilter(st) || []).filter(function(k){return lit.indexOf(k)<0;});
  if(show){if(shown.indexOf(key)>=0)return {text:text};next=lit.filter(function(k){return shown.indexOf(k)>=0 || k===key;}).concat(unlit);}
  else {
    if(shown.indexOf(key)<0)return {text:text};
    next=shown.filter(function(k){return k!==key;}).concat(unlit);
    if(!next.some(function(k){return lit.indexOf(k)>=0;}))return {error:'Keep at least one ticket on '+label+'. Its tickets come from the nodes and connections it lights.'};
  }
  var all=lit.every(function(k){return next.indexOf(k)>=0;});
  return planSetField(text,raw,rec.diagram.concat(['steps',step.index]),'ticketFilter',all?null:JSON.stringify(next));
}

/* One ticket on one element. `link` is a node, edge or step element. */
function planLinksTicket(text,raw,link,key,ref,remove,context){
  if(!trackingKeyPattern.test(key))return {error:'Use a Jira key like HW-123.'};
  var plan=link.kind==='step'?linksStepTicketPlan(text,raw,link,key,!remove,context):linksCarrierTicketPlan(text,raw,link,key,ref || key,remove,context);
  if(plan.error || plan.text===text || !remove || link.kind==='step')return plan;
  // #1103: a removed ticket leaves the step filters that named it, in the same Undo step.
  return builderPruneTicketFilters(plan,link.section,[key],function(value){return linksResolve(value,context);});
}
/* Move (or copy) a ticket between two elements in one Undo step. */
/* Moving a ticket from a node or connection onto a step would delete it: a step
   only shows the tickets of what it lights. Copy (⌥) shows it on the step. */
function linksMoveToStepError(from,to,key){
  if(!from || !to || from.kind==='step' || to.kind!=='step')return null;
  return 'Moving '+key+' onto step '+(to.index+1)+' would take it off the '+(from.kind==='edge'?'connection':'node')+', and a step only shows the tickets of what it lights. Hold ⌥ (Alt) to show it on the step instead.';
}
/* Why `key` cannot go from `from` (null: attach) onto `to`, or null. Checks the
   source and the target, so a drop is never offered and then refused. */
function linksDropRefusal(from,to,key,copy){
  if(!to)return 'Drop on a node, connection or step.';
  var name=(to.kind==='edge'?'connection ':to.kind+' ')+to.label;
  if(from && linksElementId(from)===linksElementId(to))return key+' is already here.';
  if(!to.editable)return to.reason;
  if(to.kind==='step'){
    if(to.lit.indexOf(key)<0)return to.label+' lights no node or connection with '+key+'. A step shows the tickets of what it lights.';
    if(to.shown.indexOf(key)>=0)return to.label+' already shows '+key+'.';
  }else if(to.keys.indexOf(key)>=0)return name+' already has '+key+'.';
  if(from && !copy){
    if(!from.editable)return from.reason+' Hold ⌥ (Alt) to copy instead.';
    if(from.kind!=='step' && from.inherited.indexOf(key)>=0)return key+' is inherited from the provider on '+from.label+'. Hold ⌥ (Alt) to copy it instead.';
    var toStep=linksMoveToStepError(from,to,key);if(toStep)return toStep;
  }
  return null;
}
function planLinksTicketMove(text,raw,from,to,key,ref,copy,context){
  if(from && to && linksElementId(from)===linksElementId(to))return {text:text};
  if(!copy){var toStep=linksMoveToStepError(from,to,key);if(toStep)return {error:toStep};}
  var added=planLinksTicket(text,raw,to,key,ref,false,context);if(added.error)return added;
  if(copy || !from)return added;
  var next=JSON.parse(added.text),removed=planLinksTicket(added.text,next,from,key,ref,true,context);
  if(removed.error)return removed;
  return {text:removed.text};
}
/* Replace one ticket key with another on every element that carries it
   locally, in one Undo step. Inherited provider tickets stay. */
function planLinksTicketRename(text,raw,oldKey,newRef,context){
  var ticket=trackingTicket(String(newRef || '').trim());
  if(!ticket)return {error:'Use a Jira key like HW-123 or an absolute http(s) Jira browse URL.'};
  if(ticket.key===oldKey)return {text:text};
  var model=linksTicketModel(text,raw,context);if(model.error)return model;
  var carriers=model.elements.filter(function(el){return el.kind!=='step' && el.keys.indexOf(oldKey)>=0 && el.inherited.indexOf(oldKey)<0;});
  if(!carriers.length)return {error:oldKey+' is only inherited from a provider; rename it there.'};
  var blocked=carriers.find(function(el){return !el.editable;});if(blocked)return {error:blocked.reason};
  var out={text:text};
  for(var i=0;i<carriers.length;i++){
    var current=JSON.parse(out.text);
    var added=linksCarrierTicketPlan(out.text,current,carriers[i],ticket.key,ticket.url || ticket.key,false,context);if(added.error)return added;
    var removed=linksCarrierTicketPlan(added.text,JSON.parse(added.text),carriers[i],oldKey,null,true,context);if(removed.error)return removed;
    out={text:removed.text};
  }
  // Step filters that named the old key name the new one instead.
  var raw2=JSON.parse(out.text);
  specSectionPaths(raw2).forEach(function(rec){
    var d=specValueAt(raw2,rec.diagram);
    (d && Array.isArray(d.steps)?d.steps:[]).forEach(function(st,index){
      if(!st || !Array.isArray(st.ticketFilter) || st.ticketFilter.indexOf(oldKey)<0)return;
      var next=st.ticketFilter.map(function(k){return k===oldKey?ticket.key:k;}).filter(function(k,i,all){return all.indexOf(k)===i;});
      var edit=jsonSetField(out.text,rec.diagram.concat(['steps',index]),'ticketFilter',JSON.stringify(next));if(edit)out={text:edit.text};
    });
  });
  return out;
}
