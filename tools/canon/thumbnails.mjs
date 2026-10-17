/* Build-only renderer capture. No browser code or dependency ships to nginx. */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,realpath,stat,lstat,mkdir,mkdtemp,writeFile,rename,rm,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {entrypoint,entrypointAssets,fontCss}=require('../source-loader.cjs');
const WIDTH=960,HEIGHT=600,MAX_BYTES=750*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(file,root)=>file.startsWith(root+path.sep);
const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};

async function staticPermissions(file,{directory=false,name}={}){
  // Use the checked handle for chmod; never follow a final-component symlink.
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK|(directory?constants.O_DIRECTORY:0));
  try{
    const info=await handle.stat();
    if(directory?!info.isDirectory():!info.isFile())throw Error('Thumbnail output must be a regular '+(directory?'directory':'file'));
    if(name && hash(await handle.readFile())+'.png'!==name)throw Error('Existing thumbnail batch differs');
    await handle.chmod(directory?0o755:0o644);
  }finally{await handle.close();}
}

export async function thumbnailAsset(url,resourceType,assetRoot){
  assetRoot=await realpath(assetRoot);url=new URL(url);
  if(url.origin!=='http://flowview-preview.invalid' || resourceType!=='image' || url.search || url.hash)throw Error('Outbound or non-image request blocked: '+url.href);
  const relative=decodeURIComponent(url.pathname).slice(1);
  if(relative.includes('\\') || relative.includes('\0'))throw Error('Invalid asset path');
  const file=await realpath(path.resolve(assetRoot,relative)),type=types[path.extname(file).toLowerCase()];
  if(!inside(file,assetRoot) || !type || !(await stat(file)).isFile())throw Error('Asset outside approved image root: '+relative);
  if((await stat(file)).size>8*1024*1024)throw Error('Image asset exceeds 8 MB: '+relative);
  return {body:await readFile(file),contentType:type};
}

export async function createThumbnailCapture(assetRoot){
  const {chromium}=require('../browser-tests/node_modules/@playwright/test');
  assetRoot=await realpath(assetRoot);
  const native=entrypoint('native'),assets=entrypointAssets('native');
  const css=fontCss('all')+'\n'+assets.styles.map(a=>a.source).join('\n');
  const html=`<!doctype html><meta charset="utf-8"><base href="http://flowview-preview.invalid/"><style>${css}
html,body{margin:0;background:#fff}#view{width:1200px;max-width:none;margin:0;padding:16px;box-sizing:border-box}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.doc-sec{box-shadow:none}
.thumbnail-ready .diagram-views,.thumbnail-ready .board-size,.thumbnail-ready .board-zoom,.thumbnail-ready .termbar,.thumbnail-ready .playback-mode-rail,.thumbnail-ready .primary-modes,.thumbnail-ready .mtoggle,.thumbnail-ready .canon-evidence,.thumbnail-ready .sec-eyebrow,.thumbnail-ready .prosetoggle,.thumbnail-ready .sec-copy,.thumbnail-ready .secondary-flow:not([open]),.thumbnail-ready [data-layout-key="steps"]{display:none!important}
.thumbnail-ready[data-thumbnail-visual]>.sec-heading-row,.thumbnail-ready[data-thumbnail-visual]>.sec-prose,.thumbnail-ready[data-thumbnail-visual]>.sec-teaser{display:none!important}
.thumbnail-ready .sec-heading-row{margin-top:0}.thumbnail-ready .sec-h{font-size:18px}.thumbnail-ready .sec-h a,.thumbnail-ready .sec-h button{display:none!important}
</style>${assets.icons}<div id="view"></div><script>${native.body.replace(/<\/script/gi,'<\\/script')}</script>`;
  const browser=await chromium.launch({headless:true});
  return {async close(){await browser.close();},async capture(entry){
    const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);
    page.on('pageerror',error=>errors.push(error.message));
    await context.routeWebSocket('**/*',socket=>{errors.push('Outbound WebSocket blocked: '+socket.url());socket.close();});
    const sourceDirectory=path.dirname(await realpath(entry.filename));
    await context.route('**/*',async route=>{
      try{
        await route.fulfill(await thumbnailAsset(route.request().url(),route.request().resourceType(),assetRoot));
      }catch(error){errors.push(error.message);await route.abort();}
    });
    let timedOut=false;const deadline=setTimeout(()=>{timedOut=true;void context.close().catch(()=>{});},30000);
    try{
      const base='http://flowview-preview.invalid/'+path.relative(assetRoot,sourceDirectory).split(path.sep).map(encodeURIComponent).join('/')+'/';
      await page.setContent(html.replace('<base href="http://flowview-preview.invalid/">','<base href="'+base+'">'),{waitUntil:'load'});
      await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
      const selected=await page.evaluate(raw=>{
        const p=normalize(raw),records=sectionRecords(p);
        if(records.length>100 || records.some(r=>r.section.diagram && (Object.keys(r.section.diagram.nodes || {}).length>1000 || (r.section.diagram.edges || []).length>3000)))throw Error('Document exceeds bounded thumbnail workload');
        records.forEach(r=>{if(r.section.diagram)r.section.diagram.autoplay=false;});
        applySkinClasses(document.body,view,p.skin || DEFAULT_SKIN);
        const ctl=window.thumbnailController=renderPage(view,p,p.skin,null,{compatibilityNotice:false});
        ctl.steppers.forEach(s=>s.stepper.pause());
        const owners=ctl.views.owners.filter(o=>o.tabBlock==null || o.tab===0).sort((a,b)=>Math.min(...a.records.map(r=>r.number))-Math.min(...b.records.map(r=>r.number)));
        const owner=owners.find(o=>o.current && o.current.members.length);
        if(!owner)throw Error('Opening View has no capturable content');
        const member=owner.current.members.find(m=>m.record.section.diagram) || owner.current.members[0],rec=member.record.runtime;
        ctl.views.ensure(rec,owner.current.id,true);ctl.steppers.forEach(s=>s.stepper.pause());
        rec.sectionEl.dataset.thumbnailSelected='true';if(member.record.section.diagram)rec.sectionEl.dataset.thumbnailVisual='true';
        return {section:rec.reference,view:owner.current.id};
      },entry.resolvedSpec || entry.spec);
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
      await page.clock.runFor(100); // Complete resize/font observers without advancing story playback.
      const section=page.locator('[data-thumbnail-selected]');
      await section.scrollIntoViewIfNeeded();
      // Fit visible graph cameras using the production control; authored panel
      // composition and first-step visibility remain unchanged.
      for(const fit of await section.getByRole('button',{name:'Fit diagram',exact:true}).all())if(await fit.isVisible())await fit.click();
      await section.evaluate(el=>el.classList.add('thumbnail-ready'));
      await page.clock.runFor(100);
      const bounds=await section.boundingBox();
      if(!bounds || bounds.width<1 || bounds.height<1 || bounds.width>2400 || bounds.height>6000)throw Error('Opening section exceeds bounded capture size (2400 × 6000)');
      if(errors.length)throw Error(errors.join('\n'));
      const original=await section.screenshot({animations:'disabled',timeout:20000});
      const result=await page.evaluate(async({data,width,height})=>{
        const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
        const scale=Math.min(width/img.width,height/img.height);ctx.drawImage(img,(width-img.width*scale)/2,(height-img.height*scale)/2,img.width*scale,img.height*scale);
        return canvas.toDataURL('image/png').split(',')[1];
      },{data:original.toString('base64'),width:WIDTH,height:HEIGHT});
      const png=Buffer.from(result,'base64');if(png.length>MAX_BYTES)throw Error('Thumbnail exceeds 750 KB');
      const observed=await section.evaluate(el=>{
        const visible=node=>{const r=node.getBoundingClientRect();return r.width>0 && r.height>0 && getComputedStyle(node).visibility!=='hidden';};
        const nodes=[...el.querySelectorAll('.node[data-dv-node]')].filter(visible);
        const clippedNodes=nodes.filter(node=>{const board=node.closest('.board');if(!board)return false;const b=board.getBoundingClientRect(),r=node.getBoundingClientRect();return r.left<b.left-2 || r.right>b.right+2 || r.top<b.top-2 || r.bottom>b.bottom+2;}).length;
        return {clippedNodes,nodes:nodes.map(n=>n.textContent),panels:[...el.querySelectorAll('.pwidget')].filter(visible).map(n=>n.innerText),images:[...el.querySelectorAll('img')].filter(visible).map(n=>({width:n.naturalWidth,height:n.naturalHeight})),text:el.innerText};
      });
      return {png,...selected,observed};
    }catch(error){throw new Error('Thumbnail capture failed for '+entry.id+': '+(timedOut?'exceeded 30 seconds':error.message));}
    finally{clearTimeout(deadline);await context.close();}
  }};
}

export async function captureLibraryThumbnails({entries,library,output,assetRoot}){
  if(!entries.length)return;
  const directory=path.join(path.dirname(output),'library-thumbnails');
  // This namespace is publisher-owned. Never follow an existing symlink.
  try{const info=await lstat(directory);if(!info.isDirectory() || info.isSymbolicLink())throw Error('Thumbnail output must be a real directory');}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(directory,{recursive:true});
  const stage=await mkdtemp(path.join(directory,'.stage-'));let capture;
  try{
    capture=await createThumbnailCapture(assetRoot);const images=[];
    for(const entry of entries){const result=await capture.capture(entry),name=hash(result.png)+'.png';await writeFile(path.join(stage,name),result.png,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});images.push({name});}
    const batch=hash(JSON.stringify(images.map((image,i)=>[library.diagrams[i].revision,image.name]))),target=path.join(directory,batch);
    // mkdtemp deliberately starts private (0700). Publish readable files and
    // traversable directories regardless of the build process's umask.
    for(const image of images)await staticPermissions(path.join(stage,image.name),{name:image.name});
    await staticPermissions(stage,{directory:true});
    await staticPermissions(directory,{directory:true});
    try{await rename(stage,target);}catch(error){
      if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;
      const info=await lstat(target);if(info.isSymbolicLink() || !info.isDirectory())throw Error('Thumbnail batch must be a real directory');
      for(const image of images)await staticPermissions(path.join(target,image.name),{name:image.name});
      await staticPermissions(target,{directory:true});
    }
    images.forEach((image,i)=>{library.diagrams[i].preview={version:1,url:'library-thumbnails/'+batch+'/'+image.name,revision:library.diagrams[i].revision,width:WIDTH,height:HEIGHT};});
  }finally{if(capture)await capture.close();await rm(stage,{recursive:true,force:true});}
}
