/* Durable diagram artifacts; transport files are private to .flowview-agent/. */
async function openFolderAgentProject(directory, filename){
  var root=createFolderAgentFiles(directory),metadata,legacy=false,config=null;
  try{metadata=await directory.getDirectoryHandle('.flowview-agent');}catch(ex){if(ex.name!=='NotFoundError')throw ex;}
  if(!metadata){
    var old;try{old=await root.read('session.json');}catch(ex){if(ex.name!=='SyntaxError')throw ex;}
    if(old && old.protocol==='flowview-folder-v1'){metadata=directory;legacy=true;}
  }
  var openingOwner=null;
  if(metadata){var initialFiles=createFolderAgentFiles(metadata);config=await initialFiles.read('project.json');openingOwner=await initialFiles.read('session.json');}
  function valid(name,suffix){return typeof name==='string' && /^[\w .-]+$/.test(name) && !name.startsWith('.') && name.endsWith(suffix);}
  if(config && (config.version!==1 || !valid(config.spec,'.spec.json') || !valid(config.ledger,'.ledger.md')))throw Error('Invalid diagram folder metadata. The existing files have not been changed.');
  filename=String(filename || '').trim();
  if(filename && !valid(filename,'.spec.json'))throw Error('Use a plain diagram filename ending in .spec.json.');
  if(config && filename && filename!==config.spec)throw Error('This folder is connected to '+config.spec+'. Clear the filename to reopen it.');
  var names=[];
  if(!filename && !config && !legacy && typeof directory.values==='function'){
    for await(var entry of directory.values())if(entry.kind==='file' && valid(entry.name,'.spec.json'))names.push(entry.name);
    if(names.length>1)throw Error('This folder has several diagram specs. Enter the diagram filename in setup, then choose this folder again.');
  }
  var spec=config?config.spec:filename || names[0] || 'story.spec.json';
  var ledger=config?config.ledger:spec.slice(0,-10)+'.ledger.md';
  var source=await root.readText(spec,4*1024*1024),notes=await root.readText(ledger,256*1024);
  var recovery=metadata?await createFolderAgentFiles(metadata).read('artifact-write.json'):null;
  if(source!==null && !recovery)JSON.parse(source);
  // Do not create support files until the caller has validated and opened the spec.
  async function initialize(){
    if(!metadata)metadata=await directory.getDirectoryHandle('.flowview-agent',{create:true});
    var files=createFolderAgentFiles(metadata),expected={source:source,ledger:notes};
    var owner=await files.read('session.json'),lease=await files.read('editor.json');
    if(owner && owner.recoveryState && Number.isFinite(owner.claimAt) && Date.now()-owner.claimAt<15000)throw Error('Another editor is opening this folder. Wait a few seconds and try again.');
    if(!owner && lease && lease.connected && Date.now()-lease.at<15000)throw Error('Another editor may be opening this folder. Wait a few seconds and try again.');
    if(owner && lease && lease.sessionId===owner.sessionId && lease.connectionId===owner.connectionId && lease.connected && Date.now()-lease.at<15000)throw Error('This folder is still connected to another editor. Disconnect it there first.');
    async function openingGuard(){
      var latest=await files.read('session.json'),active=await files.read('editor.json');
      if(JSON.stringify(latest)!==JSON.stringify(openingOwner))throw Error('The saved session identity changed while opening this diagram folder. Choose it again.');
      if(latest && latest.recoveryState && Number.isFinite(latest.claimAt) && Date.now()-latest.claimAt<15000)throw Error('Another editor is opening this folder. Wait a few seconds and try again.');
      if(latest && active && active.sessionId===latest.sessionId && active.connectionId===latest.connectionId && active.connected && Date.now()-active.at<15000)throw Error('This folder is still connected to another editor. Disconnect it there first.');
    }
    await openingGuard();
    var mapping={version:1,spec:spec,ledger:ledger};
    var pending=await files.read('artifact-write.json');
    async function actual(){return {source:await root.readText(spec,4*1024*1024),ledger:await root.readText(ledger,256*1024)};}
    function same(a,b){return a.source===b.source && a.ledger===b.ledger;}
    async function check(write){var found=await actual();if(write && write.created){var key=write.name===spec?'source':write.name===ledger?'ledger':null;if(key && expected[key]===null && found[key]==='')found[key]=null;}if(!same(found,expected))throw Error('The diagram files changed outside the workbench. Disconnect and reopen this folder to review those changes; no external edits were overwritten.');}
    async function writePair(value,guard){
      async function safe(write){if(guard)await guard();await check(write);}
      await safe();
      for(var item of [[spec,'source'],[ledger,'ledger']]){
        if(expected[item[1]]===value[item[1]])continue;
        await root.write(item[0],value[item[1]],safe);expected[item[1]]=value[item[1]];
      }
    }
    if(pending){
      if(pending.version!==1 || pending.spec!==spec || pending.ledger!==ledger || !pending.before || !pending.after ||
        typeof pending.after.source!=='string' || typeof pending.after.ledger!=='string')throw Error('An interrupted artifact write needs recovery. Keep this folder intact.');
      JSON.parse(pending.after.source);
      if(new TextEncoder().encode(pending.after.source).length>4*1024*1024 || new TextEncoder().encode(pending.after.ledger).length>256*1024)throw Error('Interrupted artifacts exceed the size limit.');
      var found=await actual();
      if(!['source','ledger'].every(function(key){return found[key]===pending.before[key] || found[key]===pending.after[key] || pending.before[key]===null && found[key]==='';}))throw Error('An interrupted write and outside edits both exist. Preserve the files and resolve artifact-write.json before reconnecting.');
      expected=found;
      // Finish only the already approved pair; never roll back an outside edit.
      await writePair(pending.after,openingGuard);await files.write('artifact-write.json',null,openingGuard);
      source=expected.source;notes=expected.ledger;
    }
    if(!config)await files.write('project.json',mapping,openingGuard);
    if(!legacy && await files.readText('.gitignore')===null)await files.write('.gitignore','*\n',openingGuard);
    await openingGuard();
    var result=Object.assign({},files,{artifacts:{spec:spec,ledger:ledger,metadata:legacy?'.':'.flowview-agent'},
      readText:function(name,limit){return name==='story.spec.json'?root.readText(spec,limit):name==='story.ledger.md'?root.readText(ledger,limit):files.readText(name,limit);},
      read:function(name){return name==='story.spec.json'?root.read(spec):files.read(name);},
      checkArtifacts:check,
      flushArtifacts:async function(nextSource,nextLedger,guard){
        var next={source:nextSource,ledger:nextLedger || ''};
        await check();if(guard)await guard();if(same(expected,next))return;
        await files.write('artifact-write.json',{version:1,spec:spec,ledger:ledger,before:expected,after:next},guard);
        await writePair(next,guard);await files.write('artifact-write.json',null,guard);
      }});
    return {files:result,source:source,ledger:notes || '',hasLedger:notes!==null,legacy:legacy};
  }
  return {source:recovery?null:source,recovering:!!recovery,ledger:notes || '',spec:spec,initialize:initialize};
}
