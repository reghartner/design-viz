import {test,expect} from '../helpers/test.mjs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const fixture=path.join(repo,'examples/panel-declare/panel-declare.spec.json');

test('per-step declaration overrides change the gauge unit and title and the table columns on one path only',async({page,server},info)=>{
  execFileSync('python3',[path.join(repo,'tools/inject.py'),fixture,path.join(repo,'template/flowview.html'),path.join(server.root,'panel-declare.html')]);
  await page.goto(server.origin+'/panel-declare.html');
  const gauge=page.locator('.pt-gauge'),table=page.locator('.pt-table'),budget=page.locator('.pt-waterfall');
  const next=page.getByRole('button',{name:'Next step',exact:true});
  await expect(gauge.locator('.ptitle')).toHaveText('Flow');
  await expect(gauge.locator('.gaugeunit')).toHaveText('L/min');
  await expect(table.locator('thead th')).toHaveText(['Metric','Value','Change']);
  await next.click();await next.click();
  await expect(gauge.locator('.ptitle')).toHaveText('Volume per hour');
  await expect(gauge.locator('.gaugeunit')).toHaveText('m³/h');
  await expect(gauge.locator('.gaugeval')).toContainText('2.1');
  await expect(budget).toContainText('Compress');
  await page.screenshot({path:info.outputPath('hourly-override.png')});
  await next.click();
  await expect(gauge.locator('.ptitle')).toHaveText('Volume per hour');
  await expect(table.locator('thead th')).toHaveText(['Metric','Value','Change']);
  await page.locator('.path-chip[data-dv-path="offline"]').first().click();
  await expect(gauge.locator('.ptitle')).toHaveText('Flow');
  await expect(gauge.locator('.gaugeunit')).toHaveText('L/min');
  await next.click();await next.click();
  await expect(table.locator('thead th')).toHaveText(['Metric','Value','Stored locally','Change']);
  await expect(table).toContainText('L/min');
  await expect(budget).not.toContainText('Compress');
  await page.screenshot({path:info.outputPath('offline-columns.png')});
  await page.locator('.path-chip[data-dv-path="online"]').first().click();
  await expect(table.locator('thead th')).toHaveText(['Metric','Value','Change']);
});
