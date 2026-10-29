import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {test,expect,closeTools,chooseNavigation} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';
import C from '../../canon/core.cjs';

test.beforeEach(useProjectDownloads);
const diagram=raw=>raw.page.sections[0].diagram;
const source=page=>page.locator('#src').inputValue();
const node=(page,id='canon::api')=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
const pr='https://github.com/acme/api/pull/2';
async function fixture(page,server,configure){
  await page.setViewportSize({width:1440,height:1000});
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'canon'}],panels:[{id:'status',type:'live-status',title:'Delivery status'}],steps:[{id:'persist',edge:'canon::api->canon::store',text:'Persist'}],autoplay:false});
  consumer.page.tracking={jira:{site:'https://acme.atlassian.net'},dependencies:[{ticket:'API-2',on:'CAN-1'}]};
  if(configure)configure(provider,consumer);
  const catalog={version:3,diagrams:[provider,consumer].map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
  await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
  for(const spec of [provider,consumer])await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'consumer.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(consumer,null,2))});
  await expect(node(page)).toBeVisible();await closeTools(page);return {provider,consumer};
}
async function select(page,kind,id='canon::api'){
  await closeTools(page);
  if(kind==='node')await node(page,id).click();else await page.locator('#docview path.edge[data-dv-edge="0"]').dispatchEvent('click');
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

test('live step highlighting dims imported and local nodes equally',async({page,server})=>{
  await fixture(page,server,(provider,consumer)=>{
    const d=diagram(consumer);
    d.nodes.local={title:'Local worker',tickets:['LOC-1']};
    d.rows=[['local']];
    d.steps=[{id:'imported',nodes:['canon::api'],text:'Imported work'},{id:'local',nodes:['local'],text:'Local work'}];
  });
  await page.getByLabel('Demo live status',{exact:true}).check();
  const imported=node(page),local=node(page,'local'),section=page.locator('#docview .board').first();
  await expect(imported).toHaveAttribute('data-live-appearance',/./);
  await expect(local).toHaveAttribute('data-live-appearance',/./);
  await page.locator('#docview .schip[data-step-source="0"]').first().click();
  await expect(section).toHaveClass(/stepmode/);
  await expect(imported).toHaveCSS('opacity','1');
  await expect(local).toHaveCSS('opacity','0.55');
  await page.locator('#docview .schip[data-step-source="1"]').first().click();
  await expect(imported).toHaveCSS('opacity','0.55');
  await expect(local).toHaveCSS('opacity','1');
  await page.getByLabel('Demo live status',{exact:true}).uncheck();
  await expect(imported).not.toHaveAttribute('data-live-appearance');
  await expect(imported).not.toHaveCSS('opacity','1');
});

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
  await expect(panel.locator('tr[data-live-coverage-for="API-2"],.dv-live-chip')).toHaveCount(0);
  const card=node(page).locator('.card');await card.focus();await expect(card).toBeFocused();
  await page.keyboard.press('Enter');await expect(root.locator('.dv-live-popover')).toContainText('API-2');await expect(root.locator('.dv-live-popover').getByRole('link',{name:pr,exact:true})).toHaveAttribute('href',pr);await page.keyboard.press('Escape');
  const label=root.locator('text.lbl[data-dv-edge="0"]');await label.focus();await expect(label).toBeFocused();await page.keyboard.press('Enter');
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

test('an Initiative board discovers stories over imported-only tracking and focuses both imported carriers',async({page,server},info)=>{
  await fixture(page,server,(provider,consumer)=>{
    consumer.page.tracking.jira.epic=['INIT-100','EP-101'];
    const d=diagram(consumer);d.topologyImports[0].nodeTracking={api:{tickets:['API-2'],prs:[pr]}};
    d.topologyImports[0].edgeTracking={'api->store':{tickets:['API-2'],prs:[pr]}};
    d.sectionLayout={columns:24,default:[{x:0,y:0,w:10,h:18},{controls:'steps',x:0,y:18,w:10,h:5},{panel:'status',x:10,y:0,w:14,h:22}]};
  });
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=JSON.parse(files[Object.keys(files).find(n=>n.endsWith('.spec.json'))]);
  expect(diagram(json).nodes).toEqual({});expect(diagram(json).edges).toBeUndefined();expect(json.page.tracking.jira.epic).toEqual(['INIT-100','EP-101']);
  const html=files[Object.keys(files).find(n=>n.endsWith('.html'))];await writeFile(path.join(server.root,'imported-initiative.html'),html);
  await page.addInitScript(()=>{
    const issue=(key,title,level,state,parent)=>({key,fields:{summary:title,issuetype:{name:level===2?'Program':level===1?'Epic':'Story',hierarchyLevel:level},status:{name:state==='done'?'Done':state==='blocked'?'Blocked':'To Do',statusCategory:{key:state==='done'?'done':'new'}},assignee:{displayName:'Alex'},...(parent?{parent:{key:parent}}:{})}});
    const records={
      'INIT-100':issue('INIT-100','Canonical service delivery',2,'todo'),
      'EP-101':issue('EP-101','Service implementation',1,'todo','INIT-100'),
      'EP-102':issue('EP-102','Storage delivery',1,'todo','INIT-100'),
      'CAN-1':issue('CAN-1','Provider API contract',0,'done','EP-101'),
      'API-2':issue('API-2','Consumer persistence integration',0,'todo','EP-101'),
      'ST-3':issue('ST-3','Storage rollout',0,'blocked','EP-102')
    };
    records['API-2'].fields.issuelinks=[{type:{inward:'is blocked by'},inwardIssue:records['ST-3']}];
    window.__initiativeImportWatches=[];
    const result=input=>{
      const parent=/^parent = ([A-Z0-9-]+)/.exec(input.jql),keys=/^key in \(([^)]+)\)/.exec(input.jql);
      let issues=parent?Object.values(records).filter(row=>row.fields.parent?.key===parent[1]):(keys?.[1].split(', ')||[]).map(key=>records[key]).filter(Boolean);
      if(input.jql.includes('Flagged'))issues=issues.filter(row=>row.key==='ST-3');return {payload:{issues}};
    };
    window.claude={use:async()=>({listTools:async()=>[{server:'Atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql']}],callTool:async(s,t,input)=>t==='getAccessibleAtlassianResources'?{payload:[{id:'cloud',url:'https://acme.atlassian.net'}]}:result(input),watchTool(s,t,input,handler){const watch={input,stopped:false};window.__initiativeImportWatches.push(watch);queueMicrotask(()=>{if(!watch.stopped)handler({type:'data',result:result(input)});});return ()=>{watch.stopped=true;};}})};
  });
  await page.setViewportSize({width:1600,height:1200});await page.goto(server.origin+'/imported-initiative.html');
  const root=page.locator('#docview'),panel=root.locator('.pt-live-status');
  await expect(panel.locator('.dv-live-scope')).toHaveText('Initiative · 2 epics');await expect(panel.locator('.dv-live-epic-progress')).toHaveText('1 of 3 stories done · 2 of 3 on diagram');
  await expect(panel.locator('tr[data-live-ticket]')).toHaveCount(3);await expect(panel.locator('tr[data-live-ticket="API-2"] .dv-live-ticket-epic')).toHaveText('epic EP-101');
  await expect(panel.locator('tr[data-live-coverage-for="ST-3"]')).toContainText('NOT ON DIAGRAM');await expect(panel.locator('tr[data-live-ticket="API-2"] .dv-live-dep[data-live-dep-for="ST-3"]')).toHaveAttribute('data-tone','red');
  await expect(node(page)).toHaveClass(/dv-live-active/);await expect(root.locator('path.edge')).toHaveClass(/dv-live-todo/);await expect(root.locator('path.edge')).toHaveClass(/dv-live-waiting/);
  await expect(panel.locator('tr[data-live-coverage-for="API-2"],.dv-live-chip')).toHaveCount(0);
  const card=node(page).locator('.card');await card.focus();await expect(card).toBeFocused();
  const label=root.locator('text.lbl[data-dv-edge="0"]');await label.focus();await expect(label).toBeFocused();
  // Dependency navigation covers provider tickets and consumer tracking on real imported nodes.
  const destination=async key=>{
    const target=panel.locator('tr[data-live-ticket="'+key+'"] .dv-live-ticket-key a');
    await expect(target).toBeFocused();await expect(target).toHaveCSS('outline-style','solid');await expect(target).toHaveCSS('outline-width','2px');
    expect(await target.evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.dv-live-tickets-scroll').getBoundingClientRect();return r.left>=s.left-1 && r.right<=s.right+1 && r.top>=s.top-1 && r.bottom<=s.bottom+1;})).toBe(true);
  };
  await panel.locator('tr[data-live-ticket="API-2"] [data-live-dep-for="CAN-1"]').click();await destination('CAN-1');
  await panel.locator('.dv-live-chain [data-live-dep-for="API-2"]').first().press('Enter');await destination('API-2');
  expect(await page.evaluate(()=>window.__initiativeImportWatches.filter(w=>w.input.jql==='parent = EP-101').length)).toBe(1);
  await page.screenshot({path:info.outputPath('initiative-imported-tracking-board.png')});
});

test('import-overlay-only source exports live-status capability without page tracking metadata',async({page,server})=>{
  await fixture(page,server,(provider,consumer)=>{
    delete consumer.page.tracking;delete diagram(provider).nodes.api.tickets;
    diagram(consumer).topologyImports[0].edgeTracking={'api->store':{tickets:['API-2'],prs:[pr]}};
  });
  await expect(page.getByLabel('Demo live status',{exact:true})).toBeVisible();
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))],saved=JSON.parse(json);
  expect(saved.page.tracking).toBeUndefined();expect(saved.page.flowview.features).toContain('flow.live-status');
  expect(diagram(saved).nodes).toEqual({});expect(diagram(saved).edges).toBeUndefined();expect(diagram(saved).topologyImports[0].edgeTracking).toEqual({'api->store':{tickets:['API-2'],prs:[pr]}});
  await page.locator('#file-input').setInputFiles({name:'overlay-only.spec.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.reload();await expect(page.locator('#src')).toHaveValue(json);await page.getByLabel('Demo live status',{exact:true}).check();
  await expect(page.locator('#docview path.edge')).toHaveClass(/dv-live-todo/);await expect(page.locator('#docview .pt-live-status tr[data-live-ticket="API-2"]')).toHaveCount(1);
});

test('provider-only tracking survives project export while unsupported Confluence imports are refused',async({page,server})=>{
  await fixture(page,server,(provider,consumer)=>{
    delete consumer.page.tracking;diagram(provider).nodes.api.prs=[pr];
  });
  const before=await source(page),pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))],saved=JSON.parse(json);
  expect(saved.page.flowview.features).toContain('flow.live-status');expect(saved.page.tracking).toBeUndefined();
  expect(diagram(saved)).toEqual(diagram(JSON.parse(before)));expect(diagram(saved).topologyImports[0].nodeTracking).toBeUndefined();
  await expect(page.locator('#src')).toHaveValue(before);
  // The packaged handoff cannot publish unresolved topology; preserve its
  // explicit refusal instead of downloading a payload without its providers.
  const downloads=[];page.on('download',download=>downloads.push(download));
  await page.locator('#confluence-export').dispatchEvent('click');
  await expect(page.getByText(/Confluence export:.*unresolved topology declarations/)).toBeVisible();
  expect(downloads).toHaveLength(0);await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#file-input').setInputFiles({name:'inherited-only.spec.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.reload();await expect(page.locator('#src')).toHaveValue(json);await select(page,'node');
  await expect(page.locator('#guide')).toContainText('Inherited tracking (read only): CAN-1, '+pr);await expect(page.getByRole('button',{name:'Remove ticket 1',exact:true})).toHaveCount(0);
  const html=files[Object.keys(files).find(n=>n.endsWith('.html'))];await writeFile(path.join(server.root,'provider-only-tracking.html'),html);
  await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>{window.__inheritedTrackingRefs=refs;return {'CAN-1':{state:'done'}};}};});
  await page.goto(server.origin+'/provider-only-tracking.html');
  await expect.poll(()=>page.evaluate(()=>window.__inheritedTrackingRefs)).toMatchObject({tickets:['CAN-1'],prs:[pr]});
  await expect(node(page)).toHaveClass(/dv-live-done/);await expect(page.locator('#docview .pt-live-status tr[data-live-ticket="CAN-1"]')).toHaveCount(1);
});

test('desktop browse URLs edit imported and local tickets and stay clickable without a Jira site',async({page,server},info)=>{
  const url='https://jira.example.test/jira/browse/API-2?view=detail#comments';
  await fixture(page,server,(provider,consumer)=>{
    delete consumer.page.tracking;
    diagram(provider).nodes.api.tickets=['https://provider.example.test/browse/CAN-1'];
    diagram(consumer).nodes={local:{title:'Local'}};diagram(consumer).rows=[['local']];
  });
  await add(page,'node','Add ticket',url);
  await select(page,'node');const after=await source(page);
  for(const value of ['API-2','https://user:pass@jira.example.test/browse/BAD-3','https://jira.example.test/issues/BAD-3']){
    const input=page.getByRole('textbox',{name:'Add ticket',exact:true});await input.fill(value);await input.press('Enter');
    await expect(page.locator('#src')).toHaveValue(after);
  }
  await add(page,'edge','Add ticket',url);
  await closeTools(page);await node(page,'local').click();await page.locator('#editor-tab-inspect').click();
  const localBefore=await source(page),localURL='https://jira.example.test/browse/LOC-4';
  await page.getByRole('textbox',{name:'Add ticket',exact:true}).fill(localURL);await page.getByRole('textbox',{name:'Add ticket',exact:true}).press('Enter');
  await expect.poll(()=>source(page)).not.toBe(localBefore);await history(page,localBefore);
  const raw=JSON.parse(await source(page)),d=diagram(raw);expect(d.nodes.local.tickets).toEqual([localURL]);
  expect(d.nodes['canon::api']).toBeUndefined();expect(d.topologyImports[0].nodeTracking.api.tickets).toEqual([url]);
  expect(d.topologyImports[0].edgeTracking['api->store'].tickets).toEqual([url]);
  await select(page,'node');const beforeRemoval=await source(page);await page.getByRole('button',{name:'Remove ticket 1',exact:true}).click();
  await history(page,beforeRemoval);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(beforeRemoval);
  await closeTools(page);await page.getByLabel('Demo live status',{exact:true}).check();
  await node(page).locator('.nrefs-trigger').click();await expect(page.locator('.node-link-menu').getByRole('link',{name:'API-2 ↗',exact:true})).toHaveAttribute('href',url);await page.keyboard.press('Escape');
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))],html=files[Object.keys(files).find(n=>n.endsWith('.html'))];
  expect(diagram(JSON.parse(json))).toEqual(d);
  await writeFile(path.join(server.root,'jira-url-tracking.html'),html);
  await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>{window.__jiraURLRefs=refs;return {'CAN-1':{state:'todo'},'API-2':{state:'active'},'LOC-4':{state:'todo'}};}};});
  await page.goto(server.origin+'/jira-url-tracking.html');
  await expect.poll(()=>page.evaluate(()=>window.__jiraURLRefs)).toMatchObject({tickets:['LOC-4','CAN-1','API-2']});
  const root=page.locator('#docview');await expect(root.locator('tr[data-live-ticket="API-2"]').getByRole('link',{name:'API-2',exact:true})).toHaveAttribute('href',url);
  await node(page).locator('.card').focus();await page.keyboard.press('Enter');
  await expect(root.locator('.dv-live-popover').getByRole('link',{name:'API-2',exact:true})).toHaveAttribute('href',url);
  await expect(root.locator('.dv-live-popover').getByRole('link',{name:'CAN-1',exact:true})).toHaveAttribute('href','https://provider.example.test/browse/CAN-1');
  await page.screenshot({path:info.outputPath('jira-url-tracking-desktop.png')});
});

test('desktop availability controls respect provider inheritance and preserve consumer overlay history',async({page,server})=>{
 await fixture(page,server,(provider)=>{diagram(provider).nodes.api.existsWhen='tickets-done';diagram(provider).edges[0].tickets=['CAN-2'];});
 await select(page,'node');const control=page.locator('#guide').getByRole('checkbox',{name:'Exists when tickets are complete',exact:true});await expect(control).toBeChecked();await expect(control).toBeDisabled();await expect(page.locator('#guide')).toContainText('Inherited from the provider.');
 await select(page,'edge');await expect(control).toBeEnabled();await expect(control).not.toBeChecked();const before=await source(page);await control.check();await history(page,before);
 await expect.poll(async()=>diagram(JSON.parse(await source(page))).topologyImports[0].edgeTracking).toEqual({'api->store':{existsWhen:'tickets-done'}});
 await add(page,'edge','Add ticket','CAN-3');await select(page,'edge');await expect(control).toBeChecked();
 await control.uncheck();await expect.poll(async()=>diagram(JSON.parse(await source(page))).topologyImports[0].edgeTracking).toEqual({'api->store':{tickets:['CAN-3']}});
 await select(page,'node');await expect(control).toBeChecked();await expect(control).toBeDisabled();
});

test('desktop imported missing-work marker uses consumer history and preserves inherited intent',async({page,server})=>{
 const {provider}=await fixture(page,server);await select(page,'node');const before=await source(page),control=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true});
 await control.check();await expect.poll(async()=>diagram(JSON.parse(await source(page))).topologyImports[0].nodeTracking.api.missingWork).toBe(true);await history(page,before);
 expect(diagram(provider).nodes.api.missingWork).toBeUndefined();await select(page,'node');await control.uncheck();await expect.poll(async()=>diagram(JSON.parse(await source(page))).topologyImports[0].nodeTracking).toBeUndefined();
});

test('desktop provider missing-work intent is read only in its consumer',async({page,server})=>{
 await fixture(page,server,(provider)=>{diagram(provider).nodes.api.missingWork=true;});await select(page,'node');const control=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true});await expect(control).toBeChecked();await expect(control).toBeDisabled();
});


test('desktop resolved imported nodes accept missing work and tracking without a provider catalog',async({page,server},info)=>{
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API',tickets:['CAN-1']},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const consumer=model('consumer',{nodes:{local:{title:'Local'}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'canon'}],panels:[{id:'status',type:'live-status'}],steps:[{id:'persist',edge:'canon::api->canon::store'}]});
  const beforeProvider=JSON.stringify(provider),snapshot=C.materializeTopology([provider,consumer])[1];
  await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'resolved.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot,null,2))});
  await expect(node(page)).toBeVisible();await select(page,'node');
  const marker=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true}),before=await source(page);
  await expect(marker).toBeVisible();await expect(marker).toBeEnabled();await marker.check();await history(page,before);
  expect(diagram(JSON.parse(await source(page))).nodes['canon::api'].missingWork).toBe(true);
  await select(page,'node');const marked=await source(page);await marker.uncheck();await history(page,marked);
  expect(diagram(JSON.parse(await source(page))).nodes['canon::api'].missingWork).toBeUndefined();
  await select(page,'node');await marker.check();
  await add(page,'node','Add ticket','API-2');await add(page,'node','Add PR',pr);
  const availability=page.locator('#guide').getByRole('checkbox',{name:'Exists when tickets are complete',exact:true});
  await select(page,'node');const beforeAvailability=await source(page);await availability.check();await history(page,beforeAvailability);
  await add(page,'edge','Add ticket','EDGE-2');await add(page,'edge','Add PR',pr);
  await select(page,'edge');const beforeEdgeRule=await source(page);await availability.check();await history(page,beforeEdgeRule);
  await select(page,'node','local');const localBefore=await source(page);await marker.check();await history(page,localBefore);
  await select(page,'node');await expect(marker).toBeChecked();await expect(node(page)).toHaveAttribute('data-live-appearance','missing');
  await page.screenshot({path:info.outputPath('snapshot-imported-missing-work-assigned.png')});
  const authored=JSON.parse(await source(page)),d=diagram(authored);
  expect(d.nodes['canon::api']).toMatchObject({missingWork:true,tickets:['CAN-1','API-2'],prs:[pr],existsWhen:'tickets-done'});
  expect(d.edges[0]).toMatchObject({tickets:['EDGE-2'],prs:[pr],existsWhen:'tickets-done'});
  expect(d.topologyImports).toBeUndefined();expect(d.topologyProvenance).toEqual(diagram(snapshot).topologyProvenance);
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))],html=files[Object.keys(files).find(n=>n.endsWith('.html'))];
  expect(diagram(JSON.parse(json))).toEqual(d);
  await page.locator('#file-input').setInputFiles({name:'saved-resolved.spec.json',mimeType:'application/json',buffer:Buffer.from(json)});await page.reload();
  await select(page,'node');await expect(marker).toBeChecked();await expect(availability).toBeChecked();
  await expect(page.getByRole('textbox',{name:'Add ticket',exact:true})).toBeVisible();await expect(page.locator('#guide')).toContainText('API-2');
  await writeFile(path.join(server.root,'resolved-status.html'),html);
  await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>{window.__snapshotRefs=refs;return {'CAN-1':{state:'done'},'API-2':{state:'done'},'EDGE-2':{state:'done'}};}};});
  await page.goto(server.origin+'/resolved-status.html');
  await expect.poll(()=>page.evaluate(()=>window.__snapshotRefs)).toMatchObject({tickets:['CAN-1','API-2','EDGE-2'],prs:[pr]});
  for(const id of ['local','canon::api'])await expect(node(page,id)).toHaveAttribute('data-live-appearance','missing');
  await expect(page.locator('#docview .dv-live-completion strong')).toHaveText('1/3 carriers done');
  await node(page).locator('.card').focus();await page.keyboard.press('Enter');await expect(page.locator('.dv-live-popover')).toContainText('Missing work: additional work remains');
  expect(JSON.stringify(provider)).toBe(beforeProvider);
});

for(const resolved of [false,true])test('desktop nested imported missing-work assignment stays in its '+(resolved?'snapshot':'authored')+' tab',async({page,server})=>{
  const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
  const provider=model('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
  const middle=model('middle',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'inner'}],topologyExports:{core:{nodes:['inner::api','inner::store'],edges:['inner::api->inner::store']}}});
  const consumer=model('consumer',{}),id='outer::inner::api';
  consumer.page.sections=[{tabs:[{label:'Overview',sections:[{id:'overview',diagram:{nodes:{local:{title:'Overview node'}},rows:[['local']]}}]},{label:'Delivery',sections:[{id:'delivery',diagram:{nodes:{},rows:[[]],topologyImports:[{spec:'middle',export:'core',as:'outer'}],panels:[{id:'status',type:'live-status'}],steps:[{id:'persist',edge:'outer::inner::api->outer::inner::store'}]}}]}]}];
  const delivery=raw=>raw.page.sections[0].tabs[1].sections[0].diagram,models=[provider,middle,consumer],providersBefore=JSON.stringify([provider,middle]);
  const raw=resolved?C.materializeTopology(models)[2]:consumer;
  if(!resolved){
    const catalog={version:3,diagrams:models.map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
    await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));
    for(const spec of models)await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');
  await page.locator('#welcome-file').setInputFiles({name:'nested.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw,null,2))});
  await chooseNavigation(page.locator('#docview .explore-navigation'),'Tab','Delivery');await select(page,'node',id);
  const marker=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true}),before=await source(page);
  await marker.check();await history(page,before);await expect(node(page,id)).toHaveAttribute('data-live-appearance','missing');
  let authored=JSON.parse(await source(page));
  if(resolved)expect(delivery(authored).nodes[id].missingWork).toBe(true);
  else {expect(delivery(authored).topologyImports[0].nodeTracking).toEqual({'inner::api':{missingWork:true}});expect(delivery(authored).nodes[id]).toBeUndefined();}
  expect(authored.page.sections[0].tabs[0]).toEqual(raw.page.sections[0].tabs[0]);
  await select(page,'node',id);const checked=await source(page);await marker.uncheck();await history(page,checked);await select(page,'node',id);await marker.check();
  await closeTools(page);await clickEdgeStroke(page,0);await page.locator('#editor-tab-inspect').click();const edgeBefore=await source(page);await marker.check();await history(page,edgeBefore);
  await closeTools(page);await page.locator('#docview g.dv-live-comm-failure[data-dv-edge="0"] .comm-break').click();await page.locator('#editor-tab-inspect').click();
  const edgeMarked=await source(page);await marker.uncheck();await history(page,edgeMarked);await closeTools(page);await clickEdgeStroke(page,0);await page.locator('#editor-tab-inspect').click();await marker.check();
  authored=JSON.parse(await source(page));
  if(resolved)expect(delivery(authored).edges[0].missingWork).toBe(true);else expect(delivery(authored).topologyImports[0].edgeTracking).toEqual({'inner::api->inner::store':{missingWork:true}});
  await expect(page.locator('#docview g.dv-live-comm-failure[data-dv-edge="0"]')).toBeVisible();
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))];
  await page.locator('#file-input').setInputFiles({name:'nested-saved.spec.json',mimeType:'application/json',buffer:Buffer.from(json)});await page.reload();
  await chooseNavigation(page.locator('#docview .explore-navigation'),'Tab','Delivery');await select(page,'node',id);await expect(marker).toBeChecked();await expect(node(page,id)).toHaveAttribute('data-live-appearance','missing');
  await expect(page.locator('#docview g.dv-live-comm-failure[data-dv-edge="0"]')).toBeVisible();
  expect(JSON.stringify([provider,middle])).toBe(providersBefore);
});

// Pointer gestures deliberately hit the rendered stroke, not a synthetic event
// or the empty center of a curved path's bounding box.
async function clickEdgeStroke(page,index){
  const edge=page.locator('#docview path.edge[data-dv-edge="'+index+'"]');
  await edge.scrollIntoViewIfNeeded();
  const point=await edge.evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()*.23),screen=new DOMPoint(p.x,p.y).matrixTransform(el.getScreenCTM());return {x:screen.x,y:screen.y};});
  await page.mouse.click(point.x,point.y);
}
for(const resolved of [false,true])test('desktop pointer clicks reveal Jira tickets on local and imported edges in '+(resolved?'snapshots':'authored imports'),async({page,server},info)=>{
  const {provider,consumer}=await fixture(page,server,(provider,consumer)=>{
    diagram(provider).edges[0].tickets=['CAN-3'];
    const d=diagram(consumer);d.nodes={localA:{title:'Local A'},localB:{title:'Local B'}};d.rows=[['localA','localB']];
    d.edges=[{from:'localA',to:'localB',label:'Local delivery',tickets:['LOCAL-4']}];
    d.topologyImports[0].edgeTracking={'api->store':{tickets:['API-2']}};
  });
  if(resolved){
    const snapshot=C.materializeTopology([provider,consumer])[1];
    await page.locator('#file-input').setInputFiles({name:'resolved-edges.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot,null,2))});
  }
  const cases=[{index:0,keys:['LOCAL-4']},{index:1,keys:['CAN-3','API-2']}];
  for(const {index,keys} of cases)for(const gesture of ['stroke','label']){
    await closeTools(page);
    if(gesture==='stroke')await clickEdgeStroke(page,index);else await page.locator('#docview text.lbl[data-dv-edge="'+index+'"]').click();
    await page.locator('#editor-tab-inspect').click();
    await expect(page.locator('#guide').getByRole('textbox',{name:'Add ticket',exact:true})).toBeVisible();
    for(const key of keys)await expect(page.locator('#guide')).toContainText(key);
  }
  const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
  const files=await projectFiles(await pending),html=files[Object.keys(files).find(n=>n.endsWith('.html'))];
  await writeFile(path.join(server.root,'pointer-edges.html'),html);
  await page.addInitScript(()=>{window.flowviewLiveStatus={provider:()=>({'CAN-1':{state:'done'},'CAN-3':{state:'todo'},'API-2':{state:'todo'},'LOCAL-4':{state:'todo'}})};});
  await page.goto(server.origin+'/pointer-edges.html');
  for(const {index,keys} of cases)for(const gesture of ['stroke','label']){
    await expect(page.locator('#docview path.edge[data-dv-edge="'+index+'"]').first()).toHaveClass(/dv-live-todo/);
    if(gesture==='stroke')await clickEdgeStroke(page,index);else await page.locator('#docview text.lbl[data-dv-edge="'+index+'"]').click();
    const pop=page.locator('#docview .dv-live-popover');await expect(pop).toBeVisible();
    for(const key of keys)await expect(pop.getByRole('link',{name:key,exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/'+key);
    if(index===1 && gesture==='label')await page.screenshot({path:info.outputPath('imported-edge-jira-pointer.png')});
    await page.keyboard.press('Escape');await expect(pop).not.toBeVisible();
  }
});


for(const kind of ['imported','local','snapshot'])test('desktop '+kind+' edge Missing work assigns a broken connection and preserves history',async({page,server},info)=>{
 const {provider,consumer}=await fixture(page,server,(provider,consumer)=>{
  delete diagram(provider).nodes.api.tickets;diagram(provider).edges[0].tickets=['EDGE-1'];
  if(kind==='snapshot')delete diagram(provider).edges[0].label;
  if(kind==='local'){
   const d=diagram(consumer);d.nodes={a:{title:'Local A'},b:{title:'Local B'}};d.rows=[['a','b']];d.edges=[{from:'a',to:'b',label:'Local delivery',tickets:['EDGE-1']}];d.steps=[{edge:'a->b'}];
  }
 });
 const providerBefore=JSON.stringify(provider);
 if(kind==='snapshot')await page.locator('#file-input').setInputFiles({name:'snapshot.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(C.materializeTopology([provider,consumer])[1],null,2))});
 const readMarker=raw=>kind==='imported'?diagram(raw).topologyImports[0].edgeTracking?.['api->store']?.missingWork:diagram(raw).edges[0].missingWork;
 await closeTools(page);await clickEdgeStroke(page,0);await page.locator('#editor-tab-inspect').click();
 const marker=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true}),before=await source(page),broken=page.locator('#docview g.dv-live-comm-failure[data-dv-edge="0"]'),line=page.locator('#docview path.edge[data-dv-edge="0"]');
 await expect(marker).toBeVisible();await expect(marker).toBeEnabled();await marker.check();await history(page,before);
 expect(readMarker(JSON.parse(await source(page)))).toBe(true);await expect(broken).toBeVisible();await expect(line).toHaveCSS('visibility','hidden');
 await closeTools(page);await broken.locator('.comm-break').click();await page.locator('#editor-tab-inspect').click();
 const marked=await source(page);await marker.uncheck();await history(page,marked);expect(readMarker(JSON.parse(await source(page)))).toBeUndefined();await expect(broken).toHaveCount(0);
 await closeTools(page);await clickEdgeStroke(page,0);await page.locator('#editor-tab-inspect').click();await marker.check();await expect(broken).toBeVisible();
 await page.screenshot({path:info.outputPath('edge-missing-work-assigned.png')});
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
 const files=await projectFiles(await pending),json=files[Object.keys(files).find(n=>n.endsWith('.spec.json'))],html=files[Object.keys(files).find(n=>n.endsWith('.html'))];
 expect(readMarker(JSON.parse(json))).toBe(true);
 await page.locator('#file-input').setInputFiles({name:'saved.spec.json',mimeType:'application/json',buffer:Buffer.from(json)});await page.reload();
 await closeTools(page);await broken.locator('.comm-break').click();await page.locator('#editor-tab-inspect').click();await expect(marker).toBeChecked();
 await writeFile(path.join(server.root,'edge-missing.html'),html);
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:refs=>{window.__edgeMissingRefs=refs;return {'EDGE-1':{state:'done'}};}};});
 await page.goto(server.origin+'/edge-missing.html');await expect.poll(()=>page.evaluate(()=>window.__edgeMissingRefs?.tickets)).toEqual(['EDGE-1']);
 await expect(broken).toBeVisible();await expect(broken).toHaveAttribute('data-live-appearance','missing');await expect(line).toHaveCSS('visibility','hidden');
 await expect(page.locator('#docview .dv-live-completion strong')).toHaveText(kind==='local'?'1/2 carriers done':'0/1 carriers done');
 await expect(page.locator('#docview [data-live-count="done"]')).toContainText('1');
 const packets=page.locator('#docview circle.pkt').filter({has:page.locator('mpath[href$="-e0"]')});expect(await packets.count()).toBeGreaterThan(0);for(const dot of await packets.all())await expect(dot).toHaveClass(/dv-live-packet-hidden/);
 const label=page.locator('#docview text.lbl[data-dv-edge="0"]'),keyboard=kind==='snapshot'?broken:label;
 for(const gesture of ['glyph','keyboard',...(kind==='snapshot'?[]:['label'])]){
  if(gesture==='glyph')await broken.locator('.comm-break').click();else if(gesture==='label')await label.click();else {await keyboard.focus();await page.keyboard.press('Enter');}
  const pop=page.locator('#docview .dv-live-popover');await expect(pop).toBeVisible();await expect(pop).toContainText('Missing work: additional work remains');await expect(pop.getByRole('link',{name:'EDGE-1',exact:true})).toHaveAttribute('href','https://acme.atlassian.net/browse/EDGE-1');
  await page.keyboard.press('Escape');await expect(keyboard).toBeFocused();
 }
 await page.screenshot({path:info.outputPath('edge-missing-work-reader.png')});
 const live=page.locator('#docview .dv-live-toggle');await live.click();await expect(broken).toHaveCount(0);await expect(line).not.toHaveClass(/dv-live-comm-hidden/);for(const dot of await packets.all())await expect(dot).not.toHaveClass(/dv-live-packet-hidden/);
 await live.click();await expect(broken).toBeVisible();await page.emulateMedia({media:'print'});await expect(broken).toHaveCSS('display','inline');await expect(line).toHaveCSS('visibility','hidden');await page.emulateMedia({media:'screen'});
 expect(JSON.stringify(provider)).toBe(providerBefore);
});

test('desktop inherited edge Missing work is read only while local additions remain editable',async({page,server})=>{
 await fixture(page,server,provider=>{diagram(provider).edges[0].missingWork=true;});await closeTools(page);await page.locator('#docview g.dv-live-comm-failure[data-dv-edge="0"] .comm-break').click();await page.locator('#editor-tab-inspect').click();
 const marker=page.locator('#guide').getByRole('checkbox',{name:'Missing work',exact:true});await expect(marker).toBeChecked();await expect(marker).toBeDisabled();
 const input=page.locator('#guide').getByRole('textbox',{name:'Add ticket',exact:true}),before=await source(page);await input.fill('EXTRA-1');await input.press('Enter');await history(page,before);expect(diagram(JSON.parse(await source(page))).topologyImports[0].edgeTracking).toEqual({'api->store':{tickets:['EXTRA-1']}});
});
