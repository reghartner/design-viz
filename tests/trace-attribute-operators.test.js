'use strict';
/* #1413 trace `attributes` match by operator: a value is a scalar (exact, as before) or an object with exactly one
   of startsWith / endsWith / contains (non-empty text) or in (a non-empty list of text). Anything else matches no
   span and the validator warns (fail closed, never match-all).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| O1 | Matcher truth table: each operator on text values; scalars stay exact; non-text attribute values, a missing attribute, an empty operand, an unknown operator, two operators and a malformed list never match. | traceAttributeMatches / traceAttributesMatch | booleans | match-all on a malformed value; String() coercion of numbers |
| O2 | The request's case: three POST spans from service a; the a → b send span declared with {"server.address":{"startsWith":"b."}} claims only B's span, and a step lighting a → b inherits only that span; without the operator it claims all three. | declarations + mapTrace | claimed span ids | exact-only matching |
| O3 | traceMatch and traceScope attributes take the operators too. | step traceMatch / traceScope | matched span ids | operators only on declarations |
| O4 | Validator: the object form is accepted with no error or warning on a declaration, a traceMatch and a traceScope; a malformed one is a warning naming the path (not an error); an array is still an error. | page with each | errors and warnings | accepting junk silently; rejecting the object form |
| O5 | Imports carry the object form: a provider declaration and a consumer overlay patch with an operator resolve unchanged on the imported carrier and match. | provider + consumer | resolved declaration; matched spans | an import that drops or stringifies the object |
| O7 | (review c1) A step's other traceMatch alternative with an operator is "in this trace, not matched" when its span is present, not "not in this trace". | alternatives [a POST startsWith b. (two spans: ambiguous), b POST /orders] | the row title | the step row's own === comparison |
| O6 | Workbench commands: the trace match, trace scope and carrier span forms write an operator from a kind and text ("in" splits on commas); an empty operand is refused; switching a row's kind converts the value; the forms read operator values (no JSON fallback). | traceMatchFormEdit, planStepTraceScope, traceSpansEdit | written objects; errors | operators written as text; the form falling back to JSON |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const V={URL,console,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};
vm.runInNewContext(loader.entrypoint('standalone').body,V);
const T={URL,TextEncoder};vm.createContext(T);
vm.runInContext(loader.composeSources(['canon.js','validator.js','compatibility.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js',
  'workbench/commands/document.js','workbench/commands/narrative.js','workbench/commands/layout.js','workbench/commands/topology.js','workbench/commands/telemetry.js']),T);
const plain=v=>JSON.parse(JSON.stringify(v));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
const s=(id,parentId,serviceName,operation,startMs,durationMs,attributes={})=>({id,parentId,serviceName,operation,startMs,durationMs,error:false,attributes,links:[]});

test('O1 the matcher truth table',()=>{
  const M=V.traceAttributeMatches;assert.equal(typeof M,'function','traceAttributeMatches is a shared matcher helper');
  const rows=[
    ['b.internal.prd.example.com',{startsWith:'b.'},true],['queue.internal',{startsWith:'b.'},false],
    ['b.internal.prd.example.com',{endsWith:'.example.com'},true],['b.internal.prd.example.org',{endsWith:'.example.com'},false],['m',{endsWith:'.example.com'},false],
    ['b.internal.prd.example.com',{contains:'.prd.'},true],['b.internal.stg.example.com',{contains:'.prd.'},false],
    ['GET',{in:['GET','HEAD']},true],['POST',{in:['GET','HEAD']},false],
    ['b.x',{startsWith:'B.'},false,'operators are case-sensitive'],['get',{in:['GET']},false],
    ['b.x','b.x',true],['b.x','b.',false],[200,200,true],['200',200,false],[true,true,true],
    [200,{startsWith:'2'},false,'a number attribute value never matches a text operator'],[200,{in:['200']},false],[true,{contains:'t'},false],
    [undefined,{startsWith:'b.'},false,'a missing attribute never matches'],
    ['anything',{startsWith:''},false,'an empty prefix is malformed, not match-all'],['anything',{contains:''},false],
    ['anything',{regex:'.*'},false,'an unknown operator'],['b.x',{startsWith:'b.',endsWith:'x'},false,'two operators'],
    ['a',{in:[]},false,'an empty list'],['a',{in:['a',1]},false,'a list with a non-text entry'],['a',{in:'a'},false,'in needs a list'],
    ['a',{},false,'an empty object'],['a',null,false],['a',['a'],false]];
  for(const [actual,expected,want,why] of rows)assert.equal(M(actual,expected),want,(why || '')+' '+JSON.stringify([actual,expected]));
  assert.equal(V.traceAttributesMatch({'server.address':'b.1'},{'server.address':{startsWith:'b.'}}),true);
  assert.equal(V.traceAttributesMatch({},{'server.address':{startsWith:'b.'}}),false,'a missing key does not match');
  assert.equal(V.traceAttributesMatch({x:'1'},{}),true,'no attributes: every span');
  for(const bad of [{startsWith:''},{regex:'x'},{startsWith:'a',contains:'b'},{in:[]},{},[]])assert.ok(V.traceAttributeProblem(bad),'malformed: '+JSON.stringify(bad));
  for(const good of ['x',3,false,{startsWith:'b.'},{endsWith:'.com'},{contains:'prd'},{in:['a','b']}])assert.equal(V.traceAttributeProblem(good),null,JSON.stringify(good));
});

// Service a makes three POST calls: to b, to a queue and to an emulator.
const POSTS=()=>[
  s('req',null,'a','handle',0,100),
  s('toB','req','a','POST',10,16,{'server.address':'b.internal.prd.example.com'}),
  s('toQ','req','a','POST',30,3,{'server.address':'queue.internal.prd.example.com'}),
  s('toE','req','a','POST',40,2,{'server.address':'emulator.local'}),
  s('bRecv','toB','b','POST /orders',12,12)];
function posts(attributes){
  const send={serviceName:'a',operation:'POST',role:'send'};if(attributes)send.attributes=attributes;
  return {nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Order',trace:{spans:{send}}}],
    steps:[{id:'order',text:'A sends the order to B',edge:'a->b'}],panels:[{id:'status',type:'live-status'}]};
}
test('O2 the request case: startsWith claims only B\'s POST span; the step inherits only it',()=>{
  const claimed=d=>plain(V.FlowTraceMatch.carrierSpans(d,{spans:POSTS()}).edges['a->b'][0].spans.map(x=>x.id));
  assert.deepEqual(claimed(posts()),['toB','toQ','toE'],'without the operator every POST of a is claimed');
  const d=posts({'server.address':{startsWith:'b.'}});
  assert.deepEqual(claimed(d),['toB']);
  const step=plain(V.FlowTraceMatch.mapTrace(d,{spans:POSTS(),warnings:[]}).steps.find(r=>r.stepId==='order'));
  assert.deepEqual(step.spans.map(x=>x.id),['toB'],'the step inherits only B\'s span');
  assert.deepEqual(claimed(posts({'server.address':{in:['emulator.local','queue.internal.prd.example.com']}})),['toQ','toE']);
  assert.deepEqual(claimed(posts({'server.address':{startsWith:''}})),[],'a malformed operator claims nothing');
});

test('O3 traceMatch and traceScope attributes take the operators',()=>{
  const d=posts();d.edges[0].trace.spans.send.attributes={'server.address':{endsWith:'.example.com'}};
  d.steps=[{id:'order',text:'A sends',edge:'a->b',traceMatch:{serviceName:'a',operation:'POST',attributes:{'server.address':{contains:'emulator'}}}}];
  let r=plain(V.FlowTraceMatch.mapTrace(d,{spans:POSTS(),warnings:[]}).steps.find(x=>x.stepId==='order'));
  assert.deepEqual(r.spans.map(x=>x.id),['toE'],'traceMatch contains');
  d.steps=[{id:'order',text:'A sends',edge:'a->b',traceScope:{attributes:{'server.address':{startsWith:'queue.'}}}}];
  r=plain(V.FlowTraceMatch.mapTrace(d,{spans:POSTS(),warnings:[]}).steps.find(x=>x.stepId==='order'));
  assert.deepEqual(r.spans.map(x=>x.id),['toQ'],'traceScope narrows the inherited spans by operator');
});

test('O4 the validator accepts the object form and warns on a malformed one',()=>{
  const A='deployment.environment.name';
  function check(attr){
    const d={nodes:{a:{title:'A',trace:{spans:{work:{serviceName:'a',operation:'work',attributes:{[A]:attr},role:'process'}}}},b:{title:'B'}},rows:[['a','b']],
      edges:[{from:'a',to:'b',trace:{spans:{send:{serviceName:'a',operation:'POST',attributes:{[A]:attr},role:'send'}}}}],
      steps:[{id:'one',text:'One',edge:'a->b',traceMatch:{serviceName:'a',operation:'POST',attributes:{[A]:attr}}},{id:'two',text:'Two',nodes:['a'],traceScope:{attributes:{[A]:attr}}}],
      panels:[{id:'status',type:'live-status'}]};
    const raw=spec('board',d,{tracking:{telemetry:{}}}),out=T.validate(T.normalize(raw));
    return {errors:plain(out.errors).filter(e=>/attributes/.test(e)),warnings:plain(out.warnings).filter(w=>/attributes/.test(w))};
  }
  for(const good of [{startsWith:'prd'},{endsWith:'-eu'},{contains:'prd'},{in:['prd','stg']}])assert.deepEqual(check(good),{errors:[],warnings:[]},JSON.stringify(good));
  const bad=check({startsWith:''});
  assert.deepEqual(bad.errors,[],'a malformed operator is not an error');
  for(const at of ['nodes.a.trace.spans.work','edges.a->b.trace.spans.send','steps.one.traceMatch','steps.two.traceScope'])
    assert.ok(bad.warnings.some(w=>w.startsWith(at+'.attributes.'+A+': ') && /matches no span/.test(w)),'warns at '+at+': '+bad.warnings.join(' | '));
  assert.ok(check(['prd']).errors.length>0,'an array value is still an error');
});

test('O5 imports carry the object form: provider declarations and consumer overlay patches',()=>{
  // A built-in attribute, so the consumer board allows the provider's declaration without a trace connection.
  const A='deployment.environment.name';
  const provider=spec('provider',{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],
    edges:[{from:'a',to:'b',label:'Order',trace:{spans:{send:{serviceName:'a',operation:'POST',attributes:{[A]:{startsWith:'prd'}},role:'send'}}}}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
  const consumer=spec('consumer',{nodes:{x:{title:'X'}},rows:[['x']],topologyImports:[{spec:'provider',export:'core',as:'p'}]});
  const context={version:1,id:'consumer',specs:[provider,consumer]};
  const spans=[s('one',null,'a','POST',0,5,{[A]:'prd-eu'}),s('two',null,'a','POST',10,5,{[A]:'stg-eu'}),s('three',null,'a','POST',20,5,{[A]:'dev'})];
  let d=T.FlowTopology.resolveSource(consumer,context).page.sections[0].diagram,edge=d.edges.find(e=>e.from==='p::a');
  assert.ok(edge && edge.trace,'the imported connection keeps its declaration');
  assert.deepEqual(plain(edge.trace.spans.send.attributes),{[A]:{startsWith:'prd'}},'the provider\'s operator arrives unchanged');
  assert.deepEqual(plain(V.FlowTraceMatch.carrierSpans(plain(d),{spans}).edges['p::a->p::b'][0].spans.map(x=>x.id)),['one']);
  consumer.page.sections[0].diagram.topologyImports[0].edgeTracking={'a->b':{trace:{spans:{send:{attributes:{[A]:{in:['dev','stg-eu']}}}}}}};
  d=T.FlowTopology.resolveSource(consumer,context).page.sections[0].diagram;edge=d.edges.find(e=>e.from==='p::a');
  assert.deepEqual(plain(edge.trace.spans.send.attributes),{[A]:{in:['dev','stg-eu']}},'a consumer patch with an operator replaces it');
  assert.deepEqual(plain(V.FlowTraceMatch.carrierSpans(plain(d),{spans}).edges['p::a->p::b'][0].spans.map(x=>x.id)),['two','three']);
});

test('O6 Workbench commands write operators from a kind and text, and read them back',()=>{
  const A='deployment.environment.name';
  // Step trace match.
  let r=T.traceMatchFormEdit({serviceName:'a',operation:'POST'},{op:'attribute',alternative:0,key:null,name:A,value:'prd',type:'startsWith'});
  assert.equal(r.error,undefined,'the trace match form takes an operator kind');
  assert.deepEqual(plain(r.value),{serviceName:'a',operation:'POST',attributes:{[A]:{startsWith:'prd'}}});
  r=T.traceMatchFormEdit(r.value,{op:'attribute',alternative:0,key:A,name:A,value:'prd, stg',type:'in'});
  assert.deepEqual(plain(r.value.attributes),{[A]:{in:['prd','stg']}},'switching the kind converts the value; in splits on commas');
  assert.match(T.traceMatchFormEdit({serviceName:'a',operation:'POST'},{op:'attribute',alternative:0,key:null,name:A,value:'  ',type:'contains'}).error,/would match every span/);
  assert.ok(T.traceMatchFormAlternatives({serviceName:'a',operation:'POST',attributes:{[A]:{endsWith:'-eu'}}}),'the form reads operator values');
  assert.equal(T.traceMatchFormAlternatives({serviceName:'a',operation:'POST',attributes:{[A]:{startsWith:''}}}),null,'a malformed one falls back to JSON');
  assert.equal(T.traceAttributeKind({in:['a']}),'in');assert.equal(T.traceAttributeText({in:['a','b']}),'a, b');assert.equal(T.traceAttributeText({startsWith:'b.'}),'b.');
  assert.equal(T.traceAttributeLabel('server.address',{startsWith:'b.'}),'server.address starts with b.');
  // Carrier span.
  let spans={send:{serviceName:'a',operation:'POST',role:'send'}};
  r=T.traceSpansEdit(spans,{op:'attribute',name:'send',key:null,attrName:A,value:'prd',type:'endsWith'},'edge',null);
  assert.equal(r.error,undefined,'the span form takes an operator kind');
  assert.deepEqual(plain(r.value.send.attributes),{[A]:{endsWith:'prd'}});
  r=T.traceSpansEdit(r.value,{op:'attribute',name:'send',key:A,attrName:A,type:'string'},'edge',null);
  assert.deepEqual(plain(r.value.send.attributes),{[A]:'prd'},'back to an exact text value');
  // Step trace scope.
  const raw=spec('board',{nodes:{a:{title:'A'}},rows:[['a']],steps:[{id:'one',text:'One',nodes:['a'],traceScope:{}}]}),text=JSON.stringify(raw,null,2);
  const plan=T.planStepTraceScope(text,raw,0,0,{op:'attribute',key:null,attrName:A,value:'prd',type:'contains'},{allowed:[A]});
  assert.equal(plan.error,undefined,plan.error);
  assert.deepEqual(plain(JSON.parse(plan.text).page.sections[0].diagram.steps[0].traceScope.attributes),{[A]:{contains:'prd'}});
});

test('O7 a step\'s other alternative with an operator counts as present when its span is in the trace',()=>{
  const d=posts();d.edges[0].trace={spans:{}};
  d.steps=[{id:'order',text:'A sends',edge:'a->b',traceMatch:[{serviceName:'a',operation:'POST',attributes:{'server.address':{endsWith:'.example.com'}}},{serviceName:'b',operation:'POST /orders'}]}];
  const ex=x=>({id:x.id,parentId:x.parentId,service:x.serviceName,name:x.operation,startMs:x.startMs,ms:x.durationMs,error:false,attributes:x.attributes,links:[]});
  const model=V.telemetryTraceModel(d,undefined,{traceId:'t1',spans:POSTS().map(ex)}),row=model.rows.find(r=>r.id==='order');
  assert.ok(row,'the step has a row');assert.equal(row.alternative,1,'the second alternative matched (the first is ambiguous)');
  const title=V.telemetryTraceRowTitle(row);
  assert.match(title,/in this trace, not matched: a POST/,title);assert.doesNotMatch(title,/; not in this trace/,title);
});
