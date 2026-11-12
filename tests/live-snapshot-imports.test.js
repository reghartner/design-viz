'use strict';
/* #1367 (epic #1344, narrowing PR 6): tools/live-snapshot.js --resolve-imports <folder-or-registry>.
   Mocked providers only: an in-process Grafana MCP handler records every query; nothing is called.
| row | fixture | assertion | rejects |
|---|---|---|---|
| R1 | a consumer importing a provider dcf node: `sent` (needsNarrow code, narrowed by the board), `dropped` (needsNarrow code, not narrowed) and `bycode` (`${code}`, set by the import); resolved with the registry | the Loki queries sent are exactly the narrowed one and the one with the import's value; `dropped` is never queried and is recorded with the viewer's reason under its carrier id and name; the applied fragments are recorded; the metrics hold `sent` and `bycode` only | a snapshot that sends the unnarrowed query or drops imported carriers |
| R2 | the CLI with --resolve-imports and an injected transport | exit 0, one line, the file written outside git with the imported carrier | a flag that is parsed but not used |
| R3 | the same consumer without --resolve-imports | exit 1, one line naming --resolve-imports <repository folder or registry>, no file, no provider call | a silent partial snapshot |
| R4 | --resolve-imports with a registry that lacks the provider | exit 1, one line "cannot resolve imports" naming the provider, no file, no provider call | a snapshot of an unresolved board |
| R5 | usage | the usage line names --resolve-imports | an undocumented flag |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const SNAP='../tools/live-snapshot.js';
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'live-snapshot-imports-'));
const spec=(id,diagram,page={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...page,sections:[{id:'main',diagram}]}});
function repository({withProvider=true}={}){
  const dir=tmp();
  const provider=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{
      sent:{loki:'sum(count_over_time({app="dcf"}[5m]))',needsNarrow:['code'],unit:'events'},
      dropped:{loki:'sum(count_over_time({app="dcf-drops"}[5m]))',needsNarrow:['code'],unit:'events'},
      bycode:{loki:'sum(count_over_time({app="dcf", code="${code}"}[5m]))',unit:'events'}}}}},
    rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],panels:[{id:'status',type:'live-status',title:'Status'}],
    topologyImports:[{spec:'provider',export:'core',as:'fc',position:{x:80,y:300},variables:{code:'EARLY'},
      nodeTracking:{dcf:{telemetry:{extends:true,signals:{sent:{narrow:{loki:'| code="FULL"'}}}}}}}]},
    {tracking:{telemetry:{grafana:{loki:'loki-uid'},window:'24h'}}});
  fs.writeFileSync(path.join(dir,'provider.spec.json'),JSON.stringify(provider));
  fs.writeFileSync(path.join(dir,'consumer.spec.json'),JSON.stringify(consumer));
  const diagrams=[{id:'consumer',path:'consumer.spec.json'}].concat(withProvider?[{id:'provider',path:'provider.spec.json'}]:[]);
  fs.writeFileSync(path.join(dir,'registry.json'),JSON.stringify({version:1,diagrams}));
  return {dir,consumer:path.join(dir,'consumer.spec.json'),registry:path.join(dir,'registry.json')};
}
// A Grafana MCP handler (the mcpHandlerTransport shape) that records each LogQL query and answers a count.
function grafana(){
  const asked=[];
  const handler=req=>{
    if(req.method==='tools/list')return {result:{tools:['query_prometheus','query_loki_logs','get_annotations'].map(name=>({name}))}};
    const {name,arguments:input}=req.params;
    if(name==='query_loki_logs'){asked.push(input.logql);const at=Math.floor(Date.now()/1000);return {result:{structuredContent:{data:[{values:[[at-3600,'5'],[at,'7']]}]}}};}
    return {result:{structuredContent:[]}};
  };
  return {asked,handler};
}
const transportOf=g=>require(SNAP).mcpHandlerTransport({Grafana:g.handler});
const resolvedText=async(repo)=>JSON.stringify((await (await import('../tools/canon/local-imports.mjs')).resolveLocalImports(repo.consumer,repo.registry)).resolved);
function cli(argv,transport){const lines=[];const stdout={write(text){lines.push(...String(text).split('\n').filter(Boolean));return true;}};return require(SNAP).main(argv,{},{stdout,transport}).then(code=>({code,lines}));}

test('R1 a resolved importing board: the narrowed query and the import\'s value are sent; an unmet signal is never queried and says why',async()=>{
  const snap=require(SNAP),repo=repository(),g=grafana();
  const {snapshot,summary}=await snap.takeSnapshot({specText:await resolvedText(repo),board:'consumer.spec.json',transport:transportOf(g),resolved:true,timeoutMs:20000});
  assert.ok(snapshot,'a resolved importing board is snapshotted, not refused');
  assert.deepEqual([...new Set(g.asked)].sort(),['sum(count_over_time({app="dcf", code="EARLY"}[5m]))','sum(count_over_time({app="dcf"} | code="FULL" [5m]))'],'only the narrowed query and the import\'s value are sent');
  assert.ok(!g.asked.some(q=>q.includes('dcf-drops')),'the unmet signal is never queried');
  assert.deepEqual(snapshot.errors.filter(e=>e.tool==='fc::dcf dropped'),[{source:'grafana',tool:'fc::dcf dropped',message:'The provider asks each board to narrow this signal by code, and nothing narrows it here, so it is not shown.'}],'recorded with the viewer\'s reason');
  assert.deepEqual(Object.keys(snapshot.days[0].telemetry.carriers['fc::dcf'] || {}).sort(),['bycode','sent'],'the metrics hold the shown signals only');
  assert.deepEqual(snapshot.narrowed,{'fc::dcf':{sent:['| code="FULL"']}},'the applied fragments are recorded');
  assert.equal(summary.signals,3);assert.equal(summary.observed,2);
  assert.doesNotMatch(JSON.stringify(snapshot),/"values":\[\[|structuredContent/,'no provider response text is recorded');
});

test('R2 the CLI with --resolve-imports writes the snapshot with the imported carrier',async()=>{
  const repo=repository(),g=grafana(),out=path.join(tmp(),'consumer.snapshot.json');
  const r=await cli([repo.consumer,'--resolve-imports',repo.registry,'--out',out,'--timeout','20'],transportOf(g));
  assert.equal(r.code,0,r.lines.join('\n'));assert.equal(r.lines.length,1);assert.match(r.lines[0],/^snapshot .* 2 of 3 signals/);
  const written=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.ok(written.days[0].telemetry.carriers['fc::dcf'],'the imported carrier is in the file');
  assert.ok(g.asked.length>0);
});

test('R3 without --resolve-imports an importing board is refused, naming the flag, with no file and no provider call',async()=>{
  const repo=repository(),g=grafana(),out=path.join(tmp(),'consumer.snapshot.json');
  const r=await cli([repo.consumer,'--out',out],transportOf(g));
  assert.equal(r.code,1);assert.equal(r.lines.length,1);
  assert.match(r.lines[0],/^snapshot not written: the board imports shared topology \(topologyImports in section \d+\).*--resolve-imports <repository folder or registry>/);
  assert.equal(fs.existsSync(out),false);assert.equal(g.asked.length,0);
});

test('R4 a registry that cannot resolve the imports writes nothing and calls no provider',async()=>{
  const repo=repository({withProvider:false}),g=grafana(),out=path.join(tmp(),'consumer.snapshot.json');
  const r=await cli([repo.consumer,'--resolve-imports',repo.registry,'--out',out],transportOf(g));
  assert.equal(r.code,1);assert.equal(r.lines.length,1);
  assert.match(r.lines[0],/^snapshot not written: cannot resolve imports: .*provider/);
  assert.equal(fs.existsSync(out),false);assert.equal(g.asked.length,0);
});

test('R5 usage names --resolve-imports',async()=>{
  const r=await cli([],transportOf(grafana()));
  assert.equal(r.code,2);assert.match(r.lines[0],/--resolve-imports <folder-or-registry>/);
});
