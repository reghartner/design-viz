import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,openInspectorGroup,paste,inspectPageElement} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const example=JSON.parse(await readFile(path.join(repo,'src/starters/diagram-handoffs.json'),'utf8'));
function localSpec(origin){
 const raw=structuredClone(example);
 raw.page.documentLinks={id:'overview',siteBaseUrl:origin+'/index.html'};
 for(const [key,node] of Object.entries(raw.page.sections[0].diagram.nodes))if(node.handoff)node.handoff.siteBaseUrl=origin+'/'+key+'.html';
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

test('native site handoffs route through the host and offer rejected targets as explicit alternatives',async({page,server})=>{
 await destinations(server);
 await writeFile(path.join(server.root,'handoff-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'handoff-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./handoff-native.js";window.mountHandoffs=mountNativeViewer;</script>');
 await page.goto(server.origin+'/handoff-native.html');await page.waitForFunction(()=>!!window.mountHandoffs);
 await page.evaluate(({raw,origin})=>{
  delete raw.page.sections[0].diagram.nodes.action.handoff.siteBaseUrl;
  raw.page.sections[0].diagram.nodes.lake.handoff.claudeUrl='https://claude.ai/artifact/lake';
  window.detailLoads=0;
  window.viewer=mountHandoffs(document.querySelector('#host'),raw,{handoffHost:'site',loadDetail(){detailLoads++;throw Error('Must not load');},resolveDiagramLink(ref){
   if(ref.spec==='doorbell-push')return origin+'/push.html?from=host';
   if(ref.spec==='doorbell-lake')return 'javascript:alert(1)';
   throw Error('Unknown destination');
  }});
 },{raw:localSpec(server.origin),origin:server.origin});
 const host=page.locator('#host');
 await expect(host.locator('[data-dv-node="push"] a')).toHaveAttribute('href',server.origin+'/push.html?from=host');
 await expect(host.locator('[data-dv-node="lake"] .handoff-link')).not.toHaveAttribute('href');
 await host.locator('[data-dv-node="lake"] .handoff-link').click();
 await expect(host.getByRole('dialog',{name:'Diagram destinations'}).getByRole('link',{name:'Open in Claude'})).toHaveAttribute('href','https://claude.ai/artifact/lake');
 await expect(host.locator('[data-dv-node="action"] a')).toHaveCount(0);
 await expect(host.locator('[data-dv-node="action"]')).toContainText('DESTINATION UNAVAILABLE');
 expect(await page.evaluate(()=>detailLoads)).toBe(0);
 await page.evaluate(()=>viewer.destroy());await expect(host).toBeEmpty();
});

/* #557 reader handoff states and destination chooser placement.
   row | fixture | assertion (scoped) | rejects
   1 choose caption | lake: claudeUrl only, host 'site' | lake .handoff-caption text is exactly 'OPEN DIAGRAM…' | 'CHOOSE DESTINATION' authoring-style label
   2 sibling captions | push: resolved site link; action: no destination | push caption 'OPEN DIAGRAM ↗', action caption 'DESTINATION UNAVAILABLE' | a caption change that also rewrites link/unavailable labels
   3 unavailable look | action vs push + lake | action .card computed stroke-dasharray != none and its group cursor 'not-allowed'; push and lake cards 'none' with cursor 'pointer' | unavailable card styled exactly like a reachable one
   4 unavailable announced | action | action group is role=img named '… Diagram destination unavailable …', exposes no link/button | an unavailable endpoint announced as an action
   5 chooser closed before | lake | no 'Diagram destinations' dialog before the click | a chooser opened by mounting
   6 chooser adjacent | lake (rightmost column) | dialog rect does not overlap the lake card and its edge gap to the card is <= 16px | the fixed bottom-right corner panel
   7 chooser in bounds | lake's .board | dialog rect lies inside the board rect that contains lake | a panel placed right of the node, overflowing the diagram */
test('handoff captions name the reader action, unavailable endpoints look disabled and the chooser opens beside its node',async({page,server})=>{
 await writeFile(path.join(server.root,'handoff-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'handoff-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./handoff-native.js";window.mountHandoffs=mountNativeViewer;</script>');
 await page.goto(server.origin+'/handoff-native.html');await page.waitForFunction(()=>!!window.mountHandoffs);
 await page.evaluate(({raw,origin})=>{
  delete raw.page.sections[0].diagram.nodes.action.handoff.siteBaseUrl;
  raw.page.sections[0].diagram.nodes.lake.handoff.claudeUrl='https://claude.ai/artifact/lake';
  mountHandoffs(document.querySelector('#host'),raw,{handoffHost:'site',resolveDiagramLink(ref){
   if(ref.spec==='doorbell-push')return origin+'/push.html';
   throw Error('Unknown destination');
  }});
 },{raw:localSpec(server.origin),origin:server.origin});
 const host=page.locator('#host'),node=key=>host.locator('[data-dv-node="'+key+'"]');
 await expect.soft(node('lake').locator('.handoff-caption')).toHaveText('OPEN DIAGRAM…');
 await expect.soft(node('push').locator('.handoff-caption')).toHaveText('OPEN DIAGRAM ↗');
 await expect.soft(node('action').locator('.handoff-caption')).toHaveText('DESTINATION UNAVAILABLE');
 const look=key=>node(key).locator('.card').evaluate(card=>({dash:getComputedStyle(card).strokeDasharray,cursor:getComputedStyle(card.closest('.handoff-link,.handoff-unavailable')).cursor}));
 const unavailable=await look('action');
 expect.soft(unavailable.dash).not.toBe('none');expect.soft(unavailable.cursor).toBe('not-allowed');
 for(const key of ['push','lake'])expect.soft(await look(key),key).toEqual({dash:'none',cursor:'pointer'});
 await expect.soft(node('action').getByRole('img',{name:/Diagram destination unavailable/})).toHaveCount(1);
 await expect.soft(node('action').locator('a,[role="button"]')).toHaveCount(0);
 const chooser=host.getByRole('dialog',{name:'Diagram destinations'});
 await expect(chooser).toHaveCount(0);
 await node('lake').locator('.handoff-link').click();
 await expect(chooser).toBeVisible();
 const card=await node('lake').locator('.card').boundingBox(),panel=await chooser.boundingBox();
 const board=await host.locator('.board:has([data-dv-node="lake"])').boundingBox();
 const gapX=Math.max(0,panel.x-(card.x+card.width),card.x-(panel.x+panel.width)),gapY=Math.max(0,panel.y-(card.y+card.height),card.y-(panel.y+panel.height));
 expect.soft(gapX>0 || gapY>0,'chooser does not cover the clicked node').toBe(true);
 expect.soft(Math.hypot(gapX,gapY),'chooser edge gap to the clicked node').toBeLessThanOrEqual(16);
 expect.soft({left:panel.x>=board.x-.5,top:panel.y>=board.y-.5,right:panel.x+panel.width<=board.x+board.width+.5,bottom:panel.y+panel.height<=board.y+board.height+.5},'chooser inside the diagram').toEqual({left:true,top:true,right:true,bottom:true});
});

test('workbench handoff body selects for editing, fields apply atomically and Undo restores source',async({page,server})=>{
 const source=JSON.stringify(localSpec(server.origin),null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 await inspectPageElement(page,page.locator('[data-dv-node="push"] .t1'));
 await openInspectorGroup(page.locator('#guide .node-handoff-editor'));
 await expect(page.getByRole('button',{name:'Apply handoff',exact:true})).toBeVisible();
 await page.getByLabel('Internal site base URL',{exact:true}).fill(server.origin+'/delivery.html');
 await page.getByRole('button',{name:'Apply handoff',exact:true}).click();
 await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.nodes.push.handoff.siteBaseUrl).toBe(server.origin+'/delivery.html');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});
