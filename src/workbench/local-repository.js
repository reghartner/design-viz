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
  var cache=new Map(),visiting=new Set();
  async function load(id){
    if(visiting.has(id))throw Error('Topology dependency cycle at '+id);
    if(cache.has(id))return;
    var provider=entries.find(function(value){return value.id===id;});
    if(!provider)throw Error('Topology import references missing spec '+id+' in local canon.json.');
    visiting.add(id);
    var source;
    if(id===entry.id)source=found.source;
    else{
      var handle=await(await folder(provider.folder)).getFileHandle(provider.id+'.spec.json'),file=await handle.getFile();
      if(file.size>4*1024*1024)throw Error('Local topology provider exceeds 4 MiB: '+provider.path);
      source=await file.text();
    }
    var spec=FlowCanonLibrary.spec(JSON.parse(source),provider);
    for(var dependency of FlowTopology.dependencies(spec))await load(dependency);
    visiting.delete(id);cache.set(id,spec);
  }
  await load(entry.id);
  var context={version:1,id:entry.id,local:true,specs:Array.from(cache.values())};
  FlowTopology.materialize(context.specs).forEach(function(spec){
    var errors=FlowCanon.validate(spec).concat(validate(normalize(spec)).errors);
    if(errors.length)throw Error(spec.page.canon.id+': '+errors.join('\n'));
  });
  // No handles in persisted state. The snapshot remains usable offline after
  // reload, while writes stay bound to the selected diagram's own folder.
  found.topologyContext=JSON.parse(JSON.stringify(context));found.directory=selected;found.repository=directory;
  return found;
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
