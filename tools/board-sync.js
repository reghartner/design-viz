#!/usr/bin/env node
'use strict';
/* board-sync.js — bring a live board's saved edits into an agent's local spec, and log the
   agent's own change on the board (#974).

   Usage:
     node tools/board-sync.js pull <local.json> <live.json> [--resolve KEY=live|local ...]
     node tools/board-sync.js log  <local.json> <live.json> --by <name> [--id <user id>]
                                   [--summary <one line>] [--confirm KEY ...]

   <live.json> is the board's current flowspec.json, read from the artifact. <local.json> is
   the agent's copy; both commands rewrite it in place and never touch <live.json>.

   A two-file board's Edit mode (#828, #855) can only add a ticket to a node or edge, remove
   one, and clear a Missing work marker; each Save appends one page.editHistory entry. `pull`
   folds the entries the local copy lacks into it: three-way per ticket, by carrier identity
   (the same identity chain the board uses for its own conflict replay), with the base being
   the live file with those entries' operations undone, so local changes are kept. Every
   other line of the local file stays as written.

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
      if(!isObject(change))return;
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

  // Chuck 2026-11-04: board edits saved after the newest agent entry are the author's to override.
  const entries=history(liveRaw),newest=Math.max(-Infinity,...entries.filter(isAgent).map(entry=>Date.parse(entry.at)).filter(isFinite));
  const conflicts=[],flagged=new Set();
  sortedByTime(entries.filter(entry=>!isAgent(entry) && Date.parse(entry.at)>newest)).reverse().forEach(entry=>{
    (Array.isArray(entry.changes)?entry.changes:[]).forEach(change=>{
      if(!isObject(change) || typeof change.ticket!=='string' || flagged.has(change.ticket) || confirm.has(change.ticket))return;
      const key=changeKey(liveRaw,live.map,change);if(key===null)return;
      const onLive=(inLive.get(change.ticket) || []).includes(key),onMine=(inMine.get(change.ticket) || []).includes(key);
      if(onLive===onMine)return;
      flagged.add(change.ticket);
      const now=inMine.get(change.ticket) || [];
      conflicts.push({ticket:change.ticket,message:change.ticket+': on the board '+who(entry)+' put it on '+labels(inLive.get(change.ticket) || [],live.map)+' on '+when(entry.at)+
        ', after the newest agent entry; this change '+(now.length?'puts it on '+labels(now,mine):'removes it from the board')+
        '. Ask the author; rerun with --confirm '+change.ticket+' once they agree.'});
    });
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
    if(arg==='--resolve')value().split(',').forEach(item=>{const m=/^([A-Z][A-Z0-9_]+-[0-9]+)=(live|local)$/.exec(item.trim());if(!m)throw new Error('--resolve takes KEY=live or KEY=local, got '+item);out.resolve[m[1]]=m[2];});
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
  '       node tools/board-sync.js log <local.json> <live.json> --by <name> [--summary <one line>] [--confirm KEY]';
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
      print('Its structure may differ from your copy. Nothing was written. Start again from the live file: copy '+liveFile+' over '+localFile+' and redo the requested change.');
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
    print('Merged into '+localFile+'. Tell the author about these board edits, one line each, before making the requested change.');
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
