'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('native').source,C);
const T=Date.UTC(2026,10,4,12),H=3600000,iso=t=>new Date(t).toISOString(),plain=v=>JSON.parse(JSON.stringify(v));
const sample=(value=1200,aggregate={kind:'total',from:iso(T-H),to:iso(T)})=>({observedAt:iso(T),signals:{rate:{value,unit:'events',aggregate,series:[[T-H,5],[T,10]]}}});
function present(raw=sample(),done=T-H,extra={}){
 const carriers=['local','direct::api','outer::inner::api','loaded::inner::api'].map(id=>({id,title:id,tickets:['AA-1'],kind:'service',signals:{rate:{source:'grafana',query:'explicit',unit:'req/h'}},proof:{rate:{min:1}},links:{}}));
 const map=Object.fromEntries(carriers.map(c=>[c.id,C.telemetrySample(raw)])),jiraMap={'AA-1':{state:'done',updatedAt:iso(done)}};
 return C.liveStatusProofPresentation({carriers,map,verdicts:C.proofVerdicts({carriers,jiraMap,telemetryMap:map}),...extra},'24h');
}
test('measured total normalization copies only valid bounds and preserves original value and unit including zero',()=>{
 for(const value of [0,1200,1200.123456789,Number.MAX_SAFE_INTEGER]){
  const raw=sample(value);raw.signals.rate.aggregate.extra='discard';const before=JSON.stringify(raw),out=C.telemetrySample(raw);
  assert.deepEqual(plain(out.signals.rate.aggregate),{kind:'total',from:iso(T-H),to:iso(T)});assert.equal(out.signals.rate.value,value);assert.equal(out.signals.rate.unit,'events');assert.equal(JSON.stringify(raw),before);
  out.signals.rate.aggregate.from='mutated';assert.equal(raw.signals.rate.aggregate.from,iso(T-H));
 }
 const raw=sample();raw.observedAt=T;raw.signals.rate.aggregate={kind:'total',from:T-H,to:T};assert.deepEqual(plain(C.telemetrySample(raw).signals.rate.aggregate),{kind:'total',from:iso(T-H),to:iso(T)});
});
test('malformed, unsafe, unobserved or future aggregate ranges never turn ordinary evidence into totals',()=>{
 for(const aggregate of [null,[],{},'total',{kind:'rate',from:T-H,to:T},{kind:'total',from:T,to:T},{kind:'total',from:T+1,to:T},{kind:'total',from:'bad',to:T},{kind:'total',from:T-H,to:T+1},{kind:'total',from:1e100,to:T}]){
  const out=C.telemetrySample(sample(1200,aggregate));assert.equal(out.signals.rate.aggregate,undefined,JSON.stringify(aggregate));assert.equal(out.signals.rate.value,1200);
 }
 for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1200',null])assert.equal(C.telemetrySample(sample(value)).signals.rate.aggregate,undefined);
 for(const observedAt of [undefined,null,'bad',T-1,1e100])assert.equal(C.telemetrySample({...sample(),observedAt}).signals.rate.aggregate,undefined);
});
test('since-Done totals require the exact Done boundary for every bound local and imported carrier, preserving zero and precision',()=>{
 for(const value of [0,1200,1200.123456789])for(const row of present(sample(value)).rows){assert.match(row.since,new RegExp('rate total: '+String(value).replaceAll('.','\\.')+' events through '+iso(T)));assert.match(row.since,/Done /);}
 for(const delta of [-1,1,H])for(const row of present(sample(),T-H+delta).rows)assert.doesNotMatch(row.since,/total:/,'wrong Done must not display a since-Done total');
 const raw=sample();raw.signals.unbound={value:777,aggregate:raw.signals.rate.aggregate};delete raw.signals.rate.aggregate;for(const row of present(raw).rows)assert.doesNotMatch(row.since,/total:/,'only bound signals qualify');
});
test('ordinary headlines and series are never totals; history endpoints and embedded days cannot borrow live aggregates',()=>{
 const raw=sample();delete raw.signals.rate.aggregate;for(const row of present(raw).rows)assert.doesNotMatch(row.since,/total:/);
 for(const at of [T-H/2,T,T+H])for(const row of present(sample(),T-H,{historical:true,at:iso(at)}).rows)assert.doesNotMatch(row.since,/total:/);
 const projected=C.telemetryHistoryDay({a:sample()},{at:iso(T)});assert.equal(projected.a.signals.rate.value,10);assert.equal(projected.a.signals.rate.aggregate,undefined);
});
test('runtime totals follow actual Done changes, clear/off/unavailable/destroy, with no initial-preload query',()=>{
 let done=T-H,calls=0;const carrier={tickets:['AA-1'],telemetry:{kind:'service',signals:{rate:{grafana:'explicit'}},proof:{rate:{min:1}}}};
 const api=C.createTelemetry({}, {demo:{mount(){calls++;return ()=>{};}}},{carriers:fn=>fn(carrier,'a',{}),jira:()=>({'AA-1':{state:'done',updatedAt:iso(done)}})});
 const row=()=>C.liveStatusProofPresentation(api.snapshot(),'24h')?.rows[0];
 api.apply({a:sample(0)});assert.match(row().since,/rate total: 0 events/);assert.equal(calls,0);done++;assert.doesNotMatch(row().since,/total:/);done--;
 api.clear();assert.equal(row(),undefined);api.apply({a:sample()});assert.match(row().since,/total:/);api.setEnabled(false);api.apply({a:sample()});assert.equal(row(),undefined);
 api.setEnabled(true);assert.equal(row(),undefined);api.apply({a:sample()});assert.match(row().since,/total:/);api.setAvailable(false);api.apply({a:sample()});assert.equal(row(),undefined);api.destroy();api.apply({a:sample()});assert.equal(row(),undefined);
});
