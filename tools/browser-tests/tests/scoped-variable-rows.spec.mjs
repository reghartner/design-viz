/* #1393 desktop Workbench → spec → viewer: a variable row on an imported node fills the provider's ${code}
   placeholder; the saved source makes the viewer send the filled query.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| V1 | On imported node fc::dcf, typing code / FULL into New node variable name / value and pressing Enter writes the consumer overlay's variables (one Undo step, provider untouched); the published page sends `code="FULL"` to Loki. | provider Loki signal `{app="dcf", code="${code}"}`; consumer importing it | overlay; Undo and Redo text; the recorded logql | a JSON textarea; writing the provider; a variable the viewer ignores |
Desktop only. */
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const BYCODE='sum(count_over_time({app="dcf", code="${code}"}[5m]))';
const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
const provider=spec('provider',{nodes:{dcf:{title:'DCF',telemetry:{kind:'service',signals:{sent:{loki:BYCODE}}}}},rows:[['dcf']],topologyExports:{core:{nodes:['dcf'],edges:[]}}});
const consumer=spec('consumer',{nodes:{local:{title:'Local',tickets:['LOC-1']}},rows:[['local']],edges:[],panels:[{id:'status',type:'live-status',title:'Status'}],
  topologyImports:[{spec:'provider',export:'core',as:'fc',position:{x:80,y:300}}]},{tracking:{telemetry:{grafana:{loki:'loki-uid'}}}});

test('V1 desktop: a variable row on an imported node makes the viewer send the filled query',async({page,server},info)=>{
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify({page:{title:'x',sections:[{diagram:{nodes:{x:{title:'X'}},rows:[['x']]}}]}}));await prepareEditorSurface(page);
  await page.evaluate(({provider,consumer})=>{window.varContext={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.varContext);},{provider,consumer});
  const source=page.locator('#src'),guide=page.locator('#guide');
  const overlay=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.topologyImports[0].nodeTracking?.dcf?.telemetry;
  await page.locator('#docview [data-dv-node="fc::dcf"]').first().click();await page.locator('#editor-tab-inspect').click();
  const original=await source.inputValue();
  const name=guide.getByLabel('New node variable name',{exact:true});await name.click();await page.keyboard.type('code');
  const value=guide.getByLabel('New node variable value',{exact:true});await value.click();await page.keyboard.type('FULL');await page.keyboard.press('Enter');
  await expect.poll(async()=>(await overlay())?.variables).toEqual({code:'FULL'});
  await expect(guide.getByLabel('Node variable 1 value',{exact:true})).toHaveValue('FULL');
  await page.screenshot({path:info.outputPath('scoped-variable-row.png')});
  const saved=await source.inputValue();
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(saved);
  expect(await page.evaluate(()=>window.varContext.specs[0])).toEqual(provider);

  // The saved source, published: the viewer sends the filled query.
  const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
  const board=JSON.parse(saved),resolved=JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(board,{version:1,id:'consumer',specs:[provider,board]})));
  const specPath=path.join(server.root,'scoped-variable-rows.spec.json'),out=path.join(server.root,'scoped-variable-rows.html');
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
  await page.goto(server.origin+'/scoped-variable-rows.html');
  await page.waitForFunction(()=>!!window.ctl);
  const metrics=page.locator('#docview').getByRole('switch',{name:'Metrics overlay',exact:true});
  await expect(metrics).toBeVisible();await metrics.click();
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.tool==='query_loki_logs').length)).toBeGreaterThan(0);
  const logql=[...new Set(await page.evaluate(()=>window.calls.filter(c=>c.tool==='query_loki_logs').map(c=>c.input.logql)))];
  expect(logql).toEqual(['sum(count_over_time({app="dcf", code="FULL"}[5m]))']);
});
