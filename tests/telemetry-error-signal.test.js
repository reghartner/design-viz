'use strict';
/* #1201: an author marks a signal as an error signal (`role: "error"`). Over its limit the card border is red
   (state `error`), outranking every #1200 state; the popup verdict names it; the Proof chips gain a red `error`
   chip. Without the field nothing changes. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint,composeSources}=require('../tools/source-loader.cjs');
const C={URL,AbortController,document:{addEventListener(){},removeEventListener(){}},setTimeout,clearTimeout};vm.runInNewContext(entrypoint('native').source,C);
const V={URL,TextEncoder};vm.createContext(V);vm.runInContext(composeSources(['canon.js','validator.js']),V);
const plain=x=>JSON.parse(JSON.stringify(x));
const signals=role=>({rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'},dlq:{grafana:'max(dlq_depth)',unit:'msgs',...(role===undefined?{}:{role})}});
const telemetry=role=>({kind:'queue',signals:signals(role),proof:{rate:{min:1},dlq:{max:0}}});
function judge(role,sample,jira){
 const edge={from:'a',to:'b',telemetry:telemetry(role)},warnings=[],binding=C.carrierTelemetry(edge,{},(at,m)=>warnings.push(at+': '+m));
 const carrier={...binding,id:'a->b',title:'A to B',tickets:jira?['WORK-1']:[]};
 const verdicts=C.proofVerdicts({carriers:[carrier],jiraMap:{'WORK-1':{state:jira}},telemetryMap:sample?{'a->b':sample}:{}});
 return {binding,warnings,carrier,verdicts,result:verdicts.carriers['a->b'],state:C.telemetryCardMetricState(binding,sample,verdicts.carriers['a->b'])};
}
test('#1201 role "error" is kept on the binding; an unknown role is a validation warning and is ignored',()=>{
 const ok=judge('error');assert.deepEqual(ok.warnings,[]);assert.equal(ok.binding.signals.dlq.role,'error');
 const bad=judge('fatal');assert.equal(bad.binding.signals.dlq.role,undefined);assert.match(bad.warnings.join('\n'),/\.signals\.dlq\.role: must be "error" — ignored/);
 const spec=role=>({page:{sections:[{id:'main',diagram:{nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',telemetry:telemetry(role)}]}}]}});
 assert.deepEqual(plain(V.validate(V.normalize(spec('error')))).warnings.filter(w=>/role/.test(w)),[]);
 assert.ok(plain(V.validate(V.normalize(spec('fatal')))).warnings.some(w=>/signals\.dlq\.role/.test(w) && /must be "error"/.test(w)),'validation rejects an unknown role value');
});
test('#1201 an error signal over its limit turns the card red, outranking every other state; under its limit the normal states apply',()=>{
 const over={signals:{rate:{value:100},dlq:{value:4}}},under={signals:{rate:{value:100},dlq:{value:0}}};
 assert.equal(judge('error',over).state,'error');
 assert.equal(judge('error',over,'done').state,'error','Jira state does not change it');
 assert.equal(judge('error',{signals:{dlq:{value:4}}}).state,'error','red outranks waiting (rate not arriving)');
 assert.equal(judge('error',under).state,'held','under its limit: the normal state');
 assert.equal(judge(undefined,over).state,'failing','without the field: as today');
});
test('#1201 the popup verdict says the error signal is over its limit, and Proof gains a red error chip',()=>{
 const {carrier,verdicts}=judge('error',{signals:{rate:{value:100},dlq:{value:4}}},'done'),sample={signals:{rate:{value:100},dlq:{value:4}}};
 const proof=C.liveStatusProofPresentation({carriers:[carrier],map:{'a->b':sample},verdicts},'24h',true);
 assert.match(proof.rows[0].explanation,/error signal dlq is outside its limit/i);assert.equal(proof.rows[0].error,true,'the Proof table row pill wears the error state');
 assert.match(proof.rows[0].metrics.explanation,/error signal dlq is outside its limit/i);
 assert.deepEqual({error:proof.counts.error,degraded:proof.counts.degraded,state:proof.states.error},{error:1,degraded:0,state:'error'});
 assert.ok(Array.from(proof.arcs,a=>a.key).includes('error'),'the ring has an error arc');
 const plainCarrier=judge(undefined,{signals:{rate:{value:100},dlq:{value:4}}},'done');
 const today=C.liveStatusProofPresentation({carriers:[plainCarrier.carrier],map:{'a->b':sample},verdicts:plainCarrier.verdicts},'24h',true);
 assert.deepEqual({error:today.counts.error||0,degraded:today.counts.degraded},{error:0,degraded:1},'without the field the carrier stays degraded');
 assert.doesNotMatch(today.rows[0].explanation,/error signal/i);
});
test('#1201 review: a quiet dead-letter queue (rate 0 or missing, dlq 4) counts as error, not unproven or neutral',()=>{
 const T1=Date.UTC(2026,10,3,9),T2=Date.UTC(2026,10,3,10);
 for(const [label,sample,from] of [['rate 0',{signals:{rate:{value:0,series:[[T1,0],[T2,0]]},dlq:{value:4}}},'unproven'],['rate missing',{signals:{dlq:{value:4}}},'neutral']]){
  const {carrier,verdicts,state}=judge('error',sample,'done');
  assert.equal(state,'error',label+': the card is red');
  const proof=C.liveStatusProofPresentation({carriers:[carrier],map:{'a->b':sample},verdicts},'24h',true),c=proof.counts;
  assert.deepEqual({error:c.error,[from]:c[from],bound:c.bound,sum:c.proven+c.degraded+c.unproven+c.liveEarly+c.neutral+(c.error||0)},{error:1,[from]:0,bound:1,sum:1},label+': taken out of '+from+', bound unchanged');
  assert.ok(Array.from(proof.arcs,a=>a.key).includes('error'),label+': error arc');
  assert.equal(proof.rows[0].error,true);assert.doesNotMatch(proof.rows[0].metrics.label,/SILENT/,label+': the metrics label is not SILENT');
 }
});
test('#1201 review: a hidden error signal is named as an error signal on the card',()=>{
 const edge={from:'a',to:'b',telemetry:{...telemetry('error'),signals:{...signals('error'),dlq:{...signals('error').dlq,showOnCard:false}}}},binding=C.carrierTelemetry(edge,{});
 const sample={signals:{rate:{value:100},dlq:{value:4}}},result=C.proofVerdicts({carriers:[{...binding,id:'a->b',tickets:[]}],telemetryMap:{'a->b':sample}}).carriers['a->b'];
 assert.equal(C.telemetryCardContent(edge,binding,sample,result,'24h').hidden,'Hidden error signal dlq: outside limit');
});
