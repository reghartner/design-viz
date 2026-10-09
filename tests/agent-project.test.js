const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function setup(){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'flowview-project-'));
  const ctx=vm.createContext({TextEncoder,Date});
  for(const file of ['folder-agent.js','agent-project.js'])vm.runInContext(await fs.readFile(path.join(__dirname,'../src/workbench',file),'utf8'),ctx);
  let fail=null,writeNumber=0,crash=null;
  function dir(base){return {name:path.basename(base),async *values(){for(const e of await fs.readdir(base,{withFileTypes:true}))yield {name:e.name,kind:e.isDirectory()?'directory':'file'};},
    async getDirectoryHandle(name,opts){const target=path.join(base,name);try{if(opts?.create)await fs.mkdir(target,{recursive:true});await fs.stat(target);}catch(e){if(e.code==='ENOENT')throw Object.assign(Error('Missing'),{name:'NotFoundError'});throw e;}return dir(target);},
    async getFileHandle(name,opts){const target=path.join(base,name);try{await fs.stat(target);}catch(e){if(e.code!=='ENOENT')throw e;if(!opts?.create)throw Object.assign(Error('Missing'),{name:'NotFoundError'});await fs.writeFile(target,'');}return {
      async getFile(){const content=await fs.readFile(target,'utf8');return {size:Buffer.byteLength(content),text:async()=>content};},
      async createWritable(){let content;return {async write(value){content=value;},async close(){
        const index=++writeNumber;
        if(fail===name || crash?.index===index && crash.phase==='before'){fail=null;throw Error('disk full');}
        await fs.writeFile(target,content);
        if(crash?.index===index && crash.phase==='after')throw Error('uncertain close');
      },async abort(){}};}
    };}};}
  return {folder,open:filename=>ctx.openFolderAgentProject(dir(folder),filename),write:(name,text)=>fs.writeFile(path.join(folder,name),text),read:name=>fs.readFile(path.join(folder,name),'utf8'),fail:name=>fail=name,crash:(index,phase)=>{writeNumber=0;crash=index?{index,phase}:null;},close:()=>fs.rm(folder,{recursive:true,force:true})};
}
test('existing named spec and ledger open without connection metadata and keep unrelated files',async()=>{
  const h=await setup();try{
    await h.write('payments.spec.json','{"title":"Saved"}');await h.write('payments.ledger.md','# Evidence\nSaved decisions');await h.write('README.md','Leave me alone');
    const found=await h.open();assert.equal(found.spec,'payments.spec.json');assert.equal(found.source,'{"title":"Saved"}');
    const opened=await found.initialize();assert.equal(opened.ledger,'# Evidence\nSaved decisions');
    await opened.files.flushArtifacts('{"title":"Accepted"}','# Evidence\nAccepted decisions');
    assert.equal(await h.read('payments.spec.json'),'{"title":"Accepted"}');assert.equal(await h.read('payments.ledger.md'),'# Evidence\nAccepted decisions');assert.equal(await h.read('README.md'),'Leave me alone');
    assert.equal(await h.read('.flowview-agent/.gitignore'),'*\n');
    assert.equal((await h.open()).source,'{"title":"Accepted"}');
  }finally{await h.close();}
});
test('empty folders create a stable spec/ledger pair and never a random session folder',async()=>{
  const h=await setup();try{const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','');assert.deepEqual((await fs.readdir(h.folder)).sort(),['.flowview-agent','story.ledger.md','story.spec.json']);}finally{await h.close();}
});
test('multiple specs return filename choices; malformed JSON is preserved without metadata writes',async()=>{
  const h=await setup();try{
    await h.write('one.spec.json','{}');await h.write('two.spec.json','{}');const choices=await h.open();assert.equal(choices.selectionRequired,true);assert.deepEqual(Array.from(choices.specs),['one.spec.json','two.spec.json']);
    assert.equal((await h.open('two.spec.json')).spec,'two.spec.json');await h.write('two.spec.json','{broken');await assert.rejects(h.open('two.spec.json'),/JSON|property/i);
    await assert.rejects(fs.stat(path.join(h.folder,'.flowview-agent')),/ENOENT/);
  }finally{await h.close();}
});
test('outside edits block writes without overwriting either artifact',async()=>{
  const h=await setup();try{const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','# Initial');await h.write('story.ledger.md','# Outside edit');await assert.rejects(opened.files.flushArtifacts('{"new":1}','# New'),/outside/);assert.equal(await h.read('story.spec.json'),'{}');assert.equal(await h.read('story.ledger.md'),'# Outside edit');}finally{await h.close();}
});
test('interrupted pair write recovers the approved pair; conflicting external edits stop recovery',async()=>{
  for(const outside of [false,true]){
    const h=await setup();try{const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','# Before');h.fail('story.ledger.md');await assert.rejects(opened.files.flushArtifacts('{"new":1}','# After'),/disk full/);
      if(outside){await h.write('story.ledger.md','# Outside');await assert.rejects((await h.open()).initialize(),/outside edits/);assert.equal(await h.read('story.ledger.md'),'# Outside');}
      else{const recovered=await (await h.open()).initialize();assert.equal(recovered.source,'{"new":1}');assert.equal(recovered.ledger,'# After');assert.equal(await h.read('story.ledger.md'),'# After');}
    }finally{await h.close();}
  }
});
test('an active editor lease blocks reopening before recovery or metadata writes',async()=>{
  const h=await setup();try{const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','# Initial');await opened.files.write('session.json',{protocol:'flowview-folder-v1',sessionId:'s',connectionId:'c'});await opened.files.write('editor.json',{sessionId:'s',connectionId:'c',connected:true,at:Date.now()});await assert.rejects((await h.open()).initialize(),/another editor/);}finally{await h.close();}
});

test('abandoned empty metadata files recover and a legacy folder ignores candidate specs',async()=>{
  const h=await setup();try{
    await fs.mkdir(path.join(h.folder,'.flowview-agent'));
    for(const name of ['project.json','session.json','editor.json','artifact-write.json'])await h.write('.flowview-agent/'+name,'');
    await h.write('story.spec.json','{}');const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','# Recovered');assert.equal(await h.read('story.ledger.md'),'# Recovered');
    await fs.rm(path.join(h.folder,'.flowview-agent'),{recursive:true});await h.write('session.json',JSON.stringify({protocol:'flowview-folder-v1',sessionId:'s',connectionId:'old'}));await h.write('candidate.spec.json','{}');
    assert.equal((await h.open()).spec,'story.spec.json');
  }finally{await h.close();}
});

test('every paired-write boundary survives failure before or after close, including new native placeholders',async()=>{
  for(const existing of [false,true])for(const phase of ['before','after'])for(let index=1;index<=4;index++){
    const h=await setup();try{
      const opened=await (await h.open()).initialize(),before={source:'{"revision":0}',ledger:'# Before'},after={source:'{"revision":1}',ledger:'# After'};
      if(existing)await opened.files.flushArtifacts(before.source,before.ledger);
      h.crash(index,phase);
      await assert.rejects(opened.files.flushArtifacts(after.source,after.ledger),/disk full|uncertain close/);
      h.crash(null);
      const recovered=await (await h.open()).initialize();
      const expected=index===1 && phase==='before'?(existing?before:{source:null,ledger:''}):after;
      assert.equal(recovered.source,expected.source,JSON.stringify({existing,phase,index}));
      assert.equal(recovered.ledger,expected.ledger,JSON.stringify({existing,phase,index}));
      await recovered.files.flushArtifacts(after.source,after.ledger);
      assert.equal(await h.read('story.spec.json'),after.source);assert.equal(await h.read('story.ledger.md'),after.ledger);
    }finally{await h.close();}
  }
});

test('large escaped specs remain writable and recoverable within the advertised artifact limits',async()=>{
  const h=await setup();try{
    const before=JSON.stringify({description:'"'.repeat(1500000),revision:0}),after=JSON.stringify({description:'"'.repeat(1500000),revision:1});
    assert(Buffer.byteLength(before)<4*1024*1024);
    const opened=await (await h.open()).initialize();await opened.files.flushArtifacts(before,'# Before');
    h.fail('story.ledger.md');await assert.rejects(opened.files.flushArtifacts(after,'# After'),/disk full/);
    const recovered=await (await h.open()).initialize();assert.equal(recovered.source,after);assert.equal(recovered.ledger,'# After');
  }finally{await h.close();}
});

test('oversized handwritten artifacts cannot replace the last reopenable pair',async()=>{
  for(const kind of ['source','ledger']){
    const h=await setup();try{
      const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','# Before');
      const source=kind==='source'?JSON.stringify({description:'a'.repeat(4*1024*1024)}):'{}';
      const ledger=kind==='ledger'?'a'.repeat(256*1024+1):'# Before';
      await assert.rejects(opened.files.flushArtifacts(source,ledger),/size limit/);
      assert.equal(await h.read('story.spec.json'),'{}');assert.equal(await h.read('story.ledger.md'),'# Before');
      assert.equal(await h.read('.flowview-agent/artifact-write.json'),'null\n');
      assert.equal((await h.open()).source,'{}');
    }finally{await h.close();}
  }
});


test('folder inspection identifies prior artifacts and connection metadata before any writes',async()=>{
  const h=await setup();try{
    assert.equal((await h.open()).existing,false);
    await h.write('story.ledger.md','# Existing work');assert.equal((await h.open()).existing,true);
    await fs.unlink(path.join(h.folder,'story.ledger.md'));await fs.mkdir(path.join(h.folder,'.flowview-agent'));
    assert.equal((await h.open()).existing,true);
  }finally{await h.close();}
});

test('cancelled preparation and changed saved artifacts cannot initialize folder metadata',async()=>{
  for(const change of ['cancel','source','ledger']){
    const h=await setup();try{
      await h.write('story.spec.json','{"title":"Original"}');await h.write('story.ledger.md','# Original');const found=await h.open();
      if(change==='source')await h.write('story.spec.json','{"title":"Outside"}');
      if(change==='ledger')await h.write('story.ledger.md','# Outside');
      await assert.rejects(found.initialize(()=>{if(change==='cancel')throw Error('Cancelled');}),change==='cancel'?/Cancelled/:/changed while opening/);
      await assert.rejects(fs.stat(path.join(h.folder,'.flowview-agent')),/ENOENT/);
      assert.equal(await h.read('story.spec.json'),change==='source'?'{"title":"Outside"}':'{"title":"Original"}');
    }finally{await h.close();}
  }
});
test('interrupted artifacts expose their exact approved target for validation before recovery writes',async()=>{
  const h=await setup();try{
    const opened=await (await h.open()).initialize();await opened.files.flushArtifacts('{}','# Before');h.fail('story.ledger.md');
    const after='{"title":"Approved target"}';await assert.rejects(opened.files.flushArtifacts(after,'# After'),/disk full/);
    const found=await h.open();assert.equal(found.recovering,true);assert.equal(found.source,after);
    await assert.rejects(found.initialize(()=>{throw Error('Invalid approved provider');}),/Invalid approved provider/);
    assert.equal(await h.read('story.ledger.md'),'# Before');
    const journal=JSON.parse(await h.read('.flowview-agent/artifact-write.json'));journal.after.source='{"title":"Changed target"}';await h.write('.flowview-agent/artifact-write.json',JSON.stringify(journal));
    await assert.rejects(found.initialize(),/saved recovery changed/);assert.equal(await h.read('story.ledger.md'),'# Before');
  }finally{await h.close();}
});
