/* Local handoffs use document section identities. External selectors belong
   to another spec and must never be rewritten by local rename/delete. */
function validateHandoff(value, node, at, errors){
  if(value == null)return;
  if(!specObject(value)){errors.push(at+': expected a diagram destination object');return;}
  ['spec','revision','section','view','path','step','siteBaseUrl','claudeUrl','claudeArtifactId','localSection'].forEach(function(key){
    if(value[key]!=null && (typeof value[key]!=='string' || !value[key].trim()))errors.push(at+'.'+key+': expected a nonempty string');
  });
  if(value.localSection!=null){
    if(['spec','revision','section','view','path','step','url','siteBaseUrl','claudeUrl','claudeArtifactId'].some(function(key){return value[key]!=null;}))errors.push(at+': choose a local section or an external destination, not both');
  }else if(!value.spec)errors.push(at+': provide a local section or external spec ID');
  if(Object.prototype.hasOwnProperty.call(value,'url'))errors.push(at+'.url: removed; use spec with siteBaseUrl and/or claudeUrl');
  if((value.revision!=null || value.section!=null) && !value.spec)errors.push(at+': revision and section require an external spec ID');
  var links={};['siteBaseUrl','claudeUrl','claudeArtifactId'].forEach(function(key){if(value[key]!=null)links[key]=value[key];});validateDocumentLinks(links,null,at,errors);
  if(node && node.detail!=null)errors.push(at+': a node cannot have both a handoff and a domain detail');
}
function diagramHandoffURL(value, resolver){
  if(!specObject(value))return null;
  var destinations=documentDestinations(value,resolver);
  var preferred=destinations.find(function(item){return item.kind==='site';}) || destinations.find(function(item){return item.kind==='url';}) || destinations[0];
  return preferred?preferred.url:null;
}

/* Runtime context belongs to a viewer, never to portable document metadata.
   Detail links intentionally keep diagramHandoffURL's legacy URL policy. */
function diagramHandoffHost(value,win,siteBase){
  if(['claude','site','backstage','unknown'].indexOf(value)>=0)return value;
  function claudeOrigin(value){try{var u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && (u.hostname==='claude.ai' || u.hostname==='claude.site');}catch(_){return false;}}
  try{if(win && win.claude && typeof win.claude.use==='function')return 'claude';}catch(_){}
  var origin;
  try{origin=win && win.location && win.location.origin;if(claudeOrigin(origin))return 'claude';}catch(_){}
  // Cross-origin parent objects are never inspected. A referrer/ancestor is
  // evidence only in an embedded document, never after a top-level site visit.
  try{if(win && win.self && win.top && win.self!==win.top){
    var ancestors=win.location && win.location.ancestorOrigins;
    if(ancestors && Array.from(ancestors).some(claudeOrigin))return 'claude';
    if(win.document && claudeOrigin(win.document.referrer))return 'claude';
  }}catch(_){}
  var base=documentSiteBase(siteBase);
  if(base && origin && new URL(base).origin===origin)return 'site';
  return 'unknown';
}
function diagramHandoffReference(value){
  var ref=diagramLinkReference(value);delete ref.url;return ref;
}
function diagramHandoffAction(value,options){
  options=options || {};
  var ref=diagramHandoffReference(value),host=options.handoffHost || 'unknown';
  if(!ref.spec)return {kind:'unavailable',destinations:[]};
  var destinations=documentDestinations(ref,options.resolveDiagramLink,options.siteBaseUrl).map(function(item){
    return claudeArtifact(item.url)?{kind:'claude',label:'Open in Claude',url:item.url}:item;
  }).filter(function(item,index,all){return all.findIndex(function(other){return other.url===item.url;})===index;});
  var preferred=destinations.find(function(item){return item.kind===(host==='claude'?'claude':'site');});
  if(host==='backstage' && ref.spec && typeof options.onDiagramHandoff==='function')return {kind:'internal',reference:ref,destinations:destinations};
  if((host==='claude' || host==='site') && preferred)return {kind:'link',url:preferred.url,destinations:destinations};
  return {kind:destinations.length?'choose':'unavailable',destinations:destinations};
}

function localHandoffTarget(page, value){
  if(!specObject(value) || typeof value.localSection!=='string')return null;
  var target=detailSection(page,value.localSection);
  return target && target.section.diagram && !target.section.detailOnly ? target : null;
}
function validateLocalHandoffs(page, errors){
  sectionRecords(page).forEach(function(record){
    Object.keys(record.section.diagram && record.section.diagram.nodes || {}).forEach(function(id){
      var value=record.section.diagram.nodes[id].handoff;
      if(specObject(value) && value.localSection!=null){
        var target=localHandoffTarget(page,value),at=record.path+'.diagram.nodes.'+id+'.handoff.localSection';
        if(!target)errors.push(at+': choose an existing diagram section that is not detail-only');
        else if(target.number===record.number)errors.push(at+': choose a different diagram section');
      }
    });
  });
}
