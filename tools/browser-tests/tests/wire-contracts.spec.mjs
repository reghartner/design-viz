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

async function avoidsCanvasControls(root){
 const overlaps=await root.evaluate(el=>{
  const scope=el.shadowRoot || el,pop=scope.querySelector('.wire-contract-preview').getBoundingClientRect();
  return Array.from(scope.querySelectorAll('.explore-navigation,.diagram-views,.explore-tools,.explore-player')).map(control=>{
   const r=control.getBoundingClientRect();return {control:control.className,area:Math.max(0,Math.min(pop.right,r.right)-Math.max(pop.left,r.left))*Math.max(0,Math.min(pop.bottom,r.bottom)-Math.max(pop.top,r.top))};
  });
 });
 for(const overlap of overlaps)expect(overlap.area,overlap.control+' remains reachable').toBe(0);
}

async function nearMarkerOrAboveToolbar(page,root){
 const anchor=await marker(root).first().boundingBox(),card=await preview(root).boundingBox(),viewport=page.viewportSize();
 const gap=Math.hypot(Math.max(0,card.x-anchor.x-anchor.width,anchor.x-card.x-card.width),Math.max(0,card.y-anchor.y-anchor.height,anchor.y-card.y-card.height));
 if(gap<=12)return 'near-marker';
 // Rendered card and toolbar heights vary across hosts. A full-width
 // toolbar can leave too little room below it for the complete card: require
 // that measured constraint before accepting the above-toolbar fallback.
 const bars=await root.locator('.explore-navigation,.diagram-views,.explore-tools').evaluateAll(els=>els.map(el=>{
  const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
 }).filter(r=>r.width && r.height));
 expect(bars.length).toBeGreaterThan(0);
 const top=Math.min(...bars.map(r=>r.y)),bottom=Math.max(...bars.map(r=>r.y+r.height));
 expect(anchor.y,'toolbar separates fallback from wire').toBeGreaterThanOrEqual(bottom);
 expect(await preview(root).evaluate(el=>el.scrollHeight<=el.clientHeight+1),'complete card remains readable without cropping').toBe(true);
 expect(card.height,'whole card cannot fit below the toolbar').toBeGreaterThan(viewport.height-8-bottom);
 for(const bar of bars){
  expect(bar.x-8,'card cannot fit left of toolbar').toBeLessThan(card.width);
  expect(viewport.width-8-bar.x-bar.width,'card cannot fit right of toolbar').toBeLessThan(card.width);
 }
 expect(top-card.y-card.height,'fallback clears and hugs toolbar top').toBeGreaterThanOrEqual(0);
 expect(top-card.y-card.height,'fallback does not drift farther up the page').toBeLessThanOrEqual(6);
 const expectedLeft=Math.max(8,Math.min(viewport.width-card.width-8,anchor.x+anchor.width/2-card.width/2));
 expect(Math.abs(card.x-expectedLeft),'fallback stays aligned with its wire marker').toBeLessThanOrEqual(1);
 return 'above-toolbar';
}

for(const native of [false,true])test('Canvas wire contracts position and retire in '+(native?'native Backstage':'standalone'),async({page,server},testInfo)=>{
 await page.setViewportSize({width:1100,height:850});const root=await open(page,server,fixture(true),native);
 await expect(marker(root)).toHaveCount(3);await marker(root).first().hover();await preview(root).locator('.ctlink').first().hover();await expect(preview(root)).toBeVisible();
 await marker(root).first().click();await expect(preview(root)).toBeVisible();await geometry(page,preview(root));await avoidsCanvasControls(root);
 await nearMarkerOrAboveToolbar(page,root);
 await testInfo.attach('wire-contract-canvas-'+(native?'native':'standalone'),{body:await page.screenshot(),contentType:'image/png'});
 await page.setViewportSize({width:900,height:760});await geometry(page,preview(root));await avoidsCanvasControls(root);
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

test('native Canvas keeps the full preview above its toolbar when no adjacent card fits',async({page,server})=>{
 await page.setViewportSize({width:1100,height:780});const root=await open(page,server,fixture(true),true);
 // A native embed near the bottom of its host page leaves too little visible
 // canvas below its toolbar. Keep the wire visible by panning the real board.
 await page.evaluate(async()=>{
  document.body.style.overflow='hidden';document.querySelector('#host').style.marginTop='560px';
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const scope=document.querySelector('#host').shadowRoot,board=scope.querySelector('.board');
  board.scrollTop+=scope.querySelector('.wire-contract-marker').getBoundingClientRect().top-690;
 });
 await marker(root).first().hover();await preview(root).locator('.ctlink').first().hover();await expect(preview(root)).toBeVisible();
 await marker(root).first().click();await geometry(page,preview(root));await avoidsCanvasControls(root);
 expect(await nearMarkerOrAboveToolbar(page,root)).toBe('above-toolbar');
 await page.keyboard.press('Escape');await expect(preview(root)).toBeHidden();await expect(marker(root).first()).toBeFocused();
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});
