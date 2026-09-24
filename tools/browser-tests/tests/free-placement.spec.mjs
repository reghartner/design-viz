import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const example=JSON.parse(await readFile(path.join(repo,'examples/free-placement/free-placement.spec.json'),'utf8'));
const diagram=raw=>raw.page.blocks[0].diagram;
const node=(root,id)=>root.locator('g.node[data-dv-node="'+id+'"]');
const geometry=async(root,id)=>node(root,id).evaluate(n=>{const t=n.transform.baseVal.consolidate().matrix,c=n.querySelector('.card');return {x:t.e,y:t.f,w:Number(c.getAttribute('width')),h:Number(c.getAttribute('height'))};});
const source=page=>page.locator('#src').inputValue();
const raw=async page=>JSON.parse(await source(page));
async function startDrag(page,root,id,dx,dy){
 const card=node(root,id).locator('.card'),box=await card.boundingBox();
 const scale=await node(root,id).evaluate(n=>{const m=n.ownerSVGElement.getScreenCTM();return {x:m.a,y:m.d};});
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*scale.x,y+dy*scale.y,{steps:12});
}
async function checkPorts(root){
 for(const [index,from,to] of [[1,'gateway','identity'],[2,'identity','gateway'],[4,'recording','analytics']]){
  const e=diagram(example).edges[index],a=await geometry(root,from),b=await geometry(root,to);
  const point=(n,p)=>({x:p.side==='left'?n.x:p.side==='right'?n.x+n.w:n.x+n.w*p.offset,y:p.side==='top'?n.y:p.side==='bottom'?n.y+n.h:n.y+n.h*p.offset});
  const end=await root.locator('path.edge[data-dv-edge="'+index+'"]').evaluate(p=>{const a=p.getPointAtLength(0),b=p.getPointAtLength(p.getTotalLength());return {a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};});
  for(const axis of ['x','y']){expect(end.a[axis]).toBeCloseTo(point(a,e.fromPort)[axis],3);expect(end.b[axis]).toBeCloseTo(point(b,e.toPort)[axis],3);}
 }
}

test('free floats drag to exact diagram coordinates with edge previews and atomic Undo while rows stay fixed',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(example,null,2);await paste(page,original);
 const root=page.locator('#docview'),rowBefore=await Promise.all(['doorbell','gateway','recording'].map(id=>geometry(root,id)));
 await startDrag(page,root,'identity',-240,135);
 await expect(root.locator('.dv-ghost')).toBeVisible();await expect(root.locator('.dv-free-edge-preview')).toHaveCount(2);
 await expect(root.locator('.dv-droptgt,.dv-slotline,.dv-rowline')).toHaveCount(0);await page.mouse.up();
 let d=diagram(await raw(page));expect(d.floats[0].id).toBe('identity');expect(d.floats[0].side).toBe('above');expect(Math.abs(d.floats[0].x-350)).toBeLessThan(2);expect(Math.abs(d.floats[0].y-180)).toBeLessThan(2);expect(d.rows).toEqual(diagram(example).rows);
 expect(await Promise.all(['doorbell','gateway','recording'].map(id=>geometry(root,id)))).toEqual(rowBefore);
 expect(d.steps).toEqual(diagram(example).steps);expect(d.edges).toEqual(diagram(example).edges);
 await expect(root.locator('.dv-ghost,.dv-free-edge-preview,.dv-free-edge-source')).toHaveCount(0);
 const after=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await checkPorts(root);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
 // Readable sizing uses SVG coordinates, not CSS pixels.
 await root.getByRole('button',{name:'Readable',exact:true}).click();await node(root,'identity').scrollIntoViewIfNeeded();
 await startDrag(page,root,'identity',60,-40);await page.mouse.up();d=diagram(await raw(page));expect(Math.abs(d.floats[0].x-410)).toBeLessThan(2);expect(Math.abs(d.floats[0].y-140)).toBeLessThan(2);const shown=await geometry(root,'identity');expect(shown.x+shown.w/2).toBeCloseTo(d.floats[0].x,3);expect(shown.y+shown.h/2).toBeCloseTo(d.floats[0].y,3);
 await testInfo.attach('free-placement-workbench',{body:await root.screenshot(),contentType:'image/png'});
});

test('automatic floats become pinned on drag, with Escape, blur, stale source and builder disposal cancelling cleanly',async({page,server})=>{
 const initial=structuredClone(example);delete diagram(initial).floats[0].x;delete diagram(initial).floats[0].y;
 await page.goto(server.origin+'/lifetime/index.html');const original=JSON.stringify(initial);await paste(page,original);const root=page.locator('#docview');
 for(const cancel of [()=>page.keyboard.press('Escape'),()=>page.evaluate(()=>window.dispatchEvent(new Event('blur'))) ]){
  await startDrag(page,root,'identity',-180,75);await cancel();await page.mouse.up();await expect(page.locator('#src')).toHaveValue(original);await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
 }
 const before=await geometry(root,'identity');await startDrag(page,root,'identity',-180,75);await page.mouse.up();
 let f=diagram(await raw(page)).floats[0];expect(Math.abs(f.x-(before.x+before.w/2-180))).toBeLessThan(2);expect(Math.abs(f.y-(before.y+before.h/2+75))).toBeLessThan(2);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await startDrag(page,root,'identity',-160,80);const changed=original.replace('flexible service map','changed while dragging');
 await page.evaluate(value=>{const src=document.querySelector('#src');src.value=value;src.dispatchEvent(new Event('input',{bubbles:true}));},changed);await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(changed);await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
 await page.evaluate(()=>__editorTest.builder.loadSpec(JSON.parse(document.querySelector('#src').value)));const restored=await source(page);
 await startDrag(page,root,'identity',-160,80);await page.evaluate(()=>__editorTest.builder.destroy());await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(restored);await expect(root.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
});

test('inspector places nodes freely, restores row placement, and exposes independent edge sides and percentages',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(example));const root=page.locator('#docview'),guide=page.locator('#guide');
 await node(root,'gateway').click();await guide.getByRole('combobox',{name:'float',exact:true}).selectOption('free');
 expect(diagram(await raw(page)).rows).toEqual([['doorbell','recording']]);await expect(guide.getByLabel('Float X',{exact:true})).toBeVisible();
 await guide.getByLabel('Float X',{exact:true}).fill('-120');await guide.getByLabel('Float X',{exact:true}).press('Enter');
 expect(diagram(await raw(page)).floats.find(f=>f.id==='gateway').x).toBe(-120);
 let g=await geometry(root,'gateway');expect(g.x+g.w/2).toBe(-120);
 const vb=await node(root,'gateway').evaluate(n=>n.ownerSVGElement.getAttribute('viewBox'));expect(Number(vb.split(' ')[0])).toBeLessThan(-195);
 await guide.getByRole('combobox',{name:'float',exact:true}).selectOption('');expect(diagram(await raw(page)).rows).toEqual([['doorbell','recording'],['gateway']]);
 await root.locator('text.lbl[data-dv-edge="0"]').click();await guide.getByRole('combobox',{name:'Exit side',exact:true}).selectOption('left');
 await guide.getByLabel('Exit position (%)',{exact:true}).fill('25');await guide.getByLabel('Exit position (%)',{exact:true}).press('Enter');
 await guide.getByRole('combobox',{name:'Entry side',exact:true}).selectOption('bottom');await guide.getByLabel('Entry position (%)',{exact:true}).fill('75');await guide.getByLabel('Entry position (%)',{exact:true}).press('Enter');
 let e=diagram(await raw(page)).edges[0];expect(e.fromPort).toEqual({side:'left',offset:.25});expect(e.toPort).toEqual({side:'bottom',offset:.75});
 const before=await source(page);await guide.getByLabel('Entry position (%)',{exact:true}).fill('120');await guide.getByLabel('Entry position (%)',{exact:true}).press('Enter');await expect(page.locator('#src')).toHaveValue(before);
 await expect(guide).toContainText('between 0 and 100%');
 await guide.getByLabel('Entry position (%)',{exact:true}).fill('75');await guide.getByLabel('Entry position (%)',{exact:true}).press('Enter');
 await testInfo.attach('edge-port-inspector',{body:await guide.screenshot(),contentType:'image/png'});
 await guide.getByRole('combobox',{name:'Exit side',exact:true}).selectOption('');expect(diagram(await raw(page)).edges[0].fromPort).toBeUndefined();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
});

test('standalone, native Backstage and Forge preserve free node centers and exact manual ports',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'free.json'),JSON.stringify(example));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'free.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'free.html')]);
 async function verify(root){await checkPorts(root);const p=await geometry(root,'analytics');expect(p.x+p.w/2).toBe(1240);expect(p.y+p.h/2).toBe(330);}
 await page.goto(server.origin+'/free.html');await verify(page.locator('.docview'));await testInfo.attach('free-placement-standalone',{body:await page.locator('.docview').screenshot(),contentType:'image/png'});
 await writeFile(path.join(server.root,'free-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'free-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./free-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/free-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>window.viewer=mount(document.querySelector('#host'),raw),example);await verify(page.locator('#host'));
 await page.addInitScript(raw=>{window.__bridge={callBridge:async method=>{if(method==='getContext')return {siteUrl:'https://company.atlassian.net',extension:{config:{specJson:JSON.stringify(raw)},macro:{isConfiguring:false}}};return true;}};},example);
 await page.goto(server.origin+'/forge/index.html');await verify(page.locator('#docview'));
});
