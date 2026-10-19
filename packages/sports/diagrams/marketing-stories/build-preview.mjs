// Source-only marketing story authoring: captures are embedded into native App Screens.
// This does not add product behavior, make network calls, or send campaign messages.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from '../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const require=createRequire(import.meta.url),{compatibility}=require(path.join(repo,'tools/arrange/core.cjs'));
const styles=await readFile(path.join(here,'screens.css'),'utf8');
const labels={
  destination:{promo:'Campaign email',landing:'Group-night landing page',linked:'Landing page · source matches A/B',form:'Group-planning request',received:'Inquiry received · no seats reserved',choice:'Choose tickets or planning help',ticketing:'Ticketmaster handoff',details:'Illustrative fan-social details','form-yes':'RSVP · sponsor opt-in selected','form-no':'RSVP · sponsor opt-in declined','reserved-yes':'Place reserved · sponsor opt-in Yes','reserved-no':'Place reserved · sponsor opt-in No',full:'Capacity reached · join waitlist',waitlisted:'Waitlist acknowledgement','email-yes':'Reservation confirmation','email-no':'Reservation confirmation · no sponsor opt-in','email-waitlist':'Waitlist message · not a reservation'},
  record:{promo:'Content Builder · promotion link',content:'Contentful · photo, headline and CTA',routing:'Proposed routing · tickets or planning',lead:'Sales Cloud · open inquiry',task:'Sales Cloud · next action',ticketroute:'Contentful · ticket destination',form:'Eventbrite · optional custom question','registered-yes':'Eventbrite · registered, opt-in Yes','registered-no':'Eventbrite · registered, opt-in No',capacity:'Eventbrite · capacity-triggered waitlist',waitlist:'Eventbrite · waitlist record','followup-yes':'Follow-up rules · confirmed and opted in','followup-no':'Follow-up rules · confirmed, no sponsor marketing','followup-waitlist':'Follow-up rules · waitlisted, not registered'}
};
const assets={};
for(const [key,relative,mime] of [
  ['LOGO','../../assets/islanders/primary-dark.png','image/png'],
  ['GROUP','../group-night/assets/group.jpg','image/jpeg'],
  ['CROWD','../member-campaign/assets/crowd.jpg','image/jpeg'],
  ['MEMBERS','../member-campaign/assets/members.jpg','image/jpeg']
])assets['__'+key+'__']='data:'+mime+';base64,'+(await readFile(path.resolve(here,relative))).toString('base64');
const embed=html=>Object.entries(assets).reduce((out,[key,value])=>out.replaceAll(key,value),html);
const browser=await chromium.launch();
try{
  for(const id of process.argv.slice(2).length?process.argv.slice(2):['group-night','fan-event-rsvp']){
    if(!['group-night','fan-event-rsvp'].includes(id))throw Error('Unknown authored story');
    const dir=path.resolve(here,'../'+id),local=path.join(repo,'.local',id);
    await mkdir(local,{recursive:true});
    const spec=JSON.parse(await readFile(path.join(dir,'story.source.json'),'utf8')),d=spec.page.sections[0].diagram;
    const html=embed(await readFile(path.join(dir,'screens.source.html'),'utf8'));
    await writeFile(path.join(local,'screens-reference.html'),html.replace('</head>','<style>'+styles+'</style></head>'));
    const page=await browser.newPage({viewport:{width:720,height:850},deviceScaleFactor:1}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent(html);await page.addStyleTag({content:styles});
    await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    const panels={destination:[],record:[]};
    for(const el of await page.locator('article').all()){
      const panel=await el.getAttribute('data-panel'),screen=await el.getAttribute('data-id');
      const overflow=await el.evaluate(root=>{
        const boundary=root.querySelector('footer').getBoundingClientRect().top;
        const selectors=root.classList.contains('phone')?'.body,.form-intro':'.work-body,.journey-rule';
        return [...root.querySelectorAll(selectors)].filter(n=>n.getBoundingClientRect().bottom>boundary).map(n=>({class:n.className,bottom:n.getBoundingClientRect().bottom-boundary}));
      });
      if(overflow.length)throw Error(id+'/'+screen+' content behind footer: '+JSON.stringify(overflow));
      const png=await el.screenshot();
      await writeFile(path.join(local,panel+'-'+screen+'.png'),png);
      const bytes=panel==='destination'?await el.screenshot({type:'jpeg',quality:90}):png;
      if(bytes.length>512*1024)throw Error('Screen exceeds 512 KiB: '+id+'/'+screen);
      const bounds=await el.boundingBox(),alt=(await el.innerText()).replace(/\s+/g,' ').trim();
      panels[panel].push({id:screen,label:labels[panel][screen]||screen,alt:'Illustrative focused mockup: '+alt,src:'data:image/'+(panel==='destination'?'jpeg':'png')+';base64,'+bytes.toString('base64'),width:Math.round(bounds.width),height:Math.round(bounds.height)});
    }
    if(errors.length)throw Error(errors.join('\n'));
    d.panels=[
      {id:'destination',type:'appscreens',title:'What the fan sees',frame:'phone',transition:'crossfade',screens:panels.destination,initial:{screen:'promo'}},
      {id:'record',type:'appscreens',title:'What marketing manages',frame:'none',transition:'crossfade',screens:panels.record,initial:{screen:'promo'}}
    ];
    const layoutFile=path.join(dir,'layout.source.json');
    let layout;
    try{await access(layoutFile);layout=JSON.parse(await readFile(layoutFile,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(!layout){
      const draft=path.join(local,'draft.spec.json'),arranged=path.join(local,'arranged.spec.json');
      await writeFile(draft,JSON.stringify(spec,null,2)+'\n');
      execFileSync('node',['tools/compose-page-layout.cjs','--section','0',draft,arranged],{cwd:repo,stdio:'inherit'});
      const a=JSON.parse(await readFile(arranged,'utf8')).page.sections[0].diagram;
      layout=Object.fromEntries(['rows','floats','edges','graphFrame','sectionLayout'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
      await writeFile(layoutFile,JSON.stringify(layout,null,2)+'\n');
    }
    const {edges:arrangedEdges,...placement}=layout;
    Object.assign(d,placement);
    // Source owns semantics; the arranged snapshot contributes routing only.
    d.edges=d.edges.map(edge=>({...arrangedEdges.find(e=>e.from===edge.from&&e.to===edge.to),...edge}));
    spec.page.canon={version:1,id,kind:'canonical',owner:'group:default/flowview-examples'};
    const output=JSON.stringify(compatibility.stamp(spec),null,2)+'\n';
    if(Buffer.byteLength(output)>2*1024*1024)throw Error('Spec exceeds portable 2 MiB limit: '+id);
    const canonDir=path.join(repo,'diagrams/friends',id);
    await mkdir(canonDir,{recursive:true});
    await writeFile(path.join(canonDir,id+'.spec.json'),output);
    await writeFile(path.join(canonDir,id+'.ledger.md'),await readFile(path.join(dir,id+'.ledger.md')));
    execFileSync('python3',['tools/inject.py',path.join(canonDir,id+'.spec.json'),'template/flowview.html',path.join(local,'preview.html')],{cwd:repo,stdio:'inherit'});
    console.log(JSON.stringify({id,bytes:Buffer.byteLength(output),screens:{fan:panels.destination.length,marketing:panels.record.length},errors}));
    await page.close();
  }
}finally{await browser.close();}
