import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {digest} from '../../canon/drift.mjs';

// Authors drag a step circle ("coin") to place it; the offset from the edge
// midpoint is saved on the step as coinOffsets["from->to"]. Workbench editing
// is desktop-only, so every gesture here is a mouse gesture at desktop size.
const diagram=raw=>raw.page.sections[0].diagram;
const source=page=>page.locator('#src').inputValue();
const coin=(root,step)=>root.locator('g.coin[data-dv-step="'+step+'"]');
const offsets=async(page,step)=>diagram(JSON.parse(await source(page))).steps[step].coinOffsets;
async function history(page,before,after){
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
}
async function centre(locator){const box=await locator.locator('circle').first().boundingBox();expect(box).not.toBeNull();return {x:box.x+box.width/2,y:box.y+box.height/2};}
async function dragBy(page,locator,dx,dy){
 const at=await centre(locator);
 await page.mouse.move(at.x,at.y);await page.mouse.down();
 await page.mouse.move(at.x+dx,at.y+dy,{steps:12});await page.mouse.up();
}
const menu=page=>page.getByRole('menu',{name:'Step circle actions'});
const resetItem=page=>menu(page).getByRole('menuitem',{name:/^Reset to automatic position/});

// Three steps share hub->cloud; the Brief view hides beat2 so the automatic
// coins re-pack. beat3 is placed by the author and must not move.
const composition={default:[{x:0,y:0,w:12,h:20},{controls:'steps',attachTo:'diagram',x:0,y:20,w:12,h:8}]};
const placed={page:{title:'Placed coins',sections:[{id:'beats',heading:'Heartbeats',diagram:{view:'step',autoplay:false,
 nodes:{hub:{title:'Hub'},cloud:{title:'Cloud'}},rows:[['hub','cloud']],edges:[{from:'hub',to:'cloud',label:'heartbeat'}],
 steps:[{id:'beat1',edge:'hub->cloud',text:'First.'},{id:'beat2',edge:'hub->cloud',text:'Second.'},
  {id:'beat3',edge:'hub->cloud',text:'Third, placed above.',coinOffsets:{'hub->cloud':{dx:0,dy:-70}}}],
 layouts:[{id:'full',name:'Full',sectionLayout:composition},{id:'brief',name:'Brief',steps:['beat1','beat3'],sectionLayout:composition}],defaultLayout:'full'}}]}};

test('the reader draws a placed coin at its saved offset and view re-packing leaves it there',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'placed-coins.json'),JSON.stringify(placed));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'placed-coins.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'placed-coins.html')]);
 await page.goto(server.origin+'/placed-coins.html');const root=page.locator('.docview');
 await expect(root.locator('g.coin')).toHaveCount(3);
 await expect(coin(root,2)).toHaveAttribute('transform','translate(0.00 -70.00)');
 await expect(coin(root,2)).toHaveClass(/coin-placed/);
 // The two automatic coins share the row on the edge around the midpoint.
 await expect(coin(root,0)).toHaveAttribute('transform','translate(-15.00 0.00)');
 await expect(coin(root,1)).toHaveAttribute('transform','translate(15.00 0.00)');
 await page.screenshot({path:testInfo.outputPath('placed-coins-full.png')});
 await root.getByRole('button',{name:'Brief',exact:true}).click();
 await expect(coin(root,1)).toHaveClass(/view-step-hidden/);
 // The lone automatic coin returns to the midpoint; the placed coin does not move.
 await expect(coin(root,0)).not.toHaveAttribute('transform',/./);
 await expect(coin(root,2)).toHaveAttribute('transform','translate(0.00 -70.00)');
 await page.screenshot({path:testInfo.outputPath('placed-coins-brief.png')});
});

const local={page:{title:'Coin drag',sections:[{id:'beats',heading:'Heartbeats',diagram:{view:'step',autoplay:false,
 nodes:{hub:{title:'Hub'},cloud:{title:'Cloud'}},rows:[['hub','cloud']],edges:[{from:'hub',to:'cloud'}],
 steps:[{id:'beat1',edge:'hub->cloud',text:'First.'},{id:'beat2',edge:'hub->cloud',text:'Second.'}]}}]}};

test('Workbench drags a step circle to a saved offset, keeps a press as step selection, and resets from the menu and Inspector',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(local,null,2));await closeTools(page);
 const root=page.locator('#docview'),original=await source(page);
 await expect(root.locator('g.coin')).toHaveCount(2);

 // A press without movement still selects the step and writes nothing.
 const at=await centre(coin(root,1));await page.mouse.move(at.x,at.y);await page.mouse.down();await page.mouse.up();
 await expect(coin(root,1)).toHaveClass(/dv-sel/);expect(await source(page)).toBe(original);

 // An unmoved circle offers reset only as a disabled reason.
 await coin(root,1).locator('circle').first().click({button:'right'});
 await expect(resetItem(page)).toHaveAttribute('aria-disabled','true');
 await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);

 // Drag beat2 up; the saved offset re-renders exactly, and beat1 now sits
 // alone at the midpoint because a placed coin takes no automatic slot.
 await dragBy(page,coin(root,1),20,-90);
 await expect.poll(()=>offsets(page,1)).toBeTruthy();
 const saved=(await offsets(page,1))['hub->cloud'];
 expect(Number.isInteger(saved.dx) && Number.isInteger(saved.dy)).toBe(true);
 expect(saved.dy).toBeLessThan(-30);expect(saved.dx).toBeGreaterThan(0);
 expect(Object.keys(await offsets(page,1))).toEqual(['hub->cloud']);
 expect(await offsets(page,0)).toBeUndefined();
 await expect(coin(root,1)).toHaveAttribute('transform','translate('+saved.dx.toFixed(2)+' '+saved.dy.toFixed(2)+')');
 await expect(coin(root,0)).not.toHaveAttribute('transform',/./);
 await expect(coin(root,1)).toHaveClass(/dv-sel/);
 const moved=await source(page);await history(page,original,moved);
 await page.screenshot({path:testInfo.outputPath('coin-dragged.png')});

 // Right-click reset returns it to the automatic row; Undo restores the placement.
 await coin(root,1).locator('circle').first().click({button:'right'});
 await expect(resetItem(page)).not.toHaveAttribute('aria-disabled','true');await resetItem(page).click();
 await expect.poll(()=>offsets(page,1)).toBeUndefined();
 await expect(coin(root,1)).toHaveAttribute('transform','translate(15.00 0.00)');
 await history(page,moved,await source(page));
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);

 // The Inspector button resets the selected step's circle too.
 await coin(root,1).locator('circle').first().click();
 if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
 const button=page.getByRole('button',{name:'Reset step circle to automatic position',exact:true});
 await expect(button).toBeEnabled();await button.click();
 await expect.poll(()=>offsets(page,1)).toBeUndefined();
 await expect(page.getByRole('button',{name:'Reset step circle to automatic position',exact:true})).toBeDisabled();
 await history(page,moved,await source(page));
});

// A step on an imported connection: the coin drags and resets like a local
// one, and the offset is saved on the consumer's step, never on the provider.
async function topologyFixture(page,server){
 const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
 const provider=model('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=model('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared'}],
  edges:[{from:'local',to:'shared::api',label:'Request'}],steps:[{id:'request',edge:'local->shared::api',text:'Request'},{id:'persist',edge:'shared::api->shared::store',text:'Persist'}],view:'step',autoplay:false});
 const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
 await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
 for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.goto(server.origin+'/workbench.html');
 await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
 await expect(page.locator('#docview g.node[data-dv-node="shared::api"]')).toBeVisible();await closeTools(page);
}

test('a circle on an imported connection drags and resets on the consumer step',async({page,server},testInfo)=>{
 await topologyFixture(page,server);
 const root=page.locator('#docview'),imported=root.locator('g.coin[data-dv-coin-key="shared::api->shared::store"]');
 await expect(imported).toHaveCount(1);await expect(imported).toHaveAttribute('data-dv-step','1');
 const original=await source(page),imports=diagram(JSON.parse(original)).topologyImports;
 await dragBy(page,imported,0,80);
 await expect.poll(()=>offsets(page,1)).toBeTruthy();
 const saved=(await offsets(page,1))['shared::api->shared::store'];expect(saved.dy).toBeGreaterThan(30);
 expect(diagram(JSON.parse(await source(page))).topologyImports).toEqual(imports);
 await expect(imported).toHaveAttribute('transform','translate('+saved.dx.toFixed(2)+' '+saved.dy.toFixed(2)+')');
 const moved=await source(page);await history(page,original,moved);
 await page.screenshot({path:testInfo.outputPath('imported-coin-dragged.png')});
 await imported.locator('circle').first().click({button:'right'});await resetItem(page).click();
 await expect.poll(()=>offsets(page,1)).toBeUndefined();
 expect(diagram(JSON.parse(await source(page)))).toEqual(diagram(JSON.parse(original)));
});
