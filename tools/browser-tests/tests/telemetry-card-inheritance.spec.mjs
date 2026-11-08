import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {mountImportedDetail,mountCues,nestedSpec} from '../helpers/telemetry-cards.mjs';

const ids=['a->b','b->c','shared::api->shared::store'];
function fixture(){
 const telemetry={kind:'call',signals:{rate:{grafana:'rate(delivery[5m])',unit:'req/s'},errors:{grafana:'rate(failures[5m])',unit:'req/s'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:.01}}};
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'Imported API'},store:{title:'Imported store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Inherited work',tickets:['BASE-1'],telemetry}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=spec('consumer',{view:'ambient',nodes:{a:{title:'Sender',tickets:['END-1']},b:{title:'Receiver'},c:{title:'Store'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',label:'No change',telemetry},{from:'b',to:'c',label:'Local work',tickets:['LOC-1','LOC-2'],telemetry},{from:'a',to:'c',label:'Ordinary connection'}],panels:[{id:'status',type:'live-status',title:'Status'}],topologyImports:[{spec:'provider',export:'core',as:'shared',position:{x:80,y:300},edgeTracking:{'api->store':{tickets:['OVER-1']}}}]});
 consumer.page.skin='daylight';
 consumer.page.tracking={jira:{site:'https://jira.test'},telemetry:{environment:'stg',environments:{stg:{},prd:{}}}};
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 const resolved=JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
 expect(resolved.page.sections[0].diagram.edges.find(e=>e.from==='shared::api').tickets).toEqual(['BASE-1','OVER-1']);
 return resolved;
}
async function mount(page,server,native){
 await page.setViewportSize({width:1440,height:1000});
 await page.addInitScript(()=>{
  window.requests=[];window.flowviewTelemetry={provider:(bindings,signal)=>new Promise(resolve=>window.requests.push({bindings,signal,resolve}))};
  window.flowviewBooted=ctl=>window.cardCtl=ctl;
 });
 const spec=fixture();
 if(native){
  await writeFile(path.join(server.root,'card-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'card-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./card-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/card-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(spec=>{window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:window.flowviewTelemetry});window.cardCtl=window.viewer.controller;},spec);
 }else{
  const input=path.join(server.root,'card-inheritance.json'),out=path.join(server.root,'card-inheritance.html');await writeFile(input,JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
  await page.goto(server.origin+'/card-inheritance.html');await page.waitForFunction(()=>!!window.cardCtl);
 }
 await apply(page,'done','active');
 const root=page.locator(native?'#host':'#docview');await root.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 return root;
}
async function apply(page,first,second){
 await page.evaluate(({first,second})=>window.cardCtl.liveStatus.apply(Object.fromEntries([['END-1','blocked'],['LOC-1',first],['LOC-2',second],['BASE-1',first],['OVER-1',second]].filter(([,state])=>state).map(([key,state])=>[key,{state}]))),{first,second});
}
async function paint(card){return card.evaluate(el=>{const box=getComputedStyle(el.querySelector('.dv-metrics-card-box')),halo=el.querySelector('.dv-live-halo');return {appearance:el.getAttribute('data-live-appearance'),stroke:box.stroke,width:box.strokeWidth,fill:box.fill,dash:box.strokeDasharray,glow:halo?getComputedStyle(halo).opacity:null};});}
async function textContrast(card,selector){return card.evaluate((el,selector)=>{
 // A media/font repaint can replace the card after the locator resolves it.
 // Empty computed fills are not black ink: Canvas retains its previous color.
 const text=el.querySelector(selector),box=el.querySelector('.dv-metrics-card-box');
 if(!el.isConnected || !text || !box)return {ink:[],contrast:0,connected:false};
 const inkFill=getComputedStyle(text).fill,groundFill=getComputedStyle(box).fill;
 if(!inkFill || !groundFill)return {ink:[],contrast:0,connected:false};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
 function rgb(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);}
 function luminance(rgb){const c=rgb.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
 const ink=rgb(inkFill),ground=rgb(groundFill),a=luminance(ink),b=luminance(ground);
 return {ink,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),connected:true};
 },selector);}
async function capture(root,testInfo,name){const file=testInfo.outputPath(name+'.png');await root.screenshot({path:file});await testInfo.attach(name,{path:file,contentType:'image/png'});}

for(const native of [false,true])test((native?'native':'standalone')+' metric cards inherit work rollups independently of health and loading',async({page,server},testInfo)=>{
 const root=await mount(page,server,native),card=id=>root.locator('[data-metrics-card="'+id+'"]'),unchanged=card(ids[0]);
 await expect(unchanged).toContainText('Loading…');
 await expect(unchanged).toHaveAttribute('aria-label',/No change needed/);
 expect(await paint(unchanged)).toMatchObject({appearance:'unchanged',stroke:'rgb(46, 214, 0)',width:'1px',glow:'0'});
 for(const id of ids.slice(1))await expect(card(id)).toHaveAttribute('data-live-appearance','active');
 // Endpoint work is blocked; neither this unticketed bound edge nor an ordinary edge borrows it.
 await expect(root.locator('path.edge[data-dv-edge="0"]')).not.toHaveAttribute('data-live-appearance');
 await expect(root.locator('path.edge[data-dv-edge="2"]')).not.toHaveAttribute('data-live-appearance');
 await capture(root,testInfo,'inherited-loading');
 await page.evaluate(()=>window.requests[0].resolve(Object.fromEntries(window.requests[0].bindings.map(b=>[b.id,{signals:{rate:{value:100},errors:{value:0}}}]))));
 await expect(unchanged).toContainText('100 req/s');
 const observed=await textContrast(unchanged,'.dv-metrics-card-value[data-signal="rate"]');expect(observed.contrast).toBeGreaterThanOrEqual(4.5);expect(observed.ink[1]).toBeGreaterThan(observed.ink[0]);
 await capture(root,testInfo,'inherited-default');
 for(const [first,second,want] of [['done','blocked','blocked'],['done','missing','missing'],['done','testing','testing'],['done','todo','active'],['done','done','done'],['done',null,null]]){
  await apply(page,first,second);
  for(const id of ids.slice(1)){
   if(want)await expect(card(id)).toHaveAttribute('data-live-appearance',want);else await expect(card(id)).not.toHaveAttribute('data-live-appearance');
  }
  if(want==='blocked')await capture(root,testInfo,'inherited-blocked');
 }
 expect((await paint(card(ids[2]))).stroke).toBe('rgb(138, 147, 163)');
 await page.evaluate(()=>window.cardCtl.telemetry.apply({'a->b':{signals:{rate:{value:100},errors:{value:5}}}}));
 await expect(unchanged.locator('.dv-metrics-card-failure')).toHaveText('Outside limit');
 expect(await paint(unchanged)).toMatchObject({appearance:'unchanged',width:'1px',stroke:'rgb(46, 214, 0)'});
 for(const selector of ['.dv-metrics-card-value[data-signal="errors"]','.dv-metrics-card-failure']){const health=await textContrast(unchanged,selector);expect(health.contrast).toBeGreaterThanOrEqual(4.5);expect(health.ink[0]).toBeGreaterThan(health.ink[1]);expect(health.ink[1]).toBeGreaterThan(health.ink[2]);}
 await capture(root,testInfo,'inherited-failing');
 // Media changes repaint metric cards; the board owns this test tint and stays mounted.
 const board=root.locator('.board');await expect(board).toHaveCount(1);
 await board.evaluate(el=>el.style.setProperty('--dv-board-ground','#0b1220'));
 await page.evaluate(()=>window.cardCtl.liveStatus.setEnabled(true));
 await page.emulateMedia({media:'print'});
 // Re-resolve after print's asynchronous font/layout repaint, retaining the
 // same contrast requirement for all three visible health text treatments.
 for(const selector of ['.dv-metrics-card-value[data-signal="rate"]','.dv-metrics-card-value[data-signal="errors"]','.dv-metrics-card-failure'])await expect.poll(async()=>(await textContrast(unchanged,selector)).contrast).toBeGreaterThanOrEqual(4.5);
 await capture(root,testInfo,'inherited-print');
 await page.emulateMedia({media:'screen'});await board.evaluate(el=>el.style.removeProperty('--dv-board-ground'));

 // Scope the same user appearance tokens consumed by nodes and metric cards.
 await page.evaluate(()=>{localStorage.setItem('flowview.status-colors.v1',JSON.stringify({version:2,colors:{'live-unchanged':'#765432'},appearance:{'live-unchanged':{borderColor:'#123456',borderWidth:2.25,fillStrength:40,glowStrength:100}}}));window.dispatchEvent(new CustomEvent('flowview-status-colors-change'));});
 await expect.poll(()=>paint(unchanged)).toMatchObject({appearance:'unchanged',stroke:'rgb(18, 52, 86)',width:'2.25px',glow:'0.35'});
 await expect.poll(async()=>{const {ink}=await textContrast(unchanged,'.dv-metrics-card-value[data-signal="rate"]');return ink[0]>ink[1] && ink[1]>ink[2];}).toBe(true);
 expect(await unchanged.evaluate(el=>getComputedStyle(el).getPropertyValue('--dv-live-fill').trim())).toBe('40%');
 await capture(root,testInfo,'inherited-preferences');
 for(const tint of ['#2ed600','#000000','#ffffff']){
  await page.evaluate(tint=>{const palette=JSON.parse(localStorage.getItem('flowview.status-colors.v1'));palette.colors['live-unchanged']=tint;palette.appearance['live-unchanged'].fillStrength=100;localStorage.setItem('flowview.status-colors.v1',JSON.stringify(palette));window.dispatchEvent(new CustomEvent('flowview-status-colors-change'));},tint);
  for(const selector of ['.dv-metrics-card-value[data-signal="rate"]','.dv-metrics-card-value[data-signal="errors"]','.dv-metrics-card-failure'])await expect.poll(async()=>(await textContrast(unchanged,selector)).contrast).toBeGreaterThanOrEqual(4.5);
  await capture(root,testInfo,'inherited-opaque-'+tint.slice(1));
 }

 await page.evaluate(()=>window.cardCtl.telemetry.apply({'a->b':{signals:{rate:{value:0},errors:{value:0}}}}));
 await expect(unchanged.locator('.dv-metrics-card-value[data-signal="errors"]')).toHaveText('0 req/s');
 await expect(unchanged.locator('.dv-metrics-card-value[data-signal="errors"]')).toHaveAttribute('data-metric-health','observed');
 await expect(unchanged.locator('.dv-metrics-card-value[data-signal="rate"]')).toHaveAttribute('data-metric-health','failing');
 await page.evaluate(()=>window.cardCtl.liveStatus.clear());await expect(unchanged).not.toHaveAttribute('data-live-appearance');
 await page.evaluate(()=>window.cardCtl.liveStatus.setEnabled(false));await expect(root.locator('.dv-metrics-card[data-live-appearance]')).toHaveCount(0);
 await page.evaluate(()=>window.cardCtl.liveStatus.setEnabled(true));await expect(unchanged).toHaveAttribute('data-live-appearance','unchanged');
 await page.evaluate(()=>window.cardCtl.telemetry.setEnvironment('prd'));await expect(unchanged).toContainText('Loading…');await expect(unchanged).not.toContainText('100 req/s');
 expect((await textContrast(unchanged,'.dv-metrics-card-value[data-signal="rate"]')).contrast).toBeGreaterThanOrEqual(4.5);
 await page.evaluate(()=>window.requests.at(-1).resolve({}));await expect(unchanged).toContainText('unobserved');await expect(unchanged).not.toContainText('0 req/s');
 expect((await textContrast(unchanged,'.dv-metrics-card-value[data-signal="rate"]')).contrast).toBeGreaterThanOrEqual(4.5);
 await page.evaluate(()=>window.cardCtl.telemetry.retry());await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(3);
 await page.evaluate(()=>window.cardCtl.telemetry.setEnabled(false));await expect(root.locator('.dv-metrics-card,.dv-metrics-leader')).toHaveCount(0);
 await page.evaluate(()=>window.requests.at(-1).resolve({'a->b':{signals:{rate:{value:999}}}}));await expect(root.locator('.dv-metrics-card')).toHaveCount(0);
 if(native){await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();}
});

test('loaded imported detail inherits its own work and clears retained card DOM',async({page,server},testInfo)=>{
 const {root,scope}=await mountImportedDetail(page,server),card=scope.locator('[data-metrics-card="shared::api->shared::store"]');
 await expect(card).toHaveAttribute('data-live-appearance','done');
 await page.evaluate(()=>window.viewer.controller.liveStatus.apply({'ROOT-1':{state:'blocked'},'IMP-2':{state:'active'},'IMP-3':{state:'done'}}));
 await expect(card).toHaveAttribute('data-live-appearance','active');
 await capture(scope,testInfo,'loaded-import-inheritance');
 const retained=await scope.elementHandle();await page.evaluate(()=>window.viewer.destroy());
 expect(await retained.evaluate(el=>el.querySelectorAll('.dv-metrics-card,.dv-metrics-leader').length)).toBe(0);await expect(root).toBeEmpty();
});

test('nested imported no-change card uses the thin outline without provider evidence',async({page,server})=>{
 const {root}=await mountCues(page,server);
 await page.evaluate(spec=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>({'outer::inner::a->outer::inner::b':{signals:{rate:{value:88},errors:{value:0}}}})}});},nestedSpec());
 await root.getByRole('switch',{name:'Metrics overlay',exact:true}).click();const card=root.locator('[data-metrics-card="outer::inner::a->outer::inner::b"]');
 await expect(card).toContainText('88 req/h');expect(await paint(card)).toMatchObject({appearance:'unchanged',width:'1px',glow:'0'});
 await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();
});
