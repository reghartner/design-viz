'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
function harness(){const c={URL,TextEncoder};vm.createContext(c);vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/document.js','workbench/commands/detail-mapping.js','workbench/commands/extraction.js','workbench/session.js']),c);return c;}
const plain=x=>JSON.parse(JSON.stringify(x));
const spec=(id,sections)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections}});
function fixture(nested=false){
 const base=spec('base',[{id:'main',diagram:{nodes:{a:{title:'A',tickets:['AA-1']},b:{title:'B'},c:{title:'C'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',tickets:['AA-2']}],topologyExports:{all:{nodes:['a','b','c'],edges:['a->b']}}}}]);
 const middle=spec('middle',[{id:'main',diagram:{topologyImports:[{spec:'base',export:'all',as:'inner'}],topologyExports:{all:{nodes:['inner::a','inner::b','inner::c'],edges:['inner::a->inner::b']}}}}]);
 const relative=nested?'inner::':'';
 const consumer=spec('consumer',[{id:'main',diagram:{nodes:{local:{title:'Local'},outside:{title:'Outside'}},rows:[['local','outside']],edges:[{from:'outside',to:'shared::'+relative+'a'},{from:'local',to:'shared::'+relative+'a'}],steps:[{id:'inside',edge:'shared::'+relative+'a->shared::'+relative+'b'},{id:'visit',nodes:['shared::'+relative+'a']}],topologyImports:[{spec:nested?'middle':'base',export:'all',as:'shared',position:{x:400,y:200},nodeOverrides:{[relative+'a']:{title:'Consumer A'}},nodeTracking:{[relative+'b']:{missingWork:true}}}]}},{id:'detail',detailOnly:true,diagram:{nodes:{start:{title:'Start'}},rows:[['start']],steps:[{id:'start',nodes:['start']}]}}]);
 return {base,middle,consumer,relative,context:{version:1,id:'consumer',specs:[base,middle,consumer]}};
}
function resolved(c,raw,context){return c.FlowTopology.resolveSource(raw,context);}
function validate(c,context){return raw=>c.validate(c.normalize(resolved(c,raw,context)));}
function extract(c,f,ids){return c.planExtractIndependentDiagram(JSON.stringify(f.consumer,null,2),f.consumer,0,ids,{mode:'local',title:'Domain'},validate(c,f.context),f.context);}
for(const nested of [false,true])test('domain extraction preserves '+(nested?'nested':'direct')+' references, mixed local nodes and consumer annotations',()=>{
 const c=harness(),f=fixture(nested),prefix='shared::'+f.relative,original=JSON.stringify(f.context),p=extract(c,f,['local',prefix+'a',prefix+'b',prefix+'c']);assert.equal(p.error,undefined,p.error);
 const raw=JSON.parse(p.text),parent=raw.page.sections[0].diagram,child=raw.page.sections[2].diagram;
 assert.equal(parent.topologyImports,undefined);assert.deepEqual(child.topologyImports,f.consumer.page.sections[0].diagram.topologyImports);
 assert.deepEqual(Object.keys(child.nodes),['local']);assert.equal(child.topologyProvenance,undefined);assert.equal(parent.topologyProvenance,undefined);
 assert.equal(parent.edges[0].to,'domain1');assert.equal(parent.steps[0].edge,undefined);assert.deepEqual(parent.steps[0].nodes,['domain1']);
 const result=resolved(c,raw,f.context);assert.equal(result.page.sections[2].diagram.nodes[prefix+'a'].title,'Consumer A');assert.equal(result.page.sections[2].diagram.nodes[prefix+'b'].missingWork,true);assert.equal(JSON.stringify(f.context),original);
 assert.deepEqual(plain(validate(c,f.context)(raw).errors),[]);
});
test('closed subset splits imports and annotations without flattening; provider crossing and exports reject atomically',()=>{
 const c=harness(),f=fixture(),before=JSON.stringify(f.consumer),p=extract(c,f,['shared::a','shared::b']);assert.equal(p.error,undefined,p.error);
 const raw=JSON.parse(p.text),parent=raw.page.sections[0].diagram,child=raw.page.sections[2].diagram;
 assert.deepEqual(parent.topologyImports[0].nodes,['c']);assert.equal(parent.topologyImports[0].nodeOverrides,undefined);assert.deepEqual(child.topologyImports[0].nodes,['a','b']);assert.deepEqual(child.topologyImports[0].edges,['a->b']);
 assert.equal(JSON.stringify(f.consumer),before);assert.match(extract(c,f,['local','shared::a']).error,/Provider-owned boundary.*shared::a->shared::b.*both endpoints/);
 f.consumer.page.sections[0].diagram.topologyExports={public:{nodes:['shared::a'],edges:[]}};assert.match(extract(c,f,['shared::a','shared::b']).error,/shared topology exports: public/);
});
for(const nested of [false,true])test('imported '+(nested?'nested':'direct')+' detail create, assign, suppress, restore, mapping and extraction stay consumer-owned',()=>{
 const c=harness(),f=fixture(nested),id='shared::'+f.relative+'a',before=JSON.stringify(f.consumer,null,2),provider=JSON.stringify(f.base);
 let p=c.planCreateNodeDetail(before,f.consumer,0,id,f.context);assert.equal(p.error,undefined,p.error);let raw=JSON.parse(p.text);assert.equal(raw.page.sections.length,3);assert.equal(raw.page.sections[0].diagram.nodes[id],undefined);
 const detail={section:'detail',mode:'focus',stepMap:{visit:{step:'start'}}};p=c.planSetNodeDetail(p.text,raw,0,id,detail,f.context);assert.equal(p.error,undefined,p.error);raw=JSON.parse(p.text);
 const mapping=c.planDetailMapping(p.text,raw,{kind:'node',section:0,id},{action:'remove',key:'visit'},JSON.stringify(detail),f.context);assert.equal(mapping.error,undefined,mapping.error);
 assert.equal(JSON.parse(mapping.text).page.sections[0].diagram.topologyImports[0].nodeDetails[f.relative+'a'].stepMap,undefined);
 f.consumer=raw;const move=extract(c,f,[id,'shared::'+f.relative+'b']);assert.equal(move.error,undefined,move.error);const moved=JSON.parse(move.text).page.sections[3].diagram.topologyImports[0].nodeDetails[f.relative+'a'];assert.equal(moved.section,'detail');assert.equal(moved.stepMap,undefined);
 p=c.planSetNodeDetail(p.text,raw,0,id,null,f.context);assert.equal(p.error,undefined,p.error);raw=JSON.parse(p.text);assert.equal(raw.page.sections[0].diagram.topologyImports[0].nodeDetails[f.relative+'a'],null);
 p=c.planSetNodeDetail(p.text,raw,0,id,null,f.context,true);assert.equal(p.error,undefined,p.error);assert.equal(JSON.parse(p.text).page.sections[0].diagram.topologyImports[0].nodeDetails,undefined);assert.equal(JSON.stringify(f.base),provider);
});
test('imported detail honors inherited target identity, suppression, handoff exclusivity and dangling validation',()=>{
 const c=harness(),f=fixture();f.context.specs=[f.base,f.consumer];f.consumer.page.sections.push({id:'inner',detailOnly:true,diagram:{nodes:{x:{}},rows:[['x']]}});f.base.page.sections.push({id:'inner',detailOnly:true,diagram:{nodes:{x:{}},rows:[['x']]}});f.base.page.sections[0].diagram.nodes.a.detail={section:'inner',mode:'focus'};
 let node=resolved(c,f.consumer,f.context).page.sections[0].diagram.nodes['shared::a'];assert.deepEqual(plain(node.detail),{section:'inner',mode:'focus'});
 let p=c.planSetNodeDetail(JSON.stringify(f.consumer),f.consumer,0,'shared::a',null,f.context);assert.equal(p.error,undefined,p.error);assert.equal(resolved(c,JSON.parse(p.text),f.context).page.sections[0].diagram.nodes['shared::a'].detail,undefined);
 assert.match(c.planSetNodeDetail(JSON.stringify(f.consumer),f.consumer,0,'shared::a',{section:'nope',mode:'focus'},f.context).error,/does not exist/);
 delete f.base.page.sections[0].diagram.nodes.a.detail;f.base.page.sections[0].diagram.nodes.a.handoff={spec:'elsewhere'};
 assert.match(c.planSetNodeDetail(JSON.stringify(f.consumer),f.consumer,0,'shared::a',{section:'detail',mode:'focus'},f.context).error,/handoff/);
});
test('nodeDetails shape and resolved detail validation reject malformed, unselected and dangling annotations',()=>{
 const c=harness();for(const value of [[],true,{a:[]},{a:'detail'},{a:{section:'gone',mode:'focus'}},{gone:null}]){const f=fixture();f.consumer.page.sections[0].diagram.topologyImports[0].nodeDetails=value;assert.throws(()=>resolved(c,f.consumer,f.context),/nodeDetails|missing detail/);}
});
test('imported detail create is a single exact Undo/Redo transaction',()=>{
 const c=harness(),f=fixture(true);let text=JSON.stringify(f.consumer,null,2);const before=text;const session=c.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){},persistence:{read:()=>({}),preserve(){},cancel(){},save(){}}});session.replaceProject(text,null,{topologyContext:f.context});
 const snap=session.snapshot(),p=c.planCreateNodeDetail(text,snap.raw,0,'shared::inner::a',f.context);assert.equal(p.error,undefined,p.error);assert.equal(session.accept(p,{snapshot:snap}),true);const after=text;session.undo();assert.equal(text,before);session.redo();assert.equal(text,after);
});
test('whole imported grouped block keeps provider groups in the child without a dangling parent group',()=>{
 const c=harness(),f=fixture();f.base.page.sections[0].diagram.groups={services:{title:'Services'}};Object.values(f.base.page.sections[0].diagram.nodes).forEach(n=>n.group='services');
 const p=extract(c,f,['shared::a','shared::b','shared::c']);assert.equal(p.error,undefined,p.error);const raw=JSON.parse(p.text);assert.equal(raw.page.sections[0].diagram.nodes.domain1.group,undefined);assert.equal(resolved(c,raw,f.context).page.sections[2].diagram.nodes['shared::a'].group,'shared::services');
});
test('section rename and deletion rewrite imported detail annotation atomically',()=>{
 const c=harness(),f=fixture();f.consumer.page.sections[0].diagram.topologyImports[0].nodeDetails={a:{section:'detail',mode:'focus'}};
 const text=JSON.stringify(f.consumer),renamed=c.planSetSectionIdentity(text,f.consumer,1,'id','renamed');assert.equal(renamed.error,undefined,renamed.error);let raw=JSON.parse(renamed.text);assert.equal(raw.page.sections[0].diagram.topologyImports[0].nodeDetails.a.section,'renamed');
 const removed=c.planDeleteSection(renamed.text,raw,1);assert.equal(removed.error,undefined,removed.error);raw=JSON.parse(removed.text);assert.equal(raw.page.sections[0].diagram.topologyImports[0].nodeDetails.a,null);assert.equal(resolved(c,raw,f.context).page.sections[0].diagram.nodes['shared::a'].detail,undefined);
});
test('legacy inherited details remain consumer-local with unchanged mappings and ports',()=>{
 const c=harness(),f=fixture(),detail={section:'inner',mode:'focus',step:'start',stepMap:{visit:{step:'start'}},ports:{in:'start',out:'start'}};
 f.context.specs=[f.base,f.consumer];f.base.page.sections[0].diagram.nodes.a.detail=plain(detail);
 // Both documents deliberately use the same identity with different content.
 f.base.page.sections.push({id:'inner',detailOnly:true,diagram:{nodes:{start:{title:'Provider detail'}},rows:[['start']],steps:[{id:'start',nodes:['start']}]}});
 f.consumer.page.sections.push({id:'inner',detailOnly:true,diagram:{nodes:{start:{title:'Consumer detail'}},rows:[['start']],steps:[{id:'start',nodes:['start']}]}});
 f.base.page.sections[0].diagram.steps=[{id:'visit',nodes:['a']}];
 const result=resolved(c,f.consumer,f.context),node=result.page.sections[0].diagram.nodes['shared::a'];assert.deepEqual(plain(node.detail),detail);
 assert.equal(c.detailTarget(c.normalize(result),node.detail).section.diagram.nodes.start.title,'Consumer detail');assert.deepEqual(plain(validate(c,f.context)(f.consumer).errors),[]);
 // An unrelated explicit annotation must not rewrite an inherited declaration.
 f.consumer.page.sections[0].diagram.topologyImports[0].nodeDetails={b:{section:'detail',mode:'focus'}};
 const annotated=resolved(c,f.consumer,f.context);assert.deepEqual(plain(annotated.page.sections[0].diagram.nodes['shared::a'].detail),detail);assert.deepEqual(plain(validate(c,f.context)(f.consumer).errors),[]);
});
