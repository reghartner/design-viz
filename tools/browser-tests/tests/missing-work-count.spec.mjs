import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import sourceLoader from '../../../tools/source-loader.cjs';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

// Resolve a real topology import: inherited markers must count just like local ones.
function fixture(){
 const make=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=make('provider',{nodes:{api:{title:'Imported API',missingWork:true},store:{title:'Imported store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Imported gap',missingWork:true}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}});
 const consumer=make('consumer',{nodes:{local:{title:'Local gap',missingWork:true},peer:{title:'Local peer'},note:{type:'text',text:'Annotation',missingWork:true}},rows:[['local','peer']],floats:[{id:'note',x:50,y:180}],edges:[{from:'local',to:'peer',label:'Local gap',missingWork:true}],
  topologyImports:[{spec:'provider',export:'core',as:'shared',position:{x:80,y:300}}],panels:[{id:'status',type:'live-status',title:'Status'}],
  sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:16},{panel:'status',x:0,y:16,w:24,h:12}]}});
 const context=vm.createContext({});vm.runInContext(sourceLoader.composeSources(['validator.js','canon.js']),context);
 return JSON.parse(JSON.stringify(context.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]})));
}
async function setup(page,server){
 await page.setViewportSize({width:1440,height:1100});
 await writeFile(path.join(server.root,'missing-work-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'missing-work-native.html'),'<style>body{margin:0}#host{min-height:100vh}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./missing-work-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/missing-work-native.html');await page.waitForFunction(()=>!!window.mount);
}
async function mount(page,spec,skin='pastel'){
 await page.evaluate(({spec,skin})=>{if(window.viewer)window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{skin});},{spec,skin});
 return page.locator('#host');
}

test('authored Missing work count stays distinct from Jira counts and shares native status appearance',async({page,server},info)=>{
 await setup(page,server);const spec=fixture(),root=await mount(page,spec),panel=root.locator('.pt-live-status');
 const count=panel.locator('[data-live-count="missing-work"]'),local=root.locator('[data-dv-node="local"]'),imported=root.locator('[data-dv-node="shared::api"]');
 // Four marked occurrences, no connector or tickets; the annotated text box is inert.
 await expect(count).toBeVisible();await expect(count).toHaveText('Missing work 4');
 await expect(panel.locator('[data-live-count="missing"]')).toBeHidden();
 expect(await page.evaluate(()=>window.viewer.controller.liveStatus.snapshot().counts)).toEqual({todo:0,active:0,testing:0,done:0,blocked:0,missing:0});
 await expect(count).toHaveAttribute('data-live-appearance','missing');await expect(count).toHaveCSS('border-top-style','dashed');await expect(count).toHaveCSS('border-top-color','rgb(232, 23, 23)');
 for(const node of [local,imported]){await expect(node).toHaveAttribute('data-live-appearance','missing');await expect(node.locator('.card')).toHaveCSS('stroke','rgb(232, 23, 23)');}
 await expect(root.locator('[data-dv-node="note"]')).not.toHaveAttribute('data-live-appearance');
 // The real Live button and explicit clear retire the shared paint, retaining intent.
 for(const action of ['toggle','clear']){
  if(action==='toggle')await panel.getByRole('button',{name:'Live',exact:true}).click();else await page.evaluate(()=>window.viewer.controller.liveStatus.clear());
  await expect(count).toHaveText('Missing work 4');await expect(count).not.toHaveAttribute('data-live-appearance');
  for(const node of [local,imported])await expect(node).not.toHaveAttribute('data-live-appearance');
  if(action==='toggle')await panel.getByRole('button',{name:'Live',exact:true}).click();else await page.evaluate(()=>window.viewer.controller.liveStatus.apply({}));
  await expect(count).toHaveAttribute('data-live-appearance','missing');
 }
 // A Done ticket on a marked carrier does not erase authored work; an unrelated
 // missing ticket contributes exactly one Jira missing count, never a work marker.
 const tracked=structuredClone(spec),d=tracked.page.sections[0].diagram;
 d.nodes.local.tickets=['WORK-1'];d.nodes.peer.tickets=['WORK-2'];await mount(page,tracked);
 await page.evaluate(()=>window.viewer.controller.liveStatus.apply({'WORK-1':{state:'done'},'WORK-2':{state:'missing'}}));
 await expect(count).toHaveText('Missing work 4');await expect(panel.locator('[data-live-count="missing"]')).toHaveText('missing 1');await expect(panel.locator('[data-live-count="done"]')).toHaveText('done 1');
 const unmarked=structuredClone(tracked);Object.values(unmarked.page.sections[0].diagram.nodes).forEach(node=>delete node.missingWork);unmarked.page.sections[0].diagram.edges.forEach(edge=>delete edge.missingWork);
 await mount(page,unmarked);await page.evaluate(()=>window.viewer.controller.liveStatus.apply({'WORK-1':{state:'done'},'WORK-2':{state:'missing'}}));
 await expect(count).toBeHidden();await expect(panel.locator('[data-live-count="missing"]')).toHaveText('missing 1');
 expect(await page.evaluate(()=>window.viewer.controller.liveStatus.snapshot().missingWork.count)).toBe(0);
 // Saved preferences reach both native node kinds and the HTML badge through
 // the production scoped tokens, including the shared contrast-aware ink.
 await page.evaluate(()=>localStorage.setItem('flowview.status-colors.v1',JSON.stringify({version:2,colors:{'live-missing':'#9933cc'},appearance:{'live-missing':{borderColor:'#123456',borderWidth:4,fillStrength:25,glowStrength:70}}})));
 for(const skin of ['aurora','pastel']){
  await mount(page,spec,skin);await expect(count).toBeVisible();await expect(count).toHaveAttribute('data-live-appearance','missing');
  await expect(count).toHaveCSS('border-top-color','rgb(18, 52, 86)');await expect(count).toHaveCSS('border-top-width','4px');await expect(count).toHaveCSS('border-top-style','dashed');
  for(const target of [count,local,imported]){await expect(target).toHaveCSS('--dv-live-fill','25%');await expect(target).toHaveCSS('--dv-live-glow','0.7');}
  for(const node of [local,imported]){await expect(node.locator('.card')).toHaveCSS('stroke','rgb(18, 52, 86)');await expect(node.locator('.card')).toHaveCSS('stroke-width','4px');}
  expect(await count.evaluate(el=>el.style.getPropertyValue('--dv-live-ink'))).toMatch(/^#(?:000000|ffffff)$/);
  await panel.screenshot({path:info.outputPath('missing-work-count-'+skin+'.png')});
 }
 await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();
});

test('Missing work counts every nested section and loaded detail occurrence, including repeated IDs',async({page,server})=>{
 await setup(page,server);const spec=fixture();
 spec.page.sections[0].diagram.nodes.peer.detail={spec:'approved-detail',revision:'r1',section:'remote'};
 spec.page.sections.push({tabs:[{label:'Nested work',sections:[{id:'nested',diagram:{nodes:{local:{title:'Repeated local ID',missingWork:true}},rows:[['local']]}}]}]});
 const detail={page:{title:'Loaded detail',sections:[{id:'remote',heading:'Loaded detail',diagram:{nodes:{local:{title:'Repeated detail ID',missingWork:true},peer:{title:'Detail peer'}},rows:[['local','peer']],edges:[{from:'local',to:'peer',missingWork:true}]}}]}};
 await page.evaluate(({spec,detail})=>{window.viewer=window.mount(document.querySelector('#host'),spec,{loadDetail:async()=>structuredClone(detail)});},{spec,detail});
 const root=page.locator('#host'),count=root.locator('#section-main [data-live-count="missing-work"]');
 await expect(count).toHaveText('Missing work 5');
 await root.getByRole('button',{name:'Explore Local peer',exact:true}).click();
 const preview=root.locator('[data-dv-detail-preview]:visible');await expect(preview.locator('.sec-h')).toHaveText('Loaded detail');
 expect(await page.evaluate(()=>window.viewer.controller.liveStatus.snapshot().missingWork.count)).toBe(7);
 await preview.locator('.detail-breadcrumb button').first().click();await expect(count).toBeVisible();await expect(count).toHaveText('Missing work 7');
 // Reopening the same loaded source replaces its cache entry; no duplicate count.
 await root.getByRole('button',{name:'Explore Local peer',exact:true}).click();await expect(preview.locator('.sec-h')).toHaveText('Loaded detail');
 await preview.locator('.detail-breadcrumb button').first().click();await expect(count).toHaveText('Missing work 7');
 await page.evaluate(()=>window.viewer.destroy());
});
