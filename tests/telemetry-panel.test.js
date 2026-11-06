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
 assert.equal(model.rows[4].telemetry,'unobserved');assert.equal(model.rows[4].label,'DONE · traffic not measured');assert.equal(C.liveStatusProofPresentation({...input,map:{}},'24h'),null);
 const unbound={...input,carriers:[input.carriers.at(-1)],verdicts:plain(C.proofVerdicts({carriers:[input.carriers.at(-1)]}))};
 assert.equal(C.liveStatusProofPresentation(unbound,'24h'),null);
});
test('Proof activation requires finite evidence on an explicitly bound signal of an in-scope carrier, including zero',()=>{
 const carriers=[binding('local'),binding('direct::api'),binding('outer::inner::api'),binding('loaded::inner::api'),{...binding('unbound'),signals:{}}];
 const present=map=>{const snapshot=freeze({carriers,map,verdicts:plain(C.proofVerdicts({carriers,telemetryMap:map}))});return C.liveStatusProofPresentation(snapshot,'24h');};
 const invalid=[
  ['unknown carrier',{unknown:{signals:{rate:{value:42}}}}],
  ['unbound carrier',{unbound:{signals:{rate:{value:42}}}}],
  ['unbound signal',{local:{signals:{lag:{value:42}}}}],
  ['empty sample',{local:{}}],['empty signals',{local:{signals:{}}}],
  ['empty bound signal',{local:{signals:{rate:{}}}}],['empty series',{local:{signals:{rate:{series:[]}}}}],
  ['markers and links only',{local:{markers:[{kind:'deploy',at:iso(T)}],links:{dashboard:'https://provider.test'}}}],
  ...[null,undefined,NaN,Infinity,-Infinity,'0',false].map(value=>['invalid value '+String(value),{local:{signals:{rate:{value}}}}]),
  ...[[T,NaN],[T,Infinity],['invalid',0],[T,'0'],[T,0,1],null].map(point=>['invalid point '+String(point),{local:{signals:{rate:{series:[point]}}}}])
 ];
 for(const [label,map] of invalid)assert.equal(present(map)===null,true,label+' must not activate Proof');
 for(const c of carriers.slice(0,4))for(const entry of [{value:0},{series:[[T,0]]},{value:1},{series:[[iso(T),2]]}]){
  const model=present({[c.id]:{signals:{rate:entry}}});assert.ok(model,c.id+' finite measurement activates Proof');
  assert.equal(model.counts.bound,4);assert.equal(model.counts.unbound,1);assert.equal(model.rows.length,4);
  assert.equal(model.rows.find(r=>r.id===c.id).kpis[0].text,(entry.value??entry.series[0][1])+' req/h');
  assert.ok(model.rows.filter(r=>r.id!==c.id).every(r=>r.telemetry==='unobserved'));
 }
});
test('Proof uses explicit kind/signals, truthful predicates and units, zero versus missing, and only evidenced since Done facts',()=>{
 const input=fixture(),model=C.liveStatusProofPresentation(input,'24h');
 assert.equal(model.rows[0].predicate,'rate at least 1 req/h; errors no more than 1% of rate; p95 at most 200 ms');
 assert.equal(model.rows[2].kpis[0].text,'0 req/h');assert.equal(model.rows[4].kpis[0].text,'unobserved');assert.match(model.rows[0].since,/First observed traffic/);assert.doesNotMatch(model.rows[0].since,/requests|total|hours|48/);
 const q=input.carriers[0];q.kind='queue';q.title='Errors p95 requests';q.signals={in:{unit:'msg/s'},lag:{unit:'msgs'},age:{unit:'s'}};q.proof={in:{min:1},lag:{max:500},age:{max:60}};
 input.map.a.signals={in:{value:25},lag:{value:0},age:{value:1.5}};
 const result=C.liveStatusProofPresentation(input,'6h');assert.deepEqual(plain(result.rows[0].kpis.map(({label,text})=>({label,text}))),[{label:'in',text:'25 msg/s'},{label:'lag',text:'0 msgs'},{label:'age',text:'1.5 s'}]);assert.match(result.predicate,/each carrier/);
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

test('no-threshold evidence never says thresholds met, and COUNT caveats stay on Honeycomb carriers',()=>{
 const cw={id:'cloud',title:'Cloud',tickets:['CW-1'],kind:'service',signals:{events:{source:'cloudwatch',query:{},unit:'events'}},proof:{},links:{}};
 const hc={...cw,id:'honey',signals:{events:{source:'honeycomb',query:{calculations:[{op:'COUNT'}]},unit:'events'}}};
 const carriers=[cw,hc],map={cloud:{signals:{events:{value:20}}},honey:{signals:{events:{value:20}}}};
 const model=C.liveStatusProofPresentation({carriers,map,verdicts:C.proofVerdicts({carriers,jiraMap:{'CW-1':{state:'done'}},telemetryMap:map})},'24h');
 for(const row of model.rows){assert.equal(row.label,'DONE · traffic not measured');assert.doesNotMatch(row.explanation,/meet.*thresholds/);assert.match(row.predicate,/no authored thresholds/);}
 assert.doesNotMatch(model.rows[0].predicate,/Honeycomb COUNT/);assert.match(model.rows[1].predicate,/Honeycomb COUNT counts source rows/);
 assert.doesNotMatch(C.telemetryCardContent({from:'a',to:'b'},cw,map.cloud,null,'24h').scope,/COUNT/);
 assert.match(C.telemetryCardContent({from:'a',to:'b'},hc,map.honey,null,'24h').scope,/COUNT: source rows/);
});

test('unknown Jira preserves observed, silent, degraded and incomplete evidence labels without proof',()=>{
 const cases=[
  ['healthy',{rate:{min:1}},{rate:{value:12}},'OBSERVED'],
  ['silent',{rate:{min:1}},{rate:{value:0},errors:{value:0}},'SILENT'],
  ['degraded',{rate:{min:20}},{rate:{value:12}},'DEGRADED'],
  ['no minimum',{}, {rate:{value:12}},'OBSERVED'],
  ['partial',{rate:{min:1},errors:{max:0}},{rate:{value:12}},'OBSERVED · evidence incomplete'],
  ['missing',{rate:{min:1}}, {},'UNOBSERVED']
 ];
 for(const id of ['local','shared::api','outer::inner::api','loaded::api'])for(const [name,proof,signals,label] of cases){
  const b={...binding(id),proof},anchor=binding('anchor'),carriers=[b,anchor],map={[id]:{signals},anchor:{signals:{rate:{value:1},errors:{value:0},p95:{value:1}}}};
  const verdicts=C.proofVerdicts({carriers,jiraMap:{},telemetryMap:map}),row=C.liveStatusProofPresentation({carriers,map,verdicts},'24h').rows[0];
  assert.equal(row.label,label+' · Jira status unavailable',id+' '+name);assert.equal(row.verdict,null);assert.equal(verdicts.rollups.proven,0);assert.doesNotMatch(row.label,/PROVEN/);
  if(name==='degraded')assert.match(row.explanation,/Outside proof threshold/);
  if(name==='no minimum')assert.doesNotMatch(row.explanation,/meet.*thresholds/);
 }
});


test('missing company alias and pending no-threshold evidence never claim observed signals on any node origin',()=>{
 for(const id of ['local','shared::api','outer::inner::api','loaded::api']){
  const b={id,title:id,tickets:[],kind:'service',signals:{events:{source:'cloudwatch',query:{accountId:'${iot}'},error:'Set telemetry variable ${iot} in the active environment.'}},proof:{},links:{}};
  for(const [value,pending,expected] of [[null,false,'No observed signals'],[null,true,'No observed signals'],[0,false,'Observed signals'],[12,true,'Observed signals']]){
   const map=value===null?{}:{[id]:{signals:{events:{value}}}},carriers=[b],model=C.liveStatusProofPresentation({carriers,map,pending:pending?{[id]:{events:true}}:{},verdicts:C.proofVerdicts({carriers,telemetryMap:map})},'24h',true),row=model.rows[0];
   assert.equal(row.predicate,expected+'; no authored thresholds');assert.doesNotMatch(row.explanation,/meet.*thresholds/);if(value===null)assert.equal(row.label,pending?'Loading…':'UNOBSERVED');
  }
 }
});
