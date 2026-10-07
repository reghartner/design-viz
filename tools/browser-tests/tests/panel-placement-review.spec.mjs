import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),L=require('../../panel-placement/layouts.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=','base64');
async function fixture(mode){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'synthetic-review-browser-')),dataset=path.join(dir,'review'),submissions=path.join(dir,'synthetic-submissions');await fs.mkdir(path.join(dataset,'public'),{recursive:true});
 const pairs=[];
 for(let i=0;i<3;i++){
  const spec={page:{sections:[{diagram:{panels:[{id:'p',type:'state',initial:{state:'Ready'}}],layouts:[{id:'one',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:6},{panel:'p',x:0,y:6,w:24,h:6},{controls:'steps',x:0,y:12,w:24,h:3}]}}]}}]}};
  const pair={id:'synthetic-'+i,title:'Synthetic case '+i,batch:i===2?2:1,split:'review',experimentAxis:['panel-sizing','follow-up','new-case'][i],comparisonNote:'Synthetic scrolling tradeoff.',audience:'Synthetic tester',goal:'Verify UI persistence only.',host:{width:800,profile:'default'},panelCount:1,panelTypes:['state'],capture:{width:1,height:1},contentSha256:L.hash(L.semantic(spec))};
  for(const label of ['A','B']){if(label==='B')L.layout(spec)[1].w=18;const bytes=JSON.stringify(spec),base='public/'+i+'-'+label;await fs.writeFile(path.join(dataset,base+'.json'),bytes);await fs.writeFile(path.join(dataset,base+'.png'),png);pair[label]={id:i+'-'+label,sha256:L.hash(bytes),pngSha256:L.hash(png),spec:base+'.json',png:base+'.png'};}
  pairs.push(pair);
 }
 await fs.writeFile(path.join(dataset,'manifest.json'),JSON.stringify({version:1,reviewMode:mode,datasetPurpose:'synthetic-test',datasetId:'synthetic-'+mode,datasetVersion:'v1',pairs}));
 const server=spawn('python3',['-u',path.resolve('..','arrange-training','serve.py'),'--dataset',dataset,'--submissions',submissions,'--port','0']);
 const url=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.stderr.on('data',b=>{text+=b;});server.once('exit',code=>reject(Error('Server exited '+code+' '+text)));});
 return {dir,submissions,url,async close(){server.kill();await new Promise(r=>server.once('exit',r));await fs.rm(dir,{recursive:true,force:true});}};
}
for(const width of [390,1440])test('panel acceptance labels, reason clearing and durable revisions at '+width+'px',async({page})=>{
 const f=await fixture('panel-layout');try{
  await page.setViewportSize({width,height:900});await page.goto(f.url);
  const first=page.locator('.pair').nth(0),second=page.locator('.pair').nth(1);
  await expect(first.getByText('Focus: panel sizing · same step-control policy')).toBeVisible();await expect(first.getByText('Synthetic scrolling tradeoff.')).toBeVisible();await first.getByRole('radio',{name:'Both acceptable',exact:true}).check();await first.getByRole('textbox').fill('Both communicate the goal.');
  await expect(second.getByText('Follow-up · panel shape and step controls')).toBeVisible();await second.getByRole('radio',{name:'Neither acceptable',exact:true}).check();await second.getByRole('textbox').fill('Neither prioritizes the evidence.');
  await page.reload();await expect(first.getByRole('radio',{name:'Both acceptable',exact:true})).toBeChecked();await expect(first.getByRole('textbox')).toHaveValue('Both communicate the goal.');
  await page.getByRole('button',{name:'Next batch',exact:true}).click();await expect(page.getByText('New case · panel shape and step controls')).toBeVisible();await page.locator('.pair').getByRole('radio',{name:'A',exact:true}).check();
  await page.locator('#submit').click();await expect(page.locator('#state')).toContainText('revision 1');
  await page.getByRole('button',{name:'Previous batch',exact:true}).click();await first.getByRole('textbox').fill('');await expect(page.locator('#state')).toContainText('Unsent draft');
  await page.locator('#submit').click();await expect(page.locator('#state')).toContainText('revision 2');
  const records=await Promise.all((await fs.readdir(f.submissions)).filter(n=>n.startsWith('submission-')).map(async n=>JSON.parse(await fs.readFile(path.join(f.submissions,n),'utf8'))));records.sort((a,b)=>a.revision-b.revision);
  expect(records).toHaveLength(2);expect(records[0].source).toBe('synthetic-comparison-test');expect(records[0].choices.map(c=>c.choice)).toEqual(['Both','Neither','A']);expect(records[0].choices[0].reason).toBe('Both communicate the goal.');expect(records[1].choices[0].reason).toBeUndefined();
  const download=page.waitForEvent('download');await page.locator('#backup').click();const backup=await download;const data=JSON.parse(await fs.readFile(await backup.path(),'utf8'));expect(data.choices[1].choice).toBe('Neither');expect(data.choices[1].reason).toBe('Neither prioritizes the evidence.');
  await expect(page.getByRole('radio',{name:'Tie',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await f.close();}
});
test('node review retains Tie and default labels',async({page})=>{const f=await fixture('node-layout');try{await page.goto(f.url);const first=page.locator('.pair').first();await first.getByRole('radio',{name:'Tie',exact:true}).check();await page.locator('#submit').click();await expect(page.locator('#state')).toContainText('revision 1');await page.reload();await expect(first.getByRole('radio',{name:'Tie',exact:true})).toBeChecked();await expect(page.getByRole('textbox')).toHaveCount(0);await expect(page.getByRole('radio',{name:'Both acceptable'})).toHaveCount(0);}finally{await f.close();}});
