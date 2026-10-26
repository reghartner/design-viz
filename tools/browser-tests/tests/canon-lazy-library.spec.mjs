import {projectSource,useProjectDownloads} from '../helpers/project-export.mjs';
import {chooseNavigation} from '../helpers/test.mjs';
import {test,expect,prepareEditorSurface,inspectPageElement} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {publishLibrary} from '../../canon/library.mjs';
import {prepareCanonSnapshot} from '../../canon/entity-diagrams.mjs';
import {digest} from '../../canon/drift.mjs';

test.beforeEach(useProjectDownloads);

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

function providerSpec(){
  return {page:{title:'Notification platform',protocols:{delivery:{label:'Provider delivery',color:'#667788'}},sections:[
    {id:'channels',heading:'Notification channels',diagram:{nodes:{dispatch:{title:'Dispatcher'},push:{title:'Push'},email:{title:'Email'},sms:{title:'SMS'},private:{title:'Never exported'}},rows:[['dispatch'],['push','email','sms','private']],edges:['push','email','sms'].map(to=>({from:'dispatch',to,kind:'delivery'})),topologyExports:{channels:{nodes:['dispatch','push','email','sms'],edges:['dispatch->push','dispatch->email','dispatch->sms']}}}},
    {id:'archive',heading:'Archive section',diagram:{nodes:{archive:{title:'Archive'}},rows:[['archive']],edges:[],topologyExports:{archive:{nodes:['archive'],edges:[]}}}}
  ]}};
}
async function pickerFixture(page,server,configure){
  const fixture=await publish(server);
  fixture.provider=providerSpec();
  if(configure)configure(fixture.provider);
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
  await page.locator('#editor-tab-file').click();const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const saved=JSON.parse(await projectSource(await download));
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

for(const canvas of [false,true])test('reference actions navigate, explain blocked deletion, and undo in '+(canvas?'Canvas':'Standard'),async({page,server},info)=>{
  await page.setViewportSize({width:canvas?1280:1440,height:1000});const fixture=await pickerFixture(page,server);
  if(canvas){
    const raw=JSON.parse(await page.locator('#src').inputValue());raw.page.blocks[0].diagram.layouts=[{...editorSpec().page.blocks[0].diagram.layouts[0],id:'canvas',name:'Canvas',presentation:'explore'}];raw.page.blocks[0].diagram.defaultLayout='canvas';
    await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(raw,null,2));await page.locator('#go').click();await prepareEditorSurface(page);
  }
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();await page.locator('#topology-add').click();await prepareEditorSurface(page);
  const handle=page.getByRole('button',{name:'Reference actions for first',exact:true}),menu=page.getByRole('menu',{name:'Reference actions for first',exact:true});
  const member=page.locator('#docview g.node[data-dv-node="first::dispatch"]');
  await expect(handle).toBeVisible();await handle.click({button:'right'});await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem',{name:'Go to diagram',exact:true})).toBeFocused();
  await info.attach('reference-menu-'+(canvas?'canvas':'standard'),{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('End');await expect(menu.getByRole('menuitem',{name:'Delete reference',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(handle).toBeFocused();
  await page.locator('#docview .dv-topology-boundary[data-topology-import="first"] > text').click({button:'right'});await expect(menu).toBeVisible();await page.keyboard.press('Escape');
  await page.locator('#docview path.edge[data-dv-edge="1"]').dispatchEvent('contextmenu',{clientX:400,clientY:500});await expect(menu).toBeVisible();await page.keyboard.press('Escape');
  if(canvas){await page.locator('#docview g.node[data-dv-node="a"]').click({button:'right'});await expect(page.getByRole('menu',{name:'Object actions',exact:true})).toBeVisible();await page.keyboard.press('Escape');}
  await handle.focus();await page.keyboard.press('Shift+F10');await expect(menu).toBeVisible();
  const popupPromise=page.context().waitForEvent('page');await menu.getByRole('menuitem',{name:'Go to diagram',exact:true}).click();
  const provider=await popupPromise;await expect(provider).toHaveURL(fixture.url+'?diagram=first');await expect(provider.locator('#canon-reader')).toContainText('Notification platform');
  await expect(provider.locator('#canon-reader')).toContainText('Never exported');await expect(provider.locator('.dv-topology-handle')).toHaveCount(0);
  expect(await provider.evaluate(()=>window.opener)).toBeNull();await provider.close();
  const importedText=await page.locator('#src').inputValue(),raw=JSON.parse(importedText),diagram=raw.page.blocks[0].diagram;
  diagram.edges.push({from:Object.keys(diagram.nodes)[0],to:'first::dispatch'});const blocked=JSON.stringify(raw,null,2);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(blocked);await page.locator('#go').click();await prepareEditorSurface(page);
  await member.click({button:'right'});await expect(menu).toBeVisible();const remove=menu.getByRole('menuitem',{name:/Delete reference/});
  await expect(remove).toHaveAttribute('aria-disabled','true');await expect(remove).toContainText('Consumer connections');await remove.click({force:true});await expect(page.locator('#src')).toHaveValue(blocked);
  await page.keyboard.press('Escape');await page.locator('#editor-tab-json').click();await page.locator('#src').fill(importedText);await page.locator('#go').click();await prepareEditorSurface(page);
  await handle.click();await expect(menu).toBeVisible();await menu.getByRole('menuitem',{name:'Inspect imported member',exact:true}).click();await expect(page.locator('#guide')).toContainText('Read-only topology structure from first');await prepareEditorSurface(page);
  await handle.click();await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(menu).toHaveCount(0);
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(importedText);await page.locator('#go').click();await prepareEditorSurface(page);
  await member.click({button:'right'});await menu.getByRole('menuitem',{name:'Delete reference',exact:true}).click();
  const removed=await page.locator('#src').inputValue();expect(JSON.parse(removed).page.blocks[0].diagram.topologyImports).toBeUndefined();await expect(handle).toHaveCount(0);await expect(member).toHaveCount(0);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(importedText);await expect(handle).toBeVisible();await expect(member).toBeVisible();
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(removed);
});

test('reference actions choose the deepest provider and refuse unverified deployment links',async({page,server})=>{
  const fixture=await publish(server),leaf={page:{title:'Leaf provider',sections:[{heading:'Leaf',diagram:{nodes:{leaf:{title:'Leaf node'}},rows:[['leaf']],edges:[],topologyExports:{leaf:{nodes:['leaf'],edges:[]}}}}]}};
  await mkdir(path.join(fixture.root,'diagrams/leaf'),{recursive:true});await writeFile(path.join(fixture.root,'diagrams/leaf/leaf.spec.json'),JSON.stringify(leaf));
  const provider=fixture.specs.first.page.blocks[0].diagram;provider.topologyImports=[{spec:'leaf',export:'leaf',as:'inner'}];provider.topologyExports={nested:{nodes:['inner::leaf'],edges:[]}};
  await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(fixture.specs.first));
  await writeFile(path.join(fixture.root,'canon.json'),JSON.stringify({version:1,diagrams:['first','second','leaf'].map(id=>({folder:'diagrams/'+id,owner:'group:default/home'}))}));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
  await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();await page.locator('#topology-add').click();await prepareEditorSurface(page);
  const menu=page.getByRole('menu',{name:'Reference actions for first::inner',exact:true}),node=page.locator('#docview g.node[data-dv-node="first::inner::leaf"]');
  await node.click({button:'right'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem',{name:/Delete reference/})).toContainText('nested reference belongs to its containing provider');
  const popupPromise=page.context().waitForEvent('page');await menu.getByRole('menuitem',{name:'Go to diagram',exact:true}).click();const popup=await popupPromise;await expect(popup).toHaveURL(fixture.url+'?diagram=leaf');await expect(popup.locator('#canon-reader')).toContainText('Leaf provider');await popup.close();
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));recovered.topologyContext.catalogURL='https://another-deployment.invalid/workbench/diagrams.json';
  await page.addInitScript(draft=>localStorage.setItem('dv-workbench-draft',JSON.stringify(draft)),recovered);
  await page.reload();await prepareEditorSurface(page);await node.click({button:'right'});await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem',{name:/Go to diagram/})).toHaveAttribute('aria-disabled','true');await expect(menu.getByRole('menuitem',{name:/Copy diagram link/})).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Reference actions for first',exact:true}).click();
  const outer=page.getByRole('menu',{name:'Reference actions for first',exact:true});await expect(outer).toBeVisible();
  const before=await page.locator('#src').inputValue();await outer.getByRole('menuitem',{name:'Delete reference',exact:true}).evaluate(el=>window.staleReferenceDelete=el);
  await page.locator('#workspace-home').click();await expect(outer).toHaveCount(0);await page.evaluate(()=>window.staleReferenceDelete.click());await expect(page.locator('#src')).toHaveValue(before);
});

test('Add to step gives imported nodes and edges the same emphasis as local members',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:1000});await pickerFixture(page,server);await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();await page.locator('#topology-add').click();await prepareEditorSurface(page);
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="0"]').click();await page.locator('#editor-tab-inspect').click();
  await page.locator('#guide').getByRole('button',{name:'ADD TO STEP',exact:true}).click();await prepareEditorSurface(page);
  const localNode=page.locator('#docview g.node[data-dv-node="c"]'),importedNode=page.locator('#docview g.node[data-dv-node="first::dispatch"]');
  await localNode.locator('.t1').click();await importedNode.locator('.t1').click();
  const localEdge=page.locator('#docview path.edge[data-dv-edge="0"]'),importedEdge=page.locator('#docview path.edge[data-dv-edge="1"]');
  await importedEdge.dispatchEvent('click');
  for(const member of [localNode,importedNode,localEdge,importedEdge])await expect(member).toHaveClass(/dv-instep/);
  const nodeStyle=el=>{const card=getComputedStyle(el.querySelector('.card'));return {opacity:getComputedStyle(el).opacity,width:card.strokeWidth,dash:card.strokeDasharray};};
  const edgeStyle=el=>{const style=getComputedStyle(el),halo=getComputedStyle(el.parentNode.querySelector('path.halo[data-dv-edge="'+el.getAttribute('data-dv-edge')+'"]'));return {opacity:style.opacity,width:style.strokeWidth,haloOpacity:halo.opacity,haloWidth:halo.strokeWidth};};
  expect(await importedNode.evaluate(nodeStyle)).toEqual(await localNode.evaluate(nodeStyle));
  expect(await importedEdge.evaluate(edgeStyle)).toEqual(await localEdge.evaluate(edgeStyle));
  expect((await importedEdge.evaluate(edgeStyle)).haloOpacity).toBe('0.5');
  await expect(page.locator('#docview path.halo[data-dv-edge="1"]')).toHaveClass(/dv-instep/);
  await info.attach('add-to-step-imported-and-local-emphasis',{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('Escape');const raw=JSON.parse(await page.locator('#src').inputValue()),step=raw.page.blocks[0].diagram.steps[0];
  expect(step.edges).toContain('first::dispatch->first::push');expect(step.nodes).toEqual(expect.arrayContaining(['c','first::dispatch']));expect(raw.page.blocks[0].diagram.nodes['first::dispatch']).toBeUndefined();
});

/* #592 contract matrix (deployed site: referenced topology is preloaded, no connect step)
   row | fixture | assertion (scoped) | rejects
   B1 blank draft | deployed library, Home → New → Blank | #topology-connect absent; #topology-search enabled; #topology-add enabled; no extra diagrams.json request | the Connect gate, or a picker that refetches the index
   B2 reference only | add from blank draft | saved JSON holds topologyImports only; recovery keeps ephemeral context; reload re-renders | writing provider hardcopy or canon identity
   S1 in-flight index | index response held across close/reopen/Escape | picker shows loading, selection and source untouched, no second request while pending | duplicate fetches or a stale settlement corrupting the picker
   S2 settlement | held response resolves / rejects | resolve: providers listed without a new request; reject: next open requests again and lists providers | caching a failed index
   C1 paste | Welcome paste of a consumer with topologyImports | editor renders notify::dispatch; source stays authored | "open this authored spec from Canon" refusal
   C2 JSON edit | blank draft, typed topologyImports in #src | board renders the imported node; source unchanged | the Topology editor error with no acquisition
   E1 redeploy | provider republished after pin | status names revision mismatch; #topology-refresh visible; after click providers load and insertion works | a dead end that only offers "reopen"
   U1 no library | diagrams.json answers 404 | #topology-connect absent; #topology-refresh hidden; status says no published diagram library and names no control; provider select disabled; no spec request | a Connect/Retry/refresh control or an instruction aimed at a human
   U2 offline | workbench opened from file:// | #topology-connect absent; #topology-refresh hidden; status explains the offline editor has no published library; zero http(s) requests | guessing a network path offline
   U3 legacy | version 1 index (existing test below, "explains unavailable legacy catalogs") | #topology-connect absent; #topology-refresh hidden; status names version 3 and no control; provider select disabled; no spec request | keeping the Connect gate for v1/v2 deployments */
test('a brand-new local diagram on a deployed site browses providers automatically and persists only its reference',async({page,server})=>{
  const indexRequests=[];page.on('request',request=>{if(request.url().endsWith('/diagrams.json'))indexRequests.push(request.url());});
  await pickerFixture(page,server);await page.locator('#workspace-home').click();await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();await prepareEditorSurface(page);
  const before=JSON.parse(await page.locator('#src').inputValue());expect(before.page.canon).toBeUndefined();
  const requestsBefore=indexRequests.length;
  await openTopology(page);await expect(page.locator('#topology-connect')).toHaveCount(0);
  await expect(page.locator('#topology-search')).toBeEnabled();await expect(page.locator('#topology-add')).toBeEnabled();
  await expect(page.locator('#topology-provider')).toHaveValue('first');
  // Only diagrams with named exports are offered: 'second' has none and is not a provider.
  await expect(page.locator('#topology-provider option')).toHaveText(['Notification platform · first']);
  expect(indexRequests.length).toBe(requestsBefore);
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

for(const settlement of ['resolve','reject'])test('a held repository index '+settlement+' cannot corrupt a reopened reference picker or clear its selection',async({page,server})=>{
  const fixture=await publish(server);
  // Publish a real provider so the settled index lists something to add.
  await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(providerSpec()));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  function deferred(){let release;return {promise:new Promise(resolve=>release=resolve),release};}
  const attempts=[0,1].map(()=>({gate:deferred(),seen:deferred(),done:deferred()}));let request=0;
  const catalogURL=new URL('diagrams.json',fixture.url).href,catalog=await readFile(path.join(fixture.root,'workbench/diagrams.json'),'utf8');
  await page.route(catalogURL,async route=>{
    const index=request++,attempt=attempts[index];attempt.seen.release();await attempt.gate.promise;
    await route.fulfill({status:200,contentType:'application/json',body:index===0 && settlement==='reject'?'{':catalog});attempt.done.release();
  });
  await page.goto(fixture.url);await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Simple service flow'}).click();await prepareEditorSurface(page);
  const selected=page.locator('#docview g.node[data-dv-node]').first();await inspectPageElement(page,selected.locator('.t1'));
  const title=page.locator('#guide').getByLabel('Name',{exact:true}),before=await page.locator('#src').inputValue();
  await expect(selected).toHaveClass(/dv-sel/);await expect(title).toBeVisible();
  await openTopology(page);await attempts[0].seen.promise;
  await expect(page.locator('#topology-connect')).toHaveCount(0);await expect(page.locator('#topology-status')).toContainText('Loading');
  await expect(page.locator('#topology-add')).toBeDisabled();await page.locator('#topology-cancel').click();
  await openTopology(page);await expect(page.locator('#topology-status')).toContainText('Loading');expect(request).toBe(1);
  await page.keyboard.press('Escape');await expect(page.locator('#topology-picker')).not.toBeVisible();
  await expect(selected).toHaveClass(/dv-sel/);await expect(title).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
  attempts[0].gate.release();await attempts[0].done.promise;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(selected).toHaveClass(/dv-sel/);await expect(title).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
  if(settlement==='reject'){attempts[1].gate.release();}
  await openTopology(page);
  if(settlement==='reject'){await attempts[1].seen.promise;await attempts[1].done.promise;}
  await expect(page.locator('#topology-add')).toBeEnabled();expect(request).toBe(settlement==='reject'?2:1);
  await page.keyboard.press('Escape');await expect(selected).toHaveClass(/dv-sel/);await expect(title).toBeVisible();await expect(page.locator('#src')).toHaveValue(before);
});

test('pasting a consumer that references topology on a deployed site loads its providers automatically',async({page,server})=>{
  const fixture=await pickerFixture(page,server);await page.locator('#workspace-home').click();
  const consumer=structuredClone(fixture.specs.second);consumer.page.blocks[0].diagram.topologyImports=[{spec:'first',export:'channels',as:'notify'}];
  const text=JSON.stringify(consumer,null,2);
  await page.locator('#welcome-paste').click();await page.locator('#welcome-json').fill(text);await page.locator('#welcome-paste-form button[type=submit]').click();
  await prepareEditorSurface(page);await expect(page.locator('#docview [data-dv-node="notify::dispatch"]')).toBeVisible();
  await expect(page.locator('#welcome-paste-error')).toBeHidden();
  const authored=JSON.parse(await page.locator('#src').inputValue());
  expect(authored.page.blocks[0].diagram.topologyImports).toEqual([{spec:'first',export:'channels',as:'notify'}]);
  expect(authored.page.blocks[0].diagram.nodes['notify::dispatch']).toBeUndefined();expect(await page.locator('#src').inputValue()).not.toContain('topologyProvenance');
});

test('typing a topology reference into the JSON source of a local draft loads the provider on a deployed site',async({page,server})=>{
  await pickerFixture(page,server);await page.locator('#workspace-home').click();await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();await prepareEditorSurface(page);
  await page.locator('#editor-tab-json').click();const raw=JSON.parse(await page.locator('#src').inputValue());
  raw.page.blocks[0].diagram.topologyImports=[{spec:'first',export:'channels',as:'notify'}];const typed=JSON.stringify(raw,null,2);
  await page.locator('#src').fill(typed);
  await expect(page.locator('#docview [data-dv-node="notify::dispatch"]')).toBeVisible();
  await expect(page.locator('#src')).toHaveValue(typed);
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));
  expect(recovered.topologyContext.ephemeral).toBe(true);expect(recovered.topologyContext.specs.map(spec=>spec.page.canon.id)).toContain('first');
});

test('a workbench without a published diagram library explains that referenced topology is unavailable',async({page,server,audit})=>{
  const indexURL=server.origin+'/diagrams.json';audit.allowStatus(404,url=>url===indexURL);
  await page.route(indexURL,route=>route.fulfill({status:404,contentType:'text/plain',body:''}));
  const specRequests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))specRequests.push(request.url());});
  await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();await prepareEditorSurface(page);
  const before=await page.locator('#src').inputValue();await openTopology(page);
  await expect(page.locator('#topology-connect')).toHaveCount(0);await expect(page.locator('#topology-refresh')).toBeHidden();
  await expect(page.locator('#topology-status')).toContainText('no published diagram library');
  await expect(page.locator('#topology-status')).not.toContainText(/Connect|button/);
  await expect(page.locator('#topology-provider')).toBeDisabled();await expect(page.locator('#topology-add')).toBeDisabled();
  await page.keyboard.press('Escape');await expect(page.locator('#src')).toHaveValue(before);expect(specRequests).toEqual([]);
});

test('an offline workbench opened from file:// explains that referenced topology needs a deployed site and makes no request',async({page,server})=>{
  const requests=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  await page.goto('file://'+server.root+'/workbench.html');await page.locator('#welcome-new').click();
  await page.locator('.welcome-template-card').filter({hasText:'Blank diagram'}).click();await prepareEditorSurface(page);
  await openTopology(page);await expect(page.locator('#topology-connect')).toHaveCount(0);await expect(page.locator('#topology-refresh')).toBeHidden();
  await expect(page.locator('#topology-status')).toContainText('deployed');await expect(page.locator('#topology-status')).toContainText('no published diagram library');
  await expect(page.locator('#topology-provider')).toBeDisabled();await expect(page.locator('#topology-add')).toBeDisabled();
  await page.keyboard.press('Escape');expect(requests).toEqual([]);
});

test('a later deployment of a provider can be adopted from the picker when frozen providers are unchanged',async({page,server})=>{
  const fixture=await pickerFixture(page,server),later=structuredClone(fixture.provider);later.page.title='Notification platform v2';
  await writeFile(path.join(fixture.root,'diagrams/first/first.spec.json'),JSON.stringify(later));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  await openTopology(page);await expect(page.locator('#topology-status')).toContainText('revision mismatch');
  await expect(page.locator('#topology-add')).toBeDisabled();await expect(page.locator('#topology-refresh')).toBeVisible();
  await page.locator('#topology-refresh').click();
  await expect(page.locator('#topology-refresh')).toBeHidden();await expect(page.locator('#topology-add')).toBeEnabled();
  await expect(page.locator('#topology-provider')).toContainText('Notification platform v2');
  await page.locator('#topology-namespace').fill('notify');await page.locator('#topology-add').click();await prepareEditorSurface(page);
  await expect(page.locator('#docview [data-dv-node="notify::dispatch"]')).toBeVisible();
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('dv-workbench-draft')));
  expect(recovered.topologyContext.catalog.diagrams.find(entry=>entry.id==='first').title).toBe('Notification platform v2');
  expect(recovered.topologyContext.specs.map(spec=>spec.page.canon.id).sort()).toEqual(['first','second']);
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
  // #592 (row U3): a legacy index gets the same control-free explanation as a missing one.
  await expect(page.locator('#topology-connect')).toHaveCount(0);await expect(page.locator('#topology-refresh')).toBeHidden();
  await expect(page.locator('#topology-status')).toContainText('version 3');await expect(page.locator('#topology-status')).not.toContainText(/Connect|button/);
  await expect(page.locator('#topology-provider')).toBeDisabled();
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
  const boundaryBefore=await boundary.locator(':scope > rect').evaluate(rect=>({x:Number(rect.getAttribute('x')),y:Number(rect.getAttribute('y'))}));
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
  let delta;
  async function drag(){
    const box=await boundary.locator('.dv-topology-handle').boundingBox(),scale=await node('platform::api').evaluate(n=>n.ownerSVGElement.getScreenCTM().a);
    const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
    delta={dx:Math.round(90*scale)/scale,dy:Math.round(70*scale)/scale};
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+Math.round(90*scale),y+Math.round(70*scale),{steps:12});
  }
  await drag();await expect(root.locator('.dv-ghost')).toHaveCount(2);
  await expect(boundary).toHaveAttribute('transform',/translate\(/);
  await expect(root.locator('.dv-free-edge-preview')).toHaveCount(2);await page.mouse.up();
  const after=await page.locator('#src').inputValue(),moved=JSON.parse(after),d=moved.page.sections[0].diagram;
  const origin=spec.page.sections[0].diagram.topologyProvenance.imports[0].position;
  expect(d.topologyImports[0].position.x).toBeCloseTo(origin.x+delta.dx,0);
  expect(d.topologyImports[0].position.y).toBeCloseTo(origin.y+delta.dy,0);
  const expected=JSON.parse(before);expected.page.sections[0].diagram.topologyImports[0].position=d.topologyImports[0].position;
  expect(moved).toEqual(expected);expect(d.floats).toBeUndefined();expect(d.topologyProvenance).toBeUndefined();
  const placed=await Promise.all(['client','platform::api','platform::store'].map(center));
  expect(placed[0]).toEqual(original[0]);
  for(const i of [1,2]){expect(placed[i].x-original[i].x).toBeCloseTo(delta.dx,0);expect(placed[i].y-original[i].y).toBeCloseTo(delta.dy,0);}
  const boundaryAfter=await boundary.locator(':scope > rect').evaluate(rect=>({x:Number(rect.getAttribute('x')),y:Number(rect.getAttribute('y'))}));
  expect(boundaryAfter.x-boundaryBefore.x).toBeCloseTo(delta.dx,0);expect(boundaryAfter.y-boundaryBefore.y).toBeCloseTo(delta.dy,0);
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
  await page.locator('#editor-tab-file').click();const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const saved=JSON.parse(await projectSource(await download));
  expect(saved.page.sections[0].diagram).toEqual(d);
  await page.reload();await prepareEditorSurface(page);expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram).toEqual(d);
  expect(await Promise.all(['client','platform::api','platform::store'].map(center))).toEqual(placed);
  await testInfo.attach('floating-import',{body:await root.screenshot(),contentType:'image/png'});
});

test('nested repository references receive separate Workbench boundaries and action handles',async({page,server})=>{
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
  await expect(boundaries.first().locator('.dv-topology-handle')).toHaveCSS('pointer-events','all');
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
  await expect(page.locator('#guide')).toContainText('Read-only topology structure from first / core');
  await expect(page.locator('#guide').getByLabel('Name',{exact:true})).toHaveCount(0);
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
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const saved=JSON.parse(await projectSource(await download));
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
  await page.locator('#welcome-library-grid').getByRole('link',{name:'First story',exact:true}).click();await expect(page.locator('#canon-reader-title')).toHaveText('First story');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();expect(requests).toEqual([fixture.specURL('first')]);
  await page.goBack();await page.locator('#welcome-library-grid').getByRole('link',{name:'Second story',exact:true}).click();await expect(page.locator('#canon-reader-title')).toHaveText('Second story');
  expect(requests).toEqual([fixture.specURL('first'),fixture.specURL('second')]);
  await page.goBack();await page.locator('#welcome-library-grid').getByRole('link',{name:'First story',exact:true}).click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  expect(requests).toHaveLength(3);await page.locator('#canon-reader-edit').click();
  const expected=structuredClone(fixture.specs.first);expected.page.canon=fixture.index.diagrams[0].canon;
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(expected,null,2));await expect(page.locator('#undo-builder')).toBeDisabled();
  expect(JSON.parse(await readFile(path.join(fixture.root,'diagrams/first/first.spec.json'),'utf8'))).toEqual(fixture.specs.first);
});

test('the selected site skin owns Canon, navigation and editor rerenders without changing authored defaults',async({page,server})=>{
  const fixture=await publish(server);
  fixture.specs.first.page.skin='daylight';fixture.specs.second.page.skin='aurora';
  for(const id of ['first','second'])await writeFile(path.join(fixture.root,'diagrams',id,id+'.spec.json'),JSON.stringify(fixture.specs[id]));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});

  await page.goto(fixture.url+'?diagram=first');
  const body=page.locator('body'),reader=page.locator('#canon-reader');
  await expect(body).toHaveClass(/\bsk-pastel\b/);await expect(reader).toHaveClass(/\bsk-pastel\b/);
  const pastelSection=await reader.locator('.doc-sec').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.context().addCookies([{name:'dv_skin',value:'blueprint',url:server.origin}]);await page.reload();
  await expect(page.locator('#canon-reader-title')).toHaveText('First story');
  await expect(body).toHaveClass(/\bsk-blueprint\b/);await expect(reader).toHaveClass(/\bsk-blueprint\b/);
  const firstSection=await reader.locator('.doc-sec').first().elementHandle();

  await reader.locator('.reader-theme-menu>summary').click();await reader.locator('[data-reader-skin="terminal"]').click();
  await expect(body).toHaveClass(/\bsk-terminal\b/);await expect(reader).toHaveClass(/\bsk-terminal\b/);
  expect(await firstSection.evaluate(el=>el.isConnected)).toBe(true);
  const terminalSection=await reader.locator('.doc-sec').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(terminalSection).not.toBe(pastelSection);

  await page.locator('[data-welcome-back]:visible').click();
  if(await page.locator('#welcome-home').isVisible())await page.locator('#welcome-library').click();
  await page.locator('#welcome-library-grid').getByRole('link',{name:'Second story',exact:true}).click();
  await expect(page.locator('#canon-reader-title')).toHaveText('Second story');
  await expect(body).toHaveClass(/\bsk-terminal\b/);await expect(reader).toHaveClass(/\bsk-terminal\b/);
  expect(await reader.locator('.doc-sec').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(terminalSection);

  const secondSection=await reader.locator('.doc-sec').first().elementHandle();
  await page.evaluate(()=>window.postMessage({type:'dv_skin',skin:'rose'},'*'));
  await expect(body).toHaveClass(/\bsk-rose\b/);await expect(reader).toHaveClass(/\bsk-rose\b/);
  expect(await secondSection.evaluate(el=>el.isConnected)).toBe(true);
  await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);
  const source=await page.locator('#src').inputValue();expect(JSON.parse(source).page.skin).toBe('aurora');
  await expect(page.locator('#docview')).toHaveClass(/\bsk-rose\b/);
  await page.locator('#go').evaluate(button=>button.click());await expect(page.locator('#src')).toHaveValue(source);
  await expect(page.locator('#docview')).toHaveClass(/\bsk-rose\b/);
  expect(JSON.parse(await readFile(path.join(fixture.root,'diagrams/second/second.spec.json'),'utf8')).page.skin).toBe('aurora');
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
  await page.goto(fixture.url);await page.locator('#welcome-library').click();await page.locator('#welcome-library-grid').getByRole('link',{name:'First story',exact:true}).click();await requested;
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();await page.goBack();await page.locator('#welcome-library-grid').getByRole('link',{name:'Second story',exact:true}).click();
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
  test.setTimeout(90000);
  await page.addInitScript(()=>{window.__copiedCanonLinks=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copiedCanonLinks.push(text)}});});
  const fixture=await publish(server),sources=[];
  for(const id of ['platform','checkout'])sources.push(JSON.parse(await readFile(new URL('../../../examples/canon/topology/'+id+'.json',import.meta.url),'utf8')));
  const source=sources[1],section=source.page.sections[0],d=section.diagram;
  d.layouts=[
    {id:'canvas',name:'Engineering',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
    {id:'standard',name:'Overview',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
    {id:'operations',name:'Operational readiness',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
    {id:'incidents',name:'Incident response',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}
  ];d.defaultLayout='canvas';
  const other=structuredClone(section);other.id='alternate';other.heading='Alternate diagram';
  source.page.sections=[{tabs:[{label:'First tab',sections:[section]},{label:'Second tab',sections:[other]}]}];
  const snapshot=prepareCanonSnapshot(sources),spec=snapshot.loadSpec('checkout'),workspace=snapshot.loadWorkspace('checkout');
  await page.route('**/api/canon/context?*',route=>route.fulfill({json:{spec,...workspace,catalog:{version:1,services:[]}}}));
  const handoff={version:1,id:'checkout',revision:digest(spec),action:handoffAction || 'view'};
  await page.goto(fixture.url+'?canon=checkout#fv='+encodeURIComponent(JSON.stringify(handoff)));
  const edit=page.locator('#canon-reader-edit'),nav=page.locator('#canon-reader .explore-navigation');
  await expect(nav).toHaveClass(/reader-single-toolbar/);await expect(nav.locator('.reader-top>.reader-toolbar')).toHaveCount(1);await expect(nav.locator(':scope>.reader-toolbar')).toHaveCount(0);
  async function reachableEdit(close=true){const menu=nav.locator('.reader-utilities'),summary=menu.locator(':scope>summary');if(!await edit.isVisible())await summary.click();await expect(edit).toBeInViewport();await expect(edit).toBeEnabled();await edit.click({trial:true});if(close && await menu.getAttribute('open')!==null)await summary.click();}
  await expect(edit).toBeEnabled();await expect(nav.locator('#canon-reader-edit')).toBeVisible();const original=await edit.elementHandle();
  await page.evaluate(()=>document.fonts.ready);
  const topHeight=()=>nav.locator('.reader-top').evaluate(el=>el.getBoundingClientRect().height),topHeights=new Map();
  async function desktopHeader(width){
    await expect.poll(()=>nav.evaluate((el,width)=>{
      const top=el.querySelector('.reader-top'),views=el.querySelector('.reader-view-strip');
      const hostActions=Array.from(el.querySelectorAll('.reader-utility-options>.welcome-button'));
      const viewChoices=Array.from(views.children),actionBounds=hostActions.map(node=>node.getBoundingClientRect()),viewBounds=viewChoices.map(node=>node.getBoundingClientRect());
      return {
        labels:hostActions.map(node=>node.textContent.trim() || node.getAttribute('aria-label')),
        compact:hostActions.every(node=>{
          const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
          return rect.height<=36 && node.scrollWidth<=node.clientWidth && style.whiteSpace==='nowrap';
        }),
        viewsUnclipped:viewChoices.every(node=>node.scrollWidth<=node.clientWidth),
        separated:actionBounds.every(a=>viewBounds.every(v=>a.right<=v.left+1 || v.right<=a.left+1 || a.bottom<=v.top+1 || v.bottom<=a.top+1)),
        // TOUR and embed stay visible. Four long authored View labels need the
        // existing two-row desktop header below 1200px; controls remain compact.
        rowHeightOk:top.getBoundingClientRect().height<=(width>=1200?56:92)
      };
    },width)).toEqual({labels:['Edit in Workbench →','Copy link to current position'],compact:true,viewsUnclipped:true,separated:true,rowHeightOk:true});
  }
  async function reachableControls(){
    await expect.poll(()=>nav.evaluate(el=>{
      const bounds=el.getBoundingClientRect(),controls=Array.from(el.querySelectorAll('.reader-top select,.reader-top button,.reader-top summary,.reader-toolbar button,.reader-toolbar summary')).filter(node=>node.checkVisibility({visibilityProperty:true})).map(node=>({node,rect:node.getBoundingClientRect()}));
      return controls.every(({node,rect:r})=>r.left>=bounds.left && r.right<=bounds.right && r.top>=bounds.top && r.bottom<=bounds.bottom && node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)));
    })).toBe(true);
  }
  for(const width of [1440,1201,1200,1120,1101,1100,900,390,320]){
    await page.setViewportSize({width,height:1000});await reachableEdit();
    await expect(page.getByRole('button',{name:/Back to page/i})).toHaveCount(0);
    if(width>670)await desktopHeader(width);
    await expect(nav.locator('.reader-utility-options button[aria-label^="Copy link"]')).toHaveCount(1);
    await reachableControls();topHeights.set(width,await topHeight());
    if([1440,1200,1120,900,390,320].includes(width))await info.attach('canon-edit-'+width,{body:await page.screenshot(),contentType:'image/png'});
  }
  for(const width of [1201,1200,1120,1101,1100,900]){
    await page.setViewportSize({width,height:1000});
    let overviewHeight;
    // Presentations have different action widths (Panels versus Panels · 0).
    // Each must settle to its own height independent of navigation history.
    // At 1100px a stale compact-toggle cache added a third View row on return.
    for(let round=0;round<([1100,1120].includes(width)?2:1);round++){
      await chooseNavigation(nav,'View','Overview');await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);await reachableEdit();
      await desktopHeader(width);await reachableControls();
      if(round===0)overviewHeight=await topHeight();else await expect.poll(topHeight).toBe(overviewHeight);
      await chooseNavigation(nav,'View','Engineering');await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
      await desktopHeader(width);await reachableControls();await expect.poll(topHeight).toBe(topHeights.get(width));
    }
  }
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    await chooseNavigation(nav,'View','Overview');await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);await reachableEdit();
    await chooseNavigation(nav,'Tab','Second tab');await expect(page.locator('body')).toHaveClass(/viewer-exploring/);await reachableEdit();
    await chooseNavigation(nav,'Tab','First tab');await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
    await chooseNavigation(nav,'View','Engineering');await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
    await expect.poll(()=>nav.locator('.reader-top').evaluate(el=>el.getBoundingClientRect().height)).toBe(topHeights.get(width));
    expect(await original.evaluate(el=>el===document.querySelector('#canon-reader-edit'))).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1000});const copy=nav.getByRole('button',{name:'Copy link to current position',exact:true});await copy.click();
  const copied=new URL(await page.evaluate(()=>window.__copiedCanonLinks.at(-1)));expect(copied.searchParams.get('diagram')).toBe('checkout');expect(copied.hash).toContain('t=first-tab');expect(copied.hash).toContain('d='+section.id);expect(copied.hash).toContain('v=canvas');
  await reachableEdit(false);await edit.click();await prepareEditorSurface(page);expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(workspace.source);
  await expect(page.locator('#docview [data-dv-node="platform::api"]').first()).toBeVisible();await expect(page.locator('#workspace-provenance')).toContainText('Referenced topology (frozen session)');await expect(page.locator('#undo-builder')).toBeDisabled();
  await page.goBack();await reachableEdit(false);await edit.click();await prepareEditorSurface(page);
  expect(JSON.parse(await page.locator('#src').inputValue())).toEqual(workspace.source);await expect(page.locator('#undo-builder')).toBeDisabled();
});

// #545 — Browse diagrams text filter. Fixture: three published v3 diagrams with
// distinct titles, owners and one service (node) name that no card displays.
// row | fixture | assertion (scoped) | rejects
// 1 precondition | 3 entries, empty query | all three #welcome-library-grid cards visible, #welcome-library-empty hidden | a filter that starts narrowed or shows the empty state up front
// 2 Tab + focus | library screen after entry | Tab presses (no clicks) focus the "Search diagrams" searchbox; it matches :focus-visible with a ≥2px non-none outline | a mouse-only field, or one whose focus ring is suppressed
// 3 title, case-insensitive | "GARAGE" | visible card titles exactly [Garage opener] | case-sensitive or title-blind matching
// 4 owner | "payments" | exactly [Second story] | matching only titles
// 5 service name | "ledger writer" (node title in first's spec, not on any card) | exactly [First story] with zero .spec.json requests | matching only visible card text, or fetching every spec to search
// 5b diagram ID | "THIRD" (third's ID; its title, owner and services do not contain it) | exactly [Garage opener] | matching only displayed fields
// (no kind row: every registry-published entry is kind "canonical", so the badge cannot discriminate and is not matched)
// 6 no matches | "zzqx" | zero visible cards and #welcome-library-empty visible naming the query | a blank grid with no explanation
// 7 clear | empty query | all three cards back, empty state hidden | a filter that cannot be undone
async function searchFixture(server){
  const fixture=await publish(server),root=fixture.root;
  fixture.specs.first.page.blocks[0].diagram.nodes.b.title='Ledger Writer';
  await writeFile(path.join(root,'diagrams/first/first.spec.json'),JSON.stringify(fixture.specs.first));
  const third=editorSpec();third.page.title='Garage opener';
  delete third.page.canon;delete third.page.blocks[0].diagram.layouts;delete third.page.blocks[0].diagram.defaultLayout;
  await mkdir(path.join(root,'diagrams/third'),{recursive:true});
  await writeFile(path.join(root,'diagrams/third/third.spec.json'),JSON.stringify(third));await writeFile(path.join(root,'diagrams/third/third.html'),'<!doctype html>');
  await writeFile(path.join(root,'canon.json'),JSON.stringify({version:1,diagrams:[
    {folder:'diagrams/first',owner:'group:default/home'},{folder:'diagrams/second',owner:'group:default/payments'},{folder:'diagrams/third',owner:'group:default/home'}]}));
  await publishLibrary({registryPath:path.join(root,'canon.json'),output:path.join(root,'workbench/diagrams.json')});
  return fixture;
}
const visibleLibraryTitles=page=>page.locator('#welcome-library-grid .canon-library-card').evaluateAll(cards=>cards.filter(card=>card.checkVisibility()).map(card=>card.querySelector('strong').textContent));

test('Browse diagrams filters published cards by title, ID, owner and service name with an explicit no-matches state',async({page,server})=>{
  const fixture=await searchFixture(server),requests=[];
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const empty=page.locator('#welcome-library-empty');
  await expect(page.locator('#welcome-library-grid .canon-library-card')).toHaveCount(3);
  expect(await visibleLibraryTitles(page)).toEqual(['First story','Second story','Garage opener']);await expect(empty).toBeHidden();
  const search=page.getByRole('searchbox',{name:'Search diagrams'});
  for(let presses=0;presses<12 && !await page.evaluate(()=>document.activeElement?.type==='search');presses++)await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  const ring=await search.evaluate(input=>{const style=getComputedStyle(input);return {visible:input.matches(':focus-visible'),style:style.outlineStyle,width:parseFloat(style.outlineWidth)};});
  expect(ring.visible).toBe(true);expect(ring.style).not.toBe('none');expect(ring.width).toBeGreaterThanOrEqual(2);
  const query=async text=>{await search.fill('');await search.pressSequentially(text);};
  await query('GARAGE');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['Garage opener']);await expect(empty).toBeHidden();
  await query('payments');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['Second story']);
  await query('ledger writer');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['First story']);
  await query('THIRD');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['Garage opener']);
  await query('zzqx');await expect.poll(()=>visibleLibraryTitles(page)).toEqual([]);
  await expect(empty).toBeVisible();await expect(empty).toContainText('No diagrams match');await expect(empty).toContainText('zzqx');
  await search.fill('');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['First story','Second story','Garage opener']);await expect(empty).toBeHidden();
  expect(requests).toEqual([]);
});

// #583 — published description and tags on library cards, matched by Search diagrams.
// Fixture: First story has a description and two tags, Second story one tag and
// no description; none of these words appears in a title, ID, owner or service.
// row | fixture | assertion (scoped) | rejects
// 1 precondition | empty query | both cards visible | a filter that starts narrowed
// 2 description shown | First story card | its own .canon-library-description text equals the authored description | description missing or rendered on another card
// 3 tag chips shown | each card | its own .canon-library-tag chip texts equal its authored tags, in order; Second story has no description element | chips missing, merged into one string, or leaking across cards
// 4 search by description | "CHIME" typed into Search diagrams | exactly [First story] | search ignoring descriptions or case-sensitive matching
// 5 search by tag | "billing" | exactly [Second story] | search ignoring tags
// 6 no spec fetches | whole test | zero .spec.json requests | fetching specs to search or render cards
async function describedFixture(server){
  const fixture=await publish(server);
  Object.assign(fixture.specs.first.page,{description:'Rings the hallway chime when a visitor arrives',tags:['hallway','alerts']});
  Object.assign(fixture.specs.second.page,{tags:['billing']});
  for(const id of ['first','second'])await writeFile(path.join(fixture.root,'diagrams',id,id+'.spec.json'),JSON.stringify(fixture.specs[id]));
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  return fixture;
}

test('Browse diagrams cards show the published description and tag chips, and search matches both',async({page,server})=>{
  const fixture=await describedFixture(server),requests=[];
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const cards=page.locator('#welcome-library-grid .canon-library-card');await expect(cards).toHaveCount(2);
  expect(await visibleLibraryTitles(page)).toEqual(['First story','Second story']);
  const card=title=>cards.filter({has:page.locator('strong',{hasText:new RegExp('^'+title+'$')})});
  await expect(card('First story').locator('.canon-library-description')).toHaveText('Rings the hallway chime when a visitor arrives');
  await expect(card('First story').locator('.canon-library-tag')).toHaveText(['hallway','alerts']);
  await expect(card('Second story').locator('.canon-library-description')).toHaveCount(0);
  await expect(card('Second story').locator('.canon-library-tag')).toHaveText(['billing']);
  const search=page.getByRole('searchbox',{name:'Search diagrams'});
  const query=async text=>{await search.fill('');await search.pressSequentially(text);};
  await query('CHIME');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['First story']);
  await query('billing');await expect.poll(()=>visibleLibraryTitles(page)).toEqual(['Second story']);
  expect(requests).toEqual([]);
});

async function explorationFixture(server){
  const fixture=await publish(server),definitions=[
    ['first','Order to doorstep','Follow an order from checkout through payment, fulfillment and delivery.',['commerce','onboarding'],'group:default/commerce-platform'],
    ['second','When a payment needs another try','How a declined charge is retried safely without charging a customer twice.',['commerce','resilience'],'group:default/payments'],
    ['third','A quieter home','Doorbell activity, visitor alerts and the household view.',['connected-home'],'group:default/home-experience'],
    ['fourth','Events find their way','From event intake to durable storage, subscriptions and downstream consumers.',['platform','resilience'],'group:europe/platform'],
    ['fifth','Signing in across services','How a session is created and verified across product boundaries.',['security','onboarding'],'group:default/identity-and-access-management'],
    ['sixth','Inventory, without surprises','Stock reservations and the path back when an item is unavailable.',['commerce','resilience'],'group:default/commerce-platform'],
    ['seventh','From signal to response','How an operational signal reaches the right responders.',['operations'],'group:default/platform'],
    ['eighth','Analytics pipeline',null,['platform'],'group:default/data-platform'],
  ];
  for(const [i,[id,title,description,tags]] of definitions.entries()){
    const spec=editorSpec();spec.page.title=title;if(description)spec.page.description=description;spec.page.tags=tags;
    const d=spec.page.blocks[0].diagram;delete d.layouts;delete d.defaultLayout;d.primaryPanel=undefined;
    const names=[['Checkout','Payments','Fulfillment'],['Payment API','Risk review','Ledger'],['Doorbell','Home hub','App'],['Event intake','Stream','Consumers'],['Sign in','Identity API','Session store'],['Reservation','Inventory API','Warehouse'],['Signal','Routing','On-call'],['Events','Warehouse','Reports']][i];
    Object.values(d.nodes).forEach((node,j)=>node.title=names[j]);d.rows=i%2?[['a'],['b','c']]:[['a','b','c']];d.edges=[{from:'a',to:'b',kind:'https'},{from:'b',to:'c',kind:'https'}];
    if(id==='third')spec.page.blocks[0].diagram=JSON.parse(await readFile(new URL('../../../examples/kestrel-overnight/story.spec.json',import.meta.url),'utf8')).page.blocks[0].diagram;
    const folder=path.join(fixture.root,'diagrams',id);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,id+'.spec.json'),JSON.stringify(spec));await writeFile(path.join(folder,id+'.html'),'<!doctype html>');fixture.specs[id]=spec;
  }
  await writeFile(path.join(fixture.root,'canon.json'),JSON.stringify({version:1,diagrams:definitions.map(([id,,,,owner])=>({folder:'diagrams/'+id,owner}))}));
  fixture.index=await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json'),thumbnails:true});
  // This fixture preserves compatibility with indexes published before service summaries.
  fixture.index.diagrams.forEach(entry=>delete entry.boundServices);
  await writeFile(path.join(fixture.root,'workbench/diagrams.json'),JSON.stringify(fixture.index));return fixture;
}
const mainLibrary=page=>page.locator('#welcome-library-grid');
const recentIDs=page=>page.locator('#welcome-library-recent-items a').evaluateAll(links=>links.map(link=>new URL(link.href).searchParams.get('diagram')));

test('Browse exploration combines facets, keyboard topics and search; grid/list and reader return retain context',async({page,server},testInfo)=>{
  const fixture=await explorationFixture(server),requests=[];
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.setViewportSize({width:1440,height:900});await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const grid=mainLibrary(page),search=page.getByRole('searchbox',{name:'Search diagrams'}),count=page.locator('#welcome-library-count');
  await expect(grid.locator('.canon-library-card')).toHaveCount(8);await expect(count).toHaveText('8 of 8 diagrams');
  await expect(grid.locator('.canon-library-preview img')).toHaveCount(8);
  for(const img of await grid.locator('.canon-library-preview img').all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBe(960);}await page.evaluate(()=>window.scrollTo(0,0));
  await expect(page.getByLabel('Team',{exact:true}).locator('option')).toContainText(['All teams','Commerce Platform','Data Platform','Home Experience','Identity And Access Management','Payments','Platform','Platform · europe']);
  const width=await grid.locator('.canon-library-card').first().evaluate(el=>el.getBoundingClientRect().width);
  for(const size of [{width:1440,height:900},{width:1280,height:800}]){await page.setViewportSize(size);await testInfo.attach('browse-grid-'+size.width,{body:await page.screenshot(),contentType:'image/png'});}
  await page.setViewportSize({width:1440,height:900});
  await page.getByLabel('Team',{exact:true}).selectOption('group:default/commerce-platform');await expect(count).toHaveText('2 of 8 diagrams');
  await page.getByLabel('Topic',{exact:true}).selectOption('commerce');await search.fill('FULFILLMENT');await expect(count).toHaveText('1 of 8 diagrams');
  await page.getByLabel('Service',{exact:true}).selectOption('Checkout');await expect(count).toHaveText('1 of 8 diagrams');
  expect(await grid.locator('.canon-library-card:visible').evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
  await page.getByLabel('Service',{exact:true}).selectOption('Ledger');await expect(count).toHaveText('0 of 8 diagrams');await expect(page.locator('#welcome-library-empty')).toContainText('FULFILLMENT');
  await page.getByRole('button',{name:'Remove service filter: Ledger',exact:true}).click();await expect(count).toHaveText('1 of 8 diagrams');
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await expect(count).toHaveText('8 of 8 diagrams');
  const chip=grid.locator('.canon-library-card').first().getByRole('button',{name:'Filter by topic: commerce',exact:true});await chip.focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Topic',{exact:true})).toHaveValue('commerce');
  const order=await visibleLibraryTitles(page);expect(order).toEqual(['Order to doorstep','When a payment needs another try','Inventory, without surprises']);
  await page.getByRole('button',{name:'List',exact:true}).click();await expect(page.getByRole('button',{name:'List',exact:true})).toHaveAttribute('aria-pressed','true');expect(await visibleLibraryTitles(page)).toEqual(order);
  const heights=await grid.locator('.canon-library-card:visible').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().height));expect(Math.max(...heights)).toBeLessThan(160);
  await testInfo.attach('browse-list-filtered',{body:await page.screenshot(),contentType:'image/png'});
  expect(requests).toEqual([]);await expect(grid.locator('a button,button a')).toHaveCount(0);
  const target=grid.getByRole('link',{name:'Order to doorstep',exact:true});await expect(target).toHaveAttribute('href',fixture.url+'?diagram=first');
  await target.click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.goBack();
  await expect(page.getByLabel('Topic',{exact:true})).toHaveValue('commerce');await expect(page.getByRole('button',{name:'List',exact:true})).toHaveAttribute('aria-pressed','true');expect(await visibleLibraryTitles(page)).toEqual(order);
  await target.click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('.canon-reader-toolbar [data-welcome-back]').click();
  await expect(count).toHaveText('3 of 8 diagrams');expect(await recentIDs(page)).toEqual(['first']);
});

test('recently viewed records successful published reads, bounds and deduplicates history, prunes removals and clears locally',async({page,server})=>{
  const fixture=await explorationFixture(server),key='flowview-library-recent-v1:'+new URL('diagrams.json',fixture.url).href;
  const otherKey='flowview-library-recent-v1:'+server.origin+'/other/workbench/diagrams.json';
  await page.addInitScript(key=>localStorage.setItem(key,JSON.stringify(['second'])),otherKey);
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  await expect(page.locator('#welcome-library-recent')).toBeHidden();
  for(const id of ['first','second','fourth','fifth','sixth','seventh','eighth','first']){
    await mainLibrary(page).locator('article[data-id="'+id+'"] a').click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.goBack();await expect(mainLibrary(page)).toBeVisible();
  }
  expect(await recentIDs(page)).toEqual(['first','eighth','seventh','sixth','fifth','fourth']);
  await page.reload();await expect(mainLibrary(page)).toBeVisible();expect(await recentIDs(page)).toEqual(['first','eighth','seventh','sixth','fifth','fourth']);
  // A successful HTTP response with invalid source/revision is still a failed read.
  await page.route('**/third.spec.json',route=>route.fulfill({json:{page:{}}}));
  await mainLibrary(page).locator('article[data-id="third"] a').click();await expect(page.locator('#canon-reader-error')).toBeVisible();await page.goBack();
  expect(await recentIDs(page)).toEqual(['first','eighth','seventh','sixth','fifth','fourth']);
  const revised={...fixture.index,diagrams:fixture.index.diagrams.filter(entry=>entry.id!=='eighth')};await writeFile(path.join(fixture.root,'workbench/diagrams.json'),JSON.stringify(revised));
  await page.reload();await expect(mainLibrary(page).locator('article')).toHaveCount(7);expect(await recentIDs(page)).toEqual(['first','seventh','sixth','fifth','fourth']);
  await page.getByRole('searchbox',{name:'Search diagrams'}).fill('IDENTITY');expect(await recentIDs(page)).toEqual(['fifth']);await expect(page.locator('#welcome-library-count')).toHaveText('1 of 7 diagrams');
  await page.getByRole('button',{name:'Clear history',exact:true}).click();await expect(page.locator('#welcome-library-recent')).toBeHidden();expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();expect(await page.evaluate(key=>localStorage.getItem(key),otherKey)).toBe('["second"]');
});

test('Browse handles malformed previews and corrupt or unavailable history storage without eager reads or script injection',async({page,server,audit})=>{
  audit.allowStatus(404,url=>url.includes('/library-thumbnails/'));
  const fixture=await explorationFixture(server),key='flowview-library-recent-v1:'+new URL('diagrams.json',fixture.url).href;
  fixture.index.diagrams[0].preview={...fixture.index.diagrams[0].preview,url:'https://evil.test/image.png'};
  fixture.index.diagrams[1].preview.url='library-thumbnails/'+'a'.repeat(64)+'/'+'b'.repeat(64)+'.png';
  delete fixture.index.diagrams[2].preview;
  await writeFile(path.join(fixture.root,'workbench/diagrams.json'),JSON.stringify(fixture.index));
  const requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.addInitScript(key=>{try{localStorage.setItem(key,'{broken');}catch{}},key);await page.goto(fixture.url);await page.locator('#welcome-library').click();
  await expect(mainLibrary(page).locator('article[data-id="first"] .canon-library-preview')).toContainText('Preview unavailable');await expect(mainLibrary(page).locator('article[data-id="second"] .canon-library-preview')).toContainText('Preview unavailable');await expect(mainLibrary(page).locator('article[data-id="third"] .canon-library-preview')).toContainText('Preview unavailable');await expect(mainLibrary(page).locator('script')).toHaveCount(0);await expect(mainLibrary(page).locator('img')).toHaveCount(5);expect(requests).toEqual([]);
  await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;Storage.prototype.getItem=function(key){if(key.startsWith('flowview-library-recent'))throw Error('blocked');return get.call(this,key);};Storage.prototype.setItem=function(key,value){if(key.startsWith('flowview-library-recent'))throw Error('blocked');return set.call(this,key,value);};Storage.prototype.removeItem=function(key){if(key.startsWith('flowview-library-recent'))throw Error('blocked');return remove.call(this,key);};});
  await page.reload();await expect(mainLibrary(page).locator('article')).toHaveCount(8);await mainLibrary(page).locator('article[data-id="first"] a').click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.goBack();expect(await recentIDs(page)).toEqual(['first']);
  await page.getByRole('button',{name:'Clear history',exact:true}).click();await expect(page.locator('#welcome-library-recent')).toBeHidden();
});

async function serviceRowsFixture(server){
  const fixture=await publish(server),first=fixture.specs.first,second=fixture.specs.second;
  first.page.title='Order to doorstep';first.page.description='Checkout coordinates payment, inventory, fulfillment and delivery.';first.page.tags=['commerce'];
  const d=first.page.blocks[0].diagram;d.nodes.a.title='Checkout';d.nodes.a.binding={entityRef:'component:default/checkout',label:'Checkout'};
  d.nodes.b.title='Payment API';d.nodes.b.binding={entityRef:'component:default/payment',label:'Payment API'};
  d.nodes.c.title='Unbound warehouse';
  for(const [id,label] of [['inventory','Inventory'],['fulfillment','Fulfillment'],['shipping','Shipping'],['notifications','Notifications'],['analytics','Analytics'],['fraud','Fraud review']])d.nodes[id]={title:label,binding:{entityRef:'component:default/'+id,label}};
  d.rows=[['a'],['b','c','inventory','fulfillment'],['shipping','notifications','analytics','fraud']];
  d.edges=Object.keys(d.nodes).filter(id=>id!=='a').map(to=>({from:'a',to,kind:'https'}));
  second.page.title='Regional payments';second.page.tags=['commerce'];second.page.blocks[0].diagram.nodes.a.binding={entityRef:'component:europe/payment',label:'Payment API'};
  const third=structuredClone(fixture.specs.second);third.page.title='An untagged diagram';delete third.page.blocks[0].diagram.nodes.a.binding;fixture.specs.third=third;
  for(const [id,spec] of Object.entries(fixture.specs)){const folder=path.join(fixture.root,'diagrams',id);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,id+'.spec.json'),JSON.stringify(spec));}
  await writeFile(path.join(fixture.root,'canon.json'),JSON.stringify({version:1,diagrams:Object.keys(fixture.specs).map(id=>({folder:'diagrams/'+id,owner:'group:default/commerce'}))}));
  fixture.index=await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json'),thumbnails:true});return fixture;
}

test('Backstage service rows rank and clip one line, reveal all on hover/focus and filter exact identities without source reads',async({page,server},testInfo)=>{
  test.setTimeout(90000);
  const fixture=await serviceRowsFixture(server),requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.setViewportSize({width:1440,height:1000});await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const first=mainLibrary(page).locator('[data-id="first"]'),second=mainLibrary(page).locator('[data-id="second"]'),third=mainLibrary(page).locator('[data-id="third"]');
  const row=first.locator('.canon-library-services'),strip=row.locator('.canon-library-services-strip'),popup=row.locator('.canon-library-services-popup'),trigger=row.locator('.canon-library-services-label');
  await expect(third.locator('.canon-library-services')).toHaveCount(0);await expect(row).toHaveClass(/has-overflow/);
  await expect(strip.locator('button').first()).toHaveText('Checkout');
  await expect(page.getByLabel('Service',{exact:true}).locator('option').filter({hasText:/^Checkout$/})).toHaveCount(1);
  await expect(page.getByLabel('Service',{exact:true}).locator('option[value="Checkout"],option[value="Unbound warehouse"]')).toHaveCount(0);
  const geometry=await strip.locator('button').evaluateAll(buttons=>buttons.map(button=>({top:button.offsetTop,tabIndex:button.tabIndex,hidden:button.getAttribute('aria-hidden'),visible:getComputedStyle(button).visibility})));
  expect(new Set(geometry.map(button=>button.top)).size).toBe(1);expect(geometry.some(button=>button.hidden==='true' && button.tabIndex===-1 && button.visible==='hidden')).toBe(true);
  await expect(popup).toBeHidden();
  if(process.env.FLOWVIEW_SERVICE_EVIDENCE){await mkdir(process.env.FLOWVIEW_SERVICE_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.FLOWVIEW_SERVICE_EVIDENCE,'services-collapsed-1440.png')});await writeFile(path.join(process.env.FLOWVIEW_SERVICE_EVIDENCE,'launch-url.txt'),fixture.url+'\n');await cp(fixture.root,path.join(process.env.FLOWVIEW_SERVICE_EVIDENCE,'company'),{recursive:true});}
  await trigger.hover();await expect(popup).toBeVisible();await expect(popup.locator('button')).toHaveCount(8);
  const hidden=popup.locator('[data-service="component:default/shipping"]');await hidden.hover();await expect(popup).toBeVisible();
  if(process.env.FLOWVIEW_SERVICE_EVIDENCE)await page.screenshot({path:path.join(process.env.FLOWVIEW_SERVICE_EVIDENCE,'services-expanded-1440.png')});
  await hidden.click();await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:component:default/shipping');await expect(first).toBeVisible();await expect(second).toBeHidden();await expect(page).toHaveURL(fixture.url);
  // Selecting the already selected chip keeps the filter set.
  await trigger.click();await expect(popup).toBeVisible();await hidden.click();await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:component:default/shipping');
  await page.locator('#welcome-library-clear').click();await page.getByLabel('Topic',{exact:true}).selectOption('commerce');
  await trigger.focus();await expect(popup).toBeVisible();await page.keyboard.press('Escape');await expect(popup).toBeHidden();await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');await expect(popup).toBeHidden(); // Escape does not immediately reopen through focus.
  await page.getByLabel('Service',{exact:true}).focus();await trigger.focus();await expect(popup).toBeVisible();
  const precise=popup.locator('[data-service="component:default/payment"]');
  for(let i=0;i<20 && !await precise.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');
  await expect(precise).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:component:default/payment');await expect(page.getByLabel('Topic',{exact:true})).toHaveValue('commerce');await expect(first).toBeVisible();await expect(second).toBeHidden();
  await page.locator('#welcome-library-clear').click();await page.setViewportSize({width:1140,height:900});
  await expect.poll(()=>strip.locator('button[tabindex="0"]').count()).toBeLessThan(geometry.filter(button=>button.tabIndex===0).length);
  await page.setViewportSize({width:1280,height:900});
  if(process.env.FLOWVIEW_SERVICE_EVIDENCE){await page.mouse.move(0,0);await page.screenshot({path:path.join(process.env.FLOWVIEW_SERVICE_EVIDENCE,'services-collapsed-1280.png')});}
  await page.getByRole('button',{name:'List',exact:true}).click();
  await expect(mainLibrary(page)).toHaveClass(/canon-library-list/);await expect(row).toHaveClass(/has-overflow/);
  await expect(row).toHaveClass(/has-overflow/);await trigger.hover();await expect(popup).toBeVisible();
  if(process.env.FLOWVIEW_SERVICE_EVIDENCE)await page.screenshot({path:path.join(process.env.FLOWVIEW_SERVICE_EVIDENCE,'services-expanded-list-1280.png')});
  await hidden.click();await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:component:default/shipping');await expect(second).toBeHidden();
  await page.locator('#welcome-library-clear').click();await page.getByRole('button',{name:'Grid',exact:true}).click();
  // Filter from hidden back to visible, then resize the desktop grid again.
  await page.getByRole('searchbox',{name:'Search diagrams'}).fill('regional');await expect(first).toBeHidden();await page.getByRole('searchbox',{name:'Search diagrams'}).fill('');await expect(row).toHaveClass(/has-overflow/);
  await page.setViewportSize({width:1800,height:1000});
  await expect(second.locator('.canon-library-services')).not.toHaveClass(/has-overflow/);await expect(second.locator('.canon-library-services-strip button')).toHaveAttribute('tabindex','0');
  await second.locator('.canon-library-services-strip button').click();await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:component:europe/payment');await expect(first).toBeHidden();await expect(second).toBeVisible();
  await page.locator('#welcome-library-clear').click();await page.getByRole('searchbox',{name:'Search diagrams'}).fill('unbound warehouse');await expect(first).toBeVisible();
  expect(requests).toEqual([]);await expect(mainLibrary(page).locator('a button,button a')).toHaveCount(0);
  await testInfo.attach('services-final',{body:await page.screenshot(),contentType:'image/png'});
  await page.locator('#welcome-library-clear').click();await trigger.hover();await expect(popup).toBeVisible();
  await first.locator('.canon-library-preview').click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await expect(popup).toBeHidden();
  await page.goBack();await expect(first).toBeVisible();await expect(popup).toBeHidden();await trigger.hover();await expect(popup).toBeVisible();
  await popup.locator('[data-service="component:default/shipping"]').click();await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:component:default/shipping');
  expect(requests).toEqual([fixture.specURL('first')]);

});

test('older service title filters and malformed optional summaries remain usable without loading specs',async({page,server})=>{
  const fixture=await publish(server),requests=[];
  delete fixture.index.diagrams[0].boundServices;
  fixture.index.diagrams[0].services=['Legacy service','Real API','entity:component:default/api'];
  fixture.index.diagrams[1].boundServices=[null,{entityRef:'invalid',label:'Invalid',edgeCount:4},{entityRef:'component:default/api',label:'Real API',edgeCount:1}];
  await writeFile(path.join(fixture.root,'workbench/diagrams.json'),JSON.stringify(fixture.index));
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const first=mainLibrary(page).locator('[data-id="first"]'),second=mainLibrary(page).locator('[data-id="second"]');
  await expect(first.locator('.canon-library-services')).toHaveCount(0);await expect(second.locator('.canon-library-services-strip button')).toHaveText(['Real API']);
  await expect(page.getByLabel('Service',{exact:true}).locator('option[value="Real API"]')).toHaveText('Real API (node title)');
  await expect(page.getByLabel('Service',{exact:true}).locator('option').filter({hasText:/^Real API$/})).toHaveCount(1);
  await page.getByLabel('Service',{exact:true}).selectOption('Legacy service');await expect(first).toBeVisible();await expect(second).toBeHidden();
  await page.getByLabel('Service',{exact:true}).selectOption('entity:component:default/api');await expect(first).toBeVisible();await expect(second).toBeHidden();
  await page.locator('#welcome-library-clear').click();await second.locator('.canon-library-services-strip button').click();
  await expect(first).toBeHidden();await expect(second).toBeVisible();await expect(page.getByLabel('Service',{exact:true})).toHaveValue('entity:entity:component:default/api');
  await expect(page).toHaveURL(fixture.url);expect(requests).toEqual([]);
});

test('all-invalid service summaries retain legacy facets while valid empty summaries only allow keyword search',async({page,server})=>{
  const fixture=await publish(server),requests=[];
  fixture.index.diagrams[0].services=['Legacy service'];
  fixture.index.diagrams[0].boundServices=[null,{entityRef:'invalid',edgeCount:1}];
  fixture.index.diagrams[1].services=['Legacy service','Empty-only title'];
  fixture.index.diagrams[1].boundServices=[];
  await writeFile(path.join(fixture.root,'workbench/diagrams.json'),JSON.stringify(fixture.index));
  page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const first=mainLibrary(page).locator('[data-id="first"]'),second=mainLibrary(page).locator('[data-id="second"]');
  await expect(mainLibrary(page).locator('.canon-library-services')).toHaveCount(0);
  await expect(page.getByLabel('Service',{exact:true}).locator('option')).toHaveText(['All services','Legacy service']);
  await page.getByLabel('Service',{exact:true}).selectOption('Legacy service');await expect(first).toBeVisible();await expect(second).toBeHidden();
  await page.locator('#welcome-library-clear').click();await page.getByRole('searchbox',{name:'Search diagrams'}).fill('Empty-only title');
  await expect(first).toBeHidden();await expect(second).toBeVisible();
  await expect(page).toHaveURL(fixture.url);expect(requests).toEqual([]);
});

// Content search reads only the published index, including inactive tabs and
// playback patches. Metadata and facets remain independent of content matches.
test('Browse diagrams searches published content across tabs and panels with facets and no spec fetches',async({page,server})=>{
  const fixture=await describedFixture(server);
  const first=fixture.specs.first.page.blocks[0],second=fixture.specs.second.page.blocks[0];
  first.text=['An amber retry envelope awaits acknowledgement.'];
  first.diagram.nodes.a.sub='Quiescent transmitter';first.diagram.edges[0].label='Resend receipt';
  first.diagram.steps[0].text='Confirm the amber retry envelope';
  first.diagram.panels.push({id:'monitor',type:'security',site:'Juniper observatory',videoLabel:'Northern entrance feed',sensors:[{id:'entry',kind:'door',label:'Vestibule contact',zone:'Western annex'}],initial:{video:'unavailable',videoReason:'Lens obscured by snowfall',audio:{output:'speech',text:'Identify the visitor'}}});
  first.diagram.steps[0].panels={monitor:{entry:{health:'online',alarm:'triggered',detail:'Entry opened after dusk'},enterOnce:{audio:{output:'speech',text:'Please wait in the vestibule'}}}};
  second.text=['An amber retry envelope reaches the ledger.'];
  fixture.specs.first.page.blocks.push({tabs:[{label:'Deferred recovery',sections:[{heading:'Recovery notes',bullets:[{text:'Recovery checklist',sub:['Escalate to the custodian']}],diagram:{nodes:{a:{title:'Recovery worker'}},rows:[['a']],edges:[],panels:[{id:'audit',type:'log',title:'Audit trail'}],steps:[{nodes:['a'],text:'Write audit',panels:{audit:{log:[{text:'Custodian approved the retry'}]}}}]}}]}]});
  for(const id of ['first','second'])await writeFile(path.join(fixture.root,'diagrams',id,id+'.spec.json'),JSON.stringify(fixture.specs[id]));
  const index=await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  for(const entry of index.diagrams){const {contentText,...metadata}=entry;expect(JSON.stringify(metadata).toLowerCase()).not.toContain('amber retry envelope');}
  const requests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))requests.push(request.url());});
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  const search=page.getByRole('searchbox',{name:'Search diagrams'}),count=page.locator('#welcome-library-count');
  await expect(count).toHaveText('2 of 2 diagrams');
  await search.fill('AMBER RETRY ENVELOPE');await expect(count).toHaveText('2 of 2 diagrams');
  await page.getByLabel('Topic',{exact:true}).selectOption('hallway');await expect(count).toHaveText('1 of 2 diagrams');expect(await visibleLibraryTitles(page)).toEqual(['First story']);
  await page.getByLabel('Topic',{exact:true}).selectOption('billing');await expect(count).toHaveText('1 of 2 diagrams');expect(await visibleLibraryTitles(page)).toEqual(['Second story']);
  await page.locator('#welcome-library-clear').click();
  for(const query of ['quiescent transmitter','resend receipt','deferred recovery','escalate to the custodian','CUSTODIAN APPROVED THE RETRY','Juniper observatory','Northern entrance feed','Western annex','Identify the visitor','Entry opened after dusk','Please wait in the vestibule']){
    await search.fill(query);await expect(count).toHaveText('1 of 2 diagrams');expect(await visibleLibraryTitles(page)).toEqual(['First story']);
  }
  await page.getByLabel('Topic',{exact:true}).selectOption('billing');await expect(count).toHaveText('0 of 2 diagrams');
  await page.locator('#welcome-library-clear').click();await expect(count).toHaveText('2 of 2 diagrams');
  expect(requests).toEqual([]);
});


test('reference picker combines same-section exports with crossing connections and exact Undo',async({page,server},info)=>{
  await pickerFixture(page,server,provider=>{
    provider.page.sections[0].diagram.topologyExports={dispatch:{nodes:['dispatch'],edges:[]},channels:{nodes:['push','email','sms'],edges:[]}};
  });
  const before=await page.locator('#src').inputValue();await openTopology(page);await expect(page.locator('#topology-add')).toBeEnabled();
  await page.locator('#topology-export').selectOption(['dispatch','channels']);
  await expect(page.locator('#topology-nodes input')).toHaveCount(4);await expect(page.locator('#topology-edges input')).toHaveCount(3);
  await page.locator('#topology-namespace').fill('merged');await page.screenshot({path:info.outputPath('merged-export-picker.png')});
  await page.locator('#topology-add').click();
  const after=await page.locator('#src').inputValue(),imp=JSON.parse(after).page.blocks[0].diagram.topologyImports[0];
  expect(imp).toEqual({spec:'first',export:['dispatch','channels'],as:'merged'});
  await expect(page.locator('#docview g.node[data-dv-node="merged::dispatch"]')).toHaveCount(1);
  await expect(page.locator('#docview path.edge')).toHaveCount(4);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await page.reload();await expect(page.locator('#src')).toHaveValue(after);await expect(page.locator('#docview path.edge')).toHaveCount(4);
});
