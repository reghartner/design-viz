import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {access} from 'node:fs/promises';
import {test,expect} from '../helpers/test.mjs';
test('new single-file HTML works offline with exact composed navigation and local fonts',async({page,context,server})=>{
  await expect(access(path.join(server.root,'spec.json'))).rejects.toThrow();
  await page.setViewportSize({width:1280,height:720});await context.setOffline(true);
  const hash='#t=distance-gate&d=alert-only-inside-15-feet&m=step&s=6&c=alert-only-inside-15-feet&r=2';
  await page.goto(pathToFileURL(path.join(server.root,'standalone.html')).href+hash);
  const row=page.locator('#contract-alert-only-inside-15-feet-row-2');
  await expect(row).toHaveClass(/dv-hash-target/);await expect(row).toBeFocused();
  await expect.poll(()=>row.evaluate(e=>Math.abs(Math.round(e.getBoundingClientRect().top)))).toBeLessThanOrEqual(1);
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Distance gate');
  await expect(page.locator('#section-alert-only-inside-15-feet .schip[aria-current=true]')).toHaveText('6');
  await expect(page.locator('#section-alert-only-inside-15-feet .board')).toHaveClass(/stepmode/);
  expect(new URL(page.url()).hash).toBe(hash);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>[...document.fonts].some(face=>face.family.includes('IBM Plex Sans')&&face.status==='loaded'))).toBe(true);
});
