'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={TextEncoder};vm.createContext(context);
for(const file of ['agent-merge','agent-session'])vm.runInContext(fs.readFileSync('src/workbench/'+file+'.js','utf8'),context);
const merge=(b,c,a)=>JSON.parse(JSON.stringify(context.mergeWorkbenchAgentSource(JSON.stringify(b),JSON.stringify(c),JSON.stringify(a))));
const document=()=>({page:{title:'Story',blocks:[{heading:'Checkout',diagram:{nodes:{user:{title:'User',desc:'Original'},api:{title:'API'}},rows:[['user','api']],edges:[]}}]}});
test('nonoverlapping changes inside the same legacy section and different fields of a node merge',()=>{
  const b=document(),c=document(),a=document();c.page.blocks[0].diagram.nodes.user.title='Customer';a.page.blocks[0].diagram.nodes.user.desc='Places an order';
  const result=merge(b,c,a);assert.equal(result.ok,true);assert.equal(result.merged,true);
  const user=JSON.parse(result.source).page.blocks[0].diagram.nodes.user;assert.deepEqual(user,{title:'Customer',desc:'Places an order'});
});
test('overlapping values return actionable paths and no partial document',()=>{
  const result=merge({nodes:{api:{title:'API'}}},{nodes:{api:{title:'Human'}}},{nodes:{api:{title:'Agent'}}});
  assert.equal(result.ok,false);assert.equal(result.source,undefined);assert.equal(result.conflicts[0].path,'/nodes/api/title');
});
test('delete versus edit and concurrent differing additions are conflicts',()=>{
  for(const inputs of [[{a:{label:'old'}},{},{a:{label:'new'}}],[{},{a:1},{a:2}]])assert.equal(merge(...inputs).ok,false);
});
test('same edits, removals, and independent additions merge',()=>{
  assert.deepEqual(JSON.parse(merge({a:1,b:2},{a:3,c:4},{a:3,b:2,d:5}).source),{a:3,c:4,d:5});
});
test('stable array identities preserve independent field changes across one-sided reorder',()=>{
  const b=[{id:'a',x:1},{id:'b',x:2}],c=[{id:'b',x:2},{id:'a',x:1}],a=[{id:'a',x:3},{id:'b',x:2}];
  assert.deepEqual(JSON.parse(merge(b,c,a).source),[{id:'b',x:2},{id:'a',x:3}]);
});
test('independent keyed insertions retain their positions',()=>{
  const b=[{id:'a'},{id:'b'}],c=[{id:'a'},{id:'human'},{id:'b'}],a=[{id:'a'},{id:'agent'},{id:'b'}];
  assert.deepEqual(JSON.parse(merge(b,c,a).source).map(v=>v.id),['a','human','agent','b']);
});
test('conflicting reorders and unidentifiable ordered arrays require a revision',()=>{
  assert.equal(merge([{id:'a'},{id:'b'},{id:'c'}],[{id:'b'},{id:'a'},{id:'c'}],[{id:'a'},{id:'c'},{id:'b'}]).ok,false);
  assert.equal(merge([1,2],[3,2],[1,4]).ok,false);
  assert.equal(merge([{id:'a'},{id:'a'}],[{id:'a',x:1},{id:'a'}],[{id:'a'},{id:'a',x:2}]).ok,false);
});
test('section heading rename versus edits does not guess identity',()=>{
  const b=document(),c=document(),a=document();c.page.blocks[0].heading='New heading';a.page.blocks[0].diagram.nodes.api.title='Server';
  assert.equal(merge(b,c,a).ok,false);
});
test('JSON special keys remain data',()=>{
  const b=JSON.parse('{"__proto__":{"x":1},"a":1}'),c=JSON.parse('{"__proto__":{"x":2},"a":1}'),a=JSON.parse('{"__proto__":{"x":1},"a":2}');
  assert.equal(JSON.parse(merge(b,c,a).source).__proto__.x,2);assert.equal({}.x,undefined);
});
test('preview validates combined relationships, unknown revisions and invalid JSON without applying',()=>{
  let source='{"a":1,"b":1}',applied=0;
  const exchange=context.createWorkbenchAgentExchange({clientId:'test',snapshot:()=>({source,project:1,open:true}),busy:()=>false,apply:()=>{applied++;},validate:text=>JSON.parse(text).b===2?'Broken reference':''});
  const revision=exchange.request().snapshot.revision;source='{"a":2,"b":1}';
  const proposal={baseRevision:revision,source:'{"a":1,"b":2}'};
  assert.equal(exchange.preview(proposal).ok,false);assert.match(exchange.preview(proposal).conflicts[0].reason,/Broken reference/);
  assert.equal(exchange.preview({...proposal,baseRevision:'other-1'}).ok,false);
  assert.equal(exchange.preview({...proposal,source:'incomplete'}).ok,false);assert.equal(applied,0);
});

test('concurrent common additions with conflicting order never pick a winner',()=>{
  assert.equal(merge([{id:'a'}],[{id:'a'},{id:'x'},{id:'y'}],[{id:'a'},{id:'y'},{id:'x'}]).ok,false);
});

test('paired preview requires a ledger, handles ledger-only revisions and preserves conflicting ledger edits',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const context=vm.createContext({TextEncoder});
  for(const name of ['agent-merge.js','agent-session.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workbench',name),'utf8'),context);
  let source='{"title":"Initial"}',ledger='# Before',writes=0;
  const exchange=context.createWorkbenchAgentExchange({clientId:'pair',requireLedger:true,snapshot:()=>({source,ledger,project:1,open:true}),busy:()=>false,apply:(text,current,proposal)=>{source=text;ledger=proposal.ledger;writes++;return {ok:true};}});
  const sent=exchange.request(),proposal={id:'p',baseRevision:sent.snapshot.revision,source,ledger:'# After'};
  assert.equal(exchange.preview({...proposal,ledger:undefined}).ok,false);
  assert.equal(exchange.preview(proposal).ledger,'# After');
  exchange.receive({proposal},sent);assert.equal(writes,1);assert.equal(ledger,'# After');assert.notEqual(exchange.request().snapshot.revision,sent.snapshot.revision);
  ledger='# Local evidence';const conflict=exchange.preview({...proposal,id:'q',ledger:'# Other agent evidence'});assert.equal(conflict.ok,false);assert.equal(conflict.conflicts[0].path,'/ledger');
});
