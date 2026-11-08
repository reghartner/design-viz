'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const fixture=require('./fixtures/trace-connection-profile.json'),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8');
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0',NOW=Date.parse('2026-11-06T12:00:00Z'),clone=x=>JSON.parse(JSON.stringify(x));
function context(name='standalone'){const C={URL,AbortController,TextEncoder,TextDecoder,console,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(entrypoint(name).body,C);return C;}
function profile(){return clone(fixture);}
function board(p=profile()){return {tracking:{telemetry:{traceConnections:{company:p}}},sections:[{id:'one',diagram:{nodes:{a:{}},rows:[['a']]}}]};}
function tool(){return {name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{anyOf:[{type:'string'},{type:'null'}]},environment_slug:{type:['string','null']},team_slug:{type:'string'},view_mode:{enum:['full'],type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode'],additionalProperties:false}};}
function setup({C=context(),p=board(),metadataOnly=false,permission='granted',result={payload:recorded},describe,call,hooks={}}={}){
 const calls=[],permissions=[],counts={lists:0,describes:0};let tools=[tool()];
 const mcp={listTools:async()=>{counts.lists++;return [{server:fixture.server,tools:metadataOnly?tools.map(t=>({name:t.name,annotations:t.annotations})):tools}];},describeTool:async(s,n)=>{counts.describes++;return describe?describe(s,n):tools.find(t=>t.name===n);},callTool:async(s,n,args,options)=>{calls.push({server:s,tool:n,args:clone(args),signal:options.signal});return call?call(s,n,args,options):clone(result);}};
 const win={claude:{use:async n=>n==='permissions'?{request:async keys=>{permissions.push(...keys);return Object.fromEntries(keys.map(k=>[k,permission]));}}:mcp}};
 const adapter=C.createTelemetryProviders(p,win),api=C.createTelemetryDirect(p,adapter.options.directTrace,{sections:()=>[{id:'source/section/diagram/mount',label:'Diagram'}],...hooks});
 api.set('environment','prod');api.set('input',ID);
 return {C,p,api,adapter,calls,permissions,counts,mcp,win,setTools:v=>tools=v};
}
test('company config is inherited without calls; board restrictions/overrides are bounded, immutable and exact',()=>{
 const C=context('backend'),F=C.FlowTraceConnections,p=profile(),company={ops:p},page={tracking:{telemetry:{traceConnections:{chosen:{profile:'ops',label:'Chosen',literals:{view_mode:'full'},environments:{prod:{value:'production-2',context:{team:'team-2'}}}}}}}},before=JSON.stringify([page,company]);
 assert.deepEqual(Object.keys(F.resolve({},company)),['ops']);assert.deepEqual(clone(F.resolve({tracking:{telemetry:{traceConnections:{}}}},company)),{});const selected=F.resolve(page,company);assert.deepEqual(Object.keys(selected),['chosen']);assert.deepEqual(Object.keys(selected.chosen.environments),['prod']);assert.equal(selected.chosen.environments.prod.context.team,'team-2');assert.equal(JSON.stringify([page,company]),before);
 for(const alter of [x=>x.readOnly=false,x=>x.adapter='javascript',x=>x.arguments.traceId=x.arguments.start,x=>x.literals.authorization='secret',x=>x.literals.team='https://signed.example/private',x=>x.environments.prod.context.team={nested:true},x=>x.links[0].path='/{team}/{team}',x=>x.links[0].query.extra='trace_id',x=>x.extra='unknown']){const bad=profile();alter(bad);assert.throws(()=>F.profile(bad),/configuration/);}
 const invalid=clone(page);invalid.tracking.telemetry.traceConnections.chosen.server='Another';let errors=[];assert.deepEqual(clone(F.resolve(invalid,company,(p,m)=>errors.push(m))),{});assert.match(errors.join(),/unsupported/);
 page.tracking.telemetry.enabled=false;assert.deepEqual(clone(F.resolve(page,company)),{});
});
test('raw ID, exact recognized link, environment/context checks and ambiguity do not guess',()=>{
 const F=context().FlowTraceConnections,p=F.profile(profile()),link='https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID;
 const raw=F.input(p,{input:ID,environment:'prod'},NOW);assert.equal(raw.args.from,'-2h');assert.equal(raw.args.team_slug,'example-team');assert.equal(raw.range.from,'2026-11-06T10:00:00.000000000Z');assert.equal(F.input(p,{input:link},NOW).environment,'prod');
 for(const input of [link+'&trace_id='+ID,link+'&token=secret',link.replace('production','other'),link.replace('example-team','other-team'),link.replace('ui.honeycomb.io','evil.example'),link+'#fragment','not-a-trace'])assert.throws(()=>F.input(p,{input},NOW),/input/);
 assert.throws(()=>F.input(p,{input:link,environment:'stage'},NOW),/conflicts/);assert.throws(()=>F.input(p,{input:ID},NOW),/Choose an environment/);
 const ambiguous=profile();ambiguous.links.push(clone(ambiguous.links[0]));assert.throws(()=>F.input(F.profile(ambiguous),{input:link},NOW),/Ambiguous/);
});
test('present empty, whitespace or malformed link fields fail before discovery, consent or any detail call',async()=>{
 const base='https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID;
 const links=[base+'&trace_start_ts=&trace_end_ts=',base+'&trace_start_ts=',base+'&trace_end_ts=',base+'&trace_start_ts=%20&trace_end_ts=1791779592',base+'&trace_start_ts=invalid&trace_end_ts=1791779592',base.replace('/production/','//'),base.replace('/production/','/%20/'),base.replace('/example-team/','//'),base.replace('/example-team/','/%00/'),base.replace(ID,'')];
 for(const input of links){const h=setup({metadataOnly:true});h.api.set('input',input);assert.equal(await h.api.load(true),null,input);assert.equal(h.api.snapshot().report.stage,'input',input);assert.equal(h.counts.lists,0,input);assert.equal(h.counts.describes,0,input);assert.equal(h.permissions.length,0,input);assert.equal(h.calls.length,0,input);h.api.destroy();}
 // Environment/context may be extracted from query fields as well as paths.
 const p=profile();p.links[0].path='/trace';p.links[0].query.environment='env';p.links[0].query.team='team';
 for(const input of ['https://ui.honeycomb.io/trace?trace_id='+ID+'&env=&team=example-team','https://ui.honeycomb.io/trace?trace_id='+ID+'&env=production&team=']){const h=setup({p:board(p)});h.api.set('input',input);assert.equal(await h.api.load(),null);assert.equal(h.api.snapshot().report.stage,'input');assert.equal(h.counts.lists,0);assert.equal(h.calls.length,0);h.api.destroy();}
});
test('explicit second/millisecond encodings and nanoseconds preserve older absolute bounds; relative-only fails',()=>{
 const F=context().FlowTraceConnections,p=profile(),url='https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID+'&trace_start_ts=1791779586.602194688&trace_end_ts=1791779592.123456789';
 assert.throws(()=>F.input(F.profile(p),{input:url},NOW),/only relative/);p.time.encoding='iso8601';p.arguments.end='to';
 let r=F.input(F.profile(p),{input:url},NOW);assert.equal(r.args.from,'2026-10-12T04:33:06.602194688Z');assert.equal(r.args.to,'2026-10-12T04:33:12.123456789Z');assert.equal(r.range.from,r.args.from);
 p.time.encoding='unix-milliseconds';r=F.input(F.profile(p),{input:url},NOW);assert.equal(r.args.from,'1791779586602.194688');
 p.time.type='number';assert.throws(()=>F.input(F.profile(p),{input:url},NOW),/represented exactly/);
 p.time.encoding='unix-seconds';const exact=url.replace('1791779586.602194688','1791779586.5').replace('1791779592.123456789','1791779592.5');assert.equal(F.input(F.profile(p),{input:exact},NOW).args.from,1791779586.5);
 assert.throws(()=>F.input(F.profile(p),{input:exact,start:'-2h'},NOW),/both/);
 p.links[0].timeEncoding='unix-milliseconds';p.time.type='string';const ms=url.replace('1791779586.602194688','1791779586602.194688').replace('1791779592.123456789','1791779592123.456789');assert.equal(F.input(F.profile(p),{input:ms},NOW).args.from,'1791779586.602194688');
 assert.throws(()=>F.input(F.profile(p),{input:ID,environment:'prod',start:'2026-10-12T00:00:00Z'},NOW),/both start and end/);
});
test('authoritative required schema types, unions, constraints and read-only metadata gate every argument',()=>{
 const F=context().FlowTraceConnections,p=F.profile(profile()),args=F.input(p,{input:ID,environment:'prod'},NOW).args,t=tool();F.tool(p,t,args);
 const cases=[t=>t.inputSchema.required.push('required_literal'),t=>t.inputSchema.properties.from={type:'number'},t=>t.inputSchema.properties.from={oneOf:[{type:'string'},{type:'string'}]},t=>t.inputSchema.properties.from={type:'string',pattern:'.*'},t=>t.annotations.readOnlyHint=false,t=>t.annotations.destructiveHint=true];
 for(const alter of cases){const bad=tool();alter(bad);assert.throws(()=>F.tool(p,bad,args));}
 F.validate(null,{oneOf:[{type:'string'},{type:'null'}]});assert.throws(()=>F.validate(2,{anyOf:[{type:'string'},{type:'null'}]}));
 F.validate({n:2},{type:'object',properties:{n:{allOf:[{type:'integer'},{minimum:1,maximum:3}]}},required:['n'],additionalProperties:false});assert.throws(()=>F.validate({n:4},{type:'object',properties:{n:{maximum:3}}}));
 assert.throws(()=>F.tool(p,t,{...args,extra:'x'}),/not declared/);t.inputSchema.additionalProperties={type:'string'};F.tool(p,t,{...args,extra:'x'});assert.throws(()=>F.tool(p,t,{...args,extra:2}),/wrong type/);
 p.tool='custom_detail';t.name=p.tool;delete t.annotations;assert.throws(()=>F.tool(p,t,args),/custom aliases/);t.annotations={readOnlyHint:true};F.tool(p,t,args);
});
test('detail-only Load and Verify share exact production path, permission and recorded decoder with no search/bindings/numeric enable',async()=>{
 const h=setup({metadataOnly:true}),metrics=h.C.createTelemetry(h.p,{provider:async()=>{throw Error('numeric provider must not run');}},{carriers:fn=>fn({telemetry:{kind:'service',signals:{zero:{grafana:'up'}}}},'a',h.p)});metrics.apply({a:{signals:{zero:{value:0}}}});const before=clone(metrics.snapshot().map);assert.equal(before.a.signals.zero.value,0);
 assert.equal(h.counts.lists,0);h.api.snapshot();assert.equal(h.counts.lists,0);assert.equal(h.calls.length,0);
 const e=await h.api.load(false);assert.equal(e.traceId,ID);assert.equal(e.spans.length,55);assert.equal(e.completeness,'partial');assert.equal(h.calls.length,1);assert.equal(h.calls[0].tool,'get_trace');assert.deepEqual(h.calls[0].args,{view_mode:'full',trace_id:ID,from:'-2h',environment_slug:'production',team_slug:'example-team'});assert.deepEqual(h.permissions,['mcp:'+fixture.server]);
 const report=h.api.snapshot().report;assert.equal(report.requestAccepted,true);assert.equal(report.idMatched,true);assert.equal(report.arguments.team_slug,'[configured]');assert.equal(report.arguments.from,'-2h');
 const verified=await h.api.load(true);assert.deepEqual(clone(verified.spans),clone(e.spans));assert.equal(h.calls.length,2);assert.equal(h.api.snapshot().report.mode,'verify');assert.equal(metrics.enabled(),false);assert.deepEqual(clone(metrics.snapshot().map),before);assert.equal(h.p.sections[0].diagram.nodes.a.telemetry,undefined);h.api.destroy();metrics.destroy();
});
test('permission denial, unknown required field, write annotation and missing exact tool never call detail',async()=>{
 for(const mode of ['denied','required','write','missing']){const h=setup({metadataOnly:mode==='denied',permission:'denied'}),t=tool();if(mode==='required')t.inputSchema.required.push('region');if(mode==='write')t.annotations.readOnlyHint=false;if(mode==='missing')t.name='almost_get_trace';h.setTools([t]);assert.equal(await h.api.load(true),null);assert.equal(h.calls.length,0);assert.equal(h.api.snapshot().report.requestAccepted,false);assert.ok(h.api.snapshot().report.error);h.api.destroy();}
});
test('response failures remain stage-specific; errors/unknown/oversize/mismatched ID never become not-found or zero',async()=>{
 for(const [result,stage,accepted] of [[{isError:true,content:[{type:'text',text:'https://signed.example/?secret=private'}]},'detail',false],[{payload:'unknown shape https://signed.example/?secret=private'},'response',true],[{payload:'x'.repeat(1048577)},'response',true],[{payload:recorded.replace(ID,'f'.repeat(32))},'response',true]]){const h=setup({result});assert.equal(await h.api.load(true),null);const s=h.api.snapshot();assert.equal(s.exemplar,null);assert.equal(s.report.stage,stage);assert.equal(s.report.requestAccepted,accepted);assert.equal(s.report.idMatched,false);assert.doesNotMatch(JSON.stringify(s.report),/signed\.example|private|not found/);h.api.destroy();}
 const h=setup({call:()=>{throw {code:'needs_reauth',message:'secret https://signed.example/'};}});await h.api.load();assert.match(h.api.snapshot().report.error,/Reconnect/);assert.doesNotMatch(h.api.snapshot().report.error,/signed|secret/);h.api.destroy();
});
test('late A cannot overwrite B across profile/environment/input/section/source identity/cancel/destroy changes',async()=>{
 for(const mode of ['environment','connection','input','section','identity','clear','destroy']){
  let release,identity='source-A',p=board();if(mode==='connection')p.tracking.telemetry.traceConnections.second=profile();const h=setup({p,hooks:{identity:()=>identity,sections:()=>[{id:'one',label:'One'},{id:'two',label:'Two'}]},call:async()=>{await new Promise(r=>release=r);return {payload:recorded};}});if(mode==='connection'){h.api.set('connection','company');h.api.set('environment','prod');h.api.set('input',ID);}h.api.set('section','one');const pending=h.api.load();for(let i=0;i<10 && !release;i++)await new Promise(setImmediate);assert.ok(release);
  if(mode==='identity')identity='source-B';else if(mode==='clear')h.api.clear();else if(mode==='destroy')h.api.destroy();else h.api.set(mode,mode==='environment'?'stage':mode==='connection'?'second':mode==='section'?'two':'f'.repeat(32));
  release();assert.equal(await pending,null);assert.equal(h.api.snapshot().exemplar,null);h.api.destroy();
 }
 let releases=[];const h=setup({call:async()=>{await new Promise(r=>releases.push(r));return {payload:recorded};}}),a=h.api.load();while(releases.length<1)await new Promise(setImmediate);const b=h.api.load(true);while(releases.length<2)await new Promise(setImmediate);releases[1]();await b;const token=h.api.snapshot().exemplar.selectionToken;releases[0]();assert.equal(await a,null);assert.equal(h.api.snapshot().exemplar.selectionToken,token);h.api.destroy();
});
test('native shares validation and recorded decoders, exposes no MCP and reports unsupported hosts honestly',async()=>{
 const C=context('native');assert.equal(typeof C.createTelemetryDirectMcp,'undefined');assert.equal(typeof C.createTelemetryTraces,'undefined');const p=board(),calls=[];const api=C.createTelemetryDirect(p,{describe:async request=>{assert.equal(request.profile.server,fixture.server);return tool();},call:async(request,args)=>{calls.push(args);return {payload:recorded};}},{sections:()=>[]});api.set('environment','prod');api.set('input',ID);assert.equal((await api.load()).spans.length,55);assert.equal(calls.length,1);api.destroy();
 const absent=C.createTelemetryDirect(p,null);absent.set('input',ID);assert.equal(absent.snapshot().available,false);await absent.load();assert.equal(absent.snapshot().report.stage,'host');assert.equal(absent.snapshot().exemplar,null);absent.destroy();
});
test('shared native decoder preserves bounded useful tool failures without portable transport dependencies',()=>{
 const C=context('native');assert.throws(()=>C.telemetryHoneycombTrace({isError:true,content:[{type:'text',text:'column timestamp is always returned; token=private-token https://mcp.honeycomb.io/trace_results/private'}]},ID),error=>{assert.match(error.message,/column timestamp is always returned/);assert.doesNotMatch(error.message,/private|https:\/\//);assert.ok(error.message.length<=400);return true;});
});

test('detail errors retain actionable invalid-time/column diagnostics while redacting credential and transport text',async()=>{
 const messages=[
  'Invalid from: expected a signed duration such as -2h; token=abc123 https://mcp.honeycomb.io/trace_results/secret?signature=private',
  'Unknown column trace_id. Authorization: Bearer private-credential; api_key="private-key"; opaque '+ 'x'.repeat(70)
 ];
 for(const message of messages){const h=setup({result:{isError:true,content:[{type:'text',text:message}]}});await h.api.load(true);const report=h.api.snapshot().report;assert.equal(report.stage,'detail');assert.match(report.error,/Invalid from|Unknown column/);assert.doesNotMatch(report.error,/abc123|https:\/\/|private|x{40}/);assert.ok(report.error.length<=400);h.api.destroy();}
 const h=setup({call:()=>{throw {code:'invalid_argument',message:'Invalid from: use -2h, not 2h; password=private'};}});await h.api.load();assert.match(h.api.snapshot().report.error,/use -2h/);assert.equal(h.api.snapshot().report.code,'invalid_argument');assert.doesNotMatch(h.api.snapshot().report.error,/private/);h.api.destroy();
});

test('bounded timeout clears busy state and rejects a transport that resolves after expiry',async()=>{
 const C=context();let expire,release;C.setTimeout=(fn,ms)=>{assert.equal(ms,30000);expire=fn;return 1;};C.clearTimeout=()=>{};const h=setup({C,call:async()=>{await new Promise(r=>release=r);return {payload:recorded};}}),request=h.api.load();
 for(let i=0;i<10 && !release;i++)await new Promise(setImmediate);assert.ok(release);expire();assert.equal(h.api.snapshot().busy,false);assert.equal(h.api.snapshot().report.code,'timeout');assert.equal(h.calls[0].signal.aborted,true);release();assert.equal(await request,null);assert.equal(h.api.snapshot().exemplar,null);h.api.destroy();
});

test('inherited company profile needs no tracking or bindings, but explicit empty map and host/page disables win',async()=>{
 const C=context();C.TELEMETRY_COMPANY_TRACE_CONNECTIONS={company:profile()};const p={sections:board().sections},h=setup({C,p});assert.equal(h.counts.lists,0);assert.equal(h.api.snapshot().profiles.length,1);assert.equal(h.calls.length,0);assert.equal((await h.api.load()).traceId,ID);h.api.destroy();
 for(const config of [{traceConnections:{}},{enabled:false}]){const page={tracking:{telemetry:config}},api=C.createTelemetryDirect(page,{describe:async()=>{throw Error('must not discover');},call:async()=>{throw Error('must not call');}});assert.equal(api.snapshot().profiles.length,0);api.set('input',ID);assert.equal(await api.load(),null);api.destroy();}
 const absent=C.createTelemetryDirect({},null);assert.equal(absent.snapshot().profiles.length,1);assert.equal(absent.snapshot().available,false);absent.destroy();
});

test('registered Tempo profile uses the same direct-only path and preserves provider unknown completeness',async()=>{
 const C=context('native'),raw=JSON.parse(fs.readFileSync('tests/fixtures/provider-traces/grafana-source-test.json','utf8')),p={version:1,label:'Company Tempo',provider:'tempo',server:'Company Grafana',tool:'get_tempo_trace',readOnly:true,adapter:'tempo-v1',arguments:{traceId:'trace_id',start:'start',end:'end'},time:{encoding:'iso8601',type:'string',defaultLookback:'2h'},literals:{datasourceUid:'tempo-main'},environments:{prod:{}},links:[]},calls=[];
 const api=C.createTelemetryDirect(board(p),{describe:async()=>({name:p.tool,annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{datasourceUid:{type:'string'},trace_id:{type:'string'},start:{type:'string'},end:{type:'string'}},required:['datasourceUid','trace_id','start','end'],additionalProperties:false}}),call:async(request,args)=>{calls.push(clone(args));return {payload:raw};}});
 api.set('input',raw.traceId);const e=await api.load(true);assert.equal(e.provider,'tempo');assert.equal(e.completeness,'unknown');assert.equal(e.spans[0].ms,125);assert.equal(calls.length,1);assert.equal(calls[0].trace_id,raw.traceId);assert.match(calls[0].start,/Z$/);assert.equal(api.snapshot().report.idMatched,true);api.destroy();
});

const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
async function sharedAccountSetup(t,call){
 const p=board();p.tracking.telemetry.grafana={prometheus:'direct-account-fixture'};
 const carrier=p.sections[0].diagram.nodes.a;carrier.tickets=['AA-1'];carrier.telemetry={kind:'service',signals:{rate:{grafana:'explicit_rate',unit:'req/h'}},proof:{rate:{min:1}}};
 const numeric=()=>({payload:{data:[{values:[[Math.floor(Date.now()/1000),'42']]}]}});
 const h=setup({p,call:(server,name,args,options)=>call?call(name,numeric,options):name==='get_trace'?{payload:recorded}:name==='query_prometheus'?numeric():{payload:[]}});
 h.mcp.listTools=async()=>{h.counts.lists++;return [{server:fixture.server,tools:[tool()]},{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']}];};
 const log=h.C.liveStatusTelemetryActivity(),metrics=h.C.createTelemetry(p,h.adapter.options,{carriers:fn=>fn(carrier,'a',p),jira:()=>({'AA-1':{state:'done',updatedAt:new Date(Date.now()-3600000).toISOString()}}),observed:log.observe,reset:log.clear,retire:log.retire});
 const live={snapshot:()=>({actionLabel:''}),action(){},onChange:()=>()=>{},onDestroy:()=>()=>{}},handle=h.adapter.attach({telemetry:metrics,liveStatus:live},p);
 t.after(()=>{h.api.destroy();handle.destroy();metrics.destroy();});await settle();metrics.setEnabled(true);await settle();assert.equal(metrics.snapshot().map.a.signals.rate.value,42);assert.ok(log.snapshot().length,'observed first-traffic activity exists before the account boundary');
 return {...h,metrics,log,numeric};
}
for(const origin of ['discovery','detail'])test('direct '+origin+' user_changed retires shared numeric/proof/history and ignores late results',async t=>{
 let changed=false,holdNumeric=false,release;
 const h=await sharedAccountSetup(t,(name,numeric,options)=>{if(name==='get_trace'){if(changed)throw {code:'user_changed'};return {payload:recorded};}if(name==='query_prometheus'){if(holdNumeric)return new Promise(r=>release=()=>r(numeric()));return numeric();}return {payload:[]};});
 // Populate selected history, then return live. Account retirement must not
 // leave a cached result that a later history visit can restore.
 const days=[{at:new Date().toISOString()}];h.metrics.openHistory(days,0);await settle();assert.equal(h.metrics.snapshot().map.a.signals.rate.value,42);h.metrics.closeHistory();await settle();
 holdNumeric=true;h.metrics.retry();await settle();assert.ok(release);
 if(origin==='discovery')h.mcp.listTools=async()=>{h.counts.lists++;throw {code:'user_changed'};};else changed=true;
 assert.equal(await h.api.load(true),null);assert.equal(h.api.snapshot().available,false);assert.equal(h.api.snapshot().report.code,'user_changed');assert.equal(h.metrics.enabled(),false);assert.equal(h.metrics.snapshot().available,false);assert.deepEqual(clone(h.metrics.snapshot().map),{});assert.equal(h.log.snapshot().length,0);assert.equal(h.C.liveStatusProofPresentation(h.metrics.snapshot(),'24h',true).rows[0].kpis[0].text,'unobserved');
 release();await settle();assert.deepEqual(clone(h.metrics.snapshot().map),{});assert.equal(h.log.snapshot().length,0);
 const counts=[h.calls.length,h.counts.lists];h.metrics.setEnabled(true);h.metrics.openHistory(days,0);await settle();assert.deepEqual(clone(h.metrics.snapshot().map),{});h.api.set('environment','stage');await h.api.load();assert.deepEqual([h.calls.length,h.counts.lists],counts);
 // Recreating just the direct controller cannot reopen the retired provider.
 const replacement=h.C.createTelemetryDirect(h.p,h.adapter.options.directTrace);replacement.set('environment','prod');replacement.set('input',ID);assert.equal(replacement.snapshot().available,false);await replacement.load();assert.deepEqual([h.calls.length,h.counts.lists],counts);replacement.destroy();
});
for(const pending of [false,true])test('query account change retracts '+(pending?'pending':'loaded')+' direct evidence and prevents further calls',async t=>{
 let changed=false,holdDirect=false,release,heldSignal;
 const h=await sharedAccountSetup(t,(name,numeric,options)=>{if(name==='get_trace'){if(holdDirect){heldSignal=options.signal;return new Promise(r=>release=()=>r({payload:recorded}));}return {payload:recorded};}if(name==='query_prometheus'){if(changed)throw {code:'user_changed'};return numeric();}return {payload:[]};});
 await h.api.load();assert.equal(h.api.snapshot().exemplar.traceId,ID);let request;
 if(pending){holdDirect=true;request=h.api.load();await settle();assert.ok(release);}
 changed=true;h.metrics.retry();await settle();assert.equal(h.api.snapshot().available,false);assert.equal(h.api.snapshot().exemplar,null);assert.equal(h.api.snapshot().report.code,'user_changed');assert.deepEqual(clone(h.metrics.snapshot().map),{});assert.equal(h.log.snapshot().length,0);
 if(pending){assert.equal(heldSignal.aborted,true);release();assert.equal(await request,null);assert.equal(h.api.snapshot().exemplar,null);}
 const counts=[h.calls.length,h.counts.lists];changed=false;h.api.clear();h.api.set('environment','stage');await h.api.load(true);h.metrics.setEnabled(true);await settle();assert.deepEqual([h.calls.length,h.counts.lists],counts);assert.equal(h.api.snapshot().exemplar,null);
});
test('ordinary direct form cancellation preserves the shared numeric account session',async t=>{
 const h=await sharedAccountSetup(t);const before=clone(h.metrics.snapshot().map);await h.api.load();h.api.set('environment','stage');h.api.clear();assert.equal(h.metrics.enabled(),true);assert.equal(h.metrics.snapshot().available,true);assert.deepEqual(clone(h.metrics.snapshot().map),before);assert.equal(h.api.snapshot().available,true);assert.equal(h.api.snapshot().form.input,'');h.api.set('input',ID);assert.equal((await h.api.load()).traceId,ID);
});
test('connection and environment changes require fresh trace input; section-only changes preserve it',async()=>{
 for(const change of ['environment','connection','global']){let global='prod';const p=board();p.tracking.telemetry.traceConnections.other=profile();const h=setup({p,hooks:{identity:()=>[global,false]}});h.api.set('connection','company');h.api.set('environment','prod');h.api.set('input',ID);h.api.set('start','2026-10-12T00:00:00Z');h.api.set('end','2026-10-12T02:00:00Z');
  if(change==='global')global='stage';else h.api.set(change,change==='environment'?'stage':'other');const form=h.api.snapshot().form;assert.equal(form.input,'',change);assert.equal(form.start,'',change);assert.equal(form.end,'',change);assert.equal(await h.api.load(),null);assert.equal(h.counts.lists,0,change);assert.equal(h.calls.length,0,change);h.api.destroy();
 }
 const h=setup({hooks:{sections:()=>[{id:'one',label:'One'},{id:'two',label:'Two'}]}});h.api.set('section','one');h.api.set('start','-2h');h.api.set('section','two');assert.equal(h.api.snapshot().form.input,ID);assert.equal(h.api.snapshot().form.start,'-2h');assert.equal(h.calls.length,0);assert.equal((await h.api.load()).traceId,ID);h.api.destroy();
});

test('a metadata-only no-spans response names the active lookback; a present but wrong table keeps the header message',async()=>{
 const notFound='---\nMetadata:\n  environment: ms-demo\n  navigation_hints: no spans found\n  total_spans: 0\n  trace_id: '+ID+'\n  view_mode: full\n  visible_spans: 0\n';
 for(const [start,label] of [['','2h'],['-7d','7d']]){
  const h=setup({result:{payload:notFound}});if(start)h.api.set('start',start);assert.deepEqual(clone(h.api.snapshot().bounds),{lookback:label,linkTime:false,linkUsable:false});assert.equal(await h.api.load(),null);const s=h.api.snapshot();
  assert.equal(s.exemplar,null);assert.equal(s.report.stage,'response');assert.equal(s.report.requestAccepted,true);assert.equal(s.report.idMatched,false);assert.equal(s.report.arguments.from,'-'+label);
  assert.equal(s.report.code,'trace_not_found');assert.equal(s.report.error,'Trace not found in the last '+label+'. Try a longer lookback under Lookback.');h.api.destroy();
 }
 const p=profile();p.time.encoding='iso8601';p.arguments.end='to';const t=tool();t.inputSchema.properties.to={type:'string'};t.inputSchema.required.push('to');
 const absolute=setup({p:board(p),result:{payload:notFound}});absolute.setTools([t]);absolute.api.set('start','2026-11-06T00:00:00Z');absolute.api.set('end','2026-11-06T06:00:00Z');assert.equal(await absolute.api.load(),null);
 assert.equal(absolute.api.snapshot().report.code,'trace_not_found');assert.equal(absolute.api.snapshot().report.error,'Trace not found between 2026-11-06T00:00:00Z and 2026-11-06T06:00:00Z. Try a wider range under Lookback.');absolute.api.destroy();
 const url='https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID+'&trace_start_ts=1791779586.602194688&trace_end_ts=1791779592.123456789',linked=setup({p:board(clone(p)),result:{payload:notFound}});linked.setTools([t]);linked.api.set('input',url);
 assert.deepEqual(clone(linked.api.snapshot().bounds),{lookback:null,linkTime:true,linkUsable:true});assert.equal(await linked.api.load(),null);const first=linked.api.snapshot().report;assert.equal(first.code,'trace_not_found');assert.equal(first.error,'Trace not found in the time range of the pasted link. Paste the trace ID alone, then set Lookback.');
 assert.equal(await linked.api.load(),null);assert.notEqual(linked.api.snapshot().report.serial,first.serial,'each not-found report is distinct');const calls=linked.calls.length;linked.api.set('start','-2h');assert.deepEqual(clone(linked.api.snapshot().bounds),{lookback:null,linkTime:true,linkUsable:true},'conflicting time controls do not hide link bounds');
 assert.equal(await linked.api.load(),null);assert.match(linked.api.snapshot().report.error,/both the link and controls/);assert.equal(linked.calls.length,calls);linked.api.set('input','');assert.equal(linked.api.snapshot().bounds,null);linked.api.destroy();
 const wrong=recorded.replace('| route |','| path |'),hinted=wrong.replace(/^  navigation_hints: .*$/m,'  navigation_hints: no spans found');assert.notEqual(hinted,wrong);
 for(const payload of [wrong,hinted]){const h=setup({result:{payload}});assert.equal(await h.api.load(),null);const s=h.api.snapshot();assert.equal(s.report.stage,'response');assert.equal(s.report.error,'Unsupported trace table header.');assert.notEqual(s.report.code,'trace_not_found');h.api.destroy();}
});

test('a pasted link with time on a relative-only connection is reported as unusable, not as the default lookback',async()=>{
 const url='https://ui.honeycomb.io/example-team/environments/production/trace?trace_id='+ID+'&trace_start_ts=1791779586.602194688&trace_end_ts=1791779592.123456789',startOnly=url.replace(/&trace_end_ts=[^&]*/,'');
 for(const [link,error] of [[url,/only relative time/],[startOnly,/both start and end/]]){
  const h=setup();h.api.set('input',link);assert.deepEqual(clone(h.api.snapshot().bounds),{lookback:null,linkTime:true,linkUsable:false});
  h.api.set('start','-7d');assert.deepEqual(clone(h.api.snapshot().bounds),{lookback:null,linkTime:true,linkUsable:false},'a Trace start does not make the link time usable');
  assert.equal(await h.api.load(),null);assert.equal(h.calls.length,0);assert.match(h.api.snapshot().report.error,/both the link and controls/);
  h.api.set('start','');assert.equal(await h.api.load(),null);assert.equal(h.calls.length,0);assert.match(h.api.snapshot().report.error,error);h.api.destroy();
 }
 const p=profile();p.time.encoding='iso8601';p.arguments.end='to';const h=setup({p:board(p)});h.api.set('input',startOnly);assert.deepEqual(clone(h.api.snapshot().bounds),{lookback:null,linkTime:true,linkUsable:false},'a start-only link is unusable on an absolute-capable connection');
 h.api.set('end','2026-10-12T05:00:00Z');assert.deepEqual(clone(h.api.snapshot().bounds),{lookback:null,linkTime:true,linkUsable:true},'a start-only link plus Trace end is usable');h.api.destroy();
});
/* #1081: the Load-trace environment starts at the profile environment that matches the board Environment,
   and follows board changes until the user picks a trace environment. */
test('#1081 matchTraceEnvironment: exact id, then case-insensitive id or label, then aliases; ambiguous or unknown is no match',()=>{
 const M=context().matchTraceEnvironment,envs={prod:{label:'Production'},stage:{label:'Staging'}};
 assert.equal(M('prd',envs),'prod','1: board prd matches profile prod by alias');assert.equal(M('production',envs),'prod');assert.equal(M('stg',envs),'stage');assert.equal(M('STAGING',envs),'stage','label match ignores case');
 assert.equal(M('prd',{production:{label:'Prod'},prd:{label:'Other'}}),'prd','2: exact id wins over an alias match');assert.equal(M('PROD',{production:{},prod:{}}),'prod','case-insensitive id wins over an alias match');
 assert.equal(M('Live',{live:{label:'Live'},prod:{label:'Production'}}),'live');assert.equal(M('development',{dev:{}}),'dev');assert.equal(M('QA',{qa:{}}),'qa');
 for(const [b,e] of [['perf',envs],['',envs],[null,envs],['prd',{}],['prd',{prod:{},production:{}}]])assert.equal(M(b,e),'',String(b)+' → no match');
});
test('#1081 Load-trace environment seeds from the board, keeps today\'s fallback, and follows board changes until the user picks',()=>{
 const envs={prod:{label:'Production',value:'production',context:{team:'example-team'}},stage:{label:'Staging',value:'staging',context:{team:'example-team'}}};
 let current='prd';const api=(()=>{const p=profile();p.environments=clone(envs);return context().createTelemetryDirect(board(p),{describe(){},call(){}},{sections:()=>[],environment:()=>current});})();
 assert.equal(api.snapshot().form.environment,'prod','1: board prd starts the dropdown at prod');
 current='stg';assert.equal(api.snapshot().form.environment,'stage','4: board change is followed before a user pick');
 current='perf';assert.equal(api.snapshot().form.environment,'','3: no match shows Choose…');
 current='prd';assert.equal(api.snapshot().form.environment,'prod');
 api.set('environment','stage');assert.equal(api.snapshot().form.environment,'stage');current='stg';assert.equal(api.snapshot().form.environment,'stage');current='prd';assert.equal(api.snapshot().form.environment,'stage','4: the user pick stays after board changes');
 api.destroy();
 const one=profile();one.environments={stage:clone(envs.stage)};const single=context().createTelemetryDirect(board(one),{describe(){},call(){}},{sections:()=>[],environment:()=>'perf'});assert.equal(single.snapshot().form.environment,'stage','3: no match keeps the single-environment default');single.destroy();
});
