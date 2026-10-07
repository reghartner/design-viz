import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {entrypoint,entrypointAssets,fontCss}=require('../source-loader.cjs');
export async function createCapture(){
const {chromium}=require('../browser-tests/node_modules/@playwright/test'),native=entrypoint('native'),assets=entrypointAssets('native');
const css=fontCss('all')+'\n'+assets.styles.map(a=>a.source).join('\n');
const harnessCSS='html,body{margin:0;background:#fff}#capture{box-sizing:border-box;padding:20px;background:#fff}.docview{max-width:none;margin:0}.doc-sec{box-shadow:none}*,*::before,*::after{animation:none!important;transition:none!important}';
const html=`<!doctype html><meta charset="utf-8"><style>${css}\n${harnessCSS}</style>${assets.icons}<main id="capture"><div id="view"></div></main><script>${native.body.replace(/<\/script/gi,'<\\/script')}\nwindow.paint=(raw,width,target)=>{if(window.ctl)window.ctl.destroy();capture.style.width=width+'px';capture.style.minHeight='';applySkinClasses(document.body,view,'pastel');window.ctl=renderPage(view,normalize(raw),'pastel',null,{layoutTarget:target});window.ctl.sections[0].stepper.jump(5);};</script>`;
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',r=>{if(r.request().url().startsWith('data:')||r.request().url()==='about:blank')return r.continue();errors.push('Unexpected external resource');return r.abort();});
await page.setContent(html);await page.evaluate(()=>{const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...a){super(...(a.length?a:['2026-01-15T09:36:00Z']));}static now(){return 1768469760000;}};});
const cameraPolicy='Native Fit diagram then bounded Zoom in and native board scrolling to center frozen node bounds; same policy for both candidates';
async function paint(spec,s,savedCamera=null){
 await page.evaluate(({spec,s})=>{window.scrollTo(0,0);window.paint(spec,s.host.width,s.host.profile);},{spec,s});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 await page.evaluate((savedCamera)=>{
  const tile=document.querySelector('[data-layout-key="diagram"]');if(!tile||tile.hidden)return;
  const board=tile.querySelector('.board'),nodes=[...tile.querySelectorAll('.node[data-dv-node]')];if(!board||!nodes.length)throw Error('Visible graph missing nodes');
  const bounds=()=>{const r=nodes.map(n=>n.getBoundingClientRect());return {x:Math.min(...r.map(b=>b.x)),y:Math.min(...r.map(b=>b.y)),right:Math.max(...r.map(b=>b.right)),bottom:Math.max(...r.map(b=>b.bottom))};};
  tile.querySelector('[aria-label="Fit diagram"]').click();
  const room=()=>{const frame=board.getBoundingClientRect(),legendH=tile.querySelector('.lg')?.getBoundingClientRect().height||0;return {frame,legendH};};
  for(let i=0;i<16;i++){const b=bounds(),{frame,legendH}=room();if((b.right-b.x)*1.25>frame.width-32||(b.bottom-b.y)*1.25>frame.height-legendH-32)break;const button=tile.querySelector('[aria-label="Zoom in"]');if(button.disabled)break;button.click();}
  for(let i=0;i<4;i++){const b=bounds(),{frame,legendH}=room(),scale=frame.width/board.offsetWidth;
   board.scrollLeft+=(b.x+(b.right-b.x)/2-(frame.x+frame.width/2))/scale;
   board.scrollTop+=(b.y+(b.bottom-b.y)/2-(frame.y+legendH+(frame.height-legendH)/2))/scale;
  }

 },savedCamera);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 if(errors.length)throw Error(errors.join('\n'));
 const observed=await page.evaluate(()=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const panels=[...document.querySelectorAll('[data-layout-key^="panel:"]')].map(tile=>{
   const widget=tile.querySelector('.pwidget'),body=tile.querySelector('.pbody'),r=rect(widget),children=[...body.children].map(rect),bottom=Math.max(rect(body).y,...children.map(c=>c.bottom));
   return {key:tile.dataset.layoutKey,text:widget.textContent.replace(/\s+/g,' ').trim(),rect:r,overflowX:Math.max(0,widget.scrollWidth-widget.clientWidth),overflowY:Math.max(0,widget.scrollHeight-widget.clientHeight),neededHeight:widget.scrollHeight,neededWidth:widget.scrollWidth,nativeColumnPitch:(tile.closest('.section-layout-grid').clientWidth+8)/24,minimumTextPx:Math.min(...[...body.querySelectorAll('*')].filter(e=>e.namespaceURI==='http://www.w3.org/1999/xhtml'&&e.clientWidth>1&&e.clientHeight>1&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize)*(e.getBoundingClientRect().width/e.offsetWidth))),emptyAreaFraction:Math.max(0,(r.bottom-bottom)/r.height),nestedScroll:[...body.querySelectorAll('*')].filter(e=>e.clientWidth>1&&e.clientHeight>1&&getComputedStyle(e).overflow==='auto'&&(e.scrollHeight-e.clientHeight>4||e.scrollWidth-e.clientWidth>4)).map(e=>({class:e.className,vertical:e.scrollHeight-e.clientHeight,horizontal:e.scrollWidth-e.clientWidth}))};
  });
  const tile=document.querySelector('[data-layout-key="steps"]'),bar=tile.querySelector('.termbar'),c=rect(bar),buttons=[...bar.querySelectorAll('button')].filter(b=>!b.hidden&&b.getBoundingClientRect().width>0),tr=rect(tile);
  const controls={...c,visible:c.width>0&&c.height>0,overflowX:Math.max(0,bar.scrollWidth-bar.clientWidth),overflowY:Math.max(0,bar.scrollHeight-bar.clientHeight),neededHeight:bar.scrollHeight,clippedButtons:buttons.filter(b=>{const r=rect(b);return r.x<tr.x-1||r.right>tr.right+1||r.y<tr.y-1||r.bottom>tr.bottom+1;}).length,inInitialViewport:c.y>=0&&c.bottom<=1000};
  const g=document.querySelector('[data-layout-key="diagram"]');let graph=null;
  if(g&&!g.hidden){const board=g.querySelector('.board'),f=rect(board),legend=g.querySelector('.lg'),lh=legend?.getBoundingClientRect().height||0,nodes=[...g.querySelectorAll('.node[data-dv-node]')],svg=g.querySelector('.boardcanvas>svg'),scale=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
   graph={nodeCount:nodes.length,clippedNodes:nodes.filter(n=>{const r=rect(n);return r.x<f.x-2||r.right>f.right+2||r.y<f.y+lh-2||r.bottom>f.bottom+2;}).length,minimumLabelPx:Math.min(...nodes.map(n=>parseFloat(getComputedStyle(n.querySelector('.t1')).fontSize)*scale)),camera:{scrollLeft:board.scrollLeft,scrollTop:board.scrollTop,zoomWidth:board.style.getPropertyValue('--board-zoom-width'),viewportHeight:board.style.getPropertyValue('--board-viewport-height'),scale},rect:f,legendHeight:lh,nodeRects:nodes.map(n=>({id:n.dataset.dvNode,...rect(n)}))};
  }
  return {panels,controls,graph,snapshot:window.ctl.sections[0].stepper.current()};
 });
 observed.controls.reachableAfterScroll=await page.evaluate(()=>{const tile=document.querySelector('[data-layout-key="steps"]');tile.scrollIntoView({block:'center'});const button=tile.querySelector('button:not([disabled])'),r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),reachable=!!hit&&(hit===button||button.contains(hit));window.scrollTo(0,0);return reachable;});
 const interior=await page.evaluate(()=>{
  const grid=document.querySelector('.section-layout-grid'),gr=grid.getBoundingClientRect(),scale=gr.width/grid.offsetWidth;
  const panels=[...document.querySelectorAll('[data-layout-key^="panel:"]')].map(tile=>{
   const widget=tile.querySelector('.pwidget'),body=tile.querySelector('.pbody'),wr=widget.getBoundingClientRect(),br=body.getBoundingClientRect(),type=[...widget.classList].find(c=>c.startsWith('pt-'))?.slice(3),contract=PanelRegistry.get(type)?.layout?.sectionSizing||{};
   const element=contract.contentSelector&&body.querySelector(contract.contentSelector),er=element?.getBoundingClientRect();let content=er?{width:er.width,height:er.height}:null;
   if(element?.tagName.toLowerCase()==='svg'&&element.viewBox.baseVal.width){const v=element.viewBox.baseVal,k=Math.min(er.width/v.width,er.height/v.height);content={width:v.width*k,height:v.height*k};}
   const st=getComputedStyle(widget),bs=getComputedStyle(body),paddingX=parseFloat(st.paddingLeft)+parseFloat(st.paddingRight)+parseFloat(bs.paddingLeft)+parseFloat(bs.paddingRight),chrome=(br.y-wr.y)/scale+parseFloat(st.paddingBottom)+parseFloat(st.borderBottomWidth);
   const kids=[...body.children].map(e=>e.getBoundingClientRect());const intrinsicHeight=(Math.max(br.y,...kids.map(r=>r.bottom))-br.y)/scale;
   return {key:tile.dataset.layoutKey,body:{width:br.width,height:br.height},content,letterboxFraction:content?Math.max(0,1-(content.width*content.height)/(br.width*br.height)):null,horizontalLetterbox:content?Math.max(0,1-content.width/br.width):null,nativeContent:content?{width:content.width/scale,height:content.height/scale}:null,chrome,paddingX,intrinsicHeight,extraHeight:contract.ancillarySelector?[...body.querySelectorAll(contract.ancillarySelector)].reduce((n,e)=>n+e.getBoundingClientRect().height/scale+parseFloat(getComputedStyle(e).marginTop)+parseFloat(getComputedStyle(e).marginBottom),0):0};
  });return {gridWidth:grid.clientWidth,scale,gridTop:gr.y,panels};
 });
 observed.geometry=interior;for(const p of observed.panels)Object.assign(p,interior.panels.find(i=>i.key===p.key));
 return observed;
}
async function fullScreenshot(width,height){
 await page.locator('#capture').evaluate((e,h)=>e.style.minHeight=h+'px',height);
 await page.evaluate(()=>window.scrollTo(0,0));
 const bounds=await page.evaluate(()=>{const root=document.querySelector('#capture').getBoundingClientRect();return {x:root.x,y:root.y,width:root.width,height:root.height,tiles:[...document.querySelectorAll('[data-layout-key]')].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return {key:e.dataset.layoutKey,x:r.x,y:r.y,right:r.right,bottom:r.bottom};})};});
 if(bounds.x!==0||bounds.y!==0||Math.ceil(bounds.width)!==width||Math.ceil(bounds.height)!==height||bounds.tiles.some(r=>r.x<0||r.y<0||r.right>width+1||r.bottom>height+1))throw Error('Capture bounds do not contain every tile');
 const png=await page.screenshot({fullPage:true,clip:{x:0,y:0,width,height},animations:'disabled'});
 if(png.readUInt32BE(16)!==width||png.readUInt32BE(20)!==height)throw Error('PNG dimensions '+png.readUInt32BE(16)+'x'+png.readUInt32BE(20)+' differ from complete capture bounds '+width+'x'+height);
 return png;
}
return {browser,page,paint,fullScreenshot,cameraPolicy,source:native.body,css,html};
}
