'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('native').source,C);
const plain=v=>JSON.parse(JSON.stringify(v)),T=Date.UTC(2026,10,4,12),H=3600000,iso=t=>new Date(t).toISOString();
const binding=(id,kind='call')=>({id,title:'Carrier <'+id+'>',tickets:[id.toUpperCase()+'-1'],kind,signals:{rate:{source:'grafana',query:'explicit',unit:'req/h'},errors:{source:'grafana',query:'errors',unit:'req/h'},p95:{source:'grafana',query:'latency',unit:'ms'}},proof:{rate:{min:1},errors:{max:.01,maxRatioOf:'rate'},p95:{max:200}},links:{}});
function fixture(){const carriers=['a','b','c','d','e'].map(id=>binding(id));carriers.push({...binding('unbound'),signals:{}});
 const jiraMap=Object.fromEntries(carriers.map(c=>[c.tickets[0],{state:c.id==='d'?'active':'done',updatedAt:iso(T-H)}]));
 const sample=(rate,errors=0)=>({signals:{rate:{value:rate,series:[[T-H,rate],[T-H/2,rate],[T,rate]]},errors:{value:errors},p95:{value:100}},observedAt:iso(T),markers:[],links:{}});
 const map={a:sample(100),b:sample(100,5),c:sample(0),d:sample(10),e:{signals:{},observedAt:iso(T)}};
 return {carriers,map,verdicts:plain(C.proofVerdicts({carriers,jiraMap,telemetryMap:map}))};}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
test('Proof rows and disjoint arcs use exactly the bound denominator, preserve neutral/unbound and never mutate snapshots',()=>{
 const input=freeze(fixture()),before=JSON.stringify(input),model=C.liveStatusProofPresentation(input,'24h');
 assert.deepEqual(plain(model.counts),{bound:5,unbound:1,proven:1,degraded:1,unproven:1,liveEarly:1,neutral:1});
 assert.deepEqual(plain(model.arcs.map(a=>[a.size,a.offset])),[[20,0],[20,20],[20,40],[20,60]]);
 assert.deepEqual(plain(model.rows.map(r=>r.id)),['a','b','c','d','e']);assert.equal(JSON.stringify(input),before);
 assert.match(model.sentence,/1 of 5 bound carriers proven/);assert.match(model.sentence,/1 carriers unbound/);
 assert.equal(model.rows[4].telemetry,'unobserved');assert.equal(model.rows[4].label,'DONE');assert.equal(C.liveStatusProofPresentation({...input,map:{}},'24h'),null);
 const unbound={...input,carriers:[input.carriers.at(-1)],verdicts:plain(C.proofVerdicts({carriers:[input.carriers.at(-1)]}))};
 assert.equal(C.liveStatusProofPresentation(unbound,'24h').arcs[0].size,0);
});
test('Proof uses explicit kind/signals, truthful predicates and units, zero versus missing, and only evidenced since Done facts',()=>{
 const input=fixture(),model=C.liveStatusProofPresentation(input,'24h');
 assert.equal(model.rows[0].predicate,'rate at least 1 req/h; errors no more than 1% of rate; p95 at most 200 ms');
 assert.equal(model.rows[2].kpis[0].text,'0 req/h');assert.equal(model.rows[4].kpis[0].text,'unobserved');assert.match(model.rows[0].since,/First observed traffic/);assert.doesNotMatch(model.rows[0].since,/requests|total|hours|48/);
 const q=input.carriers[0];q.kind='queue';q.title='Errors p95 requests';q.signals={in:{unit:'msg/s'},lag:{unit:'msgs'},age:{unit:'s'}};q.proof={in:{min:1},lag:{max:500},age:{max:60}};
 input.map.a.signals={in:{value:25},lag:{value:0},age:{value:1.5}};
 const result=C.liveStatusProofPresentation(input,'6h');assert.deepEqual(plain(result.rows[0].kpis),[{label:'in',text:'25 msg/s'},{label:'lag',text:'0 msgs'},{label:'age',text:'1.5 s'}]);assert.match(result.predicate,/each carrier/);
});
test('Proof link policy chooses safe authored links first, provider fallback second, and has no dead link',()=>{
 const input=fixture();input.carriers[0].links={dashboard:'https://authored.test/d',query:'https://authored.test/q'};input.map.a.links={dashboard:'https://provider.test/d'};
 assert.equal(C.liveStatusProofPresentation(input,'24h').rows[0].url,'https://authored.test/d');
 input.carriers[0].links={dashboard:'javascript:alert(1)',query:'https://authored.test/q'};assert.equal(C.liveStatusProofPresentation(input,'24h').rows[0].url,'https://authored.test/q');
 input.carriers[0].links={dashboard:'javascript:alert(1)'};assert.equal(C.liveStatusProofPresentation(input,'24h').rows[0].url,'https://provider.test/d');
 input.map.a.links={query:'data:text/html,bad'};assert.equal(C.liveStatusProofPresentation(input,'24h').rows[0].url,null);
});
test('Proof charts clip actual points and Done/deploy markers to the configured window and keep sparse history sparse',()=>{
 const input=fixture();input.map.a.markers=[{kind:'deploy',at:iso(T-H/2),label:'Release <one>'},{kind:'deploy',at:iso(T-2*H)},{kind:'deploy',at:iso(T+H)},{kind:'note',at:iso(T)}];
 input.map.a.signals.rate.series=[[T-2*H,1],[T-H,2],[T-H*.75,3],[T-H*.5,4],[T-H*.25,5],[T,6],[T+H,7]];
 const chart=C.liveStatusProofPresentation(input,'1h').rows[0].chart;assert.equal(chart.points.length,5);assert.ok(chart.line);assert.deepEqual(plain(chart.markers.map(m=>m.kind)),['deploy','done']);assert.equal(chart.markers[0].x,50);
 input.historical=true;input.at=iso(T);input.map.a=C.telemetryHistoryDay(input.map,{at:iso(T)}).a;
 const history=C.liveStatusProofPresentation(input,'24h').rows[0].chart;assert.equal(history.points.length,1);assert.equal(history.line,null);assert.deepEqual(plain(history.markers.map(m=>m.kind)),['done']);
 input.map.a.signals={};assert.equal(C.liveStatusProofPresentation(input,'24h').rows[0].kpis[0].text,'unobserved');
});
test('controller snapshot carries the same resolved bindings/verdicts for presentation and accepts host apply while Metrics is off',()=>{
 const page={tracking:{telemetry:{window:'6h'}}},carrier={title:'Bound <API>',tickets:['AA-1'],telemetry:{kind:'service',signals:{rate:{grafana:'explicit',unit:'req/h'}},proof:{rate:{min:1}},links:{query:'https://authored.test/q'}}};
 let calls=0;const api=C.createTelemetry(page,{provider:()=>{calls++;return {};}},{carriers:fn=>fn(carrier,'direct::nested::api',page),jira:()=>({'AA-1':{state:'done'}})});
 api.apply({'direct::nested::api':{signals:{rate:{value:5}}}});const snap=api.snapshot(),model=C.liveStatusProofPresentation(snap,'6h');assert.equal(api.enabled(),false);assert.equal(calls,0);assert.equal(model.rows[0].label,'PROVEN');assert.equal(model.rows[0].title,carrier.title);assert.equal(model.rows[0].url,'https://authored.test/q');
 snap.carriers[0].signals.rate.query='changed';assert.equal(api.bindings()[0].signals.rate.query,'explicit');api.setAvailable(false);assert.equal(C.liveStatusProofPresentation(api.snapshot(),'6h'),null);api.destroy();
});
