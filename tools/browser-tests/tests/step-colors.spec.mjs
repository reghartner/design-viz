import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const raw={page:{title:'Flow phases',skin:'pastel',sections:[{id:'phases',heading:'Delivery → recording → playback',diagram:{view:'step',autoplay:false,nodes:{a:{title:'Doorbell'},b:{title:'Gateway'},c:{title:'Recording'},d:{title:'Resident'}},rows:[['a','b','c'],['d']],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'}],steps:[{id:'start',text:'Delivery: device wakes.',nodes:['a']},{id:'send',text:'Delivery: send the event.',edge:'a->b',color:'#0284c7'},{id:'record',text:'Recording: store the event.',edge:'b->c',color:'#8b5cf6',delta:true},{id:'play',text:'Playback: deliver a clip.',edge:'c->d',color:'#0d9488'},{id:'done',text:'End.',nodes:['d']}]}}]}};
const source=JSON.stringify(raw,null,2),d=s=>s.page.sections[0].diagram;
const chip=(root,index)=>root.locator('.schip[data-step-source="'+index+'"]').first();
const coin=(root,index)=>root.locator('.coin[data-dv-step="'+index+'"]');
async function colors(root,index,color){await expect(chip(root,index)).toHaveCSS('background-color',color);await expect(coin(root,index).locator('circle')).toHaveCSS('fill',color);}

test('step circle color edits and resets only the selected step with exact Undo/Redo and safe invalid input',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="2"]').click();await page.locator('#editor-tab-inspect').click();
 const input=guide.getByRole('textbox',{name:'Step circle color',exact:true});await input.fill('#f90');await input.press('Tab');
 await colors(root,2,'rgb(255, 153, 0)');await colors(root,1,'rgb(2, 132, 199)');
 expect(d(JSON.parse(await page.locator('#src').inputValue())).steps[3]).toEqual(d(raw).steps[3]);
 await expect(chip(root,2)).toHaveClass(/dvd/);await expect(coin(root,2).locator('.dvdelta')).toHaveCount(1);
 const edited=await page.locator('#src').inputValue();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);await colors(root,2,'rgb(139, 92, 246)');
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
 await coin(root,2).click();
 await input.fill('url(https://bad.test)');await input.press('Tab');await expect(page.locator('#src')).toHaveValue(edited);await expect(guide).toContainText('Use a color like');
 await guide.getByRole('button',{name:'Use default circle color'}).click();await expect(chip(root,2)).not.toHaveClass(/step-colored/);await expect(coin(root,2)).not.toHaveClass(/step-colored/);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
 await coin(root,2).click();
 // Native color inputs use the browser's platform picker; exercise its committed change event.
 await guide.getByLabel('Choose step circle color',{exact:true}).evaluate(el=>{el.value='#ffffff';el.dispatchEvent(new Event('change',{bubbles:true}));});
 await colors(root,2,'rgb(255, 255, 255)');await expect(chip(root,2)).toHaveCSS('color','rgb(0, 0, 0)');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
 await page.screenshot({path:testInfo.outputPath('step-colors-editor.png')});
});

test('standalone phase colors survive all skins, current-step and hover states, print and default steps',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'step-colors.json'),source);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'step-colors.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'step-colors.html')]);
 await page.goto(server.origin+'/step-colors.html');const root=page.locator('.docview');
 for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
  await page.evaluate(skin=>{window.dvSetSkin(skin);},skin);
  await colors(root,1,'rgb(2, 132, 199)');await colors(root,2,'rgb(139, 92, 246)');await colors(root,3,'rgb(13, 148, 136)');
  await chip(root,2).click();await expect(chip(root,2)).toHaveAttribute('aria-current','true');await colors(root,2,'rgb(139, 92, 246)');
  await expect(chip(root,2)).not.toHaveCSS('box-shadow','none');await chip(root,1).hover();await colors(root,1,'rgb(2, 132, 199)');
  await chip(root,4).click();await expect(chip(root,4)).not.toHaveClass(/step-colored/);
 }
 await page.evaluate(()=>window.dvSetSkin('pastel'));await chip(root,2).click();
 await page.screenshot({path:testInfo.outputPath('step-colors-standalone.png')});
 await page.emulateMedia({media:'print'});await expect(coin(root,2).locator('circle')).toHaveCSS('fill','rgb(139, 92, 246)');
});

test('native Backstage preserves phase overrides on shared shadows, branches, and filtered source steps',async({page,server})=>{
 const branched=structuredClone(raw),diagram=d(branched);
 diagram.edges.push({from:'b',to:'d'});diagram.steps.push({id:'failed',edge:'b->d',text:'Alternate.',color:'#f97316'});
 diagram.paths=[{id:'happy',label:'Happy',color:'#2563eb',steps:['start','send','record','play','done']},{id:'failed',label:'Failed',color:'#f43f5e',steps:['start','send','failed']}];
 diagram.panels=[{id:'phone',type:'phone'}];
 const composition={default:[{x:0,y:0,w:8,h:16},{panel:'phone',x:8,y:0,w:4,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:8,h:5}]};
 diagram.layouts=[{id:'full',name:'Full',sectionLayout:composition},{id:'brief',name:'Brief',steps:['send','play','failed'],sectionLayout:composition}];diagram.defaultLayout='full';
 await writeFile(path.join(server.root,'step-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'step-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./step-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/step-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>window.viewer=mount(document.querySelector('#host'),raw),branched);const root=page.locator('#host');
 // Explicitly restore the full flow before checking shared-prefix shadows.
 await root.getByRole('button',{name:'Full',exact:true}).click();
 const shared=root.locator('.schip[data-step-path=failed][data-step-source="1"]');await expect(shared).toHaveCSS('background-color','rgb(2, 132, 199)');await expect(shared).toHaveCSS('opacity','0.35');
 await shared.click();await expect(shared).toHaveCSS('opacity','1');await expect(shared).toHaveAttribute('aria-current','true');
 await root.locator('.schip[data-step-source="5"]').click();await colors(root,5,'rgb(249, 115, 22)');
 await root.locator('[data-dv-path=happy]').click();await root.getByRole('button',{name:'Brief',exact:true}).click();
 await expect(root.locator('.schip[data-step-path=happy]')).toHaveCount(2);await expect(chip(root,1)).toHaveText('1');await expect(chip(root,3)).toHaveText('2');await colors(root,3,'rgb(13, 148, 136)');
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});

test('Forge displays authored step colors through the production resource and bridge',async({page,server})=>{
 await page.addInitScript(raw=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{specJson:JSON.stringify(raw)},macro:{isConfiguring:false}}};return true;}};},raw);
 await page.goto(server.origin+'/forge/index.html');const root=page.locator('#docview');await colors(root,2,'rgb(139, 92, 246)');await chip(root,2).click();await colors(root,2,'rgb(139, 92, 246)');
});
