/* #1200 + #1199: a metric card's border shows the METRIC state only, the same in the Jira and Trace views,
   and each Proof count chip wears the border of the card state it counts.
| state | when | border |
|---|---|---|
| held | every authored limit holds | green (#2ed600), 3px, solid |
| flowing | values arriving, no limits authored | green, 1px, solid |
| failing | values arriving, a limit not met | in-progress blue (#009dff), 2px, solid |
| waiting | no values yet, or silent for the whole window | to-do blue (#8fb4ff), 3px, dotted |
Chips: proven and live early → held, degraded → failing, unproven → waiting.
The native viewer renders in #host's shadow root; page functions start at host.shadowRoot. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const T1=Date.UTC(2026,10,3,9),T2=Date.UTC(2026,10,3,10);
const LIMITED=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'},errors:{grafana:'sum(rate(failed_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:0.01}}});
const OPEN=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'}}});
const EDGES={'a->b':'held','b->c':'flowing','c->d':'failing','d->e':'waiting','e->f':'waiting','f->g':'held'};
const SAMPLES={'a->b':{signals:{rate:{value:100},errors:{value:0}}},'b->c':{signals:{rate:{value:100}}},'c->d':{signals:{rate:{value:100},errors:{value:50}}},
 'd->e':{signals:{rate:{value:0,series:[[T1,0],[T2,0]]},errors:{value:0,series:[[T1,0],[T2,0]]}}},'f->g':{signals:{rate:{value:100},errors:{value:0}}}};
// Done tickets on every carded edge but f->g (active): a card must not turn green from Jira.
const JIRA={'NODE-1':{state:'done'},'EDGE-1':{state:'done'},'EDGE-2':{state:'done'},'EDGE-3':{state:'done'},'EDGE-4':{state:'done'},'EDGE-5':{state:'done'},'EDGE-6':{state:'active'}};
const WANT={held:{stroke:'rgb(46, 214, 0)',width:'3px',dotted:false},flowing:{stroke:'rgb(46, 214, 0)',width:'1px',dotted:false},
 failing:{stroke:'rgb(0, 157, 255)',width:'2px',dotted:false},waiting:{stroke:'rgb(143, 180, 255)',width:'3px',dotted:true}};
const CHIPS={proven:'held',liveEarly:'held',degraded:'failing',unproven:'waiting'};

function spec(skin){
 const edge=(from,to,ticket,telemetry)=>({from,to,label:from+' to '+to,tickets:[ticket],telemetry});
 return {page:{title:'Metric state',skin,tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{
  nodes:{a:{title:'A',tickets:['NODE-1']},b:{title:'B'},c:{title:'C'},d:{title:'D'},e:{title:'E'},f:{title:'F'},g:{title:'G'}},rows:[['a','b','c','d'],['e','f','g']],
  edges:[edge('a','b','EDGE-1',LIMITED()),edge('b','c','EDGE-2',OPEN()),edge('c','d','EDGE-3',LIMITED()),edge('d','e','EDGE-4',LIMITED()),edge('e','f','EDGE-5',LIMITED()),edge('f','g','EDGE-6',LIMITED())],
  panels:[{id:'status',type:'live-status',title:'Status'}]}}]}};
}
async function mount(page,server,skin,raw=spec(skin),jira=JIRA,samples=SAMPLES){
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'metric-state.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'metric-state.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./metric-state.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/metric-state.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({raw,jira,samples})=>{
  window.viewer=window.mount(document.querySelector('#host'),raw,{telemetry:{provider:()=>Promise.resolve(structuredClone(samples))}});
  window.viewer.controller.liveStatus.apply(jira);
 },{raw,jira,samples});
 const root=page.locator('#host');
 await root.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 await expect(root.locator('[data-metrics-card="a->b"]')).toContainText('100 req/h');
 return root;
}
// Every card's state and computed border, read from the shadow root.
function cards(page){return page.evaluate(()=>Object.fromEntries([...document.querySelector('#host').shadowRoot.querySelectorAll('.dv-metrics-card')].map(card=>{
 const box=getComputedStyle(card.querySelector('.dv-metrics-card-box'));
 return [card.getAttribute('data-metrics-card'),{state:card.getAttribute('data-metric-state'),appearance:card.getAttribute('data-live-appearance'),halo:!!card.querySelector('.dv-live-halo'),
  stroke:box.stroke,width:box.strokeWidth,dotted:box.strokeDasharray!=='none'}];
})));}
function pills(page,selector){return page.evaluate(selector=>[...document.querySelector('#host').shadowRoot.querySelectorAll(selector)].map(chip=>{
 const s=getComputedStyle(chip);return {bucket:chip.getAttribute('data-proof-bucket'),text:chip.textContent,stroke:s.borderTopColor,width:s.borderTopWidth,dotted:s.borderTopStyle==='dotted',solid:s.borderTopStyle==='solid',ink:s.color};
}),selector);}
const chips=async page=>Object.fromEntries((await pills(page,'.dv-live-proof-pills .dv-live-proof-pill')).map(p=>[p.bucket,p]));


for(const skin of ['daylight','blueprint'])test('#1200 #1199 metric cards show the metric state only, the same in Jira and Trace, and Proof chips match ('+skin+')',async({page,server},testInfo)=>{
 const root=await mount(page,server,skin);
 const expected=Object.fromEntries(Object.entries(EDGES).map(([id,state])=>[id,{state,appearance:null,halo:false,...WANT[state]}]));
 await expect.poll(()=>cards(page)).toEqual(expected);
 await expect(root.locator('g.node[data-dv-node="a"]'),'nodes keep their Jira paint').toHaveAttribute('data-live-appearance','done');
 await root.screenshot({path:testInfo.outputPath('metric-state-jira-'+skin+'.png')});
 const got=await chips(page);
 expect(Object.keys(CHIPS).map(bucket=>got[bucket].text)).toEqual(['1 proven','1 live early','1 degraded','1 unproven']);
 for(const [bucket,state] of Object.entries(CHIPS)){
  const {stroke,width,dotted}=WANT[state];expect({bucket,stroke:got[bucket].stroke,width:got[bucket].width,dotted:got[bucket].dotted,solid:got[bucket].solid}).toEqual({bucket,stroke,width,dotted,solid:!dotted});
  expect(Object.values(WANT).map(w=>w.stroke),bucket+' chip text is neutral ink, not a state colour').not.toContain(got[bucket].ink);
 }
 expect(new Set(Object.keys(CHIPS).map(bucket=>got[bucket].ink)).size,'every state chip uses the same neutral ink').toBe(1);
 // The Proof ring's arcs use the same state colour as their chip border.
 const arcs=await page.evaluate(()=>[...document.querySelector('#host').shadowRoot.querySelectorAll('.dv-live-proof-arc')].map(a=>[a.getAttribute('data-proof-bucket'),getComputedStyle(a).stroke]));
 expect(arcs.map(a=>a[0])).toEqual(['proven','degraded','unproven','liveEarly']);
 for(const [bucket,stroke] of arcs)expect({bucket,stroke},'arc matches chip').toEqual({bucket,stroke:got[bucket].stroke});
 // The Proof table's per-carrier verdict pills wear the same state as their count chip.
 const rows=(await pills(page,'.dv-live-proof-table .dv-live-proof-pill')).filter(p=>CHIPS[p.bucket]);
 expect(rows.map(p=>p.bucket).sort()).toEqual(['degraded','liveEarly','proven','unproven']);
 for(const p of rows){const {stroke,width,dotted}=WANT[CHIPS[p.bucket]];expect({bucket:p.bucket,stroke:p.stroke,width:p.width,dotted:p.dotted}).toEqual({bucket:p.bucket,stroke,width,dotted});}
 await page.evaluate(()=>window.viewer.controller.liveStatus.setStatusMode('trace'));
 await expect.poll(()=>cards(page),'the Trace view shows the same metric state').toEqual(expected);
 await expect(root.locator('g.node[data-dv-node="a"]')).toHaveAttribute('data-live-appearance','done');
 await root.screenshot({path:testInfo.outputPath('metric-state-trace-'+skin+'.png')});
 // A personal Done border width of 1px still leaves held visibly stronger than flowing (1px): max(Done width, 2px).
 await page.evaluate(()=>{localStorage.setItem('flowview.status-colors.v1',JSON.stringify({version:2,colors:{},appearance:{'live-done':{borderWidth:1}}}));window.dispatchEvent(new CustomEvent('flowview-status-colors-change'));});
 await expect.poll(async()=>{const c=await cards(page);return [c['a->b'].width,c['b->c'].width];}).toEqual(['2px','1px']);
 await page.evaluate(()=>{localStorage.removeItem('flowview.status-colors.v1');window.dispatchEvent(new CustomEvent('flowview-status-colors-change'));});
 await page.evaluate(()=>window.viewer.destroy());
});

/* #1201: an error signal (`role: "error"`, e.g. a dead-letter queue depth) over its limit turns the card border red,
   and the Proof error chip border and error arc stroke wear the same red. Under its limit the card shows its normal state. */
// Blocked red; Blueprint uses a lighter red (#ff6b6b) for 3:1 contrast on its dark card fill.
const RED_BY_SKIN={daylight:{stroke:'rgb(232, 23, 23)',width:'3px',dotted:false},blueprint:{stroke:'rgb(255, 107, 107)',width:'3px',dotted:false}};
function errorSpec(skin){
 const raw=spec(skin),d=raw.page.sections[0].diagram;
 d.edges[0].telemetry={kind:'queue',signals:{rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'},dlq:{grafana:'max(dlq_depth)',unit:'msgs',role:'error'}},proof:{rate:{min:1},dlq:{max:0}}};
 return raw;
}
for(const skin of ['daylight','blueprint'])test('#1201 an error signal outside its limit turns the card, its Proof chip and arc red; under its limit the normal state ('+skin+')',async({page,server},testInfo)=>{
 const RED=RED_BY_SKIN[skin],samples={...SAMPLES,'a->b':{signals:{rate:{value:100},dlq:{value:4}}}};
 const root=await mount(page,server,skin,errorSpec(skin),JIRA,samples);
 const border=async()=>{const c=(await cards(page))['a->b'];return {stroke:c.stroke,width:c.width,dotted:c.dotted};};
 await expect.poll(border,'the error card border is red').toEqual(RED);
 expect((await cards(page))['a->b'].state).toBe('error');
 const got=await chips(page);
 expect(got.error && {text:got.error.text,stroke:got.error.stroke,width:got.error.width,dotted:got.error.dotted},'the error chip').toEqual({text:'1 error',...RED});
 const arc=await page.evaluate(()=>{const a=document.querySelector('#host').shadowRoot.querySelector('.dv-live-proof-arc[data-proof-bucket="error"]');return a && getComputedStyle(a).stroke;});
 expect(arc,'the error arc').toBe(RED.stroke);
 await root.screenshot({path:testInfo.outputPath('metric-state-error-'+skin+'.png')});
 await page.evaluate(()=>window.viewer.controller.telemetry.apply({'a->b':{signals:{rate:{value:100},dlq:{value:0}}}}));
 await expect.poll(async()=>{const c=(await cards(page))['a->b'];return {state:c.state,stroke:c.stroke,width:c.width,dotted:c.dotted};},'under its limit').toEqual({state:'held',...WANT.held});
 expect((await chips(page)).error,'no error chip under the limit').toBeUndefined();
 await page.evaluate(()=>window.viewer.destroy());
});
