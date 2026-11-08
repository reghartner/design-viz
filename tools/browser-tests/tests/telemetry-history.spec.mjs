import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {mountCues,cueSpec,nestedSpec,importedDetailSpec,CUE_JIRA,PANEL} from '../helpers/telemetry-cards.mjs';
const T=Date.UTC(2026,9,21),DAY=86400000;
const metrics=root=>root.getByRole('switch',{name:'Metrics overlay',exact:true}),over=root=>root.getByRole('button',{name:'Over time',exact:true}),live=root=>root.getByRole('button',{name:'Live',exact:true}),slider=root=>root.getByRole('slider',{name:'Day',exact:true});
async function select(root,index){const input=slider(root);await input.focus();await input.press('Home');for(let i=0;i<index;i++)await input.press('ArrowRight');await expect(input).toHaveValue(String(index));}
async function layout(root,count){
 await expect(root.locator('.dv-metrics-card')).toHaveCount(count);
 const result=await root.evaluate(host=>{const scope=host.shadowRoot || host,cards=[...scope.querySelectorAll('.dv-metrics-card')],bad=[];
  const rect=el=>el.getBoundingClientRect(),hit=(a,b)=>a.width>0&&a.height>0&&b.width>0&&b.height>0&&a.right>b.left+.5&&a.left<b.right-.5&&a.bottom>b.top+.5&&a.top<b.bottom-.5;
  for(const card of cards){const box=rect(card.querySelector('.dv-metrics-card-box'));
   for(const control of card.closest('svg').querySelectorAll('.node .card,.dv-jira-cue,.coin,.comm-break,.dv-metrics-card-box')){
    if(card.contains(control)||getComputedStyle(control).visibility==='hidden'||getComputedStyle(control).display==='none'||control.closest('.view-step-hidden,.dv-fragment-hidden,.comm-hidden,.dv-live-comm-suppressed'))continue;
    if(hit(box,rect(control)))bad.push([card.dataset.metricsCard,control.getAttribute('class')]);
   }
  }
  return {count:cards.length,bad};
 });expect(result.count).toBe(count);expect(result.bad).toEqual([]);
}
async function setup(page,server,{nested=false,detail=false,disabled=false,pending=false,unsupported=false}={}){
 await mountCues(page,server);
 const spec=detail?{page:{title:'History detail',tracking:{telemetry:{enabled:!disabled}},sections:[{id:'main',diagram:{nodes:{parent:{title:'Imported service',tickets:['ROOT-1'],detail:{spec:'approved-detail',revision:'r1',section:'selected'}}},rows:[['parent']],panels:[PANEL]}}]}}:nested?nestedSpec():cueSpec();
 if(nested)spec.page.sections[0].diagram.edges[0].tickets=['NEST-1'];
 spec.page.tracking??={};spec.page.tracking.telemetry={enabled:!disabled};
 await page.evaluate(({spec,detailSpec,jira,T,DAY,pending,unsupported})=>{
  window.viewer.destroy();window.calls={live:0,history:[],jira:0,aborts:0,details:0};window.releases=[];
  window.liveValue=900;window.historyDays=[0,1,2].map(i=>({key:new Date(T+(i-1)*DAY).toISOString().slice(0,10),at:new Date(T+i*DAY).toISOString(),label:'Day '+(i+1),short:'Day '+(i+1),states:Object.fromEntries(Object.keys(jira).map(key=>[key,{state:i===1?'active':'done'}]))}));
  const provider=async bindings=>{window.calls.live++;return Object.fromEntries(bindings.map(b=>[b.id,{signals:Object.fromEntries(Object.keys(b.signals).map(name=>[name,{value:name==='errors'?0:window.liveValue}]))}]));};
  const history=(bindings,range,signal)=>{window.calls.history.push({bindings:structuredClone(bindings),range});signal.addEventListener('abort',()=>window.calls.aborts++);
   const map=Object.fromEntries(bindings.map(b=>[b.id,{signals:Object.fromEntries(Object.keys(b.signals).map(name=>[name,{series:[[T,0],[T+2*DAY,name==='errors'?0:50]]}]))}]));
   return pending?new Promise(r=>window.releases.push(()=>r(map))):Promise.resolve(map);
  };
  window.viewer=window.mount(document.querySelector('#host'),spec,{loadDetail:async()=>{window.calls.details++;return structuredClone(detailSpec);},telemetry:{provider,...(!unsupported?{history}:{})}});
  window.viewer.controller.liveStatus.apply(jira);
  window.viewer.controller.liveStatus.setHistory({load:()=>{window.calls.jira++;return {days:window.historyDays,index:2};}});
 },{spec,detailSpec:importedDetailSpec(),jira:{...CUE_JIRA,'ROOT-1':{state:'done'},'IMP-3':{state:'done'},'NEST-1':{state:'done'}},T,DAY,pending,unsupported});
 const root=page.locator('#host');if(detail){await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.locator('[data-dv-detail-preview]:visible')).toHaveCount(1);expect(await page.evaluate(()=>window.calls.details)).toBe(1);return root.locator('[data-dv-detail-preview]:visible');}return root;
}

test('tandem native: Metrics off incurs Jira only; on within history, keyboard days, gaps, held refresh and cache',async({page,server})=>{
 const root=await setup(page,server);await expect(metrics(root)).toHaveAttribute('aria-checked','false');expect(await page.evaluate(()=>window.calls.history.length)).toBe(0);
 await over(root).click();await expect(slider(root)).toBeVisible();expect(await page.evaluate(()=>window.calls.history.length)).toBe(0);
 await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(3);await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('50');
 const records=await page.evaluate(()=>window.calls.history);expect(records).toHaveLength(1);expect(records[0].bindings.map(b=>b.id)).toEqual(['ingest','shared::api','ingest->app','app->push','shared::api->shared::store']);expect(records[0].range).toEqual({from:new Date(T).toISOString(),to:new Date(T+2*DAY).toISOString(),endpoints:[0,1,2].map(i=>({key:new Date(T+(i-1)*DAY).toISOString().slice(0,10),at:new Date(T+i*DAY).toISOString()}))});
 await select(root,0);await expect(root.locator('[data-metrics-card="ingest->app"]')).toHaveAttribute('data-verdict','done-unproven');await expect(root.locator('[data-metrics-card="shared::api->shared::store"]')).toHaveAttribute('data-verdict','done-unproven');
 await expect(root.locator('g.node[data-dv-node="shared::api"] .dv-metrics-seal')).toHaveAttribute('data-seal','unproven');
 await select(root,1);await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('unobserved');await expect(root.locator('g.node[data-dv-node="shared::api"]')).toHaveClass(/dv-live-active/);
 await page.evaluate(()=>{window.liveValue=1234;window.viewer.controller.telemetry.apply({'shared::api':{signals:{rate:{value:4321}}}});window.viewer.controller.liveStatus.apply({'IMP-1':{state:'blocked'}});});
 await expect(root.locator('g.node[data-dv-node="shared::api"]')).toHaveAttribute('data-metrics-state','unobserved');await expect(root.locator('g.node[data-dv-node="shared::api"]')).toHaveClass(/dv-live-active/);
 await live(root).click();await expect(root.locator('g.node[data-dv-node="shared::api"]')).toHaveClass(/dv-live-blocked/);await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('1,234');
 await over(root).click();await expect(slider(root)).toBeVisible();await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('50');expect(await page.evaluate(()=>window.calls.history.length)).toBe(1);
 await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(0);await expect(over(root)).toHaveAttribute('aria-pressed','true');await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(3);expect(await page.evaluate(()=>window.calls.history.length)).toBe(1);
 await expect(root.locator('.dv-live-over-time-row datalist,.dv-live-over-time-marker')).toHaveCount(0);await layout(root,3);
 await live(root).click();await page.evaluate(({T,DAY})=>window.historyDays.push({...window.historyDays[2],key:new Date(T+2*DAY).toISOString().slice(0,10),at:new Date(T+3*DAY).toISOString(),label:'New day'}),{T,DAY});await over(root).click();await expect.poll(()=>page.evaluate(()=>window.calls.history.length)).toBe(2);expect(await page.evaluate(()=>window.calls.history[1].range)).toEqual({from:new Date(T+3*DAY).toISOString(),to:new Date(T+3*DAY).toISOString(),endpoints:[{key:new Date(T+2*DAY).toISOString().slice(0,10),at:new Date(T+3*DAY).toISOString()}]});
 const boxes=await root.evaluate(host=>{const scope=host.shadowRoot;return [...scope.querySelectorAll('.dv-metrics-card-box')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});});expect(boxes).toHaveLength(3);expect(boxes.every(b=>b.w>0&&b.h>0)).toBe(true);
});

test('#1082 Over time shows the selected day large, TODAY on a day dated today, and the slider and day buttons update it',async({page,server})=>{
 const root=await setup(page,server);
 // Date the three days two days ago, yesterday and today in the page's own time zone.
 await page.evaluate(()=>{const now=new Date();window.historyDays.forEach((day,i)=>{day.key=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+i-2)).toISOString().slice(0,10);});});
 const row=root.locator('.dv-live-over-time-row'),day=row.locator('.dv-live-over-time-day'),date=row.locator('.dv-live-over-time-date'),next=root.getByRole('button',{name:'Next day',exact:true});
 await over(root).click();await expect(slider(root)).toHaveValue('2');await expect(day).toHaveText('TODAY');await expect(date).toHaveText('Day 3');
 const size=locator=>locator.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),note=await size(row.locator('.dv-live-over-time-note'));
 expect(await size(day),'larger than the epic key heading (20px)').toBeGreaterThanOrEqual(28);expect(await size(day)).toBeGreaterThan(await size(date));expect(await size(date)).toBeGreaterThanOrEqual(16);expect(await size(date)).toBeGreaterThan(note);
 await select(root,0);await expect(day).toHaveText('Day 1');await expect(date).toBeHidden();
 await next.click();await expect(slider(root)).toHaveValue('1');await expect(day).toHaveText('Day 2');
 await next.click();await expect(day).toHaveText('TODAY');
 await live(root).click();await expect(row).toHaveCount(0);
});
test('pending history cancels on Metrics off and cannot resurrect; returning Live remains usable',async({page,server})=>{
 const root=await setup(page,server,{pending:true});await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(3);await over(root).click();await expect(slider(root)).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.calls.history.length)).toBe(1);
 await select(root,0);await metrics(root).click();expect(await page.evaluate(()=>window.calls.aborts)).toBe(1);await page.evaluate(()=>window.releases.splice(0).forEach(fn=>fn()));await expect(root.locator('.dv-metrics-card')).toHaveCount(0);
 await metrics(root).click();await expect.poll(()=>page.evaluate(()=>window.calls.history.length)).toBe(2);await live(root).click();await expect(slider(root)).toBeHidden();await page.evaluate(()=>window.releases.splice(0).forEach(fn=>fn()));await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('900');
});
for(const detail of [false,true])test('historical '+(detail?'real loader-selected imported detail':'nested import')+' carriers follow selected day',async({page,server})=>{
 const root=await setup(page,server,{detail,nested:!detail});await metrics(root).click();await over(root).click();await expect(slider(root)).toBeVisible();const count=detail?2:1;await layout(root,count);
 await select(root,0);await expect(root.locator('.dv-metrics-card').first()).toContainText('0 req/h');if(detail){await expect(root.locator('g.node[data-dv-node="shared::api"]')).toHaveAttribute('data-metrics-verdict','done-unproven');await expect(root.locator('.dv-metrics-card').first()).toHaveAttribute('data-verdict','done-unproven');}
 await select(root,1);await expect(root.locator('.dv-metrics-card').first()).toContainText('unobserved');await select(root,2);await expect(root.locator('.dv-metrics-card').first()).toContainText('50 req/h');
 const ids=await page.evaluate(()=>window.calls.history[0].bindings.map(b=>b.id));expect(ids).toContain(detail?'shared::api->shared::store':'outer::inner::a->outer::inner::b');
 await live(root).click();await expect(root.locator('.dv-metrics-card').first()).toContainText('900 req/h');
});
for(const detail of [false,true])test('page disabled suppresses historical telemetry on '+(detail?'loaded details':'root')+' and leaves Jira controls usable',async({page,server})=>{
 const root=await setup(page,server,{disabled:true,detail});await expect(metrics(root)).toBeHidden();await over(root).click();await expect(slider(root)).toBeVisible();await select(root,0);await live(root).click();await expect(slider(root)).toBeHidden();expect(await page.evaluate(()=>[window.calls.live,window.calls.history.length])).toEqual([0,0]);await expect(root.locator('.dv-metrics-card')).toHaveCount(0);
});
test('live-only telemetry is honestly unobserved in Over time while Jira remains usable',async({page,server})=>{
 const root=await setup(page,server,{unsupported:true});await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(3);await over(root).click();await expect(slider(root)).toBeVisible();await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('unobserved');await expect(root.locator('.dv-live-metrics-connection')).toContainText('Historical metrics unavailable');await live(root).click();await expect(root.locator('[data-metrics-card="ingest->app"]')).toContainText('900');
});
test('embedded demo: real slider Day 9 push UNPROVEN, Day 12 event DEGRADED, Live restores its day without network',async({page,server})=>{
 const out=path.join(server.root,'history-demo.html');execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,'examples/live-status/live-status.spec.json'),path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/history-demo.html#live=demo');const root=page.locator('#docview');
 await metrics(root).click();await over(root).click();await expect(slider(root)).toHaveValue('0');await select(root,8);await expect(root.locator('[data-metrics-card="notify->app"]')).toHaveAttribute('data-verdict','done-unproven');await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveClass(/dv-live-done/);
 await select(root,11);await expect(root.locator('[data-metrics-card="mcu->ingest"]')).toHaveAttribute('data-verdict','done-degraded');await expect(root.locator('g.node[data-dv-node="ingest"] .dv-metrics-seal')).toHaveAttribute('data-seal','degraded');
 await expect(root.locator('.dv-metrics-card')).toHaveCount(5);await expect(root.locator('[data-metrics-card="mcu->ingest"]')).toContainText('24h window');await live(root).click();await expect(root.locator('.dv-live-note')).toContainText('Day 1');await expect(root.locator('path.edge[data-dv-edge="4"]')).toHaveClass(/dv-live-todo/);await expect(root.locator('[data-metrics-card="mcu->ingest"]')).toContainText('unobserved');
});

for(const mode of ['jira','grafana','both','neither','disabled'])test('MCP capability matrix '+mode+' keeps controls independent and click-only',async({page,server})=>{
 const spec={page:{title:'Tandem tools',tracking:{jira:{site:'https://jira.test'},telemetry:{enabled:mode!=='disabled',grafana:{prometheus:'prom-main'}}},sections:[{diagram:{nodes:{a:{title:'A',tickets:['AA-1'],telemetry:{kind:'service',signals:{rate:{grafana:'authored[24h]'}},proof:{rate:{min:1}}}}},rows:[['a']],panels:[PANEL]}}]}};
 await page.addInitScript(({mode,T,DAY})=>{
  window.calls=[];window.flowviewBooted=ctl=>window.ctl=ctl;const jira=['jira','both','disabled'].includes(mode),grafana=['grafana','both','disabled'].includes(mode);
  const issue={key:'AA-1',fields:{created:new Date(T-DAY).toISOString(),summary:'Work',status:{id:'3',name:'Done',statusCategory:{key:'done'}},updated:new Date(T+DAY).toISOString()},changelog:{histories:[{created:new Date(T+DAY).toISOString(),items:[{field:'status',from:'3',fromString:'Done',to:'3',toString:'Done'}]}],total:1}};
  const result=input=>({payload:{issues:{nodes:input.jql?.includes('Flagged')?[]:[issue]}}});
  const mcp={listTools:async()=>[...(jira?[{server:'Atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql','getJiraIssue']}]:[]),...(grafana?[{server:'Grafana',tools:['query_prometheus','query_loki_logs','get_annotations','generate_deeplink','search_tempo_traces']}]:[])],
   callTool:async(server,tool,input)=>{window.calls.push({server,tool,input});if(tool==='getAccessibleAtlassianResources')return {payload:[{id:'cloud',url:'https://jira.test'}]};if(tool==='getJiraIssue')return {payload:issue};if(tool==='query_prometheus')return {payload:{data:[{values:!input.startTime.startsWith('now')?[[Date.parse(input.endTime)/1000,'0']]:[[T/1000,'100']]}]}};return {payload:[]};},
   watchTool(server,tool,input,handler){queueMicrotask(()=>handler({type:'data',result:result(input)}));return ()=>{};}};
  window.claude={use:async name=>name==='mcp'?mcp:null};
 },{mode,T,DAY});
 const file=path.join(server.root,'matrix.json'),out=path.join(server.root,'matrix.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/matrix.html');await page.waitForFunction(()=>!!window.ctl);const root=page.locator('#docview');
 const jira=['jira','both','disabled'].includes(mode),grafana=['grafana','both'].includes(mode);
 if(grafana){await expect(metrics(root)).toBeVisible();await expect(metrics(root)).toHaveAttribute('aria-checked','false');}else await expect(metrics(root)).toBeHidden();
 if(jira){await expect(over(root)).toBeVisible();await expect(live(root)).toBeVisible();}else await expect(over(root)).toBeHidden();
 expect(await page.evaluate(()=>window.calls.filter(c=>c.tool==='query_prometheus'||c.tool==='getJiraIssue'))).toEqual([]);
 if(grafana){await metrics(root).click();await expect(root.locator('g.node[data-dv-node="a"]')).toHaveAttribute('data-metrics-state','flowing');}
 if(jira){await over(root).click();await expect(slider(root)).toBeVisible();await select(root,0);if(grafana)await expect(root.locator('g.node[data-dv-node="a"]')).toHaveAttribute('data-metrics-state','silent');await live(root).click();}
 const calls=await page.evaluate(()=>window.calls);expect(calls.filter(c=>c.tool==='query_prometheus'&&!c.input.startTime.startsWith('now'))).toHaveLength(mode==='both'?1:0);expect(calls.filter(c=>c.tool==='getJiraIssue')).toHaveLength(jira?1:0);
});

async function lateDetailSetup(page,server,{pending=false,disabled='',defer=true}={}){
 await mountCues(page,server);
 const spec=nestedSpec(),rootDiagram=spec.page.sections[0].diagram,detail=importedDetailSpec(),d=detail.page.sections.find(s=>s.id==='selected').diagram;
 const nested=JSON.parse(JSON.stringify(nestedSpec().page.sections[0].diagram).replaceAll('outer::','detail::'));
 rootDiagram.nodes['outer::inner::a']={...rootDiagram.nodes['outer::inner::a'],title:'Imported service',tickets:['ROOT-1'],detail:{spec:'late-detail',revision:'r1',section:'selected'},telemetry:structuredClone(d.nodes['shared::api'].telemetry)};
 rootDiagram.edges[0].tickets=['ROOT-1'];spec.page.tracking={jira:{site:'https://jira.test'},telemetry:{enabled:disabled!=='page'}};
 Object.assign(d.nodes,nested.nodes,{local:{title:'Local worker',tickets:['LOCAL-1'],telemetry:structuredClone(d.nodes['shared::api'].telemetry)}});
 d.nodes['detail::inner::a'].tickets=['NEST-1'];d.nodes['detail::inner::a'].telemetry=structuredClone(d.nodes['shared::api'].telemetry);
 d.edges.push({...structuredClone(d.edges[0]),from:'local',to:'shared::store',tickets:['LOCAL-1'],label:'Local delivery'},...nested.edges.map(edge=>({...edge,tickets:['NEST-1']})));
 d.floats.push({id:'local',side:'below',x:500,y:350},...nested.floats.map(f=>({...f,y:f.y+650})));
 await page.evaluate(({spec,detail,T,DAY,pending,disabled,defer})=>{
  window.viewer.destroy();window.late={calls:[],live:[],loads:[],releases:[],loadReleases:[]};
  const tickets=['ROOT-1','LOCAL-1','NEST-1','IMP-1','IMP-2','IMP-3'];
  const days=[0,1,2].map(i=>({key:new Date(T+(i-1)*DAY).toISOString().slice(0,10),at:new Date(T+i*DAY).toISOString(),label:'Day '+i,short:'Day '+i,states:Object.fromEntries(tickets.map(key=>[key,{state:i===1?'active':'done'}]))}));
  const telemetry={provider:async bindings=>{window.late.live.push(structuredClone(bindings));return Object.fromEntries(bindings.map(b=>[b.id,{signals:Object.fromEntries(Object.keys(b.signals).map(n=>[n,{value:n==='errors'?0:900}]))}]));},
   history:(bindings,range,signal)=>{window.late.calls.push({bindings:structuredClone(bindings),range:structuredClone(range),aborted:false});const record=window.late.calls.at(-1);signal.addEventListener('abort',()=>record.aborted=true);
    const value=n=>Object.fromEntries(bindings.map(b=>[b.id,{signals:Object.fromEntries(Object.keys(b.signals).map(name=>[name,{series:[[T,name==='errors'?0:n],[T+2*DAY,name==='errors'?0:50]]}]))}]));
    if(!pending)return Promise.resolve(value(0));return new Promise(resolve=>window.late.releases.push(n=>resolve(value(n))));
   }};
  window.viewer=window.mount(document.querySelector('#host'),spec,{loadDetail:(ref,signal)=>{const record={ref,aborted:false};window.late.loads.push(record);signal.addEventListener('abort',()=>record.aborted=true);return defer?new Promise(resolve=>window.late.loadReleases.push(()=>resolve(structuredClone(detail)))):Promise.resolve(structuredClone(detail));},telemetry:disabled==='host'?false:telemetry});
  window.viewer.controller.liveStatus.apply(Object.fromEntries(tickets.map(key=>[key,{state:'done'}])));window.viewer.controller.liveStatus.setHistory({load:()=>({days,index:2})});
 },{spec,detail,T,DAY,pending,disabled,defer});
 return page.locator('#host');
}
async function exploreLate(page,root){
 await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();
 await expect(root.getByText('Loading detail diagram…', {exact:true})).toBeVisible();
 await page.evaluate(()=>window.late.loadReleases.shift()());
 const scope=root.locator('[data-dv-detail-preview]:visible');await expect(scope).toHaveCount(1);await expect(scope.locator('.sec-h')).toHaveText('Selected imported detail');return scope;
}
test('late detail joins the selected historical day through real nested-import Explore and async loader',async({page,server})=>{
 const root=await lateDetailSetup(page,server);await metrics(root).click();await expect(root.locator('.dv-metrics-card')).toHaveCount(1);await over(root).click();await select(root,0);
 await expect(root.locator('.dv-metrics-card')).toHaveAttribute('data-verdict','done-unproven');const scope=await exploreLate(page,root);
 await expect(scope.locator('.dv-metrics-card')).toHaveCount(4);await expect(scope.locator('[data-metrics-card="local->shared::store"]')).toContainText('0 req/h');
 for(const id of ['local','shared::api','detail::inner::a']){
  await expect(scope.locator('g.node[data-dv-node="'+id+'"]')).toHaveAttribute('data-metrics-verdict','done-unproven');
  await expect(scope.locator('[data-proof-carrier="'+id+'"]')).toHaveAttribute('data-verdict','done-unproven');
  await expect(scope.locator('[data-proof-carrier="'+id+'"]')).toContainText('rate: 0 req/h');
 }
 const calls=await page.evaluate(()=>window.late.calls);expect(calls).toHaveLength(2);expect(calls[1].bindings.map(b=>b.id)).toEqual(expect.arrayContaining(['local','shared::api','detail::inner::a','local->shared::store','shared::api->shared::store','detail::inner::a->detail::inner::b']));expect(calls[1].bindings.map(b=>b.id)).not.toContain('outer::inner::a');expect(calls[1].range).toEqual(calls[0].range);
 await expect(slider(scope)).toHaveValue('0');await select(scope,1);await expect(scope.locator('[data-metrics-card="local->shared::store"]')).toContainText('unobserved');await expect(scope.locator('g.node[data-dv-node="local"]')).toHaveClass(/dv-live-active/);
 await select(scope,2);await expect(scope.locator('[data-metrics-card="local->shared::store"]')).toContainText('50 req/h');await layout(scope,4);expect(await page.evaluate(()=>window.late.calls.length)).toBe(2);
 await live(scope).click();await expect(slider(scope)).toBeHidden();await expect(scope.locator('[data-metrics-card="local->shared::store"]')).toContainText('900 req/h');await expect(scope.locator('g.node[data-dv-node="local"]')).toHaveAttribute('data-metrics-verdict','proven');
});
test('late detail while root history is pending keeps peers, cancels on Back and Metrics off, drops late answers',async({page,server})=>{
 const root=await lateDetailSetup(page,server,{pending:true});await metrics(root).click();await over(root).click();await select(root,0);await expect.poll(()=>page.evaluate(()=>window.late.calls.length)).toBe(1);
 let scope=await exploreLate(page,root);await expect.poll(()=>page.evaluate(()=>window.late.calls.length)).toBe(2);expect(await page.evaluate(()=>window.late.calls[0].aborted)).toBe(false);
 await page.evaluate(()=>window.late.releases[0](0));await expect(scope.locator('.dv-metrics-card')).toHaveCount(4);await expect(scope.locator('[data-metrics-card="local->shared::store"]')).toContainText('unobserved');
 await scope.locator('.detail-breadcrumb button').first().click();await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);expect(await page.evaluate(()=>window.late.calls[1].aborted)).toBe(true);
 await page.evaluate(()=>window.late.releases[1](999));await expect(root.locator('.dv-metrics-card')).toHaveCount(1);await expect(root.locator('.dv-metrics-card')).toContainText('0 req/h');expect(await page.evaluate(()=>window.viewer.controller.telemetry.snapshot().map.local)).toBeUndefined();
 scope=await exploreLate(page,root);await expect.poll(()=>page.evaluate(()=>window.late.calls.length)).toBe(3);expect(await page.evaluate(()=>window.late.calls[2].bindings.some(b=>b.id==='outer::inner::a'))).toBe(false);
 await metrics(scope).click();expect(await page.evaluate(()=>window.late.calls[2].aborted)).toBe(true);await page.evaluate(()=>window.late.releases[2](999));await expect(scope.locator('.dv-metrics-card')).toHaveCount(0);
 await metrics(scope).click();await expect.poll(()=>page.evaluate(()=>window.late.calls.length)).toBe(4);await live(scope).click();expect(await page.evaluate(()=>window.late.calls[3].aborted)).toBe(true);await page.evaluate(()=>window.late.releases[3](999));await expect(scope.locator('[data-metrics-card="local->shared::store"]')).toContainText('900 req/h');
});
for(const disabled of ['page','host'])test('late detail '+disabled+' disable leaves Jira history usable with zero telemetry calls',async({page,server})=>{
 const root=await lateDetailSetup(page,server,{disabled});await expect(metrics(root)).toBeHidden();await over(root).click();await select(root,0);const scope=await exploreLate(page,root);await expect(metrics(scope)).toBeHidden();await expect(scope.locator('.dv-metrics-card')).toHaveCount(0);await expect(scope.locator('g.node[data-dv-node="local"]')).toHaveClass(/dv-live-done/);await select(scope,1);await expect(scope.locator('g.node[data-dv-node="local"]')).toHaveClass(/dv-live-active/);await live(scope).click();expect(await page.evaluate(()=>[window.late.calls.length,window.late.live.length])).toEqual([0,0]);
});
test('destroy during late async detail load prevents registration and history queries after resolution',async({page,server})=>{
 const root=await lateDetailSetup(page,server);await metrics(root).click();await over(root).click();await select(root,0);await expect.poll(()=>page.evaluate(()=>window.late.calls.length)).toBe(1);await root.getByRole('button',{name:'Explore Imported service',exact:true}).click();await expect(root.getByText('Loading detail diagram…',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();expect(await page.evaluate(()=>window.late.loads[0].aborted)).toBe(true);await page.evaluate(()=>window.late.loadReleases.shift()());expect(await page.evaluate(()=>window.late.calls.length)).toBe(1);await expect(root).toBeEmpty();
});

test.describe('actual Jira/Grafana selected local days across DST',()=>{
 test.use({timezoneId:'America/New_York'});
 for(const fixture of [
  {name:'spring 23h',created:'2026-03-07T12:00:00-05:00',changed:'2026-03-08T23:30:00-04:00',finished:'2026-03-10T12:00:00-04:00',endpoints:['2026-03-08T05:00:00.000Z','2026-03-09T04:00:00.000Z','2026-03-10T04:00:00.000Z','2026-03-11T04:00:00.000Z']},
  {name:'fall 25h',created:'2026-10-31T12:00:00-04:00',changed:'2026-11-01T23:30:00-05:00',finished:'2026-11-03T12:00:00-05:00',endpoints:['2026-11-01T04:00:00.000Z','2026-11-02T05:00:00.000Z','2026-11-03T05:00:00.000Z','2026-11-04T05:00:00.000Z']}
 ])test(fixture.name+' Metrics off, real slider, selected local-day windows and live restoration',async({page,server})=>{
  const spec={page:{title:'Local-day history',tracking:{jira:{site:'https://jira.test'},telemetry:{grafana:{prometheus:'prom-main'}}},sections:[{diagram:{nodes:{a:{title:'A',tickets:['AA-1'],telemetry:{kind:'service',signals:{rate:{grafana:'UNCHANGED[24h]'}},proof:{rate:{min:1}}}},b:{title:'B',tickets:['BB-1']}},rows:[['a','b']],panels:[PANEL]}}]}};
  await page.addInitScript(fixture=>{
   window.dstCalls=[];window.flowviewBooted=ctl=>window.ctl=ctl;
   const issue=key=>({key,fields:{created:fixture.created,summary:'Work '+key,status:{id:'3',name:'Done',statusCategory:{key:'done'}},updated:fixture.finished},changelog:{total:1,histories:[{created:key==='AA-1'?fixture.changed:fixture.finished,items:[{field:'status',from:'1',fromString:'To Do',to:'3',toString:'Done'}]}]}});
   const mcp={listTools:async()=>[{server:'Atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql','getJiraIssue']},{server:'Grafana',tools:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']}],
    callTool:async(server,tool,input)=>{window.dstCalls.push({server,tool,input});if(tool==='getAccessibleAtlassianResources')return {payload:[{id:'cloud',url:'https://jira.test'}]};if(tool==='getJiraIssue')return {payload:issue(input.issueIdOrKey)};
     if(tool==='searchJiraIssuesUsingJql')return {payload:{issues:{nodes:[{fields:{status:{id:'1',name:'To Do',statusCategory:{key:'new'}}}}]}}};
     if(tool==='query_prometheus'){
      const points=[];if(!input.startTime.startsWith('now'))points.push([Date.parse(input.endTime)/1000,String(fixture.endpoints.indexOf(input.endTime)===1?0:50)]);else points.push([Date.now()/1000,'900']);
      return {payload:{data:[{values:points}]}};
     }return {payload:[]};},
    watchTool(server,tool,input,handler){queueMicrotask(()=>handler({type:'data',result:{payload:{issues:{nodes:input.jql?.includes('Flagged')?[]:[issue('AA-1'),issue('BB-1')]}}}}));return ()=>{};}};
   window.claude={use:async name=>name==='mcp'?mcp:null};
  },fixture);
  const file=path.join(server.root,'dst.json'),out=path.join(server.root,'dst.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/dst.html');const root=page.locator('#docview');
  await expect(metrics(root)).toHaveAttribute('aria-checked','false');await over(root).click();await expect(slider(root)).toHaveAttribute('max','3');await select(root,1);expect(await page.evaluate(()=>window.dstCalls.filter(c=>c.tool==='query_prometheus'))).toEqual([]);
  const node=root.locator('g.node[data-dv-node="a"]');await expect(node).toHaveClass(/dv-live-done/);await metrics(root).click();await expect(node).toHaveAttribute('data-metrics-verdict','done-unproven');
  const calls=await page.evaluate(()=>window.dstCalls.filter(c=>c.tool==='query_prometheus'));expect(calls.map(c=>c.input)).toEqual([{datasourceUid:'prom-main',expr:'UNCHANGED[24h]',startTime:new Date(Date.parse(fixture.endpoints[1])-DAY).toISOString(),endTime:fixture.endpoints[1],queryType:'range',stepSeconds:360}]);
  await select(root,0);await expect(node).toHaveClass(/dv-live-todo/);await expect(node).toHaveAttribute('data-metrics-state','flowing');await select(root,1);await expect(node).toHaveClass(/dv-live-done/);await expect(node).toHaveAttribute('data-metrics-state','silent');expect(await page.evaluate(()=>window.dstCalls.filter(c=>c.tool==='query_prometheus').length)).toBe(2);
  await live(root).click();await expect(slider(root)).toBeHidden();await expect(node).toHaveAttribute('data-metrics-verdict','proven');
 });
});
