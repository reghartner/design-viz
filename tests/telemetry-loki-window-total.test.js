'use strict';
// #1080: a Loki signal whose query contains $__range reports the whole-window
// total from ONE instant query; other Loki queries keep the range call.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const NOW=Date.UTC(2026,10,6,15),HOUR=3600000,DAY=24*HOUR,iso=n=>new Date(n).toISOString(),plain=x=>JSON.parse(JSON.stringify(x));
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
function context(now=NOW){const C={URL,TextEncoder,TextDecoder,AbortController,console,Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}},document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
const days=()=>{const now=new Date(NOW),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(today);end.setDate(end.getDate()+1);return [-1,0,1].map(offset=>{const date=new Date(today),at=new Date(end);date.setDate(date.getDate()+offset);at.setDate(at.getDate()+offset);return {key:date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'),at:at.toISOString()};});};
const TOTAL='sum(count_over_time({app="x"} |= "y" [$__range]))',PLAIN='sum(count_over_time({app="x"} |= "y" [1h]))';
const instant=(value,at=NOW)=>({payload:{data:[{timestamp:(at/1000).toFixed(3),value:String(value),labels:{}}]}});
async function setup({signals,answer,window='24h'}){
 const C=context(),page={tracking:{telemetry:{window,grafana:{loki:'logs'}}}},nodes={local:{telemetry:{kind:'service',signals:plain(signals),proof:{}}}},calls=[];
 const tools=[{server:'Grafana',tools:['query_loki_logs']}];
 const adapter=C.createTelemetryProviders(page,{claude:{use:async()=>({listTools:async()=>tools,callTool:async(server,tool,input)=>{const call={server,tool,input:plain(input)};calls.push(call);return answer(call);}})}}),api=C.createTelemetry(page,adapter.options,{carriers:fn=>Object.entries(nodes).forEach(([id,node])=>fn(node,id,page))}),handle=adapter.attach({telemetry:api},page);await settle();
 return {calls,api,close(){handle.destroy();api.destroy();}};
}

test('Live: a $__range query is one instant call with the page window substituted; its value is the instant result',async t=>{
 for(const [window,duration] of [['24h','86400s'],['6h','21600s']]){
  const h=await setup({window,signals:{total:{loki:TOTAL}},answer:()=>instant(960000)});t.after(h.close);h.api.setEnabled(true);await settle();
  assert.equal(h.calls.length,1,window);
  assert.deepEqual(h.calls[0].input,{datasourceUid:'logs',logql:'sum(count_over_time({app="x"} |= "y" ['+duration+']))',endRfc3339:'now',queryType:'instant'},window);
  const s=h.api.snapshot().map.local.signals.total;assert.equal(s.value,960000);
 }
});

test('Over time: a $__range query is one instant call at the selected day window end with that window substituted',async t=>{
 const h=await setup({signals:{total:{loki:TOTAL}},answer:c=>instant(c.input.endRfc3339===iso(NOW)?7:12,Date.parse(c.input.endRfc3339))});t.after(h.close);
 h.api.openHistory(days(),1);h.api.setEnabled(true);await settle();
 assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].input,{datasourceUid:'logs',logql:'sum(count_over_time({app="x"} |= "y" [86400s]))',endRfc3339:iso(NOW),queryType:'instant'});
 assert.equal(h.api.snapshot().map.local.signals.total.value,7);
 h.api.historyDay(0);await settle();const past=days()[0].at;
 assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1].input,{datasourceUid:'logs',logql:'sum(count_over_time({app="x"} |= "y" [86400s]))',endRfc3339:past,queryType:'instant'});
 assert.equal(h.api.snapshot().map.local.signals.total.value,12);
});

test('a $__range instant result in the Loki vector shape is read; an empty result follows the counting-query empty rules',async t=>{
 const vector=result=>({payload:{status:'success',data:{resultType:'vector',result}}});
 let h=await setup({signals:{total:{loki:TOTAL}},answer:()=>vector([{metric:{app:'x'},value:[NOW/1000,'5']},{metric:{app:'z'},value:[NOW/1000,'2']}])});t.after(h.close);h.api.setEnabled(true);await settle();
 assert.equal(h.api.snapshot().map.local.signals.total.value,7);
 h=await setup({signals:{total:{loki:TOTAL},raw:{loki:'sum(sum_over_time({app="x"} | unwrap n [$__range]))'}},answer:()=>vector([])});t.after(h.close);h.api.setEnabled(true);await settle();
 const s=h.api.snapshot().map.local.signals;assert.equal(s.total.value,0);assert.equal(s.raw,undefined);assert.match(h.api.status().note,/no numeric observation/);
});

test('a Loki query without $__range keeps the range call and its last point',async t=>{
 const h=await setup({signals:{plain:{loki:PLAIN}},answer:()=>({payload:{data:[{values:[{timestamp:((NOW-2*HOUR)/1000).toFixed(3),value:'3'},{timestamp:((NOW-HOUR)/1000).toFixed(3),value:'4'}],labels:{}}]}})});t.after(h.close);h.api.setEnabled(true);await settle();
 assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].input,{datasourceUid:'logs',logql:PLAIN,startRfc3339:'now-24h',endRfc3339:'now',queryType:'range',stepSeconds:360});
 const s=h.api.snapshot().map.local.signals.plain;assert.equal(s.value,4);assert.equal(s.series.length,2);
});

test('the Loki counting-query validator accepts [$__range] and still rejects malformed queries',()=>{
 const C=context();
 for(const q of ['count_over_time({app="a"}[$__range])',TOTAL,'sum by (service) (rate({app="a"} [ $__range ]))','sum(rate({app="a"}[$__range])) by (service)'])assert.equal(C.telemetryLokiCountingQuery(q),true,q);
 for(const q of ['count_over_time({app="a"}[$__range_s])','count_over_time({app="a"}[$__rangex])','count_over_time({app="a"}[$__range5m])','count_over_time({app="a"}[$__range$__range])','count_over_time({app="a"}[$range])','count_over_time({app="a"}[__range])','rate({broken}[$__range])','count_over_time({app="a"} | unwrap bytes [$__range])','{app="a"} |= "[$__range]"'])assert.equal(C.telemetryLokiCountingQuery(q),false,q);
});
