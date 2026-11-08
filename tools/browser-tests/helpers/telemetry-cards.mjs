import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from './test.mjs';
import {repo} from './prepare.mjs';

const QUEUE=()=>({kind:'queue',signals:{lag:{grafana:'max(kafka_consumergroup_lag{topic="device-events"})',unit:'msgs'}},proof:{lag:{max:500}}});
const CALL=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(push_sent_total[5m]))*3600',unit:'req/h'},errors:{grafana:'sum(rate(push_failed_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:0.01}}});
const SERVICE=()=>({kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}});
const PANEL={id:'status',type:'live-status',title:'Status'};

const CUE_JIRA={'LOC-1':{state:'done'},'LOC-2':{state:'active'},'LOC-3':{state:'done'},'LOC-4':{state:'done'},'LOC-5':{state:'done'},'IMP-1':{state:'done'},'IMP-2':{state:'done'}};
const T1=Date.UTC(2026,10,3,9),T2=Date.UTC(2026,10,3,10);
const CUE_SAMPLES={ingest:{signals:{lag:{value:10}}},'ingest->app':{signals:{rate:{value:1300,series:[[T1,1200],[T2,1300]]},errors:{value:4}}},
 'app->push':{signals:{rate:{value:0,series:[[T1,0],[T2,0]]},errors:{value:0}}},'shared::api':{signals:{rate:{value:50,series:[[T1,40],[T2,50]]}}},
 'shared::api->shared::store':{signals:{rate:{value:500},errors:{value:1}}}};
const CUES='.dv-metrics-stream,.dv-metrics-ghost,.dv-metrics-node,[data-metrics-state]';
function cueSpec(edit){
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'Imported API'},store:{title:'Imported store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{nodes:{ingest:{title:'Ingest',tickets:['LOC-1'],telemetry:QUEUE()},app:{title:'Resident app',tickets:['LOC-2']},push:{title:'Push gateway'}},rows:[['ingest','app','push']],
  edges:[{from:'ingest',to:'app',label:'notify',tickets:['LOC-3'],telemetry:CALL()},{from:'app',to:'push',label:'push',tickets:['LOC-4'],telemetry:CALL()},{from:'ingest',to:'push',label:'fallback',tickets:['LOC-5']}],panels:[PANEL],
  steps:[{id:'notify',edge:'ingest->app',text:'Notify'},{id:'retry',edge:'app->push',failures:{'ingest->push':'dropped'},text:'Retry'}],
  topologyImports:[{spec:'provider',export:'core',as:'shared',position:{x:80,y:300},nodeTracking:{api:{tickets:['IMP-1'],telemetry:SERVICE()}},edgeTracking:{'api->store':{tickets:['IMP-2'],telemetry:CALL()}}}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 if(edit)edit(consumer.page.sections[0].diagram);
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
}
async function mountCues(page,server){
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'telemetry-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'telemetry-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./telemetry-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/telemetry-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({spec,jira,samples})=>{
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:()=>Promise.resolve(JSON.parse(JSON.stringify(samples)))}});
  window.viewer.controller.liveStatus.apply(jira);
 },{spec:cueSpec(),jira:CUE_JIRA,samples:CUE_SAMPLES});
 const root=page.locator('#host'),panel=root.locator('.pt-live-status');
 await expect(panel.getByRole('button',{name:'Live',exact:true})).toBeVisible();
 return {root,metrics:metricsButton(panel)};
}

function importedDetailSpec(){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'selected',heading:'Selected imported detail',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'Detail API'},store:{title:'Detail store'}},rows:[['api','store']],
  edges:[{from:'api',to:'store',label:'Persist'},{from:'store',to:'api',label:'Return'}],
  topologyExports:{core:{nodes:['api','store'],edges:['api->store','store->api']}}});
 const consumer=spec('detail-consumer',{nodes:{},rows:[[]],panels:[PANEL],topologyImports:[{spec:'provider',export:'core',as:'shared',
  nodeTracking:{api:{tickets:['IMP-1'],telemetry:SERVICE()}},
  edgeTracking:{'api->store':{tickets:['IMP-2'],telemetry:CALL()},'store->api':{tickets:['IMP-3'],telemetry:CALL()}}}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 const resolved=JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'detail-consumer',specs:[provider,consumer]})));
 resolved.page.sections.unshift({id:'decoy',heading:'Unselected detail',diagram:{
  nodes:{'shared::api':{title:'Unbound decoy API'},'shared::store':{title:'Unbound decoy store'}},rows:[['shared::api','shared::store']],
  edges:[{from:'shared::store',to:'shared::api',label:'Decoy return'},{from:'shared::api',to:'shared::store',label:'Decoy persist'}]}});
 return resolved;
}
async function mountImportedDetail(page,server,enabled=true){
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'telemetry-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'telemetry-detail.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./telemetry-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/telemetry-detail.html');await page.waitForFunction(()=>!!window.mount);
 const rootSpec={page:{title:'Detail host',tracking:{jira:{site:'https://jira.test'},telemetry:{enabled}},sections:[{id:'main',diagram:{
  nodes:{parent:{title:'Imported service',tickets:['ROOT-1'],detail:{spec:'approved-detail',revision:'r1',section:'selected'}}},rows:[['parent']],panels:[PANEL]}}]}};
 const samples={'shared::api':{signals:{rate:{value:50,series:[[T1,30],[T2,50]]}}},
  'shared::api->shared::store':{signals:{rate:{value:500},errors:{value:1}}},'shared::store->shared::api':{signals:{rate:{value:0},errors:{value:0}}}};
 await page.evaluate(({rootSpec,detail,samples})=>{
  window.detailLoads=[];window.detailTelemetryCalls=[];
  window.viewer=window.mount(document.querySelector('#host'),rootSpec,{
   loadDetail:(ref,signal)=>{window.detailLoads.push({...ref,aborted:signal.aborted,abortable:typeof signal.addEventListener==='function'});return Promise.resolve(structuredClone(detail));},
   telemetry:{provider:bindings=>{window.detailTelemetryCalls.push(structuredClone(bindings));return Promise.resolve(structuredClone(samples));}}
  });
  window.viewer.controller.liveStatus.apply({'ROOT-1':{state:'done'},'IMP-1':{state:'done'},'IMP-2':{state:'done'},'IMP-3':{state:'done'}});
 },{rootSpec,detail:importedDetailSpec(),samples});
 const root=page.locator('#host');
 await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();
 const scope=root.locator('[data-dv-detail-preview]:visible');
 await expect(scope).toHaveCount(1);await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');
 expect(await page.evaluate(()=>window.detailLoads),'P12 the real gesture calls the host loader').toEqual([{spec:'approved-detail',revision:'r1',section:'selected',aborted:false,abortable:true}]);
 expect(await page.evaluate(()=>window.viewer.controller.details.snapshot().frames.map(frame=>frame.node))).toEqual(['parent']);
 const metrics=metricsButton(scope.locator('.pt-live-status'));if(enabled)await metrics.click();
 // Wait for the existing connection contract, never for any new canvas cue.
 if(enabled)await expect(scope.locator('.dv-live-metrics-connection')).toHaveAttribute('data-state','connected');
 return {root,scope,metrics,node:scope.locator('g.node[data-dv-node="shared::api"]')};
}

const metricsButton=panel=>panel.getByRole('switch',{name:'Metrics overlay',exact:true});
export {cueSpec,mountCues,mountImportedDetail,importedDetailSpec,CUE_JIRA,CUE_SAMPLES,CUES,PANEL};
export function nestedSpec(){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{a:{title:'Sender'},b:{title:'Queue'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Publish',telemetry:CALL()}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
 const middle=spec('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::a','inner::b'],edges:['inner::a->inner::b']}}});
 const consumer=spec('consumer',{nodes:{},rows:[],panels:[PANEL],topologyImports:[{spec:'middle',export:'nested',as:'outer'}]});
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,middle,consumer]})));
}
export function handoffSpec(){
 const make=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram},{id:'destination',heading:'Destination',diagram:{nodes:{end:{title:'Destination'}},rows:[['end']]}}]}});
 const handoff=ticket=>({title:'Continuation '+ticket,tickets:[ticket],handoff:{localSection:'destination'}});
 const provider=make('provider',{nodes:{h:handoff('IMP-1')},rows:[['h']],topologyExports:{core:{nodes:['h'],edges:[]}}});
 const middle=make('middle',{nodes:{},rows:[],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{nested:{nodes:['inner::h'],edges:[]}}});
 const consumer=make('consumer',{view:'ambient',nodes:{h:handoff('LOC-1'),a:{title:'Sender'},b:{title:'Receiver'}},rows:[['a','b'],['h']],edges:[{from:'a',to:'b',label:'Delivery',tickets:['EDGE-1'],telemetry:CALL()}],panels:[PANEL],
  topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:450,y:250}},{spec:'middle',export:'nested',as:'nested',position:{x:700,y:250}}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,middle,consumer]})));
}
