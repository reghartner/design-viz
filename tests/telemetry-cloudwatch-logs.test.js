'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint,readSource}=require('../tools/source-loader.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<18;i++)await new Promise(setImmediate);};
function context(){const C={URL,AbortController,TextDecoder,TextEncoder,console,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
const logs=()=>({logGroups:['arn:aws:logs:us-east-1:${iotAccount}:log-group:AWSIotLogsV2'],query:'filter eventType = "Publish-In" and status = "Failure" and reason = "AUTHORIZATION_FAILURE" and topicName = "$aws/rules/camera_message_power_state" | stats count() as n',region:'us-east-1',valueField:'n'});
const metric=()=>({namespace:'AWS/SQS',metric:'NumberOfMessagesSent',dimensions:{QueueName:'camera_$env'},accountId:'${queueAccount}',region:'us-east-1',statistic:'Sum'});
const binding=()=>({kind:'call',signals:{rate:{cloudwatchLogs:logs(),unit:'refused publishes',scope:'topic $aws/rules/camera_message_power_state · account ${iotAccount}'},sent:{cloudwatch:metric()}}});
function page(C){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'IoT',telemetry:binding()},store:{}},rows:[['api','store']],edges:[{from:'api',to:'store',telemetry:binding()}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{local:{telemetry:binding()},queue:{}},rows:[['local','queue']],edges:[{from:'local',to:'queue',telemetry:binding()}],topologyImports:[{spec:'provider',export:'core',as:'shared'}]},{tracking:{telemetry:{grafana:{cloudwatch:'cw-monitor'},environment:'stg',environments:{qa:{variables:{iotAccount:'QA_TEST_IOT',queueAccount:'QA_TEST_QUEUE'}},stg:{variables:{iotAccount:'646998985045',queueAccount:'551960222585'}},prd:{variables:{iotAccount:'139648982912',queueAccount:'PRD_TEST_QUEUE'}}}}}});
 return C.normalize(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]}));
}
async function setup({answer=()=>({payload:{logs:[{n:'15'}],totalFound:900,status:'Complete'}}),tools=['query_cloudwatch_logs','query_cloudwatch'],edit}={}){
 const C=context(),p=page(C),calls=[];if(edit)edit(p);
 const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools}],callTool:async(server,tool,input,options)=>{calls.push({tool,input:plain(input),signal:options?.signal});if(tool==='query_cloudwatch')return {payload:{timestamps:[Date.parse(input.end)-3600000],values:[37],statistics:{sum:37}}};if(input.limit===1000)return {payload:{status:'Complete',logs:[],totalFound:0}};return answer(input);}})}});
 const carriers=fn=>C.sectionRecords(p).forEach(r=>{Object.entries(r.section.diagram.nodes).forEach(([id,n])=>fn(n,id,p));r.section.diagram.edges.forEach(e=>fn(e,e.from+'->'+e.to,p));});
 const api=C.createTelemetry(p,adapter.options,{carriers}),handle=adapter.attach({telemetry:api},p);await settle();return {C,p,calls,api,close(){handle.destroy();api.destroy();}};
}
const ids=['local','local->queue','shared::api','shared::api->shared::store'];
test('recorded Logs rows read exact first named numeric cell on local/imported nodes and edges; independent accounts and scope',async t=>{
 const h=await setup();t.after(()=>h.close());const before=JSON.stringify(h.p);h.api.setEnabled(true);await settle();
 assert.equal(h.calls.length,12);const q=h.calls.find(c=>c.tool==='query_cloudwatch_logs').input;
 assert.equal(Date.parse(q.end)-Date.parse(q.start),86400000);assert.deepEqual(q,{datasourceUid:'cw-monitor',region:'us-east-1',logGroups:['arn:aws:logs:us-east-1:646998985045:log-group:AWSIotLogsV2'],queryString:logs().query,start:q.start,end:q.end,limit:100});
 assert.ok(h.calls.filter(c=>c.tool==='query_cloudwatch').every(c=>c.input.accountId==='551960222585'));
 for(const id of ids){assert.equal(h.api.snapshot().map[id].signals.rate.value,15);const b=h.api.bindings().find(b=>b.id===id);assert.match(h.C.telemetrySignalScope(b.signals.rate),/646998985045/);assert.match(h.C.telemetrySignalScope(b.signals.sent),/queue only: camera_stg.*551960222585/);}
 assert.equal(JSON.stringify(h.p),before);
});
test('empty Complete is zero; running, failed, missing field, malformed, permission and timeout never keep old success',async t=>{
 let payload={logs:[{n:'15'}],totalFound:100,status:'Complete'};const h=await setup({answer:()=>{if(payload.throw)throw payload.throw;return payload.wrapper || {payload};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();
 for(const valid of [{logs:[{n:'0'}],totalFound:77,status:'Complete'},{logs:[],totalFound:0,status:'Complete',hints:['Try another time range']}]){payload=valid;h.api.retry();await settle();assert.equal(h.api.snapshot().map.local.signals.rate.value,0);assert.equal(h.api.status().note,'');}
 for(const bad of [{status:'Running',logs:[],totalFound:0},{status:'Failed',logs:[]},{status:'Timeout',logs:[]},{status:'Complete',logs:[{wrong:'19'}],totalFound:19},{status:'Complete',logs:[{n:'NaN'}]},{status:'Complete',logs:[]},{status:'Complete',logs:null},{throw:{code:'tool_error',message:'Log group not found\nCheck account'}},{throw:{code:'upstream_error',message:'query timeout'}},{throw:{code:'not_in_manifest'}},{wrapper:{payload:{isError:true,content:[{type:'text',text:'AccessDenied: permission missing'}]}}}]){
   payload={logs:[{n:'15'}],totalFound:999,status:'Complete'};h.api.retry();await settle();assert.equal(h.api.snapshot().map.local.signals.rate.value,15);
   payload=bad;h.api.retry();await settle();assert.equal(h.api.snapshot().map.local.signals.rate,undefined,JSON.stringify(bad));assert.equal(h.api.snapshot().map.local.signals.sent.value,37);assert.ok(h.api.status().note);assert.doesNotMatch(h.api.status().note,/\n/);
 }
});
test('payload, nested structuredContent and raw MCP text wrappers preserve first-column semantics and never scan for a number',()=>{
 const C=context(),data={status:'Complete',logs:[{n:'15',other:'999'}],totalFound:999};
 for(const wrapped of [{payload:data},{structuredContent:data},{payload:{structuredContent:data}},{content:[{type:'text',text:JSON.stringify(data)}]}])assert.equal(C.telemetryGrafanaCloudwatchLogs(C.telemetryGrafanaPayload(wrapped),{}),15);
 assert.throws(()=>C.telemetryGrafanaCloudwatchLogs({status:'Complete',logs:[{message:'hello',n:'15'}],totalFound:15},{}),/./);
 assert.equal(C.telemetryGrafanaCloudwatchLogs({status:'Complete',logs:[{message:'hello',n:'15'}]}, {valueField:'n'}),15);
});
test('all five CloudWatch statistics ignore misleading outer summaries; Average requires matching sample weights',()=>{
 const C=context();for(const statistic of ['Sum','Maximum','Minimum','Average','SampleCount']){
  assert.ok(C.telemetryCloudwatchQuery({...metric(),statistic}));assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1793827860000],values:['12.5'],statistics:{count:1,sum:999,avg:777}},statistic,{timestamps:[1793827860000],values:[0.5]}).value,12.5);
 }
 assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1,2],values:[12,15]},'Average'),null);
});
test('partial connector availability keeps supported CloudWatch healthy; missing named variable blocks only affected signal',async t=>{
 const h=await setup({tools:['query_cloudwatch']});t.after(()=>h.close());assert.equal(h.api.snapshot().available,true);h.api.setEnabled(true);await settle();assert.ok(h.calls.every(c=>c.tool==='query_cloudwatch'));assert.match(h.api.status().note,/query_cloudwatch_logs/);assert.equal(h.api.snapshot().map.local.signals.sent.value,37);
 const bad=await setup({edit:p=>delete p.tracking.telemetry.environments.stg.variables.iotAccount});t.after(()=>bad.close());bad.api.setEnabled(true);await settle();assert.ok(bad.calls.every(c=>c.tool==='query_cloudwatch'));assert.match(bad.api.status().note,/iotAccount/);assert.equal(bad.api.snapshot().map.local.signals.sent.value,37);
});
test('qa/stg/prd change both accounts, clear old values, reject delayed old Logs answers without mutating source',async t=>{
 let hold=true;const oldResolvers=[];const h=await setup({answer:input=>hold?new Promise(resolve=>{oldResolvers.push(resolve);}):{payload:{status:'Complete',logs:[{n:'2'}],totalFound:2}}});t.after(()=>h.close());const before=JSON.stringify(h.p);h.api.setEnabled(true);await settle();const old=h.calls[0].signal;hold=false;
 for(const [env,iot,queue] of [['prd','139648982912','PRD_TEST_QUEUE'],['qa','QA_TEST_IOT','QA_TEST_QUEUE'],['stg','646998985045','551960222585']]){h.api.setEnvironment(env);assert.deepEqual(plain(h.api.snapshot().map),{});const n=h.calls.length;await settle();assert.ok(h.calls.slice(n).filter(c=>c.tool==='query_cloudwatch_logs').every(c=>c.input.logGroups[0].includes(iot)));assert.ok(h.calls.slice(n).filter(c=>c.tool==='query_cloudwatch').every(c=>c.input.accountId===queue));for(const id of ids)assert.equal(h.api.snapshot().map[id].signals.rate.value,2);}
 assert.equal(old.aborted,true);oldResolvers.forEach(resolve=>resolve({payload:{status:'Complete',logs:[{n:'999'}],totalFound:999}}));await settle();assert.equal(h.api.snapshot().map.local.signals.rate.value,2);assert.equal(JSON.stringify(h.p),before);
});
test('named variables resolve all signal strings once, template params win, undefined vars are errors, and provider tokens/prototypes are preserved safely',()=>{
 const C=context(),p={tracking:{telemetry:{variables:{iotAccount:'shared',literal:'${notExpanded} $env',region:'us-east-1'},grafana:{accountId:'default'},environment:'stg',environments:{stg:{variables:{iotAccount:'646998985045',queueAccount:'551960222585'}}}}}},config=C.telemetryEnvironmentConfig(p),raw={telemetry:{kind:'service',signals:{prom:{grafana:'up{account="${iotAccount}"}[$__interval]'},logs:{cloudwatchLogs:logs()},metric:{cloudwatch:metric()},honey:{honeycomb:{filters:[{column:'account',value:'${queueAccount}'}]}},tempo:{tempo:'{resource.account="${iotAccount}"}'},literal:{grafana:'${literal}'},missing:{grafana:'${unknown}'},default:{grafana:'$account $env'}}}};
 const before=JSON.stringify(raw),b=C.carrierTelemetry(raw,{},null,config);assert.equal(b.signals.prom.query,'up{account="646998985045"}[$__interval]');assert.equal(b.signals.honey.query.filters[0].value,'551960222585');assert.equal(b.signals.tempo.query,'{resource.account="646998985045"}');assert.equal(b.signals.literal.query,'${notExpanded} $env');assert.equal(b.signals.literal.error,undefined);assert.match(b.signals.missing.error,/unknown/);assert.equal(b.signals.default.query,'default stg');assert.equal(JSON.stringify(raw),before);
 const templates={x:{kind:'service',params:['iotAccount'],signals:{rate:{grafana:'${iotAccount} ${queueAccount}'}}}};assert.equal(C.carrierTelemetry({telemetry:{use:'x',iotAccount:'explicit'}},templates,null,config).signals.rate.query,'explicit 551960222585');
 const poison=JSON.parse('{"__proto__":{"polluted":true},"constructor":"bad","env":"bad"}'),warnings=[];C.trackingTelemetry({tracking:{telemetry:{variables:poison}}},(a,m)=>warnings.push(m));assert.equal(warnings.length,3);assert.equal({}.polluted,undefined);
});
test('conservative scope covers rule, queue and whole-account IoT failures, never guesses Logs query or edge title',()=>{
 const C=context(),signal=(metric,dimensions)=>({source:'cloudwatch',query:{namespace:'AWS/IoT',metric,dimensions,accountId:'646998985045'}});
 assert.match(C.telemetrySignalScope(signal('TopicMatch',{RuleName:'one'})),/this rule only: one/);assert.match(C.telemetrySignalScope(signal('PublishIn.AuthError',{Protocol:'MQTT'})),/all topics \/ whole account/);assert.match(C.telemetrySignalScope(signal('Connect.AuthError',{})),/all connections \/ whole account/);assert.equal(C.telemetrySignalScope(signal('PublishIn.AuthError',{TopicName:'maybe'})),'');assert.equal(C.telemetrySignalScope({source:'cloudwatchLogs',query:logs()}),'');
 vm.runInNewContext(readSource('workbench/commands/telemetry.js'),C);assert.deepEqual(plain(C.telemetryQueryValue('cloudwatchLogs',JSON.stringify(logs())).value),logs());
 const changed=C.telemetryEditBinding(binding(),{op:'signal',name:'rate',field:'query',value:JSON.stringify({...logs(),valueField:'total'})},{});assert.equal(changed.value.signals.rate.scope,binding().signals.rate.scope);assert.equal(changed.value.signals.rate.cloudwatchLogs.valueField,'total');
});

test('loaded detail pages use consumer variables and account defaults while retaining their own templates',()=>{
 const C=context(),root={tracking:{telemetry:{variables:{iotAccount:'consumer'},grafana:{accountId:'default'},environment:'stg',environments:{stg:{}}}}},detail={tracking:{telemetry:{templates:{x:{kind:'service',params:[],signals:{rate:{grafana:'${iotAccount} $account $env'}}}}}}},carrier={telemetry:{use:'x'}};
 const api=C.createTelemetry(root,{provider:()=>({})},{carriers:fn=>fn(carrier,'detail',detail)});assert.equal(api.bindings()[0].signals.rate.query,'consumer default stg');assert.equal(api.snapshot().carriers[0].signals.rate.query,'consumer default stg');api.destroy();
});

test('scalar display primary does not turn refused-publish counts into traffic animation',()=>{const C=context(),raw=binding();raw.signals.refused=raw.signals.rate;delete raw.signals.rate;delete raw.signals.sent;const b=C.carrierTelemetry({telemetry:raw});assert.equal(C.telemetryPrimary(b),null);assert.equal(C.telemetryPrimary(b,true),'refused');assert.match(C.telemetryCardContent({from:'device',to:'iot'},b,{signals:{refused:{value:15}}},{telemetry:'flowing'},'24h').headline,/15 refused publishes in 24h/);});

test('CloudWatch statistic string can be a named variable in authored templates and resolves before calls',()=>{const C=context(),raw={telemetry:{kind:'service',signals:{count:{cloudwatch:{...metric(),statistic:'${stat}'}}}}};assert.ok(C.carrierTelemetry(raw));const b=C.carrierTelemetry(raw,{},null,{variables:{stat:'SampleCount',queueAccount:'queue'},environment:'qa'});assert.equal(b.signals.count.query.statistic,'SampleCount');assert.equal(b.signals.count.error,undefined);});

test('real local and imported template parameters resolve profile refs in the same final pass, with literal variable values',()=>{
 const C=context();
 const template={kind:'service',params:['iotAccount'],signals:{refused:{cloudwatchLogs:logs(),scope:'account ${iotAccount}'}}};
 const spec=(id,diagram,tracking)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},tracking,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{telemetry:{use:'counts',iotAccount:'${queueAccount}'}}},rows:[['api']],topologyExports:{core:{nodes:['api'],edges:[]}}},{telemetry:{templates:{counts:template}}});
 const consumer=spec('consumer',{nodes:{local:{telemetry:{use:'counts',iotAccount:'${queueAccount}'}}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared'}]},{telemetry:{templates:{counts:template},variables:{iotAccount:'default-account',queueAccount:'${literalAccount}'},environment:'stg',environments:{stg:{}}}});
 const before=JSON.stringify([provider,consumer]),p=C.normalize(C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})),d=p.sections[0].diagram,config=C.telemetryEnvironmentConfig(p);
 const bindings=C.telemetryBindings(fn=>{for(const [id,node] of Object.entries(d.nodes))fn(node,id,p);},'stg',config);
 assert.equal(bindings.length,2);for(const b of bindings){assert.equal(b.signals.refused.query.logGroups[0],'arn:aws:logs:us-east-1:${literalAccount}:log-group:AWSIotLogsV2');assert.equal(b.signals.refused.scope,'account ${literalAccount}');assert.equal(b.signals.refused.error,undefined);}
 assert.deepEqual(plain(bindings[0].signals),plain(bindings[1].signals));assert.equal(JSON.stringify([provider,consumer]),before);
 assert.equal(C.carrierTelemetry({telemetry:{use:'counts',iotAccount:'explicit-account'}},{counts:template},null,config).signals.refused.scope,'account explicit-account');
});
test('environment variables require braces and cannot rewrite literal AWS/provider-owned tokens',()=>{
 const C=context(),b=C.carrierTelemetry({telemetry:{kind:'service',signals:{refused:{cloudwatchLogs:logs()},prom:{grafana:'$aws ${aws} $interval ${interval} $__interval $__rate_interval $env $account'}}}},{},null,{variables:{aws:'collision',interval:'5m',iotAccount:'123'},environment:'stg',grafana:{accountId:'456'}});
 assert.equal(b.signals.refused.query.query,logs().query);assert.equal(b.signals.prom.query,'$aws collision $interval 5m $__interval $__rate_interval stg 456');assert.equal(b.signals.prom.error,undefined);
 const template={kind:'service',params:['aws'],signals:{count:{grafana:'$aws ${aws}'}}};assert.equal(C.carrierTelemetry({telemetry:{use:'x',aws:'template-value'}},{x:template},null,{variables:{aws:'environment-value'}}).signals.count.query,'template-value template-value');
});
test('no supported CloudWatch tools leaves Metrics unavailable with a one-line actionable Logs diagnostic',async t=>{const h=await setup({tools:[]});t.after(()=>h.close());assert.equal(h.api.snapshot().available,false);assert.match(h.api.status().note,/Grafana needs connector tools:.*query_cloudwatch_logs/);assert.doesNotMatch(h.api.status().note,/\n/);h.api.setEnabled(true);await settle();assert.equal(h.calls.length,0);assert.deepEqual(plain(h.api.snapshot().map),{});});


const breakdown=()=>({query:logs().query.replace('stats count() as n','stats count() as n, latest(reason) as sampleReason by clientId | sort n desc | limit 20'),labelField:'clientId',valueField:'n',title:'Devices',labelTitle:'Client ID',valueTitle:'Failures',columns:[{field:'sampleReason',label:'Latest reason'}],limit:20});
function withDetails(page){function visit(v){if(!v || typeof v!=='object')return;if(v.cloudwatchLogs)v.cloudwatchLogs.breakdown=breakdown();Object.values(v).forEach(visit);}visit(page);}
const detailsRows=()=>[{clientId:'cam-123',n:'12',sampleReason:'AUTHORIZATION_FAILURE'},{clientId:'cam-456',n:'2',sampleReason:'<img src=x onerror=alert(1)>'}];
const grouped=input=>typeof input.queryString==='string' && input.queryString.includes('by clientId');
test('paired Logs queries preserve scalar15 beside grouped12+2, share an anchored range, and expose all local/imported carriers',async t=>{
 const h=await setup({edit:p=>{withDetails(p);p.tracking.telemetry.window='now-6h';},answer:input=>({payload:{status:'Complete',logs:grouped(input)?detailsRows():[{n:'15'}],totalFound:99999}})});t.after(()=>h.close());h.api.setEnabled(true);await settle();
 const calls=h.calls.filter(c=>c.tool==='query_cloudwatch_logs');assert.equal(calls.length,12);
 const ranges=new Set(calls.map(c=>JSON.stringify([c.input.start,c.input.end])));assert.equal(ranges.size,1);assert.equal(Date.parse(calls[0].input.end)-Date.parse(calls[0].input.start),6*3600000);
 assert.ok(calls.every(c=>c.input.logGroups[0].includes('646998985045')));assert.equal(calls.filter(c=>grouped(c.input)).every(c=>c.input.limit===20),true);
 for(const id of ids){const entry=h.api.snapshot().map[id].signals.rate;assert.equal(entry.value,15);assert.deepEqual(plain(entry.breakdown.rows),[{label:'cam-123',value:12,cells:['AUTHORIZATION_FAILURE']},{label:'cam-456',value:2,cells:['<img src=x onerror=alert(1)>']}]);assert.equal(entry.breakdown.returnedRows,2);assert.equal(entry.breakdown.limit,20);}
 const model=h.C.liveStatusLogDetails(h.api.snapshot());assert.deepEqual(plain(model.map(x=>x.id)).sort(),ids.slice().sort());assert.ok(model.every(x=>x.total.includes('15') && x.config.title==='Devices'));
 h.api.setEnabled(false);assert.deepEqual(plain(h.C.liveStatusLogDetails(h.api.snapshot())),[]);
});
test('detail empty is complete; malformed/error rows replace old details without erasing scalar or unrelated metrics',async t=>{
 let result={status:'Complete',logs:detailsRows(),totalFound:999};const h=await setup({edit:withDetails,answer:input=>{if(!grouped(input))return {payload:{status:'Complete',logs:[{n:'15'}]}};if(result.throw)throw result.throw;return {structuredContent:result};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();
 for(const bad of [{status:'Running',logs:[]},{status:'Complete',logs:[{n:'12'}]},{status:'Complete',logs:[{clientId:'cam'}]},{status:'Complete',logs:[{clientId:'cam',n:'NaN'}]},{status:'Complete',logs:[{clientId:'cam',n:'-1'}]},{status:'Complete',logs:[{clientId:'cam',n:'Infinity'}]},{status:'Complete',logs:[{clientId:'cam',n:'1',sampleReason:{html:'oops'}}]},{throw:{code:'tool_error',message:'Permission denied\nReconnect'}},{throw:{code:'upstream_error',message:'Timeout'}}]){
   result=bad;h.api.retry();await settle();const entry=h.api.snapshot().map.local.signals.rate;assert.equal(entry.value,15);assert.equal(entry.breakdown.status,'error');assert.equal(entry.breakdown.rows,undefined);assert.doesNotMatch(entry.breakdown.error,/\n/);assert.equal(h.api.snapshot().map.local.signals.sent.value,37);
 }
 result={status:'Complete',logs:[],totalFound:123};h.api.retry();await settle();const entry=h.api.snapshot().map.local.signals.rate;assert.equal(entry.value,15);assert.equal(entry.breakdown.status,'complete');assert.deepEqual(plain(entry.breakdown.rows),[]);assert.equal(entry.breakdown.returnedRows,0);
 result={status:'Complete',logs:[{clientId:'cam',n:'0'}]};h.api.retry();await settle();assert.deepEqual(plain(h.api.snapshot().map.local.signals.rate.breakdown.rows),[{label:'cam',value:0,cells:['(missing)']}]);
});
test('detail contracts cap rows, columns and text, preserve literal HTML and reject malformed host samples',()=>{
 const C=context(),config=breakdown(),range={from:'2026-11-05T00:00:00Z',to:'2026-11-06T00:00:00Z'},rows=Array.from({length:120},(_,i)=>({clientId:'cam-'+i,n:'0',sampleReason:'<b>'+ 'x'.repeat(800)}));
 const d=C.telemetryGrafanaLogDetails({status:'Complete',logs:rows,totalFound:900000},config,range);assert.equal(d.rows.length,20);assert.equal(d.returnedRows,120);assert.equal(d.rows[0].cells[0].length,500);assert.match(d.rows[0].cells[0],/^<b>/);assert.equal(d.textTruncated,true);
 const n={URL,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,document:{addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('native').source,n);
 const sample=raw=>n.telemetrySample({signals:{refused:{value:15,breakdown:raw}}}).signals.refused;
 assert.equal(sample(d).breakdown.rows.length,20);assert.equal(sample({...d,rows:[{label:'',value:1,cells:[]}]}).breakdown.status,'error');assert.equal(sample({...d,rows:[{label:'cam',value:-1,cells:[]}]}).value,15);assert.equal(sample({...d,range:{}}).breakdown.status,'error');
 assert.equal(sample({...d,rows:[{label:'cam',value:1,cells:Array(5).fill('x')}]}).breakdown.status,'error');
 for(const bad of [{...config,limit:101},{...config,limit:0},{...config,columns:Array(5).fill({field:'x',label:'X'})},{...config,labelField:''},{...config,valueField:undefined},{...config,title:'x'.repeat(81)}])assert.equal(C.telemetryCloudwatchLogsQuery({...logs(),breakdown:bad}),false);
 assert.equal(C.telemetryCloudwatchLogsQuery({...logs(),breakdown:{query:'stats count() as n by clientId',labelField:'clientId',valueField:'n'}}),true);
});
test('scalar failure skips details and no prior grouped observation survives',async t=>{
 let bad=false;const h=await setup({edit:withDetails,answer:input=>{if(bad)throw {code:'tool_error',message:'scalar failed'};return {payload:{status:'Complete',logs:grouped(input)?detailsRows():[{n:'15'}]}};}});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.ok(h.api.snapshot().map.local.signals.rate.breakdown);const count=h.calls.length;bad=true;h.api.retry();await settle();assert.equal(h.api.snapshot().map.local.signals.rate,undefined);assert.ok(h.calls.slice(count).filter(c=>c.tool==='query_cloudwatch_logs').every(c=>!grouped(c.input)));
});
test('late grouped responses cannot cross environment switches, Metrics off, destroy or sibling controllers',async t=>{
 for(const action of ['environment','disable','destroy']){
  let held=true;const pending=[];const h=await setup({edit:withDetails,answer:input=>grouped(input)&&held?new Promise(resolve=>pending.push(resolve)):{payload:{status:'Complete',logs:grouped(input)?[{clientId:'new',n:'2'}]:[{n:'15'}]}}});t.after(()=>h.close());h.api.setEnabled(true);await settle();assert.ok(pending.length);const oldSignal=h.calls[0].signal;held=false;
  if(action==='environment')h.api.setEnvironment('prd');else if(action==='disable')h.api.setEnabled(false);else h.close();await settle();assert.equal(oldSignal.aborted,true);
  const before=JSON.stringify(h.api.snapshot().map);pending.forEach(resolve=>resolve({payload:{status:'Complete',logs:[{clientId:'OLD',n:'999'}]}}));await settle();assert.equal(JSON.stringify(h.api.snapshot().map),before);assert.ok(!before.includes('OLD'));
  if(action==='environment'){assert.equal(h.api.snapshot().map.local.signals.rate.breakdown.rows[0].label,'new');assert.ok(h.calls.filter(c=>c.signal!==oldSignal&&grouped(c.input)).every(c=>c.input.logGroups[0].includes('139648982912')));}
 }
 const a=await setup({edit:withDetails}),b=await setup({edit:withDetails,answer:input=>({payload:{status:'Complete',logs:grouped(input)?detailsRows():[{n:'7'}]}})});t.after(()=>a.close());t.after(()=>b.close());a.api.setEnabled(true);b.api.setEnabled(true);await settle();a.api.setEnabled(false);assert.equal(b.api.snapshot().map.local.signals.rate.value,7);
});
test('breakdown strings use named variables and template pass; desktop editor preserves structured details',()=>{
 const C=context(),q={...logs(),breakdown:{...breakdown(),query:'filter account = "${iotAccount}" | stats count() as n by ${field}',labelField:'${field}',title:'Devices in $env'}};
 const template={kind:'service',params:['field'],signals:{refused:{cloudwatchLogs:q}}};
 const b=C.carrierTelemetry({telemetry:{use:'logs',field:'clientId'}},{logs:template},null,{environment:'stg',variables:{iotAccount:'123'}});
 assert.equal(b.signals.refused.query.breakdown.query,'filter account = "123" | stats count() as n by clientId');assert.equal(b.signals.refused.query.breakdown.labelField,'clientId');assert.equal(b.signals.refused.query.breakdown.title,'Devices in stg');
 vm.runInNewContext(readSource('workbench/commands/telemetry.js'),C);assert.deepEqual(plain(C.telemetryQueryValue('cloudwatchLogs',JSON.stringify(q)).value),q);
});


test('missing breakdown-only variables preserve totals across local/imported environment switches; shared and scalar failures still block calls',async t=>{
 const edit=p=>{withDetails(p);p.tracking.telemetry.environments.stg.variables.deviceFilter='camera';function visit(v){if(!v||typeof v!=='object')return;if(v.cloudwatchLogs)v.cloudwatchLogs.breakdown.query='filter deviceType = "${deviceFilter}" | '+v.cloudwatchLogs.breakdown.query;Object.values(v).forEach(visit);}visit(p);};
 const answer=input=>({payload:{status:'Complete',logs:grouped(input)?detailsRows():[{n:'15'}]}});
 const h=await setup({edit,answer});t.after(()=>h.close());const before=JSON.stringify(h.p);h.api.setEnabled(true);await settle();
 for(const id of ids)assert.equal(h.api.snapshot().map[id].signals.rate.breakdown.status,'complete');
 const count=h.calls.length;h.api.setEnvironment('prd');assert.deepEqual(plain(h.api.snapshot().map),{});await settle();
 const fresh=h.calls.slice(count).filter(c=>c.tool==='query_cloudwatch_logs');assert.equal(fresh.length,8);assert.ok(fresh.every(c=>!grouped(c.input)&&c.input.logGroups[0].includes('139648982912')));
 for(const id of ids){const sample=h.api.snapshot().map[id].signals.rate,b=h.api.bindings().find(b=>b.id===id).signals.rate;assert.equal(sample.value,15);assert.equal(sample.breakdown.status,'error');assert.match(sample.breakdown.error,/deviceFilter/);assert.equal(sample.breakdown.rows,undefined);assert.equal(b.error,undefined);assert.match(b.breakdownError,/deviceFilter/);}
 assert.ok(h.C.liveStatusLogDetails(h.api.snapshot()).every(row=>row.total.includes('15')&&row.details.error.includes('deviceFilter')));
 h.api.setEnvironment('stg');await settle();for(const id of ids)assert.equal(h.api.snapshot().map[id].signals.rate.breakdown.status,'complete');assert.equal(JSON.stringify(h.p),before);
 for(const shared of [false,true]){const blocked=await setup({answer,edit:p=>{edit(p);if(shared)delete p.tracking.telemetry.environments.stg.variables.iotAccount;else {function visit(v){if(!v||typeof v!=='object')return;if(v.cloudwatchLogs)v.cloudwatchLogs.query+=' | filter x = "${scalarFilter}"';Object.values(v).forEach(visit);}visit(p);}}});t.after(()=>blocked.close());blocked.api.setEnabled(true);await settle();assert.ok(blocked.calls.every(c=>c.tool!=='query_cloudwatch_logs'));assert.match(blocked.api.status().note,shared?/iotAccount/:/scalarFilter/);}
});
