import {test,expect,resources,trackResources} from '../helpers/test.mjs';

test('expanded Explore owns the full browser and returns to the same curated viewer',async({page,server})=>{
  await page.setViewportSize({width:1600,height:1000});await page.addInitScript(trackResources);
  await page.goto(server.origin+'/native/index.html#company-route');await page.waitForFunction(()=>!!window.__host);
  const baseline=await resources(page);
  await page.evaluate(()=>{__host.left(true);__host.right(true);});
  const alpha=page.locator('#alpha');
  await expect(alpha.locator('.preadout')).toHaveText('Success');
  const original=await alpha.locator('[data-flowview-native]').elementHandle();
  await alpha.getByRole('button',{name:'Explore canvas',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Explore alpha',exact:true});
  await expect(dialog).toBeVisible();
  const box=await dialog.locator('.explore-board').boundingBox();
  expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBe(1600);expect(box.height).toBe(1000);
  expect(await dialog.locator('[data-flowview-native]').evaluate((node,previous)=>node===previous,original)).toBe(true);
  await expect(dialog.locator('.preadout')).toHaveText('Success');
  await expect(dialog.locator('[data-view-id]')).toHaveAttribute('data-view-id','brief');
  await expect(page.locator('#beta .native-canvas')).toHaveCount(0);
  expect(await page.evaluate(()=>__host.requests.length)).toBe(2);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(alpha.locator('.explore-stage')).toBeHidden();
  await expect(alpha.locator('.preadout')).toHaveText('Success');
  await expect(alpha.getByRole('button',{name:'Explore canvas',exact:true})).toBeFocused();
  await alpha.getByRole('button',{name:'Explore canvas',exact:true}).click();
  await page.evaluate(()=>__host.left(false));await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#host-sentinel').click();
  await page.evaluate(()=>__host.right(false));
  await expect.poll(()=>resources(page)).toEqual(baseline);
  expect(new URL(page.url()).hash).toBe('#company-route');
});

test('Build with Claude carries the actual view and step into a checked workbench draft',async({page,server})=>{
  await page.goto(server.origin+'/backstage/index.html');
  await page.getByRole('button',{name:'Service flow',exact:true}).click();
  const viewer=page.getByRole('region',{name:/Flowview:/});
  await viewer.getByRole('button',{name:'Next step',exact:true}).click();
  const url=new URL(await page.getByRole('link',{name:'Build with Claude',exact:true}).getAttribute('href'));
  const address=new URLSearchParams(url.hash.slice(1));
  expect(address.get('v')).toBe('service-flow');
  expect(address.get('s')).not.toBe('quiet');
  expect(JSON.parse(address.get('fv')).revision).toMatch(/^[a-f0-9]{64}$/);
  const source=await page.evaluate(()=>JSON.stringify(__backstage.spec));
  const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'Build with Claude',exact:true}).click();const editor=await popupPromise;
  await expect(editor.locator('#workbench-workspace')).toBeVisible();
  await expect(editor.locator('#editor-agent')).toBeHidden();
  await expect(editor.getByRole('dialog',{name:'Choose your diagram folder.'})).toBeVisible();
  await expect(editor.locator('#folder-agent-workflow')).toHaveValue('external');
  expect(await editor.locator('#src').inputValue().then(JSON.parse)).toEqual(JSON.parse(source));
  await expect(editor.locator('#docview [data-view-id]')).toHaveAttribute('data-view-id','service-flow');
  await expect(editor.locator('#docview .stepid')).toHaveText(address.get('s'));
  expect(await editor.evaluate(()=>new URLSearchParams(location.hash.slice(1)).has('fv'))).toBe(false);
  expect(await page.evaluate(()=>__backstage.requests.length)).toBe(1);
});

test('a changed published story fails the handoff without replacing the existing draft',async({page,server})=>{
  await page.goto(server.origin+'/backstage/index.html');
  const link=page.getByRole('link',{name:'Build with Claude',exact:true});await expect(link).toBeVisible();
  const url=await link.getAttribute('href'),before='saved draft sentinel';
  await page.evaluate(value=>localStorage.setItem('dv-workbench-draft',value),before);
  await page.route('**/diagrams.json',async route=>{
    const response=await route.fetch(),data=await response.json();data.diagrams[0].spec.page.title='Changed publication';await route.fulfill({json:data});
  });
  await page.goto(url);
  await expect(page.locator('#canon-reader-error')).toContainText('changed since you opened');
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).toBe(before);
});

test('the canon adapter opens Build directly and reload restores the draft without another fetch',async({page,server})=>{
  await page.goto(server.origin+'/backstage/index.html');
  const link=page.getByRole('link',{name:'Build with Claude',exact:true});await expect(link).toBeVisible();
  const url=new URL(await link.getAttribute('href')),spec=await page.evaluate(()=>__backstage.spec);
  url.search='?canon=backstage-story';
  const reads=[];
  await page.route('**/api/canon/context?*',route=>{reads.push(route.request().url());return route.fulfill({json:{spec,catalog:{version:1,services:[]}}});});
  await page.goto(url.href);
  await expect(page.locator('#folder-agent-guide')).toBeVisible();
  expect(reads).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#workbench-workspace')).toBeVisible();
  expect(reads).toHaveLength(1);
  await expect(page.locator('#editor-agent')).toBeHidden();
  expect(new URL(page.url()).searchParams.has('canon')).toBe(false);
});

test('direct Build preserves an earlier draft through reload and makes it recoverable from Home',async({page,server})=>{
  await page.goto(server.origin+'/backstage/index.html');
  const url=await page.getByRole('link',{name:'Build with Claude',exact:true}).getAttribute('href');
  const before=' {"page":{"title":"Earlier customer story","blocks":[]}}\n';
  await page.evaluate(text=>localStorage.setItem('dv-workbench-draft',JSON.stringify({text,at:1})),before);
  await page.goto(url);await expect(page.locator('#folder-agent-guide')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-earlier-drafts'))[0].text)).toBe(before);
  await page.reload();await page.locator('#workspace-home').click();
  await page.locator('#welcome-earlier-drafts summary').click();
  await page.getByRole('button',{name:/Earlier customer story ·/}).click();
  await expect(page.locator('#src')).toHaveValue(before);
});

test('an unavailable Build target fails visibly before replacing the saved draft',async({page,server})=>{
  await page.goto(server.origin+'/backstage/index.html');
  const link=page.getByRole('link',{name:'Build with Claude',exact:true});await expect(link).toBeVisible();
  const url=new URL(await link.getAttribute('href')),hash=new URLSearchParams(url.hash.slice(1));
  hash.set('d','missing-section');url.hash=hash.toString();
  const before=JSON.stringify({text:'unfinished JSON {',at:1});
  await page.evaluate(value=>localStorage.setItem('dv-workbench-draft',value),before);
  await page.goto(url.href);
  await expect(page.locator('#canon-reader-error')).toContainText('linked story section is unavailable');
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).toBe(before);
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-earlier-drafts'))).toBeNull();
});
