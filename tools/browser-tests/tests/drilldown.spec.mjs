import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const source=await readFile(path.join(repo,'src/starters/domain-drilldown.json'),'utf8');
const root=page=>page.locator('#section-doorbell-domains');
const active=page=>page.locator('[data-dv-detail-preview]:visible');
async function flow(page){
  const initial=root(page);await initial.locator('[data-dv-detail="connectivity"]').click();
  await expect(initial).toBeHidden();await expect(active(page).locator('.detail-breadcrumb')).toContainText('Connectivity');
  await expect(active(page).locator('.sec-eyebrow')).toHaveText('Detail flow');
  const cloud=active(page).locator('[data-dv-detail]');await expect(cloud).toHaveCount(1);await cloud.focus();await cloud.press('Enter');
  await expect(active(page).locator('.detail-breadcrumb')).toContainText('Cloud handoff');
  await active(page).locator('.detail-breadcrumb button').first().click();await expect(initial).toBeVisible();
  await initial.locator('[data-dv-detail="recording"]').click();
  await expect(active(page).getByRole('button',{name:'Collapse Recording',exact:true})).toBeVisible();
  await expect(active(page).locator('[data-dv-node="recording"]')).toHaveCount(0);
  await expect(active(page).locator('[data-dv-node^="__detail_recording_"]')).not.toHaveCount(0);
  await active(page).getByRole('button',{name:'Explore Recording',exact:true}).click();
  await expect(active(page).locator('.sec-eyebrow')).toHaveText('Detail flow');
  await active(page).locator('.detail-breadcrumb button').first().click();await expect(initial).toBeVisible();
}
test('workbench drilldowns and expansion preserve authored source and restore the original controls',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 const initial=root(page);await initial.locator('.schip[data-step-source="1"]').first().click();
 const caption=await initial.locator('.stepline').innerText();await flow(page);
 await expect(initial.locator('.stepline')).toHaveText(caption,{useInnerText:true});await expect(page.locator('#src')).toHaveValue(source);
 // Preview nodes cannot create synthetic editor selections or mutate source.
 await initial.locator('[data-dv-detail="connectivity"]').click();await active(page).locator('[data-dv-node]').first().click();await expect(page.locator('#src')).toHaveValue(source);
 await active(page).getByRole('button',{name:'Edit detail section'}).click();await expect(page.locator('#section-connectivity')).toBeVisible();
});
test('standalone details support native Back/Forward and shareable reloadable deep links',async({page,server})=>{
 const input=path.join(server.root,'detail-spec.json'),output=path.join(server.root,'detail.html');await writeFile(input,source);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/detail.html');await expect(page.locator('.doc-sec:visible')).toHaveCount(1);
 await root(page).locator('[data-dv-detail="connectivity"]').click();const detailURL=page.url();expect(detailURL).toContain('q=');
 await page.goBack();await expect(root(page)).toBeVisible();await expect(active(page)).toHaveCount(0);
 await page.goForward();await expect(active(page).locator('.detail-breadcrumb')).toContainText('Connectivity');
 await page.reload();await expect(active(page).locator('.detail-breadcrumb')).toContainText('Connectivity');
 await active(page).locator('.detail-breadcrumb button').first().click();await flow(page);
});
test('Forge single-section macro keeps the detail definitions available without showing them as extra sections',async({page,server})=>{
 await page.addInitScript(specJson=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {extension:{config:{specJson,section:'1',focus:'spec',skin:'spec'},macro:{isConfiguring:false}}};if(['navigate','close'].includes(method))return true;throw Error(method);}};},source);
 await page.goto(server.origin+'/forge/index.html');await expect(root(page)).toBeVisible();await expect(page.locator('.doc-sec:visible')).toHaveCount(1);await flow(page);
});
test('native mounts restore external pinned details, isolate roots, and retire late loaders',async({page,server})=>{
 await writeFile(path.join(server.root,'detail-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'detail-native.html'),'<div id="a"></div><div id="b"></div><script type="module">import {mountNativeViewer} from "./detail-native.js"; window.mountDetail=mountNativeViewer;</script>');
 await page.goto(server.origin+'/detail-native.html');await page.waitForFunction(()=>!!window.mountDetail);
 await page.evaluate(raw=>{
  const external={page:{sections:[{id:'remote',heading:'Approved remote flow',diagram:{nodes:{x:{title:'Remote service'}},rows:[['x']],steps:[{id:'inside',text:'Inside the approved revision',nodes:['x']}]}}]}};
  raw.page.sections[0].diagram.nodes.apps.detail={spec:'approved-apps',revision:'commit-123',section:'remote',mode:'link'};
  window.__detailRequests=[];window.__detailState=null;
  window.__nativeSpec=raw;
  window.__viewer=mountDetail(document.querySelector('#a'),raw,{onDetailNavigate:s=>window.__detailState=s,loadDetail:(r,signal)=>{__detailRequests.push({r,signal});return window.__delay?new Promise(resolve=>window.__resolve=resolve):Promise.resolve(external);}});
  window.__external=external;
  window.__other=mountDetail(document.querySelector('#b'),raw);
 },JSON.parse(source));
 const host=page.locator('#a'),other=page.locator('#b');
 await page.evaluate(()=>__viewer.navigate({section:'doorbell-domains',step:'dispatch'}));
 await host.locator('[data-dv-detail="apps"]').click();await expect(host.getByRole('navigation',{name:'Diagram drill-down'})).toContainText('Approved remote flow');
 expect(await page.evaluate(()=>__detailRequests[0].r)).toEqual({spec:'approved-apps',revision:'commit-123',section:'remote'});
 await expect(other.locator('[data-dv-detail-preview]')).toHaveCount(0);
 expect(await page.evaluate(()=>__detailState.rootState.step)).toBe('dispatch');
 await page.evaluate(()=>{window.__saved=__detailState;__viewer.navigate({section:'doorbell-domains'});__viewer.navigate({section:'doorbell-domains',drilldown:__saved});});
 await expect(host.getByRole('navigation',{name:'Diagram drill-down'})).toContainText('Approved remote flow');expect(await page.evaluate(()=>__detailRequests.length)).toBe(2);
 await page.evaluate(()=>{__viewer.navigate({section:'connectivity'});});await expect(host.locator('#section-connectivity')).toBeVisible();
 await page.evaluate(()=>{__viewer.navigate({section:'doorbell-domains'});});await expect(host.locator('#section-connectivity')).toBeHidden();
 await page.evaluate(()=>window.__delay=true);await host.locator('[data-dv-detail="apps"]').click();await expect(host.locator('.detail-notice')).toContainText('Loading');
 await page.evaluate(()=>{__viewer.destroy();__resolve(__external);});await expect(host).toBeEmpty();
 expect(await page.evaluate(()=>__detailRequests.at(-1).signal.aborted)).toBe(true);
 await page.evaluate(()=>__other.destroy());
});
test('the node inspector creates a detail section in one Undo action and configures an existing reference',async({page,server})=>{
 const spec={page:{title:'Author a domain',sections:[{heading:'Overview',diagram:{nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]}}]}};
 const text=JSON.stringify(spec,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,text);
 await page.locator('[data-dv-node="b"]').click();await page.getByRole('button',{name:'Create detail flow',exact:true}).click();
 let result=JSON.parse(await page.locator('#src').inputValue());expect(result.page.sections).toHaveLength(2);expect(result.page.sections[0].diagram.nodes.b.detail).toEqual({section:'b-detail',mode:'focus'});
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(text);await page.locator('#redo-builder').click();
 await page.locator('[data-dv-node="b"]').click();await page.locator('#guide').getByRole('combobox',{name:'Open mode',exact:true}).selectOption('expand');
 const child=Object.keys(result.page.sections[1].diagram.nodes)[0];await page.locator('#guide').getByRole('combobox',{name:'Boundary input node',exact:true}).selectOption(child);
 await page.getByRole('button',{name:'Apply detail',exact:true}).click();result=JSON.parse(await page.locator('#src').inputValue());
 expect(result.page.sections[0].diagram.nodes.b.detail.mode).toBe('expand');await page.locator('[data-dv-detail="b"]').click();await expect(active(page).getByRole('button',{name:'Collapse Service',exact:true})).toBeVisible();
});
