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
