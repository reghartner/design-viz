#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),L=require('./layouts.cjs'),A=require('./adaptive.cjs'),F=require('./feedback.cjs'),corpus=require('./corpus.cjs');
const {entrypoint,entrypointAssets,fontCss}=require('../source-loader.cjs');
const options={},args=process.argv.slice(2);while(args.length){const k=args.shift();if(!['--round-one','--feedback','--output','--seed','--limit'].includes(k)||!args.length)throw Error('Use --round-one DIR --feedback FILE --output NEW_DIR [--seed round-2] [--limit N]');options[k]=args.shift();}
for(const k of ['--round-one','--feedback','--output'])if(!options[k])throw Error(k+' is required');
const out=path.resolve(options['--output']),seed=options['--seed']||'round-2';
try{if((await fs.readdir(out)).length)throw Error('Output is populated; choose a new directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
const input=F.load(options['--round-one'],options['--feedback']),cases=input.cases.slice(0,options['--limit']?Number(options['--limit']):12);
await fs.mkdir(path.join(out,'review/public'),{recursive:true});
const {chromium}=require('../browser-tests/node_modules/@playwright/test'),C=corpus.engine(),native=entrypoint('native'),assets=entrypointAssets('native');
const css=fontCss('all')+'\n'+assets.styles.map(a=>a.source).join('\n');
const harnessCSS='html,body{margin:0;background:#fff}#capture{box-sizing:border-box;padding:20px;background:#fff}.docview{max-width:none;margin:0}.doc-sec{box-shadow:none}*,*::before,*::after{animation:none!important;transition:none!important}';
const html=`<!doctype html><meta charset="utf-8"><style>${css}\n${harnessCSS}</style>${assets.icons}<main id="capture"><div id="view"></div></main><script>${native.body.replace(/<\/script/gi,'<\\/script')}\nwindow.paint=(raw,width,target)=>{if(window.ctl)window.ctl.destroy();capture.style.width=width+'px';capture.style.minHeight='';applySkinClasses(document.body,view,'pastel');window.ctl=renderPage(view,normalize(raw),'pastel',null,{layoutTarget:target});window.ctl.sections[0].stepper.jump(5);};</script>`;
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',r=>{if(r.request().url().startsWith('data:')||r.request().url()==='about:blank')return r.continue();errors.push('Unexpected external resource');return r.abort();});
await page.setContent(html);await page.evaluate(()=>{const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...a){super(...(a.length?a:['2026-01-15T09:36:00Z']));}static now(){return 1768469760000;}};});
const cameraPolicy='Native Fit diagram then bounded Zoom in and native board scrolling to center frozen node bounds; same policy for both candidates';
async function paint(spec,s){
 await page.evaluate(({spec,s})=>{window.scrollTo(0,0);window.paint(spec,s.host.width,s.host.profile);},{spec,s});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 await page.evaluate(()=>{
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

 });
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
 return observed;
}
const git=a=>execFileSync('git',a,{encoding:'utf8',cwd:path.resolve(fileURLToPath(new URL('../..',import.meta.url)))}).trim();
const provenance={...input.provenance,seed,commit:git(['rev-parse','HEAD']),trackedDirty:!!git(['status','--porcelain','--untracked-files=no']),sourceSha256:L.hash(native.body),cssSha256:L.hash(css),harnessSha256:L.hash(html),browserVersion:browser.version(),node:process.version,viewportHeight:1000,deviceScaleFactor:1,snapshot:5,fixedTime:'2026-01-15T09:36:00Z',cameraPolicy,generatorFiles:{}};
for(const f of ['generate-round-two.mjs','adaptive.cjs','feedback.cjs','layouts.cjs'])provenance.generatorFiles[f]=L.hash(await fs.readFile(new URL(f,import.meta.url)));
const manifest={version:1,reviewMode:'panel-layout',datasetPurpose:'human-review',datasetId:'panel-placement-'+seed,datasetVersion:'v1',title:'Panel arrangements · Focused round 2',renderer:provenance,pairs:[]},report=[];
try{
 for(const item of cases){const s=item.scenario,minimums={compact:{},roomy:{}};let pair,observed={};
  for(let attempt=0;attempt<5;attempt++){
   pair=A.pair(item.source,s,seed,minimums);let grew=false;
   for(const label of ['A','B']){const c=pair[label],v=C.validate(C.normalize(c.spec));if(v.errors.length||v.warnings.length)throw Error(s.id+' '+JSON.stringify(v));const o=observed[label]=await paint(c.spec,s);
    if(o.snapshot.n!==5||L.stable(o.panels.map(p=>p.key).sort())!==L.stable(L.diagram(c.spec).panels.map(p=>'panel:'+p.id).sort())||o.panels.length!==s.panelCount||(o.graph&&o.graph.nodeCount!==Object.keys(L.diagram(c.spec).nodes).length)||o.panels.some(p=>!p.text||p.rect.width<=0))throw Error('Invalid rendered state '+s.id);
    for(const p of o.panels){if(p.overflowX>4||p.overflowY>4){const key=p.key.slice(6),min=minimums[c.metadata.variant],tile=L.layout(c.spec).find(t=>t.panel===key);min[key]={...(min[key]||{}),...(p.overflowY>4?{h:Math.max(tile.h,Math.ceil((p.neededHeight+8)/40))}:{}),...(p.overflowX>4?{w:tile.w+Math.ceil(p.overflowX/p.nativeColumnPitch)}:{})};grew=true;}}
    if(o.controls.overflowY>4||o.controls.clippedButtons){const min=minimums[c.metadata.variant];min.steps={h:Math.ceil((o.controls.neededHeight+8)/40)};grew=true;}
   }
   if(!grew)break;if(attempt===4)throw Error('Content sizing did not converge '+s.id);
  }
  for(const label of ['A','B']){const o=observed[label],scrollTradeoff=s.id==='warehouse-1'&&pair[label].metadata.policy==='under-primary';if(!o.controls.visible||!o.controls.reachableAfterScroll||(!o.controls.inInitialViewport&&!scrollTradeoff)||o.controls.overflowX>4||o.controls.overflowY>4||o.controls.clippedButtons)throw Error('Controls inaccessible '+s.id+' '+label+' '+JSON.stringify(o.controls));if(o.graph&&(o.graph.clippedNodes||o.graph.minimumLabelPx<8))throw Error('Graph unreadable '+s.id+' '+label+' '+JSON.stringify(o.graph));}
  if(L.stable(observed.A.panels.map(p=>[p.key,p.text]).sort())!==L.stable(observed.B.panels.map(p=>[p.key,p.text]).sort()))throw Error('Rendered content mismatch');
  const record={...s,A:null,B:null,...(s.id==='warehouse-1'?{comparisonNote:'The frozen diagram is tall. Controls below the complete diagram-and-panel group require scrolling from the initial 1000px view.'}:{}),viewportDiagnostics:Object.fromEntries(['A','B'].map(label=>[label,{controlsTop:observed[label].controls.y,controlsBottom:observed[label].controls.bottom,inInitialViewport:observed[label].controls.inInitialViewport,minimumNodeLabelPx:observed[label].graph?.minimumLabelPx??null}])),experimentAxis:pair.experimentAxis,contentSha256:L.checkPair(pair.A.spec,pair.B.spec),sourceCandidate:item.sourceCandidate,sourceManifestSha256:input.provenance.sourceManifestSha256,feedbackSha256:input.provenance.feedbackSha256};
  let canvasHeight=0;for(const label of ['A','B']){await paint(pair[label].spec,s);canvasHeight=Math.max(canvasHeight,Math.ceil(await page.locator('#capture').evaluate(el=>el.getBoundingClientRect().height)));}
  for(const label of ['A','B']){const o=await paint(pair[label].spec,s);await page.locator('#capture').evaluate((el,h)=>el.style.minHeight=h+'px',canvasHeight);const base='public/'+s.id+'-'+label,bytes=JSON.stringify(pair[label].spec,null,2)+'\n';let png=await page.locator('#capture').screenshot({animations:'disabled'}),stable=false;for(let n=0;n<4;n++){const next=await page.locator('#capture').screenshot({animations:'disabled'});if(L.hash(next)===L.hash(png)){stable=true;break;}png=next;}if(!stable)throw Error('Unstable capture '+s.id);
   await fs.writeFile(path.join(out,'review',base+'.spec.json'),bytes);await fs.writeFile(path.join(out,'review',base+'.png'),png);await fs.mkdir(path.join(out,'viewport'),{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));const viewportPng=await page.screenshot({clip:{x:0,y:0,width:s.host.width,height:1000},animations:'disabled'});await fs.writeFile(path.join(out,'viewport',s.id+'-'+label+'.png'),viewportPng);o.viewportPngSha256=L.hash(viewportPng);record[label]={id:s.id+'-'+L.hash(bytes).slice(0,12),sha256:L.hash(bytes),pngSha256:L.hash(png),spec:base+'.spec.json',png:base+'.png'};
   report.push({id:s.id,label,experimentAxis:pair.experimentAxis,metadata:pair[label].metadata,readabilityNotes:[...(o.graph?.minimumLabelPx<10?['Graph labels below preferred 10px; enlarge for detailed reading']:[]),...(o.panels.some(p=>p.minimumTextPx<8)?['Some native panel secondary text is below 8px at this host scale']:[])],observed:o,score:A.score(pair[label].spec,o)});
  }
  record.capture={width:s.host.width,height:canvasHeight,scale:await page.locator('.section-layout-grid').evaluate(el=>Number(getComputedStyle(el).zoom)),viewportHeight:1000,cameraPolicy};manifest.pairs.push(record);console.log('Captured '+s.id+' '+pair.experimentAxis);
 }
 await fs.writeFile(path.join(out,'review/manifest.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');await fs.writeFile(path.join(out,'capture-report.json'),JSON.stringify(report,null,2)+'\n');console.log('Completed '+manifest.pairs.length+' focused comparisons');
}finally{await browser.close();}
