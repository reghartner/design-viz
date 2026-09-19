const {readSource}=require('../tools/source-loader.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={URL,console};vm.createContext(ctx);
for(const file of ['canon','validator','engine'])vm.runInContext(readSource(file+'.js'),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
const ref={id:'worker.handle',repository:'https://github.example/team/service.git',revision:'a'.repeat(40),path:'src/handler.js',startLine:12,endLine:20,anchor:{start:'start',end:'end'}};
function diagram(){return {nodes:{api:{title:'API',link:'https://docs.example/design',binding:{entityRef:'component:default/api',label:'API',catalogUrl:'https://backstage.example/catalog/default/component/api',api:{operationId:'record',definitionUrl:'https://docs.example/openapi',endpoints:{production:'https://api.example/v1'}}},codeRefs:[ref]},client:{title:'Client'},unrelated:{title:'API'}},edges:[{from:'client',to:'api'}],steps:[]};}
test('node references include stored Backstage/API/endpoints and pinned Git links without fetching',()=>{
 const d=diagram(),before=JSON.stringify(d),links=plain(ctx.nodeReferenceLinks(d,'api'));
 assert.deepEqual(links.map(l=>l.label),['Source','Backstage · API','API definition · record','Endpoint · production','Code · worker.handle']);
 assert.equal(links[4].url,'https://github.example/team/service/blob/'+'a'.repeat(40)+'/src/handler.js#L12-L20');
 assert.ok(links.every(l=>l.group==='Node links'));assert.equal(JSON.stringify(d),before);
});
test('related code is scoped to exact node or declared edge references, including failed communications',()=>{
 const d=diagram();delete d.nodes.api.codeRefs;
 d.steps=[{id:'request',edge:'client->api',codeRefs:[ref]},{id:'failure',failures:{'client->api':'dropped'},codeRefs:[{...ref,path:'src/failure.js'}]},
 {id:'own',nodes:['api'],codeRefs:[{...ref,path:'src/own.js'}]},{id:'unrelated',nodes:['unrelated'],codeRefs:[{...ref,path:'src/unrelated.js'}]}];
 const links=plain(ctx.nodeReferenceLinks(d,'api')).filter(l=>l.group==='Related step code');assert.equal(links.length,3);
 assert.match(links[0].label,/request/);assert.match(links[1].url,/failure\.js/);assert.match(links[2].label,/own/);
 const other=plain(ctx.nodeReferenceLinks(d,'unrelated'));assert.equal(other.length,1);assert.match(other[0].url,/unrelated\.js/);
});
test('duplicate URLs are listed once and unbound nodes retain no reference affordance',()=>{
 const d=diagram();d.nodes.api.link=d.nodes.api.binding.catalogUrl;d.steps=[{id:'again',nodes:['api'],codeRefs:[ref]}];
 const links=ctx.nodeReferenceLinks(d,'api');assert.equal(new Set(links.map(l=>l.url)).size,links.length);assert.equal(links.length,4);
 assert.deepEqual(plain(ctx.nodeReferenceLinks(d,'client')),[]);assert.deepEqual(plain(ctx.nodeReferenceLinks(d,'missing')),[]);
});
test('unsafe URLs and invalid source refs never become menu destinations',()=>{
 const d=diagram();Object.assign(d.nodes.api,{link:'javascript:alert(1)',binding:{catalogUrl:'https://user:secret@backstage.example',api:{definitionUrl:'data:text/html,evil',endpoints:{prod:'file:///private'}}},codeRefs:[null,{...ref,revision:'main'},{...ref,path:'../outside'}]});
 assert.deepEqual(plain(ctx.nodeReferenceLinks(d,'api')),[]);
});
