import {test,expect,prepareEditorSurface,canvasTools} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';
const model=(id,sections)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections}});
function fixtures(){
 const base=model('base',[{id:'services',diagram:{nodes:{api:{title:'API',tickets:['https://child-jira.test/browse/AA-1']},store:{title:'Store',missingWork:true}},rows:[['api','store']],edges:[{from:'api',to:'store'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}}}]);
 const middle=model('middle',[{id:'main',diagram:{topologyImports:[{spec:'base',export:'core',as:'inner'}],topologyExports:{core:{nodes:['inner::api','inner::store'],edges:['inner::api->inner::store']}}}}]);
 const consumer=model('consumer',[{id:'overview',heading:'Overview',diagram:{nodes:{local:{title:'Local'}},rows:[['local']],edges:[{from:'local',to:'shared::inner::api'}],topologyImports:[{spec:'middle',export:'core',as:'shared',position:{x:100,y:180},nodePositions:{'inner::api':{x:0,y:0},'inner::store':{x:220,y:0}}}],steps:[{id:'visit',nodes:['shared::inner::api'],text:'Visit API'}],autoplay:false}},{id:'existing',heading:'Existing detail',detailOnly:true,diagram:{nodes:{work:{title:'Inner work'}},rows:[['work']]}}]);
 return [base,middle,consumer];
}
async function start(page,server,edit=true,change){
 const specs=fixtures();if(change)change(specs);const catalog={version:3,diagrams:specs.map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:1,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
 await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));for(const spec of specs)await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.addInitScript(()=>{window.flowviewLiveStatus={provider:async()=>({'AA-1':{state:'done'}})};});
 await page.goto(server.origin+'/workbench.html?diagram=consumer');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
 if(edit){await page.locator('#canon-reader-edit').click();await prepareEditorSurface(page);}
}
const source=page=>page.locator('#src').inputValue();
const node=(page,id)=>page.locator('#section-overview g.node[data-dv-node="'+id+'"]');
test('nested imported detail create/assign, drilldown and domain extraction preserve source and one-step history',async({page,server},info)=>{
 await page.setViewportSize({width:1600,height:1000});await start(page,server);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await node(page,'shared::inner::api').click();const before=await source(page);await page.getByRole('button',{name:'Create detail flow',exact:true}).click();
 let raw=JSON.parse(await source(page)),imp=raw.page.sections[0].diagram.topologyImports[0];expect(imp.nodeDetails['inner::api'].section).toBe('shared--inner--api-detail');expect(raw.page.sections[0].diagram.nodes['shared::inner::api']).toBeUndefined();const created=await source(page);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(created);
 await node(page,'shared::inner::api').click();await page.locator('.node-detail-editor > summary').click();await page.getByLabel('Local section',{exact:true}).selectOption('existing');await page.getByRole('button',{name:'Apply detail',exact:true}).click();
 raw=JSON.parse(await source(page));expect(raw.page.sections[0].diagram.topologyImports[0].nodeDetails['inner::api'].section).toBe('existing');
 await page.locator('#section-overview [data-dv-detail="shared::inner::api"]').click();await expect(page.locator('[data-dv-detail-preview]:visible')).toContainText('Inner work');await page.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();
 await node(page,'shared::inner::api').click();await node(page,'shared::inner::store').click({modifiers:['Shift']});await page.getByRole('button',{name:'Create domain from selected nodes',exact:true}).click();
 await expect(page.locator('.extraction-summary')).toContainText('2 nodes');await page.getByRole('button',{name:'Apply extraction',exact:true}).click();
 const extracted=await source(page);raw=JSON.parse(extracted);const child=raw.page.sections.at(-1).diagram;expect(child.topologyImports[0].nodeDetails['inner::api'].section).toBe('existing');expect(child.nodes).toEqual({});expect(child.topologyProvenance).toBeUndefined();
 await page.locator('#undo-builder').click();expect(JSON.parse(await source(page)).page.sections[0].diagram.topologyImports).toHaveLength(1);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(extracted);
 await page.locator('#section-overview [data-dv-detail="domain1"]').click();await expect(page.locator('[data-dv-detail-preview]:visible [data-dv-node="shared::inner::store"]')).toBeVisible();await page.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();
 await page.screenshot({path:info.outputPath('imported-domain-desktop.png')});expect(errors).toEqual([]);
});
test('domain reader summarizes unopened imported work, explains it and reapplies after drilldown',async({page,server},info)=>{
 await start(page,server,false,specs=>{
  const sections=specs[2].page.sections,old=sections[0].diagram;
  sections.push({id:'components',heading:'Imported components',detailOnly:true,diagram:{nodes:{},rows:[[]],topologyImports:old.topologyImports}});
  sections[0].diagram={nodes:{domain:{title:'Domain',style:'moss',prs:['https://github.com/acme/repo/pull/1'],detail:{section:'components',mode:'focus'}}},rows:[['domain']],panels:[{id:'status',type:'live-status'}],steps:[{id:'work',nodes:['domain'],text:'Domain work'}],autoplay:false};
 });
 const domain=page.locator('#section-overview [data-dv-node="domain"]');await expect(domain).toHaveAttribute('data-live-appearance','missing');await expect(domain).not.toHaveClass(/dv-live-unavailable/);
 await page.getByRole('button',{name:'First blocker',exact:true}).click();await expect(domain.locator('.card')).toBeFocused();
 await domain.locator('.card').press('Enter');await expect(page.locator('.dv-live-domain-summary')).toContainText('1 unique tickets');await expect(page.locator('.dv-live-domain-summary')).toContainText('Missing work');await expect(page.locator('.dv-live-popover a[href="https://child-jira.test/browse/AA-1"]')).toBeVisible();await expect(page.locator('.dv-live-popover a[href="https://github.com/acme/repo/pull/1"]')).toBeVisible();await page.getByRole('button',{name:'Close live tickets',exact:true}).click();
 await page.locator('#section-overview [data-dv-detail="domain"]').click();const detail=page.locator('[data-dv-detail-preview]:visible');await expect(detail.locator('[data-dv-node="shared::inner::store"]')).toHaveAttribute('data-live-appearance','missing');await detail.locator('.detail-breadcrumb button').first().click();await expect(domain).toHaveAttribute('data-live-appearance','missing');
 await page.getByRole('button',{name:/^Live/}).first().click();await expect(domain).not.toHaveAttribute('data-live-appearance');await expect(domain).toHaveClass(/ns-moss/);await page.screenshot({path:info.outputPath('domain-live-off-desktop.png')});
});
