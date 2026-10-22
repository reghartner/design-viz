import {test,expect,paste} from '../helpers/test.mjs';
import {source} from '../fixtures/editor-spec.mjs';

test.use({reducedMotion:'no-preference'});
const motionSpec=JSON.parse(source);motionSpec.page.blocks[0].diagram.view='ambient';
const motionSource=JSON.stringify(motionSpec,null,2);

async function openMotionWorkbench(page,server){
  await page.goto(server.origin+'/workbench.html');await paste(page,motionSource);
  await page.evaluate(()=>document.getElementById('sk-aurora').click());
}

async function clocks(page){
  return page.locator('#docview').evaluate(view=>{
    const svg=view.querySelector('.boardcanvas > svg'),edge=svg.querySelector('.edge.main'),selection=svg.querySelector('g.node.dv-sel .card');
    const style=getComputedStyle(edge),selected=selection && getComputedStyle(selection);
    return {classPaused:view.classList.contains('dv-workbench-motion-paused'),smil:svg.getCurrentTime(),smilPaused:svg.animationsPaused(),
      dash:style.strokeDashoffset,play:style.animationPlayState,name:style.animationName,
      selectionPlay:selected && selected.animationPlayState};
  });
}

test('independent workbench owners freeze real CSS and SMIL clocks across blur, replacement and focus',async({context,server})=>{
  const first=await context.newPage(),second=await context.newPage();
  await openMotionWorkbench(first,server);await openMotionWorkbench(second,server);
  await first.locator('[data-dv-node="a"]').click();
  await expect(first.locator('#docview')).not.toHaveClass(/dv-workbench-motion-paused/);
  let a=await clocks(first);await first.waitForTimeout(180);let b=await clocks(first);
  expect(b.smil).toBeGreaterThan(a.smil);expect(b.dash).not.toBe(a.dash);

  // Headless Playwright reports every page focused. Exercise the browser blur
  // event boundary directly; the separate second page proves ownership stays
  // per workbench rather than leaking through document-wide SVG selection.
  await first.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(first.locator('#docview')).toHaveClass(/dv-workbench-motion-paused/);
  a=await clocks(first);await first.waitForTimeout(180);b=await clocks(first);
  expect(b.smil).toBeCloseTo(a.smil,3);expect(b.dash).toBe(a.dash);
  expect(b.smilPaused).toBe(true);expect(b.play).toBe('paused');expect(b.selectionPlay).toBe('paused');

  const secondBefore=await clocks(second);await second.waitForTimeout(180);const secondAfter=await clocks(second);
  expect(secondAfter.classPaused).toBe(false);expect(secondAfter.smil).toBeGreaterThan(secondBefore.smil);
  expect(secondAfter.dash).not.toBe(secondBefore.dash);

  await first.locator('#editor-tab-steps').click();await first.locator('#steps-path').selectOption('failed');
  await expect(first.locator('#steps-path')).toHaveValue('failed');
  a=await clocks(first);await first.waitForTimeout(180);b=await clocks(first);
  expect(b.smil).toBeCloseTo(a.smil,3);expect(b.dash).toBe(a.dash);

  const replacement=motionSource.replace('"Browser contract"','"Replacement while inactive"');
  await first.evaluate(text=>{const input=document.getElementById('src');input.value=text;document.getElementById('go').click();},replacement);
  await expect(first.locator('#docview .boardcanvas > svg')).toHaveCount(1);
  a=await clocks(first);await first.waitForTimeout(180);b=await clocks(first);
  expect(b.smil).toBeCloseTo(a.smil,3);expect(b.dash).toBe(a.dash);expect(b.classPaused).toBe(true);

  await first.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(first.locator('#docview')).not.toHaveClass(/dv-workbench-motion-paused/);
  a=await clocks(first);await first.waitForTimeout(180);b=await clocks(first);
  expect(b.smil).toBeGreaterThan(a.smil);

  await first.locator('#workspace-home').click();
  await expect(first.locator('#docview')).toHaveClass(/dv-workbench-motion-paused/);
  a=await clocks(first);await first.waitForTimeout(180);b=await clocks(first);
  expect(b.smil).toBeCloseTo(a.smil,3);expect(b.dash).toBe(a.dash);
  await first.locator('#welcome-header-resume').click();
  await expect(first.locator('#docview')).not.toHaveClass(/dv-workbench-motion-paused/);
  await first.close();await second.close();
});

test('reduced-motion CSS remains disabled through inactive and active transitions',async({page,server})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await openMotionWorkbench(page,server);
  expect((await clocks(page)).name).toBe('none');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#docview')).toHaveClass(/dv-workbench-motion-paused/);
  expect((await clocks(page)).name).toBe('none');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#docview')).not.toHaveClass(/dv-workbench-motion-paused/);
  expect((await clocks(page)).name).toBe('none');
});

test('visibility boundary freezes clocks when browser hidden state is simulated',async({page,server})=>{
  await openMotionWorkbench(page,server);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#docview')).toHaveClass(/dv-workbench-motion-paused/);
  let a=await clocks(page);await page.waitForTimeout(180);let b=await clocks(page);
  expect(b.smil).toBeCloseTo(a.smil,3);expect(b.dash).toBe(a.dash);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#docview')).not.toHaveClass(/dv-workbench-motion-paused/);
  a=await clocks(page);await page.waitForTimeout(180);b=await clocks(page);
  expect(b.smil).toBeGreaterThan(a.smil);expect(b.dash).not.toBe(a.dash);
});

test('standalone reader clocks are outside workbench motion ownership',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html');
  const svg=page.locator('.boardcanvas > svg').first();await expect(svg).toBeVisible();
  const time=()=>svg.evaluate(node=>node.getCurrentTime());
  const before=await time();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(180);
  expect(await time()).toBeGreaterThan(before);await expect(page.locator('.dv-workbench-motion-paused')).toHaveCount(0);
});
