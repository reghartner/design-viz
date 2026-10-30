import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

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

 // On another path, coins renumber; the card and Enter follow that path.
 await root.locator('.path-chip[data-dv-path="hub"]').click();
 await expect(coin(1)).toHaveClass(/view-step-hidden/);
 await expect(coin(1)).not.toHaveAttribute('tabindex',/.*/);
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
