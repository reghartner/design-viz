'use strict';
/* #1265 part B: the Workbench reads an agent snapshot file (src/workbench/live-snapshot.js) and refuses
   anything else with a reason the File panel can show. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
function context(){const C={URL,console};vm.runInNewContext(entrypoint('workbench').body,C);assert.equal(typeof C.workbenchLiveSnapshot,'function','the Workbench bundle reads snapshots');return C;}
const valid=()=>({version:1,kind:'flowview-live-snapshot',snapshotAt:'2026-11-10T11:02:00.000Z',intervalSeconds:6,epics:{},
 days:[{label:'Snapshot from 2026-11-10T11:02:00.000Z',issues:{'AA-1':{state:'done',summary:'Real title'}},telemetry:{start:'2026-11-10T10:50:00.000Z',stepSeconds:360,carriers:{a:{rate:{values:[1,2],unit:'req/h'}}}}}],errors:[]});
test('a snapshot file is read with its time; its day gives the demo readers\' maps',()=>{
 const C=context(),read=C.workbenchLiveSnapshot(JSON.stringify(valid()));
 assert.equal(read.ok,true);assert.equal(read.at,'2026-11-10T11:02:00.000Z');assert.match(read.label,/^Snapshot from /);
 const map=JSON.parse(JSON.stringify(read.map(['AA-1','BB-1'])));assert.equal(map['AA-1'].state,'done');assert.equal(map['AA-1'].title,'Real title');assert.equal(map['BB-1'].state,'missing');
 const telemetry=JSON.parse(JSON.stringify(read.telemetry()));assert.equal(telemetry.a.signals.rate.value,2);
});
test('anything else is refused with a reason',()=>{
 const C=context();
 for(const [text,reason] of [['not json',/not JSON/],[JSON.stringify({version:1,days:[]}),/not a Flowview live snapshot/],[JSON.stringify({...valid(),days:[]}),/no day/],[JSON.stringify({...valid(),snapshotAt:'later'}),/no snapshot time/]]){
  const read=C.workbenchLiveSnapshot(text);assert.equal(read.ok,false,text);assert.match(read.error,reason);
 }
});
test('#1265 review: a time range past the Date range is refused with a reason, never thrown',()=>{
 const C=context();
 const bad=[v=>{v.days[0].telemetry.stepSeconds=1e300;},v=>{v.days[0].telemetry.stepSeconds=Infinity;},v=>{v.days[0].telemetry.start='+275760-09-13T00:00:00.000Z';},v=>{v.days[0].telemetry.stepSeconds=-5;}];
 for(const change of bad){const v=valid();change(v);const text=JSON.stringify(v).replace('"stepSeconds":null','"stepSeconds":1e400');
  let read;assert.doesNotThrow(()=>{read=C.workbenchLiveSnapshot(text);});assert.equal(read.ok,false,text.slice(0,60));assert.match(read.error,/no usable time range/);}
 // The shared day reader never throws either.
 const v=valid();v.days[0].telemetry.stepSeconds=1e300;assert.deepEqual(JSON.parse(JSON.stringify(C.liveStatusDemoTelemetry(v.days[0]))),{});
 // Anything that throws while reading becomes a reason.
 const odd=valid();odd.days[0].issues={'AA-1':{state:'done',links:{length:1}}};const read=C.workbenchLiveSnapshot(JSON.stringify(odd));assert.equal(typeof read.ok,'boolean');
});
test('#1265 review: the label names the time zone and an old year; errors and board coverage are reported',()=>{
 const C=context(),v=valid();v.snapshotAt='2024-03-05T15:04:00.000Z';v.errors=[{source:'grafana',tool:'ingest rate',message:'Grafana Prometheus answered HTTP 500'},{source:'jira',tool:null,message:'x'}];v.board='other.spec.json';
 const read=C.workbenchLiveSnapshot(JSON.stringify(v));assert.equal(read.ok,true);
 assert.match(read.label,/2024/,'a snapshot from another year names it');assert.match(read.label,/[A-Z]{2,5}|GMT|UTC/,'the time zone is named');
 const now=valid();now.snapshotAt=new Date().toISOString();assert.doesNotMatch(C.workbenchLiveSnapshot(JSON.stringify(now)).label,new RegExp(String(new Date().getFullYear())),'this year is not repeated');
 assert.equal(read.errors,2);assert.equal(read.firstError,'grafana ingest rate: Grafana Prometheus answered HTTP 500');assert.equal(read.board,'other.spec.json');
 assert.equal(read.covers(['AA-1','BB-1']),1);assert.equal(read.covers(['BB-1']),0);
});
