import {test as base,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {trackResources} from './resources.mjs';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'};
export const test=base.extend({
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
    const failures=[];
    function watch(page){
      page.on('pageerror',error=>failures.push('page: '+error.message));
      page.on('console',message=>{if(message.type()==='error')failures.push('console: '+message.text());});
    }
    context.on('page',watch);
    context.on('request',request=>{
      const url=request.url();
      if(!url.startsWith(server.origin+'/')&&!url.startsWith('file:')&&!url.startsWith('data:')&&!url.startsWith('blob:'))failures.push('outbound: '+url);
    });
    context.on('requestfailed',request=>failures.push('request failed: '+request.url()+' '+request.failure()?.errorText));
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
    await testInfo.attach('browser-audit',{body:JSON.stringify(failures,null,2),contentType:'application/json'});
    expect(failures,'No page/console/request errors or outbound requests').toEqual([]);
  },{auto:true}],
});
export {expect,trackResources};
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
