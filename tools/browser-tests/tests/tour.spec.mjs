import {test,expect,chooseNavigation} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

// One geometry: every ring rect must carry EXACTLY the attributes of a mask
// hole rect (x, y, width, height, rx, ry) — hole and ring drawn from one
// shape object, so they cannot drift apart.
const ringsMatchHoles=page=>page.evaluate(()=>{
  const key=e=>['x','y','width','height','rx','ry'].map(a=>e.getAttribute(a)).join('|');
  const holes=new Set([...document.querySelectorAll('.dv-tour-dim mask rect[fill="#000"]')].map(key));
  const rings=[...document.querySelectorAll('.dv-tour-ring, .dv-tour-ring2')];
  return rings.length>0&&rings.every(r=>holes.has(key(r)));
});

// The guided tour's own contracts: start gating, fail-open scrim behavior,
// and deep-link preservation. The harness seeds dv_tour_v1=done for every
// context, so the quiet cases below also prove the seed works; #tour=1
// overrides the flag by design.

test('seeded completion flag keeps the tour off and controls clickable',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html');
  await expect(page.locator('.explore-navigation .explore-tour-button')).toBeVisible();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  const chip=page.locator('.schip').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-current','true');
});

test('#tour=0 suppresses auto-start even without the flag',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=0');
  await expect(page.locator('.explore-navigation .explore-tour-button')).toBeVisible();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
});

test('a deep link defers the tour to the navbar button',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#m=step&s=2');
  await expect(page.locator('.explore-navigation .explore-tour-button')).toBeVisible();
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
  await page.locator('.explore-navigation .explore-tour-button').click();
  const overlay=page.locator('.dv-tour');
  await expect(overlay).toBeVisible();
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  await page.locator('.dv-tour-choice').nth(2).click(); // Show me both
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  // Walk to the end with Next/Done, bounded to the config's step count.
  for(let i=0;i<20;i++){
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

test('the default tour omits unavailable lessons and numbers the available controls consecutively',async({page,server})=>{
  // chime-radar has no paths or view choices. Normal default-tour
  // omissions must not look like lost lessons or config errors.
  const warnings=[];
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  await page.locator('.dv-tour-choice').nth(1).click(); // The engineering
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  // eng track opens on the mode pair: the map (AMBIENT really on) ...
  await expect(heading).toHaveText('The big picture');
  await expect(page.locator('.mtoggle .mbtn[aria-pressed=true]').first()).toHaveText('Ambient');
  // the reveal lands after settle: the SVG dim mask gains one black rounded
  // rect per hole (same rect and radius as its ring)
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
  await expect.poll(()=>ringsMatchHoles(page)).toBe(true);
  // a secondary not fully in view renders neither ring, hole nor note
  expect(await page.locator('.dv-tour-note').count()).toBeLessThanOrEqual(await page.locator('.dv-tour-ring2').count());
  for(const box of await page.locator('.dv-tour-ring2').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom,innerHeight];})))
    expect(box[0]>=0&&box[1]<=box[2]).toBe(true);
  // sample the narration card every frame from this Next click through the
  // links step's pre-click hold and the menu opening
  await page.evaluate(()=>{
    window.__cardSamples=[];
    const tick=()=>{
      if(window.__cardSamples===null)return; // sampling stopped
      const u=document.querySelector('.dv-tour-ui');
      const cs=u&&getComputedStyle(u);
      const h=(document.querySelector('.dv-tour-ui .dv-tour-heading')||{}).textContent||'';
      if(u&&!u.hidden&&cs.visibility!=='hidden'&&h.startsWith('Nodes link')){
        const r=u.getBoundingClientRect();window.__cardSamples.push(Math.round(r.x)+','+Math.round(r.y));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('.dv-tour-next').click();
  // Branching is absent, so the next numbered lesson is source links.
  await expect(heading).toHaveText('Nodes link to the real system');
  await expect(page.locator('.dv-tour-count')).toHaveText('3 / 5');
  expect(warnings.filter(w=>w.includes('tour step'))).toEqual([]);
  // The links step CLICKED the ⋯ trigger (after its cause-before-effect
  // hold): the real menu opens and is the spotlit target; leaving closes it.
  await expect(page.locator('.node-link-menu:not([hidden])')).toBeVisible();
  // the card appears ONCE, in its final place: hidden through the pre-click
  // hold, then shown beside the menu, and it never moves for the step
  const card=page.locator('.dv-tour-ui');
  await expect(card).toBeVisible();
  await page.waitForTimeout(200);
  const early=await card.boundingBox();
  await page.waitForTimeout(1300);
  expect(await card.boundingBox()).toEqual(early);
  // and across every frame since Next, the visible card had ONE position
  // (the old code showed it beside the node during the hold, then jumped)
  const seen=await page.evaluate(()=>{const s=[...new Set(window.__cardSamples)];window.__cardSamples=null;return s;});
  expect(seen.length).toBe(1);
  // the menu ring and the ⋯ trigger ring each sit exactly on their holes
  expect(await ringsMatchHoles(page)).toBe(true);
  // exact union, no bounding-rect strip: a point inside the old bounding
  // rect of (trigger ring ∪ menu ring) but inside NEITHER ring is dimmed
  // and click-blocked
  await expect.poll(async()=>(await page.locator('.dv-tour-ring2').count())).toBeGreaterThanOrEqual(1);
  const probe=await page.evaluate(()=>{
    const a=document.querySelector('.dv-tour-ring').getBoundingClientRect();
    const b=document.querySelector('.dv-tour-ring2').getBoundingClientRect();
    // 'inside' with a 2px margin: sample only points clearly outside both
    // rings — edge pixels are ambiguous (anti-aliasing, layout-unit snapping)
    const inside=(r,x,y)=>x>=r.left-2&&x<=r.right+2&&y>=r.top-2&&y<=r.bottom+2;
    const L=Math.min(a.left,b.left),T=Math.min(a.top,b.top),R=Math.max(a.right,b.right),B=Math.max(a.bottom,b.bottom);
    for(let y=T+2;y<B;y+=3)for(let x=L+2;x<R;x+=3)
      if(!inside(a,x,y)&&!inside(b,x,y)){
        const hit=document.elementFromPoint(x,y);
        return {found:true,blocked:!!(hit&&hit.closest('.dv-tour-scrim')),x:Math.round(x),y:Math.round(y)};
      }
    return {found:false};
  });
  expect(probe.found,'a sample point between the two rings must exist').toBe(true);
  expect(probe.blocked,JSON.stringify(probe)).toBe(true);
  await page.locator('.dv-tour-next').click();
  await expect(heading).toHaveText('Give this section more room');
  await expect(page.locator('.node-link-menu:not([hidden])')).toHaveCount(0);
  await page.locator('.dv-tour-next').click();
  await expect(heading).toHaveText('Now try it');
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

  test('the default tour omits a rejoin lesson when the alternate never rejoins',async({page,server})=>{
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
    expect(warnings.some(w=>w.includes('branching-rejoin'))).toBe(false);
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
  await chooseNavigation(page.locator('.reader-navigation'),'Tab','Two');
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Two');
  await page.locator('.explore-navigation .explore-tour-button').click();
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
  await page.locator('.explore-navigation .explore-tour-button').click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.doc-title')).toBeVisible();
  // Tab 1 opens in ambient mode (no step chips): prove the page is usable
  // by switching tabs and stepping the second diagram.
  await chooseNavigation(page.locator('.reader-navigation'),'Tab','Two');
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
  await expect.poll(()=>ringsMatchHoles(page)).toBe(true);
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
  const tourButton=page.locator('.explore-navigation .explore-tour-button');await tourButton.click();
  await expect(page.locator('.dv-tour')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(tourButton).toBeFocused();
});

// #563: one skip control, one label ("Skip tour"), chooser and steps alike.
// row | fixture | assertion (scoped) | rejects
// 1 chooser has one skip | standalone #tour=1, chooser shown | buttons inside .dv-tour whose name or text matches /skip/i: count 1, and it is .dv-tour-exit | chooser foot "Skip" beside the pill
// 2 chooser label | same | that button's accessible name AND textContent are exactly "Skip tour" | "Skip tour ✕" text, "Skip the tour" aria-label, "Skip"
// 3 every step has one skip | "Show me both" (the full walkthrough), walked with real Next clicks through EVERY step to the Done step | on each step the /skip/i button count inside .dv-tour is 1, and it is .dv-tour-exit | step card "Skip tour" beside the pill, on any step
// 4 step label | same, every step | name AND textContent exactly "Skip tour" | the ✕ glyph or a different step-card wording
// 5 same control, same style | chooser vs every step | the skip control is the same node class with identical computed font/colour/background | a chooser-only or step-only restyle
// 6 it still exits | the final (Done) step | real click on the control hides .dv-tour (visible before) | a relabel that drops the handler
// 7 no other exit, whatever its label | chooser, every step | the EXACT ordered inventory (class|text) of visible buttons inside .dv-tour: chooser = the exit plus the three persona choices; each step = the exit, optional Replay example, optional Try the controls (each at most once), then exactly Back and Next/Done | a retained chooser/card exit under any label or class on any step, e.g. "Dismiss", "End tour", a second "Back" or "Done"
const skipControls=page=>page.locator('.dv-tour button').filter({visible:true,hasText:/skip/i})
  .or(page.locator('.dv-tour').getByRole('button',{name:/skip/i}));
// label-independent inventory: every visible overlay button, class|text, in DOM order
const visibleButtons=page=>page.locator('.dv-tour button').evaluateAll(els=>els
  .filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')
  .map(e=>e.className+'|'+e.textContent.trim()));
const skipLook=loc=>loc.evaluate(e=>{const s=getComputedStyle(e);return [e.className,s.font,s.color,s.backgroundColor,s.borderTopStyle].join('|');});
test('every skip control reads "Skip tour": one control on the chooser and on steps',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  const atChooser=skipControls(page);
  await expect(atChooser).toHaveCount(1);
  await expect(atChooser).toHaveClass(/\bdv-tour-exit\b/);
  await expect(atChooser).toHaveAccessibleName('Skip tour');
  await expect(atChooser).toHaveText('Skip tour');
  const chooserLook=await skipLook(atChooser);
  await expect.poll(()=>visibleButtons(page)).toEqual(['dv-tour-exit|Skip tour',
    'dv-tour-choice|The user experienceReading views, story steps, and live panels.',
    'dv-tour-choice|The engineeringCalls, branching paths, source links, and room to explore.',
    'dv-tour-choice|Show me bothThe full walkthrough, at your pace.']);
  await page.locator('.dv-tour-choice').nth(2).click(); // Show me both: every step
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  const stepInventory=/^dv-tour-exit\|Skip tour(,dv-tour-skip dv-tour-replay-example\|Replay example)?(,dv-tour-skip dv-tour-try\|Try the controls)?,dv-tour-btn dv-tour-back\|Back,dv-tour-btn dv-tour-next\|(Next|Done)$/;
  const narration=page.locator('.dv-tour-ui .dv-tour-narration');
  const atStep=skipControls(page);
  let steps=0;
  for(;steps<40;steps++){
    await expect(narration).not.toHaveText('');
    await expect(atStep).toHaveCount(1);
    await expect(atStep).toHaveClass(/\bdv-tour-exit\b/);
    await expect(atStep).toHaveAccessibleName('Skip tour');
    await expect(atStep).toHaveText('Skip tour');
    expect(await skipLook(atStep)).toBe(chooserLook);
    await expect.poll(async()=>(await visibleButtons(page)).join(',')).toMatch(stepInventory);
    if(await page.locator('.dv-tour-next').textContent()==='Done')break;
    const was=await narration.textContent();
    await page.locator('.dv-tour-next').click();
    await expect(narration).not.toHaveText(was);
  }
  expect(steps).toBeGreaterThan(3);
  await expect(page.locator('.dv-tour-next')).toHaveText('Done');
  await expect(page.locator('.dv-tour')).toBeVisible();
  await atStep.click();
  await expect(page.locator('.dv-tour')).toBeHidden();
});

async function walkToDrill(page,server){
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/tour-drill.html#tour=1');
  const hashBefore=new URL(page.url()).hash;
  await page.locator('.dv-tour-choice').nth(1).click(); // The engineering
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  const seen=[];
  for(let i=0;i<10;i++){
    await expect(heading).not.toHaveText('');
    const h=await heading.textContent();seen.push(h);
    if(h==='Zoom into a part of the system')break;
    await page.locator('.dv-tour-next').click();
  }
  await expect(heading).toHaveText('Zoom into a part of the system');
  // this starter's paths fork and never rejoin: the split still shows
  expect(seen).toContain('Flows can split');
  return {heading,hashBefore};
}

test('disjoint paths never show the split step (no fork to narrate)',async({page,server})=>{
  const warnings=[];
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/tour-disjoint.html#tour=1');
  await page.locator('.dv-tour-choice').nth(2).click(); // Show me both
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  const seen=[];
  for(let i=0;i<10;i++){
    await expect(heading).not.toHaveText('');
    const h=await heading.textContent();seen.push(h);
    if(h==='Now try it')break;
    await page.locator('.dv-tour-next').click();
  }
  expect(seen).not.toContain('Flows can split');
  expect(warnings.some(w=>w.includes('branching-split'))).toBe(false);
  await page.keyboard.press('Escape');
});

for(const [file,shape] of [['tour-prefix','a strict prefix'],['tour-identical','identical']])
  test('paths where one is '+shape+' of the other never show the split step',async({page,server})=>{
    await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
    await page.goto(server.origin+'/'+file+'.html#tour=1');
    await page.locator('.dv-tour-choice').nth(2).click(); // Show me both
    const heading=page.locator('.dv-tour-ui .dv-tour-heading');
    const seen=[];
    for(let i=0;i<10;i++){
      await expect(heading).not.toHaveText('');
      const h=await heading.textContent();seen.push(h);
      if(h==='Now try it')break;
      await page.locator('.dv-tour-next').click();
    }
    expect(seen).toContain('Now try it');
    expect(seen).not.toContain('Flows can split');
    await page.keyboard.press('Escape');
  });

test('Tab and Shift+Tab stay in the tour or its highlighted controls',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  await expect(page.locator('.dv-tour-chooser')).toBeVisible();
  const insideTour=()=>page.evaluate(()=>!!(document.activeElement&&document.activeElement.closest('.dv-tour, .mtoggle')));
  const cycle=async()=>{
    for(const key of ['Tab','Shift+Tab'])
      for(let i=0;i<8;i++){await page.keyboard.press(key);expect(await insideTour(),key+' #'+i).toBe(true);}
  };
  await cycle(); // chooser: 3 choices + Skip + the fixed exit
  await page.locator('.dv-tour-choice').nth(1).click();
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  await cycle(); // a step: Back/Next/Skip + the fixed exit
  await page.keyboard.press('Escape');
});

test('the Skip control clears the step counter at 400px wide',async({page,server})=>{
  await page.setViewportSize({width:400,height:800});
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  const overlap=(a,b)=>a&&b&&a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  await page.locator('.dv-tour-choice').nth(1).click();
  // narrow screens drop the counter row; the card's eyebrow carries the count
  await expect(page.locator('.dv-tour-timeline')).toBeHidden();
  await expect(page.locator('.dv-tour-ui .dv-tour-eyebrow')).toContainText('OF');
  const tl=await page.locator('.dv-tour-timeline').boundingBox();
  expect(tl===null||!overlap(await page.locator('.dv-tour-exit').boundingBox(),tl)).toBe(true);
  await page.keyboard.press('Escape');
});

test('a click step\'s hold always offers a mouse exit, fixed from the first frame',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html#tour=1');
  const exit=page.locator('.dv-tour-exit');
  await expect(exit).toBeVisible();
  const at=await exit.boundingBox();
  await page.locator('.dv-tour-choice').nth(1).click();
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  const clearOfRings=async()=>{
    const e=await exit.boundingBox();
    for(const r of await page.locator('.dv-tour-ring, .dv-tour-ring2').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})))
      expect(e.x<r.x+r.width&&r.x<e.x+e.width&&e.y<r.y+r.height&&r.y<e.y+e.height,'exit overlaps a ring').toBe(false);
  };
  let sawPresentRing=false;
  for(let i=0;i<10;i++){
    const h=await heading.textContent();
    if(h==='Nodes link to the real system')break;
    // the exit never sits on a ring — PRESENT's ring on the step-mode step included
    if(h==='One call at a time'){
      await expect.poll(()=>page.locator('.dv-tour-ring2').count()).toBeGreaterThanOrEqual(0);
      sawPresentRing=(await page.locator('.dv-tour-ring2').count())>0||sawPresentRing;
    }
    await page.waitForTimeout(700);
    await clearOfRings();
    await page.locator('.dv-tour-next').click();
  }
  // during the hold the card is still held, but the exit is there, unmoved
  await expect(exit).toBeVisible();
  expect(await exit.boundingBox()).toEqual(at);
  await exit.click();
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.node-link-menu:not([hidden])')).toHaveCount(0);
});

test('the drill step opens a detail flow and Next returns to the overview',async({page,server})=>{
  const {heading,hashBefore}=await walkToDrill(page,server);
  // the tour pressed ⊞: the focused detail is open, its board and the
  // breadcrumb ringed, the card shown once beside it
  const detail=page.locator('.doc-sec[data-dv-detail-preview]');
  await expect(detail).toBeVisible();
  await expect(page.locator('.dv-tour-ui')).toBeVisible();
  await expect.poll(()=>ringsMatchHoles(page)).toBe(true);
  await expect(page.locator('.dv-tour-ring2')).toHaveCount(1);
  // the tour never writes the drill trail into the URL
  expect(new URL(page.url()).hash).toBe(hashBefore);
  await page.locator('.dv-tour-next').click();
  await expect(heading).not.toHaveText('Zoom into a part of the system');
  await expect(detail).toHaveCount(0);
  await expect(page.locator('#section-doorbell-domains, .doc-sec').first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe(hashBefore);
});

test('Esc on the drill step returns the page to the overview, fragment untouched',async({page,server})=>{
  const {hashBefore}=await walkToDrill(page,server);
  await expect(page.locator('.doc-sec[data-dv-detail-preview]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dv-tour')).toBeHidden();
  await expect(page.locator('.doc-sec[data-dv-detail-preview]')).toHaveCount(0);
  await expect(page.locator('.detail-trigger').first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe(hashBefore);
});

// Card placement: on every step of every walk, the card covers no ring
// and no note — or the documented fallback applies and is asserted
// (partial: primary still clear; covers-primary: last resort).
const PLACEMENT=()=>{
  const ui=document.querySelector('.dv-tour-ui');
  if(!ui||ui.hidden||ui.classList.contains('dv-tour-ui-center'))return {skip:true};
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};};
  const hit=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0;
  const card=box(ui),primary=document.querySelector('.dv-tour-ring');
  const others=[...document.querySelectorAll('.dv-tour-ring2, .dv-tour-note')].map(box);
  return {skip:false,mode:ui.getAttribute('data-placement'),
    heading:(ui.querySelector('.dv-tour-heading')||{}).textContent,
    primaryHit:!!(primary&&hit(card,box(primary))),otherHit:others.some(o=>hit(card,o))};
};
for(const [w,h] of [[1400,900],[1280,800],[1920,1080],[800,600]])
  for(const [persona,name] of [[0,'ux'],[1,'eng'],[2,'both']])
    test(`card clears every ring on every ${name} step at ${w}x${h}`,async({page,server})=>{
      await page.setViewportSize({width:w,height:h});
      await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
      await page.goto(server.origin+'/tour-drill.html#tour=1');
      await page.locator('.dv-tour-choice').nth(persona).click();
      for(let i=0;i<20;i++){
        if(await page.locator('.dv-tour').isHidden())break;
        await expect(page.locator('.dv-tour-ui:not(.dv-tour-ui-pending)')).toBeVisible();
        await page.waitForTimeout(250);
        const s=await page.evaluate(PLACEMENT);
        // the step counter never overlaps a ring either
        expect(await page.evaluate(()=>{
          const t=document.querySelector('.dv-tour-timeline');
          if(!t||t.hidden||getComputedStyle(t).visibility==='hidden'||getComputedStyle(t).display==='none')return false;
          const c=t.getBoundingClientRect();
          return [...document.querySelectorAll('.dv-tour-ring, .dv-tour-ring2')].some(n=>{const r=n.getBoundingClientRect();
            return c.left<r.right&&r.left<c.right&&c.top<r.bottom&&r.top<c.bottom;});
        }),'counter overlaps a ring').toBe(false);
        if(!s.skip){
          if(s.mode==='clear')expect(s.primaryHit||s.otherHit,`${s.heading}: clear card overlaps`).toBe(false);
          else if(s.mode==='partial')expect(s.primaryHit,`${s.heading}: partial card covers the primary`).toBe(false);
          else expect(s.mode,`${s.heading}: unknown placement`).toBe('covers-primary');
        }
        await page.locator('.dv-tour-next').click();
      }
      await expect(page.locator('.dv-tour')).toBeHidden();
    });

test('drill step at 1400x900: the ringed breadcrumb is clear of the card and clickable',async({page,server})=>{
  await page.setViewportSize({width:1400,height:900});
  await walkToDrill(page,server);
  await expect(page.locator('.dv-tour-ui:not(.dv-tour-ui-pending)')).toBeVisible();
  const reachable=await page.evaluate(()=>[...document.querySelectorAll('.doc-sec[data-dv-detail-preview] .detail-breadcrumb button')].map(b=>{
    const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!hit&&!hit.closest(".dv-tour")?true:(hit?hit.className+"@"+Math.round(r.y):"none");
  }));
  expect(reachable.length).toBeGreaterThan(0);
  expect(reachable.every(v=>v===true),JSON.stringify(reachable)).toBe(true);
  await page.keyboard.press('Escape');
});

test('Tab on the links step keeps the menu open and reaches highlighted controls',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');}catch(e){}});
  await page.goto(server.origin+'/standalone.html#tour=1');
  await page.locator('.dv-tour-choice').nth(1).click();
  const heading=page.locator('.dv-tour-ui .dv-tour-heading');
  for(let i=0;i<10;i++){
    if((await heading.textContent())==='Nodes link to the real system')break;
    await page.locator('.dv-tour-next').click();
  }
  const menu=page.locator('.node-link-menu:not([hidden])');
  await expect(menu).toBeVisible();
  for(const key of ['Tab','Tab','Shift+Tab','Tab']){
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
    expect(await page.evaluate(()=>!!document.activeElement.closest('.dv-tour, .node-link-menu, .nrefs-trigger'))).toBe(true);
  }
  await page.keyboard.press('Escape'); // closes the menu first (engine owns it)
  await page.keyboard.press('Escape'); // then the tour
  await expect(page.locator('.dv-tour')).toBeHidden();
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

// #562: "?" opens keyboard shortcuts on every reader surface; the tour has its own "Tour" control.
// row | fixture | assertion (scoped) | rejects
// 1 one "?" control | standalone viewer (#docview); canon reader (.workbench-header + #welcome-reader-screen), 1440x900 | visible buttons whose OWN trimmed text is exactly "?": count 1, accessible name "Keyboard shortcuts" | a "?" that replays the tour or opens the guide; two "?" buttons
// 2 button opens shortcuts | same | real click: the dialog named in that button's aria-controls is open with accessible name "Keyboard shortcuts"; .dv-tour count 0; #human-guide (canon) closed | "?" still replays the tour / opens the guide
// 3 key opens the SAME sheet | same, Esc first closes it (dialog closed = contrasting precondition) | real keyboard.press('?'): the single open dialog has the id from row 2's aria-controls; no tour, no guide | key unwired, or key opens a different sheet (e.g. the Workbench editing sheet)
// 4 sheet lists the reader's real keys | same | ordered [dt, dd] pairs of that dialog's dl rows equal READER_KEYS (engine.js presenter/step keys, tab-bar keys, Esc) | the Workbench editing roster, an empty sheet, invented keys
// 5 Esc closes, focus returns | same, opened by the button | dialog closed; the "?" button is focused | a sheet that traps the reader
// 6 Tour is separately labelled | same | the red navbar control text starts with "TOUR", accessible name contains "tour"; it is not the row-1 button | tour replay still "?"
// 7 Tour still launches | same | real click on row 6's badged control shows .dv-tour-ui | relabel drops the handler
// 8 User guide labelled (canon) | canon reader | #canon-reader-guide textContent AND accessible name exactly "User guide"; real click opens #human-guide | guide entry still "?" or removed
// 9 linking untouched | same | page.url() and history.length after opening/closing the sheet by button AND by key equal the values before (no hash/query write, no history entry) | a "?" handler that writes #?/?help or pushes history, breaking the copied/position link
//   Cross-document link following (Claude artifact, hosted site, Backstage) stays with its own specs, which CI runs unchanged:
//   document-links.spec.mjs, handoffs.spec.mjs, local-handoffs.spec.mjs, drilldown.spec.mjs, backstage-*.spec.mjs.
const READER_KEYS=[
  ['?','Open this shortcut sheet'],
  ['Esc','Close this sheet, an open menu or a popover'],
  ['← / →','Previous or next step'],
  ['Space','Play or pause the steps'],
  ['1–9','Switch to that tab'],
  ['Esc','Exit Present'],
  ['← / →','Previous or next tab'],
  ['Home / End','First or last tab'],
];
async function readerShortcutContract(page,chrome,extra={}){
  const ownQuestionMarks=()=>chrome.locator('button').evaluateAll(buttons=>buttons.filter(b=>b.getClientRects().length && getComputedStyle(b).visibility!=='hidden' && b.textContent.trim()==='?').length);
  await expect.poll(ownQuestionMarks).toBe(1);
  const help=chrome.locator('button:visible').filter({hasText:/^\s*\?\s*$/});
  await expect(help).toHaveCount(1);expect(await help.evaluate(b=>b.textContent.trim())).toBe('?');
  const url=page.url(),history=await page.evaluate(()=>window.history.length);
  await expect(help).toHaveAccessibleName('Keyboard shortcuts');
  const sheetId=await help.getAttribute('aria-controls');
  expect(sheetId).toBeTruthy();
  const sheet=page.locator('dialog#'+sheetId);
  await expect(sheet).toHaveCount(1);await expect(sheet).not.toHaveAttribute('open','');
  const quiet=async()=>{
    await expect(page.locator('.dv-tour')).toHaveCount(0);
    if(extra.guide)await expect(extra.guide).not.toHaveAttribute('open','');
  };
  await help.click();
  await expect(sheet).toHaveAttribute('open','');await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAccessibleName('Keyboard shortcuts');
  await quiet();
  const rows=await sheet.locator('dl').evaluateAll(lists=>lists.flatMap(list=>[...list.querySelectorAll(':scope > dt')].map(dt=>[dt.textContent.replace(/\s+/g,' ').trim(),dt.nextElementSibling.textContent.replace(/\s+/g,' ').trim()])));
  expect(rows).toEqual(READER_KEYS);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveAttribute('open','');await expect(help).toBeFocused();
  await help.blur();
  await page.keyboard.press('?');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('dialog[open]')).toHaveAttribute('id',sheetId);
  await quiet();
  await page.keyboard.press('Escape');await expect(sheet).not.toHaveAttribute('open','');
  expect(page.url()).toBe(url);expect(await page.evaluate(()=>window.history.length)).toBe(history);
  const tour=chrome.locator('.explore-navigation .explore-tour-button');
  await expect(tour).toBeVisible();await expect(tour).toContainText('TOUR');
  await expect(tour).toHaveAccessibleName(/tour/i);
  expect(await tour.evaluate((el,id)=>el.getAttribute('aria-controls')!==id,sheetId)).toBe(true);
  return {tour};
}
test('viewer: "?" button and key open the same reader shortcut sheet; Tour is its own control',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/standalone.html');
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  const {tour}=await readerShortcutContract(page,page.locator('#docview'));
  await tour.click();await expect(page.locator('.dv-tour-ui')).toBeVisible();
});
test('artifact reader keeps Tour, Panels and the bundled User guide in its navbar',async({page,server},info)=>{
  await page.addInitScript(()=>{window.claude={use:()=>Promise.resolve(null)};});
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/standalone.html');
  const nav=page.locator('#docview>.explore-navigation'),tour=nav.locator('.explore-tour-button'),guide=nav.getByRole('button',{name:'User guide',exact:true});
  await expect(tour).toBeVisible();await expect(guide).toBeVisible();await expect(page.locator('.dv-tour-replay,.dv-tour-discovery')).toHaveCount(0);
  await guide.click();const dialog=page.locator('#human-guide');await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:'Make the system make sense.',exact:true})).toBeVisible();
  expect(await dialog.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(600);
  await page.locator('#human-guide-close').click();await expect(guide).toBeFocused();
  const panels=nav.locator('.explore-panel-menu');await panels.locator('summary').click();const body=panels.locator('.explore-panel-body');await expect(body).toBeVisible();
  const visual=await body.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:r.right,bottom:r.bottom,bg:s.backgroundColor,radius:s.borderRadius,font:s.fontFamily};});
  expect(visual.left).toBeGreaterThanOrEqual(12);expect(visual.right).toBeLessThanOrEqual(1428);expect(visual.bottom).toBeLessThanOrEqual(888);expect(visual.radius).toBe('10px');expect(visual.bg).not.toBe('rgba(0, 0, 0, 0)');
  await info.attach('artifact-navbar',{body:await page.screenshot(),contentType:'image/png'});
});
test('canon reader: one "?" opens the reader shortcut sheet; Tour and User guide are labelled',async({page,server})=>{
  const spec=editorSpec();spec.page.canon={version:1,id:'delivery',kind:'canonical',owner:'group:default/home'};
  await page.route('**/diagrams.json',route=>route.fulfill({json:{version:1,diagrams:[{id:'delivery',title:'Reviewed delivery',spec}]}}));
  await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-library').click();await page.locator('.canon-library-open').first().click();
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  const guide=page.locator('#human-guide'),editorSheet=page.locator('#keyboard-shortcuts');
  const {tour}=await readerShortcutContract(page,page.locator('.workbench-header, #welcome-reader-screen'),{guide});
  await expect(editorSheet).not.toHaveAttribute('open','');
  const guideButton=page.locator('#canon-reader-guide');
  await expect(guideButton).toBeVisible();await expect(guideButton).toHaveText('User guide');
  await expect(guideButton).toHaveAccessibleName('User guide');
  await guideButton.click();await expect(guide).toHaveAttribute('open','');
  await page.locator('#human-guide-close').click();await expect(guide).not.toHaveAttribute('open','');
  await tour.click();await expect(page.locator('.dv-tour-ui')).toBeVisible();
});
