'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./workbench-command-context.cjs')(['narrative','panel-visibility','graph']);
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){return {nodes:{n:{}},rows:[['n']],panels:[
 {id:'phone',type:'phone',visible:false},{id:'camera',type:'screen'}
],steps:[
 {id:'start',nodes:['n']},
 {id:'notify',panelVisibility:{phone:true,camera:false},panels:{phone:{notify:{app:'Doorbell',title:'Visitor',text:'At the door'}}}},
 {id:'offline',panelVisibility:{camera:false}},
 {id:'shared',nodes:['n']},
 {id:'end',panelVisibility:{phone:false,camera:true}}
],paths:[{id:'happy',steps:['start','notify','shared','end']},{id:'failed',steps:['start','offline','shared']}]};}
test('panel visibility follows the full selected path, shared steps and backward jumps without leaking',()=>{
 const d=fixture(),before=JSON.stringify(d);
 assert.deepEqual(plain(C.foldPanelVisibility(C.diagramForPath(d,'happy'))),{phone:[false,true,true,false],camera:[true,false,false,true]});
 assert.deepEqual(plain(C.foldPanelVisibility(C.diagramForPath(d,'failed'))),{phone:[false,false,false],camera:[true,false,false]});
 assert.deepEqual(plain(C.foldPanelVisibility({...d,steps:[]})),{phone:[false],camera:[true]});
 assert.equal(C.foldPanelVisibility(C.diagramForPath(d,'happy')).phone[0],false);
 assert.equal(JSON.stringify(d),before);
 assert.equal(C.foldPanelStates(C.diagramForPath(d,'happy')).phone[3].notifications.length,1,'hiding does not erase contents');
});
test('visibility ignores malformed values and validates unknown IDs and invalid shapes',()=>{
 const d=fixture();d.panels[0].visible='false';d.steps=[{panelVisibility:{phone:false,camera:true}},{panelVisibility:{phone:'true',missing:true}},{panelVisibility:[]},{panelVisibility:null}];delete d.paths;
 assert.deepEqual(plain(C.foldPanelVisibility(d)).phone,[false,false,false,false]);
 const warnings=C.validate(C.normalize(d)).warnings.join('\n');
 assert.match(warnings,/panels\[0\].visible/);assert.match(warnings,/panelVisibility.phone/);assert.match(warnings,/unknown panel id "missing"/);assert.match(warnings,/expected an object mapping panel IDs/);
 d.steps=[{panelVisibility:{phone:true}}];delete d.panels[0].visible;
 assert.deepEqual(plain(C.validate(C.normalize(d)).warnings),[]);
});
test('Show, Hide and Inherit preserve unrelated patches, default visibility, source and reject stale writes',()=>{
 const d=fixture(),target={kind:'step',section:0,index:3},before=JSON.stringify(d);
 const apply=(raw,value)=>{const plan=C.planStepPanelVisibility(JSON.stringify(raw),raw,target,'phone',value,JSON.stringify(raw.steps[3]));assert.ok(!plan.error,plan.error);return JSON.parse(plan.text);};
 const shown=apply(d,true);assert.equal(shown.steps[3].panelVisibility.phone,true);
 const hidden=apply(shown,false);assert.equal(hidden.steps[3].panelVisibility.phone,false);
 const inherited=apply(hidden,null);assert.equal(inherited.steps[3].panelVisibility,undefined);
 assert.deepEqual(inherited,d);assert.equal(JSON.stringify(d),before);
 assert.ok(C.planStepPanelVisibility(before,d,target,'phone',false,'stale').error);
 assert.ok(C.planStepPanelVisibility(before,d,target,'missing',false).error);
 d.steps[3].panelVisibility='broken';assert.ok(C.planStepPanelVisibility(JSON.stringify(d),d,target,'phone',false).error);
});
test('panel rename and delete carry visibility references across every path',()=>{
 const d=fixture();const rename=C.planRenamePanel(JSON.stringify(d),d,0,0,'resident');assert.ok(!rename.error,rename.error);
 const renamed=JSON.parse(rename.text);assert.equal(renamed.steps[1].panelVisibility.resident,true);assert.equal(renamed.steps[4].panelVisibility.resident,false);assert.equal(renamed.steps[1].panelVisibility.phone,undefined);
 const remove=C.planDeletePanel(rename.text,renamed,0,0);assert.ok(!remove.error,remove.error);
 const removed=JSON.parse(remove.text);assert.deepEqual(removed.steps[1].panelVisibility,{camera:false});assert.deepEqual(removed.steps[4].panelVisibility,{camera:true});
});
