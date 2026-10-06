'use strict';
// Fictional, deterministic scenarios. No observations here are human votes.
const {entrypoint}=require('../source-loader.cjs');
const vm=require('node:vm');
const GROUPS=[
 ['residential','Resident',['Visitor arrival','Overnight battery','Resident clip review','Shared-entry delivery'],['homemap','screen','phone','battery','deviceapp','appscreens'],[3,5,6,4]],
 ['security','Monitoring operator',['Perimeter intrusion','Alarm assessment','Responder handoff','Multi-zone evacuation'],['radar','security','dispatch','zoneframe'],[3,4,6,5]],
 ['video','Video engineer',['Clip buffering','Upload backlog','Retention failure','Camera reconnect storm'],['screen','buffer','inflight','log'],[2,4,7,6]],
 ['ingestion','Data engineer',['Queue drain','Replica recovery','Batch validation','Schema migration backlog'],['queue','replicas','table','checks'],[2,5,8,4]],
 ['api','Service engineer',['Single request trace','Latency breakdown','Contract mismatch','Cross-region retry'],['trace','waterfall','data-contract','timeline'],[1,4,6,5]],
 ['health','Field technician',['Temperature alert','Weak link','Fleet power issue','Remote sensor maintenance'],['thermo','signal','gauge','battery','leds'],[1,3,7,4]],
 ['capacity','Platform owner',['Route comparison','Monthly budget','Quota exhaustion','Seasonal traffic forecast'],['cost','budget','gauge','table'],[2,3,5,6]],
 ['warehouse','Shift supervisor',['Dock status','Conveyor incident','Picking progress','Night-shift dispatch'],['homemap','state','tiles','dispatch'],[2,4,6,7]],
 ['hardware','Firmware engineer',['Packet decryption','Radio state','Encrypted telemetry fault','Firmware rollout fault'],['xray','leds','signal','buffer'],[1,4,8,3]],
 ['distributed','Site reliability engineer',['Cluster membership','Replication lag','In-flight fanout','Region recovery'],['orbit','inflight','replicas','timeline'],[2,5,7,8]],
 ['experience','Support specialist',['Screen transition','Delivery notification','Image inspection','Support escalation'],['appscreens','image','phone','deviceapp'],[1,3,5,4]],
 ['overview','Operations lead',['Service readiness','Release outcome','Operational summary','Acquisition integration'],['checks','cost','table','state','tiles'],[2,4,8,6]]
];
const GOALS={
 residential:['Decide whether to answer the visitor or review the recorded arrival first.','Determine whether overnight battery loss comes from weak connectivity or sustained recording.','Confirm the requested clip reached the resident and is still available for replay.','Verify the courier reached the shared entrance and the resident received the delivery alert.'],
 security:['Distinguish a confirmed perimeter crossing from a motion-only alarm before dispatch.','Check the alarm evidence and responder availability before escalating.','Give the responding unit the location, current threat state and operator evidence.','Prioritize occupied zones and verify the evacuation response is coordinated.'],
 video:['Locate where the current video clip is waiting before it can be played.','Decide whether to add upload capacity or wait for the backlog to drain.','Identify which retained clips were lost and which storage operation failed.','Separate connectivity failures from buffering pressure during camera reconnection.'],
 ingestion:['Confirm queued events can drain without exhausting downstream capacity.','Verify follower positions are safe before recovering the replica set.','Find failed validation checks and decide whether the batch can be released.','Assess whether the schema rollout can continue while old events remain queued.'],
 api:['Locate the slow operation on a single request before investigating dependencies.','Compare end-to-end latency with its budget and identify the largest contributor.','Identify the contract field that prevents the request from reaching storage.','Check whether retry timing prevents duplicate writes during regional recovery.'],
 health:['Decide whether the temperature reading requires throttling or a site visit.','Determine whether weak signal strength explains the delayed sensor updates.','Find whether battery depletion or excessive traffic is driving the fleet incident.','Verify power, connectivity and sensor readings before closing the maintenance visit.'],
 capacity:['Compare delivery routes at the same monthly traffic volume and identify the economical option.','Check whether current latency, traffic and operating cost fit the planned budget.','Identify which service is nearest its quota before allocating additional capacity.','Estimate whether seasonal traffic will exceed the current cost and capacity envelope.'],
 warehouse:['Confirm the receiving dock is ready for the next inbound shipment.','Locate the stopped conveyor and decide whether dispatch needs to intervene.','Find the picking stage that is holding orders before the shift handoff.','Match open incidents with available response units during the night shift.'],
 hardware:['Identify which packet layer remains sealed and whether this gateway can read the payload.','Distinguish radio-link failure from a device state transition.','Determine whether connectivity or packet-layer access prevents telemetry delivery.','Identify which firmware rollout step failed before attempting a rollback.'],
 distributed:['Verify cluster membership is complete before enabling traffic.','Compare replication positions and identify the lagging follower.','Follow outstanding fanout work and identify the dependency blocking completion.','Confirm restored replicas and event delivery are consistent before regional failback.'],
 experience:['Check that the customer sees the expected screen after completing the workflow.','Verify the delivery notification matches the recorded event and displayed image.','Compare the retained reference image with the evidence shown on the customer device.','Collect the device state and notification history needed to resolve the escalation.'],
 overview:['Decide whether readiness checks and projected cost permit the service launch.','Assess the release outcome using operating cost, observed results and live state.','Prioritize the operating issue that needs attention at the daily review.','Compare inherited service states and outstanding checks before integration cutover.']
};
function graph(shape,domain){
 const rows=[[[0,1,2]],[[0],[1,2],[3,4],[5]],[[0],[1,2,3],[4,5,6],[7]],[[0,1,2],[3,4,5],[6,7,8],[9,10,11]]][shape];
 const names=['Ingress','Validate','Authorize','Queue','Enrich','Process','Store','Replicate','Deliver','Observe','Audit','Archive'];
 const nodes=Object.fromEntries(rows.flat().map(i=>['n'+i,{title:names[i],sub:domain}]));
 const links=[[[0,1],[1,2]],[[0,1],[0,2],[1,3],[2,4],[3,5],[4,5]],[[0,1],[0,2],[0,3],[1,4],[2,5],[3,6],[4,7],[5,7],[6,7]],[[0,1],[1,2],[0,3],[1,4],[2,5],[3,6],[4,7],[5,8],[6,9],[7,10],[8,11],[9,10],[10,11]]][shape];
 return {nodes,rows:rows.map(r=>r.map(i=>'n'+i)),edges:links.map(([a,b])=>({from:'n'+a,to:'n'+b}))};
}
const clone=v=>JSON.parse(JSON.stringify(v));
function engine(){const C={URL};vm.runInNewContext(entrypoint('workbench').body,C,{timeout:10000});return C;}
function scenarios(){const out=[];for(let variant=0;variant<4;variant++)GROUPS.forEach(([domain,audience,names,types,counts],g)=>{
 const count=counts[variant],width=[800,1000,1440][(g+variant)%3],profile=['default','backstage','confluence'][(g+variant*2)%3];
 out.push({id:domain+'-'+(variant+1),title:names[variant],domain,audience,goal:GOALS[domain][variant],graphShape:(g+variant)%4,split:variant===3?'holdout':'review',batch:variant===3?4:1+(variant+[1,0,2,1,0,2,1,0,2,0,2,1][g])%3,panelTypes:Array.from({length:count},(_,i)=>types[(i+variant)%types.length]),panelCount:count,density:['compact','detailed','dense'][(Math.floor(g/3)+variant)%3],graphRole:['diagram-dominant','panel-dominant','hidden'][(Math.floor(g/4)+variant)%3],host:{profile,width},snapshot:5});
 });return out;}
function panel(C,type,id,s,index,referenceImage){
 const sample=C.panelPickerExample(type,{referenceImage}),p=clone(sample.panel);p.id=id;
 p.title=s.title+' · '+C.PanelRegistry.get(type).label+(index>=s.panelTypes.indexOf(type)+1?' '+(index+1):'');
 // Give each example domain context and concrete data rather than empty defaults.
 const n=s.density==='dense'?6:s.density==='detailed'?4:2,tag=s.domain.toUpperCase();
 if(type==='log')p.initial.log=Array.from({length:n},(_,i)=>({tag:'NET',text:`09:${String(31+i).padStart(2,'0')} · ${s.title}: ${['accepted','queued','validated','processed','stored','acknowledged'][i]}`}));
 if(type==='data-contract'){p.fieldWidth=105;p.columns=[{id:'type',label:'Type',width:75},{id:'example',label:'Example',width:115}];p.fields=[{id:'event-id',label:'event_id',cells:{type:'string',example:'evt_2048'}},{id:'status',label:'status',cells:{type:'enum',example:'accepted'}},{id:'latency',label:'latency_ms',cells:{type:'integer',example:'186'}}];p.initial={highlights:{status:{color:'amber',label:'Expected enum'}}};}
 if(type==='table'){p.columns=[{id:'key',label:'Checkpoint'},{id:'value',label:'Observation'}];p.initial.rows=Array.from({length:n},(_,i)=>({id:'r'+i,cells:{key:['Ingress','Processing','Storage','Delivery','Retry','Audit'][i],value:[s.title,'186 ms','3 replicas','Acknowledged','No backlog','09:36 UTC'][i]},status:i===1?'changed':'neutral'}));}
 if(type==='checks'){p.checks=Array.from({length:n},(_,i)=>({id:'c'+i,label:['Identity verified','Request is unique','Capacity available','Record persisted','Delivery acknowledged','Audit trail complete'][i]}));p.initial.results=Object.fromEntries(p.checks.map((c,i)=>[c.id,{status:i===n-1?'pending':'pass'}]));}
 if(type==='xray'){p.layers=[{id:'transport',label:'Transport encryption',holder:'Edge gateway'},{id:'message',label:'Message encryption',holder:'Destination service'}];p.initial={layers:[{id:'transport',open:true},{id:'message',open:false}],hop:'edge gateway'};}
 if(type==='state'){p.states=['WAITING','PROCESSING','READY'];p.initial={state:'READY'};}
 if(type==='orbit'){p.states=['JOINING','HEALTHY','DRAINING'];p.initial={state:'HEALTHY',via:'Membership confirmed at 09:36'};}
 if(type==='gauge'){p.unit='req/s';p.max=1000;p.initial.value=420+index*35;}
 if(type==='battery'){p.initial={charge:34+index*7,source:'solar',trend:'charging'};}
 if(type==='thermo'){p.initial.value=48+index*3;}
 if(type==='queue'){p.initial={state:'held',label:s.domain+'.accepted',reason:'Waiting for the next available worker'};}
 if(type==='budget'){p.metrics=[{id:'latency',label:'Response latency',unit:'ms',max:300,warn:240},{id:'memory',label:'Working memory',unit:'MB',max:512,warn:440}];p.initial={values:{latency:186,memory:368},note:s.title+' · current planning envelope'};}
 if(type==='cost'){p.assumptions='Fictional monthly planning rates. Includes request and delivery operations; excludes tax, storage and engineering labor.';p.initial.messages=[1200000,8000000,18000000][index%3];}
 if(type==='tiles'){p.tiles=Array.from({length:n},(_,i)=>({id:'unit'+i,label:tag+' '+(i+1)}));p.initial=Object.fromEntries(p.tiles.map((t,i)=>[t.id,{state:i===1?'RETRY':'ONLINE',sub:i===1?'Reconnecting':'Last report 09:36'}]));}
 if(type==='phone'){p.initial.notify=[{app:'Operations',title:s.title,text:'Review the new observation · 09:36'}];}
 if(type==='deviceapp'){p.appName='Field Operations';p.device=s.title;p.initial.notify={app:'Operations',title:'New observation',text:s.title};}
 if(type==='image'){p.alt='Illustrative '+s.title.toLowerCase()+' operations reference';p.caption='Fictional reference · '+s.title;}
 if(type==='appscreens'){p.screens[0].label=s.title;p.screens[0].alt='Illustrative operations screen';}
 if(type==='dispatch'){p.agency='Regional operations desk';p.initial.incident=s.title;p.initial.location='West site · access gate';p.initial.detail='Primary unit is responding; a second unit remains available.';}
 if(type==='security'){p.site='West site';p.initial.incident=s.title;p.initial.detail='Operator is reviewing the recorded event before escalation.';p.initial.siren='off';}
 if(type==='replicas'){p.initial.reference.series=s.domain+'/events';Object.values(p.initial.replicas).forEach(r=>{r.series=s.domain+'/events';r.observedAt='09:36 UTC';});p.initial.note='Observed positions at the same checkpoint; follower lag is reported independently.';}
 if(type==='screen'){p.initial.siren='off';p.initial.audio={connection:'connected',microphone:'muted',output:'silent'};}
 return p;
}
function specification(C,s,referenceImage){
 const panels=s.panelTypes.map((type,i)=>panel(C,type,'p'+i,s,i,referenceImage));
 const topology=graph(s.graphShape,s.domain);
 const steps=Array.from({length:6},(_,i)=>({id:'checkpoint-'+i,text:[`Begin ${s.title.toLowerCase()}.`,'Accept the observation.','Validate the request.','Process the event.','Persist the result.','Current checkpoint: review the evidence and choose the next action.'][i],nodes:Object.keys(topology.nodes),panels:{}}));
 panels.filter(p=>p.type==='inflight').forEach(p=>{steps[0].panels[p.id]={start:[{lane:'request',label:s.title}]};steps[1].panels[p.id]={start:[{lane:'query',label:'Read current state'}]};steps[3].panels[p.id]={end:['query'],start:[{lane:'event',label:'Publish observation'}]};steps[5].panels[p.id]={end:['request']};});
 return {page:{title:s.title,skin:'pastel',sections:[{id:s.id,heading:s.audience+' view',text:s.goal,diagram:{view:'step',autoplay:false,...topology,panels,steps,layouts:[{id:'comparison',name:'Review',sectionLayout:{columns:24,default:[]}}],defaultLayout:'comparison'}}]}};
}
module.exports={GROUPS,graph,scenarios,engine,specification,clone};
