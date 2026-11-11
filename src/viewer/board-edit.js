/* Shared-board Edit mode (#828, design #825). A tracked board published as
   index.html + flowspec.json lets people with edit access add a ticket to a node
   or edge (drag a Tickets row), remove one authored there, clear a Missing
   work marker set on this board (carrier popover, #855) and map a trace span
   to a step (Trace view, #1078), replacing a single traceMatch the reader saw
   (#1177; the change records it as `replaces`), then Save publishes
   flowspec.json through the artifact runtime.

   The editor outlives every render: it keeps the exact authored text the page
   booted from and the pending operations, splices each operation into that text
   (jsonSetField for local carriers, planTopologyTracking for the consumer overlay
   of imported carriers) and asks the host to re-render from the new text. The
   live-status controller of each render reads state() and calls add/remove;
   the Live status panel draws Edit / Save / Discard from state().

   An operation names its carrier by the JSON path of the object whose tickets
   it changes. Numeric path parts can shift in another editor's version, so each
   operation also carries an identity chain (stable keys of every array element
   on its path); conflict replay applies an operation only where exactly one
   carrier of the winning spec matches that chain. Browser-only. */

var BOARD_EDIT_READ_ONLY=['not_writer','not_granted','capability_disabled','not_declared','consent_required'];
var BOARD_EDIT_HISTORY_LIMIT=200;

/* Stable key of one array element on a carrier path: sections by id (else
   heading), tabs by id or label, edges by endpoints and label, topology imports
   by their provider reference. */
function boardEditIdentity(container,element){
  if(!element || typeof element!=='object')return JSON.stringify(element);
  if(container==='sections' || container==='blocks')return element.id!=null?'id:'+element.id:'heading:'+(element.heading || element.title || '');
  if(container==='tabs')return element.id!=null?'id:'+element.id:'label:'+(element.label || element.title || '');
  if(container==='edges')return JSON.stringify([element.from,element.to,element.label==null?null:element.label]);
  if(container==='steps' && element.id!=null)return 'id:'+element.id;
  if(container==='topologyImports')return JSON.stringify([element.spec,element.export,element.as]);
  return JSON.stringify(element);
}
function boardEditChain(raw,path){
  return path.map(function(part,index){
    if(typeof part!=='number')return part;
    var list=specValueAt(raw,path.slice(0,index));
    return {key:boardEditIdentity(path[index-1],Array.isArray(list)?list[part]:null)};
  });
}
// Every concrete path in raw whose array elements match the chain's keys.
function boardEditResolveChain(raw,chain){
  var found=[];
  (function walk(value,index,path){
    if(index===chain.length){found.push(path);return;}
    var part=chain[index];
    if(part && typeof part==='object'){
      if(!Array.isArray(value))return;
      value.forEach(function(element,i){if(boardEditIdentity(chain[index-1],element)===part.key)walk(element,index+1,path.concat([i]));});
      return;
    }
    // A member may be absent only past the last array element of the chain: an
    // overlay entry (nodeTracking / edgeTracking) does not exist until the first add.
    var present=value && typeof value==='object' && Object.prototype.hasOwnProperty.call(value,part);
    if(!present && chain.slice(index+1).some(function(next){return next && typeof next==='object';}))return;
    walk(present?value[part]:undefined,index+1,path.concat([part]));
  })(raw,0,[]);
  return found;
}
/* #1290 PR 9: two span declarations are the same when every selector and label field matches
   (service, operation or prefix, role, namespace and attributes); the key is compared elsewhere. */
function boardEditSameSpan(a,b){
  if(!a || !b || typeof a!=='object' || typeof b!=='object')return false;
  var attrs=function(x){var v=x.attributes && typeof x.attributes==='object'?x.attributes:{};return JSON.stringify(Object.keys(v).sort().map(function(k){return [k,v[k]];}));};
  return ['serviceName','operation','operationPrefix','role','namespace'].every(function(k){return (a[k]===undefined?null:a[k])===(b[k]===undefined?null:b[k]);}) && attrs(a)===attrs(b);
}
function boardEditSamePrefix(path,prefix){return prefix.every(function(part,i){return path[i]===part;});}

function createBoardEditor(options){
  var win=options.win || window,text=options.text,base=text,context=options.context || null,fallback=options.fallback || null;
  var ops=[],active=false,saving=false,readOnly=false,reloading=false,canEdit=false,artifact=null,user=null,notice=null,listeners=[],lastMap=null,question=null,carriedTrace=null,carriedFocus=null;
  var stashKey='flowview-board-edit:'+String(win.location && win.location.pathname || '')+':'+(options.specFile || 'flowspec.json');

  function changed(){listeners.slice().forEach(function(fn){try{fn();}catch(ex){}});}
  function parsed(source){return JSON.parse(source);}
  function resolved(raw){return context?FlowTopology.resolveSource(builderClone(raw),context):raw;}
  function sectionAt(raw,section){var rec=specSectionPaths(raw)[section];return rec?{path:rec.diagram,d:specValueAt(raw,rec.diagram)}:null;}
  function title(d,id){var node=d && d.nodes && d.nodes[id];return node && node.title || id;}

  /* Where an operation on a rendered carrier writes: the local node/edge, or the
     consumer overlay entry of an imported one. ref = {section, kind, id|index}. */
  function target(source,ref){
    var raw=parsed(source),view=resolved(raw),local=sectionAt(raw,ref.section),shown=sectionAt(view,ref.section);
    if(!local || !shown || !shown.d)return null;
    var out={raw:raw,ref:ref,section:ref.section,kind:ref.kind};
    /* #1078: steps are page-local, also when they draw on an imported node or
       edge, so a traceMatch is written on the local step. `previous` is the
       traceMatch it has now; apply() replaces one only when asked to (#1177). */
    if(ref.kind==='step'){
      var steps=Array.isArray(local.d && local.d.steps)?local.d.steps:[],at=steps.findIndex(function(step){return step && step.id===ref.id;});
      if(at<0)return null;
      out.step=ref.id;out.label=String(steps[at].text || ref.id).replace(/\s+/g,' ').trim();out.path=local.path.concat(['steps',at]);out.local=steps[at];
      out.previous=steps[at].traceMatch && typeof steps[at].traceMatch==='object'?steps[at].traceMatch:null;out.alternatives=Array.isArray(out.previous);
      return out;
    }
    if(ref.kind==='node'){
      if(!shown.d.nodes || !shown.d.nodes[ref.id])return null;
      out.node=ref.id;out.label=title(shown.d,ref.id);
      var owner=context && FlowTopology.origin(shown.d,'nodes',ref.id);
      if(owner){
        var t=topologyLocalTarget(source,raw,ref.section,'nodes',ref.id,context);if(t.error)return null;
        out.imported=true;out.path=local.path.concat(['topologyImports',t.index,'nodeTracking',t.relative]);
        out.local=((t.got.d.topologyImports[t.index].nodeTracking || {})[t.relative]);
      }else{
        if(!local.d.nodes || !local.d.nodes[ref.id])return null;
        out.path=local.path.concat(['nodes',ref.id]);out.local=local.d.nodes[ref.id];
      }
    }else{
      var edge=(shown.d.edges || [])[ref.index];if(!edge)return null;
      var key=builderEdgeKey(edge);
      out.edge=[edge.from,edge.to];out.label=title(shown.d,edge.from)+' → '+title(shown.d,edge.to);out.id=key;out.index=ref.index;
      if(context && FlowTopology.origin(shown.d,'edges',key)){
        var e=builderEdgeLayoutTarget(source,raw,ref.section,ref.index,key,context);if(e.error)return null;
        out.imported=true;out.path=local.path.concat(['topologyImports',e.index,'edgeTracking',e.relative]);
        out.local=((e.got.d.topologyImports[e.index].edgeTracking || {})[e.relative]);
      }else{
        var authored=(local.d.edges || [])[ref.index];
        if(!authored || builderEdgeKey(authored)!==key)return null;
        out.path=local.path.concat(['edges',ref.index]);out.local=authored;
      }
    }
    return out;
  }
  function authoredKeys(t){return t && t.local?trackingRefs(t.local).tickets:[];}
  /* #855: a carrier's Missing work marker. Clearable when this board set it (the
     local carrier, or the consumer overlay of an imported one); a marker the
     provider also sets is inherited, as in the Workbench, and names its source. */
  function marker(t){
    if(!t)return null;
    if(!t.imported)return t.local && t.local.missingWork===true?{clearable:true}:null;
    var m=topologyTrackingTarget(text,t.raw,t.section,t.kind,t.kind==='node'?t.node:t.id,context,t.index);if(m.error)return null;
    if(m.inherited.missingWork)return {clearable:false,source:m.got.d.topologyImports[m.index].spec};
    return m.local.missingWork?{clearable:true}:null;
  }
  // The new text, or the same text when the operation changes nothing.
  // `restore` {at, item}: an add that undoes a pending remove puts the removed entry back where it was (#1253).
  function splice(source,t,op,ticket,match,restore){
    // #1180: a replacement swaps serviceName and operation and keeps the step's other traceMatch fields.
    if(op==='trace-match'){var written=Object.assign({},t.previous || {},{serviceName:match.serviceName,operation:match.operation},typeof match.nodeId==='string' && match.nodeId?{nodeId:match.nodeId}:{}),set=jsonSetField(source,t.path,'traceMatch',JSON.stringify(written));
      // #1290: a step has traceMatch or traceScope, never both: the mapping replaces the scope.
      if(set && t.local && Object.prototype.hasOwnProperty.call(t.local,'traceScope'))set=jsonSetField(set.text,t.path,'traceScope',null);
      return set?set.text:null;}
    if(op==='clear-missing-work'){
      if(t.imported){var cleared=planTopologyTracking(source,t.raw,t.section,t.kind,t.kind==='node'?t.node:t.id,'missingWork',true,true,context,t.index);return cleared.error?null:cleared.text;}
      var removed=jsonSetField(source,t.path,'missingWork',null);
      return removed?removed.text:null;
    }
    if(t.imported){
      var plan=planTopologyTracking(source,t.raw,t.section,t.kind,t.kind==='node'?t.node:t.id,'tickets',ticket,op==='remove',context,t.index);
      return plan.error?null:plan.text;
    }
    var list=Array.isArray(t.local.tickets)?t.local.tickets.slice():[],keys=trackingRefs(t.local).tickets,at=keys.indexOf(ticket);
    if(op==='add'){if(at>=0)return source;if(restore)list.splice(Math.min(restore.at,list.length),0,restore.item);else list.push(ticket);}
    else{
      if(at<0)return source;
      // An authored entry is a key or a Jira browse URL; both name the ticket by its key.
      list=list.filter(function(entry){return (trackingTicket(entry) || {}).key!==ticket;});
    }
    var result=jsonSetField(source,t.path,'tickets',list.length?JSON.stringify(list):null);
    return result?result.text:null;
  }
  function record(t,op,ticket,match){
    var entry={op:op};if(ticket!=null)entry.ticket=ticket;entry.path=t.path.slice();entry.label=t.label;
    if(t.kind==='step'){entry.step=t.step;entry.traceMatch={serviceName:match.serviceName,operation:match.operation};
      // The change describes the full span mapping that results: a nodeId written now or kept from the step (#1192).
      var nodeId=typeof match.nodeId==='string' && match.nodeId?match.nodeId:t.previous && !Array.isArray(t.previous) && typeof t.previous.nodeId==='string' && t.previous.nodeId?t.previous.nodeId:null;if(nodeId)entry.traceMatch.nodeId=nodeId;if(t.previous){entry.replaces={serviceName:t.previous.serviceName,operation:t.previous.operation};if(typeof t.previous.nodeId==='string' && t.previous.nodeId)entry.replaces.nodeId=t.previous.nodeId;}
      // #1290: the traceScope the mapping replaced, so board-sync pull can tell whether a local copy changed it.
      if(t.local && Object.prototype.hasOwnProperty.call(t.local,'traceScope'))entry.replacesScope=JSON.parse(JSON.stringify(t.local.traceScope));}
    else if(t.kind==='node')entry.node=t.node;else entry.edge=t.edge.slice();
    return entry;
  }
  // #1177: the traceMatch a mapping replaces must be the one the caller saw (serviceName and operation), or
  // none. Alternatives arrays compare structurally (#1180); a mapping never replaces one (apply).
  function sameMatch(a,b){
    if(Array.isArray(a) || Array.isArray(b))return Array.isArray(a) && Array.isArray(b) && JSON.stringify(a)===JSON.stringify(b);
    return !a && !b || !!(a && b && a.serviceName===b.serviceName && a.operation===b.operation);
  }
  // `ask`: the post-drop question to raise once the change has rendered (#855).
  function apply(op,ref,ticket,ask,match,previous){
    if(!active || saving || readOnly)return false;
    var t=target(text,ref);if(!t)return false;
    if((op==='trace-match')!==(t.kind==='step'))return false;
    if(op==='trace-match' && !(match && typeof match.serviceName==='string' && match.serviceName && typeof match.operation==='string' && match.operation))return false;
    if(op==='trace-match' && (t.alternatives || !sameMatch(t.previous,previous)))return false;
    if(op==='remove' && authoredKeys(t).indexOf(ticket)<0)return false;
    if(op==='clear-missing-work'){var m=marker(t);if(!m || !m.clearable)return false;}
    // An add or remove that undoes a pending remove or add of the same ticket on the same carrier cancels it
    // (#1253), but only when the carrier's tickets are then exactly as they were before that op; otherwise
    // both stay recorded. A clear or a span mapping has no inverse here. undoMap restores a mapping's exact
    // `before` text only while that text holds no cancelled op, so a mapping made after the cancelled op forgets it.
    var path=JSON.stringify(t.path),inverse=op!=='add' && op!=='remove'?-1:ops.findIndex(function(o){return (o.entry.op==='add' || o.entry.op==='remove') && o.entry.op!==op && o.entry.ticket===ticket && JSON.stringify(o.entry.path)===path;});
    var next=splice(text,t,op,ticket,match,inverse>=0 && ops[inverse].removed || null),before=text;
    if(next==null || next===text)return false;
    // The pending list changes before the render, so the re-rendered board shows the new count at once (#1253);
    // a refused render puts it back.
    var entry=record(t,op,ticket,match),chain=boardEditChain(t.raw,t.path),kept=ops.slice(),befores=ops.map(function(o){return o.before;});
    // Every exact-text snapshot taken after the cancelled op still holds it: drop them all, so no Undo brings it
    // back (#1290 whole-branch review M1: a swap's restore text and its swapped mapping's before).
    if(inverse>=0 && carrierTickets(next,t.path)===ops[inverse].tickets){ops.splice(inverse,1);ops.slice(inverse).forEach(function(o){o.before=undefined;o.restore=undefined;if(o.swapped)o.swapped.before=undefined;});}
    else{
      var made={entry:entry,chain:chain,replayable:boardEditResolveChain(t.raw,chain).length===1,kind:t.kind,previous:op==='trace-match'?t.previous:undefined,before:op==='trace-match'?before:undefined};
      // #1290: the traceScope a mapping replaced, so its Undo can put it back in any edit order.
      if(op==='trace-match' && t.local && Object.prototype.hasOwnProperty.call(t.local,'traceScope'))made.scope=JSON.parse(JSON.stringify(t.local.traceScope));
      if(op==='add' || op==='remove')made.tickets=carrierTickets(text,t.path);
      if(op==='remove' && !t.imported){var list=Array.isArray(t.local.tickets)?t.local.tickets:[],at=list.findIndex(function(item){return (trackingTicket(item) || {}).key===ticket;});if(at>=0)made.removed={at:at,item:list[at]};}
      ops.push(made);
    }
    if(!render(next)){ops=kept;kept.forEach(function(o,i){o.before=befores[i];});return false;}
    question=ask || null;
    changed();return true;
  }
  // The carrier's authored tickets value as JSON (the overlay entry's for an imported carrier), for cancel checks.
  function carrierTickets(source,path){var value=specValueAt(parsed(source),path);return JSON.stringify(value && typeof value==='object' && value.tickets!==undefined?value.tickets:null);}
  function render(next){
    var error=options.render(next);
    if(error){if(win.console)console.warn('flowspec: board edit refused: '+error);return false;}
    text=next;return true;
  }
  // The text from before a mapping (for its Undo) stays out of the stash, and so does a replaced
  // traceScope: replaying a mapping reads it again from the step it is applied to.
  // A mapping also stashes the traceScope it replaced (or that there was none), so a replay can refuse when
  // their version gave the step a scope or changed that one (#1290 whole-branch review M2).
  function stash(){try{win.sessionStorage.setItem(stashKey,JSON.stringify({ops:ops.map(function(o){var s={entry:o.entry,chain:o.chain,replayable:o.replayable,kind:o.kind,previous:o.previous};if(o.entry.op==='trace-match'){s.hadScope=o.scope!==undefined;if(s.hadScope)s.scope=o.scope;}return s;})}));}catch(ex){}}
  function unstash(){try{win.sessionStorage.removeItem(stashKey);}catch(ex){}}
  function history(source,entry){
    var raw=parsed(source),owner=raw && raw.page?['page']:[],page=specValueAt(raw,owner),list=page && page.editHistory,itemText=JSON.stringify(entry,null,2);
    if(!Array.isArray(list)){var made=jsonSetField(source,owner,'editHistory',JSON.stringify([entry],null,2));return made && made.text;}
    var path=owner.concat(['editHistory']);
    for(var n=list.length;n>=BOARD_EDIT_HISTORY_LIMIT;n--){var removed=jsonRemoveMember(source,path,0);if(!removed)return null;source=removed.text;}
    var added=jsonInsertMember(source,path,null,itemText);
    return added && added.text;
  }

  /* Replay after a conflict reload: drop operations that were ambiguous when
     made, then apply each where exactly one carrier matches its chain. */
  function replay(){
    var saved=null;
    try{saved=JSON.parse(win.sessionStorage.getItem(stashKey) || 'null');}catch(ex){saved=null;}
    unstash();
    if(!saved || !Array.isArray(saved.ops) || !saved.ops.length)return;
    // `dropped`: changes whose carrier moved, went or is ambiguous; `refused`: changes whose carrier is there
    // but cannot take them, each with the reason that is true for it (#1290 PR 9 review c2).
    var applied=0,already=0,dropped=[],refused=[];
    function spanName(sp){return sp.serviceName+' · '+sp.operation;}
    saved.ops.forEach(function(op){
      var entry=op && op.entry;if(!entry)return;
      var where=entry.label || entry.node || entry.step || (entry.edge || []).join(' → ');
      var tm=entry.traceMatch || {},sp=entry.span || {};
      var describe=entry.op==='clear-missing-work'?'Missing work cleared from '+where:entry.op==='trace-match'?'span '+tm.serviceName+' · '+tm.operation+' mapped to '+where:entry.op==='trace-span'?'span '+sp.key+' ('+spanName(sp)+') declared on '+where:entry.ticket+' '+(entry.op==='add'?'on ':'off ')+where;
      function refuse(reason){refused.push(describe+' could not be re-applied: '+reason);}
      var raw=parsed(text),paths=op.replayable?boardEditResolveChain(raw,op.chain):[];
      var ref=paths.length===1?refFor(raw,paths[0],op.kind,entry):null;
      if(!ref){dropped.push(describe);return;}
      active=true;
      var before=text;
      // #1290 PR 9: a declaration the winner already has (same key, service and operation) needs nothing.
      if(entry.op==='trace-span'){
        var tt=null;try{tt=target(text,ref);}catch(ex){tt=null;}var have=tt && shownCarrier(tt),theirs=have && have.trace && have.trace.spans && have.trace.spans[entry.span.key];
        // The whole declared span is compared; another span under that key keeps the winner's, and this change is dropped.
        if(theirs){
          if(boardEditSameSpan(theirs,entry.span)){already++;return;}
          var same=theirs.serviceName===sp.serviceName && theirs.operation===sp.operation;
          refuse('their version already declares a different span under '+sp.key+' ('+(typeof theirs.operation==='string'?spanName(theirs):theirs.serviceName+' · '+(theirs.operationPrefix || '')+'…')+(same || theirs.role!==sp.role?', role '+theirs.role:'')+'); declare yours again under another name');
          return;
        }
        // The same span under another key in their version is already there: no second declaration.
        var hs=have && have.trace && have.trace.spans && typeof have.trace.spans==='object'?have.trace.spans:{};
        if(Object.keys(hs).some(function(k){return boardEditSameSpan(hs[k],entry.span);})){already++;return;}
        if(declare(ref,entry.span,entry.span.key,false)){applied++;return;}
        var why=tt?declaration(tt,entry.span,null):null;
        if(why && why.error)refuse(/^Already declared as /.test(why.error)?'their version already declares it as '+why.error.replace(/^Already declared as /,'').replace(/ on .*$/,''):why.error.replace(/\.$/,'').replace(/^./,function(c){return c.toLowerCase();}));
        else dropped.push(describe);
        return;
      }
      // A mapping removes the step's traceScope: never one their version added or changed (#1290 review M2).
      if(entry.op==='trace-match'){
        var at_=specValueAt(parsed(text),paths[0]),theirScope=at_ && typeof at_==='object'?at_.traceScope:undefined;
        if(theirScope!==undefined && (!op.hadScope || JSON.stringify(theirScope)!==JSON.stringify(op.scope))){
          refuse(op.hadScope?'their version changed that step\'s trace scope; edit it in Inspect':'their version gives that step a trace scope; edit it in Inspect');return;}
      }
      if(!apply(entry.op,ref,entry.ticket,null,entry.traceMatch,op.previous) && text===before){
        // A clear with no marker of this board's left to clear is dropped (#855), saying why.
        if(entry.op==='clear-missing-work'){var mk=null;try{mk=marker(target(text,ref));}catch(ex){mk=null;}
          refuse(mk && !mk.clearable?'the Missing work marker on '+where+' comes from '+mk.source+' in their version':'their version has no Missing work marker on '+where+' to clear');return;}
        // A step that already has this exact traceMatch needs nothing; any other is dropped (#1078), saying why.
        if(entry.op==='trace-match'){var step=specValueAt(parsed(text),paths[0]),m=step && step.traceMatch,want=entry.traceMatch || {};
          if(m && m.serviceName===want.serviceName && m.operation===want.operation){already++;return;}
          refuse(Array.isArray(m)?'their version gives that step alternatives; edit it in Inspect':m?'their version maps that step to '+m.serviceName+' · '+m.operation:'their version removed the trace match it replaced');return;}
        // Already true in the winning version: nothing left to do for it.
        var t=null;try{t=target(text,ref);}catch(ex){t=null;}var has=t && authoredKeys(t).indexOf(entry.ticket)>=0;
        if(t && ((entry.op==='add')===has)){already++;return;}
        if(!t){dropped.push(describe);return;}
        // The carrier is there: say why it cannot take the ticket change.
        var inherited=null;
        if(t.imported){try{var it=topologyTrackingTarget(text,t.raw,t.section,t.kind,t.kind==='node'?t.node:t.id,context,t.index);if(!it.error && it.inherited.tickets.indexOf(entry.ticket)>=0)inherited=providerTitle(it.got.d.topologyImports[it.index].spec);}catch(ex){inherited=null;}}
        refuse(inherited?'their version already gets '+entry.ticket+' on '+where+' from '+inherited:entry.op==='add'?'their version could not take '+entry.ticket+' on '+where:'their version could not drop '+entry.ticket+' from '+where);
        return;
      }
      applied++;
    });
    if(!ops.length)active=false;
    // #1253: a change the winning version already has is not re-applied, and "Save again" only when one is pending.
    // One sentence for the counts, then one sentence per refused change (#1290 PR 9 review c3).
    var parts=[applied+' of your changes '+(applied===1?'was':'were')+' re-applied'];
    if(already)parts.push(already+' '+(already===1?'was':'were')+' already in their version');
    if(dropped.length)parts.push(dropped.length+' could not be (carrier moved, removed or ambiguous): '+dropped.join('; '));
    var sentences=refused.map(function(text){return ' '+text.charAt(0).toUpperCase()+text.slice(1)+'.';}).join('');
    notice={kind:'warn',text:'Another editor saved first. '+parts.join('; ')+'.'+sentences+(ops.length?' Save again.':'')};
    changed();
  }
  // A rendered-carrier reference for a concrete path in raw.
  function refFor(raw,path,kind,entry){
    var view=resolved(raw),records=specSectionPaths(raw),section=records.findIndex(function(rec){return boardEditSamePrefix(path,rec.diagram);});
    if(section<0)return null;
    var rest=path.slice(records[section].diagram.length),shown=sectionAt(view,section);if(!shown || !shown.d)return null;
    if(rest[0]==='nodes')return shown.d.nodes && shown.d.nodes[rest[1]]?{section:section,kind:'node',id:rest[1]}:null;
    if(rest[0]==='steps'){var step=specValueAt(raw,path);return kind==='step' && rest.length===2 && step && typeof step.id==='string'?{section:section,kind:'step',id:step.id}:null;}
    if(rest[0]==='edges')return (shown.d.edges || [])[rest[1]]?{section:section,kind:'edge',index:rest[1]}:null;
    if(rest[0]==='topologyImports' && context){
      var imp=specValueAt(raw,records[section].diagram.concat(['topologyImports',rest[1]]));if(!imp || typeof imp.as!=='string')return null;
      var prefix=imp.as+'::';
      if(rest[2]==='nodeTracking'){var id=prefix+rest[3];return shown.d.nodes && shown.d.nodes[id]?{section:section,kind:'node',id:id}:null;}
      if(rest[2]==='edgeTracking'){
        var key=String(rest[3]).split('->').map(function(part){return prefix+part;}).join('->'),matches=[];
        (shown.d.edges || []).forEach(function(edge,i){if(builderEdgeKey(edge)===key)matches.push(i);});
        return matches.length===1?{section:section,kind:'edge',index:matches[0]}:null;
      }
    }
    return null;
  }

  /* #1177: undo the latest pending span mapping. The text from before it comes back exactly when it is the
     last change; otherwise the step's traceMatch is set back to what it replaced. */
  function lastMapping(){for(var i=ops.length-1;i>=0;i--)if(ops[i].entry.op==='trace-match')return i;return -1;}
  function undoMap(){
    if(!active || saving || readOnly)return false;var at=lastMapping();if(at<0)return false;
    var op=ops[at],next=at===ops.length-1 && op.before!=null?op.before:null;
    if(next==null){
      var set=jsonSetField(text,op.entry.path,'traceMatch',op.previous?JSON.stringify(op.previous):null);
      if(set && op.scope!==undefined)set=jsonSetField(set.text,op.entry.path,'traceScope',JSON.stringify(op.scope));
      next=set && set.text;
    }
    if(next==null || !render(next))return false;
    ops.splice(at,1);question=null;changed();return true;
  }
  function beforeUnload(ev){if(!ops.length || reloading)return;ev.preventDefault();ev.returnValue='';return '';}
  win.addEventListener('beforeunload',beforeUnload);

  /* #1290 PR 9: "Declare on this node/connection". A dropped span becomes a declaration
     trace.spans.<key> {serviceName, operation, role} on a local carrier, or an added span in the
     consumer overlay of an imported one. The key is a slug of the operation, unique on the carrier;
     a provider name this board hides is still taken. */
  var DECLARE_ROLES={node:['process','database','cache','call','work'],edge:['send','receive']};
  // The key: the operation's last meaningful segment (after the last "/", skipping {id}, :id and numbers;
  // the whole operation when it has no "/"), slugged and starting with a letter.
  // A provider named by its page title (its spec id when it has none), as the rest of #1290 does.
  function providerTitle(id){
    var specs=context && Array.isArray(context.specs)?context.specs:[],spec=specs.find(function(x){return x && x.page && x.page.canon && x.page.canon.id===id;});
    return spec && typeof spec.page.title==='string' && spec.page.title.trim()?spec.page.title.trim():id;
  }
  function slug(operation){
    var op=String(operation),method=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i.exec(op);
    var parts=op.split('/').map(function(p){return p.trim();}).filter(function(p){return p && !/^\{.*\}$/.test(p) && !/^:/.test(p) && !/^\d+$/.test(p);});
    // A leading HTTP method stays: "GET /orders" is get-orders.
    if(op.indexOf('/')>=0 && parts.length)op=(method?method[1]+' ':'')+parts[parts.length-1].replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i,'');
    var s=op.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    if(!s)s='span';if(!/^[a-z]/.test(s))s='span-'+s;
    return s.slice(0,64).replace(/-+$/,"");
  }
  function shownCarrier(t){
    var view=resolved(t.raw),shown=sectionAt(view,t.section);if(!shown || !shown.d)return null;
    return t.kind==='node'?(shown.d.nodes || {})[t.node]:(shown.d.edges || [])[t.index];
  }
  function takenKeys(t){
    var carrier=shownCarrier(t),keys=[],add=function(k){if(keys.indexOf(k)<0)keys.push(k);};
    var spans=carrier && carrier.trace && carrier.trace.spans && typeof carrier.trace.spans==='object'?carrier.trace.spans:{};Object.keys(spans).forEach(add);
    var own=t.local && t.local.trace && typeof t.local.trace==='object'?t.local.trace:null;
    if(own && own.spans && typeof own.spans==='object')Object.keys(own.spans).forEach(add);
    if(own && Array.isArray(own.hide))own.hide.forEach(function(k){if(typeof k==='string')add(k);});
    return keys;
  }
  function declaration(t,span,key){
    if(!t || (t.kind!=='node' && t.kind!=='edge'))return {error:'Drop the span on a node or connection.'};
    if(!span || typeof span.operation!=='string' || !span.operation.trim())return {error:'This span has no operation, so it cannot be declared.'};
    if(typeof span.serviceName!=='string' || !span.serviceName.trim())return {error:'This span has no service name, so it cannot be declared.'};
    if(DECLARE_ROLES[t.kind].indexOf(span.role)<0)return {error:t.kind==='node'?'A node\'s span role is one of process, database, cache, call or work.':'A connection\'s span role is send or receive.'};
    // A span this carrier already declares (inherited or its own) under another key is not declared twice.
    if(!key){var have=shownCarrier(t),hs=have && have.trace && have.trace.spans && typeof have.trace.spans==='object'?have.trace.spans:{};
      var same=Object.keys(hs).find(function(k){var x=hs[k];return x && x.serviceName===span.serviceName && x.operation===span.operation && x.role===span.role;});
      if(same)return {error:'Already declared as '+same+' on '+t.label+'.'};}
    var taken=takenKeys(t),base=key || slug(span.operation),next=base,n=2;
    while(taken.indexOf(next)>=0)next=base+'-'+(n++);
    return {key:next,span:{serviceName:span.serviceName,operation:span.operation,role:span.role}};
  }
  // The text with `key` set to `value` (null removes it) in the carrier's own trace, or null.
  function writeSpan(source,t,key,value){
    var own=t.local && t.local.trace && typeof t.local.trace==='object'?JSON.parse(JSON.stringify(t.local.trace)):{};
    var spans=own.spans && typeof own.spans==='object'?own.spans:{};
    if(value)spans[key]=value;else delete spans[key];
    if(Object.keys(spans).length)own.spans=spans;else delete own.spans;
    var empty=!Object.keys(own).length;
    if(t.imported){var plan=planTopologyTracking(source,t.raw,t.section,t.kind,t.kind==='node'?t.node:t.id,'trace',empty?null:own,empty,context,t.index);return plan.error?null:plan.text;}
    var set=jsonSetField(source,t.path,'trace',empty?null:JSON.stringify(own));return set?set.text:null;
  }
  // The text without pending mapping op `op` (its exact `before` when it is the last change).
  function withoutMapping(source,op,last){
    if(last && op.before!=null)return op.before;
    var set=jsonSetField(source,op.entry.path,'traceMatch',op.previous?JSON.stringify(op.previous):null);
    if(set && op.scope!==undefined)set=jsonSetField(set.text,op.entry.path,'traceScope',JSON.stringify(op.scope));
    return set?set.text:null;
  }
  /* `swap`: "Declare on <title> instead" (team-lead ruling, #1290 PR 9): the latest pending mapping is
     taken out and the declaration takes its place, one pending change; its Undo restores the mapping. */
  function declare(ref,span,key,swap){
    if(!active || saving || readOnly)return false;
    var at=swap?lastMapping():-1;if(swap && at<0)return false;
    var source=swap?withoutMapping(text,ops[at],at===ops.length-1):text;if(source==null)return false;
    var t;try{t=target(source,ref);}catch(ex){t=null;}if(!t || t.kind==='step')return false;
    var d=declaration(t,span,key);if(d.error)return false;
    var next=writeSpan(source,t,d.key,d.span),before=text;
    if(next==null || next===source)return false;
    var entry={op:'trace-span',path:t.path.slice(),label:t.label};
    if(t.kind==='node')entry.node=t.node;else entry.edge=t.edge.slice();
    entry.span={key:d.key,serviceName:d.span.serviceName,operation:d.span.operation,role:d.span.role};
    var chain=boardEditChain(t.raw,t.path),kept=ops.slice(),befores=ops.map(function(o){return o.before;});
    var made={entry:entry,chain:chain,replayable:boardEditResolveChain(t.raw,chain).length===1,kind:t.kind,before:swap?null:before};
    if(swap){made.swapped=ops[at];made.restore=before;if(at!==ops.length-1)ops[at].before=undefined;ops.splice(at,1);ops.slice(at).forEach(function(o){if(o.entry.op==='trace-match')o.before=undefined;});}
    ops.push(made);
    if(!render(next)){ops=kept;kept.forEach(function(o,i){o.before=befores[i];});return false;}
    question=null;changed();return true;
  }
  function lastDeclaration(){for(var i=ops.length-1;i>=0;i--)if(ops[i].entry.op==='trace-span')return i;return -1;}
  function undoDeclare(){
    if(!active || saving || readOnly)return false;var at=lastDeclaration();if(at<0)return false;
    var op=ops[at],last=at===ops.length-1,next=null;
    // A swapped-in declaration that is the last change: the exact text with the mapping comes back.
    if(last && op.swapped && op.restore!=null)next=op.restore;
    else if(last && op.before!=null)next=op.before;
    else{
      var raw=parsed(text),ref=refFor(raw,op.entry.path,op.kind,op.entry),t=null;try{t=ref && target(text,ref);}catch(ex){t=null;}
      next=t?writeSpan(text,t,op.entry.span.key,null):null;
      // Then the mapping it replaced goes back on its step, as it was.
      if(next!=null && op.swapped){var m=op.swapped,tm=m.entry.traceMatch,written=Object.assign({},m.previous && !Array.isArray(m.previous)?m.previous:{},{serviceName:tm.serviceName,operation:tm.operation},typeof tm.nodeId==='string'?{nodeId:tm.nodeId}:{});
        var set=jsonSetField(next,m.entry.path,'traceMatch',JSON.stringify(written));if(set && m.scope!==undefined)set=jsonSetField(set.text,m.entry.path,'traceScope',null);next=set?set.text:null;}
    }
    if(next==null || !render(next))return false;
    ops.splice(at,1);
    if(op.swapped){op.swapped.before=last?op.swapped.before:undefined;ops.push(op.swapped);}
    changed();return true;
  }
  // Which pending trace change is newest, for the one result note the Trace view shows.
  function lastTrace(){if(readOnly)return null;for(var i=ops.length-1;i>=0;i--){if(ops[i].entry.op==='trace-match')return 'map';if(ops[i].entry.op==='trace-span')return 'declare';}return null;}
  function declared(){var at=lastDeclaration();if(at<0 || readOnly)return null;var e=ops[at].entry;return {key:e.span.key,label:e.label,span:{serviceName:e.span.serviceName,operation:e.span.operation,role:e.span.role}};}

  // The latest pending span mapping, for the result note and its Undo (#1177).
  function mapped(){var at=lastMapping();if(at<0 || readOnly)return null;var e=ops[at].entry,out={step:e.step,label:e.label,traceMatch:{serviceName:e.traceMatch.serviceName,operation:e.traceMatch.operation}};if(ops[at].scope!==undefined)out.replacedScope=true;return out;}
  var api={
    state:function(){
      return {editable:canEdit && !!artifact && !readOnly,blocked:fallback?"Editing is off: this board couldn't load its latest version, so saving would overwrite newer changes.":'',
        active:active && !readOnly,pending:ops.length,saving:saving,readOnly:readOnly,notice:notice?{kind:notice.kind,text:notice.text}:null,mapped:mapped(),declared:declared(),lastTrace:lastTrace()};
    },
    onChange:function(fn){listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    start:function(){if(!canEdit || !artifact || fallback || readOnly || active)return;active=true;notice=null;changed();},
    done:function(){if(!active || ops.length || saving)return;active=false;question=null;changed();},
    /* A drop that adds a ticket to a carrier with a clearable Missing work marker
       asks whether the ticket covers it (#855); the answer is never automatic. */
    add:function(ref,ticket){var m=null;try{m=marker(target(text,ref));}catch(ex){m=null;}return apply('add',ref,ticket,m && m.clearable?{ref:ref,ticket:ticket}:null);},
    remove:function(ref,ticket){return apply('remove',ref,ticket);},
    clearMissingWork:function(ref){return apply('clear-missing-work',ref);},
    // #1078: write traceMatch {serviceName, operation} on a step of ref.section. A step that has one is
    // replaced only when `previous` names it (#1177).
    mapSpan:function(ref,match,previous){return apply('trace-match',ref,null,null,match,previous || null);},
    undoMap:undoMap,
    // #1290 PR 9: declare a dropped span on a node or connection; the preview names its key first.
    declareSpan:function(ref,span){return declare(ref,span,null,false);},
    declareInstead:function(ref,span){return declare(ref,span,null,true);},
    declarePreview:function(ref,span){var t=null;try{t=target(text,ref);}catch(ex){t=null;}if(!t)return {error:'That node or connection is not on this board.'};var d=declaration(t,span,null);return d.error?{error:d.error}:{key:d.key};},
    undoDeclare:undoDeclare,
    // {clearable:true} for a marker set on this board, {clearable:false, source} for a provider-inherited one, else null.
    missingWork:function(ref){if(!active || readOnly)return null;try{return marker(target(text,ref));}catch(ex){return null;}},
    question:function(){return active && !readOnly && question?{ref:question.ref,ticket:question.ticket}:null;},
    endQuestion:function(){question=null;},
    // Tickets authored on this carrier itself: local tickets, or the consumer
    // overlay's for an imported one. Provider-inherited and availability rows are not.
    removable:function(ref){if(!active || readOnly)return [];try{return authoredKeys(target(text,ref));}catch(ex){return [];}},
    discard:function(){
      if(!ops.length || saving)return;
      ops=[];active=false;notice=null;question=null;
      if(!render(base))text=base;
      changed();
    },
    save:function(){
      if(!ops.length || saving || readOnly || fallback || !artifact)return;
      saving=true;notice=null;question=null;changed();
      var changes=ops.map(function(op){return op.entry;});
      Promise.resolve(user && user.me ? user.me() : null).then(function(me){
        var by={};if(me && typeof me.id==='string' && me.id)by.id=me.id;if(me && typeof me.name==='string' && me.name)by.name=me.name;
        var entry={at:new Date().toISOString()};if(Object.keys(by).length)entry.by=by;entry.changes=changes;
        var next=history(text,entry);if(!next)throw {code:'invalid_content',message:'could not record the edit history'};
        stash();
        return Promise.resolve(artifact.publish({'flowspec.json':{content:next,contentType:'application/json'}})).then(function(){return next;});
      }).then(function(next){
        unstash();saving=false;ops=[];active=false;base=next;
        if(!render(next))text=next;
        changed();
      },function(error){
        saving=false;var code=error && error.code;
        if(code==='conflict'){
          // The runtime reloads this view to the winning version; the stash replays
          // there, so that reload must not raise the leave-page warning.
          reloading=true;notice={kind:'warn',text:'Another editor saved first. Loading their version…'};changed();return;
        }
        unstash();
        if(BOARD_EDIT_READ_ONLY.indexOf(code)>=0){
          readOnly=true;active=false;ops=[];notice={kind:'info',text:'This board is read-only here: your changes were not saved.'};
          if(!render(base))text=base;
          changed();return;
        }
        notice={kind:'error',text:'Save failed: '+(error && error.message || code || 'unknown error')+'. Your changes are still pending.'};changed();
      });
    },
    rememberMap:function(map){lastMap=map;},
    lastMap:function(){return lastMap;},
    // #1078: the Trace view a retiring controller showed, handed once to the next render's.
    rememberTrace:function(value){carriedTrace=value || null;},
    takeTrace:function(){var value=carriedTrace;carriedTrace=null;return value;},
    // #1253: where keyboard focus goes after an edit control or a popover edit, kept across the re-render it causes.
    rememberFocus:function(value){carriedFocus=value || null;},
    focusIntent:function(){return carriedFocus;},
    text:function(){return text;}
  };

  /* Runtime: Edit appears only when the viewer can edit and the artifact
     capability resolves. use() never rejects by contract; guard anyway. */
  var claude=null;try{claude=win.claude;}catch(ex){claude=null;}
  if(claude && typeof claude.use==='function'){
    Promise.all([
      Promise.resolve().then(function(){return claude.use('artifact');}).catch(function(){return null;}),
      Promise.resolve().then(function(){return claude.use('user');}).catch(function(){return null;})
    ]).then(function(found){
      artifact=found[0] && typeof found[0].publish==='function'?found[0]:null;user=found[1];
      return user && typeof user.canEdit==='function'?Promise.resolve(user.canEdit()).catch(function(){return false;}):false;
    }).then(function(value){
      canEdit=value===true;
      if(canEdit && artifact && !fallback)replay();else unstash();
      changed();
    });
  }
  return api;
}
