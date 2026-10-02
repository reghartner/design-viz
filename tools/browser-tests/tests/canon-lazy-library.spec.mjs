import {test,expect,pagePreview} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {publishLibrary} from '../../canon/library.mjs';

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
  return {root,specs,index,url:server.origin+'/company/workbench/flowspec.html',specURL:id=>server.origin+'/company/workbench/'+index.diagrams.find(entry=>entry.id===id).specUrl};
}
test.afterEach(async({server})=>{await rm(path.join(server.root,'company'),{recursive:true,force:true});});

test('a published topology consumer renders and its imported node inspector is read only',async({page,server})=>{
  const fixture=await publish(server);
  for(const [id,example] of [['first','platform'],['second','checkout']]){
    const spec=JSON.parse(await readFile(new URL('../../../examples/canon/topology/'+example+'.json',import.meta.url),'utf8'));
    if(id==='second')spec.page.sections[0].diagram.topologyImports[0].spec='first';
    await writeFile(path.join(fixture.root,'diagrams',id,id+'.spec.json'),JSON.stringify(spec));
  }
  await publishLibrary({registryPath:path.join(fixture.root,'canon.json'),output:path.join(fixture.root,'workbench/diagrams.json')});
  await page.goto(fixture.url+'?diagram=second');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  await expect(page.locator('#canon-reader [data-dv-node="platform::api"]')).toBeVisible();
  await page.locator('#canon-reader-edit').click();await pagePreview(page);
  await expect(page.locator('#workspace-provenance')).toContainText('Imported topology snapshot');
  await page.locator('#docview [data-dv-node="platform::api"]').click();
  await page.locator('#editor-tab-inspect').click();
  await expect(page.locator('#guide')).toContainText('Read-only topology from first / core');
  await expect(page.locator('#guide').getByLabel('title',{exact:true})).toHaveCount(0);
  const source=JSON.parse(await page.locator('#src').inputValue());
  expect(source.page.sections[0].diagram.steps[1].edge).toBe('platform::api->platform::store');
  expect(source.page.sections[0].diagram.topologyImports).toBeUndefined();
});

test('the real metadata index fetches only the opened spec and imports the same canonical content',async({page,server})=>{
  const fixture=await publish(server),requests=[];
  page.on('request',request=>{if(request.url().includes('/diagrams.json.specs/'))requests.push(request.url());});
  expect(fixture.index.version).toBe(2);expect(JSON.stringify(fixture.index)).not.toContain('rows');
  await page.goto(fixture.url);await page.locator('#welcome-library').click();
  await expect(page.locator('.canon-library-card')).toHaveCount(2);expect(requests).toEqual([]);
  await expect(page.locator('.canon-library-card').first()).toContainText('nodes');
  await page.getByRole('link',{name:/First story/}).click();await expect(page.locator('#canon-reader-title')).toHaveText('First story');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();expect(requests).toEqual([fixture.specURL('first')]);
  await page.goBack();await page.getByRole('link',{name:/Second story/}).click();await expect(page.locator('#canon-reader-title')).toHaveText('Second story');
  expect(requests).toEqual([fixture.specURL('first'),fixture.specURL('second')]);
  await page.goBack();await page.getByRole('link',{name:/First story/}).click();await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  expect(requests).toHaveLength(2);await page.locator('#canon-reader-edit').click();
  const expected=structuredClone(fixture.specs.first);expected.page.canon=fixture.index.diagrams[0].canon;
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(expected,null,2));await expect(page.locator('#undo-builder')).toBeDisabled();
  expect(JSON.parse(await readFile(path.join(fixture.root,'diagrams/first/first.spec.json'),'utf8'))).toEqual(fixture.specs.first);
});

test('a direct link beneath a deployment prefix loads one spec, reloads and preserves the saved draft',async({page,server})=>{
  const fixture=await publish(server),requests=[],draft=JSON.stringify({text:'unfinished draft {',at:1});
  await page.addInitScript(value=>localStorage.setItem('dv-workbench-draft',value),draft);
  page.on('request',request=>{if(request.url().includes('/diagrams.json.specs/'))requests.push(request.url());});
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
  await page.goto(fixture.url+'?diagram=first');await expect(page.locator('#canon-reader-error')).toContainText('Invalid diagram');
  await expect(page.locator('#canon-reader-edit')).toBeDisabled();await expect(page.locator('#canon-reader')).toBeEmpty();
  data=fixture.specs.first;await page.locator('#canon-reader-retry').click();await expect(page.locator('#canon-reader-title')).toHaveText('First story');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();
});
