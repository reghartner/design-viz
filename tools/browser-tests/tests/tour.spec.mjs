import {test,expect} from '../helpers/test.mjs';

// The guided tour's own contracts: start gating, fail-open scrim behavior,
// and deep-link preservation. The harness seeds dv_tour_v1=done for every
// context, so the quiet cases below also prove the seed works; #tour=1
// overrides the flag by design.

test('seeded completion flag keeps the tour off and controls clickable',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html');
  await expect(page.locator('.dv-tour-replay')).toHaveAttribute('aria-label','Replay the tour');
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  const chip=page.locator('.schip').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-current','true');
});

test('#tour=0 suppresses auto-start even without the flag',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=0');
  await expect(page.locator('.dv-tour-replay')).toBeVisible();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
});

test('a deep link defers the tour to the ? pill',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#m=step&s=2');
  await expect(page.locator('.dv-tour-replay')).toBeVisible();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
});

test('#tour=1 forces the tour; finishing restores state and unblocks the page',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html#m=step&s=2');
  await expect(page.locator('.schip[aria-current=true]').first()).toHaveText('2');
  // The deep-link channel canonicalizes the fragment at load (explicit d=);
  // THAT form must survive the tour untouched.
  const hash=new URL(page.url()).hash;
  expect(hash).toContain('m=step');
  // Force the tour over the deep-linked state via the pill (same code path
  // as #tour=1's start; the fragment must survive the whole tour).
  await page.locator('.dv-tour-replay').click();
  const overlay=page.locator('.dv-tour');
  await expect(overlay).toBeVisible();
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  await page.locator('.dv-tour-choice').nth(2).click(); // Show me both
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  // Walk to the end with Next/Done, bounded to the config's step count.
  for(let i=0;i<8;i++){
    const label=await page.locator('.dv-tour-next').textContent();
    await page.locator('.dv-tour-next').click();
    if(label==='Done')break;
  }
  await expect(overlay).toBeHidden();
  // Deep-linked state survives the tour: fragment untouched, step restored.
  expect(new URL(page.url()).hash).toBe(hash);
  await expect(page.locator('.schip[aria-current=true]').first()).toHaveText('2');
  // And the scrim no longer intercepts clicks.
  const chip=page.locator('.schip').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-current','true');
});

test('#tour=1 auto-starts over a fresh profile',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  await expect(page.locator('.dv-tour')).toBeVisible();
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
});

test('state-aware probing keeps the ambient-hidden transport step; reduced motion demo points at the arrows',async({page,server})=>{
  await page.goto(server.origin+'/tour-ambient.html#tour=1');
  // No chooser in this override: the tour opens straight on step 1, whose
  // transport only renders once the step's own mode:"step" is applied.
  await expect(page.locator('.dv-tour-heading')).toHaveText('Play the story');
  await expect(page.locator('.dv-tour-ring')).toBeVisible();
  await page.locator('.dv-tour-next').click();
  // The suite emulates prefers-reduced-motion, so the demo step must NOT
  // auto-advance: it spotlights the transport and names the step arrows.
  await expect(page.locator('.dv-tour-heading')).toHaveText('The panels tell the story');
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Two');
  await expect(page.locator('.dv-tour-body')).toContainText('step arrows');
  const chip=page.locator('.tabpanel:not([hidden]) .schip[aria-current=true]');
  await page.waitForTimeout(1500);
  await expect(chip).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
});

test.describe('with motion allowed',()=>{
  test.use({reducedMotion:'no-preference'});
  test('the demo rewinds, advances on its interval, and stops on page interaction',async({page,server})=>{
    await page.goto(server.origin+'/tour-ambient.html#tour=1');
    await expect(page.locator('.dv-tour-heading')).toHaveText('Play the story');
    await page.locator('.dv-tour-next').click();
    await expect(page.locator('.dv-tour-heading')).toHaveText('The panels tell the story');
    await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Two');
    await expect(page.locator('.dv-tour-ring')).toBeVisible();
    const chip=page.locator('.tabpanel:not([hidden]) .schip[aria-current=true]');
    // The demo rewinds to the first stop and advances on its interval.
    await expect(chip).toHaveText('2',{timeout:4000});
    // Interacting with the page through the hole stops the demo where it is.
    await page.locator('.tabpanel:not([hidden]) .pwidget').first().click();
    const frozen=await chip.textContent();
    await page.waitForTimeout(1500);
    await expect(chip).toHaveText(frozen);
    await page.keyboard.press('Escape');
    await expect(page.locator('.dv-tour')).toBeHidden();
  });
});

test('replaying from a non-first tab still resolves first-tab steps',async({page,server})=>{
  await page.goto(server.origin+'/tour-ambient.html');
  await expect(page.locator('.dv-tour')).toHaveCount(0); // seeded done
  await page.locator('.tabbtn').nth(1).click();
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Two');
  await page.locator('.dv-tour-replay').click();
  await expect(page.locator('.dv-tour-heading')).toHaveText('Play the story');
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('One');
  await page.keyboard.press('Escape');
  // Skip restores the pre-tour snapshot: back on tab Two.
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Two');
});

test('an internal render error tears the tour down and leaves the page usable',async({page,server})=>{
  await page.goto(server.origin+'/tour-ambient.html'); // seeded done: no tour
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  // Force a genuine throw inside the tour's own render path: the first
  // measurement of the spotlit transport throws once (the trap restores
  // itself immediately, so the engine is untouched afterwards). The bundle
  // is an IIFE, so DOM prototypes are the only reachable seam.
  await page.evaluate(()=>{
    const orig=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(){
      if(this.classList&&this.classList.contains('step-transport')){
        Element.prototype.getBoundingClientRect=orig;
        throw new Error('boom');
      }
      return orig.apply(this,arguments);
    };
  });
  await page.locator('.dv-tour-replay').click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.doc-title')).toBeVisible();
  // Tab 1 opens in ambient mode (no step chips): prove the page is usable
  // by switching tabs and stepping the second diagram.
  await page.locator('.tabbtn').nth(1).click();
  const chip=page.locator('.tabpanel:not([hidden]) .schip').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-current','true');
});

test('a malformed page.tour fails open: page renders, no stuck scrim',async({page,server})=>{
  // copy.choices as a string used to throw during render and leave the
  // scrim over the page with no buttons. The lint warns; the renderer must
  // still produce a usable chooser (fallback button) — and any tour error
  // tears the overlay down.
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/tour-bad.html#tour=1');
  await expect(page.locator('.doc-title')).toBeVisible();
  const overlay=page.locator('.dv-tour');
  if(await overlay.isVisible()){
    // fallback chooser rendered: one usable button, and Escape dismisses
    await expect(page.locator('.dv-tour-choice')).toHaveCount(1);
    await page.keyboard.press('Escape');
  }
  await expect(overlay).toBeHidden();
  const chip=page.locator('.schip').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-current','true');
});
