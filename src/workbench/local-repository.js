/* Local repository access is bounded by the explicitly selected directory
   handle. A registered local context never falls back to deployed providers. */
async function openLocalRepositoryFolder(directory, filename){
  var manifest;
  try{manifest=await directory.getFileHandle('canon.json');}catch(error){if(error.name==='NotFoundError' || error.name==='TypeMismatchError')return null;throw error;}
  var file=await manifest.getFile();
  if(file.size>4*1024*1024)throw Error('Local canon.json exceeds the 4 MiB registry limit.');
  var entries;
  try{entries=FlowCanonLibrary.entries(JSON.parse(await file.text()));}
  catch(error){throw Error('Invalid local canon.json: '+error.message+' Repair the registry or choose the intended repository root.');}
  // Empty registries enroll nothing; preserve ordinary single-folder opening.
  if(!entries.length)return null;
  if(!filename && entries.length>1)return {selectionRequired:true,specs:entries.map(function(entry){return entry.path;}),existing:true};
  var entry=filename?entries.find(function(entry){return entry.path===filename;}):entries[0];
  if(!entry)throw Error('Choose a diagram listed in this repository’s canon.json.');
  async function folder(path){var handle=directory;for(var segment of path.split('/'))handle=await handle.getDirectoryHandle(segment);return handle;}
  var selected=await folder(entry.folder);
  var found=await openFolderAgentProject(selected,entry.id+'.spec.json',true);
  if(found.source===null)throw Error('Registered diagram is missing: '+entry.path);
  var context=await readLocalRepositoryTopology(directory,found.source,entry.path);
  // No handles in persisted state. The snapshot remains usable offline after
  // reload, while writes stay bound to the selected diagram's own folder.
  found.topologyContext=JSON.parse(JSON.stringify(context));found.directory=selected;found.repository=directory;
  return found;
}
/* Canon enrolls providers; an ordinary consumer gets auxiliary membership only.
   Its exact source (including authored canon and imports) is never rewritten. */
function localConsumerSpec(raw,entries){
  var value=JSON.parse(JSON.stringify(raw)),spec,id='workbench-draft',suffix=2;
  while(entries.some(function(entry){return entry.id===id;}))id='workbench-draft-'+suffix++;
  if(value && value.page && typeof value.page==='object')spec=value;
  else if(value && (value.nodes || value.rows || value.topologyImports || value.topologyExports))spec={page:{sections:[{diagram:value}]}};
  else spec={page:value};
  if(!spec.page || typeof spec.page!=='object' || Array.isArray(spec.page))throw Error('Open a valid consumer JSON document first.');
  spec.page.canon={version:1,id:id,kind:'design',owner:'group:default/workbench-draft'};
  return spec;
}
function unresolvedLocalTopology(raw){
  var spec=localConsumerSpec(raw,[]);
  FlowTopology.validateDeclarations([spec]);
  return {version:1,id:spec.page.canon.id,local:true,ephemeral:true,specs:[spec]};
}
function isUnresolvedLocalTopology(context){return !!(context && context.local && context.ephemeral && !context.localSource && context.specs.length===1);}
async function localSourceHash(text){
  var hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(function(byte){return byte.toString(16).padStart(2,'0');}).join('');
}
/* Both browser grants and the file bridge feed this same bounded closure reader.
   The bridge supplies raw registry/provider bytes, never a trusted resolved graph. */
async function acquireLocalTopology(source,read,metadata,sourcePath,check){
  check=check || function(){};
  var raw;
  try{raw=JSON.parse(source);}catch(error){throw Error('Repair the consumer JSON before refreshing local sources: '+error.message);}
  var reads=new Map(),total=0;
  async function bounded(path){
    check();if(new TextEncoder().encode(path).length>2048)throw Error('Local provider path exceeds 2048 bytes.');var text=await read(path);check();
    if(typeof text!=='string' || new TextEncoder().encode(text).length>4*1024*1024)throw Error('Local source exceeds the 4 MiB limit: '+path);
    total+=new TextEncoder().encode(text).length;
    if(total>8*1024*1024)throw Error('Local provider closure exceeds the 8 MiB limit.');
    reads.set(path,text);return text;
  }
  var manifest=await bounded('canon.json'),entries;
  try{entries=FlowCanonLibrary.entries(JSON.parse(manifest));}catch(error){throw Error('Invalid local canon.json: '+error.message);}
  var entry=sourcePath && entries.find(function(item){return item.path===sourcePath;});
  if(sourcePath && !entry)throw Error('The registered consumer '+sourcePath+' is missing from canon.json. Select a source repository explicitly to use an independent consumer.');
  var consumer=entry?FlowCanonLibrary.spec(raw,entry):localConsumerSpec(raw,entries),id=consumer.page.canon.id;
  if(!entry && consumer.page.documentLinks)delete consumer.page.documentLinks.id;
  var cache=new Map(),visiting=new Set();
  async function load(providerId,from){
    if(visiting.has(providerId))throw Error('Topology dependency cycle at '+providerId+' imported by '+from);
    if(cache.has(providerId))return;
    var provider=entries.find(function(value){return value.id===providerId;});
    if(providerId!==id && !provider)throw Error('Consumer '+id+': '+from+' references missing spec '+providerId+' in local canon.json.');
    visiting.add(providerId);var spec;
    try{spec=providerId===id?consumer:FlowCanonLibrary.spec(JSON.parse(await bounded(provider.path)),provider);}
    catch(error){if(error.refreshCode)throw error;throw Object.assign(Error('Consumer '+id+' / provider '+providerId+' ('+(provider && provider.path || 'current draft')+'): '+error.message),{name:error.name});}
    for(var dependency of FlowTopology.dependencies(spec))await load(dependency,providerId);
    visiting.delete(providerId);cache.set(providerId,spec);
    if(cache.size>500)throw Error('Local provider closure exceeds 500 specs.');
  }
  await load(id,id);
  var candidate={version:1,id:id,local:true,specs:Array.from(cache.values())};
  if(!entry)candidate.ephemeral=true;
  FlowTopology.materialize(candidate.specs).forEach(function(spec){
    var errors=FlowCanon.validate(spec).concat(validate(normalize(spec)).errors);
    if(errors.length)throw Error(spec.page.canon.id+': '+errors.join('\n'));
  });
  var provenance={rootLabel:metadata.rootLabel,capturedAt:metadata.capturedAt};
  if(entry)provenance.path=entry.path;
  if(metadata.selectionId){
    provenance.selectionId=metadata.selectionId;
    provenance.providers=[];
    for(var pair of reads){if(pair[0]!=='canon.json')provenance.providers.push({path:pair[0],sha256:await localSourceHash(pair[1])});}
    provenance.sha256=await localSourceHash(JSON.stringify(Array.from(reads).sort(function(a,b){return a[0].localeCompare(b[0]);})));
  }
  candidate.localSource=provenance;check();return {context:candidate,reads:reads};
}
async function readLocalRepositoryTopology(directory,source,sourcePath,check,selectionId){
  check=check || function(){};
  async function read(path){
    check();
    try{
      var parts=path.split('/'),handle=directory;
      for(var part of parts.slice(0,-1)){handle=await handle.getDirectoryHandle(part);check();}
      var file=await(await handle.getFileHandle(parts[parts.length-1])).getFile();check();
      if(file.size>4*1024*1024)throw Error('Local source exceeds the 4 MiB limit: '+path);
      var text=await file.text();check();return text;
    }catch(error){if(error.name==='AbortError' || error.refreshCode)throw error;throw Object.assign(Error(path+': '+error.message),{name:error.name});}
  }
  async function permission(){if(directory.queryPermission && await directory.queryPermission({mode:'read'})!=='granted')throw Object.assign(Error('Repository read permission was lost. Select the local source repository again.'),{name:'NotAllowedError'});check();}
  for(var attempt=0;attempt<2;attempt++){
    await permission();
    var acquired=await acquireLocalTopology(source,read,{rootLabel:directory.name || 'Selected repository',capturedAt:new Date().toISOString(),selectionId:selectionId},sourcePath,check);
    var changed=false;
    // Reacquire handles and compare bytes, including the registry, after closure.
    for(var pair of acquired.reads){if(await read(pair[0])!==pair[1]){changed=true;break;}}
    if(changed){if(attempt===0)continue;throw Error('Local sources changed during refresh. Wait for the provider save to finish, then refresh again.');}
    await permission();return acquired.context;
  }
}
async function readSuppliedLocalTopology(source,snapshot,check){
  function closed(value,keys){return value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(function(key){return keys.includes(key);});}
  if(!closed(snapshot,['version','manifest','providers','rootLabel','capturedAt','selectionId']) || snapshot.version!==1 || typeof snapshot.manifest!=='string' || !Array.isArray(snapshot.providers) || snapshot.providers.length>499 ||
      typeof snapshot.rootLabel!=='string' || !snapshot.rootLabel.trim() || new TextEncoder().encode(snapshot.rootLabel).length>512 || /[\u0000-\u001f\u007f]/.test(snapshot.rootLabel) ||
      typeof snapshot.selectionId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(snapshot.selectionId) || typeof snapshot.capturedAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot.capturedAt) || (!Number.isFinite(Date.parse(snapshot.capturedAt)) || new Date(snapshot.capturedAt).toISOString()!==snapshot.capturedAt))throw Error('Malformed local source snapshot. Run the consumer helper with --source-repo again.');
  var files=new Map([['canon.json',snapshot.manifest]]);
  snapshot.providers.forEach(function(item){
    if(!closed(item,['path','source']) || typeof item.path!=='string' || !/^diagrams\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+[a-z0-9]+(?:-[a-z0-9]+)*\.spec\.json$/.test(item.path) || typeof item.source!=='string' || files.has(item.path))throw Error('Malformed or duplicate local provider snapshot path.');
    files.set(item.path,item.source);
  });
  var result=await acquireLocalTopology(source,async function(path){if(!files.has(path))throw Error('Missing provider snapshot: '+path);return files.get(path);},snapshot,null,check);
  if(result.reads.size!==files.size)throw Error('Local snapshot contains unrelated provider bodies. Retry with the consumer helper.');
  return result.context;
}
/* Ordinary opening may defer unavailable imports so local source selection stays
   reachable. Acquisition/integrity faults still reject before project replacement. */
async function prepareOpenedTopology(raw,context){
  var dependencies=authoredTopologyDependencies(raw),prepared;
  try{
    prepared=await prepareAuthoredTopology(raw,context);
    if(dependencies.length)FlowTopology.resolveSource(raw,prepared);
    return prepared;
  }catch(error){
    var missing=error.topologyMissingExport;
    if(!dependencies.length || !(error.topologyUnavailable===true || missing && prepared && missing.consumer===prepared.id))throw error;
    return unresolvedLocalTopology(raw);
  }
}
async function prepareLocalFolderTopology(text,found,context){
  var raw=JSON.parse(text),local=found && found.topologyContext;
  if(local){FlowTopology.resolveSource(raw,local);return local;}
  return prepareOpenedTopology(raw,context);
}
