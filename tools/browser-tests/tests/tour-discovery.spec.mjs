import {test,expect} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const key='dv_tour_features_v1';
function library(){
  const diagram={view:'step',autoplay:false,nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],
    edges:[{from:'a',to:'b'}],steps:[{id:'start',edge:'a->b',text:'Request'},{id:'complete',edge:'a->b',text:'Response'}]};
  const rich=structuredClone(diagram);
  rich.steps.splice(1,0,{id:'direct',edge:'a->b',text:'Direct'},{id:'retry',edge:'a->b',text:'Retry'});
  rich.paths=[{id:'normal',label:'Normal',steps:['start','direct','complete']},
    {id:'retry-path',label:'Retry',steps:['start','retry','complete']}];
  return {version:1,diagrams:[['simple',diagram],['rich',rich]].map(([id,d])=>({id,title:id,
    spec:{page:{title:id,skin:'pastel',canon:{version:1,id,kind:'canonical',owner:'group:default/home'},sections:[{heading:'Delivery',diagram:d}]}}}))};
}
async function publish(page){await page.route('**/diagrams.json',route=>route.fulfill({json:library()}));}
const prompt=page=>page.locator('.dv-tour-discovery');
const heading=page=>page.locator('.dv-tour-ui .dv-tour-heading');
async function walk(page){
  const titles=[];
  for(let i=0;i<20;i++){
    await expect(page.locator('.dv-tour-ui')).toBeVisible();titles.push(await heading(page).textContent());
    const next=page.locator('.dv-tour-next'),done=await next.textContent()==='Done';await next.click();
    if(done){await expect(page.locator('.dv-tour')).toBeHidden();return titles;}
  }
  throw Error('Tour did not finish');
}
async function seed(page,seen,persona='both'){
  await page.addInitScript(({key,seen,persona})=>localStorage.setItem(key,JSON.stringify({version:1,seen,persona})),{key,seen,persona});
}

test('learning a simple Canon tour offers only new branching topics on a richer diagram',async({page,server},info)=>{
  await publish(page);await page.goto(server.origin+'/workbench.html?diagram=simple#tour=1');
  await page.getByRole('button',{name:/Show me both/}).click();await walk(page);
  const seen=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).seen,key);
  expect(seen).toContain('mode-step');expect(seen).not.toContain('branching-split');
  await page.goto(server.origin+'/workbench.html?diagram=rich');
  await expect(page.locator('.dv-tour')).toHaveCount(0);
  await expect(prompt(page)).toHaveText('New features to explore · 2');
  const before=await page.locator('#canon-reader .schip[aria-current=true]:visible').allTextContents();
  await info.attach('new-topics-prompt',{body:await page.screenshot(),contentType:'image/png'});
  await prompt(page).click();
  expect(await walk(page)).toEqual(['Flows can split','And they come back together','You’re caught up']);
  await expect(prompt(page)).toBeHidden();
  expect(await page.locator('#canon-reader .schip[aria-current=true]:visible').allTextContents()).toEqual(before);
  await page.reload();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await expect(prompt(page)).toBeHidden();
  await page.locator('.dv-tour-replay').click();await expect(page.locator('.dv-tour-chooser')).toBeVisible();
});

test('skipping new-topic tips records only the displayed topic and offers the rest later',async({page,server})=>{
  await publish(page);await seed(page,['mode-ambient','mode-step','expand']);
  await page.goto(server.origin+'/workbench.html?diagram=rich');
  await expect(prompt(page)).toContainText('2');await prompt(page).click();
  await expect(heading(page)).toHaveText('Flows can split');await expect(page.locator('.dv-tour-ui')).toBeVisible();
  await page.getByRole('button',{name:'Skip the tour',exact:true}).click();
  await expect(prompt(page)).toHaveText('New features to explore · 1');
  const seen=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).seen,key);
  expect(seen).toContain('branching-split');expect(seen).not.toContain('branching-rejoin');
  await prompt(page).click();expect(await walk(page)).toEqual(['And they come back together','You’re caught up']);
});

test('discovery honors the chosen audience, legacy completion, deep links and suppression',async({page,server})=>{
  await publish(page);await seed(page,['mode-step','expand','branching-split','branching-rejoin'],'ux');
  await page.goto(server.origin+'/workbench.html?diagram=rich');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();await expect(prompt(page)).toBeHidden();
  await page.goto(server.origin+'/standalone.html#m=step&s=2');
  await expect(page.locator('.dv-tour-replay')).toBeVisible();await expect(prompt(page)).toBeHidden();
  await page.goto(server.origin+'/workbench.html?diagram=rich#tour=0');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();await expect(prompt(page)).toBeHidden();
});

test('a prompt on a legacy-completed standalone page never opens an overlay or steals state',async({page,server})=>{
  await page.goto(server.origin+'/standalone.html');
  await expect(prompt(page)).toBeVisible();await expect(page.locator('.dv-tour')).toHaveCount(0);
  const hash=new URL(page.url()).hash;
  await prompt(page).click();const titles=await walk(page);expect(titles.at(-1)).toBe('You’re caught up');
  expect(new URL(page.url()).hash).toBe(hash);await expect(prompt(page)).toBeHidden();
});

test('custom page tours keep their authored sequence and do not mark built-in topics learned',async({page,server})=>{
  const raw=library().diagrams[0].spec;
  raw.page.tour={version:1,steps:[{id:'mode-step',target:{selector:'.step-transport',within:'section'},diagramState:{mode:'step'},copy:{heading:'Company lesson'}}]};
  const input=path.join(server.root,'custom-progress.json'),output=path.join(server.root,'custom-progress.html');
  await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/custom-progress.html#tour=1');
  await expect(heading(page)).toHaveText('Company lesson');await expect(prompt(page)).toHaveCount(0);await walk(page);
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
});
