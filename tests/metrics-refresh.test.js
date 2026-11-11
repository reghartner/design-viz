'use strict';
/* #1287: metrics refresh at most once every 5 minutes, for every provider (like Jira's 5-minute refetch).
| row | fixture | assertion | rejects |
|---|---|---|---|
| R1 | trackingTelemetry with refreshMs 60000, 299999, 300000, 600000 | the floor is 300000: 60000 and 299999 read 300000 with a ".refreshMs" warning "below five minutes — using 300000"; 300000 and 600000 are kept | a board refreshing every minute |
| R2 | a Grafana board and a Honeycomb board through createTelemetryProviders + createTelemetry, fake timers and a fake clock | Metrics on calls at once; the next refresh is armed at 300000 ms with no refreshMs, with page refreshMs 60000 and with host options.refreshMs 60000; a longer page refreshMs (600000) is kept | a 60 s default or a host bypass |
| R3 | the same boards | hidden then visible 10 s after the last call: no call, and the one armed timer waits the rest of the 5 minutes; visible after 5 minutes: one catch-up call | a visibility change that refreshes early |
| R4 | the same boards | Over time opened and closed 20 s after the last live call: no live call on close, the timer waits the rest of the 5 minutes | closing Over time refreshing early |
| R5 | the same boards | Retry calls at once (a reader action), and the next automatic refresh is again 300000 ms later | a Retry that is held back, or one that starts a faster timer |
| R6 | the same boards, like Jira's 5-minute answer reuse | Metrics off then on 60 s after an answer: no call; the answer shows again with its own refreshed time; the next refresh comes 5 minutes after that answer | a toggle that refetches |
| R7 | a board with environments qa and stg | qa → stg → qa within 5 minutes: one call for stg, none for the second qa, which shows qa's answer and time | an environment flip that refetches |
| R8 | the same boards with a failing query | Retry after the failed answer calls at once; once a Retry answers cleanly, off/on reuses that answer | Retry that is held back after an error |
| R10 | the same boards with a failing query | an answer that names a failure is not reused: off/on a minute later calls again at once | a failed answer held for 5 minutes with no way to try again |
| R11 | the same boards | after clear() (a host account signal), setAvailable(false) then true, both together (an account change), retractSources, or a refresh that failed outright, Metrics off/on within 5 minutes calls again | a reused answer that outlives an account change, a revoked source or a failure |
| R9 | the reviewer's exp8 toggles | five off/on toggles in 3 s after the first answer make no call | a reader toggle as a fast poll |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<16;i++)await new Promise(setImmediate);};
const FIVE=300000,START=Date.parse('2026-11-10T12:00:00.000Z');
const honeycombSchema={type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:'string'},query_spec:{type:'object'}},required:['environment_slug','dataset_slug','query_spec'],additionalProperties:false};
const SERVERS=[{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']},{server:'Honeycomb',tools:[{name:'run_query',inputSchema:honeycombSchema}]}];
const RAW={results:[{data:{COUNT:7}}],series:[{data:{time:'2026-11-10T11:00:00Z',COUNT:3}},{data:{time:'2026-11-10T11:30:00Z',COUNT:7}}]};
const METADATA='  query_result_json: "https://mcp.honeycomb.io/query_results/SYNTHETIC_TEST_ONLY"\n';
function board(kind,refreshMs,environments){
 const signals=kind==='grafana'?{rate:{grafana:'sum(rate(x_total[5m]))',unit:'req/h'}}:{spans:{honeycomb:{calculations:[{op:'COUNT'}]},unit:'spans'}};
 const telemetry=kind==='grafana'?{grafana:{prometheus:'prom-main'}}:{honeycomb:{environment:'prod',dataset:'events'}};
 if(refreshMs!==undefined)telemetry.refreshMs=refreshMs;
 if(environments){telemetry.environment='qa';telemetry.environments={qa:{},stg:kind==='grafana'?{grafana:{prometheus:'prom-stg'}}:{honeycomb:{environment:'stg'}}};}
 return {tracking:{telemetry},sections:[{id:'main',diagram:{nodes:{a:{telemetry:{kind:'service',signals}}},rows:[['a']]}}]};
}
// The data calls a refresh makes: Grafana queries and Honeycomb run_query (its raw download follows each run).
const DATA=['query_prometheus','query_loki_logs','run_query'];
async function setup(kind,{refreshMs,hostRefreshMs,environments,fail,throwAll}={}){
 const timers=new Map(),listeners=new Set(),clock={now:START};let serial=0;
 const doc={hidden:false,visibilityState:'visible',addEventListener:(t,f)=>{if(t==='visibilitychange')listeners.add(f);},removeEventListener:(t,f)=>listeners.delete(f)};
 const C={URL,AbortController,TextDecoder,TextEncoder,console,document:doc,setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id)};
 C.Date=class extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}};
 vm.runInNewContext(entrypoint('standalone').body,C);
 const calls=[],value={n:42},holds=[];
 // hold: the next data call waits until release() (a refresh in flight).
 const win={claude:{use:async()=>({listTools:async()=>plain(SERVERS),callTool:async(server,tool,input)=>{calls.push({tool,at:clock.now,input:plain(input)});if(fail && fail() && DATA.includes(tool))throw {code:'tool_error',message:'boom'};
  if(DATA.includes(tool) && value.hold)await new Promise(resolve=>holds.push(resolve));
  if(tool==='run_query')return {payload:METADATA};if(tool==='query_prometheus')return {payload:{data:[{values:[[START/1000-60,'40'],[START/1000,String(value.n)]]}]}};return {payload:[]};}})},
  fetch:async()=>new Response(JSON.stringify({results:[{data:{COUNT:value.n}}],series:[{data:{time:'2026-11-10T11:00:00Z',COUNT:3}},{data:{time:'2026-11-10T11:30:00Z',COUNT:value.n}}]}))};
 const p=C.normalize(board(kind,refreshMs,environments)),adapter=C.createTelemetryProviders(p,win);
 assert.ok(adapter,'the board has automatic metrics providers');
 let options=hostRefreshMs===undefined?adapter.options:Object.assign({},adapter.options,{refreshMs:hostRefreshMs});
 if(throwAll){const base=options.provider;options=Object.assign({},options,{provider:(...args)=>throwAll()?Promise.reject(new Error('connector down')):base(...args)});}
 const api=C.createTelemetry(p,options,{carriers:fn=>C.sectionRecords(p).forEach(r=>{const d=r.section.diagram || {};Object.keys(d.nodes || {}).forEach(id=>fn(d.nodes[id],id,p));})});
 const handle=adapter.attach({telemetry:api,liveStatus:{snapshot:()=>({actionLabel:''}),action(){},onChange:()=>()=>{},onDestroy:()=>()=>{}}},p);await settle();
 return {C,api,timers,clock,calls,value,release:async()=>{value.hold=false;holds.splice(0).forEach(r=>r());await settle();},
  sample:()=>{const m=plain(api.snapshot().map).a;return m && (m.signals.rate || m.signals.spans) && (m.signals.rate || m.signals.spans).value;},
  async fireMs(ms){const entry=[...timers].find(([,x])=>x.ms===ms);assert.ok(entry,'a timer of '+ms+' ms is armed: '+JSON.stringify([...timers.values()].map(x=>x.ms)));timers.delete(entry[0]);entry[1].fn();await settle();},
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

for(const kind of ['grafana','honeycomb']){
 test('R6 '+kind+': Metrics off then on within 5 minutes reuses the last answer with its own time, and makes no call',async()=>{
  const h=await setup(kind);
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
   const first=plain(h.api.status()),map=plain(h.api.snapshot().map);assert.equal(first.state,'ok');assert.ok(Object.keys(map).length,'the answer has a sample');
   h.advance(60000);h.api.setEnabled(false);assert.deepEqual(plain(h.api.snapshot().map),{},'off clears the map');
   h.advance(1000);h.api.setEnabled(true);await settle();
   assert.equal(h.data(),1,'on again 61 s after the answer: no call');
   assert.deepEqual(plain(h.api.status()),{state:'ok',busy:false,refreshedAt:first.refreshedAt,note:first.note},'the reused answer keeps its own refreshed time');
   assert.deepEqual(plain(h.api.snapshot().map),map,'the reused answer shows again');
   assert.deepEqual(h.armed(),[FIVE-61000],'the next refresh comes 5 minutes after that answer');
   h.advance(FIVE-61000);await h.fire();assert.equal(h.data(),2);
   h.advance(FIVE+1);h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(h.data(),3,'on after 5 minutes calls');
  }finally{h.close();}
 });
 test('R7 '+kind+': an environment flip qa → stg → qa within 5 minutes calls once for stg and not again for qa',async()=>{
  const h=await setup(kind,{environments:true});
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);const qa=plain(h.api.status());
   h.advance(20000);assert.equal(h.api.setEnvironment('stg'),true);await settle();assert.equal(h.data(),2,'stg has no answer yet: one call');
   h.advance(20000);assert.equal(h.api.setEnvironment('qa'),true);await settle();
   assert.equal(h.data(),2,'back to qa within 5 minutes: no call');
   assert.equal(h.api.status().refreshedAt,qa.refreshedAt,'qa\'s own answer and time');assert.equal(h.api.status().state,'ok');
   assert.deepEqual(h.armed(),[FIVE-40000],'qa refreshes 5 minutes after its answer');
   h.advance(20000);h.api.setEnvironment('stg');await settle();assert.equal(h.data(),2,'stg again within 5 minutes: no call');
  }finally{h.close();}
 });
 test('R8 '+kind+': Retry after an error calls at once, and a clean Retry answer is then reused by off/on',async()=>{
  let failing=true;const h=await setup(kind,{fail:()=>failing});
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);assert.match(h.api.status().note,/boom/,'the answer names its failure: '+JSON.stringify(h.api.status()));
   h.advance(2000);h.api.retry();await settle();assert.equal(h.data(),2,'Retry after an error calls at once');
   assert.deepEqual(h.armed(),[FIVE],'Retry starts no faster timer');
   failing=false;h.advance(10000);h.api.retry();await settle();assert.equal(h.data(),3,'a second Retry also calls at once');assert.equal(h.api.status().state,'ok');assert.equal(h.api.status().note,'','the retried answer is clean');
   h.advance(1000);h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(h.data(),3,'a clean answer is reused');
  }finally{h.close();}
 });
 test('R9 '+kind+': five off/on toggles in 3 s after the first answer make no call',async()=>{
  const h=await setup(kind);
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
   for(let i=0;i<5;i++){h.advance(300);h.api.setEnabled(false);h.api.setEnabled(true);await settle();}
   assert.equal(h.data(),1,'toggles reuse the answer: '+h.data());assert.deepEqual(h.armed(),[FIVE-1500],'the refresh stays 5 minutes after the answer');
  }finally{h.close();}
 });
}
for(const kind of ['grafana','honeycomb'])test('R10 '+kind+': an answer that names a failure is not reused; off/on a minute later calls again at once',async()=>{
 const h=await setup(kind,{fail:()=>true});
 try{
  h.api.setEnabled(true);await settle();assert.equal(h.data(),1);assert.match(h.api.status().note,/boom/);
  // #1313: within 60 s of the failed call it waits (R16); after that it calls at once, since a failed answer is never reused.
  h.advance(61000);h.api.setEnabled(false);h.api.setEnabled(true);await settle();
  assert.equal(h.data(),2,'off/on after a failed answer tries again');assert.deepEqual(h.armed(),[FIVE]);
 }finally{h.close();}
});
for(const kind of ['grafana','honeycomb'])for(const [label,drop] of [
 ['clear()',h=>h.api.clear()],
 ['setAvailable(false) then true',h=>{h.api.setAvailable(false);h.api.setAvailable(true);}],
 ['an account change (clear and setAvailable)',h=>{h.api.clear();h.api.setAvailable(false);h.api.setAvailable(true);}],
 ['retractSources',h=>h.api.retractSources([kind])],
])test('R11 '+kind+': after '+label+', Metrics off/on within 5 minutes calls again',async()=>{
 const h=await setup(kind);
 try{
  h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
  h.advance(5000);h.api.setEnabled(false);drop(h);h.advance(5000);h.api.setEnabled(true);await settle();
  assert.equal(h.data(),2,'the dropped answer is not reused: '+label);
 }finally{h.close();}
});
for(const kind of ['grafana','honeycomb'])test('R11 '+kind+': after a refresh that failed outright, Metrics off/on within 5 minutes calls again',async()=>{
 let down=false;const h=await setup(kind,{throwAll:()=>down});
 try{
  h.api.setEnabled(true);await settle();assert.equal(h.data(),1);assert.equal(h.api.status().state,'ok');
  // A Retry 5 s later fails outright, while the first answer is still under 5 minutes old.
  down=true;h.advance(5000);h.api.retry();await settle();assert.equal(h.api.status().state,'error',JSON.stringify(h.api.status()));
  down=false;h.advance(5000);h.api.setEnabled(false);h.api.setEnabled(true);await settle();
  assert.equal(h.data(),2,'the answer before the failure is not reused (the failed Retry made no data call)');assert.equal(h.api.status().state,'ok');
 }finally{h.close();}
});

/* #1293: cached through off/on, and Refresh now.
| row | fixture | assertion | rejects |
|---|---|---|---|
| R12 | Grafana and Honeycomb boards, an answer older than 5 minutes | Metrics off then on shows the cached map and its own refreshed time at once (never empty or loading), busy while exactly one background call runs, then the new map; the timer restarts from that answer | a blank or loading state on a stale off/on, or a second call |
| R13 | the same boards | Refresh now calls once at once and re-arms the refresh timer at 5 minutes from its answer; a second Refresh now while it runs makes no call; after the answer a Refresh now within 60 s makes no call and reports the cooldown until 60 s after the first; once the cooldown ends it calls again | a Refresh now that is ignored, queues, or can exceed one call a minute |
| R14 | the same boards | a Refresh now within 60 s of an automatic call makes no call; the click shows the cooldown until 60 s after that call, and its end repaints | two refreshes inside a minute |
| R15 | the same boards | with Metrics off, or Over time open, Refresh now is off and makes no call | a hidden way to call |
| R16 | the same boards with a failing query | off/on 5 s after a failed answer makes no call yet: it shows the cooldown until 60 s after that call, and the call runs then; a first Metrics on in another environment calls at once | off/on during provider errors as a fast poll |
| R17 | the same boards | a refresh held past 61 s still ignores Refresh now until it answers | a second call while one runs |
| R18 | the same boards with a failing query | after the failed answer, clear() or setAvailable(false) then true resets the wait: off/on calls at once | an old failure holding back a reconnect |
| R20 | the same boards with a failing query | a call that starts during the wait (Retry here; a binding change or closing Over time with new carriers do the same) clears the wait, and its clean answer shows with no "last refresh failed" | a stale failure line over a fresh answer |
| R19 | a board with environments qa and stg | stg answers cleanly, qa's answer names a failure and off/on waits in qa; switching to stg shows stg healthy (no wait, no failure time) and back to qa shows qa's wait again | one environment's wait shown on another |
*/
for(const kind of ['grafana','honeycomb']){
 test('R12 '+kind+': off/on after 5 minutes shows the cached answer at once, then refreshes it with exactly one background call',async()=>{
  const h=await setup(kind);
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);const first=plain(h.api.status()),old=h.sample();assert.equal(old,42);
   h.api.setEnabled(false);h.advance(FIVE+1000);h.value.n=77;h.value.hold=true;h.api.setEnabled(true);await settle();
   const during=plain(h.api.status());
   assert.equal(h.sample(),42,'the cached value shows at once');assert.equal(during.state,'ok','never loading');assert.equal(during.refreshedAt,first.refreshedAt,'with its own refreshed time');assert.equal(during.busy,true,'refreshing in the background');
   assert.equal(h.data(),2,'exactly one background call');
   await h.release();assert.equal(h.sample(),77,'then the new answer');assert.notEqual(h.api.status().refreshedAt,first.refreshedAt);assert.equal(h.api.status().busy,false);
   assert.equal(h.data(),2);assert.deepEqual(h.armed(),[FIVE],'the timer restarts from that answer');
  }finally{h.close();}
 });
 test('R13 '+kind+': Refresh now calls once at once, re-arms the timer, ignores clicks while running and keeps a 60 s cooldown',async()=>{
  const h=await setup(kind);
  try{
   assert.equal(typeof h.api.refreshNow,'function','refreshNow exists');assert.equal(typeof h.api.refreshNowState,'function','refreshNowState exists');
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);
   h.advance(120000);assert.equal(h.api.refreshNowState().state,'ready');assert.equal(h.api.refreshNowState().refreshedAt,h.api.status().refreshedAt,'it names the last update');
   h.value.hold=true;h.value.n=55;assert.equal(h.api.refreshNow(),true,'Refresh now calls');await settle();assert.equal(h.data(),2,'at once');
   assert.equal(h.api.refreshNowState().state,'busy');assert.equal(h.api.refreshNow(),false,'a second click while it runs');await settle();assert.equal(h.data(),2,'queues nothing');
   await h.release();assert.equal(h.sample(),55);assert.ok(h.armed().includes(FIVE),'the refresh timer restarts 5 minutes from that answer: '+JSON.stringify(h.armed()));
   h.advance(10000);const state=h.api.refreshNowState();assert.equal(state.state,'cooldown');assert.equal(state.until,new Date(START+120000+60000).toISOString(),'60 s after that Refresh now started');
   assert.equal(h.api.refreshNow(),false);await settle();assert.equal(h.data(),2,'no call during the cooldown');
   h.advance(50000);await h.fireMs(60000);assert.equal(h.api.refreshNowState().state,'ready','the cooldown ends with a repaint');
   assert.equal(h.api.refreshNow(),true);await settle();assert.equal(h.data(),3);
  }finally{h.close();}
 });
 test('R14 '+kind+': Refresh now within 60 s of an automatic refresh makes no call',async()=>{
  const h=await setup(kind);
  try{
   assert.equal(typeof h.api.refreshNow,'function','refreshNow exists');assert.equal(typeof h.api.refreshNowState,'function','refreshNowState exists');
   h.api.setEnabled(true);await settle();h.advance(FIVE);await h.fireMs(FIVE);assert.equal(h.data(),2,'the automatic refresh');
   h.advance(20000);assert.equal(h.api.refreshNow(),false,'within 60 s of that call');await settle();assert.equal(h.data(),2,'no call');
   const state=h.api.refreshNowState();assert.equal(state.state,'cooldown','the click shows the cooldown');assert.equal(state.until,new Date(START+FIVE+60000).toISOString(),'until 60 s after the automatic call');
   assert.ok(h.armed().includes(40000),'its end repaints: '+JSON.stringify(h.armed()));
  }finally{h.close();}
 });
 test('R15 '+kind+': Refresh now is off while Metrics is off or Over time is open',async()=>{
  const h=await setup(kind);
  try{
   assert.equal(typeof h.api.refreshNow,'function','refreshNow exists');assert.equal(typeof h.api.refreshNowState,'function','refreshNowState exists');
   assert.equal(h.api.refreshNowState().state,'off');assert.equal(h.api.refreshNow(),false);await settle();assert.equal(h.data(),0);
   h.api.setEnabled(true);await settle();h.advance(120000);h.api.openHistory([{at:new Date(START).toISOString(),key:'2026-11-10'}],0);await settle();const before=h.data();
   assert.equal(h.api.refreshNowState().state,'off');assert.equal(h.api.refreshNow(),false);await settle();assert.equal(h.data(),before);
  }finally{h.close();}
 });
}
for(const kind of ['grafana','honeycomb']){
 test('R16 '+kind+': off/on after a failed answer waits out 60 s from that call; a new environment calls at once',async()=>{
  let failing=true;const h=await setup(kind,{fail:()=>failing,environments:true});
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);assert.match(h.api.status().note,/boom/);
   h.advance(5000);h.api.setEnabled(false);h.api.setEnabled(true);await settle();
   assert.equal(h.data(),1,'off/on 5 s after a call: no call yet');
   const state=h.api.refreshNowState();assert.equal(state.state,'cooldown','the wait shows as the Refresh now cooldown');assert.equal(state.until,new Date(START+60000).toISOString());
   assert.ok(h.armed().includes(55000),'the call is scheduled for 60 s after the last one: '+JSON.stringify(h.armed()));
   failing=false;h.advance(55000);while([...h.timers.values()].some(x=>x.ms===55000))await h.fireMs(55000);assert.equal(h.data(),2,'it calls then (the call and the cooldown repaint end together)');
   h.advance(1000);assert.equal(h.api.setEnvironment('stg'),true);await settle();assert.equal(h.data(),3,'a first look at another environment calls at once');
  }finally{h.close();}
 });
 test('R17 '+kind+': a refresh held past 61 s still ignores Refresh now until it answers',async()=>{
  const h=await setup(kind);
  try{
   assert.equal(typeof h.api.refreshNow,'function','refreshNow exists');
   h.api.setEnabled(true);await settle();h.advance(120000);h.value.hold=true;assert.equal(h.api.refreshNow(),true);await settle();assert.equal(h.data(),2);
   h.advance(62000);assert.equal(h.api.refreshNowState().state,'busy');assert.equal(h.api.refreshNow(),false,'busy, though the cooldown has passed');await settle();assert.equal(h.data(),2);
   await h.release();assert.equal(h.api.refreshNowState().state,'ready');assert.equal(h.api.refreshNow(),true);await settle();assert.equal(h.data(),3);
  }finally{h.close();}
 });
}
for(const kind of ['grafana','honeycomb'])for(const [label,drop] of [['clear()',h=>h.api.clear()],['setAvailable(false) then true',h=>{h.api.setAvailable(false);h.api.setAvailable(true);}]])
 test('R18 '+kind+': after a failed answer and '+label+', off/on calls at once',async()=>{
  let failing=true;const h=await setup(kind,{fail:()=>failing});
  try{
   h.api.setEnabled(true);await settle();assert.equal(h.data(),1);assert.match(h.api.status().note,/boom/);
   h.advance(5000);h.api.setEnabled(false);drop(h);failing=false;h.api.setEnabled(true);await settle();
   assert.equal(h.data(),2,'the cache drop resets the wait: '+label);
  }finally{h.close();}
 });
for(const kind of ['grafana','honeycomb'])test('R19 '+kind+': the wait after a failed answer belongs to its environment',async()=>{
 let failing=false;const h=await setup(kind,{fail:()=>failing,environments:true});
 try{
  assert.equal(typeof h.api.refreshNowState,'function','refreshNowState exists');
  assert.equal(h.api.setEnvironment('stg'),true);h.api.setEnabled(true);await settle();assert.equal(h.data(),1);assert.equal(h.api.status().note,'','stg answers cleanly');
  h.advance(1000);failing=true;h.api.setEnvironment('qa');await settle();assert.equal(h.data(),2);assert.match(h.api.status().note,/boom/,'qa names a failure');
  h.advance(5000);h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(h.data(),2);
  assert.equal(h.api.refreshNowState().waiting,true,'off/on waits in qa');
  h.advance(5000);h.api.setEnvironment('stg');await settle();assert.equal(h.data(),2,'stg reuses its clean answer');
  const stg=h.api.refreshNowState();assert.equal(stg.waiting,false,'stg shows no wait');assert.equal(stg.failedAt,null);assert.equal(stg.nextTry,null);assert.equal(h.api.status().note,'');
  h.advance(5000);h.api.setEnvironment('qa');await settle();assert.equal(h.data(),2,'back in qa the wait still holds');assert.equal(h.api.refreshNowState().waiting,true,'and shows again');
 }finally{h.close();}
});
for(const kind of ['grafana','honeycomb'])test('R20 '+kind+': a call that starts during the wait clears it',async()=>{
 let failing=true;const h=await setup(kind,{fail:()=>failing});
 try{
  h.api.setEnabled(true);await settle();assert.match(h.api.status().note,/boom/);
  h.advance(5000);h.api.setEnabled(false);h.api.setEnabled(true);await settle();assert.equal(h.api.refreshNowState().waiting,true,'off/on waits');
  failing=false;h.advance(1000);h.api.retry();await settle();assert.equal(h.data(),2,'a call starts during the wait');
  assert.equal(h.api.status().note,'','its answer is clean');const state=h.api.refreshNowState();assert.equal(state.waiting,false,'the wait is cleared');assert.equal(state.failedAt,null);assert.equal(state.nextTry,null);
 }finally{h.close();}
});
