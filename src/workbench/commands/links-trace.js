/* #1243 part 2: the Links window's Trace match tab. A step's `traceMatch` is
   one selector or a list of alternatives (#1238). The read model groups the
   alternatives by serviceName · operation; nodes and connections show their
   matches through the steps that name or light them. Every planner writes the
   step's `traceMatch` the way the Inspect form does, in one source change. */

function linksTraceKey(m){return m.serviceName+' · '+m.operation;}
/* Whether a draft started on one step still names step element `e`: by step id,
   or, for a step with no id, by its caption (positions shift on delete or Undo). */
function linksTraceSameStep(draft,e){
  if(!draft || !e || e.kind!=='step')return false;
  if(draft.stepId!=null || e.stepId!=null)return draft.stepId===e.stepId;
  // No ids: the caption and which of the same-caption steps it is (two "retry" steps differ).
  if(draft.caption || e.caption)return (draft.caption || '')===(e.caption || '') && (draft.occurrence || 0)===(e.occurrence || 0);
  // No id and no caption: only the position can tell, so the draft stays where it was opened.
  return draft.id===linksElementId(e);
}
/* canon: a step with a trace match needs a stable id. */
var LINKS_TRACE_NEEDS_ID=' has no id, and a step with a trace match needs one. Give this step an id in Inspect first.';
function linksTraceStepHasId(st){return !!st && typeof st.id==='string' && !!st.id.trim();}
function linksTraceHasKey(list,key){return (list || []).some(function(m){return m && linksTraceKey(m)===key;});}
/* Why "Add as alternative" cannot be offered for `key` on step element `to`, or null. */
function linksTraceAlternativeRefusal(to,key){
  return to && to.matches && to.matches.some(function(u){return u.key===key;})?to.label+' already has '+key+'. Replace it instead.':null;
}
function linksTraceStepAt(raw,section,index){
  var got=builderStepAt(raw,section,index);if(!got)return null;
  got.alternatives=traceMatchFormAlternatives(got.st.traceMatch);got.label=linksStepLabel(got.st,index);
  return got;
}
function linksTraceValue(list,many){
  if(!list.length)return null;
  return list.length===1 && !many?list[0]:list;
}
function linksTraceSetPlan(text,raw,got,value){
  // #1290: a step has traceMatch or traceScope, never both: writing a trace match replaces the scope
  // in the same edit, as the Inspect form and Map this span do.
  if(value!=null && got.st && Object.prototype.hasOwnProperty.call(got.st,'traceScope'))return planSetFields(text,raw,got.path,[['traceMatch',JSON.stringify(value)],['traceScope',null]]);
  return planSetField(text,raw,got.path,'traceMatch',value==null?null:JSON.stringify(value));
}

/* {error} or {sections, groups:[{key,serviceName,operation,uses:[...]}], elements, nodeOptions:{section:[{id,label,imported}]}}.
   A use is {kind:'step',section,index,alternative,nodeId,attributes,label}. */
/* #1290 PR 8: the group a declared span joins. An exact operation joins the steps' trace match
   group; a prefix or an attributes-only span gets its own group, which no step can be assigned. */
function linksTraceDeclKey(m){
  var svc=String(m.serviceName || '');
  if(typeof m.operation==='string')return svc+' · '+m.operation;
  if(typeof m.operationPrefix==='string')return svc+' · '+m.operationPrefix+'… (prefix)';
  var attrs=m.attributes && typeof m.attributes==='object'?m.attributes:{};
  return svc+' · where '+Object.keys(attrs).map(function(k){return k+'='+String(attrs[k]);}).join(', ');
}
function linksTraceModel(text,raw,context){
  var resolved;try{resolved=linksResolve(raw,context);}catch(ex){return {error:ex.message};}
  var paths=specSectionPaths(resolved),sections=[],elements=[],groups=Object.create(null),nodeOptions={};
  var model={sections:sections,groups:[],elements:elements,nodeOptions:nodeOptions};
  paths.forEach(function(rec,section){
    var d=specValueAt(resolved,rec.diagram);if(!d || typeof d!=='object' || !d.nodes || typeof d.nodes!=='object')return;
    var sec=specValueAt(resolved,rec.section) || {};sections.push({section:section,label:sec.heading || 'Section '+(section+1)});
    function title(id){var n=d.nodes[id];return n && (n.title || n.label) || id;}
    var nodes=Object.keys(d.nodes).filter(function(id){return d.nodes[id] && typeof d.nodes[id]==='object' && !isTextBoxNode(d.nodes[id]);});
    nodeOptions[section]=nodes.map(function(id){return {id:id,label:title(id),imported:typeof FlowTopology!=='undefined' && !!FlowTopology.origin(d,'nodes',id)};});
    var uses=[],stepEls=[];
    (Array.isArray(d.steps)?d.steps:[]).forEach(function(st,index){
      if(!st || typeof st!=='object')return;
      var alts=traceMatchFormAlternatives(st.traceMatch),label=linksStepLabel(st,index);
      var matches=(alts || []).map(function(m,alternative){
        var use={kind:'step',section:section,index:index,alternative:alternative,key:typeof m.serviceName==='string' && typeof m.operation==='string'?linksTraceKey(m):null,
          serviceName:m.serviceName,operation:m.operation,nodeId:typeof m.nodeId==='string'?m.nodeId:null,
          attributes:m.attributes && typeof m.attributes==='object'?Object.keys(m.attributes).length:0,label:label,many:Array.isArray(st.traceMatch)};
        if(use.nodeId)use.nodeLabel=title(use.nodeId);
        return use;
      });
      matches.forEach(function(use){
        uses.push(use);if(!use.key)return;
        var g=groups[use.key] || (groups[use.key]={key:use.key,serviceName:use.serviceName,operation:use.operation,uses:[]});g.uses.push(use);
      });
      var caption=typeof st.text==='string'?st.text:'',occurrence=stepEls.filter(function(x){return x.caption===caption;}).length;
      var el={kind:'step',section:section,index:index,stepId:typeof st.id==='string'?st.id:null,label:label,caption:caption,occurrence:occurrence,matches:matches,form:alts!==null,
        scoped:st.traceMatch==null && !!st.traceScope && typeof st.traceScope==='object' && !Array.isArray(st.traceScope),
        edgeKeys:stepKeys(st).concat(Object.keys(stepFailures(st))),editable:true};
      if(alts===null)el.reason=label+'’s traceMatch is not a selector object or a list of them. Fix it in JSON or Inspect first.';
      // Static drop checks look a source step up through its model.
      Object.defineProperty(el,'model',{value:model,enumerable:false});
      stepEls.push(el);elements.push(el);
    });
    /* #1290 PR 8: the spans a node or connection declares (merged for an imported one), read only,
       with the steps that inherit each: the per-path D9 rule and skips the step trace scope form uses. */
    function declarations(value,carrier,id,label,imported){
      var sp=value && value.trace && typeof value.trace==='object' && value.trace.spans && typeof value.trace.spans==='object' && !Array.isArray(value.trace.spans)?value.trace.spans:{};
      return Object.keys(sp).filter(function(k){return sp[k] && typeof sp[k]==='object' && !Array.isArray(sp[k]);}).map(function(k){
        var x={key:k,span:sp[k],role:sp[k].role},inherited=[];
        (Array.isArray(d.steps)?d.steps:[]).forEach(function(st,index){
          var r=traceScopeInheritedOn(d,index,{kind:carrier.kind,id:id},x);if(!r.on.length)return;
          var paths=r.on.length===r.all?null:r.on,stepLabel=linksStepLabel(st,index);
          inherited.push({section:section,index:index,label:stepLabel,paths:paths,text:stepLabel+' (inherited'+(paths?' on '+traceScopeNames(paths):'')+')'});
        });
        var decl={kind:'declaration',section:section,carrier:carrier,carrierLabel:label,spanKey:k,role:sp[k].role,key:linksTraceDeclKey(sp[k]),
          text:traceScopeSpanText(x),label:'declared on '+label+' ('+k+')',imported:imported,inherited:inherited};
        var g=groups[decl.key] || (groups[decl.key]={key:decl.key,serviceName:sp[k].serviceName,operation:typeof sp[k].operation==='string'?sp[k].operation:undefined,uses:[]});
        (g.declarations=g.declarations || []).push(decl);
        return decl;
      });
    }
    nodes.forEach(function(id){
      var imported=typeof FlowTopology!=='undefined' && !!FlowTopology.origin(d,'nodes',id);
      elements.push({kind:'node',section:section,id:id,label:title(id),imported:imported,
        via:uses.filter(function(u){return u.nodeId===id;}),declarations:declarations(d.nodes[id],{kind:'node',section:section,id:id},id,title(id),imported)});
    });
    (Array.isArray(d.edges)?d.edges:[]).forEach(function(edge,index){
      if(!edge || typeof edge!=='object')return;var key=builderEdgeKey(edge);
      var imported=typeof FlowTopology!=='undefined' && !!FlowTopology.origin(d,'edges',key);
      elements.push({kind:'edge',section:section,index:index,key:key,label:title(edge.from)+' → '+title(edge.to)+(typeof edge.label==='string' && edge.label?' · '+edge.label:''),imported:imported,
        via:stepEls.filter(function(s){return s.edgeKeys.indexOf(key)>=0;}).reduce(function(all,s){return all.concat(s.matches);},[]),
        declarations:declarations(edge,{kind:'edge',section:section,index:index,key:key},edge.from+'->'+edge.to,title(edge.from)+' → '+title(edge.to),imported)});
    });
  });
  model.groups=Object.keys(groups).sort().map(function(k){var g=groups[k];if(!g.declarations)g.declarations=[];
    // A step's trace match is an exact service and operation: only such a group can be assigned or renamed.
    g.assignable=typeof g.serviceName==='string' && typeof g.operation==='string';return g;});
  return model;
}
/* Distinct steps a shared rename changes. */
function linksTraceRenameCount(group){
  var seen=[];(group && group.uses || []).forEach(function(u){var id=u.section+':'+u.index;if(seen.indexOf(id)<0)seen.push(id);});return seen.length;
}

/* Why the match `from` (a step use) cannot go onto `to`, or null. Static: no plan runs. */
function linksTraceDropRefusal(from,to,mode,copy){
  if(!to || to.kind!=='step')return 'Drop on a step: a trace match is saved on the step it stands for.';
  if(from && from.section===to.section && from.index===to.index)return 'The match is already here.';
  if(!to.form)return to.reason;
  if(!to.stepId)return to.label+LINKS_TRACE_NEEDS_ID;
  if(from && to.model){
    var src=to.model.elements.find(function(e){return e.kind==='step' && e.section===from.section && e.index===from.index;});
    var use=src && src.matches[from.alternative || 0];
    if(src && !src.form)return src.reason;
    if(use && use.nodeId && from.section!==to.section)return 'This match names the node '+(use.nodeLabel || use.nodeId)+' in another section. Move it within its section, or clear its Node first.';
  }
  return null;
}
function linksTraceTargets(model,from,copy){
  return model.elements.filter(function(e){return e.kind==='step';}).map(function(e){return {element:e,refusal:linksTraceDropRefusal(from,e,null,copy)};});
}

/* Move (or copy) one alternative onto another step. `mode` is null (the target
   has no match), 'replace' or 'alternative'; a target with a match and no mode
   returns {error, choose:true} so the caller can ask. */
function planLinksTraceMove(text,raw,from,to,mode,copy,context){
  if(from.section===to.section && from.index===to.index)return copy?{error:'The match is already here.'}:{text:text};
  var src=linksTraceStepAt(raw,from.section,from.index),dst=linksTraceStepAt(raw,to.section,to.index);
  if(!src || !dst)return {error:'Step not found. Render and try again.'};
  if(!src.alternatives)return {error:src.label+'’s traceMatch is not a selector object or a list of them. Fix it in JSON first.'};
  if(!dst.alternatives)return {error:dst.label+'’s traceMatch is not a selector object or a list of them. Fix it in JSON first.'};
  if(!linksTraceStepHasId(dst.st))return {error:dst.label+LINKS_TRACE_NEEDS_ID};
  var m=src.alternatives[from.alternative || 0];if(!m)return {error:'That alternative no longer exists. Render and try again.'};
  if(typeof m.nodeId==='string' && from.section!==to.section)return {error:'This match names a node in another section. Move it within its section, or clear its Node first.'};
  if(dst.alternatives.length && !mode)return {error:dst.label+' already has a trace match. Replace it, or add this one as an alternative.',choose:true};
  if(mode==='alternative' && linksTraceHasKey(dst.alternatives,linksTraceKey(m)))return {error:dst.label+' already has '+linksTraceKey(m)+'. Replace it instead, or edit its alternatives in place.'};
  var value=mode==='alternative' && dst.alternatives.length?builderClone(dst.alternatives).concat([builderClone(m)]):builderClone(m);
  var added=linksTraceSetPlan(text,raw,dst,value);if(added.error || copy)return added;
  var next=JSON.parse(added.text),again=linksTraceStepAt(next,from.section,from.index);
  var removed=traceMatchFormEdit(again.st.traceMatch,{op:'remove-alternative',alternative:from.alternative || 0});
  if(removed.error)return removed;
  return linksTraceSetPlan(added.text,next,again,removed.value);
}
/* + Assign step: give a step {serviceName, operation} (as an alternative when it
   already has another match), or remove every alternative with that key. */
function planLinksTraceAssign(text,raw,group,step,remove,context){
  if(!group || typeof group.serviceName!=='string' || typeof group.operation!=='string')
    return {error:(group && group.key || 'This group')+' is not an exact operation, so it cannot be a step\'s trace match. Steps inherit it from the node or connection that declares it.'};
  var got=linksTraceStepAt(raw,step.section,step.index);if(!got)return {error:'Step not found. Render and try again.'};
  if(!got.alternatives)return {error:got.label+'’s traceMatch is not a selector object or a list of them. Fix it in JSON first.'};
  var key=linksTraceKey(group),has=got.alternatives.filter(function(m){return linksTraceKey(m)===key;}).length>0,list=builderClone(got.alternatives);
  if(remove){if(!has)return {text:text};list=list.filter(function(m){return linksTraceKey(m)!==key;});}
  else {if(has)return {text:text};if(!linksTraceStepHasId(got.st))return {error:got.label+LINKS_TRACE_NEEDS_ID};list.push({serviceName:group.serviceName,operation:group.operation});}
  return linksTraceSetPlan(text,raw,got,linksTraceValue(list,list.length>1));
}
/* Rename one service · operation on every step that uses it, in one plan.
   All or nothing: a step that would end up with two alternatives of the same
   service · operation refuses the whole rename. */
function planLinksTraceRename(text,raw,group,next,context){
  var service=next && typeof next.serviceName==='string'?next.serviceName.trim():'',operation=next && typeof next.operation==='string'?next.operation.trim():'';
  if(!service || !operation)return {error:'A trace match needs a service name and an operation.',field:!service?'serviceName':'operation'};
  var key=linksTraceKey(group),nextKey=service+' · '+operation;
  if(nextKey===key)return {text:text,count:0};
  var changes=[];
  specSectionPaths(raw).forEach(function(rec,section){
    var d=specValueAt(raw,rec.diagram);
    (d && Array.isArray(d.steps)?d.steps:[]).forEach(function(st,index){
      var got=linksTraceStepAt(raw,section,index);
      if(got && got.alternatives && linksTraceHasKey(got.alternatives,key))changes.push(got);
    });
  });
  if(!changes.length)return {error:key+' is not on any step. Render and try again.'};
  var clash=changes.find(function(got){return linksTraceHasKey(got.alternatives,nextKey);});
  // The reason goes under the field the reader changed (both when both changed).
  var changed=[service!==group.serviceName?'serviceName':null,operation!==group.operation?'operation':null].filter(Boolean);
  if(clash)return {error:clash.label+' already has '+nextKey+'; renaming would give it two. Remove one of them first.',field:changed.length===2?'both':changed[0] || 'operation'};
  // Only traceMatch values change, so every step path stays valid on the edited text.
  var out=text;
  for(var i=0;i<changes.length;i++){
    var got=changes[i],list=builderClone(got.alternatives).map(function(m){if(linksTraceKey(m)===key){m.serviceName=service;m.operation=operation;}return m;});
    var plan=linksTraceSetPlan(out,raw,got,linksTraceValue(list,Array.isArray(got.st.traceMatch)));
    if(plan.error)return {error:got.label+': '+plan.error};
    out=plan.text;
  }
  return {text:out,count:changes.length};
}

/* Attribute names trace matching supports on this board: canon's operational
   list plus those the page's trace connections allow (as the validator reads). */
function linksTraceAttributeNames(raw,context){
  if(typeof FlowCanon==='undefined' || !FlowCanon.traceAttributeNames)return null;
  var resolved;try{resolved=linksResolve(raw,context);}catch(ex){resolved=raw;}
  return FlowCanon.traceAttributeNames(resolved);
}
/* One inline-editor edit (planStepTraceMatch), refusing an attribute name the
   validator would reject, so an edit never leaves the board invalid. */
function planLinksTraceEdit(text,raw,section,index,edit,context){
  if(edit && edit.op==='create'){
    var got=builderStepAt(raw,section,index);
    if(got && !linksTraceStepHasId(got.st))return {error:linksStepLabel(got.st,index)+LINKS_TRACE_NEEDS_ID};
  }
  // A new or renamed attribute must be one trace matching supports; a value edit on an
  // existing (even hand-written) name is not re-checked here.
  if(edit && edit.op==='attribute' && typeof edit.name==='string' && edit.name.trim() && edit.name.trim()!==edit.key){
    var names=linksTraceAttributeNames(raw,context),name=edit.name.trim();
    if(names && names.indexOf(name)<0)return {error:name+' is not a trace attribute Flowview can match on. Pick one from the list.',field:edit.key==null?'attr-new-name':'attr-name'};
  }
  var plan=planStepTraceMatch(text,raw,section,index,edit);
  return plan.noop?{text:text}:plan;
}
