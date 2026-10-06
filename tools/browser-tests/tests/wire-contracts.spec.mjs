import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(canvas=false){
 const contract=(title,edge,path)=>({title,source:'#source',fields:[{k:'event',v:title,g:'Stable **payload** identity.',link:'#source'},{k:'later',v:'Later',revealAt:1}],wires:[{step:'send',edge,...(path?{path}: {})}]});
 const sec={heading:'Wire story',contract:contract('Request','a->b'),contracts:[contract('Audit','a->b'),contract('Receipt','b->c','happy')],diagram:{nodes:{a:{title:'Device'},b:{title:'Cloud'},c:{title:'Storage'}},rows:[['a','b','c']],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],steps:[{id:'send',edges:['a->b','b->c'],text:'Send the request and receipt.'},{id:'done',edge:'a->b',text:'Done.'}],paths:[{id:'happy',label:'Happy',steps:['send','done']},{id:'alternate',label:'Alternate',steps:['send','done']}],view:'step',autoplay:false}};
 if(canvas){sec.diagram.layouts=[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12},{controls:'steps',x:0,y:12,w:12,h:4}]}}];sec.diagram.defaultLayout='canvas';}
 return {page:{title:'Step wire contracts',skin:'pastel',blocks:[{tabs:[{label:'Flow',sections:[sec]},{label:'Other',sections:[{heading:'Other section',text:'Nothing on this wire.'}]}]}]}};
}
async function open(page,server,raw,native=false){
 if(native){
  await writeFile(path.join(server.root,'wire-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'wire-native.html'),'<style>body{margin:0}#host{width:100%;height:100vh}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./wire-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/wire-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);},raw);return page.locator('#host');
 }
 const input=path.join(server.root,'wire.json');await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'wire.html')]);
 await page.goto(server.origin+'/wire.html');return page.locator('.docview');
}
const marker=root=>root.locator('.wire-contract-marker');
const preview=root=>root.locator('.wire-contract-preview');
async function geometry(page,pop){
 const r=await pop.boundingBox(),size=page.viewportSize();expect(r.x).toBeGreaterThanOrEqual(7);expect(r.y).toBeGreaterThanOrEqual(7);expect(r.x+r.width).toBeLessThanOrEqual(size.width-7);expect(r.y+r.height).toBeLessThanOrEqual(size.height-7);
 expect(await pop.locator('.ctcard').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
}

test('wire hover, traversable content, pin, source links, keyboard, dismissal and multiple contracts in exported HTML',async({page,server},testInfo)=>{
 const root=await open(page,server,fixture());const marks=marker(root),pop=preview(root);
 await expect(marks).toHaveCount(3);await expect(root.locator('.contract-grid>.ctcard')).toHaveCount(3);
 await marks.nth(0).hover();await expect(pop).toBeVisible();await expect(pop.locator('.cttitle')).toContainText('Request');
 await pop.locator('.ctlink').first().hover();await expect(pop).toBeVisible();
 await page.mouse.move(5,5);await expect(pop).toBeHidden();
 await marks.nth(1).click();await expect(pop).toContainText('Audit');await page.mouse.move(5,5);await expect(pop).toBeVisible();
 await expect(pop.locator('.ctrow').nth(1)).toHaveClass(/dv-fragment-hidden/);
 const [linkPage]=await Promise.all([page.waitForEvent('popup'),pop.locator('.srcchip').click()]);await linkPage.waitForLoadState();await linkPage.close();await expect(pop).toBeVisible();
 await pop.getByRole('button',{name:'Close wire contract'}).click();await expect(pop).toBeHidden();await expect(marks.nth(1)).toBeFocused();
 await marks.nth(2).focus();await expect(pop).toContainText('Receipt');await marks.nth(2).press('Enter');await expect(marks.nth(2)).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');await expect(pop).toBeHidden();await expect(marks.nth(2)).toBeFocused();
 await marks.nth(0).focus();await marks.nth(0).press('Space');await expect(pop).toBeVisible();await geometry(page,pop);
 await testInfo.attach('wire-contract-wide',{body:await page.screenshot(),contentType:'image/png'});
 await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(marks).toHaveCount(0);await expect(pop).toHaveCount(0);
 await root.getByRole('button',{name:'Previous step',exact:true}).click();await expect(marks).toHaveCount(3);
 await marks.first().click();await root.getByRole('button',{name:'Alternate',exact:true}).click();await expect(marks).toHaveCount(2);await expect(pop).toBeHidden();
 await marks.first().click();await root.getByRole('tab',{name:'Other',exact:true}).click();await expect(pop).toHaveCount(0);
 await root.getByRole('tab',{name:'Flow',exact:true}).click();await expect(marks).toHaveCount(2);
 await expect(marks.first().locator('.wire-contract-pulse')).toHaveCSS('animation-name','none');
});

for(const native of [false,true])test('Canvas wire contracts position and retire in '+(native?'native Backstage':'standalone'),async({page,server},testInfo)=>{
 await page.setViewportSize({width:1100,height:850});const root=await open(page,server,fixture(true),native);
 await expect(marker(root)).toHaveCount(3);await marker(root).first().click();await expect(preview(root)).toBeVisible();await geometry(page,preview(root));
 await testInfo.attach('wire-contract-canvas-'+(native?'native':'standalone'),{body:await page.screenshot(),contentType:'image/png'});
 await page.setViewportSize({width:900,height:760});await geometry(page,preview(root));
 await page.keyboard.press('Escape');await expect(preview(root)).toBeHidden();
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(marker(root).first().locator('.wire-contract-pulse')).toHaveCSS('animation-name','wire-contract-pulse');
 await marker(root).last().click();await expect(preview(root)).toContainText('Receipt');
 if(native){await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();await page.keyboard.press('Escape');}
 else{await root.getByRole('button',{name:'Next step',exact:true}).click();await expect(marker(root)).toHaveCount(0);}
});

test('Workbench binds an existing card to an active wire with one Undo/Redo and removes the binding',async({page,server})=>{
 const raw=fixture();const sec=raw.page.blocks[0].tabs[0].sections[0];delete sec.contract.wires;delete sec.contracts[0].wires;delete sec.contracts[1].wires;
 await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(raw,null,2));const root=page.locator('#docview'),guide=page.locator('#guide');
 await expect(marker(root)).toHaveCount(0);await root.locator('[data-dv-contract="legacy"] .cttitle>span').click({position:{x:5,y:5}});
 await guide.getByRole('combobox',{name:'Step wire binding'}).selectOption('send · a->b · All paths');await guide.getByRole('button',{name:'Bind to step wire',exact:true}).click();await expect(marker(root)).toHaveCount(1);await expect(guide.getByRole('button',{name:'Remove wire binding 1',exact:true})).toBeVisible();
 const bound=JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[0].sections[0].contract.wires;expect(bound).toEqual([{step:'send',edge:'a->b'}]);
 await page.locator('#undo-builder').click();await expect(marker(root)).toHaveCount(0);await page.locator('#redo-builder').click();await expect(marker(root)).toHaveCount(1);
 await root.locator('[data-dv-contract="legacy"] .cttitle>span').click({position:{x:5,y:5}});await guide.getByRole('button',{name:'Remove wire binding 1',exact:true}).click();await expect(marker(root)).toHaveCount(0);
});
