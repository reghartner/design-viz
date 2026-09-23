import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
function spec(routing='curves'){
 const ids=[...'abcdefghi'];
 return {page:{title:'Stable row order',skin:'pastel',sections:[{id:'rows',heading:'Every row reads left to right',diagram:{
  routing,nodes:Object.fromEntries(ids.map(id=>[id,{title:id.toUpperCase(),icon:'chip'}])),rows:[['a','b','c'],['d','e','f'],['g','h','i']],
  edges:ids.slice(1).map((id,i)=>({from:ids[i],to:id,label:ids[i]+' → '+id})),
  view:'step',autoplay:false,steps:ids.slice(1).map((id,i)=>({id:'step-'+i,edge:ids[i]+'->'+id,text:'Deliver to '+id.toUpperCase()})),
 } }]}};
}
const node=(root,id)=>root.locator('g.node[data-dv-node="'+id+'"]');
async function positions(root,ids){return Promise.all(ids.map(id=>node(root,id).evaluate(n=>n.transform.baseVal.consolidate().matrix.e)));}
async function inOrder(root,rows){for(const row of rows){const xs=await positions(root,row);expect(xs).toEqual([...xs].sort((a,b)=>a-b));expect(new Set(xs).size).toBe(xs.length);}}
const diagram=s=>s.page.sections[0].diagram;
async function drag(page,source,to,line){
 const from=await source.boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
 await page.mouse.move(to.x,to.y,{steps:14});await expect(page.locator(line)).toHaveAttribute('visibility','visible');await page.mouse.up();
}
for(const routing of ['curves','lanes'])test(`${routing}: node row insertion and removal preserve lower row order with exact Undo/Redo`,async({page,server},testInfo)=>{
 const raw=spec(routing),source=JSON.stringify(raw,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,source);
 const root=page.locator('#docview');await inOrder(root,diagram(raw).rows);
 const lower=await positions(root,[...'defghi']);
 const a=await node(root,'a').boundingBox(),d=await node(root,'d').boundingBox();
 await drag(page,node(root,'c'),{x:a.x+a.width/2,y:(a.y+a.height+d.y)/2},'.dv-rowline');
 const rows=async()=>diagram(JSON.parse(await page.locator('#src').inputValue())).rows;
 await expect.poll(rows).toEqual([['a','b'],['c'],['d','e','f'],['g','h','i']]);
 expect(await positions(root,[...'defghi'])).toEqual(lower);await inOrder(root,await rows());
 const split=await page.locator('#src').inputValue();
 // Merge the lone node into the visual gap between D and E: deleting its row
 // changes both later row indexes but must not mirror either row.
 const db=await node(root,'d').boundingBox(),eb=await node(root,'e').boundingBox();
 await drag(page,node(root,'c'),{x:(db.x+db.width+eb.x)/2,y:db.y+db.height/2},'.dv-slotline');
 await expect.poll(rows).toEqual([['a','b'],['d','c','e','f'],['g','h','i']]);await inOrder(root,await rows());
 expect(await positions(root,[...'ghi'])).toEqual(lower.slice(3));
 const joined=await page.locator('#src').inputValue();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(split);expect(await positions(root,[...'defghi'])).toEqual(lower);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await inOrder(root,diagram(raw).rows);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(split);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(joined);await inOrder(root,await rows());
 expect(diagram(JSON.parse(joined)).edges).toEqual(diagram(raw).edges);expect(diagram(JSON.parse(joined)).steps).toEqual(diagram(raw).steps);
 await page.screenshot({path:testInfo.outputPath('row-order-'+routing+'.png'),fullPage:true});
});

test('standalone and native viewers agree on authored row order and cross-row step edges',async({page,server})=>{
 const raw=spec();
 await writeFile(path.join(server.root,'rows.json'),JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'rows.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'rows.html')]);
 await page.goto(server.origin+'/rows.html');let root=page.locator('.docview');await inOrder(root,diagram(raw).rows);
 await root.locator('.schip[data-step-source="2"]').click();await expect(root.locator('.step-text')).toHaveText('Deliver to D');
 // A last-to-first edge label uses the same central anchoring as any other edge.
 await expect(root.locator('text.lbl[data-dv-edge="2"]')).toHaveAttribute('text-anchor','middle');
 await writeFile(path.join(server.root,'rows-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'rows-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./rows-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/rows-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>window.viewer=mount(document.querySelector('#host'),raw),raw);root=page.locator('#host');await inOrder(root,diagram(raw).rows);
 await root.locator('.schip[data-step-source="2"]').click();await expect(root.locator('.step-text')).toHaveText('Deliver to D');
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('Forge uses the same left-to-right rows in its production viewer',async({page,server})=>{
 const raw=spec();await page.addInitScript(raw=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{specJson:JSON.stringify(raw)},macro:{isConfiguring:false}}};return true;}};},raw);
 await page.goto(server.origin+'/forge/index.html');await inOrder(page.locator('#docview'),diagram(raw).rows);
});
