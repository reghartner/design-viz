import {writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import C from '../../canon/core.cjs';

// A board coin is a step button in the reader (#836): a short hover or
// keyboard focus shows the step's number, lane, route and text; a click or
// Enter goes to that step like the matching step-bar button. Coin numbers
// follow the selected path, so the card and the target do too.
const raw={page:{title:'Coin navigation',sections:[{id:'beats',heading:'Heartbeats',diagram:{view:'ambient',autoplay:false,
 nodes:{hub:{title:'Hub'},cloud:{title:'Cloud'},app:{title:'App'}},rows:[['hub','cloud','app']],
 edges:[{from:'hub',to:'cloud',label:'heartbeat'},{from:'cloud',to:'app'}],
 steps:[{id:'beat1',edge:'hub->cloud',lane:'NET',text:'First heartbeat.'},{id:'relay',edge:'cloud->app',text:'Cloud relays `status`.'},
  {id:'beat2',edge:'hub->cloud',lane:'NET',text:'Second heartbeat.'},{id:'beat3',edge:'hub->cloud',text:'Third heartbeat.'}],
 paths:[{id:'all',label:'All beats',steps:['beat1','relay','beat2','beat3']},{id:'hub',label:'Hub only',steps:['beat1','beat2','beat3']}]}}]}};

test('a board coin shows its step after a hover delay and goes to that step on click or Enter',async({page,server})=>{
 await writeFile(path.join(server.root,'coin-nav.json'),JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'coin-nav.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'coin-nav.html')]);
 await page.goto(server.origin+'/coin-nav.html');const root=page.locator('.docview');
 const coin=source=>root.locator('g.coin[data-dv-step="'+source+'"]'),card=page.locator('.step-coin-card');
 const caption=root.locator('.step-text'),current=root.locator('button.schip[aria-current="true"]');

 await expect(coin(1)).toHaveAttribute('role','button');
 await expect(coin(1)).toHaveAttribute('tabindex','0');
 await expect(coin(1)).toHaveAttribute('aria-label','Go to step 2: Cloud relays status.');

 // The card waits for the hover delay, then names the step and its route.
 await coin(1).hover();
 await page.waitForTimeout(150);
 await expect(card).toBeHidden();
 await expect(card).toBeVisible();
 await expect(card.locator('.step-coin-card-label')).toHaveText('Step 2 · Cloud → App');
 await expect(card.locator('.step-coin-card-text')).toHaveText('Cloud relays status.');
 await expect(card.locator('.step-coin-card-text code')).toHaveText('status');
 await expect(card.locator('.step-coin-card-hint')).toHaveText('Click to go to this step');
 await expect(coin(1)).toHaveAttribute('aria-describedby',await card.getAttribute('id'));
 const cardBox=await card.boundingBox(),boardBox=await root.locator('.board').first().boundingBox();
 expect(cardBox.x).toBeGreaterThanOrEqual(boardBox.x);expect(cardBox.y).toBeGreaterThanOrEqual(boardBox.y);
 expect(cardBox.x+cardBox.width).toBeLessThanOrEqual(boardBox.x+boardBox.width);
 expect(cardBox.y+cardBox.height).toBeLessThanOrEqual(boardBox.y+boardBox.height);

 // Clicking from the ambient view enters step view at that step.
 await coin(1).click();
 await expect(card).toBeHidden();
 await expect(current).toHaveText('2');
 await expect(caption).toHaveText('Cloud relays status.');
 await expect(root.locator('.coin.lit')).toHaveAttribute('data-dv-step','1');

 // Leaving a coin before the delay never shows a card.
 await coin(2).hover();await page.mouse.move(2,2);
 await page.waitForTimeout(600);
 await expect(card).toBeHidden();

 // An open card closes when another control is pressed, here a path chip;
 // on that path coins renumber and the card and Enter follow it.
 await coin(2).hover();
 await expect(card.locator('.step-coin-card-label')).toHaveText('Step 3 · NET · Hub → Cloud');
 await root.locator('.path-chip[data-dv-path="hub"]').click();
 await expect(card).toBeHidden();
 // This path never uses cloud->app, so its board has no coin for that step.
 await expect(coin(1)).toHaveCount(0);
 await coin(2).hover();
 await expect(card.locator('.step-coin-card-label')).toHaveText('Step 2 · NET · Hub → Cloud');
 await page.mouse.move(2,2);await expect(card).toBeHidden();
 await coin(3).focus();
 await page.keyboard.press('Enter');
 await expect(current).toHaveText('3');
 await expect(caption).toHaveText('Third heartbeat.');
 await expect(root.locator('.coin.lit')).toHaveAttribute('data-dv-step','3');
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
 await expect(card.locator('.step-coin-card-label')).toHaveText('Step 3 · Hub → Cloud');
 await page.keyboard.press('Escape');
 await expect(card).toBeHidden();
});

for(const [origin,surface] of [['local','standalone'],['nested imported','standalone'],['nested imported','native']])test(`${surface} ${origin} coin previews bound long prose, blocks, tokens and metadata without shortening the full step`,async({page,server},info)=>{
 const bodies=[
  '**Preview** with `status` and **'+('large paragraph '.repeat(80))+'** FULL STEP END',
  Array.from({length:35},(_,i)=>'Paragraph '+i+'.').join('\n\n')+' FULL STEP END',
  '🚀'.repeat(500)+' FULL STEP END',
  '- **First item**\n- Second item\n\n```text\n'+('a line of code\n'.repeat(50))+'```\nFULL STEP END'
 ];
 const model=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 let fixture=model('preview',{view:'ambient',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]});
 let edge='a->b';
 if(origin==='nested imported'){
  const provider=model('provider',{nodes:{a:{title:'Imported source'},b:{title:'Imported destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
  const middle=model('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{core:{nodes:['inner::a','inner::b'],edges:['inner::a->inner::b']}}});
  fixture=model('preview',{view:'ambient',autoplay:false,nodes:{},rows:[[]],topologyImports:[{spec:'middle',export:'core',as:'outer'}]});
  edge='outer::inner::a->outer::inner::b';
  fixture=C.materializeTopology([provider,middle,fixture])[2];
 }
 fixture.page.sections[0].diagram.steps=bodies.map((text,i)=>({id:'preview-'+i,edge,text,lane:'Long lane metadata '.repeat(30)}));
 await writeFile(path.join(server.root,'coin-preview.json'),JSON.stringify(fixture));
 if(surface==='native'){
  await copyFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js'),path.join(server.root,'coin-native.js'));
  await writeFile(path.join(server.root,'coin-preview.html'),'<html><body style="margin:0"><div id="mount"></div><script type="module">import {mountNativeViewer} from "./coin-native.js";const spec=await (await fetch("./coin-preview.json")).json();window.viewer=mountNativeViewer(document.getElementById("mount"),spec);</script></body></html>');
 }else execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'coin-preview.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'coin-preview.html')]);
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(server.origin+'/coin-preview.html');
 const root=page.locator('.docview'),card=page.locator('.step-coin-card'),preview=card.locator('.step-coin-card-text');
 for(let i=0;i<bodies.length;i++){
  const coin=root.locator('g.coin[data-dv-step="'+i+'"]');
  await coin.hover();await expect(card).toBeVisible();
  const text=await preview.textContent();
  expect(Array.from(text).length).toBeLessThanOrEqual(241);expect(text).toMatch(/…$/);expect(text).not.toContain('FULL STEP END');
  await expect(card.locator('.step-coin-card-hint')).toHaveText('Click to view full step');
  expect(Array.from(await card.locator('.step-coin-card-label').textContent()).length).toBeLessThanOrEqual(161);
  const dimensions=await preview.evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),width:el.getBoundingClientRect().width,scroll:el.scrollWidth}));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.line*4+1);expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+1);
  const box=await card.boundingBox();expect(box.width).toBeLessThanOrEqual(300);expect(box.height).toBeLessThan(160);
  if(i===0){
   await expect(preview.locator('strong').first()).toHaveText('Preview');await expect(preview.locator('code')).toHaveText('status');
   await page.screenshot({path:info.outputPath('compact-step-preview.png')});
  }
  await coin.click();await expect(card).toBeHidden();
  await expect(root.locator('.step-text')).toContainText('FULL STEP END');
  expect((await root.locator('.step-text').textContent()).length).toBeGreaterThan(text.length);
 }
});
