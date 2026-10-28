import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {test,expect,closeTools} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

test.beforeEach(useProjectDownloads);
const diagram=raw=>raw.page.sections[0].diagram;
const source=page=>page.locator('#src').inputValue();
const node=(page,id='canon::api')=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
const pr='https://github.com/acme/api/pull/2';
async function fixture(page,server){
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'canon'}],panels:[{id:'status',type:'live-status',title:'Delivery status'}],steps:[{id:'persist',edge:'canon::api->canon::store',text:'Persist'}],autoplay:false});
  consumer.page.tracking={jira:{site:'https://acme.atlassian.net'},dependencies:[{ticket:'API-2',on:'CAN-1'}]};
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(node(page)).toBeVisible();await closeTools(page);return {provider,consumer};
}
async function select(page,kind){
  await closeTools(page);
  if(kind==='node')await node(page).click();else await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');
  await page.locator('#editor-tab-inspect').click();
}
async function history(page,before){
  const after=await source(page);expect(after).not.toBe(before);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);return after;
}
async function add(page,kind,label,value){
  await select(page,kind);const before=await source(page),input=page.getByRole('textbox',{name:label,exact:true});
  await input.fill(value);await input.press('Enter');
  await expect.poll(()=>source(page)).not.toBe(before);await history(page,before);
}

test('desktop imported node and edge tracking edits, history, export and reload feed a live board',async({page,server},info)=>{
  const {provider}=await fixture(page,server);
  await select(page,'node');await expect(page.locator('#guide')).toContainText('Inherited tracking (read only): CAN-1');
  await expect(page.getByRole('button',{name:'Remove ticket 1',exact:true})).toHaveCount(0);
  const original=await source(page);
  for(const value of ['bad-key','CAN-1']){
    const input=page.getByRole('textbox',{name:'Add ticket',exact:true});await input.fill(value);await input.press('Enter');await expect(page.locator('#src')).toHaveValue(original);
  }
  await add(page,'node','Add ticket','API-2');await add(page,'node','Add PR',pr);
  await add(page,'edge','Add ticket','API-2');await add(page,'edge','Add PR',pr);
  for(const kind of ['node','edge'])for(const label of ['ticket','PR']){
    await select(page,kind);const before=await source(page);await page.getByRole('button',{name:'Remove '+label+' 1',exact:true}).click();await history(page,before);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  }
  const authored=JSON.parse(await source(page)),imp=diagram(authored).topologyImports[0];
  expect(imp.nodeTracking).toEqual({api:{tickets:['API-2'],prs:[pr]}});expect(imp.edgeTracking).toEqual({'api->store':{tickets:['API-2'],prs:[pr]}});
  expect(diagram(authored).nodes).toEqual({});expect(diagram(authored).edges).toBeUndefined();
  await closeTools(page);await page.getByLabel('Demo live status',{exact:true}).check();
  await expect(node(page)).toHaveClass(/dv-live-active/);await expect(page.locator('#docview path.edge')).toHaveClass(/dv-live-todo/);
  await expect(page.locator('#docview .pt-live-status tr[data-live-ticket]')).toHaveCount(2);
  await page.screenshot({path:info.outputPath('imported-tracking-editor.png')});
  // Export keeps authoring imports; HTML freezes the effective provider closure.
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))],html=files[Object.keys(files).find(n=>n.endsWith('.html'))];
  expect(diagram(JSON.parse(json))).toEqual(diagram(authored));expect(JSON.parse(json).page.tracking).toEqual(authored.page.tracking);expect(json).not.toContain('topologyProvenance');expect(json).not.toContain('"canon::api":');
  diagram(provider).nodes.api.tickets=['CAN-99'];
  await page.locator('#file-input').setInputFiles({name:'saved.spec.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.reload();await expect(page.locator('#src')).toHaveValue(json);await select(page,'node');await expect(page.locator('#guide')).toContainText('Inherited tracking (read only): CAN-1');
  await writeFile(path.join(server.root,'imported-tracking.html'),html);
  await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>{
    window.__importedRefs=refs;return {'CAN-1':{state:'blocked'},'API-2':{state:'todo'}};
  }};});
  await page.goto(server.origin+'/imported-tracking.html');
  await expect.poll(()=>page.evaluate(()=>window.__importedRefs)).toMatchObject({tickets:['CAN-1','API-2'],prs:[pr]});
  const root=page.locator('#docview'),panel=root.locator('.pt-live-status'),edge=root.locator('path.edge[data-dv-edge="0"]');
  await expect(node(page)).toHaveClass(/dv-live-blocked/);await expect(edge).toHaveClass(/dv-live-todo/);await expect(edge).toHaveClass(/dv-live-waiting/);
  await expect(root.locator('g.coin[data-dv-step="0"]')).toHaveClass(/dv-live-blocked/);
  await expect(panel.locator('tr[data-live-ticket]')).toHaveCount(2);await expect(panel.locator('[data-live-count="todo"]')).toContainText('1');
  await expect(panel.locator('.dv-live-epic-counts')).toContainText('1 blocked');
  const coverage=panel.locator('tr[data-live-coverage-for="API-2"]');await expect(coverage.getByRole('button')).toHaveText(['API','Persist']);
  await coverage.getByRole('button',{name:'API',exact:true}).click();await expect(node(page).locator('.card')).toBeFocused();
  await page.keyboard.press('Enter');await expect(root.locator('.dv-live-popover')).toContainText('API-2');await expect(root.locator('.dv-live-popover').getByRole('link',{name:pr,exact:true})).toHaveAttribute('href',pr);await page.keyboard.press('Escape');
  await coverage.getByRole('button',{name:'Persist',exact:true}).click();await expect(root.locator('text.lbl[data-dv-edge="0"]')).toBeFocused();await page.keyboard.press('Enter');
  await expect(root.locator('.dv-live-popover').getByRole('link',{name:'API-2',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/API-2');await expect(root.locator('.dv-live-popover')).toContainText(pr);await page.keyboard.press('Escape');
  await node(page).locator('.nrefs-trigger').click();await expect(root.locator('.node-link-menu')).toContainText('CAN-1');await expect(root.locator('.node-link-menu')).toContainText(pr);await page.keyboard.press('Escape');
  await page.screenshot({path:info.outputPath('imported-tracking-live-board.png')});
});

test('retired imported tracking controls cannot edit a changed source',async({page,server})=>{
  await fixture(page,server);await select(page,'edge');
  await page.getByRole('textbox',{name:'Add ticket',exact:true}).evaluate(el=>window.oldTracking=el);
  const raw=JSON.parse(await source(page));diagram(raw).topologyImports[0].export='missing';const changed=JSON.stringify(raw);
  await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));window.oldTracking.value='AA-1';window.oldTracking.dispatchEvent(new Event('change',{bubbles:true}));},changed);
  await expect(page.locator('#src')).toHaveValue(changed);await expect(page.locator('#undo-builder')).toBeDisabled();
});
