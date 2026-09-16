const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../tools/canon/core.cjs');
const spec=()=>JSON.parse(fs.readFileSync('examples/canon/specs/doorbell.json'));
const trace=name=>JSON.parse(fs.readFileSync('examples/canon/traces/'+name+'.json'));
const plain=v=>JSON.parse(JSON.stringify(v));
const load=()=>import('../tools/canon/traces.mjs');
test('reference requires explicit review and maps async span links without assuming time order',async()=>{
  const T=await load(),s=spec(),before=JSON.stringify(s),preview=T.referencePreview(s,trace('happy'));
  assert.equal(preview.eligible,true);assert.equal(preview.mapping.steps.find(s=>s.stepId==='notify').spans[0].id,'notify');
  assert.throws(()=>T.approveReference(s,trace('happy')),/reason/);
  const approved=T.approveReference(s,trace('happy'),{reason:'Reviewed fictional doorbell reference'});
  assert.equal(JSON.stringify(s),before);assert.equal(approved.page.sections[0].diagram.referenceTrace.approval.reason,'Reviewed fictional doorbell reference');
  assert.equal(T.compareTrace(approved,trace('happy')).pathId,null);
  assert.throws(()=>T.approveReference(s,trace('service-error'),{reason:'bad reference'}),/Every instrumented/);
});
test('incident branches at first difference with independent IDs and never copies a happy user outcome',async()=>{
  const T=await load(),s=T.approveReference(spec(),trace('happy'),{reason:'Reviewed'}),before=JSON.stringify(s),r=T.compareTrace(s,trace('service-error'));
  assert.equal(r.firstDivergence,'upload');assert.equal(JSON.stringify(s),before);
  const d=r.spec.page.sections[0].diagram,happy=d.paths[0],incident=d.paths[1];
  assert.deepEqual(plain(incident.steps.slice(0,2)),plain(happy.steps.slice(0,2)));assert.notEqual(incident.steps[2],happy.steps[2]);
  const error=d.steps.find(s=>s.id===incident.steps[2]);assert.equal(error.edge,'hub->cloud');assert.equal(error.failures,undefined);assert.equal(error.conditions[0].kind,'service-error');
  for(const id of incident.steps.slice(2))assert.equal(d.steps.find(s=>s.id===id).panels,undefined);
  assert.equal(d.steps.find(s=>s.id===incident.steps.at(-1)).conditions[0].kind,'unknown');
  assert.deepEqual(plain(C.validateSpec(r.spec)),{errors:[],warnings:[]});
});
test('latency uses authored budgets, queue depth uses metrics, partial traces never infer delivery failure',async()=>{
  const T=await load(),s=T.approveReference(spec(),trace('happy'),{reason:'Reviewed'});
  const db=T.compareTrace(s,trace('database-slow'));assert.ok(db.mapping.steps.find(s=>s.stepId==='persist').conditions.some(c=>c.kind==='database-slow' && c.budgetMs===150));
  const queue=T.compareTrace(s,trace('backpressure'));assert.equal(queue.firstDivergence,'enqueue');assert.deepEqual(queue.mapping.steps.find(s=>s.stepId==='enqueue').conditions.map(c=>c.kind),['queue-buildup','backpressure']);
  const partial=T.compareTrace(s,trace('partial'));assert.equal(partial.firstDivergence,'persist');assert.equal(partial.mapping.steps.find(s=>s.stepId==='persist').conditions[0].kind,'unknown');
  assert.ok(partial.spec.page.sections[0].diagram.steps.every(s=>!s.failures));
  const dropped=T.compareTrace(s,trace('dropped'));assert.equal(dropped.spec.page.sections[0].diagram.steps.find(s=>s.id===dropped.spec.page.sections[0].diagram.paths[1].steps[2]).failures['hub->cloud'],'dropped');
  assert.deepEqual(plain(C.validateSpec(dropped.spec).errors),[]);
});
test('concurrent and repeated operations require unambiguous selectors; retries require explicit attempt evidence',async()=>{
  const T=await load(),raw=trace('happy'),copy=C.clone(raw.spans[1]);copy['trace.span_id']='record-2';raw.spans.push(copy);
  assert.equal(T.referencePreview(spec(),raw).eligible,false);
  const s=spec(),step=s.page.sections[0].diagram.steps[2];step.traceMatch.occurrence=1;
  assert.equal(T.referencePreview(s,raw).mapping.steps[2].status,'ambiguous');
  raw.spans.at(-1).startMs=400;assert.equal(T.referencePreview(s,raw).mapping.steps[2].status,'matched');
  delete step.traceMatch.occurrence;step.traceMatch.repeat='attempts';
  assert.equal(T.referencePreview(s,raw).mapping.steps[2].status,'ambiguous');
  raw.spans[1]['retry.attempt']=0;raw.spans.at(-1)['retry.attempt']=1;
  const retry=T.referencePreview(s,raw).mapping.steps[2];assert.equal(retry.status,'matched');assert.equal(retry.conditions.find(c=>c.kind==='retry').attempts,2);
});
test('normalization rejects mixed traces and duplicate IDs, strips payloads and preserves only safe source links',async()=>{
  const T=await load(),raw=trace('happy');raw.spans[0].authorization='secret';raw.spans[0].attributes={'customer.email':'private@example.test'};raw.sourceUrl='javascript:alert(1)';
  const normalized=T.normalizeTrace(raw);assert.equal(normalized.sourceUrl,null);assert.doesNotMatch(JSON.stringify(normalized),/secret|customer.email|private@example/);
  raw.spans[1]['trace.trace_id']='other';assert.throws(()=>T.normalizeTrace(raw),/exactly one trace/);
  raw.spans[1]['trace.trace_id']=raw.spans[0]['trace.trace_id'];raw.spans[1]['trace.span_id']=raw.spans[0]['trace.span_id'];assert.throws(()=>T.normalizeTrace(raw),/unique/);
});
test('reference changes require review, environments are checked, service version differences are reported',async()=>{
  const T=await load(),s=T.approveReference(spec(),trace('happy'),{reason:'Reviewed'}),raw=trace('happy');
  raw.spans.forEach(s=>s['deployment.environment.name']='production');assert.throws(()=>T.compareTrace(s,raw),/Environment differs/);
  raw.spans.forEach(s=>s['deployment.environment.name']='demo');raw.spans[1]['service.version']='2.0.0';assert.match(T.compareTrace(s,raw).warnings.join(' '),/version changed/);
  s.page.sections[0].diagram.steps[2].traceMatch.maxDurationMs=300;assert.throws(()=>T.compareTrace(s,raw),/approve the reference again/);
});
test('portal reference approval persists; incident comparison leaves canonical spec untouched',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canon-traces-')),{createCanonServer}=await import('../apps/backstage-mock/server.mjs');
  const server=await createCanonServer({statePath:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const get=async path=>(await fetch(base+'/api/canon/'+path)).json();
  const post=async(path,body)=>{const res=await fetch(base+'/api/canon/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;};
  try{
    const registry=await get('registry');assert.equal((await post('reference-preview',{id:'doorbell',trace:trace('happy')})).eligible,true);
    await post('reference-approve',{id:'doorbell',trace:trace('happy'),baseRevision:registry.diagrams[0].revision,reason:'Reviewed mapping'});
    const before=await get('specs/doorbell'),incident=await post('compare',{id:'doorbell',trace:trace('backpressure')});
    assert.equal(incident.firstDivergence,'enqueue');assert.deepEqual(await get('specs/doorbell'),before);
    assert.equal((await get('incidents/'+incident.id+'/spec')).page.sections[0].diagram.paths.length,2);
    assert.equal((await get('registry')).incidents.length,1);
  }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('selectors reject cross-step reuse, cycles, missing stable IDs and missing metric evidence',async()=>{
  const T=await load(),s=spec(),d=s.page.sections[0].diagram;
  d.steps.push({...C.clone(d.steps[2]),id:'also-record'});assert.equal(T.referencePreview(s,trace('happy')).eligible,false);
  assert.equal(T.referencePreview(s,trace('happy')).mapping.steps[2].status,'ambiguous');
  const missing=spec();delete missing.page.sections[0].diagram.steps[0].id;assert.throws(()=>T.referencePreview(missing,trace('happy')),/stable unique ID/);
  const cycle=spec();cycle.page.sections[0].diagram.steps[1].traceMatch.parentStepId='upload';assert.match(C.validateSpec(cycle).errors.join(' '),/cyclic/);
  const raw=trace('happy');delete raw.spans[3]['messaging.queue.depth'];const preview=T.referencePreview(spec(),raw);assert.equal(preview.eligible,false);assert.match(preview.mapping.steps[4].conditions[0].label,/not recorded/);
  assert.deepEqual(T.normalizeTrace(T.normalizeTrace(trace('happy'))),T.normalizeTrace(trace('happy')));
});
test('queue measurements drive only the explicitly bound queue panel',async()=>{
  const T=await load(),s=T.approveReference(spec(),trace('happy'),{reason:'Reviewed'}),result=T.compareTrace(s,trace('backpressure')),d=result.spec.page.sections[0].diagram;
  const step=d.steps.find(s=>s.id===d.paths[1].steps[4]);assert.equal(step.panels.delivery.state,'held');assert.match(step.panels.delivery.reason,/240.*18000/);assert.deepEqual(Object.keys(step.panels),['delivery']);
});
test('runtime badges clear between steps and labels remain text, including unknown evidence',()=>{
  const vm=require('node:vm');
  function element(tag){
    const e={tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k];},appendChild(n){n.parent=this;this.children.push(n);},remove(){this.parent.children=this.parent.children.filter(n=>n!==this);},querySelector(){return {getAttribute:k=>k==='width'?'160':'60'};},querySelectorAll(){return this.children.filter(n=>n.attrs.class?.includes('runtime-node-badge'));}};
    Object.defineProperty(e,'textContent',{get(){return e.text || '';},set(v){e.text=String(v);e.children=[];}});return e;
  }
  const document={createElement:element,createElementNS:(_,tag)=>element(tag)},context={document};vm.createContext(context);vm.runInContext(fs.readFileSync('src/engine.js','utf8'),context);
  const node=element('g'),host=element('span'),board={nodeEls:{queue:node}};
  context.renderRuntimeConditions(board,host,[{nodeId:'queue',kind:'queue-buildup',label:'240 messages'},{nodeId:'queue',kind:'backpressure',label:'<script>not markup</script>'}]);
  assert.equal(node.children.length,1);assert.equal(host.children.length,2);assert.equal(host.children[1].textContent,'⇤ <script>not markup</script>');
  context.renderRuntimeConditions(board,host,[{nodeId:'queue',kind:'unknown',label:'No telemetry'}]);assert.equal(node.children.length,1);assert.match(node.children[0].attrs.class,/runtime-unknown/);
  context.renderRuntimeConditions(board,host,[]);assert.equal(node.children.length,0);assert.equal(host.children.length,0);assert.equal(host.hidden,true);
});
