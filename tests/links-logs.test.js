'use strict';
/* #1243 part 3: the Links window's Log searches tab. The board-wide searches
   (tracking.telemetry.lookups) in Trace view order: read model, a move of any
   number of places as one plan, the Viewer value switch, and static drop
   checks. Field edits, Add and Remove reuse planPageTelemetry, as Status board
   settings → Log searches does. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const c={URL,TextEncoder};vm.createContext(c);
vm.runInContext(loader.composeSources(['canon.js','validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js',
  'workbench/commands/document.js','workbench/commands/telemetry.js','workbench/commands/links-logs.js']),c);
const plain=x=>JSON.parse(JSON.stringify(x));
const lookups=raw=>raw.page.tracking.telemetry.lookups;

function board(){
  return {page:{title:'Doorbell',tracking:{telemetry:{lookups:{
    camera:{label:'Camera model',query:'{env="$env"} |= "Handling camera stats message" | cameraModel="$value"',values:['arch','wren']},
    device:{label:'Find by my device ID',query:'{env="$env"} | device_id="$value"'},
    errors:{label:'Recent errors',query:'{env="$env"} | severity_text="ERROR"'}}}},
    sections:[{heading:'Flow',diagram:{nodes:{ctrl:{title:'Doorbell controller'},ingest:{title:'Event ingest'}},rows:[['ctrl','ingest']],edges:[{from:'ctrl',to:'ingest',label:'event'}],
      panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}};
}
function apply(spec,fn){
  const text=JSON.stringify(spec,null,2),plan=fn(text,JSON.parse(text));
  assert.equal(plan.error,undefined,plan.error);return {text:plan.text,raw:JSON.parse(plan.text),plan,unchanged:plan.text===text};
}
const model=spec=>c.linksLogSearchModel(JSON.parse(JSON.stringify(spec)));

test('LL1 the read model lists the searches in Trace view order with their kind',()=>{
  assert.deepEqual(plain(c.validate(c.normalize(board())).errors),[],'the fixture is a board the product accepts');
  const m=model(board());assert.equal(m.error,undefined,m.error);
  assert.equal(m.present,true);assert.equal(m.valid,true);
  assert.deepEqual(plain(m.rows.map(r=>[r.id,r.index,r.label,r.kind])),[['camera',0,'Camera model','list'],['device',1,'Find by my device ID','typed'],['errors',2,'Recent errors','fixed']]);
  assert.deepEqual(plain(m.rows[0].values),['arch','wren']);
  const none=board();delete none.page.tracking.telemetry;const empty=model(none);
  assert.equal(empty.present,false);assert.deepEqual(plain(empty.rows),[]);
  const bad=board();bad.page.tracking.telemetry.lookups='camera';assert.equal(model(bad).valid,false);
});

test('LL2 a move of several places is one plan and gives the order of the same single moves',()=>{
  const s=apply(board(),(t,r)=>c.planLinksLogSearchMove(t,r,'errors',0));
  assert.deepEqual(Object.keys(lookups(s.raw)),['errors','camera','device']);
  let step=board();
  for(const offset of [-1,-1]){const text=JSON.stringify(step,null,2);step=JSON.parse(c.planPageTelemetry(text,JSON.parse(text),{op:'moveLookup',name:'errors',offset}).text);}
  assert.deepEqual(Object.keys(lookups(step)),Object.keys(lookups(s.raw)));
  assert.deepEqual(lookups(s.raw).errors,lookups(board()).errors,'the search itself is unchanged');
  const down=apply(board(),(t,r)=>c.planLinksLogSearchMove(t,r,'camera',2));
  assert.deepEqual(Object.keys(lookups(down.raw)),['device','errors','camera']);
  assert.ok(apply(board(),(t,r)=>c.planLinksLogSearchMove(t,r,'device',1)).unchanged,'to its own place: no change');
});

test('LL3 Viewer value: Typed clears the suggested values; None is refused while the query has $value',()=>{
  const s=apply(board(),(t,r)=>c.planLinksLogSearchKind(t,r,'camera','typed'));
  assert.equal(lookups(s.raw).camera.values,undefined);assert.equal(lookups(s.raw).camera.query,lookups(board()).camera.query);
  const text=JSON.stringify(board()),raw=JSON.parse(text);
  assert.match(c.planLinksLogSearchKind(text,raw,'device','fixed').error,/Remove \$value from the query/);
  assert.match(c.planLinksLogSearchKind(text,raw,'errors','typed').error,/Add \$value to the query/);
  const m=model(board());
  assert.match(c.linksLogSearchKindRefusal(m.rows[1],'fixed'),/Remove \$value from the query/);
  assert.equal(c.linksLogSearchKindRefusal(m.rows[2],'fixed'),null);
  assert.equal(c.linksLogSearchKindRefusal(m.rows[0],'typed'),null);
  assert.ok(apply(board(),(t,r)=>c.planLinksLogSearchKind(t,r,'device','typed')).unchanged,'already typed: no change');
});

test('LL4 refusals: lookups not an object, an unknown id, a move out of range',()=>{
  const bad=board();bad.page.tracking.telemetry.lookups='camera';const t1=JSON.stringify(bad);
  assert.match(c.planLinksLogSearchMove(t1,JSON.parse(t1),'camera',0).error,/not an object/);
  const text=JSON.stringify(board()),raw=JSON.parse(text);
  assert.match(c.planLinksLogSearchMove(text,raw,'nope',0).error,/not found/);
  assert.match(c.planLinksLogSearchMove(text,raw,'camera',3).error,/out of range|place/);
  assert.match(c.planLinksLogSearchKind(text,raw,'nope','typed').error,/not found/);
});

test('LL5 perf guard: rendering rows and every drag hover over 200 searches run no planner; only the drop does',()=>{
  const spec=board(),all={};
  for(let i=0;i<200;i++)all['s'+i]={label:'Search '+i,query:i%2?'{a="$value"}':'{a="b"}'};
  spec.page.tracking.telemetry.lookups=all;
  const names=['planLinksLogSearchMove','planLinksLogSearchKind','planPageTelemetry'],saved={},calls={n:0};
  names.forEach(n=>{saved[n]=c[n];c[n]=function(){calls.n++;return saved[n].apply(null,arguments);};});
  try{
    const started=Date.now(),m=model(spec);let offered=0;
    for(const row of m.rows.slice(0,20))for(let gap=0;gap<=m.rows.length;gap++){const t=c.linksLogSearchDropTarget(m,row.id,gap);if(!t.refusal)offered++;}
    const ms=Date.now()-started;
    assert.equal(calls.n,0,'no planner runs while rendering or hovering');assert.ok(ms<250,'took '+ms+' ms');assert.ok(offered>3000,'offered '+offered);
    const text=JSON.stringify(spec);c.planLinksLogSearchMove(text,JSON.parse(text),'s0',5);assert.ok(calls.n>=1,'the drop runs the planner');
  }finally{names.forEach(n=>{c[n]=saved[n];});}
});

test('LL6 a drop target is the index the search lands on; its own gaps change nothing',()=>{
  const m=model(board());
  assert.deepEqual(plain(c.linksLogSearchDropTarget(m,'errors',0)),{toIndex:0,refusal:null});
  assert.deepEqual(plain(c.linksLogSearchDropTarget(m,'camera',3)),{toIndex:2,refusal:null});
  assert.match(c.linksLogSearchDropTarget(m,'camera',0).refusal,/already here/);
  assert.match(c.linksLogSearchDropTarget(m,'camera',1).refusal,/already here/);
  assert.match(c.linksLogSearchDropTarget(m,'nope',1).refusal,/not found/);
});
