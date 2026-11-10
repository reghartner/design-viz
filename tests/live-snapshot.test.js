'use strict';
/* #1265 tools/live-snapshot.js: an agent's snapshot of a board's real Jira status and metrics.
| row | fixture | assertion | rejects |
|---|---|---|---|
| S1 | example doorbell board; the mock Atlassian and Grafana connectors in-process | the snapshot is one demo story day plus snapshotAt; liveStatusDemoMap gives the states the viewer's controller had, liveStatusDemoTelemetry the current metric values | a second format the Workbench would have to learn |
| S2 | the CLI against a local Jira REST + Grafana HTTP server | one stdout line with counts, time and errors; the calls carry the credentials; the file holds none of them; *.snapshot.json is git-ignored | provider responses on stdout; credentials in the file |
| S3 | JIRA_API_TOKEN unset; one Grafana query failing | the line names JIRA_API_TOKEN; the failing signal is recorded and the other signals are kept | a crash or a silent skip |
| S4 | --out inside this repository: a path git does not ignore, then a *.snapshot.json path | the first is refused before any provider call and no file is written; the second is written | a real snapshot that could be committed |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const {entrypoint}=require('../tools/source-loader.cjs');
const SNAP='../tools/live-snapshot.js';
const BOARD='examples/live-status/live-status.spec.json';
const NOW=Date.parse('2026-10-25T09:00:00Z');
const runtime=()=>{const C={URL,console};vm.runInNewContext(entrypoint('standalone').body,C);return C;};
const plain=v=>JSON.parse(JSON.stringify(v));
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'live-snapshot-'));

test('S1 the snapshot is one demo story day that the demo readers accept, with the viewer adapters\' states',async()=>{
 const snap=require(SNAP),atlassian=await import('../deploy/cloudflare/mock-atlassian-mcp/mcp.mjs'),grafana=await import('../deploy/cloudflare/mock-grafana-mcp/mcp.mjs');
 const transport=snap.mcpHandlerTransport({'Atlassian MCP':r=>atlassian.handleMcp(r,{now:NOW}),Grafana:r=>grafana.handleMcp(r,{now:NOW})});
 const {snapshot,summary}=await snap.takeSnapshot({specText:fs.readFileSync(BOARD,'utf8'),board:'live-status.spec.json',transport,now:()=>NOW,timeoutMs:20000});
 assert.equal(snapshot.kind,'flowview-live-snapshot');assert.equal(snapshot.snapshotAt,new Date(NOW).toISOString());assert.equal(snapshot.days.length,1,'one day');
 assert.match(snapshot.days[0].label,/^Snapshot from /);assert.deepEqual(snapshot.errors,[]);
 const C=runtime(),keys=['HW-123','FW-45','FW-46','HW-124','BE-67','BE-68','UX-89'];
 const map=plain(C.liveStatusDemoMap(snapshot.days[0],keys,snapshot.epics));
 // The mock's day for NOW, read through its own tool, is the truth to compare with.
 const truth=atlassian.handleMcp({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'searchJiraIssuesUsingJql',arguments:{cloudId:'x',jql:'key in ('+keys.join(', ')+')',maxResults:50}}},{now:NOW}).result.structuredContent.issues.nodes;
 assert.equal(truth.length,keys.length);
 for(const issue of truth){assert.ok(map[issue.key],issue.key);assert.equal(map[issue.key].title,issue.fields.summary,issue.key+' title');}
 assert.ok(keys.every(key=>['todo','active','testing','done','blocked'].includes(map[key].state)),'every ticket has a real state');
 assert.equal(map['DOOR-100'].title,'Connected doorbell delivery','the epic is in the snapshot');
 const telemetry=plain(C.liveStatusDemoTelemetry(snapshot.days[0]));
 assert.ok(Object.keys(telemetry).length>0,'metrics are in the snapshot');assert.equal(summary.carriers,Object.keys(telemetry).length);
 for(const id of Object.keys(telemetry))for(const name of Object.keys(telemetry[id].signals)){const s=telemetry[id].signals[name];assert.equal(s.value,s.series.at(-1)[1],id+' '+name+' current value');}
 assert.equal(summary.tickets,7);assert.equal(summary.missing,0);
});

/* A local Jira REST and Grafana HTTP server; it records each request. */
function providers({failQuery=null}={}){
 const seen=[];
 const issue=(key,status,category)=>({key,fields:{summary:'Work '+key,status:{name:status,statusCategory:{key:category}},assignee:{displayName:'Pat'},updated:'2026-10-24T10:00:00.000+0000'}});
 const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const url=new URL(req.url,'http://x');seen.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),auth:req.headers.authorization||'',body});
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/rest/api/3/search/jql'){
   const jql=JSON.parse(body).jql;if(/Flagged/.test(jql))return send(200,{issues:[],isLast:true});
   if(/^parent = /.test(jql))return send(200,{issues:[],isLast:true});
   const keys=(/key in \(([^)]+)\)/.exec(jql) || [,''])[1].split(', ').filter(Boolean);
   return send(200,{issues:keys.filter(k=>k!=='UX-89').map((k,i)=>issue(k,i%2?'In Progress':'Done',i%2?'indeterminate':'done')),isLast:true});
  }
  if(url.pathname.endsWith('/api/v1/query_range')){
   if(failQuery && url.searchParams.get('query').includes(failQuery))return send(500,{error:'boom'});
   const end=Number(url.searchParams.get('end')),step=Number(url.searchParams.get('step'));
   return send(200,{status:'success',data:{resultType:'matrix',result:[{metric:{},values:[[end-2*step,'10'],[end-step,'12'],[end,'14']]}]}});
  }
  if(url.pathname.endsWith('/loki/api/v1/query_range')){const end=Math.floor(Number(url.searchParams.get('end'))/1e9);return send(200,{status:'success',data:{resultType:'matrix',result:[{metric:{},values:[[end,'3']]}]}});}
  if(url.pathname==='/api/annotations')return send(200,[]);
  send(404,{});
 });});
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({origin:'http://127.0.0.1:'+server.address().port,seen,close:()=>new Promise(r=>server.close(r))})));
}
const SECRET={JIRA_EMAIL:'agent@example.test',JIRA_API_TOKEN:'jira-secret-token-123',GRAFANA_TOKEN:'glsa_grafana-secret-456'};
async function cli(env,dir){
 const snap=require(SNAP),lines=[],stdout={write:t=>lines.push(t)};
 const board=path.join(dir,'doorbell.spec.json');fs.copyFileSync(BOARD,board);
 const code=await snap.main([board,'--timeout','20'],env,{stdout});
 return {code,lines,board,out:path.join(dir,'doorbell.snapshot.json')};
}

test('S2 the CLI calls the REST APIs with the credentials, prints one line and never writes a credential',async()=>{
 const p=await providers(),dir=tmp();
 try{
  const env={JIRA_SITE:p.origin,GRAFANA_URL:p.origin,...SECRET};
  const r=await cli(env,dir);
  assert.equal(r.code,0);assert.equal(r.lines.length,1,'exactly one line');assert.equal(r.lines[0].split('\n').filter(Boolean).length,1,'one line, no provider output');
  assert.match(r.lines[0],/^snapshot .*doorbell\.snapshot\.json at \d{4}-\d{2}-\d{2}T/);assert.match(r.lines[0],/7 tickets \(1 missing\)/);assert.match(r.lines[0],/carriers, \d+ of \d+ signals/);
  const jira=p.seen.filter(s=>s.path==='/rest/api/3/search/jql'),graf=p.seen.filter(s=>s.path.includes('/api/datasources/proxy/uid/'));
  assert.ok(jira.length>0 && jira.every(s=>s.method==='POST' && s.auth==='Basic '+Buffer.from(SECRET.JIRA_EMAIL+':'+SECRET.JIRA_API_TOKEN).toString('base64')),'Jira calls carry basic auth');
  assert.ok(JSON.parse(jira[0].body).fields.includes('status'),'the search asks only for the fields the viewer reads');
  assert.ok(graf.length>0 && graf.every(s=>s.auth==='Bearer '+SECRET.GRAFANA_TOKEN),'Grafana calls carry the token');
  assert.ok(graf.some(s=>s.path==='/api/datasources/proxy/uid/prom-main/api/v1/query_range'),'Prometheus through the board\'s datasource uid');
  const text=fs.readFileSync(r.out,'utf8'),snapshot=JSON.parse(text);
  for(const secret of Object.values(SECRET).concat([Buffer.from(SECRET.JIRA_EMAIL+':'+SECRET.JIRA_API_TOKEN).toString('base64')]))assert.ok(!text.includes(secret),'no credential in the file');
  assert.equal(snapshot.days[0].issues['UX-89'],undefined,'a ticket Jira did not return is left out (the board shows it missing)');
  assert.equal(snapshot.days[0].issues['HW-123'].state,'done');
  const C=runtime(),telemetry=plain(C.liveStatusDemoTelemetry(snapshot.days[0]));assert.equal(telemetry.ingest.signals.rate.value,14,'the current value');assert.deepEqual(telemetry.ingest.signals.rate.series.map(p=>p[1]),[10,12,14]);
  // It is a valid demo timeline: tools/inject.py --timeline accepts it, so a local built page can show it with #live=demo.
  execFileSync('python3',['-c','import sys;sys.path.insert(0,"tools");import inject;inject.load_timeline(sys.argv[1])',r.out]);
  // A snapshot never enters git.
  const ignored=execFileSync('git',['check-ignore','-v','diagrams/demo/board.snapshot.json'],{encoding:'utf8'});assert.match(ignored,/snapshot\.json/);
 }finally{await p.close();}
});

test('S3 a missing credential is named, and a failing query is recorded without stopping the run',async()=>{
 const p=await providers({failQuery:'code=~'}),dir=tmp();
 try{
  const env={JIRA_SITE:p.origin,JIRA_EMAIL:SECRET.JIRA_EMAIL,GRAFANA_URL:p.origin,GRAFANA_TOKEN:SECRET.GRAFANA_TOKEN};
  const r=await cli(env,dir);
  assert.equal(r.code,0,'metrics alone still make a snapshot');assert.equal(r.lines.length,1);
  assert.match(r.lines[0],/Jira skipped/);assert.match(r.lines[0],/jira: JIRA_API_TOKEN is not set/);
  assert.equal(p.seen.filter(s=>s.path.startsWith('/rest/')).length,0,'no Jira call without credentials');
  const snapshot=JSON.parse(fs.readFileSync(r.out,'utf8'));
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
 const env={JIRA_SITE:p.origin,GRAFANA_URL:p.origin,...SECRET},repo=path.resolve(__dirname,'..');
 const run=async out=>{const lines=[],stdout={write:t=>lines.push(t)};const code=await snap.main([BOARD,'--out',out,'--timeout','20'],env,{stdout});return {code,lines};};
 const tracked=path.join(repo,'tests','live-snapshot-refused.json'),ignored=path.join(repo,'tests','live-snapshot-check.snapshot.json');
 try{
  const refused=await run(tracked);
  assert.equal(refused.code,1);assert.equal(refused.lines.length,1);assert.match(refused.lines[0],/^snapshot not written: .*live-snapshot-refused\.json is inside a git work tree and git does not ignore it/);
  assert.equal(fs.existsSync(tracked),false,'nothing written');assert.equal(p.seen.length,0,'no provider was called');
  const written=await run(ignored);assert.equal(written.code,0);assert.ok(fs.existsSync(ignored),'an ignored path is written');
 }finally{fs.rmSync(ignored,{force:true});fs.rmSync(tracked,{force:true});await p.close();}
});
