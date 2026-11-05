'use strict';
// #994: exact day endpoints, gaps != zero, isolated seven-day/tail cache,
// one shared six-call budget, click-gated controller lifetime and raw MCP contract.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v)),settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
const DAY=86400000,T=Date.UTC(2026,9,21),iso=t=>new Date(t).toISOString();
const days=[0,1,2].map(i=>({key:iso(T+i*DAY-DAY).slice(0,10),at:iso(T+i*DAY),label:'Localized '+i,states:{}}));
const sample=v=>({a:{signals:{rate:{value:v}}}}),series=points=>({a:{signals:{rate:{series:points,unit:'req/h'}}}});
function context(){const timers=new Map(),C={URL,AbortController,console,setTimeout:(fn,ms)=>{const id={};timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint('standalone').body,C);C.timers=timers;return C;}
function runtime(options={},page={}){const C=context(),carrier={tickets:['AA-1'],telemetry:{kind:'service',signals:{rate:{grafana:'authored[24h]',unit:'req/h'}},proof:{rate:{min:1}}}};const api=C.createTelemetry(page,options,{carriers:fn=>fn(carrier,'a',page),diagrams:()=>{},jira:()=>({'AA-1':{state:'done'}})});return {C,api,carrier};}

test('H1 day normalization uses explicit endpoints, preserves zero and leaves retention/malformed/live headlines absent',()=>{
 const C=context(),map=series([[T,0],[T+2*DAY,5],['invalid',4],[T+DAY,NaN]]);map.a.signals.rate.value=999;
 assert.equal(C.telemetryHistoryDay(map,days[0]).a.signals.rate.value,0);
 assert.equal(C.telemetryHistoryDay(series([[days[0].key,0]]),days[0]).a.signals.rate.value,0,'explicit calendar day keys also work');
 assert.deepEqual(plain(C.telemetryHistoryDay(map,days[1])),{});
 assert.equal(C.telemetryHistoryDay(map,days[2]).a.signals.rate.value,5);
 assert.deepEqual(plain(C.telemetryHistoryDay(sample(999),days[0])),{});
 assert.deepEqual(plain(C.telemetryHistoryDay(map,{label:days[0].at})),{},'never parse a label');
});
test('H2 seven-day cache reuses range, fetches only new tail, expires, and isolates binding/provider/datasource identity and instances',async()=>{
 const C=context();let now=0,calls=[];const cache=C.telemetryHistoryCache(()=>now),signal=new AbortController().signal;
 const fetch=async range=>{calls.push(plain(range));return {map:series([[Date.parse(range.from),calls.length]])};};
 const range={from:iso(T),to:iso(T+DAY)};
 await cache.load('binding|provider|datasource-A',range,signal,fetch);await cache.load('binding|provider|datasource-A',range,signal,fetch);assert.equal(calls.length,1);
 const result=await cache.load('binding|provider|datasource-A',{...range,to:iso(T+2*DAY)},signal,fetch);assert.deepEqual(calls[1],{from:iso(T+2*DAY),to:iso(T+2*DAY)});assert.deepEqual(plain(result.map.a.signals.rate.series),[[iso(T),1],[iso(T+2*DAY),2]]);
 for(const key of ['other-binding|provider|datasource-A','binding|other-provider|datasource-A','binding|provider|datasource-B'])await cache.load(key,range,signal,fetch);
 await C.telemetryHistoryCache(()=>now).load('binding|provider|datasource-A',range,signal,fetch);assert.equal(calls.length,6,'another artifact never inherits this cache');
 now=C.LIVE_STATUS_HISTORY_CACHE_MS;await cache.load('binding|provider|datasource-A',range,signal,fetch);assert.deepEqual(calls[6],range,'expiry refetches original full range');
});
test('H3 aborted and partial batches never extend cache coverage',async()=>{
 const C=context(),cache=C.telemetryHistoryCache(),range={from:iso(T),to:iso(T)},abort=new AbortController();let complete,calls=0;
 const pending=cache.load('a',range,abort.signal,()=>new Promise(r=>complete=r));await settle();abort.abort();complete({map:series([[T,0]])});await assert.rejects(pending,/cancelled/);
 const fetch=async()=>{calls++;return {map:{},note:'query failed'};};
 await cache.load('a',range,new AbortController().signal,fetch);await cache.load('a',range,new AbortController().signal,fetch);assert.equal(calls,2);
});
test('H4 Metrics off makes no history call; enabling in history loads once, sliders do not fetch, disable aborts and drops late answers',async()=>{
 let live=0,hist=0,answer,signal;const {api}=runtime({provider:async()=>{live++;return sample(999);},history:(b,r,s)=>{hist++;signal=s;return new Promise(resolve=>answer=resolve);}});
 api.openHistory(days,0);await settle();assert.equal(hist,0);api.setEnabled(true);await settle();assert.equal(hist,1);assert.equal(live,0);
 api.historyDay(1);api.historyDay(2);assert.equal(hist,1);api.setEnabled(false);assert.equal(signal.aborted,true);answer(series([[T+2*DAY,5]]));await settle();assert.deepEqual(plain(api.snapshot().map),{});
 api.destroy();api.setEnabled(true);assert.equal(hist,1);
});
test('H5 historical proof never borrows live; newest pending live answer is held and restored, timer pauses',async()=>{
 let live=0,resolve,history=0;const {api,C}=runtime({provider:()=>{live++;return new Promise(r=>resolve=r);},history:async()=>{history++;return series([[T,0],[T+2*DAY,5]]);}});
 api.setEnabled(true);await settle();api.apply(sample(100));api.openHistory(days,0);await settle();assert.equal(api.verdicts().carriers.a.verdict,'done-unproven');
 resolve(sample(200));await settle();assert.equal(api.snapshot().map.a.signals.rate.value,0,'late live answer cannot overwrite historical zero');assert.equal(C.timers.size,0);
 api.historyDay(1);assert.equal(api.verdicts().carriers.a.telemetry,'unobserved');api.historyDay(2);assert.equal(api.verdicts().carriers.a.verdict,'proven');assert.equal(history,1);
 api.closeHistory();assert.equal(api.snapshot().map.a.signals.rate.value,200);await settle();assert.equal(live,2);api.destroy();
});
test('H6 unsupported history stays unobserved; disabled root/host suppress history and stale apply; re-rendered controllers do not share cache',async()=>{
 const {api}=runtime({provider:async()=>sample(50)});api.setEnabled(true);await settle();api.openHistory(days,0);assert.deepEqual(plain(api.snapshot().map),{});assert.match(api.status().note,/unavailable/);api.closeHistory();assert.equal(api.snapshot().map.a.signals.rate.value,50);api.destroy();
 for(const [options,page] of [[false,{}],[{provider:async()=>sample(5),history:()=>{throw Error('must not call');}},{tracking:{telemetry:{enabled:false}}}]]){
  const {api}=runtime(options,page);api.openHistory(days,0);api.setEnabled(true);api.apply(sample(100));await settle();assert.equal(api.snapshot().available,false);assert.deepEqual(plain(api.snapshot().map),{});api.destroy();
 }
});
test('H7 closing or destroying while history is pending drops completion and the aborted cache entry',async()=>{
 for(const destroy of [false,true]){let answer,signal;const {api}=runtime({provider:async()=>sample(40),history:(b,r,s)=>{signal=s;return new Promise(r=>answer=r);}});api.setEnabled(true);await settle();api.openHistory(days,0);await settle();if(destroy)api.destroy();else api.closeHistory();assert.equal(signal.aborted,true);answer(series([[T,0]]));await settle();assert.equal(api.snapshot().map.a?.signals.rate.value,destroy?undefined:40);api.destroy();}
});
const TOOLS=['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink'];
function grafana(call){const C=context(),calls=[],page={tracking:{telemetry:{grafana:{prometheus:'prom-A',loki:'loki-A'}}},sections:[{diagram:{nodes:{a:{telemetry:{kind:'service',signals:{rate:{grafana:'EXACT[24h]'}}}}}}}]};
 const adapter=C.createTelemetryGrafana(page,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools:TOOLS}],callTool:(server,tool,input,options)=>{calls.push({server,tool,input:plain(input),options});return Promise.resolve().then(()=>call(tool,input,options));}})}});
 const bindings=[{id:'a',signals:{rate:{source:'grafana',query:'EXACT[24h]',unit:'req/h'},logs:{source:'loki',query:'EXACT LOGQL [24h]'},sql:{source:'sql',query:'select 1'},tempo:{source:'tempo',query:'{}'},honeycomb:{source:'honeycomb',query:{dataset:'a'}}}}];
 return {C,adapter,calls,bindings,page};}
test('H8 Grafana raw MCP range arguments/budget, parsers, explicit zero and retention gaps; no query rewriting or invented source tools',async()=>{
 const {adapter,calls,bindings}=grafana(tool=>({payload:tool==='query_prometheus'?{data:{result:[{values:[[T/1000,'0'],[(T+2*DAY)/1000,'7']]}]}}:{data:[{values:[{timestamp:String(T/1000),value:'3'}]}]}}));
 const signal=new AbortController().signal,range={from:iso(T),to:iso(T+2*DAY)},map=await adapter.options.history(bindings,range,signal);
 assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>[c.tool,c.input]),[
 ['query_prometheus',{datasourceUid:'prom-A',expr:'EXACT[24h]',startTime:range.from,endTime:range.to,queryType:'range',stepSeconds:86400}],
 ['query_loki_logs',{datasourceUid:'loki-A',logql:'EXACT LOGQL [24h]',startRfc3339:range.from,endRfc3339:range.to,queryType:'range',stepSeconds:86400}]]);
 assert.ok(calls.every(c=>c.options.signal===signal && c.options.cache.staleTime===604800000));
 assert.deepEqual(plain(map.a.signals.rate.series),[[T,0],[T+2*DAY,7]]);assert.equal(map.a.signals.sql,undefined);assert.equal(map.a.signals.logs.series[0][1],3);
});
test('H9 shared queue caps mixed Jira/Grafana work at six, including aborted in-flight work',async()=>{
 let active=0,max=0,releases=[];const {C,adapter,bindings,calls}=grafana(()=>new Promise(r=>{active++;max=Math.max(max,active);releases.push(()=>{active--;r({payload:{data:[]}});});}));
 const jira=Array.from({length:5},()=>C.liveStatusHistoryCall(()=>new Promise(r=>{active++;max=Math.max(max,active);releases.push(()=>{active--;r();});})));
 const abort=new AbortController(),pending=adapter.options.history(Array.from({length:10},(_,i)=>({...bindings[0],id:'n'+i})),{from:iso(T),to:iso(T)},abort.signal);const rejected=assert.rejects(pending,/cancelled/);
 await settle();assert.equal(max,6);assert.equal(active,6);abort.abort();releases.splice(0).forEach(r=>r());await settle();releases.splice(0).forEach(r=>r());await Promise.all(jira);await rejected;assert.equal(max,6);assert.ok(calls.length<=1,'queued Grafana calls did not start after abort');
});
test('H10 partial query failures keep peers, report failure and never reuse live; consent retries only through the action',async()=>{
 const h=grafana(tool=>{if(tool==='query_prometheus')throw {code:'tool_error',message:'retention unavailable'};return {payload:{data:[{timestamp:String(T/1000),value:'0'}]}};});let note='';const map=await h.adapter.options.history(h.bindings,{from:iso(T),to:iso(T)},new AbortController().signal,{note:t=>note=t});assert.match(note,/retention unavailable/);assert.equal(map.a?.signals.rate,undefined);assert.equal(map.a.signals.logs.series[0][1],0);
 let allowed=false;const approval=grafana(()=>{if(!allowed)throw {code:'approval_required'};return {payload:{data:[]}};});let action,enabled=true;const ctl={telemetry:{setAvailable(){},clear(){},enabled:()=>enabled,setEnabled:v=>enabled=v,onChange:()=>()=>{}},liveStatus:{action:(label,fn)=>action=fn,snapshot:()=>({actionLabel:''}),onChange:()=>()=>{},onDestroy:()=>()=>{}}};approval.adapter.attach(ctl);await settle();
 const signal=new AbortController().signal;await assert.rejects(approval.adapter.options.history(approval.bindings,{from:iso(T),to:iso(T)},signal),e=>e.state==='approval');const count=approval.calls.length;await assert.rejects(approval.adapter.options.history(approval.bindings,{from:iso(T),to:iso(T)},signal));assert.equal(approval.calls.length,count);assert.equal(typeof action,'function');allowed=true;action();await settle();assert.equal(approval.calls.length,count+1);
});
test('H11 history approval through the real telemetry controller retracts evidence and reports approval without a stuck spinner',async()=>{
 const h=grafana(()=>{throw {code:'approval_required'};});const api=h.C.createTelemetry(h.page,h.adapter.options,{carriers:fn=>fn(h.page.sections[0].diagram.nodes.a,'a',h.page),diagrams:()=>{},jira:()=>({})});let action;
 h.adapter.attach({telemetry:api,liveStatus:{action:(label,fn)=>action=fn,snapshot:()=>({actionLabel:''}),onChange:()=>()=>{},onDestroy:()=>()=>{}}});await settle();api.openHistory(days,0);api.setEnabled(true);await settle();
 assert.equal(api.status().state,'approval');assert.equal(api.status().busy,false);assert.deepEqual(plain(api.snapshot().map),{});assert.equal(typeof action,'function');api.destroy();
});
test('H12 changed bindings or provider/datasource identity get a new batch; another controller cannot consume a cached answer',async()=>{
 let calls=0,identity='account:A/datasource:A';const options={provider:async()=>sample(99),historyKey:()=>identity,history:async()=>{calls++;return series([[T,calls]]);}};
 const {api,carrier}=runtime(options);api.openHistory(days,0);api.setEnabled(true);await settle();assert.equal(calls,1);
 api.closeHistory();api.openHistory(days,0);await settle();assert.equal(calls,1);
 carrier.telemetry.signals.rate.grafana='different authored query';api.closeHistory();api.openHistory(days,0);await settle();assert.equal(calls,2);
 identity='account:B/datasource:A';api.closeHistory();api.openHistory(days,0);await settle();assert.equal(calls,3);
 identity='account:B/datasource:B';api.closeHistory();api.openHistory(days,0);await settle();assert.equal(calls,4);api.destroy();
 const other=runtime(options).api;other.openHistory(days,0);other.setEnabled(true);await settle();assert.equal(calls,5);other.destroy();
});

function localHistory(zone,year,month,date){
 const prior=process.env.TZ;process.env.TZ=zone;
 try{
  const C=context(),at=(d,h=12)=>new Date(year,month-1,d,h).getTime();
  return plain(C.liveStatusHistoryDays({tickets:[{key:'AA-1',created:at(date),status:'Done',changes:[{at:at(date+1,23)+30*60000,field:'status',from:'To Do',to:'Done'}]},{key:'BB-1',created:at(date+2),status:'In Progress',changes:[]}],today:{'AA-1':{state:'done'},'BB-1':{state:'active'}},categories:{'to do':'new','done':'done','in progress':'indeterminate'},now:at(date+3),locale:'en-US'})).days;
 }finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
}
for(const fixture of [
 {zone:'America/New_York',date:[2026,3,7],at:['2026-03-08T05:00:00.000Z','2026-03-09T04:00:00.000Z','2026-03-10T04:00:00.000Z','2026-03-11T04:00:00.000Z'],hours:23},
 {zone:'America/New_York',date:[2026,10,31],at:['2026-11-01T04:00:00.000Z','2026-11-02T05:00:00.000Z','2026-11-03T05:00:00.000Z','2026-11-04T05:00:00.000Z'],hours:25},
 {zone:'Asia/Kolkata',date:[2026,1,10],at:['2026-01-10T18:30:00.000Z','2026-01-11T18:30:00.000Z','2026-01-12T18:30:00.000Z','2026-01-13T18:30:00.000Z'],hours:24}
])test('H13 local Jira endpoints and exact Grafana daily runs: '+fixture.zone+' '+fixture.hours+'h',async()=>{
 const selected=localHistory(fixture.zone,...fixture.date);assert.deepEqual(selected.map(d=>d.at),fixture.at);
 assert.equal((Date.parse(selected[1].at)-Date.parse(selected[0].at))/3600000,fixture.hours);
 assert.equal(selected[0].states['AA-1'].state,'todo');assert.equal(selected[1].states['AA-1'].state,'done','late local-day change is included in the very same telemetry day');assert.equal(selected[1].states['BB-1'],undefined,'not-created Jira gaps survive');
 const h=grafana((tool,input)=>{const from=Date.parse(input.startTime || input.startRfc3339),to=Date.parse(input.endTime || input.endRfc3339),points=[];for(let t=from;t<=to;t+=DAY)points.push([t/1000,String(fixture.at.indexOf(iso(t))*10)]);points.push([Date.parse(selected[1].key+'T00:00:00Z')/1000,'999']);return {payload:{data:[{values:points}]}};});
 const endpoints=selected.map(({key,at})=>({key,at})),range={from:endpoints[0].at,to:endpoints.at(-1).at,endpoints};
 const map=await h.adapter.options.history(h.bindings,range,new AbortController().signal),runs=fixture.hours===24?[[0,3]]:[[0,0],[1,3]];
 assert.equal(h.calls.length,runs.length*2);
 for(const [source,tool,expr] of [['grafana','query_prometheus','EXACT[24h]'],['loki','query_loki_logs','EXACT LOGQL [24h]']]){
  assert.deepEqual(h.calls.filter(c=>c.tool===tool).map(c=>c.input),runs.map(([a,b])=>source==='grafana'?{datasourceUid:'prom-A',expr,startTime:fixture.at[a],endTime:fixture.at[b],stepSeconds:86400,queryType:'range'}:{datasourceUid:'loki-A',logql:expr,startRfc3339:fixture.at[a],endRfc3339:fixture.at[b],stepSeconds:86400,queryType:'range'}));
 }
 assert.deepEqual(plain(map.a.signals.rate.series),fixture.at.map((at,i)=>[Date.parse(at),i*10]));
 assert.equal(h.C.telemetryHistoryDay(map,selected[1]).a.signals.rate.value,10);
 assert.equal(h.C.telemetryHistoryDay(series([[selected[1].key,42]]),selected[1]).a.signals.rate.value,42,'calendar keys resolve through explicit metadata, never UTC guessing');
 assert.deepEqual(plain(h.C.telemetryHistoryDay(series([[selected[1].key+'T00:00:00Z',999]]),selected[1])),{});
 let calls=[];const {api}=runtime({provider:async()=>sample(999),history:async(b,r)=>{calls.push(plain(r));return map;}});api.openHistory(selected,1);api.historyDay(0);await settle();assert.equal(calls.length,0);api.setEnabled(true);await settle();assert.deepEqual(calls,[range]);api.historyDay(1);assert.equal(api.snapshot().map.a.signals.rate.value,10);api.historyDay(2);assert.equal(calls.length,1);api.destroy();
});
test('H14 cache tail and calendar keys honor 23h/25h endpoints and changed endpoint metadata',async()=>{
 for(const date of [[2026,3,7],[2026,10,31]]){
  const C=context(),cache=C.telemetryHistoryCache(),selected=localHistory('America/New_York',...date),endpoints=selected.map(({key,at})=>({key,at})),signal=new AbortController().signal,calls=[];
  const range=end=>({from:endpoints[0].at,to:endpoints[end].at,endpoints:endpoints.slice(0,end+1)});
  const fetch=async part=>{calls.push(plain(part));return {map:series(part.endpoints.map((d,i)=>[d.key,42+i]))};};
  await cache.load('identity',range(0),signal,fetch);const answer=await cache.load('identity',range(2),signal,fetch);
  assert.deepEqual(calls[1],{from:endpoints[1].at,to:endpoints[2].at,endpoints:endpoints.slice(1,3)});
  assert.equal(C.telemetryHistoryDay(answer.map,selected[1]).a.signals.rate.value,42);await cache.load('identity',range(2),signal,fetch);assert.equal(calls.length,2);
  const shifted={key:endpoints[1].key,at:iso(Date.parse(endpoints[1].at)+3600000)};await cache.load('identity',{from:shifted.at,to:shifted.at,endpoints:[shifted]},signal,fetch);assert.equal(calls.length,3,'same calendar key at another instant is not cached coverage');
 }
});
function changingRuntime(options,page={}){
 const C=context(),carrier=query=>({tickets:['AA-1'],telemetry:{kind:'service',signals:{rate:{grafana:query}},proof:{rate:{min:1}}}}),state={bound:[['a',carrier('root')]]};
 const walk=fn=>state.bound.forEach(([id,value])=>fn(value,id,page)),api=C.createTelemetry(page,options,{carriers:walk,historyCarriers:walk,diagrams:()=>{},jira:()=>({'AA-1':{state:'done'}})});return {api,state,carrier};
}
test('H15 late bindings reuse completed peers, leave pending peers intact, cancel removal and reject same-ID stale answers',async()=>{
 let calls=[];const {api,state,carrier}=changingRuntime({provider:async()=>sample(900),history:(bound,range,signal)=>new Promise(resolve=>calls.push({bound:plain(bound),range:plain(range),signal,resolve}))});
 const finish=(call,value)=>call.resolve(Object.fromEntries(call.bound.map(b=>[b.id,{signals:{rate:{series:days.map(d=>[d.at,value])}}}])));
 api.openHistory(days,0);api.bindingsChanged();assert.equal(calls.length,0);api.setEnabled(true);await settle();assert.equal(calls.length,1);
 state.bound.push(['nested::b',carrier('child')]);api.bindingsChanged();await settle();assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.bound.map(b=>b.id)),[['a'],['nested::b']]);assert.equal(calls[0].signal.aborted,false,'new detail does not restart pending root');
 finish(calls[0],0);await settle();assert.equal(api.snapshot().map.a.signals.rate.value,0);assert.equal(api.status().busy,true);
 state.bound.pop();api.bindingsChanged();assert.equal(calls[1].signal.aborted,true);finish(calls[1],999);await settle();assert.equal(api.snapshot().map['nested::b'],undefined);assert.equal(api.snapshot().map.a.signals.rate.value,0);
 state.bound.push(['nested::b',carrier('replacement')]);api.bindingsChanged();await settle();assert.equal(calls.length,3);assert.equal(calls[2].bound[0].signals.rate.query,'replacement');finish(calls[2],7);await settle();assert.equal(api.snapshot().map['nested::b'].signals.rate.value,7);
 state.bound[1]=['nested::b',carrier('same-id-different-query')];api.bindingsChanged();await settle();assert.equal(api.snapshot().map['nested::b'],undefined);assert.equal(calls.length,4);finish(calls[3],8);await settle();assert.equal(api.snapshot().map.a.signals.rate.value,0);
 for(let i=0;i<5;i++){api.bindingsChanged();api.historyDay(i%3);}await settle();assert.equal(calls.length,4,'layout/slider with identical bindings never queries');
 state.bound.pop();api.bindingsChanged();state.bound.push(['nested::b',carrier('same-id-different-query')]);api.bindingsChanged();await settle();assert.equal(calls.length,4,'reopening same binding reuses cache');assert.equal(api.snapshot().map['nested::b'].signals.rate.value,8);api.destroy();
});
test('H16 new detail batches are canceled on off, Live return, destroy and capability loss; disabled roots never query',async()=>{
 for(const stop of [api=>api.setEnabled(false),api=>api.closeHistory(),api=>api.destroy(),api=>api.setAvailable(false)]){
  let calls=[];const {api,state,carrier}=changingRuntime({provider:async()=>sample(900),history:(bound,r,signal)=>bound[0].id==='a'?Promise.resolve(series([[T,0]])):new Promise(resolve=>calls.push({signal,resolve}))});
  api.setEnabled(true);await settle();api.openHistory(days,0);await settle();state.bound.push(['child',carrier('child')]);api.bindingsChanged();await settle();stop(api);assert.equal(calls[0].signal.aborted,true);calls[0].resolve({child:{signals:{rate:{series:[[T,999]]}}}});await settle();assert.equal(api.snapshot().map.child,undefined);api.destroy();
 }
 for(const [options,page] of [[false,{}],[{provider:()=>{throw Error('live disabled');},history:()=>{throw Error('history disabled');}},{tracking:{telemetry:{enabled:false}}}]]){
  const {api,state,carrier}=changingRuntime(options,page);api.openHistory(days,0);api.setEnabled(true);state.bound.push(['child',carrier('child')]);api.bindingsChanged();await settle();assert.equal(api.enabled(),false);api.destroy();
 }
});
test('H17 split DST runs and concurrent Jira work share one six-call pool to completion',async()=>{
 let active=0,max=0,releases=[],done=false;const h=grafana(()=>new Promise(resolve=>{active++;max=Math.max(max,active);releases.push(()=>{active--;resolve({payload:{data:[]}});});}));
 const jira=Array.from({length:2},()=>h.C.liveStatusHistoryCall(()=>new Promise(resolve=>{active++;max=Math.max(max,active);releases.push(()=>{active--;resolve();});})));
 const endpoints=localHistory('America/New_York',2026,3,7).map(({key,at})=>({key,at}));
 const answer=h.adapter.options.history(Array.from({length:4},(_,i)=>({...h.bindings[0],id:'split'+i})),{from:endpoints[0].at,to:endpoints.at(-1).at,endpoints},new AbortController().signal).then(value=>{done=true;return value;});
 await settle();assert.equal(active,6);
 for(let i=0;i<20&&!done;i++){releases.splice(0).forEach(release=>release());await settle();assert.ok(active<=6);}
 await Promise.all(jira);await answer;assert.equal(done,true);assert.equal(max,6);assert.equal(h.calls.length,16,'four carriers × two signals × two runs');
});
test('H18 a successful new-detail batch cannot erase a pending peer failure or its note',async()=>{
 const calls=[];const {api,state,carrier}=changingRuntime({provider:async()=>sample(900),history:(b,r,s)=>new Promise((resolve,reject)=>calls.push({resolve,reject}))});
 api.openHistory(days,0);api.setEnabled(true);await settle();state.bound.push(['child',carrier('child')]);api.bindingsChanged();await settle();calls[0].reject(new Error('root history unavailable'));await settle();assert.equal(api.status().state,'error');assert.equal(api.status().busy,true);
 calls[1].resolve({child:{signals:{rate:{series:[[T,7]]}}}});await settle();assert.equal(api.snapshot().map.child.signals.rate.value,7);assert.equal(api.status().state,'error');assert.equal(api.status().busy,false);assert.match(api.status().note,/root history unavailable/);api.destroy();
});
