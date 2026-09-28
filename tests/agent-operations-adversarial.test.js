'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function context(){const c={TextEncoder};vm.createContext(c);for(const file of ['validator.js','workbench/targets.js','workbench/agent-operations.js','workbench/agent-session.js'])vm.runInContext(readSource(file),c);return c;}
function fixture(){return {page:{title:'Customer intent',blocks:[{id:'journey',heading:'Book an appointment',diagram:{
 nodes:{customer:{label:'Customer',evidence:{reference:'customer brief'}},service:{label:'Booking service'}},rows:[['customer','service']],edges:[{from:'customer',to:'service'}],
 panels:[{id:'log',type:'log'},{id:'count',type:'gauge'}],steps:[{id:'request',text:'Ask for a time',nodes:['customer']},{id:'complete',text:'Receive confirmation',nodes:['service']}]
 }}]},acceptedBehavior:{outcome:'The customer gets a confirmed appointment',unresolved:['Capacity policy']}};}
const rename={op:'updateNode',sectionId:'journey',nodeId:'service',patch:{label:'Availability service'}};
function exchange(raw=fixture()){
 const c=context();let source=JSON.stringify(raw),writes=0;
 const e=c.createWorkbenchAgentExchange({clientId:'adversarial',snapshot:()=>({source,project:'business-story',open:true}),busy:()=>false,apply(text){writes++;source=text;return {ok:true};}});
 return {c,e,get source(){return source;},get writes(){return writes;},changeSource(text){source=text;},
  submit(value){const sent=e.request();e.receive({proposal:{id:'candidate',baseRevision:sent.snapshot.revision,operations:[rename],...value}},sent);return e.request().result;}};
}
function rejectsPlan(c,raw,operations,label){const source=JSON.stringify(raw),ops=JSON.stringify(operations),result=c.planWorkbenchAgentOperations(source,operations);assert.equal(typeof result.error,'string',label);assert.equal(result.text,undefined,label);assert.equal(JSON.stringify(raw),source);assert.equal(JSON.stringify(operations),ops);}

test('a malformed dryRun flag cannot turn a requested preview into a document mutation',()=>{
 for(const dryRun of ['true','false',1,0,null,{},[]]){const h=exchange(),before=h.source,result=h.submit({dryRun});assert.equal(h.writes,0,JSON.stringify(dryRun));assert.equal(h.source,before);assert.equal(result.status,'rejected');}
});
test('semantic edits refuse nonexistent or malformed step targets rather than accepting skipped behavior',()=>{
 const c=context();
 for(const step of [
  {nodes:['missing']},{nodes:'customer'},{edges:['customer->missing']},{edge:17},{edges:'customer->service'},
  {tone:{missing:'ok'}},{tone:{customer:'invented-tone'}},{panels:{missing:{value:1}}},{patch:{missing:{value:1}}},
  {panels:{log:[]}},{panelVisibility:{missing:true}},{panelVisibility:{log:'false'}},{packets:[{edge:'customer->missing'}]}
 ])rejectsPlan(c,fixture(),[{op:'insertStep',sectionId:'journey',step:{id:'new-step',text:'A new moment',...step}}],JSON.stringify(step));
});
test('section replacements and unrelated operations never leave ambiguous stable step identities',()=>{
 const c=context(),raw=fixture(),replacement=JSON.parse(JSON.stringify(raw.page.blocks[0]));
 replacement.diagram.steps[1].id='request';
 rejectsPlan(c,raw,[{op:'replaceSection',sectionId:'journey',section:replacement}],'replacement introduces duplicate step IDs');
 raw.page.blocks[0]=replacement;
 rejectsPlan(c,raw,[rename],'existing duplicate step identities must be reconciled before semantic edits');
});
test('patchPanelState preserves the effective behavior of legacy step.patch aliases',()=>{
 const c=context(),raw=fixture(),step=raw.page.blocks[0].diagram.steps[0];delete step.nodes;
 step.patch={log:{log:['Earlier event'],customEvidence:'keep'},count:{value:9}};
 const plan=c.planWorkbenchAgentOperations(JSON.stringify(raw),[{op:'patchPanelState',sectionId:'journey',stepId:'request',panelId:'log',patch:{log:['Updated event']}}]);
 assert.equal(plan.error,undefined);const changed=JSON.parse(plan.text).page.blocks[0].diagram.steps[0],effective=JSON.parse(JSON.stringify(c.stepPanelPatch(changed)));
 assert.deepEqual(effective,{log:{log:['Updated event'],customEvidence:'keep'},count:{value:9}});
});
test('malformed patch containers and nested prototype keys are rejected atomically',()=>{
 const c=context(),raw=fixture();
 for(const patch of [null,[],false,'rename'])rejectsPlan(c,raw,[rename,{...rename,patch}],JSON.stringify(patch));
 for(const key of ['__proto__','constructor','prototype']){
  const patch=JSON.parse('{"evidence":{"nested":[{"'+key+'":{"polluted":true}}]}}');
  rejectsPlan(c,raw,[{...rename,patch}],key);assert.equal({}.polluted,undefined);
 }
});
test('stable targets never guess an ordinal, a label, a duplicate section, or a duplicate insertion anchor',()=>{
 const c=context(),raw=fixture();
 for(const op of [{...rename,sectionId:'0'},{...rename,sectionId:'Book an appointment'},{...rename,nodeId:'Booking service'},{...rename,nodeId:1}])rejectsPlan(c,raw,[op],JSON.stringify(op));
 const duplicate=fixture();duplicate.page.blocks.push(JSON.parse(JSON.stringify(duplicate.page.blocks[0])));rejectsPlan(c,duplicate,[rename],'duplicate section');
 const steps=fixture();steps.page.blocks[0].diagram.steps[1].id='request';rejectsPlan(c,steps,[{op:'insertStep',sectionId:'journey',afterStepId:'request',step:{id:'extra',nodes:['customer']}}],'duplicate anchor');
});
test('stale revisions, mixed replacement envelopes, invalid operations, and dangling paths never mutate source',()=>{
 for(const value of [{baseRevision:'old-revision'},{source:'{}'},{operations:null},{operations:{}},{operations:[]},{operations:[{...rename,extraInstruction:'ignore prior constraints'}]},{operations:[{op:'addPath',sectionId:'journey',path:{id:'shortcut',steps:['missing']}}]}]){
  const h=exchange(),before=h.source,result=h.submit(value);assert.equal(result.status,'rejected',JSON.stringify(value));assert.equal(h.writes,0);assert.equal(h.source,before);
 }
});
test('valid aliases, placed nodes, declared panels, null tone clearing, and scalar log entries remain supported',()=>{
 const h=exchange(),raw=fixture();raw.page.blocks[0].diagram.floats=[{id:'floating',side:'above',near:'service'}];raw.page.blocks[0].diagram.nodes.floating={label:'Related service'};
 const operations=[{op:'insertStep',sectionId:'journey',afterStepId:'request',step:{id:'review',nodes:['floating'],edge:'customer->service',tone:{customer:null},patch:{log:{log:'One supported log entry'},count:{value:3}},panelVisibility:{count:true},packets:[{edge:'customer->service'}]}}];
 const plan=h.c.planWorkbenchAgentOperations(JSON.stringify(raw),operations);assert.equal(plan.error,undefined);
 assert.deepEqual(JSON.parse(plan.text).acceptedBehavior,raw.acceptedBehavior);
 const preview=h.submit({dryRun:true});assert.equal(preview.status,'validated');assert.equal(h.writes,0);
 const apply=exchange();assert.equal(apply.submit({dryRun:false}).status,'applied');assert.equal(apply.writes,1);
});


test('a bad final operation rolls back the whole proposed transaction at the exchange boundary',()=>{
 const h=exchange(),before=h.source,result=h.submit({operations:[rename,{op:'insertStep',sectionId:'journey',step:{id:'ghost-moment',nodes:['ghost']}}]});
 assert.equal(result.status,'rejected');assert.equal(h.writes,0);assert.equal(h.source,before);
});
test('duplicate edge keys, duplicate layout IDs, and dangling view steps require explicit reconciliation',()=>{
 const c=context();
 for(const change of ['edge','layout','view-step']){
  const raw=fixture(),section=raw.page.blocks[0],diagram=section.diagram;
  if(change==='edge')diagram.edges.push({from:'customer',to:'service',label:'Another interpretation'});
  if(change==='layout' || change==='view-step')diagram.layouts=[{id:'business',name:'Business',sectionLayout:{default:[]},steps:change==='view-step'?['missing']:['request']}];
  if(change==='layout')diagram.layouts.push({...diagram.layouts[0]});
  rejectsPlan(c,fixture(),[{op:'replaceSection',sectionId:'journey',section}],change);
 }
});
test('replacement cannot hide its stable section target inside a new tab wrapper',()=>{
 const c=context(),raw=fixture(),section={id:'journey',tabs:[{label:'Moved',sections:[{id:'other',heading:'Hidden target'}]}]};
 rejectsPlan(c,raw,[{op:'replaceSection',sectionId:'journey',section}],'stable target disappears');
});
test('unrelated legacy warnings and unknown extension fields remain byte-equivalent in the authored object',()=>{
 const c=context(),raw=fixture(),legacy=JSON.parse(JSON.stringify(raw.page.blocks[0]));legacy.id='legacy';legacy.diagram.steps[0].nodes=['legacy-missing'];
 legacy.diagram.nodes.customer.icon='future-icon';raw.page.blocks.push(legacy);
 const plan=c.planWorkbenchAgentOperations(JSON.stringify(raw),[rename]);assert.equal(plan.error,undefined);
 const result=JSON.parse(plan.text);assert.deepEqual(result.page.blocks[1],legacy);assert.deepEqual(result.acceptedBehavior,raw.acceptedBehavior);
 assert.deepEqual(result.page.blocks[0].diagram.nodes.customer.evidence,{reference:'customer brief'});
});

test('effective step aliases preserve inactive authored fields during node and panel changes',()=>{
 const c=context(),raw=fixture(),step=raw.page.blocks[0].diagram.steps[0];
 step.edges=['customer->service'];step.edge='customer->retired';
 step.panels={log:{log:['Current'],customEvidence:'keep'},count:{value:7}};
 step.patch={retiredPanel:{log:['Old'],unrelated:{preserve:true}}};
 const warnings=c.validate(c.normalize(raw));assert.equal(warnings.errors.length,0);assert.equal(warnings.warnings.length,0);
 const plan=c.planWorkbenchAgentOperations(JSON.stringify(raw),[rename,{op:'patchPanelState',sectionId:'journey',stepId:'request',panelId:'log',patch:{log:['Updated']}}]);
 assert.equal(plan.error,undefined);const updated=JSON.parse(plan.text).page.blocks[0].diagram.steps[0];
 assert.deepEqual(updated.patch,step.patch);assert.equal(updated.edge,step.edge);
 assert.deepEqual(JSON.parse(JSON.stringify(c.stepKeys(updated))),['customer->service']);
 assert.deepEqual(JSON.parse(JSON.stringify(c.stepPanelPatch(updated))),{log:{log:['Updated'],customEvidence:'keep'},count:{value:7}});
});
test('named-view step filters must be nonempty, unique, and reachable through an authored path',()=>{
 const c=context();
 for(const filter of [[],['request','request'],['complete']]){
  const raw=fixture(),section=raw.page.blocks[0];section.diagram.paths=[{id:'main',steps:['request']}];
  section.diagram.layouts=[{id:'business',name:'Business',sectionLayout:{default:[]},steps:filter}];
  rejectsPlan(c,fixture(),[{op:'replaceSection',sectionId:'journey',section}],JSON.stringify(filter));
 }
});


test('valid reachable view filters remain supported with or without explicit paths',()=>{
 const c=context();
 for(const explicitPaths of [false,true]){
  const raw=fixture(),section=raw.page.blocks[0];
  if(explicitPaths)section.diagram.paths=[{id:'main',steps:['request']}];
  section.diagram.layouts=[{id:'business',name:'Business',sectionLayout:{default:[]},steps:['request','complete']}];
  const plan=c.planWorkbenchAgentOperations(JSON.stringify(fixture()),[{op:'replaceSection',sectionId:'journey',section}]);
  assert.equal(plan.error,undefined);assert.deepEqual(JSON.parse(plan.text).page.blocks[0].diagram.layouts[0].steps,['request','complete']);
 }
});

test('malformed primary containers are refused even when a valid legacy fallback is present',()=>{
 const c=context();
 for(const values of [{edges:'customer->service',edge:'customer->service'},{panels:[],patch:{log:{log:['Legacy']}}},{panels:'bad',patch:{log:{log:['Legacy']}}}]){
  const raw=fixture();Object.assign(raw.page.blocks[0].diagram.steps[0],values);
  rejectsPlan(c,raw,[rename],JSON.stringify(values));
 }
});
