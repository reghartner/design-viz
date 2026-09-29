'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/workbench/story-brief.js'),'utf8');
const C={TextEncoder,Uint8Array,DataView,Date,Set};
for(const key of ['fetch','window','navigator'])Object.defineProperty(C,key,{get(){throw Error('Unexpected ambient I/O: '+key);}});
vm.createContext(C);vm.runInContext(source,C);
const plain=value=>JSON.parse(JSON.stringify(value));
const spec={page:{title:'Appointments — café',generatedFrom:{url:'https://example.test/design',version:'v2'},sections:[{
  id:'journey',heading:'Book a visit',diagram:{
    nodes:{customer:{title:'Customer',codeRefs:[{id:'booking',path:'src/book.ts',commit:'a'.repeat(40)}]}},
    steps:[{id:'confirm',text:'Appointment confirmed'}]
  }
}]}};
const text=JSON.stringify(spec);
const ledger='# Coverage ledger\nsource: docs/booking.md | version: v2\n\n## A. Story\n**Audience:** Booking team\n**Takeaway:** A customer can book a visit.\n\n## Amendments\nThe author agreed to retain the failed booking path.\n\n## Decisions I made\nAn engineer must review retry policy.\n\n## Assumptions\nAvailability is supplied by the calendar.\n\n## Engineering gaps\nWhat happens if two customers pick the same slot?\n\n## Evidence\nhttps://example.test/contract\n';
test('ledger separates intent, author answers, assumptions, decisions and gaps without interpreting HTML or fenced headings',()=>{
  const parsed=C.parseStoryLedger(ledger+'\n## Notes\n```text\n## Assumptions\n<script>alert(1)</script>\n```');
  assert.match(parsed.groups.intent[0].text,/Booking team/);assert.match(parsed.groups.behavior[0].text,/agreed/);
  assert.equal(parsed.groups.assumptions.length,1);assert.match(parsed.groups.questions[0].text,/two customers/);
  assert.match(parsed.groups.other[0].text,/<script>alert/);assert.throws(()=>C.parseStoryLedger('é'.repeat(600000)),/1 MiB/);
});
test('source manifest preserves exact references and locations; local names are references only',()=>{
  const input=JSON.parse(text);input.storyBrief={evidence:[{storyTarget:{kind:'node',sectionId:'journey',id:'customer'},reference:'/private/source.md',relationship:'conflicts',note:'Code contradicts availability promise.'}]};
  const refs=plain(C.storyBriefReferences(input,ledger));assert.ok(refs.every(ref=>ref.contentsIncluded===false));
  assert.ok(refs.some(ref=>ref.kind==='code' && ref.reference.commit==='a'.repeat(40)));
  assert.ok(refs.some(ref=>ref.kind==='ledger-source' && ref.reference.includes('docs/booking.md')));
  assert.ok(refs.some(ref=>ref.kind==='engineering-evidence' && ref.reference.reference==='/private/source.md'));
  assert.equal(input.storyBrief.evidence[0].relationship,'conflicts');
});
test('ledger freshness does not invent revision verification from read time or folder state',()=>{
  assert.equal(C.storyBriefLedgerStatus(null,{source:text}).state,'missing');
  assert.equal(C.storyBriefLedgerStatus({text:ledger,sharedRevision:'c-5',at:Date.now()},{source:text}).state,'unverified');
  assert.equal(C.storyBriefLedgerStatus({text:ledger,source:'other'},{source:text}).state,'stale');
  assert.equal(C.storyBriefLedgerStatus({text:ledger,source:text},{source:text}).state,'matched');
});
test('portable handoff preserves exact editable source, ledger and same-snapshot viewer with honest local provenance',()=>{
  const exact='  '+text+'\n',html='<!doctype html><title>Appointment viewer</title>';
  const built=C.buildStoryHandoff({source:exact,html,ledger:{text:ledger,sourceRevision:null,readAt:123},provenance:{title:'Approved bookings',revision:'original-123'},changes:[{summary:'Add unavailable path',status:'applied'}],at:'2026-09-28T13:00:00Z'});
  assert.equal(built.files.find(file=>file.name==='story.spec.json').text,exact);
  assert.equal(built.files.find(file=>file.name==='story.html').text,html);
  assert.equal(built.files.find(file=>file.name==='story.ledger.md').text,ledger);
  assert.equal(built.manifest.publication,'local-draft');assert.equal(built.manifest.provenance.revision,'original-123');
  assert.equal(built.manifest.ledger.status,'unverified');assert.match(built.files.find(file=>file.name==='README.md').text,/not a complete audit/);
  assert.match(built.files.find(file=>file.name==='README.md').text,/Add unavailable path/);
  assert.match(C.buildStoryHandoff({source:text,html}).files.find(file=>file.name==='story.ledger.md').text,/unavailable/);
  assert.throws(()=>C.buildStoryHandoff({source:'{',html}),/Fix the story JSON/);assert.throws(()=>C.buildStoryHandoff({source:text,html:''}),/not downloaded/);
});
test('ZIP output has valid local entries, CRC32, UTF8 bytes and central-directory offsets',()=>{
  const files=[{name:'check.txt',text:'123456789'},{name:'story.md',text:'Café ☕'}],bytes=C.storyBriefZip(files),data=Buffer.from(bytes);
  assert.equal(data.readUInt32LE(0),0x04034b50);assert.equal(data.readUInt32LE(14),0xcbf43926);
  let offset=0;for(const file of files){assert.equal(data.readUInt32LE(offset),0x04034b50);const length=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26);
    assert.equal(data.subarray(offset+30,offset+30+nameLength).toString(),file.name);assert.equal(data.subarray(offset+30+nameLength,offset+30+nameLength+length).toString(),file.text);offset+=30+nameLength+length;}
  const central=offset;assert.equal(data.readUInt32LE(central),0x02014b50);assert.equal(data.readUInt32LE(data.length-22),0x06054b50);assert.equal(data.readUInt32LE(data.length-6),central);
  assert.throws(()=>C.storyBriefZip([{name:'../secret',text:'x'}]),/file name/);assert.throws(()=>C.storyBriefZip([{name:'a',text:''},{name:'a',text:''}]),/file name/);
});
test('evidence targets use stable identifiers and never infer identity from an array index',()=>{
  const input=JSON.parse(text);input.page.sections.push({heading:'Anonymous section',diagram:{nodes:{x:{}}}});
  const targets=plain(C.storyBriefTargets(input));assert.deepEqual(targets.map(x=>x.value),[{kind:'story'},{kind:'section',sectionId:'journey'},{kind:'node',sectionId:'journey',id:'customer'},{kind:'step',sectionId:'journey',id:'confirm'}]);
  assert.deepEqual(plain(C.storyBriefTargets({page:{sections:{}}})),[{label:'Whole story',value:{kind:'story'}}]);
});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(options={}){
  const downloads=[],urls=new Map(),revoked=[],timers=new Map(),all=[];let id=0,snapshot={source:text,project:1,open:true};
  function element(tag){const handlers=new Map();let content='';const node={tagName:tag.toUpperCase(),children:[],dataset:{},value:'',disabled:false,hidden:false,
    appendChild(child){this.children.push(child);child.parentNode=this;return child;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);},
    setAttribute(){},addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);},
    click(){if(tag==='a')downloads.push({name:this.download,url:this.href});else return this.fire('click');},fire(type){return handlers.get(type)?.({preventDefault(){}});}};
    Object.defineProperty(node,'textContent',{get(){return content;},set(value){content=String(value);this.children=[];}});
    Object.defineProperty(node,'innerHTML',{set(){throw Error('Ledger must be inert');}});
    Object.defineProperty(node,'options',{get(){return this.children;}});all.push(node);return node;}
  const mount=element('section'),document={body:element('body'),createElement:element,getElementById:id=>id==='editor-brief'?mount:null,
    defaultView:{Blob,URL:{createObjectURL(blob){const url='blob:'+ ++id;urls.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);}},setTimeout(fn){const key=++id;timers.set(key,fn);return key;},clearTimeout(key){timers.delete(key);}}};
  const api=C.initWorkbenchStoryBrief({document,snapshot:()=>snapshot,readLedger:async()=>({text:ledger}),renderHtml:async value=>'<html>'+value+'</html>',...options});
  return {api,all,mount,downloads,urls,revoked,timers,setSnapshot:next=>{snapshot={...snapshot,...next};},button:label=>all.find(el=>el.tagName==='BUTTON' && el.textContent===label),text:()=>all.map(el=>el.textContent).join('\n')};
}
test('brief renders script-looking content as inert text and functions without a connected agent',async()=>{
  const h=harness({readLedger:async()=>({text:ledger+'\n## Assumptions\n<img src=x onerror=alert(1)>'})});await settle();
  assert.match(h.text(),/<img src=x/);assert.match(h.text(),/correspondence/);
  await h.button('Download review package').click();assert.equal(h.downloads.length,1);
  const archive=Buffer.from(await h.urls.get(h.downloads[0].url).arrayBuffer());assert.ok(archive.includes(Buffer.from('story.spec.json')));
  h.api.destroy();assert.equal(h.revoked.length,1);assert.equal(h.timers.size,0);assert.equal(h.mount.children.length,0);
  const noAgent=harness({readLedger:async()=>null});await settle();assert.match(noAgent.text(),/No story ledger/);await noAgent.button('Download review package').click();assert.equal(noAgent.downloads.length,1);noAgent.api.destroy();
});
test('late ledger reads cannot cross a project replacement or a destroyed brief',async()=>{
  const old=deferred(),h=harness({readLedger:()=>old.promise});h.setSnapshot({source:'{"title":"New project"}',project:2});h.api.refresh();h.api.destroy();old.resolve({text:'## A. Story\nSTALE SECRET'});await settle();
  assert.ok(!h.text().includes('STALE SECRET'));assert.equal(h.mount.children.length,0);assert.equal(h.downloads.length,0);
});
test('handoff aborts if the story changes while rendering and a second click cannot duplicate the pending download',async()=>{
  const rendering=deferred(),h=harness({renderHtml:()=>rendering.promise});await settle();const button=h.button('Download review package'),pending=button.click();await settle();assert.equal(button.disabled,true);
  await h.api.refresh();assert.equal(button.disabled,true);await button.click();h.setSnapshot({source:'{"title":"Changed"}'});rendering.resolve('<html>old</html>');await pending;
  assert.equal(h.downloads.length,0);assert.match(h.text(),/story changed while preparing/);h.api.destroy();
});
test('destroying the brief during HTML generation prevents stale downloads',async()=>{
  const rendering=deferred(),h=harness({renderHtml:()=>rendering.promise});await settle();const pending=h.button('Download review package').click();await settle();h.api.destroy();rendering.resolve('<html>old</html>');await pending;assert.equal(h.downloads.length,0);
});
test('ledger tables are readable inert cells, including escaped pipes, and scripts never become elements',async()=>{
  const h=harness({readLedger:async()=>({text:'## Decisions I made\n| decision | reason |\n|---|---|\n| Keep A \\| B | <img src=x onerror=alert(1)><br>Needs review |\n'})});await settle();
  assert.equal(h.all.filter(node=>node.tagName==='TABLE').length,1);
  assert.ok(h.all.some(node=>node.tagName==='TD' && node.textContent==='Keep A | B'));
  assert.ok(h.all.some(node=>node.tagName==='TD' && node.textContent.includes('<img src=x')));
  assert.equal(h.all.filter(node=>node.tagName==='IMG').length,0);h.api.destroy();
});
test('engineering evidence callback receives the original snapshot and conflict linked to a stable story moment',async()=>{
  const writes=[],h=harness({addEvidence:async(evidence,snapshot)=>{writes.push({evidence,snapshot});const changed=JSON.parse(snapshot.source);changed.storyBrief={evidence:[evidence]};h.setSnapshot({source:JSON.stringify(changed)});return {ok:true};}});await settle();
  const field=name=>h.all.find(node=>node.name===name);field('storyTarget').value=JSON.stringify({kind:'step',sectionId:'journey',id:'confirm'});
  field('reference').value=' src/booking.ts at reviewed commit ';field('note').value=' Implementation can double book; customer outcome needs a decision. ';field('relationship').value='conflicts';
  await h.all.find(node=>node.tagName==='FORM').fire('submit');
  assert.equal(writes.length,1);assert.equal(writes[0].snapshot.source,text);assert.equal(writes[0].evidence.relationship,'conflicts');
  assert.equal(writes[0].evidence.storyTarget.id,'confirm');assert.equal(writes[0].evidence.reference,'src/booking.ts at reviewed commit');assert.equal(field('note').value,'');assert.match(h.text(),/Evidence attached/);assert.match(h.text(),/Conflict — needs a decision/);h.api.destroy();
});
test('rejected evidence preserves the author input for repair and retry',async()=>{
  const h=harness({addEvidence:async()=>({ok:false,error:'The story changed. Review your target and retry.'})});await settle();
  const field=name=>h.all.find(node=>node.name===name);field('storyTarget').value='{"kind":"story"}';field('reference').value='design.md';field('note').value='Unresolved decision';field('relationship').value='unverified';
  await h.all.find(node=>node.tagName==='FORM').fire('submit');assert.equal(field('note').value,'Unresolved decision');assert.match(h.text(),/Review your target and retry/);h.api.destroy();
});

test('a pending evidence result or error cannot clear input or report success in another project',async()=>{
  for(const outcome of ['success','error']){
    const request=deferred(),h=harness({addEvidence:()=>request.promise});await settle();
    const field=name=>h.all.find(node=>node.name===name);field('storyTarget').value='{"kind":"story"}';field('reference').value='design.md';field('note').value='Unresolved decision';field('relationship').value='unverified';
    const pending=h.all.find(node=>node.tagName==='FORM').fire('submit');h.setSnapshot({project:2,source:'{"title":"Another story"}'});await h.api.refresh();
    if(outcome==='success')request.resolve({ok:true});else request.reject(Error('OLD PROJECT ERROR'));
    await pending;assert.equal(field('note').value,'Unresolved decision');assert.ok(!h.text().includes('Evidence attached'));assert.ok(!h.text().includes('OLD PROJECT ERROR'));h.api.destroy();
  }
});

test('evidence targets cover block pages, tabs and bare diagrams; duplicate identities are omitted',()=>{
 const section=spec.page.sections[0];
 for(const input of [{page:{blocks:[section]}},{blocks:[{tabs:[{sections:[section]}]}]}])assert.equal(plain(C.storyBriefTargets(input)).some(t=>t.value.id==='customer'),true);
 assert.deepEqual(plain(C.storyBriefTargets({nodes:{a:{title:'A'}},rows:[['a']],steps:[{id:'one',text:'First'}]})).map(t=>t.value),[{kind:'story'},{kind:'section',sectionId:'$root'},{kind:'node',sectionId:'$root',id:'a'},{kind:'step',sectionId:'$root',id:'one'}]);
 assert.equal(C.storyBriefTargets({page:{sections:[section,section]}}).length,1);
});
