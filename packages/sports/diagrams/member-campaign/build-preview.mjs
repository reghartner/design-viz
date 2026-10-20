// Generates phone creative and the native, step-driven Flowview preview.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from '../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const local=path.join(repo,'.local/member-campaign');await mkdir(local,{recursive:true});
const logo='data:image/png;base64,'+(await readFile(path.resolve(here,'../../assets/islanders/primary-dark.png'))).toString('base64');
const assets={__ISLANDERS_LOGO__:logo};
for(const [key,file,mime] of [['__CROWD_PHOTO__','crowd.jpg','image/jpeg'],['__MEMBERS_PHOTO__','members.jpg','image/jpeg'],['__MEMBERSHIP_BANNER__','membership-banner.png','image/png']])assets[key]='data:'+mime+';base64,'+(await readFile(path.join(here,'assets',file))).toString('base64');
const embedAssets=html=>Object.entries(assets).reduce((out,[key,value])=>out.replaceAll(key,value),html);
const html=embedAssets(await readFile(path.join(here,'creative.source.html'),'utf8'));
// The old standalone fragment had no charset and was decoded as Windows-1252.
await writeFile(path.join(local,'creative-reference.html'),'<!doctype html><html><head><meta charset="utf-8"><title>Creative source reference</title></head><body>'+html+'</body></html>');
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1024,height:1100},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta charset="utf-8">'+html);
  await page.addStyleTag({content:await readFile(path.join(here,'phone-capture.css'),'utf8')});
  const capturePage=await browser.newPage({viewport:{width:390,height:710},deviceScaleFactor:1});
  const captureStyles=(await page.locator('style').allTextContents()).join('\n');
  const screens=[];
  const snap=async(id,label,selector='#isles-destination')=>{
    const markup=await page.locator(selector).evaluate(el=>el.outerHTML);
    await capturePage.setContent('<meta charset="utf-8"><style>body{margin:0}'+captureStyles+'</style><div id="isles-campaign-preview">'+markup+'</div>');
    await capturePage.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    const el=capturePage.locator(selector),box=await el.boundingBox(),png=await el.screenshot();
    const clipped=await el.evaluate(root=>[...root.querySelectorAll('.mailbody,.mailfoot,.pagebody')].filter(e=>e.getBoundingClientRect().bottom>root.getBoundingClientRect().bottom-18).map(e=>e.className));
    if(clipped.length)throw Error('Phone content clips: '+id+' '+clipped.join(', '));
    if(png.length>512*1024)throw Error('Screen exceeds 512 KiB');
    await writeFile(path.join(local,'phone-'+id+'.png'),png);
    // Keep lossless PNGs for review; photographic screens use high-quality JPEG
    // in the portable spec to stay below the documented 2 MiB reader limit.
    const jpeg=await el.screenshot({type:'jpeg',quality:95});
    screens.push({id,label,alt:'Illustrative Islanders campaign using official team imagery: '+label,link:'https://www.nhl.com/islanders/tickets/membership/',src:'data:image/jpeg;base64,'+jpeg.toString('base64'),width:Math.round(box.width),height:Math.round(box.height)});
  };
  await snap('email','Member promotion email','#isles-email');
  await page.locator('[data-action="open"]').first().click();await snap('member','Member guest-ticket landing page');
  await page.locator('#isles-destination').evaluate(el=>el.classList.add('source-linked'));
  await snap('member-linked','Member page - A headline, B button (walkthrough annotations)');
  await page.locator('#isles-destination').evaluate(el=>el.classList.remove('source-linked'));
  await page.locator('[data-action="ticketing"]').click();await snap('ticketing','Ticketmaster member-offer handoff');
  await page.locator('[data-path="signin"]').click();await snap('signin','Sign in and return to the member offer');
  await page.locator('[data-action="verify"]').click();
  await page.locator('[data-path="ended"]').click();await snap('expired','Expired-offer landing page');
  await page.locator('#isles-destination').evaluate(el=>el.classList.add('source-linked'));
  await snap('expired-linked','Ended-offer page - A headline, B button (walkthrough annotations)');
  await page.locator('#isles-destination').evaluate(el=>el.classList.remove('source-linked'));
  await page.locator('[data-action="general"]').click();await snap('general','Regular-ticket fallback');
  await page.evaluate(()=>{const root=document.getElementById('isles-campaign-preview');root.querySelector('#isles-destination').replaceChildren(root.querySelector('#isles-confirmation').content.cloneNode(true));});
  await snap('confirmation','Purchase confirmation example');
  if(errors.length)throw Error(errors.join('\n'));
  const spec=JSON.parse(await readFile(path.join(here,'story.source.json'),'utf8')),d=spec.page.sections[0].diagram;
  const marketing=await browser.newPage({viewport:{width:740,height:600},deviceScaleFactor:1});
  await marketing.setContent(embedAssets(await readFile(path.join(here,'marketing.source.html'),'utf8')));
  await marketing.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  const marketingScreens=[];
  for(const [id,label] of [['email','Salesforce - email copy and destination'],['content','Contentful - headline, button and destination'],['ended','Contentful - expired-offer replacement content'],['journey','Salesforce - confirmed purchase stops the reminder']]){
    const el=marketing.locator('#marketing-'+id);
    if(await el.evaluate(el=>el.scrollHeight>el.clientHeight))throw Error('Marketing screen clips content: '+id);
    const occluded=await el.evaluate(root=>{const footer=root.querySelector('.footer').getBoundingClientRect();return [...root.querySelectorAll('.entry,.properties,.rule')].some(e=>e.getBoundingClientRect().bottom>footer.top);});
    if(occluded)throw Error('Marketing footer covers content: '+id);
    const png=await el.screenshot();
    if(png.length>512*1024)throw Error('Marketing screen exceeds 512 KiB');
    await writeFile(path.join(local,'marketing-'+id+'.png'),png);
    const alt='Illustrative marketing workspace: '+(await el.innerText()).replace(/\s+/g,' ');
    const link=id==='email'?'https://trailhead.salesforce.com/content/learn/modules/content-builder-features/create-and-edit-your-content':id==='journey'?'https://trailhead.salesforce.com/content/learn/modules/journey-builder-campaigns/build-a-journey-campaign':'https://www.contentful.com/help/content-and-entries/entry-editor-sidebar-overview/';
    const bounds=await el.boundingBox();
    marketingScreens.push({id,label,alt,link,src:'data:image/png;base64,'+png.toString('base64'),width:Math.round(bounds.width),height:Math.round(bounds.height)});
  }
  d.panels=[{id:'destination',type:'appscreens',title:'What the fan sees',screens,frame:'phone',transition:'crossfade',initial:{screen:'email',clock:'9:41'}},{id:'record',type:'appscreens',title:'What marketing manages',screens:marketingScreens,frame:'none',transition:'crossfade',initial:{screen:'email'}}];
  // Preserve Chuck's exported layout and graph geometry; do not auto-arrange it.
  const require=createRequire(import.meta.url),{compatibility}=require(path.join(repo,'tools/arrange/core.cjs'));
  const output=JSON.stringify(compatibility.stamp(spec),null,2)+'\n';
  if(Buffer.byteLength(output)>2*1024*1024)throw Error('Standalone source exceeds its 2 MiB packaging budget');
  const canonDir=path.join(repo,'diagrams/friends/member-campaign');
  await mkdir(canonDir,{recursive:true});
  await writeFile(path.join(canonDir,'member-campaign.spec.json'),output);
  await writeFile(path.join(canonDir,'member-campaign.ledger.md'),await readFile(path.join(here,'member-campaign.ledger.md')));
  // Replace the previously shared browser URL itself, not another hidden preview.
  execFileSync('python3',['tools/inject.py',path.join(canonDir,'member-campaign.spec.json'),'template/flowview.html',path.join(local,'preview.html')],{cwd:repo,stdio:'inherit'});
  console.log(JSON.stringify({preview:'http://127.0.0.1:8879/.local/member-campaign/preview.html?theme=islanders',screens:screens.length,encoding:'UTF-8',errors}));
}finally{await browser.close();}
