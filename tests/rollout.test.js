const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root=path.join(__dirname,'..'), context={};
vm.createContext(context);
vm.runInContext(['validator.js','engine.js'].map(name=>fs.readFileSync(path.join(root,'src',name),'utf8')).join('\n'),context);
const spec=JSON.parse(fs.readFileSync(path.join(root,'src/starters/rollout.json'),'utf8'));
const diagrams=spec.page.blocks[0].tabs.map(tab=>tab.sections[0].diagram);
const folded=diagrams.map(d=>context.foldPanelStates(d));
const row=(state,id)=>state.rows.find(r=>r.id===id).cells;

test('rollout stories validate and their displayed error rates agree with same-window counts and complete traffic weights',()=>{
  assert.equal(context.validate(spec.page).errors.length,0);
  assert.equal(context.validate(spec.page).warnings.length,0);
  assert.equal(context.lintPage(spec.page).length,0);
  for(const states of folded.slice(0,2)){
    states.evidence.forEach((evidence,i)=>{
      const weight=row(evidence,'weight'); assert.equal(weight.old+weight.new,100);
      assert.ok(weight.new>=0 && weight.new<=100);
      const n=row(evidence,'requests').new, errors=row(evidence,'failures').new;
      assert.ok(errors>=0 && errors<=n);
      assert.equal(states.limits[i].values.errors,n ? errors/n*100 : null);
      const p95=row(evidence,'p95').new;
      assert.equal(states.limits[i].values.latency,typeof p95==='number' ? p95 : null);
      if(!n){
        assert.equal(states.gate[i].results.errors.status,'pending');
        assert.equal(states.cohorts[i].new.state,'NO DATA');
      }
    });
  }
});

test('promotion above the initial canary follows sufficient passing evidence and starts an empty new observation window',()=>{
  const states=folded[0]; let advances=0, heldSmallSample=false;
  states.evidence.forEach((evidence,i)=>{
    const weight=row(evidence,'weight').new, n=row(evidence,'requests').new;
    if(n>0 && n<1000){
      heldSmallSample=true;
      assert.notEqual(states.gate[i].results.decision.status,'pass');
      assert.equal(weight,row(states.evidence[i-1],'weight').new);
    }
    if(!i || weight<=5 || weight<=row(states.evidence[i-1],'weight').new) return;
    advances++;
    const previous=states.gate[i-1].results;
    for(const key of ['sample','errors','latency','decision']) assert.equal(previous[key].status,'pass');
    assert.ok(row(states.evidence[i-1],'requests').new>=1000);
    assert.notEqual(row(evidence,'window').new,row(states.evidence[i-1],'window').new);
    assert.equal(states.limits[i].values.errors,null);
    assert.equal(states.limits[i].values.latency,null);
  });
  assert.ok(heldSmallSample); assert.ok(advances>0);
});

test('traffic rollback keeps the failing window and deployed version instead of turning zero traffic into healthy telemetry',()=>{
  const states=folded[1], end=states.evidence.length-1;
  assert.equal(states.gate[end-1].results.decision.status,'fail');
  assert.equal(row(states.evidence[end],'weight').new,0);
  assert.equal(row(states.evidence[end],'measuredWeight').new,5);
  assert.equal(row(states.evidence[end],'ready').new,'v2 / ready');
  assert.ok(states.limits[end].values.errors>1);
  assert.ok(states.limits[end].values.latency>250);
  assert.equal(states.cohorts[end].new.state,'OVER LIMIT');
});

test('firmware staging, missing reports, per-device confirmation and target-release admission stay separate',()=>{
  const states=folded[2], steps=diagrams[2].steps;
  const at=id=>steps.findIndex(step=>step.id===id);
  const staged=at('firmware.staged'), partial=at('firmware.partial'), end=steps.length-1;
  for(const device of ['a','b']){
    assert.equal(row(states.versions[staged],device).running,'v1');
    assert.equal(row(states.versions[staged],device).confirmation,'v1 confirmed');
    assert.equal(row(states.versions[staged],device).other,'v2 staged');
  }
  assert.equal(row(states.versions[partial],'b').confirmation,'current unknown');
  assert.equal(states.fleet[partial].b.state,'UNKNOWN');
  assert.equal(states.gate[partial].results.b.status,'pending');
  assert.equal(row(states.versions[end],'a').confirmation,'v2 confirmed');
  assert.equal(row(states.versions[end],'b').running,'v1');
  assert.equal(states.fleet[end].b.state,'PASSED'); // healthy old version, failed new-version gate
  assert.equal(states.gate[end].results.b.status,'fail');
  states.versions.forEach((state,i)=>{
    assert.deepEqual(row(state,'wave'),row(states.versions[0],'wave'));
    assert.notEqual(states.gate[i].results.expand.status,'pass');
  });
});
