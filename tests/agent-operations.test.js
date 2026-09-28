const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function context(){const c={TextEncoder};vm.createContext(c);['validator.js','workbench/targets.js','workbench/agent-operations.js','workbench/agent-session.js'].forEach(file=>vm.runInContext(readSource(file),c));return c;}
function fixture(){return {page:{title:'Intent',blocks:[{id:'journey',heading:'Customer outcome',unknown:{keep:true},diagram:{nodes:{customer:{label:'Customer',custom:'keep'},service:{label:'Service'}},rows:[['customer','service']],edges:[{from:'customer',to:'service'}],panels:[{id:'log',type:'log'}],steps:[{id:'one',text:'Request',nodes:['customer']},{id:'two',text:'Complete',nodes:['service']}]}}]},storyBrief:{intent:'Do not change'}};}
const operation={op:'updateNode',sectionId:'journey',nodeId:'service',patch:{label:'Checkout'}};
test('semantic edits preserve original intent and unrelated fields; all five operations form one plan',()=>{
 const c=context(),raw=fixture(),source=JSON.stringify(raw),ops=[operation,{op:'insertStep',sectionId:'journey',afterStepId:'one',step:{id:'middle',text:'Work',nodes:['service']}},{op:'patchPanelState',sectionId:'journey',stepId:'middle',panelId:'log',patch:{log:[{text:'accepted'}]}},{op:'addPath',sectionId:'journey',path:{id:'happy',label:'Happy',steps:['one','middle','two']}}];
 const before=JSON.stringify(ops),plan=c.planWorkbenchAgentOperations(source,ops);assert.equal(plan.error,undefined);const result=JSON.parse(plan.text),section=result.page.blocks[0];
 assert.deepEqual(result.storyBrief,raw.storyBrief);assert.deepEqual(section.unknown,{keep:true});assert.equal(section.diagram.nodes.customer.custom,'keep');assert.equal(section.diagram.nodes.service.label,'Checkout');assert.deepEqual(section.diagram.steps.map(s=>s.id),['one','middle','two']);assert.equal(section.diagram.steps[1].panels.log.log[0].text,'accepted');assert.equal(JSON.stringify(ops),before);
 const replacement={...section,heading:'Engineering detail'};const replaced=c.planWorkbenchAgentOperations(plan.text,[{op:'replaceSection',sectionId:'journey',section:replacement}]);assert.equal(replaced.error,undefined);assert.equal(JSON.parse(replaced.text).page.blocks[0].heading,'Engineering detail');
});
test('invalid later operations reject atomically and IDs never fall back to ordinals',()=>{
 const c=context(),source=JSON.stringify(fixture());
 for(const ops of [[operation,{...operation,nodeId:'missing'}],[{...operation,sectionId:'1'}],[{...operation,op:'arbitrary'}],[{...operation,extra:true}],[{...operation,patch:{id:'renamed'}}],[{op:'replaceSection',sectionId:'journey',section:{id:'different'}}],[{op:'addPath',sectionId:'journey',path:{id:'bad',steps:['missing']}}]]){const plan=c.planWorkbenchAgentOperations(source,ops);assert.ok(plan.error);assert.equal(plan.text,undefined);}
 const raw=fixture();raw.page.blocks.push(raw.page.blocks[0]);assert.match(c.planWorkbenchAgentOperations(JSON.stringify(raw),[operation]).error,/one authored section/);
});
test('semantic planner rejects prototype keys, oversized UTF-8 payloads and too many edits',()=>{
 const c=context(),source=JSON.stringify(fixture());
 for(const key of ['__proto__','constructor','prototype'])assert.match(c.planWorkbenchAgentOperations(source,JSON.parse('[{"op":"updateNode","sectionId":"journey","nodeId":"service","patch":{"'+key+'":{"polluted":true}}}]')).error,/Unsafe/);
 assert.match(c.planWorkbenchAgentOperations(source,Array(101).fill(operation)).error,/1–100/);
 assert.match(c.planWorkbenchAgentOperations(source,[{...operation,patch:{label:'🧑'.repeat(300000)}}]).error,/1 MiB/);
 assert.equal({}.polluted,undefined);
});
test('bare diagrams use explicit root and dry run does not mutate history; stale apply is rejected',()=>{
 const c=context();let source=JSON.stringify(fixture().page.blocks[0].diagram),writes=0;
 const e=c.createWorkbenchAgentExchange({clientId:'a',snapshot:()=>({source,project:1,open:true}),busy:()=>false,apply(text){source=text;writes++;return {ok:true};}});
 let sent=e.request(),proposal={id:'dry',baseRevision:sent.snapshot.revision,operations:[{...operation,sectionId:'$root'}],dryRun:true};
 e.receive({proposal},sent);assert.equal(e.request().result.status,'validated');assert.equal(writes,0);
 e.receive({acknowledged:'dry'},e.request());source=source+' ';
 e.receive({proposal:{...proposal,id:'old',dryRun:false}},e.request());assert.equal(e.request().result.status,'rejected');assert.equal(writes,0);
 sent=e.request();e.receive({proposal:{...proposal,id:'apply',baseRevision:sent.snapshot.revision,dryRun:false}},sent);assert.equal(e.request().result.status,'applied');assert.equal(writes,1);assert.equal(JSON.parse(source).nodes.service.label,'Checkout');
});
