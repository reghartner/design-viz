/* Portable document identity and inert destinations. Hosts may resolve approved
   IDs, but reference URLs are never spec transports. */
var FLOWVIEW_SITE_BASE_URL = /* @company-site-base */ null;
function documentSiteBase(value){
  if(typeof value!=='string' || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f-\u009f\\?#]/.test(value))return null;
  try{var u=new URL(value);return u.hostname && !u.username && !u.password?u.href:null;}catch(_){return null;}
}
function claudeArtifact(value){
  if(typeof value!=='string' || /[\s\\]/.test(value))return null;
  try{var u=new URL(value),match=u.pathname.match(/^\/(?:public\/)?artifacts\/([a-zA-Z0-9_-]+)\/?$/);
    if(!match && u.hostname==='claude.ai')match=u.pathname.match(/^\/(?:code\/)?artifact\/([a-zA-Z0-9_-]+)\/?$/);
    return u.protocol==='https:' && (u.hostname==='claude.ai' || u.hostname==='claude.site') && !u.port && !u.username && !u.password && match?{url:u.href,id:match[1]}:null;
  }catch(_){return null;}
}
function validateDocumentLinks(value,canonId,at,errors){
  if(value==null)return;
  if(!specObject(value)){errors.push(at+': expected an object');return;}
  Object.keys(value).forEach(function(key){if(['id','siteBaseUrl','claudeUrl','claudeArtifactId'].indexOf(key)<0)errors.push(at+'.'+key+': unknown destination field');});
  if(value.id!=null && (typeof value.id!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value.id)))errors.push(at+'.id: use an existing diagram ID (letters, numbers, underscores, dots or hyphens)');
  if(canonId && value.id!=null && value.id!==canonId)errors.push(at+'.id: must match the repository diagram ID '+canonId);
  if(value.siteBaseUrl!=null && !documentSiteBase(value.siteBaseUrl))errors.push(at+'.siteBaseUrl: use an absolute HTTP(S) site URL without credentials, query or fragment');
  var artifact=claudeArtifact(value.claudeUrl);
  if(value.claudeUrl!=null && !artifact)errors.push(at+'.claudeUrl: paste a Claude artifact URL (claude.ai/artifact/…, claude.ai/code/artifact/…, or an artifacts/… share URL)');
  if(value.claudeArtifactId!=null && (!artifact || value.claudeArtifactId!==artifact.id))errors.push(at+'.claudeArtifactId: must match the artifact share URL');
}
function documentReference(page){
  var links=page && page.documentLinks || {},ref={};
  var id=page && page.canon && page.canon.id || links.id;if(id)ref.spec=id;
  ['siteBaseUrl','claudeUrl','claudeArtifactId'].forEach(function(key){if(links[key])ref[key]=links[key];});
  return ref;
}
function documentSiteURL(base,reference){
  base=documentSiteBase(base);if(!base || !reference || typeof reference.spec!=='string' || !reference.spec)return null;
  if(reference.revision && !/^[a-f0-9]{64}$/.test(reference.revision))return null;
  var url=new URL(base);url.searchParams.set('diagram',reference.spec);
  url.hash=buildHash({d:reference.section,v:reference.view,p:reference.path,s:reference.step,m:reference.step?'step':null});
  if(reference.revision)url.hash+=(url.hash?'&':'#')+'fv='+encodeURIComponent(JSON.stringify({version:1,id:reference.spec,revision:reference.revision,action:'view',sourceRevision:true}));
  return url.href;
}
function diagramLinkReference(value){
  var ref={};['spec','revision','section','view','path','step','url','siteBaseUrl','claudeUrl','claudeArtifactId'].forEach(function(key){if(value && typeof value[key]==='string')ref[key]=value[key];});return ref;
}
function documentDestinations(reference,resolver,siteBase){
  if(!specObject(reference))return [];
  var out=[],site=null,resolvedByHost=reference.spec && typeof resolver==='function';
  if(resolvedByHost){
    var inert=diagramLinkReference(reference);
    try{site=detailURL(resolver(inert));}catch(_){}
  }
  // Host rejection may mean a missing ID or stale revision. Never turn it
  // into an unpinned guessed route, or override an existing explicit URL.
  if(!resolvedByHost && (!reference.url || reference.siteBaseUrl))site=documentSiteURL(siteBase || reference.siteBaseUrl || FLOWVIEW_SITE_BASE_URL,reference);
  if(site)out.push({kind:'site',label:'Open on internal site',url:site});
  var artifact=claudeArtifact(reference.claudeUrl);if(artifact)out.push({kind:'claude',label:'Open in Claude',url:artifact.url});
  var fallback=detailURL(reference.url);if(fallback && !out.some(function(item){return item.url===fallback;}))out.push({kind:'url',label:'Open diagram',url:fallback});
  return out;
}
function sourceDiagramReferences(diagram,id){
  var origins=Array.isArray(diagram.sourceDiagrams)?diagram.sourceDiagrams:[];
  return origins.concat(((diagram.topologyProvenance || {}).imports || []).map(function(item){return Object.assign({spec:item.spec,nodes:item.nodes},item.destination || {});})).filter(function(item){return item && Array.isArray(item.nodes) && item.nodes.indexOf(id)>=0;});
}
