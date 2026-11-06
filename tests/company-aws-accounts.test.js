'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {copyCheckout,kitFiles}=require('./helpers/checkout-copy.js');
const ROOT=path.join(__dirname,'..'),plain=v=>JSON.parse(JSON.stringify(v));
const ACCOUNTS={qa:{iot:'000000000001',queue:'000000000002'},stg:{iot:'111111111111',queue:'222222222222'},prd:{iot:'333333333333',queue:'444444444444'}};
function scratch(t,full=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-company-accounts-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 if(full)copyCheckout(root);else{fs.cpSync(path.join(ROOT,'src'),path.join(root,'src'),{recursive:true});fs.cpSync(path.join(ROOT,'tools'),path.join(root,'tools'),{recursive:true,filter:source=>!source.includes('node_modules')&&!source.includes('__pycache__')&&!source.includes('test-results')&&!source.includes('playwright-report')});fs.mkdirSync(path.join(root,'company'));}
 const write=value=>fs.writeFileSync(path.join(root,'company/company.json'),JSON.stringify(value));
 const loader=require(path.join(root,'tools/source-loader.cjs'));return {root,write,loader};
}
function board(){return {tracking:{telemetry:{environment:'stg',environments:{qa:{},stg:{},prd:{},dev:{}},grafana:{accountId:'999999999999'}}}};}
function carrier(){return {telemetry:{kind:'service',signals:{
 iot:{cloudwatch:{namespace:'AWS/IoT',metric:'Success',statistic:'Sum',region:'us-east-1',accountId:'${iot}',dimensions:{RuleName:'rule-${iot}'}},scope:'topic $aws/rules/${iot}',links:{query:'https://grafana.example/${env}/${iot}'}},
 queue:{cloudwatchLogs:{logGroups:['arn:aws:logs:us-east-1:${queue}:log-group:queue'],region:'us-east-1',query:'stats count(*) as count'},unit:'events'},
 rate:{grafana:'requests{account="${iot}",queue="${queue}",legacy="$account",env="$env"}'}
 }}};}
function context(loader,name='standalone'){const C={URL,TextEncoder,TextDecoder,AbortController,console,setTimeout,clearTimeout,document:{hidden:false,addEventListener(){},removeEventListener(){}}};vm.runInNewContext(loader.entrypoint(name).body,C);return C;}

test('company account schema rejects invalid shapes and prototype names, preserves leading zeros and validates documented example',t=>{
 const {loader,write}=scratch(t);const text=fs.readFileSync(path.join(ROOT,'docs/live-status.md'),'utf8');
 const documented=JSON.parse(text.split('### Company AWS account defaults')[1].match(/```json\n([\s\S]*?)```/)[1]);write(documented);assert.deepEqual(loader.companyConfig().awsAccounts,ACCOUNTS);assert.deepEqual(loader.companyAgentContext(),{awsAccounts:ACCOUNTS});
 const invalid=[null,[],42,'bad',{qa:null},{qa:[]},{'bad.id':{}},{qa:{'bad-name':'123456789012'}},{qa:{iot:123456789012}},{qa:{iot:'123'}},{qa:{iot:'1234567890123'}},{qa:{iot:' 12345678901'}},{qa:{iot:'00000000000x'}}];
 for(const key of ['__proto__','prototype','constructor','env','account']){invalid.push(JSON.parse('{"'+key+'":{}}'));invalid.push(JSON.parse('{"qa":{"'+key+'":"123456789012"}}'));}
 for(const awsAccounts of invalid){write({version:1,awsAccounts});assert.throws(()=>loader.companyConfig(),/awsAccounts/,JSON.stringify(awsAccounts));}
 write({version:1,awsAccounts:{}});assert.deepEqual(loader.companyConfig().awsAccounts,{});
});

test('shared compiled resolver applies selected company defaults below board overrides, never seeds environments or mutates source',t=>{
 const {loader,write}=scratch(t);write({version:1,awsAccounts:ACCOUNTS});const C=context(loader),page=board(),before=JSON.stringify(page),raw=carrier(),source=JSON.stringify(raw);
 for(const env of ['qa','stg','prd']){
  const config=C.telemetryEnvironmentConfig(page,env),bound=C.carrierTelemetry(raw,{},null,config);
  assert.deepEqual(plain(config.variables),ACCOUNTS[env]);assert.equal(bound.signals.iot.query.accountId,ACCOUNTS[env].iot);assert.equal(bound.signals.iot.query.dimensions.RuleName,'rule-'+ACCOUNTS[env].iot);assert.equal(bound.signals.iot.scope,'topic $aws/rules/'+ACCOUNTS[env].iot);assert.equal(bound.signals.queue.query.logGroups[0],'arn:aws:logs:us-east-1:'+ACCOUNTS[env].queue+':log-group:queue');assert.match(bound.signals.rate.query,/legacy="999999999999"/);assert.ok(bound.signals.rate.query.includes('env="'+env+'"'));assert.equal(bound.signals.iot.links.query,'https://grafana.example/'+env+'/'+ACCOUNTS[env].iot);
 }
 assert.equal(JSON.stringify(page),before);assert.equal(JSON.stringify(raw),source);assert.equal(C.telemetryEnvironmentConfig(page).environment,'stg');assert.deepEqual(Object.keys(C.trackingTelemetry(page).environments),Object.keys(page.tracking.telemetry.environments));assert.ok(Object.values(C.trackingTelemetry(page).environments).every(profile=>profile.variables===undefined));
 page.tracking.telemetry.variables={iot:'555555555555'};page.tracking.telemetry.environments.stg.variables={queue:'666666666666',iot:'777777777777'};
 assert.deepEqual(plain(C.telemetryEnvironmentConfig(page,'stg').variables),{iot:'777777777777',queue:'666666666666'});assert.deepEqual(plain(C.telemetryEnvironmentConfig(page,'qa').variables),{iot:'555555555555',queue:ACCOUNTS.qa.queue});
 assert.equal(C.telemetryEnvironmentConfig({}).environment,undefined);assert.equal(C.telemetryEnvironmentConfig({},'qa').variables,undefined);assert.equal(C.telemetryEnvironmentConfig(board(),'dev').variables,undefined);
 const missing=C.carrierTelemetry(raw,{},null,C.telemetryEnvironmentConfig(board(),'dev'));assert.match(missing.signals.iot.error,/\$\{iot\}/);assert.match(missing.signals.queue.error,/\$\{queue\}/);
 const p=board();p.tracking.telemetry.environments.dev.variables={iot:'888888888888'};const partial=C.carrierTelemetry(raw,{},null,C.telemetryEnvironmentConfig(p,'dev'));assert.equal(partial.signals.iot.error,undefined);assert.match(partial.signals.queue.error,/\$\{queue\}/);
});

test('templates, imported/nested/loaded bindings, native and raw worker compositions share exactly one environment pass',t=>{
 const {loader,write}=scratch(t);write({version:1,awsAccounts:ACCOUNTS});
 for(const name of ['standalone','native','backend','workbench']){
  const C=context(loader,name),p=board(),config=C.telemetryEnvironmentConfig(p,'qa');
  const templates={count:{kind:'service',params:['topic'],signals:{rate:{grafana:'up{account="${iot}",topic="$topic"}'}}}};
  const local={telemetry:{use:'count',topic:'$aws/${queue}'}},imported={telemetry:C.telemetryExpand(local.telemetry,templates)};
  for(const node of [local,imported])assert.equal(C.carrierTelemetry(node,templates,null,config).signals.rate.query,'up{account="000000000001",topic="$aws/000000000002"}',name);
  config.variables.iot='${queue}';assert.equal(C.carrierTelemetry(carrier(),{},null,config).signals.iot.query.accountId,'${queue}',name);
  if(C.telemetryBindings){const out=C.telemetryBindings(fn=>['local','shared::api','shared::nested::api','loaded::api'].forEach(id=>fn(imported,id,{tracking:{telemetry:{}}})), 'qa',C.telemetryEnvironmentConfig(p,'qa'));assert.equal(out.length,4);for(const b of out)assert.ok(b.signals.rate.query.includes('000000000001'));}
 }
 const host={};vm.runInNewContext(loader.readSource('workbench/auto-arrange.js'),host);const worker={self:{},URL};vm.runInNewContext(host.AUTO_ARRANGE_WORKER_SOURCE,worker);assert.deepEqual(plain(worker.telemetryEnvironmentConfig(board(),'prd').variables),ACCOUNTS.prd);
 const C={URL,TextEncoder};vm.runInNewContext(loader.readSource('validator.js'),C);assert.deepEqual(plain(C.telemetryEnvironmentConfig(board(),'qa').variables),ACCOUNTS.qa);
 // Raw source/metadata analysis remains safe without build substitution.
 const raw={URL};vm.runInNewContext(loader.sourceRecords(['core/tracking.js'],undefined,false)[0].source,raw);assert.equal(raw.telemetryEnvironmentConfig(board(),'qa').variables,undefined);
});

test('missing registry alias leaves only that query unobserved while valid peers refresh',async t=>{
 const {loader,write}=scratch(t);write({version:1,awsAccounts:{qa:{iot:ACCOUNTS.qa.iot}}});const C=context(loader),p=board(),calls=[];p.tracking.telemetry.environment='qa';p.tracking.telemetry.grafana.cloudwatch='cw';
 const raw=carrier();raw.telemetry.signals.queue={cloudwatch:{...raw.telemetry.signals.iot.cloudwatch,accountId:'${queue}'}};delete raw.telemetry.signals.rate;
 const adapter=C.createTelemetryProviders(p,{claude:{use:async()=>({listTools:async()=>[{server:'Grafana',tools:['query_cloudwatch']}],callTool:async(server,tool,input)=>{calls.push(plain(input));return {payload:{values:[7],timestamps:[1793491200000]}};}})}}),api=C.createTelemetry(p,adapter.options,{carriers:fn=>{fn(raw,'local',p);fn(raw,'shared::nested::api',p);}}),handle=adapter.attach({telemetry:api},p);t.after(()=>{handle.destroy();api.destroy();});
 const settle=async()=>{for(let i=0;i<15;i++)await new Promise(setImmediate);};await settle();api.setEnabled(true);await settle();assert.equal(calls.length,2);assert.ok(calls.every(c=>c.accountId===ACCOUNTS.qa.iot));
 for(const id of ['local','shared::nested::api']){assert.equal(api.snapshot().map[id].signals.iot.value,7);assert.equal(api.snapshot().map[id].signals.queue,undefined);}assert.match(api.status().note,/queue/);
});

test('absent and disabled company config retain original environment behavior and omit author instructions',t=>{
 const {loader,write}=scratch(t);assert.equal(context(loader).telemetryEnvironmentConfig(board(),'qa').variables,undefined);
 write({version:1,awsAccounts:ACCOUNTS});const original=process.env.FLOWVIEW_COMPANY_IDENTITY;t.after(()=>{if(original===undefined)delete process.env.FLOWVIEW_COMPANY_IDENTITY;else process.env.FLOWVIEW_COMPANY_IDENTITY=original;});process.env.FLOWVIEW_COMPANY_IDENTITY='off';
 assert.equal(loader.companyConfig(),null);assert.deepEqual(loader.companyAgentContext(),{});assert.equal(context(loader).telemetryEnvironmentConfig(board(),'qa').variables,undefined);
 const C={};vm.runInNewContext(loader.readSource('workbench/agent-chat.js'),C);assert.doesNotMatch(C.folderAgentInstructions('Board','mixed',false,{sessionId:'s',connectionId:'c'},'external'),/Company AWS account defaults/);
});

test('compiled portable HTML and source-free kit preserve registry and author context; no-config omits both',t=>{
 const {root,loader,write}=scratch(t,true);write({version:1,awsAccounts:ACCOUNTS});
 const build=(...args)=>execFileSync('python3',['tools/build.py',...args],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});build();
 for(const name of ['template/flowview.html','workbench/flowspec.html','tools/canon/generated-runtime.cjs'])assert.ok(fs.readFileSync(path.join(root,name),'utf8').includes('var TELEMETRY_COMPANY_AWS_ACCOUNTS='+JSON.stringify(ACCOUNTS)),name);
 const C={};vm.runInNewContext(loader.readSource('workbench/agent-chat.js'),C);for(const mode of ['external','embedded']){const prompt=C.folderAgentInstructions('Board','mixed',false,{sessionId:'s',connectionId:'c'},mode);assert.ok(prompt.includes(JSON.stringify(ACCOUNTS)));assert.match(prompt,/shared board variables override/);}
 const files=kitFiles(fs.readFileSync(path.join(root,'workbench/flowspec.html'),'utf8'));assert.deepEqual(JSON.parse(files['tools/company-agent-context.json']),{awsAccounts:ACCOUNTS});assert.equal(files['company/company.json'],undefined);
 const kit=path.join(root,'portable');for(const [file,content] of Object.entries(files)){const dest=path.join(kit,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}
 assert.ok(files['tools/canon/generated-runtime.cjs'].includes(JSON.stringify(ACCOUNTS)));

 for(const cwd of [root,kit]){execFileSync('python3',['tools/authoring-packet.py','--mode','edit','--out','packet.md'],{cwd,encoding:'utf8'});const packet=fs.readFileSync(path.join(cwd,'packet.md'),'utf8'),meta=JSON.parse(fs.readFileSync(path.join(cwd,'packet.md.json'),'utf8'));assert.ok(packet.includes(JSON.stringify(ACCOUNTS.qa.iot)));assert.deepEqual(meta.companyContext,{awsAccounts:ACCOUNTS});}
 // The kit includes authored starter JSON; remove even those inputs before checking the compiled runtime.
 fs.rmSync(path.join(kit,'src'),{recursive:true,force:true});
 const portable={URL,TextEncoder,module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(kit,'tools/canon/generated-runtime.cjs'),'utf8'),portable);assert.deepEqual(plain(portable.telemetryEnvironmentConfig(board(),'qa').variables),ACCOUNTS.qa);assert.equal(portable.carrierTelemetry(carrier(),{},null,portable.telemetryEnvironmentConfig(board(),'prd')).signals.iot.query.accountId,ACCOUNTS.prd.iot);assert.equal(fs.existsSync(path.join(kit,'src')),false);assert.equal(fs.existsSync(path.join(kit,'company')),false);
 const portableRuntime=require(path.join(kit,'tools/canon/generated-runtime.cjs'));assert.equal(typeof portableRuntime.validateSpec,'function');
 build('--no-config');assert.equal(kitFiles(fs.readFileSync(path.join(root,'workbench/flowspec.html'),'utf8'))['tools/company-agent-context.json'],undefined);for(const name of ['template/flowview.html','workbench/flowspec.html','tools/canon/generated-runtime.cjs'])assert.ok(fs.readFileSync(path.join(root,name),'utf8').includes('var TELEMETRY_COMPANY_AWS_ACCOUNTS={};'));
});
