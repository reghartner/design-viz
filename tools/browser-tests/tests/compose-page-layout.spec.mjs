// Browser use is a development oracle only. The production command cannot load
// this harness and has independent tests forbidding browser/child-process use.
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),A=require('../../compose-page-layout.cjs'),corpus=require('../../panel-placement/corpus.cjs'),{payload}=require('../helpers/arrangement-page.cjs');
const C=corpus.engine(),defaults={width:1200,profile:'default',rearrange:false};
const cases=['residential-3','ingestion-3','api-2','health-2','capacity-2','overview-3','experience-3'];
for(const id of cases)test('browser-free composition native development QA: '+id,async({page},info)=>{
 const scenario=corpus.scenarios().find(s=>s.id===id);await page.setViewportSize({width:scenario.host.width,height:1000});
 await page.setContent(payload());
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle='#edf4fb';x.fillRect(0,0,640,360);x.fillStyle='#234';x.font='24px sans-serif';x.fillText('Fictional field operations',30,55);return c.toDataURL();});
 const raw=corpus.specification(C,scenario,image),d=raw.page.sections[0].diagram;delete d.layouts;delete d.defaultLayout;d.rows=[[]];d.floats=Object.keys(d.nodes).map(id=>({id,side:'below'}));
 const before=JSON.stringify(raw),result=await A.arrange(raw,{...defaults,width:scenario.host.width}),output=result.raw.page.sections[0].diagram;
 expect(JSON.stringify(raw)).toBe(before);expect(output.panels).toEqual(d.panels);expect(output.steps).toEqual(d.steps);expect(result.diagnostics[0].measurement).toContain('estimates');
 const initial=await page.evaluate(async diagram=>arrangementNative.paint({diagram,skin:'pastel'}),output),observations=[];
 for(const state of initial.states)observations.push(await page.evaluate(s=>arrangementNative.observe(s),state));
 await fs.writeFile(info.outputPath('measurements.json'),JSON.stringify({estimates:result.diagnostics,observations},null,2));
 await page.screenshot({path:info.outputPath('composed.png'),fullPage:true});
 expect(observations.every(o=>o.panels.length===d.panels.length)).toBe(true);
 for(const o of observations){
  if(o.controls)expect(o.controls.clipped,'caption '+JSON.stringify(o.state)).toBe(0);
  if(o.graph){expect(o.graph.clipped,'graph '+JSON.stringify(o.state)).toBe(0);expect(o.graph.minimumLabelPx).toBeGreaterThanOrEqual(8);}
  for(const p of o.panels){expect(p.overflowX,p.id+' horizontal').toBeLessThanOrEqual(4);expect(p.overflowY,p.id+' body height').toBeLessThanOrEqual(4);}
 }
});
test('deep caption and path-local inherited evidence remain readable in the native renderer',async({page})=>{
 const d={nodes:{a:{title:'Client'},b:{title:'Store'}},rows:[[]],floats:[{id:'a',side:'below'},{id:'b',side:'below'}],edges:[{from:'a',to:'b'}],panels:[{id:'log',type:'log',initial:{log:[{text:'Initial evidence'}]}}],steps:[{id:'a',text:'Begin.',panels:{log:{log:[{text:'Step one'}]}}},{id:'long',text:'Confirm the evidence before continuing with the next operation. '.repeat(22),panels:{log:{log:[{text:'Detailed evidence '.repeat(15)}]}}},{id:'other',text:'Alternative.',panels:{log:{log:[{text:'Alternative outcome'}]}}}],paths:[{id:'normal',steps:['a','long']},{id:'alternative',steps:['a','other']}]};
 const result=await A.arrange(d,{...defaults,width:800});await page.setViewportSize({width:800,height:1000});await page.setContent(payload());
 const initial=await page.evaluate(diagram=>arrangementNative.paint({diagram,skin:'pastel'}),result.raw.page.sections[0].diagram);
 expect(initial.states).toHaveLength(5);
 for(const state of initial.states){const o=await page.evaluate(s=>arrangementNative.observe(s),state);if(o.controls)expect(o.controls.clipped).toBe(0);expect(o.panels[0].overflowY).toBeLessThanOrEqual(4);}
});

test('long visible URLs in a table fit in ambient and step states',async({page},info)=>{
 const value='https://example.com/'+'very-long-visible-path/'.repeat(80);
 const d={nodes:{a:{title:'Request'}},rows:[[]],floats:[{id:'a',side:'below'}],edges:[],panels:[{id:'evidence',type:'table',title:'Visible URL evidence',columns:[{id:'value',label:'Value'}],initial:{rows:[{id:'request',cells:{value}}]}}],steps:[{text:'Read the complete evidence.'}]};
 const result=await A.arrange(d,{...defaults,width:800});await page.setViewportSize({width:800,height:1000});await page.setContent(payload());
 const initial=await page.evaluate(diagram=>arrangementNative.paint({diagram,skin:'pastel'}),result.raw.page.sections[0].diagram),observations=[];
 for(const state of initial.states){
  const o=await page.evaluate(s=>arrangementNative.observe(s),state);observations.push(o);
  expect(o.panels[0].text).toContain(value);expect(o.panels[0].overflowY).toBeLessThanOrEqual(4);expect(o.panels[0].overflowX).toBeLessThanOrEqual(4);
 }
 await fs.writeFile(info.outputPath('measurements.json'),JSON.stringify({estimates:result.diagnostics,observations},null,2));
 await page.screenshot({path:info.outputPath('composed.png'),fullPage:true});
});
