/* #1293: Refresh now in the Live status panel's Metrics controls.
| row | fixture | assertion | rejects |
|---|---|---|---|
| N1 | the proof board with a held host telemetry provider and a page clock | Refresh now (accessible name "Refresh metrics now", recycle icon, 24 px target, visible focus ring) is beside the Metrics overlay switch only while Metrics is on; Enter calls the provider once, the button is aria-busy and aria-disabled with "Refreshing…" in its tooltip and the Metrics line, a second Enter calls nothing; after the answer the tooltip names the 60 s cooldown and its reason, and after it "Refresh now (last updated …)" | a control outside the panel, a click that queues, or a cooldown with no reason |
| N2 | the same board | the button is hidden while Metrics is off and in Over time; at phone width it stays inside the panel | a refresh control that calls with Metrics off or for a past day |
*/
import {test,expect} from '../helpers/test.mjs';
import {setup} from '../helpers/telemetry-proof.mjs';
const T=Date.UTC(2026,10,4,12);
const metrics=root=>root.getByRole('switch',{name:'Metrics overlay',exact:true});
const refresh=root=>root.getByRole('button',{name:'Refresh metrics now',exact:true});
const release=page=>page.evaluate(()=>{const next=window.liveReleases.shift();if(next)next();});
const live=page=>page.evaluate(()=>window.calls.live.length);
test('N1 Refresh now calls once, shows its busy state, ignores repeats and explains its cooldown',async({page,server})=>{
 await page.clock.install({time:T});
 const root=await setup(page,server,{pending:true}),panel=root.locator('.pt-live-status');
 await expect(refresh(root)).toBeHidden();
 await metrics(root).click();await expect.poll(()=>live(page)).toBe(1);await release(page);
 const button=refresh(panel);await expect(button).toBeVisible();
 // Next to the Metrics overlay switch, in the panel header.
 expect(await button.evaluate(el=>el.closest('.dv-status-top')!==null && el.previousElementSibling?.classList.contains('dv-live-metrics'))).toBe(true);
 await expect(button.locator('svg')).toHaveCount(1);
 const box=await button.boundingBox();expect(box.width).toBeGreaterThanOrEqual(24);expect(box.height).toBeGreaterThanOrEqual(24);
 // Within 60 s of the first call the click calls nothing and names the cooldown.
 await button.focus();await page.keyboard.press('Enter');expect(await live(page)).toBe(1);
 await expect(button).toHaveAttribute('aria-disabled','true');await expect(button).toHaveAttribute('title',/Refresh now is available again at .+ · Honeycomb allows 10 query results a minute/);
 await page.clock.fastForward(61000);
 await expect(button).not.toHaveAttribute('aria-disabled','true');await expect(button).toHaveAttribute('title',/^Refresh now \(last updated .+\)$/);
 // Keyboard: the focus ring shows and Enter refreshes.
 await button.focus();expect(await button.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Enter');await expect.poll(()=>live(page)).toBe(2);
 await expect(button).toHaveAttribute('aria-busy','true');await expect(button).toHaveAttribute('aria-disabled','true');await expect(button).toHaveAttribute('title','Refreshing…');
 await expect(panel.locator('.dv-live-metrics-connection').first()).toContainText('Refreshing…');
 await expect(button).toBeFocused();await page.keyboard.press('Enter');await page.keyboard.press(' ');expect(await live(page)).toBe(2);
 await release(page);
 await expect(button).not.toHaveAttribute('aria-busy','true');await expect(button).toHaveAttribute('aria-disabled','true');
 await expect(button).toHaveAttribute('title',/Refresh now is available again at .+ · Honeycomb allows 10 query results a minute/);
 await expect(panel.locator('.dv-live-metrics-connection').first()).not.toContainText('Refreshing…');
 await page.clock.fastForward(61000);await expect(button).not.toHaveAttribute('aria-disabled','true');await expect(button).toHaveAttribute('title',/^Refresh now \(last updated .+\)$/);
 await page.keyboard.press('Space');await expect.poll(()=>live(page)).toBe(3);await release(page);
});
test('N2 Refresh now is hidden with Metrics off and in Over time, and stays inside the panel at phone width',async({page,server})=>{
 await page.clock.install({time:T});
 const root=await setup(page,server,{pending:true}),panel=root.locator('.pt-live-status');
 await metrics(root).click();await expect.poll(()=>live(page)).toBe(1);await release(page);await expect(refresh(panel)).toBeVisible();
 await root.getByRole('button',{name:'Over time',exact:true}).click();await expect(refresh(panel)).toBeHidden();
 await root.getByRole('button',{name:'Live',exact:true}).click();await expect(refresh(panel)).toBeVisible();
 await metrics(root).click();await expect(refresh(panel)).toBeHidden();
 await metrics(root).click();await expect(refresh(panel)).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const inside=await refresh(panel).evaluate(el=>{const b=el.getBoundingClientRect(),p=el.closest('.pt-live-status').getBoundingClientRect();return b.left>=p.left-1 && b.right<=p.right+1 && b.right<=window.innerWidth+1;});
 expect(inside).toBe(true);
});
