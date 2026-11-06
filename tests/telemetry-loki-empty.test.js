'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
function context(){const C={URL,AbortController,TextDecoder,TextEncoder,console,document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout(){}};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
const accepted=['count_over_time({app="a"}[5m])','rate({app="a"} |= "error" [1h])','sum(count_over_time({app="a"}[5m]))','sum by (service) (rate({app="a"}[5m]))','sum(rate({app="a"}[5m])) by (service)','sum without (host, instance) (count_over_time({app="a"} != "ok" [1h]))'];
const rejected=['rate({app="a"} | unwrap bytes [5m])','{app="rate"} |= "count_over_time"','sum_over_time({app="a"} | unwrap count [5m])','avg(rate({app="a"}[5m]))','rate({app="a"}[5m]) or vector(1)','label_replace(up,"count_over_time","rate","a","b")','count_over_time({app="a"} | unwrap bytes [5m])','count_over_time({app="a"}[5m]) + up','rate({broken}[5m])'];
test('empty Loki classification parses a bounded numeric grammar, never substrings',()=>{
 const C=context();for(const q of accepted)assert.equal(C.telemetryLokiCountingQuery(q),true,q);for(const q of rejected)assert.equal(C.telemetryLokiCountingQuery(q),false,q);
 for(const payload of [{status:'success',data:{resultType:'matrix',result:[]}},{data:[]}])assert.equal(C.telemetryLokiEmpty(payload),true);
 for(const payload of [null,{},[],{data:{}},{status:'error',data:[]},{data:{resultType:'streams',result:[]}},{status:'success',data:{result:[]}}])assert.equal(C.telemetryLokiEmpty(payload),false);
});
test('live Loki successful empty count/rate is zero; raw/unsupported/malformed/errors clear old evidence',async t=>{
 const C=context(),p={tracking:{telemetry:{grafana:{loki:'logs'}}},sections:[]};let payload={data:[{values:[[1793827860,'4']]}]},failure=null;
 const bindings=accepted.concat(rejected).map((q,i)=>({id:'node'+i,kind:'service',signals:{count:{source:'loki',query:q}},proof:{count:{min:1}},links:{}}));
 const adapter=C.createTelemetryGrafana(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_loki_logs']}],callTool:async()=>{if(failure)throw failure;return {payload};}})}},null,()=>true);
 const ctl={telemetry:{bindings:()=>bindings,config:()=>C.telemetryEnvironmentConfig(p),setAvailable(){},enabled:()=>true},liveStatus:{action(){}}};
 const handle=adapter.attach(ctl,p);t.after(()=>handle.destroy());await settle();const run=()=>adapter.options.provider(bindings,new AbortController().signal,{note(){}});
 let result=await run();assert.equal(result.node0.signals.count.value,4);
 for(const empty of [{data:[]},{status:'success',data:{resultType:'matrix',result:[]}}]){
  payload=empty;result=await run();for(let i=0;i<bindings.length;i++)assert.equal(result['node'+i]?.signals.count.value,i<accepted.length?0:undefined,bindings[i].signals.count.query);
 }
 for(const invalid of [{},{data:[{values:[[1,'not numeric']]}]},{status:'error',data:[]}]){payload=invalid;result=await run();assert.deepEqual(Object.keys(result),[]);}
 for(const code of ['tool_error','timeout']){payload={data:[{values:[[1793827860,'4']]}]};await run();failure={code,message:'failed'};try{result=await run();assert.deepEqual(Object.keys(result),[]);}catch(e){assert.equal(code,'timeout');}failure=null;}
 payload={data:[{values:[[1793827860,'0']]}]};result=await run();assert.equal(result.node0.signals.count.value,0);
});
