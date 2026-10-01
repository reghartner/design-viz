'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const B={URL};vm.createContext(B);
for(const name of ['compatibility','canon','validator','engine'])vm.runInContext(readSource(name+'.js'),B);
function fixture(handoff){return {sections:[{diagram:{nodes:{event:{title:'Event'},push:{title:'Push notification',handoff}},rows:[['event','push']],edges:[{from:'event',to:'push'}],steps:[{edge:'event->push',text:'Publish'}]}}]};}
test('external handoff references validate without resolving local sections or mutating source',()=>{
 for(const reference of [{url:'https://docs.example/push#d=overview'},{spec:'push'},{spec:'push',revision:'abc',section:'external-only',url:'https://docs.example/push'}]){
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
test('host routing is synchronous, isolated and safely falls back without loading a spec',()=>{
 const target={spec:'push',revision:'abc',section:'overview',url:'https://fallback.example/#d=overview'},before=JSON.stringify(target);
 assert.equal(B.diagramHandoffURL(target,r=>{r.spec='changed';return 'https://backstage.example/diagrams/push';}),'https://backstage.example/diagrams/push');
 assert.equal(JSON.stringify(target),before);
 for(const resolver of [undefined,()=>null,()=>undefined,()=>{throw Error('unavailable');},()=>Promise.resolve('https://ok.example'),()=>'/relative',()=>'javascript:alert(1)',()=>'https://user:secret@host.example']){
  assert.equal(B.diagramHandoffURL(target,resolver),target.url);
  assert.equal(B.diagramHandoffURL({spec:'push'},resolver),null);
 }
 let calls=0;assert.equal(B.diagramHandoffURL({url:target.url},()=>{calls++;return null;}),target.url);assert.equal(calls,0);
});
test('handoff art uses bounded arrow geometry and safe links while preserving builder selection',()=>{
 const node={title:'Push <script>',handoff:{url:'https://docs.example/push'}},p={w:170,h:54};
 const html=B.handoffNodeContent(node,p,'push','test',{});
 assert.match(html,/L170 27/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.match(html,/Push &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/OPEN DIAGRAM/);assert.match(html,/<a[^>]*>[\s\S]*class="card handoff-card"/);
 const editing=B.handoffNodeContent(node,p,'push','test',{authoring:true});assert.match(editing,/class="card handoff-card"[\s\S]*<a/);
 const missing=B.handoffNodeContent({title:'Push',handoff:{spec:'push'}},p,'push','test',{});assert.doesNotMatch(missing,/<a/);assert.match(missing,/DESTINATION UNAVAILABLE/);
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
