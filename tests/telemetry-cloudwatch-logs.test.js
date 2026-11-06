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
 const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools}],callTool:async(server,tool,input,options)=>{calls.push({tool,input:plain(input),signal:options?.signal});if(tool==='query_cloudwatch')return {payload:{timestamps:[1793827860000],values:[37],statistics:{sum:37}}};return answer(input);}})}});
 const carriers=fn=>C.sectionRecords(p).forEach(r=>{Object.entries(r.section.diagram.nodes).forEach(([id,n])=>fn(n,id,p));r.section.diagram.edges.forEach(e=>fn(e,e.from+'->'+e.to,p));});
 const api=C.createTelemetry(p,adapter.options,{carriers}),handle=adapter.attach({telemetry:api},p);await settle();return {C,p,calls,api,close(){handle.destroy();api.destroy();}};
}
const ids=['local','local->queue','shared::api','shared::api->shared::store'];
test('recorded Logs rows read exact first named numeric cell on local/imported nodes and edges; independent accounts and scope',async t=>{
 const h=await setup();t.after(()=>h.close());const before=JSON.stringify(h.p);h.api.setEnabled(true);await settle();
 assert.equal(h.calls.length,8);const q=h.calls.find(c=>c.tool==='query_cloudwatch_logs').input;
 assert.deepEqual(q,{datasourceUid:'cw-monitor',region:'us-east-1',logGroups:['arn:aws:logs:us-east-1:646998985045:log-group:AWSIotLogsV2'],queryString:logs().query,start:'now-24h',end:'now',limit:100});
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
test('all five CloudWatch statistics use sole observation, never misleading outer summaries; non-Sum multiple periods unobserved',()=>{
 const C=context();for(const statistic of ['Sum','Maximum','Minimum','Average','SampleCount']){
  assert.ok(C.telemetryCloudwatchQuery({...metric(),statistic}));assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1793827860000],values:['12.5'],statistics:{count:1,sum:999,avg:777}},statistic).value,12.5);
  if(statistic!=='Sum')assert.equal(C.telemetryGrafanaCloudwatch({timestamps:[1,2],values:[12,15],statistics:{sum:27,count:2}},statistic),null);
 }
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
