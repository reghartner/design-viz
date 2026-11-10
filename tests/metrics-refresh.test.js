'use strict';
/* #1287: metrics refresh at most once every 5 minutes, for every provider (like Jira's 5-minute refetch).
| row | fixture | assertion | rejects |
|---|---|---|---|
| R1 | trackingTelemetry with refreshMs 60000, 299999, 300000, 600000 | the floor is 300000: 60000 and 299999 read 300000 with a ".refreshMs" warning "below five minutes — using 300000"; 300000 and 600000 are kept | a board refreshing every minute |
| R2 | a Grafana board and a Honeycomb board through createTelemetryProviders + createTelemetry, fake timers and a fake clock | Metrics on calls at once; the next refresh is armed at 300000 ms with no refreshMs, with page refreshMs 60000 and with host options.refreshMs 60000; a longer page refreshMs (600000) is kept | a 60 s default or a host bypass |
| R3 | the same boards | hidden then visible 10 s after the last call: no call, and the one armed timer waits the rest of the 5 minutes; visible after 5 minutes: one catch-up call | a visibility change that refreshes early |
| R4 | the same boards | Over time opened and closed 20 s after the last live call: no live call on close, the timer waits the rest of the 5 minutes | closing Over time refreshing early |
| R5 | the same boards | Retry calls at once (a reader action), and the next automatic refresh is again 300000 ms later | a Retry that is held back, or one that starts a faster timer |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<16;i++)await new Promise(setImmediate);};
const FIVE=300000,START=Date.parse('2026-11-10T12:00:00.000Z');
const honeycombSchema={type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:'string'},query_spec:{type:'object'}},required:['environment_slug','dataset_slug','query_spec'],additionalProperties:false};
const SERVERS=[{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']},{server:'Honeycomb',tools:[{name:'run_query',inputSchema:honeycombSchema}]}];
const RAW={results:[{data:{COUNT:7}}],series:[{data:{time:'2026-11-10T11:00:00Z',COUNT:3}},{data:{time:'2026-11-10T11:30:00Z',COUNT:7}}]};
const METADATA='  query_result_json: "https://mcp.honeycomb.io/query_results/SYNTHETIC_TEST_ONLY"\n';
function board(kind,refreshMs){
 const signals=kind==='grafana'?{rate:{grafana:'sum(rate(x_total[5m]))',unit:'req/h'}}:{spans:{honeycomb:{calculations:[{op:'COUNT'}]},unit:'spans'}};
 const telemetry=kind==='grafana'?{grafana:{prometheus:'prom-main'}}:{honeycomb:{environment:'prod',dataset:'events'}};
 if(refreshMs!==undefined)telemetry.refreshMs=refreshMs;
 return {tracking:{telemetry},sections:[{id:'main',diagram:{nodes:{a:{telemetry:{kind:'service',signals}}},rows:[['a']]}}]};
}
// The data calls a refresh makes: Grafana queries and Honeycomb run_query (its raw download follows each run).
const DATA=['query_prometheus','query_loki_logs','run_query'];
async function setup(kind,{refreshMs,hostRefreshMs}={}){
 const timers=new Map(),listeners=new Set(),clock={now:START};let serial=0;
 const doc={hidden:false,visibilityState:'visible',addEventListener:(t,f)=>{if(t==='visibilitychange')listeners.add(f);},removeEventListener:(t,f)=>listeners.delete(f)};
 const C={URL,AbortController,TextDecoder,TextEncoder,console,document:doc,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id)};
 C.Date=class extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}};
 vm.runInNewContext(entrypoint('standalone').body,C);
 const calls=[];
 const win={claude:{use:async()=>({listTools:async()=>plain(SERVERS),callTool:async(server,tool,input)=>{calls.push({tool,at:clock.now});
  if(tool==='run_query')return {payload:METADATA};if(tool==='query_prometheus')return {payload:{data:[{values:[[START/1000-60,'40'],[START/1000,'42']]}]}};return {payload:[]};}})},
  fetch:async()=>new Response(JSON.stringify(RAW))};
 const p=C.normalize(board(kind,refreshMs)),adapter=C.createTelemetryProviders(p,win);
 assert.ok(adapter,'the board has automatic metrics providers');
 const options=hostRefreshMs===undefined?adapter.options:Object.assign({},adapter.options,{refreshMs:hostRefreshMs});
 const api=C.createTelemetry(p,options,{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram || {};Object.keys(d.nodes || {}).forEach(id=>fn(d.nodes[id],id,p));})});
 const handle=adapter.attach({telemetry:api,liveStatus:{snapshot:()=>({actionLabel:''}),action(){},onChange:()=>()=>{},onDestroy:()=>()=>{}}},p);await settle();
 return {C,api,timers,clock,calls,
  data:()=>calls.filter(c=>DATA.includes(c.tool)).length,
  armed:()=>[...timers.values()].map(x=>x.ms),
  advance(ms){clock.now+=ms;},
  async fire(){const entries=[...timers];assert.equal(entries.length,1,'one refresh timer is armed: '+JSON.stringify(entries.map(e=>e[1].ms)));timers.delete(entries[0][0]);entries[0][1].fn();await settle();},
  async visibility(hidden){doc.hidden=hidden;doc.visibilityState=hidden?'hidden':'visible';[...listeners].forEach(f=>f({type:'visibilitychange'}));await settle();},
  close(){handle.destroy();api.destroy();}};
}

test('R1 the refresh floor is five minutes, and a lower board value is raised with a warning',()=>{
 const C={URL,console};vm.runInNewContext(entrypoint('standalone').body,C);
 assert.equal(C.TELEMETRY_MIN_REFRESH_MS,FIVE);
 for(const [ms,want,warned] of [[60000,FIVE,true],[299999,FIVE,true],[FIVE,FIVE,false],[600000,600000,false]]){
  const seen=[],parsed=C.trackingTelemetry({tracking:{telemetry:{refreshMs:ms}}},(path,message)=>seen.push(path+' '+message));
  assert.equal(parsed.refreshMs,want,String(ms));
  if(warned)assert.ok(seen.some(s=>/\.refreshMs below five minutes — using 300000/.test(s)),String(ms)+': '+JSON.stringify(seen));
  else assert.ok(!seen.some(s=>/refreshMs/.test(s)),String(ms)+': '+JSON.stringify(seen));
 }
});

for(const kind of ['grafana','honeycomb']){
 test('R2 '+kind+': Metrics on calls at once; the next automatic refresh is 5 minutes later, whatever lower value the page or host asks for',async()=>{
  for(const [opts,want] of [[{},FIVE],[{refreshMs:60000},FIVE],[{hostRefreshMs:60000},FIVE],[{refreshMs:600000},600000]]){
   const h=await setup(kind,opts);
   try{
    assert.equal(h.data(),0,'no call while Metrics is off');
    h.api.setEnabled(true);await settle();
    assert.equal(h.data(),1,'Metrics on calls at once: '+JSON.stringify(h.calls));
    assert.deepEqual(h.armed(),[want],JSON.stringify(opts));
    h.advance(want);await h.fire();assert.equal(h.data(),2,'the timer refreshes once');assert.deepEqual(h.armed(),[want]);
   }finally{h.close();}
  }
 });
 test('R3 '+kind+': a visibility change never refreshes sooner than 5 minutes after the last call',async()=>{
  const h=await setup(kind);
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
   h.advance(5000);await h.visibility(true);assert.equal(h.timers.size,0,'hidden pauses');
   h.advance(5000);await h.visibility(false);
   assert.equal(h.data(),1,'visible 10 s after the last call: no call');
   assert.deepEqual(h.armed(),[FIVE-10000],'the timer waits the rest of the 5 minutes');
   h.advance(FIVE-10000);await h.fire();assert.equal(h.data(),2);
   await h.visibility(true);h.advance(FIVE+1000);await h.visibility(false);
   assert.equal(h.data(),3,'visible after more than 5 minutes hidden: one catch-up call');
  }finally{h.close();}
 });
 test('R4 '+kind+': closing Over time does not refresh sooner than 5 minutes after the last live call',async()=>{
  const h=await setup(kind);
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
   h.advance(10000);h.api.openHistory([{at:new Date(START).toISOString(),key:'2026-11-10'}],0);await settle();
   const afterHistory=h.data();
   h.advance(10000);h.api.closeHistory();await settle();
   assert.equal(h.data(),afterHistory,'closing Over time 20 s after the last live call: no live call');
   assert.deepEqual(h.armed(),[FIVE-20000],'the timer waits the rest of the 5 minutes');
  }finally{h.close();}
 });
 test('R5 '+kind+': Retry calls at once and the next automatic refresh is again 5 minutes later',async()=>{
  const h=await setup(kind);
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
   h.advance(15000);h.api.retry();await settle();
   assert.equal(h.data(),2,'Retry is a reader action: it calls at once');
   assert.deepEqual(h.armed(),[FIVE],'Retry starts no faster timer');
  }finally{h.close();}
 });
}
