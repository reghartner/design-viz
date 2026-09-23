'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={URL,TextEncoder};
for(const name of ['document','window','navigator','FileReader','fetch'])
  Object.defineProperty(C,name,{get(){throw new Error('I/O owner used ambient '+name);}});
vm.createContext(C);
for(const name of ['validator','confluence','trace-import','workbench/persistence','workbench/session','workbench/io-model','workbench/io'])
  vm.runInContext(readSource(name+'.js'),C);
const INITIAL=' {"page":{"title":"Original","sections":[{"diagram":{"nodes":{"a":{}},"rows":[["a"]]}}]}}\n';
const TEMPLATE='<!doctype html>\n<title>Old</title>\n<script type="application/json" id="flowspec">\n{}\n</script>\n<main></main>';
const TRACE=JSON.stringify([
  {'trace.trace_id':'t','trace.span_id':'root','service.name':'api',name:'request',timestamp:1,duration_ms:100},
  {'trace.trace_id':'t','trace.span_id':'child','trace.parent_id':'root','service.name':'db',name:'query',timestamp:1.01,duration_ms:10}
]);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
// Drain chained Promise continuations without arbitrary sleeps.
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function response(text=TEMPLATE){return {ok:true,text:()=>Promise.resolve(text)};}
function harness(adapters={},options={}){
  const messages=[],downloads=[],revoked=[],readers=[],requests=[],timers=new Map(),saved=[],elements={},all=[];
  let serial=0,io,renderCount=0;
  const doc={activeElement:null};
  function element(tag='div',id=''){
    const handlers=new Map(),attrs=new Map();let content='';
    const el={tagName:tag.toUpperCase(),id,value:'',hidden:false,disabled:false,files:[],children:[],handlers,
      addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},
      removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
      setAttribute(k,v){attrs.set(k,String(v));},getAttribute:k=>attrs.get(k),
      appendChild(child){el.children.push(child);child.parentNode=el;return child;},
      remove(){if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(c=>c!==el);el.parentNode=null;},
      focus(){doc.activeElement=el;},select(){el.selected=true;},
      fire(type,props={}){const ev={key:'',target:el,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...props};
        for(const fn of [...(handlers.get(type)||[])])fn(ev);return ev;},
      click(){if(tag==='a'){if(adapters.anchorClick)adapters.anchorClick(el);downloads.push({name:el.download,url:el.href});}else el.fire('click');}
    };
    Object.defineProperty(el,'textContent',{get:()=>content,set(v){content=v;el.children=[];}});
    Object.defineProperty(el,'innerHTML',{set(){el.children=[];}});
    all.push(el);return el;
  }
  Object.assign(doc,element('document'),{createElement:tag=>element(tag),getElementById:id=>elements[id]||null});
  doc.body=element('body');
  const ids=['src','msgs','file-input','file-open','file-save','file-export','confluence-handoff','confluence-json',
    'confluence-status','confluence-copy','confluence-export','confluence-close','import-mermaid','importbox','import-mermaid-text',
    'import-mermaid-convert','import-mermaid-cancel','import-trace','tracebox','trace-text','trace-feedback','trace-file','trace-scope',
    'trace-root','trace-service','trace-convert','trace-preview-box','trace-search','trace-fields','trace-id','trace-url',
    'trace-root-label','trace-service-label','trace-clear-focus','trace-search-results','trace-search-count','trace-preview',
    'trace-summary','trace-breadcrumbs','trace-warnings','trace-services','trace-cancel','trace-open'];
  for(const id of ids)elements[id]=element(id==='src'||id.endsWith('text')||id==='confluence-json'?'textarea':'button',id);
  for(const id of ['confluence-handoff','importbox','tracebox','trace-preview-box'])elements[id].hidden=true;
  elements['trace-scope'].value='all';elements.src.value=INITIAL;
  const blobs=new Map(),browser={
    reader(){const reader={abortCount:0,abort(){this.abortCount++;},readAsText(file){this.file=file;},
      load(text){this.result=text;this.onload();},fail(){this.onerror();}};readers.push(reader);return reader;},
    fetch(url,options){const d=deferred();requests.push({url,options,...d});return d.promise;},
    abortController:()=>new AbortController(),
    objectUrl(text,mime){const url='blob:'+ ++serial;blobs.set(url,{text,mime});return url;},
    revokeUrl(url){revoked.push(url);},schedule(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id),
    copyText:()=>null,copySelection:()=>true,...adapters
  };
  const storage=new Map(),persistence=C.createBuilderPersistence({storage:()=>({getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}),
    now:()=>1,schedule:browser.schedule,cancel:browser.cancel});
  const session=C.createBuilderSession({source:{read:()=>elements.src.value,write:text=>{elements.src.value=text;}},persistence,
    render(){renderCount++;},invalidateProject(){io?.retireProject();}});
  io=C.createBuilderIO({document:doc,sourceElement:elements.src,session,browser,replaceProject:text=>session.replaceProject(text),
    message:message=>messages.push(message),saved:()=>saved.push(true),closeInsertMenu(){},canUndoImport:()=>true,beforeImport(){},afterImport(){},...options});
  return {io,session,doc,e:elements,browser,blobs,messages,downloads,revoked,readers,requests,timers,saved,all,
    get renders(){return renderCount;},get text(){return elements.src.value;},
    click:id=>elements[id].click(),type(id,value){elements[id].value=value;elements[id].fire('input');},
    file(id,name='fixture.json'){elements[id].files=[{name,size:10}];elements[id].fire('change');return readers.at(-1);},
    flush(){for(const [id,{fn}]of [...timers]){timers.delete(id);fn();}}};
}

test('file-open remains repairable and one Undo; independent trace input cancels only its reader',()=>{
  const h=harness();h.click('import-trace');
  const file=h.file('file-input'),trace=h.file('trace-file');
  h.type('trace-text','typed trace');assert.equal(trace.abortCount,1);assert.equal(file.abortCount,0);
  trace.load('stale trace');trace.fail();assert.equal(h.e['trace-text'].value,'typed trace');
  const raw='  { unfinished\r\n';file.load(raw);
  assert.equal(h.text,raw);assert.equal(h.session.baseline(),raw);assert.equal(h.e.tracebox.hidden,true);
  assert.equal(h.renders,1);h.session.undo();assert.equal(h.text,INITIAL);h.session.redo();assert.equal(h.text,raw);
  h.click('import-trace');const current=h.file('trace-file');current.load(TRACE);h.click('trace-preview');
  assert.equal(h.e['trace-convert'].disabled,false);h.click('trace-convert');
  assert.equal(JSON.parse(h.text).page.blocks[0].diagram.steps.length,2);assert.equal(h.session.imported(),false);
  assert.equal(h.session.baseline(),raw);h.session.undo();assert.equal(h.text,raw);
});

test('project replacement, close and fresh input retire trace preview, search callbacks and pending file loads',()=>{
  for(const retire of ['project','close','input']){
    const h=harness();h.click('import-trace');h.type('trace-text',TRACE);h.click('trace-preview');
    const held=h.e['trace-search-results'].children[0].handlers.get('click').values().next().value;
    const trace=h.file('trace-file');
    if(retire==='project')h.session.replaceProject('{"new":true}');
    if(retire==='close')h.click('trace-cancel');
    if(retire==='input')h.type('trace-text','new text');
    const before=h.e['trace-text'].value,feedback=h.e['trace-feedback'].textContent,source=h.text;
    trace.load('old file');trace.fail();held({});h.click('trace-convert');
    assert.equal(h.e['trace-text'].value,before,retire);assert.equal(h.e['trace-feedback'].textContent,feedback,retire);
    assert.equal(h.e['trace-scope'].value,'all',retire);assert.equal(h.text,source,retire);
    assert.equal(h.e['trace-preview-box'].hidden,true);assert.equal(trace.abortCount,1);
  }
});

test('destroy releases listeners/readers/timers/URLs and held callbacks cannot recreate UI or mutate source',()=>{
  const h=harness();h.click('file-save');h.click('import-trace');
  const file=h.file('file-input'),trace=h.file('trace-file');
  const held=h.all.flatMap(el=>[...el.handlers.values()].flatMap(set=>[...set]));
  const timers=[...h.timers.values()];assert.ok(held.length>20);assert.equal(h.downloads.length,1);
  h.io.destroy();h.io.destroy();const text=h.text,focus=h.doc.activeElement;
  for(const fn of held)fn({key:'Escape',preventDefault(){},stopPropagation(){}});
  file.load('{}');file.fail();trace.load(TRACE);trace.fail();timers.forEach(({fn})=>fn());
  assert.equal(h.text,text);assert.equal(h.doc.activeElement,focus);assert.equal(h.downloads.length,1);
  assert.equal(file.abortCount,1);assert.equal(trace.abortCount,1);assert.equal(h.timers.size,0);
  assert.deepEqual(h.revoked,h.downloads.map(d=>d.url));
  assert.equal(h.all.reduce((n,el)=>n+[...el.handlers.values()].reduce((a,s)=>a+s.size,0),0),0);
});

test('save downloads exact invalid handwriting; failed download revokes resources without changing baseline',()=>{
  const h=harness();h.type('src',' \r\n{ invalid');h.click('file-save');
  assert.equal(h.blobs.get(h.downloads[0].url).text,h.text);assert.equal(h.downloads[0].name,'flowspec.spec.json');
  assert.equal(h.session.baseline(),h.text);assert.equal(h.session.canUndo(),false);
  h.flush();assert.equal(h.revoked.length,1);assert.equal(h.doc.body.children.length,0);
  const bad=harness({anchorClick(){throw new Error('download denied');}});bad.type('src','{ invalid');bad.click('file-save');
  assert.equal(bad.revoked.length,1);assert.equal(bad.timers.size,0);assert.equal(bad.doc.body.children.length,0);
  assert.equal(bad.session.baseline(),INITIAL);assert.deepEqual(bad.saved,[]);assert.match(bad.messages.at(-1),/save failed: download denied/);
});

test('scoped draft downloads share cleanup without saving or changing the parent document',()=>{
  const h=harness(),child='{"page":{"title":"Child"}}\n',held=h.io.download;
  const release=h.io.download('child.spec.json',child,'application/json');
  assert.equal(typeof release,'function');assert.equal(h.downloads.length,1);
  assert.equal(h.blobs.get(h.downloads[0].url).text,child);
  assert.equal(h.text,INITIAL);assert.equal(h.session.baseline(),INITIAL);assert.equal(h.session.canUndo(),false);
  const callbacks=[...h.timers.values()];release();release();callbacks.forEach(({fn})=>fn());
  assert.deepEqual(h.revoked,[h.downloads[0].url]);assert.equal(h.timers.size,0);assert.equal(h.doc.body.children.length,0);
  h.io.destroy();assert.equal(held('old.spec.json',child,'application/json'),undefined);assert.equal(h.downloads.length,1);
});

test('retired clipboard rejection does not select or focus fallback, and current fallback still works',async()=>{
  for(const retire of ['project','close','input','destroy']){
    const pending=deferred();let fallbacks=0;
    const h=harness({copyText:()=>pending.promise,copySelection(){fallbacks++;return true;}});
    h.click('confluence-copy');assert.equal(h.e['confluence-handoff'].hidden,false);
    if(retire==='project')h.session.replaceProject('{}');
    if(retire==='close')h.click('confluence-close');
    if(retire==='input')h.type('confluence-json','manually replaced');
    if(retire==='destroy')h.io.destroy();
    h.e.src.focus();const status=h.e['confluence-status'].textContent;
    pending.reject(new Error('denied'));await settle();
    assert.equal(fallbacks,0,retire);assert.equal(h.doc.activeElement,h.e.src,retire);assert.equal(h.e['confluence-status'].textContent,status);
    if(retire!=='input')assert.equal(h.e['confluence-handoff'].hidden,true);
  }
  const pending=deferred(),h=harness({copyText:()=>pending.promise});h.click('confluence-copy');
  h.click('import-trace');const reader=h.file('trace-file');h.type('trace-text','typed');assert.equal(reader.abortCount,1);
  pending.reject(new Error('no clipboard'));await settle();
  assert.equal(h.doc.activeElement,h.e['confluence-json']);assert.match(h.e['confluence-status'].textContent,/Copied/);
});

test('new exports and project retirement block held response and body completions without fallback requests',async()=>{
  const h=harness();h.click('file-export');const old=h.requests[0];h.session.replaceProject('{"page":{"title":"New"}}');
  assert.equal(old.options.signal.aborted,true);let bodies=0;old.resolve({ok:true,text(){bodies++;return TEMPLATE;}});await settle();
  assert.equal(bodies,0);assert.equal(h.downloads.length,0);assert.equal(h.requests.length,1);
  h.click('file-export');const body=deferred();h.requests[1].resolve({ok:true,text:()=>body.promise});await settle();
  h.click('file-export');body.resolve(TEMPLATE);await settle();assert.equal(h.downloads.length,0);
  h.requests[2].resolve(response());await settle();
  assert.deepEqual(h.downloads.map(d=>d.name),['new.spec.json','new.html']);
  h.flush();assert.equal(h.revoked.length,2);assert.equal(h.doc.body.children.length,0);
});

test('transport and invalid-template fallbacks retain the frozen export snapshot; exhaustion and failure publish no downloads',async()=>{
  const h=harness();h.click('file-export');h.type('src','new invalid handwriting');
  h.requests[0].reject(new Error('404'));await settle();h.requests[1].resolve(response('not a template'));await settle();
  h.requests[2].resolve(response());await settle();
  assert.equal(h.blobs.get(h.downloads[0].url).text,INITIAL);
  assert.ok(h.blobs.get(h.downloads[1].url).text.includes(INITIAL.trim()));assert.equal(h.text,'new invalid handwriting');
  assert.equal(h.session.canUndo(),false);assert.equal(h.session.baseline(),INITIAL);
  const failed=harness();failed.click('file-export');
  for(let i=0;i<3;i++){failed.requests[i].reject(new Error('offline'));await settle();}
  assert.equal(failed.downloads.length,0);assert.match(failed.messages.at(-1),/could not load the page template/);
  const denied=harness({anchorClick(){throw new Error('denied');}});denied.click('file-export');denied.requests[0].resolve(response());await settle();
  assert.equal(denied.requests.length,1,'publication failure does not retry template transport');
  assert.equal(denied.revoked.length,1);assert.match(denied.messages.at(-1),/export failed: denied/);
});

function directory(){
  const events=[],gates={};
  const writer={async write(text){events.push(['write',text]);if(gates.write)await gates.write.promise;},
    async close(){events.push(['close']);if(gates.close)await gates.close.promise;},async abort(){events.push(['abort']);}};
  const handle={async createWritable(){events.push(['writable']);if(gates.writable)await gates.writable.promise;return writer;}};
  const dir={async getFileHandle(name,options){events.push(['handle',name,options.create]);if(gates.handle)await gates.handle.promise;return handle;}};
  return {events,gates,writer,handle,dir};
}
async function startDirectory(h){h.click('file-export');await settle();h.requests[0].resolve(response());await settle();}
test('retirement at picker, handle or writable boundaries avoids starting a stale disk write',async()=>{
  const pick=deferred(),h=harness({pickDirectory:()=>pick.promise});h.click('file-export');h.session.replaceProject('{}');
  const d=directory();pick.resolve(d.dir);await settle();assert.equal(h.requests.length,0);assert.deepEqual(d.events,[]);
  for(const stage of ['handle','writable']){
    const d=directory();d.gates[stage]=deferred();const h=harness({pickDirectory:()=>Promise.resolve(d.dir)});
    await startDirectory(h);h.io.retireProject();d.gates[stage].resolve();await settle();
    assert.deepEqual(d.events.map(e=>e[0]),stage==='handle'?['handle']:['handle','writable','abort']);assert.deepEqual(h.messages,[]);
  }
});

test('a write already in progress finishes its authorized snapshot and closes, while retired follow-on HTML and UI stay blocked',async()=>{
  const d=directory();d.gates.write=deferred();const h=harness({pickDirectory:()=>Promise.resolve(d.dir)});
  await startDirectory(h);assert.equal(d.events.at(-1)[0],'write');h.session.replaceProject('{"next":true}');
  d.gates.write.resolve();await settle();
  assert.deepEqual(d.events.map(e=>e[0]),['handle','writable','write','close']);assert.equal(d.events[2][1],INITIAL);
  assert.deepEqual(h.messages,[]);assert.equal(h.text,'{"next":true}');
});

test('directory failures abort opened streams and report only current failures; successful export writes both matching files',async()=>{
  for(const stage of ['write','close'])for(const retire of [false,true]){
    const d=directory();d.gates[stage]=deferred();const h=harness({pickDirectory:()=>Promise.resolve(d.dir)});
    await startDirectory(h);if(retire)h.io.retireProject();d.gates[stage].reject(new Error(stage+' denied'));await settle();
    assert.equal(d.events.at(-1)[0],'abort');assert.equal(d.events.filter(e=>e[0]==='handle').length,1);
    if(retire)assert.deepEqual(h.messages,[]);else assert.match(h.messages.at(-1),/export failed while writing: .* denied/);
  }
  const d=directory(),h=harness({pickDirectory:()=>Promise.resolve(d.dir)});await startDirectory(h);
  assert.deepEqual(d.events.filter(e=>e[0]==='handle').map(e=>e[1]),['original.spec.json','original.html']);
  const writes=d.events.filter(e=>e[0]==='write');assert.equal(writes[0][1],INITIAL);assert.ok(writes[1][1].includes(INITIAL.trim()));
  assert.equal(d.events.filter(e=>e[0]==='close').length,2);assert.match(h.messages.at(-1),/exported original/);
});


test('Mermaid keyboard ownership preserves the active-workbench gate and Escape focus',()=>{
  let active=true;const h=harness({},{isActive:()=>active});h.click('import-mermaid');
  active=false;h.e.src.focus();let ev=h.doc.fire('keydown',{key:'Escape'});
  assert.equal(ev.defaultPrevented,undefined);assert.equal(h.e.importbox.hidden,false);assert.equal(h.doc.activeElement,h.e.src);
  active=true;ev=h.doc.fire('keydown',{key:'Escape'});
  assert.equal(ev.defaultPrevented,true);assert.equal(h.e.importbox.hidden,true);assert.equal(h.doc.activeElement,h.e['import-mermaid']);
});


test('I/O instances own separate readers and URLs; retired project callbacks stay inert after destroy',()=>{
  const a=harness(),b=harness();a.click('file-save');b.click('file-save');
  const old=a.file('file-input'),current=b.file('file-input');a.io.destroy();
  assert.equal(old.abortCount,1);assert.equal(current.abortCount,0);assert.equal(b.revoked.length,0);assert.equal(b.timers.size,1);
  a.e.importbox.hidden=false;a.e.tracebox.hidden=false;a.e['confluence-handoff'].hidden=false;
  a.io.retireProject();assert.equal(a.e.importbox.hidden,false);assert.equal(a.e.tracebox.hidden,false);
  assert.equal(a.e['confluence-handoff'].hidden,false,'retained retired API cannot hide a newly mounted owner');
  current.load('  { validLater');assert.equal(b.text,'  { validLater');b.flush();assert.equal(b.revoked.length,1);
});

test('failed readers leave source/history intact and later current reads remain usable',()=>{
  const h=harness();const file=h.file('file-input');file.fail();
  assert.equal(h.text,INITIAL);assert.equal(h.session.canUndo(),false);assert.match(h.messages.at(-1),/could not read/);
  h.click('import-trace');const trace=h.file('trace-file');trace.fail();
  assert.equal(h.e['trace-text'].value,'');assert.match(h.e['trace-feedback'].textContent,/Could not read/);
  h.file('trace-file').load(TRACE);h.click('trace-preview');assert.equal(h.e['trace-convert'].disabled,false);
  h.file('file-input').load('{ handwritten');assert.equal(h.text,'{ handwritten');
});

test('picker and unopened handle failures publish no files; retired failures leave UI alone',async()=>{
  for(const retired of [false,true]){
    const pending=deferred(),h=harness({pickDirectory:()=>pending.promise});h.click('file-export');
    if(retired)h.io.retireProject();pending.reject(new Error('permission denied'));await settle();
    assert.equal(h.requests.length,0);if(retired)assert.deepEqual(h.messages,[]);else assert.match(h.messages.at(-1),/export failed: permission denied/);
  }
  for(const stage of ['handle','writable']){
    const d=directory();d.gates[stage]=deferred();const h=harness({pickDirectory:()=>Promise.resolve(d.dir)});
    await startDirectory(h);d.gates[stage].reject(new Error('unopened'));await settle();
    assert.equal(d.events.some(e=>e[0]==='write'||e[0]==='abort'),false);assert.match(h.messages.at(-1),/export failed while writing: unopened/);
  }
});
