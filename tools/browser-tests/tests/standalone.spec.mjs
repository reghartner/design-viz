import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {access} from 'node:fs/promises';
import {test,expect} from '../helpers/test.mjs';
function scrollPosition(row){
  const rowTop=row.getBoundingClientRect().top,rowDocTop=rowTop+scrollY;
  const maxScroll=Math.max(0,document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight);
  const wantedScroll=Math.min(rowDocTop,maxScroll);
  return {rowTop,rowDocTop,maxScroll,currentScroll:scrollY,wantedScroll,
    aligned:Math.abs(scrollY-wantedScroll)<=1,fonts:document.fonts.status};
}
test('new single-file HTML works offline with exact composed navigation and local fonts',async({page,context,server},testInfo)=>{
  await expect(access(path.join(server.root,'spec.json'))).rejects.toThrow();
  await page.setViewportSize({width:1280,height:720});await context.setOffline(true);
  await page.addInitScript(()=>{
    const native=Element.prototype.scrollIntoView;window.__routeScrolls=[];
    Element.prototype.scrollIntoView=function(options){
      __routeScrolls.push({id:this.id,block:options?.block});
      return native.apply(this,arguments);
    };
  });
  const hash='#t=distance-gate&d=alert-only-inside-15-feet&m=step&s=6&c=alert-only-inside-15-feet&r=2';
  await page.goto(pathToFileURL(path.join(server.root,'standalone.html')).href+hash);
  const row=page.locator('#contract-alert-only-inside-15-feet-row-2');
  await expect(row).toHaveClass(/dv-hash-target/);await expect(row).toBeFocused();await expect(row).toBeInViewport();
  expect(await page.evaluate(()=>__routeScrolls.at(-1))).toEqual({id:'contract-alert-only-inside-15-feet-row-2',block:'start'});
  await expect(page.locator('.tabbtn[aria-selected=true]')).toHaveText('Distance gate');
  await expect(page.locator('#section-alert-only-inside-15-feet .schip[aria-current=true]')).toHaveText('6');
  await expect(page.locator('#section-alert-only-inside-15-feet .board')).toHaveClass(/stepmode/);
  expect(new URL(page.url()).hash).toBe(hash);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>[...document.fonts].some(face=>face.family.includes('IBM Plex Sans')&&face.status==='loaded'))).toBe(true);
  await testInfo.attach('initial-font-layout',{body:JSON.stringify(await row.evaluate(scrollPosition)),contentType:'application/json'});
  // Initial routing precedes font loading. Test precise requested scrolling on
  // settled layout through real hash changes; never scroll the row from the test.
  await page.evaluate(hash=>{location.hash=hash;},hash.replace('&r=2','&r=1'));
  await expect(page.locator('#contract-alert-only-inside-15-feet-row-1')).toBeFocused();
  await page.evaluate(hash=>{location.hash=hash;},hash);
  await expect(row).toHaveClass(/dv-hash-target/);await expect(row).toBeFocused();await expect(row).toBeInViewport();
  await expect.poll(()=>row.evaluate(scrollPosition)).toMatchObject({aligned:true});
  await testInfo.attach('settled-scroll',{body:JSON.stringify(await row.evaluate(scrollPosition)),contentType:'application/json'});
  expect(new URL(page.url()).hash).toBe(hash);
});
