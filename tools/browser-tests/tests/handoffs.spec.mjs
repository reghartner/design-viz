import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const example=JSON.parse(await readFile(path.join(repo,'src/starters/diagram-handoffs.json'),'utf8'));
function localSpec(origin){
 const raw=structuredClone(example);
 for(const [key,node] of Object.entries(raw.page.sections[0].diagram.nodes))if(node.handoff)node.handoff.url=origin+'/'+key+'.html';
 return raw;
}
async function destinations(server){for(const name of ['push','lake','action'])await writeFile(path.join(server.root,name+'.html'),'<h1>'+name+' destination</h1>');}

test('standalone handoffs are real keyboard links to separate documents and retain the overview state',async({page,server,context})=>{
 await destinations(server);
 const spec=path.join(server.root,'handoffs.json');await writeFile(spec,JSON.stringify(localSpec(server.origin)));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),path.join(server.root,'handoffs.html')]);
 await page.goto(server.origin+'/handoffs.html');
 await page.getByRole('button',{name:'Go to step 2',exact:true}).click();
 const before=page.url(),link=page.getByRole('link',{name:'Open Push notification diagram (new tab)',exact:true});
 await expect(link).toBeVisible();
 await expect(page.locator('[data-dv-node="push"]')).toHaveClass(/lit/);
 await link.focus();const opened=context.waitForEvent('page');await link.press('Enter');
 const child=await opened;await child.waitForLoadState();await expect(child.getByRole('heading')).toHaveText('push destination');
 expect(page.url()).toBe(before);await child.close();
 for(const key of ['lake','action']){
  const next=context.waitForEvent('page');await page.locator('[data-dv-node="'+key+'"] .handoff-link').click();
  const tab=await next;await tab.waitForLoadState();await expect(tab.getByRole('heading')).toHaveText(key+' destination');await tab.close();
 }
});

test('native handoffs route through the host, safely fall back and never request details',async({page,server})=>{
 await destinations(server);
 await writeFile(path.join(server.root,'handoff-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'handoff-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./handoff-native.js";window.mountHandoffs=mountNativeViewer;</script>');
 await page.goto(server.origin+'/handoff-native.html');await page.waitForFunction(()=>!!window.mountHandoffs);
 await page.evaluate(({raw,origin})=>{
  delete raw.page.sections[0].diagram.nodes.action.handoff.url;
  window.detailLoads=0;
  window.viewer=mountHandoffs(document.querySelector('#host'),raw,{loadDetail(){detailLoads++;throw Error('Must not load');},resolveDiagramLink(ref){
   if(ref.spec==='doorbell-push')return origin+'/push.html?from=host';
   if(ref.spec==='doorbell-lake')return 'javascript:alert(1)';
   throw Error('Unknown destination');
  }});
 },{raw:localSpec(server.origin),origin:server.origin});
 const host=page.locator('#host');
 await expect(host.locator('[data-dv-node="push"] a')).toHaveAttribute('href',server.origin+'/push.html?from=host');
 await expect(host.locator('[data-dv-node="lake"] a')).toHaveAttribute('href',server.origin+'/lake.html');
 await expect(host.locator('[data-dv-node="action"] a')).toHaveCount(0);
 await expect(host.locator('[data-dv-node="action"]')).toContainText('DESTINATION UNAVAILABLE');
 expect(await page.evaluate(()=>detailLoads)).toBe(0);
 await page.evaluate(()=>viewer.destroy());await expect(host).toBeEmpty();
});

test('workbench handoff body selects for editing, fields apply atomically and Undo restores source',async({page,server})=>{
 const source=JSON.stringify(localSpec(server.origin),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 await page.locator('[data-dv-node="push"] .t1').click();
 await expect(page.getByRole('button',{name:'Apply handoff',exact:true})).toBeVisible();
 await page.getByLabel('Destination URL',{exact:true}).fill(server.origin+'/push.html#d=delivery');
 await page.getByRole('button',{name:'Apply handoff',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.nodes.push.handoff.url).toBe(server.origin+'/push.html#d=delivery');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});
