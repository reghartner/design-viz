/* #1404: with page `tracking.endToEndMetrics: true`, Proof rolls up from metric limits and traffic only.
   A ticketless carrier whose limits hold is proven, an in-progress ticket does not make it "live early",
   a carrier without a limit is shown but not counted, and the Proof table has no ticket wording and no
   Since Done column. The native viewer renders in #host's shadow root; page functions start there. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const LIMITED=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'},errors:{grafana:'sum(rate(failed_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:0.01}}});
const OPEN=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(sent_total[5m]))*3600',unit:'req/h'}}});
const JIRA={'EDGE-2':{state:'active'},'EDGE-3':{state:'done'}};
const HEALTHY={'a->b':{signals:{rate:{value:100},errors:{value:0}}},'b->c':{signals:{rate:{value:100},errors:{value:0}}},'c->d':{signals:{rate:{value:100}}}};
const BREACHED={...HEALTHY,'b->c':{signals:{rate:{value:100},errors:{value:50}}}};
const TICKET_WORDS=/DONE|IN PROGRESS|TESTING|TODO|LIVE EARLY|ALREADY LIVE|Since Done|EDGE-\d/;

function spec(flag){
 const edge=(from,to,tickets,telemetry)=>({from,to,label:from+' to '+to,...(tickets?{tickets}:{}),telemetry});
 return {page:{title:'End-to-end proof',tracking:{jira:{site:'https://jira.test'},...(flag?{endToEndMetrics:true}:{})},sections:[{id:'main',diagram:{
  nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'},d:{title:'D'}},rows:[['a','b','c','d']],
  edges:[edge('a','b',null,LIMITED()),edge('b','c',['EDGE-2'],LIMITED()),edge('c','d',['EDGE-3'],OPEN())],
  panels:[{id:'status',type:'live-status',title:'Status'}]}}]}};
}
async function mount(page,server,raw,samples){
 await page.setViewportSize({width:1440,height:1000});
 await writeFile(path.join(server.root,'e2e-proof.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'e2e-proof.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./e2e-proof.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/e2e-proof.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(({raw,jira,samples})=>{
  window.viewer=window.mount(document.querySelector('#host'),raw,{telemetry:{provider:()=>Promise.resolve(structuredClone(samples))}});
  window.viewer.controller.liveStatus.apply(jira);
 },{raw,jira:JIRA,samples});
 const root=page.locator('#host');
 await root.getByRole('switch',{name:'Metrics overlay',exact:true}).click();
 await expect(root.locator('.dv-live-proof-row')).toHaveCount(3);
 return root;
}
// What the page function sees in the shadow root: headings, row verdict pills and the whole table text.
function table(page){return page.evaluate(()=>{const s=document.querySelector('#host').shadowRoot,t=s.querySelector('.dv-live-proof-table');
 return {headings:[...t.querySelectorAll('thead th')].map(th=>th.textContent),text:t.textContent,
  rows:Object.fromEntries([...t.querySelectorAll('tbody tr')].map(r=>[r.getAttribute('data-proof-carrier'),r.querySelector('.dv-live-proof-pill').textContent]))};});}

test('#1404 flag on: a ticketless carrier with met limits is proven and the headline reads "End to end proven"',async({page,server},testInfo)=>{
 const root=await mount(page,server,spec(true),HEALTHY),panel=root.locator('.pt-live-status');
 await expect(panel.locator('.dv-live-proof-headline')).toHaveText('End to end proven');
 await expect(panel.locator('.dv-live-proof-ratio')).toHaveText('2/2 proven');
 const got=await table(page);
 expect(got.rows).toEqual({'a->b':'PROVEN','b->c':'PROVEN','c->d':'OBSERVED · not counted, no limit'});
 expect(got.headings).not.toContain('Since Done');expect(got.headings).not.toContain('Jira');
 expect(got.headings.length).toBe(5);
 expect(got.text).not.toMatch(TICKET_WORDS);
 await expect(root.locator('path.edge[data-dv-edge="0"]')).toHaveAttribute('data-metrics-verdict','proven');
 await expect(root.locator('path.edge[data-dv-edge="1"]')).toHaveAttribute('data-metrics-verdict','proven');
 await panel.screenshot({path:testInfo.outputPath('e2e-proven.png')});
});

test('#1404 flag on: a breached limit shows degraded and the headline reads "1 of 2 proven"',async({page,server})=>{
 const root=await mount(page,server,spec(true),BREACHED),panel=root.locator('.pt-live-status');
 await expect(panel.locator('.dv-live-proof-headline')).toHaveText('1 of 2 proven');
 await expect(panel.locator('.dv-live-proof-sentence')).toContainText('Degraded: b to c');
 const got=await table(page);
 expect(got.rows['a->b']).toBe('PROVEN');expect(got.rows['b->c']).toBe('DEGRADED');
 expect(got.headings).not.toContain('Since Done');expect(got.text).not.toMatch(TICKET_WORDS);
});

test('#1404 flag off: the same board keeps today\'s Jira-based Proof',async({page,server})=>{
 const root=await mount(page,server,spec(false),HEALTHY),panel=root.locator('.pt-live-status');
 await expect(panel.locator('.dv-live-proof-headline')).toHaveCount(0);
 const got=await table(page);
 expect(got.rows['b->c']).toBe('IN PROGRESS · LIVE EARLY');expect(got.rows['a->b']).toBe('HEALTHY');
 expect(got.headings).toContain('Since Done');expect(got.headings).toContain('Jira');
});
