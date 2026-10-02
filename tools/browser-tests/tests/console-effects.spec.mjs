import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

for(const motion of ['no-preference','reduce'])test('console effects coexist and clear with '+motion,async({page,server},testInfo)=>{
  await page.emulateMedia({reducedMotion:motion});
  const input=path.join(server.root,'console-effects.json');
  await writeFile(input,await readFile(path.join(repo,'examples/console-effects/story.spec.json')));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'console-effects.html')]);
  await page.goto(server.origin+'/console-effects.html');
  const screens=page.locator('.screenbox');
  await expect(screens).toHaveCount(2);
  await screens.evaluateAll(boxes=>boxes.forEach(box=>box.querySelector('.scene').dataset.preserved='yes'));
  const jump=step=>page.evaluate(step=>{location.hash='#d=1&m=step&s='+step;},step);
  await jump('alarm');
  await expect(page.locator('.screen-siren-label')).toHaveCount(2);
  await expect(page.locator('.screen-light-label')).toHaveCount(2);
  await expect(page.locator('.secmon-audio-speaking.secmon-audio-listening')).toHaveCount(1);
  await expect(page.locator('.pt-screen .screen-audio-direction')).toHaveText('Camera speaker and microphone active');
  for(const label of await page.locator('.screen-siren-label, .screen-light-label').all())await expect(label).toBeVisible();
  for(const box of await screens.all()){
    await expect(box.locator('.scene')).toHaveAttribute('data-preserved','yes');
    const bounds=await box.evaluate(el=>{
      const a=el.querySelector('.screen-siren-label').getBoundingClientRect(),b=el.querySelector('.screen-light-label').getBoundingClientRect(),r=el.getBoundingClientRect();
      return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,contained:[a,b].every(x=>x.left>=r.left&&x.right<=r.right&&x.top>=r.top&&x.bottom<=r.bottom)};
    });
    expect(bounds).toEqual({overlap:false,contained:true});
  }
  if(motion==='reduce')expect(await page.locator('.screen-siren .fva-emission').first().evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  await page.screenshot({path:testInfo.outputPath('console-effects.png'),fullPage:true});
  await jump('clear');
  await expect(page.locator('.screen-siren-label, .screen-light-label, .fva-audio')).toHaveCount(0);
  await jump('alarm');
  await expect(page.locator('.screen-siren-label')).toHaveCount(2);
  await jump('talk');
  await expect(page.locator('.screen-siren-label, .screen-light-label')).toHaveCount(0);
  await expect(page.locator('.secmon-audio-speaking.secmon-audio-listening')).toHaveCount(1);
});
