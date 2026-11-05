'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('native').source,C);
const plain=v=>JSON.parse(JSON.stringify(v)),T=Date.UTC(2026,10,4,12),H=3600000,iso=t=>new Date(t).toISOString();
function fixture(){
 const page={},carrier={title:'API',tickets:['AA-1'],telemetry:{kind:'call',signals:{rate:{grafana:'explicit',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'},p95:{grafana:'latency',unit:'ms'}},proof:{rate:{min:1},errors:{max:.01,maxRatioOf:'rate'},p95:{max:200}},links:{query:'https://authored.test/q'}}};
 let bound=true,jira={'AA-1':{state:'done',updatedAt:iso(T-H)}};const log=C.liveStatusTelemetryActivity(),hooks={carriers:fn=>{if(bound)fn(carrier,'a',page);},jira:()=>jira,observed:log.observe,reset:log.clear,retire:log.retire,changed:()=>log.reconcile(api.snapshot().carriers)};
 const api=C.createTelemetry(page,{demo:{mount:()=>()=>{}}},hooks);
 const apply=(rate,errors=0,at=T,p95=100)=>api.apply({a:{observedAt:at===null?null:iso(at),signals:{rate:{value:rate},errors:{value:errors},p95:{value:p95}}}});
 return {api,log,carrier,apply,hooks,setJira:v=>jira=v,remove:()=>bound=false};
}
test('first traffic requires positive actual evidence after valid Done and emits once across repeated snapshots, Jira changes and replay',()=>{
 const f=fixture();f.apply(0);assert.equal(f.log.snapshot()[0].kind,'silent');f.apply(100,0,T+H);
 const first=f.log.snapshot().filter(e=>e.kind==='first-traffic');assert.equal(first.length,1,'first traffic transition is recorded');assert.equal(first[0].at,iso(T+H));assert.equal(first[0].url,'https://authored.test/q');
 f.apply(100,0,T+H);f.apply(200,0,T+2*H);f.api.snapshot();f.api.verdicts();f.hooks.jiraChanged();assert.equal(f.log.snapshot().filter(e=>e.kind==='first-traffic').length,1);
 f.api.destroy();
 for(const done of [null,'bad',iso(T+10*H)]){const g=fixture();g.setJira({'AA-1':{state:'done',updatedAt:done}});g.apply(100);assert.equal(g.log.snapshot().length,0);g.api.destroy();}
});
test('threshold transitions use the judged failing signal, both observed endpoints and full source/query/proof fingerprint',()=>{
 const f=fixture();f.apply(100,0);f.apply(100,5,T+H);let rows=f.log.snapshot().filter(e=>e.kind==='threshold');assert.equal(rows.length,1);assert.equal(rows[0].signal,'errors');assert.match(rows[0].text,/errors crossed outside/);
 f.apply(100,0,T+2*H);assert.match(f.log.snapshot()[0].text,/back within/);
 for(const change of [()=>f.carrier.telemetry.signals.errors.grafana='new query',()=>{delete f.carrier.telemetry.signals.errors.grafana;f.carrier.telemetry.signals.errors.honeycomb={calculations:[{op:'COUNT'}]};},()=>f.carrier.telemetry.proof.errors.max=.02]){
  change();f.api.bindingsChanged();assert.equal(f.log.snapshot().length,0);assert.deepEqual(plain(f.api.snapshot().map),{});f.apply(100,5,T+3*H);assert.equal(f.log.snapshot().filter(e=>e.kind==='threshold').length,0);
 }
 f.remove();f.api.bindingsChanged();assert.equal(f.log.snapshot().length,0);f.api.destroy();
});
test('silent hours use observation minus Done, dedupe within hour, never treat missing signals or unknown carriers as zero',()=>{
 const f=fixture();f.apply(0,0,T);f.apply(0,0,T+H/2);f.apply(0,0,T+H);assert.deepEqual(plain(f.log.snapshot().map(e=>e.text)),['Still silent 2 h after Done','Still silent 1 h after Done']);
 for(const value of [{x:{signals:{rate:{value:0}}}},{a:{signals:{unknown:{value:0}}}},{a:{signals:{rate:{series:[]}}}},{a:{signals:{rate:{value:0}}}},{a:{signals:{rate:{value:NaN}}}}])f.api.apply(value);
 assert.equal(f.log.snapshot().length,2);f.apply(0,0,null);assert.equal(f.log.snapshot().length,2);f.api.clear();assert.equal(f.log.snapshot().length,0);f.api.destroy();
});
test('held live observations emit once on Return Live; historical samples and slider visits never generate Activity',()=>{
 const f=fixture();f.api.setEnabled(true);f.apply(0);const before=plain(f.log.snapshot());
 f.api.openHistory([{at:iso(T-24*H),telemetry:{a:{observedAt:iso(T-24*H),signals:{rate:{value:99}}}}}],0);
 f.api.historyDay(0);f.apply(100,0,T+H);assert.deepEqual(plain(f.log.snapshot()),before);
 f.api.closeHistory();assert.equal(f.log.snapshot().filter(e=>e.kind==='first-traffic').length,1);
 const after=plain(f.log.snapshot());f.api.openHistory([{at:iso(T),telemetry:{}}],0);f.api.historyDay(0);f.api.closeHistory();assert.deepEqual(plain(f.log.snapshot()),after);
 f.api.setEnabled(false);assert.equal(f.log.snapshot().length,0);f.api.destroy();
});
test('typed events and Jira events share chronological cap 20, unknown times remain unavailable and objects are copied',()=>{
 const f=fixture();f.setJira({});for(let i=0;i<30;i++)f.apply(100,i%2?5:0,T+i*H);assert.equal(f.log.snapshot().length,20);
 const jira=Array.from({length:8},(_,i)=>({key:'AA-'+i,at:iso(T+(i+25)*H)}));jira.push({key:'unknown',at:null});
 const merged=plain(C.liveStatusActivity(jira,f.log.snapshot()));assert.equal(merged.length,20);assert.equal(merged[0].key,'AA-7');assert.ok(merged.every((e,i)=>!i || Date.parse(merged[i-1].at)>=Date.parse(e.at)));
 const copy=f.log.snapshot();copy[0].text='mutated';assert.notEqual(f.log.snapshot()[0].text,'mutated');f.api.destroy();
 const g=fixture();g.setJira({});g.apply(100,0,null);g.apply(100,5,null);assert.equal(g.log.snapshot()[0].at,null);g.api.destroy();
});
test('clear, unavailable and destroyed instances retire telemetry events without cross-instance effects',()=>{
 const a=fixture(),b=fixture();a.apply(100);b.apply(100);a.api.setAvailable(false);assert.equal(a.log.snapshot().length,0);assert.equal(b.log.snapshot().length,1);a.apply(0);assert.equal(a.log.snapshot().length,0);b.api.destroy();assert.equal(b.log.snapshot().length,0);a.api.destroy();
});
test('Production explanation names the actual failing error/latency signal and preserves zero/missing and safe link priority',()=>{
 const f=fixture();f.apply(100,5);let row=C.liveStatusProofPresentation(f.api.snapshot(),'24h').rows[0];assert.match(row.explanation,/errors is 5 req\/h; requires errors no more than 1% of rate/);assert.doesNotMatch(row.explanation,/rate is/);assert.equal(row.url,'https://authored.test/q');assert.equal(row.linkLabel,'Open in Grafana');
 f.apply(100,0,T+H,250);row=C.liveStatusProofPresentation(f.api.snapshot(),'24h').rows[0];assert.match(row.explanation,/p95 is 250 ms; requires p95 at most 200 ms/);
 f.apply(0);row=C.liveStatusProofPresentation(f.api.snapshot(),'24h').rows[0];assert.equal(row.kpis[0].text,'0 req/h');assert.doesNotMatch(row.since,/total|requests/);
 f.api.apply({a:{signals:{errors:{value:0}}}});row=C.liveStatusProofPresentation(f.api.snapshot(),'24h').rows[0];assert.equal(row.kpis[0].text,'unobserved');f.api.destroy();
});

test('detail reload retires identical binding evidence and transitions until a fresh accepted map',()=>{
 const f=fixture();f.apply(100);assert.equal(f.log.snapshot().length,1);f.api.bindingsChanged(['a']);assert.equal(f.log.snapshot().length,0);assert.deepEqual(plain(f.api.snapshot().map),{});f.apply(100,0,T+H);assert.equal(f.log.snapshot().length,1);f.api.destroy();
});
test('an in-flight provider answer from a retired detail cannot reintroduce old Production or Activity',async()=>{
 const page={},carrier={telemetry:{kind:'service',signals:{rate:{grafana:'explicit',unit:'req/h'}},proof:{rate:{min:1}}}},log=C.liveStatusTelemetryActivity();let resolve;
 const api=C.createTelemetry(page,{provider:()=>new Promise(r=>resolve=r)},{carriers:fn=>fn(carrier,'detail::api',page),observed:log.observe,reset:log.clear,retire:log.retire});api.setEnabled(true);await new Promise(setImmediate);
 api.bindingsChanged(['detail::api']);resolve({'detail::api':{observedAt:iso(T),signals:{rate:{value:100}}}});for(let i=0;i<4;i++)await new Promise(setImmediate);
 assert.deepEqual(plain(api.snapshot().map),{});assert.equal(log.snapshot().length,0);api.destroy();
});

test('initial host preload is accepted, but explicit off retires writes until intentional enable',()=>{
 for(const start of [false,true]){
  const f=fixture();f.apply(100);assert.equal(f.api.enabled(),false);assert.equal(f.log.snapshot().length,1,'initial preload is evidence before the first enable');
  if(start)f.api.setEnabled(true);
  f.api.setEnabled(false);f.apply(777);
  assert.deepEqual(plain(f.api.snapshot().map),{},'late host apply after explicit off cannot restore the map');assert.equal(f.log.snapshot().length,0);
  f.api.setEnabled(true);assert.deepEqual(plain(f.api.snapshot().map),{},'enable cannot recover retired evidence');assert.equal(f.log.snapshot().length,0);
  f.apply(12,0,T+H);assert.equal(f.api.snapshot().map.a.signals.rate.value,12);assert.equal(f.log.snapshot().length,1,'a fresh accepted observation resumes Activity');f.api.destroy();
 }
});
test('off retires held history observations and late demo writes; clear and capability recovery never reopen off writes',()=>{
 const f=fixture();f.api.setEnabled(true);f.apply(0);f.api.openHistory([{at:iso(T),telemetry:{a:{signals:{rate:{value:0}}}}}],0);f.apply(100,0,T+H);
 f.api.setEnabled(false);f.api.clear();f.apply(777,0,T+2*H);f.api.historyDay(0);f.api.closeHistory();
 assert.deepEqual(plain(f.api.snapshot().map),{});assert.equal(f.log.snapshot().length,0);
 f.api.setAvailable(false);f.api.setAvailable(true);f.apply(888);assert.deepEqual(plain(f.api.snapshot().map),{},'capability return stays off');
 f.api.setEnabled(true);assert.equal(f.log.snapshot().length,0);assert.deepEqual(plain(f.api.snapshot().map),{});f.apply(12);assert.equal(f.log.snapshot().length,1);
 f.api.clear();assert.equal(f.log.snapshot().length,0);f.apply(15);assert.equal(f.api.snapshot().map.a.signals.rate.value,15,'clear allows a subsequent current-session observation');
 f.api.destroy();f.apply(999);assert.deepEqual(plain(f.api.snapshot().map),{});assert.equal(f.log.snapshot().length,0);
 let callback;const demo=C.createTelemetry({}, {demo:{mount(api){callback=()=>api.apply({a:{signals:{rate:{value:777}}}});return callback;}}},{});
 demo.setEnabled(true);callback();demo.setEnabled(false);callback();assert.deepEqual(plain(demo.snapshot().map),{},'cleanup and queued demo callbacks cannot restore off evidence');demo.destroy();
});
test('pending provider answers from an off session are rejected after re-enable, fresh answers resume',async()=>{
 const pending=[],carrier={telemetry:{kind:'service',signals:{rate:{grafana:'explicit'}},proof:{rate:{min:1}}}};
 const api=C.createTelemetry({}, {provider:(_,signal)=>new Promise(resolve=>pending.push({resolve,signal}))},{carriers:fn=>fn(carrier,'a',{})});
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
 try{
  api.setEnabled(true);await settle();api.setEnabled(false);assert.equal(pending[0].signal.aborted,true);api.setEnabled(true);await settle();
  pending[0].resolve({a:{signals:{rate:{value:777}}}});await settle();assert.deepEqual(plain(api.snapshot().map),{});
  pending[1].resolve({a:{signals:{rate:{value:12}}}});await settle();assert.equal(api.snapshot().map.a.signals.rate.value,12);
 }finally{api.destroy();}
});

test('initial capability discovery keeps host preload, actual capability loss retires it',()=>{
 const api=C.createTelemetry({}, {available:false,demo:{mount:()=>()=>{}}},{}),sample={a:{signals:{rate:{value:12}}}};
 api.setAvailable(false);api.setAvailable(true);api.apply(sample);assert.equal(api.enabled(),false);assert.equal(api.snapshot().map.a.signals.rate.value,12,'initial discovery is not an explicit off');
 api.setAvailable(false);api.setAvailable(true);api.apply(sample);assert.deepEqual(plain(api.snapshot().map),{},'capability recovery after a real removal cannot reopen preload');api.destroy();
});
