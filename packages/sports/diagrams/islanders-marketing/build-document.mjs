// Consolidate approved stories without rearranging or changing their behavior.
// High-quality WebP packaging preserves screen dimensions and avoids the
// whole-file import limit; source screen exports remain untouched.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const require=createRequire(import.meta.url),{compatibility}=require(path.join(repo,'tools/arrange/core.cjs'));
const config=JSON.parse(await readFile(path.join(here,'document.source.json'),'utf8'));
const local=path.join(repo,'.local',config.id);await mkdir(local,{recursive:true});
const tabs=[],evidence=[],media=[],appendices=[];
const browser=await chromium.launch();
try{
  const page=await browser.newPage();
  for(const tab of config.tabs){
    const source=path.resolve(here,'../'+tab.source),raw=JSON.parse(await readFile(path.join(source,tab.source+'.spec.json'),'utf8'));
    assert.equal(raw.page.sections.length,1);
    const section=structuredClone(raw.page.sections[0]);
    for(const panel of section.diagram.panels)for(const screen of panel.screens){
      const original=screen.src;
      const result=await page.evaluate(async({src})=>{
        const img=new Image();img.src=src;await img.decode();
        const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        const context=canvas.getContext('2d');context.drawImage(img,0,0);
        const a=context.getImageData(0,0,canvas.width,canvas.height).data;
        const webp=canvas.toDataURL('image/webp',0.96);
        const decoded=new Image();decoded.src=webp;await decoded.decode();context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(decoded,0,0);
        const b=context.getImageData(0,0,canvas.width,canvas.height).data;
        let squared=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)squared+=(a[i+c]-b[i+c])**2;
        const mse=squared/(canvas.width*canvas.height*3),psnr=mse?10*Math.log10(255**2/mse):100;
        return {webp,psnr,width:canvas.width,height:canvas.height};
      },{src:original});
      assert.equal(result.width,screen.width);assert.equal(result.height,screen.height);
      const useWebp=result.webp.startsWith('data:image/webp;')&&result.webp.length<original.length&&result.psnr>=38;
      if(useWebp)screen.src=result.webp;
      assert.ok(Buffer.from(screen.src.split(',')[1],'base64').length<=512*1024);
      media.push({section:section.id,panel:panel.id,screen:screen.id,before:original.length,after:screen.src.length,webp:useWebp,psnr:result.psnr,width:result.width,height:result.height});
    }
    // Everything except the encoded pixels is byte-for-byte equivalent as data.
    const withoutPixels=value=>JSON.parse(JSON.stringify(value,(k,v)=>k==='src'&&typeof v==='string'&&v.startsWith('data:image/')?'[embedded image]':v));
    assert.deepEqual(withoutPixels(section),withoutPixels(raw.page.sections[0]));
    tabs.push({label:tab.label,sections:[section]});
    const expectations=JSON.parse(await readFile(path.join(source,tab.source+'.visibility.json'),'utf8'));
    evidence.push(...expectations.expectations);
    const ledger=await readFile(path.join(source,tab.source+'.ledger.md'),'utf8');
    appendices.push('## Source ledger: '+tab.label+'\n\n'+ledger.replace(/^(#{1,5}) /gm,'#$1 '));
  }
}finally{await browser.close();}
const spec=compatibility.stamp({page:{
  title:config.title,description:config.description,
  subtitle:'Member campaigns, group nights and fan events — from the promotion to the next action.',
  skin:'islanders',brand:false,contract:'1',
  protocols:{campaign:{label:'Illustrative marketing handoff',color:'#00539b'}},
  canon:{version:1,id:config.id,kind:'canonical',owner:'group:default/flowview-examples'},
  blocks:[{tabs}]
}});
const output=JSON.stringify(spec,null,2)+'\n';
if(Buffer.byteLength(output)>4*1024*1024)throw Error('Combined document exceeds Workbench whole-file import limit.');
await writeFile(path.join(here,config.id+'.spec.json'),output);
await writeFile(path.join(here,config.id+'.visibility.json'),JSON.stringify({version:1,expectations:evidence},null,2)+'\n');
const ledger=await readFile(path.join(here,'consolidation-notes.md'),'utf8');
await writeFile(path.join(here,config.id+'.ledger.md'),ledger+'\n\n'+appendices.join('\n\n'));
const canon=path.join(repo,'diagrams/friends',config.id);await mkdir(canon,{recursive:true});
for(const suffix of ['spec.json','ledger.md'])await writeFile(path.join(canon,config.id+'.'+suffix),await readFile(path.join(here,config.id+'.'+suffix)));
await writeFile(path.join(local,'media-report.json'),JSON.stringify({bytes:Buffer.byteLength(output),screens:media},null,2)+'\n');
execFileSync('python3',['tools/inject.py',path.join(here,config.id+'.spec.json'),'template/flowview.html',path.join(local,'preview.html')],{cwd:repo,stdio:'inherit'});
console.log(JSON.stringify({id:config.id,tabs:tabs.map(t=>t.label),bytes:Buffer.byteLength(output),screens:media.length,reencoded:media.filter(m=>m.webp).length,preservesAllStoryData:true}));
