import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

// Three steps start on the same edge (hub->cloud). Each must keep its own
// numbered coin, side by side along the edge, including after a view or path
// hides some of them and renumbers the rest.
const composition={default:[{x:0,y:0,w:12,h:20},{controls:'steps',attachTo:'diagram',x:0,y:20,w:12,h:8}]};
const raw={page:{title:'Shared first edge',sections:[{id:'beats',heading:'Heartbeats',diagram:{view:'step',autoplay:false,
 nodes:{hub:{title:'Hub'},cloud:{title:'Cloud'},app:{title:'App'}},rows:[['hub','cloud','app']],
 edges:[{from:'hub',to:'cloud',label:'heartbeat'},{from:'cloud',to:'app'}],
 steps:[{id:'beat1',edge:'hub->cloud',text:'First heartbeat.'},{id:'relay',edge:'cloud->app',text:'Cloud relays status.'},
  {id:'beat2',edges:['hub->cloud','cloud->app'],text:'Second heartbeat, relayed.'},{id:'beat3',edge:'hub->cloud',text:'Third heartbeat.',delta:true}],
 paths:[{id:'all',label:'All beats',steps:['beat1','relay','beat2','beat3']},{id:'hub',label:'Hub only',steps:['beat1','beat2','beat3']}],
 layouts:[{id:'full',name:'Full',sectionLayout:composition},{id:'brief',name:'Brief',steps:['beat1','relay','beat3'],sectionLayout:composition}],defaultLayout:'full'}}]}};

/* Visible coins on edge 0 as {source, text, box}, ordered by source step. */
async function edgeCoins(root){
 const coins=root.locator('.coin[data-dv-coin-edge="0"]:not(.view-step-hidden)');
 const out=[];
 for(const coin of await coins.all()){
  await expect(coin).toBeVisible();
  out.push({source:Number(await coin.getAttribute('data-dv-step')),text:await coin.locator('text').textContent(),box:await coin.locator('circle').boundingBox()});
 }
 return out.sort((a,b)=>a.source-b.source);
}
function apart(coins){
 for(let i=0;i<coins.length;i++)for(let j=i+1;j<coins.length;j++){
  const a=coins[i].box,b=coins[j].box;
  const overlap=a.x<b.x+b.width && b.x<a.x+a.width && a.y<b.y+b.height && b.y<a.y+a.height;
  expect(overlap,'coins for steps '+coins[i].source+' and '+coins[j].source+' overlap').toBe(false);
 }
}
async function expectRow(root,expected){
 const coins=await edgeCoins(root);
 expect(coins.map(c=>[c.source,c.text])).toEqual(expected);
 apart(coins);
 // The row reads in step order along the edge (source on the left here).
 const xs=coins.map(c=>c.box.x);expect([...xs].sort((a,b)=>a-b)).toEqual(xs);
 return coins;
}

test('steps sharing a first edge each get a distinct, non-overlapping coin that renumbers with views and paths',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'shared-coins.json'),JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'shared-coins.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'shared-coins.html')]);
 await page.goto(server.origin+'/shared-coins.html');const root=page.locator('.docview');
 await expect(root.locator('.coin[data-dv-coin-edge="0"]')).toHaveCount(3);
 const full=await expectRow(root,[[0,'1'],[2,'3'],[3,'4']]);
 await expect(root.locator('.coin[data-dv-coin-edge="1"]')).toHaveCount(1);
 await expect(root.locator('.coin[data-dv-step="3"] .dvdelta')).toHaveCount(1);
 await page.screenshot({path:testInfo.outputPath('shared-coins-full.png')});

 // Stepping lights exactly the coin of the current step, not a sibling on the edge.
 await root.locator('button.schip[data-step-source="2"]').click();
 await expect(root.locator('.coin.lit')).toHaveCount(1);await expect(root.locator('.coin.lit')).toHaveAttribute('data-dv-step','2');
 await root.locator('button.schip[data-step-source="3"]').click();await expect(root.locator('.coin.lit')).toHaveAttribute('data-dv-step','3');

 // A view that hides beat2 renumbers and re-packs the remaining two coins.
 await root.getByRole('button',{name:'Brief',exact:true}).click();
 await expect(root.locator('.coin[data-dv-step="2"]')).toHaveClass(/view-step-hidden/);
 const brief=await expectRow(root,[[0,'1'],[3,'3']]);
 const centre=c=>c.box.x+c.box.width/2,fullMid=centre(full[1]);
 expect(Math.abs((centre(brief[0])+centre(brief[1]))/2-fullMid)).toBeLessThan(1.5);
 await page.screenshot({path:testInfo.outputPath('shared-coins-brief.png')});

 // Back to the full view, then a path whose three steps all start on the shared edge.
 await root.getByRole('button',{name:'Full',exact:true}).click();
 await expectRow(root,[[0,'1'],[2,'3'],[3,'4']]);
 await root.locator('.path-chip[data-dv-path="hub"]').click();
 await expectRow(root,[[0,'1'],[2,'2'],[3,'3']]);
 await expect(root.locator('.coin[data-dv-coin-edge="1"]')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('shared-coins-path.png')});
});
