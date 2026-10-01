import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
// Focused smoke for the Kestrel overnight demo's persistent camera screen and the
// illustrated raccoon clip. Motion is asserted with normal motion preferences.
test.use({reducedMotion:'no-preference'});
const kestrel=await readFile(path.join(repo,'examples/kestrel-overnight/story.spec.json'),'utf8');
const clips=await readFile(path.join(repo,'src/starters/screen-clips.json'),'utf8');
// [step, screen mode, Home motion-sensor state]: the sensor never stops; recording follows detection.
const NORMAL=[['bedtime','off','scan'],['raccoon-detected','off','detect'],['raccoon','rec','rec'],['raccoon-saved','save','scan'],
  ['lowbatt','off','scan'],['sunrise','off','scan'],['charging','off','scan'],['a-motion-detected','off','detect'],
  ['a-courier','rec','rec'],['a-upload','save','scan'],['a-alert','off','scan'],['a-open','playing','scan']];
const WIFI=[['bedtime','off','scan'],['raccoon-detected','off','detect'],['raccoon','rec','rec'],['raccoon-saved','save','scan'],
  ['lowbatt','off','scan'],['sunrise','off','scan'],['charging','off','scan'],['b-wifi-down','off','scan'],
  ['b-motion-detected','off','detect'],['b-courier','rec','rec'],['b-retry','save','scan'],['b-reconnect','save','scan'],['b-late-alert','off','scan']];
function inject(server,name,text){
  const input=path.join(server.root,name+'.json');
  return writeFile(input,text).then(()=>execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]));
}
const jump=(page,section,pathId,step)=>page.evaluate(hash=>{location.hash=hash;},'#d='+section+'&m=step'+(pathId?'&p='+pathId:'')+'&s='+step);
async function raccoonX(locator){return locator.evaluate(el=>el.getBoundingClientRect().x);}
// Seek every raccoon animation to the same clip time and read the computed poses.
function pose(box,ms){
  return box.evaluate((el,ms)=>{
    const scene=el.querySelector('.scene-raccoon');
    for(const animation of scene.getAnimations({subtree:true})){animation.pause();animation.currentTime=ms;}
    const transform=selector=>getComputedStyle(scene.querySelector(selector)).transform;
    return {body:transform('.raccoon'),front:transform('.raccoon-leg:not(.raccoon-leg-back)'),
      back:transform('.raccoon-leg-back'),head:transform('.raccoon-head')};
  },ms);
}
const matrix=value=>value==='none'?[1,0,0,1,0,0]:value.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
const neutral=value=>matrix(value).every((n,i)=>Math.abs(n-[1,0,0,1,0,0][i])<1e-6);

test('Kestrel continuous motion sensing stays on through both paths and each detection precedes recording',async({page,server})=>{
  test.setTimeout(90000);
  await inject(server,'kestrel-sensing',kestrel);
  await page.goto(server.origin+'/kestrel-sensing.html');
  const home=page.locator('.pwidget.pt-homemap'),cam=home.locator('[data-device="cam"]');
  const wedge=home.locator('.hmwedge'),sweep=home.locator('.hmsweep');
  const screen=page.locator('.pwidget.pt-screen .screenbox');
  // The Home camera's cone and animated sweep are present in this sensor state.
  async function sensing(at,state){
    await expect(cam,at).toHaveClass(new RegExp('hm-'+state+'(?:\\s|$)'));
    await expect(wedge,at).toHaveCount(1);await expect(wedge,at).toBeVisible();
    await expect(sweep,at).toHaveCount(1);
    expect(await sweep.evaluate(el=>getComputedStyle(el).animationName),at).toBe('sensorSweep');
  }
  async function sweeping(at){
    const first=await sweep.evaluate(el=>getComputedStyle(el).transform);
    await expect.poll(()=>sweep.evaluate(el=>getComputedStyle(el).transform),{message:at+': sweep moves',timeout:4000}).not.toBe(first);
  }
  // First load (bedtime): the sensor watches while the recorder is in STANDBY.
  await sensing('first load','scan');
  await expect(screen).toHaveClass(/m-off/);
  // Every step of both paths, in order.
  for(const [pathId,steps] of [['normal',NORMAL],['wifi-down',WIFI]]){
    for(const [step,mode,sensor] of steps){
      const at=pathId+'/'+step;
      await jump(page,1,pathId,step);
      await expect(screen,at).toHaveClass(new RegExp('m-'+mode+'(?:\\s|$)'));
      await sensing(at,sensor);
    }
  }
  // Representative idle beats: the sweep really moves under normal motion.
  for(const [pathId,step] of [['normal','lowbatt'],['wifi-down','b-late-alert']]){
    await jump(page,1,pathId,step);
    await sensing(pathId+'/'+step,'scan');
    await expect(screen.locator('.offlabel')).toHaveText('STANDBY');
    await sweeping(pathId+'/'+step);
  }
  // Each detection is its own beat with no REC; the next step starts REC with the right clip.
  for(const [pathId,detected,recording,subject,clip,absent] of [
    ['normal','raccoon-detected','raccoon','raccoon','.scene-raccoon','.courier'],
    ['wifi-down','raccoon-detected','raccoon','raccoon','.scene-raccoon','.courier'],
    ['normal','a-motion-detected','a-courier','courier','.courier','.raccoon'],
    ['wifi-down','b-motion-detected','b-courier','courier','.courier','.raccoon']]){
    const at=pathId+'/'+detected;
    await jump(page,1,pathId,detected);
    await sensing(at,'detect');
    await expect(home.locator('[data-subject="'+subject+'"]'),at).toHaveCount(1);
    await expect(home.locator('[data-subject="package"]'),at+': no package before delivery').toHaveCount(0);
    await expect(screen,at).toHaveClass(/m-off/);
    await expect(screen.locator('.recchip'),at).toHaveCount(0);
    await expect(screen.locator('.scene'),at).toHaveCount(0);
    await jump(page,1,pathId,recording);
    await sensing(pathId+'/'+recording,'rec');
    await expect(screen).toHaveClass(/m-rec/);
    await expect(screen.locator('.recchip')).toHaveText('REC');
    await expect(screen.locator(clip)).toHaveCount(1);
    await expect(screen.locator(absent)).toHaveCount(0);
    if(subject==='courier')await expect(home.locator('[data-subject="package"]')).toHaveCount(1);
    // Backward to the detection beat: recorder back to STANDBY, sensor still on.
    await jump(page,1,pathId,detected);
    await sensing(at+' (back)','detect');
    await expect(screen).toHaveClass(/m-off/);
  }
  // Path switching and a fresh deep link keep the sensor on and the recorder honest.
  await jump(page,1,'normal','a-open');
  await sensing('normal/a-open','scan');
  await expect(screen.locator('.playchip')).toHaveText('PLAYING');
  await jump(page,1,'wifi-down','b-retry');
  await sensing('wifi-down/b-retry','scan');
  await expect(screen.locator('.playchip')).toHaveCount(0);
  await page.goto(server.origin+'/kestrel-sensing.html?direct=detect#d=1&m=step&p=wifi-down&s=b-motion-detected');
  await sensing('direct wifi-down/b-motion-detected','detect');
  await expect(screen).toHaveClass(/m-off/);
  // Reduced motion keeps the cone; its sweep line is intentionally hidden.
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(wedge).toBeVisible();
  await expect(sweep).toBeHidden();
  await page.emulateMedia({reducedMotion:'no-preference'});
});

test('Kestrel camera screen stays on every step, records a moving raccoon and labels package playback',async({page,server})=>{
  await inject(server,'kestrel-screen',kestrel);
  // First load without a hash, then a direct deep link into the raccoon beat.
  await page.goto(server.origin+'/kestrel-screen.html');
  const card=page.locator('.pwidget.pt-screen'),box=card.locator('.screenbox');
  await expect(card).toHaveCount(1);await expect(card).toBeVisible();
  await expect(card.locator('.ptitle')).toHaveText('Porch Cam clips (illustrated)');
  // A distinct query forces a fresh document rather than a fragment navigation.
  await page.goto(server.origin+'/kestrel-screen.html?direct=raccoon#d=1&m=step&p=normal&s=raccoon');
  await expect(card).toBeVisible();
  await expect(box).toHaveClass(/m-rec/);
  await expect(box.locator('.recchip')).toHaveText('REC');
  const raccoon=box.locator('.scene-raccoon .raccoon');
  await expect(raccoon).toBeVisible();
  expect(await raccoon.evaluate(el=>getComputedStyle(el).animationName)).toBe('raccooncross');
  const start=await raccoonX(raccoon);
  await expect.poll(async()=>start-await raccoonX(raccoon),{timeout:4000}).toBeGreaterThan(20);
  // The nine-second clip stops to sniff from 35% to 62% (3.15–5.58 s): body and
  // legs hold still at two times inside the stop while the head sniffs.
  const early=await pose(box,3600),late=await pose(box,5200);
  expect(late.body).toBe(early.body);
  expect(matrix(early.body)[4]).toBeCloseTo(176,1);
  for(const leg of ['front','back'])expect(neutral(early[leg])&&neutral(late[leg]),leg+' legs neutral while sniffing').toBe(true);
  expect(neutral(early.head),'head sniffs during the stop').toBe(false);
  // Outside the stop the body travels and both leg pairs stride.
  for(const [ms,side] of [[1000,1],[6000,-1]]){
    const moving=await pose(box,ms);
    expect(Math.sign(matrix(moving.body)[4]-176),ms+' ms body position').toBe(side);
    for(const leg of ['front','back'])expect(neutral(moving[leg]),leg+' legs stride at '+ms+' ms').toBe(false);
    expect(neutral(moving.head),'head level while walking').toBe(true);
  }
  await raccoon.evaluate(el=>{for(const animation of el.closest('.scene').getAnimations({subtree:true}))animation.play();});
  // Reduced motion holds a still raccoon on the porch.
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>raccoon.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect(raccoon).toBeVisible();
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const [pathId,steps] of [['normal',NORMAL],['wifi-down',WIFI]]){
    for(const [step,mode] of steps){
      await jump(page,1,pathId,step);
      await expect(card,pathId+'/'+step).toBeVisible();
      await expect(box,pathId+'/'+step).toHaveClass(new RegExp('m-'+mode+'(?:\\s|$)'));
      await expect(box.locator('.offlabel')).toHaveCount(mode==='off'?1:0);
      await expect(box.locator('.recchip')).toHaveCount(mode==='rec'?1:0);
      await expect(box.locator('.playchip')).toHaveCount(mode==='playing'?1:0);
      await expect(box.locator('.livechip')).toHaveCount(0);
      if(mode==='off')await expect(box.locator('.scene')).toHaveCount(0);
    }
  }
  // Package playback at a-open: real Playing mode with a visible label and clip title.
  await jump(page,1,'normal','a-open');
  await expect(box.locator('.playchip')).toBeVisible();
  await expect(box.locator('.playchip')).toHaveText('PLAYING');
  await expect(box.locator('.cliptitle')).toHaveText('Package clip, 8:12 AM');
  await expect(box.locator('.courier')).toHaveCount(1);
  await expect(box.locator('.raccoon')).toHaveCount(0);
  // Direct load into the wifi-down ending shows honest standby, never playback.
  await page.goto(server.origin+'/kestrel-screen.html?direct=late#d=1&m=step&p=wifi-down&s=b-late-alert');
  await expect(card).toBeVisible();
  await expect(box).toHaveClass(/m-off/);
  await expect(box.locator('.offlabel')).toHaveText('STANDBY');
  await expect(box.locator('.playchip')).toHaveCount(0);
});

test('waiting hides and resets the raccoon; the event replays and Playing labels recorded playback',async({page,server})=>{
  await inject(server,'screen-clips',clips);
  await page.goto(server.origin+'/screen-clips.html#d=5&m=step&s=record');
  // Fifth starter section: the raccoon camera.
  const box=page.locator('.pwidget.pt-screen').nth(4).locator('.screenbox'),raccoon=box.locator('.raccoon');
  await expect(box.locator('.scene-raccoon')).toHaveCount(1);
  await expect(box).toHaveClass(/m-rec scene-waiting/);
  await expect(box.locator('.recchip')).toBeVisible();
  await expect(raccoon).toBeHidden();
  await jump(page,5,null,'event');
  await expect(box).not.toHaveClass(/scene-waiting/);
  await expect(raccoon).toBeVisible();
  const start=await raccoonX(raccoon);
  await expect.poll(async()=>start-await raccoonX(raccoon),{timeout:5000}).toBeGreaterThan(60);
  const reached=await raccoonX(raccoon);
  await jump(page,5,null,'record');
  await expect(raccoon).toBeHidden();
  await jump(page,5,null,'event');
  await expect(raccoon).toBeVisible();
  // Replayed from the start: back to the right of where the earlier run had reached.
  expect(await raccoonX(raccoon)).toBeGreaterThan(reached+20);
  await jump(page,5,null,'playback');
  await expect(box).toHaveClass(/m-playing/);
  await expect(box.locator('.playchip')).toHaveText('PLAYING');
  await expect(box.locator('.recchip')).toHaveCount(0);
  await expect(raccoon).toBeVisible();
});
