import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {digest} from '../../canon/drift.mjs';
import {useProjectDownloads} from '../helpers/project-export.mjs';

function fixture(skin='pastel'){
 const section=(id,i)=>({id,heading:'Shared title',text:'Heartbeat context '+i,collapsed:true,diagram:{view:'ambient',autoplay:false,nodes:{a:{title:'Heartbeat source'},b:{title:'Local destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'first',edge:'a->b',text:'Ordinary heartbeat.'},{id:'second',edge:'a->b',text:i===3?'Deliver the **heartbeat message** safely.':'Heartbeat acknowledged.'}],paths:[{id:'normal',label:'Normal',steps:['first']},{id:'alternate',label:'Alternate',steps:['second']}]}});
 return {page:{title:'Search acceptance',skin,sections:[{tabs:[{label:'One',sections:[section('one',1)]},{label:'Two',sections:[section('two',2)]},{label:'Three',sections:[section('three',3)]}]}]}};
}
async function open(page,server,raw=fixture(),name='search'){
 await writeFile(path.join(server.root,name+'.json'),JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);await page.goto(server.origin+'/'+name+'.html');return page.locator('#docview');
}
async function search(root,text){await root.getByRole('button',{name:'Search document',exact:true}).click();const input=root.getByRole('searchbox',{name:'Search document text'});await input.fill(text);return input;}
async function ranges(page){return page.evaluate(()=>Array.from(CSS.highlights.entries()).filter(([name])=>name.startsWith('flowview-search-')).map(([name,value])=>({name,text:Array.from(value).map(range=>range.toString())})));}

test('live narrowing stays put, page 3 opens its matching step and Results jumps across tabs and paths',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});const root=await open(page,server);
 await root.getByRole('button',{name:'Close Contents',exact:true}).first().click();
 const input=await search(root,'heartbeat');await expect(root.locator('.reader-rail-mark.document-search-match')).toHaveCount(3);
 await input.fill('heartbeat message');await expect(root.locator('.reader-rail-mark.document-search-match')).toHaveText('3');await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 3');
 await root.locator('.reader-rail-mark.document-search-match').click();await expect(root.locator('.reader-page-label')).toHaveText('Page 3 of 3');await expect(input).toHaveValue('heartbeat message');
 await root.getByRole('button',{name:'Results',exact:true}).click();await expect(root.locator('.document-search-result')).toHaveCount(1);await expect(root.locator('.document-search-snippet')).toHaveText('Deliver the heartbeat message safely.');
 await root.locator('.document-search-result').focus();await page.keyboard.press('Enter');
 await expect(root.locator('#section-three .step-text')).toHaveText('Deliver the heartbeat message safely.');await expect(root.locator('#section-three .schip.document-search-match')).toHaveAttribute('aria-current','true');
 expect((await ranges(page)).flatMap(r=>r.text)).toContain('heartbeat message');
 await root.getByRole('button',{name:'Previous page',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 3');await input.press('Enter');await expect(root.locator('.reader-page-label')).toHaveText('Page 3 of 3');
 await input.fill('unfindable');await expect(root.locator('.document-search-status')).toContainText('No matches');await expect(root.locator('.document-search-match')).toHaveCount(0);
 await input.press('Escape');await expect(root.locator('.document-search')).toBeHidden();expect((await ranges(page)).flatMap(r=>r.text)).toEqual([]);
});

test('search presentation uses readable theme colors in all six skins',async({page,server},info)=>{
 await page.setViewportSize({width:1280,height:900});
 for(const skin of ['aurora','daylight','editorial','terminal','pastel','blueprint']){
  const root=await open(page,server,fixture(skin),'search-'+skin);await search(root,'heartbeat');await root.getByRole('button',{name:'Results',exact:true}).click();
  await expect(root.locator('.document-search')).toBeVisible();
  const styles=await root.locator('.document-search').evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {color:s.color,background:s.backgroundColor,right:r.right,bottom:r.bottom};});
  expect(styles.color).not.toBe(styles.background);expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');expect(styles.right).toBeLessThanOrEqual(1280);expect(styles.bottom).toBeLessThanOrEqual(900);
  const overlaps=await root.locator('.reader-top').evaluate(top=>{const a=top.querySelector('.document-search-launch').getBoundingClientRect(),b=top.querySelector('.reader-toolbar').getBoundingClientRect();return a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;});expect(overlaps).toBe(false);
  await page.screenshot({path:info.outputPath('search-'+skin+'.png')});
 }
});

test('native siblings own independent highlights and destroy cleans its registry only',async({page,server})=>{
 await writeFile(path.join(server.root,'search-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'search-native.html'),'<div id="one" style="width:1280px;height:700px"></div><div id="two" style="width:1280px;height:700px"></div><script type="module">import {mountNativeViewer} from "./search-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/search-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);},fixture());
 await search(page.locator('#one'),'heartbeat');await search(page.locator('#two'),'destination');const before=await ranges(page);expect(before).toHaveLength(2);expect(before.every(entry=>entry.text.length)).toBe(true);expect(before[0].name).not.toBe(before[1].name);
 await page.evaluate(()=>window.one.destroy());const after=await ranges(page);expect(after).toHaveLength(1);expect(after[0].text.every(text=>text==='destination')).toBe(true);
 await page.evaluate(()=>window.two.destroy());expect(await ranges(page)).toEqual([]);
});

for(const chrome of ['light','dark'])test('desktop Workbench '+chrome+' source stays unchanged and search retires when the document rerenders',async({page,server},info)=>{
 await page.emulateMedia({colorScheme:chrome});await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(chrome==='dark'?'aurora':'pastel')));await closeTools(page);await page.locator('#workspace-appearance>summary').click();await page.locator(chrome==='dark'?'#sk-aurora':'#sk-pastel').click();await page.locator('#workspace-appearance>summary').click();expect(await page.locator('body').evaluate(body=>getComputedStyle(body).getPropertyValue('--bg').trim().toLowerCase())).toBe(chrome==='dark'?'#0b1220':'#f5f7fb');const root=page.locator('#docview'),before=await page.locator('#src').inputValue();
 const input=await search(root,'heartbeat message');await root.getByRole('button',{name:'Results',exact:true}).click();await root.locator('.document-search-result').click();await expect(page.locator('#src')).toHaveValue(before);
 await input.fill('Heartbeat context 3');await root.locator('.document-search-result').click();await expect(root.locator('#section-three .sec-prose')).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
 await page.screenshot({path:info.outputPath('search-workbench-'+chrome+'.png')});
 await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#outline-search')).toBeFocused();
 await page.locator('#editor-tab-json').click();const replacement=fixture(chrome==='dark'?'aurora':'pastel');replacement.page.sections[0].tabs[2].sections[0].diagram.steps[1].text='Replacement content';await page.locator('#src').fill(JSON.stringify(replacement));await page.locator('#go').click();
 await expect(root.locator('.document-search')).toBeHidden();await search(root,'heartbeat message');await expect(root.locator('.document-search-status')).toContainText('No matches');
});

test('local and genuinely imported nodes are equally searchable without flattening source',async({page,server})=>{
 await useProjectDownloads({page});
 const model=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=model('provider',{nodes:{api:{title:'Imported heartbeat'},store:{title:'Imported hidden heartbeat',hidden:true}},rows:[['api','store']],edges:[{from:'api',to:'store'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=model('consumer',{nodes:{local:{title:'Local heartbeat'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared'}],edges:[{from:'local',to:'shared::api'}],steps:[{id:'request',edge:'local->shared::api',text:'Request'}],autoplay:false});
 await page.route('**/diagrams.json',route=>route.fulfill({json:{version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,revision:digest(spec),counts:{nodes:2,steps:0,panels:0},specUrl:spec.page.canon.id+'.json'}))}}));
 for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});const root=page.locator('#docview');
 await expect(root.locator('[data-dv-node="shared::api"]')).toBeVisible();await closeTools(page);const before=await page.locator('#src').inputValue(),input=await search(root,'heartbeat');
 await expect(root.locator('.node.document-search-match')).toHaveCount(2);await root.getByRole('button',{name:'Results',exact:true}).click();await expect(root.locator('.document-search-result')).toHaveCount(2);
 await input.fill('imported heartbeat');await root.locator('.document-search-result').click();await expect(root.locator('[data-dv-node="shared::api"]')).toBeFocused();await expect(page.locator('#src')).toHaveValue(before);expect(Object.keys(JSON.parse(before).page.sections[0].diagram.nodes)).toEqual(['local']);
 await input.fill('local heartbeat');await root.locator('.document-search-result').click();await expect(root.locator('[data-dv-node="local"]')).toBeFocused();await expect(page.locator('#src')).toHaveValue(before);
 await input.fill('Imported hidden heartbeat');await expect(root.locator('.document-search-result')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(before);
});

test('same section in two Views keeps its exact result destination',async({page,server})=>{
 const section=fixture().page.sections[0].tabs[2].sections[0];section.views=[{id:'first',name:'First view',presentation:'standard'},{id:'second',name:'Second view',presentation:'standard'}];
 const raw={page:{title:'Repeated section',sections:[section]}};const root=await open(page,server,raw,'search-views');await search(root,'heartbeat message');await root.getByRole('button',{name:'Results',exact:true}).click();const results=root.locator('.document-search-result');await expect(results).toHaveCount(2);
 await expect(results.nth(1)).toContainText('Page 2');await results.nth(1).click();await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 2');await expect(root.locator('.step-text')).toHaveText('Deliver the heartbeat message safely.');
 await results.nth(0).click();await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 2');
});

test('Highlights drill-down exposes the matching coin before clicking it',async({page,server})=>{
 const raw=fixture();raw.page.sections[0].tabs.forEach(tab=>tab.sections[0].diagram.paths[0].steps.push('second'));const root=await open(page,server,raw,'search-coins');await root.getByRole('button',{name:'Close Contents',exact:true}).first().click();await search(root,'heartbeat message');await root.locator('.reader-rail-mark.document-search-match').click();const coin=root.locator('#section-three .coin.document-search-match');await expect(coin).toBeVisible();await coin.click();await expect(root.locator('#section-three .step-text')).toHaveText('Deliver the heartbeat message safely.');expect((await ranges(page)).flatMap(r=>r.text)).toContain('heartbeat message');
});

test('hidden diagram Views and hidden nodes never offer invisible node destinations',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});
 const raw=JSON.parse(await readFile(path.join(repo,'examples/section-views/section-views.spec.json'),'utf8'));
 const diagram=raw.page.blocks[0].tabs[0].sections[1].diagram;diagram.nodes.hidden={title:'Hidden service',hidden:true};diagram.rows[0].push('hidden');
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);
 const root=page.locator('#docview'),before=await page.locator('#src').inputValue(),input=await search(root,'Shared service');await root.getByRole('button',{name:'Results',exact:true}).click();
 const results=root.locator('.document-search-result');await expect(results).toHaveCount(1);await expect(results).toContainText('Data');await expect(results).toContainText('Page 3');
 await results.click();await expect(root.locator('.reader-page-label')).toHaveText('Page 3 of 3');const node=root.locator('[data-dv-node="service"]');await expect(node).toBeVisible();await expect(node).toBeFocused();
 await input.fill('Hidden service');await expect(results).toHaveCount(0);
 // Diagram hiding retains step controls, so their prose remains a usable result.
 await input.fill('Shared step');await expect(results).toHaveCount(2);await results.filter({hasText:'Business'}).click();await expect(root.locator('.step-text')).toBeVisible();await expect(root.locator('.step-text')).toHaveText('Shared step');await expect(page.locator('#src')).toHaveValue(before);
});

test('Unicode matches mark exact original words and preserve the prose DOM',async({page,server})=>{
 const raw={page:{title:'Unicode search',sections:[{id:'unicode',heading:'Text',text:'İabc def 😀 𐐀'}]}};
 const root=await open(page,server,raw,'search-unicode'),prose=root.locator('.sec-text');
 const before=await prose.innerHTML(),input=await search(root,'abc');await root.getByRole('button',{name:'Results',exact:true}).click();
 for(const [query,expected] of [['abc','abc'],['İ','İ'],['i\u0307','İ'],['😀','😀'],['𐐨','𐐀']]){
  await input.fill(query);await expect(root.locator('.document-search-result')).toHaveCount(1);await expect(root.locator('.document-search-snippet')).toHaveText('İabc def 😀 𐐀');await expect(root.locator('.document-search-snippet mark')).toHaveText(expected);
  await expect.poll(async()=> (await ranges(page)).flatMap(r=>r.text)).toEqual([expected]);expect(await prose.innerHTML()).toBe(before);
 }
});


test('Greek sigma searches retain the exact original uppercase and lowercase words',async({page,server})=>{
 const raw={page:{title:'Greek search',sections:[{id:'greek',heading:'Text',text:'ΟΣ ος ΠΡΟΣ προς'}]}};
 const root=await open(page,server,raw,'search-greek'),prose=root.locator('.sec-text');
 const before=await prose.innerHTML(),input=await search(root,'προς');await root.getByRole('button',{name:'Results',exact:true}).click();
 for(const [query,expected] of [['προς',['ΠΡΟΣ','προς']],['ΠΡΟΣ',['ΠΡΟΣ','προς']],['ος',['ΟΣ','ος','ΟΣ','ος']],['ΟΣ',['ΟΣ','ος','ΟΣ','ος']]]){
  await input.fill(query);await expect(root.locator('.document-search-result')).toHaveCount(1);await expect(root.locator('.document-search-snippet mark')).toHaveText(expected[0]);
  await expect.poll(async()=> (await ranges(page)).flatMap(r=>r.text)).toEqual(expected);expect(await prose.innerHTML()).toBe(before);
 }
});
