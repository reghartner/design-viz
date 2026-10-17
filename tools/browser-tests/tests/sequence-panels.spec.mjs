import {test,expect} from '../helpers/test.mjs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../..',import.meta.url));
const fixture=path.join(repo,'src/starters/sequencing-walkthrough.json');

test('sequencing walkthrough drives all six sequence panels through both endings',async({page,server},testInfo)=>{
  execFileSync('python3',[path.join(repo,'tools/inject.py'),fixture,path.join(repo,'template/flowview.html'),path.join(server.root,'sequencing.html')]);
  await page.goto(server.origin+'/sequencing.html');
  const next=page.getByRole('button',{name:'Next step',exact:true});
  const panel=type=>page.locator('.pwidget.pt-'+type);
  for(const type of ['locus','sequence','reads','funnel','grid'])await expect(panel(type)).toHaveCount(1);
  await expect(panel('frames')).toHaveCount(2);
  // Step 2: the reference window is revealed and the first count lands.
  await next.click();
  await expect(panel('funnel').locator('.funnel-count').first()).toContainText('1,200,000');
  // Step 3: reads appear with a depth bar.
  await next.click();
  await expect(panel('reads').locator('.reads-row.reads-read')).toHaveCount(5);
  // Step 4: the insertion wedge and the focus read.
  await next.click();
  await expect(panel('reads').locator('.reads-row.reads-focus')).toHaveCount(1);
  // Step 5: the map draws an arc.
  await next.click();
  await expect(panel('locus').locator('.locus-arc')).toHaveCount(1);
  // Steps 6–7: filter, then the in-frame product is explained.
  await next.click();await next.click();
  const frames=panel('frames');
  await expect(frames.filter({hasText:'12-letter'}).locator('.swnote')).toContainText('keeps the frame');
  // Step 8: the junction grid fills.
  await next.click();
  await expect(panel('grid').locator('.grid-mark')).toHaveCount(4);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:testInfo.outputPath('sequencing-inframe.png'),fullPage:true});
  // The frameshift ending shows the other frame panel.
  await page.locator('.path-chip[data-dv-path="frameshift"]').click();
  for(let i=0;i<6;i++)await next.click();
  await expect(frames.filter({hasText:'13-letter'}).locator('.swnote')).toContainText('shift every codon');
  await page.screenshot({path:testInfo.outputPath('sequencing-frameshift.png'),fullPage:true});
});
