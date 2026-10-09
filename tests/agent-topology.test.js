'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {composeSources,readSource}=require('../tools/source-loader.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const diagram=spec=>spec.page.sections[0].diagram;
function provider(id){return {page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{diagram:{nodes:{api:{title:id+' API'}},rows:[['api']],topologyExports:{public:{nodes:['api'],edges:[]}}}}]}};}
async function harness(origin='https://test.invalid/flowspec.html'){
  const {digest}=await import('../tools/canon/drift.mjs'),leaf=provider('leaf'),nested=provider('nested');
  diagram(nested).topologyImports=[{spec:'leaf',export:'public',as:'inner'}];diagram(nested).topologyExports.public.nodes.push('inner::api');
  const providers=[leaf,nested],catalog={version:3,diagrams:providers.map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:1,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  const disk=new Map(),hits=[],updates=[];let gate=null,text=JSON.stringify({page:{title:'Draft',sections:[{diagram:{nodes:{local:{title:'Local'}},rows:[['local']]}}]}}),ledger='Before',saved,number=0,applies=0;
  const c={TextEncoder,URL,Response,SyntaxError,location:new URL(origin),window:{crypto:webcrypto},fetch:async url=>{
    const name=new URL(url).pathname.slice(1);hits.push(name);if(gate)await gate(name);
    return new Response(JSON.stringify(name==='diagrams.json'?catalog:providers.find(spec=>name===spec.page.canon.id+'.json')));
  }};
  vm.createContext(c);vm.runInContext(composeSources(['canon.js','validator.js','viewer/workspace-handoff.js','library.workbench.js','workbench/session.js','workbench/agent-merge.js','workbench/agent-session.js','workbench/folder-agent.js']),c);
  const session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},persistence:{read:()=>({}),preserve(){},cancel(){},save:(source,baseline,artifacts)=>saved=copy(artifacts || {})},render(){session.resolve(JSON.parse(text));}});
  session.replaceProject(text);
  const files={read:async name=>disk.has(name)?copy(disk.get(name)):null,readText:async name=>disk.has(name)?String(disk.get(name)):null,write:async(name,value)=>disk.set(name,copy(value))};
  const client=c.createFolderAgentClient({files,uuid:()=>`id-${++number}`,now:()=>100000,requireLedger:true,
    snapshot(){const snap=session.snapshot();return {source:snap.text,ledger,project:snap.project,topologyRevision:snap.topologyRevision,open:true};},busy:()=>false,
    prepare:source=>c.prepareTopologyProposal(JSON.parse(source),session.topologyContext()),
    validate:(source,context)=>session.validate(JSON.parse(source),context).errors.join('\n'),
    apply(source,expected,proposal,context){const ok=session.accept({text:source},{snapshot:session.snapshot(),topologyContext:context});if(ok){ledger=proposal.ledger;applies++;}return {ok};},changed:state=>updates.push(state)});
  await client.start();await client.send('Import nested provider');
  const original=text,raw=JSON.parse(text);diagram(raw).topologyImports=[{spec:'nested',export:'public',as:'shared'}];
  const proposal={...client.manifest(),id:'proposal',requestId:disk.get('request.json').id,baseRevision:disk.get('state.json').revision,source:JSON.stringify(raw),ledger:'After'};disk.set('proposal.json',proposal);
  return {c,client,session,disk,hits,providers,catalog,proposal,original,updates,get saved(){return saved;},get applies(){return applies;},gate:fn=>gate=fn,
    connect:async()=>session.connectTopology(await c.connectTopologyRepository(JSON.parse(session.text())),session.snapshot())};
}
test('the same blocked folder proposal becomes reviewable after catalog-only Connect and stages transitive providers until Commit',async()=>{
  const h=await harness();
  // An untrusted proposal context must not grant network access.
  h.proposal.topologyContext={catalogURL:'https://evil.invalid/diagrams.json'};
  await h.client.poll();assert.equal(h.client.reviewSnapshot().review.ok,false);
  assert.match(h.client.reviewSnapshot().review.conflicts[0].reason,/Connect repository catalog/);assert.deepEqual(h.hits,[]);
  await h.connect();assert.equal(h.session.canUndo(),false);assert.equal(h.session.text(),h.original);
  const connected=JSON.stringify(h.session.topologyContext());assert.equal(h.saved.topologyContext.specs.length,1);
  await h.client.poll();const review=h.client.reviewSnapshot();assert.equal(review.review.ok,true);
  assert.deepEqual(h.hits,['diagrams.json','nested.json','leaf.json']);
  assert.equal(JSON.stringify(h.session.topologyContext()),connected,'review acquisition must not publish context');
  assert.ok(diagram(h.session.resolve(JSON.parse(review.source),review.topologyContext)).nodes['shared::inner::api']);
  assert.equal(h.session.text(),h.original);assert.equal(h.applies,0);
  await h.client.acceptReview(review.review.version);assert.equal(h.applies,1);assert.equal(h.disk.get('result.json').status,'applied');
  assert.equal(h.session.text(),h.proposal.source);assert.equal(h.session.topologyContext().specs.length,3);
  assert.equal(diagram(JSON.parse(h.session.text())).nodes['shared::api'],undefined);
  assert.equal(h.session.undo(),true);assert.equal(h.session.text(),h.original);assert.equal(h.session.redo(),true);
  assert.ok(diagram(h.session.resolve(JSON.parse(h.session.text()))).nodes['shared::inner::api']);
});
for(const failure of ['revision','missing provider','foreign catalog'])test('proposal preparation refuses '+failure+' without source, history or frozen context changes',async()=>{
  const h=await harness();await h.connect();
  if(failure==='revision')diagram(h.providers[0]).nodes.api.title='Later deployment';
  if(failure==='missing provider'){const raw=JSON.parse(h.proposal.source);diagram(raw).topologyImports[0].spec='missing';h.proposal.source=JSON.stringify(raw);}
  if(failure==='foreign catalog'){
    const context=h.session.topologyContext();context.catalogURL='https://evil.invalid/diagrams.json';h.session.replaceProject(h.original,null,{topologyContext:context});
    // Keep this request scoped to its original project; test direct preparation
    // for the invalid catalog instead of relaxing the project guard.
    await assert.rejects(h.c.prepareTopologyProposal(JSON.parse(h.proposal.source),context),/origin/);assert.deepEqual(h.hits,['diagrams.json']);return;
  }
  const before=JSON.stringify(h.session.topologyContext());await h.client.poll();const review=h.client.reviewSnapshot();
  assert.equal(review.review.ok,false);assert.match(review.review.conflicts[0].reason,failure==='revision'?/revision mismatch/:/Missing authored provider/);
  assert.equal(h.session.text(),h.original);assert.equal(h.session.canUndo(),false);assert.equal(JSON.stringify(h.session.topologyContext()),before);
  assert.equal(await h.client.acceptReview(review.review.version),false);assert.equal(h.applies,0);
});
for(const change of ['stop','disconnect','destroy','project','source','owner','proposal','catalog'])test('held provider load cannot publish or apply after '+change+' changes',async()=>{
  const h=await harness();await h.connect();const context=JSON.stringify(h.session.topologyContext());
  let release,reached;const hit=new Promise(resolve=>reached=resolve);h.gate(name=>name==='nested.json'?new Promise(resolve=>{release=resolve;reached();}):null);
  const polling=h.client.poll();await hit;let pending;
  if(change==='stop')pending=h.client.cancel();
  if(change==='disconnect')pending=h.client.disconnect();
  if(change==='destroy')h.client.destroy();
  if(change==='project')h.session.replaceProject(h.original);
  if(change==='source')h.session.importText(h.original.replace('Draft','Human draft'));
  if(change==='owner')h.disk.set('session.json',{...h.client.manifest(),connectionId:'other-owner'});
  if(change==='proposal')h.disk.set('proposal.json',{...h.proposal,source:h.original});
  if(change==='catalog')h.session.connectTopology(h.session.topologyContext(),h.session.snapshot());
  h.gate(null);release();await polling;if(pending)await pending;
  assert.equal(h.client.reviewSnapshot(),null);assert.equal(h.applies,0);assert.equal(h.disk.has('result.json'),false);
  assert.equal(h.session.text(),change==='source'?h.original.replace('Draft','Human draft'):h.original);
  assert.equal(JSON.stringify(h.session.topologyContext()),change==='project'?'null':context);
});
test('real merge conflicts are refused before any provider fetch',async()=>{
  const h=await harness();await h.connect();h.session.importText(h.original.replace('Draft','Human title'));
  h.proposal.source=h.proposal.source.replace('Draft','Agent title');await h.client.poll();
  assert.equal(h.client.reviewSnapshot().review.ok,false);assert.ok(h.client.reviewSnapshot().review.conflicts.some(item=>item.path.includes('title')));
  assert.deepEqual(h.hits,['diagrams.json']);assert.equal(h.applies,0);
});
test('context changes after preview require a fresh explicit approval, while an approved provider remains frozen at Commit',async()=>{
  const h=await harness();await h.connect();await h.client.poll();const originalReview=h.client.reviewSnapshot();
  h.session.connectTopology(h.session.topologyContext(),h.session.snapshot());
  assert.equal(await h.client.acceptReview(originalReview.review.version),false);assert.equal(h.applies,0);
  const refreshed=h.client.reviewSnapshot();assert.ok(refreshed.review.version>originalReview.review.version);assert.equal(refreshed.review.ok,true);
  const hits=h.hits.slice();diagram(h.providers[0]).nodes.api.title='Later remote deployment';
  await h.client.acceptReview(refreshed.review.version);assert.equal(h.applies,1);assert.deepEqual(h.hits,hits);
  assert.equal(diagram(h.session.resolve(JSON.parse(h.session.text()))).nodes['shared::inner::api'].title,'leaf API');
});

async function localHarness({connect=true,providerGate}={}){
  const h=await harness('http://127.0.0.1/flowspec.html');h.client.destroy();if(connect)await h.connect();
  if(providerGate)h.gate(providerGate);
  class Element extends EventTarget{constructor(){super();this.children=[];this.style={};this.textContent='';}appendChild(child){this.children.push(child);}remove(){}setAttribute(){}click(){this.dispatchEvent(new Event('click'));}}
  const host=new Element(),company=new Element(),config=new Element(),timers=new Map();let clock=0,applied=0,open=true,busy=false,receipt,arrived;
  const ready=new Promise(resolve=>arrived=resolve),sent=[];
  config.textContent=JSON.stringify({protocolVersion:1,token:'a'.repeat(64),scratch:'/test'});
  h.c.document={getElementById:id=>id==='flowview-local-agent'?config:company,querySelector:()=>host,createElement:()=>new Element()};
  h.c.window=Object.assign(new EventTarget(),{crypto:webcrypto});h.c.crypto=webcrypto;h.c.AbortController=AbortController;
  h.c.setTimeout=(fn,ms)=>{const id=++clock;timers.set(id,{fn,ms});return id;};h.c.clearTimeout=id=>timers.delete(id);
  vm.runInContext(readSource('workbench/lifetime.js'),h.c);
  const fetchProvider=h.c.fetch;h.c.fetch=async(url,opts)=>{
    if(url!=='/__flowview_agent/sync')return fetchProvider(url,opts);
    const request=JSON.parse(opts.body);sent.push(request);
    return new Response(JSON.stringify(request.disconnect?{}:{proposal:{...h.proposal,baseRevision:request.snapshot.revision,topologyContext:{catalogURL:'https://untrusted.invalid/catalog.json'}}}));
  };
  // Observe the returned promise at the public exchange seam; initialization,
  // polling, lifetime, provider loading, validation and acceptance remain real.
  const create=h.c.createWorkbenchAgentExchange;
  h.c.createWorkbenchAgentExchange=opts=>{const exchange=create(opts),receive=exchange.receive;exchange.receive=(...args)=>{receipt=Promise.resolve(receive(...args));arrived();return receipt;};return exchange;};
  const local=h.c.initWorkbenchAgentSession({document:h.c.document,
    snapshot(){const snap=h.session.snapshot();return {source:snap.text,project:snap.project,topologyRevision:snap.topologyRevision,open};},busy:()=>busy,
    prepare:source=>h.c.prepareTopologyProposal(JSON.parse(source),h.session.topologyContext()),
    validate:(source,context)=>h.session.validate(JSON.parse(source),context).errors.join('\n'),
    apply(source,expected,proposal,context){assert.equal(h.session.validate(JSON.parse(source),context).errors.length,0);const ok=h.session.accept({text:source},{snapshot:h.session.snapshot(),topologyContext:context});if(ok)applied++;return {ok};}});
  await ready;
  return {...h,local,sent,host,get applied(){return applied;},done:()=>receipt,setOpen:value=>open=value,setBusy:value=>busy=value};
}
test('folder preparation pins the current catalog and all direct/transitive imports without touching the draft',async()=>{
  const h=await harness(),raw=JSON.parse(h.proposal.source);diagram(raw).topologyImports.push({spec:'leaf',export:'public',as:'extra'});
  raw.topologyContext={catalogURL:'https://untrusted.invalid/catalog.json',specs:[provider('forged')]};
  const before=JSON.stringify(raw),context=await h.c.prepareAuthoredTopology(raw,null);
  assert.equal(context.ephemeral,true);assert.deepEqual(h.hits,['diagrams.json','nested.json','leaf.json']);
  assert.ok(diagram(h.session.resolve(raw,context)).nodes['shared::inner::api']);assert.ok(diagram(h.session.resolve(raw,context)).nodes['extra::api']);
  assert.equal(JSON.stringify(raw),before);assert.equal(raw.page.canon,undefined);assert.equal(h.session.text(),h.original);assert.equal(h.session.topologyContext(),null);
});
for(const catalog of [true,false])test('folder preparation keeps complete frozen '+(catalog?'catalog':'backend')+' context and rebinds a different consumer privately',async()=>{
  const h=await harness(),current=JSON.parse(h.original);current.page.canon={version:1,id:'consumer',kind:'design',owner:'group:default/test'};
  const context={version:1,id:'consumer',specs:copy([...h.providers,current]),...(catalog?{catalog:h.catalog,catalogURL:'https://test.invalid/diagrams.json'}:{})};
  const raw=JSON.parse(h.proposal.source);raw.page.canon=copy(current.page.canon);const before=JSON.stringify(context);
  h.providers[0].page.title='Later deployment';
  assert.equal(await h.c.prepareAuthoredTopology(raw,context),context);assert.deepEqual(h.hits,[]);
  raw.page.canon.id='different';const next=await h.c.prepareAuthoredTopology(raw,context);
  assert.equal(next.ephemeral,true);assert.notEqual(next.id,context.id);assert.notEqual(next.id,raw.page.canon.id);
  assert.equal(JSON.stringify(context),before);assert.deepEqual(h.hits,[]);
  assert.ok(diagram(h.session.resolve(raw,next)).nodes['shared::inner::api']);
  assert.equal(next.specs.find(spec=>spec.page.canon.id==='leaf').page.title,'leaf');
});
test('import-free folder preparation needs no repository and does not retain an unrelated consumer identity',async()=>{
  const h=await harness();assert.equal(await h.c.prepareAuthoredTopology(JSON.parse(h.original),null),null);assert.deepEqual(h.hits,[]);
  const context={version:1,id:'leaf',specs:copy(h.providers)};
  assert.equal(await h.c.prepareAuthoredTopology(JSON.parse(h.original),context),null);
  assert.equal(await h.c.prepareAuthoredTopology(copy(h.providers[0]),context),context);assert.deepEqual(h.hits,[]);
});
for(const compatible of [true,false])test('an incomplete backend context pins missing-provider metadata and '+(compatible?'retains frozen sources':'refuses incompatible frozen sources'),async()=>{
  const h=await harness(),current=JSON.parse(h.original);current.page.canon={version:1,id:'consumer',kind:'design',owner:'group:default/test'};
  const context={version:1,id:'consumer',specs:copy([h.providers[0],current])},before=JSON.stringify(context);
  diagram(h.providers[0]).nodes.api.title='Later remote provider';
  if(!compatible){diagram(h.providers[0]).topologyExports.next=copy(diagram(h.providers[0]).topologyExports.public);diagram(h.providers[1]).topologyImports[0].export='next';}
  const {digest}=await import('../tools/canon/drift.mjs');for(const entry of h.catalog.diagrams)entry.revision=digest(h.providers.find(spec=>spec.page.canon.id===entry.id));
  assert.notEqual(h.catalog.diagrams[0].revision,digest(context.specs[0]));
  const preparing=h.c.prepareAuthoredTopology(JSON.parse(h.proposal.source),context);
  if(compatible){const next=await preparing;assert.equal(next.catalog.version,3);assert.equal(diagram(h.session.resolve(JSON.parse(h.proposal.source),next)).nodes['shared::inner::api'].title,'leaf API');}
  else await assert.rejects(preparing,/export/i);
  assert.deepEqual(h.hits,['diagrams.json','nested.json']);assert.equal(JSON.stringify(context),before);assert.equal(h.session.text(),h.original);assert.equal(h.session.topologyContext(),null);
});
for(const failure of ['catalog','provider revision','provider URL'])test('folder preparation refuses '+failure+' without replacing the draft or context',async()=>{
  const h=await harness();
  if(failure==='catalog')h.catalog.version=2;
  if(failure==='provider revision')h.providers[0].page.title='Changed after catalog pin';
  if(failure==='provider URL')h.catalog.diagrams[0].specUrl='https://untrusted.invalid/source.json';
  await assert.rejects(h.c.prepareAuthoredTopology(JSON.parse(h.proposal.source),null),failure==='catalog'?/version 3/:failure==='provider revision'?/revision mismatch/:/URL|relative|unsafe/i);
  assert.equal(h.session.text(),h.original);assert.equal(h.session.topologyContext(),null);assert.equal(h.session.canUndo(),false);
  assert.ok(h.hits.every(hit=>!hit.includes('untrusted')));
});
test('local transport initialization prepares and validates a pinned provider before automatic acceptance',async()=>{
  const h=await localHarness();await h.done();assert.equal(h.applied,1);
  assert.deepEqual(h.hits,['diagrams.json','nested.json','leaf.json']);assert.equal(h.session.text(),h.proposal.source);
  assert.equal(h.session.undo(),true);assert.equal(h.session.text(),h.original);assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);assert.equal(diagram(h.session.resolve(JSON.parse(h.session.text()))).nodes['shared::inner::api'].title,'leaf API');h.local.destroy();
});
test('local transport rejects a missing catalog without trusting proposal context or fetching providers',async()=>{
  const h=await localHarness({connect:false});assert.match(await h.done(),/Connect repository catalog/);assert.equal(h.applied,0);assert.deepEqual(h.hits,[]);h.local.destroy();
});
for(const change of ['disconnect','pagehide','destroy','source','project','context','closed','busy'])test('local transport retires prepared providers after '+change,async()=>{
  // Hold the preparation callback before any provider can finish. This also
  // ensures the test observes the actual init-to-exchange callback wiring.
  let release,reached;const hit=new Promise(resolve=>reached=resolve),gate=new Promise(resolve=>release=resolve);
  const h=await localHarness({providerGate:name=>name==='nested.json'?(reached(),gate):null});
  await hit;const before=JSON.stringify(h.session.topologyContext());
  if(change==='disconnect')h.host.children[0].click();
  if(change==='pagehide')h.c.window.dispatchEvent(new Event('pagehide'));
  if(change==='destroy')h.local.destroy();
  if(change==='source')h.session.importText(h.original.replace('Draft','Human draft'));
  if(change==='project')h.session.replaceProject(h.original);
  if(change==='context')h.session.connectTopology(h.session.topologyContext(),h.session.snapshot());
  if(change==='closed')h.setOpen(false);
  if(change==='busy')h.setBusy(true);
  release();await h.done();assert.equal(h.applied,0);
  assert.equal(h.session.text(),change==='source'?h.original.replace('Draft','Human draft'):h.original);
  assert.equal(JSON.stringify(h.session.topologyContext()),change==='project'?'null':before);h.local.destroy();
});
