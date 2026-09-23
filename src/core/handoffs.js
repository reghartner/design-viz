/* A handoff continues in another document. It never fetches or imports a spec,
   and its section identity is external: local rename/delete must not rewrite it. */
function validateHandoff(value, node, at, errors){
  if(value == null)return;
  if(!specObject(value)){errors.push(at+': expected a diagram destination object');return;}
  ['spec','revision','section','url'].forEach(function(key){
    if(value[key]!=null && (typeof value[key]!=='string' || !value[key].trim()))errors.push(at+'.'+key+': expected a nonempty string');
  });
  if(!value.spec && !value.url)errors.push(at+': provide a spec ID or destination URL');
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
