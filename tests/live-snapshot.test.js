'use strict';
/* #1265 tools/live-snapshot.js: an agent's snapshot of a board's real Jira status and metrics.
| row | fixture | assertion | rejects |
|---|---|---|---|
| S1 | example doorbell board; the mock Atlassian and Grafana connectors in-process, story days 5 and 8 | the snapshot is one demo story day plus snapshotAt; liveStatusDemoMap gives exactly the mock day's state per ticket (a ticket absent that day is missing); liveStatusDemoTelemetry the current metric values; one error per authored PR | a second format; any state written for every ticket |
| S2 | the CLI against Jira REST and Grafana HTTP (a local server behind https names) | one stdout line with counts, time and errors; the calls carry the credentials; neither stdout nor the file holds any of them; *.snapshot.json is git-ignored | provider responses on stdout; credentials in output |
| S3 | JIRA_API_TOKEN unset; one Grafana query failing | the line names JIRA_API_TOKEN; the failing signal is recorded and the other signals are kept | a crash or a silent skip |
| S4 | --out inside this repository: a path git does not ignore, then a *.snapshot.json path | the first is refused before any provider call and no file is written; the second is written | a real snapshot that could be committed |
| S5 | a board whose authored Jira site is not Atlassian Cloud, or plain http; GRAFANA_URL with a password or over http | no request is sent there; each refusal is recorded; no secret is printed or written | an authored host receiving the agent's token |
| S6 | the CLI process against a host that never answers, --timeout 2 | the process prints its line and exits within a few seconds | an agent command left waiting |
| S7 | a board with topologyImports | refused with the reason, no file | imported carriers silently dropped |
| S8 | Honeycomb, SQL and CloudWatch signals and authored PRs | one error per unsupported signal (carrier id and name) and per PR | unread data reported as "no errors" |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),os=require('node:os'),vm=require('node:vm'),{execFileSync,spawn}=require('node:child_process');
const {entrypoint}=require('../tools/source-loader.cjs');
const SNAP='../tools/live-snapshot.js';
const BOARD='examples/live-status/live-status.spec.json';
const NOW=Date.parse('2026-10-25T09:00:00Z');
const runtime=()=>{const C={URL,console};vm.runInNewContext(entrypoint('standalone').body,C);return C;};
const plain=v=>JSON.parse(JSON.stringify(v));
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'live-snapshot-'));
const PRS=['https://github.com/acme/firmware/pull/88','https://github.com/acme/backend/pull/91'];

test('S1 the snapshot is one demo story day with exactly the mock day\'s state per ticket',async()=>{
 const snap=require(SNAP),atlassian=await import('../deploy/cloudflare/mock-atlassian-mcp/mcp.mjs'),grafana=await import('../deploy/cloudflare/mock-grafana-mcp/mcp.mjs');
 const story=JSON.parse(fs.readFileSync('examples/live-status/live-status.timeline.json','utf8')),keys=['HW-123','FW-45','FW-46','HW-124','BE-67','BE-68','UX-89'];
 for(const day of [5,8]){
  const transport=snap.mcpHandlerTransport({'Atlassian MCP':r=>atlassian.handleMcp(r,{now:NOW,day}),Grafana:r=>grafana.handleMcp(r,{now:NOW})});
  const {snapshot,summary}=await snap.takeSnapshot({specText:fs.readFileSync(BOARD,'utf8'),board:'live-status.spec.json',transport,now:()=>NOW,timeoutMs:20000});
  assert.equal(snapshot.kind,'flowview-live-snapshot');assert.equal(snapshot.snapshotAt,new Date(NOW).toISOString());assert.equal(snapshot.days.length,1,'one day');
  assert.match(snapshot.days[0].label,/^Snapshot from /);
  assert.deepEqual(snapshot.errors.map(e=>[e.source,e.tool]),PRS.map(url=>['github',url]),'the only errors are the unread PR states');
  const C=runtime(),map=plain(C.liveStatusDemoMap(snapshot.days[0],keys,snapshot.epics)),truth=story.days[day].issues;
  // Exact state per ticket on that story day; a ticket the day does not name is missing.
  for(const key of keys)assert.equal(map[key].state,truth[key]?truth[key].state:'missing','day '+day+' '+key);
  for(const key of Object.keys(truth))if(keys.includes(key))assert.equal(map[key].title,truth[key].summary,key+' title');
  assert.equal(map['DOOR-100'].title,'Connected doorbell delivery','the epic is in the snapshot');
  assert.equal(summary.missing,keys.filter(key=>!truth[key]).length);
  const telemetry=plain(C.liveStatusDemoTelemetry(snapshot.days[0]));
  assert.ok(Object.keys(telemetry).length>0,'metrics are in the snapshot');assert.equal(summary.carriers,Object.keys(telemetry).length);
  for(const id of Object.keys(telemetry))for(const name of Object.keys(telemetry[id].signals)){const s=telemetry[id].signals[name];assert.equal(s.value,s.series.at(-1)[1],id+' '+name+' current value');}
 }
});

/* A local Jira REST and Grafana HTTP server, reached through https names (the script refuses http):
   `fetch` maps https://jira.test and https://grafana.test to it and records each URL asked for. */
function providers({failQuery=null,pages=false,failJira=null,failTickets=false,rateOnce=false}={}){
 let limited=false;
 const seen=[],asked=[];
 const issue=(key,status,category)=>({key,fields:{summary:'Work '+key,status:{name:status,statusCategory:{key:category}},assignee:{displayName:'Pat'},updated:'2026-10-24T10:00:00.000+0000'}});
 const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const url=new URL(req.url,'http://x');seen.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),auth:req.headers.authorization||'',body});
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/rest/api/3/search/jql'){
   if(failJira){res.writeHead(failJira,{'Content-Type':'application/json','Retry-After':'30'});return res.end('{}');}
   const ask=JSON.parse(body),jql=ask.jql;
   if(rateOnce && !limited){limited=true;res.writeHead(429,{'Content-Type':'application/json','Retry-After':'1'});return res.end('{}');}
   if(failTickets && !/Flagged/.test(jql))return send(500,{});
   // FW-46 is flagged as an impediment: blocked whatever its status.
   if(/Flagged/.test(jql))return send(200,{issues:/FW-46/.test(jql)?[issue('FW-46','Done','done')]:[],isLast:true});
   if(/^parent = /.test(jql))return send(200,{issues:[],isLast:true});
   const keys=(/key in \(([^)]+)\)/.exec(jql) || [,''])[1].split(', ').filter(Boolean);
   const all=keys.filter(k=>k!=='UX-89').map((k,i)=>issue(k,i%2?'In Progress':'Done',i%2?'indeterminate':'done'));
   if(pages){if(ask.nextPageToken==='p2')return send(200,{issues:all.slice(3),isLast:true});return send(200,{issues:all.slice(0,3),nextPageToken:'p2',isLast:false});}
   return send(200,{issues:all,isLast:true});
  }
  if(url.pathname.endsWith('/api/v1/query_range')){
   if(failQuery && url.searchParams.get('query').includes(failQuery))return send(500,{error:'boom '+(req.headers.authorization||'')});
   const end=Number(url.searchParams.get('end')),step=Number(url.searchParams.get('step'));
   return send(200,{status:'success',data:{resultType:'matrix',result:[{metric:{},values:[[end-2*step,'10'],[end-step,'12'],[end,'14']]}]}});
  }
  if(url.pathname.endsWith('/loki/api/v1/query_range')){const end=Math.floor(Number(url.searchParams.get('end'))/1e9);return send(200,{status:'success',data:{resultType:'matrix',result:[{metric:{},values:[[end,'3']]}]}});}
  if(url.pathname==='/api/annotations')return send(200,[]);
  send(404,{});
 });});
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{
  const origin='http://127.0.0.1:'+server.address().port;
  const fetchImpl=(url,options)=>{asked.push(String(url));return fetch(String(url).replace(/^https:\/\/(jira|grafana)\.test/,origin),options);};
  resolve({origin,seen,asked,fetch:fetchImpl,close:()=>new Promise(r=>server.close(r))});
 }));
}
const SECRET={JIRA_EMAIL:'agent@example.test',JIRA_API_TOKEN:'jira-secret-token-123',GRAFANA_TOKEN:'glsa_grafana-secret-456'};
const SECRETS=Object.values(SECRET).concat([Buffer.from(SECRET.JIRA_EMAIL+':'+SECRET.JIRA_API_TOKEN).toString('base64')]);
async function cli(env,dir,{fetchImpl,board=BOARD,args=[]}={}){
 const snap=require(SNAP),lines=[],stdout={write:t=>lines.push(t)};
 const copy=path.join(dir,'doorbell.spec.json');fs.copyFileSync(board,copy);
 const code=await snap.main([copy,'--timeout','20'].concat(args),env,{stdout,fetchImpl});
 return {code,lines,board:copy,out:path.join(dir,'doorbell.snapshot.json')};
}
function noSecret(texts){for(const text of texts)for(const secret of SECRETS)assert.ok(!text.includes(secret),'no credential in output: '+secret.slice(0,6)+'…');}

test('S2 the CLI calls the REST APIs with the credentials, prints one line and never prints or writes a credential',async()=>{
 const p=await providers(),dir=tmp();
 try{
  const env={JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET};
  const r=await cli(env,dir,{fetchImpl:p.fetch});
  assert.equal(r.code,0);assert.equal(r.lines.length,1,'exactly one line');assert.equal(r.lines[0].split('\n').filter(Boolean).length,1,'one line, no provider output');
  assert.match(r.lines[0],/^snapshot .*doorbell\.snapshot\.json at \d{4}-\d{2}-\d{2}T/);assert.match(r.lines[0],/7 tickets \(1 missing\)/);assert.match(r.lines[0],/carriers, \d+ of \d+ signals/);
  const jira=p.seen.filter(s=>s.path==='/rest/api/3/search/jql'),graf=p.seen.filter(s=>s.path.includes('/api/datasources/proxy/uid/'));
  assert.ok(jira.length>0 && jira.every(s=>s.method==='POST' && s.auth==='Basic '+Buffer.from(SECRET.JIRA_EMAIL+':'+SECRET.JIRA_API_TOKEN).toString('base64')),'Jira calls carry basic auth');
  assert.ok(JSON.parse(jira[0].body).fields.includes('status'),'the search asks only for the fields the viewer reads');
  assert.ok(graf.length>0 && graf.every(s=>s.auth==='Bearer '+SECRET.GRAFANA_TOKEN),'Grafana calls carry the token');
  assert.ok(graf.some(s=>s.path==='/api/datasources/proxy/uid/prom-main/api/v1/query_range'),'Prometheus through the board\'s datasource uid');
  assert.ok(p.asked.every(url=>/^https:\/\/(jira|grafana)\.test\//.test(url)),'every request goes to the hosts the environment names');
  const text=fs.readFileSync(r.out,'utf8'),snapshot=JSON.parse(text);noSecret([text,r.lines[0]]);
  assert.equal(snapshot.days[0].issues['UX-89'],undefined,'a ticket Jira did not return is left out (the board shows it missing)');
  // Each key's state from its REST status category; the flagged one is blocked.
  const want={'HW-123':'done','FW-45':'active','FW-46':'blocked','HW-124':'active','BE-67':'done','BE-68':'active'};
  for(const [key,state] of Object.entries(want))assert.equal(snapshot.days[0].issues[key].state,state,key);
  const C=runtime(),telemetry=plain(C.liveStatusDemoTelemetry(snapshot.days[0]));assert.equal(telemetry.ingest.signals.rate.value,14,'the current value');assert.deepEqual(telemetry.ingest.signals.rate.series.map(p=>p[1]),[10,12,14]);
  // It is a valid demo timeline: tools/inject.py --timeline accepts it.
  execFileSync('python3',['-c','import sys;sys.path.insert(0,"tools");import inject;inject.load_timeline(sys.argv[1])',r.out]);
  // A snapshot never enters git.
  const ignored=execFileSync('git',['check-ignore','-v','diagrams/demo/board.snapshot.json'],{encoding:'utf8'});assert.match(ignored,/snapshot\.json/);
 }finally{await p.close();}
});

test('S3 a missing credential is named, and a failing query is recorded without stopping the run or leaking the token',async()=>{
 const p=await providers({failQuery:'code=~'}),dir=tmp();
 try{
  const env={JIRA_SITE:'https://jira.test',JIRA_EMAIL:SECRET.JIRA_EMAIL,GRAFANA_URL:'https://grafana.test',GRAFANA_TOKEN:SECRET.GRAFANA_TOKEN};
  const r=await cli(env,dir,{fetchImpl:p.fetch});
  assert.equal(r.code,0,'metrics alone still make a snapshot');assert.equal(r.lines.length,1);
  assert.match(r.lines[0],/Jira skipped/);assert.match(r.lines[0],/jira: JIRA_API_TOKEN is not set/);
  assert.equal(p.seen.filter(s=>s.path.startsWith('/rest/')).length,0,'no Jira call without credentials');
  const text=fs.readFileSync(r.out,'utf8'),snapshot=JSON.parse(text);noSecret([text,r.lines[0]]);
  assert.ok(snapshot.errors.some(e=>e.source==='jira' && /JIRA_API_TOKEN/.test(e.message)));
  assert.ok(snapshot.errors.some(e=>e.source==='grafana' && /HTTP 500/.test(e.message)),'the failing query is recorded');
  const C=runtime(),telemetry=plain(C.liveStatusDemoTelemetry(snapshot.days[0]));
  assert.equal(telemetry.ingest.signals.rate.value,14,'the other signals are kept');assert.equal(telemetry.ingest.signals.errors,undefined,'the failed one is absent, not zero');
  // Nothing usable at all: no file, and the line says why.
  const none=await cli({},tmp());assert.equal(none.code,1);assert.equal(none.lines.length,1);assert.match(none.lines[0],/^snapshot not written: .*JIRA_EMAIL, JIRA_API_TOKEN are not set.*GRAFANA_URL, GRAFANA_TOKEN are not set/);
  assert.equal(fs.existsSync(none.out),false);
 }finally{await p.close();}
});

test('S4 inside a git work tree the script writes only a path git ignores, and refuses before any call',async()=>{
 const p=await providers(),snap=require(SNAP);
 const env={JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET},repo=path.resolve(__dirname,'..');
 const run=async out=>{const lines=[],stdout={write:t=>lines.push(t)};const code=await snap.main([BOARD,'--out',out,'--timeout','20'],env,{stdout,fetchImpl:p.fetch});return {code,lines};};
 const tracked=path.join(repo,'tests','live-snapshot-refused.json'),ignored=path.join(repo,'tests','live-snapshot-check.snapshot.json');
 try{
  const refused=await run(tracked);
  assert.equal(refused.code,1);assert.equal(refused.lines.length,1);assert.match(refused.lines[0],/^snapshot not written: .*live-snapshot-refused\.json is inside a git work tree and git does not ignore it/);
  assert.equal(fs.existsSync(tracked),false,'nothing written');assert.equal(p.seen.length,0,'no provider was called');
  const written=await run(ignored);assert.equal(written.code,0);assert.ok(fs.existsSync(ignored),'an ignored path is written');
 }finally{fs.rmSync(ignored,{force:true});fs.rmSync(tracked,{force:true});await p.close();}
});

test('S5 credentials go only to hosts the environment names or an https Atlassian Cloud site; URLs with a password or over http are refused',async()=>{
 const p=await providers();
 try{
  const raw=JSON.parse(fs.readFileSync(BOARD,'utf8')),dir=tmp(),board=path.join(dir,'authored.spec.json');
  // A board authored elsewhere names its own Jira host; without JIRA_SITE the token must not go there.
  for(const site of ['https://jira.test','http://jira.test']){
   raw.page.tracking.jira.site=site;fs.writeFileSync(board,JSON.stringify(raw));p.asked.length=0;
   const r=await cli({...SECRET},tmp(),{fetchImpl:p.fetch,board});
   assert.equal(p.asked.length,0,site+': no request');assert.match(r.lines[0],/JIRA_SITE is not set \(the board's site is not an https \*\.atlassian\.net host, so credentials are not sent to it\)/);noSecret(r.lines);
  }
  // The board's own https Atlassian Cloud site is used when JIRA_SITE is unset.
  raw.page.tracking.jira.site='https://acme.atlassian.net';fs.writeFileSync(board,JSON.stringify(raw));p.asked.length=0;
  const blocked=url=>{p.asked.push(String(url));return Promise.reject(new TypeError('fetch failed'));};
  await cli({...SECRET},tmp(),{fetchImpl:blocked,board});assert.ok(p.asked.length>0 && p.asked.every(url=>url.startsWith('https://acme.atlassian.net/rest/api/3/')),'the board\'s Atlassian Cloud site');
  // An environment URL over http, or holding a user name or password, is refused before any request.
  const secretUrl='https://admin:grafana-url-password-789@grafana.test';
  for(const [env,reason] of [[{JIRA_SITE:'http://jira.test',...SECRET},/JIRA_SITE must use https; no request was made/],[{GRAFANA_URL:secretUrl,GRAFANA_TOKEN:SECRET.GRAFANA_TOKEN},/GRAFANA_URL must not contain a user name or password; no request was made/],[{GRAFANA_URL:'http://grafana.test',GRAFANA_TOKEN:SECRET.GRAFANA_TOKEN},/GRAFANA_URL must use https/]]){
   p.asked.length=0;const out=tmp(),r=await cli(env,out,{fetchImpl:p.fetch});
   assert.equal(p.asked.length,0,'no request');assert.match(r.lines[0],reason);
   const file=path.join(out,'doorbell.snapshot.json'),texts=r.lines.concat(fs.existsSync(file)?[fs.readFileSync(file,'utf8')]:[]);
   noSecret(texts);for(const text of texts)assert.ok(!text.includes('grafana-url-password-789'),'the URL password is never printed');
  }
 }finally{await p.close();}
});

test('S6 the process exits soon after --timeout when a host never answers',async()=>{
 // Accepts connections and never answers, not even the TLS handshake.
 const sockets=[],server=net.createServer(socket=>sockets.push(socket));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const dir=tmp(),board=path.join(dir,'doorbell.spec.json');fs.copyFileSync(BOARD,board);
 try{
  const started=Date.now(),child=spawn(process.execPath,[path.resolve(__dirname,'..','tools','live-snapshot.js'),board,'--timeout','2'],
   {env:{PATH:process.env.PATH,JIRA_SITE:'https://127.0.0.1:'+server.address().port,...SECRET},stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
  const code=await new Promise((resolve,reject)=>{const kill=setTimeout(()=>{child.kill();reject(new Error('still running after 20 s'));},20000);child.on('exit',c=>{clearTimeout(kill);resolve(c);});});
  const took=Date.now()-started;
  assert.ok(took<10000,'exited in '+took+' ms');assert.equal(out.split('\n').filter(Boolean).length,1,'one line');assert.equal(err,'','nothing on stderr');assert.match(out,/no answer within 2 s|not written/);noSecret([out]);
  assert.equal(typeof code,'number');
 }finally{sockets.forEach(s=>s.destroy());await new Promise(r=>server.close(r));}
});

test('S7 a board that imports shared topology is refused with the reason',async()=>{
 const dir=tmp(),r=await cli({...SECRET,GRAFANA_URL:'https://grafana.test',GRAFANA_TOKEN:SECRET.GRAFANA_TOKEN},dir,{board:'examples/canon/topology/checkout.json',fetchImpl:()=>Promise.reject(new Error('no call expected'))});
 assert.equal(r.code,1);assert.equal(r.lines.length,1);assert.match(r.lines[0],/^snapshot not written: the board imports shared topology \(topologyImports in section \d+/);
 assert.equal(fs.existsSync(r.out),false);
});

test('S8 every signal the script does not read, and every authored PR, is one recorded error',async()=>{
 const p=await providers(),dir=tmp(),board=path.join(dir,'mixed.spec.json');
 try{
  const raw={page:{tracking:{jira:{site:'https://acme.atlassian.net'},telemetry:{grafana:{prometheus:'prom-main'},window:'24h'}},sections:[{id:'main',diagram:{
   nodes:{api:{title:'API',tickets:['AA-1'],prs:['https://github.com/acme/api/pull/7'],telemetry:{kind:'service',signals:{rate:{grafana:'sum(rate(x[5m]))',unit:'req/h'},spans:{honeycomb:{dataset:'api',calculation:'COUNT'},unit:'spans'}}}},
    db:{title:'DB',telemetry:{kind:'service',signals:{rows:{sql:'select count(*) from t',unit:'rows'},cpu:{cloudwatch:{namespace:'AWS/RDS',metric:'CPUUtilization',statistic:'Average',region:'us-east-1',accountId:'123456789012',dimensions:{DBInstanceIdentifier:'db'}},unit:'%'}}}}},
   rows:[['api','db']],edges:[{from:'api',to:'db'}]}}]}};
  fs.writeFileSync(board,JSON.stringify(raw));
  const r=await cli({JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET},dir,{fetchImpl:p.fetch,board});
  const snapshot=JSON.parse(fs.readFileSync(r.out,'utf8')),by=snapshot.errors.map(e=>e.source+' '+e.tool);
  for(const want of ['honeycomb api spans','grafana db rows','grafana db cpu','github https://github.com/acme/api/pull/7'])assert.ok(by.includes(want),'one error for '+want+': '+JSON.stringify(by));
  assert.equal(by.filter(e=>e==='grafana db rows').length,1,'one per signal, not per call');
  assert.ok(!by.includes('grafana api rate'),'a read signal has no error');assert.match(r.lines[0],/errors \(/);
  // Unread SQL, CloudWatch and Honeycomb signals beside it never cost the signals the script reads.
  assert.ok(snapshot.days[0].telemetry.carriers.api && snapshot.days[0].telemetry.carriers.api.rate,'api rate is observed: '+JSON.stringify(Object.keys(snapshot.days[0].telemetry.carriers)));
  assert.match(r.lines[0],/1 carriers, 1 of 4 signals/);
 }finally{await p.close();}
});

test('S9 the real CLI prints exactly one line and nothing on stderr',async()=>{
 const dir=tmp(),board=path.join(dir,'doorbell.spec.json');fs.copyFileSync(BOARD,board);
 const child=spawn(process.execPath,[path.resolve(__dirname,'..','tools','live-snapshot.js'),board],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
 let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
 const code=await new Promise(resolve=>child.on('exit',resolve));
 assert.equal(code,1);assert.equal(err,'');assert.equal(out,'snapshot not written: jira: JIRA_EMAIL, JIRA_API_TOKEN are not set; grafana: GRAFANA_URL, GRAFANA_TOKEN are not set\n');
});
test('S10 Jira pages are followed; a Jira that never answers leaves the tickets unknown and no file',async()=>{
 const env={JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET};
 let p=await providers({pages:true});
 try{
  const r=await cli(env,tmp(),{fetchImpl:p.fetch}),issues=JSON.parse(fs.readFileSync(r.out,'utf8')).days[0].issues;
  assert.deepEqual(Object.keys(issues).filter(k=>/^(HW|FW|BE)-/.test(k)).sort(),['BE-67','BE-68','FW-45','FW-46','HW-123','HW-124'],'both pages are read');
  assert.ok(p.seen.some(s=>s.path==='/rest/api/3/search/jql' && JSON.parse(s.body).nextPageToken==='p2'),'the second page asks with nextPageToken');
 }finally{await p.close();}
 p=await providers({failJira:429});
 try{
  const dir=tmp(),r=await cli(env,dir,{fetchImpl:p.fetch});
  assert.equal(r.code,1);assert.equal(r.lines.length,1);assert.match(r.lines[0],/^snapshot not written: Jira answered no search for the board's tickets, so its 7 tickets are unknown \(first: Jira search is rate limited \(HTTP 429, retry after 30\)\)/);
  assert.doesNotMatch(r.lines[0],/missing/);assert.equal(fs.existsSync(r.out),false);
 }finally{await p.close();}
});
test('S11 a datasource uid that is not one path segment is refused before any request',async()=>{
 const p=await providers(),dir=tmp(),board=path.join(dir,'uid.spec.json');
 try{
  const raw=JSON.parse(fs.readFileSync(BOARD,'utf8'));raw.page.tracking.telemetry.grafana.prometheus='../admin';delete raw.page.tracking.jira;
  for(const section of raw.page.sections || [])for(const node of Object.values(section.diagram && section.diagram.nodes || {})){delete node.tickets;delete node.prs;}
  fs.writeFileSync(board,JSON.stringify(raw));
  const r=await cli({GRAFANA_URL:'https://grafana.test',GRAFANA_TOKEN:SECRET.GRAFANA_TOKEN},dir,{fetchImpl:p.fetch,board});
  assert.ok(!p.asked.some(url=>url.includes('/..') || url.includes('%2E%2E') || url.includes('admin')),'no request leaves the datasource proxy');
  const file=path.join(dir,'doorbell.snapshot.json'),text=r.lines.join('')+(fs.existsSync(file)?fs.readFileSync(file,'utf8'):'');
  assert.match(text,/datasource uid \\?"\.\.\/admin\\?" is not valid/);
 }finally{await p.close();}
});

test('S12 an unread SQL or CloudWatch signal on the example board leaves every read signal in place',async()=>{
 const env={JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET};
 const p=await providers();
 try{
  const base=await cli(env,tmp(),{fetchImpl:p.fetch}),before=JSON.parse(fs.readFileSync(base.out,'utf8')).days[0].telemetry.carriers,count=o=>Object.values(o).reduce((n,c)=>n+Object.keys(c).length,0);
  assert.ok(count(before)>0,'precondition: the example board has read signals');
  for(const extra of [{q:{sql:'select 1',unit:'rows'}},{cpu:{cloudwatch:{namespace:'AWS/RDS',metric:'CPUUtilization',statistic:'Average',region:'us-east-1',accountId:'123456789012',dimensions:{DBInstanceIdentifier:'db'}},unit:'%'}}]){
   const raw=JSON.parse(fs.readFileSync(BOARD,'utf8')),dir=tmp(),board=path.join(dir,'extra.spec.json');
   raw.page.tracking.telemetry.grafana.sql='sql-main';raw.page.tracking.telemetry.grafana.cloudwatch='cw-main';
   const ingest=raw.page.sections.map(s=>s.diagram && s.diagram.nodes && s.diagram.nodes.ingest).find(Boolean);Object.assign(ingest.telemetry.signals,extra);
   fs.writeFileSync(board,JSON.stringify(raw));
   const r=await cli(env,dir,{fetchImpl:p.fetch,board}),after=JSON.parse(fs.readFileSync(r.out,'utf8')).days[0].telemetry.carriers;
   assert.equal(count(after),count(before),Object.keys(extra)[0]+': every read signal is still observed');
   assert.ok(JSON.parse(fs.readFileSync(r.out,'utf8')).errors.some(e=>e.tool==='ingest '+Object.keys(extra)[0]),'the unread one is one error');
  }
 }finally{await p.close();}
});
test('S13 scrub removes each secret in plain, URL-encoded and lower-case encoded forms',()=>{
 const {scrub}=require(SNAP),secret='ab+c/d=e?f&g',basic=Buffer.from('a@b.test:'+secret).toString('base64');
 const text=['plain '+secret,'encoded '+encodeURIComponent(secret),'lower '+encodeURIComponent(secret).replace(/%[0-9A-F]{2}/g,m=>m.toLowerCase()),'basic '+basic,'encoded basic '+encodeURIComponent(basic),'header Bearer '+secret].join(' | ');
 const out=scrub(text,[secret,basic]);
 for(const form of [secret,encodeURIComponent(secret),encodeURIComponent(secret).toLowerCase(),basic,encodeURIComponent(basic)])assert.ok(!out.includes(form),'gone: '+form);
 assert.equal((out.match(/\*\*\*/g) || []).length>=6,true);
});
test('S14 at the deadline every provider still busy is named',async()=>{
 const snap=require(SNAP),hang=(url,options)=>new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason || new Error('aborted')));});
 const transport=snap.restTransport({JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET},hang,()=>Date.now(),'https://acme.atlassian.net');
 const {summary}=await snap.takeSnapshot({specText:fs.readFileSync(BOARD,'utf8'),transport,timeoutMs:1000});
 const late=summary.errors.filter(e=>/no answer within 1 s/.test(e.message)).map(e=>e.source).sort();
 assert.deepEqual(late,['grafana','jira']);
});
test('S15 a Flagged search alone does not count as Jira answering: the tickets stay unknown and no file is written',async()=>{
 const p=await providers({failTickets:true});
 try{
  const r=await cli({JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET},tmp(),{fetchImpl:p.fetch});
  assert.ok(p.seen.some(s=>s.path==='/rest/api/3/search/jql' && /Flagged/.test(JSON.parse(s.body).jql)),'precondition: the Flagged search answered');
  assert.equal(r.code,1);assert.match(r.lines[0],/^snapshot not written: Jira answered no search for the board's tickets, so its 7 tickets are unknown/);assert.equal(fs.existsSync(r.out),false);
 }finally{await p.close();}
});
test('S16 a rate-limited call that the retry recovers is not recorded as an error',async()=>{
 const p=await providers({rateOnce:true});
 try{
  const r=await cli({JIRA_SITE:'https://jira.test',GRAFANA_URL:'https://grafana.test',...SECRET},tmp(),{fetchImpl:p.fetch});
  const bodies=p.seen.filter(s=>s.path==='/rest/api/3/search/jql').map(s=>s.body);
  assert.ok(bodies.some((b,i)=>bodies.indexOf(b)!==i),'precondition: the rate-limited search was sent again');
  const snapshot=JSON.parse(fs.readFileSync(r.out,'utf8'));
  assert.equal(snapshot.errors.filter(e=>/rate limited/.test(e.message)).length,0,'the recovered 429 is not an error');assert.doesNotMatch(r.lines[0],/rate limited/);
  assert.equal(snapshot.days[0].issues['FW-46'].state,'blocked','the retried search still delivered');assert.equal(Object.keys(snapshot.days[0].issues).filter(k=>/^(HW|FW|BE)-/.test(k)).length,6);
 }finally{await p.close();}
});
