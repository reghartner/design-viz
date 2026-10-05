import {test,expect,prepareEditorSurface} from '../helpers/test.mjs';
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
  fixture.provider={page:{title:'Notification platform',protocols:{delivery:{label:'Provider delivery',color:'#667788'}},sections:[
    {id:'channels',heading:'Notification channels',diagram:{nodes:{dispatch:{title:'Dispatcher'},push:{title:'Push'},email:{title:'Email'},sms:{title:'SMS'},private:{title:'Never exported'}},rows:[['dispatch'],['push','email','sms','private']],edges:['push','email','sms'].map(to=>({from:'dispatch',to,kind:'delivery'})),topologyExports:{channels:{nodes:['dispatch','push','email','sms'],edges:['dispatch->push','dispatch->email','dispatch->sms']}}}},
    {id:'archive',heading:'Archive section',diagram:{nodes:{archive:{title:'Archive'}},rows:[['archive']],edges:[],topologyExports:{archive:{nodes:['archive'],edges:[]}}}}
  ]}};
  await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(fixture.provider));
  fixture.specs.second.page.blocks.push({id:'destination',heading:'Another destination',diagram:{nodes:{local:{title:'Second local'}},rows:[['local']],edges:[]}});
  await writeFile(path.join(fixture.root,'diagrams/second/second.spec.json'),JSON.stringify(fixture.specs.second));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  fixture.requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))fixture.requests.push(request.url());});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
  fixture.before=await page.locator('#src').inputValue();return fixture;
}
async function openTopology(page){await page.locator('#diagram-add').click();await page.locator('#add-topology').click();await expect(page.getByRole('dialog',{name:'Referenced topology',exact:true})).toBeVisible();}

test('multi-select Inspector re-exports namespaced topology without materializing source',async({page,server})=>{
  await pickerFixture(page,server);await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  await page.locator('#topology-namespace').fill('notify');await page.locator('#topology-add').click();await prepareEditorSurface(page);
  const before=await page.locator('#src').inputValue(),node=id=>page.locator('#docview g.node[data-dv-node="notify::'+id+'"] .t1');
  await node('dispatch').click();await node('push').click({modifiers:['Shift']});
  // Connection identities are rendered indices; find the matching geometry via
  // its source-order index (the consumer owns one edge before the imported three).
  await page.locator('#docview path.edge[data-dv-edge="1"]').dispatchEvent('click',{ctrlKey:true});
  if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
  const form=page.locator('#guide .topology-export-form');await expect(form).toContainText('notify::dispatch->notify::push');
  await form.getByLabel('Export name',{exact:true}).fill('nested');await form.getByRole('button',{name:'Create export',exact:true}).click();
  const after=await page.locator('#src').inputValue(),raw=JSON.parse(after),d=raw.page.blocks[0].diagram;
  expect(d.topologyExports).toEqual({nested:{nodes:['notify::dispatch','notify::push'],edges:['notify::dispatch->notify::push']}});
  delete d.topologyExports;expect(raw).toEqual(JSON.parse(before));expect(after).not.toContain('topologyProvenance');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await page.reload();await prepareEditorSurface(page);await expect(page.locator('#src')).toHaveValue(after);await expect(node('push')).toBeVisible();
});

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
  await page.locator('#topology-add').click();await prepareEditorSurface(page);
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
  await page.reload();await prepareEditorSurface(page);await expect(page.locator('#src')).toHaveValue(after);
  await expect(page.locator('#docview')).not.toContainText('LATER DEPLOYMENT');
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();await expect(page.locator('#topology-nodes')).not.toContainText('LATER DEPLOYMENT');
  await page.locator('#topology-cancel').click();expect(fixture.requests).toHaveLength(2);
});

test('a referenced block is visibly framed, blocked removal explains consumer references, and clean removal has one Undo',async({page,server})=>{
  await pickerFixture(page,server);const consumer=JSON.parse(await page.locator('#src').inputValue());consumer.page.protocols={delivery:{label:'Consumer delivery',color:'#112233'}};
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(consumer,null,2));await page.locator('#go').click();await prepareEditorSurface(page);
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  await page.locator('#topology-add').click();await prepareEditorSurface(page);
  const imported='first::dispatch',boundary=page.locator('#docview .dv-topology-boundary[data-topology-import="first"]');
  await expect(boundary).toBeVisible();await expect(boundary).toContainText('Referenced · first / channels · first');
  await expect(page.locator('#docview')).toContainText('Provider delivery');
  await expect(boundary).toHaveAttribute('role','group');await expect(boundary).toHaveAttribute('aria-label',/Referenced topology first from first, export channels/);
  const importedText=await page.locator('#src').inputValue(),raw=JSON.parse(importedText),d=raw.page.blocks[0].diagram,local=Object.keys(d.nodes)[0];
  d.edges.push({from:local,to:imported});const blockedText=JSON.stringify(raw,null,2);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(blockedText);await page.locator('#go').click();await prepareEditorSurface(page);
  await page.locator('#docview [data-dv-node="'+imported+'"]').click();await page.locator('#editor-tab-inspect').click();
  await page.getByRole('button',{name:'Remove referenced topology first'}).click();
  await expect(page.locator('#guide')).toContainText('Cannot remove referenced topology first');await expect(page.locator('#guide')).toContainText('Consumer connections');
  await expect(page.locator('#src')).toHaveValue(blockedText);
  d.edges.pop();const cleanText=JSON.stringify(raw,null,2);await page.locator('#editor-tab-json').click();await page.locator('#src').fill(cleanText);await page.locator('#go').click();await prepareEditorSurface(page);
  await page.locator('#docview [data-dv-node="'+imported+'"]').click();await page.locator('#editor-tab-inspect').click();
  await page.getByRole('button',{name:'Remove referenced topology first'}).click();await prepareEditorSurface(page);
  const removed=await page.locator('#src').inputValue();expect(JSON.parse(removed).page.blocks[0].diagram.topologyImports).toBeUndefined();
  await expect(page.locator('#docview [data-dv-node="'+imported+'"]')).toHaveCount(0);await expect(boundary).toHaveCount(0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(cleanText);await expect(page.locator('#docview [data-dv-node="'+imported+'"]')).toBeVisible();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(removed);await expect(page.locator('#docview [data-dv-node="'+imported+'"]')).toHaveCount(0);
});

test('a brand-new local diagram explicitly connects to the repository catalog and persists only its reference',async({page,server})=>{
  await pickerFixture(page,server);await page.locator('#workspace-home').click();await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();await prepareEditorSurface(page);
  const before=JSON.parse(await page.locator('#src').inputValue());expect(before.page.canon).toBeUndefined();
  await openTopology(page);await expect(page.locator('#topology-connect')).toBeVisible();await expect(page.locator('#topology-search')).toBeDisabled();
  await page.locator('#topology-connect').click();await expect(page.locator('#topology-connect')).toBeHidden();await expect(page.locator('#topology-add')).toBeEnabled();
  await page.locator('#topology-namespace').fill('notify');await page.locator('#topology-add').click();await prepareEditorSurface(page);
  const authored=JSON.parse(await page.locator('#src').inputValue()),d=authored.page.blocks[0].diagram;
  expect(authored.page.canon).toBeUndefined();expect(JSON.stringify(authored)).not.toContain('workbench-draft');
  expect(d.topologyImports).toEqual([{spec:'first',export:'channels',as:'notify'}]);expect(d.nodes['notify::dispatch']).toBeUndefined();
  await expect(page.locator('#docview [data-dv-node="notify::dispatch"]')).toBeVisible();
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));
  expect(recovered.topologyContext.ephemeral).toBe(true);expect(recovered.topologyContext.id).toMatch(/^workbench-draft/);
  await page.reload();await prepareEditorSurface(page);await expect(page.locator('#docview [data-dv-node="notify::dispatch"]')).toBeVisible();
  expect(JSON.parse(await page.locator('#src').inputValue()).page.canon).toBeUndefined();
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
  await page.locator('#topology-add').click();await prepareEditorSurface(page);
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
  await page.locator('#topology-add').click();await prepareEditorSurface(page);
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
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
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
  await prepareEditorSurface(page);await expect(page.locator('#docview [data-dv-node="platform::api"]')).toBeVisible();
  expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(workspace.source);
  expect(await page.locator('#src').inputValue()).not.toContain('topologyProvenance');
  const before=await page.locator('#src').inputValue(),root=page.locator('#docview');
  const boundary=root.locator('.dv-topology-boundary[data-topology-import="platform"]');await expect(boundary).toBeVisible();
  const boundaryBefore=await boundary.locator('rect').evaluate(rect=>({x:Number(rect.getAttribute('x')),y:Number(rect.getAttribute('y'))}));
  await page.locator('#diagram-add').click();await expect(page.locator('#add-node')).toBeEnabled();await page.locator('#diagram-add-close').click();
  const author=await root.elementHandle();await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
  await expect(page.locator('#page-preview-view [data-dv-node="platform::api"]')).toBeVisible();
  await expect(page.locator('#page-preview-view [data-dv-node="platform::store"]')).toBeVisible();
  expect(await author.evaluate(el=>el.isConnected)).toBe(false);
  await page.locator('#close-page-preview').click();await page.locator('#workspace-appearance>summary').click();
  expect(await author.evaluate(el=>el.isConnected)).toBe(true);await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
  const node=id=>root.locator('g.node[data-dv-node="'+id+'"]');
  const center=async id=>node(id).evaluate(n=>{const m=n.transform.baseVal.consolidate().matrix,c=n.querySelector('.card');return {x:m.e+Number(c.getAttribute('width'))/2,y:m.f+Number(c.getAttribute('height'))/2};});
  const original=await Promise.all(['client','platform::api','platform::store'].map(center));
  async function drag(){
    const box=await node('platform::api').locator('.card').boundingBox(),scale=await node('platform::api').evaluate(n=>n.ownerSVGElement.getScreenCTM().a);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+90*scale,y+70*scale,{steps:12});
  }
  await drag();await expect(root.locator('.dv-ghost')).toHaveCount(2);
  await expect(boundary).toHaveAttribute('transform',/translate\(/);
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
  const boundaryAfter=await boundary.locator('rect').evaluate(rect=>({x:Number(rect.getAttribute('x')),y:Number(rect.getAttribute('y'))}));
  expect(boundaryAfter.x-boundaryBefore.x).toBeCloseTo(90,0);expect(boundaryAfter.y-boundaryBefore.y).toBeCloseTo(70,0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await drag();await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(after);
  await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await drag();const stale=after+'\n';
  await page.evaluate(value=>{const src=document.querySelector('#src');src.value=value;src.dispatchEvent(new Event('input',{bubbles:true}));},stale);
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(stale);
  await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await page.locator('#editor-tab-json').click();await page.locator('#go').click();await prepareEditorSurface(page);
  await page.locator('#editor-tab-file').click();const download=page.waitForEvent('download');await page.locator('#file-save').click();
  const saved=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(saved.page.sections[0].diagram).toEqual(d);
  await page.reload();await prepareEditorSurface(page);expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram).toEqual(d);
  expect(await Promise.all(['client','platform::api','platform::store'].map(center))).toEqual(placed);
  await testInfo.attach('floating-import',{body:await root.screenshot(),contentType:'image/png'});
});

test('nested repository references receive separate non-interactive Workbench boundaries',async({page,server})=>{
  const fixture=await publish(server),sources=[];
  for(const id of ['platform','checkout'])sources.push(JSON.parse(await readFile(new URL('../../../examples/canon/topology/'+id+'.json',import.meta.url),'utf8')));
  sources[1].page.sections[0].diagram.topologyExports={story:{nodes:['platform::api','platform::store'],edges:['platform::api->platform::store']}};
  sources.push({page:{title:'Outer',canon:{version:1,id:'outer',kind:'design',owner:'group:default/test'},sections:[{id:'outer',diagram:{topologyImports:[{spec:'checkout',export:'story',as:'shared'}]}}]}});
  const snapshot=prepareCanonSnapshot(sources),spec=snapshot.loadSpec('outer'),workspace=snapshot.loadWorkspace('outer');
  await page.route('**/api/canon/context?*',route=>route.fulfill({json:{spec,...workspace,catalog:{version:1,services:[]}}}));
  const handoff={version:1,id:'outer',revision:digest(spec),action:'edit'};
  await page.goto(fixture.url+'?canon=outer#fv='+encodeURIComponent(JSON.stringify(handoff)));
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
  const boundaries=page.locator('#docview .dv-topology-boundary');
  await expect(boundaries).toHaveCount(2);
  await expect(page.locator('#docview .dv-topology-boundary[data-topology-import="shared"]')).toBeVisible();
  await expect(page.locator('#docview .dv-topology-boundary[data-topology-import="shared::platform"]')).toContainText('platform / core');
  await expect(boundaries.first()).toHaveCSS('pointer-events','none');
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
  await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
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
  await prepareEditorSurface(page);
  await expect(page.locator('#docview [data-dv-node="platform::api"]')).toBeVisible();
  await expect(page.locator('#docview')).not.toContainText('PROVIDER CHANGED');
  await page.locator('#editor-tab-steps').click();
  await page.locator('#steps-list [data-step-index="1"]').click();await prepareEditorSurface(page);
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
  await page.reload();await prepareEditorSurface(page);
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

for(const handoffAction of [null,'edit'])test('Canon Explore keeps the real Edit action across chapters, tabs and history'+(handoffAction?' for an edit handoff':''),async({page,server},info)=>{
  const fixture=await publish(server),sources=[];
  for(const id of ['platform','checkout'])sources.push(JSON.parse(await readFile(new URL('../../../examples/canon/topology/'+id+'.json',import.meta.url),'utf8')));
  const source=sources[1],section=source.page.sections[0],d=section.diagram;
  d.layouts=[{id:'canvas',name:'Engineering',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},{id:'standard',name:'Overview',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];d.defaultLayout='canvas';
  const other=structuredClone(section);other.id='alternate';other.heading='Alternate diagram';
  source.page.sections=[{tabs:[{label:'First tab',sections:[section]},{label:'Second tab',sections:[other]}]}];
  const snapshot=prepareCanonSnapshot(sources),spec=snapshot.loadSpec('checkout'),workspace=snapshot.loadWorkspace('checkout');
  await page.route('**/api/canon/context?*',route=>route.fulfill({json:{spec,...workspace,catalog:{version:1,services:[]}}}));
  const handoff={version:1,id:'checkout',revision:digest(spec),action:handoffAction || 'view'};
  await page.goto(fixture.url+'?canon=checkout#fv='+encodeURIComponent(JSON.stringify(handoff)));
  const edit=page.locator('#canon-reader-edit'),nav=page.locator('#canon-reader .explore-navigation');
  await expect(edit).toBeEnabled();await expect(nav.locator('#canon-reader-edit')).toBeVisible();const original=await edit.elementHandle();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await expect(edit).toBeInViewport();
    await expect(page.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
    await nav.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);await expect(edit).toBeVisible();
    await nav.getByRole('tab',{name:'Second tab',exact:true}).click();await expect(page.locator('body')).toHaveClass(/viewer-exploring/);await expect(edit).toBeInViewport();
    await nav.getByRole('tab',{name:'First tab',exact:true}).click();await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
    await nav.getByRole('button',{name:'Engineering',exact:true}).click();await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
    expect(await original.evaluate(el=>el===document.querySelector('#canon-reader-edit'))).toBe(true);
    await info.attach('canon-edit-'+width,{body:await page.screenshot(),contentType:'image/png'});
  }
  await edit.click();await prepareEditorSurface(page);expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(workspace.source);
  await expect(page.locator('#docview [data-dv-node="platform::api"]').first()).toBeVisible();await expect(page.locator('#workspace-provenance')).toContainText('Referenced topology (frozen session)');await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.goBack();await expect(nav.locator('#canon-reader-edit')).toBeVisible();await edit.click();await prepareEditorSurface(page);
  expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(workspace.source);await expect(page.locator('#undo-builder')).toBeDisabled();
});
