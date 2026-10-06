import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {createCapture} from '../../panel-placement/capture.mjs';
import {pixelRegionHash} from '../../panel-placement/pixel-check.mjs';
const require=createRequire(import.meta.url),corpus=require('../../panel-placement/corpus.cjs'),L=require('../../panel-placement/layouts.cjs');
test('full PNG pixels keep the origin header and bottom tiles across scrolled tall and short pairs',async()=>{
 const C=corpus.engine(),capture=await createCapture();
 try{
  for(const rows of [28,8]){
   const scenario={...corpus.scenarios().find(s=>s.id==='health-2'),id:'synthetic-pixel-origin-'+rows,host:{width:1000,profile:'default'}},source=corpus.specification(C,scenario,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII='),d=L.diagram(source);let pairHash;
   for(const label of ['A','B']){
    d.layouts[0].sectionLayout.default=[{x:0,y:0,w:24,h:3,hidden:true},...d.panels.map((p,i)=>({panel:p.id,x:0,y:i*rows,w:24,h:rows})),{controls:'steps',x:0,y:d.panels.length*rows,w:24,h:3}];
    if(label==='B')d.layouts[0].sectionLayout.default[1].w=23;
    const observed=await capture.paint(source,scenario);expect(observed.controls.reachableAfterScroll).toBeTruthy();
    const height=Math.ceil(await capture.page.locator('#capture').evaluate(e=>e.getBoundingClientRect().height));
    await capture.page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));expect(await capture.page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
    const png=await capture.fullScreenshot(1000,height);expect(png.readUInt32BE(20)).toBe(height);expect(height).toBeGreaterThan(1000);
    await capture.page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    const viewport=await capture.page.screenshot({clip:{x:0,y:0,width:1000,height:1000},animations:'disabled'}),hash=await pixelRegionHash(capture.page,png,1000);
    expect(hash).toBe(await pixelRegionHash(capture.page,viewport,1000));if(pairHash)expect(hash).toBe(pairHash);pairHash=hash;
    const bounds=await capture.page.locator('#view .doc-title').boundingBox();expect(bounds.y).toBeGreaterThan(0);expect(bounds.y+bounds.height).toBeLessThan(150);expect(await capture.page.evaluate(()=>window.scrollY)).toBe(0);
    const tiles=capture.page.locator('[data-layout-key]:visible');expect(await tiles.count()).toBeGreaterThanOrEqual(d.panels.length+1);const bottom=await tiles.evaluateAll(es=>Math.max(...es.map(e=>e.getBoundingClientRect().bottom)));expect(bottom).toBeLessThanOrEqual(height);
   }
  }
 }finally{await capture.browser.close();}
});
