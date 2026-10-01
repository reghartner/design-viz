/* Local handoffs use document section identities. External selectors belong
   to another spec and must never be rewritten by local rename/delete. */
function validateHandoff(value, node, at, errors){
  if(value == null)return;
  if(!specObject(value)){errors.push(at+': expected a diagram destination object');return;}
  ['spec','revision','section','url','localSection'].forEach(function(key){
    if(value[key]!=null && (typeof value[key]!=='string' || !value[key].trim()))errors.push(at+'.'+key+': expected a nonempty string');
  });
  if(value.localSection!=null){
    if(['spec','revision','section','url'].some(function(key){return value[key]!=null;}))errors.push(at+': choose a local section or an external destination, not both');
  }else if(!value.spec && !value.url)errors.push(at+': provide a local section, spec ID or destination URL');
  if(value.url!=null && !detailURL(value.url))errors.push(at+'.url: expected an HTTP(S) URL without credentials');
  if((value.revision!=null || value.section!=null) && !value.spec)errors.push(at+': revision and section require an external spec ID');
  if(node && node.detail!=null)errors.push(at+': a node cannot have both a handoff and a domain detail');
}
function diagramHandoffURL(value, resolver){
  if(!specObject(value))return null;
  // Only inert reference fields cross the host seam; no renderer state or I/O.
  if(value.spec && typeof resolver==='function'){
    var reference={};
    ['spec','revision','section','url'].forEach(function(key){if(typeof value[key]==='string')reference[key]=value[key];});
    try{var resolved=detailURL(resolver(reference));if(resolved)return resolved;}catch(_){/* use the portable fallback */}
  }
  return detailURL(value.url);
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
