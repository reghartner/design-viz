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
/* Acquire only the current draft's dependency closure. Each provider is loaded
   once per pass (including diamonds), then its bytes are read again to verify
   that the complete set stayed stable. File metadata alone is not a revision.
   A racing save gets one bounded retry; no partially acquired context escapes. */
async function readLocalRepositoryTopology(directory,source,sourcePath,check){
  check=check || function(){};
  var raw;
  try{raw=JSON.parse(source);}catch(error){throw Error('Repair the consumer JSON before refreshing local sources: '+error.message);}
  async function read(path){
    check();
    try{
      var parts=path.split('/'),handle=directory;
      for(var part of parts.slice(0,-1)){handle=await handle.getDirectoryHandle(part);check();}
      var file=await(await handle.getFileHandle(parts[parts.length-1])).getFile();check();
      if(file.size>4*1024*1024)throw Error('Local '+(path==='canon.json'?'registry':'topology provider')+' exceeds the 4 MiB limit: '+path);
      var text=await file.text();check();return text;
    }catch(error){if(error.name==='AbortError')throw error;throw Object.assign(Error(path+': '+error.message),{name:error.name});}
  }
  for(var attempt=0;attempt<2;attempt++){
    check();
    if(directory.queryPermission && await directory.queryPermission({mode:'read'})!=='granted')throw Object.assign(Error('Repository read permission was lost. Reconnect local sources to grant access.'),{name:'NotAllowedError'});
    check();
    var manifest=await read('canon.json'),entries;
    try{entries=FlowCanonLibrary.entries(JSON.parse(manifest));}catch(error){throw Error('Invalid local canon.json: '+error.message);}
    var entry=entries.find(function(item){return item.path===sourcePath;});
    if(!entry)throw Error('The consumer '+sourcePath+' is no longer registered in this root’s canon.json. Restore its registration or reconnect the intended root.');
    var cache=new Map(),visiting=new Set(),reads=new Map([['canon.json',manifest]]);
    async function load(id,from){
      if(visiting.has(id))throw Error('Topology dependency cycle at '+id+' imported by '+from);
      if(cache.has(id))return;
      var provider=entries.find(function(value){return value.id===id;});
      if(!provider)throw Error('Consumer '+entry.id+': '+from+' references missing spec '+id+' in local canon.json.');
      visiting.add(id);
      var spec;
      try{
        var text=id===entry.id?source:await read(provider.path);
        if(id!==entry.id)reads.set(provider.path,text);
        spec=FlowCanonLibrary.spec(id===entry.id?raw:JSON.parse(text),provider);
      }catch(error){throw Object.assign(Error('Consumer '+entry.id+' / provider '+id+' ('+provider.path+'): '+error.message),{name:error.name});}
      for(var dependency of FlowTopology.dependencies(spec))await load(dependency,id);
      visiting.delete(id);cache.set(id,spec);
    }
    await load(entry.id,entry.id);
    var candidate={version:1,id:entry.id,local:true,specs:Array.from(cache.values()),
      localSource:{path:entry.path,rootLabel:directory.name || 'Selected repository',capturedAt:new Date().toISOString()}};
    FlowTopology.materialize(candidate.specs).forEach(function(spec){
      var errors=FlowCanon.validate(spec).concat(validate(normalize(spec)).errors);
      if(errors.length)throw Error(spec.page.canon.id+': '+errors.join('\n'));
    });
    var changed=false;
    // Reacquire file handles as well: atomic editor saves can replace files.
    for(var pair of reads){if(await read(pair[0])!==pair[1]){changed=true;break;}}
    if(changed){if(attempt===0)continue;throw Error('Local sources changed during refresh. Wait for the provider save to finish, then refresh again.');}
    if(directory.queryPermission && await directory.queryPermission({mode:'read'})!=='granted')throw Object.assign(Error('Repository read permission was lost. Reconnect local sources to grant access.'),{name:'NotAllowedError'});
    check();return candidate;
  }
}
function prepareLocalFolderTopology(text,found,context){
  var raw=JSON.parse(text),local=found && found.topologyContext;
  if(local){FlowTopology.resolveSource(raw,local);return local;}
  var dependencies=authoredTopologyDependencies(raw);
  if(dependencies.length){
    var rootHelp='Choose the repository root containing canon.json, then select this diagram. Browsers cannot read a parent folder without your selection.';
    // Ordinary folders retain the deployed-Canon workflow when no context is
    // available. A failed lookup also explains how to grant local providers.
    if(!context)return prepareAuthoredTopology(raw,null).catch(function(error){throw Error(error.message+'\n'+rootHelp);});
    // Reuse an already approved frozen context. Online contexts retain their
    // existing preparation policy; local contexts may never fetch missing IDs.
    if(context && (!context.local || dependencies.every(function(id){return context.specs.some(function(spec){return spec.page.canon.id===id;});})))return prepareAuthoredTopology(raw,context);
    throw Error('The frozen local repository snapshot is missing a required provider. '+rootHelp);
  }
  return prepareAuthoredTopology(raw,context);
}
