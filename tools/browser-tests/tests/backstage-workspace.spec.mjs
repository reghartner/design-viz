import {test,expect,resources,trackResources} from '../helpers/test.mjs';

const overlaps=(a,b)=>!(a.x+a.width<=b.x||a.x>=b.x+b.width||a.y+a.height<=b.y||a.y>=b.y+b.height);
async function expandedGeometry(dialog){
  const actions=await dialog.getByRole('toolbar',{name:'Diagram actions'}).boundingBox();
  const nav=await dialog.locator('.explore-navigation').boundingBox(),stage=await dialog.locator('.explore-stage').boundingBox(),row=await dialog.getByRole('group',{name:'Explore sizing and zoom',exact:true}).boundingBox();
  const controls=[];
  for(const control of await dialog.locator('.explore-navigation button,.viewport-actions button,.explore-tools button').all()){
    const box=await control.boundingBox();if(box)controls.push(box);
  }
  return {actions,nav,stage,row,controls};
}
async function canvasCamera(dialog){
  return dialog.locator('.explore-board').evaluate(el=>{
    const svg=el.querySelector('svg'),width=parseFloat(el.style.getPropertyValue('--explore-width'));
    const mx=parseFloat(el.style.getPropertyValue('--explore-margin-x')),my=parseFloat(el.style.getPropertyValue('--explore-margin-y'));
    return {zoom:width/svg.viewBox.baseVal.width,x:(el.scrollLeft+el.clientWidth/2-mx)/width,
      y:(el.scrollTop+el.clientHeight/2-my)/(width*svg.viewBox.baseVal.height/svg.viewBox.baseVal.width)};
  });
}

test('expanded Explore owns the full browser and returns to the same curated viewer',async({page,server},info)=>{
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
  const shell=await dialog.locator('.viewer-diagram-canvas').boundingBox(),desktop=await expandedGeometry(dialog);
  const board=await dialog.locator('.explore-board').boundingBox();
  expect(shell).toEqual({x:0,y:0,width:1600,height:1000});expect(desktop.stage.y).toBeGreaterThanOrEqual(desktop.nav.y+desktop.nav.height);expect(board).toEqual(desktop.stage);
  expect(desktop.row.y).toBe(desktop.nav.y+desktop.nav.height);expect(desktop.stage.y).toBe(desktop.row.y+desktop.row.height);
  await expect(dialog.getByRole('link',{name:'Edit in workbench',exact:true})).toBeInViewport();
  expect(desktop.actions.y).toBe(desktop.nav.y);expect(overlaps(desktop.actions,desktop.nav)).toBe(false);
  expect(desktop.controls.every(control=>!overlaps(desktop.actions,control))).toBe(true);
  const fittedCamera=await canvasCamera(dialog);await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect.poll(async()=>(await canvasCamera(dialog)).zoom).toBeGreaterThan(fittedCamera.zoom);
  await dialog.locator('.explore-board').evaluate(el=>{el.scrollLeft+=80;el.scrollTop+=20;});const savedCamera=await canvasCamera(dialog);
  await info.attach('backstage-expanded-desktop',{body:await page.screenshot(),contentType:'image/png'});
  expect(await dialog.locator('[data-flowview-native]').evaluate((node,previous)=>node===previous,original)).toBe(true);
  await expect(dialog.locator('.preadout')).toHaveText('Success');
  await expect(dialog.locator('[data-view-id]')).toHaveAttribute('data-view-id','brief');
  await expect(page.locator('#beta .native-canvas')).toHaveCount(0);
  expect(await page.evaluate(()=>__host.requests.length)).toBe(2);
  await page.setViewportSize({width:480,height:800});const narrow=await expandedGeometry(dialog);
  expect(narrow.nav.y).toBeGreaterThanOrEqual(narrow.actions.y+narrow.actions.height);
  expect(narrow.row.y).toBe(narrow.nav.y+narrow.nav.height);expect(narrow.stage.y).toBe(narrow.row.y+narrow.row.height);
  await expect(dialog.getByRole('link',{name:'Edit in workbench',exact:true})).toBeInViewport();
  expect(narrow.controls.every(control=>!overlaps(narrow.actions,control))).toBe(true);
  await expect(dialog.getByRole('img',{name:'flow diagram'})).toBeVisible();
  await info.attach('backstage-expanded-narrow',{body:await page.screenshot(),contentType:'image/png'});
  await page.setViewportSize({width:1600,height:1000});const restored=await expandedGeometry(dialog);
  expect(restored.actions.y).toBe(restored.nav.y);expect(overlaps(restored.actions,restored.nav)).toBe(false);
  await expect.poll(async()=>{const actual=await canvasCamera(dialog);
    return Math.max(...Object.keys(savedCamera).map(key=>Math.abs(actual[key]-savedCamera[key])));
  }).toBeLessThan(.01);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(alpha.locator('.explore-stage')).toBeHidden();
  await expect(alpha.locator('.preadout')).toHaveText('Success');
  expect(await alpha.locator('[data-flowview-native]').evaluate(node=>[
    node.style.getPropertyValue('--flowview-host-actions-inline-offset'),
    node.style.getPropertyValue('--flowview-host-actions-block-offset')
  ])).toEqual(['','']);
  await expect(alpha.getByRole('button',{name:'Explore canvas',exact:true})).toBeFocused();
  await alpha.getByRole('button',{name:'Explore canvas',exact:true}).click();
  const reopened=await expandedGeometry(dialog);expect(reopened.actions.y).toBe(reopened.nav.y);expect(overlaps(reopened.actions,reopened.nav)).toBe(false);
  expect(reopened.controls.every(control=>!overlaps(reopened.actions,control))).toBe(true);
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
  await expect(editor.locator('#editor-agent')).toBeVisible();
  await expect(editor.locator('#editor-agent [role=tab]')).toHaveCount(0);
  await expect(editor.locator('#editor-agent')).toHaveAttribute('data-connected','false');
  await expect(editor.getByRole('dialog',{name:'How are you starting?'})).toBeVisible();
  await expect(editor.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
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
  await page.route('**/backstage-story.spec.json',async route=>{
    const response=await route.fetch(),data=await response.json();data.page.title='Changed publication';await route.fulfill({json:data});
  });
  await page.goto(url);
  await expect(page.locator('#canon-reader-error')).toContainText('revision mismatch');
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
  await expect(page.locator('#editor-agent')).toBeVisible();
  await expect(page.locator('#editor-agent [role=tab]')).toHaveCount(0);
  await expect(page.locator('#editor-agent')).toHaveAttribute('data-connected','false');
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

test('visible host Edit opens the exact Explore chapter and step in the Canon reader then Workbench',async({page,server},info)=>{
  await page.goto(server.origin+'/backstage/index.html');await page.getByRole('button',{name:'Service flow',exact:true}).click();
  await page.getByRole('button',{name:'Explore canvas',exact:true}).click();const dialog=page.getByRole('dialog',{name:/^Explore /});
  await dialog.getByRole('button',{name:'Next step',exact:true}).click();
  const source=await page.evaluate(()=>__backstage.spec);
  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});const edit=dialog.getByRole('link',{name:'Edit in workbench',exact:true});
    await expect(edit).toBeInViewport();await expect(dialog.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
    await expect.poll(()=>dialog.locator('.explore-navigation-actions').evaluate(el=>Array.from(el.querySelectorAll('button,summary')).filter(control=>control.checkVisibility()).map(control=>{const r=control.getBoundingClientRect();return {name:control.textContent,left:r.left,right:r.right};}).filter(r=>r.left<0 || r.right>innerWidth))).toEqual([]);
    const geometry=await expandedGeometry(dialog);expect(geometry.controls.every(control=>!overlaps(geometry.actions,control))).toBe(true);
    expect(geometry.row.y).toBe(geometry.nav.y+geometry.nav.height);expect(geometry.stage.y).toBe(geometry.row.y+geometry.row.height);
    const url=new URL(await edit.getAttribute('href')),address=new URLSearchParams(url.hash.slice(1)),handoff=JSON.parse(address.get('fv'));
    expect(address.get('v')).toBe('service-flow');expect(address.get('s')).not.toBe('quiet');expect(handoff.action).toBe('edit');expect(handoff.entity).toBe('component:default/recording');
    await info.attach('host-edit-'+width,{body:await page.screenshot(),contentType:'image/png'});
    const popupPromise=page.waitForEvent('popup');await edit.click();const reader=await popupPromise;
    await expect(reader.locator('#canon-reader .explore-navigation #canon-reader-edit')).toBeVisible();
    await reader.locator('#canon-reader-edit').click();await expect(reader.locator('#workbench-workspace')).toBeVisible();
    expect(JSON.parse(await reader.locator('#src').inputValue())).toEqual(source);
    await expect(reader.locator('#docview [data-view-id]')).toHaveAttribute('data-view-id','service-flow');await expect(reader.locator('#docview .stepid')).toHaveText(address.get('s'));
    await expect(reader.locator('#undo-builder')).toBeDisabled();await reader.close();
  }
});
