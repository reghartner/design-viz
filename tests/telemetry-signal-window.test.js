'use strict';
/* #1108: a metric card row and Inspect show a signal's own time span next to its
   value when it differs from the board window. The span is the signal's declared
   `window`, else the one range selector of a PromQL/LogQL counting query. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint,composeSources}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('standalone').body,C);
const V={URL,TextEncoder};vm.createContext(V);vm.runInContext(composeSources(['canon.js','validator.js','workbench/commands/telemetry.js']),V);
const plain=x=>JSON.parse(JSON.stringify(x));
const LOKI_1H='sum(count_over_time({app="notify"} |= "event consumed" [1h]))';

function texts(signal,window='24h',value=42){
 const edge={from:'a',to:'b',telemetry:{kind:'service',signals:{count:signal}}},warnings=[];
 const binding=C.carrierTelemetry(edge,{},(at,message)=>warnings.push(at+': '+message));
 assert.deepEqual(warnings,[],JSON.stringify(signal));
 const sample={signals:{count:{value}}},id='a->b',carrier={...binding,id,title:'A to B',tickets:[]};
 const verdicts=C.proofVerdicts({carriers:[carrier],jiraMap:{},telemetryMap:{[id]:sample}});
 const inspect=C.liveStatusProofPresentation({carriers:[carrier],map:{[id]:sample},verdicts},window,true).rows[0];
 return {card:C.telemetryCardContent(edge,binding,sample,{telemetry:'observed'},window).rows[0].text,inspect:inspect.kpis[0].text};
}

test('1: a Loki count_over_time [1h] signal on a 24h board shows "last 1h" on the card row and in Inspect',()=>{
 assert.deepEqual(texts({loki:LOKI_1H}),{card:'42 · last 1h',inspect:'42 · last 1h'});
 assert.deepEqual(texts({loki:LOKI_1H,unit:'events'}),{card:'42 events · last 1h',inspect:'42 events · last 1h'});
 assert.deepEqual(texts({grafana:'sum(increase(push_sent_total{app="notify"}[7d]))',unit:'pushes'}),{card:'42 pushes · last 7d',inspect:'42 pushes · last 7d'});
 // Brackets inside string literals are not range selectors.
 assert.deepEqual(texts({loki:'sum(count_over_time({app="notify"} |~ "code=[45][0-9]{2}" [1h]))'}).card,'42 · last 1h');
});

test('2: a declared window wins over the query range and uses the page window grammar',()=>{
 assert.deepEqual(texts({loki:LOKI_1H,window:'7d'}),{card:'42 · last 7d',inspect:'42 · last 7d'});
 assert.equal(texts({loki:LOKI_1H,window:'now-7d'}).card,'42 · last 7d');
 assert.equal(texts({sql:'select count(*) from pushes where at > now() - interval 1 hour',window:'1h',unit:'pushes'}).card,'42 pushes · last 1h');
 const binding=C.carrierTelemetry({telemetry:{kind:'service',signals:{count:{loki:LOKI_1H,window:'-7d'}}}},{});
 assert.equal(binding.signals.count.window,'7d');
 // Log details carry the same span as the card row.
 const logs={cloudwatchLogs:{logGroups:['g'],query:'stats count() as n',region:'us-east-1',valueField:'n',breakdown:{query:'stats count() as n by clientId',labelField:'clientId',valueField:'n'}},window:'1h'};
 const logBinding={...C.carrierTelemetry({telemetry:{kind:'service',signals:{count:logs}}},{}),id:'a->b',title:'A to B'};
 assert.equal(C.liveStatusLogDetails({enabled:true,carriers:[logBinding],map:{'a->b':{signals:{count:{value:42}}}}},'24h')[0].total,'42 · last 1h');
 // An unset variable in window drops only window; the query still runs.
 const warnings=[],unset=C.carrierTelemetry({telemetry:{kind:'service',signals:{count:{loki:LOKI_1H,window:'${span}'}}}},{},(at,message)=>warnings.push(at+': '+message),{environment:'stg'});
 assert.equal(unset.signals.count.error,undefined);assert.equal(unset.signals.count.window,undefined);assert.match(warnings.join('\n'),/^\.signals\.count\.window: unresolved telemetry variable span/);
 assert.equal(C.carrierTelemetry({telemetry:{kind:'service',signals:{count:{loki:LOKI_1H,window:'${span}'}}}},{},null,{environment:'stg',variables:{span:'7d'}}).signals.count.window,'7d');
});

test('3: [$__range] or a span equal to the board window adds no label',()=>{
 for(const [signal,window] of [
  [{loki:'sum(count_over_time({app="notify"} |= "event consumed" [$__range]))'},'24h'],
  [{loki:'sum(count_over_time({app="notify"} [$__range]))'},'6h'],
  [{loki:LOKI_1H},'1h'],
  [{loki:'sum(count_over_time({app="notify"} [24h]))'},'24h'],
  [{grafana:'sum(increase(x_total[1d]))'},'24h'],
  [{loki:LOKI_1H,window:'24h'},'24h'],
  [{loki:LOKI_1H,window:'now-1d'},'24h'],
 ]){const shown=texts(signal,window);assert.deepEqual(shown,{card:'42',inspect:'42'},JSON.stringify(signal)+' on '+window);}
});

test('4: without a declaration, a query with no range selector or several adds no label',()=>{
 for(const signal of [
  {grafana:'sum(push_sent_total{app="notify"})'},
  {grafana:'sum(increase(a_total[1h]))/sum(increase(b_total[1h]))'},
  {loki:'sum(count_over_time({app="a"}[1h])) + sum(count_over_time({app="b"}[5m]))'},
  {grafana:'sum(increase(a_total[$__rate_interval]))'},
  {grafana:'sum(count_over_time(up[1h:5m]))'},
  // A per-second rate is not a counting query.
  {grafana:'sum(rate(push_sent_total{app="notify"}[5m]))'},
  {sql:'select count(*) from pushes'},
 ])assert.deepEqual(texts(signal),{card:'42',inspect:'42'},JSON.stringify(signal));
 assert.deepEqual(texts({loki:LOKI_1H},'24h',null),{card:'unobserved',inspect:'unobserved'},'no value, no span');
});

test('5: a malformed window is a validation warning at its field path; the signal still binds',()=>{
 const spec=window=>({page:{tracking:{telemetry:{grafana:{loki:'logs'}}},sections:[{diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],
  edges:[{from:'a',to:'b',telemetry:{kind:'service',signals:{count:{loki:LOKI_1H,window}}}}],panels:[{id:'status',type:'live-status'}]}}]}});
 const ok=plain(V.validate(V.normalize(spec('7d'))));assert.deepEqual(ok.warnings.filter(w=>/telemetry/.test(w)),[]);
 for(const window of ['soon','7',7,'',null,'0h','1h30m']){
  const result=plain(V.validate(V.normalize(spec(window))));assert.deepEqual(result.errors,[],JSON.stringify(window));
  const warnings=result.warnings.filter(w=>/telemetry/.test(w));
  assert.equal(warnings.length,1,JSON.stringify(window)+': '+warnings.join(' | '));
  assert.match(warnings[0],/^sections\[0\]\.diagram\.edges\[0\]\.telemetry\.signals\.count\.window: use a duration such as/,JSON.stringify(window));
  const binding=V.carrierTelemetry(spec(window).page.sections[0].diagram.edges[0],{});
  assert.equal(binding.signals.count.window,undefined);assert.equal(binding.signals.count.query,LOKI_1H);
 }
 // CloudWatch always queries the page window, so a declared span would be false.
 const warnings=[],cw=V.carrierTelemetry({telemetry:{kind:'service',signals:{sum:{cloudwatch:{namespace:'AWS/IoT',metric:'TopicMatch',region:'us-east-1',accountId:'111111111111',dimensions:{RuleName:'r'},statistic:'Sum'},window:'7d'}}}},{},(at,message)=>warnings.push(at+': '+message));
 assert.deepEqual(warnings,['.signals.sum.window: cloudwatch signals always cover the page window — ignored']);assert.equal(cw.signals.sum.window,undefined);
});

test('Workbench edits of other signal fields keep an authored window',()=>{
 const binding={kind:'service',signals:{count:{loki:LOKI_1H,window:'7d'}}};
 for(const [field,value] of [['unit','events'],['label','Count'],['scope','notify'],['showOnCard',false],['query','sum(count_over_time({app="x"}[1h]))'],['source','grafana']]){
  const result=V.telemetryEditBinding(plain(binding),{op:'signal',name:'count',field,value},{});
  assert.equal(result.error,undefined,field);assert.equal(result.value.signals.count.window,'7d',field);
 }
});
