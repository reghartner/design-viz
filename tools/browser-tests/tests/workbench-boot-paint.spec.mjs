import {test,expect} from '../helpers/test.mjs';

// Before the Workbench script runs, the browser paints whatever the static HTML and
// CSS above it show. Neither the editor toolbar nor a half-built Home screen may appear then.
const APP_SCRIPT_START=/<script>\s*\(function\(\)\{\s*'use strict';/;

async function serveEdited(page,server,edit){
  await page.route(server.origin+'/workbench.html',async route=>{
    const response=await route.fetch();const html=await response.text();
    expect(html).toMatch(APP_SCRIPT_START);
    await route.fulfill({response,body:edit(html)});
  });
  await page.goto(server.origin+'/workbench.html');
}

test('page paints nothing before the Workbench script runs',async({page,server})=>{
  // Serve the document only up to the Workbench script: exactly what the browser has parsed
  // and can paint while that script is still downloading, parsing or running.
  await serveEdited(page,server,html=>html.slice(0,html.search(APP_SCRIPT_START)));
  await expect(page.locator('.workbench-brand')).toHaveCount(1);
  await expect(page.locator('html')).toHaveClass(/workbench-booting/);
  await expect(page.locator('#diagram-add')).toBeHidden();
  await expect(page.locator('.workspace-tools')).toBeHidden();
  await expect(page.locator('.welcome-example')).toBeHidden();
});

test('a Workbench script that throws at start leaves the page visible rather than blank',async({page,server,audit})=>{
  await serveEdited(page,server,html=>html.replace(APP_SCRIPT_START,match=>match+"throw new Error('boot failure');"));
  const expected='page: boot failure';
  await expect.poll(()=>audit).toContain(expected);audit.splice(audit.indexOf(expected),1);
  await expect(page.locator('html')).not.toHaveClass(/workbench-booting/);
  await expect(page.locator('.workbench-brand')).toBeVisible();
});

test('Home is visible with its example and without editor controls once the script runs',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');
  await expect(page.locator('html')).not.toHaveClass(/workbench-booting/);
  await expect(page.locator('#welcome-home')).toBeVisible();
  await expect(page.locator('#welcome-example-stage')).toBeVisible();
  await expect(page.locator('#diagram-add')).toBeHidden();
});
