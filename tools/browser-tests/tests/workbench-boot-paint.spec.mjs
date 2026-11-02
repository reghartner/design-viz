import {test,expect} from '../helpers/test.mjs';

// Before the Workbench script runs, the browser paints whatever the static HTML and
// CSS show. Neither the editor toolbar nor a half-built Home screen may appear then.
const APP_SCRIPT=/<script>\s*\(function\(\)\{\s*'use strict';[\s\S]*<\/script>/;

test('page paints nothing before the Workbench script has chosen Home or the editor',async({page,server})=>{
  await page.route(server.origin+'/workbench.html',async route=>{
    const response=await route.fetch();const html=await response.text();
    expect(html).toMatch(APP_SCRIPT);
    await route.fulfill({response,body:html.replace(APP_SCRIPT,'')});
  });
  await page.goto(server.origin+'/workbench.html');
  await expect(page.locator('.workbench-brand')).toHaveCount(1);
  await expect(page.locator('#diagram-add')).toBeHidden();
  await expect(page.locator('.workspace-tools')).toBeHidden();
  await expect(page.locator('.welcome-example')).toBeHidden();
});

test('Home is visible with its example and without editor controls once the script runs',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');
  await expect(page.locator('html')).not.toHaveClass(/workbench-booting/);
  await expect(page.locator('#welcome-home')).toBeVisible();
  await expect(page.locator('#welcome-example-stage')).toBeVisible();
  await expect(page.locator('#diagram-add')).toBeHidden();
});
