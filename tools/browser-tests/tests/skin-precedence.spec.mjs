import {test,expect} from '../helpers/test.mjs';

function spec(skin,title){
  return {page:{title,skin,sections:[{id:'story',heading:'Story',diagram:{nodes:{a:{title:'A'}},rows:[['a']],edges:[]}}]}};
}

test('standalone async boot keeps live host and cookie choices with the saved skin as fallback',async({page,server})=>{
  let releaseAsync,asyncRequested;
  const requested=new Promise(resolve=>asyncRequested=resolve);
  await page.route('**/skin-*.json',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    if(name==='skin-async.json'){
      asyncRequested();await new Promise(resolve=>releaseAsync=resolve);
      await route.fulfill({json:spec('aurora','Async host choice')});return;
    }
    if(name==='skin-cookie.json'){await route.fulfill({json:spec('daylight','Cookie choice')});return;}
    await route.fulfill({json:spec('aurora','Saved fallback')});
  });

  await page.goto(server.origin+'/template/flowview.html?spec=skin-async.json#embed=story&sk=daylight');await requested;
  await page.evaluate(()=>window.dvSetSkin('terminal'));releaseAsync();
  await expect(page.locator('.doc-title')).toHaveText('Async host choice');
  await expect(page.locator('body')).toHaveClass(/\bsk-terminal\b/);await expect(page.locator('#docview')).toHaveClass(/\bsk-terminal\b/);

  await page.context().addCookies([{name:'dv_skin',value:'blueprint',url:server.origin}]);
  await page.goto(server.origin+'/template/flowview.html?spec=skin-cookie.json');
  await expect(page.locator('.doc-title')).toHaveText('Cookie choice');
  await expect(page.locator('body')).toHaveClass(/\bsk-blueprint\b/);await expect(page.locator('#docview')).toHaveClass(/\bsk-blueprint\b/);

  await page.context().clearCookies();
  await page.goto(server.origin+'/template/flowview.html?spec=skin-fallback.json');
  await expect(page.locator('.doc-title')).toHaveText('Saved fallback');
  await expect(page.locator('body')).toHaveClass(/\bsk-aurora\b/);await expect(page.locator('#docview')).toHaveClass(/\bsk-aurora\b/);
});
