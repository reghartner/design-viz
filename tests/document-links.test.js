'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const B={URL};vm.createContext(B);
for(const file of ['canon.js','validator.js','engine.js','workbench/io-model.js','workbench/source-edit.js','workbench/commands/common.js','workbench/commands/document.js'])vm.runInContext(readSource(file),B);
const plain=v=>JSON.parse(JSON.stringify(v));
const claude='https://claude.ai/public/artifacts/abc-123';
const doc=(id,diagram)=>({page:{documentLinks:{id,claudeUrl:claude,claudeArtifactId:'abc-123'},sections:[{id:'overview',diagram:diagram || {nodes:{a:{title:'A'}},rows:[['a']]}}]}});
test('site destinations retain subpaths and supported targets; Claude is the exact persistent URL',()=>{
 const ref={spec:'existing_diagram',section:'overview',view:'flow',path:'happy',step:'send',claudeUrl:claude};
 const destinations=plain(B.documentDestinations(ref,null,'https://intranet.example/diagrams/'));
 assert.equal(destinations[0].url,'https://intranet.example/diagrams/?diagram=existing_diagram#d=overview&v=flow&m=step&p=happy&s=send');
 assert.equal(destinations[1].url,claude);
 for(const url of ['https://claude.ai/artifacts/team-123','https://claude.site/artifacts/legacy-123','https://claude.ai/public/artifacts/abc-123?shared=true'])assert.equal(B.claudeArtifact(url).url,url);
 assert.equal(B.diagramHandoffURL(ref),claude);
 assert.equal(B.diagramHandoffURL({...ref,url:'https://legacy.example/'}),'https://legacy.example/');
 assert.equal(B.documentReference(doc('existing_diagram').page).spec,'existing_diagram');
 assert.equal(B.documentReference({canon:{id:'registered'},documentLinks:{id:'wrong'}}).spec,'registered');
});
test('unsafe bases, non-share artifact URLs and conflicting artifact IDs are rejected',()=>{
 for(const base of ['javascript:alert(1)','https://user:pw@site.example/','https://site.example/?q=1','https://site.example/#','https://site.example/\\evil',' https://site.example/','https://site.example/\n'])assert.equal(B.documentSiteBase(base),null,base);
 for(const url of ['https://evil.example/public/artifacts/abc','https://claude.ai/chat/abc','https://user@claude.ai/public/artifacts/abc'])assert.equal(B.claudeArtifact(url),null,url);
 const raw=doc('test');raw.page.documentLinks.claudeArtifactId='wrong';assert.match(B.validate(raw.page).errors.join('\n'),/must match/);
 raw.page.documentLinks.claudeArtifactId='abc-123';raw.page.canon={version:1,id:'different',kind:'design',owner:'group:default/test'};assert.match(B.validate(raw.page).errors.join('\n'),/repository diagram ID/);
});
test('document settings save identity without membership and reject conflicting metadata before edits',()=>{
 const raw=doc('test');delete raw.page.documentLinks;const source=JSON.stringify(raw,null,2);
 const plan=B.planDocumentSetting(source,raw,'documentLinks',{id:'test',claudeUrl:claude,claudeArtifactId:'abc-123'});
 assert.equal(plan.error,undefined);assert.equal(JSON.parse(plan.text).page.canon,undefined);
 assert.deepEqual(plain(B.validate(JSON.parse(plan.text).page).errors),[]);
 assert.match(B.planDocumentSetting(source,raw,'documentLinks',{id:'has spaces'}).error,/diagram ID/);
});
test('nested topology snapshots retain only inert origin links and strip all provider contexts',()=>{
 function registered(id,diagram){const raw=doc(id,diagram);raw.page.canon={version:1,id,kind:'canonical',owner:'group:default/test'};return raw;}
 const provider=registered('provider',{nodes:{a:{title:'Private provider node'}},rows:[['a']],topologyExports:{shared:{nodes:['a'],edges:[]}}});
 const middle=registered('middle',{topologyImports:[{spec:'provider',export:'shared',as:'p'}],topologyExports:{shared:{nodes:['p::a'],edges:[]}}});
 const consumer=registered('consumer',{topologyImports:[{spec:'middle',export:'shared',as:'m'}]});
 B.FLOWVIEW_SITE_BASE_URL='https://internal.example/subpath/';
 const resolved=B.FlowTopology.materialize([provider,middle,consumer])[2];
 resolved.page.sections[0].diagram.topologyProvenance.imports[0].destination.providerContext={specs:[{secret:'provider source'}]};
 const result=B.prepareExportSnapshot(JSON.stringify(consumer),()=>resolved);assert.equal(result.error,undefined);
 const snapshot=JSON.parse(result.text),diagram=snapshot.page.sections[0].diagram;
 assert.equal(snapshot.page.documentLinks.siteBaseUrl,B.FLOWVIEW_SITE_BASE_URL);
 assert.doesNotMatch(result.text,/topology(?:Imports|Exports|Provenance)|"specs"|"catalog"/);
 const refs=plain(B.sourceDiagramReferences(diagram,'m::p::a'));assert.deepEqual(refs.map(ref=>ref.spec),['middle','provider']);
 assert.ok(refs.every(ref=>ref.claudeUrl===claude && ref.section==='overview'));
 const links=plain(B.nodeReferenceLinks(diagram,'m::p::a'));assert.ok(links.some(link=>link.url.includes('?diagram=provider#d=overview')));
 assert.deepEqual(plain(B.validate(snapshot.page).errors),[]);B.FLOWVIEW_SITE_BASE_URL=null;
});

test('ordinary document identity survives temporary topology membership and local exports',()=>{
 const raw=doc('ordinary_id',{nodes:{a:{title:'A'}},rows:[['a']],topologyExports:{shared:{nodes:['a'],edges:[]}}});
 assert.equal(B.FlowTopology.resolveSource(raw).page.documentLinks.id,'ordinary_id');
 const provider=doc('provider',{nodes:{a:{title:'A'}},rows:[['a']],topologyExports:{shared:{nodes:['a'],edges:[]}}});provider.page.canon={version:1,id:'provider',kind:'canonical',owner:'group:default/test'};
 const consumer=doc('ordinary_id',{topologyImports:[{spec:'provider',export:'shared',as:'p'}]});
 const scaffold={page:{canon:{version:1,id:'draft',kind:'design',owner:'group:default/test'},sections:[{diagram:{nodes:{},rows:[[]]}}]}};
 const context={version:1,id:'draft',ephemeral:true,specs:[provider,scaffold]};
 const resolved=B.FlowTopology.resolveSource(consumer,context);assert.equal(resolved.page.canon,undefined);assert.equal(resolved.page.documentLinks.id,'ordinary_id');assert.deepEqual(plain(B.validate(resolved.page).errors),[]);
});


test('host rejection never downgrades a pin or overrides an explicit fallback with a configured site',()=>{
 B.FLOWVIEW_SITE_BASE_URL='https://internal.example/';
 const ref={spec:'missing',revision:'0'.repeat(64),url:'https://fallback.example/pinned',claudeUrl:claude};
 for(const resolver of [()=>null,()=>{throw Error('stale');}]){
  assert.equal(B.diagramHandoffURL(ref,resolver),ref.url);
  assert.equal(B.diagramHandoffURL({...ref,url:undefined},resolver),claude);
  assert.equal(B.diagramHandoffURL({spec:'missing',revision:ref.revision},resolver),null);
 }
 assert.equal(B.diagramHandoffURL(ref),ref.url);
 assert.equal(B.documentSiteURL(B.FLOWVIEW_SITE_BASE_URL,{spec:'test',revision:'opaque-pin'}),null);
 const pinned=new URL(B.documentSiteURL(B.FLOWVIEW_SITE_BASE_URL,{spec:'test',revision:ref.revision,section:'overview'}));
 assert.equal(JSON.parse(new URLSearchParams(pinned.hash.slice(1)).get('fv')).revision,ref.revision);
 B.FLOWVIEW_SITE_BASE_URL=null;
});
