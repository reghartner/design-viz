'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const B=require('./workbench-command-context.cjs')(['graph','document','narrative','layout']);
for(const file of ['canon.js','workbench/commands/extraction.js','workbench/session.js'])vm.runInContext(readSource(file),B);
const plain=value=>JSON.parse(JSON.stringify(value));
const codeRef={id:'orders.process',repository:'https://github.example/team/orders.git',revision:'a'.repeat(40),path:'src/orders.js',startLine:2,endLine:8,anchor:{start:'begin',end:'end'}};
const diagram=(raw,index=0)=>B.specValueAt(raw,B.specSectionPaths(raw)[index].diagram);
const section=(raw,index)=>B.specValueAt(raw,B.specSectionPaths(raw)[index].section);
const edgeKey=edge=>edge.from+'->'+edge.to;
const flatRows=d=>(d.rows || []).flat(2);
function valid(raw){
  const result=plain(B.validate(B.normalize(raw)));
  assert.deepEqual(result.errors,[],result.errors.join('\n'));
  assert.deepEqual(result.warnings,[],result.warnings.join('\n'));
}
function fixture(){
  return {page:{title:'Orders overview',protocols:{orders:{label:'Order event',color:'#38bdf8'}},lanes:{request:{label:'Request',color:'#38bdf8'}},blocks:[
    {id:'overview',heading:'Overview',text:'Keep the authored explanation.',diagram:{
      nodes:{client:{title:'Client'},accept:{title:'Accept order',group:'orders',link:'https://docs.example/orders',codeRefs:[codeRef]},store:{title:'Persist order',group:'orders'},audit:{title:'Audit'}},
      groups:{orders:{title:'Orders',parent:'company'},company:{title:'Company'}},
      rows:[['client','accept','store','audit']],
      edges:[{from:'client',to:'accept',kind:'https',label:'submit'},{from:'accept',to:'store',kind:'orders',label:'persist',revealAt:2,hideAt:4},{from:'store',to:'audit',kind:'mqtt',label:'audit'}],
      panels:[{id:'queue',type:'queue',initial:{state:'empty'}},{id:'app',type:'deviceapp',device:'Order app',sources:[{id:'orders',label:'Orders',node:'accept'}],fields:[{id:'status',label:'Status',kind:'text',source:'orders'}],initial:{status:{value:'idle',status:'ready'}}}],
      view:'step',autoplay:false,primaryPanel:'app',centerpiece:'app',sectionLayout:{default:[{x:0,y:0,w:8,h:10},{panel:'app',x:8,y:0,w:4,h:10},{panel:'queue',x:0,y:10,w:12,h:5}]},
      layouts:[{id:'outage',name:'Outage',steps:['failed'],sectionLayout:{default:[{x:0,y:0,w:12,h:10},{panel:'app',x:0,y:10,w:8,h:8},{panel:'queue',x:8,y:10,w:4,h:8}]}}],defaultLayout:'outage',
      steps:[
        {id:'request',edge:'client->accept',text:'The customer submits an order.',lane:'request',codeRefs:[codeRef],panels:{app:{status:{value:'received'}}}},
        {id:'persist',edge:'accept->store',nodes:['store'],text:'Persist the order.',tone:{accept:'ok',client:'dim'},traceMatch:{serviceName:'orders',operation:'persist',nodeId:'store'},panels:{queue:{state:'enqueue',label:'order'}}},
        {id:'failed',failures:{'accept->store':'blocked','store->audit':'dropped'},packets:[{edge:'accept->store'},{edge:'store->audit'}],text:'The database rejects this write.',conditions:[{kind:'service-error',label:'Storage unavailable',nodeId:'store'}],panels:{app:{status:{value:'failed',status:'stale'}}}},
        {id:'audit',edge:'store->audit',text:'Record the result.'},
        {id:'unchanged',nodes:['client'],text:'A separate note.',tone:{client:'base'}}
      ],
      paths:[{id:'success',label:'Success',steps:['request','persist','audit','unchanged']},{id:'outage',label:'Outage',steps:['request','failed','unchanged']}]
    }},
    {tabs:[{label:'Notes',sections:[{id:'notes',heading:'Notes',text:'Exact unrelated source remains here.'}]}]}
  ]}};
}
function extract(raw,ids=['accept','store'],options={mode:'local',title:'Orders'},text=JSON.stringify(raw,null,2)){
  const before=JSON.stringify(raw),given=JSON.stringify(options),selected=JSON.stringify(ids);
  const plan=B.planExtractIndependentDiagram(text,raw,0,ids,options);
  assert.equal(plan.error,undefined,plan.error);
  assert.equal(JSON.stringify(raw),before,'input spec stays immutable');
  assert.equal(JSON.stringify(options),given,'options stay immutable');
  assert.equal(JSON.stringify(ids),selected,'selection stays immutable');
  const next=JSON.parse(plan.text);valid(next);
  assert.equal(plan.kind,'node');assert.equal(plan.section,0);
  assert.ok(Object.hasOwn(diagram(next).nodes,plan.id));
  assert.deepEqual(JSON.parse(plan.text.slice(plan.start,plan.end)),diagram(next).nodes[plan.id]);
  return {plan,next,parent:diagram(next)};
}
function childOf(result){return diagram(result.next,result.plan.detailSection);}
function noInheritedStory(child){
  assert.equal((child.steps || []).length,0);
  for(const field of ['paths','panels','primaryPanel','centerpiece','layouts','defaultLayout','sectionLayout','routing'])
    assert.equal(child[field],undefined,'child must not inherit '+field);
}
function sessionFor(initial){
  let text=initial,renders=0;
  const session=B.createBuilderSession({source:{read:()=>text,write:value=>text=value},render(){renders++;},persistence:{read:()=>({}),save(){}}});
  return {session,get text(){return text;},set text(value){text=value;},get renders(){return renders;}};
}

test('local extraction keeps parent story identity, panels and presentations while creating an independent detail',()=>{
  const raw=fixture();valid(raw);
  const result=extract(raw),{plan,parent,next}=result,child=childOf(result),before=diagram(raw);
  assert.equal(plan.report.movedNodes,2);assert.equal(plan.report.internalEdges,1);
  assert.deepEqual(Object.keys(child.nodes).sort(),['accept','store']);
  assert.deepEqual(child.nodes,before.nodes && {accept:before.nodes.accept,store:before.nodes.store});
  assert.deepEqual(child.groups,before.groups);noInheritedStory(child);
  assert.deepEqual(child.edges.map(edgeKey),['accept->store']);
  assert.equal(child.edges[0].kind,'orders');assert.equal(child.edges[0].label,'persist');
  assert.equal(child.edges[0].revealAt,undefined);assert.equal(child.edges[0].hideAt,undefined);
  assert.equal(section(next,plan.detailSection).detailOnly,true);
  assert.deepEqual(parent.nodes[plan.id].detail,{section:plan.sectionId,mode:'focus'});
  for(const field of ['paths','view','autoplay','primaryPanel','centerpiece','sectionLayout','layouts','defaultLayout'])assert.deepEqual(parent[field],before[field]);
  assert.deepEqual(parent.panels[0],before.panels[0]);
  assert.deepEqual(parent.panels[1],{...before.panels[1],sources:[{...before.panels[1].sources[0],node:plan.id}]});
  assert.deepEqual(parent.steps.map(step=>step.id),before.steps.map(step=>step.id));
  parent.steps.forEach((step,index)=>{
    for(const field of ['text','codeRefs','lane','panels'])assert.deepEqual(step[field],before.steps[index][field]);
  });
  assert.deepEqual(parent.steps.at(-1),before.steps.at(-1));
  assert.deepEqual(next.page.blocks[1],raw.page.blocks[1]);
  assert.deepEqual(plain(plan.report.affectedSteps).sort(),['audit','failed','persist','request']);
  assert.equal(plan.report.boundaryEdges.length,2);
  for(const key of ['client->accept','store->audit'])assert.ok(plan.report.boundaryEdges.some(item=>item.includes(key)));
});

test('internal playback refs become domain focus and explicit failure evidence without inventing child state',()=>{
  const {plan,parent,next}=extract(fixture()),id=plan.id;
  assert.equal(parent.steps[1].edge,undefined);assert.equal(parent.steps[1].edges,undefined);
  assert.ok(parent.steps[1].nodes.includes(id));assert.deepEqual(parent.steps[1].tone,{client:'dim'});
  assert.equal(parent.steps[1].traceMatch.nodeId,id);
  assert.equal(parent.steps[2].conditions[0].nodeId,id);
  const failure=parent.steps[2].conditions.find(condition=>condition.kind==='delivery-failed');
  assert.ok(failure,'internal failure remains visible as runtime evidence');assert.equal(failure.nodeId,id);
  assert.match(failure.label,/accept.*store/i);assert.match(failure.label,/blocked/i);
  assert.deepEqual(parent.steps[2].failures,{[id+'->audit']:'dropped'});
  assert.deepEqual(parent.steps[2].packets,[{edge:id+'->audit'}]);
  assert.ok(parent.steps[2].nodes.includes(id));
  for(const step of parent.steps){
    assert.ok(!(step.nodes || []).some(node=>['accept','store'].includes(node)));
    assert.ok(!Object.keys(step.tone || {}).some(node=>['accept','store',id].includes(node)));
  }
  assert.match(plan.report.notes.join(' '),/tone/i);
  noInheritedStory(diagram(next,plan.detailSection));
});

test('multiple ingress and egress collisions retain distinct protocols, failures and packet identities',()=>{
  const raw=fixture(),d=diagram(raw);
  d.edges=[{from:'client',to:'accept',kind:'https',label:'submit'},{from:'client',to:'store',kind:'mqtt',label:'retry'},
    {from:'accept',to:'store',kind:'orders',label:'persist'},
    {from:'accept',to:'audit',kind:'https',label:'attempt'},{from:'store',to:'audit',kind:'mqtt',label:'commit'}];
  d.steps=[{id:'fanout',edges:['client->accept','client->store'],failures:{'client->store':'dropped'},packets:[{edge:'client->accept'},{edge:'client->store'}],text:'First arrives; second drops.'},
    {id:'fanback',edges:['accept->audit','store->audit'],failures:{'accept->audit':'blocked'},text:'Only the commit arrives.'}];
  delete d.paths;delete d.layouts;delete d.defaultLayout;valid(raw);
  const {plan,parent}=extract(raw),keys=parent.edges.map(edgeKey);
  assert.equal(new Set(keys).size,keys.length,'boundary rewrites cannot merge distinct communication keys');
  const edge=label=>parent.edges.find(candidate=>candidate.label===label);
  for(const label of ['submit','retry','attempt','commit'])assert.ok(edge(label),label+' boundary edge survives');
  assert.equal(edge('submit').kind,'https');assert.equal(edge('retry').kind,'mqtt');
  assert.equal(edge('attempt').kind,'https');assert.equal(edge('commit').kind,'mqtt');
  assert.equal(edge('submit').from,'client');assert.equal(edge('retry').from,'client');
  assert.equal(edge('attempt').to,'audit');assert.equal(edge('commit').to,'audit');
  assert.notEqual(edgeKey(edge('submit')),edgeKey(edge('retry')));assert.notEqual(edgeKey(edge('attempt')),edgeKey(edge('commit')));
  assert.deepEqual(parent.steps[0].failures,{[edgeKey(edge('retry'))]:'dropped'});
  assert.deepEqual(parent.steps[1].failures,{[edgeKey(edge('attempt'))]:'blocked'});
  assert.deepEqual(parent.steps[0].packets.map(packet=>packet.edge),[edgeKey(edge('submit')),edgeKey(edge('retry'))]);
  assert.deepEqual(parent.steps[0].edges,[edgeKey(edge('submit')),edgeKey(edge('retry'))]);
  assert.deepEqual(parent.steps[1].edges,[edgeKey(edge('attempt')),edgeKey(edge('commit'))]);
  for(const label of ['submit','retry'])assert.ok(parent.edges.some(candidate=>candidate.from===edge(label).to && candidate.to===plan.id));
  for(const label of ['attempt','commit'])assert.ok(parent.edges.some(candidate=>candidate.from===plan.id && candidate.to===edge(label).from));
  for(const candidate of parent.edges)assert.ok(Object.hasOwn(parent.nodes,candidate.from) && Object.hasOwn(parent.nodes,candidate.to));
  for(const step of parent.steps)assert.ok(step.nodes.includes(plan.id));
  assert.equal(plan.report.boundaryEdges.length,4);
  for(const key of ['accept->audit','client->accept','client->store','store->audit'])assert.ok(plan.report.boundaryEdges.some(item=>item.includes(key)));
});

test('selected stacked and floating nodes remain placed without copying the parent canvas coordinates',()=>{
  const raw=fixture(),d=diagram(raw);
  d.rows=[['client',['accept','audit']]];d.floats=[{id:'store',side:'above',dx:37,dy:-12}];
  d.edges[1].bend={x:200,y:100};valid(raw);
  const result=extract(raw),child=childOf(result);
  assert.deepEqual([...flatRows(child),...(child.floats || []).map(item=>item.id)].sort(),['accept','store']);
  assert.ok(flatRows(result.parent).includes('client'));assert.ok(flatRows(result.parent).includes('audit'));
  assert.ok([...flatRows(result.parent),...(result.parent.floats || []).map(item=>item.id)].includes(result.plan.id));
  assert.equal(child.edges[0].bend,undefined);
  assert.ok(!(child.floats || []).some(item=>item.dx===37 && item.dy===-12),'child receives an independent placement');
  assert.ok(!(result.parent.floats || []).some(item=>item.id==='store'));
});

test('parent lane routing stays authored while the child starts with an independent layout',()=>{
  const raw=fixture(),d=diagram(raw);d.routing='lanes';valid(raw);
  const result=extract(raw);assert.equal(result.parent.routing,'lanes');noInheritedStory(childOf(result));
});

function nestedFixture(){
  const raw=fixture(),d=diagram(raw);
  d.nodes.accept.detail={section:'nested',mode:'focus',step:'start',path:'happy',ports:{in:'inner'},stepMap:{request:{step:'start'}}};
  raw.page.protocols.deep={label:'Nested service call',color:'#a78bfa'};
  raw.page.blocks[1].tabs[0].sections.push(
    {id:'nested',heading:'Nested processing',detailOnly:true,diagram:{nodes:{inner:{title:'Inner',detail:{section:'leaf',mode:'focus'}},done:{title:'Done'}},rows:[['inner','done']],edges:[{from:'inner',to:'done',kind:'deep'}],steps:[{id:'start',nodes:['inner'],text:'Start nested work'}],paths:[{id:'happy',steps:['start']}]}},
    {id:'leaf',heading:'Leaf detail',detailOnly:true,diagram:{nodes:{leaf:{title:'Leaf'}},rows:[['leaf']],edges:[]}}
  );
  return raw;
}

test('external extraction carries custom protocols and transitive nested details while preserving original sections',()=>{
  const raw=nestedFixture();valid(raw);
  const handoff={spec:'orders-flow',revision:'v7',section:'orders',url:'https://flows.example/orders#orders'};
  const {plan,parent,next}=extract(raw,['accept','store'],{mode:'external',title:'Orders',handoff});
  assert.deepEqual(parent.nodes[plan.id].handoff,handoff);assert.equal(parent.nodes[plan.id].detail,undefined);
  assert.equal(plan.detailSection,undefined);assert.equal(B.specSectionPaths(next).length,B.specSectionPaths(raw).length);
  assert.deepEqual(next.page.blocks[1],raw.page.blocks[1]);
  const exported=plain(plan.childSpec);assert.ok(exported.page,'external payload is a complete page spec');valid(exported);
  const child=diagram(exported);noInheritedStory(child);
  assert.deepEqual(Object.keys(child.nodes).sort(),['accept','store']);
  assert.equal(child.nodes.accept.detail.stepMap,undefined);
  assert.equal(child.nodes.accept.detail.step,'start');assert.equal(child.nodes.accept.detail.path,'happy');
  const records=plain(B.sectionRecords(B.normalize(exported))),nested=records.find(record=>record.reference===child.nodes.accept.detail.section).section;
  assert.equal(nested.heading,'Nested processing');assert.equal(records.length,3);
  const leaf=records.find(record=>record.reference===nested.diagram.nodes.inner.detail.section).section;
  assert.equal(leaf.heading,'Leaf detail');assert.deepEqual(leaf.diagram,raw.page.blocks[1].tabs[0].sections[2].diagram);
  const expected=plain(raw.page.blocks[1].tabs[0].sections[1]);expected.id=nested.id;expected.diagram.nodes.inner.detail.section=leaf.id;
  assert.deepEqual(nested,expected);
  assert.deepEqual(exported.page.protocols.orders,raw.page.protocols.orders);assert.deepEqual(exported.page.protocols.deep,raw.page.protocols.deep);
});

test('URL-only and ID-only external destinations are accepted without requiring catalog registration',()=>{
  for(const handoff of [{url:'https://elsewhere.example/my-flow?mode=diagram#entry'},{spec:'team-custom-flow'}]){
    const {plan,parent}=extract(fixture(),['accept','store'],{mode:'external',handoff});
    for(const key of Object.keys(handoff))assert.equal(parent.nodes[plan.id].handoff[key],handoff[key]);
    if(handoff.spec)assert.equal(parent.nodes[plan.id].handoff.section,section(plain(plan.childSpec),0).id);
    valid(plain(plan.childSpec));
  }
});

test('one accepted extraction restores exact source through Undo and Redo and rejects a stale snapshot',()=>{
  const raw=fixture(),text=' \n'+JSON.stringify(raw,null,3).replace('Orders overview','Orders \\u006fverview')+'\n ',{plan}=extract(raw,undefined,undefined,text),h=sessionFor(text);
  const oldPath=['page','blocks',1],before=B.jsonLocate(text,oldPath),after=B.jsonLocate(plan.text,oldPath);
  assert.equal(text.slice(before.start,before.end),plan.text.slice(after.start,after.end));
  assert.ok(plan.text.startsWith(' \n'));assert.ok(plan.text.endsWith('\n '));assert.match(plan.text,/Orders \\u006fverview/);
  assert.equal(h.session.accept(plan,{snapshot:h.session.snapshot()}),true);assert.equal(h.renders,1);
  assert.equal(h.session.undo(),true);assert.equal(h.text,text);assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);assert.equal(h.text,plan.text);
  const stale=sessionFor(text),snapshot=stale.session.snapshot();stale.text=text+'\n';
  assert.equal(stale.session.accept(plan,{snapshot}),false);assert.equal(stale.text,text+'\n');assert.equal(stale.session.canUndo(),false);assert.equal(stale.renders,0);
});

test('invalid selections and unsafe handoffs reject atomically without creating an undo entry',()=>{
  const raw=fixture(),text=JSON.stringify(raw),h=sessionFor(text);
  for(const [index,ids,options] of [[0,[],{}],[0,['accept'],{}],[0,['accept','missing'],{}],[99,['accept','store'],{}],
    [0,['accept','store'],{mode:'external',handoff:{url:'javascript:alert(1)'}}],
    [0,['accept','store'],{mode:'external',handoff:{url:'https://user:secret@example.com/flow'}}],
    [0,['accept','store'],{mode:'external',handoff:{}}]]){
    const plan=B.planExtractIndependentDiagram(text,raw,index,ids,options);
    assert.ok(plan.error,JSON.stringify([index,ids,options]));assert.equal(plan.text,undefined);assert.equal(h.session.accept(plan),false);
  }
  assert.equal(JSON.stringify(raw),text);assert.equal(h.text,text);assert.equal(h.session.canUndo(),false);assert.equal(h.renders,0);
});

test('prototype-shaped node IDs remain own members throughout extraction',()=>{
  const raw={page:{sections:[{id:'source',diagram:{nodes:JSON.parse('{"outside":{"title":"Outside"},"__proto__":{"title":"Prototype node"},"constructor":{"title":"Constructor node"}}'),rows:[['outside','__proto__','constructor']],edges:[{from:'outside',to:'__proto__'},{from:'__proto__',to:'constructor'}],steps:[{id:'inside',edge:'__proto__->constructor',text:'Own node keys'}]}}]}};
  const result=extract(raw,['__proto__','constructor']),child=childOf(result);
  assert.ok(Object.hasOwn(child.nodes,'__proto__'));assert.ok(Object.hasOwn(child.nodes,'constructor'));
  assert.equal(child.nodes.__proto__.title,'Prototype node');assert.equal(child.nodes.constructor.title,'Constructor node');
  assert.equal(Object.getPrototypeOf(raw.page.sections[0].diagram.nodes),Object.prototype);
  assert.equal({}.title,undefined);assert.deepEqual(child.edges.map(edgeKey),['__proto__->constructor']);
});

test('lane routing stays active when multiple interface nodes would overflow the original row',()=>{
  const raw={page:{sections:[{id:'overview',diagram:{routing:'lanes',nodes:{client:{title:'Client'},a:{title:'A'},b:{title:'B'},c:{title:'C'},d:{title:'D'}},rows:[['client','a','b','c','d']],edges:['a','b','c','d'].map(to=>({from:'client',to})),steps:[{id:'send',edges:['a','b','c','d'].map(id=>'client->'+id),text:'Fan out.'}]}}]}};
  valid(raw);const result=extract(raw,['a','b','c','d']);
  assert.equal(result.parent.routing,'lanes');assert.ok(result.parent.rows.every(row=>row.length<=5 && row.every(slot=>typeof slot==='string')));
});

test('incoming detail ports retarget only their selected endpoints and keep parent step mappings',()=>{
  for(const mode of ['local','external']){
    const raw=fixture();raw.page.blocks[1].tabs[0].sections.push({id:'other-flow',heading:'Related story',diagram:{nodes:{overview:{title:'Orders overview',detail:{section:'overview',mode:'focus',ports:{in:'accept',out:'audit'},stepMap:{enter:{step:'request'}}}}},rows:[['overview']],edges:[],steps:[{id:'enter',nodes:['overview'],text:'Open overview'}]}});
    valid(raw);const old=plain(raw.page.blocks[1]),{plan,next}=extract(raw,['accept','store'],{mode,handoff:mode==='external'?{spec:'orders'}:undefined});
    old.tabs[0].sections[1].diagram.nodes.overview.detail.ports.in=plan.id;
    assert.deepEqual(next.page.blocks[1],old);
    assert.ok(plan.report.references.some(item=>item.includes('accept') && item.includes(plan.id)));
  }
});

test('nested numeric detail destinations stay canonical and self-contained in exported documents',()=>{
  const raw=nestedFixture();diagram(raw).nodes.accept.detail.section='3';
  raw.page.blocks[1].tabs[0].sections[1].diagram.nodes.inner.detail.section='4';valid(raw);
  const {plan}=extract(raw,['accept','store'],{mode:'external',handoff:{spec:'orders'}}),exported=plain(plan.childSpec);valid(exported);
  const records=plain(B.sectionRecords(B.normalize(exported))),ref=diagram(exported).nodes.accept.detail.section;
  const nested=records.find(record=>record.reference===ref).section;
  assert.equal(nested.heading,'Nested processing');assert.notEqual(ref,'3');
  assert.equal(records.find(record=>record.reference===nested.diagram.nodes.inner.detail.section).section.heading,'Leaf detail');
});

test('local nested details keep their entry point while dropping mappings from the old parent timeline',()=>{
  const raw=nestedFixture(),result=extract(raw),child=childOf(result),original=diagram(raw).nodes.accept.detail;
  assert.deepEqual(child.nodes.accept.detail,{section:original.section,mode:'focus',step:original.step,path:original.path,ports:original.ports});
  assert.deepEqual(result.next.page.blocks[1],raw.page.blocks[1]);
  assert.ok(result.plan.report.references.some(item=>item.includes('accept')));
});

test('legacy steps without IDs retain their identities and receive no synthesized child timeline',()=>{
  const raw=fixture(),d=diagram(raw);delete d.paths;delete d.layouts;delete d.defaultLayout;
  d.steps.forEach(step=>{delete step.id;delete step.traceMatch;delete step.codeRefs;});valid(raw);
  const result=extract(raw);
  assert.equal(result.parent.steps.length,d.steps.length);assert.ok(result.parent.steps.every(step=>!Object.hasOwn(step,'id')));
  assert.deepEqual(result.parent.steps.map(step=>step.text),d.steps.map(step=>step.text));
  noInheritedStory(childOf(result));
});
