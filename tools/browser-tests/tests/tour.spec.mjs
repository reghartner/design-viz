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

test('a missing target warns and passes through, keeping the authored count',async({page,server})=>{
  // chime-radar has no bindings, paths or view choices: for the eng track
  // the branching and links steps are authoring misses on this page — the
  // tour must name them in the console and walk straight past them.
  const warnings=[];
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  await page.locator('.dv-tour-choice').nth(1).click(); // The engineering
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  // eng track opens on the mode pair: the map (AMBIENT really on) ...
  await expect(heading).toHaveText('The big picture');
  await expect(page.locator('.mtoggle .mbtn[aria-pressed=true]').first()).toHaveText('AMBIENT');
  // hole+ring share one clip-path shape: outer rect + one hole subpath
  // the reveal lands after settle: the mask gains its hole rects
  await expect.poll(()=>page.evaluate(()=>document.querySelectorAll('.dv-tour-dim mask rect[fill="#000"]').length)).toBeGreaterThanOrEqual(1);
  // the map is SHOWN: points inside the revealed board AND inside the
  // ringed toggle (a hole nested in the board hole) hit the page, not the
  // scrim — nested holes must not cancel under even-odd filling
  const centers=await page.evaluate(()=>['.board','.mtoggle'].map(s=>{
    const r=document.querySelector('.doc-sec '+s).getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,60)};}));
  await expect.poll(()=>page.evaluate(pts=>pts.every(({x,y})=>!document.elementFromPoint(x,y).closest('.dv-tour-scrim')),centers)).toBe(true);
  await page.locator('.dv-tour-next').click();
  // ... then the sequence, with PRESENT as its one ringed secondary — and
  // the secondary sits on its own un-dimmed hole (a third subpath).
  await expect(heading).toHaveText('One call at a time');
  // every ring — primary and each visible secondary — sits on an un-dimmed
  // hole, and so does the revealed board: their centres hit the page, not
  // the scrim (holes may merge, so hit-testing is the contract, not counts)
  await expect.poll(()=>page.evaluate(()=>{
    const pts=[...document.querySelectorAll('.dv-tour-ring, .dv-tour-ring2')]
      .filter(e=>!e.hidden).map(e=>e.getBoundingClientRect());
    pts.push(document.querySelector('.doc-sec .board').getBoundingClientRect());
    return pts.every(r=>{
      const y=Math.min(r.y+r.height/2,innerHeight-2);
      return !document.elementFromPoint(r.x+r.width/2,y).closest('.dv-tour-scrim');
    });
  })).toBe(true);
  // a secondary not fully in view renders neither ring, hole nor note
  expect(await page.locator('.dv-tour-note').count()).toBeLessThanOrEqual(await page.locator('.dv-tour-ring2').count());
  for(const box of await page.locator('.dv-tour-ring2').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom,innerHeight];})))
    expect(box[0]>=0&&box[1]<=box[2]).toBe(true);
  await page.locator('.dv-tour-next').click();
  // Both branching steps have no .path-timeline here: they warn and pass
  // through to the links step (chime-radar does render node links).
  await expect(heading).toHaveText('Nodes link to the real system');
  // pathless page: both branching steps name the unresolved @alt token
  expect(warnings.filter(w=>w.includes('branching')&&w.includes('path "@alt" did not resolve')).length).toBeGreaterThanOrEqual(2);
  // The links step CLICKED the ⋯ trigger (after its cause-before-effect
  // hold): the real menu opens and is the spotlit target; leaving closes it.
  await expect(page.locator('.node-link-menu:not([hidden])')).toBeVisible();
  // exact union, no bounding-rect strip: a point inside the old bounding
  // rect of (trigger ring ∪ menu ring) but inside NEITHER ring is dimmed
  // and click-blocked
  await expect.poll(async()=>(await page.locator('.dv-tour-ring2').count())).toBeGreaterThanOrEqual(1);
  const probe=await page.evaluate(()=>{
    const a=document.querySelector('.dv-tour-ring').getBoundingClientRect();
    const b=document.querySelector('.dv-tour-ring2').getBoundingClientRect();
    const inside=(r,x,y)=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
    const L=Math.min(a.left,b.left),T=Math.min(a.top,b.top),R=Math.max(a.right,b.right),B=Math.max(a.bottom,b.bottom);
    for(let y=T+2;y<B;y+=3)for(let x=L+2;x<R;x+=3)
      if(!inside(a,x,y)&&!inside(b,x,y)){
        const hit=document.elementFromPoint(x,y);
        return {found:true,blocked:!!(hit&&hit.closest('.dv-tour-scrim'))};
      }
    return {found:false};
  });
  if(probe.found)expect(probe.blocked).toBe(true);
  await page.locator('.dv-tour-next').click();
  await expect(heading).toHaveText('Now try it');
  await expect(page.locator('.node-link-menu:not([hidden])')).toHaveCount(0);
  // The done card hands over: Done focuses the ▶ transport button.
  await page.locator('.dv-tour-next').click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  // focus lands in the transport (▶, or a step arrow under reduced motion)
  expect(await page.evaluate(()=>!!(document.activeElement&&document.activeElement.closest('.step-transport, .termbar')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
});

test('entering a step applies its authored state: ambient-hidden transport; reduced motion demo points at the arrows',async({page,server})=>{
  await page.goto(server.origin+'/tour-ambient.html#tour=1');
  // No chooser in this override: the tour opens straight on step 1, whose
  // transport only renders once the step's own mode:"step" is applied — at
  // entry, not by any pre-scan.
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
  test('the branching demos step through the split AND the rejoin, revealing the diagram',async({page,server})=>{
    await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
    await page.goto(server.origin+'/tour-paths.html#tour=1');
    await page.locator('.dv-tour-choice').nth(2).click(); // Show me both
    const heading=page.locator('.dv-tour-ui .dv-tour-heading');
    await expect(heading).toHaveText('The big picture');
    await page.locator('.dv-tour-next').click();
    await expect(heading).toHaveText('One call at a time');
    await page.locator('.dv-tour-next').click();
    await expect(heading).toHaveText('Flows can split');
    await expect(page.locator('.dv-tour-ring')).toBeVisible();
    // the diagram is revealed too: outer + timeline hole + board hole
    await expect.poll(()=>page.evaluate(()=>{
      const r=document.querySelector('.doc-sec .board').getBoundingClientRect();
      return !document.elementFromPoint(r.x+r.width/2,r.y+Math.min(r.height/2,60)).closest('.dv-tour-scrim');
    })).toBe(true);
    const current=page.locator('.schip[aria-current=true]');
    const first=await current.first().textContent();
    // one demo tick (1600ms) later the active step has moved
    await expect.poll(async()=>current.first().textContent(),{timeout:5000}).not.toBe(first);
    await page.locator('.dv-tour-next').click();
    // the rejoin half starts at the branch's own last step and walks into
    // the shared tail
    await expect(heading).toHaveText('And they come back together');
    const atRejoin=await current.first().textContent();
    await expect.poll(async()=>current.first().textContent(),{timeout:5000}).not.toBe(atRejoin);
    await page.keyboard.press('Escape');
    await expect(page.locator('.dv-tour')).toBeHidden();
  });

  test('an unresolvable @rejoin token SKIPS the step instead of mis-narrating',async({page,server})=>{
    const warnings=[];
    page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
    await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
    await page.goto(server.origin+'/tour-paths-reordered.html#tour=1');
    await page.locator('.dv-tour-choice').nth(2).click(); // Show me both
    const heading=page.locator('.dv-tour-ui .dv-tour-heading');
    await expect(heading).toHaveText('The big picture');
    await page.locator('.dv-tour-next').click();
    await expect(heading).toHaveText('One call at a time');
    await page.locator('.dv-tour-next').click();
    await expect(heading).toHaveText('Flows can split'); // @alt resolves
    await page.locator('.dv-tour-next').click();
    // @alt never rejoins here: the rejoin step must pass through, never
    // showing its copy over a non-rejoining path.
    await expect(heading).not.toHaveText('And they come back together');
    expect(warnings.some(w=>w.includes('branching-rejoin'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.dv-tour')).toBeHidden();
  });
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

test('overlapping cutouts never cancel: nested ring and target-inside-reveal stay un-dimmed',async({page,server})=>{
  await page.goto(server.origin+'/tour-nest.html#tour=1');
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  const hitsPage=sel=>page.evaluate(sel=>{
    const r=document.querySelector('.doc-sec '+sel).getBoundingClientRect();
    return !document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest('.dv-tour-scrim');
  },sel);
  // primary .step-transport + secondary play button nested inside it
  await expect(heading).toHaveText('Nested ring');
  await expect.poll(()=>hitsPage('.playback-button')).toBe(true);
  await expect.poll(()=>hitsPage('.step-transport')).toBe(true);
  await page.locator('.dv-tour-next').click();
  // target .board that is ALSO a reveal region
  await expect(heading).toHaveText('Target inside reveal');
  await expect.poll(()=>hitsPage('.board')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
});

test('Skip returns focus to where the reader was',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html');
  await page.locator('.dv-tour-replay').click();
  await expect(page.locator('.dv-tour')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.dv-tour-replay')).toBeFocused();
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
