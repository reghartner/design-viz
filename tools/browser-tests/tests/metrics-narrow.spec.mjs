/* #1348 (epic #1344 PR 2): a board narrows a Honeycomb signal it imports. The published page
   sends the provider's query with the board's filters appended (calculations kept), and a signal
   whose provider asks for a narrowing the board did not write is never queried and says why.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| B1 | The imported signal's run_query has the provider filter then the board's, and the provider calculations. | provider with received (needsNarrow event_code) and dropped (needsNarrow event_code); consumer narrows received only | the recorded query_spec | a narrowing that replaces the query or is never sent |
| B2 | The unmet signal is never queried; the Metrics status names it with its reason. | same | no run_query for it; the status note | an unfiltered number shown for an unmet signal |
*/
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
const base=()=>({calculations:[{op:'COUNT'}],filters:[{column:'service.name',op:'=',value:'dcf'}]});
function narrowedPage(){
  const provider=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{
      received:{honeycomb:base(),unit:'events',needsNarrow:['event_code']},
      dropped:{honeycomb:{...base(),filters:[{column:'service.name',op:'=',value:'dcf-drops'}]},unit:'events',needsNarrow:['event_code']}}}}},
    rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
  const consumer=spec('consumer',{nodes:{local:{title:'Local',tickets:['LOC-1']}},rows:[['local']],panels:[{id:'status',type:'live-status',title:'Status'}],
    topologyImports:[{spec:'provider',export:'core',as:'fc',position:{x:80,y:300},nodeTracking:{dcf:{telemetry:{extends:true,signals:{
      received:{narrow:{honeycomb:{filters:[{column:'event_code',op:'=',value:'FULL_CHARGE'}]}}}}}}}}]},
    {tracking:{telemetry:{honeycomb:{environment:'prod',dataset:'events'}}}});
  const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
  return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
}

test('B1 B2 desktop: an imported Honeycomb signal is sent narrowed; an unmet one is never queried and says why',async({page,server})=>{
  const specPath=path.join(server.root,'narrow.spec.json'),out=path.join(server.root,'narrow.html');
  await writeFile(specPath,JSON.stringify(narrowedPage()));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),specPath,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
  await page.addInitScript(()=>{
    window.calls=[];
    window.flowviewLiveStatus={provider:async()=>({'LOC-1':{state:'done'}})};
    const schema={type:'object',properties:{environment_slug:{type:'string'},dataset_slug:{type:['null','string']},query_spec:{type:'string'}},required:['environment_slug','query_spec']};
    window.claude={use:async name=>name==='mcp'?{
      listTools:async()=>[{server:'Honeycomb',tools:[{name:'run_query',description:'Run a query',annotations:{readOnlyHint:true}}]}],
      describeTool:async(server,tool)=>({name:tool,inputSchema:schema}),
      callTool:async(server,tool,input)=>{
        window.calls.push({server,tool,input});
        const q=typeof input.query_spec==='string'?JSON.parse(input.query_spec):input.query_spec,end=Date.parse(q.to) || Date.now();
        return {structuredContent:{results:[{data:{COUNT:7}}],series:[{data:{time:new Date(end-1800000).toISOString(),COUNT:7}}],info:{granularity_seconds:1800}}};
      }}:name==='permissions'?{request:async names=>Object.fromEntries(names.map(n=>[n,'granted']))}:null};
    window.flowviewBooted=ctl=>{window.ctl=ctl;};
  });
  await page.setViewportSize({width:1600,height:1000});
  await page.goto(server.origin+'/narrow.html');
  await page.waitForFunction(()=>!!window.ctl);
  const root=page.locator('#docview'),metrics=root.getByRole('switch',{name:'Metrics overlay',exact:true});
  await expect(metrics).toBeVisible();await metrics.click();
  await expect.poll(()=>page.evaluate(()=>window.ctl.telemetry.snapshot().map['fc::dcf']?.signals.received?.value)).toBe(7);
  const queries=await page.evaluate(()=>window.calls.filter(c=>c.tool==='run_query').map(c=>typeof c.input.query_spec==='string'?JSON.parse(c.input.query_spec):c.input.query_spec));
  const received=queries.filter(q=>q.filters?.some(f=>f.value==='dcf'));
  expect(received.length).toBeGreaterThan(0);
  for(const q of received){
    expect(q.calculations).toEqual([{op:'COUNT'}]);
    expect(q.filters).toEqual([{column:'service.name',op:'=',value:'dcf'},{column:'event_code',op:'=',value:'FULL_CHARGE'}]);
  }
  expect(queries.some(q=>q.filters?.some(f=>f.value==='dcf-drops')),'the unmet signal is never queried').toBe(false);
  expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().map['fc::dcf']?.signals.dropped)).toBeUndefined();
  const note=await page.evaluate(()=>window.ctl.telemetry.snapshot().status.note || '');
  expect(note).toContain('fc::dcf dropped: The provider asks each board to narrow this signal by event_code, and nothing narrows it here, so it is not shown.');
});
