import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
/* #1099: Load trace finds a trace from a Loki log line (test plan 1, 2 and 6;
   tests/telemetry-log-lookup.test.js covers the rest). Desktop only. */
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8');
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0',SPAN='011114cbd1fd62de',PANEL={id:'status',type:'live-status',title:'Status'};
const QUERY='{env="$env"} |= "Handling camera stats message" | cameraModel="$value"';
const schema=()=>({name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string',enum:['full']}},required:['trace_id','from','environment_slug','team_slug','view_mode'],additionalProperties:false}});
// grafana/mcp-grafana tools/loki.go QueryLokiLogsResult (format full): one line with the ids, one without.
const LINES={data:[
 {timestamp:'1794044533123456789',line:'Handling camera stats message',labels:{env:'stg',severity_text:'DEBUG'},structuredMetadata:{cameraModel:'arch',trace_id:ID,span_id:SPAN}},
 {timestamp:'1794040000000000000',line:'Handling camera stats message',labels:{env:'stg',severity_text:'DEBUG'},structuredMetadata:{cameraModel:'arch'}}
],metadata:{linesReturned:2,maxLinesAllowed:10,resultsTruncated:false}};
async function open(page,server,{grafana=true,lookups=true,lines=LINES}={}){
 await page.setViewportSize({width:1500,height:1100});const calls=[];
 const servers=[{server:PROFILE.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false}}]}].concat(grafana?[{server:'Grafana',tools:[{name:'query_loki_logs',annotations:{readOnlyHint:true}}]}]:[]);
 await page.exposeFunction('logTools',()=>servers);await page.exposeFunction('logDescribe',()=>schema());
 await page.exposeFunction('logPermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
 await page.exposeFunction('logCall',(server,tool,args)=>{calls.push({server,tool,args});return tool==='query_loki_logs'?{content:[{type:'text',text:JSON.stringify(lines)}]}:{payload:args.trace_id===ID?RECORDED:notFound(args.trace_id)};});
 await page.addInitScript(()=>{window.claude={use:async name=>name==='permissions'?{request:keys=>window.logPermission(keys)}:{listTools:()=>window.logTools(),describeTool:()=>window.logDescribe(),callTool:(s,n,a)=>window.logCall(s,n,a)}};window.flowviewBooted=ctl=>{window.ctl=ctl;};});
 const telemetry={grafana:{loki:'loki-$env'},environment:'stg',environments:{stg:{},prd:{}},traceConnections:{company:PROFILE}};
 if(lookups)telemetry.lookups={camera:{label:'Camera model',query:QUERY,values:['arch','wren']}};
 const name='log-lookup-'+(grafana?'grafana':'absent')+(lookups?'':'-plain'),spec={page:{title:'Camera stats',tracking:{telemetry},sections:[{id:'main',diagram:{nodes:{consumer:{title:'Camera stats consumer'}},rows:[['consumer']],panels:[PANEL]}}]}};
 await writeFile(path.join(server.root,name+'.json'),JSON.stringify(spec));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')],{stdio:'pipe'});
 await page.goto(server.origin+'/'+name+'.html');await page.waitForFunction(()=>!!window.ctl);
 const root=page.locator('.pwidget.pt-live-status').filter({visible:true}).first();await root.getByRole('button',{name:'Trace',exact:true}).click();
 await root.getByRole('combobox',{name:'Connection environment',exact:true}).selectOption('prod');
 return {root,logs:root.locator('.dv-trace-logs'),calls};
}
// Accessible names of the Load trace controls outside the log lookup section.
// A Honeycomb get_trace answer for a trace it did not keep.
const notFound=id=>'---\nMetadata:\n  environment: production\n  navigation_hints: no spans found\n  total_spans: 0\n  trace_id: '+id+'\n  view_mode: full\n  visible_spans: 0\n';
const formControls=root=>root.locator('.dv-trace-config').evaluate(config=>Array.from(config.querySelectorAll('input,select,textarea,button')).filter(n=>!n.closest('.dv-trace-logs')).map(n=>[n.tagName,n.getAttribute('aria-label') || n.textContent.trim(),n.disabled]));

test('desktop authored log lookup lists the newest matching lines and loads the chosen trace focused on its span',async({page,server},info)=>{
 const h=await open(page,server);
 await expect(h.logs.getByRole('combobox',{name:'Log lookup',exact:true})).toHaveValue('camera');await expect(h.logs.getByRole('button',{name:'Find log lines',exact:true})).toBeEnabled();
 await h.logs.getByLabel('Camera model',{exact:true}).fill('arch');expect(h.calls).toHaveLength(0);
 await h.logs.getByRole('button',{name:'Find log lines',exact:true}).click();
 const lines=h.logs.locator('.dv-trace-log-row');await expect(lines).toHaveCount(2);
 expect(h.calls).toEqual([{server:'Grafana',tool:'query_loki_logs',args:{datasourceUid:'loki-stg',logql:'{env="stg"} |= "Handling camera stats message" | cameraModel="arch"',startRfc3339:'now-2h',endRfc3339:'now',limit:10,direction:'backward',queryType:'range'}}]);
 await expect(lines.nth(0).locator('.dv-trace-log-time')).toHaveText('2026-11-07 09:42:13Z');await expect(lines.nth(0).locator('.dv-trace-log-value')).toHaveText('arch');await expect(lines.nth(0).locator('.dv-trace-log-id')).toHaveText(ID);
 await expect(lines.nth(1)).toContainText('This log line has no trace_id');await expect(lines.nth(1).getByRole('button')).toHaveCount(0);
 await info.attach('log-lookup-results',{body:await h.root.screenshot(),contentType:'image/png'});
 await lines.nth(0).getByRole('button',{name:'Load trace '+ID,exact:true}).click();
 await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);await expect(h.root.locator('.dv-trace-span')).toHaveCount(55);
 expect(h.calls.slice(1)).toEqual([{server:PROFILE.server,tool:'get_trace',args:{view_mode:'full',trace_id:ID,from:'-2h',environment_slug:'production',team_slug:'example-team'}}]);
 await expect(h.root.locator('.dv-trace-span[data-span-id="'+SPAN+'"]')).toHaveAttribute('aria-pressed','true');await expect(h.root.locator('.dv-trace-span[aria-pressed="true"]')).toHaveCount(1);
 await expect(h.root.locator('.dv-trace-focus-hint')).toHaveText(/^Trace focus · /);
 await info.attach('log-lookup-loaded-focused',{body:await h.root.screenshot(),contentType:'image/png'});
});

test('desktop without a Grafana connector the log lookup is disabled with a message and the rest of Load trace is unchanged',async({page,server},info)=>{
 const plain=await open(await page.context().newPage(),server,{lookups:false});await expect(plain.logs).toHaveCount(0);const expected=await formControls(plain.root);
 const h=await open(page,server,{grafana:false});
 await expect(h.logs.getByRole('status')).toContainText('Log lookups need a Grafana connector with query_loki_logs');
 await expect(h.logs.getByRole('combobox',{name:'Log lookup',exact:true})).toBeDisabled();await expect(h.logs.getByLabel('Camera model',{exact:true})).toBeDisabled();await expect(h.logs.getByRole('button',{name:'Find log lines',exact:true})).toBeDisabled();
 expect(await formControls(h.root)).toEqual(expected);
 await info.attach('log-lookup-no-grafana',{body:await h.root.screenshot(),contentType:'image/png'});
 await h.root.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await h.root.getByRole('button',{name:'Load trace',exact:true}).click();
 await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);expect(h.calls.map(c=>c.tool)).toEqual(['get_trace']);
});

test('desktop a log-line trace the provider did not keep says so and loads the next log line',async({page,server},info)=>{
 const MISSING='5ab0'.repeat(8),ns=ago=>(BigInt(Date.now()-ago)*1000000n).toString(),line=(ago,meta)=>({timestamp:ns(ago),line:'Handling camera stats message',labels:{env:'stg'},structuredMetadata:meta});
 const h=await open(page,server,{lines:{data:[line(600000,{cameraModel:'arch',trace_id:MISSING}),line(900000,{cameraModel:'arch'}),line(1200000,{cameraModel:'arch',trace_id:ID,span_id:SPAN})]}});
 await h.logs.getByLabel('Camera model',{exact:true}).fill('arch');await h.logs.getByRole('button',{name:'Find log lines',exact:true}).click();await expect(h.logs.locator('.dv-trace-log-row')).toHaveCount(3);
 await h.logs.getByRole('button',{name:'Load trace '+MISSING,exact:true}).click();
 const report=h.root.locator('.dv-trace-direct-report');await expect(report).toContainText('Trace not found. The provider may not have kept this trace (sampling). Try the next log line.');
 await expect(report).not.toContainText('longer lookback');await expect(h.root.locator('.dv-trace-time')).toHaveJSProperty('open',false);
 await info.attach('log-line-not-kept',{body:await h.root.screenshot(),contentType:'image/png'});
 await report.getByRole('button',{name:'Try the next log line',exact:true}).click();
 await expect(h.root.locator('.dv-trace-selected')).toHaveAttribute('data-trace-id',ID);await expect(h.root.locator('.dv-trace-span[data-span-id="'+SPAN+'"]')).toHaveAttribute('aria-pressed','true');
 expect(h.calls.filter(c=>c.tool==='get_trace').map(c=>c.args.trace_id)).toEqual([MISSING,ID]);
});

test('desktop Over time Find searches the selected day: today to now, then the whole previous day',async({page,server},info)=>{
 await page.setViewportSize({width:1500,height:1100});
 await writeFile(path.join(server.root,'log-day-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'log-day.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./log-day-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/log-day.html');await page.waitForFunction(()=>!!window.mount);
 const spec={page:{title:'Camera stats',tracking:{jira:{site:'https://jira.test'},telemetry:{grafana:{loki:'loki-$env'},environment:'stg',environments:{stg:{},prd:{}},lookups:{camera:{label:'Camera model',query:QUERY,values:['arch','wren']}},traceConnections:{company:PROFILE}}},
  sections:[{id:'main',diagram:{nodes:{consumer:{title:'Camera stats consumer',tickets:['CAM-1']}},rows:[['consumer']],panels:[PANEL]}}]}};
 // Setup only: the host's transport and a dated day list (two days ago to today) for the Jira history source.
 await page.evaluate(({spec,lines})=>{
  window.logCalls=[];
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{directTrace:{describe:async()=>null,call:async()=>null,logsConnector:async()=>'Grafana',queryLogs:async args=>{window.logCalls.push(args);return lines;}}}});
  const api=window.viewer.controller.liveStatus,pad=n=>String(n).padStart(2,'0'),key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()),now=new Date();
  const days=[2,1,0].map(back=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-back);return {key:key(d),label:key(d),short:key(d),states:{'CAM-1':{state:back?'todo':'active'}}};});
  api.apply({'CAM-1':{state:'active'}});api.setHistory({load:()=>({days})});
 },{spec,lines:LINES});
 const midnight=back=>page.evaluate(back=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()-back).toISOString();},back);
 const root=page.locator('#host');await root.getByRole('button',{name:'Over time',exact:true}).click();await root.getByRole('button',{name:'Trace',exact:true}).click();
 const logs=root.locator('.dv-trace-logs'),rows=logs.locator('.dv-trace-log-row'),calls=()=>page.evaluate(()=>window.logCalls);
 // Over time opens on today: the search runs from local midnight to now.
 await expect(logs.locator('.dv-trace-logs-window')).toHaveText(/^Loki · \d{4}-\d\d-\d\d 00:00–\d\d:\d\d local$/);
 await logs.getByLabel('Camera model',{exact:true}).fill('arch');const before=await page.evaluate(()=>Date.now());
 await logs.getByRole('button',{name:'Find log lines',exact:true}).click();await expect(rows).toHaveCount(2);
 let sent=await calls();expect(sent).toHaveLength(1);expect([sent[0].startRfc3339,sent[0].limit,sent[0].direction]).toEqual([await midnight(0),10,'backward']);
 const end=Date.parse(sent[0].endRfc3339);expect(end).toBeGreaterThanOrEqual(before);expect(end).toBeLessThanOrEqual(await page.evaluate(()=>Date.now()));
 await info.attach('log-search-over-time-today',{body:await root.screenshot(),contentType:'image/png'});
 // Previous day clears the results without a call; the typed value stays. Find then searches that whole day.
 await root.getByRole('button',{name:'Previous day',exact:true}).click();await expect(rows).toHaveCount(0);
 await expect(logs.getByLabel('Camera model',{exact:true})).toHaveValue('arch');expect(await calls()).toHaveLength(1);
 await expect(logs.locator('.dv-trace-logs-window')).toHaveText(/^Loki · \d{4}-\d\d-\d\d 00:00–24:00 local$/);
 await logs.getByRole('button',{name:'Find log lines',exact:true}).click();await expect(rows).toHaveCount(2);
 sent=await calls();expect(sent).toHaveLength(2);expect([sent[1].startRfc3339,sent[1].endRfc3339]).toEqual([await midnight(1),await midnight(0)]);
 await info.attach('log-search-over-time-previous-day',{body:await root.screenshot(),contentType:'image/png'});
});
