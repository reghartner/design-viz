/* Shared-board Edit mode (#828, design #825). A tracked board published as
   index.html + flowspec.json lets people with edit access add a ticket to a node
   or edge (drag a Tickets row) and remove one authored there (carrier popover),
   then Save publishes flowspec.json through the artifact runtime.

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
    if(index<chain.length-1 && (!value || typeof value!=='object' || !Object.prototype.hasOwnProperty.call(value,part)))return;
    walk(value?value[part]:undefined,index+1,path.concat([part]));
  })(raw,0,[]);
  return found;
}
function boardEditSamePrefix(path,prefix){return prefix.every(function(part,i){return path[i]===part;});}

function createBoardEditor(options){
  var win=options.win || window,text=options.text,base=text,context=options.context || null,fallback=options.fallback || null;
  var ops=[],active=false,saving=false,readOnly=false,reloading=false,canEdit=false,artifact=null,user=null,notice=null,listeners=[],lastMap=null;
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
  // The new text, or the same text when the operation changes nothing.
  function splice(source,t,op,ticket){
    if(t.imported){
      var plan=planTopologyTracking(source,t.raw,t.section,t.kind,t.kind==='node'?t.node:t.id,'tickets',ticket,op==='remove',context,t.index);
      return plan.error?null:plan.text;
    }
    var list=Array.isArray(t.local.tickets)?t.local.tickets.slice():[],keys=trackingRefs(t.local).tickets,at=keys.indexOf(ticket);
    if(op==='add'){if(at>=0)return source;list.push(ticket);}
    else{
      if(at<0)return source;
      list=list.filter(function(entry){return (typeof entry==='string'?entry:entry && entry.key)!==ticket;});
    }
    var result=jsonSetField(source,t.path,'tickets',list.length?JSON.stringify(list):null);
    return result?result.text:null;
  }
  function record(t,op,ticket){
    var entry={op:op,ticket:ticket,path:t.path.slice(),label:t.label};
    if(t.kind==='node')entry.node=t.node;else entry.edge=t.edge.slice();
    return entry;
  }
  function apply(op,ref,ticket){
    if(!active || saving || readOnly)return false;
    var t=target(text,ref);if(!t)return false;
    if(op==='remove' && authoredKeys(t).indexOf(ticket)<0)return false;
    var next=splice(text,t,op,ticket);
    if(next==null || next===text)return false;
    if(!render(next))return false;
    var entry=record(t,op,ticket),chain=boardEditChain(t.raw,t.path);
    // An operation that undoes a pending one cancels it.
    var inverse=ops.findIndex(function(o){return o.ticket===ticket && o.op!==op && JSON.stringify(o.path)===JSON.stringify(entry.path);});
    if(inverse>=0)ops.splice(inverse,1);
    else ops.push({entry:entry,chain:chain,replayable:boardEditResolveChain(t.raw,chain).length===1,kind:t.kind});
    changed();return true;
  }
  function render(next){
    var error=options.render(next);
    if(error){if(win.console)console.warn('flowspec: board edit refused: '+error);return false;}
    text=next;return true;
  }
  function stash(){try{win.sessionStorage.setItem(stashKey,JSON.stringify({ops:ops}));}catch(ex){}}
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
    var applied=0,dropped=[];
    saved.ops.forEach(function(op){
      var entry=op && op.entry;if(!entry)return;
      var describe=entry.ticket+' '+(entry.op==='add'?'on ':'off ')+(entry.label || entry.node || (entry.edge || []).join(' → '));
      var raw=parsed(text),paths=op.replayable?boardEditResolveChain(raw,op.chain):[];
      var ref=paths.length===1?refFor(raw,paths[0],op.kind,entry):null;
      if(!ref){dropped.push(describe);return;}
      active=true;
      var before=text;
      if(!apply(entry.op,ref,entry.ticket) && text===before){
        // Already true in the winning version: nothing left to do for it.
        var t=target(text,ref);var has=t && authoredKeys(t).indexOf(entry.ticket)>=0;
        if(t && ((entry.op==='add')===has))applied++;else dropped.push(describe);
        return;
      }
      applied++;
    });
    if(!ops.length)active=false;
    notice={kind:'warn',text:'Another editor saved first. '+applied+' of your changes were re-applied; '+dropped.length+' could not be (carrier moved, removed or ambiguous)'+(dropped.length?': '+dropped.join('; '):'')+'. Save again.'};
    changed();
  }
  // A rendered-carrier reference for a concrete path in raw.
  function refFor(raw,path,kind,entry){
    var view=resolved(raw),records=specSectionPaths(raw),section=records.findIndex(function(rec){return boardEditSamePrefix(path,rec.diagram);});
    if(section<0)return null;
    var rest=path.slice(records[section].diagram.length),shown=sectionAt(view,section);if(!shown || !shown.d)return null;
    if(rest[0]==='nodes')return shown.d.nodes && shown.d.nodes[rest[1]]?{section:section,kind:'node',id:rest[1]}:null;
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

  function beforeUnload(ev){if(!ops.length || reloading)return;ev.preventDefault();ev.returnValue='';return '';}
  win.addEventListener('beforeunload',beforeUnload);

  var api={
    state:function(){
      return {editable:canEdit && !!artifact && !readOnly,blocked:fallback?"Editing is off: this board couldn't load its latest version, so saving would overwrite newer changes.":'',
        active:active && !readOnly,pending:ops.length,saving:saving,readOnly:readOnly,notice:notice?{kind:notice.kind,text:notice.text}:null};
    },
    onChange:function(fn){listeners.push(fn);return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},
    start:function(){if(!canEdit || !artifact || fallback || readOnly || active)return;active=true;notice=null;changed();},
    done:function(){if(!active || ops.length || saving)return;active=false;changed();},
    add:function(ref,ticket){return apply('add',ref,ticket);},
    remove:function(ref,ticket){return apply('remove',ref,ticket);},
    // Tickets authored on this carrier itself: local tickets, or the consumer
    // overlay's for an imported one. Provider-inherited and availability rows are not.
    removable:function(ref){if(!active || readOnly)return [];try{return authoredKeys(target(text,ref));}catch(ex){return [];}},
    discard:function(){
      if(!ops.length || saving)return;
      ops=[];active=false;notice=null;
      if(!render(base))text=base;
      changed();
    },
    save:function(){
      if(!ops.length || saving || readOnly || fallback || !artifact)return;
      saving=true;notice=null;changed();
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
