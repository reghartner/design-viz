'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const B={URL};vm.createContext(B);
for(const name of ['compatibility','canon','validator','engine'])vm.runInContext(readSource(name+'.js'),B);
function fixture(handoff){return {sections:[{diagram:{nodes:{event:{title:'Event'},push:{title:'Push notification',handoff}},rows:[['event','push']],edges:[{from:'event',to:'push'}],steps:[{edge:'event->push',text:'Publish'}]}}]};}
test('external handoff references validate without resolving local sections or mutating source',()=>{
 for(const reference of [{spec:'push',siteBaseUrl:'https://docs.example/view.html'},{spec:'push'},{spec:'push',revision:'abc',section:'external-only',claudeUrl:'https://claude.ai/artifact/push'}]){
  const raw=fixture(reference),before=JSON.stringify(raw);
  assert.deepEqual(Array.from(B.validate(raw).errors),[]);assert.equal(JSON.stringify(raw),before);
  assert.ok(B.FlowviewCompatibility.detect(raw).includes('flow.handoff'));
 }
 assert.ok(!B.FlowviewCompatibility.detect(fixture(undefined)).includes('flow.handoff'));
});
test('handoffs reject malformed, unsafe and ambiguous destinations',()=>{
 for(const value of [[],true,'url',{}, {spec:''},{spec:3},{url:'javascript:alert(1)'},{url:'//evil.example/'},{url:'https://user:secret@docs.example/'},{url:'../push.html'},{url:'data:text/html,test'},{url:'https://ok.example',revision:'abc'},{spec:'push',section:4}]){
  assert.ok(B.validate(fixture(value)).errors.length,JSON.stringify(value));
 }
 const raw=fixture({spec:'push'});raw.sections[0].diagram.nodes.push.detail={url:'https://docs.example/',mode:'link'};
 assert.match(B.validate(raw).errors.join('\n'),/both a handoff and a domain detail/);
});
test('detail routing remains synchronous, isolated and preserves its URL fallback',()=>{
 const target={spec:'push',revision:'abc',section:'overview',url:'https://fallback.example/#d=overview'},before=JSON.stringify(target);
 assert.equal(B.diagramHandoffURL(target,r=>{r.spec='changed';return 'https://backstage.example/diagrams/push';}),'https://backstage.example/diagrams/push');
 assert.equal(JSON.stringify(target),before);
 for(const resolver of [undefined,()=>null,()=>undefined,()=>{throw Error('unavailable');},()=>Promise.resolve('https://ok.example'),()=>'/relative',()=>'javascript:alert(1)',()=>'https://user:secret@host.example']){
  assert.equal(B.diagramHandoffURL(target,resolver),target.url);
  assert.equal(B.diagramHandoffURL({spec:'push'},resolver),resolver?null:B.documentSiteURL(B.FLOWVIEW_SITE_BASE_URL,{spec:'push'}));
 }
 let calls=0;assert.equal(B.diagramHandoffURL({url:target.url},()=>{calls++;return null;}),target.url);assert.equal(calls,0);
});
test('handoff art uses bounded arrow geometry and safe links while preserving builder selection',()=>{
 const node={title:'Push <script>',handoff:{spec:'push',claudeUrl:'https://claude.ai/artifact/push'}},p={w:170,h:54};
 const html=B.handoffNodeContent(node,p,'push','test',{handoffHost:'claude'});
 assert.match(html,/L170 27/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.match(html,/Push &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/OPEN DIAGRAM/);assert.match(html,/<a[^>]*>[\s\S]*class="card handoff-card"/);
 const editing=B.handoffNodeContent(node,p,'push','test',{authoring:true,handoffHost:'claude'});assert.match(editing,/class="card handoff-card"[\s\S]*<a/);
 const missing=B.handoffNodeContent({title:'Push',handoff:{spec:'push'}},p,'push','test',{resolveDiagramLink:()=>null});assert.doesNotMatch(missing,/<a/);assert.match(missing,/DESTINATION UNAVAILABLE/);
});

test('local handoffs resolve across tabs, are distinct from external selectors and reject missing or hidden targets',()=>{
 const raw=require('../examples/tab-handoffs/tab-handoffs.spec.json'),page=B.normalize(raw);
 const handoff=page.blocks[0].tabs[0].sections[0].diagram.nodes.continue.handoff;
 assert.deepEqual(Array.from(B.validate(page).errors),[]);
 assert.equal(B.localHandoffTarget(page,handoff).tab,1);
 assert.ok(B.FlowviewCompatibility.detect(raw).includes('flow.local-handoff'));
 for(const value of [{localSection:'missing'},{localSection:''},{localSection:2},{localSection:'delivery',url:'https://example.com'}, {localSection:'delivery',spec:'other'}]){
  const copy=structuredClone(page);copy.blocks[0].tabs[0].sections[0].diagram.nodes.continue.handoff=value;
  assert.ok(B.validate(copy).errors.length,JSON.stringify(value));
 }
 const hidden=structuredClone(page);hidden.blocks[0].tabs[1].sections[0].detailOnly=true;
 assert.match(B.validate(hidden).errors.join('\n'),/not detail-only/);
 const node={title:'Delivery',handoff},p={w:170,h:54};
 const html=B.handoffNodeContent(node,p,'continue','test',{localHandoffTarget:v=>B.localHandoffTarget(page,v)});
 assert.match(html,/role="button" tabindex="0" data-dv-handoff="delivery"/);
 assert.doesNotMatch(html,/href=|target="_blank"/);assert.match(html,/CONTINUE/);
});

test('self handoffs are rejected while detail-to-overview handoffs remain valid',()=>{
 const page=B.normalize(structuredClone(require('../examples/tab-handoffs/tab-handoffs.spec.json')));
 page.blocks[0].tabs[0].sections[0].diagram.nodes.continue.handoff={localSection:'orders'};
 assert.match(B.validate(page).errors.join('\n'),/choose a different diagram section/);
 page.blocks[0].tabs[0].sections[0].diagram.nodes.continue.handoff={localSection:'delivery'};
 page.blocks.push({id:'child',heading:'Child',detailOnly:true,diagram:{nodes:{back:{handoff:{localSection:'orders'}}},rows:[['back']]}});
 assert.deepEqual(Array.from(B.validate(page).errors),[]);
});

test('runtime handoff policy chooses only the current host and exposes alternatives deliberately',()=>{
 const claude='https://claude.ai/artifact/target?share=1#artifact',site='https://internal.test/team/?diagram=target';
 const ref={spec:'target',section:'delivery',step:'sent',claudeUrl:claude,url:'https://other.test/target'};
 const options={resolveDiagramLink:()=>site};
 assert.equal(B.diagramHandoffAction(ref,{...options,handoffHost:'claude'}).url,claude);
 assert.equal(B.diagramHandoffAction(ref,{...options,handoffHost:'site'}).url,site);
 const internal=B.diagramHandoffAction(ref,{...options,handoffHost:'backstage',onDiagramHandoff:()=>{}});
 assert.equal(internal.kind,'internal');assert.equal(internal.reference.spec,'target');
 for(const host of ['site','backstage','unknown']){
  const action=B.diagramHandoffAction(ref,{handoffHost:host,resolveDiagramLink:()=>null});
  assert.equal(action.kind,'choose',host);assert.ok(action.destinations.some(d=>d.url===claude));assert.equal(action.url,undefined);
 }
 assert.equal(B.diagramHandoffAction({spec:'target',url:claude},{handoffHost:'claude',resolveDiagramLink:()=>null}).kind,'unavailable');
 assert.equal(B.diagramHandoffAction({spec:'target',url:claude},{handoffHost:'site',resolveDiagramLink:()=>claude}).kind,'choose');
 assert.equal(B.diagramHandoffAction({spec:'target',claudeUrl:claude},{}).kind,'choose');
 assert.equal(B.diagramHandoffAction({url:'https://ordinary.test/target'},{}).kind,'unavailable');
 // The separate detail URL policy is intentionally unchanged.
 assert.equal(B.diagramHandoffURL(ref,()=>null),ref.url);
 assert.equal(B.diagramHandoffURL(ref,()=>site),site);
});
test('handoff runtime context is explicit, per-viewer and uses positive host evidence only',()=>{
 const bridge={claude:{use(){}},location:{origin:'https://internal.test'}};
 assert.equal(B.diagramHandoffHost('site',bridge),'site');
 assert.equal(B.diagramHandoffHost(undefined,bridge),'claude');
 assert.equal(B.diagramHandoffHost(undefined,{location:{origin:'https://internal.test'},document:{referrer:'https://claude.ai/'}},'https://internal.test/team/'),'site');
 assert.equal(B.diagramHandoffHost(undefined,{location:{origin:'https://elsewhere.test'}},'https://internal.test/'),'unknown');
 assert.equal(B.diagramHandoffHost('unknown',bridge),'unknown');
 assert.equal(B.diagramHandoffHost(undefined,{}),'unknown');
 assert.equal(B.diagramHandoffHost(undefined,{location:{origin:'https://claude.ai'}}),'claude');
 assert.equal(B.diagramHandoffHost(undefined,{self:{},top:{},document:{referrer:'https://claude.ai/code/artifact/abc'}}),'claude');
 assert.equal(B.diagramHandoffHost(undefined,{self:{},top:{},location:{ancestorOrigins:['https://claude.site']}}),'claude');
 assert.equal(B.diagramHandoffHost(undefined,{self:{},top:{},document:{referrer:'https://claude.ai.evil.test/'}}),'unknown');
 const blocked={};Object.defineProperty(blocked,'claude',{get(){throw Error('denied');}});Object.defineProperty(blocked,'location',{get(){throw Error('denied');}});Object.defineProperty(blocked,'top',{get(){throw Error('denied');}});
 assert.equal(B.diagramHandoffHost(undefined,blocked),'unknown');
 const html=B.handoffNodeContent({title:'Target',handoff:{spec:'target',claudeUrl:'https://claude.ai/artifact/target'}},{w:170,h:54},'next','test',{handoffHost:'backstage',onDiagramHandoff(){}});
 assert.match(html,/data-dv-external-handoff=/);assert.doesNotMatch(html,/href=|target="_blank"/);
});

test('removed handoff URLs are rejected even alongside IDs and never reach runtime destinations',()=>{
 const url='https://claude.ai/artifact/old';
 for(const ref of [{url},{spec:'target',url},{localSection:'delivery',url:null}])assert.match(B.validate(fixture(ref)).errors.join('\n'),/url: removed/);
 for(const host of ['site','claude','backstage','unknown']){
  assert.equal(B.diagramHandoffAction({url},{handoffHost:host}).kind,'unavailable');
  const result=B.diagramHandoffAction({spec:'target',url},{handoffHost:host,resolveDiagramLink:()=>null});
  assert.equal(result.kind,'unavailable');assert.deepEqual(Array.from(result.destinations),[]);
 }
 const result=B.diagramHandoffAction({spec:'target',url},{handoffHost:'backstage',onDiagramHandoff(){}});assert.equal(result.reference.url,undefined);
});

test('generated example routes every document identity and preserves the configured deployment subpath',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-handoff-example-'));
 try{
  execFileSync('python3',['examples/diagram-handoffs/build.py','--base-url','https://example.test/team/','--out',out],{cwd:path.join(__dirname,'..'),stdio:'pipe'});
  const router=fs.readFileSync(path.join(out,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  for(const name of ['overview','push','lake','action']){
   const html=fs.readFileSync(path.join(out,name+'.html'),'utf8'),raw=JSON.parse(html.match(/<script[^>]+id="flowspec"[^>]*>([\s\S]*?)<\/script>/)[1]),links=raw.page.documentLinks;
   assert.equal(links.siteBaseUrl,'https://example.test/team/index.html');
   let destination;vm.runInNewContext(router,{URLSearchParams,location:{search:'?diagram='+links.id,hash:'#d=entry',replace:value=>destination=value}});
   assert.equal(destination,name+'.html#d=entry');
  }
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
