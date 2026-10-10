import {test as base,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {trackResources} from './resources.mjs';
import companyBrandHelper from '../../../tests/helpers/company-brand.cjs';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'};
export const activeCompanyBrand=companyBrandHelper.companyBrand();
export const test=base.extend({
  // Fresh profiles would auto-start the first-run guided tour and its scrim
  // would swallow every click. Seed the completion flag for all contract
  // pages; tour behavior itself is tested explicitly via #tour=1 (which
  // overrides the flag) in tour.spec.mjs.
  context:async({context},use)=>{
    await context.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(e){}});
    await use(context);
  },
  server:[async({},use)=>{
    const root=process.env.FLOWVIEW_BROWSER_ROOT;
    const server=createServer(async(req,res)=>{
      try{
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
        const file=path.resolve(root,'.'+pathname);
        if(!file.startsWith(root+path.sep))throw Error('Outside fixture root');
        const bytes=await readFile(file);
        const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream'};
        if(pathname.startsWith('/forge/'))headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'";
        res.writeHead(200,headers);res.end(bytes);
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{await use({origin:'http://127.0.0.1:'+server.address().port,root});}
    finally{await new Promise(resolve=>server.close(resolve));}
  },{scope:'worker'}],
  audit:[async({context,server},use,testInfo)=>{
    const failures=[],allowedAborts=new WeakSet(),expectedAborts=[];
    // A test may deliberately cancel a particular in-flight request. Only that
    // identity's ERR_ABORTED is allowed; timeouts, HTTP errors and other requests
    // remain failures. Keep cancellations visible in the audit artifact.
    failures.allowAbort=request=>allowedAborts.add(request);
    function watch(page){
      page.on('pageerror',error=>failures.push('page: '+error.message));
      page.on('console',message=>{if(message.type()==='error')failures.push('console: '+message.text());});
    }
    context.on('page',watch);
    context.on('request',request=>{
      const url=request.url();
      if(!url.startsWith(server.origin+'/')&&!url.startsWith('file:')&&!url.startsWith('data:')&&!url.startsWith('blob:'))failures.push('outbound: '+url);
    });
    context.on('requestfailed',request=>{
      const reason=request.failure()?.errorText;
      if(allowedAborts.has(request) && reason==='net::ERR_ABORTED'){allowedAborts.delete(request);expectedAborts.push(request.url());return;}
      failures.push('request failed: '+request.url()+' '+reason);
    });
    context.on('response',response=>{if(response.status()>=400)failures.push('HTTP '+response.status()+': '+response.url());});
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(/^https?:/.test(url)&&new URL(url).origin!==server.origin)return route.abort();
      return route.continue();
    });
    await use(failures);
    if(testInfo.status!==testInfo.expectedStatus||failures.length){
      for(const [index,page] of context.pages().entries())if(!page.isClosed())await testInfo.attach('page-'+index,{body:await page.screenshot(),contentType:'image/png'});
    }
    if(expectedAborts.length)await testInfo.attach('intentional-request-cancellations',{body:JSON.stringify(expectedAborts,null,2),contentType:'application/json'});
    delete failures.allowAbort;
    await testInfo.attach('browser-audit',{body:JSON.stringify(failures,null,2),contentType:'application/json'});
    expect(failures,'No page/console/request errors or outbound requests').toEqual([]);
  },{auto:true}],
});
export {expect,trackResources};
export async function expectCompanyBrand(container,brand=activeCompanyBrand){
  const lockup=container.locator('.fv-brand').first();
  await expect(lockup.locator('.fv-brand-name')).toHaveText(brand.app);
  if(brand.logoImage){
    await expect(lockup.locator('img.fv-brand-mark')).toHaveAttribute('src',brand.logoImage);
    await expect(lockup.locator('img.fv-brand-mark')).toHaveAttribute('alt',brand.app+' logo');
  }else{
    await expect(lockup.locator('.fv-brand-monogram')).toHaveText(brand.logo);
    await expect(lockup.locator('.fv-brand-monogram')).toHaveAttribute('aria-label',brand.app+' logo');
  }
  await expect(lockup).toHaveAttribute('style','--fv-brand-accent:'+brand.accent+';--fv-brand-bg:'+brand.bg+';--fv-brand-fg:'+brand.fg);
}
// A deliberate authoring gesture, used only when a test needs this exact group.
export async function openInspectorGroup(group){
  await expect(group).toHaveCount(1);
  if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();
}
export async function paste(page,text){
  await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(text);
  await page.locator('#welcome-paste-form button[type=submit]').click();
  await expect(page.locator('#src')).toHaveValue(text);
}
export async function pointerTo(page,from,to,{release=true}={}){
  await from.hover();
  const a=await from.boundingBox(),b=await to.boundingBox();
  expect(a).not.toBeNull();expect(b).not.toBeNull();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});
  if(release)await page.mouse.up();
}
export async function resources(page){return page.evaluate(()=>__resourceCounts());}

// Editor contracts keep the selected chapter mode and dismiss authoring windows.
export async function prepareEditorSurface(page){
  // The selected Chapter owns its surface; closing tools never overrides it.
  await closeTools(page);
}
export async function closeTools(page){
  for(const name of ['agent','inspect','steps','outline','json','file']){
    const close=page.locator('#workspace-window-'+name+' .workspace-window-close');
    if(await close.isVisible()){await page.locator('#editor-tab-'+name).click();await close.click();}
  }
}

export async function inspectPageElement(page,element){
  await closeTools(page);await element.click();
  if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
}

// Widget/prose authoring contracts open Inspect on the selected chapter surface.
export async function pastePage(page,text){
  await paste(page,text);await prepareEditorSurface(page);
  await page.locator('#editor-tab-inspect').click();
}

export async function chooseAddDestination(page,index){
  await page.locator('#diagram-add').click();
  await page.locator('.diagram-add-destination-picker summary').click();
  await page.locator('#diagram-add-target').selectOption(String(index));
  await page.locator('#diagram-add-close').click();
}
export async function chapterOptions(page,section){
  const options=page.locator('#docview .explore-navigation').locator('.section-view-options');
  if(await options.getAttribute('open')===null)await options.locator('summary').click();
  return options;
}
export async function arrangeChapter(page,section){
  await chapterOptions(page,section);
  await page.locator('#docview .explore-navigation').getByRole('button',{name:'Arrange selected section…',exact:true}).click();
}

export async function openAutoArrange(page){
 await chapterOptions(page);
 await page.locator('#docview .explore-navigation').getByRole('button',{name:'Auto arrange',exact:true}).click();
}

export async function panelsOptions(page,root){
 const menu=(root || page.locator('#docview .explore-navigation')).locator('.explore-panel-menu');
 if(await menu.getAttribute('open')===null)await menu.locator('summary').click();
 return menu;
}

export async function canvasTools(page){
 const menu=page.locator('#workspace-canvas-tools');
 if(await menu.getAttribute('open')===null)await menu.locator('summary').click();
 return menu;
}
