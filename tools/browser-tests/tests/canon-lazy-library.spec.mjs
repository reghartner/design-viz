import {test,expect,pagePreview} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {publishLibrary} from '../../canon/library.mjs';
import {prepareCanonSnapshot} from '../../canon/entity-diagrams.mjs';
import {digest} from '../../canon/drift.mjs';

async function publish(server){
  const root=path.join(server.root,'company'),workbench=path.join(root,'workbench');
  await mkdir(workbench,{recursive:true});
  for(const [from,to] of [['workbench.html','flowspec.html'],['catalog.json','catalog.json'],['starters.json','starters.json']])await cp(path.join(server.root,from),path.join(workbench,to));
  const specs={};
  for(const id of ['first','second']){
    const spec=editorSpec();spec.page.title=id==='first'?'First story':'Second story';
    delete spec.page.canon;delete spec.page.blocks[0].diagram.layouts;delete spec.page.blocks[0].diagram.defaultLayout;
    const folder=path.join(root,'diagrams',id);await mkdir(folder,{recursive:true});
    await writeFile(path.join(folder,id+'.spec.json'),JSON.stringify(spec));
    await writeFile(path.join(folder,id+'.html'),'<!doctype html>');specs[id]=spec;
  }
  const registryPath=path.join(root,'canon.json'),output=path.join(workbench,'diagrams.json');
  await writeFile(registryPath,JSON.stringify({version:1,diagrams:Object.keys(specs).map(id=>({folder:'diagrams/'+id,owner:'group:default/home'}))}));
  const index=await publishLibrary({registryPath,output});
  return {root,specs,index,url:server.origin+'/company/workbench/flowspec.html',specURL:id=>new URL(index.diagrams.find(entry=>entry.id===id).specUrl,server.origin+'/company/workbench/diagrams.json').href};
}
test.afterEach(async({server})=>{await rm(path.join(server.root,'company'),{recursive:true,force:true});});

async function pickerFixture(page,server){
  const fixture=await publish(server);
  fixture.provider={page:{title:'Notification platform',sections:[
    {id:'channels',heading:'Notification channels',diagram:{nodes:{dispatch:{title:'Dispatcher'},push:{title:'Push'},email:{title:'Email'},sms:{title:'SMS'},private:{title:'Never exported'}},rows:[['dispatch'],['push','email','sms','private']],edges:['push','email','sms'].map(to=>({from:'dispatch',to,kind:'https'})),topologyExports:{channels:{nodes:['dispatch','push','email','sms'],edges:['dispatch->push','dispatch->email','dispatch->sms']}}}},
    {id:'archive',heading:'Archive section',diagram:{nodes:{archive:{title:'Archive'}},rows:[['archive']],edges:[],topologyExports:{archive:{nodes:['archive'],edges:[]}}}}
  ]}};
  await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(fixture.provider));
  fixture.specs.second.page.blocks.push({id:'destination',heading:'Another destination',diagram:{nodes:{local:{title:'Second local'}},rows:[['local']],edges:[]}});
  await writeFile(path.join(fixture.root,'diagrams/second/second.spec.json'),JSON.stringify(fixture.specs.second));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  fixture.requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))fixture.requests.push(request.url());});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  await page.locator('#canon-reader-edit').click();await pagePreview(page);
  fixture.before=await page.locator('#src').inputValue();return fixture;
}
async function openTopology(page){await page.locator('#diagram-add').click();await page.locator('#add-topology').click();await expect(page.getByRole('dialog',{name:'Referenced topology',exact:true})).toBeVisible();}

test('reference picker browses bounded exports, inserts a closed subset, and preserves history/source/frozen recovery',async({page,server},testInfo)=>{
  const fixture=await pickerFixture(page,server);
  expect(fixture.requests).toEqual([fixture.specURL('second')]);await openTopology(page);
  await expect(page.locator('#topology-add')).toBeEnabled();
  await expect(page.locator('#topology-search')).toBeFocused();
  await page.locator('#topology-search').fill('notification');
  await expect(page.locator('#topology-provider option')).toHaveCount(1);
  await expect(page.locator('#topology-owner')).toContainText('group:default/home');
  await expect(page.locator('#topology-section option')).toHaveText(['Notification channels','Archive section']);
  await page.locator('#topology-section').selectOption('1');await expect(page.locator('#topology-export')).toHaveValue('archive');
  await expect(page.locator('#topology-nodes input')).toHaveCount(1);
  await page.locator('#topology-section').selectOption('0');
  await expect(page.locator('#topology-nodes input')).toHaveCount(4);await expect(page.locator('#topology-edges input')).toHaveCount(3);
  await expect(page.locator('#topology-contents')).not.toContainText('Never exported');
  await page.locator('#topology-nodes input[value="email"]').uncheck();
  await expect(page.locator('#topology-add')).toBeDisabled();await expect(page.locator('#topology-status')).toContainText('both endpoints');
  await page.locator('#topology-edges input[value="dispatch->email"]').uncheck();
  await page.locator('#topology-namespace').fill('invalid namespace');await expect(page.locator('#topology-add')).toBeDisabled();
  await page.locator('#topology-namespace').fill('notify');await expect(page.locator('#topology-add')).toBeEnabled();
  await testInfo.attach('reference-picker',{body:await page.locator('#topology-picker').screenshot(),contentType:'image/png'});
  await page.locator('#topology-add').click();await pagePreview(page);
  const after=await page.locator('#src').inputValue(),raw=JSON.parse(after),d=raw.page.blocks[0].diagram;
  expect(d.topologyImports).toEqual([{spec:'first',export:'channels',as:'notify',nodes:['dispatch','push','sms'],edges:['dispatch->push','dispatch->sms']}]);
  expect(d.nodes['notify::push']).toBeUndefined();expect(d.topologyProvenance).toBeUndefined();expect(d.topologyImports[0].position).toBeUndefined();
  await expect(page.locator('#docview [data-dv-node="notify::push"]')).toBeVisible();await expect(page.locator('#docview [data-dv-node="notify::email"]')).toHaveCount(0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(fixture.before);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  fixture.provider.page.sections[0].diagram.nodes.push.title='LATER DEPLOYMENT';await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(fixture.provider));
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  await page.locator('#topology-namespace').fill('notify');await expect(page.locator('#topology-add')).toBeDisabled();await expect(page.locator('#topology-status')).toContainText('duplicate namespace');
  await page.keyboard.press('Escape');await expect(page.locator('#src')).toHaveValue(after);await expect(page.locator('#diagram-add')).toBeFocused();
  expect(fixture.requests).toEqual([fixture.specURL('second'),fixture.specURL('first')]);
  await page.locator('#editor-tab-file').click();const download=page.waitForEvent('download');await page.locator('#file-save').click();
  const saved=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(saved.page.blocks).toEqual(raw.page.blocks);expect(JSON.stringify(saved)).not.toContain('topologyProvenance');
  await page.reload();await pagePreview(page);await expect(page.locator('#src')).toHaveValue(after);
  await expect(page.locator('#docview')).not.toContainText('LATER DEPLOYMENT');
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();await expect(page.locator('#topology-nodes')).not.toContainText('LATER DEPLOYMENT');
  await page.locator('#topology-cancel').click();expect(fixture.requests).toHaveLength(2);
});

test('reference picker cancels stale async work and leaves source/history untouched',async({page,server})=>{
  const fixture=await pickerFixture(page,server);let release;
  const held=new Promise(resolve=>release=resolve);
  await page.route(fixture.specURL('first'),async route=>{await held;await route.fulfill({json:fixture.provider});});
  await openTopology(page);await expect(page.locator('#topology-status')).toContainText('Loading approved');
  await page.keyboard.press('Escape');release();await expect(page.locator('#src')).toHaveValue(fixture.before);await expect(page.locator('#undo-builder')).toBeDisabled();
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  const changed=fixture.before+'\n';await page.evaluate(value=>{const src=document.querySelector('#src');src.value=value;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);
  await expect(page.locator('#topology-add')).toBeDisabled();await expect(page.locator('#topology-status')).toContainText('source or project changed');
  await page.locator('#topology-cancel').click();await expect(page.locator('#src')).toHaveValue(changed);await expect(page.locator('#undo-builder')).toBeDisabled();
  expect(fixture.requests).toHaveLength(2);
});

for(const failure of ['revision','malformed'])test('reference picker fails closed then retries repaired '+failure+' provider response in the same session',async({page,server})=>{
  const fixture=await pickerFixture(page,server),changed=structuredClone(fixture.provider);changed.page.title='Changed deployment';
  await page.route(fixture.specURL('first'),route=>route.fulfill(failure==='revision'?{json:changed}:{body:'not json',contentType:'application/json'}));
  await openTopology(page);await expect(page.locator('#topology-status')).not.toContainText('Loading approved');
  await expect(page.locator('#topology-add')).toBeDisabled();if(failure==='revision')await expect(page.locator('#topology-status')).toContainText('revision mismatch');
  await page.locator('#topology-cancel').click();await expect(page.locator('#src')).toHaveValue(fixture.before);await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.unroute(fixture.specURL('first'));
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  await page.locator('#topology-add').click();await pagePreview(page);
  await expect(page.locator('#docview [data-dv-node="first::dispatch"]')).toBeVisible();
  expect(fixture.requests.filter(url=>url===fixture.specURL('first'))).toHaveLength(2);
  const after=await page.locator('#src').inputValue();
  await page.route(fixture.specURL('first'),route=>route.fulfill({json:changed}));
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();await page.locator('#topology-cancel').click();
  await expect(page.locator('#src')).toHaveValue(after);
  expect(fixture.requests.filter(url=>url===fixture.specURL('first'))).toHaveLength(2);
});

test('reference picker targets another section, uses the full-export shorthand and suggests a collision-free namespace',async({page,server},info)=>{
  await pickerFixture(page,server);await page.setViewportSize({width:760,height:1000});await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  await page.getByLabel('Import destination section',{exact:true}).selectOption('1');await page.locator('#topology-section').selectOption('1');
  await page.locator('#topology-add').click();await pagePreview(page);
  const raw=JSON.parse(await page.locator('#src').inputValue());expect(raw.page.blocks[0].diagram.topologyImports).toBeUndefined();
  expect(raw.page.blocks[1].diagram.topologyImports).toEqual([{spec:'first',export:'archive',as:'first'}]);
  await expect(page.locator('#docview [data-dv-node="first::archive"]')).toBeVisible();
  await openTopology(page);await expect(page.locator('#topology-namespace')).toHaveValue('first-2');
  await expect(page.locator('#topology-add')).toBeEnabled();
  await info.attach('reference-picker-narrow',{body:await page.locator('#topology-picker').screenshot(),contentType:'image/png'});
  await page.locator('#topology-cancel').click();
});

test('reference picker explains unavailable legacy catalogs without fetching invented sources',async({page,server})=>{
  const fixture=await publish(server),spec=fixture.specs.second;spec.page.canon=fixture.index.diagrams[1].canon;
  await writeFile(path.join(fixture.root,'workbench/diagrams.json'),JSON.stringify({version:1,diagrams:[{id:'second',spec}]}));
  const requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();await pagePreview(page);
  const before=await page.locator('#src').inputValue();await openTopology(page);await expect(page.locator('#topology-status')).toContainText('unavailable');
  await expect(page.locator('#topology-add')).toBeDisabled();await page.keyboard.press('Escape');await expect(page.locator('#src')).toHaveValue(before);expect(requests).toEqual([]);
});

test('the backend workspace handoff drags a whole floating import with authored placement and one Undo',async({page,server},testInfo)=>{
  const fixture=await publish(server),sources=[];
  for(const id of ['platform','checkout'])sources.push(JSON.parse(await readFile(new URL('../../../examples/canon/topology/'+id+'.json',import.meta.url),'utf8')));
  const snapshot=prepareCanonSnapshot(sources),spec=snapshot.loadSpec('checkout'),workspace=snapshot.loadWorkspace('checkout');
  await page.route('**/api/canon/context?*',route=>route.fulfill({json:{spec,...workspace,catalog:{version:1,services:[]}}}));
  const handoff={version:1,id:'checkout',revision:digest(spec),action:'edit'};
  await page.goto(fixture.url+'?canon=checkout#fv='+encodeURIComponent(JSON.stringify(handoff)));
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();
  await pagePreview(page);await expect(page.locator('#docview [data-dv-node="platform::api"]')).toBeVisible();
  expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(workspace.source);
  expect(await page.locator('#src').inputValue()).not.toContain('topologyProvenance');
  const before=await page.locator('#src').inputValue(),root=page.locator('#docview');
  const node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
  const center=async id=>node(id).evaluate(n=>{const m=n.transform.baseVal.consolidate().matrix,c=n.querySelector('.card');return {x:m.e+Number(c.getAttribute('width'))/2,y:m.f+Number(c.getAttribute('height'))/2};});
  const original=await Promise.all(['client','platform::api','platform::store'].map(center));
  async function drag(){
    const box=await node('platform::api').locator('.card').boundingBox(),scale=await node('platform::api').evaluate(n=>n.ownerSVGElement.getScreenCTM().a);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+90*scale,y+70*scale,{steps:12});
  }
  await drag();await expect(root.locator('.dv-ghost')).toHaveCount(2);
  await expect(root.locator('.dv-free-edge-preview')).toHaveCount(2);await page.mouse.up();
  const after=await page.locator('#src').inputValue(),moved=JSON.parse(after),d=moved.page.sections[0].diagram;
  const origin=spec.page.sections[0].diagram.topologyProvenance.imports[0].position;
  expect(d.topologyImports[0].position.x).toBeCloseTo(origin.x+90,0);
  expect(d.topologyImports[0].position.y).toBeCloseTo(origin.y+70,0);
  const expected=JSON.parse(before);expected.page.sections[0].diagram.topologyImports[0].position=d.topologyImports[0].position;
  expect(moved).toEqual(expected);expect(d.floats).toBeUndefined();expect(d.topologyProvenance).toBeUndefined();
  const placed=await Promise.all(['client','platform::api','platform::store'].map(center));
  expect(placed[0]).toEqual(original[0]);
  for(const i of [1,2]){expect(placed[i].x-original[i].x).toBeCloseTo(90,0);expect(placed[i].y-original[i].y).toBeCloseTo(70,0);}
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await drag();await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(after);
  await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await drag();const stale=after+'\n';
  await page.evaluate(value=>{const src=document.querySelector('#src');src.value=value;src.dispatchEvent(new Event('input',{bubbles:true}));},stale);
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(stale);
  await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await page.locator('#editor-tab-json').click();await page.locator('#go').click();await pagePreview(page);
  await page.locator('#editor-tab-file').click();const download=page.waitForEvent('download');await page.locator('#file-save').click();
  const saved=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(saved.page.sections[0].diagram).toEqual(d);
  await page.reload();await pagePreview(page);expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram).toEqual(d);
  expect(await Promise.all(['client','platform::api','platform::store'].map(center))).toEqual(placed);
  await testInfo.attach('floating-import',{body:await root.screenshot(),contentType:'image/png'});
});

test('a published topology consumer renders and its imported node inspector is read only',async({page,server})=>{
  const fixture=await publish(server);
  const requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  for(const [id,example] of [['first','platform'],['second','checkout']]){
    const spec=JSON.parse(await readFile(new URL('../../../examples/canon/topology/'+example+'.json',import.meta.url),'utf8'));
    if(id==='second')spec.page.sections[0].diagram.topologyImports[0].spec='first';
    await writeFile(path.join(fixture.root,'diagrams',id,id+'.spec.json'),JSON.stringify(spec));
  }
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  expect(requests).toEqual([fixture.specURL('second'),fixture.specURL('first')]);
  await expect(page.locator('#canon-reader [data-dv-node="platform::api"]')).toBeVisible();
  await page.locator('#canon-reader-edit').click();await pagePreview(page);
  await expect(page.locator('#workspace-provenance')).toContainText('Referenced topology (frozen session)');
  await page.locator('#docview [data-dv-node="platform::api"]').click();
  await page.locator('#editor-tab-inspect').click();
  await expect(page.locator('#guide')).toContainText('Read-only topology from first / core');
  await expect(page.locator('#guide').getByLabel('title',{exact:true})).toHaveCount(0);
  const source=JSON.parse(await page.locator('#src').inputValue());
  expect(source.page.sections[0].diagram.steps[1].edge).toBe('platform::api->platform::store');
  expect(source.page.sections[0].diagram.topologyImports[0].spec).toBe('first');
  expect(source.page.sections[0].diagram.topologyProvenance).toBeUndefined();
  expect(source.page.sections[0].diagram.nodes['platform::api']).toBeUndefined();
  const changed=JSON.parse(await readFile(path.join(fixture.root,'diagrams/first/first.spec.json'),'utf8'));
  changed.page.sections[0].diagram.nodes.api.title='PROVIDER CHANGED';
  await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(changed));
  source.page.sections[0].diagram.steps[1].text='Local narrative change';
  await page.locator('#editor-tab-json').click();
  await page.locator('#src').fill(JSON.stringify(source,null,2));
  await page.locator('#go').click();
  await pagePreview(page);
  await expect(page.locator('#docview [data-dv-node="platform::api"]')).toBeVisible();
  await expect(page.locator('#docview')).not.toContainText('PROVIDER CHANGED');
  await page.locator('#editor-tab-steps').click();
  await page.locator('#steps-list [data-step-index="1"]').click();await pagePreview(page);
  await expect(page.locator('#docview .step-text')).toContainText('Local narrative change');
  await expect(page.locator('#docview .stepid')).toHaveText('persist');
  expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(source);
  await page.locator('#editor-tab-file').click();
  const download=page.waitForEvent('download');await page.locator('#file-save').click();
  const saved=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(saved.page.sections[0].diagram).toEqual(source.page.sections[0].diagram);
  expect(JSON.stringify(saved)).not.toContain('topologyProvenance');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')).text)).toBe(JSON.stringify(source,null,2));
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));
  expect(recovered.topologyContext.specs.find(s=>s.page.canon.id==='first').page.sections[0].diagram.nodes.api.title).toBe('API');
  expect(requests).toHaveLength(2);
  await page.reload();await pagePreview(page);
  await expect(page.locator('#docview [data-dv-node="platform::api"]')).toBeVisible();
  await expect(page.locator('#docview')).not.toContainText('PROVIDER CHANGED');
  expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram).toEqual(source.page.sections[0].diagram);
  expect(requests).toHaveLength(2);
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  await expect(page.locator('#canon-reader')).toContainText('PROVIDER CHANGED');
  const beforeFailure=await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'));
  await page.route(fixture.specURL('first'),route=>route.fulfill({json:{page:{canon:{id:'first'}}}}));
  await page.reload();await expect(page.locator('#canon-reader-edit')).toBeDisabled();
  await expect(page.locator('#canon-reader-error')).toContainText('revision mismatch for first');
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).toBe(beforeFailure);
});

test('the real metadata index fetches only the opened spec and imports the same canonical content',async({page,server})=>{
  const fixture=await publish(server),requests=[];
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  expect(fixture.index.version).toBe(3);expect(JSON.stringify(fixture.index)).not.toContain('rows');
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  await expect(page.locator('.canon-library-card')).toHaveCount(2);expect(requests).toEqual([]);
  await expect(page.locator('.canon-library-card').first()).toContainText('nodes');
  await page.getByRole('link',{name:/First story/}).click();await expect(page.locator('#canon-reader-title')).toHaveText('First story');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();expect(requests).toEqual([fixture.specURL('first')]);
  await page.goBack();await page.getByRole('link',{name:/Second story/}).click();await expect(page.locator('#canon-reader-title')).toHaveText('Second story');
  expect(requests).toEqual([fixture.specURL('first'),fixture.specURL('second')]);
  await page.goBack();await page.getByRole('link',{name:/First story/}).click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  expect(requests).toHaveLength(3);await page.locator('#canon-reader-edit').click();
  const expected=structuredClone(fixture.specs.first);expected.page.canon=fixture.index.diagrams[0].canon;
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(expected,null,2));await expect(page.locator('#undo-builder')).toBeDisabled();
  expect(JSON.parse(await readFile(path.join(fixture.root,'diagrams/first/first.spec.json'),'utf8'))).toEqual(fixture.specs.first);
});

test('a direct link beneath a deployment prefix loads one spec, reloads and preserves the saved draft',async({page,server})=>{
  const fixture=await publish(server),requests=[],draft=JSON.stringify({text:'unfinished draft {',at:1});
  await page.addInitScript(value=>localStorage.setItem('dv-workbench-draft',value),draft);
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-title')).toHaveText('Second story');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();expect(requests).toEqual([fixture.specURL('second')]);
  expect(await page.evaluate(()=>localStorage.getItem('dv-workbench-draft'))).toBe(draft);
  await page.reload();await expect(page.locator('#canon-reader-edit')).toBeEnabled();expect(requests).toEqual([fixture.specURL('second'),fixture.specURL('second')]);
});

test('a late spec response cannot replace another reader or an edited draft',async({page,server})=>{
  const fixture=await publish(server);let release,started;
  const held=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
  await page.route(fixture.specURL('first'),async route=>{started();await held;await route.fulfill({json:fixture.specs.first});});
  await page.goto(fixture.url);await page.locator('#welcome-library').click();await page.getByRole('link',{name:/First story/}).click();await requested;
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();await page.goBack();await page.getByRole('link',{name:/Second story/}).click();
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();
  const before=await page.locator('#src').inputValue();
  const received=page.waitForResponse(fixture.specURL('first'));release();await received;
  await expect(page.locator('#workbench-workspace')).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
});

test('invalid lazy specs show an error and retry fetches repaired content',async({page,server})=>{
  const fixture=await publish(server);let data={page:{title:'Broken',sections:[{diagram:{nodes:{a:{}},rows:[['a']],edges:[{from:'missing',to:'a'}]}}]}};
  await page.route(fixture.specURL('first'),route=>route.fulfill({json:data}));
  await page.goto(fixture.url+'?diagram=first');await expect(page.locator('#canon-reader-error')).toContainText('revision');
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();await expect(page.locator('#canon-reader')).toBeEmpty();
  data=fixture.specs.first;await page.locator('#canon-reader-retry').click();await expect(page.locator('#canon-reader-title')).toHaveText('First story');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();
});
