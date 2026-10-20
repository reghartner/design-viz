import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const sportsEnabled=(process.env.FLOWVIEW_PACKAGES||'').split(',').includes('sports');
test.skip(!sportsEnabled,'The sports package is opt-in for browser builds.');

for(const viewport of [{width:1280,height:800},{width:1440,height:900}]){
  test(`venue map keeps every path step in the controls rail at ${viewport.width}×${viewport.height}`,async({page,server})=>{
    await page.setViewportSize(viewport);
    const output=path.join(server.root,'venue-map.html');
    execFileSync('python3',[path.join(repo,'tools/inject.py'),
      path.join(repo,'packages/sports/examples/venue-map.spec.json'),
      path.join(repo,'template/flowview.html'),output]);
    await page.goto(server.origin+'/venue-map.html');
    const skip=page.getByText('Skip tour',{exact:true});
    if(await skip.isVisible())await skip.click();
    await expect(page.locator('.seatmap-svg')).toBeVisible();
    expect(await page.locator('.seatmap-svg .seatmap-fill').count()).toBeGreaterThan(20);
    const controls=page.locator('.section-layout-tile[data-layout-key="steps"]>.termbar');
    const rail=controls.locator('.schips');
    await expect(controls).toBeVisible();
    await expect(rail.locator('.schip')).toHaveCount(9);
    async function checkRail(){
      const geometry=await rail.evaluate(el=>{
        const strip=el.getBoundingClientRect();
        return {scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollLeft:el.scrollLeft,
          strip:{left:strip.left,right:strip.right,top:strip.top,bottom:strip.bottom},
          buttons:[...el.querySelectorAll('.schip')].map(button=>{
            const rect=button.getBoundingClientRect();
            return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
          })};
      });
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
      expect(geometry.scrollLeft).toBe(0);
      for(const button of geometry.buttons){
        expect(button.left).toBeGreaterThanOrEqual(geometry.strip.left-1);
        expect(button.right).toBeLessThanOrEqual(geometry.strip.right+1);
        expect(button.top).toBeGreaterThanOrEqual(geometry.strip.top-1);
        expect(button.bottom).toBeLessThanOrEqual(geometry.strip.bottom+1);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    }
    await checkRail();
    await rail.locator('[data-step-source="5"]').click();
    await expect(rail.locator('[data-step-source="5"]')).toHaveAttribute('aria-current','true');
    await rail.locator('[data-dv-path="soft"]').click();
    await rail.locator('[data-step-source="7"]').click();
    await expect(rail.locator('[data-step-source="7"]')).toHaveAttribute('aria-current','true');
    await checkRail();
    if(process.env.FLOWVIEW_SCREENSHOT_DIR){
      await mkdir(process.env.FLOWVIEW_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.FLOWVIEW_SCREENSHOT_DIR,`venue-map-${viewport.width}x${viewport.height}-full.png`),fullPage:true});
      await controls.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(process.env.FLOWVIEW_SCREENSHOT_DIR,`venue-map-${viewport.width}x${viewport.height}-controls.png`)});
    }
  });
}
