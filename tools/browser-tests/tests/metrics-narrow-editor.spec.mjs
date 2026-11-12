/* #1363 (epic #1344 PR 5) desktop Workbench → spec → viewer: a board narrows a signal it imports
   in Inspect → Metrics; the saved source makes the viewer send the narrowed query.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| W1 | Inspect shows the viewer's Not shown reason for an unmet needsNarrow and the inherited fragment read-only; Add narrowing stores only the board's fragment (one Undo step) and shows the query sent; the published page sends that query to Loki. | provider Loki signal with needsNarrow code and a provider `| json`; consumer importing it | the reason note; the consumer overlay; Undo; the recorded logql | an editor that stores the merged list, shows no reason, or a viewer that sends the unnarrowed query |
*/
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect,paste,prepareEditorSurface,openMetricsFold} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const LOKI='sum(count_over_time({app="dcf"}[5m]))';
const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
const provider=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{sent:{loki:LOKI,needsNarrow:['code'],narrow:{loki:'| json'}}}}}},
  rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
const consumer=spec('consumer',{nodes:{local:{title:'Local',tickets:['LOC-1']}},rows:[['local']],edges:[],panels:[{id:'status',type:'live-status',title:'Status'}],
  topologyImports:[{spec:'provider',export:'core',as:'fc',position:{x:80,y:300}}]},{tracking:{telemetry:{grafana:{loki:'loki-uid'}}}});

test('W1 desktop: narrowing an imported signal in Inspect makes the viewer send the narrowed query',async({page,server})=>{
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify({page:{title:'x',sections:[{diagram:{nodes:{x:{title:'X'}},rows:[['x']]}}]}}));await prepareEditorSurface(page);
  await page.evaluate(({provider,consumer})=>{window.narrowContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.narrowContext);},{provider,consumer});
  const source=page.locator('#src'),guide=page.locator('#guide');
  const overlay=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.topologyImports[0].nodeTracking?.dcf?.telemetry;
  await page.locator('#docview [data-dv-node="fc::dcf"]').first().click();await page.locator('#editor-tab-inspect').click();
  const fold=await openMetricsFold(guide,'Signal sent · inherited');
  await expect(fold).toContainText('Not shown: The provider asks each board to narrow this signal by code, and nothing narrows it here, so it is not shown.');
  await expect(fold).toContainText('sent narrowing from the provider: | json');
  const original=await source.inputValue();
  await fold.getByLabel('sent add narrowing',{exact:true}).fill('| code="FULL"');
  await fold.getByRole('button',{name:'Add sent narrowing',exact:true}).click();
  await expect.poll(overlay).toEqual({extends:true,signals:{sent:{narrow:{loki:['| code="FULL"']}}}});
  const narrowed=await openMetricsFold(guide,'Signal sent · inherited');
  await expect(narrowed.getByLabel('sent query sent',{exact:true})).toHaveValue('sum(count_over_time({app="dcf"} | json | code="FULL" [5m]))');
  await expect(narrowed).not.toContainText('Not shown:');
  const saved=await source.inputValue();
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(saved);
  expect(await page.evaluate(()=>window.narrowContext.specs[0])).toEqual(provider);

  // The saved source, published: the viewer sends the narrowed query.
  const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
  const board=JSON.parse(saved),resolved=JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(board,{version:1,id:'consumer',specs:[provider,board]})));
  const specPath=path.join(server.root,'narrow-editor.spec.json'),out=path.join(server.root,'narrow-editor.html');
  await writeFile(specPath,JSON.stringify(resolved));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),specPath,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
  await page.addInitScript(()=>{
    window.calls=[];
    window.flowviewLiveStatus={provider:async()=>({'LOC-1':{state:'done'}})};
    window.claude={use:async name=>name==='mcp'?{
      listTools:async()=>[{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']}],
      callTool:async(server,tool,input)=>{window.calls.push({server,tool,input});if(tool==='query_loki_logs'){const at=Date.now()/1000;return {payload:{data:[{values:[[at-3600,'5'],[at,'7']]}]}};}return {payload:[]};}
    }:name==='permissions'?{request:async names=>Object.fromEntries(names.map(n=>[n,'granted']))}:null};
    window.flowviewBooted=ctl=>{window.ctl=ctl;};
  });
  await page.setViewportSize({width:1600,height:1000});
  await page.goto(server.origin+'/narrow-editor.html');
  await page.waitForFunction(()=>!!window.ctl);
  const metrics=page.locator('#docview').getByRole('switch',{name:'Metrics overlay',exact:true});
  await expect(metrics).toBeVisible();await metrics.click();
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.tool==='query_loki_logs').length)).toBeGreaterThan(0);
  const logql=[...new Set(await page.evaluate(()=>window.calls.filter(c=>c.tool==='query_loki_logs').map(c=>c.input.logql)))];
  expect(logql).toEqual(['sum(count_over_time({app="dcf"} | json | code="FULL" [5m]))']);
});
