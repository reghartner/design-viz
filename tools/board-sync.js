#!/usr/bin/env node
'use strict';
/* board-sync.js — bring a live board's saved edits into an agent's local spec, and log the
   agent's own change on the board (#974).

   Usage:
     node tools/board-sync.js pull <local.json> <live.json> [--resolve KEY=live|local ...]
     node tools/board-sync.js log  <local.json> <live.json> --by <name> [--id <user id>]
                                   [--summary <one line>] [--confirm KEY ...]
   KEY is a Jira key, step:<step id> for a step's traceMatch, or span:<carrier>/<span key> for a
   span declared on a node or connection (#1290; the carrier is the node id or from->to, so quote
   it in a shell: --resolve 'span:a->b/key=live'; plain span:<span key> works only while the
   board's new declarations use that key on one node or connection).

   <live.json> is the board's current flowspec.json, read from the artifact. <local.json> is
   the agent's copy; both commands rewrite it in place and never touch <live.json>.

   A two-file board's Edit mode (#828, #855, #1078) can add a ticket to a node or edge, remove
   one, clear a Missing work marker, and map a trace span to a step, replacing a single
   traceMatch (the change then names it as `replaces`, #1180); each Save appends one
   page.editHistory entry. `pull` folds the entries the local copy
   lacks into it: three-way per ticket, by carrier identity (the same identity chain the
   board uses for its own conflict replay), with the base being the live file with those
   entries' operations undone, so local changes are kept. A step's base is the `replaces` of
   its oldest fresh mapping (none for a first mapping): the newest mapping is set on the local
   step (same chain: section id, step id) when it still equals that base, keeping its other
   traceMatch fields; a local step that already names the newest span is kept; anything
   else, or a deleted step, is a conflict. nodeId merges the same way on its own (#1192),
   and a nodeId whose node the local copy lacks is a conflict. A mapping removes the step's
   traceScope (#1290): a local scope equal to the one the board's mapping replaced goes with it;
   any other local scope is a conflict. Every other line of the local file stays as written.

   A span declared on a node or connection (#1290, "Declare on this node") reaches the same carrier
   in the local copy, found as tickets are (the consumer overlay for an imported one). A local span
   that is the same in every field, under that key or another, is kept; another span under that key,
   a local hide of that key, or a carrier (or its import) the local copy no longer has is a conflict.
   `log` counts span declarations changed locally, and guards those a board edit declared after
   the newest agent entry as it guards tickets and step mappings.

   `log` appends one agent entry ({source: "agent", summary, changes}) describing the change
   from the live file to the local copy, after the local copy holds every live entry.

   Exit status: 0 done; 2 a conflict the author must decide (nothing written); 3 start again
   (pull: the live board was republished from another copy; log: pull first; nothing
   written); 1 bad input. */

const fs=require('node:fs'),vm=require('node:vm');
const loader=require('./source-loader.cjs');

/* The board's own helpers: identity chains (viewer/board-edit.js), text splices that keep
   the file's formatting (workbench/source-edit.js), spec paths and ticket keys. */
const C={URL,TextEncoder};
vm.createContext(C);
vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','viewer/board-edit.js']),C);

const HISTORY_LIMIT=200,SUMMARY_MAX=200;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const isObject=value=>!!value && typeof value==='object' && !Array.isArray(value);
const isAgent=entry=>isObject(entry) && entry.source==='agent';
const who=entry=>(isObject(entry) && isObject(entry.by) && typeof entry.by.name==='string' && entry.by.name) || 'Someone';
const when=at=>{const date=new Date(at);return isFinite(date.getTime())?date.toISOString().slice(0,16).replace('T',' ')+' UTC':String(at);};
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(isObject(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function parse(text,name){try{return JSON.parse(text);}catch(error){throw new Error(name+' is not valid JSON: '+error.message);}}
function history(raw){const page=raw && raw.page?raw.page:raw;return page && Array.isArray(page.editHistory)?page.editHistory.filter(isObject):[];}
function ticketKey(entry){return C.trackingRefs({tickets:[entry]}).tickets[0] || null;}
function changeLabel(change){
  if(typeof change.label==='string' && change.label)return change.label;
  if(typeof change.node==='string')return change.node;
  return Array.isArray(change.edge)?change.edge.join(' → '):'a node or edge';
}

/* Every ticket carrier of a spec, keyed by its identity chain: section nodes and edges, and
   the consumer overlay entries of imported nodes and edges. Two identical edges share one
   key; such keys are ambiguous and never merged, as on the board. */
function inventory(raw){
  const map=new Map(),ambiguous=new Set();
  function put(path,obj,info){
    const chain=C.boardEditChain(raw,path),key=JSON.stringify(chain);
    if(map.has(key)){ambiguous.add(key);map.delete(key);return;}
    if(ambiguous.has(key))return;
    const entries=isObject(obj) && Array.isArray(obj.tickets)?obj.tickets:[];
    map.set(key,Object.assign({key,chain,path,entries,tickets:entries.map(ticketKey).filter(Boolean),missingWork:isObject(obj) && obj.missingWork===true},info));
  }
  C.specSectionPaths(raw).forEach(record=>{
    const diagram=C.specValueAt(raw,record.diagram);if(!isObject(diagram))return;
    const nodes=isObject(diagram.nodes)?diagram.nodes:{},title=id=>isObject(nodes[id]) && typeof nodes[id].title==='string' && nodes[id].title || id;
    Object.keys(nodes).forEach(id=>put(record.diagram.concat(['nodes',id]),nodes[id],{kind:'node',node:id,label:title(id)}));
    (Array.isArray(diagram.edges)?diagram.edges:[]).forEach((edge,index)=>{
      if(!isObject(edge))return;
      put(record.diagram.concat(['edges',index]),edge,{kind:'edge',edge:[edge.from,edge.to],label:title(edge.from)+' → '+title(edge.to)});
    });
    (Array.isArray(diagram.topologyImports)?diagram.topologyImports:[]).forEach((imp,index)=>{
      if(!isObject(imp))return;
      ['nodeTracking','edgeTracking'].forEach(field=>{
        const overlay=isObject(imp[field])?imp[field]:{};
        Object.keys(overlay).forEach(rel=>put(record.diagram.concat(['topologyImports',index,field,rel]),overlay[rel],overlayInfo(imp,field,rel)));
      });
    });
  });
  return {map,ambiguous};
}
function overlayInfo(imp,field,rel){
  const prefix=typeof imp.as==='string'?imp.as+'::':'';
  if(field==='nodeTracking')return {kind:'overlay',field,rel,node:prefix+rel,label:prefix+rel};
  const ends=String(rel).split('->').map(part=>prefix+part);
  return {kind:'overlay',field,rel,edge:ends,label:ends.join(' → ')};
}
/* #1078: every step with an id, keyed by its identity chain (section id, step id), with its
   traceMatch: an object, or an alternatives array (#1100). Duplicate keys are ambiguous and
   never merged. */
function stepInventory(raw){
  const map=new Map(),ambiguous=new Set();
  C.specSectionPaths(raw).forEach(record=>{
    const diagram=C.specValueAt(raw,record.diagram);if(!isObject(diagram) || !Array.isArray(diagram.steps))return;
    diagram.steps.forEach((step,index)=>{
      if(!isObject(step) || typeof step.id!=='string' || !step.id)return;
      const path=record.diagram.concat(['steps',index]),key=JSON.stringify(C.boardEditChain(raw,path));
      if(map.has(key)){ambiguous.add(key);map.delete(key);return;}
      if(ambiguous.has(key))return;
      const text=typeof step.text==='string'?step.text.replace(/\s+/g,' ').trim():'';
      map.set(key,{key,path,id:step.id,label:text || step.id,traceMatch:step.traceMatch!=null?step.traceMatch:null,traceScope:step.traceScope});
    });
  });
  return map;
}
const spanText=match=>Array.isArray(match)?match.map(spanText).join(' or '):isObject(match)?match.serviceName+' · '+match.operation:JSON.stringify(match);
// The same single span. An alternatives array is never the board's one mapping.
const sameSpan=(a,b)=>isObject(a) && isObject(b) && a.serviceName===b.serviceName && a.operation===b.operation;
// The step a trace-match change names in `raw`: its recorded path when that still holds the same step id, else the step id when unique.
function stepKey(raw,steps,change){
  if(Array.isArray(change.path) && change.path.length){const key=JSON.stringify(C.boardEditChain(raw,change.path)),step=steps.get(key);if(step && step.id===change.step)return key;}
  const found=[...steps.values()].filter(step=>step.id===change.step);
  return found.length===1?found[0].key:null;
}
const isMapping=change=>isObject(change) && change.op==='trace-match' && isObject(change.traceMatch);
const isOverlayChain=chain=>chain.some((part,i)=>part==='topologyImports' && (chain[i+2]==='nodeTracking' || chain[i+2]==='edgeTracking'));
function edgeEnds(carrier){return carrier.kind==='edge'?JSON.stringify([JSON.stringify(carrier.chain.slice(0,-1)),carrier.edge]):null;}

/* Re-key the local inventory onto the live one: an edge relabeled locally keeps its live
   identity when its endpoints match exactly one live edge of the same section that the local
   copy does not also have. */
function aligned(local,live){
  const out=new Map(),byEnds=new Map();
  live.map.forEach(carrier=>{const ends=edgeEnds(carrier);if(!ends || local.map.has(carrier.key))return;byEnds.set(ends,(byEnds.get(ends) || []).concat([carrier.key]));});
  local.map.forEach(carrier=>{
    let key=carrier.key;
    if(!live.map.has(key) && carrier.kind==='edge'){const matches=byEnds.get(edgeEnds(carrier)) || [];if(matches.length===1)key=matches[0];}
    out.set(key,Object.assign({},carrier,{key}));
  });
  return out;
}

/* The carrier key a history change names in `raw`: its recorded path when that path still
   resolves to one carrier there, else its node id or edge endpoints when unique. */
function changeKey(raw,map,change){
  if(Array.isArray(change.path) && change.path.length){
    const chain=C.boardEditChain(raw,change.path);
    if(C.boardEditResolveChain(raw,chain).length===1)return JSON.stringify(chain);
  }
  const found=[...map.values()].filter(carrier=>typeof change.node==='string'?carrier.node===change.node:
    Array.isArray(change.edge) && Array.isArray(carrier.edge) && carrier.edge[0]===change.edge[0] && carrier.edge[1]===change.edge[1]);
  return found.length===1?found[0].key:null;
}

function placements(map){
  const where=new Map();
  map.forEach(carrier=>carrier.tickets.forEach(ticket=>{if(!where.has(ticket))where.set(ticket,[]);where.get(ticket).push(carrier.key);}));
  return where;
}
const sameSet=(a,b)=>a.length===b.length && a.every(key=>b.includes(key));
const labels=(keys,...maps)=>keys.length?keys.map(key=>{for(const map of maps){const carrier=map.get(key);if(carrier)return carrier.label;}return 'a node or edge';}).join(', '):'no node or edge';

/* One readable line per ticket of a history entry: a remove and an add of the same ticket
   read as a move. */
function describe(entry){
  const lines=[],seen=new Map();
  (Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{
    if(!isObject(change))return;
    if(change.op==='clear-missing-work'){lines.push({text:'Missing work cleared from '+changeLabel(change)});return;}
    // #1290: Edit mode declared a trace span on a node or connection; it moves no ticket.
    if(change.op==='trace-span' && isObject(change.span)){lines.push({text:change.span.key+' ('+spanText(change.span)+') declared on '+changeLabel(change)});return;}
    // #1078: Edit mode mapped a trace span to a step; it moves no ticket.
    if(change.op==='trace-match'){const m=isObject(change.traceMatch)?change.traceMatch:{};lines.push({text:m.serviceName+' · '+m.operation+' mapped to step '+(typeof change.label==='string' && change.label?change.label:change.step)+(isObject(change.replaces)?' (replaced '+spanText(change.replaces)+')':'')});return;}
    if(typeof change.ticket!=='string')return;
    if(!seen.has(change.ticket)){const item={ticket:change.ticket,adds:[],removes:[]};seen.set(change.ticket,item);lines.push(item);}
    seen.get(change.ticket)[change.op==='remove'?'removes':'adds'].push(changeLabel(change));
  });
  return lines.flatMap(item=>{
    if(item.text)return [item.text];
    if(item.adds.length===1 && item.removes.length===1)return [item.ticket+' moved from '+item.removes[0]+' to '+item.adds[0]];
    return item.adds.map(label=>item.ticket+' added to '+label).concat(item.removes.map(label=>item.ticket+' removed from '+label));
  });
}
const sortedByTime=entries=>entries.map((entry,index)=>({entry,index,at:Date.parse(entry.at)})).sort((a,b)=>(a.at-b.at) || (a.index-b.index)).map(item=>item.entry);

/* ---- text edits on the local file ---- */
function owner(raw){return raw && raw.page?['page']:[];}
function appendHistory(text,entries){
  for(const entry of entries){
    const raw=JSON.parse(text),path=owner(raw),list=C.specValueAt(raw,path.concat(['editHistory'])),item=JSON.stringify(entry,null,2);
    let next=Array.isArray(list)?C.jsonInsertMember(text,path.concat(['editHistory']),null,item):C.jsonSetField(text,path,'editHistory','[\n'+item+'\n]');
    if(!next)throw new Error('could not write page.editHistory in the local file');
    text=next.text;
    for(let length=(Array.isArray(list)?list.length:0)+1;length>HISTORY_LIMIT;length--){
      const removed=C.jsonRemoveMember(text,path.concat(['editHistory']),0);if(!removed)throw new Error('could not trim page.editHistory');text=removed.text;
    }
  }
  return text;
}
function setField(text,path,field,value){const next=C.jsonSetField(text,path,field,value);if(!next)throw new Error('could not write '+path.concat([field]).join('.')+' in the local file');return next.text;}
/* Applies per-carrier ticket and Missing work targets. Local carriers splice their own
   fields; an imported carrier rewrites its overlay map, as the board's Edit mode does. */
function applyTargets(text,raw,targets){
  const overlays=new Map();
  targets.forEach(target=>{
    const carrier=target.carrier;
    if(carrier.kind!=='overlay'){
      if(target.tickets)text=setField(text,carrier.path,'tickets',target.tickets.length?JSON.stringify(target.tickets):null);
      if(target.missingWork!==undefined)text=setField(text,carrier.path,'missingWork',target.missingWork?'true':null);
      return;
    }
    const importPath=carrier.path.slice(0,-2),field=carrier.path[carrier.path.length-2],rel=carrier.path[carrier.path.length-1],id=JSON.stringify([importPath,field]);
    if(!overlays.has(id)){const current=C.specValueAt(raw,importPath.concat([field]));overlays.set(id,{importPath,field,map:isObject(current)?JSON.parse(JSON.stringify(current)):{}});}
    const map=overlays.get(id).map,value=isObject(map[rel])?map[rel]:{};
    if(target.tickets){if(target.tickets.length)value.tickets=target.tickets;else delete value.tickets;}
    if(target.missingWork!==undefined){if(target.missingWork)value.missingWork=true;else delete value.missingWork;}
    if(Object.keys(value).length)map[rel]=value;else delete map[rel];
  });
  overlays.forEach(({importPath,field,map})=>{text=setField(text,importPath,field,Object.keys(map).length?JSON.stringify(map):null);});
  return text;
}

/* ---- pull ---- */
function pull(localText,liveText,options){
  const resolve=(options && options.resolve) || {};
  const localRaw=parse(localText,'the local file'),liveRaw=parse(liveText,'the live file');
  const known=new Set(history(localRaw).map(canonical)),fresh=history(liveRaw).filter(entry=>!known.has(canonical(entry)));
  const edits=sortedByTime(fresh).map(entry=>({at:entry.at,by:who(entry),lines:describe(entry)}));
  const republished=fresh.filter(isAgent);
  if(republished.length)return {status:'republished',text:localText,edits,conflicts:[],republished:sortedByTime(republished).map(entry=>({at:entry.at,by:who(entry),summary:entry.summary}))};
  if(!fresh.length)return {status:'up-to-date',text:localText,edits,conflicts:[]};

  const live=inventory(liveRaw),local=inventory(localRaw),mine=aligned(local,live);
  // The base: the live carriers with the new entries undone, newest first.
  const base=new Map([...live.map].map(([key,carrier])=>[key,Object.assign({},carrier,{tickets:carrier.tickets.slice()})]));
  const touched=new Map(),unplaced=[];
  sortedByTime(fresh).reverse().forEach(entry=>{
    (Array.isArray(entry.changes)?entry.changes:[]).slice().reverse().forEach(change=>{
      if(!isObject(change) || change.op==='trace-match' || change.op==='trace-span')return;
      const key=changeKey(liveRaw,live.map,change);
      if(key===null){unplaced.push(who(entry)+' '+when(entry.at)+': '+describe({changes:[change]}).join('; '));return;}
      if(!base.has(key)){const chain=JSON.parse(key);base.set(key,{key,chain,path:change.path,kind:isOverlayChain(chain)?'overlay':'unknown',label:changeLabel(change),tickets:[],missingWork:false});}
      const carrier=base.get(key);
      if(change.op==='clear-missing-work'){carrier.missingWork=true;return;}
      if(typeof change.ticket!=='string')return;
      if(!touched.has(change.ticket))touched.set(change.ticket,entry);
      if(change.op==='add')carrier.tickets=carrier.tickets.filter(ticket=>ticket!==change.ticket);
      else if(change.op==='remove' && !carrier.tickets.includes(change.ticket))carrier.tickets.push(change.ticket);
    });
  });

  // #1078: the newest board mapping of each step, and (#1180) the base its oldest fresh one replaced.
  const liveSteps=stepInventory(liveRaw),localSteps=stepInventory(localRaw),mappings=new Map();
  sortedByTime(fresh).forEach(entry=>(Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{
    if(!isMapping(change))return;
    const key=stepKey(liveRaw,liveSteps,change);
    if(key===null){unplaced.push(who(entry)+' '+when(entry.at)+': '+describe({changes:[change]}).join('; '));return;}
    const first=mappings.get(key);
    mappings.set(key,{entry,change,step:liveSteps.get(key),base:first?first.base:isObject(change.replaces)?change.replaces:null,changes:(first?first.changes:[]).concat([change])});
  }));

  const inBase=placements(base),inLive=placements(live.map),inMine=placements(mine);
  const tickets=new Set([...inBase.keys(),...inLive.keys(),...inMine.keys()]);
  const conflicts=[],adds=new Map(),removes=new Map();
  const queue=(where,key,ticket)=>{if(!where.has(key))where.set(key,[]);where.get(key).push(ticket);};
  tickets.forEach(ticket=>{
    const b=inBase.get(ticket) || [],l=inLive.get(ticket) || [],o=inMine.get(ticket) || [],choice=resolve[ticket];
    if(sameSet(l,b) || sameSet(o,l) || choice==='local')return;
    const entry=touched.get(ticket),by=entry?who(entry):'Someone',at=entry?when(entry.at):'an unknown time';
    if(!sameSet(o,b) && choice!=='live'){
      conflicts.push({kind:'both-changed',ticket,message:ticket+': on the board '+by+' changed it on '+at+' (it is now on '+labels(l,live.map,base)+
        '); your local copy has it on '+labels(o,mine)+'. Ask the author which to keep, then rerun with --resolve '+ticket+'=live or --resolve '+ticket+'=local.'});
      return;
    }
    const missing=l.filter(key=>!o.includes(key) && !mine.has(key) && !(isOverlayChain(JSON.parse(key)) && C.boardEditResolveChain(localRaw,JSON.parse(key)).length===1));
    if(missing.length){
      const where=labels(missing,live.map,base);
      conflicts.push({kind:'carrier-missing',ticket,message:ticket+': on the board '+by+' put it on '+where+' on '+at+', but your local copy no longer has '+where+
        '. Ask the author where it goes, place it in the local copy, then rerun with --resolve '+ticket+'=local.'});
      return;
    }
    l.filter(key=>!o.includes(key)).forEach(key=>queue(adds,key,ticket));
    o.filter(key=>!l.includes(key)).forEach(key=>queue(removes,key,ticket));
  });
  /* Set the newest mapping where the local step still equals the base (keeping its other
     traceMatch fields), keep a local one naming the same span, and ask on anything else; nodeId merges the same way. */
  const stepWrites=[];
  /* The nodeId base (#1192): walking a step's fresh changes oldest first, a replaces.nodeId is the base; a first
     mapping, or a change that names a nodeId its replaces lacks (it set one), means none. A change with neither
     (an older engine, which never changed nodeId) says nothing, so the walk goes on. */
  const nodeBase=changes=>{for(const c of changes){if(!isObject(c.replaces))return undefined;if(typeof c.replaces.nodeId==='string')return c.replaces.nodeId;if(isObject(c.traceMatch) && typeof c.traceMatch.nodeId==='string')return undefined;}return undefined;};
  // A nodeId the local copy can hold: a node of the step's own diagram, or an imported one by its alias.
  const nodeExists=(path,id)=>{const d=C.specValueAt(localRaw,path.slice(0,-2));if(!isObject(d))return false;if(isObject(d.nodes) && Object.prototype.hasOwnProperty.call(d.nodes,id))return true;
    const at=id.indexOf('::');return at>0 && Array.isArray(d.topologyImports) && d.topologyImports.some(imp=>isObject(imp) && imp.as===id.slice(0,at));};
  mappings.forEach(({entry,change,step,base,changes},key)=>{
    const id=step.id,choice=resolve['step:'+id],want={serviceName:change.traceMatch.serviceName,operation:change.traceMatch.operation},wantNode=typeof change.traceMatch.nodeId==='string'?change.traceMatch.nodeId:undefined,mineStep=localSteps.get(key);
    const told='step '+id+': on the board '+who(entry)+' mapped '+spanText(want)+(wantNode?' on node '+wantNode:'')+' to step '+step.label+' on '+when(entry.at);
    if(choice==='local')return;
    if(!mineStep){conflicts.push({kind:'step-missing',step:id,message:told+', but your local copy no longer has that step. Ask the author, then rerun with --resolve step:'+id+'=local.'});return;}
    /* Three ways per part: the span (serviceName, operation) against the oldest fresh change's replaces, and nodeId
       against nodeBase. Local equals base: take the board's. Board equals base (or local): keep local. Else ask;
       --resolve step:<id>=live then takes the board's parts and keeps the other traceMatch fields. */
    const mine=mineStep.traceMatch,mineNode=isObject(mine) && typeof mine.nodeId==='string'?mine.nodeId:undefined,baseNode=nodeBase(changes);
    const span=sameSpan(mine,want)?'keep':(base?sameSpan(mine,base):!mine)?'take':'ask';
    const node=mineNode===wantNode || wantNode===baseNode?'keep':mineNode===baseNode?'take':'ask';
    const live=choice==='live',takeSpan=span==='take' || span==='ask' && live,takeNode=node==='take' || node==='ask' && live;
    if(takeNode && wantNode!==undefined && !nodeExists(mineStep.path,wantNode)){
      conflicts.push({kind:'node-missing',step:id,message:told+', but node '+wantNode+' no longer exists locally. Ask the author, add the node or keep yours with --resolve step:'+id+'=local.'});return;
    }
    if((span==='ask' || node==='ask') && !live){
      conflicts.push({kind:'trace-match-changed',step:id,message:told+'; your local copy '+(mine?'maps '+spanText(mine)+(mineNode?' on node '+mineNode:'')+' to it':'has no traceMatch on it')+'. Ask the author which to keep, then rerun with --resolve step:'+id+'=live or --resolve step:'+id+'=local.'});
      return;
    }
    if(!takeSpan && !takeNode)return;
    /* #1290: a step has traceMatch or traceScope, never both, and the board's mapping removed the scope it
       replaced (its oldest fresh change's replacesScope, none when absent). A local scope equal to that one goes
       with the mapping; any other local scope is the author's own change since, so ask. */
    const mineScope=mineStep.traceScope,boardScope=changes[0] && changes[0].replacesScope;
    if(mineScope!==undefined && !(isObject(boardScope) && canonical(boardScope)===canonical(mineScope)) && !live){
      conflicts.push({kind:'trace-match-changed',step:id,message:told+'; your local copy gives that step a trace scope '+(isObject(boardScope)?'other than the one the mapping replaced':'the board\'s step did not have')+
        ', and a step has traceMatch or traceScope, not both. Ask the author which to keep, then rerun with --resolve step:'+id+'=live (the mapping, scope removed) or --resolve step:'+id+'=local.'});
      return;
    }
    const value={...(isObject(mine) && !Array.isArray(mine)?mine:{}),...(takeSpan?want:{})};
    if(takeNode){if(wantNode===undefined)delete value.nodeId;else value.nodeId=wantNode;}
    stepWrites.push({path:mineStep.path,value,dropScope:mineScope!==undefined});
  });
  /* #1290: spans the board declared on a node or connection, found locally through the same aligned inventory
     tickets use (an edge relabeled locally keeps its live identity). Absent locally: write it there. The same
     span under that key, or under another key: keep. A local hide of that key, or another span under it: ask
     (--resolve 'span:<carrier>/<key>=live|local'). A carrier (or the import of an imported one) that is gone: ask. */
  const spanWrites=[],declared=[];
  sortedByTime(fresh).forEach(entry=>(Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{
    if(isObject(change) && change.op==='trace-span' && isObject(change.span) && typeof change.span.key==='string')declared.push({entry,change});
  }));
  // A span is resolved per carrier (span:<carrier>/<key>); the bare span:<key> only while it names one carrier.
  const carrierOf=change=>typeof change.node==='string'?change.node:Array.isArray(change.edge)?change.edge.join('->'):'';
  const quoted=flag=>"'"+flag+"'";
  Object.keys(resolve).filter(k=>/^span:[^/]+$/.test(k)).forEach(k=>{
    const named=[...new Set(declared.filter(x=>'span:'+x.change.span.key===k).map(x=>carrierOf(x.change)))];
    if(named.length>1)throw new Error('--resolve '+k+' names '+named.length+' nodes or connections ('+named.join(', ')+'); use '+named.map(c=>quoted('span:'+c+'/'+k.slice(5))).join(' or ')+'.');
  });
  const overlayAt=chain=>chain.findIndex((part,i)=>part==='topologyImports' && (chain[i+2]==='nodeTracking' || chain[i+2]==='edgeTracking'));
  declared.forEach(({entry,change})=>{
    const key=changeKey(liveRaw,live.map,change),sp=change.span,flag='span:'+carrierOf(change)+'/'+sp.key,choice=resolve[flag] || resolve['span:'+sp.key];
    if(key===null){unplaced.push(who(entry)+' '+when(entry.at)+': '+describe({changes:[change]}).join('; '));return;}
    const told='span '+sp.key+' on '+carrierOf(change)+': on the board '+who(entry)+' declared '+spanText(sp)+' on '+changeLabel(change)+' on '+when(entry.at);
    if(choice==='local')return;
    const chain=JSON.parse(key);
    let path=mine.has(key)?mine.get(key).path:null,importAt=null;
    if(!path){const found=C.boardEditResolveChain(localRaw,chain);if(found.length===1)path=found[0];}
    // An imported carrier without an overlay entry yet: its import must still be there, under the same alias.
    if(!path && isOverlayChain(chain)){const at=overlayAt(chain),imp=C.boardEditResolveChain(localRaw,chain.slice(0,at+2));if(imp.length===1)importAt={path:imp[0],field:chain[at+2],rel:chain[at+3]};}
    if(!path && !importAt){conflicts.push({kind:'carrier-missing',span:sp.key,carrier:carrierOf(change),message:told+', but your local copy no longer has '+changeLabel(change)+'. Ask the author where it goes, then rerun with --resolve '+quoted(flag+'=local')+'.'});return;}
    const value=path?C.specValueAt(localRaw,path):undefined,trace=isObject(value) && isObject(value.trace)?value.trace:{},spans=isObject(trace.spans)?trace.spans:{};
    const mineSpan=Object.prototype.hasOwnProperty.call(spans,sp.key)?spans[sp.key]:undefined,board={serviceName:sp.serviceName,operation:sp.operation,role:sp.role};
    // The whole declared span is compared (service, operation or prefix, role, namespace, attributes).
    if(C.boardEditSameSpan(mineSpan,board))return;
    if(mineSpan===undefined && Object.keys(spans).some(k=>C.boardEditSameSpan(spans[k],board)))return;
    const hidden=mineSpan===null || Array.isArray(trace.hide) && trace.hide.includes(sp.key);
    if(hidden && choice!=='live'){
      conflicts.push({kind:'span-hidden',span:sp.key,carrier:carrierOf(change),message:told+'; your local copy hides '+sp.key+' there, so the declaration would have no effect. Ask the author, then rerun with --resolve '+quoted(flag+'=live')+' (show it with the board\'s span) or --resolve '+quoted(flag+'=local')+'.'});
      return;
    }
    if(mineSpan!==undefined && mineSpan!==null && choice!=='live'){
      conflicts.push({kind:'span-changed',span:sp.key,carrier:carrierOf(change),message:told+'; your local copy declares '+(isObject(mineSpan)?spanText(mineSpan)+(mineSpan.role?' ('+mineSpan.role+')':''):'something else')+' under that key. Ask the author which to keep, then rerun with --resolve '+quoted(flag+'=live')+' or --resolve '+quoted(flag+'=local')+'.'});
      return;
    }
    if(!importAt && isOverlayChain(chain)){const at=overlayAt(path);importAt={path:path.slice(0,at+2),field:path[at+2],rel:path[at+3]};}
    spanWrites.push({path,importAt,key:sp.key,span:board,unhide:hidden});
  });
  if(conflicts.length)return {status:'conflict',text:localText,edits,conflicts,unplaced};

  const targets=new Map();
  const target=key=>{
    if(targets.has(key))return targets.get(key);
    let carrier=mine.get(key);
    if(!carrier){const chain=JSON.parse(key),path=C.boardEditResolveChain(localRaw,chain)[0];carrier={key,chain,path,kind:'overlay',entries:[],tickets:[],missingWork:false};}
    const made={carrier};targets.set(key,made);return made;
  };
  new Set([...adds.keys(),...removes.keys()]).forEach(key=>{
    const made=target(key),drop=removes.get(key) || [],keep=made.carrier.entries.filter(entry=>!drop.includes(ticketKey(entry)));
    const liveCarrier=live.map.get(key),form=ticket=>(liveCarrier && liveCarrier.entries.find(entry=>ticketKey(entry)===ticket)) || ticket;
    made.tickets=keep.concat((adds.get(key) || []).map(form));
  });
  // Missing work: the board can only clear a marker; take the live value where the base differs.
  base.forEach((carrier,key)=>{
    const now=live.map.get(key),cleared=now?now.missingWork:false;
    if(carrier.missingWork===cleared)return;
    const mineCarrier=mine.get(key);if(!mineCarrier || mineCarrier.missingWork===cleared)return;
    target(key).missingWork=cleared;
  });
  let text=applyTargets(localText,localRaw,[...targets.values()]);
  stepWrites.forEach(write=>{text=setField(text,write.path,'traceMatch',JSON.stringify(write.value));if(write.dropScope)text=setField(text,write.path,'traceScope',null);});
  spanWrites.forEach(write=>{
    // Re-read: ticket and overlay writes above may have created, emptied or moved the carrier's entry.
    const raw=JSON.parse(text),value=write.path?C.specValueAt(raw,write.path):undefined;
    if(isObject(value)){
      const trace=isObject(value.trace)?JSON.parse(JSON.stringify(value.trace)):{};
      trace.spans=Object.assign(isObject(trace.spans)?trace.spans:{},{[write.key]:write.span});
      if(write.unhide && Array.isArray(trace.hide)){trace.hide=trace.hide.filter(k=>k!==write.key);if(!trace.hide.length)delete trace.hide;}
      text=setField(text,write.path,'trace',JSON.stringify(trace));return;
    }
    // A consumer overlay entry the local copy does not have (yet, or any more after the ticket writes).
    const {path:importPath,field,rel}=write.importAt;
    const map=isObject(C.specValueAt(raw,importPath.concat([field])))?JSON.parse(JSON.stringify(C.specValueAt(raw,importPath.concat([field])))):{};
    map[rel]=Object.assign(isObject(map[rel])?map[rel]:{},{trace:{spans:{[write.key]:write.span}}});
    text=setField(text,importPath,field,JSON.stringify(map));
  });
  text=appendHistory(text,fresh);
  return {status:'merged',text,edits,conflicts:[],unplaced};
}

/* ---- log ---- */
const plural=(n,word)=>n+' '+word+(n===1?'':'s');
function sectionNodes(raw){
  const out=new Map();
  C.specSectionPaths(raw).forEach(record=>{
    const diagram=C.specValueAt(raw,record.diagram),key=JSON.stringify(C.boardEditChain(raw,record.section));
    if(!isObject(diagram))return;
    out.set(key,{nodes:Object.keys(isObject(diagram.nodes)?diagram.nodes:{}),edges:(Array.isArray(diagram.edges)?diagram.edges:[]).filter(isObject).map(edge=>JSON.stringify([edge.from,edge.to]))});
  });
  return out;
}
function countDiff(before,after){
  let added=0,removed=0;const left=before.slice();
  after.forEach(item=>{const at=left.indexOf(item);if(at>=0)left.splice(at,1);else added++;});
  removed=left.length;return {added,removed};
}
function structure(liveRaw,localRaw){
  const live=sectionNodes(liveRaw),local=sectionNodes(localRaw),totals={sections:{added:0,removed:0},nodes:{added:0,removed:0},edges:{added:0,removed:0}};
  new Set([...live.keys(),...local.keys()]).forEach(key=>{
    const a=live.get(key),b=local.get(key);
    if(!a)totals.sections.added++;if(!b)totals.sections.removed++;
    ['nodes','edges'].forEach(kind=>{const diff=countDiff(a?a[kind]:[],b?b[kind]:[]);totals[kind].added+=diff.added;totals[kind].removed+=diff.removed;});
  });
  return totals;
}
function changeFor(op,ticket,carrier){
  const change={op};if(ticket)change.ticket=ticket;change.path=carrier.path.slice();
  if(carrier.node!==undefined)change.node=carrier.node;else change.edge=carrier.edge.slice();
  change.label=carrier.label;return change;
}
function log(localText,liveText,options){
  options=options || {};
  if(typeof options.by!=='string' || !options.by.trim())throw new Error('log needs --by <the author\'s name>');
  if(options.summary!=null && !(typeof options.summary==='string' && options.summary.trim() && options.summary.length<=SUMMARY_MAX && !/[\r\n\u2028\u2029]/.test(options.summary)))
    throw new Error('--summary must be one line of 1–'+SUMMARY_MAX+' characters');
  const confirm=new Set(options.confirm || []);
  const localRaw=parse(localText,'the local file'),liveRaw=parse(liveText,'the live file');
  const known=new Set(history(localRaw).map(canonical));
  const missing=history(liveRaw).filter(entry=>!known.has(canonical(entry)));
  if(missing.length)return {status:'not-pulled',text:localText,conflicts:[],missing:missing.length};

  const live=inventory(liveRaw),local=inventory(localRaw),mine=aligned(local,live);
  const inLive=placements(live.map),inMine=placements(mine);
  const counts={assigned:0,moved:0,removed:0},changes=[];
  [...new Set([...inLive.keys(),...inMine.keys()])].sort().forEach(ticket=>{
    const l=inLive.get(ticket) || [],o=inMine.get(ticket) || [];
    if(sameSet(l,o))return;
    if(!l.length || l.every(key=>o.includes(key)))counts.assigned++;
    else if(!o.length || o.every(key=>l.includes(key)))counts.removed++;
    else counts.moved++;
    l.filter(key=>!o.includes(key)).forEach(key=>changes.push(changeFor('remove',ticket,mine.get(key) || live.map.get(key))));
    o.filter(key=>!l.includes(key)).forEach(key=>changes.push(changeFor('add',ticket,mine.get(key))));
  });
  const markers={cleared:0,set:0};
  live.map.forEach((carrier,key)=>{const now=mine.get(key);if(carrier.missingWork && now && !now.missingWork){markers.cleared++;changes.push(changeFor('clear-missing-work',null,now));}});
  mine.forEach((carrier,key)=>{const was=live.map.get(key);if(carrier.missingWork && !(was && was.missingWork))markers.set++;});
  // #1078: step mappings (traceMatch) added, changed or removed, a deleted mapped step included.
  const liveSteps=stepInventory(liveRaw),localSteps=stepInventory(localRaw),mappings={added:0,changed:0,removed:0};
  liveSteps.forEach((step,key)=>{const now=localSteps.get(key);if(!step.traceMatch)return;if(!now || !now.traceMatch)mappings.removed++;else if(canonical(now.traceMatch)!==canonical(step.traceMatch))mappings.changed++;});
  localSteps.forEach((step,key)=>{const was=liveSteps.get(key);if(step.traceMatch && !(was && was.traceMatch))mappings.added++;});

  /* Chuck 2026-11-04: board edits saved after the newest agent entry are the author's to
     override. Any change to where a ticket sits that such an edit added, moved or removed
     needs the author's confirmation, newest board edit first. */
  const entries=history(liveRaw),newest=Math.max(-Infinity,...entries.filter(isAgent).map(entry=>Date.parse(entry.at)).filter(isFinite));
  const recent=new Map();
  sortedByTime(entries.filter(entry=>!isAgent(entry) && Date.parse(entry.at)>newest)).reverse().forEach(entry=>{
    (Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{if(isObject(change) && typeof change.ticket==='string' && !recent.has(change.ticket))recent.set(change.ticket,entry);});
  });
  const conflicts=[];
  recent.forEach((entry,ticket)=>{
    const l=inLive.get(ticket) || [],o=inMine.get(ticket) || [];
    if(confirm.has(ticket) || sameSet(l,o))return;
    const done=describe({changes:entry.changes.filter(change=>isObject(change) && change.ticket===ticket)}).join('; ');
    conflicts.push({ticket,message:ticket+': on the board '+who(entry)+' changed it on '+when(entry.at)+', after the newest agent entry ('+done+
      '); this change '+(o.length?'puts it on '+labels(o,mine):'removes it from the board')+'. Ask the author; rerun with --confirm '+ticket+' once they agree.'});
  });
  // A step mapping a board edit set after the newest agent entry: changing its span, removing it or deleting the step needs confirmation.
  const recentSteps=new Map();
  sortedByTime(entries.filter(entry=>!isAgent(entry) && Date.parse(entry.at)>newest)).reverse().forEach(entry=>{
    (Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{if(!isMapping(change))return;const key=stepKey(liveRaw,liveSteps,change);if(key!==null && !recentSteps.has(key))recentSteps.set(key,{entry,change});});
  });
  recentSteps.forEach(({entry,change},key)=>{
    const step=liveSteps.get(key),now=localSteps.get(key),id=step.id;
    if(confirm.has('step:'+id) || (now && sameSpan(now.traceMatch,change.traceMatch)))return;
    conflicts.push({step:id,message:'step '+id+': on the board '+who(entry)+' mapped '+spanText(change.traceMatch)+' to step '+step.label+' on '+when(entry.at)+', after the newest agent entry; this change '+
      (!now?'deletes the step':now.traceMatch?'maps '+spanText(now.traceMatch)+' to it':'removes its traceMatch')+'. Ask the author; rerun with --confirm step:'+id+' once they agree.'});
  });
  /* #1290: spans declared on nodes and connections, counted per carrier (aligned as tickets are), and a span a
     board edit declared after the newest agent entry: removing or changing it needs the author's confirmation. */
  const spansAt=(raw,carrier)=>{const value=carrier && C.specValueAt(raw,carrier.path),sp=isObject(value) && isObject(value.trace) && isObject(value.trace.spans)?value.trace.spans:{};return sp;};
  const spanCounts={added:0,changed:0,removed:0};
  new Set([...live.map.keys(),...mine.keys()]).forEach(key=>{
    const was=spansAt(liveRaw,live.map.get(key)),now=spansAt(localRaw,mine.get(key));
    Object.keys(was).forEach(k=>{if(!Object.prototype.hasOwnProperty.call(now,k))spanCounts.removed++;else if(canonical(now[k])!==canonical(was[k]))spanCounts.changed++;});
    Object.keys(now).forEach(k=>{if(!Object.prototype.hasOwnProperty.call(was,k))spanCounts.added++;});
  });
  const carrierName=change=>typeof change.node==='string'?change.node:Array.isArray(change.edge)?change.edge.join('->'):'';
  const recentSpans=new Map();
  sortedByTime(entries.filter(entry=>!isAgent(entry) && Date.parse(entry.at)>newest)).reverse().forEach(entry=>{
    (Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{
      if(!isObject(change) || change.op!=='trace-span' || !isObject(change.span))return;
      const flag='span:'+carrierName(change)+'/'+change.span.key;if(!recentSpans.has(flag))recentSpans.set(flag,{entry,change});
    });
  });
  recentSpans.forEach(({entry,change},flag)=>{
    if(confirm.has(flag))return;
    const key=changeKey(liveRaw,live.map,change),carrier=key!==null && mine.get(key),now=carrier?spansAt(localRaw,carrier)[change.span.key]:undefined;
    const board={serviceName:change.span.serviceName,operation:change.span.operation,role:change.span.role};
    if(C.boardEditSameSpan(now,board))return;
    conflicts.push({span:change.span.key,carrier:carrierName(change),message:'span '+change.span.key+' on '+carrierName(change)+': on the board '+who(entry)+' declared '+spanText(change.span)+' on '+changeLabel(change)+' on '+when(entry.at)+
      ', after the newest agent entry; this change '+(!carrier?'deletes that node or connection':now===undefined?'removes the declaration':'declares something else under that key')+". Ask the author; rerun with --confirm '"+flag+"' once they agree."});
  });
  if(conflicts.length)return {status:'conflict',text:localText,conflicts};

  const shape=structure(liveRaw,localRaw),parts=[];
  [['sections','section'],['nodes','node'],['edges','edge']].forEach(([kind,word])=>{
    if(shape[kind].added)parts.push('added '+plural(shape[kind].added,word));
    if(shape[kind].removed)parts.push('removed '+plural(shape[kind].removed,word));
  });
  if(counts.assigned)parts.push('assigned '+plural(counts.assigned,'ticket'));
  if(counts.moved)parts.push('moved '+plural(counts.moved,'ticket'));
  if(counts.removed)parts.push('removed '+plural(counts.removed,'ticket'));
  if(markers.cleared)parts.push('cleared '+plural(markers.cleared,'Missing work marker'));
  if(markers.set)parts.push('set '+plural(markers.set,'Missing work marker'));
  ['added','changed','removed'].forEach(kind=>{if(mappings[kind])parts.push(kind+' '+plural(mappings[kind],'step mapping'));});
  ['added','changed','removed'].forEach(kind=>{if(spanCounts[kind])parts.push(kind+' '+plural(spanCounts[kind],'span declaration'));});
  const strip=raw=>{const copy=JSON.parse(JSON.stringify(raw)),page=copy.page || copy;delete page.editHistory;return canonical(copy);};
  if(!parts.length && strip(liveRaw)===strip(localRaw))return {status:'unchanged',text:localText,conflicts:[]};
  const counted=parts.length?parts.join(', '):'updated board text and layout';
  const by={name:options.by.trim()};if(typeof options.id==='string' && options.id)by.id=options.id;
  const entry={at:(options.now || new Date()).toISOString(),by,source:'agent',summary:options.summary || counted.charAt(0).toUpperCase()+counted.slice(1),changes};
  return {status:'logged',text:appendHistory(localText,[entry]),entry,conflicts:[]};
}

/* ---- command line ---- */
function args(argv){
  const out={positional:[],resolve:{},confirm:[]};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i],value=()=>{const next=argv[++i];if(next===undefined || next.startsWith('--'))throw new Error(arg+' needs a value');return next;};
    if(arg==='--resolve')value().split(',').forEach(item=>{const m=/^([A-Z][A-Z0-9_]+-[0-9]+|step:[^=\s]+|span:[^=\s]+)=(live|local)$/.exec(item.trim());if(!m)throw new Error('--resolve takes KEY=live or KEY=local, got '+item);out.resolve[m[1]]=m[2];});
    else if(arg==='--confirm')value().split(',').forEach(item=>item.trim() && out.confirm.push(item.trim()));
    else if(arg==='--by')out.by=value();
    else if(arg==='--id')out.id=value();
    else if(arg==='--summary')out.summary=value();
    else if(arg.startsWith('--'))throw new Error('unknown option '+arg);
    else out.positional.push(arg);
  }
  return out;
}
const USAGE='usage: node tools/board-sync.js pull <local.json> <live.json> [--resolve KEY=live|local]\n'+
  '       node tools/board-sync.js log <local.json> <live.json> --by <name> [--summary <one line>] [--confirm KEY]\n'+
  '       KEY is a Jira key, step:<step id> for a step\'s traceMatch, or \'span:<node id or from->to>/<span key>\' for a declared span';
function main(argv){
  let opts;
  try{opts=args(argv.slice(1));}catch(error){console.error(error.message+'\n'+USAGE);return 1;}
  const command=argv[0],[localFile,liveFile]=opts.positional;
  if(!['pull','log'].includes(command) || opts.positional.length!==2){console.error(USAGE);return 1;}
  let localText,liveText,out;
  try{localText=fs.readFileSync(localFile,'utf8');liveText=fs.readFileSync(liveFile,'utf8');
    out=command==='pull'?pull(localText,liveText,{resolve:opts.resolve}):log(localText,liveText,{by:opts.by,id:opts.id,summary:opts.summary,confirm:opts.confirm});
  }catch(error){console.error(error.message);return 1;}
  const print=line=>console.log(line);
  if(command==='pull'){
    if(out.status==='republished'){
      print('The live board was republished by an agent after your local copy was made:');
      out.republished.forEach(item=>print('  '+when(item.at)+'  '+item.by+': '+item.summary));
      print('Its structure may differ from your copy. Nothing was written. Start again from the live file: copy '+liveFile+' over '+localFile+' and redo the requested change. If '+localFile+' has changes of its own that were never published, ask the author before replacing it.');
      return 3;
    }
    if(out.edits.length){
      print('Board edits saved on the live board that '+localFile+' did not have ('+out.edits.length+'):');
      out.edits.forEach(item=>item.lines.forEach(line=>print('  '+when(item.at)+'  '+item.by+': '+line)));
    }
    (out.unplaced || []).forEach(line=>print('  Not placed (its node or edge could not be identified): '+line));
    if(out.status==='conflict'){
      print('CONFLICT: ask the author before going on. Nothing was written.');
      out.conflicts.forEach(conflict=>print('  '+conflict.message));
      return 2;
    }
    if(out.status==='up-to-date'){print(localFile+' already has every board edit.');return 0;}
    fs.writeFileSync(localFile,out.text);
    print('Merged into '+localFile+'. Tell the author about these board edits, one line each.');
    return 0;
  }
  if(out.status==='not-pulled'){print('The live board has '+out.missing+' edit history entr'+(out.missing===1?'y':'ies')+' '+localFile+' does not have. Nothing was written. Run first: node tools/board-sync.js pull '+localFile+' '+liveFile);return 3;}
  if(out.status==='conflict'){
    print('CONFLICT: this change overrides board edits saved after the newest agent entry. Nothing was written. Ask the author:');
    out.conflicts.forEach(conflict=>print('  '+conflict.message));
    return 2;
  }
  if(out.status==='unchanged'){print(localFile+' does not differ from the live board: nothing to log.');return 0;}
  fs.writeFileSync(localFile,out.text);
  print('Logged in '+localFile+' page.editHistory: '+out.entry.by.name+' (agent): '+out.entry.summary);
  return 0;
}

module.exports={pull,log};
if(require.main===module)process.exitCode=main(process.argv.slice(2));
